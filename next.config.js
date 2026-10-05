/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== 'production';

// Razorpay checkout needs its script, iframe and API origins allowed.
//
// ⚠️ 'unsafe-eval' is DEV ONLY. Next's React Fast Refresh runtime evaluates
// strings, so without it the entire client bundle fails to load in `next dev`
// — which kills hydration and makes every button, dropdown and form on the
// site inert. It must never be shipped to production, so it is gated on
// NODE_ENV rather than added to the shared list.
const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  isDev ? "'unsafe-eval'" : null,
  'https://checkout.razorpay.com',
  'https://*.razorpay.com',
].filter(Boolean).join(' ');

// Dev also needs a websocket back to the dev server for HMR.
const connectSrc = [
  "'self'",
  'https://*.razorpay.com',
  'https://lumberjack.razorpay.com',
  isDev ? 'ws: wss:' : null,
].filter(Boolean).join(' ');

const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src ${connectSrc}`,
  "frame-src https://api.razorpay.com https://*.razorpay.com",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  // Only meaningful over HTTPS, and it breaks http://localhost in dev.
  isDev ? null : 'upgrade-insecure-requests',
].filter(Boolean).join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  images: {
    // Scoped deliberately: `hostname: '**'` turns the image optimizer into an
    // open proxy and is a known DoS vector. Add hosts here as they're needed.
    // puneckptrust.org is the old site: gallery photos are served from it until
    // `node scripts/fetch-old-images.js` has copied them into public/gallery.
    // i.ytimg.com serves the video-gallery thumbnails.
    remotePatterns: [
      { protocol: 'https', hostname: 'puneckptrust.org', pathname: '/wp-content/uploads/**' },
      { protocol: 'https', hostname: 'www.puneckptrust.org', pathname: '/wp-content/uploads/**' },
      { protocol: 'https', hostname: 'puneckptrust.in' },
      { protocol: 'https', hostname: 'i.ytimg.com', pathname: '/vi/**' },
    ],
    formats: ['image/avif', 'image/webp'],
    // Old-site photos never change: let the optimizer keep them for a month.
    minimumCacheTTL: 2592000,
  },

  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Private pages must never be cached or indexed by intermediaries.
      {
        source: '/admin/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }, { key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
      {
        source: '/profile/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }, { key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
      {
        source: '/fonts/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

module.exports = nextConfig;
