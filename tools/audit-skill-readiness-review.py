#!/usr/bin/env python3
"""Reconcile the 335 skill implementations with the old source labels."""
from collections import Counter
from contextlib import closing
from pathlib import Path
import json
import sys

import audit_index as source

RULES = source.ROOT / "docs/rules"
INDEX = RULES / "skill-source-coverage.json"
OUT = RULES / "skill-readiness-review.json"
REVIEW = "skill-readiness-review.md"
WORLD = "world-object-damage.md"
WORLD_USERS = {"A014", "A015", "N020", "N021", "N022"}
DESCRIPTION_MARKERS = {
    "N048", "N049", "N050", "N051", "N052", "N053", "N064", "N065", "N066", "N067",
}
LEGACY = frozenset("""
A001 A003 A005 A006 A007 A008 A009 A010 A011 A012 A014 A015 A018 A019 A020 A021 A022 A024 A025 A027
A029 A032 A033 A035 A036 A037 A041 A043 A044 A047 A052 A053 A056 A057 A058 A059 A060 A062 A067 A068
A069 A071 A072 A073 A077 A081 A084 A088 A089 A090 A091 A094 A098 A100 A104 A105 A107 A111 A112 A113
A126 A151 A153 A160 A161 A163 A164 A168 A180 A192 A193 A194 A207 A216 A235 I230 N001 N002 N003 N004
N005 N006 N007 N008 N009 N010 N011 N012 N013 N014 N015 N016 N017 N018 N019 N020 N021 N022 N023 N024
N025 N026 N027 N028 N029 N030 N031 N033 N034 N035 N036 N037 N038 N039 N040 N041 N042 N043 N044 N045
N046 N047 N048 N049 N050 N051 N052 N053 N054 N055 N056 N057 N058 N059 N060 N061 N062 N063 N064 N065
N066 N067 N072 N073 N074 N075 N076 N077 N078 N079 N080 N081 N082 N083 N084 N085 N086 N087 N088 N089
N090 N091 N092 N093 N095 N096 N097 N098 N099 N100 N101 N102 N103 N104 N105 N106 N107 N108 N109 N110
N111 N112 N113 N114 N115 N116 N117 N118 N119 N127 N128 N129 N130 N131 N133 N134 N135 N159 N160 N161
N162 N163 N164 N713 N714 N715 N716 N717 N718 P000 T000 T101 T292 T293 T294 T295 T296
""".split())
SUPPORT = {
    "skill-requiem": ["damage-pipeline", "legacy-skill-attack-batch-01", "skin-and-transformation"],
    "hero-aura-family": ["skin-and-transformation", "shared-attack-resolution", "phantom-lancer-illusions"],
    "hero-attack-extensions": ["shared-attack-resolution", "item-effect-coverage", "weapon-field-source-notes"],
    "dragon-attack-passives": ["dragon-transformation", "shared-attack-resolution", "creep-buffs-orbs-and-immolation"],
    "mana-auras": ["skin-and-transformation", "hero-attribute-interface", "item-regeneration-batch-01"],
    "skill-overpower": ["attack-timing", "phantom-lancer-illusions", "skin-and-transformation"],
    "skill-coup-de-grace": ["shared-attack-resolution", "phantom-lancer-illusions", "item-effect-coverage"],
    "skill-slardar-bash": ["shared-attack-resolution", "item-weapon-effects-batch-01"],
    "skill-wraith-energy-proc": ["phantom-lancer-illusions", "shared-attack-resolution", "native-critical-family"],
    "hero-aura-family-next": ["weapon-field-source-notes", "skin-and-transformation", "summon-and-delivery"],
    "self-buff-batch-01": ["hero-attribute-interface", "attack-timing", "skin-and-transformation"],
    "ogre-multicast": ["ogre-hood-items", "native-targeted-batch-01"],
    "avalanche-native-effect": ["skill-avalanche-proc", "skill-avalanche-effect", "skill-readiness-review",
                                "skin-and-transformation", "shared-attack-resolution"],
    "skill-jingu-and-tidebringer": ["hero-spells-batch-01", "monkey-formation", "shared-attack-resolution",
                                    "native-critical-family", "item-damage-dispatch"],
    "skill-essence-aura-effect": ["orb-and-channel-batch-01", "hero-attribute-interface",
                                 "skin-and-transformation", "phantom-lancer-illusions"],
    "bounty-hunter-tracking": ["native-targeted-batch-01", "item-utility-batch-01", "economy-and-progression"],
    "ward-summons": ["summon-and-delivery", "item-summon-contracts-batch-01", "tower-lifecycle"],
    "night-state-and-regeneration": ["skill-void", "skin-and-transformation", "tower-lifecycle", "phantom-lancer-illusions"],
    "skill-void": ["night-state-and-regeneration", "damage-pipeline", "skin-and-transformation", "phantom-lancer-illusions"],
    "creep-line-and-artillery": ["weapon-field-source-notes", "shared-attack-resolution", "damage-pipeline"],
    "creep-skill-family-001-053": ["autocast", "shared-attack-resolution", "tower-lifecycle"],
    "creep-skill-family-next": ["autocast", "shared-attack-resolution", "native-area-damage"],
    "creep-buffs-orbs-and-immolation": ["shared-attack-resolution", "tower-lifecycle", "item-weapon-effects-batch-01"],
    "creep-damage-auras": ["damage-pipeline", "hero-aura-family"],
    "skill-thunder-axes-effect": ["shared-attack-resolution", "native-area-damage", "damage-pipeline"],
    "skill-lightning-attack-effect": ["shared-attack-resolution", "damage-pipeline"],
    "skill-power-suppression-effect": ["damage-pipeline", "native-area-damage", "doom-devour-borrowed-skills"],
    "hero-attribute-interface": ["hero-progression", "phantom-lancer-illusions", "skin-and-transformation"],
}
DIRECT = {
    "A007": ["legacy-control-and-cast-closure"], "A057": ["legacy-control-and-cast-closure"],
    "A180": ["legacy-control-and-cast-closure", "pathing-and-placement", "shared-attack-resolution"],
    "A035": ["skill-wraith-energy-proc", "phantom-lancer-illusions", "shared-attack-resolution"],
    "A044": ["legacy-skill-attack-batch-01", "shared-attack-resolution"],
    "A056": ["skill-readiness-review", "legacy-control-and-cast-closure", "creep-skill-family-001-053",
             "weapon-field-source-notes", "native-area-damage"],
    "A163": ["focus-fire-native", "shared-attack-resolution", "skin-and-transformation"],
    "P000": ["divine-books", "damage-pipeline", "skin-and-transformation"],
    **dict.fromkeys(("N041", "N042", "N043", "N044"), ["creep-skill-family-next", "summon-and-delivery"]),
}
NOTES = {
    "A056": "ANcl 六档无目标主动的许可、冷却和实际枚举见就绪对照；被动入口保持。",
    "A067": "A148是同技能换皮；被动外壳不附带暴击或主动伤害，自动 blizzard 仍按实际能力尝试。",
    "A035": "原生暴击和相邻 A036 脚本已有各自完整入口。",
    "A044": "A045 独立斩击已补核，原生暴击按共享命中提交。",
    "P000": "本体倍率与 P200 资格/神能的后续已经明确。",
    **dict.fromkeys(("N041", "N042", "N043", "N044"), "灵兽下游 N120–122 法力损毁已定义，沿实际召唤归属。"),
}


