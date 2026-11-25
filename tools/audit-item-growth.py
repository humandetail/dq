#!/usr/bin/env python3
"""Verify weapon souls, max-resource growth and the soul stone's upgrade handoff."""

import argparse
from contextlib import closing
import json
import runpy
import sys

sys.dont_write_bytecode = True
import audit_index as source

OUT = source.ROOT / "docs/rules/item-growth-batch-01.json"
SHEET = "装备与道具"
BLADES = {"i131": ("i132", "main/f237/f0"), "i133": ("i134", "main/f239/f0"), "i262": ("i263", "main/f259/f0")}
RESOURCES = {"i145": ("life", 2, 4), "i147": ("life", 1, 4), "i218": ("mana", 1, 3),
             "i220": ("mana", 2, 3), "i327": ("mana", 1, 3)}


def profiles(db):
    results = {}
    table = json.loads((source.ROOT / "docs/rules/item-lifecycle.json").read_text())["tables"]["growth"]
    raw_growth = {row["values"][1]: tuple(row["values"][2:]) for row in table}
    for item in (*RESOURCES, *BLADES, "i329"):
        records = [r for r in source.workbook_rows(db, item, SHEET) if r["cells"][1] == item]
        assert len(records) == 2 and records[0]["cells"][:8] == records[1]["cells"][:8]
        book = records[0]
        description = book["cells"][7]
        row = {"workbookCell": f"{SHEET}!H{book['row']}", "name": book["cells"][0],
               "componentReady": True, "alias": None, "callbacks": []}
        if item in RESOURCES:
            stat, count, factor = RESOURCES[item]
            assert raw_growth[item] == (stat, count), (item, raw_growth[item])
            assert f"{count}点{'血' if stat == 'life' else '魔'}能" in description and f"{factor}点" in description
            row.update(state=stat, chargesPerKill=count, maximumPerCharge=factor, callbacks=["ItemUnitDeadAction"])
            if item == "i327":
                assert "减少20%的技能冷却时间" in description
                row["endcastCooldownFactor"] = 0.8
        elif item in BLADES:
            obj, = source.objects(db, item, "units_itemdata")
            assert obj["fields"].get("abilList") is None and obj["fields"].get("usable") is None
            assert "1400" in description and "存入能量圈" in description
            successor, callback = BLADES[item]
            row.update(upgradesTo=successor, normalSouls=1, mapBossSouls=5, threshold=1400,
                       handler=callback, callbacks=["Item_Get", "ItemUnitDeadAction"])
        else:
            obj, = source.objects(db, item, "units_itemdata")
            skill, = source.objects(db, "I259", "units_abilitydata")
            assert obj["fields"]["abilList"] == "I259" and obj["fields"]["uses"] == obj["fields"]["perishable"] == 1
            assert (skill["fields"]["code"], skill["fields"]["Rng1"], skill["fields"]["targs1"]) == ("ANcl", 50000, "invulnerable,item")
            assert "100点魂魄" in description
            row.update(alias="I259", appliedSouls=100, target=list(BLADES), callbacks=["Item_Get"])
        results[item] = row
    return results


def probes(db):
    vm = runpy.run_path(str(source.ROOT / "tools/audit-divine-books.py"))["runtime"](db)
    execute, function = vm["execute"], vm["function"]

    def run(item, initial, boss, using_stone=False, held=True):
        trace = []
        env = {
            "UnitIsHero": lambda unit: boss, "GetItemCharges": lambda instance: initial,
            "SetItemCharges": lambda *args: trace.append(["charge", *args]), "GetId": lambda id: id,
            "GetUnitX": lambda unit: 10, "GetUnitY": lambda unit: 20,
            "GetItemX": lambda old: 30, "GetItemY": lambda old: 40,
            "UnitHasItem": lambda unit, old: held, "GetItemTypeId": lambda old: item,
            "RemoveItem": lambda old: trace.append(["remove", old]),
            "CreateItem": lambda *args: trace.append(["create", *args]) or "perfect",
            "UnitAddItem": lambda *args: trace.append(["deliver", *args]),
            "GetOwningPlayer": lambda unit: "player",
            "Mall_ActivityTask_Update": lambda *args: trace.append(["progress", *args]),
        }
        if using_stone:
            execute(function("main/f272/f0"), [env, 100], ("worker", "old"))
        else:
            execute(function(BLADES[item][1]), [env], ("circle", "victim", "old"))
        return trace

    outcomes = {
        "normalKillBelowThreshold": run("i131", 1398, False),
        "mapBossCompletesBlade": run("i133", 1395, True),
        "normalKillAtThreshold": run("i262", 1399, False),
        "stoneOnGroundBlade": run("i262", 1300, False, using_stone=True, held=False),
        "stoneOnOwnCarriedBlade": run("i131", 1300, False, using_stone=True),
    }
    assert outcomes == {
        "normalKillBelowThreshold": [["charge", "old", 1399]],
        "mapBossCompletesBlade": [["remove", "old"], ["create", "i134", 10, 20],
                                  ["deliver", "circle", "perfect"], ["progress", "player", 4, 1]],
        "normalKillAtThreshold": [["remove", "old"], ["create", "i263", 10, 20],
                                  ["deliver", "circle", "perfect"], ["progress", "player", 4, 1]],
        "stoneOnGroundBlade": [["charge", "old", 1400], ["remove", "old"], ["create", "i263", 30, 40],
                               ["progress", "player", 4, 1]],
        "stoneOnOwnCarriedBlade": [["charge", "old", 1400], ["remove", "old"], ["create", "i132", 30, 40],
                                   ["deliver", "worker", "perfect"], ["progress", "player", 4, 1]],
    }
    return outcomes


def report(db):
    return {"baselineId": "item-growth-batch-01", "coverage": {"itemsReady": 9, "mountedAliases": 1,
                                                             "itemDescriptionsReconciled": 5, "itemsRemainingInBatch": 0},
            "items": profiles(db), "verification": probes(db),
            "sourceLines": {"growthDispatch": 146001, "stoneDispatch": 144220, "stoneEffect": 134711,
                            "sourceKillDispatch": 168947, "cdr": [172578, 172695], "mapBossPredicate": 52444},
            "reuse": ["item-attributes", "item-lifecycle", "dragon-transformation", "item-regeneration-batch-01"]}


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
    print(data["coverage"], "5 original upgrade paths passed")


if __name__ == "__main__":
    main()
