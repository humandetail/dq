#!/usr/bin/env python3
"""Audit A214 object fields, original callbacks, and the Q54/Q63 state contract."""
from contextlib import closing
from fractions import Fraction
from hashlib import sha256
from math import atan2, cos, degrees, hypot, isclose, radians, sin
from pathlib import Path
import json
import re
import sys

import audit_index as ai

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/rules/wild-axes.json"
FACTORS = [40, 50, 60, 70, 80, 90]
FUNCTIONS = ("main/f155", *("main/f155/f" + str(i) for i in range(4)), "main/f7/f33")


def metadata():
    with closing(ai.connect()) as db:
        rows = ai.workbook_rows(db, "A214", "塔技能")
        objects = {key: [o for table in tables for o in ai.objects(db, key, table)] for key, tables in {
            "A214": ("units_abilitydata", "war3map.w3a"),
            "H056": ("units_unitweapons",),
            "q053": ("units_unitdata", "units_unitabilities", "units_unitbalance"),
        }.items()}
        refs = {key: ai.references(db, key) for key in ("A214", "q053", "A214_Action")}
        functions = {name: db.execute("SELECT start_line,end_line FROM function WHERE name=?", (name,)).fetchone()
                     for name in FUNCTIONS}
        auto = ai.instructions(db, "main/f291/f27", 3393, 3426)
        effect = ai.instructions(db, "main/f291/f14", 1377, 1387)
    assert len(rows) == 2 and rows[0]["cells"] == rows[1]["cells"] and rows[0]["row"] == rows[1]["row"] == 165
    h, i = rows[0]["cells"][7:9]
    assert "每把飞斧" in h and "对同一单位造成一次伤害" in h and "冷却12秒" in h
    assert [int(v) for v in re.findall(r"x(\d+)%", i)] == FACTORS and "物理伤害" in i
    fields = objects["A214"][0]["fields"]
    assert fields["code"] == "AUcs" and fields["levels"] == 6
    for rank in range(1, 5):
        assert [fields.get(f"{field}{rank}", 0) for field in ("Cool", "Rng", "Cost", "DataA")] == [12, 1200, 0, 0]
    assert objects["H056"][0]["fields"]["castpt"] == .5
    move, abilities, balance = (v["fields"] for v in objects["q053"])
    assert (move["movetp"], move["moveHeight"], abilities["abilList"], balance["HP"]) == ("fly", 100, "Avul,Aloc", 220)
    assert any(c["value"] == "carrionswarm" for r in auto for c in r["constants"].values())
    assert any(c["value"] == 1000 for r in auto for c in r["constants"].values())
    assert any(c["value"] == "A214_Action" for r in effect for c in r["constants"].values())
    strings = (ROOT / "reference/map-6.25/units_campaignabilitystrings.txt").read_text()
    tips = strings.split("[A214]\n", 1)[1].split("\n[A215]", 1)[0].split("\nUbertip=", 1)[1]
    assert tips.count("持有神杖时当飞斧返回时立刻完成冷却") == 6
    return {
        "baseline": "wild-axes-v1", "status": "ready", "workbookRows": rows, "objects": objects,
        "source": {"path": ai.DISASM, "sha256": sha256((ROOT / ai.DISASM).read_bytes()).hexdigest(),
                   "functions": functions, "references": refs,
                   "entries": {kind: [segment[0]["sourceLine"], segment[-1]["sourceLine"]]
                               for kind, segment in (("auto", auto), ("effect", effect))}},
        "web": {
            "decisions": ["Q54", "Q63"], "activation": "manualAndAutoPoint", "order": "carrionswarm", "windup": .5,
            "mana": 0, "cooldown": 12, "castRange": 1200, "autoRange": 1000,
            "period": .03, "finalStep": 64, "scanRadius": 200, "sideOffset": 150, "aimDistance": 1200,
            "motion": [
                {"steps": [1, 11], "from": ["liveCaster", "liveCaster"], "to": ["P1", "P2"], "numerator": "n", "denominator": 12},
                {"steps": [12, 32], "from": ["P1", "P2"], "to": ["F", "F"], "numerator": "n-11", "denominator": 22},
                {"steps": [33, 53], "from": ["F", "F"], "to": ["P2", "P1"], "numerator": "n-32", "denominator": 22},
                {"steps": [54, 63], "from": ["P2", "P1"], "to": ["liveCaster", "liveCaster"], "numerator": "n-53", "denominator": 12},
            ],
            "perAxeTargetLimit": 1, "totalTargetLimitPerCast": 2, "castKey": "castId", "visitKey": ["castId", "axeIndex", "targetId"],
            "carrier": ["q053", "BHwe", 3], "targetOwner": 11, "targetLifeAbove": 0,
            "damage": {"rankPercent": FACTORS, "rankZeroPercent": 30, "read": "perPulseCurrentSlotUnitRankAndMaxLife",
                       "source": "capturedCaster", "attack": False, "ranged": False, "type": ["HERO", "NORMAL", "WHOKNOWS"]},
            "cleanup": {"noScanOnFinalStep": True, "scepterRead": "onCleanupCurrentSlotUnit",
                        "scepterCooldownState": [1, 0], "resetAbsentAbility": False},
        },
    }


