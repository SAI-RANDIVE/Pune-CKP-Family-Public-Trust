const TIER_STYLES = {
  silver: { medallion: 'medallion--silver', accent: 'text-ink/70' },
  gold: { medallion: 'medallion--gold', accent: 'text-saffron-700' },
  platinum: { medallion: 'medallion--platinum', accent: 'text-vermilion-700' },
};

export default function MembershipCard({ type, title, price, period, features, selected, onSelect }) {
  const style = TIER_STYLES[type];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left rounded-3xl p-7 border-2 transition-all w-full ${
        selected ? 'border-vermilion-500 bg-cream-100 shadow-lg scale-[1.02]' : 'border-saffron-200 bg-cream-100/70 hover:border-saffron-400'
      }`}
    >
      <div className={`medallion ${style.medallion}`} style={{ width: '4.5rem', height: '4.5rem' }}>
        <div className="medallion-ribbon" />
      </div>
      <h3 className={`font-display text-2xl mt-5 ${style.accent}`}>{title}</h3>
      <p className="text-3xl font-bold mt-2 text-ink">
        ₹{price}
        <span className="text-sm font-normal text-ink/50"> {period}</span>
      </p>
      <ul className="mt-5 space-y-2">
        {features.map((f) => (
          <li key={f} className="text-sm text-ink/70 flex gap-2">
            <span className="text-vermilion-500">✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </button>
  );
}
