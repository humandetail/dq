#!/usr/bin/env python3
"""Check Abyss NPC abilities against the existing indexed bytecode runner."""
from contextlib import closing
import json

import runpy
import sys

import audit_index as index

OUT = index.ROOT / 'docs/rules/npc-abyss-abilities.json'
HOSTS = {'ma02':['N537','N538','N539'], 'ma03':['N550','N551','N552'],
         'ma04':['N540','N542','N559'], 'ma05':['N543'], 'ma06':['N554','N557','N558']}
MODULES = {'N538':191,'N539':192,'N540':193,'N543':195,'N550':198,'N551':199,
           'N552':200,'N554':201,'N557':203,'N558':204,'N559':205}
AUX = ['T069','T070','T071','T072','T073','T074','Arav','BIil','b115']
RULES = {
    'N537':{'command':'mirrorimage','selfDispel':'removable magic status','replaceOldImages':True,'copies':3,'duration':20,
            'damageDealtFactor':0,'damageTakenFactor':2,'birth':'actual BIil, no generic P11 registration'},
    'N538':{'command':'harvest','healthBelow':.5,'activeDuration':15,'interval':1.2,'initialPulse':True,
            'maxPulses':13,'scanRadius':2500,'proxy':'q001:T070','proxyLife':1,'sleepRange':3000,
            'sleepDuration':1.5,'initialStunSegment':.1,'wakeOnLegalAttackAfterInitialSegment':True},
    'N539':{'command':'ensnare','randomCandidate':'live non-P11 native HERO within 5000','missileSpeed':1500,
            'moveLockDuration':6,'airLowerDuration':.6,'airHeight':200,'meleeReachField':128,'breakChannelOnHit':True},
    'N550':{'command':'harvest','healthBelow':.8,'followThrough':3,'trigger':'normal FINISH','selfHealMaximumFraction':.25},
    'N551':{'command':'charm','nativeProxy':'T071/B063','proxyLife':1,'armor':5,'scriptMarkerLife':18,
            'acceptsEventType':'magic','healFactor':5,'sourceDamageSet':0,'sameMarkerReplaces':True,
            'independentOfNativeBuff':True,'autoRandomWhenBothReadyAndNeitherPresent':'uniform(1..100)>50'},
    'N552':{'command':'ambush','nativeProxy':'T072/B064','proxyLife':1,'armor':5,'scriptMarkerLife':18,
            'acceptsEventType':'physical','healFactor':5,'sourceDamageSet':0,'sameMarkerReplaces':True,
            'independentOfNativeBuff':True,'autoRandomWhenBothReadyAndNeitherPresent':'uniform(1..100)<=50'},
    'N540':{'command':'harvest','randomCandidate':'live non-P11 native HERO without T069 within 2000','interval':.01,
            'airInitialStep':30,'changeToDownwardAboveDefault':750,'upDecay':.7,'downAcceleration':.8,'verticalStepRange':[2,150],
            'horizontalStep':'20*delta/max(abs(dx),abs(dy)); zero vector stays zero','xyLimit':[[ -5000,5000],[-4700,4700]],
            'pause':'global raw PauseUnit bool; separate timed control remains','directDamage':0},
    'N542':{'command':'bloodlust','healthBelow':.6,'buff':'B059','duration':20,'moveSpeedFactor':1.8,'attackSpeedIncrease':0,'artScaleField':2.0},
    'N559':{'command':'blizzard','target':'actual attacker owner position','nativeBlizzardPayloadCount':0,'proxy':'q001:T074',
            'area':800,'interval':.25,'areaDuration':2,'stunSeconds':5,'nativeMissingDamage':0,'visualMissileCount':60,
            'visualMissileSpeed':400,'intervalAdapter':'fixed impact point; .25 through 2 inclusive; refresh control'},
    'N543':{'command':'charm','followThrough':1,'trigger':'normal FINISH','destination':'uniform path index 0..23 center',
            'position':'SetUnitPositionLoc, same actual entity and path registration'},
    'N554':{'command':'cannibalize','randomCandidate':'live non-P11 native HERO within 2000',
            'point':'target at effect time','warningThenVisualAt':1.5,'proxy':'P11 q001/T073','proxyBornAt':2,
            'radius':700,'normalStun':7,'nativeShortenedStun':5,'nativeMissingDamage':0},
    'N557':{'command':'banish','duration':8,'slow':.4,'buff':'BHbn','normalAttackDisabled':True,
            'eventSelection':'physical damage, roll 51..100 with O uses O, otherwise self',
            'auxTarget':'b115 qualifying guard route','damageVector':[0,0,0,1.3,0,1.3,1]},
    'N558':{'command':'harvest','healthBelow':2,'scanRadius':999999,'candidateType':'b115','targetNativeRelation':'friend',
            'activeDuration':8,'interval':.1,'naturalPulses':79,'perPulse':'clamp(self.hp+.002*self.liveMaxHP)',
            'targetResourceChange':0,'state':'independent accepted link with actual caster/unit, both must remain alive'},
}
DIFF = {
    'N537':['Map template text claims one image and 60s; object 3 and 20s. Missing image damage and animation delay select 0; incoming factor 2.'],
    'N538':['Host ANcl is only a wrapper; T070 supplies actual non-template duration and initial segment.'],
    'N539':['Default text 10s; actual ordinary and hero durations are both 6s.'],
    'N540':['Source co-located direction is 0/0; finite coordinates use zero horizontal motion while retaining original vertical path.'],
    'N542':['Default text offers attack speed and 60s; DataA absent, DataB .8, actual duration20.'],
    'N559':['Default Blizzard description is unbound; no raw damage fields on actual control proxy. Interval uses object footprint with deterministic Q24 refresh.'],
    'N557':['Stock 50%/12s differ from actual .4/8, default 66% magic vulnerability replaced by effective map vector.'],
}


