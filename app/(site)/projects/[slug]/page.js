import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageHero from '../../../../components/PageHero';
import SectionHeading from '../../../../components/SectionHeading';
import Reveal, { Stagger } from '../../../../components/Reveal';
import Photo from '../../../../components/Photo';
import GalleryGrid from '../../../../components/GalleryGrid';
import CtaBanner from '../../../../components/CtaBanner';
import JsonLd from '../../../../components/JsonLd';
import { buildMetadata, getSiteUrl, organizationRef, pageTitle } from '../../../../lib/seo';
import { PROJECTS, getProject } from '../../../../lib/projectsData';
import { getAreaBySlug } from '../../../../lib/areasOfWorkData';
import { coverOf, getAlbum, storyImage } from '../../../../lib/galleryData';
import { TRUST } from '../../../../lib/siteData';

export function generateStaticParams() {
  return PROJECTS.map((project) => ({ slug: project.slug }));
}

export const dynamicParams = false;

export function generateMetadata({ params }) {
  const project = getProject(params.slug);
  if (!project) return {};
  const cover = coverOf(project);
  return buildMetadata({
    title: pageTitle(`${project.title}: ${project.subtitle}`),
    description: project.metaDescription,
    path: `/projects/${project.slug}`,
    type: 'article',
    image: cover ? cover.src : undefined,
    imageAlt: cover ? cover.alt : undefined,
  });
}

