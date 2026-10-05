"""Income transform: donations, membership fees, sponsorships, receipts.

Owns ALL trust-wide income. Every transaction is emitted once, from the canonical
sheet of its financial year; the same transaction found in another sheet is attached
as a `duplicate` / `enrichment` source. See data-migration/etl/CONTRACT.md and
data-migration/reports/phase0/C_donations.md.
"""
import os, sys; sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import csv
import re
from collections import Counter, defaultdict
from datetime import date, datetime
from decimal import Decimal
from difflib import SequenceMatcher

from lib import (MAPPINGS, Staging, clean_text, fy_of, name_key, norm_aadhaar, norm_email, norm_mode,
                 norm_pan, norm_phones, parse_amount, parse_date, raw_rows, src, utf8_stdout)

DOMAIN = "donations"
PURPOSES_CSV = MAPPINGS / "income_purposes.csv"

# ---------------------------------------------------------------- sheet layouts

V_A = dict(sr="A", date="B", name="C", addr="D", pan="E", rcpt="F", bank="G", mode="H", kind="I")
V_A_REM = dict(V_A, purpose=["K"])
V_A_DESC = dict(sr="A", date="B", name="C", addr="D", pan="E", rcpt="F", bank="G", mode="H", purpose=["I"])
V_179 = dict(sr="A", date="B", name="C", addr="D", pan="F", rcpt="G", bank="H", mode="I", kind="J",
             ticks={"L": "Donation", "M": "Ad", "N": "Sponsor"})
V_B = dict(sr="A", date="B", name="C", addr="D", pan="E", phone="F", email="G", rcpt="H", bank="I", cash="J",
           mode="K", purpose=["L"])
V_C = dict(sr="A", date="B", name="C", addr="D", pan="E", rcpt="F", bank="G", cash="H", mode="I", purpose=["J"])
V_D = dict(sr="A", date="B", name="C", addr="D", pan="E", phone="F", email="G", rcpt="H", bank="I", mode="J",
           kind="K", purpose=["L"], valid="M", memno="N")
V_E6 = dict(rcpt="B", date="C", purpose=["D"], name="E", mode="F", bank="G")                 # ledger, no cash col
V_E6P = dict(V_E6, pan="I", flags=["H", "J"])
V_E = dict(rcpt="B", date="C", purpose=["D"], name="E", mode="F", cash="G", bank="H", pan="J")  # ledger with cash col
V_M5 = dict(rcpt="A", date="B", purpose=["C"], name="D", mode="E", bank="F")                  # ledger membership
V_M5C = dict(V_M5, cash="G")
V_M = dict(rcpt="A", date="B", purpose=["C"], name="D", mode="E", cash="F", bank="G")
V_DF23 = dict(sr="B", rcpt="C", name="D", bank="E", mode="F", date="G", flags=["H"], pan="I")
V_F = dict(rcpt="B", date="C", purpose=["D"], name="E", mode="F", bank="G", pan="K")
V_G = dict(name="C", datetext="D", rcpt="E", bank="F")
V_G_RAIGAD = dict(name="C", phone="D", datetext="E", rcpt="F", bank="G")
V_H = dict(sr="B", date="C", name="D", addr="E", phone="F", mode="G", pan="H", aadhaar="I", purpose=["J"], bank="K",
           flags=["M"], ref_by="L")
V_AADHAR = dict(sr="A", rcpt="B", date="C", purpose=["D"], name="E", bank="F", phone="H")

MEM = "Membership"


def S(sid, fid, sheet, fy, hdr, cols, canonical=False, context="", **kw):
    d = dict(sid=sid, fid=fid, sheet=sheet, fy=fy, hdr=hdr, cols=cols, canonical=canonical, context=context,
             series_alias=None, bank=None, draft=False, default_kind=None, loose=False, keep_bare=False,
             tag=False, total_row=None)
    d.update(kw)
    return d


# Processing order matters: canonical sheets of a year first, then the sheets that repeat them.
SHEETS = [
    # ---- 2018-19, Corona (2020-21)
    S("F007.S01", "F007", "Donations", None, 4, V_G, True, "Early donations", bank="saraswat"),
    S("F007.S02", "F007", "Donations_Corona_Crisis", None, 4, V_G, True, "Corona crisis fund", bank="saraswat"),
    S("F199.S03", "F199", "Donations", None, 4, V_G, False, "Early donations"),
    S("F199.S04", "F199", "Donations_Corona Crisis", None, 4, V_G, False, "Corona crisis fund"),
    # ---- 2021-22
    S("F176.S02", "F176", "21-22 New Sheet", "2021-22", 1, V_A, True, "Register 2021-22", bank="saraswat"),
    S("F176.S03", "F176", "21-22 New 80G", "2021-22", 1, V_A, True, "Register 2021-22 80G", bank="saraswat"),
    S("F177.S01", "F177", "2021-22", "2021-22", 1, V_A, False, "Register 2021-22"),
    S("F008.S01", "F008", "2021-22", "2021-22", 3, V_H, False, "80G working list 2021-22", draft=True, loose=True),
    S("F008.S02", "F008", "Sheet2", "2021-22", 3, V_H, False, "80G working list 2021-22", draft=True, loose=True),
    S("F007.S03", "F007", "Raigad_Relief_Fund", "2021-22", 4, V_G_RAIGAD, False, "Raigad relief fund",
      loose=True, keep_bare=True, tag=True, bank="saraswat"),
    S("F199.S05", "F199", "Raigad_Relif_Fund", "2021-22", 4, V_G_RAIGAD, False, "Raigad relief fund", loose=True,
      keep_bare=True, tag=True),
    S("F176.S01", "F176", "Sheet1", "2021-22", 2, V_A, False, "Register 2021-22 draft", draft=True, loose=True),
    # ---- 2022-23
    S("F178.S01", "F178", "Sheet1", "2022-23", 1, V_A, True, "Register 2022-23", bank="saraswat"),
    S("F016.S03", "F016", "Membership Receipts 2022-23", "2022-23", 2, V_M5, False, "Ledger membership receipts",
      default_kind=MEM, bank="saraswat"),
    S("F016.S04", "F016", "Ad_Spons_Dontn Rcpts 2022-23", "2022-23", 2, V_E6, False, "Ledger receipts",
      bank="saraswat"),
    # ---- 2023-24 (ledger is the row set)
    S("F026.S03", "F026", "Ad_Spons_Dontn Rcpts 2023-24", "2023-24", 2, V_E6P, True, "Ledger receipts",
      bank="saraswat"),
    S("F026.S02", "F026", "Membership Receipts 2023-24", "2023-24", 2, V_M5C, True, "Ledger membership receipts",
      default_kind=MEM, bank="saraswat"),
    S("F026.S08", "F026", "दिवाळी फराळ देणग्या २०२३", "2023-24", 3, V_DF23, True, "Diwali Faral", bank="saraswat"),
    S("F026.S11", "F026", "Dnyankiran Donations", "2023-24", 2, V_E6P, True, "Dnyankiran donations", bank="saraswat",
      tag=True),
    S("F179.S01", "F179", "Sheet1", "2023-24", 2, V_179, False, "Register 2023-24"),
    # ---- 2024-25
    S("F180.S01", "F180", "Donations & Membership 2024-25", "2024-25", 2, V_A_REM, True, "Register 2024-25",
      bank="saraswat"),
    S("F180.S02", "F180", "Other Contributions", "2024-25", 2, V_A_DESC, True, "Other contributions",
      bank="saraswat"),
    S("F033.S03", "F033", "Membership Receipts 2024-25", "2024-25", 2, V_M, False, "Ledger membership receipts",
      default_kind=MEM, bank="saraswat"),
    S("F033.S04", "F033", "Ad_Spons_Dontn Rcpts 2024-25", "2024-25", 2, V_E, False, "Ledger receipts",
      series_alias="PCFPT", bank="saraswat"),
    S("F033.S02", "F033", "दिवाळी फराळ २०२४, ETC", "2024-25", 2, V_B, False, "Other contributions", bank="saraswat"),
    S("F047.S01", "F047", "Sheet1", None, 2, V_AADHAR, False, "Aadharstambh", series_alias="PCFPT"),
    # ---- 2025-26
    S("F181.S01", "F181", "Donations & Membership 2025-26", "2025-26", 2, V_A_REM, True, "Register 2025-26"),
    S("F181.S02", "F181", "Donations EDK 2025", "2025-26", 2, V_B, True, "EDK", bank="hdfc"),
    S("F181.S03", "F181", "Pancham", "2025-26", 2, V_C, True, "Pancham"),
    S("F181.S04", "F181", "Prusthadaan", "2025-26", 2, V_C, True, "Prusthadaan drive"),
    S("F181.S05", "F181", "Other Contributions", "2025-26", 2, V_C, True, "Other contributions"),
    S("F068.S01", "F068", "Saraswat Account", "2025-26", 2, V_E, False, "Ledger receipts", series_alias="PCFPT",
      bank="saraswat"),
    S("F080.S04", "F080", "Spons_Dontn_&_TD 2025-26", "2025-26", 2, V_E, False, "Ledger receipts",
      series_alias="PCFPT", bank="saraswat"),
    S("F080.S03", "F080", "Membership Receipts 2025-26", "2025-26", 2, V_M, False, "Ledger membership receipts",
      default_kind=MEM, bank="saraswat"),
    S("F080.S08", "F080", "HDFC inward", "2025-26", 2, V_B, False, "EDK", bank="hdfc"),
    S("F080.S02", "F080", "Pancham, ETC", "2025-26", 2, V_B, False, "Pancham and other contributions"),
    S("F068.S02", "F068", "HDFC Account", "2025-26", 2, V_B, False, "EDK", bank="hdfc"),
    S("F068.S03", "F068", "HDFC Account (2)", "2025-26", 2, V_F, False, "Ledger receipts", bank="hdfc"),
    S("F068.S04", "F068", "SBI Account", "2025-26", 2, V_F, False, "Ledger receipts", bank="sbi"),
    S("F095.S02", "F095", "Inward Entries", "2025-26", 2, V_B, False, "EDK", bank="hdfc"),
    S("F094.S02", "F094", "HDFC inward", "2025-26", 2, V_B, False, "EDK", bank="hdfc"),
    S("F094.S04", "F094", "दिवाळी फराळ 2025", "2025-26", 2, V_B, False, "Diwali Faral"),
    S("F119.S01", "F119", "Sheet1", "2025-26", 2, V_B, False, "Pancham"),
    # ---- 2026-27
    S("F182.S01", "F182", "Donations & Membership 2026-27", "2026-27", 2, V_D, True, "Register 2026-27"),
    S("F182.S06", "F182", "Gaurav 2026", "2026-27", 2, V_C, True, "Gaurav", bank="hdfc"),
    S("F182.S04", "F182", "Donations EDK 2025", "2026-27", 2, V_B, False, "EDK"),
    S("F182.S05", "F182", "Pancham", "2026-27", 2, V_C, False, "Pancham"),
    S("F182.S07", "F182", "Other Contributions", "2026-27", 2, V_C, False, "Other contributions"),
    S("F183.S01", "F183", "Donations & Membership 2026-27", "2026-27", 2, V_D, False, "Register 2026-27"),
    S("F183.S06", "F183", "Gaurav 2026", "2026-27", 2, V_C, False, "Gaurav"),
    S("F132.S02", "F132", "Spons_Dontn_&_TD 2026-27", "2026-27", 2, V_E, False, "Ledger receipts",
      series_alias="PCFPT", bank="saraswat"),
    S("F132.S03", "F132", "Membership Receipts 2026-27", "2026-27", 2, V_M, False, "Ledger membership receipts",
      default_kind=MEM, series_alias="M", bank="saraswat"),
    S("F132.S09", "F132", "HDFC - inwards 26-27", "2026-27", 2, V_B, False, "Gaurav", bank="hdfc"),
    S("F132.S11", "F132", "Pancham, ETC", "2026-27", 2, V_B, False, "Pancham and other contributions"),
    S("F136.S02", "F136", "HDFC - inwards 26-27", "2026-27", 2, V_B, False, "Gaurav", bank="hdfc"),
]

