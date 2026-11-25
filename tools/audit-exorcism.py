#!/usr/bin/env python3
"""Audit A066's spirit orders, replacement, and damage handoff."""
from contextlib import closing
from fractions import Fraction
from hashlib import sha256
from math import hypot
from pathlib import Path
import json
import sys

import audit_index as ai

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/rules/exorcism.json"
COUNTS = [5, 7, 9, 11, 13, 15]
BASE = [200, 250, 300, 350, 400, 500]
INT = [.8, .9, 1, 1.1, 1.2, 1.4]


def metadata():
    with closing(ai.connect()) as db:
        rows = ai.workbook_rows(db, "A066", "塔技能")
        spirits = {k: {t: ai.objects(db, k, t)[0] for t in (
            "units_unitabilities", "units_unitweapons", "units_unitdata", "units_unitbalance", "units_unitui")}
            for k in ("q011", "q012")}
        abilities = {k: ai.objects(db, k, "units_abilitydata")[0] for k in ("T057", "T061")}
        entries = {k: ai.references(db, k) for k in ("A066", "A066_Skill", "A066_Damage")}
        source = dict((f, [lo, hi]) for f, lo, hi in db.execute(
            "SELECT name,start_line,end_line FROM function WHERE name='main/f58' OR name LIKE 'main/f58/%' ORDER BY start_line"))
    assert len(rows) == 4 and [r["cells"] for r in rows[:2]] == [r["cells"] for r in rows[2:]]
    h, i, _ = rows[0]["cells"][7:]
    assert "持续15秒，冷却20秒" in h and "13点魔法值" in h
    for count, base, intelligence in zip(COUNTS, BASE, INT):
        assert f"召唤{count}个恶灵" in i and f"{base}+{intelligence:.1f}x智力" in i
    for variant in spirits.values():
        w = variant["units_unitweapons"]["fields"]
        assert [w[k] for k in ("acquire", "cool1", "rangeN1", "RngBuff1", "weapsOn", "weapTp1")] == [900, 1, 80, 250, 1, "missile"]
        assert "dmgpt1" not in w and "backSw1" not in w
        assert variant["units_unitabilities"]["fields"]["abilList"] == "Avul,Aloc"
        assert variant["units_unitbalance"]["fields"]["spd"] == 350 and variant["units_unitdata"]["fields"]["moveHeight"] == 380
    assert [abilities["T057"]["fields"][key] for key in ("code", "Area1", "Rng1", "Dur1")] == ["Atwa", 4000, 4000, 5]
    assert [abilities["T061"]["fields"][key] for key in ("code", "DataA1", "DataE1")] == ["AOcr", 100, 1]
    assert "DataB1" not in abilities["T061"]["fields"]
    strings = (ROOT / "reference/map-6.25/units_campaignunitstrings.txt").read_text()
    assert all("Missilespeed=500" in strings.split(f"[{k}]\n", 1)[1].split("\n[", 1)[0] for k in spirits)
    return {
        "baseline": "exorcism-v1", "status": "ready", "workbookRows": rows, "spirits": spirits, "abilities": abilities,
        "source": {"path": ai.DISASM, "sha256": sha256((ROOT/ai.DISASM).read_bytes()).hexdigest(),
                   "functions": source, "references": entries, "originalBaseCount": [8, 10, 12, 14, 16, 18], "originalActiveTime": 16},
        "web": {"baseCount": COUNTS, "scepterExtra": 8, "scepterCountRead": "effect", "scepterTrueStrikeRead": "eachBirth",
                "baseDamage": BASE, "intMultiplier": INT, "damageStatsRead": "eachImpactCurrentTowerSlot",
                "mana": 13, "manaRead": "afterSynchronousChild", "attackType": "NORMAL", "damageType": "MAGIC",
                "cooldown": 20, "modifiedCooldownFloor": 16,
                "birthPeriod": .1, "spawnLifetime": 20, "commandPeriod": 1, "ownerRadius": 900,
                "attackPeriod": 1, "projectileSpeed": 500, "attackRange": 80, "rangeBuffer": 250,
                "moveSpeed": 350, "idleWander": {"decision": "Q24", "origin": "birthLocation", "period": 5, "radius": 4000},
                "activeTime": 15, "returnTime": 1, "returnSpeed": 700, "recast": "replaceOldSpiritsAndTheirTimers",
                "retainLaunchedThroughReturn": True, "retainRemovedSpiritsMissiles": False},
    }


