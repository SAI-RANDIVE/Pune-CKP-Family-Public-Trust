import Link from 'next/link';
import Icon from '../../../../components/tms/icons';
import { PageHead } from '../../../../components/tms/blocks';
import { Alert } from '../../../../components/tms/ui';
import { requireRole, can } from '../../../../lib/tms/auth';
import { getI18n } from '../../../../lib/tms/i18n/server';
import { currentFy } from '../../../../lib/tms/format';
import { REPORT_SLUGS } from '../../../../lib/tms/reports';

export const dynamic = 'force-dynamic';

const ICONS = {
  'income-expense': 'report', 'income-kind': 'donate', 'expense-category': 'expense', donors: 'people',
  membership: 'people', schemes: 'scheme', deposits: 'deposit', banks: 'bank',
};

/** The reports, as large labelled tiles. */
export default async function ReportsPage() {
  const admin = await requireRole('viewer');
  const { t } = await getI18n();
  const fy = currentFy();

  return (
    <>
      <PageHead title={t('rep.title')} intro={t('rep.intro')} crumbs={[{ label: t('rep.title') }]} />
      <nav className="tms-tiles" aria-label={t('rep.title')}>
        {REPORT_SLUGS.map((slug, i) => (
          <Link key={slug} href={`/reports/${slug}?fy=${fy}`} className={`tms-tile tms-tile--${(i % 8) + 1}`}>
            <Icon name={ICONS[slug]} size="2.4rem" />
            <span>{t(`rep.${slug}`)}<small>{t(`rep.d.${slug}`)}</small></span>
          </Link>
        ))}
        <Link href="/bank" className="tms-tile tms-tile--5">
          <Icon name="bank" size="2.4rem" />
          <span>{t('x.bk.title')}<small>{t('x.bk.tile')}</small></span>
        </Link>
      </nav>
      <div style={{ marginTop: '1.25rem' }}>
        <Alert tone="info">{can(admin, 'export') ? t('rep.export_note') : t('rep.no_export')}</Alert>
      </div>
    </>
  );
}
