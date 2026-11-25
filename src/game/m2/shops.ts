import challenges from "../../../docs/rules/challenge-spawns.json" with { type: "json" };
import balances from "../../../reference/map-6.25/units_unitbalance.json" with { type: "json" };
import units from "../../../reference/map-6.25/units_unitdata.json" with { type: "json" };
import waveSource from "../../../docs/rules/waves-data.json" with { type: "json" };
import { configuration } from "./content.ts";

const multiplier = waveSource.difficultyHpAndManaMultipliers[1];

export const challengeGoods = configuration.itemSeedGroups.challengeShop;
export const challengeTemplates = challenges.families.flatMap(({ name, templates, count, interval }, family) =>
  templates.map(({ points, abilities }, stage) => {
    const unitId = points.id;
    const balance = balances.find(row => row.unitBalanceID === unitId)!;
    const unit = units.find(row => row.unitID === unitId)!;
    return {
      unitId, name, family, stage, count, interval, points: points.fields.points,
      abilities: abilities.fields.abilList.split(","),
      hp: balance.HP! * multiplier, mana: (balance.manaN ?? 0) * multiplier, armor: balance.def ?? 0,
      radius: balance.collision ?? 1, speed: balance.spd ?? 0,
      layer: unit.movetp === "fly" ? "fly" as const : "ground" as const,
    };
  }));

export const mysteryWaves = [21, 26, 31, 36, 41, 46, 51, 52, 53, 54];
const mysteryGroups = [
  { weight: 25, ids: ["i305"] },
  { weight: 50, ids: ["i311", "i235"] },
  { weight: 60, ids: ["i321"] },
  { weight: 80, ids: ["i309", "i307", "i315"] },
  { weight: 120, ids: ["i414", "i303", "i317", "i323", "i324", "i331"] },
];

export function drawMysteryStock(random: () => number) {
  const stock: Record<string, number> = {};
  for (let draw = 0; draw < 7; draw++) {
    let weight = Math.floor(random() * 335);
    const { ids } = mysteryGroups.find(group => (weight -= group.weight) < 0)!;
    const item = ids[Math.floor(random() * ids.length)];
    stock[item] = Math.min(4, (stock[item] ?? 0) + 1);
  }
  return stock;
}
