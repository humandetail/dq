#!/usr/bin/env python3
"""Extract indexed box/bag reward pools and replay representative weighted draws."""

import argparse
from collections import Counter
from contextlib import closing
from fractions import Fraction
import json
import runpy
import sys

sys.dont_write_bytecode = True
import audit_index as source

OUT = source.ROOT / "docs/rules/item-reward-packs-batch-01.json"
CARDS = {f"i00{index}": f"I00{index}" for index in range(1, 7)}
BOX_KEYS = {f"i41{tier}": f"i40{tier}" for tier in range(1, 5)}
PACKS = {**CARDS, **dict.fromkeys(BOX_KEYS, "I210"), "i237": "I240"}
SHEET = "装备与道具"


def workbook_item(db, item):
    records = [row for row in source.workbook_rows(db, item, SHEET) if row["cells"][1] == item]
    assert len(records) == 2 and records[0]["cells"][:8] == records[1]["cells"][:8], item
    return records[0]


def objects(db):
    items = {}
    for item, alias in PACKS.items():
        row = workbook_item(db, item)
        obj, = source.objects(db, item, "units_itemdata")
        ability, = source.objects(db, alias, "units_abilitydata")
        fields = ability["fields"]
        overrides = {m["key"]: m["value"] for r in source.objects(db, item, "war3map.w3t") for m in r["fields"]["mods"]}
        assert "iabi" not in overrides and not source.objects(db, alias, "war3map.w3a")
        assert obj["fields"]["abilList"] == alias and obj["fields"]["usable"] == 1
        assert fields.get("DataA1") is None
        if item in CARDS:
            assert fields["code"] == "AIgo" and obj["fields"]["uses"] == obj["fields"]["perishable"] == 1
            assert obj["fields"]["cooldownID"] == "AIhe"
        else:
            assert fields["code"] == "AIfs" and fields.get("DataB1") is None and fields["Cool1"] == 1
            assert obj["fields"].get("uses") is None
            assert (fields["DataC1"], fields["DataD1"]) == ("nsce", "nsca")
            assert obj["fields"]["cooldownID"] == ("AUdp" if item in BOX_KEYS else "I240")
        items[item] = {
            "alias": alias, "componentReady": True, "name": row["cells"][0], "workbookCell": f"{SHEET}!H{row['row']}",
            "itemJsonIndex": obj["jsonIndex"], "abilityJsonIndex": ability["jsonIndex"], "family": fields["code"],
            "cooldownID": obj["fields"]["cooldownID"], "cooldown": fields.get("Cool1"),
            "charges": obj["fields"].get("uses"), "nativeGold": 0, "nativeSummons": 0,
            "callbackReady": ["Item_Use"] if item not in CARDS else [],
        }
    for key, box in BOX_KEYS.items():
        row = workbook_item(db, box)
        obj, = source.objects(db, box, "units_itemdata")
        assert (obj["fields"].get("abilList") or "_") == "_"
        items[key].update(targetBox=box, targetBoxWorkbookCell=f"{SHEET}!H{row['row']}")
    return items


def extract_pools(db, execute):
    rows = source.instructions(db, "main/f285", 1656, 1881)
    assert (rows[0]["sourceLine"], rows[-1]["sourceLine"]) == (142771, 142996)
    assert {row["op"] for row in rows} == {"newtable", "loadk", "setlist"}
    instructions = [{"raw": " ".join((row["op"], *row["args"]))} for row in rows] + [{"raw": "return r0 1"}]
    constants = {key: value for row in rows for key, value in row["constants"].items()}
    _, registers = execute({"function": "main/f285:reward-constructors", "instructions": instructions, "constants": constants},
                           [{"GetId": lambda raw_id: raw_id}], capture=True)
    return dict(zip((*BOX_KEYS.values(), "i237"), (registers[index] for index in range(7, 12))))


def value_probabilities(db, pools):
    result = {}
    for item, pool in pools.items():
        total = sum(group[1] for group in pool.values())
        groups = [{"weight": group[1], "entries": [group[k] for k in range(2, len(group) + 1)]} for group in pool.values()]
        chances = Counter()
        for group in groups:
            assert group["weight"] > 0 and group["entries"]
            for prize in group["entries"]:
                assert source.objects(db, prize, "units_itemdata"), prize
                chances[prize] += Fraction(group["weight"], total * len(group["entries"]))
        assert sum(chances.values()) == 1
        result[item] = {"totalWeight": total, "orderedGroups": groups,
                        "exactProbability": {prize: str(chance) for prize, chance in sorted(chances.items())}}
    return result


def probe_handlers(db, vm, pools):
    execute, function = vm["execute"], vm["function"]
    calls = []
    ends = False

    def ordered_pairs(table):
        def next_entry(state, previous):
            key = 1 if previous is None else previous + 1
            return (key, state[key]) if key in state else (None, None)
        return next_entry, table, None

    def draw(lower, upper):
        calls.append(["draw", lower, upper])
        return upper if ends else lower

    env = {
        "pairs": ordered_pairs, "GetManipulatingUnit": lambda: "unit", "GetRandomInt": draw,
        "UnitAddItem": lambda *args: calls.append(["deliver", *args]),
        "CreateItem": lambda *args: calls.append(["create", *args]) or args[0], "GetId": lambda i: i,
        "GetUnitX": lambda unit: 10, "GetUnitY": lambda unit: 20, "GetPlayerNameStr": lambda player: "player",
        "GetOwningPlayer": lambda unit: 0, "DisplayTextToAll": lambda text, seconds: calls.append(["announce", seconds]),
    }
    names = {"EXGetItemDataString": lambda rawid, key: rawid}
    checks = {}
    for item in ("i401", "i237"):
        pool = pools[item]
        helper = "main/f254/f0" if item == "i237" else "main/f279/f0"
        for ends in (False, True):
            calls.clear()
            execute(function(helper), [env, names], (pool,) if item == "i237" else (item, pool))
            group = pool[len(pool) if ends else 1]
            prize = group[len(group) if ends else 2]
            assert calls == [["draw", 1, sum(entry[1] for entry in pool.values())],
                             ["draw", 2, len(group)], ["create", prize, 10, 20],
                             ["deliver", "unit", prize], ["announce", 5]], calls
            checks[f"{item}:{'last' if ends else 'first'}"] = calls.copy()
    return checks


def report(db):
    items = objects(db)
    vm = runpy.run_path(str(source.ROOT / "tools/audit-divine-books.py"))["runtime"](db)
    pools = extract_pools(db, vm["execute"])
    results = value_probabilities(db, pools)
    assert results["i237"]["totalWeight"] == 80
    assert results["i237"]["exactProbability"]["i005"] == "2/7"
    return {
        "baselineId": "item-reward-packs-batch-01",
        "coverage": {"attachedComponentsReady": len(items), "uniqueAliasesReady": len(set(PACKS.values())),
                     "distinctAttachedItems": len(items), "linkedChests": 4, "attachedComponentsRemaining": 0},
        "items": items, "pools": results, "matchedChestLinks": BOX_KEYS,
        "sources": {"pools": [142771, 142996], "boxUse": [146775, 146946], "abyssUse": [147038, 147052],
                    "boxDraw": [136909, 137060], "abyssDraw": [129123, 129261], "cardsSpell": [143792, 143967]},
        "verification": probe_handlers(db, vm, pools),
    }


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
    print(data["coverage"], len(data["verification"]), "original weighted paths passed")


if __name__ == "__main__":
    main()
