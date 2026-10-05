import { PageHead } from '../../../../../components/tms/blocks';
import { PrintButton } from '../../../../../components/tms/client';
import { requireRole } from '../../../../../lib/tms/auth';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { HELP } from '../../../../../lib/tms/i18n/help';

export const dynamic = 'force-dynamic';

/** One-page quick guide, made to be printed and kept beside the computer. */
export default async function QuickGuidePage() {
  await requireRole('viewer');
  const { t, lang } = await getI18n();
  const { quick } = HELP[lang] || HELP.mr;

  return (
    <>
      <PageHead title={t('help.quick')} intro={t('help.quick_intro')} crumbs={[{ href: '/help', label: t('help.title') }, { label: t('help.quick') }]}>
        <PrintButton label={t('c.print')} />
      </PageHead>

      <div className="tms-tablewrap">
        <table className="tms-table">
          <caption>{t('app.trust')} · {t('app.name')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('help.task')}</th>
              <th scope="col">{t('help.how')}</th>
            </tr>
          </thead>
          <tbody>
            {quick.map(([task, how], i) => (
              <tr key={i}>
                <td className="lead" data-label={t('help.task')}><strong>{task}</strong></td>
                <td data-label={t('help.how')}>{how}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tms-hint" style={{ marginTop: '0.75rem' }}>{t('help.quick_foot')}</p>
    </>
  );
}
