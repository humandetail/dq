#!/usr/bin/env python3
"""Audit seven resolved active skills and preserve three follow-up entrances."""
from contextlib import closing
from hashlib import sha256
from math import atan2, cos, degrees, radians, sin
from pathlib import Path
import json
import sys

import audit_index as ai

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/rules/hero-spells-batch-03.json"
ENTRIES = {
    "A016": (21,"ANcl","wispharvest",900,.3,[50,70,90,130,180,240],[24,22,20,18,16,14],["T004","T005","T006","T063"]),
    "A042": (39,"ANcl","deathpact",1000,.3,[0]*6,[120]*6,[]),
    "A063": (56,"Aroa","roar",None,.3,[50,60,70,80,100,120],[18]*6,["A118","B046","B129"]),
    "A075": (None,"ANcl","evileye",600,.53,[20,50,80,110,140,170],[0]*6,["I233"]),
    "A110": (None,"AEme","metamorphosis",None,.4,[20,30,40,50,60,70],[40,37,34,31,28,25],["B102"]),
    "A165": (116,"AEfk","fanofknives",None,.75,[140,160,180,200,220,240],[16]*6,["T175"]),
    "A169": (None,"AEme","metamorphosis",None,.4,[20,30,40,50,60,70],[40,37,34,31,28,25],["B154"]),
    "A170": (119,"ANcl","curse",900,.3,[10,30,50,70,90,110],[10]*6,["T180","T181","T184"]),
    "A171": (120,"ANcl","absorb",900,.3,[30,50,70,90,110,130],[13,12,11,10,9,8],["T183"]),
    "A172": (121,"ANcl","revive",900,.3,[40,80,120,160,200,240],[12]*6,["T182"]),
}
STATUS = {k: {"A016":"pendingBlizzard","A110":"pendingNativeMetamorphosis","A169":"pendingNativeMetamorphosis"}.get(k,"ready") for k in ENTRIES}
WEB = {
    "A016": {"radius":800,"channel":7,"damage":[122,273,332,501,686,880],"movementSlow":.4},
    "A042": {"range":1000,"fraction":[.08,.09,.10,.11,.12,.13],"max":4000,"duration":120,"target":"enemyNonBossAndNativeNonHero","state":19},
    "A063": {"baseAttackBonus":[1.8,2.6,3.4,4,4.2,5],"nonBossEventFactor":2.5,"sourceFactor":1.5,"duration":12,"buffs":["B046","B129"]},
    "A075": {"channel":[4.5,4,3.5,3,2.5,2],"trigger":"FINISH","clear":["A073","A074","I233"],"hoodOnce":True},
    "A110": {"duration":20,"movementWindow":"common morph","variants":[f"E{i:03}" for i in range(10,16)]},
    "A165": {"duration":10,"radius":500,"firstDelay":0,"lastDelay":10,"strengthFactor":[3,5,7,9,11,13],"period":1,"recast":"replace"},
    "A169": {"duration":18,"variants":[f"E{i:03}" for i in range(17,23)],"baseAttackAdd":[500,600,700,800,900,1000]},
    "A170": {"range":800,"waves":["T180","T181"],"firstDamage":[600,900,1200,1500,1800,2200],"slowWaveRawDamage":100,
             "delaySecond":.3,"missileSpeed":1050,"travel":700,"startRadius":200,"endRadius":400,"sourceLifetime":1.5,
             "secondaryReplacePending":True,"secondaryDamage":0,"slowDuration":5,"slowRate":[.25,.3,.35,.4,.45,.5]},
    "A171": {"range":1500,"centers":[220*i for i in range(1,8)],"radius":200,"period":.5,"scanCount":6,
             "recast":"replace","targetVisit":"atMostOneOrderPerCast","stun":2.5,"missileSpeed":3000,
             "damage":[1000,1100,1200,1300,1400,1500]},
    "A172": {"range":1200,"centers":[300*i for i in range(1,6)],"radius":150,"waveDelay":.5,
             "waveCount":10,"carrierLifetime":7,"maxWaveDamage":999999,"damage":[500,900,1300,1700,2100,2500]},
}


