#!/usr/bin/env python3
"""Verify item AIab mounts and exercise their Web attribute interface."""

import argparse
from collections import Counter
from copy import deepcopy
from fractions import Fraction
from importlib import import_module
import json
from pathlib import Path
import re
import sys

sys.dont_write_bytecode = True
flat = import_module("audit-item-flat-attack")
OUT = flat.ROOT / "docs/rules/item-attributes.json"
ATTRIBUTES = ("力量", "敏捷", "智力")
FIELDS = ("DataC1", "DataA1", "DataB1")
ZERO = [0, 0, 0]
CLAUSE = re.compile(
    r"(?:增加|提高)(?:英雄)?\s*(?:(\d+)点(力量与敏捷|力量|敏捷|智力|全属性)|全属性(\d+)点)"
    r"(?=[。，与\s]|$)"
)
CONTINUATION = re.compile(r"^，\s*(\d+)点(力量|敏捷|智力)")


def described_stats(description):
    description = re.sub(r"\|c[0-9a-fA-F]{8}|\|r", "", description or "").replace("|n", "\n")
    stats = {}

    def record(number, attributes):
        for attribute in attributes:
            assert attribute not in stats, (description, attribute)
            stats[attribute] = int(number)

    for match in CLAUSE.finditer(description):
        number, attribute, reversed_number = match.groups()
        if reversed_number or attribute == "全属性":
            record(number or reversed_number, ATTRIBUTES)
        elif attribute == "力量与敏捷":
            record(number, ATTRIBUTES[:2])
        else:
            record(number, (attribute,))
        rest = CONTINUATION.match(description[match.end():])
        if rest:
            record(rest[1], (rest[2],))
    return [stats.get(attribute, 0) for attribute in ATTRIBUTES]


