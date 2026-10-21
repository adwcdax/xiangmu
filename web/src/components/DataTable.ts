export interface DataTableSpec {
  caption: string;
  columns: string[];
  rows: Array<Array<string | number | null | undefined>>;
  summary?: string;
}

let uid = 0;

/** 图表的文字版数据表：默认收起，点击后在顶层对话框展开，避免被图表容器裁切。 */
export function createDataTable(spec: DataTableSpec): HTMLElement {
  const id = `chart-data-${++uid}`;
  const wrap = document.createElement('div');
  wrap.className = 'chart-data';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'chart-data-toggle';
  toggle.textContent = spec.summary ?? '查看文字数据';
  toggle.setAttribute('aria-haspopup', 'dialog');

  const dialog = document.createElement('dialog');
  dialog.className = 'chart-data-dialog';
  dialog.setAttribute('aria-labelledby', `${id}-title`);

  const head = document.createElement('div');
  head.className = 'chart-data-head';
  const title = document.createElement('h3');
  title.id = `${id}-title`;
  title.textContent = spec.caption;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'chart-data-close';
  close.setAttribute('aria-label', '关闭数据表');
  close.textContent = '×';
  head.append(title, close);

  const body = document.createElement('div');
  body.className = 'chart-data-body';
  const table = document.createElement('table');
  const caption = document.createElement('caption');
  caption.textContent = spec.caption;
  table.appendChild(caption);

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  spec.columns.forEach((column) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = column;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  spec.rows.forEach((row) => {
    const tr = document.createElement('tr');
    row.forEach((cell) => {
      const td = document.createElement('td');
      td.textContent = cell === null || cell === undefined ? '—' : String(cell);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  body.appendChild(table);
  dialog.append(head, body);

  toggle.addEventListener('click', () => {
    dialog.showModal();
    close.focus();
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => toggle.focus());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  wrap.append(toggle, dialog);
  return wrap;
}

export function appendDataTable(host: HTMLElement, spec: DataTableSpec): HTMLElement {
  const table = createDataTable(spec);
  host.insertAdjacentElement('afterend', table);
  return table;
}