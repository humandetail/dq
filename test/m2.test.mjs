import { scheduleEvent } from "../src/game/event-queue.ts";
import { heroThresholds } from "../src/game/m2/hero.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import m2Configuration from "../docs/m2-configuration.json" with { type: "json" };
import { configuration, cards, chestPools, items, m2Cards, m2Items, openingChoices, qualificationChains, recipes, seasonTasks, workerTowers } from "../src/game/m2/content.ts";
import { buildAnchor, chooseWaypoint, map, roadEdges, mapVersion } from "../src/game/m2/map.ts";
import { attackRange, canSeeEnemy, circleId, containmentPoints, creditTime, drain, enqueue, grantHeroExperience, newMatch, qualified, removeDeadEnemy, restoreHeroState, talentHeroDamageFactor } from "../src/game/m2/match.ts";
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

function controlledOpening(matchId, card) {
  for (let seed = 1; seed <= 100; seed++) {
    const match = newMatch(matchId, seed);
    if (match.openingCandidates.includes(card)) return match;
  }
  throw new Error(`Controlled fixture did not offer ${card}`);
}

function openHeroChoices(state) {
  const pack = state.inventory.find(item => item.itemId === "i004");
  assert.equal(submit(state, "open-starter", { type: "use-item", itemId: pack.id }).ok, true);
}

test("Historical M2 content and the active pools resolve their qualification providers, skills, worker chains and recipes", () => {
  assert.deepEqual(m2Configuration.openingChoiceOrder, ["i564", "i581", "i569", "i576"]);
  assert.deepEqual(m2Configuration.openingChoiceOrder.map(id => m2Cards.get(id).name), ["小小", "双头龙", "暗影萨满", "复仇之魂"]);
  assert.deepEqual(openingChoices, [...m2Configuration.openingChoiceOrder, "i551", "i552", "i553", "i554", "i555", "i556", "i557", "i558", "i559", "i560", "i561", "i562", "i563", "i565", "i566", "i567", "i568", "i570", "i572", "i573", "i574", "i575", "i578", "i579", "i580", "i582", "i583", "i584", "i585", "i586", "i587", "i588", "i589", "i590", "i591", "i592", "i593", "i594", "i595", "i596", "i597"]);
  assert.equal(cards.get("i564").levels[0].fields.STR.value, 28);
  assert.equal(cards.get("i564").levels[0].growth.fields.AGI.selectedValue, 0);
  assert.deepEqual([...m2Cards.keys()], Object.values(configuration.cardPools).flat().filter(id => m2Cards.has(id)));
  assert.equal(m2Cards.size, 19);
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
  assert.equal(m2Items.size, 202);
  assert.equal([...recipes.keys()].filter(id => m2Items.has(id)).length, 72);
  assert.deepEqual(recipes.get("i265"), ["i266", "i308"]);
  for (const material of [...recipes.values()].flat()) assert.ok(items.has(material), material);
  assert.deepEqual(m2Configuration.chestOverrides.i404.entries, ["i502", "i503"]);
  assert.deepEqual(chestPools.get("i404").find(group => group.weight === 30).entries, ["i501", "i502", "i503", "i504"]);
  assert.equal(seasonTasks.spring.length + seasonTasks.summer.length, 18);
  assert.ok(["1", "2", "3", "9"].every(restored => seasonTasks.spring.some(([id]) => id === restored)));
  assert.ok(seasonTasks.summer.some(([id]) => id === "1"));
});

test("M2 opening, construction, cancellation and refund are ordered and survive a snapshot", () => {
  let state = newMatch("start", 47);
  openHeroChoices(state);
  const [selected, other] = state.openingCandidates;
  const openingRandomState = state.randomState;
  const choice = submit(state, "initial", { type: "choose-opening", card: selected });
  assert.equal(choice.ok, true);
  assert.equal(state.randomState, openingRandomState);
  assert.equal(enqueue(state, { id: "initial", matchId: state.matchId, action: { type: "choose-opening", card: selected } }), false);
  assert.equal(submit(state, "second", { type: "choose-opening", card: other }).ok, false);

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
  assert.equal(state.cards[0].card, selected);
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
  const state = controlledOpening("placement-resources", "i564");
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
  let state = controlledOpening("learn", "i564");
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
  const state = controlledOpening("recycle", "i564");
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
  let state = controlledOpening("prayer-books", "i564");
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
  assert.equal(submit(state, "too-soon", { type: "choose-opening", card: state.openingCandidates[0] }).reason, "opening");
  let initializedRng = 47;
  for (let draw = 0; draw < 20 + (openingChoices.length > 4 ? 4 : 0); draw++) initializedRng = (Math.imul(initializedRng, 1664525) + 1013904223) >>> 0;
  assert.deepEqual([starter.itemId, newbie.itemId, state.randomState], ["i004", "i006", initializedRng]);
  openHeroChoices(state);
  const rng = (Math.imul(initializedRng, 1664525) + 1013904223) >>> 0;
  assert.equal(state.randomState, rng);
  assert.deepEqual(state.inventory.map(item => [item.itemId, item.slot]),
    [["i006", 1], ["i401", 2], ["i411", 3], ["i411", 4], ["i412", 5]]);
  state = JSON.parse(JSON.stringify(state));
  assert.equal(submit(state, "duplicate-pack", { type: "use-item", itemId: starter.id }).ok, false);
  assert.equal(state.randomState, rng);
  assert.equal(submit(state, "actual-choice", { type: "choose-opening", card: state.openingCandidates[0] }).ok, true);
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
  dispatchWave(state, 1);
  const [slain] = state.enemies;
  slain.hp = 0;
  assert.equal(removeDeadEnemy(state, slain.id, 71), true);
  assert.equal(state.inventory.find(item => item.id === 82).charges, 1);
  assert.equal(submit(state, "recycle-provider", { type: "recycle-tower", towerId: 72 }).ok, true);
  state = JSON.parse(JSON.stringify(state));
  assert.equal(qualified(state, 71), false);
  assert.deepEqual(state.inventory.map(item => [item.id, item.towerId, item.slot, item.charges]), [[81, 71, 0, 3], [82, 0, 0, 1]]);
  assert.equal(transfer("return", 81).ok, true);
  assert.equal(transfer("re-equip", 81, 71).reason, "equipment");
  assert.equal(state.inventory[0].towerId, undefined);
  assert.equal(state.inventory[0].slot, null);
});

