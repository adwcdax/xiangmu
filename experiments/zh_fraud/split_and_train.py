# -*- coding: utf-8 -*-
"""
电诈多分类：自己重新切分 train/val/test，再训练。

切分规则（两件事同时保证）：
  1. 按 `group`（case:xxxxx）整组切，同一案件派生出来的样本不跨集，避免泄漏
  2. 按"案件类型"分层：每个 group 的类别取组内诈骗样本的 label_zh（同组常有一条诈骗+一条无风险），
     保证 9 类诈骗在三集里的比例一致

对照：同一份数据用原始 `split` 列训练的结果（models_zh/metrics.json）。

产物：models_zh/data_resplit/{train,dev,test}.txt、fasttext_zh_fraud_resplit.bin、metrics_resplit.json
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import random
import re
import time
from collections import Counter, defaultdict
from pathlib import Path

import fasttext

ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = ROOT / "data_0" / "中文电诈语料_统一表.csv"
OUT_DIR = ROOT / "models_zh"
WS = re.compile(r"\s+")
BENIGN = "无风险"


def load(path: Path) -> list[dict]:
    csv.field_size_limit(10 ** 7)
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        return [r for r in csv.DictReader(f) if (r.get("text") or "").strip()]


def split_rows(rows: list[dict], ratios=(0.8, 0.1, 0.1), seed: int = 20261021) -> dict[str, list[int]]:
    groups: dict[str, list[int]] = defaultdict(list)
    for i, r in enumerate(rows):
        groups[r.get("group") or r["sample_id"]].append(i)

    # 组类别 = 组内第一条诈骗样本的类别；全是无风险则为无风险
    g2c: dict[str, str] = {}
    for g, idx in groups.items():
        labels = [rows[i]["label_zh"] for i in idx]
        fraud = [c for c in labels if c != BENIGN]
        g2c[g] = Counter(fraud).most_common(1)[0][0] if fraud else BENIGN

    by_class: dict[str, list[str]] = defaultdict(list)
    for g, c in g2c.items():
        by_class[c].append(g)

    rng = random.Random(seed)
    assign: dict[str, list[int]] = {"train": [], "dev": [], "test": []}
    # 按"样本数"配额贪心：每个类别独立分配，先把大组放进配额缺口最大的一集
    for c, gs in by_class.items():
        gs = gs[:]
        rng.shuffle(gs)
        gs.sort(key=lambda g: len(groups[g]), reverse=True)
        total = sum(len(groups[g]) for g in gs)
        quota = {"train": total * ratios[0], "dev": total * ratios[1], "test": total * ratios[2]}
        filled = {"train": 0, "dev": 0, "test": 0}
        for g in gs:
            n = len(groups[g])
            target = max(("train", "dev", "test"),
                         key=lambda k: (quota[k] - filled[k]) / max(quota[k], 1))
            assign[target].extend(groups[g])
            filled[target] += n
    return assign


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", type=Path, default=CSV_PATH)
    ap.add_argument("--out-dir", type=Path, default=OUT_DIR)
    ap.add_argument("--ratios", default="0.8,0.1,0.1")
    ap.add_argument("--seed", type=int, default=20261021)
    ap.add_argument("--dim", type=int, default=50)
    ap.add_argument("--epoch", type=int, default=25)
    ap.add_argument("--lr", type=float, default=0.5)
    ap.add_argument("--word-ngrams", type=int, default=2)
    ap.add_argument("--bucket", type=int, default=200000)
    ap.add_argument("--thread", type=int, default=os.cpu_count() or 4)
    args = ap.parse_args()

    ratios = tuple(float(x) for x in args.ratios.split(","))
    rows = load(args.csv)
    cnt = Counter(r["label_zh"] for r in rows)
    classes = [BENIGN] + [c for c, _ in cnt.most_common() if c != BENIGN]
    idx_of = {c: i for i, c in enumerate(classes)}
    print(f"{len(rows)} 条，{len(classes)} 类，重切比例 {ratios}")

    assign = split_rows(rows, ratios, args.seed)
    data_dir = args.out_dir / "data_resplit"
    data_dir.mkdir(parents=True, exist_ok=True)
    stats = {}
    for split in ("train", "dev", "test"):
        idx = assign[split]
        path = data_dir / f"{split}.txt"
        with path.open("w", encoding="utf-8", newline="\n") as f:
            for i in idx:
                text = WS.sub(" ", rows[i]["text"]).strip().replace(" ", "")
                f.write(f"__label__{idx_of[rows[i]['label_zh']]} {' '.join(text)}\n")
        c = Counter(rows[i]["label_zh"] for i in idx)
        stats[split] = {"rows": len(idx), "class_counts": dict(c)}
        print(f"{split:5s} {len(idx):6d} 条  " + "  ".join(f"{k}:{v}" for k, v in c.most_common(4)) + " …")

    def load_ft(p: Path):
        xs, ys = [], []
        for line in p.read_text(encoding="utf-8").splitlines():
            if line:
                h, _, b = line.partition(" ")
                ys.append(int(h.replace("__label__", "")))
                xs.append(b)
        return xs, ys

    dv_x, dv_y = load_ft(data_dir / "dev.txt")
    te_x, te_y = load_ft(data_dir / "test.txt")

    t0 = time.perf_counter()
    model = fasttext.train_supervised(
        input=str(data_dir / "train.txt"), dim=args.dim, epoch=args.epoch, lr=args.lr,
        wordNgrams=args.word_ngrams, bucket=args.bucket, minCount=2, loss="softmax",
        ws=5, neg=5, thread=args.thread, verbose=0, seed=20261021)
    seconds = round(time.perf_counter() - t0, 1)

    def evaluate(xs, ys, k=2):
        preds = []
        for i in range(0, len(xs), 4096):
            lab, _ = model.predict(xs[i:i + 4096], k=k)
            preds.extend([[int(l.replace("__label__", "")) for l in row] for row in lab])
        top1 = sum(1 for p, y in zip(preds, ys) if p[0] == y)
        topk = sum(1 for p, y in zip(preds, ys) if y in p)
        per, f1s, sup = {}, [], []
        for i, c in enumerate(classes):
            tp = sum(1 for p, y in zip(preds, ys) if y == i and p[0] == i)
            fp = sum(1 for p, y in zip(preds, ys) if y != i and p[0] == i)
            fn = sum(1 for p, y in zip(preds, ys) if y == i and p[0] != i)
            pr = tp / (tp + fp) if tp + fp else 0.0
            rc = tp / (tp + fn) if tp + fn else 0.0
            f1 = 2 * pr * rc / (pr + rc) if pr + rc else 0.0
            per[c] = {"precision": round(pr, 4), "recall": round(rc, 4), "f1": round(f1, 4), "support": tp + fn}
            if tp + fn:
                f1s.append(f1); sup.append(tp + fn)
        b_t = [1 if y != 0 else 0 for y in ys]
        b_p = [1 if p[0] != 0 else 0 for p in preds]
        tp = sum(1 for a, b in zip(b_t, b_p) if a and b); fp = sum(1 for a, b in zip(b_t, b_p) if not a and b)
        fn = sum(1 for a, b in zip(b_t, b_p) if a and not b); tn = sum(1 for a, b in zip(b_t, b_p) if not a and not b)
        f1p = 2 * tp / (2 * tp + fp + fn) if tp else 0.0
        conf = {classes[t]: dict(Counter(classes[p[0]] for p, y in zip(preds, ys) if y == t).most_common(2))
                for t in range(len(classes)) if any(y == t for y in ys)}
        return {"n": len(ys), "accuracy": round(top1 / len(ys), 4), "top2_accuracy": round(topk / len(ys), 4),
                "macro_f1": round(sum(f1s) / len(f1s), 4),
                "weighted_f1": round(sum(f * s for f, s in zip(f1s, sup)) / sum(sup), 4),
                "per_class": per, "confusions": conf,
                "collapsed_binary": {"accuracy": round((tp + tn) / len(ys), 4), "fraud_f1": round(f1p, 4)}}

    dv_m, te_m = evaluate(dv_x, dv_y), evaluate(te_x, te_y)
    model_path = args.out_dir / "fasttext_zh_fraud_resplit.bin"
    model.save_model(str(model_path))

    report = {"task": "电诈多分类（重新切分）", "classes": classes, "rows": len(rows),
              "ratios": ratios, "seed": args.seed, "split_stats": stats,
              "params": {"dim": args.dim, "epoch": args.epoch, "lr": args.lr,
                         "wordNgrams": args.word_ngrams, "bucket": args.bucket},
              "train_seconds": seconds,
              "model_size_mb": round(model_path.stat().st_size / 1024 / 1024, 1),
              "dev": dv_m, "test": te_m}
    (args.out_dir / "metrics_resplit.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")

    print(f"\n训练 {seconds}s，模型 {report['model_size_mb']} MB")
    for name, m in (("dev", dv_m), ("test", te_m)):
        print(f"{name:4s} acc={m['accuracy']:.4f} top2={m['top2_accuracy']:.4f} "
              f"macro-F1={m['macro_f1']:.4f} weighted={m['weighted_f1']:.4f} "
              f"| 二分类 acc={m['collapsed_binary']['accuracy']:.4f} 欺诈F1={m['collapsed_binary']['fraud_f1']:.4f}")
    print("\ntest 逐类：")
    for c in classes:
        m = te_m["per_class"][c]
        print(f"  {c:<22s} P={m['precision']:.3f} R={m['recall']:.3f} F1={m['f1']:.3f} n={m['support']}")


if __name__ == "__main__":
    main()
