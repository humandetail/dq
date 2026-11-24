import { advanceTime, type Snapshot } from './battle.ts';

export type Clock = { speed: number; last: number; paused: boolean };

export function advanceClock(snapshot: Snapshot, clock: Clock, now: number) {
  const elapsed = Math.max(0, now - clock.last);
  clock.last = Math.max(now, clock.last);
  return !clock.paused && elapsed > 0 && advanceTime(snapshot, elapsed, clock.speed);
}

export function updateClock(snapshot: Snapshot, clock: Clock, now: number, speed: number, paused: boolean) {
  const attacked = advanceClock(snapshot, clock, now);
  clock.speed = speed;
  clock.paused = paused;
  snapshot.speed = speed;
  snapshot.paused = paused;
  return attacked;
}
