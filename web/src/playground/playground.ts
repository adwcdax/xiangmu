import { createClient, mockClient } from '../api/client';
import { ApiError, type ApiClient, type ApiMode, type ModelInfo, type PredictResponse } from '../api/types';
import { CONFIG, classMeta } from '../core/config';
import type { AppData } from '../core/types';
import { InputPanel } from './InputPanel';
import { ModelSelect } from './ModelSelect';
import { ResultPanel } from './ResultPanel';
import { StatusPill } from './StatusPill';

const FALLBACK_MODELS: ModelInfo[] = [
  {
    id: 'fasttext_zh',
    name: 'fastText（逐字 + 2-gram）',
    description: '10 类多分类，单条毫秒级',
    task: 'multiclass',
    status: 'ready',
    classes: 10,
    threshold: 0.5,
    max_chars: CONFIG.playground.maxChars,
    latency_hint_ms: 2,
    metrics: { macro_f1: 0.7365, fraud_f1: 0.9833 },
    domain: '中文电诈短信 / 对话 / 案情描述',
  },
];

function weakFromData(data: AppData): { ids: Set<number>; f1: Map<number, number> } {
  const model = data.results.models.find((item) => item.id === 'fasttext') ?? data.results.models[0];
  const ids = new Set<number>();
  const f1 = new Map<number, number>();
  model?.test?.per_class.forEach((item) => {
    f1.set(item.id, item.f1);
    if (item.f1 < CONFIG.f1Bands.medium) ids.add(item.id);
  });
  return { ids, f1 };
}

function setModelParam(id: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('model', id);
  window.history.replaceState(null, '', url);
}

function readModelParam(): string | null {
  return new URLSearchParams(window.location.search).get('model');
}