test("the displayed attack range matches acquisition and equipment, with a separate windup buffer", () => {
  for (const [templateId, radius, lanceRadius] of [["H021", 750, 850], ["H018", 800, 900], ["n001", 1000, 1200]]) {
    const state = isolatedEconomy();
    dispatchWave(state, 1);
    const tower = { ...map.worker, id: 900, templateId, population: 5, radius: 72, pending: null, qualification: null };
    state.structures = [tower];
    const [enemy] = state.enemies;
    Object.assign(enemy, { x: tower.x + radius + 1, y: tower.y, hp: 100_000, armor: 0, abilities: [] });
    state.enemies = [enemy];
    const seek = () => {
      scheduleEvent(state.queue, 1, { type: "weapon-ready", towerId: tower.id });
      advanceTo(state, state.queue.nowUs + 1);
    };
    assert.equal(attackRange(state, tower), radius, templateId);
    seek();
    assert.equal(tower.attack?.winding, undefined, templateId);
    enemy.x--;
    seek();
    assert.equal(tower.attack?.winding, true, templateId);
    enemy.x += 50;
    advanceTo(state, tower.attack.timing.windup.dueUs);
    assert.ok(state.recentHits?.length || state.queue.pending.some(event => event.payload.type === "weapon-impact"), templateId);
    advanceTo(state, state.queue.nowUs + 2_500_000);
    seek();
    assert.equal(tower.attack.winding, false, templateId);
    enemy.x -= 50;
    seek();
    assert.equal(tower.attack.winding, true, templateId);

    state.inventory = [{ id: 901, itemId: "i282", towerId: tower.id, slot: 0, point: map.worker, charges: 0 }];
    assert.equal(attackRange(state, tower), lanceRadius, templateId);
  }
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
      assert.ok(state.activityScore >= min && state.activityScore <= max);
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
  let state = controlledOpening("combat-loop", "i564");
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
  const state = controlledOpening("ward-combat-fixture", "i569");
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

test("season points credit restored tasks and cross each original reward node once", async () => {
  const { startSeasons, creditSeason } = await import("../src/game/m2/seasons.ts");
  const { seasons, score } = startSeasons();
  assert.equal(score, 60);
  assert.deepEqual(seasons.spring.nodes, [1, 4]);
  assert.deepEqual(seasons.summer.nodes, [1]);
  assert.equal(seasons.spring.points, 40);
  assert.equal(seasons.summer.points, 30);
  const restored = JSON.parse(JSON.stringify(seasons));
  assert.equal(creditSeason(restored, "spring", 7, 666), 0);
  assert.equal(creditSeason(restored, "spring", 1, 13), 70);
  assert.equal(creditSeason(restored, "spring", 1, 13), 0);
  assert.equal(creditSeason(restored, "spring", 4, 33), 0);
  assert.equal(creditSeason(restored, "spring", 5, 20), 0);
  assert.equal(restored.spring.points, 130);
  assert.deepEqual(restored.spring.nodes, [1, 4, 7, 10]);
  assert.deepEqual(restored.spring.unlocks, ["k543"]);
  assert.equal(creditSeason(restored, "spring", 5, 1), 0);
});

test("Q22 applies absent solo support on restore without crediting the same reward twice", async () => {
  const { emptySeasons, creditSeason } = await import("../src/game/m2/seasons.ts");
  const state = isolatedEconomy();
  state.seasons = emptySeasons();
  assert.equal(creditSeason(state.seasons, "spring", 7, 666), 50);
  restoreHeroState(state);
  assert.equal(state.seasonScore, 10);
  assert.equal(state.seasons.spring.points, 40);
  assert.equal(state.seasons.summer.points, 30);
  const restored = JSON.parse(JSON.stringify(state));
  restoreHeroState(restored);
  assert.deepEqual(restored, state);
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
  const resumed = JSON.parse(JSON.stringify(terminal));
  restoreHeroState(resumed);
  dispatchWave(resumed, 54);
  assert.equal(resumed.seasons.summer.counts[2], 1);
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

test("N116 skips an immune target at selection and never replaces an invalidated target at effect time", async () => {
  const { state, tower, enemy } = await damagePipelineFixture();
  tower.templateId = "n254";
  tower.manaOffset = 1000;
  enemy.abilities = ["Amim"];
  const eligible = { ...enemy, id: enemy.id + 1, abilities: [] };
  const alternate = { ...eligible, id: enemy.id + 2 };
  state.enemies = [alternate, enemy, eligible];
  const cast = { type: "cast-tower", towerId: tower.id, skillId: "N116" };
  assert.equal(submit(state, "invalid-selection", { ...cast, targetId: enemy.id }).reason, "range");
  assert.ok(submit(state, "purge", cast).ok);
  const pending = state.queue.pending.find(event => event.payload.type === "tower-spell");
  assert.equal(pending.payload.targetId, eligible.id);
  eligible.abilities = ["Amim"];
  const mana = tower.mana;
  advanceTo(state, pending.dueUs);
  assert.equal(tower.mana, mana);
  assert.equal(tower.towerSpellReady, undefined);
  assert.equal(alternate.purge, undefined);
  eligible.abilities = [];
  assert.ok(submit(state, "purge-alternate", { ...cast, targetId: alternate.id }).ok);
  advanceTo(state, state.queue.nowUs + 500_000);
  assert.ok(alternate.purge);
  assert.equal(eligible.purge, undefined);
  alternate.abilities = ["Amim"];
  scheduleEvent(state.queue, 1, { type: "movement" });
  advanceTo(state, state.queue.nowUs + 1);
  assert.equal(alternate.purge, undefined);
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

test("a single wolf takes a routed move, an explicit attack and a stop across a saved order", () => {
  const state = isolatedEconomy(811);
  const tower = { x: -225, y: 0, id: 901, templateId: "n173", population: 5, radius: 72, pending: null, qualification: null };
  state.structures.push(tower);
  assert.ok(submit(state, "summon", { type: "cast-tower", towerId: tower.id, skillId: "N041" }).ok);
  advanceTo(state, 500_001);
  const [wolf, partner] = state.summons;
  assert.equal(wolf.radius, 25);
  assert.equal(submit(state, "invalid-order", { type: "move-wolf", unitId: wolf.id, point: { x: 0, y: 0 } }).reason, "placement");
  const point = { x: 225, y: 0 };
  assert.ok(submit(state, "move", { type: "move-wolf", unitId: wolf.id, point }).ok);
  scheduleEvent(state.queue, 31_250, { type: "movement" }, 31_250);
  const stalled = structuredClone(state);
  stalled.structures.push({ ...tower, id: 902, ...point });
  advanceTo(stalled, second);
  assert.deepEqual([stalled.summons[0].x, stalled.summons[0].y], [wolf.x, wolf.y]);
  stalled.structures.pop();
  advanceTo(stalled, 4 * second);
  assert.equal(stalled.summons[0].x, point.x);
  advanceTo(state, 1_000_000);
  assert.ok(wolf.wolfOrder.path.length > 1);
  const restored = JSON.parse(JSON.stringify(state));
  advanceTo(state, 4 * second);
  advanceTo(restored, 4 * second, 3);
  assert.deepEqual(restored, state);
  assert.deepEqual({ x: wolf.x, y: wolf.y }, point);
  assert.deepEqual([partner.x, partner.y], [-225, 30]);
  assert.equal(wolf.wolfOrder, undefined);

  const enemy = { id: 3_000, unitId: "m001", points: 1, x: -1050, y: 0, layer: "ground",
    hp: 200_000, mana: 40, armor: 0, wave: 1, radius: 1, speed: 0, initialOverlaps: [], waypoint: 0, previousWaypoint: null };
  const decoy = { ...enemy, id: 3001, x: 350 };
  state.enemies = [decoy, enemy];
  assert.ok(submit(state, "attack", { type: "attack-with-wolf", unitId: wolf.id, targetId: enemy.id }).ok);
  advanceTo(state, 8 * second);
  assert.ok(state.recentHits.some(hit => hit.casterId === wolf.id && hit.targetId === enemy.id));
  assert.ok(!state.recentHits.some(hit => hit.casterId === wolf.id && hit.targetId === decoy.id));
  state.enemies = [decoy];
  advanceTo(state, state.queue.nowUs + 31_250);
  assert.equal(wolf.wolfOrder, undefined);
  assert.equal(submit(state, "missing-target", { type: "attack-with-wolf", unitId: wolf.id, targetId: enemy.id }).reason, "range");
  assert.ok(submit(state, "new-target", { type: "attack-with-wolf", unitId: wolf.id, targetId: decoy.id }).ok);
  assert.ok(submit(state, "stop", { type: "stop-wolf", unitId: wolf.id }).ok);
  assert.equal(wolf.wolfOrder, undefined);
  advanceTo(state, 15_501_000);
  assert.equal(submit(state, "expired", { type: "stop-wolf", unitId: wolf.id }).reason, "missing");
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

test("sword rain hits enemy structures and unit debris without destroying terrain or hitting air", async () => {
  const { unitTargetType } = await import("../src/game/m2/combat.ts");
  const state = isolatedEconomy(811);
  const tower = { ...map.worker, id: 901, templateId: "n174", population: 5, radius: 72, pending: null, qualification: null };
  state.structures.push(tower);
  const origin = { x: -100, y: 0 };
  const enemy = { ...origin, x: 50, id: 102, unitId: "hbar", hp: 1000, armor: 0, mana: 0, layer: "ground",
    radius: 1, speed: 0, initialOverlaps: [], waypoint: 0, previousWaypoint: null, wave: 1, points: 1 };
  const debris = { ...enemy, y: 25, id: 101, unitId: "test-debris" };
  const air = { ...enemy, id: 100, unitId: "echm", layer: "fly" };
  const originalTerrain = structuredClone(map.obstacles);
  unitTargetType.set(debris.unitId, "debris");
  try {
    state.enemies = [enemy, debris, air];
    scheduleEvent(state.queue, 31_250, { type: "sword-rain-travel", towerId: tower.id, skillId: "N045", origin,
      direction: { x: 1, y: 0 }, amount: 240, from: 0, distance: 120, length: 300 });
    advanceTo(state, 31_250);
    assert.deepEqual(state.recentHits.map(hit => hit.targetId), [101, 102]);
    assert.equal(air.hp, 1000);
    assert.equal(state.swordRainImpacts.length, 1);
    assert.deepEqual(map.obstacles, originalTerrain);
  } finally {
    unitTargetType.delete(debris.unitId);
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

test("Q46 growth attack survives qualification downgrade, restore and form change", async () => {
  const { newHero, heroModelScale } = await import("../src/game/m2/hero.ts");
  const state = isolatedEconomy();
  dispatchWave(state, 1);
  const [enemy] = state.enemies;
  const hero = newHero("H021");
  const tower = { ...map.worker, id: 900, templateId: "H021", population: 20, radius: 72,
    qualification: "P006", pending: null, hero };
  const provider = { ...tower, id: 901, templateId: "n167", population: 5, hero: undefined };
  state.structures = [tower, provider];
  state.population = 25;
  grantHeroExperience(state, tower.id, heroThresholds[24]);
  for (const skillId of ["A067", "A068", "T000", "A069"]) {
    for (let rank = 1; rank <= 6; rank++) {
      assert.ok(submit(state, skillId + rank, { type: "learn-skill", towerId: tower.id, skillId }).ok);
    }
  }
  assert.equal(hero.level, 25);
  assert.deepEqual(hero.growthBonus, { attack: 540, modelScale: 1.7, learnedIn: "H021" });
  assert.deepEqual(hero.natural, { STR: 220, AGI: 0, INT: 87 });
  assert.ok(submit(state, "lose-qualification", { type: "recycle-tower", towerId: provider.id }).ok);
  grantHeroExperience(state, tower.id, heroThresholds[25] - hero.xp);
  assert.equal(hero.level, 20);
  assert.equal(hero.ranks.A069, 2);
  assert.deepEqual(hero.natural, { STR: 180, AGI: 0, INT: 72 });
  assert.deepEqual(hero.growthBonus, { attack: 540, modelScale: 1.7, learnedIn: "H021" });
  const restored = JSON.parse(JSON.stringify(state));
  restoreHeroState(restored);
  const [actor] = restored.structures;
  assert.equal(heroModelScale(actor.hero, actor.templateId), 1.7);

  function weaponHit(attack, aura) {
    const run = structuredClone(restored);
    const [source] = run.structures;
    source.hero.growthBonus.attack = attack;
    if (aura) {
      const amplifier = newHero("H038");
      amplifier.ranks.A153 = 6;
      run.structures.push({ ...source, id: 902, templateId: "H038", hero: amplifier });
    }
    run.enemies = [{ ...enemy, x: source.x + 720, y: source.y, hp: 100_000, armor: 0, abilities: [] }];
    const now = run.queue.nowUs;
    source.attack = { targetId: enemy.id, readyUs: now + second, winding: true, startedUs: now };
    scheduleEvent(run.queue, 1, { type: "weapon-fire", towerId: source.id, targetId: enemy.id, slot: 1, startedUs: now });
    advanceTo(run, now + 1);
    return run.recentHits.find(hit => hit.casterId === source.id).amount;
  }
  const contribution = weaponHit(540, false) - weaponHit(0, false);
  assert.ok(contribution > 0);
  assert.ok(Math.abs(weaponHit(540, true) - weaponHit(0, true) - 1.5 * contribution) < 1e-9);
  assert.ok(submit(restored, "form", { type: "choose-skin", towerId: actor.id, choice: "S212" }).ok);
  assert.equal(actor.templateId, "G059");
  assert.deepEqual(actor.hero.growthBonus, { attack: 540, modelScale: 1.7, learnedIn: "H021" });
  assert.equal(actor.radius, tower.radius);
  assert.equal(heroModelScale(actor.hero, actor.templateId), 1.7);
  const legacy = structuredClone(restored);
  delete legacy.structures[0].hero.growthBonus;
  restoreHeroState(legacy);
  restoreHeroState(legacy);
  assert.deepEqual(legacy.structures[0].hero.growthBonus, { attack: 180, modelScale: .9, learnedIn: "G059" });
});

test("manual self-buff settles without a target and shares automatic cooldown after restore", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { unitBalance } = await import("../src/game/m2/combat.ts");
  for (const [templateId, skillId, wrongSkill] of [["H021", "A068", "A149"], ["G059", "A149", "A068"]]) {
    const state = isolatedEconomy();
    dispatchWave(state, 1);
    const [enemy] = state.enemies.splice(0);
    const hero = newHero(templateId);
    const towerId = 900;
    const tower = { ...map.worker, id: towerId, templateId, population: 20, radius: 72,
      qualification: null, pending: null, hero, mana: 9, manaLastUs: state.queue.nowUs,
      manaMaximum: (unitBalance.get(templateId)?.manaN ?? 0) + hero.natural.INT * 12 };
    state.structures.push(tower);
    const command = { type: "cast-hero", towerId, skillId };
    assert.equal(submit(state, "unlearned", command).reason, "missing");
    hero.ranks[skillId] = 1;
    assert.equal(submit(state, "wrong-form", { ...command, skillId: wrongSkill }).reason, "missing");
    assert.equal(submit(state, "no-mana", command).reason, "resources");
    assert.equal(tower.treeGrab, undefined);
    tower.mana = 100;
    assert.ok(submit(state, "cast", command).ok);
    assert.ok(Math.abs(tower.mana - 90) < .001);
    assert.deepEqual(Object.values(tower.treeGrab.strength), [20]);
    const restored = JSON.parse(JSON.stringify(state));
    const current = restored.structures[0];
    const { cleaveUntilUs, readyUs } = current.treeGrab;
    assert.equal(submit(restored, "cooldown", command).reason, "cooldown");
    advanceTo(restored, cleaveUntilUs);
    assert.deepEqual(current.treeGrab.strength, {});
    assert.equal(current.treeGrab.readyUs, readyUs);
    Object.assign(enemy, { x: current.x + 720, y: current.y, hp: 100_000, abilities: [] });
    restored.enemies = [enemy];
    scheduleEvent(restored.queue, readyUs - restored.queue.nowUs, { type: "weapon-ready", towerId });
    advanceTo(restored, readyUs);
    assert.equal(current.attack.targetId, enemy.id);
    assert.equal(current.attack.winding, true);
    assert.deepEqual(Object.values(current.treeGrab.strength), [20]);
    assert.equal(current.treeGrab.readyUs, readyUs + 15 * second);
    assert.equal(submit(restored, "auto-used-cooldown", command).reason, "cooldown");
  }
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
      const expected = damage * (id === "A019" ? .8 : 1) * 1.1;
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

test("H012 manual orb uses its 1300 range and charges only after a valid windup", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const makeRun = () => {
    const state = isolatedEconomy();
    dispatchWave(state, 1);
    const hero = newHero("H012");
    hero.ranks.A040 = 1;
    const tower = { ...map.worker, id: 900, templateId: "H012", population: 15, radius: 72,
      pending: null, qualification: null, hero };
    state.structures.push(tower);
    const [enemy] = state.enemies;
    Object.assign(enemy, { x: tower.x + 1300, y: tower.y, hp: 20_000, armor: 0, abilities: [] });
    state.enemies = [enemy];
    return { state, tower, enemy };
  };
  for (const movement of [0, 1]) {
    const { state, tower, enemy } = makeRun();
    const manual = { type: "cast-flame-arrow", towerId: tower.id, targetId: enemy.id };
    enemy.x++;
    assert.equal(submit(state, "out-of-range", manual).reason, "range");
    enemy.x--;
    assert.equal(submit(state, "arrow", manual).ok, true);
    scheduleEvent(state.queue, 1, { type: "weapon-ready", towerId: tower.id });
    advanceTo(state, state.queue.nowUs + 1);
    assert.equal(tower.attack.manualFlame, true);
    assert.equal(tower.mana, tower.manaMaximum);
    enemy.x += movement;
    const due = state.queue.pending.find(event => event.payload.type === "weapon-fire").dueUs;
    advanceTo(state, due);
    assert.equal(tower.mana, tower.manaMaximum - (movement === 0 ? 3 : 0));
    const impact = state.queue.pending.find(event => event.payload.type === "weapon-impact");
    assert.equal(impact?.payload.shot.orbBonus, movement === 0 ? 500 : undefined);
  }
});

test("H012 automatic flame yields to eligible corrosion while a manually aimed arrow uses only its own orb", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  for (const manual of [false, true]) {
    const { state, tower, enemy } = await damagePipelineFixture();
    tower.templateId = "H012";
    tower.hero = newHero("H012");
    tower.hero.ranks.A040 = 1;
    enemy.x += 400;
    state.inventory = [{ id: 902, itemId: "i188", slot: 0, towerId: tower.id, point: { ...tower }, charges: 0 }];
    if (manual) assert.equal(submit(state, "manual-orb", { type: "cast-flame-arrow", towerId: tower.id, targetId: enemy.id }).ok, true);
    scheduleEvent(state.queue, 0, { type: "weapon-ready", towerId: tower.id });
    advanceTo(state, state.queue.nowUs);
    advanceTo(state, tower.attack.timing.windup.dueUs);
    const { shot } = state.queue.pending.find(event => event.payload.type === "weapon-impact").payload;
    assert.equal(shot.orbBonus, manual ? 500 : undefined);
    assert.equal(shot.corrosion, manual ? undefined : 70);
    if (manual) assert.equal(tower.manaMaximum - tower.mana, 3);
    else assert.equal(tower.mana, undefined);
  }
});

test("N001 manual flame runs one equipment spell effect at release and its auto toggle produces none", async () => {
  for (const manual of [false, true]) {
    const { state, tower, enemy } = await damagePipelineFixture();
    tower.templateId = "n142";
    tower.mana = 150;
    enemy.x += 200;
    enemy.hp = enemy.maxHp = 10_000;
    state.randomState = 1;
    state.inventory = [{ id: 902, itemId: "i134", slot: 0, towerId: tower.id, point: { ...tower }, charges: 0 }];
    assert.equal(submit(state, "arm-arrow", manual ?
      { type: "cast-flame-arrow", towerId: tower.id, targetId: enemy.id } :
      { type: "toggle-flame-arrows", towerId: tower.id }).ok, true);
    scheduleEvent(state.queue, 0, { type: "weapon-ready", towerId: tower.id });
    advanceTo(state, state.queue.nowUs);
    assert.equal(state.recentHits?.length ?? 0, 0);
    advanceTo(state, tower.attack.timing.windup.dueUs);
    assert.equal(state.recentHits?.length ?? 0, manual ? 1 : 0);
    assert.equal(enemy.hp < 10_000, manual);
    const { shot } = state.queue.pending.find(event => event.payload.type === "weapon-impact").payload;
    assert.equal(shot.orbBonus, 40);
  }
});

async function damagePipelineFixture() {
  const { weapons } = await import("../src/game/m2/combat.ts");
  const state = isolatedEconomy();
  dispatchWave(state, 1);
  state.queue.pending = [];
  const tower = { ...map.worker, id: 900, templateId: "n001", radius: 72, pending: null, qualification: null };
  state.structures = [tower];
  const [enemy] = state.enemies;
  Object.assign(enemy, { ...map.worker, hp: 1000, maxHp: 1000, armor: 0, abilities: [] });
  state.enemies = [enemy];
  const shot = { towerId: tower.id, sourceTemplate: "n001", targetId: enemy.id,
    weapon: { ...weapons.n001[0], attackType: "chaos", homing: false }, raw: 100, point: map.worker, destination: map.worker };
  const impact = (shot, delay = 1) => scheduleEvent(state.queue, delay, { type: "weapon-impact", shot, travelUs: 0 });
  return { state, tower, enemy, shot, impact };
}

test("T03 gear changes preserve elapsed weapon work across windup, cooldown and saved backswing", async () => {
  const { state, tower, enemy } = await damagePipelineFixture();
  const start = state.queue.nowUs;
  state.inventory = [{ id: 901, itemId: "i108", charges: 0, slot: 0, point: map.worker }];
  scheduleEvent(state.queue, 0, { type: "weapon-ready", towerId: tower.id });
  advanceTo(state, start);
  assert.equal(tower.attack.timing.windup.dueUs, start + 300_000);
  advanceTo(state, start + 99_999);
  assert.equal(submit(state, "gain-haste", { type: "transfer-item", itemId: 901, towerId: tower.id }).ok, true);
  const { rawRate, windup, cooldown } = tower.attack.timing;
  assert.equal(rawRate, 1.12);
  assert.equal(windup.dueUs, start + 100_000 + Math.round(200_000 / rawRate));
  assert.equal(cooldown.dueUs, start + 100_000 + Math.round(1_400_000 / rawRate));
  advanceTo(state, windup.dueUs);
  const hp = enemy.hp;
  assert.ok(hp < 1000);
  advanceTo(state, windup.dueUs + 99_999);
  const saved = JSON.parse(JSON.stringify(state));
  restoreHeroState(saved);
  assert.deepEqual(saved.queue, state.queue);
  for (const run of [state, saved]) {
    const [unit] = run.structures;
    assert.equal(submit(run, "lose-haste", { type: "transfer-item", itemId: 901 }).ok, true);
    assert.equal(unit.attack.timing.rawRate, 1);
    assert.equal(unit.attack.timing.backswing.dueUs, windup.dueUs + 288_000);
    assert.equal(unit.attack.timing.cooldown.dueUs, start + 1_500_000 - Math.round((windup.dueUs - start) * .12));
    assert.equal(unit.lastAttackUs, windup.dueUs);
    assert.equal(run.enemies[0].hp, hp);
  }
  assert.deepEqual(saved.queue, state.queue);
  assert.deepEqual(saved.structures[0].attack, tower.attack);
});

test("T03 a rate change ordered before a due windup preserves its timer and uses the new rate for recovery", async () => {
  const { state, tower } = await damagePipelineFixture();
  const start = state.queue.nowUs;
  state.inventory = [{ id: 901, itemId: "i108", charges: 0, slot: 0, point: map.worker }];
  const action = { type: "transfer-item", itemId: 901, towerId: tower.id };
  scheduleEvent(state.queue, 300_000, { type: "command", command: { id: "same-clock", matchId: state.matchId, action } });
  scheduleEvent(state.queue, 0, { type: "weapon-ready", towerId: tower.id });
  advanceTo(state, start);
  const original = tower.attack.timing.windup.timerId;
  state.clock.targetUs = start + 300_000;
  assert.equal(drain(state, 1), "pending");
  assert.equal(state.commandResults["same-clock"].ok, true);
  assert.equal(tower.attack.timing.windup.timerId, original);
  advanceTo(state, state.clock.targetUs);
  assert.equal(tower.lastAttackUs, start + 300_000);
  assert.equal(tower.attack.timing.backswing.dueUs, start + 300_000 + Math.round(300_000 / 1.12));
});

test("T03 i304 changes only the remaining fraction of a running cooldown", async () => {
  const { state, tower } = await damagePipelineFixture();
  const start = state.queue.nowUs;
  const chain = qualificationChains.get("P001");
  tower.qualification = chain.id;
  state.structures.push({ ...tower, id: 903, templateId: chain.requireUnit, qualification: null });
  state.inventory = [{ id: 901, itemId: "i304", charges: 3, slot: 0, point: map.worker }];
  scheduleEvent(state.queue, 0, { type: "weapon-ready", towerId: tower.id });
  advanceTo(state, start);
  const windup = tower.attack.timing.windup;
  advanceTo(state, start + 149_999);
  assert.equal(submit(state, "reduce-cycle", { type: "transfer-item", itemId: 901, towerId: tower.id }).ok, true);
  assert.deepEqual(tower.attack.timing.windup, windup);
  assert.equal(tower.attack.timing.cycleUs, 1_300_000);
  assert.equal(tower.attack.timing.cooldown.dueUs, start + 150_000 + 1_170_000);
});

test("T03 restores a b106 cooldown that finishes before its windup without launching twice", async () => {
  const { state, tower, enemy } = await damagePipelineFixture();
  tower.templateId = "n176";
  enemy.hp = enemy.maxHp = 100_000;
  assert.ok(submit(state, "summon-b106", { type: "cast-tower", towerId: tower.id, skillId: "N044" }).ok);
  advanceTo(state, state.queue.pending.find(event => event.payload.type === "tower-spell").dueUs);
  const [wolf] = state.summons;
  assert.equal(wolf.templateId, "b106");
  scheduleEvent(state.queue, 0, { type: "weapon-ready", towerId: wolf.id });
  advanceTo(state, state.queue.nowUs);
  const started = state.queue.nowUs;
  assert.equal(wolf.attack.timing.cooldown.dueUs, started + 300_000);
  assert.equal(wolf.attack.timing.windup.dueUs, started + 330_000);
  advanceTo(state, started + 300_000);
  assert.equal(wolf.attack.timing.cooldown, undefined);
  assert.equal(wolf.lastAttackUs, undefined);
  const restored = JSON.parse(JSON.stringify(state));
  restoreHeroState(restored);
  advanceTo(restored, started + 330_000);
  assert.equal(restored.summons[0].lastAttackUs, started + 330_000);
  assert.equal(restored.summons[0].attack.startedUs, started + 330_000);
  assert.equal(restored.recentHits.filter(hit => hit.casterId === wolf.id).length, 1);
});

test("N061–N063 frenzy uses the bound spell cost, preserves its rank through an upgrade, and replaces on recast", async () => {
  const { state, enemy, tower } = await damagePipelineFixture();
  tower.templateId = "n183";
  state.gold = 10_000;
  enemy.hp = enemy.maxHp = 100_000;
  const cast = (run, id, skillId) => submit(run, id, { type: "cast-tower", towerId: tower.id, skillId });
  assert.equal(cast(state, "unbound-rank", "N062").reason, "missing");
  assert.equal(cast(state, "first-frenzy", "N061").ok, true);
  assert.equal(tower.mana, 170);
  assert.equal(cast(state, "spent-frenzy", "N061").reason, "cooldown");
  const firstExpiry = tower.frenzyUntilUs;
  assert.equal(submit(state, "upgrade-through-frenzy", { type: "upgrade-tower", towerId: tower.id }).ok, true);
  advanceTo(state, state.queue.pending.find(event => event.payload.type === "finish-construction").dueUs);
  const restored = JSON.parse(JSON.stringify(state));
  restoreHeroState(restored);
  const [unit] = restored.structures;
  assert.equal(unit.templateId, "n184");
  assert.equal(unit.frenzyAmount, .2);
  scheduleEvent(restored.queue, 0, { type: "weapon-ready", towerId: unit.id });
  // The earlier buff remains active before the newly bound ability is used.
  unit.towerSpellReady.N062 = restored.queue.nowUs + 1;
  advanceTo(restored, restored.queue.nowUs);
  assert.equal(unit.attack.timing.rawRate, 1.2);
  assert.equal(cast(restored, "next-rank-frenzy", "N062").ok, true);
  assert.equal(unit.attack.timing.rawRate, 1.4);
  assert.equal(unit.frenzyAmount, .4);
  advanceTo(restored, firstExpiry);
  assert.equal(unit.frenzyAmount, .4);
  advanceTo(restored, unit.frenzyUntilUs);
  assert.equal(unit.frenzyAmount, undefined);
});

test("N088 has a closed aura radius, does not stack equal sources, and updates movement and running attack timing", async () => {
  const { state, tower, enemy } = await damagePipelineFixture();
  enemy.y += 200;
  const step = 31_250;
  const start = state.queue.nowUs;
  const source = { ...tower, templateId: "n152", id: 902, x: tower.x + 1000, population: 0 };
  state.structures.push(source, { ...source, id: 903 });
  state.inventory = [{ id: 904, itemId: "i108", charges: 0, slot: null, point: { x: 400, y: -128 } }];
  assert.equal(submit(state, "approach-in-aura", { type: "pick-up-item", itemId: 904 }), undefined);
  state.approach.path = [{ x: 0, y: -128 }];
  scheduleEvent(state.queue, 0, { type: "movement" });
  advanceTo(state, state.queue.nowUs);
  assert.equal(tower.attack.timing.rawRate, 1.05);
  assert.ok(Math.abs(Math.hypot(state.worker.x - map.worker.x, state.worker.y - map.worker.y) - 350 * 1.1 / 32) < .000001);
  const first = tower.attack.timing.windup.timerId;
  assert.equal(submit(state, "remove-one-aura", { type: "recycle-tower", towerId: source.id }).ok, true);
  assert.equal(tower.attack.timing.windup.timerId, first);
  assert.equal(submit(state, "remove-last-aura", { type: "recycle-tower", towerId: 903 }).ok, true);
  assert.equal(tower.attack.timing.rawRate, 1);
  assert.notEqual(tower.attack.timing.windup.timerId, first);
  scheduleEvent(state.queue, step, { type: "movement" });
  const worker = { ...state.worker };
  advanceTo(state, start + step + 3);
  assert.ok(Math.abs(Math.hypot(state.worker.x - worker.x, state.worker.y - worker.y) - 350 / 32) < .000001);
});

test("N517 chills the melee striker's active recovery and cooldown, then restores its rate after a saved tick", async () => {
  const { state, tower, enemy } = await damagePipelineFixture();
  tower.templateId = "n141";
  enemy.hp = enemy.maxHp = 10_000;
  enemy.armorBuff = { value: 40, untilUs: state.queue.nowUs + 10 * second };
  scheduleEvent(state.queue, 0, { type: "weapon-ready", towerId: tower.id });
  advanceTo(state, state.queue.nowUs);
  const initialCooldown = tower.attack.timing.cooldown.dueUs;
  advanceTo(state, tower.attack.timing.windup.dueUs);
  assert.equal(tower.attack.timing.rawRate, .75);
  assert.ok(tower.attack.timing.cooldown.dueUs > initialCooldown);
  assert.equal(tower.armorFrostUntilUs, tower.lastAttackUs + second);
  const restored = JSON.parse(JSON.stringify(state));
  restoreHeroState(restored);
  advanceTo(restored, tower.armorFrostUntilUs);
  assert.equal(restored.structures[0].armorFrostUntilUs, undefined);
  assert.equal(restored.structures[0].attack.timing.rawRate, 1);
});

test("A067 avalanche uses a distinct same-clock source and interrupts only eligible ground targets", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { state, tower, enemy } = await damagePipelineFixture();
  tower.templateId = "H021";
  tower.hero = newHero("H021");
  tower.hero.ranks.A067 = 1;
  enemy.hp = enemy.maxHp = 10_000;
  enemy.abilities = ["N535", "N517"];
  enemy.mana = 500;
  enemy.spellCastingUntilUs = state.queue.nowUs + second;
  const building = { ...enemy, id: 947, unitId: "hbar", y: enemy.y + 10, abilities: [] };
  const immune = { ...enemy, id: 948, y: enemy.y + 20, abilities: ["Amim"] };
  state.enemies.push(building, immune);
  scheduleEvent(state.queue, second, { type: "enemy-cast", enemyId: enemy.id, skill: "N517", point: { ...map.worker } });
  state.randomState = 2048;
  scheduleEvent(state.queue, 0, { type: "weapon-ready", towerId: tower.id });
  state.clock.targetUs = state.queue.nowUs;
  assert.equal(drain(state, 1), "pending");
  const event = state.queue.pending.find(event => event.payload.type === "avalanche");
  assert.equal(event.dueUs, state.queue.nowUs);
  assert.notEqual(event.payload.source.id, tower.id);
  const restored = JSON.parse(JSON.stringify(state));
  advanceTo(restored, restored.clock.targetUs);
  const [ground, structure, magicImmune] = restored.enemies;
  assert.equal(ground.stunUntilUs, state.queue.nowUs + 400_000);
  assert.equal(ground.spellShieldReadyUs, undefined);
  assert.equal(ground.spellCastingUntilUs, undefined);
  assert.equal(restored.queue.pending.some(event => event.payload.type === "enemy-cast"), false);
  assert.equal(structure.stunUntilUs, undefined);
  assert.ok(structure.hp < 10_000);
  assert.equal(magicImmune.stunUntilUs, undefined);
  assert.equal(magicImmune.hp, 10_000);
  assert.deepEqual(restored.recentHits.map(hit => hit.casterId), [event.payload.source.id, event.payload.source.id]);
});

test("N003 applies physical bash to magic-immune ground and adds damage without stunning structures", async () => {
  for (const structure of [false, true]) {
    const { state, tower, enemy, shot, impact } = await damagePipelineFixture();
    tower.templateId = "n144";
    Object.assign(enemy, { unitId: structure ? "hbar" : enemy.unitId, abilities: ["Amim", "Arsk"] });
    state.randomState = 2048;
    impact({ ...shot, sourceTemplate: tower.templateId });
    advanceTo(state, state.queue.nowUs + 1);
    assert.equal(enemy.hp, 640);
    assert.equal(enemy.stunUntilUs, structure ? undefined : state.queue.nowUs + 10_000);
  }
});

test("N006 stomp damages structures but filters immune units before applying stun", async () => {
  const { state, tower, enemy } = await damagePipelineFixture();
  tower.templateId = "n146";
  enemy.hp = enemy.maxHp = 5_000;
  enemy.abilities = ["Arsk", "N535"];
  const building = { ...enemy, id: 949, unitId: "hbar", x: enemy.x + 100, abilities: [] };
  const immune = { ...enemy, id: 950, x: enemy.x + 100, abilities: ["Amim"] };
  state.enemies = [building, immune, enemy];
  assert.ok(submit(state, "stomp", { type: "cast-tower", towerId: tower.id, skillId: "N006" }).ok);
  const effectUs = state.queue.pending.find(event => event.payload.type === "tower-spell").dueUs;
  advanceTo(state, effectUs);
  assert.deepEqual(state.recentHits.map(hit => hit.targetId), [enemy.id, building.id]);
  assert.equal(enemy.stunUntilUs, effectUs + 400_000);
  assert.equal(enemy.spellShieldReadyUs, undefined);
  assert.equal(building.stunUntilUs, undefined);
  assert.equal(immune.stunUntilUs, undefined);
  assert.equal(immune.hp, 5_000);
});

test("N007 selects visible side targets by creation ID and keeps one shared raw weapon amount", async () => {
  const { state, tower, enemy } = await damagePipelineFixture();
  enemy.x += 500;
  const hidden = { ...enemy, id: 930, windwalk: { invisibleUs: state.queue.nowUs, endUs: second, speed: 1.1 } };
  const targets = [934, 933, 932, 931].map(id => ({ ...enemy, id }));
  state.enemies = [enemy, hidden, ...targets];
  scheduleEvent(state.queue, 0, { type: "weapon-ready", towerId: tower.id });
  advanceTo(state, state.queue.nowUs);
  advanceTo(state, tower.attack.timing.windup.dueUs);
  const queue = state.queue.pending.filter(event => event.payload.type === "weapon-impact");
  const primary = queue.find(event => !event.payload.shot.secondary).payload.shot;
  const secondary = queue.filter(event => event.payload.shot.secondary).map(event => event.payload.shot);
  assert.equal(primary.targetId, enemy.id);
  assert.deepEqual(secondary.map(shot => shot.targetId), [931, 932]);
  assert.ok(secondary.every(shot => shot.raw === primary.raw && shot.weapon.homing && shot.weapon.speed === 1800));
  assert.equal(tower.multishotReadyUs, tower.lastAttackUs + 2 * second);
});

test("N020–N022 manual fire uses closed weapon range, fixed flight and splash without attacking nearby items", async () => {
  const { weapons } = await import("../src/game/m2/combat.ts");
  for (const templateId of ["n156", "n157", "n158"]) {
    const { state, tower, enemy } = await damagePipelineFixture();
    Object.assign(tower, { x: 0, y: 0, templateId });
    const [weapon] = weapons[templateId];
    const center = { x: weapon.max, y: 0 };
    const nearby = [{ ...enemy, id: 920, x: center.x, y: 150 },
      { ...enemy, id: 921, x: center.x, y: 300 },
      { ...enemy, id: 922, x: center.x, y: weapon.splash[2][0] },
      { ...enemy, id: 923, x: center.x, y: weapon.splash[2][0] + 1 }];
    for (const victim of nearby) Object.assign(victim, { hp: 10_000, maxHp: 10_000, armor: 0 });
    state.enemies = nearby;
    state.inventory = [{ id: 925, itemId: "i108", charges: 0, slot: null, point: center }];
    const order = (id, point) => submit(state, id, { type: "attack-ground", towerId: tower.id, point });
    assert.equal(order("too-close", { x: 249, y: 0 }).reason, "range");
    assert.equal(order("too-far", { x: weapon.max + 1, y: 0 }).reason, "range");
    assert.equal(order("world-boundary", { x: -1409, y: 0 }).reason, "range");
    const beforeOrder = state.randomState;
    assert.equal(order("fire-at-max", center).ok, true);
    assert.equal(state.randomState, beforeOrder);
    assert.equal(tower.attack.targetId, undefined);
    const firedUs = tower.attack.timing.windup.dueUs;
    advanceTo(state, firedUs);
    const projectile = state.queue.pending.find(event => event.payload.type === "weapon-impact");
    assert.deepEqual(projectile.payload.shot.destination, center);
    assert.equal(projectile.dueUs, firedUs + Math.round(weapon.max / 900 * second));
    assert.equal(projectile.payload.shot.targetId, undefined);
    advanceTo(state, projectile.dueUs - 1);
    assert.ok(state.enemies.every(victim => victim.hp === 10_000));
    advanceTo(state, projectile.dueUs);
    const full = 10_000 - nearby[0].hp;
    assert.ok(full > 0);
    assert.ok(Math.abs(10_000 - nearby[1].hp - full * .7) < .000001);
    assert.ok(Math.abs(10_000 - nearby[2].hp - full * .4) < .000001);
    assert.equal(nearby[3].hp, 10_000);
    assert.equal(state.inventory[0].id, 925);
    assert.deepEqual(state.battleAnimations.at(-1), { ...center, unitId: templateId, atUs: projectile.dueUs, kind: "artillery-impact" });
    assert.equal(order("exact-min", { x: 250, y: 0 }).ok, true);
  }
});

test("N020–N022 a targeted ground item and same-time pickup keep their queue order across restore", async () => {
  const { artilleryItems } = await import("../src/game/m2/match.ts");
  for (const pickupFirst of [true, false]) {
    const { state, tower, enemy } = await damagePipelineFixture();
    tower.templateId = "n156";
    tower.x -= 300;
    const point = { ...map.worker };
    Object.assign(enemy, point, { hp: 10_000, maxHp: 10_000, armor: 0 });
    state.inventory = [
      { id: 926, itemId: "i108", charges: 0, slot: null, point },
      { id: 927, itemId: "i101", charges: 0, slot: null, point },
      { id: 928, itemId: "i101", charges: 0, slot: null, point, invulnerable: true },
    ];
    assert.deepEqual(artilleryItems(state, tower.id).map(item => item.id), [926, 927]);
    const order = { type: "attack-ground-item", towerId: tower.id, objectId: 926 };
    assert.equal(submit(state, "immune-item", { ...order, objectId: 928 }).reason, "missing");
    assert.equal(submit(state, "object-shot", order).ok, true);
    const firedUs = tower.attack.timing.windup.dueUs;
    const contactUs = firedUs + Math.round(300 / 900 * second);
    const pickup = { type: "command", command: { id: "pickup-at-contact", matchId: state.matchId,
      action: { type: "pick-up-item", itemId: 926 } } };
    if (pickupFirst) scheduleEvent(state.queue, contactUs - state.queue.nowUs, pickup);
    advanceTo(state, firedUs);
    if (!pickupFirst) scheduleEvent(state.queue, contactUs - state.queue.nowUs, pickup);
    const restored = JSON.parse(JSON.stringify(state));
    restoreHeroState(restored);
    advanceTo(restored, contactUs);
    assert.equal(restored.commandResults["pickup-at-contact"].ok, pickupFirst);
    assert.ok(restored.enemies[0].hp < 10_000);
    assert.ok(restored.inventory.some(item => item.id === 927));
    assert.ok(restored.inventory.some(item => item.id === 928));
    const picked = restored.inventory.find(item => item.id === 926);
    if (pickupFirst) {
      assert.ok(picked.slot !== null);
      assert.equal(submit(restored, "drop-protected", { type: "drop-item", itemId: 926 }).ok, true);
      assert.equal(picked.slot, null);
      assert.equal(picked.invulnerable, true);
      assert.equal(submit(restored, "cannot-damage-reused-item", order).reason, "missing");
    } else {
      assert.equal(picked, undefined);
      assert.equal(restored.commandResults["pickup-at-contact"].reason, "missing");
    }
  }
});

test("N020 removes a destroyed ground card and finishes the worker's obsolete pickup order", async () => {
  const { state, tower } = await damagePipelineFixture();
  tower.templateId = "n156";
  const point = { x: tower.x + 500, y: tower.y };
  state.cards = [{ id: 931, card: "i606", slot: null, point, hp: 75, charges: 1 }];
  assert.equal(submit(state, "approach-card", { type: "pick-up-card", cardId: 931 }), undefined);
  assert.ok(state.approach);
  assert.ok(submit(state, "fire-at-card", { type: "attack-ground-item", towerId: tower.id, objectId: 931 }).ok);
  advanceTo(state, tower.attack.timing.windup.dueUs);
  const impact = state.queue.pending.find(event => event.payload.type === "weapon-impact");
  advanceTo(state, impact.dueUs);
  assert.deepEqual(state.cards, []);
  assert.equal(state.approach, null);
  assert.equal(state.commandResults["approach-card"].reason, "missing");
});

test("B03 entry zero skips reactions while N533 zero still consumes an existing N526 shield", async () => {
  const { state, enemy, shot, impact } = await damagePipelineFixture();
  enemy.abilities = ["N526", "N533"];
  enemy.barrier = { hits: 5, untilUs: second };
  state.randomState = 1; // N533 uses the fifth draw (6), after four global weapon proc draws.
  impact({ ...shot, raw: 0 });
  impact(shot);
  const restored = structuredClone(state);
  advanceTo(restored, state.queue.nowUs + 1, 1);
  assert.equal(restored.enemies[0].barrier.hits, 4);
  assert.equal(restored.enemies[0].hp, 1000);
  assert.equal(restored.randomState, 217083232);
});

test("ordinary weapons reject protected targets before acquisition and before hit rolls", async () => {
  for (const [ability, attackType] of [["Avul", "chaos"], ["Aloc", "chaos"], ["Aeth", "chaos"], ["ACmi", "magic"]]) {
    const { state, tower, enemy, shot, impact } = await damagePipelineFixture();
    enemy.abilities = [ability, "N524"];
    impact({ ...shot, weapon: { ...shot.weapon, attackType } });
    const rng = state.randomState;
    advanceTo(state, state.queue.nowUs + 1);
    assert.equal(state.randomState, rng, ability);
    assert.equal(enemy.hp, 1000, ability);
    if (attackType !== "chaos") continue;
    const valid = { ...enemy, id: 901, abilities: [] };
    state.enemies.push(valid);
    scheduleEvent(state.queue, 1, { type: "weapon-ready", towerId: tower.id });
    advanceTo(state, state.queue.nowUs + 1);
    assert.equal(tower.attack.targetId, valid.id, ability);
  }
});

test("i204 assigns one actual q007 source to the volley and retains its owning tower", async () => {
  const { state, tower, enemy } = await damagePipelineFixture();
  const secondTarget = { ...enemy, id: 901, x: enemy.x + 40 };
  state.enemies.push(secondTarget);
  state.inventory = [{ id: 902, itemId: "i204", towerId: tower.id, slot: 0, point: tower, charges: 0 }];
  state.randomState = 1;
  scheduleEvent(state.queue, 1, { type: "weapon-ready", towerId: tower.id });
  advanceTo(state, state.queue.nowUs + 1);
  const volley = state.recentHits.filter(hit => hit.sourceTemplate === "q007");
  assert.deepEqual(volley.map(hit => hit.targetId), [enemy.id, secondTarget.id]);
  assert.ok(volley.every(hit => hit.ownerId === tower.id));
  assert.notEqual(volley[0].casterId, tower.id);
  assert.equal(volley[0].casterId, volley[1].casterId);
});

test("q007 queues one capped volley, keeps captured attack, and rechecks its primary after a saved handoff", async () => {
  const { state, tower, enemy } = await damagePipelineFixture();
  tower.permanentAttack = 100;
  const others = Array.from({ length: 11 }, (_, index) => ({
    ...enemy, id: 920 + index, x: tower.x + 900, hp: 10_000, maxHp: 10_000,
  })).reverse();
  state.enemies.push(...others);
  state.inventory = [{ id: 902, itemId: "i204", towerId: tower.id, slot: 0, point: { ...map.worker }, charges: 0 }];
  state.randomState = 1;
  scheduleEvent(state.queue, 1, { type: "weapon-ready", towerId: tower.id });
  state.clock.targetUs = state.queue.nowUs + 1;
  assert.equal(drain(state, 1), "pending");
  const queued = state.queue.pending.find(event => event.payload.type === "equipment-volley");
  assert.equal(queued.dueUs, state.queue.nowUs);
  assert.ok(queued.payload.base >= 120);
  assert.equal(state.recentHits?.length ?? 0, 0);
  const restored = JSON.parse(JSON.stringify(state));
  restoreHeroState(restored);
  const invalid = structuredClone(restored);
  invalid.enemies[0].abilities = ["Avul"];
  advanceTo(invalid, invalid.clock.targetUs);
  assert.equal(invalid.recentHits?.some(hit => hit.sourceTemplate === "q007") ?? false, false);
  restored.structures = [];
  advanceTo(restored, restored.clock.targetUs);
  const volley = restored.recentHits.filter(hit => hit.sourceTemplate === "q007");
  assert.deepEqual(volley.map(hit => hit.targetId), [enemy.id, ...Array.from({ length: 9 }, (_, index) => 920 + index)]);
  assert.ok(volley.every(hit => hit.ownerId === undefined && hit.casterId === queued.payload.source.id));
  assert.ok(volley.every(hit => Math.abs(hit.amount - (queued.payload.base + 1) * 1.4) < .000001));
});

test("N068 reads unclamped attack speed and zeros the parent after its separate range damage", async () => {
  const { weapons } = await import("../src/game/m2/combat.ts");
  const weapon = weapons.n186[0];
  for (const slow of [0, 1, 1.2]) {
    const { state, tower, enemy, shot, impact } = await damagePipelineFixture();
    tower.templateId = "n186";
    if (slow) tower.thunderClap = { amount: slow, untilUs: second };
    enemy.hp = enemy.maxHp = 10_000;
    const outsideOrdinary = { ...enemy, id: 934, x: tower.x + 1_050 };
    state.enemies.push(outsideOrdinary);
    impact({ ...shot, weapon, sourceTemplate: tower.templateId });
    advanceTo(state, state.queue.nowUs + 1);
    const expected = (weapon.base + weapon.dice * (weapon.sides + 1) / 2) * .8;
    assert.ok(Math.abs(10_000 - enemy.hp - (slow > 1 ? 0 : expected)) < .000001);
    assert.ok(Math.abs(10_000 - outsideOrdinary.hp - (slow === 1 ? expected : 0)) < .000001);
  }
});

test("the two infernal checks and Q36/Q37 each roll on attack damage without a matching ability", async () => {
  const { state, enemy, shot, impact } = await damagePipelineFixture();
  state.randomState = 1972;
  const next = prior => (Math.imul(prior, 1664525) + 1013904223) >>> 0;
  impact(shot);
  advanceTo(state, state.queue.nowUs + 1);
  assert.equal(enemy.hp, 900);
  assert.equal(state.randomState, next(next(next(next(1972)))));
});

test("N017 T038 hits at sweep contact, preserves its q001 after retirement, and survives reload past the caster lifetime", async () => {
  const { state, tower, enemy } = await damagePipelineFixture();
  tower.templateId = "n153";
  tower.population = 0;
  enemy.x += 250;
  enemy.hp = enemy.maxHp = 10_000;
  const last = { ...enemy, id: 941, x: tower.x + 1000 };
  const outside = { ...last, id: 942, x: last.x + 1 };
  const immune = { ...last, id: 943, x: tower.x + 600, abilities: ["Amim"] };
  state.enemies.push(last, outside, immune);
  scheduleEvent(state.queue, 0, { type: "weapon-ready", towerId: tower.id });
  advanceTo(state, state.queue.nowUs);
  const commit = tower.attack.timing.windup.dueUs;
  advanceTo(state, commit);
  assert.equal(state.recentHits.length, 1);
  const ordinaryHp = enemy.hp;
  const first = state.queue.pending.find(event => event.payload.type === "spell-sweep");
  assert.equal(first.dueUs, commit + 125_000);
  advanceTo(state, first.dueUs - 1);
  assert.equal(enemy.hp, ordinaryHp);
  advanceTo(state, first.dueUs);
  assert.ok(Math.abs(enemy.hp - (ordinaryHp - 240)) < .000001);
  assert.ok(submit(state, "retire-original-source", { type: "recycle-tower", towerId: tower.id }).ok);
  const restored = JSON.parse(JSON.stringify(state));
  restoreHeroState(restored);
  advanceTo(restored, commit + 750_000);
  assert.equal(restored.enemies.find(unit => unit.id === last.id).hp, 9760);
  assert.equal(restored.enemies.find(unit => unit.id === outside.id).hp, 10_000);
  assert.equal(restored.enemies.find(unit => unit.id === immune.id).hp, 10_000);
  const hits = restored.recentHits.filter(hit => hit.sourceTemplate === "q001");
  assert.deepEqual(hits.map(hit => [hit.targetId, hit.ownerId]), [[enemy.id, tower.id], [last.id, undefined]]);
  assert.ok(hits.every(hit => hit.casterId === first.payload.sweep.sourceId));
});

test("N054 commits its closed-area child packets in creation order before the original hit", async () => {
  const { state, tower, enemy, shot, impact } = await damagePipelineFixture();
  tower.templateId = "n179";
  enemy.hp = enemy.maxHp = 10_000;
  const outer = { ...enemy, id: 935, x: enemy.x + 501 };
  const edge = { ...enemy, id: 936, x: enemy.x + 500, abilities: ["T060"] };
  state.enemies = [edge, outer, enemy];
  state.randomState = 1972;
  impact({ ...shot, sourceTemplate: tower.templateId });
  advanceTo(state, state.queue.nowUs + 1);
  assert.deepEqual(state.recentHits.map(hit => [hit.targetId, hit.amount]), [[enemy.id, 960], [edge.id, 960], [enemy.id, 100]]);
  assert.equal(outer.hp, 10_000);
});

test("Q45 applies a cold-arrow slot without overwriting equipped frost and leaves immune targets slowed by neither arrow", async () => {
  for (const immune of [false, true]) {
    const { state, tower, enemy, shot, impact } = await damagePipelineFixture();
    tower.templateId = "n006";
    if (immune) enemy.abilities = ["Amim"];
    enemy.frost = { factor: .6, expiresUs: state.queue.nowUs + second };
    scheduleEvent(state.queue, second, { type: "frost-expire", enemyId: enemy.id });
    impact({ ...shot, sourceTemplate: tower.templateId, frost: .06 });
    advanceTo(state, state.queue.nowUs + 1);
    assert.equal(enemy.hp, 900);
    assert.equal(enemy.frost.factor, .6);
    assert.equal(enemy.coldArrow?.factor, immune ? undefined : .94);
    const restored = JSON.parse(JSON.stringify(state));
    const [target] = restored.enemies;
    advanceTo(restored, enemy.frost.expiresUs);
    assert.equal(target.frost, undefined);
    assert.equal(target.coldArrow?.factor, immune ? undefined : .94);
    advanceTo(restored, state.queue.nowUs + 3 * second);
    assert.equal(target.coldArrow, undefined);
  }
});

test("N058 submits a separate T039 chain in range order with one actual source and only a primary shield check", async () => {
  for (const shielded of [false, true]) {
    const { state, tower, enemy, shot, impact } = await damagePipelineFixture();
    tower.templateId = "n183";
    enemy.hp = enemy.maxHp = 10_000;
    if (shielded) enemy.abilities = ["N535"];
    const highId = { ...enemy, id: 939, x: tower.x, y: tower.y + 400, abilities: ["N535"] };
    const lowId = { ...enemy, id: 938, x: tower.x + 600, abilities: ["N535"] };
    const immune = { ...enemy, id: 937, x: tower.x + 100, abilities: ["T060"] };
    state.enemies.push(highId, lowId, immune);
    state.randomState = 1149; // The fourth draw is exactly N058's 20% threshold.
    impact({ ...shot, sourceTemplate: tower.templateId });
    advanceTo(state, state.queue.nowUs + 1);
    const chain = state.recentHits.filter(hit => hit.sourceTemplate === "q001");
    assert.deepEqual(chain.map(hit => hit.targetId), shielded ? [] : [enemy.id, lowId.id]);
    assert.ok(chain.every(hit => hit.casterId !== tower.id && hit.casterId === chain[0].casterId && hit.ownerId === tower.id));
    assert.equal(lowId.spellShieldReadyUs, undefined);
    assert.equal(immune.hp, 10_000);
    assert.equal(enemy.hp, shielded ? 9900 : 9580);
    assert.equal(state.recentHits.at(-1).sourceTemplate, tower.templateId);
    if (shielded) assert.ok(enemy.spellShieldReadyUs > state.queue.nowUs);
  }
});

test("Alit presents the ordinary lizard attack after its visual delay independently of T039", async () => {
  const { state, tower, enemy } = await damagePipelineFixture();
  tower.templateId = "n183";
  enemy.x += 500;
  tower.towerSpellReady = { N061: 10 * second };
  scheduleEvent(state.queue, 0, { type: "weapon-ready", towerId: tower.id });
  advanceTo(state, state.queue.nowUs);
  advanceTo(state, tower.attack.timing.windup.dueUs);
  const [link] = state.battleAnimations;
  assert.equal(link.kind, "weapon-link");
  assert.equal(link.atUs, tower.lastAttackUs + 250_000);
  assert.deepEqual(link.target, { x: enemy.x, y: enemy.y });
  assert.equal(state.recentHits?.length ?? 0, 0);
  assert.equal(state.queue.pending.filter(event => event.payload.type === "weapon-impact").length, 1);
  assert.ok(JSON.parse(JSON.stringify(state)).battleAnimations.some(effect => effect.kind === "weapon-link"));
});

test("i322 reads the owner's current raw attack speed when the sweep hits", async () => {
  const { state, tower, enemy, shot } = await damagePipelineFixture();
  enemy.hp = enemy.maxHp = 100_000;
  scheduleEvent(state.queue, 1, { type: "spell-sweep", sweep: { name: "i322", towerId: tower.id, sourceId: 901,
    ...tower, dx: 1, dy: 0, speed: 2500, range: 900, radiusStart: 300, radiusEnd: 300,
    amount: 10, traveled: 0, hit: [] } });
  const restored = structuredClone(state);
  restored.structures[0].thunderClap = { amount: 1.2, untilUs: second };
  restored.structures[0].untouchable = { attackSlow: .2, movement: .9, untilUs: second };
  advanceTo(restored, restored.queue.nowUs + 1);
  const [hit] = restored.recentHits;
  assert.equal(hit.sourceTemplate, "q019");
  assert.equal(hit.amount, Math.floor(6300 / shot.weapon.cooldown + (1 - 1.2 - .2) * 1000));
  assert.equal(hit.ownerId, tower.id);
});

test("a serpent ward arrow survives natural expiry and resolves with no attribution after its owner leaves", async () => {
  const { state, enemy, shot, impact } = await damagePipelineFixture();
  const ward = { ...map.worker, id: 901, templateId: "b122", pending: null, population: 0, radius: 0,
    qualification: null, summon: { ownerId: shot.towerId, attack: 0, speed: 0, green: 0, blue: 0, skillId: "A094" } };
  state.summons = [ward];
  state.structures = [];
  scheduleEvent(state.queue, 1, { type: "summon-expire", unitId: ward.id });
  impact({ ...shot, sourceTemplate: ward.templateId,
    summon: { id: ward.id, point: { x: ward.x, y: ward.y }, green: 0, blue: 0, attack: 0, banner: false, skillId: "A094" } });
  const restored = structuredClone(state);
  advanceTo(restored, state.queue.nowUs + 1, 1);
  assert.equal(restored.summons.length, 0);
  assert.ok(restored.enemies[0].hp < enemy.hp);
  assert.equal(restored.recentHits.at(-1).casterId, ward.id);
});

test("N525 checks the owner position only for actual temporary sources and skips the absent owner", async () => {
  for (const withOwner of [true, false]) {
    const { state, tower, enemy } = await damagePipelineFixture();
    enemy.abilities = ["N525"];
    enemy.path = [{ x: enemy.x + 500, y: enemy.y }];
    tower.x -= 200;
    if (!withOwner) state.structures = [];
    scheduleEvent(state.queue, 1, { type: "spell-sweep", sweep: {
      x: enemy.x + 100, y: enemy.y, dx: -1, dy: 0, name: "T038-fixture", towerId: tower.id, sourceId: 1990,
      speed: 1200, range: 100, radiusStart: 150, radiusEnd: 150, amount: 100, traveled: 0, hit: [],
    } });
    advanceTo(state, state.queue.nowUs + 1);
    assert.equal(state.recentHits[0].casterId, 1990);
    assert.equal(state.recentHits[0].amount, withOwner ? 32 : 80);
  }
});

test("a naturally expired ward preserves green and blue contracts on an already committed arrow after reload", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { state, tower, enemy, shot, impact } = await damagePipelineFixture();
  tower.templateId = "H029";
  tower.hero = newHero("H029");
  const ward = { ...map.worker, id: 901, templateId: "b122", pending: null, population: 0, radius: 0,
    qualification: null, summon: { ownerId: tower.id, attack: 40, speed: 0, green: .6, blue: 6, skillId: "A094" } };
  state.summons = [ward];
  state.randomState = 2048;
  scheduleEvent(state.queue, 1, { type: "summon-expire", unitId: ward.id });
  impact({ ...shot, sourceTemplate: ward.templateId, summon: { id: ward.id, point: { ...map.worker }, banner: false, skillId: "A094" } }, 2);
  advanceTo(state, state.queue.nowUs + 1);
  assert.equal(state.summons.length, 0);
  const restored = JSON.parse(JSON.stringify(state));
  restored.structures[0].hero.natural.AGI = 100;
  advanceTo(restored, restored.queue.nowUs + 1);
  const hits = restored.recentHits;
  assert.equal(hits.length, 3);
  assert.ok(Math.abs(hits[0].amount - 60 * (1 + 100 * .0005)) < .000001);
  assert.ok(hits[1].amount > 120);
  assert.ok(hits.every(hit => hit.casterId === ward.id && hit.ownerId === tower.id && hit.targetId === enemy.id));
});

test("B03 i263 executes its divine child before committing the unchanged parent amount", async () => {
  const { state, tower, enemy, shot, impact } = await damagePipelineFixture();
  state.inventory = [{ id: 902, itemId: "i263", towerId: tower.id, slot: 0, point: tower, charges: 0 }];
  state.randomState = 870; // The fifth draw is 21, just above the 20% divine critical threshold.
  impact(shot);
  advanceTo(state, state.queue.nowUs + 1);
  assert.equal(state.recentHits.length, 2);
  const [child, parent] = state.recentHits;
  assert.equal(child.casterId, tower.id);
  assert.equal(parent.casterId, tower.id);
  assert.equal(child.atUs, parent.atUs);
  assert.ok(Math.abs(child.amount - 20.886) < 1e-8);
  assert.ok(Math.abs(parent.amount - 118) < 1e-8);
  assert.ok(Math.abs(enemy.hp - 861.114) < 1e-8);
});

test("q025 respects the first N521 protection and bypasses an existing grave and T202", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  for (const initialProtection of [true, false]) {
    const { state, tower, enemy } = await damagePipelineFixture();
    tower.templateId = "H012";
    tower.hero = newHero("H012");
    tower.hero.ranks.A042 = 1;
    enemy.abilities = initialProtection ? ["N521"] : [];
    if (!initialProtection) enemy.graveUntilUs = state.queue.nowUs + 6 * second;
    enemy.overdraftArmor = 100;
    enemy.hp = enemy.maxHp = 1_000_000;
    assert.equal(submit(state, "deathpact", { type: "cast-hero", towerId: tower.id, skillId: "A042" }).ok, true);
    advanceTo(state, state.queue.nowUs + second);
    if (initialProtection) {
      assert.equal(state.enemies.length, 1);
      assert.equal(enemy.hp, 1_000_000);
      assert.deepEqual(enemy.abilities, []);
      assert.ok(enemy.graveUntilUs > state.queue.nowUs);
      assert.equal(state.kills ?? 0, 0);
    } else {
      assert.equal(state.enemies.length, 0);
      assert.equal(state.kills, 1);
    }
  }
});

test("N582–N584 reanimate in place on strict overkill without registering a death", async () => {
  for (const [skillId, slow] of [["N582", .4], ["N583", .4], ["N584", 1.2]]) {
    const { state, tower, enemy, shot, impact } = await damagePipelineFixture();
    enemy.hp = 50;
    enemy.abilities = [skillId];
    impact(shot);
    const restored = structuredClone(state);
    advanceTo(restored, state.queue.nowUs + 1);
    assert.equal(restored.enemies[0].id, enemy.id);
    assert.equal(restored.enemies[0].hp, 1000);
    assert.deepEqual(restored.enemies[0].abilities, []);
    assert.equal(restored.kills ?? 0, 0);
    assert.deepEqual(restored.structures[0].thunderClap, { amount: slow, untilUs: restored.queue.nowUs + 4 * second });
    state.queue.pending = [];
    impact({ ...shot, raw: 50 });
    advanceTo(state, state.queue.nowUs + 1);
    assert.equal(state.enemies.length, 0);
    assert.equal(state.kills, 1);
    assert.equal(tower.thunderClap, undefined);
  }
});

test("N536 dispels frost above ten percent, while an independent BPSE survives the purge", async () => {
  const { state, enemy, shot, impact } = await damagePipelineFixture();
  enemy.abilities = ["N536"];
  enemy.stunUntilUs = 8 * second;
  enemy.frost = { factor: .8, expiresUs: 8 * second };
  impact(shot);
  advanceTo(state, state.queue.nowUs + 1);
  assert.equal(enemy.shellDamage, 100);
  assert.ok(enemy.stunUntilUs);
  const restored = structuredClone(state);
  scheduleEvent(restored.queue, 1, { type: "weapon-impact", shot: { ...shot, raw: 1 }, travelUs: 0 });
  advanceTo(restored, restored.queue.nowUs + 1);
  assert.equal(restored.enemies[0].shellDamage, 0);
  assert.equal(restored.enemies[0].stunUntilUs, 8 * second);
  assert.equal(restored.enemies[0].frost, undefined);
  assert.equal(restored.enemies[0].hp, 899);
});

test("dispelling or killing one A093 target ends its channel without releasing a different target", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { state, tower, enemy, shot } = await damagePipelineFixture();
  const other = { ...enemy, id: 902, x: enemy.x + 50 };
  const archer = { ...tower, id: 901 };
  state.structures.push(archer);
  state.enemies.push(other);
  tower.templateId = "H029";
  tower.hero = newHero("H029");
  tower.hero.ranks.A093 = 1;
  enemy.abilities = ["N536", "N513"];
  assert.ok(submit(state, "channel-leash", { type: "cast-hero", towerId: tower.id, skillId: "A093", targetId: enemy.id }).ok);
  advanceTo(state, state.queue.nowUs + 300_000);
  assert.ok(tower.leashToken);
  assert.ok(other.leashes?.length);

  for (const lethal of [false, true]) {
    const restored = structuredClone(state);
    if (lethal) restored.enemies[0].abilities = [];
    scheduleEvent(restored.queue, 1, { type: "weapon-impact", travelUs: 0,
      shot: { ...shot, towerId: archer.id, raw: lethal ? 1_000 : 101 } });
    advanceTo(restored, restored.queue.nowUs + 1);
    assert.equal(restored.structures[0].leashToken, undefined);
    assert.equal(restored.structures[0].heroCastUntilUs, restored.queue.nowUs);
    const formerTarget = restored.enemies.find(unit => unit.id === enemy.id);
    assert.equal(!!formerTarget, !lethal);
    assert.equal(formerTarget?.leashes, undefined);
    assert.equal(formerTarget?.spellReady?.N513, undefined);
    assert.ok(restored.enemies.find(unit => unit.id === other.id).leashes?.length);
    advanceTo(restored, restored.queue.nowUs + 3 * second);
    assert.equal(restored.recentHits.filter(hit => hit.sourceTemplate === "q001" && hit.targetId === other.id).length, 3);
  }
});

test("N709 reads the previous resistance for a magic packet and updates at the current life threshold", async () => {
  const { state, tower, enemy } = await damagePipelineFixture();
  tower.templateId = "n021";
  enemy.abilities = ["N709", "T013"];
  enemy.hp = 120;
  scheduleEvent(state.queue, 1, { type: "immolation", towerId: tower.id });
  advanceTo(state, state.queue.nowUs + 1);
  assert.equal(enemy.berserkerResistanceRank, 9);
  assert.ok(Math.abs(enemy.hp - (120 - 60 * .8 * .85 * .9)) < 1e-8);
  const restored = structuredClone(state);
  advanceTo(restored, state.queue.nowUs + second);
  assert.equal(restored.enemies[0].berserkerResistanceRank, 10);
  assert.ok(Math.abs(restored.enemies[0].hp - (enemy.hp - 60 * .8 * .85 * .1)) < 1e-8);
});

test("Demonflame toggles in its original slot and restores the next self-damage tick", async () => {
  const { state, tower, enemy } = await damagePipelineFixture();
  state.inventory = [{ id: 902, itemId: "i332", towerId: tower.id, slot: 3, point: map.worker, charges: 0 }];
  enemy.hp = enemy.maxHp = 1_000_000;
  assert.equal(submit(state, "light", { type: "cast-equipment", towerId: tower.id, itemId: 902 }).ok, true);
  const lit = state.inventory[0];
  assert.deepEqual([lit.itemId, lit.slot, lit.charges], ["i330", 3, 0]);
  assert.notEqual(lit.id, 902);
  const originalMaximum = tower.life.maximum;
  const purchase = submit(state, "buy-vitality-booster", { type: "buy-item", itemId: "i148" });
  assert.ok(purchase.ok);
  assert.ok(submit(state, "equip-vitality-booster", { type: "transfer-item", itemId: purchase.createdId, towerId: tower.id }).ok);
  assert.equal(tower.life.maximum, originalMaximum + 500);
  assert.equal(tower.life.hp, originalMaximum + 500);
  assert.ok(submit(state, "remove-vitality-booster", { type: "transfer-item", itemId: purchase.createdId }).ok);
  assert.equal(tower.life.maximum, originalMaximum);
  assert.equal(tower.life.hp, originalMaximum);
  assert.equal(submit(state, "drop", { type: "drop-item", itemId: lit.id }).ok, false);
  const first = state.queue.pending.find(entry => entry.payload.type === "demonflame").dueUs;
  const restored = structuredClone(state);
  advanceTo(restored, first);
  const current = restored.structures[0];
  assert.equal(restored.enemies[0].hp, enemy.hp);
  assert.ok(Math.abs(current.life.hp / current.life.maximum - .92) < 1e-8);
  advanceTo(restored, first + second);
  assert.ok(restored.enemies[0].hp < enemy.hp);
  current.life.hp = current.life.maximum * .19;
  advanceTo(restored, first + 2 * second);
  const closed = restored.inventory.find(item => item.towerId === tower.id);
  assert.equal(closed.itemId, "i332");
  assert.equal(closed.slot, 3);
  assert.equal(restored.queue.pending.some(entry => entry.payload.type === "demonflame"), false);
  closed.charges = 1;
  current.life.hp = current.life.maximum * .7;
  const relight = { type: "cast-equipment", towerId: tower.id, itemId: closed.id };
  assert.equal(submit(restored, "low-life-relight", relight).reason, "resources");
  assert.equal(closed.charges, 0);
  assert.equal(current.demonflameReadyUs, restored.queue.nowUs + second);
  assert.equal(submit(restored, "cooldown-after-low-life", relight).reason, "cooldown");
});

test("A069 applies the template multiplier at the time of each real learning event", async () => {
  const { newHero, heroModelScale, learnHeroSkill } = await import("../src/game/m2/hero.ts");
  const hero = newHero("H021");
  Object.assign(hero, { level: 25, points: 6 });
  for (let i = 0; i < 6; i++) assert.equal(learnHeroSkill(hero, "G059", "A069"), true);
  assert.equal(hero.growthBonus.attack, 540);
  assert.equal(heroModelScale(hero, "G059"), 2.72);
  assert.equal(heroModelScale(structuredClone(hero), "H021"), 2.72);
});

test("i310 grants A154 only at pickup, gives its initial cooldown and revokes it on transfer", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { state, tower } = await damagePipelineFixture();
  tower.templateId = "H038";
  tower.hero = newHero("H038");
  tower.qualification = "P006";
  tower.hero.natural.INT = 60;
  const ally = { ...map.worker, x: map.worker.x + 32, id: 901, templateId: "n167", radius: 32,
    pending: null, qualification: null };
  state.structures.push(ally);
  state.inventory = [{ id: 902, itemId: "i310", slot: 0, point: map.worker, charges: 0 }];
  const pickup = { type: "transfer-item", itemId: 902, towerId: tower.id };
  const cast = { type: "cast-scepter-swap", towerId: tower.id, targetId: ally.id };
  assert.equal(submit(state, "before-study", pickup).ok, true);
  assert.equal(tower.scepterSwap, undefined);
  tower.hero.ranks.A153 = 1;
  assert.equal(submit(state, "still-no-ability", cast).reason, "missing");
  assert.ok(submit(state, "return-to-worker", { type: "transfer-item", itemId: 902 }).ok);
  assert.ok(submit(state, "after-study", pickup).ok);
  assert.equal(submit(state, "initial-cooldown", cast).reason, "cooldown");
  advanceTo(state, tower.scepterSwap.readyUs);
  for (const targetId of [-1, circleId]) {
    const restricted = structuredClone(state);
    const caster = restricted.structures[0];
    assert.ok(submit(restricted, "target-restricted-ally", { ...cast, targetId }).ok);
    const effectAt = restricted.queue.pending[0].dueUs;
    advanceTo(restricted, effectAt);
    assert.ok(Math.abs(caster.mana - (caster.manaMaximum - 150)) < 1e-8);
    assert.equal(caster.scepterSwap.readyUs, effectAt + 10 * second);
    assert.equal(restricted.queue.pending.some(event => event.payload.type === "scepter-swap"), false);
    assert.deepEqual([caster.x, caster.y], [tower.x, tower.y]);
  }
  assert.ok(submit(state, "start-swap", cast).ok);
  const effectAt = state.queue.pending[0].dueUs;
  advanceTo(state, effectAt);
  assert.ok(Math.abs(tower.mana - (tower.manaMaximum - 150)) < 1e-8);
  assert.ok(submit(state, "leave-after-effect", { type: "transfer-item", itemId: 902 }).ok);
  assert.equal(tower.scepterSwap, undefined);
  const previousX = tower.x;
  const restored = structuredClone(state);
  advanceTo(restored, effectAt + 100_000);
  assert.equal(restored.structures[0].x, ally.x);
  assert.equal(restored.structures[1].x, previousX);
});

test("i312–i314 grant their own experience values and keep independent 180 second cooldowns", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  for (const [id, xp] of [["i312", 2000], ["i313", 20000], ["i314", 20]]) {
    const { state, tower } = await damagePipelineFixture();
    tower.templateId = "H038";
    tower.hero = newHero("H038");
    state.inventory = [{ id: 902, itemId: id, slot: 0, point: map.worker, charges: 0 }];
    const use = { type: "use-book", itemId: 902, towerId: tower.id };
    assert.equal(submit(state, "invalid-target", { ...use, towerId: 9999 }).reason, "missing");
    assert.equal(submit(state, "used", use).ok, true);
    assert.equal(tower.hero.xp, xp);
    const restored = structuredClone(state);
    assert.equal(submit(restored, "still-cooling", use).reason, "cooldown");
    assert.equal(restored.inventory[0].id, 902);
    advanceTo(restored, restored.queue.nowUs + 180 * second);
    assert.equal(submit(restored, "reused", use).ok, true);
    assert.ok(restored.structures[0].hero.xp > xp);
  }
});

test("N518 hides after its fade and i206 reveals it only while an equipped source is in range", async () => {
  const { state, tower, enemy, shot, impact } = await damagePipelineFixture();
  Object.assign(enemy, { abilities: ["N518"], mana: 200, manaMax: 200, speed: 300, x: tower.x + 700 });
  impact(shot);
  advanceTo(state, state.queue.nowUs + 1);
  const fade = enemy.windwalk.invisibleUs;
  assert.equal(enemy.mana, 0);
  assert.equal(enemy.windwalkSpeed, 1.1);
  advanceTo(state, fade);
  scheduleEvent(state.queue, 1, { type: "weapon-ready", towerId: tower.id });
  advanceTo(state, state.queue.nowUs + 1);
  assert.equal(tower.attack, undefined);
  state.inventory = [{ id: 902, itemId: "i206", towerId: tower.id, slot: 0, point: map.worker, charges: 0 }];
  const restored = structuredClone(state);
  scheduleEvent(restored.queue, 1, { type: "weapon-ready", towerId: tower.id });
  advanceTo(restored, restored.queue.nowUs + 1);
  assert.equal(restored.structures[0].attack.targetId, enemy.id);
  assert.equal(restored.enemies[0].windwalk.invisibleUs, fade);

  assert.ok(submit(state, "worker-detection", { type: "transfer-item", itemId: 902 }).ok);
  enemy.x = state.worker.x + 1100;
  enemy.y = state.worker.y;
  assert.equal(canSeeEnemy(state, enemy), true);
  enemy.x++;
  assert.equal(!!canSeeEnemy(state, enemy), false);
  assert.ok(submit(state, "circle-detection", { type: "transfer-item", itemId: 902, towerId: circleId }).ok);
  enemy.x = map.energyCircle.x + 1100;
  enemy.y = map.energyCircle.y;
  assert.equal(canSeeEnemy(state, enemy), true);
  assert.ok(submit(state, "drop-detector", { type: "drop-item", itemId: 902 }).ok);
  assert.equal(!!canSeeEnemy(state, enemy), false);
  Object.assign(enemy, { x: tower.x + 700, y: tower.y });
  scheduleEvent(state.queue, 1, { type: "weapon-ready", towerId: tower.id });
  advanceTo(state, state.queue.nowUs + 1);
  assert.equal(tower.attack, undefined);
});

test("N519 chooses the first nearby tower, survives a cast snapshot, and reduces its next weapon shot", async () => {
  const { state, tower, enemy, shot, impact } = await damagePipelineFixture();
  Object.assign(tower, { x: 900, y: 0 });
  const other = { ...tower, id: 901, x: 1000 };
  state.structures.push(other);
  Object.assign(enemy, { unitId: "m032", x: 1050, y: 0, hp: 10_000, maxHp: 10_000,
    abilities: ["N519"], mana: 200, manaMax: 200 });
  impact({ ...shot, point: enemy, destination: enemy });
  advanceTo(state, state.queue.nowUs + 1);

  const restored = structuredClone(state);
  advanceTo(restored, restored.queue.nowUs + 300_000);
  const [weakened, untouched] = restored.structures;
  assert.equal(weakened.weakAttackUntilUs, restored.queue.nowUs + 8 * second);
  assert.equal(untouched.weakAttackUntilUs, undefined);
  assert.equal(restored.enemies[0].mana, 0);
  assert.equal(restored.enemies[0].spellReady.N519, restored.queue.nowUs + 10 * second);

  const comparison = structuredClone(restored);
  delete comparison.structures[0].weakAttackUntilUs;
  for (const match of [restored, comparison]) {
    scheduleEvent(match.queue, 1, { type: "weapon-ready", towerId: tower.id });
    advanceTo(match, match.queue.nowUs + second);
  }
  assert.ok(restored.recentHits.length > 1);
  assert.ok(Math.abs(restored.recentHits.at(-1).amount - comparison.recentHits.at(-1).amount * .5) < 1e-9);
});

test("N511 taunts only towers that can accept an ordinary attack order", async () => {
  const { state, tower, enemy } = await damagePipelineFixture();
  Object.assign(enemy, { unitId: "m010", abilities: ["N511"], mana: 100, manaMax: 100 });
  const casting = { ...tower, id: 903, heroCastUntilUs: state.queue.nowUs + second };
  const stunned = { ...tower, id: 904, stunnedUntilUs: state.queue.nowUs + second };
  state.structures.push(casting, stunned);
  state.summons = [{ ...tower, id: 905, templateId: "b103", summon: { independent: true },
    wolfOrder: { type: "move", point: { x: 0, y: 0 }, path: [] } }];
  scheduleEvent(state.queue, 1, { type: "enemy-cast", enemyId: enemy.id, skill: "N511", point: enemy });
  const restored = structuredClone(state);
  advanceTo(restored, restored.queue.nowUs + 1);
  const [available, busy, disabled] = restored.structures;
  assert.equal(available.tauntedTarget, enemy.id);
  assert.equal(busy.tauntedTarget, undefined);
  assert.equal(disabled.tauntedTarget, undefined);
  assert.deepEqual(restored.summons[0].wolfOrder, { type: "attack", targetId: enemy.id, path: [] });
  assert.equal(restored.enemies[0].armorBuff.value, 9999);
  scheduleEvent(restored.queue, 1, { type: "weapon-ready", towerId: tower.id });
  advanceTo(restored, restored.queue.nowUs + 1);
  assert.equal(available.tauntedTarget, undefined);
  assert.equal(available.attack.targetId, enemy.id);
});

test("N576 uses one independent egg and resolves surviving and destroyed snapshots differently", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { state, tower, enemy, shot, impact } = await damagePipelineFixture();
  Object.assign(enemy, { unitId: "m050", hp: 250, mana: 300, manaMax: 300, abilities: ["N576"] });
  impact(shot);
  advanceTo(state, state.queue.nowUs + 100_001);
  const egg = state.enemies.find(unit => unit.eggParentId === enemy.id);
  assert.equal(egg.unitId, "b138");
  assert.equal(egg.hp, 33);
  assert.equal(enemy.mana, 0);
  const expires = enemy.phaseUntilUs;

  const success = structuredClone(state);
  scheduleEvent(success.queue, 1, { type: "weapon-impact", travelUs: 0, shot: { ...shot, targetId: egg.id } });
  advanceTo(success, success.queue.nowUs + 1);
  assert.equal(success.enemies.find(unit => unit.id === egg.id).hp, 33);
  advanceTo(success, expires);
  assert.equal(success.enemies.length, 1);
  assert.equal(success.enemies[0].id, enemy.id);
  assert.equal(success.enemies[0].hp, enemy.maxHp);
  assert.equal(success.structures[0].stunnedUntilUs, expires + 4 * second);

  Object.assign(tower, { templateId: "H038", hero: newHero("H038") });
  const heroShot = { ...shot, sourceTemplate: "H038", targetId: egg.id };
  impact(heroShot);
  advanceTo(state, state.queue.nowUs + 1);
  const amount = state.recentHits.at(-1).amount;
  assert.ok(amount >= 1 && amount < 2);
  assert.ok(Math.abs(egg.hp - (33 - amount)) < 1e-8);
  const failed = structuredClone(state);
  for (let count = 0; count < 32; count++) {
    scheduleEvent(failed.queue, 1, { type: "weapon-impact", travelUs: 0, shot: heroShot });
  }
  advanceTo(failed, expires);
  assert.deepEqual(failed.enemies, []);
  assert.equal(failed.kills, 1);
  assert.equal(failed.structures[0].stunnedUntilUs, undefined);
});

test("N706–N708 apply two-second attack slows once per active mark", async () => {
  for (const [id, attackSlow, movement] of [["N706", .5, .9], ["N707", .8, .6], ["N708", 1.2, .4]]) {
    const { state, tower, enemy } = await damagePipelineFixture();
    enemy.abilities = [id];
    scheduleEvent(state.queue, 1, { type: "weapon-ready", towerId: tower.id });
    advanceTo(state, state.queue.nowUs + 1);
    const expected = { attackSlow, movement, untilUs: state.queue.nowUs + 2 * second };
    assert.deepEqual(tower.untouchable, expected);
    const carrier = state.queue.pending.find(event => event.payload.type === "untouchable-carrier-expire");
    assert.equal(carrier.dueUs, state.queue.nowUs + 500_000);
    assert.deepEqual(carrier.payload, { type: "untouchable-carrier-expire", ownerId: enemy.id, targetId: tower.id,
      point: { x: tower.x, y: tower.y }, rank: Number(id.at(-1)) - 5 });
    const restored = structuredClone(state);
    advanceTo(restored, state.queue.nowUs + 100_000);
    assert.deepEqual(restored.structures[0].untouchable, expected);
    assert.deepEqual(restored.queue.pending.find(event => event.timerId === carrier.timerId), carrier);
    advanceTo(restored, carrier.dueUs);
    assert.equal(restored.queue.pending.some(event => event.timerId === carrier.timerId), false);
    assert.deepEqual(restored.structures[0].untouchable, expected);
  }
});

test("N710–N712 spend mana at effect and apply their distinct low-life or summon behavior", async () => {
  for (const id of ["N710", "N711", "N712"]) {
    const { state, tower, enemy, shot, impact } = await damagePipelineFixture();
    Object.assign(enemy, { unitId: { N710: "m541", N711: "m551", N712: "m561" }[id], abilities: [id],
      hp: 400, maxHp: 1000, mana: 1000, manaMax: 1000 });
    const ally = { ...enemy, id: 901, unitId: "m001", abilities: [], hp: 200 };
    state.enemies.push(ally);
    impact(shot);
    advanceTo(state, state.queue.nowUs + 1);
    assert.equal(enemy.mana, { N710: 600, N711: 700, N712: 0 }[id]);
    if (id === "N710") assert.equal(tower.stunnedUntilUs, state.queue.nowUs + 3 * second);
    if (id === "N711") {
      const child = state.enemies[2];
      assert.ok(["b142", "b143"].includes(child.unitId));
      assert.equal(child.hp, 300);
      assert.equal(child.points, 5);
      const restored = structuredClone(state);
      advanceTo(restored, state.queue.nowUs + 30 * second);
      assert.equal(restored.enemies.some(unit => unit.id === child.id && unit.unitId === child.unitId), false);
    }
    if (id === "N712") {
      assert.equal(enemy.hp, 600);
      assert.equal(ally.hp, 200);
    }
  }
});

test("i235 rejects an out-of-range site and preserves a placed detector after its caster is recycled", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { state, tower, enemy } = await damagePipelineFixture();
  tower.templateId = "H038";
  tower.hero = newHero("H038");
  state.inventory = [{ id: 902, itemId: "i235", towerId: tower.id, slot: 0, point: tower, charges: 1 }];
  const cast = { type: "place-scout-ward", towerId: tower.id, itemId: 902 };
  assert.equal(submit(state, "too-far", { ...cast, point: { x: tower.x + 501, y: tower.y } }).reason, "range");
  assert.equal(state.inventory[0].charges, 1);
  const placed = submit(state, "place", { ...cast, point: { x: tower.x + 500, y: tower.y } });
  assert.equal(placed.ok, true);
  assert.equal(state.inventory.length, 0);
  assert.equal(state.detectors[0].templateId, "b116");
  assert.equal(state.detectors[0].hp, 200);
  const expires = state.queue.nowUs + 100 * second;
  Object.assign(enemy, { x: tower.x + 1600, y: tower.y,
    windwalk: { invisibleUs: state.queue.nowUs, endUs: expires + second, speed: 1.1 } });
  assert.equal(canSeeEnemy(state, enemy), true);
  assert.equal(submit(state, "remove-caster", { type: "recycle-tower", towerId: tower.id }).ok, true);
  const restored = structuredClone(state);
  advanceTo(restored, expires - 1);
  assert.equal(restored.detectors[0].id, placed.createdId);
  assert.equal(canSeeEnemy(restored, restored.enemies[0]), true);
  advanceTo(restored, expires);
  assert.deepEqual(restored.detectors, []);
  assert.ok(restored.battleAnimations.some(effect => effect.unitId === "b116" && effect.kind === "death" && effect.atUs === expires));
  assert.equal(!!canSeeEnemy(restored, restored.enemies[0]), false);
});

test("P000 learning installs P200 and the divine book reads the saved form independently of the rank", async () => {
  const { heroThresholds, newHero } = await import("../src/game/m2/hero.ts");
  const { state, tower } = await damagePipelineFixture();
  tower.templateId = "H038";
  tower.hero = newHero("H038");
  const chain = qualificationChains.get("P006");
  tower.qualification = chain.id;
  state.structures.push({ id: 902, ...map.worker, templateId: chain.requireUnit, qualification: null, radius: 72, pending: null });
  grantHeroExperience(state, tower.id, heroThresholds[28]);
  const learn = { type: "learn-skill", towerId: tower.id, skillId: "P000" };
  assert.equal(submit(state, "level-29", learn).ok, false);
  grantHeroExperience(state, tower.id, heroThresholds[29] - heroThresholds[28]);
  assert.equal(submit(state, "level-30", learn).ok, true);
  assert.deepEqual(tower.hero.divineForm, { id: "P200", stars: 1 });

  const legacy = structuredClone(state);
  delete legacy.structures[0].hero.divineForm;
  restoreHeroState(legacy);
  assert.deepEqual(legacy.structures[0].hero.divineForm, tower.hero.divineForm);

  const restored = structuredClone(state);
  const hero = restored.structures[0].hero;
  hero.ranks.P000 = 0;
  restoreHeroState(restored);
  restored.inventory = ["i258", "i264"].map((itemId, slot) => ({ id: 901 + slot, itemId, slot, point: map.worker, charges: 1 }));
  const use = { type: "use-book", towerId: tower.id };
  assert.equal(submit(restored, "base-form-gem", { ...use, itemId: 902 }).divineBook, "ineligible");
  const result = submit(restored, "divine-book", { ...use, itemId: 901 });
  assert.match(hero.divineForm.id, /^P2(?:0[1-9]|1[0-9]|2[0-2])$/);
  assert.deepEqual(result.divineBook, hero.divineForm);
  assert.equal(restored.inventory.some(item => item.id === 901), false);
});

test("divine crystal failure consumes its charge and a max-star gem refunds via ordinary delivery", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { unitBalance } = await import("../src/game/m2/combat.ts");
  const { state, tower } = await damagePipelineFixture();
  tower.templateId = "H038";
  tower.hero = newHero("H038");
  tower.hero.ranks.P000 = 1;
  tower.hero.divineForm = { id: "P220", stars: 9 };
  const baseLife = unitBalance.get("H038").HP + tower.hero.natural.STR * 15;
  tower.life = { hp: baseLife + 15_900, staticMaximum: baseLife, maximum: baseLife + 16_000,
    lastUs: state.queue.nowUs, regen: 0 };
  state.inventory = ["i259", "i264", "i264"].map((itemId, slot) => ({ id: 902 + slot, itemId, slot, point: map.worker, charges: 1 }));
  const use = { type: "use-book", towerId: tower.id };
  state.randomState = 1;
  assert.equal(submit(state, "failed-roll", { ...use, itemId: 902 }).divineBook, "failed");
  assert.equal(state.inventory.some(item => item.id === 902), false);
  assert.equal(tower.hero.divineForm.stars, 9);
  assert.equal(submit(state, "level", { ...use, itemId: 903 }).ok, true);
  assert.equal(tower.hero.divineForm.stars, 10);
  assert.equal(tower.life.maximum, baseLife + 19_000);
  assert.equal(tower.life.hp, baseLife + 18_900);
  const restored = structuredClone(state);
  const random = restored.randomState;
  assert.equal(submit(restored, "max-refund", { ...use, itemId: 904 }).divineBook, "max-stars");
  assert.equal(restored.structures[0].hero.divineForm.stars, 10);
  assert.equal(restored.randomState, random);
  assert.equal(restored.inventory.length, 1);
  assert.equal(restored.inventory[0].itemId, "i264");
  assert.notEqual(restored.inventory[0].id, 904);
});

test("a ground rune bypasses a full bag and a no-killer charm records the Boss death", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { state, tower, enemy } = await damagePipelineFixture();
  tower.templateId = "H038";
  tower.hero = newHero("H038");
  state.wave = 55;
  Object.assign(enemy, { unitId: "mBOS", hp: 1000 });
  state.cards = [];
  state.books = [];
  state.inventory = Array.from({ length: 6 }, (_, slot) => ({ id: 902 + slot, itemId: slot ? "i206" : "i278",
    slot, point: map.worker, charges: 1 }));
  state.inventory.push({ id: 908, itemId: "i718", slot: null, point: map.worker, charges: 0 });
  state.activeRuneId = 908;
  const gold = state.gold;
  assert.equal(submit(state, "get-rune", { type: "pick-up-item", itemId: 908 }).ok, true);
  assert.equal(state.gold, gold + 55 * 66);
  assert.equal(state.activeRuneId, undefined);
  assert.equal(submit(state, "get-rune-again", { type: "pick-up-item", itemId: 908 }).ok, false);
  assert.equal(submit(state, "use-charm", { type: "use-item", itemId: 902 }).ok, true);
  assert.equal(state.result.reason, "boss-killed");
  assert.equal(state.kills ?? 0, 0);
  assert.deepEqual(state.battleAnimations.map(effect => [effect.kind, effect.unitId]), [["death", "mBOS"]]);
});

