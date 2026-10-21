"""
小项目6：噪声与话术成分扫描图（清洗环节的证据）
目标：答辩第二条要讲"缺失/异常/重复"，这张图说明中文侧清掉了什么、哪些成分带类别信号
步骤：
1,定义规则表（中文规则名 + 正则）
2,逐条统计命中率：全量 + 塌回二分类各算一次
3,画横向分组条形图
4,再画"规则 × 10类"命中率热力图，只看两类之间差得最大的规则
5,打印每条规则的一个命中示例，方便判断是不是真噪声
教学出处：投满分课件的清洗只有一行 text.replace('：','')（3.2 fasttext §），黑名单式写法，
          这里把它扩展成规则表；黑马new day02 §4 的"读原文再决定"思路沿用

规则表按新语料重做过（旧表是按"招聘域电诈话术"写的，现在语料是10类电诈短信+案情+对话）：
- 删掉了"网址掩码占位符（英文侧遗留）"，新语料里没有这种token；
- 加了三条真实存在的：【】品牌/角色标记、QQ微信引流字样、空文本残留检查；
- "空文本"这条是为了复核文档声明的"空文本剔除"：实测三份切分都是0命中，
  而英文侧同期还有残留，这条一对照就能讲清"哪一侧清洗干净了"。
命中率高的成分（数字串、网址、金额字样）在两类之间差异明显，说明它们自带类别信号，
不能当噪声删掉，要留给模型——这是这张图真正的结论。
"""

import re

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

from config import Config
from eda_common import (CLASS_COL, LABEL_COL, class_order, label_order,
                        load_train_frame, save_figure, save_table)

config_obj = Config()

# 步骤：
# 1,规则表：报告里的中文名 -> 正则
# 加一条规则就加一行，图和表都会自动多一项
NOISE_RULES = {
    "空文本（清洗是否漏网）": r"^\s*$",
    "数字串≥6位（账号/卡号/QQ号）": r"\d{6,}",
    "网址或链接": r"(?:https?://|www\.|\.com|\.cn|\.top|\.xyz)",
    "邮箱地址": r"[\w.+-]+@[\w-]+\.[\w.]+",
    "QQ/微信引流字样": r"(?:QQ|qq|微信|weixin|vx|wx号)",
    "【】品牌或角色标记": r"【[^】]{1,8}】",
    "对话说话人标记（坐席/客户/警察等）": r"【(?:坐席|客服|客户|受害人|骗子|警察|银行|经理|老师)】",
    "金额收益字样": r"(?:[0-9]+(?:元|万)|收益|佣金|返利|返现)",
    "英文字母混入": r"[A-Za-z]",
    "全角标点或全角字符": r"[\uff00-\uffef\u3000-\u303f]",
    "连续重复符号（！！！、。。。、***）": r"(.)\1{2,}",
    "半角空格残留": r"(?:\s)",
    "生僻符号（不在常见中英文标点表内）":
        r"[^\u4e00-\u9fa5A-Za-z0-9\s，。！？；：、（）()“”‘’\-—·\[\]【】/\\.:_%@#&*+=~`<>]",
}

# 2,统计命中率（训练集全量，不抽样：这些是"有多少行"的计数，抽样值没法对外报）
train_data = load_train_frame()


def scan_rules():
    """
    每条规则统计：命中行数、出现次数、按两类各算一次命中率、一个示例
    要点1:用str.contains而不是遍历，24.6万行遍历也能跑但慢十倍
    要点2:两类命中率差得多就说明这个成分自带类别信号，
          比如引流字样在诈骗侧显著更高，这种不能当"噪声"删掉，要留给模型
    要点3:正则为了一律只匹配不捕获，全部用(?:...)而不是(...)，
          因为pandas对带捕获组的正则会发"interpreted as regular expression"告警，
          告警一多真错误就看不见
    """
    rows = []
    for rule_name, pattern in NOISE_RULES.items():
        mask = train_data["text"].str.contains(pattern, regex=True)
        occurrences = int(train_data["text"].str.count(pattern).sum())
        example_index = mask[mask].index
        example = ""
        if len(example_index) > 0:
            text = train_data.loc[example_index[0], "text"]
            matched = re.search(pattern, text)
            start = max(0, matched.start() - 20)
            example = text[start:matched.end() + 20]
        row = {
            "规则": rule_name,
            "命中行数": int(mask.sum()),
            "全量命中率%": round(mask.mean() * 100, 2),
            "出现总次数": occurrences,
        }
        for label_name in label_order():
            sub = train_data[train_data[LABEL_COL] == label_name]
            row[f"{label_name}命中率%"] = round(
                sub["text"].str.contains(pattern, regex=True).mean() * 100, 2)
        safe_col = f"{config_obj.safe_binary_name}命中率%"
        fraud_col = f"{config_obj.fraud_binary_name}命中率%"
        # 差值就是"这个成分有多带类别信号"，排序和热力图都按它排
        # 用有符号而不是绝对值：正数=诈骗侧更多（引流类），负数=无风险侧更多（品牌签名类），
        # 只看绝对值会把两种完全不同的东西排在一起
        row["两类差值(百分点)"] = round(row[fraud_col] - row[safe_col], 2)
        # 示例里引用的是语料原文，不翻译，翻译了没法回原文核对
        row["示例（语料原文）"] = example
        rows.append(row)
    return pd.DataFrame(rows)


