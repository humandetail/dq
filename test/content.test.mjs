import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { decodeBLP, getBLPImageData, parseMDX } from "war3-model";
import {
  contentVersion, economy, endlessWave, enemies, frameMs, isInsideContainment,
  items, mainline, map, recipes, shop, towers,
} from "../src/game/content.ts";
import { saveFormatVersion } from "../src/game/state.ts";

test("M1 content has valid placement, versions, and wave references", () => {
  assert.match(contentVersion, /^m1-\d+$/);
  assert.ok(Number.isSafeInteger(saveFormatVersion) && saveFormatVersion > 0);
  assert.equal(mainline.difficulty, "standard");
  assert.ok(map.route.every(isInsideContainment));
  assert.equal(isInsideContainment({ x: map.containment.maxX + 0.01, y: 0 }), false);
  const sites = Object.values(map.buildSites);
  assert.equal(new Set(sites.map(({ x, y }) => `${x},${y}`)).size, sites.length);
  assert.ok(sites.every(isInsideContainment));

  const { waves } = mainline;
  assert.equal(waves.length, 10);
  const endless = Array.from({ length: 12 }, (_, index) => endlessWave(index + 1));
  for (const sequence of [waves, endless]) {
    sequence.forEach((wave, index) => {
      assert.equal(wave.number, index + 1);
      assert.equal(wave.batches[0].offsetFrames, 0);
      assert.ok(wave.hpMultiplier > 0);
      const next = sequence[index + 1];
      for (const [batchIndex, batch] of wave.batches.entries()) {
        assert.ok(Object.hasOwn(enemies, batch.enemy));
        assert.ok(Number.isSafeInteger(batch.count) && batch.count > 0);
        assert.ok(Number.isSafeInteger(wave.startFrame + batch.offsetFrames));
        if (batchIndex > 0) {
          assert.ok(batch.offsetFrames > wave.batches[batchIndex - 1].offsetFrames);
        }
        if (next) {
          assert.ok(wave.startFrame + batch.offsetFrames < next.startFrame);
        }
      }
    });
  }
  const finalWave = waves.at(-1);
  assert.equal((finalWave.startFrame + finalWave.batches.at(-1).offsetFrames) * frameMs, 590_000);
  assert.ok(endless[5].hpMultiplier > endless[4].hpMultiplier);
  assert.ok(endless[11].batches[1].count > endless[0].batches[1].count);
  assert.throws(() => endlessWave(0), RangeError);
});

test("opening gold and first-wave rewards fund all five economy actions for either draw", () => {
  const openingTower = towers[economy.openingCard];
  const firstWave = mainline.waves[0];
  const firstBounty = firstWave.batches.reduce((total, batch) =>
    total + batch.count * enemies[batch.enemy].bountyGold, 0);
  const recipe = recipes.amplifier;
  const shoppingCost = recipe.ingredients.reduce((total, ingredient) => {
    assert.ok(Object.hasOwn(items, ingredient) && Object.hasOwn(shop, ingredient));
    assert.ok(shop[ingredient].stock.mainline >= 1 && shop[ingredient].stock.endless >= 1);
    return total + shop[ingredient].gold;
  }, 0);
  assert.ok(Object.hasOwn(items, "amplifier"));
  assert.ok(economy.cardCapacity >= 1 && economy.backpackCapacity >= recipe.ingredients.length);

  const openingSpend = openingTower.buildGold + openingTower.levels[1].upgradeGold;
  assert.ok(openingSpend <= economy.openingGold);
  assert.ok(economy.drawPool.length > 0);
  for (const card of economy.drawPool) {
    assert.ok(Object.hasOwn(towers, card));
    const spend = openingSpend + economy.drawGold + towers[card].buildGold + shoppingCost + recipe.gold;
    assert.ok(spend <= economy.openingGold + firstBounty);
  }
});

test("every M1 unit ships a linked MDX, a BLP1 texture, and a moving attack clip", async () => {
  const assets = new URL("../src/assets/m1/", import.meta.url);
  for (const id of [...Object.keys(towers), ...Object.keys(enemies)]) {
    const mdx = await readFile(new URL(`${id}.mdx`, assets));
    const model = parseMDX(new Uint8Array(mdx).buffer);
    assert.ok(model.Geosets.length > 0);
    assert.equal(model.Textures[0].Image, `${id}.blp`);
    const blp = await readFile(new URL(model.Textures[0].Image, assets));
    const pixels = getBLPImageData(decodeBLP(new Uint8Array(blp).buffer), 0);
    assert.ok(pixels.width > 0 && pixels.data[3] === 255);
    assert.ok(model.Sequences.some(sequence => sequence.Name === "Stand"));
    const attack = model.Sequences.find(sequence => sequence.Name === "Attack");
    assert.ok(attack);
    const [start, end] = attack.Interval;
    assert.ok(model.Bones.some(bone => bone.Translation?.Keys.some(key =>
      key.Frame >= start && key.Frame <= end && key.Vector.some(component => component !== 0))));
  }
});
