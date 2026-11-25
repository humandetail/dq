#!/usr/bin/env python3
"""Validate M2 scope and reproduce its item index; no game/runtime assertions."""
import argparse
from collections import Counter
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]

# Inclusive roll intervals from docs/rules/economy-and-progression.md.
EXPECTED_CARD_RANGES = {
    "i001": [[1, 79, "N"], [80, 100, "R"]],
    "i002": [[1, 9, "SR"], [10, 79, "R"], [80, 100, "N"]],
    "i003": [[1, 7, "SSR"], [8, 41, "SR"], [42, 100, "R"]],
    "i005": [[1, 13, "SSR"], [14, 100, "SR"]],
}
EXPECTED_OPENING_ORDER = ["i564", "i581", "i569", "i576"]


def read(path):
    return json.loads((ROOT / path).read_text())


def workbook_acquisition():
    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(ROOT / "图鉴.xlsx") as z:
        strings = []
        if "xl/sharedStrings.xml" in z.namelist():
            strings = ["".join(e.itertext()) for e in ET.fromstring(z.read("xl/sharedStrings.xml"))]
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        sheet = next(s for s in wb.find("s:sheets", ns) if s.attrib["name"] == "装备与道具")
        rid = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
        rel = next(r for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels")) if r.attrib["Id"] == rid)
        target = rel.attrib["Target"]
        path = target.lstrip("/") if target.startswith("/") else "xl/" + target
        result = {}
        for row in ET.fromstring(z.read(path)).findall("s:sheetData/s:row", ns):
            cells = {}
            for c in row:
                col = re.sub(r"\d", "", c.attrib["r"])
                value = c.find("s:v", ns)
                text = value.text if value is not None else "".join(c.find("s:is", ns).itertext()) if c.find("s:is", ns) is not None else ""
                cells[col] = strings[int(text)] if c.attrib.get("t") == "s" else text
            if cells.get("B"):
                result[cells["B"]] = cells.get("G", "")
        return result


def build():
    cfg = read("docs/m2-configuration.json")
    economy = {r["id"]: r for r in read("docs/rules/economy-data.json")["items"]}
    effects = {r["id"]: r for r in read("docs/rules/item-effect-coverage.json")["items"]}
    source_recipes = read("docs/rules/item-lifecycle.json")["tables"]["recipes"]
    pools = read("docs/rules/item-reward-packs-batch-01.json")["pools"]
    acquisition = workbook_acquisition()
    cards = set(sum(cfg["cardPools"].values(), []))
    pool_sizes = {rarity: len(pool) for rarity, pool in cfg["cardPools"].items()}
    assert pool_sizes == {"N": 4, "R": 9, "SR": 4, "SSR": 2}
    assert len(cards) == 19
    assert cfg["openingChoiceOrder"] == EXPECTED_OPENING_ORDER, "M2 opening choice order changed"
    assert set(EXPECTED_OPENING_ORDER) == set(cfg["cardPools"]["SR"])
    assert cfg["cardRolls"].keys() == EXPECTED_CARD_RANGES.keys(), "M2 draw card IDs changed"
    for item, roll in cfg["cardRolls"].items():
        assert roll["gold"] == economy[item]["fields"]["goldcost"]["value"]
        assert roll["ranges"] == EXPECTED_CARD_RANGES[item], f"{item}: rarity roll intervals changed"

    for item, overlay in cfg["chestOverrides"].items():
        group = pools[item]["orderedGroups"][overlay["groupIndex"]]
        assert group == {"weight": overlay["weight"], "entries": overlay["originalEntries"]}
        assert set(overlay["entries"]) <= cards
        group["entries"] = overlay["entries"]
    seeds = set(sum(cfg["itemSeedGroups"].values(), []))
    reasons = {i: [group] for group, ids in cfg["itemSeedGroups"].items() for i in ids}
    for box in cfg["itemSeedGroups"]["chestsAndKeys"][:4]:
        for group in pools[box]["orderedGroups"]:
            for item in group["entries"]:
                assert item in economy or item in cards, (box, item)
                if item in economy:
                    seeds.add(item)
                    reasons.setdefault(item, []).append(box + "奖项")
    selected = set(seeds)
    while True:
        old = set(selected)
        for r in source_recipes:
            book_reachable = any(m in selected and effects.get(m, {}).get("kind") == "制作书" for m in r["materials"])
            if r["result"] in selected or book_reachable:
                for item in [r["result"], *r["materials"]]:
                    selected.add(item)
                    reason = "配方:" + r["result"]
                    if reason not in reasons.setdefault(item, []):
                        reasons[item].append(reason)
        if selected == old:
            break
    assert selected <= economy.keys()
    forbidden = set(cfg["noAcquisitionIds"] + cfg["deferredModeItems"])
    assert not selected & forbidden
    assert all(r["id"] in selected for r in cfg["gradeAcceptanceRepresentatives"])
    recipes = [r for r in source_recipes if r["result"] in selected]
    by_result = {}
    for r in recipes:
        assert set(r["materials"]) <= selected
        assert r["result"] not in by_result, "Keep multiple recipes explicit before deriving a cost"
        by_result[r["result"]] = r

    def leaves(item, stack=()):
        assert item not in stack, "Recipe cycle"
        if item not in by_result:
            return Counter({item: 1})
        total = Counter()
        for material in by_result[item]["materials"]:
            total.update(leaves(material, (*stack, item)))
        return total

    # Gate lower bounds only: they do not imply sufficient gold, stock or combat wins.
    gates = {i: 999 for i in selected}
    ordinary_shops = ("饰品店", "武器铺", "制作书一", "制作书二", "制作书三", "制作书四", "制作书五", "成品商店", "祈祷神庙", "杂货铺")
    for i in selected:
        if any(shop in acquisition.get(i, "") for shop in ordinary_shops):
            gates[i] = 0
    for group, gate in [("openingAndGrowth", 0), ("prayerShop", 0), ("mysteryShop", 21), ("challengeShop", 11), ("mainlineDropsAndRunes", 1)]:
        for i in cfg["itemSeedGroups"][group]:
            gates[i] = min(gates[i], gate)
    for i in ["i132", "i134", "i263"]:
        gates[i] = 1  # Growth requires actual 1400 souls; no fabricated wave guarantee.
    for i, gate in {"i401":0,"i402":1,"i403":10,"i404":30,"i411":0,"i412":0,"i413":10,"i414":21,"i278":45}.items():
        gates[i] = min(gates[i], gate)
    for box in ["i401", "i402", "i403", "i404"]:
        for group in pools[box]["orderedGroups"]:
            for item in group["entries"]:
                if item in selected:
                    gates[item] = min(gates[item], gates[box])
    while True:
        old = dict(gates)
        for r in recipes:
            gates[r["result"]] = min(gates[r["result"]], max(gates[m] for m in r["materials"]))
        gates["i330"] = min(gates["i330"], gates["i332"])
        if gates == old:
            break
    assert max(gates.values()) < 999
    source_refs = ["docs/rules/economy-data.json", "docs/rules/item-effect-coverage.json", "docs/rules/item-lifecycle.json", "docs/rules/item-reward-packs-batch-01.json", "docs/rules/workbook-coverage-readiness.json", "docs/rules/session-and-task-state.json", "图鉴.xlsx"]
    entries = []
    for item in sorted(selected):
        e, effect = economy[item], effects[item]
        assert effect["wholeItemReady"] is True
        fields = e["fields"]
        row = {"id":item,"name":e["name"],"kind":effect["kind"],"itemLevel":fields.get("Level", {}).get("value"),"objectGold":fields.get("goldcost", {}).get("value"),"objectLumber":fields.get("lumbercost", {}).get("value"),"sourceCell":e["workbookCell"],"sourceAcquisitionText":acquisition[item],"entryWaveLowerBound":gates[item],"includedBy":sorted(reasons[item]),"effectRules":sorted({c["rule"] for c in effect["components"] if c.get("rule")})}
        if item in by_result:
            leaf = leaves(item)
            row["recipeIndex"] = by_result[item]["index"]
            row["materialsInSourceOrder"] = by_result[item]["materials"]
            row["recursiveMaterialQuantities"] = dict(sorted(leaf.items()))
            row["materialObjectPriceSum"] = {key:sum(qty * economy[m]["fields"].get(field, {}).get("value", 0) for m, qty in leaf.items()) for key, field in [("gold", "goldcost"), ("lumber", "lumbercost")]}
        entries.append(row)
    excluded = [{"id":i,"name":economy[i]["name"],"reason":"no-known-acquisition" if i in cfg["noAcquisitionIds"] else "later-mode" if i in cfg["deferredModeItems"] else "outside-selected-reward-and-recipe-closure"} for i in sorted(economy.keys() - selected)]
    return {"version":cfg["version"],"status":"planning-index-not-runtime-content","sourceRefs":source_refs,"notes":["Source workbook acquisition text is retained verbatim; later rule closures and M2 configuration govern unknown entries.","Entry wave is a channel-opening lower bound, not a guaranteed acquisition wave.","Recursive material totals use original object prices, not finished-item object value; rewards, stock and challenge wins are additional conditions."],"counts":{"items":len(entries),"recipes":len(recipes),"kinds":dict(Counter(r["kind"] for r in entries)),"excludedWorkbookItems":len(excluded)},"items":entries,"excluded":excluded}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="Regenerate the planning index, never the workbook")
    args = parser.parse_args()
    result = build()
    path = ROOT / "docs/m2-item-index.json"
    if args.write:
        path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    else:
        assert path.exists() and json.loads(path.read_text()) == result, "M2 item index is stale; inspect changes, then regenerate with --write"
    print(json.dumps({"status":"passed","counts":result["counts"],"runtimeTested":False}, ensure_ascii=False))
