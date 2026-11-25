#!/usr/bin/env python3
"""Verify six actual item summon mounts and replay their distinct creation branches."""

import argparse
from contextlib import closing
import json
import runpy
import sys

sys.dont_write_bytecode = True
import audit_index as source

OUT = source.ROOT / "docs/rules/item-summons-batch-01.json"
SHEET = "装备与道具"
BOOKS = {f"i19{tier+2}": (f"I20{tier+3}", f"b{tier+106}", f"N12{tier+2}")
         for tier in range(1, 5)}
MIRRORS = {"i272": ("I266", "T165", 0.5, 2, 100), "i274": ("I267", "T166", 0.3, 1, 60)}


def indexed_fields(db, id, table):
    row, = source.objects(db, id, table)
    return row["fields"]


def item_profiles(db):
    items = {}
    for item, (alias, *_) in {**BOOKS, **MIRRORS}.items():
        books = [r for r in source.workbook_rows(db, item, SHEET) if r["cells"][1] == item]
        assert len(books) == 2 and books[0]["cells"][:8] == books[1]["cells"][:8]
        book = books[0]
        fields = indexed_fields(db, item, "units_itemdata")
        expected_group = "I207" if item in BOOKS else "I266"
        assert fields["abilList"].split(",")[0] == alias and fields["cooldownID"] == expected_group
        assert fields["usable"] == 1 and fields.get("uses") is None
        assert not source.objects(db, alias, "war3map.w3a")
        items[item] = {"alias": alias, "name": book["cells"][0], "workbookCell": f"{SHEET}!H{book['row']}",
                       "componentReady": True, "cooldownGroup": expected_group,
                       "catalogueDescription": book["cells"][7], "callbackReady": ["Item_Auto_Use"]}

    text = (source.ROOT / "reference/map-6.25/units_campaignabilitystrings.txt").open(encoding="utf-8-sig")
    with text:
        # Exactly four adjacent records in the already located ability tooltip excerpt.
        from itertools import islice
        excerpt = "".join(islice(text, 14435, 14479))
    for level, (item, (alias, spawn, multishot)) in enumerate(BOOKS.items(), 1):
        ability = indexed_fields(db, alias, "units_abilitydata")
        assert (ability["code"], ability["DataA1"], ability["DataC1"], ability["Dur1"], ability["Cost1"],
                ability["Cool1"], ability["Area1"]) == ("AIfs", 1, spawn, 20, 10 + level * 20, 25, 10)
        assert ability.get("DataB1") is None and "死灵弓箭手的攻击力与英雄智力有关" in items[item]["catalogueDescription"]
        weapon = indexed_fields(db, spawn, "units_unitweapons")
        unit_balance = indexed_fields(db, spawn, "units_unitbalance")
        assert indexed_fields(db, spawn, "units_unitabilities")["abilList"] == f"Avul,{multishot}"
        arrow = indexed_fields(db, multishot, "units_abilitydata")
        assert (arrow["code"], arrow["DataC1"], arrow["Area1"], arrow["Cool1"], arrow["DataB1"]) == ("Aroc", level, 900, 2, 9999999)
        raw_tooltip = excerpt.split(f"[{multishot}]")[1].split("\n\n")[0]
        assert f"Ubertip=同时攻击{level + 2}个目标。" in raw_tooltip and "Missilespeed=1200" in raw_tooltip
        items[item].update(mana=ability["Cost1"], cooldown=25, nativeSummon=spawn, duration=20, intelligenceFactor=(level + 11) / 10,
                           unitHP=unit_balance["HP"], unitSpeed=unit_balance["spd"], weapon={
                               key: weapon[key] for key in ("dmgplus1", "dice1", "sides1", "cool1", "dmgpt1", "backSw1",
                                                            "rangeN1", "acquire", "atkType1", "targs1")},
                           multiShot={"alias": multishot, "sourceDataC": arrow["DataC1"], "webTotalTargets": level + 2,
                                      "radius": 900, "cooldown": 2, "secondaryBudget": 9999999, "speed": 1200})
    items["i196"]["detectionHelper"] = {"ability": "N031", "carrier": "q001", "duration": 20, "radius": 1000}

    for item, (alias, child, multiplier, count, mana) in MIRRORS.items():
        ability = indexed_fields(db, alias, "units_abilitydata")
        mirror = indexed_fields(db, child, "units_abilitydata")
        assert (ability["code"], ability["Cost1"], ability["Cool1"]) == ("ANcl", mana, 15)
        assert (mirror["code"], mirror["DataA1"], mirror["DataB1"], mirror["Dur1"]) == ("AIil", multiplier, 1, 7)
        assert f"制造{count}个你的幻象，继承本体{int(multiplier * 100)}%的攻击力" in items[item]["catalogueDescription"]
        items[item].update(nativeMirror=child, mana=mana, cooldown=15, count=count, duration=7, attackMultiplier=multiplier,
                           damageTakenMultiplier=1, transientAbility="T298", transientCondition="A225 > 0")
    assert indexed_fields(db, "T298", "units_abilitydata")["DataA1"] == 1000
    return items


