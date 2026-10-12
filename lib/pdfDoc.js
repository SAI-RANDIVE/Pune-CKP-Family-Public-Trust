import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

/**
 * Printed documents with the trust's letterhead: registration lists, event
 * plans, member statements. One function, documentPdf(), lays out a heading,
 * a few "label: value" lines and any number of tables, breaking pages as
 * needed and repeating the table header on each page.
 *
 * Text is drawn with the standard PDF fonts, which hold Latin letters only.
 * Devanagari cannot be shaped by pdf-lib, so anything outside that range is
 * dropped rather than printed as boxes; callers pass the English spelling.
 */

const INK = rgb(0.17, 0.1, 0.05);
const MUTED = rgb(0.4, 0.33, 0.27);
const RED = rgb(0.69, 0, 0);
const RULE = rgb(0.85, 0.74, 0.5);
const SHADE = rgb(0.98, 0.94, 0.85);

const TRUST = {
  name: process.env.NEXT_PUBLIC_TRUST_NAME || 'Pune CKP Family Public Trust',
  line1: 'Registration No. E-8167, dated 14 May 2018 | PAN AADTP7440A',
  line2: process.env.NEXT_PUBLIC_TRUST_ADDRESS || '602, Niranka CHS, Ideal Society, Paud Road, Kothrud, Pune - 411038',
};

