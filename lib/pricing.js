/**
 * Membership pricing rules, translated from the trust's own membership notice
 * (in effect from 1 September 2024). These are the ASSUMPTIONS this code makes
 * explicit — review them with the trustees and adjust before going live:
 *
 * SILVER — ₹1,000 / year.
 *   First-time signup: the very first period always runs to the next
 *   "cycle boundary" (30 June or 31 December) that is at least 12 months
 *   after the join date, prorated at ₹1,000/12 per month, PLUS a one-time
 *   ₹100 registration fee.
 *   e.g. joining 1 Oct 2024 → covers 1 Oct 2024 to 31 Dec 2025 (15 months)
 *        = ₹1,250 + ₹100 registration = ₹1,350.
 *   Renewal: flat ₹1,000, extends the existing valid-till date by exactly
 *   one year (no registration fee).
 *
 * GOLD — ₹5,000 flat, valid for 5 years from the join/renewal date.
 *
 * PLATINUM — ₹10,000 flat, lifetime membership (no expiry).
 *
 * DONATIONS — any amount from ₹100 up to ₹10,000 (per the trust's request
 * to only handle small donations online; larger donations should still be
 * routed to the bank transfer details on the Contact page).
 */

const SILVER_ANNUAL_FEE = 1000;
const SILVER_MONTHLY_RATE = SILVER_ANNUAL_FEE / 12;
export const FORM_FEE = 100;
const GOLD_FEE = 5000;
const GOLD_YEARS = 5;
const PLATINUM_FEE = 10000;

export const DONATION_MIN = 100;
export const DONATION_MAX = 10000;

function atUTC(y, m, d) {
  return new Date(Date.UTC(y, m, d));
}

/** Next 30-June or 31-December that falls on/after `minDate` (comparing by month only). */
function nextCycleBoundary(minDate) {
  const y = minDate.getUTCFullYear();
  const candidates = [
    atUTC(y, 5, 30),   // 30 June
    atUTC(y, 11, 31),  // 31 December
    atUTC(y + 1, 5, 30),
  ];
  return candidates.find((c) => c.getTime() >= minDate.getTime());
}

function addMonthsUTC(date, months) {
  return atUTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate());
}

function addYearsUTC(date, years) {
  return atUTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate());
}

/** Whole calendar months spanned between two dates, inclusive of both end months. */
function monthsSpanned(start, end) {
  return (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth()) + 1;
}

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Compute the fee + validity for a NEW membership.
 * @param {'silver'|'gold'|'platinum'} type
 * @param {Date} startDate - defaults to today (UTC)
 */
export function computeNewMembership(type, startDate = new Date()) {
  const start = atUTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

  if (type === 'silver') {
    const minEnd = addMonthsUTC(start, 12);
    const validTill = nextCycleBoundary(minEnd);
    const months = monthsSpanned(start, validTill);
    const membershipFee = Math.round(SILVER_MONTHLY_RATE * months);
    return {
      type,
      months,
      membershipFee,
      registrationFee: FORM_FEE,
      totalAmount: membershipFee + FORM_FEE,
      validFrom: toISODate(start),
      validTill: toISODate(validTill),
    };
  }

  if (type === 'gold') {
    const validTill = addYearsUTC(start, GOLD_YEARS);
    return {
      type,
      membershipFee: GOLD_FEE,
      registrationFee: FORM_FEE,
      totalAmount: GOLD_FEE + FORM_FEE,
      validFrom: toISODate(start),
      validTill: toISODate(validTill),
    };
  }

  if (type === 'platinum') {
    return {
      type,
      membershipFee: PLATINUM_FEE,
      registrationFee: FORM_FEE,
      totalAmount: PLATINUM_FEE + FORM_FEE,
      validFrom: toISODate(start),
      validTill: null, // lifetime
    };
  }

  throw new Error(`Unknown membership type: ${type}`);
}

/**
 * Compute the fee + new validity for a RENEWAL.
 * @param {'silver'|'gold'|'platinum'} type
 * @param {string} currentValidTill - ISO date string of the existing expiry
 */
export function computeRenewal(type, currentValidTill) {
  if (!currentValidTill) {
    throw new Error('Cannot renew a membership with no expiry (platinum is lifetime).');
  }
  const [y, m, d] = currentValidTill.split('-').map(Number);
  const current = atUTC(y, m - 1, d);
  const today = new Date();
  const todayUTC = atUTC(today.getFullYear(), today.getMonth(), today.getDate());
  // Renewal always extends from the later of "today" and the current expiry,
  // so a lapsed membership still gets a clean 1 (or 5) year extension.
  const base = current.getTime() > todayUTC.getTime() ? current : todayUTC;

  if (type === 'silver') {
    const validTill = addYearsUTC(base, 1);
    return {
      type,
      membershipFee: SILVER_ANNUAL_FEE,
      registrationFee: 0,
      totalAmount: SILVER_ANNUAL_FEE,
      validFrom: toISODate(addMonthsUTC(base, 0)),
      validTill: toISODate(validTill),
    };
  }

  if (type === 'gold') {
    const validTill = addYearsUTC(base, GOLD_YEARS);
    return {
      type,
      membershipFee: GOLD_FEE,
      registrationFee: 0,
      totalAmount: GOLD_FEE,
      validFrom: toISODate(base),
      validTill: toISODate(validTill),
    };
  }

  if (type === 'platinum') {
    return {
      type,
      membershipFee: PLATINUM_FEE,
      registrationFee: 0,
      totalAmount: PLATINUM_FEE,
      validFrom: toISODate(base),
      validTill: null,
    };
  }

  throw new Error(`Membership type "${type}" does not support renewal.`);
}

export function validateDonationAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < DONATION_MIN || n > DONATION_MAX) {
    throw new Error(`Donation amount must be between ₹${DONATION_MIN} and ₹${DONATION_MAX}.`);
  }
  return Math.round(n);
}

export const MEMBERSHIP_LABELS = {
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
};
