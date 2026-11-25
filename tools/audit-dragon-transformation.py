#!/usr/bin/env python3
"""Check A010/A239 sources and the selected Web transaction. No game runtime."""
import argparse
import contextlib
import hashlib
import io
import itertools
import json
import math
import re
import runpy
import zipfile
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
REF = ROOT / "reference/map-6.25"
OUT = ROOT / "docs/rules/dragon-transformation.json"
IDS = {"A010": ("H003", 1), "A239": ("G077", 23)}
DEPENDENCIES = [
    "Item_Skill_Action", "WAbility_initAbility", "WAbility_W012", "WAbility_W014",
    "WAbility_W016", "WAbility_W018", "ItemSkillUsed",
]
FRAGMENTS = {
    "effect": "main/f291/f14", "finish": "main/f291/f16", "endcast": "main/f291/f17",
    "finishCleanup": "main/f291/f15", "ready": "main/f7/f39",
    "registerEffect": "main/f291/f35", "registerFinish": "main/f291/f36",
    "registerEndcast": "main/f291/f37",
}


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def books():
    records = []
    sources = [ROOT / "图鉴.xlsx", Path("/Users/laihanbin/Downloads/刀圈TD 6.25 图鉴.xlsx")]
    for path in sources:
        with zipfile.ZipFile(path) as archive:
            assert archive.testzip() is None
        book = load_workbook(path, read_only=True, data_only=True)
        rows = [{"row": i, "cells": row} for i, row in enumerate(
            book["塔技能"].iter_rows(max_col=10, values_only=True), 1) if row[5] in IDS]
        assert len(rows) == 14 and all(w["cells"][5] == "A010" for w in rows)
        for entry in rows:
            row = entry["cells"]
            assert row[6] == 6 and all(s in row[7] for s in ("10%", "20秒", "30秒"))
            assert list(map(int, re.findall(r"耗蓝 (\d+)点", row[8]))) == [30, 40, 50, 60, 70, 80]
            assert row[9] == "耗蓝 70／80"
        cd_item = tuple(cell.value for cell in book["装备与道具"][220][:10])
        assert cd_item[1] == "i327" and "减少20%的技能冷却时间" in cd_item[7]
        book.close()
        records.append({"file": path.name, "sha256": sha(path), "columns": "A–J",
                        "塔技能": rows, "装备与道具!A220:J220": cd_item})
    assert records[0]["塔技能"] == records[1]["塔技能"]
    assert records[0]["装备与道具!A220:J220"] == records[1]["装备与道具!A220:J220"]
    return records


def fields():
    prior = read(OUT.with_name("dragon-attack-passives.json"))
    objects = {row["id"]: row for row in prior["ids"]}
    raw_abilities = {row["alias"]: row for row in read(REF / "units_abilitydata.json")}
    balance = {row["unitBalanceID"]: row for row in read(REF / "units_unitbalance.json")}
    types = {row["unitID"]: row for row in read(REF / "units_unitdata.json")}
    weapons = {row["unitWeapID"]: row for row in read(REF / "units_unitweapons.json")}
    mounts = {row["unitAbilID"]: row for row in read(REF / "units_unitabilities.json")}
    raw_deltas = read(REF / "war3map.w3a.json")
    ranks = {}
    for ability, (base, first) in IDS.items():
        obj = objects[ability]
        assert obj["actualProfile"]["fields"]["Ubertip"].count("持有神杖时冷却1秒并且伤害增加变为20%") == 6
        assert obj["w3aOverrides"] == [x for x in raw_deltas if ability in (x["old"], x["new"])]
        raw = obj["mergedFields"]
        assert all(raw[key] == value for key, value in raw_abilities[ability].items())
        assert raw["code"] == "AEme" and raw["levels"] == 6 and raw["reqLevel"] == 1
        levels = []
        for level in range(1, 7):
            target = f"E{first + level - 1:03}"
            expected = {"Cost": 20 + 10 * level, "UnitID": target}
            for field, value in expected.items():
                assert raw[field + str(level)] == value
            for field, value in {"HeroDur": 20, "Cool": 30, "DataA": base, "DataB": 1,
                                 "DataE": 500, "BuffID": "B031"}.items():
                assert raw.get(field + str(level)) == (value if level <= 4 else None)
            assert not any(field + str(level) in raw for field in ("Cast", "Dur", "DataC", "DataD"))
            for key in ("HP", "STR", "STRplus", "AGI", "AGIplus", "INT", "INTplus", "collision", "fused"):
                assert balance[base][key] == balance[target][key]
            assert (balance[target]["HP"], balance[target]["collision"], balance[target]["fused"]) == (100, 72, 20)
            assert (types[base]["targType"], types[target]["targType"], types[target]["movetp"]) == ("ground", "ground", "hover")
            assert weapons[base]["rangeN1"] == weapons[base]["acquire"] == 800
            assert weapons[target]["rangeN1"] == weapons[target]["acquire"] == 1200
            assert "A010" in mounts[target]["heroAbilList"].split(",")
            assert "S371" not in mounts[target]["abilList"].split(",")
            levels.append({"rank": level, "normal": base, "alternate": target, "mana": expected["Cost"],
                           "heroDuration": 20, "initialCooldown": 30, "temporaryHp": 500,
                           "morphFlag": 1, "buff": "B031", "transitionSeconds": 0,
                           "knownRawFields": level <= 4})
        ranks[ability] = levels
    assert not prior["unitDeltas"]
    return ranks


