"""
小项目2：文本长度直方图（displot / histplot）
目标：看中文话术长度集中在哪个区间，决定下游模型截断到多长
步骤：
1,读训练集，按塌回二分类画字数/汉字数密度直方图（对数横轴）
2,再画一张两类半透明叠加版，形状差异直接比
3,10类各画一根"中位数+P95"柱，回答"哪一类天生更长"
4,输出长度统计表
教学出处：黑马new 第2天 §3 用 displot 看句子长度（笔记里把 displot 写成"箱线图"是笔误，它是直方图）
中文侧差异：材料里的英文口径是"词数"，中文没有空格切不出词，这里换成"字数/汉字数"

新数据（10类、35.3万条）下的两点变化：
- 旧版只有二类，一张图就能画完；现在10类挤在一张密度图里完全没法读，
  所以"逐类长度"改成中位数+P95柱状图，分布形状仍然只在二类口径上看。
- 全量中位数从旧版的92字变成121字（文档也写121，这里实测对上了），
  最长从1091字变成3062字，所以下面的截断上限和候选值都要重取。
"""

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

from config import Config
from eda_common import (CLASS_COL, LABEL_COL, class_order, cn_length, label_colors,
                        label_order, load_train_frame, save_figure, save_table)

config_obj = Config()

# 步骤：
# 1,读训练集
train_data = load_train_frame()


def plot_length_displot(length_col, file_name, title):
    """
    直方图 + 密度曲线
    参数1:长度列名（列名是英文，图上显示的名字由cn_length换成中文）  参数2:图片名  参数3:标题
    要点1:stat='density'把纵轴变成密度，两类样本量差1.5倍，用绝对根数没法比形状
    要点2:common_bins=False，两类各自分箱，否则多的那类会把少的那类压扁
    要点3:log_scale=(True,False)横轴取对数，长尾文本在线性轴上全挤在最右边
    要点4:hue用的是塌回二分类那一列，不是10类——10类画在一张图上叠成麻花，读不出任何东西
    """
    figure = sns.displot(data=train_data, x=length_col, hue=LABEL_COL,
                         hue_order=label_order(), palette=label_colors(),
                         kind="hist", stat="density", common_bins=False,
                         bins=50, log_scale=(True, False), height=5, aspect=1.4)
    figure.set_titles(title)
    figure.set_axis_labels(cn_length(length_col), "密度")
    # 图例标题默认取hue列名"标签"，所以图上也全是中文
    return save_figure(figure.fig, file_name)


def plot_length_overlay():
    """
    叠加版：两类画在同一张图上，用alpha透出彼此
    注意:必须stat='density'，否则无风险类的柱子会把诈骗类完全盖住
    """
    figure, axes = plt.subplots(figsize=(8, 5))
    for label_name, color in zip(label_order(), label_colors()):
        sub = train_data[train_data[LABEL_COL] == label_name]
        sns.histplot(data=sub, x=config_obj.char_len_col, stat="density",
                     bins=50, log_scale=(True, False),
                     color=color, alpha=0.45, element="step",
                     label=f"{label_name}(n={len(sub):,})", ax=axes)
    axes.set_title("两类文本字数分布叠加对比（密度、横轴对数）")
    axes.set_xlabel("字数")
    axes.set_ylabel("密度")
    axes.legend(title="标签")
    return save_figure(figure, "07_length_hist_overlay.png")


def plot_class_length_bars():
    """
    逐类长度柱状图：每类两根柱，中位数和P95
    为什么不用箱线图放这里：箱线图要画10个箱体，每个箱体还得留横向空间，
    这张图只想回答"哪一类天生更长"，两根柱比五个分位数好读；
    完整分位数在zh03的箱线图和csv表里
    坑点:P95是"从右边数5%的位置"，比中位数敏感得多，
        两类一长一短往往就是P95拉开的，只讲中位数会低估长尾
    """
    stat = (train_data.groupby(CLASS_COL)[config_obj.char_len_col]
            .agg(中位数="median", P95=lambda s: s.quantile(0.95))
            .reindex(class_order()))
    tidy = stat.reset_index().melt(id_vars=CLASS_COL, var_name="分位", value_name="字数")
    order = stat.sort_values("中位数").index.tolist()

    figure, axes = plt.subplots(figsize=(11, 5.5))
    sns.barplot(data=tidy, x=CLASS_COL, y="字数", hue="分位",
                order=order, hue_order=["中位数", "P95"],
                palette=["#4C72B0", "#DD8452"], ax=axes)
    for patch in axes.containers:
        if patch:
            axes.bar_label(patch, fmt="%.0f", fontsize=8)
    axes.set_title("10类的文本字数：中位数与P95（按中位数升序排）")
    axes.set_xlabel("诈骗类别")
    axes.set_ylabel("字数")
    axes.tick_params(axis="x", rotation=20)
    axes.legend(title="分位")
    return save_figure(figure, "08_length_by_class_bars.png")


def build_table():
    """
    平均、标准差、最大、最小和分位数；这一张表就是定 maxlen 的依据
    10类每类一行，末尾再补两行塌回二分类，答辩时"逐类"和"整体"两个层面都能答
    """
    rows = []
    groups = [(f"{CLASS_COL}={name}", sub) for name, sub in train_data.groupby(CLASS_COL)]
    groups += [(f"{LABEL_COL}={name}", sub) for name, sub in train_data.groupby(LABEL_COL)]
    groups.append(("全训练集", train_data))
    for length_col in [config_obj.char_len_col, config_obj.han_len_col]:
        for group_name, sub in groups:
            series = sub[length_col]
            rows.append({
                "长度口径": cn_length(length_col),
                "分组": group_name,
                "样本数": len(sub),
                "平均": round(series.mean(), 1),
                "标准差": round(series.std(), 1),
                "最小": int(series.min()),
                "最大": int(series.max()),
                "中位数": int(series.median()),
                "P90": int(np.percentile(series, 90)),
                "P95": int(np.percentile(series, 95)),
                "P99": int(np.percentile(series, 99)),
            })
    return pd.DataFrame(rows)


if __name__ == "__main__":
    plot_length_displot(config_obj.char_len_col, "05_length_hist_char.png",
                        "字数分布（按标签）")
    plot_length_displot(config_obj.han_len_col, "06_length_hist_han.png",
                        "汉字数分布（按标签）")
    plot_length_overlay()
    plot_class_length_bars()
    table = build_table()
    print(table[table["分组"] == "全训练集"].to_string(index=False))
    print("=" * 30, "逐类（字数口径）")
    print(table[(table["长度口径"] == "字数") & (table["分组"] != "全训练集")].to_string(index=False))
    save_table(table, "02_length_stats.csv")
