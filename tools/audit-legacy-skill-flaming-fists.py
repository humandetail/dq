#!/usr/bin/env python3
"""Prove the six infernals are playable and confirm their attack proc branches."""

import argparse
from contextlib import closing
import json
import runpy
import sys

sys.dont_write_bytecode = True
import audit_index as source

OUT = source.ROOT / "docs/rules/legacy-skill-flaming-fists.json"


def field(db, alias, family):
    row, = source.objects(db, alias, family)
    return row["fields"]


def audit(db):
    workbook = source.workbook_rows(db, "A175", "塔技能")
    assert {tuple(r["cells"][i] for i in (1, 5, 6)) for r in workbook} == {
        ("H045", "A175", 6), ("G070", "A175", 6)}
    hero_rows = [r for r in source.workbook_rows(db, "H045", "塔与属性") if r["cells"][0] == "H045"]
    assert len(hero_rows) == 2 and all("SR 卡池 i582" in r["cells"][18] for r in hero_rows)
    assert "A175" in field(db, "H045", "units_unitabilities")["heroAbilList"].split(",")
    summon = field(db, "T189", "units_abilitydata")
    assert summon["code"] == "AUin" and summon["levels"] == 6
    units = {level: summon[f"UnitID{level}"] for level in range(1, 5)}
    units.update({m["level"]: m["value"] for m in field(db, "T189", "war3map.w3a")["mods"] if m["key"] == "Uin4"})
    assert [units[level] for level in range(1, 7)] == [f"n26{i}" for i in range(1, 7)]
    assert [(r["function"], r["pc"]) for r in source.references(db, "T189")] == [("main/f124/f0", 16), ("main/f124/f0", 40)]
    assert any(r["function"] == "main/f291/f14" for r in source.references(db, "A175"))
    strings = (source.ROOT / "reference/map-6.25/units_campaignabilitystrings.txt").read_text(encoding="utf-8")
    vm = runpy.run_path(str(source.ROOT / "tools/audit-divine-books.py"))["runtime"](db)
    run, function = vm["execute"], vm["function"]
    original_prob = function("main/f183/f1")
    assert run(original_prob, [{"GetRandomInt": lambda low, high: 24 if (low, high) == (0, 100) else None}])
    assert not run(original_prob, [{"GetRandomInt": lambda low, high: 25 if (low, high) == (0, 100) else None}])

    records = {}
    for level, unit in sorted(units.items()):
        alias = f"N{141+level}"
        amount = 500 * level
        mounted = field(db, unit, "units_unitabilities")["abilList"].split(",")
        assert alias in mounted
        native = field(db, alias, "units_abilitydata")
        assert native["code"] == "AOcr" and not any(k.startswith("Data") and k.endswith("1") for k in native)
        section = strings.split(f"[{alias}]\n", 1)[1].split("\n[", 1)[0]
        assert f"Ubertip=每次攻击有25%的概率对周围300范围内敌方单位造成{amount}点法术伤害" in section
        emitted = []
        env = {"GetEventDamageSource": lambda: unit, "GetTriggerUnit": lambda: "target",
               "GetUnitAbilityLevel": lambda u, a: int(u == unit and a == alias),
               "GetId": lambda a: a, "GetUnitX": lambda u: 100 if u == "target" else 901,
               "GetUnitY": lambda u: 200 if u == "target" else 902,
               "UnitDamagePoint": lambda *args: emitted.append(list(args)),
               "ATTACK_TYPE_NORMAL": "NORMAL", "DAMAGE_TYPE_MAGIC": "MAGIC",
               "WEAPON_TYPE_WHOKNOWS": "WHOKNOWS"}
        run(function("main/f183/f0"), [env])
        assert emitted == [[unit, 0, 300, 100, 200, amount, False, False, "NORMAL", "MAGIC", "WHOKNOWS"]]
        records[alias] = {"summonLevel": level, "carrier": unit, "abilities": mounted, "radius": 300,
                          "webRoll": {"min": 0, "max": 99, "strictlyBelow": 25},
                          "nativeAOcrBonus": "no explicit fields at mounted level 1; no additional critical/evasion contribution",
                          "sourceAmount": amount, "originalVMEmission": emitted[0]}
    return {"scope": "Reachability and attack proc N142–N147", "status": "ready",
            "path": ["SR i582", "H045", "A175", "T189", *units.values()],
            "dispatch": "main/f291/f1 attack gate; draw before ability detection; first eligible alias in ascending order",
            "originalChance": [25, 101], "webChance": [25, 100], "decision": "Q61", "abilities": records}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    with closing(source.connect()) as db:
        data = audit(db)
    payload = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        assert OUT.read_text() == payload, f"{OUT.name} differs"
    else:
        OUT.write_text(payload)
    print("Six playable infernals, six original damage emissions and both probability boundaries passed")


if __name__ == "__main__":
    main()
