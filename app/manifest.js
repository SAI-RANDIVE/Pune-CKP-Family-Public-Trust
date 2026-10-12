/**
 * Web app manifest: lets a phone or computer install the website as an app
 * ("Add to Home screen"). It opens at the members' corner, where a member
 * spends most of their time; the rest of the site is one tap away.
 */
export default function manifest() {
  return {
    name: 'Pune CKP Family Public Trust',
    short_name: 'CKP Trust',
    description: 'Membership, donations, events and the members\' corner of Pune CKP Family Public Trust.',
    id: '/',
    start_url: '/member?source=app',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FDF5E7',
    theme_color: '#B00000',
    lang: 'en-IN',
    categories: ['social', 'lifestyle'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'My membership', url: '/member' },
      { name: 'Events', url: '/member/events' },
      { name: 'Donate', url: '/donate' },
    ],
  };
}
