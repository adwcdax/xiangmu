import gsap from 'gsap';
import type { AppData } from '../core/types';
import type { SceneModule } from '../core/scrollDirector';
import { CLASS_META, CONFIG, classMeta } from '../core/config';
import { clamp, int, mulberry32, pct } from '../core/utils';
import { THEME, withAlpha } from '../core/theme';
import { appendDataTable } from '../components/DataTable';

interface Dot {
  cls: number;
  sms: boolean;
  split: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3: number;
  y3: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ClusterLabel {
  cls: number;
  x: number;
  y: number;
  r: number;
  count: number;
}

const SMALL = new Set([7, 8, 9]);

function dotCount(total: number): number {
  return Math.max(1, Math.ceil(total / CONFIG.pointsPerDot));
}

/** 按类别总量分配点数（最大余数法，保证总数精确）。 */
function allocate(counts: number[], total: number): number[] {
  const raw = counts.map((n) => (n / Math.max(1, total)) * dotCount(total));
  const base = raw.map((n) => Math.floor(n));
  let left = dotCount(total) - base.reduce((a, b) => a + b, 0);
  const order = raw.map((n, i) => ({ i, frac: n - Math.floor(n) })).sort((a, b) => b.frac - a.frac);
  let k = 0;
  while (left > 0) {
    base[order[k % order.length].i] += 1;
    left -= 1;
    k += 1;
  }
  return base;
}

export function createS1(el: HTMLElement, data: AppData, motion: boolean): SceneModule {
  const ds = data.dataset;
  const classes = [...ds.classes].sort((a, b) => a.id - b.id);
  const total = Math.max(1, ds.total);
  const dotsN = dotCount(total);
  const perClass = allocate(classes.map((c) => c.total), total);

  const maxTotal = Math.max(...classes.map((c) => c.total));
  const minTotal = Math.min(...classes.map((c) => c.total));
  const ratio = maxTotal / Math.max(1, minTotal);

  el.innerHTML = `
    <div class="stage s1-stage">
      <div class="s1-head">
        <div>
          <div class="eyebrow">数据</div>
          <h2>35 万条，10 类手法</h2>
        </div>
        <div class="s1-counters">
          <div class="s1-counter"><span>文本总数</span><b class="s1-total">0</b></div>
          <div class="s1-counter"><span>类别</span><b>${classes.length}</b></div>
          <div class="s1-counter"><span>短信 / 对话</span><b>${int(ds.modality.sms)} / ${int(ds.modality.dialog)}</b></div>
        </div>
      </div>
      <div class="s1-canvas-wrap">
        <canvas class="s1-canvas" aria-label="35 万条文本的点阵：每点代表 50 条，按类别与模态分布"></canvas>
        <div class="s1-legend"><span><i></i>1 点 = ${CONFIG.pointsPerDot} 条</span></div>
        <div class="s1-ratio" hidden>
          <b>×${ratio.toFixed(1)}</b>
          <span>最大类 ${classMeta(classes.reduce((a, b) => (a.total > b.total ? a : b)).id).short} ${int(maxTotal)} 条<br />最小类 ${classMeta(classes.reduce((a, b) => (a.total < b.total ? a : b)).id).short} ${int(minTotal)} 条</span>
        </div>
        <div class="s1-checks" hidden>
          <div class="s1-check"><i class="is-ok" aria-hidden="true">✓</i><span>零重复：重复率 ${pct(ds.integrity.duplicate_rate)}</span></div>
          <div class="s1-check"><i class="is-ok" aria-hidden="true">✓</i><span>案件组不跨切分：${ds.integrity.cross_split_groups} 组</span></div>
          <div class="s1-check"><i class="is-ok" aria-hidden="true">✓</i><span>切分规则：${ds.splits.rule}</span></div>
        </div>
      </div>
      <div class="s1-caption">
        <div class="s1-copy is-active" data-copy="0"><b>35 万条</b><span>短信和对话各约一半，来自 ${ds.splits.rule}。</span></div>
        <div class="s1-copy" data-copy="1"><b>10 类，极不均衡</b><span>最大类是最小类的 ${ratio.toFixed(1)} 倍；婚恋交友、网黑、军警购物样本最少。</span></div>
        <div class="s1-copy" data-copy="2"><b>两种模态</b><span>短信 ${pct(ds.modality.sms / total)}，对话 ${pct(ds.modality.dialog / total)}。${ds.modality_by_class ? '' : '按类的模态分布未提供。'}</span></div>
        <div class="s1-copy" data-copy="3"><b>官方切分，零重复</b><span>训练 ${int(ds.splits.train.rows)} · 验证 ${int(ds.splits.dev.rows)} · 测试 ${int(ds.splits.test.rows)}；测试集只用于最终评估。</span></div>
      </div>
      <p class="s1-domain-note">语料为合成 / 半合成，话术比真实报案更规整。</p>
    </div>
  `;

  const wrap = el.querySelector('.s1-canvas-wrap') as HTMLElement;
  const canvas = el.querySelector('.s1-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const totalEl = el.querySelector('.s1-total') as HTMLElement;
  const ratioEl = el.querySelector('.s1-ratio') as HTMLElement;
  const checksEl = el.querySelector('.s1-checks') as HTMLElement;
  const copies = Array.from(el.querySelectorAll<HTMLElement>('.s1-copy'));
  const legend = el.querySelector('.s1-legend') as HTMLElement;
  const domainNote = el.querySelector('.s1-domain-note') as HTMLElement;

  appendDataTable(domainNote, {
    caption: '类别与切分（dataset.json）',
    columns: ['类别', '全名', '总数', '训练', '验证', '测试'],
    rows: classes.map((c) => [
      c.short,
      c.name,
      int(c.total),
      int(ds.splits.train.class_counts[c.id] ?? 0),
      int(ds.splits.dev.class_counts[c.id] ?? 0),
      int(ds.splits.test.class_counts[c.id] ?? 0),
    ]),
  });

  let W = 900;
  let H = 560;
  let dots: Dot[] = [];
  let classLabels: ClusterLabel[] = [];
  let smsLabels: ClusterLabel[] = [];
  let dialogLabels: ClusterLabel[] = [];
  let trainRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  let devRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  let testRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  let raf = 0;
  let dirty = true;
  let resizeTimer = 0;

  const state = { reveal: 0, color: 0, modality: 0, split: 0, highlight: 0 };
  const counter = { value: 0 };
  let counterEnd = 0;

  const renderTotal = (): void => {
    totalEl.textContent = int(Math.round(counter.value));
  };

  const schedule = (): void => {
    dirty = true;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!dirty) return;
      dirty = false;
      draw();
    });
  };

  const discPositions = (n: number, cx: number, cy: number, radius: number, rng: () => number): { x: number; y: number }[] => {
    const out: { x: number; y: number }[] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / Math.max(1, n);
      const r = radius * Math.sqrt(t) * (0.94 + rng() * 0.1);
      const a = i * golden + rng() * 0.12;
      out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.86 });
    }
    return out;
  };

  const gridPositions = (n: number, rect: Rect, topPad: number): { x: number; y: number }[] => {
    const w = Math.max(1, rect.w - 24);
    const h = Math.max(1, rect.h - topPad - 16);
    const aspect = w / h;
    const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, n) * aspect)));
    const rows = Math.max(1, Math.ceil(n / cols));
    const sx = cols > 1 ? w / (cols - 1) : 0;
    const sy = rows > 1 ? h / (rows - 1) : 0;
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      out.push({
        x: rect.x + 12 + (i % cols) * sx,
        y: rect.y + topPad + Math.floor(i / cols) * sy,
      });
    }
    return out;
  };

  const layout = (): void => {
    const rect = wrap.getBoundingClientRect();
    W = Math.max(480, Math.round(rect.width));
    H = Math.max(300, Math.round(rect.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const rng = mulberry32(20261021);
    const pad = 18;
    const topPad = 26;
    const area = { x: pad, y: topPad, w: W - pad * 2, h: H - topPad - pad };

    // 1) 初始网格
    const base = gridPositions(dotsN, area, 0);

    // 2) 类别簇：5 × 2
    const cols = 5;
    const rows = 2;
    const cellW = area.w / cols;
    const cellH = area.h / rows;
    const classCenters: { x: number; y: number; r: number }[] = [];
    classes.forEach((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = area.x + cellW * (col + 0.5);
      const cy = area.y + cellH * (row + 0.55);
      const r = Math.max(18, Math.min(cellW, cellH) * 0.4 * Math.sqrt(c.total / maxTotal));
      classCenters.push({ x: cx, y: cy, r });
    });

    // 3) 模态：左右两半，每半 5 × 2
    const smsArea = { x: area.x, y: area.y, w: area.w * 0.48, h: area.h };
    const dialogArea = { x: area.x + area.w * 0.52, y: area.y, w: area.w * 0.48, h: area.h };
    const smsCenters: { x: number; y: number; r: number }[] = [];
    const dialogCenters: { x: number; y: number; r: number }[] = [];
    const smsCounts = classes.map((c) => ds.modality_by_class?.sms[c.id] ?? 0);
    const dialogCounts = classes.map((c) => ds.modality_by_class?.dialog[c.id] ?? 0);
    const maxSms = Math.max(1, ...smsCounts);
    const maxDialog = Math.max(1, ...dialogCounts);
    classes.forEach((_, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const sw = smsArea.w / cols;
      const sh = smsArea.h / rows;
      smsCenters.push({
        x: smsArea.x + sw * (col + 0.5),
        y: smsArea.y + sh * (row + 0.56),
        r: Math.max(10, Math.min(sw, sh) * 0.4 * Math.sqrt(smsCounts[i] / maxSms)),
      });
      const dw = dialogArea.w / cols;
      const dh = dialogArea.h / rows;
      dialogCenters.push({
        x: dialogArea.x + dw * (col + 0.5),
        y: dialogArea.y + dh * (row + 0.56),
        r: Math.max(10, Math.min(dw, dh) * 0.4 * Math.sqrt(dialogCounts[i] / maxDialog)),
      });
    });

    // 4) 切分区域
    const gap = 14;
    const trainW = (area.w - gap) * 0.62;
    const rightW = area.w - gap - trainW;
    trainRect = { x: area.x, y: area.y, w: trainW, h: area.h };
    const halfH = (area.h - gap) / 2;
    devRect = { x: area.x + trainW + gap, y: area.y, w: rightW, h: halfH };
    testRect = { x: area.x + trainW + gap, y: area.y + halfH + gap, w: rightW, h: halfH };

    // 5) 生成点
    dots = [];
    const smsShares = classes.map((c) => {
      const m = ds.modality_by_class;
      if (!m) return ds.modality.sms / Math.max(1, ds.total);
      const s = m.sms[c.id] ?? 0;
      const d = m.dialog[c.id] ?? 0;
      return s + d > 0 ? s / (s + d) : 0.5;
    });

    classes.forEach((c, ci) => {
      const n = perClass[ci];
      const clsPos = discPositions(n, classCenters[ci].x, classCenters[ci].y, classCenters[ci].r, rng);
      const smsN = Math.round(n * smsShares[ci]);
      const smsPos = discPositions(smsN, smsCenters[ci].x, smsCenters[ci].y, smsCenters[ci].r, rng);
      const dialogPos = discPositions(n - smsN, dialogCenters[ci].x, dialogCenters[ci].y, dialogCenters[ci].r, rng);
      for (let i = 0; i < n; i++) {
        const sms = i < smsN;
        const mp = sms ? smsPos[i] : dialogPos[i - smsN];
        dots.push({
          cls: c.id,
          sms,
          split: 0,
          x0: base[dots.length]?.x ?? area.x,
          y0: base[dots.length]?.y ?? area.y,
          x1: clsPos[i].x,
          y1: clsPos[i].y,
          x2: mp?.x ?? clsPos[i].x,
          y2: mp?.y ?? clsPos[i].y,
          x3: 0,
          y3: 0,
        });
      }
    });

    // 6) 切分目标位置：按类别顺序铺进三个区域
    const splitRects = [trainRect, devRect, testRect];
    const splitCounts = [ds.splits.train.class_counts, ds.splits.dev.class_counts, ds.splits.test.class_counts];
    const bySplit: Dot[][] = [[], [], []];
    // 先按类分组，再按该类在三个切分中的占比分配点数
    classes.forEach((c, ci) => {
      const group = dots.filter((d) => d.cls === c.id);
      const counts = splitCounts.map((arr) => Math.max(0, arr[c.id] ?? 0));
      const sum = counts.reduce((a, b) => a + b, 0);
      let assigned = 0;
      counts.forEach((count, si) => {
        const n = si === 2 ? group.length - assigned : Math.round((group.length * count) / Math.max(1, sum));
        for (let i = 0; i < n && assigned < group.length; i++) {
          const dot = group[assigned++];
          dot.split = si;
          bySplit[si].push(dot);
        }
      });
      while (assigned < group.length) {
        const dot = group[assigned++];
        dot.split = 0;
        bySplit[0].push(dot);
      }
      void ci;
    });
    bySplit.forEach((group, si) => {
      const pos = gridPositions(group.length, splitRects[si], 40);
      group.forEach((dot, i) => {
        dot.x3 = pos[i]?.x ?? splitRects[si].x;
        dot.y3 = pos[i]?.y ?? splitRects[si].y;
      });
    });

    classLabels = classes.map((c, i) => ({
      cls: c.id,
      x: classCenters[i].x,
      y: classCenters[i].y,
      r: classCenters[i].r,
      count: c.total,
    }));
    smsLabels = classes.map((c, i) => ({ cls: c.id, x: smsCenters[i].x, y: smsCenters[i].y, r: smsCenters[i].r, count: smsCounts[i] }));
    dialogLabels = classes.map((c, i) => ({ cls: c.id, x: dialogCenters[i].x, y: dialogCenters[i].y, r: dialogCenters[i].r, count: dialogCounts[i] }));

    schedule();
  };

  const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const dotPos = (d: Dot): { x: number; y: number } => {
    const c = ease(state.color);
    const m = ease(state.modality);
    const s = ease(state.split);
    let x = d.x0 + (d.x1 - d.x0) * c;
    let y = d.y0 + (d.y1 - d.y0) * c;
    x += (d.x2 - x) * m;
    y += (d.y2 - y) * m;
    x += (d.x3 - x) * s;
    y += (d.y3 - y) * s;
    return { x, y };
  };

  const labelAt = (x: number, y: number, text: string, color: string, size: number, weight = '600'): void => {
    ctx.font = `${weight} ${size}px Inter, "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    const w = ctx.measureText(text).width;
    ctx.fillStyle = withAlpha(THEME.bg1, 0.92);
    ctx.beginPath();
    ctx.roundRect(x - w / 2 - 5, y - size, w + 10, size + 6, 4);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(text, x, y + 1);
    ctx.textAlign = 'left';
  };

  const draw = (): void => {
    ctx.clearRect(0, 0, W, H);

    const colorMix = ease(state.color);
    const splitAlpha = ease(state.split);
    const modalityAlpha = ease(state.modality);

    if (splitAlpha > 0.02) {
      const regions: { rect: Rect; label: string; rows: number }[] = [
        { rect: trainRect, label: '训练集', rows: ds.splits.train.rows },
        { rect: devRect, label: '验证集', rows: ds.splits.dev.rows },
        { rect: testRect, label: '测试集', rows: ds.splits.test.rows },
      ];
      regions.forEach((region) => {
        ctx.save();
        ctx.globalAlpha = splitAlpha;
        ctx.strokeStyle = withAlpha(THEME.ink, 0.16);
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(region.rect.x, region.rect.y, region.rect.w, region.rect.h);
        ctx.setLineDash([]);
        ctx.fillStyle = THEME.textDim;
        ctx.font = '600 15px Inter, "PingFang SC", sans-serif';
        ctx.fillText(region.label, region.rect.x + 10, region.rect.y + 22);
        ctx.fillStyle = THEME.text;
        ctx.font = '700 17px Inter, sans-serif';
        ctx.fillText(int(region.rows), region.rect.x + 10, region.rect.y + 43);
        ctx.restore();
      });
    }

    if (modalityAlpha > 0.02 && splitAlpha < 0.4) {
      ctx.save();
      ctx.globalAlpha = modalityAlpha;
      ctx.fillStyle = THEME.textDim;
      ctx.font = '600 16px Inter, "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('短信', smsLabels[0] ? smsLabels[0].x : W * 0.25, 18);
      ctx.fillText('对话', dialogLabels[0] ? dialogLabels[0].x : W * 0.75, 18);
      ctx.textAlign = 'left';
      ctx.strokeStyle = withAlpha(THEME.ink, 0.12);
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(W * 0.5, 8);
      ctx.lineTo(W * 0.5, H - 8);
      ctx.stroke();
      ctx.restore();
    }

    const alpha = state.reveal >= 0.999 ? 1 : clamp(state.reveal * 1.4, 0, 1);
    for (const d of dots) {
      if (alpha <= 0.01) continue;
      const pos = dotPos(d);
      const color = classMeta(d.cls).color;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = colorMix < 0.01 ? THEME.bg4 : withAlpha(color, 0.86);
      const size = colorMix > 0.6 ? 3.4 : 2.6;
      ctx.fillRect(pos.x - size / 2, pos.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;

    if (colorMix > 0.45 && splitAlpha < 0.45) {
      ctx.save();
      ctx.globalAlpha = colorMix * (1 - splitAlpha);
      if (modalityAlpha > 0.45) {
        smsLabels.forEach((l) => {
          if (l.count <= 0) return;
          labelAt(l.x, l.y - l.r - 6, classMeta(l.cls).short, THEME.textDim, 12, '500');
        });
        dialogLabels.forEach((l) => {
          if (l.count <= 0) return;
          labelAt(l.x, l.y - l.r - 6, classMeta(l.cls).short, THEME.textDim, 12, '500');
        });
      } else {
        classLabels.forEach((l) => {
          labelAt(l.x, l.y - l.r - 8, `${classMeta(l.cls).short} ${int(l.count)}`, THEME.text, 13, '600');
        });
      }
      ctx.restore();
    }

    if (state.highlight > 0.02 && colorMix > 0.5) {
      ctx.save();
      ctx.globalAlpha = state.highlight;
      classLabels
        .filter((l) => SMALL.has(l.cls))
        .forEach((l) => {
          ctx.beginPath();
          ctx.arc(l.x, l.y, l.r + 7, 0, Math.PI * 2);
          ctx.strokeStyle = THEME.warn;
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        });
      ctx.restore();
    }
  };

  const setCopy = (index: number): void => {
    copies.forEach((node, i) => node.classList.toggle('is-active', i === Math.min(index, copies.length - 1)));
    ratioEl.hidden = index < 1;
    checksEl.hidden = index < 3;
    legend.hidden = false;
  };

  const final = (): void => {
    state.reveal = 1;
    state.color = 1;
    state.modality = 1;
    state.split = 1;
    state.highlight = 1;
    counter.value = total;
    renderTotal();
    copies.forEach((node) => node.classList.add('is-active'));
    ratioEl.hidden = false;
    checksEl.hidden = false;
    schedule();
  };

  const build = (tl: gsap.core.Timeline): void => {
    tl.addLabel('step1', 0)
      .to(state, { reveal: 1, duration: 1.2, ease: 'none', onUpdate: schedule }, 0)
      .to(counter, { value: total, duration: 1.4, ease: 'power1.out', onUpdate: renderTotal }, 0)
      .addLabel('step2', 1.5)
      .to(state, { color: 1, duration: 1.6, ease: 'power2.inOut', onUpdate: schedule }, 1.5)
      .to(state, { highlight: 1, duration: 0.5, ease: 'sine.out', onUpdate: schedule }, 2.7)
      .to({}, { duration: 0.6 }, 3.1)
      .addLabel('step3', 3.5)
      .to(state, { modality: 1, duration: 1.8, ease: 'power2.inOut', onUpdate: schedule }, 3.5)
      .addLabel('step4', 5.6)
      .to(state, { split: 1, duration: 2.0, ease: 'power2.inOut', onUpdate: schedule }, 5.6)
      .to({}, { duration: 1.0 }, 7.6);
    counterEnd = 1.4 / Math.max(0.001, tl.duration());
  };

  const ro = new ResizeObserver(() => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      layout();
      if (!motion) final();
    }, 120);
  });
  ro.observe(wrap);

  if (!motion) {
    requestAnimationFrame(() => {
      layout();
      final();
    });
    return { id: 's1', el, final, destroy: () => ro.disconnect() };
  }

  requestAnimationFrame(() => {
    layout();
    schedule();
  });

  return {
    id: 's1',
    el,
    stepLabels: ['step1', 'step2', 'step3', 'step4'],
    build,
    onProgress: (progress) => {
      if (counterEnd <= 0) return;
      const t = Math.min(1, Math.max(0, progress / counterEnd));
      const eased = 1 - (1 - t) * (1 - t);
      counter.value = total * eased;
      renderTotal();
    },
    onStep: setCopy,
    final,
    destroy: () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    },
  };
}
