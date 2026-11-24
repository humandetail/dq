#!/usr/bin/env python3
"""Validate A166 source lifecycle and the selected Web Doom boundaries."""
from contextlib import closing
import json
import math
import runpy
import sys

import audit_index as index

OUT = index.ROOT/'docs/rules/doom.json'
PASSIVES = ['N524','T017','N533','N535','N579','N536','N525']
MANA = [170,190,210,230,250,270]
DAMAGE = [2000,2500,3000,3500,4000,5000]
COOLDOWN = [17,16,15,14,13,12]


def evidence(db):
    rows = [r for r in index.workbook_rows(db,'A166','塔技能') if r['cells'][5]=='A166']
    assert [r['row'] for r in rows]==[62,67,62,67]
    assert [r['cells'] for r in rows[:2]]==[r['cells'] for r in rows[2:]]
    ability, = index.objects(db,'A166','units_abilitydata')
    stock, = index.objects(db,'ANdo','units_abilitydata')
    w3a, = index.objects(db,'A166','war3map.w3a')
    assert ability['fields']['code']=='ANdo'
    assert ability['fields']['UnitID1']==stock['fields']['UnitID1']=='nba2'
    assert not any(k.startswith(('DataB','DataC')) for k in ability['fields'])
    assert {x['key'] for x in w3a['fields']['mods']}=={'acdn','amcs','Ndo1'}
    assert [stock['fields'][k] for k in ('DataB1','DataC1')]==[1,120.]
    for slk, override, expected in [('Cost','amcs',MANA),('DataA','Ndo1',DAMAGE),
                                    ('Cool','acdn',COOLDOWN)]:
        base = [ability['fields'][f'{slk}{level}'] for level in range(1,5)]
        overrides = {mod['level']:mod['value'] for mod in w3a['fields']['mods'] if mod['key']==override}
        assert base+[overrides[5],overrides[6]]==expected
    for level in range(1,5):
        assert ability['fields'][f'BuffID{level}']=='B151'
        assert ability['fields'][f'Dur{level}']==ability['fields'][f'HeroDur{level}']==10
        assert ability['fields'][f'Rng{level}']==800
        assert set(ability['fields'][f'targs{level}'].split(','))=={
            'air','enemies','ground','neutral','sapper','organic'}
    marker, = index.objects(db,'T176','units_abilitydata')
    assert marker['fields']['code']=='AHad' and marker['fields']['targs1']=='none'
    assert not any(key.startswith('DataA') for key in marker['fields'])
    for passive in PASSIVES:
        data, = index.objects(db,passive,'units_abilitydata')
        assert data['fields']['levels']==1
    for boss in ('m521','m522','m523','mw04'):
        skills, = index.objects(db,boss,'units_unitabilities')
        balance, = index.objects(db,boss,'units_unitbalance')
        assert 'N534' in skills['fields']['abilList'].split(',')
        assert 'sapper' not in balance['fields'].get('type','').split(',')
    boss_templates = []
    immune_ids = {'ACm2','ACm3','ACmi','AImx','Amim','T060'}
    for id, fields in db.execute(
            "SELECT object_id,fields FROM object_row WHERE source LIKE '%/units_unitabilities.json' "
            "AND fields LIKE '%N534%'"):
        skills = set(json.loads(fields)['abilList'].split(','))
        balance = index.objects(db,id,'units_unitbalance')
        if 'N534' in skills and balance and 'sapper' in balance[0]['fields'].get('type','').split(','):
            assert not skills & immune_ids
            boss_templates.append(id)
    assert 'mBOS' in boss_templates and 'mw14' in boss_templates
    _, hashes = json.loads(db.execute('SELECT fingerprint FROM metadata').fetchone()[0])
    return {'workbookRowsOnBoth':[62,67],
            'objectIndex':ability['jsonIndex'],'w3aIndex':w3a['jsonIndex'],
            'hintLine':2387,'buffLine':917,'n534BossesWithoutSapper':['m521','m522','m523','mw04'],
            'bossTemplateCountWithoutAmim':len(boss_templates),
            'disasmSha256':dict(hashes)[index.DISASM],
            'moduleRanges':[list(row) for row in db.execute(
                "SELECT name,start_line,end_line FROM function WHERE name='main/f117' OR name LIKE 'main/f117/%' ORDER BY start_line")],
            'effect':['main/f291/f14',1071,1080],'auto':['main/f291/f27',2543,2572],
            'endless':['main/f291/f1',3742,3806],'mapBoss':['main/f7/f45',1,16]}


