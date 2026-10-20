# -*- coding: utf-8 -*-
"""
英文数据集（data/data_process，EMSCAD）的路径配置。

与中文那套一样：路径唯一的来源是数据集自带的 config.py，不另存副本。
Config 里是 "./train.txt" 这类相对路径，统一按数据集目录解析成绝对路径。
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "data_process"
MODEL_DIR = ROOT / "models"
FT_DATA_DIR = MODEL_DIR / "data"

_spec = importlib.util.spec_from_file_location("en_dataset_config", DATA_DIR / "config.py")
if _spec is None or _spec.loader is None:
    raise ImportError(f"读不到数据集配置：{DATA_DIR / 'config.py'}")
_dataset = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_dataset)
Config = _dataset.Config


def resolve(path_str: str) -> Path:
    p = Path(path_str)
    return p if p.is_absolute() else (DATA_DIR / p).resolve()


TRAIN_FILE = resolve(Config.train_data_path)
DEV_FILE = resolve(Config.dev_data_path)
TEST_FILE = resolve(Config.test_data_path)
LABEL_FILE = resolve(Config.label_data_path)
STOPWORDS_FILE = resolve(Config.stopwords_data_path)

LABEL_PREFIX = "__label__"
# class.txt 行号即标签：0=legitimate, 1=fraudulent
LABEL_NAMES = [ln.strip() for ln in LABEL_FILE.read_text(encoding="utf-8").splitlines() if ln.strip()]


def label_name(label: str) -> str:
    idx = int(label.replace(LABEL_PREFIX, ""))
    return LABEL_NAMES[idx] if 0 <= idx < len(LABEL_NAMES) else str(idx)


if __name__ == "__main__":
    print("数据集目录:", DATA_DIR)
    for name in ("TRAIN_FILE", "DEV_FILE", "TEST_FILE", "LABEL_FILE", "STOPWORDS_FILE"):
        print(f"  {name:14s} {globals()[name]}")
    print("标签:", LABEL_NAMES)
