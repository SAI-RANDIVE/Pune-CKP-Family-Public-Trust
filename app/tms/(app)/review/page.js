import Link from 'next/link';
import { DataTable, Flash, PageHead, Pager, hrefWith } from '../../../../components/tms/blocks';
import { Alert, Badge, Card, Empty, Stat } from '../../../../components/tms/ui';
import { requireRole } from '../../../../lib/tms/auth';
import { getI18n } from '../../../../lib/tms/i18n/server';
import { Where, oneOf, one, pageOf, q, textParam } from '../../../../lib/tms/db';
import { fmtDateTime, formatNumber } from '../../../../lib/tms/format';
import { hrefForRecord, isRecordTable } from '../../../../lib/tms/records';
import { REVIEW_STATUSES, SEVERITIES, TONE_BY_STATUS } from '../../../../lib/tms/constants';
import { decideReview } from '../../../../lib/tms/actions/review';

export const dynamic = 'force-dynamic';

const PER_PAGE = 10;
const label = (key) => String(key).replace(/_/g, ' ');

/** Shows whatever the importer recorded as evidence, as plain labelled lines rather than raw data. */
function Evidence({ value, depth = 0 }) {
  if (value === null || value === undefined || value === '') return <span className="muted">—</span>;
  if (typeof value !== 'object') return <span>{String(value)}</span>;
  if (Array.isArray(value)) {
    if (value.every((v) => v === null || typeof v !== 'object')) return <span>{value.slice(0, 40).join(', ')}{value.length > 40 ? ' …' : ''}</span>;
    if (depth >= 3) return <span className="muted">…</span>;
    return (
      <ol style={{ margin: 0, paddingLeft: '1.25rem' }}>
        {value.slice(0, 20).map((v, i) => <li key={i}><Evidence value={v} depth={depth + 1} /></li>)}
        {value.length > 20 && <li className="muted">… +{value.length - 20}</li>}
      </ol>
    );
  }
  if (depth >= 3) return <span className="muted">…</span>;
  return (
    <dl className="tms-kv" style={{ gridTemplateColumns: 'minmax(7rem, 12rem) 1fr' }}>
      {Object.entries(value).slice(0, 40).map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{label(k)}</dt>
          <dd style={{ fontWeight: 500 }}><Evidence value={v} depth={depth + 1} /></dd>
        </div>
      ))}
    </dl>
  );
}

