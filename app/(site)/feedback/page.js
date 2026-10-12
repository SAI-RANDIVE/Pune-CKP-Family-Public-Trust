import Link from 'next/link';
import PageHero from '../../../components/PageHero';
import { getCurrentMember } from '../../../lib/memberAuth';
import { buildMetadata } from '../../../lib/seo';
import { TRUST } from '../../../lib/siteData';
import { sendFeedback } from '../member/more-actions';

export const dynamic = 'force-dynamic';

export const metadata = buildMetadata({
  title: 'Suggestions & Feedback | Pune CKP Family Public Trust',
  description: 'Send a suggestion, feedback or a word of appreciation to the trustees of Pune CKP Family Public Trust. Every message is read.',
  path: '/feedback',
});

const NOTES = {
  sent: ['ok', 'Thank you. Your message has reached the trustees. Every message is read.'],
  short: ['error', 'Please write a little more, at least a sentence, so the trustees understand.'],
  rate: ['error', 'You have sent several messages in a short time. Please try again in an hour.'],
  server: ['error', 'Your message could not be saved just now. Please try again in a moment.'],
};

const field = 'mt-1.5 w-full rounded-xl border border-saffron-300 bg-white px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-vermilion-400';
const label = 'text-xs font-semibold uppercase tracking-wide text-ink/65';
const KINDS = [['suggestion', 'A suggestion'], ['feedback', 'Feedback on something the trust did'], ['appreciation', 'A word of appreciation'], ['complaint', 'A concern or complaint']];

export default async function FeedbackPage({ searchParams }) {
  const member = await getCurrentMember().catch(() => null);
  const note = NOTES[String(searchParams?.ok || searchParams?.e || '')];

  return (
    <>
      <PageHero
        eyebrow="Have your say"
        title="Suggestions and feedback"
        titleMr="सूचना आणि अभिप्राय"
        intro="An idea for an event, something that could be done better, a thank-you, a concern: write to the trustees here. Every message is read."
        breadcrumbs={[{ label: 'Suggestions & Feedback' }]}
      />
      <section className="container-page section-y">
        <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-[1.2fr,0.8fr]">
          <form action={sendFeedback} className="card space-y-5 p-6 sm:p-8">
            {note && (
              <p role={note[0] === 'error' ? 'alert' : 'status'} className={`rounded-xl px-4 py-3 text-sm ${note[0] === 'error' ? 'bg-vermilion-50 text-vermilion-800' : 'border border-emerald-300 bg-emerald-50 text-emerald-900'}`}>{note[1]}</p>
            )}
            <fieldset>
              <legend className={label}>What is it?</legend>
              <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
                {KINDS.map(([value, text], index) => (
                  <label key={value} className="flex min-h-[52px] cursor-pointer items-center gap-3 rounded-xl border border-saffron-300 bg-white px-4 py-3 text-sm font-medium text-ink has-[:checked]:border-vermilion-500 has-[:checked]:bg-vermilion-50">
                    <input type="radio" name="kind" value={value} defaultChecked={index === 0} className="h-5 w-5 accent-vermilion-600" />
                    <span>{text}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label className={label} htmlFor="message">Your message<span className="text-vermilion-500"> *</span></label>
              <textarea id="message" name="message" required minLength={10} maxLength={3000} rows={6} className={field} placeholder="Write in English or Marathi." />
            </div>
            {member ? (
              <p className="rounded-xl bg-cream-200 px-4 py-3 text-sm text-ink/80">
                Sending as <strong>{member.name_en || member.name_mr}</strong> ({member.person_code}). The trustees can reply to the contact details they hold for you.
              </p>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="name">Your name</label>
                  <input id="name" name="name" maxLength={120} autoComplete="name" className={field} />
                </div>
                <div>
                  <label className={label} htmlFor="contact">Mobile or e-mail</label>
                  <input id="contact" name="contact" maxLength={160} className={field} />
                  <p className="mt-1.5 text-xs text-ink/60">Only if you would like a reply.</p>
                </div>
              </div>
            )}
            {/* Left empty by people; filled by simple bots. */}
            <div className="hidden" aria-hidden="true">
              <label htmlFor="website">Website</label>
              <input id="website" name="website" tabIndex={-1} autoComplete="off" />
            </div>
            <button type="submit" className="btn btn-lg btn-primary w-full">Send to the trustees</button>
          </form>

          <aside className="space-y-5 text-sm leading-relaxed text-ink/80">
            <div className="card p-6">
              <h2 className="h-card">What happens next</h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5">
                <li>Your message goes straight to the trustees' desk.</li>
                <li>A trustee reads it and notes what will be done.</li>
                <li>If you left a contact, you may get a reply.</li>
              </ol>
            </div>
            <div className="card p-6">
              <h2 className="h-card">Members can also vote</h2>
              <p className="mt-3">The trust runs polls for its members before taking decisions.</p>
              <p className="mt-4"><Link href="/member/polls" className="btn btn-outline">Open the polls</Link></p>
            </div>
            <p>
              Urgent? Call <a href={TRUST.phoneHref} className="font-semibold text-vermilion-700">{TRUST.phoneDisplay}</a>.
            </p>
          </aside>
        </div>
      </section>
    </>
  );
}
