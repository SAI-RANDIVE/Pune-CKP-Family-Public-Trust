import Link from 'next/link';
import JsonLd from './JsonLd';
import { getSiteUrl } from '../lib/seo';

/**
 * Visible breadcrumb trail plus schema.org BreadcrumbList. `items` is
 * [{ label, href }]; the last item is the current page and may omit `href`
 * (pass `current` as the path so the structured data can still name its URL).
 */
export default function Breadcrumbs({ items, className = 'mb-8', align = 'start' }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      ...(item.href ? { item: `${getSiteUrl()}${item.href}` } : {}),
    })),
  };

  return (
    <>
      <nav aria-label="Breadcrumb" className={className}>
        <ol className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink/70 ${align === 'center' ? 'justify-center' : ''}`}>
          {items.map((item, index) => (
            <li key={`${item.label}-${index}`} className="flex items-center gap-2">
              {index > 0 && <span aria-hidden="true" className="text-saffron-700">/</span>}
              {item.href ? (
                <Link href={item.href} className="inline-flex min-h-[2.75rem] items-center underline-offset-4 transition-colors hover:text-vermilion-600 hover:underline sm:min-h-0 sm:py-1">{item.label}</Link>
              ) : (
                <span aria-current="page" className="font-medium text-ink/85">{item.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <JsonLd data={schema} />
    </>
  );
}
