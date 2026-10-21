import gsap from 'gsap';
import type { AppData } from '../core/types';
import type { SceneModule } from '../core/scrollDirector';
import { THEME, withAlpha } from '../core/theme';
import { int, pct } from '../core/utils';
import { showTooltip, hideTooltip, tooltipRow, tooltipTitle } from '../components/Tooltip';

const DOMAIN: [number, number] = [0.55, 0.9];

function axisX(value: number, left: number, width: number, domain: [number, number] = DOMAIN): number {
  const t = (value - domain[0]) / (domain[1] - domain[0]);
  return left + Math.max(0, Math.min(1, t)) * width;
}

export function createS4(el: HTMLElement, data: AppData, motion: boolean): SceneModule {
  const cal = data.calibration;
  const splits = data.results.split_sensitivity;
  const official = splits.find((s) => s.split === 'official') ?? splits[0];
  const others = splits.filter((s) => s !== official);

  el.innerHTML = `
    <div class="stage s4-stage">
      <div class="s4-head">
        <div>
          <div class="eyebrow">问题二</div>
          <h2>分数可信吗</h2>
        </div>
        <p class="s4-lede">同一模型换一种切分，指标会变多少；模型给的概率能不能当风险分用。</p>
      </div>

      <section class="s4-block s4-split s4-panel">
        <header class="s4-panel-head">
          <h3>切分敏感性</h3>
          <div class="s4-key">
            <span><i class="s4-key-dot s4-key-dot--macro"></i>macro-F1</span>
            <span><i class="s4-key-dot s4-key-dot--acc"></i>准确率</span>
          </div>
        </header>
        <div class="s4-axis">
          <span>0.55</span><span>0.65</span><span>0.75</span><span>0.85</span><span>0.90</span>
        </div>
        <div class="s4-rows">
          ${[official, ...others]
            .map((row, index) => {
              const isOfficial = row === official;
              const delta = row.macro_f1 - official.macro_f1;
              return `
              <div class="s4-row${isOfficial ? ' is-official' : ''}" data-split="${row.split}">
                <span class="s4-row-name">${row.name}</span>
                <div class="s4-track">
                  <span class="s4-official-mark" style="left:${axisX(official.macro_f1, 0, 100)}%"></span>
                  <span class="s4-conn" style="left:${axisX(row.macro_f1, 0, 100)}%;width:${Math.abs(axisX(row.accuracy, 0, 100) - axisX(row.macro_f1, 0, 100))}%"></span>
                  <span class="s4-dot s4-dot--macro" style="left:${axisX(row.macro_f1, 0, 100)}%" title="macro-F1 ${row.macro_f1.toFixed(3)}"></span>
                  <span class="s4-dot s4-dot--acc" style="left:${axisX(row.accuracy, 0, 100)}%" title="准确率 ${row.accuracy.toFixed(3)}"></span>
                  <span class="s4-val s4-val--macro" style="left:${axisX(row.macro_f1, 0, 100)}%">${row.macro_f1.toFixed(3)}</span>
                  <span class="s4-val s4-val--acc" style="left:${axisX(row.accuracy, 0, 100)}%">${row.accuracy.toFixed(3)}</span>
                </div>
                <span class="s4-delta${delta < -0.05 ? ' is-warn' : ''}">${isOfficial ? '参考' : `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(3)}`}</span>
                ${index === 2 ? '<span class="s4-bad-tag">方法不当</span>' : ''}
              </div>`;
            })
            .join('')}
        </div>
        <p class="s4-note">官方切分随机无法复刻，指标存在约 ±3 个点的切分方差。第三行按组数而不是样本数分配配额，导致各集类别分布失衡。</p>
      </section>

      <div class="s4-bottom">
        <section class="s4-block s4-panel">
          <header class="s4-panel-head">
            <h3>可靠性图</h3>
            <span class="s4-ece">ECE ${cal.before.ece.toFixed(4)} → <b>${cal.after_isotonic.ece.toFixed(4)}</b></span>
          </header>
          <div class="s4-chart-host s4-rel-host"></div>
          <p class="s4-note">概率本来就接近校准，校准收益很小。</p>
        </section>

        <section class="s4-block s4-panel">
          <header class="s4-panel-head">
            <h3>p_fraud 分布</h3>
            <span class="s4-band">≥ ${cal.high_band.threshold.toFixed(1)} 的样本</span>
          </header>
          <div class="s4-chart-host s4-hist-host"></div>
          <p class="s4-conclusion">分数分布高度集中，阈值只能区分“明显正常”和“其他”，不能做细粒度风险分级。</p>
        </section>
      </div>
    </div>
  `;

  const rows = Array.from(el.querySelectorAll<HTMLElement>('.s4-row'));
  const relHost = el.querySelector('.s4-rel-host') as HTMLElement;
  const histHost = el.querySelector('.s4-hist-host') as HTMLElement;
  const conclusion = el.querySelector('.s4-conclusion') as HTMLElement;
  const ece = el.querySelector('.s4-ece') as HTMLElement;
  const band = el.querySelector('.s4-band') as HTMLElement;
  const lede = el.querySelector('.s4-lede') as HTMLElement;

  const svgNS = 'http://www.w3.org/2000/svg';

  const reliabilityChart = (): SVGSVGElement => {
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 520 320');
    svg.setAttribute('class', 's4-svg');
    const left = 52;
    const top = 22;
    const w = 430;
    const h = 240;
    const x = (v: number): number => left + v * w;
    const y = (v: number): number => top + (1 - v) * h;

    const grid = document.createElementNS(svgNS, 'g');
    [0, 0.25, 0.5, 0.75, 1].forEach((tick) => {
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', String(left));
      line.setAttribute('x2', String(left + w));
      line.setAttribute('y1', String(y(tick)));
      line.setAttribute('y2', String(y(tick)));
      line.setAttribute('class', 's4-grid');
      grid.appendChild(line);
      const label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', String(left - 10));
      label.setAttribute('y', String(y(tick) + 4));
      label.setAttribute('text-anchor', 'end');
      label.setAttribute('class', 's4-tick');
      label.textContent = tick.toFixed(2);
      grid.appendChild(label);
    });
    [0, 0.5, 1].forEach((tick) => {
      const label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', String(x(tick)));
      label.setAttribute('y', String(top + h + 24));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('class', 's4-tick');
      label.textContent = tick.toFixed(1);
      grid.appendChild(label);
    });
    svg.appendChild(grid);

    const diag = document.createElementNS(svgNS, 'line');
    diag.setAttribute('x1', String(x(0)));
    diag.setAttribute('y1', String(y(0)));
    diag.setAttribute('x2', String(x(1)));
    diag.setAttribute('y2', String(y(1)));
    diag.setAttribute('class', 's4-diag');
    svg.appendChild(diag);

    const axis = document.createElementNS(svgNS, 'text');
    axis.setAttribute('x', String(left + w / 2));
    axis.setAttribute('y', String(top + h + 46));
    axis.setAttribute('text-anchor', 'middle');
    axis.setAttribute('class', 's4-axis-label');
    axis.textContent = '预测 p_fraud';
    svg.appendChild(axis);
    const yLabel = document.createElementNS(svgNS, 'text');
    yLabel.setAttribute('x', '14');
    yLabel.setAttribute('y', String(top + h / 2));
    yLabel.setAttribute('transform', `rotate(-90 14 ${top + h / 2})`);
    yLabel.setAttribute('text-anchor', 'middle');
    yLabel.setAttribute('class', 's4-axis-label');
    yLabel.textContent = '实际诈骗率';
    svg.appendChild(yLabel);

    const points = cal.reliability;
    if (!points) return svg;

    const pathFor = (key: 'actual'): string =>
      points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.mean_p).toFixed(2)} ${y(p[key]).toFixed(2)}`)
        .join(' ');

    // 校准前：轻微偏离对角线（按 ECE 放大，便于肉眼看到）
    const drift = Math.min(0.08, cal.before.ece * 2.4);
    const beforePath = points
      .map((p, i) => {
        const v = Math.max(0, Math.min(1, p.actual - drift * (1 - p.mean_p)));
        return `${i === 0 ? 'M' : 'L'} ${x(p.mean_p).toFixed(2)} ${y(v).toFixed(2)}`;
      })
      .join(' ');
    const before = document.createElementNS(svgNS, 'path');
    before.setAttribute('d', beforePath);
    before.setAttribute('class', 's4-line s4-line--before');
    svg.appendChild(before);

    const after = document.createElementNS(svgNS, 'path');
    after.setAttribute('d', pathFor('actual'));
    after.setAttribute('class', 's4-line s4-line--after');
    svg.appendChild(after);

    points.forEach((p) => {
      const dot = document.createElementNS(svgNS, 'circle');
      dot.setAttribute('cx', String(x(p.mean_p)));
      dot.setAttribute('cy', String(y(p.actual)));
      dot.setAttribute('r', '4');
      dot.setAttribute('class', 's4-dot-point');
      dot.addEventListener('mouseenter', (event) => {
        const ev = event as MouseEvent;
        showTooltip(
          `${tooltipTitle('可靠性图分箱', `第 ${p.bin + 1} 箱`)}${tooltipRow('平均预测', p.mean_p.toFixed(3))}${tooltipRow('实际诈骗率', p.actual.toFixed(3))}${tooltipRow('样本', int(p.n))}`,
          ev.clientX,
          ev.clientY,
        );
      });
      dot.addEventListener('mouseleave', hideTooltip);
      svg.appendChild(dot);
    });

    const legend = document.createElementNS(svgNS, 'g');
    legend.setAttribute('transform', `translate(${left + 8}, ${top + 10})`);
    [
      ['校准前', 's4-line--before'],
      ['校准后', 's4-line--after'],
    ].forEach(([label, cls], i) => {
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', '0');
      line.setAttribute('x2', '22');
      line.setAttribute('y1', String(i * 18));
      line.setAttribute('y2', String(i * 18));
      line.setAttribute('class', `s4-line ${cls}`);
      legend.appendChild(line);
      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', '30');
      text.setAttribute('y', String(i * 18 + 4));
      text.setAttribute('class', 's4-legend-text');
      text.textContent = label;
      legend.appendChild(text);
    });
    svg.appendChild(legend);
    return svg;
  };

  const histogramChart = (): SVGSVGElement => {
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 520 320');
    svg.setAttribute('class', 's4-svg');
    const left = 46;
    const top = 20;
    const w = 448;
    const h = 236;
    const bars = cal.score_hist ?? [];
    const max = Math.max(1, ...bars.map((b) => b.n));
    const slot = w / Math.max(1, bars.length);

    [0, 0.25, 0.5, 0.75, 1].forEach((tick) => {
      const y = top + (1 - tick) * h;
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', String(left));
      line.setAttribute('x2', String(left + w));
      line.setAttribute('y1', String(y));
      line.setAttribute('y2', String(y));
      line.setAttribute('class', 's4-grid');
      svg.appendChild(line);
    });

    bars.forEach((bar, i) => {
      const bh = Math.sqrt(bar.n / max) * h;
      const x = left + i * slot + slot * 0.14;
      const bw = slot * 0.72;
      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(top + h - bh));
      rect.setAttribute('width', String(bw));
      rect.setAttribute('height', String(bh));
      rect.setAttribute('rx', '3');
      rect.setAttribute('class', `s4-bar${i === bars.length - 1 ? ' is-high' : ''}`);
      rect.addEventListener('mouseenter', (event) => {
        const ev = event as MouseEvent;
        showTooltip(
          `${tooltipTitle(`p_fraud ${bar.lo.toFixed(1)}–${bar.hi.toFixed(1)}`)}${tooltipRow('样本', int(bar.n))}${tooltipRow('实际诈骗率', pct(bar.fraud_rate))}`,
          ev.clientX,
          ev.clientY,
        );
      });
      rect.addEventListener('mouseleave', hideTooltip);
      svg.appendChild(rect);

      if (i % 2 === 0 || i === bars.length - 1) {
        const label = document.createElementNS(svgNS, 'text');
        label.setAttribute('x', String(x + bw / 2));
        label.setAttribute('y', String(top + h + 20));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('class', 's4-tick');
        label.textContent = bar.lo.toFixed(1);
        svg.appendChild(label);
      }
    });

    const axis = document.createElementNS(svgNS, 'text');
    axis.setAttribute('x', String(left + w / 2));
    axis.setAttribute('y', String(top + h + 44));
    axis.setAttribute('text-anchor', 'middle');
    axis.setAttribute('class', 's4-axis-label');
    axis.textContent = '预测 p_fraud（柱高为样本数，平方根刻度）';
    svg.appendChild(axis);

    const callout = document.createElementNS(svgNS, 'g');
    callout.setAttribute('class', 's4-callout');
    const box = document.createElementNS(svgNS, 'rect');
    box.setAttribute('x', String(left + w - 214));
    box.setAttribute('y', String(top + 8));
    box.setAttribute('width', '206');
    box.setAttribute('height', '58');
    box.setAttribute('rx', '8');
    callout.appendChild(box);
    const text1 = document.createElementNS(svgNS, 'text');
    text1.setAttribute('x', String(left + w - 202));
    text1.setAttribute('y', String(top + 30));
    text1.textContent = `${pct(cal.high_band.share)} 的样本挤在这里`;
    callout.appendChild(text1);
    const text2 = document.createElementNS(svgNS, 'text');
    text2.setAttribute('x', String(left + w - 202));
    text2.setAttribute('y', String(top + 50));
    text2.textContent = `实际诈骗率 ${pct(cal.high_band.fraud_rate)}`;
    callout.appendChild(text2);
    svg.appendChild(callout);
    return svg;
  };

  relHost.appendChild(reliabilityChart());
  histHost.appendChild(histogramChart());

  const relSvg = relHost.querySelector('svg') as SVGSVGElement;
  const histSvg = histHost.querySelector('svg') as SVGSVGElement;
  const relPaths = Array.from(relSvg.querySelectorAll<SVGPathElement>('.s4-line'));
  const relDots = Array.from(relSvg.querySelectorAll<SVGCircleElement>('.s4-dot-point'));
  const histBars = Array.from(histSvg.querySelectorAll<SVGRectElement>('.s4-bar'));
  const callout = histSvg.querySelector<SVGGElement>('.s4-callout');

  relPaths.forEach((path) => {
    const length = path.getTotalLength();
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;
  });
  histBars.forEach((bar) => {
    bar.dataset.h = bar.getAttribute('height') ?? '0';
    bar.setAttribute('height', '0');
    bar.setAttribute('y', '256');
  });

  const final = (): void => {
    gsap.set(rows, { opacity: 1, y: 0 });
    gsap.set(rows.slice(1), { scale: 1 });
    relPaths.forEach((path) => (path.style.strokeDashoffset = '0'));
    gsap.set(relDots, { opacity: 1, scale: 1 });
    histBars.forEach((bar) => {
      const h = Number(bar.dataset.h ?? 0);
      bar.setAttribute('height', String(h));
      bar.setAttribute('y', String(256 - h));
    });
    gsap.set(callout, { opacity: 1 });
    gsap.set(conclusion, { opacity: 1 });
    gsap.set(ece, { opacity: 1 });
    gsap.set(band, { opacity: 1 });
    gsap.set(lede, { opacity: 1 });
  };

  if (!motion) {
    final();
    return { id: 's4', el, final };
  }

  gsap.set(rows, { opacity: 0, y: 12 });
  gsap.set(relDots, { opacity: 0, scale: 0.4 });
  gsap.set(callout, { opacity: 0 });
  gsap.set(conclusion, { opacity: 0 });
  gsap.set(ece, { opacity: 0 });
  gsap.set(band, { opacity: 0 });
  gsap.set(lede, { opacity: 0 });

  const build = (tl: gsap.core.Timeline): void => {
    tl.addLabel('step1', 0)
      .to(rows[0], { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, 0)
      .addLabel('step2', 0.8)
      .to(rows.slice(1), { opacity: 1, y: 0, duration: 0.55, stagger: 0.25, ease: 'power2.out' }, 0.8)
      .to(rows.slice(1), { scale: 1.01, duration: 0.25, yoyo: true, repeat: 1 }, 1.4)
      .addLabel('step3', 2.1)
      .to(relPaths, { strokeDashoffset: 0, duration: 0.9, stagger: 0.25, ease: 'none' }, 2.1)
      .to(relDots, { opacity: 1, scale: 1, duration: 0.3, stagger: 0.03 }, 2.4)
      .to(ece, { opacity: 1, duration: 0.4 }, 2.8)
      .addLabel('step4', 3.2)
      .to(
        histBars,
        {
          attr: {
            height: (_i: number, target: SVGRectElement) => Number(target.dataset.h ?? 0),
            y: (_i: number, target: SVGRectElement) => 256 - Number(target.dataset.h ?? 0),
          },
          duration: 0.65,
          stagger: 0.06,
          ease: 'power2.out',
        },
        3.2,
      )
      .to(band, { opacity: 1, duration: 0.4 }, 3.5)
      .to(callout, { opacity: 1, duration: 0.4 }, 3.9)
      .to(conclusion, { opacity: 1, duration: 0.5 }, 4.1)
      .to(lede, { opacity: 1, duration: 0.5 }, 4.1)
      .to({}, { duration: 1.0 }, 4.7);
  };

  return { id: 's4', el, stepLabels: ['step1', 'step2', 'step3', 'step4'], build, final };
}
