"""
小项目1：标签均衡图（10类 + 塌回二分类两套口径）
目标：一眼看出中文侧10类的量级差多少、三份切分有没有把比例打乱，
     并且把上游 manifest.json 声明的计数和实际读出来的计数对一遍账。
步骤：
1,读训练集，画10类样本量条形图（线性轴一张、对数轴一张）
2,把三份切分塌回成二分类，画分组条形图（纵轴用占比%，不是样本数）
3,画10类 × 三份切分的占比热力图，检查切分层级是否守恒
4,读 manifest.json，逐类比对"声明数 vs 实测数"，落成一张对账表
教学出处：黑马new 第2天 §2 标签均衡用 sns.countplot（投满分课件里没有任何画图代码）

和旧版（2类数据）的三处不同，答辩要能讲：
- 标签从2类变10类，一张countplot不够了，改成"条形 + 热力图 + 对账表"。
- 旧版画的是index.tsv的label_zh欺诈子类；那一列在新数据里没了，
  10类名字直接来自class.txt，行号就是标签值，不再需要额外映射。
- 欺诈占比从旧版的75.6%变成60.7%，仍是多数类；
  英文侧欺诈只有4.81%是少数类，两侧正负方向相反，这两句必须分开讲。
"""

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

from config import Config
from eda_common import (CLASS_COL, LABEL_COL, SPLIT_COL, class_order, label_colors,
                        label_order, load_all_frame, load_manifest,
                        load_train_frame, save_figure, save_table)

config_obj = Config()
split_order = [config_obj.split_name_map[s] for s in ["train", "dev", "test"]]


# 步骤：
# 1,读训练集（后面三张图都用全量三份切分，这里先只读训练集省内存）
train_data = load_train_frame()


def plot_class_balance():
    """
    横向条形图：10类样本量，按数量升序排（最小的在下，最大的贴着顶部）
    要点1:横向而不是纵向——类别名是"冒充公检法及政府机关类"这种8~10个字的长串，
          竖着写要么重叠要么斜45度，读图很费劲
    要点2:排序之后颜色必须跟着重排，所以palette传的是"按新顺序重排过的颜色列表"，
          不能直接把class_palette原序给它
    要点3:最大类和无风险差近70倍，线性轴上后4类挤成一根线，所以再补一张对数轴版
    """
    stat = train_data[CLASS_COL].value_counts().sort_values()
    ordered = stat.index.tolist()
    colors = [config_obj.class_palette[class_order().index(name)] for name in ordered]

    # 这里故意用matplotlib的barh而不是sns.barplot：
    # 10类各自给一个颜色，用seaborn就得写hue=类别，而带hue的条形图会把每个类别拆成
    # 一个容器、容器里其余位置填None，后面bar_label拿到None直接炸
    # （旧版2类时用sns.countplot没有这个问题，因为那时只有两组、颜色是整排给的）
    figure, axes = plt.subplots(figsize=(9, 6))
    bars = axes.barh(ordered, stat.values, color=colors)
    axes.bar_label(bars,
                   labels=[f"{int(v)}（{v / len(train_data) * 100:.2f}%）" for v in stat.values],
                   padding=3)
    axes.set_title(f"训练集10类样本量（共{len(train_data):,}条，"
                   f"最大类{stat.index[0]}占{stat.iloc[0] / len(train_data) * 100:.2f}%）")
    axes.set_xlabel("样本数")
    axes.set_ylabel("诈骗类别")
    axes.set_xlim(0, stat.max() * 1.22)
    save_figure(figure, "01_class_balance_train.png")

    # 对数轴版：只换横轴刻度，其余完全一样，两张对照着讲"长尾有多长"
    figure, axes = plt.subplots(figsize=(9, 6))
    bars = axes.barh(ordered, stat.values, color=colors)
    axes.set_xscale("log")
    axes.bar_label(bars, labels=[f"{int(v)}" for v in stat.values], padding=3)
    axes.set_title("同一份数据换成对数横轴（线性轴看不见的小类，这里才看得清）")
    axes.set_xlabel("样本数（对数刻度）")
    axes.set_ylabel("诈骗类别")
    return save_figure(figure, "02_class_balance_train_log.png")


def plot_binary_balance():
    """
    分组条形图：横轴数据集，hue区分塌回后的二类，纵轴用"该类占比%"
    目的：验证沿用上游split列之后，二分类层级的比例在三档里是否一致
    坑点1:不能画样本数。train 24.6万行、dev/test各5.3万行，同一刻度下小切分看不见；
          改成占比后三档都在0-100，一眼能比
    坑点2:条形图不能开对数轴，柱子基线是0，log(0)无定义
    """
    all_data = load_all_frame()
    stat = all_data.groupby([SPLIT_COL, LABEL_COL]).size().rename("样本数").reset_index()
    stat["占比%"] = stat["样本数"] / stat.groupby(SPLIT_COL)["样本数"].transform("sum") * 100

    figure, axes = plt.subplots(figsize=(9, 5))
    sns.barplot(data=stat, x=SPLIT_COL, y="占比%", hue=LABEL_COL,
                order=split_order, hue_order=label_order(),
                palette=label_colors(), ax=axes)
    for patch in axes.containers:
        if patch:
            axes.bar_label(patch, fmt="%.2f")
    axes.set_title("三份切分塌回二分类后的占比（沿用上游split列，三档应基本一致）")
    axes.set_xlabel("数据集")
    axes.set_ylabel("该类样本占本数据集的比例 %")
    axes.set_ylim(0, 108)
    axes.legend(title="标签")
    return save_figure(figure, "03_label_balance_splits.png")


