import type { Action, enqueue, Match } from "./game/m2/match.ts";

type Command = Parameters<typeof enqueue>[1];

export type RecordedInput = { id: string; atUs: number; action: Action };
export type OverBudgetSlice = { elapsedMs: number; fromUs: number; toUs: number; nextEvent?: string; continuedEvent: boolean };
export type SimulationInput =
  | { type: "load"; run: Match; realMs: number }
  | { type: "observe"; realMs: number; capture: boolean; measure: boolean; continuation?: readonly RecordedInput[] }
  | { type: "command"; realMs: number; command: Command }
  | { type: "clock"; realMs: number; key: "paused" | "speed" }
  | { type: "hold"; realMs: number; requestId: string };

export type SimulationOutput =
  | { type: "observation"; run: Match; realMs: number; maxSliceMs?: number; overBudgetSlices?: OverBudgetSlice[]; nextRecordedInput?: number }
  | { type: "queued"; id: string; actionType: Action["type"]; dueUs: number }
  | { type: "rejected"; id: string; actionType: Action["type"]; atUs: number; terminal: boolean }
  | { type: "held"; requestId: string; run: Match };
