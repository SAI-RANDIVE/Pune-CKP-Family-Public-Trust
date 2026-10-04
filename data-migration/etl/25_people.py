"""Stage 3c PERSON RESOLUTION - turn every person mention into one identity.

Reads the `person` objects inside staging/clean/<domain>/*.jsonl and writes
staging/clean/_people/: people.jsonl, mention_map.jsonl, merge_candidates.jsonl,
plus reports/02_people_merges.csv (every automatic merge, with the rule that fired).

Automatic merges happen ONLY on these documented rules, strongest first:
  R1 same `hint`            (a transform already established the identity)
  R2 same valid PAN         (not for organisations sharing a PAN-less row)
  R3 same Aadhaar
  R4 same name key AND a shared phone or e-mail
  R5 same name key (at least two words), with no conflicting PAN / Aadhaar /
     date of birth and no differing member hints
Everything weaker (similar names, a shared phone under different names) becomes a
merge CANDIDATE for a trustee to decide; it is never merged here.

Usage: python data-migration/etl/25_people.py [--dry-run]
"""
import argparse
import csv
import json
import os
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(__file__))
from lib import (CLEAN_DIR, REPORTS, clean_text, fingerprint, is_devanagari, name_key, norm_aadhaar,  # noqa: E402
                 norm_email, norm_pan, norm_phones, utf8_stdout)

ROLE_RANK = {"member": 0, "trustee": 1, "donor": 2, "beneficiary": 3, "vendor": 4}
FUZZY_THRESHOLD = 92


class DSU:
    def __init__(self, n):
        self.p = list(range(n))

    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[max(ra, rb)] = min(ra, rb)
            return True
        return False


def load_mentions():
    mentions = []
    for path in sorted(CLEAN_DIR.glob("*/*.jsonl")):
        if path.parent.name.startswith("_") or path.name.startswith("_"):
            continue
        table = path.stem
        with open(path, encoding="utf-8") as f:
            for line in f:
                rec = json.loads(line)
                p = rec.get("person")
                if not isinstance(p, dict) or not clean_text(p.get("name")):
                    continue
                pan, pan_ok = norm_pan(p.get("pan"))
                phones = norm_phones(p.get("phone")) + norm_phones(p.get("phone_alt"))
                mentions.append({
                    "table": table, "key": rec["_key"], "domain": path.parent.name,
                    "name": clean_text(p["name"]), "nk": name_key(p["name"]),
                    "phones": list(dict.fromkeys(phones)), "email": norm_email(p.get("email")),
                    "pan": pan if pan_ok else None, "pan_raw": pan, "aadhaar": norm_aadhaar(p.get("aadhaar")),
                    "hint": clean_text(p.get("hint")), "role": p.get("role") or "donor",
                    "is_org": bool(p.get("is_org")), "dob": p.get("dob"), "raw": p,
                })
    return mentions


def member_hint(m):
    return m["hint"] if m["hint"] and m["hint"].startswith("member:") else None


def resolve(mentions):
    dsu = DSU(len(mentions))
    merges = []

    def group_union(index, rule):
        for value, ids in index.items():
            for other in ids[1:]:
                if dsu.union(ids[0], other):
                    merges.append((rule, value, ids[0], other))

    by = lambda fn: _index(mentions, fn)  # noqa: E731
    group_union(by(lambda m: m["hint"]), "R1 same hint")
    group_union(by(lambda m: None if m["is_org"] else m["pan"]), "R2 same PAN")
    group_union(by(lambda m: m["aadhaar"]), "R3 same Aadhaar")
    r4 = defaultdict(list)
    for i, m in enumerate(mentions):
        for contact in m["phones"] + ([m["email"]] if m["email"] else []):
            if m["nk"]:
                r4[(m["nk"], contact)].append(i)
    group_union(r4, "R4 same name + phone/email")

    # R5: identical multi-word name, provided nothing contradicts it.
    for nk, ids in by(lambda m: m["nk"] if m["nk"] and len(m["nk"].split()) >= 2 else None).items():
        clusters = defaultdict(list)
        for i in ids:
            clusters[dsu.find(i)].append(i)
        roots = sorted(clusters)
        for a in roots:
            for b in roots:
                if a < b and dsu.find(a) != dsu.find(b):
                    ga = [mentions[i] for i, _ in enumerate(mentions) if dsu.find(i) == dsu.find(a)]
                    gb = [mentions[i] for i, _ in enumerate(mentions) if dsu.find(i) == dsu.find(b)]
                    if not _conflict(ga, gb):
                        dsu.union(a, b)
                        merges.append(("R5 same full name, nothing conflicting", nk, a, b))
    return dsu, merges


def _index(mentions, fn):
    idx = defaultdict(list)
    for i, m in enumerate(mentions):
        v = fn(m)
        if v:
            idx[v].append(i)
    return idx


def _vals(group, field):
    return {m[field] for m in group if m[field]}


def _conflict(ga, gb):
    for field in ("pan", "aadhaar", "dob"):
        va, vb = _vals(ga, field), _vals(gb, field)
        if va and vb and not (va & vb):
            return True
    ha, hb = {member_hint(m) for m in ga} - {None}, {member_hint(m) for m in gb} - {None}
    return bool(ha and hb and not (ha & hb))


