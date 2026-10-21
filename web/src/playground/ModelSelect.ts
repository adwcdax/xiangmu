import type { ModelInfo } from '../api/types';

function statusLabel(model: ModelInfo): string {
  if (model.status === 'loading') return '加载中';
  if (model.status === 'unavailable') return '未上线';
  return '';
}

function metricLine(model: ModelInfo): string {
  if (!model.metrics) return model.description;
  const macro = model.metrics.macro_f1.toFixed(2);
  const fraud = model.metrics.fraud_f1.toFixed(2);
  return `${model.description} · macro-F1 ${macro} · 欺诈 F1 ${fraud}`;
}

export class ModelSelect {
  readonly root: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly list: HTMLElement;
  private readonly labelId: string;
  private models: ModelInfo[] = [];
  private selected = '';
  private activeIndex = -1;
  private open = false;
  private readonly onChange: (model: ModelInfo) => void;

  constructor(host: HTMLElement, onChange: (model: ModelInfo) => void) {
    this.onChange = onChange;
    this.labelId = `model-label-${Math.random().toString(36).slice(2, 7)}`;
    this.root = document.createElement('div');
    this.root.className = 'model-select';

    const label = document.createElement('label');
    label.className = 'field-label';
    label.id = this.labelId;
    label.textContent = '模型';
    label.htmlFor = `${this.labelId}-button`;

    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'model-trigger';
    this.button.id = `${this.labelId}-button`;
    this.button.setAttribute('role', 'combobox');
    this.button.setAttribute('aria-haspopup', 'listbox');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.setAttribute('aria-labelledby', `${this.labelId} ${this.labelId}-value`);
    this.button.innerHTML = '<span class="model-trigger-text" id="' + this.labelId + '-value">正在获取模型…</span><span class="model-trigger-caret" aria-hidden="true">▾</span>';

    this.list = document.createElement('div');
    this.list.className = 'model-list';
    this.list.setAttribute('role', 'listbox');
    this.list.id = `${this.labelId}-list`;
    this.list.tabIndex = -1;
    this.list.hidden = true;
    this.button.setAttribute('aria-controls', this.list.id);

    this.root.append(label, this.button, this.list);
    host.appendChild(this.root);

    this.button.addEventListener('click', () => this.toggle());
    this.button.addEventListener('keydown', (event) => this.handleKey(event));
    this.list.addEventListener('keydown', (event) => this.handleKey(event));
    document.addEventListener('click', (event) => {
      if (!this.root.contains(event.target as Node)) this.close();
    });
  }

  setModels(models: ModelInfo[], selectedId?: string): void {
    this.models = models;
    const fallback = models.find((model) => model.status === 'ready');
    const requested = models.find((model) => model.id === selectedId && model.status === 'ready');
    this.selected = requested?.id ?? fallback?.id ?? '';
    this.renderList();
    this.updateTrigger();
  }

  get value(): string {
    return this.selected;
  }

  get current(): ModelInfo | undefined {
    return this.models.find((model) => model.id === this.selected);
  }

  private updateTrigger(): void {
    const model = this.current;
    const value = this.button.querySelector<HTMLElement>(`#${this.labelId}-value`);
    if (!value) return;
    value.textContent = model ? model.name : '暂无可用模型';
    this.button.disabled = this.models.length === 0;
  }

  private renderList(): void {
    const frag = document.createDocumentFragment();
    this.models.forEach((model, index) => {
      const option = document.createElement('div');
      option.className = 'model-option';
      option.id = `${this.labelId}-option-${index}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(model.id === this.selected));
      if (model.status !== 'ready') option.setAttribute('aria-disabled', 'true');
      option.dataset.index = String(index);
      if (model.id === this.selected) option.classList.add('is-selected');
      if (model.status !== 'ready') option.classList.add('is-disabled');

      const line = document.createElement('div');
      line.className = 'model-option-line';
      const name = document.createElement('span');
      name.className = 'model-option-name';
      name.textContent = model.name;
      line.appendChild(name);
      const status = statusLabel(model);
      if (status) {
        const tag = document.createElement('span');
        tag.className = `model-status model-status--${model.status}`;
        tag.textContent = status;
        line.appendChild(tag);
      }
      const desc = document.createElement('div');
      desc.className = 'model-option-desc';
      desc.textContent = metricLine(model);
      option.append(line, desc);
      option.addEventListener('click', () => {
        if (model.status !== 'ready') return;
        this.select(index);
      });
      option.addEventListener('mouseenter', () => this.setActive(index));
      frag.appendChild(option);
    });
    this.list.replaceChildren(frag);
  }

  private toggle(): void {
    if (this.open) this.close();
    else this.openList();
  }

  private openList(): void {
    if (this.models.length === 0) return;
    this.open = true;
    this.list.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
    const selectedIndex = this.models.findIndex((model) => model.id === this.selected);
    this.setActive(selectedIndex >= 0 ? selectedIndex : this.firstSelectable());
    this.list.focus();
  }

  private close(): void {
    if (!this.open) return;
    this.open = false;
    this.list.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
  }

  private firstSelectable(): number {
    return this.models.findIndex((model) => model.status === 'ready');
  }

  private lastSelectable(): number {
    for (let i = this.models.length - 1; i >= 0; i -= 1) {
      if (this.models[i].status === 'ready') return i;
    }
    return -1;
  }

  private setActive(index: number): void {
    if (index < 0 || index >= this.models.length) return;
    this.activeIndex = index;
    const options = [...this.list.querySelectorAll<HTMLElement>('.model-option')];
    options.forEach((option, i) => option.classList.toggle('is-active', i === index));
    this.list.setAttribute('aria-activedescendant', `${this.labelId}-option-${index}`);
    options[index]?.scrollIntoView({ block: 'nearest' });
  }

  private move(delta: number): void {
    let index = this.activeIndex;
    for (let step = 0; step < this.models.length; step += 1) {
      index = (index + delta + this.models.length) % this.models.length;
      if (this.models[index].status === 'ready') {
        this.setActive(index);
        return;
      }
    }
  }

  private select(index: number): void {
    const model = this.models[index];
    if (!model || model.status !== 'ready') return;
    this.selected = model.id;
    this.close();
    this.renderList();
    this.updateTrigger();
    this.button.focus();
    this.onChange(model);
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.close();
      this.button.focus();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.open) this.openList();
      else this.move(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      if (!this.open) return;
      event.preventDefault();
      this.setActive(event.key === 'Home' ? this.firstSelectable() : this.lastSelectable());
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      if (!this.open) return;
      event.preventDefault();
      this.select(this.activeIndex);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const char = event.key.toLowerCase();
      const index = this.models.findIndex(
        (model) => model.status === 'ready' && model.name.toLowerCase().startsWith(char),
      );
      if (index >= 0) {
        if (!this.open) this.openList();
        this.setActive(index);
      }
    }
  }
}
