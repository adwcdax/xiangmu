# 配置类（相对路径，相对本文件所在目录）
class Config:

    # 训练集数据路径
    train_data_path = "../data/zh_data_process/train.txt"

    # 验证集数据路径
    dev_data_path = "../data/zh_data_process/dev.txt"

    # 测试集数据路径
    test_data_path = "../data/zh_data_process/test.txt"

    # 分类标签数据路径
    label_data_path = "../data/zh_data_process/class.txt"

    # 停用词数据路径
    stopwords_data_path = "../data/zh_data_process/stopwords.txt"

    # 样本索引（split / line_no / sample_id / group / label）
    index_data_path = "../data/zh_data_process/index.tsv"


if __name__ == '__main__':
    # assert后跟bool类型表达式, 如果为True则通过, 否则抛出AssertionError异常
    assert Config.train_data_path.endswith("train.txt")
    assert Config.dev_data_path.endswith("dev.txt")
    assert Config.test_data_path.endswith("test.txt")
    assert Config.label_data_path.endswith("class.txt")
    print("配置文件加载成功")