def vm_checks():
    # Load the existing read-only VM with its assertions, then count only new executions.
    with contextlib.redirect_stdout(io.StringIO()):
        vm = runpy.run_path(str(ROOT / "tools/audit-skin-and-transformation.py"))
    vm["COVER"].clear()
    w = vm["World"]()
    u = vm["unit"]("H003")
    w.current = u
    env = w.env
    log = []
    cd = 0
    scepter = False
    temporary = False

    def get_state(handle, state):
        assert handle == w.spell and state == 1
        log.append(("read", cd))
        return cd

    def set_state(handle, state, value):
        nonlocal cd
        assert handle == w.spell and state == 1
        log.append(("write", value))
        cd = value

    def remove(unit, ability):
        log.append(("remove", ability))
        unit["skills"].pop(ability, None)

    env.update(IsTemp=lambda unit: temporary, Has_A_Item=lambda unit: scepter,
               UnitRemoveAbility=remove, UNIT_STATE_MANA="mana",
               IssueImmediateOrder=lambda unit, order: log.append(("order", order)),
               GetUnitState=lambda unit, state: unit["mana"] if state == "mana" else 0)
    w.japi.update(EXGetUnitAbility=lambda unit, aid: aid, EXGetAbilityState=get_state,
                  EXSetAbilityState=set_state,
                  EXGetAbilityDataInteger=lambda aid, rank, field: 20 + 10 * rank)
    ready = vm["Closure"](FRAGMENTS["ready"], [env, w.japi])
    checks = 0
    examples = []
    for aid, scepter, source, p, skip in itertools.product(
        IDS, (False, True), (None, "i327", "B164", "B167"), (None, 0, 1, 5, 10, 11),
        (None, "temp", "worker", "box", "p11", "aborted")
    ):
        temporary = skip == "temp"
        u.update(owner=11 if skip == "p11" else 0, worker=skip == "worker", box=skip == "box",
                 slots={}, skills={aid: 6})
        w.spell = aid
        if source == "i327":
            u["slots"][0] = {"kind": source}
        elif source:
            u["skills"][source] = 1
        if p is not None:
            u["skills"].update(B180=1, P222=p)
        log.clear()
        aborted = skip == "aborted"
        cd = 0 if aborted else 30
        if not aborted:
            env["AnySkillEnd"]()
        finish = [] if temporary or aborted else [
            *([("write", 21)] if scepter else []), ("order", "stop"),
        ]
        assert log == finish
        expect = log.copy()
        remaining = cd
        if skip in (None, "p11", "aborted") and source:
            expect.append(("remove", "B164"))
            expect.append(("read", remaining))
            remaining *= 0.8
            expect.extend([("write", remaining)] * (1 if scepter else 2))
        if skip in (None, "p11", "aborted") and p is not None:
            expect.append(("read", remaining))
            remaining *= (100 - p) / 100 if 1 <= p <= 10 else 1
            expect.extend([("write", remaining)] * (1 if scepter else 2))
        if not temporary and skip != "p11":
            expect.append(("order", "stop"))
        env["AnySkillStop"]()
        assert log == expect, (aid, scepter, source, p, skip, log, expect)
        assert cd == remaining
        if source == "i327" and p in (None, 10) and skip in (None, "aborted"):
            examples.append({"ability": aid, "scepter": scepter, "i327": True, "P222": p,
                             "aborted": aborted, "finish": finish, "endcast": log[len(finish):]})
        checks += 1

    temporary = False
    for aid, owner, worker, box, mirror, temporary in itertools.product(IDS, (0, 11), *[(False, True)] * 4):
        w.spell = aid
        w.log.clear()
        log.clear()
        w.queue.clear()
        u.update(owner=owner, worker=worker, box=box)
        env["J003_Hero"] = {1: u} if mirror else {}
        env["AnySkillStart"]()
        allocated = len(w.queue)
        assert allocated == (2 if owner != 11 and not (worker or box or mirror) else 0)
        assert [v[1] for v in w.log if v[0] == "dependency"] == ([] if temporary else DEPENDENCIES)
        checks += 1

    for aid, rank, remaining, mana in itertools.product(IDS, (0, 1, 6), (0, 1, 21), (29, 30, 79, 80)):
        w.spell = aid
        u.update(skills={aid: rank}, mana=mana)
        cd = remaining
        assert ready(u, aid) is (rank > 0 and not remaining and mana >= 20 + 10 * rank)
        checks += 1

    for kind, event, handler in [
        ("registerEffect", "SPELL_EFFECT", "AnySkillStart"),
        ("registerFinish", "SPELL_FINISH", "AnySkillEnd"),
        ("registerEndcast", "SPELL_ENDCAST", "AnySkillStop"),
    ]:
        calls = []
        env.update(CreateTrigger=lambda: "trigger", Condition=lambda fn: fn,
                   TriggerRegisterPlayerUnitEvent=lambda *args: calls.append(args),
                   TriggerAddAction=lambda *args: calls.append(("action", *args)),
                   TriggerAddCondition=lambda *args: calls.append(("condition", *args)))
        env["EVENT_PLAYER_UNIT_" + event] = event
        vm["Closure"](FRAGMENTS[kind], [env])()
        assert calls[:-1] == [("trigger", p, event, None) for p in (0, 1, 2, 3, 11)]
        assert calls[-1] == ("action" if kind == "registerEffect" else "condition", "trigger", env[handler])
        checks += 1

    spans = {}
    for label, name in FRAGMENTS.items():
        f = vm["function"](name)
        lines = f["instructions"]
        spans[label] = {"function": name, "lines": f["sourceLines"], "pcs": len(lines),
                        "executed": len(vm["COVER"][name])}
        if label == "endcast":
            spans[label]["jumpLabels"] = {k: f["labels"][k] for k in
                                            ("l113", "l123", "l131", "l141", "l149",
                                             "l242", "l252", "l260", "l270", "l278")}
            spans[label]["dragonBranches"] = [x for x in lines if 113 <= x["pc"] <= 148 or 242 <= x["pc"] <= 277]
    return {"probes": checks, "functions": spans, "cooldownExamples": examples,
            "registrationFullyCovered": [FRAGMENTS[f] for f in FRAGMENTS if f.startswith("register")]}


