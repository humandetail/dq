#!/usr/bin/env python3
"""Build a conservative item-effect inventory from the hot source index and checked rules."""

import argparse
from collections import Counter, defaultdict
from contextlib import closing
import json
import re
import sys

sys.dont_write_bytecode = True
import audit_index as source

RULES = source.ROOT / "docs/rules"
OUT = RULES / "item-effect-coverage.json"
STAT = re.compile(r"^(?:增加|提高|减少)(?:英雄|自身|自己)?\s*\d+(?:\.\d+)?(?:点|%点?|%)\s*(?:的)?"
                  r"(?:力量|敏捷|智力|全属性|攻击力?|攻击速度|攻速|最大生命值|生命值|最大魔法值|魔法值|魔法回复速度|魔法回复|移动速度)"
                  r"(?:[。；，、]|（深渊模式下有效）)?$")
GAMEPLAY = {
    "f10": "Item_Get", "f11": "ItemDamageActionBefore", "f12": "ItemDamageActionAfter",
    "f13": "ItemUnitDeadAction", "f14": "Item_Attack_Special", "f15": "Item_Attack_Action",
    "f16": "Item_Skill_Action", "f17": "Item_Use", "f18": "Item_Drop", "f23": "Item_Auto_Use",
}
NEXT = {
    "i149": "霜冻攻击", "i153": "冰霜吐息", "i173": "连环闪电", "i177": "连环闪电",
    "i186": "腐蚀", "i188": "腐蚀", "i204": "万箭齐发", "i282": "万箭齐发",
}


def load(stem):
    return json.loads((RULES / f"{stem}.json").read_text())


def ready_mounts(abilities):
    ready = {}
    def add(item, alias, doc):
        assert alias in abilities, (item, alias, doc)
        ready[item, alias] = doc
    for stem, codes in {
        "item-attributes": {"AIab"}, "item-flat-attack": {"AIat"}, "item-resources-batch-01": {"AIml", "AImm"},
        "item-attack-speed-batch-01": {"AIas"}, "item-regeneration-batch-01": {"AIrm", "AHab", "Aoar"},
        "item-auras-batch-01": {"AHad", "AOae", "AOac", "AEar"},
    }.items():
        report = load(stem)
        for row in report["items"]:
            for mount in row.get("mounts", row.get("orderedMounts", [])):
                path = mount.get("path")
                alias = mount.get("alias") or path[-1]
                if isinstance(alias, dict):
                    alias = alias["alias"]
                assert abilities[alias]["code"] in codes
                add(row["id"], alias, stem)
        if stem == "item-flat-attack":
            for row in report["items"]:
                for alias in row["sourceAbilList"].split(","):
                    if abilities[alias.strip()]["code"] == "AIat":
                        add(row["id"], alias.strip(), stem)
    for row in load("item-armor-batch-01")["movement"]["items"]:
        add(row["id"], row["alias"], "item-armor-batch-01")
    for row in load("item-restoration-batch-01")["items"]:
        if row["alias"]:
            add(row["id"], row["alias"], "item-restoration-batch-01")
    for row in load("item-targeted-books-batch-01")["items"]:
        if not row["componentsRemaining"]:
            add(row["id"], row["alias"], "item-targeted-books-batch-01")
    for row in load("divine-books")["books"]:
        add(row["id"], row["alias"], "divine-books")
    for row in load("skill-coup-de-grace")["itemProfiles"]:
        add(row["item"]["record"]["itemID"], row["ability"]["record"]["alias"], "skill-coup-de-grace")
    for row in load("summon-and-delivery")["cards"]:
        add(row["itemId"], row["abilityId"], "summon-and-delivery")
    for row in load("experience-sharing")["nativeItemObjects"]:
        add(row["item"]["id"], row["ability"]["id"], "experience-sharing")
    weapons = load("item-weapon-effects-batch-01")["items"]
    for item, row in weapons.items():
        if row["componentReady"] and row["entry"] in abilities:
            add(item, row["entry"], "item-weapon-effects-batch-01")
    for item, row in load("item-utility-batch-01")["items"].items():
        if row["componentReady"]:
            add(item, row["alias"], "item-utility-batch-01")
    for item, row in load("item-reward-packs-batch-01")["items"].items():
        if row["componentReady"]:
            add(item, row["alias"], "item-reward-packs-batch-01")
    for item, row in load("item-runes-batch-01")["items"].items():
        if row["componentReady"] and row["alias"]:
            add(item, row["alias"], "item-runes-batch-01")
    for item, row in load("item-immolation-batch-01")["items"].items():
        if row["componentReady"]:
            add(item, row["alias"], "item-immolation-batch-01")
    for item, row in load("item-summons-batch-01")["items"].items():
        if row["componentReady"]:
            add(item, row["alias"], "item-summons-batch-01")
    for item, row in load("item-economy-batch-01")["items"].items():
        if row["componentReady"] and row["alias"]:
            add(item, row["alias"], "item-economy-batch-01")
    for item, row in load("item-growth-batch-01")["items"].items():
        if row["componentReady"] and row["alias"]:
            add(item, row["alias"], "item-growth-batch-01")
    for item, row in load("item-spell-control-batch-01")["items"].items():
        if row["componentReady"] and row["alias"]:
            add(item, row["alias"], "item-spell-control-batch-01")
    for item, row in load("item-final-batch-01")["items"].items():
        if row["componentReady"] and row["alias"]:
            add(item, row["alias"], "item-final-batch-01")
    return ready


