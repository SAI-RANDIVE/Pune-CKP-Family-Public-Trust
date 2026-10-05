import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';
import path from 'path';
import { rupeesToWords } from './numberToWords';

/**
 * Generates the trust's official receipt as an A5 landscape PDF, laid out to
 * match the Trust's printed receipt book.
 *
 * Three things worth knowing before editing:
 *
 * 1. The standard PDF fonts (Times/Helvetica) are WinAnsi-encoded and have no
 *    rupee glyph (₹, U+20B9). So Times is used for everything — which is what
 *    the paper receipt looks like — and a *subset* of Noto Sans is embedded
 *    purely to draw the ₹ in the amount box. Subsetting keeps that to a few KB.
 *
 * 2. `PDFImage.scale()` returns a plain {width, height} size object, NOT a
 *    PDFImage. Passing its result to drawImage throws. Keep the image and the
 *    dimensions in separate variables.
 *
 * 3. Every value is drawn through `fit()`, which is given the width of the
 *    slot it must stay inside. Values used to be drawn at fixed offsets with no
 *    width limit, so a long name, address, e-mail, amount in words or
 *    membership number ran over the next label or out through the border.
 *    Never draw a variable value with plain `text()`.
 */

const BLACK = rgb(0, 0, 0);
const INK = rgb(0.1, 0.1, 0.1);
const RULE = rgb(0.35, 0.35, 0.35);

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function toDate(d) {
  return d instanceof Date ? d : new Date(d);
}

/** 01-Jul-26 — the format used on the printed receipt. */
function fmtDate(d) {
  const date = toDate(d);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getUTCDate()).padStart(2, '0')}-${MONTHS_SHORT[date.getUTCMonth()]}-${String(date.getUTCFullYear()).slice(2)}`;
}

/** 30-June-2027 — the longer form used for membership validity. */
function fmtDateLong(d) {
  const date = toDate(d);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getUTCDate()).padStart(2, '0')}-${MONTHS_LONG[date.getUTCMonth()]}-${date.getUTCFullYear()}`;
}

export function buildReceiptFileName(payment) {
  const raw = [
    payment.member_full_name || payment.payer_name || 'member',
    payment.membership_no || payment.receipt_no || 'receipt',
    fmtDate(payment.paid_at || payment.created_at || new Date()),
  ].join(' ');

  const safe = raw.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, '-');
  return `${safe || 'receipt'}.pdf`;
}

/** Indian digit grouping: 1,00,000 rather than 100,000. */
function formatINR(value) {
  const n = Number(value || 0);
  // Whole rupees print without decimals; anything else always shows both paise digits.
  const digits = Number.isInteger(n) ? 0 : 2;
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: 2 }).format(n);
}

/**
 * The standard fonts can only encode WinAnsi. A character outside it (Devanagari
 * in a name or address, a curly quote pasted from a phone) makes pdf-lib throw
 * and the whole receipt fail, so such characters are taken out before drawing.
 *
 * Devanagari cannot simply be drawn with an embedded font: pdf-lib does not shape
 * complex scripts, so conjuncts and vowel signs come out wrong. The receipt
 * therefore prints the Latin part of a value. If nothing Latin is left, question
 * marks are kept so that the gap is visible rather than a silently blank line.
 */
