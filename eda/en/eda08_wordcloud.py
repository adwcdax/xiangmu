"""
小项目8：词云（两类各一张）
目标：答辩第三条里"词云"是常见的加分展示，看两类高频词长什么样
步骤：
1,分别统计两类的高频词
2,用generate_from_frequencies画词云（比直接喂整篇文本快得多）
3,两类各存一张
教学出处：黑马new 第2天 §6 WordCloud(font_path="./SimHei.ttf", max_words=100, background_color="white")
          本项目语料是英文，词云里的词不需要分词也不需要中文字体；
          但标题是中文，中文由matplotlib的字体设置负责（见eda_common）
依赖：pip install wordcloud（当前环境未安装时脚本会给出提示并跳过，不影响其他小项目）
"""

import matplotlib.pyplot as plt
import pandas as pd
from sklearn.feature_extraction.text import CountVectorizer

from config import Config
from eda_common import LABEL_COL, label_order, load_train_frame, save_figure, save_table

config_obj = Config()

try:
    from wordcloud import WordCloud
except ImportError:
    WordCloud = None
    print("未安装 wordcloud，本小项目跳过。安装命令：pip install wordcloud")

# 步骤：
# 1,读训练集
train_data = load_train_frame()

# 停用词复用data_process产出的表，保证两处口径一致
with open(config_obj.stopwords_data_path, "r", encoding="utf-8") as f:
    stop_words = f.read().splitlines()

# 标签编号和中文名的对应，class.txt第0行是真实职位、第1行是虚假职位
label_pairs = list(enumerate(label_order()))


def build_frequencies(label_value, max_words=200):
    """
    统计某一个类的词频
    参数1:标签编号  参数2:取前多少个词
    返回:{词: 出现次数}
    注意:max_features在CountVectorizer里就是"按总频次取前N个词"
    """
    sub = train_data[train_data["label"] == label_value]["text"]
    vectorizer = CountVectorizer(stop_words=stop_words, token_pattern=r"\b[a-zA-Z]{4,}\b",
                                 max_features=max_words)
    matrix = vectorizer.fit_transform(sub)
    counts = matrix.sum(axis=0).A1
    return dict(zip(vectorizer.get_feature_names_out(), counts))


def plot_wordcloud(label_value, label_name, file_name):
    """
    词云：字号按词频
    要点1:cloud里画的是语料原文（英文），font_path只在"词云本身要显示中文"时才需要给
    要点2:标题走matplotlib，所以中文正常显示，前提是eda_common里设过font.sans-serif
    """
    if WordCloud is None:
        return None
    frequencies = build_frequencies(label_value)
    cloud = WordCloud(width=900, height=500, background_color="white",
                      max_words=len(frequencies), random_state=22,
                      colormap="Reds" if label_value == 1 else "Blues")
    cloud.generate_from_frequencies(frequencies)

    figure, axes = plt.subplots(figsize=(10, 6))
    axes.imshow(cloud, interpolation="bilinear")
    axes.axis("off")
    sample_count = int((train_data["label"] == label_value).sum())
    axes.set_title(f"高频词词云：{label_name}（样本数 {sample_count}，词为语料原文）")
    return save_figure(figure, file_name)


def build_table():
    """
    两类各自的前20高频词，词云看不清小字时用这张表
    """
    rows = []
    for label_value, label_name in label_pairs:
        frequencies = build_frequencies(label_value)
        ranked = sorted(frequencies.items(), key=lambda kv: -kv[1])[:20]
        for rank, (word, count) in enumerate(ranked, start=1):
            rows.append({LABEL_COL: label_name, "排名": rank,
                         "关键词（语料原文）": word, "出现次数": int(count)})
    return pd.DataFrame(rows)


if __name__ == "__main__":
    # 文件名用class.txt里的英文名（文件名保持ASCII，跨系统更稳），图上的标题才是中文
    from eda_common import load_label_names
    file_names = load_label_names()
    for label_value, label_name in label_pairs:
        plot_wordcloud(label_value, label_name, f"{13 + label_value}_wordcloud_{file_names[label_value]}.png")
    table = build_table()
    print(table.to_string(index=False))
    save_table(table, "08_wordcloud_top_words.csv")
