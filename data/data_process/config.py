# 配置类
class Config:

    # 训练集数据路径
    train_data_path = "./train.txt"

    # 验证集数据路径
    dev_data_path = "./dev.txt"

    # 测试集数据路径
    test_data_path = "./test.txt"

    # 分类标签数据路径
    label_data_path = "./class.txt"

    # 停用词数据路径
    stopwords_data_path = "./stopwords.txt"


if __name__ == '__main__':
    # assert后跟bool类型表达式, 如果为True则通过, 否则抛出AssertionError异常
    assert Config.train_data_path == "./train.txt"
    assert Config.dev_data_path == "./dev.txt"
    assert Config.test_data_path == "./test.txt"
    assert Config.label_data_path == "./class.txt"
    assert Config.stopwords_data_path == "./stopwords.txt"
    print("配置文件加载成功")
