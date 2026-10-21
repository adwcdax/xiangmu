import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { THEME } from '../src/core/theme';

const SRC = join(process.cwd(), 'src');
const COLOR_SOURCE_FILES = new Set(['src/core/theme.ts', 'src/styles/tokens.css']);
const COLOR_SOURCE_EXT = /\.(ts|css)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

const sourceFiles = walk(SRC)
  .filter((file) => COLOR_SOURCE_EXT.test(file))
  .map((file) => ({
    path: relative(process.cwd(), file).replace(/\\/g, '/'),
    text: readFileSync(file, 'utf8'),
  }));

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const channel = v / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function over(fg: string, alpha: number, bg: string): string {
  const [fr, fg_, fb] = hexToRgb(fg);
  const [br, bg_, bb] = hexToRgb(bg);
  const mix = (f: number, b: number) => Math.round(f * alpha + b * (1 - alpha));
  return `#${[mix(fr, br), mix(fg_, bg_), mix(fb, bb)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

describe('颜色集中管理', () => {
  it('除 tokens.css 与 theme.ts 外不出现十六进制色值', () => {
    const offenders: string[] = [];
    const hex = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{4}\b|#[0-9a-fA-F]{3}\b/g;
    for (const file of sourceFiles) {
      if (COLOR_SOURCE_FILES.has(file.path)) continue;
      for (const match of file.text.matchAll(hex)) offenders.push(`${file.path}: ${match[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  it('所有 .ts/.css 文件都在扫描范围内', () => {
    expect(sourceFiles.length).toBeGreaterThan(20);
    expect(sourceFiles.some((f) => f.path === 'src/styles/playground.css')).toBe(true);
    expect(sourceFiles.some((f) => f.path === 'src/styles/scenes2.css')).toBe(true);
  });

  it('十类配色与热力图色阶完整', () => {
    expect(THEME.classColors).toHaveLength(10);
    expect(new Set(THEME.classColors).size).toBe(10);
    expect(THEME.heat).toHaveLength(5);
  });
});

describe('WCAG 对比度', () => {
  const backgrounds = ['bg0', 'bg1', 'bg2'] as const;
  const textTokens = ['text', 'text2', 'textDim', 'textFaint'] as const;

  it('正文与弱化文字在所有浅色底上不低于 4.5:1', () => {
    for (const token of textTokens) {
      for (const bg of backgrounds) {
        const ratio = contrast(THEME[token], THEME[bg]);
        expect(ratio, `${token} on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('语义色 ink 在白底与 10% 软底上不低于 4.5:1', () => {
    const pairs: Array<[string, string, number]> = [
      ['tealInk', 'teal', 0.11],
      ['fraudInk', 'fraud', 0.1],
      ['warnInk', 'warn', 0.12],
      ['accentInk', 'accent', 0.1],
    ];
    for (const [ink, fill, alpha] of pairs) {
      const inkHex = THEME[ink as keyof typeof THEME];
      const fillHex = THEME[fill as keyof typeof THEME];
      expect(contrast(inkHex, THEME.bg1), `${ink} on bg1`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(inkHex, over(fillHex, alpha, THEME.bg1)), `${ink} on ${fill}-soft`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('图形语义色与模型色在白底上不低于 3:1', () => {
    const fills = ['accent', 'teal', 'fraud', 'warn', 'modelRule', 'modelRf', 'modelRfMeta', 'modelFasttext', 'modelDistilbert', 'modelLlm'] as const;
    for (const token of fills) {
      const ratio = contrast(THEME[token], THEME.bg1);
      expect(ratio, `${token} on bg1 = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('深色牌背上的白字不低于 4.5:1', () => {
    const ratio = contrast('#ffffff', THEME.cardBack);
    expect(ratio, `white on cardBack = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
  });
});