def build_people(mentions, dsu):
    groups = defaultdict(list)
    for i, m in enumerate(mentions):
        groups[dsu.find(i)].append(m)
    people, mention_map, issues = [], [], []
    for group in groups.values():
        group.sort(key=lambda m: (ROLE_RANK.get(m["role"], 9), m["domain"], m["key"]))
        hints = sorted(h for h in _vals(group, "hint"))
        pans = sorted(_vals(group, "pan"))
        nks = Counter(m["nk"] for m in group if m["nk"])
        phones = list(dict.fromkeys(p for m in group for p in m["phones"]))
        anchor = (hints[0] if hints else pans[0] if pans
                  else f"{nks.most_common(1)[0][0]}|{phones[0] if phones else ''}")
        key = "per:" + fingerprint(anchor)[:14]
        names = Counter(m["name"] for m in group)
        latin = [n for n, _ in names.most_common() if not is_devanagari(n)]
        deva = [n for n, _ in names.most_common() if is_devanagari(n)]

        def first(field):
            for m in group:
                v = clean_text(m["raw"].get(field))
                if v:
                    return v
            return None

        dobs = sorted(_vals(group, "dob"))
        person = {
            "_key": key, "name_en": latin[0] if latin else None, "name_mr": deva[0] if deva else None,
            "name_key": nks.most_common(1)[0][0] if nks else None,
            "phone": phones[0] if phones else None, "phone_alt": phones[1] if len(phones) > 1 else None,
            "email": next((m["email"] for m in group if m["email"]), None),
            "address": first("address"), "city": first("city"), "pincode": first("pincode"),
            "pan": pans[0] if pans else next((m["pan_raw"] for m in group if m["pan_raw"]), None),
            "aadhaar": next((m["aadhaar"] for m in group if m["aadhaar"]), None),
            "date_of_birth": dobs[0] if len(dobs) == 1 else (group[0]["dob"] or (dobs[0] if dobs else None)),
            "date_of_anniversary": first("anniversary"), "blood_group": first("blood_group"),
            "roles": sorted({m["role"] for m in group}, key=lambda r: ROLE_RANK.get(r, 9)),
            "is_org": any(m["is_org"] for m in group),
            "name_variants": sorted(names), "mentions": len(group),
        }
        problems = []
        if len(dobs) > 1:
            problems.append({"conflict": "date_of_birth", "values": dobs})
        if len(pans) > 1:
            problems.append({"conflict": "pan", "count": len(pans)})
        if len(phones) > 2:
            problems.append({"conflict": "more_than_two_phones", "count": len(phones)})
        if problems:
            person["needs_review"] = True
            issues.append({"person_key": key, "problems": problems,
                           "records": [f"{m['table']}:{m['key']}" for m in group][:12]})
        people.append({k: v for k, v in person.items() if v is not None})
        mention_map += [{"table": m["table"], "key": m["key"], "person_key": key} for m in group]
    return people, mention_map, issues


def candidates(people):
    from rapidfuzz import fuzz, process
    out, seen = [], set()
    named = [p for p in people if p.get("name_key")]
    keys = [p["name_key"] for p in named]
    for i, p in enumerate(named):
        for _, score, j in process.extract(p["name_key"], keys, scorer=fuzz.token_sort_ratio,
                                           score_cutoff=FUZZY_THRESHOLD, limit=6):
            if j <= i:
                continue
            q = named[j]
            pair = (p["_key"], q["_key"])
            if pair not in seen:
                seen.add(pair)
                out.append({"person_a": p["_key"], "person_b": q["_key"], "score": round(score, 2),
                            "evidence": {"rule": "similar name", "same_phone": bool(p.get("phone") and p.get("phone") == q.get("phone"))}})
    contact = defaultdict(list)
    for p in people:
        for c in (p.get("phone"), p.get("email")):
            if c:
                contact[c].append(p["_key"])
    for c, ks in contact.items():
        for a in ks:
            for b in ks:
                if a < b and (a, b) not in seen and (b, a) not in seen:
                    seen.add((a, b))
                    out.append({"person_a": a, "person_b": b, "score": 80.0,
                                "evidence": {"rule": "shared phone or e-mail, different name"}})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    utf8_stdout()
    mentions = load_mentions()
    dsu, merges = resolve(mentions)
    people, mention_map, issues = build_people(mentions, dsu)
    cands = candidates(people)
    print(f"mentions: {len(mentions)}  people: {len(people)}  automatic merges: {len(merges)}")
    print("merges by rule:", dict(Counter(m[0] for m in merges)))
    print("people by role:", dict(Counter(r for p in people for r in p["roles"])))
    print(f"merge candidates for review: {len(cands)}  people with conflicting details: {len(issues)}")
    if args.dry_run:
        print("dry-run: nothing written")
        return
    out = CLEAN_DIR / "_people"
    out.mkdir(parents=True, exist_ok=True)
    for name, rows in (("people", people), ("mention_map", mention_map), ("merge_candidates", cands),
                       ("conflicts", issues)):
        with open(out / f"{name}.jsonl", "w", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
    with open(REPORTS / "02_people_merges.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["rule", "matched_on", "record_a", "record_b"])
        for rule, value, a, b in merges:
            shown = value if rule.startswith("R1") else "(identifier withheld)" if rule[:2] in ("R2", "R3") else str(value)
            w.writerow([rule, shown, f"{mentions[a]['table']}:{mentions[a]['key']}",
                        f"{mentions[b]['table']}:{mentions[b]['key']}"])
    print(f"wrote {out} and reports/02_people_merges.csv")


if __name__ == "__main__":
    main()
