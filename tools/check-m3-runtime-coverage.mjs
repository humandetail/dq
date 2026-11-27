// Check the active content projection separately from the static M3 target.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import configuration from "../docs/m3-configuration.json" with { type: "json" };
import target from "../docs/m3-target-dependencies.json" with { type: "json" };
import bindings from "../src/assets/m2/bindings.json" with { type: "json" };
import models from "../src/assets/m2/models.json" with { type: "json" };
import { cards, cardTemplates, items, recipes, openingChoices, workerTowers, ordinaryGoods } from "../src/game/m2/content.ts";
import { weapons } from "../src/game/m2/combat.ts";
import { eventBoxOffers } from "../src/game/m2/event-boxes.ts";
import { m3ContentVersion, m3ConfigVersion } from "../src/game/m2/m3-version.ts";

const missingCards = Object.keys(target.cards).filter(id => !cards.has(id));
const missingItems = Object.keys(target.workbookItems).filter(id => !items.has(id));
const missingOpeningChoices = configuration.opening.pool.filter(id => !openingChoices.includes(id));
const missingExchanges = Object.entries(target.heroOffers).filter(([, offer]) => !cardTemplates.has(offer.card)).map(([id]) => id);

for (const card of cards.values()) {
  assert.ok(target.cards[card.id], card.id);
  assert.deepEqual(card.levels.map(level => level.id), target.cards[card.id].towerLine, card.id);
}
for (const line of [...cards.values(), ...workerTowers.values()]) {
  for (const level of line.levels) {
    assert.ok(weapons[level.id], level.id);
    assert.ok(bindings[level.id] && models[bindings[level.id].asset], level.id);
  }
}
for (const [id, item] of items) {
  const row = target.workbookItems[id];
  assert.ok(row, id);
  assert.deepEqual(recipes.get(id) ?? [], row.materials, id);
  for (const material of row.materials) assert.ok(items.has(material), `${id}: ${material}`);
  const shop = item.sourceAcquisitionText.split("、")[0];
  if (/^(饰品店|武器铺|制作书|成品商店|杂货铺|祈祷神庙)/.test(shop)) {
    assert.ok(ordinaryGoods.has(id), `${id}: ${shop}`);
  }
}
for (const id of openingChoices) {
  assert.ok(configuration.opening.pool.includes(id), id);
  assert.ok(cards.has(id), id);
}

const result = {
  structuralCheck: "passed",
  runtimeBehaviorTested: false,
  activeCounts: { cards: cards.size, openingChoices: openingChoices.length, items: items.size, recipes: recipes.size,
    exchanges: target.counts.heroExchanges - missingExchanges.length },
  pending: { cards: missingCards, items: missingItems, openingChoices: missingOpeningChoices, exchanges: missingExchanges },
};
console.log(JSON.stringify(result, null, 2));
if (process.argv.includes("--complete")) {
  assert.deepEqual(result.activeCounts, {
    cards: target.counts.regularCards, openingChoices: target.counts.openingCandidates,
    items: target.counts.workbookItems, recipes: target.counts.recipes, exchanges: target.counts.heroExchanges,
  });
}

const ledgerFlag = process.argv.indexOf("--object-ledger");
if (ledgerFlag !== -1) {
  const output = process.argv[ledgerFlag + 1];
  assert.ok(output, "Pass an output path after --object-ledger");
  const ledger = {
    contentVersion: m3ContentVersion, configurationVersion: m3ConfigVersion,
    scope: "runtime entries and declared dependencies",
    sourceOfRules: "docs/m3-target-dependencies.json",
    behaviorEvidence: "docs/m3-completion-ledger.md",
    normalEvidence: "docs/m3-normal-verification.md",
    cards: Object.fromEntries(Object.entries(target.cards).map(([id, row]) => [id, {
      available: cards.has(id), opening: openingChoices.includes(id), towerLine: row.towerLine,
      bindings: Object.fromEntries(row.towerLine.map(tower => [tower, target.towers[tower].bindings.map(({ id }) => id)])),
      cases: row.cases
    }])),
    items: Object.fromEntries(Object.entries(target.workbookItems).map(([id, row]) => [id, {
      available: items.has(id), acquisition: row.acquisition, materials: recipes.get(id) ?? [], cases: row.cases
    }])),
    heroOffers: Object.fromEntries(Object.entries(target.heroOffers).map(([id, row]) => [id, {
      available: cardTemplates.has(row.card), card: row.card, tower: row.tower, case: row.case
    }])),
    eventOffers: Object.fromEntries(Object.entries(target.eventOffers).map(([id, row]) => [id, {
      available: eventBoxOffers.has(id), box: row.box, case: row.case
    }])),
    auxiliaryModelBindings: Object.fromEntries(Object.entries(target.auxiliaryUnits).map(([id, row]) => [id, {
      asset: bindings[id]?.asset ?? null, cases: row.cases
    }]))
  };
  await writeFile(output, JSON.stringify(ledger, null, 2) + "\n");
}
