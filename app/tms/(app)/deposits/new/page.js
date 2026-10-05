import { PageHead } from '../../../../../components/tms/blocks';
import { Alert } from '../../../../../components/tms/ui';
import Wizard from '../../../../../components/tms/Wizard';
import { requireRole } from '../../../../../lib/tms/auth';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { isUuid, one } from '../../../../../lib/tms/db';
import { formatINR, isoDate, todayIso } from '../../../../../lib/tms/format';
import { getFunds } from '../../../../../lib/tms/lookups';
import { depositSteps, loadDraft } from '../../../../../lib/tms/forms';
import { saveDeposit } from '../../../../../lib/tms/actions/assets';
import { saveDraft, clearDraft } from '../../../../../lib/tms/actions/drafts';

export const dynamic = 'force-dynamic';

/** Add a fixed deposit; with ?from=<id> it is the renewal of an existing one. */
export default async function NewDepositPage({ searchParams }) {
  const admin = await requireRole('accountant');
  const { t, lang } = await getI18n();
  const funds = await getFunds();

  let old = null;
  if (isUuid(searchParams?.from)) {
    old = await one("select * from fixed_deposits where id = $1 and deleted_at is null and status in ('active', 'matured', 'unknown')", [searchParams.from]);
  }
  const draft = old ? null : await loadDraft(admin, 'deposit:new');
  const fresh = old
    ? {
      bank: old.bank, branch: old.branch || '', principal: String(Number(old.maturity_amount || old.principal)),
      start_date: old.maturity_date && isoDate(old.maturity_date) <= todayIso() ? isoDate(old.maturity_date) : todayIso(), fund_id: old.fund_id || '',
    }
    : { start_date: todayIso() };
  const title = old ? t('fd.renew_title') : t('fd.add');

  return (
    <>
      <PageHead title={title} intro={t('fd.add_intro')} crumbs={[{ href: '/deposits', label: t('fd.title') }, { label: title }]} />
      {old && (
        <div style={{ marginBottom: '1rem', maxWidth: '46rem' }}>
          <Alert tone="info" title={t('fd.renewing', { code: old.code })}>{t('fd.renewing_body', { bank: old.bank, amount: formatINR(old.principal) })}</Alert>
        </div>
      )}
      <Wizard
        steps={depositSteps(t, lang, { funds })}
        initial={draft || fresh} fresh={fresh} hadDraft={Boolean(draft)} extra={old ? { renewed_from_id: old.id } : {}}
        action={saveDeposit} formKey={old ? null : 'deposit:new'} saveDraft={saveDraft} clearDraft={clearDraft}
        cancelHref={old ? `/deposits/${old.id}` : '/deposits'} submitLabel={t('fd.save')} uploadTable="fixed_deposits"
      />
    </>
  );
}
