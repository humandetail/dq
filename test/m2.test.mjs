import { scheduleEvent } from "../src/game/event-queue.ts";
import { heroThresholds } from "../src/game/m2/hero.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { configuration, cards, chestPools, items, openingChoices, qualificationChains, recipes, seasonTasks, workerTowers } from "../src/game/m2/content.ts";
import { buildAnchor, chooseWaypoint, map, roadEdges, mapVersion } from "../src/game/m2/map.ts";
import { circleId, containmentPoints, creditTime, drain, enqueue, grantHeroExperience, newMatch, qualified, removeDeadEnemy, restoreHeroState, talentHeroDamageFactor } from "../src/game/m2/match.ts";
import { movementSweep, moveAlongRoute, moveUnits } from "../src/game/m2/movement.ts";
import { findPath, staticSweep } from "../src/game/m2/pathfinding.ts";
import { challengeTemplates, drawMysteryStock } from "../src/game/m2/shops.ts";
import { gameStartUs, waves } from "../src/game/m2/waves.ts";

const second = 1_000_000;
const advanceTo = (state, targetUs, limit = 10_000) => {
  state.clock.targetUs = targetUs;
  while (drain(state, limit) === "pending") {}
};

function submit(state, id, action) {
  assert.equal(enqueue(state, { id, matchId: state.matchId, action }), true);
  advanceTo(state, state.clock.targetUs + 1);
  return state.commandResults[id];
}

function openHeroChoices(state) {
  const pack = state.inventory.find(item => item.itemId === "i004");
  assert.equal(submit(state, "open-starter", { type: "use-item", itemId: pack.id }).ok, true);
}

test("M2 content resolves the configured pools, qualification providers, skills, worker chains and recipes", () => {
  assert.deepEqual(openingChoices, ["i564", "i581", "i569", "i576"]);
  assert.deepEqual(openingChoices.map(id => cards.get(id).name), ["小小", "双头龙", "暗影萨满", "复仇之魂"]);
  assert.equal(cards.get("i564").levels[0].fields.STR.value, 28);
  assert.equal(cards.get("i564").levels[0].growth.fields.AGI.selectedValue, 0);
  assert.deepEqual([...cards.keys()], Object.values(configuration.cardPools).flat());
  assert.equal(cards.size, 19);
  assert.equal(workerTowers.size, 3);
  for (const tower of [...cards.values(), ...workerTowers.values()]) {
    for (let i = 1; i < tower.levels.length; i++) {
      assert.equal(tower.levels[i - 1].upgrade.to, tower.levels[i].id);
    }
    assert.ok(tower.levels.some(level => level.bindings.length), tower.root);
    for (const level of [...tower.levels, ...tower.forms]) {
      for (const binding of level.bindings) assert.ok(binding.rules.length, binding.skillId);
    }
  }
  assert.equal(qualificationChains.size, 13);
  for (const chain of qualificationChains.values()) {
    assert.equal(chain.levels.at(-1).id, chain.requireUnit);
  }
  assert.equal(items.size, 202);
  assert.equal(recipes.size, 72);
  assert.deepEqual(recipes.get("i265"), ["i266", "i308"]);
  for (const material of [...recipes.values()].flat()) assert.ok(items.has(material), material);
  assert.deepEqual(chestPools.get("i404").find(group => group.weight === 30).entries, ["i502", "i503"]);
  assert.equal(seasonTasks.spring.length + seasonTasks.summer.length, 13);
});

test("M2 opening, construction, cancellation and refund are ordered and survive a snapshot", () => {
  let state = newMatch("start", 47);
  openHeroChoices(state);
  const openingRandomState = state.randomState;
  const choice = submit(state, "initial", { type: "choose-opening", card: "i581" });
  assert.equal(choice.ok, true);
  assert.equal(state.randomState, openingRandomState);
  assert.equal(enqueue(state, { id: "initial", matchId: state.matchId, action: { type: "choose-opening", card: "i581" } }), false);
  assert.equal(submit(state, "second", { type: "choose-opening", card: "i569" }).ok, false);

  const openCard = state.cards[0];
  const bad = submit(state, "bad", { type: "build-card", cardId: openCard.id, point: { x: 0, y: 0 } });
  assert.deepEqual(bad, { ok: false, reason: "placement" });
  assert.deepEqual(state.cards, [openCard]);
  assert.equal(state.gold, 2000);
  assert.equal(state.population, 0);

  const construction = submit(state, "construction", {
    type: "build-card", cardId: openCard.id, point: { x: -278, y: -174 },
  });
  assert.equal(construction.ok, true);
  assert.equal(state.gold, 2000);
  assert.equal(state.population, 20);
  assert.equal(state.cards.length, 0);
  assert.equal(state.structures[0].qualification, null);

  state = JSON.parse(JSON.stringify(state));
  assert.equal(submit(state, "cancel", { type: "cancel-construction", towerId: construction.createdId }).ok, true);
  assert.equal(state.population, 0);
  assert.equal(state.cards.length, 1);
  assert.equal(state.cards[0].card, "i581");
  assert.notEqual(state.cards[0].id, openCard.id);
  assert.deepEqual(state.cards[0].point, { x: -288, y: -160 });
  advanceTo(state, 2 * second);
  assert.equal(state.structures.length, 0);
  assert.equal(state.randomState, openingRandomState);

  const built = submit(state, "base", { type: "build-worker-tower", tower: "n001", point: { x: -288, y: -160 } });
  assert.equal(state.gold, 1900);
  assert.equal(state.population, 5);
  assert.equal(submit(state, "refund", { type: "cancel-construction", towerId: built.createdId }).ok, true);
  assert.equal(state.gold, 2000);
  assert.equal(state.population, 0);
});

test("all 13 M2 qualification chains consume five cards at the exchange and require completed Max construction", () => {
  for (const [index, chain] of [...qualificationChains.values()].entries()) {
    let state = newMatch(`qualification-${index}`, [47, 811, 1709, 20261124][index % 4]);
    // Controlled economy fixtures. They do not provide full-match acquisition evidence.
    state.gold = 100_000;
    state.inventory = [];
    state.nextId = 7;
    state.cards = configuration.cardPools.R.slice(0, 6).map((card, slot) => ({ id: slot + 1, card, slot, point: map.worker, hp: 5, charges: 1 }));
    assert.equal(submit(state, "closed", { type: "exchange", qualification: chain.id }).reason, "closed");
    state.qualificationShopOpen = true;
    const offer = submit(state, "exchange", { type: "exchange", qualification: chain.id });
    assert.equal(offer.ok, true);
    assert.deepEqual(state.cards.map(card => card.card), [configuration.cardPools.R[5], chain.targetedCard]);
    const built = submit(state, "build", { type: "build-card", cardId: offer.createdId, point: { x: -288, y: -192 } });
    assert.equal(built.ok, true);
    state.structures.push({ id: 9000, qualification: chain.id, templateId: "H021", x: 288, y: 128, radius: 72, population: 20, pending: null });
    assert.equal(qualified(state, 9000), false);
    advanceTo(state, state.clock.targetUs + second);
    for (const level of chain.levels.slice(0, -1)) {
      assert.equal(state.structures[0].templateId, level.id);
      const gold = state.gold;
      assert.equal(submit(state, `upgrade-${level.id}`, { type: "upgrade-tower", towerId: built.createdId }).ok, true);
      assert.equal(state.gold, gold - level.upgrade.gold);
      assert.equal(qualified(state, 9000), false);
      state = structuredClone(state);
      advanceTo(state, state.clock.targetUs + second);
      assert.equal(state.structures[0].templateId, level.upgrade.to);
    }
    assert.equal(qualified(state, 9000), true);
    state.structures.shift();
    assert.equal(qualified(state, 9000), false);
  }
});

test("M2 bounded queue drains equivalently at 1×, 4×, paused and restored in slices", () => {
  const a = newMatch("clock", 811);
  const b = structuredClone(a);
  creditTime(a, 42_000);
  while (drain(a, 9_000) === "pending") {}
  b.clock.speed = 4;
  creditTime(b, 5_500);
  b.clock.paused = true;
  creditTime(b, 999_000);
  b.clock.paused = false;
  creditTime(b, 5_000);
  let c = b;
  while (drain(c, 250) === "pending") c = structuredClone(c);
  c.clock.speed = 1;
  assert.deepEqual(a, c);

  const late = newMatch("late", 47);
  openHeroChoices(late);
  creditTime(late, 40_000);
  const credited = late.clock.targetUs;
  assert.equal(enqueue(late, { id: "late", matchId: late.matchId, action: { type: "choose-opening", card: "i564" } }), true);
  advanceTo(late, credited);
  assert.equal(late.openingCard, null);
  advanceTo(late, credited + 1);
  assert.equal(late.openingCard, "i564");
});

test("the M2 scheduler executes 2300 regular arrivals and cancels the tied last batch before timeout", () => {
  const state = newMatch("scheduled", 1709);
  const last = waves.at(-1);
  assert.equal(last.deadlineUs - gameStartUs, 3652 * second);
  const batches = new Map();
  let previous = 0;
  state.clock.targetUs = last.deadlineUs + 15 * second;
  do {
    const status = drain(state, 1);
    if (state.totalArrivals !== previous) {
      assert.equal(state.totalArrivals - previous, 1);
      previous = state.totalArrivals;
      const batch = batches.get(state.wave) ?? [];
      batch.push(state.queue.nowUs);
      batches.set(state.wave, batch);
    }
    if (state.wave === 53) assert.equal(state.bossArrivalUs - gameStartUs, 3172 * second);
    // The timeline fixture removes spawned enemies between callbacks to reach every timer.
    state.enemies.length = 0;
    if (status === "stopped") break;
    assert.equal(status, "pending");
  } while (true);
  assert.equal(state.totalArrivals, 2301);
  assert.equal(batches.get(53)[0] - gameStartUs, 2992 * second);
  assert.equal(batches.get(54)[0] - gameStartUs, 3042 * second);
  assert.equal(batches.get(55)[0] - gameStartUs, 3172 * second);
  for (const wave of waves) {
    const actual = batches.get(wave.number);
    assert.equal(actual.length, wave.batches);
    assert.equal(actual.at(-1), wave.startUs + (wave.batches - 1) * wave.intervalUs);
  }
  assert.deepEqual(state.result, { reason: "timeout", atUs: last.deadlineUs });
  assert.deepEqual(state.queue.pending, []);
});

