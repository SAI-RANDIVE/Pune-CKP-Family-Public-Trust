import { formatINR, formatNumber } from '../../lib/tms/format';

/**
 * Charts of the management system. Plain HTML, CSS and SVG: no chart library,
 * no JavaScript, so they print, work on any phone and add nothing to load.
 *
 *   Columns    vertical bars, one group per label, up to a few series
 *   TrendLine  lines over time (running totals through the year)
 *   ShareBar   one bar split into parts of a whole, with a legend that carries the figures
 *   Meter      a single share of a total ("552 of 583")
 *
 * Rules they all follow:
 *  - a colour is never the only way to tell two things apart: every series is
 *    named in a legend, and every chart has a "show the figures" table;
 *  - the exact figure is one hover, one tap or one Tab away on every mark;
 *  - text is always in the ink colours, never in a series colour;
 *  - series colours come from one fixed order (checked for colour-blind
 *    readers), so the same series is the same colour on every screen.
 *
 * Server-safe: no hooks. All text arrives already translated.
 */

/** Fixed order; a chart with n series uses the first n. */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];

/** ₹12,34,567 -> "12.3L": short enough for an axis. Indian units (K, L for lakh, Cr for crore). */
export function compact(value, money = true) {
  const n = Number(value) || 0;
  const a = Math.abs(n);
  const trim = (x) => String(Number(x.toFixed(a >= 1e7 || a < 1e5 ? 1 : 1))).replace(/\.0$/, '');
  let text;
  if (a >= 1e7) text = `${trim(a / 1e7)}Cr`;
  else if (a >= 1e5) text = `${trim(a / 1e5)}L`;
  else if (a >= 1e3) text = `${trim(a / 1e3)}K`;
  else text = String(Math.round(a));
  return `${n < 0 ? '-' : ''}${money ? '₹' : ''}${text}`;
}

/** A round number at or above the largest value, and the tick marks up to it. */
function scale(max) {
  if (!(max > 0)) return { top: 1, ticks: [0, 1] };
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => max / s <= 4) || 10 * pow;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
  return { top, ticks };
}

function Legend({ names }) {
  if (names.length < 2) return null;
  return (
    <ul className="tms-legend">
      {names.map((name, i) => (
        <li key={name}><span className="sw" style={{ background: SERIES[i % SERIES.length] }} aria-hidden="true" />{name}</li>
      ))}
    </ul>
  );
}

