#!/usr/bin/env python3
"""Compare both encyclopedias and indexed mounts for static equipment resources."""

import argparse
from collections import Counter
from contextlib import closing
import json
import re
import sys

sys.dont_write_bytecode = True
import audit_index as source

SHEET = "装备与道具"
RULES = source.ROOT / "docs/rules"
OUT = RULES / "item-resources-batch-01.json"
CODES = ("AIml", "AImm")
AMOUNT = re.compile(r"(?:增加|提高|(?<=值与))\s*(?:英雄\s*)?(\d+)\s*点\s*(?:最大)?(生命|魔法)值")


def amount(text):
    fields = {kind: int(value) for value, kind in AMOUNT.findall(text or "")}
    return [fields.get(kind, 0) for kind in ("生命", "魔法")]


def evidence(db):
    def rows(path):
        return {n: (json.loads(cells) + [None] * 8)[:8] for n, cells in db.execute(
            "SELECT row_no,cells FROM sheet_row WHERE source=? AND sheet=? ORDER BY row_no",
            (source.source_path(path), SHEET),
        )}

    original, repo = (rows(path) for path in source.WORKBOOKS)
    assert original == repo
    equipment = {row[1]: (n, row) for n, row in repo.items() if n >= 5 and row[1]}
    assert len(equipment) == 243
    lifecycle = json.loads((RULES / "item-lifecycle.json").read_text())
    item_positions = {row["id"]: row["fieldLines"].get("abilList") for row in lifecycle["objectRows"]}
    candidates = {}
    for rawcode, index, code, value, levels in db.execute("""
        SELECT object_id,row_no-1,json_extract(fields,'$.code'),json_extract(fields,'$.DataA1'),
               json_extract(fields,'$.levels')
        FROM object_row WHERE source='reference/map-6.25/units_abilitydata.json'
        AND json_extract(fields,'$.code') IN ('AIml','AImm','Aspb')
    """):
        candidates[rawcode] = {"code": code, "DataA1": value, "levels": levels, "jsonIndex": index}

    # A new object delta must get its effective fields checked before this batch can close.
    extra = db.execute("""
        SELECT o.object_id FROM object_row o JOIN object_alias a USING(source,row_no)
        WHERE a.source='reference/map-6.25/war3map.w3a.json'
          AND a.field='old' AND a.alias IN ('AIml','AImm','Aspb')
    """).fetchall()
    assert not extra, extra

    records, books, wrappers = {}, {}, {}
    for item_id, (n, row) in equipment.items():
        name, _, kind, *_, description = row
        item = source.objects(db, item_id, "units_itemdata", fields=["abilList"])[0]
        overrides = source.objects(db, item_id, "war3map.w3t", fields=["mods"])
        mods = [mod for entry in overrides for mod in entry["fields"]["mods"]]
        assert not any(mod["key"] == "iabi" for mod in mods), item_id
        tooltip = next((mod["value"] for mod in mods if mod["key"] == "utub"), None)
        raw = item["fields"].get("abilList")
        mounts = []
        for slot, token in enumerate((raw or "").split(","), 1):
            alias = token.strip()
            ability = candidates.get(alias)
            if not ability:
                continue
            assert alias == token, (item_id, token)
            path = [alias]
            children = [(None, alias)]
            if ability["code"] == "Aspb":
                assert alias == "I280" and item_id in ("i330", "i332"), (item_id, alias)
                wrappers[alias] = ability
                children = list(enumerate(ability["DataA1"].split(","), 1))
            for child_slot, child in children:
                fields = candidates.get(child)
                if not fields:
                    continue
                assert fields["code"] in CODES, (item_id, child)
                ordered = path + [child] if child_slot else path
                mounts.append({"path": ordered, "itemListPosition": slot, **(
                    {"spellBookPosition": child_slot} if child_slot else {}
                )})

        shown = amount(description)
        tooltip_amount = amount(tooltip) if tooltip is not None else None
        if not mounts and shown == [0, 0]:
            assert tooltip_amount in (None, [0, 0]), item_id
            continue
        assert tooltip_amount in (None, shown), (item_id, tooltip_amount, shown)
        entry = {"id": item_id, "name": name, "workbookCell": f"{SHEET}!H{n}", "workbookStatic": shown,
                 "objectAbilListLine": item_positions[item_id], "objectAbilList": raw,
                 "w3tTooltipStatic": tooltip_amount}
        if mounts:
            assert kind != "制作书" and shown != [0, 0], item_id
            total = [sum(candidates[m["path"][-1]]["DataA1"] for m in mounts
                         if candidates[m["path"][-1]]["code"] == code) for code in CODES]
            records[item_id] = {**entry, "mounts": mounts, "objectOccurrenceSum": total, "webStats": shown}
        else:
            assert kind == "制作书", item_id
            books[item_id] = {**entry, "webStats": [0, 0]}

    counts = Counter(m["path"][-1] for row in records.values() for m in row["mounts"])
    aliases = {alias: {**candidates[alias], "occurrences": counts[alias]} for alias in sorted(counts)}
    for alias, fields in {**aliases, **wrappers}.items():
        assert fields["levels"] == 1 and not source.objects(db, alias, "war3map.w3a")
        for literal in (alias, *(int.from_bytes(alias.encode(), direction) for direction in ("big", "little"))):
            assert not source.references(db, literal), (alias, literal)
    jass = (source.MAP / "war3map.j").read_text()
    tokens = set(re.findall(r"\b\w+\b|\$[0-9a-fA-F]+", jass))
    assert tokens.isdisjoint((*aliases, *wrappers))
    integers = {int(token.lstrip("$"), 16 if token.startswith(("$", "0x", "0X")) else 10)
                for token in tokens if re.fullmatch(r"[0-9]+|(?:0[xX]|\$)[0-9a-fA-F]+", token)}
    assert all(int.from_bytes(alias.encode(), direction) not in integers
               for alias in (*aliases, *wrappers) for direction in ("big", "little"))

    for book_id, book in books.items():
        recipes = [recipe for recipe in lifecycle["tables"]["recipes"] if book_id in recipe["materials"]]
        assert len(recipes) == 1, (book_id, recipes)
        recipe, = recipes
        product = records[recipe["result"]]
        book.update(product=product["id"], recipeSourceLines=recipe["sourceLines"],
                    webFinishedItemPreview=product["webStats"])
    item_differences = [r["id"] for r in records.values() if r["objectOccurrenceSum"] != r["webStats"]]
    book_differences = [r["id"] for r in books.values() if r["workbookStatic"] != r["webFinishedItemPreview"]]
    assert item_differences == ["i327"] and book_differences == ["i210"], (item_differences, book_differences)
    assert records["i327"]["objectOccurrenceSum"] == [600, 550] and records["i327"]["webStats"] == [800, 550]
    assert books["i210"]["workbookStatic"] == [0, 300] and books["i210"]["webFinishedItemPreview"] == [0, 350]
    indirect = sum(len(m["path"]) > 1 for row in records.values() for m in row["mounts"])
    assert (len(aliases), len(records), len(books), counts.total(), indirect) == (15, 18, 14, 28, 2)
    return {
        "baselineId": "item-resources-batch-01",
        "status": "bounded_source_audit_and_Q24_Web_selection",
        "pendingMechanism": [],
        "originalClientTested": False,
        "dependencies": ["item-lifecycle-v1/L01-L09", "hero-attribute-interface-v1",
                         "item-attributes-v1", "night-state-and-regeneration-v1"],
        "resources": ["MAX_LIFE", "MAX_MANA"],
        "coverage": {"workbookItemRowsCompared": len(equipment), "aliases": len(aliases),
                     "aliasesByCode": dict(Counter(fields["code"] for fields in aliases.values())),
                     "equipmentAndComponents": len(records), "directOccurrences": counts.total() - indirect,
                     "indirectOccurrences": indirect, "recipeBooks": len(books)},
        "objectLocations": {"itemAbilList": "reference/map-6.25/units_itemdata.json (line)",
                            "abilityData": "reference/map-6.25/units_abilitydata.json (zero-based array index)"},
        "aliases": aliases, "spellBookWrappers": wrappers, "items": list(records.values()),
        "recipeBooks": list(books.values()), "numericDecisions": {"items": item_differences, "recipeBooks": book_differences},
        "scriptScan": {"disassemblyConstantAndJassLiteralOrRawcodeHits": 0,
                       "sharedMutationEvidence": "item-flat-attack.json/scriptScan"},
        "webRule": {
            "contribution": "Sum per-instance workbook-selected flat resource vectors on eligible native hero mounts.",
            "ordering": "L01 mount before PICKUP and withdraw before DROP. Apply actual max delta to current once per passive change with the hero resource floors and preservation of death. Script max setters maintain a separate offset and preserve current before clamping.",
            "restore": "L07 rebuild the mount ledger from restored instances and retain absolute resources and script offsets.",
        },
        "verification": {"kind": "Q24 resource contract probes; original event and setter sites use existing evidence",
                         "cases": probes(records)},
    }


