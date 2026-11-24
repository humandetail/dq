#!/usr/bin/env python3
"""Trace item attack add-ons and compare chosen catalogue effects with source slots."""

import argparse
from contextlib import closing
import json
from math import ceil
import runpy
import sys

sys.dont_write_bytecode = True
import audit_index as source

OUT = source.ROOT / "docs/rules/item-attack-procs-batch-01.json"
SHEET = "装备与道具"
PRIOR = {
    "i115": ("45%分裂伤害，380有效范围", "item-damage-effects"),
    "i132": ("攻击有20%的概率", "item-muramasa-takemitsu"),
    "i134": ("释放技能有50%的概率", "item-muramasa-takemitsu"),
    "i213": ("20%概率对目标造成2倍伤害", "skill-coup-de-grace"),
    "i215": ("25%概率对目标造成3.8倍伤害", "skill-coup-de-grace"),
    "i263": ("神圣伤害有20%的概率造成240%的伤害", "item-damage-effects"),
    "i306": ("50%的概率不会丢失", "skill-coup-de-grace"),
}
NEW = {
    "i141": ("30%的概率额外造成400点物理伤害", {"extraChancePct": 30, "extraPhysical": 400, "existingHitPct": 70}),
    "i144": ("20%概率额外造成100点物理伤害", {"extraChancePct": 20, "extraPhysical": 100}),
    "i302": ("13x敏捷x攻击距离/1000", {"chancePct": 12, "attackRangeCoefficient": 13, "radius": 425,
                                      "denominators": [1000, 600], "lockSeconds": 0.3,
                                      "callback": "Item_Attack_Special"}),
    "i316": ("攻击15%概率对目标周围350范围敌人", {"meleeChancePct": 25, "rangedChancePct": 15, "radii": [500, 350],
                                                "strengthDeltaFactors": [10, 8], "meleeLifeBonusFraction": 0.6, "lockSeconds": 2,
                                                "callback": "Item_Attack_Special"}),
    "i322": ("每攻击10次", {"windUp": 0, "waveDistance": 900, "halfWidth": 300, "speed": 2500, "waveSeconds": 0.36,
                            "carrier": "q018", "damageCarrier": "q019", "callback": "ItemDamageActionBefore"}),
}


def profiles(db):
    records = {}
    for item, (phrase, effect) in {**PRIOR, **NEW}.items():
        books = [r for r in source.workbook_rows(db, item, SHEET) if r["cells"][1] == item]
        assert len(books) == 2 and books[0]["cells"][:8] == books[1]["cells"][:8] and phrase in books[0]["cells"][7]
        book = books[0]
        obj, = source.objects(db, item, "units_itemdata")
        ability_list = obj["fields"]["abilList"]
        row = {"name": book["cells"][0], "workbookCell": f"{SHEET}!H{book['row']}", "componentReady": True,
               "sourceAbilList": ability_list, "newEffect": item in NEW}
        if item in PRIOR:
            row["existingRule"] = effect
        else:
            row["web"] = effect
        if item in {"i141", "i144"}:
            row["indexedScriptRefs"] = [x["sourceLine"] for x in source.references(db, item)]
            assert all(x["function"] == "main/f285" for x in source.references(db, item))
            raw_integer = str(int.from_bytes(item.encode(), "big"))
            assert not db.execute("SELECT 1 FROM constant WHERE value=? LIMIT 1", (raw_integer,)).fetchone()
        records[item] = row
    assert records["i141"]["sourceAbilList"] == "I185,I187" and records["i144"]["sourceAbilList"] == "I134,I134"
    hit, = source.objects(db, "I185", "units_abilitydata")
    assert (hit["fields"]["DataA1"], hit["fields"]["DataC1"], hit["fields"]["DataE1"]) == (70, 1, 1)
    wave, = source.objects(db, "T077", "units_abilitydata")
    fields = wave["fields"]
    assert (fields["code"], fields["Area1"], fields["DataC1"], fields["DataD1"], fields["DataA1"],
            fields["DataB1"], fields["Rng1"]) == ("AUcs", 300, 900, 300, 10, 9999999, 5000)
    return records


def probes(db):
    vm = runpy.run_path(str(source.ROOT / "tools/audit-divine-books.py"))["runtime"](db)
    execute, function = vm["execute"], vm["function"]
    events = []
    env = {"GetRandomInt": lambda lo, hi: 12, "IsKillCdSkill": lambda unit: True,
           "GetUnitX": lambda unit: 10 if unit == "actor" else 30, "GetUnitY": lambda unit: 20,
           "GetHeroAgi": lambda unit, with_bonus: 100 if with_bonus else 50,
           "GetHeroStr": lambda unit, with_bonus: 200, "GetUnitState": lambda unit, stat: 1000,
           "ConvertUnitState": lambda stat: stat, "TxShow": False, "Game_Mode": 0,
           "UnitDamagePoint": lambda unit, delay, radius, x, y, amount, *args: events.append([radius, x, y, round(amount, 6)])}
    execute(function("main/f268/f1"), [env, {}, None, {}, {}], ("actor", "target"))
    assert events == [[425, 30, 20, 1100]]
    env["GetRandomInt"] = lambda lo, hi: 13
    execute(function("main/f268/f1"), [env, {}, None, {}, {}], ("actor", "target"))
    assert len(events) == 1

    env.update({"GetRandomInt": lambda lo, hi: 20, "UNIT_TYPE_MELEE_ATTACKER": "melee", "UNIT_STATE_LIFE": "life",
                "GetUnitLoc": lambda unit: unit, "AngleBetweenPoints": lambda *args: 0,
                "math": {"ceil": ceil}, "CreateTextTagByUnit": lambda *args: None})
    centers = []
    def count(center):
        centers.append(center)
        return 2

    for melee in (True, False):
        env["IsUnitType"] = lambda unit, kind: melee
        execute(function("main/f269/f2"), [env, {}, None, {}, count, {}], ("actor", "target"))
    assert centers == ["actor", "target"] and events[1:] == [[440, 10, 20, 2700], [310, 30, 20, 2070]]

    def contact(x, y):
        return x / 2500 if 0 <= x <= 900 and abs(y) <= 300 else None

    geometry = {f"{x},{y}": contact(x, y) for x, y in ((500, 300), (500, 301), (900, 0), (901, 0))}
    assert list(geometry.values()) == [0.2, None, 0.36, None]
    return {"originalAttackProcAreas": events, "axeOriginalCensusCenters": centers, "webWaveEdges": geometry}


def report(db):
    return {"baselineId": "item-attack-procs-batch-01", "coverage": {"itemsReady": 12, "newEffects": 5, "priorEffects": 7},
            "items": profiles(db), "verification": probes(db),
            "sourceLines": {"specialDispatch": 146247, "star": 133492, "axeCensus": 133661,
                            "axeDispatch": 133818, "relicWave": 133200, "relicBridge": 133315}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--write", action="store_true")
    modes.add_argument("--check", action="store_true")
    args = parser.parse_args()
    with closing(source.connect()) as db:
        data = report(db)
    rendered = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if args.write:
        OUT.write_text(rendered)
    else:
        assert OUT.read_text() == rendered
    print(data["coverage"], "4 original attack paths and 4 wave-edge cases passed")


if __name__ == "__main__":
    main()
