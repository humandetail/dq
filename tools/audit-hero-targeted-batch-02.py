#!/usr/bin/env python3
"""Check ten targeted hero rules against the cached map and focused VM probes."""
from contextlib import closing
import json
import math
import runpy
import sys

import audit_index as index

OUT = index.ROOT / 'docs/rules/hero-targeted-batch-02.json'
PROFILE = index.MAP / 'units_campaignabilitystrings.txt'
SKILLS = {
    'A122': (95, 'ANcl', [290], ['q029','T130','T131','T132','BIil']),
    'A127': (99, 'Abrf', [302,307], ['T138']),
    'A133': (101, 'ANcl', [171,571], ['T155','T156']),
    'A134': (102, 'ANcl', [172,572], ['T143','B134','T149','T150','T151','T152','T153']),
    'A152': (104, 'ANcl', [246], ['T084','T094','B103']),
    'A155': (106, 'ANcl', [532,605], []),
    'A156': (107, 'ANcl', [533,606], ['T167']),
    'A157': (108, 'ANcl', [534,607], ['T168','T169','B100','Bprg']),
    'A162': (113, 'ANcl', [497,581], ['q033','T172','T260']),
    'A164': (115, 'ANcl', [60,65], ['T329','T300–T328']),
}
OPEN = {
    'A122':['Confirm staff jump count/exclusion/revisit and overlapping hits with shared table.',
            'Resolve T132 illusion through SUMMON, A123/A124 count, ownership and snapshot.'],
    'A164':['T329 acquisition, selection, slot replacement and subtype lifetime.',
            'Digestion retry and award handoff plus actual borrowed T300–T328 hooks.'],
}
RULES = {
    'A122':{'range':900,'cooldown':9,'damage':[1200,1400,1600,1800,2000,2200],
            'slow':[.4,4],'illusionLife':[3,4,5,6,7,8],'illusionAttackRatio':1},
    'A127':{'forms':['H036','E016'],'orders':['bearform','unbearform'],'cooldown':5,
            'heroAndBearBonus':[50,100,150,200,250,300],'baseAttack':[[28,34],[232,238]],
            'range':[1200,800],'period':[1.1,1.2],'stableEntity':True},
    'A133':{'range':9999,'duration':7,'mana':[20,30,40,50,60,70],
            'cooldown':[14,13,12,11,10,9],'attackSpeed':[.7,.8,.9,1,1.1,1.2],
            'attack':[300,400,500,600,700,800],'cleanseBeforeStrengthCheck':True},
    'A134':{'range':800,'duration':5,'pollPeriod':.5,'control':'movement only',
            'cooldown':[110,100,90,80,70,55],'baseWinAttack':100,'scepterWinAttack':200,
            'maxAttack':15000,'failureCooldownRewrite':False,'decision':'Q72'},
    'A152':{'range':1000,'mana':[20,35,50,65,80,95],'cooldown':[14,13,12,11,10,9],
            'wave':{'radius':300,'length':700,'speed':2000,'budget':9999999,'damagePerRank':500},
            'armor':{'centres':[300,600,900],'radius':300,'deltaPerRank':-10,'duration':6}},
    'A155':{'range':900,'mana':[60,65,70,75,80,85],'cooldown':[6,5.5,5,4.5,4,3],
            'refresh':5,'stackKey':'target','cap':[5,10],'unstackable':['mBOS','Abyss_BOSS','IsShopBoss'],
            'damage':'(1000+life*.05)*layers','decision':'Q71'},
    'A156':{'range':800,'mana':[50,60,70,80,90,100],'cooldown':[17,15,13,11,9,7],
            'duration':[3.5,4,4.5,5,5.5,6],'physicalFactors':[1.5,1.25],'magicResist':1,
            'isMagicImmune':False,'oneTimerPerTarget':True},
    'A157':{'range':800,'mana':200,'cooldown':20,'duration':[3,4,5,6,7,8],
            'aliveRadius':425,'deathRadius':500,'baseFactors':[1,2],'deathFactor':1.5,
            'bossExtraFactor':1,'damageType':'divine','purgeFrequency':1,
            'purge':{'steps':3,'duration':[2,1],'pause':[3,0]}},
    'A162':{'range':1300,'mana':[30,50,70,90,110,130],'cooldown':[15,14,13,12,11,10],
            'wave':{'radius':200,'length':2000,'speed':3000,'parentDamage':100,'budget':99999999},
            'attenuation':'max(0.4,1-0.1*(n-1)) per shot','rankMultiplier':[1.5,1.9,2.3,2.7,3.1,3.5],
            'speedCeiling':3},
    'A164':{'range':1200,'mana':[30,35,40,45,50,55],'cooldown':[40,36,32,28,24,20],
            'manaRecovery':[.15,.20,.25,.30,.35,.40],'goldPerUnitLevel':140,
            'bossFlatPerLevel':200,'bossLifeRatios':[.30,.10]},
}
DIFF = {
    'A127':['Workbook explicitly provides both form attack ranges, source tip rounds +204 to +200.'],
    'A134':['Q64 uses movement lock instead of T143 stun. Q72 removes original failure-time 55 second cooldown rewrite.'],
    'A155':['Q71 replaces (1000+HP*.03*layers), 4 seconds and blanket Abyss cap. Target slots isolate source -1 collision.'],
    'A156':['Workbook welfare +25% replaces source +20%. Per-target timers prevent orphan T167 from -1 slot collision.'],
    'A157':['Source ranges 360/360 vs 425/500, mana [100,120,140,160,180,200] vs 200; staff 1.6/death +.4/local Boss half superseded.'],
    'A162':['Source rank factors 14/16/18/20/22/24 superseded by workbook; attenuation stays per shot.'],
    'A164':['Dedicated tier tooltip mana recovery .15–.40 replaces source constant .5.'],
}


