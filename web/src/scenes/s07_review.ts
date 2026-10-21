import gsap from 'gsap';
import type { AppData, CasePred, DemoCase, Modality, OutOfDomainCase, Turn } from '../core/types';
import type { SceneModule } from '../core/scrollDirector';
import { CONFIG, classMeta } from '../core/config';
import { MessageCard } from '../components/MessageCard';
import { Stamp } from '../components/Stamp';
import { ProbBar } from '../components/ProbBar';
import { createClassChip } from '../components/ClassChip';
import { int, pct } from '../core/utils';

interface Sample {
  key: string;
  kind: 'demo' | 'error' | 'ood';
  title: string;
  label: number;
  modality: Modality;
  text: string;
  turns: Turn[] | null;
  pred: CasePred;
  cues: { start: number; end: number; kind: string }[];
  outOfDomain?: boolean;
}

function rankOf(pred: CasePred, label: number): number {
  const sorted = [...pred.top_k].sort((a, b) => b.prob - a.prob);
  const idx = sorted.findIndex((item) => item.id === label);
  return idx < 0 ? 0 : idx + 1;
}

export function createS7(
  el: HTMLElement,
  data: AppData,
  motion: boolean,
  jump: (id: string) => void,
): SceneModule {
  const weakIds = new Set(
    (data.results.models.find((m) => m.id === 'fasttext')?.test?.per_class ?? [])
      .filter((m) => m.f1 < CONFIG.f1Bands.medium)
      .map((m) => m.id),
  );
  const weakF1 = new Map(
    (data.results.models.find((m) => m.id === 'fasttext')?.test?.per_class ?? []).map((m) => [m.id, m.f1]),
  );

  const samples: Sample[] = [];
  data.cases.demo.forEach((demo: DemoCase) => {
    samples.push({
      key: demo.id,
      kind: 'demo',
      title: classMeta(demo.label).short,
      label: demo.label,
      modality: demo.modality,
      text: demo.text,
      turns: demo.turns,
      pred: demo.pred,
      cues: demo.cues,
    });
  });
  data.cases.errors
    .filter((item) => item.tag === 'class_overlap')
    .slice(0, 2)
    .forEach((item) => {
      samples.push({
        key: item.id,
        kind: 'error',
        title: `边界 · ${classMeta(item.label).short}`,
        label: item.label,
        modality: item.modality,
        text: item.text,
        turns: item.turns,
        pred: item.pred,
        cues: item.cues,
      });
    });
  data.cases.out_of_domain.slice(0, 2).forEach((item: OutOfDomainCase, i) => {
    const top = [
      { id: 4, prob: Math.min(0.999, item.p_fraud) },
      { id: 3, prob: Math.max(0, (1 - item.p_fraud) * 0.6) },
      { id: 1, prob: Math.max(0, (1 - item.p_fraud) * 0.4) },
    ];
    const rest = 10 - top.reduce((a, b) => a + b.prob, 0);
    [0, 2, 5, 6, 7, 8, 9].forEach((id) => top.push({ id, prob: Math.max(0, rest / 7) }));
    samples.push({
      key: `ood-${i}`,
      kind: 'ood',
      title: '域外 · 招聘帖',
      label: 0,
      modality: 'sms',
      text: item.text,
      turns: null,
      pred: { label: 4, p_fraud: item.p_fraud, top_k: top },
      cues: [],
      outOfDomain: true,
    });
  });

  el.innerHTML = `
    <div class="stage s7-stage">
      <div class="s7-head">
        <div>
          <div class="eyebrow">样例复盘</div>
          <h2>一条样例的完整判定</h2>
        </div>
        <p class="s7-lede">测试集样例带真实标签：不只看判成什么，还能看真实类排第几。</p>
      </div>
      <div class="s7-grid">
        <section class="s7-left s7-panel">
          <div class="s7-samples" role="group" aria-label="样例选择">
            ${samples
              .map(
                (sample, index) => `
              <button class="s7-sample${sample.kind === 'ood' || sample.kind === 'error' ? ' is-boundary' : ''}${index === 0 ? ' is-active' : ''}" type="button" data-sample="${index}">
                <span class="s7-sample-name">${sample.kind === 'demo' ? sample.title : sample.title}</span>
                ${sample.kind === 'demo' ? createClassChip(sample.label, { size: 'sm' }).outerHTML : `<span class="s7-sample-tag">${sample.kind === 'ood' ? '域外' : '边界'}</span>`}
              </button>`,
              )
              .join('')}
          </div>
          <div class="s7-source-head">
            <span>原文（不可编辑）</span>
            <button class="link-btn s7-open" type="button">在检测台里打开</button>
          </div>
          <div class="s7-card-host"></div>
          <p class="s7-note">使用测试集样例的预计算结果。想试自己的文本，<button class="link-btn" type="button" data-top>回到顶部检测台</button>。</p>
          <button class="btn btn--primary s7-run" type="button">分拣</button>
        </section>

        <section class="s7-right s7-panel" aria-live="polite">
          <header class="s7-right-head">
            <h3>判定结果</h3>
            <span class="s7-truth">真实类别 <b></b></span>
          </header>
          <div class="s7-result-host"></div>
        </section>
      </div>
    </div>
  `;

  const cardHost = el.querySelector('.s7-card-host') as HTMLElement;
  const resultHost = el.querySelector('.s7-result-host') as HTMLElement;
  const truthEl = el.querySelector('.s7-truth b') as HTMLElement;
  const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>('.s7-sample'));
  const openBtn = el.querySelector('.s7-open') as HTMLButtonElement;
  const runBtn = el.querySelector('.s7-run') as HTMLButtonElement;
  const note = el.querySelector('.s7-note') as HTMLElement;
  const lede = el.querySelector('.s7-lede') as HTMLElement;

  let selected = samples[0];
  let message: MessageCard | null = null;
  let scan: HTMLElement | null = null;

  const renderSource = (): void => {
    cardHost.replaceChildren();
    message = new MessageCard({
      text: selected.text,
      turns: selected.turns,
      modality: selected.modality,
      cues: selected.cues,
      showCueTags: true,
      badge: true,
    });
    cardHost.appendChild(message.root);
    const wrap = document.createElement('div');
    wrap.className = 's7-card-wrap';
    cardHost.appendChild(wrap);
    scan = document.createElement('div');
    scan.className = 's7-scan';
    cardHost.appendChild(scan);
    truthEl.textContent = selected.outOfDomain ? '域外（正常招聘帖）' : classMeta(selected.label).short;
    openBtn.hidden = false;
    void wrap;
  };

  const renderResult = (animate: boolean): void => {
    resultHost.replaceChildren();
    const pred = selected.pred;
    const label = pred.label;
    const isFraud = pred.p_fraud >= 0.5;
    const rank = rankOf(pred, selected.label);

    const wrap = document.createElement('div');
    wrap.className = 's7-result';

    const verdict = document.createElement('div');
    verdict.className = 's7-verdict';
    const stamp = new Stamp(isFraud ? 'fraud' : 'benign', label);
    verdict.appendChild(stamp.root);
    const ring = document.createElement('div');
    ring.className = 's7-ring';
    ring.innerHTML = `<b>${pct(pred.p_fraud)}</b><span>p_fraud</span>`;
    verdict.appendChild(ring);
    wrap.appendChild(verdict);

    const prob = new ProbBar({
      topK: pred.top_k,
      weakIds,
      weakF1,
      realLabel: selected.outOfDomain ? null : selected.label,
      animate,
    });
    wrap.appendChild(prob.root);

    const cards = document.createElement('div');
    cards.className = 's7-readouts';
    cards.innerHTML = `
      <div class="s7-readout"><span>p_fraud</span><b>${pred.p_fraud.toFixed(3)}</b></div>
      <div class="s7-readout"><span>阈值</span><b>0.50</b></div>
      <div class="s7-readout"><span>是否诈骗</span><b class="${isFraud ? 'is-fraud' : 'is-benign'}">${isFraud ? '是' : '否'}</b></div>
    `;
    wrap.appendChild(cards);

    const hint = document.createElement('div');
    hint.className = 's7-hint';
    if (selected.outOfDomain) {
      hint.classList.add('is-warn');
      hint.innerHTML = `<span>这是正常招聘帖，模型仍给出 p_fraud ${pred.p_fraud.toFixed(2)}，属于适用域外。</span>`;
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'link-btn';
      link.textContent = '看域外检验 →';
      link.addEventListener('click', () => jump('s5'));
      hint.appendChild(link);
    } else if (rank === 1) {
      hint.classList.add('is-ok');
      hint.textContent = '判对：真实类别就是 top-1。';
    } else if (rank === 2 || rank === 3) {
      hint.classList.add('is-ok');
      hint.textContent = `真实类别排第 ${rank}，给出候选列表就能覆盖。`;
    } else {
      hint.classList.add('is-bad');
      hint.innerHTML = '<span>判错。真实类别不在 top-3。</span>';
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'link-btn';
      link.textContent = '看错误分析 →';
      link.addEventListener('click', () => jump('s8'));
      hint.appendChild(link);
    }
    wrap.appendChild(hint);

    const meta = document.createElement('p');
    meta.className = 's7-meta';
    meta.textContent = `真实类别 ${selected.outOfDomain ? '无（域外）' : classMeta(selected.label).name} · 样本 ${selected.key} · ${int(selected.text.length)} 字`;
    wrap.appendChild(meta);

    resultHost.appendChild(wrap);
    gsap.set(wrap, { opacity: 1 });
    if (animate) {
      gsap.from(wrap, { opacity: 0, y: 12, duration: 0.35, ease: 'power2.out' });
    }
  };

  const selectSample = (index: number): void => {
    selected = samples[index];
    buttons.forEach((btn, i) => btn.classList.toggle('is-active', i === index));
    renderSource();
    renderResult(false);
  };

  buttons.forEach((btn, index) => {
    btn.addEventListener('click', () => selectSample(index));
  });

  runBtn.addEventListener('click', () => {
    if (motion && scan) {
      scan.classList.remove('is-running');
      void scan.offsetWidth;
      scan.classList.add('is-running');
      message?.cueEls.forEach((mark, i) => {
        window.setTimeout(() => {
          message?.clearCueActive();
          message?.setCueActive(i);
        }, 200 + i * 260);
      });
      window.setTimeout(() => {
        renderResult(true);
      }, 900);
    } else {
      renderResult(false);
    }
  });

  openBtn.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('playground:fill', { detail: { text: selected.text } }));
    jump('p');
  });
  el.querySelector('[data-top]')?.addEventListener('click', () => jump('p'));

  renderSource();
  renderResult(false);

  const final = (): void => {
    gsap.set([lede, note], { opacity: 1 });
    scan?.classList.remove('is-running');
  };

  if (!motion) {
    final();
    return { id: 's7', el, final };
  }

  gsap.set([lede, note], { opacity: 0 });
  const build = (tl: gsap.core.Timeline): void => {
    tl.to(lede, { opacity: 1, duration: 0.4 }, 0)
      .from(el.querySelector('.s7-left'), { opacity: 0, x: -20, duration: 0.5 }, 0)
      .from(el.querySelector('.s7-right'), { opacity: 0, x: 20, duration: 0.5 }, 0.1)
      .to(note, { opacity: 1, duration: 0.4 }, 0.5);
  };

  return { id: 's7', el, stepLabels: ['step1'], build, final };
}
