import Link from 'next/link';
import { redirect } from 'next/navigation';
import PageHero from '../../../../components/PageHero';
import { getCurrentMember } from '../../../../lib/memberAuth';
import { RELATIONS, RELATION_LABEL, listFamily } from '../../../../lib/family';
import { buildMetadata } from '../../../../lib/seo';
import { addFamilyMember, confirmFamilyMember, removeFamilyMember } from '../more-actions';

export const dynamic = 'force-dynamic';

export const metadata = buildMetadata({
  title: 'My Family | Members\' Corner',
  description: 'Link your family members at Pune CKP Family Public Trust.',
  path: '/member/family',
  noindex: true,
});

const NOTES = {
  code_sent: ['ok', 'A six-digit code has been e-mailed to {to}. Ask them for it and type it below to finish.'],
  linked: ['ok', 'Done. You are now linked as one family.'],
  removed: ['ok', 'The family link has been removed.'],
  need_id: ['error', 'Please type your family member\'s trust ID or membership ID.'],
  not_found: ['error', 'No person has that ID. Please check it; it is printed on their receipt or membership card.'],
  self: ['error', 'That is your own ID.'],
  exists: ['error', 'This person is already in your family.'],
  no_email: ['error', 'The trust has no e-mail address for that person, so a code cannot be sent. Ask the trust to add their e-mail, or to link you at the trust desk.'],
  too_many: ['error', 'You have reached the largest family size that can be added online. Please ask the trust to add more.'],
  mail: ['error', 'The code could not be e-mailed just now. Please try again in a few minutes.'],
  rate: ['error', 'Too many requests. Please wait a while and try again.'],
  relation: ['error', 'Please choose how this person is related to you.'],
  wrong: ['error', 'That code is not correct. Please check it and try again.'],
  expired: ['error', 'That code has expired. Send a new one with "Send a new code".'],
  locked: ['error', 'Too many wrong codes. Send a new one with "Send a new code".'],
};

const field = 'mt-1.5 w-full rounded-xl border border-saffron-300 bg-white px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-vermilion-400';
const label = 'text-xs font-semibold uppercase tracking-wide text-ink/65';
const cap = (s) => (s ? `${String(s).charAt(0).toUpperCase()}${String(s).slice(1)}` : '');

