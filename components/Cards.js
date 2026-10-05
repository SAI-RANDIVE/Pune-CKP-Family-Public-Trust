import Link from 'next/link';
import Image from 'next/image';
import Photo from './Photo';
import AreaIcon from './AreaIcon';
import { Mandala } from './Motifs';

/** Shown in place of a photo when an entry has none: a calm motif, never a stock picture. */
export function MotifPanel({ ratio = 'aspect-[4/3]', icon = 'calendar', className = '' }) {
  return (
    <div className={`relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-saffron-100 via-cream-200 to-vermilion-50 ${ratio} ${className}`} aria-hidden="true">
      <Mandala className="absolute h-[140%] w-[140%] text-saffron-600/25" />
      <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/80 text-vermilion-700 shadow-soft">
        <AreaIcon name={icon} className="h-7 w-7" />
      </span>
    </div>
  );
}

const CATEGORY_ICON = {
  'Health camp': 'heart', Relief: 'hands', Education: 'book', Cultural: 'music', Musical: 'music', Literary: 'book', Sports: 'trophy', Community: 'users', Trust: 'medal',
};

/** `image` is { src, alt } or null. */
export function EventCard({ event, image, headingLevel: Heading = 'h3' }) {
  return (
    <Link href={`/events/${event.slug}`} className="card card-hover group flex h-full flex-col overflow-hidden">
      {image ? (
        <Photo src={image.src} alt={image.alt} ratio="aspect-[16/10]" imgClassName="transition-transform duration-500 motion-safe:group-hover:scale-105" />
      ) : (
        <MotifPanel ratio="aspect-[16/10]" icon={CATEGORY_ICON[event.category] || 'calendar'} />
      )}
      <div className="flex flex-1 flex-col p-5">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="rounded-full bg-vermilion-50 px-2.5 py-1 font-semibold uppercase tracking-wide text-vermilion-700">{event.category}</span>
          <span className="font-medium text-ink/70">{event.date}</span>
        </p>
        <Heading className="mt-3 font-display text-lg leading-snug text-ink transition-colors group-hover:text-vermilion-700">{event.title}</Heading>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-ink/75">{event.summary}</p>
        <span className="link-arrow mt-2">Read more <span className="arrow" aria-hidden="true">→</span></span>
      </div>
    </Link>
  );
}

export function AlbumCard({ album, headingLevel: Heading = 'h3', priority = false }) {
  return (
    <Link href={`/gallery/${album.slug}`} className="card card-hover group flex h-full flex-col overflow-hidden">
      <div className="relative">
        <Photo src={album.cover.src} alt={album.cover.alt} ratio="aspect-[4/3]" priority={priority} imgClassName="transition-transform duration-500 motion-safe:group-hover:scale-105" />
        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-ink/80 px-3 py-1 text-xs font-semibold text-white">
          <AreaIcon name="camera" className="h-3.5 w-3.5" />
          {album.count} <span className="sr-only">photos</span>
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-vermilion-700">{album.category} · {album.year}</p>
        <Heading className="mt-2 font-display text-lg leading-snug text-ink transition-colors group-hover:text-vermilion-700">{album.title}</Heading>
        {album.titleMr && <p className="devanagari mt-0.5 text-sm text-ink/65" lang="mr">{album.titleMr}</p>}
      </div>
    </Link>
  );
}

export function ProjectCard({ project, image, headingLevel: Heading = 'h3' }) {
  return (
    <Link href={`/projects/${project.slug}`} className="card card-hover group flex h-full flex-col overflow-hidden">
      {image ? (
        <Photo src={image.src} alt={image.alt} ratio="aspect-[16/10]" imgClassName="transition-transform duration-500 motion-safe:group-hover:scale-105" />
      ) : (
        <MotifPanel ratio="aspect-[16/10]" icon={project.area === 'medical' ? 'heart' : project.area === 'social' ? 'hands' : 'book'} />
      )}
      <div className="flex flex-1 flex-col p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-saffron-800">{project.subtitle}</p>
        <Heading className="h-card mt-1.5">{project.title}</Heading>
        {project.titleMr && project.titleMr.length < 40 && <p className="devanagari text-sm text-ink/65" lang="mr">{project.titleMr}</p>}
        <p className="mt-3 flex-1 text-sm leading-relaxed text-ink/75">{project.summary}</p>
        <span className="link-arrow mt-2">About {project.title} <span className="arrow" aria-hidden="true">→</span></span>
      </div>
    </Link>
  );
}

/** A person on a Gaurav Sohala page. `photo` is a resolved URL or null. */
export function PersonCard({ person, photo, label, headingLevel: Heading = 'h3', large = false }) {
  const size = large ? 'h-28 w-28' : 'h-20 w-20';
  return (
    <article className={`card card-hover flex h-full gap-4 p-5 ${large ? 'flex-col items-center text-center sm:flex-row sm:items-start sm:text-left' : 'items-start'}`}>
      <div className={`relative shrink-0 overflow-hidden rounded-full border-[3px] border-saffron-300 bg-cream-300 shadow-soft ${size}`}>
        {photo ? (
          <Image src={photo} alt={`Portrait of ${person.name}`} fill sizes={large ? '112px' : '80px'} className="object-cover object-top" />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-display text-2xl text-vermilion-700" aria-hidden="true">{person.name.replace(/^(Shri|Smt\.|Sau\.|Dr\.|Shrimati|Adv\.|Chi\.|Padmashri|Padmabhushan|Barrister|Wing Commander|Group Captain|Air Marshal \(Retd\.\))\s+/g, '').charAt(0)}</span>
        )}
      </div>
      <div className="min-w-0">
        {label && <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-saffron-800">{label}</p>}
        <Heading className="mt-0.5 font-display text-lg leading-snug text-vermilion-700">{person.name}</Heading>
        {person.nameMr && <p className="devanagari text-sm text-ink/65" lang="mr">{person.nameMr}</p>}
        {person.award && <p className="mt-2 inline-block rounded-full bg-saffron-100 px-2.5 py-1 text-[11px] font-semibold leading-snug text-saffron-900">{person.award}</p>}
        {person.note && <p className="mt-2 text-sm leading-relaxed text-ink/75">{person.note}</p>}
      </div>
    </article>
  );
}

export function VideoCard({ video, headingLevel: Heading = 'h3' }) {
  return (
    <a href={video.url} target="_blank" rel="noopener noreferrer" className="card card-hover group flex h-full flex-col overflow-hidden">
      <div className="relative">
        <Photo src={video.thumbnail} alt="" ratio="aspect-video" imgClassName="transition-transform duration-500 motion-safe:group-hover:scale-105" />
        <span className="absolute inset-0 flex items-center justify-center bg-ink/15 transition-colors group-hover:bg-ink/30" aria-hidden="true">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-vermilion-500 text-white shadow-glow transition-transform duration-300 motion-safe:group-hover:scale-110">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.500v13l11-6.500z" /></svg>
          </span>
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-vermilion-700">{video.category}</p>
        <Heading className="mt-2 font-display text-base leading-snug text-ink transition-colors group-hover:text-vermilion-700">{video.title}</Heading>
        {video.titleMr && <p className="devanagari mt-1 text-sm text-ink/65" lang="mr">{video.titleMr}</p>}
        <span className="mt-3 text-xs font-medium text-ink/65">Watch on YouTube <span className="sr-only">(opens in a new tab)</span><span aria-hidden="true">↗</span></span>
      </div>
    </a>
  );
}
