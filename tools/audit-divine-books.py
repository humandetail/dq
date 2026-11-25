#!/usr/bin/env python3
"""Run indexed divine-book Lua bytecode with explicit native state doubles."""

import argparse
import ast
from collections import Counter, defaultdict
from contextlib import closing
from functools import lru_cache
from itertools import islice
import json
import re
import sys
import time

sys.dont_write_bytecode = True
import audit_index as source

RULES = source.ROOT / "docs/rules"
OUT = RULES / "divine-books.json"
MODULE = "main/f225"
FORMS = [f"P{n}" for n in range(200, 223)]
AUX = ["T114", "T115", "T116", "T125", "T126", "T127", "T128", *(f"T{n}" for n in range(232, 252))]
FIELD_MAP = {
    "Iagi": "DataA", "Iint": "DataB", "Istr": "DataC", "Ocr1": "DataA", "Ocr2": "DataB",
    "Oae1": "DataA", "Oae2": "DataB", "Had1": "DataA", "Iatt": "DataA", "Isx1": "DataA",
    "aare": "Area", "abuf": "BuffID",
}
ENTRY = {"i258_SkillRandom": 7, "i258_StarUp": 8, "i264_StarUp": 9, "i258_StarRandom": 10}


def tooltip_rules(profiles, aux, verification):
    path = source.MAP / "units_campaignabilitystrings.txt"
    tips = {}
    with path.open(encoding="utf-8") as lines:
        for line_no, line in enumerate(islice(lines, 16263, 16560), 16264):
            if line.startswith("["):
                alias = line.strip()[1:-1]
            if line.startswith("Ubertip="):
                ranks = re.sub(r"\|c[0-9a-fA-F]{8}|\|r", "", line.removeprefix("Ubertip=").strip()).split(",")
                assert len(ranks) == profiles[alias]["levels"]
                if alias != "P200":
                    assert all(f"{'★' * n}{'☆' * (10 - n)}" in tip for n, tip in enumerate(ranks, 1))
                tips[alias] = (line_no, [list(map(int, re.findall(r"\d+", rank.split("|n")[-1]))) for rank in ranks])
    assert set(tips) == set(profiles)

    def compare(alias, *values):
        assert tips[alias][1] == [list(row) for row in zip(*values)], (alias, tips[alias], values)

    assert tips["P200"][1] == [[40]]
    for n, key in enumerate(["DataC", "DataA", "DataB", "DataC"], 201):
        compare(f"P{n}", profiles[f"P{n}"]["effective"][key])
    for n in range(209, 213):
        compare(f"P{n}", [round(100 * (value - 1)) for value in verification["damageMultipliersByStar"][f"P{n}"]])
    crit = profiles["P213"]["effective"]
    compare("P213", crit["DataA"], [round(x * 100) for x in crit["DataB"]])
    compare("P215", [round(-x * 100) for x in aux["T114"]["effective"]["DataA"]], aux["T116"]["effective"]["DataA"])
    compare("P216", aux["T115"]["effective"]["DataA"])
    compare("P218", profiles["P218"]["effective"]["Area"],
            [round((x - 1) * 100) for x in verification["P218MultipliersByBuff"] for _ in range(2)])
    compare("P219", profiles["P219"]["effective"]["Area"], [-x for x in profiles["P219"]["effective"]["DataA"]])
    for alias, base in [("P220", 232), ("P221", 242)]:
        compare(alias, [aux[f"T{n}"]["effective"]["DataA"][0] for n in range(base, base + 10)])
    compare("P222", range(1, 11))

    selected = {}
    for alias, auxiliary, field, source_numbers, adopted in (
        ("P205", "T125", "DataC", [15, 3, 6], [20, 3, 5]),
        ("P206", "T126", "DataA", [10, 3, 6], [10, 3, 5]),
        ("P207", "T127", "DataB", [30, 3, 6], [30, 3, 5]),
        ("P208", "T128", "DataC", [15, 3, 6], [15, 3, 5]),
        ("P217", "T127", "DataB", [70, 6, 9], [70, 5, 7]),
    ):
        probability, duration, cooldown = adopted
        compare(alias, [probability] * 10, [duration] * 10, aux[auxiliary]["effective"][field], [cooldown] * 10)
        selected[alias] = {"source": dict(zip(("exclusiveThresholdOn0Through100", "duration", "cooldown"), source_numbers)),
                           "web": {"probabilityPct": probability, "duration": duration, "cooldown": cooldown,
                                   "rng": "one uniform 1..100 draw, success at <= probabilityPct"}}
    speed = profiles["P214"]["effective"]
    source_move = [round(x * 100) for x in speed["DataA"]]
    source_attack = [round(x * 100) for x in speed["DataB"]]
    compare("P214", source_attack, source_move)
    selected["P214"] = {"source": {"movementPct": source_move, "attackSpeedPct": source_attack},
                        "web": {"movementPct": source_attack, "movementGameMode": 2, "attackSpeedPct": source_move}}
    return {"sameAliasSameRankTooltipLine": {key: value[0] for key, value in tips.items()}, "selectedOverrides": selected}


