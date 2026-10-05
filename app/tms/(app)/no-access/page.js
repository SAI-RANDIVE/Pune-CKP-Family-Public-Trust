import Link from 'next/link';
import { PageHead } from '../../../../components/tms/blocks';
import { Alert } from '../../../../components/tms/ui';
import { requireRole } from '../../../../lib/tms/auth';
import { getI18n } from '../../../../lib/tms/i18n/server';

export const dynamic = 'force-dynamic';

export default async function NoAccessPage() {
  const admin = await requireRole('viewer');
  const { t } = await getI18n();
  return (
    <>
      <PageHead title={t('noaccess.title')} crumbs={[{ label: t('noaccess.title') }]} />
      <Alert tone="warn" title={t('noaccess.lead', { role: t(`role.${admin.role}`) })}>{t('noaccess.body')}</Alert>
      <div className="tms-actions" style={{ marginTop: '1.25rem' }}>
        <Link href="/" className="tms-btn tms-btn--big">{t('nav.home')}</Link>
      </div>
    </>
  );
}
