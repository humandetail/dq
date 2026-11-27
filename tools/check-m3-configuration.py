#!/usr/bin/env python3
"""Reproduce the M3 target dependency inventory without changing M2 evidence or opening content."""
import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
from runpy import run_path

ROOT = Path(__file__).resolve().parents[1]
legacy = run_path(str(ROOT / "tools/check-m2-configuration.py"))
read = legacy["read"]


def rule(name):
    return read(f"docs/rules/{name}.json")


def source(name):
    return f"docs/rules/{name}.md"


def build():
    config = read("docs/m3-configuration.json")
    m2 = read("docs/m2-configuration.json")
    history = read("docs/m2-runtime-coverage.json")
    expected_ranges = {"N": (701, 717), "R": (601, 609), "SR": (551, 597), "SSR": (501, 510)}
    assert config["cardPools"] == {
        rarity: [f"i{number}" for number in range(first, last + 1)]
        for rarity, (first, last) in expected_ranges.items()
    }
    assert config["opening"] == {
        "pool": [item for item in config["cardPools"]["SR"] if item not in {"i571", "i577"}],
        "choiceCount": 4, "withoutReplacement": True, "ban": False,
    }
    assert config["cardRolls"] == m2["cardRolls"]
    assert config["luckPercentByLevel"] == m2["luckPercentByLevel"]
    assert config["blackCard"] == m2["blackCard"]
    chest = config["chestOverrides"]["i404"]
    assert chest == {
        "groupIndex": 2, "weight": 30, "originalEntries": ["i501", "i502", "i503", "i504"],
        "entries": ["i501", "i502", "i503", "i504"],
    }
    groups = rule("item-reward-packs-batch-01")["pools"]
    assert groups["i404"]["orderedGroups"][chest["groupIndex"]] == {
        "weight": chest["weight"], "entries": chest["entries"],
    }
    assert config["restoredSeasonTasks"] == m2["deferredSeasonTasks"]
    assert config["persistence"]["database"] != m2["persistence"]["database"]
    assert config["persistence"]["lock"] != m2["persistence"]["lock"]

    backlog = (ROOT / "docs/post-m2-backlog.md").read_text()
    restored_text = next(line for line in backlog.splitlines() if line.startswith("| F1-01 | 30 |"))
    assert config["restoredItems"] == restored_text.split("|")[3].strip().split("、")
    old_items = {entry["id"]: entry for entry in read(config["inheritedItemIndex"])["items"]}
    selected = set(old_items) | set(config["restoredItems"])
    assert len(old_items) == 202 and len(selected) == 232
    excluded = config["excluded"]
    assert set(excluded["noKnownItemEntry"]) == set(m2["noAcquisitionIds"])
    assert set(excluded["deferredModeItems"]) == set(m2["deferredModeItems"])

    economy = rule("economy-data")
    item_objects = {row["id"]: row for row in economy["items"]}
    assert set(item_objects) == selected | set(excluded["noKnownItemEntry"]) | set(excluded["deferredModeItems"])
    tower_objects = {row["id"]: row for row in economy["towers"]}
    effect_index = {row["id"]: row for row in rule("item-effect-coverage")["items"]}
    recipe_rows = [row for row in rule("item-lifecycle")["tables"]["recipes"] if row["result"] in selected]
    recipes = {row["result"]: row for row in recipe_rows}
    assert len(recipes) == len(recipe_rows), "Keep alternate recipes explicit before deriving costs"
    acquisition = legacy["workbook_acquisition"]()

    def material_leaves(item, ancestors=()):
        assert item not in ancestors, (item, ancestors, "recipe cycle")
        if item not in recipes:
            return Counter({item: 1})
        leaves = Counter()
        for material in recipes[item]["materials"]:
            assert material in selected, ("recipe dependency conflicts with scope", item, material)
            leaves.update(material_leaves(material, (*ancestors, item)))
        return leaves

    def history_ref(category, id):
        return f"docs/m2-runtime-coverage.json#{category}/{id}"

    items = {}
    for id in sorted(selected):
        row, effect = item_objects[id], effect_index[id]
        old_status = next((entry for entry in history["items"] if entry["id"] == id), None)
        recipe = recipes.get(id)
        items[id] = {
            "kind": effect["kind"], "name": row["name"], "sourceCell": row["workbookCell"],
            "acquisition": acquisition[id],
            "objectPrices": {name: row["fields"].get(name, {}).get("value") for name in ("goldcost", "lumbercost")},
            "materials": recipe["materials"] if recipe else [],
            "materialLeaves": dict(sorted(material_leaves(id).items())) if recipe else {},
            "recipeIndex": recipe["index"] if recipe else None,
            "componentRules": effect["components"],
            "runtimeEntry": old_status.get("entry") if old_status else None,
            "saveFields": ["inventory", "structures", "queue", "randomState"],
            "task": "M3-02" if id in old_items else "M3-14",
            "cases": ["A08", "A09", "A13"] if id in old_items else ["R01", "A08", "A09", "A13"],
            "history": history_ref("items", id) if old_status else None,
            "intakeImplementation": "已有入口，剩余分支待核" if old_status else "待实现",
            "intakeAcceptance": "待验",
        }

    card_catalog = {row["itemId"]: row for row in rule("summon-and-delivery")["cards"]}
    historical_cards = set(sum(m2["cardPools"].values(), []))
    tower_rules = rule("tower-lifecycle")["factsAndChoices"]
    upgrades = {}
    for edge, cost in tower_rules["upgradeEdges"].items():
        from_id, to_id = edge.split("->")
        assert from_id not in upgrades, (from_id, "ambiguous ordinary upgrade")
        upgrades[from_id] = {"to": to_id, **cost}

    def lineage(root):
        result = [root]
        while result[-1] in upgrades:
            next_id = upgrades[result[-1]]["to"]
            assert next_id not in result, ("upgrade cycle", result)
            result.append(next_id)
        return result

    cards = {}
    for rarity, pool in config["cardPools"].items():
        for id in pool:
            card = card_catalog[id]
            targeted = next((row["itemId"] for row in card_catalog.values()
                             if row["itemId"].startswith("c") and row["abilityId"] == card["abilityId"]), None)
            cards[id] = {
                "rarity": rarity, "towerLine": lineage(card["targetUnitId"]), "summonAbility": card["abilityId"],
                "targetedCard": targeted, "scope": "常规",
                "entry": [draw for draw, roll in config["cardRolls"].items()
                          if any(band[2] == rarity for band in roll["ranges"])] +
                         (["i004"] if id in config["opening"]["pool"] else []) +
                         (["i404"] if id in chest["entries"] else []),
                "deployFields": card["targetUnitFields"],
                "rule": source("summon-and-delivery"),
                "source": card["source"],
                "runtimeEntry": "src/game/m2/content.ts#cards" if id in historical_cards else None,
                "saveFields": ["cards", "inventory", "openingCard", "structures", "randomState"],
                "tasks": ["M3-12" if rarity in {"N", "R"} else "M3-13", "M3-15"],
                "cases": ["R02", "A06", "A09", "A13"],
                "intakeImplementation": "已有入口，剩余分支待核" if id in historical_cards else "待实现",
                "intakeAcceptance": "待验",
            }
    qualifications = {row["id"]: row for row in rule("qualification-lifecycle")["qualifications"]}
    for id, row in qualifications.items():
        providers = [card for card in cards.values() if card["towerLine"][-1] == row["requireUnit"]]
        assert len(providers) == 1 and providers[0]["targetedCard"], (id, row["requireUnit"])
        providers[0]["qualification"] = id

    mall = config["heroExchanges"]["mall"]
    score = config["heroExchanges"]["score"]
    assert set(mall["offers"] | score["offers"]) == set(m2["deferredHeroOffers"])
    assert (mall["sharedLimit"], mall["sharedLimitFromWave41"], score["sharedLimit"]) == (1, 2, 1)
    assert score["offers"] == {
        "i550": {"card": "i550", "consumeSR": 1, "score": 60},
        "i546": {"card": "i506", "consumeSR": 1, "score": 100},
    }
    hero_offers = {}
    for offer, offer_fields in (mall["offers"] | score["offers"]).items():
        card = card_catalog[offer_fields["card"]]
        hero_offers[offer] = {
            **offer_fields, "tower": card["targetUnitId"], "summonAbility": card["abilityId"],
            "deployFields": card["targetUnitFields"], "rule": source("platform-and-access"),
            "task": "M3-15", "case": "R03", "intakeImplementation": "待实现", "intakeAcceptance": "待验",
        }

    worker_lines = {root: {"towerLine": lineage(root), "cost": cost, "rule": source("tower-lifecycle")}
                    for root, cost in tower_rules["directBuilds"].items()}
    reachable = set()
    for id, card in (cards | worker_lines).items():
        assert not reachable.intersection(card["towerLine"]), id
        reachable.update(card["towerLine"])
    reachable.update(offer["tower"] for offer in hero_offers.values())
    historical_towers = {id for card_id in historical_cards for id in cards[card_id]["towerLine"]}
    historical_towers.update(id for line in worker_lines.values() for id in line["towerLine"])

    skin_rows = rule("skin-and-transformation")["mappings"]
    skin_forms = {}
    forms = defaultdict(dict)
    for skill_id, profiles in rule("dragon-transformation")["selectedProfiles"].items():
        for profile in profiles:
            forms[profile["normal"]][profile["alternate"]] = skill_id
    for skill_id, row in rule("alchemist-wolf-transforms")["skills"].items():
        base = next(id for id in row["objects"] if id.startswith("H"))
        forms[base].update({id: skill_id for id in row["objects"] if id != base})
    forms["H036"]["E016"] = "A127"
    while True:
        before = set(reachable)
        for skin in skin_rows:
            eligible = reachable.intersection(skin["sourceUnits"])
            if eligible:
                skin_forms[skin["selection"]] = {
                    "bases": sorted(eligible), "target": skin["targetUnit"], "unlock": skin["unlockTech"],
                    "effect": skin["effect"], "helper": skin["anegHelper"], "rule": source("skin-and-transformation"),
                }
                if skin["targetUnit"]:
                    reachable.add(skin["targetUnit"])
        for root, targets in forms.items():
            if root in reachable:
                reachable.update(targets)
        if reachable == before:
            break
    assert not reachable.intersection(excluded["noKnownTowerEntry"])
    assert reachable <= tower_objects.keys(), reachable - tower_objects.keys()

    skill_catalog = rule("skill-source-coverage")["skills"]
    readiness = rule("skill-readiness-review")["skills"]
    learning = {row["abilityId"]: row["requiredHeroLevels"] for row in rule("hero-progression")["learningRequirements"]}
    skill_history = {row["id"]: row for row in history["skills"]}
    bindings = defaultdict(list)
    for skill in skill_catalog:
        id = skill["id"]
        for occurrence in skill["workbookOccurrences"]:
            unit = occurrence["towerId"]
            if unit not in reachable:
                continue
            bindings[unit].append({
                "id": id, "name": occurrence["skillName"], "origin": occurrence["origin"],
                "cap": occurrence["levelCap"], "rules": [source(name.removesuffix(".md")) for name in readiness[id]["rules"]],
                "learnAt": learning.get(id) if occurrence["origin"] == "学习技能" else None,
                "history": history_ref("skills", id) if id in skill_history and unit in skill_history[id]["units"] else None,
            })

    unit_abilities = {row["unitAbilID"]: row for row in read("reference/map-6.25/units_unitabilities.json")}
    models = {id: model["sourcePath"] for model in rule("model-asset-inventory")["models"] for id in model["towerIds"]}
    bound_models = read("src/assets/m2/bindings.json")
    summons = {}
    for row in rule("summon-family-batch-01")["skills"]:
        summons[row["id"]] = sorted({id for level in row["rules"].get("levels", []) for id in level.get("units", [])})
    summon_rules = {id: source("summon-family-batch-01") for id in summons}
    for row in rule("ward-summons")["skills"]:
        summons[row["id"]] = [level["unit"] for level in row["rules"]["levels"]]
        summon_rules[row["id"]] = source("ward-summons")
    summons.update({
        "A122": ["q030"], "A123": ["q030"], "A124": ["q030"],
        "A066": list(rule("exorcism")["spirits"]),
        "A079": sorted(rule("monkey-formation")["objects"]),
        "A175": ["n" + str(id) for id in range(261, 267)],
    })
    summon_rules.update({"A122": source("phantom-lancer-illusions"), "A123": source("phantom-lancer-illusions"),
                         "A124": source("phantom-lancer-illusions"), "A066": source("exorcism"),
                         "A079": source("monkey-formation"), "A175": source("legacy-skill-flaming-fists")})
    late_auxiliary = {
        "illuminate-and-spirit": {"A189": ["q064", "T207", "T409"], "A191": ["q001", "q062", "q063", "T408", "T409"]},
        "hero-spells-batch-04": {"A190": ["q001", "T206", "T211"]},
        "hero-mixed-batch-01": {"A205": ["q050", "T229"], "A206": ["q051", "T044"]},
        "tide-and-morphling": {
            "A217": ["q001", "T276", "T277", "T278"], "A218": ["q001", "q054", "T276", "T277", "T278"], "A222": ["T279"],
            "A223": ["q055", "q057", "q058", "T297"], "A224": ["q056", "T286"], "A225": ["T287", "T288", "T298", "T299"],
        },
        "hero-mixed-batch-02": {
            "A237": ["T406", "nsno", "npig", "nsea", "ncrb", "nhmc", "nrat", "nfro", "necr", "nrac", "nsha", "nshw"],
            "A238": ["q059", "q061", "T405"],
        },
    }
    for rule_name, entries in late_auxiliary.items():
        for skill, ids in entries.items():
            summons[skill] = ids
            summon_rules[skill] = source(rule_name)
    auxiliary = defaultdict(list)
    for item, row in rule("item-summons-batch-01")["items"].items():
        for id in (row.get("nativeSummon"), row.get("detectionHelper", {}).get("carrier")):
            if id:
                auxiliary[id].append({"sourceId": item, "rule": source("item-summons-batch-01")})
    auxiliary["q027"].append({"sourceId": "i232", "rule": source("item-utility-batch-01")})
    for template in ["q017", "q001", "q019"]:
        auxiliary[template].append({"sourceId": "A076", "rule": source("hero-spells-batch-01")})
    scepter = rule("scepter-lifecycle")
    scepter_towers = {row["record"]["unitAbilID"]: row["record"]["heroAbilList"].split(",")
                     for row in scepter["mounts"]}
    explicit_pairs = dict(scepter["explicit_pairs"]["pairs"])
    towers = {}
    for id in sorted(reachable):
        row, slots = tower_objects[id], unit_abilities[id]
        bound_summons = {b["id"]: summons[b["id"]] for b in bindings[id] if summons.get(b["id"])}
        for skill, units in bound_summons.items():
            for unit in units:
                auxiliary[unit].append({"sourceId": skill, "owner": id, "rule": summon_rules[skill]})
        towers[id] = {
            "name": row["name"], "sourceCell": row["workbookCell"], "naturalFields": row["fields"],
            "upgrade": upgrades.get(id), "forms": forms.get(id, {}), "bindings": bindings[id],
            "nativeSlots": {key: slots.get(key) for key in ("abilList", "heroAbilList", "auto")},
            "summons": bound_summons,
            "scepter": {
                "item": "i310", "rule": source("scepter-lifecycle"),
                "explicitSkillGrants": [explicit_pairs[skill] for skill in scepter_towers[id] if skill in explicit_pairs],
            } if id in scepter_towers else None,
            "sourceModel": models.get(id), "existingBinding": bound_models.get(id),
            "saveFields": ["structures", "hero", "queue"],
            "cases": ["R02", "A06", "A07", "A13", "A14"],
            "intakeImplementation": "已有入口，剩余分支待核" if id in historical_towers | {"G059"} else "待实现",
            "intakeAcceptance": "待验",
        }

    boxes = rule("event-boxes-data")
    assert config["eventOffers"] == {box["shopItem"]: box["usableItem"] for box in boxes["boxes"]}
    assert boxes["purchase"]["cost"] == 100 and boxes["purchase"]["currency"] == "ActScore"
    event_offers = {box["shopItem"]: {
        "box": box["usableItem"], "cost": 100, "currency": "ActScore",
        "rewardsWhenOwned": box["currencyFallback"],
        "rule": source("event-boxes"), "task": "M3-15", "case": "R05",
        "intakeImplementation": "待实现", "intakeAcceptance": "待验",
    } for box in boxes["boxes"]}

    seasons = rule("session-and-task-state")["seasonalTasks"]
    restored_tasks = {
        "spring": {1: ["H033"], 2: ["A112", "A142", "A143"], 3: ["A113"], 9: list(mall["offers"])},
        "summer": {1: ["H022"]},
    }
    season_tasks = {}
    for season, ids in config["restoredSeasonTasks"].items():
        assert set(ids) == restored_tasks[season].keys()
        season_tasks[season] = {
            str(id): {"sourceValues": seasons[season]["tasks"][str(id)], "dependencyIds": restored_tasks[season][id],
                 "rule": source("session-and-task-state"), "saveFields": ["seasons"],
                 "task": "M3-15", "case": "R04", "intakeImplementation": "待实现", "intakeAcceptance": "待验"}
            for id in ids
        }

    assert not auxiliary.keys() & set(excluded["noKnownTowerEntry"])
    return {
        "version": config["version"],
        "basis": "M3 接收检查。实现与验收状态是接收时点，后续状态见 docs/m3-completion-ledger.md。",
        "counts": {"regularCards": len(cards), "openingCandidates": len(config["opening"]["pool"]),
                   "workbookItems": len(items), "recipes": len(recipes), "workerLines": len(worker_lines),
                   "qualifications": len(qualifications), "towerTemplates": len(towers), "heroExchanges": len(hero_offers)},
        "cards": cards, "workbookItems": items, "workerLines": worker_lines, "heroOffers": hero_offers,
        "towers": towers, "towerSkinForms": skin_forms, "eventOffers": event_offers, "restoredSeasonTasks": season_tasks,
        "auxiliaryUnits": {
            id: {"sources": refs, "existingBinding": bound_models.get(id), "saveFields": ["structures", "queue"],
                 "cases": ["R02", "A08", "A13", "A14"], "intakeAcceptance": "待验"}
            for id, refs in sorted(auxiliary.items())
        },
        "qualifications": qualifications, "excluded": excluded,
        "unclassifiedWorkbookTowerIds": sorted(tower_objects.keys() - reachable - set(excluded["noKnownTowerEntry"])),
        "unclosedDependencyScopes": [
            "按取得证据复核未归类塔对象，不从对象表存在推定可取得。",
            "辅助对象仍须合并其它召唤、幻象、装备、任务、神杖、场景部件及永久权益规则。",
            "装备价格为对象字段；实际购买关卡、库存、配方费用须按对应规则和入口验收。",
            "已有绑定为检查时素材登记；所有实际替代、模型动作、贴图及读档恢复须独立确认。",
            "活动积分来源和可达性须单独核证。",
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="Regenerate the M3 target dependency inventory")
    args = parser.parse_args()
    ledger = build()
    path = ROOT / "docs/m3-target-dependencies.json"
    restored = read("docs/m3-configuration.json")["restoredItems"]
    runtime_projection = []
    for id in restored:
        row = ledger["workbookItems"][id]
        entry = {
            "id": id, "kind": row["kind"], "name": row["name"], "sourceAcquisitionText": row["acquisition"],
            "objectGold": row["objectPrices"]["goldcost"], "objectLumber": row["objectPrices"]["lumbercost"],
        }
        if row["materials"]:
            entry["recipeIndex"] = row["recipeIndex"]
            entry["materialsInSourceOrder"] = row["materials"]
        runtime_projection.append(entry)
    for destination, data in [(path, ledger), (ROOT / "src/game/m2/m3-items.json", runtime_projection)]:
        if args.write:
            destination.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
        else:
            assert json.loads(destination.read_text()) == data, f"{destination.name} has changed. Inspect and regenerate with --write."
    print(json.dumps({"status": "passed", "targetOnly": True, "counts": ledger["counts"],
                      "unclassifiedTowers": ledger["unclassifiedWorkbookTowerIds"]}, ensure_ascii=False))
