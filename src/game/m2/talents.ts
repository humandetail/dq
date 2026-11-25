import source from "../../../docs/rules/worker-talents.json" with { type: "json" };

const names = ["卡片置换", "英雄无敌", "宝箱许愿", "财源滚滚", "卡片合成", "幸运机会", "神兵天降", "潜能爆发"];
export const talentChoices = Object.entries(source.selection.choiceMap).map(([choice, id], index) => ({
  choice, id, name: names[index],
}));
export const promotionWaves = source.selection.promotionWaves;
export const talentRules = new Map(source.records.map(record => [record.id, record.rules]));