function residual(count, withOutside = false) {
  const enemy = {
    unitId: "m001", points: 1, hp: 60, mana: 60, armor: null, wave: 1, speed: 0, radius: 1,
    layer: "fly", previousWaypoint: null, waypoint: 0, initialOverlaps: [], x: 300, y: 300,
  };
  const units = Array.from({ length: count }, (_, index) => ({ ...enemy, id: 1_000 + index }));
  if (withOutside) units.push({ ...enemy, id: 2_000, x: map.containment.maxX + 32 });
  return units;
}

test("ordinary and final-boss C01 use the first batch atomically, permit equality, and ignore the outside", () => {
  for (const wave of [waves[0], waves[54]]) {
    for (const [count, failed] of [[99, false], [100, true]]) {
      const state = newMatch("capacity", 47);
      state.openingChoicesUnlocked = true;
      // Fast-forward the phase fixture while losing no same-time priority at the actual check.
      state.queue.pending = state.queue.pending.filter(event => event.payload.type === "start-wave");
      state.queue.pending[0].payload.index = wave.number - 1;
      state.queue.pending[0].dueUs = wave.startUs;
      state.clock.targetUs = wave.startUs - 1;
      state.enemies = residual(count, true);
      assert.equal(enqueue(state, { id: "tie", matchId: state.matchId, action: { type: "choose-opening", card: "i564" } }), true);
      advanceTo(state, wave.startUs);
      assert.equal(containmentPoints(state), count + 1);
      assert.equal(state.phase, failed ? "failed" : "running");
      assert.equal(state.openingCard, failed ? null : "i564");
    }
  }

  const state = newMatch("same-wave", 47);
  state.enemies = residual(99);
  advanceTo(state, waves[0].startUs + waves[0].intervalUs);
  assert.equal(state.phase, "running");
  assert.equal(containmentPoints(state), 101);
  advanceTo(state, waves[1].startUs);
  assert.equal(state.phase, "failed");
});

test("M2 placement respects disk boundaries and route sweeps avoid crossing occupied disks", () => {
  assert.deepEqual(buildAnchor({ x: -272, y: -200 }, 72, []), { x: -256, y: -192, radius: 72 });
  assert.equal(buildAnchor({ x: -272, y: -200 }, 72, [{ x: -320, y: -192, radius: 72 }]), undefined);
  assert.equal(buildAnchor({ x: -414, y: 0 }, 72, []), undefined);
  assert.equal(chooseWaypoint(0, null, () => 0), 1);
  assert.equal(chooseWaypoint(0, null, () => .9), 6);
  assert.equal(chooseWaypoint(5, 21, () => { throw Error("single route should not roll"); }), 0);

  const unit = { id: 1, x: 0, y: -448, radius: 1, speed: 320, layer: "fly", waypoint: 1, previousWaypoint: 0, initialOverlaps: [] };
  const obstacle = { ...unit, id: 2, x: 5 };
  assert.equal(movementSweep(unit, [obstacle])(unit, { x: 10, y: -448 }), false);
  assert.equal(movementSweep(unit, [{ ...obstacle, layer: "ground" }])(unit, { x: 10, y: -448 }), true);
  assert.equal(chooseWaypoint(6, 7, () => .5), 0);
  assert.equal(chooseWaypoint(1, 0, () => .1), 18);
});


test("A02 head-on traffic replans and passes on the same layer without overlap", () => {
  const common = { y: -448, radius: 10, speed: 160, layer: "ground", initialOverlaps: [] };
  const units = [{ ...common, id: 1, x: 160, waypoint: 1, previousWaypoint: 0 },
    { ...common, id: 2, x: 320, waypoint: 0, previousWaypoint: 1 }];
  for (let step = 0; step < 80; step++) {
    moveUnits(units, () => 0);
    assert.ok(Math.hypot(units[0].x - units[1].x, units[0].y - units[1].y) >= 20 - 1e-8);
  }
  assert.ok(units[0].x > 320 && units[1].x < 160);
});

test("A02 detours static terrain, waits when boxed in, and resumes after removal", () => {
  const start = { x: -240, y: 0 };
  const end = { x: 240, y: 0 };
  const sweep = (from, to) => staticSweep(from, to, 10, "ground");
  assert.equal(sweep(start, end), false);
  const detour = findPath(start, end, sweep);
  assert.ok(detour.points.some(point => Math.abs(point.y) > 160));
  assert.ok(detour.points.every((point, index) => sweep(detour.points[index - 1] ?? start, point)));

  const unit = { x: 290, y: -448, radius: 10, speed: 160, layer: "ground", id: 1,
    waypoint: 1, previousWaypoint: 0, initialOverlaps: [] };
  const blockedGoal = { minX: 448, maxX: 512, minY: -480, maxY: -416 };
  for (let step = 0; step < 12; step++) moveAlongRoute(unit, [], () => 0, [blockedGoal]);
  assert.deepEqual([unit.x, unit.y, unit.waypoint], [290, -448, 1]);
  for (let step = 0; step < 45; step++) moveAlongRoute(unit, [], () => 0);
  assert.equal(unit.previousWaypoint, 1);
});

test("A02 following units keep their spacing and complete multiple laps", () => {
  const common = { x: 0, radius: 2, speed: 240, layer: "fly", waypoint: 0, previousWaypoint: null, initialOverlaps: [] };
  const units = [{ ...common, id: 1, y: -520 }, { ...common, id: 2, y: -555 }];
  let laps = 0;
  let previous = null;
  for (let step = 0; step < 1344; step++) {
    moveUnits(units, () => 0);
    if (previous === 5 && units[0].previousWaypoint === 0) laps++;
    previous = units[0].previousWaypoint;
    assert.ok(Math.hypot(units[0].x - units[1].x, units[0].y - units[1].y) >= 4 - 1e-8);
  }
  assert.ok(laps >= 2, `completed laps: ${laps}`);
});

test("A02 actual waves keep live residual enemies, save the route, and obey next-wave C01", () => {
  const seed = 811;
  const state = newMatch("a02-official", seed);
  advanceTo(state, 82 * second);
  const first = state.enemies[0];
  const trace = { id: first.id, x: first.x, y: first.y, waypoint: first.waypoint, rng: state.randomState };
  const resumed = JSON.parse(JSON.stringify(state));
  advanceTo(state, 93 * second);
  resumed.clock.speed = 4;
  creditTime(resumed, (93 - 82) * 250);
  while (drain(resumed, 43) === "pending") {}
  resumed.clock.speed = 1;
  assert.deepEqual(resumed, state);
  assert.equal(state.wave, 2);
  assert.ok(state.enemies.some(enemy => enemy.wave === 1 && enemy.id === trace.id &&
    Math.hypot(enemy.x - trace.x, enemy.y - trace.y) > 32));
  assert.ok(state.enemies.some(enemy => enemy.wave === 2));
  advanceTo(state, waves[2].startUs);
  assert.equal(state.phase, "failed");
  assert.equal(state.result.atUs, waves[2].startUs);
  assert.ok(state.result.points > 100);
});

test("A02 far build approaches without spending, then commits after snapshot recovery", () => {
  let state = newMatch("a02-approach", 47);
  submit(state, "far", { type: "build-worker-tower", tower: "n001", point: { x: 288, y: -192 } });
  assert.equal(state.structures.length, 0);
  assert.equal(state.gold, 2000);
  assert.equal(state.population, 0);
  assert.ok(state.approach);
  state = structuredClone(state);
  advanceTo(state, 4 * second);
  assert.equal(state.gold, 1900);
  assert.equal(state.population, 5);
  assert.equal(state.structures[0].pending, null);
  assert.equal(state.commandResults.far.ok, true);
});

test("A02 placement rejects an unaffordable or over-capacity build without partial state", () => {
  const point = { x: -288, y: -160 };
  const state = newMatch("placement-resources", 47);
  state.gold = 99;
  assert.equal(submit(state, "gold", { type: "build-worker-tower", tower: "n001", point }).reason, "resources");
  assert.deepEqual([state.gold, state.population, state.structures.length], [99, 0, 0]);
  openHeroChoices(state);
  const choice = submit(state, "choice", { type: "choose-opening", card: "i564" });
  state.population = 15;
  assert.equal(submit(state, "capacity", { type: "build-card", cardId: choice.createdId, point }).reason, "resources");
  assert.deepEqual([state.gold, state.population, state.structures.length, state.cards.length], [99, 15, 0, 1]);
});


