import ExcelJS from 'exceljs';
import { fmtDateTime, isoDate } from './format';

/**
 * Excel output for report exports and the full backup. Builds the workbook in
 * memory and returns a Buffer.
 */

const MONEY_FMT = '#,##,##0.00';

function sheetName(workbook, wanted) {
  const base = String(wanted || 'Sheet').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 28) || 'Sheet';
  let name = base;
  let n = 2;
  while (workbook.getWorksheet(name)) { name = `${base} ${n}`; n += 1; }
  return name;
}

function cellValue(value, type) {
  if (value === null || value === undefined || value === '') return null;
  if (type === 'money' || type === 'num' || type === 'pct') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (type === 'date') return isoDate(value) || null;
  if (value instanceof Date) return value;
  if (Buffer.isBuffer(value)) return `[binary ${value.length} bytes]`;
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 32000);
  // A leading = + - @ would be run as a formula by Excel; keep text as text.
  const s = String(value);
  return /^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s.slice(0, 32000);
}

/** One sheet per report section, with a heading block saying what, which year, when and by whom. */
export async function reportWorkbook(report, { by, fyLabel, generatedLabel }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Pune CKP Family Public Trust - TMS';
  workbook.created = new Date();

  for (const section of report.sections) {
    const sheet = workbook.addWorksheet(sheetName(workbook, section.title));
    sheet.addRow([report.title]).font = { bold: true, size: 14 };
    sheet.addRow([section.title]).font = { bold: true };
    sheet.addRow([`${fyLabel}: ${report.fy === 'all' ? '*' : report.fy}`]);
    sheet.addRow([`${generatedLabel}: ${fmtDateTime(new Date())} - ${by}`]);
    sheet.addRow([]);

    const header = sheet.addRow(section.columns.map((c) => c.label));
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E3C3' } };
      cell.border = { bottom: { style: 'thin' } };
    });

    const addData = (row, bold = false) => {
      const added = sheet.addRow(section.columns.map((c) => cellValue(row[c.key], c.type)));
      if (bold) added.font = { bold: true };
      section.columns.forEach((c, i) => {
        if (c.type === 'money') added.getCell(i + 1).numFmt = MONEY_FMT;
      });
    };
    section.rows.forEach((row) => addData(row));
    if (section.total) addData(section.total, true);
    if (section.note) { sheet.addRow([]); sheet.addRow([section.note]); }

    section.columns.forEach((c, i) => {
      sheet.getColumn(i + 1).width = c.type === 'text' ? 30 : 18;
    });
  }

  if (report.notes?.length) {
    const notes = workbook.addWorksheet(sheetName(workbook, 'Notes'));
    report.notes.forEach((n) => notes.addRow([n]));
    notes.getColumn(1).width = 120;
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** One sheet per table: column names in the first row, then every row as stored. */
export async function tablesWorkbook(tables) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Pune CKP Family Public Trust - TMS';
  workbook.created = new Date();
  for (const { name, columns, rows } of tables) {
    const sheet = workbook.addWorksheet(sheetName(workbook, name));
    sheet.addRow(columns).font = { bold: true };
    for (const row of rows) sheet.addRow(columns.map((c) => cellValue(row[c])));
    columns.forEach((_, i) => { sheet.getColumn(i + 1).width = 20; });
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
