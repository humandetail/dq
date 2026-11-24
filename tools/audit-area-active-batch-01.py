#!/usr/bin/env python3
"""Check the shared ability source index and replay newly selected area mechanics."""
from contextlib import closing
from hashlib import sha256
from pathlib import Path
import json
import math
import re
import sys

import audit_index as ai

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/rules/area-active-batch-01.json"
MAIN = ("A017", "A055", "A222", "A064", "A074", "A214", "A086", "A092", "A132", "A197", "A208")
STATUS = {key: {"A214": "pendingAxes"}.get(key, "ready") for key in MAIN}
MODULES = ("main/f75", "main/f100", "main/f142", "main/f153", "main/f159")
MANA = {
    "A017": [30, 50, 80, 130, 220, 320], "A055": [15, 30, 45, 60, 75, 90],
    "A222": [25, 50, 75, 100, 125, 150], "A064": [20, 40, 60, 80, 100, 120],
    "A074": [100, 110, 120, 130, 140, 150], "A214": [0] * 6,
    "A086": [50, 70, 90, 110, 130, 150], "A092": [50, 70, 90, 110, 130, 150],
    "A132": [30, 40, 60, 80, 100, 120], "A197": [30, 40, 50, 60, 70, 80],
    "A208": [60, 90, 120, 150, 180, 210],
}
CD = {
    "A017": [10, 9, 8, 7, 5, 3], "A055": [7] * 6,
    "A222": [20, 18, 16, 14, 12, 10], "A064": [9, 8, 7, 6, 5, 4],
    "A074": [15, 14, 13, 12, 11, 10], "A214": [12] * 6,
    "A086": [14, 13, 12, 11, 10, 9], "A092": [7] * 6,
    "A132": [12, 11, 10, 9, 8, 7], "A197": [15] * 6, "A208": [12] * 6,
}
WEB = {
    "A017": {"damage": [212, 356, 402, 654, 809, 985], "stun": [.8, .9, 1, 1.1, 1.2, 1.3], "radius": 600, "magicFactor": 1.2},
    "A055": {"dps": [200, 300, 400, 500, 600, 700], "stun": [1, 1.2, 1.4, 1.6, 1.8, 2], "dot": [1, 10], "radius": 600},
    "A222": {"damage": [1000 * i for i in range(1, 7)], "lift": 1.6, "liftRadius": 1200, "radius": 1000,
             "combinedControl": [2.6, 2.9, 3.2, 3.5, 3.8, 4.1]},
    "A064": {"damage": [300, 700, 1100, 1500, 1900, 2500], "wave": [1100, 1000, 300, 500], "budget": 999_999},
    "A074": {"damage": list(range(600, 1200, 100)), "robot": {"tripsPerSecond": 24, "duration": 6, "speed": 700,
                                                            "length": 900, "collision": 50, "blast": 300}},
    "A086": {"damage": list(range(300, 2100, 300)), "strengthPerTier": 100, "stunMaximum": 5, "radius": 1200},
    "A092": {"damage": [530, 800, 1150, 1640, 2150, 2800], "targets": [6, 8, 10, 12, 14, 16], "width": [250, 400], "distance": 1200,
              "activation": "manualAndAutoTargeted", "decision": "Q62"},
    "A132": {"radius": 500, "factor": .5, "bossWeight": 5},
    "A197": {"radius": 600, "impactRequests": [2, 4], "requestDelaySource": .8, "requestDelayWeb": 0, "overlap": "cancelUnreleasedTimers",
             "slowRadius": 500, "slowDuration": [2, 5], "slowFactor": [.5, .2], "decision": "Q61"},
    "A208": {"radius": 400, "pulses": [4, 8], "factors": [.10, .12, .14, .16, .18, .20], "key": "castId", "decision": "Q54"},
}
for resolution in MAIN:
    WEB.setdefault(resolution, {}).update(mana=MANA[resolution], cooldown=CD[resolution])


