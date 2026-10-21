import { describe, expect, it } from 'vitest';
import { hasSensitive, sanitizeText } from '../src/core/sanitize';

describe('文本脱敏', () => {
  it('替换 6 位以上数字', () => {
    expect(sanitizeText('请联系 13800138000 办理')).toBe('请联系 【号码】 办理');
  });

  it('替换 URL 与裸域名', () => {
    expect(sanitizeText('打开 https://example.com/a?b=1 领取')).toBe('打开 【链接】 领取');
    expect(sanitizeText('登录 example.com 查看')).toBe('登录 【链接】 查看');
  });

  it('替换 QQ / 微信账号', () => {
    expect(sanitizeText('加微信 abcde12345 领奖')).toBe('加微信【账号】 领奖');
    expect(sanitizeText('QQ：12345678')).toBe('QQ【账号】');
  });

  it('保留普通文本与短数字', () => {
    expect(sanitizeText('今天 3 点开会，带上身份证')).toBe('今天 3 点开会，带上身份证');
  });

  it('hasSensitive 能识别残留敏感内容', () => {
    expect(hasSensitive('13800138000')).toBe(true);
    expect(hasSensitive('https://example.com')).toBe(true);
    expect(hasSensitive('加微信 abcde12345')).toBe(true);
    expect(hasSensitive('今天 3 点开会')).toBe(false);
  });
});
