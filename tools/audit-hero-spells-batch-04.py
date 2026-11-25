#!/usr/bin/env python3
"""Bound source routes, verify workbook rows and exercise new active-skill states."""
from contextlib import closing
from hashlib import sha256
from math import atan2, cos, degrees, hypot, radians, sin
from pathlib import Path
import json
import sys

import audit_index as ai

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/rules/hero-spells-batch-04.json"
ENTRIES = {
    "A173": (122, "channel", 500, "unit", [50,60,70,80,90,100], [12]*6, ["T188","q039"]),
    "A174": (123, "resurrection", 600, "point", [50,70,90,120,150,180], [15,14,13,12,11,10], [f"T{i}" for i in range(190,196)]+["q044","B161"]),
    "A175": (124, "revive", 800, "point", [50,80,110,140,170,200], [25]*6, ["T189","BNin"]+[f"N{i}" for i in (142,143,144,145,146,147,152,153,154,155,156,157,158)]+[f"n{i}" for i in range(261,267)]),
    "A178": (125, "sacrifice", 500, "none", [20,30,40,50,60,70], [15,14,13,12,11,10], ["T185","B159"]),
    "A179": (126, "fanofknives", None, "none", [50,60,70,80,90,100], [20]*6, []),
    "A181": (129, "channel", 450, "none", [35,40,45,50,55,60], [2.5]*6, ["T203","T204","B149"]),
    "A186": (131, "revive", 800, "point", [20,30,40,50,60,70], [11,10,9,8,7,6], ["T205","q041"]),
    "A187": (132, "creepheal", None, "friend", [40,45,50,55,60,65], [9]*6, ["T198","B163"]),
    "A188": (133, "summongrizzly", 500, "none", [75,100,125,150,175,200], [21,20,19,18,17,16], ["T199","BPSE"]),
    "A189": (134, "revive", 700, "point", [90,140,190,240,290,340], [12]*6, ["T207","q064","B218"]),
    "A190": (135, "acolyteharvest", None, "friend", [0]*6, [14,13,12,11,10,9], ["T206","T211","B164","B167"]),
    "A191": (136, "absorb", 700, "point", [100,120,140,160,180,200], [15,14,13,12,11,10], ["q062","q063","T408","T409","B218"]),
}
PENDING = {"A173":"linked-damage", "A174":"upheaval", "A189":"illuminate-and-spirit", "A191":"illuminate-and-spirit"}
WEB = {
    "A173":{"duration":6,"damageFraction":.25,"limit":[3,4,5,6,7,8]},
    "A174":{"duration":5,"slowMax":[.4,.5,.6,.7,.8,.9],"radius":500},
    "A175":{"duration":15,"radius":500,"impactDamage":10,"stun":1,"scepterSummons":2,
            "summons":[f"n{i}" for i in range(261,267)],"fieryFistDamage":[500*i for i in range(1,7)],"fieryFistRadius":300,
            "fieryFistRoll":[1,100,25],"lastTierCurrentLifeRoll":[1,100,10],"lastTierCurrentLifeFactor":.08},
    "A178":{"radius":650,"limit":[4,4,5,5,6,6],"duration":4,"damage":[50,100,150,200,250,300],
            "damageTimes":[0,1,2,3,4],"control":4,"sourceOrdinaryControl":2,"sourceHeroControl":1.8,
            "recast":"replace damage timer per caster; native control separate","damageLevel":"cast for immediate and live for periodic"},
    "A179":{"radius":800,"duration":14,"damage":[200*i for i in range(1,7)],"damageTimes":list(range(15)),
            "recast":"replace per caster","damageLevel":"live","center":"live caster"},
    "A181":{"radius":550,"armorPerStack":[5,10,10,15,15,20],"slowPerStack":.08,"stackCap":[3,3,4,4,5,5],
            "armorState":"per-caster/target count then strongest currently on target (original shared carrier)",
            "armorExpiry":12,"slowDuration":5,"slowDelivery":"native T204 single-target cast"},
    "A186":{"carrier":"q041","carrierLifetime":1,"staffFactor":2,"damage":[300,700,1100,1500,1900,2500],
            "origin":"cast source","speed":1200,"travel":1000,"startRadius":300,"endRadius":500,
            "knockbackInitial":40,"knockbackTick":40,"knockbackPeriod":.05,"knockbackTicks":3,"knockbackKey":"target"},
    "A187":{"duration":7,"attackBonus":[.2,.25,.3,.35,.4,.5],"cleave":[.5,.6,.7,.8,.9,1],"cleaveRadius":520,
            "cleaveSpecialTargetFactor":.2,"cleaveType":"real","rankRule":"reject downgrade, same or greater resets single target timer"},
    "A188":{"radius":500,"staffStrengthFactor":.5,"staffRadiusCap":1400,"offsetEachAxis":[10,50],"damageRadius":300,
            "damage":[300,600,900,1200,1500,1800],"stun":2,"heroStun":1.6,"carrierLifetime":1,"anchor":"nearest living P11, positions read during the loop"},
    "A189":{"duration":[1,2,2,2,2,2],"rate":[1500,2000,3750,4500,5250,6000],"staffFactor":1.9,"blindFactor":1.6},
    "A190":{"manaRestore":[150,200,250,300,350,400],"staffMaxManaFraction":.13,"ordinaryTokenTTL":25,"staffBuffTTL":7,
            "cooldownFactor":.8,"i327Stack":False,"ordinaryEligibility":"next eligible committed ability, pre-existing token at commitment"},
    "A191":{"damage":[3000,5000,7000,9000,11000,13000],"blindFactor":1.6,"staffInt":[4,4,6,6,8,8]},
}


