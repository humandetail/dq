#!/usr/bin/env python3
"""Verify the supernova egg's original damage gate and finish order."""
from contextlib import closing
from pathlib import Path
import json
import sys

import audit_index as ai

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"docs/rules/supernova-egg.json"


def report():
    with closing(ai.connect()) as db:
        objects={k:[o for t in ("units_abilitydata","units_abilitybuffdata","units_unitdata","units_unitbalance","units_unitabilities",
                               "units_unitweapons","war3map.w3u") for o in ai.objects(db,k,t)]
                 for k in ("N576","T097","b138","m050","BNef")}
        routes={k:ai.references(db,k) for k in ("N576","T097","b138","N576_Action")}
    assert objects["N576"][0]["fields"]["DataA1"]=="b138"
    assert any(o["fields"].get("HP")==33 for o in objects["b138"])
    path=ROOT/"tools/audit-wisp-link-overcharge-relocate.py"
    vm={"__file__":str(path)}
    exec(compile(path.read_text().split("\nCOUNT=0;VECTORS=[]",1)[0],path,"exec"),vm)
    execute,fn,unit=(vm[k] for k in ("execute","function","unit"))
    w=vm["World"]()
    s,t=unit("tower"),unit("b138",11,N534=1)
    d={"amount":100,"attack":1}
    w.japi.update(GetEventDamage=lambda _:d["amount"],EXSetEventDamage=lambda value:d.update(amount=value),
                  EXGetEventDamageData=lambda _field:d["attack"])
    event=fn("main/f291/f1")
    for native,attack,amount,expected in ((True,1,100,1),(True,0,100,0),(False,1,100,0),(True,1,0,0)):
        s["nativeHero"]=native
        d.update(amount=amount,attack=attack)
        execute(event,[w.env,w.japi],(s,t,s),start_pc=2573,stop_pc=2605)
        assert d["amount"]==expected
    events=[]
    parent=unit("m050",11)
    parent["life"]=100
    parent["state"]["maxLife"]=500
    w.env.update(
        CreateTempAndSetAbilityLv=lambda owner,p,_f,k,rank,life:{"owner":owner,"point":p,"kind":k,"rank":rank,"lifetime":life},
        IssueImmediateOrder=lambda d,cmd:events.append((d,cmd,parent["life"])),
        CreateEffAtLoc=lambda *_:events.append("visual"),
        UNIT_STATE_MAX_LIFE="maxLife",
        SetUnitState=lambda actor,k,value:actor.update({k:value}),
    )
    execute(fn("main/f216"),[w.env])
    execute(fn("main/f291/f16"),[w.env],("N576",parent),start_pc=116,stop_pc=124)
    assert events==[({"owner":11,"point":{"x":0,"y":0},"kind":"T097","rank":1,"lifetime":1},"stomp",100),"visual"]
    assert parent["life"]==500
    return {"skill":"N576","status":"ready","objects":objects,"references":routes,"source":ai.DISASM,
            "web":{"base":"ANef","mana":300,"cooldown":40,"activationLifeBelow":.3,"duration":6,
                   "parent":"m050 preserved and hidden during split","egg":"b138","eggHp":33,"eggPoints":1,
                   "eggDamageGate":"actual source native HERO and attack nonzero and current D positive => 1; else 0",
                   "finish":{"stomp":"T097","radius":1200,"stun":4,"rawDamage":0,"heal":"full after stomp order"},
                   "eggRemovedBeforeFinish":"no successful finish; exhausted native split kills hidden source"},
            "probes":["four actual egg hit gate combinations","original FINISH issues stomp before visual and full heal"]}


if __name__=="__main__":
    result=json.dumps(report(),ensure_ascii=False,indent=2)+"\n"
    if sys.argv[1:]==["--write"]:
        OUT.write_text(result)
    else:
        assert OUT.read_text()==result
    print("N576, four egg-hit cases and one FINISH ordering probe")
