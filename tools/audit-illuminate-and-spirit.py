#!/usr/bin/env python3
"""Verify the original gated release and the shared blind callback."""
from contextlib import closing
from math import atan2, cos, degrees, radians, sin
from pathlib import Path
import json
import sys

import audit_index as ai

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"docs/rules/illuminate-and-spirit.json"


def metadata():
    with closing(ai.connect()) as db:
        rows={k:ai.workbook_rows(db,k,"塔技能") for k in ("A189","A191")}
        refs={k:ai.references(db,k) for k in ("A189","A191","q062","q063","q064","T207","T408","T409","B218")}
        objects={k:[o for tab in ("units_abilitydata","war3map.w3a","units_unitabilities","units_abilitybuffdata")
                    for o in ai.objects(db,k,tab)]
                 for k in ("q062","q063","q064","T207","T408","T409","B218")}
        modules={f:[lo,hi] for f,lo,hi in db.execute(
            "select name,start_line,end_line from function where name glob 'main/f134*' or name glob 'main/f136*' order by start_line")}
    assert all(len(r)==2 and r[0]["cells"]==r[1]["cells"] for r in rows.values())
    profile=(ROOT/"reference/map-6.25/units_campaignabilitystrings.txt").read_text()
    for k in ("T207","T408"):
        f=objects[k][0]["fields"]
        assert (f["Area1"],f["DataC1"],f["DataD1"])==(400,1500,400)
        assert "Missilespeed=1500" in profile.split(f"[{k}]\n",1)[1].split("\n[",1)[0]
    assert objects["T409"][0]["fields"]["BuffID1"]=="B218" and objects["T409"][0]["fields"]["Dur1"]==5
    return {"skills":{"A189":"ready","A191":"ready"},"rows":rows,"references":refs,"objects":objects,
            "source":{"path":ai.DISASM,"functions":modules,"damagePC":{"q062":921,"q064":933}},
            "web":{"wave":{"travel":1500,"radius":400,"speed":1500,"sourceLifetime":1,"maxAmount":999999},
                   "A189":{"chargeTime":[1,2,2,2,2,2],"rate":[1500,2000,3750,4500,5250,6000],"staffFactor":1.9,
                           "carrier":"q064","applyBlind":True,"chargeResolution":"Q76 continuous elapsed clamped to this cast limit","release":"once per committed cast on ENDCAST, including exact deadline"},
                   "A191":{"delay":1.2,"visualLife":2,"capturedAimDistance":200,"base":[3000,5000,7000,9000,11000,13000],
                           "staffCarrier":"q062","normalCarrier":"q001","applyBlind":"staff only","staffInt":[4,4,6,6,8,8],
                           "delayedOwner":"castId","staffIntRead":"base INT and rank at collision"},
                   "blind":{"id":"B218","duration":5,"parentDamageFactor":1.6,"existingCheck":"before refresh, base packet only"}}}


