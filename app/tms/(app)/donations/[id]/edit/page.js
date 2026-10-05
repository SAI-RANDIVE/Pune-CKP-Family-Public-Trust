import { notFound } from 'next/navigation';
import { PageHead } from '../../../../../../components/tms/blocks';
import { Alert } from '../../../../../../components/tms/ui';
import Wizard from '../../../../../../components/tms/Wizard';
import { requireOtp, requireRole } from '../../../../../../lib/tms/auth';
import { getI18n } from '../../../../../../lib/tms/i18n/server';
import { isUuid, one } from '../../../../../../lib/tms/db';
import { isoDate, pick } from '../../../../../../lib/tms/format';
import { getBankAccounts, getCategories, getEvents, getFunds, getSchemes } from '../../../../../../lib/tms/lookups';
import { incomeSteps } from '../../../../../../lib/tms/forms';
import { INCOME_KINDS } from '../../../../../../lib/tms/schemas';
import { updateIncome } from '../../../../../../lib/tms/actions/income';

export const dynamic = 'force-dynamic';

/** Correct a money entry. Asks for the e-mailed code first; the old and new values go to the audit log. */
export default async function EditDonationPage({ params }) {
  const admin = await requireRole('accountant');
  if (!isUuid(params.id)) notFound();
  await requireOtp(admin, `/donations/${params.id}/edit`);
  const { t, lang } = await getI18n();

  const i = await one(
    `select i.*, p.name_en, p.name_mr, p.code as person_code from income_entries i left join people p on p.id = i.person_id
      where i.id = $1 and i.deleted_at is null`, [params.id]);
  if (!i) notFound();
  const [banks, funds, events, schemes, categories] = await Promise.all([getBankAccounts(), getFunds(), getEvents(), getSchemes(), getCategories('income')]);

  const initial = {
    person: i.person_id
      ? { id: i.person_id, name: pick(lang, i.name_mr, i.name_en), code: i.person_code }
      : (i.payer_as_written ? { id: null, name: i.payer_as_written } : null),
    amount: String(Number(i.amount)), entry_date: isoDate(i.entry_date), mode: i.mode || '', payment_ref: i.payment_ref || '',
    bank_account_id: i.bank_account_id || '', purpose: i.purpose_as_written || '', fund_id: i.fund_id || '', event_id: i.event_id || '',
    scheme_id: i.scheme_id || '', category_id: i.category_id || '', notes: i.notes || '',
  };

  return (
    <>
      <PageHead
        title={t('inc.edit_title', { code: i.code })} intro={t('c.edit_intro')}
        crumbs={[{ href: '/donations', label: t('inc.title') }, { href: `/donations/${i.id}`, label: i.code }, { label: t('c.edit') }]}
      />
      {!i.person_id && i.payer_as_written && <div style={{ marginBottom: '1rem', maxWidth: '46rem' }}><Alert tone="info">{t('inc.edit_new_person')}</Alert></div>}
      <Wizard
        steps={incomeSteps(t, lang, { banks, funds, events, schemes, categories }, { edit: true })}
        initial={initial} extra={{ id: i.id, kind: INCOME_KINDS.includes(i.kind) ? i.kind : 'other' }} action={updateIncome}
        cancelHref={`/donations/${i.id}`} submitLabel={t('c.save_changes')}
      />
    </>
  );
}
