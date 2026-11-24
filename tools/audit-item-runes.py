#!/usr/bin/env python3
"""Verify indexed ground-rune mounts, effect fields and source recipient gates."""

import argparse
from contextlib import closing
import json
import runpy
import sys

sys.dont_write_bytecode = True
import audit_index as source

OUT = source.ROOT / "docs/rules/item-runes-batch-01.json"
SHEET = "装备与道具"
ITEMS = {
    "i718": (None, "当前波数x66", None),
    "i719": ("I222", "物理伤害增加20%，持续10秒", "I222"),
    "i720": ("I223", "法术伤害增加20%，持续10秒", "I223"),
    "i721": (None, "50%攻击速度，持续10秒", "I224"),
    "i722": (None, "40%攻击力，持续10秒", "I225"),
}


def profiles(db):
    records = {}
    for item, (mount, phrase, effect) in ITEMS.items():
        books = [r for r in source.workbook_rows(db, item, SHEET) if r["cells"][1] == item]
        assert len(books) == 2 and books[0]["cells"][:8] == books[1]["cells"][:8]
        row = books[0]
        assert phrase in row["cells"][7], item
        obj, = source.objects(db, item, "units_itemdata")
        fields = obj["fields"]
        assert fields.get("abilList") == mount and fields["powerup"] == fields["perishable"] == fields["uses"] == 1
        assert not any(m["key"] == "iabi" for r in source.objects(db, item, "war3map.w3t") for m in r["fields"]["mods"])
        pickup, = [r for r in source.references(db, item) if r["function"] == "main/f285/f10"]
        record = {"name": row["cells"][0], "workbookCell": f"{SHEET}!H{row['row']}", "alias": mount,
                  "componentReady": True, "callback": "Item_Get", "pickupSourceLine": pickup["sourceLine"],
                  "sourceItemJsonIndex": obj["jsonIndex"], "sourceAbility": None}
        if effect:
            ability, = source.objects(db, effect, "units_abilitydata")
            assert not source.objects(db, effect, "war3map.w3a")
            record["sourceAbility"] = ability
        records[item] = record

    for item, buff in (("i719", "B052"), ("i720", "B053")):
        fields = records[item]["sourceAbility"]["fields"]
        assert (fields["code"], fields["BuffID1"], fields["Area1"], fields["DataA1"],
                fields["Dur1"], fields["HeroDur1"]) == ("AIsa", buff, 999999, 2, 10, 10)
    fields = records["i721"]["sourceAbility"]["fields"]
    assert (fields["code"], fields["BuffID1"], fields["DataA1"], fields["Dur1"]) == ("Ablo", "B051", 0.5, 10)
    assert fields.get("DataB1") is None
    fields = records["i722"]["sourceAbility"]["fields"]
    assert (fields["code"], fields["BuffID1"], fields["DataA1"], fields["DataB1"], fields["Dur1"]) == ("AIil", "BIil", 0.3, 2, 10)
    return records


def probes(db):
    vm = runpy.run_path(str(source.ROOT / "tools/audit-divine-books.py"))["runtime"](db)
    execute, function = vm["execute"], vm["function"]
    gold_cases = {}
    for wave in (0, 3):
        gold = [10, 20, 30, 40]
        events = []
        env = {"GetTriggerUnit": lambda: "collector", "ClearRune": lambda: events.append("clear"),
               "cur_monLv": wave, "Player": lambda slot: slot, "PLAYER_STATE_RESOURCE_GOLD": "gold",
               "GetPlayerState": lambda slot, kind: gold[slot],
               "SetPlayerState": lambda slot, kind, total: gold.__setitem__(slot, total),
               "GetUnitLoc": lambda unit: (0, 0), "CreateEffAtLoc": lambda *args: None,
               "DisplayTextToAll": lambda message, seconds: events.append(seconds)}
        execute(function("main/f278/f2"), [env], ("collector", "i718"))
        assert events == ["clear", 4]
        delta = 66 * max(1, wave)
        assert gold == [starting + delta for starting in (10, 20, 30, 40)]
        gold_cases[str(wave)] = gold

    results = {}
    for unit, hero in (("collector", True), ("otherHero", True), ("worker", False)):
        env = {"GetFilterUnit": lambda: unit, "UNIT_TYPE_HERO": "hero",
               "IsUnitType": lambda unit, kind: hero}
        haste = execute(function("main/f278/f5/f1"), [env, "collector"])
        illusion = execute(function("main/f278/f6/f1"), [env])
        results[unit] = [haste, illusion]
    assert results == {"collector": [False, True], "otherHero": [True, True], "worker": [True, False]}
    return {"goldAfterCreditByWave": gold_cases, "sourceFilterOrder": ["haste_pre_native", "illusion"],
            "sourceFilters": results}


def report(db):
    rows = profiles(db)
    return {
        "baselineId": "item-runes-batch-01",
        "coverage": {"itemComponentsReady": len(rows), "itemComponentsRemaining": 0, "uniqueItems": len(rows),
                     "mountedAliases": 2, "auxiliaryAliases": 2, "existingRestorationRuneReused": 1},
        "items": rows,
        "web": {
            "spawn": {"mode": 0, "inclusiveRollRange": [1, 100], "spawnIfLessThan": 50,
                      "delaySeconds": 15, "maxOutstanding": 1, "equalTypePool": [*ITEMS, "i723"]},
            "i718": {"goldPerWave": 66, "sourceMinimumWave": 1, "audience": "active human players"},
            "i719": {"duration": 10, "physicalMultiplier": 1.2, "movementSpeedBonus": 2, "buff": "B052"},
            "i720": {"duration": 10, "magicMultiplier": 1.2, "movementSpeedBonus": 2, "buff": "B053"},
            "i721": {"duration": 10, "attackSpeedBonus": 0.5, "movementSpeedBonus": 0, "buff": "B051", "includesHeroCollector": True},
            "i722": {"duration": 10, "countPerHero": 1, "attackMultiplier": 0.4, "damageTakenMultiplier": 2, "buff": "BIil"},
        },
        "sourceLines": {"refreshAtWave": 184114, "spawnLogic": 181218, "scriptEffects": [136381, 136781],
                        "physicalDamage": 145736, "magicDamage": 145758, "illusionCommand": 136732},
        "verification": probes(db),
    }


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
    print(data["coverage"], "2 gold outcomes and 6 original filter evaluations passed")


if __name__ == "__main__":
    main()
