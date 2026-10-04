"""Shared helpers for the data-migration scripts.

The source archive is READ-ONLY: every script opens files in 'rb' mode only and
writes exclusively under data-migration/.
"""
import hashlib
import os
import re
import sys
import unicodedata
from datetime import date, datetime, time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SOURCE_DIR = Path(os.environ.get("TMS_SOURCE_DIR", REPO / "05. Trust - various xl sheets"))
OUT_DIR = REPO / "data-migration"
REPORTS = OUT_DIR / "reports"
LOGS = OUT_DIR / "logs"

SPREADSHEET_EXT = {".xlsx", ".xlsm", ".xls", ".csv"}

DEVANAGARI = re.compile(r"[ऀ-ॿ]")
LATIN = re.compile(r"[A-Za-z]")
DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")


def utf8_stdout():
    # Windows consoles default to cp1252, which cannot print Devanagari.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def sha256_file(path, chunk=1 << 20):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(chunk), b""):
            h.update(block)
    return h.hexdigest()


def rel(path):
    return str(Path(path).relative_to(SOURCE_DIR)).replace("\\", "/")


def nfc(s):
    return unicodedata.normalize("NFC", s)


def clean_text(v):
    """NFC-normalise, trim and collapse whitespace. Never alters digits."""
    return re.sub(r"\s+", " ", nfc(str(v))).strip()


def script_of(s):
    d, l = bool(DEVANAGARI.search(s)), bool(LATIN.search(s))
    return "mixed" if d and l else "devanagari" if d else "latin" if l else "other"


def cell_kind(v):
    if v is None or (isinstance(v, str) and not v.strip()):
        return "empty"
    if isinstance(v, bool):
        return "bool"
    if isinstance(v, (int, float)):
        return "number"
    if isinstance(v, (datetime, date, time)):
        return "date"
    s = v.strip().translate(DEVANAGARI_DIGITS)
    if re.fullmatch(r"[₹Rs. ]*-?\(?[\d,]+(\.\d+)?\)?/?-?", s):
        return "number_as_text"
    if re.fullmatch(r"\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}", s):
        return "date_as_text"
    return "text"


def jsonable(v):
    if v is None:
        return None
    if isinstance(v, (datetime, date, time)):
        return v.isoformat()
    if isinstance(v, float):
        return v if v == v else None  # NaN -> null
    if isinstance(v, (int, bool)):
        return v
    return clean_text(v)


def magic_type(path):
    """Real container type, independent of the (often wrong) extension."""
    with open(path, "rb") as f:
        head = f.read(8)
    if head.startswith(b"PK\x03\x04"):
        return "zip"   # xlsx / xlsm / docx / pptx
    if head.startswith(b"\xd0\xcf\x11\xe0"):
        return "ole2"  # xls / doc
    if head.startswith(b"%PDF"):
        return "pdf"
    return "other"
