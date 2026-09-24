/**
 * Reading an uploaded register file. CSV is parsed here (RFC 4180); .xlsx is read by
 * read-excel-file, loaded only when a spreadsheet is actually chosen so it stays out of the
 * main bundle. Both come back as a header row plus body rows of plain strings.
 */

export interface Sheet {
  headers: string[];
  body: string[][];
}

export const IMPORT_ACCEPT =
  '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** RFC 4180: quoted fields, doubled quotes inside them, CR/LF or LF line endings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const clean = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function toSheet(rows: unknown[][]): Sheet {
  const asText = rows.map((r) =>
    r.map((cell) => {
      if (cell === null || cell === undefined) return '';
      if (cell instanceof Date) return cell.toISOString().slice(0, 10);
      return String(cell).trim();
    })
  );
  const [headers = [], ...body] = asText;
  return { headers, body };
}

/** Read a chosen file. Throws a user-readable message when it cannot be read. */
export async function readSheet(file: File): Promise<Sheet> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return toSheet(parseCsv(await file.text()));
  if (name.endsWith('.xlsx')) {
    const { default: readXlsxFile } = await import('read-excel-file/browser');
    try {
      const rows = await readXlsxFile(file);
      return toSheet(rows as unknown as unknown[][]);
    } catch {
      throw new Error(
        'That spreadsheet could not be read. Save it as .xlsx or .csv and try again.'
      );
    }
  }
  if (name.endsWith('.xls'))
    throw new Error('The old .xls format is not supported. Save the file as .xlsx or .csv.');
  throw new Error('Choose a .csv or .xlsx file.');
}
