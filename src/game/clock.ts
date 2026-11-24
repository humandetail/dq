import { advanceFrame, running, type FrameReport } from "./battle.ts";
import { frameMs } from "./content.ts";
import type { SaveSnapshot } from "./state.ts";

type Clock = SaveSnapshot["clock"];

export function newClock(): Clock {
  return { speed: 1, paused: false, pendingFrames: 0, remainderMs: 0 };
}

export function creditTime(snapshot: SaveSnapshot, elapsedMs: number) {
  if (!running(snapshot.state) || snapshot.clock.paused) return;
  const clock = snapshot.clock;
  const totalMs = clock.remainderMs + Math.max(0, elapsedMs) * clock.speed;
  clock.pendingFrames += Math.floor(totalMs / frameMs);
  clock.remainderMs = totalMs % frameMs;
}

export function drainFrames(snapshot: SaveSnapshot, limit: number, onFrame: (report: FrameReport) => void = () => {}) {
  const { state, clock } = snapshot;
  for (let processed = 0; processed < limit && clock.pendingFrames > 0 && running(state); processed++) {
    clock.pendingFrames--;
    const report = advanceFrame(state);
    if (!running(state)) {
      clock.pendingFrames = 0;
      clock.remainderMs = 0;
    }
    onFrame(report);
  }
}
