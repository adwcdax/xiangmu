let node: HTMLElement | null = null;
let hideTimer = 0;

function ensure(): HTMLElement {
  if (!node) {
    node = document.createElement('div');
    node.className = 'tooltip';
    node.setAttribute('role', 'tooltip');
    document.body.appendChild(node);
  }
  return node;
}

export function showTooltip(html: string, x: number, y: number, opts: { delay?: number; maxWidth?: number } = {}): void {
  const el = ensure();
  window.clearTimeout(hideTimer);
  const show = () => {
    el.innerHTML = html;
    el.style.maxWidth = `${opts.maxWidth ?? 280}px`;
    el.classList.add('is-visible');
    const rect = el.getBoundingClientRect();
    let left = x + 14;
    let top = y + 14;
    if (left + rect.width > window.innerWidth - 12) left = x - rect.width - 14;
    if (top + rect.height > window.innerHeight - 12) top = y - rect.height - 14;
    el.style.left = `${Math.max(12, left)}px`;
    el.style.top = `${Math.max(12, top)}px`;
  };
  if (opts.delay) {
    window.setTimeout(show, opts.delay);
  } else {
    show();
  }
}

export function hideTooltip(): void {
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    node?.classList.remove('is-visible');
  }, 60);
}

export function tooltipRow(label: string, value: string): string {
  return `<div class="tooltip-row"><span>${label}</span><b>${value}</b></div>`;
}

export function tooltipTitle(title: string, sub?: string): string {
  return `<div class="tooltip-title">${title}${sub ? `<span>${sub}</span>` : ''}</div>`;
}
