import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Flash, OriginBadges, PageHead, SourceLink } from '../../../../../components/tms/blocks';
import { Alert, Card, KeyValues, TextField } from '../../../../../components/tms/ui';
import { ConfirmSubmit, PrintButton } from '../../../../../components/tms/client';
import { requireRole, can } from '../../../../../lib/tms/auth';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { isUuid, one, q } from '../../../../../lib/tms/db';
import { amountInWords, fmtDate, fmtDateTime, formatINR, pick } from '../../../../../lib/tms/format';
import { deleteExpense } from '../../../../../lib/tms/actions/expenses';

export const dynamic = 'force-dynamic';

/** One payment voucher. */
export default async function ExpensePage({ params, searchParams }) {
  const admin = await requireRole('viewer');
  const { t, lang } = await getI18n();
  if (!isUuid(params.id)) notFound();

  const e = await one(
    `select e.*, p.name_en, p.name_mr, p.code as person_code, c.name_en as cat_en, c.name_mr as cat_mr, b.bank,
            ev.name_en as event_en, ev.name_mr as event_mr, s.name_en as scheme_en, s.name_mr as scheme_mr,
            f.name_en as fund_en, f.name_mr as fund_mr, a.name as created_by_name
       from expenses e
       left join people p on p.id = e.payee_person_id
       left join categories c on c.id = e.category_id
       left join bank_accounts b on b.id = e.bank_account_id
       left join events ev on ev.id = e.event_id
       left join schemes s on s.id = e.scheme_id
       left join funds f on f.id = e.fund_id
       left join admin_users a on a.id = e.created_by
      where e.id = $1`, [params.id]);
  if (!e) notFound();

  const docs = await q('select id, file_name, size_bytes from documents where record_table = $1 and record_id = $2 and deleted_at is null order by created_at', ['expenses', e.id]);
  const words = amountInWords(e.amount);
  const deleted = Boolean(e.deleted_at);
  const payee = e.payee_person_id ? pick(lang, e.name_mr, e.name_en) : (e.payee_as_written || t('c.unknown'));

  return (
    <>
      <PageHead title={`${t('exp.voucher')}: ${formatINR(e.amount)}`} intro={payee} crumbs={[{ href: '/expenses', label: t('exp.title') }, { label: e.code }]}>
        <PrintButton label={t('c.print')} />
        {!deleted && can(admin, 'editMoney') && <Link href={`/expenses/${e.id}/edit`} className="tms-btn tms-btn--secondary">{t('c.edit')}</Link>}
      </PageHead>
      <Flash searchParams={searchParams} />

      <div className="tms-stack">
        {deleted && <Alert tone="error" title={t('exp.deleted')}>{t('inc.deleted_body', { date: fmtDateTime(e.deleted_at) })}</Alert>}
        {e.needs_review && !deleted && <Alert tone="warn">{t('c.needs_review_body')}</Alert>}

        <Card title={t('exp.details')}>
          <KeyValues items={[
            [t('f.amount'), <><strong className="num" style={{ fontSize: '1.5rem' }}>{formatINR(e.amount)}</strong>{words && <span className="muted" style={{ display: 'block', fontWeight: 500 }}>{words.mr}<br />{words.en}</span>}</>],
            [t('exp.cash_part'), e.cash_amount != null && Number(e.cash_amount) > 0 ? formatINR(e.cash_amount) : ''],
            [t('exp.bank_part'), e.bank_amount != null && Number(e.bank_amount) > 0 ? formatINR(e.bank_amount) : ''],
            [t('f.date'), fmtDate(e.entry_date)],
            [t('f.fy'), e.fy],
            [t('exp.payee'), e.payee_person_id ? <Link href={`/people/${e.payee_person_id}`}>{payee} ({e.person_code})</Link> : payee],
            [t('exp.particulars'), e.particulars],
            [t('f.category'), pick(lang, e.cat_mr, e.cat_en) || e.head_as_written],
            [t('exp.head_written'), e.category_id && e.head_as_written ? e.head_as_written : ''],
            [t('f.mode'), `${e.mode ? t(`mode.${e.mode}`) : ''}${e.mode_as_written ? ` (${e.mode_as_written})` : ''}`.trim()],
            [t('exp.cheque_no'), e.cheque_no],
            [t('exp.bank'), e.bank],
            [t('exp.voucher_no'), e.voucher_no_as_written],
            [t('f.event'), e.event_id ? <Link href={`/events/${e.event_id}`}>{pick(lang, e.event_mr, e.event_en)}</Link> : ''],
            [t('f.scheme'), e.scheme_id ? <Link href={`/schemes/${e.scheme_id}`}>{pick(lang, e.scheme_mr, e.scheme_en)}</Link> : ''],
            [t('f.fund'), pick(lang, e.fund_mr, e.fund_en)],
            [t('exp.approved_by'), e.approved_by],
            [t('f.notes'), e.notes],
            [t('f.id'), <span className="mono">{e.code}</span>],
            [t('c.record'), <OriginBadges origin={e.origin} needsReview={e.needs_review} />],
            [t('c.entered_by'), e.created_by_name ? `${e.created_by_name}, ${fmtDateTime(e.created_at)}` : ''],
          ]} />
          <div className="tms-actions no-print" style={{ marginTop: '1rem' }}><SourceLink table="expenses" id={e.id} /></div>
        </Card>

        <Card title={t('doc.title')}>
          {docs.length === 0 ? <p className="muted">{t('doc.none')}</p> : (
            <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
              {docs.map((d) => <li key={d.id}><a href={`/api/tms/documents/${d.id}`}>{d.file_name}</a> <span className="muted">({Math.ceil(Number(d.size_bytes) / 1024)} KB)</span></li>)}
            </ul>
          )}
        </Card>

        {!deleted && can(admin, 'deleteMoney') && (
          <Card title={t('del.title')} className="no-print">
            <p className="muted" style={{ marginBottom: '0.75rem' }}>{t('del.expense_body')}</p>
            <form action={deleteExpense} style={{ maxWidth: '34rem' }}>
              <input type="hidden" name="id" value={e.id} />
              <TextField label={t('del.reason')} name="reason" required minLength={3} maxLength={300} placeholder={t('del.reason_ph')} />
              <ConfirmSubmit label={t('del.button')} message={t('del.confirm_expense', { amount: formatINR(e.amount), name: payee })} yes={t('del.yes')} />
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
