import Link from 'next/link';
import Icon from './icons';
import { formatINR, formatNumber } from '../../lib/tms/format';

/**
 * Presentational building blocks of the management system. No hooks and no
 * server-only imports, so both server and client components may use them.
 * All text arrives already translated.
 */

export function Card({ title, children, className = '', ...rest }) {
  return (
    <section className={`tms-card ${className}`} {...rest}>
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}

export function Stat({ label, value, note, href }) {
  const body = (
    <>
      <div className="k">{label}</div>
      <div className="v">{value}</div>
      {note && <div className="n">{note}</div>}
    </>
  );
  return href ? <Link href={href} className="tms-stat">{body}</Link> : <div className="tms-stat">{body}</div>;
}

const TONE_ICON = { info: 'info', ok: 'ok', warn: 'warn', error: 'error' };

export function Alert({ tone = 'info', title, children, role }) {
  return (
    <div className={`tms-alert tms-alert--${tone}`} role={role || (tone === 'error' ? 'alert' : 'status')}>
      <Icon name={TONE_ICON[tone] || 'info'} />
      <div>
        {title && <strong>{title}</strong>}
        {children}
      </div>
    </div>
  );
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={`tms-badge tms-badge--${tone}`}>{children}</span>;
}

export function Empty({ title, hint, children }) {
  return (
    <div className="tms-empty">
      <h2>{title}</h2>
      {hint && <p>{hint}</p>}
      {children && <div className="tms-actions" style={{ justifyContent: 'center' }}>{children}</div>}
    </div>
  );
}

/** Definition list: [[label, value], ...]. Empty values are skipped. */
export function KeyValues({ items }) {
  const shown = items.filter((item) => item && item[1] !== null && item[1] !== undefined && item[1] !== '');
  return (
    <dl className="tms-kv">
      {shown.map(([label, value], i) => (
        <div key={i} style={{ display: 'contents' }}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Money({ value }) {
  return <span className="num">{formatINR(value)}</span>;
}

/* ---------- form controls for plain server-rendered forms ---------- */

export function Field({ label, htmlFor, hint, error, optional, children }) {
  return (
    <div className="tms-field">
      <label className="tms-label" htmlFor={htmlFor}>
        {label} {optional && <span className="opt">({optional})</span>}
      </label>
      {children}
      {hint && <span className="tms-hint" id={`${htmlFor}-hint`}>{hint}</span>}
      {error && <span className="tms-error" role="alert"><Icon name="error" size="1.2em" />{error}</span>}
    </div>
  );
}

export function TextField({ label, name, hint, optional, type = 'text', ...rest }) {
  return (
    <Field label={label} htmlFor={`f-${name}`} hint={hint} optional={optional}>
      <input className="tms-input" id={`f-${name}`} name={name} type={type} {...rest} />
    </Field>
  );
}

export function SelectField({ label, name, options, hint, optional, placeholder, ...rest }) {
  return (
    <Field label={label} htmlFor={`f-${name}`} hint={hint} optional={optional}>
      <select className="tms-select" id={`f-${name}`} name={name} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function TextAreaField({ label, name, hint, optional, ...rest }) {
  return (
    <Field label={label} htmlFor={`f-${name}`} hint={hint} optional={optional}>
      <textarea className="tms-textarea" id={`f-${name}`} name={name} {...rest} />
    </Field>
  );
}

/* ---------- charts ---------- */

/**
 * Horizontal bars with the real number printed beside every bar. Series are
 * told apart by their printed name and a fill pattern, never by colour alone.
 *   rows: [{ label, values: [{ series, value }] }]
 */
export function Bars({ rows, caption, money = true, empty }) {
  const max = Math.max(0, ...rows.flatMap((r) => r.values.map((v) => Math.abs(Number(v.value) || 0))));
  if (!rows.length || max === 0) return empty ? <p className="muted">{empty}</p> : null;
  const fmt = money ? formatINR : formatNumber;
  return (
    <figure style={{ margin: 0 }}>
      {caption && <figcaption className="muted" style={{ marginBottom: '0.6rem' }}>{caption}</figcaption>}
      <div className="tms-bars">
        {rows.map((row, i) => (
          <div className="row" key={i}>
            <div className="lab">{row.label}</div>
            {row.values.map((v, j) => {
              const n = Number(v.value) || 0;
              return (
                <div className="bar" key={j}>
                  <span className="ser">{v.series}</span>
                  <span className="track">
                    <span className={`fill s${j}`} style={{ width: `${Math.max(0.5, (Math.abs(n) / max) * 72)}%` }} />
                    <span className="val">{fmt(n)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </figure>
  );
}

/** Loading placeholder blocks. */
export function Skeleton({ lines = 3, height = '3.5rem' }) {
  return (
    <div className="tms-stack" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => <div key={i} className="tms-skel" style={{ height }} />)}
    </div>
  );
}
