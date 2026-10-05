import Image from 'next/image';

/**
 * A photo in a fixed-ratio frame. The frame reserves the space before the
 * image arrives (no layout shift) and shows a warm dotted tone meanwhile.
 * Works for local files under /public and for the old-site URLs allowed in
 * next.config.js. Lazy by default; pass `priority` only for the one image
 * that is above the fold.
 *
 * `ratio` is any Tailwind aspect class, e.g. "aspect-[4/3]" or "aspect-square".
 * `position` is an object-position class, e.g. "object-top" for portraits.
 */
export default function Photo({
  src,
  alt,
  sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
  ratio = 'aspect-[4/3]',
  className = '',
  imgClassName = '',
  position = 'object-center',
  priority = false,
  contain = false,
}) {
  if (!src) return null;
  return (
    <div className={`photo-frame ${ratio} ${className}`}>
      <Image
        src={src}
        alt={alt || ''}
        fill
        sizes={sizes}
        priority={priority}
        className={`${contain ? 'object-contain' : 'object-cover'} ${position} ${imgClassName}`}
      />
    </div>
  );
}
