import gsap from 'gsap';
import type { AppData, RaceDealer } from '../core/types';
import type { SceneModule } from '../core/scrollDirector';
import { CONFIG, classMeta } from '../core/config';
import { int, pct } from '../core/utils';
import { MessageCard } from '../components/MessageCard';
import { showTooltip, hideTooltip, tooltipRow, tooltipTitle } from '../components/Tooltip';

interface Lane {
  dealer: RaceDealer;
  root: HTMLElement;
  piles: HTMLElement[];
  counts: number[];
  summary: HTMLElement;
  errors: HTMLElement;
  cards: HTMLElement[];
}

function truthOf(dealer: RaceDealer, label: number): number {
  return dealer.mode === 'binary' ? (label === 0 ? 0 : 1) : label;
}

function predOf(dealer: RaceDealer, i: number): number | null {
  const pred = dealer.preds[i];
  return pred === 'unparsed' ? null : pred;
}

export function createS6(el: HTMLElement, data: AppData, motion: boolean): SceneModule {
  const trace = data.race;
  const deck = trace?.deck ?? null;
  const dealers = trace?.dealers ?? [];

  el.innerHTML = `
    <div class="stage s6-stage">
      <div class="s6-head">
        <div>
          <div class="eyebrow">分拣赛</div>
          <h2>一张牌，分进 ${dealers[0]?.mode === 'binary' ? '2 / 10' : '10'} 堆</h2>
        </div>
        <p class="s6-lede">同一个模型、同一批 100 张抽样：二分类读法几乎不出错，十分类读法错牌明显更多。</p>
      </div>
      <div class="s6-board">
        <div class="s6-lanes">
          ${dealers
            .map(
              (dealer, laneIndex) => `
            <section class="s6-lane" data-lane="${laneIndex}">
              <header class="s6-lane-head">
                <div>
                  <b>${dealer.mode === 'binary' ? '二分类读法' : '十分类读法'}</b>
                  <span>${dealer.mode === 'binary' ? '无风险 / 诈骗 两堆' : '10 类手法，2 行 × 5 列'}</span>
                </div>
                <span class="s6-summary" data-summary="${laneIndex}">等待发牌</span>
              </header>
              <div class="s6-piles s6-piles--${dealer.mode === 'binary' ? 'binary' : 'multi'}" data-piles="${laneIndex}"></div>
              <div class="s6-errors" data-errors="${laneIndex}" hidden></div>
            </section>`,
            )
            .join('')}
        </div>
        <div class="s6-deck" aria-hidden="true">
          <span class="s6-deck-count">100</span>
          <span class="s6-deck-label">张抽样</span>
        </div>
        <div class="s6-flight" aria-hidden="true"></div>
      </div>
      <div class="s6-foot">
        <span>100 张抽样，仅供观感，正式指标见问题一。</span>
        <span>回放已有预测，不是现场推理。</span>
        <span>${trace?.measure_env ?? ''}</span>
      </div>
      <aside class="s6-panel" hidden>
        <button class="s6-panel-close" type="button" aria-label="关闭样例">×</button>
        <div class="s6-panel-head"><b>错牌样例</b><span>已脱敏</span></div>
        <div class="s6-panel-body"></div>
      </aside>
    </div>
  `;

  const lanes: Lane[] = [];
  const flightLayer = el.querySelector('.s6-flight') as HTMLElement;
  const deckEl = el.querySelector('.s6-deck') as HTMLElement;
  const panel = el.querySelector('.s6-panel') as HTMLElement;
  const panelBody = el.querySelector('.s6-panel-body') as HTMLElement;
  const panelClose = el.querySelector('.s6-panel-close') as HTMLButtonElement;
  const lede = el.querySelector('.s6-lede') as HTMLElement;
  const foot = el.querySelector('.s6-foot') as HTMLElement;

  const closePanel = (): void => {
    panel.hidden = true;
  };
  panelClose.addEventListener('click', closePanel);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePanel();
  });

  dealers.forEach((dealer, laneIndex) => {
    const root = el.querySelector<HTMLElement>(`.s6-lane[data-lane="${laneIndex}"]`)!;
    const pileHost = el.querySelector<HTMLElement>(`[data-piles="${laneIndex}"]`)!;
    const piles: HTMLElement[] = [];
    const counts: number[] = [];

    if (dealer.mode === 'binary') {
      [
        { id: 0, name: '无风险' },
        { id: 1, name: '诈骗' },
      ].forEach((pile) => {
        const node = document.createElement('div');
        node.className = 's6-pile s6-pile--binary';
        node.dataset.pile = String(pile.id);
        node.innerHTML = `<span class="s6-pile-name">${pile.name}</span><b class="s6-pile-count">0</b>`;
        pileHost.appendChild(node);
        piles.push(node);
        counts.push(0);
      });
    } else {
      for (let id = 0; id < 10; id++) {
        const meta = classMeta(id);
        const node = document.createElement('div');
        node.className = 's6-pile';
        node.dataset.pile = String(id);
        node.style.setProperty('--pile-rgb', meta.rgb);
        node.innerHTML = `<span class="s6-pile-name">${meta.short}</span><b class="s6-pile-count">0</b>`;
        pileHost.appendChild(node);
        piles.push(node);
        counts.push(0);
      }
    }

    lanes.push({
      dealer,
      root,
      piles,
      counts,
      summary: el.querySelector<HTMLElement>(`[data-summary="${laneIndex}"]`)!,
      errors: el.querySelector<HTMLElement>(`[data-errors="${laneIndex}"]`)!,
      cards: [],
    });
  });

  const cardFor = (lane: Lane, index: number): HTMLElement => {
    const card = document.createElement('div');
    card.className = `s6-card s6-card--${deck?.modality[index] ?? 'sms'}`;
    card.innerHTML = `<i class="s6-card-icon" aria-hidden="true"></i><span class="s6-card-line"></span><span class="s6-card-line s6-card-line--short"></span><i class="s6-card-truth" style="background:${classMeta(deck?.labels[index] ?? 0).color}"></i>`;
    const label = deck?.labels[index] ?? 0;
    const pred = predOf(lane.dealer, index);
    const truth = truthOf(lane.dealer, label);
    const wrong = pred === null || pred !== truth;
    if (wrong) card.classList.add('is-wrong');
    card.addEventListener('mouseenter', (event) => {
      const ev = event as MouseEvent;
      showTooltip(
        `${tooltipTitle(`第 ${index + 1} 张`, `真实 ${classMeta(label).short}`)}${tooltipRow('预测', pred === null ? '未解析' : lane.dealer.mode === 'binary' ? (pred === 0 ? '无风险' : '诈骗') : classMeta(pred).short)}${tooltipRow('模态', deck?.modality[index] === 'dialog' ? '对话' : '短信')}`,
        ev.clientX,
        ev.clientY,
      );
    });
    card.addEventListener('mouseleave', hideTooltip);
    if (wrong) {
      card.addEventListener('click', () => openSample(index, lane, pred));
    }
    return card;
  };

  const openSample = (index: number, lane: Lane, pred: number | null): void => {
    const label = deck?.labels[index] ?? 0;
    panelBody.replaceChildren();
    const head = document.createElement('div');
    head.className = 's6-panel-verdict';
    head.innerHTML = `<span>真实 ${classMeta(label).short}</span><span>→</span><span>${pred === null ? '未解析' : lane.dealer.mode === 'binary' ? (pred === 0 ? '无风险' : '诈骗') : classMeta(pred).short}</span>`;
    panelBody.appendChild(head);
    panelBody.appendChild(
      new MessageCard({
        text: deck?.texts[index] ?? '',
        modality: deck?.modality[index] ?? 'sms',
        compact: true,
      }).root,
    );
    panel.hidden = false;
  };

  const reset = (): void => {
    flightLayer.replaceChildren();
    lanes.forEach((lane) => {
      lane.counts.fill(0);
      lane.piles.forEach((pile) => {
        pile.classList.remove('is-active');
        const count = pile.querySelector<HTMLElement>('.s6-pile-count');
        if (count) count.textContent = '0';
      });
      lane.summary.textContent = '等待发牌';
      lane.errors.hidden = true;
      lane.errors.replaceChildren();
    });
  };

  const settleLane = (lane: Lane): void => {
    const wrong = lane.dealer.preds.reduce<number>((acc, pred, i) => {
      const truth = truthOf(lane.dealer, deck?.labels[i] ?? 0);
      return acc + (pred === 'unparsed' || pred !== truth ? 1 : 0);
    }, 0);
    const total = lane.dealer.preds.length;
    lane.summary.textContent = `错牌 ${wrong} / ${total} · 准确率 ${pct((total - wrong) / Math.max(1, total))}`;

    const groups = new Map<string, { truth: number; pred: number; count: number }>();
    lane.dealer.preds.forEach((pred, i) => {
      const label = deck?.labels[i] ?? 0;
      const truth = truthOf(lane.dealer, label);
      if (pred === 'unparsed' || pred !== truth) {
        const key = `${truth}-${String(pred)}`;
        const item = groups.get(key) ?? { truth, pred: pred === 'unparsed' ? -1 : pred, count: 0 };
        item.count += 1;
        groups.set(key, item);
      }
    });

    const sorted = [...groups.values()].sort((a, b) => b.count - a.count);
    lane.errors.hidden = sorted.length === 0;
    lane.errors.replaceChildren();
    const title = document.createElement('span');
    title.className = 's6-errors-title';
    title.textContent = '错牌盘';
    lane.errors.appendChild(title);
    sorted.slice(0, 6).forEach((group) => {
      const chip = document.createElement('span');
      chip.className = 's6-error-chip';
      const truth = lane.dealer.mode === 'binary' ? (group.truth === 0 ? '无风险' : '诈骗') : classMeta(group.truth).short;
      const pred = group.pred < 0 ? '未解析' : lane.dealer.mode === 'binary' ? (group.pred === 0 ? '无风险' : '诈骗') : classMeta(group.pred).short;
      chip.textContent = `${truth} → ${pred} ×${group.count}`;
      lane.errors.appendChild(chip);
    });
    if (sorted.length > 6) {
      const more = document.createElement('span');
      more.className = 's6-error-chip s6-error-chip--more';
      more.textContent = `+${sorted.length - 6} 组`;
      lane.errors.appendChild(more);
    }
  };

  const settle = (): void => {
    lanes.forEach((lane) => {
      lane.cards.forEach((card) => card.remove());
      lane.cards = [];
      lane.piles.forEach((pile) => {
        pile.classList.remove('is-active');
        const count = pile.querySelector<HTMLElement>('.s6-pile-count');
        if (count) count.textContent = String(lane.counts[Number(pile.dataset.pile)] ?? 0);
      });
      settleLane(lane);
    });
    flightLayer.replaceChildren();
    gsap.set(foot, { opacity: 1 });
  };

  let timers: number[] = [];
  let running = false;

  const clearTimers = (): void => {
    timers.forEach((id) => window.clearTimeout(id));
    timers = [];
  };

  const startRace = (): void => {
    if (running || !deck) return;
    running = true;
    reset();
    const deckRect = deckEl.getBoundingClientRect();
    const flightRect = flightLayer.getBoundingClientRect();
    const interval = 42;
    const flightMs = 420;

    deck.labels.forEach((_, index) => {
      lanes.forEach((lane) => {
        const pred = predOf(lane.dealer, index);
        const truth = truthOf(lane.dealer, deck.labels[index]);
        const pileIndex = pred === null ? 0 : pred;
        const pile = lane.piles[pileIndex];
        if (!pile) return;
        const id = window.setTimeout(() => {
          const card = cardFor(lane, index);
          const rect = pile.getBoundingClientRect();
          const targetX = rect.left + rect.width / 2 - 24 - flightRect.left;
          const targetY = rect.top + rect.height / 2 - 33 - flightRect.top;
          card.style.left = `${deckRect.left + deckRect.width / 2 - 24 - flightRect.left}px`;
          card.style.top = `${deckRect.top + deckRect.height / 2 - 33 - flightRect.top}px`;
          flightLayer.appendChild(card);
          lane.cards.push(card);
          gsap.to(card, {
            x: targetX,
            y: targetY,
            scale: 0.72,
            rotation: (index % 2 === 0 ? -1 : 1) * (4 + (index % 5)),
            duration: flightMs / 1000,
            ease: 'power2.inOut',
            onComplete: () => {
              card.remove();
              const idx = lane.cards.indexOf(card);
              if (idx >= 0) lane.cards.splice(idx, 1);
              lane.counts[pileIndex] = (lane.counts[pileIndex] ?? 0) + 1;
              const count = pile.querySelector<HTMLElement>('.s6-pile-count');
              if (count) count.textContent = String(lane.counts[pileIndex]);
              pile.classList.add('is-active');
              window.setTimeout(() => pile.classList.remove('is-active'), 120);
              if (pred === null || pred !== truth) {
                const landed = cardFor(lane, index);
                landed.classList.add('is-landed');
                landed.style.left = `${rect.left - flightRect.left + (lane.counts[pileIndex] % 4) * 3}px`;
                landed.style.top = `${rect.top - flightRect.top - Math.min(26, lane.counts[pileIndex] * 1.6)}px`;
                flightLayer.appendChild(landed);
                window.setTimeout(() => landed.remove(), 650);
              }
            },
          });
        }, index * interval + (lane.dealer.mode === 'binary' ? 0 : 14));
        timers.push(id);
      });
    });

    const finish = window.setTimeout(() => {
      settle();
      running = false;
    }, deck.labels.length * interval + flightMs + 260);
    timers.push(finish);
  };

  const final = (): void => {
    clearTimers();
    running = false;
    lanes.forEach((lane) => {
      lane.counts.fill(0);
      lane.dealer.preds.forEach((pred) => {
        const idx = pred === 'unparsed' ? 0 : pred;
        if (idx >= 0) lane.counts[idx] = (lane.counts[idx] ?? 0) + 1;
      });
    });
    settle();
    gsap.set(lede, { opacity: 1 });
  };

  if (!motion) {
    final();
    return { id: 's6', el, final };
  }

  gsap.set(lede, { opacity: 0 });
  gsap.set(foot, { opacity: 0 });

  const build = (tl: gsap.core.Timeline): void => {
    tl.addLabel('step1', 0)
      .to(lede, { opacity: 1, duration: 0.4 }, 0)
      .from(lanes.map((lane) => lane.root), { opacity: 0, y: 20, duration: 0.5, stagger: 0.2, ease: 'power2.out' }, 0)
      .addLabel('step2', 1.2)
      .call(() => startRace(), undefined, 1.2)
      .to({}, { duration: 5.2 }, 1.2)
      .addLabel('step3', 6.5)
      .call(() => settle(), undefined, 6.5)
      .to({}, { duration: 1.4 }, 6.6);
  };

  return {
    id: 's6',
    el,
    stepLabels: ['step1', 'step2', 'step3'],
    build,
    final,
    deactivate: clearTimers,
    destroy: () => {
      clearTimers();
      hideTooltip();
    },
  };
}
