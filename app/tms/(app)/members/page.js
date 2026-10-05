import Link from 'next/link';
import Icon from '../../../../components/tms/icons';
import { DataTable, FilterForm, Flash, OriginBadges, PageHead, Pager } from '../../../../components/tms/blocks';
import { Badge, Empty, SelectField, Stat, TextField } from '../../../../components/tms/ui';
import { requireRole, can } from '../../../../lib/tms/auth';
import { getI18n } from '../../../../lib/tms/i18n/server';
import { PAGE_SIZE, Where, likeParam, oneOf, one, pageOf, q, textParam } from '../../../../lib/tms/db';
import { fmtDate, formatNumber, pick } from '../../../../lib/tms/format';
import { options } from '../../../../lib/tms/lookups';
import { ALL_TIERS, MEMBERSHIP_STATUSES, TONE_BY_STATUS } from '../../../../lib/tms/constants';

export const dynamic = 'force-dynamic';

/** Members' register: every membership with its tier, validity and standing. */
export default async function MembersPage({ searchParams }) {
  const admin = await requireRole('viewer');
  const { t, lang } = await getI18n();
  const term = textParam(searchParams?.q, 80);
  const tier = oneOf(searchParams?.tier, ALL_TIERS);
  const status = oneOf(searchParams?.status, MEMBERSHIP_STATUSES);
  const page = pageOf(searchParams);

  const w = new Where(['m.deleted_at is null', 'p.deleted_at is null']);
  if (tier) w.add('m.tier = ?', tier);
  if (status) w.add('m.status = ?', status);
  if (term) {
    const like = w.param(likeParam(term));
    w.conds.push(`(p.name_en ilike ${like} or p.name_mr ilike ${like} or m.code ilike ${like} or p.phone ilike ${like}
      or exists (select 1 from membership_numbers n where n.membership_id = m.id and n.number_as_written ilike ${like}))`);
  }

  const [counts, { n: total }, rows] = await Promise.all([
    q(`select tier, count(*)::int as n from memberships where deleted_at is null and status = 'active' group by tier`),
    one(`select count(*)::int as n from memberships m join people p on p.id = m.person_id ${w.sql}`, w.params),
    q(`select m.id, m.code, m.tier, m.status, m.start_date, m.expiry_date, m.origin, m.needs_review,
              p.id as person_id, p.name_en, p.name_mr, p.phone,
              (select n.number_as_written from membership_numbers n where n.membership_id = m.id order by n.is_current desc, n.last_seen_fy desc nulls last limit 1) as old_no
         from memberships m join people p on p.id = m.person_id ${w.sql}
        order by (m.status = 'active') desc, p.name_en nulls last, m.id
        limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`, w.params),
  ]);
  const active = Object.fromEntries(counts.map((c) => [c.tier, c.n]));

  return (
    <>
      <PageHead title={t('mem.title')} intro={t('mem.intro')} crumbs={[{ label: t('mem.title') }]}>
        {can(admin, 'editPeople') && <Link href="/people/new" className="tms-btn"><Icon name="plus" />{t('mem.add')}</Link>}
        <Link href="/members/expiring" className="tms-btn tms-btn--secondary">{t('mem.expiring')}</Link>
        <Link href="/officers" className="tms-btn tms-btn--secondary">{t('off.list')}</Link>
        <Link href="/people" className="tms-btn tms-btn--secondary">{t('people.title')}</Link>
      </PageHead>
      <Flash searchParams={searchParams} />

      <div className="tms-grid tms-grid--3" style={{ marginBottom: '1.25rem' }}>
        {['silver', 'gold', 'platinum'].map((x) => (
          <Stat key={x} label={t('mem.active_tier', { tier: t(`tier.${x}`) })} value={formatNumber(active[x] || 0)} href={`/members?tier=${x}&status=active`} />
        ))}
      </div>
      {can(admin, 'editPeople') && <p className="tms-hint" style={{ marginBottom: '1rem' }}>{t('mem.add_hint')}</p>}

      <FilterForm action="/members">
        <TextField label={t('mem.search')} name="q" type="search" defaultValue={term} placeholder={t('mem.search_ph')} maxLength={80} />
        <SelectField label={t('f.tier')} name="tier" defaultValue={tier} placeholder={t('c.all')} options={options.keyed(ALL_TIERS, t, 'tier')} />
        <SelectField label={t('f.status')} name="status" defaultValue={status} placeholder={t('c.all')} options={options.keyed(MEMBERSHIP_STATUSES, t, 'status')} />
      </FilterForm>

      {rows.length === 0 ? <Empty title={t('mem.none')} hint={t('c.try_filters')} /> : (
        <>
          <DataTable
            rows={rows} hrefFor={(m) => `/people/${m.person_id}`}
            columns={[
              { label: t('f.name'), lead: true, cell: (m) => <Link href={`/people/${m.person_id}`}>{pick(lang, m.name_mr, m.name_en)}</Link> },
              { label: t('mem.no'), cell: (m) => <><span className="mono">{m.code}</span>{m.old_no && m.old_no !== m.code ? <span className="muted"> ({m.old_no})</span> : null}</> },
              { label: t('f.tier'), cell: (m) => t(`tier.${m.tier}`) },
              { label: t('f.status'), cell: (m) => <Badge tone={TONE_BY_STATUS[m.status]}>{t(`status.${m.status}`)}</Badge> },
              { label: t('mem.from'), cell: (m) => fmtDate(m.start_date) },
              { label: t('mem.till'), cell: (m) => (m.expiry_date ? fmtDate(m.expiry_date) : (m.tier === 'platinum' ? t('mem.lifetime') : '—')) },
              { label: t('c.record'), cell: (m) => <OriginBadges origin={m.origin} needsReview={m.needs_review} /> },
            ]}
          />
          <Pager page={page} total={total} pageSize={PAGE_SIZE} base="/members" params={{ q: term, tier, status }} />
        </>
      )}
    </>
  );
}
