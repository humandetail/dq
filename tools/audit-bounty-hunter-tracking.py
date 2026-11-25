#!/usr/bin/env python3
"""Check shared source records and execute the bounty marker and bounce Lua slices."""
from contextlib import closing
from hashlib import sha256
from pathlib import Path
import json
import math
import re
import sys

import audit_index as ai

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/rules/bounty-hunter-tracking.json"
IDS = ("A089", "A090", "A091")
RNG = [[10, 50], [15, 60], [20, 70], [25, 80], [30, 90], [50, 110]]
STOMP_WEB = {"radius": 275, "duration": 2, "heroDuration": 2}
MARK_SECONDS = 10
BOUNCE_SOURCE = 6
BOUNCE_WEB = 7


def source_data():
    with closing(ai.connect()) as db:
        books = {}
        for identifier in IDS:
            rows = ai.workbook_rows(db, identifier, "塔技能")
            assert len(rows) == 4 and rows[0]["cells"] == rows[2]["cells"] and rows[1]["cells"] == rows[3]["cells"]
            assert rows[0]["cells"][1] == "G056" and rows[1]["cells"][1] == "H028"
            assert rows[0]["cells"][4:] == rows[1]["cells"][4:]
            books[identifier] = {
                "verifiedWorkbooks": [rows[0]["sourcePath"], rows[2]["sourcePath"]],
                "rowColumnsAtoD": {str(row["row"]): row["cells"][:4] for row in rows[:2]},
                "sharedColumnsEtoJ": rows[0]["cells"][4:],
            }
        objects = {}
        for identifier in (*IDS, "T090", "T091", "T092", "q024", "q001", "B089", "B090", "X003", "H028", "G056"):
            tables = ("units_abilitydata", "war3map.w3a", "units_unitabilities", "units_unitweapons", "units_abilitybuffdata")
            objects[identifier] = [record for table in tables for record in ai.objects(db, identifier, table)]
        literals = {name: ai.references(db, name) for name in [
            *IDS, "A089_Number", "A089_Eff", "A091_Action", "A091_DefUnits", "A091_AddMoney", "A091_End", "B089", "B090"
        ]}
        slices = {}
        for function, begin, end in [("main/f291/f1", 2297, 2317), ("main/f291/f14", 609, 627),
                                     ("main/f291/f14", 638, 647), ("main/f291/f9", 315, 318)]:
            ins = ai.instructions(db, function, begin, end)
            assert len(ins) == end - begin + 1
            slices[f"{function}:{begin}"] = {"pc": [begin, end], "lines": [ins[0]["sourceLine"], ins[-1]["sourceLine"]]}
    assert not literals["B089"] and not literals["B090"]
    ranks = []
    for rank in range(1, 7):
        values = []
        patterns = [r"造成(\d+)伤害。 耗蓝 (\d+)点。冷却 (\d+)秒",
                    r"禁锢(\d+)范围的敌人(\d+)秒，造成(\d+)点伤害.*?(\d+)范围.*?(\d+)%",
                    r"降低目标(\d+)点护甲，额外赏金为(\d+)~(\d+)。 耗蓝 (\d+)点"]
        for key, pattern in zip(IDS, patterns):
            line = books[key]["sharedColumnsEtoJ"][4].splitlines()[rank - 1]
            values.append(list(map(int, re.search(pattern, line).groups())))
        (dart, dart_cost, dart_cd), (radius, stun, stomp, aura_radius, slow), (armor, low, high, cost) = values
        assert [radius, stun, aura_radius, slow, [low, high]] == [275, 2, 400, 30, RNG[rank - 1]]
        for key, fields in {"A089": (("Cost", "amcs", dart_cost), ("Cool", "acdn", dart_cd)),
                            "T090": (("DataA", "Htb1", dart),), "T091": (("DataA", "Wrs1", stomp),),
                            "A091": (("DataA", "Fae1", armor), ("Cost", "amcs", cost), ("Cool", "acdn", 11 - rank))}.items():
            for slk, w3a, value in fields:
                observed = objects[key][0]["fields"][f"{slk}{rank}"] if rank <= 4 else next(
                    row["value"] for row in objects[key][1]["fields"]["mods"] if row["key"] == w3a and row["level"] == rank)
                assert observed == value
        ranks.append({"rank": rank, "dartDamage": dart, "dartMana": dart_cost, "dartCd": dart_cd, "stompDamage": stomp,
                      "armorReduction": armor, "markMana": cost, "markCd": 11 - rank, "bounty": [low, high]})
    stomp = objects["T091"][0]["fields"]
    assert [stomp[f"{key}{rank}"] for rank in range(1, 5) for key in ("Area", "Dur", "HeroDur")] == [350, 2, 1] * 4
    aura = objects["T092"][0]["fields"]
    assert [aura[k + "1"] for k in ("Area", "DataA", "BuffID", "EfctID")] == [400, -.3, "B089", "X003"]
    source = ROOT / ai.DISASM
    return {"baseline": "bounty-hunter-tracking-v1", "source": {"path": ai.DISASM, "sha256": sha256(source.read_bytes()).hexdigest()},
            "workbooks": books, "ranks": ranks, "objects": objects, "literalReferences": literals, "pipelineSlices": slices,
            "status": {"A089": "ready", "A090": "ready", "A091": "ready"},
            "bounceEvidence": {"sourceCounterInitial": 1, "sourceCounterStopAfter": BOUNCE_SOURCE,
                               "webCounterStopAfter": BOUNCE_WEB, "actualKey": "Tower_ALL index", "webKey": "castId", "decision": "Q52"},
            "web": {"bounceMaximumExtra": 6, "bounceRadius": 600, "stomp": STOMP_WEB,
                    "aura": {"seconds": 4, "radius": 400, "moveFraction": -.3, "stack": "single"},
                    "track": {"seconds": MARK_SECONDS, "range": 1300, "endlessFactor": .5, "customHeroFactor": 6}}}


