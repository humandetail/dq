#!/usr/bin/env python3
"""Audit the item-mounted AOcl command shells and their indexed script dispatch."""

import argparse
from contextlib import closing
import json
import sys
import time

sys.dont_write_bytecode = True
import audit_index as source

RULES = source.ROOT / "docs/rules"
OUT = RULES / "item-targeted-books-batch-01.json"
SHEET = "装备与道具"
DISPATCH = "main/f285/f6"
CASES = {
    "I167": ("i127", "I167_Acition", 173, "experience-sharing/X03", "1400经验值"),
    "I168": ("i128", "I168_Acition", 181, "experience-sharing/X03", "1个等级"),
    "I226": ("i312", "I226_Acition", 189, "experience-sharing/X03", "2000经验值"),
    "I227": ("i313", "I227_Acition", 197, "experience-sharing/X03", "20000经验值"),
    "I228": ("i314", "I228_Acition", 205, "experience-sharing/X03", "提升英雄一个等级"),
    "I253": ("i258", "i258_SkillRandom", 497, 7, "发生形态变化"),
    "I254": ("i259", "i258_StarUp", 507, 8, "有概率提升失败"),
    "I255": ("i260", "i258_StarRandom", 527, 10, "随机拥有一个星级"),
    "I260": ("i264", "i264_StarUp", 517, 9, "必定成功"),
}


def check_dispatch(db, alias, handler, pc, pending):
    code = source.instructions(db, DISPATCH, pc - 1, pc + (8 if pending else 6))
    assert [r["op"] for r in code] == [
        "gettabup", "loadk", "call", "eq", "jmp", "gettabup",
        *(["move", "move"] if pending else []), "call", "return"
    ]
    assert [v["value"] for row in code for v in row["constants"].values()] == ["GetId", alias, handler]
    if pending:
        assert [r["args"] for r in code[6:8]] == [["r5", "r2"], ["r6", "r3"]]
    return [code[0]["sourceLine"], code[-1]["sourceLine"]]


