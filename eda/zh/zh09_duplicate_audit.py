"""
小项目9：重复文本与模板家族审计（复核文档声明）
目标：文档里"重复率0%、跨切分案件组0"是声明值，这里自己数一遍，
     并且往前多走一步——完全重复为0，不代表没有近重复，合成语料的模板家族才是隐患
步骤：
1,按切分统计完全重复（exact duplicate）行数
2,统计跨切分的完全重复文本数
3,把正文归一成"骨架"（数字→N、网址→U、方括号→B、金额单位→$），按骨架归族
4,数骨架家族的规模、跨切分情况、族内标签构成
5,画两张图，落三张表（对账表 / 最大家族明细 / 家族规模分布）
教学出处：黑马new 第2天 §4 重复文本用 duplicated()；英文侧那边还做了MinHash+LSH，
          中文侧35万行跑MinHash太慢，这里用"骨架归一"当作轻量近重复探针
和英文侧的口径差异（答辩一定会被问）：
- 英文侧：EMSCAD真实爬取，同一份JD被反复投放，组内重复22.87%，所以必须做MinHash归组再切分。
- 中文侧：完全重复0条，但这是LLM合成语料，"没重复"很可能只是"每次都换了数字和品牌名"。
  骨架归一就是专门查这一点的：把 \d+ / 【】 / www 之类可变槽位抹掉再比。
"""

import re

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

from config import Config
from eda_common import (CLASS_COL, LABEL_COL, SPLIT_COL, load_all_frame,
                        mode_by_group, save_figure, save_table)

config_obj = Config()

# 文档声明值，出处：docs/技术文档-电诈识别.md 第2节的表
# 写成常量而不是从文件里解析，是因为文档是给人读的md，没有机器可解析的字段
DECLARED = {"重复率%": 0.0, "跨切分案件组": 0}

all_data = load_all_frame()

# 步骤：
# 3,骨架归一：把"每次生成都会换的槽位"抹掉，剩下的就是模板本身
SLOT_RULES = [
    (r"https?://\S+|www\.\S+", "U"),      # 网址
    (r"\d+(?:\.\d+)?", "N"),              # 数字（金额、电话、QQ、卡号都在这）
    (r"【[^】]*】", "B"),                  # 【顺丰】【坐席】这类品牌/角色名
    (r"[，。！？；：、,.;:!?'\"“”‘’()（）\-—_*·\s]+", ""),  # 标点全部去掉
]


def to_skeleton(text):
    """
    正文 -> 骨架
    要点:先替槽位再删标点。反过来做的话"转账5000元"和"转账 5000 元"会先被标点规则拆成
        不同片段，替完数字仍旧对不上，骨架族会被人为打散
    """
    skeleton = str(text)
    for pattern, replacement in SLOT_RULES:
        skeleton = re.sub(pattern, replacement, skeleton)
    return skeleton


all_data["骨架"] = all_data["text"].map(to_skeleton)
all_data["字数"] = all_data[config_obj.char_len_col]


def build_duplicate_audit():
    """
    完全重复 + 跨切分重复的对账表
    每个切分一行，再加一行"三份合计"；最后一列直接把文档声明摆旁边，差一列"是否吻合"
    """
    rows = []
    for split_cn, sub in all_data.groupby(SPLIT_COL):
        duplicated = int(sub["text"].duplicated().sum())
        rows.append({"范围": split_cn, "样本数": len(sub),
                     "完全重复行数": duplicated,
                     "实测重复率%": round(duplicated / len(sub) * 100, 4),
                     "文档声明重复率%": DECLARED["重复率%"],
                     "是否吻合": "吻合" if duplicated == 0 else "不吻合"})
    # 跨切分：同一条正文同时出现在两份以上的切分里
    crossing = (all_data.groupby("text")[SPLIT_COL].nunique())
    cross_n = int((crossing > 1).sum())
    rows.append({"范围": "跨切分（同一条文本落进≥2个切分）", "样本数": len(all_data),
                 "完全重复行数": cross_n,
                 "实测重复率%": round(cross_n / len(all_data) * 100, 4),
                 "文档声明重复率%": DECLARED["跨切分案件组"],
                 "是否吻合": "吻合" if cross_n == 0 else "不吻合"})
    # 骨架级：同一骨架落进≥2个切分（这是"近重复跨集"，文档没有承诺过，纯自查）
    skeleton_crossing = all_data.groupby("骨架")[SPLIT_COL].nunique()
    skeleton_cross_n = int((skeleton_crossing > 1).sum())
    rows.append({"范围": "跨切分（同一骨架落进≥2个切分，文档未承诺）", "样本数": len(all_data),
                 "完全重复行数": skeleton_cross_n,
                 "实测重复率%": round(skeleton_cross_n / len(all_data) * 100, 4),
                 "文档声明重复率%": np.nan,
                 "是否吻合": "文档未声明"})
    return pd.DataFrame(rows)


def build_size_distribution(family):
    """
    家族规模分布：同一骨架下有N条样本的骨架各有几个，其中几个跨了切分
    为什么不落35万行逐骨架明细：csv目录的定位是"被追问时能查的数字"，
    全量明细既查不动，又会让仓库凭空多70MB，分布表才是图上那根柱子的背后数据
    """
    marked = family.assign(跨切分=family["涉及切分数"] > 1)
    return (marked.groupby("样本数")
            .agg(骨架个数=("骨架", "size"),
                 跨切分的骨架个数=("跨切分", "sum"),
                 组内最多类别数=("涉及类别数", "max"))
            .reset_index())


