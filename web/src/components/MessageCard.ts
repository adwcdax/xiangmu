import type { Cue, Modality, Turn } from '../core/types';
import { sanitizeText } from '../core/sanitize';

export interface MessageCardOptions {
  text: string;
  turns?: Turn[] | null;
  modality: Modality;
  cues?: Cue[];
  maxTurns?: number;
  showCueTags?: boolean;
  badge?: boolean;
  compact?: boolean;
}

interface Range {
  start: number;
  end: number;
  kind: string;
}

function cueRanges(text: string, cues: Cue[]): Range[] {
  return cues
    .map((cue) => {
      const phrase = sanitizeText(text.slice(cue.start, cue.end));
      if (!phrase) return null;
      const start = text.indexOf(phrase);
      return start >= 0 ? { start, end: start + phrase.length, kind: cue.kind } : null;
    })
    .filter((range): range is Range => range !== null)
    .sort((a, b) => a.start - b.start);
}

function renderRich(host: HTMLElement, text: string, ranges: Range[], showTags: boolean): HTMLElement[] {
  const marks: HTMLElement[] = [];
  let cursor = 0;
  ranges.forEach((range) => {
    if (range.start < cursor || range.start >= text.length) return;
    if (range.start > cursor) host.appendChild(document.createTextNode(text.slice(cursor, range.start)));
    const mark = document.createElement('mark');
    mark.className = 'msg-cue';
    mark.dataset.kind = range.kind;
    mark.textContent = text.slice(range.start, range.end);
    mark.title = range.kind;
    host.appendChild(mark);
    marks.push(mark);
    if (showTags) {
      const tag = document.createElement('sup');
      tag.className = 'msg-cue-tag';
      tag.textContent = range.kind;
      host.appendChild(tag);
    }
    cursor = range.end;
  });
  if (cursor < text.length) host.appendChild(document.createTextNode(text.slice(cursor)));
  return marks;
}

export class MessageCard {
  readonly root: HTMLElement;
  readonly cueEls: HTMLElement[] = [];
  private readonly text: string;
  private readonly cues: Cue[];

  constructor(options: MessageCardOptions) {
    this.text = sanitizeText(options.text);
    this.cues = options.cues ?? [];
    this.root = document.createElement('div');
    this.root.className = `msg-card msg-card--${options.modality}${options.compact ? ' msg-card--compact' : ''}`;

    const head = document.createElement('div');
    head.className = 'msg-head';
    const modality = document.createElement('span');
    modality.className = 'msg-modality';
    modality.innerHTML = `<i aria-hidden="true"></i>${options.modality === 'dialog' ? '对话' : '短信'}`;
    head.appendChild(modality);
    if (options.badge !== false) {
      const badge = document.createElement('span');
      badge.className = 'msg-sanitized';
      badge.textContent = '已脱敏';
      badge.title = '6 位以上数字、链接、账号已替换为占位符';
      head.appendChild(badge);
    }
    this.root.appendChild(head);

    if (options.modality === 'dialog' && options.turns && options.turns.length > 0) {
      this.renderDialog(options.turns, options.maxTurns ?? 6, options.showCueTags ?? false);
    } else {
      const body = document.createElement('p');
      body.className = 'msg-text';
      const ranges = cueRanges(this.text, this.cues);
      this.cueEls.push(...renderRich(body, this.text, ranges, options.showCueTags ?? false));
      this.root.appendChild(body);
    }

    const legend = this.buildLegend();
    if (legend) this.root.appendChild(legend);
  }

  private renderDialog(turns: Turn[], maxTurns: number, showTags: boolean): void {
    const sanitized = turns.map((turn) => ({ role: turn.role, text: sanitizeText(turn.text) }));
    const joined = sanitized.map((turn) => turn.text).join('\n');
    const ranges = cueRanges(joined, this.cues);
    const thread = document.createElement('div');
    thread.className = 'msg-thread';

    let offset = 0;
    sanitized.slice(0, maxTurns).forEach((turn) => {
      const start = offset;
      const end = start + turn.text.length;
      offset = end + 1;
      const bubble = document.createElement('div');
      bubble.className = `msg-bubble msg-bubble--${turn.role === '客户' ? 'right' : 'left'}`;
      const role = document.createElement('span');
      role.className = 'msg-role';
      role.textContent = turn.role;
      const body = document.createElement('p');
      const local = ranges
        .filter((range) => range.start < end && range.end > start)
        .map((range) => ({
          start: Math.max(range.start, start) - start,
          end: Math.min(range.end, end) - start,
          kind: range.kind,
        }));
      this.cueEls.push(...renderRich(body, turn.text, local, showTags));
      bubble.append(role, body);
      thread.appendChild(bubble);
    });

    if (sanitized.length > maxTurns) {
      const more = document.createElement('div');
      more.className = 'msg-more';
      more.textContent = `还有 ${sanitized.length - maxTurns} 轮，已折叠`;
      thread.appendChild(more);
    }
    this.root.appendChild(thread);
  }

  private buildLegend(): HTMLElement | null {
    const kinds = [...new Set(this.cues.map((cue) => cue.kind))];
    if (kinds.length === 0) return null;
    const legend = document.createElement('div');
    legend.className = 'msg-legend';
    kinds.forEach((kind) => {
      const item = document.createElement('span');
      item.className = 'msg-legend-item';
      item.textContent = kind;
      legend.appendChild(item);
    });
    return legend;
  }

  setCueActive(index: number): void {
    this.cueEls.forEach((el, i) => el.classList.toggle('is-active', i === index));
  }

  clearCueActive(): void {
    this.cueEls.forEach((el) => el.classList.remove('is-active'));
  }
}
