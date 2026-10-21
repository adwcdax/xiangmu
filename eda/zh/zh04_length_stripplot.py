"""
小项目4：长度散点图（stripplot 条带图 + 字数/汉字数双数值散点）
目标：找离群点。答辩里"看到离群点就去读原文"这一步的证据
步骤：
1,读训练集
2,按标签画字数条带图（抽样后画），短短信和长案情都摊在一条竖线上
3,画字数-汉字数散点，看非汉字成分占比异常高的样本
4,10类各抽等量样本画逐点分布，只比形状不比样本量
5,把最长和最短的样本打印出来，人工去读原文，并列成表
教学出处：黑马new 第2天 §4 用 sns.stripplot(y="sentence_length", x="label") 看离群点

新数据下的关键改动：训练集从3.6万行变成24.6万行
- 条带图和散点图必须抽样（config.strip_sample_limit=2万），
  全量画出来是两块纯黑，存图也要一两分钟；
- 抽样只影响这几张"看点"的图，P99离群清单和CSV仍然用全量算，
  不然被追问"离群点多少条"时给的是抽样值，和表对不上。
"""

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

from config import Config
from eda_common import (CLASS_COL, GROUP_KIND_COL, LABEL_COL, SPLIT_COL,
                        class_order, cn_length, label_colors, label_order,
                        load_train_frame, save_figure, save_table, subsample_for_plot)

config_obj = Config()

# 步骤：
# 1,读训练集
train_data = load_train_frame()

# 条带图也做截断，理由同箱线图；列名给中文，seaborn会直接当纵轴标签
clip_col = f"{cn_length(config_obj.char_len_col)}（截断至{config_obj.length_clip}）"
train_data[clip_col] = train_data[config_obj.char_len_col].clip(upper=config_obj.length_clip)


def plot_stripplot():
    """
    条带图：每个样本一个点，横向随机抖动避免完全重叠
    要点1:size和alpha要调小，2万点默认画法照样糊成一坨
    要点2:数据点多时不要用sns.swarmplot，它要精确排布每个点，这个量级会卡死
    要点3:横轴用塌回二类（2列）而不是10类，10类×2万点会把每列挤成一条实线，
          逐类的分布形状交给zh03的箱线图和这里的第3张图
    """
    sampled = subsample_for_plot(train_data)
    figure, axes = plt.subplots(figsize=(8, 6))
    p99 = int(train_data[config_obj.char_len_col].quantile(0.99))
    sns.stripplot(data=sampled, x=LABEL_COL, y=clip_col, hue=LABEL_COL,
                  order=label_order(), hue_order=label_order(),
                  size=1.8, alpha=0.3, jitter=0.35,
                  palette=label_colors(), legend=False, ax=axes)
    axes.axhline(p99, color="grey", linestyle="--", linewidth=1)
    axes.text(1.45, p99, f"  P99={p99}（按全量算，不是抽样值）", va="bottom", fontsize=9)
    axes.set_title(f"每样本文本长度散点（全量{len(train_data):,}条，随机抽{len(sampled):,}条画点；"
                   f"纵轴截断到{config_obj.length_clip}字）")
    axes.set_xlabel("标签")
    axes.set_ylabel("字数")
    return save_figure(figure, "12_length_stripplot.png")


def plot_char_han_scatter():
    """
    真·散点图：横轴字数、纵轴汉字数
    用途：汉字数不可能超过字数，点都该贴在参考线附近；
          明显掉到线下方很远的样本就是数字、英文、符号占大头的样本（联系方式、APP名、账号）
    注意:参考线不是y=x，实测每字约0.75个汉字，斜率用中位数算出来，不写死
    """
    sampled = subsample_for_plot(train_data)
    figure, axes = plt.subplots(figsize=(8, 6))
    for label_name, color in zip(label_order(), label_colors()):
        sub = sampled[sampled[LABEL_COL] == label_name]
        axes.scatter(sub[config_obj.char_len_col], sub[config_obj.han_len_col],
                     s=8, alpha=0.3, color=color, label=f"{label_name}（n={len(sub):,}）")
    slope = (train_data[config_obj.han_len_col] /
             train_data[config_obj.char_len_col].clip(lower=1)).median()
    x_max = train_data[config_obj.char_len_col].max()
    axes.plot([0, x_max], [0, slope * x_max], color="grey", linestyle="--",
              label=f"参考线：每字约{slope:.2f}汉字")
    axes.set_title("字数与汉字数散点图（离参考线越远，说明非汉字成分越多）")
    axes.set_xlabel("字数")
    axes.set_ylabel("汉字数")
    axes.legend(title="标签")
    return save_figure(figure, "13_length_char_vs_han_scatter.png")


