// Run from the repository with the locally audited Warcraft-format model library.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { generateMDX, model as mdx, parseMDX } from "war3-model";
import target from "../docs/m3-target-dependencies.json" with { type: "json" };
import audit from "../docs/rules/local-model-library.json" with { type: "json" };
import unitUI from "../reference/map-6.25/units_unitui.json" with { type: "json" };
import { beastmasterBoars, beastmasterHawks, cards, workerTowers } from "../src/game/m2/content.ts";
import { waves } from "../src/game/m2/waves.ts";
import { challengeTemplates } from "../src/game/m2/shops.ts";

const source = join(process.argv[2] ?? "/Users/laihanbin/Downloads/环界模型库", "assets");
const root = "src/assets/m2";
const manifest = JSON.parse(readFileSync(join(root, "models.json"), "utf8"));
const defaults = new Set(Object.keys(manifest));
const models = new Map();
const bindings = JSON.parse(readFileSync(join(root, "bindings.json"), "utf8"));
const originals = new Map(unitUI.map(unit => [unit.unitUIID, unit.file]));
const towerAliases = {
  n147: "Tauren Druid Final", n141: "HordeRider", n190: "Wolf_ghost", n249: "IllidanDark",
  n168: "BAIHU", n173: "heishuixuanshe", n186: "DragonSpawn", n177: "ForestTroll4",
  n183: "DragonSpawnArmoredDarkshade", n156: "GoblinAlchemist", n153: "DreneiPaladin",
  n164: "n006", n159: "n001", H005: "DiaoChan", H012: "ZhangHe", G059: "Tauren Druid Final",
};
const waveModels = [
  "m001", "ZhangLiao", "ZhaoYun", "ForestTroll4", "IllidanDark",
  "GoblinAlchemist", "DreneiPaladin", "BatRider", "HordeRider", "OrcMale3",
  "BatRider", "hulk", "H029", "Thrall__00", "Dragon_Priestess",
  "FelOrcNetherDrake", "heishuixuanshe", "Tauren Druid Final", "Dragon_Priestess", "HordeRider",
  "Thrall", "FaerieDragonBlue", "H044", "ZhaoYun", "Thrall",
  "DreneiPaladin", "H038", "DreneiPaladin", "Dragon_Priestess", "IllidanDark",
  "IllidanDark", "Wolf_ghost", "hulk", "DreneiPaladin", "Trollwuyi",
  "Tauren Druid Final", "OrcMalesama2", "WoWTaurenMale1", "WoWTaurenMale1", "IllidanDark",
  "HordeRider", "OrcMale3", "ZhangHe", "Dragon_Priestess", "H021",
  "H038", "DreneiPaladin", "IllidanDark", "GoblinAlchemist", "fireBird",
  "H038", "DragonSpawnArmoredDarkshade", "Tauren Druid Final", "WoWTaurenMale1", "hulk",
];
const challengeModels = ["heishuixuanshe", "OrcMale3", "Dragon_Priestess", "Trollwuyi", "heishuixuanshe",
  "WoWTaurenMale1", "ForestTroll4", "ZhangLiao"];

