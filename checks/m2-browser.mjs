// Run with CHROME_BIN set to the local Chrome executable.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "vite";

const profile = await mkdtemp(path.join(os.tmpdir(), "td3-m2-browser-"));
const origin = process.env.M2_ORIGIN;
const peakFixture = process.env.M2_PEAK_FIXTURE;
const hardware = process.env.M2_HARDWARE === "1";
const freezeSeconds = Number(process.env.M2_FREEZE_SECONDS ?? 0);
const protocolTimeout = Number(process.env.M2_CDP_TIMEOUT_MS ?? 30_000);
if (origin && peakFixture) throw new Error("Peak development fixture loading requires the Vite source entry");
const server = origin ? undefined : await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server?.listen();
const base = (origin ?? server.resolvedUrls.local[0]).replace(/\/$/, "");
const chrome = spawn(process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  ...(hardware ? ["--window-size=1440,900"] : ["--headless=new", "--use-angle=swiftshader"]),
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

  async function openTab(url) {
    const tab = await fetch(debug + "/json/new?about:blank", { method: "PUT" }).then(response => response.json());
    const socket = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    let sequence = 0;
    const pending = new Map();
    let confirmRestart = false;
    socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.method === "Page.javascriptDialogOpening" && confirmRestart) {
        confirmRestart = false;
        void send("Page.handleJavaScriptDialog", { accept: true });
      }
      if (message.method === "Runtime.exceptionThrown") runtimeErrors.push(message.params.exceptionDetails.text);
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
    await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    return {
      send, evaluate,
      async restart() {
        confirmRestart = true;
        await evaluate("document.querySelector('#restart').click()");
      },
      async wait(expression, attempts) {
        try {
          return await until(() => evaluate(expression), attempts);
        } catch (error) {
          throw new Error(expression + "\n" + await evaluate("document.body?.innerText"), { cause: error });
        }
      },
      async close() {
        await fetch(debug + "/json/close/" + tab.id);
        socket.close();
      },
    };
  }

  const read = selector => `document.querySelector(${JSON.stringify(selector)})`;
  const contains = (selector, phrase) => `${read(selector)}?.textContent.includes(${JSON.stringify(phrase)})`;
  const click = (tab, selector) => tab.evaluate(`${read(selector)}.click()`);
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
  const url = base + "/m2.html?seed=811";
  async function checkFirelord(page) {
    await page.wait(read('[data-item-id="i004"]') + "?.disabled === false");
    await page.wait(read("#field") + "?.dataset.ready === 'true'");
    await click(page, '[data-item-id="i004"]');
    await page.wait(read("#choices button") + "?.disabled === false");
    await click(page, "#choices button");
    await page.wait(read("#cards button") + "?.disabled === false");
    await click(page, "#cards button");
    await place(page);
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
    await page.send("Page.reload");
    await page.wait(contains("#structures", "火焰领主<SR> · G059"));
    await page.wait(scaleNear(.7));
    assert.equal(await page.evaluate(contains("#structures", "学习山崩 Lv2")), true);
    assert.equal(await page.evaluate(skin + " === undefined"), true);
  }
  if (process.env.M2_UPDATE_ROOT) {
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
      const { createM2SaveStore } = await import("/src/game/m2/save.ts");
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
      await createM2SaveStore(valid, valid).withWriter(session => session.commit(undefined, { score: 0, claims: [] }, run));
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
            const error = gl.getError();
            if (error !== gl.NO_ERROR) throw new Error("WebGL error " + error);
            frames[entry.asset] = { textureCount: entry.textureCount, loop: entry.loop, start, later };
          } catch (error) {
            frames[entry.asset] = { error: String(error) };
          }
        }
        return frames;
      })()`));
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
      const { createM2SaveStore } = await import("/src/game/m2/save.ts");
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
      await createM2SaveStore(valid, valid).withWriter(session => session.commit(undefined, { score: 0, claims: [] }, run));
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
      const { createM2SaveStore } = await import("/src/game/m2/save.ts");
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
      await createM2SaveStore(valid, valid).withWriter(session => session.commit(undefined, { score: 0, claims: [] }, run));
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
      const { createM2SaveStore } = await import("/src/game/m2/save.ts");
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
      const control = read(`#worker-appearance select[aria-label="${label}"]`);
      await page.wait(control + "?.disabled === false");
      if (!await page.evaluate(contains("#pause", "继续"))) {
        await click(page, "#pause");
        await page.wait(contains("#pause", "继续"));
      }
      await page.evaluate(`(() => { const element = ${control}; element.value = ${JSON.stringify(id)};
        element.dispatchEvent(new Event("change", { bubbles: true })); })()`);
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
      const control = read(`#worker-appearance select[aria-label="${label}"]`);
      const choices = await page.evaluate(`[...${control}.options].filter(option => option.value && !option.disabled)
        .map(option => [option.value, option.textContent.replace("（工人）", "")])`);
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
    const reachableGated = gated.filter(([label]) => label !== "能量圈外观");
    for (const [label, id] of gated) assert.equal(await page.evaluate(read(`[aria-label="${label}"] option[value="${id}"]`) + ".disabled"), true);
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
        const { createM2SaveStore } = await import("/src/game/m2/save.ts");
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
      await page.wait(read('#worker-appearance select[aria-label="能量圈外观"]') + "?.disabled === false");
      for (const [label, id] of gated.filter(([label]) => label === "能量圈外观")) {
        assert.equal(await page.evaluate(read(`[aria-label="${label}"] option[value="${id}"]`) + ".disabled"), true);
      }
      for (const [label, id, field, expected] of reachableGated) {
        await page.wait(read(`[aria-label="${label}"] option[value="${id}"]`) + "?.disabled === false");
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
      gatedUnlocked: origin ? [] : reachableGated.map(([, id]) => id), circle: "g201", aura: "S537",
      wings: "S603", accent: "S900", title: "S719", reload: true, restart: true, remove: true }, null, 2));
  } else if (process.env.M2_WORKER_RESUME_ONLY === "1") {
    assert.equal(origin, undefined, "The worker resume fixture requires the local Vite server");
    const setup = await openTab(base + "/");
    const before = await setup.evaluate(`(async () => {
      const { createM2SaveStore } = await import("/src/game/m2/save.ts");
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
      await createM2SaveStore(valid, valid).withWriter(session => session.commit(undefined, { score: 0, claims: [] }, run));
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
      const { createM2SaveStore } = await import("/src/game/m2/save.ts");
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
      const { createM2SaveStore } = await import("/src/game/m2/save.ts");
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
      const snapshot = { version: 2, matchId: run.matchId, randomState: run.randomState, clock: run.queue.nowUs,
        gold: run.gold, effectUntil: run.structures[0].manaPotionUntilUs, projectile: run.queue.pending.some(event => event.payload.type === "weapon-impact"),
        summons: run.summons.length, construction: run.structures.some(tower => tower.pending),
        reward: run.waveRewardSlots[0], bossDeadline: run.bossDeadlineUs,
        newEvents: run.queue.pending.map(event => event.payload.type).filter(type =>
          ["hero-spell-end", "divine-effect-end", "equipment-seal-end"].includes(type)).sort(),
        healLink: run.battleAnimations.some(effect => effect.kind === "heal-link") };
      await createM2SaveStore(valid, valid).withWriter(session => session.commit(undefined, { score: 0, claims: [] }, run));
      return snapshot;
    })()`);
    assert.equal(initial.projectile, true);
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
      const { createM2SaveStore } = await import("/src/game/m2/save.ts");
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
        const { createM2SaveStore } = await import("/src/game/m2/save.ts");
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
          else await session.commit(undefined, profile, run);
        });
      })()`);
      await setup.close();
      const page = await openTab(url);
      await page.wait(read("#pause") + "?.disabled === false");
      await click(page, "#pause");
      if (branch === "charm") await click(page, '[data-item-id="i278"]');
      const terminal = `(async () => {
        const { createM2SaveStore } = await import("/src/game/m2/save.ts");
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
  } else if (process.env.M2_A17_BROWSER_ONLY === "1") {
    assert.ok(!origin);
    const setup = await openTab(base + "/src/game/m2/save.ts");
    await setup.wait("location.pathname.endsWith('/save.ts') && document.readyState === 'complete'");
    const initial = await setup.evaluate(`(async () => {
      const { createM2SaveStore } = await import("/src/game/m2/save.ts");
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
      await createM2SaveStore(valid, valid).withWriter(session => session.commit(undefined, { score: 0, claims: [] }, run));
      return { matchId: run.matchId, gold: run.gold, stock: run.challengeStock.i266, clears, challengeId, onField, queued, closeUs };
    })()`);
    assert.equal(initial.stock, 1);
    await setup.close();
    const page = await openTab(url);
    const item = `[...document.querySelectorAll("#challenge-stock button")].find(button => button.textContent.includes("邪念法杖"))`;
    await page.wait(item + "?.disabled === false");
    await page.evaluate(item + ".click()");
    await click(page, "#pause");
    const accept = condition => `(async () => {
      const { createM2SaveStore } = await import("/src/game/m2/save.ts");
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
        const { createM2SaveStore } = await import("/src/game/m2/save.ts");
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
          else await session.commit(undefined, profile, run);
        });
        return { matchId: run.matchId, forgedId: forged.id, seed, forgedProgress: 1, box: 701, key: 702 };
      })()`);
      await setup.close();
      const page = await openTab(url);
      const reward = selector => `(async () => {
        const { createM2SaveStore } = await import("/src/game/m2/save.ts");
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
    const page = await openTab(url);
    await checkFirelord(page);
    await page.close();
    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ type: "local-browser-growth-model", seed: 811, learnedSize: .7, formSize: 1.12,
      restoredSize: 1.12, status: "passed" }));
  } else if (peakFixture) {
    const { fixture, command, fixtureSha256, fixtureId, contentVersion } = JSON.parse(await readFile(peakFixture, "utf8"));
    const samples = [];
    for (let index = 0; index < (freezeSeconds ? 1 : 3); index++) {
      const setup = await openTab(base + "/src/game/m2/save.ts");
      await setup.wait("document.readyState === 'complete'");
      await setup.evaluate(`(async () => {
        const { createM2SaveStore } = await import("/src/game/m2/save.ts");
        const { enqueue } = await import("/src/game/m2/match.ts");
        const run = ${JSON.stringify(fixture)};
        run.matchId += "-" + ${index};
        run.clock.speed = 4;
        run.clock.paused = true;
        enqueue(run, { ...${JSON.stringify(command)}, matchId: run.matchId });
        const profile = { score: 0, claims: [] };
        const valid = value => value && typeof value === "object";
        await createM2SaveStore(valid, valid).withWriter(async session => {
          if (session.checkpoint) await session.restart(session.checkpoint, profile, run);
          else await session.commit(undefined, profile, run);
        });
      })()`);
      await setup.close();
      const page = await openTab(url);
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
      if (freezeSeconds) {
        await click(page, "#pause");
        await page.wait(contains("#pause", "暂停"));
        const before = await page.evaluate(read("#wave") + ".textContent");
        const frozenAt = Date.now();
        await page.send("Page.setWebLifecycleState", { state: "frozen" });
        await delay(freezeSeconds * 1000);
        await page.send("Page.setWebLifecycleState", { state: "active" });
        const resumedAt = Date.now();
        let converged = false;
        while (Date.now() - resumedAt < 60_000) {
          if (await page.evaluate(contains("#wave", "容怪超限"))) {
            converged = true;
            break;
          }
          await delay(200);
        }
        const after = await page.evaluate(read("#wave") + ".textContent");
        samples.push({ environment, frozenMs: resumedAt - frozenAt, recoveryMs: Date.now() - resumedAt,
          before, after, converged, expectedContainment: 139 });
        await page.close();
        continue;
      }
      await page.evaluate(`(() => {
        const button = document.querySelector("#pause");
        const initial = performance.now();
        let last;
        const frames = [];
        button.click();
        globalThis.__m2Peak = { initial, frames };
        const sample = time => {
          if (time - initial >= 20_000 || document.querySelector("#wave").textContent.includes("容怪超限")) {
            globalThis.__m2Peak.end = time;
            return;
          }
          if (last !== undefined) frames.push(time - last);
          last = time;
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      })()`);
      await delay(20_000);
      const result = await page.evaluate(`({ intervals: globalThis.__m2Peak.frames,
        wallMs: (globalThis.__m2Peak.end ?? performance.now()) - globalThis.__m2Peak.initial,
        stalledOrHidden: globalThis.__m2Peak.end === undefined || document.hidden,
        outcome: document.querySelector("#wave")?.textContent,
        save: document.querySelector("#save")?.textContent })`);
      const sorted = [...result.intervals].sort((a, b) => a - b);
      const p = quantile => sorted[Math.ceil(sorted.length * quantile) - 1];
      samples.push({ ...result, environment, medianFps: sorted.length ? 1000 / p(.5) : null,
        frameP95Ms: p(.95) ?? null, frameP99Ms: p(.99) ?? null });
      await page.close();
    }
    assert.deepEqual(runtimeErrors, []);
    console.log(JSON.stringify({ fixtureId, fixtureSha256, contentVersion, url, hardwareRequested: hardware,
      status: "exploratory-local-vite", freezeSeconds, samples }, null, 2));
  } else if (origin) {
    const material = await openTab(url);
    await material.wait(read("#field") + "?.dataset.ready === 'true'");
    await material.wait(read("#field") + ".dataset.cameraPitch === '45' && " +
      read("#field") + ".dataset.cameraYaw === '180' && " + read("#field") + ".dataset.cameraZoom === '1.45'");
    await material.wait(read('[data-item-id="i004"]') + "?.disabled === false");
    await click(material, '[data-item-id="i004"]');
    await material.wait(read("#choices button") + "?.disabled === false");
    assert.equal(await material.evaluate("isSecureContext"), true);
    assert.deepEqual(await material.evaluate("[...document.querySelectorAll('#choices button')].map(b => b.textContent)"),
      ["小小 · SR", "双头龙 · SR", "暗影萨满 · SR", "复仇之魂 · SR"]);
    await click(material, "#choices button");
    await material.wait(contains("#cards", "小小"));
    await click(material, "#cards button");
    await place(material);
    await material.wait(read("#field") + "?.dataset.towerModelFrame");
    await click(material, "#builds button");
    await place(material, 288, -160);
    await material.wait(contains("#structures", "n001"));
    await material.wait(read("#field") + ".dataset.renderedTowers.includes('n001')");
    await click(material, "#speed");
    const sample = await material.wait(read("#field") + "?.dataset.enemyModelFrame");
    await material.wait(read("#field") + "?.dataset.enemyModelFrame !== " + JSON.stringify(sample));
    assert.match(await material.evaluate(read("#wave") + ".textContent"), /第 1\/55 波/);
    await material.wait(contains("#last-hit", "伤害"));
    const projectileSources = await material.wait(`(() => {
      const sources = document.querySelector("#field").dataset.projectileSources;
      return sources === "n001" ? sources : false;
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
    console.log(JSON.stringify({ url, seed: 811, frames, firstWalkFrame: sample, projectileSources, secondWave, drawnCard, drawTower, status: "passed" }));
    await material.close();
  } else {
    async function openingGold(tab) {
      await tab.wait(contains("#worker-benefit-result", "自动发放福利"));
      const label = await tab.evaluate(read("#worker-benefit-result") + ".textContent");
      const bonus = Number(label.match(/\+(\d+) 金/)?.[1]);
      assert.ok(bonus >= 84 && bonus <= 120 && bonus % 4 === 0);
      return 2000 + bonus;
    }
    const a = await openTab(url);
    await a.wait(read("#restart") + "?.disabled === false");
    await a.wait(contains("#resources", "2000 金 · 0 木 · 人口 0/30"));
    await a.wait(contains("#resources", "积分 60"));
    await a.wait(contains("#season-tasks", "春节 · 40/300"));
    assert.equal(await a.evaluate(contains("#season-tasks", "夏季 · 30/300")), true);
    assert.equal(await a.evaluate(contains("#season-tasks", "精灵之子 · 后续开放")), true);
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
    await click(a, "#choices button");
    await a.wait(read("#opening") + "?.hidden");
    await a.wait(read("#field") + "?.dataset.ready === 'true'");
    const firstOpeningGold = await openingGold(a);
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
    for (const [button, buttons] of [["right", 2], ["middle", 4]]) {
      await a.send("Input.dispatchMouseEvent", { type: "mousePressed", button, buttons, clickCount: 1, ...centre });
      await a.send("Input.dispatchMouseEvent", { type: "mouseMoved", button, buttons, x: centre.x + 80, y: centre.y - 30 });
      await a.send("Input.dispatchMouseEvent", { type: "mouseReleased", button, buttons: 0, clickCount: 1, x: centre.x + 80, y: centre.y - 30 });
    }
    await a.wait(read("#field") + ".dataset.cameraFocus !== '0,0'");
    await a.wait(contains("#camera-status", "自由视角"));
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
    await click(a, "#builds button");
    await hover(a, 0, 0);
    await a.wait(read("#field") + ".dataset.placement === 'invalid'");
    await capture(a, "invalid-placement");
    await place(a, 0, 0);
    await a.wait(contains("#feedback", "此处不可建造"));
    assert.equal(await a.evaluate("document.querySelector('#builds button').getAttribute('aria-pressed')"), "true");
    assert.ok(await a.evaluate(contains("#resources", `${firstOpeningGold} 金`)));
    await a.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    await a.wait(read("#cancel-placement") + ".hidden");
    await click(a, "#builds button");
    await click(a, "#view-top");
    await click(a, "#rotate-right");
    await click(a, "#rotate-right");
    await hover(a, -288, -160);
    await a.wait(read("#field") + ".dataset.placement === 'valid'");
    await capture(a, "build-preview");
    await place(a, -288, -160);
    await a.wait(contains("#structures", "升级"));
    await click(a, "#reset-view");
    await click(a, "#structures button");
    await a.wait(contains("#structures", "n002"));
    await click(a, "#cards button");
    await place(a, 288, -160);
    await a.wait(read("#field") + ".dataset.towerModelFrame");
    await a.wait("document.querySelectorAll('#structures > div').length === 2");
    await capture(a, "built-towers");
    await click(a, "#view-top");
    await click(a, "#rotate-left");
    await capture(a, "camera-models");
    await click(a, "#reset-view");
    await a.wait(contains("#structures", "学习山崩 Lv1"));
    await a.evaluate("[...document.querySelectorAll('#structures button')].find(b => b.textContent.startsWith('学习山崩')).click()");
    await a.wait(contains("#structures", "学习山崩 Lv2"));
    await click(a, "#draws button");
    await a.wait(read("#cards button") + " !== null");
    await click(a, "#pause");
    await a.wait(contains("#pause", "继续"));
    const closedWallet = await a.wait(`(async () => {
      const { createM2SaveStore } = await import("/src/game/m2/save.ts");
      const valid = value => value && typeof value === "object";
      const { run, profile } = await createM2SaveStore(valid, valid).read();
      if (!run.clock.paused || run.clock.targetUs !== run.queue.nowUs) return false;
      const wallet = run.gold + " 金 · " + run.lumber + " 木 · 人口 " + run.population + "/" + run.populationLimit + " · 积分 " + profile.score;
      return ${read("#resources")}.textContent === wallet && wallet;
    })()`);
    const b = await openTab(url);
    await b.wait(contains("#save", "另一个标签页"));
    assert.equal(await b.evaluate(read("#draws button") + ".disabled"), true);
    await a.close();
    await b.send("Page.bringToFront");
    await b.wait(read("#restart") + "?.disabled === false");
    await b.wait(read("#resources") + ".textContent === " + JSON.stringify(closedWallet));
    assert.equal(await b.evaluate(read("#opening") + ".hidden"), true);
    assert.equal(await b.evaluate("document.querySelectorAll('#structures > div').length"), 2);
    assert.equal(await b.evaluate(contains("#structures", "学习山崩 Lv2")), true);
    assert.deepEqual(await b.evaluate(`(async () => {
      const { createM2SaveStore } = await import("/src/game/m2/save.ts");
      const valid = value => value && typeof value === "object";
      return (await createM2SaveStore(valid, valid).read()).run.structures.map(tower => [tower.x, tower.y]);
    })()`), [[-288, -160], [288, -160]]);
    assert.equal(await b.evaluate(read("#pause") + ".textContent"), "继续");
    await b.evaluate("window.__m2BeforeReload = true");
    await b.send("Page.reload");
    await b.wait("window.__m2BeforeReload !== true && document.readyState === 'complete'");
    await b.wait(read("#restart") + "?.disabled === false");
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
    await click(b, "#choices button");
    await b.wait(contains("#cards", "小小"));
    await click(b, "#cards button");
    await place(b);
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
    await b.wait(read("#buy-ordinary") + "?.disabled === false");
    await b.evaluate(read("#ordinary-goods") + ".value = 'i241'");
    await click(b, "#buy-ordinary");
    await b.wait(contains("#resources", `${shopOpeningGold - 850} 金`));
    await b.evaluate(read("#ordinary-goods") + ".value = 'i242'");
    await click(b, "#buy-ordinary");
    await b.wait(contains("#resources", `${shopOpeningGold - 1800} 金`));
    assert.equal(await b.evaluate("[...document.querySelectorAll('#worker-items span')].some(item => item.textContent === '提尔的祝福')"), true);
    await b.close();

    const c = await openTab(base + "/src/game/m2/save.ts");
    await c.wait("location.pathname.endsWith('/save.ts') && document.readyState === 'complete'");
    const seen = await c.evaluate(`(async () => {
      const { createM2SaveStore } = await import("/src/game/m2/save.ts");
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
    const conflict = ["StaleM2Checkpoint", "Error"];
    assert.deepEqual(seen, [
      ...conflict, "DOMException", "QuotaExceededError", 60, ["wave15"],
      ...conflict, ...conflict, true, 60, ["wave15"],
    ]);
    await c.evaluate(`(async () => {
      const { createM2SaveStore } = await import("/src/game/m2/save.ts");
      const valid = value => value && typeof value === "object";
      const store = createM2SaveStore(valid, valid);
      await store.withWriter(async ({ checkpoint, commit }) => {
        const legacy = structuredClone(checkpoint.run);
        delete legacy.mapVersion;
        await commit(checkpoint, checkpoint.profile, legacy);
      });
    })()`);
    await c.close();
    const legacy = await openTab(url);
    await legacy.wait(read("#restart") + "?.disabled === false");
    await legacy.wait(contains("#placement-status", "旧地图存档已保留"));
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
      const { createM2SaveStore } = await import("/src/game/m2/save.ts");
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
    const shops = await openTab(url);
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
    await shops.send("Page.reload");
    await shops.wait(contains("#challenge-stock", "预约魅惑魔女 2 阶"));
    assert.equal(await shops.evaluate("!(" + refresh + ")"), true);
    await shops.evaluate(`${read("#mystery-shop")}.scrollIntoView({block:"start"})`);
    await capture(shops, "special-shops");
    await shops.close();
    const seasonFixture = await openTab(base + "/src/game/m2/save.ts");
    await seasonFixture.wait("location.pathname.endsWith('/save.ts') && document.readyState === 'complete'");
    await seasonFixture.evaluate(`(async () => {
      const { createM2SaveStore } = await import("/src/game/m2/save.ts");
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
    const seasons = await openTab(url);
    await seasons.wait(read('[data-item-id="i256"]') + "?.disabled === false");
    await click(seasons, '[data-item-id="i256"]');
    await seasons.wait(contains("#season-tasks", "点兵成金 · 1/99"));
    await seasons.wait(contains("#resources", "2300 金"));
    await seasons.wait(contains("#save", "已保存"));
    await seasons.send("Page.reload");
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
    console.log("M2 Chrome checks passed: season initialization, deferred rows, selected i256, progress/score after reload and new match, Firelord transform and refresh, worker talent, energy-circle transfer, special shops and saved stock, starter pack and four choices, normal shop and automatic recipe, purchased XP book, skill persistence, lifecycle freeze catch-up, paused freeze, camera presets, rotation, pan, orbit, zoom, reset and rotated placement coordinates, opening, invalid/valid placement previews, cancellation, worker and hero construction, upgrade, draw, refresh, exclusive writer takeover, restart, stale writes, abort recovery and legacy-map preservation/restart.");
  }
} finally {
  chrome.kill();
  await ended;
  await server?.close();
  await rm(profile, { recursive: true, force: true });
}