def evidence():
    with closing(source.connect()) as db:
        evidence = {}
        for key in ("A056", "A067", "A148", "A150"):
            obj, = source.objects(db, key, "units_abilitydata")
            assert not source.objects(db, key, "war3map.w3a")
            evidence[key] = {"object": obj, "references": source.references(db, key)}
        helix = evidence["A056"]["object"]["fields"]
        assert helix["code"] == "ANcl" and helix["levels"] == 6
        assert [helix.get(f"Cool{n}") for n in range(1, 7)] == [5, 5, 5, 5, None, None]
        assert [helix.get(f"DataF{n}") for n in range(1, 7)] == ["robogoblin"] * 4 + [None, None]
        assert all(f"Cost{n}" not in helix for n in range(1, 7))
        for host in ("H017", "G067", "G032", "G033"):
            cast, = source.objects(db, host, "units_unitweapons", fields=["castpt", "castbsw"])
            assert cast["fields"] == {"castpt": .3, "castbsw": .1}
        for key in ("A067", "A148"):
            row = evidence[key]["object"]["fields"]
            assert row["code"] == "AOcr" and row["levels"] == 6
            assert not any(k.startswith(("Data", "Rng", "Cost", "Cool")) for k in row)
            assert {r["function"] for r in evidence[key]["references"]} == {"main/f59/f1", "main/f291/f3", "main/f291/f27"}
        assert evidence["A150"]["object"]["fields"]["DataD1"] == "A148,A067"
        for host in ("H021", "G059"):
            mount, = source.objects(db, host, "units_unitabilities")
            assert {"A067", "A068", "A069", "T000", "P000"} == set(mount["fields"]["heroAbilList"].split(","))
        refs = source.references(db, "blizzard")
        assert any(r["pc"] == 1091 and r["function"] == "main/f291/f27" for r in refs)
        assert ("main/f291/f14", 285) in {(r["function"], r["pc"]) for r in evidence["A056"]["references"]}
        evidence["blizzardRequest"] = next(r for r in refs if r["pc"] == 1091 and r["function"] == "main/f291/f27")
        evidence["web"] = {
            "A056": {"cd": 5, "castPoint": .3, "castBackswing": .1, "manaCost": 0, "target": "none",
                     "order": "robogoblin", "countAndDamageRadius": 700, "autocastEnemySearch": 650},
            "A067/A148": {"shell": True, "hasNativeCast": False, "hasNativeCritical": False,
                          "autocastPreservesAttempt": True, "autocastEnemySearch": 550, "sharedProcCooldown": 2},
        }
    return evidence