def contracts(ranks):
    # Independent assertions for the Q24 boundaries that are not native bytecode.
    def deadline(has_scepter, reductions):
        result = 21 if has_scepter else 30
        for factor in reductions:
            result *= factor
        return result

    def fold_transition(old, new, current, maximum_delta, alive):
        maximum = new + (old[0] - old[1]) + maximum_delta
        return maximum, min(maximum, max(1, current + maximum_delta)) if alive else 0

    vectors = [
        ("normal", deadline(False, ()), 30),
        ("scepter", deadline(True, ()), 21),
        ("i327NoScepter", deadline(False, (0.8,)), 24),
        ("i327Scepter", deadline(True, (0.8,)), 16.8),
        ("stackedNoScepter", deadline(False, (0.8, 0.9)), 21.6),
        ("stackedScepter", deadline(True, (0.8, 0.9)), 15.12),
        ("scepterP222Ten", deadline(True, (0.9,)), 18.9),
        ("activeGateIndependentOfCooldown", max(20, deadline(True, (0.8,))), 20),
        ("noScepterAfterReturn", deadline(False, ()) - 20, 10),
        ("scepterAfterReturn", deadline(True, ()) - 20, 1),
        ("buffDamageWithoutScepter", 100 * (1.1 + 0.0 + 0.0), 110.0),
        ("buffDamageScepterEndless", 100 * (1.1 + 0.1 + 0.2), 140.0),
        ("entryPreservesExistingHpDelta", fold_transition((1200, 1000), 1000, 800, 500, True), (1700, 1300)),
        ("returnHpFloor", fold_transition((1700, 1000), 1000, 200, -500, True), (1200, 1)),
        ("returnDeadDoesNotRevive", fold_transition((1700, 1000), 1000, 0, -500, False), (1200, 0)),
        ("permanentMaxHpKillsSurviveReturn", fold_transition((1721, 1000), 1000, 1300, -500, True), (1221, 800)),
        ("rankAtEntry", ranks["A239"][5]["alternate"], "E028"),
        ("rankAtNextCast", ranks["A239"][4]["alternate"], "E027"),
        ("sameTemplateGrowth", (14 + (19 - 1) * 5) - (14 + (19 - 1) * 5), 0),
        ("i282HeldRangeFromBeforeToReturn", (800 + 100, 1200, 1200 + 200, 800 + 100), (900, 1200, 1400, 900)),
        ("i282EarlyDropStillWritesRaw", (1200 - 200, 800), (1000, 800)),
        ("rank6WithI304C", (1.2 - .2, .9 - .2, 1.2 - .2), (1, .7, 1)),
    ]
    for name, actual, expected in vectors:
        assert math.isclose(actual, expected) if isinstance(expected, float) else actual == expected, name
    for aid, profiles in ranks.items():
        for profile in profiles:
            mana = 123
            lease = {
                "entity": 102, "slot": "dragon", "actualId": aid, "rank": profile["rank"],
                "normal": profile["normal"], "form": profile["alternate"],
                "expires": 120, "seq": 58, "cooldownExpires": 121,
                "mana": mana - profile["mana"], "temporaryHp": profile["temporaryHp"],
                "B031": True, "liveRank": profile["rank"],
            }
            name = aid + "-" + str(profile["rank"])
            lease["liveRank"] = 0
            loaded = json.loads(json.dumps(lease))
            assert loaded == lease
            assert loaded["expires"] - 116 == 4 and loaded["cooldownExpires"] - 116 == 5
            assert loaded["mana"] + profile["mana"] == mana and loaded["rank"] == profile["rank"]
            assert loaded["B031"] and loaded["form"] == profile["alternate"]
            vectors.append((name + "-rank-snapshot-save", loaded, loaded.copy()))
    return [{"case": name, "expected": expected} for name, _, expected in vectors]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    ranks = fields()
    workbook = books()
    verification = vm_checks()
    vectors = contracts(ranks)
    manifest = read(REF / "manifest.json")["files"]
    for entry in manifest:
        source = REF / entry["file"]
        assert source.stat().st_size == entry["bytes"] and sha(source) == entry["sha256"], source
    data = {"schemaVersion": 1, "baselineId": "dragon-transformation-v1",
            "scope": ["A010", "A239"], "workbooks": workbook, "selectedProfiles": ranks,
            "rules": RULES, "sources": SOURCES,
            "verification": {**verification, "contracts": vectors, "immutableSnapshotFiles": len(manifest),
                             "workbookRowsPerFile": len(workbook[0]["塔技能"])}}
    result = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    for target, line in re.findall(r"\]\(([^():]+?)(?:#L(\d+))?\)", OUT.with_suffix(".md").read_text()):
        path = OUT.parent / target
        assert path.is_file(), target
        if line:
            assert 1 <= int(line) <= len(path.read_text().splitlines()), (target, line)
    if args.write:
        OUT.write_text(result)
    else:
        assert OUT.read_text() == result, OUT
    print(f"dragon-transformation-v1: {verification['probes']} bytecode probes, {len(vectors)} contract vectors, "
          f"{len(manifest)} snapshot files; {len(workbook)} workbooks × 14 rows × 10 columns")


