import { Flash, PageHead } from '../../../../../components/tms/blocks';
import { Alert, Badge, Card, KeyValues, SelectField, TextField } from '../../../../../components/tms/ui';
import { ConfirmSubmit, SubmitButton } from '../../../../../components/tms/client';
import { requireRole, hasOtpGrant } from '../../../../../lib/tms/auth';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { q } from '../../../../../lib/tms/db';
import { fmtDateTime } from '../../../../../lib/tms/format';
import { ROLE_VALUES } from '../../../../../lib/tms/schemas';
import { createUser, resetUserPassword, updateUser } from '../../../../../lib/tms/actions/settings';

export const dynamic = 'force-dynamic';

/** Logins and roles. Super Admin only; every change here needs the e-mailed code. */
export default async function UsersPage({ searchParams }) {
  const admin = await requireRole('super_admin');
  const { t } = await getI18n();
  const [users, granted] = await Promise.all([
    q(`select id, name, email, username, role, is_active, last_login_at, locked_until, created_at from admin_users
        order by is_active desc, case role when 'super_admin' then 0 when 'admin' then 1 when 'accountant' then 2 else 3 end, name`),
    hasOtpGrant(admin),
  ]);
  const roleOptions = ROLE_VALUES.map((r) => ({ value: r, label: t(`role.${r}`) }));

  return (
    <>
      <PageHead title={t('set.users')} intro={t('usr.intro')} crumbs={[{ href: '/settings', label: t('nav.settings') }, { label: t('set.users') }]} />
      <Flash searchParams={searchParams} />

      <div className="tms-stack">
        {!granted && <Alert tone="info">{t('usr.needs_code')} <a href="/verify?next=%2Fsettings%2Fusers">{t('otp.get_now')}</a></Alert>}

        <Card title={t('usr.roles_title')}>
          <KeyValues items={ROLE_VALUES.map((r) => [t(`role.${r}`), t(`usr.can.${r}`)])} />
        </Card>

        <div className="tms-grid tms-grid--2">
          {users.map((u) => (
            <Card key={u.id} title={u.name}>
              <p style={{ marginBottom: '0.5rem' }}>
                <Badge tone={u.is_active ? 'ok' : 'error'}>{u.is_active ? t('usr.active') : t('usr.inactive')}</Badge>{' '}
                <Badge tone="neutral">{t(`role.${u.role}`)}</Badge>{' '}
                {u.id === admin.id && <Badge tone="info">{t('usr.you')}</Badge>}
                {u.locked_until && new Date(u.locked_until) > new Date() && <> <Badge tone="warn">{t('usr.locked')}</Badge></>}
              </p>
              <KeyValues items={[
                [t('f.email'), u.email],
                [t('usr.username'), u.username],
                [t('usr.last_login'), u.last_login_at ? fmtDateTime(u.last_login_at) : t('usr.never')],
              ]} />

              {u.id !== admin.id && (
                <form action={updateUser} className="no-print" style={{ marginTop: '1rem' }}>
                  <input type="hidden" name="id" value={u.id} />
                  <SelectField label={t('usr.role')} name="role" defaultValue={u.role} options={roleOptions} />
                  <SelectField label={t('usr.state')} name="is_active" defaultValue={String(u.is_active)} options={[{ value: 'true', label: t('usr.active') }, { value: 'false', label: t('usr.inactive') }]} />
                  <ConfirmSubmit label={t('c.save_changes')} className="tms-btn" message={t('usr.confirm_change', { name: u.name })} />
                </form>
              )}
              <details className="no-print" style={{ marginTop: '0.75rem' }}>
                <summary>{t('usr.reset')}</summary>
                <form action={resetUserPassword} style={{ marginTop: '0.5rem' }}>
                  <input type="hidden" name="id" value={u.id} />
                  <TextField label={t('acct.new')} name="password" type="text" required minLength={10} maxLength={200} autoComplete="off" hint={t('usr.reset_hint')} />
                  <ConfirmSubmit label={t('usr.reset')} className="tms-btn tms-btn--secondary" message={t('usr.confirm_reset', { name: u.name })} />
                </form>
              </details>
            </Card>
          ))}
        </div>

        <Card title={t('usr.add')} className="no-print" style={{ maxWidth: '40rem' }}>
          <form action={createUser}>
            <TextField label={t('f.name')} name="name" required minLength={2} maxLength={120} placeholder="Suresh Pradhan" />
            <TextField label={t('f.email')} name="email" type="email" required maxLength={254} placeholder="name@example.com" hint={t('usr.email_hint')} />
            <TextField label={t('usr.username')} name="username" optional={t('c.optional')} maxLength={30} placeholder="suresh" hint={t('usr.username_hint')} autoCapitalize="none" />
            <SelectField label={t('usr.role')} name="role" required defaultValue="viewer" options={roleOptions} />
            <TextField label={t('usr.first_password')} name="password" type="text" required minLength={10} maxLength={200} autoComplete="off" hint={t('usr.reset_hint')} />
            <SubmitButton>{t('usr.add')}</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
