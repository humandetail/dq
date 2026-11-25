#!/usr/bin/env python3
"""Check the five tide and Morphling skills and original gameplay boundaries."""
from contextlib import closing
from math import atan2, cos, degrees, radians, sin
from pathlib import Path
import json
import sys

import audit_index as ai

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"docs/rules/tide-and-morphling.json"
ENTRIES={
    "A217":(157,["A218","T276","T277","T278","q054","B178"]),
    "A221":(158,[]),
    "A223":(160,["q055","q057","q058","T297"]),
    "A224":(161,["q056","T286","BPSE"]),
    "A225":(162,["A226","A227","A228","A229","T287","T288","T298","T299"]),
}
WEB={
    "A217":{"mana":[30,60,90,120,150,180],"cooldown":[12,11,10,9,8,7],"range":1000,"damage":[500*i for i in range(1,7)],
            "armor":[20,30,40,50,60,70],"slow":.4,"duration":4,"carrierSpeed":1000,"staffTravel":1200,
            "startRadius":1,"endRadius":425,"normalTravel":"through confirmed target position at commit","mainAndPathPerTarget":1,"sourceCarrierDamage":10,"stubOutput":0,
            "T278Stun":{"normal":[.01]*6,"hero":[.01,.01,.01,.01,3,3]}},
    "A221":{"mana":[25,30,35,40,50,60],"cooldown":[9,8,7,6,5,4],"radius":600,
            "lifeFactor":[.2,.4,.6,.8,1,1.2],"attackFactor":[.5,1,1.5,2,2.5,3],"attackRead":"S18+S19",
            "flags":[False,False,"HERO","NORMAL"]},
    "A223":{"mana":[30,40,50,60,70,80],"cooldown":[9,8,7,6,5,4],"range":1000,
            "damage":[500*i for i in range(1,7)],"wave":{"startRadius":225,"endRadius":100,"speed":1100,"travel":1000,"lifetime":1},
            "visual":{"stepSize":80,"period":.06,"moves":12,"cleanupAt":.78,"sourceTimedLife":.1},
            "onHit":["capture S18+S19","Item_Attack_Action","physical child"],"casterMoves":False},
    "A224":{"mana":[15,30,45,60,75,90],"cooldown":[15,14,13,12,11,10],"range":1000,
            "stunCap":[2,2.8,3.6,4.4,5.2,6],"heroStunFactor":.7,"stun":"min(cap, .1 + (.3 + .2L)*min(STR/AGI,4))",
            "maxRatio":[6,9,12,15,18,21],"damage":"300L + AGI*R + targetLife*.01*R, R=min(AGI/STR,3L+3)",
            "lifeTermSpecialFactor":.3,"sourceCarrierDamage":100,"stubOutput":0,"carrier":"q056","carrierSpeed":1000},
    "A225":{"learnIncrement":[10,20,30,40,50,60],"cumulative":[10,30,60,100,150,210],"period":.1,
            "manaCost":3,"manaGate":"strict > 3","transfer":"min(live rank, current base donor - 1)",
            "minDonor":1,"toAgiLifeGate":"strict > 500","toStrLifeGate":None,
            "agiButton":["A226","A227","T288"],"strButton":["A228","A229","T287"]},
}


