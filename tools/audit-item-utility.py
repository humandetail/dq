#!/usr/bin/env python3
"""Compare item utility mounts with both indexed books and replay the teleport queue."""

import argparse
from contextlib import closing
import json
import runpy
import sys

sys.dont_write_bytecode = True
import audit_index as source

OUT = source.ROOT / "docs/rules/item-utility-batch-01.json"
SHEET = "装备与道具"
ITEMS = {
    "i207": ("I211", "ANcl", "一次性道具", {"Cool1": 10, "Cost1": 50, "Rng1": 999999, "DataB1": 2}),
    "i230": ("I233", "ANcl", "冷却时间25秒", {"Cool1": 25, "Cost1": 50, "Rng1": 999999, "DataB1": 2}),
    "i234": ("I235", "AEbl", "最远1000距离", {"Cool1": 5, "Cost1": 20, "DataA1": 1000, "DataB1": 200}),
    "i236": ("I237", "AEbl", "最远1400距离", {"Cool1": 4, "Cost1": 20, "DataA1": 1400, "DataB1": 200}),
    "i206": ("Adt1", "Adet", "侦查周围隐形单位", {"Rng1": 1100, "DataA1": 3, "targs1": "vuln,invu"}),
    "i235": ("I236", "Aeye", "持续100秒", {"Rng1": 500, "Dur1": 100, "HeroDur1": 300, "UnitID1": "b116"}),
    "i224": ("I219", "ANso", "所有伤害的30%", {"Cool1": 25, "Cost1": 70, "Dur1": 5, "Rng1": 800, "BuffID1": "B049"}),
    "i226": ("I220", "ANso", "普通攻击都会造成150%", {"Cool1": 25, "Cost1": 70, "Dur1": 5, "Rng1": 800, "BuffID1": "B050"}),
    "i232": ("I234", "ANcl", "技能免疫状态,持续6秒", {"Cool1": 30, "Cost1": 50, "DataF1": "unloadcorpse"}),
    "i800": ("I244", "Aprg", "去除敌人身上的某些魔法效果",
             {"Cool1": 25, "Rng1": 700, "DataA1": 5, "DataC1": 400, "Dur1": 15, "HeroDur1": 5, "BuffID1": "Bprg"}),
}
PENDING = {"i224", "i226"}

WEB = {
    "I211": {"destination": "point", "delaySeconds": 0.1, "nonAbyssIllegalTerrain": "remove first i207 and deliver a new one", "initialCharges": 1},
    "I233": {"destination": "point", "delaySeconds": 0.1, "nonAbyssIllegalTerrain": "committed no-op"},
    "I235": {"battleOnly": True, "distance": [200, 1000], "cooldown": 5, "mana": 20},
    "I237": {"battleOnly": True, "distance": [200, 1400], "cooldown": 4, "mana": 20,
             "acquisition": {"mode": 2, "phase": "abyss setup", "entitlements": ["SHOPITEM08", "SHOPITEM01"]}},
    "Adt1": {"trigger": "inventory equipped", "detectionRange": 1100},
    "I236": {"heroOnly": True, "charges": 1, "castRange": 500, "ward": "b116", "lifetime": 100,
             "daySight": 1000, "nightSight": 1000, "detectionRange": 1100, "hitPoints": 200},
    "I234": {"target": "self", "status": "spellImmune", "seconds": 6, "mana": 50, "cooldown": 30, "decision": "Q64"},
    "I244": {"mana": 0, "castRange": 700, "cooldown": 25, "movementUpdates": 5, "summonDamage": 400,
             "slowSeconds": {"nativeHero": 5, "ordinary": 15}, "initialSpeedMultiplier": 0.2},
}


