import Image from 'next/image';
import SectionHeading from './SectionHeading';
import Reveal, { Stagger } from './Reveal';
import { TESTIMONIALS, SUPPORTERS } from '../lib/impactData';
import { siteImage } from '../lib/galleryData';

/**
 * Testimonials (verbatim, attributed quotations from organisations the trust
 * has supported) and the "Special Thanks" supporter logos.
 */
export default function Testimonials({ showSupporters = true }) {
  const supporters = SUPPORTERS.map((s) => ({ ...s, src: siteImage('supporters', s.logo) }));

  return (
    <section className="container-page section-y" aria-labelledby="testimonials-heading">
      <SectionHeading
        id="testimonials-heading"
        eyebrow="Testimonials"
        title="In the words of those we have supported"
      />

      <Stagger className="mt-12 grid gap-5 md:grid-cols-3">
        {TESTIMONIALS.map((item) => (
          <figure key={item.org} className="card card-hover relative flex h-full flex-col p-7">
            <svg aria-hidden="true" viewBox="0 0 48 36" className="h-8 w-10 text-saffron-300" fill="currentColor"><path d="M0 36V21.600C0 9.200 6.800 1.900 18 0l2 4.800C13.900 6.400 10.800 10 10.400 15H20v21zm28 0V21.600C28 9.200 34.800 1.900 46 0l2 4.800C41.900 6.400 38.800 10 38.400 15H48v21z" /></svg>
            <blockquote className="mt-4 flex-1 text-[0.95rem] leading-relaxed text-ink/80">
              <p>{item.quote}</p>
            </blockquote>
            <figcaption className="mt-6 border-t border-saffron-200 pt-4">
              <span className="block text-sm font-semibold text-vermilion-700">{item.org}</span>
              <span className="block text-xs text-ink/65">{item.place}</span>
            </figcaption>
          </figure>
        ))}
      </Stagger>

      {showSupporters && (
        <Reveal className="mt-14 rounded-3xl border border-saffron-200 bg-white/70 px-6 py-8 text-center">
          <h3 className="eyebrow">Special thanks</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm text-ink/75">
            We sincerely thank all our members and supporters for their constant support.
          </p>
          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-5">
            {supporters.map((s) => (
              <li key={s.name} className="flex flex-col items-center gap-2">
                {s.src && (
                  <span className="relative block h-16 w-32 overflow-hidden rounded-xl bg-white">
                    <Image src={s.src} alt={`${s.name} logo`} fill sizes="128px" className="object-contain p-1" />
                  </span>
                )}
                <span className="text-xs font-medium text-ink/75">{s.name}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      )}
    </section>
  );
}
