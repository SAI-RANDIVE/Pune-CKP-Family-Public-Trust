import Link from 'next/link';
import Image from 'next/image';
import AreaIcon from './AreaIcon';
import { Mandala } from './Motifs';
import { AREAS_OF_WORK } from '../lib/areasOfWorkData';
import { BANK_DETAILS } from '../lib/bankDetails';
import { TRUST } from '../lib/siteData';
import InstallApp from './InstallApp';

const EXPLORE = [
  { href: '/about', label: 'About the Trust' },
  { href: '/milestones', label: 'Milestones' },
  { href: '/team', label: 'Chairman & Team' },
  { href: '/projects', label: 'Projects' },
  { href: '/impact', label: 'Donations & Impact' },
  { href: '/events', label: 'Events & Activities' },
  { href: '/gaurav-sohala', label: 'CKP Gaurav Sohala' },
  { href: '/gallery', label: 'Photo Gallery' },
  { href: '/gallery/videos', label: 'Video Gallery' },
  { href: '/business-promotion', label: 'Business Promotion' },
  { href: '/member', label: "Members' Corner" },
  { href: '/feedback', label: 'Suggestions & Feedback' },
];

const SOCIAL_ICONS = {
  Facebook: <path d="M13.500 21v-7h2.400l.400-3h-2.800V9.200c0-.900.300-1.500 1.600-1.500h1.300V5.100C16.100 5 15.300 5 14.400 5 12.200 5 10.700 6.300 10.700 8.800V11H8.300v3h2.400v7z" />,
  YouTube: <path d="M21.300 8.200a2.400 2.400 0 0 0-1.700-1.700C18.100 6.100 12 6.100 12 6.100s-6.100 0-7.600.400A2.400 2.400 0 0 0 2.700 8.200C2.300 9.700 2.300 12 2.300 12s0 2.300.400 3.800a2.400 2.400 0 0 0 1.700 1.700c1.500.400 7.600.400 7.600.400s6.100 0 7.600-.400a2.400 2.400 0 0 0 1.700-1.700c.400-1.500.400-3.800.400-3.800s0-2.300-.400-3.800zM10.100 14.600V9.400l4.500 2.600z" />,
  Instagram: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="4" width="16" height="16" rx="4.5" />
      <circle cx="12" cy="12" r="3.6" />
      <circle cx="16.8" cy="7.2" r="0.7" fill="currentColor" />
    </g>
  ),
};

const linkClass = 'tap text-sm text-cream-200/80 underline-offset-4 transition-colors hover:text-saffron-300 hover:underline md:min-h-0 md:py-1';

