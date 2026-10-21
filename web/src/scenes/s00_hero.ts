import gsap from 'gsap';
import type { AppData, DemoCase } from '../core/types';
import type { SceneModule } from '../core/scrollDirector';
import { CLASS_META, classMeta } from '../core/config';
import { MessageCard } from '../components/MessageCard';
import { Stamp } from '../components/Stamp';

function pickDemo(data: AppData): DemoCase | null {
  return (
    data.cases.demo.find((item) => item.label === 4) ??
    data.cases.demo.find((item) => item.tag === 'strong_correct') ??
    data.cases.demo[0] ??
    null
  );
}

export function createS0(
  el: HTMLElement,
  data: AppData,
  motion: boolean,
  jump: (id: string) => void,
): SceneModule {
  const demo = pickDemo(data);

  el.innerHTML = `
    <div class="stage s0-stage">
      <div class="s0-head">
        <div class="eyebrow">开场</div>
        <h2>一条短信，该放进哪一堆？</h2>
        <p class="s0-kicker">每天，大量短信和电话涌向普通人。</p>
      </div>
      <div class="s0-board">
        <div class="s0-card-wrap">
          <div class="s0-card-host"></div>
          <div class="scanline" aria-hidden="true"></div>
          <div class="s0-stamp-host"></div>
        </div>
        <div class="s0-trays" aria-label="十类托盘">
          ${CLASS_META.map(
            (meta) => `
            <div class="s0-tray" data-class="${meta.id}" style="--tray-rgb:${meta.rgb}">
              <span class="s0-tray-name">${meta.short}</span>
              <span class="s0-tray-count" aria-hidden="true"></span>
            </div>`,
          ).join('')}
        </div>
      </div>
      <div class="s0-questions">
        <button class="s0-q" data-jump="s3" type="button">
          <span class="s0-q-num">01</span>
          <span class="s0-q-text">分得清是哪一类骗局吗？</span>
          <span class="s0-q-go" aria-hidden="true">→</span>
        </button>
        <button class="s0-q" data-jump="s4" type="button">
          <span class="s0-q-num">02</span>
          <span class="s0-q-text">这个分数有多可信？</span>
          <span class="s0-q-go" aria-hidden="true">→</span>
        </button>
        <button class="s0-q" data-jump="s5" type="button">
          <span class="s0-q-num">03</span>
          <span class="s0-q-text">换到真实场景，还管用吗？</span>
          <span class="s0-q-go" aria-hidden="true">→</span>
        </button>
      </div>
      <div class="s0-hint">向下滚动，或开启讲解模式用方向键分步</div>
    </div>
  `;

  const cardHost = el.querySelector('.s0-card-host') as HTMLElement;
  const card = demo
    ? new MessageCard({
        text: demo.text,
        turns: demo.turns,
        modality: demo.modality,
        cues: demo.cues,
        showCueTags: true,
      })
    : null;
  if (card) cardHost.appendChild(card.root);
  else {
    const empty = document.createElement('div');
    empty.className = 's0-empty';
    empty.textContent = '数据中没有可展示的演示样例';
    cardHost.appendChild(empty);
  }

  const stamp = new Stamp('fraud', demo?.pred.label ?? 4);
  const stampHost = el.querySelector('.s0-stamp-host') as HTMLElement;
  stampHost.appendChild(stamp.root);
  stamp.root.classList.add('s0-stamp');

  const cardWrap = el.querySelector('.s0-card-wrap') as HTMLElement;
  const scanline = el.querySelector('.scanline') as HTMLElement;
  const kicker = el.querySelector('.s0-kicker') as HTMLElement;
  const questions = Array.from(el.querySelectorAll<HTMLElement>('.s0-q'));
  const hint = el.querySelector('.s0-hint') as HTMLElement;
  const targetTray = el.querySelector<HTMLElement>(`.s0-tray[data-class="${demo?.pred.label ?? 4}"]`);
  const trayCount = targetTray?.querySelector<HTMLElement>('.s0-tray-count') ?? null;

  el.querySelectorAll<HTMLElement>('[data-jump]').forEach((btn) => {
    btn.addEventListener('click', () => jump(btn.dataset.jump!));
  });

  const cueCount = card?.cueEls.length ?? 0;

  /** 计算卡片飞向托盘的位移（相对卡片中心）。 */
  const flyTransform = (): { x: number; y: number; scale: number } => {
    if (!targetTray) return { x: 0, y: 0, scale: 0.3 };
    const cardRect = cardWrap.getBoundingClientRect();
    const trayRect = targetTray.getBoundingClientRect();
    const scale = Math.min(0.36, trayRect.width / Math.max(1, cardRect.width));
    const dx = trayRect.left + trayRect.width / 2 - (cardRect.left + cardRect.width / 2);
    const dy = trayRect.top + trayRect.height / 2 - (cardRect.top + cardRect.height / 2);
    return { x: dx, y: dy, scale };
  };

  const final = (): void => {
    gsap.set(cardWrap, { x: 0, y: 0, scale: 1, opacity: 1, transformOrigin: '50% 50%' });
    gsap.set(scanline, { opacity: 0 });
    card?.clearCueActive();
    card?.cueEls.forEach((mark) => mark.classList.add('is-active'));
    stamp.setVerdict('fraud');
    stamp.setClass(demo?.pred.label ?? 4);
    gsap.set(stamp.root, { opacity: 1, scale: 1 });
    targetTray?.classList.add('is-filled');
    if (trayCount) trayCount.textContent = '1';
    gsap.set(questions, { opacity: 1, y: 0 });
    gsap.set(kicker, { opacity: 1 });
    gsap.set(hint, { opacity: 0 });
  };

  if (!motion) {
    requestAnimationFrame(final);
    return { id: 's0', el, final };
  }

  gsap.set(cardWrap, { opacity: 0, y: 40 });
  gsap.set(scanline, { opacity: 0, top: '4%' });
  gsap.set(stamp.root, { opacity: 0, scale: 1.5 });
  gsap.set(questions, { opacity: 0, y: 24 });
  gsap.set(hint, { opacity: 0 });
  gsap.set(kicker, { opacity: 0.55 });

  const build = (tl: gsap.core.Timeline): void => {
    tl.addLabel('step1', 0)
      .to(cardWrap, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, 0)
      .to(kicker, { opacity: 1, duration: 0.5 }, 0.1)
      .addLabel('step2', 0.95)
      .to(scanline, { opacity: 1, duration: 0.15 }, 0.95)
      .to(scanline, { top: '96%', duration: 1.7, ease: 'none' }, 1.0);

    for (let i = 0; i < Math.min(cueCount, 4); i++) {
      tl.call(
        () => {
          card?.clearCueActive();
          card?.setCueActive(i);
        },
        undefined,
        1.15 + i * 0.42,
      );
    }
    tl.to(scanline, { opacity: 0, duration: 0.25 }, 2.75);

    tl.addLabel('step3', 3.0)
      .call(() => {
        stamp.setVerdict('fraud');
        gsap.to(stamp.root, { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(2)' });
      }, undefined, 3.0)
      .call(
        () => {
          const rect = cardWrap.getBoundingClientRect();
          const clone = cardWrap.cloneNode(true) as HTMLElement;
          clone.querySelector('.scanline')?.remove();
          clone.classList.add('s0-card-clone');
          Object.assign(clone.style, {
            position: 'fixed',
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            margin: '0',
            pointerEvents: 'none',
            zIndex: '120',
          });
          document.body.appendChild(clone);
          const fly = flyTransform();
          gsap.to(clone, {
            x: fly.x,
            y: fly.y,
            scale: fly.scale,
            opacity: 0.2,
            duration: 0.9,
            ease: 'power2.inOut',
            transformOrigin: '50% 50%',
            onComplete: () => clone.remove(),
          });
          targetTray?.classList.add('is-filled');
          if (trayCount) trayCount.textContent = '1';
        },
        undefined,
        3.55,
      )
      .call(
        () => {
          stamp.setClass(demo?.pred.label ?? 4);
        },
        undefined,
        3.9,
      );

    tl.addLabel('step4', 4.6)
      .to(questions, { opacity: 1, y: 0, duration: 0.55, stagger: 0.2, ease: 'power2.out' }, 4.6)
      .to(hint, { opacity: 1, duration: 0.4 }, 5.2)
      .to({}, { duration: 1.2 }, 5.4);
  };

  return {
    id: 's0',
    el,
    stepLabels: ['step1', 'step2', 'step3', 'step4'],
    build,
    final,
  };
}
