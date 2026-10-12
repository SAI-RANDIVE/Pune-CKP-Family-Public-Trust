"""Stage 7 VERIFY - check every expenditure against the bank statements.

Part 1  Every expense in the database that was paid through a bank account is
        looked up in that account's statement lines: same amount, a debit,
        within a few days of the voucher date. Each expense ends up as one of

          matched        one statement debit agrees (amount, account, date window)
          matched_group  several vouchers of one day add up to one debit
          ambiguous      more than one equally good debit; a person must pick
          unmatched      a statement exists for the period but shows no such debit
          no_statement   no statement lines are held for that account and period
          cash           paid in cash, so it cannot appear on a bank statement

Part 2  The latest bank books handed over by the trust (folder
        "bank account statement") are compared, voucher by voucher, with what
        was imported earlier: unchanged, changed, new in the books, or missing
        from the books.

Part 3  The statement sheets inside those books are compared with the statement
        lines held in the database (how many lines, up to which date, closing
        balance), and every bank-paid voucher in the books is looked up in the
        book's own statement sheet.

Nothing in the books is changed. With --save the result of part 1 is written
to the table expense_verifications (the management system shows it beside each
expense); without it the database is only read.

Writes reports/05_expense_verification.md and three CSV files beside it.
Usage:  python data-migration/etl/60_verify_expenses.py [--save]
"""
import csv
import importlib.util
import os
import re
import sys
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

import psycopg
import xlrd

sys.path.insert(0, os.path.dirname(__file__))
from lib import REPORTS, parse_amount, parse_date, utf8_stdout  # noqa: E402

_spec = importlib.util.spec_from_file_location("load", os.path.join(os.path.dirname(__file__), "40_load.py"))
_l = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_l)

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
NEW_DIR = os.path.join(REPO, "05. Trust - various xl sheets", "bank account statement")
BEFORE, AFTER = 6, 15          # days a debit may precede / follow the voucher date
Z = Decimal(0)