export default function Footer() {
  return (
    <footer className="on-dark panel-ink relative mt-20 overflow-hidden text-cream-200 md:mt-28">
      <div className="motif-toran" aria-hidden="true" />
      <Mandala className="pointer-events-none absolute -bottom-32 -left-28 h-96 w-96 text-saffron-400/10" />

      {/* Donate / Join strip */}
      <div className="container-page relative pt-12">
        <div className="flex flex-col items-start justify-between gap-6 rounded-3xl border border-saffron-400/25 bg-white/5 p-6 sm:p-8 lg:flex-row lg:items-center">
          <div>
            <p className="devanagari text-xl font-semibold text-saffron-300 sm:text-2xl" lang="mr">{TRUST.tagline}</p>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-cream-200/80">
              What society gives should be given back to society. Join the family as a member, or support its work with a donation.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 min-[420px]:flex-row lg:w-auto">
            <Link href="/donate" className="btn btn-saffron">Donate now</Link>
            <Link href="/membership" className="btn btn-light">Become a member</Link>
          </div>
        </div>
      </div>

      <div className="container-page relative grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.3fr,1fr,1fr,1.1fr]">
        <div>
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="block h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-saffron-400 bg-cream-200">
              <Image src="/logo/logo.png" alt="" width={48} height={48} className="h-full w-full object-cover" />
            </span>
            <span>
              <span className="block font-display text-xl text-saffron-300">{TRUST.name}</span>
              <span className="devanagari block text-sm text-cream-200/75" lang="mr">{TRUST.nameMr}</span>
            </span>
          </Link>
          <address className="mt-5 text-sm not-italic leading-relaxed text-cream-200/80">
            {TRUST.addressLines.map((line) => <span key={line} className="block">{line}</span>)}
          </address>
          <ul className="mt-4 space-y-1">
            <li><a href={TRUST.phoneHref} className={`${linkClass} gap-2`}><AreaIcon name="phone" className="h-4 w-4 text-saffron-300" />{TRUST.phoneDisplay}</a></li>
            <li><a href={`mailto:${TRUST.email}`} className={`${linkClass} gap-2 break-all`}><AreaIcon name="mail" className="h-4 w-4 shrink-0 text-saffron-300" />{TRUST.email}</a></li>
          </ul>
          <ul className="mt-4 flex gap-2" aria-label="Social media">
            {TRUST.social.map((item) => (
              <li key={item.label}>
                <a href={item.href} target="_blank" rel="noopener noreferrer" aria-label={`${TRUST.name} on ${item.label} (opens in a new tab)`} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-cream-200/25 text-cream-200 transition-colors hover:border-saffron-300 hover:bg-saffron-400 hover:text-ink">
                  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">{SOCIAL_ICONS[item.label]}</svg>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <nav aria-label="Explore">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-saffron-300">Explore</h2>
          <ul className="mt-3 md:space-y-0.5">
            {EXPLORE.map((item) => <li key={item.href}><Link href={item.href} className={linkClass}>{item.label}</Link></li>)}
          </ul>
        </nav>

        <nav aria-label="Areas of work">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-saffron-300">Areas of Work</h2>
          <ul className="mt-3 md:space-y-0.5">
            {AREAS_OF_WORK.map((area) => <li key={area.slug}><Link href={`/areas-of-work/${area.slug}`} className={linkClass}>{area.title}</Link></li>)}
          </ul>
          <h2 className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-saffron-300">Get involved</h2>
          <ul className="mt-3 md:space-y-0.5">
            <li><Link href="/membership" className={linkClass}>Membership</Link></li>
            <li><Link href="/donate" className={linkClass}>Donate online</Link></li>
            <li><Link href="/contact" className={linkClass}>Contact us</Link></li>
            <li><Link href="/faq" className={linkClass}>FAQ</Link></li>
          </ul>
        </nav>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-saffron-300">Bank transfer</h2>
          <p className="mt-3 text-xs leading-relaxed text-cream-200/70">For donations above ₹10,000, or if you prefer a direct transfer.</p>
          <dl className="mt-3 space-y-1.5 font-mono text-[13px] text-cream-200/85">
            <div><dt className="sr-only">Bank</dt><dd>{BANK_DETAILS.bankName}, {BANK_DETAILS.branch}</dd></div>
            <div className="flex gap-2"><dt className="text-cream-200/60">A/C</dt><dd>{BANK_DETAILS.accountNumber}</dd></div>
            <div className="flex gap-2"><dt className="text-cream-200/60">IFSC</dt><dd>{BANK_DETAILS.ifsc}</dd></div>
            <div className="flex gap-2"><dt className="text-cream-200/60">G-Pay</dt><dd>{BANK_DETAILS.gpay}</dd></div>
          </dl>
          <Link href="/donate/bank-transfer" className="link-arrow mt-2 !text-saffron-300">Full details <span className="arrow" aria-hidden="true">→</span></Link>
        </div>
      </div>

      <div className="relative border-t border-cream-200/10">
        <div className="container-page flex flex-col items-center gap-3 py-6 text-center md:flex-row md:justify-between md:text-left">
          <p className="text-xs leading-relaxed text-cream-200/70">
            <span className="devanagari text-base font-medium text-saffron-300" lang="mr">{TRUST.motto}</span>
            <span className="mx-2" aria-hidden="true">·</span>
            © {new Date().getFullYear()} {TRUST.name}. Reg. No. {TRUST.regNo}, dated {TRUST.regDate}. PAN {TRUST.pan}.
          </p>
          <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-5 text-xs">
            <Link href="/terms" className={`${linkClass} !text-xs`}>Terms</Link>
            <Link href="/privacy" className={`${linkClass} !text-xs`}>Privacy</Link>
            <Link href="/refund-policy" className={`${linkClass} !text-xs`}>Refund policy</Link>
            <InstallApp variant="link" className={`${linkClass} !text-xs`} />
          </nav>
        </div>
      </div>
    </footer>
  );
}
