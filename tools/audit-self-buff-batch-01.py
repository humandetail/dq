#!/usr/bin/env python3
"""Project the shared index and replay new Absk timer, damage and grant boundaries."""
from contextlib import closing
from fractions import Fraction
from hashlib import sha256
from pathlib import Path
import json
import math
import sys

import audit_index as ai

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/rules/self-buff-batch-01.json"
MAIN = ("A024", "A037", "A041", "A043", "A068", "A071", "A088", "A126", "A196")
MODULES = ("main/f26", "main/f35", "main/f40", "main/f60", "main/f62", "main/f77", "main/f98", "main/f141")
AUXILIARY = ("A149", "A184", "A211", "T051", "T065", "T095", "T145", "T147", "T217", "T262", "T290", "T291", "N015")
OBJECT_MANA = {
    "A024": [10, 20, 30, 40, 50, 60], "A041": [30, 40, 50, 60, 70, 80],
    "A068": [10, 15, 20, 25, 30, 40], "A126": [10, 15, 20, 25, 30, 40],
    "A196": [30, 35, 40, 45, 50, 60],
}
OBJECT_CD = {
    "A024": [15] * 6, "A037": [10, 9, 8, 7, 6, 5], "A041": [12] * 6, "A043": [10] * 6,
    "A068": [12, 11, 10, 9, 8, 7], "A071": [10] * 6, "A088": [10] * 6, "A126": [17, 16, 15, 14, 13, 12],
    "A196": [10, 9, 8, 7, 6, 5],
}
STATUS = {key: "pendingBarrage" if key == "A196" else "ready" for key in MAIN}


def source_data():
    with closing(ai.connect()) as db:
        books, references, objects = {}, {}, {}
        for key in MAIN:
            rows = ai.workbook_rows(db, key, "塔技能")
            half = len(rows) // 2
            assert half >= 1 and [r["cells"] for r in rows[:half]] == [r["cells"] for r in rows[half:]]
            assert all(r["cells"][6] == 6 for r in rows)
            books[key] = {
                "sourcePaths": [rows[0]["sourcePath"], rows[-1]["sourcePath"]],
                "commonColumnsEtoJ": rows[0]["cells"][4:],
                "rowColumnsAtoD": {str(r["row"]): r["cells"][:4] for r in rows[:half]},
                "variantDifferencesEtoJ": {str(r["row"]): r["cells"][4:] for r in rows[:half]
                                           if r["cells"][4:] != rows[0]["cells"][4:]},
            }
            references[key] = ai.references(db, key)
        for key in (*MAIN, *AUXILIARY):
            objects[key] = ai.objects(db, key, "units_abilitydata") + ai.objects(db, key, "war3map.w3a")
        for key in ("q001", "q008"):
            objects[key] = ai.objects(db, key, "units_unitabilities") + ai.objects(db, key, "units_unitweapons")
        for rows in books.values():
            for info in rows["rowColumnsAtoD"].values():
                key = info[1]
                objects[key] = ai.objects(db, key, "units_unitabilities", fields=["heroAbilList", "abilList"])
    for key in MAIN:
        base = objects[key][0]["fields"]
        assert base["code"] == "Absk" and base["levels"] == 6
        assert not any(f"DataA{rank}" in base for rank in range(1, 5))
        mods = {(m["key"], m["level"]): m["value"] for rec in objects[key][1:] for m in rec["fields"]["mods"]}
        for rank in range(1, 7):
            cd = mods.get(("acdn", rank), base.get(f"Cool{rank}", base.get("Cool4")))
            mana = mods.get(("amcs", rank), base.get(f"Cost{rank}"))
            assert cd == OBJECT_CD[key][rank - 1]
            assert mana == (OBJECT_MANA[key][rank - 1] if key in OBJECT_MANA else None)
        if key in OBJECT_MANA:
            text = books[key]["commonColumnsEtoJ"][4]
            assert all(f"耗蓝 {value}点" in text for value in OBJECT_MANA[key])
    assert len(references["A041"]) == 1
    h = {key: books[key]["commonColumnsEtoJ"][3] for key in MAIN}
    assert all(term in h["A024"] for term in ("8秒", "15秒"))
    assert "全属性x12" in h["A037"] and all(term in h["A068"] for term in ("400", "6秒", "15秒"))
    assert "持续10秒" in books["A041"]["commonColumnsEtoJ"][4]
    assert "800" in h["A071"] and "被动" in h["A088"] and "1000" in h["A196"]
    assert [objects[key][0]["fields"]["DataC1"] for key in ("A071", "A088", "A126")] == [1, 1, 1]
    return {"baseline": "self-buff-batch-01-v1", "status": STATUS, "workbooks": books, "objects": objects,
            "literalReferences": references, "source": {"path": ai.DISASM, "sha256": sha256((ROOT / ai.DISASM).read_bytes()).hexdigest()},
            "web": {"A037": {"pulseSeconds": .1, "startDelay": .5, "pulses": 11, "scalar": [12, 11], "radius": 500},
                    "A041": {"speedBonus": 1.5, "duration": [4, 5, 6, 7, 8, 10]},
                    "A043": {"radius": 600, "duration": 5, "damagePerSecond": [400, 600, 800, 1000, 1200, 1400]},
                    "A068": {"radius": 400, "duration": 6, "initialCooldown": 15, "minCooldown": [7, 6, 5, 4, 2, .2]},
                    "A071": {"radius": 800, "duration": 10, "nonHeroAmount": "ceil(heroAmount/2)"},
                    "A088": {"decision": "Q56", "learnBaseStrength": 20, "radius": 800, "duration": 10,
                             "normalScorePerLevel": 5, "scepterScorePerLevel": 15, "actualStrengthPerLevel": 15,
                             "nativeSelfDuration": 8, "armor": 5},
                    "A126": {"duration": 7, "speedBonus": [.4, .5, .6, .7, .8, .9]}}}


