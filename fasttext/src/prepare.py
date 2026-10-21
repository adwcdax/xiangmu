# -*- coding: utf-8 -*-
"""
Step 1（英文）：data/data_process 的 "文本\\t标签" -> fastText 监督格式。

英文本身以空格分词，不需要中文那样的分词步骤，这里只做轻量规范化：
  小写、HTML 实体还原、不可见字符压成单空格、去掉首尾空白。
不做去停用词：fastText 靠词与 n-gram 共现，停用词对短文本反而有信息量。
"""

from __future__ import annotations

import argparse
import html
import json
import re
import unicodedata
from pathlib import Path

import paths as P

WS_RE = re.compile(r"\s+")


def read_records(path: Path) -> list[tuple[str, int]]:
    records: list[tuple[str, int]] = []
    with path.open("r", encoding="utf-8", newline="\n") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line:
                continue
            text, sep, label = line.rpartition("\t")
            if not sep:
                continue
            text = text.strip()
            if text:
                records.append((text, int(label.strip())))
    return records


def normalize(text: str, lower: bool = True) -> str:
    text = html.unescape(text)
    text = unicodedata.normalize("NFKC", text)
    text = WS_RE.sub(" ", text).strip()
    return text.lower() if lower else text


def main() -> None:
    ap = argparse.ArgumentParser(description="英文 EMSCAD 语料 -> fastText 格式")
    ap.add_argument("--out-dir", type=Path, default=P.FT_DATA_DIR)
    ap.add_argument("--keep-case", action="store_true", help="默认转小写")
    args = ap.parse_args()

    if not P.TRAIN_FILE.exists():
        raise FileNotFoundError(f"训练集不存在：{P.TRAIN_FILE}")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    meta = {"dataset": "EMSCAD (data/data_process)", "lower": not args.keep_case,
            "label_prefix": P.LABEL_PREFIX, "labels": P.LABEL_NAMES, "splits": {}}

    for split, src in (("train", P.TRAIN_FILE), ("dev", P.DEV_FILE), ("test", P.TEST_FILE)):
        dst = args.out_dir / f"{split}.txt"
        rows = words = positives = 0
        with dst.open("w", encoding="utf-8", newline="\n") as f:
            for text, label in read_records(src):
                clean = normalize(text, lower=not args.keep_case)
                if not clean:
                    continue
                f.write(f"{P.LABEL_PREFIX}{label} {clean}\n")
                rows += 1
                words += len(clean.split())
                positives += label
        meta["splits"][split] = {"rows": rows, "positives": positives,
                                 "pos_rate": round(positives / max(rows, 1), 4),
                                 "avg_words": round(words / max(rows, 1), 1),
                                 "path": str(dst.relative_to(P.ROOT))}
        print(f"{split:5s} rows={rows:6d} 欺诈={positives:5d}({positives / max(rows, 1):.2%}) "
              f"平均词数={words / max(rows, 1):7.1f} -> {dst}")

    (args.out_dir / "prepare_meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