def effect_evidence(db):
    abilities = {k: json.loads(v) for k, v in db.execute("""
        SELECT object_id,fields FROM object_row WHERE source='reference/map-6.25/units_abilitydata.json'
    """)}
    item_data = {k: json.loads(v) for k, v in db.execute("""
        SELECT object_id,fields FROM object_row WHERE source='reference/map-6.25/units_itemdata.json'
    """)}
    raw_refs = defaultdict(list)
    for function, value, line, pc in db.execute("""
        SELECT c.function,c.value,i.line,i.pc FROM constant c JOIN constant_use USING(function,key)
        JOIN instruction i USING(function,pc)
        WHERE c.function GLOB 'main/f285/f[0-9]*' AND json_type(c.value)='text'
    """):
        name = GAMEPLAY.get(function.rsplit("/", 1)[-1])
        literal = json.loads(value)
        if name and literal in item_data:
            raw_refs[literal].append({"entry": name, "sourceLine": line, "pc": pc})

    ready = ready_mounts(abilities)
    lifecycle = load("item-lifecycle")
    recipes = defaultdict(list)
    for recipe in lifecycle["tables"]["recipes"]:
        for material in set(recipe["materials"]):
            recipes[material].append(recipe["result"])
    growth = {r["values"][1] for r in lifecycle["tables"]["growth"]}
    complete_scripts = {
        "i115": "item-damage-effects", "i119": "item-damage-dispatch", "i132": "item-muramasa-takemitsu",
        "i134": "item-muramasa-takemitsu", "i161": "item-damage-dispatch", "i179": "item-damage-effects",
        "i180": "item-damage-effects", "i181": "item-damage-effects", "i182": "item-damage-effects",
        "i183": "item-damage-effects", "i184": "item-damage-effects", "i209": "item-damage-effects",
        "i238": "item-restoration-batch-01", "i263": "item-damage-effects", "i267": "item-damage-dispatch",
        "i326": "item-restoration-batch-01", "i723": "item-restoration-batch-01",
        "i258": "divine-books", "i259": "divine-books", "i260": "divine-books", "i264": "divine-books",
    }
    complete_scripts.update({row["id"]: "ogre-hood-items" for row in load("ogre-hood-items")["items"]
                             if row["status"] == "ready"})
    packs = load("item-reward-packs-batch-01")
    linked_chests = set(packs["matchedChestLinks"].values())
    ready_packs = set(packs["items"])
    reward_rule = "item-reward-packs-batch-01"
    pack_callbacks = {item for item in ready_packs if "Item_Use" in packs["items"][item]["callbackReady"]} | linked_chests
    complete_scripts.update(dict.fromkeys(pack_callbacks, reward_rule))
    runes = {item for item, row in load("item-runes-batch-01")["items"].items() if row["componentReady"]}
    complete_scripts.update(dict.fromkeys(runes, "item-runes-batch-01"))
    complete_burn = {item for item, row in load("item-immolation-batch-01")["items"].items()
                     if row["componentReady"] and not row["independentComponentsRemaining"]}
    contract_rule = "item-summon-contracts-batch-01"
    contracts = load(contract_rule)["items"]
    contract_drop = {item for item, row in contracts.items() if row["sourceDropLines"]}
    complete_scripts.update(dict.fromkeys(contract_drop, contract_rule))
    summon_rule = "item-summons-batch-01"
    item_summons = {item for item, row in load(summon_rule)["items"].items() if row["componentReady"]}
    complete_scripts.update(dict.fromkeys(item_summons, summon_rule))
    economy_rule = "item-economy-batch-01"
    economic_items = {item: row for item, row in load(economy_rule)["items"].items() if row["componentReady"]}
    direct_credits = {item for item, row in economic_items.items() if row["callback"] == "Item_Get"}
    complete_scripts.update(dict.fromkeys(direct_credits, economy_rule))
    reconciliation = load("item-coverage-reconciliation-batch-01")["items"]
    spell_rule = "item-spell-output-batch-01"
    spell_effects = {item: row for item, row in load(spell_rule)["items"].items() if row["componentReady"]}
    penetration = {item for item, row in spell_effects.items() if row["newEffectAudit"]}
    complete_scripts.update(dict.fromkeys(penetration, spell_rule))
    growth_rule = "item-growth-batch-01"
    growth_effects = {item: row for item, row in load(growth_rule)["items"].items() if row["componentReady"]}
    broken_or_stone = {item for item, row in growth_effects.items() if "Item_Get" in row["callbacks"]}
    broken_death = {item for item, row in growth_effects.items() if item in broken_or_stone and "ItemUnitDeadAction" in row["callbacks"]}
    complete_scripts.update(dict.fromkeys(broken_or_stone, growth_rule))
    proc_rule = "item-attack-procs-batch-01"
    item_procs = {item: row for item, row in load(proc_rule)["items"].items() if row["componentReady"]}
    new_procs = {item for item, row in item_procs.items() if row["newEffect"]}
    complete_scripts.update(dict.fromkeys(new_procs, proc_rule))
    control_rule = "item-spell-control-batch-01"
    controls = {item: row for item, row in load(control_rule)["items"].items() if row["componentReady"]}
    control_auto = {item for item, row in controls.items() if "Item_Auto_Use" in row["callbackReady"]}
    control_spell = {item for item, row in controls.items() if "Item_Skill_Action" in row["callbackReady"]}
    complete_scripts.update(dict.fromkeys(controls, control_rule))
    final_rule = "item-final-batch-01"
    final_items = load(final_rule)["items"]
    final_entries = defaultdict(set)
    for item, row in final_items.items():
        if row["componentReady"] and row["callbackReady"]:
            complete_scripts[item] = final_rule
            for entry in row["callbackReady"]:
                final_entries[entry].add(item)
    utility = {item for item, row in load("item-utility-batch-01")["items"].items() if row["componentReady"]}
    weapons = load("item-weapon-effects-batch-01")["items"]
    complete_weapons = {item for item, row in weapons.items() if row["componentReady"]}
    complete_scripts.update({item: "item-weapon-effects-batch-01" for item in complete_weapons})
    # A callback proof covers only its scoped entry, not every reference to that item.
    approved_entries = {
        "ItemDamageActionBefore": {"i115", "i209", "i322"},
        "ItemDamageActionAfter": {"i119", "i132", "i134", "i161", "i179", "i180", "i181", "i182", "i183", "i184", "i263", "i267"} | penetration,
        "Item_Attack_Special": {"i132", "i302", "i316"},
        "Item_Attack_Action": complete_weapons,
        "Item_Skill_Action": {"i134", "i318", "i319", "i320"} | control_spell,
        "Item_Auto_Use": {"i238"} | item_summons | control_auto | final_entries["Item_Auto_Use"],
        "Item_Get": {"i723"} | runes | direct_credits | broken_or_stone | final_entries["Item_Get"],
        "ItemUnitDeadAction": broken_death,
        "Item_Use": pack_callbacks | final_entries["Item_Use"],
        "Item_Drop": contract_drop | final_entries["Item_Drop"],
    }
    script_extra = {
        "i310": [("scepter-grant-and-withdraw", "scepter-lifecycle"), ("A217/A218-complete-tidal-wave", "tide-and-morphling")],
        "i322": [("tenth-hit-count-and-amount", "item-damage-effects"), ("wave-geometry-and-native-boundaries", proc_rule)],
        "i200": [("outgoing-spell-resistance-penetration", spell_rule)],
        "i265": [("outgoing-spell-resistance-penetration", spell_rule)],
        "i308": [("outgoing-spell-resistance-penetration", spell_rule)],
        "i255": [("permanent-stat-use-branches", final_rule)],
        "i282": [("attack-and-acquire-range", "item-lifecycle")],
    }
    all_aliases, rows = set(), []
    for row_number, cells in db.execute("""
        SELECT row_no,cells FROM sheet_row WHERE source='图鉴.xlsx' AND sheet='装备与道具' AND row_no>=5 ORDER BY row_no
    """):
        name, item, kind, *_, description = json.loads(cells)
        obj = item_data[item]
        raw = obj.get("abilList")
        paths = []
        for token in [part.strip() for part in (raw or "").split(",") if part.strip()]:
            paths.append([token])
            if abilities[token]["code"] == "Aspb":
                paths.extend([token, child] for child in abilities[token]["DataA1"].split(","))
        components = []
        for path in paths:
            alias = path[-1]
            all_aliases.add(alias)
            code = abilities[alias]["code"]
            doc = ready.get((item, alias))
            if code == "Aspb" and all((item, child) in ready for child in abilities[alias]["DataA1"].split(",")):
                doc = "item-attributes"
            components.append({"kind": "ability", "code": code, "path": path, "componentReady": doc is not None, "rule": doc})

        callback_entries = defaultdict(list)
        for ref in raw_refs[item]:
            callback_entries[ref["entry"]].append(ref["sourceLine"])
        for entry, lines in sorted(callback_entries.items()):
            doc = complete_scripts.get(item) if item in approved_entries.get(entry, set()) else None
            if item in growth and entry == "ItemUnitDeadAction":
                doc = "item-attributes"
            if item == "i282" and entry in ("Item_Get", "Item_Drop"):
                doc = "item-lifecycle"
            components.append({"kind": "callback", "entry": entry, "sourceLines": sorted(set(lines)),
                               "componentReady": doc is not None, "rule": doc})
        if item == "i327" and item in growth_effects:
            components.append({"kind": "script-effect", "entry": "endcast-cooldown-modifier",
                               "componentReady": True, "rule": growth_rule})
        if item == "i399" and item in reconciliation:
            components.append({"kind": "script-effect", "entry": "mystery-shop-once-per-buyer-refresh",
                               "componentReady": True, "rule": "item-lifecycle"})
        if item in linked_chests:
            components.append({"kind": "item-pair", "entry": "matching-key-reward-path", "componentReady": True,
                               "rule": reward_rule})
        if item in contracts:
            components.append({"kind": "script-effect", "entry": "summon-contract-birth-and-damage",
                               "componentReady": True, "rule": contract_rule})
            components.extend({"kind": "script-effect", "entry": remaining, "componentReady": False,
                               "rule": None} for remaining in contracts[item]["remainingInteraction"])
        for entry, doc in script_extra.get(item, []):
            components.append({"kind": "script-effect", "entry": entry, "componentReady": doc is not None, "rule": doc})
        if item in complete_scripts and not any(c["rule"] == complete_scripts[item] for c in components):
            components.append({"kind": "script-effect", "entry": "documented-item-effect",
                               "componentReady": True, "rule": complete_scripts[item]})
        if kind == "制作书" and recipes[item] and not paths:
            components.append({"kind": "recipe", "componentReady": True, "rule": "item-lifecycle", "results": recipes[item]})
        if item in NEXT:
            weapon_rule = "item-weapon-effects-batch-01" if item in complete_weapons else None
            components.append({"kind": "weapon-effect", "entry": NEXT[item],
                               "rule": weapon_rule, "componentReady": weapon_rule is not None})

        lines = [line for line in (description or "").splitlines() if line and line not in ("属性：", "作用：")]
        pure_stats = bool(lines) and all(STAT.fullmatch(line) for line in lines)
        documented_blanket = item in {"i129", "i155", "i161", "i198", "i209", "i217", "i228", "i238",
                                      "i258", "i259", "i260", "i264", "i267", "i269", "i270", "i318",
                                      "i319", "i320", "i326", "i723", "texp", "tgxp", "tkno"}
        evidence_complete = (pure_stats or documented_blanket or item in complete_weapons or item in utility
                             or item in ready_packs or item in linked_chests or item in runes or item in complete_burn or item in contracts or item in item_summons or item in economic_items or item in reconciliation or item in spell_effects or item in growth_effects or item in item_procs or item in controls or item in final_items
                             or (kind == "制作书" and bool(recipes[item]) and not paths))
        if not evidence_complete:
            components.append({"kind": "remaining-review", "entry": "all-described-effects-crosscheck",
                               "componentReady": False, "rule": None})
        whole = bool(components) and all(part["componentReady"] for part in components)
        rows.append({"id": item, "name": name, "kind": kind, "workbookCell": f"装备与道具!H{row_number}",
                     "abilList": raw, "components": components, "wholeItemReady": whole})

    assert len(rows) == 243 and len(all_aliases) == 163, (len(rows), len(all_aliases))
    unknown_families = defaultdict(set)
    unresolved_callbacks = defaultdict(set)
    total = Counter()
    for row in rows:
        total["wholeItemReady" if row["wholeItemReady"] else "itemsRemaining"] += 1
        for part in row["components"]:
            total["componentsReady" if part["componentReady"] else "componentsRemaining"] += 1
            if not part["componentReady"] and part["kind"] == "ability":
                unknown_families[part["code"]].add(part["path"][-1])
            if not part["componentReady"] and part["kind"] == "callback":
                unresolved_callbacks[part["entry"]].add(row["id"])
    return {"baselineId": "item-effect-coverage-v1", "inventory": {"workbookItems": 243, "mountedAliases": 163, **total},
            "statusPolicy": "Ready means an existing scoped Web rule. Literal callback references and unmatched descriptions remain unknown until effect verification. Initial acquisition and client runtime verification are separate.",
            "remainingNativeFamilies": {family: sorted(values) for family, values in sorted(unknown_families.items())},
            "remainingCallbackItems": {entry: sorted(values) for entry, values in sorted(unresolved_callbacks.items())},
            "reviewedWeaponEffectItems": NEXT, "items": rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    with closing(source.connect()) as db:
        report = effect_evidence(db)
    rendered = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.write:
        OUT.write_text(rendered)
    else:
        assert OUT.read_text() == rendered
    print(report["inventory"])


if __name__ == "__main__":
    main()