# ---------------------------------------------------------------- pure helpers

RCPT_PATTERNS = [
    ("PCFPT", re.compile(r"^PCFPT\s*/\s*0*(\d+)$", re.I)),
    ("CC", re.compile(r"^PCF?P?T\s*/\s*CC\s*/\s*\d+\s*/\s*0*(\d+)$", re.I)),
    ("M", re.compile(r"^M\s*/\s*\d{2}-\d{2}\s*/\s*0*(\d+)$", re.I)),
    ("M", re.compile(r"^M\s*-\s*0*(\d+)$", re.I)),
    ("PLAIN", re.compile(r"^0*(\d+)$")),
]


def parse_receipt(v):
    """-> (series | None, number | None, as_written | None). Plain numbers are zero-stripped ('076' = 76)."""
    if v is None or isinstance(v, bool):
        return None, None, None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    if isinstance(v, int):
        return ("PLAIN", v, str(v)) if v > 0 else (None, None, str(v))
    s = clean_text(v)
    if not s:
        return None, None, None
    for series, pat in RCPT_PATTERNS:
        m = pat.match(s)
        if m and int(m.group(1)) > 0:
            return series, int(m.group(1)), s
    return None, None, s


def payment_ref(mode_text):
    """The transaction reference in a free-text mode cell: the first run of 6+ digits, leading zeros
    removed (so 'UPI/123456789012' and 'UPI 123456789012' agree). None when absent."""
    if isinstance(mode_text, float) and mode_text.is_integer():
        mode_text = int(mode_text)
    s = clean_text(mode_text)
    if not s:
        return None
    m = re.search(r"\d{6,}", s)
    return (m.group(0).lstrip("0") or None) if m else None


DATE_IN_TEXT = re.compile(r"\d{1,2}\s*[-/.=]\s*\d{1,2}\s*[-/.=]\s*\d{2,4}")


def split_mode_date(text):
    """'Bank Transfer on 10-04-2020' -> ('Bank Transfer', '10-04-2020'); no date -> (text, None)."""
    s = clean_text(text)
    if not s:
        return None, None
    m = DATE_IN_TEXT.search(s)
    if not m:
        return s, None
    mode = re.sub(r"(?i)\s*(received\s+)?on\s*$", "", s[:m.start()]).strip() or None
    return mode, m.group(0).replace("=", "-")


ORG_RE = re.compile(r"(?i)\b(pvt|private|ltd|limited|llp|trust|foundation|mandal|jewellers?|motors?|industries|"
                    r"enterprises?|associates|company|corporation|bank|sanstha|samaj|pratishthan|agency|"
                    r"india|technologies|solutions|services|luxuries|hospital|clinic|traders|"
                    r"builders|developers|constructions?|caterers|group|auto)\b")


def is_org(name):
    return bool(name and ORG_RE.search(name))


def name_tokens(name):
    k = name_key(name)
    return [t for t in (k or "").split() if t not in ("and", "&")]


def same_name(a, b):
    """Normalised-name equality, tolerant of initials and a missing middle name:
    equal keys, or first and last tokens equal, or one token set inside the other (2+ tokens)."""
    ta, tb = name_tokens(a), name_tokens(b)
    if not ta or not tb:
        return False
    if ta == tb:
        return True
    sa, sb = set(ta), set(tb)
    small, big = (sa, sb) if len(sa) <= len(sb) else (sb, sa)
    if len(small) >= 2 and small <= big:
        return True
    if len(ta) >= 2 and len(tb) >= 2 and ta[-1] == tb[-1] and ta[0] == tb[0]:
        return True
    return False


def close_name(a, b):
    """same_name, or spellings at least 80% alike ('Chaya Vadnere' / 'Chhaya Wadnere'). Used for the
    draft and early fund sheets, whose names were typed independently of the final register."""
    if same_name(a, b):
        return True
    ka, kb = name_key(a), name_key(b)
    return bool(ka and kb) and SequenceMatcher(None, ka, kb).ratio() >= 0.8


def loose_name(a, b):
    """Weakest test, used only next to a matching receipt number: close_name or any shared token of 3+ letters."""
    if close_name(a, b):
        return True
    sa = {t for t in name_tokens(a) if len(t) >= 3}
    sb = {t for t in name_tokens(b) if len(t) >= 3}
    return bool(sa & sb)


def pincode_of(addr):
    m = re.search(r"(?<!\d)([1-9]\d{2})\s?(\d{3})(?!\d)", addr or "")
    return m.group(1) + m.group(2) if m else None


def city_of(addr):
    """Only when the address cell is nothing but a place name (one or two words, no digits)."""
    s = clean_text(addr)
    if s and re.fullmatch(r"[A-Za-z]+(?: [A-Za-z]+)?", s.strip(" ,.")):
        return s.strip(" ,.").title()
    return None


PAN_HOLDER = set("PCHFATBLJG")


def pan_status(v):
    """-> (normalised | None, status) with status in blank, valid, valid_spaces, bad_holder_letter, invalid."""
    s = clean_text(v)
    pan, ok = norm_pan(v)
    if pan is None:
        return None, "blank"
    if not ok:
        return pan, "invalid"
    if pan[3] not in PAN_HOLDER:
        return pan, "bad_holder_letter"
    return pan, ("valid_spaces" if re.search(r"\s", s) else "valid")


