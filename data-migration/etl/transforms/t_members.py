"""MEMBERSHIP transform (domain "members", key prefix "mem:").

Reads the membership workbooks (yearly master registers, discontinued lists, due-date
calculators, contact extracts, the 2018-2022 fee ledger and the pre-trust family group)
and emits memberships, membership_snapshots, trust_officers and a small set of
income_entries. Nothing is guessed silently: every derived date carries its rule, every
doubtful row is flagged and described in the review queue.

Person identity: old numbers were re-used, so a number is never an identity. People are
clustered from (compatible name) AND (same number | serial | PAN | phone | e-mail | birth
date). Two rows whose names are not compatible are never merged, whatever they share.
"""
import os, sys; sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import calendar
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal

from rapidfuzz import fuzz

from lib import (CLEAN_DIR, MONTHS, Staging, clean_text, fy_of, name_key, norm_email, norm_mode, norm_pan,
                 norm_phones, parse_amount, parse_date, raw_rows, src, utf8_stdout)

DOMAIN = "members"
REGISTER_SAVED = date(2026, 8, 8)      # last-saved date of the 2026-27 master (phase 0 report)

# ---------------------------------------------------------------- pure helpers

NUM_RE = re.compile(r"^(SM|GM|PLM)/(\d{2})/(\d{3})$")
PREFIX_TIER = {"SM": "silver", "GM": "gold", "PLM": "platinum"}
TIER_ORDER = {"silver": 1, "gold": 2, "platinum": 3, "other": 4}
TIER_YEARS = {"silver": 1, "gold": 5}
TITLE_TOKENS = {"mr", "mrs", "ms", "miss", "shri", "shree", "sau", "smt", "kum", "ku", "dr", "adv", "prof", "late",
                "kai", "ca", "er", "col", "capt", "maj", "chi", "ch", "lt", "cdr", "wg", "brig", "gen", "retd",
                "master", "hon", "cmde", "sqn", "ldr", "avm", "cmdr", "gp", "wg", "air"}
BLANKS = {"", "-", "--", "na", "n/a", "n.a", "n.a.", "nil", "none", "not.avl.", "not avl", "not available", "not.avl"}


def parse_number(v):
    """'SM/24/173' -> ('SM', 24, 173); anything else -> None."""
    s = clean_text(v)
    m = NUM_RE.match(s) if s else None
    return (m[1], int(m[2]), int(m[3])) if m else None


def number_order(number, first_seen_rank=0):
    """Sort key for 'which number was held first': year part, then the first sheet it appears in,
    then Silver < Gold < Platinum, then serial."""
    p, yy, serial = parse_number(number)
    return (yy, first_seen_rank, ("SM", "GM", "PLM").index(p), serial)


def honorific_gender(name):
    """'f' / 'm' / None from a leading honorific (Mrs, Smt, Miss, Sau, Ku -> f; Mr, Shri, Chi -> m)."""
    m = re.match(r"(?i)\s*(mrs|smt|miss|ms|sau|kum|ku|mr|shri|shree|chi|ch)\b\.?", clean_text(name) or "")
    if not m:
        return None
    return "f" if m[1].lower() in ("mrs", "smt", "miss", "ms", "sau", "kum", "ku") else "m"


def norm_tier(v):
    """Register tier word -> (tier | None, is_known). Unknown words (e.g. 'Diamond') map to 'other'."""
    s = clean_text(v)
    if not s:
        return None, True
    low = s.lower()
    for word, tier in (("silver", "silver"), ("gold", "gold"), ("platinum", "platinum")):
        if low.startswith(word):
            return tier, True
    return "other", False


def _strip_accents(s):
    """Remove accents from Latin letters only ('Pùrva' -> 'Purva'); Devanagari is left untouched."""
    out = []
    for ch in s:
        if ord(ch) < 0x250:
            ch = "".join(c for c in unicodedata.normalize("NFD", ch) if not unicodedata.combining(c))
        out.append(ch)
    return "".join(out)


def name_tokens(name):
    """Name -> tuple of lower-case tokens without honorifics, ranks, bracketed nicknames or a
    trailing ', Place'. 'First Surname / OtherSurname' keeps the part before the slash; a glued
    'abhayPradhan' is split at the capital letter."""
    s = clean_text(name)
    if not s or not re.search(r"[A-Za-zऀ-ॿ]", s):
        return ()
    s = _strip_accents(s)
    s = re.sub(r"\([^)]*\)", " ", s)
    if "/" in s and len(s.split("/")[0].split()) >= 2:
        s = s.split("/")[0]
    m = re.match(r"^(\S+(?:\s+\S+)+)\s*,\s*[A-Za-z]+$", s)
    if m:
        s = m[1]
    s = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", s)
    s = re.sub(r"(?i)\b(?:maj|m|lt|brig)\.?\s+gen\b\.?", " ", s)
    k = name_key(s) or ""
    return tuple(t for t in k.split() if t not in TITLE_TOKENS)


def _phon(t):
    return t.replace("ee", "i").replace("oo", "u").replace("aa", "a").replace("w", "v")


def _tok_ok(a, b, threshold, allow_initial=True, first_name=False):
    if a == b:
        return True
    if allow_initial and (len(a) == 1 or len(b) == 1):
        return a[0] == b[0]
    if min(len(a), len(b)) < 3:
        return False
    pa, pb = _phon(a), _phon(b)
    if pa == pb:
        return True
    if first_name:
        # 'Meghan' / 'Meghana', 'Pramod' / 'Pramodini' are different (gendered) names
        if pa.startswith(pb) or pb.startswith(pa):
            return False
        short, long_ = sorted((pa, pb), key=len)
        if pa[0] != pb[0] and not (len(short) >= 5 and long_.endswith(short)):
            return False                  # 'Neeta' / 'Sunita'; but 'Bhushan' / 'Hembhushan' is a short form
    return fuzz.ratio(pa, pb) >= threshold


def names_compatible(ta, tb):
    """True when two token tuples can be the same person: surname agrees, first name agrees
    (equal, initial, or close spelling) and middle names, when both present, do not conflict.
    A one-word name is only compatible with the identical one-word name."""
    if not ta or not tb:
        return False
    if len(ta) == 1 or len(tb) == 1:
        return ta == tb
    if not _tok_ok(ta[-1], tb[-1], 85, allow_initial=False):
        return False
    if not _tok_ok(ta[0], tb[0], 80, first_name=True):
        return False
    ma, mb = ta[1:-1], tb[1:-1]
    if ma and mb and not _tok_ok(ma[0], mb[0], 75):
        return False
    return True


_DATE_IN_TEXT = re.compile(r"(\d{1,2})\s*(?:st|nd|rd|the|th)?[\s.,]*([A-Za-z]{3,9})[\s.,]*(\d{4})")
_MONTH_YEAR = re.compile(r"\b([A-Za-z]{3,9})\s+(\d{4})\b")


def find_dates(text):
    """All 'day month-name year' dates in a free-text validity cell.
    Returns [(date | None, fragment)]; None means the fragment looks like a date but is not one
    (e.g. '31 Nov 2023', '30th Noiv 2028')."""
    s = clean_text(text)
    if not s:
        return []
    out = []
    for m in _DATE_IN_TEXT.finditer(s):
        d, _ = parse_date(f"{int(m[1])} {m[2]} {m[3]}")
        out.append((d, m[0]))
    return out


def parse_validity(text):
    """Free-text validity -> dict(start, end, label_year, bad, month_only).
    '1 July,2022-30 June,2023' -> start+end; 'Till 30 June 2027' -> end;
    'Till December 2021 ...' -> end = last day of the month (month_only True);
    'New Member Year 2023', 'Life Member 2021' -> label_year."""
    res = {"start": None, "end": None, "label_year": None, "bad": [], "month_only": False}
    s = clean_text(text)
    if not s:
        return res
    found = find_dates(s)
    res["bad"] = [frag for d, frag in found if d is None]
    is_till = bool(re.search(r"(?i)\btill", s))
    if is_till:
        if found:
            res["end"] = found[-1][0]
        else:
            m = re.search(r"(?i)till\s*([A-Za-z]{3,9})\s+(\d{4})", s)
            if m and m[1].lower() in MONTHS:
                y, mo = int(m[2]), MONTHS[m[1].lower()]
                res["end"] = date(y, mo, calendar.monthrange(y, mo)[1])
                res["month_only"] = True
        return res
    if len(found) >= 2:
        res["start"], res["end"] = found[0][0], found[-1][0]
        return res
    if len(found) == 1:
        res["bad"].append(s)            # a lone date that is neither a range nor a 'Till'
        return res
    m = re.search(r"(?i)\b(?:new\s+mem\w*\s+year|life\s+member|gold\s+member)\s+(20\d{2})\b", s)
    if m:
        res["label_year"] = int(m[1])
    return res


def split_tier_periods(groups, master_ranks):
    """One person's numbers in ONE tier -> separate membership periods.
    groups: [(first_rank, last_rank, payload)], one per serial (a rewritten year part is the same
    serial). Consecutive serials stay in one period (renumbering); a new period starts when at least
    one master register lies strictly between the last sheet of the period so far and the first
    sheet of the next serial, i.e. the person was absent from that tier for a whole register."""
    periods, cur_last = [], None
    for first, last, payload in sorted(groups, key=lambda g: (g[0], g[1])):
        if periods and not any(cur_last < r < first for r in master_ranks):
            periods[-1].append(payload)
            cur_last = max(cur_last, last)
        else:
            periods.append([payload])
            cur_last = last
    return periods


def add_years(d, years):
    try:
        return d.replace(year=d.year + years)
    except ValueError:                  # 29 February
        return d.replace(year=d.year + years, day=28)


def period_end(start, tier):
    """Last day of a tier's validity counted from start (Silver 1 year, Gold 5 years)."""
    return add_years(start, TIER_YEARS[tier]) - timedelta(days=1)


_NUM_DATE = re.compile(r"\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{2,4}")


def payment_dates(text):
    """Numeric dates inside a payment note ('Cash received on 22/08/2018 & deposited ... 24/08/2018').
    Returns [(date | None, note, fragment)] in order of appearance."""
    s = clean_text(text)
    if not s:
        return []
    return [parse_date(m[0]) + (m[0],) for m in _NUM_DATE.finditer(s)]


def payment_ref(text):
    """Cheque / IMPS / UPI reference number in a payment note, if any."""
    s = clean_text(text) or ""
    m = re.search(r"(?i)(?:ch(?:eque|q)?\.?\s*no\.?|imps|upi|neft|ref)\s*[:.]?\s*(\d{5,})", s)
    return m[1] if m else None


