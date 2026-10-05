import { NextResponse } from 'next/server';

/**
 * Two sites, one project.
 *
 *   puneckptrust.in        the public website
 *   admin.puneckptrust.in  the Trust Management System (pages live under app/tms)
 *
 * Requests on the admin host are rewritten to /tms/..., so the address bar shows
 * admin.puneckptrust.in/donations while the page comes from app/tms/donations.
 * On the public host the management pages and their API do not exist at all
 * (404), so nothing on the public site reveals that an admin area is there.
 *
 * Local development: open http://admin.localhost:3000 for the management
 * system and http://localhost:3000 for the public site.
 */

const ADMIN_HOST = (process.env.NEXT_PUBLIC_ADMIN_HOST || 'admin.puneckptrust.in').toLowerCase();

export function isAdminHost(host) {
  const name = String(host || '').toLowerCase().split(':')[0];
  return name === ADMIN_HOST.split(':')[0] || name.startsWith('admin.');
}

const notFound = () => new NextResponse('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const admin = isAdminHost(request.headers.get('host'));

  if (!admin) {
    // The public site must not expose the management system in any form.
    if (pathname === '/tms' || pathname.startsWith('/tms/') || pathname.startsWith('/api/tms/')
      || pathname === '/admin' || pathname.startsWith('/admin/')) {
      return notFound();
    }
    return NextResponse.next();
  }

  // --- admin host ---
  if (pathname === '/robots.txt') {
    return new NextResponse('User-agent: *\nDisallow: /\n', { headers: { 'content-type': 'text/plain' } });
  }
  if (pathname === '/sitemap.xml') return notFound();

  let response;
  if (pathname.startsWith('/api/')) {
    // Only the management API and the receipt download are served here; the public
    // checkout endpoints belong to the public host.
    if (!pathname.startsWith('/api/tms/') && !pathname.startsWith('/api/receipt/')) return notFound();
    response = NextResponse.next();
  } else if (pathname.startsWith('/tms')) {
    response = NextResponse.next();
  } else {
    const url = request.nextUrl.clone();
    url.pathname = `/tms${pathname === '/' ? '' : pathname}`;
    response = NextResponse.rewrite(url);
  }
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  response.headers.set('Cache-Control', 'no-store, max-age=0');
  return response;
}

export const config = {
  // Skip Next's own assets and static files (anything with a file extension).
  matcher: ['/((?!_next/|fonts/|logo/|images/|gallery/|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)', '/robots.txt', '/sitemap.xml'],
};