def probes(records):
    def change(state, new_max, floor, passive=True):
        old_max, current = state
        if floor == 1 and current == 0:
            return [new_max, 0]
        return [new_max, min(new_max, max(floor, current + (new_max - old_max if passive else 0)))]

    life, mana = records["i327"]["webStats"]
    # i327's +70 INT is already in the attribute channel; five magic charges are 15 direct max.
    before_pickup = [change([1000, 350], 1000 + life, 1), change([500, 100], 500 + mana + 70 * 12, 0)]
    after_pickup = [before_pickup[0], change(before_pickup[1], before_pickup[1][0] + 15, 0, passive=False)]
    before_drop = [change(after_pickup[0], 1000, 1), change(after_pickup[1], 515, 0)]
    after_drop = [before_drop[0], change(before_drop[1], 500, 0, passive=False)]
    bloodstone_life, bloodstone_mana = records["i220"]["webStats"]
    cases = [
        ("i327 fixed resources, INT and charge remain separate on PICKUP and DROP",
         [before_pickup, after_pickup, before_drop, after_drop],
         [[[1800, 1150], [1890, 1490]], [[1800, 1150], [1905, 1490]],
          [[1000, 350], [515, 100]], [[1000, 350], [500, 100]]]),
        ("i220 repeated alias contributes once at its per-item summed amount, death stays at zero",
         [change([1000, 0], 1000 + bloodstone_life, 1), change([500, 400], 500 + bloodstone_mana, 0)],
         [[2000, 0], [1250, 1150]]),
        ("loss clamps low living life and mana at their different floors",
         [change([2000, 5], 1000, 1), change([1250, 5], 500, 0)],
         [[1000, 1], [500, 0]]),
    ]
    for name, actual, expected in cases:
        assert actual == expected, (name, actual, expected)
    return [{"name": name, "actual": actual, "expected": expected} for name, actual, expected in cases]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--write", action="store_true")
    modes.add_argument("--check", action="store_true")
    args = parser.parse_args()
    with closing(source.connect()) as db:
        report = evidence(db)
    rendered = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.write:
        OUT.write_text(rendered)
    else:
        assert OUT.read_text() == rendered, f"{OUT.name} differs from audited inputs"
    print(f"{report['coverage']}; {len(report['verification']['cases'])} resource probes passed")


if __name__ == "__main__":
    main()
