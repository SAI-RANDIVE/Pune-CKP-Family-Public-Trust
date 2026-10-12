import { Flash, PageHead } from '../../../../components/tms/blocks';
import { Alert, Badge, Bars, Card, Empty, SelectField, TextAreaField, TextField } from '../../../../components/tms/ui';
import { ConfirmSubmit, SubmitButton } from '../../../../components/tms/client';
import { requireRole, can } from '../../../../lib/tms/auth';
import { canChange } from '../../../../lib/tms/access';
import { getI18n } from '../../../../lib/tms/i18n/server';
import { q } from '../../../../lib/tms/db';
import { fmtDateTime, formatNumber } from '../../../../lib/tms/format';
import { tally } from '../../../../lib/polls';
import { savePoll, updatePoll } from '../../../../lib/tms/actions/community';

export const dynamic = 'force-dynamic';

/** Polls for members: ask a question, set when it closes, watch the votes come in. */
export default async function PollsPage({ searchParams }) {
  const admin = await requireRole('viewer');
  const { t } = await getI18n();
  const mayEdit = can(admin, 'review') && canChange(admin, 'community');

  const polls = await q(
    `select p.id, p.code, p.question, p.description, p.options, p.opens_at, p.closes_at, p.is_published, p.show_results,
            (now() between p.opens_at and p.closes_at) as open,
            coalesce((select json_agg(json_build_object('option_index', x.option_index, 'n', x.n))
                        from (select option_index, count(*)::int as n from poll_votes v where v.poll_id = p.id group by option_index) x), '[]'::json) as counts,
            (select count(*)::int from member_accounts where is_active and last_login_at is not null) as eligible
       from polls p where p.deleted_at is null order by p.closes_at desc limit 60`);

  // Default closing time: a week from now, in India time, as the datetime-local field wants it.
  const inAWeek = new Date(Date.now() + 7 * 86400000 + 5.5 * 3600000).toISOString().slice(0, 16);

  return (
    <>
      <PageHead title={t('x.po.title')} intro={t('x.po.intro')} crumbs={[{ label: t('x.po.title') }]} />
      <Flash searchParams={searchParams} />
      <div className="tms-stack">
        {polls.length === 0 && <Empty title={t('x.po.none')} hint={t('x.po.none_hint')} />}
        <div className="tms-grid tms-grid--2">
          {polls.map((p) => {
            const result = tally(p.options, p.counts);
            return (
              <Card key={p.id} title={p.question}>
                <p style={{ marginBottom: '0.75rem' }}>
                  <Badge tone={p.open ? 'ok' : 'neutral'}>{p.open ? t('x.po.open') : t('x.po.closed')}</Badge>{' '}
                  <Badge tone={p.is_published ? 'info' : 'warn'}>{p.is_published ? t('x.po.shown') : t('x.po.hidden')}</Badge>{' '}
                  <span className="mono">{p.code}</span>
                </p>
                {p.description && <p className="muted" style={{ marginBottom: '0.75rem', whiteSpace: 'pre-wrap' }}>{p.description}</p>}
                <Bars money={false} rows={result.rows.map((r) => ({ label: `${r.label} (${r.pct}%)`, values: [{ series: t('x.po.votes'), value: r.votes }] }))} empty={t('x.po.no_votes')} />
                <p className="tms-hint" style={{ marginTop: '0.75rem' }}>
                  {t('x.po.total', { n: formatNumber(result.total) })} · {t(p.open ? 'x.po.closes' : 'x.po.closed_on', { when: fmtDateTime(p.closes_at) })} · {t(`x.po.show.${p.show_results}`)}
                </p>
                {mayEdit && (
                  <form action={updatePoll} className="tms-actions no-print" style={{ marginTop: '0.75rem' }}>
                    <input type="hidden" name="id" value={p.id} />
                    {p.is_published
                      ? <button className="tms-btn tms-btn--small tms-btn--secondary" name="what" value="hide">{t('x.po.hide')}</button>
                      : <button className="tms-btn tms-btn--small" name="what" value="publish">{t('x.po.publish')}</button>}
                    {p.open && <ConfirmSubmit label={t('x.po.close_now')} name="what" value="close" message={t('x.po.confirm_close')} className="tms-btn tms-btn--small tms-btn--secondary" />}
                    <ConfirmSubmit label={t('x.md.remove')} name="what" value="delete" message={t('x.po.confirm_delete')} className="tms-btn tms-btn--small tms-btn--quiet" />
                  </form>
                )}
              </Card>
            );
          })}
        </div>

        {mayEdit ? (
          <Card title={t('x.po.new')} className="no-print" style={{ maxWidth: '46rem' }}>
            <form action={savePoll}>
              <TextField label={t('x.po.question')} name="question" required minLength={5} maxLength={300} placeholder={t('x.po.question_ph')} />
              <TextAreaField label={t('x.po.description')} name="description" optional={t('c.optional')} maxLength={1500} rows={2} />
              <TextAreaField label={t('x.po.options')} name="options" required rows={4} hint={t('x.po.options_hint')} placeholder={t('x.po.options_ph')} />
              <div className="tms-grid tms-grid--2">
                <TextField label={t('x.po.closes_at')} name="closes_at" type="datetime-local" required defaultValue={inAWeek} hint={t('x.po.closes_hint')} />
                <SelectField label={t('x.po.results')} name="show_results" defaultValue="after_vote" options={['after_vote', 'after_close', 'always'].map((s) => ({ value: s, label: t(`x.po.show.${s}`) }))} />
              </div>
              <label className="tms-choice" style={{ marginBottom: '1rem' }}>
                <input type="checkbox" name="is_published" defaultChecked />
                <span>{t('x.po.publish_now')}</span>
              </label>
              <SubmitButton>{t('x.po.create')}</SubmitButton>
            </form>
          </Card>
        ) : <Alert tone="info">{t('x.po.view_only')}</Alert>}
      </div>
    </>
  );
}
