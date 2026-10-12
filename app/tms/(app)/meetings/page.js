import Link from 'next/link';
import Icon from '../../../../components/tms/icons';
import { DataTable, FilterForm, Flash, PageHead } from '../../../../components/tms/blocks';
import { Badge, Card, Empty, SelectField, Stat, TextField } from '../../../../components/tms/ui';
import { requireRole, can } from '../../../../lib/tms/auth';
import { canChange } from '../../../../lib/tms/access';
import { getI18n } from '../../../../lib/tms/i18n/server';
import { likeParam, one, oneOf, q, textParam } from '../../../../lib/tms/db';
import { fmtDate, formatNumber } from '../../../../lib/tms/format';

export const dynamic = 'force-dynamic';

const KINDS = ['all', 'trustees', 'committee', 'agm', 'general', 'other'];

/** The meetings register: every meeting held, what it decided, and what is still to be done. */
export default async function MeetingsPage({ searchParams }) {
  const admin = await requireRole('viewer');
  const { t } = await getI18n();
  const mayEdit = can(admin, 'enterMoney') && canChange(admin, 'meetings');
  const kind = oneOf(searchParams?.kind, KINDS, 'all');
  const term = textParam(searchParams?.q, 60);

  const [rows, counts, open] = await Promise.all([
    q(`select m.id, m.code, m.kind, m.title, m.held_on, m.venue, m.next_meeting_on,
              (select count(*)::int from meeting_actions a where a.meeting_id = m.id) as actions,
              (select count(*)::int from meeting_actions a where a.meeting_id = m.id and not a.done) as open_actions
         from meetings m
        where m.deleted_at is null and ($1 = 'all' or m.kind = $1)
          and ($2 = '' or m.title ilike $3 or m.minutes ilike $3 or m.decisions ilike $3 or m.agenda ilike $3)
        order by m.held_on desc, m.created_at desc limit 200`, [kind, term, likeParam(term)]),
    one(`select count(*)::int as total,
                count(*) filter (where held_on >= date_trunc('year', current_date))::int as this_year,
                (select min(next_meeting_on) from meetings where deleted_at is null and next_meeting_on >= current_date) as next_on
           from meetings where deleted_at is null`),
    q(`select a.id, a.task, a.owner, a.due_on, m.id as meeting_id, m.title, (a.due_on < current_date) as overdue
         from meeting_actions a join meetings m on m.id = a.meeting_id
        where not a.done and m.deleted_at is null order by a.due_on nulls last, m.held_on limit 12`),
  ]);

  return (
    <>
      <PageHead title={t('x.mt.title')} intro={t('x.mt.intro')} crumbs={[{ label: t('x.mt.title') }]}>
        {mayEdit && <Link href="/meetings/new" className="tms-btn"><Icon name="plus" />{t('x.mt.add')}</Link>}
      </PageHead>
      <Flash searchParams={searchParams} />
      <div className="tms-stack">
        <div className="tms-grid tms-grid--3">
          <Stat label={t('x.mt.total')} value={formatNumber(counts.total)} note={t('x.mt.this_year', { n: formatNumber(counts.this_year) })} />
          <Stat label={t('x.mt.next')} value={counts.next_on ? fmtDate(counts.next_on) : '—'} note={counts.next_on ? undefined : t('x.mt.next_none')} />
          <Stat label={t('x.mt.open_actions')} value={formatNumber(open.length)} note={t('x.mt.open_actions_note')} />
        </div>

        {open.length > 0 && (
          <Card title={t('x.mt.todo')}>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {open.map((a) => (
                <li key={a.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--line)' }}>
                  <strong>{a.task}</strong>{a.owner ? ` · ${a.owner}` : ''}{' '}
                  {a.due_on && <Badge tone={a.overdue ? 'error' : 'warn'}>{t('x.mt.due', { date: fmtDate(a.due_on) })}</Badge>}
                  <br /><Link href={`/meetings/${a.meeting_id}`} className="muted">{a.title}</Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <FilterForm action="/meetings">
          <TextField label={t('x.mt.search')} name="q" defaultValue={term} placeholder={t('x.mt.search_ph')} />
          <SelectField label={t('x.mt.kind')} name="kind" defaultValue={kind} options={KINDS.map((k) => ({ value: k, label: k === 'all' ? t('c.all') : t(`x.mt.k.${k}`) }))} />
        </FilterForm>

        {rows.length === 0 ? (
          <Empty title={t('x.mt.none')} hint={t('x.mt.none_hint')}>
            {mayEdit && <Link href="/meetings/new" className="tms-btn"><Icon name="plus" />{t('x.mt.add')}</Link>}
          </Empty>
        ) : (
          <DataTable
            rows={rows} hrefFor={(m) => `/meetings/${m.id}`}
            columns={[
              { label: t('f.date'), cell: (m) => fmtDate(m.held_on) },
              { label: t('x.mt.title_field'), lead: true, cell: (m) => <Link href={`/meetings/${m.id}`}>{m.title}</Link> },
              { label: t('x.mt.kind'), cell: (m) => t(`x.mt.k.${m.kind}`) },
              { label: t('x.ev.venue'), cell: (m) => m.venue || '—' },
              { label: t('x.mt.actions'), cell: (m) => (m.actions ? (m.open_actions ? <Badge tone="warn">{t('x.mt.n_open', { n: m.open_actions, total: m.actions })}</Badge> : <Badge tone="ok">{t('x.mt.all_done')}</Badge>) : '—') },
              { label: t('f.id'), cell: (m) => <span className="mono">{m.code}</span> },
            ]}
          />
        )}
      </div>
    </>
  );
}
