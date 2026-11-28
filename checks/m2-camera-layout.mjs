import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {createChrome} from '/Users/laihanbin/.agents/skills/oil-ui/scripts/chrome.mjs';
const base = process.env.M2_ORIGIN ?? 'http://127.0.0.1:5173';
const directory = process.env.M2_EVIDENCE_DIR ?? '/tmp/td3-trackpad-evidence';
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
  await mkdir(directory, {recursive:true});
  await cmd('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  await cmd('Runtime.enable');
  await cmd('Page.navigate',{url:base+'/src/game/m2/save.ts'});
  await until('document.readyState === "complete" && location.pathname.endsWith("save.ts")');
  await evaluate(`(async()=>{
    const {newMatch}=await import('/src/game/m2/match.ts');
    const {createM3SaveStore}=await import('/src/game/m2/save.ts');
    const state=newMatch('trackpad-acceptance',42);state.clock.paused=true;
    const store=createM3SaveStore(()=>true,()=>true);
    await store.withWriter(writer=>writer.commit(undefined,{score:0,claims:[]},state,{source:'none'}));
  })()`);
  await cmd('Page.navigate',{url:base+'/m2.html'});
  await until('document.querySelector("#field")?.dataset.ready === "true" && !document.querySelector("#pause").disabled && document.querySelector("#pause").textContent === "继续"');
  await evaluate(`document.querySelector('.command-window>nav button:last-child').click()`);
  const screenshot = async name => {
    const {data}=await cmd('Page.captureScreenshot',{format:'png'});
    await writeFile(directory+'/'+name+'.png',Buffer.from(data,'base64'));
  };
  await screenshot(process.env.BASELINE ? 'before' : 'after');
  console.log(await evaluate(`(()=>{const r=document.querySelector('#field').getBoundingClientRect();return {width:r.width,height:r.height}})()`));
  if (process.env.BASELINE) process.exitCode=0;
  else {
    const fieldState = () => evaluate(`(()=>{const f=document.querySelector('#field'),r=f.getBoundingClientRect();return {focus:f.dataset.cameraFocus,zoom:f.dataset.cameraZoom,height:r.height,width:r.width}})()`);
    const initial = await fieldState();
    assert.ok(initial.height >= 440, 'Notebook battlefield should use most of the screen');
    const wheel = async (deltaX,deltaY,modifiers=0) => {
      await cmd('Input.dispatchMouseEvent',{type:'mouseWheel',x:600,y:250,deltaX,deltaY,modifiers});
    };
    await wheel(80,40);
    await until(`document.querySelector('#field').dataset.cameraFocus !== ${JSON.stringify(initial.focus)}`);
    assert.equal((await fieldState()).zoom, initial.zoom, 'Scrolling should pan without zooming');
    const beforePinch = await fieldState();
    await wheel(0,-20,2);
    await until(`document.querySelector('#field').dataset.cameraZoom !== ${JSON.stringify(beforePinch.zoom)}`);
    const beforeShift = await fieldState();
    await wheel(0,10,8);
    await until(`document.querySelector('#field').dataset.cameraZoom !== ${JSON.stringify(beforeShift.zoom)}`);
    const beforeArrow = await fieldState();
    await key('ArrowRight','ArrowRight');
    assert.notEqual((await fieldState()).focus,beforeArrow.focus);
    await key('Home','Home');
    assert.equal((await fieldState()).focus,initial.focus);
    assert.equal((await fieldState()).zoom,initial.zoom);
    await key('+','Equal');
    assert.ok(Number((await fieldState()).zoom)>Number(initial.zoom));
    await key('Home','Home');
    await evaluate(`document.querySelector('#toggle-dock').click()`);
    const collapsed = await fieldState();
    assert.ok(collapsed.height >= initial.height+140);
    assert.equal(await evaluate(`document.querySelector('#toggle-dock').getAttribute('aria-expanded')`),'false');
    await screenshot('collapsed');
    // Focused panel buttons must not prevent camera keyboard controls.
    await evaluate(`document.querySelector('#toggle-dock').focus()`);
    await key('ArrowLeft','ArrowLeft');
    assert.notEqual((await fieldState()).focus,initial.focus);
    await evaluate(`document.querySelector('#toggle-dock').click()`);
    await key('Home','Home');
    for (const [width,height] of [[1280,720],[900,700],[390,844],[844,390]]) {
      await cmd('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await until(`innerWidth === ${width} && innerHeight === ${height}`);
      const sizes=await fieldState();
      assert.ok(sizes.height >= 150, JSON.stringify({width,height,...sizes}));
      assert.ok(await evaluate(`document.documentElement.scrollWidth <= innerWidth`),'No horizontal page overflow');
      await screenshot('viewport-'+width+'x'+height);
    }
    await evaluate(`document.querySelector('.command-tools button').click()`);
    const modalView=await fieldState();
    await key('ArrowRight','ArrowRight');
    assert.equal((await fieldState()).focus,modalView.focus,'Camera must stay still in a dialog');
    await key('Escape','Escape');
    await evaluate('window.cameraCheckBeforeReload = true');
    await cmd('Page.reload');
    await until('!window.cameraCheckBeforeReload && document.querySelector("#field")?.dataset.ready === "true" && !document.querySelector("#pause").disabled && document.querySelector("#pause").textContent === "继续"');
    assert.equal(await evaluate(`document.querySelector('#pause').textContent`),'继续','Paused save restored');
    assert.deepEqual(errors,[]);
    console.log('PASS: scroll pan, pinch/Shift zoom, keyboard, collapse, notebook/mobile layout, dialog isolation and reload');
  }
} finally { await browser.stop(ws); }
