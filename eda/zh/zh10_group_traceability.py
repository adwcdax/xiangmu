"""
小项目10：group 溯源审计（旧版是"模态长度图"，那一列没了，换成这张）
目标：把 index.tsv 里唯一剩下的溯源维度 group 用透——它到底代表什么、
     有没有被误用成"近重复组"、以及文档说的"案件组不跨切分"是不是真的
步骤：
1,按 group 归组，看组大小分布
2,按 group 前缀分出两种来源形态（case: / txt:），各自的样本量、长度、诈骗率
3,数"同一组里出现多个标签"的比例，判断 group 是不是标签一致的重复组
4,复核跨切分的组数（文档声明为0）
5,画四张图、落两张表（审计汇总 + 组规模分布）
为什么要单独做这一项：
英文侧的做法是"MinHash找近重复→并查集归组→组内标签冲突的组直接剔除→按组切分"，
中文侧的 group 名字很像，但含义完全不同。这一组图就是为了把"完全不同"讲清楚：
中文的 group 是案件级溯源（一个案件的多条短信/多条对话），不是文本近重复组，
所以它天生就会跨标签，绝不能照搬英文侧"冲突组剔除"的处理，否则要扔掉28%的数据。
"""

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

from config import Config
from eda_common import (CLASS_COL, GROUP_COL, GROUP_KIND_COL, LABEL_COL, SPLIT_COL,
                        class_order, label_order, load_all_frame, save_figure,
                        save_table)

config_obj = Config()

all_data = load_all_frame()

# 步骤：
# 1,组级统计：每个group有多少条、跨几个切分、含几个标签
group_stat = (all_data.groupby(GROUP_COL)
              .agg(组内样本数=(LABEL_COL, "size"),
                   涉及切分数=(SPLIT_COL, "nunique"),
                   涉及类别数=(CLASS_COL, "nunique"),
                   来源形态=(GROUP_KIND_COL, "first"))
              .reset_index())

# 2,来源形态级统计
# 坑点:命名聚合里"诈骗占比%"带百分号，不是合法的python标识名，
#       直接写成 诈骗占比%=(...) 会报 SyntaxError（positional argument follows keyword argument），
#       所以这一列单独算完再并回去
kind_stat = (all_data.groupby(GROUP_KIND_COL)
             .agg(样本数=(LABEL_COL, "size"),
                  组数=(GROUP_COL, "nunique"),
                  中位字数=(config_obj.char_len_col, "median"),
                  平均字数=(config_obj.char_len_col, "mean"))
             .reset_index())
fraud_flag = all_data[LABEL_COL] == config_obj.fraud_binary_name
kind_stat["诈骗占比%"] = (kind_stat[GROUP_KIND_COL]
                        .map(all_data.assign(是诈骗=fraud_flag).groupby(GROUP_KIND_COL)["是诈骗"].mean() * 100)
                        .round(2))
kind_stat["平均每条组的样本数"] = (kind_stat["样本数"] / kind_stat["组数"]).round(2)


def plot_group_size():
    """
    组大小分布：横轴=组内样本条数，纵轴=这样的组有多少个
    读法:绝大多数组只有1条（单条文本自己一组），多行组全是case:开头
    坑点:纵轴一定要对数，1条的组有25万个，其余档只有几千到几万，
        线性轴上只剩第一根柱子，会被读成"没有多行组"
    """
    size_hist = group_stat["组内样本数"].value_counts().sort_index()
    figure, axes = plt.subplots(figsize=(9, 5))
    bars = axes.bar(size_hist.index.astype(str), size_hist.values, color="#4C72B0")
    axes.bar_label(bars, labels=[f"{v:,}" for v in size_hist.values], padding=2)
    axes.set_yscale("log")
    axes.set_title(f"溯源组的大小分布（共{len(group_stat):,}组，"
                   f"最大一组{int(size_hist.index.max())}条）")
    axes.set_xlabel("组内样本条数")
    axes.set_ylabel("组的个数（对数刻度）")
    return save_figure(figure, "24_group_size_distribution.png")


