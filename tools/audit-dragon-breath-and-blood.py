#!/usr/bin/env python3
"""Project the shared 6.25 source index and exercise the new event boundaries."""
from contextlib import closing
from fractions import Fraction
from hashlib import sha256
from pathlib import Path
import json
import math
import re
import sys

import audit_index as ai

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/rules/dragon-breath-and-blood.json"
SOURCE = ROOT / ai.DISASM
RANKS = range(1, 7)
PERIOD = 1

SLICES = {
    "castEffect": ("main/f291/f14", 170, 178),
    "autoOrder": ("main/f291/f27", 53, 86),
    "damageBridge": ("main/f291/f1", 2013, 2027),
    "deathAttributionAndReward": ("main/f291/f9", 293, 440),
}

WEB = {
    "mainSpell": {"order": "curse", "target": "point", "range": 600, "cooldownSeconds": 10,
                  "humanCastPointSeconds": .5, "dragonCastPointSeconds": .3, "followThroughSeconds": 0},
    "carrier": {"id": "q006", "ability": "T003", "order": "breathoffire", "lifeSeconds": 1.5,
                "speed": 1050, "range": 1000, "length": 600, "endHalfWidth": 600,
                "castPointSeconds": 0, "mana": 0, "budget": 9_999_999,
                "packet": [False, False, "NORMAL", "MAGIC", "WHOKNOWS"]},
    "mark": {"radius": 150, "baseSeconds": 4, "secondsPerA009Level": .5, "perPlayerLimit": 12,
             "sourceLimitOffset": 1, "periodSourceSeconds": .9, "periodWebSeconds": PERIOD,
             "targetOwner": 11, "currentLifeFactor": .3, "factorWithB031": .4,
             "packet": [False, False, "HERO", "NORMAL", "WHOKNOWS"]},
    "death": {"maxLifeGain": 7, "victimOwnersInRegistrationOrder": [11, 0, 1, 2, 3]},
}


def source_data():
    with closing(ai.connect()) as db:
        book_records = {key: ai.workbook_rows(db, key, "塔技能") for key in ("A008", "A009")}
        source_paths = {}
        for rows in book_records.values():
            primary, replica = rows[:14], rows[14:]
            assert len(rows) == 28
            assert [x["cells"] for x in primary] == [x["cells"] for x in replica]
            assert {x["cells"][1] for x in primary} == {
                "G077", "H003", *(f"E{i:03}" for i in [*range(1, 7), *range(23, 29)])
            }
            assert all(len(row["cells"]) == 10 and row["columns"] == [6] for row in rows)
            assert len({tuple(row["cells"][5:]) for row in rows}) == 1
            for row in rows:
                path = row["sourcePath"]
                if path not in source_paths:
                    source_paths[path] = sha256((ROOT / path).read_bytes()).hexdigest()
        references = {key: ai.references(db, key) for key in ("A008", "A009", "T003", "q006")}
        records = {}
        for key in ("A008", "A009", "T003", "ANcl", "AOcr", "ANbf"):
            records[key] = ai.objects(db, key, "units_abilitydata") + ai.objects(db, key, "war3map.w3a")
        records["q006"] = [
            ai.objects(db, "q006", "units_" + table)[0]
            for table in ("unitdata", "unitabilities", "unitbalance", "unitweapons", "unitui")
        ]
        for key in sorted({row["cells"][1] for row in book_records["A008"]}):
            records[key] = (
                ai.objects(db, key, "units_unitweapons", fields=["castpt", "castbsw"])
                + ai.objects(db, key, "units_unitabilities", fields=["heroAbilList"])
            )
        ranges = {}
        for name, (function, start, end) in SLICES.items():
            lines = ai.instructions(db, function, start, end)
            assert len(lines) == end - start + 1
            ranges[name] = {"function": function, "pc": [start, end],
                            "lines": [lines[0]["sourceLine"], lines[-1]["sourceLine"]]}
    base = {key: records[key][0]["fields"] for key in ("A008", "A009", "T003")}
    assert not any(field.startswith("Data") for field in base["A009"])
    assert not any(field.startswith(("DataE", "BuffID")) for field in base["T003"])
    assert len(references["A009"]) == 2 and len(references["A008"]) == 4
    assert all(base[key]["levels"] == 6 for key in base)
    a008_row, a009_row = (book_records[key][0]["cells"] for key in ("A008", "A009"))
    a008_h, a008_i, a008_j = a008_row[7:]
    a009_h, a009_i, a009_j = a009_row[7:]
    assert all(token in a008_h for token in ("每秒", "x30%", "4秒", "12个", "10秒"))
    assert "永久增加7点生命上限" in a009_h and a009_j is None
    mods = {
        key: {(m["key"], m["level"]): m["value"] for m in records[key][1]["fields"]["mods"]}
        for key in ("A008", "T003")
    }
    ranks = []
    for level, (a008, a009) in enumerate(zip(a008_i.splitlines(), a009_i.splitlines()), 1):
        if level not in RANKS:
            break
        damage, limit, mana = map(int, re.findall(r"等级 \d+｜造成(\d+)点法术伤害，火焰印记最多存在(\d+)个。 耗蓝 (\d+)点。", a008)[0])
        added_seconds = float(re.search(r"增加([.\d]+)秒", a009)[1])
        assert limit == 1 + level and added_seconds == .5 * level
        if level <= 4:
            assert mana == base["A008"][f"Cost{level}"]
            assert damage == base["T003"][f"DataA{level}"]
            assert [base["A008"][f"{f}{level}"] for f in ("Cool", "Rng", "DataB", "DataC", "DataF")] == [10, 600, 2, 1, "curse"]
            assert [base["T003"][f"{f}{level}"] for f in ("DataB", "DataC", "DataD", "Rng")] == [9_999_999, 600, 600, 1000]
        else:
            assert mana == mods["A008"]["amcs", level] and str(mana) in a008_j
            assert damage == mods["T003"]["Ucs1", level]
        cooldown = base["T003"][f"Cool{level}"] if level <= 4 else mods["T003"]["acdn", level]
        ranks.append({"level": level, "mana": mana, "hitDamage": damage, "sourceMarkLimit": limit,
                      "extraMarkSeconds": added_seconds, "carrierCooldown": cooldown,
                      "startHalfWidth": base["T003"][f"Area{min(4, level)}"]})
    assert len(ranks) == 6
    compact_books = {}
    for key, rows in book_records.items():
        compact_books[key] = {
            "sharedColumnsEtoJ": rows[0]["cells"][4:],
            "matchedColumnsAtoDByRow": {str(row["row"]): row["cells"][:4] for row in rows[:14]},
            "verifiedWorkbooks": list(source_paths),
        }
    return {"workbooks": compact_books, "workbookSha256": source_paths, "ranks": ranks,
            "objectRecords": records, "literalReferences": references, "pipelineSlices": ranges}