def metadata():
    skills={}
    with closing(ai.connect()) as db:
        for raw,(module,code,order,auto,cast,mana,cooldown,auxiliary) in ENTRIES.items():
            rows=ai.workbook_rows(db,raw,"塔技能")
            half=len(rows)//2
            assert half and [r["cells"] for r in rows[:half]]==[r["cells"] for r in rows[half:]]
            assert all(r["cells"][6]==6 and r["cells"][7:]==rows[0]["cells"][7:] for r in rows)
            shell=[r for t in ("units_abilitydata","war3map.w3a") for r in ai.objects(db,raw,t)]
            base=shell[0]["fields"]
            assert base["code"]==code and (code!="ANcl" or base["DataF1"]==order)
            mods={(r["key"],r["level"]):r["value"] for o in shell[1:] for r in o["fields"]["mods"]}
            for step in range(1,7):
                assert mods.get(("amcs",step),base.get(f"Cost{min(step,4)}",0))==mana[step-1],raw
                if raw!="A016":
                    assert mods.get(("acdn",step),base.get(f"Cool{min(step,4)}",0))==cooldown[step-1],raw
            refs=ai.references(db,raw)
            route=next(r for r in refs if r["function"]=="main/f291/f27")
            values={c["value"] for row in ai.instructions(db,route["function"],route["pc"],route["pc"]+60) for c in row["constants"].values()}
            assert order in values and (auto is None or auto in values),(raw,values)
            units={u:ai.objects(db,u,"units_unitweapons",fields=["castpt","castbsw"]) for u in sorted({r["cells"][1] for r in rows})}
            cast_variants = {"A165":{"G061":.3},"A169":{f"E{i:03}":.3 for i in range(17,23)}}.get(raw,{})
            assert all(u[0]["fields"]["castpt"]==cast_variants.get(id_,cast) for id_,u in units.items()),raw
            objects={k:[r for t in ("units_abilitydata","war3map.w3a","units_abilitybuffdata") for r in ai.objects(db,k,t)] for k in auxiliary}
            functions={}
            if module is not None:
                prefix=f"main/f{module}"
                functions=dict((f,[lo,hi]) for f,lo,hi in db.execute(
                    "SELECT name,start_line,end_line FROM function WHERE name=? OR name LIKE ? ORDER BY start_line",(prefix,prefix+"/%")))
            skills[raw]={"status":STATUS[raw],"rows":rows,"shell":shell,"objects":objects,"unitCast":units,"references":refs,
                         "functions":functions,"web":dict(WEB[raw],mana=mana,cooldown=cooldown,auto=auto,order=order,cast=cast)}
    assert "额外150%" in skills["A063"]["rows"][0]["cells"][7]
    assert skills["A172"]["objects"]["T182"][0]["fields"]["DataA1"]==10
    return {"baseline":"hero-spells-batch-03-v1","source":{"path":ai.DISASM,"sha256":sha256((ROOT/ai.DISASM).read_bytes()).hexdigest()},"skills":skills}


