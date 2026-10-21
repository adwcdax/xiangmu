/**
 * 生成模拟数据（固定种子），输出到 public/data/ 与 public/data/scenarios/<name>/。
 * 用法：node scripts/gen_mock.ts
 *
 * 数字底稿来自《展示页面实施计划 v2》第 3 章：fastText 的准确率、macro-F1、
 * 二分类指标、校准结果和域外检验是真实锚点；10×10 混淆矩阵、区间、逐条计时
 * 和样例文本是按锚点推算的模拟值。所有文件都带 mock: true。
 *
 * 每次运行都会重写默认数据与全部边界 fixture，保证 npm run mock:<场景> 都能拿到最新文件。
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import type {
  CalibrationData,
  CasesData,
  ClassInfo,
  Cue,
  DatasetData,
  DemoCase,
  DomainShiftData,
  ErrorCase,
  MetaData,
  Modality,
  OutOfDomainCase,
  RaceDealer,
  RaceTrace,
  ResultsData,
  Turn,
} from '../src/core/types.ts';

const ROOT = resolve(process.cwd());
const DATA_DIR = join(ROOT, 'public', 'data');
const SCENARIO_DIR = join(DATA_DIR, 'scenarios');

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round(v: number, d = 4): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

function shuffle<T>(rng: () => number, arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const CLASSES: ClassInfo[] = [
  { id: 0, name: '无风险', short: '无风险', total: 138795, is_fraud: false },
  { id: 1, name: '虚假网络投资理财类', short: '投资理财', total: 85581, is_fraud: true },
  { id: 2, name: '虚假信用服务类', short: '信用服务', total: 35395, is_fraud: true },
  { id: 3, name: '虚假购物、服务类', short: '购物服务', total: 35394, is_fraud: true },
  { id: 4, name: '冒充电商物流客服类', short: '电商客服', total: 29952, is_fraud: true },
  { id: 5, name: '冒充领导、熟人类', short: '领导熟人', total: 11130, is_fraud: true },
  { id: 6, name: '冒充公检法及政府机关类', short: '公检法', total: 9178, is_fraud: true },
  { id: 7, name: '网络婚恋、交友类', short: '婚恋交友', total: 3123, is_fraud: true },
  { id: 8, name: '网黑案件', short: '网黑', total: 2206, is_fraud: true },
  { id: 9, name: '冒充军警购物类诈骗', short: '军警购物', total: 2082, is_fraud: true },
];

const SPLITS = {
  train: {
    rows: 246403,
    class_counts: [96737, 59819, 24741, 24799, 20894, 7780, 6425, 2189, 1539, 1480],
  },
  dev: {
    rows: 53152,
    class_counts: [20950, 12938, 5270, 5225, 4585, 1697, 1389, 477, 324, 297],
  },
  test: {
    rows: 53281,
    class_counts: [21108, 12824, 5384, 5370, 4473, 1653, 1364, 457, 343, 305],
  },
};

const RECALL_TARGETS = [0.9796, 0.8975, 0.78, 0.72, 0.58, 0.78, 0.92, 0.55, 0.65, 0.52];
/** top-2 是 top-k 候选覆盖率，不要求能从 10×10 混淆矩阵反推，按评估文档的锚点填。 */
const TOP2_TARGETS = [0.99, 0.955, 0.92, 0.89, 0.8, 0.93, 0.96, 0.678, 0.78, 0.7];

interface RowSpec {
  fixed?: Record<number, number>;
  weights: Record<number, number>;
}

/** 每类的错误流向：fixed 是计划里点名的混淆，weights 分配剩余错误。 */
const ERROR_ROWS: RowSpec[] = [
  { weights: { 1: 4, 2: 1, 3: 2, 4: 2, 5: 0.5, 6: 0.5, 7: 0.2, 8: 0.2, 9: 0.2 } },
  { weights: { 2: 30, 3: 25, 8: 4, 7: 20, 5: 8, 4: 7, 6: 2, 9: 1, 0: 20 } },
  { weights: { 3: 35, 1: 25, 4: 20, 8: 3, 5: 5, 9: 2, 0: 15, 6: 1, 7: 1 } },
  { fixed: { 4: 517, 0: 200 }, weights: { 2: 150, 1: 250, 5: 100, 9: 30, 6: 50, 8: 10, 7: 50 } },
  { fixed: { 2: 665, 0: 320 }, weights: { 3: 400, 1: 250, 5: 120, 9: 40, 6: 40, 8: 10, 7: 8 } },
  { fixed: { 0: 90 }, weights: { 1: 35, 6: 25, 4: 15, 3: 10, 2: 5, 7: 2, 8: 1, 9: 1 } },
  { fixed: { 0: 30 }, weights: { 5: 30, 9: 10, 1: 20, 4: 15, 3: 5, 2: 2, 7: 1, 8: 1 } },
  { fixed: { 1: 133, 3: 46, 0: 10 }, weights: { 2: 15, 4: 8, 5: 1, 6: 1, 8: 1, 9: 1 } },
  { fixed: { 0: 5 }, weights: { 1: 40, 2: 30, 3: 10, 4: 10, 5: 5, 6: 1, 7: 1, 9: 1 } },
  { fixed: { 0: 20 }, weights: { 3: 35, 4: 30, 2: 20, 5: 10, 6: 10, 1: 1, 7: 1, 8: 1 } },
];

