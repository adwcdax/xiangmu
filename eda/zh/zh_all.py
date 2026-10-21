"""
中文子项目总入口：按编号依次跑 zh01~zh10
步骤：
1,按文件名顺序找出所有 zhNN_*.py
2,每个脚本单独一个子进程跑
  （一个脚本挂了不影响后面的，报错也能马上定位到是哪个编号）
3,汇总退出码，有一个FAIL整个子项目就返回非0
用法：在 data/eda/zh 目录下 PYTHONNOUSERSITE=1 python -X utf8 zh_all.py

为什么不用一个进程跑完：eda_common里有模块级的读数据缓存，
单进程跑十个脚本会把24.6万行×3的DataFrame一直留在内存里，
到关键词那一步（要建字符n-gram矩阵）容易直接OOM。
"""

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
# 顺序写死而不是glob排序，方便把"依赖前一张图结论"的脚本排在后面
SCRIPTS = [
    "zh01_label_balance.py",
    "zh02_length_histogram.py",
    "zh03_length_boxplot.py",
    "zh04_length_stripplot.py",
    "zh05_length_percentiles.py",
    "zh06_noise_scan.py",
    "zh07_keyword_lift.py",
    "zh08_wordcloud.py",
    "zh09_duplicate_audit.py",
    "zh10_group_traceability.py",
]


def run_all():
    """
    -X utf8 保证Windows默认GBK下读utf-8文件不报错
    """
    results = []
    for script in SCRIPTS:
        print("\n" + "=" * 20, script, "=" * 20)
        process = subprocess.run([sys.executable, "-X", "utf8", str(HERE / script)],
                                 cwd=str(HERE))
        results.append((script, process.returncode))
    print("\n" + "=" * 20, "中文子项目汇总", "=" * 20)
    for script, code in results:
        print(f"{script}: {'OK' if code == 0 else f'FAIL(退出码{code})'}")
    return all(code == 0 for _, code in results)


if __name__ == "__main__":
    sys.exit(0 if run_all() else 1)
