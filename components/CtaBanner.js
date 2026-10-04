import Link from 'next/link';
import Reveal from './Reveal';

export default function CtaBanner() {
  return (
    <Reveal as="section" className="container-page pb-24">
      <div className="rounded-3xl bg-gradient-to-br from-vermilion-600 to-vermilion-800 px-8 py-14 md:px-16 text-center relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-saffron-400/20" />
        <div className="absolute -left-8 -bottom-8 w-32 h-32 rounded-full bg-saffron-400/10" />
        <h2 className="font-display text-3xl md:text-4xl text-cream-100 relative">
          <span className="devanagari text-3xl md:text-4xl">समाजाचे देणं समाजालाच द्यावं</span>
        </h2>
        <p className="text-cream-100/85 mt-4 max-w-xl mx-auto relative">
          Become a member for as little as ₹1,000 a year, or make a one-time donation —
          every contribution is receipted instantly.
        </p>
        <div className="mt-8 flex flex-wrap gap-4 justify-center relative">
          <Link href="/membership" className="btn-press rounded-full bg-saffron-400 text-ink px-7 py-3.5 font-semibold hover:bg-saffron-300">
            View Membership Plans
          </Link>
          <Link href="/donate" className="btn-press rounded-full border-2 border-cream-100 text-cream-100 px-7 py-3.5 font-semibold hover:bg-cream-100 hover:text-vermilion-700">
            Donate Now
          </Link>
        </div>
      </div>
    </Reveal>
  );
}
