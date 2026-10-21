import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CONFIG } from './config';

gsap.registerPlugin(ScrollTrigger);

export interface SceneModule {
  id: string;
  el: HTMLElement;
  /** 时间线标签，顺序即步骤顺序 */
  stepLabels?: string[];
  build?: (tl: gsap.core.Timeline) => void;
  onProgress?: (progress: number, stepIndex: number) => void;
  onStep?: (index: number, prev: number) => void;
  final?: () => void;
  activate?: () => void;
  deactivate?: () => void;
  destroy?: () => void;
}

export interface StepPosition {
  sceneId: string;
  sceneIndex: number;
  stepIndex: number;
  stepCount: number;
  label: string;
  y: number;
}

interface SceneRecord {
  scene: SceneModule;
  tl?: gsap.core.Timeline;
  st?: ScrollTrigger;
  stepProgress: number[];
  currentStep: number;
}

export class ScrollDirector {
  private records = new Map<string, SceneRecord>();
  private scenes: SceneModule[] = [];
  private motion: boolean;
  private onUpdate?: () => void;

  constructor(motion: boolean) {
    this.motion = motion;
  }

  add(scene: SceneModule): void {
    this.scenes.push(scene);
  }

  setup(onUpdate?: () => void): void {
    this.onUpdate = onUpdate;
    for (const scene of this.scenes) {
      const record: SceneRecord = { scene, stepProgress: [], currentStep: -1 };
      this.records.set(scene.id, record);

      if (this.motion && scene.build) {
        const tl = gsap.timeline({ paused: true });
        scene.build(tl);
        const duration = tl.duration();
        const labels = scene.stepLabels ?? [];
        record.stepProgress = labels.map((label) => {
          const time = tl.labels[label] ?? 0;
          return duration > 0 ? Math.min(1, time / duration) : 0;
        });

        const pinned = scene.el.classList.contains('scene--pin');
        const st = ScrollTrigger.create({
          trigger: scene.el,
          start: pinned ? 'top top' : 'top 78%',
          end: pinned ? 'bottom bottom' : 'bottom 22%',
          scrub: pinned ? 0.6 : 0.45,
          animation: tl,
          invalidateOnRefresh: true,
          onUpdate: (self) => this.handleProgress(record, self.progress),
          onToggle: (self) => {
            if (self.isActive) scene.activate?.();
            else scene.deactivate?.();
          },
        });
        record.tl = tl;
        record.st = st;
      } else {
        scene.final?.();
        scene.activate?.();
      }
    }

    ScrollTrigger.addEventListener('refresh', () => this.onUpdate?.());
    window.addEventListener('scroll', this.handleScroll, { passive: true });
    window.addEventListener('resize', this.handleResize);
    requestAnimationFrame(() => ScrollTrigger.refresh());
  }

  private handleProgress(record: SceneRecord, progress: number): void {
    const idx = this.stepIndex(record, progress);
    const prev = record.currentStep;
    if (idx !== prev) {
      record.currentStep = idx;
      record.scene.onStep?.(idx, prev);
    }
    record.scene.onProgress?.(progress, idx);
    this.onUpdate?.();
  }

  private stepIndex(record: SceneRecord, progress: number): number {
    const labels = record.scene.stepLabels ?? [];
    if (labels.length === 0) return 0;
    let idx = 0;
    for (let i = 0; i < record.stepProgress.length; i++) {
      if (progress + 1e-4 >= record.stepProgress[i]) idx = i;
    }
    return idx;
  }

  private handleScroll = (): void => {
    this.onUpdate?.();
  };

  private handleResize = (): void => {
    window.clearTimeout((this as unknown as { _rt?: number })._rt);
    (this as unknown as { _rt?: number })._rt = window.setTimeout(() => {
      ScrollTrigger.refresh();
      this.onUpdate?.();
    }, 160);
  };

