# -*- coding: utf-8 -*-
"""
特征 token 构建：与训练脚本 src/prepare_features.py 保持同一套逻辑。

服务端不读训练数据，只读随包发布的 vocab.json（top_ind / top_fn），
这样 f_ind_* / f_fn_* 的取值不会和训练时漂移。
"""

from __future__ import annotations

import html
import json
import re
import unicodedata
from pathlib import Path

BASE = Path(__file__).resolve().parent
VOCAB = json.loads((BASE / "vocab.json").read_text(encoding="utf-8"))
TOP_IND = VOCAB["top_ind"]
TOP_FN = VOCAB["top_fn"]

WS_RE = re.compile(r"\s+")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
URL_RE = re.compile(r"https?://|www\.", re.I)


def normalize(text: str) -> str:
    text = html.unescape(text or "")
    text = unicodedata.normalize("NFKC", text)
    return WS_RE.sub(" ", text).strip().lower()


def bucket(value: str, top: list[str]) -> str:
    v = (value or "").strip().lower()
    if not v:
        return "na"
    v = re.sub(r"[^a-z0-9]+", "_", v).strip("_")[:24]
    return v if v in top else "other"


def build_tokens(fields: dict, text: str) -> list[str]:
    f = fields or {}
    t: list[str] = []

    if str(f.get("has_company_logo", "0")).strip() in ("0", "", "false", "False"):
        t.append("f_nologo")
    profile = str(f.get("company_profile") or "").strip()
    t.append("f_profile_empty" if not profile else
             ("f_profile_short" if len(profile) < 120 else "f_profile_long"))
    if not str(f.get("salary_range") or "").strip():
        t.append("f_salary_missing")
    if str(f.get("telecommuting", "0")).strip() == "1":
        t.append("f_remote")
    if str(f.get("has_questions", "0")).strip() == "0":
        t.append("f_no_questions")

    t.append("f_emp_" + bucket(f.get("employment_type", ""),
                               ["full_time", "part_time", "contract", "temporary", "other"]))
    t.append("f_exp_" + bucket(str(f.get("required_experience", "")),
                               ["entry_level", "mid_senior_level", "associate", "director",
                                "executive", "internship", "not_applicable", "other"]))
    t.append("f_edu_" + bucket(str(f.get("required_education", "")),
                               ["bachelor_s_degree", "master_s_degree", "high_school_or_equivalent",
                                "some_college_course_work", "associate_degree", "unspecified", "other"]))
    t.append("f_ind_" + bucket(str(f.get("industry", "")), TOP_IND))
    t.append("f_fn_" + bucket(str(f.get("function", "")), TOP_FN))

    if EMAIL_RE.search(text):
        t.append("f_email")
    if URL_RE.search(text):
        t.append("f_url")
    digits = sum(ch.isdigit() for ch in text)
    t.append("f_digits_many" if digits > 30 else ("f_digits_some" if digits > 5 else "f_digits_few"))
    letters = sum(ch.isalpha() for ch in text) or 1
    if sum(ch.isupper() for ch in text) / letters > 0.08:
        t.append("f_upper_high")
    n = len(text)
    t.append("f_len_short" if n < 600 else ("f_len_mid" if n < 1500 else "f_len_long"))
    if text.count("!") >= 3:
        t.append("f_bang")
    return t


def to_model_input(text: str, fields: dict | None = None) -> tuple[str, list[str]]:
    body = normalize(text)
    tokens = build_tokens(fields or {}, body)
    return f"{body} {' '.join(tokens)}", tokens
