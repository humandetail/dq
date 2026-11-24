#!/usr/bin/env python3
"""Validate the Abyss dragon's ability ranks, routing, and source timing."""
from contextlib import closing
import json
import math
import runpy
import sys

import audit_index as index

OUT = index.ROOT/'docs/rules/npc-abyss-dragon-abilities.json'
MODULES = {'N560':['main/f290/f17'],'N561':['main/f290/f14','main/f290/f15','main/f290/f16'],
           **{f'N{id}':[f'main/f{module}'] for id,module in [(562,206),(563,207),(564,208),
                                                          (565,209),(567,210),(568,211)]},
           'N566':['main/f291/f1:2466–2479','main/f224/f0']}
SUPPORT = ['ma99','mb99','mb01','T057','T111','T112','T113','Awan','B111','B112','B114','P100']
RULES = {
    'N560':{'activation':'new ma99 receives Acha immediately after old dragon death','targetTemplate':'mb99',
            'phase':'new same entity stage; hidden health bar, Avul','presentationT':2},
    'N561':{'templateAt7_5':'ma99','activeAt':9.5,'activeState':'restore resources and actual rank, drop Avul, register battle listener',
            'retainsNewEntityId':True,'inheritedFromDeadParentOnly':['x','y','facing','pathUserData']},
    'N562':{'autoStrictRankThreshold':3,'writtenRank':'min(20,rank-3)','radiusFromMapCenter':999999,
            'candidates':'owner P0-P3, alive, visible, no B111','perCandidatePoints':3,
            'perAxisRandomOffset':[-199,200],'delayedImpact':'1.9-.06*rank','telegraphSpeed':'.8+.05*(rank-1)','payload':'T111'},
    'N563':{'autoStrictRankThreshold':5,'writtenRank':'min(20,rank-5)','warning':'position on effect',
            'complete':'FINISH removes marker before T112 at then-current caster location','ENDCAST':'erase marker only'},
    'N564':{'autoStrictRankThreshold':15,'writtenRank':'min(20,rank-15)','producerStep':.1,'producerElapsedLimit':8,
            'firstThreshold':1,'nextThresholdDelta':-.2,'minimumThreshold':.1,'binary64Accumulation':True,
            'perAxisRandomOffset':[-1199,1200],'impactQueue':'1.9-.06*currentSpellRank delay, original FIFO in active sequence',
            'resetAt':10,'payload':'T111'},
    'N565':{'autoStrictRankThreshold':10,'writtenRank':'min(20,rank-10)','initialNumber':'10+actual N564 rank',
            'spawnInterval':.1,'child':'P11 mb01 with Awan','childTimedLife':20,'childMaxAndCurrentHP':'live parent MAX HP*.1 on birth',
            'registration':{'pool':-1,'points':1,'once':True},'aimToParentIfDistanceAbove':900,'recenterPoll':1,
            'idleWander':{'decision':'Q24 via provisional published Awan implementation','delaySeconds':[8,10],'radialDistance':[64,256],'combatFleeAdded':False},
            'recallAt':16,'recallSpeed':700,'deleteAt':17,'onCleanupBossHeal':0,
            'persistentReduction':'for actual ma99, repeatedly subtract .01 from multiplier=1 for each live child in current global list; clamp >=0'},
    'N566':{'writtenRank':'max(1,min(20,rank))','radius':2000,'curse':'B112 12 seconds',
            'damageReduction':.5,'damageSource':'actual S with B112','damageTarget':'actual ma99'},
    'N567':{'writtenRank':'max(1,min(20,rank))','candidates':'within 2000, live native HERO, outside P11',
            'candidateSelection':'once random, lock point','delayToMeteorFx':'1-.05*rank','delayFromFxToStomp':.8,'payload':'T113'},
    'N568':{'minimumActiveLayer':0,'rankChangeOnlyWhenLayerAbove':20,'initialCounter':'50+2*actualRank',
            'scriptLifetime':25,'nativeDisplayLifetime':12,'trigger':'all events entering original B03 point; ask berserk if absent',
            'consume':'decrement first; at >=0 cancel current damage; below 0 clear marker then leave damage',
            'nativeAttackSpeedAdd':0,'nativeMoveSpeedAdd':0,'nativeIncomingDamageAdd':0},
}
COOLDOWN = {
    'N562':[25-.5*n for n in range(20)],
    'N563':[30-.5*n for n in range(19)]+[20],
    'N564':[42]+[41-.5*n for n in range(18)]+[30],
    'N565':[47.5-.5*n for n in range(15)]+[40.5,40,39.5,38.5,35],
    'N566':[25-.5*n for n in range(19)]+[15],
    'N567':[20-.5*n for n in range(17)]+[11,10.5,10],
    'N568':[30]*20,
}
DETAILS = {
    'N560':['Separate death/create transaction followed by same-entity appearance transition.'],
    'N561':['Native null effective rank keeps an innate level one on rank0, rather than disabling a shipped ability.'],
    'N565':['Source clears the child with RemoveUnit before querying life for a hypothetical maximum-health 1% parent heal; invalid handle reads zero.'],
    'N566':['B112 specifies damage to the Abyss Dragon only. Source halves current damage from actual S regardless of receiver. Web confines it to ma99.'],
    'N568':['The condition rank>20 precedes only the setter; damage route checks actual ability level, with no rank gate.',
            'Stock Berserk tooltip fields are absent from actual object. B114 actual hint describes a count of ignored hits.'],
}