def data():
    books, objects, refs = {}, {}, {}
    with closing(ai.connect()) as db:
        for key in MAIN:
            rows = ai.workbook_rows(db, key, "塔技能")
            half = len(rows) // 2
            assert half and [r["cells"] for r in rows[:half]] == [r["cells"] for r in rows[half:]]
            books[key] = {
                "sourcePaths": [rows[0]["sourcePath"], rows[-1]["sourcePath"]],
                "sharedColumnsEtoJ": rows[0]["cells"][4:],
                "rowsColumnsAtoD": {str(r["row"]): r["cells"][:4] for r in rows[:half]},
                "variantColumnsEtoJ": {str(r["row"]): r["cells"][4:] for r in rows[:half] if r["cells"][4:] != rows[0]["cells"][4:]},
            }
        for key in (*MAIN, "T052", "T064", "T089", "T218", "T219", "T279", "T212", "B116"):
            objects[key] = [r for table in ("units_abilitydata", "war3map.w3a", "units_abilitybuffdata")
                            for r in ai.objects(db, key, table)]
            refs[key] = ai.references(db, key)
        for book in books.values():
            for info in book["rowsColumnsAtoD"].values():
                key = info[1]
                objects[key] = ai.objects(db, key, "units_unitweapons", fields=["castpt", "castbsw"])
    raw = lambda key: objects[key][0]["fields"]
    for key in MAIN:
        book = books[key]["sharedColumnsEtoJ"]
        assert book[2] == 6
        mana = [int(v) for v in re.findall(r"(?:耗蓝 |魔法消耗：)(\d+)", book[4])]
        if mana:
            assert mana == MANA[key], key
        mods = {(m["key"], m["level"]): m["value"] for rec in objects[key][1:] if "mods" in rec["fields"]
                for m in rec["fields"]["mods"]}
        for level in range(1, 7):
            cd = mods.get(("acdn", level), raw(key).get(f"Cool{level}", raw(key).get("Cool4")))
            assert cd == CD[key][level - 1], key
            cost = mods.get(("amcs", level), raw(key).get(f"Cost{level}", 0))
            if key != "A092":
                assert cost == MANA[key][level - 1], key
        for row in books[key]["rowsColumnsAtoD"].values():
            assert len(objects[row[1]]) == 1 and "castpt" in raw(row[1])
    assert "被动" in books["A092"]["sharedColumnsEtoJ"][3]
    assert raw("A092")["code"] == "ANfl"
    assert any(ref["function"] == "main/f291/f27" for ref in refs["A092"])
    assert 985 == WEB["A017"]["damage"][-1]
    assert [raw("T064")[k] for k in ("DataA1", "DataB1", "DataC1", "DataD1", "Dur1", "Area1")] == [24, 50, 600, 300, 6, 900]
    assert [raw(k)["Dur1"] for k in ("T218", "T219")] == [2, 5]
    strings = (ROOT / "reference/map-6.25/units_campaignabilitystrings.txt").read_text()
    missile_tip = strings.split("[A197]\n", 1)[1].split("\n[A198]", 1)[0].split("Ubertip=", 1)[1]
    assert missile_tip.count("发射2秒后命中") == missile_tip.count("发射4秒后命中") == 6
    assert missile_tip.count("减缓50%的移动速度，持续2秒") == missile_tip.count("减缓20%的移动速度，持续5秒") == 6
    return {"baseline": "area-active-batch-01-v1", "source": {"path": ai.DISASM, "sha256": sha256((ROOT / ai.DISASM).read_bytes()).hexdigest()},
            "status": STATUS, "workbooks": books, "objects": objects, "references": refs, "web": WEB}


