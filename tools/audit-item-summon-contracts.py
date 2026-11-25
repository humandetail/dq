#!/usr/bin/env python3
"""Check eleven summon contract items and replay indexed birth and drop boundaries."""

import argparse
from contextlib import closing
from fractions import Fraction
import json
import re
import runpy
import sys

sys.dont_write_bytecode = True
import audit_index as source

OUT = source.ROOT / "docs/rules/item-summon-contracts-batch-01.json"
SHEET = "装备与道具"
TIERS = {"red": ("i243", "i249", "i250"), "green": ("i245", "i251", "i252"),
         "blue": ("i247", "i253", "i254")}
MARKERS = {"red": "T085", "green": "T086", "blue": "T087"}


def profiles(db):
    rows = {}
    group_levels = {"i240": ("blessing", None), "i242": ("gem", None)}
    group_levels.update((item, (group, level)) for group, items in TIERS.items() for level, item in enumerate(items, 1))
    for item, (group, level) in group_levels.items():
        records = [r for r in source.workbook_rows(db, item, SHEET) if r["cells"][1] == item]
        assert len(records) == 2 and records[0]["cells"][:8] == records[1]["cells"][:8]
        book = records[0]
        obj, = source.objects(db, item, "units_itemdata")
        assert obj["fields"].get("usable") is None
        refs = source.references(db, item)
        drop_lines = [r["sourceLine"] for r in refs if r["function"] == "main/f285/f18"]
        birth_lines = [r["sourceLine"] for r in refs if r["function"] == "main/f232/f0"]
        assert birth_lines and bool(drop_lines) == (item != "i240")
        attack_speed = 30 if item == "i240" else 20 if item == "i242" else 50
        assert f"增加{attack_speed}%攻击速度" in book["cells"][7]
        inherit = 10 if item == "i240" else 20 if level else 0
        if inherit:
            assert f"全属性加成系数+{inherit}%" in book["cells"][7]
        row = {"name": book["cells"][0], "workbookCell": f"{SHEET}!H{book['row']}", "itemJsonIndex": obj["jsonIndex"],
               "group": group, "level": level, "marker": MARKERS.get(group), "attackSpeedPct": attack_speed,
               "inheritanceBoostPctPoints": inherit, "sourceBirthLines": birth_lines,
               "sourceDropLines": drop_lines, "componentReady": True}
        if group == "red":
            values = re.search(r"无视(\d+)%护甲.*造成(\d+)%分裂伤害", book["cells"][7]).groups()
            assert tuple(map(int, values)) == (20 + 10 * level, 60 + 20 * level)
            row["contract"] = {"ignoreArmorPct": int(values[0]), "splashPct": int(values[1]), "range": 300, "melee": True,
                               "destination": "each child damage packet's positive armor stage"}
        if group == "green":
            values = re.search(r"敏捷x(\d+)%.*(\d0)%的必中", book["cells"][7]).groups()
            assert tuple(map(int, values)) == (40 + 20 * level, 20 + 10 * level)
            row["contract"] = {"ownerAgilityPct": int(values[0]), "trueHitPctMelee": int(values[1]), "endlessMultiplier": 2}
        if group == "blue":
            values = re.search(r"(\d+)%概率对目标(\d+)范围造成（攻击力x(\d+)%", book["cells"][7]).groups()
            assert tuple(map(int, values)) == (15, 400, 400 + 200 * level)
            row["contract"] = {"procPct": int(values[0]), "radius": int(values[1]),
                               "summonAttackMultiplier": int(values[2]) / 100, "mainlineMultiplier": 0.5}
        row["remainingInteraction"] = []
        rows[item] = row

    for marker in MARKERS.values():
        skill, = source.objects(db, marker, "units_abilitydata")
        assert skill["fields"]["code"] == "Amgl" and skill["fields"]["levels"] == 3
    true_hit, = source.objects(db, "T201", "units_abilitydata")
    assert [true_hit["fields"][f"DataA{level}"] for level in (1, 2, 3)] == [30, 40, 50]
    return rows


