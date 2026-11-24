#!/usr/bin/env python3
"""Compare both workbooks against mounted AIas aliases in the shared source index."""

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
OUT = RULES / "item-attack-speed-batch-01.json"
DIRECT_RATE = re.compile(r"(?:^|[与和])\s*(增加|减少)?\s*(?:自己|自身)?\s*(\d+)\s*%\s*(?:点|的)?\s*(?:攻击速度|攻速)")


def percentage(text):
    plain = re.sub(r"\|c[0-9a-fA-F]{8}|\|r", "", (text or "").replace("|n", "\n"))
    matches = [match for line in plain.splitlines() for match in DIRECT_RATE.findall(line.strip().lstrip("-"))]
    assert len(matches) <= 1, text
    return next((int(value) * (-1 if sign == "减少" else 1) for sign, value in matches), None)


def evidence(db):
    def workbook(path):
        return {n: (json.loads(cells) + [None] * 8)[:8] for n, cells in db.execute(
            "SELECT row_no,cells FROM sheet_row WHERE source=? AND sheet=? ORDER BY row_no",
            (source.source_path(path), SHEET),
        )}

    original, repo = (workbook(path) for path in source.WORKBOOKS)
    assert original == repo
    abilities = {alias: {"jsonIndex": index, **json.loads(fields)} for alias, index, fields in db.execute("""
        SELECT object_id,row_no-1,fields FROM object_row WHERE source='reference/map-6.25/units_abilitydata.json'
          AND json_extract(fields,'$.code') IN ('AIas','Aspb')
    """)}
    for code in ("AIas", "Aspb"):
        assert not source.objects(db, code, "war3map.w3a", aliases=True)
    records, books, wrappers = {}, {}, {}
    item_rows = 0
    for n, (name, item, kind, *_, description) in repo.items():
        if n < 5 or not item:
            continue
        item_rows += 1
        obj, = source.objects(db, item, "units_itemdata", fields=["abilList"])
        overrides = source.objects(db, item, "war3map.w3t", fields=["mods"])
        mods = {mod["key"]: mod["value"] for row in overrides for mod in row["fields"]["mods"]}
        assert "iabi" not in mods, item
        raw = obj["fields"].get("abilList")
        mounts = []
        for i, token in enumerate((raw or "").split(","), 1):
            alias = token.strip()
            fields = abilities.get(alias)
            if fields is None:
                continue
            assert alias == token, (item, token)
            if fields["code"] == "AIas":
                mounts.append({"path": [alias], "itemPosition": i})
                continue
            children = fields["DataA1"].split(",")
            for j, child in enumerate(children, 1):
                if abilities.get(child, {}).get("code") == "AIas":
                    assert (alias, child) == ("I280", "I278"), (alias, child)
                    mounts.append({"path": [alias, child], "itemPosition": i, "spellBookPosition": j})
                    wrappers[alias] = {"children": children, "jsonIndex": fields["jsonIndex"]}
        shown = percentage(description)
        if not mounts and shown is None:
            continue
        tooltip = percentage(mods.get("utub"))
        assert tooltip in (None, shown), (item, shown, tooltip)
        entry = {"id": item, "name": name, "workbookCell": f"{SHEET}!H{n}", "workbookPct": shown,
                 "objectJsonIndex": obj["jsonIndex"], "objectAbilList": raw, "objectTooltipPct": tooltip}
        if mounts:
            assert kind != "制作书" and shown is not None, item
            native = sum(Fraction(str(abilities[m["path"][-1]]["DataA1"])) * 100 for m in mounts)
            assert native.denominator == 1
            records[item] = {**entry, "mounts": mounts, "objectOccurrenceSumPct": int(native), "webPct": shown}
        else:
            assert kind == "制作书", item
            books[item] = {**entry, "webPct": 0}

    aliases = Counter(m["path"][-1] for row in records.values() for m in row["mounts"])
    for alias in (*sorted(aliases), *wrappers):
        assert abilities[alias]["levels"] == 1 and not source.objects(db, alias, "war3map.w3a")
        for literal in (alias, *(int.from_bytes(alias.encode(), order) for order in ("big", "little"))):
            assert not source.references(db, literal), (alias, literal)
    lifecycle = json.loads((RULES / "item-lifecycle.json").read_text())
    for item, book in books.items():
        recipe, = [r for r in lifecycle["tables"]["recipes"] if item in r["materials"]]
        product = records[recipe["result"]]
        assert book["workbookPct"] == product["webPct"]
        book.update(product=product["id"], recipeSourceLines=recipe["sourceLines"], webFinishedItemPreviewPct=product["webPct"])
    changes = [r["id"] for r in records.values() if r["objectOccurrenceSumPct"] != r["webPct"]]
    assert changes == ["i108", "i112", "i274"]
    assert all((records[item]["objectOccurrenceSumPct"], records[item]["webPct"]) == (10, 12) for item in changes)
    indirect = sum(len(m["path"]) > 1 for row in records.values() for m in row["mounts"])
    assert (item_rows, len(aliases), len(records), aliases.total(), indirect, len(books)) == (243, 10, 21, 25, 2, 16)
    return {
        "baselineId": "item-attack-speed-batch-01",
        "status": "bounded_source_audit_and_Q24_Web_selection",
        "dependencies": ["attack-timing/T01-T03", "item-lifecycle-v1/L01-L09", "item-attributes-v1",
                         "weapon-attribute-interface-v1"],
        "coverage": {"workbookItemRowsCompared": item_rows, "aliases": len(aliases), "equipment": len(records),
                     "directOccurrences": aliases.total() - indirect, "indirectOccurrences": indirect,
                     "recipeBooks": len(books)},
        "aliases": {alias: {"DataA1": abilities[alias]["DataA1"], "jsonIndex": abilities[alias]["jsonIndex"],
                            "occurrences": aliases[alias]} for alias in sorted(aliases)},
        "spellBookWrappers": wrappers, "items": list(records.values()), "recipeBooks": list(books.values()),
        "numericDecisions": changes,
        "webRule": "Add each eligible mounted item's selected percent/100 once to raw R. Keep AGI and script J separate. Update before PICKUP/DROP and retain attack progress via T03. Clamp K only at scheduling. Restore mount contributions without replay.",
        "pendingMechanism": [], "originalClientTested": False,
        "verification": probes(records),
    }


