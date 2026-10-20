# 中文招聘型骗局语料（电诈统一表筛选）— 蓝本样式 01-data

从**中文电诈语料统一表**里筛出招聘场景的语料，做成二分类训练集。样式对齐
`E:\heima_python\NLP\tmf\01-data` 与本项目 `../data_process`（英文 EMSCAD）。

标签：`0=无风险`、`1=欺诈`（见 `class.txt`，行号即标签值）。

## 数据来源与复现链

分两层，与英文侧 `../data_process` 同构：

```
189MB 全表(未入库) --export_raw_zh.py--> data/raw_zh/recruit_fraud_wide.csv --data_process_zh.py--> train/dev/test.txt
                                         (仓库内 raw 层, 52,058 行 × 13 列, 正文未清洗)
```

| 层 | 文件 | 大小 | sha256 |
|---|---|---|---|
| 上游全表 | `中文电诈语料_统一表.csv`（**未入库**，超 GitHub 100 MB 硬限） | 189 MB | `710da892…7ffae2` |
| 仓库内 raw | `../raw_zh/recruit_fraud_wide.csv` | 30,614,450 B | `206528a0…3b0c2e1` |

全表上游：CCL23-Eval 任务6 衍生集 `Abooooo/FGRC-SCD`，**文本为 LLM 合成，非真实查获语料**。

- 上游 352,836 行 × 13 列；`../raw_zh/manifest_raw.json` 记全表指纹、关键词表与口径敏感性。
- **clone 后即可复跑 step 2**（只需仓库内宽表）；只有重做筛选（step 1）才需自备同指纹的 189 MB 全表。
- `中文电诈对话_JSONL.txt` **未使用**：实测其 159,843 条 `sample_id` 与全表的 dialog 子集完全相等、
  文本逐字相同（抽样 3,000 条 100% 一致），它是同一批数据的另一种序列化，再用一次只会制造重复。
- 改造为两层后重跑 step 2，`train/dev/test/index.tsv` 四个产物的 sha256 与单层版本**逐字节一致**。

## 筛选口径（C1 ∪ C3）

上游 10 个标签里**没有"招聘诈骗"类**（最贴近的「刷单返利类」在衍生集中缺失），故用关键词构造子集：

- **C1 招聘语境词**：招聘 / 求职 / 面试 / 入职 / 岗位 / 简历 / 试岗 / 内推 / 录用 / 直招 / 招工 /
  求职者 / 用人单位 / 试用期 / 上班
- **C3 刷单兼职词**：兼职 / 刷单 / 日结 / 打字员 / 手工活 / 一单一结 / 做任务 / 接单 / 点赞员 /
  返利 / 佣金
- 入选 = 命中 C1 **或** C3。

**关键词只决定"是否属于招聘域"，不决定标签**；欺诈/无风险的极性一律取上游 `label_slug`
（`benign` → 0，其余 9 类 → 1），避免用规则给标签造成循环论证。

口径敏感性（同一份数据、四种口径，实测行数）：

| 口径 | 行数 | 欺诈 | 无风险 |
|---|---|---|---|
| C1 仅招聘词 | 6,571 | 3,924 | 2,647 |
| C2 招聘∧(兼职要件) | 2,435 | 1,773 | 662 |
| C3 仅刷单兼职词 | 47,822 | 37,124 | 10,698 |
| **C1 ∪ C3（本集）** | **52,058** | **39,358** | **12,700** |
| C4 三组并集 | 61,478 | 47,541 | 13,937 |

## 切分：沿用上游 split，未重新随机

上游成品表已做过分组切分，实测**全表 `group` 不跨 split（0 例）**，因此直接沿用其 `train/dev/test`，
不再随机重切（重切反而会引入近重复泄漏）。各切分欺诈占比一致：

| split | 行数 | 欺诈 | 欺诈占比 |
|---|---|---|---|
| train | 36,291 | 27,444 | 75.62% |
| dev | 7,845 | 5,900 | 75.21% |
| test | 7,922 | 6,014 | 75.92% |

## 本目录文件

| 文件 | 说明 |
|---|---|
| `export_raw_zh.py` | Step 1：189 MB 全表 → 仓库内招聘域宽表（需自备源表才跑得动） |
| `data_process_zh.py` | Step 2：宽表 → 清洗 → 按上游 split 落盘 |
| `train.txt` / `dev.txt` / `test.txt` | 每行 `文本\t标签`（LF 行尾，一条记录一个物理行） |
| `class.txt` | `无风险` / `欺诈` |
| `stopwords.txt` | 中文停用词（复用蓝本 `tmf/01-data/stopwords.txt`） |
| `index.tsv` | 行级溯源：`split/line_no/sample_id/label/label_zh/modality/group/case_id`，供泄漏审计 |
| `config.py` / `dataEDA.py` | 同蓝本 |
| `verify_output.py` | 机械校验（行数/单 tab/标签/LF/读取口径/跨 split 组/重复 id） |
| `manifest.json` | 口径、关键词表、敏感性数字、指纹、留痕 |

## 已知局限（做结论前先看这里）

1. **合成语料**：文本由 LLM 生成，训练结果只代表合成话术分布，不等于 58同城真实分布。
   真实中文招聘数据在 ORFD（7,392 标注 / 434 欺诈），成品在
   `D:\dsh_projects\job-scam-audit\数据\成品数据集\中文虚假招聘_*.txt`。
2. **子类高度集中**：欺诈侧 39,358 条里 36,536 条（92.8%）来自`虚假网络投资理财类`——
   本质是"刷单引流+投资理财"话术，`label_zh` 粒度在本集内基本不可分，别拿它做多分类。
3. **正负失衡 3.1:1**：本集欺诈占 75.6%，与部署场景（少数骗局）相反。评估请用 macro-F1 +
   欺诈类 precision/recall 单列，别只看 accuracy；必要时训练侧做类别权重或降采样。
4. **sms 与 dialog 混在一起**：dialog 平均约 288 字、sms 约 78 字，长度与模态强相关，
   模型可能靠长度捷径判类。做消融时至少出一版"只用 sms"和"按长度分层"的对照。

## 下游读取注意（重要）

```python
import csv, pandas as pd
data = pd.read_csv("train.txt", sep="\t", names=["text", "label"],
                   dtype={"text": str}, keep_default_na=False,
                   quoting=csv.QUOTE_NONE, encoding="utf-8")   # QUOTE_NONE 必须
```
行尾策略由仓库根 `.gitattributes` 锁定（本目录 `text eol=lf`，原始 CSV 目录 `binary`），
不要单独关 `core.autocrlf` 绕过。

## 复跑

```bash
python -X utf8 data_process_zh.py   # Step 2, 只用仓库内宽表, clone 后即可跑
python -X utf8 dataEDA.py
python -X utf8 verify_output.py     # 期望 OVERALL: PASS

python -X utf8 export_raw_zh.py     # Step 1, 仅重做筛选时需要: 要自备 189MB 全表
```
