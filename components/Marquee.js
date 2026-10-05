/**
 * An endless, slowly moving band of words. Pure CSS: the list is rendered
 * twice and slid by half its width, so the loop has no seam. The second copy
 * is aria-hidden. It pauses under the pointer and keyboard focus, and under
 * prefers-reduced-motion it is a plain, centred, wrapping list.
 */
export default function Marquee({ items, label, className = '' }) {
  const row = (hidden) => (
    <ul className="marquee-row" aria-hidden={hidden ? 'true' : undefined}>
      {items.map((item) => (
        <li key={item}>
          <span>{item}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" /></svg>
        </li>
      ))}
    </ul>
  );

  return (
    <div className={`marquee ${className}`} role="group" aria-label={label}>
      <div className="marquee-track">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
