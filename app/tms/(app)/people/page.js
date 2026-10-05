import Link from 'next/link';
import Icon from '../../../../components/tms/icons';
import { DataTable, FilterForm, Flash, PageHead, Pager } from '../../../../components/tms/blocks';
import { Badge, Empty, SelectField, TextField } from '../../../../components/tms/ui';
import { requireRole, can } from '../../../../lib/tms/auth';
import { getI18n } from '../../../../lib/tms/i18n/server';
import { PAGE_SIZE, Where, oneOf, one, pageOf, q, textParam } from '../../../../lib/tms/db';
import { maskId, maskPhone, pick } from '../../../../lib/tms/format';
import { PEOPLE_MATCH, PEOPLE_SCORE, peopleSearchParams } from '../../../../lib/tms/search';
import { options } from '../../../../lib/tms/lookups';
import { PERSON_ROLES } from '../../../../lib/tms/schemas';
import { ALL_TIERS, MEMBERSHIP_STATUSES, TONE_BY_STATUS } from '../../../../lib/tms/constants';

export const dynamic = 'force-dynamic';

/** Directory of everyone the trust deals with: members, donors, beneficiaries, vendors, trustees. */
export default async function PeoplePage({ searchParams }) {
  const admin = await requireRole('viewer');
  const { t, lang } = await getI18n();
  const seeIds = can(admin, 'seeIdNumbers');

  const term = textParam(searchParams?.q, 80);
  const role = oneOf(searchParams?.role, PERSON_ROLES);
  const tier = oneOf(searchParams?.tier, ALL_TIERS);
  const status = oneOf(searchParams?.status, MEMBERSHIP_STATUSES);
  const page = pageOf(searchParams);
  const searching = term.length >= 2;

  const w = new Where();
  if (searching) {
    w.params.push(...peopleSearchParams(term));
    w.conds.push(PEOPLE_MATCH);
  } else {
    w.conds.push('p.deleted_at is null and p.merged_into_id is null');
  }
  if (role) w.add('? = any(p.roles)', role);
  if (tier || status) {
    const parts = ['m.person_id = p.id', 'm.deleted_at is null'];
    if (tier) parts.push(`m.tier = ${w.param(tier)}`);
    if (status) parts.push(`m.status = ${w.param(status)}`);
    w.conds.push(`exists (select 1 from memberships m where ${parts.join(' and ')})`);
  }

  const { n: total } = await one(`select count(*)::int as n from people p ${w.sql}`, w.params);
  const rows = await q(
    `select p.id, p.code, p.name_en, p.name_mr, p.phone, p.city, p.roles, p.pan, p.needs_review,
            cur.tier, cur.status, cur.code as membership_code
       from people p
       left join lateral (
         select m.tier, m.status, m.code from memberships m
          where m.person_id = p.id and m.deleted_at is null
          order by (m.status = 'active') desc, m.expiry_date desc nulls first limit 1) cur on true
       ${w.sql}
      order by ${searching ? `${PEOPLE_SCORE} desc,` : ''} p.name_en nulls last, p.id
      limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`, w.params);

  const columns = [
    { label: t('f.name'), lead: true, cell: (p) => <Link href={`/people/${p.id}`}>{pick(lang, p.name_mr, p.name_en)}</Link> },
    { label: t('f.id'), cell: (p) => <span className="mono">{p.code}</span> },
    { label: t('f.phone'), cell: (p) => (p.phone ? (seeIds ? p.phone : maskPhone(p.phone)) : '—') },
    { label: t('pf.city'), cell: (p) => p.city || '—' },
    {
      label: t('nav.membership'),
      cell: (p) => (p.tier ? <>{t(`tier.${p.tier}`)} <Badge tone={TONE_BY_STATUS[p.status]}>{t(`status.${p.status}`)}</Badge></> : '—'),
    },
    { label: t('pf.roles'), cell: (p) => (p.roles || []).map((r) => t(`prole.${r}`)).join(', ') || '—' },
    ...(seeIds ? [{ label: t('f.pan'), cell: (p) => (p.pan ? <span className="mono">{maskId(p.pan)}</span> : '—') }] : []),
  ];

  const params = { q: term, role, tier, status };
  return (
    <>
      <PageHead title={t('people.title')} intro={t('people.intro')} crumbs={[{ label: t('people.title') }]}>
        {can(admin, 'editPeople') && <Link href="/people/new" className="tms-btn"><Icon name="plus" />{t('people.add')}</Link>}
        <Link href="/members" className="tms-btn tms-btn--secondary">{t('nav.members')}</Link>
      </PageHead>
      <Flash searchParams={searchParams} />

      <FilterForm action="/people">
        <TextField label={t('people.search')} name="q" type="search" defaultValue={term} placeholder={t('people.search_ph')} maxLength={80} />
        <SelectField label={t('pf.roles')} name="role" defaultValue={role} placeholder={t('c.all')} options={options.keyed(PERSON_ROLES, t, 'prole')} />
        <SelectField label={t('f.tier')} name="tier" defaultValue={tier} placeholder={t('c.all')} options={options.keyed(ALL_TIERS, t, 'tier')} />
        <SelectField label={t('people.mstatus')} name="status" defaultValue={status} placeholder={t('c.all')} options={options.keyed(MEMBERSHIP_STATUSES, t, 'status')} />
      </FilterForm>

      {rows.length === 0 ? (
        <Empty title={t('people.none')} hint={t('people.none_hint')}>
          {can(admin, 'editPeople') && <Link href="/people/new" className="tms-btn">{t('people.add')}</Link>}
        </Empty>
      ) : (
        <>
          <DataTable columns={columns} rows={rows} hrefFor={(p) => `/people/${p.id}`} />
          <Pager page={page} total={total} pageSize={PAGE_SIZE} base="/people" params={params} />
        </>
      )}
    </>
  );
}
