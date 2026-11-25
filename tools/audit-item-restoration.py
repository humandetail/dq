#!/usr/bin/env python3
"""Audit the restoration commands and run their indexed script handlers."""

import argparse
from contextlib import closing
import json
import runpy
import sys
import time

sys.dont_write_bytecode = True
import audit_index as source

RULES = source.ROOT / "docs/rules"
OUT = RULES / "item-restoration-batch-01.json"
SHEET = "装备与道具"
BOOKS = {"i238": ("I245", "250魔法值", "I103"), "i326": ("I248", "60秒内恢复300点魔法值", "I101"),
         "i723": (None, "恢复50%魔法值", None)}
NATIVE_FAMILIES = {"AIrg", "AIhe", "AIma", "AIre", "AIrs", "AHhb", "AHds", "Ahea", "Arej", "ANrl", "ANrm"}


def item_evidence(db):
    ability_rows = db.execute("""
        SELECT object_id,row_no-1,fields FROM object_row WHERE source='reference/map-6.25/units_abilitydata.json'
    """)
    abilities = {alias: (index, json.loads(fields)) for alias, index, fields in ability_rows}
    item_data = {item: (index, json.loads(fields)) for item, index, fields in db.execute("""
        SELECT object_id,row_no-1,fields FROM object_row WHERE source='reference/map-6.25/units_itemdata.json'
    """)}
    mounted = set()
    ids = set()
    for (cells,) in db.execute("SELECT cells FROM sheet_row WHERE source='图鉴.xlsx' AND sheet=? AND row_no>=5", (SHEET,)):
        item = json.loads(cells)[1]
        ids.add(item)
        raw = item_data[item][1].get("abilList", "")
        aliases = [alias.strip() for alias in raw.split(",") if alias.strip()]
        for alias in aliases.copy():
            row = abilities[alias][1]
            if row["code"] == "Aspb":
                aliases.extend(row["DataA1"].split(","))
        mounted.update((item, alias) for alias in aliases if abilities[alias][1]["code"] in NATIVE_FAMILIES)
    assert len(ids) == 243 and mounted == {("i326", "I248")}

    records = []
    for item, (alias, phrase, passive) in BOOKS.items():
        rows = [row for row in source.workbook_rows(db, item, SHEET) if row["cells"][1] == item]
        assert len(rows) == 2 and rows[0]["cells"][:8] == rows[1]["cells"][:8]
        row = rows[0]
        assert phrase in row["cells"][7]
        index, obj = item_data[item]
        mods = {m["key"]: m["value"] for entry in source.objects(db, item, "war3map.w3t") for m in entry["fields"]["mods"]}
        assert "iabi" not in mods and ("utub" not in mods or phrase in mods["utub"])
        entry = {"id": item, "name": row["cells"][0], "workbookCell": f"{SHEET}!H{row['row']}",
                 "described": row["cells"][7], "alias": alias, "passiveAuditedElsewhere": passive,
                 "itemObjectJsonIndex": index, "item": {key: obj.get(key) for key in (
                     "abilList", "cooldownID", "uses", "usable", "powerup", "perishable"
                 )}}
        if alias:
            index, fields = abilities[alias]
            assert not source.objects(db, alias, "war3map.w3a")
            assert obj["abilList"].split(",") == [alias, passive]
            entry.update(abilityObjectJsonIndex=index, fields=fields)
        records.append(entry)

    ring, potion, rune = records
    assert (ring["fields"]["Cost1"], ring["fields"]["Cool1"]) == (1, 10)
    assert (potion["fields"]["Cost1"], potion["fields"]["Cool1"], potion["fields"]["Dur1"],
            potion["fields"]["HeroDur1"], potion["fields"]["DataB1"], potion["fields"]["DataD1"]) == (1, 1, 60, 60, 300, 1)
    assert potion["fields"].get("DataE1") is None and potion["fields"].get("DataC1") is None
    assert abilities["AIpr"][1]["DataE1"] == 1 and abilities["AIpr"][1]["code"] == "AIrg"
    assert potion["item"]["uses"] == 3 and potion["item"]["perishable"] == 1
    assert rune["item"]["abilList"] is None and rune["item"]["powerup"] == 1
    return records, {"sourceAIprJsonIndex": abilities["AIpr"][0], "sourceAIprDataE1": 1, "I248DataE1": None,
                     "metadataDataD": "No Target Required", "metadataDataE": "Dispel On Attack"}


