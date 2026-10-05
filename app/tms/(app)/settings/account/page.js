import { Flash, PageHead } from '../../../../../components/tms/blocks';
import { Card, KeyValues, TextField } from '../../../../../components/tms/ui';
import { SubmitButton } from '../../../../../components/tms/client';
import { requireRole } from '../../../../../lib/tms/auth';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { changePassword } from '../../../../../lib/tms/actions/session';

export const dynamic = 'force-dynamic';

/** The signed-in user's own details and password. */
export default async function AccountPage({ searchParams }) {
  const admin = await requireRole('viewer');
  const { t } = await getI18n();

  return (
    <>
      <PageHead title={t('set.account')} crumbs={[{ href: '/settings', label: t('nav.settings') }, { label: t('set.account') }]} />
      <Flash searchParams={searchParams} />
      <div className="tms-grid tms-grid--2">
        <Card title={t('acct.you')}>
          <KeyValues items={[
            [t('f.name'), admin.name],
            [t('f.email'), admin.email],
            [t('usr.username'), admin.username],
            [t('usr.role'), t(`role.${admin.role}`)],
          ]} />
          <p className="tms-hint">{t('acct.role_note')}</p>
        </Card>
        <Card title={t('acct.change_password')}>
          <form action={changePassword}>
            <TextField label={t('acct.current')} name="current" type="password" required autoComplete="current-password" maxLength={200} />
            <TextField label={t('acct.new')} name="next" type="password" required autoComplete="new-password" minLength={10} maxLength={200} hint={t('acct.rule')} />
            <TextField label={t('acct.again')} name="again" type="password" required autoComplete="new-password" minLength={10} maxLength={200} />
            <SubmitButton>{t('acct.change_password')}</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
