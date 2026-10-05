import Icon from '../../../../components/tms/icons';
import { DataTable, FilterForm, Flash, PageHead, Pager } from '../../../../components/tms/blocks';
import { Alert, Badge, Empty, Money, SelectField, Stat, TextField } from '../../../../components/tms/ui';
import { SubmitButton } from '../../../../components/tms/client';
import { requireRole } from '../../../../lib/tms/auth';
import { getI18n } from '../../../../lib/tms/i18n/server';
import { PAGE_SIZE, Where, likeParam, oneOf, one, pageOf, q, textParam } from '../../../../lib/tms/db';
import { fmtDateTime, formatINR, formatNumber } from '../../../../lib/tms/format';
import { TONE_BY_STATUS } from '../../../../lib/tms/constants';
import { resendOnlineReceipt } from '../../../../lib/tms/actions/income';

export const dynamic = 'force-dynamic';

const STATUSES = ['paid', 'created', 'failed', 'refunded', 'partially_refunded'];
const KINDS = ['donation', 'membership_new', 'membership_renew'];

/** Payments made on the public website through Razorpay. Test payments are labelled and never counted. */
export default async function PaymentsPage({ searchParams }) {
  await requireRole('accountant');
  const { t } = await getI18n();
  const term = textParam(searchParams?.q, 80);
  const status = oneOf(searchParams?.status, STATUSES);
  const kind = oneOf(searchParams?.kind, KINDS);
  const page = pageOf(searchParams);

  const w = new Where();
  if (status) w.add('p.status = ?', status);
  if (kind) w.add('p.payment_kind = ?', kind);
  if (term) {
    const like = w.param(likeParam(term));
    w.conds.push(`(p.payer_name ilike ${like} or p.payer_email ilike ${like} or p.payer_phone ilike ${like} or p.receipt_no ilike ${like}
      or p.membership_no ilike ${like} or p.razorpay_order_id ilike ${like} or p.razorpay_payment_id ilike ${like})`);
  }

  const [sum, rows] = await Promise.all([
    one(`select count(*)::int as n,
                coalesce(sum(p.amount) filter (where p.status = 'paid' and not p.is_test), 0) as real_total,
                count(*) filter (where p.status = 'paid' and not p.is_test)::int as real_n,
                count(*) filter (where p.is_test)::int as test_n
           from payments p ${w.sql}`, w.params),
    q(`select p.id, p.payer_name, p.payer_email, p.payer_phone, p.amount, p.payment_kind, p.status, p.receipt_no, p.membership_no,
              p.razorpay_payment_id, p.failure_reason, p.is_test, p.email_verified, coalesce(p.paid_at, p.created_at) as at,
              (select count(*)::int from receipt_emails re where re.payment_id = p.id and re.status = 'sent') as emails_sent
         from payments p ${w.sql}
        order by coalesce(p.paid_at, p.created_at) desc
        limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`, w.params),
  ]);

  return (
    <>
      <PageHead title={t('pay.title')} intro={t('pay.intro')} crumbs={[{ href: '/donations', label: t('inc.title') }, { label: t('pay.title') }]} />
      <Flash searchParams={searchParams} />
      {sum.test_n > 0 && <div style={{ marginBottom: '1rem' }}><Alert tone="info" title={t('pay.test_title', { n: sum.test_n })}>{t('pay.test_body')}</Alert></div>}

      <div className="tms-grid tms-grid--3" style={{ marginBottom: '1.25rem' }}>
        <Stat label={t('pay.real_total')} value={formatINR(sum.real_total)} note={t('pay.real_note', { n: formatNumber(sum.real_n) })} />
      </div>

      <FilterForm action="/payments">
        <TextField label={t('c.search')} name="q" type="search" defaultValue={term} placeholder={t('pay.search_ph')} maxLength={80} />
        <SelectField label={t('f.status')} name="status" defaultValue={status} placeholder={t('c.all')} options={STATUSES.map((s) => ({ value: s, label: t(`pstatus.${s}`) }))} />
        <SelectField label={t('f.kind')} name="kind" defaultValue={kind} placeholder={t('c.all')} options={KINDS.map((k) => ({ value: k, label: t(`pkind.${k}`) }))} />
      </FilterForm>

      {rows.length === 0 ? <Empty title={t('pay.none')} hint={t('c.try_filters')} /> : (
        <>
          <DataTable
            rows={rows}
            columns={[
              { label: t('f.date'), cell: (p) => fmtDateTime(p.at) },
              {
                label: t('inc.from_whom'), lead: true,
                cell: (p) => <>{p.payer_name} {p.is_test && <Badge tone="warn">{t('pay.test')}</Badge>}<span className="muted" style={{ display: 'block', fontWeight: 500 }}>{p.payer_email} · {p.payer_phone}</span></>,
              },
              { label: t('f.amount'), right: true, cell: (p) => <Money value={p.amount} /> },
              { label: t('f.kind'), cell: (p) => t(`pkind.${p.payment_kind}`) },
              {
                label: t('f.status'),
                cell: (p) => <><Badge tone={TONE_BY_STATUS[p.status]}>{t(`pstatus.${p.status}`)}</Badge>{p.failure_reason ? <span className="muted" style={{ display: 'block' }}>{p.failure_reason}</span> : null}</>,
              },
              {
                label: t('f.receipt_no'),
                cell: (p) => <><span className="mono">{p.receipt_no || '—'}</span>{p.membership_no ? <span className="mono" style={{ display: 'block' }}>{p.membership_no}</span> : null}{p.razorpay_payment_id ? <span className="mono muted" style={{ display: 'block' }}>{p.razorpay_payment_id}</span> : null}</>,
              },
              {
                label: t('pay.receipt'),
                cell: (p) => (p.status === 'paid' ? (
                  <div className="tms-actions">
                    <a href={`/api/receipt/${p.id}`} className="tms-btn tms-btn--secondary tms-btn--small"><Icon name="download" />{t('rcp.pdf')}</a>
                    <form action={resendOnlineReceipt}>
                      <input type="hidden" name="paymentId" value={p.id} />
                      <SubmitButton className="tms-btn tms-btn--quiet tms-btn--small" busyLabel={t('rcp.sending')}>
                        <Icon name="mail" />{p.emails_sent > 0 ? t('pay.resend_n', { n: p.emails_sent }) : t('pay.send')}
                      </SubmitButton>
                    </form>
                  </div>
                ) : '—'),
              },
            ]}
          />
          <Pager page={page} total={sum.n} pageSize={PAGE_SIZE} base="/payments" params={{ q: term, status, kind }} />
        </>
      )}
    </>
  );
}
