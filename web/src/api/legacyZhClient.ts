import { CLASS_META, classMeta } from '../core/config';
import { requestJson } from './request';
import { ApiError } from './types';
import type {
  ApiClient,
  HealthInfo,
  LabelInfo,
  ModelList,
  PredictRequest,
  PredictResponse,
  TopKItem,
} from './types';

interface LegacyHealth {
  status?: string;
  model?: string;
  version?: string;
  uptime_s?: number;
  request_id?: string;
}

interface LegacyTopK {
  id?: number;
  label?: string;
  name?: string;
  prob?: number;
  score?: number;
}

interface LegacyPredict {
  label?: string | { id?: number; name?: string };
  label_id?: number;
  p_fraud?: number;
  is_fraud?: boolean;
  threshold?: number;
  top_k?: LegacyTopK[];
  latency_ms?: number;
  chars?: number;
  truncated?: boolean;
  warnings?: string[];
  request_id?: string;
  error?: string;
}

function idFromName(name: string | undefined): number {
  if (!name) return 0;
  const hit = CLASS_META.find((item) => item.name === name || item.short === name);
  return hit ? hit.id : 0;
}

function labelInfo(id: number): { id: number; name: string; short: string } {
  const meta = classMeta(id);
  return { id: meta.id, name: meta.name, short: meta.short };
}

function normalizeTopK(items: LegacyTopK[] | undefined, fallbackId: number, pFraud: number): TopKItem[] {
  const mapped = (items ?? []).map((item) => {
    const id = typeof item.id === 'number' ? item.id : idFromName(item.label ?? item.name);
    return { id, name: classMeta(id).name, prob: Number(item.prob ?? item.score ?? 0) };
  });
  if (mapped.length === 0) {
    return [{ id: fallbackId, name: classMeta(fallbackId).name, prob: 1 }];
  }
  // 兼容只返回 label 的旧服务：至少保证第一名与 label 一致。
  if (!mapped.some((item) => item.id === fallbackId)) {
    mapped.unshift({ id: fallbackId, name: classMeta(fallbackId).name, prob: Math.max(0, pFraud) });
  }
  return mapped.sort((a, b) => b.prob - a.prob);
}

/** 现有 api_zh 返回中文提示；短文本提示映射成 UI 的统一文案。 */
function normalizeWarnings(warnings: string[] | undefined): string[] {
  return (warnings ?? []).map((warning) =>
    warning.includes('文本较短') ? 'TOO_SHORT' : warning,
  );
}

export function createLegacyZhClient(): ApiClient {
  let cachedModel = 'fasttext_zh';

  return {
    mode: 'legacy',
    async health(): Promise<HealthInfo> {
      const { data } = await requestJson<LegacyHealth>('/health');
      cachedModel = data.model ?? cachedModel;
      const status = data.status === 'degraded' || data.status === 'down' ? data.status : 'ok';
      return {
        status,
        version: data.version ?? 'legacy',
        uptime_s: data.uptime_s ?? 0,
        default_model: cachedModel,
        request_id: data.request_id ?? `legacy-${Date.now().toString(36)}`,
      };
    },
    async models(): Promise<ModelList> {
      // 同一套 legacy 契约后面可能是 fastText 或随机森林，按 /health 返回的模型名区分。
      const isForest = /rf|forest|xgb/i.test(cachedModel);
      return {
        default: cachedModel,
        models: [
          {
            id: cachedModel,
            name: isForest ? '随机森林（兼容模式）' : 'fastText（兼容模式）',
            description: isForest
              ? '对接现有 randomforest/api.py，10 类多分类'
              : '对接现有 api_zh 服务，10 类多分类',
            task: 'multiclass',
            status: 'ready',
            classes: 10,
            threshold: 0.5,
            max_chars: 2000,
            latency_hint_ms: 2,
            metrics: isForest
              ? { macro_f1: 0.7076, fraud_f1: 0.979 }
              : { macro_f1: 0.7365, fraud_f1: 0.9833 },
            domain: '中文电诈短信 / 对话 / 案情描述',
          },
        ],
        request_id: `legacy-${Date.now().toString(36)}`,
      };
    },
    async labels(): Promise<LabelInfo[]> {
      try {
        const { data } = await requestJson<{ labels?: Array<{ id?: number; name?: string; short?: string; is_fraud?: boolean }> }>(
          '/labels',
        );
        const labels = data.labels ?? [];
        if (labels.length === 0) throw new Error('empty');
        return labels.map((item, index) => {
          const id = typeof item.id === 'number' ? item.id : idFromName(item.name);
          const meta = classMeta(id);
          return {
            id,
            name: item.name ?? meta.name,
            short: item.short ?? meta.short,
            is_fraud: item.is_fraud ?? meta.isFraud,
          };
        });
      } catch {
        return CLASS_META.map((meta) => ({
          id: meta.id,
          name: meta.name,
          short: meta.short,
          is_fraud: meta.isFraud,
        }));
      }
    },
    async predict(req: PredictRequest, signal?: AbortSignal): Promise<PredictResponse> {
      const { data, roundTripMs } = await requestJson<LegacyPredict>(
        '/predict',
        {
          method: 'POST',
          body: JSON.stringify({ text: req.text, top_k: req.top_k ?? 10 }),
        },
        signal,
      );
      if (data.error) {
        throw new ApiError('INTERNAL', { message: data.error });
      }
      const labelName = typeof data.label === 'string' ? data.label : data.label?.name;
      const labelId =
        typeof data.label_id === 'number'
          ? data.label_id
          : typeof data.label === 'object' && typeof data.label?.id === 'number'
            ? data.label.id
            : idFromName(labelName);
      const pFraud = Math.min(1, Math.max(0, Number(data.p_fraud ?? (labelId === 0 ? 0.01 : 0.99))));
      const threshold = Number(data.threshold ?? 0.5);
      const hasServerLatency = typeof data.latency_ms === 'number';
      return {
        model: cachedModel,
        label: labelInfo(labelId),
        is_fraud: data.is_fraud ?? pFraud >= threshold,
        p_fraud: pFraud,
        threshold,
        top_k: normalizeTopK(data.top_k, labelId, pFraud),
        tokens: null,
        latency_ms: hasServerLatency ? Number(data.latency_ms) : roundTripMs,
        chars: data.chars ?? req.text.length,
        truncated: data.truncated ?? false,
        warnings: normalizeWarnings(data.warnings),
        request_id: data.request_id ?? `legacy-${Date.now().toString(36)}`,
        roundtrip_ms: roundTripMs,
        latency_source: hasServerLatency ? 'server' : 'roundtrip',
      };
    },
  };
}
