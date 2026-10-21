import { CLASS_META, CONFIG, classMeta } from '../core/config';
import { ApiError, type ApiClient, type ErrorCode, type HealthInfo, type LabelInfo, type ModelList, type PredictRequest, type PredictResponse, type TopKItem } from './types';

/** 关键词表只用于让离线演示看起来合理，不代表模型能力。 */
const KEYWORDS: Record<number, string[]> = {
  1: ['投资', '理财', '收益', '带单', '翻倍', '平台', '充值', '稳赚', '内幕', '股票', '返利'],
  2: ['信用', '额度', '贷款', '放款', '手续费', '抵押', '征信', '提额', '到账'],
  3: ['会员', '礼品', '运费', '秒杀', '退款', '商品', '促销', '定金', '折扣', '领取', '刷单', '佣金', '试单'],
  4: ['快递', '包裹', '理赔', '客服', '物流', '保证金', '订单', '丢失', '破损', '驿站'],
  5: ['领导', '办公室', '合作方', '开会', '别告诉', '借款', '急用', '我是李总', '我是王总'],
  6: ['公安', '洗钱', '安全账户', '涉嫌', '调查', '逮捕', '法院', '通缉', '资金审查', '办案'],
  7: ['婚恋', '交友', '相亲', '恋爱', '对象', '见面', '感情', '平台认识', '带你'],
  8: ['银行卡', '走账', '抽成', '借卡', '过账', '收一笔', '账户', '好处费', '刷流水'],
  9: ['部队', '军警', '采购', '垫付', '帐篷', '物资', '结算', '供应商', '统一采购'],
};

const JOB_HINTS = ['招聘', '岗位', '月薪', '普工', '面试', '包吃住', '入职', '社保', '职位'];
const BENIGN_HINTS = ['通知', '会议', '提醒', '义诊', '例会', '同事', '居民', '活动'];

const ERROR_CODES: ErrorCode[] = [
  'EMPTY_TEXT',
  'TEXT_TOO_LONG',
  'MODEL_NOT_FOUND',
  'MODEL_NOT_READY',
  'BATCH_TOO_LARGE',
  'RATE_LIMITED',
  'INTERNAL',
  'UNAVAILABLE',
];

let injectedErrorConsumed = false;

