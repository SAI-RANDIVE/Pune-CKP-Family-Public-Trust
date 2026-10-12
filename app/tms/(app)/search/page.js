import Link from 'next/link';
import { redirect } from 'next/navigation';
import Icon from '../../../../components/tms/icons';
import { PageHead } from '../../../../components/tms/blocks';
import { Badge, Card, Empty } from '../../../../components/tms/ui';
import { requireRole } from '../../../../lib/tms/auth';
import { areaOfTable, canSee } from '../../../../lib/tms/access';
import { getI18n } from '../../../../lib/tms/i18n/server';
import { textParam } from '../../../../lib/tms/db';
import { fmtDate, formatINR, maskPhone, pick } from '../../../../lib/tms/format';
import { searchNumbers, searchPeople } from '../../../../lib/tms/search';
import { hrefForRecord } from '../../../../lib/tms/records';
import { TONE_BY_STATUS } from '../../../../lib/tms/constants';

export const dynamic = 'force-dynamic';

function Result({ href, title, lines, badge }) {
  return (
    <li>
      <Link href={href} className="tms-pick" style={{ display: 'block', textDecoration: 'none' }}>
        <strong>{title} {badge}</strong>
        {lines.filter(Boolean).map((line, i) => <span key={i} className="muted" style={{ display: 'block' }}>{line}</span>)}
      </Link>
    </li>
  );
}