def probes(records):
    def raw(agility, residual, *items):
        return 1 + Fraction(agility, 500) + residual + sum(Fraction(records[item]["webPct"], 100) for item in items)

    raw_before = raw(100, Fraction(-12, 25), "i108", "i330")
    raw_after = raw(84, Fraction(-12, 25), "i330")
    assert (raw_before, raw_after) == (Fraction(17, 50), Fraction(47, 250))
    new_rate = min(5, max(Fraction(1, 5), raw_after))
    # Removing the item halfway into a one-second base wind-up preserves the completed half.
    remaining = Fraction(1, 2) / new_rate
    assert (new_rate, remaining) == (Fraction(1, 5), Fraction(5, 2))
    return [{"scenario": "i108 drop with i330 and an existing J at half wind-up",
             "beforeRawR": float(raw_before), "afterRawR": float(raw_after), "afterK": float(new_rate),
             "remainingBaseWindupSeconds": 0.5, "scheduledSecondsRemaining": float(remaining)}]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--write", action="store_true")
    modes.add_argument("--check", action="store_true")
    args = parser.parse_args()
    with closing(source.connect()) as db:
        start = time.perf_counter()
        report = evidence(db)
        elapsed = (time.perf_counter() - start) * 1000
    rendered = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.write:
        OUT.write_text(rendered)
    else:
        assert OUT.read_text() == rendered, f"{OUT.name} differs from audited inputs"
    print(f"{report['coverage']}; {len(report['verification'])} timing probe passed; indexed verification {elapsed:.2f} ms")


if __name__ == "__main__":
    main()
