import itemLifecycle from "../../../docs/rules/item-lifecycle.json" with { type: "json" };
import progression from "../../../docs/rules/hero-progression.json" with { type: "json" };
import summon from "../../../docs/rules/summon-and-delivery.json" with { type: "json" };
import economy from "../../../docs/rules/economy-data.json" with { type: "json" };
import configuration from "../../../docs/m2-configuration.json" with { type: "json" };
import itemIndex from "../../../docs/m2-item-index.json" with { type: "json" };
import qualifications from "../../../docs/rules/qualification-lifecycle.json" with { type: "json" };
import towerLifecycle from "../../../docs/rules/tower-lifecycle.json" with { type: "json" };
import skillSources from "../../../docs/rules/skill-source-coverage.json" with { type: "json" };
import skillReadiness from "../../../docs/rules/skill-readiness-review.json" with { type: "json" };
import skins from "../../../docs/rules/skin-and-transformation.json" with { type: "json" };
import rewardPacks from "../../../docs/rules/item-reward-packs-batch-01.json" with { type: "json" };
import sessions from "../../../docs/rules/session-and-task-state.json" with { type: "json" };

export { configuration };
export const contentVersion = "m2-core-30";
export const previousContentVersions = ["m2-core-2", "m2-core-3", "m2-core-4", "m2-core-5", "m2-core-6", "m2-core-7", "m2-core-8", "m2-core-9", "m2-core-10", "m2-core-11", "m2-core-12", "m2-core-13", "m2-core-14", "m2-core-15", "m2-core-16", "m2-core-17", "m2-core-18", "m2-core-19", "m2-core-20", "m2-core-21", "m2-core-22", "m2-core-23", "m2-core-24", "m2-core-25", "m2-core-26", "m2-core-27", "m2-core-28", "m2-core-29"] as const;
export const saveFormatVersion = 2;

const cardRoots: Record<string, string> = {
  i701: "n147", i706: "n141", i707: "n190", i710: "n249",
  i601: "n168", i602: "n173", i603: "n186", i604: "n177", i605: "n183",
  i606: "n156", i607: "n153", i608: "n164", i609: "n159",
  i564: "H021", i581: "H044", i569: "H029", i576: "H038",
  i503: "H012", i502: "H005",
};

const targetedCards: Record<string, string> = {
  i701: "c001", i706: "c002", i707: "c004", i710: "c003",
  i601: "c005", i602: "c006", i603: "c007", i604: "c008", i605: "c009",
  i606: "c010", i607: "c011", i608: "c012", i609: "c013",
};

const { directBuilds, upgradeEdges } = towerLifecycle.factsAndChoices;
export { directBuilds };
const upgrades = new Map(Object.entries(upgradeEdges).map(([edge, cost]) => {
  const [from, to] = edge.split("->");
  return [from, { to, ...cost }];
}));

const heroGrowth = new Map(progression.growthRecords.map(record => [record.unitId, record]));
const learning = new Map(progression.learningRequirements.map(record => [record.abilityId, record]));
export const summonCards = new Map(summon.cards
  .filter(card => Object.hasOwn(cardRoots, card.itemId) || Object.values(targetedCards).includes(card.itemId))
  .map(card => [card.itemId, card]));
const readiness = new Map(Object.entries(skillReadiness.skills));
const bindings = new Map<string, { skillId: string; name: string; origin: string; levelCap: string; rules: string[]; requiredHeroLevels?: number[] }[]>();
for (const skill of skillSources.skills) {
  const rules = readiness.get(skill.id)?.rules ?? [];
  for (const { towerId, skillName, origin, levelCap } of skill.workbookOccurrences) {
    const bound = bindings.get(towerId) ?? [];
    bound.push({ skillId: skill.id, name: skillName, origin, levelCap, rules,
      requiredHeroLevels: origin === "学习技能" ? learning.get(skill.id)?.requiredHeroLevels : undefined });
    bindings.set(towerId, bound);
  }
}

const towerObjects = new Map(economy.towers.map(template => [template.id, template]));

function towerLine(root: string) {
  const levels = [];
  for (let id: string | undefined = root; id !== undefined; id = upgrades.get(id)?.to) {
    const template = towerObjects.get(id);
    if (!template) throw new Error(`Missing M2 tower object ${id}`);
    levels.push({
      id, name: template.name, fields: template.fields, growth: heroGrowth.get(id),
      upgrade: upgrades.get(id), bindings: bindings.get(id) ?? [],
    });
  }
  const forms = skins.mappings.filter(form => form.sourceUnits.some(id => id === root)).map(form => ({
    id: form.targetUnit,
    sourceUnits: form.sourceUnits,
    unlock: form.unlockTech,
    transformation: form.effect,
    helper: form.anegHelper,
    growth: form.targetUnit === null ? undefined : heroGrowth.get(form.targetUnit),
    bindings: form.targetUnit === null ? [] : bindings.get(form.targetUnit) ?? [],
  }));
  return { root, name: levels[0].name.replace(/(?:Lv\d+)?<[^>]+>$/, ""), levels, forms };
}

