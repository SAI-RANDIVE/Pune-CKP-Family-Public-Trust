import CountUp from './CountUp';
import Reveal from './Reveal';

// Figures as published in the trust's own donations-and-contributions ledger.
const STATS = [
  { label: 'Educational Support', amount: 1872250, note: 'Scholarships, notebooks, uniforms and computers for schools' },
  { label: 'Healthcare Initiatives', amount: 2152310, note: 'Medical loans, camps and support for Warkari pilgrims' },
  { label: 'Social Welfare & Community Development', amount: 1917977, note: 'Flood relief, old-age homes and pandemic aid' },
  { label: 'Environmental Programs', amount: 71000, note: 'Water conservation and tree-plantation drives' },
];

const TOTAL = STATS.reduce((sum, s) => sum + s.amount, 0);

export default function StatsSection() {
  return (
    <section className="container-page py-20">
      <Reveal className="text-center max-w-2xl mx-auto">
        <p className="text-xs font-semibold tracking-[0.25em] uppercase text-vermilion-600">Donations &amp; Contributions</p>
        <h2 className="font-display text-3xl md:text-4xl mt-3 text-ink">Where the trust&rsquo;s support has gone</h2>
        <p className="text-sm text-ink/70 mt-4 leading-relaxed">
          Every rupee below has already been spent — on a student&rsquo;s fees, a family&rsquo;s
          hospital bill, a village&rsquo;s water supply. These are disbursements, not pledges.
        </p>
      </Reveal>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mt-14">
        {STATS.map((s, i) => (
          <Reveal key={s.label} delay={i * 90} className="flex flex-col items-center text-center">
            <div className="medallion medallion-stat medallion--gold medallion-hover">
              <p className="font-mono text-[10px] font-semibold text-vermilion-800 px-2">
                <CountUp value={s.amount} prefix="₹" />
              </p>
            </div>
            <p className="mt-4 text-sm font-medium text-ink/75 max-w-[10rem]">{s.label}</p>
            <p className="mt-2 text-xs text-ink/55 max-w-[11rem] leading-relaxed">{s.note}</p>
          </Reveal>
        ))}
      </div>

      <Reveal delay={200} className="mt-14 text-center">
        <p className="text-sm text-ink/70">
          Total disbursed since 2016:{' '}
          <span className="font-mono font-semibold text-vermilion-700">
            <CountUp value={TOTAL} prefix="₹" />
          </span>
          {' '}— with a further ₹40 lakh committed to projects now under way, and a
          stated goal of reaching ₹1 crore in total social contribution.
        </p>
      </Reveal>
    </section>
  );
}
