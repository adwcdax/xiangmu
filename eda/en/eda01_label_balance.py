"""
小项目1：标签均衡图（条形图 countplot）
目标：一眼看出两类样本差多少，为答辩里"类别不均衡"这个核心问题给出证据
步骤：
1,读训练集，画训练集标签分布条形图
2,把三份切分拼起来画分组条形图，看比例是否被切分打乱
3,输出背后的统计表
教学出处：黑马new 第2天 §2 标签均衡用 sns.countplot（投满分课件里没有任何画图代码）
"""

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

from config import Config
from eda_common import (LABEL_COL, SPLIT_COL, add_label_names, label_colors,
                        label_order, load_split, load_train_frame, save_figure,
                        save_table)

config_obj = Config()

# 步骤：
# 1,读训练集
train_data = load_train_frame()


def plot_label_balance():
    """
    条形图：横轴标签名，纵轴样本数
    注意:fraudulent只有693条，柱子会贴地，所以要在柱顶标"数量(占比)"，否则肉眼看不出有柱子
    """
    figure, axes = plt.subplots(figsize=(7, 5))
    sns.countplot(data=train_data, x=LABEL_COL, hue=LABEL_COL,
                  order=label_order(), palette=label_colors(), legend=False, ax=axes)
    total = len(train_data)
    for patch in axes.containers:
        axes.bar_label(patch,
                       labels=[f"{int(p.get_height())}\n({p.get_height() / total * 100:.2f}%)"
                               for p in patch],
                       padding=3)
    axes.set_title("训练集标签分布（二分类：真实职位 vs 虚假职位）")
    # 柱顶的"数量(占比)"要占空间，不留头部余量会和标题叠在一起
    axes.set_ylim(0, total * 1.18)
    axes.set_xlabel("标签")
    axes.set_ylabel("样本数")
    return save_figure(figure, "01_label_balance_train.png")


# 2,三份切分放在一起对比
def plot_split_balance():
    """
    分组条形图：横轴数据集，hue区分标签，纵轴用"该类占比%"
    目的：验证组级切分后两类的占比没有被切分打乱
    坑点1:这里不能画样本数。train 14276行、dev/test各1785行，
          同一刻度下小切分看不见；改成占比后三档都在0-100，一眼能比
    坑点2:条形图不能开对数轴，柱子基线是0，log(0)无定义，matplotlib会画出半截柱
    坑点3:dodge要留着（默认True），dodge=False会让两个标签的柱子重叠，矮的那根被完全挡住
    """
    frames = [load_split(name) for name in ["train", "dev", "test"]]
    all_data = pd.concat([add_label_names(data) for data in frames])
    # 先算占比：每个数据集里各标签占多少。transform("sum")按数据集广播总数，不用手写循环
    ratio = all_data.groupby([SPLIT_COL, LABEL_COL]).size().rename("样本数").reset_index()
    ratio["占比%"] = ratio["样本数"] / ratio.groupby(SPLIT_COL)["样本数"].transform("sum") * 100

    figure, axes = plt.subplots(figsize=(9, 5))
    sns.barplot(data=ratio, x=SPLIT_COL, y="占比%", hue=LABEL_COL,
                order=[config_obj.split_name_map[s] for s in ["train", "dev", "test"]],
                hue_order=label_order(), palette=label_colors(), ax=axes)
    for patch in axes.containers:
        axes.bar_label(patch, fmt="%.2f")
    axes.set_title("三份切分的标签占比对比（组级切分后两类占比应基本一致）")
    axes.set_xlabel("数据集")
    axes.set_ylabel("该类样本占本数据集的比例 %")
    axes.set_ylim(0, 108)
    axes.legend(title="标签")
    return save_figure(figure, "02_label_balance_splits.png")


# 3,图背后的统计表
def build_table():
    """
    每个切分每个类的数量和占比，写PPT时直接抄这张表
    """
    rows = []
    for split_name in ["train", "dev", "test"]:
        data = add_label_names(load_split(split_name))
        stat = data[LABEL_COL].value_counts()
        for label_name, count in stat.items():
            rows.append({"数据集": config_obj.split_name_map[split_name],
                         "标签": label_name,
                         "数量": int(count),
                         "占比%": round(count / len(data) * 100, 2)})
    return pd.DataFrame(rows)


if __name__ == "__main__":
    plot_label_balance()
    plot_split_balance()
    table = build_table()
    print(table.to_string(index=False))
    save_table(table, "01_label_balance.csv")
