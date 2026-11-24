#!/usr/bin/env python3
"""Inventory the abilities mounted or granted to reachable combat enemies."""
from collections import defaultdict
from contextlib import closing
from pathlib import Path
import json
import sys

import audit_index as ai

ROOT=Path(__file__).resolve().parents[1]
RULES=ROOT/"docs/rules"
OUT=RULES/"enemy-ability-coverage.json"

GROUPS={
    "mainline-first":["N508"]+[f"N{k}" for k in range(511,523)],
    "mainline-later":[f"N{k}" for k in (525,526,527,528,530,531,532,533,571,573,574,575,576,579,581)],
    "endless-responses":[f"N{k}" for k in (537,538,539,550,551,552,540,542,559,543,554,557,558)],
    "abyss-responses":[f"N{k}" for k in (560,561,562,563,564,565,566,567,568)],
    "summon-auras":[f"N{k}" for k in (541,553,544,545,546,547,556)],
    "native-utility":["T044","T045"],
}
READY={
    "Avul":"web-baseline.md",
    **dict.fromkeys(("T013","T014","T015","T016","T017","T018"),"item-defense-batch-01.md"),
    **dict.fromkeys(("N523","N524","N572"),"shared-attack-resolution.md"),
    "N534":"skill-stone-gaze.md",
    "N535":"item-hex-effect.md",
    "N536":"skill-stone-gaze.md",
    "N548":"challenge-spawns.md",
    "N549":"sprout.md",
    "N555":"challenge-spawns.md",
    "N577":"damage-pipeline.md",
    "N578":"challenge-spawns.md",
    "T202":"damage-pipeline.md",
    **dict.fromkeys(GROUPS["mainline-first"],"npc-mainline-abilities-01.md"),
    **dict.fromkeys(GROUPS["mainline-later"],"late-enemy-effects.md"),
    "N576":"supernova-egg.md",
    **dict.fromkeys(GROUPS["endless-responses"],"npc-abyss-abilities.md"),
    **dict.fromkeys(GROUPS["abyss-responses"],"npc-abyss-dragon-abilities.md"),
    **dict.fromkeys(GROUPS["summon-auras"]+["T044"],"enemy-auras-and-utility.md"),
    "T045":"npc-mainline-abilities-01.md",
    **dict.fromkeys((f"N{k}" for k in (701,702,703,704,706,707,708,709,710,711,712,582,583,584)),"challenge-enemy-effects.md"),
}
# These are actual grants, not the wider pool of IDs only queried or removed by a handler.
DYNAMIC={
    "N508":{"applies":"early spawn explicit branch","function":"main/f294/f18","line":184747},
    "T202":{"applies":"overload eligible enemies","function":"main/f294/f18","line":184876},
    "N572":{"applies":"m051 N571 activation","function":"main/f212/f0","line":120313},
    "N701":{"applies":"challenge entrance A","function":"main/f283/f1","line":138329},
    "N702":{"applies":"challenge entrance B","function":"main/f283/f1","line":138334},
    "N703":{"applies":"challenge entrance C","function":"main/f283/f1","line":138339},
    "N704":{"applies":"challenge entrance D","function":"main/f283/f1","line":138342},
    "N560":{"applies":"Abyss dragon revival transform","function":"main/f290/f17","line":159205},
    "N561":{"applies":"Abyss dragon revival transform","function":"main/f290/f15","line":159034},
    "T254":{"applies":"challenge resurrection temporary control carrier","function":"main/f180/f0","line":113935},
    "T140":{"applies":"challenge untouchable response carrier","function":"main/f230/f0","line":125304},
}
SUPPORT_PARENT={"T254":"N582","T140":"N706"}


def make_report():
    waves=json.loads((RULES/"waves-data.json").read_text())
    challenge=json.loads((RULES/"challenge-spawns.json").read_text())
    mainline=json.loads((RULES/"npc-mainline-abilities-01.json").read_text())
    responses=json.loads((RULES/"npc-abyss-abilities.json").read_text())
    dragon=json.loads((RULES/"npc-abyss-dragon-abilities.json").read_text())
    assert all(mainline["abilities"][key]["status"]=="ready" for key in GROUPS["mainline-first"])
    assert {r["id"] for r in responses["records"] if r["status"]=="ready"}==set(GROUPS["endless-responses"])
    assert {r["id"] for r in dragon["records"] if r["status"]=="ready"}==set(GROUPS["abyss-responses"])
    subjects={key:"mode template" for key in waves["capacityPointsByUnitId"]}
    subjects.update({r["abilities"]["id"]:"challenge template" for group in challenge["families"] for r in group["templates"]})
    subjects.update({k:"skill enemy summon" for s in challenge["skillEnemySpawns"].values() for k in s["templates"]})
    subjects.update({"e008":"N531 actual morph template","e009":"N532 actual morph template","b138":"N576 actual egg"})
    hosts=defaultdict(list)
    templates={}
    with closing(ai.connect()) as db:
        for k,scope in subjects.items():
            slot=ai.objects(db,k,"units_unitabilities",fields=["abilList","auto"])[0]
            mounted=slot["fields"].get("abilList","_")
            abilities=[] if mounted=="_" else mounted.split(",")
            templates[k]={"scope":scope,"evidence":slot,"abilities":abilities}
            for ability in abilities:
                hosts[ability].append(k)
        labels={key:group for group,items in GROUPS.items() for key in items}
        observed=sorted(set(hosts)|set(DYNAMIC))
        coverage={}
        for key in observed:
            owner=SUPPORT_PARENT.get(key,key)
            assert owner in READY or owner in labels,key
            info=ai.objects(db,key,"units_abilitydata",fields=["code","levels"])[0]
            coverage[key]={"hosts":hosts[key],"dynamic":DYNAMIC.get(key),"object":info,
                           "scope":labels.get(owner),"readyEvidence":READY.get(owner),
                           "status":"specified" if owner in READY else "pending-internal",
                           "references":ai.references(db,key)}
    assert set(READY)|set(labels) <= set(observed),sorted((set(READY)|set(labels))-set(observed))
    for key in READY.values():
        assert (RULES/key).is_file(),key
    pending={k:[i for i in ids if coverage[i]["status"]=="pending-internal"] for k,ids in GROUPS.items()}
    pending={k:ids for k,ids in pending.items() if ids}
    return {"basis":["waves-data.json","challenge-spawns.json",ai.DISASM,"units_unitabilities"],
            "templates":templates,"dynamic":DYNAMIC,"abilities":coverage,"sourceGroups":GROUPS,"pendingGroups":pending,
            "supportingTransientObjects":{"T069":"enemy-auras-and-utility.md","T096":"late-enemy-effects.md","T097":"supernova-egg.md"},
            "limitedEvidence":{"N578":"spawn effect ready, b141 object coefficients retained",
              "T044":"carrier reference in A206 does not close m013 mounted native effect"}}


if __name__=="__main__":
    report=make_report()
    payload=json.dumps(report,ensure_ascii=False,indent=2)+"\n"
    if sys.argv[1:]==["--write"]:
        OUT.write_text(payload)
    else:
        assert OUT.read_text()==payload
    ready=sum(v["status"]=="specified" for v in report["abilities"].values())
    print(f'{len(report["templates"])} templates, {len(report["abilities"])} abilities, {ready} specified')
