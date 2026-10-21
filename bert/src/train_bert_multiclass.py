# -*- coding: utf-8 -*-
"""
中文电诈 10 类多分类：本地 BERT 底模微调

输入：data/zh_data_process/{train,dev,test}.txt（每行 文本\\t标签，标签为 class.txt 行号）
抽样：按类分层抽样（默认 train 128k / dev 12k / test 12k），固定 seed 可复现
损失：sqrt 逆频率加权（无风险类权重归一为 1，与英文侧 v5 口径一致）
选权：按 dev macro-F1 取最优 epoch 权重，test 只在最后评估一次

产物：models_zh/bert/{model.pt,metrics.json,test_probs.npz}
用法：
  python -X utf8 experiments/zh_fraud/train_bert_multiclass.py --smoke
  python -X utf8 experiments/zh_fraud/train_bert_multiclass.py
"""

from __future__ import annotations

import argparse
import json
import random
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from torch.optim import AdamW
from torch.optim.lr_scheduler import LambdaLR
from torch.utils.data import DataLoader, Dataset
from transformers import AutoModelForSequenceClassification, AutoTokenizer

ROOT = Path(__file__).resolve().parents[2]
DATASET_DIR = ROOT / "data" / "zh_data_process"
ENCODER = r"D:\heima\model\chinese-roberta-wwm-ext"
OUT_DIR = ROOT / "models_zh" / "bert"
BENIGN = "无风险"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


def read_split(d: Path, split: str) -> list[tuple[str, int]]:
    out = []
    for line in (d / f"{split}.txt").read_text(encoding="utf-8").splitlines():
        if line:
            text, _, label = line.rpartition("\t")
            out.append((text.strip(), int(label)))
    return out


def stratified_sample(items: list[tuple[str, int]], n: int, seed: int) -> list[tuple[str, int]]:
    """按类占比抽样，小类至少保 1 条；抽完打散顺序"""
    if n >= len(items):
        out = list(items)
    else:
        by_label: dict[int, list[tuple[str, int]]] = defaultdict(list)
        for it in items:
            by_label[it[1]].append(it)
        rng = random.Random(seed)
        ratio = n / len(items)
        out = []
        for label in sorted(by_label):
            pool = by_label[label]
            out.extend(rng.sample(pool, min(len(pool), max(1, round(len(pool) * ratio)))))
    random.Random(seed + 1).shuffle(out)
    return out


class TextSet(Dataset):
    def __init__(self, encs: list[list[int]], labels: list[int]):
        self.encs, self.labels = encs, labels

    def __len__(self) -> int:
        return len(self.encs)

    def __getitem__(self, i: int):
        return self.encs[i], self.labels[i]


