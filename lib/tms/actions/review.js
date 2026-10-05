'use server';

import { redirect } from 'next/navigation';
import { writeAudit } from '../../adminAuth';
import { tx, isUuid } from '../db';
import { clientIp, safeNext } from '../auth';
import { guardForm, tryForm, withParam } from '../actionKit';
import { optText } from '../schemas';
import { REVIEWABLE } from '../records';
import { maskId } from '../format';

const DECISIONS = { approve: 'approved', reject: 'rejected', resolve: 'resolved' };

/** One-tap decision on an item of the import review queue. */
export async function decideReview(formData) {
  const back = safeNext(String(formData.get('back') || '/review'));
  const admin = await guardForm('admin', { back });
  const id = String(formData.get('id') || '');
  const status = DECISIONS[String(formData.get('decision') || '')];
  const note = optText(500).safeParse(formData.get('note'));
  if (!isUuid(id) || !status) redirect(withParam(back, 'err', 'required'));
  if (!note.success) redirect(withParam(back, 'err', 'too_long'));
  // Saying no, or "dealt with elsewhere", needs a word of explanation for the next reader.
  if (status !== 'approved' && (!note.data || note.data.length < 3)) redirect(withParam(back, 'err', 'note'));

  await tryForm(back, 'decideReview', () => tx(async (client) => {
    const { rows } = await client.query('select * from import_review_queue where id = $1 for update', [id]);
    const before = rows[0];
    if (!before) throw new Error('NOT_FOUND');
    if (before.status !== 'open') throw new Error('CONFLICT');
    const updated = await client.query(
      `update import_review_queue set status = $2, decided_by = $3, decided_at = now(), decision_note = $4
        where id = $1 returning *`, [id, status, admin.id, note.data]);

    // Once nothing is open against a record, it no longer needs review.
    if (status !== 'rejected' && before.record_id && REVIEWABLE.includes(before.record_table)) {
      await client.query(
        `update ${before.record_table} set needs_review = false
          where id = $1 and not exists (
            select 1 from import_review_queue q where q.record_table = $2 and q.record_id = $1 and q.status = 'open')`,
        [before.record_id, before.record_table]);
    }
    await writeAudit({
      client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
      action: `review_${status}`, entity: 'import_review_queue', entityId: id,
      before: { status: before.status }, after: { status, note: note.data },
      detail: { kind: before.kind, title: before.title, record_table: before.record_table, record_id: before.record_id },
    });
  }));
  redirect(withParam(back, 'ok', 'decided'));
}

const FILL = ['name_mr', 'phone', 'phone_alt', 'email', 'address', 'city', 'pincode', 'pan', 'aadhaar',
  'date_of_birth', 'date_of_anniversary', 'blood_group', 'legacy_member_id'];
const masked = (row) => ({ ...row, pan: row.pan ? maskId(row.pan) : null, aadhaar: row.aadhaar ? maskId(row.aadhaar) : null });

/**
 * Merges two people records that are the same person. Everything that pointed
 * at the record being retired is moved to the one that is kept; the retired
 * record stays in the database marked merged_into_id, so its old ID still
 * finds the person. Admin + e-mailed code.
 */
