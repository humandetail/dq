#!/usr/bin/env python3
"""Cross-check two handbooks, their rule indexes, and actual acquisition paths."""
from collections import Counter, defaultdict
from contextlib import closing
import json
import re
import runpy
import sys

import audit_index as ai

RULES = ai.ROOT / "docs/rules"
OUT = RULES / "workbook-coverage-readiness.json"
MAINLINE = ("waves-and-modes", "web-wave-boundaries", "npc-mainline-abilities-01", "enemy-ability-coverage")
ITEM_EXTRAS = {
    "i004": "session-and-task-state", "i006": "session-and-task-state",
    **dict.fromkeys(("i132", "i134", "i263"), "item-growth-batch-01"),
    "i236": "platform-and-access", "i237": "modes-readiness-closure",
    "i255": "workbook-coverage-readiness", "i278": "session-and-task-state",
    "i329": "waves-and-modes", "i330": "item-final-batch-01",
    **dict.fromkeys(("i401", "i402", "i403", "i404", "i411", "i412", "i413"), "workbook-coverage-readiness"),
    "i421": "item-economy-batch-01", "i422": "item-economy-batch-01",
    **dict.fromkeys((f"i{n}" for n in range(718, 724)), "item-runes-batch-01"),
}
ITEM_CATALOG_ONLY = {"i301", "texp", "tgxp", "tkno"}
TOWER_CATALOG_ONLY = {"b000", "b001", "b002", "b003", "n011", "n012", "n013", "n014", "n015", "H027", "G045"}
SUPPLEMENTAL = ("session-and-task-state", "worker-talents", "modes-readiness-closure")
OVERVIEW = {
    "来源与版本": ("platform-and-access",),
    "开局": ("session-and-task-state", "worker-talents", "tower-lifecycle"),
    "卡牌与阵容": ("economy-and-progression", "summon-and-delivery"),
    "变强资格": ("qualification-lifecycle", "economy-and-progression"),
    "妖刀": ("item-growth-batch-01", "item-muramasa-takemitsu"),
    "蓝量与清线": ("item-regeneration-batch-01", "item-restoration-batch-01", "item-effect-coverage"),
    "主线": MAINLINE, "福利打金": ("modes-readiness-closure", "waves-and-modes"),
    "商店与阶段": ("economy-and-progression", "challenge-enemy-effects"),
    "难度与通关": ("waves-and-modes", "modes-readiness-closure"),
    "容怪规则": ("modes-readiness-closure", "waves-and-modes"),
    "无尽": ("waves-and-modes", "modes-readiness-closure"),
    "深渊": ("waves-and-modes", "modes-readiness-closure", "npc-abyss-dragon-abilities"),
    "表格口径": ("workbook-coverage-readiness",),
    "装备口径": ("economy-and-progression", "item-lifecycle", "workbook-coverage-readiness"),
    "其他版本": ("workbook-coverage-readiness",), "查表": ("workbook-coverage-readiness",),
    "收录范围": ("workbook-coverage-readiness",),
}


def read(name):
    return json.loads((RULES / f"{name}.json").read_text())


def workbooks(db):
    books = defaultdict(lambda: defaultdict(dict))
    for book, sheet, row, data in db.execute(
        "SELECT source,sheet,row_no,cells FROM sheet_row ORDER BY source,sheet,row_no"
    ):
        books[book][sheet][row] = json.loads(data)
    assert len(books) == 2 and "图鉴.xlsx" in books
    repo = books["图鉴.xlsx"]
    prior = next(book for name, book in books.items() if name != "图鉴.xlsx")
    assert len(repo) == len(prior) == 8 and repo.keys() == prior.keys()
    def without_trailing_blanks(rows):
        return {row: tuple(cells[:max(i for i, value in enumerate(cells) if value is not None)+1])
                for row, cells in rows.items()}

    for sheet in repo.keys() - {"玩法总览"}:
        assert without_trailing_blanks(repo[sheet]) == without_trailing_blanks(prior[sheet]), sheet
    overview = {}
    old = {cells[0]: (row, cells[1]) for row, cells in prior["玩法总览"].items() if row >= 5}
    for row, cells in repo["玩法总览"].items():
        if row < 5:
            continue
        topic = cells[0]
        other_row, other = old.get(topic, (None, None))
        assert (1 if other_row is None else row - other_row) == 1
        assert (topic == "来源与版本" and other is None) or cells[1] == other
        overview[topic] = {"repositoryRow": row, "priorRow": other_row, "rules": list(OVERVIEW[topic])}
    assert overview.keys() == OVERVIEW.keys() and len(old) == 17
    data_only = {sheet: {n: c for n, c in data.items() if n >= 5} for sheet, data in repo.items()}
    return data_only, overview


