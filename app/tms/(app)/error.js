'use client';

import { useEffect } from 'react';
import { useI18n } from '../../../components/tms/I18n';

/**
 * Catch-all for anything that goes wrong while showing a screen. The cause is
 * logged on the server; the trustee sees only a calm message and two clear
 * ways forward. No technical or database text is ever shown.
 */
export default function TmsError({ error, reset }) {
  const { t } = useI18n();
  useEffect(() => {
    console.error('TMS screen error', error?.digest || '');
  }, [error]);

  return (
    <div className="tms-alert tms-alert--error" role="alert" style={{ display: 'block' }}>
      <h1 style={{ fontSize: '1.4rem' }}>{t('error.title')}</h1>
      <p style={{ marginTop: '0.5rem' }}>{t('error.body')}</p>
      {error?.digest && <p className="mono" style={{ marginTop: '0.5rem' }}>{t('error.ref')}: {error.digest}</p>}
      <div className="tms-actions" style={{ marginTop: '1rem' }}>
        <button type="button" className="tms-btn" onClick={() => reset()}>{t('error.retry')}</button>
        <a href="/" className="tms-btn tms-btn--secondary">{t('nav.home')}</a>
      </div>
    </div>
  );
}