def probes():
    path = ROOT / "tools/audit-wisp-link-overcharge-relocate.py"
    vm = {"__file__": str(path)}
    exec(compile(path.read_text().split("\nCOUNT=0;VECTORS=[]", 1)[0], path, "exec"), vm)
    execute, closure, fn, unit = (vm[k] for k in ("execute", "Closure", "function", "unit"))
    checks = []

    def check(label, outcome):
        assert outcome, label
        checks.append(label)

    class World(vm["World"]):
        def __init__(self):
            super().__init__()
            self.owner = unit("G022", A066=1)
            self.owner["state"].update(mana=30, manaMax=100)
            self.current, self.env["Tower_ALL"][7] = self.owner, self.owner
            self.created, self.monsters, self.orders, self.hits = [], [], [], []
            self.effect = lambda source: None
            self.env.update(
                AddArrAny=closure("main/f7/f22", [self.env]), _loop_=closure("main/f3/f5", [lambda *_: None]),
                CreateTempAndSetAbilityLv=self.create, RemoveUnit=lambda u: u.update(deleted=True),
                SetUnitUserData=lambda u, i: u.update(userData=i), GetUnitUserData=lambda u: u["userData"],
                SetUnitMoveSpeed=lambda u, s: u.update(speed=s), IssuePointOrderLoc=self.order_point,
                IssueImmediateOrder=lambda u, order: self.order_point(u, order, None),
                IssueTargetOrder=lambda u, order, target: self.order_point(u, order, target),
                OrderId2String=lambda order: order, GetUnitCurrentOrder=lambda u: u["order"],
                CreateGroup=list, GroupEnumUnitsInRange=lambda g,x,y,r,_: g.extend(
                    u for u in self.monsters if hypot(u["x"]-x,u["y"]-y) <= r),
                FirstOfGroup=lambda g: g[0] if g else None, GroupRemoveUnit=lambda g,u: g.pop(0) if g else None,
                GroupClear=list.clear, DestroyGroup=lambda *_: None, IsUnitOwnedByPlayer=lambda u,p: bool(u and u["owner"] == p),
                IsUnitVisible=lambda u,p: not u.get("hidden"), GetRandomInt=lambda lo,hi: hi,
                UnitDamageTarget=self.hit, ATTACK_TYPE_NORMAL="normal", DAMAGE_TYPE_MAGIC="magic",
                WEAPON_TYPE_WHOKNOWS="none", UNIT_STATE_MANA="mana", UNIT_STATE_MAX_MANA="manaMax",
            )
            self.japi["EXSetEventDamage"] = lambda d: self.hits.append(d)
            execute(fn("main/f58"), [self.env], (lambda _: self.japi,))

        def create(self, owner, point, facing, ability, level, lifespan, kind):
            spirit = unit(kind, owner, **{ability: level})
            spirit.update(point, order="move", lifespan=lifespan)
            self.created.append(spirit)
            return spirit

        def order_point(self, u, order, target):
            u["order"] = order
            self.orders.append((self.now, u, order, target))

        def hit(self, source, target, amount, *flags):
            self.hits.append((source, target, amount, flags))
            self.effect(source)

        def cast_exorcism(self):
            self.env["A066_Skill"]()

    w = World()
    w.owner["items"].add("i310")
    w.cast_exorcism()
    check("source cast snapshots scepter spawn count, including eight extra", w.env["A066_Create_Max_Count"][7] == 16)
    w.advance(.1)
    w.owner["items"].remove("i310")
    w.owner["x"] = 19
    w.advance(.2)
    check("source each .1-second birth follows current location and current scepter",
          [(u["kind"], u["x"], u["skills"].get("T061"), u["lifespan"], u["userData"]) for u in w.created]
          == [("q012", 0, 1, 20, 7), ("q012", 19, None, 20, 7)])
    w.advance(.9)
    near, outer, kept = w.created[:3]
    outer["x"], kept["order"] = 920, "attack"
    a, b, hidden = [unit(key, 11) for key in ("a", "b", "hidden")]
    hidden["hidden"] = True
    w.monsters[:] = [a, b, hidden]
    w.advance(1)
    record = [orders for _, *orders in w.orders]
    check("source orders far spirit home, switches nearby moving spirit to chosen visible target, keeps existing attack",
          [near, "attack", b] in record and [outer, "move", {"x": 19, "y": 0}] in record and all(o[0] is not kept for o in record))
    w.monsters.clear()
    w.advance(2)
    check("source no-candidate path stops nearby spirits and continues far return", near["order"] == "stop" and outer["order"] == "move")
    w.advance(16)
    check("source at 16 stops attack control and issues speed-700 return to captured current position",
          not w.env["A066_Timer_Atk"] and len(w.created) == 16 and all(u["speed"] == 700 for u in w.created)
          and all(not u.get("deleted") for u in w.created))
    old_return = w.env["A066_Timer_ComeBack"][7]
    old_spirits = list(w.created)
    w.owner["kind"] = "H020"
    w.cast_exorcism()
    w.advance(17)
    check("source explicit recast cleans old return timer and all old spirits, leaves new q011 group",
          not old_return["alive"] and all(u["deleted"] for u in old_spirits)
          and len(w.env["A066_Temps"][7]) == 8 and all(u["kind"] == "q011" for u in w.created[16:]))

    w.owner["skills"]["A066"], w.owner["int"] = 6, 210
    w.effect = lambda source: source["state"].update(mana=97)
    live = w.created[-1]
    w.env["A066_Damage"](live, b)
    check("source zeroes weapon mother, uses current rank/INT child, then clips refund against current post-child mana",
          w.hits == [0, (w.owner, b, 794, (False, False, "normal", "magic", "none"))] and w.owner["state"]["mana"] == 100)
    w.env["Tower_ALL"].clear()
    w.env["A066_Damage"](live, b)
    check("source missing damage owner only zeroes the mother", len(w.hits) == 3 and w.hits[-1] == 0)

    def set_constant(name, key, value):
        original = fn(name)["constants"][key]
        fn(name)["constants"][key] = dict(original, value=value)

    for idx, count in enumerate(COUNTS):
        set_constant("main/f58/f5", f"k{2*idx+1}", count)
    set_constant("main/f58/f6", "k16", 15)
    w = World()
    w.cast_exorcism()
    w.advance(.49)
    check("Web normal fifth spirit waits for effect+0.5", len(w.created) == 4)
    w.advance(14.99)
    check("Web exact cap and duration hold before 15", len(w.created) == 5 and w.env["A066_Timer_Atk"][7]["alive"])
    w.advance(15)
    check("Web enters return before simultaneous attack selection", not w.env["A066_Timer_Atk"] and
          all(t == Fraction(15) and o == "move" for t, _, o, _ in w.orders[-5:]))
    w.advance(16)
    check("Web one second later removes only that group and all four timers",
          all(c["deleted"] for c in w.created) and all(not w.env[f"A066_{k}"] for k in
              ("Temps", "Timer_Count", "Timer_Sum", "Timer_ComeBack", "Timer_Atk")))
    return checks


def main():
    report = metadata()
    report["probes"] = probes()
    body = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if sys.argv[1:] == ["--write"]:
        OUT.write_text(body)
    else:
        assert OUT.read_text() == body
    print(f"A066 ready, {len(report['probes'])} boundary probes, 40 workbook cells")


if __name__ == "__main__":
    main()
