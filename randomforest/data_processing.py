# -*- coding: utf-8 -*-
"""
数据预处理：data/zh_data_process/{train,dev,test}.txt -> jieba 分词 -> processing/*.csv

输入格式：每行 `文本\t标签`（标签为 class.txt 行号）
输出格式：title,label,label_zh,words  （与旧链路一致，下游训练脚本无需改动）

用法：
    python -X utf8 randomforest/data_processing.py            # 处理三个集合
    python -X utf8 randomforest/data_processing.py --only dev # 只处理一个
"""

from __future__ import annotations

import argparse
import csv
import sys
import time
from pathlib import Path

import jieba

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import config  # noqa: E402


def load_classes() -> list[str]:
    return [c.strip() for c in config.class_txt.read_text(encoding="utf-8").splitlines() if c.strip()]


def convert(src: Path, dst: Path, classes: list[str]) -> dict:
    dst.parent.mkdir(parents=True, exist_ok=True)
    stats: dict[str, int] = {}
    n = 0
    t0 = time.perf_counter()
    with src.open("r", encoding="utf-8", newline="") as fin, \
            dst.open("w", encoding="utf-8", newline="") as fout:
        w = csv.writer(fout)
        w.writerow(["title", "label", "label_zh", "words"])
        for line in fin:
            line = line.rstrip("\n")
            if not line:
                continue
            text, _, label = line.rpartition("\t")
            if not text or not label.isdigit():
                continue
            idx = int(label)
            words = " ".join(t for t in jieba.cut(text) if t.strip())
            w.writerow([text, idx, classes[idx], words])
            stats[classes[idx]] = stats.get(classes[idx], 0) + 1
            n += 1
            if n % 50000 == 0:
                print(f"  {src.name}: {n} 条，{time.perf_counter() - t0:.0f}s", flush=True)
    print(f"{src.name} -> {dst.name}: {n} 条，{time.perf_counter() - t0:.0f}s")
    return stats


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["train", "dev", "test"], default=None)
    args = ap.parse_args()

    classes = load_classes()
    print(f"{len(classes)} 类：{classes}")
    todo = {"train": (config.train_txt, config.processing_training_data_path),
            "dev": (config.dev_txt, config.processing_dev_data_path),
            "test": (config.test_txt, config.processing_testing_data_path)}
    for name, (src, dst) in todo.items():
        if args.only and name != args.only:
            continue
        if not src.exists():
            raise FileNotFoundError(src)
        stats = convert(src, dst, classes)
        print("  类别分布：", {k: v for k, v in sorted(stats.items(), key=lambda x: -x[1])})


if __name__ == "__main__":
    main()
