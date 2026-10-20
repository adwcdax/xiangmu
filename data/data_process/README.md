# EMSCAD 英文虚假职位广告 — 数据处理（01-data 蓝本样式）

样式蓝本：`E:\heima_python\NLP\tmf\01-data`（搜狐新闻分类）。本项目为二分类：
`0=legitimate（真实） / 1=fraudulent（虚假）`。

## 数据来源

- 原始数据已入库：`data/raw/fake_job_postings.csv`（50,061,601 字节，< GitHub 100MB 上限，普通 commit 即可，无需 LFS）
- sha256：`59253295129d8b6a...e62bf60`（上游 Zenodo/HuggingFace/Kaggle 三镜像逐字节一致，处理脚本内置指纹校验）
- 上游：EMSCAD，Vidros et al., *Future Internet* 9(1):6, 2017（doi:10.3390/fi9010006），Kaggle 发行版标注 CC0
- 17,880 行 × 18 列，欺诈 866（4.84%）

## 本目录文件

| 文件 | 说明 |
|---|---|
| `../raw/fake_job_postings.csv` | 原始数据（只读，入库随仓库分发） |
| `data_process.py` | 主脚本：清洗 → 近重复归组 → **组级**分层切分 8:1:1 → 落盘 |
| `train.txt` / `dev.txt` / `test.txt` | 每行 `文本\t标签`，14276 / 1785 / 1785 行，欺诈 687 / 86 / 86 |
| `index.tsv` | 行级溯源：`split / line_no / job_id / group_id / label`（泄漏复核用） |
| `leakage_report.json` | 归组参数与统计、剔除清单、泄漏自检结果 |
| `class.txt` | 标签表：`legitimate`、`fraudulent`（行号即标签值） |
| `stopwords.txt` | 英文停用词 318 个（sklearn ENGLISH_STOP_WORDS，对应蓝本中文停用词表） |
| `config.py` | 路径配置类（同蓝本） |
| `dataEDA.py` | 探索性分析（同蓝本） |
| `verify_output.py` | 机械校验：行数/单 tab/标签/LF/读取口径 + **泄漏门禁**，全 PASS |
| `manifest.json` | 处理参数、seed、切分统计、清洗策略留痕 |

## 切分口径：组级切分（防近重复泄漏）

原始 17,880 条里有大量复制粘贴投放，**按行随机切分会把同一条广告同时切进 train 和 test**。
实测旧版随机切分：test 有 **23.43%（419/1788）** 的正文+标签与 train 完全一致，dev 22.15%。
现改为**组级切分**：

1. 完全重复先并组（3,280 行是逐字重复）；
2. MinHash（128 排列）+ LSH（16 带 × 8 行）取候选对，再对候选对做**精确词 3-gram Jaccard 复核**，
   ≥ 0.75 才并入同组（137,311 候选对 → 2,066 次实际合并，避免 LSH 误合并与链式过合并）；
3. 并查集归组 → 12,534 组（最大组 417 行 = 同一条 "Play with kids, get paid for it / Jobs in Asia"
   模板广告，组内两两 Jaccard 1.000；10,757 组为单例）；
4. **同一组绝不跨切分**，按标签分层装箱到 8:1:1；
5. 同一正文在上游被标了不同标签的 5 个冲突组（34 行）**整体剔除，不做猜测**。

结果：17,880 → 17,846 行（train 14,276 / dev 1,785 / test 1,785），欺诈 687 / 86 / 86，
dev·test 欺诈数均 ≥ 项目文档 P1 配额下限 40。
自检：跨切分组 = **0**、跨切分完全重复正文 = **0**（`verify_output.py` 独立复算，不采信自报数字）。

> train 内部仍保留完全重复（2,427 行），它们只影响训练加权、不会造成测试泄漏；
> 如需"训练集也去重"的版本，把 `group_stratified_split` 之后按组抽样即可，另行生成勿覆盖本口径。

## 处理口径

1. **文本字段**：仅 `description`（单字段，对齐蓝本"一文本一标签"；title/多字段拼接版留待后续按需生成）。
2. **清洗**：HTML 实体解码（`&amp;`/`&#8221;` 等，3923 行含实体）→ nbsp 转空格 → 全部断行类字符
   （`\n \r \v \f \x85 \u2028 \u2029`）归一为单空格，保证一条记录一个物理行。
3. **URL 掩码**：项目文档写的 `#URL_hash#` 形态与本 Zenodo 版不符——该发行版已还原真实 URL，
   无掩码 token（仅 1 行有 `#default#`），原样保留、不做处理。
4. **切分**：见上一节，组级分层切分（seed=20261020，8:1:1）。**本口径取代此前的随机分层版本**：
   旧版 test 有 23.43% 与 train 逐字相同，任何在旧 split 上跑出的分数一律作废，需重跑。
5. **空文本**：2 行 description 为空，保留为空文本行（`^<TAB>标签$`）。

## 下游读取注意（重要）

```python
import csv, pandas as pd
data = pd.read_csv("train.txt", sep="\t", names=["text", "label"],
                   dtype={"text": str}, keep_default_na=False,
                   quoting=csv.QUOTE_NONE)   # 必须！490 行文案含双引号，默认解析会吞行
```

## 复跑

```bash
python -X utf8 data_process.py    # 生成三切分 + class/stopwords/manifest
python -X utf8 dataEDA.py         # 探索性分析
python -X utf8 verify_output.py   # 机械校验（期望 OVERALL: PASS）
```

## 行尾约定（跨平台必读）

本仓库 `core.autocrlf` 可能为 `true`，会把文本文件行尾在 LF/CRLF 之间改写。仓库根 `.gitattributes`
已锁定策略：`data/raw/*.csv` 标 `binary`（保证 sha256 指纹跨平台逐字节稳定），本目录文本标 `eol=lf`。

- 新 clone 后 `verify_output.py` 应直接 PASS。
- 若你在 `.gitattributes` 合入**之前**就已 clone 过：工作区的 txt 仍是 CRLF，会报 `crlf=... FAIL`。
  执行 `git pull` 后重跑一次 `python -X utf8 data_process.py` 即可（或删掉三个 txt 再 `git checkout -- .`）。
- 不要单独关掉 `core.autocrlf` 绕过，策略以 `.gitattributes` 为准。