/** The same numbers as a table: for screen readers, for print, and for anyone who wants the exact figures. */
function Figures({ label, head, rows, fmt }) {
  if (!label) return null;
  return (
    <details className="tms-figures">
      <summary>{label}</summary>
      <div className="tms-tablewrap">
        <table className="tms-table">
          <thead><tr>{head.map((h, i) => <th key={i} scope="col" className={i ? 'r' : undefined}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, i) => <td key={i} data-label={head[i]} className={i ? 'r num' : 'lead'}>{i ? fmt(cell) : cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * Vertical bars. rows: [{ label, values: [{ series, value }] }].
 * With few bars each one carries its figure on top; with many, the axis and
 * the hover / tap label carry them, so the chart never turns into a wall of numbers.
 */
export function Columns({ rows, caption, money = true, empty, tableLabel, height = 220 }) {
  const fmt = money ? formatINR : formatNumber;
  const names = [...new Set(rows.flatMap((r) => r.values.map((v) => v.series)))];
  const max = Math.max(0, ...rows.flatMap((r) => r.values.map((v) => Number(v.value) || 0)));
  if (!rows.length || max === 0) return empty ? <p className="muted">{empty}</p> : null;
  const { top, ticks } = scale(max);
  const bars = rows.length * names.length;
  const capLabels = bars <= 8;

  return (
    <figure className="tms-chart">
      {caption && <figcaption className="muted">{caption}</figcaption>}
      <Legend names={names} />
      <div className="tms-cols" style={{ '--h': `${height}px`, '--n': rows.length }}>
        <div className="tms-cols-axis" aria-hidden="true">
          {[...ticks].reverse().map((tick) => <span key={tick}>{compact(tick, money)}</span>)}
        </div>
        <div className="tms-cols-plot">
          <div className="tms-cols-grid" aria-hidden="true">
            {ticks.map((tick) => <i key={tick} style={{ bottom: `${(tick / top) * 100}%` }} />)}
          </div>
          <ul className="tms-cols-groups">
            {rows.map((row, r) => (
              <li key={r}>
                <div className="bars">
                  {names.map((name, i) => {
                    const n = Number(row.values.find((v) => v.series === name)?.value) || 0;
                    return (
                      <span
                        key={name} className="col" tabIndex={0}
                        style={{ height: `${Math.max(n > 0 ? 1 : 0, (n / top) * 100)}%`, background: SERIES[i % SERIES.length] }}
                        aria-label={`${row.label}${names.length > 1 ? `, ${name}` : ''}: ${fmt(n)}`}
                      >
                        <span className={capLabels ? 'cap' : 'tip'}>{capLabels ? compact(n, money) : `${names.length > 1 ? `${name}: ` : ''}${fmt(n)}`}</span>
                      </span>
                    );
                  })}
                </div>
                <span className="lab">{row.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <Figures
        label={tableLabel} fmt={fmt} head={['', ...names]}
        rows={rows.map((row) => [row.label, ...names.map((name) => Number(row.values.find((v) => v.series === name)?.value) || 0)])}
      />
    </figure>
  );
}

/**
 * Lines over time. points: [{ label, values: [{ series, value }] }], in order.
 * Each line ends in a dot and its latest figure; a faint wash under the first
 * line shows the shape at a glance.
 */
export function TrendLine({ points, caption, money = true, empty, tableLabel }) {
  const fmt = money ? formatINR : formatNumber;
  const names = [...new Set(points.flatMap((p) => p.values.map((v) => v.series)))];
  const max = Math.max(0, ...points.flatMap((p) => p.values.map((v) => Number(v.value) || 0)));
  if (points.length < 2 || max === 0) return empty ? <p className="muted">{empty}</p> : null;
  const { top, ticks } = scale(max);
  const W = 640;
  const H = 240;
  const pad = { l: 70, r: 18, t: 14, b: 34 };
  const x = (i) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  const value = (p, name) => Number(p.values.find((v) => v.series === name)?.value) || 0;
  const every = Math.ceil(points.length / 7);

  return (
    <figure className="tms-chart">
      {caption && <figcaption className="muted">{caption}</figcaption>}
      <Legend names={names} />
      <svg viewBox={`0 0 ${W} ${H}`} className="tms-line" role="img" aria-label={caption || names.join(', ')}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.l} x2={W - pad.r} y1={y(tick)} y2={y(tick)} className="grid" />
            <text x={pad.l - 8} y={y(tick) + 4} textAnchor="end" className="tick">{compact(tick, money)}</text>
          </g>
        ))}
        {points.map((p, i) => (i % every === 0 || i === points.length - 1) && (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} className="tick">{p.label}</text>
        ))}
        {names.map((name, s) => {
          const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(value(p, name)).toFixed(1)}`).join(' ');
          const last = points.length - 1;
          return (
            <g key={name}>
              {s === 0 && <path d={`${d} L${x(last).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`} fill={SERIES[0]} opacity="0.1" />}
              <path d={d} fill="none" stroke={SERIES[s % SERIES.length]} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {points.map((p, i) => (
                <circle key={i} cx={x(i)} cy={y(value(p, name))} r={i === last ? 5 : 3.5} fill={SERIES[s % SERIES.length]} stroke="#fff" strokeWidth="2">
                  <title>{`${p.label}, ${name}: ${fmt(value(p, name))}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <ul className="tms-ends">
        {names.map((name, s) => (
          <li key={name}><span className="sw" style={{ background: SERIES[s % SERIES.length] }} aria-hidden="true" />{name}: <strong className="num">{fmt(value(points[points.length - 1], name))}</strong></li>
        ))}
      </ul>
      <Figures label={tableLabel} fmt={fmt} head={['', ...names]} rows={points.map((p) => [p.label, ...names.map((name) => value(p, name))])} />
    </figure>
  );
}

/**
 * Parts of a whole as one split bar. The legend carries each part's figure and
 * share, so the bar never needs a label squeezed inside a thin slice.
 * parts: [{ label, value }]; more than seven parts are folded into `otherLabel`.
 */
export function ShareBar({ parts, caption, money = true, empty, otherLabel = 'Other' }) {
  const fmt = money ? formatINR : formatNumber;
  let list = parts.map((p) => ({ label: p.label, value: Math.max(0, Number(p.value) || 0) })).filter((p) => p.value > 0);
  const total = list.reduce((sum, p) => sum + p.value, 0);
  if (!total) return empty ? <p className="muted">{empty}</p> : null;
  if (list.length > 7) {
    const rest = list.slice(6).reduce((sum, p) => sum + p.value, 0);
    list = [...list.slice(0, 6), { label: otherLabel, value: rest }];
  }
  return (
    <figure className="tms-chart">
      {caption && <figcaption className="muted">{caption}</figcaption>}
      <div className="tms-share" role="img" aria-label={list.map((p) => `${p.label} ${Math.round((p.value / total) * 100)}%`).join(', ')}>
        {list.map((p, i) => (
          <span key={p.label} style={{ flexGrow: p.value, background: SERIES[i % SERIES.length] }} title={`${p.label}: ${fmt(p.value)}`} />
        ))}
      </div>
      <ul className="tms-share-legend">
        {list.map((p, i) => (
          <li key={p.label}>
            <span className="sw" style={{ background: SERIES[i % SERIES.length] }} aria-hidden="true" />
            <span className="name">{p.label}</span>
            <strong className="num">{fmt(p.value)}</strong>
            <span className="pct">{((p.value / total) * 100).toFixed(p.value / total < 0.1 ? 1 : 0)}%</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** One share of a total, as a filled track with the figures written out. tone: 'ok' | 'warn' | 'plain'. */
export function Meter({ value, total, label, note, tone = 'plain' }) {
  const v = Math.max(0, Number(value) || 0);
  const t = Math.max(0, Number(total) || 0);
  const pct = t > 0 ? Math.min(100, (v / t) * 100) : 0;
  return (
    <div className="tms-meter">
      <div className="top">
        <span className="lab">{label}</span>
        <strong className="num">{pct.toFixed(pct > 0 && pct < 99.95 ? 1 : 0)}%</strong>
      </div>
      <div className={`track tms-meter--${tone}`} role="meter" aria-valuemin={0} aria-valuemax={t} aria-valuenow={v} aria-label={label}>
        <span style={{ width: `${pct}%` }} />
      </div>
      {note && <div className="note muted">{note}</div>}
    </div>
  );
}
