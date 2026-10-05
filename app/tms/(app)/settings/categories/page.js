import Link from 'next/link';
import { Flash, PageHead } from '../../../../../components/tms/blocks';
import { Badge, Card, TextField } from '../../../../../components/tms/ui';
import { SubmitButton } from '../../../../../components/tms/client';
import { requireRole } from '../../../../../lib/tms/auth';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { oneOf, q } from '../../../../../lib/tms/db';
import { formatNumber } from '../../../../../lib/tms/format';
import { saveCategory, toggleCategory } from '../../../../../lib/tms/actions/settings';

export const dynamic = 'force-dynamic';

/** Heads of account for income and expense entries. */
export default async function CategoriesPage({ searchParams }) {
  await requireRole('admin');
  const { t } = await getI18n();
  const kind = oneOf(searchParams?.kind, ['expense', 'income'], 'expense');
  const table = kind === 'expense' ? 'expenses' : 'income_entries';

  const rows = await q(
    `select c.id, c.code, c.name_en, c.name_mr, c.is_active,
            (select count(*) from ${table} x where x.category_id = c.id and x.deleted_at is null)::int as used
       from categories c where c.kind = $1 order by c.is_active desc, c.name_en`, [kind]);

  return (
    <>
      <PageHead title={t('set.categories')} intro={t('cat.intro')} crumbs={[{ href: '/settings', label: t('nav.settings') }, { label: t('set.categories') }]} />
      <Flash searchParams={searchParams} />

      <nav className="tms-actions no-print" aria-label={t('c.filters')} style={{ marginBottom: '1rem' }}>
        {['expense', 'income'].map((k) => (
          <Link key={k} href={`/settings/categories?kind=${k}`} className={`tms-btn ${kind === k ? '' : 'tms-btn--quiet'}`} aria-current={kind === k ? 'true' : undefined}>
            {t(`cat.${k}`)}
          </Link>
        ))}
      </nav>

      <div className="tms-stack">
        <Card title={t('cat.add')} style={{ maxWidth: '40rem' }}>
          <form action={saveCategory}>
            <input type="hidden" name="kind" value={kind} />
            <TextField label={t('cat.name_en')} name="name_en" required minLength={2} maxLength={120} placeholder="Programme: Printing" />
            <TextField label={t('cat.name_mr')} name="name_mr" optional={t('c.optional')} maxLength={120} placeholder="कार्यक्रम: छपाई" />
            <SubmitButton>{t('cat.add')}</SubmitButton>
          </form>
        </Card>

        <div className="tms-grid tms-grid--2">
          {rows.map((c) => (
            <Card key={c.id}>
              <p style={{ marginBottom: '0.5rem' }}>
                <Badge tone={c.is_active ? 'ok' : 'neutral'}>{c.is_active ? t('cat.in_use') : t('cat.hidden')}</Badge>{' '}
                <span className="muted">{t('cat.used', { n: formatNumber(c.used) })} · <span className="mono">{c.code}</span></span>
              </p>
              <form action={saveCategory}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="kind" value={kind} />
                <div className="tms-field">
                  <label className="tms-label" htmlFor={`en-${c.id}`}>{t('cat.name_en')}</label>
                  <input className="tms-input" id={`en-${c.id}`} name="name_en" defaultValue={c.name_en} required minLength={2} maxLength={120} />
                </div>
                <div className="tms-field">
                  <label className="tms-label" htmlFor={`mr-${c.id}`}>{t('cat.name_mr')}</label>
                  <input className="tms-input" id={`mr-${c.id}`} name="name_mr" defaultValue={c.name_mr || ''} maxLength={120} />
                </div>
                <SubmitButton className="tms-btn tms-btn--secondary tms-btn--small">{t('c.save_changes')}</SubmitButton>
              </form>
              <form action={toggleCategory} style={{ marginTop: '0.6rem' }}>
                <input type="hidden" name="id" value={c.id} />
                <SubmitButton className="tms-btn tms-btn--quiet tms-btn--small">{c.is_active ? t('cat.hide') : t('cat.show')}</SubmitButton>
              </form>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
