# 招聘广告欺诈检测（fastText）

基于 EMSCAD 真实招聘广告语料的中文/英文岗位欺诈二分类项目。核心做法是
**fastText 监督分类 + 结构化字段特征 + 按近重复组切分**，并把模型封装成在线 HTTP 接口。

仓库包含两个部分：

| 子项目 | 语言 | 任务 | 入口 |
|---|---|---|---|
| 招聘广告欺诈检测 | 英文 | 二分类（正常 / 欺诈） | `fasttext/src/` + `fasttext/api/` |
| 中文电诈识别 | 中文 | 10 类多分类（无风险 + 9 类手法） | `fasttext/experiments/zh_fraud/` + `fasttext/api_zh/` |

中文电诈部分见 [技术文档](fasttext/docs/技术文档-电诈识别.md)、[评估文档](fasttext/docs/评估文档-电诈识别.md)、[API 文档](fasttext/docs/API文档-电诈识别.md)。

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
  data_process/                 英文清洗与组级切分产物
  zh_data_process/              中文电诈语料（352,836 条 / 10 类）
data_0/                         中文电诈原始语料（189MB，不入库）
fasttext/
  src/                          英文招聘模型：paths / prepare / prepare_features / train / predict
  api/                          英文招聘 API（FastAPI）
  api_zh/                       中文电诈 API（FastAPI）
  experiments/zh_fraud/         中文电诈：建集、训练、自切分、校准、域混合实验
  models/  models_zh/           训练产物（不入库）
  docs/                         技术文档、评估文档、API 文档（中英各三份）
  requirements.txt              训练依赖
```

## 快速开始

```bash
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r fasttext/requirements.txt

# 1) 正文 -> fastText 格式（输出 models/data）
.venv/Scripts/python.exe -X utf8 fasttext/src/prepare.py

# 2) 拼结构化特征（输出 models/data_feat）
.venv/Scripts/python.exe -X utf8 fasttext/src/prepare_features.py

# 3) 训练与评估（模型与指标写到 models/）
.venv/Scripts/python.exe -X utf8 fasttext/src/train.py --data-dir models/data_feat --model-dir models

# 4) 单条推理
.venv/Scripts/python.exe -X utf8 fasttext/src/predict.py --text "Work from home, earn $3000/week, pay a $50 fee"
```

模型文件不入库（`models/`、`api/model/*.bin` 已在 `.gitignore` 中），
部署 API 前需先跑训练，或把训练好的模型放到 `api/model/fasttext_en_feat_os3.bin`。

## 在线接口

服务启动后提供 `/health` 与 `/predict`，契约见 [docs/API.md](fasttext/docs/API.md)。

```bash
curl -X POST "http://127.0.0.1:8000/predict" -H "Content-Type: application/json" \
  -d '{"text":"...","fields":{"has_company_logo":0,"company_profile":"","salary_range":""}}'
```

## 数据来源

- 原始语料：EMSCAD（Vidros et al., *Future Internet* 9(1):6, 2017），Kaggle 发行版标注 CC0。
- 切分脚本与指纹见 `data/data_process/manifest.json`、`data/data_process/leakage_report.json`。

## 文档

- [技术说明](fasttext/docs/技术说明.md)：数据链、切分策略、特征工程、指标与已知局限
- [API 文档](fasttext/docs/API.md)：接口定义、字段说明、调用示例
