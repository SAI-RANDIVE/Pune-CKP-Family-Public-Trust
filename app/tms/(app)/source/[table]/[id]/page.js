import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHead } from '../../../../../../components/tms/blocks';
import { Alert, Badge, Card, Empty, KeyValues } from '../../../../../../components/tms/ui';
import { requireRole, can } from '../../../../../../lib/tms/auth';
import { getI18n } from '../../../../../../lib/tms/i18n/server';
import { isUuid, one, q } from '../../../../../../lib/tms/db';
import { fmtDateTime, maskId } from '../../../../../../lib/tms/format';
import { hrefForRecord, isRecordTable } from '../../../../../../lib/tms/records';

export const dynamic = 'force-dynamic';

const HIDDEN = ['content', 'content_fingerprint', 'import_batch_id', 'receipt_pdf', 'password_hash'];
const SENSITIVE = ['pan', 'aadhaar', 'pan_as_written'];

const show = (value) => {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return fmtDateTime(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

/**
 * "Where did this number come from?" For any record: the file, sheet and row
 * it was read from, with the original cells exactly as they were typed.
 */
export default async function SourcePage({ params }) {
  const admin = await requireRole('viewer');
  const { t } = await getI18n();
  const { table, id } = params;
  if (!isRecordTable(table) || !isUuid(id)) notFound();

  // `table` is a whitelisted name (isRecordTable), never free text.
  const record = await one(`select * from ${table} where id = $1`, [id]);
  if (!record) notFound();

  const sources = await q(
    `select rs.role, rr.sheet_name, rr.row_number, rr.cells, sf.name as file_name, sf.path as file_path, sf.file_code,
            sf.internal_saved_at
       from record_sources rs
       join raw_rows rr on rr.id = rs.raw_row_id
       join source_files sf on sf.id = rr.source_file_id
      where rs.record_table = $1 and rs.record_id = $2
      order by (rs.role = 'primary') desc, sf.name, rr.sheet_name, rr.row_number
      limit 60`, [table, id]);

  const seeIds = can(admin, 'seeIdNumbers');
  const ownHref = await hrefForRecord(table, id);
  const fields = Object.entries(record)
    .filter(([key]) => !HIDDEN.includes(key))
    .map(([key, value]) => [key, SENSITIVE.includes(key) && value ? (seeIds ? show(value) : maskId(value)) : show(value)])
    .filter(([, value]) => value !== '');

  return (
    <>
      <PageHead
        title={t('src.title')} intro={t('src.intro')}
        crumbs={[{ label: t(`rec.${table}`) }, { label: record.code || t('src.title') }]}
      >
        {!ownHref.startsWith('/source/') && <Link href={ownHref} className="tms-btn tms-btn--secondary">{t('src.open_record')}</Link>}
      </PageHead>

      <div className="tms-stack">
        <Card title={`${t(`rec.${table}`)}${record.code ? `: ${record.code}` : ''}`}>
          <p className="muted" style={{ marginBottom: '0.75rem' }}>
            {record.origin === 'import' ? t('src.origin_import') : record.origin === 'online' ? t('src.origin_online') : record.origin === 'manual' ? t('src.origin_manual') : ''}
          </p>
          <details>
            <summary>{t('src.stored')}</summary>
            <KeyValues items={fields} />
          </details>
        </Card>

        {sources.length === 0 ? (
          <Empty title={t('src.none')} hint={record.origin === 'import' ? t('src.none_import') : t('src.none_manual')} />
        ) : (
          <>
            <Alert tone="info">{t('src.count', { n: sources.length })}</Alert>
            {sources.map((s, i) => (
              <Card key={i} title={`${s.file_name}`}>
                <KeyValues items={[
                  [t('src.role'), <Badge key="r" tone={s.role === 'primary' ? 'ok' : 'neutral'}>{t(`src.role_${s.role}`)}</Badge>],
                  [t('src.sheet'), s.sheet_name],
                  [t('src.row'), String(s.row_number)],
                  [t('src.folder'), s.file_path],
                  [t('src.saved'), s.internal_saved_at ? fmtDateTime(s.internal_saved_at) : ''],
                ]} />
                <h3 style={{ margin: '1rem 0 0.5rem' }}>{t('src.cells')}</h3>
                {/* Original rows can hold PAN or Aadhaar numbers, so they follow the same rule as those fields. */}
                {seeIds ? (
                  <KeyValues items={Object.entries(s.cells || {})
                    .filter(([key, value]) => key !== '_f' && value !== null && value !== '')
                    .map(([key, value]) => [`${t('src.column')} ${key}`, show(value)])} />
                ) : <p className="muted">{t('src.cells_hidden')}</p>}
              </Card>
            ))}
          </>
        )}
      </div>
    </>
  );
}
