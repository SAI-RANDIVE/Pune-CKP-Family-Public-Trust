import { Yatra_One, Poppins, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import Header from '../components/Header';
import Footer from '../components/Footer';
import JsonLd from '../components/JsonLd';
import { getSiteUrl } from '../lib/seo';

const display = Yatra_One({ subsets: ['latin'], weight: '400', variable: '--font-display' });
const body = Poppins({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'], variable: '--font-body' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

export const metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: 'Pune CKP Family Public Trust',
  description:
    'Pune CKP Family Public Trust — educational, medical, environmental, social and sports support for the Chandraseniya Kayastha Prabhu community. Join as a member or donate online.',
  icons: { icon: '/logo/logo.png', apple: '/logo/logo.png' },
};

export default function RootLayout({ children }) {
  const siteUrl = getSiteUrl();
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'NGO',
    name: process.env.NEXT_PUBLIC_TRUST_NAME || 'Pune CKP Family Public Trust',
    alternateName: 'Pune CKP Family',
    url: siteUrl,
    logo: `${siteUrl}/logo/logo.png`,
    description:
      'A registered public trust in Pune supporting education, medical aid, environment, social welfare and sport for the Chandraseniya Kayastha Prabhu community and beyond.',
    foundingDate: '2018-05-14',
    slogan: 'समाज हिताय सर्वजनसुखाय',
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
    sameAs: [
      'https://www.facebook.com/people/Pune-CKP-Family-Public-Trust/100085493575064/',
      'https://www.youtube.com/channel/UC56iaWQtXX6Oe_0KemuxOtg',
      'https://www.instagram.com/puneckpfamilypublic/',
    ],
    contactPoint: [{
      '@type': 'ContactPoint',
      contactType: 'membership enquiries',
      telephone: '+91-8669151533',
      email: process.env.NEXT_PUBLIC_TRUST_EMAIL,
      areaServed: 'IN',
      availableLanguage: ['en', 'mr'],
    }],
  };

  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${mono.variable} font-body bg-cream-200 text-ink antialiased`}>
        <JsonLd data={organization} />
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
