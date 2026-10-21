# -*- coding: utf-8 -*-
"""
命令行推理：单条文本或文件批量。

    python -X utf8 randomforest/predict.py --text "您的快递丢失，请加客服理赔"
    python -X utf8 randomforest/predict.py --file some.txt
"""

from __future__ import annotations

import argparse
import pickle
import sys
from pathlib import Path

import numpy as np
import xgboost as xgb

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import config  # noqa: E402
import jieba  # noqa: E402


def load():
    bst = xgb.Booster()
    bst.load_model(str(config.model_dir / "rf_model.json"))
    with (config.model_dir / "tfidf_vectorizer.pkl").open("rb") as f:
        tfidf = pickle.load(f)
    classes = [c.strip() for c in config.class_txt.read_text(encoding="utf-8").splitlines() if c.strip()]
    return bst, tfidf, classes


def predict(texts: list[str]) -> list[dict]:
    bst, tfidf, classes = load()
    words = [" ".join(t for t in jieba.cut(t) if t.strip()) for t in texts]
    prob = bst.predict(xgb.DMatrix(tfidf.transform(words)))
    out = []
    for p in prob:
        i = int(np.argmax(p))
        out.append({"label": classes[i], "prob": round(float(p[i]), 4),
                    "p_fraud": round(float(1 - p[0]), 4)})
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", default=None)
    ap.add_argument("--file", type=Path, default=None)
    args = ap.parse_args()

    if args.text:
        texts = [args.text]
    elif args.file:
        texts = [line.strip() for line in args.file.read_text(encoding="utf-8").splitlines() if line.strip()]
    else:
        raise SystemExit("请提供 --text 或 --file")

    for text, res in zip(texts, predict(texts)):
        print(f"{res['label']:<22s} p={res['prob']:.4f} p_fraud={res['p_fraud']:.4f} | {text[:40]}")


if __name__ == "__main__":
    main()
