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
| `data_process.py` | 主脚本：清洗 description → 分层随机 8:1:1 切分 → 落盘 |
| `train.txt` / `dev.txt` / `test.txt` | 每行 `文本\t标签`，14304 / 1788 / 1788 行，欺诈占比 4.84%/4.87%/4.81% |
| `class.txt` | 标签表：`legitimate`、`fraudulent`（行号即标签值） |
| `stopwords.txt` | 英文停用词 318 个（sklearn ENGLISH_STOP_WORDS，对应蓝本中文停用词表） |
| `config.py` | 路径配置类（同蓝本） |
| `dataEDA.py` | 探索性分析（同蓝本） |
| `verify_output.py` | 机械校验：物理行数/单 tab/标签合法/读取口径，全 PASS |
| `manifest.json` | 处理参数、seed、切分统计、清洗策略留痕 |

## 处理口径

1. **文本字段**：仅 `description`（单字段，对齐蓝本"一文本一标签"；title/多字段拼接版留待后续按需生成）。
2. **清洗**：HTML 实体解码（`&amp;`/`&#8221;` 等，3923 行含实体）→ nbsp 转空格 → 全部断行类字符
   （`\n \r \v \f \x85 \u2028 \u2029`）归一为单空格，保证一条记录一个物理行。
3. **URL 掩码**：项目文档写的 `#URL_hash#` 形态与本 Zenodo 版不符——该发行版已还原真实 URL，
   无掩码 token（仅 1 行有 `#default#`），原样保留、不做处理。
4. **切分**：按 `fraudulent` 分层，seed=20261020，8:1:1。重复泄漏审计（minhash 去重再分组切分）
   属项目 P1/S5 阶段，本阶段未做，当前分数口径与 Kaggle 榜可比但与"去重后真实分数"不可比。
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
