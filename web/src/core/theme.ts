/**
 * Canvas / ECharts 不能读取 CSS 变量，颜色统一在这里维护。
 * 与 src/styles/tokens.css 的变量一一对应；不要在其他 TS 文件写死颜色。
 */
export const THEME = {
  bg0: '#f4f6fa',
  bg1: '#ffffff',
  bg2: '#eef1f7',
  bg3: '#e3e8f1',
  bg4: '#cfd7e4',

  ink: '#172033',
  text: '#172033',
  text2: '#374157',
  textDim: '#586277',
  textFaint: '#626c80',

  accent: '#2f5bea',
  accentInk: '#2449c7',

  teal: '#0e9c82',
  tealInk: '#07705e',
  benign: '#0e9c82',
  benignInk: '#07705e',

  fraud: '#e0452b',
  fraudInk: '#a92e17',

  warn: '#c27c00',
  warnInk: '#8f5600',

  violet: '#7c3aed',
  pink: '#db2777',

  /** 发牌赛牌背：深海军蓝，仅作大面积图形底 */
  cardBack: '#2b3a67',

  /** 十类配色（v2 4.2）；顺序与类别 id 一致 */
  classColors: [
    '#64748b',
    '#2563eb',
    '#7c3aed',
    '#ea580c',
    '#0891b2',
    '#db2777',
    '#9f1239',
    '#65a30d',
    '#0f766e',
    '#a16207',
  ],

  /** 混淆矩阵单色阶，由浅到深 5 档 */
  heat: ['#eef1f7', '#c7d4fb', '#6b8cef', '#2f5bea', '#1e3a8a'],

  modelRule: '#6b7488',
  modelRf: '#6b8cef',
  modelRfMeta: '#2f5bea',
  modelFasttext: '#7c3aed',
  modelDistilbert: '#8b5e34',
  modelLlm: '#db2777',
} as const;

function parseHex(hex: string): [number, number, number] {
  const raw = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(raw)) {
    throw new Error(`Invalid 6-digit hex color: ${hex}`);
  }
  return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)];
}

/** 把十六进制色转成 Canvas 可用的 rgba 字符串 */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** 用于 CSS 内联变量的 "R G B" 通道，例如 rgb(var(--mc-rgb) / 0.12) */
export function rgbChannels(hex: string): string {
  return parseHex(hex).join(' ');
}