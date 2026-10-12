import { getPool } from './db';

/**
 * Polls: a question, a few options, an opening and a closing time, and one
 * vote per member. Shared by the members' corner and the trustees' screens.
 */

/** Tally for one poll: [{ label, votes, pct }], total. */
export function tally(options, counts) {
  const total = counts.reduce((sum, c) => sum + c.n, 0);
  return {
    total,
    rows: options.map((label, index) => {
      const votes = counts.find((c) => c.option_index === index)?.n || 0;
      return { label, votes, pct: total ? Math.round((votes / total) * 100) : 0 };
    }),
  };
}

/**
 * Published polls for a member, open ones first. For each: whether it is open,
 * what the member chose (if anything), and the results when they may be seen
 * (always / after voting / only after the poll closes).
 */
export async function pollsForMember(personId, db = getPool()) {
  const { rows } = await db.query(
    `select p.id, p.code, p.question, p.description, p.options, p.opens_at, p.closes_at, p.show_results,
            (now() between p.opens_at and p.closes_at) as open, (now() > p.closes_at) as closed,
            (select option_index from poll_votes v where v.poll_id = p.id and v.person_id = $1) as my_vote,
            coalesce((select json_agg(json_build_object('option_index', t.option_index, 'n', t.n))
                        from (select option_index, count(*)::int as n from poll_votes v where v.poll_id = p.id group by option_index) t), '[]'::json) as counts
       from polls p
      where p.is_published and p.deleted_at is null and p.opens_at <= now() and p.closes_at > now() - interval '60 days'
      order by (now() < p.closes_at) desc, p.closes_at desc
      limit 30`, [personId]);
  return rows.map((p) => {
    const voted = p.my_vote !== null && p.my_vote !== undefined;
    const mayShow = p.show_results === 'always' || (p.show_results === 'after_vote' && (voted || p.closed)) || (p.show_results === 'after_close' && p.closed);
    return {
      id: p.id, code: p.code, question: p.question, description: p.description, options: p.options,
      closesAt: new Date(p.closes_at).toISOString(), open: p.open, closed: p.closed,
      myVote: voted ? p.my_vote : null,
      results: mayShow ? tally(p.options, p.counts) : null,
      resultsWhen: p.show_results,
    };
  });
}