export const cards = new Map(Object.entries(configuration.cardPools).flatMap(([rarity, pool]) =>
  pool.map(id => {
    const root = cardRoots[id];
    if (!root) throw new Error(`Missing M2 tower root for ${id}`);
    return [id, { id, rarity, targetedCard: targetedCards[id], ...towerLine(root) }] as const;
  }),
));
export const workerTowers = new Map(Object.keys(directBuilds).map(id => [id, towerLine(id)]));
export const footprintTowers = new Set([
  ...[...workerTowers.values()].flatMap(line => line.levels.map(level => level.id)),
  "n156", "n157", "n158",
]);
export const openingChoices = configuration.openingChoiceOrder;
export const towerRadius = 72;
export const towerLevels = new Map([...cards.values(), ...workerTowers.values()]
  .flatMap(line => line.levels.map(level => [level.id, level] as const)));
// Q20 opens the only skin of the selected M2 hero lines, f005.
export const firelordSkin = { choice: "S212", unlock: "k157", from: "H021", to: "G059" } as const;
export const firelordSkillSlots: Readonly<Record<string, string>> = { A067: "A148", A068: "A149" };
const firelord = towerLine(firelordSkin.to).levels[0];
towerLevels.set(firelord.id, {
  ...firelord,
  growth: firelord.growth && {
    ...firelord.growth,
    heroAbilList: firelord.growth.heroAbilList.map(id => firelordSkillSlots[id] ?? id),
  },
  bindings: firelord.bindings.map(binding => ({
    ...binding, skillId: firelordSkillSlots[binding.skillId] ?? binding.skillId,
  })),
});
export const cardTemplates = new Map([...cards.values()]
  .flatMap(card => card.targetedCard ? [[card.id, card], [card.targetedCard, card]] : [[card.id, card]]));
export const rarityPools = new Map(Object.entries(configuration.cardPools));


export const qualificationChains = new Map(qualifications.qualifications.map(({ id, requireUnit }) => {
  const provider = [...cards.values()].find(card => card.levels.at(-1)?.id === requireUnit);
  if (!provider?.targetedCard) throw new Error(`Missing M2 provider for ${id}: ${requireUnit}`);
  return [id, { id, requireUnit, card: provider.id, targetedCard: provider.targetedCard, levels: provider.levels }];
}));

export const items = new Map(itemIndex.items.map(item => [item.id, item]));
export const recipes = new Map(itemIndex.items.filter(item => item.materialsInSourceOrder)
  .sort((a, b) => a.recipeIndex! - b.recipeIndex!)
  .map(item => [item.id, item.materialsInSourceOrder!] as const));
export const itemFields = new Map(itemLifecycle.objectRows.filter(row => items.has(row.id))
  .map(row => [row.id, row.fields]));
export const itemChargeInheritance = new Set(itemLifecycle.tables.inheritance.ids);
export const itemExclusions = itemLifecycle.tables.exclusions.map(group => group.members);
export const itemChargeStacks = new Set(itemLifecycle.tables.stackMerge.ids);

export const chestPools = new Map(Object.entries(rewardPacks.pools)
  .filter(([id]) => configuration.itemSeedGroups.chestsAndKeys.includes(id))
  .map(([id, pool]) => {
    const override = Object.entries(configuration.chestOverrides).find(([key]) => key === id)?.[1];
    return [id, pool.orderedGroups.map((group, index) =>
      override?.groupIndex === index ? { weight: override.weight, entries: override.entries } : group,
    )] as const;
  }));

export const seasonTasks = {
  spring: Object.entries(sessions.seasonalTasks.spring.tasks)
    .filter(([id]) => !configuration.deferredSeasonTasks.spring.includes(Number(id))),
  summer: Object.entries(sessions.seasonalTasks.summer.tasks)
    .filter(([id]) => !configuration.deferredSeasonTasks.summer.includes(Number(id))),
};

export const openingResources = {
  gold: Number(sessions.initialResources.source[0][3]),
  populationLimit: Number(sessions.initialResources.source[1][2]),
  lumber: sessions.initialResources.webStartingLumber,
};

export const recycleRate = towerLifecycle.factsAndChoices.recycle.rate;

export const prayerBooks = (["i127", "i128"] as const).map(id => {
  const item = items.get(id)!;
  const source = economy.items.find(row => row.id === id)!.fields;
  return {
    id, name: item.name, gold: source.goldcost!.value, stock: source.stockMax!.value,
    replenishSeconds: source.stockRegen!.value, charges: source.uses!.value,
  };
});

export const chestKeys = new Map([["i411", "i401"], ["i412", "i402"], ["i413", "i403"], ["i414", "i404"]]);

export const lumberVouchers = new Map([["i261", 100], ["i423", 500]]);
export const waveRewards = [
  { shown: 1, claimable: 5, itemId: "i402" },
  { shown: 5, claimable: 15, itemId: "i002" },
  { shown: 15, claimable: 25, itemId: "i178" },
  { shown: 25, claimable: 35, itemId: "i258" },
  { shown: 35, claimable: 45, itemId: "i278" },
];

export const ordinaryGoods = new Map(itemIndex.items.flatMap(item => {
  const shop = item.sourceAcquisitionText.split("、")[0];
  if (!/^(饰品店|武器铺|制作书|成品商店|杂货铺|祈祷神庙)/.test(shop)) return [];
  const fields = economy.items.find(row => row.id === item.id)?.fields;
  if (!fields?.stockMax || (!fields.stockRegen && !lumberVouchers.has(item.id)) || (item.objectGold === null && item.objectLumber === null)) return [];
  return [[item.id, {
    id: item.id, name: item.name, shop, gold: item.objectGold ?? 0, lumber: item.objectLumber ?? 0,
    stock: fields.stockMax.value, replenishSeconds: fields.stockRegen?.value ?? 0,
  }] as const];
}));
