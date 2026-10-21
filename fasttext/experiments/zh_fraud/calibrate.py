# -*- coding: utf-8 -*-
"""
针对两个问题的实测修复：

问题1（98% 不可信）：拿真实 58 同城正常岗位帖当"域外难负样本"，测误报率。
问题2（概率饱和）：在 dev 上做 isotonic 校准，再看 test 的 ECE / Brier / Top-K 区分度。

输入：models_zh/fasttext_zh_fraud.bin、models_zh/data/{dev,test}.txt、
      data/中文虚假招聘_标注7392条.csv（真实岗位帖，取 label=0 作难负样本）
输出：models_zh/calibration_report.json
"""

from __future__ import annotations

import csv
import json
import re
import statistics
from pathlib import Path

import fasttext
import numpy as np
from sklearn.isotonic import IsotonicRegression

PROJECT = Path(__file__).resolve().parents[2]      # fasttext/
ROOT = PROJECT.parent                              # 仓库根目录
MODEL = PROJECT / "models_zh" / "fasttext_zh_fraud.bin"
DATA = PROJECT / "models_zh" / "data"
REAL_ZC = ROOT / "data" / "中文虚假招聘_标注7392条.csv"
LABEL_PREFIX = "__label__"
WS = re.compile(r"\s+")


def load_ft(path: Path):
    xs, ys = [], []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line:
            h, _, b = line.partition(" ")
            ys.append(int(h.replace(LABEL_PREFIX, "")))
            xs.append(b)
    return xs, ys


def p_fraud(model, xs, n_classes):
    out = []
    for i in range(0, len(xs), 4096):
        labs, probs = model.predict(xs[i:i + 4096], k=n_classes)
        for lab, pr in zip(labs, probs):
            p0 = sum(float(p) for l, p in zip(lab, pr) if l == f"{LABEL_PREFIX}0")
            out.append(1.0 - p0)
    return np.array(out, dtype=float)


def ece(y, p, bins=10):
    edges = np.linspace(0, 1, bins + 1)
    total = 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (p >= lo) & (p < hi if hi < 1 else p <= hi)
        if m.sum():
            total += m.mean() * abs(p[m].mean() - y[m].mean())
    return round(float(total), 4)


def brier(y, p):
    return round(float(np.mean((p - y) ** 2)), 4)


def ap(y, p):
    order = np.argsort(-p)
    yy = y[order]
    tp = np.cumsum(yy)
    prec = tp / np.arange(1, len(yy) + 1)
    return round(float((prec * yy).sum() / max(yy.sum(), 1)), 4)


def topk(y, p, ks):
    order = np.argsort(-p)
    return {f"top{k}": {"precision": round(float(y[order[:k]].mean()), 4),
                        "recall": round(float(y[order[:k]].sum() / max(y.sum(), 1)), 4)} for k in ks}


def main() -> None:
    model = fasttext.load_model(str(MODEL))
    classes = json.loads((PROJECT / "models_zh" / "metrics.json").read_text(encoding="utf-8"))["classes"]
    n = len(classes)

    dv_x, dv_y = load_ft(DATA / "dev.txt")
    te_x, te_y = load_ft(DATA / "test.txt")
    dv_b = (np.array(dv_y) != 0).astype(float)
    te_b = (np.array(te_y) != 0).astype(float)

    dv_p = p_fraud(model, dv_x, n)
    te_p = p_fraud(model, te_x, n)

    iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
    iso.fit(dv_p, dv_b)
    te_c = iso.predict(te_p)

    report = {
        "test_rows": int(len(te_b)),
        "positives": int(te_b.sum()),
        "before": {"ece": ece(te_b, te_p), "brier": brier(te_b, te_p), "pr_auc": ap(te_b, te_p),
                   "mean_p_on_pos": round(float(te_p[te_b == 1].mean()), 4),
                   "mean_p_on_neg": round(float(te_p[te_b == 0].mean()), 4),
                   **topk(te_b, te_p, [100, 500, 2000])},
        "after_isotonic": {"ece": ece(te_b, te_c), "brier": brier(te_b, te_c), "pr_auc": ap(te_b, te_c),
                           "mean_p_on_pos": round(float(te_c[te_b == 1].mean()), 4),
                           "mean_p_on_neg": round(float(te_c[te_b == 0].mean()), 4),
                           **topk(te_b, te_c, [100, 500, 2000])},
        "deciles_before": {
            f"{i/10:.1f}-{(i+1)/10:.1f}": {
                "n": int(((te_p >= i / 10) & (te_p < (i + 1) / 10)).sum()),
                "actual_fraud_rate": round(float(te_b[(te_p >= i / 10) & (te_p < (i + 1) / 10)].mean()), 3)
                if ((te_p >= i / 10) & (te_p < (i + 1) / 10)).sum() else None}
            for i in range(10)},
    }

    # 真实难负样本：58 同城正常岗位帖（与训练域无关，且很多含"兼职/日结"等高危词）
    neg_texts = []
    with REAL_ZC.open("r", encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            if int(r["label"]) == 0:
                neg_texts.append(" ".join(WS.sub(" ", r["text"]).replace(" ", "")))
    neg_p = p_fraud(model, neg_texts, n)
    neg_c = iso.predict(neg_p)
    report["hard_negatives_real_job_posts"] = {
        "n": len(neg_texts),
        "mean_p_raw": round(float(neg_p.mean()), 4),
        "mean_p_calibrated": round(float(neg_c.mean()), 4),
        "share_ge_0.5_raw": round(float((neg_p >= 0.5).mean()), 4),
        "share_ge_0.9_raw": round(float((neg_p >= 0.9).mean()), 4),
        "share_ge_0.5_calibrated": round(float((neg_c >= 0.5).mean()), 4),
        "note": "真实 58 同城正常岗位帖，与电诈语料不同域，用作误报压力测试",
    }

    (PROJECT / "models_zh" / "calibration_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")

    b, a = report["before"], report["after_isotonic"]
    print(f"test {len(te_b)} 条（诈骗 {int(te_b.sum())}）")
    print(f"  校准前: ECE={b['ece']} Brier={b['brier']} PR-AUC={b['pr_auc']} "
          f"p(正)={b['mean_p_on_pos']} p(负)={b['mean_p_on_neg']}")
    print(f"  校准后: ECE={a['ece']} Brier={a['brier']} PR-AUC={a['pr_auc']} "
          f"p(正)={a['mean_p_on_pos']} p(负)={a['mean_p_on_neg']}")
    print(f"  Top-K 校准前/后: 100 → {b['top100']['precision']}/{a['top100']['precision']}，"
          f"500 → {b['top500']['precision']}/{a['top500']['precision']}")
    print("\n  分数分箱（校准前）实际诈骗率：")
    for k, v in report["deciles_before"].items():
        if v["n"]:
            print(f"    {k}: n={v['n']:6d} 实际={v['actual_fraud_rate']}")
    h = report["hard_negatives_real_job_posts"]
    print(f"\n真实岗位帖难负样本 n={h['n']}：原始均值 {h['mean_p_raw']}，"
          f"≥0.5 占 {h['share_ge_0.5_raw']:.1%}，≥0.9 占 {h['share_ge_0.9_raw']:.1%}")
    print(f"  校准后 ≥0.5 占 {h['share_ge_0.5_calibrated']:.1%}")


if __name__ == "__main__":
    main()
