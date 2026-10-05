import { notFound } from 'next/navigation';
import Icon from '../../../../../components/tms/icons';
import { DataTable, FilterForm, Flash, PageHead } from '../../../../../components/tms/blocks';
import { Alert, Bars, Card, Empty, SelectField } from '../../../../../components/tms/ui';
import { PrintButton } from '../../../../../components/tms/client';
import { requireRole, can } from '../../../../../lib/tms/auth';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { currentFy, fmtDate, fmtDateTime, formatINR, formatNumber, isFyLabel } from '../../../../../lib/tms/format';
import { getFiscalYears, options } from '../../../../../lib/tms/lookups';
import { REPORT_SLUGS, buildReport } from '../../../../../lib/tms/reports';

export const dynamic = 'force-dynamic';

const show = (value, type) => {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'money') return formatINR(value);
  if (type === 'num') return formatNumber(value);
  if (type === 'date') return fmtDate(value);
  if (type === 'pct') return `${Number(value)}%`;
  return String(value);
};

/** One report: FY filter, labelled bars, tables, print view, Excel export (with the e-mailed code). */
export default async function ReportPage({ params, searchParams }) {
  const admin = await requireRole('viewer');
  const { t, lang } = await getI18n();
  if (!REPORT_SLUGS.includes(params.slug)) notFound();

  const fyParam = String(searchParams?.fy ?? '');
  const fy = fyParam === 'all' ? 'all' : (isFyLabel(fyParam) ? fyParam : currentFy());
  const [fys, report] = await Promise.all([getFiscalYears(currentFy()), buildReport(params.slug, fy, { t, lang })]);
  const fyText = fy === 'all' ? t('c.all_years') : fy;

  return (
    <>
      <PageHead title={report.title} intro={`${t('f.fy')}: ${fyText}`} crumbs={[{ href: '/reports', label: t('rep.title') }, { label: report.title }]}>
        <PrintButton label={t('c.print')} />
        {can(admin, 'export') && (
          <a href={`/api/tms/export/${params.slug}?fy=${fy}`} className="tms-btn"><Icon name="download" />{t('rep.excel')}</a>
        )}
      </PageHead>
      <Flash searchParams={searchParams} />

      <p className="print-only" style={{ marginBottom: '0.5rem' }}>
        {t('app.trust')} · {t('rep.printed', { date: fmtDateTime(new Date()), name: admin.name })}
      </p>

      <FilterForm action={`/reports/${params.slug}`}>
        <SelectField label={t('f.fy')} name="fy" defaultValue={fy} options={[{ value: 'all', label: t('c.all_years') }, ...options.fys(fys)]} />
      </FilterForm>

      <div className="tms-stack">
        {report.notes.map((note, i) => <Alert key={i} tone="info">{note}</Alert>)}

        {report.sections.map((section, s) => (
          <section key={s} aria-labelledby={`rep-${s}`} className="tms-stack">
            <h2 id={`rep-${s}`}>{section.title}</h2>
            {section.rows.length === 0 ? <Empty title={t('c.no_data')} hint={t('rep.no_data_hint')} /> : (
              <>
                {section.chart && (
                  <Card>
                    <Bars
                      money={section.chart.series[0].type !== 'num'}
                      rows={section.rows.slice(0, 16).map((row) => ({
                        label: String(row[section.chart.label] ?? '—'),
                        values: section.chart.series.map((ser) => ({ series: ser.label, value: row[ser.key] })),
                      }))}
                      empty={t('c.no_data')}
                    />
                  </Card>
                )}
                <DataTable
                  rows={section.rows}
                  columns={section.columns.map((col, i) => ({
                    label: col.label, lead: i === (section.columns[0].key === 'rank' || section.columns[0].key === 'code' ? 1 : 0),
                    right: ['money', 'num', 'pct'].includes(col.type),
                    cell: (row) => show(row[col.key], col.type),
                  }))}
                  footer={section.total ? section.columns.map((col) => (section.total[col.key] === '' || section.total[col.key] == null ? '' : show(section.total[col.key], col.type))) : undefined}
                />
                {section.note && <p className="tms-hint">{section.note}</p>}
              </>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
