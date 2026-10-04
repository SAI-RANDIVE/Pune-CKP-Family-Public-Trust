# Proposed target schema (Phase 1) — for approval

Status: proposal. Nothing here has been applied to the database.

## Where this departs from the brief, and why

| Brief | Proposal | Reason found in the code or data |
|---|---|---|
| New `users`, `sessions`, `otp_codes`, `audit_log` | Extend existing `admin_users`, `admin_sessions`, `email_otps`, `audit_logs` | They already exist with the four roles, lockout and scrypt hashing, and the live `/admin` panel uses them |
| `sql/migrations/` folder | Keep numbered files in `sql/` (`004-…` onward) and add a `schema_migrations` table to the existing runner | `npm run db:migrate` already applies `sql/*.sql` in order; moving files would break it |
| Separate `donations` and `income` tables | One `income_entries` table with a `kind`; `donations` is a view | Registers mix donations, fees, sponsorship and CSR in one sheet, and which is which is an open trustee decision. A `kind` can be corrected through a mapping file without moving rows |
| Income vs expense only | Add `transfers` | Printed totals include FD closures, deposits, SIPs and own-account transfers (3,160,500 of the 2025-26 "outward") |
| Membership number as identifier | Internal `person_id`; numbers kept as dated history | Numbers were rewritten, shared and re-issued |
| Receipt / voucher number unique | Unique only on (FY, series, number, line), nullable | Numbers repeat across books; many rows have none |
| Paise as BIGINT or NUMERIC | `NUMERIC(14,2)` everywhere | Matches the existing `payments.amount`; the data has paise values |

Existing `members`, `payments`, `receipt_counters`, `payment_events`, `receipt_emails` are not altered except for additive nullable columns. The checkout, webhook and receipt code keep working unchanged.

## Layer 1 — provenance and raw data

- **`source_files`**: `file_id`, path, sha256, size, internal last-saved date, role (canonical / superseded / reference / not-data).
- **`import_batches`**: id, started/finished, script version, dry-run flag, counts, status (loaded / rolled back), run by.
- **`raw_rows`**: batch, source file, sheet, row number, `cells` JSONB (original values untouched, plus the formula text where one exists), row fingerprint. One row per source row, never updated.
- **`record_sources`**: links any clean record to every raw row it came from (table name, record id, raw row id, role: primary / duplicate / enrichment). This is what lets a final number be traced to its cells even when one transaction appears in four sheets.
- **`import_review_queue`**: kind (duplicate person, duplicate transaction, total mismatch, ambiguous date, missing amount, …), evidence JSONB, confidence, suggested action, status, decided by / at, decision note.

Every clean table also carries `import_batch_id`, `content_fingerprint`, `created_at`, `updated_at`, `deleted_at` (soft delete), and `origin` (`import` / `online` / `manual`).

## Layer 2 — reference data

- **`fiscal_years`**: label (`2025-26`), start, end, is_closed.
- **`categories`**: income and expense heads, `name_mr`, `name_en`, parent, kind. Seeded from the heads found in the "Numerical Vouchers" sheets through `data-migration/mappings/expense_heads.csv`.
- **`funds`**: general, corpus, Corona, Raigad, CSR grants, earmarked donor accounts; `is_restricted`.
- **`events`**: name_mr, name_en, event date, fiscal year, parent series (for example Gaurav Sohala).
- **`schemes`**: Dnyan Kiran, Niramay, Project Diya, medical aid, Gurukul support, Blossoming Buds, Amrut Dhara, Ravikiran, and Udaan as an empty placeholder; `is_repayable`.
- **`payment_modes`** as a checked text column: cash, cheque, upi, neft, online, other.

## Layer 3 — people

- **`people`**: id, `name_en`, `name_mr`, name search key, phone, alt phone, email, address, city, PAN (restricted), date of birth, anniversary, blood group, notes, roles (member / donor / beneficiary / vendor / trustee), `legacy_member_id` → `members.id`, `merged_into_id`.
- **`person_name_variants`**: every spelling seen, with its source.
- **`person_merge_candidates`**: pair, score, evidence, status. Nothing merges automatically below the documented threshold.
- Aadhaar is not imported (see question 4).

