#!/usr/bin/env python3
"""Verify A207 source and replay its two damage events and shared bounce counter."""
from contextlib import closing
from hashlib import sha256
from pathlib import Path
import json
import math
import re
import sys

import audit_index as ai

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/rules/paralyzing-cask.json"
DAMAGES = [200, 600, 1000, 1400, 1800, 2200]
LIMITS = [4, 6, 8, 10, 12, 14]
PACKET = [False, False, "NORMAL", "MAGIC", "WHOKNOWS"]


def source_data():
    with closing(ai.connect()) as db:
        rows = ai.workbook_rows(db, "A207", "塔技能")
        assert len(rows) == 2 and rows[0]["cells"] == rows[1]["cells"] and rows[0]["row"] == rows[1]["row"] == 275
        cells = rows[0]["cells"]
        assert "1.5秒眩晕" in cells[7] and "冷却 8秒" in cells[7]
        ranks = []
        objects = {identifier: [r for table in tables for r in ai.objects(db, identifier, table)]
                   for identifier, tables in {
                       "A207": ("units_abilitydata", "war3map.w3a"),
                       "T231": ("units_abilitydata",),
                       "q052": ("units_unitabilities", "units_unitweapons"),
                       "H055": ("units_unitweapons",),
                   }.items()}
        assert objects["H055"][0]["fields"]["castpt"] == .3
        mods = {m["level"]: m["value"] for m in objects["A207"][1]["fields"]["mods"] if m["key"] == "amcs"}
        for rank, line in enumerate(cells[8].splitlines()[:6], 1):
            vals = re.search(r"造成(\d+)点伤害。最多弹跳(\d+)次。 耗蓝 (\d+)点", line)
            damage, extra, mana = map(int, vals.groups())
            assert [damage, extra] == [DAMAGES[rank - 1], LIMITS[rank - 1]]
            assert mana == (objects["A207"][0]["fields"][f"Cost{rank}"] if rank <= 4 else mods[rank])
            ranks.append({"rank": rank, "damage": damage, "maxAdditionalBounces": extra, "mana": mana})
        slices = {}
        for fn, lo, hi in (("main/f291/f14", 1355, 1365), ("main/f291/f1", 2384, 2404),
                           ("main/f291/f27", 3320, 3349)):
            rows_slice = ai.instructions(db, fn, lo, hi)
            assert len(rows_slice) == hi - lo + 1
            assert any("A207" in [data["value"] for data in ins["constants"].values()] for ins in rows_slice)
            slices[fn] = {"pc": [lo, hi], "sourceLines": [rows_slice[0]["sourceLine"], rows_slice[-1]["sourceLine"]]}
    t231 = objects["T231"][0]["fields"]
    assert [t231[f] for f in ("DataA1", "Rng1", "Dur1", "HeroDur1", "BuffID1", "levels")] == [100, 3000, 1.5, .6, "BPSE", 1]
    return {
        "baseline": "paralyzing-cask-v1", "status": "ready", "workbooks": rows,
        "source": {"path": ai.DISASM, "sha256": sha256((ROOT / ai.DISASM).read_bytes()).hexdigest()},
        "ranks": ranks, "objects": objects, "pipelineSlices": slices,
        "web": {"cooldown": 8, "range": 700, "castPoint": .3, "bounceRadius": 600, "scepterBonus": 2,
                "counter": {"decision": "Q54", "key": "castId", "liveRankAndScepter": True,
                            "limitsCountFirstHit": False},
                "packet": PACKET, "carrier": {"rawcode": "q052", "ability": "T231", "duration": 1, "range": 3000,
                                             "missileSpeed": 1000, "triggerDamage": 100, "stun": 1.5}},
    }