def replay():
    path = ROOT / "tools/audit-wisp-link-overcharge-relocate.py"
    vm = {"__file__": str(path)}
    exec(compile(path.read_text().split("\nCOUNT=0;VECTORS=[]", 1)[0], path, "exec"), vm)
    closure, function, execute, unit = (vm[k] for k in ("Closure", "function", "execute", "unit"))
    checks = []

    def check(label, passed):
        assert passed, label
        checks.append(label)

    def angle(a, b):
        return degrees(atan2(b["y"] - a["y"], b["x"] - a["x"]))

    class World(vm["World"]):
        def __init__(self):
            super().__init__()
            self.creations, self.targets, self.hits, self.scans, self.hit_axes = [], [], [], [], []
            self.on_hit = lambda target: None
            self.hero = unit("H056", A214=1)
            self.hero.update(userData=7)
            self.hero["state"]["maxLife"] = 100
            self.env["Tower_ALL"][7] = self.hero
            self.env["math"]["rad"] = radians
            self.env.update(
                _loop_=closure("main/f3/f5", [lambda *a: None]), AddArrAny=closure("main/f7/f22", [self.env]),
                GetUnitUserData=lambda u: u["userData"], SetUnitFacing=lambda u, a: u.update(facing=a),
                Cos=cos, Sin=sin, I2R=lambda a: float(int(a)),
                DistanceBetweenPoints=lambda a, b: hypot(a["x"] - b["x"], a["y"] - b["y"]),
                Location=lambda x, y: {"x": x, "y": y}, AngleBetweenPoints=angle,
                CreateUnit=self.create, UnitApplyTimedLife=lambda u, b, t: u.update(fallback=[b, t]),
                SetUnitX=lambda u, x: u.update(x=x), SetUnitY=lambda u, y: u.update(y=y),
                RemoveUnit=lambda u: u.update(deleted=True) if u else None,
                CreateGroup=list, GroupEnumUnitsInRange=self.scan, FirstOfGroup=lambda g: g[0] if g else None,
                GroupRemoveUnit=lambda g, u: g.pop(0), GroupClear=list.clear, DestroyGroup=lambda g: None,
                IsUnitOwnedByPlayer=lambda u, p: u["owner"] == p, UNIT_STATE_MAX_LIFE="maxLife",
                ATTACK_TYPE_HERO="HERO", DAMAGE_TYPE_NORMAL="NORMAL", WEAPON_TYPE_WHOKNOWS="WHOKNOWS",
                UnitDamageTarget=self.damage_target,
            )
            self.env["SetPhyDamage"] = closure("main/f7/f33", [self.env])
            execute(function("main/f155"), [self.env], (lambda name: self.japi,))
            self.cast_axes = self.env["A214_Action"]
            self.steps, self.timers = self.cast_axes.ups[1:3]

        def create(self, owner, kind, x, y, facing):
            carrier = unit(kind, owner)
            carrier.update(x=x, y=y, facing=facing)
            self.creations.append(carrier)
            return carrier

        def scan(self, group, x, y, radius, query_filter):
            self.scans.append((self.now, x, y, radius))
            group.extend(u for u in self.targets if hypot(u["x"] - x, u["y"] - y) <= radius)

        def damage_target(self, s, t, damage, *flags):
            self.hit_axes.append((len(self.scans) - 1) % 2)
            self.hits.append((self.now, s, t, damage, *flags))
            self.on_hit(t)

        def launch(self):
            self.cast_axes(self.hero, {"x": 20, "y": 0})
            return self.timers[7]

        def monster(self, x, y, owner=11, life=100):
            target = unit("monster", owner)
            target.update(x=x, y=y, life=life)
            self.targets.append(target)
            return target

    w = World()
    first = w.launch()
    check("source spawns distinct q053 with BHwe 3 fallback and 30 ms clock",
          w.steps[7] == 1 and first["period"] == Fraction(3, 100) and len(w.creations) == 2
          and all(u["kind"] == "q053" and u["fallback"] == ["BHwe", 3] for u in w.creations))
    w.advance(.33)
    check("source n11 remains within initial 11/12 interpolation",
          isclose(w.creations[0]["x"], 400 * 11/12) and isclose(w.creations[0]["y"], -150 * 11/12))
    target = w.monster(1200, 0)
    w.advance(.93)
    before = w.creations[0]["y"]
    w.advance(.96)
    at = w.creations[0]["y"]
    w.advance(.99)
    after = w.creations[0]["y"]
    check("source crosses between the n32 and n33 samples", before < at < 0 < after)
    check("source visit table clears before n32 and lets the same axe claim the crossover target twice",
          w.hit_axes == [0, 0] and w.hits[0][0] < Fraction(24, 25) == w.hits[1][0]
          and all(h[2] is target for h in w.hits))
    w.advance(1.59)
    w.hero["x"] = 120
    w.advance(1.89)
    check("source final movement interpolates toward current captured caster location with swapped sides",
          isclose(w.creations[0]["x"], 400 + (120 - 400) * 10/12) and isclose(w.creations[0]["y"], 25))
    w.hero["items"].add("i310")
    w.advance(1.92)
    check("source n64 performs cleanup and live-scepter cooldown reset with no additional scan",
          len(w.scans) == 126 and not first["alive"] and not w.timers and not w.steps
          and all(c["deleted"] for c in w.creations) and w.hero["cd"].get("A214") == 0)

    w = World()
    w.launch()
    w.advance(.33)
    one = w.monster(436, -143)
    w.monster(436, -143, owner=0)
    w.monster(436, -143, life=0)
    two = w.monster(436, 143)
    replacement = unit("currentSlotUnit", A214=3)
    replacement.update(userData=7)
    replacement["state"]["maxLife"] = 150
    w.env["Tower_ALL"][7] = replacement

    def first_hit(target):
        replacement["state"]["maxLife"] = 300
        if target is one:
            w.monster(436, 143)

    w.on_hit = first_hit
    w.advance(.36)
    check("source reads current slot stats once, uses captured caster for HERO/NORMAL child, scans the second circle afterward",
          len(w.hits) == 3 and w.hits[0][2] is one and w.hits[1][2] is two
          and all(h[1] is w.hero and h[3:] == (90, False, False, "HERO", "NORMAL", "WHOKNOWS") for h in w.hits))
    later = w.monster(470, -136)
    replacement["skills"].pop("A214")
    w.advance(.39)
    check("source next pulse rereads maximum life and applies rank-zero fallback while source slot remains",
          len(w.hits) == 4 and w.hits[-1][2] is later and w.hits[-1][3] == 90)
    w.env["Tower_ALL"].clear()
    timer = w.timers[7]
    w.advance(.42)
    check("source missing slot terminates both carriers at next callback", not timer["alive"] and all(c["deleted"] for c in w.creations))

    w = World()
    old = w.launch()
    w.advance(.09)
    fresh = w.launch()
    w.advance(.12)
    check("source recast orphans the old timer at reverse lookup -1", old["alive"] and fresh["alive"]
          and w.steps == {7: 2} and ("destroyTimer", old["id"]) not in w.log
          and not any(c.get("deleted") for c in w.creations[:2]))
    w.advance(1.92)
    check("source old timer reaches nominal return without cleaning itself or its carriers",
          old["alive"] and fresh["alive"] and not any(c.get("deleted") for c in w.creations[:2]))

    # Only the chosen ownership/visit contract. Movement and damage are proved using the VM above.
    world = vm["World"]()
    active = {}

    def start(cast):
        active[cast] = [set(), set()]
        world.start(world.timer(), 1.92, False, lambda: active.pop(cast))

    start(1)
    world.advance(.09)
    start(2)

    def hit(cast, axe, target):
        seen = active[cast][axe]
        if target in seen:
            return False
        seen.add(target)
        return True

    check("Q63 both axes can hit one target on the same tick and each retains its mark through return",
          hit(1, 0, "mob") and hit(1, 1, "mob") and not hit(1, 0, "mob") and not hit(1, 1, "mob"))
    check("Q54 another cast has separate axe marks", hit(2, 0, "mob") and not hit(2, 0, "mob"))
    saved = json.dumps({k: [sorted(side) for side in visits] for k, visits in active.items()})
    active = {int(k): [set(side) for side in visits] for k, visits in json.loads(saved).items()}
    world.advance(1.92)
    check("Q54/Q63 restore and old return retain younger cast and its precise per-axe marks",
          not hit(2, 0, "mob") and hit(2, 1, "mob") and set(active) == {2})
    world.advance(2.01)
    check("Q54 younger cast returns on its original relative clock", not active)
    return checks


def main():
    report = metadata()
    report["probes"] = replay()
    body = json.dumps(report, default=list, ensure_ascii=False, indent=2) + "\n"
    if sys.argv[1:] == ["--write"]:
        OUT.write_text(body)
    else:
        assert OUT.read_text() == body
    print(f"A214 ready, {len(report['probes'])} boundary probes, 20 workbook cells")


if __name__ == "__main__":
    main()
