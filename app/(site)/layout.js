import Header from '../../components/Header';
import Footer from '../../components/Footer';
import JsonLd from '../../components/JsonLd';
import MotionFx from '../../components/MotionFx';
import { getSiteUrl } from '../../lib/seo';
import { TRUST } from '../../lib/siteData';
import { isDemoMode } from '../../lib/db';

// Devanagari-capable face for the trust's Marathi motto, names and titles.
// Not preloaded: it is only fetched when a page actually shows Marathi text.

export const metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: 'Pune CKP Family Public Trust',
  description:
    'Pune CKP Family Public Trust: educational, medical, environmental, social and sports support for the Chandraseniya Kayastha Prabhu community and beyond. Join as a member or donate online.',
  applicationName: 'Pune CKP Family Public Trust',
  icons: { icon: '/logo/logo.png', apple: '/icons/apple-touch-icon.png' },
  formatDetection: { telephone: false },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 } },
};

export const viewport = {
  themeColor: '#D30000',
  width: 'device-width',
  initialScale: 1,
};

/** Layout of the public website (puneckptrust.in). The management system has its own under app/tms. */
export default function SiteLayout({ children }) {
  const siteUrl = getSiteUrl();
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'NGO',
    '@id': `${siteUrl}/#organization`,
    name: process.env.NEXT_PUBLIC_TRUST_NAME || TRUST.name,
    alternateName: ['Pune CKP Family', 'Pune CKP Public Trust', 'PCFPT', TRUST.nameMr],
    url: siteUrl,
    logo: `${siteUrl}/logo/logo.png`,
    image: `${siteUrl}/logo/logo.png`,
    description:
      'A registered public trust in Pune supporting education, medical aid, environment, social welfare and sport for the Chandraseniya Kayastha Prabhu community and beyond.',
    foundingDate: '2018-05-14',
    slogan: TRUST.motto,
    taxID: process.env.NEXT_PUBLIC_TRUST_PAN,
    identifier: process.env.NEXT_PUBLIC_TRUST_REG_NO,
    address: {
      '@type': 'PostalAddress',
      streetAddress: process.env.NEXT_PUBLIC_TRUST_ADDRESS,
      addressLocality: 'Pune',
      addressRegion: 'Maharashtra',
      postalCode: '411038',
      addressCountry: 'IN',
    },
    areaServed: { '@type': 'AdministrativeArea', name: 'Pune, Maharashtra, India' },
    telephone: process.env.NEXT_PUBLIC_TRUST_PHONE,
    email: process.env.NEXT_PUBLIC_TRUST_EMAIL,
    knowsLanguage: ['en', 'mr'],
    sameAs: TRUST.social.map((item) => item.href),
    contactPoint: [{
      '@type': 'ContactPoint',
      contactType: 'membership enquiries',
      telephone: '+91-8669151533',
      email: process.env.NEXT_PUBLIC_TRUST_EMAIL,
      areaServed: 'IN',
      availableLanguage: ['en', 'mr'],
    }],
  };

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${siteUrl}/#website`,
    url: siteUrl,
    name: TRUST.name,
    inLanguage: 'en-IN',
    publisher: { '@id': `${siteUrl}/#organization` },
  };

  return (
    <div className="font-body bg-cream-200 text-ink antialiased min-h-screen">
      <JsonLd data={organization} />
      <JsonLd data={website} />
      {isDemoMode() && <p role="status" className="bg-blue-700 px-4 py-1.5 text-center text-sm font-semibold text-white">Demonstration copy: nothing entered here reaches the trust's real records.</p>}
      <Header />
      <main id="main-content">{children}</main>
      <Footer />
      <MotionFx />
    </div>
  );
}
