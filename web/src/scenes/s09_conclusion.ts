import gsap from 'gsap';
import type { AppData } from '../core/types';
import type { SceneModule } from '../core/scrollDirector';
import {
  DATA_SOURCE_NOTE,
  LIMITATIONS,
  TEAM,
  USABILITY,
  VERDICT_LABEL,
  classMeta,
} from '../core/config';
import { int, pct } from '../core/utils';

export function createS9(el: HTMLElement, data: AppData, motion: boolean): SceneModule {
  const test = data.results.models.find((m) => m.id === 'fasttext')?.test ?? null;
  const perClass = test?.per_class ?? [];
  const weak = perClass.filter((m) => m.f1 < 0.65).sort((a, b) => a.f1 - b.f1);
  const strong = perClass.filter((m) => m.f1 >= 0.8).map((m) => m.f1);
  const weakValues = weak.map((m) => m.f1);
  const splits = data.results.split_sensitivity;
  const official = splits.find((s) => s.split === 'official') ?? splits[0];
  const quota = splits.find((s) => s.split === 'quota_stratified') ?? splits[1];
  const delta = (official?.macro_f1 ?? 0) - (quota?.macro_f1 ?? 0);
  const cal = data.calibration;
  const shiftA = data.domainShift.models.find((m) => m.id === 'A') ?? data.domainShift.models[0];

  const vars: Record<string, string> = {
    accuracy: (test?.accuracy ?? 0).toFixed(3),
    top2: (test?.top2_accuracy ?? 0).toFixed(3),
    strongRange: strong.length ? `${Math.min(...strong).toFixed(2)} 至 ${Math.max(...strong).toFixed(2)}` : '—',
    weakRange: weakValues.length ? `${Math.min(...weakValues).toFixed(2)} 至 ${Math.max(...weakValues).toFixed(2)}` : '—',
    fraudF1: (test?.binary.fraud_f1 ?? 0).toFixed(3),
    fpRate: pct(shiftA?.fp_rate ?? 0),
    gap: ((shiftA?.gap ?? 0) * 100).toFixed(1),
  };

  const fill = (template: string): string =>
    template.replace(/\{(\w+)\}/g, (_match, key: string) => vars[key] ?? `{${key}}`);

  const verdictIcon = (verdict: string): string => {
    if (verdict === 'usable') return '<i class="s9-verdict-icon is-usable" aria-hidden="true">✓</i>';
    if (verdict === 'verify') return '<i class="s9-verdict-icon is-verify" aria-hidden="true">!</i>';
    return '<i class="s9-verdict-icon is-unusable" aria-hidden="true">×</i>';
  };

  el.innerHTML = `
    <div class="stage s9-stage">
      <div class="s9-head">
        <div>
          <div class="eyebrow">结论</div>
          <h2>它能用在哪，不能用在哪儿</h2>
        </div>
        <p class="s9-lede">三个问题的答案，合成一张可用性矩阵。结论由项目组给出，数字读评估结果。</p>
      </div>

      <div class="s9-q-grid">
        <article class="s9-q">
          <span class="s9-q-num">Q1</span>
          <h3>判得准不准</h3>
          <p>判是否诈骗，欺诈 F1 <b>${(test?.binary.fraud_f1 ?? 0).toFixed(3)}</b>；判是哪一类，macro-F1 <b>${(test?.macro_f1.value ?? 0).toFixed(3)}</b>。</p>
          <p class="s9-q-sub">弱类：${weak.map((m) => classMeta(m.id).short).join('、') || '无'}。</p>
        </article>
        <article class="s9-q">
          <span class="s9-q-num">Q2</span>
          <h3>分数稳不稳</h3>
          <p>换一种切分，macro-F1 变化 <b>−${delta.toFixed(3)}</b>；概率已校准（ECE ${cal.after_isotonic.ece.toFixed(4)}），但 <b>${pct(cal.high_band.share)}</b> 的样本挤在 ≥ ${cal.high_band.threshold.toFixed(1)}。</p>
          <p class="s9-q-sub">阈值只能区分“明显正常”和“其他”。</p>
        </article>
        <article class="s9-q">
          <span class="s9-q-num">Q3</span>
          <h3>出了域还灵不灵</h3>
          <p>在真实招聘帖上区分度只有 <b>${((shiftA?.gap ?? 0) * 100).toFixed(1)}</b> 个百分点，适用域仅限中文电诈文本。</p>
          <p class="s9-q-sub">历史实验：${data.domainShift.history_note}。</p>
        </article>
      </div>

      <section class="s9-matrix s9-panel">
        <header class="s9-panel-head">
          <h3>可用性矩阵</h3>
          <span>判断结论为人写，依据读数据</span>
        </header>
        <table class="s9-table">
          <caption class="sr-only">场景可用性判断</caption>
          <thead>
            <tr><th scope="col">场景</th><th scope="col">判断</th><th scope="col">依据</th></tr>
          </thead>
          <tbody>
            ${USABILITY.map(
              (row) => `
              <tr>
                <th scope="row">${row.scene}</th>
                <td><span class="s9-verdict s9-verdict--${row.verdict}">${verdictIcon(row.verdict)}${VERDICT_LABEL[row.verdict]}</span></td>
                <td>${fill(row.basis)}</td>
              </tr>`,
            ).join('')}
          </tbody>
        </table>
      </section>

      <section class="s9-limits">
        <h3>局限</h3>
        <ul>${LIMITATIONS.map((item) => `<li>${item}</li>`).join('')}</ul>
      </section>

      <footer class="s9-foot">
        <div class="s9-foot-main">
          <span>${DATA_SOURCE_NOTE}</span>
          <span>sha256 ${(data.dataset.integrity.source_sha256 ?? '').slice(0, 16) || '—'}</span>
          <span>提交 ${data.meta.git_commit ?? '未提供'}</span>
          <span>冻结 ${data.meta.frozen_at ?? '未提供'}</span>
          <span>测试集 ${int(test?.n ?? 0)} 条</span>
        </div>
        <div class="s9-team">
          ${TEAM.map((member) => `<span><b>${member.name}</b>${member.role}</span>`).join('')}
        </div>
      </footer>
    </div>
  `;

  const qCards = Array.from(el.querySelectorAll<HTMLElement>('.s9-q'));
  const matrix = el.querySelector('.s9-matrix') as HTMLElement;
  const limits = el.querySelector('.s9-limits') as HTMLElement;
  const foot = el.querySelector('.s9-foot') as HTMLElement;
  const lede = el.querySelector('.s9-lede') as HTMLElement;
  const rows = Array.from(el.querySelectorAll<HTMLElement>('.s9-table tbody tr'));

  const final = (): void => {
    gsap.set([lede, matrix, limits, foot], { opacity: 1, y: 0 });
    gsap.set(qCards, { opacity: 1, y: 0 });
    gsap.set(rows, { opacity: 1, x: 0 });
  };

  if (!motion) {
    final();
    return { id: 's9', el, final };
  }

  gsap.set(lede, { opacity: 0 });
  gsap.set(qCards, { opacity: 0, y: 16 });
  gsap.set(matrix, { opacity: 0, y: 16 });
  gsap.set(limits, { opacity: 0, y: 16 });
  gsap.set(foot, { opacity: 0, y: 16 });
  gsap.set(rows, { opacity: 0, x: 14 });

  const build = (tl: gsap.core.Timeline): void => {
    tl.to(lede, { opacity: 1, duration: 0.4 }, 0)
      .to(qCards, { opacity: 1, y: 0, duration: 0.5, stagger: 0.15 }, 0.1)
      .to(matrix, { opacity: 1, y: 0, duration: 0.5 }, 0.6)
      .to(rows, { opacity: 1, x: 0, duration: 0.3, stagger: 0.06 }, 0.8)
      .to(limits, { opacity: 1, y: 0, duration: 0.4 }, 1.3)
      .to(foot, { opacity: 1, y: 0, duration: 0.4 }, 1.5);
  };

  return { id: 's9', el, stepLabels: ['step1'], build, final };
}
