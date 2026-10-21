import gsap from 'gsap';
import type { AppData } from '../core/types';
import type { SceneModule } from '../core/scrollDirector';
import { classMeta } from '../core/config';
import { ProbBar } from '../components/ProbBar';

const SAMPLE = '您的快递在运输途中丢失，请添加客服办理理赔。';

export function createS2(el: HTMLElement, data: AppData, motion: boolean): SceneModule {
  const model = data.results.models.find((m) => m.id === 'fasttext') ?? data.results.models[0];
  const demo = data.cases.demo.find((item) => item.label === 4) ?? data.cases.demo[0];
  const topK = demo?.pred.top_k ?? [];
  const pFraud = demo?.pred.p_fraud ?? 0.99;
  const label = demo?.pred.label ?? 4;

  const cost = model?.cost;
  const trainCount = data.dataset.splits.train.rows;
  const foot = cost
    ? `训练 ${cost.train_seconds.toFixed(1)} 秒（${(trainCount / 10000).toFixed(1)} 万条，${cost.threads} 线程）· 模型 ${cost.model_size_mb.toFixed(1)} MB`
    : '训练耗时与模型体积未提供';

  const chars = Array.from(SAMPLE);

  el.innerHTML = `
    <div class="stage s2-stage">
      <div class="s2-head">
        <div class="eyebrow">流程</div>
        <h2>从一条文本，到 10 个概率</h2>
        <p class="s2-sub">逐字切分后送进 fastText，输出 10 类概率；同一组概率有两种读法。</p>
      </div>
      <div class="s2-flow">
        <section class="s2-station s2-station--source">
          <div class="s2-step">01</div>
          <h3>原文</h3>
          <p class="s2-text">${SAMPLE}</p>
          <span class="s2-note">短信 / 对话原文，保留口语与错别字</span>
        </section>

        <section class="s2-station s2-station--chars">
          <div class="s2-step">02</div>
          <h3>逐字切分</h3>
          <div class="s2-chars">${chars
            .map((ch, i) => `<span class="s2-char" data-i="${i}">${ch === ' ' ? '␣' : ch}</span>`)
            .join('')}</div>
          <span class="s2-note">短信里口语、错别字、拼音缩写多，分词反而引入噪声。</span>
        </section>

        <section class="s2-station s2-station--model">
          <div class="s2-step">03</div>
          <h3>fastText</h3>
          <div class="s2-model-box">
            <span class="s2-token">字</span>
            <span class="s2-token">2-gram</span>
            <span class="s2-arrow" aria-hidden="true">→</span>
            <span class="s2-token s2-token--accent">向量</span>
            <span class="s2-arrow" aria-hidden="true">→</span>
            <span class="s2-token s2-token--ink">10 类</span>
          </div>
          <span class="s2-note">${model?.name ?? 'fastText（逐字 + 2-gram）'}，单模型同时输出 10 类。</span>
        </section>

        <section class="s2-station s2-station--prob">
          <div class="s2-step">04</div>
          <h3>10 类概率</h3>
          <div class="s2-prob-host"></div>
        </section>

        <section class="s2-station s2-station--read">
          <div class="s2-step">05</div>
          <h3>两种读法</h3>
          <div class="s2-read">
            <div class="s2-read-item">
              <span class="s2-read-tag">读法 A</span>
              <b>取最大的一类</b>
              <span>10 类标签</span>
              <em>→ ${classMeta(label).short}</em>
            </div>
            <div class="s2-read-item">
              <span class="s2-read-tag">读法 B</span>
              <b>1 − p(无风险)</b>
              <span>p_fraud = ${(pFraud * 100).toFixed(1)}%</span>
              <em>→ 阈值 0.50 → 疑似诈骗</em>
            </div>
          </div>
        </section>
      </div>
      <div class="s2-foot">${foot}</div>
    </div>
  `;

  const probHost = el.querySelector('.s2-prob-host') as HTMLElement;
  const prob = new ProbBar({
    topK,
    weakIds: new Set(data.results.models[0]?.test?.per_class.filter((m) => m.f1 < 0.65).map((m) => m.id) ?? []),
    animate: motion,
    compact: true,
  });
  probHost.appendChild(prob.root);

  const stations = Array.from(el.querySelectorAll<HTMLElement>('.s2-station'));
  const charEls = Array.from(el.querySelectorAll<HTMLElement>('.s2-char'));
  const readItems = Array.from(el.querySelectorAll<HTMLElement>('.s2-read-item'));
  const footEl = el.querySelector('.s2-foot') as HTMLElement;

  const final = (): void => {
    gsap.set(stations, { opacity: 1, y: 0 });
    gsap.set(charEls, { opacity: 1, y: 0 });
    gsap.set(readItems, { opacity: 1, x: 0 });
    gsap.set(footEl, { opacity: 1 });
  };

  if (!motion) {
    final();
    return { id: 's2', el, final };
  }

  gsap.set(stations, { opacity: 0, y: 18 });
  gsap.set(charEls, { opacity: 0, y: 6 });
  gsap.set(readItems, { opacity: 0, x: 14 });
  gsap.set(footEl, { opacity: 0 });

  const build = (tl: gsap.core.Timeline): void => {
    tl.addLabel('step1', 0)
      .to(stations.slice(0, 4), { opacity: 1, y: 0, duration: 0.5, stagger: 0.16, ease: 'power2.out' }, 0)
      .to(charEls, { opacity: 1, y: 0, duration: 0.2, stagger: 0.018 }, 0.5)
      .addLabel('step2', 1.5)
      .to(stations[4], { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, 1.5)
      .to(readItems, { opacity: 1, x: 0, duration: 0.45, stagger: 0.2 }, 1.9)
      .to(footEl, { opacity: 1, duration: 0.4 }, 2.4)
      .to({}, { duration: 1.2 }, 2.6);
  };

  return { id: 's2', el, stepLabels: ['step1', 'step2'], build, final };
}
