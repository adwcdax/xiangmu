import gsap from 'gsap';
import type { AppData, ModelTest } from '../core/types';
import type { SceneModule } from '../core/scrollDirector';
import { CLASS_META, CONFIG, classMeta, gapConclusion } from '../core/config';
import { THEME, withAlpha } from '../core/theme';
import { int, pct } from '../core/utils';
import { showTooltip, hideTooltip, tooltipRow, tooltipTitle } from '../components/Tooltip';

interface Flow {
  from: number;
  to: number;
  count: number;
  share: number;
}

function heatBin(value: number): number {
  if (value <= 0.0005) return 0;
  if (value < 0.01) return 1;
  if (value < 0.1) return 2;
  if (value < 0.4) return 3;
  return 4;
}

function pickFlows(test: ModelTest): Flow[] {
  if (!test.confusion) return [];
  const candidates: [number, number][] = [
    [7, 1],
    [4, 2],
    [3, 4],
  ];
  const flows: Flow[] = candidates
    .map(([from, to]) => {
      const row = test.confusion![from] ?? [];
      const count = row[to] ?? 0;
      const sum = row.reduce((a, b) => a + b, 0);
      return { from, to, count, share: sum > 0 ? count / sum : 0 };
    })
    .filter((flow) => flow.count > 0)
    .sort((a, b) => b.count - a.count);
  if (flows.length > 0) return flows.slice(0, 3);

  const all: Flow[] = [];
  test.confusion.forEach((row, from) => {
    const sum = row.reduce((a, b) => a + b, 0);
    row.forEach((count, to) => {
      if (from !== to && count > 0) all.push({ from, to, count, share: sum > 0 ? count / sum : 0 });
    });
  });
  return all.sort((a, b) => b.count - a.count).slice(0, 3);
}

