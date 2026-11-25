#!/usr/bin/env python3
"""Check the ten mixed hero skill records with indexed source and event probes."""
from contextlib import closing
from fractions import Fraction
import json
import math
import runpy
import sys

import audit_index as index

OUT = index.ROOT / 'docs/rules/hero-mixed-batch-01.json'
SKILLS = {
    'A195':(140,'ANcl',[517,522],['T216']),
    'A198':(143,'ANcl',[265,280],['q025']),
    'A199':(144,'ANcl',[266,281],['q045','T223','T224','B173']),
    'A200':(145,'AUsl',[267,282],['q046','T225','T226','B174']),
    'A201':(146,'ANcl',[615],['T228']),
    'A202':(147,'ANcl',[616],[]),
    'A203':(148,'ANcl',[617],['BHwe','T259','B183']),
    'A204':(149,'AEfk',[575],['B210','T217']),
    'A205':(150,'ANcl',[576],['q050','T229']),
    'A206':(151,'Aroa',[577],['q051','T044','B210']),
}
RULES = {
    'A195':{'range':800,'period':.1,'launches':30,'missileSpeed':900,'damage':[200,300,400,500,600,700],
            'mana':[25,30,35,40,45,50],'cooldown':8,'pick':'uniform, with replacement, eligible each launch'},
    'A198':{'range':1000,'cooldown':15,'mana':0,'factors':[.04,.06,.08,.10,.12,.14],
            'minimumRequest':200,'maximumRequest':3000,'denominator':'target max life before q025 kill request'},
    'A199':{'range':1000,'cooldown':10,'mana':[90,120,150,180,210,240],
            'pulses':[0,1.5,3,4.5,6],'radius':800,'damageDelay':.2,'intFactors':[2,4],
            'baseDamage':[300,500,900,1200,1500,1800],'slow':[.2,2],
            'q045Amount':'max(500,current event damage-current target move speed)'},
    'A200':{'range':750,'cooldown':[20,19,18,17,16,15],'mana':[75,120,165,210,255,300],
            'maxImpacts':10,'nextRadius':600,'missileSpeed':800,'stunFirstOnly':.1,
            'slow':[.3,.25,2],'damage':'rank*(INT+100), scepter x2 in 300 radius',
            'revisit':'allowed except current target','overlap':'per cast identity'},
    'A201':{'range':800,'cooldown':[15,14,13,12,11,10],'mana':[50,80,110,140,170,200],
            'radii':[400,410,420,430,440,450],'pullTicks':25,'period':.02,'impact':.52,
            'pullFormula':'p + (centre-p)*tick/60','damage':[600,800,1000,1200,1400,1600],
            'auxStun':.5},
    'A202':{'range':1000,'cooldown':10,'mana':[70,90,110,130,150,170],
            'radius':600,'duration':10,'period':.2,'pulses':50,'stackKey':'target',
            'dps':[400,600,800,1000,1200,1400],'scepter':'add INT at effect commit'},
    'A203':{'range':800,'mana':[20,50,70,90,110,130],'cooldown':[18,16,14,12,10,8],
            'radii':[420,440,460,480,500,520],'cloneCap':[5,6,7,8,9,10],'cloneLifetime':10,
            'cloneOverdraftFreeMaxLifeFactor':.5,'wavePopulationPortal':-1,
            'nonMainlineSlow':[.4,3,2.5]},
    'A204':{'cooldown':10,'mana':[20,30,40,50,60,70],'period':.05,
            'cycles':2,'ticksPerCycle':46,'maximumRadius':1120,'perTargetLegHits':1,
            'damageMultiplier':[1,1.4,1.8,2.2,2.6,3],'scepterMultiplier':5,
            'conditionalItemAttack':['B210','T217']},
    'A205':{'range':850,'cooldown':12,'mana':[30,40,50,60,70,80],
            'area':400,'channel':5,'period':1,'channelTargetRanges':[2000,1000],
            'appliedAttackLifetime':13,'attack':[15,18,21,24,27,30],'endlessMultiplier':2},
    'A206':{'cooldown':20,'mana':[40,50,60,70,80,90],
            'lifetime':15,'period':[.5,.3],'weaponRange':1000,'projectileSpeed':2000,
            'radius':250,'damage':'S18+S19+300+100*rank','selectedTargetArmorDelta':-1,
            'parentImpactEntryDamage':11,'parentFinalAppliedDamage':0,'conditionalMinimumFinishCooldown':16},
}
DIFF = {
    'A195':['T216 remains mounted in source for 3.1; guide commits 30 emissions over 3 seconds.'],
    'A199':['Guide rank 2 fixed 500 instead of 600 from source and tooltip. The first immediate pulse is explicit source.'],
    'A200':['Source T225 stuns every hop; guide preserves first only. Source UserData cursor is shared by cast.'],
    'A202':['Source ranks begin at 30 mana and a simultaneous early expiration drops the last of 50 periodic packets.'],
    'A203':['Source uses max life including overdraft divided by 3; guide uses half without the overdraft contribution.'],
    'A204':['Fixed four legs use one hit per actual target on each leg and a distinct runner per cast.'],
    'A206':['Source mother basic weapon raw damage is 11 and source armor reduction checks current armor>0; guide local rules omit both.'],
}


