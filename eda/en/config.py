# 配置类
# 可视化小项目的所有路径和可调参数集中在这里，图脚本里不写死路径
import csv
import os

# 当前文件所在目录的绝对路径，保证不管在哪个目录运行脚本都能找到数据
# 本文件在 <repo>/eda/en/，语料在 <repo>/data/data_process/，所以往上退两级到仓库根
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", ".."))
PROCESS_DIR = os.path.join(ROOT_DIR, "data", "data_process")


class Config:

    # 上游 data_process.py 产出的三份数据（只读，不在这里改）
    train_data_path = os.path.join(PROCESS_DIR, "train.txt")
    dev_data_path = os.path.join(PROCESS_DIR, "dev.txt")
    test_data_path = os.path.join(PROCESS_DIR, "test.txt")
    label_data_path = os.path.join(PROCESS_DIR, "class.txt")
    stopwords_data_path = os.path.join(PROCESS_DIR, "stopwords.txt")

    # 图的输出目录（答辩PPT要插图，所以必须落盘成png，不能只plt.show）
    fig_dir = os.path.join(BASE_DIR, "figs")
    # 图表背后的统计值落一份csv，写PPT和答辩查数用
    csv_dir = os.path.join(BASE_DIR, "csv")

    # 读取口径：文案内含双引号，默认引号解析会吞行，QUOTE_NONE必须保留
    read_options = {
        "sep": "\t",
        "names": ["text", "label"],
        "dtype": {"text": str},
        "keep_default_na": False,
        "quoting": csv.QUOTE_NONE,
        "encoding": "utf-8",
    }

    # 长度口径：英文文本按空格切词数更贴近模型看到的token量级，字符数作为对照
    char_len_col = "char_len"
    word_len_col = "word_len"

    # 图上的文字要给答辩老师看，全部用中文；数据里存的是英文，所以翻译集中在这里做一次
    # 注意:关键词本身（petroleum、clerk这些）不能翻，翻了就和语料对不上，图里保留原文
    label_name_map = {"legitimate": "真实职位", "fraudulent": "虚假职位"}
    split_name_map = {"train": "训练集", "dev": "验证集", "test": "测试集"}
    length_name_map = {char_len_col: "字符数", word_len_col: "词数"}
    keyword_tag_map = {"fraud_docs": "虚假职位文档数", "legit_docs": "真实职位文档数"}

    # 配色也只在这里定义，图上"蓝=真实、红=虚假"的约定所有小项目共用
    color_map = {"真实职位": "#4C72B0", "虚假职位": "#C44E52"}

    # 分位数取哪几档，用来定下游模型的截断长度
    percentile_list = [50, 75, 90, 95, 99]

    # 箱线图/散点图把超长样本压到这里，否则少数8000字的样本会把主体挤成一条线
    length_clip = 800

    # 关键词图的参数：至少出现这么多次才参与统计，避免生僻词噪声
    keyword_min_df = 60
    keyword_top_k = 15

    # 重复文本图取前几组
    duplicate_top_k = 15


if __name__ == '__main__':
    # assert后跟bool类型表达式, 如果为True则通过, 否则抛出AssertionError异常
    assert Config.train_data_path.endswith("data_process\\train.txt") or \
        Config.train_data_path.endswith("data_process/train.txt")
    assert os.path.exists(Config.train_data_path), "训练集路径不存在，检查data_process是否跑过"
    assert os.path.exists(Config.label_data_path), "标签表路径不存在"
    # 中文映射必须覆盖class.txt里的每一个标签，漏一个图上就会露出英文
    with open(Config.label_data_path, "r", encoding="utf-8") as f:
        class_list = f.read().splitlines()
    assert set(class_list) == set(Config.label_name_map), "label_name_map 和 class.txt 不一致"
    assert set(Config.length_name_map) == {Config.char_len_col, Config.word_len_col}
    print("可视化配置文件加载成功")
    print("图输出目录:", Config.fig_dir)
