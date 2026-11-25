#!/usr/bin/env python3
"""Validate known orb, mana burn and channel audit inputs and boundaries."""
from contextlib import closing
import json
import math
import runpy
import sys

import audit_index as index

OUT = index.ROOT/'docs/rules/orb-and-channel-batch-01.json'
SKILLS = {
    'A040':('AHfa','main/f38',['flamingarrows']),
    'A070':('AHca',None,['A210']),
    'A083':('AEpa','main/f72',['Bpsd','A084']),
    'A093':('Amls','main/f80',['T093','q001','Bmlc','Bmlt']),
    'A103':('AHdr','main/f83',['A176','T099','q026','B100']),
    'A158':('AOac','main/f109',[]),
    'A159':('AHad','main/f110',['A158']),
    'A166':('ANdo','main/f117',['T176','B151','nba2']),
}
RULES = {
    'A040':{'manualRange':1300,'autoWeaponRange':1200,'mana':3,'shotBonus':[500,700,900,1100,1300,1500],
            'learnOrdersAutoOn':True,'affectsMagicImmune':True},
    'A070':{'actualSkinAbility':'A210','range':1200,'mana':3,'moveSlow':[.1,.2,.3,.4,.5,.6],
            'normalDuration':[1,1,2,2,3,3],'heroDuration':[.5,1,1.5,2,2.5,3],
            'nativeDamage':0,'attackSlow':0},
    'A083':{'manaCost':[100,150,200,250,300,350],'poisonMarkerDuration':.01,'intContributionDuration':70,
            'intGain':[1,2,3,4,5,6],'manaDamageRate':[.07,.08,.09,.1,.11,.12],'scepterArea':285,
            'sourceExternalBpsdAccepted':True,'sameShotPaymentRequired':True,'decision':'Q66'},
    'A093':{'period':1,'duration':3,'primaryRange':600,'secondaryRange':2000,
            'secondaryCenter':'primaryTarget','secondaryRadius':600,'secondaryTimedLife':4,
            'mana':[20,40,60,80,100,120],'cooldown':[17,16,15,14,13,12],
            'damagePerTick':[100,200,300,400,500,600]},
    'A103':{'actualSkinAbility':'A176','duration':8,'period':.5,'range':800,'maintainRange':1000,
            'health':[100,200,300,400,500,600],'mana':[50,80,110,140,170,200],'cooldown':12},
    'A158':{'baseManaBurnPerRank':30,'scepterTargetMaxManaRate':.01,'directLifeDamage':0},
    'A159':{'effectiveBaseManaBurnFactors':[.1,.12,.15,.2,.28,.4],'otherActualSourceFactor':.5,'duration':4,
            'includesScepterManaBurn':False},
    'A166':{'duration':10,'sourceDebuff':'B151','mana':[170,190,210,230,250,270],
            'cooldown':[17,16,15,14,13,12],'damagePerSecond':[2000,2500,3000,3500,4000,5000],
            'scepterRemovedAbilities':['N524','T017','N533','N535','N579','N536','N525']},
}
PENDING = {
    'A103':['q026/T099 native heal and base drain','A176 boolean ability level','B100 conversion and owner-target scope'],
    'A166':['Death summon nba2','scepter reduction arithmetic and native shield/blacklist restoration'],
}
DIFFERENCES = {
    'A040':['Physical fixed bonus joins the ordinary packet; paid arrow ignores magic immunity'],
    'A070':['Separate actual native hero-duration series, ordinary values agree with atlas'],
    'A083':['Original grants source intelligence without reducing victim intelligence',
             'Q66 requires payment for the same shot; borrowed Bpsd alone is insufficient'],
    'A093':['Lua secondary area centers caster; atlas Q64 centers primary target'],
    'A103':['Tooltip more mode damage than source coefficient, A176 native helper gets boolean in original'],
    'A158':['Scepter 1% target max mana does not contribute to A159'],
    'A159':['Original contribution before A158 mana update and no scepter bonus'],
    'A166':['T176 source modifier differs from halving damage reduction, and native unit type is present'],
}


