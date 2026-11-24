#!/usr/bin/env python3
"""Audit A082 fleet timer and collision aura boundaries."""
from contextlib import closing
from fractions import Fraction
from hashlib import sha256
from math import atan2, cos, degrees, hypot, radians, sin
from pathlib import Path
import json
import sys

import audit_index as ai

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/rules/ghost-fleet.json"
DAMAGE = [1000*r for r in range(1,7)]


def metadata():
    with closing(ai.connect()) as db:
        rows = ai.workbook_rows(db, "A082", "塔技能")
        objects = {key: [x for table in ("units_abilitydata","war3map.w3a","units_unitabilities","units_unitdata")
                         for x in ai.objects(db,key,table)] for key in ("A082","q022","T079","T080","T081","T222")}
        source = dict((f,[lo,hi]) for f,lo,hi in db.execute(
            "SELECT name,start_line,end_line FROM function WHERE name='main/f71' OR name LIKE 'main/f71/%' ORDER BY start_line"))
        refs = {k: ai.references(db,k) for k in ("A082","A082_Damage","q022","T222")}
    assert len(rows) == 4 and [r["cells"] for r in rows[:2]] == [r["cells"] for r in rows[2:]]
    h, i, _ = rows[0]["cells"][7:]
    assert all(term in h for term in ("1.5秒","600范围","5%的攻击速度","施法距离:1000"))
    assert all(f"造成{d}伤害" in i for d in DAMAGE)
    for k in ("T079","T080"):
        fields = objects[k][0]["fields"]
        variants = {(m["key"],m["level"]):m["value"] for m in objects[k][1]["fields"]["mods"]}
        assert [fields[name] for name in ("code","Area1","DataB1","DataC1","DataD1","Rng1")] == ["AUcs",425,9999999,1400,425,5000]
        assert [fields[f"DataA{level}"] for level in range(1,5)] + [variants["Ucs1",5],variants["Ucs1",6]] == DAMAGE
    strings = (ROOT/"reference/map-6.25/units_campaignabilitystrings.txt").read_text()
    tip = strings.split("[A082]\n",1)[1].split("\n[A083]",1)[0].split("\nUbertip=",1)[1]
    assert tip.count("持续5秒（撞击到新单位时刷新持续时间）") == 6
    assert all("Missilespeed=800" in strings.split(f"[{k}]\n",1)[1].split("\n[",1)[0] for k in ("T079","T080"))
    assert objects["T222"][0]["fields"]["levels"] == 15
    return {"baseline":"ghost-fleet-v1","status":"ready","rows":rows,"objects":objects,
            "source":{"path":ai.DISASM,"sha256":sha256((ROOT/ai.DISASM).read_bytes()).hexdigest(),"functions":source,"references":refs},
            "web":{"castRange":1000,"launchBackFromTarget":1800,"summonLifetime":10,"waveLength":1400,
                   "waveRadius":425,"waveSpeed":800,"waveBudget":9999999,"damage":DAMAGE,"stun":1.5,
                   "orders":[0,2,4],"durationOfAura":5,"auraRange":600,"maxStacks":15,"auraContributionPerStack":.05,"visitOwner":"castId","auraOwner":"resolvedCaster","decision":"Q69"}}


