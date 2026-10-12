import Link from 'next/link';
import { FilterForm, Flash, PageHead, Pager } from '../../../../components/tms/blocks';
import { Badge, Card, Empty, SelectField, Stat, TextAreaField } from '../../../../components/tms/ui';
import { SubmitButton } from '../../../../components/tms/client';
import { requireRole, can } from '../../../../lib/tms/auth';
import { canChange } from '../../../../lib/tms/access';
import { getI18n } from '../../../../lib/tms/i18n/server';
import { PAGE_SIZE, one, oneOf, pageOf, q } from '../../../../lib/tms/db';
import { fmtDateTime, formatNumber } from '../../../../lib/tms/format';
import { updateFeedback } from '../../../../lib/tms/actions/community';

export const dynamic = 'force-dynamic';

const STATUSES = ['new', 'noted', 'in_progress', 'done'];
const KINDS = ['suggestion', 'feedback', 'complaint', 'appreciation'];
const TONE = { new: 'warn', noted: 'info', in_progress: 'info', done: 'ok' };
const KIND_TONE = { complaint: 'error', appreciation: 'ok', suggestion: 'info', feedback: 'neutral' };

/** Suggestions and feedback sent from the website and the members' corner. */
export default async function FeedbackInboxPage({ searchParams }) {
  const admin = await requireRole('viewer');
  const { t } = await getI18n();
  const mayReply = can(admin, 'review') && canChange(admin, 'community');
  const status = oneOf(searchParams?.status, ['open', 'all', ...STATUSES], 'open');
  const kind = oneOf(searchParams?.kind, ['all', ...KINDS], 'all');
  const page = pageOf(searchParams);
  const WHERE = `where ($1 = 'all' or ($1 = 'open' and f.status <> 'done') or f.status = $1) and ($2 = 'all' or f.kind = $2)`;

  const [counts, total, rows] = await Promise.all([
    one(`select count(*) filter (where status = 'new')::int as fresh, count(*) filter (where status in ('noted', 'in_progress'))::int as working,
                count(*) filter (where status = 'done')::int as done, count(*)::int as total from feedback`),
    one(`select count(*)::int as n from feedback f ${WHERE}`, [status, kind]),
    q(`select f.*, p.code as person_code, u.name as replied_by_name
         from feedback f left join people p on p.id = f.person_id left join admin_users u on u.id = f.replied_by
        ${WHERE} order by (f.status = 'new') desc, f.created_at desc limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`, [status, kind]),
  ]);

  return (
    <>
      <PageHead title={t('x.fb.title')} intro={t('x.fb.intro')} crumbs={[{ label: t('x.fb.title') }]} />
      <Flash searchParams={searchParams} />
      <div className="tms-stack">
        <div className="tms-grid tms-grid--3">
          <Stat label={t('x.fb.st.new')} value={formatNumber(counts.fresh)} href="/feedback?status=new" />
          <Stat label={t('x.fb.working')} value={formatNumber(counts.working)} href="/feedback?status=open" />
          <Stat label={t('x.fb.st.done')} value={formatNumber(counts.done)} note={t('x.fb.total', { n: formatNumber(counts.total) })} href="/feedback?status=done" />
        </div>
        <FilterForm action="/feedback">
          <SelectField label={t('c.status')} name="status" defaultValue={status} options={[{ value: 'open', label: t('x.fb.open') }, { value: 'all', label: t('c.all') }, ...STATUSES.map((s) => ({ value: s, label: t(`x.fb.st.${s}`) }))]} />
          <SelectField label={t('x.fb.kind')} name="kind" defaultValue={kind} options={[{ value: 'all', label: t('c.all') }, ...KINDS.map((k) => ({ value: k, label: t(`x.fb.k.${k}`) }))]} />
        </FilterForm>

        {rows.length === 0 ? <Empty title={t('x.fb.none')} hint={t('x.fb.none_hint')} /> : rows.map((f) => (
          <Card key={f.id}>
            <p style={{ marginBottom: '0.5rem' }}>
              <Badge tone={KIND_TONE[f.kind]}>{t(`x.fb.k.${f.kind}`)}</Badge>{' '}
              <Badge tone={TONE[f.status]}>{t(`x.fb.st.${f.status}`)}</Badge>{' '}
              <span className="mono">{f.code}</span> · <span className="muted">{fmtDateTime(f.created_at)}</span>
            </p>
            <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: '1.05rem' }}>{f.message}</p>
            <p className="muted" style={{ marginTop: '0.5rem' }}>
              {t('x.fb.from')}: {f.person_id ? <Link href={`/people/${f.person_id}`}>{f.name} ({f.person_code})</Link> : (f.name || t('x.fb.anonymous'))}
              {f.contact ? ` · ${f.contact}` : ''}
            </p>
            {f.reply && (
              <div className="tms-alert tms-alert--ok" style={{ marginTop: '0.75rem' }}>
                <div><strong>{t('x.fb.reply')}{f.replied_by_name ? ` (${f.replied_by_name}, ${fmtDateTime(f.replied_at)})` : ''}</strong><span style={{ whiteSpace: 'pre-wrap' }}>{f.reply}</span></div>
              </div>
            )}
            {mayReply && (
              <details className="no-print" style={{ marginTop: '0.75rem' }} open={f.status === 'new'}>
                <summary>{t('x.fb.respond')}</summary>
                <form action={updateFeedback} style={{ marginTop: '0.5rem', maxWidth: '46rem' }}>
                  <input type="hidden" name="id" value={f.id} />
                  <SelectField label={t('c.status')} name="status" defaultValue={f.status === 'new' ? 'noted' : f.status} options={STATUSES.map((s) => ({ value: s, label: t(`x.fb.st.${s}`) }))} />
                  <TextAreaField label={t('x.fb.reply')} name="reply" optional={t('c.optional')} maxLength={3000} rows={3} defaultValue={f.reply || ''} hint={t('x.fb.reply_hint')} />
                  <SubmitButton>{t('c.save_changes')}</SubmitButton>
                </form>
              </details>
            )}
          </Card>
        ))}
        <Pager page={page} total={total.n} pageSize={PAGE_SIZE} base="/feedback" params={{ status, kind: kind === 'all' ? '' : kind }} />
      </div>
    </>
  );
}
