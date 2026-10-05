"""Bank statements, fixed deposits, investments, budgets and annual statements.

Domain "bank", key prefix "bnk:".  See data-migration/etl/CONTRACT.md.

What this module does, in order:
  0. PDF text (reports/doc_text/<file_id>.txt) -> staging/raw/<file_id>.jsonl, one
     record per non-empty line ({"sheet": "page N", "row": line no in the page}),
     so that PDF-derived records carry the same provenance as spreadsheet rows.
  1. bank_transactions: one canonical copy per account and period, every other
     copy matched row by row and attached as a duplicate source.
  2. fixed_deposits + fd_events (bank documents first, the trust's registers second).
  3. investments + investment_transactions (three ICICI Prudential SIP schemes).
  4. budgets + budget_lines.
  5. annual_statements + annual_statement_lines.
  6. Review items that belong to no single record.

Nothing here writes outside staging/raw (PDF lines only) and staging/clean/bank.
"""
import os, sys; sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import json
import re
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP

from lib import (Staging, RAW_DIR, REPORTS, raw_rows, raw_sheets, src, parse_date, parse_amount,
                 fy_of, clean_text, money, utf8_stdout)

D = Decimal
ZERO = D("0.00")
# The archive was frozen on this date; "matured" / "past maturity" are judged against it.
ARCHIVE_DATE = date(2026, 10, 4)

# Text documents whose lines are copied into staging/raw (step 0).
PDF_IDS = ["F017", "F018", "F019", "F023", "F057", "F058", "F059", "F062", "F065", "F067", "F069",
           "F070", "F071", "F078", "F082", "F096", "F108", "F118", "F122", "F123", "F124", "F125",
           "F126", "F128", "F153", "F156", "F157", "F158", "F196"]
LOCKED_PDFS = ["F024", "F025", "F028", "F060", "F064", "F074", "F077", "F079", "F088", "F089",
               "F090", "F109"]
SCANNED_DOCS = ["F087", "F091", "F092", "F093", "F100", "F101", "F102", "F103", "F104", "F105",
                "F116", "F117", "F164", "F197"]

AMT = r"-?[\d,]+\.\d{2}"


# =====================================================================================
# 0. PDF text -> raw
# =====================================================================================

def split_pdf_text(text):
    """[(sheet, line_no_within_page, line)] for every non-empty line of an extracted text."""
    out, page, n = [], "page 1", 0
    for line in text.split("\n"):
        line = line.rstrip("\r")
        m = re.fullmatch(r"--- page (\d+) ---", line.strip())
        if m:
            page, n = f"page {m[1]}", 0
            continue
        n += 1
        if line.strip():
            out.append((page, n, line))
    return out


def pdf_to_raw(file_id):
    path = REPORTS / "doc_text" / f"{file_id}.txt"
    if not path.exists():
        return False
    rows = split_pdf_text(path.read_text(encoding="utf-8"))
    with open(RAW_DIR / f"{file_id}.jsonl", "w", encoding="utf-8") as f:
        for sheet, n, line in rows:
            f.write(json.dumps({"sheet": sheet, "row": n, "cells": {"A": line}}, ensure_ascii=False) + "\n")
    return True


def pdf_lines(file_id):
    """[(sheet, row, text)] in document order, read back through lib.raw_rows."""
    out = []
    for sheet in raw_sheets(file_id):
        for row, cells in raw_rows(file_id, sheet):
            out.append((sheet, row, cells.get("A", "")))
    return out


# =====================================================================================
# Pure helpers (unit-tested in data-migration/tests/test_t_bank.py)
# =====================================================================================

def num(s):
    """Decimal from a printed figure with thousands separators ('1,23,456.78')."""
    return D(s.replace(",", "").replace("₹", "").strip())


def signed_balance(figure, drcr):
    v = num(figure)
    return -v if (drcr or "").upper() == "DR" else v


def side_from_balance(prev_balance, amount, balance):
    """'debit' / 'credit' from the movement of the running balance, None when the row's
    amount does not explain the movement (or the previous balance is unknown)."""
    if prev_balance is None or amount is None or balance is None:
        return None
    delta = balance - prev_balance
    if delta == amount and amount != 0:
        return "credit"
    if delta == -amount and amount != 0:
        return "debit"
    if amount == 0 and delta == 0:
        return "none"
    return None


def check_running_balance(rows, opening=None):
    """rows: dicts with debit, credit, balance, date (in statement order).
    Returns a list of failures: {'i', 'kind': 'balance' | 'date', ...}."""
    fails, prev_bal, prev_date = [], opening, None
    for i, r in enumerate(rows):
        bal = r.get("balance")
        if bal is not None:
            if prev_bal is not None:
                expect = prev_bal + (r.get("credit") or ZERO) - (r.get("debit") or ZERO)
                if expect != bal:
                    fails.append({"i": i, "kind": "balance", "expected": expect, "printed": bal,
                                  "difference": bal - expect})
            prev_bal = bal
        d = r.get("date")
        if d is not None:
            if prev_date is not None and d < prev_date:
                fails.append({"i": i, "kind": "date", "previous": prev_date, "this": d})
            prev_date = d
    return fails


# ---- Saraswat Bank -------------------------------------------------------------------

_SAR_TAIL = re.compile(rf"(?:^|\s)(?:(\d{{3,}})\s+)?({AMT}) ({AMT}) (CR|DR)\s*$")
_SAR_TAIL_BAL = re.compile(rf"(?:^|\s)({AMT}) (CR|DR)\s*$")
_SAR_NOISE = re.compile(r"^(PAGE\s*:|Period :Account|Date Particulars Instruments|Dr/Cr$)")


def sar_branch_tail(line):
    """Last line of a Saraswat branch-statement row: '[cheque] amount balance CR'.
    Returns (text_before, instrument, amount, balance); amount is None on a
    balance-only line (charge notices)."""
    m = _SAR_TAIL.search(line)
    if m:
        return line[:m.start()].strip(), m[1], num(m[2]), signed_balance(m[3], m[4])
    m = _SAR_TAIL_BAL.search(line)
    if m:
        return line[:m.start()].strip(), None, None, signed_balance(m[1], m[2])
    return None


def parse_saraswat_branch(lines):
    """Saraswat branch-layout statement (text PDF).  lines: [(sheet, row, text)].
    Returns {'opening', 'rows', 'totals': (dr, cr) | None, 'closing', 'period'}.
    The Dr/Cr column is lost in the text; the side is set later from the balance."""
    rows, opening, totals, closing, period = [], None, None, None, None
    cur, ended = None, False
    for sheet, n, text in lines:
        t = text.strip()
        if not period:
            m = re.search(r"Period :Account : (\d\d/\d\d/\d{4}) - (\d\d/\d\d/\d{4})", t)
            if m:
                period = (m[1], m[2])
        if "END OF STATEMENT" in t:
            ended, cur = True, None
            continue
        if ended:
            m = re.search(rf"Totals / Balance :- ({AMT}) ({AMT})", t)
            if m:
                totals = (num(m[1]), num(m[2]))
            m = re.fullmatch(rf"({AMT}) (CR|DR)", t)
            if m and closing is None:
                closing = signed_balance(m[1], m[2])
            continue
        if _SAR_NOISE.match(t):
            continue
        dm = re.match(r"^(\d\d)-(\d\d)-(\d{4})\b\s*(.*)$", t)
        if dm:
            cur = {"date": date(int(dm[3]), int(dm[2]), int(dm[1])), "date_as_written": t[:10],
                   "parts": [], "src": (sheet, n), "lines": [(sheet, n)]}
            t = dm[4]
        elif cur is None:
            m = re.fullmatch(rf"({AMT}) (CR|DR)", t)
            if m and opening is None and not rows:
                opening = signed_balance(m[1], m[2])
            continue
        else:
            cur["lines"].append((sheet, n))
        tail = sar_branch_tail(t)
        if tail:
            before, instr, amount, bal = tail
            if before:
                cur["parts"].append(before)
            rows.append({"date": cur["date"], "date_as_written": cur["date_as_written"],
                         "narration": clean_text(" ".join(cur["parts"])), "reference": instr,
                         "amount": amount if amount is not None else ZERO, "balance": bal,
                         "no_amount": amount is None, "src": cur["src"]})
            cur = None
        elif t:
            cur["parts"].append(t)
    return {"opening": opening, "rows": rows, "totals": totals, "closing": closing, "period": period}


_SAR_VARIANT = re.compile(rf"^(\d\d)-(\d\d)-(\d{{4}}) (?:({AMT}) )?({AMT}) (CR|DR)(.*)$")


def sar_variant_line(line):
    """Row start of the Saraswat branch 'variant' layout (F067): date, amount, balance,
    then the narration glued to CR.  Returns (date, amount, balance, narration_start)."""
    m = _SAR_VARIANT.match(line.strip())
    if not m:
        return None
    return (date(int(m[3]), int(m[2]), int(m[1])), num(m[4]) if m[4] else ZERO,
            signed_balance(m[5], m[6]), m[7].strip())


_SAR_NET = re.compile(rf"^(\d\d)/(\d\d)/(\d{{4}}) ({AMT}) ([\d,]+\.\d{{2}})(\d*)$")


def sar_netbank_line(line):
    """Saraswat net-banking PDF row: 'dd/mm/yyyy signed-amount balance[cheque no glued]'.
    Returns (date, signed_amount, balance, instrument)."""
    m = _SAR_NET.match(line.strip())
    if not m:
        return None
    return date(int(m[3]), int(m[2]), int(m[1])), num(m[4]), num(m[5]), (m[6] or None)


# ---- HDFC Bank -----------------------------------------------------------------------

_HDFC_LINE = re.compile(r"^(?:(\d\d)/(\d\d)/(\d\d) )?(.*?)\s?(\d\d)/(\d\d)/(\d\d) ([\d,]+\.\d{2}) (-?[\d,]+\.\d{2})$")


def hdfc_pdf_line(line):
    """HDFC statement PDF: the line that ends 'value-date amount closing-balance'.
    The transaction date is on the same line or (wrapped narration) on an earlier one.
    Returns (txn_date | None, text, value_date, amount, balance)."""
    m = _HDFC_LINE.match(line.strip())
    if not m:
        return None
    txn = date(2000 + int(m[3]), int(m[2]), int(m[1])) if m[1] else None
    return txn, m[4].strip(), date(2000 + int(m[7]), int(m[6]), int(m[5])), num(m[8]), num(m[9])


def hdfc_text_date(v):
    """HDFC prints dd/mm/yy.  Returns a date or None."""
    if isinstance(v, datetime):
        return v.date()
    m = re.fullmatch(r"(\d\d)/(\d\d)/(\d\d)", str(v or "").strip())
    if not m:
        return None
    try:
        return date(2000 + int(m[3]), int(m[2]), int(m[1]))
    except ValueError:
        return None


# ---- State Bank of India -------------------------------------------------------------

_SBI_ROW = re.compile(r"^(\d\d)-(\d\d)-(\d{4}) (\d\d)-(\d\d)-(\d{4}) (.*?) ([\d,]+\.\d{2}) ([\d,]+\.\d{2})\s*(CR|DR)$")


def sbi_branch_row(text):
    """One SBI branch-statement row with its wrapped lines joined by spaces:
    'post-date value-date description [ref] amount balanceCR'.
    Returns (post_date, value_date, narration, amount, balance)."""
    m = _SBI_ROW.match(re.sub(r"\s+", " ", text).strip())
    if not m:
        return None
    return (date(int(m[3]), int(m[2]), int(m[1])), date(int(m[6]), int(m[5]), int(m[4])),
            m[7].strip(), num(m[8]), signed_balance(m[9], m[10]))


_MON = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7, "aug": 8, "sep": 9,
        "oct": 10, "nov": 11, "dec": 12}


def sbi_web_rows(text):
    """SBI 'yono' web print (F153): dates are split over six lines, amounts wrap.
    Returns [(date, amount, balance)] in print order (used only to match duplicates)."""
    flat = re.sub(r"\s+", " ", text)
    out = []
    pat = re.compile(r"(\d\d)- ([A-Za-z]{3})- (\d{4}) \(\d\d- [A-Za-z]{3}- \d{4}\)(.*?)₹ ?([\d,]+\.\d{2}) ₹ ?([\d,]+\.\d{2})")
    for m in pat.finditer(flat):
        out.append((date(int(m[3]), _MON[m[2].lower()], int(m[1])), num(m[5]), num(m[6])))
    return out


# ---- Fixed-deposit arithmetic -----------------------------------------------------------

def simple_interest(principal, rate_pct, days, basis=365):
    """Simple interest, rounded half-up to the rupee."""
    v = D(principal) * D(str(rate_pct)) / D(100) * D(days) / D(basis)
    return v.quantize(D("1"), rounding=ROUND_HALF_UP)


def compound_maturity(principal, rate_pct, start, maturity, periods_per_year=4):
    """Maturity value with compounding every 12/periods_per_year months over the term
    measured in days/365, rounded half-up to the rupee."""
    years = D((maturity - start).days) / D(365)
    r = D(str(rate_pct)) / D(100) / D(periods_per_year)
    v = D(principal) * D(str((1 + float(r)) ** float(years * periods_per_year)))
    return v.quantize(D("1"), rounding=ROUND_HALF_UP)


def maturity_check(principal, rate_pct, start, maturity, printed, tolerance=D("1")):
    """Compares the printed maturity value with simple interest (terms under a year are
    paid that way by all four banks) and with quarterly / annual compounding.
    Returns {'ok', 'rule', 'expected', 'difference'}; ok is None when inputs are missing."""
    if None in (principal, rate_pct, start, maturity, printed):
        return {"ok": None, "rule": None, "expected": None, "difference": None}
    days = (maturity - start).days
    cands = [("simple", D(principal) + simple_interest(principal, rate_pct, days)),
             ("quarterly", compound_maturity(principal, rate_pct, start, maturity, 4)),
             ("annual", compound_maturity(principal, rate_pct, start, maturity, 1))]
    rule, expected = min(cands, key=lambda c: abs(c[1] - D(printed)))
    diff = D(printed) - expected
    return {"ok": abs(diff) <= tolerance, "rule": rule, "expected": expected, "difference": diff}


def mask(numstr):
    s = str(numstr or "")
    return ("…" + s[-4:]) if len(s) > 4 else s


# =====================================================================================
# 1. Bank transactions
# =====================================================================================

class Ledger:
    """Collects the canonical rows of one account and matches every other copy."""

    def __init__(self, st, slug):
        self.st, self.slug = st, slug
        self.rows = []                       # emitted rows, statement order
        self.index = defaultdict(list)       # (date, |amount|, balance) -> [row]
        self.stats = defaultdict(lambda: Counter())

    @staticmethod
    def key(r):
        return (r["date"], abs(r.get("amount") or ZERO), r.get("balance"))

    def add(self, fid, r):
        """Canonical row, unless the same row was already taken from an earlier file."""
        self.stats[fid]["read"] += 1
        hit = self._unclaimed(self.key(r), fid)
        if hit is not None:
            hit["sources"].append(src(fid, r["src"][0], r["src"][1], "duplicate"))
            hit["claimed"].add(fid)
            self.stats[fid]["duplicate"] += 1
            return hit
        r = dict(r)
        r["sources"] = [src(fid, r["src"][0], r["src"][1])]
        r["claimed"] = {fid}
        r["file"] = fid
        self.rows.append(r)
        self.index[self.key(r)].append(r)
        self.stats[fid]["emitted"] += 1
        return r

    def _unclaimed(self, key, fid):
        for r in self.index.get(key, []):
            if fid not in r["claimed"]:
                return r
        return None

    def duplicate(self, fid, d, amount, balance, sheet, row, role="duplicate", extra=None, claim=None):
        """A row of a non-canonical copy.  Returns the canonical row or None.
        claim: token that may match a canonical row only once (default: the file id)."""
        claim = claim or fid
        self.stats[claim]["read"] += 1
        hit = self._unclaimed((d, abs(amount), balance), claim)
        if hit is None:
            self.stats[claim]["unmatched"] += 1
            return None
        hit["sources"].append(src(fid, sheet, row, role))
        hit["claimed"].add(claim)
        if extra:
            for k, v in extra.items():
                if v and not hit.get(k):
                    hit[k] = v
        self.stats[claim]["duplicate"] += 1
        return hit


def assign_sides(rows, opening):
    """Sets debit / credit on rows that only carry an unsigned amount, from the balance.
    Returns the indexes that could not be explained."""
    bad, prev = [], opening
    for i, r in enumerate(rows):
        if "debit" not in r and "credit" not in r:
            side = side_from_balance(prev, r["amount"], r["balance"])
            if side == "credit":
                r["credit"], r["debit"] = r["amount"], None
            elif side == "debit":
                r["debit"], r["credit"] = r["amount"], None
            elif side == "none":
                r["debit"] = r["credit"] = None
            else:
                bad.append(i)
                delta = (r["balance"] - prev) if prev is not None else None
                if delta is not None and delta < 0:
                    r["debit"], r["credit"] = r["amount"], None
                else:
                    r["credit"], r["debit"] = r["amount"], None
        prev = r["balance"]
    return bad


def _amt(st, v, where, what):
    a, note = parse_amount(v)
    if note == "unparsed" or (note or "").startswith("rounded_from"):
        st.review("bad_amount", f"{what} could not be read cleanly",
                  {"file": where[0], "sheet": where[1], "row": where[2], "as_written": str(v), "note": note},
                  severity="medium", suggested_action="Check the figure against the bank's own statement.")
    return a


def statement_totals_check(st, fid, label, rows, opening, closing, totals, slug):
    """Statement-level check: opening + credits - debits = closing, and the bank's printed
    totals.  Row-level checks are done later on the merged ledger."""
    dr = sum((r.get("debit") or ZERO) for r in rows)
    cr = sum((r.get("credit") or ZERO) for r in rows)
    ev = {"file": fid, "account": slug, "rows": len(rows), "opening": money(opening) if opening is not None else None,
          "closing_printed": money(closing) if closing is not None else None, "debits": money(dr), "credits": money(cr)}
    ok = True
    if totals and (totals[0] != dr or totals[1] != cr):
        ok = False
        ev["printed_debits"], ev["printed_credits"] = money(totals[0]), money(totals[1])
    if opening is not None and closing is not None and opening + cr - dr != closing:
        ok = False
        ev["opening_plus_movement"] = money(opening + cr - dr)
    if not ok:
        st.review("total_mismatch", f"{label}: statement totals do not agree with its rows", ev, severity="high",
                  suggested_action="Compare with the bank's original statement.")
    return {"file": fid, "opening": opening, "closing": closing, "debits": dr, "credits": cr,
            "printed_totals": totals, "ok": ok, "rows": len(rows)}


