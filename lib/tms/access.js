/**
 * Who may open which part of the management system.
 *
 * A login's role sets the ceiling (viewer < accountant < admin < super_admin).
 * On top of that the Chairman can narrow one login section by section:
 *
 *   none   the section does not exist for this login: not in the menu, not in
 *          search, not on the home screen, and its addresses answer "no access"
 *   view   may look, may not add or change
 *   edit   whatever the role allows (the default)
 *
 * and switch off two sensitive abilities: seeing Aadhaar and PAN numbers and
 * downloading Excel files and backups.
 * Restrictions never apply to a Super Admin, so the trust can never
 * lock itself out.
 *
 * Pure functions, no imports: used by the server guards, the pages and the
 * settings screen alike.
 */

export const AREAS = ['donations', 'expenses', 'members', 'deposits', 'schemes', 'events', 'meetings', 'community', 'reports', 'bank', 'review'];
export const LEVELS = ['none', 'view', 'edit'];
export const FLAGS = ['seeIdNumbers', 'export'];

/** First path segment(s) -> section. Longest prefix wins. */
const PATHS = [
  ['/donations', 'donations'], ['/receipts', 'donations'], ['/payments', 'donations'], ['/emails', 'donations'],
  ['/api/tms/receipt', 'donations'],
  ['/expenses', 'expenses'], ['/transfers', 'expenses'],
  ['/members', 'members'], ['/people', 'members'], ['/officers', 'members'], ['/portal', 'members'],
  ['/api/tms/member-pdf', 'members'],
  ['/deposits', 'deposits'], ['/investments', 'deposits'],
  ['/schemes', 'schemes'],
  ['/events', 'events'], ['/planner', 'events'], ['/api/tms/events', 'events'], ['/api/tms/planner', 'events'],
  ['/meetings', 'meetings'], ['/api/tms/meetings', 'meetings'],
  ['/polls', 'community'], ['/feedback', 'community'],
  ['/reports', 'reports'], ['/api/tms/export', 'reports'],
  ['/bank', 'bank'],
  ['/review', 'review'], ['/source', 'review'],
];

export function areaOfPath(pathname) {
  const path = String(pathname || '').replace(/^\/tms(?=\/|$)/, '') || '/';
  let best = null;
  for (const [prefix, area] of PATHS) {
    if ((path === prefix || path.startsWith(`${prefix}/`)) && (!best || prefix.length > best[0].length)) best = [prefix, area];
  }
  return best ? best[1] : null;
}

/** Which section a kind of record belongs to (used to filter search results). */
const TABLE_AREA = {
  people: 'members', memberships: 'members', membership_snapshots: 'members', trust_officers: 'members',
  receipts: 'donations', income_entries: 'donations',
  expenses: 'expenses', transfers: 'expenses',
  fixed_deposits: 'deposits', fd_events: 'deposits', investments: 'deposits', investment_transactions: 'deposits',
  scheme_applications: 'schemes', scheme_disbursements: 'schemes', scheme_repayments: 'schemes', schemes: 'schemes',
  events: 'events', event_account_lines: 'events', event_registrations: 'events', event_plans: 'events',
  bank_transactions: 'bank', bank_accounts: 'bank',
  meetings: 'meetings', polls: 'community', feedback: 'community',
};
export const areaOfTable = (table) => TABLE_AREA[table] || 'reports';

const settings = (admin) => (admin?.permissions && typeof admin.permissions === 'object' ? admin.permissions : {});

/** 'none' | 'view' | 'edit' for one section. */
export function areaLevel(admin, area) {
  if (!admin) return 'none';
  if (admin.role === 'super_admin' || !AREAS.includes(area)) return 'edit';
  const level = settings(admin).areas?.[area];
  return LEVELS.includes(level) ? level : 'edit';
}

export const canSee = (admin, area) => areaLevel(admin, area) !== 'none';
export const canChange = (admin, area) => areaLevel(admin, area) === 'edit';

/** A sensitive ability: true unless the Chairman switched it off for this login. */
export function flagAllowed(admin, flag) {
  if (!admin) return false;
  if (admin.role === 'super_admin') return true;
  return settings(admin).flags?.[flag] !== false;
}

/** Cleans what the settings form sends into the stored shape. Unknown keys are dropped. */
export function normalisePermissions(input) {
  const areas = {};
  for (const area of AREAS) {
    const level = input?.areas?.[area];
    if (LEVELS.includes(level) && level !== 'edit') areas[area] = level;
  }
  const flags = {};
  for (const flag of FLAGS) {
    if (input?.flags?.[flag] === false) flags[flag] = false;
  }
  return { areas, flags };
}
