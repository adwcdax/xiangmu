# -*- coding: utf-8 -*-
"""
Step 1（中文侧）：从 189 MB 电诈统一表切出招聘域宽表, 作为可入库的 raw 层
产物: ../raw_zh/recruit_fraud_wide.csv (全部 13 列, 正文保持未清洗原样)
      ../raw_zh/manifest_raw.json      (全表指纹 + 口径敏感性数字)
源表超 GitHub 单文件 100 MB 硬限不能入库, 故以本切片为仓库内复现起点。
"""

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

SRC_CSV = Path(r"D:/weixin_chat/xwechat_files/wxid_m27ycvtz4d8822_f29e/msg/file/2026-10/中文电诈语料_统一表.csv")
OUT_DIR = Path(__file__).resolve().parent.parent / "raw_zh"
OUT_CSV = OUT_DIR / "recruit_fraud_wide.csv"
SRC_ROWS_EXPECT = 352836

RECRUIT = ["招聘", "求职", "面试", "入职", "岗位", "简历", "试岗", "内推", "录用",
           "直招", "招工", "求职者", "用人单位", "试用期", "上班"]
TASK = ["兼职", "刷单", "日结", "打字员", "手工活", "一单一结", "做任务", "接单",
        "点赞员", "返利", "佣金"]
TRAP = ["培训贷", "体检费", "服装费", "押金", "保证金", "介绍费", "扣押", "境外务工",
        "出国劳务", "高薪招聘", "招聘诈骗", "主播招募", "模特", "配音", "录音",
        "刷流水", "洗钱", "银行卡出借"]


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def kw_re(kws):
    return "|".join(map(re.escape, kws))


def main():
    assert SRC_CSV.exists(), f"源表不在了: {SRC_CSV}（需从上游按 manifest 指纹重新取回）"
    digest = sha256_of(SRC_CSV)

    df = pd.read_csv(SRC_CSV)
    assert len(df) == SRC_ROWS_EXPECT, f"源表行数 {len(df)} != {SRC_ROWS_EXPECT}"
    cols = df.columns.tolist()

    hit_r = df["text"].str.contains(kw_re(RECRUIT), regex=True, na=False)
    hit_t = df["text"].str.contains(kw_re(TASK), regex=True, na=False)
    hit_p = df["text"].str.contains(kw_re(TRAP), regex=True, na=False)
    keep = hit_r | hit_t

    def blk(mask):
        s = df[mask]
        return {"rows": int(len(s)), "fraud": int((s["label_slug"] != "benign").sum()),
                "benign": int((s["label_slug"] == "benign").sum())}

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sub = df[keep]
    sub.to_csv(OUT_CSV, index=False, encoding="utf-8", lineterminator="\n")

    manifest = {
        "created_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "step": "1/2 全表 -> 招聘域宽表(未清洗原文)",
        "source_file": SRC_CSV.name,
        "source_rows": SRC_ROWS_EXPECT,
        "source_sha256": digest,
        "source_note": "189MB 超 GitHub 单文件 100MB 硬限, 未入库; 复现本切片需自备同指纹源表",
        "jsonl_note": "中文电诈对话_JSONL.txt 与本表 dialog 子集 sample_id 完全相等(159843)且文本逐字相同, 未重复使用",
        "inclusion_rule": "C1∪C3: 命中招聘语境词 或 刷单兼职词",
        "keyword_groups": {"recruit_C1": RECRUIT, "task_C3": TASK, "trap_not_used": TRAP},
        "columns_kept": cols,
        "criteria_sensitivity": {
            "C1_仅招聘词": blk(hit_r),
            "C2_招聘且兼职或要件": blk(hit_r & (hit_t | hit_p)),
            "C3_仅刷单兼职词": blk(hit_t),
            "C1并C3_采用": blk(keep),
            "C4_三组并集": blk(hit_r | hit_t | hit_p),
        },
        "output": {
            "file": "data/raw_zh/recruit_fraud_wide.csv",
            "rows": int(len(sub)),
            "bytes": OUT_CSV.stat().st_size,
            "sha256": sha256_of(OUT_CSV),
        },
    }
    (OUT_DIR / "manifest_raw.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")

    print(f"宽表: {len(sub)} 行, {OUT_CSV.stat().st_size:,} 字节")
    print("sha256:", manifest["output"]["sha256"])
    print("源表 sha256:", digest)


if __name__ == "__main__":
    main()
