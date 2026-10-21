# -*- coding: utf-8 -*-
"""
随机森林（XGBoost）链路配置：路径唯一来源指向 data/zh_data_process。

与 fastText 链路共用同一份数据集，标签顺序以数据集自带 class.txt 为准（0=无风险）。
"""

from __future__ import annotations

import os
from pathlib import Path


class Config:
    # 目录层级：.../fasttext/randomforest/config.py
    PROJECT_DIR = Path(__file__).resolve().parent          # randomforest/
    ROOT_DIR = PROJECT_DIR.parent                          # 仓库根目录（fasttext/）

    # 数据（与 fastText 共用）
    data_dir = ROOT_DIR / "data" / "zh_data_process"
    train_txt = data_dir / "train.txt"
    dev_txt = data_dir / "dev.txt"
    test_txt = data_dir / "test.txt"
    class_txt = data_dir / "class.txt"
    stopwords_txt = data_dir / "stopwords.txt"

    # 中间产物（jieba 分词后的 CSV）
    processing_dir = PROJECT_DIR / "processing"
    processing_training_data_path = processing_dir / "train.csv"
    processing_dev_data_path = processing_dir / "dev.csv"
    processing_testing_data_path = processing_dir / "test.csv"

    # 模型产物
    model_dir = PROJECT_DIR / "models"
    model_path = str(model_dir) + os.sep
    vectorizer_path = str(model_dir / "tfidf_vectorizer.pkl")

    # 训练超参
    num_boost_round = int(os.getenv("RF_ROUNDS", "300"))
    chunk = int(os.getenv("RF_CHUNK", "30"))
    max_depth = 6
    eta = 0.3
    subsample = 0.8
    colsample_bytree = 0.3
    device = os.getenv("RF_DEVICE", "cpu")     # cpu / cuda
    balance = True                              # 类别加权，缓解长尾


config = Config()


if __name__ == "__main__":
    for k, v in Config.__dict__.items():
        if not k.startswith("_"):
            print(f"{k:32s} {v}")