test("manual spell targets distinguish empty ground from a missing unit and survive the windup snapshot", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { state, tower } = await damagePipelineFixture();
  tower.templateId = "H029";
  tower.hero = newHero("H029");
  tower.hero.ranks.A094 = 1;
  tower.hero.ranks.A092 = 1;
  state.enemies = [];
  let cast = { type: "cast-hero", towerId: tower.id, skillId: "A094", point: { x: tower.x + 800, y: tower.y } };
  assert.equal(submit(state, "out-of-range", { ...cast, point: { x: tower.x + 801, y: tower.y } }).reason, "range");
  assert.equal(submit(state, "invalid-unit", { ...cast, skillId: "A092", targetId: 909 }).reason, "range");
  assert.equal(tower.mana, undefined);
  assert.equal(submit(state, "empty-ground", cast).ok, true);
  const restored = structuredClone(state);
  advanceTo(restored, state.queue.nowUs + 300_000);
  assert.equal(restored.summons.length, 8);
  assert.ok(restored.summons.every(ward => Math.abs((ward.x - cast.point.x) ** 2 + (ward.y - cast.point.y) ** 2 - 90_000) < 1e-8));
  assert.ok(Math.abs(restored.structures[0].mana - (restored.structures[0].manaMaximum - 100)) < 1e-8);
});

