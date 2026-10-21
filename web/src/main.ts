import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/scenes2.css';
import './styles/typography.css';
import './styles/playground.css';

import { loadData } from './core/dataLoader';
import { SCENES } from './core/config';
import { ScrollDirector, type SceneModule } from './core/scrollDirector';
import { PresenterMode } from './core/presenterMode';
import { initWatermark, showDataBanner, toast } from './core/watermark';
import { motionEnabled, reloadWithMotion, restoreScrollIfNeeded } from './core/motionPrefs';
import { throttleRaf } from './core/utils';
import { mountPlayground } from './playground/playground';
import { createS0 } from './scenes/s00_hero';
import { createS1 } from './scenes/s01_dataset';
import { createS2 } from './scenes/s02_pipeline';
import { createS3 } from './scenes/s03_multiclass';
import { createS4 } from './scenes/s04_calibration';
import { createS5 } from './scenes/s05_domain';
import { createS6 } from './scenes/s06_race';
import { createS7 } from './scenes/s07_review';
import { createS8 } from './scenes/s08_errors';
import { createS9 } from './scenes/s09_conclusion';

function sceneEl(id: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`section[data-scene="${id}"]`);
  if (!el) throw new Error(`找不到场景容器：${id}`);
  return el;
}

function buildNav(jump: (id: string) => void): HTMLAnchorElement[] {
  const nav = document.getElementById('scene-nav');
  if (!nav) return [];
  const links: HTMLAnchorElement[] = [];
  SCENES.forEach((scene, index) => {
    const link = document.createElement('a');
    link.className = 'nav-dot';
    link.href = `#${scene.id}`;
    link.dataset.scene = scene.id;
    link.title = scene.title;
    link.setAttribute('aria-label', `场景 ${index}：${scene.title}`);
    link.innerHTML = `<span class="nav-dot-index">${String(index).padStart(2, '0')}</span><span class="nav-dot-label">${scene.label}</span>`;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      jump(scene.id);
    });
    nav.appendChild(link);
    links.push(link);
  });
  return links;
}

async function boot(): Promise<void> {
  const motion = motionEnabled();
  document.body.dataset.motion = motion ? 'on' : 'off';

  document.querySelectorAll<HTMLElement>('.scene[data-vh]').forEach((node) => {
    node.style.setProperty('--scene-vh', `${node.dataset.vh}vh`);
  });

  const { data } = await loadData();
  document.body.dataset.mode = data.meta.data_mode;
  document.body.dataset.scenario = new URLSearchParams(location.search).get('data') ?? 'default';
  initWatermark(data.meta, Boolean(data.fallback));

  const director = new ScrollDirector(motion);
  const jump = (id: string): void => director.jumpToScene(id);

  const playgroundEl = sceneEl('p');
  mountPlayground(playgroundEl, data, jump);

  const scenes: SceneModule[] = [
    { id: 'p', el: playgroundEl },
    createS0(sceneEl('s0'), data, motion, jump),
    createS1(sceneEl('s1'), data, motion),
    createS2(sceneEl('s2'), data, motion),
    createS3(sceneEl('s3'), data, motion, jump),
    createS4(sceneEl('s4'), data, motion),
    createS5(sceneEl('s5'), data, motion, jump),
    createS6(sceneEl('s6'), data, motion),
    createS7(sceneEl('s7'), data, motion, jump),
    createS8(sceneEl('s8'), data, motion, jump),
    createS9(sceneEl('s9'), data, motion),
  ];
  scenes.forEach((scene) => director.add(scene));

  const navLinks = buildNav(jump);
  const progressBar = document.getElementById('top-progress-bar');
  const backTop = document.getElementById('back-top') as HTMLButtonElement | null;

  const updateChrome = (): void => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    if (progressBar) progressBar.style.transform = `scaleX(${progress.toFixed(4)})`;
    if (backTop) backTop.classList.toggle('is-visible', window.scrollY > window.innerHeight * 1.1);

    const active = director.getActiveSceneIndex();
    navLinks.forEach((link, i) => {
      link.classList.toggle('is-active', i === active);
      link.setAttribute('aria-current', i === active ? 'true' : 'false');
    });
  };

  director.setup(updateChrome);
  updateChrome();

  // 开发期调试入口：控制台可查看场景进度
  if (import.meta.env.DEV) {
    (window as unknown as { __demo?: unknown }).__demo = { director, data };
  }

  const presenterBtn = document.getElementById('toggle-presenter') as HTMLButtonElement | null;
  if (presenterBtn) {
    new PresenterMode(director, presenterBtn, (active) => {
      document.body.classList.toggle('presenter', active);
    });
  }

  const motionBtn = document.getElementById('toggle-motion') as HTMLButtonElement | null;
  if (motionBtn) {
    motionBtn.setAttribute('aria-pressed', String(motion));
    motionBtn.classList.toggle('is-on', motion);
    motionBtn.title = motion ? '关闭动画，显示静态终态' : '开启动画';
    motionBtn.addEventListener('click', () => reloadWithMotion(!motion));
  }

  backTop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: motion ? 'smooth' : 'auto' });
  });

  const onScroll = throttleRaf(updateChrome);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  const bannerMessage = data.fallback?.reason ?? (data.warnings.length > 0 ? data.warnings.join('　·　') : '');
  if (bannerMessage) {
    showDataBanner(bannerMessage, data.fallback ? 'error' : 'warn');
    const banner = document.getElementById('data-banner');
    banner?.addEventListener('click', () => {
      banner.hidden = true;
    });
    banner?.setAttribute('title', '点击关闭');
  }

  restoreScrollIfNeeded();

  const bootNode = document.getElementById('boot');
  // 字体加载不应成为首屏的硬依赖：最多等 1.2s，超时也照常进入页面
  await Promise.race([
    document.fonts.ready.catch(() => undefined),
    new Promise((resolve) => window.setTimeout(resolve, 1200)),
  ]);
  // 后台标签页的 rAF 可能被节流，用定时器兜底，避免启动层长期停留
  const finishBoot = (): void => {
    if (document.body.classList.contains('is-ready')) return;
    director.refresh();
    updateChrome();
    document.body.classList.add('is-ready');
    bootNode?.classList.add('is-done');
    window.setTimeout(() => bootNode?.remove(), 520);
  };
  requestAnimationFrame(finishBoot);
  window.setTimeout(finishBoot, 350);

  if (data.meta.data_mode === 'mock') {
    window.setTimeout(() => {
      toast('演示模式：数值由固定种子生成，非真实结果。', 'info', 4200);
    }, 900);
  }
}

boot().catch((error: unknown) => {
  console.error('[main] 启动失败', error);
  const bootNode = document.getElementById('boot');
  if (bootNode) {
    const detail =
      error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error);
    const safe = detail.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    bootNode.innerHTML = `
      <div class="boot-inner">
        <div class="boot-mark is-error" aria-hidden="true"></div>
        <div class="boot-text">页面启动失败，请查看控制台，或确认通过本地服务器打开。</div>
        <pre class="boot-error">${safe}</pre>
      </div>
    `;
  }
});
