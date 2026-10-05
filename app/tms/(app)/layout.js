import Link from 'next/link';
import Icon from '../../../components/tms/icons';
import { I18nProvider } from '../../../components/tms/I18n';
import { BackButton, SessionWarning } from '../../../components/tms/client';
import { requireRole, can } from '../../../lib/tms/auth';
import { getI18n } from '../../../lib/tms/i18n/server';
import { setLang, setScale, signOut, stayIn } from '../../../lib/tms/actions/session';

export const dynamic = 'force-dynamic';

const SCALES = [100, 115, 130, 150];

/**
 * The signed-in frame: every screen under it requires a login. Home and Back
 * are always in the same place, navigation is always visible with a word under
 * every icon, and nothing is tucked away in a menu.
 */
export default async function AppLayout({ children }) {
  const admin = await requireRole('viewer');
  const { t, lang, dict } = await getI18n();
  const scale = SCALES.includes(admin.text_scale) ? admin.text_scale : 100;

  const nav = [
    { href: '/donations', icon: 'donate', label: t('nav.donations') },
    { href: '/members', icon: 'people', label: t('nav.members') },
    { href: '/expenses', icon: 'expense', label: t('nav.expenses') },
    { href: '/deposits', icon: 'deposit', label: t('nav.deposits') },
    { href: '/schemes', icon: 'scheme', label: t('nav.schemes') },
    { href: '/reports', icon: 'report', label: t('nav.reports') },
    can(admin, 'review') && { href: '/review', icon: 'review', label: t('nav.review') },
    { href: '/settings', icon: 'settings', label: t('nav.settings') },
    { href: '/help', icon: 'help', label: t('nav.help') },
  ].filter(Boolean);

  return (
    <I18nProvider lang={lang} dict={dict}>
      <style dangerouslySetInnerHTML={{ __html: `html{font-size:${(112.5 * scale) / 100}%}` }} />
      <a className="tms-skip" href="#main">{t('nav.skip')}</a>

      <header className="tms-top no-print">
        <div className="tms-top-in">
          <Link href="/" className="tms-brand">
            <span>
              {t('app.trust')}
              <small>{t('app.name')}</small>
            </span>
          </Link>
          <div className="tms-tools">
            <form action={setLang} aria-label={t('nav.language')}>
              <input type="hidden" name="lang" value={lang === 'mr' ? 'en' : 'mr'} />
              <button type="submit" className="tms-chip" lang={lang === 'mr' ? 'en' : 'mr'}>
                {lang === 'mr' ? 'English' : 'मराठी'}
              </button>
            </form>
            <form action={setScale}>
              <input type="hidden" name="dir" value="down" />
              <button type="submit" className="tms-chip" disabled={scale === SCALES[0]} aria-label={t('nav.text_smaller')}>A−</button>
            </form>
            <form action={setScale}>
              <input type="hidden" name="dir" value="up" />
              <button type="submit" className="tms-chip" disabled={scale === SCALES[SCALES.length - 1]} aria-label={t('nav.text_bigger')}>
                <span style={{ fontSize: '1.3em' }}>A+</span>
              </button>
            </form>
            <div className="tms-user">
              <strong>{admin.name}</strong>
              {t(`role.${admin.role}`)}
            </div>
            <form action={signOut}>
              <button type="submit" className="tms-chip"><Icon name="logout" />{t('auth.sign_out')}</button>
            </form>
          </div>
        </div>
      </header>

      <div className="tms-bar no-print">
        <div className="tms-bar-in">
          <Link href="/" className="tms-btn"><Icon name="home" />{t('nav.home')}</Link>
          <BackButton label={t('nav.back')} />
          <Link href="/search" className="tms-btn tms-btn--secondary"><Icon name="search" />{t('nav.search')}</Link>
          <nav className="tms-nav" aria-label={t('nav.main')}>
            {nav.map((item) => (
              <Link key={item.href} href={item.href}><Icon name={item.icon} />{item.label}</Link>
            ))}
          </nav>
        </div>
      </div>

      <SessionWarning expiresAt={new Date(admin.expires_at).toISOString()} extend={stayIn} />

      <main id="main" className="tms-main" aria-labelledby="page-title">{children}</main>

      <nav className="tms-bottom no-print" aria-label={t('nav.quick')}>
        <Link href="/"><Icon name="home" size="1.7em" />{t('nav.home')}</Link>
        <Link href={can(admin, 'enterMoney') ? '/donations/new' : '/donations'}><Icon name="donate" size="1.7em" />{t('nav.donation_short')}</Link>
        <Link href="/search"><Icon name="search" size="1.7em" />{t('nav.search')}</Link>
        <Link href="/members"><Icon name="people" size="1.7em" />{t('nav.members')}</Link>
        <Link href="/reports"><Icon name="report" size="1.7em" />{t('nav.reports')}</Link>
      </nav>
    </I18nProvider>
  );
}
