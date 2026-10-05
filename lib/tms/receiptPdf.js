import { generateReceiptPDF } from '../receipt';
import { rupeesToWords } from '../numberToWords';
import { one } from './db';
import { isoDate } from './format';

/**
 * Receipt PDF for money recorded in the management system. The layout is the
 * trust's own (lib/receipt.js, shared with the online checkout); this module
 * only gathers the receipt's facts into the shape that function expects.
 */

// lib/receipt.js draws with the standard PDF fonts, which cannot show
// Devanagari. Anything outside Latin-1 is dropped so the PDF never fails.
const latin = (value, max = 90) => String(value ?? '')
  .replace(/[\r\n\t]+/g, ' ')
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
  .replace(/[^\x20-\x7e\xa0-\xff]/g, '')
  .replace(/\s+/g, ' ').trim().slice(0, max);

const KIND_TOWARDS = {
  donation: 'Donation', membership_fee: 'Membership fee', sponsorship: 'Sponsorship', advertisement: 'Advertisement',
  event_fee: 'Event fee', csr_grant: 'CSR grant', book_sale: 'Book sale', interest: 'Interest', other: 'Other receipt',
};

/** Loads an income entry with everything its receipt prints. Null when it has no receipt. */
export async function loadReceiptFacts(incomeId) {
  return one(
    `select i.id, i.code, i.amount, i.kind, i.entry_date, i.mode, i.payment_ref, i.purpose_as_written,
            i.payer_as_written, i.origin, i.deleted_at,
            r.id as receipt_id, r.code as receipt_code, r.number_as_written, r.receipt_date, r.is_cancelled, r.origin as receipt_origin,
            p.name_en, p.phone, p.email, p.address, p.city, p.pincode,
            m.code as membership_code, m.expiry_date, m.tier,
            ev.name_en as event_name, s.name_en as scheme_name
       from income_entries i
       join receipts r on r.id = i.receipt_id
       left join people p on p.id = i.person_id
       left join memberships m on m.id = i.membership_id
       left join events ev on ev.id = i.event_id
       left join schemes s on s.id = i.scheme_id
      where i.id = $1`, [incomeId]);
}

export function receiptFileName(facts) {
  return `${latin(facts.receipt_code || 'receipt').replace(/[^A-Za-z0-9]+/g, '-')}.pdf`;
}

export function towardsText(facts) {
  let towards = KIND_TOWARDS[facts.kind] || 'Receipt';
  if (facts.kind === 'membership_fee' && facts.tier) towards = `Membership ${facts.tier.charAt(0).toUpperCase()}${facts.tier.slice(1)}`;
  const detail = latin(facts.event_name || facts.scheme_name || facts.purpose_as_written || '', 24);
  return latin(detail ? `${towards} - ${detail}` : towards, 34);
}

export async function buildReceiptPdf(facts) {
  const address = [facts.address, facts.city, facts.pincode].filter(Boolean).join(', ');
  const day = isoDate(facts.receipt_date || facts.entry_date);
  const bytes = await generateReceiptPDF({
    receipt_no: latin(facts.receipt_code, 40),
    paid_at: day ? new Date(`${day}T00:00:00Z`) : new Date(),
    payer_name: latin(facts.name_en || facts.payer_as_written, 60),
    payer_address: latin(address, 95),
    payer_phone: latin(facts.phone, 20),
    payer_email: latin(facts.email, 45),
    amount: Number(facts.amount),
    amount_in_words: `${rupeesToWords(facts.amount)} Only`,
    // The form's reference line: how the money came and its number.
    // The printed form offers Cash / Cheque / Transfer; UPI, NEFT and online are all transfers.
    mode: ['cash', 'cheque'].includes(facts.mode) ? facts.mode : 'transfer',
    razorpay_payment_id: latin(`${String(facts.mode || '').toUpperCase()} ${facts.payment_ref || ''}`, 30),
    towards: towardsText(facts),
    valid_till: facts.kind === 'membership_fee' && facts.expiry_date ? new Date(`${isoDate(facts.expiry_date)}T00:00:00Z`) : null,
    membership_no: facts.kind === 'membership_fee' ? latin(facts.membership_code, 16) : null,
  });
  return Buffer.from(bytes);
}