test("A092 reserves the first slot for the shielded primary target and orders eligible fork links by creation", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { state, tower, enemy } = await damagePipelineFixture();
  tower.templateId = "H029";
  tower.hero = newHero("H029");
  tower.hero.ranks.A092 = 1;
  const primary = { ...enemy, id: 950, x: tower.x + 600, abilities: ["N535"] };
  const mechanical = { ...enemy, id: 930, x: tower.x + 400, abilities: ["Amec"] };
  const secondary = Array.from({ length: 6 }, (_, index) => ({ ...enemy, id: 940 + index, x: tower.x + 500 + index,
    y: tower.y + index, abilities: index === 0 ? ["N535"] : [] }));
  state.enemies = [primary, ...secondary.toReversed(), mechanical];
  const cast = { type: "cast-hero", towerId: tower.id, skillId: "A092" };
  assert.equal(submit(state, "mechanical", { ...cast, targetId: mechanical.id }).reason, "range");
  assert.ok(submit(state, "fork", { ...cast, targetId: primary.id }).ok);
  const restored = structuredClone(state);
  advanceTo(restored, state.queue.nowUs + 300_000);
  assert.equal(restored.enemies.find(target => target.id === primary.id).spellShieldReadyUs, restored.queue.nowUs + 6 * second);
  assert.equal(restored.enemies.find(target => target.id === secondary[0].id).spellShieldReadyUs, undefined);
  assert.deepEqual(restored.recentHits.map(hit => hit.targetId), secondary.slice(0, 5).map(target => target.id));
  assert.deepEqual(restored.battleAnimations.map(effect => [effect.kind, effect.target.x, effect.target.y]),
    secondary.slice(0, 5).map(target => ["spell-link", target.x, target.y]));
});

