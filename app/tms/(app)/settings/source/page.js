import { redirect } from 'next/navigation';
import Icon from '../../../../../components/tms/icons';
import { PageHead } from '../../../../../components/tms/blocks';
import { Alert, Card } from '../../../../../components/tms/ui';
import { requireRole } from '../../../../../lib/tms/auth';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { one, textParam } from '../../../../../lib/tms/db';
import { isRecordTable } from '../../../../../lib/tms/records';

export const dynamic = 'force-dynamic';

/** Provenance lookup: type any trust ID to see the file, sheet and row it was read from. */
export default async function SourceLookupPage({ searchParams }) {
  await requireRole('viewer');
  const { t } = await getI18n();
  const code = textParam(searchParams?.code, 80);

  let missing = false;
  if (code) {
    const hit = await one('select record_table, record_id from entity_codes where lower(code) = lower($1) limit 1', [code]);
    if (hit && isRecordTable(hit.record_table)) redirect(`/source/${hit.record_table}/${hit.record_id}`);
    missing = true;
  }

  return (
    <>
      <PageHead title={t('src.title')} intro={t('src.intro')} crumbs={[{ href: '/settings', label: t('nav.settings') }, { label: t('src.title') }]} />
      <div className="tms-stack" style={{ maxWidth: '46rem' }}>
        {missing && <Alert tone="warn">{t('src.no_code', { code })}</Alert>}
        <form method="get" action="/settings/source" role="search" className="tms-search">
          <label className="sr-only" htmlFor="code">{t('src.code_label')}</label>
          <input className="tms-input" id="code" name="code" type="search" defaultValue={code} maxLength={80} required placeholder="PCFPT/DON/2025-26/0042" />
          <button type="submit" className="tms-btn tms-btn--big"><Icon name="search" />{t('src.show')}</button>
        </form>
        <Card title={t('src.how_title')}>
          <p>{t('src.how_body')}</p>
        </Card>
      </div>
    </>
  );
}
