import { q } from './db';
import { pick, fmtDate } from './format';

/** Reference lists used by the entry forms and filters. */

export async function getCategories(kind) {
  return q(
    `select id, code, kind, name_en, name_mr, is_active from categories
      where kind = $1 and is_active = true order by name_en`, [kind]);
}

export const getFunds = () => q('select id, code, name_en, name_mr from funds order by (code = \'general\') desc, name_en');

export const getEvents = () => q(
  `select id, code, name_en, name_mr, event_date, fy from events
    where deleted_at is null order by event_date desc nulls last, name_en limit 300`);

export const getSchemes = () => q('select id, code, name_en, name_mr from schemes where is_active = true order by code');

export const getBankAccounts = () => q(
  'select id, code, slug, bank, number_masked from bank_accounts where is_active = true order by code');

/** Financial years that hold any data, newest first, always including the current one. */
export async function getFiscalYears(current) {
  const rows = await q(
    `select label from fiscal_years f
      where exists (select 1 from income_entries i where i.fy = f.label)
         or exists (select 1 from expenses e where e.fy = f.label)
         or label = $1
      order by label desc`, [current]);
  return rows.map((r) => r.label);
}

/** { value, label } lists for <select> and the step forms. */
export const options = {
  named: (rows, lang) => rows.map((r) => ({ value: r.id, label: pick(lang, r.name_mr, r.name_en) })),
  events: (rows, lang) => rows.map((r) => ({
    value: r.id,
    label: `${pick(lang, r.name_mr, r.name_en)}${r.event_date ? ` (${fmtDate(r.event_date)})` : r.fy ? ` (${r.fy})` : ''}`,
  })),
  banks: (rows) => rows.map((r) => ({ value: r.id, label: `${r.bank}${r.number_masked ? ` (${r.number_masked})` : ''}` })),
  fys: (labels) => labels.map((l) => ({ value: l, label: l })),
  keyed: (values, t, prefix) => values.map((v) => ({ value: v, label: t(`${prefix}.${v}`) })),
};
