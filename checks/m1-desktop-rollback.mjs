import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const profile = await mkdtemp("/tmp/td3v-");
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless", "--remote-debugging-port=0", "--no-first-run", "--enable-unsafe-swiftshader",
  "--user-data-dir=" + profile, "about:blank",
], { stdio: "inherit" });
chrome.on("error", console.error);
chrome.on("exit", (code, signal) => console.error("Chrome exit", code, signal));
const previous = process.argv[2];
assert.ok(previous, "pass the old package's web directory");
const current = fileURLToPath(new URL("../../web/", import.meta.url));
let useOld = true;
const types = { html: "text/html", css: "text/css", js: "text/javascript" };
const server = createServer(async (req,res) => {
  const path = new URL(req.url,"http://localhost").pathname;
  const root = path === "/save-tools.html" || !useOld ? current : previous;
  const relative = path === "/" ? "/index.html" : path;
  try {
    assert.match(relative,/^\/[A-Za-z0-9/_.-]+$/);
    assert.ok(!relative.includes(".."));
    const bytes = await readFile(join(root,relative));
    res.writeHead(200,{ "Content-Type": types[relative.split(".").at(-1)] ?? "application/octet-stream","Cache-Control":"no-store" });
    res.end(bytes);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
const url = "http://127.0.0.1:" + server.address().port;
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
  let acceptDialog = true;
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails);
    if (message.method === "Page.javascriptDialogOpening") void cdp("Page.handleJavaScriptDialog", {accept:acceptDialog});
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
  async function wait(expression) {
    for (let count=0;count<150;count++) {
      const value = await evaluate(expression).catch(() => undefined);
      if (value) return value;
      await sleep(75);
    }
    throw Error("Timed out: " + expression + " " + await evaluate("document.body.innerText"));
  }
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const open = path => cdp("Page.navigate", {url:url+path});
  const read = `new Promise(resolve=>{const req=indexedDB.open("td3");req.onsuccess=()=>{const db=req.result;
    const get=db.transaction("runs").objectStore("runs").get("current");get.onsuccess=()=>{resolve(get.result);db.close()};};})`;
  const choose = async path => {
    const doc = await cdp("DOM.getDocument");
    const file = await cdp("DOM.querySelector",{nodeId:doc.root.nodeId,selector:"#file"});
    const result = await cdp("DOM.setFileInputFiles",{nodeId:file.nodeId,files:[path]});
    assert.ok(!result.code,JSON.stringify(result));
  };
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Page.setDownloadBehavior",{behavior:"allow",downloadPath:profile});
  await open("/");
  await wait('!!document.querySelector(".layout:not([inert]) #build-options button")');
  await click("#build-options button");
  await wait(`(${read}).then(s=>s?.state.towers.length === 1)`);
  await click("#pause");
  const beforeClose = await wait(`(${read}).then(s=>s?.clock.paused && s)`);
  assert.equal(beforeClose.contentVersion,"m1-1");
  await open("/save-tools.html");
  await wait('document.querySelector("#status")?.textContent.startsWith("当前存档 m1-1")');
  const original = await evaluate(read);
  assert.deepEqual(original.state,beforeClose.state);
  await click("#export");
  await wait('document.querySelector("#status")?.textContent.startsWith("已导出 m1-1")');
  let backupFile;
  for (let i=0;i<100 && !backupFile;i++) {
    backupFile=(await readdir(profile)).find(f=>/^TD3-m1-1-.*\.json$/.test(f));
    if (!backupFile) await sleep(50);
  }
  assert.ok(backupFile);
  const backupPath = join(profile,backupFile);
  const backup = JSON.parse(await readFile(backupPath,"utf8"));
  assert.deepEqual(backup.snapshot,original);
  useOld=false;
  await open("/");
  await wait('document.querySelector(".layout:not([inert]) #speed")');
  await click("#speed");
  const upgraded=await wait(`(${read}).then(s=>s?.contentVersion==="m1-2" && s)`);
  assert.equal(upgraded.state.matchId,original.state.matchId);
  assert.deepEqual(upgraded.state.towers,original.state.towers);
  await open("/save-tools.html");
  await wait('document.querySelector("#status")?.textContent.startsWith("当前存档 m1-2")');
  const corrupt=join(profile,"corrupt.json");
  const tampered=structuredClone(backup);
  tampered.snapshot.state.gold++;
  await writeFile(corrupt,JSON.stringify(tampered));
  await choose(corrupt);
  await wait('document.querySelector("#status")?.textContent.startsWith("备份校验失败")');
  assert.deepEqual(await evaluate(read),upgraded);
  await choose(backupPath);
  await wait('document.querySelector("#status")?.textContent.startsWith("待恢复 m1-1")');
  acceptDialog=false;
  await click("#import");
  await wait('document.querySelector("#status")?.textContent.startsWith("已取消")');
  assert.deepEqual(await evaluate(read),upgraded);
  acceptDialog=true;
  await click("#import");
  await wait('document.querySelector("#status")?.textContent.startsWith("已提交恢复 m1-1")');
  assert.deepEqual(await evaluate(read),original);
  useOld=true;
  await open("/");
  await wait('!!document.querySelector(".layout:not([inert]) #upgrade")');
  assert.equal(await evaluate('document.querySelector("#pause").textContent'),"继续");
  assert.equal(await evaluate('document.querySelector("#gold").textContent'),String(original.state.gold));
  assert.deepEqual(await evaluate(read),original);
  assert.deepEqual(exceptions,[]);
  console.log(JSON.stringify({originalVersion:original.contentVersion,upgradedVersion:upgraded.contentVersion,
    rollbackVersion:(await evaluate(read)).contentVersion,frame:original.state.frame,gold:original.state.gold,
    towers:original.state.towers.length,exactSnapshotRestored:true,corruptBackupRejected:true,cancelKeptSnapshot:true},null,2));
} finally {
  socket?.close();
  chrome.kill();
  server.close();
  await sleep(300);
  await rm(profile,{recursive:true,force:true}).catch(()=>{});
}
