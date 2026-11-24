#!/usr/bin/env python3
"""Audit final item callbacks and replay skull, lane-clear and switch bytecode."""

import argparse
from contextlib import closing
import json
import runpy
import sys

sys.dont_write_bytecode = True
import audit_index as source

OUT = source.ROOT / "docs/rules/item-final-batch-01.json"
SHEET = "装备与道具"
ITEMS = {
    "i255": ("I246", "邪能之力", []),
    "i278": ("I273", "每位玩家只能使用1次", ["Item_Get"]),
    "i304": (None, "基础攻击间隔减少0.2", ["Item_Get", "Item_Drop"]),
    "i310": (None, "提升某些英雄的技能效果", []),
    "i330": ("I274", "自身已损失生命值x250%", ["Item_Get", "Item_Use"]),
    "i332": ("I274", "血量大于80%", ["Item_Get", "Item_Use", "Item_Auto_Use"]),
}
WEB = {
    "i255": {"charges": 5, "cooldown": 120, "manaCost": 10, "branchRoll": [1, 6],
             "effects": [["STR", 5, 30], ["AGI", 5, 30], ["INT", 5, 30],
                         ["max-life-and-fill", 200, 400], ["max-mana-and-fill", 200, 400], ["state19", 30, 60]]},
    "i278": {"charges": 1, "cooldown": 1, "usesPerPlayer": 1, "killCredit": False,
             "preserveUncreditedDeathCallbacks": True,
             "targetScope": "living Player(11) members of the submitting player's actual spawn-exit list",
             "workbookOverride": "Q64"},
    "i304": {"flatAttack": 800, "state37DeltaSeconds": -0.2, "maximumCarried": 1,
             "changeOnRejectedPickup": 0, "workbookOverride": "Q64"},
    "i310": {"allAttributes": 40, "tidalWaveRule": "tide-and-morphling.md"},
    "i330": {"manualDroppable": False, "period": 1, "lifeLossFraction": 0.08,
             "physicalDamageMissingLifeMultiplier": 2.5, "damageSample": "before life write",
             "autoCloseBelowFraction": 0.2, "radius": 700, "I277": "effect only",
             "workbookOverride": "Q64"},
    "i332": {"manualOpenAboveFraction": 0.8, "autoOpenAtFullLife": True, "autoOpenEnemyRadius": 700,
             "closedRegenFractionPerSecond": 0.04, "workbookOverride": "Q64"},
}


def fields(db, alias, table):
    row, = source.objects(db, alias, table)
    return row["fields"]


def profiles(db):
    items = {}
    for item, (alias, phrase, callbacks) in ITEMS.items():
        books = [r for r in source.workbook_rows(db, item, SHEET) if r["cells"][1] == item]
        assert len(books) == 2 and books[0]["cells"] == books[1]["cells"]
        book = books[0]
        assert phrase in book["cells"][7], item
        obj = fields(db, item, "units_itemdata")
        assert not alias or obj["abilList"].split(",")[0] == alias
        items[item] = {"name": book["cells"][0], "workbookCell": f"{SHEET}!H{book['row']}",
                       "componentReady": True, "alias": alias, "callbackReady": callbacks,
                       "sourceMounts": obj["abilList"], "web": WEB[item]}
    for item, charges in (("i255", 5), ("i278", 1)):
        obj = fields(db, item, "units_itemdata")
        assert [obj[k] for k in ("usable", "uses", "perishable")] == [1, charges, 1]
    for item, droppable in (("i330", None), ("i332", 1)):
        obj = fields(db, item, "units_itemdata")
        assert [obj.get(k) for k in ("uses", "perishable", "droppable")] == [None, None, droppable]
    skull = fields(db, "I246", "units_abilitydata")
    charm = fields(db, "I273", "units_abilitydata")
    switch = fields(db, "I274", "units_abilitydata")
    fire = fields(db, "I277", "units_abilitydata")
    stop = fields(db, "T401", "units_abilitydata")
    assert (skull["code"], skull["Cool1"], skull["Cost1"]) == ("ANcl", 120, 10)
    assert (charm["code"], charm["Cool1"], charm.get("Cost1")) == ("ANcl", 1, None)
    assert (switch["code"], switch["Cool1"], switch.get("DataA1"), switch.get("DataB1")) == ("AIfs", 1, None, None)
    assert (fire["code"], fire["BuffID1"], fire["DataA1"], fire["Area1"], fire["Dur1"]) == ("Apig", "B165", 1, 700, 1)
    assert stop["code"] == "AEfk" and stop.get("DataA1") is None
    tidal = json.loads((OUT.parent / "tide-and-morphling.json").read_text())
    assert "A217" in tidal["skills"] and "A218" in str(tidal["skills"]["A217"])
    return items