def probes():
    path = ROOT / "tools/audit-wisp-link-overcharge-relocate.py"
    vm = {"__file__": str(path)}
    exec(compile(path.read_text().split("\nCOUNT=0;VECTORS=[]", 1)[0], path, "exec"), vm)
    closure, function, run, unit = (vm[k] for k in ("Closure", "function", "execute", "unit"))

    class World(vm["World"]):
        def __init__(self, club_duration=5, club_radius=500):
            super().__init__()
            self.club_duration, self.club_radius = club_duration, club_radius
            self.group, self.dummies, self.damage_calls = [], [], []
            self.target = None
            self.source = None
            self.scepter = False
            self.env.update(
                Tower_ALL={}, GetUnitUserData=lambda u: u.get("userData", -1),
                SetUnitUserData=lambda u, i: u.update(userData=i),
                _loop_=closure("main/f3/f5", [lambda e: None]),
                Has_A_Item=lambda u: self.scepter, AddArrAny=closure("main/f7/f22", [self.env]),
                CreateTempAndSetAbilityLv=closure("main/f7/f20", [self.env]), CreateUnitAtLoc=self.create,
                UnitApplyTimedLife=lambda u, b, t: u.update(timedLife=(b, t)), RemoveUnit=lambda u: u.update(deleted=True),
                CreateEffAtLoc=lambda *a: None, CreateEffByUnit=lambda *a: None, RemoveLocation=lambda loc: None,
                CreateGroup=list, GroupEnumUnitsInRange=self.enumerate, FirstOfGroup=lambda g: g[0] if g else None,
                GroupRemoveUnit=lambda g, u: g.pop(0), GroupClear=list.clear, DestroyGroup=lambda g: None,
                IsUnitOwnedByPlayer=lambda u, p: u["owner"] == p,
                IsUnitType=lambda u, t: u.get(t, False), UNIT_TYPE_MELEE_ATTACKER="melee", UNIT_TYPE_HERO="nativeHero",
                GetHeroStr=lambda u, e=False: u["str"], SetHeroStr=lambda u, amount, flag: u.update(str=amount),
                GetHeroAgi=lambda u, e=False: u["agi"], GetHeroInt=lambda u, e=False: u["int"],
                DeLuYi_XiongLingHuoBan={}, AddUnitAnimationProperties=lambda *a: None,
                GetEventDamageSource=lambda: self.source, GetTriggerUnit=lambda: self.current,
                UNIT_STATE_MAX_LIFE="maxLife", ATTACK_TYPE_HERO="HERO", ATTACK_TYPE_CHAOS="CHAOS",
                DAMAGE_TYPE_NORMAL="NORMAL", DAMAGE_TYPE_DIVINE="DIVINE", WEAPON_TYPE_WHOKNOWS="WHOKNOWS",
                UnitDamageTarget=lambda *a: self.damage_calls.append(a), UnitDamagePoint=lambda *a: self.damage_calls.append((self.now, *a)),
                UnitRemoveBuffs=lambda *args: self.log.append(("purge", self.now, len(self.damage_calls), *args)),
                IssueImmediateOrder=lambda *a: self.log.append(("order", *a)),
                IssueTargetOrder=lambda *a: self.log.append(("order", *a)),
            )
            self.env["math"]["ceil"] = math.ceil
            self.japi["EXGetAbilityState"] = lambda h, state: h[0]["cd"].get(h[1], 0)
            self.env["SetRealDamage"] = closure("main/f7/f35", [self.env])
            for name in MODULES:
                run(function(name), [self.env], (lambda path: self.japi,))

        def start(self, timer, seconds, repeat, fn):
            if getattr(fn, "name", None) in ("main/f60/f2", "main/f60/f3"):
                assert seconds == 5
                seconds = self.club_duration
            super().start(timer, seconds, repeat, fn)

        def create(self, owner, identifier, pos, facing):
            u = unit(identifier, owner)
            u.update(pos, facing=facing)
            self.dummies.append(u)
            return u

        def enumerate(self, group, x, y, radius, _):
            if radius == 500:
                radius = self.club_radius
            group.extend(u for u in self.group if math.hypot(u["x"] - x, u["y"] - y) <= radius)

    checks = []

    def check(label, outcome):
        assert outcome, label
        checks.append(label)

    w = World()
    w.source, w.current = unit(A024=4), unit(owner=11)
    w.source["state"]["maxLife"] = 1250
    w.env["A024_Action"]()
    check("A024 emits separate current-max-life physical child packet", w.damage_calls == [
        (w.source, w.current, 200, False, False, "HERO", "NORMAL", "WHOKNOWS")])

    w = World()
    caster = unit("H011")
    w.env["A037_Action"](caster)
    w.advance(.6)
    assert len(w.damage_calls) == 1
    caster.update(str=170, x=15)
    w.advance(1.7)
    check("A037 source uses eleven 0.1-second pulses, sampled defenses before each purge",
          len(w.damage_calls) == 11 and [p[6] for p in w.damage_calls] == [300] + [370] * 10
          and w.damage_calls[1][4] == 15 and w.damage_calls[-1][0] == Fraction("1.6")
          and [e[2] for e in w.log if e[0] == "purge"] == list(range(1, 12)))
    check("A037 Web scalar preserves total twelve stat sums at unchanged stats",
          sum(Fraction(12, 11) * 300 for _ in w.damage_calls) == 3600)

    w = World()
    w.current = unit("G041", A043=6)
    w.env["Tower_ALL"][3] = w.current
    w.env["A043_Action"]()
    first = w.dummies[-1]
    w.advance(1)
    w.env["A043_Action"]()
    second = w.dummies[-1]
    w.advance(5)
    check("A043 scripted five-second removal is per carrier, native life request is ten",
          first["deleted"] and not second.get("deleted") and first["skills"] == {"T051": 6}
          and first["userData"] == 3 and first["timedLife"] == ("BHwe", 10))
    w.advance(6)
    check("A043 clears both registration arrays", second["deleted"] and not w.env["A043_Timer"] and not w.env["A043_Unit"])

    w = World(club_duration=6)
    w.current = unit("H021", A068=1)
    w.env["Tower_ALL"][1] = w.current
    w.env["A068_Use"]()
    w.advance(3)
    w.current["skills"]["A068"] = 5
    w.env["A068_Use"]()
    assert w.current["str"] == 200
    w.advance(6)
    check("A068 independent old strength contribution ends without clearing new", w.current["str"] == 180)
    w.advance(9)
    check("A068 second contribution fully expires", w.current["str"] == 100)

    w = World(club_radius=400)
    caster = unit("H021", A068=5)
    caster["cd"]["A068"] = 3
    center, edge, outside, gold = (unit(name, 11) for name in ("main", "edge", "outside", "m998"))
    edge["x"], outside["x"] = 400, 401
    w.group = [center, edge, outside, gold]
    w.env["A068_Action1"](caster, center, 100)
    check("A068 graph radius, gold coefficient and live cooldown floor",
          [(packet[1]["kind"], packet[2], packet[-2]) for packet in w.damage_calls] ==
          [("edge", 50, "DIVINE"), ("m998", 40, "DIVINE")] and caster["cd"]["A068"] == 2)

    w = World()
    caster = unit("H022", A071=3)
    caster["agi"] = 105
    hero, nonhero = unit("hero", 1), unit("nonhero", 1)
    nonhero["nativeHero"] = False
    w.env["Tower_ALL"].update({1: hero, 2: nonhero})
    w.group = [hero, nonhero]
    w.scepter = True
    w.env["A071_Action"](caster, "A071")
    check("A071 hero gets full floor, nonhero gets ceil half, scepter agility only on hero",
          hero["state"][18] == 31 and nonhero["state"][18] == 16 and hero["skills"] == {"T290": 1}
          and "T290" not in nonhero["skills"])
    w.advance(5)
    caster["agi"] = 10
    w.env["A071_Action"](caster, "A071")
    hero["kind"] = "another-template"
    w.advance(10)
    check("A071 weaker recast rejected, expiry uses type guard for attack and always removes T290",
          hero["state"][18] == 31 and nonhero["state"][18] == 0 and "T290" not in hero["skills"])

    w = World()
    caster, bear, replacement = unit("H036", A126=6), unit("bear"), unit("new-bear")
    w.env["Tower_ALL"][5] = caster
    w.env["DeLuYi_XiongLingHuoBan"][5] = bear
    w.env["A126_Action"](caster)
    check("A126 grants actual rank to the captured bear and caster", bear["skills"]["T145"] == caster["skills"]["T145"] == 6)
    w.env["DeLuYi_XiongLingHuoBan"][5] = replacement
    w.advance(7)
    check("A126 removes captured bear contribution, not current companion", all("T145" not in u["skills"] for u in (caster, bear, replacement)))

    w = World()
    caster = unit("H027", A088=2)
    ally = unit("H010", 1)
    w.env["Tower_ALL"][2] = ally
    w.group = [ally]
    w.env["A088_Study"](caster)
    w.env["A088_Action"](caster, "A088")
    check("A088 learned +20 is separate from active T291 rank and non-scepter comparison score",
          caster["str"] == 120 and ally["skills"]["T291"] == 2 and w.env["A088_Value"][2] == 10)
    w.advance(2)
    caster["skills"]["A088"] = 1
    w.scepter = True
    w.env["A088_Action"](caster, "A088")
    check("A088 active comparison uses score rather than the T291 rank",
          w.env["A088_Value"][2] == 15 and ally["skills"]["T291"] == 1)
    w.advance(10)
    assert "T291" in ally["skills"]
    w.advance(12)
    check("A088 active helper expires independently of passive", "T291" not in ally["skills"] and caster["str"] == 120)

    w = World()
    caster = unit("H051", A196=1)
    caster["userData"] = 4
    w.env["Tower_ALL"][4] = caster
    w.env["A196_Action"](caster)
    for _ in range(3):
        w.env["A196_add_num"](caster)
        assert "T217" in caster["skills"]
    w.env["A196_add_num"](caster)
    check("A196 source preserves three following started attacks and removes on fourth",
          "T217" not in caster["skills"] and ("destroyTimer", None) in w.log)
    return {"checks": checks, "functionLines": {fn: function(fn)["sourceLines"] for fn in sorted(vm["COVER"])
                                               if any(fn.startswith(module) for module in MODULES)},
            "instructionCoverage": {fn: len(pcs) for fn, pcs in sorted(vm["COVER"].items())
                                    if any(fn.startswith(module) for module in MODULES)}}


def main():
    data = source_data()
    data["validation"] = probes()
    encoded = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if "--write" in sys.argv:
        OUT.write_text(encoded)
    else:
        assert OUT.read_text() == encoded, OUT
    cells = 20 * sum(len(x["rowColumnsAtoD"]) for x in data["workbooks"].values())
    print(f'{sum(status == "ready" for status in STATUS.values())}/{len(MAIN)} ready; '
          f'{len(data["validation"]["checks"])} boundary probes; {cells} workbook cells')


if __name__ == "__main__":
    main()