def runtime(db):
    @lru_cache
    def function(name):
        rows = source.instructions(db, name, 1, 1000)
        labels, upvalues = db.execute("SELECT labels,upvalues FROM function WHERE name=?", (name,)).fetchone()
        return {"function": name, "labels": json.loads(labels),
                "upvalueBindings": [(int(row[-2]), row[-1] == "true") for row in json.loads(upvalues)],
                "instructions": [{"raw": " ".join([r["op"], *r["args"]])} for r in rows],
                "constants": {key: value for row in rows for key, value in row["constants"].items()}}

    # Reuse the proven item interpreter without its full source reader or unrelated probes.
    path = source.ROOT / "tools/audit-item-lifecycle.py"
    tree = ast.parse(path.read_text())
    needed = {"truth", "equal", "get", "put", "length", "Closure", "execute"}
    tree.body = [node for node in tree.body if getattr(node, "name", None) in needed]
    vm = {"function": function, "COVER": defaultdict(set)}
    exec(compile(tree, str(path), "exec"), vm)
    return vm


def object_profile(db, alias):
    row, = source.objects(db, alias, "units_abilitydata")
    fields = row["fields"]
    levels = fields["levels"]
    keys = (*dict.fromkeys(FIELD_MAP.values()), "targs")
    explicit = {key: [fields.get(f"{key}{n}") for n in range(1, levels + 1)] for key in keys}
    effective = {key: values.copy() for key, values in explicit.items()}
    for entry in source.objects(db, alias, "war3map.w3a"):
        for mod in entry["fields"]["mods"]:
            if mod["key"] in FIELD_MAP:
                effective[FIELD_MAP[mod["key"]]][mod["level"] - 1] = mod["value"]
    if alias == "P218":
        # Source overrides supply odd ranks; established held-value import supplies even ranks.
        for index in range(5, 10, 2):
            effective["Area"][index] = 900
    for key in ("Area", "targs", "BuffID"):
        for index in range(1, levels):
            if effective[key][index] is None:
                effective[key][index] = effective[key][index - 1]
    return {"jsonIndex": row["jsonIndex"], "code": fields["code"], "levels": levels,
            "explicit": {k: v for k, v in explicit.items() if any(x is not None and x != "_" for x in v)},
            "effective": {k: [round(x, 6) if isinstance(x, float) else x for x in v]
                          for k, v in effective.items() if any(x is not None and x != "_" for x in v)}}


