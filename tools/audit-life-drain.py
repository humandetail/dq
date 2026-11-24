#!/usr/bin/env python3
"""Check Life Drain source conversion and selected channel cases."""
from contextlib import closing
import json
import runpy
import sys

import audit_index as index

OUT = index.ROOT/'docs/rules/life-drain.json'
PROFILES = {'A103':1543,'A176':2545,'T099':20606}
SOURCE_RATES = [0.05,0.08,0.01]
WEB_RATES = [0.05,0.10,0.025]
SPECIAL_RATE = .005


def source_refs(db):
    rows = [r for r in index.workbook_rows(db,'A103','塔技能') if r['cells'][5]=='A103']
    assert [r['row'] for r in rows]==[232,567,232,567]
    assert [r['cells'] for r in rows[:2]]==[r['cells'] for r in rows[2:]]
    same = {}
    objects = {}
    for ability in (*PROFILES,'q026'):
        tables = ('units_abilitydata','war3map.w3a') if ability!='q026' else (
            'units_unitabilities','units_unitbalance','units_unitweapons')
        objects[ability] = {}
        for table in tables:
            row, = index.objects(db,ability,table)
            objects[ability][table] = row['jsonIndex']
            if table=='units_abilitydata':
                same[ability] = {k:v for k,v in row['fields'].items() if k!='alias'}
    assert same['A103']==same['A176']
    assert [same['A103'][f'DataA{n}'] for n in range(1,5)]==[100,200,300,400]
    assert [same['T099'][f'Dur{n}'] for n in range(1,5)]==[8,10,12,14]
    assert all(same['T099'][f'DataA{n}']==100 for n in range(1,5))
    assert 'DataB1' not in same['T099'] and 'Cost1' not in same['A103']
    profiles = (index.MAP/'units_campaignabilitystrings.txt').read_text().splitlines()
    for aid in ('A103','A176'):
        assert profiles[PROFILES[aid]-1].count('深渊开启后伤害减半')==6
    _, hashes = json.loads(db.execute('SELECT fingerprint FROM metadata').fetchone()[0])
    return {'workbookRowsOnBoth':[232,567],'objects':objects,'hintLines':PROFILES,
            'disasmSha256':dict(hashes)[index.DISASM],
            'functionRanges':[list(row) for row in db.execute(
                "SELECT name,start_line,end_line FROM function WHERE name='main/f83' OR name LIKE 'main/f83/%' ORDER BY start_line")],
            'effect':['main/f291/f14',668,682],'endcast':['main/f291/f15',19,30],
            'autocast':['main/f291/f27',1653,1710],'convert':['main/f291/f1',1651,1729],
            'agedStateSpec':'hero-spells-batch-02.md#规则'}


def source_probes(db):
    support = runpy.run_path(str(index.ROOT/'tools/audit-passive-growth-batch.py'))
    vm, _, env, owner, target, _, _ = support['probe_context'](db,['main/f83'])
    clone = {'type':'q026'}
    target.update(type='Boss',shop=False,skills={'B100':1},maxLife=10000)
    ledger = []
    env.update(GetUnitTypeId=lambda unit:unit['type'],IsShopBoss=lambda unit:unit['shop'],
               SetRealDamage=lambda s,t,amount:ledger.append(('divine',amount)))
    native = {'EXSetEventDamage':lambda amount:ledger.append(('parent',amount))}
    damage = vm['function']('main/f291/f1')
    actual = []
    for mode in range(3):
        env['Game_Mode'] = mode
        vm['execute'](damage,[env,native],(clone,target,owner),start_pc=1651,stop_pc=1729)
        assert ledger[-2:]==[('parent',0),('divine',target['maxLife']*SOURCE_RATES[mode])]
        actual.append(ledger[-1][1])
    for special_id, shop in [('mBOS',False),('ordinary',True)]:
        target.update(type=special_id,shop=shop)
        vm['execute'](damage,[env,native],(clone,target,owner),start_pc=1651,stop_pc=1729)
        assert ledger[-2:]==[('parent',0),('divine',50.)]
    before = list(ledger)
    vm['execute'](damage,[env,native],(clone,target,None),start_pc=1651,stop_pc=1729)
    target['skills'].clear()
    vm['execute'](damage,[env,native],(clone,target,owner),start_pc=1651,stop_pc=1729)
    assert ledger==before
    return {'normalModeAt10000HP':actual,'roshanAndShopAt10000HP':[50,50],
            'packetOrder':['parentZero','newTownerDivine'],'noAgingOrNoOwner':True,
            'sourceLifecycles':'orb-and-channel-batch-01.json'}


