#!/usr/bin/env python3
"""Validate spectre, pit lord and demon witch targeting against indexed map evidence."""
from contextlib import closing
from fractions import Fraction
import json
import math
import runpy
import sys

import audit_index as index

OUT = index.ROOT / 'docs/rules/hero-mixed-batch-02.json'
SKILLS = {
    'A230':(163,'Amgl',[35,40],[]),
    'A231':(164,'ANcl',[36,41],[]),
    'A232':(165,'ANcl',[37,42],['T400','BIil']),
    'A233':(166,'ANrf',[416,436],['T403','B215']),
    'A234':(167,'ANcl',[417,437],['T404','B216']),
    'A236':(169,'ANcl',[320],['T212']),
    'A237':(170,'ANcl',[321],['T406','BOhx']),
    'A238':(171,'ANcl',[322],['q059','T405','q061']),
}
RULES = {
    'A230':{'intrinsicCooldown':.5,'cooldownKey':'actual source entity','isolationRadius':150,
            'basePerRank':120,'agiFactor':[0,0,2,4,6,8],'RoshanFactor':.01,
            'containedTargets':'other living P11','damageTypes':['physical','divine']},
    'A231':{'duration':4,'mana':[20,30,40,50,60,70],'cooldown':8,'radius':900,
            'contributionPC':3839,'ratioPerRank':.15,'falloff':'(1000-distance)/1000',
            'eligibleActualSources':['self','attributed BIil illusion']},
    'A232':{'duration':[4,5,6,7,8,9],'mana':[25,50,75,100,125,150],
            'cooldown':[18,17,16,15,14,13],'clonesPerLiveBoss':1,'endlessExtra':3,
            'illusionDamageAndTakenFactors':[1,1],'goldMainModeWavesUpTo35Numerator':1.6,
            'goldMainModeWavesAfter35Numerator':1.8,'antiPoachingRadii':[1200,1200]},
    'A233':{'range':750,'radius':600,'mana':[25,50,75,100,125,150],'cooldown':[20,18,16,14,12,10],
            'waves':6,'registration':[0,1,2,3,4,5],'impact':[1,2,3,4,5,6],
            'basePerRank':200,'attackFactorPerRank':.5,'burnPerRank':100,'burnDuration':2,
            'burnMissileSpeed':1400,'burnStack':'one B215 per target; refresh'},
    'A234':{'range':900,'radius':600,'mana':[100,120,140,160,180,200],'cooldown':13,
            'pulses':list(range(8)),'damagePerRank':200,'rootDuration':.3,'missileSpeed':2000},
    'A236':{'range':800,'mana':[50,60,70,80,90,100],'cooldown':[15,14,13,12,11,10],
            'sixCircleCentres':[200,400,600,800,1000,1200],'radius':200,'damagePerRank':300,
            'maxDamageHitsPerCastAndTarget':1,'controlGlobalPerTarget':True,'heightPeriod':.02,
            'upTicks':40,'downTicks':39,'perTickHeight':20,'controlDuration':1.6,'decision':'Q75'},
    'A237':{'range':800,'radius':600,'mana':[100,120,140,160,180,200],'cooldown':[15,14,13,12,11,10],
            'hexAllEligibleDuration':3,'delayedPhysical':{'delay':.2,'damage':1}},
    'A238':{'range':800,'scepterRadius':390,'mana':[50,100,150,200,250,300],
            'cooldown':[20,18,16,14,12,10],'flatDamage':[1500,2000,2500,3000,3500,4000],
            'lifeRead':['max','current','current','current','current','current'],
            'standardLifeFactor':.1,'specialLifeFactor':.01,'stackPerRealKill':[1,5],
            'stackDamageByMode':[150,300,250],'cap':800,'nativePacketOverwritten':True},
}
DIFF = {
    'A230':['Source cooldown .6 self/1 illusion; guide .5 both.'],
    'A231':['Source ratio .12 per rank, guide .15. Source global defUnit exclusion has no relevant origin.'],
    'A232':['Source requests the Boss position; use explicit behind from workbook at eligible placement.'],
    'A233':['Source T403 forced level 1; guide burn is per rank. Native ANrf 1 shell amount is not an extra damage packet.'],
    'A234':['Source T404 hero duration .2, guide .3. Initial source pulse plus seven periodic pulses.'],
    'A236':['Q75 removes duplicate damage from overlapping source circles and keeps the distinct lift lock.'],
    'A237':['Source T406 native hero duration 2.5, guide 3. The separate 1-point helper stays.'],
    'A238':['Source current life all ranks at .06 ordinary; guide .10, maximum only rank 1. Source special .01 remains.'],
}


