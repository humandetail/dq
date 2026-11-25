#!/usr/bin/env python3
"""Compare spell-output item descriptions and replay their original damage slots."""

import argparse
from contextlib import closing
from fractions import Fraction
import json
import runpy
import sys

sys.dont_write_bytecode = True
import audit_index as source

OUT = source.ROOT / "docs/rules/item-spell-output-batch-01.json"
SHEET = "装备与道具"
PENETRATION = {"i200": (10, 1.1), "i265": (35, 1.3), "i308": (25, 1.2)}
AMPLIFICATION = dict(zip((f"i{item}" for item in range(179, 185)), (7, 12, 17, 22, 27, 35)))


def profiles(db):
    records = {}
    for item in (*PENETRATION, *AMPLIFICATION, "i119"):
        rows = [r for r in source.workbook_rows(db, item, SHEET) if r["cells"][1] == item]
        assert len(rows) == 2 and rows[0]["cells"][:8] == rows[1]["cells"][:8]
        book = rows[0]
        obj, = source.objects(db, item, "units_itemdata")
        lines = [r["sourceLine"] for r in source.references(db, item) if r["function"] == "main/f285/f12"]
        assert len(lines) == 1
        row = {"name": book["cells"][0], "workbookCell": f"{SHEET}!H{book['row']}", "componentReady": True,
               "newEffectAudit": item in PENETRATION, "sourceLine": lines[0], "itemJsonIndex": obj["jsonIndex"],
               "description": book["cells"][7]}
        if item in PENETRATION:
            resistance_pct, source_multiplier = PENETRATION[item]
            phrase = f"无视{resistance_pct}%的魔法抗性"
            assert phrase in book["cells"][7]
            tips = [m["value"] for r in source.objects(db, item, "war3map.w3t") for m in r["fields"]["mods"] if m["key"] == "utub"]
            assert not tips or phrase in tips[0]
            row.update(sourcePostMitigationMultiplier=source_multiplier, resistanceIgnoredPct=resistance_pct, callback="ItemDamageActionAfter")
        elif item in AMPLIFICATION:
            pct = AMPLIFICATION[item]
            assert f"增加{pct}%的法术伤害" in book["cells"][7]
            row.update(multiplier=1 + pct / 100, existingRule="item-damage-effects")
        else:
            assert "10%的概率造成1.4倍的暴击" in book["cells"][7]
            row.update(criticalChancePct=10, multiplier=1.4, existingRule="item-damage-dispatch")
        records[item] = row
    return records


def source_probes(db):
    vm = runpy.run_path(str(source.ROOT / "tools/audit-divine-books.py"))["runtime"](db)
    execute, function = vm["execute"], vm["function"]
    results = {}
    for held, kind, temporary in (({"i200", "i265", "i308"}, "magic", True), ({"i308"}, "magic", False),
                                  ({"i200", "i265", "i308"}, "physical", False)):
        current = 100
        writes = []
        expect_owner = "hero" if temporary else "source"

        def set_damage(value):
            nonlocal current
            current = value
            writes.append(round(value, 6))

        def has_item(owner, item):
            assert owner == expect_owner
            return item if item in held else None

        env = {"GetEventDamageSource": lambda: "source", "GetTriggerUnit": lambda: "victim",
               "IsTemp": lambda unit: temporary, "Tower_ALL": {1: "hero"}, "GetUnitUserData": lambda unit: 1,
               "IsUnitIllusion": lambda unit: False, "GetUnitAbilityLevel": lambda unit, rawcode: 0,
               "GetId": lambda rawcode: rawcode, "HasItem": has_item, "isMagicDamage": lambda k: k == "magic"}
        japi = {"GetEventDamage": lambda index: current, "EXGetEventDamageData": lambda index: kind,
                "EXSetEventDamage": set_damage}
        execute(function("main/f285/f12"), [env, japi])
        results[f"{'+'.join(sorted(held))}:{kind}:{temporary}"] = writes
    assert list(results.values()) == [[110, 143], [120], []]
    return results


def web_probes():
    def apply(damage, resist, effects):
        for penetration in effects:
            if 0 < resist < 1:
                remaining = resist * (1 - penetration)
                damage *= (1 - remaining) / (1 - resist)
                resist = remaining
        return damage

    p10, p35 = Fraction(1, 10), Fraction(7, 20)
    outcomes = [apply(Fraction(100), 0, [p10, p35]),
                apply(Fraction(50), Fraction(1, 2), [p10, p35]),
                apply(Fraction(100) * Fraction(6, 5) / 2, Fraction(1, 2), [p10, p35]),
                apply(Fraction(0), 1, [p10, p35])]
    assert outcomes == [Fraction(100), Fraction("70.75"), Fraction("84.9"), Fraction(0)]
    return {"cases": ["zero resistance", "50% resistance", "50% resistance after 20% preceding amplification",
                      "already cancelled or blocked fully"], "finalDamage": [float(value) for value in outcomes]}


def report(db):
    return {"baselineId": "item-spell-output-batch-01", "coverage": {"items": 10, "newEffects": 3, "priorEffectReconciliations": 7},
            "items": profiles(db), "semantics": {"i200": 0.1, "preferred": ["i265", "i308"],
               "exclusiveAlternativeFractions": [0.35, 0.25], "remainder": "r2=r1*(1-penetration)",
               "eventWrite": "D*(1-r2)/(1-r1) for positive 0<r1<1", "maintainsCategoryAndImmunity": True},
            "sourceLines": {"sourceOwnership": 145677, "implementation": [145852, 145910]},
            "checks": {"sourceBody": source_probes(db), "webContract": web_probes()}}


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
    print(data["coverage"], "3 original damage paths and 4 Web resistance cases passed")


if __name__ == "__main__":
    main()
