import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { decodeBLP, getBLPImageData, parseMDX } from "war3-model";
import bindings from "../src/assets/m2/bindings.json" with { type: "json" };
import { cards, towerLevels } from "../src/game/m2/content.ts";
import { waves } from "../src/game/m2/waves.ts";
import { challengeTemplates } from "../src/game/m2/shops.ts";
import manifest from "../src/assets/m2/models.json" with { type: "json" };

function assertHash(bytes, expected) {
  assert.equal(createHash("sha256").update(bytes).digest("hex"), expected);
}

test("M2-03 tower and mainline samples match catalog files and decode every material texture and required sequence", async () => {
  for (const id of ["H021", "H029", "H038", "H044", "n001", "n006", "n021", "m001"]) assert.ok(manifest[id]);
  const unitIds = [...towerLevels.keys(), ...[...cards.values()].flatMap(card => card.forms.map(form => form.id).filter(Boolean)),
    ...waves.map(wave => wave.unitId), ...challengeTemplates.map(template => template.unitId), "m998", "m999", "e008", "e009", "b116", "b138", "nsha"];
  for (let rank = 0; rank < 8; rank++) unitIds.push("b" + (103 + rank));
  for (const base of [122, 132]) for (let rank = 0; rank < 6; rank++) unitIds.push("b" + (base + rank));
  for (const id of unitIds) {
    assert.ok(bindings[id]?.original, id);
    assert.ok(manifest[bindings[id]?.asset], id);
  }
  for (const id of ["m998", "m999"]) {
    const asset = manifest[bindings[id].asset];
    assert.equal(asset.libraryName, "dragonsoulchest");
    assert.equal(asset.loop, "Stand");
  }
  for (const [id, entry] of Object.entries(manifest)) {
    async function read(name, hash) {
      const bytes = await readFile(new URL(`../src/assets/m2/${id}/${name}`, import.meta.url));
      assertHash(bytes, hash);
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
    const model = parseMDX(await read("model.mdx", entry.mdxSha256));
    assert.ok(model.Geosets.length > 0 && (entry.static || model.Bones.length > 0), id);
    for (const mesh of model.Geosets) {
      for (const group of new Set(mesh.VertexGroup)) {
        assert.ok(mesh.Groups[group]?.length && mesh.Groups[group].every(node => model.Nodes[node]), `${id}: matrix group ${group}`);
      }
    }
    const expectedClips = id === bindings.b116.asset ? ["Stand", "Death"] :
      entry.static ? [entry.loop] : entry.staticStructure ? ["Stand"] : entry.noWalk ? ["Stand", "Attack", "Death"] : ["Stand", "Walk", "Attack", "Death"];
    for (const name of expectedClips) {
      const clip = model.Sequences.find(animation => animation.Name.trim().toLowerCase().startsWith(name.toLowerCase()) && (entry.static || animation.Interval[1] > animation.Interval[0]));
      assert.ok(clip, `${id}: ${name}`);
    }
    const namedTextures = model.Textures.filter(texture => texture.Image || ![1, 2].includes(texture.ReplaceableId));
    for (const name of new Set(namedTextures.map(texture => texture.Image))) {
      const { file, sha256 } = entry.textures[name];
      const image = getBLPImageData(decodeBLP(await read(file, sha256)), 0);
      assert.equal(image.data.length, 4 * image.width * image.height);
      assert.ok(image.data.some((value, index) => index % 4 === 3 && value > 0));
    }
  }
});
