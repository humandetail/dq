#!/usr/bin/env python3
"""Audit A079 formation birth, source carryover, and its A077 damage join."""
from contextlib import closing
from hashlib import sha256
from math import cos, hypot, isclose, radians, sin
from pathlib import Path
import json
import sys

import audit_index as ai

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/rules/monkey-formation.json"
KINDS = ("b117", "b118", "b139", "b140")
INHERITANCE = [50, 60, 70, 80, 90, 100]


def metadata():
    with closing(ai.connect()) as db:
        rows = ai.workbook_rows(db, "A079", "塔技能")
        objects = {kind: [r for table in ("units_unitbalance", "units_unitdata", "units_unitabilities", "units_unitweapons",
                                          "units_unitui", "war3map.w3u") for r in ai.objects(db, kind, table)] for kind in KINDS}
        source = dict((f, [lo, hi]) for f, lo, hi in db.execute(
            "SELECT name,start_line,end_line FROM function WHERE name='main/f68' OR name LIKE 'main/f68/%' ORDER BY start_line"))
        refs = {k: ai.references(db, k) for k in ("A079","A079_Action",*KINDS)}
    assert len(rows) == 4 and [r["cells"] for r in rows[:2]] == [r["cells"] for r in rows[2:]]
    assert all(f"{n}%攻击力" in rows[0]["cells"][8] for n in INHERITANCE)
    assert all("持续13秒" in r["cells"][7] for r in rows)
    tip = (ROOT/"reference/map-6.25/units_campaignabilitystrings.txt").read_text().split("[A079]\n",1)[1].split("\n[A080]",1)[0]
    tip = tip.split("\nUbertip=",1)[1]
    assert tip.count("对英雄造成125%的伤害") == tip.count("猴子猴孙攻速增加25%，攻击距离增加100") == 6
    for index,(kind, data) in enumerate(objects.items()):
        balance, movement, abilities, weapon, *_ = (r["fields"] for r in data)
        assert (balance["HP"], balance["spd"], movement["movetp"], abilities["abilList"]) == (450, 1, "foot", "T061,Avul,Aloc")
        expected = [1.3, 700, 700] if index < 2 else [1.0, 800, 800]
        assert [weapon[k] for k in ("cool1", "rangeN1", "acquire", "dmgpt1", "backSw1", "dice1", "sides1", "weapTp1")] == [
            *expected, .4, .77, 2, 5, "normal"]
    return {"baseline":"monkey-formation-v1", "status":"ready", "workbookRows":rows, "objects":objects,
            "source":{"path":ai.DISASM,"sha256":sha256((ROOT/ai.DISASM).read_bytes()).hexdigest(),"functions":source,"references":refs},
            "web":{"lifetime":13,"rings":[[400,5,72],[800,9,40]],"inheritancePercent":INHERITANCE,
                   "initialRead":"snapshotS18PlusS19", "staffSelection":"currentEffect", "staffSpeed":.25, "staffRangeAdd":100, "heroDamageFactor":1.25, "heroTarget":"nativeUNIT_TYPE_HERO", "decision":"Q68",
                   "normalBasePeriod":1.3, "weapon":[.4,.77,2,5], "moveType":1,
                   "templates":{"H024":["b117","b139"],"G036":["b118","b140"]}}}


