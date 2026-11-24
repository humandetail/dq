#!/usr/bin/env python3
"""Verify split arrows and glaives against both workbooks and the 6.25 snapshot."""

import argparse
import hashlib
import json
import re
from fractions import Fraction
from pathlib import Path

from openpyxl import load_workbook

from build_map_reference import ROOT, SOURCE, parse_slk, write_json


OUT = ROOT / "docs/rules/hero-attack-extensions.json"
DOWNLOAD = Path.home() / "Downloads/刀圈TD 6.25 图鉴.xlsx"
ARROWS = ("A005", "A097", "A099")
ENGINEERING = {"A098": ("G043", "A097"), "A100": ("G035", "A099")}
SKILLS = {"A005", "A052", *ENGINEERING}
TOWERS = {"H002", "G035", "G043", "H016", "G074"}
TARGETS = [3, 4, 5, 6, 7, 9]
LOSS = [30, 24, 18, 12, 6, 0]
ARROW_LOCK_US = 2_000_000
ARROW_BUDGET = 99_999_999
WEB = {
    "split": {
        "totalTargetsByRank": TARGETS, "sideCooldownUs": ARROW_LOCK_US, "radius": 1300,
        "sideRawBudget": ARROW_BUDGET, "projectileSpeed": 1200, "homing": True,
        "selection": "B04 order from source center at attack commit; unique legal visible enemies except primary",
        "hit": "independent ordinary target checks; same launch R and source illusion factor; no primary-only native procs",
        "events": "one ATTACKED at ordinary attack start; independent B03 hero/NORMAL ranged attack packet per hit",
    },
    "engineering": {
        "replacement": {raw: {"carrier": tower, "from": "A005", "to": variant}
                        for raw, (tower, variant) in ENGINEERING.items()},
        "fixedWeaponContributionF": 2, "preClampMoveMultiplier": 1.1,
        "basis": "workbook H370/H511, only these two ANeg instances; Q24 lifecycle and contribution channels",
    },
    "glaive": {
        "Q48": "confirmed: use this tower's own effective A052 level; no shared k001 gameplay contribution",
        "lossPercentByRank": LOSS, "additionalBounces": 3, "jumpRadius": 500, "projectileSpeed": 900,
        "selection": "B04 after each completed hit, from impact-position snapshot, exclude the full visited set",
        "raw": "primary pre-mitigation (R*M)*f, multiplied by (1-loss)^hop; no primary-only B or damage-event results",
        "flight": "revalidate targets; misses stop chain; death of source preserves already launched chain, removal cancels",
    },
}


def workbook(path):
    book = load_workbook(path, read_only=True, data_only=True)
    result = {}
    try:
        for page, column, ids in [("塔技能", 5, SKILLS), ("塔与属性", 0, TOWERS)]:
            result[page] = [
                {"row": i, "values": list(row)}
                for i, row in enumerate(book[page].values, 1) if len(row) > column and row[column] in ids
            ]
    finally:
        book.close()
    return result


def table(name, key, ids):
    raw = SOURCE / f"{name}.slk"
    data = raw.with_suffix(".json")
    rows = parse_slk(raw)
    assert rows == json.loads(data.read_text()), name
    lines = data.read_text().splitlines()
    headers = raw.read_text().splitlines()
    return {
        row[key]: {
            "jsonLine": next(i for i, line in enumerate(lines, 1) if f'"{key}": "{row[key]}"' in line),
            "slkLine": next(i for i, line in enumerate(headers, 1) if re.fullmatch(rf'C;X1;Y\d+;K"{row[key]}"', line)),
            "fields": row,
        }
        for row in rows if row[key] in ids
    }


def strings(filename, ids):
    sections = {}
    for i, line in enumerate((SOURCE / filename).read_text().splitlines(), 1):
        if line.startswith("["):
            entry = line.strip("[]")
            if entry in ids:
                sections[entry] = {"line": i, "fields": {}}
        elif entry in ids and "=" in line:
            key, value = line.split("=", 1)
            sections[entry]["fields"][key] = value
    return sections


