import { getPool } from './db';
import { documentPdf, inr, latin } from './pdfDoc';

/**
 * A member's statement on the trust's letterhead: who they are, their trust
 * IDs, every membership they have held and every payment the trust has on
 * record from them. Works for members imported from the old registers as well
 * as for those who joined online. Used by the members' corner (download) and
 * by the management system (print, or e-mail to the member).
 */

const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '');
const cap = (s) => (s ? `${String(s).charAt(0).toUpperCase()}${String(s).slice(1).replace(/_/g, ' ')}` : '');

const KIND = {
  donation: 'Donation', membership_fee: 'Membership fee', sponsorship: 'Sponsorship', advertisement: 'Advertisement',
  event_fee: 'Event fee', csr_grant: 'CSR grant', book_sale: 'Book sale', interest: 'Interest', other: 'Other',
};

export async function loadMemberStatement(personId, db = getPool()) {
  const person = (await db.query(
    `select id, code, name_en, name_mr, phone, email, address, city, pincode, date_of_birth, blood_group
       from people where id = $1 and deleted_at is null`, [personId])).rows[0];
  if (!person) return null;
  const [memberships, payments, registrations] = await Promise.all([
    db.query(
      `select m.code, m.tier, m.status, m.start_date, m.expiry_date,
              (select string_agg(n.number_as_written, ', ' order by n.first_seen_fy nulls last) from membership_numbers n where n.membership_id = m.id) as old_numbers
         from memberships m where m.person_id = $1 and m.deleted_at is null
        order by m.start_date nulls last, m.created_at`, [personId]),
    db.query(
      `select i.code, i.entry_date, i.fy, i.kind, i.amount, i.mode, r.code as receipt_code, r.number_as_written as receipt_no, r.is_cancelled
         from income_entries i left join receipts r on r.id = i.receipt_id
        where i.person_id = $1 and i.deleted_at is null and i.kind not in ('loan_received', 'refund_received')
        order by i.entry_date nulls last, i.created_at`, [personId]),
    db.query(
      `select r.code, r.guests, r.status, r.created_at, e.name_en, e.event_date
         from event_registrations r join events e on e.id = r.event_id
        where r.person_id = $1 order by e.event_date nulls last, r.created_at`, [personId]),
  ]);
  return { person, memberships: memberships.rows, payments: payments.rows, registrations: registrations.rows };
}

export function memberStatementFileName(person) {
  return `PCFPT-member-statement-${latin(person.code).replace(/[^A-Za-z0-9]+/g, '-')}.pdf`;
}

export async function memberStatementPdf(personId, db = getPool()) {
  const data = await loadMemberStatement(personId, db);
  if (!data) return null;
  const { person, memberships, payments, registrations } = data;
  const live = payments.filter((p) => !p.is_cancelled);
  const total = live.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const current = memberships.find((m) => m.status === 'active') || memberships[memberships.length - 1];

  const buffer = await documentPdf({
    title: 'Member statement',
    subtitle: `Prepared on ${day(new Date())} from the trust's records. Please tell the trust if anything here needs correcting.`,
    facts: [
      ['Name', person.name_en || person.name_mr],
      ['Trust ID', person.code],
      ['Membership ID', current?.code],
      ['Membership', current ? `${cap(current.tier)} (${cap(current.status)})` : 'None on record'],
      ['Valid until', current ? (current.expiry_date ? day(current.expiry_date) : current.tier === 'platinum' ? 'Lifetime' : 'Not recorded') : ''],
      ['Mobile', person.phone],
      ['E-mail', person.email],
      ['Address', [person.address, person.city, person.pincode].filter(Boolean).join(', ')],
    ],
    sections: [
      {
        heading: 'Memberships',
        columns: [{ label: 'Membership ID', width: 2 }, { label: 'Earlier numbers', width: 2.4 }, { label: 'Type', width: 1.2 },
          { label: 'From', width: 1.5 }, { label: 'Valid until', width: 1.5 }, { label: 'Status', width: 1.4 }],
        rows: memberships.map((m) => [m.code, m.old_numbers || '', cap(m.tier), day(m.start_date),
          m.expiry_date ? day(m.expiry_date) : m.tier === 'platinum' ? 'Lifetime' : '', cap(m.status)]),
        empty: 'No membership is on record.',
      },
      {
        heading: 'Payments received by the trust',
        note: 'Receipt numbers are as printed on the receipt; the trust ID identifies the entry in the trust\'s books.',
        columns: [{ label: 'Date', width: 1.5 }, { label: 'Year', width: 1.1 }, { label: 'For', width: 1.8 }, { label: 'Receipt no.', width: 2.2 },
          { label: 'Trust ID', width: 2.6 }, { label: 'Mode', width: 1 }, { label: 'Amount (Rs.)', width: 1.5, align: 'right' }],
        rows: payments.map((p) => [day(p.entry_date), p.fy || '', KIND[p.kind] || cap(p.kind),
          `${p.receipt_no || p.receipt_code || ''}${p.is_cancelled ? ' (cancelled)' : ''}`, p.code, cap(p.mode), inr(p.amount)]),
        total: payments.length ? ['', '', '', '', 'Total (cancelled receipts left out)', '', inr(total)] : null,
        empty: 'No payment is on record.',
      },
      ...(registrations.length ? [{
        heading: 'Event registrations',
        columns: [{ label: 'Event', width: 4 }, { label: 'Event date', width: 1.5 }, { label: 'Registration ID', width: 2.4 },
          { label: 'Guests', width: 0.9, align: 'right' }, { label: 'Status', width: 1.3 }],
        rows: registrations.map((r) => [r.name_en, day(r.event_date), r.code || '', String(r.guests || 0), cap(r.status)]),
      }] : []),
    ],
    footer: `${person.code} - computer generated, needs no signature`,
  });
  return { buffer, person, fileName: memberStatementFileName(person) };
}