def source_probes(db):
    support = runpy.run_path(str(index.ROOT/'tools/audit-passive-growth-batch.py'))
    vm, world, env, caster, target, _, _ = support['probe_context'](db,['main/f117'])
    caster.update(scepter=True,type='H042',skills={'A166':2})
    target['skills'] = {id:1 for id in [*PASSIVES,'OTHER']}
    target['skills']['N524'] = 3
    target['skills']['N535'] = 2
    env.update(Game_Mode=1,CreateEffByUnit=lambda *_:None)
    env['A166_Action'](caster,target)
    assert set(target['skills'])=={'OTHER','T176'}
    previous = world.timers[-1]
    world.advance(4)
    caster['scepter'] = False
    env['A166_Action'](caster,target)
    assert not previous['running'] and 'T176' not in target['skills']
    assert all(target['skills'][id]==1 for id in PASSIVES)
    world.advance(14)

    caster['scepter'] = True
    env['Game_Mode'] = 2
    env['A166_Action'](caster,target)
    assert all(target['skills'][id]==1 for id in PASSIVES) and 'T176' not in target['skills']
    world.advance(24)
    env['Game_Mode'] = 1
    env['A166_Action'](caster,target)
    target['life'] = 0
    world.advance(34)
    assert target['skills']=={'OTHER':1}

    factors = []
    target['skills']['T176'] = 1
    env.update(GetUnitTypeId=lambda unit:unit['type'],isMagicDamage=lambda dt:dt=='magic',
               isPhyDamage=lambda dt:dt=='normal',EndLess_Damage_Magic=3.2,
               EndLess_Damage_Phy=1.8,EndLess_Damage_Other=1.2)
    native = {'GetEventDamage':lambda _:100,'EXGetEventDamageData':lambda _:'magic',
              'EXSetEventDamage':factors.append}
    program = vm['function']('main/f291/f1')
    for r in (68.44,5.32):
        env['EndLess_Damage_Reduce'] = r
        vm['execute'](program,[env,native],(caster,target,caster),start_pc=3742,stop_pc=3806)
    assert all(math.isclose(value,expected) for value,expected in zip(factors,(320,42.56)))
    vm['execute'](program,[env,native],({'type':'q025'},target,caster),start_pc=3742,stop_pc=3806)
    assert len(factors)==2
    boss = vm['function']('main/f7/f45')
    env.update(IsUnitType=lambda unit,kind:kind in unit['types'],UNIT_TYPE_SAPPER='sapper')
    bosses = []
    for tagged,sapper in [(True,True),(True,False),(False,True),(False,False)]:
        unit = {'skills':{'N534':1} if tagged else {},'types':{'sapper'} if sapper else set()}
        bosses.append(vm['execute'](boss,[env],(unit,)))
    assert bosses==[True,False,False,False]
    return {'sourceRestoredSyntheticRanksAtRecast':[1,1],'oldTimerCancelled':True,
            'noScepterBlockInAbyss':True,'sourceDeadTargetIsNotRestored':True,
            'sourceModeA100And300Magic':[round(value,4) for value in factors],
            'q025BypassesEndless':True,'mapBossCasesN534AndSapper':bosses}


