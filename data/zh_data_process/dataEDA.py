"""
数据探索性分析（样式同 tmf/01-data/dataEDA.py, 适配中文招聘型电诈二分类）
1,实例化对象
2,加载数据
3,查看数据
    3.1,查看标签分类
    3.2,查看标签数量
    3.3,查看句子长度
"""

# 导包
import csv
import pandas as pd
from collections import Counter
from config import Config

# 1,实例化对象
config_obj = Config()


# 2,加载数据
# 参数1:数据路径  参数2:分隔符  参数3:没有标题时指定表头列名
# 注意: quoting=QUOTE_NONE 必须保留 —— 语料内含双引号, 默认引号解析会吞行
data = pd.read_csv(config_obj.train_data_path, sep='\t', names=['text', 'label'],
                   dtype={'text': str}, keep_default_na=False, quoting=csv.QUOTE_NONE,
                   encoding='utf-8')


# 3,查看数据
# 3.1,查看标签分类
with open(config_obj.label_data_path, "r", encoding='utf-8') as f:
    class_list = f.read().splitlines()
    print(class_list)

# 3.2,查看标签数量
label_count = Counter(data['label'])
for label, count in sorted(label_count.items()):
    print(f"标签{class_list[label]}出现了{count}次")

# 3.3,计算句子长度
# 法1:使用map函数(大部分数据均可处理)
data["text_len"] = data['text'].map(lambda x: len(x))

# 法2:使用apply函数(常用于处理dataframe)
# data["text_len"] = data['text'].apply(lambda x:len(x))

# 法3:使用str.len()函数(最简单)
# data['text_len'] = data['text'].str.len()

print(f"句子的平均长度{data['text_len'].mean()}")
print(f"句子的最大长度{data['text_len'].max()}")
print(f"句子的最小长度{data['text_len'].min()}")
print(f"句子的标准差{data['text_len'].std()}")
