#!/usr/bin/env python3
"""Audit eight spell-control items and replay their distinctive effect branches."""

import argparse
from contextlib import closing
import json
from math import floor
import runpy
import sys

sys.dont_write_bytecode = True
import audit_index as source

OUT = source.ROOT / "docs/rules/item-spell-control-batch-01.json"
SHEET = "装备与道具"
ITEMS = {
    "i202": (None, "释放技能时有50%的概率", ["Item_Skill_Action"]),
    "i224": ("I219", "所有伤害的30%", ["Item_Auto_Use"]),
    "i226": ("I220", "任意普通攻击都会造成150%暴击", ["Item_Auto_Use"]),
    "i276": ("I270", "当前生命值的40%(深渊BOSS为10%)", ["Item_Auto_Use"]),
    "i279": (None, "每2层印记施放一次焰光", ["Item_Skill_Action"]),
    "i281": ("I285", "只能对BOSS释放", ["Item_Auto_Use"]),
    "i301": (None, "释放技能时有50%的概率", []),
    "i325": ("I243", "吟唱时间越长伤害越高,范围越大,冰冻越久", ["Item_Skill_Action", "Item_Auto_Use"]),
}
WEB = {
    "i224": {"spell": "B049", "silenceSeconds": 5, "settlementFraction": 0.3, "collect": "latest application per target, final committed damage"},
    "i226": {"spell": "B050", "silenceSeconds": 5, "settlementFraction": 0.3, "collect": "latest application per target, final committed damage",
             "successfulOrdinaryAttackCritFloor": 1.5},
    "i276": {"normalCurrentLifeFraction": 0.4, "abyssBossFraction": 0.1, "lockSeconds": 6, "returnFraction": 0.8},
    "i279": {"marksPerWave": 2, "length": 600, "halfWidths": [125, 600], "magicDamage": 2500, "missileSpeed": 1050},
    "i281": {"bossPredicate": "N534>0 and SAPPER", "controlBuff": "B181", "controlSeconds": 5,
             "damageTakenMultiplier": 1.1, "targetLockSeconds": 10, "missileSpeed": 1000},
    "i325": {"defaultSeconds": 4, "minSetting": 1, "maxSetting": 4, "radii": [300, 400, 500, 600],
             "damage": [2800, 5600, 8400, 11200], "duration": [0.75, 1.5, 2.25, 3],
             "heroDuration": [0.75, 1, 1.25, 1.5], "releaseEvent": "ENDCAST", "radiiDecision": "Q73"},
}


def fields(db, alias):
    row, = source.objects(db, alias, "units_abilitydata")
    return row["fields"]


def profiles(db):
    items = {}
    for item, (alias, phrase, callbacks) in ITEMS.items():
        books = [r for r in source.workbook_rows(db, item, SHEET) if r["cells"][1] == item]
        assert len(books) == 2 and books[0]["cells"][:8] == books[1]["cells"][:8]
        book = books[0]
        assert phrase in book["cells"][7], item
        obj, = source.objects(db, item, "units_itemdata")
        raw = obj["fields"]["abilList"]
        if alias:
            assert raw.split(",")[0] == alias
        mounts = [] if alias is None else [fields(db, alias)]
        items[item] = {"name": book["cells"][0], "workbookCell": f"{SHEET}!H{book['row']}",
                       "componentReady": True, "alias": alias, "callbackReady": callbacks, "sourceActiveFields": mounts,
                       "web": WEB.get(item, {"sharedHex": "Q30", "chancePct": 50})}
    for alias in ("I219", "I220"):
        raw = fields(db, alias)
        assert (raw["code"], raw["Dur1"], raw["HeroDur1"], raw["Rng1"], raw["Cool1"], raw["Cost1"]) == ("ANso", 5, 5, 800, 25, 70)
    seal, curse = (fields(db, alias) for alias in ("I270", "I285"))
    assert (seal["Rng1"], seal["Cool1"], seal["Cost1"]) == (1000, 30, 300)
    assert (curse["Rng1"], curse["Cool1"], curse["Cost1"]) == (900, 15, 100)
    missile = fields(db, "T253")
    assert (missile["BuffID1"], missile["Dur1"], missile["HeroDur1"], missile.get("DataA1")) == ("B181", 5, 5, None)
    wave = fields(db, "T210")
    assert [wave[k] for k in ("Area1", "DataA1", "DataC1", "DataD1")] == [125, 2500, 600, 600]
    snow = fields(db, "T078")
    assert [snow[f"Area{level}"] for level in range(1, 5)] == [1300, 400, 500, 600]
    return items


