# -*- coding: utf-8 -*-
"""
EMSCAD 虚假职位广告 — 数据处理（蓝本样式: NLP/tmf/01-data）
1,加载源 CSV（三镜像逐字节一致，取 data/raw）并做 sha256 指纹校验
2,清洗 description 单字段: HTML 实体解码、空白归一、保证一条记录一行
3,泄漏防护: 完全重复 + MinHash LSH 近重复(候选对精确 Jaccard 复核) -> 并查集归组
4,切分: 组级(group-level)分层切分 8:1:1, 同组样本绝不跨切分; 标签冲突组整体剔除
5,输出 train/dev/test.txt + index.tsv + class.txt + stopwords.txt + manifest.json + leakage_report.json
"""

import hashlib
import html
import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

# 数据源: 项目内 data/raw/fake_job_postings.csv(EMSCAD 三镜像逐字节一致, 见 README 出处)
SRC_CSV = Path(__file__).resolve().parent.parent / "raw" / "fake_job_postings.csv"
SRC_SHA256 = "59253295129d8b6a27607f9904f7d4ddf4dbb0ee35e079c7eb51b58b5e62bf60"

OUT_DIR = Path(__file__).resolve().parent
SEED = 20261020
RATIOS = (0.8, 0.1, 0.1)  # train / dev / test

# 近重复参数
NUM_PERM = 128            # MinHash 排列数
BANDS, ROWS = 16, 8       # LSH 分带: 16*8=128, S 曲线中点约 0.71
JACCARD_T = 0.75          # 候选对精确复核阈值, 达到才并入同组
SHINGLE_N = 3             # 词 n-gram
MIN_TEST_FRAUD = 40       # 项目文档 P1: 欺诈类切分配额下限

WS_RE = re.compile(r"\s+")
TOK_RE = re.compile(r"[a-z0-9]+")
MERSENNE = (1 << 61) - 1


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


def shingles(text: str):
    toks = TOK_RE.findall(text.lower())
    if len(toks) < SHINGLE_N:
        return {text.lower()} if text else set()
    return {" ".join(toks[i:i + SHINGLE_N]) for i in range(len(toks) - SHINGLE_N + 1)}


class UnionFind:
    def __init__(self):
        self.p = {}

    def find(self, x):
        self.p.setdefault(x, x)
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[rb] = ra


def build_groups(texts):
    """返回 (groups: {root: [idx]}, 统计信息)"""
    uf = UnionFind()
    # 1) 完全重复先并组
    exact = defaultdict(list)
    for i, t in enumerate(texts):
        exact[t].append(i)
    n_exact_dup = 0
    for idxs in exact.values():
        for j in idxs[1:]:
            uf.union(idxs[0], j)
        n_exact_dup += len(idxs) - 1

    # 2) MinHash 签名
    rng = np.random.default_rng(SEED)
    a = rng.integers(1, MERSENNE, size=NUM_PERM, dtype=np.int64)
    b = rng.integers(0, MERSENNE, size=NUM_PERM, dtype=np.int64)

    sigs = np.zeros((len(texts), NUM_PERM), dtype=np.int64)
    shsets = []
    for i, t in enumerate(texts):
        sh = shingles(t)
        shsets.append(sh)
        if not sh:
            sigs[i] = np.iinfo(np.int64).max
            continue
        hv = np.frombuffer(
            b"".join(hashlib.blake2b(s.encode("utf-8"), digest_size=8).digest() for s in sh),
            dtype=np.uint64).astype(np.int64) % MERSENNE
        cand = (np.outer(hv, a) + b) % MERSENNE
        sigs[i] = cand.min(axis=0)

    # 3) LSH 分桶取候选对
    cand_pairs = set()
    for band in range(BANDS):
        buckets = defaultdict(list)
        block = sigs[:, band * ROWS:(band + 1) * ROWS]
        for i in range(len(texts)):
            buckets[block[i].tobytes()].append(i)
        for members in buckets.values():
            if len(members) > 1:
                for x in range(len(members)):
                    for y in range(x + 1, len(members)):
                        cand_pairs.add((members[x], members[y]))

    # 4) 精确 Jaccard 复核
    n_merged = 0
    for i, j in cand_pairs:
        si, sj = shsets[i], shsets[j]
        if not si or not sj:
            continue
        inter = len(si & sj)
        if inter == 0:
            continue
        if inter / (len(si) + len(sj) - inter) >= JACCARD_T:
            before = uf.find(i) != uf.find(j)
            uf.union(i, j)
            n_merged += int(before)

    groups = defaultdict(list)
    for i in range(len(texts)):
        groups[uf.find(i)].append(i)
    stats = {
        "rows": len(texts),
        "unique_exact_texts": len(exact),
        "exact_duplicate_rows": n_exact_dup,
        "lsh_candidate_pairs": len(cand_pairs),
        "near_dup_merges": n_merged,
        "groups": len(groups),
        "largest_group": max(len(v) for v in groups.values()),
        "singleton_groups": sum(1 for v in groups.values() if len(v) == 1),
    }
    return groups, stats


