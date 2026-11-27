import assert from "node:assert/strict";
import test from "node:test";
import { configuration, qualificationChains } from "../src/game/m2/content.ts";
import { newHero } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, newMatch, qualified, restoreHeroState } from "../src/game/m2/match.ts";

function advance(state, deltaUs) {
  state.clock.targetUs += deltaUs;
  while (drain(state, 1000) === "pending") {}
}

function order(state, id, action) {
  assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
}

test("A06 concurrent exchanges consume five actual card instances once and preserve other slots", () => {
  const state = newMatch("m3-qualification-exchange-race", 47);
  const [chain, other] = [...qualificationChains.values()];
  state.qualificationShopOpen = true;
  state.nextId = 100;
  state.inventory = [];
  const materials = configuration.cardPools.R.slice(0, 5).map((card, slot) => ({
    id: 10 + slot, card, slot, point: map.worker, hp: 5, charges: 1,
  }));
  const spare = { ...materials[0], id: 20, slot: null };
  state.cards = [...materials, spare];
  order(state, "first", { type: "exchange", qualification: chain.id });
  order(state, "second", { type: "exchange", qualification: other.id });
  advance(state, 1);
  assert.ok(state.commandResults.first.ok);
  assert.equal(state.commandResults.second.reason, "materials");
  assert.deepEqual(state.cards.map(card => [card.id, card.card, card.slot]),
    [[spare.id, spare.card, null], [state.commandResults.first.createdId, chain.targetedCard, 0]]);
});

test("A06 failed upgrade debits neither resource, and two simultaneous upgrades debit only once", () => {
  const state = newMatch("m3-qualification-upgrade-race", 47);
  const first = qualificationChains.get("P001").levels[0];
  const { gold, wood, populationDelta } = first.upgrade;
  const provider = { ...map.worker, id: 900, templateId: first.id, population: 5, radius: 72,
    qualification: null, pending: null };
  state.structures = [provider];
  state.population = 5;
  const upgrade = { type: "upgrade-tower", towerId: provider.id };
  state.gold = gold - 1;
  const startingLumber = wood + 31;
  state.lumber = startingLumber;
  order(state, "insufficient-gold", upgrade);
  advance(state, 1);
  assert.equal(state.commandResults["insufficient-gold"].reason, "resources");
  assert.deepEqual([state.gold, state.lumber, state.population, provider.pending], [gold - 1, startingLumber, 5, null]);
  state.gold = gold;
  order(state, "upgrade-first", upgrade);
  order(state, "upgrade-second", upgrade);
  advance(state, 1);
  assert.ok(state.commandResults["upgrade-first"].ok);
  assert.equal(state.commandResults["upgrade-second"].reason, "missing");
  assert.deepEqual([state.gold, state.lumber, state.population, provider.pending.upgradeTo],
    [0, startingLumber - wood, 5 + populationDelta, first.upgrade.to]);
  advance(state, Math.round(first.upgrade.seconds * 1_000_000));
  assert.equal(provider.templateId, first.upgrade.to);
  assert.equal(provider.pending, null);
});

test("A07 a carried provider card and a provider under construction or at zero life grant no qualification", () => {
  const state = newMatch("m3-qualification-provider-state", 47);
  const [chain] = [...qualificationChains.values()];
  const hero = { ...map.worker, id: 900, templateId: "H021", population: 20, radius: 72,
    qualification: chain.id, pending: null };
  const provider = { ...map.worker, id: 901, templateId: chain.requireUnit, population: 5, radius: 72,
    qualification: null, pending: { timer: 1, cost: { gold: 0, wood: 0, population: 5 } } };
  state.structures = [hero];
  state.cards = [{ id: 902, card: chain.targetedCard, slot: 0, point: map.worker, hp: 5, charges: 1 }];
  assert.equal(qualified(state, hero.id), false);
  state.structures.push(provider);
  assert.equal(qualified(state, hero.id), false);
  provider.pending = null;
  provider.life = { hp: 0 };
  assert.equal(qualified(state, hero.id), false);
  provider.life.hp = 1;
  assert.equal(qualified(state, hero.id), true);
  assert.equal(state.structures.length, 2);
});

test("A07 a zero-life hero has no B015, while restoring the holder preserves its assignment and RNG", () => {
  const state = newMatch("m3-qualification-holder-state", 47);
  const [chain] = [...qualificationChains.values()];
  const holder = { ...map.worker, id: 900, templateId: "H021", population: 20, radius: 72,
    hero: newHero("H021"), qualification: chain.id, pending: null,
    life: { hp: 100, maximum: 100, staticMaximum: 100, lastUs: 0, regen: 0 } };
  const provider = { ...map.worker, id: 901, templateId: chain.requireUnit, population: 5, radius: 72,
    qualification: null, pending: null };
  state.structures = [holder, provider];
  restoreHeroState(state);
  assert.equal(qualified(state, holder.id), true);
  holder.life.hp = 0;
  const restored = JSON.parse(JSON.stringify(state));
  restoreHeroState(restored);
  const restoredHolder = restored.structures[0];
  assert.equal(restoredHolder.qualification, chain.id);
  assert.equal(restored.randomState, state.randomState);
  assert.equal(qualified(restored, holder.id), false);
  restoredHolder.life.hp = restoredHolder.life.maximum;
  assert.equal(qualified(restored, holder.id), true);
  assert.equal(restored.randomState, state.randomState);
});