# ---- Saraswat ------------------------------------------------------------------------

def load_saraswat_pdf(st, led, fid, checks):
    p = parse_saraswat_branch(pdf_lines(fid))
    rows = p["rows"]
    bad = assign_sides(rows, p["opening"])
    for i in bad:
        r = rows[i]
        st.review("continuity_break", "Saraswat statement row does not explain the balance movement",
                  {"file": fid, "sheet": r["src"][0], "row": r["src"][1], "date": r["date"].isoformat(),
                   "amount": money(r["amount"]), "balance": money(r["balance"])}, severity="high",
                  suggested_action="Check the row against the bank's statement; debit/credit side was inferred.")
    checks.append(statement_totals_check(st, fid, f"Saraswat statement {fid}", rows, p["opening"], p["closing"],
                                         p["totals"], "saraswat"))
    for r in rows:
        led.add(fid, r)
    return p


def _sar_balance_text(v):
    """'69,309.98 CR' -> Decimal (xlsx conversions of the branch statement)."""
    m = re.fullmatch(rf"\s*({AMT})\s*(CR|DR)\s*", str(v or ""))
    return signed_balance(m[1], m[2]) if m else None


def load_saraswat_xlsx(st, led, fid, checks, canonical=True):
    """F075 / F066: PDF-to-Excel conversion of the branch statement.  The first sheet has
    scattered columns (Dr in P, Cr in T, balance in W), later sheets A-F."""
    rows, opening = [], None
    for sheet in raw_sheets(fid):
        cols = None
        for n, c in raw_rows(fid, sheet):
            if clean_text(c.get("A")) == "Date" and clean_text(c.get("B")) == "Particulars":
                inv = {clean_text(v): k for k, v in c.items() if isinstance(v, str)}
                cols = {"instr": inv.get("Instruments"), "dr": inv.get("Dr Amount"), "cr": inv.get("Cr Amount"),
                        "bal": inv.get("Total Amount Dr/Cr")}
                continue
            if cols is None:
                continue
            bal = _sar_balance_text(c.get(cols["bal"]))
            if not isinstance(c.get("A"), datetime):
                if bal is not None and opening is None and not rows and not c.get("B"):
                    opening = bal
                elif any(k != "_f" for k in c) and not re.search(r"END OF STATEMENT|Totals|Closing Balance|PAGE", " ".join(str(v) for v in c.values())):
                    st.skip(f"{fid}: non-transaction row in statement sheet")
                continue
            dr = _amt(st, c.get(cols["dr"]), (fid, sheet, n), "Saraswat debit")
            cr = _amt(st, c.get(cols["cr"]), (fid, sheet, n), "Saraswat credit")
            instr = c.get(cols["instr"])
            if isinstance(instr, float) and instr.is_integer():
                instr = str(int(instr))
            rows.append({"date": c["A"].date(), "date_as_written": c["A"].date().isoformat(),
                         "narration": clean_text(c.get("B")), "reference": clean_text(instr),
                         "debit": dr, "credit": cr, "amount": dr or cr or ZERO, "balance": bal,
                         "src": (sheet, n)})
    totals = closing = None
    for sheet in raw_sheets(fid):
        for n, c in raw_rows(fid, sheet):
            joined = " ".join(str(v) for k, v in c.items() if k != "_f")
            if "Totals / Balance" in joined:
                nums = [parse_amount(v)[0] for k, v in sorted(c.items()) if k != "_f"]
                nums = [x for x in nums if x is not None]
                if len(nums) >= 2:
                    totals = (nums[0], nums[1])
    if canonical:
        checks.append(statement_totals_check(st, fid, f"Saraswat statement {fid}", rows, opening,
                                             rows[-1]["balance"] if rows else None, totals, "saraswat"))
        for r in rows:
            led.add(fid, r)
    else:
        for r in rows:
            if led.duplicate(fid, r["date"], r["amount"], r["balance"], r["src"][0], r["src"][1]) is None:
                _unmatched(st, fid, r["src"], r["date"], r["amount"], r["balance"], "saraswat")
    return {"opening": opening, "rows": rows, "totals": totals}


def _unmatched(st, fid, where, d, amount, balance, slug):
    st.review("conflicting_sources", "Statement copy has a row that the canonical statement does not",
              {"file": fid, "sheet": where[0], "row": where[1], "account": slug, "date": d.isoformat(),
               "amount": money(abs(amount)), "balance": money(balance)}, severity="high",
              suggested_action="Compare the two statements; the row was not imported.")
    st.skip(f"{fid}: row of a duplicate statement copy not found in the canonical statement")


def load_saraswat_netbank_xls(st, led, fid, sheet, checks, canonical):
    """F133 / F135 sheet 1: net-banking export, two physical rows per transaction
    (date / signed amount / balance, then remarks), newest first."""
    raw = raw_rows(fid, sheet)
    hdr = None
    for n, c in raw:
        inv = {clean_text(v): k for k, v in c.items() if isinstance(v, str)}
        if "Date" in inv and "Instrument ID" in inv:
            hdr = (n, inv)
            break
    if not hdr:
        st.review("missing_document", "Saraswat export sheet has no recognisable header",
                  {"file": fid, "sheet": sheet}, severity="high")
        return None
    inv = hdr[1]
    c_date, c_instr = inv["Date"], inv["Instrument ID"]
    c_amt = next(k for v, k in inv.items() if v.startswith("Amount"))
    c_bal = next(k for v, k in inv.items() if v.startswith("Balance"))
    items, opening, text_bal = [], None, 0
    body = [(n, c) for n, c in raw if n > hdr[0] + 1]
    i = 0
    while i < len(body):
        n, c = body[i]
        if isinstance(c.get(c_date), datetime):
            remark = None
            if i + 1 < len(body) and isinstance(body[i + 1][1].get(c_date), str):
                remark = clean_text(body[i + 1][1].get(c_date))
                i += 1
            if isinstance(c.get(c_bal), str):
                text_bal += 1
            bal = _amt(st, c.get(c_bal), (fid, sheet, n), "Saraswat balance")
            amount = _amt(st, c.get(c_amt), (fid, sheet, n), "Saraswat amount")
            if remark and remark.lower() == "opening balance":
                opening = bal
                if amount:
                    st.review("bad_amount", "Opening-balance line of a Saraswat export copy carries an amount",
                              {"file": fid, "sheet": sheet, "row": n, "amount": money(amount), "balance": money(bal),
                               "note": "The bank's own export (F133) has no amount on this line; the figure was ignored."},
                              severity="low")
                st.skip(f"{fid}: opening-balance line (not a transaction)")
            else:
                instr = c.get(c_instr)
                if isinstance(instr, float) and instr.is_integer():
                    instr = str(int(instr))
                amount = amount or ZERO
                items.append({"date": c[c_date].date(), "date_as_written": c[c_date].date().isoformat(),
                              "narration": remark, "reference": clean_text(instr),
                              "debit": -amount if amount < 0 else None, "credit": amount if amount > 0 else None,
                              "amount": abs(amount), "balance": bal, "src": (sheet, n)})
        i += 1
    items.reverse()
    if canonical:
        checks.append(statement_totals_check(st, fid, f"Saraswat export {fid}", items, opening,
                                             items[-1]["balance"] if items else None, None, "saraswat"))
        for r in items:
            led.add(fid, r)
    else:
        for r in items:
            if led.duplicate(fid, r["date"], r["amount"], r["balance"], sheet, r["src"][1]) is None:
                _unmatched(st, fid, r["src"], r["date"], r["amount"], r["balance"], "saraswat")
    return {"opening": opening, "rows": items, "text_balances": text_bal}


def load_saraswat_annotated(st, led, fid, sheet, checks):
    """F135 sheet 2 / F134 'Saraswat Bank Statement': the export re-sorted ascending with the
    trust's own REMARKS and HEADING.  Rows already in the ledger become enrichment sources;
    rows beyond the bank export are imported from this sheet."""
    raw = raw_rows(fid, sheet)
    hdr = next(((n, c) for n, c in raw if clean_text(c.get("B")) == "Date" and clean_text(c.get("C")) == "Remarks"), None)
    if not hdr:
        return None
    inv = {clean_text(v): k for k, v in hdr[1].items() if isinstance(v, str)}
    cI, cCr, cDr, cBal, cRem, cHead = (inv["Instrument ID"], inv["Credit"], inv["Debit"], inv["Balance"],
                                       inv.get("REMARKS"), inv.get("HEADING"))
    new_rows, blank = [], 0
    for n, c in raw:
        if n <= hdr[0]:
            continue
        if not isinstance(c.get("B"), datetime):
            blank += 1
            continue
        narr = clean_text(c.get("C"))
        bal = _amt(st, c.get(cBal), (fid, sheet, n), "Saraswat balance")
        cr = _amt(st, c.get(cCr), (fid, sheet, n), "Saraswat credit")
        dr = _amt(st, c.get(cDr), (fid, sheet, n), "Saraswat debit")
        if narr and narr.lower() == "opening balance":
            st.skip(f"{fid}: opening-balance line (not a transaction)")
            continue
        instr = c.get(cI)
        if isinstance(instr, float) and instr.is_integer():
            instr = str(int(instr))
        extra = {"remark_as_written": clean_text(c.get(cRem)) if cRem else None,
                 "heading_as_written": clean_text(c.get(cHead)) if cHead else None}
        amount = dr or cr or ZERO
        d = c["B"].date()
        claim = f"{fid}/{sheet}"
        hit = led.duplicate(fid, d, amount, bal, sheet, n, role="enrichment", extra=extra, claim=claim)
        if hit is None:
            led.stats[claim]["unmatched"] -= 1
            led.stats[claim]["read"] -= 1
            r = {"date": d, "date_as_written": d.isoformat(), "narration": narr, "reference": clean_text(instr),
                 "debit": dr, "credit": cr, "amount": amount, "balance": bal, "src": (sheet, n),
                 "from_paste_sheet": True, **extra}
            r = led.add(claim, r)
            r["file"] = fid
            r["sources"] = [src(fid, sheet, n)]
            new_rows.append(r)
    if blank:
        st.skip(f"{fid}: template rows without a date in the statement sheet", blank)
    return new_rows


def load_saraswat_variant_pdf(st, led, fid):
    for sheet, n, text in pdf_lines(fid):
        v = sar_variant_line(text)
        if v and re.match(r"^\d\d-\d\d-\d{4} ", text.strip()):
            if led.duplicate(fid, v[0], v[1], v[2], sheet, n) is None:
                _unmatched(st, fid, (sheet, n), v[0], v[1], v[2], "saraswat")


def load_saraswat_netbank_pdf(st, led, fid):
    rows = []
    for sheet, n, text in pdf_lines(fid):
        v = sar_netbank_line(text)
        if v:
            rows.append((sheet, n) + v)
    for sheet, n, d, amount, bal, _ in reversed(rows):
        if led.duplicate(fid, d, amount, bal, sheet, n) is None:
            _unmatched(st, fid, (sheet, n), d, amount, bal, "saraswat")


def load_saraswat_branch_duplicate(st, led, fid):
    p = parse_saraswat_branch(pdf_lines(fid))
    for r in p["rows"]:
        if led.duplicate(fid, r["date"], r["amount"], r["balance"], r["src"][0], r["src"][1]) is None:
            _unmatched(st, fid, r["src"], r["date"], r["amount"], r["balance"], "saraswat")
    return p


# ---- HDFC ----------------------------------------------------------------------------

def load_hdfc_sheet(st, led, fid, sheet, checks, offset, paste):
    """F073 (bank xls, offset 0) and the paste sheet in F136 (offset 1: a serial column and
    the trust's remarks were added)."""
    L = lambda k: chr(ord(k) + offset)
    raw = raw_rows(fid, sheet)
    rows, opening, summary, text_dates, started = [], None, None, 0, False
    for idx, (n, c) in enumerate(raw):
        if clean_text(c.get(L("A"))) == "Date" and clean_text(c.get(L("B"))) == "Narration":
            started = True
            continue
        if not started:
            continue
        a = c.get(L("A"))
        if clean_text(a) == "Opening Balance" and clean_text(c.get(L("E"))) == "Debits":
            nxt = raw[idx + 1][1] if idx + 1 < len(raw) else {}
            summary = tuple(parse_amount(nxt.get(L(k)))[0] for k in "AEFG")
            continue
        d = hdfc_text_date(a)
        if d is None:
            continue
        narr = clean_text(c.get(L("B")))
        bal = _amt(st, c.get(L("G")), (fid, sheet, n), "HDFC closing balance")
        if narr and narr.upper() == "OPENING BALANCE":
            opening = bal
            st.skip(f"{fid}: opening-balance line (not a transaction)")
            continue
        if isinstance(a, str):
            text_dates += 1
        dr = _amt(st, c.get(L("E")), (fid, sheet, n), "HDFC withdrawal")
        cr = _amt(st, c.get(L("F")), (fid, sheet, n), "HDFC deposit")
        r = {"date": d, "date_as_written": a if isinstance(a, str) else d.isoformat(),
             "value_date": hdfc_text_date(c.get(L("D"))), "narration": narr,
             "reference": clean_text(c.get(L("C"))), "debit": dr, "credit": cr, "amount": dr or cr or ZERO,
             "balance": bal, "src": (sheet, n)}
        if paste:
            r["remark_as_written"] = clean_text(c.get("J"))
            r["from_paste_sheet"] = True
        rows.append(r)
    if opening is None and summary:
        opening = summary[0]
    totals = (summary[1], summary[2]) if summary else None
    checks.append(statement_totals_check(st, fid, f"HDFC statement {fid}", rows, opening,
                                         summary[3] if summary else (rows[-1]["balance"] if rows else None),
                                         totals, "hdfc"))
    for r in rows:
        led.add(fid, r)
    return {"opening": opening, "rows": rows, "text_dates": text_dates, "summary": summary}


def load_hdfc_pdf(st, led, fid):
    pending = None
    for sheet, n, text in pdf_lines(fid):
        t = text.strip()
        v = hdfc_pdf_line(t)
        if v:
            txn, _, vd, amount, bal = v
            d = txn or pending or vd
            if led.duplicate(fid, d, amount, bal, sheet, n) is None:
                _unmatched(st, fid, (sheet, n), d, amount, bal, "hdfc")
            pending = None
        else:
            m = re.match(r"^(\d\d)/(\d\d)/(\d\d) ", t)
            if m:
                pending = date(2000 + int(m[3]), int(m[2]), int(m[1]))


# ---- SBI -----------------------------------------------------------------------------

def parse_sbi_branch(lines):
    """F071.  Returns {'opening', 'rows', 'summary'}; rows carry unsigned amounts."""
    rows, opening, cur, summary, closing = [], None, None, {}, None
    seq = [t.strip() for _, _, t in lines]
    for i, (sheet, n, text) in enumerate(lines):
        t = text.strip()
        m = re.match(r"^BROUGHT FORWARD ([\d,]+\.\d{2})", t)
        if m:
            opening = num(m[1])
            continue
        m = re.match(r"^CLOSING BALANCE ([\d,]+\.\d{2})\s*(CR|DR)", t)
        if m:
            closing = signed_balance(m[1], m[2])
            cur = None
            continue
        if t == "Total Debits Total Credits" and i + 1 < len(seq):
            m2 = re.fullmatch(r"([\d,]+\.\d{2}) ([\d,]+\.\d{2})", seq[i + 1])
            if m2:
                summary = {"debits": num(m2[1]), "credits": num(m2[2])}
        if re.match(r"^\d\d-\d\d-\d{4} \d\d-\d\d-\d{4} ", t):
            cur = {"text": t, "src": (sheet, n)}
        elif cur is not None:
            cur["text"] += " " + t
        else:
            continue
        v = sbi_branch_row(cur["text"])
        if v:
            rows.append({"date": v[0], "date_as_written": cur["text"][:10], "value_date": v[1], "narration": v[2],
                         "reference": None, "amount": v[3], "balance": v[4], "src": cur["src"]})
            cur = None
    return {"opening": opening, "rows": rows, "summary": summary, "closing": closing}


def load_sbi_sheet(st, led, fid, sheet, checks):
    raw = raw_rows(fid, sheet)
    rows, opening, started = [], None, False
    for n, c in raw:
        if clean_text(c.get("A")) == "Txn Date":
            started = True
            continue
        if not started or not isinstance(c.get("A"), datetime):
            continue
        narr = clean_text(c.get("C"))
        bal = _amt(st, c.get("H"), (fid, sheet, n), "SBI balance")
        if narr == "Opening Balance":
            opening = bal
            st.skip(f"{fid}: opening-balance line (not a transaction)")
            continue
        dr = _amt(st, clean_text(c.get("F")) if isinstance(c.get("F"), str) else c.get("F"), (fid, sheet, n), "SBI debit")
        cr = _amt(st, clean_text(c.get("G")) if isinstance(c.get("G"), str) else c.get("G"), (fid, sheet, n), "SBI credit")
        vd = c.get("B").date() if isinstance(c.get("B"), datetime) else None
        rows.append({"date": c["A"].date(), "date_as_written": c["A"].date().isoformat(), "value_date": vd,
                     "narration": narr, "reference": clean_text(c.get("D")), "debit": dr, "credit": cr,
                     "amount": dr or cr or ZERO, "balance": bal, "src": (sheet, n),
                     "remark_as_written": clean_text(c.get("I")), "voucher_no_as_written": clean_text(c.get("J")),
                     "from_paste_sheet": True})
    checks.append(statement_totals_check(st, fid, f"SBI statement sheet {fid}", rows, opening,
                                         rows[-1]["balance"] if rows else None, None, "sbi"))
    return {"opening": opening, "rows": rows}


# ---- GPay ----------------------------------------------------------------------------

def gpay_time(v):
    """'17-05-26 9:39' -> date (dd-mm-yy as exported by GPay for Business)."""
    if isinstance(v, datetime):
        return v.date()
    m = re.match(r"^\s*(\d{1,2})-(\d{1,2})-(\d{2})\b", str(v or ""))
    if not m:
        return None
    try:
        return date(2000 + int(m[3]), int(m[2]), int(m[1]))
    except ValueError:
        return None


