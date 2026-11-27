import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleEvent } from "../src/game/event-queue.ts";
import { weapons } from "../src/game/m2/combat.ts";
import { cards } from "../src/game/m2/content.ts";
import { map } from "../src/game/m2/map.ts";
import { drain, newMatch } from "../src/game/m2/match.ts";

const auraCases = [
  ["i704", "n213", "N016"],
  ["i714", "n230", "N103"], ["i716", "n233", "N103"],
  ["i715", "n236", "N104"], ["i717", "n239", "N104"],
];

test("five active N cards carry the source upgrade routes and terminal aura bindings", () => {
  for (const [id, template, skill] of auraCases) {
    const line = cards.get(id);
    assert.equal(line.rarity, "N");
    assert.equal(line.levels.at(-1).id, template);
    assert.ok(line.levels.at(-1).bindings.some(binding => binding.skillId === skill));
    for (const level of line.levels) assert.ok(weapons[level.id]?.length, level.id);
  }
});

test("N016/N103/N104 affect live melee and ranged weapon bases with closed range and no duplicate bonus", () => {
  function hits(victimTemplate, sources, gear = false, reload = false) {
    let state = newMatch("troop-aura", 47);
    state.queue.pending.length = 0;
    scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
    state.clock.targetUs = 1;
    drain(state, 100);
    const [target] = state.enemies;
    const base = { ...map.worker, id: 900, templateId: victimTemplate, population: 5, radius: 72,
      pending: null, qualification: null };
    Object.assign(target, { x: base.x + 180, y: base.y, hp: 100_000, maxHp: 100_000, armor: 0,
      abilities: [], layer: "ground" });
    base.attack = { targetId: target.id, winding: true, startedUs: 1, readyUs: 1_000_000 };
    state.structures = [base, ...sources.map(([templateId, offset], index) => ({
      ...base, attack: undefined, id: 901 + index, templateId, x: base.x + offset, pending: null,
    }))];
    if (gear) state.inventory.push({ id: 920, itemId: "i117", charges: 0, slot: 0, towerId: base.id, point: base });
    state.queue.pending.length = 0;
    scheduleEvent(state.queue, 1, { type: "weapon-fire", towerId: base.id, targetId: target.id, slot: 1, startedUs: 1 });
    if (reload) state = JSON.parse(JSON.stringify(state));
    state.clock.targetUs = 1_000_000;
    while (drain(state, 100) === "pending") {}
    return state.recentHits.find(hit => hit.casterId === base.id).amount;
  }
  for (const [tower, matching, other] of [
    ["n228", "n230", "n236"], ["n231", "n233", "n239"], ["n234", "n236", "n230"], ["n237", "n239", "n233"],
  ]) {
    const baseline = hits(tower, []);
    assert.equal(hits(tower, [[other, 0]]), baseline);
    assert.equal(hits(tower, [[matching, 1000.001]]), baseline);
    assert.ok(Math.abs(hits(tower, [[matching, 1000], [matching, 500]]) - 1.4 * baseline) < 1e-7);
    assert.ok(Math.abs(hits(tower, [["n213", 999], [matching, 1000]], false, true) - 1.55 * baseline) < 1e-7);
    const fixed = hits(tower, [], true) - baseline;
    assert.ok(fixed > 0);
    assert.ok(Math.abs(hits(tower, [["n213", 1000]], true) - (1.15 * baseline + fixed)) < 1e-7);
  }
});
