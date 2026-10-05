import Link from 'next/link';
import Reveal from './Reveal';
import { CATEGORY_LABELS } from '../lib/timelineData';

const DOT = {
  community: 'bg-saffron-500',
  trust: 'bg-vermilion-600',
  education: 'bg-saffron-700',
  health: 'bg-vermilion-500',
  relief: 'bg-vermilion-700',
  culture: 'bg-saffron-600',
  sports: 'bg-saffron-800',
  honour: 'bg-vermilion-600',
};

/**
 * Vertical milestones timeline, grouped by year. `items` are entries from
 * lib/timelineData.js in chronological order. Rendered as an ordered list per
 * year so the sequence is meaningful to screen readers too.
 */
export default function MilestoneTimeline({ items, headingLevel: Heading = 'h2', newestFirst = false }) {
  const years = [...new Set(items.map((m) => m.year))];
  if (newestFirst) years.reverse();

  return (
    <div className="relative mx-auto max-w-3xl">
      {years.map((year) => {
        const entries = items.filter((m) => m.year === year);
        if (newestFirst) entries.reverse();
        return (
          <section key={year} id={`year-${year}`} aria-labelledby={`year-${year}-heading`} className="relative scroll-mt-28 pb-4">
            <Reveal variant="pop" className="mb-4 flex justify-start">
              <Heading id={`year-${year}-heading`} className="inline-flex items-center gap-2 rounded-full bg-vermilion-600 px-5 py-1.5 font-display text-xl text-white shadow-glow">
                {year}
              </Heading>
            </Reveal>

            <ol className="relative ml-4 border-l-2 border-dashed border-saffron-300 pl-6 sm:ml-6 sm:pl-8">
              {entries.map((m, i) => (
                <Reveal as="li" key={m.id} variant="left" delay={Math.min(i, 4) * 60} className="relative pb-7 last:pb-3">
                  <span aria-hidden="true" className={`absolute -left-[2.05rem] top-1.5 h-4 w-4 rounded-full border-[3px] border-white shadow-soft sm:-left-[2.55rem] ${DOT[m.category] || 'bg-saffron-500'}`} />
                  <article className={`card p-5 ${m.highlight ? 'border-l-4 border-l-vermilion-500' : ''}`}>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-xs font-semibold text-vermilion-700">{m.date}</span>
                      <span className="rounded-full bg-saffron-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-saffron-900">{CATEGORY_LABELS[m.category] || m.category}</span>
                    </p>
                    <h3 className="mt-2 font-display text-lg leading-snug text-ink">{m.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink/75">{m.text}</p>
                    {m.href && <Link href={m.href} className="link-arrow mt-1">Read more <span className="sr-only">about {m.title}</span><span className="arrow" aria-hidden="true">→</span></Link>}
                  </article>
                </Reveal>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
