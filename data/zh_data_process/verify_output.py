# -*- coding: utf-8 -*-
"""机械校验: 物理行数=manifest; 每行恰一 tab; 标签合法; LF 行尾; QUOTE_NONE 读取口径; group 不跨 split"""
import csv
import json
import pathlib

import pandas as pd

here = pathlib.Path(__file__).resolve().parent
man = json.loads((here / "manifest.json").read_text(encoding="utf-8"))
ok = True

for name in ("train", "dev", "test"):
    raw = (here / f"{name}.txt").read_bytes()
    crlf = raw.count(b"\r\n")
    lines = raw.decode("utf-8").splitlines()
    expect = man["splits"][name]["rows"]
    labels = {}
    bad = 0
    for l in lines:
        parts = l.rsplit("\t", 1)
        if len(parts) != 2 or parts[1] not in ("0", "1"):
            bad += 1
        else:
            labels[parts[1]] = labels.get(parts[1], 0) + 1
    fraud = labels.get("1", 0)
    status = "PASS" if (len(lines) == expect and bad == 0
                        and fraud == man["splits"][name]["fraudulent"] and crlf == 0) else "FAIL"
    ok = ok and status == "PASS"
    print(f"{name}: lines={len(lines)}/{expect} bad={bad} fraud={fraud} "
          f"tab_total={sum(l.count(chr(9)) for l in lines)} crlf={crlf} -> {status}")

# 读取口径
d = pd.read_csv(here / "train.txt", sep="\t", names=["text", "label"],
                keep_default_na=False, quoting=csv.QUOTE_NONE, encoding="utf-8")
read_ok = len(d) == man["splits"]["train"]["rows"]
print("pandas_QUOTE_NONE_rows:", len(d), "->", "PASS" if read_ok else "FAIL")

# 溯源索引一致性 + 泄漏检查
idx = pd.read_csv(here / "index.tsv", sep="\t", dtype=str, encoding="utf-8")
idx["label"] = idx["label"].astype(int)
per_split = idx["split"].value_counts().to_dict()
rows_ok = all(per_split.get(k, 0) == v["rows"] for k, v in man["splits"].items())
fraud_ok = all(int(idx[idx.split == k]["label"].sum()) == v["fraudulent"]
               for k, v in man["splits"].items())
cross = int((idx.groupby("group")["split"].nunique() > 1).sum())
dup_id = int(idx["sample_id"].duplicated().sum())
print(f"index: splits={per_split} rows_ok={rows_ok} fraud_ok={fraud_ok} "
      f"跨split组={cross} 重复sample_id={dup_id} -> "
      f"{'PASS' if rows_ok and fraud_ok and cross == 0 and dup_id == 0 else 'FAIL'}")

ok = ok and read_ok and rows_ok and fraud_ok and cross == 0 and dup_id == 0
print("OVERALL:", "PASS" if ok else "FAIL")
