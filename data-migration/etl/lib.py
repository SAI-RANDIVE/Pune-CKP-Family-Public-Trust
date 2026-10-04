"""Shared ETL library: normalisers and the staging writer.

Every transform uses these so that dates, amounts, names and fingerprints are
produced by one documented rule each. Nothing here ever changes a figure
silently: a value that cannot be parsed comes back as None with a note, and the
caller sends it to the review queue.
"""
import hashlib
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DM = REPO / "data-migration"
STAGING = DM / "staging"
RAW_DIR = STAGING / "raw"
CLEAN_DIR = STAGING / "clean"
MAPPINGS = DM / "mappings"
REPORTS = DM / "reports"

DATE_PREFIX = "@date:"
DEV_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
TRUST_REGISTERED = date(2018, 5, 14)

MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3, "apr": 4, "april": 4,
    "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7, "aug": 8, "august": 8, "sep": 9, "sept": 9,
    "september": 9, "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
    "जानेवारी": 1, "फेब्रुवारी": 2, "मार्च": 3, "एप्रिल": 4, "मे": 5, "जून": 6, "जुलै": 7, "ऑगस्ट": 8,
    "सप्टेंबर": 9, "ऑक्टोबर": 10, "नोव्हेंबर": 11, "डिसेंबर": 12,
}

HONORIFICS = re.compile(
    r"^(?:(?:mr|mrs|ms|miss|shri|shree|sau|smt|kum|ku|dr|adv|prof|late|kai|ca|er|col|capt|maj)\.?\s+"
    r"|(?:श्री|श्रीमती|सौ|कु|डॉ|कै|प्रा)\.?\s*)+", re.I)


def utf8_stdout():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")


# ---------- text ----------

def clean_text(v):
    """NFC-normalise, trim, collapse whitespace. Returns None for empty."""
    if v is None:
        return None
    s = re.sub(r"\s+", " ", unicodedata.normalize("NFC", str(v))).strip()
    return s or None


def name_key(name):
    """Matching key for a person's name: lower-case, honorifics and punctuation removed."""
    s = clean_text(name)
    if not s:
        return None
    s = HONORIFICS.sub("", s.lower())
    s = re.sub(r"[.,()'\"`/\\-]+", " ", s)
    return re.sub(r"\s+", " ", s).strip() or None


def is_devanagari(s):
    return bool(s and re.search(r"[ऀ-ॿ]", s))


# ---------- dates ----------

def _mk(y, m, d):
    try:
        return date(y, m, d)
    except ValueError:
        return None


def _year(y):
    return y + 2000 if y < 70 else y + 1900 if y < 100 else y


def parse_date(v):
    """Returns (date | None, note). Notes: None (a true Excel date), 'serial', 'text',
    'ambiguous_dmy' (text date where day and month could be swapped; read day-first), 'unparsed'."""
    if v is None or v == "":
        return None, None
    if isinstance(v, datetime):
        return v.date(), None
    if isinstance(v, date):
        return v, None
    if isinstance(v, bool):
        return None, "unparsed"
    if isinstance(v, (int, float)):
        if 30000 <= v <= 60000:                      # Excel serial for 1982..2064
            return (datetime(1899, 12, 30) + timedelta(days=int(v))).date(), "serial"
        return None, "unparsed"
    s = clean_text(v)
    if not s:
        return None, None
    s = s.translate(DEV_DIGITS)
    m = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?", s)
    if m:
        d = _mk(int(m[1]), int(m[2]), int(m[3]))
        return (d, "text") if d else (None, "unparsed")
    m = re.fullmatch(r"(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{2,4})", s)
    if m:
        a, b, y = int(m[1]), int(m[2]), _year(int(m[3]))
        d = _mk(y, b, a)                              # Indian convention: day first
        if d:
            return d, ("ambiguous_dmy" if a <= 12 and b <= 12 and a != b else "text")
        d = _mk(y, a, b)                              # only valid month-first
        return (d, "text_month_first") if d else (None, "unparsed")
    m = re.fullmatch(r"(\d{1,2})(?:st|nd|rd|th)?[\s\-/.,]*([^\d\s\-/.,]+)[\s\-/.,']*(\d{2,4})", s, re.I)
    if m and m[2].lower() in MONTHS:
        d = _mk(_year(int(m[3])), MONTHS[m[2].lower()], int(m[1]))
        return (d, "text") if d else (None, "unparsed")
    m = re.fullmatch(r"([^\d\s\-/.,]+)[\s\-/.,]*(\d{1,2})(?:st|nd|rd|th)?[\s,]+(\d{4})", s, re.I)
    if m and m[1].lower() in MONTHS:
        d = _mk(int(m[3]), MONTHS[m[1].lower()], int(m[2]))
        return (d, "text") if d else (None, "unparsed")
    return None, "unparsed"


