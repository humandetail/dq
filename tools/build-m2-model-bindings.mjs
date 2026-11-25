// Run from the repository with the locally audited Warcraft-format model library.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { parseMDX } from "war3-model";
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
const bindings = {};
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

function asset(name) {
  if (defaults.has(name)) return name;
  if (models.has(name)) return models.get(name);
  const entry = audit.models.find(model => model.name === name && model.format === "mdx" && (model.combatAnimationCandidate || name === "egg"));
  if (!entry) throw new Error("Missing audited asset " + name);
  const key = "library-" + entry.id;
  const directory = join(root, key);
  mkdirSync(directory, { recursive: true });
  const modelFilename = join(directory, "model.mdx");
  copyFileSync(join(source, entry.asset), modelFilename);
  const data = readFileSync(modelFilename);
  const parsed = parseMDX(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
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
    loop: name === "egg" ? "Unnamed" : "Stand", ...(name === "egg" ? { static: true } : {}), scale: 1.65 / Math.max(1, maximum - Math.max(0, minimum)), baseZ: Math.min(0, minimum),
    ...(parsed.Sequences.some(sequence => /^walk/i.test(sequence.Name)) ? {} : { noWalk: true }), textures };
  models.set(name, key);
  return key;
}
function sha(data) {
  return createHash("sha256").update(data).digest("hex");
}
function bind(id, name, size = 1) {
  bindings[id] = { asset: asset(name), original: originals.get(id) ?? manifest[id]?.original, size };
}
for (const tower of [...cards.values(), ...workerTowers.values()]) {
  for (const level of tower.levels) bind(level.id, towerAliases[tower.root] ?? tower.root);
  for (const form of tower.forms) if (form.id) bind(form.id, towerAliases[form.id] ?? towerAliases[tower.root] ?? tower.root);
}
if (waves.length !== waveModels.length) throw new Error("Wave model coverage changed");
waves.forEach((wave, index) => bind(wave.unitId, waveModels[index], wave.unitId === "mBOS" ? 2.5 : 0.66));
for (const base of [122, 132]) for (let rank = 0; rank < 6; rank++) bind("b" + (base + rank), "heishuixuanshe", .48);
bind("e008", "Wolf_ghost", .72);
bind("e009", "GoblinAlchemist", .72);
for (const id of ["b107", "b108", "b109", "b110"]) bind(id, "ForestTroll4", .55);
bind("b138", "egg", .56);
bind("m998", "OrcMale3", .85);
bind("m999", "m001", .85);
for (const template of challengeTemplates) bind(template.unitId, challengeModels[template.family], 1.05 + 0.14 * template.stage);
for (const id of ["b103", "b104", "b105", "b106"]) bind(id, "Wolf_ghost", .55);
writeFileSync(join(root, "models.json"), JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(join(root, "bindings.json"), JSON.stringify(bindings, null, 2) + "\n");
