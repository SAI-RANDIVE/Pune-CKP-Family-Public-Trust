import Link from 'next/link';
import { DataTable, PageHead } from '../../../../../components/tms/blocks';
import { Alert, Badge, Empty } from '../../../../../components/tms/ui';
import { PrintButton } from '../../../../../components/tms/client';
import { requireRole, can } from '../../../../../lib/tms/auth';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { q } from '../../../../../lib/tms/db';
import { fmtDate, maskPhone, pick } from '../../../../../lib/tms/format';

export const dynamic = 'force-dynamic';

/** Memberships that have run out or will within 90 days: the renewal reminder list. */
export default async function ExpiringPage() {
  const admin = await requireRole('viewer');
  const { t, lang } = await getI18n();
  const seeIds = can(admin, 'seeIdNumbers');
  const mayEnter = can(admin, 'enterMoney');

  const rows = await q(
    `select v.id, v.code, v.tier, v.expiry_date, v.status, v.dates_derived, v.name_en, v.name_mr, v.phone, v.days_left, m.person_id
       from v_membership_expiries_due v join memberships m on m.id = v.id
      where v.days_left >= -730
      order by v.expiry_date desc`);
  const soon = rows.filter((r) => r.days_left >= 0).reverse();
  const past = rows.filter((r) => r.days_left < 0);

  const columns = [
    { label: t('f.name'), lead: true, cell: (m) => <Link href={`/people/${m.person_id}`}>{pick(lang, m.name_mr, m.name_en)}</Link> },
    { label: t('mem.no'), cell: (m) => <span className="mono">{m.code}</span> },
    { label: t('f.tier'), cell: (m) => t(`tier.${m.tier}`) },
    { label: t('mem.till'), cell: (m) => <>{fmtDate(m.expiry_date)}{m.dates_derived ? <span className="muted"> ({t('mem.estimated')})</span> : null}</> },
    {
      label: t('mem.days'),
      cell: (m) => (m.days_left >= 0
        ? <Badge tone="warn">{t('mem.days_left', { n: m.days_left })}</Badge>
        : <Badge tone="error">{t('mem.days_past', { n: -m.days_left })}</Badge>),
    },
    { label: t('f.phone'), cell: (m) => (m.phone ? (seeIds ? m.phone : maskPhone(m.phone)) : '—') },
  ];
  const renewHref = mayEnter ? (m) => `/members/renew/${m.id}` : (m) => `/people/${m.person_id}`;
  const openLabel = mayEnter ? t('mem.renew') : undefined;

  return (
    <>
      <PageHead title={t('mem.expiring')} intro={t('mem.expiring_intro')} crumbs={[{ href: '/members', label: t('mem.title') }, { label: t('mem.expiring') }]}>
        <PrintButton label={t('c.print')} />
      </PageHead>
      {rows.some((r) => r.dates_derived) && <div style={{ marginBottom: '1rem' }}><Alert tone="info">{t('mem.derived_note')}</Alert></div>}

      <div className="tms-stack">
        <section aria-labelledby="x-soon">
          <h2 id="x-soon" style={{ marginBottom: '0.5rem' }}>{t('mem.soon_title', { n: soon.length })}</h2>
          {soon.length === 0 ? <Empty title={t('mem.soon_none')} /> : <DataTable rows={soon} columns={columns} hrefFor={renewHref} openLabel={openLabel} />}
        </section>
        <section aria-labelledby="x-past">
          <h2 id="x-past" style={{ marginBottom: '0.5rem' }}>{t('mem.past_title', { n: past.length })}</h2>
          {past.length === 0 ? <Empty title={t('mem.past_none')} /> : <DataTable rows={past} columns={columns} hrefFor={renewHref} openLabel={openLabel} />}
        </section>
      </div>
    </>
  );
}