def probe_world(db, modules):
    create = runpy.run_path(str(index.ROOT/'tools/audit-passive-growth-batch.py'))['probe_context']
    vm, world, env, host, ally, _, _ = create(db, [f'main/f{m}' for m in modules])
    host.update(owner=11,x=0,y=0,life=300,maxLife=1000,type='boss')
    ally.update(owner=0,hero=True,x=500,y=0,life=10000,type='hero')
    other = world.units[2]
    other.update(owner=11,x=300,y=400,type='b115',life=1000)
    orders, effects = [], []
    env['math']['abs'] = abs
    env.update(GetTriggerUnit=lambda:host, GetUnitLoc=lambda u:{'x':u['x'],'y':u['y']},
               GetUnitTypeId=lambda u:u['type'], GetRandomInt=lambda a,b:b, UNIT_TYPE_HERO='hero',
               IsUnitType=lambda u,t:u.get(t,False), Play_Sound=lambda *a:None,
               CreateEffByUnit=lambda *a:effects.append((float(world.now),a[0])),
               CreateEffAtLoc=lambda *a:effects.append((float(world.now),a[0])),
               CreateTempAndSetAbilityLv=lambda owner,p,_,id,r,life:{'owner':owner,'id':id,**p},
               IssueTargetOrder=lambda s,order,t:orders.append((float(world.now),s.get('id','host'),order,t['type'])) or True,
               IssueImmediateOrder=lambda s,order:orders.append((float(world.now),s.get('id','host'),order,(s['x'],s['y']))) or True,
               SetUnitPositionLoc=lambda u,p:u.update(p),
               IssuePointOrderLoc=lambda s,order,p:orders.append((float(world.now),s.get('id','host'),order,(p['x'],p['y']))) or True)
    return vm, world, env, host, ally, other, orders, effects


