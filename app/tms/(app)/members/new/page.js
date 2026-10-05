import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Flash, PageHead } from '../../../../../components/tms/blocks';
import { Alert, Card, Field, KeyValues, SelectField, TextAreaField, TextField } from '../../../../../components/tms/ui';
import { AmountInput, SubmitButton } from '../../../../../components/tms/client';
import { requireRole } from '../../../../../lib/tms/auth';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { isUuid, oneOf, one } from '../../../../../lib/tms/db';
import { fmtDate, formatINR, pick, todayIso } from '../../../../../lib/tms/format';
import { options } from '../../../../../lib/tms/lookups';
import { MODES, TIERS } from '../../../../../lib/tms/schemas';
import { computeNewMembership } from '../../../../../lib/pricing';
import { saveMembership } from '../../../../../lib/tms/actions/people';

export const dynamic = 'force-dynamic';

const isIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());

/** New membership in three screens: who, which tier and from when, then the fee and a final check. */
export default async function NewMembershipPage({ searchParams }) {
  await requireRole('accountant');
  const { t, lang } = await getI18n();
  const crumbs = [{ href: '/members', label: t('mem.title') }, { label: t('mem.new_title') }];
  const personId = String(searchParams?.person || '');

  if (!personId) {
    return (
      <>
        <PageHead title={t('mem.new_title')} intro={t('mem.new_pick')} crumbs={crumbs} />
        <div className="tms-actions">
          <Link href="/people" className="tms-btn tms-btn--big">{t('mem.find_person')}</Link>
          <Link href="/people/new" className="tms-btn tms-btn--secondary tms-btn--big">{t('people.add')}</Link>
        </div>
      </>
    );
  }
  if (!isUuid(personId)) notFound();
  const person = await one(
    `select p.id, p.code, p.name_en, p.name_mr,
            exists (select 1 from memberships m where m.person_id = p.id and m.deleted_at is null and m.status = 'active') as has_active
       from people p where p.id = $1 and p.deleted_at is null and p.merged_into_id is null`, [personId]);
  if (!person) notFound();
  const name = pick(lang, person.name_mr, person.name_en);

  const tier = oneOf(searchParams?.tier, TIERS);
  const start = isIso(searchParams?.start) && searchParams.start <= todayIso() && searchParams.start >= '2000-01-01' ? searchParams.start : '';

  if (person.has_active) {
    return (
      <>
        <PageHead title={t('mem.new_title')} crumbs={crumbs} />
        <Alert tone="warn" title={t('mem.already', { name })}>
          <Link href={`/people/${person.id}`}>{t('mem.open_person')}</Link>
        </Alert>
      </>
    );
  }

  if (!tier || !start) {
    return (
      <>
        <PageHead title={t('mem.new_title')} intro={t('mem.new_step1', { name })} crumbs={crumbs} />
        <Flash searchParams={searchParams} />
        <form method="get" action="/members/new" className="tms-wizard">
          <input type="hidden" name="person" value={person.id} />
          <fieldset style={{ border: 0, padding: 0, margin: '0 0 1.25rem' }}>
            <legend className="tms-label">{t('f.tier')}</legend>
            <div className="tms-choices">
              {TIERS.map((x) => (
                <label key={x} className="tms-choice">
                  <input type="radio" name="tier" value={x} required defaultChecked={tier === x} />
                  <span>{t(`tier.${x}`)}<span className="muted" style={{ display: 'block', fontWeight: 500 }}>{t(`mem.fee_${x}`)}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <TextField label={t('mem.start')} name="start" type="date" required defaultValue={start || todayIso()} max={todayIso()} hint={t('f.date_hint')} />
          <div className="tms-wizard-nav">
            <Link href={`/people/${person.id}`} className="tms-btn tms-btn--quiet">{t('c.cancel')}</Link>
            <button type="submit" className="tms-btn tms-btn--big">{t('mem.see_fee')} ›</button>
          </div>
        </form>
      </>
    );
  }

  const [y, m, d] = start.split('-').map(Number);
  const terms = computeNewMembership(tier, new Date(y, m - 1, d));
  const back = `/members/new?person=${person.id}`;

  return (
    <>
      <PageHead title={t('mem.confirm_title')} intro={t('mem.confirm_intro')} crumbs={crumbs} />
      <Flash searchParams={searchParams} />
      <div className="tms-stack" style={{ maxWidth: '46rem' }}>
        <Card title={t('mem.summary')}>
          <KeyValues items={[
            [t('f.name'), `${name} (${person.code})`],
            [t('f.tier'), t(`tier.${tier}`)],
            [t('mem.from'), fmtDate(terms.validFrom)],
            [t('mem.till'), terms.validTill ? fmtDate(terms.validTill) : t('mem.lifetime')],
            [t('mem.fee'), formatINR(terms.membershipFee)],
            [t('mem.reg_fee'), formatINR(terms.registrationFee)],
            [t('mem.fee_total'), <strong key="t" className="num">{formatINR(terms.totalAmount)}</strong>],
          ]} />
          <p className="tms-hint">{t('mem.rule_note')}</p>
        </Card>

        <form action={saveMembership} className="tms-wizard">
          <input type="hidden" name="person_id" value={person.id} />
          <input type="hidden" name="tier" value={tier} />
          <input type="hidden" name="entry_date" value={start} />
          <Field label={t('mem.amount_received')} htmlFor="f-amount" hint={t('mem.amount_hint')}>
            <AmountInput id="f-amount" name="amount" defaultValue={String(terms.totalAmount)} required />
          </Field>
          <SelectField label={t('f.mode')} name="mode" required placeholder={t('c.choose')} options={options.keyed(MODES, t, 'mode')} />
          <TextField label={t('inc.ref')} name="payment_ref" optional={t('c.optional')} hint={t('inc.ref_hint')} maxLength={80} placeholder="123456" />
          <TextAreaField label={t('f.notes')} name="notes" optional={t('c.optional')} maxLength={500} />
          <Alert tone="info">{t('mem.will_create')}</Alert>
          <div className="tms-wizard-nav">
            <Link href={back} className="tms-btn tms-btn--quiet">{t('wz.fix')}</Link>
            <SubmitButton className="tms-btn tms-btn--ok tms-btn--big">{t('mem.save')}</SubmitButton>
          </div>
        </form>
      </div>
    </>
  );
}