def replays():
    runner = ROOT / "tools/audit-wisp-link-overcharge-relocate.py"
    vm = {"__file__": str(runner)}
    # The shared runner has module-level suite execution after this marker.
    exec(compile(runner.read_text().split("\nCOUNT=0;VECTORS=[]", 1)[0], runner, "exec"), vm)
    closure, function, execute, unit = (vm[key] for key in ("Closure", "function", "execute", "unit"))
    checks = []

    class BreathWorld(vm["World"]):
        def __init__(self, period=.9):
            super().__init__()
            self.period = period
            self.group = []
            self.hits = []
            self.on_hit = lambda *_: None
            self.env.update(
                pairs=vm["pairs"], _loop_=closure("main/f3/f5", [lambda message: None]),
                RemoveLocation=lambda loc: self.log.append(("removeLocation", loc)),
                CreateEffAtLoc=lambda *args: self.log.append(("visual", *args)),
                CreateGroup=list, GroupEnumUnitsInRange=self.enumerate, FirstOfGroup=lambda g: g[0] if g else None,
                GroupRemoveUnit=lambda g, u: g.pop(0), GroupClear=list.clear, DestroyGroup=lambda g: None,
                IsUnitOwnedByPlayer=lambda u, p: self.env["GetOwningPlayer"](u) == p,
                UnitDamageTarget=self.hit, ATTACK_TYPE_HERO="HERO", DAMAGE_TYPE_NORMAL="NORMAL",
                WEAPON_TYPE_WHOKNOWS="WHOKNOWS",
                CreateTempAndSetAbilityLv=closure("main/f7/f20", [self.env]),
                CreateUnitAtLoc=self.create, UnitApplyTimedLife=lambda u, b, t: u.update(timedLife=(b, t)),
                SetUnitUserData=lambda u, n: u.update(userData=n), GetUnitUserData=lambda u: u["userData"],
                IssuePointOrderLoc=lambda u, o, p: self.log.append(("order", u, o, p)),
                AngleBetweenPoints=lambda a, b: math.degrees(math.atan2(b["y"]-a["y"], b["x"]-a["x"])),
                UNIT_TYPE_SUMMONED="summon", IsUnitType=lambda u, t: u.get(t, False),
                IsUnitIllusion=lambda u: u.get("illusion", False), IsXiongLingHuoBan=lambda u: False,
                UNIT_STATE_MAX_LIFE="max",
            )
            for name in ("A091_AddMoney", "A164_T319_AddMoney", "A235_Action", "A002_Action", "A109_Action", "A048_Action"):
                self.env[name] = lambda *_, name=name: self.log.append((name,))
            self.japi["EXEffectMatRotateZ"] = lambda *args: self.log.append(("rotate", *args))
            execute(function("main/f20"), [self.env], (lambda name: self.japi,))

        def start(self, timer, seconds, repeating, action):
            if repeating and getattr(action, "name", None) == "main/f20/f2":
                assert seconds == .9
                seconds = self.period
            super().start(timer, seconds, repeating, action)

        def enumerate(self, group, x, y, radius, _):
            group.extend(u for u in self.group if math.hypot(x-u["x"], y-u["y"]) <= radius)

        def hit(self, source, target, amount, *flags):
            self.hits.append((self.now, target["kind"], amount, flags))
            self.on_hit(source, target)

        def create(self, owner, kind, position, facing):
            dummy = unit(kind, owner)
            dummy.update(position, facing=facing, temp=True)
            return dummy

        def mark(self, source, target):
            self.env["A008_Damage"](source, target)

        def bridge(self, source, target, owner):
            execute(function("main/f291/f1"), [self.env], (source, target, owner),
                    start_pc=2013, stop_pc=2027)

        def death(self, victim, killer):
            execute(function("main/f291/f9"), [self.env], (victim, killer), start_pc=293, stop_pc=440)

    def check(label, value):
        assert value, label
        checks.append(label)

    w = BreathWorld()
    dragon = unit("H003", A008=4, A239=1)
    dragon.update(x=5, y=7)
    w.current = dragon
    w.env["Tower_ALL"][9] = dragon
    w.env["A008_Action"]({"x": 5, "y": 77})
    order = next(log for log in w.log if log[0] == "order")
    dummy = order[1]
    check("cast cargo, order and attribution", dummy["kind"] == "q006" and dummy["userData"] == 9
          and dummy["skills"]["T003"] == 4 and dummy["timedLife"] == ("BHwe", 1.5)
          and dummy["facing"] == 0 and order[2:] == ("breathoffire", {"x": 5, "y": 77}))
    check("skin visual independent of packet", any(e[:2] == ("visual", "bingpenhuo.mdx") for e in w.log))

    w = BreathWorld()
    dragon = unit(A008=1, A009=1)
    target = unit("first", 11)
    w.bridge(dummy, target, None)
    check("bridge requires resolved source", not w.queue)
    w.bridge(dummy, target, dragon)
    w.bridge(dummy, target, dragon)
    w.bridge(dummy, target, dragon)
    check("same caster cap even for repeated target", len(w.queue) == 4)
    for count in range(11):
        w.mark(unit(), target)
    check("owner cap across distinct casters", len(w.queue) == 24)
    dragon["owner"] = 1
    w.mark(unit(), target)
    w.mark(unit(), target)
    w.mark(unit(), target)
    check("owner transfer dynamically opens two slots", len(w.queue) == 28)
    w.advance(4.5)
    check("expiry cancels timers", not w.queue)

    for period, rank, expected in ((.9, 1, ["0.9", "1.8", "2.7", "3.6"]),
                                   (PERIOD, 0, ["1", "2", "3"]),
                                   (PERIOD, 2, ["1", "2", "3", "4"])):
        w = BreathWorld(period)
        w.group = [unit("mob", 11)]
        dragon = unit(A008=1, A009=rank)
        w.mark(dragon, w.group[0])
        dragon["skills"]["A009"] = 6
        w.advance(8)
        check(f"captured expiry and B05 tie, period={period}, rank={rank}",
              [format(float(at), "g") for at, *_ in w.hits] == expected)

    w = BreathWorld(PERIOD)
    dragon = unit("E001", A008=1, A009=1, B031=1)
    dragon["life"], dragon["state"]["max"] = 1300, 1700
    enemy1, enemy2, friendly = unit("enemy1", 11), unit("enemy2", 11), unit("friendly", 1)
    enemy2["x"] = 150
    w.group = [enemy1, friendly, enemy2]
    w.mark(dragon, enemy1)
    enemy1["x"] = 7
    def reenter(source, target):
        if target is enemy1 and w.now == 1:
            w.death(target, source)
            dragon["life"] = 1200
            dragon["skills"].pop("B031", None)
    w.on_hit = reenter
    w.advance(1)
    packet = tuple(WEB["mark"]["packet"])
    check("dynamic life and buff snapshot across reentrant Death", w.hits == [
        (1, "enemy1", 520, packet), (1, "enemy2", 520, packet)])
    check("kill raises max only", dragon["state"]["max"] == 1707 and dragon["life"] == 1200)
    w.advance(2)
    check("next tick reads changed life and buff", w.hits[-1][2] == 360)
    check("morph removal keeps the independent gain", dragon["state"]["max"] - 500 == 1207)
    for killer_flag in ("temp", "summon", "illusion"):
        proxy = unit(A009=1)
        proxy.update({killer_flag: True, "userData": 23})
        prior = dragon["state"]["max"]
        w.death(enemy1, proxy)
        assert not proxy["state"].get("max")
        w.env["Tower_ALL"][23] = dragon
        dragon["life"] = 0
        w.death(enemy1, proxy)
        check(f"{killer_flag} routes to a dead retained handle", dragon["state"]["max"] == prior + 7 and dragon["life"] == 0)
        w.env["Tower_ALL"].clear()
    dragon["skills"]["A048"] = 1
    w.env["A048_Action"] = lambda u: u["skills"].pop("A009")
    prior = dragon["state"]["max"]
    w.death(enemy1, dragon)
    check("A009 query observes earlier Death callback", dragon["state"]["max"] == prior)

    # Round trip the stable mark record near a B05 tie; use the same B05 queue.
    w = BreathWorld(PERIOD)
    dragon = unit(A009=2)
    target = unit("mob", 11)
    w.group = [target]
    w.mark(dragon, target)
    w.advance(4)
    records = [(float(at), seq, timer["periodic"]) for at, seq, timer in sorted(w.queue)]
    recovered = json.loads(json.dumps(records))
    check("round trip due time, sequence and callback kind", recovered == [[5, 1, False], [5, 6, True]])
    w.queue[:] = [(Fraction(str(at)), seq, next(t for _, _, t in w.queue if t["periodic"] == periodic))
                  for at, seq, periodic in recovered]
    w.advance(5)
    check("resumed equal-deadline expiry stays first", len(w.hits) == 4 and not w.queue)

    death_events = []
    noop = lambda *args: None
    env = dict(
        CreateTrigger=dict, Player=int, EVENT_PLAYER_UNIT_DEATH="death", Condition=lambda f: f,
        TriggerRegisterPlayerUnitEvent=lambda t, p, e, b: death_events.append((p, e, b)),
        TriggerAddCondition=lambda t, f: f is noop, anyUnitDEAT=noop,
    )
    execute(function("main/f291/f32"), [env])
    check("original Death registration victim owners", death_events == [
        (p, "death", None) for p in WEB["death"]["victimOwnersInRegistrationOrder"]
    ])

    names = ["main/f20", *(f"main/f20/f{i}" for i in range(4)), "main/f7/f20", "main/f7/f22",
             "main/f291/f1", "main/f291/f9", "main/f291/f32"]
    ranges = {fn: function(fn)["sourceLines"] for fn in names if fn not in ("main/f291/f1", "main/f291/f9")}
    coverage = {fn: len(vm["COVER"][fn]) for fn in names}
    return {"checks": checks, "reachedInstructions": coverage, "functionSourceLines": ranges}


def main():
    evidence = source_data()
    evidence.update(baseline="dragon-breath-and-blood-v1", web=WEB, sourcePath=ai.DISASM,
                    sourceSha256=sha256(SOURCE.read_bytes()).hexdigest(), verification=replays())
    serialized = json.dumps(evidence, ensure_ascii=False, indent=2) + "\n"
    if "--write" in sys.argv:
        OUT.write_text(serialized)
    else:
        assert OUT.read_text() == serialized, OUT
    cells = sum(len(table["matchedColumnsAtoDByRow"]) * len(table["verifiedWorkbooks"]) * 10
                for table in evidence["workbooks"].values())
    print(f'{len(evidence["verification"]["checks"])} boundary probes, {cells} workbook cells checked')


if __name__ == "__main__":
    main()
