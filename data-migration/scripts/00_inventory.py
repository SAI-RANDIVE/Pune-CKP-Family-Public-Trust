"""Phase 0.1 - inventory every file in the source archive (read-only).

Writes reports/00_inventory.csv and reports/00_duplicates_exact.csv.
Usage: python data-migration/scripts/00_inventory.py [--dry-run]
"""
import argparse
import csv
import os
from collections import defaultdict
from datetime import datetime

from common import REPORTS, SOURCE_DIR, magic_type, rel, sha256_file, utf8_stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="print counts, write nothing")
    args = ap.parse_args()
    utf8_stdout()

    rows = []
    for dirpath, _dirs, files in os.walk(SOURCE_DIR):
        for name in sorted(files):
            p = os.path.join(dirpath, name)
            st = os.stat(p)
            r = rel(p)
            rows.append({
                "file_id": "",
                "path": r,
                "folder": r.rsplit("/", 1)[0] if "/" in r else "(root)",
                "name": name,
                "ext": os.path.splitext(name)[1].lower(),
                "magic": magic_type(p),
                "size_bytes": st.st_size,
                "modified": datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds"),
                "sha256": sha256_file(p),
            })
    rows.sort(key=lambda r: r["path"].lower())
    for i, r in enumerate(rows, 1):
        r["file_id"] = f"F{i:03d}"

    by_hash = defaultdict(list)
    for r in rows:
        by_hash[r["sha256"]].append(r)
    groups = [g for g in by_hash.values() if len(g) > 1]
    for n, g in enumerate(groups, 1):
        for r in g:
            r["exact_dup_group"] = f"X{n:02d}"

    by_ext = defaultdict(int)
    for r in rows:
        by_ext[r["ext"]] += 1
    print(f"files: {len(rows)}  bytes: {sum(r['size_bytes'] for r in rows)}")
    print("by ext:", dict(sorted(by_ext.items(), key=lambda kv: -kv[1])))
    print(f"exact-duplicate groups: {len(groups)}  redundant copies: {sum(len(g) - 1 for g in groups)}")
    mism = [r["path"] for r in rows if (r["ext"] in (".xlsx", ".xlsm") and r["magic"] != "zip")
            or (r["ext"] == ".xls" and r["magic"] != "ole2")]
    print(f"extension/content mismatches: {len(mism)}", mism)

    if args.dry_run:
        print("dry-run: nothing written")
        return
    REPORTS.mkdir(parents=True, exist_ok=True)
    cols = ["file_id", "path", "folder", "name", "ext", "magic", "size_bytes", "modified", "sha256", "exact_dup_group"]
    with open(REPORTS / "00_inventory.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    with open(REPORTS / "00_duplicates_exact.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["group", "file_id", "path", "size_bytes", "modified", "sha256"])
        for g in groups:
            for r in sorted(g, key=lambda r: r["modified"]):
                w.writerow([r["exact_dup_group"], r["file_id"], r["path"], r["size_bytes"], r["modified"], r["sha256"]])
    print("wrote 00_inventory.csv, 00_duplicates_exact.csv")


if __name__ == "__main__":
    main()
