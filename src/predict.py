# -*- coding: utf-8 -*-
"""
推理（英文）：加载 models/fasttext_en.bin，对原始英文文本预测。

预处理与训练一致：HTML 实体还原、空白归一、转小写。
"""

from __future__ import annotations

import argparse
import html
import re
from pathlib import Path

import fasttext

import paths as P

WS_RE = re.compile(r"\s+")


def normalize(text: str) -> str:
    return WS_RE.sub(" ", html.unescape(text)).strip().lower()


def main() -> None:
    ap = argparse.ArgumentParser(description="英文招聘广告欺诈预测")
    ap.add_argument("--model", type=Path, default=P.MODEL_DIR / "fasttext_en.bin")
    ap.add_argument("--text", default=None)
    ap.add_argument("--file", type=Path, default=None, help="每行一条文本")
    args = ap.parse_args()

    if not args.model.exists():
        raise FileNotFoundError(f"找不到模型 {args.model}，请先运行 train.py")
    model = fasttext.load_model(str(args.model))

    if args.file:
        lines = [ln.strip() for ln in args.file.read_text(encoding="utf-8").splitlines() if ln.strip()]
    elif args.text:
        lines = [args.text]
    else:
        lines = ["Work from home, earn $3000 per week. No experience needed. "
                 "Send your bank details and a $50 registration fee to start today!"]

    for text in lines:
        labels, probs = model.predict(normalize(text), k=2)
        pairs = sorted(zip(labels, probs), key=lambda x: -x[1])
        detail = "  ".join(f"{P.label_name(lab)}={float(p):.4f}" for lab, p in pairs)
        print(f"[{P.label_name(pairs[0][0])}] {detail}")


if __name__ == "__main__":
    main()
