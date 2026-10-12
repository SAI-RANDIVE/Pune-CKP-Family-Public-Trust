import { getPool } from '../db';

/**
 * "Something a visitor can see has changed." Each topic has a counter in
 * live_state; pages that are open listen for it to move (see
 * app/api/live/[topic]/route.js) and refresh themselves, so a banner or photo
 * added by a trustee appears on members' screens without a reload.
 */
export const LIVE_TOPICS = ['events', 'polls'];

export async function bumpLive(topic) {
  if (!LIVE_TOPICS.includes(topic)) return;
  try {
    await getPool().query(
      `insert into live_state (topic, version) values ($1, 1)
       on conflict (topic) do update set version = live_state.version + 1, updated_at = now()`, [topic]);
  } catch (err) {
    // A missed refresh signal must never fail the change that caused it.
    console.error('[live] could not signal', topic, err?.message);
  }
}

export async function liveVersion(topic) {
  const { rows } = await getPool().query('select version from live_state where topic = $1', [topic]);
  return rows[0] ? String(rows[0].version) : '0';
}