def build_family_table(top_k=50):
    """
    骨架家族规模表：每个骨架有多少条样本、横跨几个切分、几类标签
    排序按家族规模降序，返回(前top_k条明细, 全量家族表)；全量表只用来算分布和画图
    坑点:"主要类别""主要标签"不能用agg里的lambda算——骨架有几十个万级组，
        每组调一次python函数会慢到十几分钟，这里换成eda_common.mode_by_group（纯向量化）
    """
    family = (all_data.groupby("骨架")
              .agg(样本数=("text", "size"),
                   涉及切分数=(SPLIT_COL, "nunique"),
                   涉及类别数=(CLASS_COL, "nunique"),
                   中位字数=(config_obj.char_len_col, "median"))
              .reset_index())
    family["主要类别"] = family["骨架"].map(mode_by_group(all_data, "骨架", CLASS_COL))
    family["主要标签"] = family["骨架"].map(mode_by_group(all_data, "骨架", LABEL_COL))
    family["骨架预览"] = family["骨架"].str.slice(0, 40)
    family = family.sort_values("样本数", ascending=False).reset_index(drop=True)
    return family.head(top_k).drop(columns=["骨架"]), family


def plot_audit(duplicate_audit, family):
    """
    左图：实测重复率 vs 文档声明（全0，但要把"0"画成看得见的证据）
    右图：骨架家族规模分布——只有1条的骨架 vs 上百条的骨架
    坑点:右图横轴必须对数，因为"1条"那一档有几十万个骨架，线性轴会把其余全压没
    """
    figure, axes = plt.subplots(1, 2, figsize=(15, 5.5))

    tidy = []
    for _, record in duplicate_audit.iterrows():
        tidy.append({"范围": record["范围"], "口径": "实测", "数值": record["实测重复率%"]})
        if not pd.isna(record["文档声明重复率%"]):
            tidy.append({"范围": record["范围"], "口径": "文档声明", "数值": record["文档声明重复率%"]})
    tidy = pd.DataFrame(tidy)
    order = duplicate_audit["范围"].tolist()[::-1]
    # palette给成"口径名->颜色"的字典，而不是两个颜色的列表：
    # 列表是按hue取值排序后对位着色的，hue顺序一变就张冠李戴，字典不会
    sns.barplot(data=tidy, y="范围", x="数值", hue="口径", order=order,
                hue_order=["实测", "文档声明"],
                palette={"实测": "#C44E52", "文档声明": "#4C72B0"}, ax=axes[0])
    axes[0].set_title("完全重复：实测 vs 文档声明（都是0，这条是复核结论）")
    axes[0].set_xlabel("占本范围样本数的比例 %")
    axes[0].set_ylabel("")
    axes[0].tick_params(axis="y", labelsize=8)
    axes[0].legend(title="来源")

    size_hist = family["样本数"].value_counts().sort_index()
    axes[1].bar(size_hist.index.astype(str), size_hist.values, color="#4C72B0")
    axes[1].set_yscale("log")
    for x, (size, count) in enumerate(zip(size_hist.index, size_hist.values)):
        axes[1].text(x, count, f"{int(count):,}", ha="center", va="bottom", fontsize=7)
    axes[1].set_title("骨架家族规模分布（1=真的唯一，越大越是明显套模板）")
    axes[1].set_xlabel("同一骨架的样本条数")
    axes[1].set_ylabel("骨架个数（对数刻度）")
    figure.tight_layout()
    return save_figure(figure, "22_duplicate_and_template_audit.png")


def plot_top_families(family, top_k=15):
    """
    横向条形图：最大的几个骨架家族，颜色标"是否跨切分"
    读法:家族越大、又跨了切分，说明同一句模板的话换个数字就同时出现在训练集和测试集，
        这是"完全重复=0"背后真正的泄漏风险，答辩要主动说
    """
    top = family.head(top_k).copy()
    cross_name, inside_name = "跨切分", "只在同一切分内"
    top["标签"] = np.where(top["涉及切分数"] > 1, cross_name, inside_name)
    top["预览"] = top["骨架预览"].str.slice(0, 34)

    figure, axes = plt.subplots(figsize=(12, 6))
    # palette的key必须和hue的实际取值一字不差，写错就全变成默认色，图例也白搭
    sns.barplot(data=top.sort_values("样本数"), x="样本数", y="预览",
                hue="标签", hue_order=[inside_name, cross_name],
                palette={inside_name: "#4C72B0", cross_name: "#C44E52"}, ax=axes)
    for container in axes.containers:
        if container:
            axes.bar_label(container, padding=3, fontsize=8)
    axes.set_title(f"最大的{top_k}个骨架家族（同一模板换个数字/品牌就成一条新样本）")
    axes.set_xlabel("该骨架下的样本条数")
    axes.set_ylabel("骨架预览（前34字，数字替成N、网址替成U、【】替成B）")
    axes.tick_params(axis="y", labelsize=8)
    return save_figure(figure, "23_top_template_families.png")


if __name__ == "__main__":
    duplicate_audit = build_duplicate_audit()
    print("=" * 30, "重复与泄漏对账")
    print(duplicate_audit.to_string(index=False))
    save_table(duplicate_audit, "09_duplicate_audit.csv")

    family_top, family_all = build_family_table()
    plot_audit(duplicate_audit, family_all)
    plot_top_families(family_top)
    print("=" * 30, "最大的15个骨架家族")
    print(family_top.head(15).to_string(index=False))
    print(f"骨架总数{len(family_all):,}，样本总数{len(all_data):,}，"
          f"平均每个骨架{len(all_data) / len(family_all):.2f}条")
    save_table(family_top, "09_template_families_top.csv")
    save_table(build_size_distribution(family_all), "09_template_family_stats.csv")
