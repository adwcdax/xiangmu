import type { MetaData } from './types';

export function initWatermark(meta: MetaData, force = false): void {
  const layer = document.getElementById('watermark');
  const toggle = document.getElementById('toggle-watermark') as HTMLButtonElement | null;
  if (!layer) return;

  if (meta.data_mode !== 'mock' && !force) {
    layer.remove();
    if (toggle) toggle.hidden = true;
    return;
  }

  layer.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'watermark-grid';
  for (let row = 0; row < 6; row++) {
    const line = document.createElement('div');
    line.className = 'watermark-line';
    for (let col = 0; col < 4; col++) {
      const span = document.createElement('span');
      span.textContent = '样例数据 · 非真实结果';
      line.appendChild(span);
    }
    grid.appendChild(line);
  }
  layer.appendChild(grid);

  if (toggle) {
    toggle.disabled = true;
    toggle.setAttribute('aria-pressed', 'true');
    toggle.title = '样例数据水印不可关闭';
  }
}

let toastTimer = 0;

export function toast(message: string, kind: 'info' | 'warn' = 'info', duration = 2600): void {
  const node = document.getElementById('toast');
  if (!node) return;
  node.textContent = message;
  node.className = `toast toast--${kind} is-visible`;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    node.classList.remove('is-visible');
  }, duration);
}

export function showDataBanner(message: string, kind: 'warn' | 'error' = 'warn'): void {
  const banner = document.getElementById('data-banner');
  if (!banner) return;
  banner.textContent = message;
  banner.className = `data-banner${kind === 'error' ? ' is-error' : ''}`;
  banner.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  banner.hidden = false;
}
