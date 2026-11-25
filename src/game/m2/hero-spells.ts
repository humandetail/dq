// Mainline spell profiles from area-active-batch-01, hero-targeted-batch-02 and hero-spells-batch-03.
export const heroSpells = {
  A019: { range: 900, autoRange: 600, mana: [20, 40, 80, 120, 170, 200], cooldown: [3], damage: [500, 1000, 1500, 2000, 2500, 3000] },
  A020: { range: 1500, autoRange: 700, mana: [150, 200, 250, 300, 350, 450], cooldown: [18, 16, 14, 12, 10, 8], damage: [3000, 6000, 9000, 12000, 15000, 18000] },
  A042: { range: 1000, autoRange: 1000, mana: [0, 0, 0, 0, 0, 0], cooldown: [120], damage: [10_000_000] },
  A041: { range: 1200, autoRange: 1200, mana: [30, 40, 50, 60, 70, 80], cooldown: [12], damage: [0] },
  A170: { range: 800, autoRange: 900, mana: [10, 30, 50, 70, 90, 110], cooldown: [10], damage: [600, 900, 1200, 1500, 1800, 2200] },
  A172: { range: 1200, autoRange: 900, mana: [40, 80, 120, 160, 200, 240], cooldown: [12], damage: [500, 900, 1300, 1700, 2100, 2500] },
  A094: { range: 800, autoRange: 700, mana: [100, 115, 130, 145, 160, 175], cooldown: [18], damage: [0] },
  A093: { range: 600, autoRange: 550, mana: [20, 40, 60, 80, 100, 120], cooldown: [17, 16, 15, 14, 13, 12], damage: [100, 200, 300, 400, 500, 600] },
  A151: { range: 1000, autoRange: 850, mana: [20, 20, 40, 40, 60, 70], cooldown: [15], damage: [500, 1000, 1500, 2000, 2500, 3000] },
  A092: { range: 700, autoRange: 650, mana: [50, 70, 90, 110, 130, 150], cooldown: [7], damage: [530, 800, 1150, 1640, 2150, 2800] },
  A171: { range: 1500, autoRange: 900, mana: [30, 50, 70, 90, 110, 130], cooldown: [13, 12, 11, 10, 9, 8], damage: [1000, 1100, 1200, 1300, 1400, 1500] },
  A152: { range: 1000, autoRange: 1000, mana: [20, 35, 50, 65, 80, 95], cooldown: [14, 13, 12, 11, 10, 9], damage: [500, 1000, 1500, 2000, 2500, 3000] },
} as const;
export type HeroSpell = keyof typeof heroSpells;

export type SpellSweep = {
  towerId: number;
  name: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
  range: number;
  radiusStart: number;
  radiusEnd: number;
  amount: number;
  traveled: number;
  hit: number[];
  slow?: number;
  targets?: string[];
  budget?: number;
};
