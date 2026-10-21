import os
import sys
import time
from openai import OpenAI
from dotenv import load_dotenv

# 脚本所在目录（config.py 里的路径都相对它）
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)
from config import Config

config = Config()
# 加载 .env：优先脚本同目录，没有再用本机旧位置
if not load_dotenv(os.path.join(BASE_DIR, ".env")):
    load_dotenv(r"D:\01_Python\.env")

# config.py 里是 "../data/..."，拼成绝对路径
def _path(p):
    return os.path.abspath(os.path.join(BASE_DIR, p))

# 模型输出 -> 中文类别（顺序与 class.txt 一致，标签值即行号）
category_map = {
    "safe": "无风险",
    "invest": "虚假网络投资理财类",
    "credit": "虚假信用服务类",
    "shopping": "虚假购物、服务类",
    "ecommerce": "冒充电商物流客服类",
    "acquaintance": "冒充领导、熟人类",
    "authority": "冒充公检法及政府机关类",
    "romance": "网络婚恋、交友类",
    "blackmarket": "网黑案件",
    "military": "冒充军警购物类诈骗",
}

# 模型预测
def predict(data):
    """
    预测函数封装，给定输入字典（包含text字段），返回
    {
    "text",
    "pred_class", # 预测结果
    "duration"    # 耗时
    }
    """
    t1 = time.time()

    text = data["text"][:2500]

    messages = [
        {"role": "system", "content": (
            "你是一个电信网络诈骗识别专家，擅长对中文文本进行精确、严谨的分类。"
            "请从以下10个类别中选择唯一一个作为答案："
            "safe（无风险，正常通知/营销/业务沟通）, "
            "invest（虚假网络投资理财：荐股、内幕消息、稳赚不赔、虚假平台充值）, "
            "credit（虚假信用服务：代办信用卡、提额、征信修复、贷款刷流水）, "
            "shopping（虚假购物服务：低价代购、虚假中奖、退款先交费）, "
            "ecommerce（冒充电商物流客服：订单异常、快递丢失、质量问题要理赔）, "
            "acquaintance（冒充领导熟人：冒充老板亲友借钱、垫付、代转账）, "
            "authority（冒充公检法：称你涉案、要求转入安全账户）, "
            "romance（网络婚恋交友：网恋后索要钱财、诱导投资赌博）, "
            "blackmarket（网黑案件：买卖账号、跑分洗钱、代收款）, "
            "military（冒充军警购物：冒充部队武警采购、骗取垫资）。\n"
            "要求：只输出一个英文类别词，不要输出任何解释、标点或其他内容。\n\n"
            "示例：\n"
            "您的快递丢失，请添加客服微信办理理赔：ecommerce\n"
            "我是市公安局的，你的账户涉嫌洗钱，请转入安全账户：authority"
        )},
        {"role": "user", "content": text}
    ]

    client = OpenAI(
        api_key=os.getenv("DEEPSEEK_KEY"),
        base_url=os.getenv("BASE_URL_DEEPSEEK"),
    )
    response = client.chat.completions.create(
        model=os.getenv("DEEPSEEK_MODEL"),
        messages=messages,
        stream=False,
        temperature=0,                                    # 分类要确定性
        extra_body={"thinking": {"type": "disabled"}},   # 分类不需要思维链，快 3 倍
    )
    result = response.choices[0].message.content.strip().lower()

    # 稳健解析：大模型可能返回多余文字，从输出里找出匹配的类别词
    pred_en = None
    if result in category_map:
        pred_en = result
    else:
        for key in category_map:
            if key in result:
                pred_en = key
                break
        if pred_en is None:                     # 模型答了中文，按中文名兜底
            for key, name in category_map.items():
                if name in result:
                    pred_en = key
                    break
    pred_cn = category_map.get(pred_en, "未知类别")

    return {
        "text": data['text'],
        "pred_class": pred_cn,
        "duration": time.time() - t1
    }


# 读取测试集，每类各取几条，避免全部抽到"无风险"导致正确率虚高
def load_test_data(limit=20):
    names = list(category_map.values())
    per_class = max(1, limit // len(names))
    buckets = [[] for _ in names]

    with open(_path(config.test_data_path), encoding='utf-8') as f:
        for line in f:
            line = line.rstrip('\n')
            if '\t' not in line:
                continue
            text, label = line.rsplit('\t', 1)
            label = label.strip()
            if label.isdigit() and len(buckets[int(label)]) < per_class:
                buckets[int(label)].append((text, names[int(label)]))

    rows = []
    for items in buckets:
        rows.extend(items)
    return rows


if __name__ == "__main__":
    rows = load_test_data(20)
    correct, cost = 0, 0.0

    for text, gold in rows:
        result = predict({"text": text})
        cost += result["duration"]
        ok = result["pred_class"] == gold
        correct += ok
        print(f"{'√' if ok else '×'} 真实={gold} 预测={result['pred_class']} "
              f"{result['duration']:.2f}s")
        print(f"   {text}\n")

    print("=" * 60)
    print(f"测试样本：{len(rows)} 条（10 类各 {len(rows) // len(category_map)} 条）")
    print(f"预测正确：{correct} 条")
    print(f"正确率：{correct / len(rows):.2%}")
    print(f"总耗时：{cost:.1f}s（平均 {cost / len(rows):.2f}s/条）")
