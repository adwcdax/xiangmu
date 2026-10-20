# -*- coding: utf-8 -*-
"""
EMSCAD 虚假职位广告 — 数据处理（蓝本样式: NLP/tmf/01-data）
1,加载源 CSV（三镜像逐字节一致，取镜像1-Zenodo）并做 sha256 指纹校验
2,清洗 description 单字段: HTML 实体解码、空白归一、保证一条记录一行
3,分层随机切分 8:1:1（按 fraudulent 分层, seed 固定）
4,输出 train.txt / dev.txt / test.txt（每行: 文本\t标签）+ class.txt + stopwords.txt + manifest.json
"""

import hashlib
import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

# 数据源: 项目内 data/raw/fake_job_postings.csv(EMSCAD 三镜像逐字节一致, 见 README 出处)
SRC_CSV = Path(__file__).resolve().parent.parent / "raw" / "fake_job_postings.csv"
SRC_SHA256 = "59253295129d8b6a27607f9904f7d4ddf4dbb0ee35e079c7eb51b58b5e62bf60"

OUT_DIR = Path(__file__).resolve().parent
SEED = 20261020
RATIOS = (0.8, 0.1, 0.1)  # train / dev / test

# Python3 unicode 下 \s 已覆盖 splitlines 认的全部断行符(\n \r \v \f \x85 \u2028 \u2029)及 \xa0 nbsp
WS_RE = re.compile(r"\s+")


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def clean(text: str) -> str:
    if not isinstance(text, str):
        return ""
    text = html.unescape(text)          # &amp; &#8221; 等实体解码（3923 行含实体）
    text = text.replace("\u00a0", " ")  # nbsp
    text = WS_RE.sub(" ", text).strip()
    return text


def stratified_split(df: pd.DataFrame):
    """按 fraudulent 分层, 每个标签类内部 shuffle 后按比例切"""
    parts = {k: [] for k in ("train", "dev", "test")}
    r_train, r_dev, _ = RATIOS
    for _, grp in df.groupby("fraudulent", group_keys=False):
        g = grp.sample(frac=1.0, random_state=SEED)
        n = len(g)
        i1 = int(round(n * r_train))
        i2 = i1 + int(round(n * r_dev))
        parts["train"].append(g.iloc[:i1])
        parts["dev"].append(g.iloc[i1:i2])
        parts["test"].append(g.iloc[i2:])
    return {k: pd.concat(v).sample(frac=1.0, random_state=SEED).reset_index(drop=True) for k, v in parts.items()}


def dump_split(name: str, sub: pd.DataFrame) -> dict:
    lines = []
    for text, label in zip(sub["text"], sub["fraudulent"]):
        assert len(text.splitlines()) <= 1 and "\t" not in text, f"{name} 存在未清除的断行/制表符"
        lines.append(f"{text}\t{label}")
    joined = "\n".join(lines) + "\n"
    assert len(joined.splitlines()) == len(lines), f"{name} 行数与记录数不符"
    (OUT_DIR / f"{name}.txt").write_text(joined, encoding="utf-8", newline="\n")
    return {"rows": len(lines), "fraudulent": int(sub["fraudulent"].sum())}


def main():
    digest = sha256_of(SRC_CSV)
    assert digest == SRC_SHA256, f"源文件指纹不符: {digest}"

    df = pd.read_csv(SRC_CSV, usecols=["job_id", "description", "fraudulent"])
    assert len(df) == 17880 and df["job_id"].is_unique

    df["text"] = df["description"].map(clean)
    empty_rows = int((df["text"] == "").sum())

    splits = stratified_split(df)
    stats = {k: dump_split(k, v) for k, v in splits.items()}

    (OUT_DIR / "class.txt").write_text("legitimate\nfraudulent\n", encoding="utf-8", newline="\n")
    (OUT_DIR / "stopwords.txt").write_text(
        "\n".join(sorted(ENGLISH_STOP_WORDS)) + "\n", encoding="utf-8", newline="\n")

    manifest = {
        "created_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "data/raw/fake_job_postings.csv",
        "source_sha256": digest,
        "field_used": "description",
        "cleaning": ["html.unescape", "nbsp->space", "whitespace_collapse", "one_line_per_record"],
        "read_note": "下游 pandas.read_csv 必须用 sep='\\t', quoting=csv.QUOTE_NONE(文案含双引号, 默认引号解析会吞行)",
        "url_mask_note": "该 Zenodo 版发行方已还原真实 URL, 无 #URL_hash#/[masked] 掩码; '#default#' 仅 1 行, 原样保留",
        "seed": SEED,
        "ratios": {"train": RATIOS[0], "dev": RATIOS[1], "test": RATIOS[2]},
        "stratify_by": "fraudulent",
        "total_rows": len(df),
        "empty_text_rows": empty_rows,
        "splits": stats,
    }
    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")

    print(json.dumps(manifest["splits"], ensure_ascii=False))
    print(f"empty_text_rows={empty_rows}")
    for k, v in stats.items():
        rate = v["fraudulent"] / v["rows"] * 100
        print(f"{k}: rows={v['rows']} fraud={v['fraudulent']} ({rate:.2f}%)")


if __name__ == "__main__":
    main()