class ModuleLocals:
    """Share captured Lua locals across the reused runner's sibling closures."""

    def __init__(self, bindings, register_file, parent):
        self.bindings = bindings
        self.register_file = register_file
        self.parent = parent

    def __getitem__(self, key):
        register, local = self.bindings[key]
        return self.register_file.get(register) if local else self.parent[register]

    def __setitem__(self, key, value):
        register, local = self.bindings[key]
        values = self.register_file if local else self.parent
        values[register] = value


def probes(db):
    inherit = runpy.run_path(str(index.ROOT/'tools/audit-npc-abyss-abilities.py'))['probe_world']
    vm, world, env, host, hero, other, orders, effects = inherit(db, [])
    changed, status, damage, births, removed, animation = [], [], [], [], [], []
    native={'EXSetEffectSpeed':lambda effect,v:changed.append(v),
            'EXSetEventDamage':lambda v:damage.append(v),'GetEventDamage':lambda _:100}
    for mod in range(206,212):
        parent = [env]
        module = f'main/f{mod}'
        _, registers = vm['execute'](vm['function'](module),parent,(lambda _:native,),capture=True)
        for value in (*registers.values(), *env.values()):
            if isinstance(value, vm['Closure']) and value.name.startswith(module+'/'):
                value.ups = ModuleLocals(vm['function'](value.name)['upvalueBindings'],registers,parent)

    def delay(callback, time):
        timer=world.new_timer()
        world.start_timer(timer, round(time, 6), False, callback)

    def temp(owner, loc, _, ability, rank, life, id='q001'):
        unit={'owner':owner,'id':ability,'type':id,'life':100,'maxLife':100,'skills':{ability:rank},**loc}
        if id=='mb01':
            births.append((float(world.now),unit))
        return unit

    env.update(Abyss_BOSS=host, GetOwningPlayer=lambda u:u['owner'],
               Abyss_Cur_Rank_Lv=0, SetUnitAbilityLevel=lambda u,id,rank:changed.append((id,rank)),
               delayTimeRunFunc=delay, SetUnitAnimationByIndex=lambda u,k:animation.append((float(world.now),k)),
               UnitIsPlayer=lambda u:0<=u['owner']<=3, IsUnitHidden=lambda u:u.get('hidden',False),
               RemoveLocation=lambda p:None, Location=lambda x,y:{'x':x,'y':y},
               GetArrRealLen=len, DestroyEffect=lambda e:status.append(('destroy',e)),
               CreateEffAtLoc=lambda id,*args:{'id':id,'time':float(world.now)},
               CreateTempAndSetAbilityLv=temp, RemoveUnit=lambda u:removed.append(u) or u.update(life=0),
               CreateDamageTrig=lambda u,p:status.append(('register',p)), GetDistance=lambda a,b:math.dist((a['x'],a['y']),(b['x'],b['y'])),
               SetUnitMoveSpeed=lambda u,v:u.update(speed=v),
               SetUnitState=lambda u,k,v:u.__setitem__(k,v))
    pre = vm['function']('main/f290/f13')
    levels = {}
    for rank in (0,3,4,5,6,10,11,15,16,20,21,45):
        env['Abyss_Cur_Rank_Lv']=rank
        changed.clear()
        vm['execute'](pre,[env,lambda n:min(n,20)])
        exp = [(id,min(20,rank-off)) for id,off in [('N566',0),('N567',0),('N562',3),
                ('N563',5),('N565',10),('N564',15),('N568',20)] if off==0 or rank>off]
        assert changed==exp
        levels[rank] = dict(changed)

    activation = []
    env['UnitAddAbility']=lambda u,k:activation.append((float(world.now),k))
    delay(vm['Closure']('main/f290/f16',[env,vm['Closure']('main/f290/f15',[env,lambda:activation.append((float(world.now),'active'))])]),2)
    world.advance(9.5)
    assert activation==[(7.5,'N561'),(9.5,'active')] and animation==[(2.0,4)]

    host['skills'].update(N562=1,N567=20,N564=3,N568=1)
    hero.update(x=400,y=100)
    world.advance(10)
    env['N562_Action'](host)
    hero.update(x=500,y=100)
    world.advance(11.84)
    assert [(p[0],p[1],p[3]) for p in orders[-3:]]==[(11.84,'T111',(600,300))]*3
    before = len(orders)
    env['N563_Action'](host)
    env['N563_Action_end'](host)
    env['N563_Action_over'](host)
    assert len(orders)==before
    env['N563_Action'](host)
    host['x']=50
    env['N563_Action_over'](host)
    env['N563_Action_end'](host)
    assert orders[-1][1:]==('T112','stomp',(50,0))
    env['N567_Action'](host)
    hero['x']=600
    world.advance(12.64)
    assert orders[-1][1:]==('T113','stomp',(500,100))

    world.advance(13)
    env['N564_Action'](host)
    world.advance(23)
    impacts = [[round(t-13,6),xy] for t,id,_,xy in orders if id=='T111' and t>=13]
    assert impacts and all(tuple(p)==(1250,1200) for _,p in impacts)
    assert impacts[0][0]==2.82 and impacts[-1][0]<10

    env['N565_Action'](host)
    world.advance(23.1)
    assert len(births)==1
    host['maxLife'] = 2000
    world.advance(24.3)
    assert len(births)==13
    assert births[0][1]['maxLife']==100 and all(u['maxLife']==200 for _,u in births[1:])
    births[0][1]['life']=0
    host['type']='ma99'
    vm['execute'](vm['function']('main/f290/f2'),[env,native,{}],(hero,host),start_pc=92,stop_pc=125)
    reduced = damage[-1]
    assert math.isclose(reduced,88)
    recall_hp = host['life']
    world.advance(39)
    assert all(u['speed']==700 for _,u in births) and not removed
    world.advance(40)
    assert len(removed)==13 and host['life']==recall_hp and env.get('N565_Temps') is None

    hero['skills']['B112']=1
    for receiver in (host,other):
        vm['execute'](vm['function']('main/f291/f1'),[env,native],(hero,receiver),start_pc=2466,stop_pc=2479)
    assert damage[-2:]==[50,50]
    env['N568_Action2'](host)
    assert orders[-1][2]=='berserk'
    env['N568_Action1'](host)
    checkpoint = len(damage)
    for _ in range(53):
        env['N568_Action2'](host)
    assert damage[checkpoint:]==[0]*52 and not env['N568_Unit']

    return {'rankSetterRaw':levels,'respawnVisualWrites':activation,
            'N562':{'points':3,'executionT':1.84,'snapshot':[600,300]},
            'N563':{'interruptedCreatesNoPayload':True,'completedReadsThenCurrentPoint':[50,0]},
            'N564':{'first':impacts[0][0],'last':impacts[-1][0],'count':len(impacts)},
            'N565':{'rank3N564ChildCount':13,'rawRegisteredOrder':sum(s==('register',-1) for s in status),
                    'firstTwoMaxHP':[100,200],'12LiveReduced100To':round(reduced,6),
                    'recallSpeed700At':16,'removedAt':17,'removedThenHeal':0},
            'N566':{'rawSameAmountAgainstDragonAndOther':[50,50],'webTargets':[50,100]},
            'N567':{'rank20Elapsed':.8,'pointAfterCandidateMoves':[500,100]},
            'N568':{'rank1Allows52Zeroes':True,'nextPacketNoCancellation':True}}


