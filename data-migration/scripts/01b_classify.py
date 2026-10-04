"""Phase 0.4 - classify every sheet into a domain with an import decision.

Rules below encode the findings of the Phase 0 deep reads (reports/phase0/*.md).
They are deliberately explicit and editable: a trustee correction is a one-line change.
Writes reports/01_classification.csv.  Usage: python 01b_classify.py [--dry-run]

decision values:
  import      canonical source, load into the clean layer
  history     older snapshot, load as dated history (never overrides canonical)
  reference   used to fill gaps / reconcile, not loaded as transactions
  superseded  older or duplicate copy of a canonical sheet: raw layer only
  not-data    template, print form, chart, narrative, empty
  decide      needs a trustee decision before import
"""
import argparse
import csv
import re
from collections import Counter

from common import REPORTS, utf8_stdout

H, M, L = "high", "medium", "low"

# Generic rules for the yearly ledger workbooks, matched on sheet name.
LEDGER = [
    (r"^Balance_Sheet", "audit_balance_sheet", "receipts-and-payments account (reconciliation target)", "reference", H),
    (r"Membership Receipts", "receipt_book", "membership fee receipts", "import", H),
    (r"Ad_Spons|Spons_Dontn", "receipt_book", "donation / advertisement / sponsorship receipts (+ FD maturities, transfers from 2025-26)", "import", H),
    (r"^Numerical Vouchers", "expense_ledger", "vouchers re-sorted by number, carries the expense Heading", "reference", H),
    (r"Voucher Printing", "other", "voucher print form", "not-data", H),
    (r"Vouchers|Outwards|Expenditures", "expense_ledger", "expense vouchers", "import", H),
    (r"Book Money", "other_income", "book money transfer record", "import", M),
    (r"Quarterly_Interest", "fd_register", "FD interest by quarter", "import", H),
    (r"^FDs$|FD & MF", "fd_register", "fixed deposits and mutual funds", "import", H),
    (r"Cheques Issued", "bank_statement", "cheque register", "reference", H),
    (r"Petty|PETTY", "expense_ledger", "petty cash book", "import", M),
    (r"inward|Faral|फराळ|Pancham", "donation_register", "event / drive receipts with donor details", "import", H),
    (r"Bank Statement|ACCOUNT|Saraswat AC|OpTransaction", "bank_statement", "bank ledger / statement paste", "import", H),
    (r"Sangeet|Sahitya|Evening Show", "event_accounts", "event accounts", "import", M),
    (r"Dnyankiran", "scheme_beneficiary", "scheme donations", "import", M),
    (r"Monthly Removal", "other", "working note", "decide", L),
    (r"^Sheet\d", "other", "stub", "not-data", H),
]
EVENT = [
    (r"Inward", "event_accounts", "event income", "import", H),
    (r"Outward|Expenses|Accounts|Cash Account|HDFC ACCOUNT", "event_accounts", "event expenses / cash book", "import", H),
    (r"Expected|Budget", "budget", "event budget / expected entries", "reference", M),
    (r".", "event_accounts", "event working sheet", "decide", L),
]
MASTER = [
    (r"Master Members", "membership_register", "yearly master register snapshot", "history", H),
    (r"ID Card", "membership_register", "ID-card status (identical copy)", "superseded", H),
    (r"Discontinued", "membership_register", "discontinued list (cumulative, superseded by 2026-27)", "reference", H),
    (r"AGM", "membership_register", "AGM signature roll (identical copy)", "superseded", H),
]


def ALL(dom, sub, dec, conf):
    return [(r".", dom, sub, dec, conf)]


