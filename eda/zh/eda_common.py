"""
中文语料可视化公共工具
步骤：
1,配置中文字体（标题/轴/图例全靠它，漏了就变方框）
2,读数据：txt正文 + index.tsv溯源列（sample_id、group）拼在一起
3,加中文长度口径（字数、汉字数）
4,把标签编号换成class.txt里的中文名，同时给出"10类"和"塌回二分类"两个口径
5,统一保存图片和统计表
每个图脚本都import这个文件，路径、口径和配色只写一次

2026-10-21 数据换代后本文件改动最大的两处：
- index.tsv没有 modality / label_zh 了，原来的"模态""欺诈子类"两列换成"来源形态"
  （由group前缀 case:/txt: 推出来），10类的类别名直接取自 class.txt，不再依赖label_zh。
- 标签变成10类，所以对外提供两套顺序：class_order()（10类）和label_order()（塌回2类）。
  图脚本必须先决定自己用哪一套，再取 palette，不能混。
"""

import os

# 步骤：
# 1,配置字体
# matplotlib默认字体画不出中文，标题会变成方框；本机装了微软雅黑(msyh)和黑体(simhei)
import matplotlib

matplotlib.use("Agg")  # 只保存图片不弹窗，批量跑图时用无窗口后端更稳
import matplotlib.pyplot as plt
import pandas as pd

plt.rcParams["font.sans-serif"] = ["Microsoft YaHei", "SimHei", "DejaVu Sans"]
# 中文字体下负号会被当成缺字，强制用unicode减号
plt.rcParams["axes.unicode_minus"] = False

from config import Config

config_obj = Config()

# 图上统一用的中文列名，脚本里只引用这几个变量，改文案不用逐个图去搜
SPLIT_COL = "切分"
LABEL_COL = "标签"           # 塌回二分类：无风险文本 / 诈骗文本
CLASS_COL = "诈骗类别"        # class.txt 原样10类
GROUP_COL = "溯源组"          # index.tsv 的 group 原值，形如 case:50851 / txt:00123
GROUP_KIND_COL = config_obj.group_kind_col

# 汉字正则：只统计CJK基本区块，标点、数字、英文字母都不算汉字
HAN_RE = r"[\u4e00-\u9fa5]"


# 2,读数据
# 模块级缓存：新数据一份txt就有100MB，一个脚本里四五张图各自重读一遍，
# 单跑zh01就要三分多钟，全部卡在IO上。这里按切分名缓存一次，
# 返回的是copy，所以脚本里加列、改列不会污染缓存（下一张图拿到的还是干净数据）
_SPLIT_CACHE = {}


def load_split(split_name="train"):
    """
    读一份切分：txt正文 + index.tsv的溯源列
    参数1:切分名 train/dev/test（英文，是文件口径）
    返回:带中文"切分/标签/诈骗类别/溯源组/来源形态"列的DataFrame

    坑点：index.tsv是按 split+line_no 记的行级元信息，txt是同一批行的正文，
    所以两边行数必须相等、标签必须逐行相同，否则拼出来的溯源列就是错位的。
    这里用assert把这条对齐关系写死，数据一变动就会报错而不是悄悄画错图。
    另一处坑：index.tsv的label读进来是字符串，txt的是整数，
    直接 == 比较会全部False（类型不同），必须两边都astype(int)再比。
    """
    if split_name in _SPLIT_CACHE:
        return _SPLIT_CACHE[split_name].copy()

    path_map = {
        "train": config_obj.train_data_path,
        "dev": config_obj.dev_data_path,
        "test": config_obj.test_data_path,
    }
    data = pd.read_csv(path_map[split_name], **config_obj.read_options)
    data[SPLIT_COL] = config_obj.split_name_map[split_name]

    index = pd.read_csv(config_obj.index_data_path, **config_obj.index_read_options)
    index = index[index["split"] == split_name].copy()
    # line_no是字符串读进来的，按字符串排序会变成 1,10,100，必须转成整数排
    index["line_no"] = index["line_no"].astype(int)
    index = index.sort_values("line_no").reset_index(drop=True)

    assert len(index) == len(data), f"index.tsv({split_name})行数{len(index)}和txt行数{len(data)}不一致"
    assert (index["label"].astype(int).values == data["label"].astype(int).values).all(), \
        f"index.tsv和txt的标签对不上，{split_name}的溯源列不能用"

    data[GROUP_COL] = index["group"].values
    data["样本编号"] = index["sample_id"].values
    # group前缀就是来源形态，冒号前面那段；split(":")只切第一刀，防止组名里还有冒号
    data[GROUP_KIND_COL] = (index["group"].str.split(":", n=1).str[0]
                            .map(config_obj.group_kind_name_map).values)
    assert data[GROUP_KIND_COL].notna().all(), "出现未知的group前缀，来源形态映射要补"
    data = add_label_names(data)
    _SPLIT_CACHE[split_name] = data
    return data.copy()


# 3,加长度列
def add_length_columns(data):
    """
    中文的两个长度口径：
    字数 = str.len()，包含标点数字字母，是模型实际吃进去的量级
    汉字数 = 正则计数，只看CJK字符
    坑点：不能用英文侧的 str.split().str.len()，中文整段没有空格，切出来永远是1个"词"
    """
    data[config_obj.char_len_col] = data["text"].str.len()
    data[config_obj.han_len_col] = data["text"].str.count(HAN_RE)
    return data


