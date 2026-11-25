#!/usr/bin/env python3
"""Confirm eight legacy skills and replay the complete Omnislash sequence."""

import argparse
from contextlib import closing
import json
import runpy
import sys

sys.dont_write_bytecode = True
import audit_index as source

OUT = source.ROOT / "docs/rules/legacy-skill-attack-batch-01.json"
BASE = [297, 338, 389, 445, 534, 694]
ITEMS = {
    "A002": ("AUav", [46, 76], "skill-requiem", "soul state; no additional native life steal"),
    "A023": ("AHad", [191, 452], "combat-and-skills", "attack start; no additional native armor aura"),
    "A026": ("AHad", [31, 56], "combat-and-skills", "resolved attack / Q26; no additional native armor aura"),
    "A045": ("ANcl", [162, 197, 242], "legacy-skill-attack-batch-01", "complete target, interval, hit and end sequence"),
    "N068": ("Awar", [776], "native-area-damage", "no additional native Pulverize damage"),
    "N069": ("Awar", [779], "native-area-damage", "no additional native Pulverize damage"),
    "N070": ("Awar", [782], "native-area-damage", "no additional native Pulverize damage"),
    "N071": ("Awar", [785], "native-area-damage", "no additional native Pulverize damage"),
}


def field(db, alias, family):
    row, = source.objects(db, alias, family)
    return row["fields"]


def profiles(db):
    result = {}
    for alias, (code, book_rows, reuse, scope) in ITEMS.items():
        rows = [r for r in source.workbook_rows(db, alias, "塔技能") if r["cells"][5] == alias]
        assert len(rows) == 2 * len(book_rows)
        for number in book_rows:
            local, original = [r["cells"] for r in rows if r["row"] == number]
            assert local == original, (alias, number)
        obj = field(db, alias, "units_abilitydata")
        assert obj["code"] == code
        if code == "Awar":
            assert obj["DataA1"] == 100 and not any(k.startswith(("DataB", "DataC", "DataD")) for k in obj)
        if code in ("AUav", "AHad"):
            assert not any(k.startswith("Data") for k in obj)
        if alias == "A045":
            assert all(all(f"{n}+最大攻击力" in r["cells"][8] for n in BASE) for r in rows)
            assert [obj[f"{k}1"] for k in ("Rng", "DataA", "DataB", "DataF", "targs")] == [
                500, 0.3, 1, "battlestations", "enemies,vulnerable"]
            for caster in ("H013", "G040", "G041"):
                assert field(db, caster, "units_unitweapons")["castpt"] == 0.3
            for shell in ("q002", "q020", "q021"):
                assert field(db, shell, "units_unitabilities")["abilList"] == "Avul,T012,Aloc"
                assert field(db, shell, "units_unitweapons").get("weapsOn", 0) == 0
        result[alias] = {"workbookRows": book_rows, "sourceCode": code, "scope": scope, "reuse": reuse,
                         "status": "ready"}
    return result


