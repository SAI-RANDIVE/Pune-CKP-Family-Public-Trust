import { notFound } from 'next/navigation';
import { Flash, PageHead } from '../../../../../components/tms/blocks';
import Planner from '../../../../../components/tms/Planner';
import { requireRole, can } from '../../../../../lib/tms/auth';
import { canChange } from '../../../../../lib/tms/access';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { isUuid, one, q } from '../../../../../lib/tms/db';
import { getEvents, options } from '../../../../../lib/tms/lookups';
import { savePlan } from '../../../../../lib/tms/actions/events';

export const dynamic = 'force-dynamic';

/** The budget planner: a new plan (/planner/new, optionally ?event=<id>) or a saved one. */
export default async function PlannerPage({ params, searchParams }) {
  const isNew = params.id === 'new';
  const admin = await requireRole(isNew ? 'accountant' : 'viewer');
  const { t, lang } = await getI18n();
  const events = options.events(await getEvents(), lang);

  let initial = null;
  if (isNew) {
    const eventId = isUuid(searchParams?.event) ? searchParams.event : '';
    const event = eventId ? await one('select id, name_en, fee, capacity from events where id = $1 and deleted_at is null', [eventId]) : null;
    initial = event
      ? { title: event.name_en, event_id: event.id, entry_fee: event.fee, expected_attendees: event.capacity || '', items: [] }
      : { items: [] };
  } else {
    if (!isUuid(params.id)) notFound();
    initial = await one('select id, code, title, event_id, expected_attendees, entry_fee, notes from event_plans where id = $1 and deleted_at is null', [params.id]);
    if (!initial) notFound();
    initial.items = await q('select kind, label, qty, unit_amount, per_head from event_plan_items where plan_id = $1 order by sort_order', [params.id]);
  }

  const mayEdit = can(admin, 'enterMoney') && canChange(admin, 'events');
  return (
    <>
      <PageHead
        title={isNew ? t('x.pl.new') : initial.title}
        intro={isNew ? t('x.pl.new_intro') : initial.code}
        crumbs={[{ href: '/events', label: t('evt.title') }, { href: '/planner', label: t('x.pl.title') }, { label: isNew ? t('x.pl.new') : initial.code }]}
      />
      <Flash searchParams={searchParams} />
      <Planner
        initial={initial} events={events} action={mayEdit ? savePlan : null}
        exportBase={isNew ? null : `/api/tms/planner/${initial.id}`} canExport={can(admin, 'export')}
      />
    </>
  );
}
