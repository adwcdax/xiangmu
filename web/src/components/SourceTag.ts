export function createSourceTag(text: string, mock: boolean): HTMLElement {
  const tag = document.createElement('span');
  tag.className = `source-tag ${mock ? 'source-tag--mock' : ''}`;
  tag.textContent = mock ? `MOCK · ${text}` : text;
  tag.title = mock ? '样例数据，非真实结果' : text;
  return tag;
}
