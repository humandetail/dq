import { configuration, contentVersion, saveFormatVersion } from "./content.ts";

import { mapVersion } from "./map.ts";

export const evidenceVersions = {
  mapVersion,
  acceptanceVersion: configuration.evidencePolicy.acceptanceVersion,
  contentVersion,
  configVersion: configuration.version,
  saveFormatVersion,
};

export type RunEvidence = typeof evidenceVersions & {
  configSha256: string;
  sourceRevision: string;
  sourcePatchSha256?: string;
  buildSha256: string;
  deploymentUrl: string;
  seed: number;
  inputLogSha256: string;
  initialStateSha256: string;
};

type PeakLoad = {
  containmentPoints: number;
  alliedEntities: number;
  enemyEntities: number;
  summons: number;
  projectiles: number;
  effects: number;
  queuedEvents: number;
  snapshotBytes: number;
};

export type PeakEvidence = RunEvidence & {
  fixtureSha256: string;
  environment: {
    machine: string;
    os: string;
    browser: string;
    viewportCssPixels: [number, number];
    devicePixelRatio: number;
    displayHz: number;
    hardwareAcceleration: boolean;
    connectedToPower: boolean;
  };
  loadMetrics: PeakLoad;
} & (
  | { fixtureId: "PF01"; wave: number; lastBatch: number; enemyIds: number[]; nextCheckUs: number }
  | { fixtureId: "PF02"; challengeTemplate: "m523"; challengeUnitCount: 12; challengePointsPerUnit: 3;
      summonSources: ["H029", "i196", "i722"] }
  | { fixtureId: "PF03"; selection: "snapshotBytes" | "queuedEvents" | "entities"; sampledSeeds: number[] }
);
