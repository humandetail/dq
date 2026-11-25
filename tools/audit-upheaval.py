#!/usr/bin/env python3
"""Verify Upheaval's original stage clock and the separate visual carrier."""
from contextlib import closing
from pathlib import Path
import json
import sys

import audit_index as ai

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"docs/rules/upheaval.json"


def metadata():
    aura_ids=[f"T{i}" for i in range(190,196)]
    with closing(ai.connect()) as db:
        rows=ai.workbook_rows(db,"A174","塔技能")
        aura={k:ai.objects(db,k,"units_abilitydata")[0] for k in aura_ids}
        visuals={k:ai.objects(db,k,"units_unitabilities")[0] for k in ("q040","q044")}
        routes={k:ai.references(db,k) for k in ("A174","A174_Action","A174_Dur_End","q040","q044")}
    assert len(rows)==4 and [r["cells"] for r in rows[:2]]==[r["cells"] for r in rows[2:]]
    stages=[[-o["fields"][f"DataA{i}"] for i in range(1,5)] for o in aura.values()]
    assert all(o["fields"]["code"]=="AUau" and o["fields"]["Area1"]==500 and o["fields"]["BuffID1"]=="B161" for o in aura.values())
    assert all(f"{int(table[-1]*100)}%" in rows[0]["cells"][8] for table in stages)
    assert all(v["fields"]["abilList"]=="Avul,Aloc" for v in visuals.values())
    return {"skill":"A174","status":"ready","rows":rows,"aura":aura,"visuals":visuals,"routes":routes,
            "source":{"path":ai.DISASM,"functions":{"main/f123":[95021,95349],"main/f291/f15":[172202,172217]}},
            "web":{"channel":5,"carrierLife":5,"radius":500,"period":1,"stageTimes":[0,1,2,3],"stages":stages,
                   "auraGroup":"B161 strongest, no movement residual after losing eligibility",
                   "interrupt":"stop stage clock only","recast":"old clock replaced, old carrier independent timed life",
                   "visualLife":1,"visualDefault":"q040","skinVisual":"q044","visualVariant":"current caster form"}}


def probes():
    path=ROOT/"tools/audit-wisp-link-overcharge-relocate.py"
    vm={"__file__":str(path)}
    exec(compile(path.read_text().split("\nCOUNT=0;VECTORS=[]",1)[0],path,"exec"),vm)
    execute,fn,unit=(vm[k] for k in ("execute","function","unit"))
    w=vm["World"]()
    normal,skin=unit("H045",A174=6),unit("G070",A174=1)
    normal["userData"],skin["userData"]=3,5
    w.env["Tower_ALL"].update({3:normal,5:skin})
    carriers,visuals=[],[]

    def make_carrier(owner,where,_facing,spell,tier,life):
        u=unit("q001",owner,**{spell:tier})
        u.update(where,lifetime=life)
        carriers.append(u)
        return u

    def make_visual(owner,kind,where,_facing):
        u=unit(kind,owner)
        u.update(where)
        visuals.append(u)
        return u

    def set_level(u,k,level):
        u["skills"][k]=min(4,level)

    w.env.update(GetUnitUserData=lambda u:u["userData"],CreateTempAndSetAbilityLv=make_carrier,
                 CreateUnitAtLoc=make_visual,UnitApplyTimedLife=lambda u,_buff,life:u.update(lifetime=life),
                 SetUnitAbilityLevel=set_level)
    execute(fn("main/f123"),[w.env])
    spell=w.env["A174_Action"]
    spell(normal,{"x":7,"y":20})
    assert carriers[0]["lifetime"]==5 and carriers[0]["skills"]=={"T195":1} and visuals[0]["kind"]=="q040"
    w.advance(1)
    assert carriers[0]["skills"]=={"T195":2}
    w.advance(3)
    assert carriers[0]["skills"]=={"T195":4}
    w.current=normal
    w.env["A174_Dur_End"]()
    assert not any(t["alive"] for _,_,t in w.queue)
    assert carriers[0]["lifetime"]==5 and carriers[0]["skills"]=={"T195":4}
    spell(skin,{"x":8,"y":20})
    spell(normal,{"x":9,"y":20})
    assert [u["kind"] for u in visuals[-2:]]==["q044","q044"]
    assert all(u["lifetime"]==1 for u in visuals)
    assert carriers[-2]["skills"]=={"T190":1} and carriers[-1]["skills"]=={"T195":1}
    return ["T195 reaches tier 2 at first second, tier 4 at third",
            "ENDCAST stops growth without shortening carrier",
            "G070 changes visual upvalue; subsequent H045 inherits q044 while combat aura remains correct"]


if __name__=="__main__":
    report=metadata()
    report["probes"]=probes()
    payload=json.dumps(report,ensure_ascii=False,indent=2)+"\n"
    if sys.argv[1:]==["--write"]:
        OUT.write_text(payload)
    else:
        assert OUT.read_text()==payload
    print("A174, 3 boundary probes, 40 workbook cells")