def plot_noise_table(table):
    """
    横向条形图：纵轴规则名，横轴命中率，两类并排
    要点:排序按全量命中率升序，最大的排在最上面；不排序的话条形图没法一眼看出主次
    """
    tidy_rows = []
    for _, record in table.iterrows():
        for label_name in label_order():
            tidy_rows.append({"规则": record["规则"], LABEL_COL: label_name,
                              "命中率%": record[f"{label_name}命中率%"]})
    tidy = pd.DataFrame(tidy_rows)
    order = table.sort_values("全量命中率%")["规则"].tolist()

    figure, axes = plt.subplots(figsize=(11, 6.5))
    sns.barplot(data=tidy, x="命中率%", y="规则", hue=LABEL_COL,
                order=order, hue_order=label_order(),
                palette=config_obj.color_map, ax=axes)
    axes.set_title("话术成分与噪声命中率（按塌回二分类分组；差值大的成分自带类别信号，不能当噪声删）")
    axes.set_xlabel("该类样本中的命中率 %")
    axes.set_ylabel("规则")
    axes.legend(title="标签")
    return save_figure(figure, "17_noise_rules.png")


def plot_noise_heatmap(table):
    """
    热力图：行=两类之间差值最大的8条规则，列=10类，格子=该类内的命中率%
    为什么只看差值最大的8条：13条规则×10类=130格，全画进去大部分格子是"99% everywhere"，
    没有信息量；按两类差值排序取前8，剩下的在CSV里查
    坑点:这是"类内命中率"，同一行横向比才有意义，纵向比（同一个类不同规则）没有意义
    """
    top_rules = (table.reindex(table["两类差值(百分点)"].abs().sort_values(ascending=False).index)
                 ["规则"].head(8).tolist())
    matrix_rows = []
    for rule_name in top_rules:
        pattern = NOISE_RULES[rule_name]
        row = {"规则": rule_name}
        for class_name in class_order():
            sub = train_data[train_data[CLASS_COL] == class_name]
            row[class_name] = round(sub["text"].str.contains(pattern, regex=True).mean() * 100, 2)
        matrix_rows.append(row)
    matrix = pd.DataFrame(matrix_rows).set_index("规则")

    figure, axes = plt.subplots(figsize=(13, 4.5))
    sns.heatmap(matrix, annot=True, fmt=".1f", cmap="Reds", linewidths=.4,
                ax=axes, cbar_kws={"label": "该类样本内的命中率 %"})
    axes.set_title("两类差值最大的8条规则 × 10类命中率（同一行内部横向比才有意义）")
    axes.set_xlabel("诈骗类别")
    axes.set_ylabel("规则")
    axes.tick_params(axis="x", rotation=25, labelsize=8)
    axes.tick_params(axis="y", labelsize=8)
    return save_figure(figure, "18_noise_rules_by_class.png")


if __name__ == "__main__":
    table = scan_rules()
    plot_noise_table(table)
    plot_noise_heatmap(table)
    print(table[["规则", "命中行数", "全量命中率%"] +
                [f"{name}命中率%" for name in label_order()] +
                ["两类差值(百分点)"]].to_string(index=False))
    print("=" * 30, "示例（语料原文，不翻译）")
    for _, record in table.iterrows():
        print(f"[{record['规则']}] {str(record['示例（语料原文）'])[:60]}")
    save_table(table, "06_noise_scan.csv")
