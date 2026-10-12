import { redirect } from 'next/navigation';
import PageHero from '../../../../components/PageHero';
import Countdown from '../../../../components/Countdown';
import LiveRefresh from '../../../../components/LiveRefresh';
import { getCurrentMember } from '../../../../lib/memberAuth';
import { pollsForMember } from '../../../../lib/polls';
import { describeTimeLeft } from '../../../../lib/timeLeft';
import { buildMetadata } from '../../../../lib/seo';
import { castVote } from '../more-actions';

export const dynamic = 'force-dynamic';

export const metadata = buildMetadata({
  title: 'Polls | Members\' Corner',
  description: 'Have your say: polls for members of Pune CKP Family Public Trust.',
  path: '/member/polls',
  noindex: true,
});

const NOTES = {
  voted: ['ok', 'Thank you. Your vote has been counted.'],
  already: ['error', 'You have already voted in this poll. A vote cannot be changed.'],
  closed: ['error', 'This poll has closed.'],
  choose: ['error', 'Please choose one option.'],
  missing: ['error', 'That poll could not be found.'],
  server: ['error', 'Something went wrong. Please try again in a moment.'],
};

const day = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

function Results({ results, myVote }) {
  return (
    <ul className="mt-5 space-y-3">
      {results.rows.map((row, index) => (
        <li key={index}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className={`font-medium ${myVote === index ? 'text-vermilion-700' : 'text-ink'}`}>{row.label}{myVote === index ? ' (your vote)' : ''}</span>
            <span className="shrink-0 font-semibold tabular-nums text-ink">{row.pct}% · {row.votes}</span>
          </div>
          <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-cream-300" role="img" aria-label={`${row.label}: ${row.pct} percent, ${row.votes} votes`}>
            <div className={`h-full rounded-full ${myVote === index ? 'bg-vermilion-600' : 'bg-saffron-500'}`} style={{ width: `${Math.max(row.votes ? 2 : 0, row.pct)}%` }} />
          </div>
        </li>
      ))}
      <li className="pt-1 text-xs text-ink/60">{results.total} vote{results.total === 1 ? '' : 's'} in all</li>
    </ul>
  );
}

export default async function MemberPollsPage({ searchParams }) {
  const member = await getCurrentMember();
  if (!member) redirect('/member/login');
  if (member.must_change_password) redirect('/member/password?first=1');

  const polls = await pollsForMember(member.person_id);
  const note = NOTES[String(searchParams?.ok || searchParams?.e || '')];

  return (
    <>
      <LiveRefresh topic="polls" />
      <PageHero
        eyebrow="Members' Corner"
        title="Polls"
        titleMr="आपले मत"
        intro="The trust asks its members before it decides. Each member has one vote in each poll, and a poll closes when its timer runs out."
        breadcrumbs={[{ label: "Members' Corner", href: '/member' }, { label: 'Polls' }]}
      />
      <section className="container-page section-y space-y-8">
        {note && (
          <p role={note[0] === 'error' ? 'alert' : 'status'} className={`rounded-xl px-4 py-3 text-sm ${note[0] === 'error' ? 'bg-vermilion-50 text-vermilion-800' : 'border border-emerald-300 bg-emerald-50 text-emerald-900'}`}>{note[1]}</p>
        )}
        {polls.length === 0 && (
          <div className="card p-8 text-center">
            <h2 className="h-card">There is no poll at the moment</h2>
            <p className="mt-3 text-sm text-ink/75">When the trust asks a question, it appears here.</p>
          </div>
        )}
        <div className="grid gap-8 lg:grid-cols-2">
          {polls.map((poll) => (
            <article key={poll.id} id={`poll-${poll.id}`} className="card scroll-mt-28 p-6 sm:p-8">
              <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                {poll.open
                  ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-900">Open · <Countdown until={poll.closesAt} initial={describeTimeLeft(new Date(poll.closesAt).getTime() - Date.now()) || 'Closed'} /></span>
                  : <span className="rounded-full bg-cream-300 px-3 py-1 text-ink/75">Closed on {day(poll.closesAt)}</span>}
                {poll.myVote !== null && <span className="rounded-full border border-saffron-300 px-3 py-1 text-ink/75">You voted</span>}
              </p>
              <h2 className="h-card mt-4 !text-xl">{poll.question}</h2>
              {poll.description && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink/75">{poll.description}</p>}

              {poll.open && poll.myVote === null && (
                <form action={castVote} className="mt-5">
                  <input type="hidden" name="poll_id" value={poll.id} />
                  <fieldset>
                    <legend className="sr-only">Choose one</legend>
                    <div className="space-y-2.5">
                      {poll.options.map((option, index) => (
                        <label key={index} className="flex min-h-[52px] cursor-pointer items-center gap-3 rounded-xl border border-saffron-300 bg-white px-4 py-3 text-[0.95rem] font-medium text-ink has-[:checked]:border-vermilion-500 has-[:checked]:bg-vermilion-50">
                          <input type="radio" name="option" value={index} required className="h-5 w-5 accent-vermilion-600" />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <button type="submit" className="btn btn-primary mt-5">Cast my vote</button>
                  <p className="mt-3 text-xs text-ink/60">Closes on {day(poll.closesAt)}. A vote cannot be changed afterwards.</p>
                </form>
              )}

              {poll.results
                ? <Results results={poll.results} myVote={poll.myVote} />
                : (poll.myVote !== null || poll.closed) && (
                  <p className="mt-5 rounded-xl bg-cream-200 px-4 py-3 text-sm text-ink/80">
                    {poll.myVote !== null && <>You chose <strong>{poll.options[poll.myVote]}</strong>. </>}
                    The result will be shown here when the poll closes.
                  </p>
                )}
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
