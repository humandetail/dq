// Run from the repository with the locally audited Warcraft-format model library.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { generateMDX, model as mdx, parseMDX } from "war3-model";
import audit from "../docs/rules/local-model-library.json" with { type: "json" };
import unitUI from "../reference/map-6.25/units_unitui.json" with { type: "json" };
import { cards, workerTowers } from "../src/game/m2/content.ts";
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
  if (name === "egg") {
    const pivot = new Float32Array(3);
    parsed.Bones.push({ Name: "Egg", ObjectId: 0, Flags: mdx.NodeType.Bone, PivotPoint: pivot });
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
  manifest[key] = { libraryName: name, catalogId: entry.id, mdxSha256: sha(data),
    loop: name === "egg" ? "Unnamed" : "Stand", ...(name === "egg" || effect ? { static: true } : {}), scale: 1.65 / Math.max(1, maximum - Math.max(0, minimum)), baseZ: Math.min(0, minimum),
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
for (const tower of [...cards.values(), ...workerTowers.values()]) {
  for (const level of tower.levels) bind(level.id, towerAliases[tower.root] ?? tower.root);
  for (const form of tower.forms) if (form.id) bind(form.id, towerAliases[form.id] ?? towerAliases[tower.root] ?? tower.root);
}
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
