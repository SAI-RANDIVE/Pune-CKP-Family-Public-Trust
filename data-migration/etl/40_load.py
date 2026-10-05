"""Stage 5 LOAD - put the staged records into Postgres.

One transaction, one import batch. Idempotent: every record's id and fingerprint
are derived from its staging key, so re-running inserts only what is new and
never duplicates. The new uniform trust IDs are issued here, in date order, and
only for records that are not already in the database.

Usage:
  python data-migration/etl/40_load.py --dry-run          do everything, then roll back
  python data-migration/etl/40_load.py                    load
  python data-migration/etl/40_load.py --rollback <batch-id>   remove one batch cleanly

DATABASE_URL is read from .env.local and is never printed.
"""
import argparse
import csv
import json
import os
import re
import sys
import uuid
from collections import Counter, defaultdict

import psycopg
from psycopg.types.json import Jsonb

sys.path.insert(0, os.path.dirname(__file__))
from lib import CLEAN_DIR, MAPPINGS, RAW_DIR, REPO, REPORTS, fingerprint, inventory, utf8_stdout  # noqa: E402

NS = uuid.UUID("6f1d2c1e-8167-4c18-9b14-052018000000")
SCRIPT_VERSION = "etl-1"
MONEY_RE = re.compile(r"^-?\d+\.\d{2}$")
MONEY_COLS = {"amount", "cash_amount", "bank_amount", "principal", "maturity_amount", "debit", "credit", "balance"}

KIND_CODE = {"donation": "DON", "membership_fee": "MFE", "sponsorship": "SPN", "advertisement": "ADV",
             "event_fee": "EVF", "csr_grant": "CSR", "book_sale": "BKS", "interest": "INT",
             "refund_received": "RFD", "loan_received": "LNR", "other": "INC"}
TIER_CODE = {"silver": "SLV", "gold": "GLD", "platinum": "PLT", "other": "OTH"}


def fy_part(r):
    return r.get("fy") or "UNDATED"


# table -> (date field used to order code issue, function giving (series, min_width) or None)
TABLES = [
    ("people", None, lambda r: ("PCFPT/PER", 5)),
    ("memberships", "start_date", lambda r: (f"{TIER_CODE.get(r.get('tier'), 'OTH')}/MEM", 4)),
    ("membership_snapshots", None, None),
    ("trust_officers", None, None),
    ("receipts", "receipt_date", lambda r: (f"PCFPT/RCP/{fy_part(r)}", 4)),
    ("fixed_deposits", "start_date", lambda r: ("PCFPT/FD", 4)),
    ("investments", None, lambda r: ("PCFPT/INV", 2)),
    ("income_entries", "entry_date", lambda r: (f"PCFPT/{KIND_CODE.get(r.get('kind'), 'INC')}/{fy_part(r)}", 4)),
    ("expenses", "entry_date", lambda r: (f"PCFPT/EXP/{fy_part(r)}", 4)),
    ("transfers", "entry_date", lambda r: (f"PCFPT/TRF/{fy_part(r)}", 4)),
    ("bank_transactions", None, None),
    ("fd_events", None, None),
    ("investment_transactions", None, None),
    ("scheme_applications", "applied_on", lambda r: (f"PCFPT/APP/{fy_part(r)}", 4)),
    ("scheme_disbursements", "disbursed_on", lambda r: (f"PCFPT/DSB/{fy_part(r)}", 4)),
    ("scheme_repayments", None, None),
    ("budgets", None, None),
    ("budget_lines", None, None),
    ("annual_statements", None, None),
    ("annual_statement_lines", None, None),
    ("event_account_lines", None, None),
]

# staging field -> (db column, referenced table)   resolved through staged keys
KEY_REFS = {
    "membership_key": ("membership_id", "memberships"), "receipt_key": ("receipt_id", "receipts"),
    "fixed_deposit_key": ("fixed_deposit_id", "fixed_deposits"), "renewed_from_key": ("renewed_from_id", "fixed_deposits"),
    "investment_key": ("investment_id", "investments"), "statement_key": ("statement_id", "annual_statements"),
    "budget_key": ("budget_id", "budgets"), "disbursement_key": ("disbursement_id", "scheme_disbursements"),
    "expense_key": ("expense_id", "expenses"),
}
# staging field -> (db column, reference kind)   resolved through the mapping files
MAP_REFS = {
    "event_slug": ("event_id", "events"), "scheme_slug": ("scheme_id", "schemes"), "fund_code": ("fund_id", "funds"),
    "category_code": ("category_id", "categories"), "bank_slug": ("bank_account_id", "bank"),
    "from_bank_slug": ("from_account_id", "bank"), "to_bank_slug": ("to_account_id", "bank"),
}
PERSON_COL = {"expenses": "payee_person_id"}
DROP_FIELDS = {"_key", "_sources", "person", "numbers", "name_variants", "mentions", "is_org"}


