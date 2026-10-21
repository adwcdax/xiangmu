"""
小项目3：文本长度箱线图（boxplot）
目标：答辩文档点名"箱线图"，用它看各类的中位数、四分位距和离群点数量
步骤：
1,读三份切分并拼接
2,超长样本先截到一个上限，否则几条3000字的样本会把箱体压成一条线
3,按"数据集 × 塌回二分类"画一张，按"10类"画一张
4,输出四分位数和离群点统计表
教学出处：没有。投满分课件和黑马new day02 都只有 countplot / displot / stripplot，
          箱线图是按要求新写的，API是 sns.boxplot（seaborn 0.13 写法：data+x+y+hue）

新数据下这张图的两个口径决定：
- 10类箱线图只画训练集。三份切分×10类=30个箱体，横轴放不下去，
  而切分之间是否一致这件事zh01的占比热力图已经答过了。
- 旧版这里写的是"欺诈类中位数92字、无风险165字，两类箱体错开是模态构成带来的假象"。
  那句辛普森悖论原来靠index.tsv的modality列，新数据删掉了这一列，但结论没有撤，
  换了依据：用group前缀推出的"来源形态"是同一个混杂，而且方向完全一致——
  整体 诈骗中位119字 < 无风险124字；可同一来源形态内部诈骗反而更长
  （案件切片 77 vs 48 字，单条文本 164 vs 153 字）。
  原因是诈骗侧案件切片占38.3%、无风险侧只占28.6%，短来源把诈骗的整体中位数拉了下去。
  这四行数字在 csv/03_length_boxplot_stats.csv 的"来源形态内×二分类"分组口径里。
  另一层含义：类别之间的长度差也有一部分是来源构成带出来的，不是话术本身长——见zh10图27。
"""

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

from config import Config
from eda_common import (CLASS_COL, GROUP_KIND_COL, LABEL_COL, SPLIT_COL, class_order,
                        cn_length, label_colors, label_order, load_all_frame,
                        load_train_frame, save_figure, save_table)

config_obj = Config()

# 步骤：
# 1,读三份切分并拼接（load_all_frame里已经把切分名和标签名换成中文）
all_data = load_all_frame()
train_data = load_train_frame()
split_order = [config_obj.split_name_map[name] for name in ["train", "dev", "test"]]

# 2,造一个截断列
# 只影响显示，不动原始数据；离群点的真实数值在统计表里看
# 列名直接给中文，因为seaborn拿y列名当轴标签，图上不会出现char_len这种英文
clip_col = f"{cn_length(config_obj.char_len_col)}（截断至{config_obj.length_clip}）"
all_data[clip_col] = all_data[config_obj.char_len_col].clip(upper=config_obj.length_clip)
train_data[clip_col] = train_data[config_obj.char_len_col].clip(upper=config_obj.length_clip)


def plot_boxplot_by_split():
    """
    箱线图：横轴数据集，hue区分塌回二类，纵轴字数
    要点1:whis=1.5是默认值，意思是超过 Q3+1.5*IQR 的点算离群点，逐个画出来
    要点2:seaborn 0.13 已经把 sym 参数删掉了（网上老教程还在写 sym='+'），
          调离群点只能用 fliersize
    要点3:三类柱子都要显式给order/hue_order，不然seaborn按出现顺序排，
          每次跑出来左右可能互换，图和PPT里的说明就对不上了
    """
    figure, axes = plt.subplots(figsize=(10, 5))
    sns.boxplot(data=all_data, x=SPLIT_COL, y=clip_col, hue=LABEL_COL,
                order=split_order, hue_order=label_order(),
                whis=1.5, fliersize=3, palette=label_colors(),
                fill=True, ax=axes)
    axes.set_title(f"文本字数箱线图（按数据集和标签分组，纵轴截断到{config_obj.length_clip}字）")
    axes.set_xlabel("数据集")
    axes.set_ylabel("字数")
    axes.legend(title="标签")
    return save_figure(figure, "09_length_boxplot_splits.png")


def plot_boxplot_by_class():
    """
    箱线图：训练集10类，横向箱体（类别名长，横向才写得下）
    读法:箱体宽度=四分位距， whisker长度=离群上界，右侧散点=离群点
         10类箱体在"长度"这件事上其实很接近（中位数107~161），
         这本身就是结论之一：中文侧不太能靠长度把10类分开
    """
    order = (train_data.groupby(CLASS_COL)[config_obj.char_len_col].median()
             .sort_values().index.tolist())
    # 颜色跟着类别走，但"无风险"必须是蓝色，其余不强行统一色相，
    # 用class_palette保证和zh01、zh07的配色一致
    colors = [config_obj.class_palette[class_order().index(name)] for name in order]

    figure, axes = plt.subplots(figsize=(10, 6.5))
    sns.boxplot(data=train_data, y=CLASS_COL, x=clip_col, hue=CLASS_COL,
                order=order, hue_order=order, palette=colors,
                whis=1.5, fliersize=2, legend=False, ax=axes)
    axes.set_title(f"训练集10类字数箱线图（纵轴按中位数升序，横轴截断到{config_obj.length_clip}字）")
    axes.set_xlabel("字数")
    axes.set_ylabel("诈骗类别")
    return save_figure(figure, "10_length_boxplot_class.png")


