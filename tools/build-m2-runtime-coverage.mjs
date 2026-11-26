// Keep gameplay evidence separate from the source-rule object's readiness.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { cards, configuration, contentVersion, items, ordinaryGoods, recipes, workerTowers,
  chestKeys } from "../src/game/m2/content.ts";
import { heroSpells } from "../src/game/m2/hero-spells.ts";
import { towerSpells } from "../src/game/m2/tower-spells.ts";
import { enemySpells } from "../src/game/m2/enemy-effects.ts";
import { waves, welfareTemplates } from "../src/game/m2/waves.ts";
import { challengeTemplates } from "../src/game/m2/shops.ts";
import itemRules from "../docs/rules/item-effect-coverage.json" with { type: "json" };
import enemyRules from "../docs/rules/enemy-ability-coverage.json" with { type: "json" };

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
skillsAt(["N001", "N002"], match("fireWeapon"), "手动及自动各走对应回调，已验指定、开关、同包加伤、追踪和闪避。正式浏览器流程待验。",
  ["test/m2.test.mjs#N001 and N002"]);
skillsAt(range(41, 44), match("resolveTowerSpell"), "已验四档双灵兽、反馈、独立移动及指令恢复。待验全类目标、全部 B03 来源组合及最终候选。",
  ["test/m2.test.mjs#N041 through N044", "test/m2.test.mjs#a single wolf takes a routed move",
    "docs/evidence/m2-core-13/wolf-rain-browser.json"]);
skillsAt(range(45, 47), match("emitSwordRain"), "已验发射、停止、魔免、地面／建筑／debris 碰撞及分块恢复。场景弹道和爆炸接入，最终候选播放及完整 B03 联动待验。",
  ["test/m2.test.mjs#N045 through N047", "test/m2.test.mjs#sword rain hits enemy structures",
    "docs/evidence/m2-core-13/wolf-rain-browser.json"]);
skillsAt(["N116"], match("resolveTowerSpell"), "未实测正式对局的全 Buff 组合、显示及目标交互。",
  ["test/m2.test.mjs#N116 commits the target at effect time"]);
skillsAt(Object.keys(heroSpells), match("finishHeroSpell"), "需逐目标核对施法、载体、神杖、来源分派及临时状态。");
skillsAt(["A019", "A020"], match("finishHeroSpell"), "已确认正常局施法；各目标、等级、神杖及伤害分派待核。",
  ["docs/evidence/m2-core-13/ssr-normal.json"]);
skillsAt(["A041", "A042"], match("finishHeroSpell"), "已确认正常局施法；各目标、等级、神杖及伤害分派待核。",
  ["docs/evidence/m2-core-13/ssr-normal.json"]);
skillsAt(["A094"], match("createSerpentWards"), "待验神杖换型、全部契约装备和召唤者移除。",
  ["test/m2.test.mjs#Shadow Shaman casts eight independent wards", "test/m2.test.mjs#serpent contracts run inside B03"]);
skillsAt(["A151"], match("resolveMagicArrow"), "同刻护盾与独立回补已验证。逐档、目标及正式场景待验。",
  ["test/m2.test.mjs#A151 scepter arrow takes the first same-time shield"]);
skillsAt(["A067", "A148"], match("startWeapon"), "待验形态相关联动。");
skillsAt(["A069"], "src/game/m2/hero.ts#learnHeroSkill", "永久累计、换型和尺寸已接入；全量 A08 候选验收未完成。",
  ["test/m2.test.mjs#Q46 growth attack survives qualification downgrade"]);
skillsAt(["A068", "A149"], match("activateTreeGrab"), "手动和自动共用结算；仍需核对完整伤害分派、驱散及换型组合。",
  ["test/m2.test.mjs#manual self-buff settles without a target"]);
skillsAt(["A021", "N159"], match("damageEnemy"), "待验完整伤害阶段和合法来源分派。");
skillsAt(["P000"], "src/game/m2/hero.ts#learnHeroSkill", "实际 30 级学习授予 P200，伤害分派位置保持 ×1.4。正式取得与组合待验。",
  ["test/m2.test.mjs#P000 learning installs P200"]);
