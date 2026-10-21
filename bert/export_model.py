# -*- coding: utf-8 -*-
"""
把训练脚本产出的 model.pt 导出成 HuggingFace 标准目录（config / safetensors / tokenizer）。

训练脚本保存的是自定义检查点 {"model": state_dict, "classes": [...], "best_dev_macro_f1": f}，
transformers 无法直接加载。本脚本补上 config.json 与标准权重文件，导出后
`AutoModelForSequenceClassification.from_pretrained(dir)` 即可直接用。

用法：
  python -X utf8 bert/export_model.py \
      --ckpt  models_zh/bert/model.pt \
      --encoder D:/heima/model/chinese-roberta-wwm-ext \
      --out    bert/model
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer


def export(ckpt_path: Path, encoder: str, out_dir: Path) -> None:
    ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
    classes: list[str] = ckpt["classes"]

    model = AutoModelForSequenceClassification.from_pretrained(
        encoder, num_labels=len(classes), local_files_only=True, ignore_mismatched_sizes=True)
    model.load_state_dict(ckpt["model"])
    model.eval()

    model.config.id2label = {i: c for i, c in enumerate(classes)}
    model.config.label2id = {c: i for i, c in enumerate(classes)}
    out_dir.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(out_dir, safe_serialization=True)

    tok = AutoTokenizer.from_pretrained(encoder, local_files_only=True)
    tok.save_pretrained(out_dir)

    (out_dir / "train_state.json").write_text(json.dumps({
        "best_dev_macro_f1": ckpt["best_dev_macro_f1"],
        "classes": classes,
    }, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n")

    total = sum(p.stat().st_size for p in out_dir.iterdir() if p.is_file())
    print(f"导出完成 -> {out_dir}  ({total / 1e6:.0f} MB)")
    for p in sorted(out_dir.iterdir()):
        if p.is_file():
            print(f"  {p.name:28s} {p.stat().st_size / 1e6:8.2f} MB")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", type=Path, required=True, help="训练脚本产出的 model.pt")
    ap.add_argument("--encoder", required=True, help="底模路径，如 D:/heima/model/chinese-roberta-wwm-ext")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent / "model")
    args = ap.parse_args()
    export(args.ckpt, args.encoder, args.out)


if __name__ == "__main__":
    main()
