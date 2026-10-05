import Icon from '../../../../components/tms/icons';
import { DataTable, Flash, PageHead } from '../../../../components/tms/blocks';
import { Alert, Badge, Empty, Money, Stat } from '../../../../components/tms/ui';
import { SubmitButton } from '../../../../components/tms/client';
import { requireRole } from '../../../../lib/tms/auth';
import { getI18n } from '../../../../lib/tms/i18n/server';
import { one, q } from '../../../../lib/tms/db';
import { fmtDateTime, formatNumber } from '../../../../lib/tms/format';
import { isEmailConfigured } from '../../../../lib/email';
import { resendOnlineReceipt } from '../../../../lib/tms/actions/income';

export const dynamic = 'force-dynamic';

/** Receipt e-mail log: what was sent, what failed, and paid receipts that never went out. */
export default async function EmailsPage({ searchParams }) {
  await requireRole('accountant');
  const { t } = await getI18n();

  const [stats, unsent, deliveries, manual] = await Promise.all([
    one(`select count(*) filter (where status = 'sent')::int as sent, count(*) filter (where status = 'failed')::int as failed,
                count(*) filter (where status = 'sent' and sent_at >= now() - interval '7 days')::int as sent_7d,
                count(*) filter (where status = 'failed' and sent_at >= now() - interval '7 days')::int as failed_7d
           from receipt_emails`),
    q(`select p.id, p.receipt_no, p.payer_name, p.payer_email, p.amount, p.paid_at, p.is_test
         from payments p
        where p.status = 'paid' and not exists (select 1 from receipt_emails re where re.payment_id = p.id and re.status = 'sent')
        order by p.paid_at desc limit 25`),
    q(`select re.id, re.to_email, re.status, re.error, re.sent_at, p.receipt_no, p.payer_name
         from receipt_emails re left join payments p on p.id = re.payment_id
        order by re.sent_at desc limit 50`),
    q(`select a.id, a.action, a.created_at, a.admin_email, a.detail
         from audit_logs a where a.action in ('receipt_emailed', 'receipt_email_failed')
        order by a.created_at desc limit 30`),
  ]);
  const configured = isEmailConfigured();

  return (
    <>
      <PageHead title={t('mail.title')} intro={t('mail.intro')} crumbs={[{ href: '/donations', label: t('inc.title') }, { label: t('mail.title') }]} />
      <Flash searchParams={searchParams} />

      <div className="tms-stack">
        {configured ? <Alert tone="ok">{t('mail.configured')}</Alert> : <Alert tone="error" title={t('mail.not_configured')}>{t('mail.not_configured_body')}</Alert>}

        <div className="tms-grid tms-grid--3">
          <Stat label={t('mail.sent')} value={formatNumber(stats.sent)} note={t('mail.last7', { n: stats.sent_7d })} />
          <Stat label={t('mail.failed')} value={formatNumber(stats.failed)} note={t('mail.last7', { n: stats.failed_7d })} />
          <Stat label={t('mail.unsent')} value={formatNumber(unsent.length)} note={t('mail.unsent_note')} />
        </div>

        {unsent.length > 0 && (
          <section aria-labelledby="m-unsent">
            <h2 id="m-unsent" style={{ marginBottom: '0.5rem' }}>{t('mail.unsent_title')}</h2>
            <DataTable
              rows={unsent}
              columns={[
                { label: t('f.receipt_no'), lead: true, cell: (p) => <><span className="mono">{p.receipt_no}</span> {p.is_test && <Badge tone="warn">{t('pay.test')}</Badge>}</> },
                { label: t('inc.from_whom'), cell: (p) => <>{p.payer_name}<span className="muted" style={{ display: 'block' }}>{p.payer_email}</span></> },
                { label: t('f.amount'), right: true, cell: (p) => <Money value={p.amount} /> },
                { label: t('f.date'), cell: (p) => fmtDateTime(p.paid_at) },
                {
                  label: t('pay.receipt'),
                  cell: (p) => (
                    <form action={resendOnlineReceipt}>
                      <input type="hidden" name="paymentId" value={p.id} />
                      <SubmitButton className="tms-btn tms-btn--small" busyLabel={t('rcp.sending')}><Icon name="mail" />{t('pay.send')}</SubmitButton>
                    </form>
                  ),
                },
              ]}
            />
          </section>
        )}

        <section aria-labelledby="m-log">
          <h2 id="m-log" style={{ marginBottom: '0.5rem' }}>{t('mail.log_online')}</h2>
          {deliveries.length === 0 ? <Empty title={t('mail.none')} /> : (
            <DataTable
              rows={deliveries}
              columns={[
                { label: t('f.date'), cell: (d) => fmtDateTime(d.sent_at) },
                { label: t('mail.to'), lead: true, cell: (d) => d.to_email },
                { label: t('f.receipt_no'), cell: (d) => <span className="mono">{d.receipt_no || '—'}</span> },
                { label: t('f.status'), cell: (d) => <><Badge tone={d.status === 'sent' ? 'ok' : 'error'}>{t(`mail.s_${d.status}`)}</Badge>{d.error ? <span className="muted" style={{ display: 'block' }}>{String(d.error).slice(0, 160)}</span> : null}</> },
              ]}
            />
          )}
        </section>

        <section aria-labelledby="m-manual">
          <h2 id="m-manual" style={{ marginBottom: '0.5rem' }}>{t('mail.log_manual')}</h2>
          {manual.length === 0 ? <Empty title={t('mail.none')} /> : (
            <DataTable
              rows={manual}
              columns={[
                { label: t('f.date'), cell: (a) => fmtDateTime(a.created_at) },
                { label: t('mail.to'), lead: true, cell: (a) => a.detail?.to || '—' },
                { label: t('f.receipt_no'), cell: (a) => <span className="mono">{a.detail?.receipt || '—'}</span> },
                { label: t('f.status'), cell: (a) => <Badge tone={a.action === 'receipt_emailed' ? 'ok' : 'error'}>{t(a.action === 'receipt_emailed' ? 'mail.s_sent' : 'mail.s_failed')}</Badge> },
                { label: t('c.by'), cell: (a) => a.admin_email || '—' },
              ]}
            />
          )}
        </section>
      </div>
    </>
  );
}
