import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {createChrome} from '/Users/laihanbin/.agents/skills/oil-ui/scripts/chrome.mjs';
const base = process.env.M2_ORIGIN ?? 'http://127.0.0.1:5173';
const directory = process.env.M2_EVIDENCE_DIR ?? '/tmp/td3-qualification-evidence';
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

try {
  await mkdir(directory,{recursive:true});
  await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  await cmd('Page.navigate',{url:base+'/src/game/m2/save.ts'});
  await until('document.readyState === "complete" && location.pathname.endsWith("save.ts")');
  await evaluate(`(async()=>{
    const {newMatch}=await import('/src/game/m2/match.ts');
    const {newHero}=await import('/src/game/m2/hero.ts');
    const {qualificationChains}=await import('/src/game/m2/content.ts');
    const {createM3SaveStore}=await import('/src/game/m2/save.ts');
    const state=newMatch('qualification-ui-acceptance',42);state.clock.paused=true;
    state.qualificationShopOpen=true;
    for(const [index,templateId] of ['H021','H029','H044'].entries()) {
      const hero=newHero(templateId);hero.level=20;
      state.structures.push({id:900+index,templateId,x:state.worker.x+index*180,y:state.worker.y,radius:72,population:20,qualification:'P00'+(index+1),pending:null,hero});
    }
    for(const [index,id] of ['P002','P003'].entries()) {
      const chain=qualificationChains.get(id);
      const templateId=index===0?chain.levels[0].id:chain.requireUnit;
      state.structures.push({id:910+index,templateId,x:state.worker.x+index*180,y:state.worker.y+200,radius:72,population:5,qualification:null,pending:null});
    }
    state.population=70;state.populationLimit=100;state.nextId=1000;
    state.cards=Array.from({length:5},(_,slot)=>({id:920+slot,card:'i603',slot,charges:1,hp:100,point:state.worker}));
    const store=createM3SaveStore(()=>true,()=>true);
    await store.withWriter(writer=>writer.commit(undefined,{score:0,claims:[]},state,{source:'none'}));
  })()`);
  await cmd('Page.navigate',{url:base+'/m2.html'});
  await until('document.querySelector("#field")?.dataset.ready === "true" && document.querySelector(".hero-shortcuts")?.children.length === 4');
  await evaluate(`document.querySelector('.command-window>nav button:last-child').click()`);
  for(const [index,expected] of ['尚未建造','Lv1','已满足，可以突破 20 级'].entries()) {
    await evaluate(`document.querySelector('.hero-shortcuts button:nth-child(${index+2})').click()`);
    await until(`document.querySelector('.unit-info h2')?.textContent === document.querySelector('.hero-shortcuts button:nth-child(${index+2})').textContent && document.querySelector('.hero-qualification')`);
    assert.match(await evaluate('document.querySelector(".hero-qualification").textContent'),index===2?/已满足/:/未满足/);
    assert.ok(await evaluate(`(()=>{const r=document.querySelector('.hero-qualification').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()`),'Condition entry stays fully inside the window');
    if(index===0) {
      const {data}=await cmd('Page.captureScreenshot',{format:'png'});
      await writeFile(directory+'/entry.png',Buffer.from(data,'base64'));
    }
    await evaluate('document.querySelector(".hero-qualification").click()');
    await until('!document.querySelector("#hero-qualification").classList.contains("outside-tab")');
    const text=await evaluate('document.querySelector("#hero-qualification").textContent');
    assert.ok(text.includes(expected),text);
    assert.match(text,/需要场上保有/);assert.match(text,/升级路线/);assert.match(text,/当前 5\/5/);
    const {data}=await cmd('Page.captureScreenshot',{format:'png'});
    await writeFile(directory+'/condition-'+index+'.png',Buffer.from(data,'base64'));
    if(index===0) {
      await evaluate('document.querySelector("#hero-qualification button").click()');
      assert.equal(await evaluate('document.querySelector("#qualification").value'),'P001');
      assert.equal(await evaluate('document.querySelector("#exchanges").classList.contains("outside-tab")'),false);
    }
    await key('Escape','Escape');
  }
  await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  await until('innerWidth === 390');
  assert.ok(await evaluate(`(()=>{const r=document.querySelector('.hero-qualification').getBoundingClientRect();return r.width>0&&r.height>0&&r.right<=innerWidth})()`),'Condition entry stays visible on narrow screens');
  await evaluate('document.querySelector(".hero-qualification").click()');
  const {data}=await cmd('Page.captureScreenshot',{format:'png'});
  await writeFile(directory+'/mobile.png',Buffer.from(data,'base64'));
  assert.deepEqual(errors,[]);
  console.log('PASS: missing provider, partial upgrade, qualified hero, R-card count, exchange navigation, mobile entry');
} finally {await browser.stop(ws);}
