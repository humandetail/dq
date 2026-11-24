#!/usr/bin/env python3
"""Audit continuous equipment resource regeneration against the shared 6.25 index."""

import argparse
from collections import Counter
from contextlib import closing
from fractions import Fraction
import json
import re
import sys
import time

sys.dont_write_bytecode = True
import audit_index as source

SHEET = "装备与道具"
RULES = source.ROOT / "docs/rules"
OUT = RULES / "item-regeneration-batch-01.json"
CODES = ("AIrm", "Aoar", "AHab")
DISPLAY = {
    "manaPercent": r"([0-9]+)\s*%\s*的?\s*魔法值?(?:恢复|回复)",
    "manaAuraPerSecond": r"([0-9]+)\s*点?\s*/秒的魔法(?:恢复|回复)",
    "lifePercentPerSecond": r"每秒(?:回复|恢复)\s*([0-9]+)\s*%\s*的?血量",
}


def described(text):
    values = {field: re.findall(pattern, text or "") for field, pattern in DISPLAY.items()}
    assert all(len(matches) <= 1 for matches in values.values()), text
    return {field: int(matches[0]) for field, matches in values.items() if matches}


def indexed_rows(db, table, columns):
    return db.execute(f"SELECT object_id,row_no-1,{columns} FROM object_row WHERE source=?",
                      (f"reference/map-6.25/{table}.json",))


def evidence(db):
    rows = {}
    for path in source.WORKBOOKS:
        rows[path] = {n: (json.loads(cells) + [None] * 8)[:8] for n, cells in db.execute(
            "SELECT row_no,cells FROM sheet_row WHERE source=? AND sheet=? ORDER BY row_no",
            (source.source_path(path), SHEET),
        )}
    original, repo = rows.values()
    assert original == repo
    abilities = {alias: {"jsonIndex": index, **json.loads(data)} for alias, index, data in db.execute("""
        SELECT object_id,row_no-1,fields FROM object_row
        WHERE source='reference/map-6.25/units_abilitydata.json'
          AND json_extract(fields,'$.code') IN ('AIrm','Aoar','AHab','Aspb','AIrg')
    """)}
    items = {item: (index, raw) for item, index, raw in indexed_rows(
        db, "units_itemdata", "json_extract(fields,'$.abilList')"
    )}
    mods = {item: json.loads(data) for item, _, data in indexed_rows(db, "war3map.w3t", "json_extract(fields,'$.mods')")}
    lifecycle = json.loads((RULES / "item-lifecycle.json").read_text())
    records, books = {}, {}
    active = []
    for n, (name, item, kind, *_, text) in repo.items():
        if n < 5 or not item:
            continue
        index, raw = items[item]
        item_delta = {mod["key"]: mod["value"] for mod in mods.get(item, [])}
        assert "iabi" not in item_delta
        tooltip = item_delta.get("utub")
        mounts = []
        for position, token in enumerate((raw or "").split(","), 1):
            alias = token.strip()
            fields = abilities.get(alias)
            if not fields:
                continue
            assert alias == token
            if fields["code"] == "Aspb":
                assert all(abilities.get(child, {}).get("code") not in CODES
                           for child in fields["DataA1"].split(","))
            elif fields["code"] == "AIrg":
                active.append((item, alias))
            else:
                mounts.append({"alias": alias, "position": position})
        shown = described(text)
        if not mounts and not shown:
            continue
        entry = {"id": item, "name": name, "workbookCell": f"{SHEET}!H{n}", "workbook": shown,
                 "objectJsonIndex": index, "objectAbilList": raw}
        if mounts:
            assert kind != "制作书"
            native = {}
            for mount in mounts:
                field = abilities[mount["alias"]]
                code, value, percent = field["code"], field["DataA1"], field.get("DataB1")
                if code == "AIrm":
                    key, selected = "manaPercent", int(round(100 * value))
                elif code == "AHab":
                    assert percent is None
                    key, selected = "manaAuraPerSecond", value
                elif percent == 1:
                    key, selected = "lifePercentPerSecond", int(round(100 * value))
                else:
                    assert mount["alias"] == "I250" and percent is None
                    key, selected = "lifeFlatPerSecond", value
                assert key not in native
                native[key] = selected
            web = native | shown
            observed_tooltip = described(tooltip) if tooltip is not None else None
            assert observed_tooltip in (None, shown), (item, observed_tooltip, shown)
            assert {k: v for k, v in native.items() if k != "lifeFlatPerSecond"} == shown, (item, native, shown)
            records[item] = {**entry, "mounts": mounts, "w3tTooltip": observed_tooltip, "objectContribution": native, "web": web}
        else:
            assert kind == "制作书", item
            books[item] = entry

    for item, book in books.items():
        recipes = [r for r in lifecycle["tables"]["recipes"] if item in r["materials"]]
        products = [r for r in recipes if r["result"] in records
                    and records[r["result"]]["name"] == book["name"].removeprefix("制作书-")]
        recipe, = products
        preview = records[recipe["result"]]["web"]
        assert preview == book["workbook"], (item, preview, book["workbook"])
        book.update(product=recipe["result"], recipeSourceLines=recipe["sourceLines"],
                    webFinishedItemPreview=preview, web={})

    counts = Counter(m["alias"] for row in records.values() for m in row["mounts"])
    aliases = {}
    alias_keys = ("jsonIndex", "code", "DataA1", "DataB1", "Area1", "BuffID1", "targs1", "checkDep", "levels")
    for alias in sorted(counts):
        fields = abilities[alias]
        assert fields["levels"] == 1 and not source.objects(db, alias, "war3map.w3a")
        rawcodes = [int.from_bytes(alias.encode(), direction) for direction in ("big", "little")]
        assert all(not source.references(db, literal) for literal in (alias, *rawcodes))
        aliases[alias] = {**{key: fields[key] for key in alias_keys if key in fields}, "occurrences": counts[alias]}
    for code in (*CODES, "Aspb"):
        assert not source.objects(db, code, "war3map.w3a", aliases=True)
    for buff in ("B021", "B092", "B096", "B166"):
        assert not source.references(db, buff)
    assert counts.total() == 26 and (len(aliases), len(records), len(books)) == (11, 24, 17)
    assert active == [("i326", "I248")]
    return {
        "baselineId": "item-regeneration-batch-01",
        "status": "bounded_source_audit_and_Q24_Web_selection",
        "dependencies": ["item-lifecycle-v1", "hero-attribute-interface-v1", "night-state-and-regeneration", "mana-auras"],
        "sheet": SHEET,
        "coverage": {"workbookItemRowsCompared": sum(n >= 5 and bool(row[1]) for n, row in repo.items()),
                     "aliases": len(aliases), "aliasesByCode": dict(Counter(r["code"] for r in aliases.values())),
                     "items": len(records), "mounts": counts.total(), "recipeBooks": len(books)},
        "aliases": aliases,
        "items": list(records.values()),
        "recipeBooks": list(books.values()),
        "sourceSupplement": {"item": "i147", "alias": "I250", "workbook": None, "webLifePerSecond": 10,
                             "rule": "Fixed default for the missing percent flag; the mounted named effect supplies a workbook omission."},
        "web": {
            "mana": "baseManaPerSecond * (1 + sum AIrm per held instance) + max B021 candidates + A018 + I230",
            "life": "baseLifePerSecond + max B096 fixed candidates + maxLife * (max B092 + max B166)",
            "settlement": "Use the old rate to the event time; immediately derive the new rate before the next observable operation. Restored mounts reconstruct the rates without elapsed or duplicate regeneration.",
        },
        "deferred": [{"item": "i326", "alias": "I248", "code": "AIrg", "objectJsonIndex": abilities["I248"]["jsonIndex"],
                      "sourceLine": 50095, "scope": "Activated buff, charge consumption, interruption, recast and spell dispatch."}],
        "pendingMechanismInPassiveScope": [],
        "originalClientTested": False,
        "verification": probes(records),
    }


