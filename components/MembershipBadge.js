const TIERS = {
  silver: {
    label: 'Silver',
    medallion: 'medallion--silver',
    ring: 'ring-slate-300',
    chip: 'bg-slate-100 text-slate-700 border-slate-300',
    blurb: 'Annual member',
  },
  gold: {
    label: 'Gold',
    medallion: 'medallion--gold',
    ring: 'ring-saffron-400',
    chip: 'bg-saffron-100 text-saffron-800 border-saffron-300',
    blurb: 'Five-year member',
  },
  platinum: {
    label: 'Platinum',
    medallion: 'medallion--platinum',
    ring: 'ring-vermilion-400',
    chip: 'bg-vermilion-50 text-vermilion-700 border-vermilion-300',
    blurb: 'Lifetime member',
  },
};

export function tierOf(type) {
  return TIERS[type] || TIERS.silver;
}

/** Small inline chip — used in tables and lists. */
export function BadgeChip({ type, className = '' }) {
  const tier = tierOf(type);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${tier.chip} ${className}`}>
      <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${type === 'platinum' ? 'bg-vermilion-500' : type === 'gold' ? 'bg-saffron-500' : 'bg-slate-400'}`} />
      {tier.label}
    </span>
  );
}

/** Full medallion badge — the profile hero. */
export default function MembershipBadge({ type, membershipNo, size = '7rem', animated = true }) {
  const tier = tierOf(type);
  return (
    <div className="flex flex-col items-center text-center">
      <div
        className={`medallion ${tier.medallion} ${animated ? 'medallion-hover badge-shine' : ''}`}
        style={{ width: size, height: size }}
      >
        <div className="medallion-ribbon" />
        <div className="px-2">
          <p className={`font-display leading-none ${type === 'platinum' ? 'text-cream-200' : 'text-ink/85'}`} style={{ fontSize: '0.95rem' }}>
            {tier.label}
          </p>
        </div>
      </div>
      {membershipNo && (
        <p className="font-mono text-xs font-semibold text-vermilion-700 mt-5">{membershipNo}</p>
      )}
      <p className="text-[11px] uppercase tracking-[0.18em] text-ink/50 mt-1">{tier.blurb}</p>
    </div>
  );
}
