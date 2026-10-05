import { notFound } from 'next/navigation';
import { PageHead } from '../../../../../../components/tms/blocks';
import { Alert } from '../../../../../../components/tms/ui';
import Wizard from '../../../../../../components/tms/Wizard';
import { requireRole } from '../../../../../../lib/tms/auth';
import { getI18n } from '../../../../../../lib/tms/i18n/server';
import { isUuid, one } from '../../../../../../lib/tms/db';
import { pick, todayIso } from '../../../../../../lib/tms/format';
import { disbursementSteps } from '../../../../../../lib/tms/forms';
import { saveDisbursement } from '../../../../../../lib/tms/actions/assets';

export const dynamic = 'force-dynamic';

/** Record help given under a scheme (paid) or promised (planned). */
export default async function DisbursePage({ params }) {
  await requireRole('accountant');
  const { t, lang } = await getI18n();
  if (!isUuid(params.id)) notFound();
  const s = await one('select id, code, name_en, name_mr from schemes where id = $1', [params.id]);
  if (!s) notFound();
  const name = pick(lang, s.name_mr, s.name_en);
  const fresh = { status: 'paid', disbursed_on: todayIso() };

  return (
    <>
      <PageHead title={t('dsb.add_title', { name })} intro={t('dsb.add_intro')} crumbs={[{ href: '/schemes', label: t('sch.title') }, { href: `/schemes/${s.id}`, label: name }, { label: t('dsb.add') }]} />
      <div style={{ marginBottom: '1rem', maxWidth: '46rem' }}><Alert tone="info">{t('dsb.expense_note')}</Alert></div>
      <Wizard
        steps={disbursementSteps(t)} initial={fresh} fresh={fresh} extra={{ scheme_id: s.id }}
        action={saveDisbursement} cancelHref={`/schemes/${s.id}`} submitLabel={t('dsb.save')} uploadTable="scheme_disbursements"
      />
    </>
  );
}
