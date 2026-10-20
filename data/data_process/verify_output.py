# -*- coding: utf-8 -*-
"""机械校验: 物理行数 = manifest 行数; 每行恰一个 tab 分隔符; 标签合法; 引号统计"""
import json
import pathlib

here = pathlib.Path(__file__).resolve().parent
man = json.loads((here / "manifest.json").read_text(encoding="utf-8"))
ok = True
for name in ("train", "dev", "test"):
    raw = (here / f"{name}.txt").read_bytes()
    crlf = raw.count(b"\r\n")
    lines = raw.decode("utf-8").splitlines()
    expect = man["splits"][name]["rows"]
    n_tab = sum(l.count("\t") for l in lines)
    labels = {}
    bad = 0
    for l in lines:
        parts = l.rsplit("\t", 1)
        if len(parts) != 1 + 1 or parts[1] not in ("0", "1"):
            bad += 1
        else:
            labels[parts[1]] = labels.get(parts[1], 0) + 1
    fraud = labels.get("1", 0)
    q = sum(1 for l in lines if '"' in l)
    qs = sum(1 for l in lines if l.startswith('"'))
    status = "PASS" if (len(lines) == expect and bad == 0 and fraud == man["splits"][name]["fraudulent"]
                        and crlf == 0) else "FAIL"
    ok = ok and status == "PASS"
    print(f"{name}: lines={len(lines)}/{expect} tab_total={n_tab} bad={bad} fraud={fraud} "
          f"quote_lines={q} quote_start={qs} crlf={crlf} -> {status}")
# pandas 读取口径: 必须 quoting=QUOTE_NONE(文案内含双引号, 默认引号解析会吞行)
import csv
import pandas as pd
d = pd.read_csv(here / "train.txt", sep="\t", names=["text", "label"],
                keep_default_na=False, quoting=csv.QUOTE_NONE, encoding="utf-8")
print("pandas_QUOTE_NONE_rows:", len(d), "(应等于物理行数)")
print("OVERALL:", "PASS" if ok and len(d) == man["splits"]["train"]["rows"] else "FAIL")