def collect_bytecode():
    source = (SOURCE / "main.disasm").read_text()
    ids = [*sorted(SKILLS), "A097", "A099", "k001"]
    text = source.splitlines()
    refs = {raw: [i for i, line in enumerate(text, 1) if f'"{raw}"' in line] for raw in ids}
    assert refs == {"A005": [], "A052": [169005, 169159], "A098": [], "A100": [], "A097": [], "A099": [], "k001": [67593, 67602]}
    for raw in ids:
        fourcc = int.from_bytes(raw.encode(), "big")
        assert not re.search(rf"^\.constant\s+\w+\s+{fourcc}$", source, re.M), raw
    jass = (SOURCE / "war3map.j").read_text()
    assert not any(re.search(rf"\b{raw}\b", jass) for raw in ids)
    functions = {}
    for name in ("main/f47", "main/f47/f0", "main/f291/f3", "main/f291/f10",
                 "main/f291/f31", "main/f291/f33", "main/f285/f14", "main/f285/f15"):
        match = re.search(rf"^\.function\s+{name}\n.*?(?=^\.function|\Z)", source, re.M | re.S)
        line = source.count("\n", 0, match.start()) + 1
        functions[name] = {"firstLine": line, "lines": match.group().rstrip().splitlines()}
    study = [line.split(";")[0].split() for line in text[67595:67606] if line.strip()]
    assert study == [
        ["gettabup", "r2", "u0", "k0"], ["move", "r3", "r0"], ["call", "r2", "2", "2"],
        ["gettabup", "r3", "u0", "k1"], ["move", "r4", "r2"], ["gettabup", "r5", "u0", "k2"],
        ["loadk", "r6", "k3"], ["call", "r5", "2", "2"], ["loadk", "r6", "k4"],
        ["call", "r3", "4", "1"], ["return", "r0", "1"],
    ], study
    integration = {}
    locations = {
        "i204Snapshot": (128217, "main/f246/f0", 49, "SetUnitState"),
        "i561StartPool": (137574, "main/f282", 43, "i561"),
        "i561RegularPool": (139803, "main/f284", 105, "i561"),
        "G074Skin": (154903, "main/f289", 755, "newtable"),
        "attackDispatchEnd": (167393, "main/f291/f3", 237, "Item_Attack_Action"),
        "learnA052": (169159, "main/f291/f10", 117, "A052"),
        "stripHero": (172967, "main/f291/f18", 39, "UnitStripHeroLevel"),
        "cardPopulationGate": (173093, "main/f291/f19", 73, "r5    r4"),
        "H010TechLimit": (199784, "main/f306/f27", 25, "call"),
    }
    for name, (line, fn, pc, opcode) in locations.items():
        start = next(i for i in range(line - 1, -1, -1) if text[i].startswith(".function"))
        assert text[start].split()[1] == fn and opcode in text[line - 1], name
        assert sum(bool(row) and not row.startswith(".") for row in text[start:line]) == pc, name
        integration[name] = {"function": fn, "pc": pc, "line": line}
    assert '"H010"' in text[199780] and text[199782].endswith("= 1")
    return {"literalReferences": refs, "functions": functions, "integration": integration}


def contract_cases():
    cases = []

    def check(name, actual, expected):
        assert actual == expected, (name, actual, expected)
        cases.append({"id": name, "expected": expected})

    def split(rank, now, ready, raw, candidates):
        if not 1 <= rank <= 6 or now < ready:
            return ready, []
        shots = []
        budget = ARROW_BUDGET
        for target in sorted(candidates)[:TARGETS[rank - 1] - 1]:
            amount = min(raw, budget)
            if amount <= 0:
                break
            shots.append((target, amount))
            budget -= amount
        return now + ARROW_LOCK_US, shots

    def glaive(rank, core):
        if not 1 <= rank <= 6:
            return []
        retention = Fraction(100 - LOSS[rank - 1], 100)
        return [float(core * retention**hop) for hop in range(1, 4)]

    def targets_in_circle(origin, radius, seen, candidates):
        return sorted({key for key, position, legal in candidates
                       if legal and key not in seen and abs(position - origin) <= radius})

    for rank, count in enumerate([3, 4, 5, 6, 7, 9], 1):
        check(f"split_rank_{rank}_total_with_primary", len(split(rank, 0, 0, 100, range(20))[1]) + 1, count)
    for rank, expected in enumerate([
        [70, 49, 34.3], [76, 57.76, 43.8976], [82, 67.24, 55.1368],
        [88, 77.44, 68.1472], [94, 88.36, 83.0584], [100, 100, 100],
    ], 1):
        check(f"glaive_rank_{rank}_three_bounces", glaive(rank, 100), expected)
    check("unlearned_split", split(0, 0, 0, 100, [1]), (0, []))
    check("split_closed_before_boundary", split(6, 1_999_999, 2_000_000, 100, [1]), (2_000_000, []))
    check("split_ready_at_boundary", split(6, 2_000_000, 2_000_000, 100, [9, 3]), (4_000_000, [(3, 100), (9, 100)]))
    check("split_empty_starts_lock", split(1, 0, 0, 100, []), (2_000_000, []))
    check("split_zero_has_no_empty_darts", split(1, 0, 0, 0, [1, 2]), (2_000_000, []))
    check("split_side_only_budget", split(6, 0, 0, 70_000_000, [6, 4, 7]), (2_000_000, [(4, 70_000_000), (6, 29_999_999)]))
    check("split_primary_and_illegal_excluded_stable_inclusive_radius",
          targets_in_circle(0, 1300, {1}, [(9, 10, True), (1, 20, True), (7, 1300, True),
                                          (2, 1300.01, True), (3, 1, False), (9, 10, True)]), [7, 9])
    check("glaive_unlearned_primary_only", glaive(0, 100), [])
    check("glaive_primary_hit_bonus_ignored", glaive(1, 200), [140, 98, 68.6])
    check("glaive_same_owner_independent_ranks", [glaive(rank, 100) for rank in [1, 6, 0]],
          [[70, 49, 34.3], [100, 100, 100], []])
    check("glaive_skin_preserves_rank", [glaive(2, 100), glaive(2, 100)], [[76, 57.76, 43.8976]] * 2)
    check("glaive_strip_affects_only_future_attack", [glaive(2, 100), glaive(1, 100)],
          [[76, 57.76, 43.8976], [70, 49, 34.3]])
    check("glaive_previous_visited_and_invalid_excluded_at_snapshot",
          targets_in_circle(1000, 500, {1, 3}, [(1, 800, True), (2, 1100, False), (3, 1000, True),
                                               (5, 1500, True), (4, 1501, True)]), [5])
    check("engineering_fixed_outside_aura", (100 + 6) * 1.5 + 30 + 2, 191)
    check("engineering_mobile", 300 * 1.1, 330)
    check("engineering_immobile_stays_zero", 0 * 1.1, 0)
    check("engineering_speed_cap_after_multiplier", min(722, 700 * 1.1), 722)
    return cases


