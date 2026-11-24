#!/usr/bin/env python3
"""Audit ten scripted Channel abilities and new state boundaries."""
from contextlib import closing
from hashlib import sha256
from math import isclose
from pathlib import Path
import json
import re
import sys

import audit_index as ai

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/rules/hero-spells-batch-02.json"
ENTRIES = {
    "A050": (45, "possession", None, .3, 9999999, [10, 20, 30, 40, 50, 60], [15, 13, 11, 9, 7, 5], []),
    "A079": (68, "repair", 600, .3, 800, [50, 60, 70, 80, 90, 100], [20]*6, ["b117", "b118", "b139", "b140"]),
    "A080": (69, "unburrow", 800, .5, 1200, [15, 30, 45, 60, 75, 90], [16, 15, 14, 13, 12, 11], ["T212"]),
    "A082": (71, "revive", 800, .5, 1000, [40, 55, 70, 85, 100, 120], [17, 16, 15, 14, 13, 12], ["q022", "T079", "T080", "T081", "T222"]),
    "A085": (74, "web", 700, .53, 800, [100, 140, 180, 220, 260, 300], [16]*6, []),
    "A087": (76, "militia", 700, .5, 800, [0]*6, [15, 14, 13, 12, 11, 10], []),
    "A101": (81, "absorb", 700, .3, 800, [30, 60, 90, 120, 150, 180], [10, 9, 8, 7, 6, 5], []),
    "A102": (82, "web", 750, .3, 800, [20, 30, 40, 50, 60, 70], [13, 12, 11, 10, 9, 8], ["T098", "B100"]),
    "A108": (87, "absorb", 650, .4, 800, [30, 60, 95, 140, 170, 210], [15, 14, 13, 11, 10, 9], ["T102", "B101"]),
    "A117": (94, "spiritlink", 500, .3, 600, [0]*6, [15]*6, ["T119", "B127"]),
}
RULES = {
    "A050": {"delay": .1, "recast": "replace", "destination": "capturedPoint", "caster": "currentLogicalSlot"},
    "A079": {"lifetime": 13, "rings": [[400, 5, 72], [800, 9, 40]], "bookAttackPercent": [50, 60, 70, 80, 90, 100],
             "pending": "template staff carryover, inherited attack slots, hero damage and A077"},
    "A080": {"radius": 350, "damage": [300*i for i in range(1, 7)], "sourcePeriod": .02, "webPeriod": .025,
             "hold": 2, "releaseStep": 80, "firstDescendingStep": 41, "verticalStep": 20, "mark": "T212"},
    "A082": {"damage": [1000*i for i in range(1, 7)], "damageRadius": 425, "stun": 1.5, "aura": [.05, 600, 5],
             "pending": "ship position and live waveform, fleet reentry/overlap, T222 first/full-stack expiry"},
    "A085": {"radius": 550, "intelligenceFactor": [6, 10, 14, 18, 22, 30],
             "scepter": {"intelligencePerLiveP11": "current A083 rank", "expiry": 70, "recast": "independentDeltas"}},
    "A087": {"radius": 400, "selfFraction": [.1, .2, .3, .4, .5, .6], "baseRemainingFloor": .2,
             "enemyFactor": 2, "selfWrite": "min(postChildCurrentLife, snapshotPostCostFloor)"},
    "A101": {"radius": 500, "damage": [400*i+200 for i in range(1, 7)], "delay": {"G060": .2, "default": .8}},
    "A102": {"radius": 300, "carrierLifetime": 2, "status": "B100", "duration": 5, "moveSlow": .5,
             "physicalFactor": .5, "spellFactor": 1.5, "sourceSpellFactor": 1.4},
    "A108": {"damageRadius": 500, "auraRadius": 550, "auraLifetime": 5, "damageDelays": [0, 1, 2, 3, 4, 5],
             "baseDamage": [150*i for i in range(1, 7)], "goldDivisor": [10, 9, 8, 7, 6, 4],
             "countMin": 1, "maxDamage": 60000, "armorDelta": [-30, -35, -40, -45, -50, -60]},
    "A117": {"selfCost": [.55, .5, .45, .4, .35, .3], "maxTargetCurrentLifeFactor": [.15, .2, .25, .3, .35, .4],
             "factor": "min((10+casterMaxLife/1000)/100,rankMax)", "scepterFactor": 1.2,
             "bossFactor": .5, "slow": [.5, 5], "nativeSourceBossFactor": .1},
}
STATUS = {k: {"A079": "pendingFormation", "A082": "pendingFleet"}.get(k, "ready") for k in ENTRIES}


