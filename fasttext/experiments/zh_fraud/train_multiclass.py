# -*- coding: utf-8 -*-
"""
中文电诈多分类（10 类：无风险 + 9 类诈骗手法）

数据：data_0/中文电诈语料_统一表.csv（352,836 条，sha256 与 data/raw_zh/manifest_raw.json 一致）
  字段：sample_id / modality / label_zh / label_slug / text / group / split / source
  已具备：组级切分（group 不跨 split）、零重复、10 类齐全

流程：TSV -> 逐字分词 -> fastText 监督多分类 -> 逐类 P/R/F1 + 混淆矩阵 + 塌回二分类对照

产物：models_zh/data/{train,dev,test}.txt、models_zh/fasttext_zh_fraud.bin、metrics.json
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import statistics
import time
from collections import Counter, defaultdict
from pathlib import Path

import fasttext

PROJECT = Path(__file__).resolve().parents[2]      # fasttext/
ROOT = PROJECT.parent                              # 仓库根目录
CSV_PATH = ROOT / "data_0" / "中文电诈语料_统一表.csv"
OUT_DIR = PROJECT / "models_zh"
WS = re.compile(r"\s+")
BENIGN = "无风险"


def load(path: Path) -> list[dict]:
    csv.field_size_limit(10 ** 7)
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        return [r for r in csv.DictReader(f) if (r.get("text") or "").strip()]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", type=Path, default=CSV_PATH)
    ap.add_argument("--out-dir", type=Path, default=OUT_DIR)
    ap.add_argument("--dim", type=int, default=50)
    ap.add_argument("--epoch", type=int, default=25)
    ap.add_argument("--lr", type=float, default=0.5)
    ap.add_argument("--word-ngrams", type=int, default=2)
    ap.add_argument("--bucket", type=int, default=200000)
    ap.add_argument("--min-count", type=int, default=2)
    ap.add_argument("--thread", type=int, default=os.cpu_count() or 4)
    args = ap.parse_args()

    rows = load(args.csv)
    counter = Counter(r["label_zh"] for r in rows)
    # 无风险固定 index 0，其余按样本量降序
    classes = [BENIGN] + [c for c, _ in counter.most_common() if c != BENIGN]
    cls_idx = {c: i for i, c in enumerate(classes)}
    print(f"{len(rows)} 条，{len(classes)} 类：")
    for c in classes:
        print(f"  [{cls_idx[c]}] {c:<22s} {counter[c]:7d} ({counter[c]/len(rows):5.1%})")

    data_dir = args.out_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    stats = defaultdict(dict)
    for split in ("train", "dev", "test"):
        part = [r for r in rows if r["split"] == split]
        path = data_dir / f"{split}.txt"
        with path.open("w", encoding="utf-8", newline="\n") as f:
            for r in part:
                text = WS.sub(" ", r["text"]).strip().replace(" ", "")
                f.write(f"__label__{cls_idx[r['label_zh']]} {' '.join(text)}\n")
        stats[split] = {"rows": len(part),
                        "class_counts": {c: sum(1 for r in part if r["label_zh"] == c) for c in classes}}
        print(f"{split:5s} {len(part):6d} -> {path}")

    def load_ft(path: Path):
        xs, ys = [], []
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line:
                continue
            head, _, body = line.partition(" ")
            ys.append(int(head.replace("__label__", "")))
            xs.append(body)
        return xs, ys

    tr_x, tr_y = load_ft(data_dir / "train.txt")
    dv_x, dv_y = load_ft(data_dir / "dev.txt")
    te_x, te_y = load_ft(data_dir / "test.txt")

    print(f"\n训练 {len(tr_x)} 条，dim={args.dim} epoch={args.epoch} lr={args.lr} ng={args.word_ngrams}")
    t0 = time.perf_counter()
    model = fasttext.train_supervised(
        input=str(data_dir / "train.txt"), dim=args.dim, epoch=args.epoch, lr=args.lr,
        wordNgrams=args.word_ngrams, bucket=args.bucket, minCount=args.min_count,
        loss="softmax", ws=5, neg=5, thread=args.thread, verbose=0, seed=20261021)
    seconds = round(time.perf_counter() - t0, 1)

    def evaluate(xs: list[str], ys: list[int]) -> dict:
        pred: list[int] = []
        for i in range(0, len(xs), 4096):
            lab, _ = model.predict(xs[i:i + 4096], k=1)
            pred.extend(int(l[0].replace("__label__", "")) for l in lab)
        per, f1s, sup = {}, [], []
        for i, c in enumerate(classes):
            tp = sum(1 for t, p in zip(ys, pred) if t == i and p == i)
            fp = sum(1 for t, p in zip(ys, pred) if t != i and p == i)
            fn = sum(1 for t, p in zip(ys, pred) if t == i and p != i)
            pr = tp / (tp + fp) if tp + fp else 0.0
            rc = tp / (tp + fn) if tp + fn else 0.0
            f1 = 2 * pr * rc / (pr + rc) if pr + rc else 0.0
            per[c] = {"precision": round(pr, 4), "recall": round(rc, 4), "f1": round(f1, 4),
                      "support": tp + fn}
            if tp + fn:
                f1s.append(f1)
                sup.append(tp + fn)
        conf = {classes[t]: dict(Counter(classes[p] for tt, p in zip(ys, pred) if tt == t).most_common(3))
                for t in range(len(classes)) if any(tt == t for tt in ys)}
        # 塌回二分类：诈骗 vs 无风险
        b_t = [1 if t != 0 else 0 for t in ys]
        b_p = [1 if p != 0 else 0 for p in pred]
        tp = sum(1 for a, b in zip(b_t, b_p) if a and b)
        fp = sum(1 for a, b in zip(b_t, b_p) if not a and b)
        fn = sum(1 for a, b in zip(b_t, b_p) if a and not b)
        tn = sum(1 for a, b in zip(b_t, b_p) if not a and not b)
        f1p = 2 * tp / (2 * tp + fp + fn) if tp else 0.0
        f1n = 2 * tn / (2 * tn + fn + fp) if tn else 0.0
        macro_w = sum(f * s for f, s in zip(f1s, sup)) / sum(sup) if sup else 0.0
        return {"n": len(ys), "accuracy": round(sum(1 for a, b in zip(ys, pred) if a == b) / len(ys), 4),
                "macro_f1": round(sum(f1s) / len(f1s), 4) if f1s else 0.0,
                "weighted_f1": round(macro_w, 4),
                "per_class": per, "top_confusions": conf,
                "collapsed_binary": {"accuracy": round((tp + tn) / len(ys), 4),
                                     "fraud_f1": round(f1p, 4), "macro_f1": round((f1p + f1n) / 2, 4)}}

    dev_m, test_m = evaluate(dv_x, dv_y), evaluate(te_x, te_y)

    model_path = args.out_dir / "fasttext_zh_fraud.bin"
    model.save_model(str(model_path))
    report = {
        "task": "中文电诈案件分类（10 类：无风险 + 9 类手法）",
        "source": "data_0/中文电诈语料_统一表.csv（sha256 710da892…，与 raw_zh manifest 一致）",
        "classes": classes, "rows": len(rows), "split_stats": stats,
        "params": {"dim": args.dim, "epoch": args.epoch, "lr": args.lr,
                   "wordNgrams": args.word_ngrams, "bucket": args.bucket, "minCount": args.min_count},
        "train_seconds": seconds,
        "model_size_mb": round(model_path.stat().st_size / 1024 / 1024, 1),
        "dev": dev_m, "test": test_m,
        "note": "语料为合成/半合成电诈样本；group 不跨切分，零重复",
    }
    (args.out_dir / "metrics.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")

    print(f"训练 {seconds}s，模型 {report['model_size_mb']} MB")
    for name, m in (("dev", dev_m), ("test", test_m)):
        print(f"{name:4s} acc={m['accuracy']:.4f} macro-F1={m['macro_f1']:.4f} "
              f"weighted-F1={m['weighted_f1']:.4f} | 塌回二分类 acc={m['collapsed_binary']['accuracy']:.4f} "
              f"欺诈F1={m['collapsed_binary']['fraud_f1']:.4f}")
    print("\ntest 逐类：")
    for c in classes:
        m = test_m["per_class"][c]
        print(f"  {c:<22s} P={m['precision']:.3f} R={m['recall']:.3f} F1={m['f1']:.3f} n={m['support']}")
    print(f"\n模型 {model_path}\n指标 {args.out_dir / 'metrics.json'}")


if __name__ == "__main__":
    main()
