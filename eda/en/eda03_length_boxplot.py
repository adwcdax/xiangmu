"""
小项目3：文本长度箱线图（boxplot）
目标：答辩文档第三条明确点名"箱线图"，用它看两类的中位数、四分位距和离群点数量
步骤：
1,读三份切分并拼接
2,超长样本先截到一个上限，否则少数8000字的样本会把箱体压成一条线
3,按"数据集×标签"画箱线图
4,输出四分位数和离群点统计表
教学出处：没有。投满分课件和黑马new day02 都只有 countplot / displot / stripplot，
          箱线图是按要求新写的，API是 sns.boxplot（seaborn 0.13 写法：data+x+y+hue）
"""

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

from config import Config
from eda_common import (LABEL_COL, SPLIT_COL, cn_length, label_colors,
                        label_order, load_all_frame, save_figure, save_table)

config_obj = Config()

# 步骤：
# 1,读三份切分并拼接（load_all_frame里已经把切分名和标签名翻译成中文）
all_data = load_all_frame()
split_order = [config_obj.split_name_map[name] for name in ["train", "dev", "test"]]

# 2,造一个截断列
# 只影响显示，不动原始数据；离群点的真实数值在统计表里看
# 列名直接给中文，因为seaborn拿y列名当轴标签，图上不会出现word_len这种英文
clip_col = f"{cn_length(config_obj.word_len_col)}（截断至{config_obj.length_clip}）"
all_data[clip_col] = all_data[config_obj.word_len_col].clip(upper=config_obj.length_clip)


def plot_boxplot():
    """
    箱线图：横轴数据集，hue区分标签，纵轴词数
    要点1:whis=1.5是默认值，意思是超过 Q3+1.5*IQR 的点算离群点，逐个画出来
    要点2:seaborn 0.13 已经把 sym 参数删掉了（网上老教程还在写 sym='+'），调离群点只能用 fliersize
    要点3:纵轴上限设在截断值附近，被截断的样本会顶在顶端，一眼能看出长尾有多长
    """
    figure, axes = plt.subplots(figsize=(10, 5))
    sns.boxplot(data=all_data, x=SPLIT_COL, y=clip_col, hue=LABEL_COL,
                order=split_order, hue_order=label_order(),
                whis=1.5, fliersize=3, palette=label_colors(),
                fill=True, ax=axes)
    axes.set_title(f"文本词数箱线图（按数据集和标签分组，纵轴截断到{config_obj.length_clip}词）")
    axes.set_xlabel("数据集")
    axes.set_ylabel("词数")
    axes.legend(title="标签")
    return save_figure(figure, "06_length_boxplot.png")


# 4,四分位数与离群点统计
def build_table():
    """
    Q1/中位数/Q3/IQR/离群上界/离群点数
    IQR = Q3 - Q1；离群点上界 = Q3 + 1.5 * IQR
    """
    rows = []
    for (split_name, label_name), sub in all_data.groupby([SPLIT_COL, LABEL_COL]):
        q1, q2, q3 = np.percentile(sub[config_obj.word_len_col], [25, 50, 75])
        iqr = q3 - q1
        upper = q3 + 1.5 * iqr
        rows.append({
            "数据集": split_name, "标签": label_name, "样本数": len(sub),
            "Q1": int(q1), "中位数": int(q2), "Q3": int(q3),
            "IQR": int(iqr), "离群上界": int(upper),
            "离群点数": int((sub[config_obj.word_len_col] > upper).sum()),
            "实际最大": int(sub[config_obj.word_len_col].max()),
        })
    return pd.DataFrame(rows).sort_values(["数据集", "标签"]).reset_index(drop=True)


if __name__ == "__main__":
    plot_boxplot()
    table = build_table()
    print(table.to_string(index=False))
    save_table(table, "03_length_boxplot_stats.csv")