def load_gpay(st):
    canon, other = "F166", "F072"
    stats = {canon: Counter(), other: Counter()}
    rows = []
    for n, c in raw_rows(canon, "(csv)"):
        if n == 1:
            continue
        stats[canon]["read"] += 1
        d = gpay_time(c.get("D"))
        net = _amt(st, c.get("H"), (canon, "(csv)", n), "GPay net amount")
        gross = _amt(st, c.get("F"), (canon, "(csv)", n), "GPay amount")
        fee = _amt(st, c.get("G"), (canon, "(csv)", n), "GPay processing fee") or ZERO
        if d is None or net is None:
            st.review("missing_date" if d is None else "missing_amount", "GPay row without a date or an amount",
                      {"file": canon, "row": n}, severity="medium")
            st.skip(f"{canon}: GPay row without date or amount")
            continue
        if gross is not None and gross - fee != net:
            st.review("bad_amount", "GPay amount less fee does not equal the net amount",
                      {"file": canon, "row": n, "amount": money(gross), "fee": money(fee), "net": money(net)})
        txid = clean_text(c.get("E"))
        parts = [clean_text(str(c.get(k)).replace("\xa0", " ")) if c.get(k) not in (None, "") else None for k in "ABCK"]
        rows.append({"n": n, "date": d, "value_date": gpay_time(c.get("J")), "txid": txid, "net": net,
                     "narration": " | ".join(p for p in parts if p), "status": clean_text(c.get("I")),
                     "created": clean_text(c.get("D"))})
    rows.sort(key=lambda r: -r["n"])          # the export is newest first
    by_id = {}
    seq = 0
    for r in rows:
        seq += 1
        key = f"bnk:txn:gpay:{r['txid'] or r['date'].isoformat() + ':' + str(seq)}"
        rec = {"bank_slug": "gpay", "txn_date": r["date"], "value_date": r["value_date"], "fy": fy_of(r["date"]),
               "narration": r["narration"], "reference": r["txid"],
               "debit": -r["net"] if r["net"] < 0 else None, "credit": r["net"] if r["net"] >= 0 else None,
               "seq_in_statement": seq, "date_as_written": r["created"], "status_as_written": r["status"]}
        st.emit("bank_transactions", key, rec, [src(canon, "(csv)", r["n"])])
        by_id[r["txid"]] = key
        stats[canon]["emitted"] += 1
        if r["status"] != "Settled":
            st.review("trustee_decision", "GPay transaction is not marked Settled",
                      {"file": canon, "row": r["n"], "status": r["status"]}, table="bank_transactions", key=key)
    for n, c in raw_rows(other, "(csv)"):
        if n == 1:
            continue
        stats[other]["read"] += 1
        txid = clean_text(c.get("E"))
        if txid in by_id:
            st.add_source("bank_transactions", by_id[txid], src(other, "(csv)", n, "duplicate"))
            stats[other]["duplicate"] += 1
        else:
            stats[other]["unmatched"] += 1
            st.review("conflicting_sources", "GPay export row missing from the longer export",
                      {"file": other, "row": n}, severity="high")
            st.skip(f"{other}: GPay row not found in the canonical export")
    dates = [r["date"] for r in rows]
    pos = sum((r["net"] for r in rows if r["net"] > 0), ZERO)
    neg = sum((r["net"] for r in rows if r["net"] < 0), ZERO)
    return {"stats": stats, "first": min(dates), "last": max(dates), "credits": pos, "debits": -neg, "rows": rows}


# ---- emitting an account -------------------------------------------------------------

def emit_ledger(st, led, opening, label):
    """Row-to-row checks on the merged ledger, then one bank_transactions record per row."""
    rows = led.rows
    fails = check_running_balance(rows, opening)
    for f in fails:
        r = rows[f["i"]]
        ev = {"account": led.slug, "file": r["file"], "sheet": r["src"][0], "row": r["src"][1],
              "date": r["date"].isoformat()}
        if f["kind"] == "balance":
            ev.update(expected_balance=money(f["expected"]), printed_balance=money(f["printed"]),
                      difference=money(f["difference"]))
            st.review("continuity_break", f"{label}: running balance does not follow from the previous row", ev,
                      severity="high", suggested_action="Check for a missing or altered row in the statement.")
        else:
            ev.update(previous_date=f["previous"].isoformat())
            st.review("continuity_break", f"{label}: transaction date is earlier than the previous row", ev,
                      severity="medium", suggested_action="Check the date (day/month may be swapped in the sheet).")
    per_day = Counter()
    for seq, r in enumerate(rows, 1):
        per_day[r["date"]] += 1
        key = f"bnk:txn:{led.slug}:{r['date'].isoformat()}:{per_day[r['date']]:03d}"
        rec = {"bank_slug": led.slug, "txn_date": r["date"], "value_date": r.get("value_date"), "fy": fy_of(r["date"]),
               "narration": r.get("narration"), "reference": r.get("reference"), "debit": r.get("debit"),
               "credit": r.get("credit"), "balance": r.get("balance"), "seq_in_statement": seq,
               "date_as_written": r.get("date_as_written"), "remark_as_written": r.get("remark_as_written"),
               "heading_as_written": r.get("heading_as_written"),
               "voucher_no_as_written": r.get("voucher_no_as_written")}
        st.emit("bank_transactions", key, rec, r["sources"])
        r["key"] = key
    return fails


def build_bank(st):
    """Returns a report dict; emits bank_transactions for the four ledgers."""
    rep = {"checks": [], "accounts": {}, "stats": {}}
    checks = rep["checks"]

    # ---------------- Saraswat ----------------
    sar = Ledger(st, "saraswat")
    first = load_saraswat_pdf(st, sar, "F018", checks)
    load_saraswat_pdf(st, sar, "F023", checks)
    load_saraswat_pdf(st, sar, "F059", checks)
    load_saraswat_xlsx(st, sar, "F075", checks)
    x133 = load_saraswat_netbank_xls(st, sar, "F133", raw_sheets("F133")[0], checks, canonical=True)
    load_saraswat_annotated(st, sar, "F134", "Saraswat Bank Statement", checks)
    x135 = load_saraswat_netbank_xls(st, sar, "F135", "Saraswat AC", checks, canonical=False)
    load_saraswat_annotated(st, sar, "F135", "Saraswat AC (2)", checks)
    for fid in ("F069", "F078", "F065"):
        load_saraswat_branch_duplicate(st, sar, fid)
    load_saraswat_xlsx(st, sar, "F066", checks, canonical=False)
    load_saraswat_variant_pdf(st, sar, "F067")
    for fid in ("F057", "F062"):
        load_saraswat_netbank_pdf(st, sar, fid)
    n063 = sum(len(raw_rows("F063", s)) for s in raw_sheets("F063"))
    st.skip("F063: fragmented Excel conversion of statement F062, superseded by F075 (rows not parsed)", n063)
    rep["F063_rows"] = n063
    fails = emit_ledger(st, sar, first["opening"], "Saraswat account")
    rep["accounts"]["saraswat"] = account_summary(sar, first["opening"], fails)
    rep["text_balances"] = {"F133": x133["text_balances"] if x133 else None,
                            "F135": x135["text_balances"] if x135 else None}
    # balance confirmation F058 (no rows): compare with the ledger
    for sheet, n, text in pdf_lines("F058"):
        m = re.fullmatch(rf"({AMT}) (CR|DR)", text.strip())
        if m:
            conf = signed_balance(m[1], m[2])
            day = [r for r in sar.rows if r["date"] <= date(2025, 2, 13)]
            rep["F058"] = {"confirmed": conf, "ledger": day[-1]["balance"] if day else None}
            if day and day[-1]["balance"] != conf:
                st.review("conflicting_sources", "Saraswat balance confirmation differs from the statement",
                          {"file": "F058", "sheet": sheet, "row": n, "confirmed": money(conf),
                           "statement_balance": money(day[-1]["balance"]), "as_of": "2025-02-13"}, severity="high")
            break
    st.skip("F058: balance confirmation without transaction rows")

    # ---------------- HDFC ----------------
    hd = Ledger(st, "hdfc")
    h1 = load_hdfc_sheet(st, hd, "F073", "Sheet 1", checks, 0, paste=False)
    h2 = load_hdfc_sheet(st, hd, "F136", "HDFC Bank Statement", checks, 1, paste=True)
    for fid in ("F070", "F108", "F128", "F096"):
        load_hdfc_pdf(st, hd, fid)
    fails = emit_ledger(st, hd, h1["opening"], "HDFC account")
    rep["accounts"]["hdfc"] = account_summary(hd, h1["opening"], fails)
    rep["hdfc_text_dates"] = {"F073": h1["text_dates"], "F136": h2["text_dates"]}
    if h2["opening"] is not None and h1["rows"] and h2["opening"] != h1["rows"][-1]["balance"]:
        st.review("continuity_break", "HDFC opening balance of 2026-27 differs from the 2025-26 closing balance",
                  {"F073_closing": money(h1["rows"][-1]["balance"]), "F136_opening": money(h2["opening"])}, severity="high")

    # ---------------- SBI ----------------
    sb = Ledger(st, "sbi")
    p71 = parse_sbi_branch(pdf_lines("F071"))
    bad = assign_sides(p71["rows"], p71["opening"])
    for i in bad:
        r = p71["rows"][i]
        st.review("continuity_break", "SBI statement row does not explain the balance movement",
                  {"file": "F071", "sheet": r["src"][0], "row": r["src"][1], "amount": money(r["amount"]),
                   "balance": money(r["balance"])}, severity="high")
    summ = p71["summary"]
    checks.append(statement_totals_check(st, "F071", "SBI statement F071", p71["rows"], p71["opening"], p71["closing"],
                                         (summ["debits"], summ["credits"]) if summ else None, "sbi"))
    s154 = load_sbi_sheet(st, sb, "F154", "Bank Statement", checks)
    cut = date(2026, 3, 31)
    for r in p71["rows"]:
        if r["date"] <= cut:
            sb.add("F071", r)
    for r in s154["rows"]:
        sb.add("F154", r)
    for r in p71["rows"]:
        if r["date"] > cut:
            if sb.duplicate("F071", r["date"], r["amount"], r["balance"], r["src"][0], r["src"][1], claim="F071/dup") is None:
                _unmatched(st, "F071", r["src"], r["date"], r["amount"], r["balance"], "sbi")
    # F153 web print: locate each row's first line for provenance
    lines153 = pdf_lines("F153")
    web = sbi_web_rows("\n".join(t for _, _, t in lines153))
    anchors = [(s, n) for s, n, t in lines153 if re.fullmatch(r"\d\d-", t.strip())]
    anchors = anchors[0::2] if len(anchors) == 2 * len(web) else [(lines153[0][0], lines153[0][1])] * len(web)
    for (d, amount, bal), (s, n) in zip(web, anchors):
        if sb.duplicate("F153", d, amount, bal, s, n) is None:
            _unmatched(st, "F153", (s, n), d, amount, bal, "sbi")
    rep["F153_rows"] = len(web)
    if s154["opening"] is not None:
        march = [r for r in p71["rows"] if r["date"] <= cut]
        if march and march[-1]["balance"] != s154["opening"]:
            st.review("continuity_break", "SBI opening balance on 1 April 2026 differs from the March closing balance",
                      {"F071_31_March": money(march[-1]["balance"]), "F154_opening": money(s154["opening"])}, severity="high")
    fails = emit_ledger(st, sb, p71["opening"], "SBI account")
    rep["accounts"]["sbi"] = account_summary(sb, p71["opening"], fails)

    # ---------------- GPay ----------------
    g = load_gpay(st)
    rep["gpay"] = g
    rep["ledgers"] = {"saraswat": sar, "hdfc": hd, "sbi": sb}
    for led in (sar, hd, sb):
        rep["stats"].update({k: dict(v) for k, v in led.stats.items()})
    rep["stats"].update({k: dict(v) for k, v in g["stats"].items()})
    return rep


def account_summary(led, opening, fails):
    rows = led.rows
    per_fy = defaultdict(lambda: {"debits": ZERO, "credits": ZERO, "rows": 0})
    for r in rows:
        f = per_fy[fy_of(r["date"])]
        f["debits"] += r.get("debit") or ZERO
        f["credits"] += r.get("credit") or ZERO
        f["rows"] += 1
    return {"rows": len(rows), "first": rows[0]["date"], "last": rows[-1]["date"], "opening": opening,
            "closing": rows[-1]["balance"], "per_fy": dict(per_fy),
            "balance_failures": sum(1 for f in fails if f["kind"] == "balance"),
            "date_failures": sum(1 for f in fails if f["kind"] == "date")}


# =====================================================================================
# 2. Fixed deposits
# =====================================================================================

BANKS = {"saraswat": ("Saraswat Co-operative Bank", "F C Road, Pune"),
         "hdfc": ("HDFC Bank", "Hingne Khurd, Pune"),
         "sbi": ("State Bank of India", "Paud Road, Pune"),
         "svc": ("SVC Co-operative Bank", None),
         "pnbhfl": ("PNB Housing Finance Ltd", None)}
# Trust registers of deposits, oldest first (a later register overrides an earlier one).
REGISTERS = [("F016", "FDs"), ("F026", "FDs"), ("F033", "FD & MF"), ("F080", "FD & MF"), ("F134", "FD & MF")]
QI_SHEETS = [("F026", "Quarterly_Interest", "2023-24"), ("F033", "Quarterly_Interest", "2024-25"),
             ("F080", "Quarterly_Interest", "2025-26"), ("F134", "Quarterly_Interest", "2026-27")]
RANK = {"advice": 0, "statement": 1, "bankdoc": 2, "register": 3, "accounts": 4, "derived": 5}
# What the phase-0 analysis read off the photographed SBI advice F164 (a JPEG: no text,
# so no raw rows).  Used for the one deposit that has no other bank paper.
JPEG_ADVICE = {"file": "F164", "bank": "sbi", "suffix": "9721", "principal": D("3500000"),
               "rate_pct": D("4.900"), "start_date": date(2026, 5, 14), "maturity_date": date(2026, 6, 29),
               "maturity_amount": D("3521614")}
# One cheque / transfer that funded several deposits (the bank row names no deposit).
GROUP_FUNDINGS = [("saraswat", date(2022, 10, 27), D("75000")), ("saraswat", date(2023, 2, 20), D("250000")),
                  ("saraswat", date(2023, 8, 22), D("210000")), ("svc", date(2023, 3, 2), D("110000"))]


def fd_norm(v):
    """Comparable form of a deposit number as written ('TD1002060293', ' TD : 450...',
    '00000045319956381', Excel floats): upper-case letters and digits, without the
    'TD' prefix and leading zeros."""
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    s = re.sub(r"[^A-Z0-9]", "", str(v).upper())
    s = re.sub(r"^TD", "", s).lstrip("0")
    return s or None


def register_bank(name):
    low = (name or "").lower()
    for needle, slug in (("saraswat", "saraswat"), ("svc", "svc"), ("hdfc", "hdfc"), ("pnb", "pnbhfl"),
                         ("punjab", "pnbhfl"), ("state bank", "sbi")):
        if needle in low:
            return slug
    return None


def pct(v):
    """Register rates are fractions (0.0525) -> Decimal percent with 3 places."""
    if v is None or isinstance(v, str):
        return None
    x = D(str(v))
    if x < 1:
        x *= 100
    return x.quantize(D("0.001"))


class FD:
    def __init__(self, bank, norm):
        self.bank, self.norm = bank, norm
        self.claims = defaultdict(list)     # field -> [(value, cls, order, source, label)]
        self.sources = []                   # (rank, source)
        self.events = []
        self.funding = None                 # ledger row
        self.close_rows = []                # ledger rows credited at closure
        self.closed_on = None
        self.proceeds = None
        self.earmarks = []                  # (file, text)
        self.reg_names = set()
        self.notes = []
        self.review = False
        self.written = None
        self.payout = False
        self.status = None
        self.renewed_from = None
        self.val = {}
        self._order = 0

    def claim(self, field, value, cls, source, label=None):
        if value is None:
            return
        self._order += 1
        self.claims[field].append((value, cls, self._order, source, label))

    def add_source(self, rank, source):
        if not any(s["file"] == source["file"] and s["sheet"] == source["sheet"] and s["row"] == source["row"]
                   for _, s in self.sources):
            self.sources.append((rank, source))

    @property
    def key(self):
        return f"bnk:fd:{self.bank}:{self.norm}"

    @property
    def number(self):
        if self.bank == "saraswat":
            return "TD" + self.norm
        return self.written or self.norm

    def label(self):
        return f"{BANKS[self.bank][0]} deposit {mask(self.norm)}"


class FDBook:
    def __init__(self, st):
        self.st = st
        self.fds = {}
        self.svc_payout_rows = []
        self.unnumbered = []                # SBI cheque fundings without a deposit number
        self.counts = Counter()

    def get(self, bank, number):
        n = fd_norm(number)
        if not n:
            return None
        k = (bank, n)
        if k not in self.fds:
            self.fds[k] = FD(bank, n)
        return self.fds[k]

    def find(self, number):
        n = fd_norm(number)
        hits = [fd for (b, k), fd in self.fds.items() if k == n]
        return hits[0] if len(hits) == 1 else None


def row_src(r, role="primary"):
    s = r["sources"][0]
    return src(s["file"], s["sheet"], s["row"], role)