function param(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError('ABORTED'));
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      window.clearTimeout(timer);
      reject(new ApiError('ABORTED'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function softmax(scores: number[], temperature = 0.5): number[] {
  const max = Math.max(...scores);
  const exps = scores.map((score) => Math.exp((score - max) / temperature));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((value) => value / sum);
}

function scoreText(text: string): { probs: number[]; job: boolean; short: boolean } {
  const scores = Array(10).fill(0) as number[];
  scores[0] = 1.5;
  BENIGN_HINTS.forEach((word) => {
    if (text.includes(word)) scores[0] += 0.35;
  });
  for (const [id, words] of Object.entries(KEYWORDS)) {
    const hits = words.filter((word) => text.includes(word)).length;
    if (hits > 0) scores[Number(id)] += hits * 1.2;
  }
  const job = JOB_HINTS.filter((word) => text.includes(word)).length >= 2;
  // 域外招聘帖：让演示结果落在“正常文本也被判诈骗”的叙事上。
  if (job) scores[1] += 3.2;
  const probs = softmax(scores, 0.85);
  return { probs, job, short: text.replace(/\s+/g, '').length < CONFIG.playground.shortText };
}

function requestId(): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(16).slice(2, 10);
  return `mock-${suffix}`;
}

function maybeInjectError(text: string): void {
  if (injectedErrorConsumed) return;
  const raw = param('mockError');
  if (!raw) return;
  const code = raw.toUpperCase() as ErrorCode;
  if (!ERROR_CODES.includes(code)) return;
  injectedErrorConsumed = true;
  if (code === 'TEXT_TOO_LONG') {
    throw new ApiError('TEXT_TOO_LONG', { detail: { max_chars: CONFIG.playground.maxChars } });
  }
  if (code === 'RATE_LIMITED') {
    throw new ApiError('RATE_LIMITED', { retryAfter: 3 });
  }
  if (code === 'BATCH_TOO_LARGE') {
    throw new ApiError('BATCH_TOO_LARGE', { detail: { max_batch: 500 } });
  }
  throw new ApiError(code);
}

export function createMockClient(): ApiClient {
  return {
    mode: 'mock',
    async health(): Promise<HealthInfo> {
      return {
        status: 'ok',
        version: 'mock-1.0',
        uptime_s: 0,
        default_model: 'fasttext_zh',
        request_id: requestId(),
      };
    },
    async models(): Promise<ModelList> {
      return {
        default: 'fasttext_zh',
        models: [
          {
            id: 'fasttext_zh',
            name: 'fastText（逐字 + 2-gram）',
            description: '10 类多分类，单条毫秒级',
            task: 'multiclass',
            status: 'ready',
            classes: 10,
            threshold: 0.5,
            max_chars: CONFIG.playground.maxChars,
            latency_hint_ms: 2,
            metrics: { macro_f1: 0.7365, fraud_f1: 0.9833 },
            domain: '中文电诈短信 / 对话 / 案情描述',
          },
          {
            id: 'bert_zh',
            name: '中文 BERT（预留）',
            description: '尚未训练',
            task: 'multiclass',
            status: 'unavailable',
            classes: 10,
            threshold: 0.5,
            max_chars: 512,
            latency_hint_ms: 80,
            metrics: null,
            domain: '同上',
          },
          {
            id: 'llm_zh',
            name: '大模型（预留）',
            description: '接口联调中',
            task: 'multiclass',
            status: 'loading',
            classes: 10,
            threshold: 0.5,
            max_chars: CONFIG.playground.maxChars,
            latency_hint_ms: 1400,
            metrics: null,
            domain: '同上',
          },
        ],
        request_id: requestId(),
      };
    },
    async labels(): Promise<LabelInfo[]> {
      return CLASS_META.map((meta) => ({
        id: meta.id,
        name: meta.name,
        short: meta.short,
        is_fraud: meta.isFraud,
      }));
    },
    async predict(req: PredictRequest, signal?: AbortSignal): Promise<PredictResponse> {
      const text = req.text.trim();
      if (!text) throw new ApiError('EMPTY_TEXT');
      if (text.length > CONFIG.playground.maxChars) {
        throw new ApiError('TEXT_TOO_LONG', { detail: { max_chars: CONFIG.playground.maxChars } });
      }
      maybeInjectError(text);

      const forcedLatency = Number(param('mockLatency') ?? '');
      const wait = Number.isFinite(forcedLatency) && forcedLatency > 0 ? forcedLatency : 80 + Math.random() * 220;
      await delay(wait, signal);

      const { probs, job, short } = scoreText(text);
      const ranked = probs
        .map((prob, id) => ({ id, prob }))
        .sort((a, b) => b.prob - a.prob)
        .slice(0, req.top_k ?? 10);
      const topK: TopKItem[] = ranked.map((item) => ({
        id: item.id,
        name: classMeta(item.id).name,
        prob: Number(item.prob.toFixed(4)),
      }));
      const best = topK[0];
      const pFraud = Number((1 - probs[0]).toFixed(4));
      const threshold = req.threshold ?? 0.5;
      const warnings: string[] = [];
      if (short) warnings.push('TOO_SHORT');
      if (job) warnings.push('OUT_OF_DOMAIN_HINT');
      const latency = Number((1.2 + Math.random() * 1.2).toFixed(1));

      return {
        model: req.model ?? 'fasttext_zh',
        label: { id: best.id, name: classMeta(best.id).name, short: classMeta(best.id).short },
        is_fraud: pFraud >= threshold,
        p_fraud: pFraud,
        threshold,
        top_k: topK,
        tokens: null,
        latency_ms: latency,
        chars: text.length,
        truncated: false,
        warnings,
        request_id: requestId(),
        roundtrip_ms: Math.round(wait + latency),
        latency_source: 'mock',
      };
    },
  };
}