def native_source_probes(db):
    vm, world, env, host, ally, other, orders, effects = probe_world(db,[191,192,195,198,199,200,203,205])
    env['N538_Action']()
    env['N538_Action']()
    world.advance(15)
    assert len(orders)==13 and orders[0][1:]==('T070','sleep','hero') and float(orders[-1][0])==14.4
    env['N539_Action'](None)
    assert orders[-1][1:]==('host','ensnare','hero')
    env['pos_arr_monster_path'] = dict(enumerate({'x':i*2,'y':i} for i in range(24)))
    env['GetRectCenter'] = lambda rect:rect
    env['N543_Skill'](host)
    assert (host['x'],host['y'])==(46,23)
    host['life'] = 900
    env['N550_Action_end'](host)
    assert host['life']==1000
    env['N551_Action'](host)
    env['N552_Action'](host)
    world.advance(16)
    env['N551_Action'](host)
    assert [p[1] for p in orders[-3:]]==['T071','T072','T071']
    for amount,kind,expiry in [(50,'magic',16),(50,'physical',16),(120,'divine',16),(50,'physical',33),(35,'magic',33)]:
        world.advance(expiry)
        host['life'] = 500
        mock = {'GetEventDamage':lambda _:amount,
                'EXGetEventDamageData':lambda _:kind,
                'EXSetEventDamage':lambda v: orders.append(('damage',v))}
        env.update(isMagicDamage=lambda k:k=='magic',isPhyDamage=lambda k:k=='physical')
        vm['execute'](vm['function']('main/f291/f1'),[env,mock],(None,host),
                      start_pc=3186,stop_pc=3242)
        should_convert = (expiry==16 and kind in ('magic','physical')) or (expiry==33 and kind=='magic')
        assert (host['life'],orders[-1][0])==(500+5*amount,'damage') if should_convert else host['life']==500
    world.advance(34)
    assert not env['N551_Unit'] and not env['N552_Unit']
    env['N557_Damage'](host,ally)
    env['N557_Damage'](host,None)
    assert [p[3] for p in orders[-2:]]==['hero','boss']
    env['N559_Action'](host,{'x':125,'y':250})
    assert orders[-1][1:]==('T074','clusterrockets',(125,250))
    return {'N538':{'pulses':13,'lastPulse':14.4},'N543':{'draw24Center':[46,23]},
            'N550':{'hp900Max1000FinishesAt':1000},'N551_N552':{'originalRefreshKeepsMagicUntil34':True,
                'physicalExpiredAt33':True,'healFactorAtOriginalPipeline':5,'divineUnaffected':True}}


def trajectory_probe(db):
    _, world, env, host, ally, _, orders, effects = probe_world(db,[193,201])
    pauses = []
    ally.update(x=100,y=50,height=0)
    env.update(GetUnitFlyHeight=lambda u:u.get('height',0), GetUnitDefaultFlyHeight=lambda _u:0,
               SetUnitFlyHeight=lambda u,h,_r:u.__setitem__('height',h), SetUnitX=lambda u,x:u.__setitem__('x',x),
               SetUnitY=lambda u,y:u.__setitem__('y',y), PauseUnit=lambda u,p:pauses.append((float(world.now),p)))
    env['N540_Damage'](host)
    assert orders[-1][2:]==('harvest','hero')
    env['N540_Action'](ally)
    env['N540_Action'](ally)
    world.advance(.01)
    assert (ally['x'],ally['y'],ally['height'])==(120,60,30)
    world.advance(3)
    assert len(pauses)==2 and pauses[0]==(0,True) and pauses[1][1] is False and ally['height']==0
    ticks = round(pauses[1][0]/.01)
    assert (ally['x'],ally['y'])==(100+ticks*20,50+ticks*10)
    env['N554_Action'](host,ally)
    ally.update(x=-250,y=-250)
    host['life']=0
    world.advance(4.5)
    assert effects[-1][0]==4.5 and not any(p[1]=='T073' for p in orders)
    world.advance(5)
    assert orders[-1][1:]==('T073','stomp',(100+ticks*20,50+ticks*10))
    return {'N540':{'firstFrame':[120,60,30],'landTime':pauses[-1][0],'ticks':ticks,'landPosition':list(orders[-1][3])},
            'N554':{'visualT':1.5,'stompT':2,'usesSavedLocationAfterTargetMovesAndSourceDies':True}}


