"""Stage 4 VALIDATE - hard checks on the staged records, before anything is loaded.

Writes reports/02_validation.md and reports/02_validation_exceptions.csv.
Exit code 1 if a blocking check fails (a stored amount that is not a valid
2-decimal number, a record without a source row, a duplicate key).

Usage: python data-migration/etl/30_validate.py
"""
import csv
import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import date
from decimal import Decimal

sys.path.insert(0, os.path.dirname(__file__))
from lib import CLEAN_DIR, RAW_DIR, REPORTS, fy_of, utf8_stdout  # noqa: E402

MONEY_RE = re.compile(r"^-?\d+\.\d{2}$")
MONEY_COLS = ("amount", "cash_amount", "bank_amount", "principal", "maturity_amount", "debit", "credit", "balance")
DATE_COLS = ("entry_date", "receipt_date", "txn_date", "start_date", "maturity_date", "disbursed_on", "line_date",
             "event_date", "paid_on", "applied_on")
TRUST_REGISTERED = date(2018, 5, 14)
LARGE = Decimal("500000")


def inr(x):
    """Indian digit grouping: 1234567.5 -> 12,34,567.50"""
    x = Decimal(x).quantize(Decimal("0.01"))
    sign, s = ("-" if x < 0 else ""), f"{abs(x):.2f}"
    whole, frac = s.split(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        head = ",".join([head[max(i - 2, 0):i] for i in range(len(head), 0, -2)][::-1])
        whole = head + "," + tail
    return f"{sign}{whole}.{frac}"


def load():
    data = defaultdict(list)
    for path in sorted(CLEAN_DIR.glob("*/*.jsonl")):
        if path.name.startswith("_") or path.parent.name.startswith("_"):
            continue
        for line in open(path, encoding="utf-8"):
            rec = json.loads(line)
            rec["_domain"] = path.parent.name
            data[path.stem].append(rec)
    return data


def table(headers, rows):
    out = ["| " + " | ".join(headers) + " |", "|" + "|".join("---" for _ in headers) + "|"]
    out += ["| " + " | ".join(str(c) for c in r) + " |" for r in rows]
    return "\n".join(out) + "\n"


def main():
    utf8_stdout()
    data = load()
    md, exc, blocking = ["# Validation report (staged records, before load)\n",
                         "Amounts are rupees exactly as imported. Nothing has been corrected.\n"], [], 0

    def flag(check, tbl, key, detail, block=False):
        nonlocal blocking
        exc.append({"check": check, "table": tbl, "record_key": key, "detail": detail, "blocking": block})
        blocking += block

    # 1. counts
    md.append("## 1. Records staged\n")
    rows = []
    for tbl in sorted(data):
        doms = Counter(r["_domain"] for r in data[tbl])
        rows.append([tbl, len(data[tbl]), ", ".join(f"{d} {n}" for d, n in sorted(doms.items())),
                     sum(1 for r in data[tbl] if r.get("needs_review"))])
    md.append(table(["Table", "Records", "By transform", "Marked for review"], rows))
    skipped = []
    for p in sorted(CLEAN_DIR.glob("*/_skipped.json")):
        for reason, n in json.load(open(p, encoding="utf-8")).items():
            skipped.append([p.parent.name, reason, n])
    if skipped:
        md.append("**Source rows deliberately not imported**\n\n" + table(["Transform", "Reason", "Rows"], skipped))

    # 2. blocking integrity checks
    seen = defaultdict(set)
    for tbl, recs in data.items():
        for r in recs:
            if r["_key"] in seen[tbl]:
                flag("duplicate_key", tbl, r["_key"], "same key staged twice", True)
            seen[tbl].add(r["_key"])
            if not r.get("_sources"):
                flag("no_source_row", tbl, r["_key"], "record has no provenance", True)
            for c in MONEY_COLS:
                if c in r and not MONEY_RE.match(str(r[c])):
                    flag("amount_not_2dp", tbl, r["_key"], f"{c}={r[c]!r}", True)
    md.append("## 2. Integrity\n")
    md.append(f"- Records with no source row, duplicate keys, or an amount that is not a valid 2-decimal number: "
              f"**{blocking}** (must be 0 to load).\n")

    # 3. coverage of source sheets
    md.append("## 3. Source sheet coverage\n")
    cited = defaultdict(lambda: Counter())
    for tbl, recs in data.items():
        for r in recs:
            for s in r.get("_sources") or []:
                cited[(s["file"], s["sheet"])][s.get("role", "primary")] += 1
    raw_count = Counter()
    for p in RAW_DIR.glob("*.jsonl"):
        for line in open(p, encoding="utf-8"):
            raw_count[(p.stem, json.loads(line)["sheet"])] += 1
    decisions = {}
    cls = REPORTS / "01_classification.csv"
    if cls.exists():
        for r in csv.DictReader(open(cls, encoding="utf-8-sig")):
            decisions[(r["sheet_id"].split(".")[0], r["sheet"])] = r["decision"]
    rows, untouched = [], []
    for k in sorted(set(raw_count) | set(cited)):
        c = cited.get(k, Counter())
        dec = decisions.get(k, "document")
        if c:
            rows.append([k[0], k[1], dec, raw_count.get(k, 0), c["primary"], c["duplicate"], c["enrichment"]])
        elif dec == "import":
            untouched.append([k[0], k[1], raw_count.get(k, 0)])
    md.append(table(["File", "Sheet", "Phase 0 decision", "Rows in sheet", "Cited as primary", "As duplicate", "As enrichment"], rows))
    md.append("Rows in a sheet include titles, headers, blank-ish and total rows, so cited rows are always fewer.\n")
    if untouched:
        md.append("**Sheets classified `import` in Phase 0 that no record cites (files not yet processed)**\n\n"
                  + table(["File", "Sheet", "Rows"], untouched))
        for f, s, n in untouched:
            flag("sheet_not_imported", "-", f"{f}:{s}", f"{n} rows, classified import, cited by nothing")

    # 4. dates and amounts
    md.append("## 4. Dates and amounts\n")
    stats = Counter()
    for tbl, recs in data.items():
        for r in recs:
            for c in DATE_COLS:
                if r.get(c):
                    d = date.fromisoformat(r[c][:10])
                    if d > date.today():
                        stats["future date"] += 1
                        flag("future_date", tbl, r["_key"], f"{c}={r[c]}")
                    if d < TRUST_REGISTERED and r.get("entity") != "pre_trust" and tbl not in ("membership_snapshots", "annual_statement_lines"):
                        stats["date before trust registration (14 May 2018)"] += 1
                        flag("before_registration", tbl, r["_key"], f"{c}={r[c]}")
            main_date = r.get("entry_date") or r.get("receipt_date") or r.get("txn_date")
            if main_date and r.get("fy") and fy_of(date.fromisoformat(main_date[:10])) != r["fy"]:
                stats["date falls outside the record's financial year"] += 1
                flag("date_outside_fy", tbl, r["_key"], f"date {main_date}, fy {r['fy']}")
            if tbl in ("income_entries", "expenses", "transfers") and not main_date:
                stats[f"{tbl} without a date"] += 1
                flag("missing_date", tbl, r["_key"], "no date")
            if "amount" in r and MONEY_RE.match(str(r["amount"])):
                a = Decimal(r["amount"])
                if a == 0:
                    stats["zero amount"] += 1
                    flag("zero_amount", tbl, r["_key"], "amount 0.00")
                elif a < 0:
                    stats["negative amount"] += 1
                    flag("negative_amount", tbl, r["_key"], f"amount {a}")
                elif a >= LARGE and tbl in ("income_entries", "expenses"):
                    stats["unusually large (5,00,000 or more)"] += 1
                    flag("large_amount", tbl, r["_key"], f"amount {inr(a)}")
    md.append(table(["Check", "Records"], sorted(stats.items())) if stats else "No date or amount anomalies.\n")

    # 5. money by financial year
    def by_fy(tbl, field="kind"):
        agg = defaultdict(lambda: [0, Decimal(0)])
        for r in data.get(tbl, []):
            k = (r.get("fy") or "undated", r.get(field) or "-")
            agg[k][0] += 1
            agg[k][1] += Decimal(r["amount"])
        return agg

    md.append("## 5. Income by financial year and kind\n")
    inc = by_fy("income_entries")
    md.append(table(["FY", "Kind", "Entries", "Total"], [[fy, k, n, inr(t)] for (fy, k), (n, t) in sorted(inc.items())]))
    fy_tot = defaultdict(Decimal)
    real = defaultdict(Decimal)
    for (fy, k), (n, t) in inc.items():
        fy_tot[fy] += t
        if k not in ("loan_received", "refund_received"):
            real[fy] += t
    exp = defaultdict(lambda: [0, Decimal(0)])
    for r in data.get("expenses", []):
        e = exp[r.get("fy") or "undated"]
        e[0] += 1
        e[1] += Decimal(r["amount"])
    trf = by_fy("transfers")
    md.append("## 6. Income, expenditure and transfers by financial year\n")
    fys = sorted(set(real) | set(exp) | {fy for fy, _ in trf})
    md.append(table(["FY", "Income (excl. loans and refunds)", "Expense vouchers", "Expenditure", "Surplus", "Transfers (not income or expense)"],
                    [[fy, inr(real[fy]), exp[fy][0], inr(exp[fy][1]), inr(real[fy] - exp[fy][1]),
                      inr(sum(t for (f, _), (_, t) in trf.items() if f == fy))] for fy in fys]))
    if trf:
        md.append(table(["FY", "Transfer kind", "Entries", "Total"], [[fy, k, n, inr(t)] for (fy, k), (n, t) in sorted(trf.items())]))

    # 6. printed statements, for comparison
    md.append("## 7. Printed year-end statements (reconciliation targets)\n")
    stm = {s["_key"]: s for s in data.get("annual_statements", [])}
    agg = defaultdict(lambda: defaultdict(Decimal))
    for line in data.get("annual_statement_lines", []):
        agg[line["statement_key"]][line["side"]] += Decimal(line["amount"])
    md.append(table(["FY", "Entity", "Source", "Opening", "Inward lines", "Outward lines", "Closing", "Printed totals"],
                    [[s.get("fy"), s.get("entity", "trust"), s.get("source_label"),
                      *[inr(agg[k][side]) for side in ("opening", "inward", "outward", "closing", "total")]]
                     for k, s in sorted(stm.items(), key=lambda kv: (kv[1].get("entity", ""), kv[1].get("fy") or "", kv[1].get("source_label") or ""))]))
    md.append("Printed inward and outward figures include deposits, closures and own-account transfers, so they are "
              "expected to exceed income and expenditure above; the difference is explained in the reconciliation report.\n")

    # 7. receipts
    md.append("## 8. Receipt-number continuity\n")
    series = defaultdict(list)
    for r in data.get("receipts", []):
        if r.get("number") is not None:
            series[(r.get("fy") or "undated", r.get("series") or "-")].append((int(r["number"]), r.get("line_no", 1), r.get("receipt_date") or ""))
    rows = []
    for (fy, s), nums in sorted(series.items()):
        distinct = sorted({n for n, _, _ in nums})
        gaps = [n for n in range(distinct[0], distinct[-1] + 1) if n not in set(distinct)]
        dup = sum(1 for n, c in Counter((n, l) for n, l, _ in nums).items() if c > 1)
        in_date = sorted(nums, key=lambda x: (x[2], x[0]))
        out_of_order = sum(1 for a, b in zip(in_date, in_date[1:]) if b[0] < a[0])
        rows.append([fy, s, len(nums), distinct[0], distinct[-1], len(gaps), dup, out_of_order])
        if gaps:
            flag("receipt_gaps", "receipts", f"{fy}:{s}", f"{len(gaps)} missing numbers between {distinct[0]} and {distinct[-1]}: "
                 + ", ".join(map(str, gaps[:40])) + (" ..." if len(gaps) > 40 else ""))
    no_num = sum(1 for r in data.get("receipts", []) if r.get("number") is None)
    md.append(table(["FY", "Series", "Receipts", "First", "Last", "Missing numbers", "Duplicate number+line", "Out of date order"], rows))
    md.append(f"Receipts with no number: {no_num}. Cancelled: {sum(1 for r in data.get('receipts', []) if r.get('is_cancelled'))}. "
              f"Income entries with no receipt: {sum(1 for r in data.get('income_entries', []) if not r.get('receipt_key'))}.\n")

    # 8. memberships
    md.append("## 9. Memberships\n")
    mem = data.get("memberships", [])
    md.append(table(["Tier", "Status", "Memberships"], [[t, s, n] for (t, s), n in sorted(Counter((m.get("tier"), m.get("status")) for m in mem).items())]))
    bad = [m for m in mem if m.get("start_date") and m.get("expiry_date") and m["expiry_date"] < m["start_date"]]
    for m in bad:
        flag("expiry_before_start", "memberships", m["_key"], f"{m['start_date']} > {m['expiry_date']}")
    md.append(f"- Dates derived by rule: {sum(1 for m in mem if m.get('dates_derived'))}; no start date: "
              f"{sum(1 for m in mem if not m.get('start_date'))}; expiry before start: {len(bad)}.\n")
    snaps = Counter((s.get("snapshot_label"), s.get("fy")) for s in data.get("membership_snapshots", []))
    if snaps:
        md.append(table(["Snapshot", "FY", "Rows"], [[a, b, n] for (a, b), n in sorted(snaps.items(), key=lambda kv: (kv[0][1] or "", kv[0][0] or ""))]))

    # 9. fixed deposits, investments, bank
    md.append("## 10. Fixed deposits, investments and bank accounts\n")
    fds = data.get("fixed_deposits", [])
    agg_fd = defaultdict(lambda: [0, Decimal(0)])
    for f in fds:
        a = agg_fd[(f.get("bank"), f.get("status"))]
        a[0] += 1
        a[1] += Decimal(f["principal"])
    md.append(table(["Bank", "Status", "Deposits", "Principal"], [[b, s, n, inr(t)] for (b, s), (n, t) in sorted(agg_fd.items(), key=lambda kv: (str(kv[0][0]), str(kv[0][1])))]))
    for f in fds:
        if f.get("start_date") and f.get("maturity_date") and f["maturity_date"] <= f["start_date"]:
            flag("fd_maturity_before_start", "fixed_deposits", f["_key"], f"{f['start_date']} .. {f['maturity_date']}")
        if f.get("maturity_amount") and Decimal(f["maturity_amount"]) < Decimal(f["principal"]):
            flag("fd_maturity_below_principal", "fixed_deposits", f["_key"], f"{f['principal']} -> {f['maturity_amount']}")
    fe = defaultdict(Decimal)
    for e in data.get("fd_events", []):
        fe[(e.get("fy") or "undated", e["kind"])] += Decimal(e["amount"])
    if fe:
        md.append(table(["FY", "FD event", "Total"], [[fy, k, inr(t)] for (fy, k), t in sorted(fe.items())]))
    inv = defaultdict(Decimal)
    for t in data.get("investment_transactions", []):
        inv[t.get("fy") or "undated"] += Decimal(t["amount"])
    if inv:
        md.append(table(["FY", "Invested in mutual funds"], [[fy, inr(t)] for fy, t in sorted(inv.items())]))
    bank = defaultdict(lambda: [0, Decimal(0), Decimal(0), "9999", "0000"])
    for t in data.get("bank_transactions", []):
        b = bank[(t.get("bank_slug"), t.get("fy") or "undated")]
        b[0] += 1
        b[1] += Decimal(t.get("debit") or 0)
        b[2] += Decimal(t.get("credit") or 0)
        if t.get("txn_date"):
            b[3], b[4] = min(b[3], t["txn_date"]), max(b[4], t["txn_date"])
    if bank:
        md.append(table(["Account", "FY", "Transactions", "Debits", "Credits", "First", "Last"],
                        [[a, fy, n, inr(d), inr(c), lo, hi] for (a, fy), (n, d, c, lo, hi) in sorted(bank.items(), key=lambda kv: (str(kv[0][0]), kv[0][1]))]))

    # 10. events and schemes
    md.append("## 11. Events and schemes\n")
    ev = defaultdict(lambda: defaultdict(Decimal))
    for line in data.get("event_account_lines", []):
        ev[line.get("event_slug")][line["side"]] += Decimal(line["amount"])
    md.append(table(["Event / activity", "Income", "Expense", "Net", "Memo lines"],
                    [[e, inr(v["income"]), inr(v["expense"]), inr(v["income"] - v["expense"]), inr(v["memo"])] for e, v in sorted(ev.items(), key=lambda kv: str(kv[0]))]))
    sc = defaultdict(lambda: [0, 0, Decimal(0)])
    for d in data.get("scheme_disbursements", []):
        s = sc[(d.get("scheme_slug"), d.get("fy") or "undated")]
        s[0] += 1
        s[1] += d.get("beneficiary_count") or 1
        s[2] += Decimal(d["amount"])
    md.append(table(["Scheme", "FY", "Disbursement records", "Beneficiaries", "Amount"],
                    [[s, fy, n, b, inr(t)] for (s, fy), (n, b, t) in sorted(sc.items(), key=lambda kv: (str(kv[0][0]), kv[0][1]))]))

    # 11. review queue
    md.append("## 12. Items waiting for a human decision\n")
    rev = Counter()
    for p in sorted(CLEAN_DIR.glob("*/_review.jsonl")):
        for line in open(p, encoding="utf-8"):
            r = json.loads(line)
            rev[(p.parent.name, r["kind"], r.get("severity", "medium"))] += 1
    md.append(table(["Transform", "Kind", "Severity", "Items"], [[d, k, s, n] for (d, k, s), n in sorted(rev.items())]))
    ppl = CLEAN_DIR / "_people"
    if (ppl / "people.jsonl").exists():
        n = lambda f: sum(1 for _ in open(ppl / f, encoding="utf-8"))  # noqa: E731
        md.append(f"People: {n('people.jsonl')} identities from {n('mention_map.jsonl')} mentions; "
                  f"{n('merge_candidates.jsonl')} possible duplicates and {n('conflicts.jsonl')} people with conflicting details await review. "
                  f"Every automatic merge is listed in `02_people_merges.csv`.\n")

    md.append(f"\n---\nExceptions listed individually in `02_validation_exceptions.csv`: {len(exc)} "
              f"({dict(Counter(e['check'] for e in exc))}).\n")
    (REPORTS / "02_validation.md").write_text("\n".join(md), encoding="utf-8")
    with open(REPORTS / "02_validation_exceptions.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["check", "table", "record_key", "detail", "blocking"])
        w.writeheader()
        w.writerows(exc)
    print(f"tables: {len(data)}  records: {sum(len(v) for v in data.values())}  exceptions: {len(exc)}  blocking: {blocking}")
    print("wrote reports/02_validation.md and 02_validation_exceptions.csv")
    sys.exit(1 if blocking else 0)


if __name__ == "__main__":
    main()