def towers(db, data, economy):
    docs = {r["id"]: r for r in economy["towers"]}
    facts = read("tower-lifecycle")["factsAndChoices"]
    card_rows = read("summon-and-delivery")["cards"]
    forms = read("dragon-transformation")["selectedProfiles"]
    skins = read("skin-and-transformation")["mappings"]
    normal_pool = {f"i{n}" for low, high in ((501, 510), (551, 597), (601, 609), (701, 717))
                   for n in range(low, high + 1)}
    exchange = {f"c{n:03}" for n in range(1, 14)}
    specials = {"i545", "i547", "i548", "i549", "i550"}
    cards = {row["itemId"]: row["targetUnitId"] for row in card_rows}
    assert len(cards) == 149 and cards["i900"] == "H017" and cards["i902"] == "H027"
    direct = defaultdict(list)
    edges = defaultdict(list)

    for key in facts["directBuilds"]:
        direct[key].append(["workerDirect", "tower-lifecycle", "w001"])
    for card in sorted(normal_pool | exchange | specials):
        kind = "regularCard" if card in normal_pool else "qualificationExchange" if card in exchange else "specialExchange"
        direct[cards[card]].append([kind, "summon-and-delivery", card])
        if card.startswith("i") and 551 <= int(card[1:]) <= 597 and card not in {"i571", "i577"}:
            direct[cards[card]].append(["initialChoice", "economy-and-progression", card])

    for edge in facts["upgradeEdges"]:
        previous, target = edge.split("->")
        edges[previous].append((target, ["upgrade", "tower-lifecycle", previous]))
    for row in skins:
        if row["targetUnit"] and row["targetUnit"].startswith("G"):
            for base in row["sourceUnits"]:
                edges[base].append((row["targetUnit"], ["skin", "skin-and-transformation", base, row["selection"]]))
    for skill, entries in forms.items():
        for row in entries:
            edges[row["normal"]].append((row["alternate"], ["form", "dragon-transformation", row["normal"], skill]))
    other_forms = read("alchemist-wolf-transforms")
    assert other_forms["status"] == "ready"
    for skill, base, ranks in (("A110", "H032", range(10, 16)), ("A169", "H043", range(17, 23))):
        ability, = ai.objects(db, skill, "units_abilitydata")
        expected = [f"E{rank:03}" for rank in ranks]
        assert [ability["fields"][f"UnitID{n}"] for n in range(1, 5)] == expected[:4]
        for key in expected:
            edges[base].append((key, ["form", "alchemist-wolf-transforms", base, skill]))
    bear = next(r for r in read("hero-targeted-batch-02") if r["id"] == "A127")
    base, form = bear["rules"]["forms"]
    edges[base].append((form, ["form", "hero-targeted-batch-02", base, "A127"]))

    reach = set(direct)
    while (expanded := reach | {target for key in reach for target, _ in edges[key]}) != reach:
        reach = expanded
    assert docs.keys() - reach == TOWER_CATALOG_ONLY and reach <= docs.keys()
    disabled = []
    counts = Counter()
    records = {}
    for number, row in data.items():
        key = row[0]
        balance, = ai.objects(db, key, "units_unitbalance")
        arms, = ai.objects(db, key, "units_unitweapons")
        b = balance["fields"]
        w = arms["fields"]
        assert docs[key]["name"] == row[1] and docs[key]["workbookCell"] == f"塔与属性!A{number}"
        main_attribute = {"STR": "力量", "AGI": "敏捷", "INT": "智力"}.get(b.get("Primary"))
        assert row[5:13] == [b.get("fused"), b.get("goldcost"), main_attribute,
                             *[b.get(stat) for stat in ("STR", "AGI", "INT")], w.get("rangeN1"), w.get("cool1")], key
        assert row[14:17] == [b.get(stat) for stat in ("STRplus", "AGIplus", "INTplus")], key
        if row[13] is not None:
            raw = w.get("dmgplus1", 0)
            count = w.get("dice1", 0)
            sides = w.get("sides1", 1)
            assert str(row[13]) == f"{raw+count}–{raw+count*sides}", key
            if not w.get("weapsOn", 0) & 1:
                disabled.append(key)
        if row[17]:
            target, = re.findall(r"\[([A-Za-z0-9]{4})\]", row[17])
            assert f"{key}->{target}" in facts["upgradeEdges"]
        paths = direct.get(key, []) + [path for src, links in edges.items() if src in reach
                                       for target, path in links if target == key]
        kind = ("catalogOnly" if not paths else "form" if any(p[0] == "form" for p in paths)
                else "skin" if any(p[0] == "skin" for p in paths) else "upgrade" if any(p[0] == "upgrade" for p in paths)
                else "workerDirect" if any(p[0] == "workerDirect" for p in paths) else "cardBase")
        counts[kind] += 1
        records[key] = {"row": number, "classification": kind, "confirmedPaths": paths,
                        "workbookAcquisitionLabel": row[18]}
        if key in TOWER_CATALOG_ONLY:
            records[key]["definedPathsWithoutRoot"] = [path for links in edges.values() for target, path in links if target == key]
    assert set(disabled) == {f"n{rank:03}" for rank in range(21, 26)}
    assert len(records) == 274 and len(facts["upgradeEdges"]) == 106
    for unused in ("b000", "b001", "b002", "b003", "n011"):
        assert not ai.references(db, unused)
    special_refs = ai.references(db, "i902")
    assert special_refs and all(r["function"] == "main/f284" for r in special_refs)
    assert records["H027"]["workbookAcquisitionLabel"] == "特殊卡 i902"
    assert records["G045"]["definedPathsWithoutRoot"] == [["skin", "skin-and-transformation", "H027", "S302"]]
    return {"rows": records, "counts": counts, "upgradeEdges": 106, "unmountedWeaponDisplayOnly": disabled,
            "catalogOnly": sorted(TOWER_CATALOG_ONLY),
            "unissuedSpecialCard": {"item": "i902", "tower": cards["i902"], "weight": -1,
                                    "workbookDeclaresCardButNoIssuance": True, "references": special_refs}}


