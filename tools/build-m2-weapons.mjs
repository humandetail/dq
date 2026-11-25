// Refresh the runtime weapon projection after changing the M2 tower pool.
import { readFileSync, writeFileSync } from "node:fs";
import { towerLevels } from "../src/game/m2/content.ts";
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
const result = {};
for (const id of [...towerLevels.keys(), ...Array.from({ length: 8 }, (_, rank) => "b" + (103 + rank))]) {
  const row = weapons.find(entry => entry.unitWeapID === id);
  const changes = unitChanges.find(entry => (entry.new.startsWith("\0") ? entry.old : entry.new) === id);
  const override = key => changes?.mods.find(mod => mod.key === key)?.value;
  const profile = profiles.get(id) ?? {};
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
      cooldown: row["cool" + slot], windup: row["dmgpt" + slot], backswing: row["backSw" + slot],
      base: row["dmgplus" + slot] ?? 0, dice: row["dice" + slot] ?? 0, sides: row["sides" + slot] ?? 0,
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
