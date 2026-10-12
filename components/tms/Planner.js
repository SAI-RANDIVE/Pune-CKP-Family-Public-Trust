'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './icons';
import { Alert } from './ui';
import { useI18n } from './I18n';
import { formatINR, formatNumber } from '../../lib/tms/format';
import { lineTotal, planTotals } from '../../lib/tms/planMath';

/**
 * Event budget planner: a calculator for trustees planning an event.
 *
 * Type how many people are expected and the entry fee, then add and remove
 * lines of income and expense. A line is either a fixed amount (hall rent) or
 * "per person" (a dinner plate), so changing the head-count updates every
 * total at once. The figures at the top (surplus or shortfall, cost per
 * person, how many people are needed to break even, and the fee that would
 * cover the cost) follow every keystroke; nothing is saved until "Save".
 */

const blank = (kind) => ({ key: Math.random().toString(36).slice(2), kind, label: '', qty: '1', unit_amount: '', per_head: false });

const STARTERS = {
  expense: ['x.pl.s.hall', 'x.pl.s.food', 'x.pl.s.sound', 'x.pl.s.decoration', 'x.pl.s.printing', 'x.pl.s.gifts', 'x.pl.s.travel', 'x.pl.s.photo'],
  income: ['x.pl.s.sponsor', 'x.pl.s.donations', 'x.pl.s.ads'],
};