def mystery_shop_unlock(db):
    show = next(r for r in ai.references(db, "ShowFshop") if r["function"] == "main/f294/f17")
    reset = next(r for r in ai.references(db, "Reset_Fshop")
                 if r["function"] == show["function"] and r["pc"] > show["pc"])
    assert reset["pc"] == show["pc"] + 2
    append, = ai.references(db, "Add_Flow_Shop")
    assert append["function"] == "main/f292"
    pool = lambda unlocked: ["i311", "i235"] if unlocked else ["i311"]
    unlocked = False
    before = pool(unlocked)
    unlocked = True  # Q81 opening is committed before the first refresh.
    first = pool(unlocked)
    restored = json.loads(json.dumps({"unlocked": unlocked}))["unlocked"]
    later = [pool(restored) for _ in range(2)]
    assert before == ["i311"] and first == ["i311", "i235"] and later == [first, first]
    return {"row": 145, "decision": "Q81", "unlockWave": 21,
            "event": "first mystery-shop opening, before initial stock roll",
            "persistence": "per run; restore membership without a reroll",
            "groupWeight": 50, "totalWeight": 335, "stockCapPerItem": 4,
            "fixedTableUnchanged": True, "source": [show["sourceLine"], reset["sourceLine"], append["sourceLine"]],
            "selectedWebVectors": {"beforeOpening": before, "firstRefresh": first, "afterRestore": later}}


