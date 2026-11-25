#!/usr/bin/env python3
"""Validate active challenge enemy effect fields and new state boundaries."""
from contextlib import closing
from pathlib import Path
import json
import sys

import audit_index as ai

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"docs/rules/challenge-enemy-effects.json"
IDS=[f"N{i}" for i in (701,702,703,704,706,707,708,709,710,711,712,582,583,584)]


def metadata():
    with closing(ai.connect()) as db:
        keys=IDS+["T140","T254","B135","B182"]
        objects={k:[o for t in ("units_abilitydata","war3map.w3a","units_abilitybuffdata") for o in ai.objects(db,k,t)] for k in keys}
        refs={k:ai.references(db,k) for k in keys}
    marker_core=[objects[k][0]["fields"] for k in IDS[:4]]
    assert all(o["code"]=="AHad" and o["targs1"]=="none" and "DataA1" not in o for o in marker_core)
    slow=objects["T140"][0]["fields"]
    assert [(slow[f"DataA{i}"],slow[f"DataB{i}"],slow[f"Dur{i}"]) for i in range(1,4)]==[(.1,.5,2),(.4,.8,2),(.6,1.2,2)]
    clap=objects["T254"][0]["fields"]
    assert all(clap[f"DataD{i}"]==.4*i or abs(clap[f"DataD{i}"]-.4*i)<1e-9 for i in range(1,4))
    return {"status":"ready","ids":IDS,"objects":objects,"source":{"path":ai.DISASM,"references":refs},
            "web":{"unreachableEntryMarker":"N705","untouchable":{"movement":[.1,.4,.6],"attackSpeed":[.5,.8,1.2],"duration":2},
                   "N709":{"strictHpThresholdsDescending":[.91,.81,.71,.61,.51,.41,.31,.21,.12],
                           "levels":[.1,.2,.3,.4,.5,.6,.7,.8,.9,.99]},
                   "N710":{"readyHpThreshold":.5,"radius":1000,"stun":3,"heroStun":1.8,"damage":0},
                   "N712":{"readyHpThreshold":.7,"radius":1500,"baselineHealMaxLifeFactor":.2,"perAllyCurrentHpFactor":.5,
                           "allyHpChange":0,"lightningDuration":.5},
                   "resurrection":{"threshold":"D>current life","heal":"current maximum","slowTier":[1,1,3],
                                   "radius":1000,"attackSpeedSlow":[.4,.4,1.2],"duration":4,"movementSlow":0,"damage":0}}}


def probes():
    path=ROOT/"tools/audit-wisp-link-overcharge-relocate.py"
    vm={"__file__":str(path)}
    exec(compile(path.read_text().split("\nCOUNT=0;VECTORS=[]",1)[0],path,"exec"),vm)
    closure,fn,execute,unit=(vm[k] for k in ("Closure","function","execute","unit"))
    w=vm["World"]()
    e=w.env
    calls=[]
    group=[]
    caster=unit("boss",11,N709=1)
    caster["state"]["maxLife"]=1000

    def set_state(u,k,v):
        if k=="life":
            u[k]=min(v,u["state"]["maxLife"])
        else:
            u["state"][k]=v

    def carrier(owner,p,_angle,ability,rank,ttl):
        dummy=unit("q001",owner,**{ability:rank})
        dummy.update(p,ttl=ttl)
        calls.append(("carrier",dummy))
        return dummy

    e.update(GetUnitLifePre=lambda u:u["life"]/u["state"]["maxLife"],UNIT_STATE_MAX_LIFE="maxLife",
             SetUnitState=set_state,CreateTempAndSetAbilityLv=carrier,
             IssueTargetOrder=lambda *a:calls.append(a),IssueImmediateOrder=lambda *a:calls.append(a),
             CreateEffByUnit=lambda *_:None,CreateGroup=list,GroupEnumUnitsInRange=lambda g,*_:g.extend(group),
             FirstOfGroup=lambda g:g[0] if g else None,GroupRemoveUnit=lambda g,_u:g.pop(0),
             GroupClear=list.clear,DestroyGroup=lambda *_:None,_loop_=closure("main/f3/f5",[lambda *_:None]),
             AddArrAny=closure("main/f7/f22",[e]),IsUnitOwnedByPlayer=lambda u,p:u["owner"]==p,
             IsShopBoss=lambda u:u["kind"]=="shop",SetLightningColor=lambda *_:None)
    for m in (180,222,223,230):
        execute(fn(f"main/f{m}"),[e])
    for life,level in ((910,1),(909,2),(210,8),(209,9),(120,9),(119,10),(950,1)):
        caster["life"]=life
        e["N709_Action"](caster)
        assert caster["skills"]["N709"]==level,(life,level,caster["skills"])
    attacker=unit("tower",0)
    for key,r in (("N706",1),("N707",2),("N708",3)):
        mark=unit("maiden",11,**{key:1})
        e["N706_N708_Action"](attacker,mark)
        assert calls[-1][1:]==("slow",attacker) and calls[-1][0]["skills"]=={"T140":r}
    creep,shop=unit("creep",11),unit("shop",11)
    creep["life"],shop["life"]=180,200
    caster["life"]=400
    group[:]=[creep,shop,attacker]
    e["N712_Action"](caster)
    assert caster["life"]==690 and creep["life"]==180 and shop["life"]==200
    w.advance(.5)
    assert any(k[0]=="destroyLightning" for k in w.log)
    for key,r in (("N582",1),("N583",1),("N584",3)):
        caster["skills"][key]=1
        caster["life"]=2
        e["N582_584_Action"](caster)
        assert caster["life"]==1000 and all(k not in caster["skills"] for k in ("N582","N583","N584"))
        assert calls[-1][1]=="thunderclap" and calls[-1][0]["skills"]=={"T254":r}
    return ["N709 strict percentage thresholds and full reversion",
            "each untouchable tier chooses the matching T140",
            "N712 healing uses target's current life without decreasing it, excluding challenge units",
            "N712 per-target visual cleans up after one half-second",
            "N582/3/4 original ranks 1/1/3 each restore current entity and consume all revival markers"]


if __name__=="__main__":
    report=metadata()
    report["probes"]=probes()
    payload=json.dumps(report,ensure_ascii=False,indent=2)+"\n"
    if sys.argv[1:]==["--write"]:
        OUT.write_text(payload)
    else:
        assert OUT.read_text()==payload
    print(f'{len(IDS)} challenge effects, {len(report["probes"])} boundary probes')
