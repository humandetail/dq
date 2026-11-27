import assert from "node:assert/strict";
import { configuration, contentVersion, openingResources } from "../src/game/m2/content.ts";
import { m3ConfigVersion, m3ContentVersion, m3Persistence } from "../src/game/m2/m3-version.ts";

export async function checkMigration({ openTab, base, runtimeErrors }) {
  const appUrl = base + "/m2.html?seed=811";
  const setupUrl = base + "/src/game/m2/save.ts";
  const enabled = id => `document.querySelector("#${id}")?.disabled === false`;
  const visible = id => `document.querySelector("#${id}")?.hidden === false`;
  const click = (tab, id) => tab.evaluate(`document.querySelector("#${id}").click()`);
  const status = text => `document.querySelector("#save")?.textContent.includes(${JSON.stringify(text)})`;
  const target = `(async () => {
    const { createM3SaveStore } = await import("/src/game/m2/save.ts");
    return (await createM3SaveStore(() => true, () => true).read()) ?? null;
  })()`;
  const old = configuration.persistence;
  const archivedProfile = {
    claims: ["claimed"], score: 357, activityScore: 151, fragments: 7, openGiftNum: 4,
    seasons: { spring: { counts: { 7: 666 }, points: 40, nodes: [1, 4], unlocks: ["example-archive-tech"] },
      summer: { counts: { 7: 666, 4: 8 }, points: 30, nodes: [1], unlocks: [] } },
    enabledSkins: ["k157"],
  };
  const row = { formatVersion: 2, contentVersion, configVersion: configuration.version, revision: 9,
    activeMatchId: "archived-match", profile: archivedProfile,
    run: { matchId: "archived-match", wave: 49, gold: 999, lumber: 77, killScore: 118 } };
  const setup = await openTab(setupUrl);
  await setup.wait("document.readyState === 'complete'");
  await setup.evaluate(`(async () => {
    const old = ${JSON.stringify(old)};
    const request = indexedDB.open(old.database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("profiles");
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    globalThis.writeLegacy = (row) => new Promise((resolve, reject) => {
      const tx = db.transaction("profiles", "readwrite");
      tx.oncomplete = () => resolve(true);
      tx.onabort = () => reject(tx.error);
      tx.objectStore("profiles").put(row, old.slot);
    });
    globalThis.readLegacy = () => new Promise((resolve, reject) => {
      const request = db.transaction("profiles").objectStore("profiles").get(old.slot);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await writeLegacy(${JSON.stringify({ ...row, revision: 8, profile: { ...row.profile, score: 300 } })});
    navigator.locks.request(old.lock, () => new Promise(resolve => { globalThis.releaseLegacy = resolve; }));
  })()`);
  await setup.wait("typeof globalThis.releaseLegacy === 'function'");

  const page = await openTab(appUrl);
  await page.wait(status("请关闭旧版游戏标签页后重试"));
  await click(page, "cancel-save-wait");
  await page.wait(status("已取消等待"));
  assert.equal(await setup.evaluate(target), null);
  await click(page, "retry-save");
  await page.wait(status("请关闭旧版游戏标签页后重试"));
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `
    const actualPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = actualPut.apply(this, args);
      if (this.transaction.db.name === "${m3Persistence.database}") {
        if (!sessionStorage.getItem("migration-aborted")) {
          sessionStorage.setItem("migration-aborted", "1");
          this.transaction.abort();
        } else {
          const snapshot = structuredClone(args[0]);
          this.transaction.addEventListener("complete", () => {
            globalThis.firstMigratedWrite ??= snapshot;
          }, { once: true });
        }
      }
      return request;
    };
  ` });
  await page.send("Page.reload");
  await page.wait(status("请关闭旧版游戏标签页后重试"));
  await setup.evaluate(`writeLegacy(${JSON.stringify(row)})`);
  await setup.evaluate("releaseLegacy()");
  await page.wait(visible("retry-save"));
  assert.equal(await setup.evaluate(target), null, "Transaction abort left an M3 row");
  assert.deepEqual(await setup.evaluate("readLegacy()"), row);
  await click(page, "retry-save");
  await page.wait(enabled("pause"));
  await page.wait("Boolean(globalThis.firstMigratedWrite)");
  const imported = await page.evaluate("globalThis.firstMigratedWrite");
  assert.equal(imported.contentVersion, m3ContentVersion);
  assert.equal(imported.configVersion, m3ConfigVersion);
  assert.equal(imported.formatVersion, 3);
  assert.equal(imported.revision, 1);
  assert.deepEqual(imported.migration, { source: "m2", revision: 9, activeMatchId: row.activeMatchId, contentVersion });
  assert.deepEqual(imported.profile, archivedProfile);
  assert.deepEqual(imported.run.seasons, archivedProfile.seasons);
  assert.notEqual(imported.run.matchId, row.activeMatchId);
  assert.equal(imported.run.wave, 0);
  assert.equal(imported.run.gold, openingResources.gold);
  assert.equal(imported.run.lumber, openingResources.lumber);
  assert.equal(imported.run.killScore, undefined);
  assert.equal(new Set(imported.run.openingCandidates).size, 4);

  // Existing M3 data must load even while the rollback version owns its lock.
  await setup.evaluate(`navigator.locks.request(${JSON.stringify(old.lock)}, () => new Promise(resolve => {
    globalThis.releaseAgain = resolve;
  })); void 0`);
  await setup.wait("typeof globalThis.releaseAgain === 'function'");
  const follower = await openTab(appUrl);
  await follower.wait(status("等待档案写入权限"));
  assert.equal(await follower.evaluate(enabled("pause")), false);
  await page.close();
  await follower.wait(enabled("pause"));
  const resumed = await setup.evaluate(target);
  assert.deepEqual(resumed.migration, imported.migration);
  assert.deepEqual(resumed.profile, imported.profile);
  assert.deepEqual(resumed.run.openingCandidates, imported.run.openingCandidates);
  await setup.evaluate("releaseAgain()");
  await follower.evaluate(`(() => {
    const actualPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = actualPut.apply(this, args);
      if (this.transaction.db.name === "${m3Persistence.database}" &&
          args[0].run.inventory.some(item => item.itemId === "y006")) {
        IDBObjectStore.prototype.put = actualPut;
        this.transaction.abort();
      }
      return request;
    };
  })()`);
  await follower.evaluate(`[...document.querySelectorAll(".command-tools button")]
    .find(button => button.textContent === "对局").click()`);
  await follower.evaluate(`document.querySelector("#event-boxes").closest("details").querySelector("summary").click()`);
  const buy = 'document.querySelector("#event-boxes button")';
  await follower.wait(buy + "?.disabled === false");
  await follower.evaluate(buy + ".click()");
  await follower.wait('document.querySelector("#feedback")?.textContent.includes("存档失败")');
  const failedPurchase = await setup.evaluate(target);
  assert.equal(failedPurchase.profile.activityScore, 151);
  assert.equal(failedPurchase.run.inventory.some(item => item.itemId === "y006"), false);

  await follower.wait(buy + "?.disabled === false");
  await follower.evaluate(buy + ".click()");
  const boxButton = `document.querySelector('#worker-items [data-item-id="y006"]')`;
  await follower.wait(boxButton + "?.disabled === false");
  const bought = await setup.evaluate(target);
  assert.equal(bought.profile.activityScore, 51);
  assert.equal(bought.run.inventory.find(item => item.itemId === "y006").charges, 1);
  await follower.evaluate(boxButton + ".click()");
  await follower.wait('document.querySelector("#feedback")?.textContent.includes("获得")');
  const opened = await setup.evaluate(target);
  assert.equal(opened.run.inventory.some(item => item.itemId === "y006"), false);
  assert.equal(opened.profile.openGiftNum, archivedProfile.openGiftNum);
  const scoreReward = opened.profile.score - bought.profile.score;
  const fragmentReward = opened.profile.fragments - bought.profile.fragments;
  assert.ok(scoreReward >= 8 && scoreReward <= 16 && fragmentReward === 0 ||
    fragmentReward >= 2 && fragmentReward <= 4 && scoreReward === 0);
  await follower.wait(enabled("restart"));
  await follower.restart();
  await follower.wait(`document.querySelector("#feedback")?.textContent === "已重开。"`);
  const restarted = await setup.evaluate(target);
  assert.equal(restarted.profile.activityScore, 51);
  assert.equal(restarted.run.activityScore, 51);
  assert.equal(restarted.profile.fragments, opened.profile.fragments);
  assert.equal(restarted.run.fragments, opened.profile.fragments);
  assert.equal(restarted.profile.score, opened.profile.score);
  assert.equal(restarted.profile.openGiftNum, opened.profile.openGiftNum);
  await follower.close();

  await setup.evaluate(`(async () => {
    const request = indexedDB.deleteDatabase("${m3Persistence.database}");
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  })()`);
  await setup.evaluate(`writeLegacy(${JSON.stringify({ ...row, formatVersion: 999 })})`);
  const incompatible = await openTab(appUrl);
  await incompatible.wait(status("M2 档案格式、内容版本或数据不兼容"));
  assert.equal(await setup.evaluate(target), null);
  assert.equal((await setup.evaluate("readLegacy()")).formatVersion, 999);
  await incompatible.close();
  await setup.evaluate(`writeLegacy(undefined)`);
  const first = await openTab(appUrl);
  await first.wait(enabled("pause"));
  const initialized = await setup.evaluate(target);
  assert.equal(initialized.profile.score, 60);
  assert.deepEqual(initialized.migration, { source: "none" });
  await first.send("Page.reload");
  await first.wait(enabled("pause"));
  assert.equal((await setup.evaluate(target)).profile.score, 60);
  await first.close();
  await setup.close();
  assert.deepEqual(runtimeErrors, []);
  console.log(JSON.stringify({ status: "passed", type: "controlled-browser-m3-migration", imported: imported.migration,
    inheritedProfile: imported.profile, openingCandidates: imported.run.openingCandidates, firstAwardScore: 60, controlledEventBox: { scoreReward, fragmentReward, balance: restarted.profile.activityScore },
    scenarios: ["old writer", "cancel", "retry", "latest revision", "IDB transaction abort", "immutable archive",
      "M3 read-only follower", "takeover with M2 lock held", "purchase commit failure", "purchase and open",
      "cross-run activity and fragments", "incompatible legacy", "first award once"] }, null, 2));
}
