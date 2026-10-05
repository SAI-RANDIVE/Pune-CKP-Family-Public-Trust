import { getPool } from '../db';

/** Parameterised query. Never build SQL from user input; pass values as params. */
export async function q(text, params = []) {
  const { rows } = await getPool().query(text, params);
  return rows;
}

export async function one(text, params = []) {
  const rows = await q(text, params);
  return rows[0] || null;
}

/** Runs fn inside a transaction; commits on return, rolls back on any throw. */
export async function tx(fn) {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (value) => UUID_RE.test(String(value || ''));

/**
 * Collects WHERE conditions with numbered parameters:
 *   const w = new Where(); w.add('fy = ?', fy); w.sql -> 'where fy = $1'
 * Each "?" in a condition is replaced by the next parameter number.
 */
export class Where {
  constructor(base = []) {
    this.conds = [...base];
    this.params = [];
  }

  add(cond, ...values) {
    let text = cond;
    for (const value of values) {
      this.params.push(value);
      text = text.replace('?', `$${this.params.length}`);
    }
    this.conds.push(text);
    return this;
  }

  /** Adds a parameter without a condition and returns its placeholder ($n). */
  param(value) {
    this.params.push(value);
    return `$${this.params.length}`;
  }

  get sql() {
    return this.conds.length ? `where ${this.conds.join(' and ')}` : '';
  }
}

export const PAGE_SIZE = 20;

/** Page number from a query string, never below 1. */
export function pageOf(searchParams) {
  const n = Number.parseInt(searchParams?.page, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100000) : 1;
}

/** Trims a free-text query parameter to something safe to search with. */
export function textParam(value, max = 80) {
  return String(Array.isArray(value) ? value[0] : value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

/** Returns the value only if it is one of the allowed options. */
export function oneOf(value, allowed, fallback = '') {
  const v = Array.isArray(value) ? value[0] : value;
  return allowed.includes(v) ? v : fallback;
}

/** Escapes the LIKE wildcards in user text, then wraps it for a contains-search. */
export function likeParam(text) {
  return `%${String(text).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
