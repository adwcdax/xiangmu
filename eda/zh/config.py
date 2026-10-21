# 配置类
# 中文语料可视化小项目的所有路径和可调参数集中在这里，图脚本里不写死路径
#
# 2026-10-21 数据换代，这个文件跟着重写了，两点必须记住：
# 1) 标签从 2 类变成 10 类（class.txt 现在 10 行，行号=标签：0=无风险，1~9=诈骗手法）
#    所以标签有两个口径，每张图都要说清楚自己用的是哪一个：
#      "诈骗类别" = 10类原样，用来画标签均衡、逐类长度、逐类关键词
#      "标签"     = 把 1~9 塌回成"诈骗文本"，用来和英文侧对比、和模型的二分类判定对齐
# 2) index.tsv 的列从 8 列变成 5 列（split/line_no/sample_id/group/label），
#    旧版的 modality（短信/对话）和 label_zh（欺诈子类）两列没有了。
#    模态图不能凭 manifest 里那两个汇总数（sms 192993 / dialog 159843）逐样本画，
#    所以 zh10 从"模态长度图"改成"group 溯源审计图"——group 这一列还在，
#    而且能量化文档里"重复率0%、跨切分案件组0"这两句声明是真是假。
import csv
import os

# 当前文件所在目录的绝对路径，保证不管在哪个目录运行脚本都能找到数据
# 本文件在 <repo>/eda/zh/，语料在 <repo>/data/zh_data_process/，所以往上退两级到仓库根
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", ".."))
PROCESS_DIR = os.path.join(ROOT_DIR, "data", "zh_data_process")


