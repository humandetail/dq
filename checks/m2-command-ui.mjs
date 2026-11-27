import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createServer} from 'vite';
import {createChrome} from '/Users/laihanbin/.agents/skills/oil-ui/scripts/chrome.mjs';
const mobile = process.env.M2_MOBILE_VERIFY === '1';
const m3 = process.env.M3_VERIFY === '1';
const server = process.env.M2_ORIGIN ? undefined : await createServer({server:{host:'127.0.0.1',port:0,watch:null}});
await server?.listen();
const base = (process.env.M2_ORIGIN ?? server.resolvedUrls.local[0]).replace(/\/$/,'');
const saveFactory = m3 ? 'createM3SaveStore' : 'createM2SaveStore';
const initialMigration = m3 ? ', { source: "none" }' : '';
const evidenceDirectory = process.env.M2_EVIDENCE_DIR;
async function capture(filename) {
  if (!evidenceDirectory) return;
  await mkdir(evidenceDirectory, {recursive:true});
  const {data} = await cmd('Page.captureScreenshot',{format:'png'});
  await writeFile(join(evidenceDirectory,filename),Buffer.from(data,'base64'));
}
const browser=createChrome({prefix:'td3-design-check-'});
const ws=new WebSocket(await browser.launch());
await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
let seq=0;const pending=new Map();const errors=[];
ws.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails.text);const p=pending.get(data.id);if(p){pending.delete(data.id);data.error?p.reject(new Error(data.error.message)):p.resolve(data.result);}});
function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}));});}
const {targetId}=await send('Target.createTarget',{url:'about:blank'});
const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
const cmd=(method,params={})=>send(method,params,sessionId);
async function evaluate(expression){const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function until(expression) {
  let failure;
  for (let i = 0; i < 150; i++) {
    try {
      if (await evaluate(expression)) return;
    } catch (error) {
      failure = error;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('timeout ' + expression, {cause: failure});
}
async function key(key,code,modifiers=0){await cmd('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers});await cmd('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers});}
async function checkMobile() {
  const q = selector => 'document.querySelector(' + JSON.stringify(selector) + ')';
  async function touch(type, point) {
    await cmd('Input.dispatchTouchEvent', {type, touchPoints: point ? [{...point, id:1}] : []});
  }
  async function center(selector) {
    return evaluate(`(() => {
      const node = ${q(selector)};
      node.scrollIntoView({block:'nearest', inline:'nearest'});
      const rect = node.getBoundingClientRect(), x = rect.x + rect.width/2, y = rect.y + rect.height/2;
      if (!node.contains(document.elementFromPoint(x, y))) throw new Error(JSON.stringify({selector:${JSON.stringify(selector)},x,y,cover:document.elementFromPoint(x,y)?.outerHTML.slice(0,180),content:document.querySelector('.command-content').getBoundingClientRect(),scroll:document.querySelector('.command-content').scrollTop}));
      return {x, y};
    })()`);
  }
  async function tap(target) {
    await touch('touchStart', typeof target === 'string' ? await center(target) : target);
    await touch('touchEnd');
  }
  async function project(x,z,y=0) {
    return evaluate(`(() => {
      const field = document.querySelector('#field');
      const m = field.dataset.cameraProjection.split(',').map(Number);
      const rect = field.getBoundingClientRect();
      const x = ${x}/100, y = ${y}, z = ${z}/100;
      const w = m[3]*x+m[7]*y+m[11]*z+m[15];
      return {x:rect.left+(1+(m[0]*x+m[4]*y+m[8]*z+m[12])/w)*rect.width/2,
        y:rect.top+(1-(m[1]*x+m[5]*y+m[9]*z+m[13])/w)*rect.height/2};
    })()`);
  }
  const paused = q('#pause')+'.textContent === "继续"';
  const feedback = q('#feedback')+'.textContent';
  async function checkpoint(expression) {
    await until(`(async () => {
      const { ${saveFactory}: createSaveStore }=await import('/src/game/m2/save.ts');
      const {run}=await createSaveStore(()=>true,()=>true).read();
      return ${expression};
    })()`);
  }
  await capture('battle.png');
  await tap('.twelve-slots button:first-child');
  await tap('#builds button:first-child');
  await until(q('.command-backdrop')+'.hidden && '+q('#cancel-placement')+'.hidden === false');
  const focus=q('#field')+'.dataset.cameraFocus';
  const before = await evaluate(focus);
  await touch('touchStart',{x:190,y:245});
  await touch('touchMove',{x:239,y:252});
  await touch('touchEnd');
  await until(focus+' !== '+JSON.stringify(before));
  assert.doesNotMatch(await evaluate(feedback), /排队/);
  assert.equal(await evaluate(q('.selection-box')+'.hidden'), true);
  await tap('#reset-view');
  await tap(await project(-192, -128));
  await until(feedback+'.includes("排队")');
  await tap('#pause');
  await until(q('#cancel-placement')+'.hidden');
  await checkpoint('run.structures.length === 2');
  await tap('#pause');
  await until(paused);
  await tap('.touch-tools button:first-child');
  await tap(await project(-192,128,1));
  await until(feedback+'.includes("排队")');
  await tap('#pause');
  await checkpoint('run.inventory.some(item => item.id === 903 && item.slot !== null)');
  await tap('#pause');
  await until(paused);
  await tap('.hero-shortcuts button:nth-child(2)');
  await until(q('.unit-info h2')+'.textContent.includes("小小")');
  await tap('.touch-tools button:last-child');
  await tap('[data-skill=A068]');
  await until(feedback+'.includes("排队")');
  await tap('#pause');
  await until('!'+q('[data-skill=A068]')+'.classList.contains("auto")');
  await tap('#pause');
  await until(paused);
  await tap('[data-skill=A068]');
  await until(feedback+'.includes("排队")');
  await tap('.twelve-slots button:nth-child(5)');
  await until(q('.touch-actions p')+'.textContent.includes("集火")');
  await tap(await project(-192,-128));
  await until(feedback+'.includes("请选择敌方目标")');
  await tap('.touch-actions > button');
  await until(q('.touch-actions')+'.hidden');
  await tap('.touch-tools button:last-child');
  await tap('.six-slots button:nth-child(2)');
  await tap('.touch-actions div button:first-child');
  await tap('.hero-shortcuts button:first-child');
  await until(feedback+'.includes("排队")');
  await tap('.command-tools button:first-child');
  await tap('.live-shop input');
  await cmd('Input.insertText',{text:'不存在的商品'});
  await until(q('.live-goods')+'.textContent === "没有匹配的商品" && '+q('.goods-detail')+'.hidden');
  await evaluate(q('.live-shop input')+'.select()');
  await cmd('Input.insertText',{text:'艺人面罩'});
  await until('document.querySelectorAll(".live-goods article").length===1');
  await tap('.live-goods article');
  await capture('shop.png');
  await tap('.goods-detail button');
  await until(feedback+'.includes("排队")');
  assert.equal(await evaluate(q('.command-window > #feedback')+'?.checkVisibility()'),true);
  await tap('.command-window>nav button:last-child');
  await tap('#pause');
  await checkpoint('run.inventory.some(item => item.id >= 1000 && item.itemId === "i101")');
  await checkpoint('run.structures.find(tower => tower.id === 900)?.treeGrab?.readyUs > 0');
  await checkpoint('run.inventory.some(item => item.id === 902 && item.towerId === undefined)');
  await tap('#pause');
  await until(paused);
  await checkpoint('run.clock.paused && run.structures.find(tower => tower.id === 900)?.autoModes?.A068 === false');
  await evaluate(q('#field')+'.dataset.ready = "reloading"');
  await cmd('Page.reload');
  await until(q('#field')+'.dataset.ready === "true" && '+paused);
  await tap('.hero-shortcuts button:nth-child(2)');
  await until(q('[data-skill=A068]')+' && !'+q('[data-skill=A068]')+'.classList.contains("auto")');
  await capture('hero.png');
  for (const [width,height] of [[320,568],[430,932],[844,390]]) {
    await cmd('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
    await until('innerWidth === '+width);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
    await center('.twelve-slots button:first-child');
    await center('#reset-view');
    if (width === 320 || width === 844) await capture('battle-'+width+'.png');
  }
  assert.deepEqual(errors,[]);
  console.log('PASSED: touch pan/placement, pickup, auto mode, casting, transfer, shop purchase, save/reload and responsive viewports');
}
try{
await cmd('Runtime.enable');await cmd('Page.enable');await cmd('Emulation.setFocusEmulationEnabled',{enabled:true});await cmd('Emulation.setDeviceMetricsOverride',mobile
  ? {width:390,height:844,deviceScaleFactor:1,mobile:true}
  : {width:1440,height:900,deviceScaleFactor:1,mobile:false});
if (mobile) await cmd('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
await cmd('Page.navigate',{url:base+'/src/game/m2/save.ts'});
await until('location.pathname.endsWith("/save.ts") && document.readyState === "complete"');
await evaluate(`(async()=>{
 const {newMatch,creditTime,drain}=await import('/src/game/m2/match.ts');
 const {newHero}=await import('/src/game/m2/hero.ts');
 const { ${saveFactory}: createSaveStore }=await import('/src/game/m2/save.ts');
 const state=newMatch('ui-acceptance',42);state.gold=20000;state.lumber=1000;
 const hero=newHero('H021');hero.level=18;hero.points=4;hero.ranks={A067:3,A068:3,A069:2};
 state.structures=[{id:900,templateId:'H021',x:288,y:128,radius:72,population:20,qualification:null,pending:null,hero}];
 state.population=20;state.inventory=[{id:901,itemId:'i109',slot:0,charges:0,point:state.worker,towerId:900},{id:902,itemId:'i193',slot:1,charges:0,point:state.worker,towerId:900}];state.nextId=1000;
 creditTime(state,40000);while(drain(state,10000)==='pending'){}state.clock.paused=true;
 if (${mobile}) {
   delete state.structures[0].treeGrab;
   state.inventory.push({id:903,itemId:'i102',slot:null,charges:0,point:{x:-192,y:128}});
 }
 const store=createSaveStore(()=>true,()=>true);await store.withWriter(async writer=>{await writer.commit(undefined,{score:0,claims:[]},state${initialMigration});});
 return true;
})()`);
await cmd('Page.navigate',{url:base+'/m2.html'});
await until('document.querySelector("#field")?.dataset.ready === "true" && document.querySelector(".hero-shortcuts")?.children.length===2 && !document.querySelector("#pause").disabled && document.querySelector("#pause").textContent === "继续"');
if (mobile) {
  await checkMobile();
} else {
await evaluate('document.querySelectorAll(".hero-shortcuts button")[1].click()');
await until('document.querySelector(".unit-info h2").textContent.includes("小小")');
const toggleTarget = await evaluate(`(() => {
  const button = document.querySelector('[data-skill="A068"]');
  const rect = button.getBoundingClientRect();
  return {x:rect.x + rect.width / 2,y:rect.y + rect.height / 2,enabled:!button.disabled,automatic:button.classList.contains("auto")};
})()`);
assert.ok(toggleTarget.enabled && toggleTarget.automatic);
// Prove the right-click reaches the live button while paused before testing drain.
const {x, y} = toggleTarget;
await cmd('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'right',buttons:2,clickCount:1});
await cmd('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'right',clickCount:1});
await until('document.querySelector("#feedback").textContent === "指令已排队，继续后执行。"');
assert.equal(await evaluate('document.querySelector("[data-skill=A068]").classList.contains("auto")'),true);
await evaluate('document.querySelector("#pause").click()');
await until('document.querySelector("#pause").textContent === "暂停" && document.querySelector("#feedback").textContent === "操作已执行。" && !document.querySelector("[data-skill=A068]").classList.contains("auto")');
await evaluate('document.querySelector("#pause").click()');
await until('document.querySelector("#pause").textContent === "继续" && !document.querySelector("[data-skill=A068]").classList.contains("auto")');
await evaluate('document.querySelectorAll(".twelve-slots button")[3].click()');
await until('document.querySelector(".twelve-slots").textContent.includes("返回")');
await evaluate('document.querySelector("[data-skill=A067]").click()');await key(' ','Space');await until('document.querySelector("[data-skill=A067]").textContent.includes("4")');await key(' ','Space');
await evaluate('document.querySelector(".command-tools button").click()');
assert.equal(await evaluate('document.querySelector(".command-backdrop").hidden'),false);
const paused=await evaluate('document.querySelector("#pause").textContent');await key(' ','Space');await until('document.querySelector("#pause").textContent !== '+JSON.stringify(paused));await key(' ','Space');
await evaluate('document.querySelector(".live-shop input").value="艺人面罩";document.querySelector(".live-shop input").dispatchEvent(new Event("input"))');
assert.equal(await evaluate('document.querySelectorAll(".live-goods article").length'),1);
await evaluate('document.querySelector(".live-goods article").click();document.querySelector(".goods-detail button").click()');await key(' ','Space');await until('document.querySelector("#feedback").textContent.includes("执行")');await key(' ','Space');
const recipeCount = m3 ? await evaluate('import("/src/game/m2/content.ts").then(({recipes}) => recipes.size)') : 72;
await evaluate('document.querySelectorAll(".command-window>nav button")[1].click()');assert.equal(await evaluate('document.querySelectorAll(".recipe-entry").length'),recipeCount);
await evaluate('document.querySelectorAll(".command-window>nav button")[2].click()');assert.ok(await evaluate('document.querySelectorAll(".live-codex article").length')>202);
await key('Escape','Escape');assert.equal(await evaluate('document.querySelector(".command-backdrop").hidden'),true);
await key('1','Digit1',2);await evaluate('document.querySelectorAll(".hero-shortcuts button")[0].click()');await key('1','Digit1');await until('document.querySelector(".unit-info h2").textContent.includes("小小")');
const markerBefore=await evaluate('parseFloat(document.querySelector(".unit-marker").style.left)');
await cmd('Input.dispatchMouseEvent',{type:'mousePressed',x:600,y:300,button:'middle',clickCount:1});await cmd('Input.dispatchMouseEvent',{type:'mouseMoved',x:680,y:300,button:'middle',buttons:4});await cmd('Input.dispatchMouseEvent',{type:'mouseReleased',x:680,y:300,button:'middle',clickCount:1});await until('Math.abs(parseFloat(document.querySelector(".unit-marker").style.left)-'+markerBefore+')>10');await evaluate('document.querySelector("#reset-view").click()');
await evaluate('document.querySelectorAll(".twelve-slots button")[4].click()');await cmd('Input.dispatchMouseEvent',{type:'mousePressed',x:500,y:130,button:'left',clickCount:1});await cmd('Input.dispatchMouseEvent',{type:'mouseReleased',x:500,y:130,button:'left',clickCount:1});assert.match(await evaluate('document.querySelector("#feedback").textContent'),/请选择/);await key('Escape','Escape');
await capture('battle.png');
await evaluate('document.querySelector(".command-tools button").click();document.querySelector(".live-shop input").value="";document.querySelector(".live-shop input").dispatchEvent(new Event("input"))');await capture('shop.png');await key('Escape','Escape');
await until(`(async () => {
  const { ${saveFactory}: createSaveStore }=await import('/src/game/m2/save.ts');
  const checkpoint=await createSaveStore(()=>true,()=>true).read();
  return checkpoint.run.structures.find(tower => tower.id === 900)?.autoModes?.A068 === false && checkpoint.run.clock.paused;
})()`);
await evaluate('document.querySelector("#field").dataset.ready="reloading"');await cmd('Page.reload');await until('document.querySelector("#field").dataset.ready === "true" && document.querySelector(".hero-shortcuts").children.length===2');await evaluate('document.querySelectorAll(".hero-shortcuts button")[1].click()');await until('document.querySelector("[data-skill=A068]") !== null');assert.equal(await evaluate('document.querySelector("[data-skill=A068]").classList.contains("auto")'),false);
assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
assert.deepEqual(errors,[]);console.log(`PASSED: live hero selection, auto-mode command/save/reload, learning, central shop search/purchase, ${recipeCount} recipes, codex, modal pause, Escape, viewport, runtime errors`);
}
}catch(error){console.error(await evaluate('({feedback:document.querySelector("#feedback")?.textContent,save:document.querySelector("#save")?.textContent,pause:document.querySelector("#pause")?.textContent,skill:document.querySelector("[data-skill=A068]")?.outerHTML})'));throw error;}finally{await browser.stop(ws);await server?.close();}