function distribute(total: number, weights: Record<number, number>): Record<number, number> {
  const entries = Object.entries(weights).map(([key, weight]) => ({ key: Number(key), weight }));
  const sum = entries.reduce((acc, entry) => acc + entry.weight, 0);
  const out: Record<number, number> = {};
  if (total <= 0 || sum <= 0) return out;
  const raw = entries.map((entry) => ({ key: entry.key, value: (total * entry.weight) / sum }));
  let used = 0;
  raw.forEach((entry) => {
    const floor = Math.floor(entry.value);
    out[entry.key] = floor;
    used += floor;
  });
  raw.sort((a, b) => b.value - Math.floor(b.value) - (a.value - Math.floor(a.value)));
  for (let i = 0; i < total - used; i += 1) out[raw[i % raw.length].key] += 1;
  return out;
}

function buildConfusion(): { matrix: number[][]; supports: number[] } {
  const supports = SPLITS.test.class_counts;
  const matrix = supports.map(() => Array(10).fill(0) as number[]);
  supports.forEach((support, row) => {
    const spec = ERROR_ROWS[row];
    const errorTotal = Math.round(support * (1 - RECALL_TARGETS[row]));
    const fixed = spec.fixed ?? {};
    const fixedSum = Object.values(fixed).reduce((a, b) => a + b, 0);
    const remaining = Math.max(0, errorTotal - fixedSum);
    const weights = Object.fromEntries(
      Object.entries(spec.weights).filter(([key]) => Number(key) !== row),
    ) as Record<number, number>;
    const allocated = distribute(remaining, weights);
    matrix[row][row] = support - errorTotal;
    for (const [key, value] of Object.entries(fixed)) matrix[row][Number(key)] += value;
    for (const [key, value] of Object.entries(allocated)) matrix[row][Number(key)] += value;
  });
  return { matrix, supports };
}