def evidence(db):
    records = {}
    for item, (alias, code, phrase, expected) in ITEMS.items():
        books = [r for r in source.workbook_rows(db, item, SHEET) if r["cells"][1] == item]
        assert len(books) == 2 and books[0]["cells"][:8] == books[1]["cells"][:8], item
        book = books[0]
        assert phrase in book["cells"][7], item
        obj, = source.objects(db, item, "units_itemdata")
        skill, = source.objects(db, alias, "units_abilitydata")
        fields = skill["fields"]
        mounts = obj["fields"]["abilList"].split(",")
        assert alias == mounts[0] and skill["fields"]["code"] == code
        mods = {m["key"]: m["value"] for r in source.objects(db, item, "war3map.w3t") for m in r["fields"]["mods"]}
        assert "iabi" not in mods and ("utub" not in mods or phrase in mods["utub"]), (item, phrase)
        assert not source.objects(db, alias, "war3map.w3a")
        assert {key: fields.get(key) for key in expected} == expected, item
        records[item] = {
            "alias": alias, "componentReady": item not in PENDING, "code": code, "name": book["cells"][0],
            "workbookCell": f"{SHEET}!H{book['row']}", "sourceItemJsonIndex": obj["jsonIndex"],
            "sourceAbilityJsonIndex": skill["jsonIndex"], "sourceLevel1": {k: v for k, v in fields.items() if k.endswith("1")},
            "itemFields": {key: obj["fields"].get(key) for key in ("abilList", "usable", "uses", "perishable", "cooldownID")},
        }
        if item not in PENDING:
            records[item]["web"] = WEB[alias]

    assert records["i224"]["itemFields"]["cooldownID"] == records["i226"]["itemFields"]["cooldownID"] == "I219"
    assert records["i207"]["itemFields"]["uses"] == records["i235"]["itemFields"]["uses"] == 1
    assert records["i207"]["itemFields"]["perishable"] == records["i235"]["itemFields"]["perishable"] == 1
    assert records["i206"]["itemFields"]["usable"] is None and records["i800"]["sourceLevel1"].get("Cost1") is None

    tier, = source.objects(db, "T068", "units_abilitydata")
    assert all(tier["fields"][k] == v for k, v in {"code": "Aams", "BuffID1": "B080", "Dur1": 6, "HeroDur1": 6}.items())
    ward, = source.objects(db, "b116", "units_unitbalance")
    assert (ward["fields"]["HP"], ward["fields"]["sight"], ward["fields"]["nsight"]) == (200, 1000, 1000)
    ward_mounts, = source.objects(db, "b116", "units_unitabilities")
    assert ward_mounts["fields"]["abilList"] == "Adt1,Aeth"
    purge, = source.objects(db, "Aprg", "units_abilitydata")
    compare = ("DataA1", "DataC1", "Dur1", "HeroDur1", "Rng1", "targs1")
    assert all(purge["fields"][k] == records["i800"]["sourceLevel1"][k] for k in compare)
    return records, {"T068": tier, "b116": ward, "b116Abilities": ward_mounts}


def probes(db):
    vm = runpy.run_path(str(source.ROOT / "tools/audit-divine-books.py"))["runtime"](db)
    execute, function = vm["execute"], vm["function"]
    calls = []

    def find(value, entries):
        return next((index for index, entry in entries.items() if entry == value), -1)

    def add(entries, value):
        key = max(entries, default=0) + 1
        entries[key] = value
        return key

    created = iter((101, 102))
    env = {
        "GetTriggerUnit": lambda: "bearer", "IsInTable": find, "AddArrAny": add,
        "RemoveLocation": lambda loc: calls.append(["remove-point", loc]),
        "DestroyTimer": lambda timer: calls.append(["destroy-timer", timer]),
        "CreateTimer": lambda: next(created),
        "TimerStart": lambda timer, seconds, repeat, callback: calls.append(["start", timer, seconds, repeat]),
        "GetExpiredTimer": lambda: 102,
        "SetUnitPositionLoc": lambda unit, loc: calls.append(["move", unit, loc]), "TxShow": False,
    }
    execute(function("main/f248"), [env])
    execute(function("main/f248/f0"), [env], ("first",))
    execute(function("main/f248/f0"), [env], ("latest",))
    execute(function("main/f248/f1"), [env])
    assert calls == [["start", 101, 0.1, False], ["remove-point", "first"], ["destroy-timer", 101],
                     ["start", 102, 0.1, False], ["move", "bearer", "latest"], ["destroy-timer", 102]]
    shell = []
    env = {
        "GetUnitLoc": lambda unit: "point", "IsInTable": lambda unit, roster: 7, "Tower_ALL": {},
        "GetOwningPlayer": lambda unit: "player",
        "CreateTempAndSetAbilityLv": lambda *args: shell.append(list(args)) or "helper",
        "SetUnitUserData": lambda *args: shell.append(list(args)),
        "IssueTargetOrder": lambda *args: shell.append(list(args)),
    }
    execute(function("main/f253/f0"), [env], ("bearer",))
    assert shell == [["player", "point", 0, "T068", 1, 1, "q027"], ["helper", 7], ["helper", "antimagicshell", "bearer"]]
    return {"teleportReplacementAndExpiry": calls, "shellCarrierAttribution": shell}


def report(db):
    items, aux = evidence(db)
    return {"baselineId": "item-utility-batch-01", "scope": "one inventory utility ability per selected item",
            "coverage": {"aliasesPlanned": len(items), "aliasesReady": len(items) - len(PENDING),
                         "aliasesRemaining": len(PENDING), "uniqueItems": len(items), "recipeRows": 0},
            "items": items, "auxiliaryObjects": aux,
            "sourceLines": {"teleportEntry": [144162, 144297], "teleportQueue": [128400, 128486],
                            "blinkAcquisition": 157379, "wardCleanupExemption": 159939, "blackKingCarrier": 129069,
                            "soulBurn": [144066, 144077, 147975, 152910, 152998, 153071, 164750, 164800]},
            "deferredReason": {"i224": "per-cast ledger / native dispel and delayed finalization",
                               "i226": "same plus ordinary-critical classification across the item damage dispatcher"},
            "verification": probes(db)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--write", action="store_true")
    modes.add_argument("--check", action="store_true")
    args = parser.parse_args()
    with closing(source.connect()) as db:
        data = report(db)
    content = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if args.write:
        OUT.write_text(content)
    else:
        assert OUT.read_text() == content
    print(data["coverage"], "2 original bytecode paths passed")


if __name__ == "__main__":
    main()