skillsAt(["A153"], match("attackAura"), "待验多来源、形态和撤销。");
skillsAt(["A040"], match("fireWeapon"), "手动采用技能射程，发射时复核并付蓝。手动箭优先，自动箭受有效腐蚀覆盖。正常局逐档及其他物品组合待验。",
  ["test/m2.test.mjs#H012 ranks drive arrow costs", "test/m2.test.mjs#H012 manual orb"]);
skillsAt(["T000", "T101"], combat("effectiveAttributes"), "待验各装备、变形和跨波组合。");
skillsAt(range(3, 5), match("applyWeaponDamage"), "待验抵抗皮肤和各类目标适配。");
skillsAt(range(7, 11), match("fireWeapon"), "待验装备副箭与攻击生效顺序。");
skillsAt(range(17, 19), match("advanceOrganicWave"), "定向验证连续接触、独立 q001、源塔回收、末端和读档。各档正式场景待验。",
  ["test/m2.test.mjs#N017 T038 hits at sweep contact"]);
skillsAt(range(20, 22), match("finishWeapon"), "地面与物品手动炮击、炮弹落地与同刻拾取已通过定向回归。最终界面、全量战斗联动待验。");
skillsAt(range(23, 26), match("applyWeaponDamage"), "待验全部目标及与其他暴击的交互。");
skillsAt([...range(27, 30), "N072"], combat("criticalMultipliers"), "待验全暴击组合、命中与随机消费。");
skillsAt(["N031"], match("canSeeEnemy"), "检测已影响索敌，界面视野与相关道具待补。");
skillsAt(range(48, 53), combat("weapons"), "按规则仅依赖原武器字段，仍需逐对象验证。");
skillsAt(range(54, 60), match("damageEnemy"), "两段各自抽样、同步子事件、实际来源及定向盾已验证。各档正式路径及 P11 组合待验。",
  ["test/m2.test.mjs#Q36 and Q37 each consume", "test/m2.test.mjs#N054 commits", "test/m2.test.mjs#N058 submits"]);