def plot_boxplot_by_group_kind():
    """
    混杂检查：按"来源形态"画箱线图
    为什么要单独画这张：案件切片（case:）是中位67字的短文本，单条文本（txt:）是中位159字的长文本，
    而不同类别里两种来源的占比不一样。所以"某类更长"很可能只是"某类里长文本来源占比更高"，
    这张图给zh03和zh07的结论都打个折，答辩被追问时这是我能自己说出来的那一层
    """
    figure, axes = plt.subplots(figsize=(8, 5))
    order = list(config_obj.group_kind_name_map.values())
    sns.boxplot(data=all_data, x=GROUP_KIND_COL, y=clip_col, hue=LABEL_COL,
                order=order, hue_order=label_order(),
                palette=label_colors(), whis=1.5, fliersize=3, ax=axes)
    axes.set_title("按来源形态分组的字数箱线图（案件切片明显比单条文本短，这是类别间长度差的一个混杂）")
    axes.set_xlabel("来源形态（来自index.tsv的group前缀）")
    axes.set_ylabel("字数")
    axes.legend(title="标签")
    return save_figure(figure, "11_length_boxplot_group_kind.png")


def build_table():
    """
    Q1/中位数/Q3/IQR/离群上界/离群点数
    IQR = Q3 - Q1；离群点上界 = Q3 + 1.5 * IQR
    分组维度三个：数据集×二类、训练集×10类、来源形态内×二类，都在一张表里
    最后一组是给图11配数的：整体"诈骗比无风险短"到底是不是话术本身的差别，
    只有在同一来源形态内部比才说得清，这几个中位数就是答辩当场要念的数字，用"分组口径"区分
    """
    rows = []
    for (split_name, label_name), sub in all_data.groupby([SPLIT_COL, LABEL_COL]):
        q1, q2, q3 = np.percentile(sub[config_obj.char_len_col], [25, 50, 75])
        iqr = q3 - q1
        upper = q3 + 1.5 * iqr
        rows.append({
            "分组口径": "数据集×二分类", "数据集": split_name, "分组": label_name,
            "样本数": len(sub), "Q1": int(q1), "中位数": int(q2), "Q3": int(q3),
            "IQR": int(iqr), "离群上界": int(upper),
            "离群点数": int((sub[config_obj.char_len_col] > upper).sum()),
            "实际最大": int(sub[config_obj.char_len_col].max()),
        })
    for group_col, group_name in [(CLASS_COL, "训练集×10类"),
                                  (GROUP_KIND_COL, "全量×来源形态")]:
        frame = train_data if group_name == "训练集×10类" else all_data
        for name, sub in frame.groupby(group_col):
            q1, q2, q3 = np.percentile(sub[config_obj.char_len_col], [25, 50, 75])
            iqr = q3 - q1
            upper = q3 + 1.5 * iqr
            rows.append({
                "分组口径": group_name, "数据集": "训练集" if group_name == "训练集×10类" else "三份合计",
                "分组": name, "样本数": len(sub),
                "Q1": int(q1), "中位数": int(q2), "Q3": int(q3), "IQR": int(iqr),
                "离群上界": int(upper),
                "离群点数": int((sub[config_obj.char_len_col] > upper).sum()),
                "实际最大": int(sub[config_obj.char_len_col].max()),
            })
    for (kind_name, label_name), sub in all_data.groupby([GROUP_KIND_COL, LABEL_COL]):
        q1, q2, q3 = np.percentile(sub[config_obj.char_len_col], [25, 50, 75])
        iqr = q3 - q1
        upper = q3 + 1.5 * iqr
        rows.append({
            "分组口径": "来源形态内×二分类", "数据集": "三份合计",
            "分组": f"{kind_name}-{label_name}", "样本数": len(sub),
            "Q1": int(q1), "中位数": int(q2), "Q3": int(q3), "IQR": int(iqr),
            "离群上界": int(upper),
            "离群点数": int((sub[config_obj.char_len_col] > upper).sum()),
            "实际最大": int(sub[config_obj.char_len_col].max()),
        })
    return (pd.DataFrame(rows)
            .sort_values(["分组口径", "数据集", "中位数"]).reset_index(drop=True))


if __name__ == "__main__":
    plot_boxplot_by_split()
    plot_boxplot_by_class()
    plot_boxplot_by_group_kind()
    table = build_table()
    print(table.to_string(index=False))
    save_table(table, "03_length_boxplot_stats.csv")
