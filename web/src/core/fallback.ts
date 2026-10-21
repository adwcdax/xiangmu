import type { AppData, ClassInfo } from './types';

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

const SUPPORTS = [21108, 12824, 5384, 5370, 4473, 1653, 1364, 457, 343, 305];
const F1 = [0.975, 0.9, 0.79, 0.735, 0.61, 0.79, 0.925, 0.47, 0.63, 0.535];
const PRECISION = [0.97, 0.9, 0.8, 0.75, 0.62, 0.8, 0.93, 0.41, 0.64, 0.55];
const RECALL = [0.98, 0.9, 0.78, 0.72, 0.6, 0.78, 0.92, 0.55, 0.62, 0.52];
const TOP2 = [0.99, 0.96, 0.91, 0.88, 0.8, 0.92, 0.96, 0.678, 0.78, 0.7];

/**
 * 数据文件全部读取失败时的兜底数据。仅保证页面不白屏，不代表任何真实结果。
 * 正常构建会使用 public/data 下的模拟数据。
 */
export function fallbackData(reason: string): AppData {
  return {
    meta: {
      data_mode: 'mock',
      frozen_at: null,
      git_commit: null,
      model_file: 'fasttext_zh_fraud.bin',
      seed: 20261021,
      hardware: '未知（兜底数据）',
      corpus_note: `语料为合成/半合成电诈样本。${reason}`,
      mock: true,
    },
    dataset: {
      total: 352836,
      classes: CLASSES,
      modality: { sms: 192993, dialog: 159843 },
      modality_by_class: null,
      splits: {
        rule: '沿用源表官方 split：按 source 五维分层，group（案件）不跨集',
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
      },
      integrity: { duplicate_rate: 0.0, cross_split_groups: 0, source_sha256: '710da89236fb3134' },
      length: { median: 121, p90: null, by_modality: null },
      mock: true,
    },
    results: {
      models: [
        {
          id: 'fasttext',
          name: 'fastText（逐字 + 2-gram）',
          status: 'verified',
          test: {
            n: 53281,
            accuracy: 0.8654,
            macro_f1: { value: 0.7365, ci: null },
            weighted_f1: 0.8637,
            top2_accuracy: 0.9397,
            binary: { accuracy: 0.9799, fraud_f1: 0.9833, macro_f1: 0.979 },
            per_class: CLASSES.map((c, i) => ({
              id: c.id,
              precision: PRECISION[i],
              recall: RECALL[i],
              f1: F1[i],
              top2: TOP2[i],
              support: SUPPORTS[i],
            })),
            confusion: null,
            top_confusions: {
              '网络婚恋、交友类': { '虚假网络投资理财类': 133, '虚假购物、服务类': 46 },
              '冒充电商物流客服类': { '虚假信用服务类': 665, '虚假购物、服务类': 312 },
            },
          },
          dev: { accuracy: 0.8653, macro_f1: 0.7417 },
          cost: { train_seconds: 40.1, model_size_mb: 38.9, predict_ms_per_item: null, threads: 32 },
        },
      ],
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
    },
    calibration: {
      split: 'test',
      n: 53281,
      before: { ece: 0.0102, brier: 0.0154, pr_auc: 0.9988 },
      after_isotonic: { ece: 0.0029, brier: 0.0145, pr_auc: 0.9988 },
      reliability: null,
      score_hist: null,
      high_band: { threshold: 0.9, share: 0.586, fraud_rate: 0.993 },
      mock: true,
    },
    domainShift: {
      target: '58 同城真实岗位帖',
      n_benign: 6958,
      n_fraud: 434,
      models: [
        { id: 'A', name: '基线（只用电诈语料）', fp_rate: 0.953, recall: 0.965, gap: 0.012 },
        { id: 'B', name: '混入真实负样本重训', fp_rate: 0.0, recall: 0.0, gap: 0.0 },
      ],
      score_dist: null,
      history_note: '真实招聘数据上另训模型 F1 0.22~0.40',
      mock: true,
    },
    cases: {
      demo: [
        {
          id: 'd04',
          modality: 'sms',
          text: '您好，您的快递在运输途中丢失，请添加客服微信【账号】办理理赔，需先缴纳一笔保证金。',
          turns: null,
          label: 4,
          pred: {
            label: 4,
            p_fraud: 1.0,
            top_k: [
              { id: 4, prob: 0.987 },
              { id: 3, prob: 0.009 },
              { id: 2, prob: 0.002 },
            ],
          },
          cues: [
            { start: 3, end: 7, kind: '冒充身份' },
            { start: 41, end: 47, kind: '先付款' },
          ],
          tag: 'strong_correct',
        },
        {
          id: 'd00',
          modality: 'sms',
          text: '【社区服务中心】本周六上午在小区广场开展免费义诊，请有需要的居民携带身份证前往。',
          turns: null,
          label: 0,
          pred: {
            label: 0,
            p_fraud: 0.01,
            top_k: [
              { id: 0, prob: 0.99 },
              { id: 1, prob: 0.006 },
              { id: 3, prob: 0.002 },
            ],
          },
          cues: [],
          tag: 'strong_correct',
        },
        {
          id: 'd07',
          modality: 'dialog',
          text: '坐席：我在婚恋平台看到你的资料，觉得挺合适的。\n客户：谢谢。\n坐席：我这边有个内部理财渠道，收益很稳，要不要一起做？',
          turns: [
            { role: '坐席', text: '我在婚恋平台看到你的资料，觉得挺合适的。' },
            { role: '客户', text: '谢谢。' },
            { role: '坐席', text: '我这边有个内部理财渠道，收益很稳，要不要一起做？' },
          ],
          label: 7,
          pred: {
            label: 1,
            p_fraud: 0.97,
            top_k: [
              { id: 1, prob: 0.71 },
              { id: 7, prob: 0.24 },
              { id: 3, prob: 0.03 },
            ],
          },
          cues: [
            { start: 2, end: 6, kind: '婚恋搭讪' },
            { start: 35, end: 41, kind: '投资诱导' },
          ],
          tag: 'class_overlap',
        },
      ],
      errors: [
        {
          id: 'e01',
          modality: 'sms',
          text: '我是你领导，明天上午来我办公室一趟，先别告诉别人。',
          turns: null,
          label: 5,
          pred: {
            label: 1,
            p_fraud: 0.88,
            top_k: [
              { id: 1, prob: 0.52 },
              { id: 5, prob: 0.31 },
              { id: 6, prob: 0.1 },
            ],
          },
          cues: [{ start: 0, end: 5, kind: '冒充身份' }],
          tag: 'class_overlap',
          note: '兜底示例：缺少后续借钱或转账话术，与投资类线索混淆。',
        },
        {
          id: 'e02',
          modality: 'dialog',
          text: '坐席：您的账户被冻结了，需要把保证金转到安全账户。\n客户：我没有转过账。\n坐席：按我说的做就行。',
          turns: [
            { role: '坐席', text: '您的账户被冻结了，需要把保证金转到安全账户。' },
            { role: '客户', text: '我没有转过账。' },
            { role: '坐席', text: '按我说的做就行。' },
          ],
          label: 4,
          pred: {
            label: 0,
            p_fraud: 0.42,
            top_k: [
              { id: 0, prob: 0.58 },
              { id: 4, prob: 0.3 },
              { id: 2, prob: 0.08 },
            ],
          },
          cues: [
            { start: 0, end: 10, kind: '制造恐慌' },
            { start: 18, end: 25, kind: '转账要求' },
          ],
          tag: 'weak_class',
          note: '兜底示例：弱类召回偏低，短对话缺少物流关键词。',
        },
        {
          id: 'e03',
          modality: 'sms',
          text: '恭喜您获得平台会员资格，点击链接领取礼品，运费自理。',
          turns: null,
          label: 3,
          pred: {
            label: 0,
            p_fraud: 0.3,
            top_k: [
              { id: 0, prob: 0.7 },
              { id: 3, prob: 0.2 },
              { id: 4, prob: 0.06 },
            ],
          },
          cues: [{ start: 0, end: 5, kind: '利益诱导' }],
          tag: 'weak_class',
          note: '兜底示例：营销短信与购物服务类边界重叠。',
        },
      ],
      out_of_domain: [
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
      ],
      mock: true,
    },
    race: null,
    warnings: [reason],
  };
}
