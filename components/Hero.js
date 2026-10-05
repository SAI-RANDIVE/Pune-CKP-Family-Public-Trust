import Link from 'next/link';
import Image from 'next/image';
import Typewriter from './Typewriter';
import TypeRotate from './TypeRotate';
import AreaIcon from './AreaIcon';
import { Mandala } from './Motifs';
import { findImage } from '../lib/galleryData';
import { TRUST } from '../lib/siteData';

const HEADLINE = [
  { text: 'A family of the ' },
  { text: 'CKP community', className: 'text-shine' },
  { text: ', built on giving back.' },
];

const CAUSES = ['education', 'healthcare', 'the environment', 'social welfare', 'sport', 'literature and art'];

/**
 * Home page hero. Everything animates with CSS only (so it is on screen at
 * first paint, with or without JavaScript); the headline additionally types
 * itself once when scripts are available and motion is allowed.
 */
export default function Hero() {
  const main = findImage('ckp-sanmaan-sohala', 'Gaurav-Sohala-26-January-2019');
  const second = findImage('album-2020', 'Food-Grains-Donation-at-Nivara');
  const third = findImage('album-2018', 'Medical-Camp-in-schools-Khandala');

  return (
    <section className="hero-wash relative overflow-hidden border-b border-saffron-200">
      <div className="motif-rangoli pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
      <Mandala spin className="pointer-events-none absolute -left-40 -top-40 h-[30rem] w-[30rem] text-saffron-600/20" />

      <div className="container-page relative grid items-center gap-12 py-12 md:py-16 lg:grid-cols-[1.08fr,0.92fr] lg:gap-10 lg:py-24">
        <div>
          <p className="hero-rise inline-flex items-center gap-2 rounded-full border border-vermilion-100 bg-white/80 px-4 py-1.5 shadow-soft">
            <span className="h-2 w-2 rounded-full bg-saffron-500" aria-hidden="true" />
            <span className="devanagari text-sm font-semibold text-vermilion-700" lang="mr">{TRUST.motto}</span>
          </p>

          <h1 className="h-display hero-rise mt-6" style={{ '--d': 80 }}>
            <Typewriter segments={HEADLINE} />
          </h1>

          <p className="hero-rise mt-4 font-display text-xl text-ink/80 sm:text-2xl" style={{ '--d': 120 }}>
            Working for <TypeRotate phrases={CAUSES} className="text-vermilion-700" />
          </p>

          <p className="lead hero-rise mt-5 max-w-xl" style={{ '--d': 160 }}>
            It began as a small WhatsApp group, the &ldquo;Pune CKP Family&rdquo;, on 11 January 2016.
            A registered public trust since 14 May 2018, it has put more than ₹60 lakh to work in
            education, healthcare, social welfare and the environment, for the Chandraseniya
            Kayastha Prabhu community and well beyond it.
          </p>

          <p className="hero-rise mt-4 max-w-xl text-sm leading-relaxed text-ink/70" style={{ '--d': 220 }}>
            <span className="devanagari font-semibold text-vermilion-700" lang="mr">{TRUST.tagline}</span>
            {' '}&mdash; {TRUST.taglineMeaning}. That thought is why the trust exists.
          </p>

          <div className="hero-rise mt-8 flex flex-col gap-3 min-[420px]:flex-row" style={{ '--d': 280 }}>
            <Link href="/donate" className="btn btn-lg btn-primary">
              <AreaIcon name="heart" className="h-5 w-5" />
              Make a donation
            </Link>
            <Link href="/membership" className="btn btn-lg btn-outline">Join as a member</Link>
          </div>

          <ul className="hero-rise mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink/70" style={{ '--d': 340 }}>
            <li className="inline-flex items-center gap-1.5"><AreaIcon name="medal" className="h-4 w-4 text-saffron-700" />Reg. No. {TRUST.regNo}, {TRUST.regDate}</li>
            <li className="inline-flex items-center gap-1.5"><AreaIcon name="bank" className="h-4 w-4 text-saffron-700" />Instant PDF receipt on every payment</li>
          </ul>
        </div>

        {/* Photo collage: real photographs from the trust's albums */}
        {/* Each card is three boxes deep on purpose: the outer one pops in, the
            middle one holds the tilt, the inner one floats. One transform each. */}
        <div className="relative mx-auto mb-10 w-full max-w-md lg:mb-0 lg:max-w-none">
          <div className="hero-pop relative mx-auto aspect-[4/3] w-[86%] lg:w-[88%]" style={{ '--d': 200 }} data-parallax="0.04">
            <div className="h-full w-full -rotate-2">
              <div className="photo-frame h-full w-full rounded-3xl border-4 border-white shadow-lift">
                {main ? (
                  <Image src={main.src} alt={main.alt} fill priority sizes="(max-width: 1024px) 86vw, 520px" className="object-cover" />
                ) : (
                  <Image src="/logo/logo.png" alt={`${TRUST.name} emblem`} fill priority sizes="320px" className="object-contain p-10" />
                )}
              </div>
            </div>
          </div>

          {second && (
            <div className="hero-pop absolute -bottom-6 left-0 w-[42%]" style={{ '--d': 420 }} data-parallax="0.14">
              <div className="rotate-3">
                <div className="float-slow photo-frame aspect-square rounded-2xl border-4 border-white shadow-lift">
                  <Image src={second.src} alt={second.alt} fill sizes="(max-width: 1024px) 38vw, 220px" className="object-cover" />
                </div>
              </div>
            </div>
          )}

          {third && (
            <div className="hero-pop absolute -top-5 right-0 w-[34%]" style={{ '--d': 560 }} data-parallax="0.22">
              <div className="rotate-6">
                <div className="float-slower photo-frame aspect-square rounded-2xl border-4 border-white shadow-lift">
                  <Image src={third.src} alt={third.alt} fill sizes="(max-width: 1024px) 30vw, 180px" className="object-cover" />
                </div>
              </div>
            </div>
          )}

          <div className="hero-pop absolute -bottom-8 right-2 sm:right-6" style={{ '--d': 700 }}>
            <div className="medallion medallion--gold medallion-hover" style={{ width: '6.5rem', height: '6.5rem' }}>
              <div className="medallion-ribbon" />
              <p className="text-center font-display leading-tight text-vermilion-800">
                <span className="block text-[10px] uppercase tracking-widest text-ink/75">Since</span>
                <span className="block text-2xl">2016</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
