#!/usr/bin/env python3
"""Verify all encyclopedia mounts of the equipment B029 periodic burn."""

import argparse
from contextlib import closing
import json
import re
import sys

sys.dont_write_bytecode = True
import audit_index as source

OUT = source.ROOT / "docs/rules/item-immolation-batch-01.json"
SHEET = "装备与道具"
ITEMS = {"i135": ("I181", 250), "i136": ("I182", 360), "i137": ("I183", 470), "i138": ("I184", 620),
         "i276": ("I271", 1000)}


def profiles(db):
    abilities = {alias: json.loads(fields) for alias, fields in db.execute(
        "SELECT object_id,fields FROM object_row WHERE source LIKE '%/units_abilitydata.json'")}
    all_abilities = set()
    for cells, fields in db.execute("""
        SELECT s.cells, o.fields FROM sheet_row AS s
        JOIN object_row AS o ON o.object_id=json_extract(s.cells, '$[1]')
        WHERE s.source='图鉴.xlsx' AND s.sheet=? AND s.row_no>=5 AND o.source LIKE '%/units_itemdata.json'
    """, (SHEET,)):
        item = json.loads(cells)[1]
        value = json.loads(fields).get("abilList") or ""
        direct = [ability.strip() for ability in value.split(",") if ability.strip() and ability.strip() != "_"]
        children = [child for spellbook in direct if abilities[spellbook]["code"] == "Aspb"
                    for child in abilities[spellbook]["DataA1"].split(",")]
        all_abilities.update((item, alias) for alias in [*direct, *children] if abilities[alias]["code"] == "Apig")
    assert all_abilities == {(item, alias) for item, (alias, _) in ITEMS.items()}

    records = {}
    for item, (alias, amount) in ITEMS.items():
        rows = [r for r in source.workbook_rows(db, item, SHEET) if r["cells"][1] == item]
        assert len(rows) == 2 and rows[0]["cells"][:8] == rows[1]["cells"][:8]
        book = rows[0]
        phrase = f"900范围内的敌人每秒造成{amount}点法术伤害"
        assert phrase in book["cells"][7] and "多个灼烧不叠加" in book["cells"][7]
        obj, = source.objects(db, item, "units_itemdata")
        ability, = source.objects(db, alias, "units_abilitydata")
        assert not source.objects(db, alias, "war3map.w3a")
        mods = {m["key"]: m["value"] for r in source.objects(db, item, "war3map.w3t") for m in r["fields"]["mods"]}
        assert "iabi" not in mods
        if "utub" in mods:
            assert [int(value) for value in re.search(r"(\d+)范围内的敌人每秒造成(\d+)点法术伤害", mods["utub"]).groups()] == [900, amount]
        fields = ability["fields"]
        assert (fields["code"], fields["BuffID1"], fields["Area1"], fields["Dur1"], fields["HeroDur1"],
                fields["DataA1"], fields["targs1"]) == ("Apig", "B029", 900, 1, 1, amount, "ground,enemy,neutral,organic")
        assert not source.references(db, alias)
        records[item] = {"name": book["cells"][0], "abilityJsonIndex": ability["jsonIndex"], "itemJsonIndex": obj["jsonIndex"],
                         "alias": alias, "workbookCell": f"{SHEET}!H{book['row']}", "amount": amount, "componentReady": True,
                         "independentComponentsRemaining": ["I270", "Item_Auto_Use"] if item == "i276" else []}
    assert not source.references(db, "B029")
    return records


def overlap_probe():
    # (source stable ID, x coordinate, original damage)
    sources = [(3, 0, 620), (2, 100, 1000), (4, 10, 1000)]
    target_x = 900
    observations = []
    for expired in (None, 2, 4, 3):
        sources = [entry for entry in sources if entry[0] != expired]
        qualified = [(damage, -identifier) for identifier, x, damage in sources if abs(x - target_x) <= 900]
        damage, identifier = max(qualified, default=(0, 0))
        observations.append([damage, -identifier])
    assert observations == [[1000, 2], [1000, 4], [620, 3], [0, 0]]
    return observations


def report(db):
    rows = profiles(db)
    return {"baselineId": "item-immolation-batch-01", "coverage": {"aliasesReady": len(rows), "aliasesRemaining": 0,
                                                                  "uniqueItems": len(rows), "recipeRows": 0},
            "items": rows, "web": {"buff": "B029", "radius": 900, "periodSeconds": 1, "firstTickAfterSeconds": 1,
                                     "dedupe": "maximum eligible source amount per target; stable earliest source on equal amount",
                                     "packet": {"isAttack": False, "isRanged": False, "attackType": "NORMAL", "damageType": "MAGIC"},
                                     "separatePeriodicBuff": "Bpig"},
            "verification": {"overlapTieAndFallback": overlap_probe()}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--write", action="store_true")
    modes.add_argument("--check", action="store_true")
    args = parser.parse_args()
    with closing(source.connect()) as db:
        data = report(db)
    rendered = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if args.write:
        OUT.write_text(rendered)
    else:
        assert OUT.read_text() == rendered
    print(data["coverage"], "overlap, equal strength and immediate fallback passed")


if __name__ == "__main__":
    main()
