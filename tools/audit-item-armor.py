#!/usr/bin/env python3
"""Audit fixed equipment armor and flat movement entries against the shared source index."""

import argparse
from contextlib import closing
import json
import re
import sys
import time

sys.dont_write_bytecode = True
import audit_index as source

SHEET = "装备与道具"
RULES = source.ROOT / "docs/rules"
OUT = RULES / "item-armor-batch-01.json"
ARMOR = ("AIde", "AId1", "AId2", "AId3", "AId4", "AId5", "AIda", "AIdb")
FAMILIES = (*ARMOR, "AIms", "Aspb")
MOVE = re.compile(r"增加(\d+)点移动速度(（深渊模式下有效）)?")


def movement(text):
    match = MOVE.search(text or "")
    return (int(match[1]), 2 if match[2] else None) if match else None


def evidence(db):
    def workbook(path):
        return {n: (json.loads(cells) + [None] * 8)[:8] for n, cells in db.execute(
            "SELECT row_no,cells FROM sheet_row WHERE source=? AND sheet=? ORDER BY row_no",
            (source.source_path(path), SHEET),
        )}

    original, repo = (workbook(path) for path in source.WORKBOOKS)
    assert original == repo
    markers = ",".join("?" for _ in FAMILIES)
    abilities = {alias: (index, json.loads(fields)) for alias, index, fields in db.execute(f"""
        SELECT object_id,row_no-1,fields FROM object_row WHERE source='reference/map-6.25/units_abilitydata.json'
          AND (json_extract(fields,'$.code') IN ({markers}) OR object_id IN ({markers}))
    """, (*FAMILIES, *FAMILIES))}
    item_data = {alias: (index, raw) for alias, index, raw in db.execute("""
        SELECT object_id,row_no-1,json_extract(fields,'$.abilList')
        FROM object_row WHERE source='reference/map-6.25/units_itemdata.json'
    """)}
    overrides = {alias: json.loads(mods) for alias, mods in db.execute("""
        SELECT object_id,json_extract(fields,'$.mods') FROM object_row WHERE source='reference/map-6.25/war3map.w3t.json'
    """)}
    for base in FAMILIES:
        assert not source.objects(db, base, "war3map.w3a", aliases=True), base

    records, books = {}, {}
    armor_mounts = []
    item_count = 0
    for n, (name, item, kind, *_, description) in repo.items():
        if n < 5 or not item:
            continue
        item_count += 1
        index, raw = item_data[item]
        mods = {mod["key"]: mod["value"] for mod in overrides.get(item, [])}
        assert "iabi" not in mods, item
        tokens = [token.strip() for token in (raw or "").split(",")]
        for token in tokens.copy():
            if token in abilities and abilities[token][1]["code"] == "Aspb":
                tokens.extend(child.strip() for child in abilities[token][1]["DataA1"].split(","))
        armor_mounts.extend((item, token) for token in tokens if token in abilities
                            and (token in ARMOR or abilities[token][1]["code"] in ARMOR))
        mounts = [token for token in tokens if token in abilities and abilities[token][1]["code"] == "AIms"]
        described = movement(description)
        if not mounts and described is None:
            continue
        assert described == movement(mods.get("utub")), item
        amount, mode = described
        entry = {"id": item, "name": name, "workbookCell": f"{SHEET}!H{n}",
                 "objectJsonIndex": index, "objectAbilList": raw, "workbookAndTooltipMovement": amount,
                 "requiredGameMode": mode}
        if not mounts:
            assert kind == "制作书"
            books[item] = {**entry, "webMovement": 0}
            continue
        alias, = mounts
        ability_index, fields = abilities[alias]
        assert alias in (raw or "").split(",")
        assert kind != "制作书" and fields["levels"] == 1 and fields["DataA1"] == amount
        assert not source.objects(db, alias, "war3map.w3a")
        for literal in (alias, *(int.from_bytes(alias.encode(), order) for order in ("big", "little"))):
            assert not source.references(db, literal), (alias, literal)
        records[item] = {**entry, "alias": alias, "abilityJsonIndex": ability_index,
                         "DataA1": fields["DataA1"], "webMovement": amount}

    assert not armor_mounts
    assert (item_count, tuple(records), tuple(books)) == (243, ("i230", "i236"), ("i231",))
    assert [(row["webMovement"], row["requiredGameMode"]) for row in records.values()] == [(50, 2), (20, None)]
    armor_objects = sorted(alias for alias, (_, fields) in abilities.items() if alias in ARMOR or fields["code"] in ARMOR)
    assert len(armor_objects) == 12
    lifecycle = json.loads((RULES / "item-lifecycle.json").read_text())
    recipe, = [row for row in lifecycle["tables"]["recipes"] if "i231" in row["materials"]]
    assert recipe["result"] == "i230" and books["i231"]["workbookAndTooltipMovement"] == records["i230"]["webMovement"]
    assert books["i231"]["requiredGameMode"] == records["i230"]["requiredGameMode"]
    books["i231"].update(product="i230", recipeSourceLines=recipe["sourceLines"], webFinishedItemPreviewMovement=50)
    return {
        "baselineId": "item-armor-batch-01",
        "status": "bounded_source_audit_and_Q24_Web_selection",
        "coverage": {"workbookItemRowsCompared": item_count, "armorAliases": 0, "armorItems": 0,
                     "movementAliases": len({r["alias"] for r in records.values()}),
                     "movementItems": len(records), "recipeBooks": len(books)},
        "armor": {"objectFamilies": ARMOR, "sourceObjectsOutsideThisMountScope": armor_objects, "mounted": armor_mounts},
        "movement": {"items": list(records.values()), "recipeBooks": list(books.values()),
                     "webRule": "Filter eligible mounts by Game_Mode and take the maximum positive AIms value. Add to the existing movement basis before percentage factors and final mobile clamp. Mount changes are visible before PICKUP/DROP. Do not grant movement to blocked or immobile entities."},
        "dependencies": ["item-lifecycle-v1", "pathing-and-placement", "native-armor-and-xp", "hero-attribute-interface-v1"],
        "pendingMechanism": [],
        "originalClientTested": False,
        "verification": mode_probe(records),
    }


def mode_probe(records):
    held = ["i230", "i230", "i236"]
    values = [max((records[item]["webMovement"] for item in mounted
                   if records[item]["requiredGameMode"] in (None, mode)), default=0)
              for mounted, mode in [(held, 1), (held, 2), (["i236"], 2), (["i230"], 1)]]
    assert values == [20, 50, 20, 0]
    return {"scenario": "mode gate, same-family duplicate and fallback on final boots removal", "contributions": values}


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
    rendered = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.write:
        OUT.write_text(rendered)
    else:
        assert OUT.read_text() == rendered, f"{OUT.name} differs from indexed sources"
    print(f"{report['coverage']}; 1 movement probe passed; indexed verification {elapsed:.2f} ms")


if __name__ == "__main__":
    main()
