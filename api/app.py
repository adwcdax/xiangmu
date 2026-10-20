# -*- coding: utf-8 -*-
"""
招聘欺诈检测 API（fastText + 结构化字段）。

启动：python app.py        （读 PORT 环境变量，默认 8000，绑定 0.0.0.0）
接口：
  GET  /health
  POST /predict   {"text": "...", "fields": {...}}
  POST /predict   {"items": [{"text": "...", "fields": {...}}, ...]}
  GET  /          极简测试页
"""

from __future__ import annotations

import os
from pathlib import Path

import fasttext
import uvicorn
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from features import to_model_input

BASE = Path(__file__).resolve().parent
MODEL_PATH = BASE / "model" / "fasttext_en_feat_os3.bin"
THRESHOLD = float(os.getenv("THRESHOLD", "0.09"))
LABEL_PREFIX = "__label__"
LABELS = {"0": "legitimate", "1": "fraudulent"}

app = FastAPI(title="Job Scam Detection API", version="1.0")
_model = fasttext.load_model(str(MODEL_PATH))


class Item(BaseModel):
    text: str = Field(..., description="岗位描述正文")
    fields: dict | None = Field(default=None, description="结构化字段，可选")


class Payload(BaseModel):
    text: str | None = None
    fields: dict | None = None
    items: list[Item] | None = None


def score_one(text: str, fields: dict | None) -> dict:
    model_input, tokens = to_model_input(text, fields)
    labels, probs = _model.predict([model_input], k=2)
    pairs = list(zip(labels[0], [float(p) for p in probs[0]]))
    p_fraud = next(p for lab, p in pairs if lab == f"{LABEL_PREFIX}1")
    top = max(pairs, key=lambda x: x[1])
    return {
        "label": LABELS.get(top[0].replace(LABEL_PREFIX, ""), top[0]),
        "p_fraud": round(p_fraud, 4),
        "flagged": p_fraud >= THRESHOLD,
        "threshold": THRESHOLD,
        "feature_tokens": tokens,
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model": MODEL_PATH.name, "threshold": THRESHOLD}


@app.post("/predict")
def predict(payload: Payload) -> dict:
    if payload.items:
        return {"results": [score_one(i.text, i.fields) for i in payload.items],
                "count": len(payload.items)}
    if not payload.text:
        return {"error": "请提供 text 或 items"}
    return score_one(payload.text, payload.fields)


@app.get("/", response_class=HTMLResponse)
def index() -> str:
    return """<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>招聘欺诈检测 API</title>
<style>
 body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;max-width:760px;margin:40px auto;padding:0 16px;color:#222}
 textarea{width:100%;height:140px;padding:10px;font-size:14px;border:1px solid #ccc;border-radius:8px}
 button{margin-top:10px;padding:8px 18px;font-size:14px;border:1px solid #ccc;border-radius:8px;background:#fff;cursor:pointer}
 pre{background:#f6f6f4;padding:12px;border-radius:8px;overflow:auto}
 .row{display:flex;gap:16px;font-size:13px;color:#666;margin-top:8px}
</style></head><body>
<h2 style="font-weight:500">招聘欺诈检测 API</h2>
<p style="color:#666;font-size:13px">POST /predict &nbsp;·&nbsp; GET /health</p>
<textarea id="t">Work from home and earn $3000 per week. No experience needed. Send a $50 registration fee and your bank details to start immediately!</textarea>
<button onclick="run()">预测</button>
<pre id="o">等待请求…</pre>
<script>
async function run(){
  const o=document.getElementById('o'); o.textContent='请求中…';
  const r=await fetch('/predict',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({text:document.getElementById('t').value,
      fields:{has_company_logo:0,company_profile:'',salary_range:''}})});
  o.textContent=JSON.stringify(await r.json(),null,2);
}
</script></body></html>"""


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
