#!/usr/bin/env python3
"""Verify direct item credits and replay representative transaction boundaries."""

import argparse
from contextlib import closing
import json
from math import floor
import runpy
import sys

sys.dont_write_bytecode = True
import audit_index as source

OUT = source.ROOT / "docs/rules/item-economy-batch-01.json"
SHEET = "装备与道具"
ITEMS = {"i256": "I247", "i261": "I256", "i421": None, "i422": None, "i423": "I283"}


def profiles(db):
    records = {}
    for item, alias in ITEMS.items():
        books = [r for r in source.workbook_rows(db, item, SHEET) if r["cells"][1] == item]
        assert len(books) == 2 and books[0]["cells"][:8] == books[1]["cells"][:8]
        book = books[0]
        obj, = source.objects(db, item, "units_itemdata")
        fields = obj["fields"]
        assert fields.get("abilList") == alias and fields["usable"] == 1
        if item != "i256":
            assert fields["powerup"] == fields["perishable"] == fields["uses"] == 1
        callbacks = [r["sourceLine"] for r in source.references(db, item) if r["function"] == "main/f285/f10"]
        row = {"name": book["cells"][0], "alias": alias, "workbookCell": f"{SHEET}!H{book['row']}",
               "componentReady": True, "sourceItemJsonIndex": obj["jsonIndex"], "callback": "Item_Get" if callbacks else None,
               "sourcePickupLines": callbacks}
        if alias:
            ability, = source.objects(db, alias, "units_abilitydata")
            assert not source.objects(db, alias, "war3map.w3a")
            row["sourceAbility"] = ability
        if item in {"i261", "i423"}:
            amount = row["sourceAbility"]["fields"]["DataA1"]
            assert row["sourceAbility"]["fields"]["code"] == "AIlu"
            assert (fields["goldcost"], book["cells"][3], book["cells"][7]) == (30 * amount, 30 * amount, f"购买{amount}个木材。")
            row.update(lumber=amount, directShop="w002", price=fields["goldcost"])
        if item == "i256":
            assert "等级x300" in book["cells"][7]
            assert row["sourceAbility"]["fields"]["targs1"] == "enemies,nonhero"
        records[item] = row

    shop, = source.objects(db, "w002", "war3map.w3u")
    stock = next(m["value"] for m in shop["fields"]["mods"] if m["key"] == "usei")
    assert {"i261", "i423"} <= set(stock.split(","))
    # The rectangle helper's register is local to the Abyss module and never called or exported.
    parent = source.instructions(db, "main/f290", 1, 1000)
    bindings = [p["args"] for p in parent if p["args"][:1] == ["r21"]]
    assert bindings == [["r21", "f4"]]
    assert not any(binding[-2:] == ["21", "true"] for (value,) in db.execute(
        "SELECT upvalues FROM function WHERE name GLOB 'main/f290/f*' AND name NOT GLOB 'main/f290/f*/f*'")
        for binding in json.loads(value))
    return records


def probes(db):
    vm = runpy.run_path(str(source.ROOT / "tools/audit-divine-books.py"))["runtime"](db)
    execute, function = vm["execute"], vm["function"]
    calls = []
    env = {"GetUnitLevel": lambda unit: 4, "KillUnit": lambda target: calls.append(["kill", target]),
           "GetOwningPlayer": lambda unit: "buyer", "PLAYER_STATE_RESOURCE_GOLD": "gold",
           "GetPlayerState": lambda player, state: 19, "SetPlayerState": lambda *args: calls.append(["set", *args]),
           "TxShow": False, "Mall_ActivityTask_Update_Summer": lambda *args: calls.append(["progress", *args])}
    execute(function("main/f256/f0"), [env], ("worker", "mob"))
    assert calls == [["kill", "mob"], ["set", "buyer", "gold", 1219], ["progress", "buyer", 6, 1]]
    result = {"transmute": calls.copy()}

    def draw(low, high):
        calls.append(["roll", low, high])
        return high

    calls.clear()
    env.update({"math": {"floor": floor}, "GetRandomInt": draw, "Player": lambda slot: slot,
                "DisplayTextToAll": lambda message, seconds: calls.append(["notice", seconds])})
    execute(function("main/f290/f1"), [env])
    assert calls == [["roll", 100, 300], ["notice", 3], *[["set", slot, "gold", 319] for slot in range(4)]]
    result["ingot"] = calls.copy()
    calls.clear()
    env.update({"GetItemTypeId": lambda item: item, "GetManipulatedItem": lambda: "i422",
                "GetManipulatingUnit": lambda: "worker", "GetId": lambda value: value,
                "DZAPI_Update_Skin_Piece": lambda *args: calls.append(["shards", *args])})
    execute(function("main/f285/f10"), [env])
    assert calls == [["notice", 3], *[["shards", slot, 1] for slot in range(4)]]
    result["shards"] = calls.copy()
    return result


def report(db):
    rows = profiles(db)
    return {"baselineId": "item-economy-batch-01", "coverage": {"itemsReady": 5, "itemsRemaining": 0,
                                                               "mountedAliasesReady": 3, "aliaslessItems": 2},
            "items": rows, "web": {"i256": {"legalBearer": "worker", "creditPerUnitLevel": 300, "cooldown": 300,
                                            "range": 500, "mana": 0, "activityCategory": 6},
                                  "i421": {"goldDrawInclusive": [100, 300], "oneDrawShared": True,
                                            "unreferencedAutoAbsorption": "main/f290/f4"},
                                  "i422": {"shards": 1, "persistImmediately": True, "endlessSoloDropChance": "1/75"}},
            "sourceLines": {"transmute": 129393, "workerPickup": 144701, "goldPickup": 144658,
                            "goldAward": 157519, "goldGroundDrop": 157730, "shardsPickup": 144667,
                            "shardsWorkerDrop": 168645, "templeStock": 14730},
            "verification": probes(db)}


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
    print(data["coverage"], "3 original bytecode paths passed")


if __name__ == "__main__":
    main()