def inr(v):
    """1234567.5 -> 12,34,567.50 (Indian grouping)."""
    if v is None:
        return ""
    d = Decimal(str(v)).quantize(Decimal("0.01"))
    sign = "-" if d < 0 else ""
    whole, frac = f"{abs(d):.2f}".split(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        head = re.sub(r"(?<=\d)(?=(\d\d)+$)", ",", head)
        whole = f"{head},{tail}"
    return f"{sign}{whole}.{frac}"


def tokens(text):
    """Reference-like tokens: runs of 6+ digits (UTR, cheque, UPI numbers)."""
    return set(re.findall(r"\d{6,}", str(text or "")))


def words(text):
    return {w for w in re.findall(r"[a-z]{4,}", str(text or "").lower())
            if w not in {"neft", "imps", "upi", "payment", "transfer", "reimbursement", "bank", "hdfc", "saraswat"}}


# --------------------------------------------------------------------------- part 1
def match_expenses(cur):
    cur.execute("""select e.id, e.code, e.fy, e.entry_date, e.amount, coalesce(e.bank_amount, 0), coalesce(e.cash_amount, 0),
                          e.voucher_no_as_written, e.payee_as_written, e.particulars, e.cheque_no, e.mode,
                          e.bank_account_id, b.code, b.account_type
                     from expenses e left join bank_accounts b on b.id = e.bank_account_id
                    where e.deleted_at is null order by e.entry_date, e.code""")
    expenses = [dict(zip(("id", "code", "fy", "date", "amount", "bank", "cash", "voucher", "payee", "particulars",
                          "cheque", "mode", "account", "account_code", "account_type"), r)) for r in cur.fetchall()]
    cur.execute("""select id, bank_account_id, txn_date, debit, narration, reference, fy
                     from bank_transactions where deleted_at is null and coalesce(debit, 0) > 0 order by txn_date, seq_in_statement""")
    debits = [dict(zip(("id", "account", "date", "debit", "narration", "reference", "fy"), r)) for r in cur.fetchall()]

    by_key = defaultdict(list)                 # (account, amount) -> debits
    coverage = defaultdict(lambda: [date.max, date.min])
    for d in debits:
        by_key[(d["account"], d["debit"])].append(d)
        c = coverage[d["account"]]
        c[0], c[1] = min(c[0], d["date"]), max(c[1], d["date"])
    used = set()
    result = {}

    def candidates(e):
        out = []
        for d in by_key.get((e["account"], e["bank"]), []):
            if d["id"] in used:
                continue
            gap = (d["date"] - e["date"]).days
            if -BEFORE <= gap <= AFTER:
                hay = f"{d['narration']} {d['reference']}"
                ref = bool(tokens(f"{e['particulars']} {e['cheque']}") & tokens(hay)) or \
                    bool(e["cheque"] and str(e["cheque"]).lstrip("0") and str(e["cheque"]).lstrip("0") in hay)
                name = bool(words(e["payee"]) & words(hay))
                out.append((0 if ref else 1, 0 if name else 1, abs(gap), d, gap, ref, name))
        return sorted(out, key=lambda x: x[:3])

    bank_paid = []
    for e in expenses:
        if e["bank"] <= 0:
            result[e["id"]] = ("cash", None, None, "Paid in cash")
        elif e["date"] is None:
            result[e["id"]] = ("unmatched", None, None, "The voucher has no date, so it cannot be placed on the statement")
        elif not e["account"] or e["account"] not in coverage or not (
                coverage[e["account"]][0] - timedelta(days=AFTER) <= e["date"] <= coverage[e["account"]][1] + timedelta(days=BEFORE)):
            result[e["id"]] = ("no_statement", None, None, "No statement lines are held for this account and period")
        else:
            bank_paid.append(e)

    # Three passes: reference number agrees, then a single candidate, then the nearest date.
    for want in ("ref", "single", "nearest"):
        for e in bank_paid:
            if e["id"] in result:
                continue
            cands = candidates(e)
            if not cands:
                continue
            best = cands[0]
            if want == "ref" and best[0] != 0:
                continue
            if want == "single" and len(cands) != 1:
                continue
            if want == "nearest" and len(cands) > 1 and cands[1][:3] == best[:3]:
                # Two equally good debits: are there as many vouchers asking for them? Then pair them off in order.
                rivals = [x for x in bank_paid if x["id"] not in result and x["account"] == e["account"]
                          and x["bank"] == e["bank"] and abs((x["date"] - e["date"]).days) <= AFTER]
                if len(rivals) > len(cands):
                    result[e["id"]] = ("ambiguous", None, None,
                                       f"{len(cands)} statement debits of this amount for {len(rivals)} vouchers")
                    continue
            d, gap, ref, name = best[3], best[4], best[5], best[6]
            used.add(d["id"])
            how = "reference number agrees" if ref else "payee named in the narration" if name else "amount and date agree"
            result[e["id"]] = ("matched", d["id"], gap, f"{how}; statement {d['date']:%d-%m-%Y}")

    # Several vouchers of one day paid by one transfer.
    groups = defaultdict(list)
    for e in bank_paid:
        if e["id"] not in result:
            groups[(e["account"], e["date"])].append(e)
    for (account, day), es in groups.items():
        if len(es) < 2:
            continue
        total = sum(e["bank"] for e in es)
        for d in by_key.get((account, total), []):
            if d["id"] not in used and -BEFORE <= (d["date"] - day).days <= AFTER:
                used.add(d["id"])
                for e in es:
                    result[e["id"]] = ("matched_group", d["id"], (d["date"] - day).days,
                                       f"{len(es)} vouchers of this day add up to one debit of {inr(total)} on {d['date']:%d-%m-%Y}")
                break
    for e in bank_paid:
        result.setdefault(e["id"], ("unmatched", None, None, "The statement shows no debit of this amount near this date"))

    unused = [d for d in debits if d["id"] not in used]
    return expenses, result, unused


# --------------------------------------------------------------------------- parts 2 and 3
def norm_voucher(v):
    s = re.sub(r"\s+", "", str(v or "")).upper().replace("~", "-")
    m = re.match(r"^(\d+)/(\d\d)-(\d\d)$", s)
    return f"{int(m.group(1)):03d}/{m.group(2)}-{m.group(3)}" if m else s


def cell_date(v, book):
    if isinstance(v, float) and v > 30000:
        return xlrd.xldate_as_datetime(v, book.datemode).date()
    d = parse_date(v)
    return d if isinstance(d, date) else (d[0] if isinstance(d, tuple) and d and isinstance(d[0], date) else None)


def amount(v):
    a = parse_amount(v)
    a = a[0] if isinstance(a, tuple) else a
    return Decimal(str(a)).quantize(Decimal("0.01")) if a not in (None, "") else Z


def read_book(path, voucher_sheet, statement_sheet, header_row, cols):
    book = xlrd.open_workbook(path)
    vouchers = []
    sh = book.sheet_by_name(voucher_sheet)
    for r in range(1, sh.nrows):
        row = sh.row_values(r)
        no = str(row[1]).strip()
        cash, bank = amount(row[5]), amount(row[6])
        if not no or (cash == 0 and bank == 0):
            continue
        vouchers.append({"row": r + 1, "voucher": no, "key": norm_voucher(no), "date": cell_date(row[2], book),
                         "payee": str(row[3]).strip(), "particulars": str(row[4]).strip(), "cash": cash, "bank": bank,
                         "heading": str(row[10]).strip() if len(row) > 10 else ""})
    lines = []
    sh = book.sheet_by_name(statement_sheet)
    for r in range(header_row + 1, sh.nrows):
        row = sh.row_values(r)
        d = cell_date(row[cols["date"]], book)
        debit, credit = amount(row[cols["debit"]]), amount(row[cols["credit"]])
        if not d or (debit == 0 and credit == 0):
            continue
        lines.append({"row": r + 1, "date": d, "narration": str(row[cols["narration"]]).strip(),
                      "reference": str(row[cols["ref"]]).strip(), "debit": debit, "credit": credit,
                      "balance": amount(row[cols["balance"]]), "remark": str(row[cols["remark"]]).strip()})
    return vouchers, lines


BOOKS = [
    {"label": "HDFC", "file": "HDFC_Account_2026-27_PCFPT.xls", "account": "hdfc", "vouchers": "Vouchers",
     "statement": "HDFC Bank Statement", "header": 20,
     "cols": {"date": 1, "narration": 2, "ref": 3, "debit": 5, "credit": 6, "balance": 7, "remark": 9}},
    {"label": "Saraswat", "file": "Saraswat_AC_2026-27_PCFPT.xls", "account": "saraswat", "vouchers": "Numerical Vouchers 2026-27",
     "statement": "Saraswat Bank Statement", "header": 21,
     "cols": {"date": 1, "narration": 2, "ref": 4, "debit": 7, "credit": 6, "balance": 8, "remark": 9}},
]


def compare_books(cur, md, rows_out):
    for spec in BOOKS:
        path = os.path.join(NEW_DIR, spec["file"])
        md.append(f"\n### {spec['label']} book: `{spec['file']}`\n")
        if not os.path.exists(path):
            md.append("File not found in the folder; skipped.\n")
            continue
        vouchers, lines = read_book(path, spec["vouchers"], spec["statement"], spec["header"], spec["cols"])
        cur.execute("""select e.code, e.voucher_no_as_written, e.entry_date, coalesce(e.cash_amount, 0), coalesce(e.bank_amount, 0),
                              e.payee_as_written, e.particulars
                         from expenses e where e.deleted_at is null and e.fy = '2026-27'""")
        db = {}
        for code, v, d, cash, bank, payee, part in cur.fetchall():
            db.setdefault(norm_voucher(v), []).append({"code": code, "date": d, "cash": cash, "bank": bank, "payee": payee or "", "particulars": part or ""})
        prefix = "HDFC/" if spec["account"] == "hdfc" else None
        mine = {k: v for k, v in db.items() if (k.startswith("HDFC/") if prefix else re.match(r"^\d{3}/26-27$", k))}

        same = changed = new = 0
        seen = set()
        for v in vouchers:
            seen.add(v["key"])
            hit = mine.get(v["key"])
            if not hit:
                new += 1
                rows_out.append([spec["label"], v["voucher"], v["date"], v["payee"], v["particulars"], inr(v["cash"]), inr(v["bank"]),
                                 "NEW in the books", "", "Not in the database yet"])
                continue
            e = hit[0]
            diffs = []
            if e["cash"] != v["cash"] or e["bank"] != v["bank"]:
                diffs.append(f"amount was cash {inr(e['cash'])} / bank {inr(e['bank'])}")
            if v["date"] and e["date"] != v["date"]:
                diffs.append(f"date was {e['date']:%d-%m-%Y}")
            if (e["payee"] or "").strip().lower() != v["payee"].lower():
                diffs.append(f"payee was '{e['payee']}'")
            if diffs:
                changed += 1
                rows_out.append([spec["label"], v["voucher"], v["date"], v["payee"], v["particulars"], inr(v["cash"]), inr(v["bank"]),
                                 "CHANGED since import", e["code"], "; ".join(diffs)])
            else:
                same += 1
        gone = [(k, x[0]) for k, x in mine.items() if k not in seen]
        for k, e in gone:
            rows_out.append([spec["label"], k, e["date"], e["payee"], e["particulars"], inr(e["cash"]), inr(e["bank"]),
                             "MISSING from the books", e["code"], "In the database, no longer in the voucher sheet"])
        tot_cash, tot_bank = sum(v["cash"] for v in vouchers), sum(v["bank"] for v in vouchers)
        md.append(f"- Vouchers in the book: **{len(vouchers)}** (cash {inr(tot_cash)}, bank {inr(tot_bank)}, total {inr(tot_cash + tot_bank)})")
        md.append(f"- Same as imported: **{same}** · changed since import: **{changed}** · new in the book: **{new}** · in the database but not in the book: **{len(gone)}**")

        # The book's own statement sheet vs the vouchers in the book.
        debits = [l for l in lines if l["debit"] > 0]
        used, found, not_found = set(), 0, []
        for v in vouchers:
            if v["bank"] <= 0 or not v["date"]:
                continue
            cands = [(0 if tokens(v["particulars"]) & tokens(f"{l['narration']} {l['reference']} {l['remark']}") else 1,
                      abs((l["date"] - v["date"]).days), i)
                     for i, l in enumerate(debits)
                     if i not in used and l["debit"] == v["bank"] and -BEFORE <= (l["date"] - v["date"]).days <= AFTER]
            if cands:
                used.add(sorted(cands)[0][2])
                found += 1
            else:
                not_found.append(v)
        bank_v = sum(1 for v in vouchers if v["bank"] > 0)
        md.append(f"- Bank-paid vouchers found on the book's statement sheet: **{found} of {bank_v}**")
        for v in not_found:
            rows_out.append([spec["label"], v["voucher"], v["date"], v["payee"], v["particulars"], inr(v["cash"]), inr(v["bank"]),
                             "NOT ON STATEMENT", "", "No debit of this amount near this date on the statement sheet"])
        if lines:
            md.append(f"- Statement sheet: {len(lines)} lines, {min(l['date'] for l in lines):%d-%m-%Y} to {max(l['date'] for l in lines):%d-%m-%Y}, "
                      f"debits {inr(sum(l['debit'] for l in lines))}, credits {inr(sum(l['credit'] for l in lines))}, last balance {inr(lines[-1]['balance'])}")
            cur.execute("""select count(*), min(t.txn_date), max(t.txn_date), coalesce(sum(t.debit), 0), coalesce(sum(t.credit), 0)
                             from bank_transactions t join bank_accounts b on b.id = t.bank_account_id
                            where t.deleted_at is null and t.fy = '2026-27' and b.slug ilike %s""", (f"%{spec['account']}%",))
            n, lo, hi, deb, cred = cur.fetchone()
            if n:
                md.append(f"- Held in the database for 2026-27: {n} lines, {lo:%d-%m-%Y} to {hi:%d-%m-%Y}, debits {inr(deb)}, credits {inr(cred)}")
                newer = [l for l in lines if l["date"] > hi]
                md.append(f"- Statement lines in the book dated after the last imported line: **{len(newer)}**"
                          + (f" (debits {inr(sum(l['debit'] for l in newer))}, credits {inr(sum(l['credit'] for l in newer))})" if newer else ""))
            unexplained = [l for i, l in enumerate(debits) if i not in used]
            md.append(f"- Statement debits with no voucher of the same amount: **{len(unexplained)}** (total {inr(sum(l['debit'] for l in unexplained))}); "
                      "bank charges, transfers between the trust's own accounts and deposits are expected here.")
            for l in unexplained:
                rows_out.append([spec["label"], "", l["date"], "", f"{l['narration']} | {l['remark']}", "", inr(l["debit"]),
                                 "STATEMENT DEBIT WITHOUT VOUCHER", "", l["reference"]])


def main():
    utf8_stdout()
    save = "--save" in sys.argv
    md = ["# Expenditure verified against the bank statements\n",
          "Every amount is as recorded. A difference is reported for a trustee to decide; nothing is adjusted.\n"]
    with psycopg.connect(_l.database_url(), autocommit=False) as conn:
        cur = conn.cursor()
        expenses, result, unused = match_expenses(cur)

        order = ["matched", "matched_group", "ambiguous", "unmatched", "no_statement", "cash"]
        label = {"matched": "Matched", "matched_group": "Matched as a group", "ambiguous": "Needs a person to pick",
                 "unmatched": "Not found on the statement", "no_statement": "No statement held", "cash": "Paid in cash"}
        per_fy = defaultdict(lambda: defaultdict(lambda: [0, Z]))
        for e in expenses:
            s = result[e["id"]][0]
            amt = e["cash"] if s == "cash" else e["bank"] if e["bank"] > 0 else e["amount"]
            per_fy[e["fy"]][s][0] += 1
            per_fy[e["fy"]][s][1] += amt
            if s != "cash" and e["cash"] > 0:          # part cash, part bank
                per_fy[e["fy"]]["cash"][1] += e["cash"]

        md.append("## 1. Every expense in the database against the statement lines held\n")
        md.append("| Year | " + " | ".join(label[s] for s in order) + " | Vouchers |")
        md.append("|---|" + "---:|" * (len(order) + 1))
        tot = defaultdict(lambda: [0, Z])
        for fy in sorted(per_fy):
            cells = []
            for s in order:
                n, a = per_fy[fy][s]
                tot[s][0] += n
                tot[s][1] += a
                cells.append(f"{n} ({inr(a)})" if n or a else "-")
            md.append(f"| {fy} | " + " | ".join(cells) + f" | {sum(per_fy[fy][s][0] for s in order)} |")
        md.append("| **All** | " + " | ".join(f"**{tot[s][0]}** ({inr(tot[s][1])})" for s in order) + f" | **{len(expenses)}** |")
        bank_n = sum(tot[s][0] for s in ("matched", "matched_group", "ambiguous", "unmatched"))
        ok_n = tot["matched"][0] + tot["matched_group"][0]
        md.append(f"\nOf {bank_n} bank-paid vouchers that fall inside a period for which a statement is held, "
                  f"**{ok_n}** ({(100 * ok_n / bank_n if bank_n else 0):.1f}%) agree with a statement debit.\n")

        with open(os.path.join(REPORTS, "05_expense_verification.csv"), "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(["trust_id", "fy", "voucher_no", "date", "payee", "particulars", "cash", "bank", "account", "result", "days_apart", "detail"])
            for e in expenses:
                s, _, gap, detail = result[e["id"]]
                w.writerow([e["code"], e["fy"], e["voucher"], e["date"], e["payee"], e["particulars"], e["cash"], e["bank"],
                            e["account_code"], label[s], "" if gap is None else gap, detail])
        with open(os.path.join(REPORTS, "05_statement_debits_without_voucher.csv"), "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(["fy", "date", "debit", "narration", "reference"])
            for d in unused:
                w.writerow([d["fy"], d["date"], d["debit"], d["narration"], d["reference"]])
        by_fy = defaultdict(lambda: [0, Z])
        for d in unused:
            by_fy[d["fy"]][0] += 1
            by_fy[d["fy"]][1] += d["debit"]
        md.append("Statement debits that no voucher accounts for (transfers between the trust's own accounts, deposits placed, "
                  "bank charges and cash withdrawals are expected here; each line is in `05_statement_debits_without_voucher.csv`):\n")
        md.append("| Year | Debits | Amount |\n|---|---:|---:|")
        for fy in sorted(by_fy):
            md.append(f"| {fy} | {by_fy[fy][0]} | {inr(by_fy[fy][1])} |")

        md.append("\n## 2. The latest bank books compared with what was imported\n")
        rows_out = []
        compare_books(cur, md, rows_out)
        with open(os.path.join(REPORTS, "05_books_vs_import.csv"), "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(["book", "voucher_no", "date", "payee", "particulars", "cash", "bank", "finding", "trust_id", "detail"])
            w.writerows(rows_out)
        md.append("\nEvery line behind the counts above is in `05_books_vs_import.csv`.\n")
        md.append("No SBI book was in the folder: the SBI account was checked only against what was imported earlier.\n")

        if save:
            cur.execute("delete from expense_verifications")
            cur.executemany(
                "insert into expense_verifications (expense_id, status, bank_transaction_id, days_apart, detail) values (%s,%s,%s,%s,%s)",
                [(eid, s, tid, gap, detail) for eid, (s, tid, gap, detail) in result.items()])
            conn.commit()
            md.append(f"Saved {len(result)} results to `expense_verifications`.\n")
        else:
            conn.rollback()

    out = os.path.join(REPORTS, "05_expense_verification.md")
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(md) + "\n")
    print("\n".join(md))


if __name__ == "__main__":
    main()
