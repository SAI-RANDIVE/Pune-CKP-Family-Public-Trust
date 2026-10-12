import Link from 'next/link';
import Icon from '../../../components/tms/icons';
import { I18nProvider } from '../../../components/tms/I18n';
import { BackButton, SessionWarning } from '../../../components/tms/client';
import SideNav from '../../../components/tms/SideNav';
import { requireRole, can } from '../../../lib/tms/auth';
import { canSee, canChange } from '../../../lib/tms/access';
import { isDemoMode } from '../../../lib/db';
import { getI18n } from '../../../lib/tms/i18n/server';
import { one } from '../../../lib/tms/db';
import { OFFICER_TITLES } from '../../../lib/tms/constants';
import { setLang, setScale, signOut, stayIn } from '../../../lib/tms/actions/session';

export const dynamic = 'force-dynamic';

const SCALES = [100, 115, 130, 150];

/**
 * The signed-in frame: every screen under it requires a login.
 *
 * Wide screens: a side menu that is always there, grouped under plain
 * headings, and a top bar with Back, search, language, text size and the
 * user. Phones and tablets: the same top bar, a "Menu" that opens the full
 * list, and a bottom bar with the five things done most. A section this login
 * may not open is simply absent from all of them.
 */
export default async function AppLayout({ children }) {
  const admin = await requireRole('viewer');
  const { t, lang, dict } = await getI18n();
  const scale = SCALES.includes(admin.text_scale) ? admin.text_scale : 100;
  const sees = (area) => canSee(admin, area);
  const mayReview = can(admin, 'review');

  // Small counts beside menu entries, so work waiting is visible from any screen.
  const counts = await one(
    `select (select count(*) from import_review_queue where status = 'open')::int as review,
            (select count(*) from feedback where status = 'new')::int as feedback`).catch(() => ({ review: 0, feedback: 0 }));

  const groups = [
    { title: t('x.nav.overview'), items: [
      { href: '/', icon: 'home', label: t('nav.home') },
      { href: '/search', icon: 'search', label: t('nav.search') },
      sees('reports') && { href: '/reports', icon: 'report', label: t('nav.reports') },
    ] },
    { title: t('x.nav.money'), items: [
      sees('donations') && { href: '/donations', icon: 'donate', label: t('nav.donations') },
      sees('donations') && { href: '/receipts', icon: 'receipt', label: t('x.nav.receipts') },
      sees('expenses') && { href: '/expenses', icon: 'expense', label: t('nav.expenses') },
      sees('deposits') && { href: '/deposits', icon: 'deposit', label: t('nav.deposits') },
      sees('schemes') && { href: '/schemes', icon: 'scheme', label: t('nav.schemes') },
      sees('bank') && { href: '/bank', icon: 'bank', label: t('x.nav.bank') },
    ] },
    { title: t('x.nav.people'), items: [
      sees('members') && { href: '/members', icon: 'people', label: t('nav.members') },
      sees('members') && { href: '/people', icon: 'people', label: t('x.nav.everyone') },
      sees('members') && mayReview && { href: '/portal', icon: 'mail', label: t('x.nav.portal') },
    ] },
    { title: t('x.nav.activity'), items: [
      sees('events') && { href: '/events', icon: 'event', label: t('nav.events') },
      sees('events') && { href: '/planner', icon: 'scheme', label: t('x.nav.planner') },
      sees('meetings') && { href: '/meetings', icon: 'review', label: t('x.mt.nav') },
      sees('community') && { href: '/polls', icon: 'report', label: t('x.po.title') },
      sees('community') && { href: '/feedback', icon: 'mail', label: t('x.nav.feedback'), badge: counts.feedback || null },
    ] },
    { title: t('x.nav.office'), items: [
      mayReview && sees('review') && { href: '/review', icon: 'review', label: t('nav.review'), badge: counts.review || null },
      { href: '/settings', icon: 'settings', label: t('nav.settings') },
      { href: '/help', icon: 'help', label: t('nav.help') },
    ] },
  ].map((g) => ({ ...g, items: g.items.filter(Boolean) })).filter((g) => g.items.length);

  const office = OFFICER_TITLES.find((o) => o.key === admin.designation);
  const initials = String(admin.name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  return (
    <I18nProvider lang={lang} dict={dict}>
      <style dangerouslySetInnerHTML={{ __html: `html{font-size:${(112.5 * scale) / 100}%}` }} />
      <a className="tms-skip" href="#main">{t('nav.skip')}</a>

      {isDemoMode() && <div className="tms-demo no-print" role="status">{t('x.demo.ribbon')}</div>}

      <div className="tms-shell">
        <aside className="tms-side no-print">
          <Link href="/" className="tms-side-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo/logo.png" alt="" width="44" height="44" />
            <span>{t('app.trust')}<small>{t('app.name')}</small></span>
          </Link>
          <SideNav groups={groups} />
        </aside>

        <div className="tms-body">
          <header className="tms-topbar no-print">
            <Link href="/" className="tms-topbar-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo/logo.png" alt="" width="36" height="36" />
              <span>{t('app.trust')}</span>
            </Link>
            <BackButton label={t('nav.back')} />
            <form action="/search" method="get" role="search" className="tms-topbar-search">
              <Icon name="search" />
              <input type="search" name="q" aria-label={t('nav.search')} placeholder={t('x.nav.search_ph')} maxLength={80} autoComplete="off" />
            </form>
            <div className="tms-tools">
              <form action={setLang} aria-label={t('nav.language')}>
                <input type="hidden" name="lang" value={lang === 'mr' ? 'en' : 'mr'} />
                <button type="submit" className="tms-chip" lang={lang === 'mr' ? 'en' : 'mr'}>{lang === 'mr' ? 'English' : 'मराठी'}</button>
              </form>
              <form action={setScale}>
                <input type="hidden" name="dir" value="down" />
                <button type="submit" className="tms-chip" disabled={scale === SCALES[0]} aria-label={t('nav.text_smaller')}>A−</button>
              </form>
              <form action={setScale}>
                <input type="hidden" name="dir" value="up" />
                <button type="submit" className="tms-chip" disabled={scale === SCALES[SCALES.length - 1]} aria-label={t('nav.text_bigger')}>
                  <span style={{ fontSize: '1.2em' }}>A+</span>
                </button>
              </form>
              <div className="tms-user">
                <span className="av" aria-hidden="true">{initials}</span>
                <span><strong>{admin.name}</strong>{office ? (lang === 'mr' ? office.mr : office.en) : t(`role.${admin.role}`)}</span>
              </div>
              <form action={signOut}>
                <button type="submit" className="tms-chip"><Icon name="logout" /><span className="lbl">{t('auth.sign_out')}</span></button>
              </form>
            </div>
          </header>

          {/* Phones and tablets: the whole menu behind one button. Works without JavaScript. */}
          <details className="tms-menu no-print">
            <summary><Icon name="settings" />{t('x.nav.menu')}</summary>
            <SideNav groups={groups} />
          </details>

          <SessionWarning expiresAt={new Date(admin.expires_at).toISOString()} extend={stayIn} />

          <main id="main" className="tms-main" aria-labelledby="page-title">{children}</main>
        </div>
      </div>

      <nav className="tms-bottom no-print" aria-label={t('nav.quick')}>
        <Link href="/"><Icon name="home" size="1.7em" />{t('nav.home')}</Link>
        {sees('donations')
          ? <Link href={can(admin, 'enterMoney') && canChange(admin, 'donations') ? '/donations/new' : '/donations'}><Icon name="donate" size="1.7em" />{t('nav.donation_short')}</Link>
          : <Link href="/events"><Icon name="event" size="1.7em" />{t('nav.events')}</Link>}
        <Link href="/search"><Icon name="search" size="1.7em" />{t('nav.search')}</Link>
        {sees('members') ? <Link href="/members"><Icon name="people" size="1.7em" />{t('nav.members')}</Link> : <Link href="/help"><Icon name="help" size="1.7em" />{t('nav.help')}</Link>}
        {sees('reports') ? <Link href="/reports"><Icon name="report" size="1.7em" />{t('nav.reports')}</Link> : <Link href="/settings"><Icon name="settings" size="1.7em" />{t('nav.settings')}</Link>}
      </nav>
    </I18nProvider>
  );
}