export default async function MemberFamilyPage({ searchParams }) {
  const member = await getCurrentMember();
  if (!member) redirect('/member/login');
  if (member.must_change_password) redirect('/member/password?first=1');

  const family = await listFamily(member.person_id);
  const confirmed = family.filter((f) => f.status === 'confirmed');
  const pending = family.filter((f) => f.status === 'pending');
  const note = NOTES[String(searchParams?.ok || searchParams?.e || '')];

  return (
    <>
      <PageHero
        eyebrow="Members' Corner"
        title="My family"
        titleMr="माझे कुटुंब"
        intro="Add your spouse, children and parents by their trust ID, so the trust sees you as one family. Each person keeps their own ID; a link is made only when they agree."
        breadcrumbs={[{ label: "Members' Corner", href: '/member' }, { label: 'My family' }]}
      />
      <section className="container-page section-y space-y-8">
        {note && (
          <p role={note[0] === 'error' ? 'alert' : 'status'} className={`rounded-xl px-4 py-3 text-sm ${note[0] === 'error' ? 'bg-vermilion-50 text-vermilion-800' : 'border border-emerald-300 bg-emerald-50 text-emerald-900'}`}>
            {note[1].replace('{to}', String(searchParams?.to || 'their e-mail address').slice(0, 80))}
          </p>
        )}

        <div className="grid gap-8 lg:grid-cols-[1.15fr,0.85fr]">
          <div className="space-y-6">
            <div className="card p-6 sm:p-8">
              <h2 className="h-card">Your family ({confirmed.length})</h2>
              {confirmed.length === 0 ? (
                <p className="mt-4 text-sm leading-relaxed text-ink/75">Nobody is linked yet. Add your first family member with the form beside this.</p>
              ) : (
                <ul className="mt-5 divide-y divide-saffron-200/70">
                  {confirmed.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center gap-4 py-4 first:pt-0 last:pb-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {f.person.hasPhoto
                        ? <img src={`/api/member/photo?p=${f.person.id}`} alt="" className="h-14 w-14 rounded-full border-2 border-saffron-300 object-cover" loading="lazy" />
                        : <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-saffron-100 font-display text-xl text-vermilion-700">{String(f.person.name || '?').charAt(0)}</span>}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-ink">{f.person.name}</p>
                        <p className="text-sm text-ink/75">{RELATION_LABEL[f.relation]} · <span className="font-mono text-xs">{f.person.membershipCode || f.person.code}</span></p>
                        {f.person.membership && <p className="text-xs text-ink/60">{cap(f.person.membership)}</p>}
                      </div>
                      <form action={removeFamilyMember}>
                        <input type="hidden" name="link_id" value={f.id} />
                        <button type="submit" className="text-sm font-semibold text-ink/60 underline underline-offset-4 hover:text-vermilion-700">Remove</button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {pending.length > 0 && (
              <div className="card border-saffron-400 bg-saffron-50 p-6 sm:p-8">
                <h2 className="h-card">Waiting for approval ({pending.length})</h2>
                <ul className="mt-5 space-y-6">
                  {pending.map((f) => (
                    <li key={f.id} id={`link-${f.id}`} className="scroll-mt-28">
                      <p className="font-semibold text-ink">{f.person.name} <span className="font-normal text-ink/70">· {RELATION_LABEL[f.relation]}</span></p>
                      {f.startedByMe ? (
                        <>
                          <p className="mt-1 text-sm text-ink/75">A code was e-mailed to them. Ask them for it and type it here.</p>
                          <form action={confirmFamilyMember} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                            <input type="hidden" name="link_id" value={f.id} />
                            <div>
                              <label className={label} htmlFor={`code-${f.id}`}>Six-digit code</label>
                              <input id={`code-${f.id}`} name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="one-time-code" className={`${field} w-40 font-mono tracking-[0.3em]`} />
                            </div>
                            <button type="submit" className="btn btn-primary">Confirm</button>
                          </form>
                          <div className="mt-3 flex flex-wrap gap-4 text-sm">
                            <form action={addFamilyMember}>
                              <input type="hidden" name="relative_id" value={f.person.code} />
                              <input type="hidden" name="relation" value={f.relation} />
                              <button type="submit" className="font-semibold text-vermilion-700 underline underline-offset-4">Send a new code</button>
                            </form>
                            <form action={removeFamilyMember}>
                              <input type="hidden" name="link_id" value={f.id} />
                              <button type="submit" className="font-semibold text-ink/60 underline underline-offset-4">Cancel this request</button>
                            </form>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="mt-1 text-sm text-ink/75">They asked to add you. If you agree, give them the code that was e-mailed to you. If not, decline.</p>
                          <form action={removeFamilyMember} className="mt-3">
                            <input type="hidden" name="link_id" value={f.id} />
                            <button type="submit" className="btn btn-sm btn-outline">Decline</button>
                          </form>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="card h-fit p-6 sm:p-8">
            <h2 className="h-card">Add a family member</h2>
            <form action={addFamilyMember} className="mt-5 space-y-5">
              <div>
                <label className={label} htmlFor="relative_id">Their trust ID or membership ID</label>
                <input id="relative_id" name="relative_id" required maxLength={40} autoCapitalize="characters" spellCheck={false} placeholder="e.g. PCFPT/PER/00045" className={`${field} font-mono`} />
                <p className="mt-1.5 text-xs text-ink/60">It is on their receipt, their membership card, or the first page of their members' corner.</p>
              </div>
              <div>
                <label className={label} htmlFor="relation">They are my</label>
                <select id="relation" name="relation" required defaultValue="" className={field}>
                  <option value="" disabled>Choose…</option>
                  {RELATIONS.map((r) => <option key={r} value={r}>{RELATION_LABEL[r]}</option>)}
                </select>
              </div>
              <button type="submit" className="btn btn-lg btn-primary w-full">Send them a code</button>
            </form>
            <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-ink/75">
              <li>A six-digit code goes to the e-mail address the trust holds for that person.</li>
              <li>They tell you the code; you type it here.</li>
              <li>You are linked. Either of you can remove the link at any time.</li>
            </ol>
            <p className="mt-5 text-sm text-ink/75">
              A family member who is not yet with the trust needs their own ID first: they can <Link href="/membership" className="font-semibold text-vermilion-700">join as a member</Link>, or the trust can add them at the trust desk.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