def cell_date(v):
    """A birth/anniversary cell -> (date | None, note). Bare numbers are read as Excel serials
    (note 'serial_number'), which lib.parse_date refuses below 30000 (dates before 1982)."""
    if v is None:
        return None, None
    if isinstance(v, (datetime, date)):
        return parse_date(v)
    if isinstance(v, bool):
        return None, "unparsed"
    if isinstance(v, (int, float)):
        if 1 <= v <= 60000:
            return (datetime(1899, 12, 30) + timedelta(days=int(v))).date(), "serial_number"
        return None, "unparsed"
    s = clean_text(v)
    if s is None or s.lower() in BLANKS:
        return None, None
    return parse_date(s)


def emails_in(v):
    s = clean_text(v)
    if not s:
        return []
    out = []
    for part in re.split(r"[\s,;/]+", s):
        e = norm_email(part)
        if e and e not in out:
            out.append(e)
    return out


def pincode_in(address):
    m = re.search(r"(?<!\d)([1-9]\d{5})(?!\d)", clean_text(address) or "")
    return m[1] if m else None


def slug(s):
    return re.sub(r"[^a-z0-9ऀ-ॿ]+", "-", (s or "").lower()).strip("-")


def hkey(h):
    return re.sub(r"[\s_.]+", "", str(h).lower()) if h is not None else ""


HEADER_FIELDS = {
    "memno": "number", "msstatus": "ms_status", "nameofmember": "name", "address": "address",
    "location": "location", "area": "area", "contactno": "phone", "emailid": "email",
    "pancardnumber": "pan", "birthdate": "dob", "anndate": "ann", "bloodgr": "blood", "memtype": "tier",
    "memperiod": "period", "authorisedby": "auth", "validperiod": "validity",
    "currentmemvalidity(2022)": "validity", "extendedvalidity": "extended", "remark": "remark",
    "remark2021": "remark2021", "remark2022": "remark2022", "remark2023": "remark2023",
    "latestmembershipstatus": "latest", "idcardstatus": "idcard", "family": "family", "age": "age",
    "membershipvaliduntill": "valid_until", "torenewuntill": "renew_until",
}
SHIFT_SEQ = ["pan", "dob", "ann", "blood", "tier", "period", "auth", "validity", "remark2021", "latest"]


def _next_col(letter, n=1):
    v = 0
    for ch in letter:
        v = v * 26 + ord(ch) - 64
    v += n
    s = ""
    while v:
        v, r = divmod(v - 1, 26)
        s = chr(65 + r) + s
    return s


def map_row(cells, hmap):
    """One register row -> ({field: raw value}, shift) using the sheet's header map
    {field: column letter}. Repairs the two known column shifts:
    'pan'  a row pasted from a register WITH a PAN column into a sheet without one (everything from
           Birth_Date onward sits one column to the right; the Birth_Date cell holds the PAN);
    'age'  a row pasted from a sheet WITH an Age column into one without it."""
    rec = {f: cells.get(c) for f, c in hmap.items()}
    shift = None
    tc = hmap.get("tier")
    if tc and "pan" not in hmap and "dob" in hmap:
        here, nxt = norm_tier(cells.get(tc)), norm_tier(cells.get(_next_col(tc)))
        if here[0] not in PREFIX_TIER.values() and nxt[0] in PREFIX_TIER.values():
            annv = cells.get(hmap["ann"]) if "ann" in hmap else None
            if "age" not in hmap and isinstance(annv, float) and 0 < annv < 130:
                shift = "age"
                c = hmap["dob"]
                for i, f in enumerate(["dob", "age", "ann", "blood", "tier", "period"]):
                    rec[f] = cells.get(_next_col(c, i))
                rec["auth"] = None
            else:
                shift = "pan"
                c = hmap["dob"]
                for f in ("remark2022", "remark2023"):
                    rec.pop(f, None)
                for i, f in enumerate(SHIFT_SEQ):
                    rec[f] = cells.get(_next_col(c, i))
    return rec, shift


# ---------------------------------------------------------------- sheet catalogue

# (file, sheet, kind, fy, snapshot label) in chronological order; the position is the rank used
# for "latest evidence wins". A Discontinued sheet ranks below the master of the same workbook.
SHEETS = [
    ("F001", "Master Members", "master", "2021-22", "Master Members (2020-22 cumulative register)"),
    ("F001", "Active Member 2021-22", "master", "2021-22", "Active Member 2021-22"),
    ("F021", "Sheet1", "aux", "2022-23", None),
    ("F015", "Silver Member", "aux", "2023-24", None),
    ("F015", "Gold Member", "aux", "2023-24", None),
    ("F015", "Platinum Members", "aux", "2023-24", None),
    ("F015", "Till May 31 Renewal", "aux", "2023-24", None),
    ("F015", "Master Members 23-24", "master", "2023-24", "Master Members 23-24 (August 2023)"),
    ("F015", "ID Card Status", "idcard", "2023-24", None),
    ("F022", "Members Discontinued", "disc", "2023-24", None),
    ("F022", "Master Members 23-24", "master", "2023-24", "Master Members 23-24 (March 2024)"),
    ("F194", "Sheet1", "aux", "2024-25", None),
    ("F004", "Master Members 24-25", "contact", "2024-25", None),
    ("F004", "BDays & Anniverasaries", "contact", "2024-25", None),
    ("F032", "For AGM", "agm", "2024-25", None),
    ("F032", "Members Discontinued", "disc", "2024-25", None),
    ("F032", "Master Members 24-25", "master", "2024-25", "Master Members 24-25"),
    ("F061", "Members Discontinued", "disc", "2025-26", None),
    ("F002", "Silver Members", "due", "2025-26", None),
    ("F061", "Master Members 25-26", "master", "2025-26", "Master Members 25-26"),
    ("F130", "Members Discontinued", "disc", "2026-27", None),
    ("F131", "Silver Members", "due", "2026-27", None),
    ("F130", "Master Members 26-27", "master", "2026-27", "Master Members 26-27"),
]
RANK = {(f, s): i for i, (f, s, *_r) in enumerate(SHEETS)}
MASTER_RANKS = [i for i, sh in enumerate(SHEETS) if sh[2] == "master"]
CURRENT = ("F130", "Master Members 26-27")
# sheets that are value-identical copies of an imported sheet: (copy file, copy sheet, original file, original sheet)
COPIES = [
    ("F022", "ID Card Status", "F015", "ID Card Status"), ("F032", "ID Card Status", "F015", "ID Card Status"),
    ("F061", "ID Card Status", "F015", "ID Card Status"), ("F130", "ID Card Status", "F015", "ID Card Status"),
    ("F061", "For AGM", "F032", "For AGM"), ("F130", "For AGM", "F032", "For AGM"),
    ("F006", "Master Members 24-25", "F005", "(csv)"),
]
REASON_RE = re.compile(r"(?i)deceas|discontinu|disciplin|cancel|left group|\?\s*\?|anti")
SENSITIVE_RE = re.compile(r"(?i)disciplin|anti|\?\s*\?")


def _comparable(v):
    if isinstance(v, float) and v.is_integer():
        return int(v)
    if isinstance(v, str):
        return clean_text(v)
    return v


def _cells_equal(a, b):
    ka = {k: _comparable(v) for k, v in a.items() if k != "_f" and _comparable(v) is not None}
    kb = {k: _comparable(v) for k, v in b.items() if k != "_f" and _comparable(v) is not None}
    return ka == kb


class Stats:
    def __init__(self, st):
        self.st, self.by_sheet = st, defaultdict(Counter)

    def read(self, f, s, n=1):
        self.by_sheet[f"{f}/{s}"]["rows_read"] += n

    def used(self, f, s, what, n=1):
        self.by_sheet[f"{f}/{s}"][what] += n

    def skip(self, f, s, reason, n=1):
        self.by_sheet[f"{f}/{s}"][f"skipped: {reason}"] += n
        self.st.skip(f"{f}/{s}: {reason}", n)


# ---------------------------------------------------------------- reading

def read_register(f, s, kind, fy, stats):
    """Rows of a register-shaped sheet as mention dicts."""
    out, hmap = [], None
    for n, cells in raw_rows(f, s):
        stats.read(f, s)
        vals = {k: v for k, v in cells.items() if k != "_f"}
        texts = [clean_text(v) for v in vals.values() if isinstance(v, str)]
        if any(hkey(v) == "memno" for v in vals.values()):
            hmap = {HEADER_FIELDS[hkey(v)]: k for k, v in vals.items() if hkey(v) in HEADER_FIELDS}
            stats.skip(f, s, "header row")
            continue
        if hmap is None:
            stats.skip(f, s, "row above the header")
            continue
        number = clean_text(vals.get(hmap["number"]))
        if any(t and t.startswith("Number of Active") for t in texts):
            stats.skip(f, s, "footer count row")
            continue
        if any(t and t.startswith("To Renew Gold") for t in texts):
            stats.skip(f, s, "section banner")
            continue
        name = clean_text(vals.get(hmap["name"]))
        if not number and not name:
            stats.skip(f, s, "empty pre-numbered slot" if vals else "formula-only template row")
            continue
        rec, shift = map_row(vals, hmap)
        m = {"file": f, "sheet": s, "row": n, "kind": kind, "fy": fy, "rank": RANK[(f, s)], "shift": shift,
             "number": number, "numparts": parse_number(number), "name": name, "tokens": name_tokens(name)}
        for fld in ("ms_status", "address", "location", "area", "blood", "period", "auth", "validity", "extended",
                    "remark", "remark2021", "remark2022", "remark2023", "latest", "idcard", "tier", "family"):
            v = rec.get(fld)
            m[fld] = clean_text(v) if v is not None else None
        m["phone_raw"] = clean_text(rec.get("phone")) if rec.get("phone") is not None else None
        if isinstance(rec.get("phone"), float) and rec["phone"].is_integer():
            m["phone_raw"] = str(int(rec["phone"]))
        m["phones"] = norm_phones(rec.get("phone"))
        m["emails"] = emails_in(rec.get("email"))
        m["email_raw"] = clean_text(rec.get("email"))
        pan, ok = norm_pan(rec.get("pan"))
        m["pan"], m["pan_ok"], m["pan_raw"] = pan, ok, clean_text(rec.get("pan"))
        use_dates = not (f == "F194")                 # F194 dates are degraded to text; not used
        m["dob"], m["dob_note"] = cell_date(rec.get("dob")) if use_dates else (None, None)
        m["ann"], m["ann_note"] = cell_date(rec.get("ann")) if use_dates else (None, None)
        m["dob_raw"], m["ann_raw"] = rec.get("dob"), rec.get("ann")
        m["valid_until"] = rec.get("valid_until").date() if isinstance(rec.get("valid_until"), datetime) else None
        m["renew_until"] = rec.get("renew_until").date() if isinstance(rec.get("renew_until"), datetime) else None
        m["valid_until_is_filldown"] = bool(hmap.get("valid_until") and hmap["valid_until"] in cells.get("_f", {}))
        out.append(m)
    return out


