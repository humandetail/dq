#!/usr/bin/env python3
"""Verify N549 target candidates, unusual tree coordinates and cleanup."""
from contextlib import closing
from math import cos, isclose, sin
from pathlib import Path
import json
import sys

import audit_index as ai

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"docs/rules/sprout.json"


def report():
    with closing(ai.connect()) as db:
        object_=ai.objects(db,"N549","units_abilitydata")[0]
        routes={k:ai.references(db,k) for k in ("N549","N549_Skill","N549_Damage","LTlt")}
    f=object_["fields"]
    assert (f["DataF1"],f["Cost1"],f["Cool1"],f["Rng1"],f["targs1"])==("cannibalize",200,5,5000,"enemies,invulnerable")
    path=ROOT/"tools/audit-wisp-link-overcharge-relocate.py"
    vm={"__file__":str(path)}
    exec(compile(path.read_text().split("\nCOUNT=0;VECTORS=[]",1)[0],path,"exec"),vm)
    execute,closure,fn,unit=(vm[k] for k in ("execute","Closure","function","unit"))
    w=vm["World"]()
    caster,x,y=unit("caster",11),unit("town tower",0),unit("second tower",1)
    creep,ordinary,dead=unit("P11",11),unit("basic",0),unit("dead",0)
    ordinary["nativeHero"],dead["life"]=False,0
    x.update(x=10,y=20)
    choices=[creep,ordinary,dead,x,y]
    order,trees,removed=[],[],[]

    def tree(kind,x,y,facing,scale,variant):
        item=[kind,x,y,facing,scale,variant]
        trees.append(item)
        return item

    def random_index(lo,hi):
        order.append(("draw",lo,hi))
        return lo

    w.env["math"].update(cos=cos,sin=sin)
    w.env.update(CreateGroup=list,GroupEnumUnitsInRange=lambda g,_x,_y,_r,_f:g.extend(choices),
                 FirstOfGroup=lambda g:g[0] if g else None,GroupRemoveUnit=lambda g,_v:g.pop(0),
                 GroupClear=list.clear,DestroyGroup=lambda *_:None,_loop_=closure("main/f3/f5",[lambda *_:None]),
                 AddArrAny=closure("main/f7/f22",[w.env]),IsUnitOwnedByPlayer=lambda u,p:u["owner"]==p,
                 GetRandomInt=random_index,IssueTargetOrder=lambda _c,cmd,target:order.append((cmd,target)),
                 CreateDestructable=tree,RemoveDestructable=removed.append)
    execute(fn("main/f197"),[w.env])
    w.env["N549_Damage"](caster)
    assert order==[("draw",1,2),("cannibalize",x)]
    w.env["N549_Skill"](caster,x)
    assert len(trees)==11 and trees[0]==["LTlt",310.0,20.0,0,1.2,0]
    assert all(isclose(tx,10+300*cos(i*36)) and isclose(ty,20+300*sin(i*36)) and face==i*36
               for i,(_,tx,ty,face,_,_) in enumerate(trees))
    order.clear()
    w.env["N549_Damage"](caster)
    assert order==[("draw",1,1),("cannibalize",y)]
    w.env["N549_Skill"](caster,x)
    assert len(trees)==11
    w.advance(10)
    assert removed==trees
    order.clear()
    w.env["N549_Damage"](caster)
    assert order==[("draw",1,2),("cannibalize",x)]
    return {"skill":"N549","status":"ready","object":object_,"references":routes,"source":ai.DISASM,
            "web":{"candidateRadius":2000,"candidateType":"native HERO, living, owner != P11, no active sprout",
                   "order":"cannibalize","duration":10,"trees":11,"radius":300,"angleArgumentRadianStep":36,
                   "facingDegreesStep":36,"scale":1.2,"destructible":"LTlt","variant":0},
            "probes":["real random candidates exclude own P11, non-heroes and dead handles",
                      "tree array uses eleven Lua radians and JASS degree facings",
                      "marked target cannot be sprouted again until timer removes all trees"]}


if __name__=="__main__":
    result=json.dumps(report(),ensure_ascii=False,indent=2)+"\n"
    if sys.argv[1:]==["--write"]:
        OUT.write_text(result)
    else:
        assert OUT.read_text()==result
    print("N549, 3 boundary probes")
