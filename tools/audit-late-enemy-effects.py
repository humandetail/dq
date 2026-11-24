#!/usr/bin/env python3
"""Verify middle and late enemy-batch object data and distinct state boundaries."""
from contextlib import closing
from math import acos, cos, pi, sin, sqrt
from pathlib import Path
import json
import sys

import audit_index as ai

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"docs/rules/late-enemy-effects.json"
IDS=[f"N{i}" for i in (525,526,527,528,530,531,532,533,571,573,574,575,576,579,581)]
WEB={
    "N525":{"angleRanges":[[130,230],[60,300]],"strict":True,"damageFactors":[.4,.7,.9],"temporarySource":"Tower_ALL slot; missing short circuits"},
    "N526":{"window":20,"packets":50,"mana":500,"cooldown":30,"firstAttempt":"cast only"},
    "N527":{"invisibilityDelay":.5,"duration":3,"moveBonus":2,"backstab":0,"mana":400,"cooldown":4},
    "N528":{"radius":1500,"ordinaryStun":2,"heroStun":1.5,"mana":400,"cooldown":4,"damage":0},
    "N530":{"hpThreshold":.3,"heal":9000000,"mana":400,"cooldown":20,"selfOnly":True},
    "N531":{"from":"m048","to":"e008","hpThreshold":.7,"transition":.1,"duration":20,"hpBonus":2500,"mana":1000,"cooldown":80},
    "N532":{"from":"m049","to":"e009","hpThreshold":.7,"transition":.35,"altitude":1,"landing":1,"duration":20,"hpBonus":200,"mana":1000,"cooldown":80},
    "N533":{"chance":.4,"sourceRoll":[1,100,39],"excluded":"q025"},
    "N571":{"hpThreshold":.7,"moveBonus":.4,"nativeEvade":"N572","duration":6,"mana":100,"cooldown":30},
    "N573":{"sourceDeathType":"m052","sourceRoll":[1,10,4],"radius":300,"mark":"B094","duration":8,"outgoingFactor":.5},
    "N574":{"threshold":20000,"strict":True,"negativeBuffsOnly":True},
    "N575":{"window":15,"amount":120000,"mana":500,"cooldown":40,"firstAttempt":"cast only"},
    "N576":{"replacement":"b138","duration":6,"finishCarrier":"T097"},
    "N579":{"maxHpThreshold":.3,"strict":True,"unpause":True,"negativeBuffsOnly":True},
    "N581":{"hpThreshold":.5,"radius":1200,"ordinaryStun":3,"heroStun":3,"mana":100,"cooldown":12,"damage":0},
}


def metadata():
    modules={"N525":188,"N526":189,"N571":212,"N573":213,"N574":214,"N575":215,"N576":216,"N579":218}
    aux={"N531":["m048","e008","BEme"],"N532":["m049","e009","BEme"],
         "N573":["B094","T096"],"N576":["b138","T097"],"N526":["B028"],"N575":["B095"],"N571":["B093","N572"]}
    with closing(ai.connect()) as db:
        data={}
        for key in IDS:
            keys=[key]+aux.get(key,[])
            objects={k:[o for t in ("units_abilitydata","war3map.w3a","units_abilitybuffdata","units_unitabilities",
                                   "units_unitbalance","units_unitweapons","units_unitdata") for o in ai.objects(db,k,t)] for k in keys}
            prefix=f"main/f{modules[key]}" if key in modules else ""
            fns={f:[lo,hi] for f,lo,hi in db.execute("select name,start_line,end_line from function where name=? or name glob ?",
                (prefix,prefix+"/*"))} if prefix else {}
            data[key]={"status":"pending-native-split" if key=="N576" else "ready","objects":objects,"functions":fns,
                       "references":ai.references(db,key),"web":WEB[key]}
    kw=data["N527"]["objects"]["N527"][0]["fields"]
    assert (kw["DataA1"],kw["DataB1"],kw["Dur1"])==(.5,2,3)
    for k,alternate in (("N531","e008"),("N532","e009")):
        f=data[k]["objects"][k][0]["fields"]
        assert f["UnitID1"]==alternate and f["HeroDur1"]==20
    return {"baseline":"late-enemy-effects-v1","source":ai.DISASM,"abilities":data}


def probes():
    path=ROOT/"tools/audit-wisp-link-overcharge-relocate.py"
    vm={"__file__":str(path)}
    exec(compile(path.read_text().split("\nCOUNT=0;VECTORS=[]",1)[0],path,"exec"),vm)
    closure,fn,execute,unit=(vm[k] for k in ("Closure","function","execute","unit"))
    w=vm["World"]()
    e=w.env
    caster=unit("monster",11)
    source=unit("tower",0)
    w.current=caster
    caster["life"]=50000
    caster["state"]["maxLife"]=100000
    packet={"damage":100}
    events=[]
    e.update(GetEventDamageSource=lambda:source,GetUnitFacing=lambda u:u.get("facing",0),
             AddArrAny=closure("main/f7/f22",[e]),CreateEffByUnit=lambda *_:None,DestroyEffect=lambda *_:None,
             UNIT_STATE_MAX_LIFE="maxLife",UnitRemoveBuffs=lambda *a:events.append(a),
             PauseUnit=lambda u,p:events.append(("pause",u,p)))
    e["math"].update(sqrt=sqrt,pi=pi,acos=acos,abs=abs)
    w.japi.update(GetEventDamage=lambda _:packet["damage"],EXSetEventDamage=lambda d:packet.update(damage=d))
    for n in (188,189,214,215,218):
        execute(fn(f"main/f{n}"),[e],(lambda _:w.japi,))
    for rad,result in ((.2,90),(1.4,70),(pi,40),(4.7,70),(6.1,90)):
        source.update(x=cos(rad),y=sin(rad))
        packet["damage"]=100
        e["N525_Action"]()
        assert packet["damage"]==result
    e["N526_Action1"]()
    for _ in range(50):
        packet["damage"]=100
        e["N526_Action2"]()
        assert packet["damage"]==0
    packet["damage"]=100
    e["N526_Action2"]()
    assert packet["damage"]==100 and not any(e["N526_Unit"].values())
    e["N575_Action1"]()
    for amount,expected in ((100000,0),(25000,5000)):
        packet["damage"]=amount
        e["N575_Action2"]()
        assert packet["damage"]==expected
    assert not any(e["N575_Unit"].values())
    e["N575_Action1"]()
    w.advance(15)
    assert not any(e["N575_Unit"].values())
    packet["damage"]=20000
    e["N574_Action"](caster)
    assert not events
    packet["damage"]=1
    e["N574_Action"](caster)
    assert events==[(caster,False,True)]
    events.clear()
    packet["damage"]=30000
    e["N579_Action"](caster)
    assert not events
    packet["damage"]=1
    e["N579_Action"](caster)
    assert events==[("pause",caster,False),(caster,False,True)]
    return ["N525 directional sectors at native facing",
            "N526 zeroes exactly 50 routed damage packets; fifty-first passes",
            "N575 capacity arithmetic and expiry",
            "N574 strict flat threshold and negative-only removal",
            "N579 strict dynamic threshold and explicit unpause before removing negative buffs"]


if __name__=="__main__":
    report=metadata()
    report["probes"]=probes()
    payload=json.dumps(report,ensure_ascii=False,indent=2)+"\n"
    if sys.argv[1:]==["--write"]:
        OUT.write_text(payload)
    else:
        assert OUT.read_text()==payload
    print(f'{len(IDS)} effects, 14 ready, {len(report["probes"])} boundary probes')
