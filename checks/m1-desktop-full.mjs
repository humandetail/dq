import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const profile = await mkdtemp("/tmp/td3v-");
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless", "--window-size=1440,900", "--remote-debugging-port=0", "--no-first-run", "--enable-unsafe-swiftshader",
  "--user-data-dir=" + profile, "about:blank",
], { stdio: "inherit" });
chrome.on("error", console.error);
chrome.on("exit", (code, signal) => console.error("Chrome exit", code, signal));
const url = process.argv[2] || "http://127.0.0.1:4174/";
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
  await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.auditRead=()=>new Promise((resolve,reject)=>{let req=indexedDB.open('td3');req.onsuccess=()=>{const db=req.result;const get=db.transaction('runs').objectStore('runs').get('current');get.onsuccess=()=>{const s=get.result;db.close();resolve(s??null)};get.onerror=reject};req.onerror=reject});
  ` });
  const waitForUI = async () => {
    for (let index = 0; index < 80; index++) {
      await sleep(150);
      const ready = await evaluate("!!document.querySelector('.layout:not([inert]) canvas')");
      if (ready) return;
    }
    throw new Error(await evaluate("document.body.textContent"));
  };
  await cdp("Page.navigate", { url });
  await waitForUI();
  const waitUntil = async (expression, timeout) => {
    const until = performance.now() + timeout;
    do {
      const value = await evaluate(expression);
      if (value) return value;
      await sleep(150);
    } while (performance.now() < until);
    throw new Error("Timeout " + expression + " " + await evaluate("document.body.innerText"));
  };
  const click = async selector => {
    const find = "document.querySelector(" + JSON.stringify(selector) + ")";
    await waitUntil(find + " && !" + find + ".disabled && !" + find + ".hidden", 10000);
    await evaluate(find + ".click()");
  };
  const waitSaved = () => waitUntil("document.querySelector('#app-status').textContent === '已保存到此浏览器'", 10000);
  const start = performance.now();
  await click("#build-options button");
  await click("#upgrade");
  await waitUntil("document.querySelector('#gold').textContent === '51'", 5000);
  await waitUntil("Number(document.querySelector('#gold').textContent) >= 75", 110000);
  await click("#draw");
  await click("[data-site=east]");
  await click("#build-options button");
  await click("#shop button:first-child");
  await click("#shop button:nth-child(2)");
  await click("#crafting button:first-child");
  await click("[data-site=west]");
  await click("#crafting button:nth-child(2)");
  const economy = await waitUntil("auditRead().then(s=>s?.state.items.some(i=>i.owner.type==='tower') && s.state.gold)", 5000);
  await waitUntil("document.querySelector('#settlement-title').textContent === '主线完成'", 650000);
  await waitSaved();
  const won = await evaluate("auditRead()");
  if (won.clock.speed !== 1) throw Error("Mainline speed changed");
  console.error("Mainline 1× complete", won.state.frame, Math.round(performance.now() - start));
  const mainlineWallMs = Math.round(performance.now() - start);
  await cdp("Page.reload");
  await waitForUI();
  if (!await evaluate("!document.querySelector('#settlement').hidden && document.querySelector('#settlement-title').textContent === '主线完成'")) throw Error("Victory did not restore");
  await click("#endless");
  await waitUntil("document.querySelector('#wave').textContent.startsWith('2 /')", 85000);
  await click("#pause");
  await waitSaved();
  const paused = await evaluate("auditRead()");
  await cdp("Page.reload");
  await waitForUI();
  const resumed = await evaluate("auditRead()");
  if (paused.state.frame !== resumed.state.frame || paused.state.matchId !== resumed.state.matchId || !resumed.clock.paused) throw Error("restore differs");
  await click("#pause");
  await waitUntil("document.querySelector('#settlement-title').textContent === '防线失守'", 720000);
  await waitSaved();
  const failed = await evaluate("auditRead()");
  if (failed.clock.speed !== 1 || failed.state.lastCompletedWave < 5 || failed.clock.pendingFrames !== 0) throw Error("Unexpected endless result");
  await cdp("Page.reload");
  await waitForUI();
  if (!await evaluate("!document.querySelector('#settlement').hidden && document.querySelector('#settlement-title').textContent === '防线失守'")) throw Error("Defeat did not restore");
  await click("#restart");
  await waitSaved();
  const restarted = await evaluate("auditRead()");
  if (failed.state.events.length || restarted.state.gold !== 100 || restarted.state.matchId === failed.state.matchId) {
    throw new Error("settlement or restart mismatch");
  }
  if (exceptions.length) throw new Error(JSON.stringify(exceptions));
  console.log(JSON.stringify({
    speed: 1, mainlineWallMs, economy, failedFrame: failed.state.frame, containment: failed.state.containmentPoints, wonFrame: won.state.frame, pausedFrame: paused.state.frame, failedWave: failed.state.currentWave,
    completed: failed.state.lastCompletedWave, realDurationMs: Math.round(performance.now() - start),
    errors: exceptions.length,
  }, null, 2));
} finally {
  socket?.close();
  chrome.kill();
  await sleep(300);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
