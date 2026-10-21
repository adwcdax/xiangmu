import { THEME, rgbChannels } from './theme';

export interface ClassMeta {
  id: number;
  name: string;
  short: string;
  color: string;
  /** CSS RGB 通道，用于 rgb(var(--cN-rgb) / alpha) */
  rgb: string;
  isFraud: boolean;
}

export const CLASS_META: ClassMeta[] = [
  { id: 0, name: '无风险', short: '无风险', color: THEME.classColors[0], rgb: rgbChannels(THEME.classColors[0]), isFraud: false },
  { id: 1, name: '虚假网络投资理财类', short: '投资理财', color: THEME.classColors[1], rgb: rgbChannels(THEME.classColors[1]), isFraud: true },
  { id: 2, name: '虚假信用服务类', short: '信用服务', color: THEME.classColors[2], rgb: rgbChannels(THEME.classColors[2]), isFraud: true },
  { id: 3, name: '虚假购物、服务类', short: '购物服务', color: THEME.classColors[3], rgb: rgbChannels(THEME.classColors[3]), isFraud: true },
  { id: 4, name: '冒充电商物流客服类', short: '电商客服', color: THEME.classColors[4], rgb: rgbChannels(THEME.classColors[4]), isFraud: true },
  { id: 5, name: '冒充领导、熟人类', short: '领导熟人', color: THEME.classColors[5], rgb: rgbChannels(THEME.classColors[5]), isFraud: true },
  { id: 6, name: '冒充公检法及政府机关类', short: '公检法', color: THEME.classColors[6], rgb: rgbChannels(THEME.classColors[6]), isFraud: true },
  { id: 7, name: '网络婚恋、交友类', short: '婚恋交友', color: THEME.classColors[7], rgb: rgbChannels(THEME.classColors[7]), isFraud: true },
  { id: 8, name: '网黑案件', short: '网黑', color: THEME.classColors[8], rgb: rgbChannels(THEME.classColors[8]), isFraud: true },
  { id: 9, name: '冒充军警购物类诈骗', short: '军警购物', color: THEME.classColors[9], rgb: rgbChannels(THEME.classColors[9]), isFraud: true },
];

export function classMeta(id: number): ClassMeta {
  return CLASS_META[id] ?? CLASS_META[0];
}

export function classShort(id: number): string {
  return classMeta(id).short;
}

export interface SceneMeta {
  id: string;
  label: string;
  title: string;
}

export const SCENES: SceneMeta[] = [
  { id: 'p', label: '检测', title: '在线检测台' },
  { id: 's0', label: '开场', title: '一条短信被分拣' },
  { id: 's1', label: '数据', title: '35 万条，10 类' },
  { id: 's2', label: '流程', title: '从文本到 10 个概率' },
  { id: 's3', label: '问题一', title: '是不是诈骗，是哪一类' },
  { id: 's4', label: '问题二', title: '分数可信吗' },
  { id: 's5', label: '问题三', title: '换个场景还管用吗' },
  { id: 's6', label: '分拣赛', title: '一张牌，分进 n 堆' },
  { id: 's7', label: '样例复盘', title: '一条样例的完整判定' },
  { id: 's8', label: '错误分析', title: '模型错在哪' },
  { id: 's9', label: '结论', title: '可用性矩阵' },
];

export const CONFIG = {
  navHeight: 56,
  classCount: 10,
  /** 每类 F1 的强 / 中 / 弱分档（v2 4.2） */
  f1Bands: { strong: 0.8, medium: 0.65 },
  /** S3 两种读法的落差阈值 */
  gapThreshold: 0.15,
  /** 分拣赛 */
  race: {
    defaultDeck: 100,
    flightMs: 180,
    flipMs: 120,
    burstThreshold: 0.5,
    burstIntervalMs: 8,
  },
  /** 检测台 */
  playground: {
    maxChars: 2000,
    shortText: 8,
    slowHintMs: 1500,
    timeoutMs: 8000,
    maxTopK: 10,
  },
  /** 点阵：每点代表多少条 */
  pointsPerDot: 50,
};

/** 错误标签（cases.errors[].tag） */
export const TAG_LABEL: Record<string, string> = {
  strong_correct: '强类判对',
  class_overlap: '相近类混淆',
  weak_class: '弱类漏判',
  benign_fp: '正常误报',
};