def scan_statements(st, book, ledgers):
    """Deposit events that the banks themselves printed in the account statements."""
    ev = lambda fd, **k: fd.events.append(k)
    # ---- Saraswat ----
    for r in ledgers["saraswat"].rows:
        narr = r.get("narration") or ""
        m = re.search(r"funding A/c\s*TD\s*(\d+)", narr)
        if m and r.get("debit"):
            fd = book.get("saraswat", m[1])
            fd.funding = r
            fd.claim("principal", r["debit"], "statement", row_src(r))
            fd.claim("start_date", r["date"], "statement", row_src(r))
            fd.add_source(0, row_src(r))
            continue
        m = re.match(r"TD\s*(\d+)\s*:\s*Closure\s*Proceeds", narr)
        if m and r.get("credit"):
            fd = book.get("saraswat", m[1])
            fd.close_rows.append(r)
            fd.add_source(1, row_src(r, "enrichment"))
            continue
        m = re.match(r"TD\s*(\d+)\s*IO:\s*Int:\s*([\d.]+)\s*and\s*TAX:\s*([\d.]+)", narr)
        if m and r.get("credit") is not None:
            fd = book.get("saraswat", m[1])
            gross, tax = D(m[2]), D(m[3].rstrip("."))
            fd.payout = True
            if gross - tax != r["credit"]:
                st.review("bad_amount", "Interest less tax in the narration differs from the amount credited",
                          {"file": r["file"], "sheet": r["src"][0], "row": r["src"][1], "interest": money(gross),
                           "tax": money(tax), "credited": money(r["credit"])}, severity="medium")
            ev(fd, kind="interest", date=r["date"], amount=gross, credited=r["credit"], tax=tax, label=narr,
               sources=[row_src(r)], quarterly=True)
            if tax > 0:
                ev(fd, kind="tds", date=r["date"], amount=tax, label=narr, sources=[row_src(r)], bank_tax=True)
            continue
        if re.match(r"ACH Credit\s*:?\s*\S*2554\b", narr) and r.get("credit"):
            book.svc_payout_rows.append(r)
    # ---- HDFC ----
    for r in ledgers["hdfc"].rows:
        narr = r.get("narration") or ""
        m = re.search(r"FD (?:BOOKED -|THROUGH NET-)\s*(\d+)", narr)
        if m and r.get("debit"):
            fd = book.get("hdfc", m[1])
            fd.funding = r
            fd.claim("principal", r["debit"], "statement", row_src(r))
            fd.claim("start_date", r["date"], "statement", row_src(r))
            fd.add_source(0, row_src(r))
            continue
        m = re.search(r"INTEREST CREDIT\s*(\d+)", narr)
        if m and r.get("credit"):
            fd = book.get("hdfc", m[1])
            ev(fd, kind="interest", date=r["date"], amount=r["credit"], credited=r["credit"], label=narr,
               sources=[row_src(r)], explicit=True)
            fd.close_rows.append(r)
            continue
        m = re.search(r"PRIN AND INT AUTO_REDEEM\s*(\d+)", narr)
        if m and r.get("credit"):
            fd = book.get("hdfc", m[1])
            fd.close_rows.append(r)
            fd.add_source(1, row_src(r, "enrichment"))
    # ---- SBI ----
    for r in ledgers["sbi"].rows:
        narr, ref = r.get("narration") or "", r.get("reference") or ""
        if "e-TDR" in narr and r.get("debit"):
            m = re.search(r"TRANSFER TO\s*(\d{8,})", ref)
            if m:
                fd = book.get("sbi", m[1])
                fd.funding = r
                fd.claim("principal", r["debit"], "statement", row_src(r))
                fd.claim("start_date", r["date"], "statement", row_src(r))
                fd.add_source(0, row_src(r))
            else:
                book.unnumbered.append(r)
        elif re.search(r"CHEQUE TRANSFER TO|CHQ XFER WD", narr) and r.get("debit"):
            m = re.search(r"TRANSFER FROM\s*(\d{8,})", ref)
            if m:
                fd = book.get("sbi", m[1])
                fd.funding = r
                fd.claim("principal", r["debit"], "statement", row_src(r))
                fd.claim("start_date", r["date"], "statement", row_src(r), "date of the cheque transfer")
                fd.add_source(0, row_src(r))
            else:
                book.unnumbered.append(r)
        elif "REVERSAL" in narr.upper() and r.get("credit"):
            m = re.search(r"TRANSFER FROM\s*(\d{8,})", ref)
            cands = [fd for fd in book.fds.values() if fd.bank == "sbi" and fd.funding is not None
                     and fd.funding["date"] == r["date"] and fd.funding["debit"] == r["credit"]]
            if m:
                named = [fd for fd in cands if fd.norm == fd_norm(m[1])]
                cands = named or cands
            if cands:
                dead = cands[-1]
                st.review("duplicate_transaction", "SBI deposit funding was reversed the same day",
                          {"account": "sbi", "date": r["date"].isoformat(), "amount": money(r["credit"]),
                           "deposit": mask(dead.norm), "funding_row": dead.funding["src"][1], "reversal_row": r["src"][1],
                           "file": r["file"]}, severity="low",
                          suggested_action="No deposit was created by the reversed entry; the pair inflates raw debit and credit totals by the same amount.")
                st.skip("SBI: deposit funding reversed the same day (no deposit imported for it)")
                del book.fds[(dead.bank, dead.norm)]
        elif narr.startswith("BY TRANSFER") and r.get("credit"):
            m = re.search(r"TRANSFER FROM\s*(\d{8,})", ref)
            if m and ("sbi", fd_norm(m[1])) in book.fds:
                fd = book.fds[("sbi", fd_norm(m[1]))]
                fd.close_rows.append(r)
                fd.add_source(1, row_src(r, "enrichment"))
            elif m:
                book.unnumbered.append(r)
        elif "INT TRF FRM" in narr and r.get("credit"):
            m = re.search(r"INT TRF FRM\s*(\d{8,})", narr)
            fd = book.get("sbi", m[1]) if m else None
            if fd:
                ev(fd, kind="interest", date=r["date"], amount=r["credit"], credited=r["credit"], label=narr,
                   sources=[row_src(r)], explicit=True)
                fd.close_rows.append(r)
        elif "TAX DEDUCTED FOR" in narr and r.get("debit"):
            m = re.search(r"TAX DEDUCTED FOR\s*(\d{8,})", narr)
            fd = book.get("sbi", m[1]) if m else None
            if fd:
                ev(fd, kind="tds", date=r["date"], amount=r["debit"], label=narr, sources=[row_src(r)], bank_tax=True,
                   overhead="OVERHEAD" in narr.upper() or "PREVIOUS INT" in narr.upper())


def load_bank_documents(st, book, stats):
    """Saraswat term-deposit summaries, HDFC advices, SBI e-TDR receipts."""
    summaries = {}
    # Saraswat summaries (xls): two rows per deposit
    for fid, as_of in (("F127", date(2025, 4, 1)), ("F076", date(2026, 4, 1))):
        rows = raw_rows(fid, raw_sheets(fid)[0])
        listed = []
        for i, (n, c) in enumerate(rows):
            num_ = clean_text(c.get("C"))
            if not num_ or not re.fullmatch(r"TD\d+", num_):
                continue
            stats[fid]["read"] += 1
            mat = parse_amount(str(c.get("S") or "").replace("INR", ""))[0]
            dep = None
            if i + 1 < len(rows) and clean_text(rows[i + 1][1].get("O")) == "Deposit:":
                dep = parse_amount(str(rows[i + 1][1].get("S") or "").replace("INR", ""))[0]
            fd = book.get("saraswat", num_)
            s = src(fid, raw_sheets(fid)[0], n, "enrichment")
            fd.claim("principal", dep, "bankdoc", s)
            fd.claim("maturity_amount", mat, "bankdoc", s, f"bank summary of {as_of.isoformat()}")
            fd.add_source(2, s)
            listed.append(fd)
            stats[fid]["duplicate"] += 1
        summaries[fid] = (as_of, listed)
    # the same summary as PDF (F126)
    lines = pdf_lines("F126")
    for i, (sheet, n, t) in enumerate(lines):
        m = re.match(r"^(TD\d+) Term Deposit \w+ INR\s+([\d,]+\.\d{2})Maturity:", t.strip())
        if not m:
            continue
        stats["F126"]["read"] += 1
        fd = book.get("saraswat", m[1])
        s = src("F126", sheet, n, "duplicate")
        fd.claim("maturity_amount", num(m[2]), "bankdoc", s, "bank summary of 2025-04-01 (PDF)")
        if i + 1 < len(lines):
            m2 = re.search(r"INR\s+([\d,]+\.\d{2})Deposit:", lines[i + 1][2])
            if m2:
                fd.claim("principal", num(m2[1]), "bankdoc", s)
        fd.add_source(3, s)
        stats["F126"]["duplicate"] += 1
    # HDFC advices: the deposit number is not in the text; match on principal + start date
    for fid in ("F122", "F123", "F124", "F125"):
        hit = None
        for sheet, n, t in pdf_lines(fid):
            m = re.match(r"^([\d.]+) (\d{1,2} \w{3} \d{4}) (.*?) ([\d.]+) (\d{1,2} \w{3} \d{4}) ([\d.]+)$", t.strip())
            if m:
                hit = (sheet, n, D(m[1]), parse_date(m[2])[0], m[3], D(m[4]), parse_date(m[5])[0], D(m[6]))
                break
        stats[fid]["read"] += 1
        if not hit:
            st.review("missing_document", "HDFC deposit advice could not be read", {"file": fid}, severity="medium")
            st.skip(f"{fid}: advice text not recognised")
            continue
        sheet, n, principal, start, term, rate, mat, matamt = hit
        cands = [fd for fd in book.fds.values() if fd.bank == "hdfc" and fd.funding is not None
                 and fd.funding["debit"] == principal and fd.funding["date"] == start]
        if len(cands) != 1:
            st.review("conflicting_sources", "HDFC deposit advice matches no single deposit in the statement",
                      {"file": fid, "sheet": sheet, "row": n, "principal": money(principal),
                       "start": start.isoformat() if start else None, "candidates": len(cands)}, severity="medium")
            st.skip(f"{fid}: advice not matched to a deposit")
            continue
        fd = cands[0]
        s = src(fid, sheet, n, "enrichment")
        fd.claim("principal", principal, "bankdoc", s)
        fd.claim("start_date", start, "bankdoc", s)
        fd.claim("rate_pct", rate.quantize(D("0.001")), "bankdoc", s)
        fd.claim("maturity_date", mat, "bankdoc", s)
        fd.claim("maturity_amount", matamt, "bankdoc", s)
        fd.notes.append(f"HDFC advice {fid}: period of deposit '{term}'.")
        fd.add_source(2, s)
        stats[fid]["duplicate"] += 1
    # SBI e-TDR receipts
    for fid in ("F156", "F157", "F158"):
        lines = pdf_lines(fid)
        stats[fid]["read"] += 1
        hit = None
        for sheet, n, t in lines:
            m = re.match(r"^([\d.]+) (\d+) (\d\d/\d\d/\d{4}) (\d\d/\d\d/\d{4}) (\d+)$", t.strip())
            if m:
                hit = (sheet, n, m)
        numline = next(((s_, n_, t_) for s_, n_, t_ in lines if re.fullmatch(r"0*\d{9,}", t_.strip())), None)
        if not hit or not numline:
            st.review("missing_document", "SBI e-TDR receipt could not be read", {"file": fid}, severity="medium")
            st.skip(f"{fid}: receipt text not recognised")
            continue
        sheet, n, m = hit
        fd = book.get("sbi", numline[2].strip())
        s = src(fid, sheet, n, "enrichment")
        dmy = lambda x: date(int(x[6:]), int(x[3:5]), int(x[:2]))
        fd.claim("rate_pct", D(m[1]).quantize(D("0.001")), "bankdoc", s)
        fd.claim("principal", D(m[2]), "bankdoc", s)
        fd.claim("start_date", dmy(m[3]), "bankdoc", s)
        fd.claim("maturity_date", dmy(m[4]), "bankdoc", s)
        fd.claim("maturity_amount", D(m[5]), "bankdoc", s)
        fd.add_source(2, s)
        stats[fid]["duplicate"] += 1
    return summaries


def load_registers(st, book, stats):
    """The trust's own deposit registers ('FDs' / 'FD & MF' sheets) and the PDF print F196."""
    reg_extra = {}
    for order, (fid, sheet) in enumerate(REGISTERS):
        bank_name, sbi_cols = None, False
        for n, c in raw_rows(fid, sheet):
            if isinstance(c.get("A"), str) and "Mutual Funds" in c["A"]:
                break
            if clean_text(c.get("K")) == "Interest" and clean_text(c.get("L")) == "TDS":
                sbi_cols = True
                continue
            if isinstance(c.get("B"), str) and register_bank(c["B"]):
                bank_name = clean_text(c["B"])
            j = c.get("J")
            if not isinstance(c.get("C"), datetime) or j in (None, "", 0, 0.0) or c.get("D") in (None, ""):
                if any(k not in ("_f", "A") for k in c) and n > 3:
                    st.skip(f"{fid}/{sheet}: register sub-total or blank row")
                continue
            stats[f"{fid}/{sheet}"]["read"] += 1
            bank = register_bank(bank_name)
            if not bank:
                st.review("conflicting_sources", "Deposit register row without a recognisable bank",
                          {"file": fid, "sheet": sheet, "row": n}, severity="medium")
                st.skip(f"{fid}/{sheet}: register row without a bank")
                continue
            # the same deposit may be written with a different number in another register
            s = src(fid, sheet, n, "duplicate")
            fd = None
            if (bank, fd_norm(j)) not in book.fds and isinstance(c.get("G"), datetime):
                same = [f for f in book.fds.values() if f.bank == bank and f.funding is None and not f.close_rows
                        and any(v == c["C"].date() for v, *_ in f.claims["start_date"])
                        and any(v == parse_amount(c.get("D"))[0] for v, *_ in f.claims["principal"])
                        and any(v == c["G"].date() for v, *_ in f.claims["maturity_date"])
                        and any(v == parse_amount(c.get("I"))[0] for v, *_ in f.claims["maturity_amount"])]
                if len(same) == 1 and bank in ("svc", "pnbhfl"):
                    fd = same[0]
                    new_no = clean_text(str(int(j)) if isinstance(j, float) else j)
                    fd.review = True
                    fd.notes.append(f"Registers give two different numbers for this deposit: '{fd.written}' and "
                                    f"'{new_no}' ({fid}, kept as the later register). No bank paper settles it.")
                    st.review("conflicting_sources", "Deposit number differs between two registers",
                              {"bank": bank, "file": fid, "sheet": sheet, "row": n,
                               "values": [{"source": "earlier register", "value": mask(fd.written)},
                                          {"source": f"register {fid}", "value": mask(new_no)}],
                               "same_start_principal_maturity": True}, severity="medium",
                              table="fixed_deposits", key=fd.key,
                              suggested_action="Read the number off the deposit receipt.")
                    fd.written = new_no
            if fd is None:
                fd = book.get(bank, j)
            fd.written = fd.written or clean_text(str(int(j)) if isinstance(j, float) else j)
            fd.written = fd.written.replace("TD : ", "") if fd.written else fd.written
            fd.reg_names.add(bank_name)
            fd.claim("principal", _amt(st, c.get("D"), (fid, sheet, n), "Deposit amount"), "register", s)
            fd.claim("start_date", c["C"].date(), "register", s)
            fd.claim("rate_pct", pct(c.get("E")), "register", s)
            if isinstance(c.get("G"), datetime):
                fd.claim("maturity_date", c["G"].date(), "register", s)
            if c.get("I") not in (None, ""):
                fd.claim("maturity_amount", _amt(st, c.get("I"), (fid, sheet, n), "Maturity amount"), "register", s)
            q = c.get("H")
            if isinstance(q, (int, float)) and q:
                fd.payout = True
                fd.claim("quarterly_interest", parse_amount(q)[0], "register", s)
            if sbi_cols:
                reg_extra[(fd.bank, fd.norm)] = {"interest": parse_amount(c.get("K"))[0], "tds": parse_amount(c.get("L"))[0],
                                                 "src": s}
            else:
                for col in ("K", "L"):
                    t = clean_text(c.get(col)) if isinstance(c.get(col), str) else None
                    if t and t.lower() != "matured":
                        fd.earmarks.append((fid, t))
                    elif t:
                        fd.notes.append(f"Register {fid} marks the deposit 'Matured'.")
            fd.add_source(4 + order, s)
            stats[f"{fid}/{sheet}"]["duplicate"] += 1
    # F196: one-page PDF print of the register
    for sheet, n, t in pdf_lines("F196"):
        m = re.match(r"^\d+ (.+?) (\d{1,2}-\w{3}-\d{2}) ([\d,]+\.\d{2})\s+([\d.]+)% (\d{1,2}-\w{3}-\d{2}) NA ([\d,]+\.\d{2})\s+(?:TD : )?(\d+)$",
                     t.strip())
        if not m:
            continue
        stats["F196"]["read"] += 1
        bank = register_bank(m[1])
        fd = book.get(bank, m[7])
        s = src("F196", sheet, n, "duplicate")
        fd.claim("principal", num(m[3]), "register", s)
        fd.claim("start_date", parse_date(m[2])[0], "register", s)
        fd.claim("rate_pct", D(m[4]).quantize(D("0.001")), "register", s)
        fd.claim("maturity_date", parse_date(m[5])[0], "register", s)
        fd.claim("maturity_amount", num(m[6]), "register", s)
        fd.add_source(9, s)
        stats["F196"]["duplicate"] += 1
    return reg_extra


def load_accounts_fd(st, book, stats):
    """Deposit ledgers in the FY 2022-23 Tally accounts (F017 page 5)."""
    for sheet, n, t in pdf_lines("F017"):
        if sheet != "page 5":
            continue
        m = re.match(r"^(PNB - |FD - )?(TD\d+|\d{10,}|A\d{6,}) (.*)$", t.strip())
        if not m:
            continue
        stats["F017"]["read"] += 1
        amounts = re.findall(r"[\d,]+\.\d{2}", m[3])
        if not amounts:
            continue
        principal = num(amounts[-1]) if t.strip().endswith("Dr") else num(amounts[0])
        under_pnb = (m[1] or "").startswith("PNB")
        bank = "saraswat" if m[2].startswith("TD") else ("pnbhfl" if under_pnb else "svc")
        fd = book.get(bank, m[2])
        s = src("F017", sheet, n, "enrichment")
        fd.claim("principal", principal, "accounts", s, "FY 2022-23 Tally accounts")
        fd.add_source(10, s)
        fd.written = fd.written or m[2]
        if under_pnb and bank == "saraswat":
            fd.notes.append("The FY 2022-23 Tally accounts list this deposit under 'FD With PNB Housing'; "
                            "the bank credited it as a Saraswat term deposit.")
            fd.review = True
            st.review("conflicting_sources", "Deposit filed under another institution in the 2022-23 accounts",
                      {"file": "F017", "sheet": sheet, "row": n, "deposit": mask(fd.norm),
                       "accounts_say": "PNB Housing", "bank_statement_says": "Saraswat term deposit (closure proceeds credited)"},
                      severity="low", table="fixed_deposits", key=fd.key)
        stats["F017"]["duplicate"] += 1


