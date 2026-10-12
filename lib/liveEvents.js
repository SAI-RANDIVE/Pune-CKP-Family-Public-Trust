import { getPool } from './db';

/**
 * Events that the trustees have published from the management system, for the
 * public website and the members' corner. Only published events ever leave
 * this module, and only their public details: no registration lists, no
 * names, no money.
 */

const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

function shape(row) {
  const closes = iso(row.registration_closes_on);
  const today = new Date().toISOString().slice(0, 10);
  const placesLeft = row.capacity ? Math.max(0, row.capacity - Number(row.heads || 0)) : null;
  const open = Boolean(row.registration_open) && (!closes || closes >= today) && (placesLeft === null || placesLeft > 0);
  return {
    id: row.id,
    code: row.code,
    slug: row.slug,
    name: row.name_en,
    nameMr: row.name_mr,
    date: iso(row.event_date),
    time: row.starts_at_text,
    venue: row.venue,
    mapUrl: row.map_url || null,
    description: row.description_en,
    descriptionMr: row.description_mr,
    fee: Number(row.fee || 0),
    membersOnly: Boolean(row.members_only),
    registrationOpen: open,
    registrationNote: !row.registration_open ? null : (closes && closes < today) ? 'closed' : placesLeft === 0 ? 'full' : null,
    closesOn: closes,
    placesLeft,
    banner: row.banner_id ? `/api/media/${row.banner_id}` : null,
    photos: (row.photos || []).map((p) => ({ src: `/api/media/${p.id}`, caption: p.caption || '' })),
  };
}

const SELECT = `
  select e.id, e.code, e.slug, e.name_en, e.name_mr, e.event_date, e.starts_at_text, e.venue, e.map_url, e.description_en, e.description_mr,
         e.fee, e.capacity, e.members_only, e.registration_open, e.registration_closes_on,
         (select coalesce(sum(1 + r.guests), 0) from event_registrations r where r.event_id = e.id and r.status <> 'cancelled') as heads,
         (select m.id from event_media m where m.event_id = e.id and m.kind = 'banner' and m.is_public order by m.created_at desc limit 1) as banner_id,
         coalesce((select json_agg(json_build_object('id', m.id, 'caption', m.caption) order by m.sort_order, m.created_at)
                     from event_media m where m.event_id = e.id and m.kind = 'photo' and m.is_public), '[]'::json) as photos
    from events e
   where e.deleted_at is null and e.is_published`;

/**
 * Published events, soonest first: those still to come, then recent ones that
 * have photographs. `forMembers` also includes events marked "members only".
 * Never throws: if the database cannot be reached the website simply shows no
 * live events.
 */
export async function getPublishedEvents({ forMembers = false, limit = 12 } = {}) {
  try {
    const { rows } = await getPool().query(
      `${SELECT} ${forMembers ? '' : 'and not e.members_only'}
        order by (e.event_date is null or e.event_date >= current_date) desc,
                 case when e.event_date >= current_date then e.event_date end asc,
                 e.event_date desc nulls last
        limit $1`, [limit]);
    return rows.map(shape);
  } catch (err) {
    console.error('live events unavailable:', err?.message);
    return [];
  }
}

export async function getPublishedEvent(id, { forMembers = false } = {}) {
  const { rows } = await getPool().query(`${SELECT} and e.id = $1 ${forMembers ? '' : 'and not e.members_only'}`, [id]);
  return rows[0] ? shape(rows[0]) : null;
}
