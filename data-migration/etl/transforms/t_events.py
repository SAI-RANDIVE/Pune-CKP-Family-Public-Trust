"""Events and schemes transform (domain "events", key prefix "evt:").

Produces, under staging/clean/events/:
  event_account_lines     each event's own accounts as its organisers kept them (a SATELLITE
                          ledger: never added into trust-wide income or expenditure)
  budgets, budget_lines   event budgets
  scheme_applications, scheme_disbursements, scheme_repayments
  annual_statements, annual_statement_lines   the cumulative fund-utilisation summary (F200)

It never emits income_entries or expenses. Every printed total found on a sheet is re-added
from the detail rows and compared (see CHECKS); a difference becomes a review item.
"""
import os, sys; sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib import (MAPPINGS, REPORTS, RAW_DIR, Staging, clean_text, fy_of, norm_phones, parse_amount,  # noqa: E402
                 parse_date, raw_rows, raw_sheets, src, utf8_stdout)

import csv  # noqa: E402
import re  # noqa: E402
from collections import Counter, defaultdict  # noqa: E402
from datetime import date, datetime  # noqa: E402
from decimal import Decimal  # noqa: E402

ZERO = Decimal("0.00")

# ---------------------------------------------------------------- pure helpers

ORG_RE = re.compile(
    r"\b(pvt|ltd|llp|trust|society|bank|associates|investments?|mandal|group|sons|foundation|sanstha|"
    r"udyog|enterprises|technologies|solutions|designs|corp|school|agenc(?:y|ies)|devasthan|travels|"
    r"travelers|hotel|foods|lifescience|buildcon|luxuries|investedge|charitable|college|institute|sabha|"
    r"kendra|healing|janmat|variables|gems|bros|mandir|arts|movies|banner|auto)\b|&\s*co\b|auto-mate", re.I)
NOT_PERSON_RE = re.compile(r"\?\?\?|^\s*(ticket sale|pcf members|pcfpt|pune ckp family public trust|office|various|cash)\b|\d", re.I)
TAG_SUFFIX_RE = re.compile(r"\s*[-–]\s*(prust?h?adan|donation|advertisement|adv)\b.*$", re.I)
TO_FROM_RE = re.compile(r"^(to|from)\s+", re.I)


def is_org_name(name):
    """True when a payer/payee name is clearly an organisation, not an individual."""
    return bool(name and ORG_RE.search(name))


def fmt_ref(v):
    """A receipt/voucher/reference cell as text: 358.0 -> '358', ' 184 / 23~24 ' -> '184 / 23~24'."""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    if isinstance(v, (datetime, date)):
        return v.strftime("%Y-%m-%d")
    return clean_text(v)


def strip_to_from(s):
    """'to Satish R Padye' -> 'Satish R Padye' (bank-ledger From/To column)."""
    s = clean_text(s)
    return TO_FROM_RE.sub("", s) if s else None


def person_of(name, role, phone=None, email=None, pan=None, address=None, dob=None):
    """A `person` mention for the resolver, or None when the name is a placeholder, a group
    ('Vilas Mohile +3') or otherwise not one identifiable party. Only non-empty fields are kept."""
    n = clean_text(name)
    if not n or NOT_PERSON_RE.search(n):
        return None
    n = TAG_SUFFIX_RE.sub("", n).strip()
    if not n:
        return None
    p = {"name": n, "role": role}
    phones = norm_phones(phone)
    if phones:
        p["phone"] = phones[0]
    if len(phones) > 1:
        p["phone_alt"] = phones[1]
    for k, v in (("email", clean_text(email)), ("pan", clean_text(pan)), ("address", clean_text(address)), ("dob", dob)):
        if v:
            p[k] = v.isoformat() if isinstance(v, (date, datetime)) else v
    if is_org_name(n):
        p["is_org"] = True
    return p


def classify_gaurav2024(text, direction):
    """Gaurav Sohala 2024 workbook (F053) mixes other activities into the event sheets.
    Returns (side, belongs_to, reason). direction is 'in' or 'out'."""
    t = (text or "").lower()
    if direction == "in":
        if "aadharstambh" in t:
            return "memo", "aadharstambh-2024", "non-event donation (Aadharstambh drive)"
        if "donation - medical" in t:
            return "memo", None, "non-event donation (medical)"
        if "gauravyatra" in t:
            return "memo", "book-pride-of-ckp", "book-sale money, not event income"
        if "3-vasant" in t:
            return "memo", "three-vasant-2024", "belongs to the 3-Vasant concert"
        if "talk show" in t or "talkshow" in t:
            return "memo", "talk-show-2024", "belongs to the talk show"
        return "income", None, None
    if "aarogya shibir" in t:
        return "memo", "mahila-aarogya-shibir-2024", "belongs to the women's health camp"
    if "project diya" in t:
        return "memo", None, "Project Diya payment (scheme), not an event expense"
    if "talkshow" in t or "talk show" in t:
        return "memo", "talk-show-2024", "belongs to the talk show"
    return "expense", None, None


def out_of_sequence(dated, tolerance_days=60):
    """dated = [(row, date)] in sheet order. Rows whose date lies more than `tolerance_days`
    outside the range spanned by the previous and the next dated row (a mistyped year, usually)."""
    out = []
    for i in range(1, len(dated) - 1):
        d, a, b = dated[i][1], dated[i - 1][1], dated[i + 1][1]
        lo, hi = min(a, b), max(a, b)
        if (lo - d).days > tolerance_days or (d - hi).days > tolerance_days:
            out.append(dated[i][0])
    return out


def header_date(header):
    """Date inside a column header such as 'Amount Returned on 26/Sept/22'. None when the
    header names several dates or none."""
    m = re.search(r"on\s+(.+)$", clean_text(header) or "", re.I)
    if not m or "," in m[1]:
        return None
    d, note = parse_date(m[1])
    return d if note == "text" else None


def heads_of(cells, header, cols):
    """Wide participant register: [(head, Decimal)] for the head columns holding a number."""
    out = []
    for col in cols:
        v = cells.get(col)
        if isinstance(v, (int, float)) and not isinstance(v, bool) and v != 0:
            out.append((clean_text(header.get(col)) or col, Decimal(str(v))))
    return out


def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


# ---------------------------------------------------------------- run-time state