def blank_mention(f, s, n, kind, name, rank=-1):
    return {"file": f, "sheet": s, "row": n, "kind": kind, "fy": None, "rank": rank, "shift": None, "number": None,
            "numparts": None, "name": name, "tokens": name_tokens(name), "phones": [], "emails": [], "pan": None,
            "pan_ok": True, "dob": None, "dob_note": None, "ann": None, "ann_note": None}


def read_pretrust(stats):
    out = []
    layouts = {
        "Member_Details": (4, {"number": "C", "name": "D", "phone": "E", "email": "F", "dob": "G", "ann": "H",
                               "blood": "I", "location": "J"}, "2016-17"),
        "PCFamily_Member_Details": (6, {"number": "C", "name": "D", "address": "E", "phone": "F", "email": "H",
                                        "dob": "I", "ann": "K", "blood": "L", "location": "M"}, "2019-20"),
    }
    for sheet, (hdr, cols, fy) in layouts.items():
        for n, cells in raw_rows("F010", sheet):
            stats.read("F010", sheet)
            if n <= hdr:
                stats.skip("F010", sheet, "title / header row")
                continue
            name = cells.get(cols["name"])
            if not isinstance(name, str) or not name_tokens(name):
                stats.skip("F010", sheet, "no person name on the row (totals, working figures, empty slots)")
                continue
            m = blank_mention("F010", sheet, n, "pretrust", clean_text(name))
            m["fy"] = fy
            m["number"] = clean_text(cells.get(cols["number"]))
            m["phones"] = norm_phones(cells.get(cols["phone"]))
            pr = cells.get(cols["phone"])
            m["phone_raw"] = str(int(pr)) if isinstance(pr, float) and pr.is_integer() else clean_text(pr)
            m["emails"] = emails_in(cells.get(cols["email"]))
            m["dob"], m["dob_note"] = cell_date(cells.get(cols["dob"]))
            m["ann"], m["ann_note"] = cell_date(cells.get(cols["ann"]))
            m["dob_raw"], m["ann_raw"] = cells.get(cols["dob"]), cells.get(cols["ann"])
            m["blood"] = clean_text(cells.get(cols["blood"]))
            m["location"] = clean_text(cells.get(cols["location"]))
            m["address"] = clean_text(cells.get(cols["address"])) if "address" in cols else None
            out.append(m)
    return out


# ---------------------------------------------------------------- clustering

def plausible_dob(d):
    return d is not None and d.year < 2018


class Clusters:
    """Union-find with a complete-linkage name check: two groups are joined only if every name
    form in one is compatible with every name form in the other."""

    def __init__(self, mentions):
        self.parent = list(range(len(mentions)))
        self.names = {i: {m["tokens"]} for i, m in enumerate(mentions)}
        self.sheetrows = {i: {(m["file"], m["sheet"])} if m["kind"] == "pretrust" else set()
                          for i, m in enumerate(mentions)}

    def find(self, i):
        while self.parent[i] != i:
            self.parent[i] = self.parent[self.parent[i]]
            i = self.parent[i]
        return i

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return True
        if any(not names_compatible(x, y) for x in self.names[ra] for y in self.names[rb]):
            return False
        if self.sheetrows[ra] & self.sheetrows[rb]:      # two rows of one pre-trust sheet are two people
            return False
        if rb < ra:
            ra, rb = rb, ra
        self.parent[rb] = ra
        self.names[ra] |= self.names.pop(rb)
        self.sheetrows[ra] |= self.sheetrows.pop(rb)
        return True


def evidence_keys(m):
    keys = []
    if m.get("pan") and m.get("pan_ok"):
        keys.append(("1pan", m["pan"]))
    if m.get("numparts"):
        keys.append(("2num", m["number"]))
        keys.append(("3ser", (m["numparts"][0], m["numparts"][2])))
    for p in m.get("phones") or []:
        keys.append(("4phone", p))
    for e in m.get("emails") or []:
        keys.append(("5email", e))
    if plausible_dob(m.get("dob")):
        keys.append(("6dob", m["dob"]))
    return keys


def cluster_mentions(mentions):
    """Returns (cluster id per mention, refused) where refused lists pairs that share evidence but
    whose names are not compatible (kept apart)."""
    cl = Clusters(mentions)
    blocks = defaultdict(list)
    for i, m in enumerate(mentions):
        if not m["tokens"]:
            continue
        for k in evidence_keys(m):
            blocks[k].append(i)
        if m["kind"] == "pretrust":                     # the two pre-trust sheets are versions of one list
            blocks[("7pretrust-name", m["tokens"])].append(i)
    for k in sorted(blocks, key=lambda k: (k[0], str(k[1]))):
        idx = blocks[k]
        for a in range(len(idx)):
            for b in range(a + 1, len(idx)):
                i, j = idx[a], idx[b]
                if k[0] == "7pretrust-name":
                    if mentions[i]["sheet"] == mentions[j]["sheet"]:
                        continue
                    di, dj = mentions[i].get("dob"), mentions[j].get("dob")
                    if di and dj and di != dj:
                        continue
                if names_compatible(mentions[i]["tokens"], mentions[j]["tokens"]):
                    cl.union(i, j)
    return [cl.find(i) for i in range(len(mentions))]


def link_by_name(tokens, candidates):
    """Name-only link (fee ledger, trustee list): the single candidate whose names are all
    compatible with the tokens; a candidate with the identical name wins over looser ones.
    candidates: {cluster id: set of token tuples}. Returns (cluster id | None, how)."""
    if not tokens:
        return None, "no_name"
    exact = sorted(c for c, forms in candidates.items() if tokens in forms)
    if len(exact) == 1:
        return exact[0], "identical_name"
    if len(exact) > 1:
        return None, "several_identical"
    loose = sorted(c for c, forms in candidates.items()
                   if all(names_compatible(tokens, f) for f in forms)
                   and any(len(f[0]) > 1 and len(tokens[0]) > 1 for f in forms))
    if len(loose) == 1:
        return loose[0], "compatible_name"
    return None, "several_compatible" if loose else "no_match"


# ---------------------------------------------------------------- the transform

def ref(m):
    return f"{m['file']}/{m['sheet']} row {m['row']}"


def validity_text(m):
    parts = []
    if m.get("validity"):
        parts.append(m["validity"])
    if m.get("extended"):
        parts.append(f"Extended Validity: {m['extended']}")
    if m.get("latest"):
        parts.append(f"Latest Membership Status: {m['latest']}")
    return " | ".join(parts) or None


def validity_cells(m):
    """(label, text) of every cell of a register row that can hold validity information."""
    return [(lab, m[k]) for lab, k in (("validity", "validity"), ("Extended Validity", "extended"),
                                       ("Remark", "remark"), ("Remark 2021", "remark2021"),
                                       ("Remark 2022", "remark2022"), ("Remark 2023", "remark2023"),
                                       ("Latest Membership Status", "latest")) if m.get(k)]


