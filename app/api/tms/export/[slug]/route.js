import { apiGuard, audit, hasOtpGrant } from '../../../../../lib/tms/auth';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { currentFy, isFyLabel, todayIso } from '../../../../../lib/tms/format';
import { REPORT_SLUGS, buildReport } from '../../../../../lib/tms/reports';
import { reportWorkbook } from '../../../../../lib/tms/excel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Excel export of a report. Entry roles and above, and only after the e-mailed code. */
export async function GET(request, { params }) {
  const guard = await apiGuard(request, 'accountant');
  if (guard.response) return guard.response;
  if (!REPORT_SLUGS.includes(params.slug)) return new Response('Not found', { status: 404 });

  const fyParam = String(new URL(request.url).searchParams.get('fy') || '');
  const fy = fyParam === 'all' ? 'all' : (isFyLabel(fyParam) ? fyParam : currentFy());
  const page = `/reports/${params.slug}?fy=${fy}`;

  if (!(await hasOtpGrant(guard.admin))) {
    // Relative redirect: the browser is on the admin host, where /verify is the code screen.
    return new Response(null, { status: 303, headers: { Location: `/verify?next=${encodeURIComponent(page)}`, 'Cache-Control': 'no-store' } });
  }

  try {
    const { t, lang } = await getI18n();
    const report = await buildReport(params.slug, fy, { t, lang });
    const buffer = await reportWorkbook(report, { by: guard.admin.name, fyLabel: t('f.fy'), generatedLabel: t('rep.generated') });
    await audit(guard.admin, { action: 'report_exported', entity: 'report', entityId: params.slug, detail: { fy } });
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="pcfpt-${params.slug}-${fy}-${todayIso()}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[TMS] export failed:', err?.message);
    return new Response(null, { status: 303, headers: { Location: `${page}&err=export` } });
  }
}