def qi_rows(st, fid, sheet, stats):
    """Rows of a Quarterly_Interest sheet: {'section', 'row', 'date', 'number', 'amount', 'expected', 'tds'}."""
    out, section, totals = [], None, []
    for n, c in raw_rows(fid, sheet):
        b = clean_text(c.get("B")) if isinstance(c.get("B"), str) else None
        if b:
            low = b.lower()
            if low.startswith("total"):
                totals.append((n, b, parse_amount(c.get("E"))[0], section))
                continue
            if "other interest" in low:
                section = "other"
                continue
            if low.startswith("q") and "interest" in low:
                section = "quarterly"
                continue
            if low in ("sr no",) or "creditted in trust" in low:
                continue
        if section is None or not isinstance(c.get("C"), datetime) or not c.get("D"):
            if section and isinstance(c.get("B"), (int, float)):
                st.skip(f"{fid}/{sheet}: numbered template row without a deposit")
            continue
        amount = parse_amount(c.get("E"))[0]
        if amount is None:
            st.skip(f"{fid}/{sheet}: interest row not yet filled in (no amount)")
            continue
        stats[f"{fid}/{sheet}"]["read"] += 1
        out.append({"file": fid, "sheet": sheet, "row": n, "section": section, "date": c["C"].date(),
                    "number": clean_text(c["D"]), "amount": amount,
                    "expected": parse_amount(c.get("F"))[0] if section == "other" else None,
                    "tds": parse_amount(c.get("K"))[0]})
    return out, totals


def build_fds(st, bankrep):
    book = FDBook(st)
    stats = defaultdict(Counter)
    ledgers = bankrep["ledgers"]
    scan_statements(st, book, ledgers)
    summaries = load_bank_documents(st, book, stats)
    reg_extra = load_registers(st, book, stats)
    load_accounts_fd(st, book, stats)
    fds = book.fds

    # SVC quarterly payout rows belong to the SVC deposit that pays interest out
    svc_payout = [fd for fd in fds.values() if fd.bank == "svc" and fd.payout]
    if len(svc_payout) == 1:
        fd = svc_payout[0]
        for r in book.svc_payout_rows:
            fd.events.append({"kind": "interest", "date": r["date"], "amount": r["credit"], "credited": r["credit"],
                              "label": r["narration"], "sources": [row_src(r)], "quarterly": True})
            fd.add_source(1, row_src(r, "enrichment"))
    elif book.svc_payout_rows:
        st.review("conflicting_sources", "SVC interest credits could not be tied to one deposit",
                  {"rows": len(book.svc_payout_rows), "candidates": len(svc_payout)}, severity="medium")

    # SBI cheque fundings without a deposit number: match on date + amount
    for r in list(book.unnumbered):
        if not r.get("debit"):
            continue
        cands = [fd for fd in fds.values() if fd.bank == "sbi" and fd.funding is None
                 and any(v == r["debit"] for v, *_ in fd.claims["principal"])
                 and any(v == r["date"] for v, *_ in fd.claims["start_date"])]
        if len(cands) == 1:
            fd = cands[0]
            fd.funding = r
            fd.claim("principal", r["debit"], "statement", row_src(r))
            fd.claim("start_date", r["date"], "statement", row_src(r), "date of the cheque transfer")
            fd.add_source(0, row_src(r))
            fd.notes.append("Funding row in the SBI statement names no deposit number; matched on date and amount.")
            book.unnumbered.remove(r)
    for r in list(book.unnumbered):
        m = re.search(r"TRANSFER FROM\s*(\d{8,})", r.get("reference") or "")
        fd = fds.get(("sbi", fd_norm(m[1]))) if m and r.get("credit") else None
        if fd is not None:
            fd.close_rows.append(r)
            fd.add_source(1, row_src(r, "enrichment"))
            book.unnumbered.remove(r)
    for r in book.unnumbered:
        st.review("conflicting_sources", "SBI term-deposit movement could not be tied to a deposit",
                  {"file": r["file"], "sheet": r["src"][0], "row": r["src"][1], "date": r["date"].isoformat(),
                   "amount": money(r.get("debit") or r.get("credit"))}, severity="medium")

    # the photographed advice (F164)
    jp = [fd for fd in fds.values() if fd.bank == JPEG_ADVICE["bank"] and fd.norm.endswith(JPEG_ADVICE["suffix"])]
    if len(jp) == 1:
        fd = jp[0]
        anchor = fd.sources[0][1] if fd.sources else None
        for f in ("principal", "rate_pct", "start_date", "maturity_date", "maturity_amount"):
            fd.claim(f, JPEG_ADVICE[f], "advice", anchor, "SBI advice F164 (JPEG), as recorded in the phase-0 analysis")
        fd.notes.append("The only bank paper is a photographed advice (F164, JPEG, not machine-readable); its values "
                        "are taken from the phase-0 analysis: value date 14-05-2026, 4.90%, 46 days, maturity value "
                        "35,21,614. The account was debited on 18-05-2026.")
        fd.review = True
        st.review("missing_document", "SBI deposit of 35,00,000 is documented only by a photographed advice",
                  {"file": "F164", "deposit": mask(fd.norm), "principal": "3500000.00", "value_date": "2026-05-14",
                   "account_debited_on": "2026-05-18", "maturity_date": "2026-06-29", "maturity_amount": "3521614.00",
                   "basis": "phase-0 analysis reading of the JPEG; statement and register rows agree on the amounts"},
                  severity="medium", confidence=0.8, table="fixed_deposits", key=fd.key,
                  suggested_action="Read the advice by eye and confirm number, value date, rate and maturity value.")

    # ---------- closures ----------
    for fd in fds.values():
        if fd.close_rows:
            fd.closed_on = max(r["date"] for r in fd.close_rows)
            fd.proceeds = sum((r["credit"] for r in fd.close_rows), ZERO)

    # ---------- Quarterly_Interest sheets: first pass (principal of deposits no register lists) ----------
    qi_all, qi_totals = [], {}
    for fid, sheet, fy in QI_SHEETS:
        rows, totals = qi_rows(st, fid, sheet, stats)
        for q in rows:
            q["fy"] = fy
        qi_all.extend(rows)
        qi_totals[(fid, sheet)] = (rows, totals)
    for q in qi_all:
        if q["section"] != "other":
            continue
        m = re.match(r"TD\s*\d+", q["number"])
        fd = book.find(m[0]) if m else None
        if fd and not fd.claims["principal"] and fd.proceeds is not None:
            fd.claim("principal", fd.proceeds - q["amount"], "derived", src(q["file"], q["sheet"], q["row"], "enrichment"),
                     "closure proceeds less the interest recorded in the trust's interest sheet")
            fd.notes.append("Principal is not on any bank paper or register: derived as closure proceeds less the "
                            "interest the trust recorded for this closure.")
            fd.review = True

    # ---------- resolve fields ----------
    for fd in fds.values():
        resolve_fd(st, fd)

    # ---------- group fundings (one cheque for several deposits) ----------
    for bank, d, amount in GROUP_FUNDINGS:
        led = ledgers["saraswat"]
        row = next((r for r in led.rows if r["date"] == d and r.get("debit") == amount), None)
        if row is None:
            continue
        members = [fd for fd in fds.values() if fd.bank == bank and fd.funding is None and fd.val.get("start_date")
                   and 0 <= (fd.val["start_date"] - d).days <= 1]
        orphans = [fd for fd in fds.values() if fd.bank == bank and fd.funding is None and not fd.val.get("start_date")
                   and fd.closed_on and fd.closed_on > d and fd.val.get("principal") is not None]
        total_m = sum((fd.val["principal"] for fd in members), ZERO)
        take = []
        if total_m != amount and orphans:
            # the smallest set of start-less deposits that completes the cheque exactly
            need = amount - total_m
            orphans.sort(key=lambda f: (f.closed_on, f.norm))
            acc = ZERO
            for fd in orphans:
                if acc + fd.val["principal"] <= need:
                    take.append(fd)
                    acc += fd.val["principal"]
            if acc != need:
                take = []
        if total_m + sum((fd.val["principal"] for fd in take), ZERO) == amount:
            for fd in members + take:
                fd.add_source(1, row_src(row, "enrichment"))
                fd.group_funding = row
                fd.notes.append(f"Funded by one {'cheque' if row.get('reference') else 'transfer'} of {money(amount)} on "
                                f"{d.isoformat()} shared by {len(members) + len(take)} deposit(s); the bank row names no deposit.")
            for fd in take:
                fd.val["start_date"] = d
                fd.inferred_start = True
                fd.review = True
                fd.notes.append("Start date inferred from that shared funding row.")
        else:
            st.review("fd_arithmetic", "Shared funding row does not equal the deposits it is thought to have funded",
                      {"account": "saraswat", "date": d.isoformat(), "amount": money(amount), "file": row["file"],
                       "row": row["src"][1], "deposits": [mask(f.norm) for f in members],
                       "their_principal": money(total_m)}, severity="medium")

    # ---------- re-investment chains ----------
    chains = []
    renewed_olds = set()
    by_bank = defaultdict(list)
    for fd in fds.values():
        by_bank[fd.bank].append(fd)
    for bank, group in by_bank.items():
        window = 5 if bank == "sbi" else 0
        news_by_olds = defaultdict(list)
        for new in group:
            s = new.val.get("start_date")
            if not s:
                continue
            olds = sorted([o for o in group if o is not new and o.closed_on and 0 <= (s - o.closed_on).days <= window],
                          key=lambda o: (o.closed_on, o.norm))
            if olds:
                news_by_olds[tuple(o.norm for o in olds)].append((new, olds))
        for onorms, items in news_by_olds.items():
            items.sort(key=lambda x: x[0].norm)
            olds = items[0][1]
            for i, (new, _) in enumerate(items):
                new.renewed_from = olds[i] if len(olds) == len(items) else olds[0]
                same_day = all(o.closed_on == new.val["start_date"] for o in olds)
                others = [mask(o.norm) for o in olds if o is not new.renewed_from]
                new.notes.append(
                    f"Funded {'on the day' if same_day else 'within ' + str(max((new.val['start_date'] - o.closed_on).days for o in olds)) + ' day(s) after'} "
                    f"deposit(s) {', '.join(mask(o.norm) for o in olds)} closed (re-investment inferred from the dates; "
                    f"the bank does not label it a renewal)." + (f" Also from: {', '.join(others)}." if others else ""))
                if not same_day:
                    new.review = True
                new.events.append({"kind": "renewal", "date": new.val["start_date"], "amount": new.val.get("principal"),
                                   "label": f"Re-investment of proceeds of deposit(s) {', '.join(mask(o.norm) for o in olds)}",
                                   "sources": [new.sources[0][1]] if new.sources else []})
            for o in olds:
                renewed_olds.add(o)
            chains.append({"bank": bank, "from": [o.norm for o in olds], "to": [n.norm for n, _ in items],
                           "date": items[0][0].val["start_date"],
                           "same_day": all(o.closed_on == n.val["start_date"] for o in olds for n, _ in items)})

    # register-only roll-over: principal equals the predecessor's maturity value
    for new in fds.values():
        if new.renewed_from or new.funding is not None or not new.val.get("start_date"):
            continue
        for old in by_bank[new.bank]:
            if (old is not new and not old.closed_on and old.val.get("maturity_amount") == new.val.get("principal")
                    and old.val.get("maturity_date") and 0 <= (new.val["start_date"] - old.val["maturity_date"]).days <= 15
                    and old.val.get("maturity_amount") != old.val.get("principal")):
                new.renewed_from = old
                old.successor = new
                new.review = old.review = True
                new.notes.append(f"Principal equals the maturity value of deposit {mask(old.norm)} which matured "
                                 f"{(new.val['start_date'] - old.val['maturity_date']).days} day(s) earlier: linked as its "
                                 "re-investment on the strength of the trust's register only.")
                chains.append({"bank": new.bank, "from": [old.norm], "to": [new.norm], "date": new.val["start_date"],
                               "same_day": False, "register_only": True})

    # ---------- closure events + closure interest ----------
    for fd in fds.values():
        if not fd.close_rows:
            continue
        first = sorted(fd.close_rows, key=lambda r: (r["credit"] or ZERO), reverse=True)[0]
        fd.events.append({"kind": "closure", "date": fd.closed_on, "amount": fd.proceeds,
                          "label": " + ".join(dict.fromkeys(r["narration"] for r in fd.close_rows)),
                          "sources": [row_src(first)] + [row_src(r, "enrichment") for r in fd.close_rows if r is not first]})
        explicit = [e for e in fd.events if e["kind"] == "interest" and e.get("explicit") and e["date"] == fd.closed_on]
        p = fd.val.get("principal")
        if not explicit and p is not None:
            diff = fd.proceeds - p
            if diff > 0:
                fd.events.append({"kind": "interest", "date": fd.closed_on, "amount": diff, "credited": diff,
                                  "label": "Interest credited at closure (closure proceeds less principal)",
                                  "sources": [row_src(first)], "at_closure": True})
            elif diff < 0:
                st.review("fd_arithmetic", "Closure proceeds are lower than the principal",
                          {"deposit": mask(fd.norm), "bank": fd.bank, "principal": money(p), "proceeds": money(fd.proceeds),
                           "file": first["file"], "row": first["src"][1]}, severity="high", table="fixed_deposits", key=fd.key)
            else:
                fd.zero_interest = True
        for e in explicit:
            e["at_closure"] = True

    # ---------- status ----------
    for fd in fds.values():
        mat = fd.val.get("maturity_date")
        bank_evidence = any(cls in ("statement", "bankdoc", "advice") for c in fd.claims.values() for _, cls, *_ in c) \
            or any(e["kind"] == "interest" for e in fd.events)
        fd.bank_evidence = bank_evidence
        if fd.closed_on:
            fd.status = "renewed" if fd in renewed_olds else "closed"
        elif not bank_evidence and fd.bank == "svc":
            fd.status = "unknown"
        elif mat and mat < ARCHIVE_DATE:
            fd.status = "matured"
        elif mat:
            fd.status = "active"
        else:
            fd.status = "unknown"

    # ---------- Quarterly_Interest sheets: second pass (match to bank events) ----------
    qstats = match_quarterly_interest(st, book, qi_all, qi_totals, stats)

    # ---------- register interest / TDS columns for SBI ----------
    for (bank, norm), x in reg_extra.items():
        fd = fds.get((bank, norm))
        if not fd:
            continue
        bank_int = sum((e["amount"] for e in fd.events if e["kind"] == "interest"), ZERO)
        bank_tds = sum((e["amount"] for e in fd.events if e["kind"] == "tds"), ZERO)
        if fd.closed_on and x["interest"] is not None and bank_int and x["interest"] != bank_int:
            _conflict(st, fd, "interest", [("bank statement", money(bank_int)), ("register F134", money(x["interest"]))], x["src"])
        if fd.closed_on and x["tds"] and x["tds"] != bank_tds:
            _conflict(st, fd, "tax deducted", [("bank statement (rows naming this deposit)", money(bank_tds)),
                                               ("register F134", money(x["tds"]))], x["src"])

    # ---------- bank summaries: is every listed deposit open, and every open deposit listed? ----------
    for fid, (as_of, listed) in summaries.items():
        listed_set = set(id(f) for f in listed)
        for fd in by_bank["saraswat"]:
            s, e = fd.val.get("start_date"), fd.closed_on
            is_open = bool(s and s <= as_of and (e is None or e >= as_of))
            if is_open != (id(fd) in listed_set) and not (e == as_of or s == as_of):
                st.review("conflicting_sources", "Saraswat deposit summary and statement disagree on an open deposit",
                          {"file": fid, "as_of": as_of.isoformat(), "deposit": mask(fd.norm), "listed_in_summary": id(fd) in listed_set,
                           "open_per_statement": is_open}, severity="medium", table="fixed_deposits", key=fd.key)

    # ---------- arithmetic ----------
    for fd in fds.values():
        fd_arithmetic(st, fd)

    # ---------- emit ----------
    emitted = emit_fds(st, book, renewed_olds)
    return {"book": book, "stats": {k: dict(v) for k, v in stats.items()}, "chains": chains, "qi": qstats,
            "emitted": emitted}


def _conflict(st, fd, field, values, source=None, severity="medium", note=None):
    fd.review = True
    ev = {"deposit": mask(fd.norm), "bank": fd.bank, "field": field,
          "values": [{"source": a, "value": b} for a, b in values]}
    if source:
        ev.update(file=source["file"], sheet=source["sheet"], row=source["row"])
    if note:
        ev["note"] = note
    st.review("conflicting_sources", f"Deposit {field}: sources disagree", ev, severity=severity,
              table="fixed_deposits", key=fd.key,
              suggested_action="The bank document's value was kept; confirm against the deposit receipt.")


def _fmt(v):
    return v.isoformat() if isinstance(v, date) else (money(v) if isinstance(v, D) and v == v.quantize(D("0.01")) else str(v))


def resolve_fd(st, fd):
    """Chooses one value per field (bank paper before registers) and reports disagreements."""
    for field in ("principal", "start_date", "rate_pct", "maturity_date", "maturity_amount", "quarterly_interest"):
        claims = fd.claims.get(field)
        if not claims:
            continue
        best = min(claims, key=lambda c: (RANK[c[1]], -c[2]))
        distinct = {}
        for v, cls, order, source, label in claims:
            distinct.setdefault(v, []).append((cls, source, label))
        if len(distinct) > 1 and field == "rate_pct" and RANK[best[1]] >= RANK["register"]:
            # no bank paper for the rate: prefer the register value that reproduces the maturity value
            p = min(fd.claims["principal"], key=lambda c: (RANK[c[1]], -c[2]))[0] if fd.claims.get("principal") else None
            s = min(fd.claims["start_date"], key=lambda c: (RANK[c[1]], -c[2]))[0] if fd.claims.get("start_date") else None
            m = min(fd.claims["maturity_date"], key=lambda c: (RANK[c[1]], -c[2]))[0] if fd.claims.get("maturity_date") else None
            a = min(fd.claims["maturity_amount"], key=lambda c: (RANK[c[1]], -c[2]))[0] if fd.claims.get("maturity_amount") else None
            good = [v for v in distinct if maturity_check(p, v, s, m, a)["ok"]]
            if len(good) == 1:
                best = next(c for c in claims if c[0] == good[0])
                fd.notes.append(f"Registers give different rates; {good[0]}% reproduces the bank's maturity value and was kept.")
        fd.val[field] = best[0]
        fd.val_cls = getattr(fd, "val_cls", {})
        fd.val_cls[field] = best[1]
        if len(distinct) > 1 and field != "quarterly_interest":
            vals = []
            for v, lst in distinct.items():
                files = sorted({(s_["file"] if s_ else "F164") for _, s_, _ in lst})
                kinds = sorted({c for c, _, _ in lst})
                vals.append((f"{'/'.join(kinds)} ({', '.join(files)})", _fmt(v)))
            sev = "low" if field in ("maturity_amount",) and max(distinct) - min(distinct) <= 20 else "medium"
            _conflict(st, fd, field.replace("_", " "), vals, best[3], severity=sev,
                      note=f"kept {_fmt(best[0])} ({best[1]})")
    if fd.val.get("principal") is not None and fd.val_cls.get("principal") in ("accounts", "derived"):
        fd.review = True
    if fd.payout and fd.val.get("maturity_amount") is None and fd.val.get("principal") is not None:
        pass


