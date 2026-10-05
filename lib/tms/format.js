/**
 * Formatting shared by server and browser code of the management system.
 * Pure functions only: no database, no Node-only modules.
 */
import { rupeesToWords } from '../numberToWords';

const IST_OFFSET_MS = 5.5 * 3600_000;

/** Rupees with Indian digit grouping: ₹1,23,456 (paise shown only when present). */
export function formatINR(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const hasPaise = Math.round(n * 100) % 100 !== 0;
  const body = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: hasPaise ? 2 : 0, maximumFractionDigits: 2,
  }).format(Math.abs(n));
  return `${n < 0 ? '−' : ''}₹${body}`;
}

/** Plain count with Indian grouping. */
export function formatNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? new Intl.NumberFormat('en-IN').format(n) : '—';
}

const pad = (n) => String(n).padStart(2, '0');

function parts(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (m && value.length <= 10) return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  // node-postgres hands back DATE columns as local midnight, so local getters are right.
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
}

/** dd-mm-yyyy, the way the trust writes dates. */
export function fmtDate(value) {
  const p = parts(value);
  return p ? `${pad(p.d)}-${pad(p.m)}-${p.y}` : '—';
}

/** yyyy-mm-dd, for <input type="date"> values and SQL parameters. */
export function isoDate(value) {
  const p = parts(value);
  return p ? `${p.y}-${pad(p.m)}-${pad(p.d)}` : '';
}

/** dd-mm-yyyy hh:mm in Indian time, for timestamps. */
export function fmtDateTime(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return `${pad(ist.getUTCDate())}-${pad(ist.getUTCMonth() + 1)}-${ist.getUTCFullYear()} ${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`;
}

/** Today's date in India as yyyy-mm-dd. */
export function todayIso() {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`;
}

/** Financial year label ("2026-27") for a yyyy-mm-dd date; April to March. */
export function fyOf(iso) {
  const p = parts(iso);
  if (!p) return null;
  const start = p.m >= 4 ? p.y : p.y - 1;
  return `${start}-${pad((start + 1) % 100)}`;
}

export const currentFy = () => fyOf(todayIso());

export function isFyLabel(value) {
  return /^20\d{2}-\d{2}$/.test(String(value || ''));
}

const MR_NUM = [
  'शून्य', 'एक', 'दोन', 'तीन', 'चार', 'पाच', 'सहा', 'सात', 'आठ', 'नऊ', 'दहा',
  'अकरा', 'बारा', 'तेरा', 'चौदा', 'पंधरा', 'सोळा', 'सतरा', 'अठरा', 'एकोणीस', 'वीस',
  'एकवीस', 'बावीस', 'तेवीस', 'चोवीस', 'पंचवीस', 'सव्वीस', 'सत्तावीस', 'अठ्ठावीस', 'एकोणतीस', 'तीस',
  'एकतीस', 'बत्तीस', 'तेहतीस', 'चौतीस', 'पस्तीस', 'छत्तीस', 'सदतीस', 'अडतीस', 'एकोणचाळीस', 'चाळीस',
  'एक्केचाळीस', 'बेचाळीस', 'त्रेचाळीस', 'चव्वेचाळीस', 'पंचेचाळीस', 'सेहेचाळीस', 'सत्तेचाळीस', 'अठ्ठेचाळीस', 'एकोणपन्नास', 'पन्नास',
  'एक्कावन्न', 'बावन्न', 'त्रेपन्न', 'चोपन्न', 'पंचावन्न', 'छप्पन्न', 'सत्तावन्न', 'अठ्ठावन्न', 'एकोणसाठ', 'साठ',
  'एकसष्ट', 'बासष्ट', 'त्रेसष्ट', 'चौसष्ट', 'पासष्ट', 'सहासष्ट', 'सदुसष्ट', 'अडुसष्ट', 'एकोणसत्तर', 'सत्तर',
  'एक्काहत्तर', 'बाहत्तर', 'त्र्याहत्तर', 'चौऱ्याहत्तर', 'पंच्याहत्तर', 'शहात्तर', 'सत्त्याहत्तर', 'अठ्ठ्याहत्तर', 'एकोणऐंशी', 'ऐंशी',
  'एक्क्याऐंशी', 'ब्याऐंशी', 'त्र्याऐंशी', 'चौऱ्याऐंशी', 'पंच्याऐंशी', 'शहाऐंशी', 'सत्त्याऐंशी', 'अठ्ठ्याऐंशी', 'एकोणनव्वद', 'नव्वद',
  'एक्क्याण्णव', 'ब्याण्णव', 'त्र्याण्णव', 'चौऱ्याण्णव', 'पंच्याण्णव', 'शहाण्णव', 'सत्त्याण्णव', 'अठ्ठ्याण्णव', 'नव्व्याण्णव',
];

function mrBelowThousand(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const out = [];
  if (h) out.push(`${MR_NUM[h]}शे`);
  if (rest) out.push(MR_NUM[rest]);
  return out.join(' ');
}

/** Whole rupees in Marathi words, Indian numbering (हजार, लाख, कोटी). */
export function rupeesToWordsMr(amount) {
  const n = Math.round(Number(amount) || 0);
  if (n <= 0) return MR_NUM[0];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  const out = [];
  if (crore) out.push(`${crore < 100 ? MR_NUM[crore] : mrBelowThousand(crore)} कोटी`);
  if (lakh) out.push(`${MR_NUM[lakh]} लाख`);
  if (thousand) out.push(`${MR_NUM[thousand]} हजार`);
  if (rest) out.push(mrBelowThousand(rest));
  return out.join(' ');
}

/** Amount in words in both languages, e.g. { mr: 'पाच हजार रुपये फक्त', en: 'Rupees Five Thousand Only' }. */
export function amountInWords(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n >= 1e10) return null;
  const rupees = Math.floor(n + 1e-9);
  const paise = Math.round((n - rupees) * 100);
  const mr = `${rupees ? `${rupeesToWordsMr(rupees)} रुपये` : ''}${paise ? `${rupees ? ' आणि ' : ''}${MR_NUM[paise]} पैसे` : ''} फक्त`;
  const en = `${rupees ? `Rupees ${rupeesToWords(rupees)}` : ''}${paise ? `${rupees ? ' and ' : ''}${rupeesToWords(paise)} Paise` : ''} Only`;
  return { mr, en };
}

/** 98xxxxxx10: enough to recognise a number without disclosing it. */
export function maskPhone(phone) {
  const s = String(phone || '').replace(/\D/g, '');
  if (!s) return '';
  return s.length <= 4 ? '••••' : `${s.slice(0, 2)}${'•'.repeat(Math.max(2, s.length - 4))}${s.slice(-2)}`;
}

/** Keeps the last four characters of a PAN or Aadhaar number. */
export function maskId(value) {
  const s = String(value || '').replace(/\s/g, '');
  if (!s) return '';
  return `${'•'.repeat(Math.max(4, s.length - 4))}${s.slice(-4)}`;
}

/** Picks the Marathi or English form of a bilingual record (name_mr / name_en and similar). */
export function pick(lang, mr, en) {
  return (lang === 'mr' ? (mr || en) : (en || mr)) || '';
}

export function personName(lang, p) {
  if (!p) return '';
  return pick(lang, p.name_mr, p.name_en) || p.payer_as_written || '';
}
