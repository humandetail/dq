// Keep gameplay evidence separate from the source-rule object's readiness.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { cards, configuration, contentVersion, items, ordinaryGoods, recipes, workerTowers,
  chestKeys } from "../src/game/m2/content.ts";
import { heroSpells } from "../src/game/m2/hero-spells.ts";
import { towerSpells } from "../src/game/m2/tower-spells.ts";
import itemRules from "../docs/rules/item-effect-coverage.json" with { type: "json" };

const match = name => `src/game/m2/match.ts#${name}`;
const combat = name => `src/game/m2/combat.ts#${name}`;
const range = (first, last) => Array.from({ length: last - first + 1 }, (_, index) =>
  "N" + String(first + index).padStart(3, "0"));
const skills = new Map();
function skillsAt(ids, entry, uncovered, evidence = []) {
  for (const id of ids) skills.set(id, { entry, uncovered, evidence });
}
const ordinarySpells = [...new Set([...towerSpells.values()].flatMap(spells => spells.map(spell => spell.id)))];
skillsAt(ordinarySpells, match("resolveTowerSpell"), "需逐级核对目标、控制和手动施法。");
skillsAt(["N001", "N002"], match("fireWeapon"), "已验手动指定、独立开关、锁定加伤、追踪和闪避；通用 ATTACKED／EFFECT 跨装备联动及完整正常浏览器流程待验。",
  ["test/m2.test.mjs#N001 and N002"]);
skillsAt(range(41, 44), match("resolveTowerSpell"), "已验四档双灵兽、实际来源、无召唤塔归因、反馈及到期；独立移动、寻路与目标控制待补。",
  ["test/m2.test.mjs#N041 through N044"]);
skillsAt(range(45, 47), match("emitSwordRain"), "已验三档伤害配置、锁定场地、120 枚上限、停止、魔免排除与分块恢复；动态单位接触、独立地物和完整 B03 联动仍待验。",
  ["test/m2.test.mjs#N045 through N047"]);
skillsAt(["N116"], match("resolveTowerSpell"), "未实测正式对局的全 Buff 组合、显示及目标交互。",
  ["test/m2.test.mjs#N116 commits the target at effect time"]);
skillsAt(Object.keys(heroSpells), match("finishHeroSpell"), "需逐目标核对施法、载体、神杖、来源分派及临时状态。");
skillsAt(["A019", "A020"], match("finishHeroSpell"), "已确认正常局施法；各目标、等级、神杖及伤害分派待核。",
  ["docs/evidence/m2-core-11/ssr-i502-normal.json"]);
skillsAt(["A041", "A042"], match("finishHeroSpell"), "已确认正常局施法；各目标、等级、神杖及伤害分派待核。",
  ["docs/evidence/m2-core-11/ssr-i503-normal.json"]);
skillsAt(["A094"], match("createSerpentWards"), "待验神杖换型、全部契约装备和召唤者移除。",
  ["test/m2.test.mjs#Shadow Shaman casts eight independent wards"]);
skillsAt(["A067", "A068", "A069", "A148", "A149"], match("startWeapon"), "待验手动及形态相关联动。");
skillsAt(["A021", "P000", "N159"], match("damageEnemy"), "待验完整伤害阶段和合法来源分派。");
skillsAt(["A153"], match("attackAura"), "待验多来源、形态和撤销。");
skillsAt(["A040"], match("fireWeapon"), "自动附伤、开关及手动指定已接入；还需正常局验证逐等级的实际伤害、耗蓝及其他来源组合。");
skillsAt(["T000", "T101"], combat("effectiveAttributes"), "待验各装备、变形和跨波组合。");
skillsAt(range(3, 5), match("applyWeaponDamage"), "待验抵抗皮肤和各类目标适配。");
skillsAt(range(7, 11), match("fireWeapon"), "待验装备副箭与攻击生效顺序。");
skillsAt(range(17, 19), match("applyWeaponDamage"), "召唤施法载体和完整射程、目标适配待核。");
skillsAt(range(20, 22), match("finishWeapon"), "独立世界物体交互待补。");
skillsAt(range(23, 26), match("applyWeaponDamage"), "待验全部目标及与其他暴击的交互。");
skillsAt([...range(27, 30), "N072"], combat("criticalMultipliers"), "待验全暴击组合、命中与随机消费。");
skillsAt(["N031"], match("canSeeEnemy"), "检测已影响索敌，界面视野与相关道具待补。");
skillsAt(range(48, 53), combat("weapons"), "按规则仅依赖原武器字段，仍需逐对象验证。");
skillsAt(range(54, 60), match("damageEnemy"), "完整随机消费、子事件顺序及联动待验。");
skillsAt([...range(61, 63), "N088"], match("startWeapon"), "进行中攻速重计时及合法触发时机待补。");
skillsAt(range(64, 67), combat("weapons"), "按规则仅依赖原武器字段，仍需逐对象验证。");
skillsAt(range(68, 71), match("dragonCrush"), "待验原始攻速、来源和伤害分派组合。");
skillsAt(range(127, 131), match("tickImmolation"), "待验完整目标准入和与装备灼烧并存。");
skillsAt([...range(160, 164), "T292", "T293", "T294", "T295", "T296"], match("applyWeaponDamage"), "待验减益覆盖和全部目标抗性。");

