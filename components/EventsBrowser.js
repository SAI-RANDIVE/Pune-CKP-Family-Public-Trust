'use client';

import { useState } from 'react';
import { EventCard } from './Cards';

/**
 * The events list with a category filter. Everything is rendered on the
 * server first (all events, grouped by year), so the full list is in the HTML
 * and works without JavaScript; the filter buttons only narrow it down.
 *
 * `groups` is [{ label, id, items: [{ event, image }] }], plain data.
 */
export default function EventsBrowser({ groups, categories }) {
  const [category, setCategory] = useState('All');
  const visible = groups
    .map((group) => ({ ...group, items: category === 'All' ? group.items : group.items.filter((item) => item.event.category === category) }))
    .filter((group) => group.items.length > 0);
  const count = visible.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <div>
      <div role="group" aria-label="Filter events by type" className="flex flex-wrap justify-center gap-2">
        {['All', ...categories].map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={category === name}
            onClick={() => setCategory(name)}
            className="inline-flex min-h-[2.75rem] items-center rounded-full border border-saffron-300 bg-white px-4 text-sm font-semibold text-ink transition-colors hover:border-vermilion-400 aria-pressed:border-vermilion-600 aria-pressed:bg-vermilion-600 aria-pressed:text-white"
          >
            {name}
          </button>
        ))}
      </div>
      <p className="mt-4 text-center text-sm text-ink/70" aria-live="polite">
        Showing {count} {count === 1 ? 'entry' : 'entries'}{category === 'All' ? '' : ` in ${category}`}.
      </p>

      {visible.map((group) => (
        <section key={group.id} id={group.id} aria-labelledby={`${group.id}-heading`} className="mt-12 scroll-mt-28">
          <h2 id={`${group.id}-heading`} className="flex items-center gap-4 font-display text-3xl text-vermilion-700">
            {group.label}
            <span className="h-px flex-1 bg-gradient-to-r from-saffron-400 to-transparent" aria-hidden="true" />
          </h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map(({ event, image }) => <EventCard key={event.slug} event={event} image={image} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