def reconcile():
    old = json.loads(INDEX.read_text())["skills"]
    assert len(LEGACY) == 217 and len(old) == 335 and len({r["id"] for r in old}) == 335
    assert all(r["id"] in LEGACY or r["verification"].get("implementationReady") for r in old)
    world_path = RULES / WORLD
    world_resolved = world_path.is_file() and (RULES / "world-object-damage.json").is_file()
    records = {}
    for row in old:
        key = row["id"]
        verification = row["verification"]
        primary = verification["ruleSection"]
        refs = [primary, *(f"{d}.md" for d in SUPPORT.get(Path(primary).stem, ())),
                *(f"{d}.md" for d in DIRECT.get(key, ()))]
        dependency = []
        if key in WORLD_USERS:
            if world_resolved:
                refs.append(WORLD)
            else:
                dependency.append("world-object-damage")
        assert all((RULES / ref).is_file() for ref in refs), (key, refs)
        baseline = verification["status"]
        kind = "scriptWithInterfaces" if baseline == "script_behavior_partially_verified" else "nativeOrLinked"
        if key in DESCRIPTION_MARKERS:
            assert verification["aocrFamilyReview"]["classification"] == "description_only_base_stat_marker"
            refs.append("weapon-field-source-notes.md")
            kind = "descriptionOnlyNoExtraEffect"
        if key in WORLD_USERS and key.startswith("N"):
            kind = "descriptionWithActualWeapon"
        record = {
            "legacyCohort": key in LEGACY,
            "sourceClassification": baseline,
            "effectKind": kind,
            "implementationReady": not dependency,
            "rules": list(dict.fromkeys(refs)),
            "pendingDependencies": dependency,
        }
        if key in NOTES:
            record["closure"] = NOTES[key]
        records[key] = record
    classifications = Counter(r["sourceClassification"] for r in records.values())
    ready = sum(r["implementationReady"] for r in records.values())
    assert classifications == {"script_behavior_partially_verified": 184, "native_behavior_specified": 151}
    assert sum(r["effectKind"] == "descriptionOnlyNoExtraEffect" for r in records.values()) == 10
    return {
        "scope": "tower-skill-readiness-review",
        "sourceIndex": INDEX.name,
        "counts": {"total": len(records), "legacyCohort": len(LEGACY), "otherExplicit": len(records)-len(LEGACY),
                   "ready": ready, "remaining": len(records)-ready, "sourceClasses": classifications},
        "pending": {k: r["pendingDependencies"] for k, r in records.items() if not r["implementationReady"]},
        "skills": records,
        "focusedSourceChecks": evidence(),
    }


def main():
    result = reconcile()
    data = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if "--write" in sys.argv:
        OUT.write_text(data)
    else:
        assert OUT.read_text() == data, "Regenerate the review with --write"
    print(f"{result['counts']['ready']}/335 ready; {result['counts']['remaining']} pending; "
          f"{result['counts']['legacyCohort']} legacy IDs reconciled")


if __name__ == "__main__":
    main()
