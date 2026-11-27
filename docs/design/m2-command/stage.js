import * as THREE from 'three';
import { createM2Scene } from '../../../src/m2-scene.ts';
import { newMatch } from '../../../src/game/m2/match.ts';
import { newHero } from '../../../src/game/m2/hero.ts';

// A visual fixture only: reuse shipped terrain, textured models and animation.
// No game commands, rules, balances or live saves are modified by this prototype.
export async function createStage(units, events) {
  const canvas = document.querySelector('#field');
  const capturePointer = canvas.setPointerCapture.bind(canvas);
  canvas.setPointerCapture = id => { if(id !== 9001) capturePointer(id); };
  const overlays = document.querySelector('#unit-overlays');
  const damageLayer = document.querySelector('#damage-layer');
  const box = document.querySelector('#selection-box');
  const castRing = document.querySelector('#cast-ring');
  const state = newMatch('ui-design-fixture',811);
  state.worker.x=-650; state.worker.y=-200;
  state.structures = units.filter(unit=>unit.id!=='worker').map((unit,index)=>({
    id:100+index,templateId:unit.template,x:unit.x,y:unit.y,radius:32,population:20,qualification:null,
    hero:newHero(unit.template),lastAttackUs:0,lastAttackTarget:{x:unit.x,y:-448},
  }));
  state.structures.push(...[
    {id:110,templateId:'n001',x:-640,y:160},
    {id:111,templateId:'n006',x:288,y:160},
    {id:112,templateId:'n021',x:640,y:160},
  ].map(tower=>({...tower,radius:32,population:5,qualification:null,lastAttackUs:0,lastAttackTarget:{x:tower.x,y:448}})));
  const unitIds=new Map(units.filter(unit=>unit.id!=='worker').map((unit,index)=>[unit.id,100+index]));
  state.enemies=Array.from({length:28},(_,index)=>({
    id:200+index,unitId:index%4===0?'m002':'m001',x:-850+index%14*115,y:index<14?-448:448,
    radius:16,speed:100,layer:'ground',hp:500+index%5*120,maxHp:1200,mana:0,armor:0,
    points:1,abilities:[],waypoint:index<14?1:4,previous:-1,path:[],
  }));
  let pause=false,speed=1,selection=['tiny'],active='tiny',previous=performance.now(),elapsed=0,frame=0;
  let moveTo=null,marquee=null,suppressClick=false,lastDamage=0;
  const projection=new THREE.Matrix4(),inverse=new THREE.Matrix4();
  const vector=new THREE.Vector3(),near=new THREE.Vector3(),far=new THREE.Vector3();
  const markers=new Map();
  const floating=[];
  function pointFor(id) {
    if(id==='worker')return state.worker;
    return state.structures.find(tower=>tower.id===unitIds.get(id));
  }
  function project(point,height=0) {
    vector.set(point.x/100,height,point.y/100).applyMatrix4(projection);
    return {x:(vector.x+1)*canvas.clientWidth/2,y:(1-vector.y)*canvas.clientHeight/2,z:vector.z};
  }
  function pointAt(event) {
    const rect=canvas.getBoundingClientRect();
    const x=(event.clientX-rect.left)/rect.width*2-1,y=1-(event.clientY-rect.top)/rect.height*2;
    inverse.copy(projection).invert();
    near.set(x,y,-1).applyMatrix4(inverse);far.set(x,y,1).applyMatrix4(inverse);
    const t=-near.y/(far.y-near.y);
    return {x:(near.x+(far.x-near.x)*t)*100,y:(near.z+(far.z-near.z)*t)*100};
  }
  function marker(id,label,enemy=false) {
    const node=document.createElement('button');
    node.className=`unit-marker ${enemy?'enemy':''}`;
    node.setAttribute('aria-label',enemy?`敌人 ${id}`:`战场单位 ${label}`);
    node.innerHTML=`<span class="unit-bar"><i></i></span>${enemy?'':'<span class="unit-bar unit-mana"><i></i></span>'}<span class="unit-ring"></span><span class="unit-label">${label}</span>`;
    node.addEventListener('click',event=>{event.stopPropagation();if(enemy)events.point(state.enemies.find(unit=>unit.id===id),id,false);else events.select(id,event.shiftKey);});
    node.addEventListener('contextmenu',event=>{event.preventDefault();event.stopPropagation();events.point(enemy?state.enemies.find(unit=>unit.id===id):pointFor(id),enemy?id:null,true);});
    node.addEventListener('pointerdown',event=>{if(event.button===1){event.preventDefault();canvas.dispatchEvent(new PointerEvent('pointerdown',{...pointerData(event),button:event.shiftKey?1:2}));}});
    overlays.append(node);markers.set(id,node);
  }
  units.forEach(unit=>marker(unit.id,unit.name));
  state.enemies.forEach(enemy=>marker(enemy.id,enemy.unitId==='m001'?'兽人步兵':'主线怪物',true));
  function pointerData(event){return {bubbles:true,pointerId:event.pointerId,pointerType:'mouse',clientX:event.clientX,clientY:event.clientY,shiftKey:event.shiftKey,buttons:event.buttons,button:event.button};}
  canvas.addEventListener('pointerdown',event=>{
    if(event.isTrusted&&event.button===1){
      event.preventDefault();event.stopImmediatePropagation();
      canvas.dispatchEvent(new PointerEvent('pointerdown',{...pointerData(event),button:event.shiftKey?1:2}));
      return;
    }
    if(event.isTrusted&&event.button===2){event.preventDefault();event.stopImmediatePropagation();return;}
    if(event.button===0){const rect=canvas.getBoundingClientRect();marquee={x:event.clientX-rect.left,y:event.clientY-rect.top};}
  },true);
  canvas.addEventListener('pointermove',event=>{
    const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
    castRing.style.left=`${x}px`;castRing.style.top=`${y}px`;
    if(marquee&&event.buttons===1){
      const width=Math.abs(x-marquee.x),height=Math.abs(y-marquee.y);
      if(width>8||height>8){box.hidden=false;Object.assign(box.style,{left:`${Math.min(x,marquee.x)}px`,top:`${Math.min(y,marquee.y)}px`,width:`${width}px`,height:`${height}px`});}
    }
  });
  window.addEventListener('pointerup',event=>{
    if(marquee&&!box.hidden){
      const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
      const ids=units.filter(unit=>{const position=pointFor(unit.id);if(!position)return false;const p=project(position);return p.x>=Math.min(x,marquee.x)&&p.x<=Math.max(x,marquee.x)&&p.y>=Math.min(y,marquee.y)&&p.y<=Math.max(y,marquee.y);}).map(unit=>unit.id);
      events.multi(ids);suppressClick=true;box.hidden=true;
    }
    marquee=null;
    canvas.dispatchEvent(new PointerEvent('pointercancel',{pointerId:event.pointerId}));
  });
  canvas.addEventListener('click',event=>{if(suppressClick){suppressClick=false;return;}events.point(pointAt(event),null,false);});
  canvas.addEventListener('contextmenu',event=>{event.preventDefault();event.stopPropagation();events.point(pointAt(event),null,true);});
  const render=await createM2Scene(canvas,()=>{},()=>{},()=>{});
  render.zoomView(1.2);
  function damage(enemy,index) {
    const p=project(enemy,.8);
    if(p.x<100||p.x>canvas.clientWidth-50||p.y<50||p.y>canvas.clientHeight-40)return;
    const number=document.createElement('span');
    number.className=`damage-number ${index%5===0?'critical':index%3===0?'magic':''}`;
    number.textContent=index%5===0?'1,248!':String(168+index*17%400);
    const time=performance.now();
    for(let i=floating.length-1;i>=0;i--)if(time-floating[i].time>1050)floating.splice(i,1);
    const width=number.textContent.length*(index%5===0?18:14),height=index%5===0?34:27;
    let x=p.x+(index%3-1)*8,y=p.y;
    for(let lane=0;lane<12;lane++) {
      const collision=floating.find(entry=>Math.abs(entry.x-x)<(entry.width+width)/2+5 && Math.abs(entry.y-Math.min((time-entry.time)/1050,1)*65-y)<Math.max(height,entry.height)+5);
      if(!collision)break;
      y-=height+7;
    }
    y=Math.max(42,y);
    floating.push({x,y,width,height,time});
    number.style.left=`${x}px`;number.style.top=`${y}px`;
    damageLayer.append(number);
    setTimeout(()=>number.remove(),1300);
  }
  function animate(now) {
    requestAnimationFrame(animate);
    if(document.hidden){previous=now;return;}
    const delta=Math.min(.04,(now-previous)/1000);previous=now;
    if(!pause){
      elapsed+=delta*speed;state.queue.nowUs=Math.floor(elapsed*1e6);
      for(let index=0;index<state.enemies.length;index++){
        const enemy=state.enemies[index];
        const offset=(index%14*115+elapsed*28)%1700;
        enemy.x=index<14?-850+offset:850-offset;
        enemy.hp=500+(index*137+Math.floor(elapsed)*19)%650;
      }
      if(moveTo){const dx=moveTo.x-state.worker.x,dy=moveTo.y-state.worker.y,distance=Math.hypot(dx,dy);if(distance<4){moveTo=null;state.approach=null;}else{const amount=Math.min(distance,delta*speed*350);state.worker.x+=dx/distance*amount;state.worker.y+=dy/distance*amount;}}
      if(elapsed-lastDamage>.6){
        lastDamage=elapsed;
        state.structures.forEach(tower=>{tower.lastAttackUs=state.queue.nowUs;tower.lastAttackTarget=state.enemies[tower.id%state.enemies.length];});
        const chosen=state.enemies.filter((_,index)=>(index+Math.floor(elapsed))%5===0);
        chosen.forEach((enemy,index)=>damage(enemy,index+Math.floor(elapsed)));
        state.recentHits=chosen.map(enemy=>({atUs:state.queue.nowUs,x:enemy.x,y:enemy.y,targetId:enemy.id,casterId:100,sourceTemplate:'H021',amount:248}));
      }
    }
    render(state);
    canvas.style.cursor=castRing.hidden?'default':'crosshair';
    projection.fromArray(canvas.dataset.cameraProjection.split(',').map(Number));
    for(const [id,node] of markers){
      const point=typeof id==='number'?state.enemies.find(enemy=>enemy.id===id):pointFor(id);
      if(!point){node.hidden=true;continue;}
      const p=project(point,.05);
      node.hidden=p.x<-60||p.x>canvas.clientWidth+60||p.y<0||p.y>canvas.clientHeight+70||p.z>1;
      node.style.left=`${p.x}px`;node.style.top=`${p.y}px`;
      node.classList.toggle('selected',selection.includes(id));
      node.style.zIndex=id===active?'3':'1';
      if(point.hp)node.querySelector('.unit-bar i').style.width=`${point.hp/point.maxHp*100}%`;
    }
    frame++;
  }
  requestAnimationFrame(animate);
  return {
    setSelection(ids,id){selection=[...ids];active=id;},
    setPaused(value){pause=value;},setSpeed(value){speed=value;},
    reset(){render.resetView();render.zoomView(1.2);},
    focus(id){const point=pointFor(id);if(!point)return;render.resetView();render.zoomView(1.3);render(state);projection.fromArray(canvas.dataset.cameraProjection.split(',').map(Number));const p=project(point);const rect=canvas.getBoundingClientRect();const start={clientX:rect.left+p.x,clientY:rect.top+p.y,pointerId:9001,pointerType:'mouse'};canvas.dispatchEvent(new PointerEvent('pointerdown',{...start,button:2}));canvas.dispatchEvent(new PointerEvent('pointermove',{...start,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2,buttons:2}));canvas.dispatchEvent(new PointerEvent('pointerup',{...start,button:2}));},
    cast(id,point){const tower=state.structures.find(entry=>entry.id===unitIds.get(id));if(tower){tower.lastCastUs=state.queue.nowUs;tower.lastCastTarget=point||tower;}if(point)damage(point,5);},
    moveWorker(point){moveTo=point;state.approach={point,path:[point]};},
    stop(id){if(id==='worker'){moveTo=null;state.approach=null;}},
    attack(ids,enemyId){const enemy=state.enemies.find(unit=>unit.id===enemyId);if(!enemy)return;for(const id of ids){const tower=state.structures.find(entry=>entry.id===unitIds.get(id));if(tower){tower.lastAttackTarget=enemy;tower.lastAttackUs=state.queue.nowUs;}}damage(enemy,5);},
    remove(id){state.structures=state.structures.filter(tower=>tower.id!==unitIds.get(id));markers.get(id)?.remove();markers.delete(id);},
    build(point){state.structures.push({id:700+state.structures.length,templateId:'n001',...point,radius:32,population:5,qualification:null});},
  };
}
