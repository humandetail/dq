#!/usr/bin/env python3
"""Verify Fatal Bonds routes and overlapping-source regressions with the shared Lua VM."""
from contextlib import closing
from pathlib import Path
import json
import sys

import audit_index as ai

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"docs/rules/linked-damage.json"


def metadata():
    with closing(ai.connect()) as db:
        rows=ai.workbook_rows(db,"A173","塔技能")
        refs={k:ai.references(db,k) for k in ("A173","T188","q039","A173_Damage")}
        objects={k:ai.objects(db,k,tab)[0] for k,tab in (
            ("A173","units_abilitydata"),("T188","units_abilitydata"),("q039","units_unitabilities"))}
    assert len(rows)==4 and [r["cells"] for r in rows[:2]]==[r["cells"] for r in rows[2:]]
    assert all("6秒" in r["cells"][7] and "25%" in r["cells"][7] for r in rows)
    assert all(f"将{i}个" in rows[0]["cells"][8] for i in range(3,9))
    return {"skill":"A173","status":"ready","rows":rows,"references":refs,"objects":objects,
            "source":{"path":ai.DISASM,"functions":{"main/f122":[94299,95021],"main/f291/f1/dispatch":[166558,166582]}},
            "web":{"sourceCarrier":"latest living q039 for resolved damage-owner player", "sourceCarrierTTL":7,
                   "fraction":.25,"duration":6,"marker":"T188 derived from any active group",
                   "totalTargets":[3,4,5,6,7,8],"linkRadius":[300,350,400,450,500,550],
                   "sourceEventPC":3868,"forwardSourcePC":104,"visualLinkSeconds":.5,
                   "perGroupIndependent":True,"sourceDamageType":{"magic":["NORMAL","MAGIC"],
                   "physical":["HERO","NORMAL"],"divine":["CHAOS","DIVINE"]}}}


def probes():
    path=ROOT/"tools/audit-wisp-link-overcharge-relocate.py"
    vm={"__file__":str(path)}
    exec(compile(path.read_text().split("\nCOUNT=0;VECTORS=[]",1)[0],path,"exec"),vm)
    execute,closure,fn,unit=(vm[k] for k in ("execute","Closure","function","unit"))
    w=vm["World"]()
    caster=unit("H045",A173=1)
    caster["userData"]=3
    center,a,b,ally=unit("center",11),unit("side-a",11),unit("side-b",11),unit("ally")
    eligible=[center,a,ally]
    carriers=[]
    forwarded=[]
    parent={"amount":160,"type":"magic"}

    def make_carrier(owner,kind,point,_facing):
        u=unit(kind,owner)
        u.update(point)
        carriers.append(u)
        return u

    w.env.update(CreateGroup=list,GroupEnumUnitsInRange=lambda g,*_:g.extend(eligible),FirstOfGroup=lambda g:g[0] if g else None,
                 GroupRemoveUnit=lambda g,_u:g.pop(0),GroupClear=list.clear,DestroyGroup=lambda *_:None,
                 _loop_=closure("main/f3/f5",[lambda *_:None]),AddArrAny=closure("main/f7/f22",[w.env]),
                 IsUnitOwnedByPlayer=lambda u,p:u["owner"]==p,GetPlayerId=lambda p:p,
                 GetUnitUserData=lambda u:u.get("userData",0) if u else 0,SetUnitUserData=lambda u,i:u.update(userData=i),
                 CreateUnitAtLoc=make_carrier,UnitApplyTimedLife=lambda u,_buff,life:u.update(lifetime=life),
                 UnitDamageTarget=lambda *args:forwarded.append(args),isMagicDamage=lambda t:t=="magic",
                 isPhyDamage=lambda t:t=="normal",isRealDamage=lambda t:t=="divine",
                 ATTACK_TYPE_NORMAL="normal",DAMAGE_TYPE_MAGIC="magic",ATTACK_TYPE_HERO="hero",
                 DAMAGE_TYPE_NORMAL="normal",ATTACK_TYPE_CHAOS="chaos",DAMAGE_TYPE_DIVINE="divine",WEAPON_TYPE_WHOKNOWS="none",
                 CreateEffByUnit=lambda *_:None)
    w.japi.update(GetEventDamage=lambda _v:parent["amount"],EXGetEventDamageData=lambda _v:parent["type"])
    execute(fn("main/f122"),[w.env],(lambda _:w.japi,))
    action,damage=(w.env[k] for k in ("A173_Action","A173_Damage"))
    action(caster,center)
    w.advance(2)
    eligible[:]=[center,b]
    action(caster,center)
    damage(caster,center)
    assert [(e[1]["kind"],e[2],e[3:7]) for e in forwarded]==[
        ("side-a",40,(False,False,"normal","magic")),("side-b",10,(False,False,"normal","magic"))]
    assert all(e[0] is carriers[-1] for e in forwarded) and carriers[-1]["lifetime"]==7
    w.advance(6)
    assert "T188" not in center["skills"] and "T188" in b["skills"]
    forwarded.clear()
    other=unit("other player",1)
    damage(other,center)
    assert not forwarded
    incoming=unit("different same player tower")
    incoming["userData"]=28
    parent["type"]="normal"
    damage(incoming,center)
    assert forwarded[0][0]["userData"]==28 and forwarded[0][1] is b and forwarded[0][2:7]==(40,False,False,"hero","normal")
    return ["source overlap multiplies one mutable amount again for second group",
            "expiry of first source group wrongly removes marker still needed by second",
            "latest same-player carrier takes incoming owner index and routes physical as HERO/NORMAL",
            "no carrier in incoming player's original slot blocks raw forwarding"]


if __name__=="__main__":
    report=metadata()
    report["probes"]=probes()
    payload=json.dumps(report,ensure_ascii=False,indent=2)+"\n"
    if sys.argv[1:]==["--write"]:
        OUT.write_text(payload)
    else:
        assert OUT.read_text()==payload
    print("A173, 4 boundary probes, 40 workbook cells")
