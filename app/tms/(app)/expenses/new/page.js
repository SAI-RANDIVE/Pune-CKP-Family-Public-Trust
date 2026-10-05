import { PageHead } from '../../../../../components/tms/blocks';
import Wizard from '../../../../../components/tms/Wizard';
import { requireRole } from '../../../../../lib/tms/auth';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { todayIso } from '../../../../../lib/tms/format';
import { getBankAccounts, getCategories, getEvents, getFunds, getSchemes } from '../../../../../lib/tms/lookups';
import { expenseSteps, loadDraft } from '../../../../../lib/tms/forms';
import { saveExpense } from '../../../../../lib/tms/actions/expenses';
import { saveDraft, clearDraft } from '../../../../../lib/tms/actions/drafts';

export const dynamic = 'force-dynamic';

/** Record a payment voucher, one small step at a time. */
export default async function NewExpensePage() {
  const admin = await requireRole('accountant');
  const { t, lang } = await getI18n();
  const [banks, funds, events, schemes, categories, draft] = await Promise.all([
    getBankAccounts(), getFunds(), getEvents(), getSchemes(), getCategories('expense'), loadDraft(admin, 'expense:new'),
  ]);
  const fresh = { entry_date: todayIso() };

  return (
    <>
      <PageHead title={t('tile.expense')} intro={t('exp.new_intro')} crumbs={[{ href: '/expenses', label: t('exp.title') }, { label: t('tile.expense') }]} />
      <Wizard
        steps={expenseSteps(t, lang, { banks, funds, events, schemes, categories })}
        initial={draft || fresh} fresh={fresh} hadDraft={Boolean(draft)}
        action={saveExpense} formKey="expense:new" saveDraft={saveDraft} clearDraft={clearDraft}
        cancelHref="/expenses" submitLabel={t('exp.save')} uploadTable="expenses"
      />
    </>
  );
}
