# -*- coding: utf-8 -*-
"""
Step 2（英文）：训练 + 评估 fastText。

输入 models/data/{train,dev,test}.txt（由 prepare.py 生成）
输出 models/fasttext_en.bin、models/metrics.json

欺诈只占 4.84%，accuracy 会被"全判 legitimate"轻易刷到 95%，
所以选模型看 dev 的 PR-AUC 与欺诈 F1，不看 accuracy。
"""

from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

import fasttext

import paths as P

BATCH = 2048
DEFAULT_GRID = [
    dict(name="A_dim50", dim=50, epoch=25, lr=0.5, wordNgrams=2, bucket=200000, minCount=2),
    dict(name="B_dim100", dim=100, epoch=25, lr=0.3, wordNgrams=2, bucket=200000, minCount=2),
    dict(name="C_ngram3", dim=50, epoch=40, lr=0.5, wordNgrams=3, bucket=200000, minCount=1),
]


def load_ft(path: Path) -> tuple[list[str], list[int]]:
    texts, labels = [], []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line:
                continue
            head, _, body = line.partition(" ")
            labels.append(int(head.replace(P.LABEL_PREFIX, "")))
            texts.append(body)
    return texts, labels


def predict_proba(model, texts: list[str]) -> list[float]:
    out: list[float] = []
    for i in range(0, len(texts), BATCH):
        labels, probs = model.predict(texts[i:i + BATCH], k=2)
        for lab, p in zip(labels, probs):
            out.append(float(p[0]) if lab[0] == f"{P.LABEL_PREFIX}1" else float(p[1]))
    return out


def average_precision(y: list[int], p: list[float]) -> float:
    order = sorted(range(len(p)), key=lambda i: -p[i])
    tp = hits = 0
    for rank, i in enumerate(order, 1):
        if y[i] == 1:
            tp += 1
            hits += tp / rank
    return round(hits / max(sum(y), 1), 4)


def evaluate(model, texts: list[str], y: list[int], threshold: float = 0.5) -> dict:
    p = predict_proba(model, texts)
    pred = [1 if x >= threshold else 0 for x in p]
    tp = sum(1 for t, q in zip(y, pred) if t == 1 and q == 1)
    tn = sum(1 for t, q in zip(y, pred) if t == 0 and q == 0)
    fp = sum(1 for t, q in zip(y, pred) if t == 0 and q == 1)
    fn = sum(1 for t, q in zip(y, pred) if t == 1 and q == 0)

    def prf(tp_: int, fp_: int, fn_: int) -> tuple[float, float, float]:
        precision = tp_ / (tp_ + fp_) if tp_ + fp_ else 0.0
        recall = tp_ / (tp_ + fn_) if tp_ + fn_ else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        return round(precision, 4), round(recall, 4), round(f1, 4)

    p1, r1, f1_1 = prf(tp, fp, fn)
    p0, r0, f1_0 = prf(tn, fn, fp)
    n = len(y)
    return {
        "n": n,
        "accuracy": round((tp + tn) / n, 4),
        "macro_f1": round((f1_0 + f1_1) / 2, 4),
        "pr_auc": average_precision(y, p),
        "fraud": {"precision": p1, "recall": r1, "f1": f1_1, "support": tp + fn},
        "legit": {"precision": p0, "recall": r0, "f1": f1_0, "support": tn + fp},
        "confusion_matrix": {"tn": tn, "fp": fp, "fn": fn, "tp": tp},
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="训练英文 EMSCAD fastText 分类器")
    ap.add_argument("--data-dir", type=Path, default=P.FT_DATA_DIR)
    ap.add_argument("--model-dir", type=Path, default=P.MODEL_DIR)
    ap.add_argument("--single", action="store_true", help="只跑 A_dim50 一组，不做对比")
    ap.add_argument("--thread", type=int, default=os.cpu_count() or 4)
    ap.add_argument("--seed", type=int, default=20261021)
    args = ap.parse_args()

    train_path = args.data_dir / "train.txt"
    if not train_path.exists():
        raise FileNotFoundError(f"{train_path} 不存在，请先运行 prepare.py")

    dev_x, dev_y = load_ft(args.data_dir / "dev.txt")
    test_x, test_y = load_ft(args.data_dir / "test.txt")
    grid = DEFAULT_GRID[:1] if args.single else DEFAULT_GRID

    runs, best = [], None
    for cfg in grid:
        params = dict(cfg)
        params.pop("name")
        params.update(loss="softmax", ws=5, neg=5, thread=args.thread, verbose=0, seed=args.seed)
        t0 = time.perf_counter()
        model = fasttext.train_supervised(input=str(train_path), **params)
        seconds = round(time.perf_counter() - t0, 1)
        dev_m = evaluate(model, dev_x, dev_y)
        runs.append({"config": cfg, "train_seconds": seconds, "dev": dev_m})
        print(f"  {cfg['name']:<9s} dev PR-AUC={dev_m['pr_auc']:.4f} 欺诈F1={dev_m['fraud']['f1']:.4f} "
              f"acc={dev_m['accuracy']:.4f} ({seconds}s)")
        if best is None or dev_m["pr_auc"] > best[0]:
            best = (dev_m["pr_auc"], model, cfg)

    assert best is not None
    _, model, cfg = best
    test_m = evaluate(model, test_x, test_y)

    args.model_dir.mkdir(parents=True, exist_ok=True)
    model_path = args.model_dir / "fasttext_en.bin"
    model.save_model(str(model_path))

    report = {
        "model_file": model_path.name,
        "model_size_mb": round(model_path.stat().st_size / 1024 / 1024, 1),
        "selected_config": cfg,
        "selection": "按 dev PR-AUC 最高",
        "labels": {str(i): name for i, name in enumerate(P.LABEL_NAMES)},
        "dev": next(r["dev"] for r in runs if r["config"] == cfg),
        "test": test_m,
        "all_runs": runs,
        "data": {"train": len(load_ft(train_path)[1]), "dev": len(dev_y), "test": len(test_y)},
        "note": "EMSCAD 真实英文招聘广告，欺诈占比 4.84%；阈值 0.5 未针对先验调整",
    }
    metrics_path = args.model_dir / "metrics.json"
    metrics_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")

    print(f"\n最优 {cfg['name']}（dev PR-AUC 最高）")
    for name, m in (("dev", report["dev"]), ("test", test_m)):
        print(f"{name:4s} n={m['n']:5d} acc={m['accuracy']:.4f} macro-F1={m['macro_f1']:.4f} "
              f"PR-AUC={m['pr_auc']:.4f} 欺诈 P/R/F1={m['fraud']['precision']:.4f}/"
              f"{m['fraud']['recall']:.4f}/{m['fraud']['f1']:.4f}")
    print(f"混淆矩阵 test: {test_m['confusion_matrix']}")
    print(f"模型 {model_path}  {report['model_size_mb']} MB")
    print(f"指标 {metrics_path}")


if __name__ == "__main__":
    main()
