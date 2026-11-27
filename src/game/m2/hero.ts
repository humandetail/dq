import experience from "../../../docs/rules/experience-sharing.json" with { type: "json" };
import baseline from "../../../docs/rules/web-baseline.json" with { type: "json" };
import type { DivineForm } from "./divine.ts";
import { towerLevels } from "./content.ts";

export const heroThresholds = baseline.rules.B02.tables1To30.cumulativeHeroLevelThresholds;
const maxLevel = heroThresholds.length;
const attributes = ["STR", "AGI", "INT"] as const;

export type Hero = {
  level: number;
  xp: number;
  points: number;
  ranks: Record<string, number>;
  paid: string[];
  talentAttributes?: number;
  divineForm?: DivineForm;
  growthBonus?: { attack: number; modelScale: number; learnedIn?: string };
  natural: Record<typeof attributes[number], number>;
};

function natural(templateId: string, level: number) {
  const growth = towerLevels.get(templateId)?.growth?.fields;
  if (!growth) throw new Error(`Missing hero growth data: ${templateId}`);
  return {
    STR: growth.STR.selectedValue + (level - 1) * growth.STRplus.selectedValue,
    AGI: growth.AGI.selectedValue + (level - 1) * growth.AGIplus.selectedValue,
    INT: growth.INT.selectedValue + (level - 1) * growth.INTplus.selectedValue,
  };
}

export function newHero(templateId: string): Hero | undefined {
  if (!towerLevels.get(templateId)?.growth) return;
  return { level: 1, xp: 0, points: 1, ranks: {}, paid: [], natural: natural(templateId, 1) };
}

const formSkillAliases: Record<string, Readonly<Record<string, string>>> = {
  G035: { A005: "A099" },
  G043: { A005: "A097" },
  G055: { A049: "A130" },
  G049: { A061: "A119", A062: "A121", A063: "A118" },
  G054: { A061: "A128" },
  G057: { A112: "A142" },
  G058: { A112: "A143" },
  G066: { A071: "A184" },
  G073: { A070: "A210", A071: "A211" },
  G077: { A010: "A239" },
  E023: { A010: "A239" }, E024: { A010: "A239" }, E025: { A010: "A239" },
  E026: { A010: "A239" }, E027: { A010: "A239" }, E028: { A010: "A239" },
};

export function learnableSkills(templateId: string) {
  const template = towerLevels.get(templateId);
  if (!template?.growth) return [];
  return template.growth.heroAbilList.flatMap(id => {
    const skill = template.bindings.find(entry => entry.skillId === id && entry.requiredHeroLevels);
    const alias = skill && formSkillAliases[templateId]?.[skill.skillId];
    return skill ? [alias ? { ...skill, skillId: alias } : skill] : [];
  });
}

export function learningLevel(hero: Hero, templateId: string, skillId: string) {
  return learnableSkills(templateId).find(skill => skill.skillId === skillId)
    ?.requiredHeroLevels?.[hero.ranks[skillId] ?? 0];
}

export function learnHeroSkill(hero: Hero, templateId: string, skillId: string) {
  const required = learningLevel(hero, templateId, skillId);
  if (required === undefined || hero.points < 1 || hero.level < required) return false;
  hero.points--;
  hero.ranks[skillId] = (hero.ranks[skillId] ?? 0) + 1;
  hero.paid.push(skillId);
  if (skillId === "A072") hero.natural.AGI += 50;
  if (skillId === "A225") {
    hero.natural.STR += 10 * hero.ranks.A225;
    hero.natural.AGI += 10 * hero.ranks.A225;
  }
  if (skillId === "P000") hero.divineForm ??= { id: "P200", stars: 1 };
  if (skillId === "A069") {
    const rank = hero.ranks[skillId];
    hero.growthBonus = { attack: (hero.growthBonus?.attack ?? 0) + 90, modelScale: growthScale(rank), learnedIn: templateId };
  }
  return true;
}

function growthScale(rank: number) {
  return (5 + 2 * rank) / 10;
}

export function restoreHeroGrowth(hero: Hero, templateId: string) {
  const rank = hero.ranks.A069 ?? 0;
  if (!hero.growthBonus && rank > 0) {
    hero.growthBonus = { attack: rank * 90, modelScale: growthScale(rank) };
  }
  if (hero.growthBonus) hero.growthBonus.learnedIn ??= templateId;
}

export function heroModelScale(hero: Hero | undefined, templateId: string) {
  return hero?.growthBonus ? hero.growthBonus.modelScale * ((hero.growthBonus.learnedIn ?? templateId) === "G059" ? 1.6 : 1) : 1;
}

export function addHeroExperience(hero: Hero, templateId: string, amount: number, hasQualification: () => boolean, onLevel?: () => void, beforeQualification?: () => void) {
  if (!Number.isSafeInteger(amount) || amount < 1 || hero.level === maxLevel) return;
  const growth = towerLevels.get(templateId)!.growth!.fields;
  hero.xp = Math.min(hero.xp + amount, heroThresholds[maxLevel - 1]);
  while (hero.level < maxLevel && heroThresholds[hero.level] <= hero.xp) {
    hero.level++;
    hero.points++;
    for (const attribute of attributes) hero.natural[attribute] += growth[`${attribute}plus`].selectedValue;
    beforeQualification?.();
    if (hero.level <= 20 || hasQualification()) {
      onLevel?.();
      continue;
    }
    const lost = hero.level - 20;
    hero.level = 20;
    hero.xp = heroThresholds[19];
    for (const attribute of attributes) hero.natural[attribute] -= lost * growth[`${attribute}plus`].selectedValue;
    const spentToRemove = Math.max(0, lost - hero.points);
    hero.points = Math.max(0, hero.points - lost);
    for (let index = 0; index < spentToRemove; index++) {
      const skill = hero.paid.pop();
      if (skill === undefined) break;
      hero.ranks[skill] = Math.max(0, (hero.ranks[skill] ?? 0) - 1);
    }
    onLevel?.();
    break;
  }
}

export function bookExperience(book: "i127" | "i128" | "i312" | "i313" | "i314", level: number) {
  if (level >= maxLevel) return 0;
  if (book === "i127") return 1400;
  if (book === "i312") return 2000;
  if (book === "i313") return 20000;
  return experience.variableBookAward.levels1To29[level - 1].scriptAmount;
}
