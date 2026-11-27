import assert from "node:assert/strict";
import { test } from "node:test";

import { drain, enqueue, newMatch, spendableScore } from "../src/game/m2/match.ts";
import { startSeasons } from "../src/game/m2/seasons.ts";

function issue(state, id, action) {
  assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
  state.clock.targetUs++;
  while (drain(state, 1000) === "pending") {}
  return state.commandResults[id];
}

function fixture() {
  const initial = startSeasons();
  const state = newMatch("hero-exchange", 14, initial.seasons);
  state.startingScore = initial.score;
  const pack = state.inventory.find(item => item.itemId === "i004");
  assert.ok(issue(state, "pack", { type: "use-item", itemId: pack.id }).ok);
  assert.ok(issue(state, "opening", { type: "choose-opening", card: state.openingCandidates[0] }).ok);
  return state;
}

test("i546 checks score and material before delivering and binding the i506 fallback exactly once", () => {
  let state = fixture();
  const material = state.cards[0];
  const exchange = { type: "exchange-hero", offer: "i546" };
  assert.equal(issue(state, "poor", exchange).reason, "resources");
  assert.equal(state.cards[0], material);
  assert.equal(state.seasons.spring.counts[9], undefined);
  state.startingScore = 100;
  const result = issue(state, "eligible", exchange);
  const returned = state.cards.find(card => card.id === result.createdId);
  assert.deepEqual([returned.card, returned.slot, returned.bound], ["i506", material.slot, true]);
  assert.equal(state.cards.some(card => card.id === material.id), false);
  assert.equal(spendableScore(state), 0);
  assert.equal(state.seasons.spring.counts[9], 1);
  state = JSON.parse(JSON.stringify(state));
  assert.equal(issue(state, "repeat", exchange).reason, "stock");
  assert.equal(issue(state, "drop", { type: "drop-card", cardId: returned.id }).ok, false);
  assert.equal(state.cards.find(card => card.id === returned.id).slot, returned.slot);
});

test("i549 uses real opening SR once and shares the wave 41 cap without ordinary score debit", () => {
  const state = fixture();
  const exchange = { type: "exchange-hero", offer: "i549" };
  // Closed-case setup represents a previously consumed different offer.
  state.mallHeroClaims = ["i548"];
  state.wave = 40;
  assert.equal(issue(state, "early", exchange).reason, "stock");
  state.wave = 41;
  const result = issue(state, "eligible", exchange);
  assert.ok(result.ok);
  assert.deepEqual(state.mallHeroClaims, ["i548", "i549"]);
  assert.equal(spendableScore(state), 60);
  assert.equal(state.seasons.spring.counts[9], 1);
  assert.deepEqual(state.cards.map(card => card.card), ["i549"]);
  assert.equal(issue(state, "twice", exchange).ok, false);
});
