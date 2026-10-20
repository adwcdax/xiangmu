# -*- coding: utf-8 -*-
"""
中文电诈语料 -> 招聘型骗局子集（蓝本样式: NLP/tmf/01-data）
1,加载统一表 CSV（JSONL 是其 dialog 子集, 不重复使用）并登记 sha256
2,按 C1∪C3 口径筛选: 文本命中"招聘语境词"或"刷单兼职词"
3,标签: label_slug != benign -> 1(欺诈); benign -> 0(无风险)  —— 极性只取上游标签, 不由关键词决定
4,切分: 沿用上游 split 列(已实测 group 不跨 split), 不重新随机切分
5,清洗: 全部断行/制表符归一为单空格, 保证一条记录一个物理行
6,输出 train/dev/test.txt(文本\t标签) + class.txt + stopwords.txt + index.tsv + manifest.json
"""

import hashlib
import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

# 源文件 189 MB, 超 GitHub 单文件 100 MB 硬限 => 不入库, 只登记指纹
SRC_CSV = Path(r"D:/weixin_chat/xwechat_files/wxid_m27ycvtz4d8822_f29e/msg/file/2026-10/中文电诈语料_统一表.csv")
SRC_ROWS_EXPECT = 352836

OUT_DIR = Path(__file__).resolve().parent
STOPWORDS_SRC = Path(r"E:/heima_python/NLP/tmf/01-data/stopwords.txt")
SEED = 20261020

# C1 招聘语境词
RECRUIT = ["招聘", "求职", "面试", "入职", "岗位", "简历", "试岗", "内推", "录用",
           "直招", "招工", "求职者", "用人单位", "试用期", "上班"]
# C3 刷单兼职词（中文招聘骗局主力话术）
TASK = ["兼职", "刷单", "日结", "打字员", "手工活", "一单一结", "做任务", "接单",
        "点赞员", "返利", "佣金"]
# 对照组口径, 仅用于在 manifest 里留敏感性数字
TRAP = ["培训贷", "体检费", "服装费", "押金", "保证金", "介绍费", "扣押", "境外务工",
        "出国劳务", "高薪招聘", "招聘诈骗", "主播招募", "模特", "配音", "录音",
        "刷流水", "洗钱", "银行卡出借"]

WS_RE = re.compile(r"\s+")  # Python3 unicode 下覆盖 \n \r \v \f \x85 \u2028 \u2029 \t \xa0


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def clean(text) -> str:
    if not isinstance(text, str):
        return ""
    return WS_RE.sub(" ", html.unescape(text)).strip()


def kw_re(kws):
    return "|".join(map(re.escape, kws))


def main():
    digest = sha256_of(SRC_CSV)
    df = pd.read_csv(SRC_CSV, usecols=["sample_id", "modality", "label_zh", "label_slug",
                                       "risk_point", "text", "case_id", "group", "split"])
    assert len(df) == SRC_ROWS_EXPECT, f"源表行数 {len(df)} != {SRC_ROWS_EXPECT}"

    hit_r = df["text"].str.contains(kw_re(RECRUIT), regex=True, na=False)
    hit_t = df["text"].str.contains(kw_re(TASK), regex=True, na=False)
    hit_p = df["text"].str.contains(kw_re(TRAP), regex=True, na=False)

    keep = hit_r | hit_t                      # 采用口径 C1∪C3
    sub = df[keep].copy()
    sub["label"] = (sub["label_slug"] != "benign").astype(int)
    sub["text"] = sub["text"].map(clean)
    sub = sub[sub["text"] != ""]

    # 上游 split 已保证 group 不跨 split, 沿用即可
    assert (sub.groupby("group")["split"].nunique() == 1).all(), "存在跨 split 的 group"

    stats = {}
    index_rows = []
    for name in ("train", "dev", "test"):
        part = sub[sub["split"] == name].sample(frac=1.0, random_state=SEED).reset_index(drop=True)
        lines = []
        for i, r in part.iterrows():
            lines.append(f"{r['text']}\t{r['label']}")
        joined = "\n".join(lines) + "\n"
        assert len(joined.splitlines()) == len(lines), f"{name} 行数与记录数不符"
        (OUT_DIR / f"{name}.txt").write_text(joined, encoding="utf-8", newline="\n")
        stats[name] = {"rows": len(lines), "fraudulent": int(part["label"].sum())}
        for i, r in part.iterrows():
            index_rows.append({"split": name, "line_no": i + 1, "sample_id": r["sample_id"],
                               "label": r["label"], "label_zh": r["label_zh"],
                               "modality": r["modality"], "group": r["group"],
                               "case_id": r["case_id"]})

    pd.DataFrame(index_rows).to_csv(OUT_DIR / "index.tsv", sep="\t", index=False,
                                    encoding="utf-8", lineterminator="\n")
    (OUT_DIR / "class.txt").write_text("无风险\n欺诈\n", encoding="utf-8", newline="\n")
    (OUT_DIR / "stopwords.txt").write_text(STOPWORDS_SRC.read_text(encoding="utf-8"),
                                           encoding="utf-8", newline="\n")

    def blk(mask):
        s = df[mask]
        return {"rows": int(len(s)), "fraud": int((s["label_slug"] != "benign").sum()),
                "benign": int((s["label_slug"] == "benign").sum())}

    manifest = {
        "created_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source_file": "中文电诈语料_统一表.csv",
        "source_note": "189MB 超 GitHub 单文件硬限, 未入库; 复现需自备同指纹文件",
        "source_sha256": digest,
        "source_rows": SRC_ROWS_EXPECT,
        "jsonl_note": "中文电诈对话_JSONL.txt 与本表 dialog 子集 sample_id 完全相等(159843), 文本逐字相同, 故未重复使用",
        "inclusion_rule": "C1∪C3: 文本命中招聘语境词 或 刷单兼职词",
        "keyword_groups": {"recruit_C1": RECRUIT, "task_C3": TASK},
        "label_rule": "label_slug != 'benign' -> 1(欺诈); 'benign' -> 0(无风险)。关键词只决定入选, 不决定标签",
        "split_rule": "沿用上游 split 列; 已实测全表 group 不跨 split, 未重新切分",
        "seed": SEED,
        "cleaning": ["html.unescape", "whitespace_collapse(含全部断行符)", "one_line_per_record"],
        "read_note": "下游 pandas.read_csv 必须用 sep='\\t', quoting=csv.QUOTE_NONE",
        "criteria_sensitivity": {
            "C1_仅招聘词": blk(hit_r),
            "C2_招聘且兼职或要件": blk(hit_r & (hit_t | hit_p)),
            "C3_仅刷单兼职词": blk(hit_t),
            "C1并C3_采用": blk(hit_r | hit_t),
            "C4_三组并集": blk(hit_r | hit_t | hit_p),
        },
        "fraud_rate_pct": round(float(sub["label"].mean() * 100), 2),
        "modality_mix": sub["modality"].value_counts().to_dict(),
        "fraud_subclass_mix": sub[sub["label"] == 1]["label_zh"].value_counts().to_dict(),
        "splits": stats,
        "caveat": "上游文本为 LLM 合成(非真实查获语料), 训练结论只代表合成话术分布; 真实中文招聘数据在 ORFD",
    }
    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")

    for k, v in stats.items():
        print(f"{k}: rows={v['rows']} fraud={v['fraudulent']} "
              f"({v['fraudulent']/v['rows']*100:.2f}%)")
    print("total:", sum(v["rows"] for v in stats.values()),
          "fraud_rate%:", manifest["fraud_rate_pct"])


if __name__ == "__main__":
    main()
