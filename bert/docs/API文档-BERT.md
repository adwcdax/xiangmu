# API 文档 · BERT 链路

与 `fasttext/api_zh`、`randomforest/api.py` 使用**同一套 legacy 契约**，web 前端可无缝切换。

## 1. 启动

```bash
python -m pip install -r bert/requirements.txt

# 模型权重不入库，先按 README 导出到 bert/model/
PORT=8000 python -X utf8 bert/api.py
```

| 环境变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 8000 | 监听端口 |
| `MODEL_DIR` | `bert/model` | 模型目录（含 config.json） |
| `THRESHOLD` | 0.5 | `p_fraud` 判定阈值 |
| `DEVICE` | 自动 | `cuda` / `cpu` |
| `MAX_LEN` | 192 | 最大 token 长度，**须与训练一致** |

首次启动加载权重约 20–40 秒（GPU）。若模型目录缺 `config.json`，
服务会直接退出并提示导出步骤。

## 2. 接口一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查，含模型名、链路、类别数、设备 |
| GET | `/labels` | 类别表 |
| GET | `/metrics` | dev / test 评估指标 |
| POST | `/predict` | 单条或批量识别 |
| GET | `/` | 浏览器测试页 |

## 3. GET /health

```bash
curl http://127.0.0.1:8000/health
```

```json
{
  "status": "ok",
  "model": "bert_zh_fraud",
  "chain": "bert",
  "classes": 10,
  "threshold": 0.5,
  "device": "cuda",
  "max_len": 192,
  "uptime_s": 42.5,
  "version": "1.0"
}
```

`model` 固定返回 `bert_zh_fraud`。web 前端按模型名区分链路
（见 `web/src/api/legacyZhClient.ts`），如需前端显示为 BERT 链路，
需在该文件补 `bert` 分支——目前它只识别 `fasttext` 与 `rf|forest|xgb`。

## 4. GET /labels

```json
{"labels": [
  {"id": 0, "name": "无风险", "is_fraud": false},
  {"id": 1, "name": "虚假网络投资理财类", "is_fraud": true},
  {"id": 2, "name": "虚假信用服务类", "is_fraud": true},
  {"id": 3, "name": "虚假购物、服务类", "is_fraud": true},
  {"id": 4, "name": "冒充电商物流客服类", "is_fraud": true},
  {"id": 5, "name": "冒充领导、熟人类", "is_fraud": true},
  {"id": 6, "name": "冒充公检法及政府机关类", "is_fraud": true},
  {"id": 7, "name": "网络婚恋、交友类", "is_fraud": true},
  {"id": 8, "name": "网黑案件", "is_fraud": true},
  {"id": 9, "name": "冒充军警购物类诈骗", "is_fraud": true}
]}
```

## 5. GET /metrics

```json
{
  "model": "bert_zh_fraud",
  "source": "metrics_full_test.json",
  "dev":  {"n": 53152, "accuracy": 0.8745, "macro_f1": 0.7628, "...": "..."},
  "test": {"n": 53281, "accuracy": 0.8730, "macro_f1": 0.7572, "...": "..."}
}
```

优先返回全量 test 口径（`metrics_full_test.json`），缺失时退回抽样口径。
若两个文件都没有，返回 `{"detail": "指标文件未随仓库提供"}`。

## 6. POST /predict

### 6.1 单条

```json
{"text": "您的快递丢失，请加客服微信理赔，需先缴纳保证金。", "top_k": 3}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `text` | string | 单条必填 | 原始文本，服务端不做分词清洗（BERT 用原文字符） |
| `top_k` | int | 否 | 返回前 K 类，默认 3 |
| `items` | array | 批量时必填 | 每项含 `text` |

### 6.2 批量

```json
{"items": [{"text": "..."}, {"text": "..."}], "top_k": 2}
```

批量走一次前向，比逐条快 5–8 倍。单次建议 ≤ 256 条
（GPU 显存与延迟的平衡点）。

### 6.3 响应

```json
{
  "label": "虚假信用服务类",
  "label_id": 2,
  "is_fraud": true,
  "p_fraud": 0.9994,
  "threshold": 0.5,
  "top_k": [
    {"label": "虚假信用服务类", "prob": 0.8951},
    {"label": "冒充电商物流客服类", "prob": 0.0785},
    {"label": "冒充公检法及政府机关类", "prob": 0.0135}
  ],
  "warnings": []
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `label` | string | 概率最高的类别 |
| `label_id` | int | 类别编号，对应 `/labels` |
| `is_fraud` | bool | `p_fraud >= threshold` |
| `p_fraud` | float | `1 − P(无风险)`，已夹到 [0,1] 避免 `-0.0` |
| `threshold` | float | 当前阈值 |
| `top_k` | array | 前 K 类及概率 |
| `warnings` | array | 文本 <30 字时返回短文本告警 |

批量返回：

```json
{"count": 2, "results": [{...}, {...}]}
```

## 7. 示例

### curl

```bash
curl -X POST http://127.0.0.1:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"text":"我是市公安局民警，你的银行卡涉嫌洗钱，请立即将资金转入安全账户配合调查。","top_k":3}'
```

### Python

```python
import requests

def detect(text: str, top_k: int = 3) -> dict:
    r = requests.post("http://127.0.0.1:8000/predict",
                      json={"text": text, "top_k": top_k}, timeout=15)
    r.raise_for_status()
    return r.json()

print(detect("我是市公安局民警，你的银行卡涉嫌洗钱，请立即将资金转入安全账户配合调查。"))
# {'label': '冒充公检法及政府机关类', 'is_fraud': True, 'p_fraud': 0.9996, ...}
```

### 批量

```python
r = requests.post("http://127.0.0.1:8000/predict", json={
    "items": [{"text": t} for t in texts], "top_k": 2}, timeout=60)
for item in r.json()["results"]:
    print(item["label"], item["p_fraud"])
```

## 8. 阈值与业务用法

`p_fraud = 1 − P(无风险)`，默认 0.5。

| 使用方式 | 建议 |
|---|---|
| 工单分流 | 直接用 `label`，人工确认 |
| 预标注 | 用 `label` 打标，人工只改错的（塌回二分类 F1 0.985） |
| 对外提示类型 | 仅限强类（无风险 0.977 / 投资理财 0.914 / 公检法 0.849） |
| 风险分级 | 不可用：softmax 分布集中，不宜做连续打分 |
| 高 QPS 场景 | 换 `fasttext/api_zh`（40,000 条/s vs 本服务 490 条/s） |

## 9. 限制

1. **硬件依赖**：GPU 下 490–610 条/s；纯 CPU 只有 22 条/s，不适合在线高并发。
2. **冷启动**：加载权重 20–40 秒，部署时需配 `/health` 探活与足够启动宽限。
3. **权重不入库**：`bert/model/` 被 `.gitignore` 排除，部署前须先导出。
4. **域外无效**：仅适用中文电诈文本，招聘岗位等域外输入会高置信度误判。
5. **与 fastText 服务不能同时占同一端口**，需用不同 `PORT` 或反向代理分流。
6. **`MAX_LEN` 不要改**：改动会偏移输入分布，与训练口径不一致，准确率下降。