def link_probe(db):
    _,world,env,host,_,guard,orders,_ = probe_world(db,[204])
    closes, movements = [], []
    env.update(AddLightningEx=lambda *a:{'line':a[0]},
               MoveLightningEx=lambda *a:movements.append(float(world.now)),
               DestroyLightning=lambda fx:closes.append((float(world.now),fx['line'])))
    env['N558_Damage'](host)
    assert orders[-1][2:]==('harvest','b115')
    env['N558_Action'](host,guard)
    world.advance(8)
    assert len(movements)==79 and closes==[(8.0,'DRAL')]
    assert host['life']==458 and guard['life']==1000
    env['N558_Action'](host,guard)
    world.advance(8.2)
    guard['life']=0
    world.advance(8.3)
    assert host['life']==462 and closes[-1]==(8.3,'DRAL')
    return {'naturalTicks':79,'firstTick':.1,'lastTick':7.9,'healAt1000Max':158,
            'guardDamage':0,'guardDeathAbortsOnNextTick':8.3}


def refs_for(db, id):
    return [[r['function'],r['pc'],r['sourceLine']] for r in index.references(db,id) if r['pc'] is not None]


def main():
    with closing(index.connect()) as db:
        _, hashes = json.loads(db.execute('SELECT fingerprint FROM metadata').fetchone()[0])
        hints = (index.MAP/'units_campaignabilitystrings.txt').read_text().splitlines()
        records = []
        for host,ids in HOSTS.items():
            unit, = index.objects(db,host,'units_unitabilities')
            weapon, = index.objects(db,host,'units_unitweapons')
            assert all(id in unit['fields']['abilList'].split(',') for id in ids)
            assert weapon['fields']['castpt']==.47 and weapon['fields']['castbsw']==.1
            for id in ids:
                obj, = index.objects(db,id,'units_abilitydata')
                assert refs_for(db,id) and not any('war3map.w3a' in row['sourcePath'] for row in index.objects(db,id,aliases=True))
                functions = []
                if id in MODULES:
                    module = f'main/f{MODULES[id]}'
                    functions = [list(row) for row in db.execute('SELECT name,start_line,end_line FROM function WHERE name=? OR name LIKE ? ORDER BY start_line',(module,module+'/%'))]
                records.append({'id':id,'host':host,'status':'ready','rules':RULES[id],
                                'sourceRefs':{'nativeFields':obj,'hostAbilityIndex':unit['jsonIndex'],'hostWeaponIndex':weapon['jsonIndex'],
                                              'hintLine':hints.index(f'[{id}]')+1,'functions':functions,'router':refs_for(db,id)},
                                'differences':DIFF.get(id,[]),'unresolved':[],'validation':'source fields, routes, and applicable grouped probes'})
        aux = {id:[r for r in index.objects(db,id) if r['sourcePath'].endswith(('/units_abilitydata.json','/units_unitabilities.json','/units_abilitybuffdata.json'))] for id in AUX}
        assert len(records)==len(RULES)==13 and all(aux.values())
        assert 'DataA1' not in aux['T074'][0]['fields']
        assert aux['T074'][0]['fields']['DataB1']==.25 and aux['T074'][0]['fields']['DataF1']==2
        assert 'Bena,Beng'==next(r for r in records if r['id']=='N539')['sourceRefs']['nativeFields']['fields']['BuffID1']
        raw = {**native_source_probes(db),**trajectory_probe(db),'N558':link_probe(db)}
    assert not any(r['unresolved'] for r in records)
    result = {'totals':{'npcScope':13,'ready':13,'pending':0,'workbookCountIncrement':0},
              'sharedRefs':['damage-pipeline.md','challenge-spawns.md','native-armor-and-xp.md','skill-stone-gaze.md'],
              'records':records,'auxiliary':aux,'disasmSha256':dict(hashes)[index.DISASM],
              'validation':{'rawVM':raw,'originalClient':'untested'}}
    data = json.dumps(result,indent=2,ensure_ascii=False)+'\n'
    if '--write' in sys.argv:
        OUT.write_text(data)
    else:
        assert OUT.read_text()==data
    print('13 NPC abilities, 5 hosts; source, original VM, and timing checks passed')


if __name__ == '__main__':
    main()
