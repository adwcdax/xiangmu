import { isEditableTarget, prefersReducedMotion } from './utils';
import type { ScrollDirector, StepPosition } from './scrollDirector';

export class PresenterMode {
  private active = false;
  private steps: StepPosition[] = [];
  private current = 0;
  private director: ScrollDirector;
  private hud: HTMLElement;
  private text: HTMLElement;
  private button: HTMLButtonElement;
  private onToggle?: (active: boolean) => void;
  private scrollTimer = 0;

  constructor(director: ScrollDirector, button: HTMLButtonElement, onToggle?: (active: boolean) => void) {
    this.director = director;
    this.button = button;
    this.onToggle = onToggle;
    this.hud = document.getElementById('presenter-hud') as HTMLElement;
    this.text = document.getElementById('presenter-text') as HTMLElement;
    button.addEventListener('click', () => this.toggle());
    window.addEventListener('keydown', this.handleKey);
    window.addEventListener('scroll', this.handleScroll, { passive: true });
    document.addEventListener('fullscreenchange', () => this.update());
  }

  get isActive(): boolean {
    return this.active;
  }

  toggle(): void {
    if (this.active) this.exit();
    else this.enter();
  }

  enter(): void {
    if (this.active) return;
    this.active = true;
    this.steps = this.director.getStepPositions();
    this.current = this.nearestStep(window.scrollY);
    document.body.classList.add('presenter');
    document.documentElement.classList.add('presenter');
    this.hud.hidden = false;
    this.button.setAttribute('aria-pressed', 'true');
    this.button.classList.add('is-on');
    this.onToggle?.(true);
    this.update();
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    document.body.classList.remove('presenter');
    document.documentElement.classList.remove('presenter');
    this.hud.hidden = true;
    this.button.setAttribute('aria-pressed', 'false');
    this.button.classList.remove('is-on');
    this.onToggle?.(false);
  }

  private nearestStep(y: number): number {
    if (this.steps.length === 0) return 0;
    let best = 0;
    let bestDist = Infinity;
    this.steps.forEach((step, i) => {
      const d = Math.abs(step.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  private handleScroll = (): void => {
    if (!this.active) return;
    window.clearTimeout(this.scrollTimer);
    this.scrollTimer = window.setTimeout(() => {
      this.current = this.nearestStep(window.scrollY);
      this.update();
    }, 90);
  };

  private handleKey = (event: KeyboardEvent): void => {
    if (isEditableTarget(event.target)) return;
    if (!this.active) return;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === ' ') {
      event.preventDefault();
      this.next();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.prev();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.exit();
    } else if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      void this.toggleFullscreen();
    }
  };

  next(): void {
    if (!this.active) return;
    this.refreshSteps();
    if (this.current >= this.steps.length - 1) return;
    this.current += 1;
    this.scrollToCurrent();
  }

  prev(): void {
    if (!this.active) return;
    this.refreshSteps();
    if (this.current <= 0) return;
    this.current -= 1;
    this.scrollToCurrent();
  }

  private refreshSteps(): void {
    const next = this.director.getStepPositions();
    if (next.length === this.steps.length) this.steps = next;
  }

  private scrollToCurrent(): void {
    const step = this.steps[this.current];
    if (!step) return;
    window.scrollTo({
      top: step.y,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
    this.update();
  }

  private update(): void {
    if (!this.active) return;
    const step = this.steps[this.current];
    if (!step) {
      this.text.textContent = '';
      return;
    }
    this.text.textContent = `场景 ${step.sceneIndex + 1} / 9 · 步骤 ${step.stepIndex + 1} / ${step.stepCount}`;
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      /* 浏览器拒绝全屏时保持讲解模式 */
    }
  }
}
