#!/usr/bin/env python3
"""Audit mounted item auras and the indexed B140 damage branch."""

import argparse
from collections import Counter
from contextlib import closing
import json
import re
import sys
import time

sys.dont_write_bytecode = True
import audit_index as source

RULES = source.ROOT / "docs/rules"
OUT = RULES / "item-auras-batch-01.json"
SHEET = "装备与道具"
CODES = ("AHad", "AOae", "AOac", "ACac", "AEar")
# Only read the workbook's aura clauses. Unspecified numeric values use level-one object data.
RANGE = re.compile(r"(\d+)范围")
ATTACK = re.compile(r"(\d+)%的?攻击力")
SPEED = re.compile(r"(\d+)%的?攻击速度")
ARMOR = re.compile(r"(\d+)点护甲")
DAMAGE = re.compile(r"(\d+)%的?伤害增幅")


def aura_text(text):
    plain = re.sub(r"\|c[0-9a-fA-F]{8}|\|r", "", (text or "").replace("|n", "\n"))
    clauses = [line for line in plain.splitlines()
               if RANGE.search(line) and re.search("攻击力|攻击速度|护甲|移动速度|伤害增幅", line)]
    return {
        "radius": sorted({int(value) for line in clauses for value in RANGE.findall(line)}),
        **{key: sorted({int(value) * (-1 if re.search("减少|降低", line) else 1)
                        for line in clauses for value in pattern.findall(line)})
           for key, pattern in (("attackPct", ATTACK), ("attackSpeedPct", SPEED),
                                ("armor", ARMOR), ("damagePct", DAMAGE))},
    }


def evidence(db):
    def workbook(path):
        return {n: (json.loads(cells) + [None] * 8)[:8] for n, cells in db.execute(
            "SELECT row_no,cells FROM sheet_row WHERE source=? AND sheet=? ORDER BY row_no",
            (source.source_path(path), SHEET),
        )}

    original, repo = (workbook(path) for path in source.WORKBOOKS)
    assert original == repo
    ability_rows = db.execute("""
        SELECT object_id,row_no-1,fields FROM object_row WHERE source='reference/map-6.25/units_abilitydata.json'
          AND json_extract(fields,'$.code') IN ('AHad','AOae','AOac','ACac','AEar','Aspb')
    """)
    abilities = {alias: (index, json.loads(fields)) for alias, index, fields in ability_rows}
    for code in (*CODES, "Aspb"):
        assert not source.objects(db, code, "war3map.w3a", aliases=True), code
    item_data = {item: (index, raw) for item, index, raw in db.execute("""
        SELECT object_id,row_no-1,json_extract(fields,'$.abilList') FROM object_row
        WHERE source='reference/map-6.25/units_itemdata.json'
    """)}
    item_mods = {item: json.loads(fields) for item, fields in db.execute("""
        SELECT object_id,json_extract(fields,'$.mods') FROM object_row
        WHERE source='reference/map-6.25/war3map.w3t.json'
    """)}

    records, aliases, books, workbook_items = {}, {}, {}, {}
    keys = ("code", "levels", "targs1", "Area1", "BuffID1", "DataA1", "DataB1", "DataC1", "DataD1")
    for n, (name, item, kind, *_, description) in repo.items():
        if n < 5 or not item:
            continue
        index, raw = item_data[item]
        mods = {mod["key"]: mod["value"] for mod in item_mods.get(item, [])}
        assert "iabi" not in mods, item
        tooltip = mods.get("utub")
        entry = {"id": item, "name": name, "workbookCell": f"{SHEET}!H{n}", "objectJsonIndex": index,
                 "objectAbilList": raw, "workbookNumbers": aura_text(description)}
        workbook_items[item] = (entry, kind, tooltip)
        mounts = []
        for position, alias in enumerate((raw or "").split(","), 1):
            assert alias == alias.strip() or alias.strip() not in abilities
            if alias not in abilities:
                continue
            ability_index, ability = abilities[alias]
            if ability["code"] == "Aspb":
                assert all(child not in abilities for child in ability["DataA1"].split(",")), (item, alias)
                continue
            assert kind != "制作书"
            aliases[alias] = {"jsonIndex": ability_index, **{key: ability.get(key) for key in keys}, "effectiveLevel": 1}
            mounts.append({"alias": alias, "position": position})
        if mounts:
            records[item] = {**entry, "mounts": mounts, "objectTooltipNumbers": aura_text(tooltip) if tooltip else None}
    for alias in aliases:
        assert not source.objects(db, alias, "war3map.w3a")
        for literal in (alias, *(int.from_bytes(alias.encode(), order) for order in ("big", "little"))):
            assert not source.references(db, literal), (alias, literal)

    lifecycle = json.loads((RULES / "item-lifecycle.json").read_text())
    for recipe in lifecycle["tables"]["recipes"]:
        product = records.get(recipe["result"])
        if not product:
            continue
        for material in recipe["materials"]:
            entry, kind, tooltip = workbook_items[material]
            if kind != "制作书":
                continue
            assert entry["name"].removeprefix("制作书-") == product["name"]
            books[material] = {**entry, "product": product["id"], "recipeSourceLines": recipe["sourceLines"],
                               "objectTooltipNumbers": aura_text(tooltip) if tooltip else None,
                               "webActiveAuras": [], "webFinishedItemPreview": [m["alias"] for m in product["mounts"]]}

    multiplier = b140_multiplier(db)
    effects = {}
    for alias, row in aliases.items():
        code, a, b = row["code"], row["DataA1"], row["DataB1"]
        if code == "AHad":
            assert b is None
            effects[alias] = {"armor": a}
        elif code == "AOae":
            effects[alias] = {"movementPct": round(100 * a) if a is not None else 0,
                              "attackSpeedPct": round(100 * b) if b is not None else 0}
        else:
            assert b == row["DataC1"] == 1 and row["DataD1"] is None
            effects[alias] = {"attackPct": round(100 * a)}
    effects["I264"]["damagePct"] = round((multiplier - 1) * 100)
    assert len(workbook_items) == 243 and (len(aliases), len(records), len(books)) == (10, 7, 6)
    assert sum(len(r["mounts"]) for r in records.values()) == 10
    for item in (*records.values(), *books.values()):
        active = [r["alias"] for r in item["mounts"]] if "mounts" in item else item["webFinishedItemPreview"]
        for excerpt in (item["workbookNumbers"], item["objectTooltipNumbers"]):
            if excerpt is None:
                continue
            assert excerpt["radius"] == sorted({int(aliases[alias]["Area1"]) for alias in active}), (item["id"], excerpt)
            for key, values in excerpt.items():
                if key != "radius":
                    assert set(values) <= {effects[alias][key] for alias in active if key in effects[alias]}, (item, excerpt)
    assert records["i270"]["workbookNumbers"]["damagePct"] == [20] and not books["i271"]["workbookNumbers"]["damagePct"]

    return {
        "baselineId": "item-auras-batch-01",
        "status": "bounded_source_audit_and_Q24_Web_selection",
        "coverage": {"workbookItems": len(workbook_items), "aliases": len(aliases), "items": len(records),
                     "aliasesByCode": dict(Counter(row["code"] for row in aliases.values())),
                     "directOccurrences": 10, "indirectOccurrences": 0, "recipeBooks": len(books)},
        "aliases": {alias: {**row, "web": effects[alias]} for alias, row in aliases.items()},
        "items": list(records.values()), "recipeBooks": list(books.values()),
        "dependencies": ["hero-aura-family", "weapon-attribute-interface-v1", "attack-timing", "native-armor-and-xp",
                         "pathing-and-placement", "item-lifecycle-v1", "creep-damage-auras-v1"],
        "webRule": {"buffGroups": "Same Buff strongest, based on absolute effect for reductions; different groups use their existing channels.",
                    "lifecycle": "Hero aura eligibility and closed radius. Recompute after real mount or removal before item callbacks, then on range, team, capability or state change. No residue or replay on load.",
                    "sapper": "Flag receivers follow the source SAPPER selector with the allied eligibility requirement.",
                    "B140": {"actualDamageSourceRegister": "r0", "factor": multiplier, "bytecodeLines": [163733, 163746]}},
        "pendingMechanism": [], "originalClientTested": False,
        "verification": probes(effects, multiplier),
    }