def metadata():
    skills = {}
    tabs = ("units_abilitydata","war3map.w3a","units_abilitybuffdata","units_unitabilities","units_unitbalance","units_unitweapons")
    with closing(ai.connect()) as db:
        for key,(module,order,auto,mode,mana,cd,aux) in ENTRIES.items():
            rows = ai.workbook_rows(db,key,"塔技能")
            half = len(rows)//2
            assert half and [r["cells"] for r in rows[:half]] == [r["cells"] for r in rows[half:]],key
            assert all(r["cells"][6]==6 and r["cells"][7:9]==rows[0]["cells"][7:9] for r in rows),key
            shell = [o for tab in tabs[:2] for o in ai.objects(db,key,tab)]
            base = shell[0]["fields"]
            if base["code"]=="ANcl":
                assert base["DataF1"]==order,key
            mods = {(r["key"],r["level"]):r["value"] for o in shell[1:] for r in o["fields"]["mods"]}
            source_mana = [mods.get(("amcs",i),base.get(f"Cost{min(i,4)}",0)) for i in range(1,7)]
            source_cd = [mods.get(("acdn",i),base.get(f"Cool{min(i,4)}",0)) for i in range(1,7)]
            refs = ai.references(db,key)
            route = next(r for r in refs if r["function"]=="main/f291/f27")
            constants = {c["value"] for row in ai.instructions(db,route["function"],route["pc"],route["pc"]+51) for c in row["constants"].values()}
            assert order in constants and (auto is None or auto in constants),(key, constants)
            casts = {u:ai.objects(db,u,"units_unitweapons",fields=["castpt","castbsw"])[0]["fields"] for u in sorted({r["cells"][1] for r in rows})}
            objects = {k:[o for tab in (tabs[3:] if k[0]=="n" else tabs[:3]) for o in ai.objects(db,k,tab)] for k in aux}
            prefix = f"main/f{module}"
            functions = {f:[lo,hi] for f,lo,hi in db.execute(
                "SELECT name,start_line,end_line FROM function WHERE name=? OR name LIKE ? ORDER BY start_line",(prefix,prefix+"/%"))}
            skills[key] = {"status":PENDING.get(key,"ready"),"rows":rows,"shell":shell,"castTimes":casts,
                "references":refs,"functions":functions,"objects":objects,"sourceMana":source_mana,"sourceCooldown":source_cd,
                "web":dict(WEB[key],order=order,mode=mode,range=base.get("Rng1"),auto=auto,mana=mana,cooldown=cd)}
    assert skills["A175"]["objects"]["T189"][0]["fields"]["DataA1"]==10
    assert skills["A178"]["objects"]["T185"][0]["fields"]["Dur1"]==2
    shock = skills["A186"]["objects"]["T205"][0]["fields"]
    assert (shock["Area1"],shock["DataC1"],shock["DataD1"])==(300,1000,500)
    profile = (ROOT/"reference/map-6.25/units_campaignabilitystrings.txt").read_text()
    assert "Missilespeed=1200" in profile.split("[T205]\n",1)[1].split("\n[",1)[0]
    assert skills["A181"]["objects"]["T204"][0]["fields"]["Dur1"]==5
    assert skills["A190"]["objects"]["T206"][0]["fields"]["Dur1"]==25
    return {"baseline":"hero-spells-batch-04-v1",
        "source":{"path":ai.DISASM,"sha256":sha256((ROOT/ai.DISASM).read_bytes()).hexdigest()},"skills":skills}


