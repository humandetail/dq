// Refresh the runtime weapon projection after changing the M2 tower pool.
import { readFileSync, writeFileSync } from "node:fs";
import target from "../docs/m3-target-dependencies.json" with { type: "json" };
import { beastmasterBoars, beastmasterHawks, lycanFormRanks, towerLevels } from "../src/game/m2/content.ts";
import weapons from "../reference/map-6.25/units_unitweapons.json" with { type: "json" };
import unitChanges from "../reference/map-6.25/war3map.w3u.json" with { type: "json" };

const profiles = new Map();
let profile;
for (const line of readFileSync(new URL("../reference/map-6.25/units_campaignunitstrings.txt", import.meta.url), "utf8").split(/\r?\n/)) {
  const section = line.match(/^\[([^\]]+)\]$/);
  if (section) profiles.set(section[1], profile = {});
  const value = line.match(/^(Missilespeed|MissileHoming)=(.*)$/);
  if (value && profile) profile[value[1]] = value[2].split(",").map(Number);
}
const ordinaryTowerIds = Object.values(target.cards)
  .filter(card => card.rarity === "N")
  .flatMap(card => card.towerLine);
const ordinaryForms = Object.values(target.towerSkinForms)
  .filter(form => form.target && form.bases.some(id => ordinaryTowerIds.includes(id)))
  .map(form => form.target);
const towerIds = new Set([...towerLevels.keys(), ...Array.from({ length: 8 }, (_, rank) => "b" + (103 + rank)),
  ...ordinaryTowerIds, ...ordinaryForms, ...beastmasterHawks, ...beastmasterBoars,
  "b100", "b101", "b102", "b119", "b120", "b121", "b144", "b145", "b146", "b147", "b148", "b149", ...Array.from({ length: 6 }, (_, rank) => "n" + (255 + rank)), "b117", "b118", "b139", "b140", "b150", "b151", "b152", "b153", "b154", "b155", "q011", "q012", "b156", "b157", "b158", "b159", "b160", "b161", "n261", "n262", "n263", "n264", "n265", "n266", "q051"]);
const result = {};
for (const id of towerIds) {
  const row = weapons.find(entry => entry.unitWeapID === id);
  const changes = unitChanges.find(entry => (entry.new.startsWith("\0") ? entry.old : entry.new) === id);
  const override = key => changes?.mods.find(mod => mod.key === key)?.value;
  const profile = profiles.get(id) ?? {};
  const wolfRank = lycanFormRanks.get(id);
  const boarRank = beastmasterBoars.indexOf(id);
  const min = row.minRange === 9_999_999 ? 0 : row.minRange ?? 0;
  const weaponsForTower = [];
  for (const slot of [1, 2]) {
    if (!((override("uaen") ?? row.weapsOn ?? 0) & (1 << (slot - 1)))) continue;
    const kind = row["weapTp" + slot];
    const speed = kind === "normal" ? 0 : override(`ua${slot}z`) ?? profile.Missilespeed?.[slot - 1] ?? profile.Missilespeed?.[0];
    if (kind !== "normal" && !(speed > 0)) throw new Error(`Missing missile speed for ${id} slot ${slot}`);
    weaponsForTower.push({
      slot, kind, speed, homing: (override("umh" + slot) ?? profile.MissileHoming?.[slot - 1] ?? 1) !== 0,
      attackType: row["atkType" + slot],
      targets: row["targs" + slot].split(","),
      acquire: row.acquire, min, max: row["rangeN" + slot], buffer: row["RngBuff" + slot] ?? 0,
      cooldown: id === "b139" || id === "b140" ? 1.3 : row["cool" + slot], windup: row["dmgpt" + slot] ?? 0, backswing: row["backSw" + slot] ?? 0,
      base: wolfRank && slot === 1 ? 429 + 100 * wolfRank : boarRank >= 0 ? 150 * (boarRank + 1) : row["dmgplus" + slot] ?? 0,
      dice: boarRank >= 0 ? 0 : row["dice" + slot] ?? 0, sides: boarRank >= 0 ? 0 : row["sides" + slot] ?? 0,
      ...(kind === "artillery" || kind === "msplash" ? {
        splash: [
          [row["Farea" + slot] ?? 0, 1],
          [row["Harea" + slot] ?? 0, row["Hfact" + slot] ?? 0],
          [row["Qarea" + slot] ?? 0, row["Qfact" + slot] ?? 0],
        ],
        splashTargets: (row["splashTargs" + slot] ?? "ground,structure").split(","),
      } : {}),
    });
  }
  result[id] = weaponsForTower;
}
writeFileSync(new URL("../src/game/m2/weapons.json", import.meta.url),
  "{\n" + Object.entries(result).map(([id, slots]) => `  "${id}": ${JSON.stringify(slots)}`).join(",\n") + "\n}\n");