def object_fields(db, id, sheet='units_abilitydata'):
    obj, = index.objects(db,id,sheet)
    return obj['fields']


def evidence(db):
    lines = PROFILE.read_text().splitlines()
    _, fingerprints = json.loads(db.execute('SELECT fingerprint FROM metadata').fetchone()[0])
    for id,(module,code,expected,aux) in SKILLS.items():
        rows = [r for r in index.workbook_rows(db,id,'塔技能') if r['cells'][5]==id]
        assert [r['row'] for r in rows] == expected*2
        assert [r['cells'] for r in rows[:len(expected)]]==[r['cells'] for r in rows[len(expected):]]
        obj, = index.objects(db,id,'units_abilitydata')
        assert obj['fields']['code']==code and obj['fields']['levels']==6
        for unit in {r['cells'][1] for r in rows}:
            assert id in object_fields(db,unit,'units_unitabilities')['heroAbilList'].split(',')
        start = lines.index(f'[{id}]')+1
        functions = [tuple(r) for r in db.execute(
            'SELECT name,start_line,end_line FROM function WHERE name=? OR name LIKE ? ORDER BY start_line',
            (f'main/f{module}',f'main/f{module}/%'))]
        locations = [[r['function'],r['pc'],r['sourceLine']] for r in index.references(db,id)
                     if r['function'].startswith('main/f291/')]
        yield id, {'workbookRowsOnBoth':expected,'guideUnits':sorted({r['cells'][1] for r in rows}),
                   'playerTipStart':start,'objectIndex':obj['jsonIndex'],'entryPoints':locations,
                   'functions':functions,'hash':dict(fingerprints)[index.DISASM],'auxiliary':aux}


def object_checks(db):
    for id, form, fields in checks:
        actual = object_fields(db,id,form)
        assert all(actual.get(key)==value for key,value in fields.items()), (id,fields)
    for id, field, code, values in (
            ('T138','DataA','Iatt',[50,100,150,200,250,300]),
            ('T155','DataA','Isx1',[.7,.8,.9,1,1.1,1.2]),
            ('T156','DataA','Iatt',[300,400,500,600,700,800]),
            ('T084','DataA','Ucs1',[500,1000,1500,2000,2500,3000]),
            ('T094','DataB','Roa2',[10,20,30,40,50,60])):
        table = object_fields(db,id)
        mods = object_fields(db,id,'war3map.w3a')['mods']
        actual = [table[f'{field}{level}'] for level in range(1,5)]
        actual += [m['value'] for m in mods if m['key']==code and m['level'] in (5,6)]
        assert len(actual)==6 and all(math.isclose(a,b,rel_tol=1e-6) for a,b in zip(actual,values)), (id,actual)
    return True


