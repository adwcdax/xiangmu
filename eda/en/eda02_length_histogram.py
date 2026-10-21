"""
小项目2：文本长度直方图（displot / histplot）
目标：看长度集中在哪个区间，决定下游模型截断到多长
步骤：
1,读训练集
2,画词数直方图（按标签着色）
3,画字符数直方图（按标签着色）
4,再画一张半透明叠加版，两类同轴比较
5,输出长度统计表
教学出处：黑马new 第2天 §3 用 countplot + displot 看句子长度（笔记里把 displot 写成"箱线图"是笔误，它是直方图）
"""

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

from config import Config
from eda_common import (LABEL_COL, cn_length, label_colors, label_order,
                        load_train_frame, save_figure, save_table)

config_obj = Config()

# 步骤：
# 1,读训练集
train_data = load_train_frame()


def plot_length_displot(length_col, file_name, title):
    """
    直方图 + 密度曲线
    参数1:长度列名（列名是英文，图上显示的名字由cn_length翻译）  参数2:图片名  参数3:标题
    要点1:stat='density'把纵轴变成密度，两类样本量差20倍，用绝对根数没法比形状
    要点2:common_bins=False，两类各自分箱，否则稀的那类会被稠密类的分箱边界压扁
    要点3:log_scale=(True,False)横轴取对数，长尾文本在线性轴上全挤在最右边
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
    注意:必须stat='density'，否则虚假职位的柱子会被真实职位完全盖住
    """
    figure, axes = plt.subplots(figsize=(8, 5))
    for label_name, color in zip(label_order(), label_colors()):
        sub = train_data[train_data[LABEL_COL] == label_name]
        sns.histplot(data=sub, x=config_obj.word_len_col, stat="density",
                     bins=50, log_scale=(True, False),
                     color=color, alpha=0.45, element="step",
                     label=f"{label_name}(n={len(sub)})", ax=axes)
    axes.set_title("两类文本词数分布叠加对比（密度、横轴对数）")
    axes.set_xlabel("词数")
    axes.set_ylabel("密度")
    axes.legend(title="标签")
    return save_figure(figure, "05_length_hist_overlay.png")


# 5,统计表
def build_table():
    """
    平均、标准差、最大、最小和分位数；这一张表就是定 pad_size / maxlen 的依据
    """
    rows = []
    for length_col in [config_obj.word_len_col, config_obj.char_len_col]:
        for label_name, sub in train_data.groupby(LABEL_COL):
            series = sub[length_col]
            rows.append({
                "长度口径": cn_length(length_col),
                "标签": label_name,
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
    plot_length_displot(config_obj.word_len_col, "03_length_hist_word.png",
                        "词数分布（按标签）")
    plot_length_displot(config_obj.char_len_col, "04_length_hist_char.png",
                        "字符数分布（按标签）")
    plot_length_overlay()
    table = build_table()
    print(table.to_string(index=False))
    save_table(table, "02_length_stats.csv")
