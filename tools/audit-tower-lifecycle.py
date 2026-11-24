#!/usr/bin/env python3
"""Check direct-build and upgrade inputs, plus original sale and death ordering."""

import argparse
from contextlib import closing
from math import floor
import json
import runpy
import sys

sys.dont_write_bytecode = True
import audit_index as source

OUT = source.ROOT / "docs/rules/tower-lifecycle.json"
BUILD_TARGETS = ["n001", "n021", "n006"]
DESTROY_ON_DROP = ["i547", "i548", "i549", "i550", "i546", "i330", "i004", "i545"]


def fields(db, alias, family):
    row, = source.objects(db, alias, family)
    return row["fields"]


def content(db):
    economic = json.loads((OUT.parent / "economy-data.json").read_text())
    towers = {r["id"]: {key: value["value"] for key, value in r["fields"].items()} for r in economic["towers"]}
    worksheet = {}
    for (raw,) in db.execute("SELECT cells FROM sheet_row WHERE sheet='塔与属性'"):
        row = json.loads(raw)
        if row[0] in towers:
            assert row[0] not in worksheet or worksheet[row[0]] == row[4:7]
            worksheet[row[0]] = row[4:7]
    strings = (source.ROOT / "reference/map-6.25/units_campaignunitstrings.txt").read_text()
    workers = ["w001", *(f"g{i:03}" for i in range(2, 19))]
    for worker in workers:
        direct = [m["value"] for row in source.objects(db, worker, "war3map.w3u") for m in row["fields"]["mods"]
                  if m["key"] == "ubui"]
        if not direct:
            section = strings.split(f"[{worker}]\n", 1)[1].split("\n[", 1)[0]
            direct = [line.removeprefix("Builds=") for line in section.splitlines() if line.startswith("Builds=")]
        assert direct == [",".join(BUILD_TARGETS)], (worker, direct)
        assert "A000" in fields(db, worker, "units_unitabilities")["abilList"].split(",")
    builds = {}
    for unit in BUILD_TARGETS:
        row = fields(db, unit, "units_unitbalance")
        assert {k: row.get(k) for k in ("goldcost", "lumbercost", "fused", "bldtm")} == {
            "goldcost": 100, "lumbercost": None, "fused": 5, "bldtm": 1}
        assert worksheet[unit] == [1, 5, 100]
        builds[unit] = {"gold": 100, "wood": 0, "fused": 5, "seconds": 1, "sourceWood": None}
    edges = {}
    for origin, row in towers.items():
        for target in filter(None, row.get("Upgrade", "").split(",")):
            destination = towers[target]
            assets = fields(db, target, "units_unitbalance")
            for key in ("goldcost", "fused", "bldtm"):
                assert destination[key] == assets[key], target
            assert worksheet[target][1:] == [destination["fused"], destination["goldcost"]]
            assert assets.get("lumbercost") == destination.get("lumbercost") and not destination.get("Requires")
            edges[f"{origin}->{target}"] = {"gold": destination["goldcost"], "wood": destination.get("lumbercost", 0),
                                           "seconds": destination["bldtm"], "populationDelta": destination["fused"]-row["fused"]}
    assert len(edges) == 106
    assert {k: e["populationDelta"] for k, e in edges.items() if e["populationDelta"]} == {
        "n207->n208": 10, "n217->H018": 15, "n227->H010": 15}
    assert all(e["seconds"] == 1 and e["wood"] == 0 for e in edges.values())
    absent = sorted(unit for unit, row in towers.items() if "points" not in row)
    assert len(absent) == 30 and set(BUILD_TARGETS) <= set(absent)
    assert set(absent) == {unit for unit, row in worksheet.items() if row[0] == 1}
    a000 = fields(db, "A000", "units_abilitydata")
    n000 = fields(db, "N000", "units_abilitydata")
    assert (a000["code"], a000["Rng1"], a000["DataB1"], a000["targs1"]) == (
        "ANcl", 1000, 1, "notself,player,invulnerable")
    assert (n000["code"], n000["Dur1"]) == ("AHds", 0.001)
    mounts = "source='reference/map-6.25/units_unitabilities.json' AND fields LIKE '%N000%'"
    assert not db.execute(f"SELECT object_id FROM object_row WHERE {mounts}").fetchall()
    return {"workerTemplates": workers, "directBuilds": builds, "upgradeEdges": edges,
            "recycleMissingPointsUseZeroInWeb": absent,
            "recycle": {"heroConfirmationRealMs": 500, "rate": 0.8, "destroyOnDrop": DESTROY_ON_DROP,
                        "actualAbility": "A000", "unusedAbility": "N000"},
            "revive": {"owners": [0, 1, 2, 3], "stableEntity": True, "hp": "full", "mana": "min(100, current maximum)"}}