checks = [
    ('A127','units_abilitydata',{'DataA1':'H036','UnitID1':'E016','Cool1':5}),
    ('H036','units_unitweapons',{'rangeN1':1200,'dmgplus1':26,'cool1':1.1,'weapTp1':'missile'}),
    ('E016','units_unitweapons',{'rangeN1':800,'dmgplus1':230,'cool1':1.2,'weapTp1':'normal'}),
    ('T143','units_abilitydata',{'code':'AHtb','BuffID1':'B134','Dur1':5,'HeroDur1':5,'DataA1':None}),
    ('T084','units_abilitydata',{'Area1':300,'DataB1':9999999,'DataC1':700,'DataD1':300}),
    ('T094','units_abilitydata',{'code':'ANht','Area1':300,'Dur1':6,'HeroDur1':6}),
    ('T167','units_abilitydata',{'code':'AIdd','DataA1':1}),
    ('T168','units_abilitydata',{'code':'AOcr','DataA1':None,'DataB1':None}),
    ('T169','units_abilitydata',{'code':'Aprg','BuffID1':'Bprg','DataA1':3,'DataD1':3,'Dur1':2,'HeroDur1':1}),
    ('T172','units_abilitydata',{'code':'AUcs','Area1':200,'DataA1':100,'DataB1':99999999,
                               'DataC1':2000,'DataD1':200}),
    ('T260','units_abilitydata',{'code':'AUcs','Area1':200,'DataA1':100,'DataB1':99999999,
                               'DataC1':2000,'DataD1':200}),
]


def source_probes(db):
    ctx = runpy.run_path(str(index.ROOT/'tools/audit-passive-growth-batch.py'))['probe_context']
    vm, world, env, caster, target, packets, _ = ctx(db, ['main/f99','main/f101','main/f106','main/f107','main/f108'])
    far = world.units[2]
    far["skills"] = {}
    env.update(CreateEffByUnit=lambda *_:None, CreateEffAtLoc=lambda *_:None,
               UnitRemoveBuffs=lambda unit,*_:unit.pop('curse',None), IsShopBoss=lambda _:False,
               SetPhyDamage=lambda s,t,n:packets.append([t['x'], n]),
               GetUnitTypeId=lambda u:u.get('type','probe'))
    caster['skills'].update(A127=3,A133=6,A156=1,A157=1)
    env['DeLuYi_XiongLingHuoBan'] = {1:far}
    env['A127_Study'](caster)
    assert [u['skills']['T138'] for u in (caster,far)]==[3,3]
    caster['skills']['A127'] = 5
    env['A127_Study'](caster)
    assert [u['skills']['T138'] for u in (caster,far)]==[5,5]
    env['A133_Action'](caster,target)
    world.advance(1)
    target['curse'] = True
    caster['skills']['A133'] = 2
    env['A133_Action'](caster,target)
    assert 'curse' not in target and target['skills']['T155']==6
    world.advance(7)
    assert 'T155' not in target['skills'] and 'T156' not in target['skills']
    env['A155_Action'](caster,target)
    env['A155_Action'](caster,far)
    assert packets==[[500,1300],[1000,1600]]
    env['A156_Action'](caster,target)
    env['A156_Action'](caster,far)
    world.advance(11)
    assert ['T167' in u['skills'] for u in (target,far)]==[True,False], (target,far,world.timers)
    area = []
    env.update(GetUnitLoc=lambda u:(u['x'],u['y']),IsUnitType=lambda *_:False,
               UnitIsHero=lambda u:u is target,
               CreateTempAndSetAbilityLv=lambda *args:{'ability':args[3]},
               SetUnitUserData=lambda u,i:u.__setitem__('userData',i),
               IssueTargetOrder=lambda *_:True,UnitDamagePoint=lambda *args:area.append(args[2:6]))
    env['A157_Action'](caster,target)
    target['life'] -= 100
    world.advance(14)
    assert area==[(360,500,0,50)]
    wave_calls = []
    caster['skills']['A152'] = 3
    env['math']['rad'] = math.radians
    env.update(AngleBetweenPoints=lambda _a,_b:0, Cos=math.cos,Sin=math.sin,
               GetUnitLoc=lambda u:{'x':u['x'],'y':u['y']},
               Location=lambda x,y:{'x':x,'y':y},SetUnitScale=lambda *_:None,
               CreateTempAndSetAbilityLv=lambda _p,loc,_f,id,level,life:
               wave_calls.append((id,(round(loc['x']),round(loc['y'])),level,life)) or {},
               IssuePointOrderLoc=lambda *_:True,IssueImmediateOrder=lambda *_:True)
    vm['execute'](vm['function']('main/f104'),[env],(lambda _:None,))
    env['A152_Action'](caster,(1000,0))
    assert wave_calls==[('T084',(0,0),3,1)]+[('T094',(x,0),3,1) for x in (300,600,900)]
    return {'A127':{'sourceHeroAndBearRanks':[3,5]},
            'A133':{'sourceLowerRankCleansedAndDidNotRefresh':True},
            'A152':{'sourceWaveAndThreeIndependentCentres':wave_calls},
            'A155':{'sourceUntouchedSecondTargetReceivedLayer2':packets[1]},
            'A156':{'sourceT167AfterBothDeadlines':[True,False]},
            'A157':{'sourceAliveBossPipeRadiusAndAmount':[360,50]}}


