# -*- coding: utf-8 -*-
"""
验证"单模型覆盖双域"是否可行：电诈语料 + 58 同城招聘帖，各配正负样本，加域标签 token。

对照：
  A 电诈单域模型（models_zh/fasttext_zh_fraud.bin）在两个域上的区分度
  C 双域联合模型：文本前缀 d_zhafraud / d_zhaopin，二分类（诈骗/正常）

评估用**阈值无关的 PR-AUC**，避免被域先验（各域正例率不同）误导。

产物：models_zh/fasttext_zh_2domain.bin、models_zh/two_domain_report.json
"""

from __future__ import annotations

import csv
import json
import random
import re
from pathlib import Path

import fasttext
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "models_zh" / "data"
REAL = ROOT / "data" / "中文虚假招聘_标注7392条.csv"
WS = re.compile(r"\s+")
LP = "__label__"


def tok(t: str) -> str:
    return " ".join(WS.sub(" ", t).strip().replace(" ", ""))


def ap(y, p) -> float:
    order = np.argsort(-p)
    yy = np.asarray(y)[order]
    tp = np.cumsum(yy)
    prec = tp / np.arange(1, len(yy) + 1)
    return round(float((prec * yy).sum() / max(yy.sum(), 1)), 4)


def main() -> None:
    # ---- 58 同城：按公司+文本哈希分组切 70/30，避免同模板泄漏 ----
    rows = []
    with REAL.open("r", encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            rows.append({"text": tok(r["text"]), "label": int(r["label"]),
                         "co": (r.get("Company_ID") or "").strip() or "-"})
    rng = random.Random(20261021)
    by_co: dict[str, list[int]] = {}
    for i, r in enumerate(rows):
        by_co.setdefault(r["co"], []).append(i)
    groups = list(by_co.values())
    rng.shuffle(groups)
    cut = int(len(groups) * 0.7)
    zc_tr = [i for g in groups[:cut] for i in g]
    zc_te = [i for g in groups[cut:] for i in g]
    print(f"58 同城：train {len(zc_tr)}（欺诈 {sum(rows[i]['label'] for i in zc_tr)}）"
          f" / test {len(zc_te)}（欺诈 {sum(rows[i]['label'] for i in zc_te)}）")

    # ---- 联合训练集 ----
    path = ROOT / "models_zh" / "_2dom_train.txt"
    with path.open("w", encoding="utf-8", newline="\n") as f:
        for line in (DATA / "train.txt").read_text(encoding="utf-8").splitlines():
            if not line:
                continue
            h, _, b = line.partition(" ")
            y = 1 if int(h.replace(LP, "")) != 0 else 0
            f.write(f"{LP}{y} d_zhafraud {b}\n")
        for i in zc_tr:
            f.write(f"{LP}{rows[i]['label']} d_zhaopin {rows[i]['text']}\n")

    model = fasttext.train_supervised(
        input=str(path), dim=50, epoch=25, lr=0.5, wordNgrams=2, bucket=200000,
        minCount=2, loss="softmax", ws=5, neg=5, thread=32, verbose=0, seed=20261021)
    path.unlink(missing_ok=True)
    model.save_model(str(ROOT / "models_zh" / "fasttext_zh_2domain.bin"))

    def score(xs, prefix=""):
        out = []
        for i in range(0, len(xs), 4096):
            labs, prs = model.predict([f"{prefix}{x}" for x in xs[i:i + 4096]], k=2)
            for lab, pr in zip(labs, prs):
                out.append(float(pr[0]) if lab[0] == f"{LP}1" else float(pr[1]))
        return np.array(out)

    # ---- 电诈 test ----
    te_x, te_y = [], []
    for line in (DATA / "test.txt").read_text(encoding="utf-8").splitlines():
        if line:
            h, _, b = line.partition(" ")
            te_y.append(1 if int(h.replace(LP, "")) != 0 else 0)
            te_x.append(b)
    p_zh = score(te_x, "d_zhafraud ")

    # ---- 58 test ----
    zc_x = [rows[i]["text"] for i in zc_te]
    zc_y = [rows[i]["label"] for i in zc_te]
    p_zc = score(zc_x, "d_zhaopin ")

    # ---- A 基线（单域模型）在 58 上的表现 ----
    base = fasttext.load_model(str(ROOT / "models_zh" / "fasttext_zh_fraud.bin"))
    pb = []
    for i in range(0, len(zc_x), 4096):
        labs, prs = base.predict(zc_x[i:i + 4096], k=10)
        for lab, pr in zip(labs, prs):
            p0 = sum(float(p) for l, p in zip(lab, pr) if l == f"{LP}0")
            pb.append(1 - p0)
    pb = np.array(pb)

    report = {
        "C_two_domain": {
            "zh_fraud_pr_auc": ap(te_y, p_zh), "zh_fraud_rows": len(te_y),
            "zhaopin_pr_auc": ap(zc_y, p_zc), "zhaopin_rows": len(zc_y),
            "zhaopin_positives": int(sum(zc_y)),
        },
        "A_single_domain_on_zhaopin": {"pr_auc": ap(zc_y, pb), "rows": len(zc_y)},
        "note": "PR-AUC 阈值无关；58 同城正例仅 %d 条，指标波动大" % sum(zc_y),
    }
    (ROOT / "models_zh" / "two_domain_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")

    c = report["C_two_domain"]
    print(f"\n联合模型：电诈域 PR-AUC={c['zh_fraud_pr_auc']}（n={c['zh_fraud_rows']}）")
    print(f"联合模型：招聘域 PR-AUC={c['zhaopin_pr_auc']}（n={c['zhaopin_rows']}，欺诈 {c['zhaopin_positives']}）")
    print(f"单域基线：招聘域 PR-AUC={report['A_single_domain_on_zhaopin']['pr_auc']}")


if __name__ == "__main__":
    main()
