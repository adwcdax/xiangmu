# LLM 零样本分类（中文电诈 10 类）

用大模型 API 直接做分类，**不训练任何模型**，作为 `fasttext/` 基线的方法对照。

## 结构

| 文件 | 说明 |
|---|---|
| `predict.py` | 主脚本：`predict()` 单条预测 + `load_test_data()` 抽样 + 正确率统计 |
| `config.py` | 数据路径，指向 `../data/zh_data_process` |
| `requirements.txt` | `openai`、`python-dotenv` |

## 环境

```bash
pip install -r llm/requirements.txt
```

密钥读项目根的 `.env`（或本目录 `.env`），需要三项：

```
DEEPSEEK_KEY=sk-xxx
BASE_URL_DEEPSEEK=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
```

## 用法

```bash
D:/conda_envs/ds/python.exe -X utf8 llm/predict.py
```

跑测试集每类各 2 条（共 20 条），逐条打印「真实 / 预测 / 耗时」，最后给正确率：

```
测试样本：20 条（10 类各 2 条）
预测正确：15 条
正确率：75.00%
总耗时：15.1s（平均 0.76s/条）
```

单条预测：

```python
from llm.predict import predict

predict({"text": "我是市公安局的，你的账户涉嫌洗钱，请转入安全账户"})
# {'text': '...', 'pred_class': '冒充公检法及政府机关类', 'duration': 0.83}
```

## 与 fastText 基线的关系

| | 本方案 | `fasttext/` |
|---|---|---|
| 训练 | 无需训练 | 需训练（fasttext-wheel） |
| 数据依赖 | 只用测试集评估 | 用 train/dev 训练 |
| 类别 | 10 类，与 `class.txt` 一致 | 同 |
| 用途 | 快速冷启动、少样本场景对照 | 线上服务主方案 |

## 实现要点

- **输出解析**：先精确匹配英文键，再子串扫描，最后退到中文类别名（模型偶尔直接答中文）
- **确定性**：`temperature=0`
- **速度**：`extra_body={"thinking": {"type": "disabled"}}` 关闭思维链，单条 1.9s → 0.8s
- **抽样**：测试集「无风险」占 40%，直接取前 N 条正确率会虚高，所以每类各取相同条数

## 注意

只判文本，不依赖结构化字段。如果后续要把工商信息、薪资区间的结构化特征拼进 prompt，
在 `predict.py` 的 `messages` 里扩 user content 即可。
