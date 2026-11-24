#!/usr/bin/env python3
"""Audit eight item weapon effects using indexed objects and targeted bytecode execution."""

import argparse
from contextlib import closing
import itertools
import json
import runpy
import sys
import time

sys.dont_write_bytecode = True
import audit_index as source

OUT = source.ROOT / "docs/rules/item-weapon-effects-batch-01.json"
SHEET = "装备与道具"
ITEMS = {
    "i149": ("霜冻攻击", "普通攻击会降低目标移动速度", "main/f241/f0"),
    "i153": ("冰霜吐息", "360范围", "main/f242/f0"),
    "i173": ("连环闪电", "15%的概率", "main/f243/f1"),
    "i177": ("连环闪电", "25%的概率", "main/f243/f1"),
    "i186": ("腐蚀", "减少目标25点护甲", "I202"),
    "i188": ("腐蚀", "减少目标70点护甲", "I203"),
    "i204": ("万箭齐发", "最多10个敌人攻击一次", "main/f246/f0"),
    "i282": ("万箭齐发", "最多10个敌人攻击一次", "main/f246/f0"),
}


def probes(db):
    vm = runpy.run_path(str(source.ROOT / "tools/audit-divine-books.py"))["runtime"](db)
    execute, function = vm["execute"], vm["function"]
    checks = []

    def setup(module, rolled=(), low_item=False):
        trace, draws = [], iter(rolled)
        timers = itertools.count(1)
        def rand(low, high):
            value = next(draws)
            assert low <= value <= high
            trace.append(["roll", value])
            return value
        def register(table, value):
            index = next(i for i in itertools.count(1) if i not in table)
            table[index] = value
            return index
        def lookup(value, table):
            return next((key for key, entry in table.items() if entry == value), -1)
        def note(operation, returned=None):
            return lambda *args: trace.append([operation, *args]) or returned
        env = {"IsInTable": lookup, "AddArrAny": register, "GetId": lambda value: value, "GetRandomInt": rand,
               "CreateTimer": lambda: next(timers), "TimerStart": lambda timer, seconds, periodic, handler: trace.append(
                   ["timer", timer, seconds]),
               "DestroyTimer": note("destroyTimer"), "PauseTimer": note("pauseTimer"),
               "GetUnitLoc": lambda unit: "ownerPosition", "GetOwningPlayer": lambda unit: 2,
               "GetUnitUserData": lambda unit: 32, "SetUnitUserData": note("userData"),
               "CreateUnitAtLoc": note("createWeapon", "weapon"), "CreateTempAndSetAbilityLv": note("createTemp", "temp"),
               "IssueTargetOrder": note("order", True), "HasItem": lambda unit, item: "low" if low_item and item == "i173" else None,
               "ConvertUnitState": lambda index: index, "GetUnitState": lambda unit, index: {18: 111, 19: 22}[index],
               "SetUnitState": note("writeUnitState")}
        execute(function(module), [env], (None,))
        return env, trace

    for module, suffix, carrier in (("main/f241", "149", "q004"), ("main/f242", "153", "q005")):
        env, trace = setup(module)
        callback = env[f"i{suffix}_Action"]
        callback("attacker", "one")
        callback("attacker", "two")
        assert trace == [["timer", 1, 10], ["createWeapon", 2, carrier, "ownerPosition", 0],
                         ["order", "weapon", "attack", "one"], ["timer", 2, 1],
                         ["order", "weapon", "attack", "two"], ["pauseTimer", 2], ["timer", 2, 1]]
        checks.append({"name": f"{carrier} reused, lifetime unchanged; stop deadline restarts", "trace": trace})

    for low_item, rolls, expected_rank in ((True, (15,), 1), (False, (25,), 2), (True, (16,), None)):
        env, trace = setup("main/f243", rolls, low_item)
        env["i173_Action"]("attacker", "one")
        env["i173_Action"]("attacker", "two")
        assert trace[:2] == [["timer", 1, 0.1], ["roll", rolls[0]]]
        expected_tail = [] if expected_rank is None else [
            ["createTemp", 2, "ownerPosition", 0, "T048", expected_rank, 1],
            ["userData", "temp", 32], ["order", "temp", "chainlightning", "one"]]
        assert trace[2:] == expected_tail
        checks.append({"name": "shared chain lock, priority and exact probability", "rank": expected_rank, "trace": trace})

    env, trace = setup("main/f246", (25, 1))
    env["i204_Action"]("attacker", "one")
    env["i204_Action"]("attacker", "two")
    assert trace == [["roll", 25], ["timer", 1, 0.4],
                     ["createTemp", 2, "ownerPosition", 0, "T050", 1, 2, "q007"], ["userData", "temp", 32],
                     ["writeUnitState", "temp", 18, 133], ["order", "temp", "attack", "one"], ["roll", 1]]
    checks.append({"name": "q007 copies state18+state19; a blocked attempt still rolls", "trace": trace})
    return checks


