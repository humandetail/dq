#!/usr/bin/env python3
"""Reconcile whole-item coverage where existing rules cover every displayed effect."""

import argparse
from contextlib import closing
import json
import sys

sys.dont_write_bytecode = True
import audit_index as source

RULES = source.ROOT / "docs/rules"
OUT = RULES / "item-coverage-reconciliation-batch-01.json"
STATIC = {
    "i101": {"item-regeneration-batch-01": ("web", {"manaPercent": 20})},
    "i104": {"item-resources-batch-01": ("webStats", [0, 250]),
             "item-regeneration-batch-01": ("web", {"manaPercent": 50})},
    "i108": {"item-attributes": ("webStats", [0, 16, 0]), "item-attack-speed-batch-01": ("webPct", 12)},
    "i112": {"item-attributes": ("webStats", [16, 0, 0]), "item-attack-speed-batch-01": ("webPct", 12)},
    "i114": {"item-attributes": ("webStats", [26, 26, 0]), "item-attack-speed-batch-01": ("webPct", 30)},
    "i125": {"item-flat-attack": ("webFlatAttack", 10), "item-attack-speed-batch-01": ("webPct", 10)},
    "i151": {"item-resources-batch-01": ("webStats", [300, 200])},
}
BOOKS = {"i127": ("I167", "1400经验值"), "i128": ("I168", "1个等级"), "i312": ("I226", "2000经验值"),
         "i313": ("I227", "20000经验值"), "i314": ("I228", "一个等级")}


def read(stem):
    return json.loads((RULES / f"{stem}.json").read_text())


def indexed_book(db, item):
    rows = [r for r in source.workbook_rows(db, item, "装备与道具") if r["cells"][1] == item]
    assert len(rows) == 2 and rows[0]["cells"][:8] == rows[1]["cells"][:8]
    return rows[0]


def report(db):
    scoped_rules = {stem for rules in STATIC.values() for stem in rules}
    table = {stem: {r["id"]: r for r in read(stem)["items"]} for stem in scoped_rules}
    books = {r["id"]: r for r in read("item-targeted-books-batch-01")["items"]}
    items = {}
    for item in (*STATIC, *BOOKS, "i399"):
        row = indexed_book(db, item)
        worksheet = f"装备与道具!H{row['row']}"
        obj, = source.objects(db, item, "units_itemdata")
        record = {"name": row["cells"][0], "workbookCell": worksheet, "sourceAbilList": obj["fields"].get("abilList"),
                  "wholeDescriptionCovered": True}
        if item in STATIC:
            refs = {}
            for stem, (field, expected) in STATIC[item].items():
                values = table[stem][item]
                assert values[field] == expected and (values.get("workbookCell") or values["workbook"]["cell"]) == worksheet
                refs[stem] = {field: expected}
            record["rules"] = refs
        elif item in BOOKS:
            alias, phrase = BOOKS[item]
            known = books[item]
            assert known["workbookCell"] == worksheet and known["alias"] == alias and not known["componentsRemaining"]
            assert phrase in row["cells"][7] and record["sourceAbilList"] == alias
            record["rules"] = {"item-targeted-books-batch-01": {"completed": known["componentsReady"]},
                               "experience-sharing": {"workbookEvidence": phrase}}
        else:
            assert "每局每人免费点击1次" in row["cells"][7] and record["sourceAbilList"] is None
            sku, = [x for x in source.references(db, item) if x["function"] == "main/f292/f6"]
            decision = next(x for x in read("item-lifecycle")["mechanismDecisions"] if x["question"] == "Q44")
            assert "once" in json.dumps(decision)
            record["rules"] = {"item-lifecycle": {"decision": "Q44", "sourceLine": sku["sourceLine"],
                                                   "effect": "once per buyer-owner per game"}}
        items[item] = record
    return {"baselineId": "item-coverage-reconciliation-batch-01",
            "coverage": {"descriptionsVerified": len(items), "newMechanics": 0, "nativeAliasesNewlyAudited": 0}, "items": items}


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
    print(data["coverage"])


if __name__ == "__main__":
    main()