def probes(records):
    stats = {item: row["web"] for item, row in records.items()}

    def mana(base, held, items_in_range, other_auras):
        pct = sum(stats[item].get("manaPercent", 0) for item in held)
        aura = max((stats[item]["manaAuraPerSecond"] for item in items_in_range), default=0)
        return base * (1 + Fraction(pct, 100)) + aura + other_auras

    def life(base, cap, held):
        fixed = stats["i147"]["lifeFlatPerSecond"] if "i147" in held else 0
        pct = sum(stats[item]["lifePercentPerSecond"] for item in set(held) & {"i145", "i332"})
        return base + fixed + cap * Fraction(pct, 100)

    # One half second at the old rate; the same-time drop immediately falls back to I169.
    before = mana(10, ["i101", "i121"], ["i129", "i161"], 11)
    after = mana(10, ["i101"], ["i129", "i129"], 11)
    cases = [
        ("AIrm adds across instances, fixed auras use highest B021 without the multiplier",
         [before, after, before / 2 + after / 2], [38, 26, 32]),
        ("distinct life buffs, duplicate heart, then replacement by opening fire heart",
         [life(5, 1000, ["i147", "i145", "i145", "i332"]), life(5, 1000, ["i147", "i145", "i330"])],
         [95, 55]),
    ]
    for name, actual, expected in cases:
        assert actual == expected, (name, actual, expected)
    return [{"name": name, "actual": [float(x) for x in actual], "expected": expected}
            for name, actual, expected in cases]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    with closing(source.connect()) as db:
        start = time.perf_counter()
        report = evidence(db)
        elapsed = (time.perf_counter() - start) * 1000
    content = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.write:
        OUT.write_text(content)
    else:
        assert OUT.read_text() == content, f"{OUT.name} differs from indexed sources"
    print(f"{report['coverage']}; {len(report['verification'])} Web regeneration probes passed; indexed verification {elapsed:.2f} ms")


if __name__ == "__main__":
    main()