def probes(db):
    vm = runpy.run_path(str(source.ROOT / "tools/audit-divine-books.py"))["runtime"](db)
    execute, function = vm["execute"], vm["function"]
    results = {}
    for item, fn, child, count, has_225 in (("i272", "main/f262/f0", "T165", 2, True),
                                           ("i274", "main/f263/f0", "T166", 1, False)):
        calls = []
        env = {
            "GetUnitUserData": lambda unit: 4, "GetUnitLoc": lambda unit: "point", "GetId": lambda id: id,
            "GetUnitAbilityLevel": lambda unit, ability: int(has_225), "GetOwningPlayer": lambda unit: "player",
            "UnitAddAbility": lambda unit, id: calls.append(["add", unit, id]),
            "UnitRemoveAbility": lambda unit, id: calls.append(["remove", unit, id]),
            "CreateTempAndSetAbilityLv": lambda *args: calls.append(["create", *args]) or "carrier",
            "SetUnitUserData": lambda unit, data: calls.append(["index", unit, data]),
            "IssueTargetOrderById": lambda carrier, order, target: calls.append(["order", carrier, order, target]),
        }
        execute(function(fn), [env], ("hero",))
        expected = [["create", "player", "point", 0, child, 1, 1], ["index", "carrier", 4],
                    *([["order", "carrier", 852274, "hero"]] * count)]
        if has_225:
            expected = [["add", "hero", "T298"], *expected, ["remove", "hero", "T298"]]
        assert calls == expected, (item, calls)
        results[item] = calls

    inherited_attack = []
    for spawn in ("b107", "b110"):
        state = {"S18": 90}
        env = {
            "GetSummonedUnit": lambda: spawn, "GetSummoningUnit": lambda: "actualBearer",
            "GetUnitTypeId": lambda unit: unit, "GetId": lambda id: id,
            "GetHeroInt": lambda unit, include_bonus: 100 if (unit, include_bonus) == ("actualBearer", True) else 0,
            "GetUnitState": lambda unit, s: state["S18"], "ConvertUnitState": lambda s: s,
            "SetUnitState": lambda unit, s, v: state.__setitem__("S18", v),
        }
        execute(function("main/f231/f0"), [env])
        inherited_attack.append(state["S18"])
    assert inherited_attack == [210, 240]
    return {"issuedMirrorCommands": results, "necromancerS18Base90Int100": inherited_attack}


def report(db):
    rows = item_profiles(db)
    return {"baselineId": "item-summons-batch-01", "coverage": {"aliasesReady": 6, "aliasesRemaining": 0,
                                                               "uniqueItems": 6, "auxiliaryAliases": 8},
            "items": rows,
            "sourceLines": {"maxBookDetection": 128293, "intelligenceSetter": 125361, "summonDispatch": 173119,
                            "mirrorAxe": 132494, "mirrorDagger": 132601, "autouse": 147853},
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
    print(data["coverage"], "4 original bytecode paths passed")


if __name__ == "__main__":
    main()
