import assert from "node:assert/strict";
import { test } from "node:test";
import { newHero, learnableSkills } from "../src/game/m2/hero.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, enqueue, newMatch } from "../src/game/m2/match.ts";
import { startSeasons } from "../src/game/m2/seasons.ts";

const second = 1_000_000;
function advance(state, time) {
  state.clock.targetUs = time;
  while (drain(state, 1000) === "pending") {}
}
function issue(state, id, action) {
  assert.ok(enqueue(state, { id, matchId: state.matchId, action }));
  advance(state, state.queue.nowUs + 1);
  return state.commandResults[id];
}
function fixture() {
  const state = newMatch("wisp", 14, startSeasons().seasons);
  state.queue.pending.length = 0;
  const base = { ...map.worker, radius: 72, pending: null, qualification: null, population: 20 };
  const source = { ...base, id: 900, templateId: "H033", hero: newHero("H033") };
  const target = { ...base, id: 901, templateId: "H038", x: base.x + 480, hero: newHero("H038") };
  source.hero.ranks = { A111: 1, A112: 6, A113: 6 };
  target.hero.ranks = { A153: 1 };
  source.hero.natural = { STR: 1, AGI: 1, INT: 3000 };
  target.hero.natural = { STR: 1, AGI: 5, INT: 10 };
  state.structures = [source, target];
  return { state, source, target, link: { type: "cast-hero", towerId: source.id, skillId: "A111", targetId: target.id } };
}

test("wisp links use a delayed commit, live scepter, segmented stat contribution and exact cutoff", () => {
  const { state, source, target, link } = fixture();
  state.inventory.push({ id: 950, itemId: "i310", charges: 0, slot: 0, towerId: source.id, point: source });
  assert.ok(issue(state, "link", link).ok);
  assert.equal(source.wispLink, undefined);
  advance(state, 400001);
  assert.equal(source.wispLink.targetId, target.id);
  assert.equal(target.wispLinked, true);
  assert.equal(target.scepterSwap, undefined);
  assert.ok(issue(state, "overload", { ...link, skillId: "A112" }).ok);
  advance(state, 1_350_000);
  assert.deepEqual(source.wispLink.boost, { stat: "INT", amount: 2100 });
  assert.equal(target.scepterSwap.readyUs, 11_300_001);

  const restored = JSON.parse(JSON.stringify(state));
  const [wisp, ally] = restored.structures;
  ally.x = wisp.x + 1000;
  advance(restored, 2_310_000);
  assert.equal(wisp.wispLink.targetId, ally.id);
  ally.x += 0.001;
  advance(restored, 3_310_000);
  assert.equal(wisp.wispLink, undefined);
  assert.equal(ally.wispLinked, undefined);
  assert.equal(ally.scepterSwap, undefined);
});

test("wisp skin swaps the paid slot, keeps old overload until shutoff, and restores allied relocation", () => {
  const { state, source, target, link } = fixture();
  source.hero.paid.push("A112");
  issue(state, "link", link);
  advance(state, 400001);
  assert.ok(issue(state, "overload", { ...link, skillId: "A112" }).ok);
  advance(state, 1_350_000);
  assert.equal(source.wispLink.boost.amount, 2100);
  assert.ok(issue(state, "skin", { type: "choose-skin", towerId: source.id, choice: "S192" }).ok);
  assert.equal(source.hero.ranks.A142, 6);
  assert.equal(source.wispOverload.buff, "A112");
  assert.ok(learnableSkills("G057").some(skill => skill.skillId === "A142"));
  advance(state, 2_310_000);
  assert.equal(source.wispLink.boost, undefined);
  assert.ok(issue(state, "off", { ...link, skillId: "A142" }).ok);
  const point = { x: -288, y: -640 };
  assert.ok(issue(state, "relocate", { type: "cast-hero", towerId: source.id, skillId: "A113", point }).ok);
  advance(state, state.queue.nowUs + .31 * second);
  assert.notDeepEqual({ x: target.x, y: target.y }, point);
  const restored = JSON.parse(JSON.stringify(state));
  advance(restored, state.queue.nowUs + .10 * second);
  assert.deepEqual({ x: restored.structures[1].x, y: restored.structures[1].y }, point);
  assert.notDeepEqual({ x: restored.structures[0].x, y: restored.structures[0].y }, { x: source.x, y: source.y });
});