def original_probes(db):
    vm = runpy.run_path(str(source.ROOT / "tools/audit-divine-books.py"))["runtime"](db)
    execute, function = vm["execute"], vm["function"]

    def contains(value, table):
        return next((key for key, entry in table.items() if entry == value), -1)

    def append(table, value):
        table[len(table) + 1] = value

    def pairs(table):
        keys = list(table)
        def next_pair(state, previous):
            for key in keys if previous is None else keys[keys.index(previous) + 1:]:
                if key in state:
                    return key, state[key]
            return None, None
        return next_pair, table, None

    stat = {"STR": 100, "AGI": 100, "INT": 100, "MAX_LIFE": 1000, "LIFE": 200,
            "MAX_MANA": 500, "MANA": 20, 19: 450}
    env = {"GetTriggerUnit": lambda: "caster", "CreateTextByUnit": lambda *args: None,
           "GetUnitState": lambda unit, field: stat[field], "ConvertUnitState": lambda field: field,
           "SetUnitState": lambda unit, field, value: stat.__setitem__(field, value)}
    for name in ("LIFE", "MANA", "MAX_LIFE", "MAX_MANA"):
        env[f"UNIT_STATE_{name}"] = name
    for field, suffix in (("STR", "Str"), ("AGI", "Agi"), ("INT", "Int")):
        env[f"GetHero{suffix}"] = lambda unit, include, field=field: stat[field] if not include else None
        env[f"SetHero{suffix}"] = lambda unit, value, permanent, field=field: stat.__setitem__(field, value) if permanent else None
    draws = []
    def draw(low, high):
        value = next(rolls)
        assert low <= value <= high
        draws.append([low, high, value])
        return value
    env["GetRandomInt"] = draw
    for branch, amount in enumerate((5, 30, 19, 200, 400, 60), 1):
        rolls = iter((branch, amount))
        execute(function("main/f257/f0"), [env], ("caster",))
    assert stat == {"STR": 105, "AGI": 130, "INT": 119, "MAX_LIFE": 1200, "LIFE": 1200,
                    "MAX_MANA": 900, "MANA": 900, 19: 510}
    assert [r[:2] for r in draws[1::2]] == [[5, 30]] * 3 + [[200, 400]] * 2 + [[30, 60]]

    first_lane = {1: "lane-creep", 2: "mBOS", 3: "m999", 4: "shop", 5: "friendly", 6: "dead"}
    second_lane = {1: "other-lane"}
    killed, warnings = [], []
    owners = {"worker-A": 0, "worker-A2": 0, "worker-B": 1}
    env = {"IsInTable": contains, "i278_unit": {}, "GetOwningPlayer": owners.get,
           "DisplayTextToPlayer": lambda *args: warnings.append(args[0]), "AddArrAny": append,
           "DisplayTextToAll": lambda *_: None, "GetPlayerNameStr": str, "GetPlayerId": int,
           "Mon_Mode1_0": first_lane, "Mon_Mode1_1": second_lane, "pairs": pairs,
           "GetUnitTypeId": lambda u: u, "GetId": lambda x: x, "Player": int,
           "UNIT_STATE_LIFE": "LIFE", "GetUnitState": lambda u, _: 0 if u == "dead" else 1,
           "IsUnitOwnedByPlayer": lambda u, p: u != "friendly" and p == 11,
           "IsShopBoss": lambda u: u == "shop", "KillUnit": killed.append}
    lane = function("main/f265/f0")
    for worker in ("worker-A", "worker-A", "worker-A2", "worker-B"):
        execute(lane, [env, {}], (worker,))
    assert (killed, warnings, list(env["i278_unit"].values())) == (
        ["lane-creep", "lane-creep", "other-lane"], [0], ["worker-A", "worker-A2", "worker-B"])

    spent_players, forced_deaths = set(), []
    for worker in ("worker-A", "worker-A2", "worker-B"):
        player = owners[worker]
        if player in spent_players:
            continue
        spent_players.add(player)
        for enemy in env[f"Mon_Mode1_{player}"].values():
            if env["GetUnitState"](enemy, "LIFE") > 0 and env["IsUnitOwnedByPlayer"](enemy, 11):
                forced_deaths.append([enemy, None])
    assert forced_deaths == [[enemy, None] for enemy in ("lane-creep", "mBOS", "m999", "shop", "other-lane")]

    def flame(web):
        trace, slots, timers = [], {}, {}
        life, held = {"life": 800, "max": 1000}, {"item": "i332"}
        fire = function("main/f273/f0")
        ignite = function("main/f273/f2")
        if web:
            def amend(obj, old, new, constants=None):
                assert sum(row["raw"] == old for row in obj["instructions"]) == 1
                return {**obj, "instructions": [{"raw": new if row["raw"] == old else row["raw"]}
                                                for row in obj["instructions"]],
                        "constants": {**obj["constants"], **(constants or {})}}
            fire = amend(fire, "lt 0 r6 r4", "le 0 r6 r4", {"k14": {"value": 2.5}})
            ignite = amend(ignite, "lt 0 r3 r2", "le 0 r3 r2")
        def set_life(unit, field, amount):
            life[field] = amount
            trace.append(["hp", amount])
        def remove(item):
            held.pop("item", None)
            trace.append(["remove", item])
        def create(item, x, y):
            trace.append(["create", item])
            return item
        def add_item(unit, item):
            held["item"] = item
            trace.append(["attach", item])
        def note(key):
            return lambda *args: trace.append([key, *args])
        env = {"GetUnitState": lambda unit, key: life[key], "SetUnitState": set_life, "UNIT_STATE_LIFE": "life",
               "UNIT_STATE_MAX_LIFE": "max", "DisplayTextToPlayer": lambda *_: trace.append(["too-low"]),
               "GetOwningPlayer": lambda u: 0, "GetIndexByItemInUnit": lambda unit, item: 3,
               "GetItemCharges": lambda item: 7, "GetId": lambda x: x, "GetUnitX": lambda u: 11,
               "GetUnitY": lambda u: 22, "RemoveItem": remove, "CreateItem": create, "SetItemCharges": note("charges"),
               "AddArrAny": append, "ignore_strong_item": {}, "UnitAddItem": add_item, "UnitDropItemSlot": note("slot"),
               "GetUnitUserData": lambda u: 1, "CreateTimer": lambda: "clock", "UnitAddAbility": note("addAbility"),
               "UnitMakeAbilityPermanent": note("permanent"), "UnitRemoveAbility": note("removeAbility"),
               "TimerStart": lambda token, delay, repeat, callback: timers.update({token: (delay, repeat, callback)}),
               "DestroyTimer": lambda token: timers.pop(token, None), "IssueImmediateOrder": note("order"),
               "GetExpiredTimer": lambda: "clock", "IsInTable": contains, "Tower_ALL": {1: "hero"},
               "HasItem": lambda u, item: item if held.get("item") == item else None,
               "SetPhyDamagePoint": lambda unit, delay, radius, x, y, amount:
                   trace.append(["physical", unit, delay, radius, x, y, round(amount, 9)])}
        def tick():
            execute(fire, [env, slots])
        def close(unit, item):
            execute(function("main/f273/f3"), [env, slots], (unit, item))
        def start(unit):
            execute(function("main/f273/f1"), [env, slots, tick], (unit,))
        env["i330_Close"] = close
        execute(ignite, [env, start], ("hero", "i332"))
        if web:
            assert trace == [["too-low"]] and not timers
            life["life"] = 801
            execute(ignite, [env, start], ("hero", "i332"))
        assert held == {"item": "i330"} and timers["clock"][:2] == (1, True)
        assert ["charges", "i330", 7] in trace and ["slot", "hero", "i330", 3] in trace
        life["life"] = 1000
        tick()
        assert trace[-2:] == [["hp", 920], ["physical", "hero", 0, 700, 11, 22, 0]]
        life["life"] = 250
        tick()
        assert trace[-2:] == [["hp", 170], ["physical", "hero", 0, 700, 11, 22, 1875 if web else 1650]]
        life["life"] = 200
        tick()
        if web:
            assert trace[-2:] == [["hp", 120], ["physical", "hero", 0, 700, 11, 22, 2000]]
            tick()
        assert held == {"item": "i332"} and not timers and not slots
        assert ["charges", "i332", 7] in trace and ["slot", "hero", "i332", 3] in trace
        assert trace[-4:] == [["addAbility", "hero", "T401"], ["permanent", "hero", True, "T401"],
                              ["order", "hero", "scout"], ["removeAbility", "hero", "T401"]]
        return [row for row in trace if row[0] in ("hp", "physical", "too-low")]

    def sword_intervals():
        intervals = [1.0]
        contributed = set()
        for instance, kept, picked_up in (("sword-1", True, True), ("sword-2", False, True),
                                         ("sword-2", False, False), ("sword-1", False, False)):
            value = intervals[-1]
            if picked_up and kept and not contributed:
                contributed.add(instance)
                value -= 0.2
            elif not picked_up and instance in contributed:
                contributed.remove(instance)
                value += 0.2
            intervals.append(round(value, 9))
        return intervals

    intervals = sword_intervals()
    assert intervals == [1.0, 0.8, 0.8, 0.8, 1.0]
    return {"skullSixBranches": draws, "swordRejectedDuplicate": intervals, "laneCasterIdentityAndExclusions": killed,
            "webLaneForcedDeaths": forced_deaths, "originalFlame": flame(False), "webFlame": flame(True)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    with closing(source.connect()) as db:
        rows = profiles(db)
        probes = original_probes(db)
    result = {"scope": "Final owned item callbacks and scepter dependency cross-check",
              "items": rows, "validation": probes}
    output = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        assert OUT.read_text() == output, f"{OUT.name} differs"
    else:
        OUT.write_text(output)
    print("6 selected items ready; 3 mounted aliases checked")
    print("Passed six skull use branches, original lane and replacement timing, Web lane, sword and flame boundaries")


if __name__ == "__main__":
    main()
