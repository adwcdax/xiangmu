# 中文电诈识别（fastText + 随机森林 + BERT）

对中文电诈文本做 **10 类分类**（无风险 + 9 类诈骗手法），提供三条可对比的模型链路，
并把模型封装成同一套在线 HTTP 接口。

## 结果速览

测试集 53,281 条（诈骗 32,173，占 60.4%）：

| 指标 | dev（53,152） | test（53,281） |
|---|---|---|
| 准确率 | 0.8653 | **0.8654** |
| macro-F1 | 0.7417 | **0.7365** |
| weighted-F1 | 0.8637 | 0.8637 |
| top-2 准确率 | 0.9215 | **0.9397** |
| 二分类（诈骗/无风险） | 0.9807 / F1 0.9840 | 0.9799 / **F1 0.9833** |

逐类 F1：无风险 0.975、投资理财 0.906、公检法 0.828、信用服务 0.764、领导熟人 0.740、
购物服务 0.713、网黑 0.698、电商客服 0.643、军警购物 0.628、婚恋交友 0.469。

> 强类可用于分流与预标注；弱类（婚恋、电商客服、军警）只能出候选。
> 域外（如招聘岗位帖）无区分能力，见评估文档第 5 节。

## 三条模型链路

| 链路 | 特征 / 模型 | 入口 | 测试集 acc / macro-F1 | 吞吐（CPU/GPU） |
|---|---|---|---|---|
| fastText | 字级 n-gram + 线性 softmax | `fasttext/` | 0.8654 / 0.7365 | 40,000 条/s |
| 随机森林 | jieba + TF-IDF + XGBoost | `randomforest/` | 0.8483 / 0.7076 | 批量推理 |
| **BERT** | chinese-roberta-wwm-ext 微调 | `bert/` | **0.8747 / 0.7621** | 22 / 490 条/s |

三者共用 `data/zh_data_process/` 与同一套 10 类标签、同一套 API 契约，可直接对比选型。

- 随机森林：[技术](randomforest/docs/技术文档-随机森林.md) ·
  [评估](randomforest/docs/评估文档-随机森林.md) ·
  [API](randomforest/docs/API文档-随机森林.md)
- BERT：[README](bert/README.md) ·
  [技术](bert/docs/技术文档-BERT.md) ·
  [评估](bert/docs/评估文档-BERT.md) ·
  [API](bert/docs/API文档-BERT.md)

BERT 在全量 test 上比 fastText 高 0.0256 macro-F1，逐类全部上涨，
但推理慢两个数量级（GPU 490 条/s vs CPU 40,000 条/s）。
**离线批处理 / 预标注选 BERT，高 QPS 在线接口选 fastText。**

## 目录结构

```
data/
  zh_data_process/              中文电诈语料（352,836 条 / 10 类）
  data_process/                 英文 EMSCAD 清洗与切分产物（历史数据，保留）
  raw/fake_job_postings.csv     英文 EMSCAD 原始数据（历史数据，保留）
data_0/                         中文电诈原始语料（189MB，不入库）
fasttext/
  api_zh/                       在线服务：app.py / labels.json / requirements.txt
  experiments/zh_fraud/         建集、训练、自切分、概率校准、域混合实验
  docs/                         技术文档、评估文档、API 文档
  models_zh/                    训练产物（不入库）
  requirements.txt              训练依赖
randomforest/                   随机森林链路（TF-IDF + XGBoost）
  config.py / data_processing.py / train.py / evaluate.py / predict.py / api.py
  docs/                         技术 / 评估 / API 文档
  processing/  models/          中间产物与模型（不入库）
bert/                           BERT 链路（chinese-roberta-wwm-ext 微调）
  api.py                        在线服务（与 api_zh 同契约）
  export_model.py               训练检查点 -> HuggingFace 标准目录
  src/                          训练与评估脚本
  docs/                         技术 / 评估 / API 文档
  model/                        权重与配置（不入库，需自行导出）
web/                            演示页（Vite + TypeScript，含在线检测台与 10 个场景）
  src/api/                      v1 / legacy / mock 三种客户端
  src/scenes/                   S0–S9
  public/data/                  场景数据（缺失产物用固定种子 mock 并标记）
```

