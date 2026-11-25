#!/usr/bin/env python3
"""Auditable fields, source dispatch and native adaptation for mainline monsters."""
from contextlib import closing
from math import floor, isclose
import json
import runpy
import sys

import audit_index as source

OUT = source.ROOT / "docs/rules/npc-mainline-abilities-01.json"
PROFILE = source.ROOT / "reference/map-6.25/units_campaignabilitystrings.txt"
HOSTS = dict(zip((f"N{n}" for n in range(511, 523)),
                 (f"m{n:03}" for n in (10, 15, 17, 20, 22, 25, 26, 28, 32, 33, 35, 37))))
WEB = {
    "N508": {"range": 1500, "moveRatio": .3, "attackSpeed": 0, "buff": "B025",
             "grant": {"mode": 1, "predicate": "N534>0 && SAPPER", "individual": 8, "teamUniform": [7, 8]}},
    "N511": {"range": 450, "cap": 10, "cost": 100, "cooldown": 30, "castPoint": .5,
             "T032": {"rank": 1, "lifetime": 1, "armor": 9999, "duration": 2.5, "buff": "B011"}},
    "N512": {"onCost": 10, "cooldown": 0, "maxFraction": .9, "absorbedPerMana": 2, "buff": "BNms",
             "application": "after typing and resistance, before mutable B03", "keepToggleAtZero": True},
    "N513": {"cost": 0, "cooldown": 10, "duration": 6, "moveRatio": .8, "attackSpeed": 0,
             "incomingMultiplier": 1.3, "buff": "B020"},
    "N514": {"cost": 100, "cooldown": 20, "castPoint": .5, "healthRatioLt": .4, "range": 1000,
             "directDamage": 0, "control": [1.8, 1.2], "buff": "BPSE", "includeInvulnerable": True},
    "N515": {"cost": 100, "cooldown": 20, "duration": .5, "castPoint": 0, "buff": "Bpsh",
             "interruptNewEventsOnly": True, "breakIncomingTargetLock": True},
    "N516": {"factor": 300, "writeIfAtMost": 600, "damageStage": "live B03 at original PC2816"},
    "N517": {"cost": 200, "cooldown": 12, "range": 800, "castPoint": .3, "armor": 40, "duration": 10,
             "counterHitDuration": 1, "counterHitMoveMultiplier": .5, "counterHitAttackSpeed": -.25, "buff": "BUfa"},
    "N518": {"cost": 200, "cooldown": 10, "castPoint": 0, "fade": .8, "duration": 20, "moveRatio": .1,
             "breakDamage": 0, "buff": "BOwk"},
    "N519": {"cost": 200, "cooldown": 10, "castPoint": .3, "range": 800, "duration": 8, "attackRatio": -.5,
             "armor": 0, "buff": "B023", "maxAttemptsPerDamageEvent": 1},
    "N520": {"cost": 200, "cooldown": 10, "castPoint": .3, "range": 800, "duration": 8,
             "attackSpeed": 0, "moveRatio": .5, "modelMultiplier": 1.2, "buff": "Bblo"},
    "N521": {"damageStrictlyAboveLife": True, "firstSetsLife": False, "activeSetsLife": 1,
             "causeBypass": "q025", "duration": 6, "tick": 1, "T045MaxTargets": 0},
    "N522": {"cost": 300, "cooldown": 5, "castPoint": .3, "dispatchRangeExclusive": 800,
             "range": 900, "radius": 20, "damage": 0, "visualMissiles": 1, "visualEffectDuration": .1,
             "visualMissileSpeed": 700, "control": [1, .5], "includeInvulnerable": True, "buff": "BNcs"},
}
DISPATCH = {
    "N511": ("main/f291/f1", 2675, "taunt"), "N513": ("main/f291/f1", 2689, "berserk"),
    "N514": ("main/f291/f1", 2710, "stomp"), "N515": ("main/f291/f1", 2805, "phaseshift"),
    "N516": ("main/f291/f1", 2816, "N516_Action"), "N517": ("main/f291/f1", 2831, "frostarmor"),
    "N518": ("main/f291/f1", 2854, "windwalk"), "N519": ("main/f291/f1", 2865, "N519_Action"),
    "N520": ("main/f291/f1", 2894, "bloodlust"), "N521": ("main/f291/f1", 3890, "N521_Action"),
    "N522": ("main/f291/f1", 2933, "clusterrockets"),
}
CHECK_FIELDS = {
    "N508": {"Area1": "range", "DataA1": "moveRatio", "BuffID1": "buff"},
    "N512": {"Cost1": "onCost", "DataA1": "absorbedPerMana", "DataB1": "maxFraction", "BuffID1": "buff"},
    "N513": {"DataA1": "moveRatio"}, "N514": {"Area1": "range"},
    "N517": {"DataA1": "duration", "DataB1": "armor", "Dur1": "counterHitDuration"},
    "N518": {"DataA1": "fade", "DataB1": "moveRatio"},
    "N519": {"DataA1": "attackRatio"}, "N520": {"DataB1": "moveRatio"},
    "N522": {"Area1": "radius", "DataC1": "visualMissiles", "DataF1": "visualEffectDuration"},
}
MISSING = {
    "N508": ["DataB1"], "N511": ["Area1", "DataA1"], "N512": ["Cool1"], "N513": ["Cost1", "DataB1"],
    "N514": ["DataA1"], "N516": ["DataA1", "DataB1"], "N518": ["DataC1"], "N519": ["DataB1"],
    "N520": ["DataA1"], "N521": ["DataA1", "DataB1"], "N522": ["DataA1"],
    "T032": ["Cost1", "DataA1"], "T045": ["DataA1"],
}