def probes():
    path = ROOT / "tools/audit-wisp-link-overcharge-relocate.py"
    vm = {"__file__": str(path)}
    exec(compile(path.read_text().split("\nCOUNT=0;VECTORS=[]", 1)[0], path, "exec"), vm)
    closure, function, execute, unit = (vm[key] for key in ("Closure", "function", "execute", "unit"))

    class World(vm["World"]):
        def __init__(self):
            super().__init__()
            self.group = []
            self.shots = []
            self.native = []
            self.scepter = False
            self.on_child = lambda *_: None
            self.env.update(
                _loop_=closure("main/f3/f5", [lambda e: None]), CreateUnitAtLoc=self.create,
                CreateTempAndSetAbilityLv=closure("main/f7/f20", [self.env]), SetMagicDamage=closure("main/f7/f34", [self.env]),
                UnitApplyTimedLife=lambda u, b, t: u.update(timedLife=(b, t)),
                GetUnitUserData=lambda u: u["userData"], SetUnitUserData=lambda u, n: u.update(userData=n),
                IssueTargetOrder=lambda u, order, target: self.shots.append((u, order, target)),
                Has_A_Item=lambda u: self.scepter, CreateGroup=list, GroupEnumUnitsInRange=self.enumerate,
                FirstOfGroup=lambda g: g[0] if g else None, GroupRemoveUnit=lambda g, u: g.pop(0),
                GroupClear=list.clear, DestroyGroup=lambda g: None, IsUnitOwnedByPlayer=lambda u, player: u["owner"] == player,
                UnitDamageTarget=self.child, ATTACK_TYPE_NORMAL="NORMAL", DAMAGE_TYPE_MAGIC="MAGIC", WEAPON_TYPE_WHOKNOWS="WHOKNOWS",
            )
            execute(function("main/f152"), [self.env], (lambda _: self.japi,))
            self.counter = self.env["A207_Eff"].ups[2]

        def create(self, owner, identifier, point, facing):
            dummy = unit(identifier, owner)
            dummy.update(point, facing=facing)
            return dummy

        def enumerate(self, g, x, y, radius, _):
            g.extend(target for target in self.group if math.hypot(x - target["x"], y - target["y"]) <= radius)

        def child(self, owner, target, amount, *flags):
            self.native.append((owner, target, amount, flags))
            self.on_child(owner, target)
            return True

        def cast(self, source, target):
            execute(function("main/f291/f14"), [self.env], ("A207", source, target), start_pc=1355, stop_pc=1365)
            return self.shots[-1]

        def hit(self, shot, owner):
            q, _, target = shot
            self.damage = 100
            self.shots.clear()
            execute(function("main/f291/f1"), [self.env], (q, target, owner), start_pc=2384, stop_pc=2404)
            return self.shots[-1] if self.shots else None

    checks = []

    def check(name, condition):
        assert condition, name
        checks.append(name)

    owner = unit("H055", 0, A207=1)
    owner.update(userData=17, x=7)
    a, b, dead = unit("a", 11), unit("b", 11), unit("dead", 11)
    b["x"], dead["life"] = 600, 0
    w = World()
    w.env["Tower_ALL"][9] = owner
    first = w.cast(owner, a)
    q, order, target = first
    check("first cast uses current UnitUserData, not Tower_ALL reverse search",
          w.counter == {17: 1} and q["userData"] == 17 and q["x"] == 7 and order == "thunderbolt" and
          target is a and q["skills"] == {"T231": 1} and q["timedLife"] == ("BHwe", 1))
    check("unresolved owner preserves carrier damage and does not touch slot",
          w.hit(first, None) is None and w.damage == 100 and w.counter == {17: 1})

    for rank, has_scepter in ((1, False), (6, True)):
        w = World()
        w.scepter = has_scepter
        w.group = [a, dead, b]
        owner["skills"]["A207"] = rank
        shot = w.cast(owner, a)
        while shot:
            shot = w.hit(shot, owner)
            assert w.damage == 0
        cap = LIMITS[rank - 1] + 2 * has_scepter
        check(f"source initial 1 and >= cap means {cap - 1} total hits",
              len(w.native) == cap - 1 and not w.counter and all(
                  o is owner and amount == DAMAGES[rank - 1] and flags == tuple(PACKET)
                  for o, _, amount, flags in w.native))

    w = World()
    owner["skills"]["A207"] = 1
    w.group = [a, b]
    first = w.cast(owner, a)
    second = w.hit(first, owner)
    w.on_child = lambda o, target: w.cast(o, b)
    w.hit(second, owner)
    check("synchronous child recast count 1 is overwritten by captured old count + 1", w.counter == {17: 3}
          and len(w.shots) == 2 and w.shots[0][2] is b)
    w.on_child = lambda *_: None
    stale = w.shots[0]
    assert w.hit(w.shots[1], owner) is None and not w.counter
    resumed = w.hit(stale, owner)
    check("late cast lands after slot clear, emits damage and restarts nil from count 1",
          resumed is not None and w.counter == {17: 1} and w.native[-1][2] == 200)

    w = World()
    w.group = [a, b]
    first = w.cast(owner, a)
    second = w.hit(first, owner)
    owner["skills"]["A207"] = 2
    w.scepter = True
    third = w.hit(second, owner)
    check("landings use current rank and scepter", w.native[-1][2] == 600 and third is not None)
    w.scepter = False
    owner["skills"]["A207"] = 1
    check("losing scepter and lowering rank can close on the very next hit",
          w.hit(third, owner) is None and w.native[-1][2] == 200 and not w.counter)

    w = World()
    w.group = [a, b]
    terminal = w.cast(owner, a)
    for _ in range(2):
        terminal = w.hit(terminal, owner)
    w.on_child = lambda *_: setattr(w, "scepter", True)
    check("acquiring scepter inside the child cannot increase this hit's captured limit",
          w.hit(terminal, owner) is None and w.scepter and not w.counter)

    w = World()
    w.group = [a, b]
    first = w.cast(owner, a)

    def move_change(owner, target):
        target["x"] = -200
        owner["userData"] = 21
    w.on_child = move_change
    bounced = w.hit(first, owner)
    check("bounce position and group center captured before child, but new carrier reads current UserData",
          bounced[0]["x"] == 0 and bounced[2] is b and bounced[0]["userData"] == 21
          and w.counter == {17: 2})
    a["x"], owner["userData"] = 0, 17
    w = World()
    w.group = [dead]
    check("no viable target clears original counter", w.hit(w.cast(owner, a), owner) is None and not w.counter)

    w = World()
    w.group = [a, b]
    selected = {}
    effect = w.env["A207_Eff"]
    clear = effect.ups[3]

    def cast_independently(cast_id, aim):
        shot = w.cast(owner, aim)
        # The original VM increments before comparing: -1 encodes no head hit yet.
        selected[cast_id] = {owner["userData"]: -1}
        return shot

    def land_independently(cast_id, shot):
        old_effect, old_clear = effect.ups[2], clear.ups[0]
        effect.ups[2] = clear.ups[0] = selected[cast_id]
        try:
            return w.hit(shot, owner)
        finally:
            effect.ups[2], clear.ups[0] = old_effect, old_clear

    old = land_independently("old", cast_independently("old", a))
    later = []

    def recast_during_child(*_):
        later.append(cast_independently("new", b))

    w.on_child = recast_during_child
    old = land_independently("old", old)
    w.on_child = lambda *_: None
    check("Q54 child recast cannot overwrite old progress or inherit it",
          selected == {"old": {17: 1}, "new": {17: -1}} and len(later) == 1)
    saved = json.loads(json.dumps({cast: slots[17] for cast, slots in selected.items()}))
    selected = {cast: {17: progress} for cast, progress in saved.items()}
    for _ in range(3):
        old = land_independently("old", old)
    check("Q54 restored old chain lands a head plus four without clearing the late new chain",
          old is None and selected == {"old": {}, "new": {17: -1}} and len(w.native) == 5)

    owner["skills"]["A207"], w.scepter = 2, True
    new = later[0]
    for _ in range(4):
        new = land_independently("new", new)
    check("Q54 late new chain samples its current damage and boost independently",
          new is not None and selected["new"] == {17: 3} and all(hit[2] == 600 for hit in w.native[-4:]))
    owner["skills"]["A207"], w.scepter = 1, False
    check("Q54 drop in live cap stops next legal impact without rolling it back",
          land_independently("new", new) is None and not selected["new"] and w.native[-1][2] == 200)

    names = ["main/f152", *(f"main/f152/f{i}" for i in range(4))]
    return {"checks": checks, "functionLines": {fn: function(fn)["sourceLines"] for fn in names},
            "instructionCoverage": {fn: len(vm["COVER"][fn]) for fn in names + ["main/f291/f1", "main/f291/f14", "main/f7/f34"]}}


def main():
    report = source_data()
    report["verification"] = probes()
    serialized = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if "--write" in sys.argv:
        OUT.write_text(serialized)
    else:
        assert OUT.read_text() == serialized, OUT
    print(f'{len(report["verification"]["checks"])} boundary probes, 20 workbook cells checked')


if __name__ == "__main__":
    main()
