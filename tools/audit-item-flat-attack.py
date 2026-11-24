#!/usr/bin/env python3
"""Cross-check the two workbooks and static AIat records; run bounded Web probes."""

import argparse
import ast
from collections import Counter
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import re
import sys

from openpyxl import load_workbook

sys.dont_write_bytecode = True
from build_map_reference import ROOT, SOURCE, parse_slk

OUT = ROOT / "docs/rules/item-flat-attack.json"
SHEET = "装备与道具"
ATTACK = re.compile(r"(?:增加|提高(?:英雄)?)\s*(\d+)\s*点攻击(?:力)?")
DEFAULT_ORIGINAL = Path.home() / "Downloads/刀圈TD 6.25 图鉴.xlsx"


def load_tool(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "tools" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def workbook_rows(path):
    book = load_workbook(path, read_only=True)
    try:
        return list(book[SHEET].iter_rows(min_col=1, max_col=8, values_only=True))
    finally:
        book.close()


def slk_table(name, key):
    path = SOURCE / (name + ".slk")
    rows = parse_slk(path)
    assert rows == json.loads(path.with_suffix(".json").read_text()), name
    positions = {}
    for line_number, line in enumerate(path.read_text().splitlines(), 1):
        match = re.fullmatch(r'C;X1;Y(\d+);K"([^"]+)"', line)
        if match:
            positions[match[2]] = {"row": int(match[1]), "line": line_number}
    table = {row[key]: row for row in rows}
    assert len(table) == len(rows)
    return table, positions


def object_overrides(name):
    entries = json.loads((SOURCE / (name + ".json")).read_text())
    return {row["old"] if row["new"] == "\x00" * 4 else row["new"]: row["mods"] for row in entries}


def scan_scripts(aliases):
    # GetId assembles the first four bytes in big-endian order in main/f7/f0.
    numbers = {int.from_bytes(alias.encode(), order) for alias in aliases for order in ("big", "little")}
    literals = re.compile(r'\b(?:' + "|".join(aliases) + r')\b')
    natives = re.compile(r'^\.constant\s+\S+\s+"((?:EXSetAbilityData|(?:EX|Blz)?GetItemAbility|EXSetItemData)\w*)"')
    alias_prefixes = {alias[:length] for alias in aliases for length in range(1, 4)}
    mutation_candidates = {}
    disassembly = (SOURCE / "main.disasm").read_text()
    for number, line in enumerate(disassembly.splitlines(), 1):
        if not line.startswith(".constant"):
            continue
        literal = line.split(None, 2)[2]
        assert not literals.search(literal), (number, literal)
        assert literal[1:-1] not in alias_prefixes, (number, literal)
        if re.fullmatch(r"-?(?:\d+|0[xX][0-9a-fA-F]+)", literal):
            value = ast.literal_eval(literal)
            assert value & 0xFFFFFFFF not in numbers, (number, literal)
        match = natives.match(line)
        if match:
            mutation_candidates.setdefault(match[1], []).append(number)
    assert mutation_candidates == {"EXSetAbilityDataReal": [108274], "EXSetItemDataString": [152608]}
    jass = (SOURCE / "war3map.j").read_text()
    assert not literals.search(jass)
    jass_numbers = re.findall(r"\b(?:0[xX][0-9a-fA-F]+|\d+)\b|\$[0-9a-fA-F]+", jass)
    assert not any(int(value.lstrip("$"), 16 if value.startswith(("$", "0x", "0X")) else 10) in numbers
                   for value in jass_numbers)
    return {
        "aliasLiteralHits": 0, "rawcodeIntegerHits": 0,
        "shortQuotedAliasPrefixHits": 0,
        "GetId": {"function": "main/f7/f0", "registrationLines": [49488, 49490],
                  "lines": [50362, 50408]},
        "StringTypeID": {"function": "main/f7/f56", "lines": [52891, 52934]},
        "mutationCandidates": mutation_candidates,
        "reviewedCandidates": [
            {"lines": [108313, 108343], "target": "q056/T286", "operation": "rewrite two ability real fields"},
            {"lines": [152661, 152681], "target": "i546", "operation": "rewrite Art/Ubertip/Name"},
        ],
        "stringFormat": {"lines": [195469, 195514], "purpose": "format numbers with 亿/万 suffixes"},
        "boundary": "Static literal, rawcode and candidate API scans plus review of ID conversion and targeted item gates. Computed or external opaque native inputs are not excluded by the literal scan.",
    }


def read_evidence(original):
    rows = workbook_rows(ROOT / "图鉴.xlsx")
    assert rows == workbook_rows(original), "两份图鉴《装备与道具》A–H 不一致"
    assert rows[3] == ("名称", "ID", "种类", "金币对象值", "木材对象值", "脚本配方", "已核对的获取途径", "效果")
    items, item_positions = slk_table("units_itemdata", "itemID")
    abilities, ability_positions = slk_table("units_abilitydata", "alias")
    ability_overrides = object_overrides("war3map.w3a")
    item_overrides = object_overrides("war3map.w3t")
    records, books, ids = [], [], set()
    for row_number, row in enumerate(rows[4:], 5):
        name, item_id, category, _, _, _, _, description = row
        if not item_id:
            continue
        assert item_id not in ids
        ids.add(item_id)
        source_item = items[item_id]
        mods = item_overrides.get(item_id, [])
        assert not any(mod["key"] == "iabi" for mod in mods), item_id
        source_list = source_item.get("abilList")
        tokens = source_list.split(",") if source_list else []
        flat_aliases = [token for token in tokens if abilities.get(token, {}).get("code") == "AIat"]
        attack_values = ATTACK.findall(description or "")
        workbook = {"row": row_number, "cell": f"{SHEET}!H{row_number}", "effect": description}
        if not flat_aliases:
            if attack_values:
                assert category == "制作书", (item_id, category)
                books.append({"id": item_id, "name": name, "workbook": workbook, "sourceAbilList": source_list})
            continue
        assert category != "制作书" and len(attack_values) == 1, (item_id, attack_values)
        flat = [{"alias": alias, "DataA1": abilities[alias]["DataA1"]} for alias in flat_aliases]
        tooltip = next((mod["value"] for mod in mods if mod["key"] == "utub"), None)
        if tooltip is not None:
            assert ATTACK.findall(tooltip) == attack_values, item_id
        records.append({
            "id": item_id, "name": name, "workbook": workbook,
            "sourceItemSlk": item_positions[item_id],
            "sourceAbilList": source_list, "orderedMounts": flat,
            "sourceOccurrenceSum": sum(mount["DataA1"] for mount in flat),
            "w3tOverrideKeys": [mod["key"] for mod in mods],
            "w3tTooltip": tooltip,
            "webFlatAttack": int(attack_values[0]),
        })
    mounts = Counter(mount["alias"] for row in records for mount in row["orderedMounts"])
    assert (len(ids), len(records), len(books), len(mounts), mounts.total()) == (243, 31, 20, 13, 43)
    assert sum(bool(row["w3tOverrideKeys"]) for row in records) == 24
    assert not set(mounts) & ability_overrides.keys()
    assert all(abilities[alias]["levels"] == 1 for alias in mounts)
    conflicts = [row for row in records if row["sourceOccurrenceSum"] != row["webFlatAttack"]]
    assert [(row["id"], row["sourceOccurrenceSum"], row["webFlatAttack"]) for row in conflicts] == [("i115", 80, 60)]
    assert items["i147"]["abilList"] == "I250, I145"
    return {
        "workbook": {"sheet": SHEET, "columns": "A:H", "rowsCompared": len(rows), "itemRows": len(ids), "bothBooksMatch": True},
        "slkDecodedRowsCompared": {"units_itemdata": len(items), "units_abilitydata": len(abilities)},
        "aliases": {alias: {"sourceSlk": ability_positions[alias], "sourceFields": abilities[alias],
                            "w3aOverride": None, "mountOccurrences": mounts[alias]} for alias in sorted(mounts)},
        "items": records, "recipeBooksWithoutAIat": books,
        "numericOverride": {"id": "i115", "sourceOccurrenceSum": 80, "webFlatAttack": 60, "authority": "2026-11-23 workbook priority"},
        "scriptScan": scan_scripts(sorted(mounts)),
        "otherFamilyWhitespaceExample": {"id": "i147", "sourceAbilList": items["i147"]["abilList"]},
    }


def probes(rows):
    WeaponFields = load_tool("audit-weapon-fields").WeaponFields
    World = load_tool("audit-item-lifecycle").World
    flat_attack = {row["id"]: row["webFlatAttack"] for row in rows}
    results = []

    def verify(name, actual, expected):
        assert actual == expected, (name, actual, expected)
        results.append({"name": name, "expected": expected, "actual": actual})

    class ProbeWorld(World):
        """Project scoped inventory at original script event boundaries in the L01 test double."""

        def __init__(self, qual=True):
            super().__init__()
            self.unit(qual=qual)
            self.weapon = WeaponFields(flat=0)
            self.views = []

        def refresh_weapon(self):
            instances = set(self.units["U"]["bag"].values())
            self.weapon.flat = sum(flat_attack.get(self.typeof(item), 0) for item in instances)

        def event(self, kind, unit, item=None, **extra):
            self.refresh_weapon()
            self.views.append([kind, self.typeof(item), int(self.weapon.flat)])
            return super().event(kind, unit, item, **extra)

    world = ProbeWorld()
    # X=240, average and example roll D=6; setter adds a J19 residual of 13.
    world.weapon.set(19, 136)
    axe = world.create("i115")
    sword = world.create("i117")
    world.add("U", axe)
    world.add("U", sword)
    world.add("U", world.create("i117"))
    verify("distinct instances of the same type and equal aliases", world.views, [
        ["PICKUP", "i115", 60], ["PICKUP", "i117", 80], ["PICKUP", "i117", 100],
    ])
    verify("fixed F is outside P and leaves J19 intact",
           [world.weapon.get(18), world.weapon.get(19), world.weapon.roll(6), int(world.weapon.j19)],
           [240, 236, 482, 13])
    world.weapon.pct = 0
    verify("remove aura without changing F or J19",
           [int(world.weapon.flat), world.weapon.get(19), world.weapon.roll(6)], [100, 113, 359])
    world.slot("U", axe, 1)
    world.refresh_weapon()
    verify("slot swap does not fire another item event", [len(world.views), int(world.weapon.flat)], [3, 100])
    saved = world.weapon.snapshot()
    loaded = ProbeWorld()
    loaded.units, loaded.items = deepcopy((world.units, world.items))
    loaded.weapon = WeaponFields.restore(saved)
    loaded.weapon.flat = 0
    loaded.refresh_weapon()
    verify("restore inventory and rebuild F with no replay", [loaded.weapon.snapshot(), loaded.views], [saved, []])
    world.drop("U", sword)
    verify("drop removes just one instance before event", world.views[-1], ["DROP", "i117", 80])

    world = ProbeWorld()
    world.add("U", world.create("i115"))
    world.add("U", world.create("i140"))
    verify("different items sharing I135 retain separate workbook amounts",
           world.views, [["PICKUP", "i115", 60], ["PICKUP", "i140", 140]])

    world = ProbeWorld()
    for _ in range(6):
        world.seed("U", "i117")
    world.refresh_weapon()
    item = world.create("i115")
    verify("full inventory never mounts ground item",
           [world.add("U", item), world.attr(item, "owner"), int(world.weapon.flat), world.views],
           [False, None, 120, []])

    world = ProbeWorld(qual=False)
    world.add("U", world.create("i304"))
    verify("script qualification rejects after transient mount", world.views, [
        ["PICKUP", "i304", 800], ["DROP", "i304", 0],
    ])
    world = ProbeWorld()
    world.add("U", world.create("i322"))
    world.add("U", world.create("i322"))
    verify("script unique group rejects duplicate item", world.views, [
        ["PICKUP", "i322", 180], ["PICKUP", "i322", 360], ["DROP", "i322", 180],
    ])

    world = ProbeWorld()
    world.seed("U", "i140")
    world.seed("U", "i139")
    world.add("U", world.create("i139"))
    verify("nested recipes remove material and mount result once", world.views, [
        ["PICKUP", "i139", 80], ["DROP", "i139", 80], ["DROP", "i140", 0],
        ["PICKUP", "i135", 85], ["DROP", "i139", 85], ["DROP", "i135", 0], ["PICKUP", "i136", 85],
    ])
    verify("nested recipes final inventory", [[v[1] for v in world.inventory()], int(world.weapon.flat)], [["i136"], 85])
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--original-workbook", type=Path, default=DEFAULT_ORIGINAL)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    evidence = read_evidence(args.original_workbook)
    data = {
        "baselineId": "item-flat-attack-v1",
        "status": "bounded_source_audit_and_Q24_Web_selection",
        "dependencies": ["item-lifecycle-v1/L01-L09", "weapon-attribute-interface-v1/W01-W03"],
        "webRule": {
            "authority": "Q24, scoped to the 31 listed types after source review",
            "contribution": "Sum one workbook-selected fixed F amount per actually mounted eligible item instance. Repeated aliases stay in source data. Preserve original admission and rejection handlers.",
            "ordering": "Attach before PICKUP, detach before DROP, recompute before the next observable read. Swap is event-free. Rebuild from restored mounted instances without replaying events or resetting J19.",
            "scope": "Passive fixed F only. Other attached capabilities, bear or illusion inheritance, death inventory rules and all AIab variants remain separate.",
        },
        **evidence,
        "verification": {"kind": "original script bytecode at event boundaries with Web native doubles and W01/W02 arithmetic", "cases": probes(evidence["items"])},
    }
    rendered = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if args.write:
        OUT.write_text(rendered)
    else:
        assert OUT.read_text() == rendered, "item-flat-attack.json differs from audited input"
    print(f"243 workbook rows, 31 items, 13 aliases, 43 occurrences, 20 recipe books, {len(data['verification']['cases'])} probes")


if __name__ == "__main__":
    main()
