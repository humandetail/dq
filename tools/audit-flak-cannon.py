#!/usr/bin/env python3
"""Check the A196 source entry and its bounded attack lifecycle."""
from contextlib import closing
from hashlib import sha256
from pathlib import Path
import json
import re
import sys

import audit_index as ai

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/rules/flak-cannon.json"
COUNTS = [3, 4, 4, 5, 5, 6]
SLICES = {
    "effect": ("main/f291/f14", 1238, 1247),
    "attackStart": ("main/f291/f3", 1, 27),
    "auto": ("main/f291/f27", 3064, 3076),
    "damage": ("main/f291/f1", 158, 179),
    "heldGate": ("main/f7", 102, 111),
}


def metadata():
    with closing(ai.connect()) as db:
        rows = ai.workbook_rows(db, "A196", "塔技能")
        assert len(rows) == 4 and rows[0]["cells"] == rows[2]["cells"] and rows[1]["cells"] == rows[3]["cells"]
        assert [row["row"] for row in rows[:2]] == [518, 523] and rows[0]["cells"][4:] == rows[1]["cells"][4:]
        objects = {key: [item for table in tables for item in ai.objects(db, key, table)]
                   for key, tables in {"A196": ("units_abilitydata", "war3map.w3a"), "T217": ("units_abilitydata",),
                                       "H051": ("units_unitweapons",), "G080": ("units_unitweapons",)}.items()}
        refs = {key: ai.references(db, key) for key in ("A196", "T217", "B170", "timer", "IsKillCdSkill")}
        slices = {}
        for name, (function, lo, hi) in SLICES.items():
            data = ai.instructions(db, function, lo, hi)
            assert len(data) == hi-lo+1
            slices[name] = {"function": function, "pc": [lo, hi], "sourceLines": [data[0]["sourceLine"], data[-1]["sourceLine"]]}
    h, i, j = rows[0]["cells"][7:]
    assert all(term in h for term in ("1000", "每次攻击", "所有敌人"))
    triples = [tuple(map(int, match)) for match in re.findall(r"持续3秒或维持(\d+)次攻击。 耗蓝 (\d+)点。\n冷却时间：(\d+)秒", i)]
    assert len(triples) == 6 and "法球效果不能叠加" in i
    assert [c for c, _, _ in triples] == COUNTS
    base = objects["A196"][0]["fields"]
    mods = {(m["key"], m["level"]): m["value"] for m in objects["A196"][1]["fields"]["mods"]}
    assert base["Dur1"] == 12
    for lv, (_, mana, cd) in enumerate(triples, 1):
        assert mana == mods.get(("amcs", lv), base.get(f"Cost{lv}"))
        assert cd == mods.get(("acdn", lv), base.get(f"Cool{lv}"))
    assert j == "冷却 6.0／5.0；耗蓝 50／60"
    barrage = objects["T217"][0]["fields"]
    assert [barrage[k] for k in ("Area1", "Cool1", "DataA1", "DataB1", "DataC1")] == [1300, 2, 1, 9_999_999, 100]
    profiles = (ROOT / "reference/map-6.25/units_campaignabilitystrings.txt").read_text()
    assert "Missilespeed=1600" in profiles.split("[T217]\n", 1)[1].split("\n[", 1)[0]
    for key in ("H051", "G080"):
        fields = objects[key][0]["fields"]
        assert [fields[k] for k in ("atkType1", "cool1", "dmgpt1", "backSw1", "dmgplus1", "dice1", "sides1", "weapsOn")] == [
            "hero", 1.2, .55, .85, 35, 2, 4, 1]
    return {"baseline": "flak-cannon-v1", "status": "ready",
            "source": {"path": ai.DISASM, "sha256": sha256((ROOT / ai.DISASM).read_bytes()).hexdigest()},
            "objects": objects, "workbookRows": rows, "literalReferences": refs, "slices": slices,
            "web": {"lifetime": 3, "radius": 1000, "maxTargets": None, "internalLock": 0, "sideBaseDamage": 1,
                    "sideBudget": 9_999_999, "sideSpeed": 1600, "counts": COUNTS,
                    "startReserve": True, "autoOpeningCounts": True, "cancellationRefund": False,
                    "lateSpecial": "current T217 and actual attack and non-illusion"}}