export default function Planner({ initial, events = [], action, exportBase = null, canExport = false }) {
  const { t } = useI18n();
  const router = useRouter();
  const [plan, setPlan] = useState(() => ({
    id: initial?.id || null,
    title: initial?.title || '',
    event_id: initial?.event_id || '',
    expected_attendees: initial?.expected_attendees ? String(initial.expected_attendees) : '',
    entry_fee: Number(initial?.entry_fee) > 0 ? String(Number(initial.entry_fee)) : '',
    notes: initial?.notes || '',
    items: (initial?.items || []).map((i) => ({ ...blank(i.kind), label: i.label, qty: String(Number(i.qty)), unit_amount: String(Number(i.unit_amount)), per_head: Boolean(i.per_head) })),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  const totals = useMemo(() => planTotals(plan), [plan]);
  const set = (field, value) => { setDirty(true); setPlan((p) => ({ ...p, [field]: value })); };
  const setItem = (key, field, value) => { setDirty(true); setPlan((p) => ({ ...p, items: p.items.map((i) => (i.key === key ? { ...i, [field]: value } : i)) })); };
  const add = (kind, label = '') => { setDirty(true); setPlan((p) => ({ ...p, items: [...p.items, { ...blank(kind), label }] })); };
  const remove = (key) => { setDirty(true); setPlan((p) => ({ ...p, items: p.items.filter((i) => i.key !== key) })); };

  async function save() {
    setError('');
    if (plan.title.trim().length < 2) { setError(t('x.pl.need_title')); document.getElementById('pl-title')?.focus(); return; }
    setBusy(true);
    try {
      const result = await action({
        id: plan.id, title: plan.title, event_id: plan.event_id || null, expected_attendees: plan.expected_attendees, entry_fee: plan.entry_fee, notes: plan.notes,
        items: plan.items.filter((i) => i.label.trim()).map(({ kind, label, qty, unit_amount, per_head }) => ({ kind, label, qty, unit_amount, per_head })),
      });
      if (!result?.ok) { setError(result?.error || t('err.server')); setBusy(false); return; }
      setDirty(false);
      router.push(result.href);
      router.refresh();
    } catch {
      setError(t('err.server'));
    }
    setBusy(false);
  }

  const section = (kind) => {
    const items = plan.items.filter((i) => i.kind === kind);
    const unused = STARTERS[kind].map((k) => t(k)).filter((label) => !items.some((i) => i.label === label));
    return (
      <section className="tms-card" aria-labelledby={`pl-${kind}`}>
        <h2 id={`pl-${kind}`}>{kind === 'income' ? t('x.pl.income') : t('x.pl.expenses')}</h2>
        <p className="muted" style={{ marginBottom: '0.75rem' }}>{kind === 'income' ? t('x.pl.income_hint') : t('x.pl.expenses_hint')}</p>

        {kind === 'income' && totals.fee > 0 && (
          <div className="tms-plan-row tms-plan-row--fixed">
            <span className="lab">{t('x.pl.entry_line', { n: formatNumber(totals.attendees), fee: formatINR(totals.fee) })}</span>
            <strong className="num">{formatINR(totals.entryIncome)}</strong>
          </div>
        )}

        {items.map((item, index) => (
          <div className="tms-plan-row" key={item.key}>
            <div className="f-label">
              <label className="sr-only" htmlFor={`l-${item.key}`}>{t('x.pl.item')} {index + 1}</label>
              <input id={`l-${item.key}`} className="tms-input" value={item.label} maxLength={160} placeholder={t('x.pl.item_ph')} onChange={(e) => setItem(item.key, 'label', e.target.value)} />
            </div>
            <div className="f-qty">
              <label className="tms-hint" htmlFor={`q-${item.key}`}>{t('x.pl.qty')}</label>
              <input id={`q-${item.key}`} className="tms-input" inputMode="decimal" value={item.qty} onChange={(e) => setItem(item.key, 'qty', e.target.value.replace(/[^\d.]/g, '').slice(0, 9))} />
            </div>
            <div className="f-rate">
              <label className="tms-hint" htmlFor={`r-${item.key}`}>{t('x.pl.rate')}</label>
              <input id={`r-${item.key}`} className="tms-input" inputMode="decimal" value={item.unit_amount} placeholder="0" onChange={(e) => setItem(item.key, 'unit_amount', e.target.value.replace(/[^\d.]/g, '').slice(0, 12))} />
            </div>
            <label className="f-head">
              <input type="checkbox" checked={item.per_head} onChange={(e) => setItem(item.key, 'per_head', e.target.checked)} />
              <span>{t('x.pl.per_head')}</span>
            </label>
            <strong className="num f-total" aria-label={t('f.amount')}>{formatINR(lineTotal(item, totals.attendees))}</strong>
            <button type="button" className="tms-btn tms-btn--quiet tms-btn--small f-del" onClick={() => remove(item.key)} aria-label={t('x.pl.remove', { name: item.label || `${index + 1}` })}>
              {t('x.pl.remove_short')}
            </button>
          </div>
        ))}

        <div className="tms-actions" style={{ marginTop: '0.75rem' }}>
          <button type="button" className="tms-btn tms-btn--secondary" onClick={() => add(kind)}><Icon name="plus" />{t('x.pl.add_line')}</button>
        </div>
        {unused.length > 0 && (
          <p style={{ marginTop: '0.75rem' }}>
            <span className="tms-hint" style={{ display: 'block', marginBottom: '0.4rem' }}>{t('x.pl.quick_add')}</span>
            <span className="tms-actions">
              {unused.map((label) => (
                <button key={label} type="button" className="tms-btn tms-btn--quiet tms-btn--small" onClick={() => add(kind, label)}>+ {label}</button>
              ))}
            </span>
          </p>
        )}
        <div className="tms-plan-row tms-plan-row--total">
          <span className="lab">{kind === 'income' ? t('x.pl.total_income') : t('x.pl.total_expenses')}</span>
          <strong className="num">{formatINR(kind === 'income' ? totals.income : totals.expense)}</strong>
        </div>
      </section>
    );
  };

  const surplus = totals.balance >= 0;
  return (
    <div className="tms-stack">
      <section className="tms-card" aria-labelledby="pl-basics">
        <h2 id="pl-basics">{t('x.pl.basics')}</h2>
        <div className="tms-grid tms-grid--2">
          <div className="tms-field">
            <label className="tms-label" htmlFor="pl-title">{t('x.pl.title_field')}</label>
            <input id="pl-title" className="tms-input" value={plan.title} maxLength={160} placeholder={t('x.pl.title_ph')} onChange={(e) => set('title', e.target.value)} />
          </div>
          <div className="tms-field">
            <label className="tms-label" htmlFor="pl-event">{t('f.event')} <span className="opt">({t('c.optional')})</span></label>
            <select id="pl-event" className="tms-select" value={plan.event_id} onChange={(e) => set('event_id', e.target.value)}>
              <option value="">{t('x.pl.no_event')}</option>
              {events.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </div>
          <div className="tms-field">
            <label className="tms-label" htmlFor="pl-people">{t('x.pl.people')}</label>
            <input id="pl-people" className="tms-input" inputMode="numeric" value={plan.expected_attendees} placeholder="150" onChange={(e) => set('expected_attendees', e.target.value.replace(/\D/g, '').slice(0, 6))} />
            <span className="tms-hint">{t('x.pl.people_hint')}</span>
          </div>
          <div className="tms-field">
            <label className="tms-label" htmlFor="pl-fee">{t('x.pl.fee')}</label>
            <input id="pl-fee" className="tms-input" inputMode="decimal" value={plan.entry_fee} placeholder="0" onChange={(e) => set('entry_fee', e.target.value.replace(/[^\d.]/g, '').slice(0, 9))} />
            <span className="tms-hint">{t('x.pl.fee_hint')}</span>
          </div>
        </div>
      </section>

      <section className="tms-plan-sum" aria-live="polite" aria-label={t('x.pl.summary')}>
        <div className="tms-grid tms-grid--4">
          <div className="tms-stat"><div className="k">{t('x.pl.total_income')}</div><div className="v">{formatINR(totals.income)}</div></div>
          <div className="tms-stat"><div className="k">{t('x.pl.total_expenses')}</div><div className="v">{formatINR(totals.expense)}</div></div>
          <div className={`tms-stat ${surplus ? 'tms-stat--ok' : 'tms-stat--bad'}`}>
            <div className="k">{surplus ? t('x.pl.surplus') : t('x.pl.shortfall')}</div>
            <div className="v">{formatINR(Math.abs(totals.balance))}</div>
          </div>
          <div className="tms-stat">
            <div className="k">{t('x.pl.cost_per_head')}</div>
            <div className="v">{totals.costPerHead === null ? '—' : formatINR(Math.round(totals.costPerHead))}</div>
          </div>
        </div>
        <p style={{ marginTop: '0.75rem' }}>
          {totals.breakEven === null
            ? t('x.pl.no_break_even')
            : totals.breakEven === 0 ? t('x.pl.break_even_zero') : t('x.pl.break_even', { n: formatNumber(totals.breakEven) })}
          {' '}
          {totals.feeToCover !== null && totals.attendees > 0 && t('x.pl.fee_to_cover', { n: formatNumber(totals.attendees), fee: formatINR(totals.feeToCover) })}
        </p>
      </section>

      {section('expense')}
      {section('income')}

      <section className="tms-card">
        <div className="tms-field">
          <label className="tms-label" htmlFor="pl-notes">{t('f.notes')} <span className="opt">({t('c.optional')})</span></label>
          <textarea id="pl-notes" className="tms-textarea" value={plan.notes} maxLength={1000} onChange={(e) => set('notes', e.target.value)} />
        </div>
        {error && <div style={{ marginBottom: '1rem' }}><Alert tone="error" title={t('c.not_saved')}>{error}</Alert></div>}
        <div className="tms-actions no-print">
          {action && (
            <button type="button" className="tms-btn tms-btn--ok tms-btn--big" onClick={save} disabled={busy} aria-busy={busy}>
              <Icon name="ok" />{busy ? t('c.saving') : t('x.pl.save')}
            </button>
          )}
          {exportBase && !dirty && (
            <>
              <a className="tms-btn tms-btn--secondary" href={exportBase} target="_blank" rel="noopener"><Icon name="print" />{t('x.pl.pdf')}</a>
              {canExport && <a className="tms-btn tms-btn--secondary" href={`${exportBase}?format=xlsx`}><Icon name="download" />{t('x.pl.excel')}</a>}
            </>
          )}
        </div>
        {exportBase && dirty && <p className="tms-hint" style={{ marginTop: '0.5rem' }}>{t('x.pl.save_first')}</p>}
        <p className="tms-hint" style={{ marginTop: '0.5rem' }}>{t('x.pl.estimate_note')}</p>
      </section>
    </div>
  );
}
