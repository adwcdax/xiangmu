# -*- coding: utf-8 -*-
"""机械校验: 行数/单tab/标签合法/LF行尾/QUOTE_NONE读取 + 泄漏门禁(组与重复正文均不得跨切分)"""
import csv
import json
import pathlib
from collections import defaultdict

import pandas as pd

here = pathlib.Path(__file__).resolve().parent
man = json.loads((here / "manifest.json").read_text(encoding="utf-8"))
leak = json.loads((here / "leakage_report.json").read_text(encoding="utf-8"))
ok = True

for name in ("train", "dev", "test"):
    raw = (here / f"{name}.txt").read_bytes()
    crlf = raw.count(b"\r\n")
    lines = raw.decode("utf-8").splitlines()
    expect = man["splits"][name]["rows"]
    labels, bad = {}, 0
    texts = []
    for l in lines:
        parts = l.rsplit("\t", 1)
        if len(parts) != 2 or parts[1] not in ("0", "1"):
            bad += 1
        else:
            labels[parts[1]] = labels.get(parts[1], 0) + 1
            texts.append(parts[0])
    fraud = labels.get("1", 0)
    status = "PASS" if (len(lines) == expect and bad == 0
                        and fraud == man["splits"][name]["fraudulent"] and crlf == 0) else "FAIL"
    ok = ok and status == "PASS"
    print(f"{name}: lines={len(lines)}/{expect} bad={bad} fraud={fraud} "
          f"tab_total={sum(l.count(chr(9)) for l in lines)} crlf={crlf} -> {status}")

d = pd.read_csv(here / "train.txt", sep="\t", names=["text", "label"],
                keep_default_na=False, quoting=csv.QUOTE_NONE, encoding="utf-8")
read_ok = len(d) == man["splits"]["train"]["rows"]
print("pandas_QUOTE_NONE_rows:", len(d), "->", "PASS" if read_ok else "FAIL")

# ---- 泄漏门禁：独立复算，不信任 leakage_report 里自报的数字 ----
idx = pd.read_csv(here / "index.tsv", sep="\t", dtype=str)
idx["label"] = idx["label"].astype(int)
rows_ok = all(int((idx["split"] == k).sum()) == v["rows"] for k, v in man["splits"].items())
fraud_ok = all(int(idx[idx.split == k]["label"].sum()) == v["fraudulent"]
               for k, v in man["splits"].items())
cross_group = int((idx.groupby("group_id")["split"].nunique() > 1).sum())

text_split = defaultdict(set)
for name in ("train", "dev", "test"):
    for l in (here / f"{name}.txt").read_text(encoding="utf-8").splitlines():
        t, _, _ = l.rpartition("\t")
        text_split[t].add(name)
cross_text = sum(1 for s in text_split.values() if len(s) > 1)
dup_total = sum(len(v) for v in text_split.values()) - len(text_split)

quota = leak["post_check"]["fraud_per_split"]
floor = leak["post_check"]["fraud_quota_floor"]
quota_ok = all(v >= floor for v in quota.values())
total_ok = sum(v["rows"] for v in man["splits"].values()) + leak["label_conflict_dropped_rows"] == man["total_rows"]

leak_pass = cross_group == 0 and cross_text == 0 and quota_ok and total_ok and rows_ok and fraud_ok
print(f"index: rows_ok={rows_ok} fraud_ok={fraud_ok} 跨切分组={cross_group} "
      f"跨切分重复正文={cross_text} 全量重复正文={dup_total} 欺诈配额={quota}(下限{floor}) "
      f"行数守恒={total_ok} -> {'PASS' if leak_pass else 'FAIL'}")

ok = ok and read_ok and leak_pass
print("OVERALL:", "PASS" if ok else "FAIL")
