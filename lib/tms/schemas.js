import { z } from 'zod';
import { todayIso } from './format';

/**
 * Input validation for every form of the management system. Messages are
 * error codes; the caller turns them into Marathi or English with
 * t(`err.${code}`). Nothing from the browser reaches SQL without passing
 * through one of these.
 */

const clean = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim() : v);
const blankToNull = (v) => {
  const c = clean(v);
  return c === '' || c === undefined ? null : c;
};

export const text = (max = 200, min = 1) => z.preprocess(clean, z.string({ required_error: 'required', invalid_type_error: 'required' }).min(min, 'required').max(max, 'too_long'));
export const optText = (max = 200) => z.preprocess(blankToNull, z.string().max(max, 'too_long').nullable());
export const uuid = z.string({ required_error: 'required' }).uuid('required');
export const optUuid = z.preprocess(blankToNull, z.string().uuid('invalid').nullable());

const isRealDate = (s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** yyyy-mm-dd, a real calendar day, from 2000 up to `maxFutureDays` after today. */
export const date = ({ future = 0 } = {}) => z.preprocess(clean,
  z.string({ required_error: 'required', invalid_type_error: 'required' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date')
    .refine(isRealDate, 'date')
    .refine((s) => s >= '2000-01-01', 'date_old')
    .refine((s) => {
      if (future === null) return true;
      const limit = new Date(`${todayIso()}T00:00:00Z`);
      limit.setUTCDate(limit.getUTCDate() + future);
      return s <= limit.toISOString().slice(0, 10);
    }, 'date_future'));

export const optDate = (opts = { future: null }) => z.preprocess(blankToNull, date(opts).nullable());

/** Rupees: more than zero, at most ten crore, at most two decimals. */
export const amount = z.preprocess(
  (v) => (typeof v === 'string' ? Number(v.replace(/[,\s₹]/g, '')) : v),
  z.number({ required_error: 'amount', invalid_type_error: 'amount' })
    .finite('amount').positive('amount').max(100000000, 'amount_big')
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'amount_paise')
);
export const optAmount = z.preprocess((v) => (v === '' || v === null || v === undefined ? null : v), amount.nullable());

export const INCOME_KINDS = ['donation', 'membership_fee', 'sponsorship', 'advertisement', 'event_fee', 'csr_grant', 'book_sale', 'interest', 'other'];
export const MODES = ['cash', 'cheque', 'upi', 'neft', 'online', 'other'];
export const TIERS = ['silver', 'gold', 'platinum'];
export const ROLE_VALUES = ['super_admin', 'admin', 'accountant', 'viewer'];
export const PERSON_ROLES = ['member', 'donor', 'beneficiary', 'vendor', 'trustee', 'organisation'];

const phone = z.preprocess(
  (v) => {
    const c = blankToNull(v);
    return c ? String(c).replace(/[\s\-()]/g, '').replace(/^\+91(?=\d{10}$)/, '') : null;
  },
  // Mobile numbers and landlines with STD code; the old registers hold both.
  z.string().regex(/^\d{8,12}$/, 'phone').nullable()
);
const email = z.preprocess((v) => { const c = blankToNull(v); return c ? String(c).toLowerCase() : null; },
  z.string().max(254, 'too_long').regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'email').nullable());
const pan = z.preprocess((v) => { const c = blankToNull(v); return c ? String(c).toUpperCase().replace(/\s/g, '') : null; },
  z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'pan').nullable());
const aadhaar = z.preprocess((v) => { const c = blankToNull(v); return c ? String(c).replace(/[\s-]/g, '') : null; },
  z.string().regex(/^\d{12}$/, 'aadhaar').nullable());

/** A person chosen in a form: an existing record, or a new name typed in. */
const personRef = z.object({
  id: optUuid,
  name: text(120, 2),
}, { required_error: 'person', invalid_type_error: 'person' });
const optPersonRef = z.preprocess((v) => (v && typeof v === 'object' && (v.id || clean(v.name)) ? v : null), personRef.nullable());

export const personSchema = z.object({
  name_en: text(120, 2),
  name_mr: optText(120),
  phone,
  phone_alt: phone,
  email,
  address: optText(400),
  city: optText(80),
  pincode: z.preprocess(blankToNull, z.string().regex(/^\d{6}$/, 'pincode').nullable()),
  date_of_birth: optDate({ future: 0 }),
  blood_group: z.preprocess(blankToNull, z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).nullable()),
  roles: z.array(z.enum(PERSON_ROLES)).max(6).default([]),
  notes: optText(1000),
  // Only read when the user is allowed to see identity numbers.
  pan: pan.optional(),
  aadhaar: aadhaar.optional(),
});

export const incomeSchema = z.object({
  person: personRef,
  donor_phone: phone.optional(),
  donor_email: email.optional(),
  donor_address: optText(400).optional(),
  donor_pan: pan.optional(),
  amount,
  entry_date: date({ future: 0 }),
  kind: z.enum(INCOME_KINDS, { required_error: 'required', invalid_type_error: 'required' }),
  mode: z.enum(MODES, { required_error: 'required', invalid_type_error: 'required' }),
  payment_ref: optText(80),
  bank_account_id: optUuid,
  purpose: optText(300),
  fund_id: optUuid,
  event_id: optUuid,
  scheme_id: optUuid,
  category_id: optUuid,
  notes: optText(1000),
}).superRefine((v, ctx) => {
  if (v.mode === 'cheque' && !v.payment_ref) ctx.addIssue({ code: 'custom', path: ['payment_ref'], message: 'cheque_no' });
});

