import Icon from '../../../../../components/tms/icons';
import { DataTable, Flash, PageHead } from '../../../../../components/tms/blocks';
import { Alert, Card } from '../../../../../components/tms/ui';
import { requireRole, hasOtpGrant } from '../../../../../lib/tms/auth';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { q } from '../../../../../lib/tms/db';
import { fmtDateTime } from '../../../../../lib/tms/format';

export const dynamic = 'force-dynamic';

/** Full backup as an Excel workbook. Super Admin only, after the e-mailed code. */
export default async function BackupPage({ searchParams }) {
  const admin = await requireRole('super_admin');
  const { t } = await getI18n();
  const [granted, history] = await Promise.all([
    hasOtpGrant(admin),
    q("select id, admin_email, created_at, detail from audit_logs where action = 'backup_downloaded' order by created_at desc limit 10"),
  ]);

  return (
    <>
      <PageHead title={t('set.backup')} intro={t('bak.intro')} crumbs={[{ href: '/settings', label: t('nav.settings') }, { label: t('set.backup') }]} />
      <Flash searchParams={searchParams} />

      <div className="tms-stack">
        <Alert tone="warn" title={t('bak.care_title')}>{t('bak.care_body')}</Alert>

        <Card title={t('bak.download_title')}>
          {granted ? <p className="muted" style={{ marginBottom: '0.75rem' }}>{t('bak.ready')}</p> : <p className="muted" style={{ marginBottom: '0.75rem' }}>{t('bak.needs_code')}</p>}
          <div className="tms-actions">
            <a href="/api/tms/backup" className="tms-btn tms-btn--big"><Icon name="download" />{t('bak.download')}</a>
            <a href="/api/tms/backup?raw=1" className="tms-btn tms-btn--secondary"><Icon name="download" />{t('bak.download_raw')}</a>
          </div>
          <p className="tms-hint">{t('bak.raw_hint')}</p>
        </Card>

        <Card title={t('bak.restore_title')}>
          <p>{t('bak.restore_body')}</p>
        </Card>

        <section aria-labelledby="bak-history">
          <h2 id="bak-history" style={{ marginBottom: '0.5rem' }}>{t('bak.history')}</h2>
          {history.length === 0 ? <p className="muted">{t('bak.never')}</p> : (
            <DataTable
              rows={history}
              columns={[
                { label: t('f.date'), lead: true, cell: (h) => fmtDateTime(h.created_at) },
                { label: t('c.by'), cell: (h) => h.admin_email || '—' },
                { label: t('bak.size'), right: true, cell: (h) => (h.detail?.bytes ? `${(Number(h.detail.bytes) / 1048576).toFixed(1)} MB` : '—') },
              ]}
            />
          )}
        </section>
      </div>
    </>
  );
}