def main():
    with closing(index.connect()) as db:
        _, hash_input = json.loads(db.execute('SELECT fingerprint FROM metadata').fetchone()[0])
        profile=(index.MAP/'units_campaignabilitystrings.txt').read_text().splitlines()
        host,=index.objects(db,'ma99','units_unitabilities')
        assert all(id in host['fields']['abilList'].split(',') for id in COOLDOWN)
        records=[]
        for id,rule in RULES.items():
            obj,=index.objects(db,id,'units_abilitydata')
            editions=[o for o in index.objects(db,id,aliases=True) if o['sourcePath'].endswith('/war3map.w3a.json')]
            obj_fields=obj['fields']
            if id in COOLDOWN:
                cooldowns={i:obj_fields[f'Cool{i}'] for i in range(1,5)}
                for edition in editions:
                    cooldowns.update({e['level']:e['value'] for e in edition['fields']['mods'] if e['key']=='acdn'})
                if id=='N568':
                    cooldowns.update({i:30 for i in range(5,21)})
                assert list(cooldowns.values()) == COOLDOWN[id]
                rule={**rule,'mana':500,'castPt':.47,'backSwing':.1,'cooldownByRank':COOLDOWN[id]}
            if id=='N563':
                tail={e['level']:e['value'] for e in editions[0]['fields']['mods'] if e['key']=='Ncl1'}
                follow=[round(obj_fields.get(f'DataA{i}',tail.get(i)),4) for i in range(1,21)]
                assert follow==[round(3.4-.1*n,4) for n in range(20)]
                rule['followByRank']=follow
            refs=[[r['function'],r['pc'],r['sourceLine']] for r in index.references(db,id) if r['pc'] is not None]
            records.append({'id':id,'status':'ready','rules':rule,'sourceRefs':{'object':obj,'overrides':editions,'router':refs,
                            'modules':MODULES[id],'profileHeaderLine':profile.index(f'[{id}]')+1},
                            'differences':DETAILS.get(id,[]),'unresolved':[],'validation':'source fields, dispatch, and source VM probes'})
        extra={id:[{k:v for k,v in row.items() if k!='fields'} for row in index.objects(db,id)] for id in SUPPORT}
        assert all(extra.values())
        for id,radius in [('T111',100),('T112',1200),('T113',400)]:
            o,=index.objects(db,id,'units_abilitydata')
            assert (o['fields']['Area1'],o['fields']['HeroDur1'],o['fields']['Dur1'],o['fields']['BuffID1'])==(radius,10,12,'B111')
            assert 'DataA1' not in o['fields']
        native=probes(db)
    result={'records':records,'sourceHash':dict(hash_input)[index.DISASM],'auxiliarySources':extra,
            'totals':{'npcScope':9,'ready':9,'pending':0,'workbookCountIncrement':0},
            'validation':{'rawVM':native,'originalClient':'untested'}}
    serialized=json.dumps(result,indent=2,ensure_ascii=False)+'\n'
    if '--write' in sys.argv:
        OUT.write_text(serialized)
    else:
        assert OUT.read_text()==serialized
    print('9 Abyss dragon NPC abilities, source and timing probes passed')


if __name__=='__main__':
    main()
