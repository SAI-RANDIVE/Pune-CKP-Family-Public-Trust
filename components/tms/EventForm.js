import { TextAreaField, TextField } from './ui';
import { SubmitButton } from './client';
import { isoDate } from '../../lib/tms/format';

/**
 * The details of an event that members can see: what, when, where, whether it
 * is shown on the website and whether registration is open. Used for adding
 * an event and for changing one. `t` arrives from the page.
 */
export default function EventForm({ t, action, event = null }) {
  const e = event || {};
  const check = (name, label, hint, on) => (
    <label className="tms-choice" style={{ alignItems: 'flex-start' }}>
      <input type="checkbox" name={name} defaultChecked={on} />
      <span>{label}<small className="muted" style={{ display: 'block', fontWeight: 500 }}>{hint}</small></span>
    </label>
  );
  return (
    <form action={action}>
      {e.id && <input type="hidden" name="id" value={e.id} />}
      <div className="tms-grid tms-grid--2">
        <TextField label={t('x.ev.name_en')} name="name_en" required minLength={2} maxLength={160} defaultValue={e.name_en || ''} placeholder="Diwali Delight 2026" hint={t('x.ev.name_en_hint')} />
        <TextField label={t('x.ev.name_mr')} name="name_mr" optional={t('c.optional')} maxLength={160} defaultValue={e.name_mr || ''} placeholder="दिवाळी डिलाइट २०२६" />
        <TextField label={t('f.date')} name="event_date" type="date" optional={t('c.optional')} defaultValue={isoDate(e.event_date) || ''} />
        <TextField label={t('x.ev.time')} name="starts_at_text" optional={t('c.optional')} maxLength={40} defaultValue={e.starts_at_text || ''} placeholder="5:30 pm" />
      </div>
      <TextField label={t('x.ev.venue')} name="venue" optional={t('c.optional')} maxLength={200} defaultValue={e.venue || ''} placeholder="Sarathi Hall, Kothrud, Pune" />
      <TextField label={t('x.ev.map')} name="map_url" type="url" optional={t('c.optional')} maxLength={500} defaultValue={e.map_url || ''} placeholder="https://maps.app.goo.gl/..." hint={t('x.ev.map_hint')} />
      <TextAreaField label={t('x.ev.desc_en')} name="description_en" optional={t('c.optional')} maxLength={3000} rows={4} defaultValue={e.description_en || ''} hint={t('x.ev.desc_hint')} />
      <TextAreaField label={t('x.ev.desc_mr')} name="description_mr" optional={t('c.optional')} maxLength={3000} rows={4} defaultValue={e.description_mr || ''} />
      <div className="tms-grid tms-grid--2">
        <TextField label={t('x.ev.fee')} name="fee" inputMode="decimal" optional={t('c.optional')} defaultValue={Number(e.fee) > 0 ? String(Number(e.fee)) : ''} placeholder="0" hint={t('x.ev.fee_hint')} />
        <TextField label={t('x.ev.capacity')} name="capacity" inputMode="numeric" optional={t('c.optional')} defaultValue={e.capacity ?? ''} placeholder="150" hint={t('x.ev.capacity_hint')} />
        <TextField label={t('x.ev.closes')} name="registration_closes_on" type="date" optional={t('c.optional')} defaultValue={isoDate(e.registration_closes_on) || ''} hint={t('x.ev.closes_hint')} />
      </div>
      <fieldset className="tms-field" style={{ border: 0, padding: 0 }}>
        <legend className="tms-label">{t('x.ev.visibility')}</legend>
        <div className="tms-grid tms-grid--3">
          {check('is_published', t('x.ev.published'), t('x.ev.published_hint'), Boolean(e.is_published))}
          {check('registration_open', t('x.ev.reg_open'), t('x.ev.reg_open_hint'), Boolean(e.registration_open))}
          {check('members_only', t('x.ev.members_only'), t('x.ev.members_only_hint'), e.id ? Boolean(e.members_only) : true)}
        </div>
      </fieldset>
      <SubmitButton className="tms-btn tms-btn--big">{e.id ? t('c.save_changes') : t('x.ev.add')}</SubmitButton>
    </form>
  );
}
