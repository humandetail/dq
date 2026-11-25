#!/usr/bin/env python3
"""Audit ANcl shell entries, variant carriers, and new spell callback boundaries."""
from contextlib import closing
from hashlib import sha256
from math import hypot
from pathlib import Path
import json
import re
import sys

import audit_index as ai

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/rules/hero-spells-batch-01.json"
ENTRIES = {
    "A028": (30, "absorb", 800, ["T009"], [.7, 800], range(20, 80, 10), [12, 11, 10, 9, 8, 6]),
    "A031": (32, "charm", None, ["T034"], [.5, None], [20, 40, 60, 90, 130, 180], [8, 8, 7, 6, 5, 4]),
    "A034": (33, "tornado", 700, ["T011", "T103", "B009"], [.5, 800], [0]*6, [13]*6),
    "A046": (42, "sacrifice", 650, ["T031", "T133", "T066", "q003"], [.3, None], [30, 60, 100, 150, 210, 300], [4]*6),
    "A051": (46, "defend", 1800, ["T088", "q023"], [.3, 2000], [35, 60, 85, 110, 145, 180], [15]*6),
    "A054": (48, "tranquility", 750, ["T120"], [.3, None], [20, 35, 50, 65, 80, 100], [15, 14, 13, 12, 11, 10]),
    "A061": (54, "web", 750, ["T055", "T129", "T148", "T221", "B144"], [.3, 800], [20, 25, 30, 35, 40, 50], [15, 14, 13, 12, 11, 10]),
    "A065": (57, "burrow", 800, ["T058", "T170", "q013"], [.3, 850], [45, 60, 75, 90, 105, 130], [10]*6),
    "A066": (58, "robogoblin", 800, ["q011", "q012", "T057", "T061"], [.3, None], [120, 150, 180, 210, 240, 270], [20]*6),
    "A076": (66, "revive", 800, ["T075", "T076", "q017", "q019"], [.3, 800], [30, 40, 50, 60, 70, 80], [8]*6),
}
STATUS = {k: {"A066": "pendingSpiritLifecycle"}.get(k, "ready") for k in ENTRIES}
RULES = {
    "A028": {"damage": [300, 500, 700, 900, 1100, 1400], "radius": [300, 350, 400, 450, 500, 600],
             "stun": [1, 1.2, 1.4, 1.6, 1.8, 2], "carrierLifetime": 1.5},
    "A031": {"damage": [260, 480, 700, 920, 1040, 1260], "radius": 800, "groundOnly": True,
             "stun": [1, 1.2, 1.4, 1.6, 1.8, 2], "carrierLifetime": 1},
    "A034": {"damage": 0, "bossOnly": True, "stun": [2, 2.5, 3, 3.5, 4, 4.5], "mark": "B009",
             "sourceSkillMultiplier": 1.3, "missileSpeed": 1000},
    "A046": {"base": [100, 250, 400, 550, 700, 850], "int": [1, 1.5, 2, 2.5, 3, 3.5], "radius": 700,
             "missile": [640, 1000, 5], "nativeHpDamage": 0, "scepterChance": 50, "sourceChance": 49,
             "scepterFactor": 2, "scepterStun": [1.5, .5]},
    "A051": {"base": [300, 600, 900, 1200, 1500, 1800], "targetCap": [10, 12, 14, 16, 18, 20],
             "factorPerHop": 1.1, "hopRadius": 1000, "hopSelection": "randomWithoutReplacement",
             "scepterSummonRule": "summon-family-batch-01.md", "carrierLifetime": 10},
    "A054": {"base": [440, 560, 680, 800, 920, 1150], "attackStates": [18, 19], "selectionRadius": 800, "impactRadius": 200,
             "period": .6, "duration": 6, "maxPulses": 9, "scepterStun": .5, "recast": "replaceBothTimers"},
    "A061": {"damage": [500, 700, 900, 1100, 1300, 1500], "radius": 400, "stun": 2,
             "physicalVulnerability": [1.2, 5], "target": "allLiveP11InCastPointCircle", "supplyFromSource": "Q3",
             "hammer": {"carrierLifetime": 1, "speed": 1200, "range": 2000}, "independentDebuffOrder": True},
    "A065": {"damagePerSecond": [100, 200, 300, 400, 500, 600], "intEach": [5, 7, 10, 13, 16, 20],
             "selectionRadius": 300, "nativeLeash": 1000, "period": 1, "drainDuration": 5, "intDuration": 8,
             "scepterInt": 10, "endlessIntFactor": 2},
    "A066": {"base": [200, 250, 300, 350, 400, 500], "int": [.8, .9, 1, 1.1, 1.2, 1.4], "baseCount": [5, 7, 9, 11, 13, 15],
             "duration": 15, "manaEachHit": 13, "pending": "q011/q012 attack, replacement, refresh, and return"},
    "A076": {"launchAimDistance": 800, "wave": [3000, 1500, 500, 500], "budget": 9999999,
             "damageMultipliers": [2, 3, 4, 5, 6, 7], "endlessScepterFactor": 3, "stun": [2, .5]},
}
UNIT_IDS = ("q011", "q012", "q003", "q013", "q017", "q019", "q023")


