import Breadcrumbs from './Breadcrumbs';
import { Mandala, Kolam } from './Motifs';

/**
 * Header band of every inner page: breadcrumb trail, eyebrow, the page's one
 * <h1>, an optional Marathi line and intro. Animates in with CSS only, so it
 * is visible immediately and without JavaScript.
 *
 * `breadcrumbs` is [{ label, href }] without "Home" (added here); the last
 * entry is the current page.
 */
export default function PageHero({ eyebrow, title, titleMr, intro, breadcrumbs = [], children, meta }) {
  const trail = [{ label: 'Home', href: '/' }, ...breadcrumbs];

  return (
    <header className="page-hero-wash relative overflow-hidden border-b border-saffron-200/70">
      <Mandala className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 text-saffron-600/25 md:h-[26rem] md:w-[26rem]" />
      <div className="container-page relative pb-12 pt-8 md:pb-16 md:pt-10">
        <Breadcrumbs items={trail} className="mb-6 md:mb-8" />
        <div className="max-w-3xl">
          {eyebrow && <p className="eyebrow hero-rise">{eyebrow}</p>}
          <h1 className="h-page hero-rise mt-3" style={{ '--d': 60 }}>{title}</h1>
          {titleMr && <p className="devanagari hero-rise mt-3 text-lg font-medium text-vermilion-700" style={{ '--d': 110 }} lang="mr">{titleMr}</p>}
          <Kolam align="start" className="hero-rise mt-5" />
          {intro && <p className="lead hero-rise mt-5" style={{ '--d': 160 }}>{intro}</p>}
          {meta && <div className="hero-rise mt-6" style={{ '--d': 210 }}>{meta}</div>}
          {children && <div className="hero-rise mt-7 flex flex-wrap gap-3" style={{ '--d': 240 }}>{children}</div>}
        </div>
      </div>
    </header>
  );
}
