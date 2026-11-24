#!/usr/bin/env python3
"""Audit challenge templates, spawn membership and stock summoned-enemy duplicates."""
from contextlib import closing
from pathlib import Path
import json
import sys

import audit_index as ai

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"docs/rules/challenge-spawns.json"
TABLE=[
    ("蛟龙",[5,5,5],1,.1),("刚背兽",[10,25,40],1,.1),("魅惑魔女",[1,2,3],12,.5),
    ("神灵武士",[10,20,35],1,.1),("鱼人守卫",[10,20,30],1,.1),("兽王",[10,15,25],1,.1),
    ("不朽尸王",[10,20,30],1,.1),("骷髅王",[10,20,30],1,.1),
]
SPAWNS={
    "N548":{"templates":["b112","b113","b114"],"perTemplate":[1,1,1],"points":[1,1,1],"personal":None,"duration":40},
    "N555":{"templates":["b115"],"perTemplate":[1],"points":[5],"personal":None,"duration":40},
    "N578":{"templates":["b141"],"perTemplate":[3],"points":[2],"personal":"parent pool or none","duration":40,"maxLifeFactor":.4},
    "N711":{"templates":["b142","b143"],"points":[5,5],"chances":[.51,.49],"personal":"parent pool or none","duration":30,"maxLifeFactor":.3},
    "N565":{"templates":["mb01"],"points":[1],"personal":None,"maxLifeFactor":.1,"count":"10 + current N564 rank"},
}


def metadata():
    families=[]
    with closing(ai.connect()) as db:
        for j,(name,points,count,interval) in enumerate(TABLE):
            ids=[f"m5{j}{i}" for i in (1,2,3)]
            templates=[]
            for k,p in zip(ids,points):
                point=ai.objects(db,k,"units_unitdata",fields=["points"])[0]
                skills=ai.objects(db,k,"units_unitabilities",fields=["abilList"])[0]
                assert point["fields"]["points"]==p
                assert not any(m["key"] in ("upoi","upor") for r in ai.objects(db,k,"war3map.w3u") for m in r["fields"]["mods"])
                templates.append({"points":point,"abilities":skills})
            families.append({"name":name,"templates":templates,"count":count,"interval":interval,
                             "pointsPerTier":[count*p for p in points]})
        for spec in SPAWNS.values():
            assert all(ai.objects(db,k,"units_unitdata",fields=["points"])[0]["fields"]["points"]==p
                       for k,p in zip(spec["templates"],spec["points"]))
        refs={k:ai.references(db,k) for k in ("CreateDamageTrig","DeadToRemoveUnitAndTrig","GetUnitPointValue","ShopBOSS_show","ShopBOSS_Clear","ShopBOSS_Reward")}
    return {"baseline":"challenge-spawns-v1","status":"ready","source":{"path":ai.DISASM,"references":refs},"families":families,
            "skillEnemySpawns":SPAWNS,"web":{"cooldown":240,"setupDelay":10,"firstWave":11,"closeWave":54,
                    "registry":{"shared":"all registered enemies by live entity id","personal":"only explicit entry 0..3",
                                "idempotent":True,"removeAllOnExit":True},"challengeStageThreeStock":
                    ["i264","i266","i268","i269","i271","i277","i281"],"stageGold":3000,"stageLumber":300}}


