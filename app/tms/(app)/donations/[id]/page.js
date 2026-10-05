import Link from 'next/link';
import { notFound } from 'next/navigation';
import Icon from '../../../../../components/tms/icons';
import { Flash, OriginBadges, PageHead, SourceLink } from '../../../../../components/tms/blocks';
import { Alert, Badge, Card, KeyValues, TextField } from '../../../../../components/tms/ui';
import { ConfirmSubmit, SubmitButton } from '../../../../../components/tms/client';
import { requireRole, can } from '../../../../../lib/tms/auth';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { isUuid, one, q } from '../../../../../lib/tms/db';
import { amountInWords, fmtDate, fmtDateTime, formatINR, maskId, pick } from '../../../../../lib/tms/format';
import { deleteIncome, emailReceipt } from '../../../../../lib/tms/actions/income';

export const dynamic = 'force-dynamic';

/** One receipt of money: what, from whom, how, towards what, and its receipt. */
export default async function DonationPage({ params, searchParams }) {
  const admin = await requireRole('viewer');
  const { t, lang } = await getI18n();
  if (!isUuid(params.id)) notFound();

  const i = await one(
    `select i.*, p.name_en, p.name_mr, p.code as person_code, p.email as person_email,
            r.code as receipt_code, r.number_as_written as receipt_no, r.is_cancelled, r.origin as receipt_origin, r.series,
            b.bank, f.name_en as fund_en, f.name_mr as fund_mr, ev.name_en as event_en, ev.name_mr as event_mr,
            s.name_en as scheme_en, s.name_mr as scheme_mr, c.name_en as cat_en, c.name_mr as cat_mr,
            m.code as membership_code, a.name as created_by_name
       from income_entries i
       left join people p on p.id = i.person_id
       left join receipts r on r.id = i.receipt_id
       left join bank_accounts b on b.id = i.bank_account_id
       left join funds f on f.id = i.fund_id
       left join events ev on ev.id = i.event_id
       left join schemes s on s.id = i.scheme_id
       left join categories c on c.id = i.category_id
       left join memberships m on m.id = i.membership_id
       left join admin_users a on a.id = i.created_by
      where i.id = $1`, [params.id]);
  if (!i) notFound();

  const docs = await q('select id, file_name, size_bytes from documents where record_table = $1 and record_id = $2 and deleted_at is null order by created_at', ['income_entries', i.id]);
  const words = amountInWords(i.amount);
  const deleted = Boolean(i.deleted_at);
  const hasPdf = !deleted && i.receipt_code && i.receipt_origin === 'manual' && !i.is_cancelled;
  const payer = i.person_id ? pick(lang, i.name_mr, i.name_en) : (i.payer_as_written || t('c.unknown'));

  return (
    <>
      <PageHead title={`${t(`kind.${i.kind}`)}: ${formatINR(i.amount)}`} intro={payer} crumbs={[{ href: '/donations', label: t('inc.title') }, { label: i.code }]}>
        {hasPdf && <a href={`/api/tms/receipt/${i.id}`} className="tms-btn"><Icon name="download" />{t('rcp.pdf')}</a>}
        {!deleted && can(admin, 'editMoney') && <Link href={`/donations/${i.id}/edit`} className="tms-btn tms-btn--secondary">{t('c.edit')}</Link>}
      </PageHead>
      <Flash searchParams={searchParams} />

      <div className="tms-stack">
        {deleted && <Alert tone="error" title={t('inc.deleted')}>{t('inc.deleted_body', { date: fmtDateTime(i.deleted_at) })}</Alert>}
        {i.needs_review && !deleted && <Alert tone="warn">{t('c.needs_review_body')}</Alert>}

        <Card title={t('inc.details')}>
          <KeyValues items={[
            [t('f.amount'), <><strong className="num" style={{ fontSize: '1.5rem' }}>{formatINR(i.amount)}</strong>{words && <span className="muted" style={{ display: 'block', fontWeight: 500 }}>{words.mr}<br />{words.en}</span>}</>],
            [t('f.date'), fmtDate(i.entry_date)],
            [t('f.fy'), i.fy],
            [t('f.kind'), `${t(`kind.${i.kind}`)}${i.kind_as_written ? ` (${i.kind_as_written})` : ''}`],
            [t('inc.from_whom'), i.person_id ? <Link href={`/people/${i.person_id}`}>{payer} ({i.person_code})</Link> : payer],
            [t('inc.payer_written'), i.person_id && i.payer_as_written && i.payer_as_written !== i.name_en ? i.payer_as_written : ''],
            [t('f.mode'), `${i.mode ? t(`mode.${i.mode}`) : ''}${i.mode_as_written ? ` (${i.mode_as_written})` : ''}`.trim()],
            [t('inc.ref'), i.payment_ref],
            [t('inc.bank'), i.bank],
            [t('inc.purpose'), i.purpose_as_written],
            [t('f.fund'), pick(lang, i.fund_mr, i.fund_en)],
            [t('f.event'), i.event_id ? <Link href={`/events/${i.event_id}`}>{pick(lang, i.event_mr, i.event_en)}</Link> : ''],
            [t('f.scheme'), i.scheme_id ? <Link href={`/schemes/${i.scheme_id}`}>{pick(lang, i.scheme_mr, i.scheme_en)}</Link> : ''],
            [t('f.category'), pick(lang, i.cat_mr, i.cat_en)],
            [t('mem.no'), i.membership_code],
            can(admin, 'seeIdNumbers') ? [t('f.pan'), i.pan_as_written ? <span className="mono">{i.pan_as_written}</span> : ''] : [t('f.pan'), i.pan_as_written ? maskId(i.pan_as_written) : ''],
            [t('f.notes'), i.notes],
            [t('f.id'), <span className="mono">{i.code}</span>],
            [t('c.record'), <OriginBadges origin={i.origin} needsReview={i.needs_review} />],
            [t('c.entered_by'), i.created_by_name ? `${i.created_by_name}, ${fmtDateTime(i.created_at)}` : ''],
          ]} />
          <div className="tms-actions no-print" style={{ marginTop: '1rem' }}><SourceLink table="income_entries" id={i.id} /></div>
        </Card>

        <Card title={t('rcp.title')}>
          {!i.receipt_code ? <p className="muted">{t('rcp.none')}</p> : (
            <>
              <KeyValues items={[
                [t('f.receipt_no'), <span className="mono">{i.receipt_no || i.receipt_code}</span>],
                [t('f.id'), <span className="mono">{i.receipt_code}</span>],
                [t('f.status'), i.is_cancelled ? <Badge tone="error">{t('status.cancelled')}</Badge> : <Badge tone="ok">{t('rcp.valid')}</Badge>],
              ]} />
              {i.receipt_origin !== 'manual' && <p className="tms-hint">{t('rcp.old_book')}</p>}
              {hasPdf && (
                <div className="tms-actions no-print" style={{ marginTop: '1rem' }}>
                  <a href={`/api/tms/receipt/${i.id}`} className="tms-btn"><Icon name="print" />{t('rcp.reprint')}</a>
                  {can(admin, 'enterMoney') && (i.person_email ? (
                    <form action={emailReceipt}>
                      <input type="hidden" name="id" value={i.id} />
                      <SubmitButton className="tms-btn tms-btn--secondary" busyLabel={t('rcp.sending')}><Icon name="mail" />{t('rcp.email_to', { email: i.person_email })}</SubmitButton>
                    </form>
                  ) : <span className="muted">{t('rcp.no_email')}</span>)}
                </div>
              )}
            </>
          )}
        </Card>

        {docs.length > 0 && (
          <Card title={t('doc.title')}>
            <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
              {docs.map((d) => <li key={d.id}><a href={`/api/tms/documents/${d.id}`}>{d.file_name}</a> <span className="muted">({Math.ceil(Number(d.size_bytes) / 1024)} KB)</span></li>)}
            </ul>
          </Card>
        )}

        {!deleted && can(admin, 'deleteMoney') && (
          <Card title={t('del.title')} className="no-print">
            <p className="muted" style={{ marginBottom: '0.75rem' }}>{t('del.income_body')}</p>
            <form action={deleteIncome} style={{ maxWidth: '34rem' }}>
              <input type="hidden" name="id" value={i.id} />
              <TextField label={t('del.reason')} name="reason" required minLength={3} maxLength={300} placeholder={t('del.reason_ph')} />
              <ConfirmSubmit label={t('del.button')} message={t('del.confirm_income', { amount: formatINR(i.amount), name: payer })} yes={t('del.yes')} />
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