def collect(original):
    wb = workbook(ROOT / "图鉴.xlsx")
    assert wb == workbook(original)
    assert [row["row"] for row in wb["塔技能"]] == [335, 355, 365, 370, 506, 511, 542]
    assert [row["row"] for row in wb["塔与属性"]] == [73, 77, 79, 107, 114]
    for row in wb["塔技能"]:
        _, _, _, _, name, raw, levels, description, ranks, *appendix = row["values"]
        assert all(value is None for value in appendix)
        if raw == "A005":
            assert name == "分裂箭" and levels == 6
            assert [int(x) for x in re.findall(r"攻击(\d+)个", ranks)] == TARGETS
        elif raw == "A052":
            assert name == "月刃" and levels == 6 and "弹射3次" in description
            assert [int(x) for x in re.findall(r"减少(\d+)%", ranks)] == LOSS[:-1] and ranks.endswith("不减少。")
        else:
            assert name == "分裂箭工程升级" and levels == 1 and ranks is None
            assert description == "改进修补匠的技能，增加其2点的攻击力和提高其10%的移动速度。"
    abilities = table("units_abilitydata", "alias", {*SKILLS, *ARROWS, "ANeg", "Aroc", "Amgl", "I561"})
    mounts = table("units_unitabilities", "unitAbilID", TOWERS)
    weapons = table("units_unitweapons", "unitWeapID", TOWERS)
    balances = table("units_unitbalance", "unitBalanceID", TOWERS)
    tech = table("units_upgradedata", "upgradeid", {"k001"})
    item = table("units_itemdata", "itemID", {"i561"})
    campaign = strings("units_campaignabilitystrings.txt", {*SKILLS, *ARROWS, "ANeg", "Aroc"})
    missile = strings("units_campaignunitstrings.txt", TOWERS)
    overrides = [row for row in json.loads((SOURCE / "war3map.w3a.json").read_text())
                 if {row["old"], row["new"]} & ({*SKILLS, *ARROWS, "I561"})]
    assert {row["old"] for row in overrides} == set(ARROWS)
    assert all([(m["key"], m["level"], m["data"], m["value"]) for m in row["mods"]] ==
               [("Efk3", 5, 3, 5), ("Efk3", 6, 3, 7)] for row in overrides)
    assert not any({row["old"], row["new"]} & TOWERS for row in json.loads((SOURCE / "war3map.w3u.json").read_text()))
    for raw in ARROWS:
        fields = abilities[raw]["fields"]
        assert fields["code"] == "Aroc" and fields["Cool1"] == 2
        assert not any(k.startswith("DataA") or (k.startswith("Cool") and k != "Cool1") for k in fields)
        assert all((fields[f"Area{i}"], fields[f"targs{i}"], fields[f"DataB{i}"], fields[f"DataC{i}"])
                   == (1300, "alive,enemies", ARROW_BUDGET, i) for i in range(1, 5))
        assert campaign[raw]["fields"]["Missilespeed"] == "1200"
        assert campaign[raw]["fields"]["MissileHoming"] == "1"
    native_engineering = [row for row in parse_slk(SOURCE / "units_abilitydata.slk") if row["code"] == "ANeg"]
    assert len(native_engineering) == 17 and [row["alias"] for row in native_engineering if "DataA1" in row or "DataB1" in row] == ["ANeg"]
    for raw, (tower, variant) in ENGINEERING.items():
        assert raw in mounts[tower]["fields"]["abilList"].split(",")
        assert abilities[raw]["fields"]["DataC1"] == f"A005,{variant}"
        assert campaign[raw]["fields"]["Ubertip"] == campaign["ANeg"]["fields"]["Ubertip"].split(",")[0]
        assert campaign[raw]["fields"]["Researchubertip"] == campaign["ANeg"]["fields"]["Researchubertip"]
        assert balances[tower]["fields"]["spd"] == 300
    wielders = [row["unitBalanceID"] for row in parse_slk(SOURCE / "units_unitbalance.slk")
                if "k001" in row.get("upgrades", "").split(",")]
    assert wielders == ["G074", "H016"]
    assert tech["k001"]["fields"] == {"upgradeid": "k001", "base1": 2, "base2": 0.3,
                                    "effect1": "ratc", "effect2": "radl", "inherit": 1,
                                    "maxlevel": 6, "mod2": -0.06, "used": 1}
    for tower in wielders:
        fields = weapons[tower]["fields"]
        assert (fields["weapsOn"], fields["weapTp1"], fields["Farea1"], fields["targCount1"]) == (1, "mbounce", 500, 1)
        assert "damageLoss1" not in fields
        assert missile[tower]["fields"]["MissileHoming"] == "1" and missile[tower]["fields"]["Missilespeed"] == "900"
    for tower in TOWERS - set(wielders):
        fields = weapons[tower]["fields"]
        assert (fields["weapTp1"], fields["weapsOn"], fields["atkType1"], fields["rangeN1"],
                fields["dmgplus1"], fields["dice1"], fields["sides1"],
                fields["cool1"], fields["dmgpt1"], fields["backSw1"]) == ("missile", 1, "hero", 1000, 3, 1, 15, 1.26, .73, .54)
        assert "A005" in mounts[tower]["fields"]["heroAbilList"].split(",")
        assert missile[tower]["fields"]["Missilespeed"] == "1200"
    assert item["i561"]["fields"]["uses"] == 1 and item["i561"]["fields"]["abilList"] == "I561"
    assert abilities["I561"]["fields"]["UnitID1"].split(",") == ["H016"] * 4
    for table_name, records in [("units_abilitydata", abilities), ("units_unitabilities", mounts),
                                ("units_unitweapons", weapons), ("units_unitbalance", balances),
                                ("units_upgradedata", tech), ("units_itemdata", item)]:
        assert records, table_name
    input_names = ["main.disasm", "war3map.j", "war3map.w3a", "war3map.w3a.json", "war3map.w3u",
                   "war3map.w3u.json", "units_campaignabilitystrings.txt", "units_campaignunitstrings.txt"]
    return {
        "schemaVersion": 1, "id": "hero-attack-extensions-v1", "workbookRows": wb,
        "workbookHashes": {name: hashlib.sha256(path.read_bytes()).hexdigest()
                           for name, path in {"repository": ROOT / "图鉴.xlsx", "original": original}.items()},
        "sourceHashes": {name: hashlib.sha256((SOURCE / name).read_bytes()).hexdigest() for name in input_names},
        "ability": abilities, "abilityOverrides": overrides, "engineeringFamily": native_engineering,
        "mounts": mounts, "weapons": weapons, "balances": balances, "technology": tech,
        "card": item, "abilityStrings": campaign, "unitStrings": missile,
        "bytecode": collect_bytecode(), "webRules": WEB, "validationCases": contract_cases(),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--original", type=Path, default=DOWNLOAD)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    args = parser.parse_args()
    data = collect(args.original)
    if args.write:
        write_json(OUT, data)
    else:
        assert json.loads(OUT.read_text()) == json.loads(json.dumps(data)), "Recorded evidence changed"
    print(f"7 skill rows and 5 tower rows match both workbooks. {len(data['validationCases'])} Web cases passed.")


if __name__ == "__main__":
    main()
