import { ApiError, type ErrorCode } from './types';

const ENV = import.meta.env;

const API_BASE = String(ENV.VITE_API_BASE ?? '').replace(/\/+$/, '');
const API_QUERY = String(ENV.VITE_API_QUERY ?? '').replace(/^\?/, '');
const TIMEOUT_MS = Number(ENV.VITE_API_TIMEOUT_MS ?? 8000) || 8000;

export const apiConfig = {
  base: API_BASE,
  hasQuery: API_QUERY.length > 0,
  timeoutMs: TIMEOUT_MS,
};

export interface RequestResult<T> {
  data: T;
  roundTripMs: number;
}

function buildUrl(path: string): string {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  if (!API_QUERY) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${API_QUERY}`;
}

function codeFromStatus(status: number): ErrorCode {
  if (status === 404) return 'MODEL_NOT_FOUND';
  if (status === 409) return 'MODEL_NOT_READY';
  if (status === 413) return 'BATCH_TOO_LARGE';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 503) return 'UNAVAILABLE';
  return 'INTERNAL';
}

async function parseError(res: Response): Promise<ApiError> {
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
  const error = body && body.error && typeof body.error === 'object' ? (body.error as Record<string, unknown>) : null;
  const code = (error?.code as ErrorCode | undefined) ?? codeFromStatus(res.status);
  const message = typeof error?.message === 'string' ? error.message : undefined;
  const requestId = typeof body?.request_id === 'string' ? body.request_id : undefined;
  const retryAfter = Number(res.headers.get('Retry-After') ?? '') || undefined;
  return new ApiError(code, {
    status: res.status,
    detail: error?.detail,
    requestId,
    retryAfter,
    message,
  });
}

/** 所有请求的唯一入口：拼接地址、超时、错误码、往返耗时。 */
export async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  signal?: AbortSignal,
  timeoutMs = TIMEOUT_MS,
): Promise<RequestResult<T>> {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = (): void => controller.abort();
  if (signal) {
    if (signal.aborted) throw new ApiError('ABORTED');
    signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const started = performance.now();
  try {
    const res = await fetch(buildUrl(path), {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
        ...(init.headers ?? {}),
      },
    });
    const roundTripMs = Math.round(performance.now() - started);
    if (!res.ok) throw await parseError(res);
    const data = (await res.json()) as T;
    return { data, roundTripMs };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (signal?.aborted) throw new ApiError('ABORTED');
    if (timedOut) throw new ApiError('TIMEOUT');
    throw new ApiError('NETWORK', { message: '无法连接到服务' });
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** 探测用短超时请求：不抛业务错误，只返回是否可用。 */
export async function probe(path: string, timeoutMs = 2500): Promise<boolean> {
  try {
    await requestJson(path, { method: 'GET' }, undefined, timeoutMs);
    return true;
  } catch {
    return false;
  }
}