test("reference layout has usable building plots, keeps roads clear, and connects all rings", () => {
  assert.equal(newMatch("map-version", 47).mapVersion, mapVersion);
  const reached = new Set([map.entryWaypoint]);
  const pending = [map.entryWaypoint];
  while (pending.length) {
    for (const next of map.waypoints[pending.pop()].next) {
      if (!reached.has(next)) { reached.add(next); pending.push(next); }
    }
  }
  assert.equal(reached.size, map.waypoints.length);
  assert.ok(map.waypoints.filter(point => point.next.length > 2).length >= 4);
  for (const area of map.buildAreas) {
    let usable = false;
    for (let x = area.minX; x <= area.maxX && !usable; x += 32) {
      for (let y = area.minY; y <= area.maxY && !usable; y += 32) usable = !!buildAnchor({ x, y }, 72, []);
    }
    assert.ok(usable, `building plot has no legal tower footprint: ${JSON.stringify(area)}`);
  }
  for (const [a, b] of roadEdges) {
    assert.equal(buildAnchor({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 72, []), undefined);
  }
});


test("horizontal connectors match the vertical outer-middle-inner chains and stop before the centre", () => {
  const junctions = map.waypoints.map((point, id) => ({ ...point, id })).filter(point => point.y === 0)
    .sort((a, b) => a.x - b.x);
  assert.deepEqual(junctions.map(point => point.x), [-1248, -864, -480, 480, 864, 1248]);
  for (const [a, b] of [[junctions[0], junctions[1]], [junctions[1], junctions[2]],
    [junctions[3], junctions[4]], [junctions[4], junctions[5]]]) {
    assert.ok(a.next.includes(b.id) && b.next.includes(a.id));
    assert.equal(staticSweep(a, b, 10, "ground"), true);
    assert.equal(buildAnchor({ x: (a.x + b.x) / 2, y: 0 }, 72, []), undefined);
  }
  for (const junction of junctions) {
    assert.ok(junction.next.some(id => map.waypoints[id].y < 0));
    assert.ok(junction.next.some(id => map.waypoints[id].y > 0));
    assert.ok(junction.next.every(id => Math.sign(map.waypoints[id].x) === Math.sign(junction.x)));
  }
  assert.ok(buildAnchor({ x: 288, y: 0 }, 72, []));
  assert.equal(buildAnchor({ x: 672, y: 0 }, 72, []), undefined);
  // Both axes have two three-node chains, with no edge across the central courtyard.
  for (const axis of ["x", "y"]) {
    const other = axis === "x" ? "y" : "x";
    for (const sign of [-1, 1]) {
      const chain = map.waypoints.map((point, id) => ({ ...point, id }))
        .filter(point => point[other] === 0 && Math.sign(point[axis]) === sign)
        .sort((a, b) => Math.abs(a[axis]) - Math.abs(b[axis]));
      assert.equal(chain.length, 3);
      assert.deepEqual(chain.map(point => point.next.filter(id => map.waypoints[id][other] === 0).length), [1, 2, 1]);
      for (let i = 1; i < chain.length; i++) {
        assert.ok(chain[i - 1].next.includes(chain[i].id) && chain[i].next.includes(chain[i - 1].id));
      }
    }
  }
  assert.equal(staticSweep({ x: -240, y: 0 }, { x: 240, y: 0 }, 10, "ground"), false);
});

test("M2 hero learning spends one point, requires the next rank level, and resumes without replay", () => {
  let state = newMatch("learn", 47);
  openHeroChoices(state);
  const card = submit(state, "opening-card", { type: "choose-opening", card: "i564" });
  const tower = submit(state, "hero-build", { type: "build-card", cardId: card.createdId, point: { x: -288, y: -160 } });
  const skill = { type: "learn-skill", towerId: tower.createdId, skillId: "A067" };
  assert.equal(submit(state, "construction-skill", skill).reason, "missing");
  advanceTo(state, state.clock.targetUs + second);
  const hero = state.structures[0].hero;
  assert.deepEqual(hero.natural, { STR: 28, AGI: 0, INT: 15 });
  assert.equal(hero.points, 1);
  assert.equal(submit(state, "rank-1", skill).ok, true);
  assert.equal(submit(state, "too-early", skill).reason, "learning");
  grantHeroExperience(state, tower.createdId, heroThresholds[3]);
  assert.equal(hero.level, 4);
  assert.equal(hero.points, 3);
  assert.deepEqual(hero.natural, { STR: 52, AGI: 0, INT: 24 });
  assert.equal(submit(state, "rank-2", skill).ok, true);
  state = JSON.parse(JSON.stringify(state));
  restoreHeroState(state);
  assert.deepEqual(state.structures[0].hero.paid, ["A067", "A067"]);
  assert.equal(enqueue(state, { id: "rank-2", matchId: state.matchId, action: skill }), false);
  assert.equal(state.structures[0].hero.points, 2);
  assert.equal(state.structures[0].hero.ranks.A067, 2);
  assert.equal(submit(state, "p000-too-early", { ...skill, skillId: "P000" }).reason, "learning");
});

test("M2 last prerequisite recycle immediately removes qualification and the next level strips to twenty", () => {
  const state = newMatch("recycle", 47);
  openHeroChoices(state);
  state.gold = 100_000;
  const card = submit(state, "opening-card", { type: "choose-opening", card: "i564" });
  const built = submit(state, "hero-build", { type: "build-card", cardId: card.createdId, point: { x: -288, y: -160 } });
  advanceTo(state, state.clock.targetUs + second);
  const tower = state.structures[0];
  const hero = tower.hero;
  grantHeroExperience(state, built.createdId, heroThresholds[20]);
  assert.equal(hero.level, 20);
  assert.equal(hero.xp, heroThresholds[19]);

  const chain = qualificationChains.get(tower.qualification);
  const provider = { id: 999, templateId: chain.requireUnit, population: 5, x: -320, y: -32,
    radius: 72, pending: null, qualification: null };
  state.structures.push(provider);
  state.population += 5;
  grantHeroExperience(state, built.createdId, heroThresholds[24] - hero.xp);
  assert.equal(hero.level, 25);
  assert.equal(qualified(state, tower.id), true);
  assert.equal(submit(state, "recycle-last", { type: "recycle-tower", towerId: 999 }).ok, true);
  assert.equal(qualified(state, tower.id), false);
  assert.equal(hero.level, 25);
  assert.equal(state.population, 20);
  assert.equal(submit(state, "recycle-again", { type: "recycle-tower", towerId: 999 }).ok, false);

  // A scripted rank is separate from paid history and survives level stripping.
  hero.points = 0;
  hero.paid = ["A067", "A068", "A067", "A069", "A068", "A069"];
  hero.ranks = { A067: 2, A068: 2, A069: 2, T000: 3 };
  grantHeroExperience(state, built.createdId, heroThresholds[25] - hero.xp);
  assert.equal(hero.level, 20);
  assert.equal(hero.xp, heroThresholds[19]);
  assert.equal(hero.points, 0);
  assert.deepEqual(hero.paid, ["A067"]);
  assert.deepEqual(hero.ranks, { A067: 1, A068: 0, A069: 0, T000: 3 });
  assert.deepEqual(hero.natural, { STR: 180, AGI: 0, INT: 72 });
});

test("M2 recycling a completed level-two arrow tower pays object points only once", () => {
  const state = newMatch("recycle-worker", 47);
  const built = submit(state, "arrow", { type: "build-worker-tower", tower: "n001", point: { x: -288, y: -160 } });
  advanceTo(state, state.clock.targetUs + second);
  const towerId = built.createdId;
  assert.equal(submit(state, "arrow-upgrade", { type: "upgrade-tower", towerId }).ok, true);
  assert.equal(submit(state, "while-upgrading", { type: "recycle-tower", towerId }).ok, false);
  advanceTo(state, state.clock.targetUs + second);
  const gold = state.gold;
  assert.equal(submit(state, "recycle-arrow", { type: "recycle-tower", towerId }).ok, true);
  assert.equal(state.gold, gold + 336);
  assert.equal(state.population, 0);
  assert.equal(submit(state, "recycle-arrow-again", { type: "recycle-tower", towerId }).ok, false);
  assert.equal(state.gold, gold + 336);
});

test("M2 prayer books share six worker slots, stack on an open slot purchase and grant XP only once", () => {
  let state = newMatch("prayer-books", 47);
  openHeroChoices(state);
  const card = submit(state, "opening-card", { type: "choose-opening", card: "i564" });
  const tower = submit(state, "hero-build", { type: "build-card", cardId: card.createdId, point: { x: -288, y: -160 } });
  advanceTo(state, state.clock.targetUs + second);
  const buy = { type: "buy-book", bookId: "i127" };
  state.inventory = [];
  const first = submit(state, "book", buy);
  assert.equal(submit(state, "another-book", buy).createdId, first.createdId);
  assert.deepEqual(state.books.map(item => [item.slot, item.charges]), [[0, 2]]);
  state.cards.push(...Array.from({ length: 5 }, (_, index) => ({
    id: 900 + index, card: "i701", slot: index + 1, hp: 5, charges: 1, point: map.worker,
  })));
  state.gold = 2000;
  const stock = structuredClone(state.shopRestock);
  assert.deepEqual(submit(state, "full-book", buy), { ok: false, reason: "full" });
  assert.equal(state.gold, 2000);
  assert.deepEqual(state.shopRestock, stock);
  assert.equal(state.books[0].charges, 2);

  const use = { type: "use-book", itemId: first.createdId, towerId: tower.createdId };
  assert.equal(submit(state, "invalid-target", { ...use, towerId: 1234 }).ok, false);
  assert.equal(state.books[0].charges, 2);
  assert.equal(submit(state, "grant", use).ok, true);
  assert.equal(state.structures[0].hero.level, 7);
  state = JSON.parse(JSON.stringify(state));
  assert.equal(enqueue(state, { id: "grant", matchId: state.matchId, action: use }), false);
  assert.equal(state.structures[0].hero.xp, 1400);
  assert.equal(submit(state, "last-charge", use).ok, true);
  assert.equal(state.books.length, 0);
  assert.equal(state.structures[0].hero.xp, 2800);
});

test("starter gifts keep item order, defer the choice until use and survive retry", () => {
  let state = newMatch("starter-order", 47);
  const [starter, newbie] = state.inventory;
  assert.equal(submit(state, "too-soon", { type: "choose-opening", card: "i564" }).reason, "opening");
  let initializedRng = 47;
  for (let draw = 0; draw < 20; draw++) initializedRng = (Math.imul(initializedRng, 1664525) + 1013904223) >>> 0;
  assert.deepEqual([starter.itemId, newbie.itemId, state.randomState], ["i004", "i006", initializedRng]);
  openHeroChoices(state);
  const rng = (Math.imul(initializedRng, 1664525) + 1013904223) >>> 0;
  assert.equal(state.randomState, rng);
  assert.deepEqual(state.inventory.map(item => [item.itemId, item.slot]),
    [["i006", 1], ["i401", 2], ["i411", 3], ["i411", 4], ["i412", 5]]);
  state = JSON.parse(JSON.stringify(state));
  assert.equal(submit(state, "duplicate-pack", { type: "use-item", itemId: starter.id }).ok, false);
  assert.equal(state.randomState, rng);
  assert.equal(submit(state, "actual-choice", { type: "choose-opening", card: "i564" }).ok, true);
  assert.equal(state.randomState, rng);
  assert.equal(submit(state, "newbie", { type: "use-item", itemId: newbie.id }).ok, true);
  assert.equal(state.inventory.find(item => ["i131", "i133", "i262"].includes(item.itemId)).slot, null);
});

test("chest use consumes the oldest slotted matching box and one key before reward delivery", () => {
  const state = newMatch("chest-order", 811);
  openHeroChoices(state);
  const [left, right] = state.inventory.filter(item => item.itemId === "i411");
  const chest = state.inventory.find(item => item.itemId === "i401");
  const start = state.randomState;
  const next = input => (Math.imul(input, 1664525) + 1013904223) >>> 0;
  assert.equal(submit(state, "open-chest", { type: "use-item", itemId: left.id }).ok, true);
  assert.equal(state.randomState, next(next(start)));
  assert.equal(state.openedChests, 1);
  assert.equal(state.inventory.some(item => item.id === left.id || item.id === chest.id), false);
  assert.equal(submit(state, "try-early", { type: "use-item", itemId: right.id }).reason, "cooldown");
  advanceTo(state, state.clock.targetUs + second);
  assert.equal(submit(state, "no-chest", { type: "use-item", itemId: right.id }).reason, "materials");
  assert.equal(state.inventory.some(item => item.id === right.id), true);
  assert.equal(state.randomState, next(next(start)));
});

test("worker auto-craft uses separate copies, re-enters on pickup and cannot consume twice", () => {
  const state = newMatch("recipe", 47);
  state.inventory = [
    { id: 100, itemId: "i124", slot: 0, charges: 0, point: map.worker },
    { id: 101, itemId: "i125", slot: 1, charges: 2, point: map.worker },
    { id: 102, itemId: "i126", slot: null, charges: 0, point: map.worker },
    { id: 103, itemId: "i125", slot: null, charges: 1, point: map.worker },
  ];
  state.nextId = 104;
  assert.equal(submit(state, "first", { type: "pick-up-item", itemId: 102 }).createdId, 102);
  assert.equal(state.inventory.some(entry => entry.itemId === "i123"), false);
  const craft = submit(state, "second", { type: "pick-up-item", itemId: 103 });
  assert.deepEqual(state.inventory.map(item => [item.id, item.itemId, item.charges]),
    [[101, "i125", 1], [craft.createdId, "i123", 0]]);
  assert.equal(submit(state, "again", { type: "pick-up-item", itemId: 103 }).ok, false);
  assert.equal(state.gold, 2000);
});

test("normal shop materials craft a real recipe at the source prices", () => {
  const state = newMatch("shop-craft", 47);
  const book = submit(state, "recipe-book", { type: "buy-item", itemId: "i241" });
  assert.equal(book.ok, true);
  assert.equal(state.gold, 1150);
  const crafted = submit(state, "gem", { type: "buy-item", itemId: "i242" });
  assert.equal(crafted.ok, true);
  assert.equal(state.gold, 200);
  assert.deepEqual(state.inventory.map(item => item.itemId), ["i004", "i006", "i240"]);
  assert.equal(submit(state, "unknown-outlet", { type: "buy-item", itemId: "i278" }).ok, false);
  assert.equal(state.gold, 200);
});

function isolatedEconomy(seed = 47) {
  const state = newMatch("economy", seed);
  // Controlled fixtures exercise one scheduled rule without intervening normal waves.
  state.queue.pending = [];
  return state;
}

function dispatchWave(state, number) {
  scheduleEvent(state.queue, 1, { type: "start-wave", index: number - 1 });
  advanceTo(state, state.queue.nowUs + 1);
  state.queue.pending = state.queue.pending.filter(event => ["challenge-spawn", "commit-talent"].includes(event.payload.type));
}

function castTalent(state, id, towerId) {
  assert.equal(submit(state, id, { type: "cast-talent", towerId }), undefined);
  advanceTo(state, state.queue.nowUs + 300_000);
  return state.commandResults[id];
}

test("worker talent book is one-time and wave milestones preserve the active cooldown across resume", () => {
  let state = isolatedEconomy();
  dispatchWave(state, 10);
  assert.equal(submit(state, "wish", { type: "choose-talent", choice: "W004" }).ok, true);
  assert.equal(submit(state, "duplicate", { type: "choose-talent", choice: "W007" }).ok, false);
  assert.equal(state.talent.rank, 1);
  const seed = state.randomState;
  assert.equal(submit(state, "cast", { type: "cast-talent" }), undefined);
  state = JSON.parse(JSON.stringify(state));
  assert.equal(enqueue(state, { id: "cast", matchId: state.matchId, action: { type: "cast-talent" } }), false);
  advanceTo(state, state.queue.nowUs + 300_000);
  assert.equal(state.commandResults.cast.ok, true);
  assert.deepEqual(state.inventory.slice(-2).map(item => item.itemId), ["i401", "i411"]);
  assert.equal(state.randomState, seed);
  const ready = state.talent.readyUs;
  dispatchWave(state, 20);
  dispatchWave(state, 30);
  dispatchWave(state, 40);
  dispatchWave(state, 50);
  assert.equal(state.talent.rank, 4);
  assert.equal(state.talent.readyUs, ready);
  assert.equal(submit(state, "early", { type: "cast-talent" }).reason, "cooldown");
});

test("talent card transactions use exact slots and eligible pools, and relocation keeps instance identity", () => {
  const card = (id, type, slot) => ({ id, card: type, slot, point: map.worker, hp: 5, charges: 1 });
  const state = isolatedEconomy();
  state.inventory = [];
  state.cards = [card(99, "c005", 0)];
  submit(state, "teach", { type: "choose-talent", choice: "W002" });
  const random = state.randomState;
  assert.equal(castTalent(state, "invalid").reason, "materials");
  assert.equal(state.talent.readyUs, state.queue.nowUs + 100_000);
  assert.equal(state.randomState, random);
  assert.equal(state.cards[0].id, 99);
  advanceTo(state, state.queue.nowUs + 510_000);
  state.cards[0].card = configuration.cardPools.R[0];
  assert.equal(castTalent(state, "reroll").ok, true);
  assert.ok(configuration.cardPools.R.slice(1).includes(state.cards[0].card));
  assert.notEqual(state.cards[0].id, 99);

  const synthesis = isolatedEconomy();
  synthesis.inventory = [];
  synthesis.cards = ["c005", ...configuration.cardPools.R.slice(0, 4)]
    .map((type, slot) => card(99 + slot, type, slot));
  submit(synthesis, "teach", { type: "choose-talent", choice: "W006" });
  assert.equal(castTalent(synthesis, "craft").ok, true);
  assert.ok(configuration.cardPools.SR.includes(synthesis.cards[1].card));
  assert.equal(synthesis.cards[0].id, 103);

  const relocate = newMatch("relocation", 47);
  const built = submit(relocate, "tower", { type: "build-worker-tower", tower: "n001", point: { x: -288, y: -64 } });
  advanceTo(relocate, 2 * second);
  relocate.worker = { x: 225, y: -211 };
  submit(relocate, "teach", { type: "choose-talent", choice: "W008" });
  assert.equal(castTalent(relocate, "move", built.createdId).ok, true);
  const [tower] = relocate.structures;
  assert.deepEqual([tower.id, tower.x, tower.y], [built.createdId, 225, -211]);
  assert.equal(relocate.population, 5);
});

test("equipment transfer preserves the instance and enforces new admission after qualification is lost", () => {
  let state = isolatedEconomy();
  const chain = qualificationChains.values().next().value;
  const structure = (id, templateId, qualification, point) => ({ id, templateId, qualification, ...point, radius: 72, pending: null, population: 0 });
  state.structures = [structure(71, "H021", chain.id, map.worker), structure(72, chain.requireUnit, null, { x: -300, y: 100 })];
  restoreHeroState(state);
  state.inventory = [{ id: 81, itemId: "i304", charges: 3, slot: 0, point: map.worker },
    { id: 82, itemId: "i131", charges: 0, slot: 1, point: map.worker }];
  const transfer = (id, itemId, towerId) => submit(state, id, { type: "transfer-item", itemId, towerId });
  assert.equal(transfer("equip", 81, 71).ok, true);
  assert.equal(transfer("circle", 82, circleId).ok, true);
  assert.equal(transfer("broken", 82, 71).reason, "equipment");
  assert.equal(state.inventory.find(item => item.id === 82).slot, null);
  submit(state, "pick-up-broken", { type: "pick-up-item", itemId: 82 });
  assert.equal(transfer("return-broken", 82, circleId).ok, true);
  assert.equal(submit(state, "recycle-provider", { type: "recycle-tower", towerId: 72 }).ok, true);
  state = JSON.parse(JSON.stringify(state));
  assert.equal(qualified(state, 71), false);
  assert.deepEqual(state.inventory.map(item => [item.id, item.towerId, item.slot, item.charges]), [[81, 71, 0, 3], [82, 0, 0, 0]]);
  assert.equal(transfer("return", 81).ok, true);
  assert.equal(transfer("re-equip", 81, 71).reason, "equipment");
  assert.equal(state.inventory[0].towerId, undefined);
  assert.equal(state.inventory[0].slot, null);
});

test("W013 applies only to heroes and W019 grows on an actual level or promotion", () => {
  const state = isolatedEconomy();
  state.structures = [{ id: 71, templateId: "H021", qualification: null, ...map.worker, radius: 72, pending: null, population: 20 }];
  restoreHeroState(state);
  submit(state, "teach", { type: "choose-talent", choice: "W009" });
  assert.equal(state.structures[0].hero.talentAttributes, undefined);
  grantHeroExperience(state, 71, heroThresholds[2]);
  assert.equal(state.structures[0].hero.talentAttributes, 3);
  dispatchWave(state, 10);
  assert.equal(state.structures[0].hero.talentAttributes, 4);
  const damage = isolatedEconomy();
  damage.structures = state.structures;
  submit(damage, "teach", { type: "choose-talent", choice: "W003" });
  assert.equal(talentHeroDamageFactor(damage, 71), 1.04);
  assert.equal(talentHeroDamageFactor(damage, 99), 1);
});

test("mystery stock uses seven draws, caps duplicates, refreshes only once manually and survives failed buys", () => {
  let rolls = 0;
  assert.deepEqual(drawMysteryStock(() => { rolls++; return 0; }), { i305: 4 });
  assert.equal(rolls, 14);
  let state = isolatedEconomy();
  assert.equal(submit(state, "closed", { type: "buy-special", shop: "mystery", itemId: "i399" }).reason, "closed");
  dispatchWave(state, 21);
  assert.ok(Object.values(state.mysteryStock).every(count => count <= 4));
  const bought = submit(state, "refresh", { type: "buy-special", shop: "mystery", itemId: "i399" });
  assert.equal(bought.ok, true);
  state = JSON.parse(JSON.stringify(state));
  dispatchWave(state, 26);
  const random = state.randomState;
  assert.equal(submit(state, "refresh-again", { type: "buy-special", shop: "mystery", itemId: "i399" }).reason, "stock");
  const itemId = Object.keys(state.mysteryStock)[0];
  const stock = state.mysteryStock[itemId];
  state.gold = 1_000_000;
  state.lumber = 1_000;
  state.inventory = Array.from({ length: 6 }, (_, slot) => ({ id: slot + 100, itemId: "i006", slot, charges: 1, point: map.worker }));
  assert.equal(submit(state, "full", { type: "buy-special", shop: "mystery", itemId }).reason, "full");
  assert.equal(state.gold, 1_000_000);
  assert.equal(state.mysteryStock[itemId], stock);
  assert.equal(state.randomState, random);
});

test("24 challenge stages retain source templates and grant stage rewards once after actual death callbacks", () => {
  for (const template of challengeTemplates) {
    let state = isolatedEconomy();
    dispatchWave(state, 11);
    state.enemies = [];
    state.challengeStages = Array(8).fill(0);
    state.challengeStages[template.family] = template.stage;
    const result = submit(state, "reserve", { type: "reserve-challenge", unitId: template.unitId });
    assert.equal(result.ok, true);
    assert.equal(submit(state, "too-soon", { type: "reserve-challenge", unitId: "m573" === template.unitId ? "m511" : "m571" }).ok, false);
    state = JSON.parse(JSON.stringify(state));
    const first = state.challengeReadyUs - 240 * second + (10 + template.interval) * second;
    advanceTo(state, first - 1);
    assert.equal(state.enemies.length, 0, template.unitId);
    for (let index = 0; index < template.count; index++) {
      advanceTo(state, first + Math.round(index * template.interval * second));
      const [enemy] = state.enemies;
      assert.deepEqual([enemy.unitId, enemy.points, enemy.abilities, enemy.hp, enemy.challengeId],
        [template.unitId, template.points, template.abilities, template.hp, result.createdId]);
      assert.equal(removeDeadEnemy(state, enemy.id), false);
      enemy.hp = 0;
      assert.equal(removeDeadEnemy(state, enemy.id), true);
      assert.equal(removeDeadEnemy(state, enemy.id), false);
      if (index < template.count - 1) assert.equal(state.gold, 2000);
    }
    if (template.family === 0) {
      const [min, max] = [[30, 120], [100, 260], [240, 400]][template.stage];
      assert.ok(state.challengeScore >= min && state.challengeScore <= max);
    } else if (template.stage === 0) assert.equal(state.gold, 5000);
    else if (template.stage === 1) assert.equal(state.lumber, 300);
    else assert.equal(Object.values(state.challengeStock)[0], 1);
  }
});

test("m523 reward book purchases once, crafts i265 and wave 54 removes both living and pending challenge units", () => {
  const state = isolatedEconomy();
  dispatchWave(state, 11);
  state.gold = 20_000;
  state.inventory = [{ id: 900, itemId: "i308", slot: 0, charges: 0, point: map.worker }];
  state.challengeStock = { i266: 1 };
  assert.equal(submit(state, "book", { type: "buy-special", shop: "challenge", itemId: "i266" }).ok, true);
  assert.equal(state.gold, 1400);
  assert.deepEqual(state.inventory.map(item => item.itemId), ["i265"]);
  assert.equal(submit(state, "second", { type: "buy-special", shop: "challenge", itemId: "i266" }).reason, "stock");
  const reservation = submit(state, "reserve", { type: "reserve-challenge", unitId: "m521" });
  advanceTo(state, state.queue.nowUs + 11 * second);
  assert.equal(state.enemies.filter(enemy => enemy.challengeId === reservation.createdId).length, 2);
  dispatchWave(state, 54);
  assert.equal(state.challengeShopOpen, false);
  assert.ok(state.enemies.every(enemy => enemy.challengeId === undefined));
  assert.ok(state.queue.pending.every(event => event.payload.type !== "challenge-spawn"));
});

test("ordinary attacks and immolation earn repeatable bounty and XP on a real wave", () => {
  let state = newMatch("combat-loop", 811);
  openHeroChoices(state);
  const opening = submit(state, "hero-card", { type: "choose-opening", card: "i564" });
  const hero = submit(state, "build-hero", { type: "build-card", cardId: opening.createdId, point: { x: -288, y: -160 } });
  submit(state, "choose-wealth", { type: "choose-talent", choice: "W005" });
  submit(state, "build-arrow", { type: "build-worker-tower", tower: "n001", point: { x: -288, y: 64 } });
  advanceTo(state, 5 * second);
  submit(state, "build-fire", { type: "build-worker-tower", tower: "n021", point: { x: 288, y: -160 } });
  advanceTo(state, 10 * second);
  assert.equal(state.structures.filter(tower => !tower.pending).length, 3);
  const cost = state.gold;
  advanceTo(state, waves[0].startUs + 8 * second);
  const resuming = JSON.parse(JSON.stringify(state));
  advanceTo(state, waves[0].startUs + 31 * second);
  advanceTo(resuming, waves[0].startUs + 31 * second, 31);
  assert.deepEqual(resuming, JSON.parse(JSON.stringify(state)));
  assert.ok(state.kills > 1);
  assert.ok(state.gold >= cost + state.kills * 8);
  assert.ok(state.lumber >= state.kills);
  assert.ok(state.structures.find(tower => tower.id === hero.createdId).hero.xp > 0);
  assert.ok(state.structures.some(tower => tower.lastAttackUs !== undefined));
  assert.equal(state.phase, "running");
});

test("full worker inventory can buy immediate lumber, and wave reward retries keep one instance", () => {
  const state = isolatedEconomy();
  state.gold = 3300;
  state.inventory = Array.from({ length: 6 }, (_, slot) => ({ id: 100 + slot, itemId: "i006", charges: 1, slot, point: map.worker }));
  const result = submit(state, "wood", { type: "buy-item", itemId: "i261" });
  assert.equal(result.ok, true);
  assert.equal(state.gold, 300);
  assert.equal(state.lumber, 100);
  assert.equal(state.inventory.length, 6);
  assert.equal(submit(state, "reward-before", { type: "claim-wave", slot: 4 }).reason, "missing");
  dispatchWave(state, 45);
  const claimed = submit(state, "reward", { type: "claim-wave", slot: 4 });
  assert.equal(claimed.ok, true);
  assert.equal(state.inventory.find(item => item.id === claimed.createdId).slot, null);
  assert.equal(submit(state, "reward-repeat", { type: "claim-wave", slot: 4 }).reason, "missing");
  dispatchWave(state, 45);
  assert.equal(state.waveRewardSlots[4], 3);
});

test("stage-45 charm uses the no-killer death route once, including a live Boss", () => {
  const state = isolatedEconomy();
  dispatchWave(state, 45);
  const reward = submit(state, "charm", { type: "claim-wave", slot: 4 });
  dispatchWave(state, 55);
  assert.equal(state.enemies.some(enemy => enemy.unitId === "mBOS"), true);
  const before = [state.gold, state.lumber, state.kills];
  assert.equal(submit(state, "use-charm", { type: "use-item", itemId: reward.createdId }).ok, true);
  assert.equal(state.phase, "won");
  assert.equal(state.result.reason, "boss-killed");
  assert.equal(state.finalHit, undefined);
  assert.deepEqual([state.gold, state.lumber, state.kills], before);
  assert.equal(state.enemies.length, 0);
});

test("overdraft applies to subsequent mainline spawn at closure and preserves its welfare multiplier points", () => {
  const state = isolatedEconomy();
  dispatchWave(state, 11);
  assert.equal(submit(state, "overdraft", { type: "overdraft" }).ok, true);
  assert.equal(state.enemies[0].hp, waves[10].hp);
  dispatchWave(state, 12);
  assert.equal(state.enemies.at(-1).hp, waves[11].hp * 1.2);
  assert.equal(state.enemies.at(-1).overdraftArmor, 1);
  assert.equal(submit(state, "closed", { type: "overdraft" }).reason, "closed");
  dispatchWave(state, 55);
  assert.equal(state.enemies.at(-1).hp, waves[54].hp);
  assert.equal(state.overdraftPoints, 1);
});

test("each circle sword converts at 1400 only after an attributed monster death", () => {
  for (const [broken, repaired] of [["i131", "i132"], ["i133", "i134"], ["i262", "i263"]]) {
    let state = isolatedEconomy();
    state.inventory = [
      { id: 500, itemId: broken, charges: 1399, slot: 0, point: map.energyCircle, towerId: circleId },
      { id: 501, itemId: broken, charges: 1398, slot: 1, point: map.energyCircle, towerId: circleId },
    ];
    dispatchWave(state, 1);
    const [noKiller] = state.enemies;
    noKiller.hp = 0;
    removeDeadEnemy(state, noKiller.id);
    assert.equal(state.inventory[0].charges, 1399);
    dispatchWave(state, 2);
    const [withKiller] = state.enemies;
    withKiller.hp = 0;
    removeDeadEnemy(state, withKiller.id, 91);
    state = JSON.parse(JSON.stringify(state));
    assert.equal(state.forgedSwords, 1);
    assert.ok(state.inventory.some(item => item.itemId === repaired && item.towerId === circleId));
    assert.ok(state.inventory.some(item => item.id === 501 && item.charges === 1398));
    assert.equal(removeDeadEnemy(state, withKiller.id, 91), false);
    assert.equal(state.forgedSwords, 1);
  }
});

test("a real tower weapon commits the fatal Boss hit and stops scheduled events", () => {
  const state = newMatch("boss-weapon-fixture", 47);
  const built = submit(state, "arrow", { type: "build-worker-tower", tower: "n001", point: { x: -288, y: -160 } });
  advanceTo(state, 2 * second);
  scheduleEvent(state.queue, 1, { type: "start-wave", index: 54 });
  advanceTo(state, state.queue.nowUs + 1);
  const [boss] = state.enemies;
  assert.equal(boss.unitId, "mBOS");
  // A controlled fatal-hit fixture exercises the real weapon and queue. A10
  // starts with normal Boss health and uses no position or health overrides.
  Object.assign(boss, { hp: 1, x: -288, y: -448 });
  advanceTo(state, 5 * second);
  assert.equal(state.phase, "won");
  assert.equal(state.result.reason, "boss-killed");
  assert.equal(state.finalHit.towerId, built.createdId);
  assert.equal(state.finalHit.sourceTemplate, "n001");
  assert.equal(state.finalHit.targetId, boss.id);
  assert.equal(state.finalHit.hpBefore, 1);
  assert.ok(state.finalHit.amount >= state.finalHit.hpBefore);
  assert.equal(state.kills, 1);
  assert.equal(state.queue.pending.length, 0);
});

test("Shadow Shaman casts eight independent wards with attacks and expiry surviving a snapshot", () => {
  const state = newMatch("ward-combat-fixture", 811);
  openHeroChoices(state);
  const choice = submit(state, "opening", { type: "choose-opening", card: "i569" });
  const built = submit(state, "hero", { type: "build-card", cardId: choice.createdId, point: { x: -288, y: -160 } });
  advanceTo(state, 2 * second);
  grantHeroExperience(state, built.createdId, heroThresholds[8]);
  assert.equal(submit(state, "learn", { type: "learn-skill", towerId: built.createdId, skillId: "A094" }).ok, true);

  scheduleEvent(state.queue, 1, { type: "start-wave", index: 0 });
  advanceTo(state, state.queue.nowUs + 1);
  const [target] = state.enemies;
  Object.assign(target, { hp: 100_000, maxHp: 100_000, x: -288, y: -448, speed: 0 });
  assert.equal(submit(state, "ward", { type: "cast-hero", towerId: built.createdId, skillId: "A094" }).ok, true);
  advanceTo(state, 3 * second);
  assert.equal(state.summons.length, 8);
  assert.ok(state.summons.every(ward => ward.templateId === "b122" && ward.summon.ownerId === built.createdId));
  assert.equal(state.population, 20);
  assert.equal(new Set(state.summons.map(ward => [ward.x, ward.y].join(","))).size, 8);
  const restored = JSON.parse(JSON.stringify(state));
  advanceTo(state, 16 * second);
  advanceTo(restored, 16 * second, 4);
  assert.deepEqual(restored, state);
  assert.equal(state.summons.length, 0);
  assert.ok(target.hp < target.maxHp);
});

test("season points cross original reward nodes once and keep deferred tasks inactive", async () => {
  const { startSeasons, creditSeason } = await import("../src/game/m2/seasons.ts");
  const { seasons, score } = startSeasons();
  assert.equal(score, 60);
  assert.deepEqual(seasons.spring.nodes, [1, 4]);
  assert.deepEqual(seasons.summer.nodes, [1]);
  assert.equal(seasons.spring.points, 40);
  assert.equal(seasons.summer.points, 30);
  const restored = JSON.parse(JSON.stringify(seasons));
  assert.equal(creditSeason(restored, "spring", 7, 666), 0);
  assert.equal(creditSeason(restored, "spring", 1, 13), 0);
  assert.equal(creditSeason(restored, "spring", 4, 33), 0);
  assert.equal(creditSeason(restored, "spring", 5, 20), 70);
  assert.equal(restored.spring.points, 100);
  assert.equal(restored.spring.unlocks.length, 1);
  assert.equal(creditSeason(restored, "spring", 5, 1), 0);
});

test("all 13 M2 season tasks honor thresholds, eligible nodes and refresh without reissuing rewards", async () => {
  const { startSeasons, creditSeason, seasonDefinitions } = await import("../src/game/m2/seasons.ts");
  const { seasons, score } = startSeasons();
  const inScope = { spring: [4, 5, 6, 7, 8], summer: [2, 3, 4, 5, 6, 7, 8, 9] };
  const expected = { spring: { points: 180, nodes: [1, 4, 7, 10, 15], reward: 120 },
    summer: { points: 270, nodes: [1, 4, 7, 10, 15, 20, 25, 27], reward: 590 } };
  assert.equal(score, 60);
  for (const [season, ids] of Object.entries(inScope)) {
    let awarded = season === "spring" ? 50 : 10;
    for (const id of ids) {
      const cap = seasonDefinitions[season].tasks[id]["4"];
      if (id !== 7) {
        const initialPoints = seasons[season].points;
        const partial = cap - 1;
        assert.equal(creditSeason(seasons, season, id, partial), 0);
        assert.equal(seasons[season].points, initialPoints);
        assert.equal(seasons[season].counts[id] ?? 0, partial);
        const restoredAfterPartial = JSON.parse(JSON.stringify(seasons));
        const completion = seasonDefinitions[season].tasks[id]["6"] === 1 ? cap : 1;
        const originalReward = creditSeason(seasons, season, id, completion);
        assert.equal(creditSeason(restoredAfterPartial, season, id, completion), originalReward);
        assert.deepEqual(restoredAfterPartial, seasons);
        awarded += originalReward;
      }
      assert.equal(seasons[season].counts[id], cap);
      assert.equal(creditSeason(seasons, season, id, cap), 0);
    }
    assert.equal(seasons[season].points, expected[season].points);
    assert.deepEqual(seasons[season].nodes, expected[season].nodes);
    assert.equal(awarded, expected[season].reward);
    assert.equal(seasons[season].unlocks.length, season === "spring" ? 2 : 3);
  }
});

test("season counters respond to real welfare, terminal, overdraft, draw, construction and challenge callbacks", async () => {
  const { startSeasons } = await import("../src/game/m2/seasons.ts");
  const { welfareGold } = await import("../src/game/m2/combat.ts");
  const seasonMatch = seed => {
    const state = isolatedEconomy(seed);
    state.seasons = startSeasons().seasons;
    return state;
  };
  const welfare = seasonMatch();
  for (const damage of [50_000, 700_000, 2_000_000]) {
    const expected = welfareGold(15, damage);
    const ahead = welfare.seasons.spring.counts;
    const big = ahead[5] ?? 0;
    const total = ahead[6] ?? 0;
    welfare.welfareDamage = damage;
    scheduleEvent(welfare.queue, 1, { type: "welfare-end", index: 14 });
    advanceTo(welfare, welfare.queue.nowUs + 1);
    assert.equal(welfare.lastWelfareGold, expected);
    assert.equal(ahead[5] ?? 0, big + Number(expected >= 30_000));
    assert.equal(ahead[6] ?? 0, total + Math.floor(expected / 10_000));
  }
  assert.equal(welfare.seasons.spring.counts[5], 1);

  const terminal = seasonMatch();
  dispatchWave(terminal, 11);
  assert.ok(submit(terminal, "overdraft", { type: "overdraft" }).ok);
  dispatchWave(terminal, 54);
  assert.equal(terminal.seasons.summer.counts[2], 1);
  const resumed = structuredClone(terminal);
  dispatchWave(resumed, 55);
  const boss = resumed.enemies.find(enemy => enemy.unitId === "mBOS");
  boss.hp = 0;
  assert.ok(removeDeadEnemy(resumed, boss.id));
  assert.equal(resumed.seasons.spring.counts[8], 1);
  assert.equal(removeDeadEnemy(resumed, boss.id), false);
  assert.equal(resumed.seasons.spring.counts[8], 1);
  assert.equal(resumed.seasons.summer.counts[2], 1);

  let foundSsr = false;
  for (let seed = 0; seed < 128 && !foundSsr; seed++) {
    const draw = seasonMatch(seed);
    draw.gold = 13_000;
    assert.ok(submit(draw, "black", { type: "draw", draw: "i005" }).ok);
    assert.equal(draw.seasons.summer.counts[4], 1);
    const ssr = draw.cards.some(card => configuration.cardPools.SSR.includes(card.card));
    assert.equal(draw.seasons.summer.counts[9] ?? 0, Number(ssr));
    assert.equal(submit(draw, "no-gold", { type: "draw", draw: "i005" }).reason, "resources");
    assert.equal(draw.seasons.summer.counts[4], 1);
    foundSsr = ssr;
  }
  assert.ok(foundSsr);

  let roster = seasonMatch();
  roster.populationLimit = 120;
  const sites = [{ x: -288, y: -160 }, { x: 192, y: -224 }, { x: 192, y: -32 }, { x: -288, y: 640 }, { x: 672, y: 352 }];
  for (const [index, point] of sites.entries()) {
    roster.worker = point;
    const id = 700 + index;
    roster.cards.push({ id, card: openingChoices[index % 4], slot: 3, hp: 20, charges: 1, point });
    assert.ok(submit(roster, "build-" + index, { type: "build-card", cardId: id, point }).ok);
    const finish = roster.queue.pending.find(event => event.payload.type === "finish-construction");
    advanceTo(roster, finish.dueUs);
    assert.equal(roster.seasons.summer.counts[5] ?? 0, Number(index >= 3));
    roster = JSON.parse(JSON.stringify(roster));
  }

  const challenge = seasonMatch();
  dispatchWave(challenge, 11);
  challenge.enemies = [];
  const units = ["m523", "m533", "m543"];
  for (const [index, unitId] of units.entries()) {
    const template = challengeTemplates.find(entry => entry.unitId === unitId);
    challenge.challengeStages ??= Array(8).fill(0);
    challenge.challengeStages[template.family] = 2;
    const booking = submit(challenge, "reserve-" + index, { type: "reserve-challenge", unitId });
    assert.ok(booking.ok);
    advanceTo(challenge, challenge.challengeReadyUs);
    const enemies = challenge.enemies.filter(enemy => enemy.challengeId === booking.createdId);
    assert.equal(enemies.length, template.count);
    for (const unit of enemies) {
      unit.hp = 0;
      assert.ok(removeDeadEnemy(challenge, unit.id));
    }
    assert.equal(challenge.seasonalChallengeUnlocks, index + 1);
    assert.equal(challenge.seasons.summer.counts[8] ?? 0, Number(index >= 1));
  }
});

test("A18 fixture distinguishes the forged sword and chest paths for all three items", async () => {
  const { startSeasons } = await import("../src/game/m2/seasons.ts");
  for (const [broken, finished] of [["i131", "i132"], ["i133", "i134"], ["i262", "i263"]]) {
    let forged = isolatedEconomy();
    forged.seasons = startSeasons().seasons;
    forged.inventory = [{ id: 500, itemId: broken, charges: 1399, slot: 0, point: map.energyCircle, towerId: circleId }];
    dispatchWave(forged, 1);
    const target = forged.enemies[0];
    target.hp = 0;
    assert.equal(removeDeadEnemy(forged, target.id, 91), true);
    forged = structuredClone(forged);
    assert.equal(forged.seasons.spring.counts[4], 1);
    assert.ok(forged.inventory.some(item => item.itemId === finished));
    assert.equal(removeDeadEnemy(forged, target.id, 91), false);

    let opened;
    for (let seed = 0; seed < 512; seed++) {
      const state = isolatedEconomy(seed);
      state.seasons = startSeasons().seasons;
      state.inventory = [
        { id: 500, itemId: "i404", charges: 1, slot: 0, point: map.worker },
        { id: 501, itemId: "i414", charges: 1, slot: 1, point: map.worker },
      ];
      const result = submit(state, "open", { type: "use-item", itemId: 501 });
      assert.equal(result.ok, true);
      if (state.inventory.some(item => item.id === result.createdId && item.itemId === finished)) {
        opened = structuredClone(state);
        break;
      }
    }
    assert.ok(opened, finished);
    assert.equal(opened.seasons.spring.counts[4] ?? 0, 0);
    assert.equal(opened.seasons.summer.counts[3], 1);
    assert.equal(opened.inventory.some(item => item.id === 500 || item.id === 501), false);
  }
});

test("i256 uses a live selected target, rewards the worker without a kill and recovers its cooldown", async () => {
  const { startSeasons } = await import("../src/game/m2/seasons.ts");
  let state = isolatedEconomy();
  state.seasons = startSeasons().seasons;
  state.inventory = [{ id: 500, itemId: "i256", charges: 0, slot: 0, point: map.worker }];
  dispatchWave(state, 1);
  const target = state.enemies[0];
  const action = { type: "use-item", itemId: 500, targetId: target.id };
  assert.deepEqual(submit(state, "far", action), { ok: false, reason: "range" });
  Object.assign(target, map.worker);
  assert.equal(submit(state, "point-gold", action).ok, true);
  assert.equal(state.gold, 2300);
  assert.equal(state.kills ?? 0, 0);
  assert.equal(state.seasons.summer.counts[6], 1);
  assert.equal(state.enemies.some(enemy => enemy.id === target.id), false);
  assert.equal(state.inventory[0].charges, 0);
  state = structuredClone(state);
  assert.equal(submit(state, "cooldown", action).reason, "cooldown");
  assert.equal(state.seasons.summer.counts[6], 1);
});

test("N116 commits the target at effect time, clears positive effects and restores staged movement", () => {
  const state = isolatedEconomy();
  state.structures.push({ ...map.worker, id: 901, templateId: "n254", population: 5, radius: 72,
    pending: null, qualification: null, attack: { readyUs: 99 * second } });
  dispatchWave(state, 1);
  const target = state.enemies[0];
  Object.assign(target, { x: -288, y: -500, armorBuff: { value: 40, untilUs: 10 * second }, speedBuff: 1.5,
    frost: { factor: .9, expiresUs: 10 * second }, speed: 200 });
  assert.equal(submit(state, "purge", { type: "cast-tower", towerId: 901, skillId: "N116" }).ok, true);
  advanceTo(state, state.queue.nowUs + 500_000);
  assert.equal(target.armorBuff, undefined);
  assert.equal(target.speedBuff, undefined);
  assert.equal(target.frost.factor, .9);
  assert.equal(target.purge.factor, 0);
  scheduleEvent(state.queue, 31_250, { type: "movement" }, 31_250);
  const restored = structuredClone(state);
  advanceTo(restored, state.queue.nowUs + 2 * second);
  assert.equal(restored.enemies[0].purge.factor, .5);
  advanceTo(restored, state.queue.nowUs + 4 * second);
  assert.equal(restored.enemies[0].purge, undefined);
});

test("N001 and N002 keep their ordinary projectile and lock the armed bonus before windup", () => {
  for (const [templateId, bonus] of [["n142", 40], ["n143", 100]]) {
    const state = isolatedEconomy();
    dispatchWave(state, 1);
    const [enemy] = state.enemies;
    Object.assign(enemy, { ...map.worker, x: map.worker.x + 640, hp: 10_000, armor: 0 });
    state.enemies = [enemy];
    const tower = { ...map.worker, id: 901, templateId, population: 5, radius: 72, pending: null, qualification: null };
    state.structures.push(tower);
    const auto = { type: "toggle-flame-arrows", towerId: tower.id };
    const fire = { type: "cast-flame-arrow", towerId: tower.id, targetId: enemy.id };
    assert.equal(tower.flameArrows, undefined);
    assert.equal(submit(state, "unavailable-target", { ...fire, targetId: 999 }).reason, "range");
    assert.equal(submit(state, "manual", fire).ok, true);
    scheduleEvent(state.queue, 1, { type: "weapon-ready", towerId: tower.id });
    advanceTo(state, state.queue.nowUs + 1);
    assert.equal(tower.attack.flameBonus, bonus);
    assert.equal(tower.flameTarget, undefined);
    assert.equal(submit(state, "on", auto).ok, true);
    assert.equal(submit(state, "off", auto).ok, true);
    advanceTo(state, state.queue.nowUs + 310_000);
    const projectile = state.queue.pending.find(event => event.payload.type === "weapon-impact").payload;
    assert.equal(projectile.shot.orbBonus, bonus);
    assert.equal(projectile.shot.weapon.speed, 1500);
    assert.equal(projectile.shot.weapon.homing, true);
    enemy.evasionUntilUs = second;
    advanceTo(state, second - 1);
    assert.equal(enemy.hp, 10_000);
    assert.equal(tower.mana, undefined);
  }
});

test("N041 through N044 summon two independent wolves with tiered Feedback and finite duration", () => {
  for (const [index, cost] of [40, 45, 55, 60].entries()) {
    let state = isolatedEconomy();
    dispatchWave(state, 1);
    const tower = { ...map.worker, id: 901, templateId: "n" + (173 + index), population: 5, radius: 72,
      pending: null, qualification: null };
    state.structures.push(tower);
    const spell = { type: "cast-tower", towerId: tower.id, skillId: "N0" + (41 + index) };
    assert.equal(submit(state, "cast", spell).ok, true);
    advanceTo(state, 500_002);
    assert.equal(tower.mana, tower.manaMaximum - cost);
    assert.equal(tower.towerSpellReady[spell.skillId], 22_500_002);
    assert.equal(state.summons.length, 2);
    assert.ok(state.summons.every(wolf => wolf.templateId === "b" + (103 + index) && wolf.summon.independent));
    assert.deepEqual(state.summons.map(wolf => wolf.y - tower.y), [-30, 30]);
    assert.equal(submit(state, "repeat", spell).reason, "cooldown");
    state.structures.length = 0;
    const [enemy] = state.enemies;
    Object.assign(enemy, { x: tower.x + 200, y: tower.y, hp: 10_000, armor: 0, mana: 30 });
    delete enemy.manaTickUs;
    state.enemies = [enemy];
    const firstWolfId = state.summons[0].id;
    scheduleEvent(state.queue, 1, { type: "weapon-ready", towerId: firstWolfId });
    state = JSON.parse(JSON.stringify(state));
    advanceTo(state, state.queue.nowUs + 400_000);
    assert.equal(state.enemies[0].mana, 30 - [10, 15, 20, 20][index]);
    assert.equal(state.recentHits.at(-1).casterId, firstWolfId);
    advanceTo(state, 15_500_002);
    assert.equal(state.summons.length, 0);
  }
});

test("A18 real death dispatch drops the four-tier chest or key once at the death point", () => {
  for (const expected of ["i404", "i414"]) {
    const state = isolatedEconomy();
    dispatchWave(state, 1);
    state.wave = 30;
    const step = rng => (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    let seed = 0;
    while (step(seed) / 2 ** 32 >= 1 / 300 ||
           Math.floor(step(step(seed)) / 2 ** 32 * 100) + 1 >= 25 ||
           (Math.floor(step(step(step(seed))) / 2 ** 32 * 100) + 1 < 35) !== (expected === "i414")) seed++;
    state.randomState = seed;
    const target = state.enemies[0];
    Object.assign(target, map.worker, { hp: 0 });
    assert.equal(removeDeadEnemy(state, target.id), true);
    const drop = state.inventory.find(item => item.itemId === expected);
    assert.deepEqual(drop.point, map.worker);
    assert.equal(drop.slot, null);
    assert.equal(removeDeadEnemy(state, target.id), false);
    const restored = JSON.parse(JSON.stringify(state));
    assert.equal(submit(restored, "pick-up", { type: "pick-up-item", itemId: drop.id }).ok, true);
    assert.equal(restored.inventory.filter(item => item.itemId === expected).length, 1);
    assert.equal(submit(restored, "pick-up-again", { type: "pick-up-item", itemId: drop.id }).reason, "missing");
  }
});

test("N045 through N047 retain a fixed field, stage 120 arrows, and resume deterministically", () => {
  for (const [index, raw] of [240, 360, 800].entries()) {
    const state = isolatedEconomy(811);
    dispatchWave(state, 1);
    const tower = { ...map.worker, id: 901, templateId: "n" + (174 + index), population: 5, radius: 72,
      pending: null, qualification: null };
    state.structures.push(tower);
    const [enemy] = state.enemies;
    Object.assign(enemy, { x: tower.x + 200, y: tower.y, hp: 1_000_000, armor: 0, abilities: [] });
    const exempt = { ...enemy, id: 999, abilities: ["Amim"] };
    state.enemies = [enemy, exempt];
    const spell = { type: "cast-tower", towerId: tower.id, skillId: "N0" + (45 + index) };
    assert.equal(submit(state, "cast", spell).ok, true);
    enemy.x += 100;
    exempt.x += 100;
    advanceTo(state, state.queue.nowUs + 500_000);
    const queue = state.queue.pending;
    const emit = queue.find(event => event.payload.type === "sword-rain-emit");
    assert.equal(emit.payload.center.x, tower.x + 200);
    assert.equal(emit.payload.remaining, 119);
    assert.equal(emit.payload.amount, raw);
    assert.equal(tower.mana, tower.manaMaximum - (index === 2 ? 50 : 100));
    const restored = JSON.parse(JSON.stringify(state));
    const interrupted = structuredClone(state);
    assert.equal(submit(interrupted, "stop", { type: "stop-tower-cast", towerId: tower.id }).ok, true);
    const stoppedRng = interrupted.randomState;
    advanceTo(interrupted, 9 * second);
    assert.equal(interrupted.randomState, stoppedRng);
    while (state.queue.pending.some(event => event.payload.type === "sword-rain-emit")) {
      const due = state.queue.pending.find(event => event.payload.type === "sword-rain-emit").dueUs;
      advanceTo(state, due);
    }
    const expectedRng = Array.from({ length: 119 }).reduce(rng => (Math.imul(rng, 1664525) + 1013904223) >>> 0, stoppedRng);
    assert.equal(state.randomState, expectedRng);
    advanceTo(state, 9 * second);
    advanceTo(restored, 9 * second, 11);
    assert.deepEqual(restored, state);
    assert.ok(enemy.hp < 1_000_000);
    assert.equal(exempt.hp, 1_000_000);
  }
});

test("Q20 transforms a real Tiny tower in place and persists the skill slots and equipment transaction", async () => {
  const { newHero, learnableSkills } = await import("../src/game/m2/hero.ts");
  const state = isolatedEconomy();
  const towerId = 900;
  const qualification = "P006";
  const hero = newHero("H021");
  hero.ranks = { A067: 1, A068: 1 };
  hero.paid = ["A067", "A068"];
  state.structures.push({ ...map.worker, id: towerId, templateId: "H021", population: 20, radius: 72,
    qualification, pending: null, hero, avalancheReadyUs: 20 * second });
  state.inventory = ["i310", "i101", "i304", "i198"].map((itemId, index) => ({
    id: 501 + index, itemId, charges: 0, slot: index, point: map.worker, towerId,
  }));
  const action = { type: "choose-skin", towerId, choice: "S212" };
  assert.equal(submit(state, "skin", action).ok, true);
  const restored = structuredClone(state);
  const tower = restored.structures[0];
  assert.equal(tower.id, towerId);
  assert.equal(tower.templateId, "G059");
  assert.equal(tower.qualification, qualification);
  assert.equal(tower.avalancheReadyUs, 20 * second);
  assert.deepEqual(tower.hero.natural, { STR: 58, AGI: 30, INT: 45 });
  assert.deepEqual(tower.hero.ranks, { A148: 1, A149: 1 });
  assert.deepEqual(tower.hero.paid, ["A148", "A149"]);
  assert.ok(learnableSkills("G059").some(skill => skill.skillId === "A148"));
  assert.deepEqual(restored.inventory.filter(item => item.towerId === towerId).map(item => item.itemId), ["i310", "i304"]);
  assert.deepEqual(restored.inventory.filter(item => item.slot === null).map(item => item.itemId), ["i101", "i198"]);
  assert.equal(submit(restored, "no-menu", action).ok, false);
  assert.deepEqual(tower.hero.natural, { STR: 58, AGI: 30, INT: 45 });
});

test("Max Necromancy uses live gear and mana, shares the cooldown and expires its two registered entities", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const state = isolatedEconomy();
  const hero = newHero("H029");
  state.structures.push({ ...map.worker, id: 900, templateId: "H029", population: 20, radius: 72,
    qualification: "P006", hero, pending: null });
  state.inventory = ["i196", "i193"].map((itemId, index) => ({
    id: 700 + index, itemId, charges: 0, slot: index, point: map.worker, towerId: 900,
  }));
  const cast = submit(state, "summon", { type: "cast-equipment", itemId: 700, towerId: 900 });
  assert.equal(cast.ok, true);
  const [archer] = state.summons;
  assert.equal(archer.templateId, "b110");
  assert.equal(archer.summon.ownerId, 900);
  assert.equal(archer.summon.projectileGroup.extra, 5);
  assert.equal(state.detectors.length, 1);
  assert.equal(submit(state, "same-cooldown", { type: "cast-equipment", itemId: 701, towerId: 900 }).reason, "cooldown");
  const restored = structuredClone(state);
  advanceTo(restored, 20 * second + 1);
  assert.equal(restored.detectors.length, 0);
  assert.equal(restored.summons.length, 0);
});

test("mana restoration settles charges and independent Soul Ring debt across a snapshot", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const state = isolatedEconomy();
  const hero = newHero("H029");
  const tower = { ...map.worker, id: 900, templateId: "H029", population: 20, radius: 72,
    qualification: "P006", hero, pending: null, mana: 10, manaMaximum: hero.natural.INT * 12, manaLastUs: 0 };
  state.structures.push(tower);
  state.inventory = ["i326", "i238"].map((itemId, index) => ({
    id: 700 + index, itemId, charges: index === 0 ? 1 : 0, slot: index, point: map.worker, towerId: 900,
  }));
  assert.equal(submit(state, "potion", { type: "cast-equipment", itemId: 700, towerId: 900 }).ok, true);
  assert.equal(state.inventory.some(item => item.id === 700), false);
  assert.equal(tower.mana, 9);
  assert.equal(submit(state, "ring", { type: "cast-equipment", itemId: 701, towerId: 900 }).ok, true);
  assert.ok(tower.mana > 100);
  assert.ok(state.queue.pending.some(event => event.payload.type === "mana-debt"));
  const restored = structuredClone(state);
  advanceTo(restored, state.queue.nowUs + 7 * second);
  assert.ok(restored.structures[0].mana < 100);
  assert.ok(restored.structures[0].manaPotionUntilUs > restored.queue.nowUs);
});