def selected_probes():
    state = {'shieldReady':0,'doom':None,'suppressed':set()}
    def cast(token,now,scepter,game_mode):
        if now>=state['shieldReady'] and 'N535' not in state['suppressed']:
            state['shieldReady'] = now+6
            return False
        state['doom'] = (token,now+10)
        state['suppressed'] = set(PASSIVES) if scepter and game_mode!=2 else set()
        return True
    def end(token):
        if state['doom'] and state['doom'][0]==token:
            state['doom'] = None
            state['suppressed'].clear()

    assert not cast('blocked',0,True,1) and state['doom'] is None
    assert cast('staff',1,True,1) and 'N535' in state['suppressed']
    assert cast('unarmed',2,False,1) and not state['suppressed']
    end('staff')
    assert state['doom']==('unarmed',12)
    assert not cast('late',6,True,1) and state['doom']==('unarmed',12)
    end('unarmed')
    assert cast('abyss',9,True,2) and not state['suppressed']

    at100 = (100-0.3156*100)/100
    at300 = 5.32/100
    actual = [round(min(2.5*r,1),4) for r in (at100,at300)]
    def endless_damage(damage,r,kind,doomed=False,mode=1,source_type='H042'):
        if mode!=1 or source_type=='q025':
            return damage
        remaining = 1-(1-r)/2 if doomed else r
        return round(damage*remaining*{'phy':1.8,'magic':3.2,'other':1.2}[kind],4)

    assert actual==[1,.133]
    chosen = [endless_damage(100,r,'magic',True) for r in (at100,at300)]
    assert chosen==[269.504,168.512]
    assert endless_damage(100,at300,'magic')==17.024
    assert endless_damage(100,at300,'phy',True)==94.788
    assert endless_damage(100,at300,'other',True)==63.192
    assert endless_damage(100,at300,'magic',True,mode=2)==100
    assert endless_damage(100,at300,'magic',True,source_type='q025')==100
    assert endless_damage(100,.0001,'magic',True)==160.016
    first = {'born':0,'expires':10,'damage':2000}
    replacement = {'born':4.5,'expires':14.5,'damage':3500}
    first_ticks = [[first['born']+n,first['damage']] for n in range(1,11) if first['born']+n<4.5]
    second_ticks = [[replacement['born']+n,replacement['damage']] for n in range(1,11)]
    assert len(first_ticks)==4 and len(second_ticks)==10 and second_ticks[-1]==[14.5,3500]
    return {'shieldStopsBeforeSuppression':True,'replacementAndStaleEnd':True,
            'scepterModeGate':True,'sourceMultiplierBeforeType':actual,'webModeA100And300Magic':chosen,
            'webLowestRMagic':160.016,'q025AndModeBypass':True,
            'recastPulses':[len(first_ticks),len(second_ticks)],'replacementLastPulse':second_ticks[-1]}


if __name__=='__main__':
    with closing(index.connect()) as db:
        refs = evidence(db)
        source = source_probes(db)
    report = {
        'id':'A166','status':'ready',
        'rules':{'duration':10,'radius':800,'maxTargets':1,'mana':MANA,
                 'damagePerTick':DAMAGE,'cooldown':COOLDOWN,
                 'spec':'doom.md','nativeDeathSummons':0,'shieldFirst':True,'bossPredicate':'N534 and SAPPER',
                 'magicImmuneBossStatusAllowed':True,'damageGate':'B03',
                 'endlessT176':{'decision':'Q67','formula':'D*(1-(1-r)/2)*k','r':'EndLess_Damage_Reduce/100',
                                'mode':1,'skipSource':'q025','k':{'phy':1.8,'magic':3.2,'other':1.2}}},
        'sourceRefs':refs,
        'differences':['Source has nba2 unit type but no explicit summon count or duration; Q24 count 0',
                       'Map Boss original predicate requires both mounted N534 and native SAPPER',
                       'Source outright removes seven ability IDs and re-adds at nominal rank 1; selected control is temporary suppression',
                       'Source T176 multiplies remaining damage by min(2.5,1/r); Q67 halves the current damage reduction rate'],
        'unresolved':[],
        'auxiliary':['T176','B151','nba2',*PASSIVES],
        'validation':{'sourceVM':source,'selectedAndComparison':selected_probes(),'originalClientTested':False}
    }
    encoded = json.dumps(report,ensure_ascii=False,indent=2)+'\n'
    if '--write' in sys.argv:
        OUT.write_text(encoded)
    else:
        assert OUT.read_text()==encoded
    print(json.dumps(report['validation'],ensure_ascii=False))