def rid(table, key):
    return uuid.uuid5(NS, fingerprint(table, key))


def database_url():
    for line in open(REPO / ".env.local", encoding="utf-8"):
        if line.strip().startswith("DATABASE_URL"):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("DATABASE_URL not found in .env.local")


def read_csv(name):
    path = MAPPINGS / name
    if not path.exists():
        return []
    with open(path, encoding="utf-8-sig") as f:
        return [{k: (v or "").strip() for k, v in r.items() if k} for r in csv.DictReader(f)]


def read_staged():
    staged = defaultdict(dict)
    for path in sorted(CLEAN_DIR.glob("*/*.jsonl")):
        if path.name.startswith("_"):
            continue
        if path.parent.name == "_people" and path.stem != "people":
            continue
        with open(path, encoding="utf-8") as f:
            for line in f:
                rec = json.loads(line)
                rec["_domain"] = path.parent.name
                if rec["_key"] in staged[path.stem]:
                    raise SystemExit(f"key collision between domains in {path.stem}: {rec['_key']}")
                staged[path.stem][rec["_key"]] = rec
    return staged


def read_jsonl(path):
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


class Loader:
    def __init__(self, conn, dry_run):
        self.conn, self.cur, self.dry_run = conn, conn.cursor(), dry_run
        self.counts, self.problems = Counter(), []
        self.seq, self.seq_dirty = {}, set()
        self.ref = {}
        self.columns = {}

    # -- helpers --
    def cols(self, table):
        if table not in self.columns:
            self.cur.execute("select column_name from information_schema.columns where table_name = %s", (table,))
            self.columns[table] = {r[0] for r in self.cur.fetchall()}
        return self.columns[table]

    def next_code(self, series, width):
        if series not in self.seq:
            self.cur.execute("select last_seq from id_sequences where key = %s", (series,))
            row = self.cur.fetchone()
            self.seq[series] = row[0] if row else 0
        self.seq[series] += 1
        self.seq_dirty.add(series)
        return f"{series}/{self.seq[series]:0{width}d}"

    def insert(self, table, rows):
        """rows: list of dicts with identical handling; inserted with ON CONFLICT DO NOTHING."""
        if not rows:
            return
        by_cols = defaultdict(list)
        for r in rows:
            by_cols[tuple(sorted(r))].append(r)
        for cols, group in by_cols.items():
            sql = (f"insert into {table} ({', '.join(cols)}) values ({', '.join(['%s'] * len(cols))}) "
                   f"on conflict do nothing")
            self.cur.executemany(sql, [[r[c] for c in cols] for r in group])
        self.counts[f"{table}: inserted"] += len(rows)

    # -- steps --
    def start_batch(self, label):
        self.batch = uuid.uuid4()
        self.cur.execute("insert into import_batches (id, label, script_version, run_by) values (%s, %s, %s, %s)",
                         (self.batch, label, SCRIPT_VERSION, os.environ.get("USERNAME", "etl")))

    def load_sources(self):
        inv = inventory()
        dates = {r["file_id"]: r for r in csv.DictReader(open(REPORTS / "00_internal_dates.csv", encoding="utf-8-sig"))}
        roles = Counter()
        self.file_uuid = {}
        rows = []
        for fid, r in inv.items():
            self.file_uuid[fid] = uuid.uuid5(NS, "file:" + r["sha256"])
            saved = (dates.get(fid, {}).get("last_saved") or "").replace(" ", "T") or None
            rows.append({"id": self.file_uuid[fid], "file_code": fid, "path": r["path"], "name": r["name"],
                         "ext": r["ext"], "sha256": r["sha256"], "size_bytes": int(r["size_bytes"]),
                         "internal_saved_at": saved})
            roles[r["ext"]] += 1
        # byte-identical copies share a sha256: keep the first, point the others at it
        seen = {}
        for row in rows:
            seen.setdefault(row["sha256"], row["id"])
        for fid, r in inv.items():
            self.file_uuid[fid] = seen[r["sha256"]]
        self.insert("source_files", [r for r in rows if seen[r["sha256"]] == r["id"]])

        raw = []
        for path in sorted(RAW_DIR.glob("*.jsonl")):
            fid = path.stem
            if fid not in self.file_uuid:
                continue
            for r in read_jsonl(path):
                cells = dict(r["cells"])
                if r.get("f"):
                    cells["_f"] = r["f"]
                raw.append((self.batch, self.file_uuid[fid], r["sheet"], r["row"], Jsonb(cells),
                            fingerprint(json.dumps(r["cells"], sort_keys=True, ensure_ascii=False))))
        self.cur.executemany(
            "insert into raw_rows (import_batch_id, source_file_id, sheet_name, row_number, cells, fingerprint) "
            "values (%s, %s, %s, %s, %s, %s) on conflict (source_file_id, sheet_name, row_number) do nothing", raw)
        self.counts["raw_rows: staged"] = len(raw)
        self.cur.execute("select source_file_id, sheet_name, row_number, id from raw_rows")
        self.raw_id = {(str(a), b, c): d for a, b, c, d in self.cur.fetchall()}

    def raw_row(self, source):
        fid = self.file_uuid.get(source["file"])
        if fid is None:
            self.problems.append(f"source cites unknown file {source['file']}")
            return None
        k = (str(fid), str(source["sheet"]), int(source["row"]))
        if k not in self.raw_id:      # a cited row that was empty in the extract: keep the citation anyway
            self.cur.execute(
                "insert into raw_rows (import_batch_id, source_file_id, sheet_name, row_number, cells) "
                "values (%s, %s, %s, %s, %s) on conflict (source_file_id, sheet_name, row_number) "
                "do update set row_number = excluded.row_number returning id",
                (self.batch, fid, k[1], k[2], Jsonb({"_note": "cited row had no cell values in the extract"})))
            self.raw_id[k] = self.cur.fetchone()[0]
            self.counts["raw_rows: cited but empty"] += 1
        return self.raw_id[k]

    def load_reference(self):
        cur = self.cur
        for r in read_csv("funds.csv"):
            cur.execute("insert into funds (code, name_en, name_mr, is_restricted) values (%s, %s, %s, %s) "
                        "on conflict (code) do update set name_en = excluded.name_en, name_mr = excluded.name_mr",
                        (r["code"], r["name_en"], r["name_mr"] or None, r["is_restricted"].lower() == "true"))
        for r in read_csv("schemes.csv"):
            cur.execute("select 1 from schemes where slug = %s", (r["slug"],))
            if not cur.fetchone():
                cur.execute("insert into schemes (code, slug, name_en, name_mr, is_repayable, description) "
                            "values (%s, %s, %s, %s, %s, %s)",
                            (self.next_code("PCFPT/SCH", 2), r["slug"], r["name_en"], r["name_mr"] or None,
                             r["is_repayable"].lower() == "true", r.get("description") or None))
        events = read_csv("events.csv")
        for r in sorted(events, key=lambda r: (r.get("fy") or "9999", r.get("event_date") or "9999", r["slug"])):
            cur.execute("select 1 from events where slug = %s", (r["slug"],))
            if not cur.fetchone():
                cur.execute("insert into events (code, slug, series, name_en, name_mr, event_date, fy, notes) "
                            "values (%s, %s, %s, %s, %s, %s, %s, %s)",
                            (self.next_code(f"PCFPT/EVT/{r.get('fy') or 'GEN'}", 2), r["slug"], r.get("series") or None,
                             r["name_en"], r.get("name_mr") or None, r.get("event_date") or None,
                             r.get("fy") or None, r.get("kind") or None))
        for r in read_csv("bank_accounts.csv"):
            cur.execute("select 1 from bank_accounts where slug = %s", (r["slug"],))
            if not cur.fetchone():
                cur.execute("insert into bank_accounts (code, slug, bank, branch, number_masked, account_type, opened_on) "
                            "values (%s, %s, %s, %s, %s, %s, %s)",
                            (self.next_code("PCFPT/BNK", 2), r["slug"], r["bank"], r["branch"] or None,
                             r["number_masked"] or None, r["account_type"] or None, r["opened_on"] or None))
        for name, kind in (("expense_heads.csv", "expense"), ("income_purposes.csv", "income")):
            for r in read_csv(name):
                if r.get("category_code"):
                    cur.execute("insert into categories (code, kind, name_en, name_mr) values (%s, %s, %s, %s) "
                                "on conflict (code) do nothing",
                                (r["category_code"], kind, r.get("name_en") or r["category_code"], r.get("name_mr") or None))
        for kind, sql in (("events", "select slug, id from events"), ("schemes", "select slug, id from schemes"),
                          ("funds", "select code, id from funds"), ("bank", "select slug, id from bank_accounts"),
                          ("categories", "select code, id from categories")):
            cur.execute(sql)
            self.ref[kind] = dict(cur.fetchall())
        cur.execute("select label from fiscal_years")
        self.fys = {r[0] for r in cur.fetchall()}

    def load_records(self, staged):
        mention = {(m["table"], m["key"]): m["person_key"]
                   for m in read_jsonl(CLEAN_DIR / "_people" / "mention_map.jsonl")}
        sources, codes, extra_numbers, variants = [], [], [], []
        for table, date_field, coder in TABLES:
            recs = staged.get(table, {})
            if not recs:
                continue
            dbcols = self.cols(table)
            self.cur.execute(f"select content_fingerprint from {table} where content_fingerprint is not null")
            existing = {r[0] for r in self.cur.fetchall()}
            rows = []
            ordered = sorted(recs.values(), key=lambda r: (r.get(date_field) or "9999-99-99" if date_field else "", r["_key"]))
            for rec in ordered:
                fp = fingerprint(table, rec["_key"])
                self.counts[f"{table}: staged"] += 1
                if fp in existing:
                    self.counts[f"{table}: already loaded"] += 1
                    continue
                row = {"id": rid(table, rec["_key"]), "content_fingerprint": fp}
                if "import_batch_id" in dbcols:
                    row["import_batch_id"] = self.batch
                if "origin" in dbcols:
                    row["origin"] = "import"
                extra = {}
                for k, v in rec.items():
                    if k in DROP_FIELDS or k == "_domain" or v is None:
                        continue
                    if k in KEY_REFS:
                        col, target = KEY_REFS[k]
                        if v not in staged.get(target, {}):
                            self.problems.append(f"{table} {rec['_key']}: {k} -> {v} not staged")
                            continue
                        row[col] = rid(target, v)
                    elif k in MAP_REFS:
                        col, kind = MAP_REFS[k]
                        if v not in self.ref[kind]:
                            self.problems.append(f"{table} {rec['_key']}: {k} '{v}' is not in the mapping files")
                            continue
                        row[col] = self.ref[kind][v]
                    elif k not in dbcols:
                        # no typed column: keep the value verbatim rather than drop it
                        extra[k] = v
                        self.counts[f"{table}: kept in source_extra: {k}"] += 1
                    elif k in MONEY_COLS:
                        if not MONEY_RE.match(str(v)):
                            self.problems.append(f"{table} {rec['_key']}: {k}={v!r} is not a 2-decimal amount")
                        row[k] = v
                    elif k == "fy" and v not in self.fys:
                        self.problems.append(f"{table} {rec['_key']}: fy '{v}' unknown")
                    elif isinstance(v, (dict, list)) and k != "roles":
                        row[k] = Jsonb(v)
                    else:
                        row[k] = v
                if extra:
                    row["source_extra"] = Jsonb(extra)
                pkey = mention.get((table, rec["_key"]))
                if pkey:
                    row[PERSON_COL.get(table, "person_id")] = rid("people", pkey)
                elif isinstance(rec.get("person"), dict) and rec["person"].get("name"):
                    self.problems.append(f"{table} {rec['_key']}: person mention was not resolved (run 25_people.py)")
                if table == "people" and rec.get("is_org"):
                    row["roles"] = list(row.get("roles", [])) + ["organisation"]
                if coder:
                    series, width = coder(rec)
                    row["code"] = self.next_code(series, width)
                    codes.append({"code": row["code"], "kind": "system", "record_table": table, "record_id": row["id"]})
                rows.append(row)
                for s in rec.get("_sources") or []:
                    raw_id = self.raw_row(s)
                    if raw_id:
                        sources.append({"record_table": table, "record_id": row["id"], "raw_row_id": raw_id,
                                        "role": s.get("role", "primary")})
                for n in rec.get("numbers") or []:
                    extra_numbers.append({"membership_id": row["id"], **{k: v for k, v in n.items() if v is not None}})
                for n in rec.get("name_variants") or []:
                    variants.append({"person_id": row["id"], "name": n, "source": "import"})
            # self-references (renewed_from_id) need the parents in first: insert without, then update
            deferred = [(r["id"], r.pop("renewed_from_id")) for r in rows if "renewed_from_id" in r]
            self.insert(table, rows)
            for child, parent in deferred:
                self.cur.execute(f"update {table} set renewed_from_id = %s where id = %s", (parent, child))
        self.insert("membership_numbers", extra_numbers)
        self.insert("person_name_variants", variants)
        self.insert("entity_codes", codes)
        self.insert("record_sources", sources)

    def load_reviews(self, staged):
        rows = []
        for path in sorted(CLEAN_DIR.glob("*/_review.jsonl")):
            for r in read_jsonl(path):
                table, key = r.get("record_table"), r.get("record_key")
                rows.append({"import_batch_id": self.batch, "kind": r["kind"], "severity": r.get("severity") or "medium",
                             "title": r["title"][:300], "evidence": Jsonb({**(r.get("evidence") or {}), "domain": r.get("domain")}
                                                                          if isinstance(r.get("evidence"), dict)
                                                                          else {"evidence": r.get("evidence"), "domain": r.get("domain")}),
                             "confidence": r.get("confidence"), "suggested_action": r.get("suggested_action"),
                             "record_table": table,
                             "record_id": rid(table, key) if table and key and key in staged.get(table, {}) else None,
                             "fingerprint": r["fingerprint"]})
        for c in read_jsonl(CLEAN_DIR / "_people" / "conflicts.jsonl"):
            rows.append({"import_batch_id": self.batch, "kind": "conflicting_person_details", "severity": "medium",
                         "title": "One person has conflicting details across sheets", "evidence": Jsonb(c),
                         "record_table": "people", "record_id": rid("people", c["person_key"]),
                         "suggested_action": "Open the person and confirm the correct details",
                         "fingerprint": fingerprint("people-conflict", c["person_key"])})
        self.insert("import_review_queue", rows)
        cands = [{"id": uuid.uuid5(NS, "cand:" + c["person_a"] + c["person_b"]), "person_a": rid("people", c["person_a"]),
                  "person_b": rid("people", c["person_b"]), "score": c["score"], "evidence": Jsonb(c["evidence"])}
                 for c in read_jsonl(CLEAN_DIR / "_people" / "merge_candidates.jsonl")]
        self.insert("person_merge_candidates", cands)

    def finish(self):
        for series in self.seq_dirty:
            self.cur.execute("insert into id_sequences (key, last_seq) values (%s, %s) "
                             "on conflict (key) do update set last_seq = greatest(id_sequences.last_seq, excluded.last_seq)",
                             (series, self.seq[series]))
        self.cur.execute("update import_batches set status = 'loaded', finished_at = now(), counts = %s where id = %s",
                         (Jsonb(dict(self.counts)), self.batch))