  /** 讲解模式使用的步骤坐标 */
  getStepPositions(): StepPosition[] {
    const out: StepPosition[] = [];
    this.scenes.forEach((scene, sceneIndex) => {
      const record = this.records.get(scene.id);
      const labels = scene.stepLabels ?? [];
      if (record?.st) {
        const pinned = scene.el.classList.contains('scene--pin');
        if (labels.length > 0) {
          labels.forEach((label, i) => {
            const p = record.stepProgress[i] ?? 0;
            const nextP = i + 1 < labels.length ? record.stepProgress[i + 1] ?? 1 : 1;
            // 停在下一步标签之前：既展示本步的完成态，又不会提前进入下一步。
            // 最后一步落到时间线终点。
            const endP = i + 1 < labels.length ? Math.max(p, nextP - 0.002) : 1;
            const rawY = record.st!.start + endP * (record.st!.end - record.st!.start);
            // 非 pin 场景不能滚到“场景已经离开视口”的位置，否则讲解时最后一步看不到内容。
            const maxVisibleY = scene.el.offsetTop + scene.el.offsetHeight - window.innerHeight;
            const y = pinned ? rawY : Math.min(rawY, Math.max(scene.el.offsetTop - CONFIG.navHeight, maxVisibleY));
            out.push({
              sceneId: scene.id,
              sceneIndex,
              stepIndex: i,
              stepCount: labels.length,
              label,
              y: Math.round(y),
            });
          });
        } else {
          out.push({
            sceneId: scene.id,
            sceneIndex,
            stepIndex: 0,
            stepCount: 1,
            label: 'scene',
            y: Math.round(pinned ? record.st.start : Math.max(0, scene.el.offsetTop - CONFIG.navHeight)),
          });
        }
      } else {
        const pinned = scene.el.classList.contains('scene--pin');
        out.push({
          sceneId: scene.id,
          sceneIndex,
          stepIndex: 0,
          stepCount: 1,
          label: 'scene',
          y: Math.round(pinned ? scene.el.offsetTop : Math.max(0, scene.el.offsetTop - CONFIG.navHeight)),
        });
      }
    });
    return out;
  }

  getActiveSceneIndex(): number {
    const probe = window.scrollY + window.innerHeight * 0.42;
    let active = 0;
    this.scenes.forEach((scene, i) => {
      const top = scene.el.offsetTop;
      const bottom = top + scene.el.offsetHeight;
      if (probe >= top && probe < bottom) active = i;
    });
    return active;
  }

  jumpToScene(id: string, smooth = true): void {
    const scene = this.scenes.find((s) => s.id === id);
    if (!scene) return;
    const record = this.records.get(id);
    const pinned = scene.el.classList.contains('scene--pin');
    // 非 pin 场景的 ScrollTrigger.start 是“场景顶到达视口 78%”，
    // 直接用它会把上一场景留在画面里；导航跳转应落到场景顶部。
    const y = pinned
      ? record?.st?.start ?? scene.el.offsetTop
      : Math.max(0, scene.el.offsetTop - CONFIG.navHeight);
    window.scrollTo({ top: y, behavior: smooth && this.motion ? 'smooth' : 'auto' });
  }

  jumpToStep(pos: StepPosition): void {
    window.scrollTo({ top: pos.y, behavior: this.motion ? 'smooth' : 'auto' });
  }

  refresh(): void {
    ScrollTrigger.refresh();
  }

  getScene(id: string): SceneModule | undefined {
    return this.scenes.find((s) => s.id === id);
  }

  debug(): { id: string; start: number; end: number; progress: number; step: number }[] {
    return [...this.records.entries()].map(([id, record]) => ({
      id,
      start: Math.round(record.st?.start ?? 0),
      end: Math.round(record.st?.end ?? 0),
      progress: record.st?.progress ?? 0,
      step: record.currentStep,
    }));
  }

  /** 仅用于无头验收：后台标签页 rAF 被节流时，手动把时间线对齐到当前滚动进度 */
  debugSync(): void {
    for (const record of this.records.values()) {
      if (!record.tl || !record.st) continue;
      record.tl.progress(record.st.progress);
      record.tl.render(record.tl.time(), false, true);
      record.scene.onProgress?.(record.st.progress, record.currentStep);
    }
    this.onUpdate?.();
  }

  destroy(): void {
    for (const record of this.records.values()) {
      record.tl?.kill();
      record.st?.kill();
      record.scene.destroy?.();
    }
    ScrollTrigger.getAll().forEach((st) => st.kill());
    window.removeEventListener('scroll', this.handleScroll);
    window.removeEventListener('resize', this.handleResize);
  }
}

export function scrollTopOffset(): number {
  return CONFIG.navHeight;
}