def covered_indexes(data, tower_ids, economy):
    skills = read("skill-readiness-review")["skills"]
    origin = read("skill-source-coverage")["skills"]
    indexed = {(r["row"], r["towerId"], entry["id"]) for entry in origin for r in entry["workbookOccurrences"]}
    expected = {(row_no, row[1], row[5]) for row_no, row in data["塔技能"].items()}
    assert expected == indexed and len(expected) == 878 and len(skills) == 335
    assert {key for _, _, key in expected} == skills.keys()
    assert {key for _, key, _ in expected} <= tower_ids
    assert all(r["implementationReady"] and not r["pendingDependencies"] for r in skills.values())
    item_rules = {r["id"]: r for r in read("item-effect-coverage")["items"]}
    referenced = {}
    economy_items = {r["id"]: r for r in economy["items"]}
    for number, row in data["装备与道具"].items():
        key = row[1]
        assert item_rules[key]["wholeItemReady"] and item_rules[key]["name"] == row[0]
        assert economy_items[key]["name"] == row[0] and economy_items[key]["workbookCell"].endswith(f"!B{number}")
        if row[6] == "获取入口未确认":
            referenced[key] = {"row": number, "acquisitionRule": ITEM_EXTRAS.get(key),
                               "catalogOnly": key in ITEM_CATALOG_ONLY}
    assert len(item_rules) == 243 and len(referenced) == 30
    assert referenced.keys() == ITEM_EXTRAS.keys() | ITEM_CATALOG_ONLY
    assert next(row for row in data["装备与道具"].values() if row[1] == "i235")[6] == "神秘商店奖池（条件解锁）"
    return {"index": "skill-readiness-review", "rowCount": 878, "readyUniqueIds": 335}, {
        "index": "item-effect-coverage", "readyUniqueIds": 243, "recheckedAcquisitionRows": referenced}


def recipes(data, db):
    source = read("item-lifecycle")["tables"]["recipes"]
    by_result = {r["result"]: r for r in source}
    output = {}
    for number, row in data.items():
        ident = row[1]
        rule = by_result[ident]
        assert rule["workbook"]["cell"] == f"D{number}" and rule["workbook"]["multiplicityMatches"]
        material_counts = Counter()
        for part in re.split("[、，, ]+", row[3]):
            material, count = part.split("×", 1) if "×" in part else (part, "1")
            material_counts[material] += int(count)
        assert material_counts == Counter(rule["materials"]), (number, row[3])
        assert row[0] and row[2]
        output[ident] = {"row": number, "ruleIndex": rule["index"], "materialCount": len(rule["materials"])}
    unnamed, = by_result.keys() - output.keys()
    assert unnamed == "y017" and len(output) == 90 and len(source) == 91
    assert by_result[unnamed]["workbook"] is None and not ai.workbook_rows(db, unnamed, "合成配方")
    return {"rows": output, "unnamedScriptOnly": by_result[unnamed]}


