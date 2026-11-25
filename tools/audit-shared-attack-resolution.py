#!/usr/bin/env python3
"""Audit ordinary weapon profiles and test shared attack resolution boundaries."""

import argparse
from collections import Counter
from contextlib import closing
import json
import re
import struct
import sys

sys.dont_write_bytecode = True
import audit_index as source

OUT = source.ROOT / "docs/rules/shared-attack-resolution.json"
SNAPSHOT = source.ROOT / "reference/map-6.25"
MINIMUM_CONFLICT = {"H032", "G032", "G033", *(f"E{i:03}" for i in range(10, 16))}


def objects(db, family):
    return {alias: json.loads(fields) for alias, fields in db.execute(
        "SELECT object_id,fields FROM object_row WHERE source=?", (f"reference/map-6.25/{family}.json",))}


def terrain_strata():
    raw = (SNAPSHOT / "war3map.w3e").read_bytes()
    assert raw[:4] == b"W3E!"
    offset = 13
    for _ in range(2):
        count, = struct.unpack_from("<I", raw, offset)
        offset += 4 + 4 * count
    width, height, x, y = struct.unpack_from("<IIff", raw, offset)
    tiles = raw[offset+16:]
    assert (width, height, x, y, len(tiles)) == (97, 97, -6144, -6144, 97 * 97 * 7)
    return dict(sorted(Counter(last & 15 for last in tiles[6::7]).items()))


def content(db):
    weapons = objects(db, "units_unitweapons")
    abilities = objects(db, "units_abilitydata")
    unit_abilities = objects(db, "units_unitabilities")
    ids = set()
    for sheet, column in (("塔与属性", 0), ("主线波次", 2), ("无尽与深渊", 3)):
        rows = db.execute("SELECT cells FROM sheet_row WHERE source='图鉴.xlsx' AND sheet=?", (sheet,))
        for (raw,) in rows:
            cells = json.loads(raw)
            if len(cells) > column and isinstance(cells[column], str) and re.fullmatch(
                    r"[A-Za-z][0-9]{3}|m[a-z][0-9]{2}|mBOS", cells[column]):
                ids.add(cells[column])

    missile = {}
    for line in (SNAPSHOT / "units_campaignunitstrings.txt").read_text().splitlines():
        if line.startswith("[") and line.endswith("]"):
            row = missile.setdefault(line[1:-1], {})
        if line.startswith(("MissileHoming=", "Missilespeed=")):
            key, value = line.split("=", 1)
            row[key] = value.split(",")
    mod_keys = {"ua1z", "ua2z", "umh1", "umh2", "uamn", "uaen"}
    overrides = {alias: {m["key"]: m["value"] for m in row["mods"] if m["key"] in mod_keys}
                 for alias, row in objects(db, "war3map.w3u").items()}
    weapon_kinds, homing_counts, speed_fallback = Counter(), Counter(), {}
    for alias in sorted(ids & weapons.keys()):
        base = weapons[alias]
        override = overrides.get(alias, {})
        for index in (0, 1):
            slot = index + 1
            if not override.get("uaen", base.get("weapsOn", 0)) & (1 << index):
                continue
            kind = base[f"weapTp{slot}"]
            weapon_kinds[kind] += 1
            if kind == "normal":
                continue
            row = missile.get(alias, {})
            speed = row.get("Missilespeed", [])
            raw_speed = override.get(f"ua{slot}z", next(iter(speed[index:index+1]), None))
            if raw_speed is None:
                assert len(speed) == 1 and index == 1 and int(speed[0]) > 0
                speed_fallback[alias] = {"slot": slot, "sourceSpeed": None, "selectedSpeed": int(speed[0])}
            else:
                assert int(raw_speed) > 0, (alias, slot, raw_speed)
            track = row.get("MissileHoming", [])
            raw_homing = override.get(f"umh{slot}", next(iter(track[index:index+1]), None))
            homing_counts[(kind, "missing" if raw_homing is None else str(raw_homing))] += 1

    for level in range(159, 164):
        alias = f"n{level}"
        row = weapons[alias]
        assert [row.get(k) for k in ("weapsOn", "weapTp1", "Farea1", "Harea1", "Qarea1",
                                    "Hfact1", "Qfact1", "splashTargs1")] == [1, "msplash", 30, 90, 200, 0.4, 0.2, None]
        assert overrides[alias]["ua1z"] == 750 and overrides[alias]["umh1"] == 0
    too_long = {alias for alias, row in weapons.items() if row.get("minRange") == 9_999_999}
    assert too_long == MINIMUM_CONFLICT
    assert all(alias in ids and weapons[alias]["rangeN1"] == 800 and "uamn" not in overrides.get(alias, {})
               for alias in too_long)
    assert weapons["n153"]["minRange"] == weapons["n156"]["minRange"] == 250
    assert not source.references(db, "minRange") and not source.references(db, "uamn")
    for alias, key, value in (("N523", "DataD1", 0.35), ("N524", "DataA1", 0.9), ("N572", "DataD1", 1)):
        assert abilities[alias][key] == value
    assert not any(k.startswith(("DataA", "DataB")) for k in abilities["N523"])
    assert all("N524" in unit_abilities[unit]["abilList"].split(",") for unit in ("m030", "mw01", "mw11"))
    assert "N523" in unit_abilities["m038"]["abilList"].split(",")
    assert "N571" in unit_abilities["m051"]["abilList"].split(",")
    assert len(source.references(db, "N572")) == 3
    for unit, sheet in (("m030", "主线波次"), ("mw01", "无尽与深渊"), ("mw11", "无尽与深渊")):
        rows = source.workbook_rows(db, unit, sheet)
        assert len(rows) == 2 and all("闪避90%" in str(r["cells"]) for r in rows)
    assert "ChanceToMiss" not in (SNAPSHOT / "war3mapMisc.txt").read_text()
    return {"workbookUnitIds": len(ids), "explicitEnabledWeaponSlots": dict(sorted(weapon_kinds.items())),
            "homingSourceDistribution": {f"{k}/{h}": n for (k, h), n in sorted(homing_counts.items())},
            "secondarySameObjectSpeedChoice": speed_fallback, "cliffLayerVertexCounts": terrain_strata(),
            "minimumRangeChoice": {"decision": "Q78", "raw": 9_999_999, "selected": 0, "maximum": 800, "units": sorted(too_long)},
            "guardTowerSplash": {"units": [f"n{i}" for i in range(159, 164)], "speed": 750, "homing": False,
                                "bands": [[30, 1], [90, 0.4], [200, 0.2]], "sourceMask": None},
            "evasion": {"N523": 0.35, "N524": 0.9, "N572": 1, "A183": 0}}


