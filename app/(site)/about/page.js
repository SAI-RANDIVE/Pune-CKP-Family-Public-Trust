import Link from 'next/link';
import PageHero from '../../../components/PageHero';
import SectionHeading from '../../../components/SectionHeading';
import Reveal, { Stagger } from '../../../components/Reveal';
import Photo from '../../../components/Photo';
import AreaIcon from '../../../components/AreaIcon';
import CtaBanner from '../../../components/CtaBanner';
import JsonLd from '../../../components/JsonLd';
import { buildMetadata, getSiteUrl } from '../../../lib/seo';
import { AREAS_OF_WORK } from '../../../lib/areasOfWorkData';
import { JOURNEY, MILESTONE_HIGHLIGHTS, ALL_MILESTONES } from '../../../lib/timelineData';
import { UPCOMING_PROJECTS } from '../../../lib/projectsData';
import { CHAIRMAN_MESSAGE, PUBLICATIONS } from '../../../lib/teamData';
import { findImage } from '../../../lib/galleryData';
import { TRUST } from '../../../lib/siteData';

export const metadata = buildMetadata({
  title: 'About the Trust | Pune CKP Family Public Trust',
  description: 'The story of Pune CKP Family Public Trust: from a WhatsApp group started on 11 January 2016 to a registered public trust, its objectives, vision and plans.',
  path: '/about',
});

