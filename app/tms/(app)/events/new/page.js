import { Flash, PageHead } from '../../../../../components/tms/blocks';
import { Card } from '../../../../../components/tms/ui';
import EventForm from '../../../../../components/tms/EventForm';
import { requireRole } from '../../../../../lib/tms/auth';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { saveEvent } from '../../../../../lib/tms/actions/events';

export const dynamic = 'force-dynamic';

/** Add an event. Banner, photographs and registrations are added on the next screen. */
export default async function NewEventPage({ searchParams }) {
  await requireRole('accountant');
  const { t } = await getI18n();
  return (
    <>
      <PageHead title={t('x.ev.add')} intro={t('x.ev.add_intro')} crumbs={[{ href: '/events', label: t('evt.title') }, { label: t('x.ev.add') }]} />
      <Flash searchParams={searchParams} />
      <Card style={{ maxWidth: '56rem' }}>
        <EventForm t={t} action={saveEvent} />
      </Card>
    </>
  );
}