def fields(db,id,source='units_abilitydata'):
    row, = index.objects(db,id,source)
    return row['fields']


def evidence(db):
    campaign = (index.MAP/'units_campaignabilitystrings.txt').read_text().splitlines()
    _, fingerprints = json.loads(db.execute('SELECT fingerprint FROM metadata').fetchone()[0])
    marker = {'A195':{'T216':('Apxf',800,.1)},'A200':{'T225':('AHtb',None,None)},
              'A205':{'T229':('AHdr',1000,1)},'A206':{'T044':('ANpi',220,None)}}
    for id,(module,code,guide_rows,aux) in SKILLS.items():
        rows = [r for r in index.workbook_rows(db,id,'塔技能') if r['cells'][5]==id]
        n = len(guide_rows)
        assert [r['row'] for r in rows]==guide_rows*2
        assert [r['cells'] for r in rows[:n]]==[r['cells'] for r in rows[n:]]
        obj, = index.objects(db,id,'units_abilitydata')
        assert obj['fields']['code']==code and obj['fields']['levels']==6
        units = sorted({r['cells'][1] for r in rows})
        for unit in units:
            assert id in fields(db,unit,'units_unitabilities')['heroAbilList'].split(',')
        for ability,(tag,area,period) in marker.get(id,{}).items():
            actual = fields(db,ability)
            assert (actual['code'],actual.get('Area1'),actual.get('Cool1'))==(tag,area,period)
        source_module = f'main/f{module}'
        yield id, {'workbookRowsOnBoth':guide_rows,'units':units,'objectIndex':obj['jsonIndex'],
                   'tipLine':campaign.index(f'[{id}]')+1,'auxiliary':aux,
                   'auxiliaryTipLines':{a:campaign.index(f'[{a}]')+1 for a in aux if f'[{a}]' in campaign},
                   'modules':[tuple(r) for r in db.execute(
                       'SELECT name,start_line,end_line FROM function WHERE name=? OR name LIKE ? ORDER BY start_line',
                       (source_module,source_module+'/%'))],
                   'entryPoints':[[r['function'],r['pc'],r['sourceLine']] for r in index.references(db,id)
                                  if r['function'].startswith('main/f291/')],
                   'disasmSha256':dict(fingerprints)[index.DISASM]}

    weapons = fields(db,'q051','units_unitweapons')
    assert (weapons['rangeN1'],weapons['cool1'],weapons['dmgplus1']+weapons['dice1'])==(1000,.5,11)
    for id,data in [('T224',{'DataA1':.2,'Dur1':2}),('T225',{'DataA1':100,'Dur1':.1,'HeroDur1':.1}),
                    ('T226',{'DataA1':.3,'DataB1':.25,'Dur1':2}),('T228',{'DataA1':None,'Dur1':.5}),
                    ('T259',{'DataA1':.4,'Dur1':3,'HeroDur1':2.5}),('T229',{'DataA1':10,'DataC1':1,'Dur1':5,'Rng1':2000})]:
        actual = fields(db,id)
        assert all(actual.get(key)==value for key,value in data.items()), (id,data)