def plot_kind_compare():
    """
    2×2小图：来源形态在 样本量 / 中位字数 / 诈骗占比 / 平均组大小 四个维度上的差别
    为什么画四张而不是挑一张：case: 和 txt: 在四个维度上全都不一样，
    单看任何一个都会低估"语料其实是两批东西拼起来的"这个事实
    """
    order = list(config_obj.group_kind_name_map.values())
    tidy = kind_stat.set_index(GROUP_KIND_COL).reindex(order)
    panels = [("样本数", "{:,.0f}"), ("中位字数", "{:.0f}"),
              ("诈骗占比%", "{:.1f}%"), ("平均每条组的样本数", "{:.2f}")]
    figure, axes = plt.subplots(1, 4, figsize=(15, 4.2))
    for index, (column, fmt) in enumerate(panels):
        values = tidy[column].values.astype(float)
        bars = axes[index].bar(order, values,
                               color=[config_obj.color_map[name] for name in order])
        axes[index].bar_label(bars, labels=[fmt.format(v) for v in values], padding=2)
        axes[index].set_title(column)
        axes[index].tick_params(axis="x", labelsize=9)
    axes[0].set_ylabel("数值")
    figure.suptitle("两种来源形态的四个维度对比（案件切片短、诈骗占比高；单条文本长、诈骗占比低）")
    figure.tight_layout()
    return save_figure(figure, "25_group_kind_compare.png")


def plot_label_mixing():
    """
    组内标签混合情况：多行组里"含≥2个类别"的占多少
    这是本项目中文侧最关键的一张对比图：
      英文侧 group = 近重复组，组内标签冲突→整组剔除（只丢5组34条）
      中文侧 group = 案件组，组内本来就同时有诈骗句和无风险句，冲突是常态不是脏数据
    所以这张图的结论是"不能照搬英文侧处理"，不是"数据有问题"
    """
    multi = group_stat[group_stat["组内样本数"] > 1]
    mixed = multi[multi["涉及类别数"] > 1]
    samples_in_multi = int(multi["组内样本数"].sum())

    figure, axes = plt.subplots(1, 2, figsize=(12, 5))
    counts = multi["涉及类别数"].value_counts().sort_index()
    bars = axes[0].bar(counts.index.astype(str), counts.values,
                       color=["#4C72B0"] + ["#C44E52"] * (len(counts) - 1))
    axes[0].bar_label(bars, labels=[f"{v:,}" for v in counts.values], padding=2)
    axes[0].set_title(f"多行组按'含几个类别'拆分（{len(mixed):,}/{len(multi):,}组含≥2类，"
                      f"占{len(mixed) / len(multi) * 100:.1f}%）")
    axes[0].set_xlabel("组内出现的类别数")
    axes[0].set_ylabel("组的个数")

    # 右图：按类别看"该类样本里有多少落在多行组中"，看的是混杂来源
    per_class = []
    for class_name in class_order():
        sub = all_data[all_data[CLASS_COL] == class_name]
        per_class.append({"诈骗类别": class_name,
                          "落在多行组的比例%": float((sub[GROUP_COL].map(
                              multi.set_index(GROUP_COL)["组内样本数"]).fillna(1) > 1).mean() * 100)})
    per_class = pd.DataFrame(per_class).sort_values("落在多行组的比例%")
    # 这里也用matplotlib而不是seaborn：只有一组柱子，用hue反而会给每个类别生成一个容器，
    # 后面贴数字时容器里全是None占位，bar_label会炸（zh01踩过同一个坑）
    colors = [config_obj.class_palette[class_order().index(n)]
              for n in per_class["诈骗类别"]]
    bars = axes[1].barh(per_class["诈骗类别"], per_class["落在多行组的比例%"], color=colors)
    axes[1].bar_label(bars, fmt="%.1f", padding=2)
    axes[1].set_title(f"各类别中落在'多行案件组'里的样本占比（全量{samples_in_multi:,}条在组内）")
    axes[1].set_xlabel("%")
    axes[1].set_ylabel("")
    axes[1].tick_params(axis="y", labelsize=9)
    figure.tight_layout()
    return save_figure(figure, "26_group_label_mixing.png")


