import Link from 'next/link';
import Image from 'next/image';
import PageHero from '../../../components/PageHero';
import SectionHeading from '../../../components/SectionHeading';
import Reveal, { Stagger } from '../../../components/Reveal';
import AreaIcon from '../../../components/AreaIcon';
import CtaBanner from '../../../components/CtaBanner';
import JsonLd from '../../../components/JsonLd';
import { buildMetadata, getSiteUrl } from '../../../lib/seo';
import { TEAM, WORKING_COMMITTEE_NOTE, CHAIRMAN_MESSAGE } from '../../../lib/teamData';
import { siteImage } from '../../../lib/galleryData';
import { TRUST } from '../../../lib/siteData';

export const metadata = buildMetadata({
  title: 'Chairman & Team | Pune CKP Family Public Trust',
  description: 'The office bearers of Pune CKP Family Public Trust: Chairman Shri Nandkumar Wadhavkar and Secretary Shri Nilesh R. Gupte, and how to reach the trust.',
  path: '/team',
});

export default function TeamPage() {
  const people = TEAM.map((person) => ({ ...person, src: siteImage('team', person.photo) }));

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'NGO',
    '@id': `${getSiteUrl()}/#organization`,
    name: TRUST.name,
    url: getSiteUrl(),
    member: people.map((person) => ({
      '@type': 'OrganizationRole',
      roleName: person.role,
      member: { '@type': 'Person', name: person.name.replace(/^Shri\s+/, '') },
    })),
  };

  return (
    <>
      <JsonLd data={schema} />
      <PageHero
        eyebrow="The Team"
        title="Chairman and office bearers"
        intro="The people who hold office in the trust, and how to reach them."
        breadcrumbs={[{ label: 'About the Trust', href: '/about' }, { label: 'Chairman & Team' }]}
      />

      <section className="container-page section-y" aria-labelledby="office-bearers-heading">
        <h2 id="office-bearers-heading" className="sr-only">Office bearers</h2>
        <Stagger className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
          {people.map((person) => (
            <article key={person.slug} className="card card-hover overflow-hidden text-center">
              <div className="motif-paithani" aria-hidden="true" />
              <div className="p-7 sm:p-8">
                <div className="relative mx-auto h-40 w-40 overflow-hidden rounded-full border-4 border-saffron-300 bg-cream-300 shadow-soft">
                  {person.src ? (
                    <Image src={person.src} alt={`Portrait of ${person.name}, ${person.role}`} fill sizes="160px" className="object-cover object-top" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center font-display text-5xl text-vermilion-700" aria-hidden="true">{person.name.replace(/^Shri\s+/, '').charAt(0)}</span>
                  )}
                </div>
                <p className="eyebrow mt-6">{person.role} <span className="devanagari font-semibold normal-case tracking-normal" lang="mr">· {person.roleMr}</span></p>
                <h3 className="mt-2 font-display text-2xl text-ink">{person.name}</h3>
                <p className="devanagari text-base text-ink/70" lang="mr">{person.nameMr}</p>
                <ul className="mt-5 space-y-2 text-left">
                  {person.notes.map((note) => (
                    <li key={note} className="flex gap-2.5 text-sm leading-relaxed text-ink/75">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-saffron-500" aria-hidden="true" />
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </Stagger>

        <Reveal className="mx-auto mt-8 max-w-4xl rounded-2xl border border-saffron-200 bg-cream-300/50 px-6 py-5 text-sm leading-relaxed text-ink/80">
          <p>{WORKING_COMMITTEE_NOTE}</p>
        </Reveal>
      </section>

      <section className="border-y border-saffron-200 bg-white/60" aria-labelledby="message-heading">
        <div className="container-page section-y">
          <SectionHeading id="message-heading" eyebrow="From the Chairman" title="A special organisation of the community" />
          <Reveal variant="pop" className="card mx-auto mt-10 max-w-3xl border-l-4 border-l-vermilion-500 p-6 sm:p-8">
            <blockquote>
              <p className="devanagari text-lg leading-relaxed text-ink" lang="mr">{CHAIRMAN_MESSAGE.mr}</p>
              <p className="mt-3 text-sm italic leading-relaxed text-ink/75">{CHAIRMAN_MESSAGE.en}</p>
            </blockquote>
            <p className="mt-4 text-sm font-semibold text-vermilion-700">{CHAIRMAN_MESSAGE.signature}</p>
          </Reveal>
        </div>
      </section>

      <section className="container-page section-y" aria-labelledby="reach-heading">
        <SectionHeading id="reach-heading" eyebrow="Get in touch" title="Reach the trust" />
        <Stagger className="mx-auto mt-10 grid max-w-4xl gap-5 sm:grid-cols-3">
          <a href={TRUST.phoneHref} className="card card-hover flex flex-col items-center p-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-vermilion-50 text-vermilion-700"><AreaIcon name="phone" /></span>
            <span className="mt-4 text-xs uppercase tracking-wide text-ink/65">Trust office</span>
            <span className="mt-1 font-semibold text-ink">{TRUST.phoneDisplay}</span>
          </a>
          <a href={TRUST.membershipContact.phoneHref} className="card card-hover flex flex-col items-center p-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-vermilion-50 text-vermilion-700"><AreaIcon name="users" /></span>
            <span className="mt-4 text-xs uppercase tracking-wide text-ink/65">Membership: {TRUST.membershipContact.name}</span>
            <span className="mt-1 font-semibold text-ink">{TRUST.membershipContact.phoneDisplay}</span>
          </a>
          <a href={`mailto:${TRUST.email}`} className="card card-hover flex flex-col items-center p-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-vermilion-50 text-vermilion-700"><AreaIcon name="mail" /></span>
            <span className="mt-4 text-xs uppercase tracking-wide text-ink/65">Email</span>
            <span className="mt-1 break-all font-semibold text-ink">{TRUST.email}</span>
          </a>
        </Stagger>
        <p className="mt-8 text-center"><Link href="/contact" className="link-arrow">Address and bank details <span className="arrow" aria-hidden="true">→</span></Link></p>
      </section>

      <CtaBanner />
    </>
  );
}
