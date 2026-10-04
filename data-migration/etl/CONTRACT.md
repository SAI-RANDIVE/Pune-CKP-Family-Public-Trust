# ETL contract: what a transform must produce

The pipeline is: `10_extract.py` (done: `staging/raw/<file_id>.jsonl`) → transforms
(`etl/transforms/t_<domain>.py`) → `25_people.py` (identity resolution) → `30_validate.py`
→ `40_load.py` (Postgres) → `50_reconcile.py`. Transforms never touch the database.

## Rules

1. Read cells only through `lib.raw_rows(file_id, sheet)`; never open the source archive.
2. Emit with `Staging.emit(table, key, record, sources)`. Every record lists the exact
   source row(s) it came from. A transaction found in several sheets is emitted ONCE,
   from the canonical sheet, with the other rows added as `role="duplicate"` or
   `role="enrichment"` sources.
3. Never drop, round or correct a figure silently. A row that is not imported is counted
   with `st.skip("reason")`. Anything doubtful is still imported with `needs_review: true`
   AND described with `st.review(...)`; anything that cannot be imported (no amount, no
   date and no way to place it) goes to `st.review(...)` only.
4. Keep the original text: every normalised field has an `*_as_written` twin.
5. Deterministic and re-runnable: same input, same keys, same output. No randomness, no
   `today()` in keys.
6. Keys are stable natural keys prefixed by the domain, unique per table.
7. Use `lib.parse_date`, `parse_amount`, `fy_of`, `norm_phones`, `norm_pan`,
   `norm_aadhaar`, `norm_email`, `norm_mode`, `clean_text`, `name_key`. If a date note
   is `ambiguous_dmy`, `text_month_first` or `unparsed`, or an amount note is `unparsed`
   or starts with `rounded_from`, raise a review item.
8. Module shape: `def run(): st = Staging("<domain>"); ...; return st.close()` plus
   `if __name__ == "__main__": run()`. Support `--dry-run` is not needed (transforms only
   write under `staging/clean/<domain>/`).

## People

Do not create `people` records. Wherever a record refers to a person, put a `person`
object in it; the resolver turns mentions into `people` and merge candidates:

```json
"person": {"name": "as written", "phone": "9876543210", "phone_alt": null, "email": null,
           "pan": null, "aadhaar": null, "address": null, "city": null, "pincode": null,
           "dob": "1960-01-31", "anniversary": null, "blood_group": null,
           "role": "member | donor | beneficiary | vendor | trustee",
           "hint": "any stable id that says two mentions are the same person, e.g. 'memno:PLM/21/061'"}
```

Organisations (companies, other trusts, shops) are also `person` mentions; add
`"is_org": true`.

## Cross-references (resolved by the loader)

| Field | Refers to |
|---|---|
| `event_slug` | `mappings/events.csv` slug |
| `scheme_slug` | `mappings/schemes.csv` slug |
| `fund_code` | `mappings/funds.csv` code |
| `bank_slug` | `mappings/bank_accounts.csv` slug (also `from_bank_slug`, `to_bank_slug` on transfers) |
| `category_code` | code in `mappings/expense_heads.csv` / `mappings/income_purposes.csv` |
| `membership_key`, `receipt_key`, `fixed_deposit_key`, `investment_key`, `statement_key`, `budget_key`, `disbursement_key`, `renewed_from_key` | `_key` of a staged record in the corresponding table (any domain) |

If you need an event, scheme or fund that is not in the mapping file, append a line to the
CSV (same columns) and say so in your report.

## Tables and their columns

Column names are those of `sql/004-tms-core.sql` and `sql/005-tms-money.sql`, minus `id`,
`code`, `import_batch_id`, `content_fingerprint`, `origin` and timestamps (the loader sets
those; `code` is the new uniform trust ID, issued at load in date order). Foreign-key
columns are replaced by the cross-reference fields above and by `person`.

- `memberships`: person, tier, tier_as_written, start_date, expiry_date, dates_derived, date_rule,
  validity_as_written, status, status_as_written, discontinued_on, discontinued_reason, notes,
  needs_review, plus `numbers`: [{"number_as_written", "first_seen_fy", "last_seen_fy", "is_current"}]
- `membership_snapshots`: person, membership_key, fy, snapshot_label, tier, number_as_written,
  name_as_written, status_as_written, validity_as_written