skillsAt(range(61, 63), match("beginTowerSpell"), "瞬发、实际蓝耗和冷却；同实体升级保留生效档位，重施替换。正式场景待验。");
skillsAt(["N088"], match("hasEnduranceAura"), "当前可达首档、闭合距离、同类不叠加、移速和进行中攻速重排已定向测试。正式场景待验。");
skillsAt(range(64, 67), combat("weapons"), "按规则仅依赖原武器字段，仍需逐对象验证。");
skillsAt(range(68, 71), match("dragonCrush"), "已验原始攻速为1、0及负数时的半径和子包结算顺序。各档正式场景待验。");
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
  [["i276", "i281"], match("useControlEquipment"), "自动指令复核实际装备，受控验证封印、返还和末日弹道。正式对局待验。"],
  [["i279"], match("triggerSpellEquipment"), "两次合格施法提交独立 T210 来源，已验回收后在途结算。完整波前及正式场景待验。"],
  [["i173","i177"], match("equipmentLightning"), "连续事件、等级和完整来源分派待核。"],
  [["i186","i188"], match("applyWeaponDamage"), "副武器及强弱覆盖组合待核。"],
  [["i204","i282"], match("triggerEquipmentVolley"), "载体时序与源字段完整联动待核。"],
  [["i132","i134","i263"], match("damageEnemy"), "分别已接部分伤害修正，完整武器触发和属性交接待核。"],
  [["i193","i194","i195","i196"], match("useNecromancy"), "手动和自动召唤已接入，完整附属来源、特效及装备组合待验。"],
  [["i238", "i326"], match("useRestoration"), "借还／回血以外的法力回复已接入，源附属效果及持续中的驱散组合待验。"],
  [["i310"], match("finishPickup"), "A154 已接取得、撤销和两段施法，A094/A095 槽标记已接。其他技能的辅助授予和全组合待验。"],
  [["i330", "i332"], match("tickDemonflame"), "手动双向切换、低血自动关闭、范围伤害和血能已接入。正常取得、死亡和恢复组合待验。"],
  [["i148"], match("syncTowerLife"), "固定生命贡献已写入共享生命计算，正式取得及移出待验。"],
  [["i206"], match("canSeeEnemy"), "塔、工人与能量圈持有时探测，验证 1100 闭圆、交接和丢弃撤销。正式整局与多个来源待验。"],
  [["i235"], match("execute"), "定点守卫、充能与到期已接入。实体承伤和正式场景待验。"],
  [["i258", "i259", "i260", "i264"], match("useDivineBook"), "形态、星级、返还与主要战斗贡献已接入。完整阶段、冷却、临时状态重叠待验。"],
  [["i312", "i313", "i314"], match("execute"), "指定英雄经验、独立冷却及续档已验证。正式合成取得待验。"],
  [["i318", "i319", "i320"], match("triggerAshHood"), "受控验证无目标积层、连续消费、存档及两段伤害。正式合成、转交及动画需复验。"],
  [["i218", "i220", "i327"], match("syncMana"), "击杀增长最大魔法，保持原有当前魔法。i327 与 P222 按 ENDCAST 顺序结算。逐件转交和正式取得待验。"],
  [["i325"], match("finishSnow"), "点地、自动选点、读档、完整秒数及实际停止时的冷却已定向验证。正式场景待验。"],
  [["i399"], match("buySpecial"), "已有每局一次刷新，库存事务与续局见引擎测试。"],
  [["i718", "i719", "i720", "i721", "i722", "i723"], match("applyRune"), "正常排程、地面拾取和六项效果已接，幻象生命承伤及全部正式触发待补。"],
  [["i278"], match("useWorkerItem"), "现有清怪和无杀手终态须按正式 A11 复验。"],
  [["i256"], match("useWorkerItem"), "已接定向、冷却、收入和夏6，正式商店与刷新流程待验。"],
  [["i127","i128"], match("execute"), "经验书已运行，仍须验资格、目标和续档组合。"],
  [["i261","i423"], match("deliverItem"), "即时购买已运行，其他合法取得或重复结算待验。"],
  [["i131","i133","i262"], match("forgeSword"), "已接炼魂与任务，正式 A18 刷新路径待验。"],
  [["i401","i402","i403","i404","i414"], match("useWorkerItem"), "开箱及 dropDeathChest 死亡箱钥掉落已接入；逐档正常取得、开箱和浏览器刷新待验。"],
  [["i266"], match("buySpecial"), "core-12 正常三阶段后购入已验收，最终候选的阶段、库存、刷新及使用仍待验。"],
  [["i265"], match("finishPickup"), "core-12 正常经济合成已验收，最终候选合成与装备实战效果仍待验。"],
]) for (const id of ids) itemEntry.set(id, { entry, uncovered });
const statEntries = {
  "item-attributes/AIab": combat("effectiveAttributes"),
  "item-flat-attack/AIat": combat("flatAttack"),
  "item-attack-speed-batch-01/AIas": combat("equipmentAttackSpeed"),
  "item-regeneration-batch-01/AIrm": match("syncMana"),
  "item-resources-batch-01/AImm": match("syncMana"),
  "item-resources-batch-01/AIml": match("syncTowerLife"),
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
    verification: "按游戏命令触发本项取得、入槽和每个效果。覆盖非法目标、实际费用与冷却、移出和快照恢复。",
    ingredients: recipes.get(id) ?? [],
    rules: [...new Set([...item.effectRules.map(rule => "docs/rules/" + rule + ".md"),
      ...(["i401","i402","i403","i404","i414"].includes(id) ? ["docs/rules/workbook-coverage-readiness.md"] : [])])],
    ...runtime,
    components: source.components.map(component => {
      const entry = component.kind === "recipe" ? match("finishPickup") :
        statEntries[`${component.rule}/${component.code}`] ?? null;
      return { type: component.kind, code: component.code, source: component.path ?? component.entry ?? component.results,
        rule: component.rule, entry, uncovered: entry ? "需逐对象验收。"
          : runtime ? "整件存在运行入口，此组件须独立验收。" : "暂无确认的组件运行入口。",
        status: entry ? "已实现待验" : "未实现" };
    }),
    uncovered: runtime?.uncovered ?? "除所列组件与生命周期之外，整件效果待核。",
    evidence: id === "i196" ? ["test/m2.test.mjs#Max Necromancy uses live gear"]
      : id === "i256" ? ["test/m2.test.mjs#i256 uses a live selected target"]
      : ["i131","i132","i133","i134","i262","i263","i404","i414"].includes(id)
        ? ["test/m2.test.mjs#A18 fixture distinguishes",
          ...(["i404", "i414"].includes(id) ? ["test/m2.test.mjs#A18 real death dispatch"] : [])] : ["i265","i266"].includes(id)
          ? ["test/m2.test.mjs#m523 reward book purchases once",
            "docs/evidence/m2-core-13/a17-normal-seed-14.json", "docs/evidence/m2-core-13/a17-browser.json"] : [],
  };
});
const enemyHosts = new Map();
for (const unit of [...waves, ...welfareTemplates, ...challengeTemplates]) {
  for (const id of unit.abilities ?? []) {
    const hosts = enemyHosts.get(id) ?? new Set();
    hosts.add(unit.unitId);
    enemyHosts.set(id, hosts);
  }
}
const runtimeByEnemyAbility = {
  N512: "spawn", N516: "startEnemyReaction", N521: "damageEnemy", N523: "ordinaryMiss", N524: "ordinaryMiss",
  N525: "damageEnemy", N533: "damageEnemy", N534: "spawn", N535: "consumeEnemySpellShield",
  N536: "damageEnemy", N573: "removeDeadEnemy", N574: "purgeEnemyDebuffs", N579: "purgeEnemyDebuffs",
  N582: "damageEnemy", N583: "damageEnemy", N584: "damageEnemy",
  N706: "startWeapon", N707: "startWeapon", N708: "startWeapon", N709: "damageEnemy",
  T013: "damageEnemy", T014: "damageEnemy", T015: "damageEnemy", T016: "damageEnemy", T017: "damageEnemy", T018: "damageEnemy",
  T044: "diseasePulseTargets", T045: "damageEnemy",
};
const enemySkills = [...enemyHosts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, hosts]) => {
  const source = enemyRules.abilities[id];
  const handler = Object.hasOwn(enemySpells, id) ? "finishEnemyReaction" : runtimeByEnemyAbility[id];
  return { id, hosts: [...hosts], entry: handler ? match(handler) : null, source: source?.readyEvidence ?? null,
    status: handler ? "已实现待验" : "未实现",
    uncovered: handler ? "逐波核对能力的目标、效果、来源、冷却、阶段撤销和读档。" : "尚无确认的运行处理器。",
    verification: "以对应正式模板触发本能力，核对其触发门槛、实际状态与恢复。",
    evidence: ["T044", "T045"].includes(id) ? ["test/m2.test.mjs#T044 pulses without damage"] :
      id === "N573" ? ["test/m2.test.mjs#m052 death marks nearby actual units"] :
      id === "N536" ? ["test/m2.test.mjs#N536 dispels frost above ten percent"] : [] };
});
const namedSubcases = new Map();
for (const [ids, behavior, entry, evidence] of [
  [["N001", "N002"], "手动选取、独立开关、前摇前锁定和物理弹道", "fireWeapon",
    ["test/m2.test.mjs#N001 and N002"]],
  [range(41, 44), "四档召唤及反馈，单体绕障、指定攻击、停止与到期", "moveWolf",
    ["test/m2.test.mjs#N041 through N044", "docs/evidence/m2-core-13/wolf-rain-browser.json"]],
  [range(45, 47), "三档发射、停止、单位掩码、弹道状态与局部恢复", "advanceSwordRain",
    ["test/m2.test.mjs#N045 through N047", "test/m2.test.mjs#sword rain hits enemy structures",
      "docs/evidence/m2-core-13/wolf-rain-browser.json"]],
  [["A019", "A020", "A041", "A042"], "对应 SSR 正常获取、完成建造与实际施法", "finishHeroSpell",
    ["docs/evidence/m2-core-13/ssr-normal.json"]],
  [["A040"], "手动箭的射程、有效出手与实际耗蓝", "fireWeapon", ["test/m2.test.mjs#H012 manual orb"]],
  [["A068", "A149"], "受控引擎下无目标手动施放、扣蓝、冷却共享、效果到期及快照恢复",
    "activateTreeGrab", ["test/m2.test.mjs#manual self-buff settles without a target"]],
  [["A069"], "第 25 级六次学习累计 540，失去资格剥级后保留，并进入实际武器光环基数",
    "fireWeapon", ["test/m2.test.mjs#Q46 growth attack survives qualification downgrade"]],
  [range(20, 22), "手动地面和地面物品炮击、闭合范围与拾取竞争的引擎行为",
    "finishWeapon", ["test/m2.test.mjs#N020–N022 manual fire", "test/m2.test.mjs#N020–N022 a targeted ground item"]],
  [range(61, 63), "共享攻速改变后，前后摇与冷却的剩余量和排序",
    "refreshWeaponTiming", ["test/m2.test.mjs#T03 gear changes", "test/m2.test.mjs#T03 a rate change"]],
]) for (const id of ids) namedSubcases.set(id, [{ status: "已验收", behavior, entry: match(entry), evidence }]);
for (const id of ["N001", "N002"]) namedSubcases.get(id).push({
  status: "已验收", behavior: "只在手动箭提交公共施法回调", entry: match("fireWeapon"),
  evidence: ["test/m2.test.mjs#N001 manual flame"],
});
assert.equal(itemRows.length, 202);
assert.equal(cards.size + workerTowers.size, 22);
const output = JSON.stringify({ contentVersion, scope: "m2-config-1",
  definitions: "状态针对本行剩余行为。已有执行入口的行为仍按验收证据登记。未实现包含尚未映射到确认入口的行为。",
  skills: [...skillRows.values()].sort((a, b) => a.id.localeCompare(b.id)).map(row => ({
    ...row, status: row.entry ? "已实现待验" : "未实现",
    subcases: namedSubcases.get(row.id) ?? [],
    verification: "逐档从已登记入口触发，验证自动／手动条件、目标、资源、冷却、组合及恢复。",
  })),
  dependencies: [{ ids: range(120, 122), units: ["b103", "b104", "b105", "b106"],
    rule: "docs/rules/creep-skill-family-next.md", entry: match("applyWeaponDamage"),
    evidence: ["test/m2.test.mjs#N041 through N044"], uncovered: "通用 B03 来源组合和全类目标待验。" }],
  enemySkills, forms: formRows, items: itemRows.map(row => ({ ...row,
    subcases: row.id === "i310" ? [{ status: "未实现", behavior: "通用实际能力授予、撤销及换型",
      rule: "docs/rules/scepter-lifecycle.md" }]
      : ["i330", "i332"].includes(row.id) ? [
        { status: "已验收", behavior: "受控引擎验证切槽、首拍自损、二拍伤害和恢复后的低血关闭",
          entry: match("tickDemonflame"), evidence: ["test/m2.test.mjs#Demonflame toggles"] },
        { status: "已实现待验", behavior: "正常取得、血能增长与转交/回收组合", rule: "docs/rules/item-final-batch-01.md" },
      ] : [],
    status: row.entry || row.components.some(component => component.entry) ? "已实现待验" : "未实现",
  })) }, null, 2) + "\n";
const destination = "docs/m2-runtime-coverage.json";
if (process.argv.includes("--check")) assert.equal(readFileSync(destination, "utf8"), output);
else writeFileSync(destination, output);
console.log(`${skillRows.size} skill IDs, ${itemRows.length} items, ${formRows.length} form entries`);