def group_stratified_split(groups, labels):
    """组级切分: 每个标签内部按组装箱, 目标比例 RATIOS; 同组绝不拆开"""
    by_label = defaultdict(list)
    for root, members in groups.items():
        lab = labels[members[0]]
        by_label[lab].append((root, members))

    parts = {k: [] for k in ("train", "dev", "test")}
    for lab, gs in by_label.items():
        total = sum(len(m) for _, m in gs)
        target = {"train": total * RATIOS[0], "dev": total * RATIOS[1], "test": total * RATIOS[2]}
        fill = {"train": 0, "dev": 0, "test": 0}
        rng = np.random.default_rng(SEED + int(lab))
        order = list(range(len(gs)))
        rng.shuffle(order)
        # 大组优先装箱, 避免尾部凑不齐配额
        order.sort(key=lambda k: -len(gs[k][1]))
        for k in order:
            root, members = gs[k]
            # 选"当前缺口最大"的切分
            best = max(("train", "dev", "test"), key=lambda s: target[s] - fill[s])
            fill[best] += len(members)
            for i in members:
                parts[best].append(i)
    out = {}
    for name, idxs in parts.items():
        arr = np.array(sorted(idxs))
        rng = np.random.default_rng(SEED)
        out[name] = arr[rng.permutation(len(arr))]
    return out


