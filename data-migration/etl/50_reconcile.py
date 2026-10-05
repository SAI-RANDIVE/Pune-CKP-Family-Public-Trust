"""Stage 6 RECONCILE - after the load, check the database against everything else.

  A. Database vs staging: record counts and amount sums per table and financial
     year must be identical (proves the load neither lost nor duplicated anything).
  B. Provenance: every loaded record must link to at least one raw source row.
  C. (note only) the printed year-end sheets are stored as targets.
  D. Books vs bank: the printed closing bank balance vs the bank statement's
     own balance on 31 March.
  E. Bank vs books movement: bank credits and debits vs what the books record
     as passing through that account.

Writes reports/03_reconciliation.md and reports/03_reconciliation_exceptions.csv.
Read-only on the database.  Usage: python data-migration/etl/50_reconcile.py
"""
import csv
import importlib.util
import json
import os
import sys
from collections import defaultdict
from decimal import Decimal

import psycopg

sys.path.insert(0, os.path.dirname(__file__))
from lib import CLEAN_DIR, REPORTS, utf8_stdout  # noqa: E402

_spec = importlib.util.spec_from_file_location("validate", os.path.join(os.path.dirname(__file__), "30_validate.py"))
_v = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_v)
inr, table = _v.inr, _v.table

_spec = importlib.util.spec_from_file_location("load", os.path.join(os.path.dirname(__file__), "40_load.py"))
_l = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_l)

AMOUNT_COL = {"bank_transactions": "coalesce(debit, 0) + coalesce(credit, 0)", "fixed_deposits": "principal"}
Z = Decimal(0)


def staged_totals():
    out = defaultdict(lambda: [0, Z])
    for path in sorted(CLEAN_DIR.glob("*/*.jsonl")):
        if path.name.startswith("_") or (path.parent.name == "_people" and path.stem != "people"):
            continue
        for line in open(path, encoding="utf-8"):
            r = json.loads(line)
            t = path.stem
            if t == "bank_transactions":
                amt = Decimal(r.get("debit") or 0) + Decimal(r.get("credit") or 0)
            elif t == "fixed_deposits":
                amt = Decimal(r["principal"])
            else:
                amt = Decimal(r["amount"]) if "amount" in r else Z
            k = (t, r.get("fy") or "-")
            out[k][0] += 1
            out[k][1] += amt
    return out


