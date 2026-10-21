# 英文语料可视化子项目（eda/en）— 一图一个小项目

两个子项目按语料语言分开：`en/`（英文EMSCAD职位描述）、`zh/`（中文电诈招聘话术）。总说明见 `../README.md`。
（原来还有第三个 `mixed/` 中英跨语言对比，已下线，文件已于 2026-10-21 删除；
 本目录的代码和数据都没跟着变，只有这段说明和下面的目录树改了。）

蓝本样式：`NLP/tmf/01-data`（config类 + dataEDA.py）。
投满分课件里**没有任何画图代码**（`dataEDA.py` 全是 print），图表实现参考的是黑马new day02 笔记 §2-§6；
**箱线图两边材料都没有**，是小项目3自己新写的。

## 小项目清单

| 编号 | 小项目名字 | 文件 | 图 | 图型 | 材料出处 |
|---|---|---|---|---|---|
| 1 | 标签均衡分析 | `eda01_label_balance.py` | 01 / 02 | 条形图 countplot | 黑马new §2 |
| 2 | 文本长度分布 | `eda02_length_histogram.py` | 03 / 04 / 05 | 直方图 displot+histplot | 黑马new §3 |
| 3 | 长度离群诊断 | `eda03_length_boxplot.py` | 06 | **箱线图 boxplot** | 无（新写） |
| 4 | 逐样本长度散点 | `eda04_length_stripplot.py` | 07 / 08 | 条带图 stripplot + 散点 scatter | 黑马new §4 |
| 5 | 截断长度选型 | `eda05_length_percentiles.py` | 09 | 分位数阶梯图 | 黑马new §3「盖住90%即可」 |
| 6 | 噪声成分扫描 | `eda06_noise_scan.py` | 10 | 分组条形图 | 投满分3.2 只有一行 replace，扩成规则表 |
| 7 | 关键词类别倾向 | `eda07_keyword_lift.py` | 11 / 12 | 双向条形图 | 黑马new §6 的选词思路改英文 |
| 8 | 类别词云 | `eda08_wordcloud.py` | 13 / 14 | 词云 WordCloud | 黑马new §6 |
| 9 | 重复文本审计 | `eda09_duplicate.py` | 15 / 16 | 分组条形图 + 横向条形图 | 黑马new §5 去重思路 |

公共部分：`config.py`（路径和参数）、`eda_common.py`（读数据、加长度列、存图存表）。
`eda_all.py` 一键跑全部，子进程隔离，一个挂了不影响其他。

## 目录结构（两个子项目各自一份代码，图片在各自子文件夹）

```
data/eda/
├── eda_all.py            ← 总入口，依次跑下面两个子项目
├── en/                   英文语料（本文件所在）
│   ├── config.py         路径、参数、中英文对照表
│   ├── eda_common.py     读数据 / 中文化 / 存图存表
│   ├── eda01_*.py ~ eda09_*.py
│   ├── eda_all.py        本子项目一键跑全部
│   ├── figs/             ← 生成的图片（14张，PPT直接插）
│   └── csv/              ← 图背后的统计表
├── zh/                   中文语料（zh01~zh10，figs/ 26张）
```

## 图上文字的中英文约定

标题、坐标轴、图例、表头**全部中文**，翻译只在两个地方做一次：
`config.py` 的 `label_name_map` / `split_name_map` / `length_name_map` / `keyword_tag_map`，
和 `eda_common.py` 的 `add_label_names()` / `cn_length()`。改文案只动配置，不用改九个脚本。

**故意保留英文的三类**：① 关键词本身（petroleum、clerk…），翻了没法回语料核对；
② 文本预览（"Play with kids…"…），那是数据原文；③ 文件名和 `class.txt` 里的标签值，
那是跨脚本的口径，只在图上显示中文。

## 跑法

```bash
cd E:\xiangmu\data\eda\en
python -X utf8 eda_all.py        # 或单独跑 python -X utf8 eda01_label_balance.py
```

