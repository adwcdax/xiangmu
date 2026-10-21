# API 文档

招聘欺诈检测服务，基于 fastText 模型 + 结构化字段特征。

## 1. 访问方式

| 环境 | 地址 |
|---|---|
| 线上 | `https://job-scam-detector.app.workbuddy.host` |
| 本地 | `http://127.0.0.1:8000`（`python api/app.py`，端口由 `PORT` 环境变量控制） |

线上部署带分享码校验，**所有请求都要带 `?sharecode=<你的分享码>`**，否则网关会返回
"链接不完整"。本地调试不需要。

服务启动：

```bash
python -m pip install -r api/requirements.txt
PORT=8000 python api/app.py
```

## 2. 接口一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查，返回模型名与当前阈值 |
| POST | `/predict` | 单条或批量预测 |
| GET | `/` | 极简测试页（浏览器里可直接试） |

## 3. GET /health

```bash
curl "https://job-scam-detector.app.workbuddy.host/health?sharecode=XXXX"
```

```json
{"status": "ok", "model": "fasttext_en_feat_os3.bin", "threshold": 0.09}
```

## 4. POST /predict

### 4.1 请求体：单条

```json
{
  "text": "Work from home, earn $3000 per week. No experience needed. Pay a $50 fee to start.",
  "fields": {
    "has_company_logo": 0,
    "company_profile": "",
    "salary_range": "",
    "telecommuting": 0,
    "has_questions": 0,
    "employment_type": "Full-time",
    "required_experience": "Entry level",
    "required_education": "High School or equivalent",
    "industry": "Marketing and Advertising",
    "function": "Marketing"
  }
}
```

### 4.2 请求体：批量

```json
{"items": [{"text": "...", "fields": {...}}, {"text": "..."}]}
```

单次建议 ≤ 500 条。

### 4.3 请求字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `text` | string | 单条时必填 | 岗位描述正文，原始文本即可（服务端自行清洗） |
| `fields` | object | 否，**强烈建议** | 结构化字段，见下表 |
| `items` | array | 批量时必填 | 每项含 `text` 与可选 `fields` |

`fields` 支持的键（值类型都按字符串或 0/1 传均可）：

| 键 | 取值 | 缺失时的后果 |
|---|---|---|
| `has_company_logo` | `0` / `1` | 视为 `0` → 追加 `f_nologo`（推向欺诈） |
| `company_profile` | 文本 | 视为空 → `f_profile_empty` |
| `salary_range` | 如 `"8000-12000"` | 视为空 → `f_salary_missing` |
| `telecommuting` | `0` / `1` | 视为 `0` |
| `has_questions` | `0` / `1` | 视为 `0` → `f_no_questions` |
| `employment_type` | `Full-time` / `Part-time` / `Contract` / `Temporary` | 记为 `na` |
| `required_experience` | `Entry level` / `Mid-Senior level` / … | 记为 `na` |
| `required_education` | `Bachelor's Degree` / … | 记为 `na` |
| `industry` | 行业名 | `f_ind_other` |
| `function` | 职能名 | `f_fn_other` |

> **别省略 `fields`**：模型有 4 个字段特征来自"信息是否缺失"。不传等于告诉模型
> "这家公司没有 Logo、没有简介、没写薪资"，正常岗位会被推向欺诈。

### 4.4 响应

```json
{
  "label": "fraudulent",
  "p_fraud": 0.9935,
  "flagged": true,
  "threshold": 0.09,
  "feature_tokens": ["f_nologo", "f_profile_empty", "f_salary_missing", "f_no_questions",
                     "f_emp_na", "f_exp_na", "f_edu_na", "f_ind_other", "f_fn_other",
                     "f_digits_few", "f_len_short"]
}
```

批量时返回：

```json
{"count": 2, "results": [{...}, {...}]}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `label` | string | `fraudulent` / `legitimate`，取概率最高的类 |
| `p_fraud` | float | 判为欺诈的概率，保留 4 位 |
| `flagged` | bool | `p_fraud >= threshold`，业务侧直接用它决定是否推送 |
| `threshold` | float | 当前阈值，默认 `0.09`，可用环境变量 `THRESHOLD` 覆盖 |
| `feature_tokens` | array | 本次实际拼进去的特征 token，便于人工核对判定依据 |

## 5. 示例

### curl

```bash
curl -X POST "https://job-scam-detector.app.workbuddy.host/predict?sharecode=XXXX" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Earn $5000 weekly from home. No experience required. Pay a small registration fee to start.",
    "fields": {"has_company_logo": 0, "company_profile": "", "salary_range": ""}
  }'
```

### Python

```python
import requests

URL = "https://job-scam-detector.app.workbuddy.host/predict?sharecode=XXXX"

def score(text, fields=None):
    r = requests.post(URL, json={"text": text, "fields": fields or {}}, timeout=15)
    r.raise_for_status()
    return r.json()

print(score("We are hiring a senior Java developer. 5+ years experience. Full benefits.",
            {"has_company_logo": 1, "company_profile": "Global fintech, 2000 employees.",
             "salary_range": "120000-160000", "has_questions": 1}))
```

## 6. 阈值与用法

阈值 0.09 是在 dev 上选出的 F1 最优点，测试集表现：

| 阈值 | 精度 | 召回 | 说明 |
|---|---|---|---|
| 0.05 | 0.528 | 0.326 | 更偏召回 |
| **0.09** | **0.597** | **0.465** | 默认 |
| 0.30 | 0.724 | 0.244 | 更偏精度 |
| 0.50 | 0.800 | 0.233 | 只推高置信 |

按推送量：Top-20 命中 95%，Top-50 命中 66%，Top-100 命中 47%。

**建议用法**：把 `p_fraud` 降序排列，取前 N 进人工审核队列（N 按审核人力定），
不要用 `flagged` 直接做自动下架——召回只有 47%，会漏掉一半以上。

## 7. 错误与限制

| 情况 | 返回 |
|---|---|
| 既没 `text` 也没 `items` | `{"error": "请提供 text 或 items"}` |
| 线上请求缺少 `sharecode` | 网关返回 HTML「链接不完整」页 |
| 正文过长（>10 万字符） | 建议客户端先截断，服务端不做长度限制 |

性能：单条推理毫秒级；批量 500 条约 1 秒（取决于机器）。服务单进程，无状态，
不落库、不留存请求内容。