def make_collate(pad_id: int):
    def collate(batch):
        n = max(len(ids) for ids, _ in batch)
        n = min(((n + 7) // 8) * 8, 512)
        ids = torch.full((len(batch), n), pad_id, dtype=torch.long)
        att = torch.zeros((len(batch), n), dtype=torch.long)
        ys = torch.zeros(len(batch), dtype=torch.long)
        for i, ((enc, y)) in enumerate(batch):
            k = len(enc)
            ids[i, :k] = torch.tensor(enc, dtype=torch.long)
            att[i, :k] = 1
            ys[i] = y
        return ids, att, ys
    return collate


def encode(items: list[tuple[str, int]], tok, max_len: int) -> tuple[list[list[int]], list[int]]:
    encs = [tok(t, add_special_tokens=True, truncation=True, max_length=max_len)["input_ids"]
            for t, _ in items]
    return encs, [y for _, y in items]


@torch.no_grad()
def predict_probs(model, encs, labels, batch_size: int) -> tuple[np.ndarray, np.ndarray]:
    model.eval()
    dl = DataLoader(TextSet(encs, labels), batch_size=batch_size, shuffle=False,
                    collate_fn=make_collate(0))
    probs = []
    for ids, att, _ in dl:
        with torch.autocast("cuda", dtype=torch.float16, enabled=DEVICE == "cuda"):
            logits = model(input_ids=ids.to(DEVICE), attention_mask=att.to(DEVICE)).logits
        probs.append(logits.float().cpu())
    return torch.cat(probs).numpy(), np.asarray(labels)


def summarize(probs, ys, classes) -> dict:
    pred = probs.argmax(1)
    per = {}
    f1s, sup = [], []
    for i, c in enumerate(classes):
        y_bin = (ys == i).astype(int)
        p_bin = (pred == i).astype(int)
        tp = int(((y_bin == 1) & (p_bin == 1)).sum())
        fp = int(((y_bin == 0) & (p_bin == 1)).sum())
        fn = int(((y_bin == 1) & (p_bin == 0)).sum())
        pr = tp / (tp + fp) if tp + fp else 0.0
        rc = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * pr * rc / (pr + rc) if pr + rc else 0.0
        per[c] = {"precision": round(pr, 4), "recall": round(rc, 4), "f1": round(f1, 4),
                  "support": tp + fn}
        if tp + fn:
            f1s.append(f1)
            sup.append(tp + fn)
    b_y = (ys != 0).astype(int)
    b_p = (pred != 0).astype(int)
    tp = int(((b_y == 1) & (b_p == 1)).sum())
    fp = int(((b_y == 0) & (b_p == 1)).sum())
    fn = int(((b_y == 1) & (b_p == 0)).sum())
    tn = int(((b_y == 0) & (b_p == 0)).sum())
    fraud_pr = tp / (tp + fp) if tp + fp else 0.0
    fraud_rc = tp / (tp + fn) if tp + fn else 0.0
    fraud_f1 = 2 * fraud_pr * fraud_rc / (fraud_pr + fraud_rc) if fraud_pr + fraud_rc else 0.0
    legit_f1 = 2 * tn / (2 * tn + fp + fn) if tn else 0.0
    return {
        "n": int(len(ys)),
        "accuracy": round(float((pred == ys).mean()), 4),
        "macro_f1": round(float(np.mean(f1s)), 4) if f1s else 0.0,
        "weighted_f1": round(float(f1_score(ys, pred, average="weighted", zero_division=0)), 4),
        "per_class": per,
        "top_confusions": {classes[t]: {classes[int(k)]: int(v)
                                        for k, v in Counter(pred[ys == t]).most_common(3)}
                           for t in range(len(classes)) if (ys == t).any()},
        "collapsed_binary": {"accuracy": round((tp + tn) / len(ys), 4),
                             "fraud_precision": round(fraud_pr, 4), "fraud_recall": round(fraud_rc, 4),
                             "fraud_f1": round(fraud_f1, 4),
                             "macro_f1": round((fraud_f1 + legit_f1) / 2, 4),
                             "confusion_matrix": {"tn": tn, "fp": fp, "fn": fn, "tp": tp}},
    }


def train(args) -> None:
    seed = args.seed
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)

    classes = [ln.strip() for ln in (args.dataset_dir / "class.txt").read_text(encoding="utf-8").splitlines()
               if ln.strip()]
    n_class = len(classes)
    tok = AutoTokenizer.from_pretrained(args.encoder, local_files_only=True)

    parts = {}
    for split, n in (("train", args.train_size), ("dev", args.dev_size), ("test", args.test_size)):
        rows = read_split(args.dataset_dir, split)
        if args.smoke:
            n = 400 if split == "train" else 120
        chosen = stratified_sample(rows, n, seed)
        encs, ys = encode(chosen, tok, args.max_len)
        parts[split] = (encs, ys)
        print(f"{split:5s} {len(ys):6d} / 全量 {len(rows):6d}  长度P95={int(np.percentile([len(e) for e in encs], 95))}",
              flush=True)

    counts = np.bincount(parts["train"][1], minlength=n_class).astype(float)
    counts[counts == 0] = 1
    w = np.sqrt(counts.max() / counts)
    weight = torch.tensor(w / w[classes.index(BENIGN)], device=DEVICE, dtype=torch.float32)
    print("类别数:", {c: int(counts[i]) for i, c in enumerate(classes)})
    print("损失权重:", np.round((w / w[classes.index(BENIGN)]).tolist(), 2).tolist(), flush=True)

    dl = DataLoader(TextSet(*parts["train"]), batch_size=args.batch_size, shuffle=True,
                    collate_fn=make_collate(tok.pad_token_id))
    model = AutoModelForSequenceClassification.from_pretrained(
        args.encoder, num_labels=n_class, local_files_only=True, ignore_mismatched_sizes=True).to(DEVICE)
    if args.freeze_layers > 0:
        # 冻结 embeddings + 前 N 层 encoder，只微调上层与分类头；省反向传播算力
        for p in model.bert.embeddings.parameters():
            p.requires_grad = False
        for layer in model.bert.encoder.layer[:args.freeze_layers]:
            for p in layer.parameters():
                p.requires_grad = False
        n_frozen = sum(1 for p in model.parameters() if not p.requires_grad)
        print(f"冻结前 {args.freeze_layers} 层（{n_frozen} 个张量不参与训练）", flush=True)
    nodecay = ("bias", "LayerNorm.weight")
    opt = AdamW([
        {"params": [p for n, p in model.named_parameters() if p.requires_grad and not any(k in n for k in nodecay)], "weight_decay": 0.01},
        {"params": [p for n, p in model.named_parameters() if p.requires_grad and any(k in n for k in nodecay)], "weight_decay": 0.0},
    ], lr=args.lr)
    epochs = 0 if args.eval_only else (1 if args.smoke else args.epochs)
    total_steps = len(dl) * epochs
    warmup = max(1, int(0.05 * total_steps))
    sched = LambdaLR(opt, lambda s: (s + 1) / warmup if s < warmup
                     else max(0.1, 1 - (s - warmup) / max(1, total_steps - warmup)))
    scaler = torch.amp.GradScaler("cuda", enabled=DEVICE == "cuda")

    best_f1, best_state, step, history = -1.0, None, 0, []
    t0 = time.perf_counter()
    for ep in range(1, epochs + 1):
        model.train()
        run_loss, seen = 0.0, 0
        for i, (ids, att, ys) in enumerate(dl):
            ids, att, ys = ids.to(DEVICE), att.to(DEVICE), ys.to(DEVICE)
            with torch.autocast("cuda", dtype=torch.float16, enabled=DEVICE == "cuda"):
                loss = F.cross_entropy(model(input_ids=ids, attention_mask=att).logits, ys, weight=weight)
            scaler.scale(loss).backward()
            run_loss += float(loss.detach())
            seen += 1
            if (i + 1) % args.grad_accum == 0 or (i + 1) == len(dl):
                scaler.unscale_(opt)
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                scaler.step(opt)
                scaler.update()
                sched.step()
                opt.zero_grad(set_to_none=True)
                step += 1
                if not args.smoke and step % args.log_every == 0:
                    el = time.perf_counter() - t0
                    eta = el / step * (total_steps - step)
                    print(f"epoch {ep} step {step}/{total_steps} loss {run_loss / seen:.3f} "
                          f"已过 {el/60:.1f}min 预计还需 {eta/60:.1f}min", flush=True)
                    run_loss, seen = 0.0, 0

        probs, ys_dev = predict_probs(model, *parts["dev"], args.eval_batch_size)
        m = summarize(probs, ys_dev, classes)
        history.append({"epoch": ep, "dev_macro_f1": m["macro_f1"], "dev_accuracy": m["accuracy"],
                        "dev_fraud_f1": m["collapsed_binary"]["fraud_f1"]})
        print(f"[验证] epoch {ep}: macro-F1={m['macro_f1']:.4f} acc={m['accuracy']:.4f} "
              f"塌回二分类 欺诈F1={m['collapsed_binary']['fraud_f1']:.4f}", flush=True)
        if m["macro_f1"] > best_f1:
            best_f1 = m["macro_f1"]
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
            print("  -> 新的最优权重", flush=True)

    if args.eval_only:
        ckpt = torch.load(args.out_dir / "model.pt", map_location=DEVICE, weights_only=False)
        model.load_state_dict(ckpt["model"])
        best_f1 = float(ckpt["best_dev_macro_f1"])
        print(f"[eval-only] 载入 {args.out_dir / 'model.pt'}，best dev macro-F1={best_f1:.4f}", flush=True)
    elif best_state:
        model.load_state_dict(best_state)
    if args.smoke:
        print(f"\n[冒烟完成] 流程通过，best dev macro-F1={best_f1:.4f}，"
              f"用时 {(time.perf_counter()-t0)/60:.1f}min")
        return

    seconds = round(time.perf_counter() - t0, 1)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    if not args.eval_only:
        torch.save({"model": model.state_dict(), "classes": classes, "best_dev_macro_f1": best_f1},
                   args.out_dir / "model.pt")
        tok.save_pretrained(args.out_dir)

    probs_t, ys_t = predict_probs(model, *parts["test"], args.eval_batch_size)
    test_m = summarize(probs_t, ys_t, classes)
    probs_d, ys_d = predict_probs(model, *parts["dev"], args.eval_batch_size)
    dev_m = summarize(probs_d, ys_d, classes)
    pred_t = probs_t.argmax(1)
    report = {
        "task": "中文电诈案件分类（10 类：无风险 + 9 类手法）",
        "model": "bert 微调",
        "encoder": args.encoder,
        "input": str(args.dataset_dir),
        "sampling": {"train": len(parts["train"][1]), "dev": len(parts["dev"][1]),
                     "test": len(parts["test"][1]), "seed": seed, "rule": "按类分层抽样"},
        "params": {"max_len": args.max_len, "epochs": epochs, "lr": args.lr,
                   "batch_size": args.batch_size, "grad_accum": args.grad_accum,
                   "weight": "sqrt 逆频率", "seed": seed, "eval_only": args.eval_only,
                   "freeze_layers": args.freeze_layers},
        "device": DEVICE,
        "train_seconds": seconds,
        "best_dev_macro_f1": round(best_f1, 4),
        "history": history,
        "dev": dev_m,
        "test": test_m,
        "fasttext_baseline_test": {"macro_f1": 0.7365, "accuracy": 0.8654,
                                   "collapsed_binary_fraud_f1": 0.9833,
                                   "note": "docs/评估文档-电诈识别.md 全量 53,281 条"},
    }
    (args.out_dir / "metrics.json").write_text(json.dumps(report, ensure_ascii=False, indent=2),
                                               encoding="utf-8", newline="\n")
    np.savez_compressed(args.out_dir / "test_probs.npz", probs=probs_t, y=ys_t)

    print(f"\n训练 {seconds/60:.1f}min  best dev macro-F1={best_f1:.4f}")
    print(f"\n===== 测试集 BERT 中文 10 类（{len(ys_t)} 条）=====")
    print(classification_report(ys_t, pred_t, target_names=classes, digits=3, zero_division=0))
    print("混淆矩阵(行=真值,列=预测):\n", confusion_matrix(ys_t, pred_t))
    print(f"\n塌回二分类: {report['test']['collapsed_binary']}")
    print(f"模型 {args.out_dir / 'model.pt'}\n指标 {args.out_dir / 'metrics.json'}")


def main() -> None:
    ap = argparse.ArgumentParser(description="中文电诈 10 类 BERT 微调")
    ap.add_argument("--dataset-dir", type=Path, default=DATASET_DIR)
    ap.add_argument("--out-dir", type=Path, default=OUT_DIR)
    ap.add_argument("--encoder", default=ENCODER)
    ap.add_argument("--train-size", type=int, default=128000)
    ap.add_argument("--dev-size", type=int, default=12000)
    ap.add_argument("--test-size", type=int, default=12000)
    ap.add_argument("--max-len", type=int, default=192)
    ap.add_argument("--epochs", type=int, default=2)
    ap.add_argument("--lr", type=float, default=2e-5)
    ap.add_argument("--batch-size", type=int, default=32)
    ap.add_argument("--eval-batch-size", type=int, default=128)
    ap.add_argument("--grad-accum", type=int, default=1)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--log-every", type=int, default=200)
    ap.add_argument("--smoke", action="store_true", help="400 条 1 轮，只验证流程")
    ap.add_argument("--freeze-layers", type=int, default=0, help="冻结前 N 层 encoder（0 = 全量微调）")
    ap.add_argument("--eval-only", action="store_true", help="跳过训练，用 --out-dir/model.pt 直接评估并写 metrics.json")
    train(ap.parse_args())


if __name__ == "__main__":
    main()