def probes():
    path = ROOT/"tools/audit-wisp-link-overcharge-relocate.py"
    vm = {"__file__":str(path)}
    exec(compile(path.read_text().split("\nCOUNT=0;VECTORS=[]",1)[0],path,"exec"),vm)
    execute, fn, unit = (vm[k] for k in ("execute","function","unit"))
    checks = []

    def check(label, passed):
        assert passed, label
        checks.append(label)

    class World(vm["World"]):
        def __init__(self):
            super().__init__()
            self.hero = unit("H025",A082=2)
            self.env["Tower_ALL"][7] = self.hero
            self.orders, self.carriers = [],[]
            self.env["math"]["rad"] = radians
            self.env.update(
                Cos=cos, Sin=sin, CreateEffAtLoc=lambda *a:None,
                Location=lambda x,y:{"x":x,"y":y},
                AngleBetweenPoints=lambda a,b:degrees(atan2(b["y"]-a["y"],b["x"]-a["x"])),
                DistanceBetweenPoints=lambda a,b:hypot(b["x"]-a["x"],b["y"]-a["y"]),
                SetUnitScale=lambda u,*a:None, SetUnitUserData=lambda u,i:u.update(userData=i),
                CreateTempAndSetAbilityLv=self.create,
                IssueTargetOrder=self.order_any, IssuePointOrderLoc=self.order_any,
                AddArrAny=vm["Closure"]("main/f7/f22",[self.env]),
            )
            execute(fn("main/f71"),[self.env],(lambda _:self.japi,))
            self.cast=self.env["A082_Action"]
            self.hit=self.env["A082_Damage"]
            self.visits,self.fleet_timers = self.cast.ups[1:3]
            self.aura_timers=self.hit.ups[3]

        def create(self, owner, point, facing, ability, rank, life, kind="q001"):
            carrier=unit(kind,owner,**{ability:rank})
            carrier.update(point,lifetime=life,serial=len(self.carriers)+1)
            self.carriers.append(carrier)
            return carrier

        def order_any(self, source, order, target):
            self.orders.append((self.now,source,order,target))

        def monster(self, label):
            return unit(label,11)

    w=World()
    w.hero["items"].add("i310")
    point={"x":900,"y":0}
    w.cast(w.hero,point)
    old=w.orders[-1][1]
    check("A082 source ships spawn 1800 behind target, one lifetime-ten q022 and first cast", old["x"]==-900
          and old["skills"]=={"T079":2} and old["lifetime"]==10 and w.orders[-1][3] is point)
    target=w.monster("first")
    w.hit(w.hero,target)
    check("A082 source first stack gives T222 but does not start expiry", w.hero["skills"]["T222"]==1 and not w.aura_timers)
    w.advance(1)
    w.hero["items"].clear()
    w.cast(w.hero,{"x":0,"y":800})
    new=w.orders[-1][1]
    original_timer=w.fleet_timers[7]
    w.advance(2)
    check("A082 source nonstaff recast preserves old +2 release on same carrier", w.orders[-1] == (2,old,"carrionswarm",point)
          and old is not new and original_timer["alive"])
    w.hit(w.hero,target)
    check("A082 reset from new cast admits same target from old wave into shared aura", w.hero["skills"]["T222"]==2 and len(w.visits[7])==1)
    w.hit(w.hero,target)
    check("A082 duplicate still issues its own stun attempt but gains no new aura", w.hero["skills"]["T222"]==2
          and w.orders[-1][2]=="thunderbolt" and w.orders[-1][3] is target)
    w.hero["items"].add("i310")
    w.advance(2.1)
    w.cast(w.hero,point)
    w.advance(4)
    check("A082 new staffed cast explicitly cancels previous fleet repeat", not original_timer["alive"]
          and not any(at==4 and source is old for at,source,*_ in w.orders))
    w.advance(6.1)
    now=[(at,source) for at,source,order,_ in w.orders if at>=Fraction(21,10) and order=="carrionswarm"]
    check("A082 staffed fleet emits three orders on one q022, spaced two seconds", [t for t,_ in now]==[Fraction(21,10),Fraction(41,10),Fraction(61,10)]
          and len({u["serial"] for _,u in now})==1)

    w=World()
    w.cast(w.hero,point)
    for n in range(15):
        w.hit(w.hero,w.monster(f"mob{n}"))
    timer=next(iter(w.aura_timers.values()))
    w.advance(1)
    w.hit(w.hero,w.monster("newAtCap"))
    check("A082 source new distinct target at cap does not refresh its existing timer",
          w.hero["skills"]["T222"]==15 and next(iter(w.aura_timers.values())) is timer)
    w.advance(5)
    check("A082 source aura expiry removes ability in full", "T222" not in w.hero["skills"])

    # The selected aura lifetime is one shared per-caster stack group, with private visited sets.
    world=vm["World"]()
    phase={"stack":0,"timer":None}
    visited={1:set(),2:set()}

    def distinct(cast,target):
        if target in visited[cast]:
            return
        visited[cast].add(target)
        world.destroy(phase["timer"])
        timer=world.timer()
        phase.update(stack=min(phase["stack"]+1,15),timer=timer)
        world.start(timer,5,False,lambda:phase.update(stack=0,timer=None))

    distinct(1,"mob")
    world.advance(4)
    check("Web first stack receives actual five-second expiry", phase["stack"]==1 and phase["timer"]["alive"])
    distinct(1,"mob")
    world.advance(5)
    check("Web old cast duplicate neither adds nor refreshes", phase["stack"]==0)
    distinct(2,"mob")
    younger=phase["timer"]
    distinct(1,"mob")
    check("Q69 a late duplicate in the old fleet neither steals nor refreshes the younger fleet visit",
          phase["stack"]==1 and phase["timer"] is younger and visited[1]==visited[2]=={"mob"})
    for i in range(20):
        distinct(2,i)
    world.advance(6)
    distinct(2,"extraAtCap")
    world.advance(10)
    check("Web new cast can revisit and hitting a new target when capped refreshes shared aura",
          phase["stack"]==15 and visited[1]=={"mob"})
    world.advance(11)
    check("Web refreshed capped group expires if no new target hits again", phase["stack"]==0)
    return checks


def main():
    report=metadata()
    report["probes"]=probes()
    body=json.dumps(report,ensure_ascii=False,indent=2)+"\n"
    if sys.argv[1:]==["--write"]:
        OUT.write_text(body)
    else:
        assert OUT.read_text()==body
    print(f"A082 ready, {len(report['probes'])} boundary probes, 40 workbook cells")


if __name__=="__main__":
    main()
