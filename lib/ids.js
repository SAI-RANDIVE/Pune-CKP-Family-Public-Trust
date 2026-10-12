import { financialYearLabel } from './sequences';

/**
 * Uniform trust IDs. One format everywhere: SERIES/SERIAL.
 *
 *   SLV/MEM/0001  GLD/MEM/0001  PLT/MEM/0001     memberships, by tier
 *   PCFPT/PER/00001                               a person (member, donor, beneficiary, vendor)
 *   PCFPT/DON/2026-27/0001                        donation (MFE fee, SPN sponsorship, ADV advertisement,
 *                                                 EVF event fee, CSR grant, BKS book sale, INT interest, INC other)
 *   PCFPT/RCP/2026-27/0001                        receipt
 *   PCFPT/EXP/2026-27/0001                        expense voucher
 *   PCFPT/TRF/2026-27/0001                        transfer between the trust's own accounts
 *   PCFPT/FD/0001   PCFPT/INV/01                  fixed deposit, investment
 *   PCFPT/EVT/2026-27/01   PCFPT/SCH/01           event, scheme
 *   PCFPT/APP/2026-27/0001 PCFPT/DSB/2026-27/0001 scheme application, disbursement
 *   PCFPT/REG/2026-27/0001 PCFPT/PLN/2026-27/0001 event registration, event budget plan
 *
 * Serials are zero-padded to a minimum width and keep growing past it
 * (9999 is followed by 10000), so a series never runs out. Every issued ID is
 * recorded in entity_codes, which is what global search looks up.
 *
 * The same series keys are used by the archive importer
 * (data-migration/etl/40_load.py), so imported and new records share one
 * sequence. Keep the two in step.
 */

export const TIER_PREFIX = { silver: 'SLV', gold: 'GLD', platinum: 'PLT', other: 'OTH' };

export const INCOME_KIND_PREFIX = {
  donation: 'DON', membership_fee: 'MFE', sponsorship: 'SPN', advertisement: 'ADV', event_fee: 'EVF',
  csr_grant: 'CSR', book_sale: 'BKS', interest: 'INT', refund_received: 'RFD', loan_received: 'LNR', other: 'INC',
};

/** "2026-27" for any date inside April 2026 to March 2027. */
export function fiscalYear(date = new Date()) {
  const [a, b] = financialYearLabel(date).split('-');
  return `20${a}-${b}`;
}

const byFy = (prefix) => (rec) => ({ series: `PCFPT/${prefix}/${rec.fy || fiscalYear(rec.date)}`, width: 4 });

const SERIES = {
  people: () => ({ series: 'PCFPT/PER', width: 5 }),
  memberships: (rec) => ({ series: `${TIER_PREFIX[rec.tier] || 'OTH'}/MEM`, width: 4 }),
  income_entries: (rec) => byFy(INCOME_KIND_PREFIX[rec.kind] || 'INC')(rec),
  receipts: byFy('RCP'),
  expenses: byFy('EXP'),
  transfers: byFy('TRF'),
  scheme_applications: byFy('APP'),
  scheme_disbursements: byFy('DSB'),
  fixed_deposits: () => ({ series: 'PCFPT/FD', width: 4 }),
  investments: () => ({ series: 'PCFPT/INV', width: 2 }),
  schemes: () => ({ series: 'PCFPT/SCH', width: 2 }),
  bank_accounts: () => ({ series: 'PCFPT/BNK', width: 2 }),
  events: (rec) => ({ series: `PCFPT/EVT/${rec.fy || 'GEN'}`, width: 2 }),
  event_registrations: byFy('REG'),
  event_plans: byFy('PLN'),
  meetings: byFy('MTG'),
  polls: byFy('POL'),
  feedback: byFy('FBK'),
};

export function formatCode(series, seq, width) {
  return `${series}/${String(seq).padStart(width, '0')}`;
}

/**
 * Issues the next ID for a record and registers it for search. Must be called
 * with a client that is inside the same transaction as the insert, so a failed
 * insert does not leave a registered ID pointing at nothing.
 *
 * @param client  pg client (inside a transaction)
 * @param table   target table name, e.g. 'income_entries'
 * @param rec     { id, fy?, date?, tier?, kind? }
 */
export async function issueCode(client, table, rec) {
  const spec = SERIES[table];
  if (!spec) throw new Error(`No ID series is defined for table "${table}"`);
  const { series, width } = spec(rec);
  const { rows } = await client.query(
    `insert into id_sequences (key, last_seq) values ($1, 1)
     on conflict (key) do update set last_seq = id_sequences.last_seq + 1
     returning last_seq`,
    [series]
  );
  const code = formatCode(series, rows[0].last_seq, width);
  if (rec.id) {
    await client.query(
      `insert into entity_codes (code, kind, record_table, record_id) values ($1, 'system', $2, $3)`,
      [code, table, rec.id]
    );
  }
  return code;
}