test("i310 changes the learned ward slot at pickup and existing A095 wards outlive the item transfer", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { state, tower } = await damagePipelineFixture();
  tower.templateId = "H029";
  tower.hero = newHero("H029");
  Object.assign(tower.hero, { level: 10, points: 1 });
  tower.hero.natural.INT = 80;
  const chain = qualificationChains.get("P006");
  tower.qualification = chain.id;
  state.structures.push({ id: 901, ...map.worker, templateId: chain.requireUnit, qualification: null, radius: 72, pending: null });
  state.inventory = [{ id: 902, itemId: "i310", slot: 0, point: { ...map.worker }, charges: 0 }];
  state.enemies = [];
  const pickup = { type: "transfer-item", itemId: 902, towerId: tower.id };
  const remove = { type: "transfer-item", itemId: 902 };
  const ward = { type: "cast-hero", towerId: tower.id, skillId: "A094", point: { ...map.worker } };
  assert.ok(submit(state, "equip-before-learning", pickup).ok);
  assert.ok(submit(state, "learn-base-ward", { type: "learn-skill", towerId: tower.id, skillId: "A094" }).ok);
  const restored = JSON.parse(JSON.stringify(state));
  restoreHeroState(restored);
  const [caster] = restored.structures;
  assert.equal(caster.scepterWard, false);
  assert.ok(submit(restored, "return-staff", remove).ok);
  assert.ok(submit(restored, "equip-after-learning", pickup).ok);
  assert.equal(caster.scepterWard, true);
  assert.ok(submit(restored, "begin-enhanced-ward", ward).ok);
  assert.ok(submit(restored, "remove-during-windup", remove).ok);
  advanceTo(restored, caster.heroCastUntilUs);
  assert.equal(restored.summons?.length ?? 0, 0);
  assert.equal(caster.heroSpellReady, undefined);
  assert.ok(submit(restored, "reequip", pickup).ok);
  assert.ok(submit(restored, "commit-enhanced-ward", ward).ok);
  advanceTo(restored, restored.queue.pending.find(event => event.payload.type === "hero-spell").dueUs);
  assert.ok(submit(restored, "remove-after-effect", remove).ok);
  const afterDrop = JSON.parse(JSON.stringify(restored));
  restoreHeroState(afterDrop);
  assert.equal(afterDrop.structures[0].scepterWard, false);
  assert.equal(afterDrop.structures[0].hero.ranks.A094, 1);
  assert.equal(afterDrop.structures[0].heroSpellReady.A094, caster.heroSpellReady.A094);
  assert.equal(afterDrop.summons.length, 8);
  assert.ok(afterDrop.summons.every(unit => unit.templateId === "b132" && unit.summon.projectileGroup.extra === 3));
  const expiry = afterDrop.queue.pending.find(event => event.payload.type === "summon-expire").dueUs;
  advanceTo(afterDrop, expiry - 1);
  assert.equal(afterDrop.summons.length, 8);
  advanceTo(afterDrop, expiry);
  assert.equal(afterDrop.summons.length, 0);
});

