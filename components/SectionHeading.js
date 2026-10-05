import Reveal from './Reveal';
import { Kolam } from './Motifs';

/** Eyebrow + heading + optional intro for a page section. Defaults to a centred <h2>. */
export default function SectionHeading({ eyebrow, title, intro, align = 'center', as: Tag = 'h2', id, light = false, className = '' }) {
  const centred = align === 'center';
  return (
    <Reveal className={`${centred ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'} ${className}`}>
      {eyebrow && <p className={`eyebrow ${light ? '!text-saffron-300' : ''}`}>{eyebrow}</p>}
      <Tag id={id} className={`h-section mt-3 ${light ? '!text-white' : ''}`}>{title}</Tag>
      <Kolam align={centred ? 'center' : 'start'} className={`mt-4 ${light ? '!text-saffron-300' : ''}`} />
      {intro && <p className={`mt-4 text-[0.95rem] leading-relaxed ${light ? 'text-cream-200/85' : 'text-ink/75'}`}>{intro}</p>}
    </Reveal>
  );
}
