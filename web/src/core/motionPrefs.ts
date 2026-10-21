import { prefersReducedMotion } from './utils';

const KEY = 'fraud-demo.motion';

export function motionEnabled(): boolean {
  const params = new URLSearchParams(window.location.search);
  const forced = params.get('motion');
  if (forced === 'off') return false;
  if (forced === 'on') return true;
  const stored = localStorage.getItem(KEY);
  if (stored === 'off') return false;
  if (stored === 'on') return true;
  return !prefersReducedMotion();
}

export function setMotionEnabled(value: boolean): void {
  localStorage.setItem(KEY, value ? 'on' : 'off');
}

/** 切换动画开关：保存滚动位置后重载，确保每个场景都以一致状态重建 */
export function reloadWithMotion(value: boolean): void {
  setMotionEnabled(value);
  try {
    sessionStorage.setItem('fraud-demo.restoreScroll', String(window.scrollY));
  } catch {
    /* 隐私模式下忽略 */
  }
  window.location.reload();
}

export function restoreScrollIfNeeded(): void {
  try {
    const raw = sessionStorage.getItem('fraud-demo.restoreScroll');
    if (!raw) return;
    sessionStorage.removeItem('fraud-demo.restoreScroll');
    const y = Number(raw);
    if (Number.isFinite(y)) {
      requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'auto' }));
    }
  } catch {
    /* ignore */
  }
}
