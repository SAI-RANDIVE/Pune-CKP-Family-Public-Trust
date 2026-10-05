/**
 * Decorative motifs, pure SVG. All are aria-hidden: they carry no meaning.
 *
 *  - Mandala: a rangoli-style rosette (petals on a dotted ring), used large
 *    and faint behind the hero and section headers.
 *  - Kolam: a small diamond flanked by fine lines, used as a section divider.
 *  - Toran: the mango-leaf festoon, a strip across the top of a block.
 */
const PETALS = Array.from({ length: 16 }, (_, i) => i * 22.5);
const DOTS = Array.from({ length: 32 }, (_, i) => i * 11.25);

export function Mandala({ className = '', spin = false }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 200 200" className={`${className} ${spin ? 'mandala-spin' : ''}`} fill="none">
      <circle cx="100" cy="100" r="96" stroke="currentColor" strokeWidth="0.6" opacity="0.5" />
      <circle cx="100" cy="100" r="58" stroke="currentColor" strokeWidth="0.6" opacity="0.6" />
      <circle cx="100" cy="100" r="20" stroke="currentColor" strokeWidth="0.8" />
      {PETALS.map((angle) => (
        <g key={angle} transform={`rotate(${angle} 100 100)`}>
          <path d="M100 42 C108 58 108 70 100 80 C92 70 92 58 100 42 Z" stroke="currentColor" strokeWidth="0.8" />
          <path d="M100 8 C112 24 112 34 100 42 C88 34 88 24 100 8 Z" stroke="currentColor" strokeWidth="0.6" opacity="0.7" />
        </g>
      ))}
      {DOTS.map((angle) => (
        <circle key={angle} cx="100" cy="14" r="1.1" fill="currentColor" transform={`rotate(${angle} 100 100)`} opacity="0.6" />
      ))}
      {PETALS.filter((_, i) => i % 2 === 0).map((angle) => (
        <circle key={`c${angle}`} cx="100" cy="72" r="1.6" fill="currentColor" transform={`rotate(${angle + 11.25} 100 100)`} />
      ))}
    </svg>
  );
}

export function Kolam({ className = '', align = 'center' }) {
  return (
    <div aria-hidden="true" className={`kolam ${align === 'start' ? 'kolam-start' : ''} ${className}`}>
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" focusable="false">
        <path d="M11 1 21 11 11 21 1 11Z" stroke="currentColor" strokeWidth="1.2" />
        <path d="M11 6 16 11 11 16 6 11Z" fill="#D30000" />
      </svg>
    </div>
  );
}

export function Toran({ className = '' }) {
  return <div aria-hidden="true" className={`motif-toran ${className}`} />;
}
