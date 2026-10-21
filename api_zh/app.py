# -*- coding: utf-8 -*-
"""
中文电诈识别 API（10 类多分类 + 是否诈骗）。

启动：python app.py       （读 PORT，默认 8000，绑定 0.0.0.0）
接口：
  GET  /health
  GET  /labels
  POST /predict   {"text": "...", "top_k": 3}
  POST /predict   {"items": [{"text": "..."}, ...]}
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

import fasttext
import uvicorn
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

BASE = Path(__file__).resolve().parent
MODEL_PATH = BASE / "model" / "fasttext_zh_fraud.bin"
CLASSES = json.loads((BASE / "labels.json").read_text(encoding="utf-8"))["classes"]
THRESHOLD = float(os.getenv("THRESHOLD", "0.5"))     # p_fraud 判定阈值
LP = "__label__"
WS = re.compile(r"\s+")

app = FastAPI(title="中文电诈识别 API", version="1.0")
_model = fasttext.load_model(str(MODEL_PATH))


class Item(BaseModel):
    text: str = Field(..., description="待判定文本（短信/对话/案情描述）")


class Payload(BaseModel):
    text: str | None = None
    top_k: int = 3
    items: list[Item] | None = None


def tokenize(text: str) -> str:
    """与训练一致：逐字加空格"""
    return " ".join(WS.sub(" ", text).strip().replace(" ", ""))


def predict_one(text: str, top_k: int = 3) -> dict:
    labels, probs = _model.predict([tokenize(text)], k=len(CLASSES))
    pairs = [(CLASSES[int(l.replace(LP, ""))], float(p)) for l, p in zip(labels[0], probs[0])]
    pairs.sort(key=lambda x: -x[1])
    p_benign = next(p for name, p in pairs if name == CLASSES[0])
    p_fraud = 1.0 - p_benign
    return {
        "label": pairs[0][0],
        "label_id": CLASSES.index(pairs[0][0]),
        "is_fraud": p_fraud >= THRESHOLD,
        "p_fraud": round(p_fraud, 4),
        "threshold": THRESHOLD,
        "top_k": [{"label": name, "prob": round(p, 4)} for name, p in pairs[:max(1, top_k)]],
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model": MODEL_PATH.name, "classes": len(CLASSES), "threshold": THRESHOLD}


@app.get("/labels")
def labels() -> dict:
    return {"labels": [{"id": i, "name": c} for i, c in enumerate(CLASSES)]}


@app.post("/predict")
def predict(payload: Payload) -> dict:
    if payload.items:
        return {"count": len(payload.items),
                "results": [predict_one(i.text, payload.top_k) for i in payload.items]}
    if not payload.text:
        return {"error": "请提供 text 或 items"}
    return predict_one(payload.text, payload.top_k)


@app.get("/", response_class=HTMLResponse)
def index() -> str:
    return """<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>中文电诈识别 API</title>
<style>
 body{font-family:system-ui,-apple-system,"PingFang SC",sans-serif;max-width:780px;margin:40px auto;padding:0 16px;color:#222}
 textarea{width:100%;height:120px;padding:10px;font-size:14px;border:1px solid #ccc;border-radius:8px}
 button{margin-top:10px;padding:8px 18px;font-size:14px;border:1px solid #ccc;border-radius:8px;background:#fff;cursor:pointer}
 pre{background:#f6f6f4;padding:12px;border-radius:8px;overflow:auto;font-size:13px}
 .hint{color:#666;font-size:13px}
</style></head><body>
<h2 style="font-weight:500">中文电诈识别 API</h2>
<p class="hint">POST /predict &nbsp;·&nbsp; GET /health &nbsp;·&nbsp; GET /labels</p>
<textarea id="t">您好，我是XX客服，您的账户存在异常，请下载我们的APP并缴纳保证金以解除冻结，否则将影响征信。</textarea>
<button onclick="run()">识别</button>
<pre id="o">等待请求…</pre>
<script>
async function run(){
  const o=document.getElementById('o'); o.textContent='识别中…';
  const r=await fetch('/predict',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({text:document.getElementById('t').value,top_k:3})});
  o.textContent=JSON.stringify(await r.json(),null,2);
}
</script></body></html>"""


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
