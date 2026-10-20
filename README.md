# 招聘广告欺诈检测（fastText）

基于 EMSCAD 真实招聘广告语料的中文/英文岗位欺诈二分类项目。核心做法是
**fastText 监督分类 + 结构化字段特征 + 按近重复组切分**，并把模型封装成在线 HTTP 接口。

## 结果速览

测试集 1,785 条（欺诈 86 条，占 4.82%），阈值 0.09（在 dev 上选定）：

| 方案 | PR-AUC | 精度 | 召回 | F1 |
|---|---|---|---|---|
| 仅正文 | 0.4266 | 0.500 | 0.314 | 0.386 |
| **正文 + 结构化字段** | **0.5457** | **0.597** | **0.465** | **0.523** |
| 仅结构化字段 | 0.3770 | 0.329 | 0.547 | 0.410 |

按推送量看（同一模型）：Top-20 命中 95%（19/20）、Top-50 命中 66%（33/50）、
Top-100 命中 47%（47/100），基线正例率仅 4.82%。

> 结论：适合做**审核队列排序**（高精度、低召回），不适合直接自动下架。

## 目录结构

```
data/
  raw/fake_job_postings.csv     原始 EMSCAD 数据（17,880 × 18）
  data_process/                 清洗与组级切分产物（train/dev/test.txt、index.tsv、leakage_report.json）
src/
  paths.py                      统一路径（读 data/data_process/config.py）
  prepare.py                    正文清洗 -> fastText 格式
  prepare_features.py           结构化字段 -> 特征 token，拼接到正文
  train.py                      训练 + 评估（多组超参按 dev PR-AUC 选优）
  resplit.py                    按近重复簇重新切分（泄漏自检）
  predict.py                    单条推理
api/
  app.py                        FastAPI 服务（/health、/predict、测试页）
  features.py                   推理端特征拼接（与训练同逻辑）
  vocab.json                    行业/职能词表快照
  requirements.txt              服务依赖
  model/                        模型文件（不入库，见下）
docs/
  技术说明.md                    数据、切分、特征、模型、评估与局限
  API.md                        接口文档
```

## 快速开始

```bash
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt

# 1) 正文 -> fastText 格式（输出 models/data）
.venv/Scripts/python.exe -X utf8 src/prepare.py

# 2) 拼结构化特征（输出 models/data_feat）
.venv/Scripts/python.exe -X utf8 src/prepare_features.py

# 3) 训练与评估（模型与指标写到 models/）
.venv/Scripts/python.exe -X utf8 src/train.py --data-dir models/data_feat --model-dir models

# 4) 单条推理
.venv/Scripts/python.exe -X utf8 src/predict.py --text "Work from home, earn $3000/week, pay a $50 fee"
```

模型文件不入库（`models/`、`api/model/*.bin` 已在 `.gitignore` 中），
部署 API 前需先跑训练，或把训练好的模型放到 `api/model/fasttext_en_feat_os3.bin`。

## 在线接口

服务启动后提供 `/health` 与 `/predict`，契约见 [docs/API.md](docs/API.md)。

```bash
curl -X POST "http://127.0.0.1:8000/predict" -H "Content-Type: application/json" \
  -d '{"text":"...","fields":{"has_company_logo":0,"company_profile":"","salary_range":""}}'
```

## 数据来源

- 原始语料：EMSCAD（Vidros et al., *Future Internet* 9(1):6, 2017），Kaggle 发行版标注 CC0。
- 切分脚本与指纹见 `data/data_process/manifest.json`、`data/data_process/leakage_report.json`。

## 文档

- [技术说明](docs/技术说明.md)：数据链、切分策略、特征工程、指标与已知局限
- [API 文档](docs/API.md)：接口定义、字段说明、调用示例
