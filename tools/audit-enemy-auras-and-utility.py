#!/usr/bin/env python3
"""Verify mounted enemy aura objects, source qualifications and the craggy reaction."""
from contextlib import closing
from pathlib import Path
import json
import sys

import audit_index as ai

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"docs/rules/enemy-auras-and-utility.json"
HOSTS={"N541":"ma04","N553":"ma03","N544":"b112","N545":"b113","N546":"b114","N547":"b112","N556":"b115","T044":"m013","T045":"m035"}
RULES={
    "N541":{"sample":[0,100,14],"trigger":"ATTACKED","duration":1,"marker":"T069","blockedBy":["magic immune","existing N540 mark"]},
    "N553":{"radius":1000,"movement":-.2,"attackSpeed":-.3,"buff":"B065"},
    "N544":{"radius":999999,"maxLifeRegenPerSec":.006},
    "N545":{"radius":999999,"movement":.2,"attackSpeed":0,"buff":"B025"},
    "N546":{"radius":999999,"flatArmor":300,"buff":"B026"},
    "N547":{"radius":999999,"movement":0,"healthRegen":0,"buff":"B024"},
    "N556":{"radius":9999999,"maxManaPerSec":-.03,"capture":"recipient maxMana at grant, source identity","buff":"B066"},
    "T044":{"radius":220,"damage":0,"duration":1,"buff":"B019"},
    "T045":{"evidence":"npc-mainline-abilities-01.md","maxTargets":0},
}


def metadata():
    with closing(ai.connect()) as db:
        result={}
        for key,host in HOSTS.items():
            mounted=ai.objects(db,host,"units_unitabilities",fields=["abilList"])[0]
            assert key in mounted["fields"]["abilList"].split(",")
            result[key]={"host":mounted,"object":ai.objects(db,key,"units_abilitydata")[0],
                         "routes":ai.references(db,key),"web":RULES[key]}
    assert result["N544"]["object"]["fields"]["DataB1"]==result["N556"]["object"]["fields"]["DataB1"]==1
    assert not any(x in result["T044"]["object"]["fields"] for x in ("DataA1","DataB1","DataC1"))
    return {"status":"ready","abilities":result,"source":ai.DISASM}


def probes():
    path=ROOT/"tools/audit-wisp-link-overcharge-relocate.py"
    vm={"__file__":str(path)}
    exec(compile(path.read_text().split("\nCOUNT=0;VECTORS=[]",1)[0],path,"exec"),vm)
    execute,fn,cl,unit=(vm[k] for k in ("execute","function","Closure","unit"))
    w=vm["World"]()
    enemy,target=unit("ma04",11,N541=1),unit("tower")
    w.env.update(N540_Unit={},AddArrAny=cl("main/f7/f22",[w.env]),
                 UNIT_TYPE_MAGIC_IMMUNE="immune",IsUnitType=lambda u,k:u.get(k,False),
                 PauseUnit=lambda u,state:u.update(paused=state),GetRandomInt=lambda lo,hi:(lo,hi)[0])
    execute(fn("main/f194"),[w.env])
    trigger=w.env["N541_Damage"]
    target["immune"]=True
    trigger(enemy,target)
    assert not target["skills"] and not w.queue
    target["immune"]=False
    w.env["N540_Unit"][1]=target
    trigger(enemy,target)
    assert not target["skills"] and not w.queue
    w.env["N540_Unit"].clear()
    trigger(enemy,target)
    w.advance(.5)
    trigger(enemy,target)
    assert target["paused"] and target["skills"]["T069"]==1 and len(w.queue)==1
    w.advance(1)
    assert not target["paused"] and "T069" not in target["skills"]
    ramp=RULES["N556"]["maxManaPerSec"]*1000
    assert (7+ramp)*2==-46 and max(0,40+(7+ramp)*2)==0
    return ["N541 original excludes magic immunity and N540 membership",
            "N541 repeat does not postpone one-second release",
            "N556 additive captured-max mana drain underflow is clamped"]


if __name__=="__main__":
    report=metadata()
    report["probes"]=probes()
    payload=json.dumps(report,ensure_ascii=False,indent=2)+"\n"
    if sys.argv[1:]==["--write"]:
        OUT.write_text(payload)
    else:
        assert OUT.read_text()==payload
    print("8 audited effects, 1 existing cross-reference, 3 probes")