def probes():
    path=ROOT/"tools/audit-wisp-link-overcharge-relocate.py"
    vm={"__file__":str(path)}
    exec(compile(path.read_text().split("\nCOUNT=0;VECTORS=[]",1)[0],path,"exec"),vm)
    execute,closure,fn,unit=(vm[k] for k in ("execute","Closure","function","unit"))
    checks = []

    def check(label, passed):
        assert passed, label
        checks.append(label)

    class World(vm["World"]):
        def __init__(self):
            super().__init__()
            self.events = []
            self.group = []
            self.staff = False
            self.env.update(
                AddArrAny=closure("main/f7/f22",[self.env]),_loop_=closure("main/f3/f5",[lambda *_:None]),
                Has_A_Item=lambda _u:self.staff,TxShow=False,GetUnitUserData=lambda u:u["userData"],
                SetUnitUserData=lambda u,i:u.update(userData=i),CreateTempAndSetAbilityLv=self.carrier,
                IssuePointOrderLoc=lambda *a:self.events.append(a),IssueTargetOrder=lambda *a:self.events.append(a),
                CreateGroup=list,GroupEnumUnitsInRange=lambda g,*_:g.extend(self.group),FirstOfGroup=lambda g:g[0] if g else None,
                GroupRemoveUnit=lambda g,_u:g.pop(0),GroupClear=list.clear,DestroyGroup=lambda *_:None,
                IsUnitOwnedByPlayer=lambda u,p:u["owner"]==p,RemoveLocation=lambda *_:None,IsShopBoss=lambda _u:False,
                UnitDamagePoint=lambda *a:self.events.append(("area",*a)),UnitDamageTarget=lambda *a:self.events.append(("hit",*a)),
                ATTACK_TYPE_NORMAL="normal",DAMAGE_TYPE_MAGIC="magic",WEAPON_TYPE_WHOKNOWS="none",
                UNIT_STATE_MAX_MANA="maxMana",UNIT_STATE_MANA="mana",CreateEffByUnit=lambda *_:None,
            )

        def factory(self,module,japi=False):
            execute(fn(f"main/f{module}"),[self.env],(lambda _:self.japi,) if japi else ())

        def carrier(self,owner,point,_facing,key,rank,dur,kind="q001"):
            u = unit(kind,owner,**{key:rank})
            u.update(point or {},lifeLimit=dur)
            return u

    w = World()
    caster = unit("H045",A175=6)
    caster["userData"] = 3
    w.factory(124)
    w.staff = True
    w.env["A175_Action"](caster,{"x":35,"y":68})
    check("A175 staff emits two distinct original T189 rank-six orders at the same point",
          len(w.events)==2 and w.events[0][0] is not w.events[1][0] and all(
          u["skills"]=={"T189":6} and u["lifeLimit"]==2 and u["userData"]==3 and command=="dreadlordinferno" and point=={"x":35,"y":68}
          for u,command,point in w.events))

    w = World()
    caster,target = unit("H046",A178=1),unit("monster",11)
    w.env["Tower_ALL"][4] = caster
    w.group = [target]
    w.factory(125)
    w.env["A178_Action"](caster)
    caster["skills"]["A178"] = 3
    w.advance(1)
    check("A178 immediate and first timer damage use different level-read times",
          [e[3] for e in w.events if e[0]=="hit"]==[100,300])
    w.env["A178_Action"](caster)
    w.advance(5)
    check("A178 source replaces old periodic sequence and ordinary-target FX shortens remaining ticks to two",
          [e[3] for e in w.events if e[0]=="hit"]==[100]+[300]*4)

    w = World()
    caster = unit("H046",A179=1)
    w.env["Tower_ALL"][4] = caster
    w.factory(126)
    w.env["A179_Action"](caster)
    caster.update(x=40,y=-15)
    caster["skills"]["A179"] = 6
    w.advance(15)
    check("A179 starts synchronously, follows live hero/rank, and emits its final pulse at second 14",
          len(w.events)==15 and w.events[0][4:7]==(0,0,200) and all(event[4:7]==(40,-15,1200) for event in w.events[1:]))

    w = World()
    caster,target = unit("H047",A181=1),unit("monster",11)
    caster["userData"] = 4
    w.group = [target]
    w.factory(129)
    for time in (0,2.5,5,7.5):
        w.advance(time)
        w.env["A181_Action"](caster)
    check("A181 repeated hits cap slow tier and retain matching armor carrier",
          [event[0]["skills"]["T204"] for event in w.events]==[1,2,3,3] and target["skills"]["T203"]==3)
    w.advance(19.5)
    check("A181 source armor cleanup occurs twelve seconds after the most recent application",
          "T203" not in target["skills"])

    w = World()
    caster,target = unit("H048"),unit("monster",11)
    target["x"] = 100
    w.env["math"]["rad"] = radians
    w.env.update(
        AngleBetweenPoints=lambda a,b:degrees(atan2(b["y"]-a["y"],b["x"]-a["x"])),
        DistanceBetweenPoints=lambda a,b:hypot(b["y"]-a["y"],b["x"]-a["x"]),
        Cos=cos,Sin=sin,Location=lambda x,y:{"x":x,"y":y})
    w.factory(131)
    w.env["A186_Damage"](caster,target)
    check("A186 immediate push away from the resolved caster is 40",target["x"]==140)
    w.advance(.1)
    check("A186 periodic moves add 40 each",target["x"]==220)
    w.env["A186_End_A188"](target)
    w.advance(.2)
    check("A188's cancellation API stops the remaining A186 movement",target["x"]==220)

    w = World()
    caster,target = unit("H048",A187=6),unit("ally")
    caster["userData"] = 5
    w.factory(132,True)
    w.env["A187_Action"](caster,target)
    w.advance(2)
    caster["skills"]["A187"] = 1
    w.env["A187_Action"](caster,target)
    w.advance(6)
    check("A187 successful equal/higher refresh differs from a lower rank, which only updates autocast target",
          target["skills"]["T198"]==6 and w.env["A187_tarDefunit"][5] is target)
    w.advance(7)
    check("A187 lower rank leaves original expiry", "T198" not in target["skills"])

    w = World()
    caster,target = unit("H049",A190=6),unit("ally")
    caster["userData"] = 5
    target["state"].update(mana=0,maxMana=1000)
    w.factory(135)
    w.staff = True
    w.env["A190_Action"](caster,target)
    check("A190 staff restores rank six plus 13% of target max mana before T211",
          target["state"]["mana"]==530 and w.events[-1][0]["skills"]=={"T211":1})
    w.staff = False
    target["state"]["mana"] = 950
    w.env["A190_Action"](caster,target)
    check("A190 ordinary restoration caps at target maximum before T206",
          target["state"]["mana"]==1000 and w.events[-1][0]["skills"]=={"T206":1})
    caster["skills"]["B164"] = 1
    end = fn("main/f291/f17")
    w.japi["EXGetAbilityState"] = lambda _h,_s:10
    execute(end,[w.env,None,w.japi],("A190",caster),start_pc=49,stop_pc=148)
    check("A190 original ENDCAST reaches .8 without removing existing ordinary buff",
          caster["skills"]["B164"]==1 and caster["cd"]["A190"]==8)
    return checks


def main():
    report=metadata()
    report["probes"]=probes()
    payload=json.dumps(report,ensure_ascii=False,indent=2)+"\n"
    if sys.argv[1:]==["--write"]:
        OUT.write_text(payload)
    else:
        assert OUT.read_text()==payload
    print(f"12 skills, 8 ready, 4 follow-up, {len(report['probes'])} probes, {sum(len(s['rows'])*10 for s in report['skills'].values())} workbook cells")


if __name__ == "__main__":
    main()
