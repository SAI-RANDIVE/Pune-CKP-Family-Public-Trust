import { notFound } from 'next/navigation';
import { PageHead } from '../../../../../../components/tms/blocks';
import Wizard from '../../../../../../components/tms/Wizard';
import { requireOtp, requireRole } from '../../../../../../lib/tms/auth';
import { getI18n } from '../../../../../../lib/tms/i18n/server';
import { isUuid, one, q } from '../../../../../../lib/tms/db';
import { isoDate, pick } from '../../../../../../lib/tms/format';
import { getBankAccounts, getEvents, getFunds, getSchemes } from '../../../../../../lib/tms/lookups';
import { expenseSteps } from '../../../../../../lib/tms/forms';
import { updateExpense } from '../../../../../../lib/tms/actions/expenses';

export const dynamic = 'force-dynamic';

const num = (v) => (v == null || Number(v) === 0 ? '' : String(Number(v)));

/** Correct a voucher. Asks for the e-mailed code first; the old and new values go to the audit log. */
export default async function EditExpensePage({ params }) {
  const admin = await requireRole('accountant');
  if (!isUuid(params.id)) notFound();
  await requireOtp(admin, `/expenses/${params.id}/edit`);
  const { t, lang } = await getI18n();

  const e = await one(
    `select e.*, p.name_en, p.name_mr, p.code as person_code from expenses e left join people p on p.id = e.payee_person_id
      where e.id = $1 and e.deleted_at is null`, [params.id]);
  if (!e) notFound();
  const [banks, funds, events, schemes, categories] = await Promise.all([
    getBankAccounts(), getFunds(), getEvents(), getSchemes(),
    // Keep the entry's present head selectable even if it has since been switched off.
    q("select id, name_en, name_mr from categories where kind = 'expense' and (is_active or id = $1) order by name_en", [e.category_id]),
  ]);

  const split = e.cash_amount != null && e.bank_amount != null && Number(e.cash_amount) > 0 && Number(e.bank_amount) > 0;
  const initial = {
    entry_date: isoDate(e.entry_date),
    payee: e.payee_person_id
      ? { id: e.payee_person_id, name: pick(lang, e.name_mr, e.name_en), code: e.person_code }
      : (e.payee_as_written ? { id: null, name: e.payee_as_written } : null),
    particulars: e.particulars || '', category_id: e.category_id || '', amount: String(Number(e.amount)), mode: e.mode || '',
    cheque_no: e.cheque_no || '', bank_account_id: e.bank_account_id || '',
    cash_amount: split ? num(e.cash_amount) : '', bank_amount: split ? num(e.bank_amount) : '',
    voucher_no: e.voucher_no_as_written || '', event_id: e.event_id || '', scheme_id: e.scheme_id || '', fund_id: e.fund_id || '',
    approved_by: e.approved_by || '', notes: e.notes || '',
  };

  return (
    <>
      <PageHead
        title={t('exp.edit_title', { code: e.code })} intro={t('c.edit_intro')}
        crumbs={[{ href: '/expenses', label: t('exp.title') }, { href: `/expenses/${e.id}`, label: e.code }, { label: t('c.edit') }]}
      />
      <Wizard
        steps={expenseSteps(t, lang, { banks, funds, events, schemes, categories })}
        initial={initial} extra={{ id: e.id }} action={updateExpense}
        cancelHref={`/expenses/${e.id}`} submitLabel={t('c.save_changes')} uploadTable="expenses"
      />
    </>
  );
}
