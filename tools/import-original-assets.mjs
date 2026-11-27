import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { decodeBLP, generateMDX, getBLPImageData, parseMDL, parseMDX } from "war3-model";

const source = join(process.argv[2], "原始路径");
const modelRoot = "src/assets/m2";
const readJson = file => JSON.parse(readFileSync(file, "utf8"));
const manifest = readJson(join(modelRoot, "models.json"));
const bindings = readJson(join(modelRoot, "bindings.json"));
const files = new Map(readdirSync(source, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile()).map(entry => {
    const path = join(entry.parentPath, entry.name).slice(source.length + 1);
    return [path.toLowerCase(), path];
  }));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const arrayBuffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const resolve = name => files.get(name.replaceAll("\\", "/").toLowerCase());
const read = path => readFileSync(join(source, path));
const textureByPath = new Map();
const used = new Map();
const registerUse = (path, destination) => {
  if (!used.has(path)) used.set(path, new Set());
  used.get(path).add(destination);
};
function getPixels(path) {
  if (!textureByPath.has(path)) {
    const bytes = read(path);
    const texture = getBLPImageData(decodeBLP(arrayBuffer(bytes)), 0);
    textureByPath.set(path, { texture, bytes, visible: texture.data.some((n, i) => (i & 3) === 3 && n > 0) });
  }
  return textureByPath.get(path);
}

function pngChunk(type, data) {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length);
  chunk.write(type, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, chunk.length - 4)), chunk.length - 4);
  return chunk;
}

function writeImage(original, destination) {
  const path = resolve(original);
  mkdirSync(dirname(destination), { recursive: true });
  if (extname(path).toLowerCase() === ".tga") {
    execFileSync("sips", ["-s", "format", "png", join(source, path), "--out", destination]);
  } else {
    const { texture: { width, height, data } } = getPixels(path);
    const scanlines = Buffer.alloc((width * 4 + 1) * height);
    for (let row = 0; row < height; row++) scanlines.set(data.subarray(row * width * 4, (row + 1) * width * 4), row * (width * 4 + 1) + 1);
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    writeFileSync(destination, Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", header),
      pngChunk("IDAT", deflateSync(scanlines)), pngChunk("IEND", Buffer.alloc(0)),
    ]));
  }
  registerUse(path, destination);
}

const terrain = {
  grass: "TerrainArt/Northrend/North_grass.blp",
  rock: "TerrainArt/LordaeronSummer/Lords_rock.blp",
  marble: "TerrainArt/Cityscape/City_WhiteMarble.blp",
  leaves: "war3mapImported/shuye.blp",
  glow: "effblp/GenericGlow64.blp",
};
const ui = {
  opening: "Choose_Hero_Frame.tga", panel: "Frame_BeiJing.tga",
  normal: "ItemBg.blp", sr: "ItemBg_SR.blp", ssr: "ItemBg_SSR.blp",
  skill: "Skill_bg.blp", buy: "Btn_buy_up.blp", buyHover: "Btn_buy_move.blp", buyDown: "Btn_buy_down.blp",
  task: "Task_Bg.blp", taskReward: "Task_Reward_Got.blp", damage: "Damage_Dark.blp", damageBar: "Damage_Red.blp",
};
for (const [id, path] of Object.entries(terrain)) writeImage(path, `src/assets/original-map/terrain/${id}.png`);
for (const [id, path] of Object.entries(ui)) writeImage(`UI/${path}`, `src/assets/original-map/ui/${id}.png`);
const music = resolve("BG_1.mp3");
const musicDestination = "src/assets/original-map/audio/BG_1.mp3";
mkdirSync(dirname(musicDestination), { recursive: true });
copyFileSync(join(source, music), musicDestination);
registerUse(music, musicDestination);