def main():
    utf8_stdout()
    md = ["# Reconciliation report (database after load)\n",
          "Amounts are rupees as imported. A difference is reported, never adjusted.\n"]
    exc = []

    def flag(check, subject, expected, actual, note=""):
        exc.append({"check": check, "subject": subject, "expected": str(expected), "actual": str(actual),
                    "difference": str(Decimal(str(actual)) - Decimal(str(expected))), "note": note})

    with psycopg.connect(_l.database_url(), autocommit=True) as conn:
        cur = conn.cursor()

        def q(sql, args=None):
            cur.execute(sql, args)
            return cur.fetchall()

        # ---- A. database vs staging
        staged = staged_totals()
        db = {}
        for t in sorted({k[0] for k in staged}):
            cols = {r[0] for r in q("select column_name from information_schema.columns where table_name = %s", (t,))}
            amount = AMOUNT_COL.get(t, "amount" if "amount" in cols else "0")
            fy = "coalesce(fy, '-')" if "fy" in cols else "'-'"
            where = "where content_fingerprint is not null"
            for f, n, s in q(f"select {fy}, count(*), coalesce(sum({amount}), 0) from {t} {where} group by 1"):
                db[(t, f)] = (n, Decimal(s))
        rows, bad = [], 0
        per_table = defaultdict(lambda: [0, Z, 0, Z])
        for k in sorted(set(staged) | set(db)):
            sn, ss = staged.get(k, (0, Z))
            dn, ds = db.get(k, (0, Z))
            p = per_table[k[0]]
            p[0] += sn
            p[1] += ss
            p[2] += dn
            p[3] += ds
            if sn != dn or ss != ds:
                bad += 1
                flag("db_vs_staging", f"{k[0]} {k[1]}", f"{ss}", f"{ds}", f"records staged {sn}, in database {dn}")
        md.append("## A. Database equals staging\n")
        md.append(table(["Table", "Staged records", "In database", "Staged amount", "Database amount", "Match"],
                        [[t, p[0], p[2], inr(p[1]), inr(p[3]), "yes" if (p[0], p[1]) == (p[2], p[3]) else "**NO**"]
                         for t, p in sorted(per_table.items())]))
        md.append(f"Compared per table and per financial year: {len(set(staged) | set(db))} groups, **{bad} differ**.\n")

        # ---- B. provenance
        md.append("## B. Every record traces to source cells\n")
        rows = []
        for t in sorted(per_table):
            n = q(f"select count(*) from {t} x where content_fingerprint is not null and not exists "
                  f"(select 1 from record_sources s where s.record_table = %s and s.record_id = x.id)", (t,))[0][0]
            if t == "people":
                continue  # people are built from mentions; their records carry the source rows
            rows.append([t, n])
            if n:
                flag("no_provenance", t, 0, n, "records without a source row")
        md.append(table(["Table", "Records with no source row"], rows))
        n_raw, n_links = q("select count(*) from raw_rows")[0][0], q("select count(*) from record_sources")[0][0]
        md.append(f"Raw source rows stored: {n_raw}. Links from records to source rows: {n_links}.\n")

        # ---- C. printed year-end sheet
        md.append("## C. Printed receipts-and-payments sheets\n")
        md.append("The printed inward and outward totals of each year are stored line by line as reconciliation targets "
                  "(validation report, section 7). They mix bank and petty-cash movements in a way that differs from year "
                  "to year, so the books are checked against the bank statements instead (sections D and E), which is the "
                  "stricter test.\n")

        # ---- D. printed closing bank balance vs bank statement
        md.append("## D. Printed closing bank balance against the bank statement\n")
        stmt_close = {}
        for fy, bal in q(
                "select distinct on (t.fy) t.fy, t.balance from bank_transactions t join bank_accounts b on b.id = t.bank_account_id "
                "where b.slug = 'saraswat' and t.balance is not null order by t.fy, t.txn_date desc, t.seq_in_statement desc"):
            stmt_close[fy] = Decimal(bal)
        printed_close = {}
        for fy, label, amount in q(
                "select s.fy, l.label, l.amount from annual_statements s join annual_statement_lines l on l.statement_id = s.id "
                "where s.entity = 'trust' and s.source_label = 'Receipts & payments sheet' and l.side = 'closing' order by s.fy, l.line_order"):
            low = label.lower()
            if ("bank" in low or "saraswat" in low) and "fd" not in low and "deposit" not in low and fy not in printed_close:
                printed_close[fy] = (label, Decimal(amount))
        rows = []
        for fy in sorted(stmt_close):
            if fy in printed_close and fy < "2026-27":
                label, pc = printed_close[fy]
                rows.append([fy, label[:50], inr(pc), inr(stmt_close[fy]), inr(stmt_close[fy] - pc)])
                if pc != stmt_close[fy]:
                    flag("closing_bank_balance", fy, pc, stmt_close[fy], f"printed line: {label[:80]}")
        md.append(table(["FY", "Printed line", "Printed closing", "Bank statement on 31 March", "Difference"], rows))
        md.append("2026-27 is in progress, so it has no year-end figure to compare.\n")

        # ---- E. bank movement vs books
        md.append("## E. Bank statement movement against the books, per account\n")
        bank = {}
        for slug, fy, d, c, n in q(
                "select b.slug, t.fy, coalesce(sum(t.debit), 0), coalesce(sum(t.credit), 0), count(*) from bank_transactions t "
                "join bank_accounts b on b.id = t.bank_account_id group by 1, 2"):
            bank[(slug, fy)] = (Decimal(d), Decimal(c), n)
        b_in = {(s, f): Decimal(a) for s, f, a in q(
            "select slug, fy, sum(amount) from (select coalesce(b.slug, 'saraswat') slug, i.fy, coalesce(i.amount, 0) amount "
            " from income_entries i left join bank_accounts b on b.id = i.bank_account_id where i.deleted_at is null "
            " and coalesce(i.mode, '') <> 'cash' union all select b.slug, t.fy, t.amount from transfers t "
            " join bank_accounts b on b.id = t.to_account_id where t.deleted_at is null) x group by 1, 2")}
        b_out = {(s, f): Decimal(a) for s, f, a in q(
            "select slug, fy, sum(amount) from (select coalesce(b.slug, 'saraswat') slug, e.fy, coalesce(e.bank_amount, e.amount) amount "
            " from expenses e left join bank_accounts b on b.id = e.bank_account_id where e.deleted_at is null "
            " and coalesce(b.slug, '') <> 'cash' union all select b.slug, t.fy, t.amount from transfers t "
            " join bank_accounts b on b.id = t.from_account_id where t.deleted_at is null) x group by 1, 2")}
        rows = []
        for (slug, fy), (d, c, n) in sorted(bank.items()):
            if slug == "gpay":
                continue
            bi, bo = b_in.get((slug, fy), Z), b_out.get((slug, fy), Z)
            rows.append([slug, fy, n, inr(c), inr(bi), inr(bi - c), inr(d), inr(bo), inr(bo - d)])
            if bi != c:
                flag("bank_credits_vs_books", f"{slug} {fy}", c, bi, "books: non-cash income + transfers in")
            if bo != d:
                flag("bank_debits_vs_books", f"{slug} {fy}", d, bo, "books: bank-paid expenses + transfers out")
        md.append(table(["Account", "FY", "Bank rows", "Bank credits", "Books inward", "Difference", "Bank debits", "Books outward", "Difference"], rows))
        md.append("This comparison is by yearly total, not transaction by transaction. Differences are expected where cash "
                  "collections were banked in a lump, where a cheque cleared in the next year, where deposits were opened "
                  "and closed inside the bank without a voucher, and where the books have no entry for a bank row. They "
                  "are listed so they can be explained one by one; none has been adjusted.\n")

        # ---- headline
        md.append("## Headline numbers in the database\n")
        md.append(table(["FY", "Income", "Expenditure", "Surplus"],
                        [[fy, inr(i), inr(e), inr(s)] for fy, i, e, s in q("select fy, income, expense, surplus from v_income_vs_expense_by_fy order by fy")]))
        md.append(table(["Tier", "Status", "Memberships"], q("select tier, status, count(*) from memberships where deleted_at is null group by 1, 2 order by 1, 2")))
        md.append(table(["FD status", "Deposits", "Principal"],
                        [[s, n, inr(p)] for s, n, p in q("select status, count(*), sum(principal) from fixed_deposits where deleted_at is null group by 1 order by 1")]))
        md.append(table(["Scheme", "FY", "Paid records", "Paid", "Planned (not paid)"],
                        [[n, fy or "-", c, inr(p), inr(pl)] for n, fy, c, p, pl in
                         q("select name_en, fy, disbursements, disbursed, planned from v_scheme_totals where disbursed > 0 or planned > 0 order by 1, 2")]))
        md.append(table(["Review queue", "Open items"], q("select kind, count(*) from import_review_queue where status = 'open' group by 1 order by 2 desc")))
        md.append(table(["ID series", "Last number issued"], q("select key, last_seq from id_sequences order by key")))

    from collections import Counter
    md.append(f"\n---\nExceptions listed individually in `03_reconciliation_exceptions.csv`: {len(exc)} "
              f"({dict(Counter(e['check'] for e in exc))}).\n")
    (REPORTS / "03_reconciliation.md").write_text("\n".join(md), encoding="utf-8")
    with open(REPORTS / "03_reconciliation_exceptions.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["check", "subject", "expected", "actual", "difference", "note"])
        w.writeheader()
        w.writerows(exc)
    hard = [e for e in exc if e["check"] in ("db_vs_staging", "no_provenance")]
    print(f"exceptions: {len(exc)}  hard failures (load integrity): {len(hard)}")
    print("wrote reports/03_reconciliation.md and 03_reconciliation_exceptions.csv")
    sys.exit(1 if hard else 0)


if __name__ == "__main__":
    main()
