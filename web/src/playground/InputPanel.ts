import { CONFIG, PLAYGROUND_SAMPLES, type PlaygroundSample } from '../core/config';
import type { ModalityInput } from '../api/types';

export interface InputPanelOptions {
  onSubmit: () => void;
  onCancel: () => void;
  onClear: () => void;
}

export class InputPanel {
  readonly root: HTMLElement;
  readonly modelHost: HTMLElement;
  private readonly textarea: HTMLTextAreaElement;
  private readonly counter: HTMLElement;
  private readonly shortHint: HTMLElement;
  private readonly submit: HTMLButtonElement;
  private readonly clear: HTMLButtonElement;
  private readonly options: InputPanelOptions;
  private maxChars = CONFIG.playground.maxChars;
  private busy = false;
  private modality: ModalityInput = 'auto';

  constructor(host: HTMLElement, options: InputPanelOptions) {
    this.options = options;
    this.root = document.createElement('section');
    this.root.className = 'pg-card pg-input-card';
    this.root.setAttribute('aria-labelledby', 'pg-input-title');
    this.root.innerHTML = `
      <div class="pg-card-head">
        <h2 id="pg-input-title">输入</h2>
        <span class="pg-card-note">文本不会保存，也不会写入地址栏</span>
      </div>
      <div class="pg-model-host"></div>
      <div class="pg-field">
        <span class="field-label" id="pg-modality-label">类型</span>
        <div class="segmented" role="group" aria-labelledby="pg-modality-label">
          <button type="button" class="segmented-btn is-active" data-modality="auto" aria-pressed="true">自动</button>
          <button type="button" class="segmented-btn" data-modality="sms" aria-pressed="false">短信</button>
          <button type="button" class="segmented-btn" data-modality="dialog" aria-pressed="false">对话</button>
          <span class="segmented-hint" title="当前模型只使用文本，不区分类型">ⓘ</span>
        </div>
      </div>
      <div class="pg-field pg-text-field">
        <label class="field-label" for="pg-textarea">待检测文本</label>
        <textarea id="pg-textarea" class="pg-textarea" rows="7" aria-describedby="pg-counter pg-short-hint"
          placeholder="例如：您好，您的快递在运输途中丢失，请添加客服微信办理理赔……"></textarea>
        <div class="pg-counter-row">
          <span class="pg-short-hint" id="pg-short-hint" hidden>内容较短，结果可能不稳定</span>
          <span class="pg-counter" id="pg-counter">0 / 2000</span>
        </div>
      </div>
      <div class="pg-samples" id="pg-samples"><span class="pg-samples-label">试试：</span></div>
      <div class="pg-actions">
        <button type="button" class="btn btn--ghost pg-clear">清空</button>
        <button type="button" class="btn btn--primary pg-submit">开始检测</button>
      </div>
    `;
    host.appendChild(this.root);

    this.modelHost = this.root.querySelector<HTMLElement>('.pg-model-host')!;
    this.textarea = this.root.querySelector<HTMLTextAreaElement>('#pg-textarea')!;
    this.counter = this.root.querySelector<HTMLElement>('#pg-counter')!;
    this.shortHint = this.root.querySelector<HTMLElement>('#pg-short-hint')!;
    this.submit = this.root.querySelector<HTMLButtonElement>('.pg-submit')!;
    this.clear = this.root.querySelector<HTMLButtonElement>('.pg-clear')!;

    this.textarea.addEventListener('input', () => this.refreshCounter());
    this.textarea.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        if (!this.busy) this.options.onSubmit();
      }
    });
    this.submit.addEventListener('click', () => {
      if (this.busy) this.options.onCancel();
      else this.options.onSubmit();
    });
    this.clear.addEventListener('click', () => {
      this.setText('');
      this.options.onClear();
      this.textarea.focus();
    });

    this.root.querySelectorAll<HTMLButtonElement>('.segmented-btn').forEach((button) => {
      button.addEventListener('click', () => {
        this.modality = (button.dataset.modality as ModalityInput) ?? 'auto';
        this.root.querySelectorAll<HTMLButtonElement>('.segmented-btn').forEach((item) => {
          const active = item === button;
          item.classList.toggle('is-active', active);
          item.setAttribute('aria-pressed', String(active));
        });
        this.textarea.placeholder =
          this.modality === 'dialog'
            ? "每行一句，可用“坐席：”“客户：”开头。例如：\n坐席：您的账户被冻结了。\n客户：我没有转账。"
            : '例如：您好，您的快递在运输途中丢失，请添加客服微信办理理赔……';
      });
    });

    this.renderSamples();
    this.refreshCounter();
  }

  private renderSamples(): void {
    const host = this.root.querySelector<HTMLElement>('#pg-samples')!;
    PLAYGROUND_SAMPLES.forEach((sample: PlaygroundSample) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `sample-chip${sample.outOfDomain ? ' sample-chip--domain' : ''}`;
      button.textContent = sample.label;
      button.title = sample.outOfDomain ? '超出适用域，用于观察模型边界' : '填入示例文本';
      button.addEventListener('click', () => {
        if (this.textarea.value.trim() && this.textarea.value.trim() !== sample.text) {
          const ok = window.confirm('替换当前内容？');
          if (!ok) return;
        }
        this.setText(sample.text);
        this.textarea.focus();
      });
      host.appendChild(button);
    });
  }

  private refreshCounter(): void {
    const length = this.textarea.value.length;
    this.counter.textContent = `${length} / ${this.maxChars}`;
    const ratio = length / this.maxChars;
    this.counter.classList.toggle('is-warn', ratio >= 0.9 && length <= this.maxChars);
    this.counter.classList.toggle('is-over', length > this.maxChars);
    this.shortHint.hidden = length === 0 || length >= CONFIG.playground.shortText;
    this.submit.disabled = length > this.maxChars;
    this.submit.setAttribute('aria-disabled', String(length > this.maxChars));
  }

  getText(): string {
    return this.textarea.value.trim();
  }

  getModality(): ModalityInput {
    return this.modality;
  }

  setText(text: string): void {
    this.textarea.value = text;
    this.refreshCounter();
  }

  setMaxChars(max: number): void {
    this.maxChars = max;
    this.refreshCounter();
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    this.submit.textContent = busy ? '检测中… 取消' : '开始检测';
    this.submit.classList.toggle('is-busy', busy);
    this.submit.setAttribute('aria-busy', String(busy));
    this.clear.disabled = busy;
  }

  focus(): void {
    this.textarea.focus({ preventScroll: false });
  }
}