export const expenseSchema = z.object({
  entry_date: date({ future: 0 }),
  payee: optPersonRef,
  payee_text: optText(160),
  amount,
  cash_amount: optAmount,
  bank_amount: optAmount,
  category_id: uuid,
  particulars: text(400, 2),
  mode: z.enum(MODES, { required_error: 'required', invalid_type_error: 'required' }),
  cheque_no: optText(40),
  bank_account_id: optUuid,
  voucher_no: optText(40),
  event_id: optUuid,
  scheme_id: optUuid,
  fund_id: optUuid,
  approved_by: optText(120),
  notes: optText(1000),
}).superRefine((v, ctx) => {
  if (!v.payee && !v.payee_text) ctx.addIssue({ code: 'custom', path: ['payee'], message: 'person' });
  if (v.mode === 'cheque' && !v.cheque_no) ctx.addIssue({ code: 'custom', path: ['cheque_no'], message: 'cheque_no' });
  if (v.cash_amount != null || v.bank_amount != null) {
    const sum = (v.cash_amount || 0) + (v.bank_amount || 0);
    if (Math.abs(sum - v.amount) > 0.005) ctx.addIssue({ code: 'custom', path: ['cash_amount'], message: 'split' });
  }
});

export const fdSchema = z.object({
  bank: text(120, 2),
  branch: optText(120),
  fd_number: optText(60),
  principal: amount,
  rate_pct: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number({ invalid_type_error: 'rate_pct' }).min(0, 'rate_pct').max(25, 'rate_pct').nullable()),
  start_date: date({ future: 0 }),
  maturity_date: date({ future: null }),
  maturity_amount: optAmount,
  fund_id: optUuid,
  notes: optText(1000),
}).superRefine((v, ctx) => {
  if (v.maturity_date <= v.start_date) ctx.addIssue({ code: 'custom', path: ['maturity_date'], message: 'maturity_before' });
  if (v.maturity_amount != null && v.maturity_amount < v.principal) ctx.addIssue({ code: 'custom', path: ['maturity_amount'], message: 'maturity_less' });
});

export const fdEventSchema = z.object({
  fixed_deposit_id: uuid,
  kind: z.enum(['interest', 'tds'], { required_error: 'required', invalid_type_error: 'required' }),
  event_date: date({ future: 0 }),
  amount,
  label: optText(200),
});

export const disbursementSchema = z.object({
  scheme_id: uuid,
  person: optPersonRef,
  beneficiary_text: optText(200),
  beneficiary_count: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().int('count').min(1, 'count').max(100000, 'count').nullable()),
  amount,
  disbursed_on: date({ future: 366 }),
  status: z.enum(['paid', 'planned'], { required_error: 'required', invalid_type_error: 'required' }),
  institution: optText(200),
  notes: optText(1000),
}).superRefine((v, ctx) => {
  if (!v.person && !v.beneficiary_text) ctx.addIssue({ code: 'custom', path: ['person'], message: 'person' });
  if (v.status === 'paid' && v.disbursed_on > todayIso()) ctx.addIssue({ code: 'custom', path: ['disbursed_on'], message: 'date_future' });
});

export const password = z.string({ required_error: 'required' }).min(10, 'password_short').max(200, 'too_long')
  .refine((s) => /[A-Za-z]/.test(s) && /[0-9]/.test(s), 'password_weak');

export const userSchema = z.object({
  name: text(120, 2),
  email: z.preprocess((v) => String(clean(v) || '').toLowerCase(), z.string().max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'email')),
  username: z.preprocess((v) => { const c = blankToNull(v); return c ? String(c).toLowerCase() : null; },
    z.string().regex(/^[a-z0-9._-]{3,30}$/, 'username').nullable()),
  role: z.enum(ROLE_VALUES, { required_error: 'required', invalid_type_error: 'required' }),
});

export const categorySchema = z.object({
  kind: z.enum(['income', 'expense']),
  name_en: text(120, 2),
  name_mr: optText(120),
});

/**
 * Runs a schema. Returns { ok: true, data } or { ok: false, errors } where
 * errors maps each field name to an error code (first problem per field).
 */
export function check(schema, input) {
  const result = schema.safeParse(input ?? {});
  if (result.success) return { ok: true, data: result.data };
  const errors = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '_form');
    if (!errors[field]) {
      const known = /^[a-z_]+$/.test(issue.message) ? issue.message : (issue.code === 'invalid_enum_value' || issue.code === 'invalid_type' ? 'required' : 'invalid');
      errors[field] = known;
    }
  }
  return { ok: false, errors };
}

/** Reads plain fields out of a FormData into an object (for simple server-rendered forms). */
export function formObject(formData, fields) {
  const out = {};
  for (const name of fields) out[name] = formData.get(name);
  return out;
}
