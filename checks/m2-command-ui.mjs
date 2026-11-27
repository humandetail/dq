import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createServer} from 'vite';
import {createChrome} from '/Users/laihanbin/.agents/skills/oil-ui/scripts/chrome.mjs';
const mobile = process.env.M2_MOBILE_VERIFY === '1';
const buttonAudit = process.env.M2_BUTTON_AUDIT === '1';
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
async function assertClearBattlefield() {
  const { covering, height, canPointAtCenter } = await evaluate(`(() => {
    const field = document.querySelector('#field'), bounds = field.getBoundingClientRect();
    const controls = document.querySelectorAll('.command-tools button, .hero-shortcuts button, .battlefield-tools button, .placement-bar, .command-status, .touch-actions, .command-dock');
    const covering = [...controls].filter(control => {
      const rect = control.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 &&
        Math.min(rect.right, bounds.right) - Math.max(rect.left, bounds.left) > 1 &&
        Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top) > 1;
    }).map(control => control.className || control.textContent.trim());
    return { covering, height: bounds.height,
      canPointAtCenter: document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2) === field };
  })()`);
  assert.deepEqual(covering, [], 'Main interface covers the battlefield');
  assert.ok(height >= 150 && canPointAtCenter, 'Battlefield must have a visible, actionable play area');
}
async function assertLongLabelsFit() {
  const clipped = await evaluate(`(() => {
    const labels = {
      '.hero-shortcuts button:last-child': '熊猫酒仙<SSR>',
      '.unit-info h2': '大地风暴烈火<SSR>',
      '.unit-info p': '等级 100 · 经验 123456789 · 技能点 12345 · 射程 750 · 魔法 100000000000000/100000000000000',
      '.twelve-slots button:first-child': '召唤风暴、烈火和大地之灵',
      '.touch-actions p': '等待工人完成当前建造，再选择接收装备的友方单位，或取消操作。',
      '#feedback': '此处不可放置 · 避开道路、障碍及已有塔，并留出完整底座空间。金币、木材或人口不足时，请换一座塔或补足资源。'
    };
    return Object.entries(labels).filter(([selector, text]) => {
      const node = document.querySelector(selector);
      const actions = node.closest('.touch-actions');
      const wasHidden = actions?.hidden;
      if (actions) actions.hidden = false;
      const label = [...node.childNodes].find(child => child.nodeType === Node.TEXT_NODE);
      const original = label?.data;
      const sample = label ?? node.appendChild(document.createTextNode(''));
      sample.data = text;
      const range = document.createRange();
      range.selectNodeContents(sample);
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const cropped = [...range.getClientRects()].some(rect => rect.left < box.left - 1 || rect.right > box.right + 1 ||
        rect.top < box.top - 1 || (style.overflowY !== 'auto' && rect.bottom > box.bottom + 1));
      if (label) label.data = original;
      else sample.remove();
      if (actions) actions.hidden = wasHidden;
      return cropped;
    }).map(([selector]) => selector);
  })()`);
  assert.deepEqual(clipped, [], 'Long labels overflow their containers');
}
async function auditButtonLabels() {
  const issues = new Map();
  let checked = 0;
  async function click(selector) {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  }
  async function scan(viewport, state) {
    const result = await evaluate(`(() => {
      const overflow = [];
      let count = 0;
      for (const button of document.querySelectorAll('button, [role="button"], summary')) {
        if (!button.checkVisibility()) continue;
        const bounds = button.getBoundingClientRect();
        if (bounds.width === 0 || bounds.height === 0) continue;
        const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        let text;
        let hasLabel = false;
        let clipped = false;
        while ((text = walker.nextNode())) {
          if (!text.data.trim() || !text.parentElement.checkVisibility()) continue;
          range.selectNodeContents(text);
          const lines = [...range.getClientRects()];
          hasLabel ||= lines.length > 0;
          clipped ||= lines.some(line =>
            line.left < bounds.left - 1 || line.right > bounds.right + 1 ||
            line.top < bounds.top - 1 || line.bottom > bounds.bottom + 1);
        }
        if (!hasLabel) continue;
        count++;
        const scrollRow = button.closest('.touch-actions div, .hero-shortcuts, .selection-strip');
        if (clipped || scrollRow && bounds.width > scrollRow.clientWidth + 1) {
          overflow.push({label: button.getAttribute('aria-label') ?? button.innerText.trim(),
            container: button.parentElement.id || button.parentElement.className || button.parentElement.tagName,
            width: Math.round(bounds.width)});
        }
      }
      return {count, overflow};
    })()`);
    checked += result.count;
    for (const item of result.overflow) {
      const {label, container} = item;
      const key = `${container} / ${label}`;
      const issue = issues.get(key) ?? {label, container, states: []};
      issue.states.push(`${viewport} ${state} (${item.width}px)`);
      issues.set(key, issue);
    }
  }
  for (const [width, height, touch] of [[320, 568, true], [360, 640, true], [390, 844, true], [430, 932, true],
    [280, 653, true], [480, 320, true], [568, 320, true], [844, 390, true], [901, 768, false], [1024, 768, false], [1440, 900, false]]) {
    await cmd('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: touch});
    await cmd('Emulation.setTouchEmulationEnabled', {enabled: touch});
    await until('innerWidth === ' + width);
    const viewport = `${width}×${height}`;
    await click('.hero-shortcuts button:first-child');
    await until('document.querySelector(".unit-info h2").textContent === "工人"');
    await scan(viewport, 'worker');
    if (touch) {
      await click('.touch-tools button:nth-child(2)');
      await scan(viewport, 'worker inventory');
      await click('.touch-tools button:nth-child(2)');
    }
    await click('.hero-shortcuts button:nth-child(2)');
    await until('document.querySelector("[data-skill=A068]") !== null');
    await scan(viewport, 'hero');
    await click('.hero-shortcuts button:nth-child(3)');
    await until('document.querySelector(".unit-info h2").textContent.includes("食人魔魔法师")');
    await scan(viewport, 'long hero name');
    if (width === 280) await capture('long-hero-280.png');
    await click('.hero-shortcuts button:nth-child(2)');
    await until('document.querySelector("[data-skill=A068]") !== null');
    await click('.twelve-slots button:nth-child(4)');
    await until('document.querySelector(".twelve-slots").textContent.includes("返回")');
    await scan(viewport, 'skill learning');
    await click('.twelve-slots button:nth-child(4)');
    if (touch) {
      await click('.touch-tools button:nth-child(2)');
      await scan(viewport, 'hero inventory');
      await click('.touch-tools button:last-child');
      await click('.six-slots button:nth-child(3)');
      await scan(viewport, 'item transfer');
      if (width === 480) await capture('item-transfer-480.png');
      await click('.six-slots button:nth-child(2)');
      assert.equal(await evaluate('document.querySelectorAll(".touch-actions div button").length'), 2);
      await scan(viewport, 'active item alternatives');
      await click('.touch-actions > button');
      await click('.touch-tools button:nth-child(2)');
    }
    for (const [index, name] of ['商店', '合成', '图鉴', '对局'].entries()) {
      await click(`.command-tools button:nth-child(${index + 1})`);
      await evaluate('document.querySelectorAll(".command-content details").forEach(detail => { detail.open = true; })');
      await scan(viewport, name);
    }
    if (await evaluate('!document.querySelector("#choices").closest("section").hidden')) {
      await scan(viewport, 'opening hero choices');
    }
    await click('#builds button:first-child');
    await until('!document.querySelector("#cancel-placement").hidden');
    await scan(viewport, 'tower placement');
    await click('#cancel-placement');
  }
  assert.deepEqual(errors, []);
  console.log(`Checked ${checked} rendered labels across 11 viewports and battle/menu states`);
  assert.deepEqual([...issues.values()], [], 'Button labels are clipped or exceed their available width');
}
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
  await assertClearBattlefield();
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
  await assertClearBattlefield();
  await capture('aiming.png');
  await tap(await project(-192,-128));
  await until(feedback+'.includes("请选择敌方目标")');
  await tap('.touch-actions > button');
  await until(q('.touch-actions')+'.hidden');
  await tap('.touch-tools button:last-child');
  await tap('.touch-tools button:nth-child(2)');
  await assertClearBattlefield();
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
    await assertClearBattlefield();
    await assertLongLabelsFit();
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
 if (${buttonAudit}) {
   const { challengeGoods } = await import('/src/game/m2/shops.ts');
   const ogre = newHero('H018');
   ogre.level = 18;
   ogre.points = 4;
   state.structures.push({id:906,templateId:'H018',x:288,y:-128,radius:72,population:20,qualification:null,pending:null,hero:ogre});
   state.population += 20;
   state.inventory.push({id:904,itemId:'i303',slot:2,charges:0,point:state.worker,towerId:900});
   state.inventory.push({id:905,itemId:'i271',slot:0,charges:0,point:state.worker});
   state.openingChoicesUnlocked=true;
   state.overdraftOpen=true;
   state.mysteryShopOpen=true;
   state.challengeShopOpen=true;
   state.qualificationShopOpen=true;
   state.mysteryStock={i303:4,i311:3};
   state.challengeStock=Object.fromEntries(challengeGoods.map(id=>[id,1]));
 }
 if (${mobile}) {
   delete state.structures[0].treeGrab;
   state.inventory.push({id:903,itemId:'i102',slot:null,charges:0,point:{x:-192,y:128}});
 }
 const store=createSaveStore(()=>true,()=>true);await store.withWriter(async writer=>{await writer.commit(undefined,{score:0,claims:[]},state${initialMigration});});
 return true;
})()`);
await cmd('Page.navigate',{url:base+'/m2.html'});
await until('document.querySelector("#field")?.dataset.ready === "true" && document.querySelector(".hero-shortcuts")?.children.length==='+ (buttonAudit ? 3 : 2) + ' && !document.querySelector("#pause").disabled && document.querySelector("#pause").textContent === "继续"');
if (buttonAudit) {
  if (await evaluate('!document.querySelector(".command-backdrop").hidden')) {
    await evaluate('document.querySelector(".command-window>nav button:last-child").click()');
  }
  await auditButtonLabels();
} else if (mobile) {
  await assertClearBattlefield();
  await checkMobile();
} else {
await assertClearBattlefield();
await assertLongLabelsFit();
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
