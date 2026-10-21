"""
小项目7：关键词的类别倾向（字符n-gram + lift提升度）
目标：找出"哪些字样基本只出现在某一类里"，给可解释性和后续特征工程拿证据
步骤：
1,抽样（全量24.6万行做char_wb 2~3gram会先建出上千万项的词表，内存扛不住）
2,用CountVectorizer(analyzer="char_wb")做字符n-gram文档矩阵
   —— 本机装不上jieba（Anaconda的site-packages不可写），只能绕开分词
3,算每个n-gram的"类内出现率 / 类外出现率"= lift
4,画塌回二分类的top lift条形图（左右两块）
5,画10类的top n-gram × 类别 lift热力图
教学出处：黑马new 第2天 §5 关键词用 CountVectorizer + 频率表，
          投满分课件里没有类别倾向这一项，lift是自己加的
必须知道的两个坑：
- char_wb的n-gram互相包含（"转账"和"转账吧"都可能出现），所以top列表会有一批同源词，
  答辩要主动说明这是字符级的代价，不是分词错了。
- lift高不等于"能当特征"：样本量小的弱类（网黑1539、军警1480）里，
  一个只出现几十次的串也能算出很高lift，所以表里同时给出"类内文档数"，
  低于门槛的一律不进图（门槛在config.ngram_min_df）。
"""

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from sklearn.feature_extraction.text import CountVectorizer

from config import Config
from eda_common import (CLASS_COL, LABEL_COL, class_order, label_colors, label_order,
                        load_train_frame, save_figure, save_table)

config_obj = Config()

# 步骤：
# 1,读训练集并抽样
train_data = load_train_frame()
sampled = (train_data.sample(n=min(config_obj.keyword_sample_limit, len(train_data)),
                             random_state=42)
           .reset_index(drop=True))

# 2,字符n-gram文档矩阵：binary=True表示只记"这个n-gram在不在这一行里"，
# 不记出现几次——一句话里重复三遍"转账"不该算三次证据
vectorizer = CountVectorizer(analyzer="char_wb", ngram_range=config_obj.ngram_range,
                             min_df=config_obj.ngram_min_df, binary=True)
matrix = vectorizer.fit_transform(sampled["text"])
vocabulary = vectorizer.get_feature_names_out()
print(f"抽样{len(sampled):,}条，词表{len(vocabulary):,}项"
      f"（min_df={config_obj.ngram_min_df}，低于这个出现文档数的n-gram已丢弃）")


def lift_table(group_col, group_order=None):
    """
    算某一口径下每个n-gram的"组内出现率/组外出现率"
    参数1:分组列名（LABEL_COL 或 CLASS_COL）
    参数2:组顺序，给None就按出现顺序
    返回:长表 组 / n-gram / 组内文档数 / 组内出现率% / 组外出现率% / lift
    坑点:组外出现率必须按"除本组以外的行"算，不能拿全量出现率当分母，
        否则大类会自己跟自己比，lift全部趋近1，图上一条线看不出东西
    """
    dense_groups = sampled[group_col].values
    names = group_order or sorted(set(dense_groups))
    rows = []
    for name in names:
        inside = dense_groups == name
        outside = ~inside
        in_counts = np.asarray(matrix[inside].sum(axis=0)).ravel()
        out_counts = np.asarray(matrix[outside].sum(axis=0)).ravel()
        in_rate = in_counts / max(inside.sum(), 1) * 100
        out_rate = out_counts / max(outside.sum(), 1) * 100
        # 分母加一个足够小的常数而不是0，避免"组外一次都没出现"算出inf
        lift = in_rate / np.where(out_rate > 0, out_rate, np.nan)
        kept = in_counts >= config_obj.ngram_min_df
        frame = pd.DataFrame({
            group_col: name, "n-gram": vocabulary,
            "组内文档数": in_counts.astype(int),
            "组内出现率%": np.round(in_rate, 2),
            "组外出现率%": np.round(out_rate, 3),
            "lift": np.round(lift, 2),
        })
        rows.append(frame[kept])
    return pd.concat(rows, ignore_index=True)