def probes():
    path=ROOT/"tools/audit-wisp-link-overcharge-relocate.py"
    vm={"__file__":str(path)}
    exec(compile(path.read_text().split("\nCOUNT=0;VECTORS=[]",1)[0],path,"exec"),vm)
    closure,fn,execute,unit=(vm[k] for k in ("Closure","function","execute","unit"))
    w=vm["World"]()
    e=w.env
    spawned=[]
    destroyed=[]
    flags=[]
    records=[]

    def create_unit(owner,id_,location,_facing):
        u=unit(id_,owner)
        u.update(location or {},serial=len(spawned)+1)
        u["state"].update(maxMana=200,maxLife=1000)
        spawned.append(u)
        return u

    e.update(mon_arr={},mon_next_pos_index={},mon_damage_trig_arr={},CreateTrigger=lambda:{},
             GetUnitUserData=lambda u:u.get("userData",0),SetUnitUserData=lambda u,i:u.update(userData=i),
             TriggerRegisterUnitEvent=lambda h,u,_e:h.update(unit=u),TriggerAddAction=lambda h,f:h.update(action=f),
             EVENT_UNIT_DAMAGED="damaged",anyUnitDamaged=lambda *_:None,DestroyTrigger=destroyed.append,
             AddArrAny=closure("main/f7/f22",[e]),CreateDamageTrig=closure("main/f294/f36",[e]),
             MonKeepMove=lambda u:records.append(("move",u["kind"])),CreateUnitAtLoc=create_unit,
             CreateUnit=lambda owner,id_,x,y,angle:create_unit(owner,id_,{"x":x,"y":y},angle),
             GetRandomInt=lambda lo,_hi:lo,UnitApplyTimedLife=lambda u,_b,t:u.update(ttl=t),
             SetUnitColor=lambda u,p:flags.append((u,p)),Player_Index_Arr={1:1,2:2},
             UNIT_STATE_MAX_LIFE="maxLife",UNIT_STATE_MANA="mana",UNIT_STATE_MAX_MANA="maxMana",
             BOSS_shop="shop",IsUnitHidden=lambda _shop:False,GetRectCenter=lambda r:r,
             pos_arr_monster_path={2:{"x":80,"y":70}},GetGameLvFlag=lambda:2,
             tonumber=int,GetArrRealLen=len,GAME_ENDLESS_TYPE=2,
             IssuePointOrderLoc=lambda *a:records.append(a),RemoveGuardPosition=lambda *_:None,
             RemoveLocation=lambda *_:None,UnitSetUsesAltIcon=lambda unit_,on:unit_.update(icon=on))
    for lane in range(4):
        e[f"Mon_Mode1_{lane}"]={}
    boss=unit("ma05",11)
    boss["userData"]=8050
    execute(fn("main/f196"),[e])
    execute(fn("main/f202"),[e])
    e["N548_Action"](boss)
    e["N555_Action"](boss)
    assert [u["kind"] for u in spawned]==["b112","b113","b114","b115"]
    assert all(u["ttl"]==40 and u["owner"]==11 for u in spawned)
    assert len(e["mon_arr"])==8 and not any(e[f"Mon_Mode1_{lane}"] for lane in range(4))
    assert all(sum(v is u for v in e["mon_arr"].values())==2 for u in spawned)
    assert sum(dict(zip(("b112","b113","b114","b115"),(1,1,1,5)))[t["kind"]] for t in e["mon_arr"].values())==16
    assert [key for key,u in e["mon_arr"].items() if u is spawned[0]]==[1,2]
    assert [key for key,u in e["mon_arr"].items() if u is spawned[-1]]==[7,8]
    cleanup=closure("main/f7/f3",[e])
    cleanup(spawned[0])
    cleanup(spawned[-1])
    assert destroyed[0] is None and destroyed[1]["unit"] is spawned[-1]
    assert sum(u is spawned[0] for u in e["mon_arr"].values())==1
    assert sum(u is spawned[-1] for u in e["mon_arr"].values())==1
    challenge_list={}
    execute(fn("main/f283/f1"),[e,{3:{2:"m52"}},{3:3},{3:3}],({"x":0,"y":20},2,challenge_list))
    c=spawned[-1]
    assert c["kind"]=="m523" and c["userData"]==100502 and c["state"]["maxLife"]==3000 and c["state"]["maxMana"]==600
    assert c["skills"]=={"N703":1} and e["Mon_Mode1_2"][1] is c and challenge_list[1] is c
    assert sum(u is c for u in e["mon_arr"].values())==1
    cleanup(c)
    assert not any(u is c for u in e["mon_arr"].values()) and not any(e["Mon_Mode1_2"].values())
    return ["Original N548 and N555 spawn four unique enemies but count eight raw registry slots (16 raw points, 8 unique)",
            "Original N548 raw index precedes trigger while N555 follows it; one removal leaves each duplicate",
            "Challenge team HP/mana formula, owner entrance, visual marker and all required registries",
            "Single normal challenge death clears shared and personal membership without touching reward group"]


if __name__=="__main__":
    report=metadata()
    report["probes"]=probes()
    payload=json.dumps(report,ensure_ascii=False,indent=2)+"\n"
    if sys.argv[1:]==["--write"]:
        OUT.write_text(payload)
    else:
        assert OUT.read_text()==payload
    print("24 challenge templates; 4 registration probes")
