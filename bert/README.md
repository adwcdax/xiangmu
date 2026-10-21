# BERT 微调链路（中文电诈 10 分类）

在 `chinese-roberta-wwm-ext` 上微调，对中文电诈文本做 10 类分类（无风险 + 9 类手法），
是仓库里第三条链路，与 `fasttext/`、`randomforest/` 使用**同一份数据、同一套标签、同一套 API 契约**。

## 结果

全量 test 53,281 条，与 fastText 同口径对照：

| 指标 | fastText（`fasttext/`） | **BERT（本目录）** | 差值 |
|---|---|---|---|
| accuracy | 0.8654 | **0.8730** | +0.0076 |
| macro-F1 | 0.7365 | **0.7572** | +0.0207 |
| 塌回二分类 accuracy | 0.9799 | **0.9814** | +0.0015 |
| 塌回二分类 欺诈 F1 | 0.9833 | **0.9846** | +0.0013 |

逐类 F1（test，全部持平或上涨）：

| 类别 | fastText | BERT | 差值 |
|---|---|---|---|
| 无风险 | 0.975 | **0.977** | +0.002 |
| 虚假网络投资理财类 | 0.906 | **0.914** | +0.008 |
| 虚假信用服务类 | 0.764 | **0.770** | +0.006 |
| 虚假购物、服务类 | 0.713 | **0.740** | +0.026 |
| 冒充电商物流客服类 | 0.643 | **0.652** | +0.009 |
| 冒充领导、熟人类 | 0.740 | **0.775** | +0.035 |
| 冒充公检法及政府机关类 | 0.828 | **0.849** | +0.021 |
| 网络婚恋、交友类 | 0.469 | **0.512** | +0.043 |
| 网黑案件 | 0.698 | **0.717** | +0.019 |
| 冒充军警购物类诈骗 | 0.628 | **0.667** | +0.038 |

小类提升最明显（婚恋 +0.043、军警 +0.038、领导熟人 +0.035），因为逆频率损失权重
对长尾的补偿在预训练语义特征上比字 n-gram 更有效。

主要错误流仍是「冒充电商物流客服类 ↔ 虚假信用服务类 / 虚假购物服务类」互混
（该类召回 0.628，10 类里最低），属于话术本身重叠，不是模型容量问题。

## 成本对照

| | fastText | BERT |
|---|---|---|
| 训练时间 | 35 秒（CPU 32 线程） | 49 分钟（RTX 3060 6GB） |
| 模型体积 | 40.8 MB | 409 MB |
| CPU 推理 | 40,000 条/s | 22 条/s（45 ms/条） |
| GPU 推理 | — | 490–610 条/s（1.6–2.0 ms/条） |

**选型建议**：离线批处理、批量预标注用 BERT；高 QPS 在线接口用 fastText。
两者 API 完全一致，切换只改 `--model` 或反向代理指向。

## 准备模型

权重 409 MB 不入库（`.gitignore` 已排除 `bert/model/`）。拉下代码后需自行导出：

```bash
# 1) 训练（产出 models_zh/bert/model.pt）
python -X utf8 bert/src/train_bert_multiclass.py \
    --dataset-dir data/zh_data_process \
    --out-dir models_zh/bert

# 2) 导出成 HuggingFace 标准目录
python -X utf8 bert/export_model.py \
    --ckpt models_zh/bert/model.pt \
    --encoder D:/heima/model/chinese-roberta-wwm-ext \
    --out bert/model
```

产物 `bert/model/` 应含：`config.json`、`model.safetensors`、`tokenizer.json`、
`tokenizer_config.json`、`metrics_full_test.json`、`metrics_sampled12k.json`。
前五个缺一不可，指标文件用于 `/metrics` 接口。

底模需本地已下载 `chinese-roberta-wwm-ext`（HuggingFace）。离线环境直接用本地路径。

## 启动服务