def probes(db, profiles, profiles_aux):
    vm = runtime(db)
    run, function = vm["execute"], vm["function"]
    ceiling = {key: row["levels"] for key, row in (profiles | profiles_aux).items()}

    def world(initial, rolls=(), owners=(1, 1), saturate=False):
        state = {"target": initial.copy(), "caster": {}}
        trace = []
        draws = iter(rolls)
        owner = dict(zip(("caster", "target"), owners))
        def rand(low, high):
            value = next(draws)
            assert low <= value <= high, (low, high, value)
            trace.append(["rng", low, high, value])
            return value
        def set_level(unit, ability, level):
            trace.append(["levelRequest", unit, ability, level])
            state[unit][ability] = min(level, ceiling[ability]) if saturate else level
        env = {
            "GetId": lambda value: value, "GetRandomInt": rand, "GetOwningPlayer": owner.get,
            "GetPlayerNameStr": str, "GetUnitName": str,
            "GetUnitAbilityLevel": lambda unit, ability: state[unit].get(ability, 0),
            "UnitRemoveAbility": lambda unit, ability: state[unit].pop(ability, None),
            "UnitAddAbility": lambda unit, ability: state[unit].setdefault(ability, 1),
            "UnitMakeAbilityPermanent": lambda *args: None, "SetUnitAbilityLevel": set_level,
            "GetUnitX": lambda unit: 10, "GetUnitY": lambda unit: 20,
            "CreateItem": lambda item, x, y: trace.append(["create", item, x, y]) or item,
            "UnitAddItem": lambda unit, item: trace.append(["deliver", unit, item]) or False,
            "DisplayTextToPlayer": lambda *args: trace.append(["notice", args[0]]),
            "DisplayTextToAll": lambda *args: trace.append(["broadcast", args[1]]),
            "CreateEffByUnit": lambda *args: trace.append(["effect", *args]),
        }
        _, registers = run(function(MODULE), [env], (None,), True)
        return state["target"], trace, env, registers

    counts = Counter()
    for first in range(1, 101):
        for second in range(1, 7):
            _, _, _, registers = world({}, (first, second))
            counts[registers[7]()] += 1
    assert counts == {1: 92, 2: 92, 3: 92, 4: 92, 5: 92, 6: 92, 7: 24, 8: 12, 9: 10, 10: 2}

    checks = []
    def case(name, entry, initial, rolls, expected, *, owners=(1, 1), saturate=False):
        target, trace, env, _ = world(initial, rolls, owners, saturate)
        env[entry]("caster", "target")
        assert target == expected, (name, target, expected, trace)
        checks.append({"name": name, "finalAbilities": target, "trace": trace})
        return trace

    trace = case("i258 rejects another player and recreates at caster", "i258_SkillRandom", {"P200": 1}, (),
                 {"P200": 1}, owners=(1, 2))
    assert trace[-2:] == [["create", "i258", 10, 20], ["deliver", "caster", "i258"]]
    case("i258 draws star first then eleven excluded forms and falls back P212", "i258_SkillRandom",
         {"P000": 1, "P200": 1}, (99, 6, *(16,) * 11), {"P000": 1, "P212": 10})
    case("i258 can replace an existing form and removes old auxiliaries", "i258_SkillRandom",
         {"P215": 9, "T114": 9, "T116": 9}, (1, 1, 20), {"P220": 1, "T232": 1})
    case("i259 rejects P200 with a replacement", "i258_StarUp", {"P200": 1}, (), {"P200": 1})
    trace = case("i259 ten-star rejection still consumes a roll", "i258_StarUp", {"P221": 10, "T251": 1}, (1,),
                 {"P221": 10, "T251": 1})
    assert trace[0] == ["rng", 1, 100, 1] and trace[-2] == ["create", "i259", 10, 20]
    trace = case("i259 six-star first success die", "i258_StarUp", {"P221": 6, "T247": 1}, (26,),
                 {"P221": 7, "T248": 1})
    assert ["levelRequest", "target", "P221", 7] in trace
    trace = case("i259 six-star boundary failure spends charge without replacement", "i258_StarUp",
                 {"P221": 6, "T247": 1}, (25,), {"P221": 6, "T247": 1})
    assert not any(row[0] == "create" for row in trace)
    case("i260 can lower star and switches the resource source", "i258_StarRandom", {"P220": 10, "T241": 1},
         (1, 1), {"P220": 1, "T232": 1})
    case("i264 succeeds without RNG", "i264_StarUp", {"P216": 2, "T115": 2}, (), {"P216": 3, "T115": 3})
    case("old temporary bonus survives a form swap until its original timer", "i258_SkillRandom",
         {"P205": 6, "T125": 6}, (1, 1, 21), {"P221": 1, "T242": 1, "T125": 6})
    case("i264 original request exceeds rank and removes auxiliary before an invalid title", "i264_StarUp",
         {"P220": 10, "T241": 1}, (), {"P220": 11})
    case("native clamp alone still loses 10-star resource auxiliary", "i264_StarUp",
         {"P220": 10, "T241": 1}, (), {"P220": 10}, saturate=True)

    q60 = []
    for initial, occupied in (({"P220": 10, "T241": 1}, 5), ({"P221": 10, "T251": 1}, 6)):
        target, trace, env, registers = world(initial)
        delivery = {}
        def create(item, x, y):
            assert (item, x, y) == ("i264", 10, 20)
            delivery.update(id="new", type=item, charges=1, location=[x, y], inInventory=False)
            return "new"
        def add(unit, handle):
            assert (unit, handle) == ("caster", "new")
            delivery["inInventory"] = occupied < 6
            return delivery["inInventory"]
        env.update(CreateItem=create, UnitAddItem=add)
        old = {"id": "old", "charges": 0, "inInventory": True}  # L03 has already committed.
        form = registers[5]("target")
        assert form not in (0, "P200") and target[form] == 10
        trace.append(["rejectFullStar", form])
        registers[9]("i264", "caster")  # Q60 invokes f5 before f6 can run.
        assert target == initial and delivery["id"] != old["id"]
        assert delivery == {"id": "new", "type": "i264", "charges": 1, "location": [10, 20],
                            "inInventory": occupied == 5}
        assert old["inInventory"] and old["charges"] == 0
        old["inInventory"] = False  # L03 cleanup after both handlers return.
        q60.append({"tier": form, "initialInventoryCountIncludingOld": occupied, "unchangedAbilities": target,
                    "old": old, "replacement": delivery, "trace": trace})
    markers = {"P209": "i258_P209", "P210": "i258_P210", "P211": "i258_P211", "P212": "i258_P212"}
    multipliers = {}
    for form, helper in markers.items():
        multipliers[form] = [world({form: level})[2][helper]("target") for level in range(1, 11)]
    assert multipliers["P209"] == multipliers["P210"] == multipliers["P211"] == [
        1.10, 1.12, 1.14, 1.16, 1.18, 1.20, 1.24, 1.28, 1.34, 1.40
    ]
    assert multipliers["P212"] == [1.10, 1.11, 1.12, 1.13, 1.14, 1.15, 1.17, 1.19, 1.24, 1.30]
    nightmare = [world({f"B{n}": 1, "B121": 1})[2]["i258_P218"]("target") for n in range(121, 126)]
    assert nightmare == [1.12, 1.14, 1.16, 1.18, 1.20]
    return {"starMassOutOf600": counts, "cases": checks, "Q60Cases": q60,
            "damageMultipliersByStar": multipliers, "P218MultipliersByBuff": nightmare}