def fd_arithmetic(st, fd):
    v = fd.val
    p, rate, s, m, a = (v.get("principal"), v.get("rate_pct"), v.get("start_date"), v.get("maturity_date"),
                        v.get("maturity_amount"))
    fd.compounding = None
    if fd.payout:
        fd.compounding = "quarterly payout"
        q = v.get("quarterly_interest")
        if p is not None and rate is not None and q is not None:
            expect = (p * rate / D(400)).quantize(D("0.01"))
            if abs(expect - q) > D("1"):
                st.review("fd_arithmetic", "Quarterly interest in the register differs from principal x rate / 4",
                          {"deposit": mask(fd.norm), "bank": fd.bank, "principal": money(p), "rate_pct": str(rate),
                           "register_quarterly_interest": money(q), "expected": money(expect)}, severity="low",
                          table="fixed_deposits", key=fd.key)
    else:
        chk = maturity_check(p, rate, s, m, a)
        if chk["ok"]:
            fd.compounding = {"simple": "simple (at maturity)", "quarterly": "quarterly", "annual": "annual"}[chk["rule"]]
        elif chk["ok"] is False:
            st.review("fd_arithmetic", "Maturity value is not reproduced from principal, rate and term",
                      {"deposit": mask(fd.norm), "bank": fd.bank, "principal": money(p), "rate_pct": str(rate),
                       "start": s.isoformat(), "maturity": m.isoformat(), "days": (m - s).days,
                       "printed_maturity_amount": money(a), "closest_rule": chk["rule"],
                       "expected_by_that_rule": money(chk["expected"]), "difference": money(chk["difference"])},
                      severity="low" if abs(chk["difference"]) <= 100 else "medium", table="fixed_deposits", key=fd.key,
                      suggested_action="Check rate, dates and compounding rule on the deposit receipt.")
    if fd.closed_on and fd.proceeds is not None and a is not None and fd.proceeds != a:
        st.review("fd_arithmetic", "Closure proceeds differ from the stated maturity value",
                  {"deposit": mask(fd.norm), "bank": fd.bank, "maturity_amount": money(a), "proceeds_credited": money(fd.proceeds),
                   "difference": money(fd.proceeds - a), "maturity_date": m.isoformat() if m else None,
                   "closed_on": fd.closed_on.isoformat(),
                   "note": "A shortfall is consistent with tax deducted at source; not verified from a TDS certificate."},
                  severity="low", table="fixed_deposits", key=fd.key)


def match_quarterly_interest(st, book, qi_all, qi_totals, stats):
    """Ties each row of the trust's interest sheets to the bank's own interest / closure row."""
    res = Counter()
    reg_tds = []
    svc_payout = [fd for fd in book.fds.values() if fd.bank == "svc" and fd.payout]
    for q in qi_all:
        tag = f"{q['file']}/{q['sheet']}"
        s = src(q["file"], q["sheet"], q["row"], "duplicate")
        ev_base = {"file": q["file"], "sheet": q["sheet"], "row": q["row"], "date": q["date"].isoformat(),
                   "amount": money(q["amount"])}
        d = q["date"]
        if fy_of(d) != q["fy"]:
            shifted = None
            for yr in (d.year + 1, d.year - 1):
                try:
                    cand = d.replace(year=yr)
                except ValueError:
                    continue
                if fy_of(cand) == q["fy"]:
                    shifted = cand
            st.review("date_outside_fy", "Interest sheet row is dated outside the sheet's financial year",
                      {**ev_base, "sheet_fy": q["fy"], "read_as": shifted.isoformat() if shifted else None}, severity="low",
                      suggested_action="The year looks copied from the previous year's sheet; the row was matched on the corrected year.")
            d = shifted or d
        m = re.match(r"TD\s*\d+", q["number"])
        fd = book.find(m[0]) if m else (svc_payout[0] if q["number"].upper().startswith("SVC") and len(svc_payout) == 1 else None)
        want_close = q["section"] == "other"

        def pick(f):
            for e in f.events:
                if e["kind"] != "interest" or tag in e.get("qi", ()):
                    continue
                if bool(e.get("at_closure")) != want_close and not (want_close and e.get("explicit")):
                    continue
                if abs((e["date"] - d).days) <= 3 and e.get("credited") == q["amount"]:
                    return e
            return None

        hit = pick(fd) if fd else None
        if hit is None and fd is None:
            # mistyped number: same date and amount on exactly one other deposit
            cands = [(f, pick(f)) for f in book.fds.values()]
            cands = [(f, e) for f, e in cands if e is not None]
            if len(cands) == 1:
                fd, hit = cands[0]
                st.review("conflicting_sources", "Interest sheet names a deposit number that does not exist",
                          {**ev_base, "number_as_written": q["number"], "matched_deposit": mask(fd.norm),
                           "basis": "same date and amount in the bank statement"}, severity="low",
                          table="fixed_deposits", key=fd.key)
        if hit is not None:
            hit.setdefault("qi", set()).add(tag)
            hit["sources"].append(s)
            stats[tag]["duplicate"] += 1
            res["matched"] += 1
            bank_tax = hit.get("tax")
            if q["tds"] is not None and bank_tax is not None and q["tds"] != bank_tax:
                _conflict(st, fd, "tax deducted on interest", [("bank statement narration", money(bank_tax)),
                                                              ("interest sheet", money(q["tds"]))], s, severity="low")
            if want_close and q["tds"] and not hit.get("explicit"):
                reg_tds.append(q["tds"])
                fd.events.append({"kind": "tds", "date": hit["date"], "amount": q["tds"],
                                  "label": f"TDS per the trust's interest sheet (interest expected {money(q['expected'])} less "
                                           f"credited {money(q['amount'])}); not a bank figure",
                                  "sources": [src(q["file"], q["sheet"], q["row"])], "register_estimate": True})
                stats[tag]["emitted"] += 1
            continue
        if fd is not None and want_close and q["amount"] == 0 and fd.closed_on and abs((fd.closed_on - d).days) <= 3:
            # closed without interest: the sheet records expected interest as tax
            stats[tag]["duplicate"] += 1
            res["matched"] += 1
            if q["tds"]:
                reg_tds.append(q["tds"])
                fd.events.append({"kind": "tds", "date": fd.closed_on, "amount": q["tds"],
                                  "label": f"TDS per the trust's interest sheet (interest expected {money(q['expected'])}, "
                                           "none credited); not a bank figure",
                                  "sources": [src(q["file"], q["sheet"], q["row"])], "register_estimate": True})
                stats[tag]["emitted"] += 1
            continue
        if fd is not None:
            fd.events.append({"kind": "interest", "date": d, "amount": q["amount"], "credited": q["amount"],
                              "label": f"Interest per the trust's interest sheet ({q['number']}); no matching bank row",
                              "sources": [src(q["file"], q["sheet"], q["row"])], "qi": {tag}})
            stats[tag]["emitted"] += 1
            res["sheet_only"] += 1
            st.review("conflicting_sources", "Interest sheet row has no matching credit in the bank statement",
                      {**ev_base, "deposit": mask(fd.norm)}, severity="medium", table="fixed_deposits", key=fd.key,
                      suggested_action="Imported from the sheet; check the bank statement for the credit.")
        else:
            res["unplaced"] += 1
            st.skip(f"{tag}: interest row that matches no deposit")
            st.review("conflicting_sources", "Interest sheet row matches no deposit and no bank credit",
                      {**ev_base, "number_as_written": q["number"]}, severity="medium")
    # printed totals of the sheets
    for (fid, sheet), (rows, totals) in qi_totals.items():
        for n, label, printed, section in totals:
            if printed is None:
                continue
            if "TOTAL FD INTEREST" in re.sub(r"\s+", " ", label).upper():
                calc = sum((r["amount"] for r in rows), ZERO)
            else:
                calc = sum((r["amount"] for r in rows if r["section"] == section), ZERO)
            if calc != printed:
                st.review("total_mismatch", "Interest sheet total differs from the sum of its rows",
                          {"file": fid, "sheet": sheet, "row": n, "label": label, "printed": money(printed),
                           "sum_of_rows": money(calc)}, severity="low")
    if reg_tds:
        st.review("fd_arithmetic", "TDS on closed deposits is the register's estimate, not a bank figure",
                  {"events": len(reg_tds), "total": money(sum(reg_tds, ZERO)),
                   "rule_in_sheet": "interest expected less interest credited",
                   "sheets": [f"{f}/{s}" for f, s, _ in QI_SHEETS]}, severity="medium",
                  suggested_action="Confirm against Form 26AS / TDS certificates before relying on these figures.")
    res["register_tds_events"] = len(reg_tds)
    res["register_tds_total"] = sum(reg_tds, ZERO)
    return res


def emit_fds(st, book, renewed_olds):
    out = []
    changed_earmarks = []
    for fd in sorted(book.fds.values(), key=lambda f: (f.val.get("start_date") or date(1900, 1, 1), f.bank, f.norm)):
        v = fd.val
        if v.get("principal") is None or not fd.sources:
            st.review("missing_amount", "Deposit number seen without a principal; not imported",
                      {"deposit": mask(fd.norm), "bank": fd.bank,
                       "rows": [{"file": s["file"], "sheet": s["sheet"], "row": s["row"]} for _, s in fd.sources][:5]},
                      severity="high")
            st.skip("deposit without a principal on any source")
            continue
        notes = list(dict.fromkeys(fd.notes))
        earmark = None
        if fd.earmarks:
            earmark = fd.earmarks[-1][1]
            variants = list(dict.fromkeys(t for _, t in fd.earmarks))
            if len(variants) > 1:
                notes.append("Earmark in earlier registers: " + "; ".join(f"{f}: {t}" for f, t in fd.earmarks[:-1]
                                                                          if t != earmark) + ".")
                changed_earmarks.append({"deposit": mask(fd.norm), "bank": fd.bank, "variants": variants})
        if fd.closed_on:
            notes.append(f"Closed {fd.closed_on.isoformat()}, proceeds credited {money(fd.proceeds)}.")
            if getattr(fd, "zero_interest", False):
                notes.append("No interest was credited at closure.")
        if not fd.bank_evidence:
            fd.review = True
            notes.append("Known only from the trust's own register / accounts; no bank document or statement row.")
        if fd.val_cls.get("start_date") == "register" and fd.bank == "saraswat" and not getattr(fd, "group_funding", None):
            fd.review = True
        if v.get("start_date") is None:
            fd.review = True
            notes.append("Start date is not on any source.")
        if len(fd.reg_names) > 1:
            notes.append("Registers name the institution differently: " + " / ".join(sorted(fd.reg_names)) + ".")
        srcs = [s for _, s in sorted(fd.sources, key=lambda x: x[0])]
        srcs[0] = dict(srcs[0], role="primary")
        rec = {"bank": BANKS[fd.bank][0], "branch": BANKS[fd.bank][1], "fd_number": fd.number,
               "principal": v.get("principal"), "rate_pct": str(v["rate_pct"]) if v.get("rate_pct") is not None else None,
               "start_date": v.get("start_date"), "maturity_date": v.get("maturity_date"),
               "maturity_amount": v.get("maturity_amount"), "compounding": fd.compounding, "status": fd.status,
               "renewed_from_key": fd.renewed_from.key if fd.renewed_from else None, "fund_code": None,
               "earmark_as_written": earmark, "notes": " ".join(notes) or None, "needs_review": bool(fd.review)}
        st.emit("fixed_deposits", fd.key, rec, srcs)
        out.append(fd)
        # status-specific review items
        if fd.status == "matured":
            st.review("missing_document", "Deposit is past its maturity date and the outcome is not in the archive",
                      {"deposit": mask(fd.norm), "bank": fd.bank, "principal": money(v["principal"]),
                       "maturity_date": v["maturity_date"].isoformat(),
                       "maturity_amount": money(v.get("maturity_amount")) if v.get("maturity_amount") is not None else None,
                       "archive_date": ARCHIVE_DATE.isoformat()}, severity="high", table="fixed_deposits", key=fd.key,
                      suggested_action="Find the credit of the proceeds (or the renewal advice) and record closure or renewal.")
        elif fd.status == "unknown":
            st.review("missing_document", "Deposit has no bank paper; status unknown",
                      {"deposit": mask(fd.norm), "bank": fd.bank, "principal": money(v["principal"]),
                       "start_date": v["start_date"].isoformat() if v.get("start_date") else None,
                       "maturity_date": v["maturity_date"].isoformat() if v.get("maturity_date") else None,
                       "known_from": sorted({s["file"] for s in srcs})}, severity="medium", table="fixed_deposits", key=fd.key,
                      suggested_action="Ask for the deposit receipt and the funding entry.")
        # events
        seen = Counter()
        for e in sorted(fd.events, key=lambda e: (e["date"], {"renewal": 0, "interest": 1, "tds": 2, "closure": 3}.get(e["kind"], 4))):
            if e.get("amount") is None or not e.get("sources"):
                continue
            seen[(e["date"], e["kind"])] += 1
            k = f"bnk:fdev:{fd.bank}:{fd.norm}:{e['date'].isoformat()}:{e['kind']}:{seen[(e['date'], e['kind'])]}"
            st.emit("fd_events", k, {"fixed_deposit_key": fd.key, "event_date": e["date"], "fy": fy_of(e["date"]),
                                     "kind": e["kind"], "amount": e["amount"], "label_as_written": clean_text(e["label"])},
                    e["sources"])
    if changed_earmarks:
        st.review("conflicting_sources", "Deposit earmark changed between yearly registers",
                  {"deposits": changed_earmarks}, severity="low",
                  suggested_action="The latest register's wording was kept; earlier wordings are in the deposit notes.")
    return out


def fd_snapshot(fds, on):
    """Principal of deposits open on a date, by bank."""
    by = defaultdict(lambda: [0, ZERO])
    for fd in fds:
        s = fd.val.get("start_date")
        end = fd.closed_on
        if end is None and getattr(fd, "successor", None) is not None:
            end = fd.val.get("maturity_date")
        if (s is None and end and end > on) or (s and s <= on and (end is None or end > on)):
            by[fd.bank][0] += 1
            by[fd.bank][1] += fd.val["principal"]
    return {k: (n, a) for k, (n, a) in by.items()}


# =====================================================================================
# 3. Investments
# =====================================================================================

MF_SHEETS = [("F011", "Mutual Funds"), ("F033", "FD & MF"), ("F080", "FD & MF"), ("F134", "FD & MF")]


def build_investments(st, bankrep):
    stats = defaultdict(Counter)
    schemes = {}
    for fid, sheet in MF_SHEETS:
        for n, c in raw_rows(fid, sheet):
            name = clean_text(c.get("B")) if isinstance(c.get("B"), str) else None
            if not name or not name.startswith("ICICI Pru"):
                continue
            stats[f"{fid}/{sheet}"]["read"] += 1
            schemes.setdefault(name, []).append((fid, sheet, n, c))
    sip_rows = [r for r in bankrep["ledgers"]["saraswat"].rows
                if r.get("debit") and re.search(r"ICIPRU|I PRU MF", r.get("narration") or "")]
    by_month = defaultdict(list)
    for r in sip_rows:
        by_month[(r["date"].year, r["date"].month)].append(r)
    names = list(schemes)
    first = next((n for n in names if "Balanced" in n), None)
    rest = [n for n in names if n != first]
    assigned = defaultdict(list)
    odd = []
    for ym in sorted(by_month):
        rows = by_month[ym]
        if len(rows) != len(names) or first is None:
            odd.append((ym, len(rows)))
            continue
        early = [r for r in rows if re.search(r"ICIPRU 15", r["narration"])] or [min(rows, key=lambda r: r["date"])]
        assigned[first].append(early[0])
        others = [r for r in rows if r is not early[0]]
        for nm, r in zip(rest, others):
            assigned[nm].append(r)
    for ym, n in odd:
        st.review("conflicting_sources", "Month with an unexpected number of SIP debits",
                  {"month": f"{ym[0]}-{ym[1]:02d}", "debits": n, "schemes": len(names)}, severity="medium")
    summary = {}
    for name, rows in schemes.items():
        fid, sheet, n, c = rows[0]                      # F011 is the trust's passbook: canonical
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower().replace("icici pru", "")).strip("-")
        key = f"bnk:inv:icici-pru-{slug}"
        folio = c.get("N")
        folio = str(int(folio)) if isinstance(folio, float) else clean_text(folio)
        latest = schemes[name][-1][3]
        units_total = parse_amount(round(float(c.get("C")), 4))[0] if c.get("C") is not None else None
        notes = (f"SIP of Rs 2,500 a month by ACH debit from the Saraswat account. Register {fid}: units "
                 f"{c.get('C'):.3f}, total invested {money(parse_amount(c.get('E'))[0])}. No fund statement is in the archive; "
                 "units per purchase come from the formula in the trust's register.")
        srcs = [src(fid, sheet, n)] + [src(f2, s2, n2, "duplicate") for f2, s2, n2, _ in rows[1:]]
        st.emit("investments", key, {"kind": "mutual_fund", "name": name, "folio": folio, "notes": notes}, srcs)
        stats[f"{fid}/{sheet}"]["emitted"] += 1
        for f2, s2, n2, _ in rows[1:]:
            stats[f"{f2}/{s2}"]["duplicate"] += 1
        formula = (c.get("_f") or {}).get("C") if isinstance(c.get("_f"), dict) else None
        terms = [D(t) for t in re.findall(r"[\d.]+", formula)] if formula and re.fullmatch(r"=[\d.+]+", formula) else []
        buys = assigned.get(name, [])
        if terms and len(terms) != len(buys):
            st.review("conflicting_sources", "Number of SIP purchases in the register differs from the bank debits",
                      {"scheme": name, "register_purchases": len(terms), "bank_debits": len(buys), "file": fid, "row": n},
                      severity="medium", table="investments", key=key)
        if terms and units_total is not None and abs(sum(terms) - D(str(c.get("C")))) > D("0.001"):
            st.review("total_mismatch", "Units per purchase do not add up to the register's unit total",
                      {"scheme": name, "sum": str(sum(terms)), "register": str(c.get("C"))}, table="investments", key=key)
        invested = parse_amount(c.get("E"))[0]
        paid = sum((r["debit"] for r in buys), ZERO)
        if invested is not None and paid != invested:
            st.review("total_mismatch", "Total invested in the register differs from the bank debits",
                      {"scheme": name, "register_total": money(invested), "bank_debits": money(paid), "file": fid, "row": n},
                      severity="medium", table="investments", key=key)
        for i, r in enumerate(buys):
            units = terms[i] if i < len(terms) and len(terms) == len(buys) else None
            s2 = [row_src(r)]
            if units is not None:
                s2.append(src(fid, sheet, n, "enrichment"))
            st.emit("investment_transactions", f"{key}:{r['date'].isoformat()}",
                    {"investment_key": key, "txn_date": r["date"], "fy": fy_of(r["date"]), "kind": "purchase",
                     "amount": r["debit"], "units": str(units) if units is not None else None}, s2)
        summary[name] = {"purchases": len(buys), "amount": paid, "units": sum(terms) if terms else None,
                         "first": buys[0]["date"] if buys else None, "last": buys[-1]["date"] if buys else None}
    if len(rest) > 1:
        st.review("missing_document", "Mutual fund purchases rest on bank debits and a register formula only",
                  {"schemes": names, "note": "Two schemes are debited on the same day for the same amount; which debit belongs to which "
                                             "scheme cannot be told from the statement (assigned in statement order). Units per purchase "
                                             "are the terms of the formula in the register's Units cell.",
                   "register": "F011/Mutual Funds", "debits": len(sip_rows)}, severity="medium",
                  suggested_action="Obtain the CAMS / ICICI Prudential account statement for the folio.")
    return {"summary": summary, "stats": {k: dict(v) for k, v in stats.items()}, "sip_rows": len(sip_rows)}