const importResults = [];
const originalModels = new Map();
for (const [id, binding] of Object.entries(bindings)) {
  if (!binding.original) continue;
  const candidates = extname(binding.original) ? [binding.original, binding.original.replace(/\.mdl$/i, ".mdx")] :
    [binding.original + ".mdx", binding.original + ".mdl"];
  const path = candidates.map(resolve).find(Boolean);
  if (!path) {
    importResults.push({ id, original: binding.original, status: "原包未找到该路径" });
    continue;
  }
  const existing = manifest[binding.asset];
  // These appearances only render Stand/Walk or Stand in m2-scene.ts.
  const staticModel = Boolean(existing.static) || ["g007", "g008", "g015", "g200", "g201", "g202"].includes(id);
  const staticStructure = Boolean(existing.staticStructure);
  let candidate;
  try {
    candidate = originalModels.get(path);
    if (!candidate) {
      const raw = read(path);
      const binary = raw.subarray(0, 4).toString() === "MDLX";
      const model = binary ? parseMDX(arrayBuffer(raw)) : parseMDL(raw.toString("utf8"));
      const bytes = binary ? raw : Buffer.from(generateMDX(model));
      const missing = [];
      const textures = new Map();
      for (const { Image: name, ReplaceableId: id } of model.Textures) {
        if (!name && [1, 2].includes(id)) continue;
        const texturePath = resolve(name);
        if (!texturePath || !getPixels(texturePath).visible) missing.push(name || `替换纹理 ${id}`);
        else textures.set(name, texturePath);
      }
      const nested = [...model.Attachments ?? [], ...model.ParticleEmitters ?? []].map(node => node.Path).filter(Boolean);
      candidate = { model, bytes, missing, nested, textures };
      originalModels.set(path, candidate);
    }
  } catch (error) {
    importResults.push({ id, original: path, status: "解码失败", detail: String(error) });
    continue;
  }
  const { model, bytes, missing, nested, textures } = candidate;
  const clips = model.Sequences.filter(sequence => staticModel || sequence.Interval[1] > sequence.Interval[0]);
  const has = name => clips.some(sequence => sequence.Name.trim().toLowerCase().startsWith(name));
  const loop = staticModel ? (clips.find(sequence => /^stand/i.test(sequence.Name)) ?? clips[0])?.Name.trim() : "Stand";
  const required = staticModel ? [] : staticStructure ? ["stand"] : ["stand", "attack", "death"];
  const incompatible = !loop || required.some(clip => !has(clip)) || !model.Geosets.length ||
    (!staticModel && !model.Bones.length) || model.Geosets.some(mesh =>
      [...new Set(mesh.VertexGroup)].some(group => !mesh.Groups[group]?.length || mesh.Groups[group].some(node => !model.Nodes[node])));
  if (missing.length || nested.length || incompatible) {
    importResults.push({ id, original: path, status: missing.length ? "缺贴图" : nested.length ? "含独立模型依赖" : "动作或网格待适配",
      detail: [...new Set([...missing, ...nested, ...required.filter(clip => !has(clip))])].join(" | ") });
    continue;
  }
  const asset = `map625-${sha(bytes).slice(0, 16)}${staticModel ? "-effect" : staticStructure ? "-structure" : ""}`;
  if (!manifest[asset]) {
    const directory = join(modelRoot, asset);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "model.mdx"), bytes);
    const registered = {};
    for (const [texture, texturePath] of textures) {
      const { bytes } = getPixels(texturePath);
      const file = `texture-${Object.keys(registered).length}.blp`;
      writeFileSync(join(directory, file), bytes);
      registered[texture] = { file, sha256: sha(bytes) };
    }
    const lower = [Infinity, Infinity, Infinity], upper = [-Infinity, -Infinity, -Infinity];
    for (const mesh of model.Geosets) for (let i = 0; i < mesh.Vertices.length; i++) {
      const axis = i % 3;
      lower[axis] = Math.min(lower[axis], mesh.Vertices[i]);
      upper[axis] = Math.max(upper[axis], mesh.Vertices[i]);
    }
    const height = upper[2] - Math.max(0, lower[2]);
    const extent = staticModel ? Math.max(height, upper[0] - lower[0], upper[1] - lower[1]) : height;
    manifest[asset] = { original: path.replaceAll("/", "\\"), libraryName: basename(path), mdxSha256: sha(bytes), loop,
      ...(staticModel ? { static: true } : staticStructure ? { staticStructure: true } : {}),
      ...(!has("walk") ? { noWalk: true } : {}), scale: 1.65 / Math.max(1, extent), baseZ: Math.min(0, lower[2]), textures: registered };
  }
  registerUse(path, join(modelRoot, asset, "model.mdx"));
  for (const [name, texturePath] of textures) registerUse(texturePath, join(modelRoot, asset, manifest[asset].textures[name].file));
  bindings[id] = { ...binding, asset };
  importResults.push({ id, original: path, status: "已接入", detail: asset });
}

for (const [file, value] of [["models.json", manifest], ["bindings.json", bindings]]) {
  writeFileSync(join(modelRoot, file), JSON.stringify(value, null, 2) + "\n");
}
const report = { bindings: importResults, files: Object.fromEntries([...used].sort().map(([path, sites]) => [path, [...sites].sort()])) };
writeFileSync("docs/m3-original-assets-bindings.json", JSON.stringify(report, null, 2) + "\n");
console.log(importResults.reduce((counts, { status }) => ({ ...counts, [status]: (counts[status] ?? 0) + 1 }), {}));
