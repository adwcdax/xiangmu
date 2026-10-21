import gsap from 'gsap';
import type { AppData } from '../core/types';
import type { SceneModule } from '../core/scrollDirector';
import { THEME, withAlpha } from '../core/theme';
import { pct } from '../core/utils';
import { MessageCard } from '../components/MessageCard';
import { classMeta } from '../core/config';

export function createS5(
  el: HTMLElement,
  data: AppData,
  motion: boolean,
  jump: (id: string) => void,
): SceneModule {
  const shift = data.domainShift;
  const sms = data.cases.demo.find((item) => item.label === 4) ?? data.cases.demo.find((item) => item.pred.p_fraud > 0.9);
  const job = data.cases.out_of_domain[0] ?? null;
  const A = shift.models.find((m) => m.id === 'A') ?? shift.models[0];
  const B = shift.models.find((m) => m.id === 'B') ?? shift.models[1];
  const hasDist = Boolean(shift.score_dist);

  el.innerHTML = `
    <div class="stage s5-stage">
      <div class="s5-head">
        <div>
          <div class="eyebrow">问题三</div>
          <h2>换个场景，还管用吗</h2>
        </div>
        <p class="s5-lede">在电诈语料上判诈骗几乎满分，换到真实招聘帖就接近随机。这是适用域边界，不是模型的 bug。</p>
      </div>

      <div class="s5-grid">
        <section class="s5-worlds">
          <div class="s5-world" data-world="train">
            <div class="s5-world-head"><b>训练见过的世界</b><span>合成语料，话术规整</span></div>
            <div class="s5-card-host s5-card-host--sms"></div>
            <div class="s5-pbar">
              <span class="s5-pbar-label">p_fraud</span>
              <span class="s5-pbar-track"><i class="s5-pbar-fill s5-pbar-fill--fraud" data-p="${sms?.pred.p_fraud ?? 1}"></i></span>
              <b class="s5-pbar-value">${pct(sms?.pred.p_fraud ?? 1)}</b>
            </div>
          </div>

          <div class="s5-world s5-world--real" data-world="real">
            <div class="s5-world-head"><b>真实世界</b><span>${shift.target}</span></div>
            <div class="s5-card-host s5-card-host--job"></div>
            <div class="s5-pbar">
              <span class="s5-pbar-label">p_fraud</span>
              <span class="s5-pbar-track"><i class="s5-pbar-fill s5-pbar-fill--fraud" data-p="${job?.p_fraud ?? 0.97}"></i></span>
              <b class="s5-pbar-value">${pct(job?.p_fraud ?? 0.97)}</b>
            </div>
            <p class="s5-alarm" hidden>正常招聘帖，也被判成诈骗。</p>
          </div>
        </section>

        <section class="s5-test">
          <div class="s5-test-head">
            <h3>跨域检验：${shift.target}</h3>
            <span>正常 ${shift.n_benign.toLocaleString('en-US')} 帖 · 诈骗 ${shift.n_fraud.toLocaleString('en-US')} 帖</span>
          </div>

          <div class="s5-bars">
            ${[A, B]
              .map(
                (m, i) => `
              <div class="s5-group${i === 1 ? ' is-b' : ''}" data-group="${m.id}">
                <div class="s5-group-head"><b>${m.id} · ${m.name}</b><span>区分度 ${(m.gap * 100).toFixed(1)} 个百分点</span></div>
                <div class="s5-bar-row">
                  <span>正常帖误报率</span>
                  <span class="s5-bar-track"><i class="s5-bar-fill s5-bar-fill--fp" data-w="${m.fp_rate * 100}"></i></span>
                  <b>${pct(m.fp_rate)}</b>
                </div>
                <div class="s5-bar-row">
                  <span>诈骗帖召回</span>
                  <span class="s5-bar-track"><i class="s5-bar-fill s5-bar-fill--recall" data-w="${m.recall * 100}"></i></span>
                  <b>${pct(m.recall)}</b>
                </div>
              </div>`,
              )
              .join('')}
          </div>

          <div class="s5-ruler">
            <div class="s5-ruler-head"><span>区分度 = 召回 − 误报率</span><b>0 处为随机水平</b></div>
            <div class="s5-ruler-track">
              <span class="s5-ruler-zero" style="left:50%"></span>
              <span class="s5-ruler-label s5-ruler-label--left">−100</span>
              <span class="s5-ruler-label s5-ruler-label--right">+100</span>
              ${[A, B]
                .map(
                  (m) => `
                <span class="s5-ruler-point s5-ruler-point--${m.id}" style="left:${50 + m.gap * 50}%">
                  <i></i><em>${m.id}</em>
                </span>`,
                )
                .join('')}
            </div>
          </div>

          <div class="s5-dists${hasDist ? '' : ' is-hidden'}">
            ${['A', 'B']
              .map(
                (key) => `
              <div class="s5-dist">
                <div class="s5-dist-head"><b>${key} 模型的 p_fraud 分布</b><span>正常帖 / 诈骗帖</span></div>
                <div class="s5-dist-host" data-dist="${key}"></div>
              </div>`,
              )
              .join('')}
          </div>
        </section>
      </div>

      <div class="s5-conclusion">
        <p>混进真实负样本只是把“这种格式 = 正常”学了进去，连真诈骗一起放行。跨域需要另训模型。</p>
        <span>${shift.history_note}</span>
      </div>
    </div>
  `;

  const smsHost = el.querySelector('.s5-card-host--sms') as HTMLElement;
  const jobHost = el.querySelector('.s5-card-host--job') as HTMLElement;
  if (sms) {
    smsHost.appendChild(
      new MessageCard({
        text: sms.text,
        turns: sms.turns,
        modality: sms.modality,
        cues: sms.cues,
        compact: true,
        badge: false,
      }).root,
    );
  }
  if (job) {
    jobHost.appendChild(
      new MessageCard({
        text: job.text,
        modality: 'sms',
        compact: true,
        badge: false,
      }).root,
    );
  }

  const fills = Array.from(el.querySelectorAll<HTMLElement>('.s5-pbar-fill, .s5-bar-fill'));
  const alarm = el.querySelector('.s5-alarm') as HTMLElement;
  const groups = Array.from(el.querySelectorAll<HTMLElement>('.s5-group'));
  const ruler = el.querySelector('.s5-ruler') as HTMLElement;
  const dists = el.querySelector('.s5-dists') as HTMLElement;
  const conclusion = el.querySelector('.s5-conclusion') as HTMLElement;
  const lede = el.querySelector('.s5-lede') as HTMLElement;
  const worldEls = Array.from(el.querySelectorAll<HTMLElement>('.s5-world'));
  const rulerPoints = Array.from(el.querySelectorAll<HTMLElement>('.s5-ruler-point'));
  alarm.hidden = false;
  gsap.set(alarm, { opacity: 0 });

  const svgNS = 'http://www.w3.org/2000/svg';

  const distChart = (key: 'A' | 'B'): SVGSVGElement => {
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 420 150');
    svg.setAttribute('class', 's5-dist-svg');
    const left = 10;
    const top = 8;
    const w = 400;
    const h = 112;
    const series = shift.score_dist?.[key];
    if (!series) return svg;
    const max = Math.max(1, ...series.benign, ...series.fraud);
    const x = (i: number, n: number): number => left + (i / Math.max(1, n - 1)) * w;
    const y = (v: number): number => top + h - (v / max) * h;

    const baseline = document.createElementNS(svgNS, 'line');
    baseline.setAttribute('x1', String(left));
    baseline.setAttribute('x2', String(left + w));
    baseline.setAttribute('y1', String(top + h));
    baseline.setAttribute('y2', String(top + h));
    baseline.setAttribute('class', 's5-dist-axis');
    svg.appendChild(baseline);

    const drawSeries = (values: number[], cls: string, fill: string): void => {
      const line = values
        .map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i, values.length).toFixed(1)} ${y(v).toFixed(1)}`)
        .join(' ');
      const area = `${line} L ${x(values.length - 1, values.length).toFixed(1)} ${top + h} L ${x(0, values.length).toFixed(1)} ${top + h} Z`;
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', area);
      path.setAttribute('fill', fill);
      path.setAttribute('class', `s5-dist-area ${cls}`);
      svg.appendChild(path);
      const stroke = document.createElementNS(svgNS, 'path');
      stroke.setAttribute('d', line);
      stroke.setAttribute('class', `s5-dist-line ${cls}`);
      svg.appendChild(stroke);
    };

    drawSeries(series.benign, 'is-benign', withAlpha(THEME.benign, 0.16));
    drawSeries(series.fraud, 'is-fraud', withAlpha(THEME.fraud, 0.18));

    ['0', '0.5', '1'].forEach((label, i) => {
      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', String(left + (i / 2) * w));
      text.setAttribute('y', String(top + h + 18));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('class', 's5-dist-tick');
      text.textContent = label;
      svg.appendChild(text);
    });
    return svg;
  };

  if (hasDist) {
    el.querySelectorAll<HTMLElement>('.s5-dist-host').forEach((host) => {
      const key = host.dataset.dist as 'A' | 'B';
      host.appendChild(distChart(key));
    });
  }

  const final = (): void => {
    gsap.set(worldEls, { opacity: 1, y: 0 });
    fills.forEach((fill) => {
      if (fill.classList.contains('s5-pbar-fill')) {
        fill.style.width = `${Number(fill.dataset.p ?? 0) * 100}%`;
      } else {
        fill.style.width = `${Number(fill.dataset.w ?? 0)}%`;
      }
    });
    alarm.hidden = false;
    gsap.set(groups, { opacity: 1, x: 0 });
    gsap.set(ruler, { opacity: 1 });
    gsap.set(rulerPoints, { opacity: 1 });
    gsap.set(dists, { opacity: 1 });
    gsap.set(conclusion, { opacity: 1 });
    gsap.set(lede, { opacity: 1 });
  };

  if (!motion) {
    final();
    return { id: 's5', el, final };
  }

  fills.forEach((fill) => {
    if (fill.classList.contains('s5-pbar-fill')) fill.style.width = '0%';
    else fill.style.width = '0%';
  });
  gsap.set(worldEls, { opacity: 0, y: 18 });
  gsap.set(groups, { opacity: 0, x: 18 });
  gsap.set(ruler, { opacity: 0 });
  gsap.set(rulerPoints, { opacity: 0 });
  gsap.set(dists, { opacity: 0 });
  gsap.set(conclusion, { opacity: 0 });
  gsap.set(lede, { opacity: 0 });

  const build = (tl: gsap.core.Timeline): void => {
    const smsFill = fills.find((f) => f.classList.contains('s5-pbar-fill') && f.closest('[data-world="train"]')) ?? fills[0];
    const jobFill = fills.find((f) => f.classList.contains('s5-pbar-fill') && f.closest('[data-world="real"]')) ?? fills[1];
    const aFills = fills.filter((f) => f.classList.contains('s5-bar-fill') && f.closest('[data-group="A"]'));
    const bFills = fills.filter((f) => f.classList.contains('s5-bar-fill') && f.closest('[data-group="B"]'));

    tl.addLabel('step1', 0)
      .to(worldEls[0], { opacity: 1, y: 0, duration: 0.5 }, 0)
      .to(smsFill, { width: `${Number(smsFill?.dataset.p ?? 1) * 100}%`, duration: 0.8, ease: 'power2.out' }, 0.2)
      .addLabel('step2', 1.1)
      .to(worldEls[1], { opacity: 1, y: 0, duration: 0.5 }, 1.1)
      .to(jobFill, { width: `${Number(jobFill?.dataset.p ?? 0.97) * 100}%`, duration: 0.8, ease: 'power2.out' }, 1.3)
      .to(alarm, { opacity: 1, duration: 0.4 }, 1.9)
      .addLabel('step3', 2.4)
      .to(groups[0], { opacity: 1, x: 0, duration: 0.45 }, 2.4)
      .to(aFills, { width: (_i: number, target: HTMLElement) => `${Number(target.dataset.w ?? 0)}%`, duration: 0.7, stagger: 0.12 }, 2.5)
      .to(ruler, { opacity: 1, duration: 0.35 }, 2.9)
      .to(rulerPoints[0], { opacity: 1, duration: 0.3 }, 3.0)
      .addLabel('step4', 3.5)
      .to(groups[1], { opacity: 1, x: 0, duration: 0.45 }, 3.5)
      .to(bFills, { width: (_i: number, target: HTMLElement) => `${Number(target.dataset.w ?? 0)}%`, duration: 0.7, stagger: 0.12 }, 3.6)
      .to(rulerPoints[1], { opacity: 1, duration: 0.3 }, 3.9)
      .to(dists, { opacity: 1, duration: 0.45 }, 4.1)
      .to(conclusion, { opacity: 1, duration: 0.5 }, 4.3)
      .to(lede, { opacity: 1, duration: 0.5 }, 4.3)
      .to({}, { duration: 1.0 }, 4.9);
  };

  // 结论区可跳回检测台或前往错误分析
  conclusion.addEventListener('click', () => jump('s7'));
  conclusion.setAttribute('role', 'button');
  conclusion.tabIndex = 0;
  conclusion.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') jump('s7');
  });
  void classMeta;

  return { id: 's5', el, stepLabels: ['step1', 'step2', 'step3', 'step4'], build, final };
}
