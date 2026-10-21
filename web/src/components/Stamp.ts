import { classMeta } from '../core/config';
import { createClassChip } from './ClassChip';

export type StampKind = 'fraud' | 'benign';

export class Stamp {
  readonly root: HTMLElement;
  private readonly verdictEl: HTMLElement;
  private readonly classEl: HTMLElement;
  private kind: StampKind = 'benign';

  constructor(kind: StampKind = 'benign', labelId?: number, verdictText?: string) {
    this.root = document.createElement('div');
    this.root.className = 'stamp';
    this.verdictEl = document.createElement('div');
    this.verdictEl.className = 'stamp-verdict';
    this.classEl = document.createElement('div');
    this.classEl.className = 'stamp-class';
    this.root.append(this.verdictEl, this.classEl);
    this.setVerdict(kind, verdictText);
    if (labelId !== undefined) this.setClass(labelId);
  }

  setVerdict(kind: StampKind, text?: string): void {
    this.kind = kind;
    this.root.classList.toggle('stamp--fraud', kind === 'fraud');
    this.root.classList.toggle('stamp--benign', kind === 'benign');
    this.verdictEl.textContent = text ?? (kind === 'fraud' ? '疑似诈骗' : '未发现风险');
    this.root.setAttribute('aria-label', `${this.verdictEl.textContent}${this.classEl.textContent ?? ''}`);
  }

  setClass(labelId: number, full = false): void {
    this.classEl.replaceChildren();
    const meta = classMeta(labelId);
    this.classEl.appendChild(createClassChip(labelId, { full }));
    if (!full) {
      const fullName = document.createElement('span');
      fullName.className = 'stamp-class-full';
      fullName.textContent = meta.name;
      this.classEl.appendChild(fullName);
    }
    this.root.setAttribute('aria-label', `${this.verdictEl.textContent ?? ''}，${meta.name}`);
  }

  get kindValue(): StampKind {
    return this.kind;
  }
}
