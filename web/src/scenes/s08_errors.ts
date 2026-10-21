import gsap from 'gsap';
import type { AppData, ErrorCase } from '../core/types';
import type { SceneModule } from '../core/scrollDirector';
import { CLASS_META, classMeta, tagLabel } from '../core/config';
import { int, pct } from '../core/utils';
import { MessageCard } from '../components/MessageCard';
import { createClassChip } from '../components/ClassChip';

type ErrorKind = 'overlap' | 'miss' | 'false_positive';

const KIND_LABEL: Record<ErrorKind, string> = {
  overlap: '相近类混淆',
  miss: '漏判为无风险',
  false_positive: '误报为诈骗',
};

function kindOf(item: ErrorCase): ErrorKind {
  if (item.tag === 'benign_fp') return 'false_positive';
  if (item.tag === 'weak_class') return 'miss';
  return 'overlap';
}

export function createS8(
  el: HTMLElement,
  data: AppData,
  motion: boolean,
  jump: (id: string) => void,
): SceneModule {
  const test = data.results.models.find((m) => m.id === 'fasttext')?.test ?? null;
  const confusion = test?.confusion ?? null;

  let overlap = 0;
  let miss = 0;
  let falsePositive = 0;
  if (confusion) {
    confusion.forEach((row, truth) => {
      row.forEach((count, pred) => {
        if (truth === pred) return;
        if (truth === 0 && pred !== 0) falsePositive += count;
        else if (truth !== 0 && pred === 0) miss += count;
        else if (truth !== 0 && pred !== 0) overlap += count;
      });
    });
  }
  const totalErrors = overlap + miss + falsePositive;

  el.innerHTML = `
    <div class="stage s8-stage">
      <div class="s8-head">
        <div>
          <div class="eyebrow">错误分析</div>
          <h2>模型错在哪</h2>
        </div>
        <p class="s8-lede">错判集中在相近类之间；弱类的漏判和正常文本的误报是另外两类。</p>
      </div>

      <section class="s8-summary s8-panel">
        <header class="s8-panel-head">
          <h3>测试集错判构成</h3>
          <span>${confusion ? `共 ${int(totalErrors)} 条错判` : '混淆矩阵未提供'}</span>
        </header>
        <div class="s8-stack${confusion ? '' : ' is-hidden'}" role="img" aria-label="错判类型构成">
          <span class="s8-seg s8-seg--overlap" style="width:${totalErrors ? (overlap / totalErrors) * 100 : 0}%"><b>${pct(overlap / Math.max(1, totalErrors))}</b></span>
          <span class="s8-seg s8-seg--miss" style="width:${totalErrors ? (miss / totalErrors) * 100 : 0}%"><b>${pct(miss / Math.max(1, totalErrors))}</b></span>
          <span class="s8-seg s8-seg--fp" style="width:${totalErrors ? (falsePositive / totalErrors) * 100 : 0}%"><b>${pct(falsePositive / Math.max(1, totalErrors))}</b></span>
        </div>
        <div class="s8-legend">
          <span><i class="s8-dot s8-dot--overlap"></i>相近类混淆 ${int(overlap)}</span>
          <span><i class="s8-dot s8-dot--miss"></i>漏判为无风险 ${int(miss)}</span>
          <span><i class="s8-dot s8-dot--fp"></i>误报为诈骗 ${int(falsePositive)}</span>
        </div>
      </section>

      <section class="s8-filters">
        <div class="s8-filter-group">
          <span class="s8-filter-label">真实类别</span>
          <div class="s8-chips" data-filter="class">
            <button class="s8-chip is-active" type="button" data-value="all">全部</button>
            ${CLASS_META.map((meta) => `<button class="s8-chip" type="button" data-value="${meta.id}">${meta.short}</button>`).join('')}
          </div>
        </div>
        <div class="s8-filter-group">
          <span class="s8-filter-label">错误类型</span>
          <div class="s8-chips" data-filter="kind">
            <button class="s8-chip is-active" type="button" data-value="all">全部</button>
            ${(Object.keys(KIND_LABEL) as ErrorKind[]).map((kind) => `<button class="s8-chip" type="button" data-value="${kind}">${KIND_LABEL[kind]}</button>`).join('')}
          </div>
        </div>
      </section>

      <section class="s8-cards-wrap">
        <div class="s8-cards" aria-live="polite"></div>
        <div class="s8-pager">
          <button class="btn btn--ghost btn--small" type="button" data-page="-1">← 上一组</button>
          <span class="s8-page-info"></span>
          <button class="btn btn--ghost btn--small" type="button" data-page="1">下一组 →</button>
        </div>
      </section>
    </div>
  `;

  const cardsHost = el.querySelector('.s8-cards') as HTMLElement;
  const pageInfo = el.querySelector('.s8-page-info') as HTMLElement;
  const prev = el.querySelector('[data-page="-1"]') as HTMLButtonElement;
  const next = el.querySelector('[data-page="1"]') as HTMLButtonElement;
  const stack = el.querySelector('.s8-stack') as HTMLElement;
  const legend = el.querySelector('.s8-legend') as HTMLElement;
  const lede = el.querySelector('.s8-lede') as HTMLElement;

  const errors = data.cases.errors;
  let classFilter = 'all';
  let kindFilter = 'all';
  let page = 0;
  const perPage = 3;

  const filtered = (): ErrorCase[] =>
    errors.filter((item) => {
      const classOk = classFilter === 'all' || String(item.label) === classFilter;
      const kindOk = kindFilter === 'all' || kindOf(item) === kindFilter;
      return classOk && kindOk;
    });

  const renderCards = (): void => {
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / perPage));
    page = Math.min(page, pages - 1);
    cardsHost.replaceChildren();
    const slice = list.slice(page * perPage, page * perPage + perPage);
    if (slice.length === 0) {
      const empty = document.createElement('div');
      empty.className = 's8-empty';
      empty.textContent = '当前筛选下没有样例。';
      cardsHost.appendChild(empty);
    }
    slice.forEach((item) => {
      const card = document.createElement('article');
      card.className = 's8-card';
      const head = document.createElement('div');
      head.className = 's8-card-head';
      head.innerHTML = `<span class="s8-card-id">${item.id}</span>`;
      head.appendChild(createClassChip(item.label, { size: 'sm' }));
      const arrow = document.createElement('span');
      arrow.className = 's8-card-arrow';
      arrow.textContent = '→';
      head.appendChild(arrow);
      head.appendChild(createClassChip(item.pred.label, { size: 'sm' }));
      card.appendChild(head);

      card.appendChild(
        new MessageCard({
          text: item.text,
          turns: item.turns,
          modality: item.modality,
          maxTurns: 8,
          compact: true,
        }).root,
      );

      const foot = document.createElement('div');
      foot.className = 's8-card-foot';
      foot.innerHTML = `<span class="s8-tag s8-tag--${kindOf(item)}">${tagLabel(item.tag)}</span><p>${item.note}</p>`;
      card.appendChild(foot);
      cardsHost.appendChild(card);
    });

    pageInfo.textContent = `${page + 1} / ${pages} · ${list.length} 条`;
    prev.disabled = page <= 0;
    next.disabled = page >= pages - 1;
  };

  el.querySelectorAll<HTMLElement>('.s8-chips').forEach((group) => {
    const filter = group.dataset.filter ?? 'class';
    group.querySelectorAll<HTMLButtonElement>('.s8-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        group.querySelectorAll('.s8-chip').forEach((node) => node.classList.remove('is-active'));
        chip.classList.add('is-active');
        if (filter === 'class') classFilter = chip.dataset.value ?? 'all';
        else kindFilter = chip.dataset.value ?? 'all';
        page = 0;
        renderCards();
      });
    });
  });

  prev.addEventListener('click', () => {
    page = Math.max(0, page - 1);
    renderCards();
  });
  next.addEventListener('click', () => {
    page += 1;
    renderCards();
  });

  renderCards();

  const final = (): void => {
    gsap.set(stack, { opacity: 1 });
    gsap.set(legend, { opacity: 1 });
    gsap.set(lede, { opacity: 1 });
    gsap.set(el.querySelectorAll('.s8-card'), { opacity: 1, y: 0 });
  };

  if (!motion) {
    final();
    return { id: 's8', el, final };
  }

  gsap.set(stack, { opacity: 0 });
  gsap.set(legend, { opacity: 0 });
  gsap.set(lede, { opacity: 0 });
  gsap.set(el.querySelectorAll('.s8-card'), { opacity: 0, y: 16 });

  const build = (tl: gsap.core.Timeline): void => {
    tl.to(lede, { opacity: 1, duration: 0.4 }, 0)
      .to(stack, { opacity: 1, duration: 0.5 }, 0.1)
      .to(legend, { opacity: 1, duration: 0.4 }, 0.3)
      .to(el.querySelectorAll('.s8-card'), { opacity: 1, y: 0, duration: 0.4, stagger: 0.12 }, 0.5);
  };

  void jump;
  return { id: 's8', el, stepLabels: ['step1'], build, final };
}