export function mountPlayground(root: HTMLElement, data: AppData, jump: (sceneId: string) => void): void {
  root.innerHTML = `
    <div class="pg-inner">
      <header class="pg-head">
        <p class="pg-eyebrow">中文电诈识别 · 在线检测台</p>
        <h1 class="pg-title">中文电诈识别</h1>
        <p class="pg-subtitle">输入一段短信、聊天记录或案情描述，判断是否诈骗、属于哪一类手法。</p>
      </header>
      <div class="pg-grid">
        <div class="pg-left"></div>
        <div class="pg-right"></div>
      </div>
      <p class="pg-domain-note"><span aria-hidden="true">ⓘ</span> 本模型基于合成电诈语料训练，不适用于招聘岗位审核等其他场景。</p>
      <button type="button" class="pg-down">向下了解模型 ↓</button>
    </div>
  `;

  const left = root.querySelector<HTMLElement>('.pg-left')!;
  const right = root.querySelector<HTMLElement>('.pg-right')!;
  const weak = weakFromData(data);

  let client: ApiClient = mockClient();
  let mode: ApiMode = 'mock';
  let models: ModelInfo[] = FALLBACK_MODELS;
  let controller: AbortController | null = null;
  let lastResult: PredictResponse | null = null;
  let lastResultModel = '';
  let pendingRetry = false;

  const result = new ResultPanel(right, {
    onRetry: () => submit(),
    onSwitchMock: () => switchToMock(true),
    onJump: (sceneId) => jump(sceneId),
    weakIds: weak.ids,
    weakF1: weak.f1,
  });

  const input = new InputPanel(left, {
    onSubmit: () => submit(),
    onCancel: () => {
      controller?.abort();
    },
    onClear: () => {
      lastResult = null;
      result.showEmpty();
    },
  });

  const select = new ModelSelect(input.modelHost, (model) => {
    setModelParam(model.id);
    input.setMaxChars(model.max_chars);
    if (lastResult) {
      result.showResult(lastResult, {
        mode,
        modelName: model.name,
        staleFrom: lastResultModel,
      });
    }
  });
  select.setModels(models, readModelParam() ?? 'fasttext_zh');

  const tools = document.getElementById('topbar-tools');
  const pill = new StatusPill(tools ?? document.body, {
    onReconnect: () => {
      pendingRetry = true;
      void probe();
    },
    onToggleMock: () => {
      if (mode === 'mock') void probe();
      else switchToMock(false);
    },
  });

  function context(): { mode: ApiMode; modelName: string } {
    return { mode, modelName: select.current?.name ?? 'fastText' };
  }

  async function submit(): Promise<void> {
    const text = input.getText();
    const current = select.current;
    if (!text) {
      result.showError(new ApiError('EMPTY_TEXT'), context());
      return;
    }
    if (current && text.length > current.max_chars) {
      result.showError(new ApiError('TEXT_TOO_LONG', { detail: { max_chars: current.max_chars } }), context());
      return;
    }
    controller?.abort();
    controller = new AbortController();
    const active = controller;
    input.setBusy(true);
    result.showLoading();
    try {
      const response = await client.predict(
        {
          model: select.value,
          text,
          modality: input.getModality(),
          top_k: CONFIG.playground.maxTopK,
        },
        active.signal,
      );
      if (active.signal.aborted) return;
      lastResult = response;
      lastResultModel = select.current?.name ?? 'fastText';
      result.showResult(response, context());
    } catch (error) {
      if (active.signal.aborted || (error instanceof ApiError && error.code === 'ABORTED')) {
        result.showEmpty();
      } else {
        result.showError(error, context());
      }
    } finally {
      if (controller === active) controller = null;
      input.setBusy(false);
    }
  }

  async function probe(): Promise<void> {
    pill.setState('probing');
    try {
      const probed = await createClient();
      client = probed.client;
      mode = probed.mode;
      if (mode === 'mock') {
        pill.setState('mock', { probeError: probed.probeError });
      } else {
        try {
          const health = await client.health();
          pill.setState(health.status === 'degraded' ? 'degraded' : mode === 'v1' ? 'v1' : 'legacy', {
            version: health.version,
            model: health.default_model,
          });
        } catch {
          pill.setState('degraded');
        }
      }
      const list = await client.models();
      models = list.models.length ? list.models : FALLBACK_MODELS;
      select.setModels(models, readModelParam() ?? list.default);
      input.setMaxChars(select.current?.max_chars ?? CONFIG.playground.maxChars);
      // labels 以后端为准；当前 UI 的短名仍来自 config，不一致时在控制台提示。
      const labels = await client.labels().catch(() => null);
      if (labels) {
        labels.forEach((label) => {
          const local = classMeta(label.id);
          if (local.name !== label.name) {
            console.warn(`[playground] 类别 ${label.id} 名称与本地配置不一致：${label.name} / ${local.name}`);
          }
        });
      }
      if (pendingRetry) {
        pendingRetry = false;
        void submit();
      }
    } catch {
      client = mockClient();
      mode = 'mock';
      pill.setState('mock', { probeError: '模型列表获取失败，使用默认配置' });
      select.setModels(FALLBACK_MODELS, 'fasttext_zh');
    }
  }

  function switchToMock(resubmit: boolean): void {
    controller?.abort();
    client = mockClient();
    mode = 'mock';
    pill.setState('mock', { probeError: '已手动切换到离线演示，结果不是模型输出' });
    if (resubmit) void submit();
  }

  root.querySelector<HTMLButtonElement>('.pg-down')?.addEventListener('click', () => jump('s0'));

  document.addEventListener('playground:fill', ((event: CustomEvent<{ text: string }>) => {
    input.setText(event.detail.text);
    root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    input.focus();
  }) as EventListener);

  void probe();

  window.setInterval(() => {
    if (mode === 'mock' || document.hidden) return;
    void client
      .health()
      .then((health) => {
        pill.setState(health.status === 'degraded' ? 'degraded' : mode === 'v1' ? 'v1' : 'legacy', {
          version: health.version,
          model: health.default_model,
        });
      })
      .catch(() => pill.setState('degraded'));
  }, 30000);
}