def probes(db):
    vm = runpy.run_path(str(source.ROOT / "tools/audit-divine-books.py"))["runtime"](db)
    execute, function = vm["execute"], vm["function"]

    def birth(items, melee):
        speed = 1.0
        abilities = {}

        def set_speed(unit, state, value):
            nonlocal speed
            assert unit == "summon" and state == 81
            speed = value

        env = {"GetId": lambda item: item, "HasItem": lambda owner, item: item if item in items else None,
               "UnitAddAbility": lambda unit, marker: abilities.__setitem__(marker, 1),
               "SetUnitAbilityLevel": lambda unit, marker, level: abilities.__setitem__(marker, level),
               "IsUnitType": lambda unit, kind: melee, "UNIT_TYPE_MELEE_ATTACKER": "melee",
               "SetUnitState": set_speed, "GetUnitState": lambda unit, state: speed,
               "ConvertUnitState": lambda value: value}
        execute(function("main/f232/f0"), [env], ("owner", "summon"))
        return [round(speed, 5), abilities]

    source_birth = {
        "threeColorsPlusBases": birth({"i240", "i242", "i243", "i251", "i254"}, True),
        "twoTiersSameColor": birth({"i247", "i253"}, False),
    }
    assert source_birth == {"threeColorsPlusBases": [2.7, {"T085": 1, "T086": 2, "T087": 3, "T201": 2}],
                            "twoTiersSameColor": [1.4, {"T087": 2}]}

    def drop(item, remaining):
        writes = []
        env = {"GetManipulatingUnit": lambda: "owner", "GetManipulatedItem": lambda: "item",
               "GetItemTypeId": lambda handle: item, "IsInTable": lambda *args: -1, "ignore_strong_item": {},
               "IsWorker": lambda unit: False, "IsBOX": lambda unit: False, "GetId": lambda id: id,
               "HasItem": lambda owner, target: target if target in remaining else None,
               "Has_A_Item": lambda unit: False, "GetCountAndTypeByItemID": lambda iid: ("", 0),
               "GetUnitAbilityLevel": lambda unit, ability: int(ability == "A125"),
               "GetUnitUserData": lambda unit: 1, "DeLuYi_XiongLingHuoBan": {1: "bear"},
               "ConvertUnitState": lambda key: key, "GetUnitState": lambda unit, stat: 1.4,
               "SetUnitState": lambda unit, stat, new: writes.append([unit, stat, round(new, 5)])}
        execute(function("main/f285/f18"), [env, {}])
        return writes

    source_drop = {"missingBaseBlessingRemoval": drop("i240", set()),
                   "blueTierOneLeavesWhileTierTwoRemains": drop("i247", {"i253"}),
                   "lastBlueTier": drop("i247", set()), "lastGem": drop("i242", set())}
    assert source_drop == {"missingBaseBlessingRemoval": [], "blueTierOneLeavesWhileTierTwoRemains": [["bear", 81, 1.1]],
                           "lastBlueTier": [["bear", 81, 1.0]], "lastGem": [["bear", 81, 1.2]]}
    per_item = {"i240": 30, "i242": 20}
    per_item.update((item, 50) for group in TIERS.values() for item in group)
    loadouts = [("i247", "i253"), ("i240", "i240", "i242", "i243", "i249", "i252")]
    selected_birth = [sum(per_item[item] for item in loadout) for loadout in loadouts]
    assert selected_birth == [100, 230]
    original_red = []
    env = {"IsUnitType": lambda unit, kind: True, "UNIT_TYPE_MELEE_ATTACKER": "melee",
           "GetId": lambda value: value, "GetUnitAbilityLevel": lambda unit, ability: int(ability == "T085"),
           "ConvertUnitState": lambda state: state, "GetUnitState": lambda unit, state: 100 if state == 32 else 0,
           "GetUnitTypeId": lambda unit: unit, "GetUnitX": lambda unit: 10, "GetUnitY": lambda unit: 20,
           "UnitDamagePoint": lambda unit, delay, radius, x, y, amount, *args: original_red.append(round(amount, 6))}
    japi = {"GetEventDamage": lambda index: 100, "EXSetEventDamage": lambda damage: original_red.append(damage)}
    for target in ("mob", "m998"):
        execute(function("main/f232/f1"), [japi, env], ("summon", "owner", target))
    assert original_red == [0, 96, 0, 32]

    armor = lambda a: 1 / (1 + Fraction(18, 1000) * a)
    root_damage = Fraction(100)
    child_base = root_damage / armor(100) * Fraction(4, 5)
    selected_red = [child_base * armor(target_armor * Fraction(7, 10)) for target_armor in (100, 200)]
    assert child_base == 224 and selected_red == [Fraction(11200, 113), Fraction(700, 11)]
    # Snapshot is scoped to the owner and actual bear, then keyed by effective item instance.
    tracked = {"birth-blessing": 30, "birth-blue": 50}
    selected_rate = 180
    drop_steps = []
    for instance in ("picked-later", "birth-blessing", "birth-blessing", "birth-blue"):
        selected_rate -= tracked.pop(instance, 0)
        drop_steps.append(selected_rate)
    assert drop_steps == [180, 150, 150, 100]
    return {"birth": source_birth, "drop": source_drop,
            "Q64PerItemBirthCheck": {"inventories": loadouts, "additiveAttackSpeedPct": selected_birth},
            "Q70RemoveRealizedInstanceContributionPct": drop_steps,
            "redArmorSourceWritesAndChildRaw": original_red,
            "Q64RedSeparateArmorCases": {"parentDamage": 100, "parentArmor": 100, "childRaw": 224,
                                          "childTargetArmor": [100, 200],
                                          "childDamage": [float(value) for value in selected_red]}}


def report(db):
    rows = profiles(db)
    return {"baselineId": "item-summon-contracts-batch-01",
            "coverage": {"itemComponents": len(rows), "equipmentComponentAliases": 0, "auxiliaryMarkers": 4},
            "items": rows,
            "birthAttackSpeed": {"policy": "Q64 each actual equipped item contributes once", "contractTier": "highest per color",
                                 "ordinaryExistingSummonsRecalculateOnPickup": False},
            "bearDrop": {"decision": "Q70", "sourceWrongItemId": "i247", "correctBaseBlessingItemId": "i240",
                          "basis": "only withdraw the contribution applied to this bear's item instance at birth",
                          "withdrawOnce": True, "reapplyOnPickup": False},
            "redArmor": {"decision": "Q64", "parent": "reverse only the recorded actual parent armor factor then zero damage",
                          "child": "apply red ignore to positive armor per child target once at B03",
                          "splitFoldAtPrimarySpecialType": ["m998", "m999"]},
            "sourceLines": {"birth": [125445, 125916], "attack": [125917, 126170], "summonDispatch": 173119,
                            "damageDispatch": 162636, "bearDrop": [147380, 147619]},
            "existingRules": ["ward-summons", "spirit-bear", "summon-family-batch-01", "attack-timing", "item-lifecycle", "Q55"],
            "verification": probes(db)}


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
    print(data["coverage"], "2 birth, 4 drop and 2 red-splash bytecode paths passed")


if __name__ == "__main__":
    main()