def source_probes(db):
    support = runpy.run_path(str(index.ROOT/'tools/audit-passive-growth-batch.py'))
    ctx = support['probe_context']
    vm, world, env, caster, target, packets, _ = ctx(db,['main/f140','main/f143','main/f144','main/f147','main/f151'])
    caster.update(skills={'A195':6,'A198':2,'A199':2,'A202':2,'A206':1},mana=100,userData=1,s18=100,s19=25)
    target['armor'] = 1
    env.update(GetUnitUserData=lambda u:u.get('userData',1),CreateEffByUnit=lambda *_:{},
               DestroyEffect=lambda *_:None,GetTriggerUnit=lambda:caster,
               GetUnitLoc=lambda u:{'x':u['x'],'y':u['y']},GetLocationX=lambda p:p['x'],GetLocationY=lambda p:p['y'],
               SetUnitState=lambda u,k,v:u.__setitem__(k,v),UnitKillUnit=lambda *_:packets.append('kill'),
               UNIT_STATE_MANA='mana',CreateTempAndSetAbilityLv=lambda *_:{},
               SetUnitUserData=lambda u,k:u.__setitem__('userData',k),IssueTargetOrder=lambda *_:True,
               SetMagicDamagePoint=lambda s,d,r,x,y,a:packets.append((world.now, d,r,a)),
               ConvertUnitState=lambda n:{18:'s18',19:'s19',32:'armor',37:'period'}[n],
               SetUnitPositionLoc=lambda *_:None,SetPhyDamagePoint=lambda s,d,r,x,y,a:packets.append((r,a)),
               Item_Attack_Action=lambda *_:packets.append('itemAction'))
    env['A195_Action'](caster)
    world.advance(3)
    assert caster['skills']['T216']==6
    world.advance(Fraction(31,10))
    assert 'T216' not in caster['skills']
    env['A198_Action'](target)
    assert packets==['kill'] and caster['mana']==700
    packets.clear()

    env['A199_Action'](caster,target)
    world.advance(Fraction(91,10))
    assert len(packets)==5 and [row[0] for row in packets]==[Fraction(31,10)+n*Fraction(3,2) for n in range(5)]
    assert {row[1:] for row in packets}=={(.2,800,800)}
    packets.clear()
    env['A202_Action'](caster,target)
    world.advance(Fraction(191,10))
    assert len(packets)==49 and {row[1:] for row in packets}=={(0,600,120)}
    packets.clear()

    env['A206_Skilldamage'](caster,{},target)
    env['A206_Skilldamage'](caster,{},target)
    assert packets==[(250,525),'itemAction',(250,525),'itemAction'] and target['armor']==0
    storm_calls = list(packets)
    packets.clear()

    registry, clone_events = {'mon_arr':{},'mon_next_pos_index':{},'mon_damage_trig_arr':{}}, []
    portals = {f'Mon_Mode1_{i}':{} for i in range(4)}
    env.update(**registry,**portals,TxShow=False,IsShopBoss=lambda _:False,UnitIsHero=lambda _:False,
               GetUnitTypeId=lambda u:u.get('type','normal'),CreateTrigger=dict,
               EVENT_UNIT_DAMAGED='damage',TriggerRegisterUnitEvent=lambda *_:None,
               TriggerAddAction=lambda *_:None,CreateUnit=lambda p,t,x,y,_:dict(owner=p,type=t,x=x,y=y),
               SetUnitVertexColor=lambda *_:None,PercentTo255=lambda n:n,
               UnitApplyTimedLife=lambda u,id,t:clone_events.append((id,t)),
               MonKeepMove=lambda *_:None,RemoveGuardPosition=lambda *_:None)
    env['CreateDamageTrig'] = vm['Closure']('main/f294/f36',[env])
    vm['execute'](vm['function']('main/f148'),[env],(lambda _:None,))
    caster['skills']['A203'] = 1
    target.update(x=500,life=9000,maxLife=9000,userData=10502,type='normal')
    env['A203_Action'](caster,{'x':500,'y':0})
    copy, = registry['mon_arr'].values()
    assert copy['life']==copy['maxLife']==3000 and copy['userData']==10502
    assert clone_events==[('BHwe',10)] and registry['mon_next_pos_index']=={1:-1}
    assert all(not p for p in portals.values())
    direct = []
    env.update(SetUnitX=lambda u,x:u.__setitem__('x',x),SetUnitY=lambda u,y:u.__setitem__('y',y),
               CreateEffAtLoc=lambda *_:None,GetDistance=lambda a,b:math.hypot(a['x']-b['x'],a['y']-b['y']),
               SetMagicDamage=lambda s,t,n:direct.append((float(world.now),n)),
               IsKillCdSkill=lambda _:False)
    vm['execute'](vm['function']('main/f146'),[env],(lambda _:None,))
    caster['skills']['A201'] = 1
    target['x'] = 400
    env['A201_Action'](caster,{'x':0,'y':0})
    world.advance(Fraction(981,50))
    assert direct==[(19.62,600)] and math.isclose(target['x'],.6609030053259991)
    pulled_x = target['x']
    direct.clear()

    vm['execute'](vm['function']('main/f149'),[env],(lambda _:None,))
    caster['skills']['A204'] = 1
    target['x'] = 500
    env['A204_Action'](caster)
    world.advance(Fraction(1211,50))
    assert len(direct)==8 and {n for _,n in direct}=={125}
    rings_on_500_and_1000 = len(direct)

    mother_writes = []
    vm['execute'](vm['function']('main/f150'),[env],
                  (lambda _:{'EXSetEventDamage':mother_writes.append},))
    caster['skills']['A205'] = 1
    target['x'] = 200
    env['A205_Skill'](caster,{'x':200,'y':0})
    env['A205_Action'](caster)
    env['Game_Mode'] = 1
    env['A205_Action'](caster)
    assert mother_writes==[0,0] and caster['s18']==145
    world.advance(Fraction(1861,50))
    assert caster['s18']==100
    direct.clear()
    mother_writes.clear()
    issued = []
    target['x'] = 500
    other = world.units[2]
    other['x'] = 1000
    env.update(CreateTempAndSetAbilityLv=lambda *a:{'ability':a[3]},
               IssueTargetOrder=lambda dummy,order,u:issued.append((dummy['ability'],order,u['x'])) or True)
    vm['execute'](vm['function']('main/f145'),[env],(lambda _:{'EXSetEventDamage':mother_writes.append},))
    caster['skills']['A200'] = 4
    env['A200_Action'](caster,target)
    for n in range(10):
        env['A200_Eff'](caster,target if n%2==0 else other)
    bolt_targets = [x for ability,_,x in issued if ability=='T225']
    assert bolt_targets==[500,1000]*5 and mother_writes==[0]*10
    assert len(direct)==10 and {n for _,n in direct}=={800}

    return {'A195':{'sourceMarkerStillPresentAt3ThenRemovedAt31Tenth':True},
            'A198':{'sourceKillThenManaGainFor10000L2':600},
            'A199':{'sourceFivePulsesAndGrade2Int100':800},
            'A200':{'sourceTenBoltTargets':bolt_targets,'sourceAmountWithoutStaffAtRank4Int100':800},
            'A201':{'sourceFinalX':pulled_x,'sourceFinalSpellAt19_62':600},
            'A202':{'sourceB05StylePulseCount':49},
            'A203':{'sourceCloneFrom9000MaxLife':3000,'sourcePortalRegistration':-1},
            'A204':{'sourceTwoEligibleTargetsAcrossFourLegs':rings_on_500_and_1000},
            'A205':{'sourceParentZeroesBothModes':[0,0],'sourceAttackAfterTwoHitsAndExpiry':[145,100]},
            'A206':{'sourceTwoHitSelectedTarget1Ends0':True,'sourceAreaAndItemOrder':storm_calls}}


