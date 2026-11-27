// Object IDs and Web values from creep-skill-family-001-053 and creep-skill-family-next.
type Radial = { kind: "stomp" | "clap" | "howl"; radius: number; amount: number; slow?: number };
type Boulder = { kind: "boulder"; range: number; amount: number; stun: number; heroStun: number; radius?: number };
type Wave = { kind: "wave"; range: number; radius: number; speed: number; amount: number; air: boolean };
type TowerSpell = { id: string; cost: number; cooldown: number; cast: number; search: number; effect:
  Radial | Wave | Boulder | { kind: "slow"; range: number; factor: number } |
  { kind: "bloodlust"; range: number; amount: number } | { kind: "purge"; range: number } | { kind: "wolves"; unit: string } |
  { kind: "sword-rain"; amount: number } | { kind: "frenzy"; amount: number } };

const spells = new Map<string, TowerSpell[]>();
function bind(unit: string, spell: TowerSpell) {
  spells.set(unit, [...(spells.get(unit) ?? []), spell]);
}

bind("n146", { id: "N006", cost: 90, cooldown: 6, cast: .5, search: 500,
  effect: { kind: "stomp", radius: 500, amount: 1800 } });
[410, 610, 1210, 2500].forEach((amount, index) => {
  bind("n" + (149 + index), { id: "N0" + (12 + index), cost: 50, cooldown: 8, cast: .5, search: 500,
    effect: { kind: "clap", radius: 500, amount, slow: index === 3 ? .3 : .2 } });
});
[600, 900, 1200, 1500, 2600].forEach((amount, index) => {
  const unit = "n" + (168 + index);
  bind(unit, { id: "N0" + (33 + index), cost: [50, 60, 70, 80, 90][index], cooldown: 10 - index, cast: .75, search: 700,
    effect: { kind: "wave", range: 900, radius: 300, speed: 1100, amount, air: true } });
  if (index >= 2) bind(unit, { id: "N0" + (36 + index), cost: index * 10, cooldown: 10, cast: .75, search: 700,
    effect: { kind: "howl", radius: 800, amount: (index - 1) * 30 } });
});
[500, 700, 900].forEach((amount, rank) => {
  bind("n" + (243 + rank), { id: "N" + (108 + rank), cost: 30, cooldown: 10 - rank, cast: .55, search: 700,
    effect: { kind: "wave", range: 900, radius: 300, speed: 1100, amount, air: true } });
});

for (let index = 0; index < 5; index++) {
  bind("n" + (250 + index), { id: "N" + (111 + index), cost: 30 + index * 5, cooldown: 8, cast: .5, search: 700,
    effect: { kind: "wave", range: 900, radius: 300, speed: 1050, amount: 75, air: false } });
}

bind("n254", { id: "N116", cost: 30, cooldown: 6, cast: .5, search: 700,
  effect: { kind: "purge", range: 800 } });

for (let index = 0; index < 3; index++) {
  bind("n" + (183 + index), { id: "N06" + (1 + index), cost: 30 + index * 10,
    cooldown: 10, cast: 0, search: 0, effect: { kind: "frenzy", amount: [.2, .4, .6][index] } });
}

for (let index = 0; index < 4; index++) {
  const unit = "n" + (173 + index);
  if (index > 0) bind(unit, { id: "N0" + (44 + index), cost: index === 3 ? 50 : 100,
    cooldown: index === 3 ? 12 : 15, cast: .5, search: 600,
    effect: { kind: "sword-rain", amount: [240, 360, 800][index - 1] } });
  bind(unit, { id: "N0" + (41 + index), cost: [40, 45, 55, 60][index], cooldown: 22, cast: .5, search: 0,
    effect: { kind: "wolves", unit: "b" + (103 + index) } });
}

for (let index = 0; index < 3; index++) {
  bind("n" + (199 + index), { id: "N0" + (76 + index), cost: 0, cooldown: 8, cast: .47, search: 700,
    effect: { kind: "slow", range: 700, factor: [.8, .6, .4][index] } });
  bind("n" + (202 + index), { id: "N0" + (79 + index), cost: 0, cooldown: 8, cast: .47, search: 700,
    effect: { kind: "boulder", range: 700, amount: [400, 500, 600][index], stun: index + 1, heroStun: index ? 1 : .5 } });
}
for (let index = 0; index < 4; index++) {
  bind("n" + (205 + index), { id: "N0" + (82 + index), cost: 0, cooldown: 8, cast: .47, search: 700,
    effect: { kind: "boulder", range: index === 3 ? 800 : 700, radius: 200 + 100 * index,
      amount: [100, 300, 500, 1500][index], stun: index === 3 ? 3 : 1, heroStun: index === 3 ? 2 : .4 } });
}
bind("n208", { id: "N087", cost: 0, cooldown: 10, cast: .47, search: 800,
  effect: { kind: "clap", radius: 1000, amount: 4500, slow: .5 } });

[.2, .3, .4, .5].forEach((amount, index) => {
  bind("n" + (214 + index), { id: "N0" + (89 + index), cost: 30, cooldown: 2, cast: .56, search: 1000,
    effect: { kind: "bloodlust", range: 1000, amount } });
});

export const towerSpells = spells;

export const pointTowerSpell = (id: string) => /^N0(?:82|83|84|85)$/.test(id) || /^N(?:108|109|110)$/.test(id);
export const pointTowerSpellRange = (id: string) => /^N0(?:82|83|84)$/.test(id) ? 700 : 800;
