import type { contentVersion, EnemyType, ItemType, Mode, Point, SiteId, TowerType, recipes, shop } from "./content";

export const saveFormatVersion = 1;

type InstanceId = number;
type CommandId = string;

export type PlayerAction =
  | { type: "build"; cardId: InstanceId; site: SiteId }
  | { type: "upgrade"; towerId: InstanceId }
  | { type: "draw" }
  | { type: "buy"; item: keyof typeof shop }
  | { type: "craft"; recipe: keyof typeof recipes; materialIds: InstanceId[] }
  | { type: "equip"; itemId: InstanceId; towerId: InstanceId }
  | { type: "overcharge"; towerId: InstanceId }
  | { type: "attack"; towerId: InstanceId; targetId: InstanceId }
  | { type: "enter-endless" }
  | { type: "restart" };

export type PlayerCommand = {
  matchId: string;
  id: CommandId;
  action: PlayerAction;
};

export type ScheduledCommand = PlayerCommand & {
  sequence: number;
  targetFrame: number;
};

export type CommandResult = { id: CommandId; sequence: number } & (
  | { ok: true; createdId?: InstanceId }
  | { ok: false; reason: "phase" | "missing" | "occupied" | "gold" | "capacity" | "stock" | "materials" | "max-level" | "range" | "cooldown" }
);

export type Tower = {
  id: InstanceId;
  type: TowerType;
  site: SiteId;
  level: number;
  attackReadyFrame: number;
  skillReadyFrames: Record<string, number>;
};

export type Enemy = {
  id: InstanceId;
  type: EnemyType;
  wave: number;
  position: Point;
  nextWaypoint: number;
  hp: number;
};

export type Item = {
  id: InstanceId;
  type: ItemType;
  owner: { type: "backpack" } | { type: "tower"; id: InstanceId };
};

export type Effect = {
  id: InstanceId;
  type: string;
  targetId: InstanceId;
  expiresFrame: number;
  magnitude: number;
};

export type BattleEvent = { targetFrame: number; sequence: number } & (
  | { type: "spawn"; wave: number; batchIndex: number }
  | { type: "expire-effect"; effectId: InstanceId }
  | { type: "damage"; sourceId: InstanceId; targetId: InstanceId; amount: number }
);

type MatchPhase =
  | { phase: "mainline"; mode: "mainline" }
  | { phase: "mainline-won"; mode: "mainline" }
  | { phase: "endless"; mode: "endless" }
  | { phase: "failed"; mode: Mode; containmentPoints: number };

export type MatchState = MatchPhase & {
  matchId: string;
  frame: number;
  modeStartFrame: number;
  currentWave: number;
  lastCompletedWave: number;
  lastScheduledWave: number;
  // Retain nonconsecutive completed waves until the contiguous prefix advances.
  waves: { number: number; remainingBatches: number; livingEnemies: number }[];
  towers: Tower[];
  enemies: Enemy[];
  gold: number;
  cards: { id: InstanceId; tower: TowerType }[];
  items: Item[];
  stock: Record<keyof typeof shop, number>;
  effects: Effect[];
  events: BattleEvent[];
  commands: ScheduledCommand[];
  results: CommandResult[];
  randomState: number;
  nextInstanceId: InstanceId;
  nextEventSequence: number;
  nextCommandSequence: number;
};

export type SaveSnapshot = {
  formatVersion: typeof saveFormatVersion;
  contentVersion: typeof contentVersion;
  revision: number;
  state: MatchState;
  clock: {
    speed: 1 | 4;
    paused: boolean;
    pendingFrames: number;
    remainderMs: number;
  };
};
