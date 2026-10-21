import { CLASS_META, classMeta } from '../core/config';
import type { TopKEntry } from '../core/types';

export interface ProbBarOptions {
  topK: TopKEntry[];
  weakIds?: Set<number>;
  weakF1?: Map<number, number>;
  realLabel?: number | null;
  animate?: boolean;
  compact?: boolean;
}

function percent(prob: number): string {
  if (prob <= 0) return '0%';
  if (prob < 0.001) return '<0.1%';
  return `${(prob * 100).toFixed(1)}%`;
}

export class ProbBar {
  readonly root: HTMLElement;
  private readonly options: ProbBarOptions;

  constructor(options: ProbBarOptions) {
    this.options = options;
    this.root = document.createElement('div');
    this.root.className = `prob-bar${options.compact ? ' prob-bar--compact' : ''}`;
    this.root.setAttribute('role', 'list');
    this.root.setAttribute('aria-label', '10 类概率，按概率降序');
    this.render(options.topK);
  }

  update(topK: TopKEntry[], realLabel?: number | null): void {
    this.options.topK = topK;
    if (realLabel !== undefined) this.options.realLabel = realLabel;
    this.render(topK);
  }

  private render(topK: TopKEntry[]): void {
    const probs = new Map<number, number>();
    topK.forEach((item) => probs.set(item.id, item.prob));
    const rows = CLASS_META.map((meta) => ({ id: meta.id, prob: probs.get(meta.id) ?? 0 }))
      .sort((a, b) => b.prob - a.prob);

    const frag = document.createDocumentFragment();
    rows.forEach((row, index) => {
      const meta = classMeta(row.id);
      const el = document.createElement('div');
      el.className = 'prob-row';
      el.dataset.id = String(row.id);
      el.setAttribute('role', 'listitem');
      const weak = this.options.weakIds?.has(row.id) ?? false;
      if (index < 3) el.classList.add('is-top');
      if (this.options.realLabel === row.id) el.classList.add('is-real');
      if (weak) el.classList.add('is-weak');

      const dot = document.createElement('span');
      dot.className = 'prob-dot';
      dot.style.background = meta.color;

      const name = document.createElement('span');
      name.className = 'prob-name';
      name.textContent = meta.short;

      const labels = document.createElement('span');
      labels.className = 'prob-labels';
      if (this.options.realLabel === row.id) {
        const real = document.createElement('span');
        real.className = 'prob-real';
        real.textContent = '真实';
        labels.appendChild(real);
      }
      if (weak) {
        const weakTag = document.createElement('span');
        weakTag.className = 'prob-weak';
        const f1 = this.options.weakF1?.get(row.id);
        weakTag.textContent = '弱类';
        weakTag.title = f1 !== undefined ? `该类 F1 ${f1.toFixed(2)}，不建议单独采信` : '该类 F1 偏低，不建议单独采信';
        labels.appendChild(weakTag);
      }

      const track = document.createElement('span');
      track.className = 'prob-track';
      const fill = document.createElement('span');
      fill.className = 'prob-fill';
      fill.style.background = meta.color;
      fill.style.width = this.options.animate === false ? `${row.prob * 100}%` : '0%';
      track.appendChild(fill);

      const value = document.createElement('span');
      value.className = 'prob-value';
      value.textContent = percent(row.prob);

      el.append(dot, name, labels, track, value);
      el.setAttribute('aria-label', `${meta.short} ${percent(row.prob)}${this.options.realLabel === row.id ? '，真实类别' : ''}`);
      frag.appendChild(el);

      if (this.options.animate !== false) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            fill.style.width = `${row.prob * 100}%`;
          });
        });
      }
    });
    this.root.replaceChildren(frag);
  }
}