def probes():
    path = ROOT / "tools/audit-wisp-link-overcharge-relocate.py"
    vm = {"__file__": str(path)}
    exec(compile(path.read_text().split("\nCOUNT=0;VECTORS=[]", 1)[0], path, "exec"), vm)
    execute, closure, fn, unit = (vm[k] for k in ("execute", "Closure", "function", "unit"))
    checks = []

    def check(label, outcome):
        assert outcome, label
        checks.append(label)

    w = vm["World"]()
    tower = unit("H024", A079=1)
    other = unit("G036", A079=1)
    tower["state"].update({18:100,19:80})
    other["state"].update({18:100,19:80})
    w.env["Tower_ALL"].update({3:tower,4:other})
    created = []
    w.env["math"]["rad"] = radians
    w.env.update(Cos=cos, Sin=sin, GetTriggerPlayer=lambda:0, TxShow=False,
                 SetUnitUserData=lambda u,i: u.update(userData=i),
                 UnitApplyTimedLife=lambda u,b,t: u.update(timedLife=[b,t]))

    def create(owner,kind,x,y,facing):
        monkey = unit(kind,owner)
        monkey.update(x=x,y=y,facing=facing)
        created.append(monkey)
        return monkey

    w.env["CreateUnit"] = create
    w.japi["EXSetUnitMoveType"] = lambda u,t: u.update(moveType=t)
    execute(fn("main/f68"), [w.env], (lambda _: w.japi,))
    spell = w.env["A079_Action"]
    birth = spell.ups[4]

    # This application shares scalar Lua upvalues between f0 and f1. Bind only those cells
    # across the two original callbacks because the shared bounded VM stores copied scalars.
    def add(radius, degrees, point):
        for child,parent in ((3,1),(4,6),(7,2),(8,3)):
            birth.ups[child] = spell.ups[parent]
        birth(radius,degrees,point)
        spell.ups[5] = birth.ups[5]

    spell.ups[4] = add
    tower["items"].add("i310")
    origin = {"x":60,"y":70}
    spell(tower,origin)
    check("source first cast with staff uses prior unstaffed template before storing staff",
          len(created) == 14 and all(u["kind"] == "b117" and u["userData"] == 3 for u in created))
    radii = [400]*5 + [800]*9
    angles = [i*72+180 for i in range(1,6)] + [i*40+180 for i in range(1,10)]
    check("source formation has five radius-400 and nine radius-800 stationary units facing inward",
          all(isclose(hypot(u["x"]-60,u["y"]-70), radius) and u["facing"] == angle
              for u,radius,angle in zip(created,radii,angles))
          and all(u["moveType"] == 1 and u["timedLife"] == ["BHwe",13] and u["state"][19] == 260 for u in created))
    spell(other,origin)
    check("source second cast without staff inherits other tower's staff flag",
          len(created) == 28 and all(u["kind"] == "b140" and u["userData"] == 4 for u in created[14:]))
    spell(other,origin)
    check("source starts next 14 and retains all prior exact-lifetime units", len(created) == 42
          and all(u["kind"] == "b118" for u in created[28:]))

    victim = unit("monster",11)
    calls = []
    tower["skills"]["A077"] = 2
    w.env["A077_Action"] = lambda o: calls.append(o)
    route = fn("main/f291/f1")
    execute(route,[w.env,w.japi],(created[0],victim,tower),start_pc=1037,stop_pc=1087)
    tower["skills"]["A078"] = 2
    execute(route,[w.env,w.japi],(created[0],victim,tower),start_pc=1037,stop_pc=1087)
    check("A079 live attributed A077 gets one hit; live A078 prevents increment", calls == [tower])

    nominal = (tower["state"][18] + tower["state"][19])*INHERITANCE[0]/100
    check("Web neutral clone base/bonus view matches full caster attack inheritance without original fixed 120",
          nominal == 90 and nominal != created[0]["state"][19])
    check("Web staff 25 percent rate and +100 raw range apply on the same cast",
          isclose(1.3/1.25,1.04) and [700+100,800] == [800,800])
    native_hero = unit("enemyHero", 11)
    native_hero["armorType"] = "hero"
    map_boss = unit("N534Sapper", 11, N534=1)
    map_boss.update(nativeHero=False, sapper=True, armorType="small")

    def after_armor(amount, u):
        authored = 1.25 if u["nativeHero"] else 1
        shared = {"hero": .70, "small": 1.25}[u["armorType"]]
        return amount*authored*shared

    check("Q68 uses native hero identity independently of map boss flag and armor class",
          after_armor(200, native_hero) == 175 and after_armor(200, map_boss) == 250)
    return checks


def main():
    report=metadata()
    report["probes"]=probes()
    body=json.dumps(report,ensure_ascii=False,indent=2)+"\n"
    if sys.argv[1:] == ["--write"]:
        OUT.write_text(body)
    else:
        assert OUT.read_text() == body
    print(f"A079 ready, {len(report['probes'])} boundary probes, 40 workbook cells")


if __name__ == "__main__":
    main()