test("H005 actual casts settle every rank and A021 multiplies their nonlethal magic hits", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  for (const [index, factor] of [1.12, 1.15, 1.20, 1.25, 1.32, 1.40].entries()) {
    for (const [id, damage, cost, cooldown] of [
      ["A019", 500 * (index + 1), [20, 40, 80, 120, 170, 200][index], 3],
      ["A020", 3000 * (index + 1), [150, 200, 250, 300, 350, 450][index], 18 - 2 * index],
    ]) {
      const state = isolatedEconomy();
      dispatchWave(state, 1);
      const hero = newHero("H005");
      hero.natural.INT = 100;
      hero.ranks[id] = index + 1;
      const actor = { ...map.worker, id: 900, templateId: "H005", population: 20, radius: 72,
        pending: null, qualification: null, hero };
      state.structures.push(actor);
      const [target] = state.enemies;
      Object.assign(target, { x: actor.x + 480, y: actor.y, hp: 100_000, armor: 0, abilities: [] });
      state.enemies = [target];
      const boosted = structuredClone(state);
      boosted.structures[0].hero.ranks.A021 = index + 1;
      for (const run of [state, boosted]) {
        assert.ok(submit(run, id, { type: "cast-hero", towerId: actor.id, skillId: id }).ok);
        advanceTo(run, 300_002);
        assert.equal(run.structures[0].mana, run.structures[0].manaMaximum - cost);
        assert.equal(run.structures[0].heroSpellReady[id], 300_002 + cooldown * second);
        advanceTo(run, 1_200_000);
      }
      const expected = damage * .8 * 1.1;
      assert.ok(Math.abs(state.recentHits[0].amount - expected) < 1e-7, id);
      assert.ok(Math.abs(boosted.recentHits[0].amount - expected * factor) < 1e-7, id);
    }
  }
});

