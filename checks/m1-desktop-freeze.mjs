import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import assert from "node:assert/strict";
import { advanceFrame, newMatch } from "../src/game/battle.ts";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const profile = await mkdtemp("/tmp/td3v-");
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless", "--window-size=1440,900", "--remote-debugging-port=0", "--no-first-run", "--enable-unsafe-swiftshader",
  "--user-data-dir=" + profile, "about:blank",
], { stdio: "inherit" });
chrome.on("error", console.error);
chrome.on("exit", (code, signal) => console.error("Chrome exit", code, signal));
const url = process.argv[2] || "http://127.0.0.1:41987/";
let socket;
try {
  let port;
  for (let index = 0; index < 80 && !port; index++) {
    try { port = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; }
    catch { await sleep(100); }
  }
  if (!port) throw new Error("no port from profile " + profile + " pid " + chrome.pid);
  const page = (await (await fetch("http://127.0.0.1:" + port + "/json/list")).json()).find(x => x.type === "page");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const outstanding = new Map();
  const exceptions = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails);
    if (!message.id) return;
    outstanding.get(message.id)(message.result ?? message.error);
    outstanding.delete(message.id);
  };
  const cdp = (method, params = {}) => new Promise(resolve => {
    outstanding.set(++id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const response = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description);
    return response.result.value;
  };
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Page.navigate", { url });
  for (let index = 0; index < 50; index++) {
    if (await evaluate("!!document.querySelector('.layout:not([inert])')")) break;
    await sleep(150);
  }
  await evaluate(`window.lifecycleEvents=[]; for(const type of ['freeze','resume','visibilitychange'])document.addEventListener(type,()=>lifecycleEvents.push([type,performance.now(),document.visibilityState])); document.querySelector('#speed').click()`);
  await sleep(240);
  const before = await evaluate("document.querySelector('#time').textContent");
  const freeze = await cdp("Page.setWebLifecycleState", {state:"frozen"});
  if (freeze.code) throw Error(JSON.stringify(freeze));
  const frozenAt = performance.now();
  const freezeDuration = Number(process.argv[3] ?? 300000);
  await sleep(freezeDuration);
  const resumedAt = performance.now();
  console.error("Resuming after", resumedAt-frozenAt);
  await cdp("Page.setWebLifecycleState", {state:"active"});
  const readSnapshot = `new Promise(resolve=>{const open=indexedDB.open('td3');open.onsuccess=()=>{
    const db=open.result;const get=db.transaction('runs').objectStore('runs').get('current');get.onsuccess=()=>{resolve(get.result);db.close()};
  }})`;
  const target = await cdp("Target.createTarget", {url:"about:blank"});
  if (!target.code) {
    await cdp("Target.activateTarget", {targetId:page.id});
    await cdp("Target.closeTarget", {targetId:target.targetId});
  }
  await cdp("Page.bringToFront");
  let latest;
  for (let index = 0; index < 270; index++) {
    latest = await evaluate(readSnapshot);
    if (latest.state.phase === "failed") break;
    if (freezeDuration < 300000 && index === 40) break;
    await sleep(150);
  }
  const settlementAndSaveMs = performance.now() - resumedAt;
  const lifecycle = await evaluate('lifecycleEvents');
  const visibility = await evaluate('document.visibilityState');
  const settlementText = await evaluate('document.querySelector("#settlement-title").textContent');
  if (freezeDuration < 300000) {
    console.log(JSON.stringify({frame:latest.state.frame,clock:latest.clock,lifecycle,visibility,settlementText}));
  } else {
  const original = newMatch(latest.state.matchId, latest.state.randomState);
  while (original.phase === 'mainline' && original.frame < 12000) advanceFrame(original);
  assert.equal(latest.state.phase, 'failed');
  assert.equal(latest.state.frame, original.frame);
  assert.equal(latest.state.currentWave, original.currentWave);
  assert.equal(latest.state.containmentPoints, original.containmentPoints);
  assert.equal(latest.state.events.length, 0);
  assert.equal(latest.clock.pendingFrames, 0);
  assert.equal(latest.clock.speed, 4);
  assert.deepEqual(exceptions, []);
  assert.ok(lifecycle.some(([type]) => type === 'freeze') && lifecycle.some(([type]) => type === 'resume'));
  console.log(JSON.stringify({freezeMs:resumedAt-frozenAt,speed:4,before,expectedFailureFrame:original.frame,
    persistedFailureFrame:latest.state.frame,wave:latest.state.currentWave,containment:latest.state.containmentPoints,
    pendingFrames:latest.clock.pendingFrames,futureEvents:latest.state.events.length,settlementAndSaveMs,lifecycle,visibility,settlementText},null,2));
  }
} finally {
  socket?.close();
  chrome.kill();
  await sleep(300);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
