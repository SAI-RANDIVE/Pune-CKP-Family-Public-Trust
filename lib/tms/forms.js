import { one } from './db';
import { options } from './lookups';
import { INCOME_KINDS, MODES, PERSON_ROLES } from './schemas';
import { todayIso } from './format';

/**
 * Step definitions for the entry forms (components/tms/Wizard.js). Built on
 * the server in the user's language and passed to the browser as plain data.
 */

const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((v) => ({ value: v, label: v }));

export async function loadDraft(admin, formKey) {
  const row = await one('select data from form_drafts where admin_id = $1 and form_key = $2', [admin.id, formKey]);
  return row?.data && typeof row.data === 'object' ? row.data : null;
}

export function personSteps(t, { seeIds }) {
  return [
    {
      id: 'name', title: t('pf.s.name'), intro: t('pf.s.name_intro'),
      fields: [
        { name: 'name_en', type: 'text', label: t('pf.name_en'), required: true, placeholder: 'Suresh Ramchandra Pradhan', hint: t('pf.name_en_hint'), max: 120 },
        { name: 'name_mr', type: 'text', label: t('pf.name_mr'), placeholder: 'सुरेश रामचंद्र प्रधान', max: 120 },
        { name: 'roles', type: 'checks', label: t('pf.roles'), options: options.keyed(PERSON_ROLES, t, 'prole') },
      ],
    },
    {
      id: 'contact', title: t('pf.s.contact'), intro: t('pf.s.contact_intro'),
      fields: [
        { name: 'phone', type: 'tel', label: t('f.phone'), placeholder: '9822012345', hint: t('pf.phone_hint'), max: 15 },
        { name: 'phone_alt', type: 'tel', label: t('pf.phone_alt'), placeholder: '02025431234', max: 15 },
        { name: 'email', type: 'email', label: t('f.email'), placeholder: 'name@example.com', max: 254 },
        { name: 'address', type: 'textarea', label: t('f.address'), placeholder: t('pf.address_ph'), max: 400 },
        { name: 'city', type: 'text', label: t('pf.city'), placeholder: 'Pune', max: 80 },
        { name: 'pincode', type: 'text', label: t('pf.pincode'), placeholder: '411038', max: 6 },
      ],
    },
    {
      id: 'more', title: t('pf.s.more'), intro: t('pf.s.more_intro'),
      fields: [
        { name: 'date_of_birth', type: 'date', label: t('pf.dob'), maxDate: todayIso() },
        { name: 'blood_group', type: 'select', label: t('pf.blood'), options: BLOOD },
        ...(seeIds ? [
          { name: 'pan', type: 'text', label: t('f.pan'), placeholder: 'ABCDE1234F', hint: t('pf.pan_hint'), max: 10 },
          { name: 'aadhaar', type: 'text', label: t('f.aadhaar'), placeholder: '1234 5678 9012', hint: t('pf.aadhaar_hint'), max: 14 },
        ] : []),
        { name: 'notes', type: 'textarea', label: t('f.notes'), max: 1000 },
      ],
    },
  ];
}

