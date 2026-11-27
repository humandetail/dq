import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import source from "../docs/rules/battlefield-data.json" with { type: "json" };
import { buildAnchor, chooseWaypoint, map, mapVersion, terrain, terrainAllowsConstruction, waypointRegions } from "../src/game/m2/map.ts";
import { drain, enqueue, inspectBuildPlacement, newMatch } from "../src/game/m2/match.ts";
import { staticSweep } from "../src/game/m2/pathfinding.ts";
import { waves } from "../src/game/m2/waves.ts";

const legacy = mapVersion === "m2-map-5";
const options = { skip: legacy };

test("6.25 battlefield uses the original terrain vertices, slot-zero starts and ordered route triggers", options, () => {
  assert.equal(mapVersion, "m3-map-6.25");
  assert.deepEqual(map.worker, { x: -2304, y: 832 });
  assert.deepEqual(map.energyCircle, { x: -1234, y: 1250 });
  assert.deepEqual(map.entry, { x: -784, y: 768 });
  assert.deepEqual(map.activityEntry, map.entry);
  assert.equal(map.activityWaypoint, map.entryWaypoint);
  assert.deepEqual([terrain.columns, terrain.rows], [97, 97]);
  const raw = readFileSync(new URL("../reference/map-6.25/war3map.w3e", import.meta.url));
  const ground = Buffer.from(terrain.ground, "base64");
  const firstVertex = raw.length - ground.length * 7;
  assert.equal(firstVertex, 49);
  assert.ok(ground.every((type, i) => type === (raw[firstVertex + i * 7 + 4] & 15)));
  assert.equal(terrain.doodads.length, 302);
  for (const [index, area] of waypointRegions.entries()) {
    assert.deepEqual([area.minX, area.minY, area.maxX, area.maxY], source.waypoint_regions[index]);
    assert.deepEqual(map.waypoints[index].next, source.waypoint_adjacency[index]);
  }
  assert.equal(chooseWaypoint(0, null, () => assert.fail("single exit must not consume RNG")), 8);
  assert.equal(chooseWaypoint(0, 8, () => assert.fail("no legal exit must not consume RNG")), undefined);
  assert.equal(chooseWaypoint(8, 0, () => 0), 7);
  assert.equal(chooseWaypoint(8, 0, () => .99), 9);
  assert.equal(chooseWaypoint(8, 7, () => assert.fail("cannot immediately return to node 7")), 9);
});

test("6.25 pathing reproduces every WPM point and rejects footprints crossing blocked cells", options, () => {
  const raw = readFileSync(new URL("../reference/map-6.25/war3map.wpm", import.meta.url));
  const width = raw.readUInt32LE(8), height = raw.readUInt32LE(12);
  assert.deepEqual([width, height], [384, 384]);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const flags = raw[16 + y * width + x];
      const point = { x: map.bounds.minX + x * 32, y: map.bounds.minY + y * 32 };
      assert.equal(terrainAllowsConstruction(point), !(flags & 8));
      assert.equal(staticSweep(point, point, 0, "ground"), !(flags & 2));
      assert.equal(staticSweep(point, point, 0, "fly"), !(flags & 4));
    }
  }
  assert.equal(terrainAllowsConstruction({ x: -2048, y: 960 }), true);
  assert.equal(buildAnchor({ x: -2048, y: 960 }, 72, []), undefined);
  assert.equal(buildAnchor({ x: -1792, y: 832 }, 72, []), undefined);
  assert.deepEqual(buildAnchor({ x: -2240, y: 832 }, 72, [], [], true), { x: -2240, y: 832, radius: 72 });
});

test("6.25 live mainline builds near the original worker and advances to the original route", options, () => {
  const state = newMatch("original-battlefield", 811);
  const build = point => ({ type: "build-worker-tower", tower: "n001", point });
  assert.deepEqual(state.worker, map.worker);
  assert.equal(inspectBuildPlacement(state, build({ x: 0, y: 0 })).reason, "placement");
  assert.equal(inspectBuildPlacement(state, build({ x: -1792, y: 832 })).reason, "placement");
  assert.ok(enqueue(state, { id: "build", matchId: state.matchId, action: build({ x: -2240, y: 832 }) }));
  function advance(run, time) {
    run.clock.targetUs = time;
    while (drain(run, 512) === "pending") {}
  }
  advance(state, waves[0].startUs);
  assert.equal(state.commandResults.build.ok, true);
  assert.deepEqual(state.structures.map(({ x, y, pending }) => ({ x, y, pending })), [{ x: -2240, y: 832, pending: null }]);
  const first = state.enemies[0];
  assert.deepEqual({ x: first.x, y: first.y, waypoint: first.waypoint }, { ...map.entry, waypoint: 0 });
  const resumed = JSON.parse(JSON.stringify(state));
  advance(state, waves[0].startUs + 19_000_000);
  advance(resumed, waves[0].startUs + 19_000_000);
  assert.ok(state.enemies.some(enemy => enemy.previousWaypoint === 8 && [7, 9].includes(enemy.waypoint)));
  assert.ok(state.kills > 0);
  assert.deepEqual(resumed, JSON.parse(JSON.stringify(state)));
});
