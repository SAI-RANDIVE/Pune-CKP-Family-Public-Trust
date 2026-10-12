import './tms.css';
import { getI18n } from '../../lib/tms/i18n/server';

/**
 * Layout of the Trust Management System (admin.puneckptrust.in). Requests on
 * the admin host are rewritten to /tms/... by middleware.js, so links inside
 * these pages are written without the /tms prefix.
 */


export const dynamic = 'force-dynamic';

export const metadata = {
  title: { default: 'विश्वस्त व्यवस्थापन प्रणाली | Pune CKP Family Public Trust', template: '%s | पुणे सीकेपी फॅमिली पब्लिक ट्रस्ट' },
  robots: { index: false, follow: false, nocache: true },
  icons: { icon: '/logo/logo.png' },
};

export const viewport = { width: 'device-width', initialScale: 1 };

export default async function TmsLayout({ children }) {
  const { lang } = await getI18n();
  return (
    <div className="tms" lang={lang}>
      {/* Base size 18px; the signed-in layout overrides this with the user's A+/A- choice. */}
      <style dangerouslySetInnerHTML={{ __html: 'html{font-size:112.5%}' }} />
      {children}
    </div>
  );
}