def cn_length(length_col):
    """
    内部列名 -> 图上显示的中文名
    """
    return config_obj.length_name_map[length_col]


def length_color(length_col):
    """
    长度口径的固定配色，保证同一口径在不同图里颜色一致
    """
    return "#4C72B0" if length_col == config_obj.char_len_col else "#C44E52"


# 4,标签编号换成中文标签名（两套口径）
def load_label_names():
    """
    读class.txt，行号即标签值（第0行=无风险，第1~9行=诈骗手法）
    注意:用splitlines而不是split('\\n')，文件末尾有换行时split会多出一个空字符串
    """
    with open(config_obj.label_data_path, "r", encoding="utf-8") as f:
        return f.read().splitlines()


def class_order():
    """
    10类的显示顺序，就是class.txt的行序
    hue_order/palette都要显式给，不然seaborn按出现顺序排，不同图之间颜色会串
    """
    return load_label_names()


def class_colors():
    """
    和class_order一一对应的颜色列表（config里给死的色板，第0个是蓝色=无风险）
    """
    return config_obj.class_palette


def binary_of(label_value):
    """
    单个标签编号 -> 塌回二分类的类名
    用 class.txt 的第0行判断是否安全类，而不是硬编码 label==0，
    这样class.txt万一调序，这里跟着变，不会悄悄把某个诈骗手法算成无风险
    """
    class_list = load_label_names()
    return (config_obj.safe_binary_name
            if class_list[int(label_value)] == class_list[config_obj.safe_label_value]
            else config_obj.fraud_binary_name)


def label_order():
    """
    塌回二分类的显示顺序：安全类在前，和class.txt的行序保持一致
    """
    return [config_obj.safe_binary_name, config_obj.fraud_binary_name]


def label_colors():
    """
    和label_order一一对应的颜色列表
    """
    return [config_obj.color_map[name] for name in label_order()]


def add_label_names(data):
    """
    同时加两列：CLASS_COL(10类原名) 和 LABEL_COL(塌回二分类)
    图脚本想用哪个口径就选哪个列名，不用各自再map一遍
    """
    class_list = load_label_names()
    data[CLASS_COL] = data["label"].astype(int).map(lambda x: class_list[x])
    data[LABEL_COL] = data["label"].map(binary_of)
    return data


def subsample_for_plot(data, random_state=42):
    """
    条带图/散点图用的抽样：训练集24.6万行全画会糊成一团黑，存图也要几十秒
    坑点1:不能只 .head()，txt是按来源排过的，取前N行会把某个来源整段取走，
         必须随机抽（固定seed保证同一份数据两次跑出来的图一模一样）
    坑点2:抽样只影响这两张"看点"的图；直方图/箱线图/统计表一律用全量，
         否则被追问"P99多少"时给的是抽样值，和CSV对不上
    """
    limit = config_obj.strip_sample_limit
    if len(data) <= limit:
        return data
    return data.sample(n=limit, random_state=random_state)


def load_manifest():
    """
    读上游 manifest.json，用来做"文档声明 vs 我实测"的对账
    返回dict；文件不在就返回None，让调用方决定是跳过还是报错——
    对账图不是主结论，不该因为一个附属文件缺失就把整轮图都跑挂
    """
    if not os.path.exists(config_obj.manifest_data_path):
        return None
    import json
    with open(config_obj.manifest_data_path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_train_frame():
    """
    一步到位：读训练集 + 长度列 + 两套标签名，图脚本里只需要这一句
    """
    return add_length_columns(load_split("train"))


def load_all_frame():
    """
    三份切分拼在一起，带长度列和两套标签名
    """
    frames = [load_split(name) for name in ["train", "dev", "test"]]
    return pd.concat([add_length_columns(f) for f in frames], ignore_index=True)


def mode_by_group(data, group_col, value_col):
    """
    每个group里出现最多的那个取值（众数），返回以group为索引的Series
    为什么要单独写这个函数而不是 groupby().agg(lambda s: s.value_counts().idxmax())：
        聚合里的lambda是"每组调用一次python函数"，中文侧有29万个组，
        两个lambda就要跑近60万次，实测要十几分钟；
        换成"先groupby两列数数量、再排序去重"，全程是pandas的C实现，几秒出结果
    """
    counts = (data.groupby([group_col, value_col]).size()
              .rename("数量").reset_index()
              .sort_values([group_col, "数量"], ascending=[True, False]))
    return counts.drop_duplicates(group_col).set_index(group_col)[value_col]


# 5,统一保存
def save_figure(figure, file_name):
    """
    保存图片到本子项目文件夹下的子文件夹 figs/
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


def clean_old_artifacts(file_names, directory):
    """
    删掉上一轮遗留、这一轮不再生成的图/表
    为什么需要：数据换代后有的图会改名或取消（比如模态图），
    旧文件留在figs/里，答辩打包时会被一起带走，讲成"这轮结果"就是错的。
    只删本脚本名单里的名字，不做目录级清空，避免误删手写的东西。
    """
    removed = []
    for name in file_names:
        path = os.path.join(directory, name)
        if os.path.exists(path):
            os.remove(path)
            removed.append(path)
    for path in removed:
        print(f"清理旧产物：{path}")
    return removed
