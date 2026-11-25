import assert from "node:assert/strict";
import { test } from "node:test";
import { newMatch } from "../src/game/battle.ts";
import { newClock } from "../src/game/clock.ts";
import { contentVersion, previousContentVersion } from "../src/game/content.ts";
import { createSaveStore } from "../src/game/save.ts";
import { saveFormatVersion } from "../src/game/state.ts";

test("restoring an older complete snapshot upgrades its content version and rejects malformed records", async t => {
  let saved = { formatVersion: saveFormatVersion, contentVersion: previousContentVersion, revision: 9,
    state: newMatch("existing", 1), clock: newClock() };
  const store = { get() {
    const request = { result: structuredClone(saved) };
    queueMicrotask(() => request.onsuccess());
    return request;
  } };
  const previous = globalThis.indexedDB;
  t.after(() => {
    if (previous === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = previous;
  });
  globalThis.indexedDB = { open() {
    const request = { result: { transaction: () => ({ objectStore: () => store }) } };
    queueMicrotask(() => request.onsuccess());
    return request;
  } };
  const saves = createSaveStore();
  assert.deepEqual(await saves.restore(), { ...saved, contentVersion });
  const badClock = structuredClone(saved);
  badClock.clock.speed = 2;
  const badTowers = structuredClone(saved);
  delete badTowers.state.towers;
  for (const corrupt of [badClock, badTowers]) {
    saved = corrupt;
    await assert.rejects(saves.restore(), /存档格式或内容版本不兼容/);
    assert.equal(saved, corrupt);
  }
});
