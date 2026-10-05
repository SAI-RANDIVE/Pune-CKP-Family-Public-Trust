import { redirect } from 'next/navigation';
import { PageHead } from '../../../../components/tms/blocks';
import { Alert } from '../../../../components/tms/ui';
import { SubmitButton } from '../../../../components/tms/client';
import { requireRole, hasOtpGrant, safeNext, OTP_GRANT_MINUTES } from '../../../../lib/tms/auth';
import { getI18n } from '../../../../lib/tms/i18n/server';
import { sendCode, checkCode } from '../../../../lib/tms/actions/session';

export const dynamic = 'force-dynamic';

const mask = (email) => String(email).replace(/^(.{2})[^@]*(@.*)$/, '$1•••$2');

/** The e-mailed code screen that guards sensitive actions. */
export default async function VerifyPage({ searchParams }) {
  const admin = await requireRole('viewer');
  const { t } = await getI18n();
  const next = safeNext(String(searchParams?.next || '/'));
  if (await hasOtpGrant(admin)) redirect(next);

  const sent = searchParams?.sent === '1';
  const error = ['rate', 'mail', 'wrong', 'server'].includes(searchParams?.e) ? searchParams.e : null;

  return (
    <>
      <PageHead title={t('otp.title')} intro={t('otp.intro')} crumbs={[{ label: t('otp.title') }]} />
      <div className="tms-card" style={{ maxWidth: '34rem' }}>
        {error && <div style={{ marginBottom: '1rem' }}><Alert tone="error">{t(`otp.e.${error}`)}</Alert></div>}

        {!sent ? (
          <form action={sendCode}>
            <input type="hidden" name="next" value={next} />
            <p style={{ marginBottom: '1rem' }}>{t('otp.step1', { email: mask(admin.email) })}</p>
            <SubmitButton className="tms-btn tms-btn--big" busyLabel={t('otp.sending')}>{t('otp.send')}</SubmitButton>
          </form>
        ) : (
          <>
            {!error && <div style={{ marginBottom: '1rem' }}><Alert tone="ok">{t('otp.sent', { email: mask(admin.email) })}</Alert></div>}
            <form action={checkCode}>
              <input type="hidden" name="next" value={next} />
              <div className="tms-field">
                <label className="tms-label" htmlFor="code">{t('otp.code')}</label>
                <input
                  className="tms-input tms-input--amount" id="code" name="code" type="text" inputMode="numeric" pattern="[0-9]{6}"
                  maxLength={6} required autoComplete="one-time-code" placeholder="123456" style={{ letterSpacing: '0.4em', maxWidth: '14rem' }}
                />
                <span className="tms-hint">{t('otp.code_hint')}</span>
              </div>
              <SubmitButton className="tms-btn tms-btn--big">{t('otp.confirm')}</SubmitButton>
            </form>
            <form action={sendCode} style={{ marginTop: '1.25rem' }}>
              <input type="hidden" name="next" value={next} />
              <button type="submit" className="tms-btn tms-btn--quiet">{t('otp.resend')}</button>
            </form>
          </>
        )}
        <p className="tms-hint" style={{ marginTop: '1rem' }}>{t('otp.window', { minutes: OTP_GRANT_MINUTES })}</p>
      </div>
    </>
  );
}