## Layer 4 — membership

- **`memberships`**: person, tier (silver / gold / platinum / other), start date, expiry date, `dates_are_derived` flag with the rule used, status (active / lapsed / discontinued / converted), discontinued date and reason, source snapshot year.
- **`membership_numbers`**: membership, number as written, prefix, year part, serial, first seen, last seen, is_current. Holds the history of rewritten numbers.
- **`membership_snapshots`**: one row per person per yearly master sheet (the history import), so growth by year is reproducible.

## Layer 5 — money

- **`receipts`**: fiscal year, series (`PCFPT`, `M`, plain, online), number, line no, date, is_cancelled, is_80g, PDF reference, link to `payments.id` for online receipts.
- **`income_entries`**: date, fiscal year, calendar year and month, amount, kind (donation, membership_fee, sponsorship, advertisement, event_fee, csr_grant, book_sale, interest, refund_received, other), person, receipt, mode, bank account, payment reference, purpose text as written, fund, event, scheme, category, PAN as written.
- **`expenses`**: date, fiscal year, amount, cash/bank split, voucher number as written, payee (person or text), category, sub-category, mode, cheque no, bank account, event, scheme, fund, approved by, notes, attachment.
- **`transfers`**: date, amount, from account, to account, kind (own-account, FD placement, FD closure, SIP, petty-cash top-up), link to FD or investment.
- **`bank_accounts`**: bank, branch, masked number, type, opened on.
- **`bank_transactions`**: account, date, value date, narration, reference, debit, credit, running balance, statement file; nullable links to the `income_entries`, `expenses` or `transfers` row it settles.
- **`fixed_deposits`**: bank, masked number, principal, rate, start, maturity date, maturity amount, compounding, status, `renewed_from_id`, earmark fund.
- **`fd_events`**: deposit, date, kind (interest, TDS, closure, renewal), amount.
- **`investments`** and **`investment_transactions`**: mutual fund schemes and SIP instalments.
- **`scheme_applications`**: scheme, person, year, institution, status.
- **`scheme_disbursements`**: scheme, beneficiary, fiscal year, date, amount, institution, expense link; `repayments` for repayable aid.
- **`budgets`** and **`budget_lines`**: fiscal year or event, category, amount.
- **`annual_statements`** and **`annual_statement_lines`**: the printed figures of each year's receipts-and-payments sheet and of the Tally accounts, with cell references. These are the reconciliation targets and the only data for 2018-22.
- **`documents`**: stored attachments (voucher scans, bills, FD papers) with sha256 and a link to the record.

## Layer 6 — access and audit (extending what exists)

- `admin_users`: add `username`, `preferred_lang`, `text_scale`, `phone`.
- `audit_logs`: add `before` and `after` JSONB.
- `email_otps.purpose`: widen to cover sensitive TMS actions.
- New **`form_drafts`** for auto-saved entry forms.

## Indexes

- `pg_trgm` GIN on `people.name_en`, `people.name_mr`, name variants, payee text and purpose text.
- B-tree on fiscal year, date, category, event, scheme and fund for every money table.
- Unique `(fiscal_year, series, number, line_no)` on receipts where number is not null.
- Unique `content_fingerprint` per table to make loads idempotent.

## Views

`v_donations`; `v_income_vs_expense_by_fy` / `_by_month` / `_by_category`; `v_event_accounts`; `v_scheme_totals`; `v_donor_lifetime`; `v_membership_expiries_due`; `v_fd_maturity_calendar`; `v_fd_interest_by_fy`; `v_bank_reconciliation`; `v_public_impact` (aggregate, non-personal counts only, for the public home page).

Online Razorpay payments stay in `payments` and are included in the income views through a union, so the live checkout is untouched and the TMS still shows them.