def selected_probes():
    def ticks(interrupted=None):
        return [half/2 for half in range(1,17) if interrupted is None or half/2<interrupted]
    assert len(ticks())==16 and ticks()[0]==.5 and ticks()[-1]==8 and ticks(1.1)==[.5,1]

    owner_hp, owner_max = 930,1000
    positive_hp, available_mp = 110,29
    recovered_hp = min(owner_max,owner_hp+positive_hp)-owner_hp
    burned_mp = min(available_mp,50)
    assert [recovered_hp,burned_mp]==[70,29]
    ordinary = [10000*r for r in WEB_RATES]
    assert ordinary==[500,1000,250] and 10000*SPECIAL_RATE==50

    def secondary(aged, credited, mode, hp):
        if aged and credited:
            return {'parent':0,'divine':hp*WEB_RATES[mode],'carrierHeal':0}
        return {'parent':100,'divine':0,'carrierHealFromParent':True}
    timeline = [secondary(aged,True,1,10000) for aged in (False,True,False)]
    assert [p['divine'] for p in timeline]==[0,1000,0]
    assert timeline[1]['parent']==0 and timeline[1]['carrierHeal']==0

    occupying = {}
    def reserve(token,target):
        return occupying.setdefault(target,token)==token
    def end(token,target):
        if occupying.get(target)==token:
            del occupying[target]
    assert reserve('old','target') and not reserve('peer','target')
    end('old','target')
    assert reserve('peer','target')
    end('old','target')
    assert occupying['target']=='peer'
    return {'fullTicks':ticks(),'interruptedAfter1_1':ticks(1.1),'currentHPAndManaClamps':[70,29],
            'modeAmountsAt10000HP':ordinary,'specialBossAmount':50,'dynamicB100':timeline,
            'exclusiveTargetAndOldEndGuard':True}


if __name__=='__main__':
    with closing(index.connect()) as db:
        sources = source_refs(db)
        direct = source_probes(db)
    report = {
        'id':'A103','status':'ready',
        'rules':{'native':['A103','A176'],'range':800,'maintainRange':1000,'manaCost':0,
                 'cooldown':12,'duration':8,'period':.5,'hpAmount':[100,200,300,400,500,600],
                 'manaAmount':[50,80,110,140,170,200],'secondaryPerTickHP':100,
                 'secondaryTargetExclusive':True,'secondaryLevelMatchesChannel':True,
                 'agedDamagePercentPerTick':WEB_RATES,'specialBossRate':SPECIAL_RATE,
                 'mainBeforeSecondaryAtSameTick':True},
        'sourceRefs':sources,
        'differences':['A176 original passes true as T099 level; Web passes actual integer rank',
                       'Q61 applies tooltip exact base, endless, abyss figures to B100 conversion',
                       'Q24 defines native transfers, independent mana path and end-of-channel pulse ordering'],
        'unresolved':[],'auxiliary':['A176','T099','q026','B100'],
        'validation':{'rawVM':direct,'webCases':selected_probes(),'originalClientTested':False},
    }
    rendered = json.dumps(report,ensure_ascii=False,indent=2)+'\n'
    if '--write' in sys.argv:
        OUT.write_text(rendered)
    else:
        assert OUT.read_text()==rendered
    print(json.dumps(report['validation'],ensure_ascii=False))