function asset(name, effect = false) {
  if (defaults.has(name)) return name;
  if (models.has(name)) return models.get(name);
  const entry = audit.models.find(model => model.name === name && model.format === "mdx" && (model.combatAnimationCandidate || name === "egg" || effect && model.textureReferences.every(texture => texture.resolved)));
  if (!entry) throw new Error("Missing audited asset " + name);
  const key = "library-" + entry.id;
  const directory = join(root, key);
  mkdirSync(directory, { recursive: true });
  const modelFilename = join(directory, "model.mdx");
  copyFileSync(join(source, entry.asset), modelFilename);
  let data = readFileSync(modelFilename);
  const parsed = parseMDX(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  if (name === "egg" || effect && parsed.Bones.length === 0 && parsed.Nodes.length === 0) {
    const pivot = new Float32Array(3);
    parsed.Bones.push({ Name: name === "egg" ? "Egg" : "ModelRoot", ObjectId: 0, Flags: mdx.NodeType.Bone, PivotPoint: pivot });
    parsed.PivotPoints.push(pivot);
    for (const mesh of parsed.Geosets) {
      mesh.VertexGroup.fill(0);
      mesh.Groups = [[0]];
      mesh.TotalGroupsCount = 1;
    }
    data = Buffer.from(generateMDX(parsed));
    writeFileSync(modelFilename, data);
  }
  let minimum = Infinity, maximum = -Infinity;
  for (const mesh of parsed.Geosets) for (let index = 2; index < mesh.Vertices.length; index += 3) {
    minimum = Math.min(minimum, mesh.Vertices[index]);
    maximum = Math.max(maximum, mesh.Vertices[index]);
  }
  const textures = {};
  for (const texture of entry.textureReferences) {
    if (textures[texture.path]) continue;
    if (!texture.asset.endsWith(".blp")) throw new Error("Expected BLP for " + name);
    const file = "texture-" + Object.keys(textures).length + ".blp";
    const filename = join(directory, file);
    copyFileSync(join(source, texture.asset), filename);
    textures[texture.path] = { file, sha256: sha(readFileSync(filename)) };
  }
  const loop = name === "egg" ? "Unnamed" : effect ?
    (parsed.Sequences.find(sequence => /^stand/i.test(sequence.Name)) ?? parsed.Sequences[0]).Name.trim() : "Stand";
  manifest[key] = { libraryName: name, catalogId: entry.id, mdxSha256: sha(data),
    loop, ...(name === "egg" || effect ? { static: true } : {}), scale: 1.65 / Math.max(1, maximum - Math.max(0, minimum)), baseZ: Math.min(0, minimum),
    ...(parsed.Sequences.some(sequence => /^walk/i.test(sequence.Name)) ? {} : { noWalk: true }), textures };
  models.set(name, key);
  return key;
}
function sha(data) {
  return createHash("sha256").update(data).digest("hex");
}
function bind(id, name, size = 1, sourceEffect) {
  bindings[id] ??= { asset: asset(name, Boolean(sourceEffect)), original: sourceEffect ?? originals.get(id) ?? manifest[id]?.original, size };
}
// The exact native models are absent from the audited combat candidates. Record
// the selected local substitute independently for each content ID in bindings.
const ordinaryAliases = {
  i702: "ZergicidAgent", i703: "hulk", i704: "GoblinAlchemist", i705: "Cairne1",
  i708: "Orckugong1", i709: "revan low size", i711: "SiberianTigerGod",
  i712: "DragonSpawnArmoredDarkshade", i713: "DragonSpawn",
  i714: "Tauren Druid Final", i715: "Trollwuyi", i716: "OrcMalesama2", i717: "Vol'jin",
};
for (const [cardId, name] of Object.entries(ordinaryAliases)) {
  for (const id of target.cards[cardId].towerLine) bind(id, name);
}
bind("G046", "IllidanDark");
bind("H022", "Sinon");
bind("G066", "kikyou");
bind("G073", "kagome");
bind("H024", "Cairne1");
bind("G036", "Tauren Druid Final");
bind("H017", "OrcMale3");
bind("G032", "Thrall");
bind("G033", "OrcMalesama2");
bind("G067", "xuhuang");
bind("H033", "FaerieDragonBlue", .82);
bind("G057", "Yoshino", .88);
bind("G058", "Chika", .88);
bind("H008", "Tauren Druid Final");
bind("G047", "WoWTaurenMale1");
bind("H031", "DreneiPaladin");
bind("G048", "Vol'jin");
bind("H059", "Yami Darkness");
bind("G079", "BlackHeart");
bind("H004", "Esdeath");
bind("G039", "Rei");
bind("H011", "DragonSpawn");
bind("G051", "GoblinAlchemist");
bind("G063", "FelOrcNetherDrake");
for (const id of ["b150", "b151", "b152", "b153", "b154", "b155"]) bind(id, "Wolf_ghost", .6);
bind("H043", "DragonSpawnArmoredDarkshade");
bind("H047", "Tauren Druid Final");
bind("H056", "Cairne1");
bind("H060", "DragonSpawnArmoredDarkshade");
bind("G078", "IllidanDark");
bind("A233", "fireglobe_e_003editedfire", .80, "RainOfFireTarget.mdl");
bind("A233G078", "wfireslandbluee1", .8, "G078 A233 rainoffire");
bind("T403", "fireglobe_e_003editedfire", .32, "T403 Aven tracking missile");
bind("A234", "ennergychainsedited", .68, "A234 absorb / T404 ensnare");
bind("A235", "RuneAura", .32, "Abilities\\Spells\\Other\\GeneralAuraTarget\\GeneralAuraTarget.mdl");
for (const id of beastmasterHawks) bind(id, "fireBird", .52);
for (const id of beastmasterBoars) bind(id, "BAIHU", .55);
bind("q053", "spike2", .38, "Abilities\\Weapons\\RexxarMissile\\RexxarMissile.mdl");
bind("H046", "OrcMale3");
bind("G065", "ZhangLiao");
bind("q036", "OrcMale3");
bind("q043", "ZhangLiao");
bind("A178", "ennergychains", .55, "Burning_Cage_1.mdx");
bind("A178G065", "ennergychainsedited", .55, "AZ_heroEmber_C1.mdx / AZ_heroEmber_C2.mdx");
bind("A179", "magtheradoncubebypurgeandfire", .75, "Abilities\\Spells\\Other\\ImmolationRed\\ImmolationRedTarget.mdl");
bind("A179G065", "wfireslandbluee1", .75, "AZ_heroEmber_E.mdx");
bind("A180", "fireglobe_e_003editedfire", .41, "Abilities\\Weapons\\PhoenixMissile\\Phoenix_Missile_mini.mdl");
bind("A180G065", "fireglobe_e_003edited", .41, "AZ_heroEmber_T2.mdx");
bind("A182", "spike2", .7, "Abilities\\Spells\\NightElf\\FanOfKnives\\FanOfKnivesCaster.mdl");
bind("T197", "pulsing spellshielde11111", .30, "StormBoltMissile.mdl");
for (const id of ["E017", "E018", "E019", "E020", "E021", "E022"]) bind(id, "Wolf_ghost");
bind("H042", "DragonSpawnArmoredDarkshade");
bind("G061", "strike freedom");
bind("H040", "IllidanDark");
bind("G068", "Yami Darkness");
bind("SpellBreakerAttack", "columnsemicircleedited1", .23, "SpellBreakerAttack.mdl");
bind("AZ_D036", "Jeanne_Alter_Spell2", .35, "AZ_D036.MDX");
bind("enchantment", "RuneAura", .72, "enchantment.mdx");
bind("T664", "diamondcircle", .27, "T664.mdx");
bind("H026", "Midgard");
bind("G069", "FelOrcNetherDrake");
bind("A083", "pulsing spellshielde11111", .19, "IllidanMissile.mdl");
bind("A084", "RuneAura", .36, "ReplenishManaCasterOverhead.mdl");
bind("ShenZhiZhiShi", "diremaulmagicvortex", .70, "ShenZhiZhiShi.mdx");
bind("New_SZZS", "hagaracrystalpurple", .60, "New_SZZS.mdx");
bind("H028", "DreneiPaladin");
bind("G056", "DragonSpawnArmoredDarkshade");
bind("T090", "columnsemicircleedited5", .24, "SentinelMissile.mdl");
bind("SJ_XF", "dustwave4", .53, "SJ_XF.MDX");
bind("X003", "diremaulmagicvortex", .34, "AUau/X003");
bind("FaerieFire", "RuneAura", .25, "FaerieFireTarget.mdl");
bind("H030", "revan low size");
bind("G060", "IllidanDark");
bind("WispExplode", "dustwave4", .62, "WispExplode.mdl");
bind("PsiWave", "diremaulmagicvortex", .66, "PsiWave.mdx");
bind("T098", "RuneAura", .32, "SlowCaster.mdl");
bind("H035", "OrcMale3");
bind("H045", "Thrall");
bind("G070", "ZhangLiao");
bind("H048", "Tauren Druid Final");
bind("H049", "revan low size");
bind("H053", "DreneiPaladin");
bind("staraura", "RuneAura", .64, "staraura.mdx");
bind("newsoularmor", "pulsing spellshielde11111", .80, "newsoularmor.mdx");
bind("AZ_diangun01_F_fx2", "diremaulmagicvortex", 1, "AZ_diangun01_F_fx2.mdx");
bind("ChimaeraLightningMissile", "pulsing spellshielde11111", .28, "ChimaeraLightningMissile.mdl");
bind("H054", "revan low size");
bind("H058", "heishuixuanshe");
bind("G075", "FaerieDragonBlue");
bind("q055", "heishuixuanshe");
bind("q058", "FaerieDragonBlue");
bind("T286", "pulsing spellshielde11111", .42, "CrushingWaveDamage.mdl");
bind("T297", "diremaulmagicvortex", .34, "CarrionSwarmDamage.mdl");
bind("morph_str_1", "RuneAura", .46, "morph_str_1.mdl");
bind("morph_agi_1", "hagaracrystalpurple", .30, "morph_agi_1.mdl");
bind("NagaDeath", "cloud", .65, "NagaDeath.mdl");
bind("blackhole", "diremaulmagicvortex", .65, "blackhole.mdx");
bind("H061", "Trollwuyi");
bind("ImpaleMissTarget", "spike2", .69, "ImpaleMissTarget.mdl");
bind("PolyMorphDoneGround", "pulsing spellshielde11111", .53, "PolyMorphDoneGround.mdl");
bind("LightningBoltMissile", "lightningrod", .42, "LightningBoltMissile.mdl");
bind("DemonBoltImpact", "fireglobe_e_003editedfire", .54, "DemonBoltImpact.mdl");
bind("H057", "hulk");
bind("T276", "FaerieDragonBlue", .42, "WaterElemental.mdl");
bind("T277", "diremaulmagicvortex", .52, "CrushingWaveMissile.mdl");
bind("T279", "spike2", .73, "ImpaleMissTarget.mdl");
bind("H050", "IllidanDark");
bind("G071", "FelOrcNetherDrake");
bind("A192", "pulsing spellshielde11111", .56, "DeathPactTarget.mdl");
bind("A192G071", "diremaulmagicvortex", .64, "warpdarkcaster.mdx");
bind("A192Night", "cloud", .75, "devilslam.mdx");
bind("A192G071Night", "hagaracrystalpurple", 1.125, "T659.mdx");
bind("q063", "revan low size");
bind("T207", "diremaulmagicvortex", .8, "illuminate.mdx");
bind("T408", "diremaulmagicvortex", .8, "illuminate.mdx");
bind("FarseerMissile", "hagaracrystalpurple", .30, "FarseerMissile.mdl");
bind("AIimTarget", "RuneAura", .34, "AIimTarget.mdl");
bind("T409", "pulsing spellshielde11111", .39, "InnerFireTarget.mdl");
bind("T205", "dustwave4", .38, "ShockwaveMissile.mdl");
bind("T198", "RuneAura", .45, "BloodlustTarget.mdl");
bind("T199", "pulsing spellshielde11111", .56, "WarStompCaster.mdl");
bind("q040", "diremaulmagicvortex", 2.5, "SpiritWalkerChange.mdl");
bind("q044", "dustwave4", 2.5, "New_JuBian.mdx");
bind("T188", "RuneAura", .27, "T188 tracking mark");
bind("T189", "fireglobe_e_003editedfire", .85, "InfernalBirth.mdl");
for (const [rank, size] of [1.4, 1.4, 1.5, 1.5, 1.6, 1.6].entries()) bind("n" + (261 + rank), "hulk", .75 * size);
bind("H039", "DreneiPaladin");
bind("G064", "Yami Darkness");
bind("darkmending", "diremaulmagicvortex", .55, "darkmending.mdx");
bind("HAJT1", "dustwave4", .52, "HAJT1.mdx");
bind("fatesedict", "pulsing spellshielde11111", .55, "fatesedict.mdx");
bind("falsepromise", "RuneAura", .65, "falsepromise.mdx");
bind("HAJT3", "hagaracrystalpurple", .50, "HAJT3.mdx");
bind("shenYuZhe", "diamondcircle", .70, "shenYuZhe.mdx");
bind("HAJT2", "magtheradoncubebypurgeandfire", .60, "HAJT2.mdx");
bind("T130", "columnsemicircleedited5", .22, "gaussgun.mdx");
bind("T131", "RuneAura", .27, "SlowCaster.mdl");
bind("T132", "pulsing spellshielde11111", .48, "AIilTarget.mdl");
bind("T134", "pulsing spellshielde11111", .48, "AIilTarget.mdl");
bind("H041", "kikyou");
bind("G072", "Sinon");
bind("H119", "columnsemicircleedited1", .18, "H119.mdx");
bind("T172", "columnsemicircleedited5", .23, "BallistaMissile.mdl");
bind("T260", "hagaracrystalpurple", .22, "qiangliji1.mdx");
bind("H120", "RuneAura", .45, "H120.mdx");
bind("H055", "Trollwuyi");
for (const [rank, size] of [1.2, 1.2, 1.3, 1.3, 1.4, 1.4].entries()) {
  bind("b" + (156 + rank), "moriapillare", .45 * size, "units\\orc\\StasisTotem\\StasisTotem");
}
bind("T231", "pulsing spellshielde11111", .27, "BottleMissile.mdl");
bind("netherinferno", "fireglobe_e_003editedfire", .75, "netherinferno.mdx");
bind("UndeadMineCircle", "RuneAura", .65, "UndeadMineCircle.mdl");
bind("FeralSpiritTarget", "pulsing spellshielde11111", .53, "FeralSpiritTarget.mdl");
bind("N731", "columnsemicircleedited5", .21, "SerpentWardMissile.mdl");
bind("H051", "newBRSbike");
bind("G080", "strike freedom");
bind("T216", "fireglobe_e_003edited", .23, "tinkerrocketmissile_2.mdx");
bind("T217", "fireglobe_e_003editedfire", .20, "RocketMissile.mdl");
bind("calldown_flyup", "fireglobe_e_003edited", .43, "calldown_flyup.mdx");
bind("calldown_flydown", "fireglobe_e_003editedfire", .45, "calldown_flydown.mdx");
bind("jijie", "RuneAura", .64, "jijie.mdx");
bind("calldown_4", "diremaulmagicvortex", .75, "calldown_4.mdx");
bind("VolcanoMissile", "fireglobe_e_003editedfire", .68, "VolcanoMissile.mdl");
bind("H025", "DreneiPaladin");
bind("G042", "xuhuang");
bind("ShuiDaoEffDef", "dustwave4", .48, "ShuiDaoEffDef.MDX");
bind("AZ_Coco_E2_Blast", "diremaulmagicvortex", .54, "AZ_Coco_E2_Blast.MDX");
bind("ShuiDaoHands", "RuneAura", .35, "ShuiDaoHands.mdx");
bind("T079", "catapultedited", 1.2, "UndeadDestroyerShip.mdl");
bind("T080", "DragonSinestra", .95, "AZ_shayuzhuangji.mdx");
bind("H020", "BlackHeart");
bind("G022", "DiaoChan");
bind("q011", "FaerieDragonBlue", .30);
bind("q012", "Wolf_ghost", .30);
bind("A064", "diremaulmagicvortex", .42, "CarrionSwarmMissile.mdl");
bind("H052", "DragonSpawnArmoredDarkshade");
bind("G076", "Yoshino");
bind("T1946", "hagaracrystalpurple", .65, "T1946.mdx");
bind("FrostArmorTarget", "pulsing spellshielde11111", .50, "FrostArmorTarget.mdl");
bind("T225", "dustwave4", .30, "FrostWyrmMissile.mdl");
bind("A198", "RuneAura", .52, "DarkRitualTarget.mdl");
bind("H002", "Dragon_Priestess");
bind("G035", "DiaoChan");
bind("G043", "kikyou");
bind("A005", "columnsemicircleedited1", .11, "NagaArrowMissile.mdl");
bind("A097", "fenlie", .19, "MED_JG_DD.MDX");
bind("A099", "pulsing spellshielde11111", .21, "MED_QGMJ_DD.mdx");
bind("AZ_ShuiJingShiHua", "hagaracrystalpurple", .45, "AZ_ShuiJingShiHua.mdx");
bind("H001", "IllidanDark");
bind("G053", "PurpleHeart");
bind("T001", "diremaulmagicvortex", .42, "UndeadDissipate.mdl");
bind("T135", "fenlie", .42, "AZ_yingmo01_R.mdx");
bind("T136", "hagaracrystalpurple", .21, "AZ_yingmo01_N.mdx");
bind("H016", "moon_shin_GY");
bind("G074", "hero_moon");
bind("T120", "pulsing spellshielde11111", .35, "StormBoltMissile.mdl");
bind("H014", "revan low size", .9);
bind("G038", "BlackHeart");
bind("G050", "IllidanDark");
bind("T031", "RuneAura", .30, "DeathCoilMissile.mdl");
bind("T133", "hagaracrystalpurple", .34, "SWMC.mdx");
bind("T066", "pulsing spellshielde11111", .30, "StormBoltMissile.mdl");
bind("H037", "HordeRider", 1.4);
bind("H003", "DreneiPaladin", 1.7);
bind("H034", "Trollwuyi");
bind("H032", "GoblinAlchemist", 1.2);
for (const id of ["E010", "E011", "E012", "E013", "E014", "E015"]) bind(id, "hulk", 1.2);
bind("T102", "cloud", .7, "SuanWu.mdx");
bind("H023", "GoblinAlchemist");
bind("T064", "ZergicidAgent", .45, "Units\\Creeps\\HeroTinkerRobot\\HeroTinkerRobot.mdl");
bind("StampedeMissileDeath", "dustwave4", .45, "Abilities\\Spells\\Other\\Stampede\\StampedeMissileDeath.mdl");
bind("A115", "fireglobe_e_003editedfire", .35, "Abilities\\Spells\\Other\\BreathOfFire\\BreathOfFireDamage.mdl");
bind("HuoXueShu", "RuneAura", .6, "HuoXueShu.mdx");
bind("A117", "dustwave4", .66, "lifebreak.mdx");
bind("G077", "ZhangLiao", 1.6);
for (const [id, name, size] of [
  ["E001", "VaanelBLIZZYseraDragon", 1.4], ["E002", "VaanelBLIZZYseraDragon", 1.4],
  ["E003", "DragonRedT", 1.4], ["E004", "DragonRedT", 1.4],
  ["E005", "DragonAzurgoz", 1.4], ["E006", "DragonAzurgoz", 1.4],
  ["E023", "twighlightdragon0000", .75], ["E024", "twighlightdragon0000", .75],
  ["E025", "1Redcrystaldragon1", .75], ["E026", "1Redcrystaldragon1", .75],
  ["E027", "Sindragosa1", .75], ["E028", "Sindragosa1", .75],
]) bind(id, name, size);
bind("A008", "fireglobe_e_003editedfire", 1.2, "AZ_HYHX.mdx");
bind("A008G077", "hagaracrystalpurple", 1.2, "bingpenhuo.mdx");
bind("T003", "fireglobe_e_003editedfire", .28, "Environment\\LargeBuildingFire\\LargeBuildingFire1.mdl");
bind("G062", "ZhaoYun", 1.4);
bind("A132", "columnsemicircleedited5", 1.5, "overwhelmingodds.mdx");
bind("A133", "pulsing spellshielde11111", .45, "Abilities\\Spells\\Human\\InnerFire\\InnerFireTarget.mdl");
bind("JueDou", "hagaracrystalpurple", .55, "JueDou.mdx");
bind("JueDouing", "fenlie", .8, "JueDouing.mdx");
bind("H015", "Tauren Druid Final", .8);
bind("G055", "WoWTaurenMale1", 1.1);
for (const [index, id] of ["b100", "b101", "b102", "b119", "b120", "b121"].entries()) {
  bind(id, "ForestTroll4", .48 + index * .095);
}
for (const [index, id] of ["b144", "b145", "b146", "b147", "b148", "b149"].entries()) {
  bind(id, "Tauren Druid Final", .48 + index * .095);
}
bind("A050", "RuneAura", .72, "MassTeleportTarget.mdl");
bind("LunaCast", "hagaracrystalpurple", .85, "H036.mdx");
bind("LunaPulse", "RuneAura", .40, "H037.mdx");
bind("StarfallCaster", "diremaulmagicvortex", .54, "StarfallCaster.mdl");
bind("H019", "xuhuang");
bind("G012", "OrcMale3");
bind("G049", "ZhangLiao");
bind("G054", "Yami Darkness");
bind("T055", "pulsing spellshielde11111", .35, "StormBoltMissile.mdl");
bind("T129", "columnsemicircleedited5", .5, "AZ_BSDM02.mdx");
bind("T148", "dustwave4", .40, "ShockwaveMissile.mdl");
bind("B144", "RuneAura", .30, "PurgeBuffTarget.mdl");
bind("RoarCaster", "RuneAura", .57, "RoarCaster.mdl");
bind("AZ_TS_G3", "fireglobe_e_003edited", .60, "AZ_TS_G3.MDX");
bind("AZ_TZFire", "fireglobe_e_003editedfire", .52, "AZ_TZFire.mdx");
bind("H007", "Compa");
bind("G052", "Yami Darkness");
bind("TauntCaster", "RuneAura", .65, "TauntCaster.mdl");
bind("PhantomAssassin_C1", "columnsemicircleedited1", .12, "PhantomAssassin_C1.mdx");
bind("PhantomAssassin_C2", "columnsemicircleedited5", .74, "PhantomAssassin_C2.mdx");
bind("PhantomAssassin_C3A", "diamondcircle", .21, "PhantomAssassin_C3A.mdx");
bind("AZ_PA_C", "pulsing spellshielde11111", .28, "AZ_PA_C.mdx");
bind("H013", "OrcMale3");
bind("G040", "ZhangLiao");
bind("G041", "ZhaoYun");
bind("q002", "OrcMale3");
bind("q020", "ZhangLiao");
bind("q021", "ZhaoYun");
bind("B034", "RuneAura", .65, "GeneralAuraTarget.mdl");
bind("T204", "orb", .30, "Abilities\\Spells\\NightElf\\CorrosiveBreath\\CorrosiveBreathMissile.mdl");
bind("B149", "cloud", .18, "Abilities\\Spells\\Other\\AcidBomb\\BottleImpact.mdl");
const troopSourceAuras = {
  N016: ["diamondcircle", .085, "Abilities\\Spells\\Orc\\WarDrums\\DrumsCasterHeal.mdl"],
  N103: ["RuneAura", .023, "Abilities\\Spells\\NightElf\\TrueshotAura\\TrueshotAura.mdl"],
  N104: ["RuneAura", .023, "Abilities\\Spells\\NightElf\\TrueshotAura\\TrueshotAura.mdl"],
};
for (const [id, [name, size, original]] of Object.entries(troopSourceAuras)) {
  bindings[id] = { asset: asset(name, true), original, size };
}
for (const id of ["BOac", "B017", "B018"]) {
  bind(id, "pulsing spellshielde11111", .22, "Abilities\\Spells\\Other\\GeneralAuraTarget\\GeneralAuraTarget.mdl");
}
bind("T051", "columnsemicircleedited5", .80, "AZ_jingzi_jiansheng01_F1.MDX");
bind("T051G041", "diamondcircle", .21, "AZ_jianrenfengbao_bai.MDX");
bind("H006", "hulk");
bind("G037", "baihu");
bind("Disenchant", "RuneAura", .40, "Disenchant.mdl");
bind("H009", "DragonSpawn");
bind("G044", "DragonSpawnArmoredDarkshade");
bind("H036", "Tauren Druid Final");
bind("E016", "Cairne1");
for (const [rank, size] of [.49, .54, .59, .65, .70, .76].entries()) bind("n" + (255 + rank), "Wolf_ghost", size);
bind("B136", "columnsemicircleedited1", .30, "EntanglingRootsTarget.mdl");
bind("B137", "RuneAura", .34, "RoarTarget.mdl");
bind("B138", "dustwave", .18, "AIfbSpecialArt.mdl");
bind("DoomDeath", "RuneAura", .65, "DoomDeath.mdl");
bind("MCXX1", "magtheradoncubebypurgeandfire", .62, "MCXX1.mdx");
bind("superdarkflash", "Jeanne_Alter_Spell2", .92, "superdarkflash.mdx");
bind("XiaoYuRenAtt", "RuneAura", .35, "XiaoYuRenAtt");
bind("A106H031", "cloud", 1.15, "22211.mdx");
bind("A106G048", "cloud", 1.35, "ZSLY.MDX");
bind("T1837", "columnsemicircleedited5", .80, "T1837.mdx");
bind("Eff_FW_3", "columnsemicircleedited1", .08, "Eff_FW_3.MDX");
bind("Eff_FW_4", "diamondcircle", .14, "Eff_FW_4.MDX");
for (const tower of [...cards.values(), ...workerTowers.values()]) {
  for (const level of tower.levels) bind(level.id, towerAliases[tower.root] ?? tower.root);
  for (const form of tower.forms) if (form.id) bind(form.id, towerAliases[form.id] ?? towerAliases[tower.root] ?? tower.root);
}
for (const id of ["b117", "b139"]) bind(id, "Cairne1", .60);
for (const id of ["b118", "b140"]) bind(id, "Tauren Druid Final", .60);
if (waves.length !== waveModels.length) throw new Error("Wave model coverage changed");
waves.forEach((wave, index) => bind(wave.unitId, waveModels[index], wave.unitId === "mBOS" ? 2.5 : 0.66));
for (const [id, name] of [["m032", "xukonglong"], ["m050", "1Redcrystaldragon1"]]) {
  bindings[id] = { ...bindings[id], asset: asset(name) };
}
for (const base of [122, 132]) for (let rank = 0; rank < 6; rank++) bind("b" + (base + rank), "heishuixuanshe", .48);
bind("e008", "Wolf_ghost", .72);
bind("e009", "GoblinAlchemist", .72);
for (const id of ["b107", "b108", "b109", "b110"]) bind(id, "ForestTroll4", .55);
bind("b138", "egg", .56);
bindings.b138.asset = asset("egg");
for (const id of ["m998", "m999"]) {
  bindings[id] = { asset: asset("dragonsoulchest", true), original: originals.get(id), size: .85 };
}
for (const template of challengeTemplates) bind(template.unitId, challengeModels[template.family], 1.05 + 0.14 * template.stage);
for (const id of ["b103", "b104", "b105", "b106"]) bind(id, "Wolf_ghost", .55);
const workerForms = {
  g002: "revan low size", g003: "Esdeath", g004: "FaerieDragonBlue", g005: "DiaoChan",
  g006: "IllidanDark", g007: "Yoshino", g008: "Tauren Druid Final", g009: "Chika",
  g010: "Altarii", g011: "kagome", g012: "Rei", g013: "moon_shin_GY",
  g014: "DreneiPaladin", g015: "Neptune", g016: "ZhenJi", g017: "Uni", g018: "Noire",
};
for (const [id, name] of Object.entries(workerForms)) bind(id, name, .82);
bind("g200", "fireBird", 1);
bind("g201", "Vol'jin", 1);
bind("g202", "Esdeath", 1);
bind("b142", "BAIHU", .65);
bind("b143", "fireBird", .70);
bind("nsha", "FaerieDragonBlue", .45);
const hexCritters = {
  nsno: ["fireBird", .33], npig: ["SiberianTigerGod", .22], nsea: ["FaerieDragonBlue", .38],
  ncrb: ["DragonSpawnArmoredDarkshade", .23], nhmc: ["DragonSpawn", .22], nrat: ["Wolf_ghost", .19],
  nfro: ["heishuixuanshe", .23], necr: ["BAIHU", .22], nrac: ["Wolf_ghost", .28], nshw: ["FaerieDragonBlue", .45],
};
for (const [id, [model, size]] of Object.entries(hexCritters)) bind(id, model, size);
bindings.b116 = { asset: asset("sc2-mineral-field-bravo-1.0edited", true), original: originals.get("b116"), size: .48 };
bind("B165", "magtheradoncubebypurgeandfire", .62, "T566.mdx");
const workerEffects = {
  S602: ["fairywing", "EFF_ChiBang_1.mdx"], S603: ["ANGELWING", "Worker_CB2.mdx"],
  S604: ["ELFWING", "Worker_CB3.mdx"], S605: ["WingFlame01", "Worker_CB4.mdx"],
  S606: ["HeroByakuyaWing", "Worker_CB5.mdx"], S607: ["AWING", "G142.mdx"],
  S608: ["WingBlack01", "Worker_CB6.mdx"], S609: ["WingOfTheLucifer", "liujinfengyi.mdx"],
  S900: ["RuneAura", "_note1.mdx"], S901: ["HeroGlowOrigin", "_G037.mdx"],
};
for (const [id, [name, original]] of Object.entries(workerEffects)) bind(id, name, .6, original);
writeFileSync(join(root, "models.json"), JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(join(root, "bindings.json"), JSON.stringify(bindings, null, 2) + "\n");