def evidence(original):
    rows = flat.workbook_rows(flat.ROOT / "图鉴.xlsx")
    assert rows == flat.workbook_rows(original), "两份图鉴《装备与道具》A–H 不一致"
    assert rows[3] == ("名称", "ID", "种类", "金币对象值", "木材对象值", "脚本配方", "已核对的获取途径", "效果")
    items, item_positions = flat.slk_table("units_itemdata", "itemID")
    abilities, ability_positions = flat.slk_table("units_abilitydata", "alias")
    w3a = flat.object_overrides("war3map.w3a")
    w3t = flat.object_overrides("war3map.w3t")
    relevant_bases = {"AIab", "Aspb"} | {alias for alias, row in abilities.items()
                                       if row.get("code") in ("AIab", "Aspb")}
    deltas = json.loads((flat.SOURCE / "war3map.w3a.json").read_text())
    attribute_delta_ids = {row["new"] for row in deltas if row["old"] in relevant_bases
                           and row["new"] != "\x00" * 4}
    lifecycle = json.loads((OUT.parent / "item-lifecycle.json").read_text())
    recipes = lifecycle["tables"]["recipes"]
    records, books, ids = {}, {}, set()
    wrappers, whitespace = {}, []
    for row_number, row in enumerate(rows[4:], 5):
        name, item_id, category, _, _, _, _, description = row
        if not item_id:
            continue
        assert item_id not in ids
        ids.add(item_id)
        source_list = items[item_id].get("abilList")
        mods = w3t.get(item_id, [])
        iabi = [mod for mod in mods if mod["key"] == "iabi"]
        assert not iabi, (item_id, iabi)
        tokens = source_list.split(",") if source_list else []
        mounts = []

        def add_mount(alias, path):
            source = abilities[alias]
            assert source["code"] == "AIab" and source["levels"] == 1 and alias not in w3a, alias
            mounts.append({"alias": alias, "path": path, "DataFields": {f: source.get(f) for f in FIELDS}})

        for index, token in enumerate(tokens, 1):
            alias = "I145" if (item_id, token) == ("i147", " I145") else token
            if alias != token:
                whitespace.append({"id": item_id, "index": index, "raw": token, "resolved": alias})
            # Whitespace on another AIab/Spell Book token requires explicit review.
            assert alias == alias.strip() or abilities.get(alias.strip(), {}).get("code") not in ("AIab", "Aspb")
            assert alias not in attribute_delta_ids, (item_id, alias)
            code = abilities.get(alias, {}).get("code")
            path = [{"alias": alias, "index": index, "raw": token}]
            if code == "AIab":
                add_mount(alias, path)
            if code == "Aspb":
                assert alias == "I280" and item_id in ("i330", "i332") and alias not in w3a
                children = abilities[alias]["DataA1"].split(",")
                assert children == ["I275", "I276", "I278"]
                wrappers[alias] = {"sourceSlk": ability_positions[alias], "sourceFields": abilities[alias],
                                   "w3aOverride": None, "orderedChildren": children}
                for child_index, child in enumerate(children, 1):
                    if abilities[child]["code"] == "AIab":
                        add_mount(child, path + [{"alias": child, "index": child_index, "raw": child}])
        workbook_stats = described_stats(description)
        tooltip = next((mod["value"] for mod in mods if mod["key"] == "utub"), None)
        tooltip_stats = described_stats(tooltip) if tooltip is not None else None
        if not mounts and workbook_stats == ZERO and tooltip_stats in (None, ZERO):
            continue
        if tooltip_stats is not None:
            assert tooltip_stats == workbook_stats, (item_id, tooltip_stats, workbook_stats)
        entry = {
            "id": item_id, "name": name, "kind": category,
            "workbook": {"row": row_number, "cell": f"{flat.SHEET}!H{row_number}", "effect": description,
                         "describedStats": workbook_stats},
            "sourceItemSlk": item_positions[item_id], "sourceAbilList": source_list,
            "w3tOverrideKeys": [mod["key"] for mod in mods], "w3tIabi": None,
            "w3tTooltip": tooltip, "w3tDescribedStats": tooltip_stats,
        }
        if mounts:
            assert category != "制作书" and workbook_stats != ZERO, item_id
            source_sum = [sum(mount["DataFields"][field] or 0 for mount in mounts) for field in FIELDS]
            records[item_id] = {**entry, "orderedMounts": mounts, "sourceOccurrenceSum": source_sum,
                                "webStats": workbook_stats}
        else:
            assert category == "制作书", item_id
            books[item_id] = {**entry, "orderedMounts": [], "webStats": ZERO}
    counts = Counter(m["alias"] for row in records.values() for m in row["orderedMounts"])
    direct = sum(len(m["path"]) == 1 for row in records.values() for m in row["orderedMounts"])
    duplicates = sum(len(row["orderedMounts"]) != len({m["alias"] for m in row["orderedMounts"]})
                     for row in records.values())
    assert (len(ids), len(records), len(books), len(counts), counts.total(), direct, duplicates) == (243, 86, 46, 39, 180, 178, 29)
    assert sum(row["w3tTooltip"] is not None for row in records.values()) == 66
    assert len(wrappers) == len(whitespace) == 1 and items["i147"]["abilList"] == "I250, I145"
    for item_id, book in books.items():
        outputs = dict.fromkeys(recipe["result"] for recipe in recipes if item_id in recipe["materials"])
        assert outputs and outputs.keys() <= records.keys(), (item_id, outputs)
        display = [0, 0, 16] if item_id == "i120" else book["workbook"]["describedStats"]
        product_name = book["name"].removeprefix("制作书-")
        base_outputs = [out for out in outputs if records[out]["name"] in (product_name, product_name + "Lv1")
                        or records[out]["name"].startswith(product_name + "(")]
        assert base_outputs and all(display == records[out]["webStats"] for out in base_outputs), (item_id, outputs, display)
        book.update(recipeOutputs=list(outputs), describedOutputs=base_outputs, webFinishedItemPreview=display)
    overrides = [row["id"] for row in records.values() if row["sourceOccurrenceSum"] != row["webStats"]]
    assert overrides == ["i172"]
    assert records["i172"]["sourceOccurrenceSum"] == [4, 4, 4] and records["i172"]["webStats"] == [3, 3, 3]
    assert books["i120"]["workbook"]["describedStats"] == [0, 0, 18] and records["i119"]["webStats"] == [0, 0, 16]
    assert (len(items), len(abilities)) == (743, 2224)
    return {
        "workbook": {"sheet": flat.SHEET, "columns": "A:H", "rowsCompared": len(rows), "itemRows": len(ids), "bothBooksMatch": True},
        "slkDecodedRowsCompared": {"units_itemdata": len(items), "units_abilitydata": len(abilities)},
        "coverage": {"equipmentAndItems": len(records), "recipeBooks": len(books), "aliases": len(counts),
                     "directOccurrences": direct, "indirectOccurrences": counts.total() - direct, "itemsWithRepeatedAlias": duplicates},
        "statOrder": ["STR", "AGI", "INT"],
        "aliases": {alias: {"sourceSlk": ability_positions[alias], "sourceFields": abilities[alias],
                            "w3aOverride": None, "mountOccurrences": counts[alias]} for alias in sorted(counts)},
        "spellBookWrappers": wrappers, "explicitWhitespaceAdaptations": whitespace,
        "items": list(records.values()), "recipeBooks": list(books.values()),
        "numericDecisions": [
            {"item": "i172", "sourceOccurrenceSum": [4, 4, 4], "webStats": [3, 3, 3],
             "authority": "2026-11-23 workbook priority; I160 unchanged"},
            {"item": "i119", "recipeBook": "i120", "sourceRecipeBookStats": [0, 0, 18],
             "webFinishedItemPreview": [0, 0, 16], "authority": "D01; recipe book mounts no AIab"},
        ],
        "scriptScan": flat.scan_scripts(sorted(counts)),
        "growth": {"table": lifecycle["tables"]["growth"], "register": [143119, 143121],
                   "countLookup": [143230, 143283], "pickupAddsHeldCharges": [144824, 144879],
                   "dropSubtractsCurrentCharges": [147316, 147374], "killCallback": [168947, 168949],
                   "killSelectAndWrite": [146114, 146241], "recipeChargeTransfer": [145115, 145206],
                   "fireHeartOpenClose": [135003, 135225],
                   "directions": "Script direct MAX_LIFE / MAX_MANA writes are distinct from STR and INT changes. Charges alone never reapply the direct write."},
        "guldan": {"spell": "I246", "dispatch": [144322, 144332], "function": "main/f257/f0",
                   "baseStatBranches": [129556, 129644],
                   "directions": "GetHero*(false) then SetHero*(..., true); base-stat result survives loss of i255's static +40 to all three."},
    }