function metricsFromConfusion(matrix: number[][], supports: number[]) {
  const n = supports.reduce((a, b) => a + b, 0);
  const perClass = supports.map((support, id) => {
    const tp = matrix[id][id];
    const colSum = matrix.reduce((acc, row) => acc + row[id], 0);
    const precision = colSum > 0 ? tp / colSum : 0;
    const recall = support > 0 ? tp / support : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    return {
      id,
      precision: round(precision),
      recall: round(recall),
      f1: round(f1),
      top2: TOP2_TARGETS[id],
      support,
    };
  });
  const accuracy = matrix.reduce((acc, row, i) => acc + row[i], 0) / n;
  const macro = perClass.reduce((acc, c) => acc + c.f1, 0) / 10;
  const weighted = perClass.reduce((acc, c) => acc + c.f1 * c.support, 0) / n;
  const top2 = perClass.reduce((acc, c) => acc + c.top2 * c.support, 0) / n;
  const topConfusions: Record<string, Record<string, number>> = {};
  matrix.forEach((row, i) => {
    const entries = row
      .map((count, col) => ({ col, count }))
      .filter((entry) => entry.col !== i && entry.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    topConfusions[CLASSES[i].name] = Object.fromEntries(
      entries.map((entry) => [CLASSES[entry.col].name, entry.count]),
    );
  });
  return {
    accuracy: round(accuracy),
    macro: round(macro),
    weighted: round(weighted),
    top2: round(top2),
    perClass,
    topConfusions,
  };
}

const CONFUSION = buildConfusion();
const METRICS = metricsFromConfusion(CONFUSION.matrix, CONFUSION.supports);
// 头条指标采用计划第 3 章的真实锚点；逐类 F1 与混淆矩阵保持 mock 内部一致。
METRICS.accuracy = 0.8654;
METRICS.macro = 0.7365;
METRICS.weighted = 0.8637;
METRICS.top2 = 0.9397;

const META: MetaData = {
  data_mode: 'mock',
  frozen_at: null,
  git_commit: '51da509',
  model_file: 'fasttext_zh_fraud.bin',
  seed: 20261021,
  hardware: '占位：CPU / 32 线程 / 内存待实测',
  corpus_note: '语料为合成/半合成电诈样本，结论仅适用于该语料域。',
  mock: true,
};

const DATASET: DatasetData = {
  total: 352836,
  classes: CLASSES,
  modality: { sms: 192993, dialog: 159843 },
  modality_by_class: null,
  splits: {
    rule: '沿用源表官方 split：按 source 五维分层，group（案件）不跨集',
    train: SPLITS.train,
    dev: SPLITS.dev,
    test: SPLITS.test,
  },
  integrity: { duplicate_rate: 0.0, cross_split_groups: 0, source_sha256: '710da89236fb3134' },
  length: { median: 121, p90: null, by_modality: null },
  mock: true,
};

function buildResults(withSecondModel = false): ResultsData {
  const fasttext = {
    id: 'fasttext',
    name: 'fastText（逐字 + 2-gram）',
    status: 'verified' as const,
    test: {
      n: SPLITS.test.rows,
      accuracy: METRICS.accuracy,
      macro_f1: { value: METRICS.macro, ci: null as [number, number] | null },
      weighted_f1: METRICS.weighted,
      top2_accuracy: METRICS.top2,
      binary: { accuracy: 0.9799, fraud_f1: 0.9833, macro_f1: 0.979 },
      per_class: METRICS.perClass,
      confusion: CONFUSION.matrix,
      top_confusions: METRICS.topConfusions,
    },
    dev: { accuracy: 0.8653, macro_f1: 0.7417 },
    cost: { train_seconds: 40.1, model_size_mb: 38.9, predict_ms_per_item: null, threads: 32 },
  };
  const models: ResultsData['models'] = [fasttext];
  if (withSecondModel) {
    const perClass = METRICS.perClass.map((c) => ({
      ...c,
      precision: round(Math.max(0, c.precision - 0.012)),
      recall: round(Math.max(0, c.recall - 0.01)),
      f1: round(Math.max(0, c.f1 - 0.011)),
      top2: round(Math.min(1, c.top2 + 0.004)),
    }));
    models.push({
      id: 'tfidf_lr',
      name: '字符 TF-IDF + 逻辑回归',
      status: 'verified',
      test: {
        n: SPLITS.test.rows,
        accuracy: round(METRICS.accuracy - 0.009),
        macro_f1: { value: round(METRICS.macro - 0.014), ci: null },
        weighted_f1: round(METRICS.weighted - 0.01),
        top2_accuracy: round(METRICS.top2 - 0.004),
        binary: { accuracy: 0.9741, fraud_f1: 0.979, macro_f1: 0.973 },
        per_class: perClass,
        confusion: CONFUSION.matrix,
        top_confusions: METRICS.topConfusions,
      },
      dev: { accuracy: 0.8561, macro_f1: 0.7298 },
      cost: { train_seconds: 128.4, model_size_mb: 12.6, predict_ms_per_item: null, threads: 32 },
    });
  }
  return {
    models,
    baselines: [
      { id: 'all_benign', name: '全判无风险', accuracy: 0.396 },
      { id: 'all_invest', name: '全判投资理财', accuracy: 0.241 },
    ],
    split_sensitivity: [
      { split: 'official', name: '官方 split（按来源分层）', accuracy: 0.8654, macro_f1: 0.7365 },
      { split: 'quota_stratified', name: '自切分（按样本配额分层）', accuracy: 0.8423, macro_f1: 0.7079 },
      { split: 'group_count', name: '自切分（按组数分层，方法不当）', accuracy: 0.8008, macro_f1: 0.6229 },
    ],
    mock: true,
  };
}

const RESULTS = buildResults();

const CALIBRATION: CalibrationData = {
  split: 'test',
  n: SPLITS.test.rows,
  before: { ece: 0.0102, brier: 0.0154, pr_auc: 0.9988 },
  after_isotonic: { ece: 0.0029, brier: 0.0145, pr_auc: 0.9988 },
  reliability: [
    { bin: 0, mean_p: 0.006, actual: 0.003, n: 5328 },
    { bin: 1, mean_p: 0.02, actual: 0.01, n: 5328 },
    { bin: 2, mean_p: 0.04, actual: 0.028, n: 5328 },
    { bin: 3, mean_p: 0.08, actual: 0.055, n: 5328 },
    { bin: 4, mean_p: 0.15, actual: 0.115, n: 5328 },
    { bin: 5, mean_p: 0.29, actual: 0.24, n: 5328 },
    { bin: 6, mean_p: 0.5, actual: 0.44, n: 5328 },
    { bin: 7, mean_p: 0.72, actual: 0.65, n: 5328 },
    { bin: 8, mean_p: 0.93, actual: 0.87, n: 5328 },
    { bin: 9, mean_p: 0.997, actual: 0.993, n: 5329 },
  ],
  score_hist: [
    { lo: 0.0, hi: 0.1, n: 18500, fraud_rate: 0.0001 },
    { lo: 0.1, hi: 0.2, n: 400, fraud_rate: 0.02 },
    { lo: 0.2, hi: 0.3, n: 200, fraud_rate: 0.03 },
    { lo: 0.3, hi: 0.4, n: 150, fraud_rate: 0.05 },
    { lo: 0.4, hi: 0.5, n: 150, fraud_rate: 0.08 },
    { lo: 0.5, hi: 0.6, n: 200, fraud_rate: 0.15 },
    { lo: 0.6, hi: 0.7, n: 300, fraud_rate: 0.25 },
    { lo: 0.7, hi: 0.8, n: 500, fraud_rate: 0.35 },
    { lo: 0.8, hi: 0.9, n: 1658, fraud_rate: 0.55 },
    { lo: 0.9, hi: 1.0, n: 31223, fraud_rate: 0.993 },
  ],
  high_band: { threshold: 0.9, share: 0.586, fraud_rate: 0.993 },
  mock: true,
};

const DOMAIN_SHIFT: DomainShiftData = {
  target: '58 同城真实岗位帖',
  n_benign: 6958,
  n_fraud: 434,
  models: [
    { id: 'A', name: '基线（只用电诈语料）', fp_rate: 0.953, recall: 0.965, gap: 0.012 },
    { id: 'B', name: '混入真实负样本重训', fp_rate: 0.0, recall: 0.0, gap: 0.0 },
  ],
  score_dist: {
    A: {
      benign: [120, 40, 30, 30, 40, 60, 100, 180, 1200, 5158],
      fraud: [5, 2, 2, 2, 3, 4, 6, 10, 40, 360],
    },
    B: {
      benign: [6000, 500, 200, 100, 60, 40, 30, 20, 8, 0],
      fraud: [380, 30, 10, 6, 4, 2, 1, 1, 0, 0],
    },
  },
  history_note: '真实招聘数据上另训模型 F1 0.22~0.40',
  mock: true,
};

function top3(first: number, p1: number, second: number, p2: number, third: number): {
  id: number;
  prob: number;
}[] {
  return [
    { id: first, prob: p1 },
    { id: second, prob: p2 },
    { id: third, prob: round(1 - p1 - p2) },
  ];
}

function cuesFor(text: string, entries: [string, string][]): Cue[] {
  return entries.flatMap(([phrase, kind]) => {
    const start = text.indexOf(phrase);
    return start >= 0 ? [{ start, end: start + phrase.length, kind }] : [];
  });
}

function turnsText(turns: Turn[]): string {
  return turns.map((turn) => `${turn.role}：${turn.text}`).join('\n');
}

function dialog(turns: Turn[]): { text: string; turns: Turn[] } {
  return { text: turnsText(turns), turns };
}

const demo: DemoCase[] = [
  {
    id: 'd00',
    modality: 'sms',
    text: '【社区服务中心】本周六上午在小区广场开展免费义诊，请有需要的居民携带身份证前往。',
    turns: null,
    label: 0,
    pred: { label: 0, p_fraud: 0.01, top_k: top3(0, 0.988, 1, 0.008, 3) },
    cues: [],
    tag: 'strong_correct',
  },
  {
    id: 'd01',
    modality: 'sms',
    text: '内部渠道，稳赚不赔，跟着老师带单操作，日收益百分之五，先加群了解。',
    turns: null,
    label: 1,
    pred: { label: 1, p_fraud: 0.999, top_k: top3(1, 0.97, 2, 0.02, 3) },
    cues: cuesFor('内部渠道，稳赚不赔，跟着老师带单操作，日收益百分之五，先加群了解。', [
      ['稳赚不赔', '收益承诺'],
      ['带单', '投资诱导'],
      ['日收益', '收益承诺'],
    ]),
    tag: 'strong_correct',
  },
  {
    id: 'd02',
    modality: 'sms',
    text: '您的信用额度已提升，缴纳手续费即可放款，无需抵押，当天到账。',
    turns: null,
    label: 2,
    pred: { label: 2, p_fraud: 0.995, top_k: top3(2, 0.91, 1, 0.05, 0) },
    cues: cuesFor('您的信用额度已提升，缴纳手续费即可放款，无需抵押，当天到账。', [
      ['信用额度', '贷款诱导'],
      ['手续费', '先付款'],
    ]),
    tag: 'strong_correct',
  },
  {
    id: 'd03',
    modality: 'sms',
    text: '恭喜您获得平台会员资格，点击链接领取礼品，运费自理。',
    turns: null,
    label: 3,
    pred: { label: 3, p_fraud: 0.94, top_k: top3(3, 0.72, 4, 0.18, 0) },
    cues: cuesFor('恭喜您获得平台会员资格，点击链接领取礼品，运费自理。', [
      ['点击链接', '钓鱼链接'],
      ['运费自理', '先付款'],
    ]),
    tag: 'strong_correct',
  },
  {
    id: 'd04',
    modality: 'sms',
    text: '您好，您的快递在运输途中丢失，请添加客服微信【账号】办理理赔，需先缴纳保证金。',
    turns: null,
    label: 4,
    pred: { label: 4, p_fraud: 1.0, top_k: top3(4, 0.987, 3, 0.009, 2) },
    cues: cuesFor('您好，您的快递在运输途中丢失，请添加客服微信【账号】办理理赔，需先缴纳保证金。', [
      ['快递在运输途中丢失', '冒充客服'],
      ['保证金', '先付款'],
    ]),
    tag: 'strong_correct',
  },
  {
    id: 'd05',
    modality: 'sms',
    text: '我是你领导，明天上午来我办公室一趟，先别告诉别人。',
    turns: null,
    label: 5,
    pred: { label: 5, p_fraud: 0.95, top_k: top3(5, 0.78, 1, 0.12, 6) },
    cues: cuesFor('我是你领导，明天上午来我办公室一趟，先别告诉别人。', [
      ['我是你领导', '冒充身份'],
      ['先别告诉别人', '制造保密'],
    ]),
    tag: 'strong_correct',
  },
  {
    id: 'd06',
    modality: 'dialog',
    ...dialog([
      { role: '坐席', text: '你涉嫌一起洗钱案件，需要配合调查。' },
      { role: '客户', text: '我没有做过啊。' },
      { role: '坐席', text: '把资金转到安全账户接受审查，否则上门抓人。' },
    ]),
    label: 6,
    pred: { label: 6, p_fraud: 0.999, top_k: top3(6, 0.96, 5, 0.02, 2) },
    cues: cuesFor(
      '坐席：你涉嫌一起洗钱案件，需要配合调查。\n客户：我没有做过啊。\n坐席：把资金转到安全账户接受审查，否则上门抓人。',
      [
        ['涉嫌一起洗钱案件', '制造恐慌'],
        ['安全账户', '转账要求'],
      ],
    ),
    tag: 'strong_correct',
  },
  {
    id: 'd07',
    modality: 'dialog',
    ...dialog([
      { role: '坐席', text: '我在婚恋平台看到你的资料，觉得挺合适的。' },
      { role: '客户', text: '谢谢。' },
      { role: '坐席', text: '我这边有个内部理财渠道，收益很稳，要不要一起做？' },
    ]),
    label: 7,
    pred: { label: 1, p_fraud: 0.97, top_k: top3(1, 0.71, 7, 0.24, 3) },
    cues: cuesFor(
      '坐席：我在婚恋平台看到你的资料，觉得挺合适的。\n客户：谢谢。\n坐席：我这边有个内部理财渠道，收益很稳，要不要一起做？',
      [
        ['婚恋平台', '婚恋搭讪'],
        ['内部理财渠道', '投资诱导'],
      ],
    ),
    tag: 'class_overlap',
  },
  {
    id: 'd08',
    modality: 'sms',
    text: '兄弟，把你名下银行卡借我用一下，走一笔账，给你抽成，不会有事。',
    turns: null,
    label: 8,
    pred: { label: 8, p_fraud: 0.93, top_k: top3(8, 0.68, 2, 0.15, 1) },
    cues: cuesFor('兄弟，把你名下银行卡借我用一下，走一笔账，给你抽成，不会有事。', [
      ['银行卡借我', '借卡走账'],
      ['抽成', '利益诱导'],
    ]),
    tag: 'strong_correct',
  },
  {
    id: 'd09',
    modality: 'dialog',
    ...dialog([
      { role: '坐席', text: '我们是部队采购，需要一批帐篷，你先垫付定金。' },
      { role: '客户', text: '怎么付？' },
      { role: '坐席', text: '稍后发你账户，走完流程再结算。' },
    ]),
    label: 9,
    pred: { label: 9, p_fraud: 0.92, top_k: top3(9, 0.64, 3, 0.2, 4) },
    cues: cuesFor(
      '坐席：我们是部队采购，需要一批帐篷，你先垫付定金。\n客户：怎么付？\n坐席：稍后发你账户，走完流程再结算。',
      [
        ['部队采购', '冒充身份'],
        ['垫付定金', '先付款'],
      ],
    ),
    tag: 'strong_correct',
  },
];

const errors: ErrorCase[] = [
  {
    id: 'e01',
    modality: 'sms',
    text: '我是你领导，最近有个内部项目，你先转一笔钱过来。',
    turns: null,
    label: 5,
    pred: { label: 1, p_fraud: 0.88, top_k: top3(1, 0.52, 5, 0.31, 6) },
    cues: cuesFor('我是你领导，最近有个内部项目，你先转一笔钱过来。', [
      ['我是你领导', '冒充身份'],
      ['转一笔钱', '转账要求'],
    ]),
    tag: 'class_overlap',
    note: '缺少后续借钱话术，与投资类“内部项目”线索混淆。',
  },
  {
    id: 'e02',
    modality: 'dialog',
    ...dialog([
      { role: '坐席', text: '我们在交友软件认识的，你还记得吗？' },
      { role: '客户', text: '记得。' },
      { role: '坐席', text: '我带你做一个稳赚的平台，先投一点试试。' },
    ]),
    label: 7,
    pred: { label: 1, p_fraud: 0.96, top_k: top3(1, 0.61, 7, 0.28, 3) },
    cues: cuesFor(
      '坐席：我们在交友软件认识的，你还记得吗？\n客户：记得。\n坐席：我带你做一个稳赚的平台，先投一点试试。',
      [
        ['交友软件', '婚恋搭讪'],
        ['稳赚的平台', '投资诱导'],
      ],
    ),
    tag: 'class_overlap',
    note: '婚恋引流后转入投资话术，真实类与预测类共享“投资”线索。',
  },
  {
    id: 'e03',
    modality: 'sms',
    text: '您购买的商品有质量问题，我们双倍退款，请先扫码缴纳保证金。',
    turns: null,
    label: 3,
    pred: { label: 4, p_fraud: 0.98, top_k: top3(4, 0.55, 3, 0.32, 2) },
    cues: cuesFor('您购买的商品有质量问题，我们双倍退款，请先扫码缴纳保证金。', [
      ['双倍退款', '利益诱导'],
      ['保证金', '先付款'],
    ]),
    tag: 'class_overlap',
    note: '“商品质量 + 退款”同时命中购物服务与电商客服。',
  },
  {
    id: 'e04',
    modality: 'sms',
    text: '您的账户被冻结了，需要把保证金转到安全账户。',
    turns: null,
    label: 4,
    pred: { label: 2, p_fraud: 0.91, top_k: top3(2, 0.49, 4, 0.35, 0) },
    cues: cuesFor('您的账户被冻结了，需要把保证金转到安全账户。', [
      ['账户被冻结', '制造恐慌'],
      ['安全账户', '转账要求'],
    ]),
    tag: 'class_overlap',
    note: '短文本缺少物流关键词，被判为信用服务类。',
  },
  {
    id: 'e05',
    modality: 'dialog',
    ...dialog([
      { role: '坐席', text: '您的包裹在分拣中心丢了。' },
      { role: '客户', text: '然后呢？' },
      { role: '坐席', text: '加我微信，填一下理赔信息。' },
    ]),
    label: 4,
    pred: { label: 0, p_fraud: 0.42, top_k: top3(0, 0.58, 4, 0.3, 2) },
    cues: cuesFor(
      '坐席：您的包裹在分拣中心丢了。\n客户：然后呢？\n坐席：加我微信，填一下理赔信息。',
      [['包裹在分拣中心丢了', '冒充客服']],
    ),
    tag: 'weak_class',
    note: '弱类漏判：对话过短，未出现“保证金”“退款”等强线索。',
  },
  {
    id: 'e06',
    modality: 'sms',
    text: '我们是部队采购，需要一批物资，你先垫付。',
    turns: null,
    label: 9,
    pred: { label: 3, p_fraud: 0.7, top_k: top3(3, 0.44, 9, 0.33, 0) },
    cues: cuesFor('我们是部队采购，需要一批物资，你先垫付。', [
      ['部队采购', '冒充身份'],
      ['垫付', '先付款'],
    ]),
    tag: 'weak_class',
    note: '弱类漏判：采购话术与购物服务类高度重叠。',
  },
  {
    id: 'e07',
    modality: 'dialog',
    ...dialog([
      { role: '客户', text: '网上认识的朋友说带我投资。' },
      { role: '坐席', text: '您转账了吗？' },
      { role: '客户', text: '还没有，他让我先下载一个软件。' },
    ]),
    label: 7,
    pred: { label: 0, p_fraud: 0.45, top_k: top3(0, 0.55, 7, 0.3, 1) },
    cues: cuesFor(
      '客户：网上认识的朋友说带我投资。\n坐席：您转账了吗？\n客户：还没有，他让我先下载一个软件。',
      [['带我投资', '投资诱导']],
    ),
    tag: 'weak_class',
    note: '弱类漏判：咨询口吻、没有既遂行为，模型偏向无风险。',
  },
  {
    id: 'e08',
    modality: 'sms',
    text: '把银行卡借我走账，给你抽成。',
    turns: null,
    label: 8,
    pred: { label: 2, p_fraud: 0.58, top_k: top3(2, 0.46, 8, 0.36, 0) },
    cues: cuesFor('把银行卡借我走账，给你抽成。', [
      ['银行卡借我', '借卡走账'],
      ['抽成', '利益诱导'],
    ]),
    tag: 'weak_class',
    note: '弱类漏判：借卡走账与信用服务类的“账户”线索混淆。',
  },
  {
    id: 'e09',
    modality: 'sms',
    text: '招聘兼职，日结工资，多劳多得。',
    turns: null,
    label: 0,
    pred: { label: 1, p_fraud: 0.65, top_k: top3(1, 0.57, 0, 0.35, 3) },
    cues: cuesFor('招聘兼职，日结工资，多劳多得。', [['日结工资', '利益诱导']]),
    tag: 'benign_fp',
    note: '正常兼职信息被“日结”“多劳多得”带到投资类。',
  },
  {
    id: 'e10',
    modality: 'sms',
    text: '双十一促销，全场五折，先到先得。',
    turns: null,
    label: 0,
    pred: { label: 3, p_fraud: 0.6, top_k: top3(3, 0.52, 0, 0.4, 4) },
    cues: cuesFor('双十一促销，全场五折，先到先得。', [['促销', '营销话术']]),
    tag: 'benign_fp',
    note: '正常促销短信与购物服务类的营销话术重叠。',
  },
  {
    id: 'e11',
    modality: 'sms',
    text: '您的快递已到小区驿站，请凭取件码领取。',
    turns: null,
    label: 0,
    pred: { label: 4, p_fraud: 0.56, top_k: top3(4, 0.48, 0, 0.44, 3) },
    cues: cuesFor('您的快递已到小区驿站，请凭取件码领取。', [['快递已到', '物流通知']]),
    tag: 'benign_fp',
    note: '正常物流通知被误判为电商客服类。',
  },
  {
    id: 'e12',
    modality: 'sms',
    text: '社区民警提醒：近期冒充公检法诈骗多发，请提高警惕。',
    turns: null,
    label: 0,
    pred: { label: 6, p_fraud: 0.58, top_k: top3(6, 0.51, 0, 0.42, 5) },
    cues: cuesFor('社区民警提醒：近期冒充公检法诈骗多发，请提高警惕。', [['冒充公检法', '反诈提醒']]),
    tag: 'benign_fp',
    note: '反诈宣传本身包含“公检法”关键词，被误判为冒充公检法类。',
  },
];

const outOfDomain: OutOfDomainCase[] = [
  {
    id: 'o01',
    title: '普工招聘',
    text: '【职位名称】普工，月薪六千至八千，包吃住，工作地点在城东工业园，无需经验，当天可安排面试。',
    label: 'benign',
    p_fraud: 0.97,
    note: '正常岗位帖被判为诈骗',
  },
  {
    id: 'o02',
    title: '仓库分拣员',
    text: '招聘仓库分拣员若干名，负责货物扫描与码放，八小时工作制，入职缴纳社保。',
    label: 'benign',
    p_fraud: 0.95,
    note: '正常岗位帖被判为诈骗',
  },
  {
    id: 'o03',
    title: '餐厅服务员',
    text: '餐厅招聘服务员，包工作餐，月休四天，有经验优先，地址在商业街。',
    label: 'benign',
    p_fraud: 0.94,
    note: '正常岗位帖被判为诈骗',
  },
  {
    id: 'o04',
    title: '司机',
    text: '招聘货运司机，要求持证，路线固定，月结运费，车辆由公司提供。',
    label: 'benign',
    p_fraud: 0.93,
    note: '正常岗位帖被判为诈骗',
  },
];

const CASES: CasesData = { demo, errors, out_of_domain: outOfDomain, mock: true };

const DECK_TEXTS: string[][] = [
  ['社区通知：本周六上午免费义诊。', '快递已放至小区驿站，请及时领取。', '图书馆闭馆通知，请合理安排时间。'],
  ['内部渠道，稳赚不赔，跟老师带单。', '日收益百分之五，先加群了解。', '平台内测名额，充值即可返利。'],
  ['信用额度提升，缴纳手续费即可放款。', '无需抵押，当天到账，先交服务费。', '您的贷款申请已通过，请联系客服。'],
  ['恭喜获得会员资格，点击链接领礼品。', '商品质量问题，双倍退款请扫码。', '限时秒杀，先付定金锁定名额。'],
  ['您的快递丢失，加客服微信理赔。', '包裹破损，需先缴纳保证金。', '订单异常，请添加客服办理退款。'],
  ['我是你领导，来办公室一趟。', '换号了，先帮我转一笔钱。', '这是新项目，别告诉其他人。'],
  ['你涉嫌洗钱，需配合调查。', '把资金转入安全账户接受审查。', '这里是公安局，请立刻联系办案人员。'],
  ['婚恋平台认识的，带你投资。', '我这边有内部理财渠道，收益很稳。', '先做一单试试，稳赚不亏。'],
  ['把银行卡借我走账，给你抽成。', '帮忙收一笔款，事后给你好处。', '用你的账户过一下账，不会有风险。'],
  ['部队采购需要物资，你先垫付。', '军警单位采购，稍后统一结算。', '批量采购帐篷，定金先付。'],
];

function buildDeck(seed: number): RaceTrace['deck'] {
  const rng = mulberry32(seed);
  const counts = [18, 16, 12, 12, 10, 8, 6, 6, 6, 6];
  const labels: number[] = [];
  counts.forEach((count, label) => {
    for (let i = 0; i < count; i += 1) labels.push(label);
  });
  const shuffled = shuffle(rng, labels);
  const ids = shuffled.map((_, index) => `r${String(index + 1).padStart(3, '0')}`);
  const modality: Modality[] = shuffled.map(() => (rng() < 0.55 ? 'sms' : 'dialog'));
  const texts = shuffled.map((label, index) => {
    const pool = DECK_TEXTS[label];
    return pool[index % pool.length];
  });
  const titles = shuffled.map((_, index) => `抽样 ${String(index + 1).padStart(3, '0')}`);
  return {
    size: shuffled.length,
    sampling: '按 10 类分层抽样，每类至少 6 张',
    ids,
    labels: shuffled,
    modality,
    titles,
    texts,
  };
}

function applyErrors(
  rng: () => number,
  labels: number[],
  plan: { label: number; count: number; to: number }[],
): { preds: number[]; used: Set<number> } {
  const preds = [...labels];
  const used = new Set<number>();
  for (const item of plan) {
    const candidates = shuffle(
      rng,
      labels
        .map((label, index) => ({ label, index }))
        .filter((entry) => entry.label === item.label && !used.has(entry.index)),
    );
    candidates.slice(0, item.count).forEach((entry) => {
      preds[entry.index] = item.to;
      used.add(entry.index);
    });
  }
  return { preds, used };
}

function buildRace(mode: 'only-fasttext' | 'multi-model'): RaceTrace {
  const deck = buildDeck(20261021);
  const rng = mulberry32(20261022);
  const ms = deck.ids.map(() => round(1.2 + rng() * 1.6, 1));
  const multiclass = applyErrors(rng, deck.labels, [
    { label: 7, count: 3, to: 1 },
    { label: 4, count: 3, to: 2 },
    { label: 9, count: 2, to: 3 },
    { label: 3, count: 2, to: 4 },
    { label: 2, count: 1, to: 3 },
    { label: 5, count: 1, to: 1 },
    { label: 8, count: 1, to: 2 },
  ]);
  const binaryBase = deck.labels.map((label) => (label === 0 ? 0 : 1));
  const benignIdx = deck.labels.findIndex((label) => label === 0);
  const fraudIdx = deck.labels.findIndex((label) => label !== 0);
  const binaryPreds = [...binaryBase];
  if (benignIdx >= 0) binaryPreds[benignIdx] = 1;
  if (fraudIdx >= 0) binaryPreds[fraudIdx] = 0;

  const dealers: RaceDealer[] = [];
  if (mode === 'only-fasttext') {
    dealers.push({
      model_id: 'fasttext',
      mode: 'binary',
      status: 'verified',
      preds: binaryPreds,
      ms_per_item: ms,
      total_seconds: round(ms.reduce((a, b) => a + b, 0) / 1000, 3),
      unparsed_idx: [],
    });
    dealers.push({
      model_id: 'fasttext',
      mode: 'multiclass',
      status: 'verified',
      preds: multiclass.preds,
      ms_per_item: ms,
      total_seconds: round(ms.reduce((a, b) => a + b, 0) / 1000, 3),
      unparsed_idx: [],
    });
  } else {
    dealers.push({
      model_id: 'fasttext',
      mode: 'multiclass',
      status: 'verified',
      preds: multiclass.preds,
      ms_per_item: ms,
      total_seconds: round(ms.reduce((a, b) => a + b, 0) / 1000, 3),
      unparsed_idx: [],
    });
    const slow = deck.ids.map(() => round(3.0 + rng() * 2.2, 1));
    const tfidf = applyErrors(rng, deck.labels, [
      { label: 7, count: 4, to: 1 },
      { label: 4, count: 4, to: 2 },
      { label: 9, count: 3, to: 3 },
      { label: 3, count: 3, to: 4 },
      { label: 2, count: 2, to: 3 },
      { label: 5, count: 2, to: 1 },
      { label: 8, count: 1, to: 2 },
    ]);
    dealers.push({
      model_id: 'tfidf_lr',
      mode: 'multiclass',
      status: 'verified',
      preds: tfidf.preds,
      ms_per_item: slow,
      total_seconds: round(slow.reduce((a, b) => a + b, 0) / 1000, 3),
      unparsed_idx: [],
    });
  }
  return {
    deck,
    dealers,
    measure_env: 'CPU 32 线程，单条计时，mock 数据',
    mock: true,
  };
}

interface DataFiles {
  'meta.json': MetaData;
  'dataset.json': DatasetData;
  'results.json': ResultsData;
  'calibration.json': CalibrationData;
  'domain_shift.json': DomainShiftData;
  'cases.json': CasesData;
  'race_trace.json': RaceTrace;
}

function defaultFiles(): DataFiles {
  return {
    'meta.json': META,
    'dataset.json': DATASET,
    'results.json': RESULTS,
    'calibration.json': CALIBRATION,
    'domain_shift.json': DOMAIN_SHIFT,
    'cases.json': CASES,
    'race_trace.json': buildRace('only-fasttext'),
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function scenarioFiles(name: string): DataFiles | null {
  const files = clone(defaultFiles());
  switch (name) {
    case 'only-fasttext':
      return files;
    case 'multi-model':
      files['results.json'] = buildResults(true);
      files['race_trace.json'] = buildRace('multi-model');
      return files;
    case 'no-confusion':
      files['results.json'].models[0].test!.confusion = null;
      return files;
    case 'no-calibration-bins':
      files['calibration.json'].reliability = null;
      files['calibration.json'].score_hist = null;
      return files;
    case 'no-score-dist':
      files['domain_shift.json'].score_dist = null;
      return files;
    case 'saturated-demo':
      files['cases.json'].demo.forEach((item) => {
        const first = item.pred.label;
        item.pred.p_fraud = item.label === 0 ? 0 : 1;
        item.pred.top_k = [
          { id: first, prob: 1 },
          { id: (first + 1) % 10, prob: 0 },
          { id: (first + 2) % 10, prob: 0 },
        ];
      });
      return files;
    default:
      return null;
  }
}

const SCENARIOS = [
  'only-fasttext',
  'multi-model',
  'no-confusion',
  'no-calibration-bins',
  'no-score-dist',
  'saturated-demo',
];

const SCENARIO_DIRS: Record<string, string> = {
  'only-fasttext': join(SCENARIO_DIR, 'only-fasttext'),
  'multi-model': join(SCENARIO_DIR, 'multi-model'),
  'no-confusion': join(SCENARIO_DIR, 'no-confusion'),
  'no-calibration-bins': join(SCENARIO_DIR, 'no-calibration-bins'),
  'no-score-dist': join(SCENARIO_DIR, 'no-score-dist'),
  'saturated-demo': join(SCENARIO_DIR, 'saturated-demo'),
};

const FILE_NAMES = [
  'meta.json',
  'dataset.json',
  'results.json',
  'calibration.json',
  'domain_shift.json',
  'cases.json',
  'race_trace.json',
] as const;

function writeDir(dir: string, files: DataFiles): void {
  const target = resolve(dir);
  const root = resolve(DATA_DIR);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(`拒绝写入数据目录之外的路径：${target}`);
  }
  mkdirSync(target, { recursive: true });
  for (const name of FILE_NAMES) {
    writeFileSync(join(target, name), `${JSON.stringify(files[name], null, 2)}\n`, 'utf8');
  }
}

rmSync(SCENARIO_DIR, { recursive: true, force: true });
writeDir(DATA_DIR, defaultFiles());
for (const name of SCENARIOS) {
  const files = scenarioFiles(name);
  const dir = SCENARIO_DIRS[name];
  if (files && dir) writeDir(dir, files);
}
console.log(`✓ 已生成默认数据与 ${SCENARIOS.length} 个场景`);
