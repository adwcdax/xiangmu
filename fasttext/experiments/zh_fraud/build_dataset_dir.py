# -*- coding: utf-8 -*-
"""
把电诈语料（data_0/中文电诈语料_统一表.csv）整理成 data/zh_data_process 的标准数据集目录。

保持与旧目录完全一致的命名与格式，方便下游脚本一行不改地复用：
  train.txt / dev.txt / test.txt   每行 "文本\\t标签"，标签为 class.txt 的行号
  class.txt                        标签表，行号即标签值（0=无风险）
  config.py                        路径配置（Config 类，属性名与旧版一致）
  stopwords.txt                    沿用旧停用词
  index.tsv                        split / line_no / sample_id / group / label
  manifest.json                    来源、指纹、清洗规则、切分统计
  README.md                        数据说明

切分沿用源表自带的 split 列（该切分按 source 全维度分层，group 不跨集）。
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[2]      # fasttext/
ROOT = PROJECT.parent                              # 仓库根目录
SRC = ROOT / "data_0" / "中文电诈语料_统一表.csv"
DST = ROOT / "data" / "zh_data_process"
OLD_STOPWORDS = ROOT.parent / "_fasttext_zh_archive_20261021" / "old_zh_data_process" / "stopwords.txt"
WS = re.compile(r"\s+")
BENIGN = "无风险"


def main() -> None:
    csv.field_size_limit(10 ** 7)
    rows = []
    with SRC.open("r", encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            text = WS.sub(" ", (r.get("text") or "").replace("\t", " ")).strip()
            if text:
                rows.append({**r, "text": text})

    counter = Counter(r["label_zh"] for r in rows)
    classes = [BENIGN] + [c for c, _ in counter.most_common() if c != BENIGN]
    idx = {c: i for i, c in enumerate(classes)}
    print(f"{len(rows)} 条 / {len(classes)} 类")

    DST.mkdir(parents=True, exist_ok=True)
    # 清掉旧目录里的文件：旧语料与配套脚本已整目录备份到
    # C:\Users\1\Desktop\_fasttext_zh_archive_20261021\old_zh_data_process
    for p in DST.iterdir():
        if p.is_file():
            p.unlink()

    stats = {}
    for split in ("train", "dev", "test"):
        part = [r for r in rows if r["split"] == split]
        with (DST / f"{split}.txt").open("w", encoding="utf-8", newline="\n") as f:
            for r in part:
                f.write(f"{r['text']}\t{idx[r['label_zh']]}\n")
        with (DST / "index.tsv").open("a" if split != "train" else "w", encoding="utf-8", newline="\n") as f:
            if split == "train":
                f.write("split\tline_no\tsample_id\tgroup\tlabel\n")
            for i, r in enumerate(part, 1):
                f.write(f"{split}\t{i}\t{r['sample_id']}\t{r['group']}\t{idx[r['label_zh']]}\n")
        c = Counter(r["label_zh"] for r in part)
        stats[split] = {"rows": len(part), "class_counts": {k: c[k] for k in classes}}
        print(f"  {split:5s} {len(part):6d} 条")

    (DST / "class.txt").write_text("\n".join(classes) + "\n", encoding="utf-8", newline="\n")

    (DST / "config.py").write_text(
        '''# 配置类
class Config:

    # 训练集数据路径
    train_data_path = "./train.txt"

    # 验证集数据路径
    dev_data_path = "./dev.txt"

    # 测试集数据路径
    test_data_path = "./test.txt"

    # 分类标签数据路径
    label_data_path = "./class.txt"

    # 停用词数据路径
    stopwords_data_path = "./stopwords.txt"

    # 样本索引（split / line_no / sample_id / group / label）
    index_data_path = "./index.tsv"


if __name__ == '__main__':
    # assert后跟bool类型表达式, 如果为True则通过, 否则抛出AssertionError异常
    assert Config.train_data_path == "./train.txt"
    assert Config.dev_data_path == "./dev.txt"
    assert Config.test_data_path == "./test.txt"
    assert Config.label_data_path == "./class.txt"
    assert Config.stopwords_data_path == "./stopwords.txt"
    assert Config.index_data_path == "./index.tsv"
    print("配置文件加载成功")
''', encoding="utf-8", newline="\n")

    if OLD_STOPWORDS.exists():
        (DST / "stopwords.txt").write_text(OLD_STOPWORDS.read_text(encoding="utf-8"), encoding="utf-8", newline="\n")
    else:
        (DST / "stopwords.txt").write_text("", encoding="utf-8", newline="\n")

    sha = hashlib.sha256(SRC.read_bytes()).hexdigest()
    manifest = {
        "dataset": "中文电信网络诈骗语料（10 类）",
        "source_file": "data_0/中文电诈语料_统一表.csv",
        "source_sha256": sha,
        "rows": len(rows),
        "labels": classes,
        "format": "每行 文本\\t标签；标签为 class.txt 行号",
        "cleaning": ["空白归一（含换行/制表符替换）", "空文本剔除", "单行一条记录"],
        "split_rule": "沿用源表 split 列：按 source 全维度分层，group（案件）不跨切分，零重复",
        "splits": stats,
        "modality": dict(Counter(r["modality"] for r in rows)),
        "note": "语料为合成/半合成电诈样本；案件描述与短信对话混合",
    }
    (DST / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2),
                                       encoding="utf-8", newline="\n")

    readme = f"""# 中文电诈语料（10 类）

来源：`data_0/中文电诈语料_统一表.csv`（sha256 `{sha[:16]}…`）

## 文件

| 文件 | 说明 |
|---|---|
| `train.txt` / `dev.txt` / `test.txt` | 每行 `文本\\t标签`，{stats['train']['rows']:,} / {stats['dev']['rows']:,} / {stats['test']['rows']:,} 行 |
| `class.txt` | 标签表，行号即标签值：0=无风险，1~9 为诈骗手法 |
| `config.py` | 路径配置，属性名与旧数据集一致 |
| `index.tsv` | `split / line_no / sample_id / group / label` |
| `manifest.json` | 来源、指纹、清洗与切分规则、各类计数 |
| `stopwords.txt` | 停用词（沿用旧表） |

## 类别

| 标签 | 类别 | 全量样本 |
|---|---|---|
""" + "\n".join(f"| {i} | {c} | {counter[c]:,} |" for i, c in enumerate(classes)) + """

## 切分

沿用源表的 `split` 列：按 `source` 全维度分层（五种来源在三集比例一致），
`group`（案件级）不跨切分，全表零重复。

## 用法

```python
import sys; sys.path.insert(0, "data/zh_data_process")
from config import Config
```
"""
    (DST / "README.md").write_text(readme, encoding="utf-8", newline="\n")

    print(f"\n目录 {DST}")
    print("文件：", ", ".join(sorted(p.name for p in DST.iterdir())))


if __name__ == "__main__":
    main()
