import { describe, expect, it } from 'vitest';
import {
  clamp,
  formatMs,
  formatSeconds,
  formatUSD,
  fmt,
  int,
  maxBy,
  minBy,
  mulberry32,
  pct,
  quadPoint,
  shuffled,
} from '../src/core/utils';

describe('数值与格式化', () => {
  it('clamp 限制在区间内', () => {
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(0.4, 0, 1)).toBe(0.4);
    expect(clamp(2, 0, 1)).toBe(1);
  });

  it('fmt 处理非有限值', () => {
    expect(fmt(0.1234)).toBe('0.12');
    expect(fmt(0.1234, 3)).toBe('0.123');
    expect(fmt(Number.NaN)).toBe('—');
  });

  it('pct 与 int', () => {
    expect(pct(0.1234)).toBe('12.3%');
    expect(pct(Number.POSITIVE_INFINITY)).toBe('—');
    expect(int(17880)).toBe('17,880');
  });

  it('时间格式覆盖毫秒、秒、分钟', () => {
    expect(formatSeconds(0.0005)).toBe('< 1 ms');
    expect(formatSeconds(0.012)).toBe('12 ms');
    expect(formatSeconds(1.234)).toBe('1.23 s');
    expect(formatSeconds(288)).toBe('4.8 min');
    expect(formatMs(0.005)).toBe('< 0.01 ms');
    expect(formatMs(0.5)).toBe('0.50 ms');
    expect(formatMs(32)).toBe('32 ms');
    expect(formatMs(1380)).toBe('1.38 s');
  });

  it('美元金额保留必要精度', () => {
    expect(formatUSD(0)).toBe('$0');
    expect(formatUSD(0.0036)).toBe('$0.0036');
    expect(formatUSD(0.36)).toBe('$0.36');
    expect(formatUSD(Number.NaN)).toBe('—');
  });
});

describe('随机与集合工具', () => {
  it('mulberry32 对同一 seed 可复现', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const left = Array.from({ length: 8 }, () => a());
    const right = Array.from({ length: 8 }, () => b());
    expect(left).toEqual(right);
    expect(left.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it('shuffled 不修改原数组且元素完整', () => {
    const source = [1, 2, 3, 4, 5];
    const out = shuffled(source, mulberry32(7));
    expect(source).toEqual([1, 2, 3, 4, 5]);
    expect(out).toHaveLength(source.length);
    expect([...out].sort((x, y) => x - y)).toEqual(source);
  });

  it('maxBy / minBy 返回对应元素', () => {
    const rows = [
      { id: 'a', v: 0.7 },
      { id: 'b', v: 0.9 },
      { id: 'c', v: 0.8 },
    ];
    expect(maxBy(rows, (r) => r.v)?.id).toBe('b');
    expect(minBy(rows, (r) => r.v)?.id).toBe('a');
    expect(maxBy([], (r: { v: number }) => r.v)).toBeNull();
  });

  it('quadPoint 端点与中点正确', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 50, y: -50 };
    const p2 = { x: 100, y: 0 };
    expect(quadPoint(p0, p1, p2, 0)).toEqual(p0);
    expect(quadPoint(p0, p1, p2, 1)).toEqual(p2);
    expect(quadPoint(p0, p1, p2, 0.5)).toEqual({ x: 50, y: -25 });
  });
});
