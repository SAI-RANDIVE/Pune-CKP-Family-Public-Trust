import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Flash, PageHead } from '../../../../../../components/tms/blocks';
import { Alert, Badge, Card, KeyValues } from '../../../../../../components/tms/ui';
import { ConfirmSubmit, SubmitButton } from '../../../../../../components/tms/client';
import { requireRole, hasOtpGrant } from '../../../../../../lib/tms/auth';
import { getI18n } from '../../../../../../lib/tms/i18n/server';
import { isUuid, one, q } from '../../../../../../lib/tms/db';
import { fmtDate, formatINR, formatNumber, maskId, pick } from '../../../../../../lib/tms/format';
import { mergePeople, notSamePerson } from '../../../../../../lib/tms/actions/review';

export const dynamic = 'force-dynamic';

const loadSide = (id) => one(
  `select p.*,
          (select count(*) from memberships m where m.person_id = p.id and m.deleted_at is null)::int as memberships,
          (select string_agg(m.code || ' ' || m.tier || ' ' || m.status, ', ') from memberships m where m.person_id = p.id and m.deleted_at is null) as membership_list,
          (select count(*) from income_entries i where i.person_id = p.id and i.deleted_at is null)::int as receipts,
          (select coalesce(sum(i.amount), 0) from income_entries i where i.person_id = p.id and i.deleted_at is null) as received,
          (select count(*) from scheme_disbursements d where d.person_id = p.id and d.deleted_at is null)::int as disbursements,
          (select count(*) from expenses e where e.payee_person_id = p.id and e.deleted_at is null)::int as vouchers,
          (select count(*) from trust_officers o where o.person_id = p.id and o.deleted_at is null)::int as offices
     from people p where p.id = $1`, [id]);

/** Two people records side by side, to decide whether they are one person. */
export default async function DuplicatePage({ params, searchParams }) {
  const admin = await requireRole('admin');
  const { t, lang } = await getI18n();
  if (!isUuid(params.id)) notFound();
  const c = await one('select * from person_merge_candidates where id = $1', [params.id]);
  if (!c) notFound();

  const [a, b, variants, granted] = await Promise.all([
    loadSide(c.person_a), loadSide(c.person_b),
    q('select person_id, name from person_name_variants where person_id = any($1::uuid[]) order by name', [[c.person_a, c.person_b]]),
    hasOtpGrant(admin),
  ]);
  if (!a || !b) notFound();
  const open = c.status === 'open' && !a.deleted_at && !b.deleted_at;
  const diff = (key) => String(a[key] ?? '') !== String(b[key] ?? '') && a[key] && b[key];

  const side = (p, letter) => {
    const name = pick(lang, p.name_mr, p.name_en);
    return (
      <Card title={`${letter}. ${name}`}>
        <KeyValues items={[
          [t('f.id'), <span className="mono">{p.code}</span>],
          [t('pf.name_en'), p.name_en],
          [t('pf.name_mr'), p.name_mr],
          [t('person.other_names'), variants.filter((v) => v.person_id === p.id && v.name !== p.name_en).map((v) => v.name).join('; ')],
          [t('f.phone'), [p.phone, p.phone_alt].filter(Boolean).join(', ')],
          [t('f.email'), p.email],
          [t('f.address'), [p.address, p.city, p.pincode].filter(Boolean).join(', ')],
          [t('pf.dob'), p.date_of_birth ? fmtDate(p.date_of_birth) : ''],
          [t('f.pan'), p.pan ? maskId(p.pan) : ''],
          [t('f.aadhaar'), p.aadhaar ? maskId(p.aadhaar) : ''],
          [t('pf.roles'), (p.roles || []).map((r) => t(`prole.${r}`)).join(', ')],
          [t('person.memberships'), p.memberships ? `${formatNumber(p.memberships)}: ${p.membership_list}` : t('c.none')],
          [t('person.income'), p.receipts ? `${formatNumber(p.receipts)} · ${formatINR(p.received)}` : t('c.none')],
          [t('person.disbursements'), p.disbursements ? formatNumber(p.disbursements) : ''],
          [t('person.paid_to'), p.vouchers ? formatNumber(p.vouchers) : ''],
          [t('person.offices'), p.offices ? formatNumber(p.offices) : ''],
        ]} />
        <div className="tms-actions no-print" style={{ marginTop: '1rem' }}>
          {!p.deleted_at && <Link href={`/people/${p.id}`} className="tms-btn tms-btn--quiet tms-btn--small">{t('dup.open_person')}</Link>}
          {open && (
            <form action={mergePeople}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="keep" value={letter === 'A' ? 'a' : 'b'} />
              <ConfirmSubmit
                label={t('dup.keep', { letter })} className="tms-btn tms-btn--ok" yes={t('dup.yes_merge')}
                message={t('dup.confirm', { keep: name, drop: letter === 'A' ? pick(lang, b.name_mr, b.name_en) : pick(lang, a.name_mr, a.name_en) })}
              />
            </form>
          )}
        </div>
      </Card>
    );
  };

  return (
    <>
      <PageHead title={t('dup.compare_title')} intro={t('dup.compare_intro')} crumbs={[{ href: '/review', label: t('rq.title') }, { href: '/review/duplicates', label: t('dup.title') }, { label: t('dup.compare') }]} />
      <Flash searchParams={searchParams} />

      <div className="tms-stack">
        <p>
          <Badge tone={c.status === 'open' ? 'warn' : 'neutral'}>{t(`dup.s_${c.status}`)}</Badge>{' '}
          {t('dup.score')}: <strong>{Number(c.score).toFixed(0)}</strong>
          {c.evidence?.same_phone ? ` · ${t('dup.same_phone')}` : ''}{c.evidence?.rule ? ` · ${String(c.evidence.rule).replace(/_/g, ' ')}` : ''}
        </p>
        {['phone', 'email', 'pan', 'aadhaar', 'date_of_birth'].some(diff) && <Alert tone="warn" title={t('dup.differs')}>{t('dup.differs_body')}</Alert>}
        {open && !granted && <Alert tone="info">{t('dup.needs_code')} <a href={`/verify?next=${encodeURIComponent(`/review/duplicates/${c.id}`)}`}>{t('otp.get_now')}</a></Alert>}

        <div className="tms-grid tms-grid--2">
          {side(a, 'A')}
          {side(b, 'B')}
        </div>

        {open && (
          <Card title={t('dup.not_same_title')} className="no-print">
            <p className="muted" style={{ marginBottom: '0.75rem' }}>{t('dup.not_same_body')}</p>
            <form action={notSamePerson}>
              <input type="hidden" name="id" value={c.id} />
              <SubmitButton className="tms-btn tms-btn--secondary">{t('dup.not_same')}</SubmitButton>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