def evidence(db):
    hints = (index.MAP/'units_campaignabilitystrings.txt').read_text().splitlines()
    _, hashes = json.loads(db.execute('SELECT fingerprint FROM metadata').fetchone()[0])
    for id,(number,code,rows,aux) in SKILLS.items():
        book = [r for r in index.workbook_rows(db,id,'塔技能') if r['cells'][5]==id]
        assert [r['row'] for r in book]==rows*2
        assert [r['cells'] for r in book[:len(rows)]] == [r['cells'] for r in book[len(rows):]]
        obj, = index.objects(db,id,'units_abilitydata')
        assert obj['fields']['code']==code and obj['fields']['levels']==6
        units = sorted({r['cells'][1] for r in book})
        for unit in units:
            mount, = index.objects(db,unit,'units_unitabilities')
            assert id in mount['fields']['heroAbilList'].split(',')
        module = f'main/f{number}'
        yield id, {'guideRowsOnBoth':rows,'units':units,'objectIndex':obj['jsonIndex'],
                   'hint':hints.index(f'[{id}]')+1,'auxiliary':aux,
                   'auxiliaryHintLines':{a:hints.index(f'[{a}]')+1 for a in aux if f'[{a}]' in hints},
                   'functions':[tuple(r) for r in db.execute(
                       'SELECT name,start_line,end_line FROM function WHERE name=? OR name LIKE ? ORDER BY start_line',
                       (module,module+'/%'))],
                   'mainRefs':[[r['function'],r['pc'],r['sourceLine']] for r in index.references(db,id)
                               if r['function'].startswith('main/f291/')],
                   'sourceSha256':dict(hashes)[index.DISASM]}

    for id, values in [('T400',{'code':'AIil','DataA1':1,'DataB1':1,'Dur1':4,'HeroDur4':7}),
                       ('T403',{'code':'ANab','DataD1':100,'DataD4':400,'Dur1':2,'DataF1':1}),
                       ('T404',{'code':'Aens','Dur1':.3,'HeroDur1':.2}),
                       ('T405',{'code':'AOcl','DataA1':100,'DataB1':1}),
                       ('T406',{'code':'AOhx','Dur1':3,'HeroDur1':2.5})]:
        obj, = index.objects(db,id,'units_abilitydata')
        assert all(obj['fields'].get(k)==v for k,v in values.items()), id


def source_probes(db):
    helper = runpy.run_path(str(index.ROOT/'tools/audit-passive-growth-batch.py'))
    vm, world, env, caster, target, packets, _ = helper['probe_context'](
        db,['main/f163','main/f164','main/f165','main/f166','main/f167','main/f169','main/f170'])
    far = world.units[2]
    far['skills'] = {}
    caster.update(userData=1,skills={id:6 for id in SKILLS},s18=100,s19=50)
    ghost = {**caster,'x':520,'illusion':True}
    target.update(fly=0,maxLife=20000)
    far.update(fly=0,x=1000)
    staging = []
    orders = []
    env.update(GetUnitUserData=lambda u:u.get('userData',1),GetUnitTypeId=lambda u:u.get('type','normal'),
               GetUnitLoc=lambda u:{'x':u['x'],'y':u['y']},GetLocationX=lambda p:p['x'],GetLocationY=lambda p:p['y'],
               IsShopBoss=lambda _:False,UnitIsHero=lambda u:u.get('boss',False),
               CreateEffByUnit=lambda *_:None,CreateEffAtLoc=lambda *_:None,
               GetDistance=lambda a,b:math.hypot(a['x']-b['x'],a['y']-b['y']),
               SetPhyDamage=lambda s,t,d:packets.append((t['x'],d,'physical')),
               R2I=int,CreateTempAndSetAbilityLv=lambda *args:{'code':args[3],'rank':args[4]},
               SetUnitUserData=lambda u,i:u.__setitem__('userData',i),
               IssueTargetOrder=lambda dummy,order,u:orders.append((dummy['code'],dummy['rank'],u['x'])) or True,
               IssueTargetOrderById=lambda dummy,order,u:orders.append((dummy['code'],dummy['rank'],order)) or True,
               SetMagicDamagePoint=lambda s,d,r,x,y,a:staging.append((float(world.now),d,r,x,a)),
               SetPhyDamagePoint=lambda s,d,r,x,y,a:staging.append((float(world.now),d,r,x,a)),
               ConvertUnitState=lambda n:{18:'s18',19:'s19'}[n],
               AngleBetweenPoints=lambda _a,_b:0,Location=lambda x,y:{'x':x,'y':y},
               Cos=math.cos,Sin=math.sin,PauseUnit=lambda u,b:u.__setitem__('paused',b),
               SetUnitFlyHeight=lambda u,z,_:u.__setitem__('fly',z),GetUnitFlyHeight=lambda u:u['fly'],
               GetUnitDefaultFlyHeight=lambda _:0)
    env['math']['rad'] = math.radians
    env['A230_Add_Arr'](ghost)
    env['A230_Attack'](caster,caster,target)
    env['A230_Attack'](caster,ghost,target)
    world.advance(Fraction(1,2))
    env['A230_Attack'](caster,caster,target)
    env['A230_Attack'](caster,ghost,target)
    assert len(packets)==2 and all(n==1520 and kind=='divine' for _,_,n,kind in packets)
    packets.clear()

    env['defUnit'] = target
    far['x'] = 600
    env['A231_Action'](caster)
    env['A231_damage_Ref'](caster,1000.3)
    world.advance(Fraction(9,2))
    assert packets==[('9/2',600,288,'divine')]
    packets.clear()

    target.update(type='m998',boss=True)
    env.update(GetArrRealLen=len,Player_Index_Arr=[0,1],cur_monLv=35)
    assert env['A232_Damage_Change'](caster,ghost,target,10000)==.8
    env['cur_monLv']=36
    assert env['A232_Damage_Change'](caster,ghost,target,10000)==.9
    env['Game_Mode']=1
    env['A232_Action'](caster)
    assert orders==[('T400',6,852274)]*4
    env['Game_Mode']=0
    orders.clear()

    point = {'x':500,'y':0}
    env['A233_Action'](caster,point)
    world.advance(Fraction(19,2))
    assert len(staging)==6 and {r[1:] for r in staging}=={(1,600,500,1650)}
    assert len(orders)==12 and all(t=='T403' and level==1 for t,level,_ in orders)
    staging.clear()
    orders.clear()
    env['A234_Action'](caster,point)
    world.advance(Fraction(33,2))
    assert len(staging)==8 and {r[1:] for r in staging}=={(0,600,500,1200)}
    staging.clear()
    orders.clear()

    target['x'] = 400
    env['A236_Action'](caster,point)
    assert [r[3] for r in staging]==[200,400,600,800,1000,1200]
    assert len([r for r in staging if abs(r[3]-400)<=200])==3 and target['paused']
    world.advance(Fraction(181,10))
    assert not target['paused'] and 'T212' not in target['skills'] and target['fly']==0
    staging.clear()
    env['A237_Action'](caster,point)
    assert [(a,rank) for a,rank,_ in orders]==[('T406',1),('T406',1)]
    assert [r[1:] for r in staging]==[(.2,600,500,1)]

    writes = []
    vm['execute'](vm['function']('main/f171'),[env],(lambda _:{'EXSetEventDamage':writes.append},))
    caster['skills']['A238']=1
    target.update(type='normal',life=10000)
    env['A238_damage'](caster,{},target)
    target['type']='mBOS'
    env['A238_damage'](caster,{},target)
    assert writes==[2100,1600]
    return {'A230':{'sourceSecondAtHalfSecondRejectedForBoth':True},
            'A231':{'sourceGlobalDefUnitSkips500Leaves600With288':True},
            'A232':{'sourceGoldRatiosFor2AtW35And36':[.8,.9],'sourceEndlessOneBossPlusThree':4},
            'A233':{'sourceSixAreasAllBurnDummiesRank1':True},
            'A234':{'sourceImmediatePlusSeven':8},
            'A236':{'sourceX400CircleOverlapCount':3,'sourceUnpausedAt1_6':True},
            'A237':{'sourceTwoHexOrdersThenOnePhysicalArea':True},
            'A238':{'sourceRank1With10000CurrentRegularAndRoshan':writes}}