class Config:

    # 上游 build_dataset_dir.py 产出的三份数据（只读，不在这里改）
    train_data_path = os.path.join(PROCESS_DIR, "train.txt")
    dev_data_path = os.path.join(PROCESS_DIR, "dev.txt")
    test_data_path = os.path.join(PROCESS_DIR, "test.txt")
    label_data_path = os.path.join(PROCESS_DIR, "class.txt")
    stopwords_data_path = os.path.join(PROCESS_DIR, "stopwords.txt")
    # 溯源表只有 5 列：split / line_no / sample_id / group / label
    index_data_path = os.path.join(PROCESS_DIR, "index.tsv")
    # 上游写的指纹和声明（各类计数、切分规则、模态汇总），用来做"声明 vs 实测"对账
    manifest_data_path = os.path.join(PROCESS_DIR, "manifest.json")

    # 图和统计表的输出目录（每个子项目各有一份，答辩时分语言讲，不要和英文侧混在一个文件夹）
    fig_dir = os.path.join(BASE_DIR, "figs")
    csv_dir = os.path.join(BASE_DIR, "csv")

    # 读取口径：和英文侧一样必须 QUOTE_NONE，正文里有全角引号，默认引号解析会吞行
    read_options = {
        "sep": "\t",
        "names": ["text", "label"],
        "dtype": {"text": str},
        "keep_default_na": False,
        "quoting": csv.QUOTE_NONE,
        "encoding": "utf-8",
    }
    index_read_options = {"sep": "\t", "encoding": "utf-8", "dtype": str}

    # 塌回二分类：label==0 归安全类，其余 1~9 全归诈骗类
    safe_label_value = 0
    safe_binary_name = "无风险文本"
    fraud_binary_name = "诈骗文本"

    # 长度口径：中文没有空格，切不出"词"，所以用 字数(str.len) 和 汉字数(正则计数) 两个口径
    # 汉字数比字数小，差值是标点、数字、英文字母，两者对比能看出话术里夹了多少非汉字
    char_len_col = "char_len"
    han_len_col = "han_len"
    length_name_map = {char_len_col: "字数", han_len_col: "汉字数"}

    # 图上的文字全部中文。class.txt本身就是中文，所以这里只做"显示名"，不是翻译
    split_name_map = {"train": "训练集", "dev": "验证集", "test": "测试集"}
    # 溯源组的两种前缀（实测出来的，文档里没写）：
    #   case:xxx = 一个案件拆成的多条文本，一组可以有好几行，中位 67 字
    #   txt:xxx  = 单条文本自成一组，中位 159 字
    group_kind_col = "来源形态"
    group_kind_name_map = {"case": "案件切片", "txt": "单条文本"}

    # 配色约定和英文侧一致：蓝=安全类，红=欺诈类
    color_map = {safe_binary_name: "#4C72B0", fraud_binary_name: "#C44E52",
                 "案件切片": "#DD8452", "单条文本": "#4C72B0"}
    # 10类的固定色板，顺序和 class.txt 行号一一对应；第0个必须是蓝色（无风险）
    # 为什么要单独给：10类若让 seaborn 自己配色，"无风险"可能抽到红色系，
    # 全项目"蓝=安全"的约定就废了，答辩时同一类在不同图上两种颜色，没法讲
    class_palette = ["#4C72B0", "#C44E52", "#DD8452", "#CCB974", "#20878D",
                     "#66C2A5", "#FC8D62", "#8DA0CB", "#E78AC3", "#FFD92F"]

    # 分位数取哪几档，用来定下游模型的截断长度
    percentile_list = [50, 75, 90, 95, 99]

    # 箱线图/条带图把超长样本压到这里；新数据最长3062字、P99只有418字，
    # 不压的话主体会被几条长尾挤成一条线
    length_clip = 500
    # bert-base-chinese 的位置编码上限，图上要画这条硬线
    # 注意：当前中文模型是 fastText 逐字切分，本身没有这个上限，这条线只代表"若要换BERT"
    model_position_limit = 512

    # 条带图/散点图的抽样上限：训练集24.6万行，全画会糊成一团黑，存图也要几十秒
    strip_sample_limit = 20000

    # 关键词图参数：中文用字符n-gram，出现文档数低于这个门槛的不参与，避免噪声
    # 门槛从旧版200提到500：样本量涨了6.8倍，200的门槛会放进一堆只在个别案件里出现的串
    ngram_min_df = 500
    ngram_range = (2, 3)
    keyword_top_k = 15
    # 关键词图另有一个抽样上限：24.6万行全量做 char_wb 2~3gram，词表要上千万项，
    # sklearn 会先把全词表建出来再按min_df裁，内存扛不住。
    # 所以关键词统计固定抽6万行，图和表都要写明"抽样口径"，不能和全量统计表混着讲
    keyword_sample_limit = 60000
    # 10类关键词热力图每类只留前N个词，不然一张图上百格没法读
    keyword_heatmap_top_k = 8

    # 重复文本图取前几组
    duplicate_top_k = 15

    # 词云必须显式给中文字体路径，否则中文全画成方框（Windows字体目录自带）
    wordcloud_font_path = r"C:\Windows\Fonts\msyh.ttc"


if __name__ == '__main__':
    # assert后跟bool类型表达式, 如果为True则通过, 否则抛出AssertionError异常
    assert os.path.exists(Config.train_data_path), "训练集路径不存在，检查zh_data_process是否跑过"
    assert os.path.exists(Config.index_data_path), "溯源表index.tsv不存在，来源形态图和溯源审计图画不了"
    assert os.path.exists(Config.manifest_data_path), "manifest.json不存在，声明与实测的对账做不了"
    with open(Config.label_data_path, "r", encoding="utf-8") as f:
        class_list = f.read().splitlines()
    assert len(class_list) == 10, f"class.txt应该是10类，现在读到{len(class_list)}行，脚本口径要跟着改"
    assert class_list[Config.safe_label_value] == "无风险", "第0行不是无风险，塌回二分类的写法就错了"
    assert len(Config.class_palette) == len(class_list), "class_palette数量和class.txt对不上，图例会缺色"
    assert set(Config.length_name_map) == {Config.char_len_col, Config.han_len_col}
    assert set(Config.group_kind_name_map) == {"case", "txt"}, "group前缀种类变了，来源形态映射要改"
    assert os.path.exists(Config.wordcloud_font_path), "词云中文字体不存在，词云图会画成方框"
    print("中文可视化配置文件加载成功")
    print("语料目录:", PROCESS_DIR)
    print("类别数:", len(class_list), "| 塌回口径: 0=", Config.safe_binary_name,
          "1~9=", Config.fraud_binary_name)
    print("图输出目录:", Config.fig_dir)
