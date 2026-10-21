/**
 * 前端脱敏兜底（与导出脚本规则一致）：
 * 6 位以上数字、URL / 域名、QQ / 微信账号。
 * 只处理纯文本，渲染时永远使用 textContent，不生成 <a>。
 */
const ACCOUNT = /(QQ|qq|微信|vx|wx|VX|WX)\s*[:：]?\s*[A-Za-z0-9_-]{5,}/g;
const URL = /(?:https?:\/\/|www\.)[^\s，。；、！？）)】]+/gi;
const DOMAIN = /\b[a-z0-9-]+\.(?:com|cn|net|org|top|xyz|vip|cc|io|me|info)(?:\/[^\s]*)?\b/gi;
const LONG_NUMBER = /\d{6,}/g;

export function sanitizeText(input: string): string {
  return input
    .replace(ACCOUNT, '$1【账号】')
    .replace(URL, '【链接】')
    .replace(DOMAIN, '【链接】')
    .replace(LONG_NUMBER, '【号码】');
}

/** 判断文本是否仍含需要打码的内容，用于验收与测试。 */
export function hasSensitive(input: string): boolean {
  return (
    /(?:https?:\/\/|www\.)/i.test(input) ||
    /\b[a-z0-9-]+\.(?:com|cn|net|org|top|xyz|vip|cc|io|me|info)\b/i.test(input) ||
    /\d{6,}/.test(input) ||
    /(QQ|微信|vx|wx|VX|WX)\s*[:：]?\s*[A-Za-z0-9_-]{5,}/.test(input)
  );
}
