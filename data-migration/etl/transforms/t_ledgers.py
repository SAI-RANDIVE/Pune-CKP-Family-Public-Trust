"""LEDGER transform: expenses, transfers, printed year-end statements.

Sources (see data-migration/reports/phase0/B_ledgers.md):
  expenses / transfers   canonical voucher sheets F016, F026, F033, F080 and, for 2026-27,
                         the per-bank workbooks F134 (Saraswat), F136 (HDFC), F154 (SBI);
                         plus the outward lines of the receipts-and-payments sheets that have
                         no voucher rows behind them (bank charges, FD creation, event totals).
  annual_statements      every Balance_Sheet_<FY> sheet, line by line, with cell references.
  event_account_lines    event sheets embedded in the ledgers (Sangeet Rajani 2022, Evening
                         Show 2023) and the "Book Money Trnsfr Record" sheets.

Categories, event / scheme / fund tags and the expense-versus-transfer decision are read from
data-migration/mappings/expense_heads.csv; nothing about them is hard-coded here.
"""
import os, sys; sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import csv
import re
from collections import Counter, defaultdict
from datetime import datetime
from decimal import Decimal
from difflib import SequenceMatcher

from lib import (MAPPINGS, Staging, clean_text, fy_of, parse_amount, parse_date, raw_rows, raw_sheets,
                 src, utf8_stdout)

DOMAIN = "ledgers"
HEADS_CSV = MAPPINGS / "expense_heads.csv"
ZERO = Decimal("0.00")
BAD_DATE_NOTES = ("ambiguous_dmy", "text_month_first", "unparsed")

# ---------------------------------------------------------------- source map

CANON = [  # one entry per canonical voucher sheet
    dict(fy="2022-23", fid="F016", sheet="Vouchers 2022-23", bank="saraswat", numerical=None),
    dict(fy="2023-24", fid="F026", sheet="Vouchers 2023-24", bank="saraswat", numerical=None),
    dict(fy="2024-25", fid="F033", sheet="Vouchers 2024-25", bank="saraswat",
         numerical=("F033", "Numerical Vouchers 2024-25")),
    dict(fy="2025-26", fid="F080", sheet="Vouchers 2025-26", bank="saraswat",
         numerical=("F080", "Numerical Vouchers 2025-26")),
    dict(fy="2026-27", fid="F134", sheet="Vouchers 2026-27", bank="saraswat",
         numerical=("F134", "Numerical Vouchers 2026-27")),
    dict(fy="2026-27", fid="F136", sheet="HDFC Outwards 26-27", bank="hdfc",
         numerical=("F136", "Vouchers"), import_unmatched=True),
    dict(fy="2026-27", fid="F154", sheet="SBI Expenditures", bank="sbi",
         numerical=("F154", "SBI Vouchers"), heading_col="H", head_from="block"),
]

# superseded copies: (canonical fid, [(fid, sheet, role, heading_col)])
SUPERSEDED = {
    "F016": [("F020", "Vouchers 2022-23", "duplicate")],
    "F080": [("F085", "Vouchers 2025-26", "duplicate"), ("F085", "Numerical Vouchers 2025-26", "duplicate"),
             ("F083", "Numerical Vouchers 2025-26", "enrichment")],
    "F134": [("F132", "Vouchers 2026-27", "duplicate"), ("F132", "Numerical Vouchers 2026-27", "duplicate"),
             ("F162", "Saraswat Vouchers", "duplicate"), ("F168", "Saraswat Vouchers", "duplicate"),
             ("F173", "Saraswat Vouchers", "duplicate")],
    "F136": [("F132", "HDFC Vouchers", "duplicate"), ("F162", "HDFC Vouchers", "duplicate"),
             ("F168", "HDFC Vouchers", "duplicate"), ("F173", "HDFC Vouchers", "duplicate")],
    "F154": [("F132", "SBI Vouchers", "duplicate"), ("F162", "SBI Vouchers", "duplicate")],
}

CHEQUE_SHEETS = [("F016", "2022-23"), ("F026", "2023-24"), ("F033", "2024-25"), ("F080", "2025-26"), ("F154", "2026-27")]

STATEMENTS = [  # (fid, sheet, fy, entity, variant)
    ("F010", "Balance_Sheet_2016-17", "2016-17", "pre_trust", "A"),
    ("F010", "Balance_Sheet_2017-18", "2017-18", "pre_trust", "A"),
    ("F010", "Balance_Sheet_2018-19", "2018-19", "pre_trust", "A"),
    ("F010", "Balance_Sheet_2019-20", "2019-20", "pre_trust", "A"),
    ("F010", "Balance_Sheet_2020-21", "2020-21", "pre_trust", "A"),
    ("F010", "Balance_Sheet_2021-22", "2021-22", "pre_trust", "A"),
    ("F010", "Balance_Sheet_2022-23", "2022-23", "pre_trust", "A"),
    ("F012", "Balance_Sheet_2018-19", "2018-19", "trust", "A"),
    ("F012", "Balance_Sheet_2019-20", "2019-20", "trust", "A"),
    ("F012", "Balance_Sheet_2020-21", "2020-21", "trust", "A"),
    ("F012", "Balance_Sheet_2021-22", "2021-22", "trust", "A"),
    ("F016", "Balance_Sheet_2022-23", "2022-23", "trust", "B"),
    ("F026", "Balance_Sheet_2023-24", "2023-24", "trust", "B"),
    ("F033", "Balance_Sheet_2024-25", "2024-25", "trust", "B"),
    ("F080", "Balance_Sheet_2025-26", "2025-26", "trust", "B"),
    ("F134", "Balance_Sheet_2026-27", "2026-27", "trust", "B"),
]

# closing figure of year N against opening figure of year N+1: (label, (fid, sheet, cell), (fid, sheet, cell))
CONTINUITY = [
    ("trust bank 2018-19 -> 2019-20", ("F012", "Balance_Sheet_2018-19", "G42"), ("F012", "Balance_Sheet_2019-20", "D5")),
    ("trust petty cash 2018-19 -> 2019-20", ("F012", "Balance_Sheet_2018-19", "G43"), ("F012", "Balance_Sheet_2019-20", "D6")),
    ("trust bank 2019-20 -> 2020-21", ("F012", "Balance_Sheet_2019-20", "G54"), ("F012", "Balance_Sheet_2020-21", "D5")),
    ("trust petty cash 2019-20 -> 2020-21", ("F012", "Balance_Sheet_2019-20", "G55"), ("F012", "Balance_Sheet_2020-21", "D6")),
    ("trust bank 2020-21 -> 2021-22", ("F012", "Balance_Sheet_2020-21", "G58"), ("F012", "Balance_Sheet_2021-22", "D5")),
    ("trust petty cash 2020-21 -> 2021-22", ("F012", "Balance_Sheet_2020-21", "G59"), ("F012", "Balance_Sheet_2021-22", "D6")),
    ("trust bank 2021-22 -> 2022-23", ("F012", "Balance_Sheet_2021-22", "G63"), ("F016", "Balance_Sheet_2022-23", "D4")),
    ("trust petty cash 2021-22 -> 2022-23", ("F012", "Balance_Sheet_2021-22", "G64"), ("F016", "Balance_Sheet_2022-23", "D5")),
    ("trust bank 2022-23 -> 2023-24 (computed closing)", ("F016", "Balance_Sheet_2022-23", "G69"), ("F026", "Balance_Sheet_2023-24", "D4")),
    ("trust petty cash 2022-23 -> 2023-24", ("F016", "Balance_Sheet_2022-23", "G70"), ("F026", "Balance_Sheet_2023-24", "D5")),
    ("trust bank 2023-24 -> 2024-25", ("F026", "Balance_Sheet_2023-24", "G53"), ("F033", "Balance_Sheet_2024-25", "D4")),
    ("trust petty cash 2023-24 -> 2024-25", ("F026", "Balance_Sheet_2023-24", "G54"), ("F033", "Balance_Sheet_2024-25", "D5")),
    ("trust bank 2024-25 -> 2025-26", ("F033", "Balance_Sheet_2024-25", "G58"), ("F080", "Balance_Sheet_2025-26", "D4")),
    ("trust petty cash 2024-25 -> 2025-26", ("F033", "Balance_Sheet_2024-25", "G59"), ("F080", "Balance_Sheet_2025-26", "D5")),
    ("trust bank 2025-26 -> 2026-27", ("F080", "Balance_Sheet_2025-26", "G59"), ("F134", "Balance_Sheet_2026-27", "D4")),
    ("trust petty cash 2025-26 -> 2026-27", ("F080", "Balance_Sheet_2025-26", "G60"), ("F134", "Balance_Sheet_2026-27", "D5")),
    ("group bank 2016-17 -> 2017-18", ("F010", "Balance_Sheet_2016-17", "G27"), ("F010", "Balance_Sheet_2017-18", "D5")),
    ("group petty cash 2016-17 -> 2017-18", ("F010", "Balance_Sheet_2016-17", "G29"), ("F010", "Balance_Sheet_2017-18", "D6")),
    ("group savings 2017-18 -> 2018-19", ("F010", "Balance_Sheet_2017-18", "G39"), ("F010", "Balance_Sheet_2018-19", "D5")),
    ("group petty cash 2017-18 -> 2018-19", ("F010", "Balance_Sheet_2017-18", "G40"), ("F010", "Balance_Sheet_2018-19", "D6")),
    ("group FD 2017-18 -> 2018-19", ("F010", "Balance_Sheet_2017-18", "G38"), ("F010", "Balance_Sheet_2018-19", "D7")),
    ("group savings 2018-19 -> 2019-20", ("F010", "Balance_Sheet_2018-19", "G50"), ("F010", "Balance_Sheet_2019-20", "D7")),
    ("group petty cash 2018-19 -> 2019-20", ("F010", "Balance_Sheet_2018-19", "G51"), ("F010", "Balance_Sheet_2019-20", "D8")),
    ("group savings 2019-20 -> 2020-21", ("F010", "Balance_Sheet_2019-20", "G36"), ("F010", "Balance_Sheet_2020-21", "D6")),
    ("group petty cash 2019-20 -> 2020-21", ("F010", "Balance_Sheet_2019-20", "G37"), ("F010", "Balance_Sheet_2020-21", "D7")),
    ("group savings 2020-21 -> 2021-22", ("F010", "Balance_Sheet_2020-21", "G22"), ("F010", "Balance_Sheet_2021-22", "D6")),
    ("group petty cash 2020-21 -> 2021-22", ("F010", "Balance_Sheet_2020-21", "G23"), ("F010", "Balance_Sheet_2021-22", "D7")),
    ("group savings 2021-22 -> 2022-23", ("F010", "Balance_Sheet_2021-22", "G24"), ("F010", "Balance_Sheet_2022-23", "D22")),
    ("group petty cash 2021-22 -> 2022-23", ("F010", "Balance_Sheet_2021-22", "G25"), ("F010", "Balance_Sheet_2022-23", "D6")),
]

