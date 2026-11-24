#!/usr/bin/env python3
"""Verify the world-object sources and local weapon/lifecycle boundaries."""
from collections import Counter
from contextlib import closing
from itertools import islice
import json
import sys

import audit_index as source

RULES = source.ROOT / "docs/rules"
PATHING = source.ROOT / "reference/map-6.25-pathing"
OUT = RULES / "world-object-damage.json"


def read(name):
    return json.loads((PATHING / name).read_text())


def objects(db):
    item_files = "reference/map-6.25/units_itemdata.json", "reference/map-6.25/war3map.w3t.json"
    item_ids = {r["id"] for r in json.loads((RULES / "item-effect-coverage.json").read_text())["items"]}
    item_fields = {key: json.loads(fields) for key, fields in db.execute(
        "SELECT object_id,fields FROM object_row WHERE source=?", (item_files[0],))}
    base = Counter(fields["HP"] for fields in item_fields.values())
    book = Counter(item_fields[key]["HP"] for key in item_ids)
    assert len(item_ids) == 243 and base == {75: 593, 20: 111, 5: 39} and book == {75: 243}
    assert all(fields["armor"] == "Wood" for fields in item_fields.values())
    query = """SELECT COUNT(*) FROM object_row, json_each(object_row.fields,'$.mods')
               WHERE source=? AND json_extract(value,'$.key') IN ('ihtp','iarm')"""
    overrides, = db.execute(query, (item_files[1],)).fetchone()
    assert overrides == 0
    locations = {}
    for key in ("i421", "i422", "i310", "i723"):
        row, = source.objects(db, key, "units_itemdata", fields=["HP", "armor"])
        locations[key] = row
    return {"sourceFiles": list(item_files), "material": "Wood", "baseCount": sum(base.values()),
            "baseHealthDistribution": dict(sorted(base.items())), "workbookHealthDistribution": book,
            "hpOrMaterialOverrides": overrides, "examples": locations}


def terrain():
    props = Counter(row["id"] for row in read("doodads-decoded.json"))
    assert props == {"D002": 90, "D005": 69, "D006": 56, "D007": 87}
    decorations = {row["new"]: next(mod["value"] for mod in row["mods"] if mod["field"] == "dptx")
                   for row in read("w3d-decoded.json")["groups"][1] if row["new"] in props}
    assert decorations == dict.fromkeys(props, "")
    archive = {row["filename"]: row["matches"] for row in read("extraction.json")["files"]}
    assert archive["war3mapUnits.doo"] == archive["war3map.w3b"] == []
    path = PATHING / "units_destructabledata.slk"
    with path.open() as stream:
        row = set(line.rstrip() for line in islice(stream, 2504, 2529))
    assert {'C;X1;Y105;K"LTlt"', 'C;X2;K"Wood"', 'C;X14;K50.0', 'C;X34;K"tree"',
            'C;X26;K"PathTextures\\4x4Default.tga"'} <= row
    assert not any(line.startswith("C;X27;") for line in row)
    return {"decorationCount": sum(props.values()), "decorations": dict(sorted(props.items())),
            "decorationPathing": dict(sorted(decorations.items())), "terrainOrCustomDestructiblePlacements": 0,
            "tree": {"id": "LTlt", "targetClass": "tree", "maxHealth": 50, "material": "Wood",
                     "alivePathingWidth": 4, "alivePathingHeight": 4, "deathPathTexture": None,
                     "rawSource": "reference/map-6.25-pathing/units_destructabledata.slk", "startLine": 2505}}


def weapons(db):
    fields = ["weapsOn", "weapTp1", "targs1", "splashTargs1", "atkType1", "Farea1", "Harea1", "Qarea1"]
    keys = [*(f"n{n}" for n in range(156, 159)), *(f"E{n:03}" for n in (*range(1, 7), *range(23, 29)))]
    rules = {}
    for key in keys:
        obj, = source.objects(db, key, "units_unitweapons", fields=fields)
        raw = obj["fields"]
        assert raw["weapsOn"] == 1
        direct, splash = (set(raw[field].split(",")) for field in ("targs1", "splashTargs1"))
        if key.startswith("n"):
            assert raw["weapTp1"] == "artillery" and raw["atkType1"] == "pierce"
            assert {"item", "tree", "debris", "wall"} <= direct and {"tree", "debris", "wall"} <= splash
            assert "item" not in splash
        else:
            assert raw["atkType1"] == "hero" and {"item", "debris"} <= direct and "tree" not in direct
            assert "debris" in splash and not splash & {"item", "tree"}
        rules[key] = obj
    return rules