def selected_probes():
    launches = [Fraction(n,10) for n in range(1,31)]
    shell = [Fraction(n,5) for n in range(1,51)]
    position = 400
    for step in range(1,26):
        position += (0-position)*step/60
    assert launches[-1]==3 and shell[-1]==10 and len(shell)==50
    assert position<1
    def ring_hits(distance):
        return sum(any(max(0,50*(k-1))<=distance<=50*k+20 for k in radii)
                   for radii in (range(1,23),range(22,-1,-1))*2)
    counts = [ring_hits(r) for r in (0,500,1120,1121)]
    assert counts==[4,4,4,0]
    hp, original_overdraft, independent_max_increase = 1000,200,100
    actual_max = hp+original_overdraft+independent_max_increase
    assert (actual_max - original_overdraft)*.5==550
    pressure = [int(15/Fraction(n,10)) for n in (5,3)]
    assert pressure==[30,50]
    return {'A195':{'launches':len(launches),'lastLaunch':int(launches[-1])},
            'A200':{'bouncePath':['A' if n%2==0 else 'B' for n in range(10)],'stunOccurrences':[1]},
            'A201':{'initial400FinalAfter25':position,'damageAt':.52},
            'A202':{'pulses':len(shell),'lastPulse':int(shell[-1])},
            'A203':{'given1000Base200Overdraft100OtherIncreaseCloneLife':550},
            'A204':{'hitsAt0_500_1120_1121':counts},
            'A205':{'twoTargetsL1FivePulses':[150,300],'expiration':13},
            'A206':{'strikeOpportunityCounts':pressure,'armorAfterTwoHitsFrom1':-1}}


if __name__=='__main__':
    with closing(index.connect()) as db:
        records = dict(evidence(db))
        raw = source_probes(db)
    web = selected_probes()
    report = [{'id':id,'status':'ready','rules':RULES[id],'sourceRefs':records[id],
               'differences':DIFF.get(id,[]),'unresolved':[],
               'validation':{'sourceVM':raw.get(id),'webVector':web.get(id),'originalClientTested':False}}
              for id in SKILLS]
    encoded = json.dumps(report,ensure_ascii=False,indent=2)+'\n'
    if '--write' in sys.argv:
        OUT.write_text(encoded)
    else:
        assert OUT.read_text()==encoded
    print(json.dumps({'ready':len(report),'sourceVM':raw,'web':web},ensure_ascii=False))