# subtotal rows whose printed label belongs to another head (phase-0 section 3.4): (fid, sheet) -> {row: comment}
MISLABELLED = {
    ("F033", "Vouchers 2024-25"): {263: "subtotal of the Gaurav Sohola 2025 block"},
    ("F080", "Vouchers 2025-26"): {47: "subtotal of General Expenses (cash and bank), labelled as petty cash",
                                   181: "subtotal of the Dnyankiran expenses block",
                                   306: "subtotal of the Carrom & Chess block"},
    ("F134", "Vouchers 2026-27"): {26: "subtotal of General Expenses (cash and bank), labelled as petty cash",
                                   105: "subtotal of the Dnyankiran expenses block",
                                   208: "subtotal of the Gaurav Sohola 2027 block"},
}

MISMATCH_TAG = {("F080", "Vouchers 2025-26"): "M1", ("F085", "Vouchers 2025-26"): "M1",
                ("F026", "Vouchers 2023-24"): "M2", ("F132", "Numerical Vouchers 2026-27"): "M4",
                ("F134", "Numerical Vouchers 2026-27"): "M5", ("F162", "Saraswat Vouchers"): "M5",
                ("F168", "Saraswat Vouchers"): "M6", ("F173", "Saraswat Vouchers"): "M6",
                ("F134", "Vouchers 2026-27"): "M7", ("F154", "SBI Expenditures"): "M8"}

# ---------------------------------------------------------------- pure helpers

ORG_RE = re.compile(r"\b(pvt|ltd|llp|enterprises?|services?|traders|treaders|creations|media|studio|travels|"
                    r"electricals|retreat|canteen|bhavan|hall|bank|trust|sangha|mandal|manch|amazon|fund|"
                    r"association|foundation|society|college|school|kitchen|foods?|graphics?|grafics|"
                    r"movies|productions|printers|printlinks|company|& co|staff|series|agencies|events?)\b", re.I)
OWN_TRUST_RE = re.compile(r"pune ckp family public trust|\bpcfpt\b", re.I)
VNO_RE = re.compile(r"^\s*(?:(HDFC|SBI)\s*/\s*)?(\d{1,4})([A-Za-z]?)(?:\s*/\s*(\d{2})\s*([~\-/])\s*(\d{2}))?\s*$")
CHEQUE_RE = re.compile(r"(?:\bch(?:e)?q(?:ue)?s?\.?)\s*(?:no\.?|number|#)?\s*[:#\-]?\s*(\d{5,6})\b", re.I)
REF_RE = re.compile(r"\b((?:NEFT|IMPS|RTGS|UPI|TRF|IB|MB)\s*[/:\-]\s*[A-Za-z0-9_/]+|SRCB[A-Z0-9]\d{8,}|HDFC[HN]\d{8,}|"
                    r"SBIN\s?\d{9,}|CAMS\s*:\s*\d+)", re.I)
TOTAL_RE = re.compile(r"^\s*(total|payments?|cash payments)\b", re.I)
GRAND_RE = re.compile(r"^\s*(total expenses|payments from (hdfc|sbi) account)\s*$", re.I)
BLOCK_CODE_RE = re.compile(r"^[A-Z]{2}(-\d)?$")
PERIOD_LABEL_RE = re.compile(r"^\s*\d{4}\s*~")


def dec(v):
    """Amount cell -> (Decimal | None, note)."""
    return parse_amount(v)


def parse_voucher_no(s):
    """'004/23~24' -> {'series': None, 'number': 4, 'letter': '', 'y1': 23, 'y2': 24, 'sep': '~'}; None if not a voucher number."""
    t = clean_text(s)
    if not t:
        return None
    m = VNO_RE.match(t)
    if not m:
        return None
    return {"series": (m[1] or "").upper() or None, "number": int(m[2]), "letter": (m[3] or "").upper(),
            "y1": int(m[4]) if m[4] else None, "y2": int(m[6]) if m[6] else None, "sep": m[5]}


def voucher_suffix_status(s, fy):
    """'ok', 'no_suffix', 'separator_variant' (e.g. 018/24/25) or 'wrong_fy' (e.g. 165/23~25) for a sheet of FY '2023-24'."""
    p = parse_voucher_no(s)
    if p is None:
        return "unparsed"
    if p["y1"] is None:
        return "no_suffix"
    a, b = int(fy[2:4]), int(fy[5:7])
    if (p["y1"], p["y2"]) != (a, b):
        return "wrong_fy"
    return "separator_variant" if p["sep"] == "/" else "ok"


def vno_key(s):
    p = parse_voucher_no(s)
    return (p["series"], p["number"], p["letter"]) if p else None


def extract_cheque_no(text):
    m = CHEQUE_RE.search(text or "")
    return m[1] if m else None


def extract_ref(text):
    m = REF_RE.search(text or "")
    return clean_text(m[1]) if m else None


def mode_from_text(text, is_cash):
    """cash column wins; otherwise read the wording: cheque, upi, neft (incl. IMPS/RTGS/bank transfer refs), online, other."""
    if is_cash:
        return "cash"
    t = (text or "").lower()
    if re.search(r"\bch(e)?q(ue)?s?\b", t):
        return "cheque"
    if re.search(r"\bupi\b|g\s?pay|google\s?pay", t):
        return "upi"
    if re.search(r"\bneft\b|\bimps\b|\brtgs\b|\btrf\b|\bib/|srcb[a-z0-9]\d{6,}|hdfc[hn]\d{6,}|sbin\s?\d{6,}|transfer", t):
        return "neft"
    if re.search(r"\bonline\b|godaddy|cams\s*:", t):
        return "online"
    return "other"