def slash_probes(db):
    vm = runpy.run_path(str(source.ROOT / "tools/audit-divine-books.py"))["runtime"](db)
    execute, function = vm["execute"], vm["function"]
    grant = False
    level, actor, first, current_hp = 1, "G040", "first", 1
    slots = {1: "hero"}
    trace, timer, deleted = [], {}, set()
    visible = {"first": True, "hidden": False, "next": True, "friendly": True, "dead": True}
    own = {"first": 11, "hidden": 11, "next": 11, "friendly": 0, "dead": 11, "hero": 0}
    position = {"hero": (5, 5), "first": (10, 10), "next": (15, 15)}
    stats = {18: 100, 19: 50, 20: 152, 21: 162, 37: 0.5, 81: 1}
    def locate(v, d):
        return next((key for key, value in d.items() if value == v), -1)
    def note(kind):
        return lambda *args: trace.append([kind, *args])
    def create(kind, unit_type, x, y, facing):
        shell = f"{unit_type}-{len([row for row in trace if row[0] == 'create']) + 1}"
        own[shell] = kind
        position[shell] = (x, y)
        trace.append(["create", shell, x, y, facing])
        return shell
    def register(token, period, repeat, callback):
        timer[token] = callback
        trace.append(["schedule", token, period, repeat])
    def remove(unit):
        deleted.add(unit)
        trace.append(["remove", unit])
    def choose(low, high=None):
        trace.append(["random", low, high])
        return high if high is not None else 180
    def get_state(unit, state):
        if state == "LIFE":
            return 0 if unit in deleted or unit == "dead" else current_hp if unit == "hero" else 1
        return stats[state]
    def move(unit, place):
        position[unit] = place
        trace.append(["move", unit, list(place)])
    def add_group(group, x, y, radius, filt):
        assert radius == 500 and (x, y) in ((10, 10), (15, 15))
        group.extend(visible)
    def remove_member(group, unit):
        if unit is not None:
            group.remove(unit)
    env = {
        "GetId": lambda x: x, "GetTriggerUnit": lambda: "hero", "IsInTable": locate, "Tower_ALL": slots,
        "GetUnitAbilityLevel": lambda unit, alias: level if alias == "A045" else 1,
        "GetUnitState": get_state, "ConvertUnitState": lambda x: x, "UNIT_STATE_LIFE": "LIFE",
        "locX": 300, "locY": 600, "GetUnitTypeId": lambda unit: actor, "GetOwningPlayer": own.get,
        "CreateUnit": create, "RemoveUnit": remove, "DestroyTimer": lambda t: timer.pop(t, None),
        "CreateTimer": lambda: f"timer-{len([row for row in trace if row[0] == 'schedule'])+1}",
        "TimerStart": register, "GetUnitLoc": lambda unit: list(position[unit]), "SetUnitPositionLoc": move,
        "SetUnitFacing": note("face"), "GetRandomInt": choose, "Has_A_Item": lambda unit: grant,
        "SetRealDamagePoint": note("divine"), "SetPhyDamage": note("physical"),
        "Item_Attack_Action": note("itemDispatch"), "GetUnitX": lambda u: position[u][0],
        "GetUnitY": lambda u: position[u][1], "CreateEffAtLoc": note("effect"),
        "CreateEffByUnit": note("effect"), "SetUnitAnimation": note("animation"), "GetExpiredTimer": lambda: expired,
        "CreateGroup": list, "GroupEnumUnitsInRange": add_group, "_loop_": lambda: lambda *_: True,
        "FirstOfGroup": lambda group: group[0] if group else None, "GroupRemoveUnit": remove_member,
        "IsUnitOwnedByPlayer": lambda u, p: own.get(u) == p, "Player": int,
        "IsUnitVisible": lambda unit, player: visible[unit], "GroupClear": list.clear,
        "DestroyGroup": lambda *_: None, "Game_Mode": 0,
    }
    execute(function("main/f41"), [env])
    env["A045_Action"](first)
    assert trace[0] == ["create", "q020-1", 300, 600, 0]
    assert trace[1:3] == [["schedule", "timer-1", 0.5, True], ["schedule", "timer-2", 8.3, False]]
    assert ["physical", "hero", "first", 447] in trace
    grant, level = True, 6
    expired = "timer-1"
    timer[expired]()
    assert ["divine", "hero", 0, 200, 15, 15, 1688] in trace
    assert ["itemDispatch", "hero", "next"] in trace
    assert ["random", 1, 2] in trace
    stats[81] = 12
    actor = "G041"
    env["A045_Action"](first)
    assert "q020-1" in deleted and "q021-2" in own
    assert list(timer) == ["timer-3", "timer-4"]
    assert ["schedule", "timer-3", 0.1, True] in trace
    expired, current_hp = "timer-3", 0
    timer[expired]()
    assert not timer and "q021-2" in deleted
    current_hp = 1
    actor = "H013"
    grant = False
    env["A045_Action"](first)
    assert "q002-3" in own
    expired = "timer-6"
    timer[expired]()
    assert not timer and "q002-3" in deleted
    assert BASE[0] + stats[21] == 459 and BASE[-1] + stats[21] == 856
    return [row for row in trace if row[0] in ("create", "schedule", "physical", "divine", "itemDispatch", "remove")]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    with closing(source.connect()) as db:
        profiles_data, probes = profiles(db), slash_probes(db)
    slash_counts = [1 + (8_300_000 - 1) // interval for interval in (100_000, 500_000)]
    assert slash_counts == [83, 17]
    result = {"scope": "Eight existing legacy skill gaps", "skills": profiles_data,
              "A045": {"weaponMaximum": "S21 (Q64)", "originalWeaponSum": "S18+S19",
                       "baseDamage": BASE, "acceptRange": 500, "scanRadius": 500,
                       "duration": 8.3, "intervalMinimum": 0.1, "interval": "raw C/R snapshot at EFFECT",
                       "initialSlash": "immediate on accepted target", "scepterRadius": 200,
                       "scepterDamageType": "DIVINE", "scepterMultiplier": 2},
              "validation": {"originalSequence": probes, "webMaximumExamples": [459, 856],
                             "noInterruptionSlashCountsAt0.1And0.5": slash_counts}}
    output = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        assert OUT.read_text() == output, f"{OUT.name} differs"
    else:
        OUT.write_text(output)
    print("Eight skills and three Omnislash carriers audited. Original VM sequence and Web maximum boundaries passed.")


if __name__ == "__main__":
    main()
