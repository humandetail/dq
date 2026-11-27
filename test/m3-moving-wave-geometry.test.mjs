import assert from "node:assert/strict";
import test from "node:test";
import { movingWaveContacts, waveContact } from "../src/game/m2/wave-contact.ts";

const disk = { name: "A019", x: 0, y: 0, dx: 1, dy: 0, speed: 2000, range: 1500, radiusStart: 200, radiusEnd: 200 };
const transverse = { name: "i279", x: 0, y: 0, dx: 1, dy: 0, speed: 1050, range: 600, radiusStart: 125, radiusEnd: 600 };
const segment = (x, y, vx, vy, fromUs = 0, untilUs = 31_250) => ({
  fromUs, untilUs, position: { x, y }, velocity: { x: vx, y: vy },
});

test("transverse contact solves along and lateral motion within the same movement interval", () => {
  assert.deepEqual(movingWaveContacts(transverse, segment(20, 0, -320, 0)), [[14_599, 14_599]]);
  assert.deepEqual(movingWaveContacts(transverse, segment(20, 145, 0, -320)), [[19_048, 19_048]]);
  assert.deepEqual(movingWaveContacts(transverse, segment(20, 145, 0, 0)), []);
  assert.deepEqual(movingWaveContacts(transverse, segment(20, 145, 0, -320, 0, 10_000)), []);
  assert.deepEqual(movingWaveContacts(transverse, segment(20, 141.8, 0, 0, 10_000)), []);
});

test("a target traveling along the transverse plane contacts when its lateral displacement fits", () => {
  const entry = Math.round(20 * 1e6 / ((600 - 125) * 1050 / 600));
  assert.deepEqual(movingWaveContacts(transverse, segment(0, 145, 1050, 0)), [[entry, 31_250]]);
});

test("a moving disk contact retains both crossing roots and detects closed tangency", () => {
  assert.deepEqual(movingWaveContacts(disk, segment(480, 0, -320, 0, 0, 750_000)), [[120_690, 293_103]]);
  assert.deepEqual(movingWaveContacts(disk, segment(100, 200, 1000, 0, 0, 750_000)), [[100_000, 100_000]]);
  const riding = segment(0, 300, 2000, -200, 0, 750_000);
  assert.deepEqual(movingWaveContacts(disk, riding), [[500_000, 750_000]]);
});

test("a separate teleport discontinuity has endpoints with no interpolated contact", () => {
  const earlier = segment(20, 145, 0, 0, 0, 19_048);
  const later = segment(-10, 0, 0, 0, 19_048, 31_250);
  assert.deepEqual([...movingWaveContacts(transverse, earlier), ...movingWaveContacts(transverse, later)], []);
});

test("stationary intervals and exact terminal boundaries use the same B05 microsecond rounding", () => {
  const smallStationary = { x: 480, y: 0 };
  assert.deepEqual(movingWaveContacts(disk, segment(480, 0, 0, 0, 0, 750_000)), [waveContact(disk, smallStationary)]);
  const edge = { x: 600, y: 600 };
  assert.deepEqual(movingWaveContacts(transverse, segment(600, 600, 0, 0, 0, 571_429)), [waveContact(transverse, edge)]);
});
