// Run with CHROME_BIN set to the local Chrome executable.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "vite";

const profile = await mkdtemp(path.join(os.tmpdir(), "td3-m2-browser-"));
const origin = process.env.M2_ORIGIN;
const m3 = process.env.M3_VERIFY === "1";
const storeFactory = m3 ? "createM3SaveStore" : "createM2SaveStore";
const initialMigration = m3 ? ', { source: "none" }' : "";
const peakFixture = process.env.M2_PEAK_FIXTURE;
const hardware = process.env.M2_HARDWARE === "1";
const freezeSeconds = Number(process.env.M2_FREEZE_SECONDS ?? 0);
const protocolTimeout = Number(process.env.M2_CDP_TIMEOUT_MS ?? 30_000);
const perfDurationMs = Number(process.env.M3_PERF_DURATION_MS ?? 20_000);
const perfAutosave = process.env.M3_PERF_AUTOSAVE !== "0";
assert.ok(Number.isSafeInteger(perfDurationMs) && perfDurationMs > 1000 && perfDurationMs <= 600_000);
if (origin && peakFixture && !m3) throw new Error("Published fixture loading uses the M3 checkpoint format");
const server = origin ? undefined : await createServer({
  server: { host: "127.0.0.1", port: 0, watch: null },
  resolve: { conditions: ["td3-legacy-battlefield", "module", "browser", "development|production"] },
});
await server?.listen();
const base = (origin ?? server.resolvedUrls.local[0]).replace(/\/$/, "");
const chrome = spawn(process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new",
  ...(hardware ? ["--window-size=1440,900", ...(process.platform === "darwin" ? ["--use-angle=metal"] : [])] : ["--use-angle=swiftshader"]),
  "--remote-debugging-port=0", `--user-data-dir=${profile}`,
  "--no-first-run", "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding", "about:blank",
], { stdio: "ignore" });
const ended = new Promise(resolve => {
  chrome.once("exit", resolve);
  chrome.once("error", resolve);
});

async function until(check, attempts = 500) {
  for (let i = 0; i < attempts; i++) {
    const result = await check();
    if (result) return result;
    await delay(100);
  }
  throw new Error("Browser acceptance timed out");
}

