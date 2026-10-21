# API 文档 · 中文电诈识别（随机森林 / XGBoost）

## 1. 启动

```bash
python -m pip install -r randomforest/requirements.txt
PORT=8000 python -X utf8 randomforest/api.py
```

前置条件：`randomforest/models/rf_model.json` 与 `tfidf_vectorizer.pkl` 存在
（由 `randomforest/train.py` 生成）。

| 环境变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 8000 | 服务端口，绑定 0.0.0.0 |
| `THRESHOLD` | 0.5 | 仅用于对比 `p_fraud`，不参与判定（见第 5 节） |

## 2. 接口一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 模型名、类别数、阈值 |
| GET | `/labels` | 10 类 id 与名称 |
| POST | `/predict` | 单条或批量识别 |
| GET | `/` | 浏览器测试页 |

## 3. GET /health

```json
{"status": "ok", "model": "rf_model.json", "classes": 10, "threshold": 0.5}
```

## 4. GET /labels

```json
{"labels": [
  {"id": 0, "name": "无风险"},
  {"id": 1, "name": "虚假网络投资理财类"},
  {"id": 2, "name": "虚假信用服务类"},
  {"id": 3, "name": "虚假购物、服务类"},
  {"id": 4, "name": "冒充电商物流客服类"},
  {"id": 5, "name": "冒充领导、熟人类"},
  {"id": 6, "name": "冒充公检法及政府机关类"},
  {"id": 7, "name": "网络婚恋、交友类"},
  {"id": 8, "name": "网黑案件"},
  {"id": 9, "name": "冒充军警购物类诈骗"}
]}
```

## 5. POST /predict

### 5.1 请求

```json
{"text": "您的快递丢失，请加客服微信理赔，需先缴纳保证金。", "top_k": 3}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `text` | string | 单条必填 | 待判定文本 |
| `top_k` | int | 否 | 返回前 K 类，默认 3 |
| `items` | array | 批量时必填 | `[{"text": "..."}, ...]` |

批量：

```json
{"items": [{"text": "..."}, {"text": "..."}], "top_k": 2}
```

### 5.2 响应

```json
{
  "label": "虚假信用服务类",
  "label_id": 2,
  "is_fraud": true,
  "p_fraud": 0.9987,
  "threshold": 0.5,
  "top_k": [
    {"label": "虚假信用服务类", "prob": 0.7912},
    {"label": "冒充电商物流客服类", "prob": 0.1541}
  ],
  "warnings": []
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `label` | string | 概率最高的类别 |
| `label_id` | int | 类别编号，对应 `/labels` |
| `is_fraud` | bool | **判定依据：`label_id != 0`**（argmax 结果） |
| `p_fraud` | float | `1 − p(无风险)`，**仅作参考**，不可当风险分 |
| `threshold` | float | 阈值常量，用于识别 `p_fraud` 与判定是否一致 |
| `top_k` | array | 前 K 类及概率 |
| `warnings` | array | 短文本提示、`p_fraud` 与判定不一致提示 |

批量返回 `{"count": 2, "results": [{...}, {...}]}`。

### 5.3 为什么 `p_fraud` 不能当判定依据

类别加权训练会让 9 个诈骗类的概率之和偏大。实测一条正常银行短信：

```json
{"label": "无风险", "label_id": 0, "is_fraud": false, "p_fraud": 0.6559,
 "warnings": ["p_fraud 与类别判定不一致（类别加权所致），以 label 为准"]}
```

`top-1` 是无风险，但 `p_fraud` 却到了 0.66。因此判定以 argmax 为准，
`p_fraud` 只用于排查和对比 fastText 链路。

## 6. 示例

### curl

```bash
curl -X POST "http://127.0.0.1:8000/predict" \
  -H "Content-Type: application/json" \
  -d '{"text":"您的快递丢失，请加客服微信理赔，需先缴纳保证金。","top_k":3}'
```

### Python

```python
import requests

def detect(text: str, top_k: int = 3) -> dict:
    r = requests.post("http://127.0.0.1:8000/predict",
                      json={"text": text, "top_k": top_k}, timeout=15)
    r.raise_for_status()
    return r.json()

print(detect("您的快递丢失，请加客服微信理赔，需先缴纳保证金。"))
```

## 7. 限制

1. **仅适用于中文电诈文本**（短信 / 对话 / 案情描述），跨域（如招聘岗位帖）无区分能力。
2. **不要用 `p_fraud` 做风险分级**，它被类别加权抬高了；需要风险分时请用 fastText 链路的输出。
3. **短文本（<30 字）不可靠**，响应会带 `warnings`。
4. 弱类（婚恋交友精确率 0.348）不适合直接对外提示，建议只给 `top_k` 候选。
5. 服务无状态，不落库、不留存请求内容；单条推理为毫秒级。
