import assert from 'node:assert/strict';
import {newMatch,drain} from '../src/game/m2/match.ts';
import {newHero} from '../src/game/m2/hero.ts';
import {weapons,weaponScheduleRate,effectiveAttributes} from '../src/game/m2/combat.ts';
import {towerLevels} from '../src/game/m2/content.ts';
import {map} from '../src/game/m2/map.ts';
import {scheduleEvent} from '../src/game/event-queue.ts';
const results=[];
for(const [templateId,template] of towerLevels) {
  if(!templateId.startsWith('H') || !template.growth || !weapons[templateId]?.length) continue;
  const state=newMatch('attack-frequency-'+templateId,42);state.queue.pending=[];
  const hero=newHero(templateId), weapon=weapons[templateId][0];
  const tower={...map.worker,id:900,templateId,radius:72,pending:null,qualification:null,hero};
  state.structures=[tower];
  state.enemies=[{...map.worker,x:map.worker.x+Math.max(weapon.min+10,Math.min(100,weapon.max/2)),id:950,unitId:'m001',layer:'ground',hp:1e12,maxHp:1e12,mana:0,armor:0,points:1,speed:0,radius:2,initialOverlaps:[],abilities:[],wave:1}];
  const advance=time=>{state.clock.targetUs=time;while(drain(state,10000)==='pending') {}};
  scheduleEvent(state.queue,0,{type:'weapon-ready',towerId:900});advance(0);
  assert.ok(tower.attack?.timing,templateId+' should begin an attack');
  const rate=weaponScheduleRate(1+.002*effectiveAttributes(hero,[]).AGI);
  const period=Math.round(Math.max(weapon.cooldown,weapon.windup)*1e6/rate);
  assert.equal(tower.attack.timing.cooldown.dueUs,Math.round(weapon.cooldown*1e6/rate),templateId+' cooldown');
  advance(period+2);
  assert.ok(Math.abs(tower.attack.startedUs-period)<=2,templateId+' actual next attack: '+tower.attack.startedUs+' expected '+period);
  results.push({hero:template.name,intervalSeconds:period/1e6});
}
console.log(JSON.stringify(results,null,2));
console.log('PASS: '+results.length+' base heroes match the documented attack interval');