RULES = {
    "F001": [(r"Master", "membership_register", "cumulative register 2020-22", "history", H),
             (r"Active", "membership_register", "active list 2021-22", "history", H),
             (r".", "membership_register", "4-column projection of active list", "superseded", H)],
    "F002": ALL("membership_register", "renewal due-date calculator (older)", "superseded", H),
    "F003": [(r"Trustee", "donation_register", "trustee contributions 2018", "import", H),
             (r".", "membership_register", "membership fee ledger 2020-22", "import", H)],
    "F004": ALL("membership_register", "contact / birthday extract", "reference", H),
    "F005": ALL("membership_register", "email extract (csv copy)", "superseded", H),
    "F006": ALL("membership_register", "email extract", "superseded", H),
    "F007": ALL("donation_register", "2018-19 donations, Corona and Raigad funds (with expense blocks)", "import", H),
    "F008": [(r"2021-22", "donation_register", "2021-22 donation list with purpose (holds Aadhaar)", "reference", H),
             (r".", "donation_register", "copy / empty", "superseded", H)],
    "F009": [(r"^2022", "other_income", "book sales register", "import", H),
             (r"Discount|PCF Members", "other_income", "subset view of the sales registers", "superseded", M),
             (r"Gift", "other_income", "gifted copies and book donations", "import", H),
             (r"Lakshvedhi", "other_income", "second-book sales by seller", "import", M),
             (r"^Expenses", "expense_ledger", "loans from individuals for printing", "decide", H),
             (r"Printing", "expense_ledger", "printing payments (F014 copy preferred)", "superseded", H),
             (r".", "other", "summary / working block", "decide", L)],
    "F010": ALL("pre_trust", "pre-trust family group accounts 2016-23", "decide", M),
    "F011": [(r"Mutual", "fd_register", "mutual fund holdings", "import", H),
             (r"\(2\)|Karkhanis$", "donation_register", "earmarked donor account (older copy)", "superseded", H),
             (r"Tushar|Karkhanis", "donation_register", "earmarked donor running account", "import", H),
             (r".", "scheme_beneficiary", "repayable medical aid account", "import", H)],
    "F012": ALL("audit_balance_sheet", "receipts-and-payments summary 2018-22 (no detail rows exist)", "import", H),
    "F014": [(r"Celebrations", "event_accounts", "15 Aug 2022 accounts", "import", H),
             (r".", "expense_ledger", "book printing payments", "import", H)],
    "F015": [(r"Master", "membership_register", "master register 2023-24 (early)", "history", H),
             (r"ID Card", "membership_register", "ID-card status (copy kept)", "reference", H),
             (r"Renewal", "membership_register", "renewal worklist", "reference", M),
             (r".", "membership_register", "tier list", "history", H)],
    "F016": LEDGER, "F026": LEDGER, "F033": LEDGER, "F080": LEDGER, "F134": LEDGER, "F136": LEDGER, "F154": LEDGER,
    "F020": ALL("ledger_copy", "older save of the 2022-23 ledger (5 cells differ)", "superseded", H),
    "F085": ALL("ledger_copy", "older save of the 2025-26 ledger", "superseded", H),
    "F132": ALL("ledger_copy", "combined 2026-27 ledger, superseded by the per-bank workbooks", "superseded", H),
    "F083": ALL("expense_ledger", "renumbered copy of 2025-26 vouchers", "superseded", H),
    "F162": ALL("expense_ledger", "voucher list snapshot", "superseded", H),
    "F168": ALL("expense_ledger", "voucher list snapshot", "superseded", H),
    "F173": ALL("expense_ledger", "voucher list snapshot", "superseded", H),
    "F081": ALL("expense_ledger", "petty cash, unstructured", "decide", L),
    "F167": ALL("expense_ledger", "petty cash book 2026-27", "import", M),
    "F021": ALL("membership_register", "renewal worklist", "reference", H),
    "F022": MASTER,
    "F032": [(r"AGM", "membership_register", "AGM signature roll (copy kept)", "reference", H)] + MASTER,
    "F061": MASTER,
    "F130": [(r"Master", "membership_register", "CURRENT member register", "import", H),
             (r"Discontinued", "membership_register", "discontinued list", "import", H)] + MASTER,
    "F131": ALL("membership_register", "renewal due-date calculator (current)", "reference", H),
    "F194": ALL("membership_register", "mid-year copy of 2024-25 master", "superseded", H),
    "F198": ALL("membership_register", "new-member applications (form export)", "decide", H),
    "F199": [(r"Trustee", "donation_register", "copy of F003", "superseded", H),
             (r"Member", "membership_register", "fee ledger, near-copy of F003", "reference", H),
             (r"Balance", "audit_balance_sheet", "copy of F012", "superseded", H),
             (r".", "donation_register", "copy of F007", "superseded", H)],
    "F027": EVENT, "F053": EVENT, "F042": EVENT, "F201": EVENT,
    "F095": [(r"Inward", "donation_register", "EDK 2025 receipts (same rows as F181)", "superseded", H),
             (r"Cash Account", "event_accounts", "two conflicting cash books", "decide", M)] + EVENT,
    "F094": ALL("event_accounts", "September 2025 snapshot of F095", "superseded", H),
    "F029": ALL("other", "seat booking chart", "not-data", H),
    "F031": ALL("other", "programme outline", "not-data", H),
    "F034": ALL("donation_register", "Form 10BD original (superseded by revised)", "superseded", H),
    "F035": ALL("donation_register", "Form 10BD revised, 2024-25", "reference", H),
    "F192": ALL("donation_register", "Form 10BD blank template", "not-data", H),
    "F036": [(r"Budget", "budget", "budget (headed 2023-24)", "decide", M),
             (r".", "other", "schedules of another organisation", "not-data", M)],
    "F086": [(r"Budget", "budget", "budget (headed 2026-27, identical to F163)", "decide", M),
             (r".", "other", "schedules of another organisation", "not-data", M)],
    "F163": [(r"Budget", "budget", "budget 2026-27", "import", M),
             (r".", "other", "schedules of another organisation", "not-data", M)],
    "F037": ALL("event_accounts", "copy of F042 bus refunds", "superseded", H),
    "F041": ALL("other", "name / email list", "not-data", H),
    "F043": ALL("budget", "Gaurav 2024 budget (older save)", "superseded", H),
    "F051": ALL("budget", "Gaurav 2024 budget, nominations, sponsor rates", "reference", M),
    "F052": ALL("other", "nominee list", "not-data", H),
    "F047": ALL("donation_register", "Aadharstambh donor drive", "import", H),
    "F048": ALL("other", "donor publication summary", "not-data", M),
    "F063": ALL("bank_statement", "fragmented PDF-to-Excel conversion", "superseded", H),
    "F066": ALL("bank_statement", "Saraswat statement Oct-Dec 2025", "reference", H),
    "F068": [(r"^Saraswat", "donation_register", "2025-26 donations via Saraswat (one row not in register)", "reference", M),
             (r"^HDFC Account$", "donation_register", "stale snapshot", "superseded", H),
             (r".", "bank_statement", "per-bank donation ledger", "reference", M)],
    "F072": ALL("bank_statement", "GPay settlements 2025-26", "import", H),
    "F166": ALL("bank_statement", "GPay settlements Jan-May 2026", "import", H),
    "F073": ALL("bank_statement", "HDFC statement FY 2025-26", "import", H),
    "F075": ALL("bank_statement", "Saraswat statement FY 2025-26", "import", H),
    "F133": ALL("bank_statement", "Saraswat statement Apr-Jun 2026", "import", H),
    "F135": ALL("bank_statement", "Saraswat statement Apr-Jun 2026 (annotated copy)", "reference", H),
    "F076": ALL("fd_register", "Saraswat term-deposit summary 1 Apr 2026", "import", H),
    "F127": ALL("fd_register", "Saraswat term-deposit summary 1 Apr 2025", "import", H),
    "F084": ALL("bank_statement", "Tally bank book (default heads, double-booked transfers)", "reference", M),
    "F119": ALL("donation_register", "Pancham collection draft", "superseded", M),
    "F120": ALL("fd_register", "TDS on interest", "import", M),
    "F121": ALL("fd_register", "TDS working", "reference", M),
    "F175": ALL("scheme_beneficiary", "scholarship applications 2023-24", "import", H),
    "F176": [(r"New Sheet", "donation_register", "2021-22 register", "import", H),
             (r"80G", "donation_register", "2021-22 80G register", "import", H),
             (r".", "donation_register", "superseded draft", "superseded", H)],
    "F177": ALL("donation_register", "copy of F176 register", "superseded", H),
    "F178": ALL("donation_register", "2022-23 register", "import", H),
    "F179": ALL("donation_register", "2023-24 register (ledger F026 is canonical; joined for PAN)", "reference", H),
    "F180": ALL("donation_register", "2024-25 register and other contributions", "import", H),
    "F181": ALL("donation_register", "2025-26 register, EDK, Pancham, Prusthadaan, other", "import", H),
    "F182": [(r"Receipts$", "receipt_book", "receipt print template", "not-data", H),
             (r"2026-27|Gaurav", "donation_register", "2026-27 register / Gaurav 2026", "import", H),
             (r".", "donation_register", "empty carried-forward shell", "not-data", H)],
    "F183": ALL("donation_register", "older macro-less save of F182", "superseded", H),
    "F190": ALL("donation_register", "derived annual summary", "reference", M),
    "F191": ALL("donation_register", "derived donor summary", "reference", M),
    "F200": ALL("audit_balance_sheet", "cumulative utilisation summary 2018-24 (hard-coded base)", "reference", M),
    "F202": ALL("scheme_beneficiary", "Gurukul (Talegaon) support by year", "import", H),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    utf8_stdout()
    out, unruled = [], []
    for r in csv.DictReader(open(REPORTS / "01_sheets.csv", encoding="utf-8-sig")):
        if r["sheet"] == "*":
            continue
        row = {"sheet_id": r["sheet_id"], "path": r["path"], "sheet": r["sheet"], "data_rows": r["data_rows"]}
        if r["note"] == "EMPTY":
            row.update(domain="other", sub_type="empty sheet", decision="not-data", confidence=H)
        elif r["file_id"] in ("F134", "F136", "F154") and r["header_row"] == "10":
            row.update(domain="other", sub_type="voucher print form", decision="not-data", confidence=H)
        else:
            for pat, dom, sub, dec, conf in RULES.get(r["file_id"], []):
                if re.search(pat, r["sheet"]):
                    row.update(domain=dom, sub_type=sub, decision=dec, confidence=conf)
                    break
            else:
                unruled.append(r["sheet_id"])
                row.update(domain=r["keyword_guess"] or "other", sub_type="keyword guess only",
                           decision="decide", confidence=L)
        out.append(row)
    print(f"sheets classified: {len(out)}  without a rule: {len(unruled)} {unruled}")
    for key in ("domain", "decision", "confidence"):
        print(key, dict(Counter(o[key] for o in out).most_common()))
    print("data rows by decision", {d: sum(int(o["data_rows"] or 0) for o in out if o["decision"] == d)
                                    for d in sorted({o["decision"] for o in out})})
    by_folder = Counter()
    for o in out:
        top = o["path"].split("/")[0] if "/" in o["path"] else "(root)"
        by_folder[(top, "sheets")] += 1
        by_folder[(top, "rows")] += int(o["data_rows"] or 0)
    print("by folder", {f"{k[0]}:{k[1]}": v for k, v in sorted(by_folder.items())})
    if args.dry_run:
        print("dry-run: nothing written")
        return
    with open(REPORTS / "01_classification.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["sheet_id", "path", "sheet", "data_rows", "domain", "sub_type",
                                          "decision", "confidence"])
        w.writeheader()
        w.writerows(out)
    print("wrote 01_classification.csv")


if __name__ == "__main__":
    main()
