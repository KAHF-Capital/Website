function cell(value) {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Download rows as CSV. `columns`: [{ key, label, csv? }] */
export function downloadCsv(filename, rows, columns) {
  const header = columns.map((c) => cell(c.label || c.key)).join(',');
  const body = rows.map((row) => columns.map((c) => cell(c.csv ? c.csv(row) : row[c.key])).join(',')).join('\n');
  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