def probe():
    runner = ROOT / "tools/audit-wisp-link-overcharge-relocate.py"
    vm = {"__file__": str(runner)}
    exec(compile(runner.read_text().split("\nCOUNT=0;VECTORS=[]", 1)[0], runner, "exec"), vm)
    closure, function, run, unit = (vm[k] for k in ("Closure", "function", "execute", "unit"))

    class World(vm["World"]):
        def __init__(self, cap=BOUNCE_SOURCE):
            super().__init__()
            self.group = []
            self.orders = []
            self.dummies = []
            self.on_stomp = lambda: None
            self.gold = {}
            self.income = []
            self.random = []
            self.env.update(
                _loop_=closure("main/f3/f5", [lambda e: None]), AddArrUnit=closure("main/f7/f21", [self.env]),
                CreateTempAndSetAbilityLv=closure("main/f7/f20", [self.env]),
                CreateUnitAtLoc=self.create, UnitApplyTimedLife=lambda u, b, t: u.update(timedLife=(b, t)),
                SetUnitUserData=lambda u, index: u.update(userData=index),
                IssueTargetOrder=lambda u, o, t: self.orders.append((u, o, t)),
                IssueImmediateOrder=self.immediate_order,
                CreateEffAtLoc=lambda *a: None, CreateEffByUnit=lambda *a: None,
                CreateGroup=list, GroupEnumUnitsInRange=self.enumerate,
                FirstOfGroup=lambda g: g[0] if g else None, GroupRemoveUnit=lambda g, u: g.pop(0),
                GroupClear=list.clear, DestroyGroup=lambda g: None,
                IsUnitOwnedByPlayer=lambda u, p: u["owner"] == p,
                CreateTextByUnit=lambda *a: None, UpDate_GetGold_Arr=lambda *a: self.income.append(a),
                GetRandomInt=lambda a, b: self.random.append([a, b]) or a + 1,
                GetPlayerId=int, GetUnitName=lambda u: u["kind"], PLAYER_STATE_RESOURCE_GOLD="gold",
                GetPlayerState=lambda p, _: self.gold.get(p, 0), SetPlayerState=lambda p, _, gold: self.gold.update({p: gold}),
                UNIT_TYPE_SAPPER="sapper", IsUnitType=lambda u, k: u.get(k, False),
            )
            self.env["UnitIsHero"] = closure("main/f7/f45", [self.env])
            run(function("main/f78"), [self.env])
            run(function("main/f79"), [self.env])
            assert self.env["A089_Eff"].ups[1] == BOUNCE_SOURCE
            self.env["A089_Eff"].ups[1] = cap

        def create(self, owner, kind, point, facing):
            dummy = unit(kind, owner)
            dummy.update(point, facing=facing)
            self.dummies.append(dummy)
            return dummy

        def immediate_order(self, dummy, order):
            self.orders.append((dummy, order, None))
            if order == "stomp":
                self.on_stomp()

        def enumerate(self, g, x, y, radius, _):
            g.extend(u for u in self.group if math.hypot(u["x"] - x, u["y"] - y) <= radius)

        def mark(self, caster, target):
            self.env["A091_Action"](caster, target)

        def cast_dart(self, caster, target, scepter=False):
            e = dict(self.env, Has_A_Item=lambda u: scepter)
            run(function("main/f291/f14"), [e], ("A089", caster, target), start_pc=609, stop_pc=627)
            return self.orders[-1]

        def hit(self, source, target, resolved):
            run(function("main/f291/f1"), [self.env], (source, target, resolved), start_pc=2297, stop_pc=2317)
            return next((event for event in self.orders if event[0]["kind"] == "q024"), None)

        def bounty(self, killer, victim):
            self.env["A091_AddMoney"](killer, victim)

    checks = []

    def check(label, condition):
        assert condition, label
        checks.append(label)

    caster, replacement, killer = unit("G056", 0, A089=6, A090=4, A091=1), unit("H028", 1, A091=6), unit("H002", 2)
    a, b, decoy = unit("a", 11), unit("b", 11), unit("ally", 0)
    b["x"] = 600
    w = World()
    w.env["Tower_ALL"][7] = caster
    first = w.cast_dart(caster, a, True)
    check("A089 writes caster index before launch then applies scepter marker", first[0]["userData"] == 7
          and first[0]["skills"] == {"T090": 6} and first[0]["timedLife"] == ("BHwe", 1)
          and list(w.env["A091_SkillUnit"].values()) == [caster])
    w.orders.clear()
    w.hit(first[0], a, killer)
    check("A090 must be learned by resolved owner", not w.orders and len(w.dummies) == 1)

    for cap in (BOUNCE_SOURCE, BOUNCE_WEB):
        w = World(cap)
        w.env["Tower_ALL"][7] = caster
        w.group = [decoy, a, b]
        for target in w.group:
            w.mark(replacement, target)
        dart = w.cast_dart(caster, a)
        hits = []
        while dart:
            d, _, target = dart
            hits.append(target["kind"])
            w.orders.clear()
            dart = w.hit(d, target, caster)
            stomp, aura = w.dummies[-3:-1] if dart else w.dummies[-2:]
            assert stomp["skills"] == {"T091": 4} and stomp["userData"] == 7 and stomp["timedLife"] == ("BHwe", 1)
            assert aura["skills"] == {"T092": 1} and "userData" not in aura and aura["timedLife"] == ("BHwe", 4)
        check(f"stationary first hit and {cap - 1} bounces, including repeated prior targets",
              hits == (["a", "b"] * cap)[:cap] and not w.env["A089_Number"])

    w = World()
    w.env["Tower_ALL"][7] = caster
    w.group = [a, b]
    w.mark(replacement, b)
    first = w.cast_dart(caster, a)
    w.orders.clear()
    b["x"] = 601
    w.on_stomp = lambda: a.update(x=1)
    bounce = w.hit(first[0], a, caster)
    check("stomp reentry moves scan center but not carrier spawn snapshot",
          bounce is not None and bounce[0]["x"] == 0 and bounce[2] is b and w.dummies[-2]["x"] == 0)
    a["x"], b["x"] = 0, 600

    w = World(BOUNCE_WEB)
    w.env["Tower_ALL"][7] = caster
    w.group = [a, b]
    for target in w.group:
        w.mark(replacement, target)
    old = w.cast_dart(caster, a)
    for _ in range(5):
        w.orders.clear()
        old = w.hit(old[0], old[2], caster)
    w.cast_dart(caster, b)
    for _ in range(3):
        w.orders.clear()
        old = w.hit(old[0], old[2], caster)
    check("overlapping cast resets the shared slot and permits old chain to launch bounce 8",
          old is not None and w.env["A089_Number"][7] == 4)

    w = World(BOUNCE_WEB)
    w.env["Tower_ALL"][7] = caster
    w.group = [a, b]
    for target in w.group:
        w.mark(replacement, target)
    old, new = w.cast_dart(caster, a), w.cast_dart(caster, b)
    def land(event):
        w.orders.clear()
        return w.hit(event[0], event[2], caster)
    for _ in range(3):
        old, new = land(old), land(new)
    check("competition can terminate the old projectile after only three bounces",
          land(old) is None and not w.env["A089_Number"])
    before = len(w.dummies)
    try:
        land(new)
    except TypeError as exc:
        assert "NoneType" in str(exc)
    else:
        raise AssertionError("expected original nil shared counter arithmetic")
    check("late hit applies both wind effects before reading its cleared counter", len(w.dummies) == before + 2)

    w = World(BOUNCE_WEB)
    w.env["Tower_ALL"][7] = caster
    w.group = [a, b]
    for target in w.group:
        w.mark(replacement, target)

    counters = {"old": {7: 1}, "new": {7: 1}}
    old, new = w.cast_dart(caster, a), w.cast_dart(caster, b)

    def land_isolated(cast, event):
        # Apply Q52 to the counter storage only and replay the original selection.
        original = w.env["A089_Number"]
        w.env["A089_Number"] = counters[cast]
        try:
            return land(event)
        finally:
            w.env["A089_Number"] = original

    for _ in range(5):
        old = land_isolated("old", old)
    for _ in range(2):
        new = land_isolated("new", new)
    check("Q52 independently tracks old and new progress", counters == {"old": {7: 6}, "new": {7: 3}})
    saved = json.dumps({cast: slots[7] for cast, slots in counters.items()})
    counters = {cast: {7: value} for cast, value in json.loads(saved).items()}
    for _ in range(2):
        old = land_isolated("old", old)
        new = land_isolated("new", new)
    check("Q52 restored old chain closes after its own seventh hit without clearing new progress",
          old is None and new is not None and counters == {"old": {}, "new": {7: 5}})
    for _ in range(3):
        new = land_isolated("new", new)
    check("Q52 restored new chain independently completes six total bounces",
          new is None and counters == {"old": {}, "new": {}})

    w = World()
    w.mark(caster, a)
    w.advance(2)
    old_timer = next(iter(w.env["A091_Timer"].values()))
    w.mark(replacement, a)
    w.advance(10)
    check("last marker and replacement timer survive cancelled old expiry",
          not old_timer["alive"] and list(w.env["A091_SkillUnit"].values()) == [replacement])
    w.bounty(None, a)
    check("missing killer leaves marker intact", bool(w.env["A091_Timer"]) and not w.gold)
    replacement.update(owner=3)
    replacement["skills"]["A091"] = 3
    a.update(sapper=True)
    a["skills"]["N534"] = 1
    w.env["Game_Mode"] = 1
    w.bounty(killer, a)
    check("death pays current marker rank and owner, custom hero then endless",
          w.gold == {3: 63} and w.random == [[20, 70]] and w.income == [(3, "追踪术", "H028", 63)])
    w.bounty(killer, a)
    check("consume once and before payout", all(not w.env[k] for k in ("A091_Timer", "A091_SkillUnit", "A091_DefUnits"))
          and w.gold == {3: 63})
    replacement["skills"]["A091"] = 0
    w.mark(replacement, a)
    w.bounty(killer, a)
    check("unlearned A091 consumes marker without a draw", not w.env["A091_Timer"] and len(w.random) == 1)
    w.mark(caster, b)
    w.advance(20)
    check("expiry clears all three tracked slots", all(not w.env[k] for k in ("A091_Timer", "A091_SkillUnit", "A091_DefUnits")))

    w = World()
    w.mark(caster, a)
    a["life"] = 0
    w.bounty(None, a)
    old_timer = w.env["A091_Timer"][1]
    w.mark(replacement, b)
    check("dead occupied slot is reusable and cancels its timer",
          not old_timer["alive"] and list(w.env["A091_DefUnits"].values()) == [b])
    w.advance(10)

    for source_timer_first in (True, False):
        w = World()
        kill = lambda: w.bounty(killer, b)
        if source_timer_first:
            w.mark(caster, b)
            w.start(w.timer(), 10, False, kill)
        else:
            w.start(w.timer(), 10, False, kill)
            w.mark(caster, b)
        w.advance(10)
        check(f"same-time Death versus marker expiry, expiry first={source_timer_first}",
              w.gold == ({} if source_timer_first else {0: 11}))

    functions = ["main/f78", "main/f78/f0", "main/f78/f1", "main/f79", *(f"main/f79/f{i}" for i in range(4))]
    return {"checks": checks, "functionLines": {fn: function(fn)["sourceLines"] for fn in functions},
            "instructionCoverage": {fn: len(vm["COVER"][fn]) for fn in functions + ["main/f291/f1", "main/f291/f14"]}}


def main():
    result = source_data()
    result["validation"] = probe()
    serialized = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if "--write" in sys.argv:
        OUT.write_text(serialized)
    else:
        assert OUT.read_text() == serialized, OUT
    print(f'{len(result["validation"]["checks"])} boundary probes, 120 workbook cells checked')


if __name__ == "__main__":
    main()