def group_profiles(keys):
    result = {}
    key = None
    for number, line in enumerate(PROFILE.read_text().splitlines(), 1):
        if line.startswith("["):
            key = line[1:-1]
            if key in keys:
                result[key] = {"line": number}
        elif key in keys and "=" in line:
            field, value = line.split("=", 1)
            if field in ("Name", "Order", "Tip", "Ubertip", "Researchubertip", "Missilespeed"):
                result[key][field] = value
    return result


def same(a, b):
    return isclose(a, b, abs_tol=1e-6) if isinstance(a, (int, float)) else a == b


def fields(db, key, table="units_abilitydata", names=None):
    record, = source.objects(db, key, table, fields=names)
    return record


def segment(db, name, lo, hi, *values):
    rows = source.instructions(db, name, lo, hi)
    constants = {c["value"] for row in rows for c in row["constants"].values()}
    assert set(values) <= constants, (name, lo, constants)
    return [rows[0]["sourceLine"], rows[-1]["sourceLine"]]


def load(db):
    all_ids = (*WEB, "T032", "T045")
    data = {key: fields(db, key) for key in all_ids}
    profiles = group_profiles(set(all_ids) | {obj["fields"]["code"] for obj in data.values()})
    results = {}
    for key in all_ids:
        obj = data[key]
        f = obj["fields"]
        assert f["levels"] == 1 and not source.objects(db, key, "war3map.w3a"), key
        assert all(k not in f for k in MISSING.get(key, ())), key
        record = {"status": "ready", "object": obj, "missing": MISSING.get(key, []),
                  "profile": profiles[key], "stockProfile": profiles[f["code"]],
                  "references": source.references(db, key)}
        if key in WEB:
            web = WEB[key]
            for field, name in ({"Cost1": "cost", "Cool1": "cooldown", "BuffID1": "buff",
                                 "Rng1": "range", "Dur1": "duration"} | CHECK_FIELDS.get(key, {})).items():
                if field in f and name in web and (key, field) not in {("N511", "Rng1"), ("N517", "Dur1")}:
                    assert same(f[field], web[name]), (key, field, f[field], web[name])
            record["web"] = WEB[key]
        if key in HOSTS:
            host = HOSTS[key]
            rows = source.workbook_rows(db, host, "主线波次")
            assert len(rows) == 2 and rows[0]["cells"] == rows[1]["cells"]
            assert rows[0]["row"] == rows[1]["row"] == int(host[1:]) + 4 and rows[0]["cells"][2] == host
            mount = fields(db, host, "units_unitabilities")
            assert key in mount["fields"]["abilList"].split(",") and mount["fields"]["auto"] == "_"
            cast = fields(db, host, "units_unitweapons", ["castpt", "castbsw"])
            if WEB[key].get("castPoint"):
                assert same(WEB[key]["castPoint"], cast["fields"]["castpt"]), key
            record.update(rows=rows, mount=mount, cast=cast)
        if key in DISPATCH:
            fn, pc, token = DISPATCH[key]
            record["dispatch"] = {"function": fn, "callPC": pc, "lines": segment(db, fn, pc-14, pc, token)}
        results[key] = record
    assert data["T032"]["fields"]["DataB1"] == 9999 and data["T032"]["fields"]["Dur1"] == 2.5
    assert data["T045"]["fields"]["Area1"] == 450 and "T045" in results["N521"]["mount"]["fields"]["abilList"].split(",")
    assert "至多10个" in results["N511"]["rows"][0]["cells"][14]
    assert "无用" in results["N516"]["rows"][0]["cells"][12] and "薄葬动作（无用）" in results["N521"]["rows"][0]["cells"][12]
    assert "疾风步隐身" in results["N518"]["rows"][0]["cells"][14]
    for key in ("N514", "N522"):
        assert WEB[key]["control"] == [data[key]["fields"][f] for f in ("Dur1", "HeroDur1")]
        assert "invulnerable" in data[key]["fields"]["targs1"].split(",")
    assert profiles["N522"]["Missilespeed"] == str(WEB["N522"]["visualMissileSpeed"])
    assert data["N513"]["fields"]["DataC1"] + 1 == WEB["N513"]["incomingMultiplier"]
    assert data["N520"]["fields"]["DataC1"] + 1 == WEB["N520"]["modelMultiplier"]
    assert fields(db, "Atau")["fields"]["Area1"] == WEB["N511"]["range"]
    for key in ("N508", "N517", "N518", "N522"):
        assert profiles[key]["Researchubertip"] == profiles[data[key]["fields"]["code"]]["Researchubertip"]
        assert profiles[data[key]["fields"]["code"]]["Ubertip"].startswith(profiles[key]["Ubertip"])
    for key in ("N513", "N515", "N519"):
        assert profiles[key]["Ubertip"] == profiles[data[key]["fields"]["code"]]["Ubertip"]
    spawn = source.references(db, "CheckAbiltity")
    assert {r["function"] for r in spawn if r["instruction"].startswith("gettabup")} == {"main/f294/f18", "main/f290/f9"}
    assert [r["pc"] for r in source.references(db, "N50")] == [110, 175]
    for pc in (3884, 3906):
        check, = source.instructions(db, "main/f291/f1", pc, pc)
        assert (check["op"], check["args"]) == ("lt", ["0", "r5", "r4"])
    ranges = {
        "N50 mainline pool 1–4": segment(db, "main/f294/f18", 91, 129, "Kill_Boss_Num", "IsBOSS", "N50"),

        "N508 grant": segment(db, "main/f294/f18", 141, 186, "UnitIsHero", "GAME_ENDLESS_TYPE",
                              .8, "N508", "N50", "GetRandomInt", 7, 8, "UnitAddAbility"),
        "N511 effect": segment(db, "main/f291/f14", 1718, 1729, "N511", "N511_Action"),
        "N521 first and active strict health gates": segment(db, "main/f291/f1", 3869, 3923,
                              "N521", "N521_Action", "N521_Unit", "q025", "EXSetEventDamage", "SetUnitState"),
    }
    return results, ranges, spawn


