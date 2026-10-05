import Link from 'next/link';
import Icon from '../../../../components/tms/icons';
import { PageHead } from '../../../../components/tms/blocks';
import { requireRole, can } from '../../../../lib/tms/auth';
import { getI18n } from '../../../../lib/tms/i18n/server';

export const dynamic = 'force-dynamic';

/** Settings: only what this user's role may open is shown, and each page checks again on the server. */
export default async function SettingsPage() {
  const admin = await requireRole('viewer');
  const { t } = await getI18n();

  const items = [
    { href: '/settings/account', icon: 'settings', title: t('set.account'), note: t('set.account_note') },
    can(admin, 'manageUsers') && { href: '/settings/users', icon: 'people', title: t('set.users'), note: t('set.users_note') },
    can(admin, 'manageCategories') && { href: '/settings/categories', icon: 'expense', title: t('set.categories'), note: t('set.categories_note') },
    can(admin, 'viewAudit') && { href: '/settings/audit', icon: 'review', title: t('set.audit'), note: t('set.audit_note') },
    can(admin, 'backup') && { href: '/settings/backup', icon: 'download', title: t('set.backup'), note: t('set.backup_note') },
    { href: '/settings/source', icon: 'source', title: t('src.title'), note: t('set.source_note') },
    can(admin, 'enterMoney') && { href: '/emails', icon: 'mail', title: t('mail.title'), note: t('set.mail_note') },
    { href: '/help', icon: 'help', title: t('nav.help'), note: t('set.help_note') },
  ].filter(Boolean);

  return (
    <>
      <PageHead title={t('nav.settings')} intro={t('set.intro', { role: t(`role.${admin.role}`) })} crumbs={[{ label: t('nav.settings') }]} />
      <nav className="tms-tiles" aria-label={t('nav.settings')}>
        {items.map((item, i) => (
          <Link key={item.href} href={item.href} className={`tms-tile tms-tile--${(i % 8) + 1}`}>
            <Icon name={item.icon} size="2.4rem" />
            <span>{item.title}<small>{item.note}</small></span>
          </Link>
        ))}
      </nav>
    </>
  );
}
