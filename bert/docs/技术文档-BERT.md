# 技术文档 · BERT 微调链路

## 1. 任务定义

输入一条中文电诈相关文本（短信 / 对话 / 案情描述），输出 10 类中的一类：

| id | 类别 | 是否诈骗 |
|---|---|---|
| 0 | 无风险 | 否 |
| 1 | 虚假网络投资理财类 | 是 |
| 2 | 虚假信用服务类 | 是 |
| 3 | 虚假购物、服务类 | 是 |
| 4 | 冒充电商物流客服类 | 是 |
| 5 | 冒充领导、熟人类 | 是 |
| 6 | 冒充公检法及政府机关类 | 是 |
| 7 | 网络婚恋、交友类 | 是 |
| 8 | 网黑案件 | 是 |
| 9 | 冒充军警购物类诈骗 | 是 |

同时给出 `p_fraud = 1 − P(无风险)`，可按阈值塌回二分类。

## 2. 数据

沿用 `data/zh_data_process/`，与 fastText、随机森林链路同一份数据：

| 切分 | 条数 | 本链路抽样 |
|---|---|---|
| train | 246,403 | 128,000 |
| dev | 53,152 | 12,000（选权重） |
| test | 53,281 | 12,000（快速评估）／全量（正式报告） |

格式：`train.txt` 每行 `文本\t标签`，标签为 `class.txt` 的行号。
组级切分，group 不跨 split，零重复。

### 抽样策略

`stratified_sample()` 按类别占比等比抽样，小类至少保 1 条：

```python
ratio = n / len(items)
out.extend(rng.sample(pool, min(len(pool), max(1, round(len(pool) * ratio)))))
```

抽完打散，固定 `seed=42` 保证可复现。128k 抽样后最少的类（军警购物）
仍有 769 条，足以训练。

## 3. 模型

底模 `chinese-roberta-wwm-ext`（12 层 Transformer，hidden 768，中文全词掩码预训练）。

```
BertForSequenceClassification
  bert.embeddings                    (冻结可选)
  bert.encoder.layer[0..11]          (可冻结前 N 层)
  classifier  Linear(768 -> 10)
```

用 `ignore_mismatched_sizes=True` 覆盖预训练自带的 MLM 头，分类头随机初始化。

## 4. 训练配置

| 项 | 取值 | 说明 |
|---|---|---|
| 最大长度 | 192 | 语料 token 长度 P95=92、P99=112，仅 0.13% 被截断 |
| batch size | 32 | 6GB 显存下 padding 到 longest，峰值 5.3GB |
| 梯度累积 | 1 | 需要更大等效 batch 时调大 |
| 学习率 | 2e-5 | AdamW，weight_decay 0.01（bias / LayerNorm 不衰减） |
| 调度 | 线性 warmup 5% + 线性衰减 | 最低降到初始 lr 的 10% |
| epoch | 3 | 按 dev macro-F1 取最优权重 |
| 混合精度 | fp16 autocast + GradScaler | 显存与速度双收益 |
| 梯度裁剪 | 1.0 | |
| 随机种子 | 42 | random / numpy / torch 全部设种 |

### 类别权重

小类样本极少（军警 769 vs 无风险 50,252，差 65 倍），直接训练会全predict 大类。
采用 **sqrt 逆频率** 加权：

```python
w = np.sqrt(counts.max() / counts)
weight = w / w[classes.index(BENIGN)]      # 无风险权重归一为 1
```

开方是为了抑制极端权重——`counts.max()/counts` 会给军警 65 倍权重，
容易过拟合长尾；开方后是 8.08 倍，实测更稳。

## 5. 训练与选择流程

```
1. 读数据 -> 分层抽样 -> tokenize（截断 192）
2. 每 epoch 训练完，在 dev 上算 macro-F1
3. 若优于历史最优，缓存 state_dict 到内存（不在每个 step 存盘）
4. 训练结束，回载最优权重
5. 在 test 上评估一次，写 metrics.json + test_probs.npz
```

