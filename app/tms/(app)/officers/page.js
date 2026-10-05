import Link from 'next/link';
import { Flash, PageHead } from '../../../../components/tms/blocks';
import { Alert, Badge, Card, Empty } from '../../../../components/tms/ui';
import { PrintButton, SubmitButton } from '../../../../components/tms/client';
import { requireRole, can } from '../../../../lib/tms/auth';
import { getI18n } from '../../../../lib/tms/i18n/server';
import { q } from '../../../../lib/tms/db';
import { fmtDate, pick, todayIso } from '../../../../lib/tms/format';
import { endOfficer } from '../../../../lib/tms/actions/people';

export const dynamic = 'force-dynamic';

/** Office bearers and trustees, serving and past. */
export default async function OfficersPage({ searchParams }) {
  const admin = await requireRole('viewer');
  const { t, lang } = await getI18n();
  const mayManage = can(admin, 'manageOfficers');

  const rows = await q(
    `select o.id, o.title_en, o.title_mr, o.from_date, o.to_date, o.display_order, p.id as person_id, p.name_en, p.name_mr,
            a.name as login_name, (o.to_date is null or o.to_date >= current_date) as serving
       from trust_officers o join people p on p.id = o.person_id left join admin_users a on a.id = o.admin_user_id
      where o.deleted_at is null and p.deleted_at is null
      order by (o.to_date is null or o.to_date >= current_date) desc, o.display_order, o.from_date desc nulls last, p.name_en`);
  const serving = rows.filter((r) => r.serving);
  const past = rows.filter((r) => !r.serving);

  const item = (o) => (
    <li key={o.id} style={{ borderTop: '1px solid var(--line)', padding: '0.75rem 0' }}>
      <strong style={{ fontSize: '1.1rem' }}>{pick(lang, o.title_mr, o.title_en)}</strong>{' '}
      {o.serving ? <Badge tone="ok">{t('off.current')}</Badge> : <Badge tone="neutral">{t('off.past')}</Badge>}
      <div><Link href={`/people/${o.person_id}`}>{pick(lang, o.name_mr, o.name_en)}</Link></div>
      <div className="muted">
        {o.from_date ? fmtDate(o.from_date) : t('c.unknown')} – {o.to_date ? fmtDate(o.to_date) : t('off.current')}
        {o.login_name ? ` · ${t('off.login')}: ${o.login_name}` : ''}
      </div>
      {mayManage && o.serving && !o.to_date && (
        <form action={endOfficer} className="tms-actions no-print" style={{ marginTop: '0.5rem' }}>
          <input type="hidden" name="id" value={o.id} />
          <label className="sr-only" htmlFor={`to-${o.id}`}>{t('off.to')}</label>
          <input className="tms-input" style={{ maxWidth: '13rem' }} id={`to-${o.id}`} name="to_date" type="date" required defaultValue={todayIso()} />
          <SubmitButton className="tms-btn tms-btn--quiet tms-btn--small">{t('off.end')}</SubmitButton>
        </form>
      )}
    </li>
  );

  return (
    <>
      <PageHead title={t('off.list')} intro={t('off.intro')} crumbs={[{ href: '/members', label: t('mem.title') }, { label: t('off.list') }]}>
        <PrintButton label={t('c.print')} />
      </PageHead>
      <Flash searchParams={searchParams} />
      {mayManage && <div style={{ marginBottom: '1rem' }}><Alert tone="info">{t('off.how_add')}</Alert></div>}

      {rows.length === 0 ? <Empty title={t('off.none')} /> : (
        <div className="tms-grid tms-grid--2">
          <Card title={`${t('off.serving')} (${serving.length})`}>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{serving.map(item)}</ul>
          </Card>
          <Card title={`${t('off.past_title')} (${past.length})`}>
            {past.length === 0 ? <p className="muted">{t('c.none')}</p> : <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{past.map(item)}</ul>}
          </Card>
        </div>
      )}
    </>
  );
}