def metadata():
    skills={}
    with closing(ai.connect()) as db:
        for key,(module,aux) in ENTRIES.items():
            rows=ai.workbook_rows(db,key,"塔技能")
            half=len(rows)//2
            assert half and [r["cells"] for r in rows[:half]]==[r["cells"] for r in rows[half:]]
            tabs=("units_abilitydata","war3map.w3a","units_unitabilities","units_abilitybuffdata")
            objects={k:[o for tab in tabs for o in ai.objects(db,k,tab)] for k in [key]+aux}
            casts={u:ai.objects(db,u,"units_unitweapons",fields=["castpt","castbsw"])[0]["fields"] for u in sorted({r["cells"][1] for r in rows})}
            prefix=f"main/f{module}"
            functions={f:[lo,hi] for f,lo,hi in db.execute(
                "SELECT name,start_line,end_line FROM function WHERE name=? OR name LIKE ? ORDER BY start_line",(prefix,prefix+"/%"))}
            skills[key]={"status":"ready","rows":rows,"objects":objects,"references":ai.references(db,key),
                         "castTimes":casts,"functions":functions,"web":WEB[key]}
    surge=skills["A217"]["objects"]
    assert surge["T277"][0]["fields"]["DataD1"]==425 and surge["T278"][0]["fields"]["DataA1"]==500
    assert {m["level"] for m in surge["T278"][1]["fields"]["mods"] if m["key"]=="ahdu" and m["value"]==3}=={5,6}
    profile=(ROOT/"reference/map-6.25/units_campaignabilitystrings.txt").read_text()
    for key,fields in {"T277":(1,1200,425,1000),"T297":(225,1000,100,1100)}.items():
        skill="A217" if key=="T277" else "A223"
        obj=skills[skill]["objects"][key][0]["fields"]
        assert tuple(obj[k] for k in ("Area1","DataC1","DataD1"))==fields[:3]
        assert f"Missilespeed={fields[3]}" in profile.split(f"[{key}]\n",1)[1].split("\n[",1)[0]
    assert "Missilespeed=1000" in profile.split("[T286]\n",1)[1].split("\n[",1)[0]
    assert skills["A224"]["objects"]["T286"][0]["fields"]["DataA1"]==100
    return {"baseline":"tide-and-morphling-v1","source":{"path":ai.DISASM},"skills":skills}


