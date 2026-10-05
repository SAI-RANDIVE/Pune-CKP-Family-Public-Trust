import { PageHead } from '../../../../../components/tms/blocks';
import Wizard from '../../../../../components/tms/Wizard';
import { requireRole } from '../../../../../lib/tms/auth';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { isUuid, one } from '../../../../../lib/tms/db';
import { maskPhone, pick, todayIso } from '../../../../../lib/tms/format';
import { getBankAccounts, getCategories, getEvents, getFunds, getSchemes } from '../../../../../lib/tms/lookups';
import { incomeSteps, loadDraft } from '../../../../../lib/tms/forms';
import { saveIncome } from '../../../../../lib/tms/actions/income';
import { saveDraft, clearDraft } from '../../../../../lib/tms/actions/drafts';

export const dynamic = 'force-dynamic';

/** Record money received, one small step at a time. */
export default async function NewDonationPage({ searchParams }) {
  const admin = await requireRole('accountant');
  const { t, lang } = await getI18n();

  const [banks, funds, events, schemes, categories, draft] = await Promise.all([
    getBankAccounts(), getFunds(), getEvents(), getSchemes(), getCategories('income'), loadDraft(admin, 'income:new'),
  ]);

  const fresh = { kind: 'donation', entry_date: todayIso() };
  let initial = draft || fresh;
  let hadDraft = Boolean(draft);
  // Arriving from a person's page: that person is already chosen.
  if (isUuid(searchParams?.person)) {
    const p = await one('select id, code, name_en, name_mr, phone, city from people where id = $1 and deleted_at is null and merged_into_id is null', [searchParams.person]);
    if (p) {
      initial = { ...fresh, person: { id: p.id, name: pick(lang, p.name_mr, p.name_en), code: p.code, detail: [maskPhone(p.phone), p.city].filter(Boolean).join(' · ') } };
      hadDraft = false;
    }
  }

  return (
    <>
      <PageHead title={t('tile.donation')} intro={t('inc.new_intro')} crumbs={[{ href: '/donations', label: t('inc.title') }, { label: t('tile.donation') }]} />
      <Wizard
        steps={incomeSteps(t, lang, { banks, funds, events, schemes, categories })}
        initial={initial} fresh={fresh} hadDraft={hadDraft}
        action={saveIncome} formKey="income:new" saveDraft={saveDraft} clearDraft={clearDraft}
        cancelHref="/donations" submitLabel={t('inc.save')} uploadTable="income_entries"
      />
    </>
  );
}
