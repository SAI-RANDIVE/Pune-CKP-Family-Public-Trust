import { getPool } from './db';
import { isEmailConfigured, sendGreetingEmail } from './email';

/**
 * Birthday and wedding-anniversary greetings to members, sent once a day by
 * the scheduled job (app/api/cron/greetings). "Today" is the date in India.
 * Each greeting is recorded in greeting_log before it is counted as sent, so
 * running the job twice in a day greets nobody twice.
 */

/** { month, day, year } for today in India. */
export function todayInIndia(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

const DATE_COLUMN = { birthday: 'date_of_birth', anniversary: 'date_of_anniversary' };

/** People whose day it is: current or past members with an e-mail address. People born on 29 February are greeted on 28 February in other years. */
export async function peopleToGreet(kind, { month, day, year }, db = getPool()) {
  const column = DATE_COLUMN[kind];
  const leapDayToo = month === 2 && day === 28 && !(year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0));
  const { rows } = await db.query(
    `select p.id, p.code, coalesce(p.name_en, p.name_mr) as name, p.email, p.${column} as on_date
       from people p
      where p.deleted_at is null and p.merged_into_id is null and p.email is not null and p.email <> '' and p.${column} is not null
        and extract(month from p.${column}) = $1
        and (extract(day from p.${column}) = $2 or ($3 and extract(day from p.${column}) = 29))
        and exists (select 1 from memberships m where m.person_id = p.id and m.deleted_at is null and m.status in ('active', 'lapsed'))
        and not exists (select 1 from greeting_log g where g.person_id = p.id and g.kind = $4 and g.year = $5)
      order by p.code`, [month, day, leapDayToo, kind, year]);
  return rows;
}

/** Birthdays and anniversaries in the next `days` days, for the trustees' home screen. */
export async function upcomingOccasions(days = 14, db = getPool()) {
  const { rows } = await db.query(
    `with base as (
       select p.id, coalesce(p.name_en, p.name_mr) as name, p.name_mr, 'birthday' as kind, p.date_of_birth as on_date from people p
        where p.deleted_at is null and p.merged_into_id is null and p.date_of_birth is not null
          and exists (select 1 from memberships m where m.person_id = p.id and m.deleted_at is null and m.status in ('active', 'lapsed'))
       union all
       select p.id, coalesce(p.name_en, p.name_mr), p.name_mr, 'anniversary', p.date_of_anniversary from people p
        where p.deleted_at is null and p.merged_into_id is null and p.date_of_anniversary is not null
          and exists (select 1 from memberships m where m.person_id = p.id and m.deleted_at is null and m.status in ('active', 'lapsed'))
     ), dated as (
       select *, (make_date(extract(year from current_date)::int, extract(month from on_date)::int, least(extract(day from on_date)::int, 28))
                  + case when extract(day from on_date) > 28 then (extract(day from on_date)::int - 28) else 0 end) as this_year
         from base
     )
     select id, name, name_mr, kind, on_date,
            case when this_year < current_date then (this_year + interval '1 year')::date else this_year end as next_on
       from dated
      where (case when this_year < current_date then (this_year + interval '1 year')::date else this_year end) <= current_date + $1::int
      order by next_on, name limit 40`, [days]);
  return rows;
}

/**
 * Sends today's greetings. Returns { birthday: { sent, failed }, anniversary: { sent, failed }, skipped }.
 * `limit` caps one run so it always finishes inside a scheduled job's time limit.
 */
export async function sendTodaysGreetings({ limit = 60 } = {}) {
  const result = { birthday: { sent: 0, failed: 0 }, anniversary: { sent: 0, failed: 0 }, skipped: null };
  if (!isEmailConfigured()) return { ...result, skipped: 'E-mail is not set up' };
  const today = todayInIndia();
  const pool = getPool();
  let budget = limit;

  for (const kind of ['birthday', 'anniversary']) {
    const people = await peopleToGreet(kind, today, pool);
    for (const person of people) {
      if (budget <= 0) break;
      budget -= 1;
      // Claim the greeting first: if two runs overlap, only one wins this insert.
      const claim = await pool.query(
        `insert into greeting_log (person_id, kind, year, status) values ($1,$2,$3,'sent') on conflict do nothing returning person_id`,
        [person.id, kind, today.year]);
      if (!claim.rows.length) continue;
      try {
        const years = person.on_date ? today.year - new Date(person.on_date).getUTCFullYear() : null;
        await sendGreetingEmail({ to: person.email, name: person.name, kind, years: kind === 'anniversary' && years > 0 && years < 90 ? years : null });
        result[kind].sent += 1;
      } catch (err) {
        console.error(`[greetings] ${kind} e-mail failed for ${person.code}:`, err?.message);
        await pool.query("update greeting_log set status = 'failed' where person_id = $1 and kind = $2 and year = $3", [person.id, kind, today.year]);
        result[kind].failed += 1;
      }
    }
  }
  return result;
}
