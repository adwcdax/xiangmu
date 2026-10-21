import { apiConfig } from '../api/request';
import type { ApiMode } from '../api/types';

export type PillState = 'probing' | 'v1' | 'legacy' | 'degraded' | 'mock';

export interface PillInfo {
  version?: string;
  model?: string;
  probeError?: string;
}

const LABELS: Record<PillState, string> = {
  probing: '连接中',
  v1: '已连接 · v1',
  legacy: '已连接 · 兼容模式',
  degraded: '服务降级',
  mock: '离线演示',
};

function addressText(): string {
  if (!apiConfig.base) return '同源 · /api/v1';
  try {
    const url = new URL(apiConfig.base);
    return `${url.host}${url.pathname}`;
  } catch {
    return apiConfig.base.replace(/\?.*$/, '');
  }
}

export class StatusPill {
  readonly root: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private state: PillState = 'probing';
  private info: PillInfo = {};
  private lastCheck: Date | null = null;
  private readonly onReconnect: () => void;
  private readonly onToggleMock: () => void;

  constructor(host: HTMLElement, callbacks: { onReconnect: () => void; onToggleMock: () => void }) {
    this.onReconnect = callbacks.onReconnect;
    this.onToggleMock = callbacks.onToggleMock;

    this.root = document.createElement('div');
    this.root.className = 'status-pill';
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'status-pill-button';
    this.button.setAttribute('aria-expanded', 'false');
    this.button.setAttribute('aria-controls', 'status-panel');
    this.button.innerHTML = '<span class="status-dot" aria-hidden="true"></span><span class="status-text">连接中</span>';

    this.panel = document.createElement('div');
    this.panel.className = 'status-panel';
    this.panel.id = 'status-panel';
    this.panel.hidden = true;

    this.root.append(this.button, this.panel);
    host.appendChild(this.root);

    this.button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggle();
    });
    document.addEventListener('click', (event) => {
      if (!this.root.contains(event.target as Node)) this.close();
    });
  }

  setState(state: PillState, info: PillInfo = {}): void {
    this.state = state;
    this.info = { ...this.info, ...info };
    this.lastCheck = new Date();
    this.button.dataset.state = state;
    const text = this.button.querySelector<HTMLElement>('.status-text');
    if (text) text.textContent = LABELS[state];
    this.button.setAttribute('aria-label', `服务状态：${LABELS[state]}，点击查看详情`);
    this.renderPanel();
  }

  setMode(mode: ApiMode): void {
    if (mode === 'v1') this.setState('v1');
    else if (mode === 'legacy') this.setState('legacy');
    else this.setState('mock');
  }

  get current(): PillState {
    return this.state;
  }

  private toggle(): void {
    if (this.panel.hidden) this.open();
    else this.close();
  }

  private open(): void {
    this.renderPanel();
    this.panel.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
  }

  private close(): void {
    this.panel.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
  }

  private renderPanel(): void {
    const modeText =
      this.state === 'v1' ? 'v1 接口' : this.state === 'legacy' ? '兼容模式（legacy）' : this.state === 'mock' ? '离线演示（mock）' : '探测中';
    const check = this.lastCheck
      ? this.lastCheck.toLocaleTimeString('zh-CN', { hour12: false })
      : '—';
    this.panel.innerHTML = `
      <div class="status-panel-row"><span>接口地址</span><b>${addressText()}</b></div>
      <div class="status-panel-row"><span>当前模式</span><b>${modeText}</b></div>
      <div class="status-panel-row"><span>版本</span><b>${this.info.version ?? '—'}</b></div>
      <div class="status-panel-row"><span>默认模型</span><b>${this.info.model ?? '—'}</b></div>
      <div class="status-panel-row"><span>最近检查</span><b>${check}</b></div>
      ${this.info.probeError ? `<p class="status-panel-note">${this.info.probeError}</p>` : ''}
      <div class="status-panel-actions">
        <button type="button" class="btn btn--secondary" data-action="reconnect">重新连接</button>
        <button type="button" class="btn btn--ghost" data-action="mock">${this.state === 'mock' ? '切回在线' : '切到离线演示'}</button>
      </div>
    `;
    this.panel.querySelector<HTMLButtonElement>('[data-action="reconnect"]')?.addEventListener('click', () => {
      this.close();
      this.onReconnect();
    });
    this.panel.querySelector<HTMLButtonElement>('[data-action="mock"]')?.addEventListener('click', () => {
      this.close();
      this.onToggleMock();
    });
  }
}
