# -*- coding: utf-8 -*-
"""
中文电诈识别 API（BERT 微调，10 类多分类 + 是否诈骗）。

与 fasttext/api_zh、randomforest/api.py 保持同一套 legacy 契约，前端可无缝切换。

启动：
  python -X utf8 bert/api.py                    # 默认 8000
  PORT=8100 python -X utf8 bert/api.py

环境变量：
  MODEL_DIR   模型目录，默认 bert/model
  PORT        监听端口，默认 8000
  THRESHOLD   p_fraud 判定阈值，默认 0.5
  DEVICE      cuda / cpu，默认自动

接口：
  GET  /health    健康检查（前端据此识别模型名）
  GET  /labels    类别表
  POST /predict   {"text": "..."} 或 {"items": [{"text": "..."}, ...]}
  GET  /          浏览器测试页
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import torch
import uvicorn
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from transformers import AutoModelForSequenceClassification, AutoTokenizer

BASE = Path(__file__).resolve().parent
MODEL_DIR = Path(os.getenv("MODEL_DIR", BASE / "model"))
THRESHOLD = float(os.getenv("THRESHOLD", "0.5"))
MAX_LEN = int(os.getenv("MAX_LEN", "192"))
DEVICE = os.getenv("DEVICE") or ("cuda" if torch.cuda.is_available() else "cpu")
STARTED = time.time()

if not (MODEL_DIR / "config.json").exists():
    raise SystemExit(
        f"模型目录缺少 config.json：{MODEL_DIR}\n"
        "权重体积大，不入库。请先按 bert/README.md 的「准备模型」一节导出，"
        "或用 MODEL_DIR 指向已有模型目录。"
    )

_tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR, local_files_only=True)
_model = AutoModelForSequenceClassification.from_pretrained(
    MODEL_DIR, local_files_only=True).to(DEVICE).eval()
CLASSES = [(_model.config.id2label[i]) for i in range(_model.config.num_labels)]

app = FastAPI(title="中文电诈识别 API (BERT)", version="1.0")


class Item(BaseModel):
    text: str = Field(..., description="待判定文本（短信/对话/案情描述）")


class Payload(BaseModel):
    text: str | None = None
    top_k: int = 3
    items: list[Item] | None = None


@torch.no_grad()
def predict_batch(texts: list[str]) -> list[list[float]]:
    """批量推理，返回每条的 10 类概率（与训练同一套 tokenizer 与截断长度）"""
    enc = _tokenizer(texts, add_special_tokens=True, truncation=True,
                     max_length=MAX_LEN, padding=True, return_tensors="pt")
    logits = _model(input_ids=enc["input_ids"].to(DEVICE),
                    attention_mask=enc["attention_mask"].to(DEVICE)).logits
    return torch.softmax(logits.float(), dim=1).cpu().tolist()


def to_result(probs: list[float], text: str, top_k: int = 3) -> dict:
    pairs = sorted(zip(CLASSES, probs), key=lambda x: -x[1])
    p_fraud = max(0.0, min(1.0, 1.0 - probs[0]))     # 夹住浮点误差，避免 -0.0
    warnings = []
    if len(text.strip()) < 30:
        warnings.append("文本较短（<30 字）：训练语料中位长度 121 字，短文本判定不可靠")
    return {
        "label": pairs[0][0],
        "label_id": CLASSES.index(pairs[0][0]),
        "is_fraud": p_fraud >= THRESHOLD,
        "p_fraud": round(p_fraud, 4),
        "threshold": THRESHOLD,
        "top_k": [{"label": name, "prob": round(p, 4)} for name, p in pairs[:max(1, top_k)]],
        "warnings": warnings,
    }


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "model": "bert_zh_fraud",          # 前端按此名识别模型；含 bert 关键字
        "chain": "bert",
        "classes": len(CLASSES),
        "threshold": THRESHOLD,
        "device": DEVICE,
        "max_len": MAX_LEN,
        "uptime_s": round(time.time() - STARTED, 1),
        "version": "1.0",
    }


@app.get("/labels")
def labels() -> dict:
    return {"labels": [{"id": i, "name": c, "is_fraud": i != 0} for i, c in enumerate(CLASSES)]}


@app.get("/metrics")
def metrics() -> dict:
    """评估指标；文件不存在时返回空对象，前端会退回默认值"""
    """评估指标：优先全量 test 口径；文件不存在时返回空对象，前端退回默认值"""
    for name in ("metrics_full_test.json", "metrics_sampled12k.json"):
        path = BASE / "model" / name
        if path.exists():
            data = json.loads(path.read_text(encoding="utf-8"))
            return {"model": "bert_zh_fraud", "source": name,
                    "dev": data.get("dev"), "test": data.get("test")}
    return {"model": "bert_zh_fraud", "detail": "指标文件未随仓库提供"}


@app.post("/predict")
def predict(payload: Payload) -> dict:
    if payload.items:
        texts = [i.text for i in payload.items]
        probs = predict_batch(texts)
        return {"count": len(texts),
                "results": [to_result(p, t, payload.top_k) for p, t in zip(probs, texts)]}
    if not payload.text:
        return {"error": "请提供 text 或 items"}
    return to_result(predict_batch([payload.text])[0], payload.text, payload.top_k)


@app.get("/", response_class=HTMLResponse)
def index() -> str:
    return """<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>中文电诈识别 API · BERT</title>
<style>
 body{font-family:system-ui,-apple-system,"PingFang SC",sans-serif;max-width:780px;margin:40px auto;padding:0 16px;color:#222}
 textarea{width:100%;height:120px;padding:10px;font-size:14px;border:1px solid #ccc;border-radius:8px}
 button{margin-top:10px;padding:8px 18px;font-size:14px;border:1px solid #ccc;border-radius:8px;background:#fff;cursor:pointer}
 pre{background:#f6f6f4;padding:12px;border-radius:8px;overflow:auto;font-size:13px}
 .hint{color:#666;font-size:13px}
</style></head><body>
<h2 style="font-weight:500">中文电诈识别 API · BERT</h2>
<p class="hint">POST /predict &nbsp;·&nbsp; GET /health &nbsp;·&nbsp; GET /labels &nbsp;·&nbsp; GET /metrics</p>
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