export function incomeSteps(t, lang, look, { edit = false } = {}) {
  return [
    {
      id: 'who', title: t('inc.s.who'), intro: t('inc.s.who_intro'),
      fields: [
        { name: 'person', type: 'person', label: t('inc.person'), required: true, hint: t('inc.person_hint') },
        { name: 'donor_phone', type: 'tel', label: t('f.phone'), placeholder: '9822012345', showIf: { field: 'person', isNew: true }, max: 15 },
        { name: 'donor_email', type: 'email', label: t('f.email'), placeholder: 'name@example.com', hint: t('inc.email_hint'), showIf: { field: 'person', isNew: true }, max: 254 },
        { name: 'donor_address', type: 'textarea', label: t('f.address'), showIf: { field: 'person', isNew: true }, max: 400 },
        { name: 'donor_pan', type: 'text', label: t('f.pan'), placeholder: 'ABCDE1234F', showIf: { field: 'person', isNew: true }, max: 10 },
      ],
    },
    {
      id: 'amount', title: t('inc.s.amount'), intro: t('inc.s.amount_intro'),
      fields: [
        { name: 'amount', type: 'amount', label: t('f.amount'), required: true, placeholder: '5000', hint: t('inc.amount_hint') },
        { name: 'entry_date', type: 'date', label: t('inc.date'), required: true, maxDate: todayIso(), hint: t('f.date_hint') },
        ...(edit ? [] : [{ name: 'kind', type: 'choice', label: t('inc.kind'), required: true, options: options.keyed(INCOME_KINDS, t, 'kind') }]),
      ],
    },
    {
      id: 'how', title: t('inc.s.how'), intro: t('inc.s.how_intro'),
      fields: [
        { name: 'mode', type: 'choice', label: t('f.mode'), required: true, options: options.keyed(MODES, t, 'mode') },
        { name: 'payment_ref', type: 'text', label: t('inc.ref'), placeholder: '123456', hint: t('inc.ref_hint'), showIf: { field: 'mode', in: ['cheque', 'upi', 'neft', 'online', 'other'] }, max: 80 },
        { name: 'bank_account_id', type: 'select', label: t('inc.bank'), options: options.banks(look.banks), hint: t('inc.bank_hint') },
      ],
    },
    {
      id: 'purpose', title: t('inc.s.purpose'), intro: t('inc.s.purpose_intro'),
      fields: [
        { name: 'purpose', type: 'text', label: t('inc.purpose'), placeholder: t('inc.purpose_ph'), max: 300 },
        { name: 'fund_id', type: 'select', label: t('f.fund'), options: options.named(look.funds, lang) },
        { name: 'event_id', type: 'select', label: t('f.event'), options: options.events(look.events, lang) },
        { name: 'scheme_id', type: 'select', label: t('f.scheme'), options: options.named(look.schemes, lang) },
        { name: 'category_id', type: 'select', label: t('f.category'), options: options.named(look.categories, lang) },
        { name: 'notes', type: 'textarea', label: t('f.notes'), max: 1000 },
      ],
    },
  ];
}

export function expenseSteps(t, lang, look) {
  return [
    {
      id: 'what', title: t('exp.s.what'), intro: t('exp.s.what_intro'),
      fields: [
        { name: 'entry_date', type: 'date', label: t('exp.date'), required: true, maxDate: todayIso(), hint: t('f.date_hint') },
        { name: 'payee', type: 'person', label: t('exp.payee'), required: true, hint: t('exp.payee_hint') },
        { name: 'particulars', type: 'textarea', label: t('exp.particulars'), required: true, placeholder: t('exp.particulars_ph'), max: 400 },
        { name: 'category_id', type: 'select', label: t('f.category'), required: true, options: options.named(look.categories, lang) },
      ],
    },
    {
      id: 'amount', title: t('exp.s.amount'), intro: t('exp.s.amount_intro'),
      fields: [
        { name: 'amount', type: 'amount', label: t('exp.amount'), required: true, placeholder: '2500' },
        { name: 'mode', type: 'choice', label: t('f.mode'), required: true, options: options.keyed(MODES, t, 'mode') },
        { name: 'cheque_no', type: 'text', label: t('exp.cheque_no'), placeholder: '004512', showIf: { field: 'mode', in: ['cheque'] }, max: 40 },
        { name: 'bank_account_id', type: 'select', label: t('exp.bank'), options: options.banks(look.banks), showIf: { field: 'mode', in: ['cheque', 'upi', 'neft', 'online', 'other'] } },
        { name: 'cash_amount', type: 'amount', label: t('exp.cash_part'), hint: t('exp.split_hint'), placeholder: '0' },
        { name: 'bank_amount', type: 'amount', label: t('exp.bank_part'), placeholder: '0' },
      ],
    },
    {
      id: 'more', title: t('exp.s.more'), intro: t('exp.s.more_intro'),
      fields: [
        { name: 'voucher_no', type: 'text', label: t('exp.voucher_no'), hint: t('exp.voucher_hint'), placeholder: 'V-125', max: 40 },
        { name: 'event_id', type: 'select', label: t('f.event'), options: options.events(look.events, lang) },
        { name: 'scheme_id', type: 'select', label: t('f.scheme'), options: options.named(look.schemes, lang) },
        { name: 'fund_id', type: 'select', label: t('f.fund'), options: options.named(look.funds, lang) },
        { name: 'approved_by', type: 'text', label: t('exp.approved_by'), placeholder: t('exp.approved_ph'), max: 120 },
        { name: 'notes', type: 'textarea', label: t('f.notes'), max: 1000 },
        { name: 'attachment', type: 'file', label: t('exp.attachment'), hint: t('exp.attachment_hint') },
      ],
    },
  ];
}