def data():
    result = {}
    with closing(ai.connect()) as db:
        for raw, (mod, order, auto, auxiliary, cast, mana, cooldown) in ENTRIES.items():
            rows = ai.workbook_rows(db, raw, "塔技能")
            mid = len(rows)//2
            assert mid and [row["cells"] for row in rows[:mid]] == [row["cells"] for row in rows[mid:]]
            assert all(row["cells"][6] == 6 and row["cells"][7:] == rows[0]["cells"][7:] for row in rows)
            h, i, _ = rows[0]["cells"][7:]
            assert rows[0]["cells"][5] == raw and i
            rank_mana = [int(n) for n in re.findall(r"耗蓝 (\d+)点", i)]
            if rank_mana:
                assert rank_mana == list(mana), raw
            rank_cd = [int(n) for n in re.findall(r"冷却 (\d+)秒", i)]
            if rank_cd:
                assert rank_cd == cooldown, raw
            carriers = {key: [o for table in (("units_unitabilities", "units_unitdata", "units_unitweapons") if key in UNIT_IDS
                                             else ("units_abilitydata", "war3map.w3a", "units_abilitybuffdata"))
                              for o in ai.objects(db, key, table)] for key in auxiliary}
            objects = [o for table in ("units_abilitydata", "war3map.w3a") for o in ai.objects(db, raw, table)]
            base = objects[0]["fields"]
            assert base["code"] == "ANcl" and base.get("DataF1") == order
            if cast[1] is not None:
                assert base["Rng1"] == cast[1]
            weapons = {id_: ai.objects(db, id_, "units_unitweapons", fields=["castpt", "castbsw"]) for id_ in sorted({r["cells"][1] for r in rows})}
            assert all(w[0]["fields"]["castpt"] == cast[0] for w in weapons.values())
            refs = ai.references(db, raw)
            route = next(r for r in refs if r["function"] == "main/f291/f27")
            segment = ai.instructions(db, route["function"], route["pc"], route["pc"]+44)
            if auto is not None:
                assert any(c["value"] == auto for row in segment for c in row["constants"].values())
            assert any(c["value"] == order for row in segment for c in row["constants"].values())
            prefix = f"main/f{mod}"
            functions = dict((f, [lo, hi]) for f, lo, hi in db.execute(
                "SELECT name,start_line,end_line FROM function WHERE name=? OR name LIKE ? ORDER BY start_line",
                (prefix, prefix+"/%")))
            result[raw] = {"status": STATUS[raw], "rows": rows, "shell": objects, "carriers": carriers,
                           "castPoints": weapons, "references": refs, "functions": functions,
                           "web": dict(RULES[raw], mana=list(mana), cooldown=cooldown, order=order, range=cast[1], auto=auto)}
    assert "敌方地面单位" in result["A031"]["rows"][0]["cells"][7]
    assert "只能对BOSS释放" in result["A034"]["rows"][0]["cells"][7]
    assert "随机打击" in result["A051"]["rows"][0]["cells"][7]
    assert "200范围" in result["A054"]["rows"][0]["cells"][7]
    strings = (ROOT / "reference/map-6.25/units_campaignabilitystrings.txt").read_text()
    for key, text in (("A046", "50%概率"), ("A054", "0.5秒的眩晕"), ("A065", "智力加成持续8秒")):
        tip = strings.split(f"[{key}]\n", 1)[1].split("\n[", 1)[0].split("\nUbertip=", 1)[1].split("\n", 1)[0]
        assert tip.count(text) == 6
    return {"baseline": "hero-spells-batch-01-v1", "source": {"path": ai.DISASM, "sha256": sha256((ROOT/ai.DISASM).read_bytes()).hexdigest()},
            "skills": result}