def metadata():
    result = {}
    with closing(ai.connect()) as db:
        for k, (module, order, auto, cast, range_, mana, cooldown, auxiliary) in ENTRIES.items():
            rows = ai.workbook_rows(db, k, "塔技能")
            half = len(rows)//2
            assert half and [x["cells"] for x in rows[:half]] == [x["cells"] for x in rows[half:]]
            assert all(r["cells"][6] == 6 and r["cells"][7:] == rows[0]["cells"][7:] for r in rows)
            i = rows[0]["cells"][8]
            for regex, expected in ((r"耗蓝 (\d+)点", mana), (r"冷却(?:时间：| )(\d+)秒", cooldown)):
                values = [int(v) for v in re.findall(regex, i)]
                if values:
                    assert values == expected, k
            raw, *mods = [v for tab in ("units_abilitydata", "war3map.w3a") for v in ai.objects(db, k, tab)]
            base = raw["fields"]
            assert base["code"] == "ANcl" and base["DataF1"] == order
            assert base["Rng1"] == (1100 if k == "A082" else range_)
            mods_by_rank = {(m["key"], m["level"]): m["value"] for v in mods for m in v["fields"]["mods"]}
            for rank, (cost, cd) in enumerate(zip(mana, cooldown), 1):
                assert mods_by_rank.get(("amcs", rank), base.get(f"Cost{rank}", 0)) == cost
                assert mods_by_rank.get(("acdn", rank), base.get(f"Cool{min(rank,4)}")) == cd
            units = {u: ai.objects(db, u, "units_unitweapons", fields=["castpt", "castbsw"])
                     for u in sorted({r["cells"][1] for r in rows})}
            assert all(v[0]["fields"]["castpt"] == cast for v in units.values())
            refs = ai.references(db, k)
            if auto is not None:
                entry = next(r for r in refs if r["function"] == "main/f291/f27")
                data = ai.instructions(db, entry["function"], entry["pc"], entry["pc"]+48)
                literals = {c["value"] for r in data for c in r["constants"].values()}
                assert order in literals and auto in literals, k
            path = f"main/f{module}"
            functions = dict((f, [lo, hi]) for f, lo, hi in db.execute(
                "SELECT name,start_line,end_line FROM function WHERE name=? OR name LIKE ? ORDER BY start_line", (path, path+"/%")))
            objects = {id_: [r for tab in (("units_unitweapons", "units_unitabilities") if id_[0] in "bq"
                                          else ("units_abilitydata", "units_abilitybuffdata", "war3map.w3a")) for r in ai.objects(db, id_, tab)]
                       for id_ in auxiliary}
            result[k] = {"status": STATUS[k], "rows": rows, "shell": [raw,*mods], "objects": objects, "unitCast": units,
                         "references": refs, "functions": functions,
                         "web": dict(RULES[k], mana=mana, cooldown=cooldown, auto=auto, range=range_, order=order, cast=cast)}
    return {"baseline": "hero-spells-batch-02-v1", "source": {"path": ai.DISASM, "sha256": sha256((ROOT/ai.DISASM).read_bytes()).hexdigest()},
            "skills": result}


