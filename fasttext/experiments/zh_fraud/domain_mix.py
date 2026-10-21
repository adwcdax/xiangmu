# -*- coding: utf-8 -*-
"""
方案验证：把真实正常文本混进训练负例，看域外误报能压下去多少、电诈召回牺牲多少。

对照：
  A 基线（只有电诈语料里的"构造型无风险"）
  B 混入 58 同城真实正常岗位帖（6,958 条，作为"真实正常文本"的代表）

评估两个集合：
  1. 电诈 test（53,281）：宏观 F1、二分类召回
  2. 58 同城正常帖（6,958）：误报率（FP rate）—— 域外压力测试

产物：models_zh/fasttext_zh_fraud_dom.bin、models_zh/domain_mix_report.json
"""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path

import fasttext
import numpy as np

PROJECT = Path(__file__).resolve().parents[2]      # fasttext/
ROOT = PROJECT.parent                              # 仓库根目录
DATA = PROJECT / "models_zh" / "data"
REAL_ZC = ROOT / "data" / "中文虚假招聘_标注7392条.csv"
WS = re.compile(r"\s+")
LP = "__label__"


def load_ft(path: Path):
    xs, ys = [], []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line:
            h, _, b = line.partition(" ")
            ys.append(int(h.replace(LP, "")))
            xs.append(b)
    return xs, ys


def tok(t: str) -> str:
    return " ".join(WS.sub(" ", t).strip().replace(" ", ""))


def p_fraud(model, xs, n_classes):
    out = []
    for i in range(0, len(xs), 4096):
        labs, probs = model.predict(xs[i:i + 4096], k=n_classes)
        for lab, pr in zip(labs, probs):
            p0 = sum(float(p) for l, p in zip(lab, pr) if l == f"{LP}0")
            out.append(1.0 - p0)
    return np.array(out)


def main() -> None:
    classes = json.loads((PROJECT / "models_zh" / "metrics.json").read_text(encoding="utf-8"))["classes"]
    n = len(classes)
    te_x, te_y = load_ft(DATA / "test.txt")
    te_b = (np.array(te_y) != 0).astype(float)

    # 真实负样本（58 同城正常岗位帖）
    negs = []
    with REAL_ZC.open("r", encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            if int(r["label"]) == 0:
                negs.append(tok(r["text"]))
    # 关键：真实负样本必须切出独立测试集，否则在自己训练过的样本上测误报恒为 0
    import random
    random.Random(7).shuffle(negs)
    cut = int(len(negs) * 0.7)
    negs_train, negs_eval = negs[:cut], negs[cut:]

    train_lines = (DATA / "train.txt").read_text(encoding="utf-8").splitlines()
    base = PROJECT / "models_zh" / "_mix_base.txt"
    base.write_text("\n".join(train_lines) + "\n", encoding="utf-8")

    mixed = PROJECT / "models_zh" / "_mix_with_real.txt"
    with mixed.open("w", encoding="utf-8", newline="\n") as f:
        for line in train_lines:
            f.write(line + "\n")
        # 真实正常帖重复 3 次，让它们在 28 万条里占约 6.6%，与真实场景的"正常"占比更接近
        for _ in range(3):
            for t in negs_train:
                f.write(f"{LP}0 {t}\n")

    report = {"classes": classes, "real_negative_train": len(negs_train),
              "real_negative_heldout": len(negs_eval)}
    for name, path in (("A_baseline", base), ("B_with_real_negs", mixed)):
        model = fasttext.train_supervised(
            input=str(path), dim=50, epoch=25, lr=0.5, wordNgrams=2, bucket=200000,
            minCount=2, loss="softmax", ws=5, neg=5, thread=32, verbose=0, seed=20261021)

        # 电诈 test 上的宏观 F1
        pred = []
        for i in range(0, len(te_x), 4096):
            lab, _ = model.predict(te_x[i:i + 4096], k=1)
            pred.extend(int(l[0].replace(LP, "")) for l in lab)
        f1s = []
        for i, c in enumerate(classes):
            tp = sum(1 for p, y in zip(pred, te_y) if y == i and p == i)
            fp = sum(1 for p, y in zip(pred, te_y) if y != i and p == i)
            fn = sum(1 for p, y in zip(pred, te_y) if y == i and p != i)
            pr = tp / (tp + fp) if tp + fp else 0.0
            rc = tp / (tp + fn) if tp + fn else 0.0
            if tp + fn:
                f1s.append(2 * pr * rc / (pr + rc) if pr + rc else 0.0)

        te_p = p_fraud(model, te_x, n)
        neg_p = p_fraud(model, negs_eval, n)
        report[name] = {
            "macro_f1": round(float(np.mean(f1s)), 4),
            "fraud_recall_at_0.5": round(float((te_p[te_b == 1] >= 0.5).mean()), 4),
            "fraud_precision_at_0.5": round(float(te_b[te_p >= 0.5].mean()), 4),
            "real_neg_fp_rate_at_0.5": round(float((neg_p >= 0.5).mean()), 4),
            "real_neg_fp_rate_at_0.9": round(float((neg_p >= 0.9).mean()), 4),
            "real_neg_mean_p": round(float(neg_p.mean()), 4),
        }
        print(f"[{name:18s}] macro-F1={report[name]['macro_f1']:.4f} "
              f"电诈召回={report[name]['fraud_recall_at_0.5']:.3f} "
              f"电诈精度={report[name]['fraud_precision_at_0.5']:.3f} | "
              f"真实正常帖误报率 @0.5={report[name]['real_neg_fp_rate_at_0.5']:.1%} "
              f"@0.9={report[name]['real_neg_fp_rate_at_0.9']:.1%}")
        if name == "B_with_real_negs":
            model.save_model(str(PROJECT / "models_zh" / "fasttext_zh_fraud_dom.bin"))

    base.unlink(missing_ok=True)
    mixed.unlink(missing_ok=True)
    (PROJECT / "models_zh" / "domain_mix_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
