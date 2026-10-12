/**
 * One event published by the trustees from the management system: banner,
 * date, place, description and its photographs. `children` is where the
 * caller puts the action (a "sign in to register" link on the public page, the
 * registration form in the members' corner).
 *
 * Banners and photographs are served by /api/media, straight from the
 * database, so a plain <img> is used (the image optimiser is reserved for the
 * site's own static pictures).
 */
const niceDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export default function LiveEventCard({ event, children, headingLevel = 3 }) {
  const Heading = `h${headingLevel}`;
  const upcoming = !event.date || event.date >= new Date().toISOString().slice(0, 10);
  return (
    <article id={`event-${event.id}`} className="card scroll-mt-28 overflow-hidden">
      {event.banner && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.banner} alt={`Banner of ${event.name}`} className="aspect-[16/7] w-full object-cover" loading="lazy" decoding="async" />
      )}
      <div className="p-6 sm:p-8">
        <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide">
          <span className={`rounded-full px-3 py-1 ${upcoming ? 'bg-vermilion-600 text-white' : 'bg-cream-300 text-ink/75'}`}>{upcoming ? 'Coming up' : 'Held'}</span>
          {event.registrationOpen && <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-900">Registration open</span>}
          {event.registrationNote === 'full' && <span className="rounded-full bg-saffron-100 px-3 py-1 text-ink">All places taken</span>}
          {event.registrationNote === 'closed' && <span className="rounded-full bg-cream-300 px-3 py-1 text-ink/75">Registration closed</span>}
          {event.membersOnly && <span className="rounded-full border border-saffron-300 px-3 py-1 text-ink/75">Members only</span>}
        </p>
        <Heading className="h-card mt-4 !text-2xl">{event.name}</Heading>
        {event.nameMr && <p className="devanagari mt-1 text-base font-medium text-vermilion-700" lang="mr">{event.nameMr}</p>}

        <dl className="mt-5 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          {event.date && <div><dt className="text-xs font-semibold uppercase tracking-wide text-ink/60">When</dt><dd className="mt-0.5 font-medium text-ink">{niceDate(event.date)}{event.time ? `, ${event.time}` : ''}</dd></div>}
          {event.venue && <div><dt className="text-xs font-semibold uppercase tracking-wide text-ink/60">Where</dt><dd className="mt-0.5 font-medium text-ink">{event.venue}{event.mapUrl && <> · <a href={event.mapUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-vermilion-700 underline underline-offset-4">Open in Google Maps</a></>}</dd></div>}
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-ink/60">Fee</dt><dd className="mt-0.5 font-medium text-ink">{event.fee > 0 ? `₹${event.fee.toLocaleString('en-IN')} per person` : 'Free'}</dd></div>
          {event.placesLeft !== null && upcoming && <div><dt className="text-xs font-semibold uppercase tracking-wide text-ink/60">Places left</dt><dd className="mt-0.5 font-medium text-ink">{event.placesLeft}</dd></div>}
          {event.closesOn && event.registrationOpen && <div><dt className="text-xs font-semibold uppercase tracking-wide text-ink/60">Register by</dt><dd className="mt-0.5 font-medium text-ink">{niceDate(event.closesOn)}</dd></div>}
        </dl>

        {event.description && <p className="mt-5 whitespace-pre-line text-[0.95rem] leading-relaxed text-ink/80">{event.description}</p>}
        {event.descriptionMr && <p className="devanagari mt-3 whitespace-pre-line text-[0.95rem] leading-relaxed text-ink/80" lang="mr">{event.descriptionMr}</p>}

        {children && <div className="mt-6">{children}</div>}

        {event.photos.length > 0 && (
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {event.photos.map((photo) => (
              <li key={photo.src}>
                <a href={photo.src} target="_blank" rel="noopener" className="group block overflow-hidden rounded-xl border border-saffron-200/70">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.src} alt={photo.caption || `Photograph from ${event.name}`} loading="lazy" decoding="async" className="aspect-[4/3] w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-105" />
                </a>
                {photo.caption && <p className="mt-1.5 text-xs text-ink/65">{photo.caption}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