def fy_of(d):
    """Indian financial year label for a date: 2025-04-01 .. 2026-03-31 -> '2025-26'."""
    if d is None:
        return None
    start = d.year if d.month >= 4 else d.year - 1
    return f"{start}-{(start + 1) % 100:02d}"


def date_flags(d, expected_fy=None):
    """Sanity flags for a parsed date."""
    flags = []
    if d is None:
        return flags
    if d > date.today():
        flags.append("future_date")
    if d < TRUST_REGISTERED:
        flags.append("before_trust_registration")
    if expected_fy and fy_of(d) != expected_fy:
        flags.append(f"outside_fy_{expected_fy}")
    return flags


# ---------- amounts ----------

def parse_amount(v):
    """Returns (Decimal | None, note). Accepts numbers and Indian-formatted text
    ('₹ 1,00,000/-', 'Rs. 500', '१,०००', '(250)'). Never guesses: anything else is
    (None, 'unparsed'). A value with more than 2 decimals is returned rounded
    half-up to paise WITH the note 'rounded_from:<original>' so it can be reported."""
    if v is None or v == "":
        return None, None
    if isinstance(v, bool):
        return None, "unparsed"
    note = None
    if isinstance(v, (int, float, Decimal)):
        dec = Decimal(repr(v)) if isinstance(v, float) else Decimal(v)
    else:
        s = clean_text(v)
        if not s:
            return None, None
        s = s.translate(DEV_DIGITS)
        neg = s.startswith("(") and s.endswith(")") or s.startswith("-")
        core = re.sub(r"(?i)rs\.?|inr|₹|/-|\s", "", s).strip("()-=")
        if not re.fullmatch(r"\d{1,3}(,\d{2,3})*(\.\d+)?|\d+(\.\d+)?", core):
            return None, "unparsed"
        try:
            dec = Decimal(core.replace(",", ""))
        except InvalidOperation:
            return None, "unparsed"
        if neg:
            dec = -dec
        note = "text"
    q = dec.quantize(Decimal("0.01"))
    if abs(dec - q) > Decimal("0.000001"):
        note = f"rounded_from:{dec}"
    return q, note


def money(dec):
    return None if dec is None else f"{dec:.2f}"


# ---------- identifiers ----------

def norm_phones(v):
    """All 10-digit Indian mobile numbers in a cell, in order. Excel floats are handled."""
    if v is None:
        return []
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    out = []
    for chunk in re.split(r"[,/;&\n]| or |\s{2,}", str(v).translate(DEV_DIGITS)):
        digits = re.sub(r"\D", "", chunk)
        if len(digits) == 12 and digits.startswith("91"):
            digits = digits[2:]
        elif len(digits) == 11 and digits.startswith("0"):
            digits = digits[1:]
        if len(digits) == 10 and digits[0] in "6789" and digits not in out:
            out.append(digits)
    return out


def norm_pan(v):
    """Returns (pan | None, is_valid). 'N/A', '-', blanks give (None, True)."""
    s = clean_text(v)
    if not s or re.fullmatch(r"(?i)n\.?/?a\.?|nil|none|-+|not available", s):
        return None, True
    s = re.sub(r"\s", "", s).upper()
    return s, bool(re.fullmatch(r"[A-Z]{5}\d{4}[A-Z]", s))


def norm_aadhaar(v):
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    digits = re.sub(r"\D", "", str(v))
    return digits if len(digits) == 12 else None


def norm_email(v):
    s = clean_text(v)
    if not s:
        return None
    s = s.lower().strip(" ,;")
    return s if re.fullmatch(r"[^@\s]+@[^@\s]+\.[a-z]{2,}", s) else None


MODE_RULES = [
    ("cash", r"\bcash\b|रोख"),
    ("cheque", r"\bch(e)?q(ue)?\b|\bchq\b|धनादेश"),
    ("upi", r"\bupi\b|g\s?pay|google\s?pay|phone\s?pe|paytm|\bbhim\b|\bqr\b"),
    ("neft", r"\bneft\b|\brtgs\b|\bimps\b|bank transfer|\btransfer\b|\bnet\s?banking\b"),
    ("online", r"\bonline\b|razorpay|gateway|\bcard\b"),
]


def norm_mode(v):
    s = clean_text(v)
    if not s:
        return None
    low = s.lower()
    for mode, pat in MODE_RULES:
        if re.search(pat, low):
            return mode
    return "other"