try {
  const port = await until(async () => {
    try {
      return (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0];
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return null;
    }
  });
  const debug = `http://127.0.0.1:${port}`;
  const runtimeErrors = [];

  async function openTab(url, initialScript, disableCache = false) {
    const tab = await fetch(debug + "/json/new?about:blank", { method: "PUT",
      signal: AbortSignal.timeout(protocolTimeout) }).then(response => response.json());
    const socket = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { socket.close(); reject(new Error("Chrome did not open a tab debugger")); }, protocolTimeout);
      socket.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
      socket.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("Chrome tab debugger connection failed")); }, { once: true });
    });
    let sequence = 0;
    const pending = new Map();
    const networkFailures = [];
    let confirmRestart = false;
    socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.method === "Page.javascriptDialogOpening" && confirmRestart) {
        confirmRestart = false;
        void send("Page.handleJavaScriptDialog", { accept: true });
      }
      if (message.method === "Runtime.exceptionThrown") runtimeErrors.push(message.params.exceptionDetails.text);
      if (message.method === "Network.loadingFailed") networkFailures.push(message.params);
      if (!message.id) return;
      const job = pending.get(message.id);
      if (!job) return;
      pending.delete(message.id);
      if (message.error) job.reject(new Error(message.error.message));
      else job.resolve(message.result);
    });
    socket.addEventListener("close", () => {
      for (const job of pending.values()) job.reject(new Error("Chrome tab disconnected"));
      pending.clear();
    });

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        if (socket.readyState !== WebSocket.OPEN) {
          reject(new Error("Chrome tab disconnected"));
          return;
        }
        const id = ++sequence;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Chrome did not respond to ${method} within ${protocolTimeout} ms`));
        }, protocolTimeout);
        pending.set(id, { resolve: result => { clearTimeout(timer); resolve(result); },
          reject: error => { clearTimeout(timer); reject(error); } });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }

    async function evaluate(expression) {
      const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      }
      return result.result.value;
    }

    await send("Runtime.enable");
    await send("Page.enable");
    if (disableCache) {
      await send("Network.enable");
      await send("Network.setCacheDisabled", { cacheDisabled: true });
    }
    if (initialScript) await send("Page.addScriptToEvaluateOnNewDocument", { source: initialScript });
    await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    return {
      send, evaluate, networkFailures,
      async restart() {
        confirmRestart = true;
        await evaluate("document.querySelector('#restart').click()");
      },
      async wait(expression, attempts) {
        try {
          return await until(async () => {
            try {
              return await evaluate(expression);
            } catch (error) {
              if (socket.readyState !== WebSocket.OPEN ||
                  !/execution context was destroyed|cannot find context|inspected target navigated or closed/i.test(error.message)) throw error;
              return false;
            }
          }, attempts);
        } catch (error) {
          throw new Error(expression + "\n" + await evaluate("document.body?.innerText"), { cause: error });
        }
      },
      async close() {
        await fetch(debug + "/json/close/" + tab.id, { signal: AbortSignal.timeout(protocolTimeout) });
        socket.close();
      },
    };
  }

  const read = selector => `document.querySelector(${JSON.stringify(selector)})`;
  const contains = (selector, phrase) => `${read(selector)}?.textContent.includes(${JSON.stringify(phrase)})`;
  const click = (tab, selector) => tab.evaluate(`${read(selector)}.click()`);
  async function clickVisible(tab, selector) {
    const point = await tab.evaluate(`(() => {
      const control = ${read(selector)};
      if (!control?.checkVisibility() || control.disabled) return null;
      const box = control.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    })()`);
    assert.ok(point, `${selector} must be visible and enabled`);
    assert.ok(await tab.evaluate(`!!document.elementFromPoint(${point.x}, ${point.y})?.closest(${JSON.stringify(selector)})`),
      `${selector} must receive pointer input`);
    for (const type of ["mousePressed", "mouseReleased"]) {
      await tab.send("Input.dispatchMouseEvent", { type, button: "left", clickCount: 1, ...point });
    }
  }
  async function openManagement(tab, name = "对局") {
    if (!m3) return;
    const active = `${read(".command-backdrop")}?.hidden === false &&
      ${read(".command-window nav .active")}?.textContent === ${JSON.stringify(name)}`;
    if (await tab.evaluate(active)) return;
    const target = `[...document.querySelectorAll(".command-tools button")]
      .find(button => button.textContent === ${JSON.stringify(name)})`;
    await tab.wait(target + "?.checkVisibility()");
    await tab.evaluate(target + ".click()");
    await tab.wait(active);
  }
  async function closeManagement(tab) {
    if (!m3 || await tab.evaluate(read(".command-backdrop") + "?.hidden !== false")) return;
    await click(tab, ".command-window > nav button:last-child");
    await tab.wait(read(".command-backdrop") + ".hidden");
  }
  const appearanceGroup = label => `#worker-appearance [role="group"][aria-label="${label}"]`;
  const appearanceButton = (label, id) => `${appearanceGroup(label)} button[value="${id}"]`;
  async function openAppearanceGroup(tab, label) {
    await openManagement(tab);
    const group = read(appearanceGroup(label));
    await tab.wait(group + " !== null");
    if (!await tab.evaluate(group + ".parentElement.open")) {
      await tab.evaluate(group + ".parentElement.querySelector('summary').click()");
    }
  }
  async function buyOrdinary(tab, id) {
    if (!m3) {
      await tab.wait(read("#buy-ordinary") + "?.disabled === false");
      await tab.evaluate(read("#ordinary-goods") + ".value = " + JSON.stringify(id));
      await click(tab, "#buy-ordinary");
      return;
    }
    const { ordinaryGoods } = await import("../src/game/m2/content.ts");
    const name = ordinaryGoods.get(id).name;
    await openManagement(tab, "商店");
    await tab.evaluate(`(() => {
      const search = document.querySelector(".live-shop input");
      search.value = ${JSON.stringify(name)};
      search.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    const selected = `[...document.querySelectorAll(".live-goods article")]
      .find(article => article.getAttribute("aria-label") === ${JSON.stringify(name)})`;
    await tab.wait(selected + "?.checkVisibility()");
    await tab.evaluate(selected + ".click()");
    await tab.wait(read(".goods-detail button") + "?.disabled === false");
    await click(tab, ".goods-detail button");
  }
  async function mapPoint(tab, worldX = -288, worldY = -160) {
    return tab.evaluate(`(() => {
      const field = document.querySelector("#field");
      const box = field.getBoundingClientRect();
      const matrix = field.dataset.cameraProjection.split(",").map(Number);
      const x = ${worldX} / 100;
      const z = ${worldY} / 100;
      const w = matrix[3] * x + matrix[11] * z + matrix[15];
      const horizontal = (matrix[0] * x + matrix[8] * z + matrix[12]) / w;
      const vertical = (matrix[1] * x + matrix[9] * z + matrix[13]) / w;
      return { x: box.x + (horizontal + 1) * box.width / 2,
        y: box.y + (1 - vertical) * box.height / 2 };
    })()`);
  }
  async function hover(tab, x, y) {
    const point = await mapPoint(tab, x, y);
    await tab.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
    return point;
  }
  async function place(tab, x = -288, y = -160) {
    const point = await hover(tab, x, y);
    assert.equal(await tab.evaluate(`document.elementFromPoint(${point.x}, ${point.y})?.id`), "field");
    for (const type of ["mousePressed", "mouseReleased"]) {
      await tab.send("Input.dispatchMouseEvent", { type, button: "left", clickCount: 1, ...point });
    }
  }
  async function capture(tab, name) {
    if (!process.env.M2_EVIDENCE_DIR) return;
    await mkdir(process.env.M2_EVIDENCE_DIR, { recursive: true });
    const screenshot = await tab.send("Page.captureScreenshot", { format: "png" });
    await writeFile(path.join(process.env.M2_EVIDENCE_DIR, name + ".png"), Buffer.from(screenshot.data, "base64"));
  }
  const urlForSeed = seed => base + "/m2.html?seed=" + seed;
  const url = urlForSeed(811);
  async function tinyFixtureSeed() {
    if (!m3) return 811;
    const { newMatch } = await import("../src/game/m2/match.ts");
    const preferred = process.env.M3_BROWSER_CONTROLLED_SEED;
    const seeds = preferred === undefined ? [811, 47, 14, 1709, 20261124, ...Array.from({ length: 256 }, (_, seed) => seed)] :
      [Number(preferred)];
    const seed = seeds.find(seed => newMatch("controlled-tiny", seed).openingCandidates.includes("i564"));
    assert.notEqual(seed, undefined, "The controlled Tiny UI fixture needs an actual i564 opening offer.");
    return seed;
  }
  const tinyOpening = "[...document.querySelectorAll('#choices button')].find(button => button.textContent === '小小 · SR')";
  async function chooseTinyForControlledChecks(page) {
    await page.wait(tinyOpening + "?.disabled === false");
    await page.evaluate(tinyOpening + ".click()");
  }
  async function checkM3Opening() {
    const { m3Persistence, m3ContentVersion, m3ConfigVersion, m3SaveFormatVersion } = await import("../src/game/m2/m3-version.ts");
    const { cardTemplates, openingChoices } = await import("../src/game/m2/content.ts");
    const snapshot = `(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(${JSON.stringify(m3Persistence.database)}, 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return new Promise((resolve, reject) => {
        const request = db.transaction("profiles", "readonly").objectStore("profiles").get(${JSON.stringify(m3Persistence.slot)});
        request.onsuccess = () => { db.close(); resolve(request.result); };
        request.onerror = () => { db.close(); reject(request.error); };
      });
    })()`;
    const page = await openTab(url);
    await page.wait(read("#restart") + "?.disabled === false");
    if (origin && new URL(origin).protocol === "https:") assert.equal(await page.evaluate("isSecureContext"), true);
    const original = await page.evaluate(snapshot);
    const candidates = original.run.openingCandidates;
    assert.deepEqual([original.contentVersion, original.configVersion, original.formatVersion],
      [m3ContentVersion, m3ConfigVersion, m3SaveFormatVersion]);
    assert.equal(candidates.length, 4);
    assert.equal(new Set(candidates).size, 4);
    assert.ok(candidates.every(card => openingChoices.includes(card)));
    assert.equal(original.run.openingCard, null);
    const labels = candidates.map(id => {
      const card = cardTemplates.get(id);
      return card.name + " · " + card.rarity;
    });
    const buttons = "[...document.querySelectorAll('#choices button')].map(button => button.textContent)";
    const starter = original.run.inventory.find(item => item.itemId === "i004");
    const starterSlot = `.six-slots button:nth-child(${starter.slot + 1})`;
    await page.wait(read("#field") + "?.dataset.ready === 'true' && " + read(starterSlot) + "?.disabled === false");
    assert.equal(await page.evaluate(read(starterSlot) + ".checkVisibility()"), true);
    await click(page, starterSlot);
    await page.wait(read("#choices button") + "?.disabled === false");
    const picker = '.command-window[aria-label="选择开局英雄"]';
    assert.equal(await page.evaluate(read(picker) + "?.checkVisibility()"), true);
    assert.deepEqual(await page.evaluate(buttons), labels);
    await page.wait(`(async () => (await (${snapshot})).run.openingChoicesUnlocked)()`);
    await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await page.evaluate("window.__m3BeforeOpeningReload = true");
    await page.send("Page.reload");
    await page.wait("window.__m3BeforeOpeningReload !== true && " + read(picker) + "?.checkVisibility() && " + read("#choices button") + "?.disabled === false");
    assert.deepEqual(await page.evaluate(buttons), labels);
    const reopened = await page.evaluate(snapshot);
    assert.equal(reopened.activeMatchId, original.activeMatchId);
    assert.deepEqual(reopened.run.openingCandidates, candidates);
    await page.evaluate(`(() => {const first = ${read("#choices button")}; first.click(); first.click();})()`);
    await page.wait(read("#opening") + "?.hidden");
    const selected = await page.wait(`(async () => {
      const current = await (${snapshot});
      return current.run.openingCard === ${JSON.stringify(candidates[0])} && current;
    })()`);
    assert.deepEqual(selected.run.cards.map(card => card.card), [candidates[0]]);
    assert.equal(selected.run.cards[0].slot, starter.slot);
    await page.wait(read(".command-backdrop") + ".hidden && " + read(starterSlot) + "?.checkVisibility() && " +
      contains(starterSlot, cardTemplates.get(candidates[0]).name));
    await page.evaluate("window.__m3BeforeOpeningReload = true");
    await page.send("Page.reload");
    await page.wait("window.__m3BeforeOpeningReload !== true && " + read("#restart") + "?.disabled === false && " + read("#opening") + "?.hidden");
    const restored = await page.evaluate(snapshot);
    assert.equal(restored.activeMatchId, original.activeMatchId);
    assert.equal(restored.run.openingCard, candidates[0]);
    assert.deepEqual(restored.run.cards, selected.run.cards);
    assert.deepEqual(restored.run.openingCandidates, candidates);
    assert.deepEqual(runtimeErrors, []);
    await page.close();
    console.log(JSON.stringify({ type: "m3-opening-browser", url, contentVersion: m3ContentVersion,
      seed: 811, eligible: openingChoices.length, candidates, selected: candidates[0], status: "passed" }));
  }
  async function checkFirelord(page) {
    await openManagement(page);
    await page.wait(read('[data-item-id="i004"]') + "?.disabled === false");
    await page.wait(read("#field") + "?.dataset.ready === 'true'");
    await click(page, '[data-item-id="i004"]');
    await chooseTinyForControlledChecks(page);
    await page.wait(read("#cards button") + "?.disabled === false");
    await click(page, "#cards button");
    await place(page);
    await openManagement(page);
    const learn = `[...document.querySelectorAll("#structures button")].find(button => button.textContent.startsWith("学习山崩"))`;
    await page.wait(learn + "?.disabled === false");
    await page.evaluate(learn + ".click()");
    await page.wait(contains("#structures", "学习山崩 Lv2"));
    await click(page, "#prayer button");
    await page.wait(contains("#books", "经验书 ×1"));
    await page.evaluate(`[...document.querySelectorAll("#structures button")].find(button => button.textContent === "使用经验书").click()`);
    const learnGrowth = `[...document.querySelectorAll("#structures button")].find(button => button.textContent.startsWith("学习长大"))`;
    await page.wait(learnGrowth + "?.disabled === false");
    await page.evaluate(learnGrowth + ".click()");
    const scaleNear = scale => `Math.abs(Number(document.querySelector("#field").dataset.growthModelSize) - ${scale}) < .000001`;
    await page.wait(scaleNear(.7));
    const skin = `[...document.querySelectorAll("#structures button")].find(button => button.textContent === "切换火焰领主")`;
    await page.wait(skin + "?.disabled === false");
    await page.evaluate(skin + ".click()");
    await page.wait(contains("#structures", "火焰领主<SR> · G059"));
    await page.wait(read("#field") + "?.dataset.renderedTowers.includes('G059')");
    await page.wait(scaleNear(.7));
    await page.wait(contains("#save", "已保存"));
    await capture(page, "firelord-g059");
    await page.evaluate("window.__m2FirelordBeforeReload = true");
    await page.send("Page.reload");
    await page.wait("window.__m2FirelordBeforeReload !== true && " + read("#restart") + "?.disabled === false");
    await openManagement(page);
    await page.wait(contains("#structures", "火焰领主<SR> · G059"));
    await page.wait(scaleNear(.7));
    assert.equal(await page.evaluate(contains("#structures", "学习山崩 Lv2")), true);
    assert.equal(await page.evaluate(skin + " === undefined"), true);
  }
  async function readReplayEvidence(file, kind) {
    assert.ok(m3 && !origin, "Replay recovery requires the local M3 browser");
    const evidence = JSON.parse(await readFile(file, "utf8"));
    const { m3ContentVersion, m3ConfigVersion } = await import("../src/game/m2/m3-version.ts");
    const { mapVersion } = await import("../src/game/m2/map.ts");
    assert.equal(evidence.kind, kind);
    assert.deepEqual([evidence.contentVersion, evidence.configVersion, evidence.mapVersion],
      [m3ContentVersion, m3ConfigVersion, mapVersion]);
    assert.equal(createHash("sha256").update(JSON.stringify(evidence.snapshot)).digest("hex"), evidence.snapshotSha256);
    return evidence;
  }
  async function commitReplayedSnapshot(snapshot) {
    const { startSeasons } = await import("../src/game/m2/seasons.ts");
    const { firelordSkin } = await import("../src/game/m2/content.ts");
    const initialScore = startSeasons().score;
    const account = { claims: [], seasons: snapshot.seasons, appearance: snapshot.appearance,
      score: initialScore + (snapshot.seasonScore ?? 0) + (snapshot.eventScore ?? 0) +
        (snapshot.killScore ?? 0) - (snapshot.spentScore ?? 0),
      activityScore: snapshot.activityScore ?? 0, fragments: snapshot.fragments ?? 0, enabledSkins: [firelordSkin.unlock] };
    const setup = await openTab(base + "/src/game/m2/save.ts");
    await setup.wait("document.readyState === 'complete' && location.pathname.endsWith('save.ts')");
    await setup.evaluate(`(async () => {
      const {createM3SaveStore} = await import("/src/game/m2/save.ts");
      const valid = value => value && typeof value === "object";
      await createM3SaveStore(valid, valid).withWriter(session => session.commit(undefined, ${JSON.stringify(account)},
        ${JSON.stringify(snapshot)}, {source:"none"}));
    })()`);
    await setup.close();
    return account;
  }
  const replayCheckpoint = `(async () => {
    const {createM3SaveStore} = await import("/src/game/m2/save.ts");
    const valid = value => value && typeof value === "object";
    return createM3SaveStore(valid, valid).read();
  })()`;
  if (process.env.M3_TROOP_AURA_ONLY === "1") {
    assert.ok(m3 && !origin);
    const { newMatch } = await import("../src/game/m2/match.ts");
    const { startSeasons } = await import("../src/game/m2/seasons.ts");
    const state = newMatch("controlled-troop-aura", 811, startSeasons().seasons);
    const fixtures = [
      ["n213", -288, -640], ["n230", 288, -640], ["n233", -288, -352],
      ["n236", 288, -352], ["n001", -288, -160], ["n001", 288, 1152],
    ];
    state.structures = fixtures.map(([templateId, x, y], index) => ({
      id: 900 + index, templateId, x, y, radius: 72, population: 5, qualification: null, pending: null,
    }));
    state.openingCard = state.openingCandidates[0];
    state.population = state.structures.length * 5;
    state.nextId = 900 + state.structures.length;
    state.clock.paused = true;
    await commitReplayedSnapshot(state);
    const page = await openTab(url);
    const field = read("#field");
    const ready = `(${field}?.dataset.troopAuraSources?.split(",").length === 4 &&
      ${field}.dataset.troopAuraRecipients?.split(",").length === 5)`;
    try {
      await page.wait(ready);
    } catch (error) {
      console.error(await page.evaluate(`({field: {...${field}.dataset}})`));
      throw error;
    }
    const markers = () => page.evaluate(`({ sources: ${field}.dataset.troopAuraSources.split(",").map(Number),
      recipients: ${field}.dataset.troopAuraRecipients.split(",").map(Number) })`);
    const before = await markers();
    assert.deepEqual(before, { sources: [900, 901, 902, 903], recipients: [900, 901, 902, 903, 904] });
    await capture(page, "troop-aura-before-reload");
    await page.evaluate("window.__troopAuraBeforeReload = true");
    await page.send("Page.reload");
    await page.wait("window.__troopAuraBeforeReload !== true && " + ready);
    const restored = await markers();
    assert.deepEqual(restored, before);
    assert.deepEqual(runtimeErrors, []);
    await page.close();
    console.log(JSON.stringify({ status: "passed", kind: "controlled-browser-troop-aura", before, restored }));
  } else if (process.env.M3_R03_MALL_REPLAY) {
    const evidence = await readReplayEvidence(process.env.M3_R03_MALL_REPLAY, "replayed-normal-engine-r03");
    const { snapshot, material, offer, phase } = evidence;
    assert.deepEqual(snapshot.mallHeroClaims, ["i549"]);
    assert.ok(snapshot.cards.some(card => card.id === material && card.slot !== null));
    assert.equal(offer, "i548");
    await commitReplayedSnapshot(snapshot);
    const page = await openTab(urlForSeed(evidence.seed), `
      globalThis.__td3FramePerformance = sample => {
        globalThis.__r03Frames = (globalThis.__r03Frames ?? 0) + 1;
        globalThis.__r03LastFrame = { atUs: sample.atUs, backlogUs: sample.backlogUs, queuedEvents: sample.queuedEvents };
      };
    `);
    await page.wait(read("#restart") + "?.disabled === false");
    await openManagement(page);
    const offers = "document.querySelectorAll('#hero-exchange-offers button')";
    await page.wait(offers + ".length === 6");
    if (await page.evaluate(read("#hero-exchange") + "?.open === false")) await click(page, "#hero-exchange summary");
    const mall = index => `${offers}[${index}]`;
    assert.equal(await page.evaluate(mall(0) + ".disabled"), true);
    const before = await page.evaluate(replayCheckpoint);
    assert.equal(before.run.wave, evidence.wave);
    assert.equal(before.run.cards.some(card => card.id === material), true);
    if (phase === "before-41") {
      assert.equal(evidence.expected.reason, "stock");
      assert.equal(await page.evaluate(mall(1) + ".disabled"), true);
      assert.equal(await page.evaluate(mall(2) + ".disabled"), true);
      await page.evaluate(mall(1) + ".click()");
      const blocked = await page.evaluate(replayCheckpoint);
      assert.equal(blocked.run.cards.some(card => card.id === material), true);
      assert.deepEqual(blocked.run.mallHeroClaims, ["i549"]);
    } else {
      assert.equal(evidence.expected.ok, true);
      await page.wait(mall(1) + ".disabled === false");
      if (hardware) {
        const actualTower = snapshot.structures[0].templateId;
        await page.wait(read("#field") + "?.dataset.renderedTowers?.includes(" + JSON.stringify(actualTower) + ")");
        await page.wait("globalThis.__r03LastFrame?.backlogUs < 250000");
      }
      await page.evaluate(`(() => { const button = ${mall(1)}; button.click(); button.click(); })()`);
      const background = hardware ? undefined : await openTab("about:blank");
      await background?.send("Page.bringToFront");
      const hidden = await page.evaluate("document.hidden");
      const traded = await page.wait(`(async () => {
        const row = await (${replayCheckpoint});
        return row.run.mallHeroClaims?.length === 2 && row.revision > ${before.revision} && row;
      })()`, 1800).catch(async error => {
        const observed = await page.evaluate("({frames: globalThis.__r03Frames, last: globalThis.__r03LastFrame, hidden: document.hidden})");
        throw new Error("R03 transaction diagnostics " + JSON.stringify(observed), { cause: error });
      });
      await page.send("Page.bringToFront");
      await background?.close();
      console.log(JSON.stringify({ type: "m3-r03-mall-transaction", status: "persisted", wave: traded.run.wave, hidden,
        source: evidence.snapshotSha256, fromRevision: before.revision, toRevision: traded.revision }));
      assert.deepEqual(traded.run.mallHeroClaims, ["i549", "i548"]);
      assert.equal(traded.run.cards.some(card => card.id === material), false);
      assert.equal(traded.run.cards.filter(card => card.card === "i548").length, 1);
      assert.equal(traded.profile.score, before.profile.score);
      assert.equal(traded.run.seasons.spring.counts[9], before.run.seasons.spring.counts[9] + 1);
      await page.wait(mall(2) + ".disabled === true");
      await page.evaluate("window.__r03MallReload = true");
      await page.send("Page.reload");
      await page.wait("window.__r03MallReload !== true && " + read("#restart") + "?.disabled === false");
      await openManagement(page);
      await page.wait(mall(1) + ".disabled === true && " + mall(2) + ".disabled === true");
      const restored = await page.evaluate(replayCheckpoint);
      assert.deepEqual(restored.run.mallHeroClaims, traded.run.mallHeroClaims);
      assert.deepEqual(restored.run.cards, traded.run.cards);
    }
    assert.deepEqual(runtimeErrors, []);
    await page.close();
    console.log(JSON.stringify({ type: "m3-r03-mall-browser", status: "passed", phase, seed: evidence.seed,
      wave: evidence.wave, material, hardware, snapshotSha256: evidence.snapshotSha256,
      inputLogSha256: evidence.inputLogSha256 }));
  } else if (process.env.M3_R03_BROWSER === "1") {
    assert.ok(m3 && !origin, "R03 local UI evidence requires the M3 browser");
    const replay = process.env.M3_R03_INHERIT_SNAPSHOT;
    let evidence;
    let inherited;
    if (replay) {
      evidence = await readReplayEvidence(replay, "replayed-normal-engine-terminal");
      assert.equal(evidence.snapshot.phase, "won");
      inherited = await commitReplayedSnapshot(evidence.snapshot);
    }
    const page = await openTab(urlForSeed(evidence?.seed ?? 811));
    await page.wait(read("#restart") + "?.disabled === false");
    if (inherited) {
      await page.restart();
      await page.wait(contains("#feedback", "已重开"));
    }
    await openManagement(page);
    const starter = '[data-item-id="i004"]';
    await page.wait(read(starter) + "?.disabled === false");
    await click(page, starter);
    await page.wait(read("#choices button") + "?.disabled === false");
    await click(page, "#choices button");
    await page.wait(read("#opening") + "?.hidden");
    const initial = await page.wait(`(async () => {
      const row = await (${replayCheckpoint});
      return row.run.cards.length === 1 && row;
    })()`);
    const material = initial.run.cards[0].id;
    assert.equal(initial.profile.score, inherited?.score ?? 60);
    const details = "#hero-exchange";
    const offers = "document.querySelectorAll('#hero-exchange-offers button')";
    const paid = amount => `[...${offers}].find(button => button.textContent.includes(${JSON.stringify("＋ " + amount + " 积分")}))`;
    await openManagement(page);
    if (await page.evaluate(read(details) + "?.open === false")) await click(page, details + " summary");
    await page.wait(offers + ".length === 6");
    assert.equal(await page.evaluate(paid(100) + "?.disabled"), !inherited);
    await page.wait(paid(60) + "?.disabled === false");
    const debit = inherited ? 100 : 60;
    await page.evaluate(`(() => {const button = ${paid(debit)}; button.click(); button.click();})()`);
    const traded = await page.wait(`(async () => {
      const row = await (${replayCheckpoint});
      return row.run.scoreHeroClaimed && row.revision > ${initial.revision} && row;
    })()`);
    const reward = inherited ? "i506" : "i550";
    assert.equal(traded.run.cards.some(card => card.id === material), false);
    assert.deepEqual(traded.run.cards.map(card => card.card), [reward]);
    assert.equal(traded.profile.score, initial.profile.score - debit);
    assert.equal(traded.run.seasons.spring.counts[9], (initial.run.seasons.spring.counts[9] ?? 0) + 1);
    await page.evaluate("window.__r03Reload = true");
    await page.send("Page.reload");
    await page.wait("window.__r03Reload !== true && " + read("#restart") + "?.disabled === false");
    await openManagement(page);
    await page.wait(paid(100) + "?.disabled === true && " + paid(60) + "?.disabled === true");
    const restored = await page.evaluate(replayCheckpoint);
    assert.deepEqual(restored.run.cards, traded.run.cards);
    assert.equal(restored.profile.score, traded.profile.score);
    const follower = await openTab(urlForSeed(evidence?.seed ?? 811));
    await follower.wait(contains("#save", "等待档案写入权限"));
    await page.send("Page.navigate", { url: "about:blank" });
    await page.close();
    await follower.wait(read("#restart") + "?.disabled === false");
    const takeover = await follower.evaluate(replayCheckpoint);
    assert.equal(takeover.activeMatchId, traded.activeMatchId);
    assert.equal(takeover.run.scoreHeroClaimed, true);
    assert.deepEqual(takeover.run.cards, traded.run.cards);
    await follower.restart();
    await follower.wait(contains("#feedback", "已重开"));
    const next = await follower.evaluate(replayCheckpoint);
    assert.notEqual(next.activeMatchId, traded.activeMatchId);
    assert.equal(next.profile.score, traded.profile.score);
    assert.equal(next.run.scoreHeroClaimed, undefined);
    await follower.close();
    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ type: "m3-r03-score-browser", status: "passed", seed: evidence?.seed ?? 811,
      opening: initial.run.openingCard, material, debit, reward, score: [initial.profile.score, traded.profile.score, next.profile.score],
      revisions: [initial.revision, traded.revision, restored.revision, takeover.revision, next.revision],
      ...(evidence && { inheritedEvidenceSha256: evidence.snapshotSha256 }) }));
  } else if (process.env.M3_TERMINAL_REPLAY) {
    const evidence = await readReplayEvidence(process.env.M3_TERMINAL_REPLAY, "replayed-normal-engine-terminal");
    const { snapshot } = evidence;
    assert.equal(snapshot.phase, "won");
    assert.deepEqual(snapshot.enemies, []);
    const account = await commitReplayedSnapshot(snapshot);
    const page = await openTab(urlForSeed(evidence.seed));
    const terminalLabel = snapshot.result.reason === "timeout" ? "超时结算" : "已击杀肉山";
    await page.wait(read("#restart") + "?.disabled === false && " + contains("#wave", terminalLabel));
    assert.match(await page.evaluate(read("#resources") + ".textContent"),
      new RegExp(`结算 \\+${snapshot.killScore}`));
    const original = await page.evaluate(replayCheckpoint);
    assert.equal(original.profile.score, account.score);
    assert.equal(original.run.kills, snapshot.kills);
    assert.deepEqual(original.run.result, snapshot.result);
    assert.deepEqual(original.profile.seasons, snapshot.seasons);
    assert.deepEqual(original.run.seasons, snapshot.seasons);
    await page.evaluate("window.__terminalBeforeReload = true");
    await page.send("Page.reload");
    await page.wait("window.__terminalBeforeReload !== true && " + read("#restart") + "?.disabled === false && " + contains("#wave", terminalLabel));
    const refreshed = await page.evaluate(replayCheckpoint);
    assert.deepEqual(refreshed, original);
    await page.restart();
    await page.wait(contains("#feedback", "已重开"));
    const restarted = await page.evaluate(replayCheckpoint);
    assert.equal(restarted.profile.score, account.score);
    assert.notEqual(restarted.activeMatchId, original.activeMatchId);
    assert.equal(restarted.run.startingScore, account.score);
    assert.equal(restarted.run.killScore ?? 0, 0);
    assert.equal(restarted.run.phase, "running");
    assert.deepEqual(restarted.profile.seasons, snapshot.seasons);
    assert.deepEqual(restarted.run.seasons, snapshot.seasons);
    assert.equal(restarted.run.seasonRevision ?? 0, 0);
    assert.equal(restarted.run.seasonScore ?? 0, 0);
    let continuedSeason;
    if (process.env.M3_R04_CONTINUE === "1") {
      const { seasonDefinitions } = await import("../src/game/m2/seasons.ts");
      const expected = structuredClone(snapshot.seasons);
      const previous = expected.summer.counts[3];
      assert.ok(previous > 0 && previous + 1 < seasonDefinitions.summer.tasks["3"]["4"]);
      await openManagement(page);
      const starter = '[data-item-id="i004"]';
      const key = '[data-item-id="i411"]';
      await page.wait(read(starter) + "?.disabled === false");
      await click(page, starter);
      await page.wait(read("#choices button") + "?.disabled === false");
      await click(page, "#choices button");
      await page.wait(read("#opening") + "?.hidden && " + read(key) + "?.disabled === false");
      await click(page, key);
      const advanced = await page.wait(`(async () => {
        const row = await (${replayCheckpoint});
        return row.run.openedChests === 1 && row;
      })()`);
      expected.summer.counts[3] = previous + 1;
      assert.equal(advanced.activeMatchId, restarted.activeMatchId);
      assert.deepEqual(advanced.profile.seasons, expected);
      assert.deepEqual(advanced.run.seasons, expected);
      assert.equal(advanced.profile.score, account.score);
      await page.evaluate("window.__seasonBeforeReload = true");
      await page.send("Page.reload");
      await page.wait("window.__seasonBeforeReload !== true && " + read("#restart") + "?.disabled === false");
      const resumed = await page.evaluate(replayCheckpoint);
      assert.equal(resumed.activeMatchId, restarted.activeMatchId);
      assert.equal(resumed.run.openedChests, 1);
      assert.deepEqual(resumed.profile.seasons, expected);
      assert.deepEqual(resumed.run.seasons, expected);
      assert.equal(resumed.profile.score, account.score);
      continuedSeason = { task: "summer/3", counts: [previous, expected.summer.counts[3]], profile: expected, restoredRevision: resumed.revision };
    }
    assert.deepEqual(runtimeErrors, []);
    await page.close();
    console.log(JSON.stringify({ status:"passed", kind:"controlled-browser-recovery-of-replayed-normal-terminal",
      seed:evidence.seed, snapshotSha256:evidence.snapshotSha256, result:snapshot.result, kills:snapshot.kills,
      creditedFinisher:snapshot.finalHit?.towerId ?? null, earnedKillScore:snapshot.killScore,
      accountScore:account.score, revisions:[original.revision, refreshed.revision, restarted.revision],
      inheritedSeasons:restarted.profile.seasons, ...(continuedSeason && { continuedSeason }) }));
  } else if (process.env.M3_R05_REPLAY_SNAPSHOT) {
    const evidence = await readReplayEvidence(process.env.M3_R05_REPLAY_SNAPSHOT, "replayed-normal-engine-r05");
    const { snapshot, balances, consumed } = evidence;
    assert.equal(consumed.length, 3);
    const account = await commitReplayedSnapshot(snapshot);
    const page = await openTab(urlForSeed(evidence.seed));
    const available = read("#restart") + "?.disabled === false";
    await page.wait(available + " && " + read("#pause") + "?.disabled === false");
    if (await page.evaluate(read("#pause") + ".textContent") === "暂停") await click(page, "#pause");
    const paused = `(async () => {
      const row = await (${replayCheckpoint});
      return row?.activeMatchId === ${JSON.stringify(snapshot.matchId)} && row.run.clock.paused && row;
    })()`;
    function assertSettled(row) {
      assert.equal(row.run.activityScore, balances.activityScore);
      assert.equal(row.run.fragments, balances.fragments);
      assert.equal(row.run.eventScore, balances.eventScore);
      assert.ok(consumed.every(id => !row.run.inventory.some(item => item.id === id)));
      assert.equal(row.profile.activityScore, balances.activityScore);
      assert.equal(row.profile.fragments, balances.fragments);
      assert.equal(row.profile.score, account.score);
      assert.equal(row.profile.openGiftNum ?? 0, balances.openGiftNum);
    }
    const before = await page.wait(paused);
    assertSettled(before);
    await page.evaluate("window.__eventBoxesBeforeReload = true");
    await page.send("Page.reload");
    await page.wait("window.__eventBoxesBeforeReload !== true && " + available);
    const refreshed = await page.wait(paused);
    assertSettled(refreshed);
    await page.restart();
    await page.wait(contains("#feedback", "已重开"));
    const restarted = await page.evaluate(replayCheckpoint);
    assert.notEqual(restarted.activeMatchId, before.activeMatchId);
    assert.equal(restarted.run.activityScore, balances.activityScore);
    assert.equal(restarted.run.fragments, balances.fragments);
    assert.equal(restarted.run.eventScore ?? 0, 0);
    assert.equal(restarted.profile.score, account.score);
    assert.equal(restarted.profile.openGiftNum ?? 0, balances.openGiftNum);
    assert.deepEqual(runtimeErrors, []);
    await page.close();
    console.log(JSON.stringify({ status: "passed", kind: "browser-recovery-of-normal-event-box-replay", seed: evidence.seed,
      snapshotSha256: evidence.snapshotSha256, balances, consumed, accountScore: account.score,
      revisions: [before.revision, refreshed.revision, restarted.revision] }));
  } else if (process.env.M3_A18_REPLAY_SNAPSHOT) {
    const evidence = await readReplayEvidence(process.env.M3_A18_REPLAY_SNAPSHOT, "replayed-normal-engine-a18");
    const { snapshot, proof } = evidence;
    const sword = snapshot.inventory.find(item => item.id === proof.instanceId);
    assert.equal(sword?.itemId, proof.itemId);
    assert.equal(snapshot.seasons?.spring.counts[4] ?? 0, proof.after);
    assert.equal(proof.after - proof.before, proof.method === "forge" ? 1 : 0);
    await commitReplayedSnapshot(snapshot);
    const page = await openTab(urlForSeed(evidence.seed));
    const available = read("#restart") + "?.disabled === false";
    await page.wait(available);
    if (snapshot.phase === "running") {
      await page.wait(read("#pause") + "?.disabled === false");
      if (await page.evaluate(read("#pause") + ".textContent") === "暂停") await click(page, "#pause");
    }
    const savedSword = `(async () => {
      const row = await (${replayCheckpoint});
      if (row?.activeMatchId !== ${JSON.stringify(snapshot.matchId)} ||
          row.run.phase === "running" && !row.run.clock.paused) return null;
      const item = row.run.inventory.find(entry => entry.id === ${proof.instanceId});
      return { matchId:row.activeMatchId, revision:row.revision, phase:row.run.phase,
        progress:row.run.seasons.spring.counts[4] ?? 0, profileProgress:row.profile.seasons.spring.counts[4] ?? 0,
        opened:row.run.openedChests ?? 0,
        oldInputs:row.run.inventory.filter(entry => ${JSON.stringify(proof.consumedIds)}.includes(entry.id)).map(entry => entry.id),
        sameType:row.run.inventory.filter(entry => entry.itemId === ${JSON.stringify(proof.itemId)}).map(entry => entry.id).sort((a,b) => a-b),
        item:item && { id:item.id, type:item.itemId, slot:item.slot, owner:item.towerId ?? null, charges:item.charges } };
    })()`;
    const before = await page.wait(savedSword);
    assert.equal(before.progress, proof.after);
    assert.equal(before.profileProgress, proof.after);
    assert.equal(before.opened, snapshot.openedChests ?? 0);
    assert.deepEqual(before.oldInputs, []);
    assert.deepEqual(before.sameType, snapshot.inventory.filter(entry => entry.itemId === proof.itemId).map(entry => entry.id).sort((a, b) => a - b));
    assert.deepEqual(before.item, { id:sword.id, type:sword.itemId, slot:sword.slot, owner:sword.towerId ?? null, charges:sword.charges });
    await page.evaluate("window.__a18BeforeReload = true");
    await page.send("Page.reload");
    await page.wait("window.__a18BeforeReload !== true && " + available);
    const after = await page.wait(savedSword);
    // Reload can save the same progress in a new revision.
    const { revision: beforeRevision, ...beforeContent } = before;
    const { revision: afterRevision, ...afterContent } = after;
    assert.ok(afterRevision >= beforeRevision);
    assert.deepEqual(afterContent, beforeContent);
    assert.deepEqual(runtimeErrors, []);
    await page.close();
    console.log(JSON.stringify({ status:"passed", kind:"controlled-browser-recovery-of-replayed-normal-a18",
      seed:evidence.seed, snapshotSha256:evidence.snapshotSha256, proof, beforeRevision, stored:after }));
  } else if (process.env.M3_PAWN_ONLY === "1") {
    assert.ok(m3 && !origin, "M3 pawn evidence reads the local browser's ordinary autosaves");
    const page = await openTab(urlForSeed(47));
    const snapshot = `(async () => {
      const { createM3SaveStore } = await import('/src/game/m2/save.ts');
      return await createM3SaveStore(() => true, () => true).read();
    })()`;
    await openManagement(page);
    await page.wait(read('[data-item-id="i004"]') + "?.disabled === false");
    await click(page, '[data-item-id="i004"]');
    await page.wait(read("#choices button") + "?.disabled === false");
    await click(page, "#choices button");
    await page.wait(read("#opening") + "?.hidden");
    await openManagement(page);
    const drop = `[...document.querySelectorAll('#worker-items button')].filter(button => button.textContent === '丢下1级钥匙')`;
    await page.wait(drop + ".length === 2");
    await page.evaluate(drop + "[0].click()");
    await page.wait(drop + ".length === 1");
    await buyOrdinary(page, "i101");
    const sale = `[...document.querySelectorAll('.goods-detail button')].find(button => button.textContent === '出售 艺人面罩 · 312 金 · 工人')`;
    await page.wait(sale + "?.disabled === false");
    const before = await page.wait(`(async () => {
      const saved = await (${snapshot});
      return saved.run.inventory.some(item => item.itemId === 'i101') && saved;
    })()`);
    await capture(page, "l05-quote");
    await page.evaluate(sale + ".click()");
    await page.wait(sale + " === undefined");
    await click(page, "#pause");
    const after = await page.wait(`(async () => {
      const saved = await (${snapshot});
      return saved.revision > ${before.revision} && saved.run.clock.paused && !saved.run.inventory.some(item => item.itemId === 'i101') && saved;
    })()`);
    const benefit = after.run.lastWorkerBenefit?.atUs > before.run.queue.nowUs ? after.run.lastWorkerBenefit.amount : 0;
    assert.equal(after.run.gold - before.run.gold - benefit, 312);
    assert.equal(after.run.lumber, before.run.lumber);
    assert.deepEqual(after.run.shopRestock, before.run.shopRestock);
    await page.evaluate("window.__m3BeforePawnReload = true");
    await page.send("Page.reload");
    await page.wait("window.__m3BeforePawnReload !== true && " + read("#restart") + "?.disabled === false");
    await openManagement(page, "商店");
    assert.equal(await page.evaluate(sale + " === undefined"), true);
    const restored = await page.evaluate(snapshot);
    assert.equal(restored.run.gold, after.run.gold);
    assert.deepEqual(runtimeErrors, []);
    await page.close();
    console.log(JSON.stringify({ type: "m3-pawn-normal-browser", seed: 47, item: "i101", quote: 312,
      gold: [before.run.gold, after.run.gold, restored.run.gold], concurrentWorkerBenefit: benefit,
      stock: after.run.shopRestock.i101, status: "passed" }));
  } else if (process.env.M3_OPENING_ONLY === "1") {
    await checkM3Opening();
  } else if (process.env.M3_TERRAIN_ONLY === "1") {
    assert.ok(m3 && origin && process.env.M2_EVIDENCE_DIR, "The terrain capture needs a compiled M3 build and evidence directory");
    const page = await openTab(url);
    await page.send("Page.bringToFront");
    await page.wait(read("#field") + "?.dataset.ready === 'true' && " + read("#pause") + "?.disabled === false");
    assert.deepEqual(await page.evaluate(`(() => {
      const { terrainGrid, terrainDoodads, assetError } = document.querySelector("#field").dataset;
      return [terrainGrid, terrainDoodads, assetError ?? null];
    })()`), ["96x96", "69+90", null]);
    await click(page, "#pause");
    await page.wait(contains("#pause", "继续"));
    await capture(page, "terrain-oblique");
    await clickVisible(page, "#view-top");
    await page.wait(read("#field") + ".dataset.cameraPitch === '90'");
    await capture(page, "terrain-top");
    await clickVisible(page, "#view-oblique");
    await page.wait(read("#field") + ".dataset.cameraPitch === '45'");
    await openManagement(page);
    await click(page, "#builds button");
    await hover(page, 0, 0);
    await page.wait(read("#field") + ".dataset.placement === 'invalid'");
    await hover(page, -1792, 832);
    await page.wait(read("#field") + ".dataset.placement === 'invalid'");
    await hover(page, -2240, 832);
    await page.wait(read("#field") + ".dataset.placement === 'valid'");
    await capture(page, "terrain-build-preview");
    await place(page, -2240, 832);
    await click(page, "#pause");
    await page.wait(read("#field") + "?.dataset.renderedTowers.includes('n001')");
    await page.wait(read("#field") + "?.dataset.renderedEnemies.includes('m001')", 1800);
    await capture(page, "terrain-first-wave");
    assert.equal(await page.evaluate(`(() => {
      const gl = document.querySelector("#field").getContext("webgl2");
      return gl.getParameter(gl.VERTEX_ARRAY_BINDING) === null;
    })()`), true);
    await click(page, "#pause");
    await page.wait(contains("#pause", "继续"));
    for (const [width, height] of [[390, 844], [844, 390]]) {
      await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true });
      await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      await page.wait(`innerWidth === ${width} && document.documentElement.scrollWidth <= innerWidth`);
      const centre = await page.evaluate(`(() => {
        const box = document.querySelector("#field").getBoundingClientRect();
        return {x: box.left + box.width / 2, y: box.top + box.height / 2};
      })()`);
      const zoom = await page.evaluate(read("#field") + ".dataset.cameraZoom");
      const points = (dx, dy) => [{ id: 1, x: centre.x - dx, y: centre.y - dy }, { id: 2, x: centre.x + dx, y: centre.y + dy }];
      await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(20, 0) });
      await page.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(34, 7) });
      await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.wait(`Number(document.querySelector("#field").dataset.cameraZoom) > ${Number(zoom)}`);
      await click(page, "#reset-view");
      await capture(page, `terrain-mobile-${width}`);
    }
    const image = await page.evaluate('document.querySelector(".original-map-images img")?.src');
    await page.close();
    assert.ok(image, "Production preview exposes a same-origin map image");
    const helper = await openTab(image);
    await helper.wait("location.pathname.endsWith('.png') && document.readyState === 'complete'");
    const persisted = (usePreviousMap = false) => `new Promise((resolve, reject) => {
      const request = indexedDB.open("td3-m3");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction("profiles", ${JSON.stringify(usePreviousMap ? "readwrite" : "readonly")});
        const store = tx.objectStore("profiles"), get = store.get("current");
        get.onsuccess = () => {
          if (${usePreviousMap}) {
            get.result.run.mapVersion = "m2-map-5";
            store.put(get.result, "current");
          }
        };
        tx.oncomplete = () => { db.close(); resolve([get.result.run.mapVersion, get.result.activeMatchId, get.result.revision]); };
        tx.onabort = () => reject(tx.error);
      };
    })`;
    const oldSave = await helper.evaluate(persisted(true));
    await helper.close();
    const legacy = await openTab(url);
    await legacy.wait(contains("#placement-status", "旧地图存档已保留"));
    assert.equal(await legacy.evaluate(read("#pause") + ".disabled"), true);
    assert.deepEqual(await legacy.evaluate(persisted()), oldSave);
    await legacy.close();
    assert.deepEqual(runtimeErrors, []);
    console.log("M3 terrain: production assets, two camera views, placement, first wave, mobile gestures and prior map save retention passed");
  } else if (process.env.M3_COLD_ONLY === "1") {
    assert.ok(m3 && origin, "Cold start requires a production build");
    const runs = [];
    for (let trial = 0; trial < 3; trial++) {
      const page = await openTab("about:blank");
      await page.send("Page.bringToFront");
      await page.send("Network.enable");
      await page.send("Storage.clearDataForOrigin", { origin: new URL(url).origin, storageTypes: "indexeddb" });
      await page.send("Network.clearBrowserCache");
      await page.send("Network.setCacheDisabled", { cacheDisabled: true });
      await page.send("Network.emulateNetworkConditions", { offline: false, latency: 50, downloadThroughput: 2_500_000,
        uploadThroughput: 2_500_000, connectionType: "wifi" });
      await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `const ready = () => {
        const start = document.querySelector('#field')?.dataset.ready === 'true' &&
          document.querySelector('#restart')?.disabled === false;
        if (start) globalThis.__coldReadyMs = performance.now();
        else requestAnimationFrame(ready);
      }; requestAnimationFrame(ready);` });
      await page.send("Page.navigate", { url });
      const readyMs = await page.wait("globalThis.__coldReadyMs");
      await openManagement(page);
      await click(page, '[data-item-id="i004"]');
      await page.wait("document.querySelectorAll('#choices button:enabled').length === 4");
      const evidence = await page.evaluate(`({ resources: performance.getEntriesByType('resource').map(({ name, transferSize, duration, responseStatus }) =>
        ({ name, transferSize, duration, responseStatus })), visible: !document.hidden, browser: navigator.userAgent })`);
      runs.push({ readyMs, ...evidence, requestFailures: page.networkFailures });
      await page.close();
    }
    console.log(JSON.stringify({ url, throttling: { megabitsPerSecond: 20, latencyMs: 50 }, runs }, null, 2));
    assert.deepEqual(runtimeErrors, []);
    for (const trial of runs) {
      assert.ok(trial.visible);
      assert.ok(trial.readyMs <= 15_000, `cold startup ${trial.readyMs} ms`);
      assert.deepEqual(trial.requestFailures, []);
      assert.equal(trial.resources.some(entry => entry.responseStatus >= 400), false);
    }
  } else if (process.env.M3_MIGRATION === "1") {
    const { checkMigration } = await import("./m3-migration.mjs");
    await checkMigration({ openTab, base, runtimeErrors });
  } else if (process.env.M3_UPDATE_ROOT) {
    assert.ok(m3 && origin && new URL(origin).hostname === "127.0.0.1");
    const { configuration } = await import("../src/game/m2/content.ts");
    const { m3Persistence, m3ContentVersion, m3ConfigVersion } = await import("../src/game/m2/m3-version.ts");
    const root = path.resolve(process.env.M3_UPDATE_ROOT);
    const legacyBuild = path.resolve(process.env.M3_LEGACY_DIST);
    const candidateBuild = path.resolve(process.env.M3_CANDIDATE_DIST);
    const snapshot = ({ database, slot }) => `(async () => {
      if (!(await indexedDB.databases()).some(db => db.name === ${JSON.stringify(database)})) return null;
      return await new Promise((resolve, reject) => {
        const open = indexedDB.open(${JSON.stringify(database)}, 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const read = db.transaction("profiles").objectStore("profiles").get(${JSON.stringify(slot)});
          read.onsuccess = () => { db.close(); resolve(read.result ?? null); };
          read.onerror = () => { db.close(); reject(read.error); };
        };
      });
    })()`;
    const legacy = snapshot(configuration.persistence);
    const candidate = snapshot(m3Persistence);
    const artifactHash = async directory => createHash("sha256").update(await readFile(path.join(directory, "m2.html"))).digest("hex");
    async function switchBuild(directory) {
      const link = root + ".next";
      await symlink(directory, link, "dir");
      await rename(link, root);
    }
    async function readWhen(page, access, condition) {
      return page.wait(`(async () => {
        const row = await (${access});
        return row && (${condition}) ? row : null;
      })()`);
    }
    async function openBuild(page, directory) {
      if (page) await page.close();
      await switchBuild(directory);
      const served = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(protocolTimeout) });
      assert.equal(served.status, 200);
      const html = await served.text();
      assert.equal(createHash("sha256").update(html).digest("hex"), await artifactHash(directory));
      const entry = html.match(/<script\s+type="module"[^>]+src="([^"]+)"/)?.[1];
      assert.ok(entry);
      const reopened = await openTab(url, undefined, true);
      await reopened.wait(`${read('script[type="module"]')}?.getAttribute('src') === ${JSON.stringify(entry)}`);
      await reopened.wait(read("#pause") + "?.disabled === false");
      return reopened;
    }
    function assertSameState(actual, previous) {
      assert.ok(actual.revision >= previous.revision);
      assert.deepEqual({ ...actual, revision: previous.revision }, previous);
    }
    async function chooseAndPause(page, access) {
      const starter = '[data-item-id="i004"]';
      if (!await page.evaluate(read(starter) + "?.checkVisibility()")) await openManagement(page);
      await page.wait(read(starter) + "?.disabled === false && " + read(starter) + "?.checkVisibility()");
      await click(page, starter);
      await page.wait(read("#choices button") + "?.disabled === false");
      await click(page, "#choices button");
      await readWhen(page, access, "typeof row.run.openingCard === 'string'");
      await page.wait(read("#pause") + "?.disabled === false");
      if (!await page.evaluate(contains("#pause", "继续"))) await click(page, "#pause");
      await page.wait(contains("#pause", "继续"));
      return readWhen(page, access, "row.run.clock.paused && row.run.queue.nowUs === row.run.clock.targetUs");
    }
    let page = await openBuild(undefined, legacyBuild);
    const before = await chooseAndPause(page, legacy);
    assert.equal(before.formatVersion, 2);
    assert.equal(await page.evaluate(candidate), null);

    page = await openBuild(page, candidateBuild);
    const imported = await readWhen(page, candidate, `row.contentVersion === ${JSON.stringify(m3ContentVersion)}`);
    const archived = await page.evaluate(legacy);
    assertSameState(archived, before);
    assert.equal(imported.configVersion, m3ConfigVersion);
    assert.equal(imported.formatVersion, 3);
    assert.notEqual(imported.activeMatchId, before.activeMatchId);
    assert.deepEqual(imported.migration, { source: "m2", revision: archived.revision, activeMatchId: archived.activeMatchId, contentVersion: archived.contentVersion });
    assert.deepEqual(imported.profile, {
      ...before.profile,
      activityScore: before.profile.activityScore ?? 0,
      fragments: before.profile.fragments ?? 0,
      openGiftNum: before.profile.openGiftNum ?? 0
    });
    assert.equal(new Set(imported.run.openingCandidates).size, 4);
    const played = await chooseAndPause(page, candidate);

    page = await openBuild(page, legacyBuild);
    const restoredLegacy = await page.evaluate(legacy);
    assertSameState(restoredLegacy, archived);
    await click(page, "#speed");
    const rolledBack = await readWhen(page, legacy, `row.revision > ${restoredLegacy.revision} && row.run.clock.speed !== ${restoredLegacy.run.clock.speed}`);
    assert.equal(rolledBack.activeMatchId, before.activeMatchId);
    const archivedCandidate = await page.evaluate(candidate);
    assertSameState(archivedCandidate, played);

    page = await openBuild(page, candidateBuild);
    const resumed = await page.evaluate(candidate);
    assertSameState(resumed, archivedCandidate);
    assertSameState(await page.evaluate(legacy), rolledBack);
    await page.close();
    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ type: "local-same-origin-production-build-rollback", status: "passed", url,
      old: { version: before.contentVersion, initial: before.revision, resumed: rolledBack.revision, matchId: before.activeMatchId, htmlSha256: await artifactHash(legacyBuild) },
      m3: { version: played.contentVersion, configuration: played.configVersion, revision: resumed.revision,
        matchId: played.activeMatchId, candidates: played.run.openingCandidates, selected: played.run.openingCard, htmlSha256: await artifactHash(candidateBuild) } }));
  } else if (process.env.M2_UPDATE_ROOT) {
    assert.ok(!m3, "M2_UPDATE_ROOT checks historical M2 builds. Use M3_MIGRATION for M3.");
    assert.ok(origin && new URL(origin).hostname === "127.0.0.1");
    const { configuration, contentVersion } = await import("../src/game/m2/content.ts");
    const { database, slot } = configuration.persistence;
    const root = path.resolve(process.env.M2_UPDATE_ROOT);
    const preview = path.resolve(process.env.M2_PREVIEW1_DIST);
    const candidate = path.resolve(process.env.M2_CANDIDATE_DIST);
    async function switchBuild(directory) {
      const next = root + ".next";
      await symlink(directory, next, "dir");
      await rename(next, root);
    }
    const snapshot = `(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(${JSON.stringify(database)}, 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return new Promise((resolve, reject) => {
        const request = db.transaction("profiles", "readonly").objectStore("profiles").get(${JSON.stringify(slot)});
        request.onsuccess = () => { db.close(); resolve(request.result); };
        request.onerror = () => { db.close(); reject(request.error); };
      });
    })()`;
    async function readWhen(page, condition) {
      return page.wait(`(async () => {
        const current = await (${snapshot});
        return current && (${condition}) ? current : null;
      })()`);
    }
    await switchBuild(preview);
    const page = await openTab(url);
    await page.wait(read('[data-item-id="i004"]') + "?.disabled === false");
    await click(page, '[data-item-id="i004"]');
    await page.wait(read("#choices button") + "?.disabled === false");
    await click(page, "#choices button");
    const played = await readWhen(page, "current.run.openingCard === 'i564'");
    assert.equal(played.contentVersion, "m2-core-12");
    await click(page, "#pause");
    const before = await readWhen(page, "current.run.clock.paused && current.run.queue.nowUs === current.run.clock.targetUs");

    await switchBuild(candidate);
    await page.send("Page.reload", { ignoreCache: true });
    await page.wait(read("#speed") + "?.disabled === false");
    await click(page, "#speed");
    const updated = await readWhen(page, `current.contentVersion === ${JSON.stringify(contentVersion)} && current.run.clock.speed === 4`);
    assert.equal(updated.activeMatchId, before.activeMatchId);
    assert.equal(updated.run.queue.nowUs, before.run.queue.nowUs);
    assert.deepEqual(updated.run.commandResults, before.run.commandResults);
    assert.deepEqual(updated.profile, before.profile);

    await switchBuild(preview);
    await page.send("Page.reload", { ignoreCache: true });
    await page.wait(contains("#save", "不兼容"));
    assert.equal(await page.evaluate(read("#restart") + ".disabled"), true);
    const rollback = await page.evaluate(snapshot);
    assert.deepEqual(rollback, updated);

    await switchBuild(candidate);
    await page.send("Page.reload", { ignoreCache: true });
    await page.wait(read("#speed") + "?.disabled === false");
    const resumed = await page.evaluate(snapshot);
    assert.ok(resumed.revision >= updated.revision);
    assert.deepEqual({ ...resumed, revision: updated.revision }, updated);
    await page.close();
    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ type: "controlled-same-origin-build-rehearsal", url,
      preview: before.contentVersion, candidate: updated.contentVersion, slot,
      matchId: updated.activeMatchId, revisions: [before.revision, updated.revision, rollback.revision, resumed.revision],
      rollbackRetainedOriginal: true, resumedAfterRestoringCandidate: true }, null, 2));
  } else if (process.env.M2_BATTLE_ACTIONS_ONLY === "1") {
    assert.ok(!origin);
    const setup = await openTab(base + "/src/game/m2/save.ts");
    await setup.wait("location.pathname.endsWith('/save.ts') && document.readyState === 'complete'");
    const events = await setup.evaluate(`(async () => {
      const { ${storeFactory}: createM2SaveStore } = await import("/src/game/m2/save.ts");
      const { newMatch, drain } = await import("/src/game/m2/match.ts");
      const { scheduleEvent } = await import("/src/game/event-queue.ts");
      const { weapons } = await import("/src/game/m2/combat.ts");
      const run = newMatch(crypto.randomUUID(), 811);
      run.queue.pending.length = 0;
      scheduleEvent(run.queue, 1, { type: "start-wave", index: 0 });
      run.clock.targetUs = 1;
      drain(run, 1000);
      const point = { x: 0, y: -96 };
      const enemy = Object.assign(run.enemies[0], { ...point, hp: 50, armor: 0 });
      const reanimated = { ...enemy, id: 900, unitId: "m571", x: 160, maxHp: 400, abilities: ["N582"] };
      const caster = { ...enemy, id: 903, unitId: "m032", x: 310, hp: 800, mana: 200, manaMax: 200, abilities: ["N519"] };
      const phoenix = { ...enemy, id: 904, unitId: "m050", x: -310, mana: 300, manaMax: 300, abilities: ["N576"] };
      run.enemies = [enemy, reanimated, caster, phoenix];
      const tower = { ...point, id: 901, templateId: "n001", radius: 0, pending: null, qualification: null };
      const summon = { ...tower, id: 902, templateId: "b122", x: -180 };
      run.structures = [tower];
      run.summons = [summon];
      run.queue.pending.length = 0;
      for (const target of [enemy, reanimated]) scheduleEvent(run.queue, 1, { type: "weapon-impact", travelUs: 0, shot: {
        towerId: tower.id, targetId: target.id, sourceTemplate: tower.templateId, destination: target,
        weapon: { ...weapons.n001[0], homing: false, attackType: "chaos" }, point, raw: 200,
      } });
      scheduleEvent(run.queue, 1, { type: "summon-expire", unitId: summon.id });
      scheduleEvent(run.queue, 1, { type: "enemy-cast", enemyId: caster.id, skill: "N519", targetId: -1, point: run.worker });
      scheduleEvent(run.queue, 1, { type: "enemy-cast", enemyId: phoenix.id, skill: "N576", point: phoenix });
      run.clock.targetUs = 90_000;
      drain(run, 1000);
      run.clock.paused = true;
      const valid = value => value && typeof value === "object";
      await createM2SaveStore(valid, valid).withWriter(session => session.commit(undefined, { score: 0, claims: [] }, run${initialMigration}));
      return run.battleAnimations;
    })()`);
    assert.deepEqual(events.map(event => [event.unitId, event.kind]), [["m001", "death"], ["m571", "revive"], ["b122", "death"]]);
    await setup.close();
    const page = await openTab(url);
    const playback = read("#field") + "?.dataset.battleDeaths === 'm001,b122' && " +
      read("#field") + "?.dataset.battleRevives === 'm571' && " + read("#field") + "?.dataset.renderedEnemies.includes('m571') && " +
      read("#field") + "?.dataset.castingEnemies.includes('m032') && " +
      read("#field") + "?.dataset.renderedEnemies.split(',').includes('b138') && !" + read("#field") + "?.dataset.renderedEnemies.split(',').includes('m050')";
    await page.wait(playback);
    await capture(page, "battle-death-and-revive");
    await page.send("Page.reload");
    await page.wait(playback);
    await page.close();
    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ type: "controlled-browser-battle-actions", casting: "m032/N519", egg: "m050/N576 → b138",
      events, reloaded: true }, null, 2));
  } else if (process.env.M2_MODEL_LIBRARY_ONLY === "1") {
    assert.ok(!origin, "Model library inspection needs the local Vite source server");
    const manifest = JSON.parse(await readFile("src/assets/m2/models.json", "utf8"));
    const bindings = JSON.parse(await readFile("src/assets/m2/bindings.json", "utf8"));
    const entries = Object.entries(manifest).map(([asset, definition]) => ({
      asset, textureCount: Object.keys(definition.textures).length, loop: definition.loop,
      ...(m3 && { actions: definition.static ? [] : ["Stand", ...(!definition.noWalk && !definition.staticStructure ? ["Walk"] : []),
        "Attack", "Death", "Spell"] })
    }));
    const loaded = {};
    for (let first = 0; first < entries.length; first += 12) {
      const page = await openTab(base + "/src/game/m2/save.ts");
      await page.wait("location.pathname.endsWith('/save.ts') && document.readyState === 'complete'");
      const batch = entries.slice(first, first + 12);
      Object.assign(loaded, await page.evaluate(`(async () => {
        const { loadM2Model } = await import("/src/m2-models.ts");
        const { PerspectiveCamera } = await import("/node_modules/three/build/three.module.js");
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl2");
        const camera = new PerspectiveCamera(45, 1, .01, 30);
        camera.position.set(0, 2, 4);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        gl.viewport(0, 0, canvas.width, canvas.height);
        const frames = {};
        for (const entry of ${JSON.stringify(batch)}) {
          try {
            const model = await loadM2Model(entry.asset, gl);
            const start = model(camera, 0, 0, 0, 0).frame;
            const later = model(camera, 0, 0, 0, 127).frame;
            const actions = {};
            for (const clip of entry.actions ?? []) {
              const start = model(camera, 0, 0, 0, 0, clip);
              const later = model(camera, 0, 0, 0, 127, clip);
              actions[clip] = { start: start.frame, later: later.frame, substitute: later.substitute, progress: later.progress };
            }
            const error = gl.getError();
            if (error !== gl.NO_ERROR) throw new Error("WebGL error " + error);
            frames[entry.asset] = { textureCount: entry.textureCount, loop: entry.loop, start, later, ...(entry.actions && { actions }) };
          } catch (error) {
            frames[entry.asset] = { error: String(error) };
          }
        }
        return frames;
      })()`));
      if (process.env.M2_EVIDENCE_DIR && m3) {
        await mkdir(process.env.M2_EVIDENCE_DIR, { recursive: true });
        const taken = Object.fromEntries(batch.map(({asset}) => [asset, loaded[asset]]));
        await writeFile(path.join(process.env.M2_EVIDENCE_DIR, `asset-batch-${first / 12 + 1}.json`), JSON.stringify(taken, null, 2) + "\n");
      }
      await page.close();
    }
    assert.deepEqual(runtimeErrors, []);
    for (const [id, binding] of Object.entries(bindings)) assert.ok(loaded[binding.asset], id);
    console.log(JSON.stringify({ type: "browser-model-library", assets: loaded, bindings }, null, 2));
    assert.deepEqual(Object.keys(loaded).filter(asset => loaded[asset].error), []);
  } else if (process.env.M2_MODEL_ACTIONS_ONLY === "1") {
    assert.ok(!origin);
    const review = JSON.parse(await readFile("docs/evidence/m2-core-13/model-action-substitutes.json", "utf8"));
    const entries = review.entries.map(({ id, missingNativeActions }) => ({ id, missingNativeActions }));
    const setup = await openTab(base + "/src/game/m2/save.ts");
    await setup.wait("location.pathname.endsWith('/save.ts') && document.readyState === 'complete'");
    await setup.evaluate(`(async () => {
      const { ${storeFactory}: createM2SaveStore } = await import("/src/game/m2/save.ts");
      const { newMatch, drain } = await import("/src/game/m2/match.ts");
      const { scheduleEvent } = await import("/src/game/event-queue.ts");
      const valid = value => value && typeof value === "object";
      const run = newMatch(crypto.randomUUID(), 811);
      run.queue.pending.length = 0;
      scheduleEvent(run.queue, 1, { type: "start-wave", index: 0 });
      run.clock.targetUs = 1;
      drain(run, 10_000);
      const [enemy] = run.enemies;
      run.enemies = [Object.assign(enemy, { x: 0, y: 0, hp: 1e9, maxHp: 1e9, speed: 0 })];
      run.queue.pending.length = 0;
      for (const [index, entry] of ${JSON.stringify(entries)}.entries()) {
        run.structures.push({ id: 900 + index, templateId: entry.id, x: 160 * (index % 6 - 2.5),
          y: 150 * (Math.floor(index / 6) - 1.5), population: 1, radius: 0, pending: null, qualification: null });
      }
      run.population = run.structures.length;
      scheduleEvent(run.queue, 31_250, { type: "movement" }, 31_250);
      run.clock.paused = true;
      await createM2SaveStore(valid, valid).withWriter(session => session.commit(undefined, { score: 0, claims: [] }, run${initialMigration}));
    })()`);
    await setup.close();
    const page = await openTab(url);
    await page.wait(read("#pause") + "?.disabled === false && " + contains("#pause", "继续"));
    await page.wait(`(() => {
      const rendered = new Set(document.querySelector("#field").dataset.renderedTowers?.split(","));
      return ${JSON.stringify(entries.map(entry => entry.id))}.every(id => rendered.has(id));
    })()`);
    await page.evaluate(`window.verifiedM2Actions = {};
      const field = document.querySelector("#field");
      new MutationObserver(() => {
        for (const entry of (field.dataset.towerActionSubstitutes ?? "").split(",")) {
          const [id, action, progress] = entry.split(":");
          if (Number(progress) > 0) window.verifiedM2Actions[id + ":" + action] ??= Number(progress);
        }
      }).observe(field, { attributes: true, attributeFilter: ["data-tower-action-substitutes"] });
      true`);
    const keys = action => JSON.stringify(entries.filter(entry => entry.missingNativeActions.includes(action))
      .map(entry => entry.id + ":" + action));
    await click(page, "#pause");
    await page.wait(keys("Attack") + ".every(key => window.verifiedM2Actions[key])");
    await capture(page, "model-action-substitutes");
    await page.evaluate(`[...document.querySelectorAll("#structures button")].filter(button => button.textContent === "回收")
      .forEach(button => button.click())`);
    await page.wait(keys("Death") + ".every(key => window.verifiedM2Actions[key])");
    const actions = await page.evaluate("window.verifiedM2Actions");
    await page.close();
    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ type: "controlled-browser-model-action-substitutes", seed: 811,
      attack: "ordinary weapon", death: "UI recycle", actions }, null, 2));
  } else if (process.env.M2_WOLF_RAIN_ONLY === "1") {
    assert.ok(!origin);
    const setup = await openTab(base + "/src/game/m2/save.ts");
    await setup.wait("location.pathname.endsWith('/save.ts') && document.readyState === 'complete'");
    const matchId = await setup.evaluate(`(async () => {
      const { ${storeFactory}: createM2SaveStore } = await import("/src/game/m2/save.ts");
      const { newMatch, drain } = await import("/src/game/m2/match.ts");
      const { scheduleEvent } = await import("/src/game/event-queue.ts");
      const valid = value => value && typeof value === "object";
      const run = newMatch(crypto.randomUUID(), 811);
      run.queue.pending.length = 0;
      scheduleEvent(run.queue, 1, { type: "start-wave", index: 0 });
      run.clock.targetUs = 1;
      drain(run, 10_000);
      const [enemy] = run.enemies;
      Object.assign(enemy, { x: 500, y: 280, hp: 1_000_000, maxHp: 1_000_000, speed: 0 });
      run.enemies = [enemy];
      run.queue.pending.length = 0;
      const tower = (id, templateId, x, y) => ({
        id, templateId, x, y, pending: null, qualification: null, population: 5, radius: 72,
      });
      run.structures.push(tower(900, "n173", -225, 0), tower(901, "n174", 380, 455),
        tower(902, "n001", -50, 355), tower(903, "n006", 105, 390), tower(904, "n021", -170, -350));
      run.population = 25;
      scheduleEvent(run.queue, 31_250, { type: "movement" }, 31_250);
      run.clock.paused = true;
      await createM2SaveStore(valid, valid).withWriter(session => session.commit(undefined, { score: 0, claims: [] }, run${initialMigration}));
      return run.matchId;
    })()`);
    await setup.close();
    const page = await openTab(url);
    await page.wait(read("#field") + "?.dataset.ready === 'true'");
    await page.wait(read("#pause") + "?.disabled === false && " + contains("#pause", "继续"));
    await click(page, "#pause");
    const [arrows, impacts, ...attackSubstitutes] = await Promise.all([
      page.wait("Number(" + read("#field") + "?.dataset.swordRainArrows) || null"),
      page.wait("Number(" + read("#field") + "?.dataset.swordRainImpacts) || null"),
      ...["n001", "n006"].map(id => page.wait(`(() => {
        const source = document.querySelector("#field").dataset.towerActionSubstitutes ?? "";
        const match = source.split(",").find(entry => entry.startsWith("${id}:Attack:"));
        return match && Number(match.split(":")[2]) > 0 ? match : null;
      })()`)),
    ]);
    await capture(page, "sword-rain");
    const wolfSelector = "[data-wolf-id]";
    await page.wait(read(wolfSelector));
    const wolfId = await page.evaluate(read(wolfSelector) + ".dataset.wolfId");
    const wolfRow = `[data-wolf-id="${wolfId}"]`;
    await click(page, wolfRow + " button");
    await page.wait(read("#field") + "?.dataset.placement === 'wolf'");
    await click(page, "#rotate-right");
    await place(page, 225, 0);
    await page.wait(read("#field") + "?.dataset.walkingWolves.split(',').includes(" + JSON.stringify(wolfId) + ") && " +
      read("#field") + "?.dataset.renderedTowers.includes('b103')");
    const attack = `[...document.querySelectorAll('${wolfRow} button')].find(button => button.textContent === "攻击目标")`;
    await page.wait(attack + "?.disabled === false");
    await page.evaluate(attack + ".click()");
    await page.wait(contains(wolfRow, "追击"));
    await click(page, "#pause");
    await page.wait(contains("#pause", "继续"));
    const readOrder = `(async () => {
      const { ${storeFactory}: createM2SaveStore } = await import("/src/game/m2/save.ts");
      const valid = value => value && typeof value === "object";
      const row = await createM2SaveStore(valid, valid).read();
      const unit = row.run.summons?.find(entry => entry.id === Number(${JSON.stringify(wolfId)}));
      return row.run.clock.paused && unit?.wolfOrder?.type === "attack"
        ? { matchId: row.run.matchId, order: unit.wolfOrder.type, targetId: unit.wolfOrder.targetId,
            contentVersion: row.contentVersion } : null;
    })()`;
    const stored = await page.wait(readOrder);
    await capture(page, "wolf-order");
    assert.equal(stored.matchId, matchId);
    await page.send("Page.reload");
    await page.wait(contains(wolfRow, "追击"));
    const restored = await page.wait(readOrder);
    assert.deepEqual(restored, stored);
    const stop = `[...document.querySelectorAll('${wolfRow} button')].find(button => button.textContent === "停止灵兽")`;
    await page.wait(stop + "?.disabled === false");
    await page.evaluate(stop + ".click()");
    await click(page, "#pause");
    await page.wait(contains(wolfRow, "待命"));
    await click(page, wolfRow + " button");
    await page.wait(read("#field") + "?.dataset.placement === 'wolf'");
    await page.wait("!(" + read(wolfRow) + ")");
    assert.equal(await page.evaluate(read("#field") + "?.dataset.placement"), "idle");
    const removalSubstitutes = [];
    for (const id of ["n001", "n006", "n021"]) {
      const recycle = `[...document.querySelectorAll("#structures > div")].find(row => row.firstElementChild?.textContent.includes(" · ${id}"))
        ?.querySelector("button:last-child")`;
      await page.wait(recycle + "?.textContent === '回收'");
      await page.evaluate(recycle + ".click()");
      removalSubstitutes.push(await page.wait(`(() => {
        const source = document.querySelector("#field").dataset.towerActionSubstitutes ?? "";
        const match = source.split(",").find(entry => entry.startsWith("${id}:Death:"));
        return match && Number(match.split(":")[2]) > 0 ? match : null;
      })()`));
    }
    await page.close();
    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ type: "controlled-browser-wolf-rain", wolfId: Number(wolfId), visual: { arrows, impacts }, stored, restored,
      movement: "rotated map click and Walk", stopped: true, expiredSelectionCleared: true,
      attackSubstitutes, removalSubstitutes }, null, 2));
  } else if (process.env.M3_WORKER_TITLE_ONLY === "1") {
    assert.ok(m3 && origin, "The title check requires a compiled M3 build");
    const page = await openTab(url);
    await page.send("Page.bringToFront");
    const title = ".worker-title";
    const label = "国泰民安";
    const shown = contains(title, label) + " && " + read(title) + "?.checkVisibility()";
    await page.wait(read("#field") + "?.dataset.ready === 'true' && " + read("#pause") + "?.disabled === false");
    assert.equal(await page.evaluate(read(title) + "?.checkVisibility()"), false);
    await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await openAppearanceGroup(page, "工人称号");
    const selector = appearanceButton("工人称号", "S719");
    const control = read(selector);
    await page.wait(control + "?.checkVisibility() && !" + control + ".disabled");
    assert.equal(await page.evaluate(control + ".textContent"), label);
    assert.ok(await page.evaluate(control + ".querySelector('img')?.src.includes('gtma')"));
    await page.evaluate(read(appearanceGroup("工人称号")) + ".parentElement.scrollIntoView({ block: 'start' })");
    await capture(page, "worker-appearance-icons");
    const revision = await page.evaluate(read("#save") + ".textContent");
    await click(page, selector);
    await page.wait(shown);
    await page.wait(control + ".getAttribute('aria-pressed') === 'true'");
    await closeManagement(page);
    await page.wait(contains("#save", "已保存") + " && " + read("#save") + ".textContent !== " + JSON.stringify(revision));
    await capture(page, "worker-title-selected");
    await page.send("Page.reload");
    await page.wait(shown);
    await capture(page, "worker-title-restored");
    await page.restart();
    await page.wait(shown);
    await page.close();
    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ titleId: "S719", label, visible: true, retainedOnReload: true, inheritedOnRestart: true }));
  } else if (process.env.M2_APPEARANCE_ONLY === "1") {
    async function openAppearancePage() {
      const tab = await openTab(url);
      await tab.send("Emulation.setDeviceMetricsOverride", { width: 900, height: 640, deviceScaleFactor: 1, mobile: false });
      return tab;
    }
    let page = await openAppearancePage();
    await page.wait(read("#field") + "?.dataset.workerModel === 'w001'");
    await page.wait(read("#pause") + "?.disabled === false");
    const choose = async (label, id) => {
      await openAppearanceGroup(page, label);
      const selector = appearanceButton(label, id);
      await page.wait(read(selector) + "?.disabled === false");
      if (!await page.evaluate(contains("#pause", "继续"))) {
        await click(page, "#pause");
        await page.wait(contains("#pause", "继续"));
      }
      await click(page, selector);
      await click(page, "#pause");
      await page.wait(contains("#feedback", "操作已执行"));
      await click(page, "#pause");
      await page.wait(contains("#pause", "继续"));
    };
    const models = [];
    for (const [index, choice] of ["S002", "S003", "S004", "S005", "S006", "S007", "S008", "S009", "S010",
      "S511", "S512", "S513", "S514", "S515", "S516", "S517", "S518"].entries()) {
      const unit = "g" + String(index + 2).padStart(3, "0");
      await choose("工人外观", choice);
      await page.wait(read("#field") + `?.dataset.workerModel === '${unit}'`, 170);
      models.push({ unit, choice, frame: await page.evaluate(read("#field") + ".dataset.workerModelFrame") });
    }
    const cosmetics = [];
    for (const [label, field, attachment] of [["工人光环", "workerAura", false], ["工人羽翼", "workerAttachments", true],
      ["工人装饰", "workerAttachments", true], ["工人称号", null, false]]) {
      const control = read(appearanceGroup(label));
      const choices = await page.evaluate(`[...${control}.querySelectorAll('button:enabled')].filter(option => option.value)
        .map(option => [option.value, option.textContent])`);
      for (const [id, name] of choices) {
        await choose(label, id);
        if (field) {
          const value = read("#field") + `?.dataset.${field}`;
          await page.wait(attachment ? value + `?.split(",").includes("${id}")` : value + ` === "${id}"`);
        } else await page.wait(contains(".worker-title", name));
        cosmetics.push(id);
      }
    }
    const gated = [
      ["能量圈外观", "S542", "circleModel", "g200"], ["能量圈外观", "S547", "circleModel", "g202"],
      ["工人光环", "S543", "workerAura", "S543"], ["工人光环", "S549", "workerAura", "S549"],
      ["工人羽翼", "S604", "workerAttachments", "S604"], ["工人羽翼", "S607", "workerAttachments", "S607"],
    ];
    for (const [label, id] of gated) assert.equal(await page.evaluate(read(appearanceButton(label, id)) + ".disabled"), true);
    await choose("能量圈外观", "S545");
    await page.wait(read("#field") + "?.dataset.circleModel === 'g201'");
    await choose("工人光环", "S537");
    await page.wait(read("#field") + "?.dataset.workerAura === 'S537'");
    await choose("工人羽翼", "S603");
    await page.wait(read("#field") + "?.dataset.workerAttachments.includes('S603')");
    await choose("工人装饰", "S900");
    await page.wait(read("#field") + "?.dataset.workerAttachments.includes('S900')");
    await choose("工人称号", "S719");
    await page.wait(contains(".worker-title", "国泰民安"));
    assert.equal(await page.evaluate(read("#field") + ".dataset.assetError"), undefined);
    await page.wait(contains("#save", "已保存"));
    await page.send("Page.reload");
    await page.wait(read("#field") + "?.dataset.workerModel === 'g018'");
    await page.wait(read("#field") + "?.dataset.workerAura === 'S537'");
    await page.wait(read("#restart") + "?.disabled === false");
    await page.restart();
    await page.wait(read("#field") + "?.dataset.workerModel === 'g018'");
    await choose("工人光环", "");
    await page.wait(read("#field") + "?.dataset.workerAura === ''");
    await page.close();
    if (!origin) {
      const setup = await openTab(base + "/src/game/m2/save.ts");
      await setup.wait("location.pathname.endsWith('/save.ts') && document.readyState === 'complete'");
      await setup.evaluate(`(async () => {
        const { newMatch } = await import("/src/game/m2/match.ts");
        const { creditSeason, startSeasons, seasonDefinitions } = await import("/src/game/m2/seasons.ts");
        const { ${storeFactory}: createM2SaveStore } = await import("/src/game/m2/save.ts");
        const initial = startSeasons();
        for (const season of ["spring", "summer"]) for (const [id, data] of Object.entries(seasonDefinitions[season].tasks)) {
          initial.score += creditSeason(initial.seasons, season, Number(id), data["4"]);
        }
        const newRun = newMatch(crypto.randomUUID(), 811, initial.seasons);
        newRun.clock.paused = true;
        const valid = value => value && typeof value === "object";
        await createM2SaveStore(valid, valid).withWriter(session => session.restart(session.checkpoint,
          { ...initial, claims: [] }, newRun));
      })()`);
      await setup.close();
      page = await openAppearancePage();
      for (const [label, id, field, expected] of gated) {
        await choose(label, id);
        await page.wait(read("#field") + `?.dataset.${field}.split(",").includes("${expected}")`);
      }
      await page.wait(contains("#save", "已保存"));
      await page.send("Page.reload");
      await page.wait(read("#field") + "?.dataset.workerAura === 'S549' && " +
        read("#field") + "?.dataset.workerAttachments.includes('S607')");
      await page.close();
    }
    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ type: "appearance-browser", models, cosmetics, gated: gated.map(([, id]) => id),
      gatedUnlocked: origin ? [] : gated.map(([, id]) => id), circle: "g201", aura: "S537",
      wings: "S603", accent: "S900", title: "S719", reload: true, restart: true, remove: true }, null, 2));
  } else if (process.env.M2_WORKER_RESUME_ONLY === "1") {
    assert.equal(origin, undefined, "The worker resume fixture requires the local Vite server");
    const setup = await openTab(base + "/");
    const before = await setup.evaluate(`(async () => {
      const { ${storeFactory}: createM2SaveStore } = await import("/src/game/m2/save.ts");
      const { drain, enqueue, newMatch } = await import("/src/game/m2/match.ts");
      const valid = value => value && typeof value === "object";
      const run = newMatch(crypto.randomUUID(), 811);
      const start = run.worker;
      run.inventory.push({ id: 900, itemId: "i308", charges: 0, slot: null, point: { x: 288, y: -160 } });
      enqueue(run, { id: "worker-pickup", matchId: run.matchId, action: { type: "pick-up-item", itemId: 900 } });
      run.clock.targetUs = 250_000;
      while (drain(run, 1000) === "pending") {}
      if (run.approach?.command.id !== "worker-pickup" || run.worker.x === start.x) {
        throw new Error("Worker did not reach an in-progress pickup before the checkpoint");
      }
      run.clock.paused = true;
      await createM2SaveStore(valid, valid).withWriter(session => session.commit(undefined, { score: 0, claims: [] }, run${initialMigration}));
      return { position: run.worker, tick: run.queue.nowUs, matchId: run.matchId };
    })()`);
    await setup.close();
    const page = await openTab(url);
    await page.wait(contains("#pause", "继续") + " && " + read("#pause") + "?.disabled === false");
    await page.wait(contains("#placement-status", "工人正在前往拾取物品。"));
    await page.wait(read("#field") + ".dataset.workerModel === 'w001' && " +
      read("#field") + ".dataset.workerModelClip === 'Walk'");
    const walkFrame = await page.evaluate(read("#field") + ".dataset.workerModelFrame");
    await click(page, "#pause");
    await page.wait(contains("#feedback", "操作已执行。"));
    await page.wait("!" + contains("#placement-status", "工人正在前往拾取物品。"));
    await page.wait(read("#field") + ".dataset.workerModelClip === 'Stand'");
    const standFrame = await page.evaluate(read("#field") + ".dataset.workerModelFrame");
    assert.notEqual(standFrame, walkFrame);
    assert.equal(await page.evaluate(read("#field") + ".dataset.assetError"), undefined);
    const after = await page.wait(`(async () => {
      const { ${storeFactory}: createM2SaveStore } = await import("/src/game/m2/save.ts");
      const valid = value => value && typeof value === "object";
      const row = await createM2SaveStore(valid, valid).read();
      if (!row?.run.commandResults["worker-pickup"]?.ok) return;
      const { run } = row;
      return { position: run.worker, tick: run.queue.nowUs, matchId: run.matchId,
        contentVersion: row.contentVersion, configVersion: row.configVersion, saveVersion: row.formatVersion, revision: row.revision,
        approach: run.approach, items: run.inventory.filter(item => item.id === 900) };
    })()`);
    assert.equal(after.matchId, before.matchId);
    assert.ok(after.tick > before.tick && after.position.x > before.position.x);
    assert.equal(after.approach, null);
    assert.equal(after.items.length, 1);
    assert.ok(Number.isInteger(after.items[0].slot));
    console.log(JSON.stringify({ kind: "controlled browser", seed: 811, before, after, model: "w001",
      walkFrame, standFrame, status: "passed" }));
    await page.close();
  } else if (process.env.M2_COMPLEX_ONLY === "1") {
    assert.ok(!origin);
    const setup = await openTab(base + "/src/game/m2/save.ts");
    await setup.wait("location.pathname.endsWith('/save.ts') && document.readyState === 'complete'");
    const initial = await setup.evaluate(`(async () => {
      const { ${storeFactory}: createM2SaveStore } = await import("/src/game/m2/save.ts");
      const { newMatch, enqueue, drain } = await import("/src/game/m2/match.ts");
      const { scheduleEvent } = await import("/src/game/event-queue.ts");
      const { newHero } = await import("/src/game/m2/hero.ts");
      const { waves } = await import("/src/game/m2/waves.ts");
      const valid = value => value && typeof value === "object";
      const run = newMatch(crypto.randomUUID(), 811);
      run.queue.pending.length = 0;
      run.queue.nowUs = waves[54].startUs - 1;
      const advance = delta => {
        run.clock.targetUs = run.queue.nowUs + delta;
        while (drain(run, 10_000) === "pending") {}
      };
      const command = (id, action) => {
        if (!enqueue(run, { id, matchId: run.matchId, action })) throw new Error("Could not enqueue " + id);
        advance(1);
        if (!run.commandResults[id]?.ok) throw new Error(id + " failed: " + JSON.stringify(run.commandResults[id]));
      };
      scheduleEvent(run.queue, 1, { type: "start-wave", index: 54 });
      advance(1);
      const boss = run.enemies.find(enemy => enemy.unitId === "mBOS");
      if (!boss) throw new Error("The official wave timer did not create Roshan.");
      const actor = (id, templateId, x, y) => ({ id, templateId, x, y, pending: null,
        radius: 72, population: 0, qualification: null });
      const ready = [actor(900, "H029", boss.x + 550, boss.y), actor(901, "n142", boss.x + 650, boss.y),
        actor(902, "H012", boss.x + 625, boss.y)];
      ready[0].hero = newHero("H029");
      ready[2].hero = newHero("H012");
      ready[2].hero.ranks.A041 = 1;
      ready[2].hero.natural.INT += 40;
      ready[2].hero.divineForm = { id: "P217", stars: 2 };
      boss.spellShieldReadyUs = run.queue.nowUs + 10_000_000;
      const healer = { ...boss, id: 905, unitId: "m561", abilities: ["N712"], x: boss.x + 100,
        mana: 1000, manaMax: 1000, hp: 50, maxHp: 250 };
      const ally = { ...healer, id: 906, unitId: "m014", abilities: [], x: boss.x + 180 };
      run.enemies.push(healer, ally);
      run.structures.push(...ready);
      run.inventory.push(...["i196", "i326"].map((itemId, index) =>
        ({ id: 700 + index, itemId, charges: index, slot: index, point: { x: ready[0].x, y: ready[0].y }, towerId: 900 })));
      command("necromancy", { type: "cast-equipment", itemId: 700, towerId: 900 });
      command("potion", { type: "cast-equipment", itemId: 701, towerId: 900 });
      command("arrow", { type: "cast-flame-arrow", towerId: 901, targetId: boss.id });
      scheduleEvent(run.queue, 1, { type: "weapon-ready", towerId: 901 });
      command("construction", { type: "build-worker-tower", tower: "n021", point: { x: -288, y: -160 } });
      run.inventory.push({ id: 702, itemId: "i276", charges: 0, slot: 0, point: ready[2], towerId: 902 });
      command("seal", { type: "cast-equipment", towerId: 902, itemId: 702, targetId: boss.id });
      scheduleEvent(run.queue, 0, { type: "enemy-cast", enemyId: healer.id, skill: "N712", point: healer });
      run.randomState = 1;
      command("strafe", { type: "cast-hero", towerId: 902, skillId: "A041" });
      advance(310_000);
      enqueue(run, { id: "reward", matchId: run.matchId, action: { type: "claim-wave", slot: 0 } });
      run.clock.paused = true;
      const snapshot = { matchId: run.matchId, randomState: run.randomState, clock: run.queue.nowUs,
        gold: run.gold, effectUntil: run.structures[0].manaPotionUntilUs, projectile: run.queue.pending.some(event => event.payload.type === "weapon-impact"),
        summons: run.summons.length, construction: run.structures.some(tower => tower.pending),
        reward: run.waveRewardSlots[0], bossDeadline: run.bossDeadlineUs,
        newEvents: run.queue.pending.map(event => event.payload.type).filter(type =>
          ["hero-spell-end", "divine-effect-end", "equipment-seal-end"].includes(type)).sort(),
        healLink: run.battleAnimations.some(effect => effect.kind === "heal-link") };
      const store = createM2SaveStore(valid, valid);
      await store.withWriter(session => session.commit(undefined, { score: 0, claims: [] }, run${initialMigration}));
      const committed = await store.read();
      return { ...snapshot, version: committed.formatVersion };
    })()`);
    assert.equal(initial.projectile, true);
    assert.equal(initial.version, m3 ? 3 : 2);
    assert.equal(initial.construction, true);
    assert.equal(initial.summons, 1);
    assert.ok(initial.effectUntil > initial.clock && initial.bossDeadline > initial.clock);
    assert.equal(initial.reward, 2);
    assert.deepEqual(initial.newEvents, ["divine-effect-end", "equipment-seal-end", "hero-spell-end"]);
    assert.equal(initial.healLink, true);
    await setup.close();
    const page = await openTab(url);
    await page.wait(read("#pause") + "?.disabled === false && " + contains("#pause", "继续"));
    await page.wait(contains("#boss", "肉山"));
    const snapshot = condition => `(async () => {
      const { ${storeFactory}: createM2SaveStore } = await import("/src/game/m2/save.ts");
      const valid = value => value && typeof value === "object";
      const row = await createM2SaveStore(valid, valid).read();
      const run = row.run;
      if (!(${condition})) return null;
      return { contentVersion: row.contentVersion, matchId: run.matchId, revision: row.revision, clock: run.queue.nowUs,
        randomState: run.randomState, gold: run.gold, effectUntil: run.structures[0].manaPotionUntilUs,
        summons: run.summons?.length ?? 0, construction: run.structures.some(tower => tower.pending),
        reward: run.waveRewardSlots[0], rewardCount: run.inventory.filter(item => item.itemId === "i402").length,
        potionCount: run.inventory.filter(item => item.id === 701).length, bossDeadline: run.bossDeadlineUs,
        commands: run.commandResults, resolvedArrow: run.recentHits?.some(hit => hit.casterId === 901) ?? false,
        newEvents: run.queue.pending.map(event => event.payload.type).filter(type =>
          ["hero-spell-end", "divine-effect-end", "equipment-seal-end"].includes(type)).sort(),
        healLink: run.battleAnimations.some(effect => effect.kind === "heal-link") };
    })()`;
    const before = await page.evaluate(snapshot("true"));
    assert.equal(before.randomState, initial.randomState);
    assert.equal(before.clock, initial.clock);
    assert.equal(before.gold, initial.gold);
    assert.equal(before.potionCount, 0);
    assert.deepEqual(before.newEvents, initial.newEvents);
    assert.equal(before.healLink, true);
    await click(page, "#pause");
    const after = await page.wait(snapshot("run.waveRewardSlots[0] === 3 && !run.structures.some(tower => tower.pending) && run.recentHits?.some(hit => hit.casterId === 901)"));
    assert.equal(after.matchId, initial.matchId);
    assert.equal(after.gold, initial.gold);
    assert.equal(after.effectUntil, initial.effectUntil);
    assert.equal(after.bossDeadline, initial.bossDeadline);
    assert.equal(after.rewardCount, 1);
    assert.equal(after.resolvedArrow, true);
    assert.ok(["arrow", "construction", "necromancy", "potion", "reward", "seal", "strafe"].every(id => after.commands[id].ok));
    assert.ok(!after.newEvents.includes("hero-spell-end"));
    const completed = await page.wait(snapshot("!run.queue.pending.some(event => ['divine-effect-end', 'equipment-seal-end'].includes(event.payload.type))"));
    assert.deepEqual(completed.newEvents, []);
    assert.equal(completed.rewardCount, 1);
    await page.send("Page.reload");
    await page.wait(contains("#boss", "肉山"));
    const refreshed = await page.evaluate(snapshot("true"));
    assert.equal(refreshed.rewardCount, 1);
    assert.equal(refreshed.potionCount, 0);
    assert.equal(refreshed.bossDeadline, initial.bossDeadline);
    assert.deepEqual(refreshed.commands, completed.commands);
    assert.deepEqual(refreshed.newEvents, []);
    console.log(JSON.stringify({ type: "controlled-browser-indexeddb", initial, before, after, completed, refreshed }, null, 2));
    await page.close();
    assert.deepEqual(runtimeErrors, []);
  } else if (process.env.M2_A11_BROWSER_ONLY === "1") {
    assert.ok(!origin);
    const branches = [];
    for (const branch of ["weapon", "charm", "timeout"]) {
      const setup = await openTab(base + "/src/game/m2/save.ts");
      await setup.wait("location.pathname.endsWith('/save.ts') && document.readyState === 'complete'");
      await setup.evaluate(`(async () => {
        const { ${storeFactory}: createM2SaveStore } = await import("/src/game/m2/save.ts");
        const { newMatch, enqueue, drain } = await import("/src/game/m2/match.ts");
        const { scheduleEvent } = await import("/src/game/event-queue.ts");
        const { weapons } = await import("/src/game/m2/combat.ts");
        const { waves } = await import("/src/game/m2/waves.ts");
        const run = newMatch(crypto.randomUUID(), 811);
        const branch = "${branch}";
        const wave = waves[54];
        run.kills = 40;
        run.queue.pending.length = 0;
        run.queue.nowUs = wave.startUs - 1;
        run.bossArrivalUs = wave.startUs;
        scheduleEvent(run.queue, 1, { type: "start-wave", index: 54 });
        const advance = time => {
          run.clock.targetUs = time;
          while (drain(run, 10_000) === "pending") {}
        };
        advance(wave.startUs);
        if (branch === "charm") {
          enqueue(run, { id: "reward", matchId: run.matchId, action: { type: "claim-wave", slot: 4 } });
          advance(run.queue.nowUs + 1);
          if (!run.commandResults.reward?.ok) throw new Error("Missing charm reward");
        } else if (branch === "weapon") {
          const boss = run.enemies.find(enemy => enemy.unitId === "mBOS");
          const point = { x: boss.x, y: boss.y };
          const tower = { ...point, id: 900, templateId: "n001", radius: 0, population: 0, qualification: null, pending: null };
          run.structures.push(tower);
          scheduleEvent(run.queue, 1_000_000, { type: "weapon-impact", shot: { towerId: tower.id,
            weapon: { ...weapons.n001[0], homing: false, attackType: "chaos" }, raw: 100_000_000,
            targetId: boss.id, point, destination: point, sourceTemplate: tower.templateId }, travelUs: 0 });
        } else advance(wave.deadlineUs - 1_000_000);
        run.clock.paused = true;
        const valid = value => value && typeof value === "object";
        await createM2SaveStore(valid, valid).withWriter(async session => {
          const profile = { score: 0, claims: [] };
          if (session.checkpoint) await session.restart(session.checkpoint, profile, run);
          else await session.commit(undefined, profile, run${initialMigration});
        });
      })()`);
      await setup.close();
      const page = await openTab(url);
      await page.wait(read("#pause") + "?.disabled === false");
      await click(page, "#pause");
      if (branch === "charm") await click(page, '[data-item-id="i278"]');
      const terminal = `(async () => {
        const { ${storeFactory}: createM2SaveStore } = await import("/src/game/m2/save.ts");
        const valid = value => value && typeof value === "object";
        const { run, revision } = await createM2SaveStore(valid, valid).read();
        return run.phase === "won" ? { matchId: run.matchId, revision, result: run.result, kills: run.kills,
          score: run.killScore, survivors: run.enemies.length, finisher: run.finalHit?.towerId ?? null,
          charmRemaining: run.inventory.some(item => item.itemId === "i278" && item.slot !== null) } : null;
      })()`;
      const observed = await page.wait(terminal);
      assert.equal(observed.result.reason, branch === "timeout" ? "timeout" : "boss-killed");
      assert.equal(observed.kills, branch === "weapon" ? 41 : 40);
      assert.equal(observed.finisher, branch === "weapon" ? 900 : null);
      assert.equal(observed.survivors, 0);
      assert.equal(observed.charmRemaining, false);
      await page.send("Page.reload");
      assert.deepEqual(await page.wait(terminal), observed);
      branches.push({ branch, ...observed, reloaded: true });
      await page.close();
    }
    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ type: "controlled-browser-a11", branches }, null, 2));
  } else if (process.env.M3_A17_NORMAL_SNAPSHOT) {
    const evidence = await readReplayEvidence(process.env.M3_A17_NORMAL_SNAPSHOT, "replayed-normal-engine-a17");
    const { atUs, closesUs, challengeId, productId } = evidence.proof;
    const snapshot = { ...evidence.snapshot, clock: { ...evidence.snapshot.clock, paused: true } };
    await commitReplayedSnapshot(snapshot);
    const page = await openTab(urlForSeed(evidence.seed));
    await page.wait(read("#pause") + "?.disabled === false && " + contains("#pause", "继续"));
    const active = await page.evaluate(replayCheckpoint);
    assert.equal(active.run.queue.nowUs, atUs);
    assert.ok(active.run.challenges[challengeId] && active.run.challengeShopOpen);
    assert.ok(active.run.queue.pending.some(event => event.payload.type === "challenge-spawn" && event.payload.challengeId === challengeId));
    await page.evaluate(`(() => {
      const field = document.querySelector('#field');
      const sawChallenge = value => value?.split(',').includes('m531');
      const observer = new MutationObserver(changes => {
        if (sawChallenge(field.dataset.renderedEnemies) || changes.some(change => sawChallenge(change.oldValue))) {
          window.__m3ChallengeRendered = true;
          observer.disconnect();
        }
      });
      observer.observe(field, {attributes: true, attributeOldValue: true, attributeFilter: ['data-rendered-enemies']});
    })()`);
    await click(page, "#pause");
    await page.wait(contains("#wave", "第 54/55 波"));
    assert.equal(await page.evaluate("window.__m3ChallengeRendered"), true, "m531 was rendered before wave 54 cleanup");
    const saved = await page.wait(`(async () => { const row = await (${replayCheckpoint});
      return row.run.wave === 54 && row.run.challengeShopOpen === false && row; })()`);
    assert.equal(saved.run.queue.nowUs, closesUs);
    assert.equal(saved.run.result.reason, "capacity");
    assert.deepEqual(saved.run.challenges, {});
    assert.ok(!saved.run.enemies.some(enemy => enemy.challengeId !== undefined));
    assert.ok(!saved.run.queue.pending.some(event => event.payload.type === "challenge-spawn"));
    assert.ok(saved.run.inventory.some(item => item.itemId === "i265" && item.id === productId));
    await page.send("Page.reload");
    await page.wait(read("#restart") + "?.disabled === false && " + contains("#wave", "第 54/55 波"));
    assert.deepEqual((await page.evaluate(replayCheckpoint)).run, saved.run);
    console.log(JSON.stringify({ type: "normal-trajectory-browser-a17", seed: evidence.seed, status: "passed",
      inputLogSha256: evidence.inputLogSha256, snapshotSha256: evidence.snapshotSha256,
      before: { revision: active.revision, atUs, challengeId }, after: { revision: saved.revision, closesUs, productId, result: saved.run.result } }));
    await page.close();
    assert.deepEqual(runtimeErrors, []);
  } else if (process.env.M2_A17_BROWSER_ONLY === "1") {
    assert.ok(!origin);
    const setup = await openTab(base + "/src/game/m2/save.ts");
    await setup.wait("location.pathname.endsWith('/save.ts') && document.readyState === 'complete'");
    const initial = await setup.evaluate(`(async () => {
      const { ${storeFactory}: createM2SaveStore } = await import("/src/game/m2/save.ts");
      const { newMatch, enqueue, removeDeadEnemy, drain } = await import("/src/game/m2/match.ts");
      const { scheduleEvent } = await import("/src/game/event-queue.ts");
      const { waves } = await import("/src/game/m2/waves.ts");
      const valid = value => value && typeof value === "object";
      const run = newMatch(crypto.randomUUID(), 811);
      const advanceTo = time => {
        run.clock.targetUs = time;
        while (drain(run, 10_000) === "pending") {}
      };
      const reserve = unitId => {
        enqueue(run, { id: unitId, matchId: run.matchId, action: { type: "reserve-challenge", unitId } });
        advanceTo(run.queue.nowUs + 1);
        if (!run.commandResults[unitId]?.ok) throw new Error(unitId + " reservation was not accepted");
        return run.commandResults[unitId].createdId;
      };
      run.queue.pending.length = 0;
      run.queue.nowUs = waves[10].startUs - 1;
      scheduleEvent(run.queue, 1, { type: "start-wave", index: 10 });
      advanceTo(waves[10].startUs);
      run.queue.pending.length = 0;
      const clears = [];
      for (const unitId of ["m521", "m522", "m523"]) {
        const id = reserve(unitId);
        const ready = run.challengeReadyUs;
        advanceTo(ready);
        const enemies = run.enemies.filter(enemy => enemy.challengeId === id);
        if (enemies.length !== 12) throw new Error("Missing challenge batch");
        for (const enemy of enemies) {
          enemy.hp = 0;
          removeDeadEnemy(run, enemy.id);
        }
        clears.push({ unitId, kills: enemies.length, nextReadyUs: ready });
      }
      run.gold = 25_000;
      run.inventory = [{ id: 900, itemId: "i308", slot: 0, charges: 0, point: run.worker }];
      const closeUs = waves[53].startUs;
      run.queue.nowUs = run.clock.targetUs = closeUs - 254_000_000;
      const challengeId = reserve("m531");
      advanceTo(run.challengeReadyUs);
      reserve("m541");
      advanceTo(closeUs - 6_000_000);
      const onField = run.enemies.filter(enemy => enemy.challengeId === challengeId).map(enemy => enemy.id);
      const queued = run.queue.pending.some(event => event.payload.type === "challenge-spawn");
      if (!onField.length || !queued) throw new Error("The closure fixture needs both live and pending challenge enemies");
      scheduleEvent(run.queue, closeUs - run.queue.nowUs, { type: "start-wave", index: 53 });
      run.clock.paused = true;
      await createM2SaveStore(valid, valid).withWriter(session => session.commit(undefined, { score: 0, claims: [] }, run${initialMigration}));
      return { matchId: run.matchId, gold: run.gold, stock: run.challengeStock.i266, clears, challengeId, onField, queued, closeUs };
    })()`);
    assert.equal(initial.stock, 1);
    await setup.close();
    const page = await openTab(url);
    await openManagement(page, "商店");
    const item = `[...document.querySelectorAll("#challenge-stock button")].find(button => button.textContent.includes("邪念法杖"))`;
    await page.wait(item + "?.disabled === false");
    await page.evaluate(item + ".click()");
    await click(page, "#pause");
    const accept = condition => `(async () => {
      const { ${storeFactory}: createM2SaveStore } = await import("/src/game/m2/save.ts");
      const valid = value => value && typeof value === "object";
      const { run, revision } = await createM2SaveStore(valid, valid).read();
      if (!(${condition})) return null;
      return { matchId: run.matchId, revision, gold: run.gold, wave: run.wave, shopOpen: run.challengeShopOpen,
        stocks: run.challengeStock, product: run.inventory.find(entry => entry.itemId === "i265")?.id,
        ingredientsPresent: run.inventory.some(entry => ["i266", "i308"].includes(entry.itemId)),
        live: run.enemies.filter(enemy => enemy.challengeId !== undefined).map(enemy => enemy.id),
        queued: run.queue.pending.some(event => event.payload.type === "challenge-spawn") };
    })()`;
    const bought = await page.wait(accept('run.inventory.some(entry => entry.itemId === "i265")'));
    assert.equal(bought.ingredientsPresent, false);
    assert.equal(bought.gold, initial.gold - 18_600);
    assert.equal(bought.stocks.i266, 0);
    const closed = await page.wait(accept("run.wave === 54 && !run.challengeShopOpen"));
    assert.deepEqual(closed.live, []);
    assert.equal(closed.queued, false);
    await page.send("Page.reload");
    await page.wait(contains("#wave", "第 54/55 波"));
    const refreshed = await page.evaluate(accept("true"));
    assert.equal(refreshed.matchId, initial.matchId);
    assert.equal(refreshed.product, bought.product);
    assert.equal(refreshed.gold, bought.gold);
    assert.equal(refreshed.shopOpen, false);
    console.log(JSON.stringify({ type: "controlled-browser-a17", initial, bought, closed, refreshed }, null, 2));
    await page.close();
    assert.deepEqual(runtimeErrors, []);
  } else if (process.env.M2_A18_BROWSER_ONLY === "1") {
    assert.ok(!origin);
    const trials = [];
    for (const [broken, finished] of [["i131", "i132"], ["i133", "i134"], ["i262", "i263"]]) {
      const setup = await openTab(base + "/src/game/m2/save.ts");
      await setup.wait("location.pathname.endsWith('/save.ts') && document.readyState === 'complete'");
      const prepared = await setup.evaluate(`(async () => {
        const { ${storeFactory}: createM2SaveStore } = await import("/src/game/m2/save.ts");
        const { circleId, newMatch, enqueue, removeDeadEnemy, drain } = await import("/src/game/m2/match.ts");
        const { scheduleEvent } = await import("/src/game/event-queue.ts");
        const { startSeasons } = await import("/src/game/m2/seasons.ts");
        const { map } = await import("/src/game/m2/map.ts");
        const valid = value => value && typeof value === "object";
        const { score, seasons } = startSeasons();
        const run = newMatch(crypto.randomUUID(), 811, seasons);
        run.queue.pending.length = 0;
        run.inventory = [{ id: 700, itemId: "${broken}", charges: 1399, slot: 0, point: map.energyCircle, towerId: circleId },
          { id: 701, itemId: "i404", charges: 0, slot: 0, point: run.worker },
          { id: 702, itemId: "i414", charges: 1, slot: 1, point: run.worker }];
        const advance = state => {
          state.clock.targetUs = state.queue.nowUs + 1;
          while (drain(state, 10_000) === "pending") {}
        };
        scheduleEvent(run.queue, 1, { type: "start-wave", index: 0 });
        advance(run);
        // Isolate the submitted forge from the normal wave duration in this fixture.
        run.queue.pending.length = 0;
        const [enemy] = run.enemies;
        enemy.hp = 0;
        if (!removeDeadEnemy(run, enemy.id, 900)) throw new Error("The real forge callback did not run");
        const forged = run.inventory.find(item => item.itemId === "${finished}" && item.towerId === circleId);
        if (!forged || run.seasons.spring.counts[4] !== 1) throw new Error("Forge transaction is incomplete");
        let seed = 0;
        for (; seed < 2048; seed++) {
          const trial = structuredClone(run);
          trial.randomState = seed;
          enqueue(trial, { id: "probe", matchId: trial.matchId, action: { type: "use-item", itemId: 702 } });
          advance(trial);
          if (trial.inventory.some(item => item.id === trial.commandResults.probe?.createdId && item.itemId === "${finished}")) break;
        }
        if (seed === 2048) throw new Error("No deterministic chest fixture for ${finished}");
        run.randomState = seed;
        await createM2SaveStore(valid, valid).withWriter(async session => {
          const profile = { score, claims: [], seasons: structuredClone(run.seasons) };
          if (session.checkpoint) await session.restart(session.checkpoint, profile, run);
          else await session.commit(undefined, profile, run${initialMigration});
        });
        return { matchId: run.matchId, forgedId: forged.id, seed, forgedProgress: 1, box: 701, key: 702 };
      })()`);
      await setup.close();
      const page = await openTab(url);
      const reward = selector => `(async () => {
        const { ${storeFactory}: createM2SaveStore } = await import("/src/game/m2/save.ts");
        const valid = value => value && typeof value === "object";
        const row = await createM2SaveStore(valid, valid).read();
        const run = row.run;
        if (!(${selector})) return null;
        return { matchId: run.matchId, boxes: run.openedChests ?? 0, forge: run.seasons.spring.counts[4],
          open: run.seasons.summer.counts[3] ?? 0, hasInputs: run.inventory.some(item => item.id === 701 || item.id === 702),
          finished: run.inventory.filter(item => item.itemId === "${finished}").map(item => ({ id: item.id, owner: item.towerId ?? null })) };
      })()`;
      await page.wait(read('[data-item-id="i414"]') + "?.disabled === false");
      const before = await page.evaluate(reward("true"));
      assert.equal(before.forge, 1);
      assert.equal(before.open, 0);
      assert.equal(before.finished[0].id, prepared.forgedId);
      await click(page, '[data-item-id="i414"]');
      const after = await page.wait(reward("run.openedChests === 1"));
      assert.equal(after.open, 1);
      assert.equal(after.forge, 1);
      assert.equal(after.hasInputs, false);
      assert.deepEqual(after.finished.map(item => item.id === prepared.forgedId).sort(), [false, true]);
      await page.send("Page.reload");
      await page.wait(contains("#season-tasks", "开箱专家 · 1/66"));
      const reloaded = await page.evaluate(reward("true"));
      assert.deepEqual(reloaded, after);
      trials.push({ broken, finished, prepared, before, after, reloaded });
      await page.close();
    }
    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ type: "controlled-browser-a18", trials }, null, 2));
  } else if (process.env.M2_FIRELORD_ONLY === "1") {
    const seed = await tinyFixtureSeed();
    const page = await openTab(urlForSeed(seed));
    await checkFirelord(page);
    await page.close();
    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ type: "local-browser-growth-model", seed, learnedSize: .7, formSize: 1.12,
      restoredSize: 1.12, status: "passed" }));
  } else if (peakFixture) {
    const peakRecord = JSON.parse(await readFile(peakFixture, "utf8"));
    const sustained = peakRecord.kind === "normal-replay-performance-starts";
    assert.ok(!sustained || m3, "Recorded continuation requires the M3 gameplay format");
    const interactive = process.env.M3_PERF_INPUT === "1";
    const replayStart = process.env.M3_PERF_REPLAY_START ?? "sustained";
    assert.ok(["sustained", "population", "boss"].includes(replayStart));
    const start = sustained ? peakRecord.starts[replayStart] : undefined;
    if (sustained) assert.ok(start?.snapshot, `Missing actual ${replayStart} checkpoint`);
    const { fixture, command, fixtureSha256, fixtureId, contentVersion } = sustained ? {
      fixture: start.snapshot, fixtureSha256: start.snapshotSha256,
      fixtureId: peakRecord.fixtureId ?? `${replayStart}-normal-${peakRecord.seed}`, contentVersion: peakRecord.version
    } : peakRecord;
    const url = urlForSeed(fixture.seed);
    const replayInputs = sustained ? peakRecord.inputs.slice(start.nextInput - peakRecord.starts.sustained.nextInput) : undefined;
    const continuation = replayInputs?.map(({ atUs, action }, index) => ({ atUs, action, id: String(start.nextInput + index + 1) }));
    const sampleDirectory = process.env.M3_PERF_EVIDENCE_DIR;
    if (sampleDirectory) await mkdir(sampleDirectory, { recursive: true });
    assert.equal(createHash("sha256").update(JSON.stringify(fixture)).digest("hex"), fixtureSha256);
    let publishedSetup;
    if (origin) {
      const response = await fetch(url);
      assert.equal(response.status, 200);
      const entry = (await response.text()).match(/<link\s+rel="stylesheet"[^>]+href="([^"]+)"/);
      assert.ok(entry, "The production document must provide a small same-origin stylesheet for fixture setup");
      publishedSetup = new URL(entry[1], url).href;
      assert.equal(new URL(publishedSetup).origin, new URL(url).origin);
    }
    const traceKeyReceipt = `addEventListener("keydown", event => {
      const measurement = globalThis.__m2Peak;
      if (event.code !== "KeyS" || measurement?.initial === undefined || measurement.end !== undefined) return;
      measurement.inputs.push({ receivedAt: performance.now(), eventAt: event.timeStamp });
    }, true);
    addEventListener("click", event => {
      const measurement = globalThis.__m2Peak;
      const control = event.target.closest?.('#view-top, #view-oblique');
      if (!control || measurement?.initial === undefined || measurement.end !== undefined) return;
      const input = { kind: 'camera', control: control.id, receivedAt: performance.now(), eventAt: event.timeStamp };
      measurement.inputs.push(input);

    }, true);`;
    const samples = [];
    for (let index = 0; index < (freezeSeconds ? 1 : 3); index++) {
      if (sampleDirectory) console.error(`Sample ${index + 1}: preparing ${fixtureId} on the same origin`);
      const setup = await openTab(publishedSetup ?? base + "/src/game/m2/save.ts");
      await setup.wait("document.readyState === 'complete'");
      if (publishedSetup) {
        const { m3ContentVersion, m3ConfigVersion, m3Persistence, m3SaveFormatVersion } = await import("../src/game/m2/m3-version.ts");
        const { enqueue } = await import("../src/game/m2/match.ts");
        assert.equal(contentVersion, m3ContentVersion);
        const run = structuredClone(fixture);
        run.matchId += "-" + index;
        run.clock.speed = 4;
        run.clock.paused = true;
        for (const { payload } of run.queue.pending) {
          if (payload.type === "command" || payload.type === "commit-talent") payload.command.matchId = run.matchId;
        }
        if (run.approach) run.approach.command.matchId = run.matchId;
        if (command) assert.ok(enqueue(run, { ...command, matchId: run.matchId }));
        const checkpoint = { formatVersion: m3SaveFormatVersion, contentVersion, configVersion: m3ConfigVersion,
          migration: { source: "none" }, revision: index + 1, activeMatchId: run.matchId, profile: { score: 0, claims: [] }, run };
        await setup.evaluate(`new Promise((resolve, reject) => {
          const open = indexedDB.open(${JSON.stringify(m3Persistence.database)}, 1);
          open.onupgradeneeded = () => open.result.createObjectStore("profiles");
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction("profiles", "readwrite");
            tx.oncomplete = () => { db.close(); resolve(true); };
            tx.onabort = () => { db.close(); reject(tx.error); };
            tx.objectStore("profiles").put(${JSON.stringify(checkpoint)}, ${JSON.stringify(m3Persistence.slot)});
          };
        })`);
      } else await setup.evaluate(`(async () => {
        const { ${storeFactory}: createM2SaveStore } = await import("/src/game/m2/save.ts");
        const { enqueue } = await import("/src/game/m2/match.ts");
        const run = ${JSON.stringify(fixture)};
        run.matchId += "-" + ${index};
        run.clock.speed = 4;
        run.clock.paused = true;
        const command = ${JSON.stringify(command ?? null)};
        if (command) enqueue(run, { ...command, matchId: run.matchId });
        const profile = { score: 0, claims: [] };
        const valid = value => value && typeof value === "object";
        await createM2SaveStore(valid, valid).withWriter(async session => {
          if (session.checkpoint) await session.restart(session.checkpoint, profile, run);
          else await session.commit(undefined, profile, run${initialMigration});
        });
      })()`);
      await setup.close();
      if (sampleDirectory) console.error(`Sample ${index + 1}: loading the compiled application`);
      const page = await openTab(url, traceKeyReceipt);
      await page.send("Page.bringToFront");
      await page.wait(read("#field") + "?.dataset.ready === 'true'");
      await page.wait(read("#pause") + "?.disabled === false && " + contains("#pause", "继续"));
      const environment = await page.evaluate(`(() => {
        const gl = document.querySelector("#field").getContext("webgl2");
        const driver = gl?.getExtension("WEBGL_debug_renderer_info");
        return { browser: navigator.userAgent, renderer: driver ? gl.getParameter(driver.UNMASKED_RENDERER_WEBGL) : null,
          size: [innerWidth, innerHeight], dpr: devicePixelRatio, hidden: document.hidden };
      })()`);
      if (environment.hidden && !freezeSeconds) {
        samples.push({ environment, status: "invalid-hidden-tab" });
        await page.close();
        continue;
      }
      if (sampleDirectory) console.error(`Sample ${index + 1}: ${environment.renderer}; recording ${perfDurationMs} ms at 4×`);
      if (freezeSeconds) {
        assert.ok(peakRecord.attempts?.length, "Freeze recovery requires a PF01 witness");
        const expected = peakRecord.attempts[0].result;
        await page.evaluate(`(() => {
          const evidence = globalThis.__m2Peak = { frames: [], inputs: [], initial: performance.now() };
          globalThis.__td3FramePerformance = frame => evidence.frames.push(frame);
          const feedback = document.querySelector('#feedback');
          const textContent = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
          Object.defineProperty(feedback, 'textContent', {
            get() { return textContent.get.call(this); },
            set(value) {
              textContent.set.call(this, value);
              const input = evidence.inputs.at(-1);
              if (input && input.confirmMs === undefined && value.includes('已排队')) input.confirmMs = performance.now() - input.eventAt;
            }
          });
        })()`);
        await click(page, "#pause");
        await page.wait(contains("#pause", "暂停"));
        const before = await page.evaluate(read("#wave") + ".textContent");
        const parkingTab = await openTab("about:blank");
        await parkingTab.send("Page.bringToFront");
        await page.wait("document.visibilityState === 'hidden'");
        await page.send("Page.setWebLifecycleState", { state: "frozen" });
        const frozenAt = performance.now();
        const wakeAt = frozenAt + freezeSeconds * 1000;
        console.error(`Frozen ${new Date().toISOString()} for ${freezeSeconds} real seconds at 4×`);
        let remaining;
        while ((remaining = wakeAt - performance.now()) > 0) await delay(Math.ceil(remaining));
        const frozenMs = performance.now() - frozenAt;
        await page.send("Page.setWebLifecycleState", { state: "active" });
        const resumedAt = performance.now();
        await page.send("Page.bringToFront");
        const resumedVisibility = await page.evaluate(`new Promise(resolve => {
          if (!document.hidden) return resolve('visible');
          const changed = () => { if (!document.hidden) resolve('visible'); };
          document.addEventListener('visibilitychange', changed);
          setTimeout(() => { document.removeEventListener('visibilitychange', changed); resolve(document.visibilityState); }, 5_000);
        })`);
        await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "s", code: "KeyS" });
        await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "s", code: "KeyS" });
        let converged = false;
        while (performance.now() - resumedAt < 60_000) {
          if (await page.evaluate(contains("#wave", "容怪超限"))) {
            converged = true;
            break;
          }
          await delay(200);
        }
        const after = await page.evaluate(read("#wave") + ".textContent");
        const measurements = await page.evaluate("globalThis.__m2Peak");
        const final = measurements.frames.at(-1);
        const frameMs = measurements.frames.reduce((longest, frame) => Math.max(longest, frame.drainMs), 0);
        samples.push({ environment, frozenMs, recoveryMs: performance.now() - resumedAt,
          before, after, converged, resumedVisibility, expected, final, longestDrainMs: frameMs, measurements });
        await parkingTab.close();
        await page.close();
        continue;
      }
      await page.evaluate(`(() => {
        const button = document.querySelector("#pause");
        const measurement = globalThis.__m2Peak = {
          frames: [], presented: [], phases: [], clones: [], saves: [], inputs: [], recordedOutcomes: {},
        };
        const active = () => measurement.initial !== undefined && measurement.end === undefined;
        const clone = globalThis.structuredClone;
        globalThis.structuredClone = function (value, ...options) {
          if (!active() || !value?.run?.clock) return clone.call(this, value, ...options);
          const start = performance.now();
          const copy = clone.call(this, value, ...options);
          measurement.clones.push({ atUs: value.run.queue.nowUs, ms: performance.now() - start });
          return copy;
        };
        const starts = new WeakMap();
        const transaction = IDBDatabase.prototype.transaction;
        IDBDatabase.prototype.transaction = function (...args) {
          const start = performance.now();
          const result = transaction.apply(this, args);
          if (active() && result.mode === "readwrite") starts.set(result, start);
          return result;
        };
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (row, ...args) {
          if (!active() || !row?.run?.clock) return put.call(this, row, ...args);
          const start = performance.now();
          const request = put.call(this, row, ...args);
          const tx = this.transaction;
          const entry = { revision: row.revision, row, putCallMs: performance.now() - start };
          measurement.saves.push(entry);
          tx.addEventListener("complete", () => { entry.commitMs = performance.now() - (starts.get(tx) ?? start); }, { once: true });
          tx.addEventListener("abort", () => { entry.aborted = true; }, { once: true });
          return request;
        };
        const feedback = document.querySelector("#feedback");
        const textContent = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
        Object.defineProperty(feedback, "textContent", {
          configurable: true,
          get: textContent.get,
          set(value) {
            textContent.set.call(this, value);
            const input = measurement.inputs.at(-1);
            if (active() && input && input.confirmMs === undefined && value.includes("已排队")) {
              input.confirmMs = performance.now() - input.eventAt;
            }
          },
        });
        globalThis.__td3FramePerformance = sample => {
          if (!active()) return;
          if (sample.presentedAt !== undefined) measurement.presented.push(sample.presentedAt);
          if (sample.presentedAt !== undefined || !measurement.presented.length && sample.renderMs > 0) {
            const cameraInput = measurement.inputs.at(-1);
            if (cameraInput?.kind === "camera" && cameraInput.confirmMs === undefined &&
                document.getElementById(cameraInput.control).getAttribute("aria-pressed") === "true") {
              cameraInput.confirmMs = performance.now() - cameraInput.eventAt;
              cameraInput.observedMs = cameraInput.confirmMs;
            }
          }
          for (const queued of sample.queuedStops ?? []) {
            const input = measurement.inputs.find(input => input.id === queued.id) ??
              measurement.inputs.find(input => input.id === undefined && input.confirmMs !== undefined);
            if (!input) continue;
            Object.assign(input, queued);
            if (queued.ok !== undefined) {
              Object.assign(input, { appliedAtUs: queued.scheduledUs, observedAtUs: sample.atUs,
                observedMs: performance.now() - input.receivedAt });
            }
          }
          delete sample.queuedStops;
          for (const rejection of sample.rejectedStops ?? []) {
            const input = measurement.inputs.find(input => input.id === rejection.id) ??
              measurement.inputs.find(input => input.id === undefined && input.confirmMs !== undefined);
            if (input) Object.assign(input, { id: rejection.id, rejectedAtUs: rejection.atUs, rejectedAtTerminal: rejection.terminal });
          }
          delete sample.rejectedStops;
          Object.assign(measurement.recordedOutcomes, sample.recordedOutcomes);
          delete sample.recordedOutcomes;
          measurement.phases.push(sample);
        };
        globalThis.__td3FramePerformance.autosave = ${perfAutosave};
        ${sustained ? `globalThis.__td3FramePerformance.continuation = { actions: ${JSON.stringify(continuation)}, next: 0 };` : ""}
        const initial = performance.now();
        measurement.initial = initial;
        let last;
        button.click();
        const sample = time => {
          if (!active()) return;
          const outcome = document.querySelector("#wave").textContent;
          const ended = /容怪超限|已击杀肉山|超时结算/.test(outcome);
          if (time - initial >= ${perfDurationMs} || ended || document.hidden) {
            measurement.end = time;
            measurement.endReason = document.hidden ? "hidden" : ended ? "terminal" : "deadline";
            return;
          }
          if (last !== undefined) measurement.frames.push(time - last);
          last = time;
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
        setTimeout(() => {
          if (!active()) return;
          measurement.end = performance.now();
          measurement.endReason = "animation-timeout";
        }, ${perfDurationMs + 2_000});
      })()`);
      let dispatchedInputs = 0;
      if (interactive) {
        const interval = sustained ? 10_000 : 750;
        const start = performance.now();
        for (let target = 1_000; target < perfDurationMs - 500; target += interval) {
          await delay(Math.max(0, target - (performance.now() - start)));
          if (await page.evaluate("globalThis.__m2Peak.end !== undefined")) break;
          if (sustained) {
            await clickVisible(page, dispatchedInputs % 2 ? "#view-oblique" : "#view-top");
          } else {
            await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "s", code: "KeyS" });
            await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "s", code: "KeyS" });
          }
          dispatchedInputs++;
        }
      }
      await page.wait("globalThis.__m2Peak.end !== undefined", Math.ceil((perfDurationMs + 10_000) / 100));
      const result = await page.evaluate(`(() => {
        const data = globalThis.__m2Peak;
        return {
          intervals: data.presented.length > 1
            ? data.presented.slice(1).map((time, index) => time - data.presented[index]) : data.frames,
          renderedFrameTimestamps: data.presented,
          animationCallbackIntervals: data.frames,
          wallMs: data.end - data.initial,
          endReason: data.endReason,
          terminalAtUs: data.endReason === "terminal" ? data.phases.find(sample => sample.phase !== "running")?.atUs : undefined,
          stalledOrHidden: data.endReason === "hidden" || data.endReason === "animation-timeout",
          outcome: document.querySelector("#wave")?.textContent,
          save: document.querySelector("#save")?.textContent,
          recordedOutcomes: data.recordedOutcomes,
          replayed: globalThis.__td3FramePerformance.continuation?.next,
          phases: data.phases.filter(sample => sample.phase === "running"),
          inputs: data.inputs.map(input => ({ ...input, savedAtUs: input.id &&
            data.saves.find(({ row }) => Object.hasOwn(row.run.commandResults, input.id))?.row.run.queue.nowUs })),
          clones: data.clones,
          saves: data.saves.map(({ row, ...entry }) => ({ ...entry, atUs: row.run.queue.nowUs,
            backlogUs: row.run.clock.targetUs - row.run.queue.nowUs, snapshotJsonBytes: new TextEncoder().encode(JSON.stringify(row)).length })),
        };
      })()`);
      const replayFailures = [];
      if (sustained) {
        const atUs = result.phases.at(-1).atUs;
        for (const [index, input] of continuation.entries()) {
          const actual = result.recordedOutcomes[input.id];
          if (actual === undefined && input.atUs + 12_000_000 > atUs) continue;
          const expected = replayInputs[index].outcome;
          if (JSON.stringify(actual) !== JSON.stringify(expected)) replayFailures.push({ id: input.id, atUs: input.atUs, actual, expected });
        }
      }
      const percentile = (values, quantile) => {
        const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
        return sorted[Math.ceil(sorted.length * quantile) - 1] ?? null;
      };
      const frameMedian = percentile(result.intervals, .5);
      const confirmations = result.inputs.map(input => input.confirmMs);
      const first = result.phases[0];
      const last = result.phases.at(-1);
      const progression = first && last ? {
        firstAtUs: first.atUs,
        lastAtUs: last.atUs,
        firstBacklogUs: first.backlogUs,
        lastBacklogUs: last.backlogUs,
        maxBacklogUs: result.phases.reduce((highest, { backlogUs }) => Math.max(highest, backlogUs), 0),
      } : null;
      const terminalCancellations = result.terminalAtUs === undefined ? [] : result.inputs.filter(input =>
        input.observedMs === undefined && input.confirmMs !== undefined && input.scheduledUs > result.terminalAtUs);
      const terminalRejections = result.terminalAtUs === undefined ? [] : result.inputs.filter(input =>
        input.rejectedAtTerminal && input.rejectedAtUs === result.terminalAtUs && input.confirmMs !== undefined);
      const sample = { ...result, environment, replayFailures, progression, dispatchedInputs,
        commandsCanceledByTerminal: terminalCancellations.map(({ id, scheduledUs }) => ({ id, scheduledUs })),
        commandsRejectedAtTerminal: terminalRejections.map(({ id, rejectedAtUs }) => ({ id, rejectedAtUs })),
        inputsUnconfirmed: Math.max(0, dispatchedInputs - confirmations.filter(Number.isFinite).length),
        inputsNotObservedByDeadline: Math.max(0, dispatchedInputs - terminalCancellations.length - terminalRejections.length -
          result.inputs.filter(input => input.observedMs !== undefined || input.savedAtUs !== undefined).length),
        medianFps: frameMedian ? 1000 / frameMedian : null,
        frameP95Ms: percentile(result.intervals, .95), frameP99Ms: percentile(result.intervals, .99),
        inputP95Ms: percentile(confirmations, .95), inputP99Ms: percentile(confirmations, .99),
        drainP95Ms: percentile(result.phases.map(sample => sample.drainMs).filter(ms => ms > 0), .95),
        renderP95Ms: percentile(result.phases.map(sample => sample.renderMs), .95),
        controlP95Ms: percentile(result.phases.map(sample => sample.controlMs), .95),
        commandUiP95Ms: percentile(result.phases.map(sample => sample.commandUiMs), .95),
        copyP95Ms: percentile(result.clones.map(entry => entry.ms), .95),
        putCallP95Ms: percentile(result.saves.map(entry => entry.putCallMs), .95),
        commitP95Ms: percentile(result.saves.map(entry => entry.commitMs), .95) };
      samples.push(sample);
      if (sampleDirectory) await writeFile(path.join(sampleDirectory, `sample-${index + 1}.json`), JSON.stringify({
        fixtureId, fixtureSha256, contentVersion, url, autosave: perfAutosave, perfDurationMs, sample
      }, null, 2) + "\n", { flag: "wx" });
      await page.close();
    }
    assert.deepEqual(runtimeErrors, []);
    const summaries = sampleDirectory && !freezeSeconds ? samples.map(sample => {
      const { intervals, renderedFrameTimestamps, animationCallbackIntervals, phases, inputs, clones, saves, recordedOutcomes, ...summary } = sample;
      return { ...summary, renderedFrames: renderedFrameTimestamps?.length, saves: saves?.length,
        intervals: intervals?.length, animationIntervals: animationCallbackIntervals?.length };
    }) : samples;
    console.log(JSON.stringify({ fixtureId, fixtureSha256, contentVersion, url, hardwareRequested: hardware,
      status: origin ? "production-build-sample" : "exploratory-local-vite", freezeSeconds, perfDurationMs, autosave: perfAutosave,
      inputPlan: sustained ? { source: peakRecord.inputLogSha256, commands: continuation.length,
        uiProbe: interactive ? "alternate camera clicks from 1s every 10s" : null } :
        interactive ? "worker stop from 1s every 750ms while running" : null, samples: summaries }, null, 2));
    assert.ok(samples.every(sample => !sample.replayFailures?.length), "Recorded continuation diverged. All samples retained.");
    if (freezeSeconds) for (const sample of samples) {
      assert.ok(sample.frozenMs >= freezeSeconds * 1000, "The measured freeze ended too early");
      assert.ok(sample.resumedVisibility === "visible" && sample.converged && sample.recoveryMs <= 60_000,
        "Foreground freeze recovery did not reach its terminal within 60 seconds");
      assert.equal(sample.final.atUs, sample.expected.atUs);
      assert.ok(sample.after.includes(`容怪 ${sample.expected.points}/100`), "Recovered terminal has the wrong containment");
      assert.ok(sample.longestDrainMs <= 8, `Catch-up slice exceeded 8 ms: ${sample.longestDrainMs} ms`);
      assert.ok(sample.measurements.inputs[0]?.confirmMs <= 100, "Expected UI confirmation during catch-up");
    }
  } else if (origin) {
    const materialSeed = m3 ? await tinyFixtureSeed() : 811;
    const materialUrl = urlForSeed(materialSeed);
    const material = await openTab(materialUrl);
    await material.wait(read("#field") + "?.dataset.ready === 'true'");
    await material.wait(read("#field") + ".dataset.cameraPitch === '45' && " +
      read("#field") + ".dataset.cameraYaw === '180' && " + read("#field") + ".dataset.cameraZoom === '1.45'");
    await openManagement(material);
    await material.wait(read('[data-item-id="i004"]') + "?.disabled === false");
    await click(material, '[data-item-id="i004"]');
    await material.wait(read("#choices button") + "?.disabled === false");
    assert.equal(await material.evaluate("isSecureContext"), true);
    const names = await material.evaluate("[...document.querySelectorAll('#choices button')].map(b => b.textContent)");
    if (m3) {
      assert.equal(names.length, 4);
      assert.equal(new Set(names).size, 4);
      assert.ok(names.every(name => name.endsWith(" · SR")));
    } else {
      assert.deepEqual(names, ["小小 · SR", "双头龙 · SR", "暗影萨满 · SR", "复仇之魂 · SR"]);
    }
    const tiny = names.indexOf("小小 · SR");
    assert.ok(tiny >= 0, "The controlled animation seed must offer Tiny in the real four-card pool");
    await click(material, `#choices button:nth-of-type(${tiny + 1})`);
    await material.wait(contains("#cards", names[tiny]));
    await click(material, "#cards button");
    await place(material);
    await material.wait(read("#field") + "?.dataset.towerModelFrame");
    await openManagement(material);
    await click(material, "#builds button");
    await place(material, 288, -160);
    await openManagement(material);
    await material.wait(contains("#structures", "n001"));
    await material.wait(read("#field") + ".dataset.renderedTowers.includes('n001')");
    await closeManagement(material);
    await click(material, "#speed");
    const sample = await material.wait(read("#field") + "?.dataset.enemyModelFrame");
    await material.wait(read("#field") + "?.dataset.enemyModelFrame !== " + JSON.stringify(sample));
    assert.match(await material.evaluate(read("#wave") + ".textContent"), /第 1\/55 波/);
    await material.wait(contains("#last-hit", "伤害"));
    if (process.env.M3_CHECK_DAMAGE_CLONES === "1") {
      await material.wait(read(".live-damage") + "?.checkVisibility()");
      await click(material, "#pause");
      await material.wait(contains("#pause", "继续"));
      const damage = await material.evaluate(`new Promise(resolve => {
        let previous, stayed = 0;
        globalThis.__td3FramePerformance = frame => {
          if (frame.atUs !== previous) stayed = 0;
          previous = frame.atUs;
          if (++stayed !== 8) return;
          let newNumbers = 0;
          const initiallyVisible = document.querySelectorAll(".live-damage").length;
          const observer = new MutationObserver(changes => {
            for (const change of changes) {
              for (const node of change.addedNodes) {
                if (node instanceof Element && node.matches(".live-damage")) ++newNumbers;
              }
            }
          });
          observer.observe(document.querySelector(".unit-overlay"), { childList: true });
          const pausedAtUs = frame.atUs;
          setTimeout(() => {
            delete globalThis.__td3FramePerformance;
            observer.disconnect();
            resolve({ initiallyVisible, newNumbers, pausedAtUs, stable: previous === pausedAtUs });
          }, 500);
        };
      })`);
      console.log(JSON.stringify({ type: "cloned-damage-history", ...damage }));
      assert.ok(damage.stable && damage.initiallyVisible > 0, "The paused view must retain an existing actual hit");
      assert.equal(damage.newNumbers, 0, "An existing hit displayed in later Worker snapshots only once");
      await click(material, "#pause");
      await material.wait(contains("#pause", "暂停"));
    }
    const projectileSources = await material.wait(`(() => {
      const sources = document.querySelector("#field").dataset.projectileSources;
      return ${m3} ? sources?.split(",").includes("n001") && sources : sources === "n001" && sources;
    })()`);
    await material.wait("Number(" + read("#field") + ".dataset.visibleHits) > 0");
    await material.wait(read("#field") + "?.dataset.towerModelClip === 'Attack'");
    assert.ok(!(await material.evaluate(read("#field") + ".dataset.projectileSources")).split(",").includes("H021"));
    if (process.env.M2_SCREENSHOT) {
      await material.evaluate(`new Promise((resolve, reject) => {
        const field = document.querySelector("#field");
        const deadline = performance.now() + 5000;
        function captureImpact() {
          if (Number(field.dataset.visibleHits) > 0 && Number(field.dataset.visibleShots) > 0) {
            document.querySelector("#pause").click();
            resolve(true);
          } else if (performance.now() >= deadline) reject(new Error("未能捕捉到出手及命中特效的同帧画面"));
          else requestAnimationFrame(captureImpact);
        }
        captureImpact();
      })`);
      const screenshot = await material.send("Page.captureScreenshot", { format: "png" });
      await writeFile(process.env.M2_SCREENSHOT, Buffer.from(screenshot.data, "base64"));
    }
    const frames = await material.evaluate(`(() => {
      const { towerModelFrame, towerModelClip, enemyModelFrame, renderedTowers, visibleShots, visibleHits,
        cameraPitch, cameraYaw, cameraZoom } = document.querySelector("#field").dataset;
      return { towerModelFrame, towerModelClip, enemyModelFrame, renderedTowers, visibleShots, visibleHits,
        cameraPitch, cameraYaw, cameraZoom };
    })()`);
    if (process.env.M2_SCREENSHOT) await click(material, "#pause");
    await material.wait(read("#field") + ".dataset.renderedEnemies.includes('m002')", 1500);
    const secondWave = await material.evaluate(read("#field") + ".dataset.renderedEnemies");
    assert.equal(await material.evaluate(read("#field") + ".dataset.assetError"), undefined);
    await capture(material, "second-wave-model");
    await material.restart();
    await material.wait(contains("#resources", "2000 金 · 0 木 · 人口 0/30"));
    await openManagement(material);
    await click(material, "#draws button");
    await material.wait(read("#cards button") + "?.disabled === false");
    const drawnCard = await material.evaluate(read("#cards button") + ".textContent");
    await click(material, "#cards button");
    await hover(material, -288, -160);
    await material.wait(read("#field") + ".dataset.placement === 'valid'");
    await place(material);
    const drawTower = await material.wait(read("#field") + ".dataset.renderedTowers");
    await capture(material, "draw-tower-model");
    assert.equal(await material.evaluate(read("#field") + ".dataset.assetError"), undefined);
    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ url: materialUrl, seed: materialSeed, frames, firstWalkFrame: sample, projectileSources, secondWave,
      drawnCard, drawTower, status: "passed" }));
    await material.close();
  } else {
    const tinySeed = await tinyFixtureSeed();
    const tinyUrl = urlForSeed(tinySeed);
    async function openingGold(tab) {
      await openManagement(tab);
      await tab.wait(contains("#worker-benefit-result", "自动发放福利"));
      const label = await tab.evaluate(read("#worker-benefit-result") + ".textContent");
      const bonus = Number(label.match(/\+(\d+) 金/)?.[1]);
      assert.ok(bonus >= 84 && bonus <= 120 && bonus % 4 === 0);
      return 2000 + bonus;
    }
    const a = await openTab(tinyUrl);
    await a.wait(read("#restart") + "?.disabled === false");
    await a.wait(contains("#resources", "2000 金 · 0 木 · 人口 0/30"));
    await a.wait(contains("#resources", "积分 60"));
    await openManagement(a);
    await a.wait(contains("#season-tasks", "春节 · 40/300"));
    assert.equal(await a.evaluate(contains("#season-tasks", "夏季 · 30/300")), true);
    const springWispDeferred = !m3 ||
      (await import("../src/game/m2/content.ts")).configuration.deferredSeasonTasks.spring.includes(1);
    assert.equal(await a.evaluate(contains("#season-tasks",
      springWispDeferred ? "精灵之子 · 后续开放" : "精灵之子 · 0/13")), true);
    await a.wait(contains("#talents", "英雄无敌"));
    const talentIndex = await a.evaluate("[...document.querySelectorAll('#talents button')].findIndex(button => button.textContent === '英雄无敌')");
    await click(a, `#talents button:nth-child(${talentIndex + 1})`);
    await a.wait(contains("#talents", "英雄无敌 Lv1"));
    await a.wait(read('[data-item-id="i006"]') + "?.disabled === false");
    await a.evaluate(`${read('[data-item-id="i006"]')}.parentElement.querySelector("button:last-child").click()`);
    await a.wait(read("#circle-items button") + "?.disabled === false");
    await click(a, "#circle-items button");
    await a.wait(read('[data-item-id="i006"]') + "?.disabled === false");
    await a.wait(read('[data-item-id="i004"]') + "?.disabled === false");
    await click(a, '[data-item-id="i004"]');
    await a.wait(read("#choices button") + "?.disabled === false");
    assert.equal(await a.evaluate("document.querySelectorAll('#choices button').length"), 4);
    await chooseTinyForControlledChecks(a);
    await a.wait(read("#opening") + "?.hidden");
    await a.wait(read("#field") + "?.dataset.ready === 'true'");
    const firstOpeningGold = await openingGold(a);
    await closeManagement(a);
    await a.send("Page.bringToFront");
    await capture(a, "map");
    await click(a, "#pause");
    await a.wait(contains("#pause", "继续"));
    const beforeCamera = await a.evaluate(read("#resources") + ".textContent");
    await click(a, "#view-top");
    await a.wait(read("#view-top") + ".getAttribute('aria-pressed') === 'true'");
    await capture(a, "camera-overhead");
    await click(a, "#rotate-right");
    await click(a, "#rotate-right");
    await a.wait(read("#field") + ".dataset.cameraYaw === '270'");
    await click(a, "#zoom-in");
    await a.wait("Number(" + read("#field") + ".dataset.cameraZoom) > 1");
    await click(a, "#zoom-out");
    await a.wait(read("#field") + ".dataset.cameraZoom === '1'");
    const centre = await mapPoint(a, 0, 0);
    const middleDrag = async modifiers => {
      const start = await mapPoint(a, 0, 0);
      const end = { x: start.x + 80, y: start.y - 30 };
      const input = { button: "middle", modifiers };
      await a.send("Input.dispatchMouseEvent", { type: "mousePressed", ...input, buttons: 4, clickCount: 1, ...start });
      await a.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...input, buttons: 4, ...end });
      await a.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...input, buttons: 0, clickCount: 1, ...end });
    };
    await middleDrag(0);
    await a.wait(read("#field") + ".dataset.cameraFocus !== '0,0'");
    assert.equal(await a.evaluate(read("#field") + ".dataset.cameraYaw"), "270");
    assert.equal(await a.evaluate(read("#field") + ".dataset.cameraPitch"), "90");
    const pannedFocus = await a.evaluate(read("#field") + ".dataset.cameraFocus");
    await middleDrag(8); // CDP Shift
    await a.wait(contains("#camera-status", "自由视角"));
    assert.notEqual(await a.evaluate(read("#field") + ".dataset.cameraYaw"), "270");
    assert.ok(await a.evaluate("Number(" + read("#field") + ".dataset.cameraPitch) < 90"));
    assert.equal(await a.evaluate(read("#field") + ".dataset.cameraFocus"), pannedFocus);
    assert.equal(await a.evaluate("document.querySelectorAll('#structures > div').length"), 0);
    assert.equal(await a.evaluate(read("#resources") + ".textContent"), beforeCamera);
    await capture(a, "camera-orbit");
    await click(a, "#reset-view");
    await a.wait(read("#field") + ".dataset.cameraYaw === '180' && " + read("#field") + ".dataset.cameraFocus === '0,-1.6'");
    await a.wait(read("#view-oblique") + ".getAttribute('aria-pressed') === 'true'");
    await a.send("Input.dispatchMouseEvent", { type: "mouseWheel", deltaX: 0, deltaY: -100, ...centre });
    await a.wait("Number(" + read("#field") + ".dataset.cameraZoom) > 1");
    await click(a, "#reset-view");
    await click(a, "#pause");
    await a.wait(contains("#pause", "暂停"));
    await openManagement(a);
    await click(a, "#builds button");
    await hover(a, 0, 0);
    await a.wait(read("#field") + ".dataset.placement === 'invalid'");
    await capture(a, "invalid-placement");
    await place(a, 0, 0);
    await a.wait(contains("#feedback", "此处不可建造"));
    await openManagement(a);
    assert.equal(await a.evaluate("document.querySelector('#builds button').getAttribute('aria-pressed')"), "true");
    assert.ok(await a.evaluate(contains("#resources", `${firstOpeningGold} 金`)));
    await closeManagement(a);
    await a.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    await a.wait(read("#cancel-placement") + ".hidden");
    await openManagement(a);
    await click(a, "#builds button");
    await click(a, "#view-top");
    await click(a, "#rotate-right");
    await click(a, "#rotate-right");
    await hover(a, -288, -160);
    await a.wait(read("#field") + ".dataset.placement === 'valid'");
    await capture(a, "build-preview");
    await place(a, -288, -160);
    await openManagement(a);
    await a.wait(contains("#structures", "升级"));
    await click(a, "#reset-view");
    await click(a, "#structures button");
    await a.wait(contains("#structures", "n002"));
    await click(a, "#cards button");
    await place(a, 288, -160);
    await a.wait(read("#field") + ".dataset.towerModelFrame");
    await openManagement(a);
    await a.wait("document.querySelectorAll('#structures > div').length === 2");
    await capture(a, "built-towers");
    await closeManagement(a);
    await click(a, "#view-top");
    await click(a, "#rotate-left");
    await capture(a, "camera-models");
    await click(a, "#reset-view");
    await openManagement(a);
    await a.wait(contains("#structures", "学习山崩 Lv1"));
    await a.evaluate("[...document.querySelectorAll('#structures button')].find(b => b.textContent.startsWith('学习山崩')).click()");
    await a.wait(contains("#structures", "学习山崩 Lv2"));
    await click(a, "#draws button");
    await a.wait(read("#cards button") + " !== null");
    await click(a, "#pause");
    await a.wait(contains("#pause", "继续"));
    const closedWallet = await a.wait(`(async () => {
      const { ${storeFactory}: createM2SaveStore } = await import("/src/game/m2/save.ts");
      const valid = value => value && typeof value === "object";
      const { run, profile } = await createM2SaveStore(valid, valid).read();
      if (!run.clock.paused || run.clock.targetUs !== run.queue.nowUs) return false;
      const wallet = run.gold + " 金 · " + run.lumber + " 木 · 人口 " + run.population + "/" + run.populationLimit + " · 积分 " + profile.score;
      return ${read("#resources")}.textContent === wallet && wallet;
    })()`);
    const b = await openTab(tinyUrl);
    await b.wait(contains("#save", m3 ? "等待档案写入权限" : "另一个标签页"));
    await openManagement(b);
    assert.equal(await b.evaluate(read("#draws button") + ".disabled"), true);
    await a.close();
    await b.send("Page.bringToFront");
    await b.wait(read("#restart") + "?.disabled === false");
    await b.wait(read("#resources") + ".textContent === " + JSON.stringify(closedWallet));
    assert.equal(await b.evaluate(read("#opening") + ".hidden"), true);
    assert.equal(await b.evaluate("document.querySelectorAll('#structures > div').length"), 2);
    assert.equal(await b.evaluate(contains("#structures", "学习山崩 Lv2")), true);
    assert.deepEqual(await b.evaluate(`(async () => {
      const { ${storeFactory}: createM2SaveStore } = await import("/src/game/m2/save.ts");
      const valid = value => value && typeof value === "object";
      return (await createM2SaveStore(valid, valid).read()).run.structures.map(tower => [tower.x, tower.y]);
    })()`), [[-288, -160], [288, -160]]);
    assert.equal(await b.evaluate(read("#pause") + ".textContent"), "继续");
    await b.evaluate("window.__m2BeforeReload = true");
    await b.send("Page.reload");
    await b.wait("window.__m2BeforeReload !== true && document.readyState === 'complete'");
    await b.wait(read("#restart") + "?.disabled === false");
    await openManagement(b);
    await b.wait(read("#resources") + ".textContent === " + JSON.stringify(closedWallet));
    await b.wait(read("#restart") + ".disabled === false");
    await b.evaluate("window.confirm = () => true");
    await click(b, "#restart");
    await b.wait(contains("#feedback", "已重开"));
    await b.wait(contains("#resources", "2000 金"));
    const prayerOpeningGold = await openingGold(b);
    await b.wait(read("#field") + "?.dataset.ready === 'true'");
    await b.wait(read('[data-item-id="i004"]') + "?.disabled === false");
    await click(b, '[data-item-id="i004"]');
    await b.wait(read("#opening") + "?.hidden === false");
    await chooseTinyForControlledChecks(b);
    await b.wait(contains("#cards", "小小"));
    await click(b, "#cards button");
    await place(b);
    await openManagement(b);
    await b.wait(contains("#structures", "等级 1"));
    await click(b, "#prayer button");
    await b.wait(contains("#books", "经验书 ×1"));
    await b.evaluate("[...document.querySelectorAll('#structures button')].find(b => b.textContent === '使用经验书').click()");
    await b.wait(contains("#structures", "等级 7 · 经验 1400"));
    await b.wait(contains("#resources", `${prayerOpeningGold - 800} 金`));
    const learnBuff = `[...document.querySelectorAll("#structures button")]
      .find(button => button.textContent.startsWith("学习战棍"))`;
    const castBuff = `[...document.querySelectorAll("#structures button")]
      .find(button => button.textContent === "施放战棍")`;
    await b.wait(learnBuff + "?.disabled === false");
    await b.evaluate(learnBuff + ".click()");
    await b.wait(castBuff + "?.disabled === false");
    await b.evaluate(castBuff + ".click()");
    await b.wait(contains("#feedback", "操作已执行。"));
    await b.evaluate(castBuff + ".click()");
    await b.wait(contains("#feedback", "操作仍在冷却"));
    await closeManagement(b);
    await click(b, "#speed");
    await b.wait(contains("#speed", "4×"));
    const displayedTime = () => b.evaluate(`(() => {
      const time = document.querySelector("#wave")?.textContent.match(/^(\\d+):(\\d{2})/);
      return time ? Number(time[1]) * 60 + Number(time[2]) : null;
    })()`);
    const beforeFreeze = await displayedTime();
    await b.send("Page.setWebLifecycleState", { state: "frozen" });
    await delay(2500);
    const resumedAt = performance.now();
    await b.send("Page.setWebLifecycleState", { state: "active" });
    await until(async () => (await displayedTime()) >= beforeFreeze + 9);
    const delayMs = performance.now() - resumedAt;
    assert.ok(delayMs < 1800, `live freeze credits elapsed time on resume (observed ${Math.round(delayMs)} ms)`);
    await click(b, "#pause");
    await b.wait(contains("#pause", "继续"));
    const pausedAt = await displayedTime();
    await b.send("Page.setWebLifecycleState", { state: "frozen" });
    await delay(1000);
    await b.send("Page.setWebLifecycleState", { state: "active" });
    await b.send("Page.bringToFront");
    await b.wait(read("#restart") + "?.disabled === false");
    await b.wait(contains("#pause", "继续"));
    await delay(250);
    const resumedPaused = await until(async () => {
      const time = await displayedTime();
      return Number.isFinite(time) ? { time } : undefined;
    });
    assert.equal(resumedPaused.time, pausedAt);
    await b.evaluate("window.confirm = () => true");
    await click(b, "#restart");
    await b.wait(contains("#feedback", "已重开"));
    const shopOpeningGold = await openingGold(b);
    await buyOrdinary(b, "i241");
    await b.wait(contains("#resources", `${shopOpeningGold - 850} 金`));
    await buyOrdinary(b, "i242");
    await b.wait(contains("#resources", `${shopOpeningGold - 1800} 金`));
    await openManagement(b);
    assert.equal(await b.evaluate("[...document.querySelectorAll('#worker-items span')].some(item => item.textContent === '提尔的祝福')"), true);
    await b.close();

    const c = await openTab(base + "/src/game/m2/save.ts");
    await c.wait("location.pathname.endsWith('/save.ts') && document.readyState === 'complete'");
    const seen = await c.evaluate(`(async () => {
      const { ${storeFactory}: createM2SaveStore } = await import("/src/game/m2/save.ts");
      const valid = value => value && typeof value === "object";
      const store = createM2SaveStore(valid, valid);
      const seen = [];
      const attempt = async write => {
        try { await write(); } catch (error) { seen.push(error.constructor.name, error.name); }
      };
      await store.withWriter(async ({ checkpoint, commit, restart }) => {
        const old = await commit(checkpoint, { score: 110, claims: ["wave15"] }, checkpoint.run);
        const paid = await commit(old, { score: 60, claims: ["wave15"] }, checkpoint.run);
        await attempt(() => commit(old, { score: 110, claims: [] }, checkpoint.run));
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function () {
          throw new DOMException("fixture write abort", "QuotaExceededError");
        };
        try { await attempt(() => commit(paid, { score: 0, claims: [] }, checkpoint.run)); }
        finally { IDBObjectStore.prototype.put = put; }
        const restored = await store.read();
        seen.push(restored.profile.score, restored.profile.claims);
        const run = { ...restored.run, matchId: crypto.randomUUID() };
        const fresh = await restart(paid, restored.profile, run);
        await attempt(() => commit(paid, { score: 0, claims: [] }, checkpoint.run));
        await attempt(() => commit(fresh, { score: 0, claims: [] }, checkpoint.run));
        const final = await store.read();
        seen.push(final.activeMatchId === run.matchId, final.profile.score, final.profile.claims);
      });
      return seen;
    })()`);
    const conflict = [m3 ? "StaleM3Checkpoint" : "StaleM2Checkpoint", "Error"];
    assert.deepEqual(seen, [
      ...conflict, "DOMException", "QuotaExceededError", 60, ["wave15"],
      ...conflict, ...conflict, true, 60, ["wave15"],
    ]);
    await c.evaluate(`(async () => {
      const { ${storeFactory}: createM2SaveStore } = await import("/src/game/m2/save.ts");
      const valid = value => value && typeof value === "object";
      const store = createM2SaveStore(valid, valid);
      await store.withWriter(async ({ checkpoint, commit }) => {
        const legacy = structuredClone(checkpoint.run);
        delete legacy.mapVersion;
        await commit(checkpoint, checkpoint.profile, legacy);
      });
    })()`);
    await c.close();
    const legacy = await openTab(tinyUrl);
    await legacy.wait(read("#restart") + "?.disabled === false");
    await legacy.wait(contains("#placement-status", "旧地图存档已保留"));
    await openManagement(legacy);
    assert.equal(await legacy.evaluate(read("#pause") + ".disabled"), true);
    assert.equal(await legacy.evaluate(read("#builds button") + ".disabled"), true);
    await legacy.wait(read("#restart") + ".disabled === false");
    await capture(legacy, "legacy-map");
    await legacy.evaluate("window.confirm = () => false");
    await click(legacy, "#restart");
    assert.ok(await legacy.evaluate(contains("#placement-status", "旧地图存档已保留")));
    await legacy.evaluate("window.confirm = () => true");
    await click(legacy, "#restart");
    await legacy.wait(contains("#feedback", "已重开"));
    await legacy.wait(read("#builds button") + ".disabled === false");
    assert.ok(await legacy.evaluate(contains("#resources", "2000 金")));
    await legacy.close();
    assert.deepEqual(runtimeErrors, []);
    const shopFixture = await openTab(base + "/src/game/m2/save.ts");
    await shopFixture.wait("location.pathname.endsWith('/save.ts') && document.readyState === 'complete'");
    await shopFixture.evaluate(`(async () => {
      const { ${storeFactory}: createM2SaveStore } = await import("/src/game/m2/save.ts");
      const { newMatch, drain } = await import("/src/game/m2/match.ts");
      const { scheduleEvent } = await import("/src/game/event-queue.ts");
      const valid = value => value && typeof value === "object";
      const store = createM2SaveStore(valid, valid);
      await store.withWriter(async ({ checkpoint, restart }) => {
        const run = newMatch(crypto.randomUUID(), 811);
        run.queue.pending.length = 0;
        scheduleEvent(run.queue, 1, { type: "start-wave", index: 10 });
        scheduleEvent(run.queue, 2, { type: "start-wave", index: 20 });
        run.clock.targetUs = 2;
        drain(run, 100);
        run.queue.pending = run.queue.pending.filter(event => event.payload.type === "movement");
        await restart(checkpoint, checkpoint.profile, run);
      });
    })()`);
    await shopFixture.close();
    const shops = await openTab(tinyUrl);
    await shops.wait(read("#restart") + "?.disabled === false");
    await openManagement(shops, "商店");
    await shops.wait(read("#mystery-shop") + "?.hidden === false");
    await shops.wait(read("#challenge-shop") + "?.hidden === false");
    const refresh = `[...document.querySelectorAll('#mystery-stock button')].find(button => button.textContent === '刷新球碎片')`;
    await shops.wait(refresh + "?.disabled === false");
    await shops.evaluate(refresh + ".click()");
    await shops.wait("!(" + refresh + ")");
    const reserve = `[...document.querySelectorAll('#challenge-stock button')].find(button => button.textContent === '预约魅惑魔女 1 阶')`;
    const shopRevision = await shops.evaluate(read("#save") + ".textContent");
    await shops.evaluate(reserve + ".click()");
    await shops.wait(contains("#challenge-stock", "预约魅惑魔女 2 阶"));
    await shops.wait(contains("#challenge-status", "下次预约还需"));
    await shops.wait(read("#save") + ".textContent !== " + JSON.stringify(shopRevision));
    await shops.evaluate("window.__m3ShopBeforeReload = true");
    await shops.send("Page.reload");
    await shops.wait("window.__m3ShopBeforeReload !== true && " + read("#restart") + "?.disabled === false");
    await openManagement(shops, "商店");
    await shops.wait(contains("#challenge-stock", "预约魅惑魔女 2 阶"));
    assert.equal(await shops.evaluate("!(" + refresh + ")"), true);
    await shops.evaluate(`${read("#mystery-shop")}.scrollIntoView({block:"start"})`);
    await capture(shops, "special-shops");
    await shops.close();
    const seasonFixture = await openTab(base + "/src/game/m2/save.ts");
    await seasonFixture.wait("location.pathname.endsWith('/save.ts') && document.readyState === 'complete'");
    await seasonFixture.evaluate(`(async () => {
      const { ${storeFactory}: createM2SaveStore } = await import("/src/game/m2/save.ts");
      const { newMatch, drain } = await import("/src/game/m2/match.ts");
      const { scheduleEvent } = await import("/src/game/event-queue.ts");
      const { startSeasons } = await import("/src/game/m2/seasons.ts");
      const valid = value => value && typeof value === "object";
      await createM2SaveStore(valid, valid).withWriter(async ({ checkpoint, restart }) => {
        const { score, seasons } = startSeasons();
        const run = newMatch(crypto.randomUUID(), 811, seasons);
        run.queue.pending.length = 0;
        run.inventory = [{ id: 700, itemId: "i256", charges: 0, slot: 0, point: { ...run.worker } }];
        scheduleEvent(run.queue, 1, { type: "start-wave", index: 0 });
        run.clock.targetUs = 1;
        drain(run, 100);
        run.queue.pending.length = 0;
        Object.assign(run.enemies[0], run.worker);
        await restart(checkpoint, { score, claims: [], seasons }, run);
      });
    })()`);
    await seasonFixture.close();
    const seasons = await openTab(tinyUrl);
    await seasons.wait(read("#restart") + "?.disabled === false");
    await openManagement(seasons);
    await seasons.wait(read('[data-item-id="i256"]') + "?.disabled === false");
    await click(seasons, '[data-item-id="i256"]');
    await seasons.wait(contains("#season-tasks", "点兵成金 · 1/99"));
    await seasons.wait(contains("#resources", "2300 金"));
    await seasons.wait(contains("#save", "已保存"));
    await seasons.evaluate("window.__m3SeasonBeforeReload = true");
    await seasons.send("Page.reload");
    await seasons.wait("window.__m3SeasonBeforeReload !== true && " + read("#restart") + "?.disabled === false");
    await openManagement(seasons);
    await seasons.wait(contains("#season-tasks", "点兵成金 · 1/99"));
    await seasons.wait(contains("#resources", "积分 60"));
    assert.equal(await seasons.evaluate(read('[data-item-id="i256"]') + ".disabled"), true);
    await seasons.wait(read("#restart") + "?.disabled === false");
    await seasons.restart();
    await seasons.wait(contains("#feedback", "已重开"));
    await seasons.wait(contains("#season-tasks", "点兵成金 · 1/99"));
    assert.equal(await seasons.evaluate(contains("#resources", "积分 60")), true);
    await checkFirelord(seasons);
    await seasons.close();
    assert.deepEqual(runtimeErrors, []);
    console.log(`${m3 ? "M3 foundation" : "M2"} Chrome checks passed (controlled seed ${tinySeed}): season initialization, deferred rows, selected i256, progress/score after reload and new match, Firelord transform and refresh, worker talent, energy-circle transfer, special shops and saved stock, starter pack and four choices, normal shop and automatic recipe, purchased XP book, skill persistence, lifecycle freeze catch-up, paused freeze, camera presets, rotation, pan, orbit, zoom, reset and rotated placement coordinates, opening, invalid/valid placement previews, cancellation, worker and hero construction, upgrade, draw, refresh, exclusive writer takeover, restart, stale writes, abort recovery and legacy-map preservation/restart.`);
  }
} finally {
  chrome.kill();
  await ended;
  await server?.close();
  await rm(profile, { recursive: true, force: true });
}
