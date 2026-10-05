import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '../../../lib/adminAuth';
import { getI18n } from '../../../lib/tms/i18n/server';
import { Alert } from '../../../components/tms/ui';
import { signIn, setLang } from '../../../lib/tms/actions/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'प्रवेश / Sign in' };

const ERRORS = ['invalid', 'locked', 'locked_now', 'rate', 'server'];

export default async function LoginPage({ searchParams }) {
  const existing = await getCurrentAdmin();
  if (existing) redirect('/');

  const { t, lang } = await getI18n();
  const code = String(searchParams?.e || '');
  const minutes = Math.min(999, Math.max(1, Number.parseInt(searchParams?.m, 10) || 15));

  return (
    <main className="tms-login">
      <div className="tms-login-box">
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/logo.png" alt="" width="96" height="96" style={{ margin: '0 auto', borderRadius: '50%' }} />
          <h1 style={{ marginTop: '0.75rem' }}>{t('app.trust')}</h1>
          <p className="muted">{t('app.name')}</p>
        </div>

        <div className="tms-card">
          <h2>{t('auth.title')}</h2>
          <p className="muted" style={{ marginBottom: '1rem' }}>{t('auth.intro')}</p>

          {ERRORS.includes(code) && (
            <div style={{ marginBottom: '1rem' }}>
              <Alert tone="error">{t(`auth.e.${code}`, { minutes })}</Alert>
            </div>
          )}
          {code === 'signed_out' && (
            <div style={{ marginBottom: '1rem' }}><Alert tone="ok">{t('auth.signed_out')}</Alert></div>
          )}

          <form action={signIn}>
            <div className="tms-field">
              <label className="tms-label" htmlFor="identifier">{t('auth.identifier')}</label>
              <input
                className="tms-input" id="identifier" name="identifier" type="text" required maxLength={254}
                autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder={t('auth.identifier_ph')}
              />
            </div>
            <div className="tms-field">
              <label className="tms-label" htmlFor="password">{t('auth.password')}</label>
              <input className="tms-input" id="password" name="password" type="password" required maxLength={200} autoComplete="current-password" />
              <span className="tms-hint">{t('auth.lock_hint')}</span>
            </div>
            <button type="submit" className="tms-btn tms-btn--big tms-btn--block">{t('auth.sign_in')}</button>
          </form>
        </div>

        <form action={setLang} style={{ marginTop: '1rem', textAlign: 'center' }}>
          <input type="hidden" name="lang" value={lang === 'mr' ? 'en' : 'mr'} />
          <button type="submit" className="tms-btn tms-btn--quiet" lang={lang === 'mr' ? 'en' : 'mr'}>
            {lang === 'mr' ? 'English' : 'मराठी'}
          </button>
        </form>
        <p className="muted" style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.95rem' }}>{t('auth.help')}</p>
      </div>
    </main>
  );
}
