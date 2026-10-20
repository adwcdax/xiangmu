# -*- coding: utf-8 -*-
"""
补特征：把 raw/fake_job_postings.csv 的结构化字段转成 token，拼在正文后面。

诈骗帖的强信号很多在字段里而不在正文：没有公司 Logo、公司简介为空、薪资区间缺失、
不显示提问数、要求"立即上岗"等。词袋模型看不到这些，补进来相当于给它加了外部信息。

对齐方式：data/data_process/index.tsv 给了 (split, line_no, job_id)，而 models/data/*.txt
与 index.tsv 行序一致，所以可以逐行拼上 raw CSV 的同 job_id 字段。

输出两种：
  --out-dir models/data_feat   正文 + 字段 token
  --feat-only 时只输出字段 token（用来量"元数据本身有多少信息"）
"""

from __future__ import annotations

import argparse
import csv
import re
from collections import Counter
from pathlib import Path

from prepare import normalize

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "fake_job_postings.csv"
INDEX = ROOT / "data" / "data_process" / "index.tsv"
TEXT_DIR = ROOT / "models" / "data"
LABEL_PREFIX = "__label__"

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
URL_RE = re.compile(r"https?://|www\.", re.I)


def load_raw() -> dict[str, dict]:
    with RAW.open("r", encoding="utf-8", newline="") as f:
        return {row["job_id"]: row for row in csv.DictReader(f)}


def bucket(value: str, top: list[str]) -> str:
    v = (value or "").strip().lower()
    if not v:
        return "na"
    v = re.sub(r"[^a-z0-9]+", "_", v).strip("_")[:24]
    return v if v in top else "other"


def build_tokens(row: dict, text: str, top_ind: list[str], top_fn: list[str]) -> list[str]:
    t: list[str] = []

    # 1) 合规/完整度信号
    if (row.get("has_company_logo") or "0").strip() in ("0", ""):
        t.append("f_nologo")
    profile = (row.get("company_profile") or "").strip()
    t.append("f_profile_empty" if not profile else
             ("f_profile_short" if len(profile) < 120 else "f_profile_long"))
    if not (row.get("salary_range") or "").strip():
        t.append("f_salary_missing")
    if (row.get("telecommuting") or "0").strip() == "1":
        t.append("f_remote")
    if (row.get("has_questions") or "0").strip() == "0":
        t.append("f_no_questions")

    # 2) 岗位属性
    t.append("f_emp_" + bucket(row.get("employment_type", ""), ["full_time", "part_time", "contract",
                                                                "temporary", "other"]))
    t.append("f_exp_" + bucket(row.get("required_experience", ""),
                              ["entry_level", "mid_senior_level", "associate", "director", "executive",
                               "internship", "not_applicable", "other"]))
    t.append("f_edu_" + bucket(row.get("required_education", ""),
                              ["bachelor_s_degree", "master_s_degree", "high_school_or_equivalent",
                               "some_college_course_work", "associate_degree", "unspecified", "other"]))
    t.append("f_ind_" + bucket(row.get("industry", ""), top_ind))
    t.append("f_fn_" + bucket(row.get("function", ""), top_fn))

    # 3) 正文里的联系方式与形态特征
    if EMAIL_RE.search(text):
        t.append("f_email")
    if URL_RE.search(text):
        t.append("f_url")
    digits = sum(ch.isdigit() for ch in text)
    t.append("f_digits_many" if digits > 30 else ("f_digits_some" if digits > 5 else "f_digits_few"))
    letters = sum(ch.isalpha() for ch in text) or 1
    upper = sum(ch.isupper() for ch in text) / letters
    if upper > 0.08:
        t.append("f_upper_high")
    n = len(text)
    t.append("f_len_short" if n < 600 else ("f_len_mid" if n < 1500 else "f_len_long"))
    if "!" in text or text.count("!") >= 3:
        t.append("f_bang")
    return t


def main() -> None:
    ap = argparse.ArgumentParser(description="给英文数据拼接结构化特征 token")
    ap.add_argument("--out-dir", type=Path, default=ROOT / "models" / "data_feat")
    ap.add_argument("--feat-only", action="store_true", help="只输出字段 token，不含正文")
    args = ap.parse_args()

    raw = load_raw()
    print(f"raw CSV {len(raw)} 行")

    index: dict[str, list[tuple[int, str, int]]] = {"train": [], "dev": [], "test": []}
    with INDEX.open("r", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            index[row["split"]].append((int(row["line_no"]), row["job_id"], int(row["label"])))

    # 只在训练集上统计高频行业/职能，避免引入测试集信息
    ind_counter, fn_counter = Counter(), Counter()
    for _, job_id, _ in index["train"]:
        r = raw.get(job_id, {})
        ind_counter[(r.get("industry") or "").strip().lower()] += 1
        fn_counter[(r.get("function") or "").strip().lower()] += 1
    top_ind = [re.sub(r"[^a-z0-9]+", "_", k).strip("_")[:24] for k, _ in ind_counter.most_common(25)]
    top_fn = [re.sub(r"[^a-z0-9]+", "_", k).strip("_")[:24] for k, _ in fn_counter.most_common(25)]

    args.out_dir.mkdir(parents=True, exist_ok=True)
    # 运行时必须用同一份 top 列表，否则 f_ind_*/f_fn_* 的取值会漂移
    (args.out_dir / "vocab.json").write_text(
        __import__("json").dumps({"top_ind": top_ind, "top_fn": top_fn}, ensure_ascii=False, indent=2),
        encoding="utf-8", newline="\n")
    for split in ("train", "dev", "test"):
        rows = index[split]
        out = args.out_dir / f"{split}.txt"
        kept = 0
        with out.open("w", encoding="utf-8", newline="\n") as f:
            for _, job_id, label in rows:
                # 正文直接用 raw 的 description 走同一套清洗，避免与 prepare.py 的空行剔除错位
                body = normalize((raw.get(job_id, {}).get("description") or ""))
                if not body:
                    continue
                tokens = build_tokens(raw.get(job_id, {}), body, top_ind, top_fn)
                payload = " ".join(tokens) if args.feat_only else f"{body} {' '.join(tokens)}"
                f.write(f"{LABEL_PREFIX}{label} {payload}\n")
                kept += 1
        print(f"{split:5s} {kept:5d} 行（index {len(rows)}）-> {out}")

    print("完成。字段 token 示例：")
    sample = (args.out_dir / "train.txt").read_text(encoding="utf-8").splitlines()[0]
    print("  ...", sample[-220:])


if __name__ == "__main__":
    main()