def rollback_batch(conn, batch):
    cur = conn.cursor()
    cur.execute("select table_name from information_schema.columns where column_name = 'import_batch_id' "
                "and table_schema = 'public' and table_name <> 'import_batches'")
    tables = [r[0] for r in cur.fetchall()]
    order = [t for t, _, _ in reversed(TABLES) if t in tables] + [t for t in tables if t not in {x for x, _, _ in TABLES}]
    for t in order:
        if t == "raw_rows":
            continue
        cur.execute(f"select id from {t} where import_batch_id = %s", (batch,))
        ids = [r[0] for r in cur.fetchall()]
        if ids and t not in ("import_review_queue",):
            cur.execute("delete from entity_codes where record_table = %s and record_id = any(%s)", (t, ids))
            cur.execute("delete from record_sources where record_table = %s and record_id = any(%s)", (t, ids))
        cur.execute(f"delete from {t} where import_batch_id = %s", (batch,))
        print(f"  {t}: removed {cur.rowcount}")
    cur.execute("delete from raw_rows where import_batch_id = %s", (batch,))
    print(f"  raw_rows: removed {cur.rowcount}")
    cur.execute("update import_batches set status = 'rolled_back', finished_at = now() where id = %s", (batch,))
    conn.commit()
    print("Batch rolled back. Issued ID numbers are not re-used.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--rollback", metavar="BATCH_ID")
    ap.add_argument("--label", default="Archive import")
    args = ap.parse_args()
    utf8_stdout()
    with psycopg.connect(database_url(), autocommit=False) as conn:
        if args.rollback:
            return rollback_batch(conn, args.rollback)
        staged = read_staged()
        loader = Loader(conn, args.dry_run)
        loader.start_batch(args.label)
        loader.load_sources()
        loader.load_reference()
        loader.load_records(staged)
        loader.load_reviews(staged)
        loader.finish()
        for k in sorted(loader.counts):
            print(f"  {k}: {loader.counts[k]}")
        if loader.problems:
            uniq = Counter(loader.problems)
            print(f"\n{len(loader.problems)} PROBLEM(S) - nothing was loaded:")
            for p, n in list(uniq.items())[:60]:
                print(f"  - {p}" + (f"  (x{n})" if n > 1 else ""))
            conn.rollback()
            sys.exit(1)
        if args.dry_run:
            conn.rollback()
            print("\ndry-run: rolled back, database unchanged")
        else:
            conn.commit()
            print(f"\nLoaded as batch {loader.batch}")


if __name__ == "__main__":
    main()
