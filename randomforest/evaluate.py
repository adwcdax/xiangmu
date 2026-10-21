# -*- coding: utf-8 -*-
"""
评估：10 类混淆矩阵 + 逐类 P/R/F1 + 总体指标。

输出：randomforest/models/metrics.json、confusion_matrix.png
"""

from __future__ import annotations

import json
import pickle
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import (accuracy_score, classification_report, confusion_matrix,
                             f1_score, precision_score, recall_score)

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import config  # noqa: E402


def main() -> None:
    model_file = config.model_dir / "rf_model.json"
    vec_file = config.model_dir / "tfidf_vectorizer.pkl"
    if not model_file.exists():
        raise FileNotFoundError(f"先训练：{model_file}")

    bst = xgb.Booster()
    bst.load_model(str(model_file))
    with vec_file.open("rb") as f:
        tfidf = pickle.load(f)

    classes = [c.strip() for c in config.class_txt.read_text(encoding="utf-8").splitlines() if c.strip()]
    test_df = pd.read_csv(config.processing_testing_data_path, keep_default_na=False)
    X = tfidf.transform(test_df["words"].tolist())
    y = test_df["label"].astype(int).to_numpy()
    prob = bst.predict(xgb.DMatrix(X))
    pred = np.argmax(prob, axis=1)

    labels = list(range(len(classes)))
    report = classification_report(y, pred, labels=labels, target_names=classes,
                                   output_dict=True, zero_division=0)
    cm = confusion_matrix(y, pred, labels=labels)

    per_class = {c: {k: round(float(report[c][k]), 4) for k in ("precision", "recall", "f1-score", "support")}
                 for c in classes if c in report}
    metrics = {
        "model": "XGBoost + TF-IDF（10 类）",
        "test_rows": int(len(y)),
        "accuracy": round(float(accuracy_score(y, pred)), 4),
        "macro_f1": round(float(f1_score(y, pred, average="macro", zero_division=0)), 4),
        "weighted_f1": round(float(f1_score(y, pred, average="weighted", zero_division=0)), 4),
        "macro_precision": round(float(precision_score(y, pred, average="macro", zero_division=0)), 4),
        "macro_recall": round(float(recall_score(y, pred, average="macro", zero_division=0)), 4),
        "per_class": per_class,
        "confusion_matrix": cm.tolist(),
        "classes": classes,
    }

    # 欺诈二分类（塌回）
    benign = 0
    y_bin = (y != benign).astype(int)
    p_bin = (pred != benign).astype(int)
    metrics["collapsed_binary"] = {
        "accuracy": round(float(accuracy_score(y_bin, p_bin)), 4),
        "precision": round(float(precision_score(y_bin, p_bin, zero_division=0)), 4),
        "recall": round(float(recall_score(y_bin, p_bin, zero_division=0)), 4),
        "f1": round(float(f1_score(y_bin, p_bin, zero_division=0)), 4),
    }

    (config.model_dir / "metrics.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")

    fig, ax = plt.subplots(figsize=(8, 7))
    im = ax.imshow(cm, cmap="Blues")
    ax.set_xticks(range(len(classes)), labels=[str(i) for i in range(len(classes))])
    ax.set_yticks(range(len(classes)), labels=[str(i) for i in range(len(classes))])
    ax.set_xlabel("Predicted label id")
    ax.set_ylabel("True label id")
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            if cm[i, j]:
                ax.text(j, i, str(cm[i, j]), ha="center", va="center", fontsize=7,
                        color="white" if cm[i, j] > cm.max() / 2 else "black")
    fig.colorbar(im, ax=ax)
    fig.tight_layout()
    fig.savefig(config.model_dir / "confusion_matrix.png", dpi=140)
    plt.close(fig)

    print(f"test {len(y)} 条")
    print(f"acc={metrics['accuracy']:.4f} macro-F1={metrics['macro_f1']:.4f} weighted-F1={metrics['weighted_f1']:.4f}")
    print("\n逐类：")
    for c in classes:
        m = per_class.get(c)
        if m:
            print(f"  {c:<22s} P={m['precision']:.3f} R={m['recall']:.3f} F1={m['f1-score']:.3f} n={int(m['support'])}")
    print(f"\n指标 -> {config.model_dir / 'metrics.json'}")


if __name__ == "__main__":
    main()