def b140_multiplier(db):
    code = source.instructions(db, "main/f291/f1", 1178, 1191)
    assert [r["op"] for r in code] == [
        "gettabup", "move", "gettabup", "loadk", "call", "call", "lt",
        "jmp", "gettabup", "gettabup", "loadk", "call", "mul", "call"
    ]
    assert code[1]["args"] == ["r5", "r0"]
    assert code[7]["jumpTargets"] == {"l1192": 1192}
    values = [v["value"] for row in code for v in row["constants"].values()]
    assert values == ["GetUnitAbilityLevel", "GetId", "B140", 0, "EXSetEventDamage", "GetEventDamage", 0, 1.2]
    return values[-1]


def probes(effects, multiplier):
    attack = lambda *sources: max(effects[a]["attackPct"] for a in sources) + effects["I231"]["attackPct"]
    before, after = attack("I208", "I212"), attack("I208", "I208")
    armor = -max(abs(effects["I262"]["armor"]), 100) + effects["I216"]["armor"] - 50
    # Flag weapon percent multiplies basis; B140 later reads actual source's current event amount.
    current_event_amount = 100 * (1 + effects["I264"]["attackPct"] / 100) + 40
    with_flag = current_event_amount * multiplier
    without_actual_source_buff = current_event_amount
    assert (before, after, armor, with_flag, without_actual_source_buff) == (45, 35, -180, 228, 190)
    return {"B033WithB056AndFallbackPct": [before, after], "B008WithB044AndB150": armor,
            "flagWeaponThenDamageOnActualSource": [with_flag, without_actual_source_buff]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    with closing(source.connect()) as db:
        start = time.perf_counter()
        report = evidence(db)
        elapsed = (time.perf_counter() - start) * 1000
    content = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.write:
        OUT.write_text(content)
    else:
        assert OUT.read_text() == content, f"{OUT.name} differs from indexed sources"
    print(f"{report['coverage']}; 3 Web probes passed; indexed verification {elapsed:.2f} ms")


if __name__ == "__main__":
    main()
