# -*- coding: utf-8 -*-
"""
随机森林（XGBoost）链路在线服务。

启动：python -X utf8 randomforest/api.py            # 默认 8000，读 PORT
接口：
  GET  /health
  GET  /labels
  POST /predict   {"text": "..."} 或 {"items": [...]}
"""

from __future__ import annotations

import os
import pickle
import re
import sys
from pathlib import Path

import numpy as np
import uvicorn
import xgboost as xgb
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE))
from config import config  # noqa: E402
import jieba  # noqa: E402

CLASSES = [c.strip() for c in config.class_txt.read_text(encoding="utf-8").splitlines() if c.strip()]
THRESHOLD = float(os.getenv("THRESHOLD", "0.5"))
WS = re.compile(r"\s+")

_bst = xgb.Booster()
_bst.load_model(str(config.model_dir / "rf_model.json"))
with (config.model_dir / "tfidf_vectorizer.pkl").open("rb") as f:
    _tfidf = pickle.load(f)

app = FastAPI(title="中文电诈识别 API（随机森林）", version="1.0")


class Item(BaseModel):
    text: str = Field(..., description="待判定文本")


class Payload(BaseModel):
    text: str | None = None
    top_k: int = 3
    items: list[Item] | None = None


def tokenize_zh(text: str) -> str:
    return " ".join(t for t in jieba.cut(WS.sub(" ", text).strip()) if t.strip())


def predict_one(text: str, top_k: int = 3) -> dict:
    vec = _tfidf.transform([tokenize_zh(text)])
    prob = _bst.predict(xgb.DMatrix(vec))[0]
    order = np.argsort(-prob)
    p_benign = float(prob[0])
    p_fraud = max(0.0, min(1.0, 1.0 - p_benign))
    warnings = []
    label_id = int(order[0])
    if len(text.strip()) < 30:
        warnings.append("文本较短（<30 字）：训练语料中位长度 121 字，短文本判定不可靠")
    # 类别加权会让多类概率之和偏大，判定以 argmax 为准；p_fraud 仅作参考分
    is_fraud = label_id != 0
    if is_fraud != (p_fraud >= THRESHOLD):
        warnings.append("p_fraud 与类别判定不一致（类别加权所致），以 label 为准")
    return {
        "label": CLASSES[label_id],
        "label_id": label_id,
        "is_fraud": is_fraud,
        "p_fraud": round(p_fraud, 4),
        "threshold": THRESHOLD,
        "top_k": [{"label": CLASSES[int(i)], "prob": round(float(prob[i]), 4)} for i in order[:max(1, top_k)]],
        "warnings": warnings,
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model": "rf_model.json", "classes": len(CLASSES), "threshold": THRESHOLD}


@app.get("/labels")
def labels() -> dict:
    return {"labels": [{"id": i, "name": c} for i, c in enumerate(CLASSES)]}


@app.post("/predict")
def predict(payload: Payload) -> dict:
    if payload.items:
        return {"count": len(payload.items), "results": [predict_one(i.text, payload.top_k) for i in payload.items]}
    if not payload.text:
        return {"error": "请提供 text 或 items"}
    return predict_one(payload.text, payload.top_k)


@app.get("/", response_class=HTMLResponse)
def index() -> str:
    return """<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>中文电诈识别（随机森林）</title>
<style>body{font-family:system-ui,"PingFang SC",sans-serif;max-width:760px;margin:40px auto;padding:0 16px}
textarea{width:100%;height:120px;padding:10px;border:1px solid #ccc;border-radius:8px;font-size:14px}
button{margin-top:10px;padding:8px 18px;border:1px solid #ccc;border-radius:8px;background:#fff;cursor:pointer}
pre{background:#f6f6f4;padding:12px;border-radius:8px;overflow:auto;font-size:13px}</style></head><body>
<h2 style="font-weight:500">中文电诈识别 API（随机森林）</h2>
<textarea id="t">您的快递丢失，请加客服微信理赔，需先缴纳保证金。</textarea>
<button onclick="run()">识别</button><pre id="o">等待请求…</pre>
<script>async function run(){const o=document.getElementById('o');o.textContent='识别中…';
const r=await fetch('/predict',{method:'POST',headers:{'Content-Type':'application/json'},
body:JSON.stringify({text:document.getElementById('t').value,top_k:3})});
o.textContent=JSON.stringify(await r.json(),null,2);}</script></body></html>"""


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
