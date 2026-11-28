import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {createChrome} from '/Users/laihanbin/.agents/skills/oil-ui/scripts/chrome.mjs';
const base = process.env.M2_ORIGIN ?? 'http://127.0.0.1:5173';
const directory = process.env.M2_EVIDENCE_DIR ?? '/tmp/td3-item-drop-evidence';
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
    const {createM3SaveStore}=await import('/src/game/m2/save.ts');
    const state=newMatch('item-drop-ui',42);state.clock.paused=true;
    state.inventory=[{id:901,itemId:'i109',slot:0,charges:0,point:{...state.worker}},{id:902,itemId:'i193',slot:1,charges:0,point:{...state.worker}}];state.nextId=1000;
    const store=createM3SaveStore(()=>true,()=>true);
    await store.withWriter(writer=>writer.commit(undefined,{score:0,claims:[]},state,{source:'none'}));
  })()`);
  await cmd('Page.navigate',{url:base+'/m2.html'});
  await until('document.querySelector("#field")?.dataset.ready === "true" && document.querySelector(".six-slots button:first-child")?.textContent.length > 1');
  await evaluate(`document.querySelector('.command-window>nav button:last-child').click();document.querySelector('.six-slots button:first-child').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2}))`);
  await until('!document.querySelector(".touch-actions").hidden');
  await evaluate(`(()=>{const f=document.querySelector('#field'),r=f.getBoundingClientRect();f.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:r.left+50,clientY:r.top+50}))})()`);
  await evaluate('document.querySelector("#pause").click()');
  for(let attempt=0;attempt<30 && !await evaluate(`!!document.querySelector('.ground-marker[data-ground-id="901"]')`);attempt++) await new Promise(resolve=>setTimeout(resolve,100));
  assert.ok(await evaluate(`!!document.querySelector('.ground-marker[data-ground-id="901"]')`),'Carried item must appear on the ground after clicking empty ground');
  assert.equal(await evaluate('document.querySelector(".six-slots button:first-child").disabled'),true);
  const {data}=await cmd('Page.captureScreenshot',{format:'png'});
  await writeFile(directory+'/dropped.png',Buffer.from(data,'base64'));
  await evaluate(`document.querySelector('.six-slots button:nth-child(2)').dispatchEvent(new PointerEvent('click',{bubbles:true,cancelable:true,pointerType:'touch'}))`);
  assert.ok(await evaluate(`Array.from(document.querySelectorAll('.touch-actions div button')).some(button=>button.textContent==='放到脚下')`));
  await evaluate(`Array.from(document.querySelectorAll('.touch-actions div button')).find(button=>button.textContent==='放到脚下').click()`);
  await until(`document.querySelector('.ground-marker[data-ground-id="902"]')`);
  const animation = await evaluate(`(async()=>{
    const {loadM2Model,loadM2ModelSource}=await import('/src/m2-models.ts');
    const {default:bindings}=await import('/src/assets/m2/bindings.json');
    const THREE=await import('/node_modules/.vite/deps/three.js');
    const id=bindings.H041.asset;
    const {model}=await loadM2ModelSource(id);
    const clip=model.Sequences.find(s=>s.Name.trim().toLowerCase()==='attack')??model.Sequences.find(s=>s.Name.toLowerCase().startsWith('attack'));
    const gl=document.createElement('canvas').getContext('webgl2');
    const render=await loadM2Model(id,gl);
    const camera=new THREE.PerspectiveCamera();camera.position.z=10;camera.updateMatrixWorld();
    const late=render(camera,0,0,0,clip.Interval[1]-clip.Interval[0]+100,'Attack');
    const restarted=render(camera,0,0,0,0,'Attack');
    return {late:late.frame,restarted:restarted.frame,start:clip.Interval[0],end:clip.Interval[1]};
  })()`);
  assert.equal(animation.late,animation.end,'One attack must not replay its model animation during backswing');
  assert.equal(animation.restarted,animation.start,'A real next attack restarts the animation');
  assert.deepEqual(errors,[]);
  console.log('PASS: ground drop, touch drop menu, ground markers, single attack animation and restart');
} finally {await browser.stop(ws);}