def script_probes(db):
    tool = source.ROOT / "tools/audit-divine-books.py"
    vm = runpy.run_path(str(tool))["runtime"](db)
    execute, function = vm["execute"], vm["function"]
    tests = []

    def ring(current, maximum, later):
        resources = {"mana": current, "max": maximum}
        timers = {}
        calls = []
        def set_state(unit, key, amount):
            assert unit == "hero" and key == "mana"
            resources[key] = max(0, min(resources["max"], amount))
            calls.append(resources[key])
        env = {"UNIT_STATE_MANA": "mana", "UNIT_STATE_MAX_MANA": "max",
               "GetUnitState": lambda _, key: resources[key], "SetUnitState": set_state,
               "CreateTimer": lambda: "timer", "TimerStart": lambda timer, delay, periodic, callback: timers.update(
                   delay=delay, callback=callback, handle=timer),
               "AddArrAny": lambda table, timer: table.setdefault(timer, 1),
               "GetExpiredTimer": lambda: timers["handle"], "IsInTable": lambda table_element, table: table.get(table_element),
               "DestroyTimer": lambda timer: None}
        execute(function("main/f255"), [env], (None,))
        env["i238_Acition"]("hero")
        assert timers["delay"] == 7
        resources["mana"] = later
        timers["callback"]()
        return calls

    for name, arguments, expected in (
        ("source ring borrows full amount and clears at zero if spent", (100, 1000, 45), [350, 0]),
        ("source ring stores only the headroom and withdraws exactly that later", (450, 500, 300), [500, 250]),
        ("after 1-mana L03 cost at full mana only one point is borrowed", (499, 500, 500), [500, 499]),
    ):
        actual = ring(*arguments)
        assert actual == expected
        tests.append({"name": name, "actual": actual})

    def rune(adopted=False, picker_is_hero=True):
        candidates = {"picker": [40, 100], "hero": [480, 500], "deadHero": [100, 400], "ordinary": [0, 100],
                      "nonRosterHero": [0, 800]}
        heroes = {"hero", "deadHero", "nonRosterHero"}
        if picker_is_hero:
            heroes.add("picker")
        filtered = None
        calls = []
        def enumerate_players(action, condition):
            nonlocal filtered
            for filtered in ("picker", "hero", "deadHero", "ordinary"):
                if condition() or (adopted and filtered == "picker" and filtered in heroes):
                    action(filtered)
        env = {"GetFilterUnit": lambda: filtered, "UNIT_TYPE_HERO": "hero",
               "IsUnitType": lambda unit, kind: unit in heroes,
               "UNIT_STATE_MANA": 0, "UNIT_STATE_MAX_MANA": 1, "GetUnitState": lambda unit, key: candidates[unit][key],
               "SetUnitState": lambda unit, key, value: candidates[unit].__setitem__(key, min(candidates[unit][1], value)),
               "GetUnitX": lambda unit: 1, "GetUnitY": lambda unit: 2,
               "AddSpecialEffect": lambda *args: "effect", "DestroyEffect": lambda effect: None,
               "DisplayTextToAll": lambda *args: calls.append("notice"), "ClearRune": lambda: calls.append("clear")}
        execute(function("main/f278/f7"), [env, enumerate_players], ("picker", "i723"))
        assert calls == ["clear", "notice"]
        return [value[0] for value in candidates.values()]

    original, q64_hero, q64_worker = rune(), rune(adopted=True), rune(adopted=True, picker_is_hero=False)
    assert original == q64_worker == [40, 500, 300, 0, 0] and q64_hero == [90, 500, 300, 0, 0]
    tests.append({"name": "original rune excludes the collector even when that unit is a native hero", "actual": original})
    return tests, {"unitOrder": ["picker", "hero", "deadHero", "ordinary", "nonRosterHero"],
                   "heroPicker": q64_hero, "nonHeroPicker": q64_worker}


def clarity_probes():
    current, time, expiry, charges = 100, 0, 0, 3
    samples = []
    for action, event_time in [("cast", 0), ("damage", 10), ("cast", 20), ("dispel", 40), ("advance", 60)]:
        current = min(500, current + 5 * max(0, min(event_time, expiry) - time))
        time = event_time
        if action == "cast":
            current -= 1
            charges -= 1
            expiry = time + 60
        if action == "dispel":
            expiry = time
        samples.append([current, expiry, charges])
    assert samples == [[99, 60, 2], [149, 60, 2], [198, 80, 1], [298, 40, 1], [298, 40, 1]]
    return {"events": ["cast", "damage at 10", "recast at 20", "dispel at 40", "advance to 60"],
            "sampleOrder": ["mana", "expiry", "itemCharges"], "samples": samples}


def evidence(db):
    records, comparison = item_evidence(db)
    source_checks, q64_checks = script_probes(db)
    links = {
        "ringCast": ["main/f255/f0", 129258], "ringExpiry": ["main/f255/f1", 129322],
        "runePickup": ["main/f285/f10", 145495], "runeAction": ["main/f278/f7", 136776],
        "runeRecipientFilter": ["main/f278/f7/f1", 136854], "runeAmount": ["main/f278/f7/f0", 136805],
    }
    for function_name, line in links.values():
        start, end = db.execute("SELECT start_line,end_line FROM function WHERE name=?", (function_name,)).fetchone()
        assert start <= line <= end, (function_name, line, start, end)
    return {
        "baselineId": "item-restoration-batch-01",
        "coverage": {"workbookItemsScreened": 243, "activeAliases": 2, "scriptPickupWithoutAlias": 1,
                     "itemsReady": 3, "itemsRemaining": 0},
        "items": records, "sourceLinks": links, "I248TemplateComparison": comparison,
        "web": {"I248": {"manaPerSecond": 5, "durationSeconds": 60, "target": "self", "fullMana": "reject before spend",
                         "onRecast": "refresh one BIrm slot", "damageStops": False, "positiveDispelStops": True},
                "I245": {"grantCap": 250, "durationSeconds": 7, "independentTimerPerUse": True, "updatesMaxMana": False},
                "i723": {"amountPerUnit": "0.5 * current MAX_MANA",
                         "sourceTargets": "native HERO excluding exact collector, among current Player_Index_Arr owners",
                         "Q64Targets": "native HERO in the current roster including a native HERO collector"}},
        "verification": {"source": source_checks, "i723Q64": q64_checks, "clarityWeb": clarity_probes()},
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
        assert OUT.read_text() == content
    print(f"{report['coverage']}; 4 source and 3 Web probes passed; indexed verification {elapsed:.2f} ms")


if __name__ == "__main__":
    main()
