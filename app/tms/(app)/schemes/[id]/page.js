import Link from 'next/link';
import { notFound } from 'next/navigation';
import Icon from '../../../../../components/tms/icons';
import { DataTable, Flash, OriginBadges, PageHead } from '../../../../../components/tms/blocks';
import { Alert, Badge, Card, Empty, Money, SelectField, TextField } from '../../../../../components/tms/ui';
import { PrintButton, SubmitButton } from '../../../../../components/tms/client';
import { requireRole, can } from '../../../../../lib/tms/auth';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { isUuid, one, q } from '../../../../../lib/tms/db';
import { fmtDate, formatINR, formatNumber, pick, todayIso } from '../../../../../lib/tms/format';
import { TONE_BY_STATUS } from '../../../../../lib/tms/constants';
import { markDisbursementPaid, saveApplication, setApplicationStatus } from '../../../../../lib/tms/actions/assets';

export const dynamic = 'force-dynamic';

const APP_STATUSES = ['received', 'approved', 'rejected', 'disbursed'];

/** One scheme: year-wise totals, every payment (paid or planned), and applications. */
export default async function SchemePage({ params, searchParams }) {
  const admin = await requireRole('viewer');
  const { t, lang } = await getI18n();
  if (!isUuid(params.id)) notFound();
  const s = await one('select * from schemes where id = $1', [params.id]);
  if (!s) notFound();
  const mayEnter = can(admin, 'enterMoney');

  const [byFy, disbursements, applications] = await Promise.all([
    q(`select fy, disbursements::int as payments, beneficiaries::int as beneficiaries, disbursed, planned
         from v_scheme_totals where scheme_id = $1 and (disbursements > 0 or planned > 0) order by fy nulls last`, [s.id]),
    q(`select d.id, d.code, d.disbursed_on, d.fy, d.amount, d.status, d.beneficiary_as_written, d.beneficiary_count, d.institution,
              d.origin, d.needs_review, p.id as person_id, p.name_en, p.name_mr
         from scheme_disbursements d left join people p on p.id = d.person_id
        where d.scheme_id = $1 and d.deleted_at is null
        order by d.disbursed_on desc nulls last, d.created_at desc limit 300`, [s.id]),
    q(`select a.id, a.code, a.applied_on, a.fy, a.status, a.applicant_as_written, a.institution, a.origin, a.needs_review, p.id as person_id, p.name_en, p.name_mr
         from scheme_applications a left join people p on p.id = a.person_id
        where a.scheme_id = $1 and a.deleted_at is null order by a.applied_on desc nulls last limit 200`, [s.id]),
  ]);
  const paid = byFy.reduce((a, r) => a + Number(r.disbursed), 0);
  const planned = byFy.reduce((a, r) => a + Number(r.planned), 0);
  const name = pick(lang, s.name_mr, s.name_en);
  const who = (r, written) => (r.person_id ? <Link href={`/people/${r.person_id}`}>{pick(lang, r.name_mr, r.name_en)}</Link> : (written || '—'));

  return (
    <>
      <PageHead title={name} intro={s.description || undefined} crumbs={[{ href: '/schemes', label: t('sch.title') }, { label: s.code }]}>
        {mayEnter && <Link href={`/schemes/${s.id}/disburse`} className="tms-btn"><Icon name="plus" />{t('dsb.add')}</Link>}
        <PrintButton label={t('c.print')} />
      </PageHead>
      <Flash searchParams={searchParams} />

      <div className="tms-stack">
        <section aria-labelledby="sc-fy">
          <h2 id="sc-fy" style={{ marginBottom: '0.5rem' }}>{t('sch.by_fy')}</h2>
          {byFy.length === 0 ? <Empty title={t('sch.no_payments')} /> : (
            <DataTable
              rows={byFy}
              columns={[
                { label: t('f.fy'), lead: true, cell: (r) => r.fy || t('sch.undated') },
                { label: t('rep.c.payments'), right: true, cell: (r) => formatNumber(r.payments) },
                { label: t('rep.c.beneficiaries'), right: true, cell: (r) => formatNumber(r.beneficiaries) },
                { label: t('sch.paid'), right: true, cell: (r) => <Money value={r.disbursed} /> },
                { label: t('sch.planned'), right: true, cell: (r) => (Number(r.planned) > 0 ? <Money value={r.planned} /> : '—') },
              ]}
              footer={[t('c.total'), '', '', formatINR(paid), formatINR(planned)]}
            />
          )}
          {planned > 0 && <div style={{ marginTop: '0.75rem' }}><Alert tone="info">{t('rep.n.planned')}</Alert></div>}
        </section>

        <section aria-labelledby="sc-dsb">
          <h2 id="sc-dsb" style={{ marginBottom: '0.5rem' }}>{t('dsb.title')} ({disbursements.length})</h2>
          {disbursements.length === 0 ? <p className="muted">{t('sch.no_payments')}</p> : (
            <DataTable
              rows={disbursements} hrefFor={(d) => `/source/scheme_disbursements/${d.id}`} openLabel={t('src.link_short')}
              columns={[
                { label: t('f.date'), cell: (d) => fmtDate(d.disbursed_on) },
                { label: t('dsb.to_whom'), lead: true, cell: (d) => <>{who(d, d.beneficiary_as_written)}{d.beneficiary_count ? <span className="muted"> ({t('dsb.count_n', { n: d.beneficiary_count })})</span> : null}</> },
                { label: t('f.amount'), right: true, cell: (d) => <Money value={d.amount} /> },
                {
                  label: t('f.status'),
                  cell: (d) => (
                    <>
                      <Badge tone={TONE_BY_STATUS[d.status]}>{t(`dstatus.${d.status}`)}</Badge> <OriginBadges origin={null} needsReview={d.needs_review} />
                      {mayEnter && d.status === 'planned' && (
                        <form action={markDisbursementPaid} className="tms-actions no-print" style={{ marginTop: '0.4rem' }}>
                          <input type="hidden" name="id" value={d.id} />
                          <input type="hidden" name="scheme_id" value={s.id} />
                          <label className="sr-only" htmlFor={`paid-${d.id}`}>{t('dsb.paid_on')}</label>
                          <input className="tms-input" style={{ maxWidth: '12rem', minHeight: '48px' }} id={`paid-${d.id}`} name="disbursed_on" type="date" required defaultValue={todayIso()} max={todayIso()} />
                          <SubmitButton className="tms-btn tms-btn--small">{t('dsb.mark_paid')}</SubmitButton>
                        </form>
                      )}
                    </>
                  ),
                },
                { label: t('dsb.institution'), cell: (d) => d.institution || '—' },
                { label: t('f.id'), cell: (d) => <span className="mono">{d.code}</span> },
              ]}
            />
          )}
        </section>

        <section aria-labelledby="sc-app">
          <h2 id="sc-app" style={{ marginBottom: '0.5rem' }}>{t('app.title')} ({applications.length})</h2>
          {applications.length === 0 ? <p className="muted">{t('app.none')}</p> : (
            <DataTable
              rows={applications}
              columns={[
                { label: t('app.applied_on'), cell: (a) => fmtDate(a.applied_on) },
                { label: t('app.applicant'), lead: true, cell: (a) => who(a, a.applicant_as_written) },
                { label: t('dsb.institution'), cell: (a) => a.institution || '—' },
                {
                  label: t('f.status'),
                  cell: (a) => (mayEnter ? (
                    <form action={setApplicationStatus} className="tms-actions">
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="scheme_id" value={s.id} />
                      <label className="sr-only" htmlFor={`st-${a.id}`}>{t('f.status')}</label>
                      <select className="tms-select" style={{ maxWidth: '12rem', minHeight: '48px' }} id={`st-${a.id}`} name="status" defaultValue={APP_STATUSES.includes(a.status) ? a.status : 'received'}>
                        {APP_STATUSES.map((x) => <option key={x} value={x}>{t(`astatus.${x}`)}</option>)}
                      </select>
                      <SubmitButton className="tms-btn tms-btn--quiet tms-btn--small">{t('c.save')}</SubmitButton>
                    </form>
                  ) : <Badge tone={TONE_BY_STATUS[a.status]}>{t(`astatus.${a.status}`)}</Badge>),
                },
                { label: t('f.id'), cell: (a) => <span className="mono">{a.code}</span> },
              ]}
            />
          )}

          {mayEnter && (
            <Card title={t('app.add')} className="no-print" style={{ marginTop: '1rem', maxWidth: '40rem' }}>
              <form action={saveApplication}>
                <input type="hidden" name="scheme_id" value={s.id} />
                <TextField label={t('app.applicant')} name="applicant" required minLength={2} maxLength={160} placeholder="Asha Suresh Pradhan" />
                <TextField label={t('app.applied_on')} name="applied_on" type="date" required defaultValue={todayIso()} max={todayIso()} />
                <TextField label={t('dsb.institution')} name="institution" optional={t('c.optional')} maxLength={200} placeholder={t('dsb.institution_ph')} />
                <SelectField label={t('f.status')} name="status" required options={APP_STATUSES.map((x) => ({ value: x, label: t(`astatus.${x}`) }))} />
                <SubmitButton>{t('c.save')}</SubmitButton>
              </form>
            </Card>
          )}
        </section>
      </div>
    </>
  );
}