SOURCES = {
    "profiles": ["dragon-attack-passives.json", "reference/map-6.25/manifest.json"],
    "morphFieldLabels": "https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt#L5916",
    "morphFlags": "https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/UnitEditorData.txt",
    "aemeExperiment": "https://github.com/Cokemonkey11/wc3-ability-doc/blob/main/sources/screwthetrees-wc3-editor-ability-insight-document/2023-11-14.md#L4850",
    "japiRemaining": "https://github.com/actboy168/YDWE/blob/master/Development/Plugin/Warcraft3/yd_jass_api/AbilityState.cpp",
    "laterReturnOrders": "https://us.forums.blizzard.com/en/warcraft3/t/melee-custom-bug-exiting-metamorphosis-ignoring-orders/29968",
}

RULES = {
    "status": "Q24 Web-defined, matching Warcraft client not exercised",
    "order": "metamorphosis",
    "transaction": ["validate control/alive/learned/enabled/no-active-AEme/cooldown/mana/order",
                    "CHANNEL then CAST, recheck before spending",
                    "settle mana cost, initial cooldown and same-entity form; schedule expiry",
                    "EFFECT then FINISH then ENDCAST in same battle timestamp; keep FINISH stop and non-Player(11) ENDCAST stop",
                    "native return at t+20 without another spell event"],
    "state1": {"clock": "remaining battle seconds, continues during form", "finishScepter": 21,
               "reducer": ["i327 or B164 or B167 -> remaining * 0.8, consume B164 branch",
                           "B180 -> independently read remaining * (1-P222/100) at ranks 1-10, else *1"],
               "writeMultiplicityPerReducer": {"withoutScepter": 2, "withScepter": 1}},
    "activeSlot": "one AEme state per entity; raw auto readiness does not check active form",
    "return": "same stable entity and pre-cast base template; use current stats, logical slots and runtime effects, never an old unit/attribute snapshot",
    "resources": "temporary 500 max and current HP on entry; at exit remove same temporary contribution and current below 1 floors at 1 for a living hero; dead stays 0; preserve direct max HP offset including A009 kills",
    "weapons": "rebase actual weapon and C by template delta, retain W01-W03 residuals and current projectiles; +3 source overwrite of state37 is independent",
    "range": "template range/acquire rebase preserves unrelated script offsets; clear tracked old i282 writes on entry, use +3 source callback or immediately restore one ranged contribution if no callback registered; on return replace this channel with one currently held contribution",
    "moveAndPlacement": "same occupancy instance and population; preserve script move override; shared Skill_BS_Still at EFFECT only",
    "cancel": "death, deletion, originating slot explicit remove, B031 explicit removal and external permanent type commit use same cleanup; rank rollback, silence and stop after commit keep profile and timer",
    "snapshot": "actual cast id, slot, rank, base type, alternate type, temporary HP, B031 owner, expiry and event sequence, live cooldown and inherited entity state",
    "dependencies": ["skin-and-transformation-v1", "dragon-attack-passives-v1", "hero-progression-v1",
                     "hero-attribute-interface-v1", "weapon-attribute-interface-v1", "attack-timing-v1",
                     "scepter-lifecycle-v1", "damage-pipeline-v1", "autocast", "B05"],
}


if __name__ == "__main__":
    main()
