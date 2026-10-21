import { fmt } from '../core/utils';

export class CIBar {
  readonly root: HTMLElement;
  private line: HTMLElement;

  constructor(value: number, ci: [number, number], color = 'var(--accent)') {
    this.root = document.createElement('span');
    this.root.className = 'cibar';
    this.root.title = `${fmt(value, 2)} [${fmt(ci[0], 2)}, ${fmt(ci[1], 2)}]`;
    const capL = document.createElement('i');
    capL.className = 'cibar-cap';
    this.line = document.createElement('i');
    this.line.className = 'cibar-line';
    const capR = document.createElement('i');
    capR.className = 'cibar-cap';
    const dot = document.createElement('i');
    dot.className = 'cibar-dot';
    dot.style.left = `${value * 100}%`;
    dot.style.background = color;
    this.root.append(capL, this.line, capR, dot);
    this.setRange(ci);
  }

  setRange(ci: [number, number]): void {
    const [lo, hi] = ci;
    this.line.style.left = `${lo * 100}%`;
    this.line.style.width = `${Math.max(0.5, (hi - lo) * 100)}%`;
  }
}
