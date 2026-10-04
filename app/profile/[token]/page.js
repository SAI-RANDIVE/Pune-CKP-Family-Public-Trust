import Link from 'next/link';
import { notFound } from 'next/navigation';
import MembershipBadge, { tierOf } from '../../../components/MembershipBadge';
import Reveal from '../../../components/Reveal';
import { getPool } from '../../../lib/db';

export const dynamic = 'force-dynamic';

// A profile is a private, unguessable link to someone's own record. It must
// never be indexed, and it must not show up in the sitemap.
export const metadata = {
  title: 'Your Membership Profile | Pune CKP Family Public Trust',
  robots: { index: false, follow: false, nocache: true },
};

function fmtDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }).format(d);
}

function money(v) {
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(v || 0))}`;
}

export default async function ProfilePage({ params }) {
  const token = String(params.token || '');
  // Tokens are 48 hex chars; reject anything else without touching the DB.
  if (!/^[a-f0-9]{32,64}$/i.test(token)) notFound();

  const pool = getPool();
  const { rows } = await pool.query('select * from members where profile_token = $1', [token]);
  if (!rows.length) notFound();
  const member = rows[0];

  const { rows: payments } = await pool.query(
    `select id, receipt_no, amount, towards, status, paid_at, created_at, membership_no, payment_kind
       from payments
      where member_id = $1 and status = 'paid'
      order by coalesce(paid_at, created_at) desc`,
    [member.id]
  );

  await pool.query('update members set last_seen_at = now() where id = $1', [member.id]);

  const tier = tierOf(member.membership_type);
  const lifetime = !member.valid_till;
  const validTill = fmtDate(member.valid_till);
  const expired = member.valid_till && new Date(member.valid_till) < new Date();
  const totalGiven = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const facts = [
    ['Full name', member.full_name],
    ['Member since', fmtDate(member.valid_from)],
    ['Phone', member.phone],
    ['Email', member.email],
    ['Blood group', member.blood_group],
    ['PAN', member.pan_number],
    ['Date of birth', fmtDate(member.date_of_birth)],
    ['Anniversary', fmtDate(member.date_of_anniversary)],
  ].filter(([, v]) => v);

  return (
    <div className="container-page py-16 md:py-24">
      <Reveal className="text-center">
        <p className="text-xs font-semibold tracking-[0.25em] uppercase text-vermilion-600">Member Profile</p>
        <h1 className="font-display text-4xl md:text-5xl mt-3">{member.full_name}</h1>
      </Reveal>

      {/* Membership card */}
      <Reveal delay={80} className="mt-12 max-w-3xl mx-auto">
        <div className={`relative overflow-hidden rounded-3xl border-2 p-8 md:p-10 shadow-lg membership-card membership-card--${member.membership_type} ring-1 ${tier.ring}`}>
          <div className="relative grid gap-8 md:grid-cols-[auto,1fr] items-center">
            <MembershipBadge type={member.membership_type} membershipNo={member.membership_no} size="7.5rem" />
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-ink/50">Membership status</p>
              <p className={`font-display text-2xl mt-2 ${expired ? 'text-vermilion-700' : 'text-emerald-700'}`}>
                {lifetime ? 'Lifetime member' : expired ? 'Expired' : 'Active'}
              </p>
              {lifetime ? (
                <p className="text-sm text-ink/70 mt-2">This membership does not expire.</p>
              ) : (
                <p className="text-sm text-ink/70 mt-2">
                  {expired ? 'Expired on ' : 'Valid until '}
                  <span className="font-semibold">{validTill}</span>
                </p>
              )}
              {expired && (
                <Link href="/membership" className="btn-press inline-block mt-4 rounded-full bg-vermilion-500 px-5 py-2.5 text-sm font-semibold text-cream-100 hover:bg-vermilion-600">
                  Renew membership
                </Link>
              )}
            </div>
          </div>
        </div>
      </Reveal>

      {/* Details + contribution summary */}
      <div className="mt-8 grid gap-6 md:grid-cols-[1.2fr,0.8fr] max-w-3xl mx-auto">
        <Reveal delay={120}>
          <section className="h-full bg-cream-100 border border-saffron-200/70 rounded-2xl p-7">
            <h2 className="font-display text-xl text-vermilion-700">Your details</h2>
            <dl className="mt-5 space-y-3">
              {facts.map(([label, value]) => (
                <div key={label} className="flex flex-wrap justify-between gap-3 border-b border-saffron-200/50 pb-2 last:border-0">
                  <dt className="text-sm text-ink/60">{label}</dt>
                  <dd className="text-sm font-medium text-ink text-right break-all">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-ink/50 mt-5 leading-relaxed">
              Need something changed? Email{' '}
              <a href="mailto:puneckpfamily@gmail.com" className="link-underline text-vermilion-600 font-semibold">puneckpfamily@gmail.com</a>{' '}
              or call Shri Nilesh Gupte on 8669151533.
            </p>
          </section>
        </Reveal>

        <Reveal delay={160}>
          <section className="h-full bg-gradient-to-br from-vermilion-600 to-vermilion-800 text-cream-100 rounded-2xl p-7">
            <h2 className="font-display text-xl">Your contribution</h2>
            <p className="font-display text-4xl mt-4">{money(totalGiven)}</p>
            <p className="text-xs text-cream-100/75 mt-2">across {payments.length} receipted payment{payments.length === 1 ? '' : 's'}</p>
            <p className="text-sm text-cream-100/85 mt-6 leading-relaxed">
              Thank you. Every rupee here has gone to a student, a patient or a family who needed it.
            </p>
          </section>
        </Reveal>
      </div>

      {/* Receipts */}
      <Reveal delay={200} className="mt-8 max-w-3xl mx-auto">
        <section className="bg-cream-100 border border-saffron-200/70 rounded-2xl p-7">
          <h2 className="font-display text-xl text-vermilion-700">Your receipts</h2>
          {payments.length === 0 ? (
            <p className="text-sm text-ink/60 mt-4">No receipted payments yet.</p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-saffron-200">
                    <th scope="col" className="py-2 pr-4 font-semibold text-ink/70">Receipt</th>
                    <th scope="col" className="py-2 pr-4 font-semibold text-ink/70">Towards</th>
                    <th scope="col" className="py-2 pr-4 font-semibold text-ink/70">Amount</th>
                    <th scope="col" className="py-2 pr-4 font-semibold text-ink/70">Date</th>
                    <th scope="col" className="py-2 font-semibold text-ink/70"><span className="sr-only">Download</span></th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-saffron-200/40 last:border-0 hover:bg-saffron-50/50 transition-colors">
                      <td className="py-3 pr-4 font-mono text-xs">{p.receipt_no}</td>
                      <td className="py-3 pr-4 text-ink/75">{p.towards}</td>
                      <td className="py-3 pr-4 font-medium">{money(p.amount)}</td>
                      <td className="py-3 pr-4 text-ink/60">{fmtDate(p.paid_at || p.created_at)}</td>
                      <td className="py-3">
                        <a href={`/api/receipt/${p.id}`} className="link-underline text-xs font-semibold text-vermilion-600">PDF</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </Reveal>

      <Reveal delay={240} className="mt-10 text-center">
        <p className="text-xs text-ink/50">This is your private link. Anyone with it can see this page, so don&rsquo;t share it publicly.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href="/donate" className="btn-press rounded-full bg-vermilion-500 text-cream-100 px-6 py-3 font-semibold hover:bg-vermilion-600">Make a donation</Link>
          <Link href="/faq" className="btn-press rounded-full border-2 border-vermilion-500 text-vermilion-600 px-6 py-3 font-semibold hover:bg-vermilion-50">Read the FAQ</Link>
        </div>
      </Reveal>
    </div>
  );
}