test("i200 and i265 compose their documented magic-resistance penetration in the live damage path", async () => {
  const { state, tower, enemy } = await damagePipelineFixture();
  tower.templateId = "n021";
  enemy.abilities = ["T015"];
  state.inventory = ["i200", "i265", "i308"].map((itemId, slot) => ({ id: 902 + slot, itemId, slot, towerId: tower.id, point: tower, charges: 0 }));
  scheduleEvent(state.queue, 1, { type: "immolation", towerId: tower.id });
  advanceTo(state, state.queue.nowUs + 1);
  assert.ok(Math.abs(1000 - enemy.hp - 48 * .7075) < 1e-8);
});

test("i276 seals life directly and returns eighty percent of the amount after a saved six-second window", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { state, tower, enemy } = await damagePipelineFixture();
  tower.templateId = "H038";
  tower.hero = newHero("H038");
  tower.hero.natural.INT = 60;
  state.inventory = [{ id: 902, itemId: "i276", towerId: tower.id, slot: 0, point: tower, charges: 0 }];
  assert.equal(submit(state, "seal", { type: "cast-equipment", towerId: tower.id, itemId: 902, targetId: enemy.id }).ok, true);
  assert.equal(enemy.hp, 600);
  assert.equal(state.recentHits, undefined);
  const restored = structuredClone(state);
  advanceTo(restored, state.queue.nowUs + 6 * second);
  assert.equal(restored.enemies[0].hp, 920);
  assert.equal(restored.enemies[0].seal, undefined);
});