def source_records(db):
    lines = (index.MAP/'units_campaignabilitystrings.txt').read_text().splitlines()
    for ability,(code,module,aux) in SKILLS.items():
        rows = [r for r in index.workbook_rows(db,ability,'塔技能') if r['cells'][5]==ability]
        originals = [r['cells'] for r in rows if r['sourcePath']!='图鉴.xlsx']
        repository = [r['cells'] for r in rows if r['sourcePath']=='图鉴.xlsx']
        assert originals == repository and repository
        obj, = index.objects(db,ability,'units_abilitydata')
        assert obj['fields']['code']==code
        start = lines.index(f'[{ability}]')
        hint = next(n+1 for n in range(start,start+25) if lines[n].startswith('Ubertip='))
        refs = [{'function':ref['function'],'pc':ref['pc'],'line':ref['sourceLine']}
                for ref in index.references(db,ability) if ref['function'].startswith('main/f291/')]
        functions = [list(row) for row in db.execute(
            'SELECT name,start_line,end_line FROM function WHERE name=? OR name LIKE ? ORDER BY start_line',
            (module,f'{module}/%'))] if module else []
        indexes = {a:[(r['sourcePath'],r['jsonIndex']) for r in index.objects(db,a)
                       if r['sourcePath'].endswith(('units_abilitydata.json','war3map.w3a.json','units_unitabilities.json'))]
                   for a in aux}
        yield ability,{'workbookRows':[r['row'] for r in rows if r['sourcePath']=='图鉴.xlsx'],
                       'unitIds':list(dict.fromkeys(row[1] for row in repository)),
                       'objectIndex':obj['jsonIndex'],'hintLine':hint,'dispatch':refs,
                       'functions':functions,'auxiliaryIndexes':indexes}


def original_probes(db):
    support = runpy.run_path(str(index.ROOT/'tools/audit-passive-growth-batch.py'))
    vm, world, env, caster, target, packets, _ = support['probe_context'](
        db,['main/f38','main/f72','main/f80','main/f83','main/f109','main/f110','main/f117'])
    events = []
    caster.update(skills={'A040':1,'A083':1,'A093':3,'A158':2,'A159':6},mana=500)
    target.update(mana=55,maxMana=1000,int=100,x=600)
    def set_int(unit,new,_):
        unit['mana'] += 12*(new-unit['int'])
        unit['int'] = new
    env.update(UNIT_STATE_MANA='mana',UNIT_STATE_MAX_MANA='maxMana',SetHeroInt=set_int,
               SetUnitState=lambda unit,field,value:unit.__setitem__(field,value),
               IssueImmediateOrder=lambda unit,order:events.append(order),
               UnitDamagePoint=lambda s,delay,radius,x,y,amount,*_:events.append((radius,amount)),
               CreateEffByUnit=lambda *_:None)
    env['A040_Study'](caster,'A040')
    assert events==['flamingarrows']
    env['A083_Action'](caster,target)
    assert caster['int']==101 and target['int']==100 and math.isclose(packets[-1][2],35.84)
    caster['scepter'] = True
    world.advance(1)
    env['A083_Action'](caster,target)
    assert caster['int']==102 and events[-1][0]==285 and math.isclose(events[-1][1],36.68)
    world.advance(70)
    assert caster['int']==101 and caster['mana']==512
    world.advance(71)
    assert caster['int']==100 and caster['mana']==500
    original_chain = []
    target['skills']['Bpsd'] = 1
    dispatch = vm['function']('main/f291/f1')
    vm['execute'](dispatch,[{**env,
        'A083_Action':lambda *_:original_chain.append('A083'),
        'A084_Action':lambda *_:original_chain.append('A084')},
        {'EXGetEventDamageData':lambda _:1}],(caster,target,caster),start_pc=590,stop_pc=618)
    assert original_chain==['A083','A084']
    target['skills'].pop('Bpsd')

    target['mana'] = 100
    env['A159_Action'](caster,target,caster)
    assert caster['agi']==124 and target['mana']==100
    env['A158_Action'](caster,target,caster)
    assert target['mana']==30
    world.advance(72)
    env['A159_Action'](caster,target,{**caster})
    assert caster['agi']==130
    world.advance(75)
    assert caster['agi']==106
    world.advance(76)
    assert caster['agi']==100

    worlds = [{**target,'x':point} for point in (-600,300,1200)]
    world.units = [caster,target,*worlds]
    orders = []
    env.update(GetUnitLoc=lambda unit:{'x':unit['x'],'y':unit['y']},
               CreateTempAndSetAbilityLv=lambda owner,loc,face,code,level,time:
               {'owner':owner,'loc':loc,'code':code,'level':level,'lifetime':time},
               SetUnitUserData=lambda carrier,user:carrier.update(user=user),
               IssueTargetOrder=lambda carrier,order,target:orders.append((carrier,order,target['x'])))
    env['A093_Action'](caster,target)
    assert [row[2] for row in orders]==[-600,300]
    assert all(carrier=={'owner':0,'loc':{'x':0,'y':0},'code':'T093','level':3,'lifetime':4,'user':1}
               and order=='magicleash' for carrier,order,_ in orders)

    env['RemoveLocation'] = lambda _:None
    env['CreateTempAndSetAbilityLv'] = lambda owner,loc,face,code,level,time,kind: {
        'owner':owner,'code':code,'level':level,'lifetime':time,'kind':kind}
    caster['skills']['A176'] = 5
    env['GetTriggerUnit'] = lambda:caster
    env['A103_Action'](caster,target)
    assert orders[-1][0]['level'] is True and orders[-1][0]['kind']=='q026'
    duplicate = {**caster,'skills':{'A103':4}}
    env['Tower_ALL'][2] = duplicate
    env['A103_Action'](duplicate,target)
    assert len(orders)==3
    env['A103_End']()
    assert events[-1]=='stop'
    env['A103_Action'](duplicate,target)
    assert orders[-1][0]['level']==4

    caster['skills']['A166'] = 2
    target['skills'] = {'N524':3,'N535':2,'A115':1}
    env['A166_Action'](caster,target)
    assert target['skills']=={'A115':1,'T176':1}
    world.advance(86)
    assert target['skills']=={'A115':1,'N524':1,'N535':1}
    return {'A040':events[0],'A083':{'unpaidAttackWithBorrowedBpsd':original_chain,
                                     'readsPostIntMana':35.84,'scepterArea':285,'expiredInOrder':True},
            'A093':{'sourceSecondaryTargets':[-600,300],'carrier':'T093@caster'},
            'A103':{'skinRank5PassedToNative':True,'sameTargetDeniedWhileOldChannel':True,'stopReleasesTarget':True},
            'A158':{'rank2ScepterDrain':70},'A159':{'firstGain':24,'peerGain':6,'expiresSeparately':True},
            'A166':{'sourceScepterRanksBeforeAndAfter':[[3,2],[1,1]],'unrelatedPassiveUntouched':True}}