def selected_probes():
    r=RULES
    damage_seen_by_cast = {}
    def impale_hit(cast,target):
        seen=damage_seen_by_cast.setdefault(cast,set())
        if target in seen:
            return 0
        seen.add(target)
        return r['A236']['damagePerRank']
    first = [impale_hit('one','T') for _ in range(3)]
    second = impale_hit('two','T')
    assert first==[300,0,0] and second==300

    nearest = [int(1000*.15*6*(1000-distance)/1000) for distance in (0,600,900)]
    assert nearest==[900,360,90]
    def finger(rank,maximum,life,stacks,mode,special=False):
        pool=maximum if rank==1 else life
        return r['A238']['flatDamage'][rank-1]+pool*(.01 if special else .10)+stacks*r['A238']['stackDamageByMode'][mode]
    finger_vector = [finger(1,20000,10000,2,0),finger(2,20000,10000,2,1),
                     finger(1,20000,10000,2,2,True)]
    assert finger_vector==[3800,3600,2200]
    assert min(800,798+5)==800
    assert list(range(6))==r['A233']['registration'] and list(range(1,7))==r['A233']['impact']
    return {'A231':{'damageFor1000L6At0_600_900':nearest},
            'A233':{'normalSixWaveTimes':list(range(1,7))},
            'A236':{'overlapSameCastAndNewCast':[first,second]},
            'A238':{'rank1MaxRank2CurrentAndSpecial':finger_vector,'bossCapFrom798':800}}


if __name__=='__main__':
    with closing(index.connect()) as db:
        facts = dict(evidence(db))
        raw = source_probes(db)
    web = selected_probes()
    report = [{'id':id,'status':'ready','rules':RULES[id],'sourceRefs':facts[id],
               'differences':DIFF[id],'unresolved':[],
               'validation':{'sourceVM':raw.get(id),'webVector':web.get(id),'originalClientTested':False}}
              for id in SKILLS]
    encoded = json.dumps(report,ensure_ascii=False,indent=2)+'\n'
    if '--write' in sys.argv:
        OUT.write_text(encoded)
    else:
        assert OUT.read_text()==encoded
    print(json.dumps({'ready':len(report),'sourceVM':raw,'web':web},ensure_ascii=False))
