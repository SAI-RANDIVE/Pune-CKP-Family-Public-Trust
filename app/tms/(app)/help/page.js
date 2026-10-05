import Link from 'next/link';
import Icon from '../../../../components/tms/icons';
import { PageHead } from '../../../../components/tms/blocks';
import { Card } from '../../../../components/tms/ui';
import { requireRole } from '../../../../lib/tms/auth';
import { getI18n } from '../../../../lib/tms/i18n/server';
import { HELP } from '../../../../lib/tms/i18n/help';

export const dynamic = 'force-dynamic';

/** Short step-by-step guides for the everyday tasks. */
export default async function HelpPage() {
  await requireRole('viewer');
  const { t, lang } = await getI18n();
  const { tasks } = HELP[lang] || HELP.mr;

  return (
    <>
      <PageHead title={t('help.title')} intro={t('help.intro')} crumbs={[{ label: t('help.title') }]}>
        <Link href="/help/quick" className="tms-btn"><Icon name="print" />{t('help.quick')}</Link>
      </PageHead>

      <nav aria-label={t('help.contents')} className="tms-card" style={{ marginBottom: '1.25rem' }}>
        <h2>{t('help.contents')}</h2>
        <ol style={{ margin: 0, paddingLeft: '1.5rem', columns: '18rem' }}>
          {tasks.map((task) => (
            <li key={task.id}><a href={`#${task.id}`} style={{ display: 'inline-block', padding: '0.35rem 0' }}>{task.title}</a></li>
          ))}
        </ol>
      </nav>

      <div className="tms-stack">
        {tasks.map((task, i) => (
          <Card key={task.id} id={task.id} title={`${i + 1}. ${task.title}`}>
            <ol style={{ margin: 0, paddingLeft: '1.5rem' }}>
              {task.steps.map((step, s) => <li key={s} style={{ marginBottom: '0.4rem' }}>{step}</li>)}
            </ol>
            {task.href && (
              <div className="tms-actions no-print" style={{ marginTop: '0.75rem' }}>
                <Link href={task.href} className="tms-btn tms-btn--secondary tms-btn--small">{task.linkLabel} ›</Link>
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
