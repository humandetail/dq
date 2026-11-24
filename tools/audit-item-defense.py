#!/usr/bin/env python3
"""Check the encyclopedia's mounted abilities for native permanent defense effects."""

import argparse
from collections import Counter
from contextlib import closing
import json
import re
import sys
import time

sys.dont_write_bytecode = True
import audit_index as source

SHEET = "装备与道具"
OUT = source.ROOT / "docs/rules/item-defense-batch-01.json"
CRIT = {"ACct", "ANdb", "AOcr"}
DEFENSE_TERMS = re.compile("魔抗|魔法抗|法术抗|减伤|闪避|格挡|伤害.{0,5}减少|免疫|抵挡|承受|防御|护盾|躲避|减免")
REVIEWED_MOUNTED_CODES = frozenset("""
AEar AEbl AHab AHad AIab AIas AIat AIcb AIem AIfs AIgo AIlm AIlu AIml AImm AIms AIrg AIrm AIsa
ANcl ANso AOac AOae AOcl AOcr Adet Aeye Aoar Apig Aprg Aspb
""".split())


def evidence(db):
    def workbook(path):
        return {n: (json.loads(cells) + [None] * 8)[:8] for n, cells in db.execute(
            "SELECT row_no,cells FROM sheet_row WHERE source=? AND sheet=? ORDER BY row_no",
            (source.source_path(path), SHEET),
        )}

    original, repo = (workbook(path) for path in source.WORKBOOKS)
    assert original == repo
    abilities = {alias: (index, json.loads(data)) for alias, index, data in db.execute("""
        SELECT object_id,row_no-1,fields FROM object_row
        WHERE source='reference/map-6.25/units_abilitydata.json'
    """)}
    item_data = dict(db.execute("""
        SELECT object_id,json_extract(fields,'$.abilList') FROM object_row
        WHERE source='reference/map-6.25/units_itemdata.json'
    """))
    ability_overrides = {row[0] for row in db.execute("""
        SELECT object_id FROM object_row WHERE source='reference/map-6.25/war3map.w3a.json'
    """)}
    item_list_overrides = {row[0] for row in db.execute("""
        SELECT object_id FROM object_row, json_each(fields,'$.mods')
        WHERE source='reference/map-6.25/war3map.w3t.json' AND json_extract(value,'$.key')='iabi'
    """)}
    aliases, mixed, descriptions, wrappers = {}, [], [], {}
    count = 0
    for n, (name, item, kind, *_, description) in repo.items():
        if n < 5 or not item:
            continue
        count += 1
        assert item not in item_list_overrides
        raw = item_data[item]
        tokens = [part.strip() for part in (raw or "").split(",") if part.strip()]
        for alias in tokens.copy():
            ability = abilities[alias][1]
            if ability["code"] == "Aspb":
                children = ability["DataA1"].split(",")
                assert all(abilities[child][1]["code"] != "Aspb" for child in children)
                wrappers[alias] = children
                tokens.extend(children)
        for alias in tokens:
            index, data = abilities[alias]
            assert alias not in ability_overrides
            aliases[alias] = data["code"]
            if data["code"] in CRIT:
                evade = [data.get(f"DataD{level}") for level in range(1, data["levels"] + 1)]
                assert all(value is None for value in evade)
                mixed.append({"item": item, "name": name, "workbookCell": f"H{n}", "ability": alias,
                              "objectJsonIndex": index, "sourceEvadePctByLevel": evade, "webEvadePct": 0,
                              "offensiveNeverMissFlag": data.get("DataE1")})
        matched = [line for line in (description or "").splitlines() if DEFENSE_TERMS.search(line)]
        if matched:
            descriptions.append({"id": item, "kind": kind, "workbookCell": f"H{n}", "effect": matched,
                                 "objectAbilList": raw})

    assert set(aliases.values()) == REVIEWED_MOUNTED_CODES
    assert (count, len(aliases), len(mixed)) == (243, 163, 5)
    assert [row["id"] for row in descriptions] == ["i200", "i201", "i232", "i233", "i265", "i266", "i308", "i309"]
    assert abilities["AIcd"][1]["code"] == "AOac" and "AIcd" not in aliases
    assert all(code not in aliases.values() for code in ("AIsr", "AEev", "ACev", "Avul", "Amim", "Arsk"))
    return {
        "baselineId": "item-defense-batch-01", "status": "bounded_negative_source_audit",
        "scope": "Native permanent equipped magic damage reduction, general damage reduction, evasion and damage block.",
        "coverage": {"workbookItemsCompared": count, "mountedAbilityAliasesScanned": len(aliases),
                     "mountedBaseCodesScanned": len(REVIEWED_MOUNTED_CODES), "defensiveAliases": 0,
                     "defensiveItems": 0, "recipeBookDefensivePreviews": 0,
                     "mixedOffensiveAliasesCheckedForEvasion": len(mixed)},
        "mountedFamilyAliasCounts": dict(sorted(Counter(aliases.values()).items())),
        "spellBookChildren": wrappers, "criticalObjectsNoEvasion": mixed,
        "workbookDefenseTerms": descriptions,
        "lookalike": {"alias": "AIcd", "objectJsonIndex": abilities["AIcd"][0], "actualCode": "AOac", "mounted": False},
        "webRule": "These mounts register no native permanent damage reduction, evasion or block. Preserve existing B03 and weapon handling.",
        "outsideBatch": {"outgoingSpellDamage": ["i200", "i265", "i308"], "activeMagicImmunity": ["i232", "I234"]},
        "dependencies": ["web-baseline/B03", "item-damage-dispatch", "native-critical-family", "skill-coup-de-grace"],
        "remainingInScope": 0, "originalClientTested": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--write", action="store_true")
    modes.add_argument("--check", action="store_true")
    args = parser.parse_args()
    with closing(source.connect()) as db:
        start = time.perf_counter()
        report = evidence(db)
        elapsed = (time.perf_counter() - start) * 1000
    rendered = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.write:
        OUT.write_text(rendered)
    else:
        assert OUT.read_text() == rendered, f"{OUT.name} differs from indexed inputs"
    print(f"{report['coverage']}; indexed verification {elapsed:.2f} ms")


if __name__ == "__main__":
    main()