class Ctx:
    def __init__(self):
        self.st = Staging("events")
        self.sheet_ids = {}
        with open(REPORTS / "01_sheets.csv", encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                self.sheet_ids[(r["file_id"], r["sheet"])] = r["sheet_id"]
        self.tally = defaultdict(Counter)          # sheet_id -> read / emitted / skipped:<reason> / duplicate
        self.event_tot = defaultdict(lambda: defaultdict(lambda: ZERO))
        self.event_n = Counter()
        self.checks = []
        self.slugs = {"event": self._slugs("events.csv"), "scheme": self._slugs("schemes.csv")}
        self._rows = {}

    @staticmethod
    def _slugs(name):
        with open(MAPPINGS / name, encoding="utf-8-sig") as f:
            return {r["slug"] for r in csv.DictReader(f)}

    def rows(self, fid, sheet):
        if (fid, sheet) not in self._rows:
            self._rows[(fid, sheet)] = raw_rows(fid, sheet)
        return self._rows[(fid, sheet)]

    def sid(self, fid, sheet):
        return self.sheet_ids.get((fid, sheet), f"{fid}[{sheet}]")

    def read(self, fid, sheet, n=1):
        self.tally[self.sid(fid, sheet)]["read"] += n

    def skip(self, fid, sheet, reason, n=1):
        if n:
            self.tally[self.sid(fid, sheet)]["skipped: " + reason] += n
            self.st.skip(f"{self.sid(fid, sheet)}: {reason}", n)

    def dup(self, fid, sheet, n=1):
        self.tally[self.sid(fid, sheet)]["merged as duplicate/enrichment"] += n

    def emit(self, table, key, rec, sources):
        self.st.emit(table, key, rec, sources)
        s = sources[0]
        self.tally[self.sid(s["file"], s["sheet"])]["emitted " + table] += 1
        return key

    def amount(self, v, where):
        """Decimal or None. Text that is not a number (headers, '-', '11K') gives None; the caller
        decides. A value with more than two decimals is rounded half-up AND reported."""
        d, note = parse_amount(v)
        if note and note.startswith("rounded_from"):
            self.st.review("bad_amount", "Amount has more than two decimals", {"cell": where, "as_written": str(v),
                           "used": str(d)}, severity="low", suggested_action="Confirm the amount in paise.")
        return None if note == "unparsed" else d

    def date(self, v, where):
        d, note = parse_date(v)
        if note in ("ambiguous_dmy", "text_month_first", "unparsed"):
            self.st.review("ambiguous_date", "Date could not be read with certainty",
                           {"cell": where, "as_written": str(v), "read_as": str(d), "note": note}, severity="medium",
                           suggested_action="Confirm the date against the voucher or receipt.")
        return d

    def line(self, key, slug, side, amount, sources, line_date=None, head=None, party=None, person=None,
             quantity=None, mode=None, reference=None, notes=None, needs_review=False):
        if slug not in self.slugs["event"]:
            raise ValueError(f"event slug not in mappings/events.csv: {slug}")
        rec = {"event_slug": slug, "side": side, "line_date": line_date, "head_as_written": clean_text(head),
               "party_as_written": clean_text(party), "person": person, "amount": amount, "quantity": quantity,
               "mode_as_written": clean_text(mode), "reference": clean_text(reference),
               "notes": clean_text("; ".join(n for n in notes if n)) if isinstance(notes, list) else clean_text(notes),
               "needs_review": bool(needs_review)}
        self.emit("event_account_lines", "evt:eal:" + key, rec, sources)
        self.event_tot[slug][side] += amount
        self.event_n[slug] += 1
        return "evt:eal:" + key

    def check(self, label, computed, printed, evidence, title=None, severity="high", action=None):
        computed, printed = Decimal(str(computed)), Decimal(str(printed))
        ok = computed == printed
        self.checks.append((label, computed, printed, ok))
        if not ok:
            ev = dict(evidence)
            ev.update({"recomputed": str(computed), "printed": str(printed), "difference": str(printed - computed)})
            self.st.review("total_mismatch", title or f"{label}: printed total differs from the detail rows", ev,
                           severity=severity, suggested_action=action or "Decide which figure is correct.")
        return ok

    def today_cells(self, fid, sheet):
        cells = []
        for rn, c in self.rows(fid, sheet):
            for col, f in (c.get("_f") or {}).items():
                if "TODAY()" in str(f).upper():
                    cells.append(f"{col}{rn}")
        if cells:
            self.st.review("trustee_decision", "Sheet shows today's date by formula, not a fixed date",
                           {"sheet": self.sid(fid, sheet), "cells": cells,
                            "note": "=TODAY() changes every time the file is opened; the stored value is only the day it was last saved"},
                           severity="low", suggested_action="No figure depends on these cells; ignore the dates shown beside the totals.")


def D(v):
    return Decimal(str(v)) if is_num(v) else None


def sum_col(rows, col, lo, hi):
    return sum((Decimal(str(c[col])) for rn, c in rows if lo <= rn <= hi and is_num(c.get(col))), ZERO)


# ---------------------------------------------------------------- Gaurav Sohala 2023 (F027) and 2024 (F053)

def gaurav_inward(cx, fid, slug, blocks, classify=None, alt_amount_col=None):
    """blocks = [(first_row, last_row, printed_total_cell_row, label)]. Returns totals of column G per block."""
    sheet = "Inward Entries"
    rows = cx.rows(fid, sheet)
    sid = cx.sid(fid, sheet)
    bad_pan = []
    for lo, hi, total_row, label in blocks:
        g_sum = ZERO
        for rn, c in rows:
            if not lo <= rn <= hi:
                continue
            g = cx.amount(c.get("G"), f"{sid}!G{rn}") if is_num(c.get("G")) else None
            alt = D(c.get(alt_amount_col)) if alt_amount_col and g is None else None
            if g is None and alt is None:
                if c.get("D") or c.get("E"):
                    cx.read(fid, sheet)
                    cx.skip(fid, sheet, "numbered row with no amount")
                continue
            cx.read(fid, sheet)
            amount = g if g is not None else alt
            if g is not None:
                g_sum += g
            head, party = clean_text(c.get("D")), clean_text(c.get("E"))
            side, belongs, reason = classify(head, "in") if classify else ("income", None, None)
            notes, review = [], False
            if c.get("B") is not None:
                notes.append(f"{'Receipt No.' if label != 'various' else 'Sr No.'} {fmt_ref(c['B'])}")
            if reason:
                notes.append(f"memo: {reason}" + (f" [{belongs}]" if belongs else ""))
            if alt is not None:
                notes.append(f"amount typed in column {alt_amount_col}, outside the printed total of column G")
                review = True
            if is_num(c.get("J")) and fid == "F027":
                notes.append(f"unheaded column J: {fmt_ref(c['J'])}")
            pan = clean_text(c.get("I")) if not is_num(c.get("I")) else None
            if pan and not re.fullmatch(r"[A-Z]{5}\d{4}[A-Z]", pan.upper().replace(" ", "")):
                bad_pan.append({"row": rn, "as_written": pan})
            phone = c.get("J") if fid == "F053" else None
            cx.line(f"{fid}:in:{rn}", slug, side, amount, [src(fid, sheet, rn)], line_date=cx.date(c.get("C"), f"{sid}!C{rn}"),
                    head=head, party=party, person=person_of(party, "donor", phone=phone, pan=pan),
                    mode=c.get("F"), reference=c.get("F"), notes=notes, needs_review=review)
        if total_row:
            printed = dict(rows)[total_row]["G"]
            cx.check(f"{sid} rows {lo}-{hi} ({label}) vs G{total_row}", g_sum, printed, {"sheet": sid, "rows": [lo, hi], "cell": f"G{total_row}"})
    if bad_pan:
        cx.st.review("trustee_decision", "PAN not in the standard format on event receipts",
                     {"sheet": sid, "rows": bad_pan}, severity="low",
                     suggested_action="Correct the PAN from the donor's records; it is imported as written.")
    cx.today_cells(fid, sheet)


def gaurav_outward(cx, fid, slug, bank_cols, cash_cols, total_row, classify=None):
    """bank_cols / cash_cols = (date, voucher or None, narration, amount). Returns (bank, cash) sums as printed columns."""
    sheet = "Outward Entries"
    rows = cx.rows(fid, sheet)
    sid = cx.sid(fid, sheet)
    sums = {"bank": ZERO, "cash": ZERO}
    swapped = []
    for kind, (dc, vc, nc, ac), mode in (("bank", bank_cols, "Cheque / Online Transfer"), ("cash", cash_cols, "Cash")):
        for rn, c in rows:
            if rn < 3 or rn >= total_row or not clean_text(c.get(nc)):
                continue
            cx.read(fid, sheet)
            amount = cx.amount(c.get(ac), f"{sid}!{ac}{rn}") if is_num(c.get(ac)) else None
            narration = clean_text(c.get(nc))
            if amount is None:
                stray = {k: fmt_ref(v) for k, v in c.items() if k not in ("_f", "B", "C", "D", "E") and v is not None} if kind == "cash" else {}
                cx.skip(fid, sheet, "narration with no amount in the amount column")
                cx.st.review("missing_amount", "Cash expense line has no amount",
                             {"sheet": sid, "row": rn, "cells": stray},
                             severity="medium", suggested_action="Confirm whether this was a payment and for how much; it is in no total.")
                continue
            dv, vv = c.get(dc), c.get(vc) if vc else None
            if vc and isinstance(vv, datetime) and not isinstance(dv, datetime):
                dv, vv = vv, dv
                swapped.append(rn)
            sums[kind] += amount
            side, belongs, reason = classify(narration, "out") if classify else ("expense", None, None)
            notes = [f"Voucher No. {fmt_ref(vv)}" if vv is not None else None,
                     f"memo: {reason}" + (f" [{belongs}]" if belongs else "") if reason else None]
            d = cx.date(dv, f"{sid}!{dc}{rn}") if dv is not None else None
            if d is None:
                notes.append("no date on the sheet")
            cx.line(f"{fid}:out{kind[0]}:{rn}", slug, side, amount, [src(fid, sheet, rn)], line_date=d, head=narration,
                    mode=mode, notes=notes, needs_review=d is None)
    tot = dict(rows)[total_row]
    b_col, c_col = bank_cols[3], cash_cols[3]
    cx.check(f"{sid} bank side vs {b_col}{total_row}", sums["bank"], tot[b_col], {"sheet": sid, "cell": f"{b_col}{total_row}"})
    cx.check(f"{sid} cash side vs {c_col}{total_row}", sums["cash"], tot[c_col], {"sheet": sid, "cell": f"{c_col}{total_row}"})
    if swapped:
        cx.st.review("voucher_number_conflict", "Date and voucher number are in each other's columns",
                     {"sheet": sid, "rows": [min(swapped), max(swapped)], "count": len(swapped),
                      "note": "column B holds the voucher number and column C the date on these rows; read accordingly"},
                     severity="low", suggested_action="None needed for the import; correct the workbook if it is still in use.")
    return sums


def pivot_budget(cx, fid, slug, fy, title, total_row):
    """'Expenses incurred': the Budgetted Amount column is the only budget for the event; the paid
    columns are formulas over Outward Entries (derived, not imported)."""
    sheet = "Expenses incurred"
    rows = cx.rows(fid, sheet)
    sid = cx.sid(fid, sheet)
    bkey = f"evt:budget:{slug}:{fid}"
    data = [(rn, c) for rn, c in rows if 3 <= rn < total_row and clean_text(c.get("C"))]
    cx.emit("budgets", bkey, {"fy": fy, "event_slug": slug, "title": title,
                              "heading_as_written": "Various Expenses | Vendor | Budgetted Amount"},
            [src(fid, sheet, 2)])
    tot = ZERO
    for rn, c in data:
        cx.read(fid, sheet)
        b = D(c.get("E"))
        if b is None:
            cx.skip(fid, sheet, "expense head with no budgeted amount")
            continue
        tot += b
        head = clean_text(c["C"]) + (f" ({clean_text(c['D'])})" if clean_text(c.get("D")) else "")
        cx.emit("budget_lines", f"{bkey}:{rn}", {"budget_key": bkey, "kind": "expense", "head_as_written": head, "amount": b},
                [src(fid, sheet, rn)])
    cx.check(f"{sid} budget column vs E{total_row}", tot, dict(rows)[total_row]["E"], {"sheet": sid, "cell": f"E{total_row}"})
    return dict(rows)


def gaurav_2023(cx):
    fid, slug = "F027", "gaurav-sohala-2023"
    gaurav_inward(cx, fid, slug, [(3, 12, 13, "FY 2022-23 block"), (17, 86, 87, "FY 2023-24 block")])
    inw = dict(cx.rows(fid, "Inward Entries"))
    sums = gaurav_outward(cx, fid, slug, ("B", None, "C", "D"), ("F", None, "G", "H"), 55)
    t = cx.event_tot[slug]
    cx.check("F027.S01 grand total G89", t["income"], inw[89]["G"], {"sheet": "F027.S01", "cell": "G89"})
    cx.check("F027.S02 all outward I55", sums["bank"] + sums["cash"], dict(cx.rows(fid, "Outward Entries"))[55]["I"], {"sheet": "F027.S02", "cell": "I55"})
    cx.check("F027.S01 balance after expenses G91", t["income"] - t["expense"], inw[91]["G"], {"sheet": "F027.S01", "cell": "G91"})
    piv = pivot_budget(cx, fid, slug, "2023-24", "Gaurav Sohala 2023: budget by expense head", 25)
    cx.check("F027.S04 heads paid N25 + stall refund N29 vs all outward N27", D(piv[25]["N"]) + D(piv[29]["N"]), piv[27]["N"], {"sheet": "F027.S04"})
    exp = cx.rows(fid, "Expected Entries")
    n = sum(1 for rn, c in exp if is_num(c.get("B")) and (clean_text(c.get("C")) or clean_text(c.get("D"))))
    cx.read(fid, "Expected Entries", n)
    cx.skip(fid, "Expected Entries", "pledge expected, not a transaction", n)
    q = [rn for rn, c in cx.rows(fid, "Sheet1") if is_num(c.get("F"))]
    cx.read(fid, "Sheet1", len(q))
    cx.skip(fid, "Sheet1", "vendor quotation, not a transaction", len(q))


def gaurav_2024(cx):
    fid, slug = "F053", "gaurav-sohala-2024"
    gaurav_inward(cx, fid, slug, [(3, 47, 49, "FY 2023-24 block"), (53, 83, 84, "FY 2024-25 block"), (89, 97, 98, "various")],
                  classify=classify_gaurav2024, alt_amount_col="I")
    inw = dict(cx.rows(fid, "Inward Entries"))
    sums = gaurav_outward(cx, fid, slug, ("B", "C", "D", "E"), ("G", "H", "I", "J"), 50, classify=classify_gaurav2024)
    out = dict(cx.rows(fid, "Outward Entries"))
    col_g = D(inw[49]["G"]) + D(inw[84]["G"]) + D(inw[98]["G"])
    cx.check("F053.S01 grand total G86", col_g, inw[86]["G"], {"sheet": "F053.S01", "cell": "G86"})
    cx.check("F053.S02 all outward K50", sums["bank"] + sums["cash"], out[50]["K"], {"sheet": "F053.S02", "cell": "K50"})
    cx.check("F053.S01 balance G101 (as printed: all of column G less all outward)", col_g - sums["bank"] - sums["cash"], inw[101]["G"], {"sheet": "F053.S01", "cell": "G101"})
    # mismatch 2: two collections typed in column I are outside G98
    with_i = sum((D(c.get("G")) or D(c.get("I")) or ZERO for rn, c in inw.items() if 89 <= rn <= 97), ZERO)
    cx.check("F053.S01 'Various Collections' incl. amounts typed in column I vs G98", with_i, inw[98]["G"],
             {"sheet": "F053.S01", "cell": "G98", "rows_outside_total": {"92": str(inw[92].get("I")), "93": str(inw[93].get("I"))},
              "effect": "grand total G86 would be 450343 instead of 424643 and the printed deficit -121550.37 instead of -147250.37"},
             title="Gaurav 2024: two collections are typed outside the totalled column",
             action="Confirm whether 12,100 (3-Vasant tickets) and 13,600 (bus contribution) were received; both are imported and flagged.")
    piv = pivot_budget(cx, fid, slug, "2024-25", "Gaurav Sohala 2024: budget by expense head (accounts workbook)", 22)
    cx.check("F053.S04 heads paid N22 vs all outward N24", piv[22]["N"], piv[24]["N"],
             {"sheet": "F053.S04", "cells": ["N22", "N24", "N26"], "unallocated_printed_N26": str(piv[26]["N"]),
              "label_beside_it": clean_text(piv[26].get("C")),
              "note": "the label names one 60,000 advance; the other 66,017 is not explained on the sheet"},
             title="Gaurav 2024: expense heads do not account for all payments",
             action="Say which heads the unallocated 126,017 belongs to.")
    cx.st.review("conflicting_sources", "Gaurav 2024: talk-show speaker payment differs between two sheets",
                 {"F053.S04!G9": str(piv[9].get("G")), "F053.S02!J3": str(out[3].get("J")), "F053.S02!J5": str(out[5].get("J")),
                  "note": "the pivot shows 35,000 paid; the cash ledger shows 30,000 and 45,000"}, severity="medium",
                 suggested_action="Confirm what was paid to the speaker and when.")
    cx.st.review("trustee_decision", "Gaurav 2024 workbook mixes other activities into the event accounts",
                 {"sheet": ["F053.S01", "F053.S02"],
                  "memo_lines_total": str(cx.event_tot[slug]["memo"]), "event_income": str(cx.event_tot[slug]["income"]),
                  "event_expense": str(cx.event_tot[slug]["expense"]),
                  "printed_collection_G86": str(inw[86]["G"]), "printed_expenses_K50": str(out[50]["K"]), "printed_balance_G101": str(inw[101]["G"]),
                  "memo_items": "Aadharstambh and medical donations (159,502), book-sale transfer 25,000, 3-Vasant 47,100, talk show 37,300 in / 75,000 out, health camp 930, Project Diya 11,000",
                  "header_slip": "F053.S02!D2 still reads 'Expenses for Gaurav 2023'"},
                 severity="high", suggested_action="Confirm that these rows should stay out of the Gaurav 2024 result; they are imported as memo lines.")
    # unreproducible figures
    cx.st.review("total_mismatch", "Gaurav 2024: 178,000 added to the collection with no source",
                 {"cell": "F053.S01!J86", "printed": str(inw[86].get("J")), "formula": (inw[86].get("_f") or {}).get("J"),
                  "base_I86": str(inw[86].get("I")), "note": "178,000 is typed inside the formula; no row or sheet explains it"},
                 severity="medium", suggested_action="Say what the 178,000 is, or disregard cell J86.")
    exp = dict(cx.rows(fid, "Expected Entries"))
    pr = sum((D(c["G"]) for rn, c in inw.items() if is_num(c.get("G")) and "prushthadaan" in str(c.get("D")).lower()), ZERO)
    cx.st.review("total_mismatch", "Gaurav 2024: 'Prushthadaan Collection' figure cannot be reproduced",
                 {"cell": "F053.S03!G8", "printed": str(exp[8].get("G")), "recomputed_from_F053.S01_rows": str(pr),
                  "side_cell_F053.S01!I50": str(inw[50].get("I"))}, severity="low",
                 suggested_action="Typed figure on a planning sheet; the receipt rows are what is imported.")
    n = sum(1 for rn, c in exp.items() if is_num(c.get("B")) and (clean_text(c.get("C")) or clean_text(c.get("D"))))
    cx.read(fid, "Expected Entries", n)
    cx.skip(fid, "Expected Entries", "pledge expected, not a transaction", n)
    s5 = [rn for rn, c in cx.rows(fid, "Sheet1") if 4 <= rn <= 8]
    cx.read(fid, "Sheet1", len(s5))
    cx.skip(fid, "Sheet1", "unlabelled medical claim table, no link to an event or scheme", len(s5))
    s5d = dict(cx.rows(fid, "Sheet1"))
    cx.st.review("trustee_decision", "Unlabelled medical claim table inside the Gaurav 2024 workbook",
                 {"sheet": "F053.S05", "rows": [4, 8], "claims_C12": str(s5d[12].get("C")), "reimbursed_D12": str(s5d[12].get("D"))},
                 severity="low", suggested_action="Say whose claims these are and whether they belong in the trust's books; not imported.")


def gaurav_2024_budget(cx):
    fid, sheet, slug = "F051", " Budget 24", "gaurav-sohala-2024"
    rows = cx.rows(fid, sheet)
    sid = cx.sid(fid, sheet)
    d = dict(rows)
    bkey = f"evt:budget:{slug}:{fid}"
    cx.emit("budgets", bkey, {"fy": "2024-25", "event_slug": slug, "title": "Gaurav Sohala 2024: budget",
                              "heading_as_written": clean_text(f"{d[2].get('A')} | {d[3].get('A')}")}, [src(fid, sheet, 2)])
    section, sub, sec_sum, total, odd = None, None, ZERO, ZERO, []
    for rn, c in rows:
        if rn < 5 or rn > 70:
            continue
        b, e, f = clean_text(c.get("B")), c.get("E"), c.get("F")
        if is_num(f) and b and b.lower().startswith("total"):
            cx.check(f"{sid} section '{section}' vs F{rn}", sec_sum, f, {"sheet": sid, "cell": f"F{rn}"})
            sec_sum, sub = ZERO, None
            continue
        if isinstance(c.get("A"), str) and b and not is_num(e):
            section, sub = b, None
            continue
        if not b:
            continue
        if not is_num(e):
            if not b.startswith("*"):
                sub = b
            continue
        cx.read(fid, sheet)
        amount = D(e)
        head = " / ".join(x for x in (section, sub, b) if x)
        sub = None
        if section != "Auditorium" and is_num(c.get("C")) and is_num(c.get("D")) and D(c["C"]) * D(c["D"]) != amount:
            odd.append({"row": rn, "rate": str(c["C"]), "number": str(c["D"]), "net_cost": str(e)})
        cx.emit("budget_lines", f"{bkey}:{rn}", {"budget_key": bkey, "kind": "expense", "head_as_written": head, "amount": amount},
                [src(fid, sheet, rn)])
        sec_sum += amount
        total += amount
    cx.check(f"{sid} grand total F73", total, d[73]["F"], {"sheet": sid, "cell": "F73"})
    if odd:
        cx.st.review("bad_amount", "Gaurav 2024 budget: rate x number does not equal the net cost",
                     {"sheet": sid, "rows": odd}, severity="low", suggested_action="Budget only; the net cost as written is imported.")
    other = None
    if (RAW_DIR / "F043.jsonl").exists():
        o = dict(raw_rows("F043", " Budget 24"))
        other = str(o.get(73, {}).get("F"))
    cx.st.review("conflicting_sources", "Two versions of the Gaurav 2024 budget",
                 {"imported": {"sheet": sid, "grand_total_F73": str(d[73]["F"]), "awardees": str(d[18].get("D"))},
                  "other_version": {"file": "F043", "sheet": " Budget 24", "grand_total_F73": other},
                  "third_budget": "the accounts workbook F053.S04 budgets 650,000 by expense head (also imported, as a separate budget)"},
                 severity="low", suggested_action="Confirm which budget was approved.")
    for sh, reason in (("Nomination", "award nominee list (name list, no money)"), ("Sheet1", "award nominee list (name list, no money)"),
                       ("Sheet3", "candidate name list (no money)"), ("Sponcer Rate 2023", "sponsorship rate card")):
        n = len([1 for rn, c in cx.rows(fid, sh)])
        cx.read(fid, sh, n)
        cx.skip(fid, sh, reason, n)


# ---------------------------------------------------------------- Ek Divas Kayastha 2024 (F042)

def edk_2024(cx):
    fid, slug, sheet = "F042", "ek-divas-kayastha-2024", "Main Data Base"
    rows = cx.rows(fid, sheet)
    sid = cx.sid(fid, sheet)
    d = dict(rows)
    header = d[1]
    head_cols = ["G", "H", "J", "K", "L", "M", "N", "O", "P", "Q"]
    refunds = cx.rows(fid, "Bus Payment Return")
    head_sum, dated = ZERO, []
    for rn, c in rows:
        if not (2 <= rn <= 188 or 193 <= rn <= 197) or not clean_text(c.get("C")):
            continue
        cx.read(fid, sheet)
        total = D(c.get("R"))
        if not total:
            cx.skip(fid, sheet, "participant row with zero amount (cancelled)")
            continue
        heads = heads_of(c, header, head_cols)
        hs = sum((a for _, a in heads), ZERO)
        head_sum += hs
        dt = cx.date(c.get("B"), f"{sid}!B{rn}")
        if dt and dt <= date(2024, 12, 31):
            dated.append((rn, dt))
        notes = [f"Receipt No {fmt_ref(c.get('D'))}" if c.get("D") is not None else None,
                 f"Area: {clean_text(c.get('F'))}" if c.get("F") else None,
                 "half ticket block" if rn >= 193 else None,
                 f"Bus Return: {fmt_ref(c.get('T'))}" if c.get("T") is not None else None]
        review = hs != total
        if review:
            notes.append("Total typed with no head column")
        if dt and dt > date(2024, 12, 31):
            review = True
            notes.append("date is a year after the event (8 Dec 2024)")
            cx.st.review("date_outside_fy", "EDK 2024: receipt dated a year after the event",
                         {"sheet": sid, "row": rn, "date": str(dt), "amount": str(total), "receipt_no": fmt_ref(c.get("D"))},
                         severity="medium", suggested_action="Probably 23 Dec 2024; confirm the date and what the 5,000 was for.")
        cx.line(f"{fid}:reg:{rn}", slug, "income", total, [src(fid, sheet, rn)], line_date=dt,
                head="; ".join(f"{h} {a:f}" for h, a in heads) or None, party=c.get("C"),
                person=person_of(c.get("C"), "donor", phone=c.get("E")), mode=c.get("S"), reference=fmt_ref(c.get("I")),
                notes=notes, needs_review=review)
    t = cx.event_tot[slug]
    cx.check(f"{sid} participant totals vs R200", t["income"], d[200]["R"], {"sheet": sid, "cell": "R200"})
    cx.check(f"{sid} sum of the head columns vs printed total R200", head_sum, d[200]["R"],
             {"sheet": sid, "cell": "R200", "cause_row": 187, "cause": "row 187 has Total 5,000 typed with no head column, no mode, no mobile"},
             title="EDK 2024: total exceeds the sum of its head columns",
             action="Say which head the 5,000 on row 187 belongs to.")
    # accounts
    sheet = "Accounts"
    rows = cx.rows(fid, sheet)
    sid = cx.sid(fid, sheet)
    for rn, c in rows:
        if not 3 <= rn <= 20 or not is_num(c.get("E")):
            continue
        cx.read(fid, sheet)
        amount = D(c["E"])
        is_handover = "transferred the balance" in str(c.get("I")).lower()
        notes = [f"Voucher No {fmt_ref(c.get('C'))}" if c.get("C") else None,
                 f"payment date {fmt_ref(c.get('F'))}" if c.get("F") else None,
                 "surplus handed to another body, not an expense of the event in the usual sense" if is_handover else None]
        sources = [src(fid, sheet, rn)]
        if "bus amount return" in str(c.get("B")).lower():
            sources += [src(fid, "Bus Payment Return", r, "enrichment") for r, rc in refunds if r >= 2 and is_num(rc.get("K"))]
            n = len(sources) - 1
            cx.read(fid, "Bus Payment Return", n)
            cx.dup(fid, "Bus Payment Return", n)
            cx.check("F042.S02 per-person refunds vs Accounts refund line", sum_col(refunds, "K", 2, 999), amount, {"sheet": "F042.S02"})
        party = clean_text(c.get("B"))
        cx.line(f"{fid}:acc:{rn}", slug, "expense", amount, sources, line_date=cx.date(c.get("D"), f"{sid}!D{rn}"),
                head=c.get("I"), party=party, person=None if "return" in party.lower() else person_of(strip_to_from(party.rstrip("; ")), "vendor"),
                mode=c.get("G") or c.get("H"), reference=c.get("H") if clean_text(c.get("H")) not in (None, "Cash") else None,
                notes=notes, needs_review=is_handover)
    d = dict(rows)
    cx.check(f"{sid} expenses vs E21", t["expense"], d[21]["E"], {"sheet": sid, "cell": "E21"})
    cx.check(f"{sid} balance E25", t["income"] - t["expense"], d[25]["E"], {"sheet": sid, "cell": "E25"})
    bad = out_of_sequence(dated)
    if bad:
        cx.st.review("ambiguous_date", "EDK 2024: receipt dates out of sequence", {"sheet": "F042.S01", "rows": bad},
                     severity="low", suggested_action="Check the year on these rows.")


# ---------------------------------------------------------------- Ek Divas Kayasthancha 2025 (F095)

def edk_2025(cx):
    fid, slug = "F095", "ek-divas-kayasthancha-2025"
    # --- inward
    sheet = "Inward Entries"
    rows = cx.rows(fid, sheet)
    sid = cx.sid(fid, sheet)
    block_i, tot_i, tot_j, subtotals, date_in_text = ZERO, ZERO, ZERO, {}, []
    block = "Donations"
    for rn, c in rows:
        if rn < 3:
            continue
        if not is_num(c.get("A")):
            label = clean_text(c.get("B"))
            if label and is_num(c.get("I")) and not is_num(c.get("J")):
                subtotals[label] = D(c["I"])
                cx.check(f"{sid} '{label}' I{rn}", block_i, c["I"], {"sheet": sid, "cell": f"I{rn}"})
                block_i = ZERO
            elif label and label.startswith("Other Collections"):
                block = "Other Collections"
            elif is_num(c.get("I")) and is_num(c.get("J")):
                cx.check(f"{sid} online total I{rn}", tot_i, c["I"], {"sheet": sid, "cell": f"I{rn}"})
                cx.check(f"{sid} cash total J{rn}", tot_j, c["J"], {"sheet": sid, "cell": f"J{rn}"})
            continue
        cx.read(fid, sheet)
        online, cash = D(c.get("I")), D(c.get("J"))
        if online is None and cash is None:
            cx.skip(fid, sheet, "cancelled entry" if "CANCELLED" in str(c.get("E")) else "numbered row with no amount")
            continue
        block_i += online or ZERO
        tot_i += online or ZERO
        tot_j += cash or ZERO
        desc = c.get("L")
        notes = [f"Receipt No. {fmt_ref(c.get('H'))}" if c.get("H") else "no receipt number", f"block: {block}"]
        if isinstance(desc, datetime):
            date_in_text.append(rn)
            desc = desc.strftime("%Y-%m-%d")
            notes.append("the Description cell holds a date (the day of participation)")
        head = " / ".join(x for x in (clean_text(desc), clean_text(c.get("N"))) if x) or None
        pan = clean_text(c.get("E"))
        for kind, amount in (("o", online), ("c", cash)):
            if amount is None:
                continue
            cx.line(f"{fid}:in:{rn}" + ("" if (online is None) != (cash is None) else kind), slug, "income", amount,
                    [src(fid, sheet, rn)], line_date=cx.date(c.get("B"), f"{sid}!B{rn}"), head=head, party=c.get("C"),
                    person=person_of(c.get("C"), "donor", phone=c.get("F"), email=c.get("G"), pan=pan, address=c.get("D")),
                    mode="Cash" if kind == "c" else c.get("K"), reference=None if kind == "c" else c.get("K"), notes=notes)
    if date_in_text:
        cx.st.review("trustee_decision", "EDK 2025: purpose column holds a date on some rows",
                     {"sheet": sid, "rows": len(date_in_text), "first_last": [date_in_text[0], date_in_text[-1]],
                      "note": "the date is the day the participant paid for (28 or 29 Nov); kept as text in the head"},
                     severity="low", suggested_action="None needed; shown as written.")
    # --- bank
    sheet = "HDFC ACCOUNT"
    rows = cx.rows(fid, sheet)
    sid = cx.sid(fid, sheet)
    d = dict(rows)
    returned = {clean_text(c.get("F")) for rn, c in rows if "returned" in str(c.get("D")).lower()}
    credits = debits = bank_exp = ZERO
    bank_memo = {}
    for rn, c in rows:
        if not 3 <= rn <= 51:
            continue
        cr, dr = D(c.get("G")), D(c.get("H"))
        if cr is None and dr is None:
            continue
        cx.read(fid, sheet)
        remark = clean_text(c.get("D")) or ""
        low = remark.lower()
        if rn >= 7:
            credits += cr or ZERO
            debits += dr or ZERO
        dt = cx.date(c.get("C"), f"{sid}!C{rn}") if isinstance(c.get("C"), datetime) else None
        party = strip_to_from(c.get("E"))
        voucher = f"Voucher No. {fmt_ref(c.get('B'))}" if c.get("B") else None
        common = dict(line_date=dt, head=remark, party=party, mode="HDFC account", reference=c.get("F"))
        if c.get("C") == "Various":
            if low.startswith("other collections"):
                want = next((v for k, v in subtotals.items() if k.startswith("Other Collections")), None)
            else:
                month = next((full for m, full in (("aug", "August"), ("sept", "September"), ("oct", "October"), ("nov", "November"),
                                                   ("dec", "December")) if f"in {m}" in low), "?")
                want = next((v for k, v in subtotals.items() if month in k), None)
            cx.check(f"{sid} row {rn} '{remark}' vs Inward subtotal", cr, want if want is not None else -1, {"sheet": sid, "row": rn})
            cx.skip(fid, sheet, "monthly summary of Inward Entries rows (imported row by row from Inward Entries)")
            if "2026" in remark:
                cx.st.review("trustee_decision", "EDK 2025: bank ledger label says December 2026",
                             {"sheet": sid, "row": rn, "label": remark, "amount": str(cr)}, severity="low",
                             suggested_action="Label slip for December 2025; no figure affected.")
            continue
        if rn < 7:
            cx.line(f"{fid}:bank:{rn}", slug, "memo", cr, [src(fid, sheet, rn)], notes=[voucher, "opening line, outside the sheet's totals"], **common)
        elif "fd for" in low or "auto_redeem" in low:
            cx.line(f"{fid}:bank:{rn}", slug, "memo", cr or dr, [src(fid, sheet, rn)],
                    notes=[voucher, "fixed deposit placed from the event account" if dr else "fixed deposit redeemed with interest"], **common)
        elif "cash withdrawal" in low:
            bank_memo[(dt, dr)] = cx.line(f"{fid}:bank:{rn}", slug, "memo", dr, [src(fid, sheet, rn)],
                                          notes=[voucher, "cash withdrawn from the event bank account into the event cash book"], **common)
        elif clean_text(c.get("F")) in returned:
            cx.line(f"{fid}:bank:{rn}", slug, "memo", cr or dr, [src(fid, sheet, rn)],
                    notes=[voucher, "transfer returned by the bank (wrong account number); debit and credit cancel"], **common)
        elif dr is not None:
            bank_exp += dr
            cx.line(f"{fid}:bank:{rn}", slug, "expense", dr, [src(fid, sheet, rn)], person=person_of(party, "vendor"), notes=voucher, **common)
        else:
            cx.line(f"{fid}:bank:{rn}", slug, "income", cr, [src(fid, sheet, rn)], notes=voucher, needs_review=True, **common)
    cx.check(f"{sid} credits G52", credits, d[52]["G"], {"sheet": sid, "cell": "G52"})
    cx.check(f"{sid} debits H52", debits, d[52]["H"], {"sheet": sid, "cell": "H52"})
    cx.check(f"{sid} expenses excl. cash withdrawals H56", bank_exp, d[56]["H"], {"sheet": sid, "cell": "H56"})
    cx.check(f"{sid} collection G56 vs Inward online total", tot_i, d[56]["G"], {"sheet": sid, "cell": "G56"})
    cx.read(fid, sheet)
    cx.line(f"{fid}:bank:54", slug, "income", D(d[54]["G"]), [src(fid, sheet, 54), src(fid, sheet, 17, "enrichment"), src(fid, sheet, 18, "enrichment")],
            head="Interest earned", mode="HDFC account", notes="interest on the two short fixed deposits (79,460 + 11,061 redeemed against 79,000 + 11,000 placed); summary cell, no date")
    # --- cash book, version A
    sheet = "Cash Account"
    rows = cx.rows(fid, sheet)
    sid = cx.sid(fid, sheet)
    da = dict(rows)
    cash_in = cash_out = ZERO
    a_lines, occ_a, occ_b = {}, Counter(), Counter()
    for rn, c in rows:
        if not 3 <= rn <= 26:
            continue
        cr, dr = D(c.get("G")), D(c.get("H"))
        if cr is None and dr is None:
            continue
        cx.read(fid, sheet)
        cash_in += cr or ZERO
        cash_out += dr or ZERO
        remark = clean_text(c.get("D")) or ""
        occ_a[(remark, clean_text(c.get("E")))] += 1
        a_lines[(remark, clean_text(c.get("E")), occ_a[(remark, clean_text(c.get("E")))])] = (rn, cr or dr)
        dt = cx.date(c.get("C"), f"{sid}!C{rn}") if isinstance(c.get("C"), datetime) else None
        if c.get("C") == "Various":
            cx.check(f"{sid} row {rn} cash donations vs Inward cash total", cr, tot_j, {"sheet": sid, "row": rn})
            cx.skip(fid, sheet, "summary of the cash rows of Inward Entries (imported row by row)")
            continue
        if "cash withdrawal" in remark.lower():
            k = bank_memo.get((dt, cr))
            if k:
                cx.st.add_source("event_account_lines", k, src(fid, sheet, rn, "duplicate"))
                cx.dup(fid, sheet)
            else:
                cx.skip(fid, sheet, "cash withdrawal with no matching bank row")
            continue
        notes = ["cash book version A"]
        if dt is None:
            notes.append("no date on the sheet")
        if cr is not None:
            cx.line(f"{fid}:cash:{rn}", slug, "income", cr, [src(fid, sheet, rn)], line_date=dt, head=remark, party=c.get("E"),
                    mode="Cash", notes=notes, needs_review=dt is None)
        else:
            party = clean_text(c.get("E"))
            cx.line(f"{fid}:cash:{rn}", slug, "expense", dr, [src(fid, sheet, rn)], line_date=dt, head=remark, party=party,
                    person=person_of(party, "vendor"), mode="Cash", notes=notes)
    undated = [rn for rn, c in rows if 6 <= rn <= 11 and not isinstance(c.get("C"), datetime)]
    cx.st.review("missing_date", "EDK 2025: cash receipts with no date", {"sheet": sid, "rows": undated,
                 "note": "version B of the cash book dates the same receipts 29 Nov 2025"}, severity="low",
                 suggested_action="Confirm 29 Nov 2025 for these rows.")
    cx.check(f"{sid} credits G30", cash_in, da[30]["G"], {"sheet": sid, "cell": "G30"})
    cx.check(f"{sid} debits H30", cash_out, da[30]["H"], {"sheet": sid, "cell": "H30"})
    cx.check(f"{sid} cash in hand I30", cash_in - cash_out, da[30]["I"], {"sheet": sid, "cell": "I30"})
    t = cx.event_tot[slug]
    interest = D(d[54]["G"])
    cx.check(f"{sid} collection G37 (+ interest)", t["income"], D(da[37]["G"]) + interest, {"sheet": sid, "cell": "G37", "interest_F095.S01!G54": str(interest)})
    cx.check(f"{sid} expenses H37", t["expense"], da[37]["H"], {"sheet": sid, "cell": "H37"})
    cx.check(f"{sid} total remaining E35", t["income"] - t["expense"], da[35]["E"], {"sheet": sid, "cell": "E35"})
    # --- cash book, version B: not imported, attached to a review item
    sheet_b = "Cash Account (2)"
    rows_b = cx.rows(fid, sheet_b)
    db = dict(rows_b)
    b_lines, nb = {}, 0
    for rn, c in rows_b:
        if 3 <= rn <= 26 and (is_num(c.get("G")) or is_num(c.get("H"))):
            nb += 1
            kb = (clean_text(c.get("D")), clean_text(c.get("E")))
            occ_b[kb] += 1
            b_lines[kb + (occ_b[kb],)] = (rn, D(c.get("G")) or D(c.get("H")))
    cx.read(fid, sheet_b, nb)
    cx.skip(fid, sheet_b, "alternate version B of the cash book (version A imported; both in a review item)", nb)
    diffs = []
    for k in sorted(set(a_lines) | set(b_lines), key=lambda x: str(x)):
        a, b = a_lines.get(k), b_lines.get(k)
        if (a and a[1]) != (b and b[1]):
            diffs.append({"line": k[0], "version_A": {"row": a[0], "amount": str(a[1])} if a else None,
                          "version_B": {"row": b[0], "amount": str(b[1])} if b else None})
    bank_bal = D(d[52]["I"])
    cx.st.review("conflicting_sources", "EDK 2025: two different cash books for the same event",
                 {"version_A": {"sheet": sid, "credits_G30": str(da[30]["G"]), "debits_H30": str(da[30]["H"]), "closing_cash_I30": str(da[30]["I"]),
                                "surplus_with_bank_balance_E35": str(da[35]["E"])},
                  "version_B": {"sheet": cx.sid(fid, sheet_b), "credits_G29": str(db[29]["G"]), "debits_H29": str(db[29]["H"]),
                                "closing_cash_F32": str(db[32]["F"]), "printed_total_F35": str(db[35]["F"]),
                                "surplus_bank_plus_cash": str(bank_bal + D(db[32]["F"]))},
                  "bank_balance_F095.S01!I52": str(bank_bal), "differences": diffs, "imported": "version A"},
                 severity="high", suggested_action="Say which cash book is the true record; the event surplus is about 39,125 (A) or 3,213 (B).")
    # --- budget
    sheet = "Budgeting"
    rows = cx.rows(fid, sheet)
    sid = cx.sid(fid, sheet)
    dbud = dict(rows)
    bkey = f"evt:budget:{slug}:{fid}"
    cx.emit("budgets", bkey, {"fy": "2025-26", "event_slug": slug, "title": "Ek Divas Kayasthancha 2025: budget",
                              "heading_as_written": "Sr No | Heading | Budgeted | Paid | Balance"}, [src(fid, sheet, 2)])
    tot = ZERO
    for rn, c in rows:
        if 3 <= rn <= 18 and clean_text(c.get("C")):
            cx.read(fid, sheet)
            b = D(c.get("D"))
            tot += b
            cx.emit("budget_lines", f"{bkey}:{rn}", {"budget_key": bkey, "kind": "expense", "head_as_written": clean_text(c["C"]), "amount": b},
                    [src(fid, sheet, rn)])
    cx.check(f"{sid} budgeted D19", tot, dbud[19]["D"], {"sheet": sid, "cell": "D19"})
    cx.st.review("trustee_decision", "EDK 2025 budget: 'Paid' column was not kept up to date",
                 {"sheet": sid, "budgeted_D19": str(dbud[19]["D"]), "paid_E19": str(dbud[19]["E"]), "actual_expenses_imported": str(t["expense"])},
                 severity="low", suggested_action="Only the budgeted amounts are imported; the paid column is ignored.")


# ---------------------------------------------------------------- Sahitya Sammelan 2022 (F201)

def sahitya_2022(cx):
    fid, slug, sheet = "F201", "sahitya-sammelan-2022", "Total Collection"
    rows = cx.rows(fid, sheet)
    sid = cx.sid(fid, sheet)
    d = dict(rows)
    index, cash_rows, partner_acc = {}, ZERO, ZERO
    for rn, c in rows:
        if not 8 <= rn <= 55 or not is_num(c.get("F")):
            continue
        cx.read(fid, sheet)
        amount = D(c["F"])
        dt = cx.date(c.get("C"), f"{sid}!C{rn}")
        acc = clean_text(c.get("I"))
        if acc == "ABCKP":
            partner_acc += amount
        notes = [f"Receipt No {fmt_ref(c.get('B'))}" if c.get("B") is not None else "no receipt number",
                 f"paid into the account of: {acc}" if acc else "receiving account not stated"]
        name = clean_text(c.get("D"))
        key = cx.line(f"{fid}:coll:{rn}", slug, "income", amount, [src(fid, sheet, rn)], line_date=dt, head=c.get("J"), party=name,
                      person=person_of(name, "donor", phone=c.get("E")), mode=c.get("G"),
                      reference=c.get("H") if clean_text(c.get("H")) not in ("- - -", "---") else None, notes=notes,
                      needs_review=name == "???")
        index[(dt, amount, re.sub(r"\W", "", str(c.get("H") or "")).lower())] = key
    coll = cx.event_tot[slug]["income"]
    cx.check(f"{sid} vs F56", coll, d[56]["F"], {"sheet": sid, "cell": "F56"})
    # subset sheets: attach as duplicates
    for sh, amt_col, ref_col, last in (("Advertisment & Sponsorship", "E", "G", 28), ("Online Ticket Sale", "F", "H", 37)):
        for rn, c in cx.rows(fid, sh):
            if not 8 <= rn <= last or not is_num(c.get(amt_col)):
                continue
            cx.read(fid, sh)
            k = index.get((parse_date(c.get("C"))[0], D(c[amt_col]), re.sub(r"\W", "", str(c.get(ref_col) or "")).lower()))
            if k:
                cx.st.add_source("event_account_lines", k, src(fid, sh, rn, "duplicate"))
                cx.dup(fid, sh)
            else:
                cx.skip(fid, sh, "row of a subset sheet not matched to Total Collection")
    # final settlement sheet
    sheet8 = "Credit Debit Sheet"
    rows8 = cx.rows(fid, sheet8)
    sid8 = cx.sid(fid, sheet8)
    d8 = dict(rows8)
    work = {}                                  # dates from the working cash/cheque book
    for rn, c in cx.rows(fid, "Sahitya Sammelan"):
        if isinstance(c.get("E"), datetime) and is_num(c.get("G")):
            work[(clean_text(c.get("F")), D(c["G"]))] = (rn, c["E"].date(), clean_text(c.get("H")))
    summary_credit, debit_sum, credit_sum, matched = ZERO, ZERO, ZERO, 0
    for rn, c in rows8:
        if not 3 <= rn <= 25 or not clean_text(c.get("C")):
            continue
        cx.read(fid, sheet8)
        remark = clean_text(c["C"])
        cr, dr = D(c.get("D")), D(c.get("E"))
        credit_sum += cr or ZERO
        debit_sum += dr or ZERO
        low = remark.lower()
        if dr is not None:
            hit = next(((k, v) for k, v in work.items() if k[1] == dr and remark.startswith(k[0])), None)
            sources = [src(fid, sheet8, rn)]
            if hit:
                sources.append(src(fid, "Sahitya Sammelan", hit[1][0], "enrichment"))
                cx.dup(fid, "Sahitya Sammelan")
                matched += 1
            cx.line(f"{fid}:cd:{rn}", slug, "expense", dr, sources, line_date=hit[1][1] if hit else None, head=remark,
                    mode="Cash" if low.endswith("cash") else ("Cheque" if "chq" in low else None),
                    notes=["final settlement sheet", "date taken from the working cash/cheque book" if hit else "no date on any sheet"],
                    needs_review=not hit)
        elif "shilpa ticket" in low:
            cx.line(f"{fid}:cd:{rn}", slug, "income", cr, [src(fid, sheet8, rn)], head=remark, mode="Cash",
                    notes="ticket cash collected for the partner body and credited to the trust; not in Total Collection; no date",
                    needs_review=True)
        elif "deficit" in low or "received from" in low:
            cx.line(f"{fid}:cd:{rn}", slug, "memo", cr, [src(fid, sheet8, rn)], head=remark,
                    notes="settlement of the event deficit between the trust and the partner body; not event income", needs_review=True)
        else:
            summary_credit += cr
            cx.skip(fid, sheet8, "summary of Total Collection rows (imported row by row)")
    cx.check(f"{sid8} collection credits (rows 3, 5, 6) vs Total Collection F56", summary_credit, d[56]["F"], {"sheet": sid8})
    cx.check(f"{sid8} credits D26", credit_sum, d8[26]["D"], {"sheet": sid8, "cell": "D26"})
    cx.check(f"{sid8} debits E26", debit_sum, d8[26]["E"], {"sheet": sid8, "cell": "E26"})
    t = cx.event_tot[slug]
    cx.check(f"{sid8} income + deficit settlement vs expenses (closing balance 0)", t["income"] + t["memo"], t["expense"], {"sheet": sid8})
    s7 = dict(cx.rows(fid, "Sheet1"))
    cx.check("F201.S07!C6 trust deficit share vs F201.S08!D21", s7[6]["C"], d8[21]["D"],
             {"cells": ["F201.S07!C6", "F201.S08!D21"], "note": "digits transposed; F201.S07!E9 'Amount to receive' = 360 is exactly the gap",
              "imported": "F201.S08!D21 (final settlement sheet), as a memo line"},
             title="Sahitya Sammelan 2022: trust's share of the deficit is written two ways",
             action="Confirm whether the trust bore 46,041 or 46,401.")
    s5, s6 = dict(cx.rows(fid, "Expenses_Coll")), dict(cx.rows(fid, "Sahitya Sammelan"))
    cx.st.review("conflicting_sources", "Sahitya Sammelan 2022: three working versions of the cash payments",
                 {"F201.S05!J12": str(s5[12].get("J")), "F201.S06!G13": str(s6[13].get("G")), "F201.S08!I17": str(d8[17].get("I")),
                  "imported": "the 15 debit lines of F201.S08 (final settlement), 440,600 in all"}, severity="medium",
                 suggested_action="Confirm that the Credit Debit Sheet is the final account.")
    s4 = dict(cx.rows(fid, "Pune Ticket Sale"))
    n4 = len([1 for rn, c in s4.items() if 4 <= rn <= 19 and any(is_num(c.get(k)) for k in "FGHIJLMN")])
    cx.read(fid, "Pune Ticket Sale", n4)
    cx.skip(fid, "Pune Ticket Sale", "ticket books by distributor: counts only, two competing blocks, no dates", n4)
    cx.st.review("trustee_decision", "Sahitya Sammelan 2022: ticket-book sales are not in the trust's event account",
                 {"sheet": "F201.S04", "left_block": {"tickets_F21": str(s4[21].get("F")), "amount_F23": str(s4[23].get("F")), "with_adverts_G25": str(s4[25].get("G"))},
                  "right_block": {"tickets_L21": str(s4[21].get("L")), "amount_L23": str(s4[23].get("L"))},
                  "in_trust_account": "only 16,400 ticket cash (F201.S08 row 4) plus the online bookings",
                  "paid_into_partner_account": str(partner_acc), "event_income_imported": str(t["income"])},
                 severity="medium",
                 suggested_action="Say which ticket block is final and whether the event should be shown gross or only as the trust's share; "
                                  "receipts paid into the partner body's account are imported and marked in the notes.")
    # budget
    bkey = f"evt:budget:{slug}:{fid}"
    sh5 = "Expenses_Coll"
    cx.emit("budgets", bkey, {"fy": "2022-23", "event_slug": slug, "title": "Sahitya Sammelan 2022: planned expenses and expected collection",
                              "heading_as_written": "EXPENSES | COLLECTION"}, [src(fid, sh5, 2)])
    be = bi = ZERO
    for rn, c in cx.rows(fid, sh5):
        if not 3 <= rn <= 23:
            continue
        if clean_text(c.get("B")) and is_num(c.get("C")):
            cx.read(fid, sh5)
            be += D(c["C"])
            cx.emit("budget_lines", f"{bkey}:{rn}:exp", {"budget_key": bkey, "kind": "expense", "head_as_written": clean_text(c["B"]), "amount": D(c["C"])}, [src(fid, sh5, rn)])
        elif clean_text(c.get("B")):
            cx.read(fid, sh5)
            cx.skip(fid, sh5, "planned expense head with no amount")
        if clean_text(c.get("E")) and is_num(c.get("F")):
            bi += D(c["F"])
            cx.emit("budget_lines", f"{bkey}:{rn}:inc", {"budget_key": bkey, "kind": "income", "head_as_written": clean_text(c["E"]), "amount": D(c["F"])}, [src(fid, sh5, rn)])
    cx.check("F201.S05 planned expenses C24", be, s5[24]["C"], {"sheet": "F201.S05", "cell": "C24"})
    cx.check("F201.S05 expected collection F24", bi, s5[24]["F"], {"sheet": "F201.S05", "cell": "F24"})
    n6 = len(work)
    cx.read(fid, "Sahitya Sammelan", n6)
    cx.skip(fid, "Sahitya Sammelan", "working cash/cheque book, superseded by the Credit Debit Sheet", n6 - matched)
    n7 = len([1 for rn, c in s7.items() if 3 <= rn <= 9 and clean_text(c.get("B"))])
    cx.read(fid, "Sheet1", n7)
    cx.skip(fid, "Sheet1", "working settlement note, superseded by the Credit Debit Sheet", n7)


# ---------------------------------------------------------------- 15 August 2022 (F014)

def independence_day_2022(cx):
    fid, slug, sheet = "F014", "independence-day-2022", "15Aug22 Celebrations"
    rows = cx.rows(fid, sheet)
    sid = cx.sid(fid, sheet)
    d = dict(rows)
    for rn, c in rows:
        if not 3 <= rn <= 28:
            continue
        if is_num(c.get("F")):
            cx.read(fid, sheet)
            cx.line(f"{fid}:in:{rn}", slug, "income", D(c["F"]), [src(fid, sheet, rn)], line_date=cx.date(c.get("C"), f"{sid}!C{rn}"),
                    head="Contribution", party=c.get("D"), person=person_of(c.get("D"), "donor"), mode=c.get("E"),
                    reference=c.get("E") if clean_text(c.get("E")) != "Cash" else None)
        if is_num(c.get("L")):
            cx.read(fid, sheet)
            cx.line(f"{fid}:out:{rn}", slug, "expense", D(c["L"]), [src(fid, sheet, rn)], line_date=cx.date(c.get("I"), f"{sid}!I{rn}"),
                    head=c.get("J"), mode=c.get("K"), reference=c.get("K"),
                    notes=f"unheaded column N: {clean_text(c.get('N'))}" if c.get("N") else None)
    t = cx.event_tot[slug]
    cx.check(f"{sid} contributions F29", t["income"], d[29]["F"], {"sheet": sid, "cell": "F29"})
    cx.check(f"{sid} expenses L29", t["expense"], d[29]["L"], {"sheet": sid, "cell": "L29"})
    cx.check(f"{sid} balance L31", t["income"] - t["expense"], d[31]["L"], {"sheet": sid, "cell": "L31"})


# ---------------------------------------------------------------- books (F009, F014 "PCKP Payments")

def books(cx):
    fid, main, clk = "F009", "book-pride-of-ckp", "book-lakshvedhi-kayastha"
    #          sheet, first, last, receipt, date, name, addr, phone, details, amount-for, clk amt, clk nos, main amt, main nos, remarks, delivered, courier, total row
    regs = [("2022-23 (1-100)", 4, 103, "C", "D", "E", "F", "G", "H", "I", None, None, "J", "L", "M", "N", "P", 105),
            ("2022-23 (101-200)", 4, 112, "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", 114),
            ("2022-25 (1001-1200)", 4, 177, "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", None, 179)]
    reg_main = reg_copies = reg_clk = reg_clk_copies = ZERO
    by_fy = defaultdict(lambda: [ZERO, ZERO])
    for (sheet, lo, hi, rc, dc, nc, ac, pc, detc, forc, ca, cn, ma, mn, remc, delc, courc, trow) in regs:
        rows = cx.rows(fid, sheet)
        sid = cx.sid(fid, sheet)
        d = dict(rows)
        s_main = s_copies = s_clk = s_clkn = ZERO
        dated, undated = [], []
        for rn, c in rows:
            if not lo <= rn <= hi:
                continue
            m_amt = D(c.get(ma)) or None
            m_nos = D(c.get(mn)) or None
            c_amt = D(c.get(ca)) or None if ca else None
            c_nos = D(c.get(cn)) or None if cn else None
            cx.read(fid, sheet)
            if m_amt is None and c_amt is None and m_nos is None and c_nos is None:
                cx.skip(fid, sheet, "pre-numbered receipt row with no sale")
                continue
            dt = cx.date(c.get(dc), f"{sid}!{dc}{rn}")
            if dt:
                dated.append((rn, dt))
            else:
                undated.append(rn)
            name = clean_text(c.get(nc))
            person = person_of(name, "donor", phone=c.get(pc), address=c.get(ac))
            base = [f"Receipt No {fmt_ref(c.get(rc))}" if c.get(rc) is not None else "no receipt number",
                    f"Amount For: {clean_text(c.get(forc))}" if c.get(forc) else None,
                    f"Remarks: {clean_text(c.get(remc))}" if c.get(remc) else None,
                    f"delivered (unheaded column): {fmt_ref(c.get(delc))}" if is_num(c.get(delc)) else None,
                    f"courier/speed-post charges column: {fmt_ref(c.get(courc))}" if courc and is_num(c.get(courc)) else None,
                    "no date on the sheet" if dt is None else None]
            if sheet == "2022-23 (1-100)" and is_num(c.get("O")):
                base.append(f"unheaded column O: {fmt_ref(c.get('O'))}")
            if m_amt is not None or m_nos is not None:
                s_main += m_amt or ZERO
                s_copies += m_nos or ZERO
                by_fy[fy_of(dt) or "undated"][0] += m_amt or ZERO
                by_fy[fy_of(dt) or "undated"][1] += m_nos or ZERO
                odd = m_amt is None or m_nos is None
                cx.line(f"{fid}:{sid[-3:]}:{rn}:pckp", main, "income", m_amt or ZERO, [src(fid, sheet, rn)], line_date=dt,
                        head="Book sale: Chandraseniya Kayastha Prabhu Samaj - Ek Gauravyatra (PCKP)", party=name, person=person,
                        quantity=m_nos, mode=c.get(detc), reference=c.get(detc),
                        notes=base + (["amount with no copy count" if m_nos is None else "copies with no amount"] if odd else []),
                        needs_review=odd or dt is None)
            if c_amt is not None or c_nos is not None:
                s_clk += c_amt or ZERO
                s_clkn += c_nos or ZERO
                cx.line(f"{fid}:{sid[-3:]}:{rn}:clk", clk, "memo", c_amt or ZERO, [src(fid, sheet, rn)], line_date=dt,
                        head="Book sale: Chandraseniya Lakshavedhi Kayastha (CLK columns of the main-book register)", party=name, person=person,
                        quantity=c_nos, mode=c.get(detc), reference=c.get(detc),
                        notes=base + ["memo: possibly the same sales as the seller sheet 'Lakshvedhi Kayastha' (imported as income); see review item"],
                        needs_review=True)
        t = d[trow]
        cx.check(f"{sid} main-book amount {ma}{trow}", s_main, t[ma], {"sheet": sid, "cell": f"{ma}{trow}"})
        cx.check(f"{sid} main-book copies {mn}{trow}", s_copies, t[mn], {"sheet": sid, "cell": f"{mn}{trow}"})
        if ca:
            cx.check(f"{sid} second-book amount {ca}{trow}", s_clk, t[ca], {"sheet": sid, "cell": f"{ca}{trow}"})
            cx.check(f"{sid} second-book copies {cn}{trow}", s_clkn, t[cn], {"sheet": sid, "cell": f"{cn}{trow}"}, severity="low")
        reg_main, reg_copies, reg_clk, reg_clk_copies = reg_main + s_main, reg_copies + s_copies, reg_clk + s_clk, reg_clk_copies + s_clkn
        if undated:
            cx.st.review("missing_date", "Book sales with no date", {"sheet": sid, "rows": undated}, severity="low",
                         suggested_action="Add the sale date; the rows are imported undated.")
        bad = out_of_sequence(dated, 120)
        if bad:
            cx.st.review("ambiguous_date", "Book register: dates out of sequence", {"sheet": sid, "rows": bad}, severity="low",
                         suggested_action="Check the year on these rows.")
    s2, s3 = dict(cx.rows(fid, "2022-23 (101-200)")), dict(cx.rows(fid, "2022-25 (1001-1200)"))
    cx.check("F009.S03 main-book sales, all registers, K182", reg_main, s3[182]["K"], {"sheet": "F009.S03", "cell": "K182"})
    cx.check("F009.S03 main-book copies, all registers, L187", reg_copies, s3[187]["L"], {"sheet": "F009.S03", "cell": "L187"})
    # transfer note and unreproducible summary cells
    cx.read(fid, "2022-23 (101-200)")
    cx.line(f"{fid}:S02:122", main, "memo", D(s2[122]["L"]), [src(fid, "2022-23 (101-200)", 122)], head=s2[122]["I"],
            notes="book money handed over to the trust account; typed total, no date", needs_review=True)
    for cell, rn, col, sheet, sdict, what in (
            ("F009.S02!L126", 126, "L", "2022-23 (101-200)", s2, "the courier columns add to 4,150 (S01) and 1,025 (S02)"),
            ("F009.S02!L127", 127, "L", "2022-23 (101-200)", s2, "no cells give this figure; second-book sales in the registers are 14,325 and on the seller sheet 30,185"),
            ("F009.S03!K180", 180, "K", "2022-25 (1001-1200)", s3, "unlabelled cell under the sales total"),
            ("F009.S03!K181", 181, "K", "2022-25 (1001-1200)", s3, "unlabelled cell under the sales total"),
            ("F009.S03!K186", 186, "K", "2022-25 (1001-1200)", s3, "total collection 847,750 less the 19,000 received in 2021-22 would be 828,750")):
        label = clean_text(sdict[rn].get("I") or sdict[rn].get("H")) or "(no label)"
        cx.st.review("total_mismatch", f"Book accounts: figure '{label}' cannot be reproduced",
                     {"cell": cell, "printed": str(sdict[rn][col]), "recomputed": None, "note": what}, severity="low",
                     suggested_action="Say what this figure is; it is not imported.")
    cx.st.review("trustee_decision", "Book accounts: money handed to the trust is less than the sales received",
                 {"sheet": "F009.S02", "transferred_L122": str(s2[122]["L"]), "received_2022-23_L118": str(s2[118]["L"]),
                  "difference_L124": str(s2[124]["L"]), "after_refund_L125": str(s2[125]["L"]), "label_L125": clean_text(s2[125]["I"])},
                 severity="medium", suggested_action="Account for the 10,975 / 22,975 difference.")

    # gifts and donations
    sheet = "Gift PCKP Books"
    rows = cx.rows(fid, sheet)
    sid = cx.sid(fid, sheet)
    d = dict(rows)
    don = g_main = g_clk = ZERO
    dated = []
    for rn, c in rows:
        if not 4 <= rn <= 43:
            continue
        cx.read(fid, sheet)
        amount, pck, cl = D(c.get("J")), D(c.get("G")), D(c.get("H"))
        if amount is None and pck is None and cl is None:
            if clean_text(c.get("D")):
                cx.skip(fid, sheet, "row with neither copies nor amount")
            else:
                cx.skip(fid, sheet, "pre-numbered empty row")
            continue
        dt = cx.date(c.get("C"), f"{sid}!C{rn}") if c.get("C") is not None else None
        if dt:
            dated.append((rn, dt))
        name, details, remarks = clean_text(c.get("D")), clean_text(c.get("F")), clean_text(c.get("I"))
        if amount is not None:
            don += amount
            cx.line(f"{fid}:S07:{rn}:don", main, "income", amount, [src(fid, sheet, rn)], line_date=dt,
                    head="Donation for the book" + (f": {details}" if details else ""), party=name,
                    person=person_of(name, "donor", address=c.get("E")), notes=[f"Remarks: {remarks}" if remarks else None,
                                                                             "no date on the sheet" if dt is None else None],
                    needs_review=dt is None)
        elif remarks and re.search(r"donation rec", remarks, re.I):
            cx.st.review("missing_amount", "Book donation noted in the remarks but no amount entered",
                         {"sheet": sid, "row": rn, "remarks": remarks, "amount_cell": f"J{rn}", "printed_total_J45": str(d[45]["J"])},
                         severity="medium", suggested_action="Confirm whether this donation was received; it is in no total and is not imported as money.")
        for col, q, slug_ in (("G", pck, main), ("H", cl, clk)):
            if q is None:
                continue
            g_main, g_clk = (g_main + q, g_clk) if col == "G" else (g_main, g_clk + q)
            cx.line(f"{fid}:S07:{rn}:gift{col}", slug_, "memo", ZERO, [src(fid, sheet, rn)], line_date=dt,
                    head="Copies given free" + (f": {details}" if details else ""), party=name, quantity=q,
                    notes=["gift of copies, no money", f"Remarks: {remarks}" if remarks else None, "no date on the sheet" if dt is None else None])
    cx.check(f"{sid} donations for the book J45", don, d[45]["J"], {"sheet": sid, "cell": "J45"})
    cx.check(f"{sid} main-book copies gifted G45", g_main, d[45]["G"], {"sheet": sid, "cell": "G45"})
    cx.check(f"{sid} second-book copies gifted H45", g_clk, d[45]["H"], {"sheet": sid, "cell": "H45"})
    cx.check("F009.S03 total collection K184 (sales + donations)", reg_main + don, s3[184]["K"], {"sheet": "F009.S03", "cell": "K184"})
    bad = out_of_sequence(dated, 120)
    if bad:
        cx.st.review("ambiguous_date", "Book gifts: dates out of sequence", {"sheet": sid, "rows": bad,
                     "dates": [str(dict(dated)[r]) for r in bad]}, severity="low", suggested_action="Check the year on these rows.")

    # second book, seller sheet
    sheet = "Lakshvedhi Kayastha"
    rows = cx.rows(fid, sheet)
    sid = cx.sid(fid, sheet)
    d = dict(rows)
    cash = online = copies = delivered = ZERO
    dated = []
    for rn, c in rows:
        if not 4 <= rn <= 49:
            continue
        cx.read(fid, sheet)
        ca_, on_, q = D(c.get("I")), D(c.get("J")), D(c.get("K"))
        if ca_ is None and on_ is None and q is None:
            cx.skip(fid, sheet, "pre-numbered empty row")
            continue
        dt = cx.date(c.get("C"), f"{sid}!C{rn}")
        if dt:
            dated.append((rn, dt))
        cash, online, copies = cash + (ca_ or ZERO), online + (on_ or ZERO), copies + (q or ZERO)
        delivered += D(c.get("M")) or ZERO
        amount = (ca_ or ZERO) + (on_ or ZERO)
        gift = amount == 0
        notes = [f"sold/handled by the person named; buyers or occasion: {clean_text(c.get('E'))}" if c.get("E") else None,
                 f"Details: {clean_text(c.get('G'))}" if c.get("G") else None,
                 f"delivered (unheaded column M): {fmt_ref(c.get('M'))}" if is_num(c.get("M")) else None,
                 f"unheaded column N: {clean_text(c.get('N'))}" if c.get("N") else None,
                 "gift of copies, no money" if gift else None,
                 "amount with no copy count" if (not gift and q is None) else None]
        cx.line(f"{fid}:S08:{rn}", clk, "memo" if gift else "income", amount, [src(fid, sheet, rn)], line_date=dt,
                head=("Copies given free" if gift else "Book sale: Chandraseniya Lakshavedhi Kayastha"), party=c.get("D"), quantity=q,
                mode=None if gift else "; ".join(x for x in (f"Cash {ca_:f}" if ca_ else None, f"Online {on_:f}" if on_ else None) if x),
                notes=notes, needs_review=(not gift and q is None))
    cx.check(f"{sid} cash I51", cash, d[51]["I"], {"sheet": sid, "cell": "I51"})
    cx.check(f"{sid} online J51", online, d[51]["J"], {"sheet": sid, "cell": "J51"})
    cx.check(f"{sid} total collection I53", cash + online, d[53]["I"], {"sheet": sid, "cell": "I53"})
    cx.check(f"{sid} copies K51", copies, d[51]["K"],
             {"sheet": sid, "cell": "K51", "delivered_column_M_recomputed": str(delivered), "delivered_M51_printed": str(d[51]["M"]),
              "note": "row 45 shows 16 copies but 1 delivered; row 4 is a gift of 11"},
             title="Second book: copies sold or gifted do not add up to the printed count", severity="medium",
             action="Recount the copies; quantities are imported as written on each row.")
    cx.check(f"{sid} stock: holders' balances F74 vs printed-less-sold F78", d[74]["F"], d[78]["F"],
             {"sheet": sid, "cells": ["F74", "F78"], "printed_F76": str(d[76]["F"]), "sold_or_gifted_F77": str(d[77]["F"])},
             title="Second book: stock count differs by one copy", severity="low", action="Recount the stock.")
    bad = out_of_sequence(dated)
    if bad:
        cx.st.review("ambiguous_date", "Second-book sales: dates out of sequence", {"sheet": sid, "rows": bad,
                     "dates": [str(dict(dated)[r]) for r in bad]}, severity="low",
                     suggested_action="Probably a mistyped month or year (e.g. Jan for Oct 2022, 2024 for 2023); confirm.")
    for rn in (63, 64):
        cx.read(fid, sheet)
        cx.line(f"{fid}:S08:{rn}", clk, "memo", D(d[rn]["F"]), [src(fid, sheet, rn)], line_date=cx.date(d[rn].get("C"), f"{sid}!C{rn}"),
                head=d[rn]["D"], notes=f"cash from second-book sales handed to the trust account; cash still held after it: {fmt_ref(d[rn].get('G'))}")
    cx.st.review("conflicting_sources", "Second-book sales are recorded in two places",
                 {"seller_sheet_F009.S08!I53": str(cash + online), "register_columns_F009.S02!J114+F009.S03!I179": str(reg_clk),
                  "register_copies": str(reg_clk_copies), "seller_sheet_copies_K51": str(d[51]["K"]),
                  "imported": "seller sheet as income; register CLK columns as memo lines",
                  "printed_recovery_F009.S11!E18": "877,935 uses 30,185 and ignores 14,325"},
                 severity="medium", suggested_action="Say whether the 14,325 in the registers is part of the 30,185 or additional.")

    # loans from individuals
    sheet = "Expenses"
    rows = cx.rows(fid, sheet)
    sid = cx.sid(fid, sheet)
    d = dict(rows)
    hdr = d[3]
    loans = repaid = ZERO
    col_sum = ZERO
    for rn, c in rows:
        if not 4 <= rn <= 9:
            continue
        cx.read(fid, sheet)
        name = clean_text(c.get("C"))
        loans += D(c["E"])
        cx.line(f"{fid}:S09:{rn}:loan", main, "memo", D(c["E"]), [src(fid, sheet, rn)], line_date=cx.date(c.get("D"), f"{sid}!D{rn}"),
                head="Loan received from an individual for the book", party=name,
                notes="loan, not income; repaid in full per the sheet", needs_review=True)
        for col in "FGHIJK":
            v = D(c.get(col))
            if v is None:
                continue
            col_sum += v
            if col == "G":
                continue                      # 130,000 in a multi-date column: reported, not imported
            repaid += v
            cx.line(f"{fid}:S09:{rn}:ret{col}", main, "memo", v, [src(fid, sheet, rn)], line_date=header_date(hdr.get(col)),
                    head="Loan returned to the lender", party=name, notes=f"column header: {clean_text(hdr.get(col))}", needs_review=True)
    cx.check(f"{sid} loans E10", loans, d[10]["E"], {"sheet": sid, "cell": "E10"})
    cx.check(f"{sid} repayments imported vs total returned L10", repaid, d[10]["L"], {"sheet": sid, "cell": "L10"})
    cx.check(f"{sid} per-date return columns F:K vs total returned L10", col_sum, d[10]["L"],
             {"sheet": sid, "cells": ["F10:K10", "L10"], "cause": "G4 shows 130,000 under 'Amount Returned on 19/Oct, 31/Oct, 30/Nov, 4/May' as well as 50,000 in K4",
              "imported": "the 130,000 in G4 is NOT imported"},
             title="Book loans: return columns add to more than the amount returned",
             action="Explain the 130,000 on row 4; confirm the loans were interest-free and fully repaid.")
    cx.st.review("trustee_decision", "Loans from individuals financed the book printing",
                 {"sheet": sid, "rows": [4, 9], "loans": 6, "total_E10": str(d[10]["E"]), "returned_L10": str(d[10]["L"]), "balance_M10": str(d[10]["M"]),
                  "imported_as": "memo lines on the book account (never income or expense)"},
                 severity="medium", suggested_action="Confirm the terms (interest-free?) and that nothing is outstanding.")
    cx.read(fid, sheet, 2)
    cx.skip(fid, sheet, "office note unrelated to the book (800 bus-fare refund; 10,000 'Balshikshan Deposit')", 2)
    cx.st.review("trustee_decision", "Unexplained 'Balshikshan Deposit' of 10,000",
                 {"sheet": sid, "row": 20, "date": fmt_ref(d[20].get("D")), "amount_in_remarks_side_column_G20": str(d[20].get("G")),
                  "also_row_19": {"date": fmt_ref(d[19].get("D")), "amount": str(d[19].get("E")), "remark": clean_text(d[19].get("F"))}},
                 severity="low", suggested_action="Say what this deposit is; not imported.")

    # printing payments (canonical: F014 "PCKP Payments"; F009 "Printing Payment" is the same list)
    sheet = "PCKP Payments"
    rows = cx.rows("F014", sheet)
    sid = cx.sid("F014", sheet)
    d = dict(rows)
    copy = {(parse_date(c.get("B"))[0], D(c.get("C"))): rn for rn, c in cx.rows(fid, "Printing Payment") if is_num(c.get("C"))}
    paid = ZERO
    for rn, c in rows:
        if not 4 <= rn <= 14:
            continue
        cx.read("F014", sheet)
        amount = D(c["C"])
        dt = cx.date(c.get("B"), f"{sid}!B{rn}")
        paid += amount
        sources = [src("F014", sheet, rn)]
        if (dt, amount) in copy:
            sources.append(src(fid, "Printing Payment", copy[(dt, amount)], "duplicate"))
            cx.read(fid, "Printing Payment")
            cx.dup(fid, "Printing Payment")
        private = "pvt ac" in str(c.get("D")).lower()
        cx.line(f"F014:S02:{rn}", main, "expense", amount, sources, line_date=dt, head="Printing contract: " + clean_text(c["D"]),
                party="Kirti Printlinks" if "kirti printlinks" in str(c.get("D")).lower() else None,
                mode=c.get("D"), reference=c.get("E"),
                notes="paid to an individual's private account per the sheet" if private else None, needs_review=private or not c.get("E"))
    cx.check(f"{sid} printing payments C20", paid, d[20]["C"], {"sheet": sid, "cell": "C20"})
    cx.check(f"{sid} contract amount G3 vs payments", paid, d[3]["G"], {"sheet": sid, "cell": "G3"})
    cx.read("F014", sheet)
    cx.skip("F014", sheet, "contract amount row (not a payment)")
    cx.st.review("trustee_decision", "Book printing: 200,000 paid to an individual's private account",
                 {"sheet": sid, "rows": [5, 7], "summary_row": 17, "amount_C17": str(d[17]["C"]), "to_printing_firm_C16": str(d[16]["C"]),
                  "advance_2021-22_C18": str(d[18]["C"]), "advance_payee": "not stated"},
                 severity="high", suggested_action="Document why part of the contract was paid through a private account and who received the 100,000 advance.")
    pp = dict(cx.rows(fid, "Printing Payment"))
    cx.read(fid, "Printing Payment")
    cx.line(f"{fid}:S11:16", clk, "expense", D(pp[16]["E"]), [src(fid, "Printing Payment", 16)], head=pp[16]["D"],
            notes="summary figure, no date, payee or payment reference", needs_review=True)
    tm, tc = cx.event_tot[main], cx.event_tot[clk]
    cx.check("F009.S11 total cost of both books E17", tm["expense"] + tc["expense"], pp[17]["E"], {"sheet": "F009.S11", "cell": "E17"})
    cx.check("F009.S11 total recovery E18", tm["income"] + tc["income"], pp[18]["E"], {"sheet": "F009.S11", "cell": "E18"})
    cx.check("F009.S11 profit E19", tm["income"] + tc["income"] - tm["expense"] - tc["expense"], pp[19]["E"], {"sheet": "F009.S11", "cell": "E19"})
    cx.st.review("trustee_decision", "Are the donations for the book already in the receipt registers?",
                 {"sheet": "F009.S07", "donations": str(don), "rows_with_amount": 20,
                  "note": "imported here as book-account income lines only (satellite ledger); not added to trust income by this transform"},
                 severity="medium", suggested_action="Confirm whether these 249,900 were receipted as ordinary donations.")
    cx.skip(fid, "Printing Payment", "summary rows (total cost, recovery, profit), checked not imported", 3)
    cx.read(fid, "Printing Payment", 3)
    for sh, reason in (("Discount Sale (2023~24)", "duplicate view of the sales registers"), ("Discount Sale (2022~23)", "duplicate view of the sales registers"),
                       ("PCF Members", "duplicate view of the sales registers"), ("Interest shown", "bookings not delivered, no amounts"),
                       ("PART 2", "research contact list (name list, no money)"), ("Sheet1", "cheque-printing scratch layout")):
        n = len([1 for rn, c in cx.rows(fid, sh) if rn >= 4 and len([k for k in c if k != "_f"]) > 1])
        cx.read(fid, sh, n)
        cx.skip(fid, sh, reason, n)
    cx.by_fy_books = {k: (str(v[0]), str(v[1])) for k, v in sorted(by_fy.items())}


# ---------------------------------------------------------------- schemes

def scheme_rec(cx, key, slug, amount, sources, **kw):
    if slug not in cx.slugs["scheme"]:
        raise ValueError(f"scheme slug not in mappings/schemes.csv: {slug}")
    rec = {"scheme_slug": slug, "person": kw.get("person"), "beneficiary_as_written": clean_text(kw.get("beneficiary")),
           "beneficiary_count": kw.get("count"), "fy": kw.get("fy"), "disbursed_on": kw.get("on"), "amount": amount,
           "institution": kw.get("institution"), "is_repayable": bool(kw.get("repayable")), "notes": clean_text(kw.get("notes")),
           "needs_review": bool(kw.get("review")), "status": kw.get("status") or "paid"}
    cx.emit("scheme_disbursements", key, rec, sources)
    cx.scheme_tot[(slug, kw.get("fy") or kw.get("fy_label") or "year not stated")].append((amount, kw.get("count"), bool(kw.get("review"))))
    return key


def schemes(cx):
    cx.scheme_tot = defaultdict(list)
    # --- scholarship applications (F175)
    fid, sheet = "F175", "Sheet1"
    sid = cx.sid(fid, sheet)
    for rn, c in cx.rows(fid, sheet):
        if rn < 3:
            continue
        cx.read(fid, sheet)
        name = clean_text(c.get("C"))
        if not name:
            cx.skip(fid, sheet, "numbered row with no applicant")
            continue
        dob = cx.date(c.get("D"), f"{sid}!D{rn}") if c.get("D") is not None else None
        marks = c.get("F")
        details = {"std_as_written": clean_text(c.get("E")), "previous_year_marks_as_written": fmt_ref(marks) if not is_num(marks) else str(marks),
                   "fees_as_written": fmt_ref(c.get("H")), "parent_name_as_written": clean_text(c.get("I")),
                   "contact_number_as_written": fmt_ref(c.get("J")), "place": clean_text(c.get("K")), "remark": clean_text(c.get("L"))}
        cx.emit("scheme_applications", f"evt:app:{fid}:{rn}",
                {"scheme_slug": "dnyan-kiran", "person": person_of(name, "beneficiary", dob=dob), "applicant_as_written": name, "fy": "2023-24",
                 "institution": clean_text(c.get("G")), "status": "unknown", "details": {k: v for k, v in details.items() if v is not None},
                 "needs_review": True},
                [src(fid, sheet, rn)])
    cx.st.review("missing_document", "Scholarship register is missing: only 4 applications and yearly totals exist",
                 {"sheet": sid, "applications": 4, "fy": "2023-24 (from the file name '23~24 Scholarship Applications')",
                  "note": "no status, sanctioned amount or payment reference on any application; the contact number is the parent's and is kept in the details, not on the student"},
                 severity="medium", suggested_action="Provide the register of beneficiaries with amounts and payment references; decide whether minors' names may be stored.")

    # --- Gurukul support (F202)
    fid = "F202"
    for sheet, fy in (("Year 2022-23", "2022-23"), ("Year 2023-24", "2023-24")):
        rows = cx.rows(fid, sheet)
        sid = cx.sid(fid, sheet)
        d = dict(rows)
        tot = ZERO
        for rn, c in rows:
            if not 3 <= rn <= 14 or not is_num(c.get("E")):
                continue
            cx.read(fid, sheet)
            amount = cx.amount(c["E"], f"{sid}!E{rn}")
            tot += amount
            dt = cx.date(c.get("C"), f"{sid}!C{rn}")
            desc = clean_text(c.get("D"))
            m = re.search(r"ITI Student - (\d+) No.*?- (\d+) Nos.*?- (\d+) Nos", desc or "")
            count = sum(int(x) for x in m.groups()) if m else None
            overlap = fy == "2022-23" and dt == date(2022, 8, 15)
            scheme_rec(cx, f"evt:dsb:{fid}:{fy}:{rn}", "gurukul-support", amount, [src(fid, sheet, rn)], beneficiary=desc, count=count, fy=fy, on=dt,
                       institution="SVDS Gurukul, Talegaon",
                       notes="sheet title: 'Various Expenses for SVDS Gurukul under Dnyankiran Vidyarthi Sahayy Yojana'"
                             + ("; may overlap the separate 15 August 2022 event account (F014)" if overlap else "")
                             + ("; head-count = 1 ITI + 3 seventh-standard + 3 tenth-standard students" if count else ""),
                       review=overlap or (dt is not None and fy_of(dt) != fy))
        cx.check(f"{sid} total E15", tot, d[15]["E"], {"sheet": sid, "cell": "E15"})
    cx.st.review("duplicate_transaction", "15 August 2022 costs appear in both the Gurukul sheet and the event account",
                 {"gurukul_sheet": {"sheet": "F202.S01", "rows": [5, 7], "amounts": ["11576", "12000", "2300"]},
                  "event_account": {"sheet": "F014.S01", "expenses_L29": "11636"},
                  "note": "11,576 vs 11,636 differ by 60; neither sheet says whether it is the same spend"},
                 severity="medium", suggested_action="Say whether the 11,576 in the Gurukul sheet is the 15 August 2022 event spend.")

    # --- repayable medical aid (F011 per-person sheets; F013 is a PDF print of the same)
    fid = "F011"
    for sheet in ("Vaishali Chitre", "Pravin Chitre"):
        rows = cx.rows(fid, sheet)
        sid = cx.sid(fid, sheet)
        d = dict(rows)
        title = clean_text(d[2].get("B")) or ""
        name = clean_text(title.split(":", 1)[1]) if ":" in title else sheet
        dkey, repaid, given = None, ZERO, ZERO
        for rn, c in rows:
            if not 4 <= rn <= 14:
                continue
            cx.read(fid, sheet)
            cr, dr = D(c.get("G")), D(c.get("H"))
            dt = cx.date(c.get("D"), f"{sid}!D{rn}")
            if dr is not None:
                given += dr
                dkey = scheme_rec(cx, f"evt:dsb:{fid}:{sid[-3:]}:{rn}", "medical-aid", dr,
                                  [src(fid, sheet, rn), {"file": "F013", "sheet": "(pdf text)", "row": 1, "role": "duplicate"}],
                                  person=person_of(name, "beneficiary"), beneficiary=name, fy=fy_of(dt), on=dt, repayable=True,
                                  notes=f"Voucher {fmt_ref(c.get('C'))}; {clean_text(c.get('F'))}; repaid in instalments, no interest column or written terms on the sheet")
            elif cr is not None:
                repaid += cr
                cx.emit("scheme_repayments", f"evt:rep:{fid}:{sid[-3:]}:{rn}",
                        {"disbursement_key": dkey, "paid_on": dt, "amount": cr},
                        [src(fid, sheet, rn)])
        cx.check(f"{sid} repaid G15", repaid, d[15]["G"], {"sheet": sid, "cell": "G15"})
        cx.check(f"{sid} disbursed H15", given, d[15]["H"], {"sheet": sid, "cell": "H15"})
        cx.check(f"{sid} balance owed I15", given - repaid, d[15]["I"], {"sheet": sid, "cell": "I15"})

    # --- Project Diya (F053 Outward row 25)
    c = dict(cx.rows("F053", "Outward Entries"))[25]
    dt = c["C"] if isinstance(c.get("C"), datetime) else c.get("B")
    scheme_rec(cx, "evt:dsb:F053:S02:25", "project-diya", D(c["E"]),
               [src("F053", "Outward Entries", 25), src("F053", "Expenses incurred", 16, "enrichment")],
               beneficiary=clean_text(c.get("D")), fy=fy_of(dt.date()), on=dt.date(), institution="Sinhgad Cycle Agencies",
               notes=f"Voucher {fmt_ref(c.get('B'))}; payee is the cycle agency (repairs); the only Project Diya payment in these files; "
                     "also shown as a memo line in the Gaurav 2024 accounts")

    # --- summary-only lines of the fund-utilisation workbook (F200)
    fid = "F200"
    edu, env, med = dict(cx.rows(fid, "Educational Support")), dict(cx.rows(fid, "Environmental")), dict(cx.rows(fid, "Medical Assistance"))
    plan = "PLAN, not a payment: the workbook was last saved on 2026-03-25, before this year began"
    upcoming = "described as 'Upcoming' in the source: a planned project, NOT confirmed as money paid"
    items = [
        ("Educational Support", edu, 5, "dnyan-kiran", "2023-24", 11, None, False,
         "summary line; head-count 11 (5 + 4 + 2 under three memorial scholarships) from the annual report F049: 'June-July 2023, 11 needy children, Rs 55,000'"),
        ("Educational Support", edu, 6, "dnyan-kiran", None, 45, "2022-23 & 2023-24", True,
         "summary line covering two years, not split in the source; the annual report F049 instead says Rs 60,000 for fifty students (July-Aug 2023)"),
        ("Educational Support", edu, 11, "dnyan-kiran", "2024-25", None, None, False, "summary line; no head-count or beneficiary list in the files"),
        ("Educational Support", edu, 13, "dnyan-kiran", "2025-26", None, None, False, "summary line; no head-count or beneficiary list in the files"),
        ("Educational Support", edu, 14, "dnyan-kiran", "2026-27", None, None, True, "summary line; " + plan),
        ("Medical Assistance", med, 6, "niramay", "2024-25", None, None, True,
         "summary line 'Naramay yojana 2024' (sic); year taken from the Summary sheet, where it first appears in column FY24/FY25; no beneficiary list; "
         "relation to the two repayable aids of 25,000 is not stated"),
        ("Medical Assistance", med, 7, "blossoming-buds", "2025-26", None, None, True,
         "summary line: 15 schools, '2000+' girl students (not an exact count); listed under Medical Assistance; no payment detail"),
        ("Medical Assistance", med, 8, "blossoming-buds", "2026-27", None, None, True, "summary line: 15 schools, '2000+' girl students; " + plan),
        ("Environmental", env, 5, "ravikiran", "2025-26", None, None, True, "solar energy; " + upcoming),
        ("Environmental", env, 6, "amrut-dhara", "2025-26", None, None, True, "solar water purification; " + upcoming),
    ]
    planned = []
    for sheet, dd, rn, slug, fy, count, fy_label, review, note in items:
        desc = clean_text(dd[rn]["B"])
        srcs = [src(fid, sheet, rn)]
        if rn == 5 and sheet == "Educational Support":
            srcs.append({"file": "F049", "sheet": "(docx text)", "row": 52, "role": "enrichment"})
        scheme_rec(cx, f"evt:dsb:{fid}:{cx.sid(fid, sheet)[-3:]}:{rn}", slug, D(dd[rn]["A"]), srcs, beneficiary=desc, count=count, fy=fy,
                   fy_label=fy_label, notes=note, review=review,
                   status="planned" if ("PLAN" in note or "Upcoming" in note) else "paid")
        if "PLAN" in note or "Upcoming" in note:
            planned.append({"cell": f"{cx.sid(fid, sheet)}!A{rn}", "amount": str(dd[rn]["A"]), "description": desc})
    cx.st.review("trustee_decision", "Planned project amounts are listed among money spent",
                 {"rows": planned, "also_no_year": {"cell": "F200.S01!A15", "amount": str(edu[15]["A"]), "description": clean_text(edu[15]["B"])},
                  "imported_as": "scheme disbursements flagged needs_review (Project Aarambh has no year and is not imported as a disbursement)"},
                 severity="high", suggested_action="Confirm what was actually paid; until then these must not be shown as disbursed.")
    cx.st.review("conflicting_sources", "Technical-course help: 66,000 for 45 students or 60,000 for 50?",
                 {"F200.S01!A6": {"amount": str(edu[6]["A"]), "description": clean_text(edu[6]["B"])},
                  "F049 annual report, line 53": "July-Aug 2023: fifty students, Rs 60,000"},
                 severity="medium", suggested_action="Confirm the amount, the head-count and the year(s).")
    cx.st.review("trustee_decision", "Gurukul support appears in two different cuts",
                 {"F202 detail (imported as disbursements)": {"2022-23": "66306", "2023-24": "49614.50"},
                  "F200 summary lines naming the Gurukul (NOT imported as disbursements, to avoid double counting)":
                      ["F200.S01!A3 17250", "F200.S01!A4 7600", "F200.S01!A7 5100", "F200.S01!A12 100000", "F200.S02!A3 10000", "F200.S02!A4 11000",
                       "F200.S05!A13 11000", "F200.S05!A15 10078"]},
                 severity="low", suggested_action="None needed unless the 2024 line (100,000) has no detail elsewhere; then provide its vouchers.")


def earmarked_accounts(cx):
    fid = "F011"
    for sheet, old, kind, total_row in (("Tushar Kulkarni", "Tushar Kulkarni (2)", "monthly donation in, mutual-fund investment out", 47),
                                        ("Sushil Karkhanis 2", "Sushil Karkhanis", "donation in, education payments for two named students out", 20)):
        rows = cx.rows(fid, sheet)
        sid = cx.sid(fid, sheet)
        d = dict(rows)
        mov = [(rn, c) for rn, c in rows if 3 <= rn < total_row and (is_num(c.get("G")) or is_num(c.get("H")))]
        cr = sum((D(c.get("G")) or ZERO for _, c in mov), ZERO)
        dr = sum((D(c.get("H")) or ZERO for _, c in mov), ZERO)
        cx.check(f"{sid} credits G{total_row}", cr, d[total_row]["G"], {"sheet": sid})
        cx.check(f"{sid} debits H{total_row}", dr, d[total_row]["H"], {"sheet": sid})
        cx.read(fid, sheet, len(mov))
        cx.skip(fid, sheet, "earmarked donor running account: no table fits (review item raised; donations and payments belong to other transforms)", len(mov))
        old_rows = cx.rows(fid, old)
        od = dict(old_rows)
        n_old = len([1 for rn, c in old_rows if rn >= 3 and (is_num(c.get("G")) or is_num(c.get("H"))) and clean_text(c.get("E"))])
        cx.read(fid, old, n_old)
        cx.skip(fid, old, "older copy of an earmarked donor account, superseded", n_old)
        errs = [f"{col}{rn}" for rn, c in rows for col, v in c.items() if col != "_f" and isinstance(v, str) and v.startswith("#")]
        first = mov[0]
        ev = {"sheet": sid, "superseded_copy": cx.sid(fid, old), "kind": kind,
              "opening": {"row": first[0], "date": fmt_ref(first[1].get("D")), "credit": str(first[1].get("G")), "balance_before": "0"},
              "movements": len(mov), "credits": {"count": len([1 for _, c in mov if is_num(c.get("G"))]), "total": str(cr)},
              "debits": {"count": len([1 for _, c in mov if is_num(c.get("H"))]), "total": str(dr)},
              "balance": str(d[total_row]["I"]), "last_movement": fmt_ref(mov[-1][1].get("D")),
              "missing_voucher_numbers_on_rows": [rn for rn, c in mov if c.get("C") is None]}
        if sheet.startswith("Sushil"):
            ev["difference_from_older_copy"] = {"row": 10, "this": str(d[10].get("H")), "older": str(od[10].get("H")),
                                                "older_totals": {"debits": str(od[16].get("H")), "balance": str(od[16].get("I"))}}
        else:
            ev["note"] = "rows 3 and 4 share one receipt number; the mutual-fund sheet shows 127,500 invested against 95,000 debited here"
        cx.st.review("trustee_decision", "Earmarked donor account kept as a running balance", ev, severity="medium",
                     suggested_action="Decide how earmarked donor balances are to be held in the system (a fund per donor, or a tag on the donation).")
        if errs:
            cx.st.review("trustee_decision", "Formula errors shown in a donor account sheet",
                         {"sheet": sid, "cells": errs, "shown": "#VALUE!", "cause": "serial-number formula breaks where the voucher number is blank"},
                         severity="low", suggested_action="Cosmetic; fill in the missing voucher numbers.")
    cx.skip(fid, "Mutual Funds", "owned by another transform (investments)", 0)


# ---------------------------------------------------------------- fund utilisation summary (F200)

def utilisation_statement(cx):
    fid = "F200"
    skey = "evt:stmt:F200"
    cx.emit("annual_statements", skey,
            {"fy": None, "entity": "trust", "source_label": "Fund utilisation summary 2018-24", "is_signed_audit": False,
             "notes": "CUMULATIVE since May 2018, not one financial year: each Summary column adds one more period to the one before. "
                      "The first column (FY18/FY24) is typed in (hard-coded) and no longer agrees with the detail rows; later columns are formulas. "
                      "Amounts are typed with a free-text description; no dates, vouchers or payees. Includes planned ('Upcoming') projects. "
                      "Workbook last saved 2026-03-25. All lines are memo lines and never add into income or expenditure."},
            [src(fid, "Summary", 1)])
    order = 0
    cats = [("Educational Support", 17, "B"), ("Environmental", 7, "B"), ("Medical Assistance", 11, "C"), ("Religious", 10, "B"), ("Social Welfare", 22, "B")]
    detail = {}
    for sheet, trow, _ in cats:
        rows = cx.rows(fid, sheet)
        sid = cx.sid(fid, sheet)
        d = dict(rows)
        detail[sheet] = d
        tot = ZERO
        for rn, c in rows:
            if rn < 2 or not is_num(c.get("A")) or rn >= trow:
                continue
            cx.read(fid, sheet)
            order += 1
            tot += D(c["A"])
            cx.emit("annual_statement_lines", f"{skey}:{sid[-3:]}:{rn}",
                    {"statement_key": skey, "side": "memo", "label": f"{sheet}: {clean_text(c.get('B'))}", "amount": D(c["A"]),
                     "cell_ref": f"{sheet}!A{rn}", "line_order": order}, [src(fid, sheet, rn)])
        cx.check(f"{sid} total A{trow}", tot, d[trow]["A"], {"sheet": sid, "cell": f"A{trow}"})
        order += 1
        cx.read(fid, sheet)
        cx.emit("annual_statement_lines", f"{skey}:{sid[-3:]}:{trow}",
                {"statement_key": skey, "side": "memo", "label": f"{sheet}: TOTAL (cumulative, includes planned items)", "amount": D(d[trow]["A"]),
                 "cell_ref": f"{sheet}!A{trow}", "line_order": order}, [src(fid, sheet, trow)])
    e = detail["Educational Support"]
    order += 1
    cx.read(fid, "Educational Support")
    cx.emit("annual_statement_lines", f"{skey}:S01:24",
            {"statement_key": skey, "side": "memo", "label": "Educational Support: stray second 'Total' typed below the table", "amount": D(e[24]["B"]),
             "cell_ref": "Educational Support!B24", "line_order": order}, [src(fid, "Educational Support", 24)])
    rows = cx.rows(fid, "Summary")
    d = dict(rows)
    hdr = d[1]
    for rn, c in rows:
        if rn < 2:
            continue
        cx.read(fid, "Summary")
        for col in "BCDE":
            order += 1
            how = "typed, hard-coded" if not (c.get("_f") or {}).get(col) else "formula"
            cx.emit("annual_statement_lines", f"{skey}:S06:{col}{rn}",
                    {"statement_key": skey, "side": "memo", "label": f"Summary: {clean_text(c['A'])} / cumulative to {clean_text(hdr[col])} ({how})",
                     "amount": D(c[col]), "cell_ref": f"Summary!{col}{rn}", "line_order": order}, [src(fid, "Summary", rn)])
    # hard-coded base column vs today's detail rows
    for cat_row, sheet, lo, hi, cause in ((4, "Medical Assistance", 2, 5, "the Sahyadri line (A3) now reads 1,000,000; the March 2024 statement F050 had 800,000"),
                                          (6, "Social Welfare", 2, 16, "the Aarya Stree Shakti line (A14) now reads 250,000; F050 had 150,000")):
        recomputed = sum_col(cx.rows(fid, sheet), "A", lo, hi)
        cx.check(f"F200.S06 base column B{cat_row} ({sheet}) vs detail rows A{lo}:A{hi}", recomputed, d[cat_row]["B"],
                 {"cell": f"F200.S06!B{cat_row}", "detail": f"{cx.sid(fid, sheet)}!A{lo}:A{hi}", "cause": cause,
                  "effect": "'FY24/FY25 minus FY18/FY24' overstates the 2024-25 spend"},
                 title="Fund utilisation summary: hard-coded base column is out of step with its detail", severity="medium",
                 action="Restate the summary per financial year from vouchers.")
    cx.st.review("trustee_decision", "Fund utilisation summary is cumulative and mixes plans with money spent",
                 {"sheet": "F200.S06", "grand_totals_row_7": {clean_text(hdr[c_]): str(d[7][c_]) for c_ in "BCDE"},
                  "social_welfare_column_C_range": (d[6].get("_f") or {}).get("C"),
                  "note": "column C for Social Welfare stops at row 16 and omits the two lines dated Oct/Nov 2024 (159,000 and 7,260)",
                  "diwali_2023": {"F200.S05!A16": str(detail["Social Welfare"][16]["A"]), "F050 statement": "77,343", "F049 annual report": "75,000 + 37,250"}},
                 severity="medium", suggested_action="Restate per financial year; keep planned projects apart; settle the Diwali 2023 figure.")


# ---------------------------------------------------------------- not importable: seat charts, outlines, lists

def not_importable(cx):
    for fid, reason in (("F029", "seat chart / seat list"), ("F031", "programme outline"), ("F041", "name list (no money)"),
                        ("F043", "earlier copy of the Gaurav 2024 planning workbook (F051 imported)"), ("F052", "award nominee list (name list, no money)"),
                        ("F037", "duplicate of F042 'Bus Payment Return'"), ("F094", "early snapshot superseded by F095")):
        if not (RAW_DIR / f"{fid}.jsonl").exists():
            continue
        for sh in raw_sheets(fid):
            n = len(raw_rows(fid, sh))
            cx.read(fid, sh, n)
            cx.skip(fid, sh, reason, n)


TRUSTEE_QUESTIONS = [
    ("Q2 Sahitya Sammelan 2022: show the event gross or only the trust's share?",
     {"files": ["F201"], "note": "part of the receipts went to the partner body's bank account ('Paid Acc' column); the partner is written ABCKP / ABCKPMS and never expanded"}),
    ("Q4 EDK 2024: was the 19,451 handed to the Thane body a grant or a pass-through?",
     {"sheet": "F042.S03", "row": 17, "amount": "19451", "also": "is 'Adv_Payment' (37,000, F042.S01 column Q) advertisement income? 8 of 11 rows say 'Advertisement' in the name cell"}),
    ("Q5 Events that span two financial years: recognise income by receipt date or by event?",
     {"examples": {"Gaurav 2023": "receipts from 10 Mar 2023, event 14 May 2023", "Gaurav 2024": "receipts from 29 Feb 2024, event 5 May 2024"},
      "imported": "each line keeps its own date; the event belongs to the FY of the event date"}),
    ("Q8 Repayable medical aid: standing policy or one-off? Is it part of Niramay?",
     {"sheets": ["F011.S06", "F011.S07"], "disbursed": "2 x 25000 on 2024-10-23", "repaid": "20 instalments of 2500, last 2025-07-25",
      "niramay_line": "F200.S03!A6 63310", "note": "no written terms, due dates or interest on the sheets"}),
    ("Q11 May names of scholarship beneficiaries (minors) be stored?",
     {"sheet": "F175.S01", "applications": 4, "imported": "names, date of birth, school and parent contact, flagged needs_review"}),
    ("Q12 Meaning of terms used without explanation",
     {"terms": ["Aadharstambh", "Project Diya", "Project Aarambh", "SVDS", "ABCKP / ABCKPMS", "Balshikshan Deposit"],
      "absent_from_these_files": ["Udaan", "Pancham"]}),
    ("Q14 Expense and travel claims for the 2026 projects: approved and paid?",
     {"files": ["F138-F147"], "note": "9 documents (6 claims, 16,906 in all, and 2 vouchers of 20,000); approval boxes blank; "
      "not row data, not imported by this transform; they relate to projects Amrutdhara and Ravikiran"}),
]


def run():
    utf8_stdout()
    cx = Ctx()
    st = cx.st
    gaurav_2023(cx)
    gaurav_2024(cx)
    gaurav_2024_budget(cx)
    edk_2024(cx)
    edk_2025(cx)
    sahitya_2022(cx)
    independence_day_2022(cx)
    books(cx)
    schemes(cx)
    earmarked_accounts(cx)
    utilisation_statement(cx)
    not_importable(cx)
    for title, ev in TRUSTEE_QUESTIONS:
        st.review("trustee_decision", title, ev, severity="medium", suggested_action="Trustee to answer.")

    print("\n== event accounts (lines | income | expense | net | memo)")
    for slug in sorted(cx.event_tot):
        t = cx.event_tot[slug]
        print(f"  {slug:30s} {cx.event_n[slug]:4d} | {t['income']:>12} | {t['expense']:>12} | {t['income'] - t['expense']:>12} | {t['memo']:>12}")
    print("\n== main-book sales by FY of the row date (amount, copies):", cx.by_fy_books)
    print("\n== scheme disbursements (scheme, year: n, amount, beneficiaries, flagged)")
    for (slug, fy), items in sorted(cx.scheme_tot.items()):
        print(f"  {slug:18s} {fy:20s} n={len(items):2d} amount={sum(a for a, _, _ in items):>12} "
              f"beneficiaries={sum(c or 0 for _, c, _ in items) or '-'} flagged={sum(1 for _, _, r in items if r)}")
    bad = [c for c in cx.checks if not c[3]]
    print(f"\n== checks against printed totals: {len(cx.checks)} made, {len(cx.checks) - len(bad)} agree, {len(bad)} differ")
    for label, comp, printed, _ in bad:
        print(f"  DIFF {label}: recomputed {comp} printed {printed}")
    print("\n== per source sheet")
    for sid in sorted(cx.tally):
        print(f"  {sid}: " + ", ".join(f"{k}={v}" for k, v in sorted(cx.tally[sid].items())))
    print("\n== review items by kind:", dict(Counter(r["kind"] for r in st.reviews.values())))
    return st.close()


if __name__ == "__main__":
    run()