def main():
    digest = sha256_of(SRC_CSV)
    assert digest == SRC_SHA256, f"源文件指纹不符: {digest}"

    df = pd.read_csv(SRC_CSV, usecols=["job_id", "description", "fraudulent"])
    assert len(df) == 17880 and df["job_id"].is_unique
    df["text"] = df["description"].map(clean)
    empty_rows = int((df["text"] == "").sum())

    texts = df["text"].tolist()
    labels = df["fraudulent"].tolist()
    groups, gstats = build_groups(texts)

    # 标签冲突组（同一段文案上游给了不同标签）整体剔除, 不猜
    conflict_roots = [r for r, m in groups.items() if len({labels[i] for i in m}) > 1]
    conflict_rows = sum(len(groups[r]) for r in conflict_roots)
    groups = {r: m for r, m in groups.items() if r not in conflict_roots}

    split = group_stratified_split(groups, labels)

    gid_of = {}
    for r, m in groups.items():
        for i in m:
            gid_of[i] = r

    stats, index_rows = {}, []
    for name, idxs in split.items():
        lines = []
        for ln, i in enumerate(idxs, 1):
            text = texts[i]
            assert len(text.splitlines()) <= 1 and "\t" not in text, f"{name} 残留断行/制表符"
            lines.append(f"{text}\t{labels[i]}")
            index_rows.append({"split": name, "line_no": ln, "job_id": int(df["job_id"].iat[i]),
                               "group_id": int(gid_of[i]), "label": int(labels[i])})
        joined = "\n".join(lines) + "\n"
        assert len(joined.splitlines()) == len(lines), f"{name} 行数与记录数不符"
        (OUT_DIR / f"{name}.txt").write_text(joined, encoding="utf-8", newline="\n")
        stats[name] = {"rows": len(lines), "fraudulent": int(sum(labels[i] for i in idxs))}

    pd.DataFrame(index_rows).to_csv(OUT_DIR / "index.tsv", sep="\t", index=False,
                                    encoding="utf-8", lineterminator="\n")
    (OUT_DIR / "class.txt").write_text("legitimate\nfraudulent\n", encoding="utf-8", newline="\n")
    (OUT_DIR / "stopwords.txt").write_text(
        "\n".join(sorted(__import__("sklearn.feature_extraction.text", fromlist=["x"]).ENGLISH_STOP_WORDS)) + "\n",
        encoding="utf-8", newline="\n")

    # 泄漏自检: 组不得跨切分, 正文不得跨切分重复
    split_of = {i: n for n, idxs in split.items() for i in idxs}
    cross_group = sum(1 for m in groups.values() if len({split_of[i] for i in m}) > 1)
    text_split = defaultdict(set)
    for i, s in split_of.items():
        text_split[texts[i]].add(s)
    cross_text = sum(1 for t, ss in text_split.items() if len(ss) > 1)

    quota = {n: stats[n]["fraudulent"] for n in ("dev", "test")}
    quota_ok = all(v >= MIN_TEST_FRAUD for v in quota.values())

    leakage = {
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "method": "exact-dup union + MinHash(128 perm) LSH(bands=16,rows=8) + 精确 Jaccard 复核(>=0.75) + 并查集归组 + 组级分层切分",
        "params": {"seed": SEED, "num_perm": NUM_PERM, "bands": BANDS, "rows": ROWS,
                   "jaccard_threshold": JACCARD_T, "shingle": f"word {SHINGLE_N}-gram"},
        "grouping": gstats,
        "label_conflict_dropped_groups": len(conflict_roots),
        "label_conflict_dropped_rows": conflict_rows,
        "rows_in_split": sum(v["rows"] for v in stats.values()),
        "rows_dropped_total": len(df) - sum(v["rows"] for v in stats.values()),
        "post_check": {"groups_crossing_splits": cross_group,
                       "exact_texts_crossing_splits": cross_text,
                       "fraud_quota_floor": MIN_TEST_FRAUD,
                       "fraud_per_split": quota, "quota_ok": bool(quota_ok)},
        "splits": stats,
    }
    (OUT_DIR / "leakage_report.json").write_text(
        json.dumps(leakage, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")

    manifest = {
        "created_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "data/raw/fake_job_postings.csv",
        "source_sha256": digest,
        "field_used": "description",
        "cleaning": ["html.unescape", "whitespace_collapse(含全部断行符)", "one_line_per_record"],
        "read_note": "下游 pandas.read_csv 必须用 sep='\\t', quoting=csv.QUOTE_NONE(文案含双引号, 默认引号解析会吞行)",
        "url_mask_note": "该 Zenodo 版发行方已还原真实 URL, 无 #URL_hash#/[masked] 掩码; '#default#' 仅 1 行, 原样保留",
        "seed": SEED,
        "ratios": {"train": RATIOS[0], "dev": RATIOS[1], "test": RATIOS[2]},
        "stratify_by": "fraudulent",
        "split_rule": "组级切分(minhash 近重复归组), 同组与完全重复正文均不跨切分; 标签冲突组剔除",
        "total_rows": len(df),
        "empty_text_rows": empty_rows,
        "leakage_report": "leakage_report.json",
        "splits": stats,
    }
    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")

    print(json.dumps(stats, ensure_ascii=False))
    print("分组:", {k: gstats[k] for k in ("unique_exact_texts", "exact_duplicate_rows",
                                          "lsh_candidate_pairs", "near_dup_merges", "groups",
                                          "largest_group", "singleton_groups")})
    print(f"剔除标签冲突: {len(conflict_roots)} 组 / {conflict_rows} 行")
    print(f"泄漏自检: 跨切分组={cross_group} 跨切分重复正文={cross_text} 欺诈配额={quota} ok={quota_ok}")


if __name__ == "__main__":
    main()
