const SITE_NAME = 'Pune CKP Family Public Trust';

/** Canonical origin of the public site, without a trailing slash. */
export function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_TRUST_WEBSITE || 'https://puneckptrust.in').replace(/\/$/, '');
}

/** Turn a site-relative path or an absolute URL into an absolute URL. */
export function absoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return getSiteUrl();
  return /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${getSiteUrl()}${pathOrUrl}`;
}

/**
 * Per-page metadata: title, description, canonical, Open Graph and Twitter card.
 *
 * `image` is optional (site-relative path or absolute URL) with `imageAlt`;
 * pages without a fitting photo fall back to the trust logo. `noindex` is for
 * pages that should stay out of search results.
 */
export function buildMetadata({ title, description, path, type = 'website', image, imageAlt, noindex = false }) {
  const url = `${getSiteUrl()}${path}`;
  const ogImage = image
    ? { url: absoluteUrl(image), alt: imageAlt || title }
    : { url: absoluteUrl('/logo/logo.png'), alt: `${SITE_NAME} logo` };

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type,
      locale: 'en_IN',
      images: [ogImage],
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      images: [ogImage.url],
    },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
  };
}

/**
 * A page title that stays readable in search results: "<name> | Pune CKP
 * Family Public Trust" when that fits in about 65 characters, a shorter
 * suffix when it does not, and the bare name when even that is too long.
 */
export function pageTitle(name) {
  const full = `${name} | ${SITE_NAME}`;
  if (full.length <= 65) return full;
  const short = `${name} | Pune CKP Trust`;
  return short.length <= 65 ? short : name;
}

/**
 * A meta description of sensible length: cut at a word boundary near 158
 * characters, and when the text is very short, `context` is appended first.
 */
export function metaDescription(text, context = '') {
  let out = String(text || '').trim();
  if (out.length < 90 && context) out = `${out} ${context}`.trim();
  if (out.length <= 160) return out;
  return `${out.slice(0, 157).replace(/[\s,;:.]+\S*$/, '')}...`;
}

/** schema.org reference to the trust, for `organizer`, `publisher`, `author` fields. */
export function organizationRef() {
  return { '@type': 'NGO', name: SITE_NAME, url: getSiteUrl() };
}
