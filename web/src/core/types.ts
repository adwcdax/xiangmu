/** 数据契约（与《展示页面实施计划 v2》第 3 章一一对应）。字段只加不改名。 */

export type DataMode = 'mock' | 'real';
export type ModelStatus = 'verified' | 'partial' | 'missing';
export type Modality = 'sms' | 'dialog';
export type RacePred = number | 'unparsed';

export interface MetaData {
  data_mode: DataMode;
  frozen_at: string | null;
  git_commit: string | null;
  model_file: string;
  seed: number;
  hardware: string;
  corpus_note: string;
  mock?: boolean;
}

export interface ClassInfo {
  id: number;
  name: string;
  short: string;
  total: number;
  is_fraud: boolean;
}

export interface SplitCounts {
  rows: number;
  class_counts: number[];
}

export interface DatasetData {
  total: number;
  classes: ClassInfo[];
  modality: { sms: number; dialog: number };
  /** 每类的短信 / 对话数量；为 null 时 S1 隐藏小柱图 */
  modality_by_class: { sms: number[]; dialog: number[] } | null;
  splits: {
    rule: string;
    train: SplitCounts;
    dev: SplitCounts;
    test: SplitCounts;
  };
  integrity: { duplicate_rate: number; cross_split_groups: number; source_sha256: string };
  length: { median: number; p90: number | null; by_modality: { sms: number; dialog: number } | null };
  mock?: boolean;
}

export interface Interval {
  value: number;
  ci: [number, number] | null;
}

export interface PerClassMetric {
  id: number;
  precision: number;
  recall: number;
  f1: number;
  top2: number;
  support: number;
}

export interface BinaryMetrics {
  accuracy: number;
  fraud_f1: number;
  macro_f1: number;
}

export interface ModelTest {
  n: number;
  accuracy: number;
  macro_f1: Interval;
  weighted_f1: number;
  top2_accuracy: number;
  binary: BinaryMetrics;
  per_class: PerClassMetric[];
  /** 行是真实类，列是预测类；null 时 S3 用 top_confusions 降级 */
  confusion: number[][] | null;
  top_confusions: Record<string, Record<string, number>>;
}

export interface ModelCost {
  train_seconds: number;
  model_size_mb: number;
  predict_ms_per_item: number | null;
  threads: number;
}

export interface ModelResult {
  id: string;
  name: string;
  status: ModelStatus;
  test: ModelTest | null;
  dev: { accuracy: number; macro_f1: number } | null;
  cost: ModelCost | null;
}

export interface BaselineEntry {
  id: string;
  name: string;
  accuracy: number;
}

export interface SplitSensitivity {
  split: 'official' | 'quota_stratified' | 'group_count' | string;
  name: string;
  accuracy: number;
  macro_f1: number;
}

export interface ResultsData {
  models: ModelResult[];
  baselines: BaselineEntry[];
  split_sensitivity: SplitSensitivity[];
  mock?: boolean;
}

export interface CalibrationData {
  split: string;
  n: number;
  before: { ece: number; brier: number; pr_auc: number };
  after_isotonic: { ece: number; brier: number; pr_auc: number };
  reliability: { bin: number; mean_p: number; actual: number; n: number }[] | null;
  score_hist: { lo: number; hi: number; n: number; fraud_rate: number }[] | null;
  high_band: { threshold: number; share: number; fraud_rate: number };
  mock?: boolean;
}

export interface DomainShiftModel {
  id: string;
  name: string;
  fp_rate: number;
  recall: number;
  gap: number;
}

export interface DomainShiftData {
  target: string;
  n_benign: number;
  n_fraud: number;
  models: DomainShiftModel[];
  /** 两类帖子在 A/B 模型下的 p_fraud 直方图（各 10 箱） */
  score_dist: { A: { benign: number[]; fraud: number[] }; B: { benign: number[]; fraud: number[] } } | null;
  history_note: string;
  mock?: boolean;
}

export interface Turn {
  role: '坐席' | '客户' | string;
  text: string;
}

export interface Cue {
  start: number;
  end: number;
  kind: string;
}

export interface TopKEntry {
  id: number;
  prob: number;
}

export interface CasePred {
  label: number;
  p_fraud: number;
  top_k: TopKEntry[];
}

export type CaseTag = 'strong_correct' | 'class_overlap' | 'weak_class' | 'benign_fp' | string;

export interface DemoCase {
  id: string;
  modality: Modality;
  text: string;
  turns: Turn[] | null;
  label: number;
  pred: CasePred;
  cues: Cue[];
  tag: CaseTag;
}

export interface ErrorCase extends DemoCase {
  note: string;
}

export interface OutOfDomainCase {
  id: string;
  title?: string;
  text: string;
  label: 'benign' | 'fraud';
  p_fraud: number;
  note: string;
}

export interface CasesData {
  demo: DemoCase[];
  errors: ErrorCase[];
  out_of_domain: OutOfDomainCase[];
  mock?: boolean;
}

export interface RaceDeck {
  size: number;
  sampling: string;
  ids: string[];
  labels: number[];
  modality: Modality[];
  titles: string[];
  texts: string[];
}

export interface RaceDealer {
  model_id: string;
  /** multiclass：preds 为类别 id；binary：preds 为 0（无风险）/ 1（诈骗） */
  mode: 'multiclass' | 'binary';
  status: ModelStatus;
  preds: RacePred[];
  ms_per_item: number[] | null;
  total_seconds: number;
  unparsed_idx: number[];
}

export interface RaceTrace {
  deck: RaceDeck;
  dealers: RaceDealer[];
  measure_env: string;
  mock?: boolean;
}

export interface AppData {
  meta: MetaData;
  dataset: DatasetData;
  results: ResultsData;
  calibration: CalibrationData;
  domainShift: DomainShiftData;
  cases: CasesData;
  race: RaceTrace | null;
  warnings: string[];
  /** 使用了兜底/回退数据，或 real 数据混入 mock，需要红色提示 */
  fallback?: { files: string[]; reason: string };
}

export interface LoadResult {
  data: AppData;
  failedFiles: string[];
}