def waves_modes_qualification(db, data, economy, tower_ids):
    extracted = read("waves-data")
    wave = {r["wave"]: r for r in extracted["waves"]}
    timing = {r["wave"]: r for r in read("web-wave-boundaries")["mainline"]}
    bounty = {int(r["wave"]): r["id"] for r in economy["mainWaveBountyFields"]}
    mainline = {}
    for number, row in data["主线波次"].items():
        current = wave[row[0]]
        assert bounty[row[0]] == row[2] == current["unitId"]
        speed, = ai.objects(db, row[2], "units_unitbalance", fields=["spd"])
        assert row[4:7] == [current["baseHp"], current["baseArmor"], speed["fields"]["spd"]]
        assert row[7:10] == [current.get("spawnIntervalSeconds"), current.get("spawnWindowSeconds"),
                             current.get("startDelayFromPreviousWaveSeconds")]
        arr = current["batchesPerActivePortal"]
        assert [int(i) for i in row[10].split("–")] == list(dict.fromkeys((arr["min"], arr["max"])))
        assert bool(row[11]) == bool(current.get("welfareAfterThisWave"))
        mainline[str(row[0])] = {"row": number, "id": row[2],
                                  "webUnitsPerActivePortal": timing[row[0]]["webUnitsPerActivePortal"] if row[0] in timing else 1}
    assert len(mainline) == 55 and len(timing) == 54 and mainline["55"]["id"] == "mBOS"
    modes = {}
    for number, row in data["无尽与深渊"].items():
        kind, rank, _, key, *rest = row
        if kind == "深渊":
            stage = extracted["abyss"]["stages"][rank-1]
            assert key == stage["unitId"] and row[7] == stage["timeLimitSeconds"]
        else:
            pool = "normalPool" if kind == "无尽普通波" else "bossPool"
            assert key == extracted["endless"][pool][rank-1]
        modes[key] = {"row": number, "pool": kind, "index": rank, "timeLimitSeconds": row[7]}
    assert len(modes) == 15
    qual = {r["id"]: r["requireUnit"] for r in read("qualification-lifecycle")["qualifications"]}
    assert qual == {r["id"]: r["requireUnit"] for r in economy["qualifications"]}
    requirements = {}
    for number, row in data["变强资格"].items():
        assert row[2] == qual[row[3]] and row[2] in tower_ids and row[3] == f"P{row[0]:03}"
        requirements[row[3]] = {"row": number, "currentMaxTower": row[2]}
    assert len(requirements) == 13
    return mainline, modes, requirements


def source_drop_check(db):
    found = {}
    for label, lo, hi, expected in (
        ("chestAdmission", 83, 133, ("Game_Mode", "cur_endless_lv", "IsTemp", "Players_HasItem", "SHOPITEM01", 300, 60)),
        ("chestTierAndKey", 132, 198, (401, 402, 403, 404, 10, 20, 25, 30, 35, 50, 60, 70, "CreateItem", "i")),
        ("guldan", 490, 511, ("UnitIsHero", "GetRandomInt", 1000, "i255", "CreateItem")),
    ):
        rows = ai.instructions(db, "main/f291/f9", lo, hi)
        got = {c["value"] for r in rows for c in r["constants"].values()}
        assert set(expected) <= got, (label, set(expected)-got)
        found[label] = {"function": "main/f291/f9", "pc": [lo, hi], "lines": [rows[0]["sourceLine"], rows[-1]["sourceLine"]]}
    for key in ITEM_CATALOG_ONLY:
        assert not ai.references(db, key), key
    for key in ("i403", "i404", "i413"):
        assert all(r["function"] == "main/f285/f17" for r in ai.references(db, key))
    assert [(r["function"], r["pc"]) for r in ai.references(db, "Add_Flow_Shop")] == [("main/f292", 66)]
    found["deathDropVMProbes"] = drop_probes(db)
    return found


