"""
小项目6：噪声成分扫描图（清洗环节的证据）
目标：答辩第二条要讲"缺失/异常/重复"，这张图说明我们清掉了什么、还漏了什么
步骤：
1,定义噪声规则（中文规则名 + 正则）
2,逐条统计命中率，全量 + 按标签分开
3,画横向条形图
4,打印每条规则的一个命中示例，方便判断是不是真噪声
教学出处：投满分课件的清洗只有一行 text.replace('：','')（3.2 fasttext §），黑名单式写法，
          这里把它扩展成规则表；黑马new day02 §4 的"读原文再决定"思路沿用
"""

import re

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

from config import Config
from eda_common import LABEL_COL, label_order, load_train_frame, save_figure, save_table

config_obj = Config()

# 步骤：
# 1,噪声规则表：报告里的中文名 -> 正则
# 加一条规则就加一行，图和表都会自动多一项
NOISE_RULES = {
    "网址掩码占位符": r"#[A-Za-z]*URL_[0-9A-Fa-f]{6,}#",
    "裸网址": r"https?://\S+",
    "邮箱地址": r"\b[\w.+-]+@[\w-]+\.\w{2,}\b",
    "残留网页转义符": r"&(?:amp|lt|gt|quot|nbsp|#\d+);",
    "非英文字符": r"[^\x00-\x7F]",
    # 要点:这里不能写成 ([=\-*_.~])\1{2,}，带捕获组会让pandas报"这个正则含分组，要不要用str.extract"的告警，
    #      改成每个符号各写一条3次以上的选择，含义完全一样且没有分组
    "连续重复符号": r"={3,}|\*{3,}|_{3,}|-{3,}|\.{3,}|~{3,}",
    "残留双空格": r"  ",
    "单字符文本": r"^\S$",
}

# 2,统计命中率
train_data = load_train_frame()


def scan_rules():
    """
    每条规则统计：命中行数、出现次数、按标签分开、一个示例
    要点1:用str.contains而不是遍历，14276行遍历也能跑但慢
    要点2:命中率先算全量，再按两类各算一次；两类命中率差得多就说明这个特征本身带类别信号
    """
    rows = []
    for rule_name, pattern in NOISE_RULES.items():
        mask = train_data["text"].str.contains(pattern, regex=True, case=False)
        occurrences = int(train_data["text"].str.count(pattern).sum())
        example_index = mask[mask].index
        example = ""
        if len(example_index) > 0:
            text = train_data.loc[example_index[0], "text"]
            matched = re.search(pattern, text, re.IGNORECASE)
            start = max(0, matched.start() - 30)
            example = text[start:matched.end() + 30]
        row = {
            "规则": rule_name,
            "命中行数": int(mask.sum()),
            "全量命中率%": round(mask.mean() * 100, 2),
            "出现总次数": occurrences,
        }
        for label_name, sub in train_data.groupby(LABEL_COL):
            row[f"{label_name}命中率%"] = round(
                sub["text"].str.contains(pattern, regex=True, case=False).mean() * 100, 2)
        # 示例里引用的是语料原文，是英文，这个不能翻（翻了没法回原文核对）
        row["示例（语料原文）"] = example
        rows.append(row)
    return pd.DataFrame(rows)


def plot_noise_table(table):
    """
    横向条形图：纵轴规则名，横轴命中率，按标签分色
    要点:排序按全量命中率升序，最大的排在最上面；不排序的话条形图没法一眼看出主次
    """
    # 长表：规则 × 标签 × 命中率，seaborn要的是 tidy 格式
    tidy_rows = []
    for _, record in table.iterrows():
        for label_name in label_order():
            tidy_rows.append({"规则": record["规则"], LABEL_COL: label_name,
                              "命中率%": record[f"{label_name}命中率%"]})
    tidy = pd.DataFrame(tidy_rows)
    order = table.sort_values("全量命中率%")["规则"].tolist()

    figure, axes = plt.subplots(figsize=(9, 6))
    sns.barplot(data=tidy, x="命中率%", y="规则", hue=LABEL_COL,
                order=order, hue_order=label_order(),
                palette=config_obj.color_map, ax=axes)
    axes.set_title("噪声成分命中率（按标签分组；网址掩码和非英文字符是主要待处理项）")
    axes.set_xlabel("该类样本中的命中率 %")
    axes.set_ylabel("噪声规则")
    axes.legend(title="标签")
    return save_figure(figure, "10_noise_rules.png")


if __name__ == "__main__":
    table = scan_rules()
    plot_noise_table(table)
    print(table[["规则", "命中行数", "全量命中率%"] +
                [f"{name}命中率%" for name in label_order()]].to_string(index=False))
    print("=" * 30, "示例（语料原文，不翻译）")
    for _, record in table.iterrows():
        print(f"[{record['规则']}] {str(record['示例（语料原文）'])[:60]}")
    save_table(table, "06_noise_scan.csv")
