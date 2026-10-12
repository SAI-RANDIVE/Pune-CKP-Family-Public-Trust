import Link from 'next/link';
import { redirect } from 'next/navigation';
import PageHero from '../../../../components/PageHero';
import LiveEventCard from '../../../../components/LiveEventCard';
import LiveRefresh from '../../../../components/LiveRefresh';
import { getPool } from '../../../../lib/db';
import { getCurrentMember } from '../../../../lib/memberAuth';
import { getPublishedEvents } from '../../../../lib/liveEvents';
import { buildMetadata } from '../../../../lib/seo';
import { cancelRegistration, registerForEvent } from '../actions';

export const dynamic = 'force-dynamic';

export const metadata = buildMetadata({
  title: 'Events and Registration | Members\' Corner',
  description: 'Events of Pune CKP Family Public Trust that members can register for.',
  path: '/member/events',
  noindex: true,
});

const NOTES = {
  registered: ['ok', 'You are registered. The trust has your name on the list.'],
  cancelled: ['ok', 'Your registration has been withdrawn.'],
  already: ['error', 'You are already registered for this event.'],
  closed: ['error', 'Registration for this event has closed.'],
  full: ['error', 'All places for this event have been taken.'],
  too_many: ['error', 'There are not enough places left for that many guests. Please reduce the number.'],
  missing: ['error', 'That event could not be found.'],
  server: ['error', 'Something went wrong. Please try again in a moment.'],
};

export default async function MemberEventsPage({ searchParams }) {
  const member = await getCurrentMember();
  if (!member) redirect('/member/login');
  if (member.must_change_password) redirect('/member/password?first=1');

  const [events, mine] = await Promise.all([
    getPublishedEvents({ forMembers: true, limit: 30 }),
    getPool().query("select event_id, code, guests, amount_due, payment_status from event_registrations where person_id = $1 and status <> 'cancelled'", [member.person_id]),
  ]);
  const registered = new Map(mine.rows.map((r) => [r.event_id, r]));
  const note = NOTES[String(searchParams?.ok || searchParams?.e || '')];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <LiveRefresh topic="events" />
      <PageHero
        eyebrow="Members' Corner"
        title="Events and registration"
        intro="Events the trust has announced. Register here and the organisers will have your name on their list. This page updates by itself when something new is announced."
        breadcrumbs={[{ label: "Members' Corner", href: '/member' }, { label: 'Events' }]}
      />
      <section className="container-page section-y space-y-8">
        {note && (
          <p role={note[0] === 'error' ? 'alert' : 'status'} className={`rounded-xl px-4 py-3 text-sm ${note[0] === 'error' ? 'bg-vermilion-50 text-vermilion-800' : 'border border-emerald-300 bg-emerald-50 text-emerald-900'}`}>{note[1]}</p>
        )}
        {events.length === 0 && (
          <div className="card p-8 text-center">
            <h2 className="h-card">No event has been announced yet</h2>
            <p className="mt-3 text-sm text-ink/75">New events appear here as soon as the trust announces them.</p>
            <p className="mt-5"><Link href="/events" className="btn btn-outline">See past events</Link></p>
          </div>
        )}
        {events.map((event) => {
          const reg = registered.get(event.id);
          const past = event.date && event.date < today;
          return (
            <LiveEventCard key={event.id} event={event} headingLevel={2}>
              {reg ? (
                <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-sm text-emerald-950">
                  <p className="text-base font-semibold">You are registered{reg.guests ? `, with ${reg.guests} guest${reg.guests === 1 ? '' : 's'}` : ''}.</p>
                  <p className="mt-1">Registration ID <span className="font-mono font-semibold">{reg.code}</span>
                    {Number(reg.amount_due) > 0 && ` · Fee ₹${Number(reg.amount_due).toLocaleString('en-IN')} (${reg.payment_status === 'paid' ? 'received' : reg.payment_status === 'waived' ? 'waived' : 'to be paid to the organisers'})`}
                  </p>
                  {!past && (
                    <form action={cancelRegistration} className="mt-4">
                      <input type="hidden" name="event_id" value={event.id} />
                      <button type="submit" className="btn btn-sm btn-outline">I cannot come: withdraw my registration</button>
                    </form>
                  )}
                </div>
              ) : event.registrationOpen ? (
                <form action={registerForEvent} className="rounded-2xl border border-saffron-300 bg-cream-100 p-5">
                  <input type="hidden" name="event_id" value={event.id} />
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                    <div>
                      <label htmlFor={`guests-${event.id}`} className="text-xs font-semibold uppercase tracking-wide text-ink/65">Guests coming with you</label>
                      <select id={`guests-${event.id}`} name="guests" defaultValue="0" className="mt-1.5 block w-full rounded-xl border border-saffron-300 bg-white px-3.5 py-3 text-base sm:w-40">
                        {Array.from({ length: Math.min(11, (event.placesLeft ?? 11)) }, (_, i) => <option key={i} value={i}>{i === 0 ? 'Only me' : `${i} guest${i === 1 ? '' : 's'}`}</option>)}
                      </select>
                    </div>
                    <button type="submit" className="btn btn-lg btn-primary">Register me for this event</button>
                  </div>
                  {event.fee > 0 && <p className="mt-3 text-xs text-ink/70">The fee of ₹{event.fee.toLocaleString('en-IN')} per person is paid to the organisers; registering here only puts your name on the list.</p>}
                </form>
              ) : (
                !past && <p className="rounded-xl bg-cream-200 px-4 py-3 text-sm text-ink/80">
                  {event.registrationNote === 'full' ? 'All places have been taken.' : event.registrationNote === 'closed' ? 'Registration has closed.' : 'Registration has not opened yet.'}
                </p>
              )}
            </LiveEventCard>
          );
        })}
      </section>
    </>
  );
}