def probes():
    path = ROOT / "tools/audit-wisp-link-overcharge-relocate.py"
    vm = {"__file__": str(path)}
    exec(compile(path.read_text().split("\nCOUNT=0;VECTORS=[]", 1)[0], path, "exec"), vm)
    execute, closure, function, unit = (vm[k] for k in ("execute", "Closure", "function", "unit"))
    checks = []

    def check(name, result):
        assert result, name
        checks.append(name)

    w = vm["World"]()
    source, carrier, target = unit("H014", A046=2), unit("q003"), unit("monster", 11)
    carrier["userData"], source["int"], w.current = 7, 100, target
    w.env["Tower_ALL"][7] = source
    values, casts = [], []
    w.env.update(GetEventDamageSource=lambda: carrier, GetUnitUserData=lambda u: u["userData"],
                 GetRandomInt=lambda *_: 50, CreateTempAndSetAbilityLv=lambda *a: casts.append(a) or {},
                 SetUnitUserData=lambda *_: None, IssueTargetOrder=lambda *_: None,
                 ATTACK_TYPE_NORMAL="normal", DAMAGE_TYPE_MAGIC="magic", WEAPON_TYPE_WHOKNOWS="none",
                 UnitDamageTarget=lambda s, t, d, *f: values.append((s, t, d, f)))
    execute(function("main/f42"), [w.env], (lambda _: w.japi,))
    source["items"].add("i310")
    w.env["A046_Damage"]()
    check("A046 source 50 fails its strict chance and the single child has dynamic 250+1.5INT",
          values == [(source, target, 400, (False, False, "normal", "magic", "none"))] and not casts)
    w.env["GetRandomInt"] = lambda *_: 49
    w.env["A046_Damage"]()
    check("A046 original 49 doubles child and requests T066 before child", values[-1][2] == 800 and casts[-1][3] == "T066")

    # Keep the original nonattack route active, then clear the mother event after the synchronous child.
    pending = {"parent": 600}
    w.env["GetRandomInt"] = lambda *_: 50
    bytecode = function("main/f42/f1")
    constants = dict(bytecode["constants"])
    constants["k25"] = dict(constants["k25"], value=51)
    accepted = dict(bytecode, constants=constants)

    def web_proc():
        assert pending["parent"] == 600
        execute(accepted, [w.env])
        pending["parent"] = 0

    w.env["A046_Damage"] = web_proc
    w.japi["EXGetEventDamageData"] = lambda _: 0
    execute(function("main/f291/f1"), [w.env, w.japi], (carrier, target, source), start_pc=768, stop_pc=782)
    check("A046 Web keeps live nonattack route, accepts 50, then clears parent before later damage/statistics",
          pending["parent"] == 0 and values[-1][2] == 800 and len(values) == 3 and len(casts) == 2)

    w = vm["World"]()
    hero, mob = unit("H016", A054=2), unit("monster", 11)
    hero["state"].update({18: 28, 19: 32})
    w.current, w.env["Tower_ALL"][3] = hero, hero
    samples = []
    execute(function("main/f48"), [w.env])
    w.env.update(TxShow=False, A054_hasMon=lambda _: mob,
                 UnitDamagePoint=lambda s, delay, radius, x, y, damage, *args: samples.append((w.now, radius, damage)))
    w.env["A054_Action"]()
    w.advance(.6)
    check("A054 live attack sum arrives at first .6 pulse", samples[-1][1:] == (150, 620))
    old_timers = [w.env[k][3] for k in ("A054_Timers", "A054_AllTimers")]
    w.env["A054_Action"]()
    check("A054 explicit recast destroys both old timers", all(not t["alive"] for t in old_timers))
    w.advance(6.6)
    check("A054 B05 expiration cuts equal-time tenth pulse", len(samples) == 10 and not w.env["A054_Timers"])

    w = vm["World"]()
    hero = unit("H019", A061=2)
    w.current, w.spell, w.env["Tower_ALL"][8] = hero, "A061", hero
    inside = [unit("near", 11), unit("edge", 11)]
    inside[0]["x"], inside[1]["x"] = 720, 1100
    outside = [unit("outside", 11), unit("dead", 11), unit("differentOwner", 10)]
    outside[0]["x"], outside[1]["x"], outside[1]["life"], outside[2]["x"] = 1100.01, 720, 0, 720
    orders = []
    w.env.update(_loop_=closure("main/f3/f5", [lambda *_: None]), CreateGroup=list,
                 GroupEnumUnitsInRange=lambda g, x, y, r, _: g.extend(
                     u for u in inside + outside if hypot(u["x"]-x, u["y"]-y) <= r),
                 FirstOfGroup=lambda g: g[0] if g else None, GroupRemoveUnit=lambda g, u: g.pop(0),
                 IsUnitOwnedByPlayer=lambda u, p: u["owner"] == p,
                 SetUnitUserData=lambda u, i: u.update(userData=i), SetUnitScale=lambda *_: None,
                 CreateTempAndSetAbilityLv=lambda owner, point, facing, key, lv, dur: {"key": key, "lv": lv, "x": point["x"]},
                 IssueTargetOrder=lambda d, order, t: orders.append((d, order, t["kind"])),
                 GroupClear=list.clear, DestroyGroup=lambda *_: None)
    execute(function("main/f54"), [w.env])
    w.env["A061_Action"]({"x": 700, "y": 0})
    check("A061 point commits at empty center, including its exact-radius living P11 and gives both full ordered casts",
          [(d["key"], d["lv"], d["x"], d.get("userData"), o, t) for d,o,t in orders] == [
              (key, lv, 0, user_data, o, u["kind"]) for u in inside
              for key, lv, user_data, o in (("T055", 2, 8, "thunderbolt"), ("T221", 1, None, "slow"))])
    w.env["A061_Action"]({"x": -500, "y": 0})
    check("A061 empty point circle emits no child orders", len(orders) == 4)

    w = vm["World"]()
    hero, mob = unit("G022", A065=1), unit("monster", 11)
    w.env["Tower_ALL"][4], w.current = hero, hero
    group_members, drains = [mob], []
    w.env.update(_loop_=closure("main/f3/f5", [lambda *_: None]), CreateGroup=list,
                 GroupEnumUnitsInRange=lambda group, *_: group.extend(group_members),
                 FirstOfGroup=lambda group: group[0] if group else None, GroupRemoveUnit=lambda group, u: group.pop(0),
                 IsUnitOwnedByPlayer=lambda u, p: u["owner"] == p, SetUnitUserData=lambda u, i: u.update(userData=i),
                 IssueTargetOrder=lambda unit, order, target: drains.append((unit, order, target)),
                 CreateTempAndSetAbilityLv=lambda owner, point, facing, ability, rank, life, key:
                     {"ability": ability, "rank": rank, "life": life, "kind": key})
    execute(function("main/f57"), [w.env])
    w.env["A065_Skill"]({"x": 4, "y": 0})
    old_timer = w.env["A065_Timer"][4]
    w.advance(1)
    w.env["A065_Action"](hero)
    check("A065 launches skin-specific q013 and grants INT from its first damage route", hero["int"] == 105
          and drains[0] == ({"ability": "T170", "rank": 1, "life": 6, "kind": "q013", "userData": 4}, "drain", mob))
    hero["int"] += 20
    w.advance(2)
    w.env["A065_Skill"]({"x": 4, "y": 0})
    check("A065 accepted recast replaces integer window and removes only its old contribution",
          hero["int"] == 120 and not old_timer["alive"] and len(drains) == 2)
    w.env["Game_Mode"] = 1
    hero["items"].add("i310")
    hero["skills"]["A065"] = 2
    w.env["A065_Action"](hero)
    check("A065 active drain uses current rank/scepter and doubles the sum in endless", hero["int"] == 154)
    group_members.clear()
    current_timer = w.env["A065_Timer"][4]
    w.env["A065_Skill"]({"x": 4, "y": 0})
    check("A065 empty branch skips replacement and expiry subtracts only active grant",
          w.env["A065_Timer"][4] is current_timer)
    w.advance(10)
    check("A065 original eight-second boundary restores retained external INT", hero["int"] == 120)

    w = vm["World"]()
    hero, victim = unit("H024", A076=5, A078=2), unit("monster", 11)
    hero["state"].update({18: 100, 19: 50})
    w.env["Tower_ALL"][3] = hero
    damage, operations = [], []
    w.env.update(Game_Mode=1, SetUnitUserData=lambda u, index: u.update(userData=index),
                 CreateUnitAtLoc=lambda owner, key, *_: unit(key, owner), UnitApplyTimedLife=lambda *_: None,
                 CreateTempAndSetAbilityLv=lambda *a: operations.append(a[3]) or unit("q001"),
                 IssueTargetOrder=lambda *_: None, SetRealDamage=lambda s, t, d: damage.append((s, t, d)))
    w.japi["EXSetEventDamage"] = lambda d: operations.append(d)
    hero["items"].add("i310")
    execute(function("main/f66"), [w.env], (lambda _: w.japi,))
    w.env["A076_Damage"](hero, victim)
    check("A076 clears parent, requests T076, and makes a single q019 divine child with original crit formula",
          operations == [0, "T076"] and [(s["kind"], s["userData"], t, d) for s,t,d in damage] == [("q019", 3, victim, 8100)])
    hero["skills"].pop("A078")
    w.env["A076_Damage"](hero, victim)
    check("A076 without A078 uses tower and same live endless scepter multiplier", damage[-1] == (hero, victim, 2700))
    return checks


def main():
    report = data()
    report["probes"] = probes()
    serialized = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if sys.argv[1:] == ["--write"]:
        OUT.write_text(serialized)
    else:
        assert serialized == OUT.read_text()
    count = sum(len(v["rows"])*10 for v in report["skills"].values())
    print(f"{list(STATUS.values()).count('ready')}/10 ready, {len(report['probes'])} probes, {count} workbook cells")


if __name__ == "__main__":
    main()
