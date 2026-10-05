import { PageHead } from '../../../../../components/tms/blocks';
import Wizard from '../../../../../components/tms/Wizard';
import { requireRole, can } from '../../../../../lib/tms/auth';
import { getI18n } from '../../../../../lib/tms/i18n/server';
import { loadDraft, personSteps } from '../../../../../lib/tms/forms';
import { savePerson } from '../../../../../lib/tms/actions/people';
import { saveDraft, clearDraft } from '../../../../../lib/tms/actions/drafts';

export const dynamic = 'force-dynamic';

export default async function NewPersonPage() {
  const admin = await requireRole('accountant');
  const { t } = await getI18n();
  const draft = await loadDraft(admin, 'person:new');

  return (
    <>
      <PageHead title={t('people.add')} intro={t('people.add_intro')} crumbs={[{ href: '/people', label: t('people.title') }, { label: t('people.add') }]} />
      <Wizard
        steps={personSteps(t, { seeIds: can(admin, 'seeIdNumbers') })}
        initial={draft || { roles: [] }} fresh={{ roles: [] }} hadDraft={Boolean(draft)}
        action={savePerson} formKey="person:new" saveDraft={saveDraft} clearDraft={clearDraft}
        cancelHref="/people" submitLabel={t('people.save')}
      />
    </>
  );
}
