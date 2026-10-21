# -*- coding: utf-8 -*-
"""
XGBoost 训练（TF-IDF + 类别加权多分类）。

输入：randomforest/processing/{train,dev,test}.csv（由 data_processing.py 生成）
输出：randomforest/models/{rf_model.json, tfidf_vectorizer.pkl, train_log.json}

用法：
    python -X utf8 randomforest/train.py
    RF_DEVICE=cuda python -X utf8 randomforest/train.py     # 有 GPU 时
    RF_ROUNDS=150 python -X utf8 randomforest/train.py      # 控制树数
"""

from __future__ import annotations

import json
import pickle
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import accuracy_score, f1_score

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import config  # noqa: E402


def main() -> None:
    t0 = time.perf_counter()
    stop_words = [w for w in config.stopwords_txt.read_text(encoding="utf-8").splitlines() if w.strip()]

    train_df = pd.read_csv(config.processing_training_data_path, keep_default_na=False)
    dev_df = pd.read_csv(config.processing_dev_data_path, keep_default_na=False)
    print(f"train {len(train_df)} / dev {len(dev_df)}")

    tfidf = TfidfVectorizer(stop_words=stop_words, token_pattern=r"\S+")
    X_train = tfidf.fit_transform(train_df["words"].tolist())
    y_train = train_df["label"].astype(int).to_numpy()
    X_dev = tfidf.transform(dev_df["words"].tolist())
    y_dev = dev_df["label"].astype(int).to_numpy()
    print(f"TF-IDF: {X_train.shape[0]} × {X_train.shape[1]}，非零 {X_train.nnz:,}")

    num_class = len(tfidf.classes_) if hasattr(tfidf, "classes_") else int(max(y_train)) + 1
    num_class = int(max(y_train.max(), y_dev.max())) + 1

    params = {
        "objective": "multi:softprob",
        "num_class": num_class,
        "tree_method": "hist",
        "device": config.device,
        "max_depth": config.max_depth,
        "eta": config.eta,
        "subsample": config.subsample,
        "colsample_bytree": config.colsample_bytree,
        "nthread": -1,
        "eval_metric": "mlogloss",
        "seed": 42,
    }

    sample_w = None
    if config.balance:
        counts = np.bincount(y_train, minlength=num_class)
        sample_w = np.array([len(y_train) / (num_class * counts[c]) for c in y_train], dtype=np.float32)
        print("类别加权：", [round(float(len(y_train)) / (num_class * max(counts[c], 1)), 3) for c in range(num_class)])

    dtrain = xgb.DMatrix(X_train, label=y_train, weight=sample_w)
    ddev = xgb.DMatrix(X_dev, label=y_dev)

    rounds, chunk = config.num_boost_round, config.chunk
    bst, history = None, []
    for i in range(1, rounds // chunk + 1):
        bst = xgb.train(params, dtrain, num_boost_round=chunk, xgb_model=bst)
        prob = bst.predict(ddev)
        pred = np.argmax(prob, axis=1)
        acc = accuracy_score(y_dev, pred)
        f1m = f1_score(y_dev, pred, average="macro", zero_division=0)
        history.append({"round": i * chunk, "dev_acc": round(float(acc), 4), "dev_macro_f1": round(float(f1m), 4)})
        print(f"第 {i*chunk:3d} 棵树：dev acc={acc:.4f} macro-F1={f1m:.4f}", flush=True)

    config.model_dir.mkdir(parents=True, exist_ok=True)
    model_file = config.model_dir / "rf_model.json"
    vec_file = config.model_dir / "tfidf_vectorizer.pkl"
    bst.save_model(str(model_file))
    with vec_file.open("wb") as f:
        pickle.dump(tfidf, f)

    log = {
        "train_rows": int(len(train_df)), "dev_rows": int(len(dev_df)),
        "features": int(X_train.shape[1]), "num_class": num_class,
        "params": params, "balance": config.balance,
        "rounds": rounds, "history": history,
        "seconds": round(time.perf_counter() - t0, 1),
    }
    (config.model_dir / "train_log.json").write_text(
        json.dumps(log, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")

    print(f"\n训练完成 {log['seconds']}s，模型 {model_file.name}")
    print(f"最终 dev：acc={history[-1]['dev_acc']:.4f} macro-F1={history[-1]['dev_macro_f1']:.4f}")


if __name__ == "__main__":
    main()
