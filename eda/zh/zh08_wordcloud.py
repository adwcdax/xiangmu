"""
小项目8：类别词云
目标：把每类话术的高频字样画成一眼能看懂的图，给"欺诈话术长什么样"一个直观证据
步骤：
1,先确认wordcloud库在不在（本机装不上，见下面的坑点）
2,用字符n-gram统计每类的词频（不依赖jieba）
3,能画就每类一张词云，画不了就落一张词频表并打印说明
教学出处：黑马new 第2天 §5 词云用 wordcloud + jieba.lcut

坑点（这两条决定了这个脚本现在的行为，答辩要如实讲）：
1,本机 E:\\Anaconda\\Lib\\site-packages 不可写（WinError 5），pip install jieba wordcloud
   装不上；而跑python又必须带 PYTHONNOUSERSITE=1（用户目录里的numpy 2.x会把anaconda的
   pandas打挂），所以 --user 安装也会被屏蔽。结论：词云图当前环境画不出来，不是代码问题。
2,词云保留代码而不是删掉：换一台装了库的机器就能直接出图。脚本遇到缺库会打印SKIP并退出码0，
   这样 zh_all.py 不会因为一个附属图跑挂。
3,频率来源用 char_wb n-gram而不是jieba分词，和zh07同一口径，两张图的词能互相对上。
"""

import os

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import CountVectorizer

from config import Config
from eda_common import (CLASS_COL, class_order, load_train_frame, save_figure,
                        save_table, config_obj)

train_data = load_train_frame()
# 和zh07用同一份抽样（同样的seed、同样的上限），两张图的词才可比
sampled = (train_data.sample(n=min(config_obj.keyword_sample_limit, len(train_data)),
                             random_state=42).reset_index(drop=True))

vectorizer = CountVectorizer(analyzer="char_wb", ngram_range=config_obj.ngram_range,
                             min_df=config_obj.ngram_min_df)
matrix = vectorizer.fit_transform(sampled["text"])
vocabulary = vectorizer.get_feature_names_out()


def build_frequency_table():
    """
    每类 top keyword 的出现次数（注意是"次数"，zh07那张表用的是"文档数+lift"）
    一个n-gram在一行里出现3次，这里记3，zh07的组内文档数记1，两张表数字不一样是正常的
    """
    rows = []
    for class_name in class_order():
        inside = (sampled[CLASS_COL] == class_name).values
        counts = np.asarray(matrix[inside].sum(axis=0)).ravel()
        frame = pd.DataFrame({"n-gram": vocabulary, "出现次数": counts.astype(int)})
        frame = frame[frame["出现次数"] > 0].sort_values("出现次数", ascending=False)
        frame.insert(0, "诈骗类别", class_name)
        frame.insert(1, "该类样本数", int(inside.sum()))
        rows.append(frame.head(60))
    return pd.concat(rows, ignore_index=True)


def plot_wordclouds(frequency_table):
    """
    每类一张词云，3×4排开
    要点1:WordCloud必须给font_path，否则中文全画成方框——
         这个坑和matplotlib那个rcParams是两回事，rcParams管不到WordCloud内部
    要点2:频率直接用统计表喂generate_from_frequencies，不再重读文本，
         保证词云上的数和CSV表里的数完全一致
    """
    try:
        from wordcloud import WordCloud
    except ImportError:
        print("SKIP 词云：当前环境没有wordcloud库（site-packages不可写装不上）。"
              "词频表已经落盘，看图改用figs/19、20两张lift图。")
        return None
    import matplotlib.pyplot as plt

    columns = 4
    rows = (len(class_order()) + columns - 1) // columns
    figure, axes = plt.subplots(rows, columns, figsize=(columns * 4, rows * 3.2))
    for index, (class_name, sub) in enumerate(frequency_table.groupby("诈骗类别", sort=False)):
        axes_flat = axes.flatten() if hasattr(axes, "flatten") else [axes]
        cell = axes_flat[index]
        words = dict(zip(sub["n-gram"], sub["出现次数"]))
        cloud = WordCloud(font_path=config_obj.wordcloud_font_path,
                          background_color="white", width=600, height=400,
                          max_words=80, colormap="Reds" if index else "Blues")
        cell.imshow(cloud.generate_from_frequencies(words), interpolation="bilinear")
        cell.set_title(f"{class_name}（抽样{int(sub['该类样本数'].iloc[0]):,}条）", fontsize=10)
        cell.axis("off")
    for index in range(len(frequency_table["诈骗类别"].unique()), rows * columns):
        axes.flatten()[index].axis("off")
    figure.suptitle(f"10类词云（char_wb {config_obj.ngram_range}字符n-gram，非jieba分词）")
    figure.tight_layout()
    return save_figure(figure, "21_wordcloud_by_class.png")


if __name__ == "__main__":
    frequency_table = build_frequency_table()
    print(frequency_table.groupby("诈骗类别", sort=False).head(5).to_string(index=False))
    save_table(frequency_table, "08_wordcloud_frequency.csv")
    path = plot_wordclouds(frequency_table)
    if path is None:
        print(f"（本轮没有 {os.path.join(Config().fig_dir, '21_wordcloud_by_class.png')}，"
              f"词频证据看 08_wordcloud_frequency.csv 和 zh07 的两张lift图）")
