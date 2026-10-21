"""
小项目4：长度散点图（stripplot 条带图 + 词数/字符数双数值散点）
目标：找离群点。答辩里"看到离群点就去读原文"这一步的证据
步骤：
1,读训练集
2,按标签画词数条带图，短文本和超长文本都摊在一条竖线上
3,画词数-字符数散点，看两个口径是否一致、有没有异常点
4,把最长和最短的样本打印出来，人工去读原文
教学出处：黑马new 第2天 §4 用 sns.stripplot(y="sentence_length", x="label") 看离群点
"""

import matplotlib.pyplot as plt
import seaborn as sns

from config import Config
from eda_common import (LABEL_COL, SPLIT_COL, cn_length, label_colors,
                        label_order, load_train_frame, save_figure, save_table)

config_obj = Config()

# 步骤：
# 1,读训练集
train_data = load_train_frame()

# 条带图也做截断，理由同箱线图；列名给中文，seaborn会直接当纵轴标签
clip_col = f"{cn_length(config_obj.word_len_col)}（截断至{config_obj.length_clip}）"
train_data[clip_col] = train_data[config_obj.word_len_col].clip(upper=config_obj.length_clip)


def plot_stripplot():
    """
    条带图：每个样本一个点，横向随机抖动避免完全重叠
    要点1:size和alpha要调小，1.4万个点默认画法是糊成两块黑
    要点2:数据点多时不要用sns.swarmplot，它要精确排布每个点，这个量级会卡死
    """
    figure, axes = plt.subplots(figsize=(8, 6))
    p99 = int(train_data[config_obj.word_len_col].quantile(0.99))
    sns.stripplot(data=train_data, x=LABEL_COL, y=clip_col, hue=LABEL_COL,
                  order=label_order(), hue_order=label_order(),
                  size=2.5, alpha=0.4, jitter=0.35,
                  palette=label_colors(), legend=False, ax=axes)
    axes.axhline(p99, color="grey", linestyle="--", linewidth=1)
    axes.text(1.45, p99, f"  P99={p99}", va="bottom", fontsize=9)
    axes.set_title(f"每样本文本长度散点（纵轴截断到{config_obj.length_clip}词，虚线为P99）")
    axes.set_xlabel("标签")
    axes.set_ylabel("词数")
    return save_figure(figure, "07_length_stripplot.png")


def plot_word_char_scatter():
    """
    真·散点图：横轴词数、纵轴字符数
    用途：两个口径应该近似直线；明显偏离直线的点就是"词少但每词很长"或"含大量符号"的脏数据
    注意:参考线不是y=x，因为平均每词约7个字符，所以按"每词字符数中位数"画斜线
    """
    figure, axes = plt.subplots(figsize=(8, 6))
    for label_name, color in zip(label_order(), label_colors()):
        sub = train_data[train_data[LABEL_COL] == label_name]
        axes.scatter(sub[config_obj.word_len_col], sub[config_obj.char_len_col],
                     s=8, alpha=0.3, color=color, label=f"{label_name}（n={len(sub)}）")
    slope = (train_data[config_obj.char_len_col] /
             train_data[config_obj.word_len_col].clip(lower=1)).median()
    x_max = train_data[config_obj.word_len_col].max()
    axes.plot([0, x_max], [0, slope * x_max], color="grey", linestyle="--",
              label=f"参考线：每词约{slope:.1f}字符")
    axes.set_title("词数与字符数散点图")
    axes.set_xlabel("词数")
    axes.set_ylabel("字符数")
    axes.legend(title="标签")
    return save_figure(figure, "08_length_word_vs_char_scatter.png")


# 4,离群点交给人工读原文
def print_extremes(top_k=10):
    """
    按黑马new §4的做法：离群点不要直接拿去训练，先读一遍
    这里打印最长和最短的若干条，前80字符够判断是不是脏数据
    注意:打印出来的正文是英文，那是语料本身，不是图上的文字，翻译了反而没法回原文核对
    """
    print("=" * 30, "最长的样本")
    for length, text in (train_data.sort_values(config_obj.word_len_col, ascending=False)
                         .head(top_k)[[config_obj.word_len_col, "text"]].values):
        print(f"[{int(length)}词] {text[:80]}")
    print("=" * 30, "最短的样本")
    for length, text in (train_data.sort_values(config_obj.word_len_col)
                         .head(top_k)[[config_obj.word_len_col, "text"]].values):
        print(f"[{int(length)}词] {text[:80]}")


def build_table():
    """
    离群点清单落表，方便分派人手去读
    表头统一中文，列名用rename换，图脚本里不出现英文表头
    """
    upper = train_data[config_obj.word_len_col].quantile(0.99)
    outliers = train_data[train_data[config_obj.word_len_col] > upper].copy()
    outliers["文本预览"] = outliers["text"].str.slice(0, 60)
    columns = {SPLIT_COL: "数据集", LABEL_COL: "标签",
               config_obj.word_len_col: cn_length(config_obj.word_len_col),
               config_obj.char_len_col: cn_length(config_obj.char_len_col),
               "文本预览": "文本预览"}
    result = outliers[list(columns)].rename(columns=columns)
    return result.sort_values("词数", ascending=False)


if __name__ == "__main__":
    plot_stripplot()
    plot_word_char_scatter()
    print_extremes()
    table = build_table()
    print(f"P99以上离群点共{len(table)}条")
    save_table(table, "04_length_outliers.csv")
