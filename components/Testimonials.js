import Reveal from './Reveal';

// Quoted verbatim from the organisations' own letters, as published on the
// trust’s site. Don’t paraphrase these into reported speech — they are
// attributed quotations.
const TESTIMONIALS = [
  {
    quote: 'We thank you for arranging the financial assistance which will be of a great help to us.',
    org: 'Advitya Kala Sangam Trust, Mumbai',
  },
  {
    quote: 'We thank you for your support and donation towards CKP Gaurav Sohala.',
    org: 'Chandraseniya Kayastha Prabhu Sabha, Dadar, Mumbai',
  },
  {
    quote: 'We have no words to convey our feelings to you for your valuable contribution, but to say: may the blessing of Lord Vithoba be showered on you all.',
    org: 'Sahyadri Manav Seva Manch, Thane',
  },
];

export default function Testimonials() {
  return (
    <section className="container-page py-20">
      <Reveal className="text-center max-w-2xl mx-auto">
        <p className="text-xs font-semibold tracking-[0.25em] uppercase text-vermilion-600">Testimonials</p>
        <h2 className="font-display text-3xl md:text-4xl mt-3 text-ink">From the organisations we&rsquo;ve supported</h2>
      </Reveal>

      <div className="grid md:grid-cols-3 gap-8 mt-14">
        {TESTIMONIALS.map((t, i) => (
          <Reveal key={t.org} delay={i * 90}>
          <blockquote className="soft-card h-full bg-cream-100 border border-saffron-200/70 rounded-2xl p-7 relative">
            <span className="font-display text-5xl text-saffron-300 leading-none">&ldquo;</span>
            <p className="text-sm text-ink/75 leading-relaxed -mt-4">{t.quote}</p>
            <footer className="mt-5 text-xs font-semibold text-vermilion-600 uppercase tracking-wide">{t.org}</footer>
          </blockquote>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