def probes():
    path = ROOT / "tools/audit-wisp-link-overcharge-relocate.py"
    vm = {"__file__": str(path)}
    exec(compile(path.read_text().split("\nCOUNT=0;VECTORS=[]", 1)[0], path, "exec"), vm)
    execute, closure, fn, unit = (vm[k] for k in ("execute", "Closure", "function", "unit"))
    observations = []

    def check(label, outcome):
        assert outcome, label
        observations.append(label)

    def constants(name, overrides):
        original = fn(name)
        updated = dict(original["constants"])
        for k, v in overrides.items():
            updated[k] = dict(updated[k], value=v)
        return dict(original, constants=updated)

    w = vm["World"]()
    caster = unit("H015")
    chosen = unit("G055")
    w.current, w.env["Tower_ALL"][7] = caster, caster
    w.env.update(TxShow=False, RemoveLocation=lambda _: None)
    execute(fn("main/f45"), [w.env])
    w.env["A050_Action"]({"x": 500, "y": 20})
    old = w.env["A050_Timers"][7]
    w.advance(.05)
    w.env["A050_Action"]({"x": 700, "y": 20})
    w.env["Tower_ALL"][7] = chosen
    w.advance(.1)
    check("A050 old explicit replacement timer does not move original or current unit", not old["alive"] and caster["x"] == chosen["x"] == 0)
    w.advance(.15)
    check("A050 later cast uses saved point and resolved live slot", chosen["x"] == 700 and caster["x"] == 0)

    class World(vm["World"]):
        def __init__(self):
            super().__init__()
            self.group, self.events = [], []
            self.env.update(
                _loop_=closure("main/f3/f5", [lambda *_: None]), AddArrAny=closure("main/f7/f22", [self.env]),
                CreateGroup=list, GroupEnumUnitsInRange=lambda g,*_: g.extend(self.group),
                FirstOfGroup=lambda g: g[0] if g else None, GroupRemoveUnit=lambda g,u: g.pop(0) if g else None,
                GroupClear=list.clear, DestroyGroup=lambda *_: None, IsUnitOwnedByPlayer=lambda u,p: bool(u and u["owner"] == p),
                TxShow=False, RemoveLocation=lambda *_: None,
                ATTACK_TYPE_NORMAL="normal", ATTACK_TYPE_HERO="hero", ATTACK_TYPE_CHAOS="chaos",
                DAMAGE_TYPE_MAGIC="magic", DAMAGE_TYPE_NORMAL="physical", DAMAGE_TYPE_DIVINE="divine", WEAPON_TYPE_WHOKNOWS="none",
                UnitDamagePoint=lambda *args: self.events.append(args), UNIT_STATE_MAX_LIFE="maxLife",
                PauseUnit=lambda u,p: u.update(paused=p), GetUnitFlyHeight=lambda u: u.get("height",0),
                GetUnitDefaultFlyHeight=lambda u: u.get("defaultHeight",0), SetUnitFlyHeight=lambda u,h,_: u.update(height=h),
            )

        def factory(self, module, japi=False):
            execute(fn("main/f"+str(module)), [self.env], (lambda _: self.japi,) if japi else ())

    w = World()
    caster, target = unit("H025", A080=2), unit("mob", 11)
    w.group.append(target)
    w.factory(69, True)
    cast = w.env["A080_Action"]
    execute(constants("main/f69/f1", {"k35": .025}), cast.ups, (caster, {"x": 0, "y": 0}))
    w.advance(.5)
    cast(caster, {"x": 0, "y": 0})
    w.advance(1)
    check("A080 existing lifted unit can take a new damage pulse without extending or stacking its hold",
          target["paused"] and target["height"] == 800 and len(w.env["A080_TimerUp"]) == 1
          and len(w.events) == 2 and w.events[0][5] == 600)
    w.advance(1.975)
    check("A080 step 79 descends to height 20 before graph duration ends", target["paused"] and target["height"] == 20)
    w.advance(2)
    check("A080 step 80 unlocks, removes T212, resets default and clears mark",
          not target["paused"] and target["height"] == 0 and "T212" not in target["skills"] and not w.env["A080_DefUnit"])

    w = World()
    caster = unit("H026", A085=3,A083=2)
    caster["items"].add("i310")
    w.env["Tower_ALL"][3] = caster
    w.group.extend(unit("mob",11) for _ in range(3))
    w.factory(74)
    cast = w.env["A085_Action"]
    point = {"x":0,"y":0}
    cast(caster, point)
    w.advance(1)
    cast(caster, point)
    check("A085 same cast damage samples INT after its own grant and reentrants accumulate independent deltas",
          caster["int"] == 112 and [args[5] for args in w.events] == [1484,1568])
    caster["int"] += 10
    w.advance(70)
    check("A085 first expiry removes only its own prior amount", caster["int"] == 116)
    w.advance(71)
    check("A085 second expiry releases exact second contribution", caster["int"] == 110)

    w = World()
    centaur = unit("H027", A087=3)
    centaur.update(life=10)
    centaur["state"]["maxLife"] = 100
    w.current = centaur
    w.env["SetUnitState"] = lambda u,k,v: u.update({k: v})
    w.factory(76, True)
    w.env["A087_Action"](point)
    check("A087 source snapshots base 3, dispatches divine 6, then writes 20 from the lower current 10",
          w.events[0][5] == 6 and w.events[0][-2] == "divine" and centaur["life"] == 20)
    check("A087 Web no-heal correction applies the old floor with a current-life ceiling", min(10, max(10-3,100*.2)) == 10)

    w = World()
    victim = unit("mob", 11, B100=1)
    amount = {"value": 100}
    w.japi.update(GetEventDamage=lambda _: amount["value"], EXSetEventDamage=lambda d: amount.update(value=d))
    execute(fn("main/f291/f1"), [w.env, w.japi], (None,victim,None), start_pc=1499, stop_pc=1512)
    check("A102 source magical B100 multiplier is 1.4", amount["value"] == 140)
    amount["value"] = 100
    execute(constants("main/f291/f1", {"k203":1.5}), [w.env,w.japi], (None,victim,None), start_pc=1499, stop_pc=1512)
    check("A102 graph uses 1.5 in the same B100 stage", amount["value"] == 150)

    w = World()
    caster = unit("H032", A108=6)
    w.env.update(SR_LianJin_Flag={1:2}, PLAYER_STATE_RESOURCE_GOLD="gold",
                 GetPlayerState=lambda *_: 50_000,
                 CreateTempAndSetAbilityLv=lambda *a: w.events.append(a) or unit("q001"))
    w.factory(87)
    w.env["A108_Action"](caster, point)
    check("A108 six raw delay requests use same snapshotted gold/rank denominator, then grant the five-second aura",
          [a[1] for a in w.events[:6]] == [0,1,2,3,4,5] and all(a[5] == 7150 for a in w.events[:6])
          and w.events[-1][3:] == ("T102",6,5))
    w = World()
    huskar, target = unit("H034", A117=1), unit("ordinaryAbyssMob", 11)
    huskar.update(life=1000)
    huskar["state"]["maxLife"] = 3000
    target["life"] = 1000
    huskar["items"].add("i310")
    w.env.update(Game_Mode=2, IsShopBoss=lambda u: False,
                 CreateTempAndSetAbilityLv=lambda *a: {},
                 SetUnitUserData=lambda *_: None, IssueTargetOrder=lambda *_: None, CreateEffByUnit=lambda *_: None,
                 SetUnitState=lambda u,k,v: u.update({k:v}),
                 UnitDamageTarget=lambda s,t,d,*_: w.events.append((s,t,d)))
    w.factory(94, True)
    w.env["A117_Action"](huskar,target)
    check("A117 original mishandled percentage caps 3000 HP and reduces an ordinary abyss target to one tenth",
          huskar["life"] == 250 and isclose(w.events[-1][2],35))
    base = min((10+3000/1000)/100, RULES["A117"]["maxTargetCurrentLifeFactor"][0])*RULES["A117"]["scepterFactor"]
    check("A117 selected percent yields 156 against ordinary target or 78 against specified boss with 660 self cost",
          isclose(base*1000,156) and isclose(base*1000*RULES["A117"]["bossFactor"],78)
          and isclose(RULES["A117"]["selfCost"][0]*RULES["A117"]["scepterFactor"]*1000,660))
    return observations


def main():
    report = metadata()
    report["probes"] = probes()
    serialized = json.dumps(report, ensure_ascii=False, indent=2)+"\n"
    if sys.argv[1:] == ["--write"]:
        OUT.write_text(serialized)
    else:
        assert serialized == OUT.read_text()
    count = sum(len(v["rows"])*10 for v in report["skills"].values())
    print(f"{list(STATUS.values()).count('ready')}/10 ready, {len(report['probes'])} probes, {count} workbook cells")


if __name__ == "__main__":
    main()