def selected_probes():
    def flames(target_hp, layers):
        return (target_hp*.05+1000)*layers

    def spread(delta, dead=False, staff=False):
        return (500 if dead else 425,max(delta,0)*(2 if staff else 1)*(1.5 if dead else 1))

    def powershot(base_attack,speed,level,n):
        return round(base_attack*min(speed,3)*RULES['A162']['rankMultiplier'][level-1]
                     *max(.4,1-.1*(n-1)),5)

    layer_slots = {}
    def stack(target,now,cap):
        layers,expires = layer_slots.get(target,(0,now))
        layers = min(cap,(layers if now<expires else 0)+1)
        layer_slots[target] = layers,now+5
        return layers
    independent_layers = [stack('T1',0,5),stack('T2',1,5),stack('T1',2,5),stack('T2',6,5)]
    assert independent_layers==[1,1,2,1]
    assert flames(100000,2)==12000 and flames(100000,1)==6000
    assert [spread(100,d,s) for d in (False,True) for s in (False,True)]==[(425,100),(425,200),(500,150),(500,300)]
    assert spread(-100)==(425,0)
    assert [powershot(100,4,1,n) for n in (1,2,7,9)]==[450,405,180,180]
    assert powershot(100,4,1,1)==450
    assert RULES['A134']['cooldown'][-1]-RULES['A134']['duration']==50
    return {'A134':{'rank6NaturalRemainingAtFailure':50,'savedAttackCap':15000},
            'A155':{'separateTargetLayers':independent_layers,'life100000Tier2':12000},
            'A157':{'lifeDelta100Vectors':[spread(100,d,s) for d in (False,True) for s in (False,True)]},
            'A162':{'firstSecondSeventhNinthAmounts':[450,405,180,180],'nextCastStarts450':True}}


if __name__=='__main__':
    with closing(index.connect()) as db:
        sources = dict(evidence(db))
        assert object_checks(db)
        raw = source_probes(db)
    web = selected_probes()
    records = [{'id':id,'status':'pending' if id in OPEN else 'ready','rules':RULES[id],
                'sourceRefs':sources[id],'differences':DIFF.get(id,[]),'unresolved':OPEN.get(id,[]),
                'validation':{'workbookAndObjects':True,'sourceVM':raw.get(id),'webVector':web.get(id),
                              'originalClientTested':False}}
               for id in SKILLS]
    result = json.dumps(records,ensure_ascii=False,indent=2)+'\n'
    if '--write' in sys.argv:
        OUT.write_text(result)
    else:
        assert OUT.read_text()==result
    print(json.dumps({'ready':sum(r['status']=='ready' for r in records),'pending':sorted(OPEN),
                      'sourceVM':raw,'web':web},ensure_ascii=False))
