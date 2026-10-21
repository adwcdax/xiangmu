/** 检测台接口类型（与《实施计划 v2》3.8 节一致）。 */

export type ApiMode = 'v1' | 'legacy' | 'mock';
export type ServiceStatus = 'ok' | 'degraded' | 'down';
export type ModelReadyStatus = 'ready' | 'loading' | 'unavailable';
export type ModalityInput = 'auto' | 'sms' | 'dialog';

export type ErrorCode =
  | 'EMPTY_TEXT'
  | 'TEXT_TOO_LONG'
  | 'MODEL_NOT_FOUND'
  | 'MODEL_NOT_READY'
  | 'BATCH_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | 'UNAVAILABLE'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'ABORTED';

export interface HealthInfo {
  status: ServiceStatus;
  version: string;
  uptime_s: number;
  default_model: string;
  request_id: string;
}

export interface ModelMetrics {
  macro_f1: number;
  fraud_f1: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  task: 'multiclass' | 'binary';
  status: ModelReadyStatus;
  classes: number;
  threshold: number;
  max_chars: number;
  latency_hint_ms: number;
  metrics: ModelMetrics | null;
  domain: string;
}

export interface ModelList {
  default: string;
  models: ModelInfo[];
  request_id: string;
}

export interface LabelInfo {
  id: number;
  name: string;
  short: string;
  is_fraud: boolean;
}

export interface PredictRequest {
  model?: string;
  text: string;
  modality?: ModalityInput;
  top_k?: number;
  threshold?: number | null;
  return_tokens?: boolean;
}

export interface TopKItem {
  id: number;
  name: string;
  prob: number;
}

export interface PredictResponse {
  model: string;
  label: { id: number; name: string; short: string };
  is_fraud: boolean;
  p_fraud: number;
  threshold: number;
  top_k: TopKItem[];
  tokens: unknown | null;
  latency_ms: number;
  chars: number;
  truncated: boolean;
  warnings: string[];
  request_id: string;
  /** 前端补充：往返耗时；legacy 模式没有服务端耗时时用它代替 */
  roundtrip_ms?: number;
  /** 前端补充：latency_ms 的来源 */
  latency_source?: 'server' | 'roundtrip' | 'mock';
}

export interface ApiClient {
  mode: ApiMode;
  health(): Promise<HealthInfo>;
  models(): Promise<ModelList>;
  labels(): Promise<LabelInfo[]>;
  predict(req: PredictRequest, signal?: AbortSignal): Promise<PredictResponse>;
}

const MESSAGES: Record<ErrorCode, string> = {
  EMPTY_TEXT: '请输入要检测的内容',
  TEXT_TOO_LONG: '内容过长',
  MODEL_NOT_FOUND: '模型不可用，已切换回默认模型',
  MODEL_NOT_READY: '模型加载中，请稍候',
  BATCH_TOO_LARGE: '单次提交的条数过多',
  RATE_LIMITED: '请求太频繁，请稍后再试',
  INTERNAL: '服务暂不可用',
  UNAVAILABLE: '服务暂不可用',
  NETWORK: '无法连接到服务',
  TIMEOUT: '请求超时',
  ABORTED: '已取消本次检测',
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly detail?: unknown;
  readonly requestId?: string;
  readonly retryAfter?: number;

  constructor(
    code: ErrorCode,
    options: { status?: number; detail?: unknown; requestId?: string; retryAfter?: number; message?: string } = {},
  ) {
    super(options.message ?? MESSAGES[code]);
    this.name = 'ApiError';
    this.code = code;
    this.status = options.status ?? 0;
    this.detail = options.detail;
    this.requestId = options.requestId;
    this.retryAfter = options.retryAfter;
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'TEXT_TOO_LONG' && error.detail && typeof error.detail === 'object') {
      const max = (error.detail as { max_chars?: number }).max_chars;
      if (max) return `内容过长，最多 ${max} 字`;
    }
    if (error.code === 'RATE_LIMITED' && error.retryAfter) {
      return `请求太频繁，${error.retryAfter} 秒后再试`;
    }
    if (error.code === 'BATCH_TOO_LARGE' && error.detail && typeof error.detail === 'object') {
      const max = (error.detail as { max_batch?: number }).max_batch;
      if (max) return `单次最多 ${max} 条`;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