本机Anaconda目录不可写，跑python要加 `PYTHONNOUSERSITE=1`，否则numpy会串版本：

```bash
PYTHONNOUSERSITE=1 python -X utf8 eda_all.py
```

产物：`figs/*.png`（答辩PPT直接插）+ `csv/*.csv`（图背后的数字，被追问时查）。
小项目8需要 `pip install wordcloud`，没装会打印提示并跳过，不影响其他图。

## 已跑出的结论（train 14276 行实测，2026-10-21 组级切分版）

1. **类别极不均衡**：train legitimate 13589（95.19%）/ fraudulent 687（4.81%），dev/test 各 1699 / 86（4.82%）。
   → 答辩要接上"所以准确率没意义，评价指标用 F1 / PR-AUC"。
2. **文本比投满分长两个数量级**：真实类词数 均值169.9 / 中位146 / P90 323 / P99 582 / 最大2115；
   字符数 均值1202.3 / P90 2306 / 最大14810。
   → 投满分的 `pad_size=32` 是短标题口径，**这里不能照抄**；截到 324 词覆盖 90.07%，512 词覆盖 98.08%。
3. **虚假类偏短**：中位数 112 词 vs 真实类 146 词，但 P90 反而更长（346 vs 323）——
   整体口径"虚假更短"，同模态/长尾处会翻号，箱线图和叠加直方图都能看到主体左移。
   → 长度本身就是一个可用特征，但差得不大，不能只靠它。
4. **URL 掩码确实存在**：`#URL_<sha256>#` 命中 2806 行（19.66%），虚假类 23.73% > 真实类 19.45%。
   → **`manifest.json` 里"该发行版已还原真实URL、无掩码"这句话是错的，要改。**
5. **非ASCII字符**：45.78% 的样本含非ASCII（引号、重音符号等），虚假类 28.38% 反而更低。
   连续重复符号 2.56%；残留双空格 0 行 → 上游 `whitespace_collapse` 确实生效了。
6. **重复文本严重，而且虚假类更依赖模板**：train 内部涉及重复 4521 行（22.87%，多余副本 3265 行、1256 组），
   dev/test 各 0.00%；按标签拆开，train 里虚假职位自身重复率 **35.37%**、真实职位 22.24%。
   重复最多的一条 "Play with kids, get paid for it Love travel?" 在训练集出现 **380 次**，
   全语料（三份切分合起来）也是 380 次 → 这一组整组落在 train，没有跨切分。
   → **组级切分之后跨切分泄漏为 0 段 / 0 行**（本目录三份 txt 直接对拍：三份文本集合两两交集为空；中文侧 `../zh/csv/09_duplicate_audit.csv` 同为 0）。
     上一版随机切分曾实测 552 段 / 2785 行，那是改造前的历史数字，当前 CSV 里已复算不出，只能作为对照讲。
   → 代价要说清楚：重复没有消失，只是被整组收进同一份切分；train 内部重复率因此从 16.97% 升到 22.87%。
7. **标注冲突 0 条**：上游按组剔除标签冲突（5 组 / 34 行）后才切分，EDA 侧在 train/dev/test 里再查一遍是 0。
   `csv/09_label_conflict.csv` 只剩表头——脚本改过：0 冲突也要落表，否则上一轮的冲突结果会留在 csv 里冒充现状。
8. **虚假类高频词很有信号**：petroleum / accepting / typing / approximately / employ / contractual /
   housekeeping / calculations / prepared / clerk / clerical / earning；
   真实类高频词：living / asia / tidewater / airfare / furnished / reimbursed（ relocation、福利类描述）。
   → 答辩讲"为什么传统模型也能做"时用这张图。

## 答辩对应关系

- 第二条（缺失/异常/重复）→ 小项目6、9 + `../data_process/verify_output.py`
- 第三条（直方图、散点图、箱线图）→ 小项目2（直方图）、4（散点）、3（箱线图），另有 1/5/6/7/8 补齐
- 第四条（特征工程）→ 小项目5 给出截断长度，小项目7 给出可作特征的词表
