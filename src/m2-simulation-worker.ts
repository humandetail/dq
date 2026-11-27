import { creditTime, drain, enqueue, eventInProgress, type Match } from "./game/m2/match.ts";
import type { OverBudgetSlice, RecordedInput, SimulationInput, SimulationOutput } from "./m2-simulation-protocol.ts";

const worker = globalThis as unknown as {
  onmessage: ((event: MessageEvent<SimulationInput>) => void) | null;
  postMessage: (message: SimulationOutput) => void;
};
const tasks = new MessageChannel();
let run: Match | undefined;
let matchId: string | undefined;
let clockThrough = 0;
let scheduled = false;
let observe = false;
let measure = false;
let maximumSlice = 0;
const overBudgetSlices: OverBudgetSlice[] = [];
let replay: readonly RecordedInput[] | undefined;
let nextInput = 0;
let hold: string | undefined;

function schedule() {
  if (scheduled) return;
  scheduled = true;
  tasks.port2.postMessage(null);
}

function advanceReplay(state: Match, shouldYield: () => boolean) {
  const target = state.clock.targetUs;
  let next = replay?.[nextInput];
  while (next && next.atUs < target && !shouldYield()) {
    state.clock.targetUs = next.atUs;
    if (drain(state, 32_000, shouldYield) !== "reached") break;
    if (!enqueue(state, { id: next.id, matchId: state.matchId, action: next.action })) {
      throw new Error("Recorded input rejected: " + next.id);
    }
    next = replay?.[++nextInput];
  }
  if (state.phase !== "running") return;
  state.clock.targetUs = Math.min(target, next?.atUs ?? target);
  if (!shouldYield()) drain(state, 32_000, shouldYield);
  if (state.phase === "running") state.clock.targetUs = target;
}

tasks.port1.onmessage = () => {
  scheduled = false;
  const state = run;
  if (!state) return;
  const started = performance.now();
  const distantTarget = state.clock.targetUs - state.queue.nowUs > 30_000_000;
  const deadline = started + (distantTarget ? 3 : 5);
  if (hold !== undefined) {
    if (eventInProgress(state)) {
      const target = state.clock.targetUs;
      state.clock.targetUs = state.queue.nowUs;
      drain(state, 32_000, () => performance.now() >= deadline);
      if (state.phase === "running") state.clock.targetUs = target;
    }
    if (eventInProgress(state)) {
      schedule();
    } else {
      worker.postMessage({ type: "held", requestId: hold, run: state });
      run = undefined;
    }
    return;
  }

  const fromUs = state.queue.nowUs;
  const nextEvent = measure ? state.queue.pending[0]?.payload.type : undefined;
  const completing = eventInProgress(state);
  if (state.phase === "running") {
    const shouldYield = () => performance.now() >= deadline || observe && completing && !eventInProgress(state);
    if (replay) advanceReplay(state, shouldYield);
    else drain(state, 32_000, shouldYield);
  }
  if (measure) {
    const elapsedMs = performance.now() - started;
    maximumSlice = Math.max(maximumSlice, elapsedMs);
    if (elapsedMs > 8) overBudgetSlices.push({ elapsedMs, fromUs, toUs: state.queue.nowUs, nextEvent, continuedEvent: completing });
  }
  if (observe && !eventInProgress(state)) {
    worker.postMessage({ type: "observation", run: state, realMs: clockThrough, ...(measure ? { maxSliceMs: maximumSlice } : {}),
      ...(overBudgetSlices.length ? { overBudgetSlices: overBudgetSlices.splice(0) } : {}),
      ...(replay ? { nextRecordedInput: nextInput } : {}) });
    maximumSlice = 0;
    observe = false;
  }
  if (state.phase === "running" && (eventInProgress(state) || state.queue.nowUs < state.clock.targetUs ||
      state.queue.pending[0]?.dueUs <= state.clock.targetUs)) schedule();
};

worker.onmessage = ({ data: input }) => {
  if (input.type === "load") {
    if (matchId !== input.run.matchId) {
      replay = undefined;
      nextInput = 0;
    }
    run = input.run;
    matchId = run.matchId;
    observe = false;
    maximumSlice = 0;
    overBudgetSlices.length = 0;
    clockThrough = input.realMs;
    hold = undefined;
    schedule();
    return;
  }
  if (!run || hold !== undefined) return;
  creditTime(run, input.realMs - clockThrough);
  clockThrough = input.realMs;
  switch (input.type) {
    case "observe":
      observe ||= input.capture;
      measure = input.measure;
      if (input.continuation) replay = input.continuation;
      break;
    case "clock":
      if (input.key === "paused") run.clock.paused = !run.clock.paused;
      else run.clock.speed = run.clock.speed === 4 ? 1 : 4;
      break;
    case "command":
      if (enqueue(run, input.command)) worker.postMessage({ type: "queued", id: input.command.id, actionType: input.command.action.type, dueUs: run.clock.targetUs + 1 });
      else worker.postMessage({ type: "rejected", id: input.command.id, actionType: input.command.action.type,
        atUs: run.queue.nowUs, terminal: run.phase !== "running" });
      break;
    case "hold":
      hold = input.requestId;
      break;
  }
  schedule();
};
