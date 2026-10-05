import { AREAS_OF_WORK } from '../lib/areasOfWorkData';
import { GAURAV_SOHALA_YEARS } from '../lib/gauravSohalaData';
import { PROJECTS } from '../lib/projectsData';
import { EVENTS } from '../lib/eventsData';
import { GALLERY_ALBUMS } from '../lib/galleryData';
import { getSiteUrl } from '../lib/seo';

/**
 * Every public page of the website. Member profile pages (/profile/...), the
 * API and the management system are deliberately absent: see app/robots.js.
 */
export default function sitemap() {
  // priority/changeFrequency are hints, not guarantees, but they cost nothing
  // and they tell crawlers which pages actually move.
  const routes = [
    { path: '/', priority: 1.0, changeFrequency: 'weekly' },
    { path: '/about', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/membership', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/donate', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/donate/bank-transfer', priority: 0.6, changeFrequency: 'yearly' },
    { path: '/areas-of-work', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/projects', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/impact', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/events', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/gaurav-sohala', priority: 0.8, changeFrequency: 'yearly' },
    { path: '/milestones', priority: 0.7, changeFrequency: 'yearly' },
    { path: '/team', priority: 0.7, changeFrequency: 'yearly' },
    { path: '/gallery', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/gallery/videos', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/business-promotion', priority: 0.5, changeFrequency: 'yearly' },
    { path: '/faq', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/contact', priority: 0.7, changeFrequency: 'yearly' },
    { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/refund-policy', priority: 0.3, changeFrequency: 'yearly' },
    ...AREAS_OF_WORK.map((area) => ({ path: `/areas-of-work/${area.slug}`, priority: 0.7, changeFrequency: 'yearly' })),
    ...PROJECTS.map((project) => ({ path: `/projects/${project.slug}`, priority: 0.7, changeFrequency: 'yearly' })),
    ...GAURAV_SOHALA_YEARS.map((year) => ({ path: `/gaurav-sohala/${year}`, priority: 0.6, changeFrequency: 'yearly' })),
    ...EVENTS.map((event) => ({ path: `/events/${event.slug}`, priority: 0.5, changeFrequency: 'yearly' })),
    ...GALLERY_ALBUMS.map((album) => ({ path: `/gallery/${album.slug}`, priority: 0.4, changeFrequency: 'yearly' })),
  ];
  const baseUrl = getSiteUrl();
  const lastModified = new Date();
  return routes.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