test("H012 ranks drive arrow costs, Strafe duration and Devour's independent timed attack contribution", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  for (let index = 0; index < 6; index++) {
    for (const id of ["A040", "A041", "A042"]) {
      const state = isolatedEconomy();
      dispatchWave(state, 1);
      const hero = newHero("H012");
      hero.natural.INT = 100;
      hero.ranks[id] = index + 1;
      const tower = { ...map.worker, id: 900, templateId: "H012", population: 20, radius: 72,
        pending: null, qualification: null, hero };
      state.structures.push(tower);
      const [target] = state.enemies;
      Object.assign(target, { x: tower.x + 600, y: tower.y, hp: 20_000, maxHp: 20_000, armor: 0, abilities: [] });
      state.enemies = [target];
      if (id === "A040") {
        assert.ok(submit(state, "arrow", { type: "cast-flame-arrow", towerId: tower.id, targetId: target.id }).ok);
        scheduleEvent(state.queue, 1, { type: "weapon-ready", towerId: tower.id });
        advanceTo(state, state.queue.nowUs + 1);
        advanceTo(state, state.queue.pending.find(event => event.payload.type === "weapon-fire").dueUs);
        const missile = state.queue.pending.find(event => event.payload.type === "weapon-impact").payload.shot;
        assert.equal(missile.orbBonus, 500 + 200 * index);
        assert.equal(tower.mana, tower.manaMaximum - 3);
        continue;
      }
      assert.ok(submit(state, id, { type: "cast-hero", towerId: tower.id, skillId: id }).ok);
      advanceTo(state, 300_002);
      if (id === "A041") {
        assert.equal(tower.strafeUntilUs, 300_002 + [4, 5, 6, 7, 8, 10][index] * second);
        assert.equal(tower.mana, tower.manaMaximum - 30 - 10 * index);
      } else {
        assert.equal(state.enemies.length, 0);
        assert.deepEqual(Object.values(tower.contracts), [Math.trunc(20_000 * (.08 + index * .01))]);
        const restored = structuredClone(state);
        advanceTo(restored, 120_300_002);
        assert.deepEqual(restored.structures[0].contracts, {});
      }
    }
  }
});
