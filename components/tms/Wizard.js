'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './icons';
import { Alert } from './ui';
import { AmountInput } from './client';
import { useI18n } from './I18n';
import { amountInWords, fmtDate, formatINR } from '../../lib/tms/format';

/**
 * The step-by-step entry form used for every record a trustee types in:
 * a few big fields per step, plain-language errors beside the field, a
 * confirmation screen that reads the entry back before anything is saved,
 * and an automatic draft so a half-filled form is never lost.
 *
 * steps:  [{ id, title, intro, fields: [field] }]
 * field:  { name, type, label, hint, placeholder, required, options, showIf, allowNew }
 *         type: text | tel | email | number | textarea | amount | date | select | choice | checks | person | file
 *         showIf: { field, in: [values] }  or  { field, isNew: true } (a person typed in, not picked)
 * action: Server Action (values) -> { ok, href, id, errors: { field: message }, error }
 */

const MAX_FILE = 5 * 1024 * 1024;

function PersonPicker({ id, value, onChange, invalid, allowNew = true, placeholder }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [results, setResults] = useState(null);
  const [state, setState] = useState('idle');
  const seq = useRef(0);

  useEffect(() => {
    const term = text.trim();
    if (term.length < 2) { setResults(null); setState('idle'); return undefined; }
    setState('loading');
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tms/people/search?q=${encodeURIComponent(term)}`, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('search');
        const data = await res.json();
        if (mine === seq.current) { setResults(data.people || []); setState('done'); }
      } catch {
        if (mine === seq.current) { setResults([]); setState('error'); }
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [text]);

  if (value && (value.id || value.name)) {
    return (
      <div className="tms-picked">
        <div>
          <strong style={{ fontSize: '1.15rem' }}>{value.name}</strong>
          <div className="muted">{value.id ? [value.code, value.detail].filter(Boolean).join(' · ') : t('wz.new_person')}</div>
        </div>
        <button type="button" className="tms-btn tms-btn--quiet tms-btn--small" onClick={() => { onChange(null); setText(''); }}>
          {t('wz.change')}
        </button>
      </div>
    );
  }

  const term = text.trim();
  return (
    <div>
      <input
        id={id} className="tms-input" type="search" autoComplete="off" value={text} aria-invalid={invalid || undefined}
        placeholder={placeholder || t('wz.person_ph')} onChange={(e) => setText(e.target.value.slice(0, 120))}
      />
      <div aria-live="polite">
        {state === 'loading' && <p className="tms-hint">{t('c.searching')}</p>}
        {state === 'error' && <p className="tms-error">{t('err.search')}</p>}
        {state === 'done' && results.length === 0 && <p className="tms-hint">{t('wz.no_match')}</p>}
      </div>
      {results && results.length > 0 && (
        <ul className="tms-picklist" aria-label={t('wz.matches')}>
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" className="tms-pick" onClick={() => onChange({ id: p.id, name: p.name, code: p.code, detail: p.detail })}>
                <strong>{p.name}</strong>
                <span className="muted">{[p.code, p.detail].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {allowNew && term.length >= 2 && state !== 'loading' && (
        <button type="button" className="tms-btn tms-btn--secondary" style={{ marginTop: '0.75rem' }} onClick={() => onChange({ id: null, name: term })}>
          <Icon name="plus" />{t('wz.use_new', { name: term })}
        </button>
      )}
    </div>
  );
}

const isShown = (field, values) => {
  const rule = field.showIf;
  if (!rule) return true;
  const other = values[rule.field];
  if (rule.isNew) return Boolean(other && !other.id && other.name);
  if (rule.in) return rule.in.includes(other);
  return true;
};

const isEmpty = (field, value) => {
  if (field.type === 'person') return !(value && (value.id || String(value.name || '').trim().length >= 2));
  if (field.type === 'checks') return !(Array.isArray(value) && value.length);
  return value === undefined || value === null || String(value).trim() === '';
};

export default function Wizard({ steps, initial = {}, fresh = {}, extra = {}, action, formKey = null, saveDraft, clearDraft, hadDraft = false, submitLabel, uploadTable = null, cancelHref = '/' }) {
  const { t } = useI18n();
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [index, setIndex] = useState(0);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draftState, setDraftState] = useState(hadDraft ? 'restored' : 'none');
  const files = useRef({});
  const [fileNames, setFileNames] = useState({});
  const heading = useRef(null);
  const dirty = useRef(false);
  const mounted = useRef(false);

  const confirmIndex = steps.length;
  const onConfirm = index === confirmIndex;
  const step = steps[index];
  const allFields = useMemo(() => steps.flatMap((s) => s.fields), [steps]);

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    heading.current?.focus();
    window.scrollTo({ top: 0 });
  }, [index]);

  // Auto-save the draft a moment after the last change.
  useEffect(() => {
    if (!formKey || !saveDraft || !dirty.current) return undefined;
    const timer = setTimeout(async () => {
      try {
        await saveDraft(formKey, values);
        setDraftState('saved');
      } catch { setDraftState('failed'); }
    }, 1500);
    return () => clearTimeout(timer);
  }, [values, formKey, saveDraft]);

  const set = (name, value) => {
    dirty.current = true;
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  };

  const validateStep = (s) => {
    const found = {};
    for (const field of s.fields) {
      if (!isShown(field, values)) continue;
      const value = values[field.name];
      if (field.type === 'file') continue;
      if (field.required && isEmpty(field, value)) { found[field.name] = t(field.type === 'person' ? 'err.person' : 'err.required'); continue; }
      if (field.type === 'amount' && !isEmpty(field, value) && !(Number(value) > 0)) found[field.name] = t('err.amount');
    }
    return found;
  };

  const next = () => {
    const found = validateStep(step);
    if (Object.keys(found).length) {
      setErrors(found);
      const first = Object.keys(found)[0];
      document.getElementById(`w-${first}`)?.focus();
      return;
    }
    setErrors({});
    setIndex((i) => i + 1);
  };

  const startAgain = async () => {
    try { if (formKey && clearDraft) await clearDraft(formKey); } catch { /* the draft simply stays */ }
    dirty.current = false;
    files.current = {};
    setFileNames({});
    setValues(fresh);
    setErrors({});
    setIndex(0);
    setDraftState('none');
    router.refresh();
  };

  const save = async () => {
    setBusy(true);
    setFormError('');
    try {
      // `extra` carries what is fixed for this form (the record being edited, its scheme ...).
      const payload = { ...extra };
      for (const field of allFields) {
        if (field.type === 'file') continue;
        payload[field.name] = isShown(field, values) ? (values[field.name] ?? null) : null;
      }
      const result = await action(payload);
      if (!result || !result.ok) {
        const fieldErrors = result?.errors || {};
        setErrors(fieldErrors);
        setFormError(result?.error || t('err.check_fields'));
        const firstBad = steps.findIndex((s) => s.fields.some((f) => fieldErrors[f.name]));
        if (firstBad >= 0) setIndex(firstBad);
        setBusy(false);
        return;
      }
      let href = result.href || cancelHref;
      const file = Object.values(files.current)[0];
      if (file && uploadTable && result.id) {
        const body = new FormData();
        body.set('file', file);
        body.set('record_table', uploadTable);
        body.set('record_id', result.id);
        const res = await fetch('/api/tms/documents', { method: 'POST', body, credentials: 'same-origin' }).catch(() => null);
        if (!res || !res.ok) href += `${href.includes('?') ? '&' : '?'}err=upload`;
      }
      dirty.current = false;
      try { if (formKey && clearDraft) await clearDraft(formKey); } catch { /* not worth stopping for */ }
      router.push(href);
      router.refresh();
    } catch {
      setFormError(t('err.server'));
      setBusy(false);
    }
  };

  const renderControl = (field) => {
    const id = `w-${field.name}`;
    const value = values[field.name];
    const invalid = Boolean(errors[field.name]);
    const describedBy = field.hint ? `${id}-hint` : undefined;
    const common = { id, 'aria-invalid': invalid || undefined, 'aria-describedby': describedBy };
    switch (field.type) {
      case 'amount':
        return <AmountInput id={id} value={value ?? ''} onChange={(v) => set(field.name, v)} invalid={invalid} placeholder={field.placeholder} describedBy={describedBy} />;
      case 'textarea':
        return <textarea className="tms-textarea" {...common} value={value ?? ''} placeholder={field.placeholder} maxLength={field.max || 1000} onChange={(e) => set(field.name, e.target.value)} />;
      case 'select':
        return (
          <select className="tms-select" {...common} value={value ?? ''} onChange={(e) => set(field.name, e.target.value)}>
            <option value="">{field.placeholder || t('c.choose')}</option>
            {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        );
      case 'choice':
        return (
          <div className="tms-choices" role="radiogroup" aria-labelledby={`${id}-label`} aria-invalid={invalid || undefined}>
            {field.options.map((o, i) => (
              <label key={o.value} className="tms-choice">
                <input type="radio" id={i === 0 ? id : undefined} name={field.name} value={o.value} checked={value === o.value} onChange={() => set(field.name, o.value)} />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        );
      case 'checks': {
        const list = Array.isArray(value) ? value : [];
        return (
          <div className="tms-choices" role="group" aria-labelledby={`${id}-label`}>
            {field.options.map((o, i) => (
              <label key={o.value} className="tms-choice">
                <input
                  type="checkbox" id={i === 0 ? id : undefined} checked={list.includes(o.value)}
                  onChange={(e) => set(field.name, e.target.checked ? [...list, o.value] : list.filter((x) => x !== o.value))}
                />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        );
      }
      case 'person':
        return <PersonPicker id={id} value={value} onChange={(v) => set(field.name, v)} invalid={invalid} allowNew={field.allowNew !== false} placeholder={field.placeholder} />;
      case 'file':
        return (
          <>
            <input
              className="tms-input" id={id} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-describedby={describedBy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && file.size > MAX_FILE) {
                  e.target.value = '';
                  delete files.current[field.name];
                  setFileNames((n) => ({ ...n, [field.name]: '' }));
                  setErrors((er) => ({ ...er, [field.name]: t('err.file_big') }));
                  return;
                }
                if (file) files.current[field.name] = file; else delete files.current[field.name];
                setFileNames((n) => ({ ...n, [field.name]: file?.name || '' }));
                setErrors((er) => ({ ...er, [field.name]: undefined }));
              }}
            />
            {fileNames[field.name] && <span className="tms-hint">{t('wz.file_chosen', { name: fileNames[field.name] })}</span>}
          </>
        );
      default:
        return (
          <input
            className="tms-input" {...common} type={field.type === 'number' ? 'text' : (field.type || 'text')}
            inputMode={field.type === 'number' ? 'decimal' : field.type === 'tel' ? 'tel' : undefined}
            value={value ?? ''} placeholder={field.placeholder} maxLength={field.max || 200} autoComplete="off"
            max={field.type === 'date' ? field.maxDate : undefined}
            onChange={(e) => set(field.name, e.target.value)}
          />
        );
    }
  };

  const display = (field) => {
    const value = values[field.name];
    if (field.type === 'file') return fileNames[field.name] || '';
    if (isEmpty(field, value)) return '';
    switch (field.type) {
      case 'amount': {
        const words = amountInWords(value);
        return (
          <>
            <span className="num" style={{ fontSize: '1.4rem' }}>{formatINR(value)}</span>
            {words && <span className="muted" style={{ display: 'block', fontWeight: 500 }}>{words.mr}<br />{words.en}</span>}
          </>
        );
      }
      case 'date': return fmtDate(value);
      case 'select':
      case 'choice': return field.options.find((o) => o.value === value)?.label || String(value);
      case 'checks': return value.map((v) => field.options.find((o) => o.value === v)?.label || v).join(', ');
      case 'person': return `${value.name}${value.id ? (value.code ? ` (${value.code})` : '') : ` - ${t('wz.new_person')}`}`;
      default: return String(value);
    }
  };

  const groupTypes = ['choice', 'checks'];

  return (
    <div>
      <ol className="tms-steps" aria-label={t('wz.steps')}>
        {steps.map((s, i) => (
          <li key={s.id} aria-current={i === index ? 'step' : undefined} data-done={i < index}>
            <span aria-hidden="true">{i < index ? '✓' : i + 1}</span>{s.title}
          </li>
        ))}
        <li aria-current={onConfirm ? 'step' : undefined}><span aria-hidden="true">{steps.length + 1}</span>{t('wz.confirm')}</li>
      </ol>

      {draftState === 'restored' && (
        <div style={{ marginBottom: '1rem', maxWidth: '46rem' }}>
          <Alert tone="info" title={t('wz.draft_restored')}>
            {t('wz.draft_restored_body')}
            <div className="tms-actions" style={{ marginTop: '0.5rem' }}>
              <button type="button" className="tms-btn tms-btn--quiet tms-btn--small" onClick={startAgain}>{t('wz.start_again')}</button>
            </div>
          </Alert>
        </div>
      )}

      <form
        className="tms-wizard" noValidate
        onSubmit={(e) => { e.preventDefault(); if (onConfirm) save(); else next(); }}
      >
        <h2 ref={heading} tabIndex={-1} style={{ marginBottom: '0.25rem' }}>
          {onConfirm ? t('wz.confirm_title') : t('wz.step_of', { n: index + 1, total: steps.length + 1, title: step.title })}
        </h2>
        <p className="muted" style={{ marginBottom: '1.25rem' }}>{onConfirm ? t('wz.confirm_intro') : step.intro}</p>

        {formError && <div style={{ marginBottom: '1rem' }}><Alert tone="error" title={t('c.not_saved')}>{formError}</Alert></div>}

        {!onConfirm && step.fields.filter((f) => isShown(f, values)).map((field) => (
          <div className="tms-field" key={field.name}>
            <label className="tms-label" id={`w-${field.name}-label`} htmlFor={groupTypes.includes(field.type) ? undefined : `w-${field.name}`}>
              {field.label} {!field.required && <span className="opt">({t('c.optional')})</span>}
            </label>
            {renderControl(field)}
            {field.hint && <span className="tms-hint" id={`w-${field.name}-hint`}>{field.hint}</span>}
            {errors[field.name] && <span className="tms-error" role="alert"><Icon name="error" size="1.2em" />{errors[field.name]}</span>}
          </div>
        ))}

        {onConfirm && (
          <dl className="tms-summary">
            {allFields.filter((f) => isShown(f, values)).map((field) => {
              const shown = display(field);
              if (shown === '') return null;
              return (
                <div key={field.name}>
                  <dt>{field.label}</dt>
                  <dd>{shown}</dd>
                </div>
              );
            })}
          </dl>
        )}

        <div className="tms-wizard-nav">
          {index > 0
            ? <button type="button" className="tms-btn tms-btn--quiet" disabled={busy} onClick={() => { setFormError(''); setIndex((i) => i - 1); }}><Icon name="back" />{onConfirm ? t('wz.fix') : t('wz.prev')}</button>
            : <a className="tms-btn tms-btn--quiet" href={cancelHref}>{t('c.cancel')}</a>}
          {onConfirm
            ? <button type="submit" className="tms-btn tms-btn--ok tms-btn--big" disabled={busy} aria-busy={busy}><Icon name="ok" />{busy ? t('c.saving') : (submitLabel || t('wz.save'))}</button>
            : <button type="submit" className="tms-btn tms-btn--big">{index === steps.length - 1 ? t('wz.review') : t('wz.next')} ›</button>}
        </div>
        <p className="tms-hint" aria-live="polite" style={{ marginTop: '0.75rem' }}>
          {draftState === 'saved' && t('wz.draft_saved')}
          {draftState === 'failed' && t('wz.draft_failed')}
        </p>
      </form>
    </div>
  );
}
