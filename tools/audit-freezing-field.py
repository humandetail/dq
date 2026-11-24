#!/usr/bin/env python3
"""Audit A016's three carrier paths, cancellation, and scepter chance."""
from contextlib import closing
from hashlib import sha256
from pathlib import Path
import json
import sys

import audit_index as ai

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"docs/rules/freezing-field.json"


def metadata():
    with closing(ai.connect()) as db:
        rows=ai.workbook_rows(db,"A016","塔技能")
        seal_rows=ai.workbook_rows(db,"A017","塔技能")
        objects={k:[r for tab in ("units_abilitydata","war3map.w3a","units_unitabilities","units_abilitybuffdata")
                    for r in ai.objects(db,k,tab)] for k in ("A016","T004","T005","T006","T063","q015","B001","Bfrz")}
        refs={k:ai.references(db,k) for k in ("A016","T004","T005","T006","T063","A016_units")}
        functions={f:[lo,hi] for f,lo,hi in db.execute(
            "SELECT name,start_line,end_line FROM function WHERE name='main/f21' OR name LIKE 'main/f21/%' ORDER BY start_line")}
    assert len(rows)==4 and [r["cells"] for r in rows[:2]]==[r["cells"] for r in rows[2:]]
    h,i,_=rows[0]["cells"][7:]
    assert all(t in h for t in ("随机的冰爆","800","40%","7秒"))
    assert all(f"{d}点" in i for d in (122,273,332,501,686,880))
    fields={k:ls[0]["fields"] for k,ls in objects.items()}
    assert (fields["T004"]["DataA1"],fields["T004"]["DataC1"],fields["T005"]["DataC1"],fields["T006"]["DataA1"])==(8,5,4,-.4)
    assert "DataB1" not in fields["T005"] and (fields["T063"]["DataA1"],fields["T063"]["Dur1"],fields["T063"]["HeroDur1"])==(1500,1.4,.8)
    text=(ROOT/"reference/map-6.25/units_campaignabilitystrings.txt").read_text()
    tip=text.split("[A016]\n",1)[1].split("\n[A017]",1)[0].split("\nUbertip=",1)[1]
    assert tip.count("35%概率对极寒领域内的单位施放双倍伤害的单体冰封禁制")==6
    seal = [212,356,402,654,809,985]
    for row in seal_rows:
        assert all(str(value)+"点伤害" in row["cells"][8] for value in seal)
    return {"baseline":"freezing-field-v1","status":"ready","objects":objects,"rows":rows,
            "source":{"path":ai.DISASM,"sha256":sha256((ROOT/ai.DISASM).read_bytes()).hexdigest(),"references":refs,"functions":functions},
            "web":{"channel":7,"radius":800,"period":1,"damage":[122,273,332,501,686,880],
                   "cooldown":[24,22,20,18,16,14],"mana":[50,70,90,130,180,240],"movementSlow":.4,
                   "scepterChance":35,"sourceScepterDamage":1500,"scepterStun":[1.4,.8],
                   "auraAfterInterrupt":True,"waveOwner":"castId","damagePerWave":"allEligibleWithin800","visualShards":[5,5,6,6,7,7],"scepterTier":"A016 cast snapshot","scepterDamage":[2*value for value in seal],"requiresA017":False}}


def probes(rule):
    path=ROOT/"tools/audit-wisp-link-overcharge-relocate.py"
    vm={"__file__":str(path)}
    exec(compile(path.read_text().split("\nCOUNT=0;VECTORS=[]",1)[0],path,"exec"),vm)
    execute,closure,fn,unit=(vm[k] for k in ("execute","Closure","function","unit"))
    checks=[]
    def check(label,passed):
        assert passed,label
        checks.append(label)

    w=vm["World"]()
    caster1,caster2,target=unit("H004",A016=2),unit("G039",A016=3),unit("monster",11)
    w.env["Tower_ALL"].update({3:caster1,4:caster2})
    born,orders=[],[]
    def create(owner,p,facing,aid,rank,dur,kind="q001"):
        carrier=unit(kind,owner,**{aid:rank})
        carrier.update(p,duration=dur)
        born.append(carrier)
        return carrier
    w.env.update(AddArrUnit=closure("main/f7/f21",[w.env]),CreateTempAndSetAbilityLv=create,RemoveLocation=lambda *_:None,
                 SetUnitUserData=lambda u,i:u.update(userData=i),GetUnitUserData=lambda u:u["userData"],
                 IssuePointOrderLoc=lambda u,o,p:orders.append((u,o,p)),
                 IssueImmediateOrder=lambda u,o:orders.append((u,o,None)),
                 IssueTargetOrder=lambda u,o,t:orders.append((u,o,t)))
    execute(fn("main/f21"),[w.env])
    w.current=caster1
    w.env["A016_Action"]()
    check("A016 source creates damaging and visual blizzard plus separate passive slow carrier",
          [(u["kind"],u["skills"],u["duration"],u["userData"]) for u in born]==[
              ("q015",{"T004":2},8,3),("q001",{"T005":2},8,3),("q001",{"T006":2},8,3)]
          and [o for _,o,_ in orders]==["blizzard","blizzard"])
    w.current=caster2
    w.env["A016_Action"]()
    w.current=caster1
    w.env["A016_End"]()
    check("A016 raw ENDCAST stops and unlinks only matching slot, leaves independent native aura lifespan",
          [u for u,o,_ in orders if o=="stop"]==born[:3] and sorted(w.env["A016_units"])==[4,5,6]
          and born[2]["duration"]==8 and not born[2].get("deleted"))
    w.current=caster2
    w.env["A016_End"]()
    check("A016 sparse prefix is unsafe for raw length traversal, bounded Lua VM can leave later units",
          sorted(w.env["A016_units"])==[4,5,6])

    caster1["items"].add("i310")
    rolls=iter((36,35))
    w.env["GetRandomInt"]=lambda lo,hi:next(rolls)
    route=fn("main/f291/f1")
    execute(route,[w.env,w.japi],(born[0],target,caster1),start_pc=1088,stop_pc=1104)
    check("A016 roll 36 rejects from real T004-hit B03 route",len(born)==6)
    execute(route,[w.env,w.japi],(born[0],target,caster1),start_pc=1088,stop_pc=1104)
    check("A016 roll 35 accepts one T063 within same damage branch",
          born[-1]["skills"]=={"T063":1} and born[-1]["userData"]==3 and orders[-1]==(born[-1],"thunderbolt",target))
    check("Q74 A016 cast tier 1/6, independent of learned A017",
          (rule["scepterDamage"][0],rule["scepterDamage"][-1],rule["requiresA017"])==(424,1970,False))
    return checks


def main():
    report=metadata()
    report["probes"]=probes(report["web"])
    payload=json.dumps(report,ensure_ascii=False,indent=2)+"\n"
    if sys.argv[1:]==["--write"]:
        OUT.write_text(payload)
    else:
        assert OUT.read_text()==payload
    print(f"A016, {len(report['probes'])} boundary probes, 40 workbook cells")


if __name__=="__main__":
    main()
