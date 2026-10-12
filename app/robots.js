import { getSiteUrl } from '../lib/seo';

/**
 * Public pages are open to every crawler. The API, member profile pages and
 * the management system are not for search engines. (The management system is
 * served on its own host, which answers robots.txt with "Disallow: /" in
 * middleware.js; the /tms and /admin rules here cover the public host too.)
 */
export default function robots() {
  const siteUrl = getSiteUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api', '/profile', '/member', '/tms', '/admin'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
