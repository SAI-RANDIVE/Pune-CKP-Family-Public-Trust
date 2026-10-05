import { apiGuard } from '../../../../../lib/tms/auth';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { textParam } from '../../../../../lib/tms/db';
import { maskPhone, pick } from '../../../../../lib/tms/format';
import { searchPeople } from '../../../../../lib/tms/search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** People lookup for the "who" step of the entry forms. Entry roles only; phone numbers are masked. */
export async function GET(request) {
  const guard = await apiGuard(request, 'accountant');
  if (guard.response) return guard.response;

  const term = textParam(new URL(request.url).searchParams.get('q'), 80);
  try {
    const { lang } = await getI18n();
    const rows = term.length >= 2 ? await searchPeople(term, 8) : [];
    const people = rows.map((p) => ({
      id: p.id,
      code: p.code,
      name: pick(lang, p.name_mr, p.name_en),
      detail: [maskPhone(p.phone), p.city].filter(Boolean).join(' · '),
    }));
    return Response.json({ ok: true, people }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    console.error('[TMS] people search failed:', err?.message);
    return Response.json({ ok: false, error: 'server' }, { status: 500 });
  }
}