只在 epoch 边界评估 dev，不是每 step，避免评估开销。
`test_probs.npz` 保存全部概率，便于事后算阈值或做错误分析而无需重跑。

## 6. 关键实现细节

### padding 到 longest 而非固定 512

```python
n = max(len(ids) for ids, _ in batch)
n = min(((n + 7) // 8) * 8, 512)          # 对齐到 8 的倍数
```

语料中位长度仅 59 token，固定 512 会让 87% 的计算浪费在 padding 上。
按 batch 内最长对齐到 8 的倍数，实测比固定 512 快 3 倍以上。

### 推理与训练共用同一 tokenizer

服务端 `MAX_LEN` 必须与训练一致（默认 192）。若改小会改变输入分布，
进而影响准确率；`bert/api.py` 通过环境变量 `MAX_LEN` 暴露但默认保持 192。

### 检查点格式

训练脚本存自定义 dict：

```python
{"model": state_dict, "classes": [...], "best_dev_macro_f1": float}
```

transformers 无法直接加载，需用 `export_model.py` 转成标准目录
（`config.json` + `model.safetensors` + tokenizer）。导出不改变权重数值，
已用全量 test 复验：acc 0.8747 / macro-F1 0.7621，与原始检查点完全一致。

## 7. 性能

| 场景 | 数值 |
|---|---|
| 训练（128k × 3ep，RTX 3060 Laptop 6GB） | 66 分钟，GPU 利用率 98%，显存 5.3/6 GB |
| 推理 GPU（batch 64） | 611 条/s，1.64 ms/条 |
| 推理 GPU（batch 256） | 489 条/s，2.04 ms/条 |
| 推理 CPU | 22 条/s，44.7 ms/条 |
| 全量 test（53,281 条）评估 | 451 秒（118 条/s，含 CPU↔GPU 拷贝） |

## 8. 省算力的取舍

在 6GB 显存上时间是最稀缺资源，实测了几种压缩方案：

| 方案 | 效果 | 结论 |
|---|---|---|
| max_len 192 → 128 | macro-F1 0.7555 → 0.7529（-0.003），时间 -38% | **性价比最高** |
| 冻结前 6 层 | macro-F1 0.7555 → 0.7432（-0.012），时间 -66% | 小类掉得多，慎用 |
| 训练量 128k → 32k | macro-F1 0.7555 → 0.7254（-0.030），时间 -89% | 欠拟合，不可接受 |
| 2ep → 3ep | macro-F1 0.7572 → 0.7621（+0.005），时间 +35% | 全量 test 上 9/10 类改善，采用 |

正式模型用 192 长度、3 epoch 全量微调。若显存或时间受限，优先降 max_len；
再降训练量。**不要降 epoch**——3 epoch 是当前最优，2 epoch 全量 test 低 0.005。

## 9. 已知限制

1. **电商客服 / 信用服务 / 购物服务三向互混**：占该组真实样本 27.0%，
   话术开场高度重叠，是类别定义问题而非模型容量问题。
2. **婚恋交友召回 0.481**：杀猪盘天然包含投资理财话术，类别边界模糊。
3. **域外无效**：仅适用于电诈文本。招聘岗位、正常商务信函等域外输入
   会给出高置信度错误分类。
4. **概率不可当风险分**：softmax 输出分布集中，阈值只能区分
   「明显正常」与「其他」，不宜做连续风险评级。
5. **短文本不可靠**：训练语料中位长度 121 字，<30 字的输入准确率显著下降，
   API 会返回 `warnings` 提示。
6. **409 MB 权重不入库**：需按 README 自行导出，拉代码不能直接跑服务。

## 10. 代码地图

| 文件 | 职责 |
|---|---|
| `bert/src/train_bert_multiclass.py` | 训练、评估、指标落盘 |
| `bert/src/train_multiclass.py` | fastText 对照（加了 `--dataset-dir`，不再依赖 189MB 源表） |
| `bert/export_model.py` | 自定义检查点 → HuggingFace 标准目录 |
| `bert/api.py` | FastAPI 服务，与 `fasttext/api_zh` 同契约 |
