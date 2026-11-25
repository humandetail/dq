import experience from "../../../docs/rules/experience-sharing.json" with { type: "json" };
import baseline from "../../../docs/rules/web-baseline.json" with { type: "json" };
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

export function learnableSkills(templateId: string) {
  const template = towerLevels.get(templateId);
  if (!template?.growth) return [];
  return template.growth.heroAbilList.flatMap(id => {
    const skill = template.bindings.find(entry => entry.skillId === id && entry.requiredHeroLevels);
    return skill ? [skill] : [];
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
  return true;
}

export function addHeroExperience(hero: Hero, templateId: string, amount: number, hasQualification: () => boolean, onLevel?: () => void) {
  if (!Number.isSafeInteger(amount) || amount < 1 || hero.level === maxLevel) return;
  const growth = towerLevels.get(templateId)!.growth!.fields;
  hero.xp = Math.min(hero.xp + amount, heroThresholds[maxLevel - 1]);
  while (hero.level < maxLevel && heroThresholds[hero.level] <= hero.xp) {
    hero.level++;
    hero.points++;
    for (const attribute of attributes) hero.natural[attribute] += growth[`${attribute}plus`].selectedValue;
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

export function bookExperience(book: "i127" | "i128", level: number) {
  if (level >= maxLevel) return 0;
  return book === "i127" ? 1400 : experience.variableBookAward.levels1To29[level - 1].scriptAmount;
}
