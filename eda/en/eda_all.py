"""
一键跑完所有可视化小项目
步骤：
1,按编号顺序找到 eda0x_*.py
2,每个都用独立子进程跑，一个挂了不影响其他
3,汇总每个脚本的退出码
用法：python -X utf8 eda_all.py
"""

import subprocess
import sys
from pathlib import Path

# 步骤：
# 1,找脚本
HERE = Path(__file__).resolve().parent
scripts = sorted(p for p in HERE.glob("eda0*.py"))


def run_all():
    """
    逐个执行；-X utf8 保证Windows默认GBK下读utf-8文件不报错
    """
    results = []
    for script in scripts:
        print("\n" + "=" * 20, script.name, "=" * 20)
        process = subprocess.run([sys.executable, "-X", "utf8", str(script)],
                                 cwd=str(HERE))
        results.append((script.name, process.returncode))
    print("\n" + "=" * 20, "汇总", "=" * 20)
    for name, code in results:
        print(f"{name}: {'OK' if code == 0 else f'FAIL(退出码{code})'}")
    return all(code == 0 for _, code in results)


if __name__ == "__main__":
    print(f"共{len(scripts)}个可视化小项目")
    sys.exit(0 if run_all() else 1)