def probes():
    path=ROOT/"tools/audit-wisp-link-overcharge-relocate.py"
    vm={"__file__":str(path)}
    exec(compile(path.read_text().split("\nCOUNT=0;VECTORS=[]",1)[0],path,"exec"),vm)
    execute,fn,unit=(vm[k] for k in ("execute","function","unit"))
    w=vm["World"]()
    hero=unit("H049",A189=1,A191=1)
    hero["userData"]=5
    w.env["Tower_ALL"][5]=hero
    carriers,orders,events=[],[],[]
    knobs={"staff":False,"amount":100}

    def make_unit(owner,kind,point,_facing):
        u=unit(kind,owner)
        u.update(point or {})
        return u

    def make_carrier(owner,point,facing,spell,tier,life,kind="q001"):
        u=make_unit(owner,kind,point,facing)
        u.update(skills={spell:tier},lifetime=life)
        carriers.append(u)
        return u

    def timer():
        t=w.timer()
        t["created"]=w.now
        return t

    w.env["math"]["rad"]=radians
    w.env.update(
        GetUnitUserData=lambda u:u.get("userData",0) if u else 0,SetUnitUserData=lambda u,i:u.update(userData=i),
        AngleBetweenPoints=lambda a,b:degrees(atan2(b["y"]-a["y"],b["x"]-a["x"])),
        Cos=cos,Sin=sin,Location=lambda x,y:{"x":x,"y":y},Has_A_Item=lambda _u:knobs["staff"],
        CreateTempAndSetAbilityLv=make_carrier,SetUnitScale=lambda *_:None,CreateUnitAtLoc=make_unit,
        UnitApplyTimedLife=lambda u,_b,d:u.update(lifetime=d),DestroyEffect=lambda *_:None,
        IssuePointOrderLoc=lambda *a:orders.append(a),CreateTimer=timer,TimerGetElapsed=lambda t:float(w.now-t["created"]),
        IssueTargetOrder=lambda *_:events.append("blind order"),SetMagicDamage=lambda _o,_t,a:events.append(("bonus",a)),
    )
    w.japi.update(EXSetEventDamage=lambda a:knobs.update(amount=a),GetEventDamage=lambda _v:knobs["amount"])
    execute(fn("main/f134"),[w.env],(lambda _:w.japi,))
    execute(fn("main/f136"),[w.env],(lambda _:w.japi,))
    w.env["IssueImmediateOrder"]=lambda u,cmd:w.env["A189_Release"](u) if cmd=="stop" else None
    w.env["A189_Action"](hero,{"x":500,"y":0})
    w.advance(1)
    assert len(orders)==1 and carriers[-1]["skills"]=={"T207":1} and carriers[-1]["kind"]=="q064"
    w.env["A189_Release"](hero)
    assert len(orders)==1
    hero["skills"]["A189"]=3
    knobs["staff"]=True
    w.env["A189_Action"](hero,{"x":500,"y":0})
    w.advance(1.75)
    w.env["A189_Release"](hero)
    assert carriers[-1]["skills"]=={"T207":0}
    hero["skills"]["A191"]=3
    w.env["A191_Action"](hero,{"x":500,"y":0})
    assert len(orders)==2
    hero["x"]=75
    w.advance(2.95)
    assert len(orders)==3 and carriers[-1]["kind"]=="q062" and carriers[-1]["x"]==75
    assert carriers[-1]["skills"]=={"T408":3} and orders[-1][2]=={"x":200.0,"y":0.0}
    hero["int"]=50
    target=unit("monster",11,B218=1)
    w.env["A191_Damage"](hero,target)
    assert knobs["amount"]==160 and events==["blind order",("bonus",300)]
    target["skills"].clear()
    knobs["amount"]=100
    w.env["A191_BuffDamage"](hero,target)
    assert knobs["amount"]==100 and events[-1]=="blind order" and carriers[-1]["skills"]=={"T409":1}
    w.env["A191_Action"](hero,{"x":500,"y":0})
    w.advance(3.45)
    w.env["A191_Action"](hero,{"x":0,"y":500})
    w.advance(4.15)
    assert carriers[-1]["userData"]==-1 and carriers[-1]["skills"]=={"T408":0} and orders[-1][2] is None
    return ["A189 timeout stops and asks ENDCAST to release rank-one payload at original integer level 1",
            "A189 post-release timer or repeated ENDCAST cannot launch twice",
            "A189 fractional early staff release requests rank zero in original Lua",
            "A191 waits 1.2s and uses live launch origin plus stored 200-unit aim point",
            "A191 reads existing blind before refreshing; staff bonus is a distinct INT damage call",
            "A189 callback on a clean target orders B218 with no retroactive current-hit increase",
            "A191 older original timer loses its tower/aim when a later cast overwrites the shared slot"]


if __name__=="__main__":
    report=metadata()
    report["probes"]=probes()
    payload=json.dumps(report,ensure_ascii=False,indent=2)+"\n"
    if sys.argv[1:]==["--write"]:
        OUT.write_text(payload)
    else:
        assert OUT.read_text()==payload
    print("A189/A191, 7 boundary probes, 40 workbook cells")
