import { classMeta } from '../core/config';

export interface ClassChipOptions {
  /** 显示全名而不是短名 */
  full?: boolean;
  /** 弱类标记（F1 < 0.65） */
  weak?: boolean;
  weakText?: string;
  size?: 'sm' | 'md';
}

export function createClassChip(id: number, options: ClassChipOptions = {}): HTMLElement {
  const meta = classMeta(id);
  const chip = document.createElement('span');
  chip.className = `class-chip class-chip--${options.size ?? 'md'}${options.weak ? ' is-weak' : ''}`;
  chip.style.setProperty('--chip-rgb', meta.rgb);
  chip.dataset.classId = String(meta.id);
  chip.title = meta.name;

  const dot = document.createElement('span');
  dot.className = 'class-chip-dot';
  dot.setAttribute('aria-hidden', 'true');
  const name = document.createElement('span');
  name.className = 'class-chip-name';
  name.textContent = options.full ? meta.name : meta.short;
  chip.append(dot, name);

  if (options.weak) {
    const tag = document.createElement('span');
    tag.className = 'class-chip-weak';
    tag.textContent = options.weakText ?? '弱类';
    tag.title = '该类 F1 偏低，不建议单独采信';
    chip.appendChild(tag);
  }
  return chip;
}

/** 类别色的内联变量，供图例、托盘等自定义元素复用。 */
export function classColorVars(id: number): { color: string; rgb: string } {
  const meta = classMeta(id);
  return { color: meta.color, rgb: meta.rgb };
}