def probes():
    path=ROOT/"tools/audit-wisp-link-overcharge-relocate.py"
    vm={"__file__":str(path)}
    exec(compile(path.read_text().split("\nCOUNT=0;VECTORS=[]",1)[0],path,"exec"),vm)
    execute,fn,unit=(vm[k] for k in ("execute","function","unit"))
    w=vm["World"]()
    tide,morph,target=unit("H057",A217=2,A218=2,A221=6),unit("H058",A223=1,A224=1,A225=1),unit("creep",11)
    tide["userData"],morph["userData"]=3,5
    w.env["Tower_ALL"].update({3:tide,5:morph})
    calls=[]

    def carrier(owner,point,_facing,key,rank,dur,kind="q001"):
        source=unit(kind,owner,**{key:rank})
        source.update(point,lifetime=dur)
        return source

    def factory(n,japi=False):
        execute(fn(f"main/f{n}"),[w.env],(lambda _:w.japi,) if japi else ())

    def reset_attack(s,t):
        calls.append(("item",s,t))
        s["state"][18]=1000

    w.env.update(UNIT_STATE_MAX_LIFE="maxLife",UNIT_STATE_MANA="mana",GetUnitUserData=lambda u:u["userData"],
                 SetUnitUserData=lambda u,k:u.update(userData=k),CreateTempAndSetAbilityLv=carrier,
                 IssueTargetOrder=lambda *a:calls.append(a),IssuePointOrderLoc=lambda *a:calls.append(a),
                 SetPhyDamagePoint=lambda *a:calls.append(a),Item_Attack_Action=reset_attack,
                 SetPhyDamage=lambda *a:calls.append(a),SetMagicDamage=lambda *a:calls.append(a),
                 SetHeroStr=lambda u,v,_p:u.update(str=v),SetHeroAgi=lambda u,v,_p:u.update(agi=v),
                 IsShopBoss=lambda _u:False)
    w.japi["EXSetAbilityDataReal"]=lambda _a,level,field,value:calls.append((level,field,value))
    factory(157)
    w.env["A217_Action"](tide,target)
    assert [c[1] for c in calls]==["acidbomb","thunderbolt"] and all("userData" not in c[0] for c in calls)
    calls.clear()
    w.env["A217_A_Action"](tide,{"x":425,"y":100})
    w.env["A217_Damage"](tide,target)
    assert [c[1] for c in calls]==["carrionswarm","acidbomb","thunderbolt"]
    assert calls[0][0]["kind"]=="q054" and all(c[0]["userData"]==3 for c in calls)
    calls.clear()
    w.current=tide
    tide["state"].update({18:180,19:20,"maxLife":1000})
    factory(158)
    w.env["A221_Action"]()
    assert calls==[(tide,0,600,0,0,1800)]
    calls.clear()
    morph["state"].update({18:95,19:17})
    factory(160)
    w.env["A223_Damage"](morph,target)
    assert calls==[("item",morph,target),(morph,target,112)]
    calls.clear()
    factory(161,True)
    morph.update(str=400,agi=100)
    w.env["A224_Action"](morph,target)
    assert calls[0]==(1,102,2.1) and abs(calls[1][2]-1.47)<1e-9
    morph.update(str=100,agi=1000)
    target["life"]=1000
    w.env["Game_Mode"]=2
    w.env["A224_Damage"](morph,target)
    assert calls[-1]==(morph,target,6318)
    factory(162)
    morph.update(str=10,agi=100,life=501)
    morph["state"]["mana"]=20
    w.env["A225_study"](morph)
    morph["skills"]["A225"]=2
    w.env["A225_study"](morph)
    assert (morph["str"],morph["agi"],morph["skills"]["A226"],morph["skills"]["A228"])==(40,130,2,2)
    w.env["A225_MJ_off"](morph)
    w.advance(.1)
    assert (morph["str"],morph["agi"],morph["state"]["mana"])==(38,132,17)
    w.env["A225_LL_off"](morph)
    morph["life"]=450
    w.advance(.2)
    assert (morph["str"],morph["agi"],morph["state"]["mana"])==(40,130,14) and "A227" not in morph["skills"]
    morph["state"]["mana"]=3
    w.advance(.3)
    assert morph["state"]["mana"]==3 and "A229" not in morph["skills"] and "T287" not in morph["skills"]
    morph["life"]=500
    morph["state"]["mana"]=20
    w.env["A225_MJ_off"](morph)
    w.advance(.4)
    assert morph["state"]["mana"]==20 and "A227" not in morph["skills"]
    morph["life"],morph["str"]=501,2
    w.env["A225_MJ_off"](morph)
    w.advance(.5)
    assert morph["str"]==1 and morph["state"]["mana"]==17
    w.advance(.6)
    assert morph["state"]["mana"]==17 and "A227" not in morph["skills"]
    visuals=[]
    def visual(owner,kind,x,y,angle):
        result=unit(kind,owner)
        result.update(x=x,y=y,angle=angle)
        visuals.append(result)
        return result
    w.env["math"]["rad"]=radians
    w.env.update(AngleBetweenPoints=lambda a,b:degrees(atan2(b["y"]-a["y"],b["x"]-a["x"])),
                 Cos=cos,Sin=sin,Location=lambda x,y:{"x":x,"y":y},
                 SetUnitFacing=lambda u,degrees_:u.update(facing=degrees_),CreateUnit=visual,
                 SetUnitX=lambda u,x:u.update(x=x),SetUnitY=lambda u,y:u.update(y=y),
                 UnitApplyTimedLife=lambda u,_b,d:u.update(lifetime=d))
    w.env["A223_Action"](morph,{"x":900,"y":0})
    assert visuals[0]["kind"]=="q055" and visuals[0]["lifetime"]==.1 and morph["x"]==0
    w.advance(1.32)
    assert visuals[0]["x"]==960 and morph["x"]==0 and any(t["alive"] for _,_,t in w.queue)
    w.advance(1.38)
    assert not any(t["alive"] and t["callback"].name=="main/f160/f1" for _,_,t in w.queue)
    return ["A217 ordinary source emits control then damage at main target without writing tower index",
            "A218 and its q054 hit write tower index and issue the two independent orders",
            "A221 rank-six physical amount and radius use original HP and weapon fields",
            "A223 equipment callback cannot retroactively change captured attack amount",
            "A224 original max duration 2.1 and native hero .7 duration shape",
            "A224 ratio and deep-mode multiplier affect distinct terms",
            "A225 second learning adds 20 on top of first 10 and refreshes controls",
            "A225 .1 second movement and mutually exclusive direction switch",
            "A225 STR recipient direction allows life below 500, exact three mana stops",
            "A225 AGI recipient stops at life 500 and does not convert the last base STR point",
            "A223 visual handle gets twelve nominal movements and is not the caster; source timed life is independent"]


if __name__=="__main__":
    report=metadata()
    report["probes"]=probes()
    payload=json.dumps(report,ensure_ascii=False,indent=2)+"\n"
    if sys.argv[1:]==["--write"]:
        OUT.write_text(payload)
    else:
        assert OUT.read_text()==payload
    print("5 skills, 11 boundary probes, 160 workbook cells")