def evidence(db):
    roles = {}
    for item, (effect, phrase, entry) in ITEMS.items():
        rows = [row for row in source.workbook_rows(db, item, SHEET) if row["cells"][1] == item]
        assert len(rows) == 2 and rows[0]["cells"][:8] == rows[1]["cells"][:8]
        assert phrase in rows[0]["cells"][7]
        row = rows[0]
        obj, = source.objects(db, item, "units_itemdata", fields=["abilList"])
        roles[item] = {"effect": effect, "componentReady": True, "entry": entry,
                       "cell": f"{SHEET}!H{row['row']}", "mounts": obj["fields"].get("abilList")}
    abilities = {}
    for alias in ("I202", "I203", "T046", "T047", "T048", "T050"):
        row, = source.objects(db, alias, "units_abilitydata")
        assert not source.objects(db, alias, "war3map.w3a")
        abilities[alias] = {"jsonIndex": row["jsonIndex"], **row["fields"]}
    assert [abilities[alias]["DataB1"] for alias in ("I202", "I203")] == [25, 70]
    assert all(abilities[alias]["Dur1"] == abilities[alias]["HeroDur1"] == 5 for alias in ("I202", "I203"))
    assert [abilities["T048"][key] for key in ("DataA1", "DataA2", "DataB1", "DataB2", "Area1", "Rng1")] == [
        1000, 2000, 5, 7, 600, 5000
    ]
    assert abilities["T050"]["DataC1"] == 8 and abilities["T050"]["Area1"] == 900
    weapons = {unit: source.objects(db, unit, "units_unitweapons")[0] for unit in ("q004", "q005", "q007")}
    assert weapons["q005"]["fields"]["Qarea1"] == 360 and weapons["q007"]["fields"]["rangeN1"] == 900
    assert all(not source.objects(db, unit, "war3map.w3u") for unit in weapons)
    checks = probes(db)
    # Q61/Q64 count includes the selected primary. The group has a closed spatial boundary.
    max_targets = 10
    eligible = sorted((unit for unit in [(n, 900) for n in range(2, 16)] + [(1, 900.001)]
                       if unit[1] <= abilities["T050"]["Area1"]))
    volley = [20, *(n for n, _ in eligible[:max_targets - 1])]
    assert volley == [20, *range(2, 11)] and len(set(volley)) == max_targets
    return {
        "baselineId": "item-weapon-effects-batch-01", "scope": "Eight selected item weapon components, no whole-item claim",
        "coverage": {"uniqueItems": 8, "weaponComponentsReady": 8, "weaponComponentsRemaining": 0,
                     "mountedAliasesInScope": 2, "auxiliaryAliasesInScope": 4},
        "items": roles, "abilityObjects": abilities, "weaponObjects": weapons,
        "webRules": {
            "frost": {"i149": "single unit", "i153": "360 closed radius", "carrierDamage": 0,
                      "movementFactor": 0.6, "attackSpeedContribution": -0.6, "duration": 3, "heroDuration": 2},
            "chain": {"attemptLock": 0.1, "precedence": ["i173", "i177"], "noPostRollRetry": True,
                      "eachImpact": [1000, 2000], "maxDistinctUnits": [5, 7],
                      "jumpRadius": 600, "firstRange": 5000, "falloff": 0},
            "corrosion": {"penalties": [-25, -70], "seconds": 5, "buff": "B032",
                          "sameAttackOrbRule": "one strongest eligible corrosion", "dispel": False},
            "barrage": {"sourceMaxTargets": 8, "webMaxTotalIncludingPrimary": max_targets, "volleysPerProc": 1,
                        "chancePct": 25, "successLock": 0.4, "carrierLifetime": 2, "radius": 900,
                        "maximumSecondaryRawDamage": abilities["T050"]["DataB1"]},
        },
        "verification": {"originalScriptProbes": checks, "Q61Q64BarrageSelection": {"volleyCount": 1, "targets": volley}},
        "originalClientTested": False,
    }


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
        assert OUT.read_text() == rendered
    print(f"{report['coverage']}; 6 source and 1 Web probes passed; indexed verification {elapsed:.2f} ms")


if __name__ == "__main__":
    main()
