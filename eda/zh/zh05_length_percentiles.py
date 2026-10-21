"""
小项目5：长度分位数阶梯图（决定截断长度）
目标：把"截到多长能盖住多少样本"画成一条曲线，为下游模型的截断长度给出可解释的取值
步骤：
1,读训练集
2,算0-100每个百分位的长度
3,画阶梯图，标出config里关心的几档
4,反向算候选截断值各能盖住多少比例（全量，含三份切分）
5,再按10类各算一遍"要盖住95%需要多长"，看弱类会不会被截没了
教学出处：黑马new 第2天 §3 「maxlen 盖住大约 90% 的句子即可」；投满分笔记第1天「平均长度和最大长度用来
决定后面 BERT 把句子补到多长，项目里用的是 32」——投满分是短标题，本项目中文侧按字计数，不能照抄32
中文侧要点：
- 当前中文模型是 fastText 逐字切分，本身没有位置上限；512 这条线属于"如果要换 bert-base-chinese"，
  两种口径在图上要分开标，不能让人以为 fastText 也卡在512。
- 新数据实测：中位121字、P90 268字、P99 418字、最长3062字。
  所以512能盖住99.77%，而投满分那个 pad_size=32 只有0.25%——
  这句是答辩里"为什么不能照抄课程项目参数"最硬的证据。
"""

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from config import Config
from eda_common import (CLASS_COL, class_order, cn_length, length_color,
                        load_all_frame, load_train_frame, save_figure, save_table)

config_obj = Config()

# 步骤：
# 1,读训练集
train_data = load_train_frame()
all_data = load_all_frame()

# 表里直接用中文列名，图和csv都会跟着变中文
length_cols = [config_obj.char_len_col, config_obj.han_len_col]
length_names = [cn_length(col) for col in length_cols]


def build_percentile_table():
    """
    每个百分位对应的长度
    参数:percentile_list 来自config，想加档位改配置不改代码
    """
    rows = []
    for percentile in range(0, 101):
        row = {"百分位%": percentile}
        for length_col, length_name in zip(length_cols, length_names):
            row[length_name] = int(np.percentile(train_data[length_col], percentile))
        rows.append(row)
    return pd.DataFrame(rows)


def plot_percentile_curve(percentile_table):
    """
    阶梯图：横轴百分位，纵轴长度
    要点:用drawstyle='steps-post'，分位数本来就是阶梯函数，画折线会让人误以为中间值有意义
    """
    figure, axes = plt.subplots(figsize=(9, 5))
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
    # BERT位置编码上限是一条横线：限制的是纵轴的长度，不是横轴的百分位
    # 曲线一旦顶到这条线以上，说明这部分样本喂不进去，只能截
    axes.axhline(config_obj.model_position_limit, color="grey", linestyle="-", linewidth=1)
    axes.text(2, config_obj.model_position_limit,
              f" bert-base-chinese位置编码上限{config_obj.model_position_limit}字"
              "（当前fastText无此限制）", va="bottom", fontsize=9, color="grey")
    top = int(percentile_table[length_names[0]].max())
    axes.set_title(f"文本长度分位数曲线（读法：横轴是覆盖率，纵轴是需要的截断长度；最长{top}字）")
    axes.set_xlabel("百分位 %")
    axes.set_ylabel("长度（字）")
    axes.legend(title="长度口径")
    return save_figure(figure, "15_length_percentiles.png")


def build_coverage_table():
    """
    反方向看：选定截断值后有多少样本会被截掉
    候选值按两个口径各自的量级给，字数和汉字数差约1.4倍，共用一组数字会有一档全空
    行里有两份数：训练集口径（定maxlen用）和全量口径（回答"整个数据集要截掉多少"用）
    """
    candidate_map = {
        config_obj.char_len_col: [32, 64, 128, 256, 384, 512, 1024],
        config_obj.han_len_col: [32, 64, 128, 256, 384, 512],
    }
    rows = []
    for length_col, candidates in candidate_map.items():
        for cutoff in candidates:
            train_kept = int((train_data[length_col] <= cutoff).sum())
            all_kept = int((all_data[length_col] <= cutoff).sum())
            rows.append({"长度口径": cn_length(length_col), "截断值": cutoff,
                         "训练集完整保留数": train_kept,
                         "训练集覆盖率%": round(train_kept / len(train_data) * 100, 2),
                         "全量完整保留数": all_kept,
                         "全量覆盖率%": round(all_kept / len(all_data) * 100, 2),
                         "全量被截断数": len(all_data) - all_kept})
    return pd.DataFrame(rows)


