import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Flash, PageHead } from '../../../../../../components/tms/blocks';
import { Alert, Card, Field, KeyValues, SelectField, TextAreaField, TextField } from '../../../../../../components/tms/ui';
import { AmountInput, SubmitButton } from '../../../../../../components/tms/client';
import { requireRole } from '../../../../../../lib/tms/auth';
import { getI18n } from '../../../../../../lib/tms/i18n/server';
import { isUuid, one } from '../../../../../../lib/tms/db';
import { fmtDate, formatINR, isoDate, pick, todayIso } from '../../../../../../lib/tms/format';
import { options } from '../../../../../../lib/tms/lookups';
import { MODES, TIERS } from '../../../../../../lib/tms/schemas';
import { computeRenewal } from '../../../../../../lib/pricing';
import { renewMembership } from '../../../../../../lib/tms/actions/people';

export const dynamic = 'force-dynamic';

/** Renewal: shows the new validity and fee worked out by the trust's rule, then records the payment. */
export default async function RenewPage({ params, searchParams }) {
  await requireRole('accountant');
  const { t, lang } = await getI18n();
  if (!isUuid(params.id)) notFound();
  const m = await one(
    `select m.id, m.code, m.tier, m.status, m.expiry_date, m.person_id, p.name_en, p.name_mr, p.code as person_code
       from memberships m join people p on p.id = m.person_id where m.id = $1 and m.deleted_at is null`, [params.id]);
  if (!m) notFound();
  const name = pick(lang, m.name_mr, m.name_en);
  const crumbs = [{ href: '/members', label: t('mem.title') }, { href: `/people/${m.person_id}`, label: name }, { label: t('mem.renew') }];

  if (!m.expiry_date || !TIERS.includes(m.tier) || m.tier === 'platinum') {
    return (
      <>
        <PageHead title={t('mem.renew')} crumbs={crumbs} />
        <Alert tone="warn" title={t('mem.cannot_renew')}><Link href={`/people/${m.person_id}`}>{t('mem.open_person')}</Link></Alert>
      </>
    );
  }
  const terms = computeRenewal(m.tier, isoDate(m.expiry_date));

  return (
    <>
      <PageHead title={t('mem.renew_title', { name })} intro={t('mem.confirm_intro')} crumbs={crumbs} />
      <Flash searchParams={searchParams} />
      <div className="tms-stack" style={{ maxWidth: '46rem' }}>
        <Card title={t('mem.summary')}>
          <KeyValues items={[
            [t('f.name'), `${name} (${m.person_code})`],
            [t('mem.no'), m.code],
            [t('f.tier'), t(`tier.${m.tier}`)],
            [t('mem.till_now'), fmtDate(m.expiry_date)],
            [t('mem.till_new'), <strong key="n">{fmtDate(terms.validTill)}</strong>],
            [t('mem.fee_total'), <strong key="t" className="num">{formatINR(terms.totalAmount)}</strong>],
          ]} />
          <p className="tms-hint">{t('mem.rule_note')}</p>
        </Card>

        <form action={renewMembership} className="tms-wizard">
          <input type="hidden" name="membership_id" value={m.id} />
          <Field label={t('mem.amount_received')} htmlFor="f-amount" hint={t('mem.amount_hint')}>
            <AmountInput id="f-amount" name="amount" defaultValue={String(terms.totalAmount)} required />
          </Field>
          <TextField label={t('inc.date')} name="entry_date" type="date" required defaultValue={todayIso()} max={todayIso()} />
          <SelectField label={t('f.mode')} name="mode" required placeholder={t('c.choose')} options={options.keyed(MODES, t, 'mode')} />
          <TextField label={t('inc.ref')} name="payment_ref" optional={t('c.optional')} hint={t('inc.ref_hint')} maxLength={80} placeholder="123456" />
          <TextAreaField label={t('f.notes')} name="notes" optional={t('c.optional')} maxLength={500} />
          <Alert tone="info">{t('mem.will_renew')}</Alert>
          <div className="tms-wizard-nav">
            <Link href={`/people/${m.person_id}`} className="tms-btn tms-btn--quiet">{t('c.cancel')}</Link>
            <SubmitButton className="tms-btn tms-btn--ok tms-btn--big">{t('mem.save_renewal')}</SubmitButton>
          </div>
        </form>
      </div>
    </>
  );
}
