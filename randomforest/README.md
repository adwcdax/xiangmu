# 中文电诈识别 · 随机森林（XGBoost）链路

jieba 分词 + TF-IDF + XGBoost 的 10 类分类链路，与 `fasttext/` 共用同一份数据与标签体系。

## 快速开始

```bash
python -m pip install -r randomforest/requirements.txt

python -X utf8 randomforest/data_processing.py          # 1) 分词 -> processing/*.csv
RF_DEVICE=cuda python -X utf8 randomforest/train.py     # 2) 训练（无 GPU 用 cpu）
python -X utf8 randomforest/evaluate.py                 # 3) 评估
python -X utf8 randomforest/api.py                      # 4) 起服务（默认 8000）
```

## 指标（test 53,281 条）

| 指标 | 值 |
|---|---|
| 准确率 | 0.8483 |
| macro-F1 | 0.7076 |
| weighted-F1 | 0.8515 |
| 二分类欺诈 F1 | 0.9778 |

对比 fastText（acc 0.8654 / macro-F1 0.7365）：整体略低，但少数类召回更高。

## 文档

- [技术文档](docs/技术文档-随机森林.md)
- [评估文档](docs/评估文档-随机森林.md)（含与 fastText 的逐类对比）
- [API 文档](docs/API文档-随机森林.md)

## 说明

- 数据路径统一由 `config.py` 解析，指向 `data/zh_data_process/`，不复制数据。
- `processing/`（分词 CSV）与 `models/`（模型、指标、混淆矩阵）不入库，按上面命令重新生成。