def plot_binary_lift(binary):
    """
    左右两个子图：塌回二分类各自的top15 lift
    为什么分两个子图而不是把两类画在一张图上：两类的"专属词"完全不同，
    画在一起只能靠颜色区分上下，读图时要把15+15个中文n-gram对到颜色上，很费劲
    """
    figure, axes = plt.subplots(1, 2, figsize=(15, 7), sharex=False)
    for index, label_name in enumerate(label_order()):
        sub = (binary[binary[LABEL_COL] == label_name]
               .sort_values("lift", ascending=False).head(config_obj.keyword_top_k))
        color = label_colors()[index]
        axes[index].barh(sub["n-gram"][::-1], sub["lift"][::-1], color=color)
        for x, y in zip(sub["lift"][::-1], range(len(sub))):
            axes[index].text(x, y, f" {x:.1f}（{int(sub['组内文档数'].values[::-1][y])}篇）",
                             va="center", fontsize=8)
        axes[index].set_title(f"{label_name}专属字样 top{config_obj.keyword_top_k}"
                              f"（抽样{len(sampled):,}条内，括号是类内文档数）")
        axes[index].set_xlabel("lift = 类内出现率 / 类外出现率")
        axes[index].set_ylabel("字符n-gram")
        axes[index].set_xlim(0, sub["lift"].max() * 1.5)
    figure.tight_layout()
    return save_figure(figure, "19_keyword_lift_binary.png")


def plot_class_heatmap(by_class):
    """
    热力图：行=10类，列=该类lift最高的8个n-gram，格子=lift值
    每行用自己的列，所以格子之间的lift不能横向比——这张图读的是"每类的招牌字样是什么"
    坑点:直接用pivot会缺列（每类的词不一样），这里逐行取自己的topN再并排，
        横轴标成"该类第1名/第2名/..."，读的时候先看词本身再看lift
    """
    top_k = config_obj.keyword_heatmap_top_k
    rows, labels = [], []
    for class_name in class_order():
        sub = (by_class[by_class[CLASS_COL] == class_name]
               .sort_values("lift", ascending=False).head(top_k))
        row = np.full(top_k, np.nan)
        row[:len(sub)] = sub["lift"].values
        rows.append(row)
        padded = list(sub["n-gram"]) + [""] * (top_k - len(sub))
        labels.append(padded)
    data = np.array(rows, dtype=float)

    figure, axes = plt.subplots(figsize=(14, 6))
    # seaborn在这里有两个用场：heatmap本体 + 顺手拿到colorbar去标lift
    heatmap = sns.heatmap(data, cmap="Reds", ax=axes, cbar=True,
                          vmin=1, vmax=np.nanmax(data), linewidths=.4,
                          annot=np.array(labels, dtype=object), fmt="",
                          annot_kws={"fontsize": 8},
                          yticklabels=class_order())
    axes.set_xticks(np.arange(top_k) + .5)
    axes.set_xticklabels([f"第{i + 1}名" for i in range(top_k)], rotation=0)
    axes.set_yticklabels(axes.get_yticklabels(), rotation=0, fontsize=9)
    # 传了ax=之后sns.heatmap返回的是坐标轴本身（不是图对象），
    # 想拿colorbar要走 axes.figure.axes[-1]，直接写 heatmap.fig 会AttributeError
    colorbar = axes.figure.axes[-1]
    colorbar.set_ylabel("lift", labelpad=10)
    axes.set_title(f"10类各自的top{top_k}专属字样（格子里是n-gram本身，颜色深浅是lift；"
                   "每行独立排名，不能横向比）")
    axes.set_xlabel("该类内按lift排名")
    axes.set_ylabel("诈骗类别")
    return save_figure(figure, "20_keyword_lift_by_class.png")


if __name__ == "__main__":
    binary = lift_table(LABEL_COL, label_order())
    by_class = lift_table(CLASS_COL, class_order())
    plot_binary_lift(binary)
    plot_class_heatmap(by_class)
    print("=" * 30, "塌回二分类 top10")
    for name in label_order():
        print(f"--- {name}")
        print(binary[binary[LABEL_COL] == name].sort_values("lift", ascending=False)
              .head(10).to_string(index=False))
    print("=" * 30, "10类各自 top5")
    for name in class_order():
        print(f"--- {name}")
        print(by_class[by_class[CLASS_COL] == name].sort_values("lift", ascending=False)
              .head(5).to_string(index=False))
    save_table(binary, "07_keyword_lift_binary.csv")
    save_table(by_class, "07_keyword_lift_by_class.csv")
