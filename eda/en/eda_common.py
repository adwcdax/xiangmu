"""
可视化公共工具
步骤：
1,配置中文标题用的字体
2,读数据（沿用data_process的读取口径）
3,加长度列
4,把标签编号和切分名翻译成中文
5,统一保存图片和统计表
每个图脚本都import这个文件，路径、口径和中英文对照只写一次
"""

import os

# 步骤：
# 1,配置字体
# matplotlib默认字体画不出中文，标题会变成方框
import matplotlib

matplotlib.use("Agg")  # 只保存图片不弹窗，批量跑图时用无窗口后端更稳
import matplotlib.pyplot as plt
import pandas as pd

plt.rcParams["font.sans-serif"] = ["Microsoft YaHei", "SimHei", "DejaVu Sans"]
# 中文字体下负号的minus会被当成缺字，强制用unicode减号
plt.rcParams["axes.unicode_minus"] = False

from config import Config

config_obj = Config()

# 图上统一用的中文列名，脚本里只引用这两个变量，改文案不用逐个图去搜
SPLIT_COL = "切分"
LABEL_COL = "标签"


# 2,读数据
def load_split(split_name="train"):
    """
    按切分名读取 data_process 产出的文本
    参数1:切分名 train/dev/test（英文，是文件口径）
    返回:带中文"切分"列的DataFrame
    """
    path_map = {
        "train": config_obj.train_data_path,
        "dev": config_obj.dev_data_path,
        "test": config_obj.test_data_path,
    }
    # 参数1:数据路径  参数2起:读取口径（tab分隔、QUOTE_NONE、空串不当NaN）
    data = pd.read_csv(path_map[split_name], **config_obj.read_options)
    # 加一列标记来源，方便把三份数据拼在一起比较；列值直接给中文
    data[SPLIT_COL] = config_obj.split_name_map[split_name]
    return data


# 3,加长度列
def add_length_columns(data):
    """
    给数据加字符数和词数两列（列名保持英文，画图时用cn_length换成中文）
    思路：
    法1:字符数用str.len()(最简单)
    法2:词数用str.split()再str.len()，英文按空白切词
    """
    data[config_obj.char_len_col] = data["text"].str.len()
    data[config_obj.word_len_col] = data["text"].str.split().str.len()
    return data


def cn_length(length_col):
    """
    英文列名 -> 图上显示的中文名
    """
    return config_obj.length_name_map[length_col]


def length_color(length_col):
    """
    长度口径的固定配色，保证同一口径在不同图里颜色一致
    """
    return "#4C72B0" if length_col == config_obj.word_len_col else "#C44E52"


# 4,标签编号翻译成中文标签名
def load_label_names():
    """
    读class.txt，行号即标签值
    注意:用splitlines而不是split('\\n')，文件末尾有换行时split会多出一个空字符串
    """
    with open(config_obj.label_data_path, "r", encoding="utf-8") as f:
        return f.read().splitlines()


def label_order():
    """
    按class.txt的行序给出中文标签列表，画图的hue_order和palette都按这个顺序给，
    不指定的话seaborn按出现顺序排，不同图之间颜色可能串
    """
    return [config_obj.label_name_map[name] for name in load_label_names()]


def label_colors():
    """
    和label_order一一对应的颜色列表
    """
    return [config_obj.color_map[name] for name in label_order()]


def add_label_names(data):
    """
    加"标签"列给图用；横轴用中文名比用0/1好读，也不给答辩老师留英文
    """
    class_list = load_label_names()
    # 标签是整数编号，先按编号取class.txt里的英文名，再查中文映射表
    data[LABEL_COL] = data["label"].map(
        lambda x: config_obj.label_name_map[class_list[int(x)]])
    return data


def load_train_frame():
    """
    一步到位：读训练集 + 长度列 + 中文标签名，图脚本里只需要这一句
    """
    data = load_split("train")
    data = add_length_columns(data)
    return add_label_names(data)


def load_all_frame():
    """
    三份切分拼在一起，带长度列和中文标签名
    """
    frames = []
    for split_name in ["train", "dev", "test"]:
        data = load_split(split_name)
        data = add_length_columns(data)
        frames.append(add_label_names(data))
    return pd.concat(frames, ignore_index=True)


# 5,统一保存
def save_figure(figure, file_name):
    """
    保存图片到代码文件夹下的子文件夹 figs/
    dpi=150是PPT插图够用的清晰度；bbox_inches='tight'防止标题被裁掉
    """
    os.makedirs(config_obj.fig_dir, exist_ok=True)
    save_path = os.path.join(config_obj.fig_dir, file_name)
    figure.savefig(save_path, dpi=150, bbox_inches="tight")
    plt.close(figure)
    print(f"图已保存：{save_path}")
    return save_path


def save_table(table, file_name):
    """
    把图背后的统计值另存一份csv到子文件夹 csv/，答辩被追问具体数字时能直接查
    """
    os.makedirs(config_obj.csv_dir, exist_ok=True)
    save_path = os.path.join(config_obj.csv_dir, file_name)
    table.to_csv(save_path, index=False, encoding="utf-8-sig")
    print(f"表已保存：{save_path}")
    return save_path