export async function mergePeople(formData) {
  const id = String(formData.get('id') || '');
  const back = isUuid(id) ? `/review/duplicates/${id}` : '/review/duplicates';
  const admin = await guardForm('admin', { otp: true, back });
  const keepSide = String(formData.get('keep') || '');
  if (!isUuid(id) || !['a', 'b'].includes(keepSide)) redirect(withParam(back, 'err', 'required'));

  await tryForm(back, 'mergePeople', () => tx(async (client) => {
    const { rows: cands } = await client.query('select * from person_merge_candidates where id = $1 for update', [id]);
    const cand = cands[0];
    if (!cand) throw new Error('NOT_FOUND');
    if (cand.status !== 'open') throw new Error('CONFLICT');
    const keepId = keepSide === 'a' ? cand.person_a : cand.person_b;
    const loseId = keepSide === 'a' ? cand.person_b : cand.person_a;

    const { rows: people } = await client.query(
      'select * from people where id = any($1::uuid[]) and deleted_at is null and merged_into_id is null order by id for update', [[keepId, loseId]]);
    const keep = people.find((p) => p.id === keepId);
    const lose = people.find((p) => p.id === loseId);
    if (!keep || !lose) throw new Error('CONFLICT');

    // 1. Move every reference.
    const moved = {};
    for (const [table, column] of [
      ['memberships', 'person_id'], ['membership_snapshots', 'person_id'], ['income_entries', 'person_id'],
      ['expenses', 'payee_person_id'], ['scheme_disbursements', 'person_id'], ['scheme_applications', 'person_id'],
      ['event_account_lines', 'person_id'], ['trust_officers', 'person_id'], ['admin_users', 'person_id'],
    ]) {
      const res = await client.query(`update ${table} set ${column} = $1 where ${column} = $2`, [keepId, loseId]);
      if (res.rowCount) moved[table] = res.rowCount;
    }
    await client.query(
      `insert into person_name_variants (person_id, name, source)
       select $1, name, source from person_name_variants where person_id = $2
       on conflict (person_id, name) do nothing`, [keepId, loseId]);
    await client.query('delete from person_name_variants where person_id = $1', [loseId]);
    for (const name of [lose.name_en, lose.name_mr]) {
      if (name && name !== keep.name_en && name !== keep.name_mr) {
        await client.query(
          `insert into person_name_variants (person_id, name, source) values ($1, $2, 'merged record')
           on conflict (person_id, name) do nothing`, [keepId, name]);
      }
    }

    // 2. Other "possible duplicate" pairs that mention the retired record.
    await client.query(
      `delete from person_merge_candidates c
        where c.id <> $3 and (
              (c.person_a = $2 and (c.person_b = $1 or exists (select 1 from person_merge_candidates x where x.id <> c.id and
                   ((x.person_a = $1 and x.person_b = c.person_b) or (x.person_a = c.person_b and x.person_b = $1)))))
           or (c.person_b = $2 and (c.person_a = $1 or exists (select 1 from person_merge_candidates x where x.id <> c.id and
                   ((x.person_a = $1 and x.person_b = c.person_a) or (x.person_a = c.person_a and x.person_b = $1))))))`,
      [keepId, loseId, id]);
    await client.query('update person_merge_candidates set person_a = $1 where person_a = $2 and id <> $3', [keepId, loseId, id]);
    await client.query('update person_merge_candidates set person_b = $1 where person_b = $2 and id <> $3', [keepId, loseId, id]);

    // 3. Fill gaps in the kept record from the retired one; never overwrite.
    const sets = FILL.map((col) => `${col} = coalesce(k.${col}, l.${col})`).join(', ');
    const { rows: after } = await client.query(
      `update people k set ${sets},
              roles = (select coalesce(array_agg(distinct r), '{}') from unnest(k.roles || l.roles) r),
              notes = nullif(concat_ws(E'\n', k.notes, l.notes), ''),
              updated_at = now()
         from people l where k.id = $1 and l.id = $2 returning k.*`, [keepId, loseId]);

    // 4. Retire the other record.
    await client.query(
      'update people set merged_into_id = $1, deleted_at = now(), updated_at = now() where id = $2', [keepId, loseId]);
    await client.query(
      `update person_merge_candidates set status = 'merged', decided_by = $2, decided_at = now() where id = $1`, [id, admin.id]);

    await writeAudit({
      client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
      action: 'people_merged', entity: 'people', entityId: keepId,
      before: { kept: masked(keep), retired: masked(lose) }, after: masked(after[0]),
      detail: { kept: keep.code, retired: lose.code, moved, candidate: id },
    });
  }));
  redirect('/review/duplicates?ok=merged');
}

/** The two records are different people: close the suggestion. */
export async function notSamePerson(formData) {
  const admin = await guardForm('admin', { back: '/review/duplicates' });
  const id = String(formData.get('id') || '');
  if (!isUuid(id)) redirect('/review/duplicates?err=required');

  await tryForm('/review/duplicates', 'notSamePerson', () => tx(async (client) => {
    const { rows } = await client.query('select * from person_merge_candidates where id = $1 for update', [id]);
    if (!rows.length) throw new Error('NOT_FOUND');
    if (rows[0].status !== 'open') throw new Error('CONFLICT');
    await client.query(
      `update person_merge_candidates set status = 'rejected', decided_by = $2, decided_at = now() where id = $1`, [id, admin.id]);
    await writeAudit({
      client, adminId: admin.id, adminEmail: admin.email, ip: clientIp(),
      action: 'people_not_same', entity: 'person_merge_candidates', entityId: id,
      before: { status: 'open' }, after: { status: 'rejected' }, detail: { person_a: rows[0].person_a, person_b: rows[0].person_b },
    });
  }));
  redirect('/review/duplicates?ok=decided');
}
