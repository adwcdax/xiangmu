"""
eda 总入口：依次跑两个子项目（en 英文 / zh 中文）
步骤：
1,按固定顺序找到子目录里的 *_all.py
2,每个子项目用独立子进程跑，且cwd切到该子目录
  （两个目录里都有 config.py 和 eda_common.py，靠cwd区分，不然import会串台）
3,汇总退出码
用法：在 eda 目录下 python -X utf8 eda_all.py

2026-10-21：原来还有第三个子项目 mixed（中英对比），按要求下线，目录已删除，所以这里只剩两行。
中英对比如果以后要讲，直接拿 en 和 zh 各自的 csv/ 摆在一起说，不再单独出图。
"""

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SUBPROJECTS = [("英文", "en", "eda_all.py"),
               ("中文", "zh", "zh_all.py")]


def run_all():
    """
    -X utf8 保证Windows默认GBK下读utf-8文件不报错
    """
    results = []
    for title, folder, runner in SUBPROJECTS:
        print("\n" + "=" * 20, f"{title}子项目 {folder}/", "=" * 20)
        process = subprocess.run([sys.executable, "-X", "utf8", str(HERE / folder / runner)],
                                 cwd=str(HERE / folder))
        results.append((title, process.returncode))
    print("\n" + "=" * 20, "总汇总", "=" * 20)
    for title, code in results:
        print(f"{title}: {'OK' if code == 0 else f'FAIL(退出码{code})'}")
    return all(code == 0 for _, code in results)


if __name__ == "__main__":
    sys.exit(0 if run_all() else 1)