def ranges(nums):
    """[1,2,3,7,9,10] -> '1-3, 7, 9-10'."""
    out, nums = [], sorted(set(nums))
    i = 0
    while i < len(nums):
        j = i
        while j + 1 < len(nums) and nums[j + 1] == nums[j] + 1:
            j += 1
        out.append(str(nums[i]) if i == j else f"{nums[i]}-{nums[j]}")
        i = j + 1
    return ", ".join(out)


TOTAL_F = re.compile(r"(?i)SUM\(|[A-Z]{1,2}\$?\d+")


def is_total_formula(f):
    return bool(f and TOTAL_F.search(str(f)))


# ---------------------------------------------------------------- purposes mapping

def load_purposes(path=PURPOSES_CSV):
    rules = []
    with open(path, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            pat = (r.get("purpose_pattern") or "").strip()
            if not pat or pat.startswith("#"):
                continue
            r = {k: (v or "").strip() or None for k, v in r.items()}
            r["_re"] = re.compile(pat, re.I)
            rules.append(r)
    return rules


def classify(text, rules):
    """First rule (file order) whose pattern is found in the text. -> rule dict | None."""
    for r in rules:
        if r["_re"].search(text or ""):
            return r
    return None


def load_events():
    by_slug, by_series = {}, defaultdict(dict)
    with open(MAPPINGS / "events.csv", encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            by_slug[r["slug"]] = r
            by_series[r["series"]][r["fy"]] = r["slug"]
    return by_slug, by_series


def resolve_event(spec, fy, by_slug, by_series):
    """'diwali-faral-*' -> the event of that series in the FY (or the only one of the series); a full slug is kept."""
    if not spec:
        return None, None
    if not spec.endswith("-*"):
        return (spec, None) if spec in by_slug else (None, f"unknown event slug {spec}")
    series = by_series.get(spec[:-2], {})
    if fy in series:
        return series[fy], None
    if len(series) == 1:
        return next(iter(series.values())), None
    return None, f"no event of series {spec[:-2]} in {fy}"


# ---------------------------------------------------------------- reading

def _txt(v):
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    if isinstance(v, datetime):
        return v.date().isoformat()
    return clean_text(v)


def read_sheet(cfg):
    """-> list of row dicts with 'cls' in record, cancelled, total, section, empty, note."""
    c = cfg["cols"]
    out = []
    section = None
    own_cols = {v for v in c.values() if isinstance(v, str)} | set(c.get("purpose", [])) | set(c.get("flags", []))
    for n, cells in raw_rows(cfg["fid"], cfg["sheet"]):
        if n <= cfg["hdr"]:
            continue
        f = cells.get("_f") or {}
        g = lambda k: cells.get(c[k]) if k in c else None
        r = dict(sid=cfg["sid"], fid=cfg["fid"], sheet=cfg["sheet"], row=n, cfg=cfg)
        texts = [v for k, v in cells.items() if k != "_f" and isinstance(v, str)]
        own = [v for k, v in cells.items() if k in own_cols and isinstance(v, str)]
        nm = g("name")
        r["name"] = clean_text(nm) if isinstance(nm, str) else None
        name_is_number = isinstance(nm, (int, float))
        bank_raw, cash_raw = g("bank"), g("cash")
        bank, bnote = (None, "unparsed") if isinstance(bank_raw, (datetime, date)) else parse_amount(bank_raw)
        cash, cnote = (None, "unparsed") if isinstance(cash_raw, (datetime, date)) else parse_amount(cash_raw)
        r["bank_amt"], r["cash_amt"] = bank, cash
        r["amount"] = (bank or Decimal(0)) + (cash or Decimal(0)) if (bank is not None or cash is not None) else None
        r["amount_notes"] = [x for x in (bnote, cnote) if x and x != "text"]
        r["amount_formula"] = f.get(c.get("bank")) or f.get(c.get("cash"))
        r["amount_as_written"] = " + ".join(str(x) for x in (bank_raw, cash_raw) if x not in (None, "")) or None
        if "datetext" in c:
            mode_txt, dtxt = split_mode_date(g("datetext"))
            r["mode_raw"] = mode_txt
            r["date_raw"] = clean_text(g("datetext"))
            r["date"], r["date_note"] = parse_date(dtxt) if dtxt else (None, None)
            r["date_embedded"] = True
        else:
            dr = g("date")
            r["date_raw"] = _txt(dr)
            r["date"], r["date_note"] = parse_date(dr)
            r["mode_raw"] = _txt(g("mode"))
            r["date_embedded"] = False
        r["series"], r["number"], r["rcpt_raw"] = parse_receipt(g("rcpt"))
        r["series_alt"] = None
        if r["series"] == "PLAIN" and cfg["series_alias"]:
            r["series_alt"], r["series"] = "PLAIN", cfg["series_alias"]
        r["addr"] = _txt(g("addr"))
        r["pan_raw"] = _txt(g("pan"))
        r["phones"] = norm_phones(g("phone"))
        r["phone_raw"] = _txt(g("phone"))
        r["email"] = norm_email(g("email"))
        r["aadhaar"] = norm_aadhaar(g("aadhaar"))
        r["kind_raw"] = _txt(g("kind")) or cfg["default_kind"]
        purposes = [_txt(cells.get(col)) for col in c.get("purpose", [])]
        purposes += [f"tick:{lab}" for col, lab in c.get("ticks", {}).items() if cells.get(col) in (1, 1.0)]
        purposes += [_txt(cells.get(col)) for col in c.get("flags", [])]
        r["purposes"] = [p for p in purposes if p]
        r["memno"] = _txt(g("memno"))
        vd = g("valid")
        r["valid"] = vd.date().isoformat() if isinstance(vd, datetime) else _txt(vd)
        r["ref"] = payment_ref(r["mode_raw"])
        has_amt = r["amount"] is not None
        date_cell_text = isinstance(g("date"), str) and bool(g("date").strip())
        bare = bool(r["name"]) and has_amt and not r["date"] and not r["rcpt_raw"] and not r["mode_raw"]
        if any("cancel" in t.lower() for t in texts) or (
                not has_amt and any("dishonour" in t.lower() for t in texts)):
            r["cls"] = "cancelled"
        elif is_total_formula(r["amount_formula"]) or any(re.search(r"(?i)\btotal\b", t) for t in own) or (
                not r["name"] and any(re.search(r"(?i)\bbalance\b", t) for t in own)):
            r["cls"] = "total"
        elif name_is_number:
            r["cls"] = "note"
        elif not r["name"] and not has_amt:
            bare = not r["date"] and not r["rcpt_raw"] and not r["mode_raw"] and not r["addr"]
            r["cls"] = "section" if (bare and date_cell_text) or not bare else "empty"
        elif not r["name"] and has_amt and not r["date"] and not r["rcpt_raw"] and not r["ref"]:
            r["cls"] = "total"                      # nameless figure with no date, receipt or payment reference
        elif bare and "sr" in c and cells.get(c["sr"]) in (None, "") and not cfg["keep_bare"]:
            r["cls"] = "total"                      # a labelled subtotal typed in the name column
        elif r["name"] and not has_amt and not r["date"] and not r["rcpt_raw"] and not r["mode_raw"]:
            r["cls"] = "section"
        else:
            r["cls"] = "record"
        if r["cls"] == "section":
            section = clean_text(g("date") if isinstance(g("date"), str) else r["name"]) or section
        elif r["cls"] == "total":
            section = None
        r["section"] = section if r["cls"] in ("record", "cancelled") else None
        out.append(r)
    return out


# ---------------------------------------------------------------- engine

# Row of each sheet that holds its printed grand total (checked against the record rows).
TOTAL_ROWS = {
    "F007.S01": 30, "F007.S02": 45, "F007.S03": 60, "F199.S03": 30, "F199.S04": 45, "F199.S05": 60,
    "F176.S01": 137, "F008.S01": 53, "F008.S02": 53, "F178.S01": 124, "F016.S03": 56, "F016.S04": 85,
    "F026.S02": 155, "F026.S03": 170, "F026.S08": 62, "F026.S11": 18, "F179.S01": 280,
    "F180.S01": 231, "F180.S02": 175, "F033.S02": 176, "F033.S03": 155, "F033.S04": 163,
    "F181.S01": 190, "F181.S02": 219, "F181.S03": 100, "F181.S04": 16, "F181.S05": 83,
    "F068.S01": 107, "F068.S02": 132, "F080.S02": 143, "F080.S03": 83, "F080.S04": 144, "F080.S08": 210,
    "F095.S02": 204, "F094.S02": 182, "F119.S01": 117,
    "F182.S01": 140, "F182.S06": 104, "F183.S01": 140, "F183.S06": 104,
    "F132.S02": 146, "F132.S03": 156, "F132.S09": 120, "F136.S02": 169,
}
INCOME_KINDS = {"donation", "membership_fee", "sponsorship", "advertisement", "event_fee", "csr_grant",
                "book_sale", "interest", "refund_received", "loan_received", "other"}
TRANSFER_KINDS = {"transfer_fd_closure": "fd_closure", "transfer_own_account": "own_account",
                  "transfer_reversal": "reversal"}
PAYER_PREFIX = re.compile(r"(?i)^\s*(sponsorship|csr|advertisement)\s*[-:]\s*(.+)$")


def class_text(context, kind_raw, purposes):
    """The string the purpose rules are matched against: 'context | kind column | purpose | purpose ...'."""
    return " | ".join([context or "", kind_raw or ""] + [p for p in purposes if p])


class Engine:
    def __init__(self, st, rules):
        self.st, self.rules = st, rules
        self.ev_slug, self.ev_series = load_events()
        self.entries = []
        self.by_rcpt, self.by_dar = defaultdict(list), defaultdict(list)
        self.by_da, self.by_fa, self.by_d = defaultdict(list), defaultdict(list), defaultdict(list)
        self.by_far, self.l2b_rows = defaultdict(list), defaultdict(list)
        self.levels = Counter()
        self.stats = {}
        self.pan_bad, self.pan_conflicts = defaultdict(list), defaultdict(list)
        self.l4_rows, self.sec_noamt, self.no_rcpt = defaultdict(list), defaultdict(list), defaultdict(list)
        self.printed = {}

    # ---- entries
    def index(self, e):
        if e["number"] is not None:
            self.by_rcpt[(e["fy"], e["series"], e["number"])].append(e)
        if e["amount"] is not None:
            self.by_fa[(e["fy"], e["amount"])].append(e)
            if e["ref"]:
                self.by_far[(e["fy"], e["amount"], e["ref"])].append(e)
            if e["date"]:
                self.by_da[(e["date"], e["amount"])].append(e)
                if e["ref"]:
                    self.by_dar[(e["date"], e["amount"], e["ref"])].append(e)
        if e["date"]:
            self.by_d[e["date"]].append(e)

    def new_entry(self, r, cfg, series=None):
        e = dict(id=len(self.entries), sid=r["sid"], row=r, fy=r["fy"], series=series or r["series"],
                 number=r["number"], rcpt_raw=r["rcpt_raw"], amount=r["amount"], bank_amt=r["bank_amt"],
                 cash_amt=r["cash_amt"], date=r["date"], name=r["name"], ref=r["ref"],
                 cancelled=r["cls"] == "cancelled", sources=[src(r["fid"], r["sheet"], r["row"], "primary")],
                 purposes=list(r["purposes"]), kind_raw=r["kind_raw"], context=cfg["context"], section=r["section"],
                 pan_raw=r["pan_raw"], phones=list(r["phones"]), email=r["email"], aadhaar=r["aadhaar"],
                 addr=r["addr"], memno=r["memno"], valid=r["valid"], mode_raw=r["mode_raw"], bank=cfg["bank"],
                 matched=set(), canonical=cfg["canonical"], review=not cfg["canonical"], notes=[],
                 flags=[])
        if cfg["tag"]:
            e["purposes"].append(cfg["context"])
        self.entries.append(e)
        self.index(e)
        self.stats[cfg["sid"]]["emitted"] += 1
        return e

    def attach(self, targets, r, cfg, level, fill=True):
        """Add row r as a further source of the entry/entries; fill blanks of the entry from it."""
        targets = targets if isinstance(targets, list) else [targets]
        for e in targets:
            added = False
            if fill:
                rp = norm_pan(r["pan_raw"])[0]
                if rp:
                    ep = norm_pan(e["pan_raw"])[0]
                    if not ep:
                        e["pan_raw"], added = r["pan_raw"], True
                    elif ep != rp:
                        self.pan_conflicts[r["sid"]].append(
                            {"row": r["row"], "primary": f"{e['sid']} r{e['row']['row']}"})
                for ph in r["phones"]:
                    if ph not in e["phones"]:
                        e["phones"].append(ph)
                        added = True
                for k in ("email", "aadhaar", "addr", "memno", "valid"):
                    if not e[k] and r[k]:
                        e[k], added = r[k], True
                have = {p.lower() for p in e["purposes"]} | {(e["kind_raw"] or "").lower()}
                for p in r["purposes"] + ([cfg["context"]] if cfg["tag"] else []):
                    if p.lower() not in have:
                        e["purposes"].append(p)
                        have.add(p.lower())
                        added = True
                if not e["mode_raw"] and r["mode_raw"]:
                    e["mode_raw"], e["ref"], added = r["mode_raw"], r["ref"], True
                if e["date"] is None and r["date"] and not e["cancelled"]:
                    e["date"], added = r["date"], True
                    e["notes"].append(f"date taken from {r['sid']} r{r['row']}")
                    e["review"] = True
                if not e["bank"] and cfg["bank"] and r["amount"] is not None:
                    e["bank"] = cfg["bank"]
            e["sources"].append(src(r["fid"], r["sheet"], r["row"], "enrichment" if added else "duplicate"))
            e["matched"].add(cfg["sid"])
        self.levels[level] += 1
        self.stats[cfg["sid"]]["duplicate"] += 1
        self.stats[cfg["sid"]]["dup:" + level] += 1

    def ev(self, sid, row):
        return {"sheet": sid, "row": row}

    # ---- level 1: receipt number
    def l1_candidates(self, r, cfg):
        for series in [r["series"]] + ([r["series_alt"]] if r["series_alt"] else []):
            c = [e for e in self.by_rcpt.get((r["fy"], series, r["number"]), []) if e["sid"] != cfg["sid"]]
            if c:
                return c
        return []

    def l1_strict(self, grp, cands, cfg):
        """Receipt number AND amount agree, and so does the payer name or the payment reference."""
        done, sid = set(), cfg["sid"]
        for r in grp:
            if r["cls"] != "record" or r["amount"] is None:
                continue
            m = [e for e in cands if not e["cancelled"] and e["amount"] == r["amount"] and sid not in e["matched"]
                 and (same_name(e["name"], r["name"]) or (r["ref"] and r["ref"] == e["ref"]))]
            if m:
                self.attach(next((x for x in m if same_name(x["name"], r["name"])), m[0]), r, cfg, "L1")
                done.add(id(r))
        return done

    def l1(self, grp_all, cands, cfg, already):
        """Rest of a receipt group: same number, amount equal without name agreement, lines grouped
        differently, cancelled or amount-less rows, and amount conflicts."""
        done = set()
        sid = cfg["sid"]
        grp = [r for r in grp_all if id(r) not in already]
        if not grp:
            return done
        live_e = [e for e in cands if not e["cancelled"]]
        canc_e = [e for e in cands if e["cancelled"]]
        label = grp[0]["rcpt_raw"]
        for r in grp:
            if r["cls"] == "cancelled":
                self.attach((canc_e or cands)[0], r, cfg, "L1", fill=False)
                done.add(id(r))
                if not canc_e:
                    self.st.review("conflicting_sources", f"Receipt {label} is cancelled in one sheet and live in another",
                                   {"fy": r["fy"], "cancelled_in": self.ev(r["sid"], r["row"]),
                                    "live_in": self.ev(cands[0]["sid"], cands[0]["row"]["row"])},
                                   "high", suggested_action="Confirm whether the receipt was cancelled.")
                    cands[0]["review"] = True
        rows = [r for r in grp if r["cls"] == "record"]
        if not live_e:
            for r in rows:
                self.attach(canc_e[0], r, cfg, "L1", fill=False)
                done.add(id(r))
                if r["amount"] is not None:
                    self.st.review("conflicting_sources", f"Cancelled receipt {label} carries an amount in another sheet",
                                   {"fy": r["fy"], "cancelled_in": self.ev(canc_e[0]["sid"], canc_e[0]["row"]["row"]),
                                    "amount_in": self.ev(r["sid"], r["row"]), "amount": str(r["amount"]),
                                    "remark": " | ".join(r["purposes"])[:160]},
                                   "medium", suggested_action="Not imported as income. Confirm the money was returned or never realised.")
            return done
        with_amt = [r for r in rows if r["amount"] is not None]
        all_amt = [r for r in grp_all if r["cls"] == "record" and r["amount"] is not None]
        for r in rows:
            if r["amount"] is None:
                self.attach(next((e for e in live_e if loose_name(e["name"], r["name"])), live_e[0]), r, cfg, "L1")
                done.add(id(r))
        left_r = list(with_amt)
        for e in [x for x in live_e if x["amount"] is None]:
            if not left_r:
                break
            r = next((x for x in left_r if loose_name(e["name"], x["name"])), left_r[0])
            e["amount"], e["bank_amt"], e["cash_amt"] = r["amount"], r["bank_amt"], r["cash_amt"]
            e["notes"].append(f"amount is blank in {e['sid']} r{e['row']['row']}; taken from {r['sid']} r{r['row']}")
            e["review"] = True
            e["flags"].append("amount_from_secondary")
            self.index_amount(e)
            self.attach(e, r, cfg, "L1")
            self.st.review("missing_amount", f"Receipt {label} has no amount in the register; amount taken from the ledger",
                           {"fy": e["fy"], "register": self.ev(e["sid"], e["row"]["row"]),
                            "ledger": self.ev(r["sid"], r["row"]), "amount": str(r["amount"])},
                           "medium", suggested_action="Confirm the amount.")
            left_r.remove(r)
            done.add(id(r))
        have = [e for e in live_e if e["amount"] is not None and "amount_from_secondary" not in e["flags"]]
        left_e = [e for e in have if sid not in e["matched"]]
        for r in list(left_r):
            m = [e for e in left_e if e["amount"] == r["amount"]]
            if m:
                e = next((x for x in m if same_name(x["name"], r["name"])), m[0])
                self.attach(e, r, cfg, "L1")
                left_e.remove(e)
                left_r.remove(r)
                done.add(id(r))
        if not left_r or not have:
            return done
        if left_e and sum(r["amount"] for r in left_r) == sum(e["amount"] for e in left_e):
            for r in left_r:
                self.attach(list(left_e), r, cfg, "L1")       # same receipt, lines grouped differently
                done.add(id(r))
        elif not left_e and sum(r["amount"] for r in all_amt) == sum(e["amount"] for e in have):
            for r in left_r:
                self.attach(have[0], r, cfg, "L1")
                done.add(id(r))
        else:
            for r in left_r:
                pool = left_e or have
                e = next((x for x in pool if loose_name(x["name"], r["name"])), None)
                if e is None:
                    continue                                    # another payer on the same number: not a duplicate
                self.attach(e, r, cfg, "L1-amount-differs")
                done.add(id(r))
                if e in left_e:
                    left_e.remove(e)
                e["review"] = True
                self.st.review("conflicting_sources", f"Receipt {label}: amount differs between sheets",
                               {"fy": r["fy"], "imported_from": self.ev(e["sid"], e["row"]["row"]),
                                "imported_amount": str(e["amount"]), "other": self.ev(r["sid"], r["row"]),
                                "other_amount": str(r["amount"]),
                                "receipt_total_imported": str(sum(x["amount"] for x in have)),
                                "receipt_total_other": str(sum(x["amount"] for x in all_amt))},
                               "medium", suggested_action="Check the receipt book; the imported amount is the canonical sheet's.")
        return done

    def index_amount(self, e):
        self.by_fa[(e["fy"], e["amount"])].append(e)
        if e["ref"]:
            self.by_far[(e["fy"], e["amount"], e["ref"])].append(e)
        if e["date"]:
            self.by_da[(e["date"], e["amount"])].append(e)
            if e["ref"]:
                self.by_dar[(e["date"], e["amount"], e["ref"])].append(e)

    # ---- levels 2..5 (secondary sheets only)
    @staticmethod
    def other_number(r, e):
        return (r["number"] is not None and e["number"] is not None and
                (e["number"] != r["number"] or e["series"] not in (r["series"], r["series_alt"])))

    def l2(self, r, cfg):
        """(date, amount, payment reference); then the same without the date inside the year."""
        sid = cfg["sid"]
        ok = lambda e: e["sid"] != sid and sid not in e["matched"] and not e["cancelled"]
        other_number = lambda e: self.other_number(r, e)
        if r["ref"]:
            c = [e for e in self.by_dar.get((r["date"], r["amount"], r["ref"]), []) if ok(e)] if r["date"] else []
            level = "L2"
            if not c:
                c = [e for e in self.by_far.get((r["fy"], r["amount"], r["ref"]), []) if ok(e)]
                level = "L2-date-differs"
            if c:
                e = next((x for x in c if same_name(x["name"], r["name"])), c[0])
                self.attach(e, r, cfg, level)
                if level != "L2":
                    self.l2b_rows[sid].append({"row": r["row"], "matched": f"{e['sid']} r{e['row']['row']}",
                                               "date_here": r["date_raw"], "date_there": str(e["date"]),
                                               "amount": str(r["amount"])})
                if other_number(e):
                    e["review"] = True
                    self.st.review("receipt_number_conflict", "Same payment carries two different receipt numbers",
                                   {"fy": r["fy"], "imported": self.ev(e["sid"], e["row"]["row"]),
                                    "imported_receipt": e["rcpt_raw"], "other": self.ev(sid, r["row"]),
                                    "other_receipt": r["rcpt_raw"], "amount": str(r["amount"])},
                                   "medium", suggested_action="Confirm the receipt number.")
                return True
        return False

    def l3_l5(self, r, cfg):
        sid = cfg["sid"]
        ok = lambda e: e["sid"] != sid and sid not in e["matched"] and not e["cancelled"]
        nm = close_name if cfg["loose"] else same_name
        other_number = lambda e: self.other_number(r, e)
        if r["date"] and r["name"]:
            c = [e for e in self.by_da.get((r["date"], r["amount"]), [])
                 if ok(e) and nm(e["name"], r["name"]) and not other_number(e)]
            if c:
                self.attach(c[0], r, cfg, "L3")
                return True
        if r["name"]:
            c = [e for e in self.by_fa.get((r["fy"], r["amount"]), [])
                 if ok(e) and nm(e["name"], r["name"]) and not other_number(e)
                 and (r["date"] is None or e["date"] is None or abs((e["date"] - r["date"]).days) <= 45)]
            if c:
                c.sort(key=lambda e: abs((e["date"] - r["date"]).days) if r["date"] and e["date"] else 0)
                e = c[0]
                self.attach(e, r, cfg, "L4")
                self.l4_rows[sid].append({"row": r["row"], "matched": f"{e['sid']} r{e['row']['row']}",
                                          "date_here": r["date_raw"], "date_there": str(e["date"]),
                                          "amount": str(r["amount"])})
                return True
        if cfg["draft"] and r["date"] and r["name"]:
            c = [e for e in self.by_d.get(r["date"], [])
                 if ok(e) and e["amount"] is not None and nm(e["name"], r["name"])]
            if c:
                e = c[0]
                self.attach(e, r, cfg, "L5-draft-amount-differs")
                e["review"] = True
                self.st.review("conflicting_sources", "Working list and final register show different amounts for the same donor and date",
                               {"fy": r["fy"], "imported": self.ev(e["sid"], e["row"]["row"]),
                                "imported_amount": str(e["amount"]), "working_list": self.ev(sid, r["row"]),
                                "working_amount": str(r["amount"])},
                               "medium", suggested_action="Check which amount was received; the register amount was imported.")
                return True
        return False

    # ---- one sheet
    def process(self, cfg):
        sid = cfg["sid"]
        rows = read_sheet(cfg)
        stt = self.stats[sid] = Counter()
        stt["read"] = len(rows)
        live = []
        for r in rows:
            r["fy"] = cfg["fy"] or fy_of(r["date"])
            if r["cls"] in ("record", "cancelled"):
                if r["amount"] is not None and r["amount"] == 0:
                    r["amount"] = r["bank_amt"] = r["cash_amt"] = None
                live.append(r)
            else:
                stt["skip:" + r["cls"]] += 1
                self.st.skip({"empty": "pre-filled or empty row", "total": "total / subtotal / working figure row",
                              "section": "section heading row", "note": "stray working note"}[r["cls"]])
        self.check_total(cfg, rows)
        recs = [r for r in live if r["cls"] == "record"]
        for r in recs:
            status = pan_status(r["pan_raw"])[1]
            if status in ("invalid", "bad_holder_letter"):
                self.pan_bad[sid].append((r["row"], status))
        groups = {}
        for r in live:
            if r["number"] is not None and r["fy"]:
                groups.setdefault((r["series"], r["number"]), []).append(r)
        done, cand_of = set(), {}
        secondary = lambda r: (not cfg["canonical"] and r["cls"] == "record" and r["amount"] is not None
                               and r["fy"] is not None)
        for key, grp in groups.items():
            cands = self.l1_candidates(grp[0], cfg)
            if cands:
                cand_of[key] = cands
                done |= self.l1_strict(grp, cands, cfg)
        for r in live:
            if id(r) not in done and secondary(r) and self.l2(r, cfg):
                done.add(id(r))
        for key, grp in groups.items():
            if key in cand_of:
                done |= self.l1(grp, cand_of[key], cfg, done)
        pending = []
        for r in live:
            if id(r) in done or (secondary(r) and self.l3_l5(r, cfg)):
                continue
            pending.append(r)
        if not cfg["canonical"]:
            pending = self.split_sum(pending, cfg)
        for r in pending:
            self.unmatched(r, cfg)

    def split_sum(self, pending, cfg):
        """One payment keyed as several lines here and as one line in the register (same payer, same total)."""
        sid = cfg["sid"]
        by_name = defaultdict(list)
        for r in pending:
            if r["cls"] == "record" and r["amount"] is not None and r["name"] and r["fy"]:
                by_name[(r["fy"], name_key(r["name"]))].append(r)
        gone = set()
        for (fy, _), rows in by_name.items():
            if len(rows) < 2:
                continue
            total = sum(r["amount"] for r in rows)
            c = [e for e in self.by_fa.get((fy, total), [])
                 if e["sid"] != sid and sid not in e["matched"] and not e["cancelled"]
                 and same_name(e["name"], rows[0]["name"])
                 and any(r["date"] and e["date"] and abs((e["date"] - r["date"]).days) <= 45 for r in rows)]
            if c:
                for r in rows:
                    self.attach(c[0], r, cfg, "L4")
                    self.l4_rows[sid].append({"row": r["row"], "matched": f"{c[0]['sid']} r{c[0]['row']['row']}",
                                              "date_here": r["date_raw"], "date_there": str(c[0]["date"]),
                                              "amount": str(r["amount"]), "note": f"part of a split payment of {total}"})
                    gone.add(id(r))
        return [r for r in pending if id(r) not in gone]

    def unmatched(self, r, cfg):
        sid, stt = cfg["sid"], self.stats[cfg["sid"]]
        canonical = cfg["canonical"]
        if r["fy"] is None:
            stt["skip:no date, cannot place in a year"] += 1
            self.st.skip("no date and no book year: cannot be placed")
            self.st.review("missing_date", "Row has no date and its sheet has no fixed year",
                           {"sheet": sid, "row": r["row"], "amount": str(r["amount"])}, "medium")
            return
        if r["cls"] == "cancelled" and not canonical and r["number"] is None:
            stt["skip:cancelled row, no number, no counterpart"] += 1
            self.st.skip("cancelled row without number in a secondary sheet")
            return
        if r["cls"] == "record" and r["amount"] is None and not canonical:
            stt["skip:no amount, no counterpart"] += 1
            self.st.skip("secondary-sheet row without amount and without counterpart")
            self.sec_noamt[sid].append(r["row"])
            return
        series = r["series"]
        if r["series_alt"] and cfg["series_alias"] == "PCFPT":
            nums = [n for (fy, s, n) in self.by_rcpt if fy == r["fy"] and s == "PCFPT"]
            if not nums or not (min(nums) - 60 <= r["number"] <= max(nums) + 60):
                series = r["series_alt"]
        e = self.new_entry(r, cfg, series)
        if cfg["keep_bare"] and r["cls"] == "record" and not r["date"] and not r["mode_raw"]:
            e["purposes"].insert(0, r["name"])      # a labelled line such as a cashback, not a donor
        if not canonical and r["cls"] == "record":
            stt["emitted_secondary_only"] += 1
            e["flags"].append("secondary_only")

    def check_total(self, cfg, rows):
        sid = cfg["sid"]
        trow = TOTAL_ROWS.get(sid)
        recs = [r for r in rows if r["cls"] == "record"]
        mine_b = sum((r["bank_amt"] or D0) for r in recs)
        mine_c = sum((r["cash_amt"] or D0) for r in recs)
        info = {"records": len(recs), "sum": str(mine_b + mine_c), "printed": None, "match": None}
        t = next((r for r in rows if r["row"] == trow), None)
        if t is not None and (t["bank_amt"] is not None or t["cash_amt"] is not None):
            pb, pc = t["bank_amt"] or D0, t["cash_amt"] or D0
            info["printed"] = str(pb + pc)
            # ledger sheets print cash and bank in either column: compare each column and the two together
            info["match"] = (pb == mine_b and pc == mine_c) or (pb + pc == mine_b + mine_c)
            if not info["match"]:
                self.st.review("total_mismatch", f"Printed total of {sid} does not equal its rows",
                               {"sheet": sid, "total_row": trow, "printed_bank": str(pb), "printed_cash": str(pc),
                                "rows_bank": str(mine_b), "rows_cash": str(mine_c),
                                "difference": str(mine_b + mine_c - pb - pc), "formula": t["amount_formula"],
                                "records": len(recs)},
                               "medium" if cfg["canonical"] else "low",
                               suggested_action="The rows were imported; the printed total was not used.")
        self.printed[sid] = info


D0 = Decimal(0)


# ---------------------------------------------------------------- emission

class Emitter:
    def __init__(self, eng):
        self.eng, self.st, self.rules = eng, eng.st, eng.rules
        self.fy_kind = defaultdict(lambda: [0, D0])
        self.by_sid = defaultdict(lambda: defaultdict(lambda: [0, D0]))
        self.unclassified = defaultdict(list)
        self.embedded = defaultdict(list)
        self.no_rcpt = defaultdict(list)
        self.pan_bad = defaultdict(list)
        self.event_notes = Counter()
        self.decision = defaultdict(list)

    def event_for(self, spec, e):
        if not spec:
            return None
        if not spec.endswith("-*"):
            if spec not in self.eng.ev_slug:
                self.event_notes[f"unknown event slug {spec}"] += 1
                return None
            return spec
        series = self.eng.ev_series.get(spec[:-2], {})
        hint = " ".join([e["section"] or ""] + e["purposes"])
        for y in re.findall(r"(?<!\d)(20\d\d)(?!\d)", hint):
            for slug in series.values():
                if slug.endswith("-" + y):
                    return slug
        if e["fy"] in series:
            return series[e["fy"]]
        if len(series) == 1:
            return next(iter(series.values()))
        self.event_notes[f"no event of series {spec[:-2]} for {e['fy']}"] += 1
        return None

    def run(self):
        groups = defaultdict(list)
        for e in self.eng.entries:
            if e["number"] is not None:
                groups[(e["fy"], e["series"], e["number"])].append(e)
        for g in groups.values():
            for i, e in enumerate(g, 1):
                e["line"] = i
        self.groups = groups
        for e in self.eng.entries:
            self.emit(e)
        self.summaries()

    def emit(self, e):
        st, r, sid, fy = self.st, e["row"], e["sid"], e["fy"]
        cfg = r["cfg"]
        numbered = e["number"] is not None
        tail = f"{fy}:{e['series']}:{e['number']}:{e['line']}" if numbered else f"{fy}:{sid}:r{r['row']}"
        rkey, ikey = "don:rcpt:" + tail, "don:" + tail
        where = {"sheet": sid, "row": r["row"]}
        is_80g = e["series"] == "PCFPT"
        if e["cancelled"]:
            st.emit("receipts", rkey, dict(
                fy=fy, series=e["series"], number=e["number"], line_no=e.get("line", 1),
                number_as_written=e["rcpt_raw"], receipt_date=r["date"], is_cancelled=True, is_80g=is_80g,
                notes="; ".join(x for x in [e["name"], "cancelled row has no receipt number" if not numbered else None,
                                            " | ".join(e["purposes"]) or None] if x),
                needs_review=not numbered or e["review"]), e["sources"])
            self.by_sid[sid]["cancelled receipt"][0] += 1
            return
        if e["amount"] is None:
            st.review("missing_amount", "Row has a payer or receipt number but no amount",
                      dict(where, receipt=e["rcpt_raw"], fy=fy, purpose=" | ".join(e["purposes"])[:120]), "medium",
                      suggested_action="No income entry was created. Enter the amount if the receipt was realised.")
            if numbered:
                st.emit("receipts", rkey, dict(
                    fy=fy, series=e["series"], number=e["number"], line_no=e["line"], number_as_written=e["rcpt_raw"],
                    receipt_date=e["date"], is_cancelled=False, is_80g=is_80g,
                    notes="no amount in the register; no income entry created", needs_review=True), e["sources"])
            self.by_sid[sid]["no amount (review only)"][0] += 1
            self.eng.stats[sid]["emitted"] -= 1
            self.eng.stats[sid]["skip:no amount"] += 1
            st.skip("row without amount (review item raised)")
            return
        name = e["name"]
        m = PAYER_PREFIX.match(name or "")
        purposes = list(e["purposes"])
        if m:
            name = clean_text(m.group(2))
            purposes.insert(0, m.group(1).title())
        text = class_text(e["context"], e["kind_raw"], purposes)
        rule = classify(text, self.rules)
        review = bool(e["review"])
        notes = list(e["notes"])
        if rule is None:
            self.unclassified[text].append(where)
            rule = dict(kind="other", category_code=None, event_slug=None, scheme_slug=None, fund_code=None)
            review = True
        elif (rule["category_code"] or "").startswith("inc-unspecified"):
            self.unclassified[text].append(where)
            review = True
        # ---- dates
        d = e["date"]
        if d is None:
            review = True
            if r["date_raw"]:
                st.review("ambiguous_date", "Date text could not be read",
                          dict(where, as_written=r["date_raw"], fy_used=fy), "medium",
                          suggested_action="Enter the date by hand; the entry was imported without a date.",
                          table="income_entries", key=ikey)
            else:
                st.review("missing_date", "Row has no date", dict(where, fy_used=fy, amount=str(e["amount"])),
                          "low", suggested_action="Enter the date if known; the sheet's year was used.",
                          table="income_entries", key=ikey)
        else:
            if r["date_embedded"]:
                self.embedded[sid].append({"row": r["row"], "as_written": r["date_raw"], "read_as": d.isoformat(),
                                           "note": r["date_note"]})
            elif r["date_note"] in ("text", "ambiguous_dmy", "text_month_first", "serial") and r["date"] == d:
                st.review("ambiguous_date", "Date stored as text" if r["date_note"] != "ambiguous_dmy"
                          else "Text date where day and month could be swapped (read day-first)",
                          dict(where, as_written=r["date_raw"], read_as=d.isoformat(), note=r["date_note"]),
                          "low" if r["date_note"] == "text" else "medium",
                          suggested_action="Confirm the date.", table="income_entries", key=ikey)
                review = review or r["date_note"] != "text"
            if cfg["fy"] and fy_of(d) != cfg["fy"]:
                review = True
                st.review("date_outside_fy", f"Date falls outside the sheet's year {cfg['fy']}",
                          dict(where, date=d.isoformat(), receipt=e["rcpt_raw"], fy_used=fy), "medium",
                          suggested_action="Probably a typing slip in the year; the entry is kept in the sheet's year with the date as written.",
                          table="income_entries", key=ikey)
        # ---- amount
        for note in r["amount_notes"]:
            review = True
            st.review("bad_amount", "Amount could not be read cleanly", dict(where, as_written=r["amount_as_written"], note=note),
                      "high", table="income_entries", key=ikey)
        if r["amount_formula"] and "amount_from_secondary" not in e["flags"]:
            notes.append(f"amount typed as formula {r['amount_formula']}")
        kind = rule["kind"]
        bank_amt, cash_amt = e["bank_amt"] or D0, e["cash_amt"] or D0
        mode = "cash" if cash_amt and not bank_amt else norm_mode(e["mode_raw"])
        bank = None if mode == "cash" else e["bank"]
        # ---- transfers (kept out of income)
        if kind in TRANSFER_KINDS:
            tk = TRANSFER_KINDS[kind]
            frm = "hdfc" if re.search(r"(?i)HDFC A/C to", text + " " + (name or "")) else None
            st.emit("transfers", "don:trf:" + tail, dict(
                entry_date=d, fy=fy, amount=e["amount"], kind=tk, from_bank_slug=frm, to_bank_slug=e["bank"],
                from_as_written=name or e["mode_raw"], to_as_written=None, particulars=" | ".join(purposes) or None,
                voucher_no_as_written=e["rcpt_raw"] or (e["mode_raw"] if tk == "fd_closure" else None),
                needs_review=tk == "reversal" or review and e["canonical"]), e["sources"])
            self.by_sid[sid]["transfer " + tk][0] += 1
            self.by_sid[sid]["transfer " + tk][1] += e["amount"]
            self.fy_kind[(fy, "TRANSFER " + tk)][0] += 1
            self.fy_kind[(fy, "TRANSFER " + tk)][1] += e["amount"]
            return
        if kind not in INCOME_KINDS:
            raise ValueError(f"income_purposes.csv: unknown kind {kind!r}")
        # ---- person
        pan, pstat = pan_status(e["pan_raw"])
        if pstat in ("invalid", "bad_holder_letter"):
            self.pan_bad[sid].append({"row": r["row"], "problem": pstat})
        person = None
        if name:
            person = {"name": name, "phone": e["phones"][0] if e["phones"] else None,
                      "phone_alt": e["phones"][1] if len(e["phones"]) > 1 else None, "email": e["email"],
                      "pan": pan if pstat != "invalid" else None, "aadhaar": e["aadhaar"], "address": e["addr"],
                      "city": city_of(e["addr"]), "pincode": pincode_of(e["addr"]),
                      "role": "member" if kind == "membership_fee" else "donor",
                      "hint": f"memno:{e['memno']}" if e["memno"] else None}
            if is_org(name):
                person["is_org"] = True
            person = {k: v for k, v in person.items() if v is not None}
        else:
            review = True
            notes.append("no payer name in the sheet")
        if e["valid"]:
            notes.append(f"membership valid till {e['valid']}")
        if bank_amt and cash_amt:
            notes.append(f"bank {bank_amt} + cash {cash_amt}")
        if "secondary_only" in e["flags"]:
            notes.append(f"found only in {sid}, not in the year's register")
            st.review("conflicting_sources", f"Row found only in a secondary sheet ({sid})",
                      dict(where, fy=fy, amount=str(e["amount"]), receipt=e["rcpt_raw"], kind=kind,
                           purpose=" | ".join(purposes)[:120]), "medium",
                      suggested_action="Imported from the secondary sheet. Confirm it is a real receipt and not a variant of a register row.",
                      table="income_entries", key=ikey)
        if numbered:
            st.emit("receipts", rkey, dict(
                fy=fy, series=e["series"], number=e["number"], line_no=e["line"], number_as_written=e["rcpt_raw"],
                receipt_date=d, is_cancelled=False, is_80g=is_80g,
                notes="marked 80G in the ledger" if any(re.fullmatch(r"(?i)80G( compliant)?", p) for p in purposes) and not is_80g else None,
                needs_review=review), e["sources"])
        else:
            self.no_rcpt[sid].append((r["row"], e["amount"]))
        event = self.event_for(rule.get("event_slug"), e)
        st.emit("income_entries", ikey, dict(
            entry_date=d, entry_date_as_written=r["date_raw"], fy=fy, cal_year=d.year if d else None,
            cal_month=d.month if d else None, amount=e["amount"], amount_as_written=r["amount_as_written"],
            kind=kind, kind_as_written=e["kind_raw"] or (purposes[0] if purposes else None), person=person,
            payer_as_written=e["name"], receipt_key=rkey if numbered else None, mode=mode,
            mode_as_written=e["mode_raw"], bank_slug=bank, payment_ref=e["ref"] if mode != "cash" else None,
            purpose_as_written=" | ".join(purposes) or None, fund_code=rule.get("fund_code"), event_slug=event,
            scheme_slug=rule.get("scheme_slug"), category_code=rule.get("category_code"),
            pan_as_written=e["pan_raw"], notes="; ".join(notes) or None, needs_review=review), e["sources"])
        self.fy_kind[(fy, kind)][0] += 1
        self.fy_kind[(fy, kind)][1] += e["amount"]
        self.by_sid[sid][kind][0] += 1
        self.by_sid[sid][kind][1] += e["amount"]
        if kind in ("csr_grant", "sponsorship", "advertisement"):
            self.decision[(fy, kind, "80G receipt" if is_80g else "other receipt")].append(
                {"key": ikey, "amount": str(e["amount"]), "event": event})

    # ---- summary review items
    def summaries(self):
        st, eng = self.st, self.eng
        by_fs = defaultdict(dict)
        for (fy, series, num), g in self.groups.items():
            by_fs[(fy, series)][num] = g
        for (fy, series), nums in sorted(by_fs.items()):
            ks = sorted(nums)
            gaps = [n for n in range(ks[0], ks[-1] + 1) if n not in nums]
            multi = {n: g for n, g in nums.items() if len(g) > 1}
            diff = {n: g for n, g in multi.items()
                    if any(not loose_name(g[0]["name"], x["name"]) for x in g[1:] if g[0]["name"] and x["name"])}
            ev = {"fy": fy, "series": series, "first": ks[0], "last": ks[-1], "numbers_used": len(ks),
                  "missing_numbers": ranges(gaps)[:900], "missing_count": len(gaps),
                  "cancelled": ranges([n for n, g in nums.items() if any(x["cancelled"] for x in g)]),
                  "numbers_on_several_lines": ranges(list(multi)), "several_lines_count": len(multi),
                  "numbers_with_unrelated_payers": ranges(list(diff)),
                  "sheets": sorted({x["sid"] for g in nums.values() for x in g})}
            if gaps or multi:
                st.review("receipt_number_conflict" if diff else "continuity_break",
                          f"Receipt numbering {fy} series {series}: {len(gaps)} unused numbers, {len(multi)} numbers on several lines",
                          ev, "medium" if diff else "low",
                          suggested_action="Check the receipt book: gaps may be unused or lost receipts; repeated numbers are family receipts unless payers are unrelated.")
            if series == "PCFPT":
                for n, g in sorted(multi.items()):
                    st.review("receipt_number_conflict", f"80G receipt PCFPT/{n} appears on {len(g)} lines",
                              {"fy": fy, "lines": [{"sheet": x["sid"], "row": x["row"]["row"], "amount": str(x["amount"]),
                                                    "date": str(x["date"])} for x in g],
                               "same_payer_name": all(same_name(g[0]["name"], x["name"]) for x in g[1:]),
                               "same_payment_reference": len({x["ref"] for x in g}) == 1},
                              "high", suggested_action="Confirm whether one receipt covers both lines or a number was issued twice.")
        for sid, rows in sorted(self.no_rcpt.items()):
            st.review("missing_document", f"{len(rows)} receipts without a receipt number in {sid}",
                      {"sheet": sid, "rows": ranges([x[0] for x in rows]), "count": len(rows),
                       "amount": str(sum(x[1] for x in rows))}, "low",
                      suggested_action="Imported without a receipt record. Issue or record receipt numbers if they exist.")
        for sid, rows in sorted(self.pan_bad.items()):
            st.review("malformed_pan", f"{len(rows)} malformed PAN values in {sid}",
                      {"sheet": sid, "invalid_format_rows": ranges([x["row"] for x in rows if x["problem"] == "invalid"]),
                       "wrong_holder_letter_rows": ranges([x["row"] for x in rows if x["problem"] == "bad_holder_letter"])},
                      "medium", suggested_action="PAN kept as written on the entry; invalid ones were not copied to the person. Correct before any 10BD filing.")
        for sid, rows in sorted(eng.pan_conflicts.items()):
            st.review("conflicting_sources", f"PAN differs between {sid} and the imported row on {len(rows)} receipts",
                      {"sheet": sid, "count": len(rows), "rows": rows[:40]}, "medium",
                      suggested_action="The canonical sheet's PAN was kept.")
        for sid, rows in sorted(eng.l4_rows.items()):
            st.review("duplicate_transaction", f"{len(rows)} rows of {sid} matched on amount and name only (date differs or is absent)",
                      {"sheet": sid, "count": len(rows), "rows": rows[:60]}, "low",
                      suggested_action="Treated as the same transaction and not imported twice. Check any that are really separate payments.")
        for sid, rows in sorted(eng.l2b_rows.items()):
            st.review("duplicate_transaction", f"{len(rows)} rows of {sid} matched on amount and payment reference with a different date",
                      {"sheet": sid, "count": len(rows), "rows": rows[:60]}, "low",
                      suggested_action="Treated as the same payment; one of the two dates is a typing slip.")
        for sid, rows in sorted(eng.sec_noamt.items()):
            st.review("missing_amount", f"{len(rows)} rows without amount in secondary sheet {sid}",
                      {"sheet": sid, "rows": ranges(rows)}, "low", suggested_action="Not imported.")
        for sid, rows in sorted(self.embedded.items()):
            st.review("ambiguous_date", f"{len(rows)} dates in {sid} are written inside free text (read day-first)",
                      {"sheet": sid, "count": len(rows), "rows": rows}, "low",
                      suggested_action="Confirm the dates; the text is kept as written.")
        for text, rows in sorted(self.unclassified.items()):
            st.review("unclassified_head", f"Income purpose not classified: {text[:80]}",
                      {"text": text, "count": len(rows), "rows": rows[:40]}, "medium",
                      suggested_action="Add or correct a line in mappings/income_purposes.csv.")
        # Pancham: register against the ledger copy
        reg_only = [e for e in eng.entries if e["sid"] == "F181.S03" and "F080.S02" not in e["matched"]]
        led_only = [e for e in eng.entries if e["sid"] == "F080.S02" and any("pancham" in p.lower() for p in e["purposes"])]
        if reg_only or led_only:
            st.review("conflicting_sources", "Pancham 2025-26: register and ledger do not reconcile",
                      {"register_rows_not_in_ledger": ranges([e["row"]["row"] for e in reg_only]),
                       "register_only_count": len(reg_only),
                       "register_only_amount": str(sum(e["amount"] or D0 for e in reg_only)),
                       "ledger_rows_not_in_register": ranges([e["row"]["row"] for e in led_only]),
                       "ledger_only_count": len(led_only),
                       "ledger_only_amount": str(sum(e["amount"] or D0 for e in led_only)),
                       "register": "F181.S03", "ledger": "F080.S02",
                       "working_figures": "60,500 'as per' figure and differences typed under both sheets"},
                      "high", suggested_action="Both sets were imported once each; ledger-only rows are flagged. Decide which rows are real.")
        if self.decision:
            st.review("trustee_decision", "CSR, sponsorship and advertisement receipts: confirm they are separate income types",
                      {"groups": [{"fy": fy, "kind": k, "receipt": rc, "count": len(v),
                                   "amount": str(sum(Decimal(x["amount"]) for x in v)), "keys": [x["key"] for x in v][:30]}
                                  for (fy, k, rc), v in sorted(self.decision.items())],
                       "note": "Several were issued from the 80G donation series (PCFPT/) or ticked as donations in the register; "
                               "event tags on sponsorships and advertisements are inferred from the purpose text."},
                      "high", suggested_action="Decide whether sponsorship, advertisement and CSR money issued on 80G receipts stays under these kinds or is treated as donation.")
        for note, n in self.event_notes.items():
            st.review("unclassified_head", f"Event not resolved: {note}", {"count": n}, "low",
                      suggested_action="Add the event to mappings/events.csv if it should be tagged.")


def f190_review(st, fy_income):
    rows = {r: c for r, c in raw_rows("F190", "Sheet1")}
    cell = rows.get(11, {})
    st.review("total_mismatch", "Summary sheet figure for 2025-26 (4,158,738) matches no sheet total",
              {"sheet": "F190.S01", "row": 11, "label": cell.get("B"), "figure": str(cell.get("C")),
               "imported_income_2025_26": str(fy_income.get("2025-26", D0)),
               "note": "F190 is a derived summary and was not imported. Its 2019~20 and 2020~21 lines are the Corona and "
                       "Raigad funds labelled one year early; its 2021~22 line counts Raigad twice and omits the 80G sheet."},
              "medium", suggested_action="Ask who prepared the summary how 4,158,738 was derived.")


def run():
    utf8_stdout()
    st = Staging(DOMAIN)
    eng = Engine(st, load_purposes())
    for cfg in SHEETS:
        eng.process(cfg)
    em = Emitter(eng)
    em.run()
    fy_income = defaultdict(lambda: D0)
    for (fy, kind), (n, a) in em.fy_kind.items():
        if not kind.startswith("TRANSFER"):
            fy_income[fy] += a
    f190_review(st, fy_income)
    summary = st.close()
    stats = {
        "tables": summary,
        "dedup_levels": dict(eng.levels),
        "per_fy_kind": {f"{fy} {k}": {"n": n, "amount": str(a)} for (fy, k), (n, a) in sorted(em.fy_kind.items())},
        "per_fy_income": {fy: str(a) for fy, a in sorted(fy_income.items())},
        "per_sheet": {sid: {"rows": dict(eng.stats[sid]), "printed_total": eng.printed.get(sid),
                            "emitted_by_kind": {k: {"n": n, "amount": str(a)} for k, (n, a) in em.by_sid[sid].items()}}
                      for sid in eng.stats},
        "review_by_kind": dict(Counter(r["kind"] for r in st.reviews.values())),
    }
    import json
    from lib import CLEAN_DIR
    with open(CLEAN_DIR / DOMAIN / "_stats.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=1)
    return summary


if __name__ == "__main__":
    run()
