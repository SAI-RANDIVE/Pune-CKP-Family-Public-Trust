import { notFound } from 'next/navigation';
import { PageHead } from '../../../../../../components/tms/blocks';
import Wizard from '../../../../../../components/tms/Wizard';
import { requireRole, can } from '../../../../../../lib/tms/auth';
import { getI18n } from '../../../../../../lib/tms/i18n/server';
import { isUuid, one } from '../../../../../../lib/tms/db';
import { isoDate, pick } from '../../../../../../lib/tms/format';
import { personSteps } from '../../../../../../lib/tms/forms';
import { PERSON_ROLES } from '../../../../../../lib/tms/schemas';
import { savePerson } from '../../../../../../lib/tms/actions/people';

export const dynamic = 'force-dynamic';

export default async function EditPersonPage({ params }) {
  const admin = await requireRole('accountant');
  const { t, lang } = await getI18n();
  if (!isUuid(params.id)) notFound();
  const p = await one('select * from people where id = $1 and deleted_at is null and merged_into_id is null', [params.id]);
  if (!p) notFound();

  const initial = {
    name_en: p.name_en || '', name_mr: p.name_mr || '', roles: (p.roles || []).filter((r) => PERSON_ROLES.includes(r)),
    phone: p.phone || '', phone_alt: p.phone_alt || '', email: p.email || '', address: p.address || '', city: p.city || '',
    pincode: p.pincode || '', date_of_birth: isoDate(p.date_of_birth), blood_group: p.blood_group || '',
    pan: p.pan || '', aadhaar: p.aadhaar || '', notes: p.notes || '',
  };
  const name = pick(lang, p.name_mr, p.name_en);

  return (
    <>
      <PageHead
        title={t('people.edit_title', { name })} intro={t('people.edit_intro')}
        crumbs={[{ href: '/people', label: t('people.title') }, { href: `/people/${p.id}`, label: name }, { label: t('c.edit') }]}
      />
      <Wizard
        steps={personSteps(t, { seeIds: can(admin, 'seeIdNumbers') })} initial={initial} extra={{ id: p.id }}
        action={savePerson} cancelHref={`/people/${p.id}`} submitLabel={t('c.save_changes')}
      />
    </>
  );
}
