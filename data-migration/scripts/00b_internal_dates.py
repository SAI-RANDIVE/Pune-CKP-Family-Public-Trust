"""Phase 0.2 helper - last-saved date/author stored INSIDE each workbook (read-only).

Filesystem mtimes are useless here (the whole archive was copied on one day),
so canonical-version choices use the document's own metadata instead.
Writes reports/00_internal_dates.csv.  Usage: python 00b_internal_dates.py [--dry-run]
"""
import argparse
import csv
import zipfile
import re

import olefile

from common import REPORTS, SOURCE_DIR, utf8_stdout


def openxml_meta(path):
    with zipfile.ZipFile(path) as z:
        if "docProps/core.xml" not in z.namelist():
            return {}
        x = z.read("docProps/core.xml").decode("utf-8", "replace")
    g = lambda tag: (re.search(rf"<{tag}[^>]*>([^<]*)</{tag}>", x) or [None, ""])[1]
    return {"created": g("dcterms:created"), "last_saved": g("dcterms:modified"),
            "last_saved_by": g("cp:lastModifiedBy")}


def ole_meta(path):
    with olefile.OleFileIO(str(path)) as o:
        m = o.get_metadata()
        dec = lambda b: b.decode("utf-8", "replace") if isinstance(b, bytes) else (b or "")
        return {"created": str(m.create_time or ""), "last_saved": str(m.last_saved_time or ""),
                "last_saved_by": dec(m.last_saved_by)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    utf8_stdout()
    out, fails = [], 0
    for r in csv.DictReader(open(REPORTS / "00_inventory.csv", encoding="utf-8-sig")):
        if r["magic"] not in ("zip", "ole2"):
            continue
        try:
            meta = openxml_meta(SOURCE_DIR / r["path"]) if r["magic"] == "zip" else ole_meta(SOURCE_DIR / r["path"])
        except Exception as e:
            meta, fails = {"error": f"{type(e).__name__}: {e}"[:120]}, fails + 1
        out.append({"file_id": r["file_id"], "path": r["path"], **meta})
    print(f"files with internal metadata: {len(out)}  unreadable: {fails}")
    print(f"with a last-saved date: {sum(1 for o in out if o.get('last_saved'))}")
    if args.dry_run:
        print("dry-run: nothing written")
        return
    with open(REPORTS / "00_internal_dates.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["file_id", "path", "created", "last_saved", "last_saved_by", "error"])
        w.writeheader()
        w.writerows(out)
    print("wrote 00_internal_dates.csv")


if __name__ == "__main__":
    main()
