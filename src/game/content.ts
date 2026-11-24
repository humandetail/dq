export type Point = { x: number; y: number };
export type Mode = "mainline" | "endless";

export const contentVersion = "m1-1";
export const frameMs = 100;
export const framesPerSecond = 1000 / frameMs;

export const map = {
  id: "lamp-basin",
  name: "灯湾环堤",
  containment: { minX: -6, maxX: 6, minY: -4, maxY: 4, limit: 24 },
  // Enemies loop from the last waypoint back to the first until defeated.
  route: [
    { x: -6, y: 4 },
    { x: 6, y: 4 },
    { x: 6, y: -4 },
    { x: -6, y: -4 },
  ],
  buildSites: {
    west: { x: -3, y: 0 },
    east: { x: 3, y: 0 },
    north: { x: 0, y: 2 },
    south: { x: 0, y: -2 },
  },
} as const;

export function isInsideContainment({ x, y }: Point): boolean {
  const { minX, maxX, minY, maxY } = map.containment;
  return x >= minX && x <= maxX && y >= minY && y <= maxY;
}

export const towers = {
  beacon: {
    name: "浮标灯",
    buildGold: 25,
    levels: [
      { damage: 16, range: 8, attackIntervalFrames: 8 },
      { damage: 26, range: 8, attackIntervalFrames: 7, upgradeGold: 24 },
    ],
  },
  prism: {
    name: "折光台",
    buildGold: 25,
    levels: [
      { damage: 29, range: 7, attackIntervalFrames: 12 },
      { damage: 42, range: 8, attackIntervalFrames: 10, upgradeGold: 30 },
    ],
  },
} as const;

export const enemies = {
  skimmer: { name: "潮沫", hp: 24, speed: 2, containmentPoints: 1, bountyGold: 4 },
  shell: { name: "盐壳", hp: 72, speed: 1.4, containmentPoints: 2, bountyGold: 7 },
} as const;

export type SiteId = keyof typeof map.buildSites;
export type TowerType = keyof typeof towers;
export type EnemyType = keyof typeof enemies;

export const economy = {
  openingGold: 100,
  openingCard: "beacon" satisfies TowerType,
  cardCapacity: 6,
  backpackCapacity: 8,
  drawGold: 20,
  drawPool: ["beacon", "prism"] satisfies readonly TowerType[],
} as const;

export const items = {
  lens: { name: "磨砂镜片" },
  filament: { name: "导光丝" },
  amplifier: { name: "聚光环", bonusDamage: 8 },
} as const;

export type ItemType = keyof typeof items;

export const shop = {
  lens: { gold: 10, stock: { mainline: 3, endless: 3 } },
  filament: { gold: 10, stock: { mainline: 3, endless: 3 } },
} as const satisfies Partial<Record<ItemType, { gold: number; stock: Record<Mode, number> }>>;

export const recipes = {
  amplifier: { ingredients: ["lens", "filament"], gold: 8 },
} as const satisfies Partial<Record<ItemType, { ingredients: readonly ItemType[]; gold: number }>>;

export type Wave = {
  number: number;
  // Relative to the frame that opened this mode.
  startFrame: number;
  hpMultiplier: number;
  batches: readonly {
    offsetFrames: number;
    enemy: EnemyType;
    count: number;
  }[];
};

const mainlineCounts = [
  [6, 0], [8, 1], [9, 2], [10, 2], [11, 3],
  [12, 3], [12, 4], [13, 4], [14, 5], [14, 6],
] as const;

export const mainline = {
  difficulty: "standard",
  waves: mainlineCounts.map(([skimmers, shells], index): Wave => ({
    number: index + 1,
    startFrame: (20 + index * 60) * framesPerSecond,
    hpMultiplier: 1 + index * 0.08,
    batches: [
      { offsetFrames: 0, enemy: "skimmer", count: Math.ceil(skimmers / 2) },
      { offsetFrames: 15 * framesPerSecond, enemy: "skimmer", count: Math.floor(skimmers / 2) },
      ...(shells > 0 ? [{ offsetFrames: 30 * framesPerSecond, enemy: "shell" as const, count: shells }] : []),
    ],
  })),
} as const;

export function endlessWave(number: number): Wave {
  if (!Number.isSafeInteger(number) || number < 1 || !Number.isSafeInteger((20 + (number - 1) * 45) * framesPerSecond)) {
    throw new RangeError("无效的无尽波次编号");
  }

  return {
    number,
    startFrame: (20 + (number - 1) * 45) * framesPerSecond,
    hpMultiplier: 1.5 + (number - 1) * 0.35,
    batches: [
      { offsetFrames: 0, enemy: "skimmer", count: 6 + Math.floor((number - 1) / 2) },
      { offsetFrames: 15 * framesPerSecond, enemy: "shell", count: 2 + Math.floor((number - 1) / 3) },
    ],
  };
}