def plot_class_stripplot(per_class=2000):
    """
    10类的逐点分布：每类等量抽样后画散点，纵轴是类别、横轴是字数
    为什么要单独画：二类口径的条带图看不到"婚恋交友这种弱类里有没有一批超长文本"，
    每类等量抽样正好把样本量差异抹掉，只比分布形状
    坑点:等量抽样之后点密度不能再读成"样本多少"，只能读成"长度分布形状"，
        这一点必须写在标题里，不然答辩会被反问"是不是每类都是2000条"
    """
    parts = [sub.sample(n=min(per_class, len(sub)), random_state=42)
             for _, sub in train_data.groupby(CLASS_COL)]
    sampled = pd.concat(parts)
    order = (train_data.groupby(CLASS_COL)[config_obj.char_len_col].median()
             .sort_values().index.tolist())

    # 随机源只构造一次：每个类别都新建一遍的话10类会抖出完全相同的形状，
    # 看上去像"各类分布几乎一样"，其实是假象
    rng = np.random.default_rng(42)
    figure, axes = plt.subplots(figsize=(10, 6.5))
    for index, name in enumerate(order):
        sub = sampled[sampled[CLASS_COL] == name]
        color = config_obj.class_palette[class_order().index(name)]
        axes.scatter(sub[config_obj.char_len_col].clip(upper=config_obj.length_clip),
                     index + rng.normal(0, 0.22, len(sub)),
                     s=6, alpha=0.35, color=color, label=name)
    axes.set_yticks(range(len(order)))
    axes.set_yticklabels(order, fontsize=9)
    axes.set_ylim(-0.7, len(order) - 0.3)
    axes.set_xlabel(f"字数（截断到{config_obj.length_clip}）")
    axes.set_ylabel("诈骗类别")
    axes.set_title(f"训练集10类逐样本字数散点（每类最多抽{per_class}条，只比形状不比样本量；"
                   "纵轴按中位数升序）")
    axes.legend(fontsize=7, ncol=2, title="诈骗类别", loc="lower right")
    return save_figure(figure, "14_length_stripplot_by_class.png")


# 5,离群点交给人工读原文
def print_extremes(top_k=10):
    """
    按黑马new §4的做法：离群点不要直接拿去训练，先读一遍
    这里打印最长和最短的若干条，前40字够判断是不是脏数据
    """
    print("=" * 30, "最长的样本")
    for length, text in (train_data.sort_values(config_obj.char_len_col, ascending=False)
                         .head(top_k)[[config_obj.char_len_col, "text"]].values):
        print(f"[{int(length)}字] {str(text)[:40]}")
    print("=" * 30, "最短的样本")
    for length, text in (train_data.sort_values(config_obj.char_len_col)
                         .head(top_k)[[config_obj.char_len_col, "text"]].values):
        print(f"[{int(length)}字] {str(text)[:40]}")


def build_table():
    """
    离群点清单落表，方便分派人手去读
    口径：全训练集P99以上的样本，一条不漏（这里用全量，不用抽样）
    表头统一中文，列名用rename换，图脚本里不出现英文表头
    """
    upper = train_data[config_obj.char_len_col].quantile(0.99)
    outliers = train_data[train_data[config_obj.char_len_col] > upper].copy()
    outliers["文本预览"] = outliers["text"].str.slice(0, 40)
    columns = {SPLIT_COL: "数据集", LABEL_COL: "标签", CLASS_COL: "诈骗类别",
               GROUP_KIND_COL: "来源形态",
               config_obj.char_len_col: cn_length(config_obj.char_len_col),
               config_obj.han_len_col: cn_length(config_obj.han_len_col),
               "文本预览": "文本预览"}
    result = outliers[list(columns)].rename(columns=columns)
    return result.sort_values("字数", ascending=False)


if __name__ == "__main__":
    plot_stripplot()
    plot_char_han_scatter()
    plot_class_stripplot()
    print_extremes()
    table = build_table()
    print(f"全训练集P99以上离群点共{len(table)}条")
    save_table(table, "04_length_outliers.csv")
