import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {createChrome} from '/Users/laihanbin/.agents/skills/oil-ui/scripts/chrome.mjs';
const base = process.env.M2_ORIGIN ?? 'http://127.0.0.1:5173';
const directory = process.env.M2_EVIDENCE_DIR ?? '/tmp/td3-skill-tooltip-evidence';
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
    const {createM3SaveStore}=await import('/src/game/m2/save.ts');
    const state=newMatch('skill-tooltip-acceptance',42);state.clock.paused=true;
    const hero=newHero('H021');hero.level=18;hero.points=4;hero.ranks={A068:3,A069:2};
    state.structures=[{id:900,templateId:'H021',x:state.worker.x+150,y:state.worker.y,radius:72,population:20,qualification:null,pending:null,hero}];
    state.population=20;state.nextId=1000;
    const store=createM3SaveStore(()=>true,()=>true);
    await store.withWriter(writer=>writer.commit(undefined,{score:0,claims:[]},state,{source:'none'}));
  })()`);
  await cmd('Page.navigate',{url:base+'/m2.html'});
  await until('document.querySelector("#field")?.dataset.ready === "true" && document.querySelector(".hero-shortcuts")?.children.length === 2');
  await evaluate(`document.querySelector('.command-window>nav button:last-child').click();document.querySelector('.hero-shortcuts button:last-child').click()`);
  await until('document.querySelector("[data-skill=A067]")');
  async function hover(id) {
    const point=await evaluate(`(()=>{const r=document.querySelector('[data-skill=${id}]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await cmd('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
    await until('!document.querySelector("#skill-tooltip").hidden');
    return evaluate('document.querySelector("#skill-tooltip").textContent');
  }
  assert.equal(await evaluate('document.querySelector("[data-skill=A067]").disabled'),true);
  const passive=await hover('A067');
  assert.match(passive,/山崩/);assert.match(passive,/概率/);assert.match(passive,/150/);assert.match(passive,/快捷键 Q/);
  assert.equal(await evaluate('document.querySelector("[data-skill=A067]").hasAttribute("title")'),false);
  const active=await hover('A068');
  assert.match(active,/战棍/);assert.match(active,/50点力量/);assert.match(active,/快捷键 W/);
  // Let the game clock cross two whole seconds and verify the hovered button was rebuilt.
  await evaluate('window.originalSkillButton=document.querySelector("[data-skill=A068]");document.querySelector("#pause").click()');
  await until('!window.originalSkillButton.isConnected && !document.querySelector("#skill-tooltip").hidden');
  assert.match(await evaluate('document.querySelector("#skill-tooltip").textContent'),/战棍/);
  await evaluate('document.querySelector("#pause").click()');
  await cmd('Input.dispatchMouseEvent',{type:'mouseMoved',x:400,y:200});
  await until('document.querySelector("#skill-tooltip").hidden');
  assert.match(await hover('A069'),/被动/);
  await cmd('Input.dispatchMouseEvent',{type:'mouseMoved',x:400,y:200});
  await evaluate('document.querySelector("[data-skill=A068]").focus()');
  await until('!document.querySelector("#skill-tooltip").hidden');
  assert.match(await evaluate('document.querySelector("#skill-tooltip").textContent'),/战棍/);
  await key('r','KeyR');
  await until('document.querySelector("[data-skill=A067]").textContent.includes("山崩") && !document.querySelector("[data-skill=A067]").disabled');
  const learning=await hover('A067');assert.match(learning,/下一级需要英雄/);
  for (const [width,height] of [[1366,768],[390,844],[844,390]]) {
    await cmd('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await until(`innerWidth === ${width} && innerHeight === ${height}`);
    await hover('A067');
    assert.ok(await evaluate(`(()=>{const r=document.querySelector('#skill-tooltip').getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()`),'Tooltip stays inside viewport');
    const {data}=await cmd('Page.captureScreenshot',{format:'png'});
    await writeFile(directory+'/'+width+'x'+height+'.png',Buffer.from(data,'base64'));
  }
  await evaluate('document.querySelector(".command-tools button").click()');
  assert.equal(await evaluate('document.querySelector("#skill-tooltip").hidden'),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: disabled/passive/active/learning skills, real hover, keyboard focus, rebuild stability, viewport bounds, modal dismissal');
} finally {await browser.stop(ws);}