function winAnsiSafe(str, font) {
  const s = String(str ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-').replace(/\s+/g, ' ');
  let kept = '';
  let marked = '';
  for (const ch of s) {
    let ok = true;
    try {
      font.encodeText(ch);
    } catch {
      ok = false;
    }
    kept += ok ? ch : '';
    marked += ok ? ch : '?';
  }
  const tidy = kept.replace(/\(\s*\)/g, '').replace(/ {2,}/g, ' ');
  return /[A-Za-z0-9]/.test(tidy) || !/\?/.test(marked) ? tidy : marked;
}

/**
 * Largest size (between `min` and `size`) at which `str` fits in `maxWidth`.
 * If it does not fit even at `min`, the text is shortened with an ellipsis.
 */
export function fitText(str, font, maxWidth, size, min = 6) {
  let s = String(str ?? '');
  let fs_ = size;
  while (fs_ > min && font.widthOfTextAtSize(s, fs_) > maxWidth) fs_ -= 0.25;
  if (font.widthOfTextAtSize(s, fs_) > maxWidth) {
    while (s.length > 1 && font.widthOfTextAtSize(`${s}...`, fs_) > maxWidth) s = s.slice(0, -1);
    s = `${s.trimEnd()}...`;
  }
  return { text: s, size: fs_ };
}

/**
 * @param {object} payment - a row from `payments`, joined with member info. Optional
 *   fields for receipts recorded by hand in the management system: `mode`
 *   ('cash' | 'cheque' | anything else = transfer), `payment_ref` (cheque no. /
 *   UTR, used when there is no razorpay_payment_id) and `drawn_on` (bank name).
 * @returns {Promise<Uint8Array>} PDF bytes
 */
export async function generateReceiptPDF(payment) {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.registerFontkit(fontkit);

  const W = 595.28; // A5 landscape
  const H = 419.53;
  const page = doc.addPage([W, H]);

  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);

  // Rupee-capable font, embedded as a subset purely for the ₹ sign.
  let rupeeFont = serifBold;
  try {
    const notoPath = path.join(process.cwd(), 'public', 'fonts', 'NotoSans-Bold.ttf');
    if (fs.existsSync(notoPath)) {
      rupeeFont = await doc.embedFont(fs.readFileSync(notoPath), { subset: true });
    }
  } catch {
    rupeeFont = serifBold; // falls back to "Rs." below
  }
  const hasRupeeGlyph = rupeeFont !== serifBold;

  /** Fixed wording (labels). Returns the x just after the text. */
  const text = (str, x, y, { size = 9.5, font = serif, color = INK } = {}) => {
    const s = winAnsiSafe(str, font);
    page.drawText(s, { x, y, size, font, color });
    return x + font.widthOfTextAtSize(s, size);
  };

  /** A variable value, kept inside [x, x + maxWidth]. */
  const fit = (str, x, y, maxWidth, { size = 9.5, font = serif, color = INK, min = 6 } = {}) => {
    const f = fitText(winAnsiSafe(str, font).trim(), font, Math.max(maxWidth, 10), size, min);
    page.drawText(f.text, { x, y, size: f.size, font, color });
  };

  const centered = (str, y, { size = 9.5, font = serif, color = INK, left = 0, right = W } = {}) => {
    const f = fitText(winAnsiSafe(str, font).trim(), font, right - left, size, 6);
    page.drawText(f.text, { x: left + (right - left - font.widthOfTextAtSize(f.text, f.size)) / 2, y, size: f.size, font, color });
  };

  /** Ruled fill-in line, as on the paper receipt. */
  const rule = (x1, x2, y) =>
    page.drawLine({ start: { x: x1, y: y - 3.5 }, end: { x: x2, y: y - 3.5 }, thickness: 0.6, color: RULE });

  // ---- Outer border -------------------------------------------------------
  const M = 14;
  page.drawRectangle({ x: M, y: M, width: W - 2 * M, height: H - 2 * M, borderColor: BLACK, borderWidth: 1.2 });

  // ---- Header -------------------------------------------------------------
  const trustName = process.env.NEXT_PUBLIC_TRUST_NAME || 'Pune CKP Family Public Trust';
  const regNo = process.env.NEXT_PUBLIC_TRUST_REG_NO || 'E-8167, Dated: 14th May 2018';
  const pan = process.env.NEXT_PUBLIC_TRUST_PAN || 'AADTP7440A';
  const address = process.env.NEXT_PUBLIC_TRUST_ADDRESS || '602, Niranka CHS, Ideal Society, Paud Road, Kothrud, Pune - 411038';
  const phone = process.env.NEXT_PUBLIC_TRUST_PHONE || '7447794477';
  const email = process.env.NEXT_PUBLIC_TRUST_EMAIL || 'puneckpfamily@gmail.com';
  const website = process.env.NEXT_PUBLIC_TRUST_WEBSITE || 'https://puneckptrust.in';

  // Logo. NOTE: keep the PDFImage and its scaled size in separate variables —
  // image.scale() returns only {width,height}, and drawImage needs the image.
  let logo = null;
  let logoSize = null;
  try {
    // Use the downscaled copy: pdf-lib embeds a PNG at native resolution, so the
    // 2042px master would add ~1.5MB to every receipt. See scripts/make-receipt-logo.js.
    const logoPath = ['logo-receipt.png', 'logo.png']
      .map((f) => path.join(process.cwd(), 'public', 'logo', f))
      .find((p) => fs.existsSync(p));
    if (logoPath) {
      logo = await doc.embedPng(fs.readFileSync(logoPath));
      logoSize = logo.scale(58 / logo.width);
    }
  } catch {
    logo = null;
    logoSize = null;
  }

  if (logo && logoSize) {
    page.drawImage(logo, { x: 32, y: H - 32 - logoSize.height, width: logoSize.width, height: logoSize.height });
  } else {
    page.drawCircle({ x: 61, y: H - 62, size: 28, borderColor: BLACK, borderWidth: 1.2 });
    text('CKP', 47, H - 66, { size: 11, font: serifBold });
  }

  // The header block is centred on the page but confined to the strip between the
  // logo and its mirror image on the right, so a long address can never run under
  // the logo or out through the border.
  const HEAD = { left: 98, right: W - 98 };
  centered(trustName, H - 56, { size: 20, font: serifBold, color: BLACK, ...HEAD });
  centered(`Registration No. ${regNo} | PAN No.: ${pan}`, H - 72, { size: 8.5, ...HEAD });
  centered(`${address}.   Ph: ${phone}`, H - 85, { size: 8.5, ...HEAD });
  centered(`Email: ${email} | Website: ${website}`, H - 98, { size: 8.5, ...HEAD });
  // A rule closes the header so its last line can never sit on the first body row.
  page.drawLine({ start: { x: 32, y: H - 108 }, end: { x: W - 32, y: H - 108 }, thickness: 0.6, color: RULE });

  // ---- Body rows ----------------------------------------------------------
  const L = 36;             // left label column
  const R = W - 36;         // right edge
  const GAP = 5;            // space between a label and its value
  const paidDate = payment.paid_at || payment.created_at || new Date();
  const bold = { size: 9.5, font: serifBold };

  let y = 292;
  const STEP = 25;

  // Receipt No. + Date
  let x = text('Receipt No :', L, y, bold) + GAP;
  const dateLabelX = R - 120;
  fit(payment.receipt_no || '', x, y, dateLabelX - 12 - x);
  x = text('Date :', dateLabelX, y, bold) + GAP;
  fit(fmtDate(paidDate), x, y, R - x);

  // Received with thanks from
  y -= STEP;
  x = text('Received with thanks from Mr/Mrs/Ms', L, y, bold) + GAP + 3;
  rule(x, R, y);
  fit(payment.payer_name || '', x + 4, y, R - x - 6, { size: 10 });

  // Address
  y -= STEP;
  x = text('Address :', L, y, bold) + GAP + 3;
  rule(x, R, y);
  fit(payment.payer_address || '', x + 4, y, R - x - 6, { size: 9 });

  // Mobile + Email
  y -= STEP;
  x = text('Mobile No. :', L, y, bold) + GAP + 3;
  const emailLabelX = L + 200;
  rule(x, emailLabelX - 12, y);
  fit(payment.payer_phone || '', x + 4, y, emailLabelX - 16 - x);
  x = text('Email ID :', emailLabelX, y, bold) + GAP + 3;
  rule(x, R, y);
  fit(payment.payer_email || '', x + 4, y, R - x - 6, { size: 9 });

  // Amount in words
  y -= STEP;
  x = text('The Sum of Rupees (In Words)', L, y, bold) + GAP + 3;
  const onlyW = serif.widthOfTextAtSize('Only', 9.5);
  rule(x, R - onlyW - 6, y);
  const words = payment.amount_in_words || `${rupeesToWords(payment.amount)} Only`;
  fit(String(words).replace(/\s*Only\.?$/i, '').replace(/^\s*Rupees\s+/i, ''), x + 4, y, R - onlyW - 12 - x);
  text('Only', R - onlyW, y);

  // Payment mode — the two modes that do not apply are struck through, as on the paper form
  y -= STEP;
  const mode = String(payment.mode || 'transfer').toLowerCase();
  const paid = mode === 'cash' ? 'Cash' : mode === 'cheque' ? 'Cheque' : 'Transfer';
  x = text('By ', L, y, bold);
  ['Cash', 'Cheque', 'Transfer'].forEach((label, i) => {
    if (i > 0) x = text(' / ', x, y, bold);
    const start = x;
    x = text(label, x, y, bold);
    if (label !== paid) {
      page.drawLine({ start: { x: start, y: y + 3 }, end: { x, y: y + 3 }, thickness: 0.7, color: INK });
    }
  });
  x += GAP + 5;
  const datedLabelX = R - 132;
  rule(x, datedLabelX - 12, y);
  fit(payment.razorpay_payment_id || payment.payment_ref || '', x + 4, y, datedLabelX - 16 - x, { size: 9 });
  x = text('Dated :', datedLabelX, y, bold) + GAP + 3;
  rule(x, R, y);
  fit(fmtDate(paidDate), x + 4, y, R - x - 6);

  // Drawn On (blank for online payments, kept so the form matches the book)
  y -= STEP;
  x = text('Drawn On', L, y, bold) + GAP + 3;
  rule(x, R, y);
  fit(payment.drawn_on || '', x + 4, y, R - x - 6);

  // Towards / Valid Till / Membership No. The row is divided into three slots only
  // when the two membership fields are present; a donation gets the full width.
  y -= STEP;
  const hasValid = Boolean(payment.valid_till);
  const hasMemNo = Boolean(payment.membership_no);
  const validLabelX = L + 212;
  const memLabelX = hasValid ? L + 356 : L + 300;
  const towardsEnd = hasValid ? validLabelX - 10 : hasMemNo ? memLabelX - 10 : R;

  x = text('Towards :', L, y, bold) + GAP + 3;
  rule(x, towardsEnd, y);
  fit(payment.towards || '', x + 4, y, towardsEnd - x - 6);

  if (hasValid) {
    x = text('Valid Till :', validLabelX, y, bold) + GAP + 3;
    const end = hasMemNo ? memLabelX - 10 : R;
    rule(x, end, y);
    fit(fmtDateLong(payment.valid_till), x + 4, y, end - x - 6, { size: 9 });
  }
  if (hasMemNo) {
    x = text('Membership No :', memLabelX, y, bold) + GAP + 3;
    rule(x, R, y);
    fit(payment.membership_no, x + 4, y, R - x - 6, { size: 9 });
  }

  // ---- Amount box ---------------------------------------------------------
  const boxX = 34;
  const boxY = 52;
  const boxW = 134;
  const boxH = 38;
  page.drawRectangle({ x: boxX, y: boxY, width: boxW, height: boxH, borderColor: BLACK, borderWidth: 1.6 });

  const amountStr = formatINR(payment.amount);
  let amountX = boxX + 10;
  if (hasRupeeGlyph) {
    page.drawText('₹', { x: amountX, y: boxY + 12, size: 15, font: rupeeFont, color: BLACK });
    amountX += rupeeFont.widthOfTextAtSize('₹', 15) + 6;
  } else {
    amountX = text('Rs.', amountX, boxY + 12, { size: 14, font: serifBold, color: BLACK }) + 6;
  }
  fit(amountStr, amountX, boxY + 12, boxX + boxW - 8 - amountX, { size: 15, font: serifBold, color: BLACK, min: 8 });

  // Conditions, to the right of the box
  const noteX = boxX + boxW + 8;
  text('- Subject to Realisation of Cheque / DD / P.O.', noteX, boxY + 26, { size: 6.8, color: RULE });
  text('- Pune Jurisdiction only', noteX, boxY + 15, { size: 6.8, color: RULE });
  text('- Non Refundable', noteX, boxY + 4, { size: 6.8, color: RULE });

  // ---- Signature block ----------------------------------------------------
  // Starts clear of the conditions on its left and is fitted to the right margin.
  const sigBlockX = W - 228;
  fit(`For ${trustName}`, sigBlockX, boxY + 38, R - sigBlockX, { size: 8.5 });
  text('This is Computer Generated', sigBlockX, boxY + 27, { size: 8.5 });
  text('Receipt does not require Signature', sigBlockX, boxY + 16, { size: 8.5 });

  // Both signature lines sit below the three notices, not across them.
  const signY = 36;
  page.drawLine({ start: { x: sigBlockX, y: signY }, end: { x: sigBlockX + 88, y: signY }, thickness: 0.6, color: RULE });
  text('Received Sign', sigBlockX + 18, signY - 10, { size: 8, color: RULE });
  page.drawLine({ start: { x: R - 88, y: signY }, end: { x: R, y: signY }, thickness: 0.6, color: RULE });
  text('Authorised Sign', R - 72, signY - 10, { size: 8, color: RULE });

  return doc.save({ useObjectStreams: false });
}
