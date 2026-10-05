import Link from 'next/link';
import Hero from '../../components/Hero';
import Marquee from '../../components/Marquee';
import ImpactSection from '../../components/ImpactSection';
import ObjectivesSection from '../../components/ObjectivesSection';
import StatsSection from '../../components/StatsSection';
import GauravTimeline from '../../components/GauravTimeline';
import Testimonials from '../../components/Testimonials';
import CtaBanner from '../../components/CtaBanner';
import SectionHeading from '../../components/SectionHeading';
import Photo from '../../components/Photo';
import Reveal, { Stagger } from '../../components/Reveal';
import { EventCard, ProjectCard } from '../../components/Cards';
import { buildMetadata } from '../../lib/seo';
import { PROJECTS } from '../../lib/projectsData';
import { EVENTS_NEWEST_FIRST } from '../../lib/eventsData';
import { MILESTONE_HIGHLIGHTS, ALL_MILESTONES } from '../../lib/timelineData';
import { GALLERY_ALBUMS, GALLERY_TOTAL_IMAGES, coverOf, findImage, VIDEOS } from '../../lib/galleryData';

// The "Our Impact" totals are read from the database; the page is rebuilt at most once an hour.
export const revalidate = 3600;

const heroPhoto = findImage('ckp-sanmaan-sohala', 'Gaurav-Sohala-26-January-2019');

export const metadata = buildMetadata({
  title: 'Pune CKP Family Public Trust | Education, Health and Welfare in Pune',
  description: 'A registered public trust of the CKP community in Pune: student aid, medical help, flood and pandemic relief, and the annual Gaurav Sohala. Join or donate online.',
  path: '/',
  image: heroPhoto ? heroPhoto.src : undefined,
  imageAlt: heroPhoto ? heroPhoto.alt : undefined,
});

const GALLERY_PICKS = [
  ['teachers-day-2023', 0], ['medical-wari-2023', 0], ['diwali-delight-2022', 0],
  ['independence-day-2022', 0], ['computer-donation', 1], ['swaranche-chandane-2023', 0],
];