def source_probes(db):
    vm = runpy.run_path(str(source.ROOT / "tools/audit-divine-books.py"))["runtime"](db)
    execute, function = vm["execute"], vm["function"]
    trace = []
    def note(name):
        return lambda *args: trace.append([name, *args])

    def position(unit):
        return [80, 90]

    bag = {0: "i330", 2: "i101", 3: "i004"}
    def detach(unit, slot):
        assert any(row[0] == "remove" for row in trace)
        trace.append(["slot", slot])
        return bag.pop(slot, None)

    def contains(value, table):
        return next((k for k, v in table.items() if value == v), -1)

    env = {"math": {"floor": floor}, "GetUnitPointValue": lambda u: 420, "GetOwningPlayer": lambda u: 0,
           "GetPlayerState": lambda p, k: 100, "SetPlayerState": note("gold"), "PLAYER_STATE_RESOURCE_GOLD": "gold",
           "CreateEffAtLoc": lambda art, loc, duration, scale: trace.append(["effect", loc]),
           "GetUnitLoc": position, "RemoveSomeUnit": note("cleanup"), "RemoveUnit": note("remove"),
           "IsUnitIllusion": lambda u: False, "UnitRemoveItemFromSlot": detach, "IsInTable": contains,
           "GetItemTypeId": str, "RemoveItem": note("deleteItem")}
    def drop_item(item):
        execute(function("main/f7/f27"), [env, dict(enumerate(DESTROY_ON_DROP, 1))], (item,))
    def drop_all(unit):
        execute(function("main/f7/f28"), [env, drop_item], (unit,))
    env["DropAllItemUnit"] = drop_all
    execute(function("main/f14/f0"), [env], ("tower",))
    assert trace == [["gold", 0, "gold", 436], ["effect", [80, 90]], ["cleanup", "tower"], ["remove", "tower"],
                     ["slot", 0], ["deleteItem", "i330"], ["slot", 1], ["slot", 2], ["slot", 3],
                     ["deleteItem", "i004"], ["slot", 4], ["slot", 5]]
    sale = trace.copy()

    death = function("main/f291/f9")
    death = {**death, "instructions": death["instructions"][:death["labels"]["l83"]-1]}
    death_results = {}
    for hero, illusion, owner in ((True, False, 0), (True, False, 3), (True, False, 11),
                                   (True, True, 0), (False, False, 0)):
        trace.clear()
        env = {"GetDyingUnit": lambda: "target", "GetKillingUnit": lambda: "killer",
               "WAbility_W015": note("wealth"), "IsUnitType": lambda *_: hero, "UNIT_TYPE_HERO": "hero",
               "IsUnitIllusion": lambda _: illusion, "IsUnitOwnedByPlayer": lambda u, p: p == owner, "Player": int,
               "ReviveHeroLoc": note("revive"), "GetUnitLoc": position, "GetUnitAbilityLevel": lambda u, s: 1,
               "GetId": str, "UnitRemoveAbility": note("removeAbility")}
        execute(death, [env, {"EXSetUnitMoveType": note("moveType")}])
        expected = [["wealth", "killer", "target"]]
        if hero and not illusion and owner in (0, 1, 2, 3):
            expected += [["revive", "target", [80, 90], False], ["removeAbility", "target", "N032"],
                         ["moveType", "target", 1]]
        assert trace == expected
        death_results[f"{hero}/{illusion}/{owner}"] = trace.copy()
    return {"originalRecycleSequence": sale, "originalDeathRevivalGate": death_results}


def web_probes(data):
    def refund(gold, food_used, fee, old_food, new_food, capacity, outcome):
        reserved = max(0, new_food - old_food)
        if food_used + reserved > capacity or gold < fee:
            return [gold, food_used]
        if outcome == "cancel":
            return [gold, food_used]
        if outcome == "death":
            return [gold - fee, food_used - old_food]
        return [gold - fee, food_used - old_food + new_food]

    probes = {}
    fee = data["upgradeEdges"]["n227->H010"]["gold"]
    for case, arguments, expected in (
        ("direct_submit", (100, 25, 100, 0, 5, 30, "complete"), [0, 30]),
        ("direct_cancel", (100, 25, 100, 0, 5, 30, "cancel"), [100, 25]),
        ("direct_death", (100, 25, 100, 0, 5, 30, "death"), [0, 25]),
        ("hero_upgrade_capacity_reject", (fee, 16, fee, 5, 20, 30, "complete"), [fee, 16]),
        ("hero_upgrade_capacity_exact", (fee, 15, fee, 5, 20, 30, "complete"), [0, 30]),
        ("hero_upgrade_cancel_no_double_population", (fee, 15, fee, 5, 20, 30, "cancel"), [fee, 15]),
    ):
        probes[case] = refund(*arguments)
        assert probes[case] == expected
    return probes


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    with closing(source.connect()) as db:
        data = content(db)
        original = source_probes(db)
    result = {"baselineId": "tower-lifecycle-v1", "factsAndChoices": data,
              "validation": original | {"webTransactions": web_probes(data)}}
    text = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        assert OUT.read_text() == text, f"{OUT.name} differs"
    else:
        OUT.write_text(text)
    print("18 worker templates, 3 direct builds, 106 upgrade edges, 30 missing points records and 12 probes passed.")


if __name__ == "__main__":
    main()