def build_cutoff_by_class_table():
    """
    逐类看"要盖住95%需要多长"
    为什么要单独算：整体P95=363字，但如果某个弱类的P95是900字，
    按363截就把这个类尾部的样本削掉一半信息，而它本来样本就少（婚恋/网黑/军警都只有几千条）
    坑点:这里的"覆盖率"是类内覆盖，不是全量覆盖，两张表的同名列不能横向比
    """
    rows = []
    for class_name in class_order():
        sub = train_data[train_data[CLASS_COL] == class_name]
        row = {"诈骗类别": class_name, "样本数": len(sub)}
        for percentile in [50, 90, 95, 99]:
            row[f"P{percentile}字数"] = int(sub[config_obj.char_len_col].quantile(percentile / 100))
        row["最大字数"] = int(sub[config_obj.char_len_col].max())
        rows.append(row)
    # 末尾补一行"整体"，方便和文档里"中位数121字"那句对上
    total = {"诈骗类别": "全部类别合计", "样本数": len(train_data)}
    for percentile in [50, 90, 95, 99]:
        total[f"P{percentile}字数"] = int(train_data[config_obj.char_len_col].quantile(percentile / 100))
    total["最大字数"] = int(train_data[config_obj.char_len_col].max())
    rows.append(total)
    return pd.DataFrame(rows)


def plot_cutoff_by_class(cutoff_table):
    """
    逐类P95柱状图：柱子高度=该类要盖住95%样本需要的截断长度
    坑点:合计那一行不是"第11类"，画在一起会让人以为有个类别特别长，
        所以把它单独拿出来当横线，不进柱子
    """
    per_class = cutoff_table[cutoff_table["诈骗类别"] != "全部类别合计"]
    overall = int(cutoff_table[cutoff_table["诈骗类别"] == "全部类别合计"]["P95字数"].iloc[0])
    order = per_class.sort_values("P95字数")["诈骗类别"].tolist()
    colors = [config_obj.class_palette[class_order().index(n)] for n in order]

    figure, axes = plt.subplots(figsize=(10, 5.5))
    bars = axes.bar(range(len(order)),
                    per_class.set_index("诈骗类别").loc[order, "P95字数"].values,
                    color=colors)
    axes.bar_label(bars, fmt="%d", padding=2)
    axes.axhline(overall, color="grey", linestyle="--")
    axes.text(len(order) - 0.4, overall, f" 全部类别合计P95={overall}", va="bottom",
              ha="right", fontsize=9, color="grey")
    axes.set_xticks(range(len(order)))
    axes.set_xticklabels(order, rotation=25, ha="right", fontsize=9)
    axes.set_title("每类要盖住95%样本需要的截断长度（P95字数，虚线是全量P95）")
    axes.set_ylabel("P95 字数")
    return save_figure(figure, "16_length_cutoff_by_class.png")


if __name__ == "__main__":
    percentile_table = build_percentile_table()
    plot_percentile_curve(percentile_table)
    # 只打印关心的几档，全表落csv
    print(percentile_table[percentile_table["百分位%"].isin([0, 25, 50, 75] +
          list(config_obj.percentile_list) + [100])].to_string(index=False))
    save_table(percentile_table, "05_length_percentiles.csv")
    coverage_table = build_coverage_table()
    print("=" * 30, "截断值覆盖率")
    print(coverage_table.to_string(index=False))
    save_table(coverage_table, "05_length_coverage.csv")
    cutoff_table = build_cutoff_by_class_table()
    plot_cutoff_by_class(cutoff_table)
    print("=" * 30, "逐类需要的截断长度")
    print(cutoff_table.to_string(index=False))
    save_table(cutoff_table, "05_cutoff_by_class.csv")