## 演示页

演示页在 `web/`，自动探测 API：优先 `/api/v1/*`，其次现有 `/health`、`/labels`、`/predict`，
都不可用时进入离线 mock。启动 API 后，首屏检测台直接使用真实模型输出。

```bash
# 终端 1：API（需先把训练好的模型放到 api_zh/model/）
PORT=8000 python fasttext/api_zh/app.py

# 终端 2：演示页
cd web
npm install
npm run dev        # http://127.0.0.1:5173
```

详见 [web/README.md](web/README.md)。

## 快速开始

```bash
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r fasttext/requirements.txt

# 1) 原始语料 -> 标准数据集目录（输出 data/zh_data_process）
.venv/Scripts/python.exe -X utf8 fasttext/experiments/zh_fraud/build_dataset_dir.py

# 2) 训练 + 评估（输出 fasttext/models_zh/）
.venv/Scripts/python.exe -X utf8 fasttext/experiments/zh_fraud/train_multiclass.py

# 3) 起服务
.venv/Scripts/python.exe fasttext/api_zh/app.py     # 默认 8000，读 PORT 环境变量
```

模型文件不入库（`fasttext/models_zh/`、`fasttext/api_zh/model/*.bin`、`bert/model/` 已在 `.gitignore` 中），
部署前需先跑训练，或把训练好的模型放到对应目录。

BERT 链路额外需要两步：

```bash
python -m pip install -r bert/requirements.txt
python -X utf8 bert/src/train_bert_multiclass.py --out-dir models_zh/bert
python -X utf8 bert/export_model.py --ckpt models_zh/bert/model.pt \n    --encoder D:/heima/model/chinese-roberta-wwm-ext --out bert/model
PORT=8001 python -X utf8 bert/api.py      # 与 fastText 同机不同端口
```

## 在线接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 模型名、类别数、阈值 |
| GET | `/labels` | 10 类 id 与名称 |
| POST | `/predict` | `{"text": "..."}` 或 `{"items": [...]}` |

```bash
curl -X POST "http://127.0.0.1:8000/predict" -H "Content-Type: application/json" \
  -d '{"text":"您的快递丢失，请加客服微信理赔，需先缴纳保证金。","top_k":3}'
```

契约见 [API 文档](fasttext/docs/API文档-电诈识别.md)。

## 文档

- **fastText**：[技术文档](fasttext/docs/技术文档-电诈识别.md) ·
  [评估文档](fasttext/docs/评估文档-电诈识别.md) ·
  [API 文档](fasttext/docs/API文档-电诈识别.md)
- **BERT**：[README](bert/README.md) ·
  [技术文档](bert/docs/技术文档-BERT.md) ·
  [评估文档](bert/docs/评估文档-BERT.md) ·
  [API 文档](bert/docs/API文档-BERT.md)

## 数据来源

- 中文电诈语料：`data_0/中文电诈语料_统一表.csv`（sha256 `710da892…`），352,836 条，10 类，
  按案件 `group` 切分，跨切分组 0、重复率 0%。
- 英文 EMSCAD 数据仍保留在 `data/raw` 与 `data/data_process`，对应的训练代码与文档已不在本仓库。

## 已知限制

1. 语料为合成/半合成，真实场景指标会下降；上线前需用 300~500 条真实样本做外部测试。
2. 短文本（<30 字）判定不可靠，接口会返回 `warnings`。
3. 标签体系无「刷单返利类」，刷单话术归入投资理财（占该类 83.9%）。
4. 概率高度饱和，不宜直接作风险分级。
5. 电商客服 / 信用服务 / 购物服务三类互混严重（BERT 上占 27.0%），属话术重叠，
   建议业务侧合并为「客服类诈骗」再细分。