def run():
    utf8_stdout()
    st = Staging(DOMAIN)
    stats = Stats(st)
    R = st.review

    # ---- 1. read everything -------------------------------------------------------------
    mentions = []
    for f, s, kind, fy, _label in SHEETS:
        mentions += read_register(f, s, kind, fy, stats)
    reg_count = len(mentions)

    for cf, cs, of, os_ in COPIES:                       # value-identical carried-forward sheets
        a, b = raw_rows(cf, cs), raw_rows(of, os_)
        stats.read(cf, cs, len(a))
        same = len(a) == len(b) and all(x[0] == y[0] and _cells_equal(x[1], y[1]) for x, y in zip(a, b))
        if same:
            stats.skip(cf, cs, f"sheet is a value-identical copy of {of}/{os_}", len(a))
        else:
            diff = [x[0] for x, y in zip(a, b) if x[0] != y[0] or not _cells_equal(x[1], y[1])]
            stats.skip(cf, cs, f"copy of {of}/{os_} with differences (not imported, see review)", len(a))
            R("conflicting_sources", "Carried-forward sheet differs from the sheet it was copied from",
              {"copy": f"{cf}/{cs}", "original": f"{of}/{os_}", "rows_copy": len(a), "rows_original": len(b),
               "differing_rows": diff[:40]}, "low", suggested_action="Confirm the original is the one to keep.")
    a = raw_rows("F001", "Sheet2")
    stats.read("F001", "Sheet2", len(a))
    stats.skip("F001", "Sheet2", "4-column projection of F001/Active Member 2021-22 (no extra information)", len(a))
    for s in ("Sheet2", "Sheet3"):
        if not raw_rows("F021", s):
            stats.by_sheet[f"F021/{s}"]["rows_read"] += 0

    # F005 name + e-mail extract
    for n, cells in raw_rows("F005", "(csv)"):
        stats.read("F005", "(csv)")
        if n == 1:
            stats.skip("F005", "(csv)", "header row")
            continue
        m = blank_mention("F005", "(csv)", n, "mail", clean_text(cells.get("A")), RANK[("F004", "BDays & Anniverasaries")])
        m["emails"] = emails_in(cells.get("B"))
        m["fy"] = "2024-25"
        mentions.append(m)

    # F198 application form
    apps = []
    for n, cells in raw_rows("F198", "Sheet1"):
        stats.read("F198", "Sheet1")
        if n == 1:
            stats.skip("F198", "Sheet1", "header row")
            continue
        if not clean_text(cells.get("C")):
            stats.skip("F198", "Sheet1", "no applicant name")
            continue
        m = blank_mention("F198", "Sheet1", n, "application", clean_text(cells.get("C")))
        m["phones"], m["emails"], m["cells"] = norm_phones(cells.get("D")), emails_in(cells.get("G")), cells
        mentions.append(m)
        apps.append(m)

    pre = read_pretrust(stats)
    mentions += pre

    # fee ledger and trustee list (names only)
    ledger = []
    for n, cells in raw_rows("F003", "Member Details"):
        stats.read("F003", "Member Details")
        nm = cells.get("C")
        if n <= 3 or not isinstance(nm, str) or not name_tokens(nm) or cells.get("B") is None:
            stats.skip("F003", "Member Details", "title / header / total row")
            continue
        ledger.append({"row": n, "name": clean_text(nm), "tokens": name_tokens(nm), "cells": cells})
    trustees = []
    for n, cells in raw_rows("F003", "Trustee Details"):
        stats.read("F003", "Trustee Details")
        if n <= 3 or cells.get("B") is None or not name_tokens(cells.get("C")):
            stats.skip("F003", "Trustee Details", "header / total row")
            continue
        trustees.append({"row": n, "name": clean_text(cells["C"]), "tokens": name_tokens(cells["C"]), "cells": cells})

    # ---- 2. people -------------------------------------------------------------------------
    cid = cluster_mentions(mentions)
    for m, c in zip(mentions, cid):
        m["cid"] = c
    by_cluster = defaultdict(list)
    for m in mentions:
        by_cluster[m["cid"]].append(m)
    member_clusters = {c: ms for c, ms in by_cluster.items() if any(x["numparts"] for x in ms)}

    def reg_rows(ms):
        return [x for x in ms if x["numparts"]]

    def first_number(ms):
        rows = reg_rows(ms)
        first_seen = {}
        for x in rows:
            first_seen[x["number"]] = min(first_seen.get(x["number"], 999), x["rank"])
        return min(first_seen, key=lambda k: number_order(k, first_seen[k]))

    def latest(ms, field, kinds=None):
        best = None
        for x in sorted(ms, key=lambda x: (x["rank"], x["row"])):
            if kinds and x["kind"] not in kinds:
                continue
            v = x.get(field)
            if v:
                best = (v, x)
        return best

    people = {}
    for c, ms in by_cluster.items():
        is_member = c in member_clusters
        rows = [x for x in ms if x["kind"] in ("master", "disc", "aux", "contact", "due", "idcard", "agm")]
        base = rows if is_member else ms
        canon = max((x for x in base if x.get("name")), key=lambda x: (x["kind"] in ("master", "disc"), x["rank"], -x["row"])
                    if is_member else (x["rank"], -x["row"]))
        if is_member:
            canon = max((x for x in rows if x["name"]),
                        key=lambda x: (x["kind"] in ("master", "disc"), x["rank"], -x["row"]))
        name = canon["name"]
        if is_member:
            hint = f"member:{first_number(ms)}:{name_key(name)}"
        else:
            first = min(ms, key=lambda x: (x["file"], x["sheet"], x["row"]))
            tag = {"pretrust": "pretrust", "application": "applicant", "mail": "mailing"}.get(first["kind"], "other")
            hint = f"{tag}:{first.get('number') or first['file'] + '-row' + str(first['row'])}:{name_key(first['name'])}"
        phones = []
        for x in sorted(base, key=lambda x: (-x["rank"], x["row"])):
            for p in x.get("phones") or []:
                if p not in phones:
                    phones.append(p)
        em = latest(base, "emails")
        pan = None
        for x in sorted(base, key=lambda x: (-x["rank"], x["row"])):
            if x.get("pan") and x.get("pan_ok"):
                pan = x["pan"]
                break
        dobs = defaultdict(list)
        for x in base:
            if x.get("dob"):
                dobs[x["dob"]].append(x)
        good = {d: xs for d, xs in dobs.items() if plausible_dob(d)}
        dob = None
        if good:
            dob = max(good, key=lambda d: (max(x["rank"] for x in good[d]), len(good[d]), d.isoformat()))
        ann = None
        for x in sorted(base, key=lambda x: (-x["rank"], x["row"])):
            if x.get("ann") and (dob is None or x["ann"].year >= dob.year + 15):
                ann = x["ann"]
                break
        addr = latest(base, "address")
        area = latest(base, "area", kinds=("master", "disc", "aux"))
        blood = latest(base, "blood")
        people[c] = {
            "name": name, "phone": phones[0] if phones else None, "phone_alt": phones[1] if len(phones) > 1 else None,
            "email": em[0][0] if em else None, "pan": pan, "aadhaar": None,
            "address": addr[0] if addr else None, "city": area[0] if area else None,
            "pincode": pincode_in(addr[0]) if addr else None, "dob": dob, "anniversary": ann,
            "blood_group": blood[0] if blood else None, "role": "member", "hint": hint,
            "_phones": phones, "_dobs": dobs, "_good_dobs": good, "_is_member": is_member, "_canon": canon,
        }

    def person(c, name=None, role=None):
        p = {k: v for k, v in people[c].items() if not k.startswith("_")}
        if name:
            p["name"] = name
        if role:
            p["role"] = role
        return p

    # ---- 3. memberships ---------------------------------------------------------------------
    cand_forms = {c: {x["tokens"] for x in reg_rows(ms)} for c, ms in member_clusters.items()}
    seen_link = {}
    for row in ledger + trustees:
        row["cid"], row["link"] = link_by_name(row["tokens"], cand_forms)
        c = row["cid"]
        if c is None:
            continue
        g = honorific_gender(row["name"])
        others_g = {honorific_gender(x["name"]) for x in member_clusters[c]} - {None}
        if g and others_g and g not in others_g:
            row["cid"], row["link"] = None, "honorific_differs_from_the_register (e.g. 'Mrs.' + husband's name)"
            continue
        if row in ledger:
            sig = (c, tuple(isinstance(row["cells"].get(k), (int, float)) for k in ("F", "G")), row["cells"].get("F"))
            if sig in seen_link:
                row["cid"], row["link"] = None, f"same name and fee as ledger row {seen_link[sig]}"
            else:
                seen_link[sig] = row["row"]

    def fee_evidence(c):
        """{tier: [(date, text ref)]} of first-payment dates in the fee ledger for a person."""
        out = defaultdict(list)
        amount_tier = {500: "silver", 1000: "silver", 1750: "gold", 2250: "gold", 2500: "gold", 5000: "platinum"}
        for row in ledger:
            if row["cid"] != c:
                continue
            for amt_col, txt_col in (("F", "D"), ("G", "E")):
                amt = row["cells"].get(amt_col)
                if isinstance(amt, (int, float)) and amt in amount_tier:
                    ds = [d for d, note, _ in payment_dates(row["cells"].get(txt_col)) if d and note == "text"]
                    if ds:
                        out[amount_tier[amt]].append((ds[0], f"F003/Member Details row {row['row']} column {txt_col}"))
        for row in trustees:
            if row["cid"] == c:
                ds = [d for d, note, _ in payment_dates(row["cells"].get("D")) if d and note == "text"]
                if ds:
                    out["platinum"].append((ds[0], f"F003/Trustee Details row {row['row']} (trustee contribution)"))
        return out

    memberships = {}          # (cid, tier, period index) -> info
    by_num = {}               # (cid, number) -> membership
    for c, ms in member_clusters.items():
        serials = defaultdict(list)
        for x in reg_rows(ms):
            serials[(PREFIX_TIER[x["numparts"][0]], x["numparts"][2])].append(x)
        for tier in sorted({t for t, _s in serials}):
            groups = [(min(x["rank"] for x in rws), max(x["rank"] for x in rws), rws)
                      for (t, _s), rws in sorted(serials.items()) if t == tier]
            for i, period in enumerate(split_tier_periods(groups, MASTER_RANKS)):
                rows = sorted((x for g in period for x in g), key=lambda x: (x["rank"], x["row"]))
                M = {"cid": c, "ptier": tier, "rows": rows}
                memberships[(c, tier, i)] = M
                for x in rows:
                    by_num[(c, x["number"])] = M

    def mem_tier(c, tier):
        """The person's earliest membership of a tier (fees and contributions are from 2018-2022)."""
        own = [M for (c2, t2, _i), M in memberships.items() if c2 == c and t2 == tier]
        return min(own, key=lambda M: M["order"]) if own else None

    year_only, review_needed = [], set()
    for (c, ptier, _i), M in sorted(memberships.items(), key=lambda kv: (people[kv[0][0]]["hint"], kv[0][1], kv[0][2])):
        rows = M["rows"]
        regrows = [x for x in rows if x["kind"] in ("master", "disc", "aux")] or rows
        last = max(regrows, key=lambda x: (x["rank"], -x["row"]))
        first_no = min({x["number"] for x in rows},
                       key=lambda k: number_order(k, min(x["rank"] for x in rows if x["number"] == k)))
        key = f"mem:{ptier}:{first_no.replace('/', '-')}:{slug(name_key(people[c]['name']))}"
        M.update(key=key, last=last, first_no=first_no, first_rank=min(x["rank"] for x in rows),
                 order=(parse_number(first_no)[1], min(x["rank"] for x in rows), TIER_ORDER[ptier]),
                 current=any((x["file"], x["sheet"]) == CURRENT for x in rows))
    assert len({M["key"] for M in memberships.values()}) == len(memberships), "membership keys collide"

    emitted = Counter()
    for (c, ptier, _i), M in sorted(memberships.items(), key=lambda kv: kv[1]["key"]):
        rows, last, key = M["rows"], M["last"], M["key"]
        notes, flags = [], []
        in_current = [x for x in rows if (x["file"], x["sheet"]) == CURRENT]
        disc_rows = [x for x in rows if x["kind"] == "disc"]
        others = [m2 for (c2, t2, _i2), m2 in memberships.items() if c2 == c and t2 != ptier]
        same_tier = [m2 for (c2, t2, _i2), m2 in memberships.items() if c2 == c and t2 == ptier and m2 is not M]
        if same_tier:
            notes.append("The same person has another " + ptier + " membership period: "
                         + ", ".join(m2["first_no"] for m2 in same_tier) + ".")

        # tier
        written = last.get("tier")
        wt, known = norm_tier(written)
        tier = ptier
        if written and not known:
            tier = "other"
            R("trustee_decision", "Tier written in the register is not Silver, Gold or Platinum",
              {"sheet": f"{last['file']}/{last['sheet']}", "row": last["row"], "tier_as_written": written,
               "number": last["number"], "period_as_written": last.get("period")}, "high",
              suggested_action="Decide whether this is a real tier with its own fee and validity; imported as tier 'other'.",
              table="memberships", key=key)
            flags.append("tier")
        elif wt and wt != ptier:
            R("conflicting_sources", "Membership number prefix does not match the tier written on the row",
              {"sheet": f"{last['file']}/{last['sheet']}", "row": last["row"], "number": last["number"],
               "tier_as_written": written, "period_as_written": last.get("period"),
               "validity_as_written": validity_text(last), "imported_as": ptier}, "high",
              suggested_action="Confirm the member's actual tier; imported with the tier of the number series.",
              table="memberships", key=key)
            flags.append("tier")
            notes.append(f"Tier written on the row: '{written}' (period '{last.get('period')}'); number series says {ptier}.")
        elif not written:
            notes.append("Tier cell is blank in the latest register row; tier taken from the number series.")
            flags.append("tier-blank")
        if last.get("shift"):
            notes.append(f"Latest row had shifted columns ({last['shift']} shift) and was re-aligned on import.")

        # status
        reason, disc_on = None, None
        if in_current:
            status = "active"
        elif last["kind"] == "disc":
            status = "discontinued"
        elif any(m2["order"] > M["order"] or m2["current"] for m2 in others):
            status = "converted"
        elif any((x.get("ms_status") or "").upper() == "INACTIVE" or REASON_RE.search(x.get("remark") or "")
                 for x in rows if x["rank"] == last["rank"]):
            status = "discontinued"
        elif any((x.get("ms_status") or "").upper() == "CONVERT" for x in rows):
            status = "converted"
            flags.append("convert-no-target")
            R("trustee_decision", "Row marked CONVERT but no later membership of that person was found",
              {"rows": [ref(x) for x in rows if (x.get("ms_status") or "").upper() == "CONVERT"],
               "number": last["number"]}, "medium",
              suggested_action="Identify the membership this one was converted into.", table="memberships", key=key)
        else:
            status = "lapsed"
        if status == "discontinued":
            texts = []
            for x in ([last] if last["kind"] == "disc" else [x for x in rows if x["rank"] == last["rank"]]):
                for lab, t in validity_cells(x):
                    if REASON_RE.search(t) and t not in texts:
                        texts.append(t)
            reason = "; ".join(texts) or None
        if status in ("lapsed", "discontinued"):
            flags.append("history-only")
        if status == "converted" and others:
            later = [m2 for m2 in others if m2["order"] > M["order"]]
            cur = [m2 for m2 in others if m2["current"]]
            tgt = cur[0] if cur else min(later, key=lambda m2: m2["order"])
            notes.append(f"Converted: the same person " + ("later holds" if later else "is currently listed with")
                         + f" {tgt['ptier']} number {tgt['first_no']}.")
            if TIER_ORDER[tgt["ptier"]] < TIER_ORDER[ptier]:
                flags.append("downgrade")
                R("trustee_decision", "Member moved to a lower tier",
                  {"from": {"tier": ptier, "rows": [ref(x) for x in rows][-4:]},
                   "to": {"tier": tgt["ptier"], "number": tgt["first_no"]}}, "medium",
                  suggested_action="Confirm the member's actual tier and whether the earlier membership simply expired.",
                  table="memberships", key=key)

        # numbers
        numbers = []
        cur_no = (in_current[-1] if in_current else last)["number"]
        for no in sorted({x["number"] for x in rows}, key=lambda k: (min(x["rank"] for x in rows if x["number"] == k), k)):
            fys = sorted(x["fy"] for x in rows if x["number"] == no and x["fy"])
            first_fy = fys[0]
            f1 = [x for x in rows if x["number"] == no and x["file"] == "F001"]
            if f1:                                       # the 2020-22 cumulative register: use the stated period
                starts = [parse_validity(x.get("validity"))["start"] for x in f1]
                starts = [d for d in starts if d]
                if starts:
                    first_fy = min(first_fy, fy_of(min(starts)))
            numbers.append({"number_as_written": no, "first_seen_fy": first_fy, "last_seen_fy": fys[-1],
                            "is_current": no == cur_no})
        serials = {parse_number(n["number_as_written"])[2] for n in numbers}
        if len(numbers) > 1 and len(serials) == 1:
            notes.append("The year part of the number was rewritten over time: " +
                         ", ".join(n["number_as_written"] for n in numbers) + ".")
        if len(serials) > 1:
            flags.append("two-serials")
            R("trustee_decision", "One person carries two different numbers in the same tier",
              {"tier": ptier, "numbers": [n["number_as_written"] for n in numbers],
               "rows": {n["number_as_written"]: [ref(x) for x in rows if x["number"] == n["number_as_written"]][:6]
                        for n in numbers}}, "low",
              suggested_action="Confirm this is one continuing membership (re-joined or renumbered); imported as one.",
              table="memberships", key=key)

        # dates
        starts, ends, labels, bad = [], [], [], []
        for x in rows:
            for lab, t in validity_cells(x):
                if lab == "Extended Validity" and (x.get("ms_status") or "").upper() == "CONVERT":
                    continue                              # describes the membership it was converted into
                pv = parse_validity(t)
                if pv["start"]:
                    starts.append((pv["start"], t, x))
                if pv["end"]:
                    ends.append((pv["end"], t, x, pv["month_only"]))
                if pv["label_year"]:
                    labels.append((pv["label_year"], t, x))
                for frag in pv["bad"]:
                    bad.append((frag, t, x, lab))
        for frag, t, x, lab in bad:
            R("ambiguous_date", "Validity text contains a date that cannot be read",
              {"sheet": f"{x['file']}/{x['sheet']}", "row": x["row"], "column": lab, "text": t, "fragment": frag},
              "medium" if x is last else "low",
              suggested_action="Give the intended date (for example 30 November for '31 Nov').",
              table="memberships", key=key)
        if any(x is last for _f, _t, x, _l in bad):
            flags.append("bad-validity-date")
        num_year = 2000 + parse_number(M["first_no"])[1]
        start = expiry = None
        rule = []
        fee = fee_evidence(c).get(ptier, []) if M is mem_tier(c, ptier) else []
        range_start = min(starts, key=lambda e: (e[0], e[2]["rank"])) if starts else None
        if range_start and range_start[0].year <= num_year:
            start = range_start[0]
            rule.append(f"start = first day of the earliest validity range written in the registers "
                        f"('{range_start[1]}', {ref(range_start[2])})")
        elif fee:
            d, where = min(fee)
            start = d
            rule.append(f"start = date the first fee was received per the fee ledger ({where})")
            flags.append("start-from-fee-date")
        else:
            lab = max(labels, key=lambda e: (e[2]["rank"], -e[0])) if labels else None   # most recent sheet's label
            num_years = {2000 + parse_number(x["number"])[1] for x in rows}
            if lab and lab[0] > int(lab[2]["fy"][:4]) + 1:
                flags.append("label-year-impossible")
                R("conflicting_sources", "'New Member Year' label is later than the register it is written in",
                  {"label": lab[1], "row": ref(lab[2]), "register_fy": lab[2]["fy"], "number": M["first_no"],
                   "used_year": num_year}, "low",
                  suggested_action="Confirm the joining year; the year of the number was used.",
                  table="memberships", key=key)
                lab = None
            elif lab and lab[0] > max(num_years):
                flags.append("label-year-after-number-year")
                R("conflicting_sources", "'New Member Year' label is later than the year in the membership number",
                  {"label": lab[1], "row": ref(lab[2]), "numbers": sorted({x["number"] for x in rows}),
                   "used_year": lab[0]}, "low",
                  suggested_action="Confirm the joining year; the year of the label was used.",
                  table="memberships", key=key)
            elif lab and lab[0] not in num_years:
                notes.append(f"Label '{lab[1]}' gives an earlier year than the number {M['first_no']}; the label was used.")
            if lab:
                start = date(lab[0], 1, 1)
                rule.append(f"start = 1 January {lab[0]}: only the YEAR is recorded ('{lab[1]}', {ref(lab[2])}); "
                            f"day and month are placeholders")
            else:
                start = date(num_year, 1, 1)
                rule.append(f"start = 1 January {num_year}: only the year part of the first number {M['first_no']} "
                            f"is known; day and month are placeholders")
            year_only.append((key, ref(last), rule[-1]))
            flags.append("start-year-only")
            if range_start:
                rule.append(f"(the earliest written range '{range_start[1]}' starts after the number's year "
                            f"and is taken to be a renewal)")
        if fee and start and "start-from-fee-date" not in flags and abs((min(fee)[0] - start).days) > 366:
            notes.append(f"Fee ledger shows a first payment on {min(fee)[0].isoformat()} ({min(fee)[1]}), "
                         f"more than a year from the derived start.")
            flags.append("fee-date-far")

        lifetime = ptier == "platinum" or (last.get("period") or "").lower().replace(" ", "") == "lifetime"
        due = [x for x in rows if x["kind"] == "due" and x.get("valid_until")]
        if ptier == "platinum":
            rule.append("expiry = none (Platinum is a lifetime membership)")
        else:
            last_ends = [e for e in ends if e[2] is last]
            reg_end = max(last_ends, key=lambda e: e[0]) if last_ends else None
            f131 = max(due, key=lambda x: x["rank"]) if due else None
            if f131 and f131["file"] == "F131":
                expiry = f131["valid_until"]
                rule.append(f"expiry = 'Membership Valid Untill' in the due-date calculator ({ref(f131)}"
                            + ("; the cell is a fill-down of the row above" if f131["valid_until_is_filldown"] else "") + ")")
                if reg_end and reg_end[0] != expiry:
                    flags.append("expiry-conflict")
                    R("conflicting_sources", "Due-date calculator and register give different expiry dates",
                      {"calculator": {"sheet": "F131/Silver Members", "row": f131["row"], "valid_until": expiry.isoformat()},
                       "register": {"sheet": f"{last['file']}/{last['sheet']}", "row": last["row"], "text": reg_end[1],
                                    "date": reg_end[0].isoformat()}}, "medium",
                      suggested_action="Confirm the expiry date; the calculator's date was imported.",
                      table="memberships", key=key)
                elif reg_end:
                    rule[-1] += f", agreeing with '{reg_end[1]}' in {ref(last)}"
            elif not in_current and ends:
                e = max(ends, key=lambda e: (e[0], e[2]["rank"]))
                expiry = e[0]
                rule.append(f"expiry = latest validity end found in any sheet for this membership ('{e[1]}', {ref(e[2])})"
                            + ("; month only, last day of the month used" if e[3] else ""))
            elif reg_end:
                expiry = reg_end[0]
                rule.append(f"expiry = latest validity end written on the most recent register row "
                            f"('{reg_end[1]}', {ref(last)})" + ("; month only, last day of the month used" if reg_end[3] else ""))
            elif ends:
                e = max(ends, key=lambda e: (e[2]["rank"], e[0]))
                expiry = e[0]
                rule.append(f"expiry = latest validity end found in an earlier sheet ('{e[1]}', {ref(e[2])}); "
                            f"the most recent row states none")
                flags.append("expiry-from-older-sheet")
            elif start and "start-year-only" not in flags and not lifetime:
                expiry = period_end(start, ptier)
                rule.append(f"expiry = start + {TIER_YEARS[ptier]} year(s) - 1 day ({ptier} validity); no end date is written")
                flags.append("expiry-computed")
            elif lifetime:
                rule.append("expiry = none (period written as 'Life Time')")
            else:
                rule.append("expiry = unknown (no validity end written and the start is known by year only)")
                flags.append("no-expiry")
                R("missing_date", "No expiry date can be derived for a Silver/Gold membership",
                  {"sheet": f"{last['file']}/{last['sheet']}", "row": last["row"], "tier": ptier,
                   "validity_as_written": validity_text(last), "period_as_written": last.get("period")}, "medium",
                  suggested_action="Give the validity end date.", table="memberships", key=key)
            all_max = max(ends, key=lambda e: e[0]) if ends else None
            if expiry and all_max and all_max[0] > expiry and all_max[2] is not last:
                flags.append("older-sheet-later-end")
                R("conflicting_sources", "An older sheet shows a later validity end than the latest one",
                  {"imported_expiry": expiry.isoformat(), "older": {"sheet": f"{all_max[2]['file']}/{all_max[2]['sheet']}",
                   "row": all_max[2]["row"], "text": all_max[1], "date": all_max[0].isoformat()},
                   "latest_row": ref(last)}, "low", suggested_action="Confirm which validity is right.",
                  table="memberships", key=key)
            if start and expiry and expiry < start:
                flags.append("expiry-before-start")
                R("conflicting_sources", "Derived expiry is earlier than the derived start",
                  {"start": start.isoformat(), "expiry": expiry.isoformat(), "rule": "; ".join(rule), "row": ref(last)},
                  "medium", suggested_action="Check the validity texts.", table="memberships", key=key)
        if status == "active" and expiry and expiry < REGISTER_SAVED:
            flags.append("active-but-expired")
            R("trustee_decision", "Listed as active but the written validity ended before the register was last saved",
              {"sheet": f"{last['file']}/{last['sheet']}", "row": last["row"], "expiry": expiry.isoformat(),
               "register_saved": REGISTER_SAVED.isoformat(), "validity_as_written": validity_text(last)}, "medium",
              suggested_action="Confirm whether the member renewed.", table="memberships", key=key)

        # discontinued / lapsed review
        if status == "discontinued":
            src_rows = [ref(x) for x in (disc_rows or rows)][-4:]
            if reason and SENSITIVE_RE.search(reason):
                R("trustee_decision", "Discontinued row carries a disciplinary or unclear remark",
                  {"rows": src_rows, "remark": reason, "ms_status_as_written": last.get("ms_status")}, "high",
                  suggested_action="Decide how this is recorded, the effective date, and who may see the remark.",
                  table="memberships", key=key)
            elif reason:
                R("trustee_decision", "Discontinued membership has a reason but no date",
                  {"rows": src_rows, "reason": reason, "ms_status_as_written": last.get("ms_status"),
                   "last_validity": validity_text(last)}, "low",
                  suggested_action="Give the date the membership ended.", table="memberships", key=key)
            else:
                R("trustee_decision", "Discontinued membership has no reason and no date",
                  {"rows": src_rows, "ms_status_as_written": last.get("ms_status"), "last_validity": validity_text(last),
                   "derived_expiry": expiry.isoformat() if expiry else None}, "medium",
                  suggested_action="Say why and when the membership ended (lapsed, resigned, deceased ...).",
                  table="memberships", key=key)
        if in_current and disc_rows and any(x["file"] == "F130" for x in disc_rows):
            flags.append("in-master-and-discontinued")
            R("conflicting_sources", "Number is in both the current master and the Discontinued sheet",
              {"number": last["number"], "master_row": ref(in_current[-1]),
               "discontinued_rows": [ref(x) for x in disc_rows if x["file"] == "F130"]}, "high",
              suggested_action="Confirm the member is active; imported as active.", table="memberships", key=key)
        if status == "lapsed":
            notes.append(f"Not in the current master or any Discontinued sheet; last seen in {ref(last)}.")

        # notes
        idc = [x for x in rows if x["kind"] == "idcard"]
        if idc:
            notes.append(f"ID card status (sheet 'ID Card Status', frozen August 2023): {idc[-1].get('idcard') or 'blank'}.")
        if any(x["kind"] == "agm" for x in rows):
            notes.append("On the 2024-25 AGM roll.")
        for lab, k in (("Mem_Period", "period"), ("Authorised By", "auth"), ("Location", "location")):
            if last.get(k):
                notes.append(f"{lab}: {last[k]}.")
        for lab, t in validity_cells(last):
            if lab not in ("validity", "Latest Membership Status", "Extended Validity"):
                notes.append(f"{lab}: {t}.")
        intl = sorted({x["phone_raw"] for x in rows if x.get("phone_raw") and not x["phones"]
                       and re.search(r"\d{6}", x["phone_raw"])})
        if intl:
            notes.append("Contact number as written (not an Indian 10-digit mobile): " + ", ".join(intl) + ".")
        bad_pan = sorted({x["pan_raw"] for x in rows if x.get("pan") and not x["pan_ok"]})
        if bad_pan and not people[c]["pan"]:
            notes.append("PAN as written (not a valid PAN shape, not imported): " + ", ".join(bad_pan) + ".")
        extra_ph = people[c]["_phones"][2:]
        if extra_ph:
            notes.append("Other contact numbers seen in older sheets: " + ", ".join(extra_ph) + ".")
        extra_em = sorted({e for x in by_cluster[c] for e in (x.get("emails") or [])} - {people[c]["email"]})
        if extra_em:
            notes.append("Other e-mail addresses seen: " + ", ".join(extra_em) + ".")

        needs_review = bool(set(flags) - {"tier-blank"}) or "tier-blank" in flags
        if needs_review:
            review_needed.add(key)
        primary = in_current[-1] if in_current else last
        sources = [src(primary["file"], primary["sheet"], primary["row"])]
        sources += [src(x["file"], x["sheet"], x["row"], "enrichment") for x in rows if x is not primary]
        rec = {
            "person": person(c), "tier": tier, "tier_as_written": written, "start_date": start, "expiry_date": expiry,
            "dates_derived": True, "date_rule": "; ".join(rule), "validity_as_written": validity_text(primary),
            "status": status, "status_as_written": primary.get("ms_status"), "discontinued_on": disc_on,
            "discontinued_reason": reason, "notes": " ".join(notes) or None, "needs_review": needs_review,
            "numbers": numbers,
        }
        st.emit("memberships", key, rec, sources)
        M.update(status=status, tier=tier, start=start, expiry=expiry, flags=flags)
        emitted["memberships"] += 1
        for x in rows:
            stats.used(x["file"], x["sheet"], "rows used in a membership")

    if year_only:
        R("missing_date", "Join date known by year only: 1 January used as a placeholder",
          {"memberships": len(year_only), "examples": [{"key": k, "row": r} for k, r, _ in year_only[:15]],
           "rule": "start_date = 1 January of 'New Member Year 20xx' (or of the number's year part); needs_review is set on each"},
          "medium", suggested_action="Decide the policy: keep 1 January, use 1 July, or collect the real joining dates.")

    # ---- 4. number anomalies -------------------------------------------------------------------
    by_no, by_serial = defaultdict(set), defaultdict(set)
    for m in mentions[:reg_count]:
        if m["numparts"]:
            by_no[m["number"]].add(m["cid"])
            by_serial[(m["numparts"][0], m["numparts"][2])].add(m["cid"])
    for no, cs in sorted(by_no.items()):
        if len(cs) > 1:
            holders = []
            same_sheet = Counter()
            for c in sorted(cs, key=lambda c: people[c]["hint"]):
                rws = [x for x in member_clusters[c] if x["number"] == no]
                for x in rws:
                    same_sheet[(x["file"], x["sheet"])] += 0
                holders.append({"membership": by_num[(c, no)]["key"],
                                "rows": [ref(x) for x in rws][:8]})
            sheets = Counter((x["file"], x["sheet"]) for c in cs for x in member_clusters[c] if x["number"] == no)
            both = sorted(f"{f}/{s}" for (f, s), n in sheets.items()
                          if len({x["cid"] for c in cs for x in member_clusters[c]
                                  if x["number"] == no and (x["file"], x["sheet"]) == (f, s)}) > 1)
            R("trustee_decision", "Old membership number carried by more than one person",
              {"number": no, "people": len(cs), "holders": holders, "sheets_listing_both_at_once": both},
              "high" if both else "medium",
              suggested_action="Confirm these are different people (they were kept separate) and who held the number when.")
    for (p, sno), cs in sorted(by_serial.items()):
        full = {x["number"] for c in cs for x in member_clusters[c] if x["numparts"] and (x["numparts"][0], x["numparts"][2]) == (p, sno)}
        if len(cs) > 1 and not any(len(by_no[n]) > 1 and by_no[n] == cs for n in full):
            R("trustee_decision", "Serial re-used under a different year for another person",
              {"series": p, "serial": sno, "numbers": sorted(full),
               "holders": [{"membership": mem_tier(c, PREFIX_TIER[p])["key"],
                            "rows": [ref(x) for x in member_clusters[c] if x["numparts"] and (x["numparts"][0], x["numparts"][2]) == (p, sno)][:8]}
                           for c in sorted(cs, key=lambda c: people[c]["hint"])]}, "medium",
              suggested_action="Confirm these are different people; they were kept separate.")

    # ---- 5. snapshots ---------------------------------------------------------------------------
    label = {(f, s): (fy, lab) for f, s, kind, fy, lab in SHEETS if kind == "master"}
    for m in mentions[:reg_count]:
        if m["kind"] != "master":
            continue
        if not m["numparts"]:
            stats.skip(m["file"], m["sheet"], "row without a readable membership number")
            R("conflicting_sources", "Register row without a readable membership number",
              {"sheet": f"{m['file']}/{m['sheet']}", "row": m["row"], "number_as_written": m["number"]}, "medium")
            continue
        fy, lab = label[(m["file"], m["sheet"])]
        ptier = PREFIX_TIER[m["numparts"][0]]
        st.emit("membership_snapshots", f"mem:snap:{m['file']}:{slug(m['sheet'])}:{m['row']}", {
            "person": person(m["cid"], name=m["name"]), "membership_key": by_num[(m["cid"], m["number"])]["key"],
            "fy": fy, "snapshot_label": lab, "tier": norm_tier(m.get("tier"))[0], "number_as_written": m["number"],
            "name_as_written": m["name"], "status_as_written": m.get("ms_status"),
            "validity_as_written": validity_text(m)}, [src(m["file"], m["sheet"], m["row"])])
        stats.used(m["file"], m["sheet"], "snapshot rows emitted")
    for m in pre:
        st.emit("membership_snapshots", f"mem:snap:F010:{slug(m['sheet'])}:{m['row']}", {
            "person": person(m["cid"], name=m["name"]), "fy": m["fy"], "snapshot_label": "Pre-trust family group",
            "number_as_written": m["number"], "name_as_written": m["name"]}, [src("F010", m["sheet"], m["row"])])
        stats.used("F010", m["sheet"], "snapshot rows emitted")
    for m in mentions[:reg_count]:
        if m["kind"] != "master" and not m["numparts"]:
            stats.skip(m["file"], m["sheet"], "row without a readable membership number")

    # footer counts of the current master
    cur_rows = [m for m in mentions[:reg_count] if (m["file"], m["sheet"]) == CURRENT]
    footers = {}
    for n, cells in raw_rows(*CURRENT):
        b = clean_text(cells.get("B")) if isinstance(cells.get("B"), str) else None
        if b and b.startswith("Number of Active"):
            footers[b] = {"row": n, "value": cells.get("A")}
    by_written = Counter(m.get("tier") or "(blank)" for m in cur_rows)
    total_footer = footers.get("Number of Active Trust Members", {}).get("value")
    if total_footer != len(cur_rows):
        R("total_mismatch", "Head-count footer of the current master does not match its rows",
          {"sheet": "F130/Master Members 26-27", "footers": footers, "rows_counted": len(cur_rows),
           "rows_by_tier_as_written": dict(by_written),
           "rows_by_number_series": dict(Counter(m["numparts"][0] for m in cur_rows if m["numparts"]))}, "medium",
          suggested_action="Confirm the active head-count; the footer figures are typed constants.")

    # column-shift report, per sheet
    shifted = defaultdict(list)
    for m in mentions[:reg_count]:
        if m["shift"]:
            shifted[(m["file"], m["sheet"], m["shift"])].append(m["row"])
    for (f, s, kind), rws in sorted(shifted.items()):
        R("conflicting_sources", "Rows with shifted columns were re-aligned on import",
          {"sheet": f"{f}/{s}", "rows": rws, "shift": "PAN sits in the Birth_Date column; later fields one column right"
           if kind == "pan" else "an Age value sits in the ANN_Date column; later fields one column right"}, "medium",
          suggested_action="Spot-check the re-aligned rows (birth date, tier, period, validity).")

    # ---- 6. people-level reviews --------------------------------------------------------------
    for c in sorted(member_clusters, key=lambda c: people[c]["hint"]):
        p = people[c]
        mkey = min(M["key"] for (c2, _t, _i), M in memberships.items() if c2 == c)
        if len(p["_good_dobs"]) > 1:
            R("conflicting_sources", "Different birth dates recorded for the same member",
              {"membership": mkey, "imported": p["dob"].isoformat(),
               "dates": {d.isoformat(): [ref(x) for x in xs][:6] for d, xs in sorted(p["_good_dobs"].items())}}, "low",
              suggested_action="Confirm the birth date; the one in the most recent sheet was imported.",
              table="memberships", key=mkey)
        elif p["_dobs"] and not p["_good_dobs"]:
            R("conflicting_sources", "Birth date has an impossible year (2018 or later) and was not imported",
              {"membership": mkey, "dates": {d.isoformat(): [ref(x) for x in xs][:6] for d, xs in sorted(p["_dobs"].items())}},
              "low", suggested_action="Give the year of birth.", table="memberships", key=mkey)
    ordered = sorted(member_clusters, key=lambda c: people[c]["hint"])
    for i, ca in enumerate(ordered):                      # look-alikes that were NOT merged
        for cb in ordered[i + 1:]:
            fa, fb = cand_forms[ca], cand_forms[cb]
            if not all(names_compatible(x, y) for x in fa for y in fb):
                continue
            if not (any(len(x[0]) > 1 for x in fa) and any(len(y[0]) > 1 for y in fb)):
                continue                                   # an initial-only first name proves nothing
            R("trustee_decision", "Possibly the same person under two numbers (kept separate)",
              {"a": {"memberships": sorted(M["key"] for (c2, _t, _i), M in memberships.items() if c2 == ca),
                     "rows": [ref(x) for x in reg_rows(member_clusters[ca])][:6]},
               "b": {"memberships": sorted(M["key"] for (c2, _t, _i), M in memberships.items() if c2 == cb),
                     "rows": [ref(x) for x in reg_rows(member_clusters[cb])][:6]},
               "why_not_merged": "names are compatible but no number, phone, e-mail, PAN or birth date is shared"},
              "medium", suggested_action="Say whether these are one person; if so the memberships are merged at review.")
    ph_use, em_use = defaultdict(set), defaultdict(set)
    for c in member_clusters:
        cur = [x for x in member_clusters[c] if x["kind"] in ("master", "disc")]
        if not cur:
            continue
        lastrow = max(cur, key=lambda x: x["rank"])
        for ph in lastrow["phones"]:
            ph_use[ph].add(c)
        for e in lastrow["emails"]:
            em_use[e].add(c)
    for what, use in (("phone number", ph_use), ("e-mail address", em_use)):
        for val, cs in sorted(use.items()):
            if len(cs) > 1:
                R("trustee_decision", f"One {what} is shared by several members",
                  {"members": len(cs), "value_ends_with": val[-4:] if what == "phone number" else val.split("@")[-1],
                   "rows": sorted(ref(max((x for x in member_clusters[c] if x["kind"] in ("master", "disc")),
                                          key=lambda x: x["rank"])) for c in cs)}, "low",
                  suggested_action="Household sharing is expected; decide whether each member needs a contact of their own.")
    dob_notes = defaultdict(list)
    for m in mentions:
        for fld in ("dob", "ann"):
            if m.get(f"{fld}_note") in ("ambiguous_dmy", "text_month_first", "unparsed", "serial_number"):
                dob_notes[(m["file"], m["sheet"], m[f"{fld}_note"])].append(
                    {"row": m["row"], "field": fld, "as_written": str(m.get(f"{fld}_raw"))})
    for (f, s, note), items in sorted(dob_notes.items()):
        R("ambiguous_date", "Birth / anniversary cells that are not real dates",
          {"sheet": f"{f}/{s}", "problem": note, "cells": items[:60], "count": len(items)}, "low",
          suggested_action="Unreadable cells were left empty; bare numbers were read as Excel date serials.")
    intl_rows = [ref(m) for m in cur_rows if m.get("phone_raw") and not m["phones"]]
    if intl_rows:
        R("trustee_decision", "Contact number is not an Indian 10-digit mobile",
          {"rows": intl_rows}, "low", suggested_action="The number is kept in the membership notes only.")
    bad_pan_rows = [ref(m) for m in cur_rows if m.get("pan") and not m["pan_ok"]]
    if bad_pan_rows:
        R("conflicting_sources", "PAN in the current master does not have a valid PAN shape", {"rows": bad_pan_rows}, "low",
          suggested_action="Not imported; give the correct PAN.")

    # ---- 7. enrichment-only sheets ----------------------------------------------------------------
    for m in mentions[reg_count:]:
        if m["kind"] == "mail":
            if m["cid"] in member_clusters:
                Ms = [M for (c2, _t, _i), M in memberships.items() if c2 == m["cid"]]
                tgt = max(Ms, key=lambda M: (M["status"] == "active", M["last"]["rank"]))
                st.add_source("memberships", tgt["key"], src("F005", "(csv)", m["row"], "enrichment"))
                stats.used("F005", "(csv)", "rows linked to a member (enrichment source)")
            else:
                stats.skip("F005", "(csv)", "name + e-mail not matched to a numbered member")
    for m in apps:
        cells = m["cells"]
        linked = sorted(M["key"] for (c2, _t, _i), M in memberships.items() if c2 == m["cid"])
        ts, tnote = parse_date(cells.get("A"))
        R("trustee_decision", "Membership application form answer (not imported as a membership)",
          {"sheet": "F198/Sheet1", "row": m["row"],
           "timestamp_as_written": str(cells.get("A")), "timestamp_note": tnote or "date cell (day/month may be swapped: the form exported month-first)",
           "membership_type_as_written": clean_text(cells.get("B")), "payment_mode": clean_text(cells.get("Q")),
           "payment_details": clean_text(cells.get("R")), "administration_charges": clean_text(cells.get("S")),
           "linked_memberships": linked}, "low",
          suggested_action="Use as supporting evidence for the linked membership; decide whether the form answers are kept.")
        stats.used("F198", "Sheet1", "rows sent to review (application, not a membership)")

    # ---- 8. trustees: officers and 2018 contributions ----------------------------------------------
    f007 = []
    for n, cells in raw_rows("F007", "Donations"):
        amt, _ = parse_amount(cells.get("F"))
        if isinstance(cells.get("B"), (int, float)) and amt is not None:
            ds = [d for d, _n, _f in payment_dates(cells.get("D")) if d]
            f007.append({"row": n, "tokens": name_tokens(cells.get("C")), "amount": amt, "date": ds[0] if ds else None})
    dup199 = {n: cells for n, cells in raw_rows("F199", "Trustees_Details")}
    stats.read("F199", "Trustees_Details", len(dup199))
    total = Decimal(0)
    for t in trustees:
        cells, n = t["cells"], t["row"]
        c = t["cid"]
        if c is not None:
            pers = person(c, name=t["name"], role="trustee")
        else:
            pers = {"name": t["name"], "role": "trustee", "hint": f"trustee:{name_key(t['name'])}"}
            R("trustee_decision", "Trustee name could not be linked to a single numbered member",
              {"sheet": "F003/Trustee Details", "row": n, "why": t["link"]}, "low",
              suggested_action="Confirm which member this trustee is.")
        okey = f"mem:officer:{slug(name_key(t['name']))}"
        srcs = [src("F003", "Trustee Details", n)]
        same199 = n in dup199 and _cells_equal(dup199[n], cells)
        if same199:
            srcs.append(src("F199", "Trustees_Details", n, "duplicate"))
        st.emit("trust_officers", okey, {"person": pers, "title_en": "Trustee", "title_mr": "विश्वस्त",
                                         "display_order": int(cells["B"])}, list(srcs))
        stats.used("F003", "Trustee Details", "trust_officers emitted")
        amt, anote = parse_amount(cells.get("F"))
        dts = payment_dates(cells.get("D"))
        d, dnote = (dts[0][0], dts[0][1]) if dts else (None, "unparsed")
        ikey = f"mem:inc:trustee-2018:{n}"
        dup = [x for x in f007 if x["amount"] == amt and x["date"] == d and names_compatible(x["tokens"], t["tokens"])]
        if dup:
            stats.skip("F003", "Trustee Details", "contribution already in F007/Donations (owned by the donations transform)")
            R("duplicate_transaction", "Trustee contribution is also listed in the donations workbook",
              {"sheet": "F003/Trustee Details", "row": n, "same_as": [f"F007/Donations row {x['row']}" for x in dup],
               "amount": str(amt), "date": d.isoformat() if d else None}, "low",
              suggested_action="No action: imported once, from F007.")
            continue
        flag = amt is None or d is None or dnote in ("ambiguous_dmy", "text_month_first", "unparsed") \
            or (anote or "").startswith(("unparsed", "rounded_from"))
        if amt is None:
            R("missing_amount", "Trustee contribution without a readable amount",
              {"sheet": "F003/Trustee Details", "row": n, "as_written": str(cells.get("F"))}, "high")
            stats.skip("F003", "Trustee Details", "no readable amount")
            continue
        if d is None or dnote in ("ambiguous_dmy", "text_month_first", "unparsed"):
            R("ambiguous_date", "Trustee contribution date is ambiguous or unreadable",
              {"sheet": "F003/Trustee Details", "row": n, "as_written": clean_text(cells.get("D")), "note": dnote},
              "medium", table="income_entries", key=ikey)
        notes = [f"Receipt No. as written: {clean_text(cells.get('E'))}."] if cells.get("E") else []
        if len(dts) > 1:
            notes.append("Payment note mentions a second date (bank deposit): " + dts[1][2] + ".")
        pmem = mem_tier(c, "platinum") if c is not None else None
        st.emit("income_entries", ikey, {
            "entry_date": d, "fy": fy_of(d), "cal_year": d.year if d else None, "cal_month": d.month if d else None,
            "amount": amt, "kind": "donation", "kind_as_written": "Trustee contribution (sheet 'Trustee Details', column 'Date of Contribution')",
            "person": pers, "payer_as_written": t["name"], "membership_key": pmem["key"] if pmem else None,
            "mode": norm_mode(cells.get("D")), "mode_as_written": clean_text(cells.get("D")),
            "payment_ref": payment_ref(cells.get("D")), "purpose_as_written": "Trustee Details",
            "notes": " ".join(notes) or None, "needs_review": bool(flag)}, list(srcs))
        stats.used("F003", "Trustee Details", "income_entries emitted")
        total += amt
    if dup199:
        nd = sum(1 for t in trustees if t["row"] in dup199 and _cells_equal(dup199[t["row"]], t["cells"]))
        stats.used("F199", "Trustees_Details", "rows merged as duplicate sources of F003/Trustee Details", nd)
        stats.skip("F199", "Trustees_Details", "header / total row", len(dup199) - nd)
    printed = [cells.get("F") for n, cells in raw_rows("F003", "Trustee Details") if clean_text(cells.get("D")) == "Total"]
    if printed and Decimal(str(printed[0])) != total:
        R("total_mismatch", "Trustee contributions imported do not add up to the sheet total",
          {"sheet": "F003/Trustee Details", "printed_total": str(printed[0]), "imported_total": str(total)}, "high")
    R("trustee_decision", "2018 trustee contributions: confirm how they are classified",
      {"sheet": "F003/Trustee Details", "rows": [t["row"] for t in trustees], "each": "7000", "total": str(total),
       "imported_as": "income_entries kind 'donation', no fund, no receipt record (receipt numbers 'M - 0nn' kept in notes)"},
      "medium", suggested_action="Say whether these are donations, corpus or membership contributions, and to which fund they belong.")
    R("trustee_decision", "Trustee terms are not recorded",
      {"sheet": "F003/Trustee Details", "trustees": len(trustees),
       "imported_as": "title 'Trustee', no from/to dates (an empty end date means 'currently serving')"},
      "medium", suggested_action="Give each trustee's start date and, where they left, the end date; add office titles if any.")

    # ---- 9. fee ledger: FY 2020-21 membership fees ---------------------------------------------------
    led199 = {n: cells for n, cells in raw_rows("F199", "Member_Details")}
    stats.read("F199", "Member_Details", len(led199))
    led003 = {n: cells for n, cells in raw_rows("F003", "Member Details")}
    diffs = []
    for n in sorted(set(led199) | set(led003)):
        a, b = led003.get(n, {}), led199.get(n, {})
        for col in sorted((set(a) | set(b)) - {"_f"}):
            if _comparable(a.get(col)) != _comparable(b.get(col)):
                diffs.append({"cell": f"{col}{n}", "F003": str(a.get(col)), "F199": str(b.get(col))})
    if diffs:
        R("conflicting_sources", "The older copy of the fee ledger differs from the one imported",
          {"imported": "F003/Member Details", "older_copy": "F199/Member_Details", "differing_cells": len(diffs),
           "cells": [{"cell": d["cell"]} if d["cell"][0] in "C" else d for d in diffs[:40]]}, "medium",
          suggested_action="Confirm F003 is the version to keep.")
    diff_rows = {int(re.sub(r"\D", "", d["cell"])) for d in diffs}
    fee_total, fee_count = Decimal(0), 0
    amount_tier = {Decimal(500): "silver", Decimal(1000): "silver", Decimal(2250): "gold", Decimal(5000): "platinum"}
    for row in ledger:
        cells, n = row["cells"], row["row"]
        raw_amt = cells.get("F")
        amt, anote = parse_amount(raw_amt) if not (isinstance(raw_amt, str) and clean_text(raw_amt).lower() in BLANKS) else (None, None)
        if n in led199 and n not in diff_rows:
            stats.used("F199", "Member_Details", "rows identical to F003/Member Details (duplicate source)")
        elif n in led199:
            stats.used("F199", "Member_Details", "rows differing from F003/Member Details (see review)")
        if amt is None:
            if anote == "unparsed":
                R("bad_amount", "Fee ledger amount for 2020-21 cannot be read",
                  {"sheet": "F003/Member Details", "row": n, "as_written": str(raw_amt)}, "medium")
                stats.skip("F003", "Member Details", "2020-21 amount unreadable (review)")
            elif isinstance(cells.get("G"), (int, float)):
                stats.skip("F003", "Member Details", "fee for 2021-22 only: owned by another transform (used as date evidence)")
            else:
                stats.skip("F003", "Member Details", "no fee amount in either year")
            continue
        c = row["cid"]
        ikey = f"mem:inc:fee-2020-21:{n}"
        if c is not None:
            pers = person(c, name=row["name"])
        else:
            pers = {"name": row["name"], "role": "member", "hint": f"feeledger:F003-row{n}:{name_key(row['name'])}"}
            R("trustee_decision", "Fee ledger name could not be linked to a single numbered member",
              {"sheet": "F003/Member Details", "row": n, "why": row["link"], "amount": str(amt)}, "low",
              suggested_action="Say which member paid this fee.", table="income_entries", key=ikey)
        dts = payment_dates(cells.get("D"))
        d, dnote = (dts[0][0], dts[0][1]) if dts else (None, None)
        flag = False
        if d is None:
            flag = True
            R("missing_date", "Fee ledger payment has no readable date",
              {"sheet": "F003/Member Details", "row": n, "as_written": clean_text(cells.get("D")), "amount": str(amt)},
              "medium", suggested_action="Give the date the fee was received.", table="income_entries", key=ikey)
        elif dnote in ("ambiguous_dmy", "text_month_first"):
            flag = True
            R("ambiguous_date", "Fee ledger date could be read day-first or month-first",
              {"sheet": "F003/Member Details", "row": n, "as_written": dts[0][2], "read_as": d.isoformat(),
               "note": dnote}, "low", suggested_action="Read day-first (Indian convention); confirm.",
              table="income_entries", key=ikey)
        if d is not None and fy_of(d) != "2020-21":
            flag = True
            R("date_outside_fy", "Fee recorded under 'Year 2020-21' was paid in another financial year",
              {"sheet": "F003/Member Details", "row": n, "payment_date": d.isoformat(), "date_fy": fy_of(d),
               "ledger_column": "Year 2020-21", "amount": str(amt)}, "low",
              suggested_action="Confirm the year this receipt belongs to; kept under 2020-21 as the ledger states.",
              table="income_entries", key=ikey)
        if (anote or "").startswith("rounded_from"):
            flag = True
            R("bad_amount", "Fee amount has more than two decimals", {"sheet": "F003/Member Details", "row": n,
              "note": anote}, "medium", table="income_entries", key=ikey)
        tier = amount_tier.get(amt)
        mem = mem_tier(c, tier) if c is not None and tier else None
        if mem is None and c is not None:
            own = [M for (c2, _t, _i), M in memberships.items() if c2 == c]
            if len(own) == 1:
                mem = own[0]
        notes = []
        g = cells.get("G")
        e_txt = clean_text(cells.get("E"))
        if e_txt and e_txt.lower() not in BLANKS:
            if isinstance(g, (int, float)):
                notes.append(f"Second 'Date of Contribution' cell (may refer to the 2021-22 fee of {g}): {e_txt}.")
            else:
                notes.append(f"Second 'Date of Contribution' cell: {e_txt}.")
        if cells.get("Q"):
            notes.append(f"Ledger note: {clean_text(cells.get('Q'))}.")
        mode_txt = clean_text(cells.get("D"))
        mode = norm_mode(mode_txt)
        if mode_txt and re.search(r"(?i)pcf group", mode_txt):
            mode = "other"
            notes.append("Paid by transfer from the pre-trust PCF Group account.")
        sources = [src("F003", "Member Details", n)]
        if n in led199 and n not in diff_rows:
            sources.append(src("F199", "Member_Details", n, "duplicate"))
        st.emit("income_entries", ikey, {
            "entry_date": d, "fy": "2020-21", "cal_year": d.year if d else None, "cal_month": d.month if d else None,
            "amount": amt, "kind": "membership_fee", "kind_as_written": "Membership fee, column 'Year 2020-21'",
            "person": pers, "payer_as_written": row["name"], "membership_key": mem["key"] if mem else None,
            "mode": mode, "mode_as_written": mode_txt if mode_txt and mode_txt.lower() not in BLANKS else None,
            "payment_ref": payment_ref(mode_txt), "purpose_as_written": "Year 2020-21",
            "notes": " ".join(notes) or None, "needs_review": flag}, sources)
        stats.used("F003", "Member Details", "income_entries emitted (FY 2020-21 fee)")
        fee_total += amt
        fee_count += 1
    stats.skip("F199", "Member_Details", "title / header / total / unused rows",
               len(led199) - sum(v for k, v in stats.by_sheet["F199/Member_Details"].items() if k.startswith("rows ") and k != "rows_read"))
    printed = [cells.get("F") for n, cells in led003.items() if clean_text(cells.get("D")) == "Total"]
    if printed and Decimal(str(printed[0])) != fee_total:
        R("total_mismatch", "Fees imported for 2020-21 do not add up to the ledger total",
          {"sheet": "F003/Member Details", "printed_total": str(printed[0]), "imported_total": str(fee_total),
           "entries": fee_count}, "high")

    # ---- 10. summary ------------------------------------------------------------------------------
    summary = st.close()
    report = {
        "sheets": {k: dict(v) for k, v in sorted(stats.by_sheet.items())},
        "memberships_by_tier_status": dict(Counter(f"{M['tier']}/{M['status']}" for M in memberships.values())),
        "start_dates": dict(Counter("year-only placeholder" if "start-year-only" in M["flags"] else
                                    "fee-ledger date" if "start-from-fee-date" in M["flags"] else "validity range"
                                    for M in memberships.values())),
        "expiry_dates": dict(Counter("lifetime (none)" if M["ptier"] == "platinum" else
                                     "unknown" if M["expiry"] is None else "derived" for M in memberships.values())),
        "needs_review": len(review_needed), "people_with_a_number": len(member_clusters),
        "pretrust_people": len({m["cid"] for m in pre}),
        "pretrust_people_also_members": len({m["cid"] for m in pre if m["cid"] in member_clusters}),
        "totals": {"trustee_contributions_2018-19": str(total), "membership_fees_2020-21": str(fee_total)},
        "reviews_by_kind": dict(Counter(r["kind"] for r in st.reviews.values())),
        "reviews_by_title": dict(Counter(r["title"] for r in st.reviews.values())),
    }
    with open(CLEAN_DIR / DOMAIN / "_report.json", "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in report.items() if k != "sheets"}, ensure_ascii=False, indent=1))
    return summary


if __name__ == "__main__":
    run()