def references(db):
    keys = ("CreateDestructable", "RemoveDestructable", "SetItemInvulnerable", "SetWidgetLife",
            "SetDestructableLife", "SetDestructableInvulnerable", "KillDestructable", "DestructableRestoreLife")
    uses = {key: [r for r in source.references(db, key) if not r["function"].startswith(("main/f5", "main/f6/"))]
            for key in keys}
    assert {key: [(r["function"], r["pc"]) for r in rows] for key, rows in uses.items()} == {
        "CreateDestructable": [("main/f197/f2", 32)], "RemoveDestructable": [("main/f197/f1", 15)],
        "SetItemInvulnerable": [("main/f285/f10", 220)], "SetWidgetLife": [("main/f290/f3", 16)],
        "SetDestructableLife": [], "SetDestructableInvulnerable": [], "KillDestructable": [],
        "DestructableRestoreLife": [],
    }
    rows = source.instructions(db, "main/f285/f10", 214, 225)
    pcs = {row["pc"]: row for row in rows}
    assert pcs[218]["op"] == "eq" and list(pcs[218]["constants"].values())[0]["value"] is False
    assert pcs[219]["args"] == ["0", "l225"]
    assert pcs[223]["op"] == "loadbool" and pcs[223]["args"] == ["r5", "1", "0"]
    assert list(pcs[225]["constants"].values())[0]["value"] == "AnyUnitPickUp"
    uses["itemGetEarlyCheck"] = [rows[0]["sourceLine"], rows[-1]["sourceLine"]]
    return uses


def probes():
    def apply(state, damage, allowed, position="ground"):
        if state["status"] != position or state["invulnerable"] or state["class"] not in allowed or damage <= 0:
            return 0
        result = min(state["hp"], damage)
        state["hp"] -= result
        if state["hp"] == 0:
            state["status"] = "destroyed" if state["class"] == "item" else "dead"
        return result

    fresh = {"class": "item", "hp": 75, "status": "ground", "invulnerable": False}
    item = fresh.copy()
    assert apply(item, 25, {"item"}) == 25 and item["hp"] == 50
    item["status"] = "inventory"
    item["invulnerable"] = True
    assert apply(item, 500, {"item"}) == 0
    item["status"] = "ground"
    assert apply(item, 500, {"item"}) == 0 and item["hp"] == 50
    item = fresh.copy()
    assert apply(item, 75, {"item"}) == 75 and item["status"] == "destroyed"
    assert apply(item, 75, {"item"}) == 0
    untouched = fresh.copy()
    assert apply(untouched, 500, {"tree", "debris", "wall"}) == 0
    tree = {"class": "tree", "hp": 50, "status": "ground", "invulnerable": False}
    overlap = {1, 2}
    assert apply(tree, 500, {"debris", "item"}) == 0 and tree["hp"] == 50
    assert apply(tree, 50, {"tree"}) == 50 and tree["status"] == "dead"
    overlap.discard(1)
    assert overlap == {2} and apply(tree, 100, {"tree"}) == 0
    overlap.discard(1)
    assert overlap == {2}
    decorations = {"class": "decoration", "hp": 0, "status": "art", "invulnerable": False}
    assert apply(decorations, 500, {"tree", "debris", "wall", "item"}) == 0
    return [
        "partial ground hit retains HP through pickup and drop",
        "inventory and preserved invulnerable flag each reject attack",
        "exact lethal hit removes a ground item before any later pickup",
        "unselected ground item does not match artillery splash",
        "dragon debris or item target masks do not hit tree",
        "tree dies at exactly 0, and releases only its own occupancy",
        "death and later scheduled removal cannot release the overlapping tree occupancy",
        "decoration cannot enter combat",
    ]


def main():
    with closing(source.connect()) as db:
        record = {"baseline": "world-object-damage-v1", "objects": objects(db), "terrain": terrain(),
                  "weaponMasks": weapons(db), "source": references(db), "probes": probes(),
                  "web": {"worldObjectDamageMultiplier": 1, "requiresPositiveDamage": True,
                          "usesUnitArmorOrMR": False, "dispatchesUnitDamageOrDeath": False,
                          "releasedAtZeroHp": True, "pickupInvulnerabilityPersistsThroughDrop": True}}
    formatted = json.dumps(record, ensure_ascii=False, indent=2) + "\n"
    if "--write" in sys.argv:
        OUT.write_text(formatted)
    else:
        assert OUT.read_text() == formatted, "Regenerate the world-object table with --write"
    print("243 workbook items (743 base types), 302 decoration instances, 15 weapon templates, 8 boundary probes")


if __name__ == "__main__":
    main()