- `trust_officers`: person, title_en, title_mr, from_date, to_date, display_order
- `receipts`: fy, series, number, line_no, number_as_written, receipt_date, is_cancelled, is_80g, notes, needs_review
- `income_entries`: entry_date, fy, cal_year, cal_month, amount, kind, kind_as_written, person,
  payer_as_written, receipt_key, membership_key, mode, mode_as_written, bank_slug, payment_ref,
  purpose_as_written, fund_code, event_slug, scheme_slug, category_code, pan_as_written, notes, needs_review
  (`kind`: donation, membership_fee, sponsorship, advertisement, event_fee, csr_grant, book_sale,
  interest, refund_received, loan_received, other)
- `expenses`: entry_date, fy, cal_year, cal_month, amount, cash_amount, bank_amount,
  voucher_no_as_written, person (the payee), payee_as_written, category_code, head_as_written,
  particulars, mode, mode_as_written, cheque_no, bank_slug, event_slug, scheme_slug, fund_code,
  approved_by, notes, needs_review
- `transfers`: entry_date, fy, amount, kind (own_account, fd_placement, fd_closure, sip, petty_cash,
  reversal, other), from_bank_slug, to_bank_slug, from_as_written, to_as_written, fixed_deposit_key,
  investment_key, particulars, voucher_no_as_written, needs_review
- `bank_transactions`: bank_slug, txn_date, value_date, fy, narration, reference, debit, credit, balance, seq_in_statement
- `fixed_deposits`: bank, branch, fd_number, principal, rate_pct, start_date, maturity_date,
  maturity_amount, compounding, status, renewed_from_key, fund_code, earmark_as_written, notes, needs_review
- `fd_events`: fixed_deposit_key, event_date, fy, kind (interest, tds, closure, renewal, other), amount, label_as_written
- `investments`: kind, name, folio, notes; `investment_transactions`: investment_key, txn_date, fy, kind, amount, units
- `scheme_applications`: scheme_slug, person, applicant_as_written, fy, applied_on, institution, status, details
- `scheme_disbursements`: scheme_slug, person, beneficiary_as_written, beneficiary_count, fy,
  disbursed_on, amount, institution, is_repayable, notes, needs_review
- `scheme_repayments`: disbursement_key, paid_on, amount
- `budgets`: fy, event_slug, title, heading_as_written; `budget_lines`: budget_key, kind, category_code, head_as_written, amount
- `annual_statements`: fy, entity (trust | pre_trust), source_label, is_signed_audit, notes
- `annual_statement_lines`: statement_key, side (opening, inward, outward, closing, total, memo), label, amount, line_date, cell_ref, line_order
- `event_account_lines`: event_slug, side (income, expense, memo), line_date, head_as_written,
  party_as_written, person, amount, quantity, mode_as_written, reference, notes, needs_review

## What sums into trust-wide totals (avoid double counting)

- **Income** = `income_entries` only. Owner: the donations transform (it also owns the
  ledger workbooks' receipt sheets, which are the same transactions).
- **Expenditure** = `expenses` only; own-account movements and investments go to
  `transfers`. Owner: the ledgers transform.
- `event_account_lines`, `annual_statement_lines`, `bank_transactions`, `fd_events`,
  `scheme_disbursements`, `budget_lines` are separate dimensions and never add into
  income or expenditure.
- Years with no row-level data (2018-19 to 2021-22, and pre-trust) are imported as
  `annual_statements` + lines only.

## Review items

`st.review(kind, title, evidence, severity, confidence, suggested_action, table, key)`.
Kinds in use: `total_mismatch`, `duplicate_transaction`, `ambiguous_date`, `bad_amount`,
`missing_amount`, `missing_date`, `date_outside_fy`, `receipt_number_conflict`,
`voucher_number_conflict`, `unclassified_head`, `continuity_break`, `conflicting_sources`,
`fd_arithmetic`, `missing_document`, `trustee_decision`. Titles are short and plain; evidence
is a small JSON object with sheet ids, row numbers and the figures involved. No personal
names in titles.

## Report back

Counts per table, per source sheet (rows read, emitted, skipped with reasons, merged as
duplicates), the totals per FY your records add up to, how they compare with the sheet's
printed totals, and the review items raised by kind.