def probes(records):
    lifecycle = flat.load_tool("audit-item-lifecycle")
    WeaponFields = flat.load_tool("audit-weapon-fields").WeaponFields
    item_stats = {row["id"]: row["webStats"] for row in records}
    results = []

    def verify(name, actual, expected):
        assert actual == expected, (name, actual, expected)
        results.append({"name": name, "expected": expected, "actual": actual})

    class World(lifecycle.World):
        """An attribute-interface test double around the existing item interpreter."""

        def __init__(self, qual=True, primary=0):
            super().__init__()
            self.unit(qual=qual)
            self.base = [100, 40, 40]
            self.natural = self.base.copy()
            self.equipment = ZERO.copy()
            self.primary = primary
            self.weapon = WeaponFields(primary=Fraction(self.base[primary] * 7, 5), flat=0)
            self.views = []
            self.units["U"]["state"].update(MAX_MANA=480, LIFE=500, MANA=100)
            for index, suffix in enumerate(("Str", "Agi", "Int")):
                self.env["GetHero" + suffix] = lambda u, bonuses, j=index: self.hero(j, bonuses)
                self.env["SetHero" + suffix] = lambda u, value, permanent, j=index: self.set_hero(j, value)
            self.env.update(UNIT_STATE_MANA="MANA", CreateTextByUnit=lambda *args: None,
                            TxShow=lambda *args: 0, CreateEffAtLoc=lambda *args: None)
            self.env["i246_Acition"] = lifecycle.Closure("main/f257/f0", [self.env])

        def hero(self, index, include_bonuses):
            return self.base[index] + (self.equipment[index] if include_bonuses else 0)

        def state(self, key):
            return self.units["U"]["state"][key]

        def setstate(self, unit, key, value):
            super().setstate(unit, key, value)
            if key in ("MAX_LIFE", "MAX_MANA"):
                current = key[4:]
                self.units[unit]["state"][current] = min(self.state(current), value)

        def derived(self, before):
            state = self.units["U"]["state"]
            for index, current, ratio, floor in [(0, "LIFE", 15, 1), (2, "MANA", 12, 0)]:
                limit = "MAX_" + current
                old_max = state[limit]
                state[limit] = max(floor, old_max + (self.hero(index, True) - before[index]) * ratio)
                if current == "LIFE" and state[current] == 0:
                    continue
                state[current] = min(state[limit], max(floor, state[current] + state[limit] - old_max))
            self.weapon.primary = Fraction(self.hero(self.primary, True) * 7, 5)

        def set_hero(self, index, value):
            before = [self.hero(j, True) for j in range(3)]
            self.base[index] = max(0, int(value))
            self.derived(before)

        def mounted(self):
            return [sum(item_stats.get(self.typeof(instance), ZERO)[index]
                        for instance in self.units["U"]["bag"].values()) for index in range(3)]

        def event(self, kind, unit, item=None, **extra):
            if kind in ("PICKUP", "DROP"):
                before = [self.hero(index, True) for index in range(3)]
                self.equipment = self.mounted()
                self.derived(before)
                self.views.append([kind, self.typeof(item), self.equipment, self.resources()])
            return super().event(kind, unit, item, **extra)

        def resources(self):
            return [self.state(key) for key in ("MAX_LIFE", "LIFE", "MAX_MANA", "MANA")]

    world = World()
    world.weapon.set(19, 136)  # P contribution is 123. Keep a 13-point J19.
    circlet = world.create("i172")
    gem = world.create("i242")
    world.add("U", circlet)
    world.add("U", gem)
    world.add("U", world.create("i242"))
    verify("book-selected circlet, shared aliases, distinct instances, resources before PICKUP", world.views, [
        ["PICKUP", "i172", [3, 3, 3], [1045, 545, 516, 136]],
        ["PICKUP", "i242", [7, 7, 7], [1105, 605, 564, 184]],
        ["PICKUP", "i242", [11, 11, 11], [1165, 665, 612, 232]],
    ])
    verify("effective primary is counted once under percent weapon contribution",
           [world.hero(0, False), world.hero(0, True), world.weapon.roll(6), world.weapon.get(18), world.weapon.get(19)],
           [100, 111, 405.1, 255, 143])
    world.weapon.pct = 0
    verify("removing P retains primary and existing J19", world.weapon.roll(6), 274.4)
    world.slot("U", gem, 0)
    verify("slot swap has no attribute event", [world.mounted(), len(world.views)], [[11, 11, 11], 3])
    world.remove(circlet)
    verify("RemoveItem detaches before DROP and deletes handle after it",
           [world.views[-1], world.typeof(circlet)], [["DROP", "i172", [8, 8, 8], [1120, 620, 576, 196]], 0])

    world = World(primary=2)
    skull = world.create("i255")
    world.add("U", skull)
    world.rolls = [3, 9]
    world.event("SPELL", "U", ability="I246")
    verify("original i246 setter changes base INT while passive gear remains in effective INT",
           [world.hero(2, False), world.hero(2, True), world.resources(), world.weapon.roll(6)],
           [49, 89, [1600, 1100, 1068, 688], 345.9])
    world.drop("U", skull)
    verify("DROP removes passive INT while actual scripted base modifier stays",
           [world.base[2] - world.natural[2], world.hero(2, True), world.resources()], [9, 49, [1000, 500, 588, 208]])

    world = World(qual=False)
    world.add("U", world.create("i316"))
    verify("qualification rejection observes mount then withdrawal", world.views, [
        ["PICKUP", "i316", [150, 0, 0], [3250, 2750, 480, 100]],
        ["DROP", "i316", [0, 0, 0], [1000, 500, 480, 100]],
    ])
    for _ in range(6):
        world.add("U", world.create("i105"))
    before = len(world.views)
    free = world.create("i172")
    verify("full inventory never commits contribution", [world.add("U", free), world.equipment, len(world.views) - before],
           [False, [0, 24, 0], 0])

    world = World()
    world.add("U", world.create("i146"))
    axe = world.create("i147")
    world.setcharge(axe, 7)
    world.add("U", axe)
    verify("charge LIFE on pickup uses direct setter after the attached forty STR",
           [world.resources(), world.views[-1]], [[1628, 1100, 480, 100], ["PICKUP", "i147", [40, 0, 0], [1600, 1100, 480, 100]]])
    world.add("U", world.create("i148"))
    world.add("U", world.create("i148"))
    verify("nested Heart recipe withdraws material before handler and mounts final contribution once",
           [world.inventory(), world.equipment, world.resources()],
           [[(0, "i145", 7)], [90, 0, 0], [2378, 1850, 480, 100]])
    verify("Heart pickup sees forty-to-ninety transition and charge follows static stats",
           world.views[-1], ["PICKUP", "i145", [90, 0, 0], [2350, 1850, 480, 100]])

    world = World()
    stone = world.create("i327")
    world.setcharge(stone, 5)
    world.add("U", stone)
    verify("charge MANA uses direct setter after seventy INT's resource delta",
           [world.views[-1][3], world.resources()], [[1000, 500, 1320, 940], [1000, 500, 1335, 940]])
    world.env.update(GetDyingUnit=lambda: None, Player_Build_Box={})
    world.env["ItemUnitDeadAction"]("U")
    verify("original kill path writes charge and maximum once without changing current",
           [world.attr(stone, "charges"), world.equipment, world.resources()], [6, [0, 0, 70], [1000, 500, 1338, 940]])
    world.setcharge(stone, 9)
    verify("standalone charge write has no derived resource effect", world.resources(), [1000, 500, 1338, 940])
    restored = World()
    restored.items, restored.units, restored.base = deepcopy((world.items, world.units, world.base))
    restored.equipment = restored.mounted()
    restored.weapon = WeaponFields.restore(world.weapon.snapshot())
    restored.weapon.primary = Fraction(restored.hero(restored.primary, True) * 7, 5)
    verify("load rebuilds contribution from equipped ID without replaying resources or events",
           [restored.equipment, restored.resources(), restored.views, restored.attr(stone, "charges")],
           [[0, 0, 70], [1000, 500, 1338, 940], [], 9])
    restored.drop("U", stone)
    verify("DROP sees pre-script static withdrawal then reads current charge for direct subtraction",
           [restored.views[-1], restored.resources()],
           [["DROP", "i327", [0, 0, 0], [1000, 500, 498, 100]], [1000, 500, 471, 100]])

    world = World()
    world.add("U", world.create("i145"))
    world.units["U"]["state"]["LIFE"] = 5
    world.drop("U", world.units["U"]["bag"][0])
    verify("dropping STR at low life clamps to one", world.resources(), [1000, 1, 480, 100])

    world = World()
    heart = world.create("i332")
    world.setcharge(heart, 9)
    world.add("U", heart)
    world.slot("U", heart, 4)
    lifecycle.Closure("main/f273/f2", [world.env, lambda unit: None])("U", heart)
    lifecycle.Closure("main/f273/f3", [world.env, {}])("U", world.units["U"]["bag"][4])
    verify("original Fire Heart toggles withdraw before drop and attach again before pickup",
           world.views, [
               ["PICKUP", "i332", [120, 0, 0], [2800, 2300, 480, 100]],
               ["DROP", "i332", [0, 0, 0], [1036, 500, 480, 100]],
               ["PICKUP", "i330", [120, 0, 0], [2800, 2300, 480, 100]],
               ["DROP", "i330", [0, 0, 0], [1036, 500, 480, 100]],
               ["PICKUP", "i332", [120, 0, 0], [2800, 2300, 480, 100]],
           ])
    verify("Fire Heart toggles preserve charges, slot and final aggregate",
           [world.inventory(), world.equipment, world.resources()],
           [[(4, "i332", 9)], [120, 0, 0], [2836, 2300, 480, 100]])

    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--original-workbook", type=Path, default=flat.DEFAULT_ORIGINAL)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    data = evidence(args.original_workbook)
    report = {
        "baselineId": "item-attributes-v1",
        "status": "bounded_source_audit_and_Q24_Web_selection",
        "dependencies": ["item-lifecycle-v1/L01-L09", "hero-attribute-interface-v1",
                         "weapon-attribute-interface-v1/W01-W03", "attack-timing-v1"],
        "webRule": {
            "authority": "Q24 following source review; scoped to the listed mounted instances on eligible native heroes",
            "contribution": "Sum one workbook-selected STR/AGI/INT vector per eligible equipped instance. Repeated aliases survive as ordered source occurrences; use the selected vector exactly once. No contribution from recipe books.",
            "derived": "Apply effective stat changes once; +15 max life/+0.1 life regen per STR, +12 max mana/+0.03 mana regen per INT, +0.002 attack speed and zero armor per AGI. Set current by actual max delta for stat changes. Effective primary*1.4 feeds the weapon base and its percent calculation; direct script max-resource and weapon modifiers stay separate.",
            "ordering": "Attach before PICKUP and detach before DROP, then run original scripts. Do not rerun effects after a swap, failed delivery, or load. Restore saved resources/offsets and reconstruct mounted vectors directly.",
            "scope": "Static AIab contribution only. Keep ordinary carrier eligibility, death inventory disposition, full summon/bear/illusion inheritance and other equipment capabilities under their own audits.",
        },
        **data,
        "verification": {"kind": "original script bytecode with Web native doubles; no original client execution",
                         "cases": probes(data["items"])},
    }
    rendered = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.write:
        OUT.write_text(rendered)
    else:
        assert OUT.read_text() == rendered, "item-attributes.json differs from audited input"
    print(f"243 workbook rows, 86 items, 39 aliases, 180 occurrences, 46 recipe books, {len(report['verification']['cases'])} probes")


if __name__ == "__main__":
    main()