export function depositSteps(t, lang, look) {
  return [
    {
      id: 'bank', title: t('fdf.s.bank'), intro: t('fdf.s.bank_intro'),
      fields: [
        { name: 'bank', type: 'text', label: t('f.bank'), required: true, placeholder: 'Saraswat Co-operative Bank', max: 120 },
        { name: 'branch', type: 'text', label: t('fdf.branch'), placeholder: 'Kothrud', max: 120 },
        { name: 'fd_number', type: 'text', label: t('fd.number'), placeholder: '0123456789', hint: t('fdf.number_hint'), max: 60 },
      ],
    },
    {
      id: 'money', title: t('fdf.s.money'), intro: t('fdf.s.money_intro'),
      fields: [
        { name: 'principal', type: 'amount', label: t('fd.principal'), required: true, placeholder: '100000' },
        { name: 'rate_pct', type: 'number', label: t('fd.rate'), placeholder: '7.25', hint: t('fdf.rate_hint'), max: 6 },
        { name: 'start_date', type: 'date', label: t('fd.start'), required: true, maxDate: todayIso() },
        { name: 'maturity_date', type: 'date', label: t('fd.maturity'), required: true },
        { name: 'maturity_amount', type: 'amount', label: t('fd.maturity_amount'), placeholder: '107450', hint: t('fdf.maturity_hint') },
      ],
    },
    {
      id: 'more', title: t('fdf.s.more'), intro: t('fdf.s.more_intro'),
      fields: [
        { name: 'fund_id', type: 'select', label: t('f.fund'), options: options.named(look.funds, lang) },
        { name: 'notes', type: 'textarea', label: t('f.notes'), max: 1000 },
        { name: 'attachment', type: 'file', label: t('fdf.attachment'), hint: t('exp.attachment_hint') },
      ],
    },
  ];
}

export function disbursementSteps(t) {
  return [
    {
      id: 'who', title: t('dsb.s.who'), intro: t('dsb.s.who_intro'),
      fields: [
        { name: 'person', type: 'person', label: t('dsb.person'), hint: t('dsb.person_hint') },
        { name: 'beneficiary_text', type: 'text', label: t('dsb.group'), placeholder: t('dsb.group_ph'), hint: t('dsb.group_hint'), max: 200 },
        { name: 'beneficiary_count', type: 'number', label: t('dsb.count'), placeholder: '25', max: 6 },
        { name: 'institution', type: 'text', label: t('dsb.institution'), placeholder: t('dsb.institution_ph'), max: 200 },
      ],
    },
    {
      id: 'amount', title: t('dsb.s.amount'), intro: t('dsb.s.amount_intro'),
      fields: [
        { name: 'status', type: 'choice', label: t('dsb.status'), required: true, options: [{ value: 'paid', label: t('dsb.status_paid') }, { value: 'planned', label: t('dsb.status_planned') }] },
        { name: 'amount', type: 'amount', label: t('f.amount'), required: true, placeholder: '10000' },
        { name: 'disbursed_on', type: 'date', label: t('dsb.date'), required: true, hint: t('dsb.date_hint') },
        { name: 'notes', type: 'textarea', label: t('f.notes'), max: 1000 },
      ],
    },
  ];
}
