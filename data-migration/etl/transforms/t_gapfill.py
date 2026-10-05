"""Gap-fill transform: money the printed year-end sheets count as inward but which has
no receipt row in the donation registers (FY 2022-23 to 2024-25).

The donation registers hold receipts for donations, memberships, sponsorships and
event fees. The trust's receipts-and-payments sheets also count, as lines of their own:
  - book-sale collections           (row level in the "Book Money Trnsfr Record" sheets)
  - premium-pass sales, 14 May 2023 (row level in the "14May23 Evening Show" sheet)
  - Sahitya Sammelan contributions, ticket sales and the partner body's transfer
  - bank and deposit interest
  - refunds of hall deposits
  - fixed-deposit closure proceeds  (not income: recorded as transfers)
Without these, trust-wide income is understated against the trust's own books.

Runs AFTER t_ledgers (it reads that transform's staged output, so every record here
keeps the same source cells). Key prefix "gap:".
"""
import json
import os
import re
import sys
from collections import defaultdict
from decimal import Decimal

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib import CLEAN_DIR, Staging, money, utf8_stdout  # noqa: E402

YEARS = ("2022-23", "2023-24", "2024-25")

# Printed inward lines already represented by receipt rows in the donation registers.
COVERED = re.compile(r"membership|advertisement|donation|दिवाळी|फराळ", re.I)

# (pattern, action, kind, event_slug)  first match wins
RULES = [
    (r"sahitya sammelan ticket", "income", "event_fee", "sahitya-sammelan-2022"),
    (r"sahitya sammelan", "income", "donation", "sahitya-sammelan-2022"),
    (r"abckp", "income", "other", "sahitya-sammelan-2022"),
    (r"book sale", "rows:book", "book_sale", "book-pride-of-ckp"),
    (r"premium pass", "rows:show", "event_fee", "evening-show-2023"),
    (r"closure proceeds", "transfer", "fd_closure", None),
    (r"interest|\bint:", "income", "interest", None),
    (r"reimbursement", "income", "refund_received", None),
    (r".", "income", "other", None),
]


def classify(label):
    """Printed inward label -> (action, kind, event_slug), or None when receipts already cover it."""
    if re.search(r"sahitya sammelan", label, re.I):
        pass                                   # 'Contributions ... Sahitya Sammelan' must not be read as covered
    elif COVERED.search(label):
        return None
    for pat, action, kind, slug in RULES:
        if re.search(pat, label, re.I):
            return action, kind, slug
    return None


def read(domain, table):
    path = CLEAN_DIR / domain / f"{table}.jsonl"
    return [json.loads(line) for line in open(path, encoding="utf-8")] if path.exists() else []


def run():
    utf8_stdout()
    st = Staging("gapfill")
    statements = {s["_key"]: s for s in read("ledgers", "annual_statements")}
    event_rows = defaultdict(list)
    for r in read("ledgers", "event_account_lines"):
        if r["side"] == "income":
            event_rows[(r["event_slug"], r["_sources"][0]["file"])].append(r)
    totals = defaultdict(Decimal)

    for line in read("ledgers", "annual_statement_lines"):
        s = statements.get(line["statement_key"])
        if not s or s.get("entity") != "trust" or s.get("fy") not in YEARS or line["side"] != "inward":
            continue
        fy, label, amount = s["fy"], line["label"], Decimal(line["amount"])
        hit = classify(label)
        if hit is None:
            st.skip("printed inward line already covered by receipt rows in the donation registers")
            continue
        action, kind, slug = hit
        sources = [dict(x, role="primary") for x in line["_sources"]]
        base_key = f"gap:{fy}:{line.get('cell_ref') or line['_key']}"

        if action == "transfer":
            st.emit("transfers", base_key, {
                "entry_date": line.get("line_date"), "fy": fy, "amount": amount, "kind": kind, "to_bank_slug": "saraswat",
                "from_as_written": label, "particulars": label,
                "needs_review": not line.get("line_date")}, sources)
            totals[(fy, "transfer fd_closure")] += amount
            continue

        if action.startswith("rows:"):
            file_id = line["_sources"][0]["file"]
            rows = event_rows.get((slug, file_id), [])
            row_sum = sum(Decimal(r["amount"]) for r in rows)
            if rows and row_sum == amount:
                for r in rows:
                    rec = {"entry_date": r.get("line_date"), "fy": fy, "amount": Decimal(r["amount"]), "kind": kind,
                           "kind_as_written": label, "payer_as_written": r.get("party_as_written"),
                           "mode_as_written": r.get("mode_as_written"), "payment_ref": r.get("reference"),
                           "purpose_as_written": r.get("head_as_written") or label, "event_slug": slug, "bank_slug": "saraswat",
                           "notes": "from the ledger's row-level sheet; the printed year-end line equals the sum of these rows",
                           "needs_review": bool(r.get("needs_review"))}
                    if r.get("line_date"):
                        rec["cal_year"], rec["cal_month"] = int(r["line_date"][:4]), int(r["line_date"][5:7])
                    if isinstance(r.get("person"), dict):
                        rec["person"] = r["person"]
                    st.emit("income_entries", f"gap:{r['_key']}", rec, r["_sources"] + [dict(x, role="enrichment") for x in line["_sources"]])
                totals[(fy, kind)] += amount
                continue
            st.review("total_mismatch", "Printed collection line does not equal its row-level sheet",
                      {"fy": fy, "printed_label": label, "printed": money(amount), "rows": len(rows), "row_sum": money(row_sum),
                       "cell": line.get("cell_ref"), "imported_as": "one summary entry for the printed amount"},
                      severity="medium", suggested_action="Check the row-level sheet against the printed line",
                      table="income_entries", key=base_key)

        rec = {"entry_date": line.get("line_date"), "fy": fy, "amount": amount, "kind": kind, "kind_as_written": label,
               "payer_as_written": label, "purpose_as_written": label, "event_slug": slug, "bank_slug": "saraswat",
               "notes": "summary line of the printed receipts-and-payments sheet; no individual receipt rows exist in the registers",
               "needs_review": True}
        if line.get("line_date"):
            rec["cal_year"], rec["cal_month"] = int(line["line_date"][:4]), int(line["line_date"][5:7])
        st.emit("income_entries", base_key, rec, sources)
        totals[(fy, kind)] += amount

    st.review("trustee_decision", "Summary-level income added from the printed year-end sheets",
              {"years": list(YEARS), "totals": {f"{fy} {k}": money(v) for (fy, k), v in sorted(totals.items())},
               "why": "these collections have no receipt rows in the donation registers, but the trust's own sheets count them as inward"},
              severity="low", suggested_action="Confirm the categories (book sale, event fee, interest, refund)")
    print("gap-fill totals:", {f"{fy} {k}": money(v) for (fy, k), v in sorted(totals.items())})
    return st.close()


if __name__ == "__main__":
    run()