def selected_probes():
    targets = [-600,300,600,1200,1200.001]
    secondary = [x for x in targets if x != 600 and abs(x-600)<=600]
    assert secondary==[300,1200]
    mana = 3
    after = [mana-(3 if committed and mana>=3 else 0) for committed in (False,True)]
    assert after==[3,0]
    frost = {'slow':.6,'until':3}
    frost.update(slow=.1,until=1+RULES['A070']['heroDuration'][0])
    assert frost=={'slow':.1,'until':1.5}
    main_break = 1.5
    main = [t for t in (1,2,3) if t<main_break]
    secondary_pulses = [t for t in (1,2,3) if t<=RULES['A093']['duration']]
    assert main==[1] and secondary_pulses==[1,2,3]
    paid_shots = {17:('S','T'), 19:('S','T2')}
    def impact(shot, source, target, attack, bpsd):
        if not attack or paid_shots.get(shot)!=(source,target):
            return []
        del paid_shots[shot]
        return ['A083','A084'] if bpsd else []
    assert impact(16,'S','T',True,True)==[]   # ordinary attack with external poison
    assert impact(17,'S','T',False,True)==[]  # separate child packet
    accepted = impact(17,'S','T',True,True)
    assert accepted==['A083','A084'] and impact(17,'S','T',True,True)==[]
    assert impact(19,'S','T2',True,False)==[] # payment does not override hit gate
    return {'A040':{'cancelledVersusLaunchedAtThreeMana':after},
            'A070':{'heroLevel1Duration':.5,'regularLevel1Duration':1,'weakerColdArrowReplaces':frost},
            'A083':{'unpaidExternalPoisonChain':[],'paidOwnShotChain':accepted,
                    'onlyOncePerShot':True,'paidShotNeedsBpsdAtImpact':True},
            'A093':{'targetCenteredSecondaryPositions':secondary,
                    'primaryPulsesIfInterruptedAt1_5':main,'independentSecondaryPulses':secondary_pulses}}


if __name__=='__main__':
    with closing(index.connect()) as db:
        old = original_probes(db)
        selected = selected_probes()
        records = [{'id':id,'status':'pending' if id in PENDING else 'ready','rules':RULES[id],
                    'sourceRefs':refs,'differences':DIFFERENCES[id],'unresolved':PENDING.get(id,[]),
                    'validation':{'sourceVM':old.get(id),'selectedWeb':selected.get(id),'originalClientTested':False}}
                   for id,refs in source_records(db)]
    report = {'scope':'orb-and-channel-batch-01','initialBatch':{'processed':8,'ready':5},
              'ready':len(records)-len(PENDING),'skills':records}
    rendered = json.dumps(report,ensure_ascii=False,indent=2)+'\n'
    if '--write' in sys.argv:
        OUT.write_text(rendered)
    else:
        assert OUT.read_text()==rendered
    print(json.dumps({'ready':report['ready'],'pending':list(PENDING),'sourceVM':old,'selectedWeb':selected},ensure_ascii=False))