# =====================================================================================
# 4. Budgets
# =====================================================================================

def _budget_side(rows, lab, leaf, sub):
    """Leaf lines of one side of a Schedule VII-A budget: [(row, head, amount)], and the printed total."""
    out, group, total = [], None, None
    for n, c in rows:
        label = clean_text(c.get(lab)) if isinstance(c.get(lab), str) else None
        if not label:
            continue
        if label.lower().startswith("total rs"):
            total = parse_amount(c.get(sub))[0]
            continue
        v = c.get(leaf)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            sub_item = bool(re.match(r"^\(?[ivx]+\)|^\([a-z]\)|^\d+\.", label))
            head = f"{group} > {label}" if group and sub_item else label
            out.append((n, head, parse_amount(v)[0]))
        elif label not in ("Rs.",) and not label.isupper():
            group = label
    return out, total


def build_budgets(st):
    stats = defaultdict(Counter)
    res = {}

    def one(fid, extra_sources=()):
        rows = raw_rows(fid, "Budget")
        heading = next((f"{clean_text(c.get('A'))} {clean_text(c.get('B'))}" for n, c in rows
                        if isinstance(c.get("A"), str) and "Annual Budget for the Year" in c["A"]), None)
        hrow = next((n for n, c in rows if isinstance(c.get("A"), str) and "Annual Budget for the Year" in c["A"]), 1)
        m = re.search(r"(\d\d)/(\d\d)/(\d{4})\s*To\s*(\d\d)/(\d\d)/(\d{4})", heading or "")
        if not m:
            st.review("missing_date", "Budget sheet does not state its year", {"file": fid}, severity="high")
            st.skip(f"{fid}: budget without a stated year")
            return None
        fy = fy_of(date(int(m[3]), int(m[2]), int(m[1])))
        key = f"bnk:budget:{fy}"
        main = [(n, c) for n, c in rows if 8 < n < 33]
        st.emit("budgets", key, {"fy": fy, "title": f"Annual budget {fy} (Schedule VII-A)", "heading_as_written": heading},
                [src(fid, "Budget", hrow)] + list(extra_sources))
        for kind, lab, leaf, sub in (("income", "A", "B", "C"), ("expense", "D", "E", "F")):
            lines, total = _budget_side(main, lab, leaf, sub)
            for n, head, amount in lines:
                stats[f"{fid}/Budget"]["emitted"] += 1
                st.emit("budget_lines", f"{key}:{kind}:{n}", {"budget_key": key, "kind": kind, "head_as_written": head,
                                                           "amount": amount}, [src(fid, "Budget", n)])
            s = sum((a for _, _, a in lines), ZERO)
            if total is None or s != total:
                st.review("total_mismatch", "Budget lines do not add up to the printed total",
                          {"file": fid, "side": kind, "sum_of_lines": money(s), "printed_total": money(total) if total is not None else None},
                          severity="medium", table="budgets", key=key)
            res[(fy, kind)] = (len(lines), s, total)
        return fy, key

    r163 = one("F163", [src("F086", "Budget", 5, "duplicate")])
    # F086 is the same content saved under another name: verify cell by cell
    a = {n: {k: v for k, v in c.items() if k != "_f"} for n, c in raw_rows("F163", "Budget")}
    b = {n: {k: v for k, v in c.items() if k != "_f"} for n, c in raw_rows("F086", "Budget")}
    stats["F086/Budget"]["read"] = len(b)
    if a == b:
        stats["F086/Budget"]["duplicate"] = len(b)
        st.skip("F086: budget identical cell by cell to F163 (duplicate source only)", len(b))
        st.review("conflicting_sources", "Budget file named 25-26 holds the 2026-27 budget",
                  {"file": "F086", "identical_to": "F163", "year_inside": "01/04/2026 To 31/03/2027",
                   "consequence": "No budget for FY 2025-26 (or 2024-25) exists in the archive."}, severity="medium",
                  suggested_action="Ask the trust for the 2024-25 and 2025-26 budgets.")
    else:
        diff = sorted(n for n in set(a) | set(b) if a.get(n) != b.get(n))
        st.review("conflicting_sources", "Budget files F086 and F163 differ", {"rows": diff[:20]}, severity="high")
    r036 = one("F036")
    if r036:
        st.review("conflicting_sources", "Budget file named 24-25 is headed 2023-24",
                  {"file": "F036", "file_name_says": "24-25", "heading_inside": "01/04/2023 To 31/03/2024",
                   "imported_as": r036[0]}, severity="medium", table="budgets", key=r036[1],
                  suggested_action="Confirm which year this budget was for.")
    # F036: second block 'Budget for 2022-2023' and an unlabelled column
    rows = raw_rows("F036", "Budget")
    blk = next((n for n, c in rows if isinstance(c.get("H"), str) and "Budget for" in c["H"]), None)
    if blk:
        title = clean_text(dict(rows)[blk]["H"])
        m = re.search(r"(\d{4})\s*-\s*(\d{4})", title)
        fy = f"{m[1]}-{m[2][2:]}" if m else None
        key = f"bnk:budget:{fy}:programme"
        st.emit("budgets", key, {"fy": fy, "title": f"Programme budget {fy}", "heading_as_written": title},
                [src("F036", "Budget", blk)])
        tin = tout = ZERO
        printed = None
        for n, c in rows:
            if n <= blk + 1:
                continue
            head = clean_text(c.get("H")) if isinstance(c.get("H"), str) else None
            if head and head.lower().startswith("expected surplus"):
                st.skip("F036: 'Expected Surplus' line of the 2022-23 programme budget (derived figure)")
                continue
            if not head:
                if c.get("I") is not None or c.get("J") is not None:
                    printed = (parse_amount(c.get("I"))[0], parse_amount(c.get("J"))[0])
                continue
            for kind, col in (("income", "I"), ("expense", "J")):
                amt = parse_amount(c.get(col))[0]
                if amt is not None:
                    st.emit("budget_lines", f"{key}:{kind}:{n}", {"budget_key": key, "kind": kind, "head_as_written": head,
                                                               "amount": amt}, [src("F036", "Budget", n)])
                    stats["F036/Budget"]["emitted"] += 1
                    if kind == "income":
                        tin += amt
                    else:
                        tout += amt
        if printed and printed != (tin, tout):
            st.review("total_mismatch", "Programme budget 2022-23 lines do not add up to the printed totals",
                      {"file": "F036", "sum_income": money(tin), "sum_expense": money(tout),
                       "printed": [money(printed[0]), money(printed[1])]}, table="budgets", key=key)
        res[(fy, "programme")] = (tin, tout, printed)
    loose = [(n, c["I"]) for n, c in rows if n < (blk or 10 ** 6) and isinstance(c.get("I"), (int, float))]
    if loose:
        st.skip("F036: unlabelled numbers in column I of the budget sheet", len(loose))
        st.review("unclassified_head", "Budget sheet has a column of numbers without labels",
                  {"file": "F036", "sheet": "Budget", "column": "I", "rows": [n for n, _ in loose],
                   "sum": money(sum((parse_amount(v)[0] for _, v in loose), ZERO))}, severity="low",
                  suggested_action="Ask what these figures are; they were not imported.")
    # 'Schedules' sheets: another organisation's template data
    n_sched = {}
    for fid in ("F036", "F086", "F163"):
        n = len(raw_rows(fid, "Schedules"))
        n_sched[fid] = n
        st.skip(f"{fid}: 'Schedules' sheet holds another organisation's data (not imported)", n)
    st.review("trustee_decision", "Budget workbooks carry a 'Schedules' sheet with another organisation's data",
              {"files": n_sched, "sheet": "Schedules",
               "content": "expense heads, trustee list, a 2016-17 resolution and another Charity Commissioner office: "
                          "leftover template content, not this trust's"}, severity="low",
              suggested_action="Not imported. Remove the sheet from the workbooks before they are filed anywhere.")
    for fid in ("F163", "F036"):
        stats[f"{fid}/Budget"]["read"] = len(raw_rows(fid, "Budget"))
    return {"res": res, "stats": {k: dict(v) for k, v in stats.items()}}


# =====================================================================================
# 5. Annual statements
# =====================================================================================

TALLY_GROUPS = {"capital account", "loans (liability)", "current liabilities", "investments", "current assets",
                "indirect expenses", "indirect incomes", "suspense a/c", "closing stock"}


_IN_NUM = r"(?:\d{1,2},(?:\d{2},)*\d{3}|\d{1,3})\.\d{2}"          # validly grouped Indian figure
_TALLY_TAIL = re.compile(rf"^(.*?)\s((?:{_IN_NUM}(?: (?:Cr|Dr))?)+)$")
_TALLY_TOKEN = re.compile(rf"({_IN_NUM})(?: (Cr|Dr))?")
_TALLY_ONE = re.compile(rf"^(.*?[^\d,.\s])\s?({_IN_NUM})$")
# Headline figures recorded in the phase-0 analysis (reports/phase0/E_bank_fd_audit.md, 2.2);
# every one of them must be reproduced by the parsed lines.
TALLY_EXPECTED = {
    "F017": {"income": "1735364.00", "expenditure": "1457161.13", "surplus": "278202.87", "balance_sheet_total": "702072.26",
             "investments": "546390.00", "bank_opening": "76019.39", "bank_closing": "122833.26"},
    "F019": {"income": "1734276.00", "expenditure": "1457161.13", "surplus": "277114.87", "balance_sheet_total": "700984.26",
             "investments": "535000.00", "bank_opening": "76019.39", "bank_closing": "122833.26"},
}


def split_tally_summary(text):
    """One row of a Tally 'Group Summary' page.  The PDF text glues the four columns
    (closing balance, credit, debit, opening balance) together, e.g.
    'RESERVE & SURPLUS 1,67,122.26 Cr2,78,202.871,11,080.61 Dr'.
    Returns {'label', 'closing', 'credit', 'debit', 'opening'} with balances signed
    (Dr positive, Cr negative), or None unless every token is a validly grouped figure
    AND the row's own arithmetic holds: closing = opening + debit - credit."""
    m = _TALLY_TAIL.match(text.strip())
    if not m:
        return None
    toks = [(num(a), b) for a, b in _TALLY_TOKEN.findall(m[2])]
    if "".join(x.group(0) for x in _TALLY_TOKEN.finditer(m[2])) != m[2] or not toks:
        return None
    sign = lambda v, f: v if f == "Dr" else -v
    closing = opening = ZERO
    if toks[0][1]:
        closing = sign(*toks[0])
        toks = toks[1:]
    if toks and toks[-1][1]:
        opening = sign(*toks[-1])
        toks = toks[:-1]
    if any(f for _, f in toks) or len(toks) > 2:
        return None
    moves = [v for v, _ in toks]
    if len(moves) == 2:
        options = [(moves[0], moves[1])]                     # printed order: credit, debit
    elif len(moves) == 1:
        options = [(moves[0], ZERO), (ZERO, moves[0])]
    else:
        options = [(ZERO, ZERO)]
    for credit, debit in options:
        if opening + debit - credit == closing:
            return {"label": clean_text(m[1]), "closing": closing, "credit": credit, "debit": debit, "opening": opening}
    return None


def tally_statement(st, fid, version):
    key = f"bnk:stmt:2022-23:tally-v{version}"
    lines = pdf_lines(fid)
    st.emit("annual_statements", key,
            {"fy": "2022-23", "entity": "trust", "source_label": f"Tally accounts v{version} (unsigned)", "is_signed_audit": False,
             "notes": "Accounting-software printout (Balance Sheet, Income and Expenditure Statement, four group summaries). "
                      "No auditor's report, signature or UDIN. Group-summary rows are imported only where the parsed closing, "
                      "credit, debit and opening figures satisfy the row's own arithmetic; other rows are in the review queue."},
            [src(fid, lines[0][0], lines[0][1])])
    state = {"order": 0}
    rejected, page_title, section, p2_total_seen = [], {}, None, False
    got = {}

    def line(sheet, n, side, label, amount, when=None):
        state["order"] += 1
        st.emit("annual_statement_lines", f"{key}:{state['order']:03d}",
                {"statement_key": key, "side": side, "label": label, "amount": amount, "line_date": when,
                 "cell_ref": f"{sheet} line {n}", "line_order": state["order"]}, [src(fid, sheet, n)])

    for sheet, n, text in lines:
        t = text.strip()
        page = int(sheet.split()[1])
        if page not in page_title:
            if t in ("Balance Sheet", "Income and Expenditure Statement", "Capital Account", "Current Liabilities",
                     "Investments", "Current Assets"):
                page_title[page] = t
            continue
        if not re.search(r"\d\.\d{2}", t):
            if page == 1 and t.startswith("Liabilities"):
                section = "Liabilities"
            elif page == 1 and t.startswith("Assets"):
                section = "Assets"
            continue
        if page <= 2:
            m = re.match(rf"^(.*\S)\s({_IN_NUM})$", t) or _TALLY_ONE.match(t)   # spaced, else glued to a letter
            if not m:
                rejected.append({"page": page, "line": n, "text": t})
                continue
            label, amount = clean_text(m[1]), num(m[2])
            low = label.lower()
            if page == 1:
                side = "total" if low == "total" or low in TALLY_GROUPS else (
                    "memo" if low in ("current period", "less: transferred") else "closing")
                lab = f"{section}: {label}" if section else label
                if low == "total":
                    got.setdefault("balance_sheet_total", set()).add(amount)
                if low == "investments":
                    got["investments"] = {amount}
                line(sheet, n, side, lab, amount, date(2023, 3, 31))
            else:
                lab = label
                if low == "total":
                    side, lab = "total", ("Total (income side)" if p2_total_seen else "Total (expenditure side)")
                    p2_total_seen = True
                elif low in TALLY_GROUPS:
                    side = "total"
                    got["income" if "income" in low else "expenditure"] = {amount}
                elif low.startswith("excess of"):
                    side = "memo"
                    got["surplus"] = {amount}
                else:
                    side = "inward" if p2_total_seen else "outward"
                line(sheet, n, side, lab, amount)
            continue
        row = split_tally_summary(t)
        if row is None:
            rejected.append({"page": page, "line": n, "text": t})
            continue
        head = f"{page_title[page]}: {row['label']}"
        drcr = lambda v: "Dr" if v > 0 else "Cr"
        if row["opening"]:
            line(sheet, n, "opening", f"{head} (opening balance, {drcr(row['opening'])})", abs(row["opening"]), date(2022, 4, 1))
        if row["debit"]:
            line(sheet, n, "memo", f"{head} (debits in the year)", row["debit"])
        if row["credit"]:
            line(sheet, n, "memo", f"{head} (credits in the year)", row["credit"])
        if row["closing"]:
            line(sheet, n, "total" if row["label"].lower() == "grand total" else "closing",
                 f"{head} (closing balance, {drcr(row['closing'])})", abs(row["closing"]), date(2023, 3, 31))
        if row["label"].upper().startswith("SARASWAT"):
            got["bank_opening"], got["bank_closing"] = {row["opening"]}, {row["closing"]}
    if rejected:
        st.review("bad_amount", f"Tally accounts v{version}: rows that could not be read reliably were not imported",
                  {"file": fid, "statement": key, "rows": rejected,
                   "reason": "figures are glued together in the PDF text and the parsed values do not satisfy the row's own arithmetic"},
                  severity="medium", table="annual_statements", key=key, suggested_action="enter by hand from the PDF")
        st.skip(f"{fid}: Tally row not readable with certainty (in review queue)", len(rejected))
    checks = {}
    for name, want in TALLY_EXPECTED[fid].items():
        have = sorted(money(v) for v in got.get(name, ()))
        checks[name] = {"expected": want, "parsed": have, "ok": have == [want]}
    bad = {k: v for k, v in checks.items() if not v["ok"]}
    if bad:
        st.review("total_mismatch", f"Tally accounts v{version}: headline figures differ from the phase-0 analysis",
                  {"file": fid, "statement": key, "figures": bad}, severity="high", table="annual_statements", key=key,
                  suggested_action="Compare with the PDF by eye before using this statement.")
    return key, state["order"], {"checks": checks, "rejected": rejected}


F118_LINES = [
    # (anchor regex on an English page, label, side, value position: 'same' | 'next' | 'prev')
    (r"^115BBC \(Other than Corpus\)", "Voluntary contributions other than corpus", "inward", "same"),
    (r"^\(iv\) Income from other sources", "Income from other sources", "inward", "same"),
    (r"^11 Gross Income \(9\+10\)", "Gross income", "total", "same"),
    (r"^Amount applied during the previous year", "Amount applied to the objects of the trust during the year", "outward", "next"),
    (r"extent it does not exceed 15 per cent", "Amount accumulated or set apart (up to 15% of income)", "memo", "next"),
    (r"^\(vii\) Total \[6i", "Total exemption claimed u/s 11", "memo", "same"),
    (r"^13 Total Income \(11-12\)", "Total income", "memo", "same"),
]


