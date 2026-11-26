import source from "./weapons.json" with { type: "json" };
import rules from "../../../docs/rules/web-baseline.json" with { type: "json" };
import itemAttributes from "../../../docs/rules/item-attributes.json" with { type: "json" };
import attackSpeeds from "../../../docs/rules/item-attack-speed-batch-01.json" with { type: "json" };
import type { Hero } from "./hero.ts";
import items from "../../../docs/rules/item-flat-attack.json" with { type: "json" };
import balances from "../../../reference/map-6.25/units_unitbalance.json" with { type: "json" };
import units from "../../../reference/map-6.25/units_unitdata.json" with { type: "json" };
import type { Point } from "./map.ts";

export type Weapon = {
  slot: number;
  kind: string;
  speed: number;
  homing: boolean;
  attackType: string;
  targets: string[];
  acquire: number;
  min: number;
  max: number;
  buffer: number;
  cooldown: number;
  windup: number;
  backswing: number;
  base: number;
  dice: number;
  sides: number;
  splash?: number[][];
  splashTargets?: string[];
};

export type WeaponPhase = {
  workUs: number;
  recordedUs: number;
  dueUs: number;
  timerId: number;
};

export type WeaponTiming = {
  version: 1;
  slot: number;
  rawRate: number;
  cycleUs: number;
  pointUs: number;
  recoveryUs: number;
  cooldown?: WeaponPhase;
  windup?: WeaponPhase;
  backswing?: WeaponPhase;
};

export function weaponPhaseDelay(workUs: number, rate: number) {
  return workUs > 0 ? Math.max(1, Math.round(workUs / rate)) : 0;
}

export function weaponScheduleRate(rawRate: number) {
  return Math.min(5, Math.max(.2, rawRate));
}

export const weapons: Record<string, Weapon[]> = { ...source };
for (const base of [122, 132]) for (let rank = 0; rank < 6; rank++) {
  weapons["b" + (base + rank)] = [{
    slot: 1, kind: "missile", speed: 900, homing: true, attackType: "pierce",
    targets: ["ground", "structure", "debris", "air", "item", "ward"], acquire: 800, max: 800, min: 0, buffer: 0,
    cooldown: [1.5, 1.5, 1.4, 1.4, 1.3, 1.2][rank], windup: .3, backswing: .7,
    base: [40, 70, 100, 130, 160, 200][rank], dice: 0, sides: 0,
  }];
}
export const criticalMultipliers = new Map([["n165", 1.5], ["n166", 1.9], ["n167", 2.8], ["n191", 1.5], ["n192", 1.9], ["n193", 2.3], ["n194", 8]]);
export const equipmentAttackSpeed = new Map(attackSpeeds.items.map(row => [row.id, row.webPct / 100]));
const equipmentAttributes = new Map(itemAttributes.items.map(row => [row.id, row.webStats]));
export function effectiveAttributes(hero: Hero, items: string[]) {
  const growth = 10 * ((hero.ranks.T000 ?? 0) + (hero.ranks.T101 ?? 0)) + (hero.talentAttributes ?? 0);
  const result = { STR: hero.natural.STR + growth, AGI: hero.natural.AGI + growth, INT: hero.natural.INT + growth };
  for (const itemId of items) {
    const contribution = equipmentAttributes.get(itemId);
    if (!contribution) continue;
    result.STR += contribution[0];
    result.AGI += contribution[1];
    result.INT += contribution[2];
  }
  return result;
}

export const flatAttack = new Map(items.items.map(row => [row.id, row.webFlatAttack]));
export const unitBalance = new Map(balances.map(row => [row.unitBalanceID, row]));
export const unitTargetType = new Map(units.map(row => [row.unitID, row.targType]));
export type WeaponShot = {
  towerId: number;
  sourceTemplate: string;
  targetId?: number;
  objectId?: number;
  weapon: Weapon;
  raw: number;
  point: Point;
  destination: Point;
  summon?: { id: number; point?: Point; banner: boolean; skillId?: string; illusion?: true;
    contract?: { green: number; blue: number; baseAttack: number } };
  orbBonus?: number;
  frost?: number;
  artilleryMiss?: boolean;
  artilleryCritical?: { multiplier: number; sureHit: boolean; fixedBonus: number };
  corrosion?: number;
  attackEquipment?: string[];
  secondary?: true;
  fixedHitBonus?: number;
  divineCritical?: { chance: number; multiple: number };
};

const { positiveArmorCoefficient, negativeArmorExponentialBase } = rules.rules.B01;
const attackVsUnarmored: Record<string, number> = { chaos: 1, hero: 1.4, magic: 0.8, normal: 1.2, pierce: 1.1 };

function negativeArmorCorrection(armor: number) {
  if (armor <= -20) return 1.71;
  if (armor <= -15) return 1.61 + (-15 - armor) * 0.02;
  if (armor <= -9) return 1.43 + (-9 - armor) * 0.03;
  if (armor <= -5) return 1.27 + (-5 - armor) * 0.04;
  if (armor <= -2) return 1.12 + (-2 - armor) * 0.05;
  return 1 - armor * 0.06;
}

export function physicalDamage(raw: number, attackType: string, armor: number, welfare: boolean) {
  const armorFactor = armor >= 0
    ? 1 / (1 + positiveArmorCoefficient * armor)
    : (2 - negativeArmorExponentialBase ** -armor) / (welfare ? 1 : negativeArmorCorrection(armor));
  // The currently configured mainline and challenge templates all use NONE.
  return raw * attackVsUnarmored[attackType] * armorFactor;
}

export function killExperience(unitId: string) {
  const level = unitBalance.get(unitId)?.level;
  if (!level) return 0;
  const table = rules.rules.B02.tables1To30.normalUnitBaseKillXP;
  let amount = table[Math.min(table.length, level) - 1];
  for (let current = table.length + 1; current <= level; current++) amount = Math.floor(amount * 7 / 5 + 2 * current);
  return amount;
}

export function welfareGold(wave: number, damage: number) {
  if (damage <= 0) return 0;
  const rate = [0.55, 0.50, 0.45, 0.40, 0.34, 0.28, 0.22, 0.16, 0.12, 0.08, 0.04][Math.min(10, Math.floor((wave - 1) / 5))];
  const scale = 1000 + 2000 * (wave / 5 - 1) ** 2;
  let gold = Math.floor(damage / 23 * rate) + (1 - scale / (scale + damage)) * wave * 180;
  for (const [cap, fraction] of [[50_000, 0.6], [100_000, 0.3], [150_000, 0.1], [200_000, 0.03], [300_000, 0.01]]) {
    if (gold > cap) gold = cap + (gold - cap) * fraction;
  }
  return Math.floor(gold * 1.15);
}
