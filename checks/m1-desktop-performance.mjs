import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import assert from "node:assert/strict";
import { makeDesktopFixture } from "./m1-desktop-fixture.mjs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const profile = await mkdtemp("/tmp/td3v-");
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless", "--window-size=1440,900", "--remote-debugging-port=0", "--no-first-run", "--enable-unsafe-swiftshader",
  "--user-data-dir=" + profile, "about:blank",
], { stdio: "inherit" });
chrome.on("error", console.error);
chrome.on("exit", (code, signal) => console.error("Chrome exit", code, signal));
const mode = process.argv[2];
assert.ok(mode === "on" || mode === "off", "pass on or off");
const url = process.argv[3] || "http://127.0.0.1:41992/";
const seconds = Number(process.argv[4] ?? 600);
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
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp("Page.navigate", { url: new URL("/fixture.html", url).href });
  const fixture = makeDesktopFixture();
  const write = `new Promise((resolve,reject)=>{
    const open=indexedDB.open('td3',1);
    open.onupgradeneeded=()=>open.result.createObjectStore('runs');
    open.onsuccess=()=>{const db=open.result;const tx=db.transaction('runs','readwrite');
      tx.objectStore('runs').put(${JSON.stringify(fixture)},'current');
      tx.oncomplete=()=>{db.close();resolve(true)};tx.onabort=()=>reject(tx.error);};
    open.onerror=()=>reject(open.error);
  })`;
  for (let i=0;i<50;i++) {
    if (await evaluate("document.title === 'TD3 audit fixture'")) break;
    await sleep(50);
  }
  assert.equal(await evaluate(write), true);
  const setup=await readFile(new URL("./m1-desktop-metrics.js", import.meta.url), "utf8");
  await cdp("Page.addScriptToEvaluateOnNewDocument", {source: `globalThis.desktopAuditConfig=${JSON.stringify({mode,seconds})};
${setup}`});
  await cdp("Page.navigate", {url});
  let result;
  for (let index=0; index<seconds+60; index++) {
    await sleep(1000);
    result=await evaluate("globalThis.desktopAuditResult || null");
    if (result) break;
    if (index % 60 === 0) console.error(mode, index, await evaluate("globalThis.desktopAuditProgress || null"));
  }
  assert.ok(result, "renderer did not report results");
  assert.deepEqual(exceptions, []);
  assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
  console.log(JSON.stringify(result,null,2));
} finally {
  socket?.close();
  chrome.kill();
  await sleep(300);
  await rm(profile,{recursive:true,force:true}).catch(()=>{});
}
