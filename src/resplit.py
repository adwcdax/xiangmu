# -*- coding: utf-8 -*-
"""
把英文数据的划分"做细"：按近重复簇切分，而不是逐条随机切分。

原 data_process.py 是分层随机 8:1:1，同一份 JD 被反复爬取的副本会被打进不同集合，
测试集里 40% 的样本在训练集里有近重复 —— 这不是数据内容的问题，是划分粒度的问题。

做法：
  1. 把 train+dev+test 合起来，用 bottom-k MinHash 估计两两相似度，
     Jaccard >= 阈值（默认 0.6）的样本并成一个簇（并查集）
  2. 以"簇"为单位按 8:1:1 分层分配（同一标签的簇尽量均摊到三集）
  3. 输出 models/data_clean/，并做泄漏自检、簇内标签冲突统计

簇内标签不一致 = 同一份 JD 副本被打上不同标签，属于标注噪声，单独报出来。
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import random
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import paths as P

WS_RE = re.compile(r"\s+")
PUNCT_RE = re.compile(r"[\s\W_]+", re.UNICODE)
SHINGLE = 4
SKETCH_K = 48


class UnionFind:
    def __init__(self, n: int):
        self.p = list(range(n))

    def find(self, x: int) -> int:
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[rb] = ra


def normalize(text: str) -> str:
    text = html.unescape(text)
    text = unicodedata.normalize("NFKC", text)
    return WS_RE.sub(" ", text).strip().lower()


def load_all() -> list[dict]:
    rows: list[dict] = []
    for name, path in (("train", P.TRAIN_FILE), ("dev", P.DEV_FILE), ("test", P.TEST_FILE)):
        with path.open("r", encoding="utf-8", newline="\n") as f:
            for line in f:
                line = line.rstrip("\n")
                if not line:
                    continue
                text, sep, label = line.rpartition("\t")
                if not sep or not text.strip():
                    continue
                rows.append({"text": normalize(text), "label": int(label.strip()), "old_split": name})
    return rows


def sketch(text: str) -> frozenset[int]:
    s = PUNCT_RE.sub("", text)
    if len(s) <= SHINGLE:
        return frozenset()
    hs = [int.from_bytes(hashlib.blake2b(s[i:i + SHINGLE].encode("utf-8"), digest_size=8).digest(), "big")
          for i in range(len(s) - SHINGLE + 1)]
    return frozenset(sorted(hs)[:SKETCH_K])


def jaccard(a: frozenset[int], b: frozenset[int]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    return inter / (len(a) + len(b) - inter)


def build_clusters(texts: list[str], threshold: float) -> tuple[list[int], int]:
    sketches = [sketch(t) for t in texts]
    index: dict[int, list[int]] = defaultdict(list)
    for i, sk in enumerate(sketches):
        for h in list(sk)[:4]:
            bucket = index[h]
            if len(bucket) < 400:
                bucket.append(i)

    uf = UnionFind(len(texts))
    compared = 0
    for i, sk in enumerate(sketches):
        cand: set[int] = set()
        for h in list(sk)[:4]:
            cand.update(index.get(h, ()))
        cand.discard(i)
        for j in cand:
            if j <= i:
                continue
            compared += 1
            if jaccard(sk, sketches[j]) >= threshold:
                uf.union(i, j)
    roots = {uf.find(i) for i in range(len(texts))}
    return [uf.find(i) for i in range(len(texts))], compared


def main() -> None:
    ap = argparse.ArgumentParser(description="按近重复簇重新切分英文数据")
    ap.add_argument("--threshold", type=float, default=0.6)
    ap.add_argument("--train-ratio", type=float, default=0.8)
    ap.add_argument("--dev-ratio", type=float, default=0.1)
    ap.add_argument("--out", type=Path, default=P.MODEL_DIR / "data_clean")
    ap.add_argument("--seed", type=int, default=20261021)
    args = ap.parse_args()

    rows = load_all()
    texts = [r["text"] for r in rows]
    print(f"合并三集：{len(rows)} 条（欺诈 {sum(r['label'] for r in rows)}）")

    root_of, compared = build_clusters(texts, args.threshold)
    clusters: dict[int, list[int]] = defaultdict(list)
    for i, root in enumerate(root_of):
        clusters[root].append(i)
    print(f"相似度比较 {compared:,} 对，得到 {len(clusters)} 个簇（阈值 {args.threshold}）")

    mixed = [c for c in clusters.values() if len({rows[i]["label"] for i in c}) > 1]
    mixed_rows = sum(len(c) for c in mixed)
    print(f"簇内标签冲突：{len(mixed)} 个簇 / {mixed_rows} 条（同一份 JD 副本被标成不同类）")

    # 以簇为单位按比例分配；纯净簇按标签均衡，冲突簇按多数标签均衡
    rng = random.Random(args.seed)
    order = list(clusters.values())
    rng.shuffle(order)
    order.sort(key=lambda c: sum(rows[i]["label"] for i in c), reverse=True)

    total_pos = sum(r["label"] for r in rows)
    targets = {"train": (args.train_ratio * len(rows), args.train_ratio * total_pos),
               "dev": (args.dev_ratio * len(rows), args.dev_ratio * total_pos)}
    targets["test"] = (len(rows) - targets["train"][0] - targets["dev"][0],
                       total_pos - targets["train"][1] - targets["dev"][1])
    acc = {k: [0.0, 0.0] for k in targets}
    assign = {k: [] for k in targets}

    for cluster in order:
        pos = sum(rows[i]["label"] for i in cluster)
        best, best_gap = None, -1e9
        for k in ("train", "dev", "test"):
            gap = ((targets[k][0] - acc[k][0]) / targets[k][0]
                   + 1.5 * (targets[k][1] - acc[k][1]) / max(targets[k][1], 1))
            if gap > best_gap:
                best, best_gap = k, gap
        assign[best].extend(cluster)
        acc[best][0] += len(cluster)
        acc[best][1] += pos

    args.out.mkdir(parents=True, exist_ok=True)
    stats = {}
    for split, idx in assign.items():
        idx = sorted(idx)
        path = args.out / f"{split}.txt"
        with path.open("w", encoding="utf-8", newline="\n") as f:
            for i in idx:
                f.write(f"{P.LABEL_PREFIX}{rows[i]['label']} {rows[i]['text']}\n")
        stats[split] = {"rows": len(idx), "positives": sum(rows[i]["label"] for i in idx),
                        "pos_rate": round(sum(rows[i]["label"] for i in idx) / max(len(idx), 1), 4)}

    # 泄漏自检：新 test 的样本应当全部来自与 train 不同的簇
    train_roots = {root_of[i] for i in assign["train"]}
    leak = sum(1 for i in assign["test"] if root_of[i] in train_roots)
    print(f"新划分 test={stats['test']['rows']} 条，与 train 同簇的泄漏条数：{leak}")

    meta = {
        "source": "data/data_process（EMSCAD），原划分被保留未改动",
        "method": "bottom-k MinHash(48) + Jaccard>=%.2f 并查集聚类，再按簇 8:1:1 分层分配" % args.threshold,
        "rows": len(rows),
        "clusters": len(clusters),
        "multi_row_clusters": sum(1 for c in clusters.values() if len(c) > 1),
        "largest_cluster": max(len(c) for c in clusters.values()),
        "mixed_label_clusters": len(mixed),
        "mixed_label_rows": mixed_rows,
        "splits": stats,
        "leak_rows": leak,
        "old_split_mapping": dict(Counter(r["old_split"] for r in rows)),
    }
    (args.out / "split_meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")

    for split in ("train", "dev", "test"):
        s = stats[split]
        print(f"{split:5s} rows={s['rows']:6d} 欺诈={s['positives']:4d}({s['pos_rate']:.2%}) -> {args.out / (split + '.txt')}")
    print(f"划分说明 {args.out / 'split_meta.json'}")


if __name__ == "__main__":
    main()
