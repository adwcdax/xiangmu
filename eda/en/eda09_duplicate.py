"""
小项目9：重复文本分析（条形图）
目标：答辩第二条的"重复"证据。EMSCAD原始表里存在逐字重复的职位描述，
      切分前不去重会让同一篇文案同时出现在训练集和测试集，分数虚高
步骤：
1,统计三份切分各自的重复行数和重复率，并按标签拆开看
2,检查同一文本是否被打上不同标签（标注冲突）
3,把重复最多的若干条画出来，人工判断是否要合并
教学出处：黑马new 第2天 §5 用 set(chain(...)) 统计不重复词数；投满分课件没有任何去重代码
          （README里把 minhash 去重记为后续阶段，本图只负责"把问题量化出来"）
"""

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

from config import Config
from eda_common import (LABEL_COL, add_label_names, label_colors,
                        label_order, load_split, save_figure, save_table)

config_obj = Config()

# 步骤：
# 1,三份切分分别读进来，key用英文切分名（文件名口径），列里的值是中文
frames = {name: add_label_names(load_split(name)) for name in ["train", "dev", "test"]}
train_data = frames["train"]
split_order = [config_obj.split_name_map[name] for name in ["train", "dev", "test"]]


def build_split_dup_table():
    """
    每份切分内部：有多少行的文本和别的行完全一样
    注意:duplicated(keep=False)标记一组里的所有行，duplicated()只标记第2次及以后的，
        所以"涉及重复的行数"是组内全部，"多余副本数"才是可以删掉的数量
    """
    rows = []
    for split_name, data in frames.items():
        dup_mask = data["text"].duplicated(keep=False)
        row = {"数据集": config_obj.split_name_map[split_name],
               "总行数": len(data),
               "涉及重复的行数": int(dup_mask.sum()),
               "重复组数": int(data.loc[dup_mask, "text"].nunique()),
               "多余副本数": int(data["text"].duplicated().sum()),
               "重复率%": round(data["text"].duplicated().mean() * 100, 2)}
        # 按标签各算一次重复率，看虚假类是不是更依赖模板文案
        for label_name, sub in data.groupby(LABEL_COL):
            row[f"{label_name}重复率%"] = round(sub["text"].duplicated().mean() * 100, 2)
        rows.append(row)
    return pd.DataFrame(rows)


def plot_split_dup(table):
    """
    分组条形图：横轴数据集，hue区分标签，纵轴该类内部的重复率
    """
    tidy_rows = []
    for _, record in table.iterrows():
        for label_name in label_order():
            tidy_rows.append({"数据集": record["数据集"], LABEL_COL: label_name,
                              "重复率%": record[f"{label_name}重复率%"]})
    tidy = pd.DataFrame(tidy_rows)

    figure, axes = plt.subplots(figsize=(9, 5))
    sns.barplot(data=tidy, x="数据集", y="重复率%", hue=LABEL_COL,
                order=split_order, hue_order=label_order(),
                palette=label_colors(), ax=axes)
    for patch in axes.containers:
        axes.bar_label(patch, fmt="%.2f")
    axes.set_title("各数据集内部的重复文本占比（按标签分组）")
    axes.set_xlabel("数据集")
    axes.set_ylabel("该类样本中的重复率 %")
    axes.legend(title="标签")
    return save_figure(figure, "15_duplicate_rate_by_split.png")


def plot_top_duplicates(top_k=None):
    """
    重复次数最多的文本
    要点1:正文是英文语料，只截前45字符，否则图被一行文字撑爆；这是数据原文，不翻译
    要点2:同一文本出现两种标签就是标注冲突，用红色单独标出来
    """
    top_k = top_k or config_obj.duplicate_top_k
    grouped = train_data.groupby("text")
    counts = grouped.size().sort_values(ascending=False)
    counts = counts[counts > 1].head(top_k)
    labels = grouped[LABEL_COL].agg(lambda s: "/".join(sorted(set(s))))
    preview = [text[:45] for text in counts.index]

    figure, axes = plt.subplots(figsize=(10, 7))
    colors = [config_obj.color_map["虚假职位"] if "/" in labels.loc[text]
              else config_obj.color_map["真实职位"] for text in counts.index]
    axes.barh(preview, counts.values, color=colors)
    axes.set_title(f"重复次数最多的文本 前{top_k}条（红=同一文本出现多种标签，属标注冲突）")
    axes.set_xlabel("出现次数")
    axes.set_ylabel("文本前45字符（语料原文，不翻译）")
    figure.tight_layout()
    return save_figure(figure, "16_top_duplicates.png")


def build_conflict_table():
    """
    标注冲突：一段文本同时被标成真实职位和虚假职位
    这是清洗环节最难回答的问题，答辩大概率被问，一定要拿出数字
    """
    label_counts = train_data.groupby("text")[LABEL_COL].nunique()
    conflict_texts = label_counts[label_counts > 1].index
    rows = []
    for text in conflict_texts:
        sub = train_data[train_data["text"] == text]
        rows.append({"文本预览（语料原文）": text[:60], "行数": len(sub),
                     "出现的标签": "/".join(sorted(set(sub[LABEL_COL])))})
    # 显式给列名：0 冲突时也要写出表头，下游读到的是空表而不是空文件
    return pd.DataFrame(rows, columns=["文本预览（语料原文）", "行数", "出现的标签"])


if __name__ == "__main__":
    split_table = build_split_dup_table()
    print(split_table.to_string(index=False))
    save_table(split_table, "09_duplicate_rate.csv")
    plot_split_dup(split_table)

    conflict_table = build_conflict_table()
    print(f"标注冲突文本数：{len(conflict_table)}")
    if len(conflict_table) > 0:
        print(conflict_table.to_string(index=False))
    # 无冲突也要落表：只在>0时写会让上一轮的冲突结果留在csv里冒充现状
    save_table(conflict_table, "09_label_conflict.csv")

    plot_top_duplicates()