def module_pair(db, suffix):
    functions = [f"main/f{number}/f{suffix}" for number in (225, 258)]
    code = [source.instructions(db, function, 1, 1000) for function in functions]
    normalized = [[(r["op"], r["args"], {key: v["value"] for key, v in r["constants"].items()}, r["jumpTargets"])
                   for r in rows] for rows in code]
    assert normalized[0] == normalized[1]
    return {"functions": functions, "instructionCountEach": len(code[0]),
            "lines": [[rows[0]["sourceLine"], rows[-1]["sourceLine"]] for rows in code]}


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
          AND json_extract(fields,'$.code') IN ('AOcl','Aspb')
    """)
    abilities = {alias: (index, json.loads(data)) for alias, index, data in ability_rows}
    assert not source.objects(db, "AOcl", "war3map.w3a", aliases=True)
    items = {item: (index, json.loads(data)) for item, index, data in db.execute("""
        SELECT object_id,row_no-1,fields FROM object_row WHERE source='reference/map-6.25/units_itemdata.json'
    """)}
    overrides = {row[0] for row in db.execute("""
        SELECT object_id FROM object_row, json_each(fields,'$.mods')
        WHERE source='reference/map-6.25/war3map.w3t.json' AND json_extract(value,'$.key')='iabi'
    """)}
    lifecycle = json.loads((RULES / "item-lifecycle.json").read_text())["tables"]
    first = source.instructions(db, DISPATCH, 1, 6)
    assert [v["value"] for row in first for v in row["constants"].values()] == [
        "GetSpellAbilityId", "GetTriggerUnit", "GetSpellTargetUnit"
    ]
    records = []
    workbook_items = 0
    for n, (name, item, kind, *_, description) in repo.items():
        if n < 5 or not item:
            continue
        workbook_items += 1
        assert item not in overrides
        index, data = items[item]
        tokens = [part.strip() for part in data.get("abilList", "").split(",")]
        for alias in tokens.copy():
            row = abilities.get(alias)
            if row and row[1]["code"] == "Aspb":
                tokens.extend(row[1]["DataA1"].split(","))
        mounts = [alias for alias in tokens if alias in abilities and abilities[alias][1]["code"] == "AOcl"]
        if not mounts:
            continue
        alias, = mounts
        item_id, handler, pc, effect, phrase = CASES[alias]
        ability_index, fields = abilities[alias]
        assert item_id == item and data["abilList"] == alias == data["cooldownID"]
        assert kind != "制作书" and phrase in description
        assert fields["levels"] == 1 and fields["targs1"] == "invulnerable,hero,friend"
        assert fields["Area1"] == 500 and fields["Rng1"] == 999999
        assert all(fields.get(key) is None for key in ("DataA1", "DataB1", "DataC1", "DataD1", "Cost1"))
        assert not source.objects(db, alias, "war3map.w3a")
        reusable = alias in {"I226", "I227", "I228"}
        assert fields.get("Cool1") == (180 if reusable else None)
        expected_item_flags = (None, None, 1) if reusable else (1, 1, 1)
        assert (data.get("uses"), data.get("perishable"), data["usable"]) == expected_item_flags
        pending = isinstance(effect, int)
        records.append({
            "id": item, "name": name, "workbookCell": f"{SHEET}!H{n}", "alias": alias,
            "script": {"handler": handler, "dispatchLines": check_dispatch(db, alias, handler, pc, pending),
                       **({"sourceModulePair": module_pair(db, effect)} if pending else {"existingRule": effect})},
            "sources": {"itemObjectJsonIndex": index, "abilityObjectJsonIndex": ability_index,
                        "native": {key: fields.get(key) for key in ("targs1", "Rng1", "Area1", "Cool1", "Cost1",
                                                                    "DataA1", "DataB1", "DataC1", "DataD1")},
                        "item": {key: data.get(key) for key in ("uses", "usable", "perishable", "cooldownID")}},
            "componentsReady": ["single-target command and dispatch", "L03 use/cooldown/charges", "zero native chain damage",
                                *([] if pending else ["direct XP and level effect per experience-sharing/X03–X04"])],
            "componentsRemaining": ["P200/P201–P222 transformation or star effect"] if pending else [],
            "mergesChargesOnPickup": item in lifecycle["stackMerge"]["ids"],
            "recipe": next(({k: r[k] for k in ("materials", "sourceLines", "workbook")}
                            for r in lifecycle["recipes"] if r["result"] == item), None),
        })

    assert workbook_items == 243 and {r["alias"] for r in records} == set(CASES)
    assert sum(not r["componentsRemaining"] for r in records) == 5
    return {
        "baselineId": "item-targeted-books-batch-01", "status": "bounded_source_audit_and_Q24_Web_selection",
        "coverage": {"workbookItems": workbook_items, "aliases": 9, "uniqueItems": 9, "recipeBookMounts": 0,
                     "commandShellsReady": 9, "itemCastEffectsReady": 5, "itemCastEffectsRemaining": 4},
        "items": records,
        "webRule": {"target": "One valid living friendly native hero. Keep caster, target and item context under L03.",
                    "geometry": "Targeted range 999999. Area 500 is an unused chain field. No combat projectile, secondary target, damage or hit roll.",
                    "nativeCost": "Zero mana and zero cooldown for source omissions. Knowledge volumes use their explicit alias cooldownID and 180 seconds.",
                    "hooks": "Use existing AnySkillStart ordering. I167/I168 are present in IsUseless for Item_Skill_Action."},
        "candidate": {"scope": "Shared P200/P201–P222 transformation, star draws, swaps and downstream effects",
                      "items": ["i258", "i259", "i260", "i264"], "refundHelper": module_pair(db, 5),
                      "sourceEvidence": "The rejection helper creates a fresh same-type item at caster position and attempts delivery."},
        "dependencies": ["item-lifecycle-v1/L03-L04", "experience-sharing/X03-X04", "skill-essence-aura-proc", "summon-and-delivery"],
        "originalClientTested": False,
    }


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
        assert OUT.read_text() == content, f"{OUT.name} differs from indexed source"
    print(f"{report['coverage']}; indexed verification {elapsed:.2f} ms")


if __name__ == "__main__":
    main()
