import assert from 'node:assert/strict';
import {test} from 'node:test';
import {newMatch,enqueue,drain} from '../src/game/m2/match.ts';
import {newHero} from '../src/game/m2/hero.ts';
const submit=(state,id,action)=>{enqueue(state,{id,matchId:state.matchId,action});state.clock.targetUs+=1;while(drain(state,10000)==='pending'){}return state.commandResults[id];};
test('command auto modes survive snapshot and default on in a new match',()=>{
 const state=newMatch('command',42);state.structures=[{id:900,templateId:'H021',x:0,y:0,radius:72,population:20,qualification:null,pending:null,hero:newHero('H021')}];
 assert.equal(submit(state,'off',{type:'set-auto-mode',towerId:900,key:'A068',enabled:false}).ok,true);
 const restored=structuredClone(state);assert.equal(restored.structures[0].autoModes.A068,false);
 assert.equal(submit(restored,'on',{type:'set-auto-mode',towerId:900,key:'A068',enabled:true}).ok,true);
 assert.equal(submit(restored,'bad',{type:'set-auto-mode',towerId:900,key:'unknown',enabled:false}).ok,false);
 assert.equal(newMatch('fresh',42).structures.length,0);
});
test('worker move uses approach path and stop cancels it',()=>{
 const state=newMatch('worker-command',42);const start={...state.worker};
 enqueue(state,{id:'move',matchId:state.matchId,action:{type:'move-worker',point:{x:start.x+200,y:start.y}}});state.clock.targetUs=100000;while(drain(state,10000)==='pending'){}
 assert.ok(state.worker.x>start.x);assert.ok(state.approach);
 assert.equal(submit(state,'stop',{type:'stop-worker'}).ok,true);assert.equal(state.approach,null);
 assert.equal(state.commandResults.move.ok,false);
});
test('fixed tower focus accepts only reachable enemies and releases invalid targets',()=>{
 const state=newMatch('focus-command',42);
 const tower={id:900,templateId:'n001',x:0,y:0,radius:72,population:2,qualification:null,pending:null};
 state.structures=[tower];state.enemies=[{id:901,unitId:'m001',x:100,y:0,hp:100000,maxHp:100000,mana:0,armor:0,points:1,layer:'ground',radius:16,speed:0,waypoint:0,previousWaypoint:null,initialOverlaps:[]}];
 assert.equal(submit(state,'focus',{type:'focus-target',towerId:900,targetId:901}).ok,true);
 assert.equal(tower.focusTarget,901);
 state.enemies[0].x=10000;
 assert.equal(submit(state,'distant',{type:'focus-target',towerId:900,targetId:901}).ok,false);
 assert.equal(submit(state,'release',{type:'focus-target',towerId:900}).ok,true);
 assert.equal(tower.focusTarget,undefined);
 assert.deepEqual({x:tower.x,y:tower.y},{x:0,y:0});
});