def probes():
    cases = {}
    def ordinary(target_valid, true_strike, evade, accuracy, uphill, rolls):
        if not target_valid:
            return "invalid", 0
        if true_strike:
            return "hit", 0
        chances = [chance for chance in (max(evade, default=0), accuracy, 25 if uphill else 0) if chance > 0]
        assert len(chances) == len(rolls)
        return ("miss" if any(roll <= chance for roll, chance in zip(rolls, chances)) else "hit",
                len(chances))
    for name, args, expected in (
        ("guarantee_does_not_hit_invulnerable", (False, True, [100], 33, True, []), ("invalid", 0)),
        ("guarantee_skips_each_regular_miss", (True, True, [100], 33, True, []), ("hit", 0)),
        ("target_max_evasion_90_takes_90", (True, False, [90, 35], 0, False, [90]), ("miss", 1)),
        ("target_max_evasion_90_passes_91", (True, False, [90, 35], 0, False, [91]), ("hit", 1)),
        ("uphill_and_accuracy_independent", (True, False, [35], 33, True, [40, 34, 25]), ("miss", 3)),
        ("zero_chances_do_not_draw", (True, False, [0], 0, False, []), ("hit", 0)),
    ):
        actual = ordinary(*args)
        assert actual == expected
        cases[name] = list(actual)

    def release(maximum, buffer, distance, local_limit=None):
        return distance <= (maximum + buffer if local_limit is None else local_limit)
    assert release(900, 250, 1150) and not release(900, 250, 1151)
    assert not release(1200, 3500, 1201, local_limit=1200)

    def projectile(source_status, target_status, captured, live):
        return captured if source_status != "removed" and target_status == "valid" else None
    assert projectile("dead", "valid", ("HERO", 100), ("CHAOS", 800)) == ("HERO", 100)
    assert projectile("removed", "valid", ("HERO", 100), ("HERO", 100)) is None
    assert projectile("alive", "removed", ("HERO", 100), ("HERO", 100)) is None
    assert all(0 <= d <= 800 for d in (0, 250, 800)) and not 0 <= 801 <= 800
    assert not 250 <= 249 <= 900 and 250 <= 250 <= 900
    cases["Q78_minimum_and_existing_artillery_boundary"] = {"selected": [0, 800], "artillery": [250, 900]}
    cases["release_buffer_example"] = [900, 250, 1150]
    cases["in_flight_death_preserves_original_weapon"] = ["HERO", 100]
    return cases


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    with closing(source.connect()) as db:
        facts = content(db)
    result = {"baselineId": "shared-attack-resolution-v1", "source": facts, "validation": probes()}
    payload = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        assert OUT.read_text() == payload, f"{OUT.name} differs"
    else:
        OUT.write_text(payload)
    print(f"{facts['workbookUnitIds']} indexed unit IDs, {sum(facts['explicitEnabledWeaponSlots'].values())} enabled slots, "
          f"{len(facts['secondarySameObjectSpeedChoice'])} secondary speed fallbacks, attack boundary probes passed.")
    print("Q78 minimum range of nine templates resolved; existing positive minima preserved.")


if __name__ == "__main__":
    main()