def probes():
    path=ROOT/"tools/audit-wisp-link-overcharge-relocate.py"
    vm={"__file__":str(path)}
    exec(compile(path.read_text().split("\nCOUNT=0;VECTORS=[]",1)[0],path,"exec"),vm)
    execute,closure,fn,unit=(vm[k] for k in ("execute","Closure","function","unit"))
    checks=[]

    def check(label,passed):
        assert passed,label
        checks.append(label)

    class World(vm["World"]):
        def __init__(self):
            super().__init__()
            self.events=[]
            self.group=[]
            self.env["math"]["rad"]=radians
            self.env.update(
                Cos=cos,Sin=sin,Location=lambda x,y:{"x":x,"y":y},
                AngleBetweenPoints=lambda a,b:degrees(atan2(b["y"]-a["y"],b["x"]-a["x"])),
                AddArrAny=closure("main/f7/f22",[self.env]),_loop_=closure("main/f3/f5",[lambda *_:None]),
                UNIT_STATE_MAX_LIFE="maxLife",TxShow=False,RemoveLocation=lambda *_:None,
                SetUnitUserData=lambda u,i:u.update(userData=i),GetUnitUserData=lambda u:u["userData"],
                CreateTempAndSetAbilityLv=self.carrier,
                IssuePointOrderLoc=lambda *a:self.events.append(a),IssueTargetOrder=lambda *a:self.events.append(a),
                CreateGroup=list,GroupEnumUnitsInRange=lambda g,*_:g.extend(self.group),
                FirstOfGroup=lambda g:g[0] if g else None,GroupRemoveUnit=lambda g,u:g.pop(0) if g else None,
                GroupClear=list.clear,DestroyGroup=lambda *_:None,IsUnitOwnedByPlayer=lambda u,p:bool(u and u["owner"]==p),
                UnitDamagePoint=lambda *a:self.events.append(a),UnitKillUnit=lambda *a:self.events.append(("kill",*a)),
                ATTACK_TYPE_NORMAL="normal",DAMAGE_TYPE_MAGIC="magic",WEAPON_TYPE_WHOKNOWS="none",
                CreateEffAtLoc=lambda *_:None,CreateEffByUnit=lambda *_:None,
            )

        def factory(self,module,japi=False):
            execute(fn(f"main/f{module}"),[self.env],(lambda _:self.japi,) if japi else ())

        def carrier(self,owner,point,facing,key,rank,dur,kind="q001"):
            u=unit(kind,owner,**{key:rank})
            u.update(point,lifeLimit=dur)
            return u

    w=World()
    caster,target=unit("H012",A042=1),unit("minion",11)
    caster["state"][19]=100
    target["state"]["maxLife"]=60_000
    w.current,w.env["Tower_ALL"][3]=caster,caster
    w.factory(39)
    w.env["A042_Action"](target)
    check("A042 caps captured max-life fraction and orders shared q025 before writing S19",
          w.events==[("kill",caster,target)] and caster["state"][19]==4100)
    w.advance(119)
    caster["state"][19]+=5
    w.advance(120)
    check("A042 120-second expiry subtracts captured amount from current S19",caster["state"][19]==105)

    w=World()
    source,victim=unit("H019",B046=1),unit("ordinary",11)
    value={"damage":100}
    w.env["UnitIsHero"]=lambda t:t["kind"]=="boss"
    w.japi.update(GetEventDamage=lambda _:value["damage"],EXSetEventDamage=lambda d:value.update(damage=d))
    f=fn("main/f291/f1")
    execute(f,[w.env,w.japi],(source,victim,source),start_pc=2074,stop_pc=2103)
    check("A063 source B046 branch multiplies nonboss event by 1.5",value["damage"]==150)
    constants=dict(f["constants"])
    constants["k196"]=dict(constants["k196"],value=2.5)
    value["damage"]=100
    execute(dict(f,constants=constants),[w.env,w.japi],(source,victim,source),start_pc=2074,stop_pc=2103)
    check("A063 graph multiplier 2.5 stays at original route and does not lift map boss",value["damage"]==250)
    victim["kind"]="boss"
    execute(dict(f,constants=constants),[w.env,w.japi],(source,victim,source),start_pc=2074,stop_pc=2103)
    assert value["damage"]==250

    w=World()
    hero=unit("H023",A073=1,A074=1,A075=1,I233=1)
    hero["cd"].update(A073=10,A074=9,I233=12,I012=7)
    hero["items"].update({"i318","i319"})
    w.current,w.spell=hero,"A075"
    w.env["i318_AddSign"]=lambda u:w.events.append("hood")
    execute(fn("main/f291/f15"),[w.env])
    check("A075 interrupted channel ENDCAST keeps all cooldowns and does not advance hood",
        hero["cd"]=={"A073":10,"A074":9,"I233":12,"I012":7} and not w.events)
    execute(fn("main/f291/f16"),[w.env,lambda:w.events.append("finishCommon"),w.japi],stop_pc=115)
    check("A075 natural finish resets only A073/A074/I233 and advances hood once after common FINISH",
          hero["cd"]=={"A073":0,"A074":0,"I233":0,"I012":7} and w.events==["finishCommon","hood"])

    w=World()
    hero=unit("H042",A165=1)
    w.env["Tower_ALL"][4]=hero
    w.factory(116)
    w.env["A165_Action"](hero)
    w.advance(.5)
    hero["str"],hero["x"],hero["skills"]["A165"]=200,25,2
    w.advance(1)
    check("A165 immediate then each second samples current STR/rank/position",[(a[3],a[5]) for a in w.events]==[(0,300),(25,1000)])
    old=w.env["A165_Action"].ups[1][4]
    w.env["A165_Action"](hero)
    w.advance(11)
    check("A165 explicit recast replaces old and last of ten intervals completes before removing T175",
          not old["alive"] and len(w.events)==13 and "T175" not in hero["skills"])

    w=World()
    hero=unit("H044",A170=2)
    hero["userData"]=7
    w.env["Tower_ALL"][7],w.current=hero,hero
    w.factory(119,True)
    w.env["A170_Action"]({"x":500,"y":0})
    w.advance(.2)
    w.env["A170_Action"]({"x":600,"y":0})
    hero["x"]=80
    w.advance(.3)
    check("A170 early recast cancels only pending frost; both initial fire waves already ordered",len(w.events)==2)
    w.advance(.5)
    check("A170 new .3-second frost samples actual captured source position and uses captured cast point",
          w.events[-1][0]["kind"]=="q038" and w.events[-1][0]["x"]==80 and w.events[-1][2]["x"]==600)

    w=World()
    hero,target=unit("H044",A171=6),unit("mob",11)
    hero["userData"]=4
    w.env["Tower_ALL"][4]=hero
    w.group.append(target)
    w.factory(120)
    w.env["A171_Action"](hero,{"x":500,"y":0})
    w.advance(.5)
    check("A171 source issues one rank-one stun/damage carrier even in seven overlapping queries",
          len(w.events)==1 and w.events[0][0]["skills"]=={"T183":1})
    w.advance(3)
    check("A171 polling retains visited state, so later cycles do not hit recorded target",len(w.events)==1)
    return checks


def main():
    report=metadata()
    report["probes"]=probes()
    payload=json.dumps(report,ensure_ascii=False,indent=2)+"\n"
    if sys.argv[1:]==["--write"]:
        OUT.write_text(payload)
    else:
        assert OUT.read_text()==payload
    rows=sum(len(v["rows"])*10 for v in report["skills"].values())
    print(f"{list(STATUS.values()).count('ready')}/10 ready, {len(report['probes'])} probes, {rows} workbook cells")


if __name__=="__main__":
    main()