test("i276 accounts for N532 regeneration before sealing and before returning life", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { state, tower, enemy } = await damagePipelineFixture();
  tower.templateId = "H038";
  tower.hero = newHero("H038");
  tower.hero.natural.INT = 60;
  Object.assign(enemy, { unitId: "m049", hp: 15_000, maxHp: 50_000, mana: 1000, manaMax: 47_000,
    armor: 360, speed: 240, abilities: ["N532", "T016"] });
  state.inventory = [{ id: 902, itemId: "i276", towerId: tower.id, slot: 0, point: tower, charges: 0 }];
  scheduleEvent(state.queue, 1, { type: "enemy-cast", enemyId: enemy.id, skill: "N532", point: enemy });
  advanceTo(state, state.queue.nowUs + second);
  assert.equal(enemy.unitId, "e009");
  assert.ok(enemy.abilities.includes("T014"));
  const restored = structuredClone(state);
  assert.ok(submit(restored, "seal-healing-target", { type: "cast-equipment", towerId: tower.id, itemId: 902, targetId: enemy.id }).ok);
  const transformed = restored.enemies[0];
  assert.equal(transformed.seal.amount, (15_000 + 5_200 + 14_000) * .4);
  advanceTo(restored, transformed.seal.untilUs);
  assert.equal(transformed.hp, 55_200);
  assert.equal(transformed.seal, undefined);
  advanceTo(restored, restored.queue.nowUs + 14 * second);
  assert.equal(transformed.id, enemy.id);
  assert.equal(transformed.unitId, "m049");
  assert.equal(transformed.hp, 50_000);
  assert.deepEqual(transformed.abilities, ["N532", "T016"]);
});

test("i276 automatic order saves the exact item and does not spend after an earlier same-clock transfer", async () => {
  for (const transferFirst of [false, true]) {
    const { state, tower, enemy } = await damagePipelineFixture();
    tower.manaOffset = 1000;
    Object.assign(enemy, { unitId: "mBOS", x: tower.x + 500, hp: 20_000, maxHp: 20_000, abilities: ["N534"] });
    state.inventory = [{ id: 902, itemId: "i276", towerId: tower.id, slot: 0, point: { ...map.worker }, charges: 0 }];
    scheduleEvent(state.queue, 0, { type: "weapon-ready", towerId: tower.id });
    if (transferFirst) scheduleEvent(state.queue, 0, { type: "command",
      command: { id: "take-away-seal", matchId: state.matchId, action: { type: "transfer-item", itemId: 902 } } });
    state.clock.targetUs = state.queue.nowUs;
    assert.equal(drain(state, 1), "pending");
    const automatic = state.queue.pending.find(event => event.payload.type === "auto-control-equipment");
    assert.deepEqual([automatic.dueUs, automatic.payload.itemId, automatic.payload.targetId], [state.queue.nowUs, 902, enemy.id]);
    assert.equal(enemy.hp, 20_000);
    const restored = JSON.parse(JSON.stringify(state));
    advanceTo(restored, restored.clock.targetUs);
    assert.equal(restored.enemies[0].hp, transferFirst ? 20_000 : 12_000);
    assert.equal(restored.structures[0].controlEquipmentReady?.i276,
      transferFirst ? undefined : restored.queue.nowUs + 30 * second);
    if (transferFirst) assert.ok(restored.commandResults["take-away-seal"].ok);
  }
});

test("i281 starts the shared lock on launch and waits for actual missile contact after restore", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  for (const protectedTarget of [false, true]) {
    const { state, tower, enemy } = await damagePipelineFixture();
    tower.templateId = "H038";
    tower.hero = newHero("H038");
    Object.assign(enemy, { unitId: "mBOS", x: tower.x + 20, abilities: protectedTarget ? ["N534", "N535"] : ["N534"] });
    state.inventory = [{ id: 902, itemId: "i281", towerId: tower.id, slot: 0, point: tower, charges: 0 }];
    assert.ok(submit(state, "doom-launch", { type: "cast-equipment", towerId: tower.id, itemId: 902, targetId: enemy.id }).ok);
    const launch = state.queue.nowUs;
    assert.equal(enemy.doomReadyUs, launch + 10 * second);
    const restored = structuredClone(state);
    const target = restored.enemies[0];
    advanceTo(restored, launch + 19_999);
    assert.equal(target.doomUntilUs, undefined);
    assert.equal(target.spellShieldReadyUs, undefined);
    advanceTo(restored, launch + 20_000);
    assert.equal(target.doomUntilUs, protectedTarget ? undefined : launch + 20_000 + 5 * second);
    assert.equal(target.spellShieldReadyUs, protectedTarget ? launch + 20_000 + 6 * second : undefined);
  }
});

test("i325 completes only the elapsed whole seconds when stopped after restoring the channel", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { state, tower, enemy } = await damagePipelineFixture();
  tower.templateId = "H038";
  tower.hero = newHero("H038");
  Object.assign(enemy, { hp: 10000, maxHp: 10000 });
  state.inventory = [{ id: 902, itemId: "i325", towerId: tower.id, slot: 0, point: tower, charges: 0 }];
  assert.equal(submit(state, "duration", { type: "set-snow-duration", seconds: 4 }).ok, true);
  assert.equal(submit(state, "cast", { type: "cast-equipment", towerId: tower.id, itemId: 902, point: enemy }).ok, true);
  const restored = structuredClone(state);
  advanceTo(restored, state.queue.nowUs + 2.2 * second);
  assert.equal(submit(restored, "stop", { type: "stop-tower-cast", towerId: tower.id }).ok, true);
  assert.equal(restored.structures[0].snow, undefined);
  assert.equal(restored.queue.pending.some(entry => entry.payload.type === "equipment-snow"), false);
  const { effectiveAttributes } = await import("../src/game/m2/combat.ts");
  const intelligence = effectiveAttributes(restored.structures[0].hero, ["i325"]).INT;
  assert.ok(Math.abs(restored.enemies[0].hp - (10000 - 4480 * (1 + .001 * intelligence))) < 1e-8);
  assert.equal(restored.enemies[0].stunUntilUs, restored.queue.nowUs + 1.5 * second);
  assert.equal(restored.recentHits[0].sourceTemplate, "q001");
  assert.notEqual(restored.recentHits[0].casterId, tower.id);
});

test("i325 queues the selected ground point at 800 outside weapon range and rechecks the exact item", async () => {
  for (const transferFirst of [false, true]) {
    const { state, tower, enemy } = await damagePipelineFixture();
    tower.manaOffset = 1000;
    enemy.x = tower.x + 800;
    const point = { x: enemy.x, y: enemy.y };
    state.inventory = [{ id: 902, itemId: "i325", towerId: tower.id, slot: 0, point: { ...map.worker }, charges: 0 }];
    scheduleEvent(state.queue, 0, { type: "weapon-ready", towerId: tower.id });
    if (transferFirst) scheduleEvent(state.queue, 0, { type: "command",
      command: { id: "take-away-staff", matchId: state.matchId, action: { type: "transfer-item", itemId: 902 } } });
    state.clock.targetUs = state.queue.nowUs;
    assert.equal(drain(state, 1), "pending");
    const automatic = state.queue.pending.find(event => event.payload.type === "auto-control-equipment");
    assert.deepEqual([automatic.dueUs, automatic.payload.itemId, automatic.payload.point], [state.queue.nowUs, 902, point]);
    assert.equal(tower.snow, undefined);
    const restored = JSON.parse(JSON.stringify(state));
    restored.enemies[0].x -= 50;
    advanceTo(restored, restored.clock.targetUs);
    assert.deepEqual(restored.structures[0].snow?.point, transferFirst ? undefined : point);
    assert.equal(restored.structures[0].snowReadyUs, transferFirst ? undefined : restored.queue.nowUs + 20 * second);
    if (transferFirst) assert.ok(restored.commandResults["take-away-staff"].ok);
  }
});

test("i325 applies i327 then P222 to the remaining cooldown when a saved channel ends early", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { state, tower } = await damagePipelineFixture();
  tower.templateId = "H038";
  tower.hero = newHero("H038");
  tower.hero.divineForm = { id: "P222", stars: 10 };
  state.inventory = ["i325", "i327"].map((itemId, slot) => ({ id: 901 + slot, itemId, towerId: tower.id,
    slot, point: { ...map.worker }, charges: 0 }));
  assert.ok(submit(state, "cast", { type: "cast-equipment", towerId: tower.id, itemId: 901, point: map.worker }).ok);
  const original = tower.snowReadyUs;
  const restored = structuredClone(state);
  advanceTo(restored, restored.queue.nowUs + 400_000);
  assert.ok(submit(restored, "stop", { type: "stop-tower-cast", towerId: tower.id }).ok);
  const stopped = restored.structures[0].heroCastUntilUs;
  assert.equal(restored.structures[0].snowReadyUs, stopped + Math.round(Math.round((original - stopped) * .8) * .9));
  assert.equal(restored.recentHits, undefined);
});

test("Q18 J006 pays at 5 and 120 battle seconds, while J001 keeps its own cooldown", () => {
  const state = newMatch("worker-benefit", 14);
  const gold = state.gold;
  const automatic = state.queue.pending.filter(entry => entry.payload.type === "worker-benefit");
  assert.deepEqual(automatic.map(entry => entry.dueUs), [5, 120].map(seconds => seconds * second));
  state.queue.pending = automatic;
  advanceTo(state, 5 * second);
  assert.ok(state.gold - gold >= 84 && state.gold - gold <= 120);
  assert.equal(state.lastWorkerBenefit.source, "J006");
  assert.equal(submit(state, "manual", { type: "claim-worker-benefit" }).ok, true);
  assert.equal(submit(state, "manual-again", { type: "claim-worker-benefit" }).reason, "cooldown");
  const savedGold = state.gold;
  const restored = structuredClone(state);
  advanceTo(restored, 120 * second);
  assert.ok(restored.gold - savedGold >= 84 && restored.gold - savedGold <= 120);
  assert.equal(restored.lastWorkerBenefit.source, "J006");
});

test("serpent contracts run inside B03, skip an entry-zero parent, and resolve green before blue", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  for (const raw of [0, 100]) {
    const { state, tower, enemy, shot, impact } = await damagePipelineFixture();
    tower.templateId = "H029";
    tower.hero = newHero("H029");
    const ward = { ...map.worker, id: 901, templateId: "b122", pending: null, population: 0, radius: 0,
      qualification: null, summon: { ownerId: tower.id, attack: 40, speed: 0, green: .6, blue: 6, skillId: "A094" } };
    state.summons = [ward];
    state.randomState = 2048; // First roll is 3.
    impact({ ...shot, raw, sourceTemplate: ward.templateId,
      summon: { id: ward.id, point: ward, green: .6, blue: 6, attack: 40, banner: false, skillId: "A094" } });
    const restored = structuredClone(state);
    advanceTo(restored, state.queue.nowUs + 1);
    if (raw === 0) {
      assert.equal(restored.enemies[0].hp, 1000);
      assert.equal(restored.randomState, 2048);
      continue;
    }
    const hits = restored.recentHits;
    assert.equal(hits.length, 3);
    assert.ok(hits[0].amount > 0 && hits[0].amount < hits[1].amount);
    assert.ok(hits[1].amount > 120);
    assert.ok(Math.abs(hits[2].amount - 100 * (1 + 6 * .0006)) < 1e-8);
    assert.ok(hits.every(hit => hit.casterId === ward.id && hit.targetId === enemy.id));
  }
});

test("T044 pulses without damage and T045 casts a targetless shell only when its caster can act", async () => {
  const { diseasePulseTargets } = await import("../src/game/m2/match.ts");
  for (const blocked of [false, true]) {
    const { state, enemy, shot, impact } = await damagePipelineFixture();
    const now = state.queue.nowUs;
    enemy.abilities = ["N521", "T045"];
    if (blocked) enemy.spellCastingUntilUs = now + second;
    impact({ ...shot, raw: 1500 });
    const restored = structuredClone(state);
    advanceTo(restored, now + 1, 1);
    const target = restored.enemies[0];
    assert.equal(target.hp, 1000);
    assert.equal(target.graveUntilUs, now + 1 + 6 * second);
    assert.equal(target.graveCastUs, blocked ? undefined : now + 1);
    assert.equal(target.graveSpellReadyUs, blocked ? undefined : now + 1 + second);
    assert.equal(restored.recentHits?.length ?? 0, 0);
  }
  const { state, enemy } = await damagePipelineFixture();
  enemy.abilities = ["T044"];
  enemy.diseaseStartedUs = state.queue.nowUs;
  assert.equal(diseasePulseTargets(state, enemy).length, 0);
  advanceTo(state, state.queue.nowUs + second);
  assert.ok(diseasePulseTargets(state, enemy).includes(state.worker));
  assert.equal(enemy.hp, 1000);
  assert.equal(state.recentHits?.length ?? 0, 0);
  const restored = structuredClone(state);
  advanceTo(restored, restored.queue.nowUs + 250_000);
  assert.equal(diseasePulseTargets(restored, restored.enemies[0]).length, 0);
});

test("T049 interrupts the windup, overrides movement and leaves its delayed physical packet independent of hex", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { state, tower, enemy } = await damagePipelineFixture();
  tower.templateId = "H021";
  tower.hero = newHero("H021");
  tower.hero.ranks.A068 = 1;
  enemy.abilities = ["N534", "N519"];
  enemy.spellCastingUntilUs = state.queue.nowUs + 100_000;
  scheduleEvent(state.queue, 100_000, { type: "enemy-cast", enemyId: enemy.id, skill: "N519", point: tower, targetId: tower.id });
  const immune = { ...enemy, id: enemy.id + 1, x: tower.x + 10, abilities: ["Amim", "N535"], spellCastingUntilUs: undefined };
  const shielded = { ...immune, id: enemy.id + 2, x: tower.x + 20, abilities: ["N535"] };
  state.enemies = [shielded, immune, enemy];
  state.inventory = [{ id: 902, itemId: "i202", towerId: tower.id, slot: 0, point: { ...map.worker }, charges: 0 }];
  state.randomState = 1;
  assert.ok(submit(state, "trigger-hex", { type: "cast-hero", towerId: tower.id, skillId: "A068" }).ok);
  const castAt = state.queue.nowUs;
  assert.equal(enemy.hexUntilUs, castAt + second);
  assert.notEqual(enemy.hexSourceId, tower.id);
  assert.equal(state.queue.pending.some(event => event.payload.type === "enemy-cast"), false);
  assert.equal(immune.spellShieldReadyUs, undefined);
  assert.equal(shielded.hexUntilUs, undefined);
  assert.equal(shielded.spellShieldReadyUs, castAt + 6 * second);
  const restored = structuredClone(state);
  const hexed = restored.enemies.find(unit => unit.id === enemy.id);
  hexed.path = [{ x: hexed.x + 120, y: hexed.y }];
  const begin = hexed.x;
  moveAlongRoute(hexed, [], () => 0);
  assert.equal(hexed.x, begin + 100 / 32);
  advanceTo(restored, castAt + 200_000);
  assert.deepEqual(restored.recentHits.map(hit => [hit.casterId, hit.targetId]),
    [enemy, immune, shielded].map(unit => [tower.id, unit.id]));
  advanceTo(restored, castAt + second - 1);
  assert.equal(hexed.hexSourceId, enemy.hexSourceId);
  advanceTo(restored, castAt + second);
  assert.equal(hexed.hexSourceId, undefined);
});

test("i279 consumes two eligible casts and keeps its own flame source after recycling and restoration", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { state, tower, enemy } = await damagePipelineFixture();
  tower.templateId = "H021";
  tower.hero = newHero("H021");
  tower.hero.ranks.A068 = 1;
  tower.population = 20;
  tower.lastAttackTarget = { x: tower.x + 400, y: tower.y };
  Object.assign(enemy, { x: tower.x + 550, hp: 10_000, maxHp: 10_000 });
  state.inventory = [{ id: 902, itemId: "i279", towerId: tower.id, slot: 0, point: { ...map.worker }, charges: 0 }];
  const cast = { type: "cast-hero", towerId: tower.id, skillId: "A068" };
  assert.ok(submit(state, "charge", cast).ok);
  assert.equal(tower.glowCharge, 1);
  assert.equal(state.queue.pending.some(event => event.payload.type === "spell-sweep"), false);
  advanceTo(state, tower.treeGrab.readyUs);
  assert.ok(submit(state, "release", cast).ok);
  const sweeping = state.queue.pending.find(event => event.payload.type === "spell-sweep").payload.sweep;
  assert.deepEqual([sweeping.dx, sweeping.dy, tower.glowCharge], [1, 0, 0]);
  assert.notEqual(sweeping.sourceId, tower.id);
  assert.ok(submit(state, "retire-caster", { type: "recycle-tower", towerId: tower.id }).ok);
  const restored = structuredClone(state);
  advanceTo(restored, state.queue.nowUs + second);
  assert.equal(restored.enemies[0].hp, 8000);
  assert.deepEqual(restored.recentHits.map(hit => [hit.casterId, hit.ownerId, hit.sourceTemplate]), [[sweeping.sourceId, undefined, "q001"]]);
});

test("P217 runs before the ash hood on an eligible instant cast and expires after restoring", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { state, tower, enemy } = await damagePipelineFixture();
  tower.templateId = "H021";
  tower.hero = newHero("H021");
  tower.hero.ranks.A068 = 1;
  tower.hero.natural = { STR: 90, AGI: 0, INT: 20 };
  tower.hero.divineForm = { id: "P217", stars: 1 };
  tower.ashMarks = 4;
  enemy.hp = enemy.maxHp = 100_000;
  state.inventory = [{ id: 901, itemId: "i318", towerId: tower.id, slot: 0, point: { ...map.worker }, charges: 0 }];
  state.randomState = 1;
  assert.ok(submit(state, "tree-grab", { type: "cast-hero", towerId: tower.id, skillId: "A068" }).ok);
  assert.equal(tower.ashMarks, 0);
  assert.equal(tower.divineEffects.T127.rank, 1);
  assert.equal(state.recentHits.length, 2);
  const restored = structuredClone(state);
  advanceTo(restored, tower.divineEffects.T127.untilUs);
  assert.equal(restored.structures[0].divineEffects.T127, undefined);
  assert.equal(restored.structures[0].divineCooldowns.P217, tower.divineEffects.T127.untilUs + 2 * second);
});