/** One box for everything: a name in Marathi or English, a phone number, any trust ID or old register number. */
export default async function SearchPage({ searchParams }) {
  const admin = await requireRole('viewer');
  const { t, lang } = await getI18n();
  const term = textParam(searchParams?.q, 80);

  let people = [];
  let numbers = null;
  if (term.length >= 2) {
    [people, numbers] = await Promise.all([searchPeople(term, 20), searchNumbers(term)]);
    // A section this login cannot open does not appear in its search results either.
    const sees = (table) => canSee(admin, areaOfTable(table));
    if (!sees('people')) people = [];
    numbers.codes = numbers.codes.filter((c) => sees(c.record_table));
    if (!sees('memberships')) numbers.memberships = [];
    if (!sees('receipts')) numbers.receipts = [];
    if (!sees('expenses')) numbers.vouchers = [];
    if (!sees('fixed_deposits')) numbers.deposits = [];
    numbers.exact = numbers.exact.filter((e) => sees(e.table));
    if (numbers.exact.length && searchParams?.stay !== '1') {
      const targets = [...new Set(await Promise.all(numbers.exact.map((e) => hrefForRecord(e.table, e.id))))];
      if (targets.length === 1) redirect(targets[0]);
    }
  }
  const codeTargets = numbers ? await Promise.all(numbers.codes.map((c) => hrefForRecord(c.record_table, c.record_id))) : [];
  const found = people.length + (numbers ? numbers.codes.length + numbers.memberships.length + numbers.receipts.length + numbers.vouchers.length + numbers.deposits.length : 0);

  return (
    <>
      <PageHead title={t('search.title')} intro={t('search.intro')} crumbs={[{ label: t('search.title') }]} />

      <form method="get" action="/search" role="search" className="tms-search" style={{ marginBottom: '1.5rem' }}>
        <label className="sr-only" htmlFor="q">{t('search.label')}</label>
        <input className="tms-input" id="q" name="q" type="search" defaultValue={term} maxLength={80} placeholder={t('search.placeholder')} autoFocus={!term} />
        <button type="submit" className="tms-btn tms-btn--big"><Icon name="search" />{t('search.go')}</button>
      </form>

      {!term && (
        <Card title={t('search.examples')}>
          <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
            <li>{t('search.ex1')}</li>
            <li>{t('search.ex2')}</li>
            <li>{t('search.ex3')}</li>
            <li>{t('search.ex4')}</li>
          </ul>
        </Card>
      )}
      {term && term.length < 2 && <Empty title={t('search.too_short')} />}
      {term.length >= 2 && found === 0 && <Empty title={t('search.none', { q: term })} hint={t('search.none_hint')} />}

      <div className="tms-stack">
        {people.length > 0 && (
          <section aria-labelledby="s-people">
            <h2 id="s-people" style={{ marginBottom: '0.5rem' }}>{t('search.people')} ({people.length})</h2>
            <ul className="tms-picklist">
              {people.map((p) => (
                <Result
                  key={p.id} href={`/people/${p.id}`} title={pick(lang, p.name_mr, p.name_en)}
                  lines={[p.code, [maskPhone(p.phone), p.city].filter(Boolean).join(' · '), (p.roles || []).map((r) => t(`prole.${r}`)).join(', ')]}
                />
              ))}
            </ul>
          </section>
        )}

        {numbers && numbers.codes.length > 0 && (
          <section aria-labelledby="s-codes">
            <h2 id="s-codes" style={{ marginBottom: '0.5rem' }}>{t('search.codes')} ({numbers.codes.length})</h2>
            <ul className="tms-picklist">
              {numbers.codes.map((c, i) => (
                <Result key={c.code} href={codeTargets[i]} title={c.code} lines={[t(c.record_table ? `rec.${c.record_table}` : 'rec.other')]} />
              ))}
            </ul>
          </section>
        )}

        {numbers && numbers.memberships.length > 0 && (
          <section aria-labelledby="s-mem">
            <h2 id="s-mem" style={{ marginBottom: '0.5rem' }}>{t('search.memberships')} ({numbers.memberships.length})</h2>
            <ul className="tms-picklist">
              {numbers.memberships.map((m, i) => (
                <Result
                  key={`${m.membership_id}-${i}`} href={`/people/${m.person_id}`} title={m.number_as_written}
                  badge={<Badge tone={TONE_BY_STATUS[m.status]}>{t(`status.${m.status}`)}</Badge>}
                  lines={[pick(lang, m.name_mr, m.name_en), `${t(`tier.${m.tier}`)} · ${m.code}`]}
                />
              ))}
            </ul>
          </section>
        )}

        {numbers && numbers.receipts.length > 0 && (
          <section aria-labelledby="s-rcp">
            <h2 id="s-rcp" style={{ marginBottom: '0.5rem' }}>{t('search.receipts')} ({numbers.receipts.length})</h2>
            <ul className="tms-picklist">
              {numbers.receipts.map((r, i) => (
                <Result
                  key={`${r.id}-${i}`} href={r.income_id ? `/donations/${r.income_id}` : `/source/receipts/${r.id}`} title={r.number_as_written}
                  badge={r.is_cancelled ? <Badge tone="error">{t('status.cancelled')}</Badge> : null}
                  lines={[[r.payer_as_written, r.amount != null ? formatINR(r.amount) : null].filter(Boolean).join(' · '), `${fmtDate(r.receipt_date)} · ${r.fy || ''} · ${r.code}`]}
                />
              ))}
            </ul>
          </section>
        )}

        {numbers && numbers.vouchers.length > 0 && (
          <section aria-labelledby="s-exp">
            <h2 id="s-exp" style={{ marginBottom: '0.5rem' }}>{t('search.vouchers')} ({numbers.vouchers.length})</h2>
            <ul className="tms-picklist">
              {numbers.vouchers.map((v) => (
                <Result
                  key={v.id} href={`/expenses/${v.id}`} title={v.voucher_no_as_written}
                  lines={[[v.payee_as_written, formatINR(v.amount)].filter(Boolean).join(' · '), `${fmtDate(v.entry_date)} · ${v.fy || ''} · ${v.code}`]}
                />
              ))}
            </ul>
          </section>
        )}

        {numbers && numbers.deposits.length > 0 && (
          <section aria-labelledby="s-fd">
            <h2 id="s-fd" style={{ marginBottom: '0.5rem' }}>{t('search.deposits')} ({numbers.deposits.length})</h2>
            <ul className="tms-picklist">
              {numbers.deposits.map((d) => (
                <Result
                  key={d.id} href={`/deposits/${d.id}`} title={d.fd_number}
                  badge={<Badge tone={TONE_BY_STATUS[d.status]}>{t(`fdstatus.${d.status}`)}</Badge>}
                  lines={[`${d.bank} · ${formatINR(d.principal)}`, `${t('fd.maturity')}: ${fmtDate(d.maturity_date)} · ${d.code}`]}
                />
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
