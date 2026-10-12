import Link from 'next/link';
import Icon from '../../../../components/tms/icons';
import { DataTable, Flash, PageHead } from '../../../../components/tms/blocks';
import { Empty, Money } from '../../../../components/tms/ui';
import { ConfirmSubmit } from '../../../../components/tms/client';
import { requireRole, can } from '../../../../lib/tms/auth';
import { canChange } from '../../../../lib/tms/access';
import { getI18n } from '../../../../lib/tms/i18n/server';
import { q } from '../../../../lib/tms/db';
import { fmtDate, formatNumber, pick } from '../../../../lib/tms/format';
import { planTotals } from '../../../../lib/tms/planMath';
import { deletePlan } from '../../../../lib/tms/actions/events';

export const dynamic = 'force-dynamic';

/** Saved event budget plans. */
export default async function PlannerListPage({ searchParams }) {
  const admin = await requireRole('viewer');
  const { t, lang } = await getI18n();
  const mayEdit = can(admin, 'enterMoney') && canChange(admin, 'events');

  const plans = await q(
    `select p.id, p.code, p.title, p.expected_attendees, p.entry_fee, p.updated_at, e.name_en, e.name_mr,
            coalesce((select json_agg(json_build_object('kind', i.kind, 'qty', i.qty, 'unit_amount', i.unit_amount, 'per_head', i.per_head))
                        from event_plan_items i where i.plan_id = p.id), '[]'::json) as items
       from event_plans p left join events e on e.id = p.event_id
      where p.deleted_at is null order by p.updated_at desc limit 200`);
  const rows = plans.map((p) => ({ ...p, totals: planTotals(p) }));

  return (
    <>
      <PageHead title={t('x.pl.title')} intro={t('x.pl.intro')} crumbs={[{ href: '/events', label: t('evt.title') }, { label: t('x.pl.title') }]}>
        {mayEdit && <Link href="/planner/new" className="tms-btn"><Icon name="plus" />{t('x.pl.new')}</Link>}
      </PageHead>
      <Flash searchParams={searchParams} />
      {rows.length === 0 ? (
        <Empty title={t('x.pl.none')} hint={t('x.pl.none_hint')}>
          {mayEdit && <Link href="/planner/new" className="tms-btn"><Icon name="plus" />{t('x.pl.new')}</Link>}
        </Empty>
      ) : (
        <DataTable
          rows={rows} hrefFor={(p) => `/planner/${p.id}`}
          columns={[
            { label: t('x.pl.title_field'), lead: true, cell: (p) => <Link href={`/planner/${p.id}`}>{p.title}</Link> },
            { label: t('f.event'), cell: (p) => pick(lang, p.name_mr, p.name_en) || '—' },
            { label: t('x.pl.people'), right: true, cell: (p) => formatNumber(p.totals.attendees) },
            { label: t('x.pl.total_income'), right: true, cell: (p) => <Money value={p.totals.income} /> },
            { label: t('x.pl.total_expenses'), right: true, cell: (p) => <Money value={p.totals.expense} /> },
            { label: t('x.pl.balance'), right: true, cell: (p) => <strong>{p.totals.balance < 0 ? '− ' : ''}<Money value={Math.abs(p.totals.balance)} /></strong> },
            { label: t('x.pl.changed'), cell: (p) => fmtDate(p.updated_at) },
            ...(mayEdit ? [{ label: '', cell: (p) => (
              <form action={deletePlan} className="no-print">
                <input type="hidden" name="id" value={p.id} />
                <ConfirmSubmit label={t('x.pl.delete')} message={t('x.pl.confirm_delete', { name: p.title })} className="tms-btn tms-btn--quiet tms-btn--small" />
              </form>
            ) }] : []),
          ]}
        />
      )}
    </>
  );
}