/** Import review queue: things the importer could not decide alone, grouped by kind and seriousness. */
export default async function ReviewPage({ searchParams }) {
  await requireRole('admin');
  const { t } = await getI18n();
  const kind = /^[a-z_]{2,40}$/.test(String(searchParams?.kind || '')) ? searchParams.kind : '';
  const severity = oneOf(searchParams?.severity, SEVERITIES);
  const status = oneOf(searchParams?.status, REVIEW_STATUSES, 'open');
  const term = textParam(searchParams?.q, 60);
  const page = pageOf(searchParams);

  if (!kind && !searchParams?.all) {
    const [summary, totals, dupes] = await Promise.all([
      q(`select kind, sum(items) filter (where severity = 'high')::int as high, sum(items) filter (where severity = 'medium')::int as medium,
                sum(items) filter (where severity = 'low')::int as low, sum(items)::int as total
           from v_review_queue_summary where status = 'open' group by kind order by sum(items) filter (where severity = 'high') desc nulls last, sum(items) desc`),
      one(`select count(*) filter (where status = 'open')::int as open, count(*) filter (where status <> 'open')::int as decided from import_review_queue`),
      one("select count(*)::int as n from person_merge_candidates where status = 'open'"),
    ]);
    return (
      <>
        <PageHead title={t('rq.title')} intro={t('rq.intro')} crumbs={[{ label: t('rq.title') }]}>
          <Link href="/review/duplicates" className="tms-btn">{t('dup.title')} ({formatNumber(dupes.n)})</Link>
          <Link href="/review?all=1" className="tms-btn tms-btn--secondary">{t('rq.see_all')}</Link>
        </PageHead>
        <Flash searchParams={searchParams} />
        <div className="tms-grid tms-grid--3" style={{ marginBottom: '1.25rem' }}>
          <Stat label={t('rq.open')} value={formatNumber(totals.open)} href="/review?all=1" />
          <Stat label={t('rq.decided')} value={formatNumber(totals.decided)} href="/review?all=1&status=approved" />
          <Stat label={t('dup.title')} value={formatNumber(dupes.n)} href="/review/duplicates" />
        </div>
        <div style={{ marginBottom: '1rem' }}><Alert tone="info" title={t('rq.how_title')}>{t('rq.how_body')}</Alert></div>

        {summary.length === 0 ? <Empty title={t('rq.none')} hint={t('rq.none_hint')} /> : (
          <DataTable
            rows={summary} hrefFor={(r) => `/review?kind=${r.kind}`}
            columns={[
              { label: t('rq.kind'), lead: true, cell: (r) => <Link href={`/review?kind=${r.kind}`}>{t(`rq.k.${r.kind}`)}</Link> },
              { label: t('sev.high'), right: true, cell: (r) => (r.high ? <Link href={`/review?kind=${r.kind}&severity=high`}>{formatNumber(r.high)}</Link> : '—') },
              { label: t('sev.medium'), right: true, cell: (r) => (r.medium ? formatNumber(r.medium) : '—') },
              { label: t('sev.low'), right: true, cell: (r) => (r.low ? formatNumber(r.low) : '—') },
              { label: t('c.total'), right: true, cell: (r) => formatNumber(r.total) },
            ]}
          />
        )}
      </>
    );
  }

  const w = new Where();
  w.add('r.status = ?', status);
  if (kind) w.add('r.kind = ?', kind);
  if (severity) w.add('r.severity = ?', severity);
  if (term) w.add('r.title ilike ?', `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);

  const { n: total } = await one(`select count(*)::int as n from import_review_queue r ${w.sql}`, w.params);
  const items = await q(
    `select r.*, a.name as decided_by_name from import_review_queue r left join admin_users a on a.id = r.decided_by ${w.sql}
      order by case r.severity when 'high' then 0 when 'medium' then 1 else 2 end, r.created_at, r.id
      limit ${PER_PAGE} offset ${(page - 1) * PER_PAGE}`, w.params);
  const links = await Promise.all(items.map((it) => (it.record_id && isRecordTable(it.record_table) ? hrefForRecord(it.record_table, it.record_id) : null)));

  const params = { kind, severity, status: status === 'open' ? '' : status, q: term, all: kind ? '' : '1' };
  const back = hrefWith('/review', { ...params, page });
  const title = kind ? t(`rq.k.${kind}`) : t('rq.see_all');

  return (
    <>
      <PageHead title={title} intro={kind ? t(`rq.d.${kind}`) : t('rq.intro')} crumbs={[{ href: '/review', label: t('rq.title') }, { label: title }]} />
      <Flash searchParams={searchParams} />

      <nav className="tms-actions no-print" aria-label={t('c.filters')} style={{ marginBottom: '1rem' }}>
        {['', ...SEVERITIES].map((s) => (
          <Link key={s || 'any'} href={hrefWith('/review', { ...params, severity: s })} className={`tms-btn tms-btn--small ${severity === s ? '' : 'tms-btn--quiet'}`} aria-current={severity === s ? 'true' : undefined}>
            {s ? t(`sev.${s}`) : t('rq.any_severity')}
          </Link>
        ))}
        <span aria-hidden="true">|</span>
        {['open', 'approved', 'rejected', 'resolved'].map((s) => (
          <Link key={s} href={hrefWith('/review', { ...params, status: s === 'open' ? '' : s })} className={`tms-btn tms-btn--small ${status === s ? '' : 'tms-btn--quiet'}`} aria-current={status === s ? 'true' : undefined}>
            {t(`rstatus.${s}`)}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? <Empty title={t('rq.none')} hint={t('rq.none_hint')} /> : (
        <div className="tms-stack">
          {items.map((it, i) => (
            <Card key={it.id}>
              <h2 style={{ fontSize: '1.15rem' }}>{it.title}</h2>
              <p style={{ margin: '0.4rem 0' }}>
                <Badge tone={TONE_BY_STATUS[it.severity]}>{t(`sev.${it.severity}`)}</Badge>{' '}
                <Badge tone="neutral">{t(`rq.k.${it.kind}`)}</Badge>{' '}
                {it.status !== 'open' && <Badge tone={TONE_BY_STATUS[it.status]}>{t(`rstatus.${it.status}`)}</Badge>}
                {it.confidence != null && <span className="muted"> · {t('rq.confidence', { pct: Math.round(Number(it.confidence) * 100) })}</span>}
              </p>
              {it.suggested_action && <Alert tone="info" title={t('rq.suggested')}>{it.suggested_action}</Alert>}

              {it.evidence && (
                <div style={{ marginTop: '0.75rem' }}>
                  <h3 style={{ marginBottom: '0.4rem' }}>{t('rq.evidence')}</h3>
                  <Evidence value={it.evidence} />
                </div>
              )}

              <div className="tms-actions no-print" style={{ marginTop: '0.75rem' }}>
                {links[i] && <Link href={links[i]} className="tms-btn tms-btn--secondary tms-btn--small">{t('rq.open_record')}</Link>}
                {it.record_id && isRecordTable(it.record_table) && <Link href={`/source/${it.record_table}/${it.record_id}`} className="tms-btn tms-btn--quiet tms-btn--small">{t('src.link')}</Link>}
              </div>

              {it.status === 'open' ? (
                <form action={decideReview} className="no-print" style={{ marginTop: '1rem', borderTop: '2px solid var(--line)', paddingTop: '1rem' }}>
                  <input type="hidden" name="id" value={it.id} />
                  <input type="hidden" name="back" value={back} />
                  <label className="tms-label" htmlFor={`note-${it.id}`}>{t('rq.note')}</label>
                  <textarea className="tms-textarea" style={{ minHeight: '4.5rem' }} id={`note-${it.id}`} name="note" maxLength={500} placeholder={t('rq.note_ph')} />
                  <span className="tms-hint">{t('rq.note_hint')}</span>
                  <div className="tms-actions" style={{ marginTop: '0.75rem' }}>
                    <button type="submit" name="decision" value="approve" className="tms-btn tms-btn--ok">{t('rq.approve')}</button>
                    <button type="submit" name="decision" value="resolve" className="tms-btn tms-btn--secondary">{t('rq.resolve')}</button>
                    <button type="submit" name="decision" value="reject" className="tms-btn tms-btn--quiet">{t('rq.reject')}</button>
                  </div>
                </form>
              ) : (
                <p className="tms-hint" style={{ marginTop: '0.75rem' }}>
                  {t('rq.decided_by', { name: it.decided_by_name || '—', date: fmtDateTime(it.decided_at) })}
                  {it.decision_note ? ` · ${it.decision_note}` : ''}
                </p>
              )}
            </Card>
          ))}
          <Pager page={page} total={total} pageSize={PER_PAGE} base="/review" params={params} />
        </div>
      )}
    </>
  );
}