test("ash hood saves charges without a center and rechecks current health between magic and divine waves", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { state, tower, enemy } = await damagePipelineFixture();
  tower.templateId = "H012";
  tower.hero = newHero("H012");
  tower.hero.ranks.A041 = 1;
  tower.ashMarks = 9;
  const hood = { id: 902, itemId: "i318", towerId: tower.id, slot: 0, point: tower, charges: 0 };
  state.inventory = [hood];
  enemy.x = tower.x + 751;
  const cast = { type: "cast-hero", towerId: tower.id, skillId: "A041" };
  assert.equal(submit(state, "first-cast", cast).ok, true);
  advanceTo(state, state.queue.nowUs + second);
  assert.equal(tower.ashMarks, 10);
  const restored = structuredClone(state);
  const caster = restored.structures[0];
  const target = restored.enemies[0];
  target.x--;
  target.hp = 100_000;
  target.maxHp = target.hp;
  advanceTo(restored, caster.heroSpellReady.A041);
  assert.equal(submit(restored, "second-cast", cast).ok, true);
  advanceTo(restored, restored.queue.nowUs + second);
  assert.equal(caster.ashMarks, 1);
  const hits = restored.recentHits.map(hit => hit.amount);
  assert.equal(hits.length, 4);
  const initialHp = 100_000;
  const agility = 25;
  assert.ok(Math.abs(hits[1] - (initialHp - hits[0]) * .03 * (1 + agility * .0005)) < 1e-8);
  assert.ok(hits[3] < hits[1]);
});

test("A151 scepter arrow takes the first same-time shield or restores its own life debit after reload", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  for (const shielded of [false, true]) {
    const { state, enemy, tower } = await damagePipelineFixture();
    tower.templateId = "H038";
    tower.hero = newHero("H038");
    tower.hero.ranks.A151 = 1;
    state.inventory = [{ id: 902, itemId: "i310", towerId: tower.id, slot: 0, point: tower, charges: 0 }];
    enemy.hp = enemy.maxHp = 10_000;
    enemy.x = tower.x + 125;
    if (shielded) enemy.abilities = ["N535"];
    const start = state.queue.nowUs;
    assert.equal(submit(state, "magic-arrow", { type: "cast-hero", towerId: tower.id, skillId: "A151", targetId: enemy.id }).ok, true);
    advanceTo(state, start + 350_000);
    const retired = structuredClone(state);
    assert.ok(submit(retired, "remove-before-q032-contact", { type: "recycle-tower", towerId: tower.id }).ok);
    advanceTo(retired, start + 500_000);
    assert.equal(retired.enemies[0].hp, shielded ? 10_000 : 9_999);
    if (shielded) assert.ok(retired.enemies[0].spellShieldReadyUs > start + 6 * second);
    else assert.deepEqual(retired.recentHits.map(hit => [hit.sourceTemplate, hit.ownerId]), [["q032", undefined]]);
    const restored = structuredClone(state);
    advanceTo(restored, start + 500_000);
    const target = restored.enemies[0];
    assert.equal(restored.recentHits.length, 1);
    const arrowDamage = restored.recentHits[0].amount;
    assert.ok(arrowDamage >= 500);
    assert.equal(target.hp, (shielded ? 10_000 : 5_000) - arrowDamage);
    assert.ok(target.stunUntilUs > start + 2 * second);
    if (!shielded) {
      const overwritten = structuredClone(restored);
      const pending = overwritten.queue.pending.find(event => event.payload.type === "magic-arrow-restore");
      scheduleEvent(overwritten.queue, pending.dueUs - overwritten.queue.nowUs + 1, {
        ...pending.payload, token: overwritten.queue.nextSequence, amount: 100,
      });
      advanceTo(overwritten, pending.dueUs);
      assert.equal(overwritten.enemies[0].hp, target.hp);
      advanceTo(overwritten, pending.dueUs + 1);
      assert.equal(overwritten.enemies[0].hp, target.hp + 70);
      assert.ok(submit(restored, "remove-before-life-restoration", { type: "recycle-tower", towerId: tower.id }).ok);
    }
    advanceTo(restored, start + 7 * second);
    assert.equal(target.hp, (shielded ? 10_000 : 8_500) - arrowDamage);
  }
});

test("A151 a saved partial homing step uses the elapsed flight when its target moves", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { state, enemy, tower } = await damagePipelineFixture();
  tower.templateId = "H038";
  tower.hero = newHero("H038");
  tower.hero.ranks.A151 = 1;
  enemy.hp = enemy.maxHp = 10_000;
  enemy.x = tower.x + 12.5;
  assert.equal(submit(state, "magic-arrow-partial", { type: "cast-hero", towerId: tower.id, skillId: "A151", targetId: enemy.id }).ok, true);
  advanceTo(state, state.queue.pending.find(event => event.payload.type === "hero-spell").dueUs);
  const firstStep = state.queue.pending.find(event => event.payload.type === "magic-arrow");
  assert.equal(firstStep.payload.travelUs, 10_000);
  const restored = JSON.parse(JSON.stringify(state));
  const target = restored.enemies[0];
  target.x += 12.5;
  advanceTo(restored, firstStep.dueUs);
  assert.equal(target.hp, 10_000);
  const nextStep = restored.queue.pending.find(event => event.payload.type === "magic-arrow");
  assert.equal(nextStep.payload.point.x, tower.x + 12.5);
  assert.equal(nextStep.dueUs, firstStep.dueUs + 10_000);
  advanceTo(restored, nextStep.dueUs);
  assert.ok(target.hp < 10_000);
});

test("A020 scepter can select the same still-living unit for two separately sourced bolts", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { state, enemy, tower } = await damagePipelineFixture();
  tower.templateId = "H005";
  tower.hero = newHero("H005");
  tower.hero.ranks.A020 = 1;
  tower.mana = 300;
  state.inventory = [{ id: 902, itemId: "i310", towerId: tower.id, slot: 0, point: tower, charges: 0 }];
  enemy.hp = enemy.maxHp = 10_000;
  assert.equal(submit(state, "laguna", { type: "cast-hero", towerId: tower.id, skillId: "A020", targetId: enemy.id }).ok, true);
  advanceTo(state, state.queue.nowUs + second);
  const bolts = state.recentHits;
  assert.equal(bolts.length, 2);
  assert.notEqual(bolts[0].casterId, bolts[1].casterId);
  assert.ok(bolts.every(hit => hit.sourceTemplate === "q010" && hit.targetId === enemy.id && hit.amount >= 3000));
});

test("restored spell windup cancels before effect without mana, cooldown or item callbacks", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { state, enemy, tower } = await damagePipelineFixture();
  tower.templateId = "H005";
  tower.hero = newHero("H005");
  tower.hero.ranks.A020 = 1;
  tower.mana = 300;
  state.inventory = [{ id: 902, itemId: "i318", towerId: tower.id, slot: 0, point: tower, charges: 0 }];
  const begin = state.queue.nowUs;
  const cast = { type: "cast-hero", towerId: tower.id, skillId: "A020", targetId: enemy.id };
  assert.equal(submit(state, "start", cast).ok, true);
  const restored = structuredClone(state);
  const caster = restored.structures[0];
  assert.notEqual(caster.spellWindup, undefined);
  assert.equal(submit(restored, "stop", { type: "stop-tower-cast", towerId: tower.id }).ok, true);
  advanceTo(restored, begin + second);
  assert.equal(caster.mana, caster.manaMaximum);
  assert.equal(caster.heroSpellReady?.A020, undefined);
  assert.equal(caster.ashMarks, undefined);
  assert.equal(restored.enemies[0].hp, 1000);
  assert.equal(submit(restored, "restart-cast", cast).ok, true);
  advanceTo(restored, begin + 2 * second);
  assert.ok(caster.heroSpellReady?.A020 > begin);
  assert.equal(caster.ashMarks, 1);
});

test("A093 stopping the primary link leaves the independently sourced link running after reload", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { state, enemy, tower } = await damagePipelineFixture();
  tower.templateId = "H029";
  tower.hero = newHero("H029");
  tower.hero.ranks.A093 = 1;
  enemy.x = tower.x + 100;
  const linked = { ...enemy, id: 950, x: tower.x + 180 };
  state.enemies.push(linked);
  const start = state.queue.nowUs;
  assert.equal(submit(state, "begin-links", { type: "cast-hero", skillId: "A093", towerId: tower.id, targetId: enemy.id }).ok, true);
  advanceTo(state, start + 400_000);
  const restored = structuredClone(state);
  assert.equal(submit(restored, "stop-main-link", { type: "stop-tower-cast", towerId: tower.id }).ok, true);
  assert.equal(restored.enemies[0].leashes.length, 0);
  assert.equal(restored.enemies[1].leashes.length, 1);
  advanceTo(restored, start + 4 * second);
  assert.equal(restored.enemies[0].hp, 1000);
  assert.equal(restored.enemies[1].leashes.length, 0);
  const hits = restored.recentHits;
  assert.equal(hits.length, 3);
  assert.equal(new Set(hits.map(hit => hit.casterId)).size, 1);
  assert.ok(hits.every(hit => hit.casterId !== tower.id && hit.sourceTemplate === "q001" && hit.targetId === linked.id));
});

test("A171 queues each discovered target once and its launched hammer can hit after the caster is recycled", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { state, tower, enemy } = await damagePipelineFixture();
  tower.templateId = "H044";
  tower.hero = newHero("H044");
  tower.hero.ranks.A171 = 1;
  tower.population = 0;
  enemy.x += 220;
  enemy.hp = enemy.maxHp = 10_000;
  const shielded = { ...enemy, id: 940, y: enemy.y + 25, abilities: ["N535"] };
  state.enemies.push(shielded);
  assert.ok(submit(state, "cast-ice-path", { type: "cast-hero", skillId: "A171", towerId: tower.id,
    point: { x: tower.x + 330, y: tower.y } }).ok);
  const effect = tower.heroCastUntilUs - 100_000;
  const firstScan = effect + 500_000;
  advanceTo(state, firstScan - 1);
  state.clock.targetUs = firstScan;
  assert.equal(drain(state, 1), "pending");
  assert.equal(enemy.hp, 10_000);
  assert.deepEqual(state.queue.pending.filter(event => event.payload.type === "ice-path-impact")
    .map(event => event.payload.targetId), [enemy.id, shielded.id]);
  const restored = JSON.parse(JSON.stringify(state));
  restored.enemies[0].x += 30;
  advanceTo(restored, firstScan);
  assert.equal(restored.enemies[1].hp, 10_000);
  assert.equal(restored.enemies[1].spellShieldReadyUs, firstScan + 6 * second);
  const hammer = restored.queue.pending.find(event => event.payload.type === "ice-path-impact");
  assert.equal(hammer.dueUs, firstScan + 10_000);
  assert.equal(restored.enemies[0].hp, 10_000);
  assert.ok(submit(restored, "remove-ice-caster", { type: "recycle-tower", towerId: tower.id }).ok);
  advanceTo(restored, hammer.dueUs);
  assert.equal(restored.enemies[0].hp, 9000);
  assert.equal(restored.recentHits[0].casterId, hammer.payload.source.id);
  assert.equal(restored.recentHits[0].ownerId, undefined);
});

test("A172 keeps separate zone casters and resolves touching circles after its owner leaves", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { state, enemy, tower } = await damagePipelineFixture();
  tower.templateId = "H044";
  tower.hero = newHero("H044");
  tower.hero.ranks.A172 = 1;
  enemy.hp = enemy.maxHp = 30_000;
  enemy.x = tower.x + 450;
  const start = state.queue.nowUs;
  assert.equal(submit(state, "blizzard", { type: "cast-hero", skillId: "A172", towerId: tower.id,
    point: { x: tower.x + 700, y: tower.y } }).ok, true);
  advanceTo(state, start + 350_000);
  state.structures = [];
  const restored = structuredClone(state);
  advanceTo(restored, start + 6 * second);
  assert.equal(restored.enemies[0].hp, 20_000);
  const hits = restored.recentHits;
  assert.equal(hits.length, 20);
  assert.equal(new Set(hits.map(hit => hit.casterId)).size, 2);
  assert.ok(hits.every(hit => hit.amount === 500 && hit.sourceTemplate === "q001"));
});

test("m052 death marks nearby actual units; its weakened owner does not halve a distant ward arrow", async () => {
  const { state, tower, enemy, shot } = await damagePipelineFixture();
  const slain = { ...enemy, id: 950, unitId: "m052", hp: 0 };
  state.enemies.unshift(slain);
  state.randomState = 1; // Chest roll misses, then the death cyclone roll is 37%.
  const ward = { ...tower, id: 960, x: tower.x + 400, templateId: "b122", summon: {
    ownerId: tower.id, attack: 0, speed: 0, green: 0, blue: 0, skillId: "A094",
  } };
  state.summons = [ward];
  assert.equal(removeDeadEnemy(state, slain.id), true);
  assert.equal(tower.weakenedUntilUs, state.queue.nowUs + 8 * second);
  assert.equal(ward.weakenedUntilUs, undefined);
  const restored = structuredClone(state);
  scheduleEvent(restored.queue, 1, { type: "weapon-impact", shot, travelUs: 0 });
  scheduleEvent(restored.queue, 2, { type: "weapon-impact", travelUs: 0,
    shot: { ...shot, sourceTemplate: ward.templateId, summon: { id: ward.id, point: ward, banner: false, skillId: "A094" } } });
  advanceTo(restored, restored.queue.nowUs + 3);
  assert.deepEqual(restored.recentHits.map(hit => [hit.casterId, hit.ownerId, hit.amount]),
    [[tower.id, tower.id, 50], [ward.id, tower.id, 100]]);
});

test("i327 grows maximum mana without healing, then reads actual cooldown at ENDCAST before P222", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { state, enemy, tower } = await damagePipelineFixture();
  tower.templateId = "H012";
  tower.hero = newHero("H012");
  tower.hero.ranks.A041 = 1;
  tower.hero.divineForm = { id: "P222", stars: 10 };
  const item = { id: 902, itemId: "i327", towerId: tower.id, slot: 0, point: tower, charges: 0 };
  state.inventory = [item];
  const cast = { type: "cast-hero", towerId: tower.id, skillId: "A041" };
  const start = state.queue.nowUs;
  assert.equal(submit(state, "strafe", cast).ok, true);
  advanceTo(state, start + 350_000);
  const readyAtEffect = tower.heroSpellReady.A041;
  assert.ok(readyAtEffect >= start + 12_300_000);
  const restored = structuredClone(state);
  advanceTo(restored, start + 500_000);
  const caster = restored.structures[0];
  assert.equal(caster.heroSpellReady.A041, readyAtEffect - 11_900_000 + 8_568_000);
  const oldMaximum = caster.manaMaximum;
  const oldCurrent = caster.mana;
  restored.enemies[0].hp = 0;
  assert.equal(removeDeadEnemy(restored, enemy.id, caster.id), true);
  assert.equal(restored.inventory[0].charges, 1);
  assert.equal(caster.manaMaximum, oldMaximum + 3);
  assert.ok(caster.mana >= oldCurrent && caster.mana - oldCurrent < 3);
});

test("i722 copies weapon inputs once and keeps the illusion's own prior critical instances", async () => {
  const { newHero } = await import("../src/game/m2/hero.ts");
  const { flatAttack, weapons } = await import("../src/game/m2/combat.ts");
  const { state, tower, enemy } = await damagePipelineFixture();
  tower.templateId = "H029";
  tower.hero = newHero("H029");
  tower.permanentAttack = 100;
  enemy.x = tower.x + 500;
  state.inventory = [
    { id: 902, itemId: "i718", slot: null, point: state.worker, charges: 0 },
    { id: 903, itemId: "i213", slot: 0, point: tower, towerId: tower.id, charges: 0 },
    { id: 904, itemId: "i198", slot: 1, point: tower, towerId: tower.id, charges: 0 },
    { id: 905, itemId: "i722", slot: null, point: state.worker, charges: 0 },
  ];
  assert.equal(submit(state, "illusion", { type: "pick-up-item", itemId: 905 }).ok, true);
  const [illusion] = state.summons;
  const weapon = weapons.H029[0];
  const expected = (weapon.base + tower.hero.natural.INT * 1.4) * 1.25 - weapon.base + flatAttack.get("i213") + 100;
  assert.equal(illusion.summon.attack, expected);
  assert.deepEqual(illusion.summon.criticalItems, ["i213"]);
  assert.equal(submit(state, "remove-aura", { type: "drop-item", itemId: 904 }).ok, true);
  assert.equal(submit(state, "remove-critical", { type: "drop-item", itemId: 903 }).ok, true);
  const restored = structuredClone(state);
  scheduleEvent(restored.queue, 1, { type: "weapon-ready", towerId: illusion.id });
  advanceTo(restored, restored.queue.nowUs + 1);
  const fire = restored.queue.pending.find(event => event.payload.type === "weapon-fire");
  advanceTo(restored, fire.dueUs);
  const shot = restored.queue.pending.find(event => event.payload.type === "weapon-impact").payload.shot;
  assert.deepEqual(shot.attackEquipment, ["i213"]);
  assert.ok(Math.abs(shot.raw / .4 - expected - weapon.base) <= weapon.dice * weapon.sides + 1e-8);
  assert.ok(shot.summon.illusion);
});
