import Link from 'next/link';
import { getI18n } from '../../../lib/tms/i18n/server';

/** A record or page that does not exist, with the two obvious ways out. */
export default async function TmsNotFound() {
  const { t } = await getI18n();
  return (
    <div className="tms-empty">
      <h1 id="page-title">{t('notfound.title')}</h1>
      <p>{t('notfound.body')}</p>
      <div className="tms-actions" style={{ justifyContent: 'center' }}>
        <Link href="/" className="tms-btn">{t('nav.home')}</Link>
        <Link href="/search" className="tms-btn tms-btn--secondary">{t('nav.search')}</Link>
      </div>
    </div>
  );
}
