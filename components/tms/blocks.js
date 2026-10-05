import Link from 'next/link';
import Icon from './icons';
import { Alert, Badge } from './ui';
import { getI18n } from '../../lib/tms/i18n/server';
import { formatNumber } from '../../lib/tms/format';

/**
 * Server components that need the request's language: page heading with
 * breadcrumbs, the table that turns into cards on phones, paging, the
 * after-save message, and the "where did this come from" link.
 */

/** crumbs: [{ href, label }]; the last one is the current page. Home is added automatically. */
export async function PageHead({ title, intro, crumbs = [], children }) {
  const { t } = await getI18n();
  return (
    <>
      <nav aria-label={t('nav.crumbs')}>
        <ol className="tms-crumbs">
          <li><Link href="/">{t('nav.home')}</Link></li>
          {crumbs.map((c, i) => (
            <li key={i}>{c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}</li>
          ))}
        </ol>
      </nav>
      <div className="tms-head">
        <div>
          <h1 id="page-title">{title}</h1>
          {intro && <p>{intro}</p>}
        </div>
        {children && <div className="tms-actions no-print">{children}</div>}
      </div>
    </>
  );
}

/**
 * columns: [{ label, cell: (row) => node, right, lead }]
 * hrefFor: (row) => path. When given, each row ends with a clear "Open" button.
 * footer: array of cells for a totals row (same length as columns).
 */
export async function DataTable({ columns, rows, hrefFor, caption, footer, openLabel }) {
  const { t } = await getI18n();
  return (
    <div className="tms-tablewrap">
      <table className="tms-table">
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c, i) => <th key={i} scope="col" className={c.right ? 'r' : undefined}>{c.label}</th>)}
            {hrefFor && <th scope="col"><span className="sr-only">{t('c.open')}</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {columns.map((c, i) => (
                <td key={i} data-label={c.label} className={[c.right ? 'r num' : '', c.lead ? 'lead' : ''].join(' ').trim() || undefined}>
                  {c.cell(row)}
                </td>
              ))}
              {hrefFor && (
                <td data-label="" className="no-print">
                  <Link href={hrefFor(row)} className="tms-btn tms-btn--secondary tms-btn--small">{openLabel || t('c.open')}</Link>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr>
              {footer.map((cell, i) => (
                <td key={i} data-label={columns[i]?.label || ''} className={columns[i]?.right ? 'r num' : undefined}>{cell}</td>
              ))}
              {hrefFor && <td data-label="" />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** Builds "/path?a=1&page=2" from a params object, dropping empty values. */
export function hrefWith(base, params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== null && v !== undefined && v !== '' && !(k === 'page' && Number(v) === 1)) sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

export async function Pager({ page, total, pageSize, base, params = {} }) {
  const { t } = await getI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav className="tms-pager" aria-label={t('c.pages')}>
      <p className="muted">{t('c.showing', { from: formatNumber(from), to: formatNumber(to), total: formatNumber(total) })}</p>
      {pages > 1 && (
        <div className="tms-actions">
          {page > 1 && <Link className="tms-btn tms-btn--secondary" href={hrefWith(base, { ...params, page: page - 1 })}><Icon name="back" />{t('c.prev')}</Link>}
          <span className="muted">{t('c.page_of', { page, pages })}</span>
          {page < pages && <Link className="tms-btn tms-btn--secondary" href={hrefWith(base, { ...params, page: page + 1 })}>{t('c.next')} ›</Link>}
        </div>
      )}
    </nav>
  );
}

const CODE = /^[a-z0-9_]{1,40}$/;

/** Shows the result of the last action, passed as ?ok=code or ?err=code. */
export async function Flash({ searchParams }) {
  const { t } = await getI18n();
  const ok = String(searchParams?.ok || '');
  const err = String(searchParams?.err || '');
  if (CODE.test(err)) return <div style={{ marginBottom: '1rem' }}><Alert tone="error" title={t('c.not_saved')}>{t(`err.${err}`)}</Alert></div>;
  if (CODE.test(ok)) return <div style={{ marginBottom: '1rem' }}><Alert tone="ok">{t(`flash.${ok}`)}</Alert></div>;
  return null;
}

/** GET filter form: works without JavaScript and keeps the filters in the address bar. */
export async function FilterForm({ action, children }) {
  const { t } = await getI18n();
  return (
    <form method="get" action={action} className="tms-filter no-print" role="search">
      {children}
      <div className="tms-actions">
        <button type="submit" className="tms-btn"><Icon name="search" />{t('c.apply')}</button>
        <Link href={action} className="tms-btn tms-btn--quiet">{t('c.clear')}</Link>
      </div>
    </form>
  );
}

/** Link to the provenance viewer: the file, sheet and row a record was read from. */
export async function SourceLink({ table, id }) {
  const { t } = await getI18n();
  return (
    <Link href={`/source/${table}/${id}`} className="tms-btn tms-btn--quiet tms-btn--small">
      <Icon name="source" />{t('src.link')}
    </Link>
  );
}

/** Marks imported rows and rows that still await a trustee's check. */
export async function OriginBadges({ origin, needsReview }) {
  const { t } = await getI18n();
  return (
    <>
      {origin === 'import' && <Badge tone="info">{t('c.imported')}</Badge>}
      {origin === 'online' && <Badge tone="info">{t('c.online')}</Badge>}
      {origin === 'manual' && <Badge tone="neutral">{t('c.manual')}</Badge>}
      {needsReview && <> <Badge tone="warn">{t('c.needs_review')}</Badge></>}
    </>
  );
}