def fingerprint(*parts):
    return hashlib.sha1("|".join("" if p is None else str(p) for p in parts).encode("utf-8")).hexdigest()


# ---------- raw rows and staging ----------

_inventory = None


def inventory():
    """file_id -> inventory row (path, sha256, ...)."""
    global _inventory
    if _inventory is None:
        import csv
        with open(REPORTS / "00_inventory.csv", encoding="utf-8-sig") as f:
            _inventory = {r["file_id"]: r for r in csv.DictReader(f)}
    return _inventory


def _decode(v):
    if isinstance(v, str) and v.startswith(DATE_PREFIX):
        return datetime.fromisoformat(v[len(DATE_PREFIX):])
    return v


def col_letter(n):
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def raw_sheets(file_id):
    """Sheet names of an extracted workbook, in workbook order."""
    seen = []
    with open(RAW_DIR / f"{file_id}.jsonl", encoding="utf-8") as f:
        for line in f:
            s = json.loads(line)["sheet"]
            if s not in seen:
                seen.append(s)
    return seen


def raw_rows(file_id, sheet):
    """[(row_number, {col_letter: value})] for one sheet, exactly as extracted.
    Dates come back as datetime; everything else is the original cell value.
    Empty rows are not present. Formula text, where known, is under key '_f'."""
    out = []
    with open(RAW_DIR / f"{file_id}.jsonl", encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            if r["sheet"] == sheet:
                cells = {k: _decode(v) for k, v in r["cells"].items()}
                if r.get("f"):
                    cells["_f"] = r["f"]
                out.append((r["row"], cells))
    return out


def src(file_id, sheet, row, role="primary"):
    return {"file": file_id, "sheet": sheet, "row": row, "role": role}


class Staging:
    """Collects clean records for one domain and writes them as JSONL.

    emit(table, key, record, sources):
      key      stable natural key, unique within the table across ALL domains
               (prefix it with the domain, e.g. 'don:2024-25:PCFPT:412:1')
      record   dict of column values for that table. Dates as 'YYYY-MM-DD', money as
               '1234.50' strings (use money()). Cross-references use *_key / *_slug /
               *_code fields which the loader resolves (see data-migration/etl/CONTRACT.md).
      sources  list of src(file_id, sheet, row[, role]); at least one.
    """

    def __init__(self, domain):
        self.domain = domain
        self.records = defaultdict(dict)
        self.reviews = {}
        self.skipped = Counter()

    def emit(self, table, key, record, sources):
        if not sources:
            raise ValueError(f"{table} {key}: every record needs at least one source row")
        if key in self.records[table]:
            raise ValueError(f"duplicate key in {table}: {key}")
        rec = {k: (v.isoformat() if isinstance(v, (date, datetime)) else money(v) if isinstance(v, Decimal) else v)
               for k, v in record.items() if v is not None}
        rec["_key"] = key
        rec["_sources"] = sources
        self.records[table][key] = rec
        return key

    def has(self, table, key):
        return key in self.records[table]

    def add_source(self, table, key, source):
        self.records[table][key]["_sources"].append(source)

    def skip(self, reason, n=1):
        """Count a source row that was deliberately not imported, with the reason."""
        self.skipped[reason] += n

    def review(self, kind, title, evidence, severity="medium", confidence=None, suggested_action=None,
               table=None, key=None):
        fp = fingerprint(self.domain, kind, title, json.dumps(evidence, sort_keys=True, ensure_ascii=False, default=str))
        self.reviews[fp] = {"kind": kind, "severity": severity, "title": title, "evidence": evidence,
                            "confidence": confidence, "suggested_action": suggested_action,
                            "record_table": table, "record_key": key, "fingerprint": fp, "domain": self.domain}

    def close(self):
        out = CLEAN_DIR / self.domain
        out.mkdir(parents=True, exist_ok=True)
        for old in out.glob("*.jsonl"):
            old.unlink()
        for table, recs in self.records.items():
            with open(out / f"{table}.jsonl", "w", encoding="utf-8") as f:
                for rec in recs.values():
                    f.write(json.dumps(rec, ensure_ascii=False, default=str) + "\n")
        with open(out / "_review.jsonl", "w", encoding="utf-8") as f:
            for r in self.reviews.values():
                f.write(json.dumps(r, ensure_ascii=False, default=str) + "\n")
        with open(out / "_skipped.json", "w", encoding="utf-8") as f:
            json.dump(dict(self.skipped), f, ensure_ascii=False, indent=1)
        summary = {t: len(r) for t, r in self.records.items()}
        print(f"[{self.domain}] records: {summary}  review items: {len(self.reviews)}  skipped: {dict(self.skipped)}")
        return summary