def plot_class_share_heatmap():
    """
    热力图：行=10类，列=三份切分，格子=该类占本切分的%
    为什么不用分组条形：10类×3切分=30根柱子，要么挤成一团要么把标签转90度；
    热力图把"每类在三档里是否一致"变成"同一行三个格子的颜色是否接近"
    坑点:值要用占比而不是样本数，否则无风险那一行会把其余9行全部压成同一个颜色
    """
    all_data = load_all_frame()
    share = (all_data.groupby([CLASS_COL, SPLIT_COL]).size()
             .rename("样本数").reset_index())
    share["占比%"] = share["样本数"] / share.groupby(SPLIT_COL)["样本数"].transform("sum") * 100
    matrix = (share.pivot(index=CLASS_COL, columns=SPLIT_COL, values="占比%")
              .reindex(index=class_order(), columns=split_order))

    figure, axes = plt.subplots(figsize=(7.5, 7))
    sns.heatmap(matrix, annot=True, fmt=".2f", cmap="Blues",
                linewidths=.4, ax=axes, cbar_kws={"label": "该类占本数据集的比例 %"})
    axes.set_title("10类在三份切分中的占比（同一行三格接近=切分没打乱比例）")
    axes.set_xlabel("数据集")
    axes.set_ylabel("诈骗类别")
    save_figure(figure, "04_class_share_heatmap.png")
    return matrix


def build_manifest_reconciliation():
    """
    声明 vs 实测对账表
    manifest.json 的 splits.{train,dev,test}.class_counts 是上游声明的各类计数，
    这里把txt实际数出来的数量摆在旁边，再差一列"是否一致"
    为什么要做这张表：文档里"352,836条、各类数量、重复率0%"全是声明值，
    被问"你怎么知道数据是对的"，答案是"我自己逐类数过，和声明逐格相等"
    """
    manifest = load_manifest()
    all_data = load_all_frame()
    rows = []
    for split_name in ["train", "dev", "test"]:
        split_cn = config_obj.split_name_map[split_name]
        sub = all_data[all_data[SPLIT_COL] == split_cn]
        measured = sub[CLASS_COL].value_counts()
        declared = manifest["splits"][split_name]["class_counts"] if manifest else {}
        for class_name in class_order():
            m = int(measured.get(class_name, 0))
            d = int(declared[class_name]) if declared else np.nan
            rows.append({"数据集": split_cn, "诈骗类别": class_name,
                         "声明样本数": d, "实测样本数": m,
                         "实测占比%": round(m / len(sub) * 100, 2),
                         "是否一致": "一致" if d == m else ("缺manifest" if not declared else "不一致")})
    return pd.DataFrame(rows)


def build_table():
    """
    每个切分每个类别的数量和占比（10类口径 + 塌回二分类口径各一批行），写PPT直接抄
    """
    all_data = load_all_frame()
    rows = []
    for split_cn, sub in all_data.groupby(SPLIT_COL):
        for class_name, count in sub[CLASS_COL].value_counts().items():
            rows.append({"数据集": split_cn, "口径": "10类", "类别": class_name,
                         "数量": int(count), "占比%": round(count / len(sub) * 100, 2)})
        for binary_name, count in sub[LABEL_COL].value_counts().items():
            rows.append({"数据集": split_cn, "口径": "塌回二分类", "类别": binary_name,
                         "数量": int(count), "占比%": round(count / len(sub) * 100, 2)})
    table = pd.DataFrame(rows)
    table["_序"] = table["数据集"].map({name: i for i, name in enumerate(split_order)})
    return table.sort_values(["_序", "口径", "数量"],
                             ascending=[True, True, False]).drop(columns="_序").reset_index(drop=True)


if __name__ == "__main__":
    plot_class_balance()
    plot_binary_balance()
    plot_class_share_heatmap()
    reconcile = build_manifest_reconciliation()
    print("=" * 30, "声明 vs 实测")
    print(reconcile.to_string(index=False))
    print(f"不一致的格子数：{(reconcile['是否一致'] != '一致').sum()}")
    save_table(reconcile, "01_manifest_reconciliation.csv")
    table = build_table()
    print("=" * 30, "各类计数")
    print(table.to_string(index=False))
    save_table(table, "01_label_balance.csv")