/** Keeps what the standard fonts can print; "Rs." replaces the rupee sign. */
export function latin(value) {
  return String(value ?? '')
    .replace(/₹\s?/g, 'Rs. ')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function inr(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const fixed = Math.abs(n).toFixed(2);
  const [whole, frac] = fixed.split('.');
  const grouped = whole.length > 3
    ? `${whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${whole.slice(-3)}`
    : whole;
  return `${n < 0 ? '-' : ''}${grouped}${frac === '00' ? '' : `.${frac}`}`;
}

function wrap(text, font, size, width) {
  const words = latin(text).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) <= width || !line) {
      line = trial;
      // A single word wider than the column is cut so it cannot overrun its neighbour.
      while (font.widthOfTextAtSize(line, size) > width && line.length > 1) line = line.slice(0, -1);
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/**
 * @param {object} doc
 *   title, subtitle        heading under the letterhead
 *   facts                  [[label, value], ...] printed in two columns
 *   sections               [{ heading, note, columns: [{ label, width (share), align }], rows: [[...]], total: [...] }]
 *   footer                 small text at the bottom of every page
 *   landscape              true for wide tables
 * @returns {Promise<Buffer>}
 */
export async function documentPdf({ title, subtitle, facts = [], sections = [], footer, landscape = false }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(latin(title));
  pdf.setAuthor(TRUST.name);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let logo = null;
  try {
    const file = ['logo-receipt.png', 'logo.png'].map((f) => path.join(process.cwd(), 'public', 'logo', f)).find((p) => fs.existsSync(p));
    if (file) logo = await pdf.embedPng(fs.readFileSync(file));
  } catch {
    logo = null;
  }

  const size = landscape ? [841.89, 595.28] : [595.28, 841.89];
  const M = 40;
  const W = size[0];
  const H = size[1];
  const inner = W - 2 * M;
  let page;
  let y;
  const pages = [];

  const newPage = (first = false) => {
    page = pdf.addPage(size);
    pages.push(page);
    y = H - M;
    if (first) {
      const top = y;
      if (logo) page.drawImage(logo, { x: M, y: top - 54, width: 54, height: 54 });
      const left = M + (logo ? 66 : 0);
      page.drawText(latin(TRUST.name), { x: left, y: top - 20, size: 17, font: bold, color: RED });
      page.drawText(latin(TRUST.line1), { x: left, y: top - 35, size: 8.5, font: regular, color: MUTED });
      page.drawText(latin(TRUST.line2), { x: left, y: top - 47, size: 8.5, font: regular, color: MUTED });
      y = top - 64;
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.2, color: RULE });
      y -= 24;
    }
  };
  const need = (height) => { if (y - height < M + 24) newPage(); };

  newPage(true);
  page.drawText(latin(title), { x: M, y, size: 15, font: bold, color: INK });
  y -= 18;
  if (subtitle) {
    for (const line of wrap(subtitle, regular, 10, inner)) {
      page.drawText(line, { x: M, y, size: 10, font: regular, color: MUTED });
      y -= 13;
    }
  }
  y -= 6;

  // Facts in two columns.
  const shown = facts.filter((f) => f && f[1] !== null && f[1] !== undefined && String(f[1]) !== '');
  const colW = inner / 2;
  for (let i = 0; i < shown.length; i += 2) {
    const pair = [shown[i], shown[i + 1]].filter(Boolean);
    const blocks = pair.map(([label, value]) => ({ label: `${latin(label)}: `, lines: null, value }));
    blocks.forEach((b) => {
      const lw = bold.widthOfTextAtSize(b.label, 9.5);
      b.lw = lw;
      b.lines = wrap(b.value, regular, 9.5, colW - lw - 12);
    });
    const rows = Math.max(...blocks.map((b) => b.lines.length));
    need(rows * 12 + 4);
    blocks.forEach((b, j) => {
      const x = M + j * colW;
      page.drawText(b.label, { x, y, size: 9.5, font: bold, color: INK });
      b.lines.forEach((line, k) => page.drawText(line, { x: x + b.lw, y: y - k * 12, size: 9.5, font: regular, color: INK }));
    });
    y -= rows * 12 + 3;
  }
  if (shown.length) y -= 8;

  for (const section of sections) {
    const share = section.columns.reduce((sum, c) => sum + (c.width || 1), 0);
    const widths = section.columns.map((c) => ((c.width || 1) / share) * inner);
    const xs = widths.reduce((acc, w, i) => [...acc, (acc[i] ?? M) + (i ? widths[i - 1] : 0)], []).map((_, i) => M + widths.slice(0, i).reduce((a, b) => a + b, 0));
    const FS = section.columns.length > 7 ? 8 : 9;
    const LH = FS + 3;

    const drawCells = (cells, font, { fill, color = INK } = {}) => {
      const wrapped = cells.map((cell, i) => wrap(cell, font, FS, widths[i] - 8));
      const height = Math.max(...wrapped.map((w) => w.length)) * LH + 6;
      need(height);
      if (fill) page.drawRectangle({ x: M, y: y - height + LH - 2, width: inner, height, color: fill });
      wrapped.forEach((lines, i) => {
        lines.forEach((line, k) => {
          const tw = font.widthOfTextAtSize(line, FS);
          const x = section.columns[i].align === 'right' ? xs[i] + widths[i] - 4 - tw : xs[i] + 4;
          page.drawText(line, { x, y: y - k * LH, size: FS, font, color });
        });
      });
      y -= height;
      page.drawLine({ start: { x: M, y: y + LH - 2 }, end: { x: W - M, y: y + LH - 2 }, thickness: 0.4, color: RULE });
    };
    const header = () => drawCells(section.columns.map((c) => c.label), bold, { fill: SHADE });

    if (section.heading) {
      need(60);
      y -= 6;
      page.drawText(latin(section.heading), { x: M, y, size: 12, font: bold, color: RED });
      y -= 16;
    }
    if (section.note) {
      for (const line of wrap(section.note, regular, 9, inner)) {
        need(12);
        page.drawText(line, { x: M, y, size: 9, font: regular, color: MUTED });
        y -= 12;
      }
      y -= 2;
    }
    if (!section.rows.length) {
      need(14);
      page.drawText(latin(section.empty || 'Nothing recorded.'), { x: M, y, size: 9.5, font: regular, color: MUTED });
      y -= 18;
      continue;
    }
    header();
    for (const row of section.rows) {
      const before = pages.length;
      const lines = Math.max(...row.map((cell, i) => wrap(cell, regular, FS, widths[i] - 8).length));
      if (y - (lines * LH + 6) < M + 24) { newPage(); header(); }
      drawCells(row, regular);
      if (pages.length !== before) header();
    }
    if (section.total) drawCells(section.total, bold, { fill: SHADE });
    y -= 12;
  }

  // Page numbers and footer on every page.
  const stamp = latin(footer || '');
  pages.forEach((p, i) => {
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, { x: W - M - regular.widthOfTextAtSize(label, 8), y: M - 14, size: 8, font: regular, color: MUTED });
    if (stamp) p.drawText(stamp.slice(0, 140), { x: M, y: M - 14, size: 8, font: regular, color: MUTED });
  });

  return Buffer.from(await pdf.save());
}