```bash
python -m pip install -r bert/requirements.txt
PORT=8000 python -X utf8 bert/api.py
```

首次启动加载模型约 20–40 秒（GPU）或 10 秒（CPU）。健康检查：

```bash
curl http://127.0.0.1:8000/health
# {"status":"ok","model":"bert_zh_fraud","chain":"bert","classes":10,...,"device":"cuda"}
```

`model` 字段返回 `bert_zh_fraud`，web 前端按名称前缀区分链路。

## 训练细节

| 项 | 取值 |
|---|---|
| 底模 | `chinese-roberta-wwm-ext`（12 层，768 维） |
| 训练样本 | 128,000（按类分层抽样，seed=42） |
| 验证 / 测试 | dev 12,000 / test 12,000（抽样）；全量复评用 53,152 / 53,281 |
| 最大长度 | 192（语料 P95=92，仅 0.13% 被截断） |
| batch / 梯度累积 | 32 / 1 |
| 学习率 | 2e-5，5% 线性 warmup + 线性衰减 |
| epoch | 2（按 dev macro-F1 取最优） |
| 损失 | 交叉熵 + sqrt 逆频率类别权重（无风险权重归一为 1） |
| 混合精度 | fp16 autocast + GradScaler |
| 显存峰值 | 5.3 / 6 GB |

权重按 dev macro-F1 选，test 只在最后评估一次，避免测试集泄漏。

## 训练脚本参数

`bert/src/train_bert_multiclass.py` 常用参数：

| 参数 | 默认 | 说明 |
|---|---|---|
| `--dataset-dir` | `data/zh_data_process` | 数据集目录 |
| `--out-dir` | `models_zh/bert` | 产物目录 |
| `--encoder` | 本地 roberta 路径 | 底模 |
| `--train-size` | 128000 | 训练抽样条数 |
| `--dev-size` / `--test-size` | 12000 | 验证 / 测试抽样条数 |
| `--max-len` | 192 | 最大 token 长度 |
| `--epochs` | 2 | 训练轮数 |
| `--lr` | 2e-5 | 学习率 |
| `--batch-size` | 32 | 批大小 |
| `--freeze-layers` | 0 | 冻结前 N 层 encoder（省算力，代价是小类 F1） |
| `--smoke` | — | 400 条 1 轮，只验证流程 |
| `--eval-only` | — | 跳过训练，直接评估已有 `--out-dir/model.pt` |

### 已测配置对照

| 配置 | 训练量 | acc | macro-F1 | 耗时 |
|---|---|---|---|---|
| 32k × 1ep，len192 | 32k | 0.8455 | 0.7254 | 5.4 min |
| 110k × 2ep，len128，冻结 6 层 | 110k | 0.8629 | 0.7432 | 16.9 min |
| 128k × 2ep，len128 | 128k | 0.8687 | 0.7529 | 30.6 min |
| **128k × 2ep，len192（正式）** | 128k | **0.8730** | **0.7572** | 49 min |

冻结底层能省 40% 时间，但小类 F1 掉得更多；`max-len` 从 192 降到 128 几乎无损
（语料 P95=92），是性价比最高的省时手段。

## 目录结构

```
bert/
  api.py                       FastAPI 服务（与 api_zh 同契约）
  export_model.py              model.pt -> HuggingFace 标准目录
  requirements.txt             依赖
  README.md                    本文档
  src/
    train_bert_multiclass.py   训练 + 评估
    train_multiclass.py        fastText 对照（加了 --dataset-dir）
  docs/
    技术文档-BERT.md           模型与训练细节
    评估文档-BERT.md           逐类指标与错误分析
    API文档-BERT.md            接口说明
  model/                       权重与配置（不入库，需自行导出）
```

## 环境

- Python 3.12、torch 2.x、transformers 4.x
- GPU 可选；CPU 也能训练，但 128k × 2ep 需十余小时
- **numpy 必须 <2**：fastText 侧依赖该限制，同环境共存时不要升级
