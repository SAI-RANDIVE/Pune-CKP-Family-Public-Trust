import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';
import path from 'path';
import { rupeesToWords } from './numberToWords';

/**
 * Generates the trust's official receipt as an A5 landscape PDF, laid out to
 * match the Trust's printed receipt book.
 *
 * Two things worth knowing before editing:
 *
 * 1. The standard PDF fonts (Times/Helvetica) are WinAnsi-encoded and have no
 *    rupee glyph (₹, U+20B9). So Times is used for everything — which is what
 *    the paper receipt looks like — and a *subset* of Noto Sans is embedded
 *    purely to draw the ₹ in the amount box. Subsetting keeps that to a few KB.
 *
 * 2. `PDFImage.scale()` returns a plain {width, height} size object, NOT a
 *    PDFImage. Passing its result to drawImage throws. Keep the image and the
 *    dimensions in separate variables.
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
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(value || 0));
}

/**
 * @param {object} payment - a row from `payments`, joined with member info
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

  const text = (str, x, y, { size = 9.5, font = serif, color = INK } = {}) =>
    page.drawText(String(str ?? ''), { x, y, size, font, color });

  const centered = (str, y, { size = 9.5, font = serif, color = INK } = {}) => {
    const s = String(str ?? '');
    page.drawText(s, { x: (W - font.widthOfTextAtSize(s, size)) / 2, y, size, font, color });
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

  centered(trustName, H - 62, { size: 20, font: serifBold, color: BLACK });
  centered(`Registration No. ${regNo} | PAN No.: ${pan}`, H - 80, { size: 8.5 });
  centered(`${address}.   Ph: ${phone}`, H - 94, { size: 8.5 });
  centered(`Email: ${email} | Website: ${website}`, H - 108, { size: 8.5 });

  // ---- Body rows ----------------------------------------------------------
  const L = 36;             // left label column
  const R = W - 36;         // right edge
  const paidDate = payment.paid_at || payment.created_at || new Date();

  let y = 300;
  const STEP = 26;

  // Receipt No. + Date
  text('Receipt No :', L, y, { size: 9.5, font: serifBold });
  text(payment.receipt_no || '', L + 68, y);
  text('Date :', R - 120, y, { size: 9.5, font: serifBold });
  text(fmtDate(paidDate), R - 62, y);

  // Received with thanks from
  y -= STEP;
  const fromLabel = 'Received with thanks from Mr/Mrs/Ms';
  text(fromLabel, L, y, { size: 9.5, font: serifBold });
  const fromX = L + serifBold.widthOfTextAtSize(fromLabel, 9.5) + 12;
  rule(fromX, R, y);
  text(payment.payer_name || '', fromX + 60, y);

  // Address
  y -= STEP;
  text('Address :', L, y, { size: 9.5, font: serifBold });
  rule(L + 58, R, y);
  text(payment.payer_address || '', L + 62, y, { size: 8.6 });

  // Mobile + Email
  y -= STEP;
  text('Mobile No. :', L, y, { size: 9.5, font: serifBold });
  rule(L + 70, L + 260, y);
  text(payment.payer_phone || '', L + 74, y);
  text('Email ID:', L + 285, y, { size: 9.5, font: serifBold });
  rule(L + 340, R, y);
  text(payment.payer_email || '', L + 344, y, { size: 8.8 });

  // Amount in words
  y -= STEP;
  text('The Sum of Rupees (In Words)', L, y, { size: 9.5, font: serifBold });
  text('Rupees', L + 158, y, { size: 9.5 });
  rule(L + 200, R, y);
  const words = payment.amount_in_words || `${rupeesToWords(payment.amount)} Only`;
  text(words.replace(/\s*Only\.?$/i, ''), L + 240, y, { size: 9.5 });
  text('Only', R - 28, y, { size: 9.5 });

  // Payment mode — "Cash" and "Cheque" struck through, as on the paper form
  y -= STEP;
  const byX = L;
  text('By', byX, y, { size: 9.5, font: serifBold });
  const cashX = byX + serifBold.widthOfTextAtSize('By ', 9.5);
  const struck = 'Cash / Cheque';
  text(struck, cashX, y, { size: 9.5, font: serifBold });
  const struckW = serifBold.widthOfTextAtSize(struck, 9.5);
  page.drawLine({ start: { x: cashX, y: y + 3 }, end: { x: cashX + struckW, y: y + 3 }, thickness: 0.7, color: INK });
  text(' / Transfer', cashX + struckW, y, { size: 9.5, font: serifBold });
  const modeX = cashX + struckW + serifBold.widthOfTextAtSize(' / Transfer', 9.5) + 14;
  rule(modeX, R - 150, y);
  text(payment.razorpay_payment_id || '', modeX + 40, y, { size: 8.8 });
  text('Dated :', R - 140, y, { size: 9.5, font: serifBold });
  rule(R - 88, R, y);
  text(fmtDate(paidDate), R - 78, y);

  // Drawn On (blank for online payments, kept so the form matches the book)
  y -= STEP;
  text('Drawn On', L, y, { size: 9.5, font: serifBold });
  rule(L + 62, R, y);

  // Towards / Valid Till / Membership No.
  y -= STEP;
  text('Towards :', L, y, { size: 9.5, font: serifBold });
  const towards = payment.towards || '';
  rule(L + 62, L + 235, y);
  text(towards, L + 66, y, { size: 9.5 });

  if (payment.valid_till) {
    text('Valid Till :', L + 250, y, { size: 9.5, font: serifBold });
    rule(L + 305, L + 395, y);
    text(fmtDateLong(payment.valid_till), L + 309, y, { size: 9 });
  }
  if (payment.membership_no) {
    text('Membership No:', L + 408, y, { size: 9.5, font: serifBold });
    rule(L + 490, R, y);
    text(payment.membership_no, L + 494, y, { size: 9 });
  }

  // ---- Amount box ---------------------------------------------------------
  const boxX = 34;
  const boxY = 52;
  const boxW = 134;
  const boxH = 38;
  page.drawRectangle({ x: boxX, y: boxY, width: boxW, height: boxH, borderColor: BLACK, borderWidth: 1.6 });

  const amountStr = formatINR(payment.amount);
  if (hasRupeeGlyph) {
    page.drawText('₹', { x: boxX + 12, y: boxY + 12, size: 15, font: rupeeFont, color: BLACK });
  } else {
    text('Rs.', boxX + 10, boxY + 12, { size: 14, font: serifBold, color: BLACK });
  }
  text(amountStr, boxX + 46, boxY + 12, { size: 15, font: serifBold, color: BLACK });

  // Conditions, to the right of the box
  const noteX = boxX + boxW + 8;
  text('- Subject to Realisation of Cheque / DD / P.O.', noteX, boxY + 26, { size: 6.8, color: RULE });
  text('- Pune Jurisdiction only', noteX, boxY + 15, { size: 6.8, color: RULE });
  text('- Non Refundable', noteX, boxY + 4, { size: 6.8, color: RULE });

  // ---- Signature block ----------------------------------------------------
  const sigBlockX = W - 250;
  text(`For ${trustName}`, sigBlockX, boxY + 38, { size: 8.5 });
  text('This is Computer Generated', sigBlockX, boxY + 27, { size: 8.5 });
  text('Receipt does not require Signature', sigBlockX, boxY + 16, { size: 8.5 });

  page.drawLine({ start: { x: 300, y: 40 }, end: { x: 410, y: 40 }, thickness: 0.6, color: RULE });
  text('Received Sign', 322, 29, { size: 8.5, color: RULE });
  page.drawLine({ start: { x: 450, y: 40 }, end: { x: R, y: 40 }, thickness: 0.6, color: RULE });
  text('Authorised Sign', 478, 29, { size: 8.5, color: RULE });

  return doc.save({ useObjectStreams: false });
}
