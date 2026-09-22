/** CSV export: values are written as-is (money stays a plain 2-dp string), RFC 4180 quoting. */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // Guard against spreadsheet formula injection.
  const safe = /^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => cell(c.value(r))).join(','));
  return lines.join('\r\n');
}

/** Save text as a file in the browser (no network). */
export function downloadFile(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([mime.startsWith('text/csv') ? '﻿' + content : content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