def norm_sim(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def sim(a, b):
    a, b = norm_sim(a), norm_sim(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    n = min(len(a), len(b), 40)
    if n >= 12 and a[:n] == b[:n]:
        return 0.95
    return SequenceMatcher(None, a, b).ratio()


def head_key(s):
    return (clean_text(s) or "").lower()


class Heads:
    """mappings/expense_heads.csv. A line whose head_as_written starts with '~' is a regular expression
    tested (case-insensitive) against the particulars; any other line is an exact head / heading text."""

    FIELDS = ("category_code", "event_slug", "scheme_slug", "fund_code", "transfer_kind")

    def __init__(self, rows):
        self.by_head, self.patterns, self.names = {}, [], {}
        for r in rows:
            h = clean_text(r.get("head_as_written"))
            if not h:
                continue
            row = {k: clean_text(r.get(k)) for k in self.FIELDS}
            if row["category_code"]:
                self.names.setdefault(row["category_code"], (clean_text(r.get("name_en")), clean_text(r.get("name_mr"))))
            if h.startswith("~"):
                self.patterns.append((re.compile(h[1:], re.I), row))
            else:
                self.by_head[head_key(h)] = row

    @classmethod
    def load(cls, path=HEADS_CSV):
        with open(path, encoding="utf-8-sig", newline="") as f:
            return cls(list(csv.DictReader(f)))

    def classify(self, head, particulars):
        """-> dict(category_code, event_slug, scheme_slug, fund_code, transfer_kind, head_known, by).
        The first matching pattern that names a category or a transfer kind decides the nature of the row;
        event / scheme / fund come from the first matching pattern that has them, then from the head line."""
        out = dict.fromkeys(self.FIELDS)
        out["by"] = None
        text = particulars or ""
        for rx, row in self.patterns:
            if not rx.search(text):
                continue
            if out["by"] is None and (row["category_code"] or row["transfer_kind"]):
                out["category_code"], out["transfer_kind"], out["by"] = row["category_code"], row["transfer_kind"], "pattern"
            for k in ("event_slug", "scheme_slug", "fund_code"):
                out[k] = out[k] or row[k]
        hrow = self.by_head.get(head_key(head))
        out["head_known"] = hrow is not None
        if hrow:
            if out["by"] is None and (hrow["category_code"] or hrow["transfer_kind"]):
                out["category_code"], out["transfer_kind"], out["by"] = hrow["category_code"], hrow["transfer_kind"], "head"
            for k in ("event_slug", "scheme_slug", "fund_code"):
                out[k] = out[k] or hrow[k]
        return out


def statement_side(variant, col, label, section=None):
    """Side of a printed line. col 'D' = left (inward) column, 'G' = right (outward) column."""
    t = (clean_text(label) or "").lower()
    t2 = re.sub(r"\s+", " ", t)
    if re.match(r"^(total|inward entries|outward entries)\b", t2) or t2.startswith("total "):
        return "total"
    if re.search(r"withdrawal to petty|petty cash withdrawal", t2) or section == "petty_wd":
        return "memo"
    if col == "D":
        if re.search(r"\bc\s*/\s*f\b|\bcf$|c/$", t2) or (variant == "A" and re.search(r"account balance$", t2)):
            return "opening"
        if variant == "B" and (t2.startswith("saraswat bank current account - in") or re.match(r"^petty cash( in hand.*)?$", t2)):
            return "total"
        return "inward"
    if re.search(r"account\s*balance|savings account|fixed deposit account|^petty cash( balance)?$|\bfd\s*\d|^pnb fd", t2):
        return "closing"
    return "outward"


def is_org_name(name):
    return bool(ORG_RE.search(name or ""))


def match_rows(canon, other, allow_amount_diff=True):
    """Pair rows of two voucher lists. Returns ([(canon_row, other_row, {flags})], [unmatched other rows]).
    A pair always has equal cash and bank amounts, except in the last pass (same number and date)."""
    left = list(canon)
    rest = list(other)
    pairs = []

    def run(pred, score=None):
        nonlocal rest
        still = []
        for o in rest:
            cands = [c for c in left if pred(c, o)]
            if not cands:
                still.append(o)
                continue
            best = max(cands, key=(lambda c: score(c, o)) if score else (lambda c: 0))
            left.remove(best)
            pairs.append((best, o))
        rest = still

    same_amt = lambda c, o: c["cash"] == o["cash"] and c["bank"] == o["bank"]
    same_vno = lambda c, o: c["vkey"] is not None and c["vkey"] == o["vkey"]
    same_date = lambda c, o: c["date"] == o["date"]
    txt = lambda c, o: max(sim(c["rem"], o["rem"]), sim(c.get("payee"), o["rem"]) * 0.9)
    run(lambda c, o: same_amt(c, o) and same_date(c, o) and same_vno(c, o), txt)
    run(lambda c, o: same_amt(c, o) and same_date(c, o) and txt(c, o) >= 0.5, txt)
    run(lambda c, o: same_amt(c, o) and same_vno(c, o) and txt(c, o) >= 0.5, txt)
    run(lambda c, o: same_amt(c, o) and txt(c, o) >= 0.6, txt)
    run(lambda c, o: same_amt(c, o) and same_date(c, o) and not o["rem"], None)
    if allow_amount_diff:
        run(lambda c, o: same_vno(c, o) and same_date(c, o) and txt(c, o) >= 0.5, txt)
    out = []
    for c, o in pairs:
        flags = {}
        if c["date"] != o["date"]:
            flags["date"] = (str(c["date"]), str(o["date"]))
        if c["vkey"] != o["vkey"] and c["vkey"] and o["vkey"]:
            flags["voucher_no"] = (c["vno"], o["vno"])
        if not same_amt(c, o):
            flags["amount"] = (str(c["cash"] + c["bank"]), str(o["cash"] + o["bank"]))
        out.append((c, o, flags))
    return out, rest


# ---------------------------------------------------------------- sheet readers

def sid(fid, sheet):
    return f"S{raw_sheets(fid).index(sheet) + 1:02d}"


def ref(fid, sheet):
    return f"{fid}.{sid(fid, sheet)}"


_cells = {}


def cell(fid, sheet, a1):
    if (fid, sheet) not in _cells:
        _cells[(fid, sheet)] = dict(raw_rows(fid, sheet))
    m = re.match(r"([A-Z]+)(\d+)", a1)
    return _cells[(fid, sheet)].get(int(m[2]), {}).get(m[1])


def read_voucher_sheet(fid, sheet, heading_col=None):
    """Parse one voucher sheet (grouped 'Vouchers' layout or flat 'Numerical Vouchers' layout).
    -> dict(rows=[...], blocks=[...], grand=[...], cancelled=[...], other=int, cols={...})"""
    rows = raw_rows(fid, sheet)
    hdr_row, cols = None, {}
    for r, c in rows:
        for k, v in c.items():
            if k != "_f" and isinstance(v, str) and (clean_text(v) or "").lower() == "voucher no.":
                hdr_row = r
                for k2, v2 in c.items():
                    t = (clean_text(v2) or "").lower() if isinstance(v2, str) else ""
                    if t == "voucher no.":
                        cols["vno"] = k2
                    elif t == "date":
                        cols["date"] = k2
                    elif t.startswith("remarks"):
                        cols["rem"] = k2
                    elif t.startswith("payment to"):
                        cols["payee"] = k2
                    elif t == "cash payment":
                        cols["cash"] = k2
                    elif t == "bank payment":
                        cols["bank"] = k2
                    elif t == "amount":
                        cols["amt"] = k2
                    elif t == "heading":
                        cols["heading"] = k2
                break
        if hdr_row:
            break
    if not hdr_row:
        raise ValueError(f"{fid} {sheet}: header row with 'Voucher No.' not found")
    if "payee" not in cols and ord(cols["rem"]) - ord(cols["date"]) == 2:
        cols["payee"] = chr(ord(cols["date"]) + 1)
    if heading_col:
        cols["heading"] = heading_col
    out = dict(rows=[], blocks=[], grand=[], cancelled=[], other=0, cols=cols, fid=fid, sheet=sheet, hdr=hdr_row)
    block = None
    sub = None
    for r, c in rows:
        if r <= hdr_row:
            continue
        vno = clean_text(c.get(cols["vno"])) if isinstance(c.get(cols["vno"]), str) else None
        d_raw = c.get(cols["date"])
        rem = clean_text(c.get(cols["rem"]))
        payee = clean_text(c.get(cols.get("payee"))) if cols.get("payee") else None
        if payee and not re.search(r"[A-Za-z]", payee):
            payee = None
        cash, cnote = dec(c.get(cols["cash"])) if "cash" in cols else (None, None)
        bank, bnote = dec(c.get(cols["bank"])) if "bank" in cols else (None, None)
        amt, anote = dec(c.get(cols["amt"])) if "amt" in cols else (None, None)
        has_amt = any(x is not None for x in (cash, bank, amt))
        nonzero = any(x not in (None, ZERO) for x in (cash, bank, amt))
        d_text = clean_text(d_raw) if isinstance(d_raw, str) else None
        if vno and BLOCK_CODE_RE.match(vno) and d_text:
            block = dict(code=vno, title=d_text, row=r, rows=[], subtotal=None)
            out["blocks"].append(block)
            sub = None
            continue
        if not vno and d_text and not has_amt and not rem and parse_date(d_text)[0] is None:
            if d_text.lower().startswith("musical event"):
                sub = d_text
            else:
                block = dict(code=None, title=d_text, row=r, rows=[], subtotal=None)
                out["blocks"].append(block)
                sub = None
            continue
        if not vno and d_raw is None and rem and TOTAL_RE.match(rem) and has_amt:
            tot = dict(row=r, label=rem, cash=cash, bank=bank, amt=amt)
            if GRAND_RE.match(rem):
                out["grand"].append(tot)
            elif block is not None and block["subtotal"] is None:
                block["subtotal"] = tot
            else:
                out["grand"].append(dict(tot, orphan=True))
            continue
        if nonzero and (d_raw is not None or rem):
            d, dnote = parse_date(d_raw)
            notes = [n for n in (cnote, bnote, anote) if n]
            is_cash_block = bool(block and re.search(r"petty\s*cash", block["title"], re.I))
            if "amt" in cols and amt is not None:
                cash, bank = (amt, ZERO) if is_cash_block else (ZERO, amt)
            row = dict(row=r, vno=vno, vkey=vno_key(vno), date=d, date_raw=d_raw, date_note=dnote, payee=payee, rem=rem,
                       cash=cash or ZERO, bank=bank or ZERO, amt_notes=notes,
                       heading=clean_text(c.get(cols["heading"])) if cols.get("heading") else None,
                       block=block, sub=sub, fid=fid, sheet=sheet)
            out["rows"].append(row)
            if block is not None:
                block["rows"].append(row)
            continue
        if rem and "CANCELLED" in rem.upper():
            out["cancelled"].append(dict(row=r, vno=vno, rem=rem))
            continue
        out["other"] += 1
    return out


def sheet_total_checks(st, vs, fy):
    """Block subtotals and the grand total against the rows above them. Raises total_mismatch items."""
    fid, sheet = vs["fid"], vs["sheet"]
    tag = MISMATCH_TAG.get((fid, sheet))
    where = ref(fid, sheet)
    for b in vs["blocks"]:
        if b["subtotal"] is None:
            continue
        t = b["subtotal"]
        sc = sum((x["cash"] for x in b["rows"]), ZERO)
        sb = sum((x["bank"] for x in b["rows"]), ZERO)
        pc, pb = (t["cash"] or ZERO), (t["bank"] or ZERO)
        if t["amt"] is not None:
            pc, pb, sc, sb = ZERO, t["amt"], ZERO, sc + sb
        if (pc, pb) != (sc, sb):
            st.review("total_mismatch", f"Block subtotal differs from its rows ({where} row {t['row']})",
                      {"sheet": where, "row": t["row"], "label": t["label"], "printed_cash": str(pc), "printed_bank": str(pb),
                       "rows_cash": str(sc), "rows_bank": str(sb)}, "medium", 0.9, "Check the block against the bank statement.")
    for g in vs["grand"]:
        if g.get("orphan"):
            continue
        before = [x for x in vs["rows"] if x["row"] < g["row"]]
        sc = sum((x["cash"] for x in before), ZERO)
        sb = sum((x["bank"] for x in before), ZERO)
        pc, pb = (g["cash"] or ZERO), (g["bank"] or ZERO)
        if g["amt"] is not None:
            pc, pb, sc, sb = ZERO, g["amt"], ZERO, sc + sb
        if (pc, pb) != (sc, sb):
            title = f"{tag + ': ' if tag else ''}Printed grand total differs from the voucher rows ({where})"
            ev = {"sheet": where, "row": g["row"], "label": g["label"], "printed_cash": str(pc), "printed_bank": str(pb),
                  "rows_cash": str(sc), "rows_bank": str(sb), "difference_cash": str(sc - pc), "difference_bank": str(sb - pb)}
            omitted = [dict(row=b["subtotal"]["row"], label=b["subtotal"]["label"], bank=str(b["subtotal"]["bank"] or b["subtotal"]["amt"]),
                            cash=str(b["subtotal"]["cash"])) for b in vs["blocks"]
                       if b["subtotal"] and b["subtotal"]["row"] < g["row"]
                       and ((b["subtotal"]["bank"] or b["subtotal"]["amt"] or ZERO) == sb - pb != ZERO
                            or (b["subtotal"]["cash"] or ZERO) == sc - pc != ZERO)]
            if omitted:
                ev["subtotal_equal_to_difference"] = omitted
            st.review("total_mismatch", title, ev, "high" if abs(sb - pb) + abs(sc - pc) >= 10000 else "medium", 0.95,
                      "The rows are imported as written; correct the total formula in the workbook.")
    return


# ---------------------------------------------------------------- record builders

class Builder:
    def __init__(self, st, heads):
        self.st, self.heads = st, heads
        self.recs = []                 # dict(table, key, rec, sources, row, bank, fy, fid)
        self.unknown_heads = Counter()
        self.stats = defaultdict(Counter)   # sheet ref -> counters
        self.fy_sums = defaultdict(lambda: defaultdict(lambda: ZERO))

    def person_for(self, payee, category):
        if not payee or OWN_TRUST_RE.search(payee):
            return None
        p = {"name": payee, "role": "beneficiary" if category in ("welfare-education", "welfare-medical") else "vendor"}
        if is_org_name(payee):
            p["is_org"] = True
        return p

    def add(self, *, fy, fid, sheet, row, cellref=None, date, date_raw=None, date_note=None, cash, bank, vno, payee, rem,
            head, block_note, bank_slug, mode_as_written, extra_notes=None, force_review=None, row_obj=None, keytag=None,
            force_kind=None, outside_outward=False):
        st = self.st
        where = f"{ref(fid, sheet)} {'cell ' + cellref if cellref else 'row ' + str(row)}"
        cl = self.heads.classify(head, rem or payee or "")
        if force_kind:
            cl["transfer_kind"] = force_kind
        amount = cash + bank
        needs_review = bool(force_review)
        notes = [n for n in ([block_note] + list(extra_notes or [])) if n]
        if not cl["head_known"]:
            self.unknown_heads[head] += 1
        if date is None:
            needs_review = True
            if not force_review or cl["transfer_kind"]:
                st.review("missing_date", f"Row without a date ({where})",
                          {"sheet": ref(fid, sheet), "row": row, "amount": str(amount), "voucher_no": vno}, "low", None,
                          "Imported with the sheet's financial year and no date; fill the date from the voucher.")
        elif fy_of(date) != fy:
            needs_review = True
            st.review("date_outside_fy", f"Date outside the sheet's year {fy} ({where})",
                      {"sheet": ref(fid, sheet), "row": row, "date_as_written": str(date), "sheet_fy": fy, "amount": str(amount)},
                      "medium", None, "Imported with the date as written and the sheet's financial year; correct the year of the date.")
        if date_note in BAD_DATE_NOTES:
            needs_review = True
            st.review("ambiguous_date", f"Date not readable with certainty ({where})",
                      {"sheet": ref(fid, sheet), "row": row, "as_written": str(date_raw), "note": date_note}, "medium")
        kind = cl["transfer_kind"]
        slug = sid(fid, sheet)
        tail = keytag or (cellref if cellref else f"r{row}")
        if kind:
            is_cash_out = cash > ZERO and bank == ZERO
            to_slug = None
            if kind == "petty_cash":
                to_slug = "cash"
            elif kind == "own_account":
                m = re.search(r"\b(HDFC|SBI|SVC)\b", rem or "", re.I)
                to_slug = m[1].lower() if m else None
                if to_slug is None:
                    needs_review = True
            to_written = None
            m = re.search(r"TD\d{6,}", rem or "")
            if m:
                to_written = m[0]
            elif kind == "sip":
                m = re.search(r"ICICI Pru\w*\s+(.+?)\s+SIP", rem or "", re.I)
                to_written = ("ICICI Prudential " + m[1]) if m else clean_text(payee)
            elif kind == "own_account" and to_slug:
                to_written = {"hdfc": "HDFC account of the trust", "sbi": "SBI account of the trust", "svc": "SVC Bank account"}[to_slug]
            elif kind == "petty_cash":
                to_written = "Petty cash"
            rec = dict(entry_date=date, fy=fy, amount=amount, kind=kind,
                       from_bank_slug="cash" if is_cash_out else bank_slug, to_bank_slug=to_slug,
                       from_as_written=block_note, to_as_written=to_written, fixed_deposit_key=None, investment_key=None,
                       particulars=rem, voucher_no_as_written=vno, needs_review=needs_review)
            key = f"led:trf:{fy}:{fid}:{slug}:{tail}"
            table = "transfers"
        else:
            category = cl["category_code"]
            if not category or category == "uncategorised":
                category = "uncategorised"
                needs_review = True
                st.review("unclassified_head", f"Voucher row could not be classified ({where})",
                          {"sheet": ref(fid, sheet), "row": row, "head": head, "amount": str(amount)}, "medium", None,
                          "Kept as an expense. Add a line to mappings/expense_heads.csv or mark it as a transfer.",
                          "expenses", f"led:exp:{fy}:{fid}:{slug}:{tail}")
            is_cash = cash > ZERO and bank == ZERO
            if cash > ZERO and bank > ZERO:
                notes.append("Both a cash and a bank amount on the same voucher row.")
            cheque = extract_cheque_no(rem)
            pref = extract_ref(rem)
            if pref and not cheque:
                notes.append(f"Payment reference: {pref}")
            rec = dict(entry_date=date, fy=fy, cal_year=date.year if date else None, cal_month=date.month if date else None,
                       amount=amount, cash_amount=cash if cash > ZERO else None, bank_amount=bank if bank > ZERO else None,
                       voucher_no_as_written=vno, person=self.person_for(payee, category), payee_as_written=payee,
                       category_code=category, head_as_written=head, particulars=rem,
                       mode=mode_from_text(rem, is_cash), mode_as_written=mode_as_written,
                       cheque_no=cheque, bank_slug="cash" if is_cash else bank_slug,
                       event_slug=cl["event_slug"], scheme_slug=cl["scheme_slug"], fund_code=cl["fund_code"],
                       approved_by=None, notes=" ".join(notes) or None, needs_review=needs_review)
            key = f"led:exp:{fy}:{fid}:{slug}:{tail}"
            table = "expenses"
        item = dict(table=table, key=key, rec=rec, sources=[src(fid, sheet, row)], row=row, bank=bank_slug, fy=fy, fid=fid,
                    sheet=sheet, date=date, cash=cash, bank_amt=bank, rem=rem, vno=vno, payee=payee, row_obj=row_obj, notes=notes,
                    outside_outward=outside_outward)
        self.recs.append(item)
        self.stats[ref(fid, sheet)]["emitted"] += 1
        return item

    def flag(self, item, note=None):
        item["rec"]["needs_review"] = True
        if note and item["table"] == "expenses":
            item["notes"].append(note)
            item["rec"]["notes"] = " ".join(item["notes"])

    def emit_all(self):
        for it in self.recs:
            self.st.emit(it["table"], it["key"], it["rec"], it["sources"])


def as_match_row(it):
    return dict(cash=it["cash"], bank=it["bank_amt"], date=it["date"], vno=it["vno"], vkey=vno_key(it["vno"]),
                rem=it["rem"], payee=it["payee"], item=it)


# ---------------------------------------------------------------- vouchers

def voucher_number_review(st, vs, fy, numerical=False):
    rows = vs["rows"]
    where = ref(vs["fid"], vs["sheet"])
    blank = [x["row"] for x in rows if not x["vno"]]
    status = Counter()
    typos, seen = [], defaultdict(list)
    for x in rows:
        if not x["vno"]:
            continue
        s = voucher_suffix_status(x["vno"], fy)
        status[s] += 1
        if s in ("wrong_fy", "separator_variant", "unparsed"):
            typos.append({"row": x["row"], "as_written": x["vno"], "problem": s})
        if x["vkey"]:
            seen[x["vkey"]].append(x["row"])
    dups = {f"{k[0] + '/' if k[0] else ''}{k[1]:03d}{k[2]}": v for k, v in seen.items() if len(v) > 1}
    gaps = []
    cancelled = {vno_key(c["vno"]) for c in vs["cancelled"] if vno_key(c["vno"])}
    for series in sorted({k[0] for k in seen}, key=str):
        nums = sorted({k[1] for k in seen if k[0] == series})
        used = set(nums) | {k[1] for k in cancelled if k[0] == series}
        gaps += [f"{series + '/' if series else ''}{n:03d}" for n in range(nums[0], nums[-1] + 1) if n not in used]
    if not (blank or typos or dups or gaps or vs["cancelled"]):
        return
    st.review("voucher_number_conflict", f"Voucher numbering problems in {where}",
              {"sheet": where, "voucher_rows": len(rows), "blank_numbers": len(blank), "blank_rows": blank[:400],
               "duplicate_numbers": dups, "duplicate_number_count": len(dups),
               "suffix_typos": typos, "suffix_typo_count": len(typos), "numbers_not_used": gaps,
               "cancelled_rows": [{"row": c["row"], "voucher_no": c["vno"], "text": c["rem"]} for c in vs["cancelled"]]},
              "medium" if (blank or dups) else "low", None,
              "Numbers are kept only as voucher_no_as_written; new IDs are issued at load. No number is used as a key.")


def do_vouchers(st, b, heads, cfg):
    fy, fid, sheet, bank = cfg["fy"], cfg["fid"], cfg["sheet"], cfg["bank"]
    where = ref(fid, sheet)
    vs = read_voucher_sheet(fid, sheet)
    stats = b.stats[where]
    stats["voucher_rows_read"] = len(vs["rows"])
    stats["non_data_rows"] = vs["other"] + len(vs["blocks"]) + len(vs["grand"]) + sum(1 for x in vs["blocks"] if x["subtotal"])
    for c in vs["cancelled"]:
        st.skip("cancelled voucher without an amount")
        stats["skipped_cancelled"] += 1
    sheet_total_checks(st, vs, fy)
    voucher_number_review(st, vs, fy)
    bad = MISLABELLED.get((fid, sheet))
    if bad:
        ev = []
        for blk in vs["blocks"]:
            t = blk["subtotal"]
            if t and t["row"] in bad:
                ev.append({"row": t["row"], "label_as_printed": t["label"], "block": f"{blk['code'] or ''} {blk['title']}".strip(),
                           "actually": bad[t["row"]], "cash": str(t["cash"]), "bank": str(t["bank"])})
        if ev:
            st.review("total_mismatch", f"Subtotal rows carry the label of another head ({where})",
                      {"sheet": where, "subtotals": ev}, "low", 0.95,
                      "Rows are imported under the block they sit in, not under the subtotal's label.")
    # join the numerical list for the Heading
    num_pairs, num_un, numref = {}, [], None
    if cfg.get("numerical"):
        nfid, nsheet = cfg["numerical"]
        numref = ref(nfid, nsheet)
        ns = read_voucher_sheet(nfid, nsheet, cfg.get("heading_col"))
        b.stats[numref]["voucher_rows_read"] = len(ns["rows"])
        sheet_total_checks(st, ns, fy)
        for c in ns["cancelled"]:
            st.skip("cancelled voucher without an amount")
            b.stats[numref]["skipped_cancelled"] += 1
        pairs, num_un = match_rows(vs["rows"], ns["rows"])
        diffs = []
        for c, o, flags in pairs:
            num_pairs[c["row"]] = (o, flags)
            if flags:
                diffs.append({"vouchers_row": c["row"], "numerical_row": o["row"], **{k: list(v) for k, v in flags.items()}})
        b.stats[numref]["merged_as_enrichment"] = len(pairs)
        if diffs:
            st.review("conflicting_sources", f"'Vouchers' and 'Numerical Vouchers' disagree on some vouchers ({where} vs {numref})",
                      {"vouchers_sheet": where, "numerical_sheet": numref, "pairs_compared": len(pairs),
                       "differences": diffs, "difference_count": len(diffs)}, "medium", 0.9,
                      "The 'Vouchers' sheet (which ties to the receipts-and-payments sheet) is used; confirm number and date on the paper voucher.")
    for x in vs["rows"]:
        blk = x["block"]
        block_title = f"{blk['code'] + ' ' if blk and blk['code'] else ''}{blk['title'] if blk else ''}".strip() or None
        head = x["sub"] or (blk["title"] if blk else None) or "(no head)"
        extra, srcs_extra, amt_conflict = [], [], None
        if x["row"] in num_pairs:
            o, flags = num_pairs[x["row"]]
            if o["heading"] and cfg.get("head_from") == "block":
                extra.append(f"Heading in the numerical list: {o['heading']}.")
            elif o["heading"]:
                head = o["heading"]
            elif cfg.get("numerical"):
                extra.append("No Heading in the numerical list.")
            srcs_extra.append(src(*cfg["numerical"], o["row"], "enrichment"))
            if not x["payee"] and o["payee"]:
                x["payee"] = o["payee"]
            if "amount" in flags:
                amt_conflict = flags["amount"]
                extra.append(f"Amount differs in the numerical list: {flags['amount'][1]}.")
            if "date" in flags:
                extra.append(f"Date in the numerical list: {flags['date'][1]}.")
            if "voucher_no" in flags:
                extra.append(f"Number in the numerical list: {flags['voucher_no'][1]}.")
        row_bank = bank
        if blk and re.search(r"\bHDFC\b", blk["title"]) and bank != "hdfc":
            row_bank = "hdfc"
        mode_w = "Cash Payment" if x["cash"] > ZERO and x["bank"] == ZERO else "Bank Payment"
        if "amt" in vs["cols"]:
            mode_w = blk["title"] if blk else None
        note_block = f"Block: {block_title}." if block_title else None
        if x["sub"] and x["sub"] != head:
            extra.insert(0, f"Sub-block: {x['sub']}.")
        it = b.add(fy=fy, fid=fid, sheet=sheet, row=x["row"], date=x["date"], date_raw=x["date_raw"], date_note=x["date_note"],
                   cash=x["cash"], bank=x["bank"], vno=x["vno"], payee=x["payee"], rem=x["rem"], head=head,
                   block_note=note_block, bank_slug=row_bank, mode_as_written=mode_w, extra_notes=extra,
                   force_review=bool(amt_conflict), row_obj=x)
        it["sources"] += srcs_extra
        for n in x["amt_notes"]:
            if n == "unparsed" or n.startswith("rounded_from"):
                b.flag(it)
                st.review("bad_amount", f"Amount needs checking ({where} row {x['row']})", {"sheet": where, "row": x["row"], "note": n})
        if it["table"] == "transfers" and it["rec"]["kind"] == "petty_cash":
            it["rec"]["needs_review"] = True
            st.review("trustee_decision", f"Cash withdrawal entered as a voucher; the cash spending is not vouchered ({where} row {x['row']})",
                      {"sheet": where, "row": x["row"], "amount": str(x["cash"] + x["bank"]), "date": str(x["date"]),
                       "block": block_title}, "medium", 0.8,
                      "Imported as a transfer to cash, not as expenditure. If the cash was spent on the event, the spending needs its own vouchers.",
                      "transfers", it["key"])
        if amt_conflict:
            tag = "M9: " if fid == "F154" else ""
            st.review("conflicting_sources", f"{tag}Same voucher, two amounts ({where} row {x['row']})",
                      {"vouchers_sheet": where, "row": x["row"], "amount_used": amt_conflict[0],
                       "numerical_sheet": numref, "numerical_row": num_pairs[x["row"]][0]["row"],
                       "amount_in_numerical_list": amt_conflict[1], "voucher_no": x["vno"]}, "high", 0.9,
                      "Check the bank statement; the amount of the 'Vouchers' sheet is imported.", it["table"], it["key"])
    # numerical rows with no counterpart
    if num_un:
        nfid, nsheet = cfg["numerical"]
        imported = []
        for o in num_un:
            if cfg.get("import_unmatched"):
                it = b.add(fy=fy, fid=nfid, sheet=nsheet, row=o["row"], date=o["date"], date_raw=o["date_raw"], date_note=o["date_note"],
                           cash=o["cash"], bank=o["bank"], vno=o["vno"], payee=o["payee"], rem=o["rem"],
                           head=o["heading"] or "(no head)", block_note=None, bank_slug=bank,
                           mode_as_written="Cash Payment" if o["cash"] > ZERO and o["bank"] == ZERO else "Bank Payment",
                           extra_notes=[f"Listed only in the numerical voucher list, not in '{sheet}'."], force_review=True, row_obj=o)
                imported.append(it["key"])
            else:
                st.skip("numerical-list row with no counterpart in the canonical 'Vouchers' sheet (not imported)")
                b.stats[numref]["skipped_no_counterpart"] += 1
        tag = "M10: " if fid == "F136" else ("M3: " if fid == "F080" else "")
        st.review("conflicting_sources", f"{tag}Numerical voucher list has rows that the 'Vouchers' sheet does not ({numref})",
                  {"numerical_sheet": numref, "vouchers_sheet": where,
                   "rows": [{"row": o["row"], "voucher_no": o["vno"], "date": str(o["date"]), "cash": str(o["cash"]),
                             "bank": str(o["bank"]), "heading": o["heading"]} for o in num_un],
                   "imported_as_expense_needing_review": imported},
                  "high", 0.8, "Decide per row whether it is a real payment missing from the 'Vouchers' sheet.")
    return vs


def do_superseded(st, b, canon_fid):
    items = [it for it in b.recs if it["fid"] == canon_fid and it["row_obj"] is not None]
    for fid, sheet, role in SUPERSEDED.get(canon_fid, []):
        where = ref(fid, sheet)
        vs = read_voucher_sheet(fid, sheet)
        fy = items[0]["fy"] if items else None
        sheet_total_checks(st, vs, fy)
        pairs, rest = match_rows([as_match_row(it) for it in items], vs["rows"])
        for c, o, flags in pairs:
            it = c["item"]
            it["sources"].append(src(fid, sheet, o["row"], role))
            if role == "enrichment" and o["payee"] and not it["rec"].get("payee_as_written") and it["table"] == "expenses":
                it["rec"]["payee_as_written"] = o["payee"]
                it["rec"]["person"] = b.person_for(o["payee"], it["rec"]["category_code"])
        b.stats[where]["voucher_rows_read"] = len(vs["rows"])
        b.stats[where]["merged_as_" + role] = len(pairs)
        b.stats[where]["with_differences"] = sum(1 for p in pairs if p[2])
        for c in vs["cancelled"]:
            st.skip("cancelled voucher without an amount")
        if rest:
            b.stats[where]["skipped_no_counterpart"] = len(rest)
            st.skip("row of a superseded copy with no counterpart in the canonical sheet (not imported)", len(rest))
            st.review("conflicting_sources", f"Superseded copy has rows that the canonical sheet does not ({where})",
                      {"superseded_sheet": where, "canonical_workbook": canon_fid,
                       "rows": [{"row": o["row"], "voucher_no": o["vno"], "date": str(o["date"]), "cash": str(o["cash"]),
                                 "bank": str(o["bank"])} for o in rest]}, "medium", 0.8,
                      "Not imported. Usually an earlier numbering or an entry that was later changed; confirm nothing was lost.")
        diffs = [{"canonical_row": c["item"]["row"], "copy_row": o["row"], **{k: list(v) for k, v in f.items()}}
                 for c, o, f in pairs if f and "voucher_no" in f]
        if diffs:
            st.review("voucher_number_conflict", f"Voucher numbers differ between snapshots ({where})",
                      {"superseded_sheet": where, "canonical_workbook": canon_fid, "count": len(diffs), "pairs": diffs[:300]},
                      "low", 0.9, "Voucher numbers are not stable across saved copies; they are kept only as text.")


def do_cheque_registers(st, b):
    by_fid = defaultdict(list)
    for it in b.recs:
        by_fid[it["fid"]].append(it)
    for fid, fy in CHEQUE_SHEETS:
        sheet = "Cheques Issued"
        where = ref(fid, sheet)
        n = m = 0
        for r, c in raw_rows(fid, sheet):
            chq = c.get("B")
            if isinstance(chq, float) and chq.is_integer():
                chq = str(int(chq))
            chq = clean_text(chq)
            if not chq or not re.fullmatch(r"\d{5,6}", chq) or int(chq) < 10000:
                continue
            n += 1
            # the same register rows are carried forward into later workbooks; attach to any year's record
            hit = [it for it in b.recs if it["rem"] and re.search(rf"(?<!\d)0*{int(chq)}(?!\d)", it["rem"])]
            amt = dec(c.get("F"))[0]
            hit = [it for it in hit if amt is None or it["cash"] + it["bank_amt"] == amt] or []
            if len(hit) == 1:
                it = hit[0]
                m += 1
                it["sources"].append(src(fid, sheet, r, "enrichment"))
                if it["table"] == "expenses":
                    it["rec"]["cheque_no"] = it["rec"].get("cheque_no") or chq
                    payee = clean_text(c.get("D"))
                    if payee and not it["rec"].get("payee_as_written"):
                        it["rec"]["payee_as_written"] = payee
                        it["rec"]["person"] = b.person_for(payee, it["rec"]["category_code"])
            else:
                st.skip("cheque-register row not matched to a single voucher (register only, no expense created)")
        b.stats[where]["cheque_rows_read"] = n
        b.stats[where]["merged_as_enrichment"] = m
        b.stats[where]["skipped_unmatched"] = n - m


# ---------------------------------------------------------------- petty-cash books

def do_petty_books(st, b):
    books = [  # fid, sheet, bank, cols, role, fy
        ("F134", "Saraswat Petty Cash", "saraswat", dict(date="B", part="C", det="D", paid="G", rec="H"), "primary"),
        ("F136", "HDFC Pettycash Account", "hdfc", dict(date="B", part="C", det="D", paid="F", rec="G"), "primary"),
        ("F167", "petty cash_ saraswat", "saraswat", dict(date="B", part="C", det="D", paid="G", rec="H"), "copy"),
        ("F167", "petty cash_ hdfc", "hdfc", dict(date="A", part="B", det="C", paid="F", rec="E"), "copy"),
    ]
    fy = "2026-27"
    canon_fid = {"saraswat": "F134", "hdfc": "F136"}
    for fid, sheet, bank, col, kind in books:
        where = ref(fid, sheet)
        stats = b.stats[where]
        paid, recd = [], []
        for r, c in raw_rows(fid, sheet):
            d, dnote = parse_date(c.get(col["date"]))
            part = clean_text(c.get(col["part"]))
            p = dec(c.get(col["paid"]))[0]
            q = dec(c.get(col["rec"]))[0]
            if d is None or not part or re.match(r"(?i)op(ening)? balance|totals?$", part):
                continue
            det = clean_text(c.get(col["det"]))
            if p:
                paid.append(dict(row=r, date=d, amt=p, part=part, det=det))
            elif q:
                recd.append(dict(row=r, date=d, amt=q, part=part, det=det))
        stats["rows_read"] = len(paid) + len(recd)
        cash_items = [it for it in b.recs if it["fid"] == canon_fid[bank] and it["cash"] > ZERO and it["bank_amt"] == ZERO
                      and it["table"] == "expenses"]
        used = set()
        left = []
        for x in paid:
            hit = [it for it in cash_items if id(it) not in used and it["date"] == x["date"] and it["cash"] == x["amt"]]
            if hit:
                best = max(hit, key=lambda it: max(sim(it["rem"], x["part"]), sim(it["rem"], x["det"]), sim(it["payee"], x["part"])))
                used.add(id(best))
                best["sources"].append(src(fid, sheet, x["row"], "duplicate"))
                stats["merged_as_duplicate"] += 1
            else:
                left.append(x)
        # several cash-book lines of one day can add up to one voucher (e.g. 500 + 200 = 700)
        by_day = defaultdict(list)
        for x in left:
            by_day[x["date"]].append(x)
        left = []
        for d, xs in by_day.items():
            total = sum((x["amt"] for x in xs), ZERO)
            hit = [it for it in cash_items if id(it) not in used and it["date"] == d and it["cash"] == total]
            if len(xs) > 1 and hit:
                used.add(id(hit[0]))
                for x in xs:
                    hit[0]["sources"].append(src(fid, sheet, x["row"], "duplicate"))
                    stats["merged_as_duplicate"] += 1
                continue
            # same amount, other date (the cash book and the voucher list disagree on the day)
            for x in xs:
                h2 = [it for it in cash_items if id(it) not in used and it["cash"] == x["amt"]
                      and max(sim(it["rem"], x["part"]), sim(it["rem"], x["det"]), sim(it["payee"], x["part"])) >= 0.5]
                if h2:
                    used.add(id(h2[0]))
                    h2[0]["sources"].append(src(fid, sheet, x["row"], "duplicate"))
                    stats["merged_as_duplicate"] += 1
                    stats["merged_with_date_difference"] += 1
                    st.review("conflicting_sources", f"Cash book and voucher list give different dates ({where} row {x['row']})",
                              {"cash_book": where, "row": x["row"], "cash_book_date": str(x["date"]), "voucher_date": str(h2[0]["date"]),
                               "amount": str(x["amt"]), "voucher_sheet": ref(h2[0]["fid"], h2[0]["sheet"]), "voucher_row": h2[0]["row"]},
                              "low", 0.8, "The voucher sheet's date is imported.", "expenses", h2[0]["key"])
                else:
                    left.append(x)
        for x in left:
            if kind == "copy":
                st.skip("row of an earlier petty-cash copy with no counterpart (not imported)")
                stats["skipped_no_counterpart"] += 1
                continue
            it = b.add(fy=fy, fid=fid, sheet=sheet, row=x["row"], date=x["date"], cash=x["amt"], bank=ZERO, vno=None, payee=None,
                       rem=" - ".join(t for t in (x["part"], x["det"]) if t), head="Petty cash book", block_note=f"Petty cash book ({bank}).",
                       bank_slug="cash", mode_as_written="AMT_PAID", force_review=True,
                       extra_notes=["No cash voucher with the same date and amount was found."])
            st.review("duplicate_transaction", f"Petty-cash payment without a matching cash voucher ({where} row {x['row']})",
                      {"sheet": where, "row": x["row"], "date": str(x["date"]), "amount": str(x["amt"])}, "medium", 0.6,
                      "Imported as an expense; check it is not a voucher entered under another date or amount.", "expenses", it["key"])
        receipts = []
        for x in recd:
            text = f"{x['part']} {x['det'] or ''}"
            if re.search(r"(?i)withdraw|chq paid|cheque", text):
                hit = [it for it in b.recs if it["table"] == "transfers" and it["rec"]["kind"] == "petty_cash" and it["fy"] == fy
                       and it["bank"] == bank and it["cash"] + it["bank_amt"] == x["amt"] and it["date"] == x["date"]
                       and src(fid, sheet, x["row"], "duplicate") not in it["sources"]
                       and not any(s["file"] == fid and s["sheet"] == sheet for s in it["sources"])]
                if hit:
                    hit[0]["sources"].append(src(fid, sheet, x["row"], "duplicate"))
                    stats["merged_as_duplicate"] += 1
                elif kind == "copy":
                    st.skip("row of an earlier petty-cash copy with no counterpart (not imported)")
                    stats["skipped_no_counterpart"] += 1
                else:
                    b.add(fy=fy, fid=fid, sheet=sheet, row=x["row"], date=x["date"], cash=ZERO, bank=x["amt"], vno=None, payee=None,
                          rem=" - ".join(t for t in (x["part"], x["det"]) if t), head="Petty cash book",
                          block_note=f"Petty cash book ({bank})", bank_slug=bank, mode_as_written="AMT_REC",
                          force_kind="petty_cash")
            else:
                receipts.append({"row": x["row"], "date": str(x["date"]), "amount": str(x["amt"])})
                st.skip("cash receipt in a petty-cash book (income; belongs to the receipts domain)")
                stats["skipped_cash_receipt"] += 1
        if receipts and kind == "primary":
            st.review("trustee_decision", f"Cash receipts recorded only in the petty-cash book ({where})",
                      {"sheet": where, "rows": receipts, "total": str(sum((Decimal(x["amount"]) for x in receipts), ZERO))},
                      "medium", None, "Not imported here (income). Confirm the receipts transform has these cash receipts.")


# ---------------------------------------------------------------- statements

def col_num(letters):
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n


def do_statement(st, b, fid, sheet, fy, entity, variant, vouchers=None):
    """Emit the statement and its lines; for variant B trust sheets also create expenses / transfers
    for outward lines that have no voucher rows behind them."""
    where = ref(fid, sheet)
    rows = raw_rows(fid, sheet)
    title = None
    hdr = None
    for r, c in rows:
        if isinstance(c.get("B"), str) and c["B"].strip().lower().startswith("balance sheet"):
            title = clean_text(c["B"])
        if isinstance(c.get("C"), str) and clean_text(c["C"]) in ("Income", "Inward Entries") and hdr is None:
            hdr = r
    skey = f"led:stmt:{entity}:{fy}"
    notes = [f"Sheet title as printed: '{title}'." if title else None,
             "A two-sided receipts-and-payments account (cash basis), not a statement of assets and liabilities.",
             "Covers the Saraswat current account and petty cash only; fixed deposits, HDFC and SBI are outside it."
             if variant == "B" else "Closing balances are printed as the last 'expense' rows; petty cash is the balancing figure.",
             "Informal 'Pune CKP Family' group account, kept in parallel with the trust from 2018-19." if entity == "pre_trust" else None,
             "Year in progress when the workbook was saved (about mid-August 2026)." if fy == "2026-27" else None]
    st.emit("annual_statements", skey, dict(fy=fy, entity=entity, source_label="Receipts & payments sheet", is_signed_audit=False,
                                            notes=" ".join(n for n in notes if n)), [src(fid, sheet, hdr or 1)])
    stats = b.stats[where]
    order = 0
    lsec = rsec = None
    text_above = {}
    sub_bank = set()
    sub_cash = set()
    if vouchers:
        for vs in vouchers:
            for blk in vs["blocks"]:
                t = blk["subtotal"]
                if t:
                    sub_bank.add(t["bank"] if t["amt"] is None else t["amt"])
                    sub_cash.add(t["cash"] if t["amt"] is None else t["amt"])
            for g in vs["grand"]:
                sub_cash.add(g["cash"] if g["amt"] is None else g["amt"])
    after_total = False
    for r, c in rows:
        if hdr is None or r <= hdr:
            continue
        lab_l, lab_r = clean_text(c.get("C")), clean_text(c.get("F"))
        this_is_total = (lab_l or "").lower() == "total" or (lab_r or "").lower() == "total"
        if variant == "B":
            ll = re.sub(r"\s+", " ", (lab_l or "")).upper()
            rl = re.sub(r"\s+", " ", (lab_r or "")).upper()
            if ll.startswith("CASH WITHDRAWAL TO PETTY"):
                lsec = "petty_wd"
            elif ll.startswith("TOTAL CASH WITHDRAWAL"):
                lsec = "cash_in"
            elif ll.startswith("TOTAL PETTY CASH"):
                lsec = "bank"
            if rl.startswith("EXPENSES FROM PETTY"):
                rsec = "petty"
            elif rl.startswith("BANK TRANSFERS"):
                rsec = "bank"
            elif rl.startswith("OUTWARD ENTRIES"):
                rsec = "end"
        for col, labcol, datecol in (("D", "C", "B"), ("G", "F", "E")):
            v = c.get(col)
            lab = clean_text(c.get(labcol)) if isinstance(c.get(labcol), str) else None
            if v is None or isinstance(v, str):
                if lab and v is None and not re.match(r"(?i)^(cash withdrawal to petty|expenses from petty|bank transfers|petty cash accounting|cheques issued)", re.sub(r"\s+", " ", lab)):
                    st.skip("statement label printed without an amount")
                    stats["skipped_label_without_amount"] += 1
                continue
            amt, note = dec(v)
            if amt is None:
                continue
            d_raw = c.get(datecol)
            code = None
            d = None
            if isinstance(d_raw, str):
                t = clean_text(d_raw)
                if t and re.fullmatch(r"[A-Z]{2}(-\d)?", t):
                    code = t
                elif t and not PERIOD_LABEL_RE.match(t):
                    d, dn = parse_date(t)
                    if d is None:
                        st.review("ambiguous_date", f"Date cell holds text ({where} {datecol}{r})",
                                  {"sheet": where, "cell": f"{datecol}{r}", "as_written": t}, "low", None,
                                  "Line imported without a date.")
            elif d_raw is not None:
                d, dn = parse_date(d_raw)
            section = lsec if col == "D" else rsec
            side = statement_side(variant, col, lab or "", lsec if col == "D" else None)
            if col == "D" and variant == "B" and section == "petty_wd" and lab and not re.match(r"(?i)^total", lab):
                side = "memo"
            if not lab:
                lab = "(no label printed)"
                side = "memo"
            if after_total and not this_is_total:
                side = "memo"       # figures printed below the Total row (closing memo of other accounts, workings)
            label = f"{code}: {lab}" if code else lab
            order += 1
            lkey = f"led:stl:{entity}:{fy}:{col}{r}"
            st.emit("annual_statement_lines", lkey,
                    dict(statement_key=skey, side=side, label=label, amount=amt, line_date=d, cell_ref=f"{col}{r}", line_order=order),
                    [src(fid, sheet, r)])
            stats["statement_lines"] += 1
            if d is not None and fy_of(d) != fy and side not in ("opening",):
                st.review("date_outside_fy", f"Statement line dated outside {fy} ({where} {datecol}{r})",
                          {"sheet": where, "cell": f"{datecol}{r}", "date_as_written": str(d), "sheet_fy": fy, "amount": str(amt)},
                          "low", None, "Line imported as printed.", "annual_statement_lines", lkey)
            if note and (note == "unparsed" or note.startswith("rounded_from")):
                st.review("bad_amount", f"Statement amount needs checking ({where} {col}{r})", {"sheet": where, "cell": f"{col}{r}", "note": note})
            # ---- variant B: outward movements with no voucher rows
            if variant != "B" or entity != "trust" or amt == ZERO or side in ("total", "opening", "closing") or after_total:
                continue
            if col == "D" and section == "petty_wd":
                it = b.add(fy=fy, fid=fid, sheet=sheet, row=r, cellref=f"D{r}", date=d, cash=ZERO, bank=amt, vno=None, payee=None,
                           rem=lab, head="Balance sheet: CASH WITHDRAWAL TO PETTY - CASH", block_note="Saraswat Bank Current Account",
                           bank_slug="saraswat", mode_as_written="CASH WITHDRAWAL TO PETTY - CASH", force_kind="petty_cash")
                stats["transfers_from_statement"] += 1
                continue
            if col != "G" or rsec not in ("petty", "bank"):
                continue
            covered = code is not None or (amt in sub_bank if rsec == "bank" else amt in sub_cash)
            if code is not None and amt not in sub_bank:
                st.review("total_mismatch", f"Head total on the statement is not a subtotal of the voucher sheet ({where} G{r})",
                          {"sheet": where, "cell": f"G{r}", "label": label, "amount": str(amt)}, "medium")
            if covered:
                stats["outward_lines_covered_by_vouchers"] += 1
                continue
            cash, bank = (amt, ZERO) if rsec == "petty" else (ZERO, amt)
            vno = None
            m = re.match(r"\s*(\d{3}/\d{2}~\d{2})\s*:", lab)
            if m:
                vno = m[1]
            it = b.add(fy=fy, fid=fid, sheet=sheet, row=r, cellref=f"G{r}", date=d, cash=cash, bank=bank, vno=vno, payee=None, rem=lab,
                       head="Balance sheet: EXPENSES FROM PETTY - CASH" if rsec == "petty" else "Balance sheet: BANK TRANSFERS / CHEQUE ISSUED",
                       block_note="Line of the receipts-and-payments sheet; no voucher rows exist for it.",
                       bank_slug="saraswat", mode_as_written="EXPENSES FROM PETTY - CASH" if rsec == "petty" else "BANK TRANSFERS / CHEQUE ISSUED",
                       force_review=True)
            stats["records_from_statement"] += 1
            if it["table"] == "expenses" and it["rec"]["category_code"] == "bank-charges" and d is not None:
                it["rec"]["needs_review"] = fy_of(d) != fy
            elif it["table"] == "transfers" and d is not None:
                it["rec"]["needs_review"] = fy_of(d) != fy
            elif it["table"] == "expenses":
                st.review("missing_document", f"Statement outward line with no voucher rows behind it ({where} G{r})",
                          {"sheet": where, "cell": f"G{r}", "label": lab, "amount": str(amt), "date": str(d) if d else None},
                          "medium", None, "Imported as one expense from the printed line; attach the vouchers or the detail sheet.",
                          "expenses", it["key"])
        after_total = after_total or this_is_total
        # side notes and workings right of the table
        for k in sorted((k for k in c if k != "_f" and col_num(k) >= 8), key=col_num):
            v = c[k]
            if isinstance(v, str):
                text_above[k] = (r, clean_text(v))
                continue
            if isinstance(v, datetime):
                continue
            amt, note = dec(v)
            if amt is None:
                continue
            texts = [clean_text(c[j]) for j in sorted(c, key=col_num) if j != "_f" and col_num(j) >= 8 and isinstance(c[j], str)]
            lab = " / ".join(t for t in texts if t)
            if not lab and k in text_above and r - text_above[k][0] <= 2:
                lab = text_above[k][1]
            if variant == "A" and col_num(k) >= 13:
                st.skip("number in an unrelated side table next to the statement (gift / mug lists)")
                stats["skipped_side_table"] += 1
                continue
            in_h_instead = k == "H" and c.get("G") is None and isinstance(c.get("F"), str)
            if in_h_instead:
                lab = clean_text(c["F"]) + " (amount printed in column H, outside the totals)"
                if variant == "B" and entity == "trust" and rsec == "bank":
                    dd = parse_date(c.get("E"))[0] if not isinstance(c.get("E"), str) else None
                    it = b.add(fy=fy, fid=fid, sheet=sheet, row=r, cellref=f"H{r}", date=dd, cash=ZERO, bank=amt, vno=None, payee=None,
                               rem=clean_text(c["F"]), head="Balance sheet: BANK TRANSFERS / CHEQUE ISSUED",
                               block_note="Amount printed in column H, outside the OUTWARD total.", bank_slug="saraswat",
                               mode_as_written="BANK TRANSFERS / CHEQUE ISSUED", force_review=True, outside_outward=True)
                    stats["records_from_statement"] += 1
                    st.review("total_mismatch", f"Outgoing entry printed outside the amount column ({where} H{r})",
                              {"sheet": where, "cell": f"H{r}", "label": clean_text(c["F"]), "amount": str(amt)}, "medium", None,
                              "Imported and marked for review; it is not part of the printed OUTWARD total. Confirm against the bank statement.",
                              it["table"], it["key"])
            order += 1
            st.emit("annual_statement_lines", f"led:stl:{entity}:{fy}:{k}{r}",
                    dict(statement_key=skey, side="memo", label=lab or "(side figure, no label)", amount=amt, cell_ref=f"{k}{r}", line_order=order),
                    [src(fid, sheet, r)])
            stats["statement_lines"] += 1
            stats["memo_side_figures"] += 1


# ---------------------------------------------------------------- event sheets

def do_event_sheets(st, b):
    # Sangeet Rajani 13 May 2022
    fid, sheet, slug = "F016", "Sangeet Rajani 13may22", "sangeet-rajani-2022"
    where = ref(fid, sheet)
    section = "expense"
    for r, c in raw_rows(fid, sheet):
        lab = clean_text(c.get("C")) if isinstance(c.get("C"), str) else None
        if lab and lab.upper().startswith("PETTY CASH WITHDRAWALS"):
            section = "memo"
        for dcol, lcol, acol, mode in (("B", "C", "D", "EXPENSES FROM PETTY - CASH"), ("F", "G", "H", "EXPENSES PAID BY CHEQUE")):
            label = clean_text(c.get(lcol)) if isinstance(c.get(lcol), str) else None
            amt = dec(c.get(acol))[0] if not isinstance(c.get(acol), str) else None
            if amt is None or not label:
                continue
            if re.match(r"(?i)^(total|petty cash balance)", label):
                st.skip("event-sheet total row")
                b.stats[where]["skipped_total_rows"] += 1
                continue
            d, dn = parse_date(c.get(dcol))
            side = section if dcol == "B" else "expense"
            key = f"led:eal:{slug}:{fid}:{sid(fid, sheet)}:{acol}{r}"
            st.emit("event_account_lines", key,
                    dict(event_slug=slug, side=side, line_date=d, head_as_written=mode if side == "expense" else "PETTY CASH WITHDRAWALS FROM BANK",
                         party_as_written=None, amount=amt, mode_as_written="Petty cash" if dcol == "B" else "Cheque",
                         reference=extract_cheque_no(label), notes=label, needs_review=False),
                    [src(fid, sheet, r), src("F020", sheet, r, "duplicate")])
            b.stats[where]["event_lines"] += 1
    # 14 May 2023 evening show: premium passes
    fid, sheet, slug = "F026", "14May23 Evening Show", "evening-show-2023"
    where = ref(fid, sheet)
    total = ZERO
    for r, c in raw_rows(fid, sheet):
        amt = dec(c.get("G"))[0] if not isinstance(c.get("G"), str) else None
        name = clean_text(c.get("E")) if isinstance(c.get("E"), str) else None
        if amt is None:
            continue
        if not name:
            st.skip("event-sheet total row")
            b.stats[where]["skipped_total_rows"] += 1
            if amt != total:
                st.review("total_mismatch", f"Premium-pass total differs from its rows ({where})",
                          {"sheet": where, "printed": str(amt), "rows": str(total)}, "medium")
            continue
        d, dn = parse_date(c.get("D"))
        total += amt
        seat = clean_text(c.get("C"))
        st.emit("event_account_lines", f"led:eal:{slug}:{fid}:{sid(fid, sheet)}:r{r}",
                dict(event_slug=slug, side="income", line_date=d, head_as_written="Premium Pass Purchased By",
                     party_as_written=name, person={"name": re.sub(r"\s*-\s*\d+$", "", name), "role": "donor"}, amount=amt,
                     quantity=1, mode_as_written=None, reference=clean_text(c.get("F")),
                     notes=f"Seat {seat}." if seat else None, needs_review=False), [src(fid, sheet, r)])
        b.stats[where]["event_lines"] += 1
    # Book money transfer records
    slug = "book-pride-of-ckp"
    relation = ("Bank-side record of book-sale money as kept in the trust ledger ('Book Money Trnsfr Record'); the sheet covers "
                "both titles (Pride of CKP and Lakshavedhi Kayasth). The per-copy book registers of workbook F009 are imported "
                "by another transform and describe the same sales: match on receipt number / payment reference, never add the two.")
    for fid, fy, dup in (("F016", "2022-23", "F020"), ("F026", "2023-24", None), ("F033", "2024-25", None), ("F080", "2025-26", "F085")):
        sheet = "Book Money Trnsfr Record"
        where = ref(fid, sheet)
        total = ZERO
        for r, c in raw_rows(fid, sheet):
            if isinstance(c.get("B"), str) and "TOTAL" in c["B"].upper():
                printed = dec(c.get("E"))[0]
                st.skip("event-sheet total row")
                b.stats[where]["skipped_total_rows"] += 1
                if printed is not None and printed != total:
                    st.review("total_mismatch", f"Book-money total differs from its rows ({where})",
                              {"sheet": where, "printed": str(printed), "rows": str(total)}, "medium")
                continue
            amt = dec(c.get("D"))[0] if not isinstance(c.get("D"), str) else None
            if amt is None or r <= 2:
                if set(c) - {"_f"} <= {"E"}:
                    b.stats[where]["empty_running_total_rows"] += 1
                continue
            d, dn = parse_date(c.get("B"))
            total += amt
            sources = [src(fid, sheet, r)] + ([src(dup, sheet, r, "duplicate")] if dup else [])
            rcpt = c.get("I")
            if isinstance(rcpt, float) and rcpt.is_integer():
                rcpt = int(rcpt)
            courier, spent = dec(c.get("F"))[0] if not isinstance(c.get("F"), str) else None, dec(c.get("G"))[0] if not isinstance(c.get("G"), str) else None
            extra = [f"Receipt no(s): {rcpt}." if rcpt not in (None, "") else None,
                     f"Includes courier charges {courier}." if courier else None,
                     clean_text(c.get("J")) if isinstance(c.get("J"), str) else None]
            needs = bool(d and fy_of(d) != fy)
            st.emit("event_account_lines", f"led:eal:{slug}:{fid}:{sid(fid, sheet)}:D{r}",
                    dict(event_slug=slug, side="income", line_date=d, head_as_written="Book Money Trnsfr Record",
                         party_as_written=clean_text(c.get("H")) if isinstance(c.get("H"), str) else None, amount=amt,
                         mode_as_written=None, reference=clean_text(c.get("C")),
                         notes=" ".join([x for x in extra if x] + [relation]), needs_review=needs), sources)
            b.stats[where]["event_lines"] += 1
            if needs:
                st.review("date_outside_fy", f"Book-money row dated outside {fy} ({where} row {r})",
                          {"sheet": where, "row": r, "date_as_written": str(d), "sheet_fy": fy}, "low")
            if spent:
                st.emit("event_account_lines", f"led:eal:{slug}:{fid}:{sid(fid, sheet)}:G{r}",
                        dict(event_slug=slug, side="expense", line_date=d, head_as_written="Actual Spent (courier)",
                             party_as_written=clean_text(c.get("H")) if isinstance(c.get("H"), str) else None, amount=spent,
                             notes=f"Courier cost for the sale on the same row (charged to buyer: {courier}). " + relation,
                             needs_review=False), sources)
                b.stats[where]["event_lines"] += 1


# ---------------------------------------------------------------- fixed review items

def fixed_reviews(st, b):
    def f(fid, sheet, a1):
        v = cell(fid, sheet, a1)
        return None if v is None else str(dec(v)[0]) if not isinstance(v, str) else v

    # M3
    s05 = [it for it in b.recs if it["fid"] == "F080" and it["sheet"] == "Vouchers 2025-26"]
    st.review("total_mismatch", "M3: 2025-26 'Numerical Vouchers' totals differ from the 'Vouchers' sheet",
              {"numerical_sheet": ref("F080", "Numerical Vouchers 2025-26"), "printed_cash_E270": f("F080", "Numerical Vouchers 2025-26", "E270"),
               "printed_bank_F270": f("F080", "Numerical Vouchers 2025-26", "F270"), "vouchers_sheet": ref("F080", "Vouchers 2025-26"),
               "vouchers_rows_cash": str(sum((i["cash"] for i in s05), ZERO)), "vouchers_rows_bank_incl_HDFC_block": str(sum((i["bank_amt"] for i in s05), ZERO))},
              "high", 0.9, "The two sheets are not the same data; the 'Vouchers' sheet, which ties to the statement, is imported.")
    st.review("total_mismatch", "M11: Sahitya Sammelan collection on the 2022-23 statement differs from the event sheet by 900",
              {"statement": ref("F016", "Balance_Sheet_2022-23"), "D40": f("F016", "Balance_Sheet_2022-23", "D40"),
               "D41": f("F016", "Balance_Sheet_2022-23", "D41"), "event_sheet": ref("F016", "Sahitya Sammelan"),
               "C14_total_amount_in_account": f("F016", "Sahitya Sammelan", "C14")}, "medium", None,
              "Could not be reconciled from the sheets; needs the bank statement.")
    st.review("missing_document", "M12: 2022-23 book-printing payments of 380,260 have no detail rows",
              {"statement": ref("F016", "Balance_Sheet_2022-23"), "cell": "G46", "amount": f("F016", "Balance_Sheet_2022-23", "G46")},
              "high", None, "Imported as one expense from the printed line; list the individual payments from the bank statement.")
    st.review("missing_document", "M13: 2023-24 'Ganapati Sajawat Spardha - Cheques issued' 1,054 is not a voucher-sheet figure",
              {"statement": ref("F026", "Balance_Sheet_2023-24"), "cell": "G29", "amount": f("F026", "Balance_Sheet_2023-24", "G29"),
               "cheque_register": ref("F026", "Cheques Issued")}, "low", None,
              "Imported as one expense from the printed line; presumably prize cheques cleared in 2023-24.")
    st.review("duplicate_transaction", "M14: 'Dnyankiran Donations' (67,000) repeats receipts already in the 2023-24 donation sheet",
              {"sheet": ref("F026", "Dnyankiran Donations"), "printed_total_G18": f("F026", "Dnyankiran Donations", "G18")}, "low", None,
              "A receipt sheet (not imported by this transform); the receipts transform must not load these rows twice.")
    st.review("total_mismatch", "M15: 2026-27 'AC Balance' differs from the last balance of the pasted bank statement by 5,000",
              {"statement": ref("F134", "Balance_Sheet_2026-27"), "H47_ac_balance": f("F134", "Balance_Sheet_2026-27", "H47"),
               "bank_statement_sheet": ref("F134", "Saraswat Bank Statement"), "last_statement_balance_per_phase0_analysis": "57704.73",
               "verified_here": False}, "medium", None, "Possibly different cut-off dates; not verified.")
    st.review("conflicting_sources", "Sahitya Sammelan cheque total includes a petty-cash withdrawal that the statement also lists",
              {"event_sheet": ref("F016", "Sahitya Sammelan"), "row": 14, "label": "Cash withdrawal to Petty Cash", "amount": f("F016", "Sahitya Sammelan", "G14"),
               "reference": cell("F016", "Sahitya Sammelan", "H14"), "statement": ref("F016", "Balance_Sheet_2022-23"),
               "statement_cells": {"G43_total_cheque_payments": f("F016", "Balance_Sheet_2022-23", "G43"), "D12_withdrawal_same_cheque": f("F016", "Balance_Sheet_2022-23", "D12")}},
              "high", 0.8, "The 320,850 expense imported from the statement appears to contain 10,000 that is a cash withdrawal, "
              "counted again in the petty-cash withdrawals; compare with the unexplained 7,050 bank difference.")
    st.review("conflicting_sources", "SBI project headings disagree between the two SBI voucher sheets",
              {"grouped_sheet": ref("F154", "SBI Expenditures"), "numerical_sheet": ref("F154", "SBI Vouchers"),
               "cheque_register": ref("F154", "Cheques Issued"),
               "example": "SBI/002 (700,000) sits in the 'Project Amrut Dhara' block and the cheque register, but is headed 'Project Ravikiran' in the numerical list; SBI/003 the reverse."},
              "medium", 0.9, "The block of the grouped sheet decides the scheme; the numerical Heading is kept only in the notes.")
    # continuity
    for label, a, o in CONTINUITY:
        va, vo = cell(*a), cell(*o)
        if va is None or vo is None:
            st.review("continuity_break", f"Continuity check not possible: {label}", {"closing": list(a), "opening": list(o),
                      "closing_value": va, "opening_value": vo}, "low")
            continue
        da, do_ = dec(va)[0], dec(vo)[0]
        if da != do_:
            diff = do_ - da
            st.review("continuity_break", f"Opening balance differs from the previous closing: {label}",
                      {"closing": f"{ref(a[0], a[1])} {a[2]}", "closing_value": str(da), "opening": f"{ref(o[0], o[1])} {o[2]}",
                       "opening_value": str(do_), "difference": str(diff)},
                      "high" if abs(diff) >= 1000 else "low", 0.95, "Both figures are imported as printed; explain the difference.")
    i69 = cell("F016", "Balance_Sheet_2022-23", "I69")
    st.review("continuity_break", "2022-23 computed bank balance differs from the actual bank balance by 7,050",
              {"statement": ref("F016", "Balance_Sheet_2022-23"), "G69_computed": f("F016", "Balance_Sheet_2022-23", "G69"),
               "H69_actual": f("F016", "Balance_Sheet_2022-23", "H69"), "I69_difference": str(dec(i69)[0]) if i69 is not None else None},
              "high", 0.95, "Printed on the sheet and never explained; 2023-24 opens with the actual figure.")
    n81 = len(raw_rows("F081", "EXPENSES - PETTY CASH"))
    st.skip("F081 petty-cash working paper (side-by-side scratch lists; items already appear as cash vouchers in F080)", n81)
    b.stats["F081.S01"]["rows_read"] = n81
    b.stats["F081.S01"]["skipped_working_paper"] = n81


# ---------------------------------------------------------------- run

def run():
    utf8_stdout()
    st = Staging(DOMAIN)
    heads = Heads.load()
    b = Builder(st, heads)
    check_slugs(st, heads)
    parsed = {}
    for cfg in CANON:
        parsed[cfg["fid"]] = do_vouchers(st, b, heads, cfg)
    # statements (and statement-only outward lines)
    vmap = {"F016": [parsed["F016"]], "F026": [parsed["F026"]], "F033": [parsed["F033"]], "F080": [parsed["F080"]], "F134": [parsed["F134"]]}
    for fid, sheet, fy, entity, variant in STATEMENTS:
        do_statement(st, b, fid, sheet, fy, entity, variant, vmap.get(fid) if entity == "trust" else None)
    n132 = len(raw_rows("F132", "Balance_Sheet_2026-27"))
    st.skip("F132 2026-27 statement: earlier save superseded by F134 (not imported)", n132)
    b.stats[ref("F132", "Balance_Sheet_2026-27")]["rows_read"] = n132
    b.stats[ref("F132", "Balance_Sheet_2026-27")]["skipped_superseded"] = n132
    for fid in SUPERSEDED:
        do_superseded(st, b, fid)
    do_cheque_registers(st, b)
    do_petty_books(st, b)
    do_event_sheets(st, b)
    fixed_reviews(st, b)
    # statement-level odd items
    for it in b.recs:
        if it["fid"] == "F136" and it["sheet"] == "Vouchers":
            pass
    b.emit_all()
    for head, n in sorted(b.unknown_heads.items(), key=lambda kv: str(kv[0])):
        st.review("unclassified_head", f"Head not listed in mappings/expense_heads.csv: {head}", {"head": head, "rows": n}, "medium",
                  None, "Add the head to the mapping file with its category and event / scheme.")
    report(st, b, parsed)
    return st.close()


def check_slugs(st, heads):
    """Every event / scheme / fund named in expense_heads.csv must exist in its mapping file."""
    known = {}
    for field, fname, col in (("event_slug", "events.csv", "slug"), ("scheme_slug", "schemes.csv", "slug"), ("fund_code", "funds.csv", "code")):
        with open(MAPPINGS / fname, encoding="utf-8-sig", newline="") as f:
            known[field] = {r[col] for r in csv.DictReader(f)}
    rows = list(heads.by_head.values()) + [r for _, r in heads.patterns]
    for field, ok in known.items():
        missing = sorted({r[field] for r in rows if r[field] and r[field] not in ok})
        if missing:
            st.review("unclassified_head", f"expense_heads.csv names {field} values that are not in the mapping file",
                      {"field": field, "missing": missing}, "high", None, "Add them to the mapping file or correct the head mapping.")
            print(f"!! {field} not in mapping file: {missing}")


def report(st, b, parsed):
    print("\n== per source sheet ==")
    for where in sorted(b.stats):
        print(f"  {where}: " + ", ".join(f"{k}={v}" for k, v in sorted(b.stats[where].items())))
    print("\n== per FY (rupees) ==")
    fys = sorted({it["fy"] for it in b.recs})
    for fy in fys:
        e = [it for it in b.recs if it["fy"] == fy and it["table"] == "expenses"]
        t = [it for it in b.recs if it["fy"] == fy and it["table"] == "transfers"]
        tot = lambda xs: sum((i["cash"] + i["bank_amt"] for i in xs), ZERO)
        print(f"  {fy}: expenses {len(e)} rows {tot(e)} | transfers {len(t)} rows {tot(t)}")
        for bank in ("saraswat", "hdfc", "sbi"):
            xs = [i for i in e + t if i["bank"] == bank]
            if xs:
                vch = [i for i in xs if i["row_obj"] is not None]
                print(f"      {bank}: voucher rows cash {sum((i['cash'] for i in vch), ZERO)} bank {sum((i['bank_amt'] for i in vch), ZERO)}"
                      f" | all bank-side {sum((i['bank_amt'] for i in xs), ZERO)} | all cash-side {sum((i['cash'] for i in xs), ZERO)}")
        for fid, sheet, sfy, entity, variant in STATEMENTS:
            if sfy == fy and entity == "trust" and variant == "B":
                for r, c in raw_rows(fid, sheet):
                    if isinstance(c.get("F"), str) and c["F"].strip().upper().startswith("OUTWARD ENTRIES"):
                        outw = dec(c.get("G"))[0]
                        mine = sum((i["bank_amt"] for i in e + t if i["bank"] == "saraswat" and not i["outside_outward"]
                                    and i["fid"] == fid), ZERO)
                        print(f"      printed OUTWARD {ref(fid, sheet)} G{r} {outw} | imported Saraswat bank-side {mine} | difference {mine - outw}")
                    if isinstance(c.get("F"), str) and re.sub(r"\s+", " ", c["F"].strip().upper()) == "TOTAL EXPENSES FROM PETTY CASH":
                        pc = dec(c.get("G"))[0]
                        minec = sum((i["cash"] for i in e if i["fid"] == fid), ZERO)
                        print(f"      printed petty-cash expenses G{r} {pc} | imported cash-side {minec} | difference {minec - pc}")
        for vfid, vs in parsed.items():
            if any(cf["fid"] == vfid and cf["fy"] == fy for cf in CANON):
                for g in vs["grand"]:
                    print(f"      printed voucher total {ref(vfid, vs['sheet'])} row {g['row']}: cash {g['cash']} bank {g['bank'] if g['amt'] is None else g['amt']}"
                          f" | rows cash {sum((x['cash'] for x in vs['rows']), ZERO)} bank {sum((x['bank'] for x in vs['rows']), ZERO)}")
        kinds = Counter()
        for i in t:
            kinds[i["rec"]["kind"]] += i["cash"] + i["bank_amt"]
        if kinds:
            print("      transfers by kind: " + ", ".join(f"{k} {v}" for k, v in sorted(kinds.items())))
    print("\n== review items by kind ==")
    for k, n in sorted(Counter(r["kind"] for r in st.reviews.values()).items()):
        print(f"  {k}: {n}")
    cats = Counter()
    for it in b.recs:
        if it["table"] == "expenses":
            cats[it["rec"]["category_code"]] += 1
    print("\n== expenses by category ==\n  " + ", ".join(f"{k}={v}" for k, v in sorted(cats.items())))
    if b.unknown_heads:
        print("\n== heads missing from expense_heads.csv ==")
        for h, n in b.unknown_heads.items():
            print(f"  {n:4d}  {h!r}")


if __name__ == "__main__":
    run()