const skillRows = new Map();
const formRows = [];
for (const line of [...cards.values(), ...workerTowers.values()]) {
  for (const form of line.forms) formRows.push({ root: line.root, id: form.id, unlock: form.unlock, helper: form.helper,
    rule: "docs/rules/skin-and-transformation.md", entry: form.id === "G059" ? match("chooseSkin") : null,
    uncovered: "未闭合本期换型、撤销、冷却和存档。", evidence: form.id === "G059" ? ["test/m2.test.mjs#Q20 transforms"] : [] });
  for (const unit of [...line.levels, ...line.forms]) for (const binding of unit.bindings) {
    const row = skillRows.get(binding.skillId) ?? {
      id: binding.skillId, name: binding.name, units: [],
      rules: binding.rules.map(rule => "docs/rules/" + rule),
      ...(skills.get(binding.skillId) ?? { entry: null, uncovered: "暂无确认的运行入口。", evidence: [] }),
    };
    if (!row.units.includes(unit.id)) row.units.push(unit.id);
    skillRows.set(row.id, row);
    if (unit.id === "G059" && ["A067", "A068"].includes(binding.skillId)) {
      const actual = binding.skillId === "A067" ? "A148" : "A149";
      skillRows.set(actual, { ...row, id: actual, units: ["G059"], ...skills.get(actual), evidence: ["test/m2.test.mjs#Q20 transforms"] });
    }
  }
}
const itemEntry = new Map();
for (const [ids, entry, uncovered] of [
  [["i104", "i198", "i209", "i217", "i228", "i269", "i270"], match("attackAura"), "光环、回蓝或减甲已部分接入，须按挂载逐条验证。"],
  [["i135","i136","i137","i138","i276"], match("applyEquipmentBurn"), "覆盖装备灼烧，取得、额外能力及独立时钟需复验。"],
  [["i173","i177"], match("equipmentLightning"), "连续事件、等级和完整来源分派待核。"],
  [["i186","i188"], match("applyWeaponDamage"), "副武器及强弱覆盖组合待核。"],
  [["i204","i282"], match("triggerEquipmentVolley"), "载体时序与源字段完整联动待核。"],
  [["i132","i134","i263"], match("damageEnemy"), "分别已接部分伤害修正，完整武器触发和属性交接待核。"],
  [["i193","i194","i195","i196"], match("useNecromancy"), "手动和自动召唤已接入，完整附属来源、特效及装备组合待验。"],
  [["i238", "i326"], match("useRestoration"), "借还／回血以外的法力回复已接入，源附属效果及持续中的驱散组合待验。"],
  [["i310"], match("finishHeroSpell"), "部分入选英雄的神杖分支运行，通用授予、撤销及换型待补。"],
  [["i330","i332"], match("finishPickup"), "仅部分背包形态规则，双向切换及成长未闭合。"],
  [["i278"], match("useWorkerItem"), "现有清怪和无杀手终态须按正式 A11 复验。"],
  [["i256"], match("useWorkerItem"), "已接定向、冷却、收入和夏6，正式商店与刷新流程待验。"],
  [["i127","i128"], match("execute"), "经验书已运行，仍须验资格、目标和续档组合。"],
  [["i261","i423"], match("deliverItem"), "即时购买已运行，其他合法取得或重复结算待验。"],
  [["i131","i133","i262"], match("forgeSword"), "已接炼魂与任务，正式 A18 刷新路径待验。"],
  [["i401","i402","i403","i404","i414"], match("useWorkerItem"), "开箱及 dropDeathChest 死亡箱钥掉落已接入；逐档正常取得、开箱和浏览器刷新待验。"],
  [["i266"], match("buySpecial"), "正式三阶段后购买、重新确认库存及刷新待验。"],
  [["i265"], match("finishPickup"), "夹具中已验证 i266 与 i308 合成，完整正常经济与实战装备效果待验。"],
]) for (const id of ids) itemEntry.set(id, { entry, uncovered });
const statEntries = {
  "item-attributes/AIab": combat("effectiveAttributes"),
  "item-flat-attack/AIat": combat("flatAttack"),
  "item-attack-speed-batch-01/AIas": combat("equipmentAttackSpeed"),
  "item-regeneration-batch-01/AIrm": match("syncMana"),
  "item-resources-batch-01/AImm": match("syncMana"),
};
const sourceItems = new Map(itemRules.items.map(record => [record.id, record]));
const itemRows = [...items.values()].map(item => {
  const { id } = item;
  const source = sourceItems.get(id);
  assert.ok(source, id);
  let runtime = itemEntry.get(id);
  if (!runtime && (chestKeys.has(id) || Object.hasOwn(configuration.cardRolls, id) || id === "i004" || id === "i006")) {
    runtime = { entry: match("useWorkerItem"), uncovered: "可执行，仍须逐项验证取得、库存或充能以及掉落／持久化。" };
  }
  return {
    id, name: item.name, acquisition: item.sourceAcquisitionText, inOrdinaryShop: ordinaryGoods.has(id),
    ingredients: recipes.get(id) ?? [],
    rules: [...new Set([...item.effectRules.map(rule => "docs/rules/" + rule + ".md"),
      ...(["i401","i402","i403","i404","i414"].includes(id) ? ["docs/rules/workbook-coverage-readiness.md"] : [])])],
    ...runtime,
    components: source.components.map(component => {
      const entry = component.kind === "recipe" ? match("finishPickup") :
        statEntries[`${component.rule}/${component.code}`] ?? null;
      return { type: component.kind, source: component.path ?? component.entry ?? component.results,
        rule: component.rule, entry, uncovered: entry ? "需逐对象验收。"
          : runtime ? "整件存在运行入口，此组件须独立验收。" : "暂无确认的组件运行入口。" };
    }),
    uncovered: runtime?.uncovered ?? "除所列组件与生命周期之外，整件效果待核。",
    evidence: id === "i196" ? ["test/m2.test.mjs#Max Necromancy uses live gear"]
      : id === "i256" ? ["test/m2.test.mjs#i256 uses a live selected target"]
      : ["i131","i132","i133","i134","i262","i263","i404","i414"].includes(id)
        ? ["test/m2.test.mjs#A18 fixture distinguishes",
          ...(["i404", "i414"].includes(id) ? ["test/m2.test.mjs#A18 real death dispatch"] : [])] : ["i265","i266"].includes(id)
          ? ["test/m2.test.mjs#m523 reward book purchases once"] : [],
  };
});
assert.equal(itemRows.length, 202);
assert.equal(cards.size + workerTowers.size, 22);
const output = JSON.stringify({ contentVersion, scope: "m2-config-1", definitions: "入口按实际代码登记，全部条目保留待验范围。",
  skills: [...skillRows.values()].sort((a, b) => a.id.localeCompare(b.id)),
  dependencies: [{ ids: range(120, 122), units: ["b103", "b104", "b105", "b106"],
    rule: "docs/rules/creep-skill-family-next.md", entry: match("applyWeaponDamage"),
    evidence: ["test/m2.test.mjs#N041 through N044"], uncovered: "通用 B03 来源组合、全类目标和独立移动待验。" }],
  forms: formRows, items: itemRows }, null, 2) + "\n";
const destination = "docs/m2-runtime-coverage.json";
if (process.argv.includes("--check")) assert.equal(readFileSync(destination, "utf8"), output);
else writeFileSync(destination, output);
console.log(`${skillRows.size} skill IDs, ${itemRows.length} items, ${formRows.length} form entries`);
