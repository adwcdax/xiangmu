import type { ApiError as ApiErrorType, ApiMode, PredictResponse } from '../api/types';
import { ApiError, errorMessage } from '../api/types';
import { classMeta } from '../core/config';
import { ProbBar } from '../components/ProbBar';
import { Stamp } from '../components/Stamp';

export interface ResultContext {
  mode: ApiMode;
  modelName: string;
  staleFrom?: string | null;
}

export interface ResultPanelOptions {
  onRetry: () => void;
  onSwitchMock: () => void;
  onJump: (sceneId: string) => void;
  weakIds: Set<number>;
  weakF1: Map<number, number>;
}

const ERROR_TITLES: Record<string, string> = {
  EMPTY_TEXT: '请输入内容',
  TEXT_TOO_LONG: '内容过长',
  MODEL_NOT_FOUND: '模型不可用',
  MODEL_NOT_READY: '模型加载中',
  BATCH_TOO_LARGE: '提交条数过多',
  RATE_LIMITED: '请求太频繁',
  INTERNAL: '服务异常',
  UNAVAILABLE: '服务不可用',
  NETWORK: '连接失败',
  TIMEOUT: '请求超时',
  ABORTED: '已取消',
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export class ResultPanel {
  readonly root: HTMLElement;
  private readonly options: ResultPanelOptions;
  private slowTimer = 0;
  private slowHint: HTMLElement | null = null;

  constructor(host: HTMLElement, options: ResultPanelOptions) {
    this.options = options;
    this.root = document.createElement('section');
    this.root.className = 'pg-card pg-result-card';
    this.root.setAttribute('aria-labelledby', 'pg-result-title');
    this.root.setAttribute('aria-live', 'polite');
    this.root.innerHTML = '<div class="pg-card-head"><h2 id="pg-result-title">结果</h2></div><div class="pg-result-body"></div>';
    host.appendChild(this.root);
    this.showEmpty();
  }

  private body(): HTMLElement {
    return this.root.querySelector<HTMLElement>('.pg-result-body')!;
  }

  private clearSlowTimer(): void {
    window.clearTimeout(this.slowTimer);
    this.slowHint = null;
  }

  showEmpty(): void {
    this.clearSlowTimer();
    const body = this.body();
    body.replaceChildren();
    const state = document.createElement('div');
    state.className = 'pg-state pg-empty';
    state.innerHTML = `
      <div class="pg-empty-icon" aria-hidden="true"><span></span><span></span><span></span></div>
      <p class="pg-state-title">输入内容后点击“开始检测”</p>
      <p class="pg-state-desc">结果会显示是否诈骗、具体类别和 10 类概率。</p>
    `;
    body.appendChild(state);
  }

  showLoading(): void {
    this.clearSlowTimer();
    const body = this.body();
    body.replaceChildren();
    const state = document.createElement('div');
    state.className = 'pg-state pg-loading';
    state.innerHTML = `
      <div class="pg-skeleton-stamp"></div>
      <div class="pg-skeleton-rows">
        ${Array.from({ length: 10 }, () => '<div class="pg-skeleton-row"><span></span><i></i><b></b></div>').join('')}
      </div>
      <p class="pg-slow-hint" hidden>模型响应较慢…</p>
    `;
    body.appendChild(state);
    this.slowHint = state.querySelector<HTMLElement>('.pg-slow-hint');
    this.slowTimer = window.setTimeout(() => {
      if (this.slowHint) this.slowHint.hidden = false;
    }, 1500);
  }

  showResult(response: PredictResponse, context: ResultContext): void {
    this.clearSlowTimer();
    const body = this.body();
    body.replaceChildren();

    if (context.staleFrom) {
      const stale = document.createElement('div');
      stale.className = 'pg-stale';
      stale.innerHTML = `<span>已切换到 ${escapeHtml(context.modelName)}，结果来自 ${escapeHtml(context.staleFrom)}。</span>`;
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn btn--small btn--secondary';
      retry.textContent = '用新模型重新检测';
      retry.addEventListener('click', this.options.onRetry);
      stale.appendChild(retry);
      body.appendChild(stale);
    }

    const result = document.createElement('div');
    result.className = 'pg-result';

    if (context.mode === 'mock') {
      const badge = document.createElement('span');
      badge.className = 'pg-mock-badge';
      badge.textContent = '离线演示 · 非模型输出';
      result.appendChild(badge);
    }

    const verdict = document.createElement('div');
    verdict.className = 'pg-verdict';
    const stamp = new Stamp(response.is_fraud ? 'fraud' : 'benign', response.label.id);
    verdict.appendChild(stamp.root);
    verdict.appendChild(this.buildRing(response));
    result.appendChild(verdict);

    const threshold = document.createElement('p');
    threshold.className = 'pg-threshold';
    threshold.textContent = `阈值 ${response.threshold.toFixed(2)}，p_fraud ≥ 阈值即判为诈骗`;
    result.appendChild(threshold);

    const prob = new ProbBar({
      topK: response.top_k.map((item) => ({ id: item.id, prob: item.prob })),
      weakIds: this.options.weakIds,
      weakF1: this.options.weakF1,
      animate: true,
    });
    result.appendChild(prob.root);

    const top1 = response.top_k[0]?.prob ?? 0;
    if (top1 >= 0.99) {
      const hint = document.createElement('p');
      hint.className = 'pg-inline-hint';
      hint.innerHTML = '概率高度集中是该模型的特点，不代表绝对确定，详见“分数可信吗”。';
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'link-btn';
      link.textContent = '跳到 S4';
      link.addEventListener('click', () => this.options.onJump('s4'));
      hint.appendChild(link);
      result.appendChild(hint);
    }

    const warnings = this.buildWarnings(response.warnings);
    if (warnings) result.appendChild(warnings);

    result.appendChild(this.buildMeta(response, context));
    result.appendChild(this.buildActions(response));

    body.appendChild(result);
  }

  showError(error: unknown, context: ResultContext): void {
    this.clearSlowTimer();
    const body = this.body();
    body.replaceChildren();
    const code = error instanceof ApiError ? error.code : 'INTERNAL';
    const state = document.createElement('div');
    state.className = 'pg-state pg-error';
    state.setAttribute('role', 'alert');
    state.innerHTML = `
      <div class="pg-error-icon" aria-hidden="true">!</div>
      <p class="pg-error-title">${escapeHtml(ERROR_TITLES[code] ?? '检测失败')}</p>
      <p class="pg-error-message">${escapeHtml(errorMessage(error))}</p>
    `;
    const requestId = error instanceof ApiError ? error.requestId : undefined;
    if (requestId) {
      const id = document.createElement('p');
      id.className = 'pg-error-id';
      id.textContent = `request_id ${requestId.slice(0, 8)}`;
      state.appendChild(id);
    }

    const actions = document.createElement('div');
    actions.className = 'pg-error-actions';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn btn--primary';
    retry.textContent = '重试';
    retry.addEventListener('click', this.options.onRetry);
    actions.appendChild(retry);

    const recoverable = ['UNAVAILABLE', 'INTERNAL', 'NETWORK', 'TIMEOUT'].includes(code) || context.mode === 'mock';
    if (recoverable) {
      const mock = document.createElement('button');
      mock.type = 'button';
      mock.className = 'btn btn--secondary';
      mock.textContent = '切到离线演示';
      mock.addEventListener('click', this.options.onSwitchMock);
      actions.appendChild(mock);
    }
    state.appendChild(actions);
    body.appendChild(state);
  }

  private buildRing(response: PredictResponse): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'pg-ring-wrap';
    const color = response.is_fraud ? 'var(--fraud)' : 'var(--benign)';
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - Math.min(1, Math.max(0, response.p_fraud)));
    const ring = document.createElement('div');
    ring.className = 'pg-ring';
    ring.innerHTML = `
      <svg viewBox="0 0 96 96" aria-hidden="true">
        <circle class="pg-ring-bg" cx="48" cy="48" r="${radius}"></circle>
        <circle class="pg-ring-fill" cx="48" cy="48" r="${radius}"
          stroke="${color}" stroke-dasharray="${circumference.toFixed(2)}"
          stroke-dashoffset="${circumference.toFixed(2)}" data-offset="${offset.toFixed(2)}"></circle>
      </svg>
      <span class="pg-ring-value">${pct(response.p_fraud)}</span>
    `;
    const fill = ring.querySelector<SVGCircleElement>('.pg-ring-fill');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => fill?.setAttribute('stroke-dashoffset', offset.toFixed(2)));
    });
    const label = document.createElement('span');
    label.className = 'pg-ring-label';
    label.textContent = '诈骗概率（1 − 无风险概率）';
    wrap.append(ring, label);
    return wrap;
  }

  private buildWarnings(warnings: string[]): HTMLElement | null {
    if (!warnings.length) return null;
    const host = document.createElement('div');
    host.className = 'pg-warnings';
    warnings.forEach((code) => {
      const item = document.createElement('div');
      item.className = 'pg-warning';
      if (code === 'OUT_OF_DOMAIN_HINT') {
        item.innerHTML = '<span>这段文字不像短信或对话，可能超出模型适用范围。</span>';
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'link-btn';
        link.textContent = '看看域外检验 →';
        link.addEventListener('click', () => this.options.onJump('s5'));
        item.appendChild(link);
      } else if (code === 'TOO_SHORT') {
        item.textContent = '内容较短，结果可能不稳定。';
      } else {
        item.textContent = code;
      }
      host.appendChild(item);
    });
    return host;
  }

  private buildMeta(response: PredictResponse, context: ResultContext): HTMLElement {
    const meta = document.createElement('div');
    meta.className = 'pg-meta';
    const latency =
      context.mode === 'mock' || response.latency_source === 'mock'
        ? `模拟 ${response.latency_ms.toFixed(1)} ms`
        : response.latency_source === 'roundtrip'
          ? `往返 ${response.latency_ms} ms（含网络）`
          : `服务端 ${response.latency_ms.toFixed(1)} ms · 往返 ${response.roundtrip_ms ?? '—'} ms`;
    const id = response.request_id.slice(0, 8);
    meta.innerHTML = `
      <span>模型 ${escapeHtml(context.modelName)}</span>
      <span>${escapeHtml(latency)}</span>
      <span>${response.chars} 字</span>
      <span>request_id <button type="button" class="link-btn" title="复制完整 request_id">${escapeHtml(id)}</button></span>
    `;
    meta.querySelector('button')?.addEventListener('click', () => {
      void copyText(response.request_id);
    });
    return meta;
  }

  private buildActions(response: PredictResponse): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'pg-result-actions';

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'btn btn--small btn--secondary';
    copy.textContent = '复制结果';
    copy.addEventListener('click', () => {
      const top3 = response.top_k
        .slice(0, 3)
        .map((item) => `${classMeta(item.id).short} ${pct(item.prob)}`)
        .join('、');
      const text = `${response.is_fraud ? '疑似诈骗' : '未发现风险'} · ${response.label.name} · p_fraud ${pct(
        response.p_fraud,
      )}${top3 ? ` · top-3：${top3}` : ''}`;
      void copyText(text).then(() => {
        copy.textContent = '已复制';
        window.setTimeout(() => {
          copy.textContent = '复制结果';
        }, 1600);
      });
    });
    actions.appendChild(copy);

    const details = document.createElement('details');
    details.className = 'pg-raw';
    const summary = document.createElement('summary');
    summary.textContent = '查看原始 JSON';
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(response, null, 2);
    details.append(summary, pre);
    actions.appendChild(details);
    return actions;
  }
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

export type { ApiErrorType };