def replay():
    path = ROOT / "tools/audit-wisp-link-overcharge-relocate.py"
    vm = {"__file__": str(path)}
    exec(compile(path.read_text().split("\nCOUNT=0;VECTORS=[]", 1)[0], path, "exec"), vm)
    closure, function, run, unit = (vm[k] for k in ("Closure", "function", "execute", "unit"))
    checks = []

    def check(label, outcome):
        assert outcome, label
        checks.append(label)

    w = vm["World"]()
    hero, victim = unit("H051", A196=1), unit("mob", 11)
    hero["userData"] = 13
    w.env["Tower_ALL"][13] = hero
    w.env.update(GetUnitUserData=lambda u: u.get("userData", -1),
                 GetAttacker=lambda: hero, GetTriggerUnit=lambda: victim,
                 IsUnitIllusion=lambda u: u.get("illusion", False))
    run(function("main/f141"), [w.env])
    cast = w.env["A196_Action"]
    counters, timers = cast.ups[1:3]

    def event(name, *args, ups=None):
        fn, lo, hi = SLICES[name]
        return run(function(fn), ups or [w.env], args, start_pc=lo, stop_pc=hi)

    def active():
        return "T217" in hero["skills"]

    trace = []

    def auto_open():
        trace.append(("auto", counters.get(13)))
        event("effect", "A196", hero)

    w.env["Skill_Auto"] = auto_open
    event("attackStart", ups=[w.env, lambda u: trace.append(("illusion", u["kind"]))])
    check("source opening attack bypasses pre-decrement but auto grants T217 before firing",
          trace == [("auto", None)] and active() and counters == {13: 4})
    w.env["Skill_Auto"] = lambda: trace.append(("auto", counters.get(13)))
    for _ in range(3):
        event("attackStart", ups=[w.env, None])
        assert active()
    check("three later attack starts keep grant, even if one never submits",
          trace[-3:] == [("auto", 3), ("auto", 2), ("auto", 1)])
    shared = w.timer()
    w.env["timer"] = shared
    live = timers[13]
    event("attackStart", ups=[w.env, None])
    check("source final pre-decrement destroys global timer, leaves own orphan",
          not active() and not counters and not timers and not shared["alive"] and live["alive"])
    w.advance(3)

    w.env["Item_Attack_Special"] = lambda s, t: trace.append(("special", s["kind"], t["kind"]))
    japi = {"EXGetEventDamageData": lambda _: 1}
    slot_gate = closure("main/f7/f10", [w.env, {1: "T217", 2: "B210"}])
    event("damage", hero, victim, ups=[w.env, japi])
    check("a late attack packet with lost live T217 skips special", trace[-1][0] == "auto" and not slot_gate(hero))
    cast(hero)
    event("damage", hero, victim, ups=[w.env, japi])
    check("current T217 qualifies any actual attack hit and common kill gate",
          trace[-1] == ("special", "H051", "mob") and slot_gate(hero))
    japi["EXGetEventDamageData"] = lambda _: 0
    before = len(trace)
    event("damage", hero, victim, ups=[w.env, japi])
    japi["EXGetEventDamageData"] = lambda _: 1
    hero["illusion"] = True
    event("damage", hero, victim, ups=[w.env, japi])
    check("nonattack and illusion packets both skip special", len(trace) == before)

    item_calls = []
    w.env.update(
        HasItem=lambda u, rawcode: rawcode,
        IsUnitType=lambda u, rawcode: False,
        i132_Get_probability=lambda: True,
        i132_Skill=lambda s, t: item_calls.append(("i132", t)),
        i302_Action=lambda s, t: item_calls.append(("i302", t)),
        i316_Action=lambda s, t: item_calls.append(("i316", t)),
    )
    closure("main/f285/f14", [w.env])(hero, victim)
    check("special preserves three independently invoked item paths and exact target",
          item_calls == [(identifier, victim) for identifier in ("i132", "i302", "i316")])

    # Contract for the Web reservation and its retained live T217 window.
    state, attacks, starts = {}, {}, set()
    world = vm["World"]()

    def end():
        world.destroy(state.get("timer"))
        state.clear()

    def give(identifier, count=3):
        end()
        timer = world.timer()
        state.update(id=identifier, left=count, timer=timer)
        world.start(timer, 3, False, end)

    def reserve(attack):
        if state and state["left"] and attacks.get(attack) != state["id"]:
            attacks[attack] = state["id"]
            state["left"] -= 1

    def begin(attack, auto_id=None):
        if attack in starts:
            return
        starts.add(attack)
        if state and not state["left"]:
            end()
        reserve(attack)
        if auto_id is not None:
            give(auto_id)
            reserve(attack)

    def submit(attack):
        reserve(attack)
        return bool(state) and attacks.get(attack) == state["id"]

    begin("auto-start", "a")
    check("Web opening auto consumes one and launches from its own generation", submit("auto-start") and state["left"] == 2)
    begin("cancelled")
    begin("last")
    begin("last")
    check("pre-cancel still consumes, last reserved attack can launch, grant stays live for impacts",
          state["left"] == 0 and submit("last") and bool(state))
    begin("following")
    check("the following start exhausts grant before an uncharged submission", not submit("following") and not state)

    give("manual")
    begin("windup")
    world.advance(1)
    previous = state["timer"]
    give("refresh")
    check("manual new eligibility midwindup reserves from the replacement just once",
          submit("windup") and submit("windup") and state["left"] == 2 and not previous["alive"])
    snapshot = json.loads(json.dumps({"left": state["left"], "id": state["id"], "attacks": attacks}))
    check("reservation generation and remaining count serialize together",
          snapshot["attacks"]["windup"] == snapshot["id"] and snapshot["left"] == 2)
    world.advance(4)
    check("three-second deadline invalidates only the reservation, not any fired projectile",
          not state and not submit("windup"))
    samples = []
    for end_first in (True, False):
        attack = f"at-deadline-{end_first}"
        commit = lambda: samples.append(submit(attack))
        if end_first:
            give("expiry-first")
            world.start(world.timer(), 3, False, commit)
        else:
            world.start(world.timer(), 3, False, commit)
            give("attack-first")
        begin(attack)
        world.advance(world.now + 3)
    check("existing B05 order decides equal-deadline firing", samples == [False, True])

    return {"checks": checks, "moduleLines": {name: function(name)["sourceLines"] for name in [
        "main/f141", *(f"main/f141/f{i}" for i in range(4))]}}


def main():
    data = metadata()
    data["validation"] = replay()
    serialized = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if "--write" in sys.argv:
        OUT.write_text(serialized)
    else:
        assert OUT.read_text() == serialized, OUT
    print(f'{len(data["validation"]["checks"])} boundary probes; 40 workbook cells')


if __name__ == "__main__":
    main()