export default function AboutPage() {
  const sohalaPhoto = findImage('ckp-sanmaan-sohala', 'First-Pune-CKP-Gaurav-Sohala');
  const reliefPhoto = findImage('album-2020', 'Safety-kit-distribution');
  const half = Math.ceil(JOURNEY.length / 2);

  const aboutSchema = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    url: `${getSiteUrl()}/about`,
    name: `About ${TRUST.name}`,
    about: { '@id': `${getSiteUrl()}/#organization` },
  };

  return (
    <>
      <JsonLd data={aboutSchema} />
      <PageHero
        eyebrow="About the Trust"
        title="Pune CKP Family Public Trust: a journey"
        titleMr="पुणे सीकेपी पब्लिक ट्रस्ट – एक वाटचाल"
        intro="A group formed with the idea of giving back to society became a registered public trust. This is its story, in its own words."
        breadcrumbs={[{ label: 'About the Trust' }]}
      >
        <Link href="/milestones" className="btn btn-primary">See the milestones</Link>
        <Link href="/team" className="btn btn-outline">Chairman &amp; team</Link>
      </PageHero>

      {/* The journey */}
      <section className="container-page section-y" aria-labelledby="journey-heading">
        <div className="grid gap-10 lg:grid-cols-[1.15fr,0.85fr] lg:gap-14">
          <div>
            <SectionHeading align="start" id="journey-heading" eyebrow="Our story" title="From a WhatsApp group to a public trust" />
            <div className="mt-6 space-y-4 text-[0.95rem] leading-relaxed text-ink/80">
              {JOURNEY.slice(0, half).map((paragraph, i) => <Reveal as="p" key={i}>{paragraph}</Reveal>)}
            </div>
          </div>
          <Reveal variant="right" className="space-y-5 lg:pt-16">
            {sohalaPhoto && (
              <figure>
                <Photo src={sohalaPhoto.src} alt={sohalaPhoto.alt} ratio="aspect-[4/3]" className="rounded-3xl border-4 border-white shadow-lift" sizes="(max-width: 1024px) 100vw, 440px" />
                <figcaption className="mt-2 text-xs text-ink/65">The first Pune CKP Gaurav Sohala, 18 March 2018.</figcaption>
              </figure>
            )}
            <dl className="card grid grid-cols-2 gap-x-4 gap-y-5 p-6">
              <div><dt className="text-xs uppercase tracking-wide text-ink/65">Group started</dt><dd className="mt-1 font-display text-lg text-vermilion-700">11 January 2016</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-ink/65">Trust formed</dt><dd className="mt-1 font-display text-lg text-vermilion-700">14 May 2018</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-ink/65">Registration</dt><dd className="mt-1 font-mono text-sm font-semibold text-ink">{TRUST.regNo}</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-ink/65">Motto</dt><dd className="devanagari mt-1 text-sm font-semibold text-ink" lang="mr">{TRUST.motto}</dd></div>
            </dl>
          </Reveal>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[0.85fr,1.15fr] lg:gap-14">
          <Reveal variant="left" className="order-2 lg:order-1">
            {reliefPhoto && (
              <figure>
                <Photo src={reliefPhoto.src} alt={reliefPhoto.alt} ratio="aspect-[4/3]" className="rounded-3xl border-4 border-white shadow-lift" sizes="(max-width: 1024px) 100vw, 440px" />
                <figcaption className="mt-2 text-xs text-ink/65">Safety kits for Pune police during the pandemic, 2020.</figcaption>
              </figure>
            )}
          </Reveal>
          <div className="order-1 space-y-4 text-[0.95rem] leading-relaxed text-ink/80 lg:order-2">
            {JOURNEY.slice(half).map((paragraph, i) => <Reveal as="p" key={i}>{paragraph}</Reveal>)}
          </div>
        </div>

        <Reveal variant="pop" className="card mx-auto mt-12 max-w-3xl border-l-4 border-l-vermilion-500 p-6 sm:p-8">
          <blockquote>
            <p className="devanagari text-lg leading-relaxed text-ink" lang="mr">{CHAIRMAN_MESSAGE.mr}</p>
            <p className="mt-3 text-sm italic leading-relaxed text-ink/75">{CHAIRMAN_MESSAGE.en}</p>
          </blockquote>
          <p className="mt-4 text-sm font-semibold text-vermilion-700">{CHAIRMAN_MESSAGE.signature}</p>
          <p className="devanagari text-sm text-ink/65" lang="mr">{CHAIRMAN_MESSAGE.signatureMr}</p>
        </Reveal>
      </section>

      {/* Milestones teaser */}
      <section className="on-dark panel-ink relative overflow-hidden" aria-labelledby="milestones-heading">
        <div className="motif-paithani" aria-hidden="true" />
        <div className="container-page section-y">
          <SectionHeading light id="milestones-heading" eyebrow="Milestones" title="Steps along the way" intro={`A few of the ${ALL_MILESTONES.length} milestones recorded since 2016.`} />
          <Stagger as="ol" className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MILESTONE_HIGHLIGHTS.slice(0, 8).map((m) => (
              <li key={m.id} className="rounded-2xl border border-saffron-400/25 bg-white/[0.06] p-5">
                <p className="font-mono text-xs font-semibold text-saffron-300">{m.date}</p>
                <h3 className="mt-2 font-display text-lg leading-snug text-white">{m.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-cream-200/80">{m.text}</p>
              </li>
            ))}
          </Stagger>
          <p className="mt-10 text-center"><Link href="/milestones" className="btn btn-saffron">The full timeline</Link></p>
        </div>
      </section>

      {/* Objectives */}
      <section className="container-page section-y" aria-labelledby="objectives-heading" id="objectives">
        <SectionHeading
          id="objectives-heading"
          eyebrow="Objectives"
          title="What the trust is for"
          intro="Five objectives are written into the trust deed. Vision 2021 added literature and art as a sixth field of work."
        />
        <Stagger className="mt-12 grid gap-5 md:grid-cols-2">
          {AREAS_OF_WORK.map((area) => (
            <article key={area.slug} className="card flex flex-col p-6 sm:p-7">
              <div className="flex items-center gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-vermilion-50 text-vermilion-700"><AreaIcon name={area.icon} /></span>
                <div>
                  <h3 className="h-card">{area.title}</h3>
                  <p className="devanagari text-sm text-ink/65" lang="mr">{area.titleMr}</p>
                </div>
              </div>
              <ul className="mt-5 flex-1 space-y-2.5">
                {area.points.map((point) => (
                  <li key={point} className="flex gap-2.5 text-sm leading-relaxed text-ink/75">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-saffron-500" aria-hidden="true" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <Link href={`/areas-of-work/${area.slug}`} className="link-arrow mt-3">The work in this field <span className="sr-only">: {area.title}</span><span className="arrow" aria-hidden="true">→</span></Link>
            </article>
          ))}
        </Stagger>
      </section>

      {/* Vision and what comes next */}
      <section className="border-y border-saffron-200 bg-cream-300/50" aria-labelledby="vision-heading">
        <div className="container-page section-y grid gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <SectionHeading align="start" id="vision-heading" eyebrow="Vision" title="New bridges of trust" />
            <Reveal className="mt-6 space-y-4 text-[0.95rem] leading-relaxed text-ink/80">
              <p>
                The trust continued its social work even during the difficult times of 2020. Looking at the work of its first four
                years, new bridges of trust were built within society, and it is this belief that inspires and motivates its work.
                On that basis the trust set out its Vision 2021, with objectives in education, social work, environment, sports,
                medical service, and literature and art.
              </p>
              <p>
                The motto of the trust is &ldquo;{TRUST.mottoRoman}&rdquo;. Accordingly, financial and material assistance is given to
                individuals and to social organisations as the need arises; and whenever there is a natural disaster, the trust will
                be there.
              </p>
            </Reveal>
          </div>
          <div>
            <SectionHeading align="start" as="h2" eyebrow="Looking ahead" title="Upcoming projects" />
            <Reveal as="p" className="mt-6 text-[0.95rem] leading-relaxed text-ink/80">{UPCOMING_PROJECTS.intro}</Reveal>
            <Stagger as="ul" className="mt-5 space-y-3">
              {UPCOMING_PROJECTS.items.map((item) => (
                <li key={item.title} className="card flex gap-4 p-4">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-saffron-100 text-saffron-800"><AreaIcon name="leaf" className="h-5 w-5" /></span>
                  <span>
                    <span className="block text-sm font-semibold text-ink">{item.title}</span>
                    <span className="block text-sm text-ink/75">{item.text}</span>
                  </span>
                </li>
              ))}
            </Stagger>
          </div>
        </div>
      </section>

      {/* Publications */}
      <section className="container-page section-y scroll-mt-24" aria-labelledby="publications-heading" id="publications">
        <SectionHeading id="publications-heading" eyebrow="Publications" title="In print and on screen" />
        <Stagger className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-2">
          {PUBLICATIONS.map((item) => (
            <article key={item.title} className="card p-6 sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-wide text-saffron-800">{item.kind}</p>
              <h3 className="h-card mt-2">{item.title}</h3>
              {item.titleMr && <p className="devanagari mt-1 text-sm text-ink/70" lang="mr">{item.titleMr}</p>}
              <p className="mt-3 text-sm leading-relaxed text-ink/75">{item.text}</p>
            </article>
          ))}
        </Stagger>
      </section>

      <CtaBanner />
    </>
  );
}