def probes(db):
    runtime = runpy.run_path(str(source.ROOT / "tools/audit-divine-books.py"))["runtime"](db)
    run, fn = runtime["execute"], runtime["function"]
    seen = []
    trace = []
    env = {"GetId": str, "GetTriggerUnit": lambda: "monster", "GetUnitLoc": lambda _: "point",
           "GetOwningPlayer": lambda _: 11, "CreateTempAndSetAbilityLv": lambda *args: trace.append(args) or "q001",
           "IssueImmediateOrder": lambda *args: trace.append(args),
           "IssueTargetOrder": lambda *args: trace.append(args) or False}
    run(fn("main/f172/f0"), [env])
    assert trace == [(11, "point", 0, "T032", 1, 1), ("q001", "innerfireoff"), ("q001", "innerfire", "monster")]
    seen.append("N511 creates level-one dummy and sends ordered commands")
    levels = {"monster": 1}
    env["GetUnitAbilityLevel"] = lambda unit, _: levels.get(unit, 0)
    trace.clear()
    run(fn("main/f294/f35"), [env], ("ordinary",))
    run(fn("main/f294/f35"), [env], ("monster",))
    assert trace == [("monster", "manashieldon")]
    seen.append("N512 spawn command requires the actual ability")
    state = {"damage": 100, "maxlife": 1000, "speed": 570}
    env.update(UNIT_STATE_MAX_LIFE="maxlife", GetUnitState=lambda _, key: state[key],
               GetUnitMoveSpeed=lambda _: state["speed"], math={"floor": floor},
               SetUnitMoveSpeed=lambda _, value: state.update(speed=value))
    japi = {"GetEventDamage": lambda _: state["damage"],
            "EXSetEventDamage": lambda value: state.update(damage=value)}
    run(fn("main/f185/f0"), [env, japi])
    assert state["speed"] == 600
    run(fn("main/f185/f0"), [env, japi])
    assert state["speed"] == 600
    seen.append("N516 exact 600 commits, further increment rejects whole write")
    trace.clear()
    life = {"friendly": 100, "death": 0, "buffed": 100, "first": 100, "better": 100}
    env.update(GetUnitX=lambda _: 0, GetUnitY=lambda _: 0, CreateGroup=list,
               GroupEnumUnitsInRange=lambda grp, *_: grp.extend(life),
               FirstOfGroup=lambda grp: grp[0] if grp else None, GroupRemoveUnit=list.remove,
               GroupClear=list.clear, DestroyGroup=lambda _: None, _loop_=lambda: lambda *_: True,
               IsUnitOwnedByPlayer=lambda unit, _: unit == "friendly", Player=lambda p: p,
               UNIT_STATE_LIFE="life", GetUnitState=lambda unit, _: life[unit],
               GetUnitAbilityLevel=lambda unit, _: int(unit == "buffed"))
    run(fn("main/f186/f0"), [env])
    assert trace == [("monster", "innerfire", "first")]
    seen.append("N519 skips own/dead/already-weak, does not retry on command rejection")
    trace.clear()
    env.update(GetUnitTypeId=str, AddArrAny=lambda table, value: table.update({1: value}) or 1,
               SetUnitVertexColor=lambda *args: trace.append(args), CreateTimer=lambda: "timer",
               UnitRemoveAbility=lambda *args: trace.append(args), CreateEffByUnit=lambda *_: "effect",
               TimerStart=lambda *args: trace.append(args[:3]), DestroyTimer=lambda t: trace.append(("destroy", t)),
               DestroyEffect=lambda effect: trace.append(("destroy", effect)))
    run(fn("main/f187"), [env], (lambda _mod: japi,))
    env["N521_Action"]("q025", "monster")
    assert state["damage"] == 100 and not env["N521_Unit"] and trace == [("monster", 255, 255, 255, 255)]
    seen.append("N521 q025 removes no ability, changes no damage and creates no timer")
    trace.clear()
    env["N521_Action"]("ordinary", "monster")
    assert state["damage"] == 0 and env["N521_Count"][1] == 6
    assert trace == [("monster", "taunt"), ("monster", 255, 255, 255, 100),
                     ("monster", "N521"), ("timer", 1, True)]
    seen.append("N521 first protection preserves taunt, alpha, remove, start order")
    env["N521_Count"][1] = 1
    env.update(GetExpiredTimer=lambda: "timer", IsInTable=lambda *_: 1,
               IsUnitType=lambda *_: False, UNIT_TYPE_DEAD="dead")
    env["N521_time"]()
    assert env["N521_Count"][1] == 0
    assert not env["N521_Unit"] and not env["N521_Timer"] and not env["N521_Eff"]
    assert trace[-3:] == [("destroy", "effect"), ("monster", 255, 255, 255, 255), ("destroy", "timer")]
    seen.append("N521 final periodic tick restores alpha and releases both handles")
    # Local shield spending is a new state boundary before the mutable dispatch.
    shield = WEB["N512"]
    absorbed = min(100 * shield["maxFraction"], 30 * shield["absorbedPerMana"])
    assert (100 - absorbed, 30 - absorbed / shield["absorbedPerMana"]) == (40, 0)
    seen.append("N512 insufficient mana spends only the absorption achieved")
    return seen


def main():
    with closing(source.connect()) as db:
        records, ranges, spawn = load(db)
        checks = probes(db)
    result = {"baseline": "npc-mainline-abilities-v1", "ready": 13, "pending": [],
              "mainlineHosts": 12, "auxiliary": ["T032", "T045"],
              "rules": "docs/rules/npc-mainline-abilities-01.md", "abilities": records,
              "instructionRanges": ranges, "N512Spawn": spawn, "checks": checks}
    generated = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if "--write" in sys.argv:
        OUT.write_text(generated)
    else:
        assert OUT.read_text() == generated, "Run this tool with --write to update the machine table"
    print(f"{len(WEB)} ready, {len(HOSTS)} hosts in both workbooks, 2 auxiliary, {len(checks)} targeted probes")


if __name__ == "__main__":
    main()
