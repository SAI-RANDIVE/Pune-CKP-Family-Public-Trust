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
  // x-forwarded-host first: it is what the visitor's browser asked for. When a form
  // action redirects, Next fetches the next page from itself on its internal
  // address, and only this header still carries the real host. Hosting platforms
  // (and any reverse proxy in front of the app) must set it themselves and not
  // pass a visitor-supplied value through.
  const admin = isAdminHost(request.headers.get('x-forwarded-host') || request.headers.get('host'));

  if (!admin) {
    // The public site must not expose the management system in any form.
    if (pathname === '/tms' || pathname.startsWith('/tms/') || pathname.startsWith('/api/tms/')
      || pathname === '/admin' || pathname.startsWith('/admin/')) {
      return notFound();
    }
    // Never let a visitor-supplied section header through.
    if (request.headers.has('x-tms-path')) {
      const clean = new Headers(request.headers);
      clean.delete('x-tms-path');
      return NextResponse.next({ request: { headers: clean } });
    }
    return NextResponse.next();
  }

  // --- admin host ---
  if (pathname === '/robots.txt') {
    return new NextResponse('User-agent: *\nDisallow: /\n', { headers: { 'content-type': 'text/plain' } });
  }
  if (pathname === '/sitemap.xml') return notFound();

  // The guards in lib/tms/auth.js read this to decide which section a request belongs to.
  // Set here (and only here), so a value sent by a browser is always overwritten.
  const headers = new Headers(request.headers);
  headers.set('x-tms-path', pathname);
  const forward = { request: { headers } };

  let response;
  if (pathname.startsWith('/api/')) {
    // Only the management API and the receipt download are served here; the public
    // checkout endpoints belong to the public host.
    if (!pathname.startsWith('/api/tms/') && !pathname.startsWith('/api/receipt/')) return notFound();
    response = NextResponse.next(forward);
  } else if (pathname.startsWith('/tms')) {
    response = NextResponse.next(forward);
  } else {
    const url = request.nextUrl.clone();
    url.pathname = `/tms${pathname === '/' ? '' : pathname}`;
    response = NextResponse.rewrite(url, forward);
  }
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  response.headers.set('Cache-Control', 'no-store, max-age=0');
  return response;
}

export const config = {
  // Skip Next's own assets and static files (anything with a file extension).
  matcher: ['/((?!_next/|fonts/|logo/|images/|gallery/|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)', '/robots.txt', '/sitemap.xml'],
};