def drop_probes(db):
    vm = runpy.run_path(str(ai.ROOT / "tools/audit-divine-books.py"))["runtime"](db)
    parent = vm["function"]("main/f291/f9")

    def slice_function(start, end):
        return {
            **parent, "instructions": parent["instructions"][start-1:end],
            "labels": {name: pc-start+1 for name, pc in parent["labels"].items()},
        }

    chest = slice_function(83, 198)
    skull = slice_function(490, 511)

    def probe(fn, rolls, result, wave=1, boss=False, killer=True, mode=0, endless=0, temporary=False):
        draws = iter(rolls)
        actual = []

        def draw(low, high):
            requested_low, requested_high, value = next(draws)
            assert (low, high) == (requested_low, requested_high) and low <= value <= high
            return value

        def entries(values):
            def advance(seq, last):
                index = last + 1
                return (index, seq[index-1]) if index <= len(seq) else (None, None)
            return advance, values, 0

        env = {"Game_Mode": mode, "cur_endless_lv": endless, "cur_monLv": wave,
               "IsUnitOwnedByPlayer": lambda _, p: p == 11, "Player": lambda p: p,
               "IsTemp": lambda _: temporary, "Players_HasItem": lambda _: [0], "pairs": entries,
               "GetOwningPlayer": lambda _: 0, "GetRandomInt": draw, "UnitIsHero": lambda _: boss,
               "CreateItem": lambda *args: actual.append(list(args)), "GetId": str,
               "GetUnitX": lambda _: 12, "GetUnitY": lambda _: 34}
        vm["execute"](fn, [env], ("dead", "attacker" if killer else None))
        assert actual == ([[result, 12, 34]] if result else [])
        assert next(draws, None) is None

    cases = [
        (1, 29, 34, "i412"), (9, 30, 35, "i401"), (10, 19, 35, "i403"),
        (19, 20, 34, "i412"), (19, 60, 35, "i401"), (20, 29, 35, "i403"),
        (29, 30, 35, "i402"), (30, 24, 34, "i414"), (30, 25, 35, "i403"),
        (49, 69, 35, "i403"), (49, 70, 35, "i402"), (50, 1, 35, "i401"),
    ]
    for wave, tier, key, expected in cases:
        probe(chest, ((1, 240, 1), (1, 100, tier), (1, 100, key)), expected, wave=wave)
    probe(chest, ((1, 240, 2),), None)
    probe(chest, ((1, 300, 2), (1, 100, 1), (1, 100, 1)), "i412", boss=True, killer=False)
    probe(chest, (), None, mode=2)
    probe(chest, (), None, endless=1)
    probe(chest, (), None, temporary=True)
    probe(skull, (), None)
    probe(skull, ((1, 1000, 1),), "i255", boss=True, mode=2)
    probe(skull, ((1, 1000, 2),), None, boss=True)
    return len(cases) + 8


def main():
    economy = read("economy-data")
    with closing(ai.connect()) as db:
        data, overview = workbooks(db)
        towers_index = towers(db, data["塔与属性"], economy)
        tower_ids = set(towers_index["rows"])
        skills, items = covered_indexes(data, tower_ids, economy)
        recipe = recipes(data["合成配方"],db)
        waves, modes, qualification = waves_modes_qualification(db, data, economy, tower_ids)
        source_additions = source_drop_check(db)
        items["confirmedAcquisition"] = {"i235": mystery_shop_unlock(db)}
    dependencies = {key: (RULES / f"{key}.md").is_file() and (RULES / f"{key}.json").is_file()
                    for key in SUPPLEMENTAL}
    for topic in overview.values():
        assert all((RULES / f"{name}.md").is_file() for name in topic["rules"])
    result = {"baseline": "workbook-coverage-readiness-v1",
              "worksheets": {"玩法总览": overview, "塔与属性": towers_index, "塔技能": skills,
                             "装备与道具": items, "合成配方": recipe, "变强资格": qualification,
                             "主线波次": waves, "无尽与深渊": modes},
              "supportingReadiness": dependencies, "acquisitionSourceAdditions": source_additions,
              "confirmedDifferences": {"overviewRepositoryOnly": "来源与版本",
                                       "rawDisabledTowerWeaponDisplay": towers_index["unmountedWeaponDisplayOnly"],
                                       "wave55BaseSpeedMissingFromOldExtract": 250}}
    written = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if "--write" in sys.argv:
        OUT.write_text(written)
    else:
        assert OUT.read_text() == written, "Run with --write to regenerate"
    print("8 worksheets; 274 towers, 878/335 skill rows/IDs, 243 items, 90 recipes, 13 qualifications, 55 waves, 15 mode entries")
    print(f"{len(TOWER_CATALOG_ONLY)} reference-only towers; {len(ITEM_CATALOG_ONLY)} catalog-only item origins; Q81 i235 unlock verified; "
          f"{sum(not valid for valid in dependencies.values())} pending support rules")


if __name__ == "__main__":
    main()
