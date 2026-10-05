/** Fixed lists shared by forms, actions and pages. Pure data. */

export const OFFICER_TITLES = [
  { key: 'president', en: 'President', mr: 'अध्यक्ष', order: 10 },
  { key: 'vice_president', en: 'Vice President', mr: 'उपाध्यक्ष', order: 20 },
  { key: 'secretary', en: 'Secretary', mr: 'सचिव', order: 30 },
  { key: 'joint_secretary', en: 'Joint Secretary', mr: 'सहसचिव', order: 40 },
  { key: 'treasurer', en: 'Treasurer', mr: 'कोषाध्यक्ष', order: 50 },
  { key: 'trustee', en: 'Trustee', mr: 'विश्वस्त', order: 60 },
  { key: 'committee_member', en: 'Committee Member', mr: 'समिती सदस्य', order: 70 },
];

export const MEMBERSHIP_STATUSES = ['active', 'lapsed', 'discontinued', 'converted'];
export const ALL_TIERS = ['silver', 'gold', 'platinum', 'other'];
export const FD_STATUSES = ['active', 'matured', 'renewed', 'closed', 'unknown'];
export const TRANSFER_KINDS = ['own_account', 'fd_placement', 'fd_closure', 'sip', 'petty_cash', 'reversal', 'other'];
export const REVIEW_STATUSES = ['open', 'approved', 'rejected', 'resolved', 'merged'];
export const SEVERITIES = ['high', 'medium', 'low'];

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const UPLOAD_TABLES = ['expenses', 'income_entries', 'fixed_deposits', 'scheme_disbursements', 'scheme_applications'];

export const TONE_BY_STATUS = {
  active: 'ok', paid: 'ok', approved: 'ok', resolved: 'ok', merged: 'ok', sent: 'ok',
  lapsed: 'warn', planned: 'warn', open: 'warn', matured: 'warn', created: 'warn', received: 'warn', unknown: 'warn', medium: 'warn',
  discontinued: 'error', rejected: 'error', failed: 'error', cancelled: 'error', high: 'error',
  converted: 'neutral', closed: 'neutral', renewed: 'neutral', low: 'neutral', refunded: 'neutral', partially_refunded: 'neutral', disbursed: 'ok',
};
