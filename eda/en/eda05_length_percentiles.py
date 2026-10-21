"""
小项目5：长度分位数阶梯图（决定截断长度）
目标：把"截到多长能盖住多少样本"画成一条曲线，为BERT的pad_size/maxlen给出可解释的取值
步骤：
1,读训练集
2,算0-100每个百分位的长度
3,画阶梯图，标出P50/P90/P95/P99
4,反向算几个候选截断值各能盖住多少比例
教学出处：黑马new 第2天 §3 「maxlen 盖住大约 90% 的句子即可」；投满分笔记第1天「平均长度和最大长度用来
决定后面 BERT 把句子补到多长，项目里用的是 32」——投满分是短标题，本项目是整段职位描述，不能照抄32
"""

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from config import Config
from eda_common import cn_length, length_color, load_train_frame, save_figure, save_table

config_obj = Config()

# 步骤：
# 1,读训练集
train_data = load_train_frame()

# 表里直接用中文列名，图和csv都会跟着变中文
length_names = [cn_length(col) for col in
                [config_obj.word_len_col, config_obj.char_len_col]]


def build_percentile_table():
    """
    每个百分位对应的长度
    参数:percentile_list 来自config，想加档位改配置不改代码
    """
    rows = []
    for percentile in range(0, 101):
        row = {"百分位%": percentile}
        for length_col, length_name in zip([config_obj.word_len_col, config_obj.char_len_col],
                                           length_names):
            row[length_name] = int(np.percentile(train_data[length_col], percentile))
        rows.append(row)
    return pd.DataFrame(rows)

def plot_percentile_curve(percentile_table):
    """
    阶梯图：横轴百分位，纵轴长度
    要点:用drawstyle='steps-post'，分位数本来就是阶梯函数，画折线会让人误以为中间值有意义
    """
    figure, axes = plt.subplots(figsize=(9, 5))
    length_cols = [config_obj.word_len_col, config_obj.char_len_col]
    for length_col, length_name in zip(length_cols, length_names):
        axes.plot(percentile_table["百分位%"], percentile_table[length_name],
                  drawstyle="steps-post", color=length_color(length_col), label=length_name)
    # 标出config里关心的几档
    # P90/P95/P99在横轴上只差几个百分点，文字全朝右上偏置会互相压住，所以奇偶交替上下错开
    for index, percentile in enumerate(config_obj.percentile_list):
        value = int(percentile_table.loc[percentile_table["百分位%"] == percentile,
                                         length_names[0]].iloc[0])
        axes.axvline(percentile, color="grey", linestyle=":", linewidth=1)
        axes.annotate(f"P{percentile}={value}", (percentile, value),
                      textcoords="offset points",
                      xytext=(-46 if index % 2 else 6, 10 if index % 2 else -18),
                      fontsize=9)
    axes.set_title("文本长度分位数曲线（读法：横轴是覆盖率，纵轴是需要的截断长度）")
    axes.set_xlabel("百分位 %")
    axes.set_ylabel("长度")
    axes.legend(title="长度口径")
    return save_figure(figure, "09_length_percentiles.png")


def build_coverage_table():
    """
    反方向看：选定截断值后有多少样本会被截掉
    候选值按两个口径各自的量级给，词数和字符数差7倍，共用一组数字没有意义
    """
    candidate_map = {
        config_obj.word_len_col: [64, 128, 256, 324, 512],
        config_obj.char_len_col: [512, 1024, 2306, 3072, 4096],
    }
    rows = []
    total = len(train_data)
    for length_col, candidates in candidate_map.items():
        for cutoff in candidates:
            kept = int((train_data[length_col] <= cutoff).sum())
            rows.append({"长度口径": cn_length(length_col), "截断值": cutoff,
                         "完整保留样本数": kept,
                         "覆盖率%": round(kept / total * 100, 2),
                         "被截断样本数": total - kept})
    return pd.DataFrame(rows)


if __name__ == "__main__":
    percentile_table = build_percentile_table()
    plot_percentile_curve(percentile_table)
    # 只打印关心的几档，全表落csv
    print(percentile_table[percentile_table["百分位%"].isin([0, 25, 50, 75] +
          list(config_obj.percentile_list) + [100])].to_string(index=False))
    save_table(percentile_table, "05_length_percentiles.csv")
    coverage_table = build_coverage_table()
    print(coverage_table.to_string(index=False))
    save_table(coverage_table, "05_length_coverage.csv")
