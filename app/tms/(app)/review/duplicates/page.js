import Link from 'next/link';
import { DataTable, Flash, PageHead, Pager } from '../../../../../components/tms/blocks';
import { Alert, Badge, Empty } from '../../../../../components/tms/ui';
import { requireRole } from '../../../../../lib/tms/auth';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { PAGE_SIZE, oneOf, one, pageOf, q } from '../../../../../lib/tms/db';
import { maskPhone, pick } from '../../../../../lib/tms/format';
import { TONE_BY_STATUS } from '../../../../../lib/tms/constants';

export const dynamic = 'force-dynamic';

/** Pairs of people records that may be the same person. */
export default async function DuplicatesPage({ searchParams }) {
  await requireRole('admin');
  const { t, lang } = await getI18n();
  const status = oneOf(searchParams?.status, ['open', 'merged', 'rejected'], 'open');
  const page = pageOf(searchParams);

  const { n: total } = await one('select count(*)::int as n from person_merge_candidates where status = $1', [status]);
  const rows = await q(
    `select c.id, c.score, c.status, c.evidence,
            a.name_en as a_en, a.name_mr as a_mr, a.code as a_code, a.phone as a_phone,
            b.name_en as b_en, b.name_mr as b_mr, b.code as b_code, b.phone as b_phone
       from person_merge_candidates c join people a on a.id = c.person_a join people b on b.id = c.person_b
      where c.status = $1
      order by c.score desc, c.id
      limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`, [status]);

  return (
    <>
      <PageHead title={t('dup.title')} intro={t('dup.intro')} crumbs={[{ href: '/review', label: t('rq.title') }, { label: t('dup.title') }]} />
      <Flash searchParams={searchParams} />
      <div style={{ marginBottom: '1rem' }}><Alert tone="info">{t('dup.how')}</Alert></div>

      <nav className="tms-actions no-print" aria-label={t('c.filters')} style={{ marginBottom: '1rem' }}>
        {['open', 'merged', 'rejected'].map((s) => (
          <Link key={s} href={s === 'open' ? '/review/duplicates' : `/review/duplicates?status=${s}`} className={`tms-btn tms-btn--small ${status === s ? '' : 'tms-btn--quiet'}`} aria-current={status === s ? 'true' : undefined}>
            {t(`dup.s_${s}`)}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? <Empty title={t('dup.none')} /> : (
        <>
          <DataTable
            rows={rows} hrefFor={(c) => `/review/duplicates/${c.id}`} openLabel={status === 'open' ? t('dup.compare') : undefined}
            columns={[
              { label: t('dup.first'), lead: true, cell: (c) => <>{pick(lang, c.a_mr, c.a_en)}<span className="muted mono" style={{ display: 'block', fontWeight: 500 }}>{c.a_code} · {maskPhone(c.a_phone)}</span></> },
              { label: t('dup.second'), cell: (c) => <><strong>{pick(lang, c.b_mr, c.b_en)}</strong><span className="muted mono" style={{ display: 'block' }}>{c.b_code} · {maskPhone(c.b_phone)}</span></> },
              { label: t('dup.why'), cell: (c) => [c.evidence?.same_phone ? t('dup.same_phone') : null, c.evidence?.rule ? String(c.evidence.rule).replace(/_/g, ' ') : null].filter(Boolean).join(' · ') || '—' },
              { label: t('dup.score'), right: true, cell: (c) => Number(c.score).toFixed(0) },
              { label: t('f.status'), cell: (c) => <Badge tone={TONE_BY_STATUS[c.status]}>{t(`dup.s_${c.status}`)}</Badge> },
            ]}
          />
          <Pager page={page} total={total} pageSize={PAGE_SIZE} base="/review/duplicates" params={{ status: status === 'open' ? '' : status }} />
        </>
      )}
    </>
  );
}