def evidence(db):
    stripped = json.loads((RULES / "item-targeted-books-batch-01.json").read_text())
    book_rows = [row for row in stripped["items"] if row["script"]["handler"] in ENTRY]
    assert len(book_rows) == 4
    profiles = {alias: object_profile(db, alias) for alias in FORMS}
    aux = {alias: object_profile(db, alias) for alias in AUX}
    assert profiles["P200"]["levels"] == 1 and all(profiles[alias]["levels"] == 10 for alias in FORMS[1:])
    assert all(a["effective"]["DataA"] for a in aux.values() if a["code"] in ("AImm", "AIml"))
    links = {}
    for name in ("main/f225/f0", "main/f225/f3", "main/f225/f6", "main/f225/f11", "main/f225/f15",
                 "main/f225/f17", "main/f225/f18", "main/f226/f2", "main/f227/f2", "main/f228/f2",
                 "main/f229/f2", "main/f281/f2", "main/f291/f17", "main/f283/f12"):
        links[name] = db.execute("SELECT start_line,end_line FROM function WHERE name=?", (name,)).fetchone()
    verification = probes(db, profiles, aux)
    return {"baselineId": "divine-books-v1",
            "Q60": {"policy": "At 10 stars reject before setter and return one fresh item through f5.",
                    "initialDebit": "L03 commits the old charge and later clears an exhausted instance.",
                    "preserve": "All current stars and auxiliary contributions."},
            "books": [{"id": row["id"], "alias": row["alias"],
               "workbookCell": row["workbookCell"], "handler": row["script"]["handler"],
               "dispatchLines": row["script"]["dispatchLines"], "stackOnPickup": row["mergesChargesOnPickup"]}
              for row in book_rows],
            "Q61": tooltip_rules(profiles, aux, verification),
            "formProfiles": profiles, "auxiliaryProfiles": aux, "sourceFunctionLines": links,
            "verification": verification}


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
    print(f"4 books, 23 forms including P200, 27 auxiliaries, 600 star draws, "
          f"{len(report['verification']['cases'])} source probes, "
          f"{len(report['verification']['Q60Cases'])} Q60 probes, hot verification {elapsed:.2f} ms")


if __name__ == "__main__":
    main()