export function tagLabel(tag: string): string {
  return TAG_LABEL[tag] ?? tag;
}

/** S3 结论文案：落差阈值只在这里定义 */
export function gapConclusion(gap: number): string {
  return gap >= CONFIG.gapThreshold
    ? '判是否诈骗容易，判哪一类明显更难。'
    : '两种读法差距不大。';
}

/** 可用性矩阵（结论由项目组依据评估结果给出，数字读数据） */
export interface UsabilityRow {
  scene: string;
  verdict: 'usable' | 'verify' | 'unusable';
  basis: string;
}

export const USABILITY: UsabilityRow[] = [
  { scene: '案件分流 / 工单派单', verdict: 'usable', basis: '准确率 {accuracy}，top-2 {top2}' },
  { scene: '数据预标注', verdict: 'usable', basis: '人工只需改错的部分' },
  { scene: '强类直接出标签', verdict: 'usable', basis: 'F1 {strongRange}' },
  { scene: '弱类对外提示', verdict: 'unusable', basis: 'F1 {weakRange}' },
  { scene: '自动判定是否诈骗', verdict: 'verify', basis: '{fraudF1} 是同分布指标，域外误报 {fpRate}' },
  { scene: '跨域（招聘审核）', verdict: 'unusable', basis: '区分度 {gap} 个百分点' },
];

export const VERDICT_LABEL: Record<UsabilityRow['verdict'], string> = {
  usable: '可用',
  verify: '需先验证',
  unusable: '不可用',
};

export const LIMITATIONS: string[] = [
  '语料为合成 / 半合成，话术比真实报案笔录规整，真实场景指标会下降。',
  '类别边界存在重叠（婚恋 / 购物 / 电商客服），互斥分类强行二选一。',
  '没有真实的外部验证集，上线前需要抽 300 至 500 条真实样本做外部测试。',
  '概率饱和，只能区分“明显正常”和“其他”。',
];

/** 页脚团队与分工，替换真实项目成员时改这里 */
export const TEAM: { name: string; role: string }[] = [
  { name: '陈果', role: '脚手架 / 令牌 / 数据契约 / S1·S4·S5·S9' },
  { name: '张帅帅', role: '检测台 / S3 / S7' },
  { name: '模型岗位', role: '导出脚本 / 评估产物 / API' },
  { name: '组长', role: '范围与口径确认' },
];

export const DATA_SOURCE_NOTE = 'CCF23-EVAL 任务 6 衍生的合成 / 半合成中文电诈语料';

export const CORPUS_FOOTNOTE = '语料为合成 / 半合成电诈样本，结论适用于该语料域。';

/** 检测台示例（全部为人工编写的虚构文本，不含号码与链接） */
export interface PlaygroundSample {
  id: string;
  label: string;
  text: string;
  outOfDomain?: boolean;
}

export const PLAYGROUND_SAMPLES: PlaygroundSample[] = [
  {
    id: 'express',
    label: '快递理赔',
    text: '您好，您的快递在运输途中丢失，请添加客服微信办理理赔，理赔前需要先缴纳一笔保证金，稍后会原路退回。',
  },
  {
    id: 'invest',
    label: '投资带单',
    text: '老师带你做短线，内部平台收益稳定，今天跟上明天就能翻倍，名额有限，先充值再进群。',
  },
  {
    id: 'police',
    label: '冒充公检法',
    text: '这里是公安机关，你的账户涉嫌洗钱，请配合调查，把资金转入安全账户接受审查，不要告诉任何人。',
  },
  {
    id: 'brush',
    label: '刷单返利',
    text: '在家就能做，拍下商品截图返佣金，先垫付小额试单，完成三单后本金和佣金一起结算。',
  },
  {
    id: 'boss',
    label: '冒充领导',
    text: '小王，我是李总，现在在开会不方便接电话，你先帮我给合作方转一笔款，回头我签完字就还你。',
  },
  {
    id: 'benign',
    label: '正常通知',
    text: '各位同事，明天上午十点在三楼会议室召开月度例会，请大家提前准备本周工作进展，准时参加。',
  },
  {
    id: 'job',
    label: '招聘帖（域外）',
    text: '普工招聘，包吃住，月薪面议，工作地点在工业园区，有意者请携带身份证到厂区门口登记面试。',
    outOfDomain: true,
  },
];