def replay():
    path = ROOT / "tools/audit-wisp-link-overcharge-relocate.py"
    ns = {"__file__": str(path)}
    exec(compile(path.read_text().split("\nCOUNT=0;VECTORS=[]", 1)[0], path, "exec"), ns)
    closure, function, run, unit = (ns[x] for x in ("Closure", "function", "execute", "unit"))

    class World(ns["World"]):
        def __init__(self):
            super().__init__()
            self.group, self.shots, self.damage_paths = [], [], []
            self.env.update(
                _loop_=closure("main/f3/f5", [lambda e: None]), AddArrAny=closure("main/f7/f22", [self.env]),
                CreateTempAndSetAbilityLv=self.create, GetUnitUserData=lambda u: u["userData"],
                SetUnitUserData=lambda *a: None, CreateGroup=list, GroupEnumUnitsInRange=self.enum,
                FirstOfGroup=lambda g: g[0] if g else None, GroupRemoveUnit=lambda g, u: g.pop(0),
                GroupClear=list.clear, DestroyGroup=lambda g: None,
                IsUnitOwnedByPlayer=lambda u, p: u["owner"] == p, UnitIsHero=lambda target: target.get("boss", False),
                ATTACK_TYPE_HERO="HERO", DAMAGE_TYPE_NORMAL="NORMAL", WEAPON_TYPE_WHOKNOWS="WHOKNOWS",
                UnitDamagePoint=lambda *a: self.damage_paths.append(a),
                SetMagicDamagePoint=lambda *a: self.damage_paths.append((self.now, *a)),
                SetMagicDamage=self.magic, GetHeroStr=lambda u, true: u["str"],
                CreateEffByUnit=lambda *a: object(), DestroyEffect=lambda *a: None, RemoveLocation=lambda *a: None,
                IssueImmediateOrder=lambda *a: self.shots.append(a), IssueTargetOrder=lambda *a: self.shots.append(a),
                IssuePointOrderLoc=lambda *a: self.shots.append(a),
                delayTimeRunFunc=self.after, PauseUnit=lambda u, flag: u.update(paused=flag),
                SetUnitFlyHeight=lambda u, h, r: u.update(height=h),
                GetUnitDefaultFlyHeight=lambda u: 4, GetUnitFlyHeight=lambda u: u.get("height", 4),
                index=-1, TxShow=False,
            )
            for name in MODULES:
                run(function(name), [self.env], (lambda _: self.japi,))

        def create(self, owner, point, facing, aid, level, life, kind="q001"):
            dummy = unit(kind, owner)
            dummy.update(point, facing=facing, skill=aid, rank=level, deadline=life)
            return dummy

        def enum(self, group, x, y, radius, _):
            group.extend(u for u in self.group if math.hypot(u["x"] - x, u["y"] - y) <= radius)

        def after(self, fn, delay, a):
            self.start(self.timer(), delay, False, lambda: fn(a[1]))

        def magic(self, source, target, amount):
            self.damage_paths.append((self.now, source, target, amount))
            target["life"] -= amount

    labels = []

    def check(label, ok):
        assert ok, label
        labels.append(label)

    w = World()
    w.current = unit("H027")
    w.env["GetSpellAbilityId"] = lambda: "A086"
    w.current["str"] = 1099
    w.env["A086_Action"](None)
    w.current["str"] = 1100
    w.env["A086_Action"](None)
    check("A086 exact 100-strength tier boundary and auxiliary command",
          [shot[0]["rank"] for shot in w.shots] == [10, 11] and w.shots[-1][1] == "stomp")

    w = World()
    w.current = unit("H037", A132=3)
    w.current["state"].update({18: 72, 19: 28})
    regular, boss, foreign = unit(owner=11), unit(owner=11), unit(owner=1)
    boss.update(x=500, boss=True)
    w.group = [regular, boss, foreign]
    w.env["A132_Action"]({"x": 0, "y": 0})
    source_amount = w.damage_paths[0][5]
    check("A132 source separates weighted scan and outgoing packet", source_amount == 720 and w.damage_paths[0][-3:] == ("HERO", "NORMAL", "WHOKNOWS"))
    check("A132图鉴 coefficient selected after same weighted scan", source_amount * .5 / .4 == 900)

    w = World()
    hero = unit("H057")
    air = unit(owner=11)
    w.group = [air]
    w.env["A222_Action"](hero)
    check("A222 starts actual pause and radial visual commands", air["paused"] and len(w.shots) == 20
          and [shot[0]["facing"] for shot in w.shots] == list(range(18, 361, 18)))
    w.advance(.8)
    assert air["height"] == 804
    w.env["A222_Action"](hero)
    w.advance(1.6)
    check("A222 repeat does not extend captured lift", not air["paused"] and air["height"] == 4 and not w.env["A222_TimerUp"])

    w = World()
    caster = unit("H051", A197=3)
    caster["userData"] = 2
    w.env["Tower_ALL"][2] = caster
    first, second = {"x": 0, "y": 0}, {"x": 200, "y": 12}
    w.group = [unit(owner=11)]
    w.env["A197_Action"](caster, first)
    w.advance(1)
    w.env["A197_Action"](caster, second)
    w.advance(3)
    caster["skills"]["A197"] = 4
    w.advance(5)
    check("A197 deliberate replacement keeps only new pending missiles and samples each live rank",
          [(d[0], d[2], d[3], d[4], d[-1]) for d in w.damage_paths] ==
          [(3, .8, 600, 200, 1400), (5, .8, 600, 200, 2400)])
    check("A197 first T218 and second T219 have separate cast attempts",
          [shot[0]["skill"] for shot in w.shots] == ["T218", "T219"])

    q61 = World()
    phases = []
    def apply_selected_impact():
        q61.start(q61.timer(), WEB["A197"]["requestDelayWeb"], False, lambda: phases.append(("damage", q61.now)))
        phases.append(("slow", q61.now))
    for due in WEB["A197"]["impactRequests"]:
        q61.start(q61.timer(), due, False, apply_selected_impact)
    q61.advance(4)
    check("Q61 impact uses tip times with same-time range after slow dispatch",
          phases == [("slow", 2), ("damage", 2), ("slow", 4), ("damage", 4)])

    def curse(world, caster, target, at):
        world.group = [target]
        world.advance(at)
        world.env["A208_Action"](caster, first)

    # Raw proof: a new registration is read by the prior callback and cleared by its expiry.
    w = World()
    caster = unit(A208=1)
    caster["userData"] = 1
    w.env["Tower_ALL"][1] = caster
    old, new = unit(owner=11), unit(owner=11)
    curse(w, caster, old, 0)
    curse(w, caster, new, 1)
    new["life"] = 70
    w.advance(9)
    check("A208 old callback reads new target and prevents promised later sampling",
          [(time, target is new, round(amount, 3)) for time, _, target, amount in w.damage_paths] ==
          [(4, True, 3), (5, True, .3), (8, True, .03)])

    w = World()
    old, new = unit("old", 11), unit("new", 11)
    w.env["Tower_ALL"].update({1: caster, 2: caster})
    caster["userData"] = 1
    curse(w, caster, old, 0)
    caster["userData"] = 2  # Isolate storage keys, keeping the identical source and callback code.
    curse(w, caster, new, 1)
    old["life"], new["life"] = 70, 60
    w.advance(8)
    check("A208 isolated old expiry cannot clear new record and first curse damage is included",
          [(int(time), target["kind"], round(amount, 3)) for time, _, target, amount in w.damage_paths] ==
          [(4, "old", 3), (5, "new", 4), (8, "old", .3)])
    w.advance(9)
    check("A208 each isolated cast reaches its own terminal pulse", w.damage_paths[-1][2] is new and round(w.damage_paths[-1][-1], 3) == .4)

    return {"checks": labels, "functions": {fn: function(fn)["sourceLines"] for fn in sorted(ns["COVER"])
                                           if any(fn.startswith(module) for module in MODULES)}}


def main():
    result = data()
    result["validation"] = replay()
    serialized = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if "--write" in sys.argv:
        OUT.write_text(serialized)
    else:
        assert OUT.read_text() == serialized, OUT
    cells = sum(len(rows["rowsColumnsAtoD"]) for rows in result["workbooks"].values()) * 20
    print(f'{sum(value == "ready" for value in STATUS.values())}/{len(MAIN)} ready, '
          f'{len(result["validation"]["checks"])} boundary probes, {cells} workbook cells')


if __name__ == "__main__":
    main()