export function createS3(
  el: HTMLElement,
  data: AppData,
  motion: boolean,
  jump: (id: string) => void,
): SceneModule {
  const model = data.results.models.find((m) => m.id === 'fasttext') ?? data.results.models[0];
  const test = model?.test ?? null;
  const perClass = test?.per_class ?? [];
  const weakIds = new Set(perClass.filter((m) => m.f1 < CONFIG.f1Bands.medium).map((m) => m.id));
  const fraudF1 = test?.binary.fraud_f1 ?? 0;
  const binaryAcc = test?.binary.accuracy ?? 0;
  const macroF1 = test?.macro_f1.value ?? 0;
  const acc = test?.accuracy ?? 0;
  const top2 = test?.top2_accuracy ?? 0;
  const gap = fraudF1 - macroF1;
  const sorted = [...perClass].sort((a, b) => b.f1 - a.f1);
  const flows = test ? pickFlows(test) : [];
  const hasConfusion = Boolean(test?.confusion);

  const strongRange = (() => {
    const strong = perClass.filter((m) => m.f1 >= CONFIG.f1Bands.strong).map((m) => m.f1);
    return strong.length ? `${Math.min(...strong).toFixed(2)} 至 ${Math.max(...strong).toFixed(2)}` : '—';
  })();

  el.innerHTML = `
    <div class="stage s3-stage">
      <div class="s3-head">
        <div>
          <div class="eyebrow">问题一</div>
          <h2>判是否诈骗容易，判是哪一类难得多</h2>
        </div>
        <p class="s3-lede">同一个模型，两种读法：${gapConclusion(gap)}</p>
      </div>
      <div class="s3-grid">
        <section class="s3-heat s3-panel">
          <header class="s3-panel-head">
            <h3>${hasConfusion ? '混淆矩阵' : 'Top 混淆流向'}</h3>
            <span>${hasConfusion ? '行归一化 · 真实 → 预测' : '仅含每类前三的混淆'}</span>
          </header>
          <div class="s3-heat-host"></div>
          <div class="s3-flow-list">
            ${flows
              .map(
                (flow, i) => `
              <button class="s3-flow" type="button" data-flow="${i}">
                <span class="s3-flow-pair">${classMeta(flow.from).short} → ${classMeta(flow.to).short}</span>
                <b>${int(flow.count)} 条</b>
                <span>占 ${classMeta(flow.from).short} 的 ${pct(flow.share)}</span>
              </button>`,
              )
              .join('')}
          </div>
          <div class="s3-heat-legend" aria-hidden="true">
            <span>0%</span>
            ${THEME.heat.map((color) => `<i style="background:${color}"></i>`).join('')}
            <span>100%</span>
          </div>
        </section>

        <div class="s3-right">
          <section class="s3-metrics s3-panel">
            <div class="s3-metric-row">
              <div class="s3-metric s3-metric--fraud">
                <span class="s3-metric-label">是不是诈骗</span>
                <b class="s3-metric-value" data-metric="fraudF1">0.000</b>
                <span class="s3-metric-sub">欺诈 F1 · 二分类准确率 ${binaryAcc.toFixed(3)}</span>
              </div>
              <div class="s3-gap" aria-label="落差 ${gap.toFixed(2)}">
                <span class="s3-gap-line" aria-hidden="true"></span>
                <b class="s3-gap-value">−${gap.toFixed(2)}</b>
              </div>
              <div class="s3-metric s3-metric--class">
                <span class="s3-metric-label">是哪一类</span>
                <b class="s3-metric-value" data-metric="macroF1">0.000</b>
                <span class="s3-metric-sub">macro-F1 · 准确率 ${acc.toFixed(3)} · top-2 ${top2.toFixed(3)}</span>
              </div>
            </div>

            <div class="s3-baseline">
              <div class="s3-baseline-head"><span>准确率基线</span><b>0 → 1</b></div>
              <div class="s3-baseline-track">
                ${data.results.baselines
                  .map(
                    (b) => `
                  <span class="s3-base-point" data-acc="${b.accuracy}" style="left:${(b.accuracy * 100).toFixed(2)}%">
                    <i aria-hidden="true"></i><em>${b.name} ${b.accuracy.toFixed(3)}</em>
                  </span>`,
                  )
                  .join('')}
                <span class="s3-base-point s3-base-point--model" data-acc="${acc}" style="left:${(acc * 100).toFixed(2)}%">
                  <i aria-hidden="true"></i><em>fastText ${acc.toFixed(3)}</em>
                </span>
              </div>
              <p class="s3-baseline-note">准确率 ${acc.toFixed(3)} 看着不高，但瞎猜最多只有 ${(data.results.baselines[0]?.accuracy ?? 0.396).toFixed(3)}。</p>
            </div>
          </section>

          <section class="s3-f1 s3-panel">
            <header class="s3-panel-head">
              <h3>逐类 F1</h3>
              <span>浅色叠层为 top-2 准确率 · 强类 ${strongRange}</span>
            </header>
            <div class="s3-f1-bands" aria-hidden="true">
              <span class="s3-band s3-band--strong">强 ≥ 0.80</span>
              <span class="s3-band s3-band--medium">中 0.65–0.80</span>
              <span class="s3-band s3-band--weak">弱 &lt; 0.65</span>
            </div>
            <div class="s3-f1-rows">
              ${sorted
                .map((m) => {
                  const meta = classMeta(m.id);
                  const weak = m.f1 < CONFIG.f1Bands.medium;
                  return `
                  <div class="s3-f1-row${weak ? ' is-weak' : ''}" data-class="${m.id}">
                    <span class="s3-f1-name"><i style="background:${meta.color}"></i>${meta.short}</span>
                    <span class="s3-f1-track">
                      <span class="s3-f1-top2" style="width:${(m.top2 * 100).toFixed(2)}%"></span>
                      <span class="s3-f1-fill" style="width:0%;background:${meta.color}" data-f1="${m.f1}"></span>
                    </span>
                    <b class="s3-f1-value">${m.f1.toFixed(3)}</b>
                    <span class="s3-f1-support">n=${int(m.support)}</span>
                    ${weak ? '<span class="s3-f1-tag">不可单独采信</span>' : ''}
                  </div>`;
                })
                .join('')}
            </div>
          </section>
        </div>
      </div>
      <p class="s3-conclusion">弱类的漏判分散在多个相近类上，说明话术本身重叠，不是某一类被系统性吞掉。</p>
    </div>
  `;

  const heatHost = el.querySelector('.s3-heat-host') as HTMLElement;
  const heatSection = el.querySelector('.s3-heat') as HTMLElement;
  const metricValues = Array.from(el.querySelectorAll<HTMLElement>('.s3-metric-value'));
  const gapEl = el.querySelector('.s3-gap') as HTMLElement;
  const baseline = el.querySelector('.s3-baseline') as HTMLElement;
  const basePoints = Array.from(el.querySelectorAll<HTMLElement>('.s3-base-point'));
  const f1Section = el.querySelector('.s3-f1') as HTMLElement;
  const f1Rows = Array.from(el.querySelectorAll<HTMLElement>('.s3-f1-row'));
  const fills = Array.from(el.querySelectorAll<HTMLElement>('.s3-f1-fill'));
  const conclusion = el.querySelector('.s3-conclusion') as HTMLElement;
  const flowEls = Array.from(el.querySelectorAll<HTMLElement>('.s3-flow'));
  const lede = el.querySelector('.s3-lede') as HTMLElement;

  // 混淆矩阵
  const cellEls: HTMLElement[][] = [];
  if (test?.confusion) {
    const grid = document.createElement('div');
    grid.className = 's3-heat-grid';
    const corner = document.createElement('div');
    corner.className = 's3-heat-corner';
    corner.textContent = '真实 ↓ / 预测 →';
    grid.appendChild(corner);
    CLASS_META.forEach((meta) => {
      const head = document.createElement('div');
      head.className = 's3-heat-col';
      head.innerHTML = `<span>${meta.short}</span>`;
      grid.appendChild(head);
    });
    test.confusion.forEach((row, from) => {
      const rowHead = document.createElement('div');
      rowHead.className = 's3-heat-row';
      rowHead.dataset.class = String(from);
      rowHead.innerHTML = `<i style="background:${classMeta(from).color}"></i><span>${classMeta(from).short}</span>`;
      grid.appendChild(rowHead);
      const rowSum = row.reduce((a, b) => a + b, 0);
      const cells: HTMLElement[] = [];
      row.forEach((count, to) => {
        const value = rowSum > 0 ? count / rowSum : 0;
        const bin = heatBin(value);
        const cell = document.createElement('div');
        cell.className = `s3-heat-cell${from === to ? ' is-diagonal' : ''}`;
        cell.dataset.from = String(from);
        cell.dataset.to = String(to);
        cell.style.background = THEME.heat[bin];
        cell.style.color = bin >= 3 ? THEME.bg1 : THEME.text2;
        cell.textContent = value >= 0.01 ? `${Math.round(value * 100)}` : '';
        cell.addEventListener('mouseenter', (event) => {
          const ev = event as MouseEvent;
          showTooltip(
            `${tooltipTitle(`真实 ${classMeta(from).short} → 预测 ${classMeta(to).short}`)}${tooltipRow('数量', `${int(count)} 条`)}${tooltipRow('占该类', pct(value))}`,
            ev.clientX,
            ev.clientY,
            { maxWidth: 240 },
          );
          highlight(from, to);
        });
        cell.addEventListener('mouseleave', () => {
          hideTooltip();
          clearHighlight();
        });
        grid.appendChild(cell);
        cells.push(cell);
      });
      cellEls.push(cells);
    });
    heatHost.appendChild(grid);
  } else {
    const top = test?.top_confusions ?? {};
    const list = document.createElement('div');
    list.className = 's3-topconf';
    Object.entries(top).forEach(([from, targets]) => {
      Object.entries(targets)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .forEach(([to, count]) => {
          const item = document.createElement('div');
          item.className = 's3-topconf-row';
          item.innerHTML = `<span>${classMeta(Number(from)).short} → ${classMeta(Number(to)).short}</span><b>${int(count)}</b>`;
          list.appendChild(item);
        });
    });
    heatHost.appendChild(list);
  }

  const clearHighlight = (): void => {
    heatSection.querySelectorAll('.is-flow, .is-row, .is-col').forEach((node) => node.classList.remove('is-flow', 'is-row', 'is-col'));
    flowEls.forEach((node) => node.classList.remove('is-active'));
  };

  const highlight = (from: number, to: number): void => {
    if (!cellEls.length) return;
    clearHighlight();
    cellEls[from]?.forEach((cell) => {
      if (Number(cell.dataset.to) === to) cell.classList.add('is-flow');
      else cell.classList.add('is-row');
    });
    cellEls.forEach((row) => {
      const cell = row[to];
      if (cell && Number(cell.dataset.from) !== from) cell.classList.add('is-col');
    });
  };

  const focusFlow = (index: number): void => {
    const flow = flows[index];
    if (!flow) return;
    highlight(flow.from, flow.to);
    flowEls.forEach((node, i) => node.classList.toggle('is-active', i === index));
  };

  flowEls.forEach((node) => {
    node.addEventListener('click', () => focusFlow(Number(node.dataset.flow)));
  });

  const counters = { fraudF1: 0, macroF1: 0 };
  let timelineDuration = 0;
  const renderMetrics = (): void => {
    metricValues.forEach((node) => {
      const key = node.dataset.metric as keyof typeof counters;
      node.textContent = (counters[key] ?? 0).toFixed(3);
    });
  };

  const final = (): void => {
    counters.fraudF1 = fraudF1;
    counters.macroF1 = macroF1;
    renderMetrics();
    gsap.set(metricValues, { opacity: 1, y: 0 });
    gsap.set(gapEl, { opacity: 1, scale: 1 });
    gsap.set(basePoints, { opacity: 1, y: 0 });
    gsap.set(fills, { width: (_i: number, target: HTMLElement) => `${Number(target.dataset.f1 ?? 0) * 100}%` });
    gsap.set(f1Rows, { opacity: 1, x: 0 });
    gsap.set(heatSection, { opacity: 1 });
    gsap.set(f1Section, { opacity: 1 });
    gsap.set(baseline, { opacity: 1 });
    gsap.set(conclusion, { opacity: 1 });
    gsap.set(lede, { opacity: 1 });
    flows.forEach((_, i) => flowEls[i]?.classList.add('is-active'));
    if (flows[0]) highlight(flows[0].from, flows[0].to);
  };

  if (!motion) {
    final();
    return { id: 's3', el, final };
  }

  gsap.set(metricValues, { opacity: 0, y: 14 });
  gsap.set(gapEl, { opacity: 0, scale: 0.7 });
  gsap.set(basePoints, { opacity: 0, y: -8 });
  gsap.set(fills, { width: '0%' });
  gsap.set(f1Rows, { opacity: 0, x: 18 });
  gsap.set(heatSection, { opacity: 0 });
  gsap.set(f1Section, { opacity: 0 });
  gsap.set(baseline, { opacity: 0 });
  gsap.set(conclusion, { opacity: 0 });
  gsap.set(lede, { opacity: 0 });

  const build = (tl: gsap.core.Timeline): void => {
    tl.addLabel('step1', 0)
      .to(metricValues, { opacity: 1, y: 0, duration: 0.4, stagger: 0.25 }, 0)
      .to(counters, { fraudF1, duration: 1.0, ease: 'power1.out', onUpdate: renderMetrics }, 0.1)
      .to(counters, { macroF1, duration: 1.0, ease: 'power1.out', onUpdate: renderMetrics }, 0.45)
      .to(gapEl, { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(2)' }, 1.2)
      .addLabel('step2', 1.6)
      .to(baseline, { opacity: 1, duration: 0.3 }, 1.6)
      .to(basePoints, { opacity: 1, y: 0, duration: 0.35, stagger: 0.18 }, 1.7)
      .addLabel('step3', 2.6)
      .to(f1Section, { opacity: 1, duration: 0.3 }, 2.6)
      .to(f1Rows, { opacity: 1, x: 0, duration: 0.3, stagger: 0.06 }, 2.65)
      .to(
        fills,
        {
          width: (_i: number, target: HTMLElement) => `${Number(target.dataset.f1 ?? 0) * 100}%`,
          duration: 0.8,
          stagger: 0.05,
          ease: 'power2.out',
        },
        2.8,
      )
      .addLabel('step4', 4.2)
      .to(heatSection, { opacity: 1, duration: 0.5 }, 4.2)
      .call(() => focusFlow(0), undefined, 4.8)
      .call(() => focusFlow(1), undefined, 5.5)
      .call(() => focusFlow(2), undefined, 6.2)
      .addLabel('step5', 6.9)
      .to(conclusion, { opacity: 1, duration: 0.5 }, 6.9)
      .to(lede, { opacity: 1, duration: 0.5 }, 6.9)
      .to({}, { duration: 1.2 }, 7.4);
    timelineDuration = tl.duration();
  };

  return {
    id: 's3',
    el,
    stepLabels: ['step1', 'step2', 'step3', 'step4', 'step5'],
    build,
    onProgress: (progress) => {
      if (timelineDuration <= 0) return;
      const time = progress * timelineDuration;
      const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
      counters.fraudF1 = fraudF1 * easeOut(Math.min(1, Math.max(0, (time - 0.1) / 1.0)));
      counters.macroF1 = macroF1 * easeOut(Math.min(1, Math.max(0, (time - 0.45) / 1.0)));
      renderMetrics();
    },
    final,
  };
}
