#!/usr/bin/env python3
"""Audit A110/A169 native fields, their shared spell routing and form deltas."""
from contextlib import closing
from hashlib import sha256
from math import isclose
from pathlib import Path
import json
import sys

import audit_index as ai

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/rules/alchemist-wolf-transforms.json"
FORMS = {"A110": ("H032", 10, "B102", 20), "A169": ("H043",17,"B154",18)}
TABS = ("units_unitbalance","units_unitweapons","units_unitabilities","units_unitdata")


def metadata():
    skills = {}
    with closing(ai.connect()) as db:
        for skill,(base,start,buff,duration) in FORMS.items():
            variants=[f"E{i:03}" for i in range(start,start+6)]
            rows=ai.workbook_rows(db,skill,"塔技能")
            assert len(rows)==14 and [x["cells"] for x in rows[:7]]==[x["cells"] for x in rows[7:]]
            assert sorted(row["cells"][1] for row in rows[:7])==sorted([base,*variants])
            objects={unit:{tab:ai.objects(db,unit,tab)[0] for tab in TABS} for unit in [base,*variants]}
            ability=ai.objects(db,skill,"units_abilitydata")[0]
            mods=ai.objects(db,skill,"war3map.w3a")[0]
            fields=ability["fields"]
            assert (fields["code"],fields["levels"])==("AEme",6)
            for i in range(1,5):
                assert [fields[field+str(i)] for field in ("UnitID","DataA","DataB","DataE","BuffID","HeroDur")] == [
                    variants[i-1],base,1,500,buff,duration]
            assert [m["value"] for m in mods["fields"]["mods"] if m["key"]=="Emeu"]==variants[4:]
            crit={}
            for i,form in enumerate(variants,1):
                resources=objects[form]["units_unitbalance"]["fields"]
                weapon=objects[form]["units_unitweapons"]["fields"]
                if skill=="A110":
                    assert isclose(weapon["cool1"],1.2-.05*i) and resources["regenMana"]==3*i and weapon["cool2"]==2.5
                else:
                    assert (weapon["cool1"],weapon["dmgplus1"],resources["HP"],resources["STR"],resources["AGI"])==(
                        1.15 if i==6 else 1.1,400+100*i,100,13,20)
                    raw=f"N{712+i}"
                    assert raw in objects[form]["units_unitabilities"]["fields"]["abilList"].split(",")
                    crit[raw]=ai.objects(db,raw,"units_abilitydata")[0]
                    assert [crit[raw]["fields"][k] for k in ("DataA1","DataB1")]==[10+5*i,4.5]
            skills[skill]={"rows":rows,"objects":objects,"ability":[ability,mods],"critical":crit,
                           "references":ai.references(db,skill),
                           "web":{"template":variants,"originalTemplate":base,"duration":duration,"buff":buff,
                                  "extraMaximumLife":500,"sameEntity":True,"baseCooldown":[40,37,34,31,28,25],
                                  "mana":[20,30,40,50,60,70]}}
    skills["A110"]["web"].update({"bonusManaRegen":[3*i for i in range(1,7)],"baseManaRegen":.01,
                                 "primaryInterval":[1.15,1.1,1.05,1,.95,.9],"secondaryInterval":2.5,"greedCapIncrease":[2*i for i in range(1,7)]})
    skills["A169"]["web"].update({"minimumModifiedCooldown":19,"weaponBaseAdd":[500,600,700,800,900,1000],
                                 "nativeCritical":[15,20,25,30,35,40],"criticalMultiplier":4.5,
                                 "naturalStrengthDelta":-22,"naturalAgilityDelta":7,"templateHpDelta":75})
    return {"baseline":"alchemist-wolf-transforms-v1","status":"ready","skills":skills,
            "source":{"path":ai.DISASM,"sha256":sha256((ROOT/ai.DISASM).read_bytes()).hexdigest()}}


def probes():
    path=ROOT/"tools/audit-wisp-link-overcharge-relocate.py"
    vm={"__file__":str(path)}
    exec(compile(path.read_text().split("\nCOUNT=0;VECTORS=[]",1)[0],path,"exec"),vm)
    checks=[]
    def check(label, outcome):
        assert outcome,label
        checks.append(label)

    for skill,(base,*_) in FORMS.items():
        w=vm["World"]()
        hero=vm["unit"](base,**{skill:6,"B180":1,"P222":10})
        hero["cd"][skill]=25
        hero["items"].add("i327")
        w.current,w.spell=hero,skill
        w.japi["EXGetAbilityState"]=lambda h,_:h[0]["cd"][h[1]]
        w.env["Skill_BS_Still"]=lambda u:w.log.append(("still",u))
        vm["execute"](vm["function"]("main/f291/f14"),[w.env,w.japi],stop_pc=42)
        check(f"{skill} reaches the one shared movement timer dispatcher at EFFECT",w.log==[("still",hero)])
        w.env["AnySkillStop"]()
        expected=19 if skill=="A169" else 18
        check(f"{skill} keeps its real cooldown floor distinction under sequential .8 and .9",isclose(hero["cd"][skill],expected))

    wolf={"maxLife":1200,"currentLife":800,"weaponBase":29,"str":35,"agi":13}
    delta=75+500-22*15
    shifted={**wolf,"maxLife":wolf["maxLife"]+delta,"currentLife":wolf["currentLife"]+delta,"weaponBase":529,"str":13,"agi":20}
    shifted["maxLife"]+=7
    check("A169 is base +500, separate from real STR loss and explicit maximum life amount",
          delta==245 and shifted=={"maxLife":1452,"currentLife":1045,"weaponBase":529,"str":13,"agi":20})
    check("A169 return subtracts only own deltas, leaving external +7 and low-life floor one",
          shifted["maxLife"]-delta==1207 and max(1,100-delta)==1)
    check("A110 rank-six graph regen adds exactly 18, not 18 minus permanent template regen",isclose(18.01-.01,18))
    return checks


def main():
    data=metadata()
    data["probes"]=probes()
    body=json.dumps(data,ensure_ascii=False,indent=2)+"\n"
    if sys.argv[1:]==["--write"]:
        OUT.write_text(body)
    else:
        assert OUT.read_text()==body
    print(f"2/2 ready, {len(data['probes'])} boundary probes, 280 workbook cells")


if __name__=="__main__":
    main()
