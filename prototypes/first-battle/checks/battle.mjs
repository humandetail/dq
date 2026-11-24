import assert from 'node:assert/strict';
import { advanceFrame, advanceTime, enqueueEconomy, enterEndless, newBattle, newSession } from '../battle.ts';
import { advanceClock, updateClock } from '../clock.ts';

const initial = () => ({ battle: newBattle(), remainderMs: 0 });
const normal = initial();
for (let frame = 0; frame < 8; frame++) advanceTime(normal, 250, 1);
assert.deepEqual([normal.battle.frame, normal.battle.result], [8, 'win']);
assert.ok(normal.battle.log.includes('2 容怪检查 1/1'));

const fast = initial();
advanceTime(fast, 500, 4);
const background = initial();
for (const elapsed of [500, 150, 550, 800]) advanceTime(background, elapsed, 1);
let restored = initial();
advanceTime(restored, 250, 1);
restored = structuredClone(restored);
advanceTime(restored, 1750, 1);
for (const state of [fast, background, restored]) assert.deepEqual(state, normal);

const failure = { battle: newBattle(false), remainderMs: 0 };
failure.battle.commands.unshift({ frame: 2, target: 'old' });
advanceTime(failure, 100000, 4);
assert.deepEqual([failure.battle.frame, failure.battle.result], [2, 'loss']);
assert.deepEqual(failure.battle.log, ['2 出怪，容怪点数 2/1', '2 容怪检查 2/1', '2 失败']);
assert.equal(failure.battle.pending.length, 0);

const consecutive = newBattle();
consecutive.pending.push({ frame: 3, type: 'spawn', points: 2 });
consecutive.pending.push({ frame: 4, type: 'spawn', startsWave: true, x: 10 });
for (let frame = 0; frame < 3; frame++) advanceFrame(consecutive);
assert.equal(consecutive.result, 'running');
assert.equal(new Set(consecutive.units.map(unit => unit.id)).size, 2);
assert.ok(!consecutive.log.some(line => line.startsWith('3 容怪检查')));
advanceFrame(consecutive);
assert.equal(consecutive.result, 'loss');
assert.equal(consecutive.log.at(-2), '4 容怪检查 3/1');

const outside = newBattle(false);
outside.pending[0].x = 8;
for (let frame = 0; frame < 4; frame++) advanceFrame(outside);
assert.ok(outside.log.includes('2 容怪检查 1/1'));
assert.equal(outside.result, 'running');

const timed = initial();
const clock = { last: 0, speed: 1, paused: false };
updateClock(timed, clock, 300, 4, false);
updateClock(timed, clock, 400, 4, true);
const pauseFrame = timed.battle.frame;
advanceClock(timed, clock, 1200);
assert.equal(timed.battle.frame, pauseFrame);
updateClock(timed, clock, 1200, 4, false);
advanceClock(timed, clock, 2000);
assert.deepEqual(timed.battle, normal.battle);
console.log('R3: wave-boundary loss, circle, capacity points, 1×/4×/pause/speed/catch-up/restore passed');

const session = newSession('review');
for (const command of [
  { kind: 'buy', id: 'ore', frame: 1 },
  { kind: 'buy', id: 'other', frame: 1 },
  { kind: 'craft', id: 'gear', frame: 1, materials: ['ore', 'starter'] },
  { kind: 'craft', id: 'competing', frame: 1, materials: ['ore', 'starter'] },
  { kind: 'buy', id: 'ore', frame: 1 },
]) enqueueEconomy(session, command);
const fromBefore = structuredClone(session);
advanceFrame(session);
advanceFrame(fromBefore);
assert.deepEqual(fromBefore, session);
assert.deepEqual(session.economy, {
  coins: 0, stock: 0, items: [{ id: 'gear', kind: 'gear' }],
  outcomes: { ore: 'applied', other: 'rejected', gear: 'applied', competing: 'rejected' },
});
let after = structuredClone(session);
enqueueEconomy(after, { kind: 'buy', id: 'ore', frame: 2 });
advanceFrame(after);
advanceFrame(session);
assert.deepEqual(after, session);
assert.equal(session.rng, 1083814273); // Only the opening attack advances RNG.
console.log('R1: purchase, crafting, competition, duplicate and frame restore passed');

for (let safety = 0; safety < 20 && session.result === 'running'; safety++) advanceFrame(session);
assert.equal(session.session.phase, 'between');
const beforeTransition = structuredClone(session);
const inherited = structuredClone({ items: session.economy.items, coins: session.economy.coins, rng: session.rng, cooldown: session.attackReadyAt });
assert.equal(enterEndless(session), true);
assert.equal(enterEndless(beforeTransition), true);
assert.deepEqual(beforeTransition, session);
assert.equal(enterEndless(session), false);
const cooling = structuredClone(session);
const ready = cooling.attackReadyAt;
advanceFrame(cooling);
assert.ok(!cooling.log.some(line => line.startsWith(`${ready - 1} 自动攻击`)));
advanceFrame(cooling);
assert.ok(cooling.log.some(line => line.startsWith(`${ready} 自动攻击`)));
assert.deepEqual({ items: session.economy.items, coins: session.economy.coins, rng: session.rng, cooldown: session.attackReadyAt }, inherited);
after = structuredClone(session);
assert.equal(enterEndless(after), false);
for (let safety = 0; safety < 100 && session.result === 'running'; safety++) {
  advanceFrame(session);
  advanceFrame(after);
}
assert.deepEqual(after, session);
assert.deepEqual([session.session.phase, session.session.wave, session.session.lastWave], ['ended', 6, 5]);
assert.equal(session.pending.length, 0);
const terminal = structuredClone(session);
advanceFrame(terminal);
assert.deepEqual(terminal, session);
const restarted = newSession('new-review');
assert.notEqual(restarted.session.id, session.session.id);
assert.deepEqual([restarted.frame, restarted.session.wave, restarted.economy.coins], [0, 1, 3]);
console.log('R2: inherited state, five endless waves, wave six loss, terminal restore and fresh session passed');