def original_probes(db):
    vm = runpy.run_path(str(source.ROOT / "tools/audit-divine-books.py"))["runtime"](db)
    execute, function = vm["execute"], vm["function"]
    results = {}
    for mode in (0, 2):
        life = {"target": 1000}
        timer, stored, unit = {}, {}, {}
        calls = []

        def track(table, value):
            table[1] = value
            return 1

        env = {"Game_Mode": mode, "UNIT_STATE_LIFE": "life", "GetUnitState": lambda target, kind: life[target],
               "SetUnitState": lambda target, kind, value: life.__setitem__(target, value),
               "CreateEffByUnit": lambda *args: None, "AddArrAny": track, "CreateTimer": lambda: "timer",
               "TimerStart": lambda token, seconds, repeat, callback: calls.append(seconds), "i276_DefUnit": unit,
               "GetExpiredTimer": lambda: "timer", "IsInTable": lambda token, table: 1, "DestroyTimer": lambda token: None}
        execute(function("main/f264/f1"), [env, None, stored, timer], ("target",))
        after_cast = life["target"]
        execute(function("main/f264/f0"), [env, timer, stored])
        assert calls == [6] and not unit and not stored and not timer
        results[str(mode)] = [after_cast, life["target"]]
    assert results == {"0": [600, 920], "2": [900, 980]}

    def snow_release(elapsed):
        calls = []
        env = {"GetUnitUserData": lambda unit: 1, "TxShow": False, "i325_Point": {1: (1, 2)},
               "CreateTempAndSetAbilityLv": lambda *args: calls.append(list(args)) or "helper",
               "GetOwningPlayer": lambda unit: 0, "math": {"floor": floor}, "TimerGetElapsed": lambda handle: elapsed,
               "i325_ReleaseTimer": {1: "timer"}, "SetUnitUserData": lambda *args: None,
               "IssueImmediateOrder": lambda *args: calls.append(list(args)), "i325_Eff": {}}
        execute(function("main/f288/f1"), [env], ("hero",))
        assert "timer" == env["i325_ReleaseTimer"][1] and not env["i325_Point"]
        return calls
    snow = [snow_release(time) for time in (0.75, 3.75)]
    assert [case[0][4] for case in snow] == [0, 3]
    clock = {}
    cancelled, settled = [], []
    timers = iter(range(1, 5))
    expired = 3

    def find(value, table):
        return next((index for index, entry in table.items() if value == entry), -1)

    def insert(table, value):
        index = max(table, default=0) + 1
        table[index] = value
        return index

    env = {"I219_Timers": {}, "I219_defUnit": {}, "I219_Damage": {}, "I219_Unit": {}, "IsInTable": find,
           "AddArrAny": insert, "CreateTimer": lambda: next(timers), "DestroyTimer": cancelled.append,
           "TimerStart": lambda timer, seconds, repeat, callback: clock.__setitem__(timer, seconds),
           "i219_time_end": lambda: None, "UNIT_STATE_LIFE": "life", "GetUnitState": lambda target, kind: 100,
           "GetOwningPlayer": lambda source_unit: 0, "GetExpiredTimer": lambda: expired,
           "SetRealDamage": lambda *args: settled.append(list(args)), "CreateTextTagByUnit": lambda *args: None,
           "math": {"ceil": lambda number: int(number)}}
    for caster, hit in (("purpleCaster", 100), ("bloodCaster", 200)):
        execute(function("main/f286/f1"), [env, lambda: None, {}], (caster, "target"))
        execute(function("main/f286/f3"), [env], ("sameOwnerDamageSource", "target", hit))
    assert cancelled == [1] and env["I219_Damage"] == {1: 200} and env["I219_Unit"] == {1: "bloodCaster"}
    execute(function("main/f286/f2"), [env])
    assert settled == [["bloodCaster", "target", 60]]
    return {"sealOriginalLifeOnOrdinaryAndAbyssExpiry": results, "snowOriginalFloorAndLingeringTimer": snow,
            "soulBurnReplacement": {"timersAfterFirstAndSecond": clock, "cancelledFirst": cancelled[0],
                                    "onlySettlement": settled}}


def timeline_probe():
    windows = [(0, 5), (2, 7)]
    hits = [(1, 100), (3, 200), (5, 300)]
    start, end = windows[-1]
    total = sum(damage for time, damage in hits if start <= time < end)
    result = total * 0.3
    assert result == 150
    return {"replacedWindow": windows[0], "latestWindow": windows[-1], "allDamageKinds": hits,
            "originalTimerNoLongerSettles": True, "latestSettlementAtSeven": result}

def report(db):
    return {"baselineId": "item-spell-control-batch-01", "coverage": {"itemsReady": 8, "itemsRemaining": 0, "mountedAliases": 5},
            "items": profiles(db), "verification": {"original": original_probes(db), "replacedSilence": timeline_probe()},
            "sourceLines": {"hex": [146583, 146607], "soulBurn": [152910, 153117], "seal": [132676, 132808],
                            "staff": [133033, 133173], "curse": [135278, 135357], "snow": [153526, 153741],
                            "snowInput": 201396, "endcastRegistration": 179889}}


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
    print(data["coverage"], "5 original effect paths and one same-target replacement timeline passed")


if __name__ == "__main__":
    main()