def itr_statement(st):
    """FY 2023-24 headline figures from the income-tax intimation u/s 143(1) (F118)."""
    fid = "F118"
    lines = [(s, n, t) for s, n, t in pdf_lines(fid) if int(s.split()[1]) >= 14]
    key = "bnk:stmt:2023-24:itr-intimation"
    st.emit("annual_statements", key,
            {"fy": "2023-24", "entity": "trust", "source_label": "Income-tax intimation AY 2024-25", "is_signed_audit": False,
             "notes": "Not accounts: figures of the ITR-7 return and of the department's computation u/s 143(1), taken from the "
                      "English part of the intimation (pages 14-25). Each head is given twice: as returned by the trust and as "
                      "computed by the department."}, [src(fid, lines[0][0], lines[0][1])])
    order, found = 0, {}
    pair = re.compile(r"(\d[\d,]*) (\d[\d,]*)$")
    for rx, label, side, pos in F118_LINES:
        idx = next((i for i, (_, _, t) in enumerate(lines) if re.search(rx, t.strip())), None)
        hit = None
        if idx is not None:
            rng = [idx] if pos == "same" else range(idx + 1, min(idx + 8, len(lines)))
            for j in rng:
                m = pair.search(lines[j][2].strip())
                if m and (pos == "same" or re.fullmatch(r"\d[\d,]* \d[\d,]*", lines[j][2].strip())):
                    hit = (lines[j][0], lines[j][1], num(m[1]), num(m[2]))
                    break
        if not hit:
            st.review("missing_amount", "Figure not found in the income-tax intimation", {"file": fid, "head": label}, severity="medium")
            continue
        sheet, n, returned, computed = hit
        found[label] = (returned, computed)
        for which, val in (("as returned", returned), ("as computed u/s 143(1)", computed)):
            order += 1
            st.emit("annual_statement_lines", f"{key}:{order:03d}",
                    {"statement_key": key, "side": side, "label": f"{label} ({which})", "amount": val,
                     "cell_ref": f"{sheet} line {n}", "line_order": order}, [src(fid, sheet, n)])
    # the demand block (page 14 / 15)
    demand = {}
    for i, (s, n, t) in enumerate(lines):
        tt = t.strip()
        if tt.startswith("Demand Reference No"):
            for s2, n2, t2 in lines[i + 1:i + 4]:
                m = re.fullmatch(r"\W*(\d[\d,]*)", t2.strip())
                if m:
                    demand["Net amount payable (demand raised)"] = (s2, n2, num(m[1]))
        if tt == "Tax Liability after relief" and i + 1 < len(lines) and re.fullmatch(r"\d[\d,]*", lines[i + 1][2].strip()):
            demand["Tax liability after relief (as computed)"] = (lines[i + 1][0], lines[i + 1][1], num(lines[i + 1][2].strip()))
        if tt.startswith("Total Interest And Fee") and i > 0 and re.fullmatch(r"\d[\d,]*", lines[i - 1][2].strip()):
            demand["Interest and fee payable (as computed)"] = (lines[i - 1][0], lines[i - 1][1], num(lines[i - 1][2].strip()))
    all_lines = pdf_lines(fid)
    tds = next(((s, n, re.match(r"^\(b\) TDS (\d[\d,]*) (\d[\d,]*)$", t.strip())) for s, n, t in all_lines
                if re.match(r"^\(b\) TDS (\d[\d,]*) (\d[\d,]*)$", t.strip())), None)
    if tds:
        demand["Taxes paid: TDS (as computed)"] = (tds[0], tds[1], num(tds[2][2]))
    for label, (s, n, val) in demand.items():
        order += 1
        st.emit("annual_statement_lines", f"{key}:{order:03d}",
                {"statement_key": key, "side": "memo", "label": label, "amount": val, "cell_ref": f"{s} line {n}",
                 "line_order": order}, [src(fid, s, n)])
    return key, order, found, demand


def build_statements(st):
    k1, n1, c1 = tally_statement(st, "F017", 1)
    k2, n2, c2 = tally_statement(st, "F019", 2)

    def val(key, label):
        for r in st.records["annual_statement_lines"].values():
            if r["statement_key"] == key and r["label"] == label:
                return r["amount"]
        return None
    diffs = {lab: (val(k1, lab), val(k2, lab)) for lab in ("Excess of income over expenditure", "INTEREST ON FD",
                                                          "DONATION RECEIVED", "Assets: Investments", "Assets: Bank Accounts")}
    st.review("trustee_decision", "Two versions of the FY 2022-23 accounts; neither is signed",
              {"files": ["F017", "F019"], "differences_v1_v2": diffs,
               "note": "The versions differ in surplus and in how accrued interest, TDS and an SVC bank balance are shown. "
                       "Neither carries an auditor's report, signature or UDIN."}, severity="medium",
              suggested_action="Say which version was filed and supply the signed audit report for FY 2022-23.")
    k3, n3, found, demand = itr_statement(st)
    d = {k: money(v[2]) for k, v in demand.items()}
    first = next(iter(demand.values()), None)
    comp = None
    try:
        comp = (demand["Tax liability after relief (as computed)"][2] + demand["Interest and fee payable (as computed)"][2]
                - demand["Taxes paid: TDS (as computed)"][2])
    except KeyError:
        pass
    st.review("trustee_decision", "Income-tax demand of Rs 5,68,350 for AY 2024-25 (FY 2023-24)",
              {"file": "F118", "sheet": first[0] if first else None, "row": first[1] if first else None, "figures": d,
               "tax_plus_interest_less_tds": money(comp) if comp is not None else None,
               "income_as_returned": money(found.get("Total income", (None, None))[0]) if found.get("Total income") else None,
               "income_as_computed": money(found.get("Total income", (None, None))[1]) if found.get("Total income") else None,
               "reason_printed": "Exemption u/s 11 (18,33,302) not allowed in processing because the audit report in Form 10BB "
                                 "was not e-filed; rectification u/s 154 is mentioned.",
               "note": "The printed components (tax + interest and fee - TDS) do not add up to the demand; the detailed "
                       "computation pages are in Hindi and garbled in the extracted text. Whether the demand was paid, "
                       "rectified or contested is not in the archive."},
              severity="high", table="annual_statements", key=k3,
              suggested_action="Decide whether to record a liability; file Form 10BB / a rectification request if not already done.")
    return {"lines": {"F017": n1, "F019": n2, "F118": n3}, "itr": found, "demand": demand,
            "tally_checks": {"F017": c1, "F019": c2}}


# =====================================================================================
# 6. Review items that belong to no single record
# =====================================================================================

def general_reviews(st, bankrep, fdrep):
    acc = bankrep["accounts"]
    st.review("missing_document", "Password-protected bank PDFs were not opened",
              {"files": LOCKED_PDFS, "count": len(LOCKED_PDFS),
               "note": "Each has a readable copy of the same period (statement PDF or spreadsheet); that they hold the same "
                       "rows is inferred from file names and sizes only."}, severity="low",
              suggested_action="Unlock them, or confirm they can be ignored in favour of the readable copies.")
    st.review("missing_document", "Scanned / photographed financial documents need manual entry",
              {"files": SCANNED_DOCS, "count": len(SCANNED_DOCS),
               "kinds": "invoices, receipts, payment screenshots, a CAMS declaration and one SBI deposit advice (F164)"},
              severity="medium", suggested_action="Read by eye (or OCR) and attach to the matching expense / deposit.")
    # coverage gaps
    gaps = {"saraswat": [("2018-07-19", "2022-04-01", "account opened 19-07-2018; first statement row 02-04-2022")],
            "hdfc": [], "sbi": [], "gpay": []}
    for slug in ("saraswat", "hdfc", "sbi"):
        gaps[slug].append(((acc[slug]["last"] + timedelta(days=1)).isoformat(), ARCHIVE_DATE.isoformat(),
                           "no statement after the last row"))
    g = bankrep["gpay"]
    gaps["gpay"].append(((g["last"] + timedelta(days=1)).isoformat(), ARCHIVE_DATE.isoformat(), "no export after the last row"))
    for slug, lst in gaps.items():
        st.review("missing_document", f"Statement coverage gaps: {slug} account",
                  {"account": slug, "covered_from": (acc[slug]["first"] if slug in acc else g["first"]).isoformat(),
                   "covered_to": (acc[slug]["last"] if slug in acc else g["last"]).isoformat(),
                   "gaps": [{"from": a, "to": b, "note": c} for a, b, c in lst]}, severity="medium",
                  suggested_action="Supply the bank's statements for the missing periods.")
    # rows that come from the trust's paste sheets rather than a bank export
    for slug, led in bankrep["ledgers"].items():
        rows = [r for r in led.rows if r.get("from_paste_sheet")]
        if rows:
            files = sorted({r["file"] for r in rows})
            st.review("missing_document", f"{slug} rows taken from a statement pasted into the trust's workbook",
                      {"account": slug, "files": files, "rows": len(rows), "from": rows[0]["date"].isoformat(),
                       "to": rows[-1]["date"].isoformat(),
                       "note": "No original bank statement for these rows is in the archive; the running balance is continuous."},
                      severity="medium", suggested_action="Replace with the bank's own statement when it is supplied.")
    # text dates in HDFC sheets
    td = bankrep["hdfc_text_dates"]
    st.review("ambiguous_date", "HDFC statement dates are text (dd/mm/yy) and were read day-first",
              {"rows": td, "check": "dates run in order and the running balance is continuous"}, severity="low",
              confidence=0.99)
    st.review("ambiguous_date", "GPay export times are text (dd-mm-yy hh:mm) and were read day-first",
              {"file": "F166", "rows": len(g["rows"]), "first": g["first"].isoformat(), "last": g["last"].isoformat()},
              severity="low", confidence=0.99)
    tb = bankrep["text_balances"]
    st.review("bad_amount", "Saraswat export stores large balances as text",
              {"files": ["F133", "F135"], "text_balance_rows": tb,
               "note": "Balances of 1,00,000 and above are text with Indian commas; they were parsed and the running balance "
                       "is continuous. F135 also stores the account number as a rounded number."}, severity="low")
    # returned cheque in Saraswat (four rows for one movement)
    sar = bankrep["ledgers"]["saraswat"].rows
    for r in sar:
        if (r.get("narration") or "").startswith("RETURNED:"):
            same = [x for x in sar if (x.get("debit") or x.get("credit")) == r["credit"]
                    and abs((x["date"] - r["date"]).days) <= 7]
            st.review("duplicate_transaction", "Returned cheque: several Saraswat rows for one real movement",
                      {"account": "saraswat", "amount": money(r["credit"]),
                       "rows": [{"file": x["file"], "row": x["src"][1], "date": x["date"].isoformat(),
                                 "side": "debit" if x.get("debit") else "credit"} for x in same]}, severity="low",
                      suggested_action="Count the transfer once when reconciling; all rows are imported as the bank printed them.")
    # F084 Tally bank book
    tally_book_review(st, bankrep)
    # F082 vouchers 164-266
    voucher_gap_review(st)
    # vendor TDS sheets
    n120 = sum(1 for n, c in raw_rows("F120", "May 2025") if isinstance(c.get("C"), str) and c.get("F") not in (None, "") and n > 3)
    n121 = sum(1 for n, c in raw_rows("F121", "Sheet1") if isinstance(c.get("B"), str) and n > 3)
    tot = sum((parse_amount(c.get("J"))[0] or ZERO) for n, c in raw_rows("F121", "Sheet1") if isinstance(c.get("B"), str) and n > 3)
    st.skip("F120: vendor TDS working rows (tax the trust deducted from vendors; not deposit TDS)", n120)
    st.skip("F121: vendor TDS working rows (tax the trust deducted from vendors; not deposit TDS)", n121)
    st.review("trustee_decision", "TDS working sheets record tax deducted from vendors, not from deposit interest",
              {"files": ["F120", "F121"], "rows": {"F120": n120, "F121": n121}, "tax_deducted_total": money(tot),
               "month": "May 2025",
               "note": "Not imported as deposit TDS events: these are deductions from two vendor bills (section 194C style, 1%). "
                       "The payments themselves belong to the expense ledger; the schema has no table for TDS payable."},
              severity="medium", suggested_action="Decide where vendor TDS should be recorded (expense rows or a TDS-payable ledger).")


def tally_book_review(st, bankrep):
    rows = raw_rows("F084", "Sheet2")
    v = [(n, c) for n, c in rows if isinstance(c.get("A"), datetime) and c.get("F")]
    types = Counter(clean_text(c["F"]) for _, c in v)
    heads = Counter(clean_text(c.get("C")) for _, c in v)
    rec = sum((parse_amount(c.get("H"))[0] or ZERO) for _, c in v)
    pay = sum((parse_amount(c.get("I"))[0] or ZERO) for _, c in v)
    contra = []
    for n, c in v:
        if clean_text(c["F"]) == "Contra" and "hdfc" in (clean_text(c.get("C")) or "").lower():
            amt = parse_amount(c.get("H"))[0] or parse_amount(c.get("I"))[0]
            twins = [n2 for n2, c2 in v if n2 != n and c2["A"] == c["A"] and
                     (parse_amount(c2.get("H"))[0] or parse_amount(c2.get("I"))[0]) == amt]
            contra.append({"row": n, "date": c["A"].date().isoformat(), "amount": money(amt),
                           "side": "receipt" if c.get("H") else "payment", "also_booked_in_rows": twins})
    fy = bankrep["accounts"]["saraswat"]["per_fy"].get("2025-26", {})
    for sh in ("Sheet1", "Sheet2"):
        st.skip(f"F084/{sh}: Tally bank book rows (not a bank statement; statement F075 is canonical)",
                len(raw_rows("F084", sh)))
    st.review("duplicate_transaction", "Tally bank book double-books transfers between the trust's own accounts",
              {"file": "F084", "sheet": "Sheet2", "vouchers": len(v), "voucher_types": dict(types),
               "book_receipts": money(rec), "book_payments": money(pay),
               "bank_credits_2025_26": money(fy.get("credits")) if fy else None,
               "bank_debits_2025_26": money(fy.get("debits")) if fy else None,
               "contra_rows_with_HDFC": contra,
               "net_double_booked": money(sum((D(x["amount"]) * (1 if x["side"] == "payment" else -1) for x in contra
                                               if x["also_booked_in_rows"]), ZERO))},
              severity="medium", suggested_action="Do not use the Tally book as a source of transactions; remove the duplicate contra entries in Tally.")
    top = heads.most_common(1)[0] if heads else (None, 0)
    st.review("unclassified_head", "Tally bank book carries a default ledger head on most rows",
              {"file": "F084", "sheet": "Sheet2", "vouchers": len(v), "most_common_head": top[0], "rows_with_it": top[1],
               "includes_payment_vouchers": sum(1 for _, c in v if clean_text(c.get("C")) == top[0] and clean_text(c["F"]) == "Payment")},
              severity="medium", suggested_action="Do not use this ledger head as the expense or income classification.")


def voucher_gap_review(st):
    """F082 (docx): vouchers 164-266 are in no spreadsheet voucher sheet.  Count and total only."""
    lines = pdf_lines("F082")
    heads, tables, cur = [], [], None
    for sheet, n, t in lines:
        m = re.match(r"^No:\s*(\d+)\s*/\s*25-26\s+Date:\s*(\S*)", t.strip())
        if m:
            heads.append({"no": int(m[1]), "date": m[2], "sheet": sheet, "row": n})
            continue
        if t.strip().startswith("PARTICULARS |"):
            cur = {"bank": None, "cash": None}
            tables.append(cur)
            continue
        if cur is not None:
            cells = [x.strip() for x in t.split("|")]
            if cells[0].startswith("Bank Payment") and len(cells) > 1:
                cur["bank"] = parse_amount(cells[1])[0]
            elif cells[0].startswith("By Cheque") and len(cells) > 1:
                cur["cash"] = parse_amount(cells[1])[0]
            elif cells[0].startswith("RUPEES") and len(cells) > 1:
                cur["total"] = parse_amount(cells[1])[0]
                cur = None
    if not heads or len(tables) < len(heads):
        st.review("missing_document", "Voucher document F082 could not be parsed for the voucher gap",
                  {"file": "F082", "headers": len(heads), "tables": len(tables)}, severity="medium")
        return
    sel = [(h, tables[i]) for i, h in enumerate(heads) if 164 <= h["no"] <= 266]
    total = sum(((t.get("total") or (t.get("bank") or ZERO) + (t.get("cash") or ZERO)) for _, t in sel), ZERO)
    cash = [t for _, t in sel if t.get("cash")]
    bank = [t for _, t in sel if t.get("bank")]
    st.review("missing_document", "Vouchers 164-266 of FY 2025-26 exist only in the voucher document",
              {"file": "F082", "sheet": sel[0][0]["sheet"] if sel else None, "first_row": sel[0][0]["row"] if sel else None,
               "last_row": sel[-1][0]["row"] if sel else None, "voucher_numbers": "164/25-26 to 266/25-26", "count": len(sel),
               "total": money(total), "paid_in_cash": {"count": len(cash), "total": money(sum((t["cash"] for t in cash), ZERO))},
               "paid_by_bank": {"count": len(bank), "total": money(sum((t["bank"] for t in bank), ZERO))},
               "first_date_as_written": sel[0][0]["date"] if sel else None, "last_date_as_written": sel[-1][0]["date"] if sel else None,
               "all_vouchers_in_document": len(heads),
               "note": "The spreadsheet voucher sheets end on 16-10-2025. These vouchers were NOT emitted as expenses here."},
              severity="high", suggested_action="Enter these vouchers in the expense ledger (owner: ledgers transform) or supply the updated workbook.")


# =====================================================================================
# run
# =====================================================================================

def run():
    for fid in PDF_IDS:
        pdf_to_raw(fid)
    st = Staging("bank")
    bankrep = build_bank(st)
    fdrep = build_fds(st, bankrep)
    invrep = build_investments(st, bankrep)
    budrep = build_budgets(st)
    stmrep = build_statements(st)
    general_reviews(st, bankrep, fdrep)
    summary = st.close()
    run.report = {"bank": bankrep, "fd": fdrep, "inv": invrep, "bud": budrep, "stm": stmrep, "st": st}
    return summary


if __name__ == "__main__":
    utf8_stdout()
    run()