export default function ProjectPage({ params }) {
  const project = getProject(params.slug);
  if (!project) notFound();

  const cover = coverOf(project);
  const area = getAreaBySlug(project.area);
  const albums = (project.albums || []).map(getAlbum).filter(Boolean);
  const photos = albums.flatMap((album) => album.images).slice(0, 12);
  const others = PROJECTS.filter((p) => p.slug !== project.slug);
  const isStory = Boolean(project.story);
  const secondPhoto = isStory ? storyImage('mahad-visit') : null;

  const schema = {
    '@context': 'https://schema.org',
    '@type': isStory ? 'Article' : 'Project',
    name: `${project.title}: ${project.subtitle}`,
    ...(isStory ? { headline: `${project.title}: ${project.subtitle}`, author: organizationRef(), publisher: organizationRef() } : { parentOrganization: organizationRef() }),
    description: project.metaDescription,
    url: `${getSiteUrl()}/projects/${project.slug}`,
    ...(cover ? { image: cover.src.startsWith('http') ? cover.src : `${getSiteUrl()}${cover.src}` } : {}),
  };

  return (
    <>
      <JsonLd data={schema} />
      <PageHero
        eyebrow={project.since ? `Project · ${project.since}` : 'Project'}
        title={`${project.title}: ${project.subtitle}`}
        titleMr={project.titleMr}
        intro={project.summary}
        breadcrumbs={[{ label: 'Projects', href: '/projects' }, { label: project.title }]}
      >
        <Link href="/donate" className="btn btn-primary">Support {project.title}</Link>
        {area && <Link href={`/areas-of-work/${area.slug}`} className="btn btn-outline">{area.title} work</Link>}
      </PageHero>

      <section className="container-page section-y">
        <div className="grid gap-10 lg:grid-cols-[1.1fr,0.9fr] lg:gap-14">
          <div>
            <p className="font-display text-2xl leading-snug text-vermilion-700">{project.tagline}</p>

            {project.body && (
              <div className="mt-6 space-y-4 text-[0.95rem] leading-relaxed text-ink/80">
                {project.body.map((paragraph, i) => <Reveal as="p" key={i}>{paragraph}</Reveal>)}
              </div>
            )}

            {project.story && project.story.map((part) => (
              <Reveal as="section" key={part.heading} className="mt-9 first:mt-6">
                <h2 className="h-section !text-2xl">{part.heading}</h2>
                <div className="mt-4 space-y-4 text-[0.95rem] leading-relaxed text-ink/80">
                  {part.paragraphs.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
                </div>
                {part.attribution && <p className="mt-3 text-sm italic text-ink/65">{part.attribution}</p>}
              </Reveal>
            ))}

            {project.lists && project.lists.map((list) => (
              <Reveal as="section" key={list.heading} className="mt-9">
                <h2 className="h-section !text-2xl">{list.heading}</h2>
                <ul className="mt-4 space-y-3">
                  {list.items.map((item) => (
                    <li key={item} className="flex gap-3 text-[0.95rem] leading-relaxed text-ink/80">
                      <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-saffron-500" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>

          <aside className="space-y-6">
            {cover && (
              <Reveal variant="right">
                <Photo src={cover.src} alt={cover.alt} ratio="aspect-[4/3]" className="rounded-3xl border-4 border-white shadow-lift" sizes="(max-width: 1024px) 100vw, 480px" priority />
              </Reveal>
            )}
            {secondPhoto && (
              <Reveal variant="right">
                <Photo src={secondPhoto.src} alt={secondPhoto.alt} ratio="aspect-[4/3]" className="rounded-3xl border-4 border-white shadow-lift" sizes="(max-width: 1024px) 100vw, 480px" />
              </Reveal>
            )}

            {project.extra && project.extra.map((item) => (
              <Reveal key={item.heading} className="card p-6">
                <h2 className="h-card">{item.heading}</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink/75">{item.text}</p>
                {item.href && <Link href={item.href} className="link-arrow mt-1">Read more <span className="sr-only">: {item.heading}</span><span className="arrow" aria-hidden="true">→</span></Link>}
              </Reveal>
            ))}

            <Reveal className="on-dark panel-vermilion rounded-3xl p-6 text-white">
              <h2 className="font-display text-xl text-saffron-300">Help this project</h2>
              <p className="mt-2 text-sm leading-relaxed text-cream-200/90">
                Donate online, or speak to the trust on <a href={TRUST.phoneHref} className="font-semibold underline underline-offset-4">{TRUST.phoneDisplay}</a>.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/donate" className="btn btn-sm btn-saffron">Donate</Link>
                <Link href="/contact" className="btn btn-sm btn-light">Contact</Link>
              </div>
            </Reveal>
          </aside>
        </div>
      </section>

      {project.plans && (
        <section className="border-y border-saffron-200 bg-cream-300/50" aria-labelledby="plans-heading">
          <div className="container-page section-y">
            <SectionHeading id="plans-heading" eyebrow="How to give" title={project.plans.heading} intro={project.plans.note} />
            <Stagger as="ul" className="mx-auto mt-12 grid max-w-4xl gap-5 sm:grid-cols-3">
              {project.plans.options.map((option) => (
                <li key={option.name} className="card card-hover flex flex-col items-center p-6 text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-saffron-800">{option.name}</p>
                  <p className="mt-3 font-display text-3xl text-vermilion-700">{option.amount}</p>
                  {project.plans.includes && (
                    <ul className="mt-4 space-y-1.5 text-sm text-ink/75">
                      {project.plans.includes.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  )}
                </li>
              ))}
            </Stagger>
            <Reveal className="mt-10 flex flex-wrap justify-center gap-3">
              <Link href="/donate" className="btn btn-primary">Donate online</Link>
              <Link href="/contact" className="btn btn-outline">Contact the trust</Link>
            </Reveal>
          </div>
        </section>
      )}

      {photos.length > 0 && (
        <section className="container-page section-y" aria-labelledby="project-photos-heading">
          <SectionHeading id="project-photos-heading" eyebrow="Photographs" title="From the albums" />
          <div className="mt-10">
            <GalleryGrid images={photos} label={`${project.title} photographs`} />
          </div>
          <ul className="mt-6 flex flex-wrap justify-center gap-x-6">
            {albums.map((album) => (
              <li key={album.slug}><Link href={`/gallery/${album.slug}`} className="link-arrow">{album.title} ({album.count}) <span className="arrow" aria-hidden="true">→</span></Link></li>
            ))}
          </ul>
        </section>
      )}

      <nav aria-labelledby="other-projects-heading" className="container-page section-y !pb-0 !pt-4">
        <h2 id="other-projects-heading" className="h-card text-center">Other projects</h2>
        <ul className="mt-6 flex flex-wrap justify-center gap-3">
          {others.map((item) => (
            <li key={item.slug}>
              <Link href={`/projects/${item.slug}`} className="inline-flex min-h-[2.75rem] items-center rounded-full border border-saffron-300 bg-white px-4 text-sm font-semibold text-ink transition-colors hover:border-vermilion-400 hover:text-vermilion-700">{item.title}</Link>
            </li>
          ))}
        </ul>
      </nav>

      <CtaBanner />
    </>
  );
}