export default function HomePage() {
  const featuredProjects = PROJECTS.filter((p) => ['dnyan-kiran', 'project-diya', 'project-udaan'].includes(p.slug));
  const otherProjects = PROJECTS.filter((p) => !featuredProjects.includes(p));
  const recentEvents = EVENTS_NEWEST_FIRST.filter((e) => e.year && coverOf(e)).slice(0, 3);
  const galleryPhotos = GALLERY_PICKS
    .map(([slug, i]) => {
      const album = GALLERY_ALBUMS.find((a) => a.slug === slug);
      return album && album.images[i] ? { ...album.images[i], album } : null;
    })
    .filter(Boolean);
  const journey = MILESTONE_HIGHLIGHTS.filter((m) => ['2016-01-11', '2018-03-18', '2018-05-14', '2020-06', '2021-03-15', '2025-05-17'].includes(m.id));

  return (
    <>
      <Hero />

      <Marquee
        label="What the trust works for"
        className="border-b border-saffron-200 bg-white/70 py-4 font-display text-lg text-vermilion-800 sm:text-xl"
        items={['Education', 'Healthcare', 'Environment', 'Social welfare', 'Sports', 'Literature & art', 'Gaurav Sohala', 'Relief work']}
      />

      {/* About, in the trust's own words */}
      <section className="container-page section-y" aria-labelledby="about-heading">
        <div className="grid items-center gap-10 lg:grid-cols-[0.9fr,1.1fr] lg:gap-16">
          <Reveal variant="left" className="relative order-2 lg:order-1">
            <ol className="relative space-y-5 border-l-2 border-dashed border-saffron-300 pl-6">
              {journey.map((m) => (
                <li key={m.id} className="relative">
                  <span className="absolute -left-[2.05rem] top-1 h-4 w-4 rounded-full border-[3px] border-white bg-vermilion-500 shadow-soft" aria-hidden="true" />
                  <p className="font-mono text-xs font-semibold text-vermilion-700">{m.date}</p>
                  <p className="font-display text-lg leading-snug text-ink">{m.title}</p>
                </li>
              ))}
            </ol>
            <Link href="/milestones" className="link-arrow mt-5">All {ALL_MILESTONES.length} milestones <span className="arrow" aria-hidden="true">→</span></Link>
          </Reveal>

          <div className="order-1 lg:order-2">
            <SectionHeading align="start" id="about-heading" eyebrow="About the Trust" title="“Family”: love, care, togetherness and respect for one and all" />
            <Reveal className="mt-6 space-y-4 text-[0.95rem] leading-relaxed text-ink/80">
              <p>
                Pune is a city synonymous with its rich cultural, historical and educational heritage. Here lives a talented and
                forward-thinking Kayastha community, at the forefront in education, art, literature, music, cuisine, science and
                industry, which has at the same time kept its own traditional identity.
              </p>
              <p>
                With a mission of bringing together the brethren of this &ldquo;proud and fiery&rdquo; community, a few like-minded
                visionaries formed the &ldquo;Pune CKP Family&rdquo;. Monthly meetings, festivals and outings strengthened the bond; the
                family then took up social causes: aid to old-age homes, institutes for children with special needs, economically
                backward students, tribal communities, armed forces family welfare units, and medical aid to the poor and needy.
              </p>
              <p>
                To channel this in a systematic manner, all the necessary documentation was completed and Pune CKP Family Public Trust
                was born on 14 May 2018.
              </p>
            </Reveal>
            <Reveal className="mt-7 flex flex-wrap gap-3">
              <Link href="/about" className="btn btn-primary">Know more about the trust</Link>
              <Link href="/team" className="btn btn-outline">Chairman &amp; team</Link>
            </Reveal>
          </div>
        </div>
      </section>

      <ImpactSection />

      <ObjectivesSection />

      {/* Projects */}
      <section className="container-page section-y" aria-labelledby="projects-heading">
        <SectionHeading
          id="projects-heading"
          eyebrow="Projects"
          title="Named projects, clear purposes"
          intro="Each project of the trust does one thing well: keep a child in school, get a student to class, stand by a family in a medical emergency."
        />
        <Stagger className="mt-12 grid gap-5 md:grid-cols-3">
          {featuredProjects.map((project) => <ProjectCard key={project.slug} project={project} image={coverOf(project)} />)}
        </Stagger>
        <Reveal as="ul" className="mt-6 grid gap-3 sm:grid-cols-3">
          {otherProjects.map((project) => (
            <li key={project.slug}>
              <Link href={`/projects/${project.slug}`} className="card card-hover group flex h-full items-center justify-between gap-3 px-5 py-4">
                <span>
                  <span className="block font-display text-base text-vermilion-700">{project.title}</span>
                  <span className="block text-xs text-ink/70">{project.subtitle}</span>
                </span>
                <span className="link-arrow !min-h-0"><span className="arrow" aria-hidden="true">→</span></span>
              </Link>
            </li>
          ))}
        </Reveal>
      </section>

      <div className="border-y border-saffron-200 bg-white/60">
        <StatsSection />
      </div>

      <GauravTimeline />

      {/* Events */}
      {recentEvents.length > 0 && (
        <section className="container-page section-y" aria-labelledby="events-heading">
          <SectionHeading
            id="events-heading"
            eyebrow="Events & Activities"
            title="Camps, classrooms, music and festivals"
            intro="From medical camps for Warkari pilgrims to literary meets and Diwali evenings at an old-age home."
          />
          <Stagger className="mt-12 grid gap-5 md:grid-cols-3">
            {recentEvents.map((event) => <EventCard key={event.slug} event={event} image={coverOf(event)} />)}
          </Stagger>
          <p className="mt-10 text-center">
            <Link href="/events" className="btn btn-outline">All events and activities</Link>
          </p>
        </section>
      )}

      {/* Gallery teaser */}
      {galleryPhotos.length > 0 && (
        <section className="border-y border-saffron-200 bg-cream-300/50" aria-labelledby="gallery-heading">
          <div className="container-page section-y">
            <SectionHeading
              id="gallery-heading"
              eyebrow="Gallery"
              title="The family in pictures"
              intro={`${GALLERY_TOTAL_IMAGES} photographs in ${GALLERY_ALBUMS.length} albums, and ${VIDEOS.length} videos.`}
            />
            <Stagger as="ul" className="mt-12 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
              {galleryPhotos.map((photo, i) => (
                <li key={photo.src} className={i === 0 ? 'col-span-2 md:col-span-1' : ''}>
                  <Link href={`/gallery/${photo.album.slug}`} className="group relative block overflow-hidden rounded-2xl border border-saffron-200/70 shadow-soft">
                    <Photo
                      src={photo.src}
                      alt={photo.alt}
                      ratio={i === 0 ? 'aspect-[16/10] md:aspect-[4/3]' : 'aspect-[4/3]'}
                      sizes="(max-width: 768px) 50vw, 360px"
                      imgClassName="transition-transform duration-500 motion-safe:group-hover:scale-105"
                    />
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent px-4 pb-3 pt-10 text-sm font-semibold text-white">
                      {photo.album.title}
                    </span>
                  </Link>
                </li>
              ))}
            </Stagger>
            <p className="mt-10 flex flex-wrap justify-center gap-3">
              <Link href="/gallery" className="btn btn-primary">Open the photo gallery</Link>
              <Link href="/gallery/videos" className="btn btn-outline">Watch the videos</Link>
            </p>
          </div>
        </section>
      )}

      <Testimonials />

      <CtaBanner />
    </>
  );
}
