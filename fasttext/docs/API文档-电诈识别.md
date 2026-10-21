# API 文档 · 中文电诈识别

## 1. 访问方式

| 环境 | 地址 |
|---|---|
| 线上 | `https://job-scam-detector.app.workbuddy.host` |
| 本地 | `http://127.0.0.1:8000`（`PORT=8000 python fasttext/api_zh/app.py`） |

线上所有请求必须带分享码：`?sharecode=HIF2O7TOW3`，否则网关返回“链接不完整”。

启动服务：

```bash
python -m pip install -r fasttext/api_zh/requirements.txt
PORT=8000 python fasttext/api_zh/app.py
```

## 2. 接口一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查，返回模型名、类别数、阈值 |
| GET | `/labels` | 类别表（id 与名称） |
| POST | `/predict` | 单条或批量识别 |
| GET | `/` | 浏览器测试页 |

## 3. GET /health

```bash
curl "https://job-scam-detector.app.workbuddy.host/health?sharecode=HIF2O7TOW3"
```

```json
{"status": "ok", "model": "fasttext_zh_fraud.bin", "classes": 10, "threshold": 0.5}
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

### 5.1 单条

```json
{"text": "您的快递丢失，请加客服微信理赔，需先缴纳保证金。", "top_k": 3}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `text` | string | 单条必填 | 待判定文本，原始输入即可（服务端自行清洗） |
| `top_k` | int | 否 | 返回前 K 个类别，默认 3 |
| `items` | array | 批量时必填 | 每项含 `text` |

### 5.2 批量

```json
{"items": [{"text": "..."}, {"text": "..."}], "top_k": 2}
```

单次建议 ≤ 500 条。

### 5.3 响应

```json
{
  "label": "冒充电商物流客服类",
  "label_id": 4,
  "is_fraud": true,
  "p_fraud": 1.0,
  "threshold": 0.5,
  "top_k": [
    {"label": "冒充电商物流客服类", "prob": 1.0},
    {"label": "虚假购物、服务类", "prob": 0.0},
    {"label": "虚假信用服务类", "prob": 0.0}
  ]
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `label` | string | 概率最高的类别 |
| `label_id` | int | 类别编号，对应 `/labels` |
| `is_fraud` | bool | `p_fraud >= threshold` |
| `p_fraud` | float | 非“无风险”的总概率 = 1 − p(无风险) |
| `threshold` | float | 当前阈值，默认 0.5，可用环境变量 `THRESHOLD` 覆盖 |
| `top_k` | array | 前 K 类及概率 |
| `warnings` | array | 提示信息，如文本过短（<30 字）时给出告警 |

批量返回：

```json
{"count": 2, "results": [{...}, {...}]}
```

## 6. 示例

### curl

```bash
curl -X POST "https://job-scam-detector.app.workbuddy.host/predict?sharecode=HIF2O7TOW3" \
  -H "Content-Type: application/json" \
  -d '{"text":"您的快递丢失，请加客服微信理赔，需先缴纳保证金。","top_k":3}'
```

### Python

```python
import requests

URL = "https://job-scam-detector.app.workbuddy.host/predict?sharecode=HIF2O7TOW3"

def detect(text: str, top_k: int = 3) -> dict:
    r = requests.post(URL, json={"text": text, "top_k": top_k}, timeout=15)
    r.raise_for_status()
    return r.json()

print(detect("您的快递丢失，请加客服微信理赔，需先缴纳保证金。"))
# {'label': '冒充电商物流客服类', 'is_fraud': True, 'p_fraud': 1.0, ...}
```

## 7. 阈值与业务用法

`p_fraud = 1 − p(无风险)`，默认阈值 0.5。测试集上：

| 使用方式 | 建议 |
|---|---|
| 工单分流 | 直接用 `label`，人工确认；top-2 覆盖 94% |
| 预标注 | 用 `label` 打标，人工只改错的 |
| 对外提示类型 | 仅限强类（无风险/投资理财/公检法），弱类只给 `top_k` 候选 |
| 风险分级 | 不可用：分数高度饱和，58.6% 样本 `p_fraud ≥ 0.9` |

## 8. 限制与注意事项

1. **适用域**：中文电诈短信 / 对话 / 案情描述。**不要用于招聘岗位审核**——实测在该域区分度仅 1.2 个百分点。
2. **概率不可当风险分**：模型输出校准良好（ECE 0.01），但分布集中，阈值只能区分“明显正常”与“其他”。
3. **弱类不可单独采信**：婚恋交友 F1 0.469、电商客服 0.643、军警购物 0.628。
4. **无状态**：服务不落库、不留存请求内容；单条毫秒级，批量 500 条约 1 秒。
5. 线上应用与英文招聘模型共用同一个发布应用，**重新发布会覆盖对方**，两者不能同时在线。
6. **短文本不可靠**：短于 30 字的输入会被判为「无风险」（训练语料中位 121 字），响应里会带 `warnings`。
7. **无「刷单返利类」**：刷单话术归入「虚假网络投资理财类」（语料中占 83.9%）。
