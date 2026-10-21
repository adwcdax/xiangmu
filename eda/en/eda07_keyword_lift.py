"""
小项目7：关键词类别倾向图（哪些词更可能出现在虚假职位里）
目标：把"虚假样本有什么语言特征"从感觉变成数字，答辩第八条（典型问题）的素材
步骤：
1,读停用词表（config里的stopwords.txt）
2,训练集做词频统计（CountVectorizer）
3,算每个词的类别倾向lift
4,画双向横向条形图 + 文档数对比图
教学出处：黑马new 第2天 §6 词云按 flag 选形容词，本项目是英文语料，改成按"类别倾向"选词；
          TF-IDF的"只在训练集上fit"这条口径（笔记第1天 §11）在这里同样适用
说明：图上的关键词本身是英文，那是语料原文，翻译了就没法回语料里核对，所以只有标题轴名图例翻成中文
"""

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from sklearn.feature_extraction.text import CountVectorizer

from config import Config
from eda_common import load_train_frame, save_figure, save_table

config_obj = Config()

# 步骤：
# 1,读停用词表
with open(config_obj.stopwords_data_path, "r", encoding="utf-8") as f:
    stop_words = f.read().splitlines()

# 2,词频统计
train_data = load_train_frame()

# 要点1:token_pattern限定4个以上纯字母，把 #URL_xxx# 这类掩码碎片和数字滤掉
# 要点2:min_df放在config里，意思是至少出现在60个样本中，太低就是生僻词噪声
# 要点3:这里只在训练集上fit，验证集测试集不参与，和TF-IDF的口径保持一致
vectorizer = CountVectorizer(stop_words=stop_words, token_pattern=r"\b[a-zA-Z]{4,}\b",
                             min_df=config_obj.keyword_min_df)
matrix = vectorizer.fit_transform(train_data["text"])
word_names = vectorizer.get_feature_names_out()

fraud_mask = (train_data["label"] == 1)
fraud_counts = np.asarray(matrix[fraud_mask].sum(axis=0)).ravel()
legit_counts = np.asarray(matrix[~fraud_mask].sum(axis=0)).ravel()

# 3,类别倾向
# lift = log(虚假类词频 / 真实类词频)，加1再取对数避免0除和log0
# 只按出现次数比会被词频高低带偏，所以两边都归一成"该类语料的占比"
fraud_rate = (fraud_counts + 1) / (fraud_counts.sum() + len(fraud_counts))
legit_rate = (legit_counts + 1) / (legit_counts.sum() + len(legit_counts))
lift = np.log(fraud_rate / legit_rate)

# 4,统计表列名全用中文，两张图和落盘的csv都跟着变中文
WORD_COL = "关键词"
FRAUD_DOC_COL = config_obj.keyword_tag_map["fraud_docs"]
LEGIT_DOC_COL = config_obj.keyword_tag_map["legit_docs"]
LIFT_COL = "类别倾向lift"
table = pd.DataFrame({WORD_COL: word_names, FRAUD_DOC_COL: fraud_counts.astype(int),
                      LEGIT_DOC_COL: legit_counts.astype(int), LIFT_COL: lift})


def pick_extremes():
    """
    按lift排序取两端各top_k；中间那一堆接近0的词画出来只是一片短条，没有信息
    """
    top_k = config_obj.keyword_top_k
    ordered = table.sort_values(LIFT_COL)
    return pd.concat([ordered.head(top_k), ordered.tail(top_k)])


def plot_keyword_lift():
    """
    双向横向条形图：lift>0偏虚假，lift<0偏真实
    """
    picked = pick_extremes()
    figure, axes = plt.subplots(figsize=(9, 8))
    colors = [config_obj.color_map["虚假职位"] if x > 0 else config_obj.color_map["真实职位"]
              for x in picked[LIFT_COL]]
    axes.barh(picked[WORD_COL], picked[LIFT_COL], color=colors)
    axes.axvline(0, color="black", linewidth=1)
    axes.set_title(f"关键词类别倾向（红=偏虚假职位，蓝=偏真实职位；"
                   f"共{len(table)}个候选词，各取前{config_obj.keyword_top_k}）")
    axes.set_xlabel("类别倾向 = log(虚假类词频 / 真实类词频)")
    axes.set_ylabel("关键词（语料原文，不翻译）")
    return save_figure(figure, "11_keyword_lift.png")


def plot_word_docs():
    """
    第二张：同一批词在两类里各出现在多少篇文档里
    用途：lift高但文档数只有几条的词不稳，这张图负责把"证据强度"一起展示出来
    要点1:melt把宽表(两个文档数列)变成长表(seaborn要 tidy 格式)
    要点2:横轴取对数，真实类动辄上千篇、虚假类几十篇，线性轴下虚假类贴地
    """
    picked = pick_extremes()
    tidy = picked.melt(id_vars=[WORD_COL], value_vars=[FRAUD_DOC_COL, LEGIT_DOC_COL],
                       var_name="标签", value_name="文档数")

    figure, axes = plt.subplots(figsize=(9, 8))
    sns.barplot(data=tidy, x="文档数", y=WORD_COL, hue="标签",
                order=picked[WORD_COL].tolist(),
                palette={FRAUD_DOC_COL: config_obj.color_map["虚假职位"],
                         LEGIT_DOC_COL: config_obj.color_map["真实职位"]}, ax=axes)
    axes.set_xscale("log")
    axes.set_title("候选词在两类中出现的文档数（横轴对数）")
    axes.set_xlabel("出现该词的文档数（对数刻度）")
    axes.set_ylabel("关键词（语料原文，不翻译）")
    axes.legend(title="标签")
    return save_figure(figure, "12_keyword_docs.png")


if __name__ == "__main__":
    plot_keyword_lift()
    plot_word_docs()
    print(f"候选词总数：{len(table)}")
    print(table.sort_values(LIFT_COL, ascending=False).head(config_obj.keyword_top_k)
          .to_string(index=False))
    print(table.sort_values(LIFT_COL).head(config_obj.keyword_top_k).to_string(index=False))
    save_table(table.sort_values(LIFT_COL, ascending=False), "07_keyword_lift.csv")