def plot_kind_by_class_share():
    """
    堆叠条形：每个类别里两种来源形态各占多少
    为什么要这张：它是zh03那张"类别间长度差"的解释变量——
    如果某类的长度特别长，先看它是不是单条文本占比高，别急着说是"话术长"
    坑点:堆叠图必须用占比而不是样本数，否则无风险那种13.9万条的类会把别的类比没
    """
    share = (all_data.groupby([CLASS_COL, GROUP_KIND_COL]).size()
             .rename("样本数").reset_index())
    share["占比%"] = share["样本数"] / share.groupby(CLASS_COL)["样本数"].transform("sum") * 100
    order = class_order()

    figure, axes = plt.subplots(figsize=(10, 5.5))
    sns.barplot(data=share, x=CLASS_COL, y="占比%", hue=GROUP_KIND_COL,
                order=order, palette=[config_obj.color_map[n]
                                       for n in config_obj.group_kind_name_map.values()],
                ax=axes)
    axes.axhline(50, color="grey", linestyle="--", linewidth=1)
    axes.set_title("每类里两种来源形态的占比（读法：先看有没有哪类明显偏一种，那是长度差的可能来源）")
    axes.set_xlabel("诈骗类别")
    axes.set_ylabel("该类中占比 %")
    axes.tick_params(axis="x", rotation=25, labelsize=9)
    axes.set_ylim(0, 105)
    axes.legend(title="来源形态")
    return save_figure(figure, "27_source_kind_by_class.png")


def build_table():
    """
    溯源审计汇总表：组规模、跨切分、标签混合、两种来源形态的对比，全写在一张表里
    最后一节直接把文档声明（跨切分案件组0）和实测并排
    """
    crossing = int((group_stat["涉及切分数"] > 1).sum())
    rows = [
        {"审计项": "溯源组总数", "值": len(group_stat), "说明": "index.tsv里group列去重计数"},
        {"审计项": "单条组（组内1条）", "值": int((group_stat["组内样本数"] == 1).sum()),
         "说明": "占绝大多数，说明大部分样本没有同案兄弟"},
        {"审计项": "多行组（组内≥2条）", "值": int((group_stat["组内样本数"] > 1).sum()),
         "说明": "全部是case:开头，txt:没有多行组"},
        {"审计项": "多行组里含≥2个类别的组数", "值": int(((group_stat["组内样本数"] > 1)
                                                    & (group_stat["涉及类别数"] > 1)).sum()),
         "说明": "一个案件里同时有诈骗句和无风险句，这是设计如此，不是标注冲突"},
        {"审计项": "落在多行组里的样本数", "值": int(group_stat.loc[group_stat["组内样本数"] > 1,
                                                              "组内样本数"].sum()),
         "说明": "若照英文侧'冲突组剔除'处理，要扔掉的样本量"},
        {"审计项": "跨切分的组数（实测）", "值": crossing,
         "说明": "文档声明0（技术文档§2），这里自己数一遍"},
        {"审计项": "跨切分的组数（文档声明）", "值": 0, "说明": "docs/技术文档-电诈识别.md 第2节"},
        {"审计项": "样本总数", "值": len(all_data), "说明": "三份切分相加"},
    ]
    for _, record in kind_stat.iterrows():
        rows.append({"审计项": f"来源形态={record[GROUP_KIND_COL]}的样本数",
                     "值": int(record["样本数"]),
                     "说明": f"组数{int(record['组数']):,}，中位字数{record['中位字数']:.0f}，"
                             f"诈骗占比{record['诈骗占比%']:.1f}%"})
    return pd.DataFrame(rows)


def build_size_distribution():
    """
    组规模分布：组内有N条样本的组各有几个、这些组一共装了多少条样本
    为什么不落29万行逐组明细：csv目录是给答辩当场查数用的，
    逐组明细既查不动、又把仓库撑大6MB，分布表就是图24那几根柱子背后的数
    坑点:命名聚合的关键字必须是合法python标识名，"含≥2类别的组数"里带≥会直接语法报错，
        所以先用 混类组数 这种安全名字聚合，落表前再改成看得懂的列名
    """
    marked = group_stat.assign(跨切分=group_stat["涉及切分数"] > 1,
                               混类=(group_stat["组内样本数"] > 1)
                                     & (group_stat["涉及类别数"] > 1))
    dist = (marked.groupby("组内样本数")
            .agg(组的个数=(GROUP_COL, "size"),
                 样本数合计=("组内样本数", "sum"),
                 跨切分的组数=("跨切分", "sum"),
                 混类组数=("混类", "sum"))
            .reset_index())
    return dist.rename(columns={"混类组数": "含2类以上的组数"})


if __name__ == "__main__":
    plot_group_size()
    plot_kind_compare()
    plot_label_mixing()
    plot_kind_by_class_share()
    table = build_table()
    print(table.to_string(index=False))
    save_table(table, "10_group_traceability.csv")
    dist = build_size_distribution()
    print(dist.to_string(index=False))
    save_table(dist, "10_group_size_summary.csv")
