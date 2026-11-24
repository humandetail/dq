#!/usr/bin/env python3
"""Validate the scoped Quill Spray/Warpath source and selected Web boundaries."""
from contextlib import closing
import json
import runpy
import sys

import audit_index as index

OUT = index.ROOT / 'docs/rules/quill-spray-and-warpath.json'
CAPS = [4,5,6,7,8,10,12]


def source_refs(db):
    profile = (index.MAP/'units_campaignabilitystrings.txt').read_text().splitlines()
    refs = {}
    for ability, row, token in [('A182',186,'多个刚被的针刺效果不叠加'),
                                ('A183',187,'当受击单位达到12层')]:
        book = [r for r in index.workbook_rows(db,ability,'塔技能') if r['cells'][5]==ability]
        assert [r['row'] for r in book]==[row,row] and book[0]['cells']==book[1]['cells']
        assert ('伤害类型 物理伤害' if ability=='A182' else '每30点智力') in book[0]['cells'][8]
        start = profile.index(f'[{ability}]')
        hint = next(i for i in range(start+1,start+20) if profile[i].startswith('Ubertip='))
        assert token in profile[hint]
        obj, = index.objects(db,ability,'units_abilitydata')
        w3a = index.objects(db,ability,'war3map.w3a')
        refs[ability] = {'workbookRowOnBoth':row,'hintLine':hint+1,
                         'objectIndex':obj['jsonIndex'],'w3aIndexes':[r['jsonIndex'] for r in w3a]}
        if ability=='A182':
            assert (obj['fields']['DataA1'],obj['fields']['DataB1'])==(1,1)
            assert [m['value'] for m in w3a[0]['fields']['mods']]==[60.,70.]
        else:
            assert [obj['fields'][f'DataA{n}'] for n in range(1,5)]==[10.]*4
            assert not w3a

    units, = index.objects(db,'H047','units_unitabilities')
    weapon, = index.objects(db,'H047','units_unitweapons')
    t197, = index.objects(db,'T197','units_abilitydata')
    assert {'A182','A183'} <= set(units['fields']['heroAbilList'].split(','))
    assert 'Avul' in units['fields']['abilList'].split(',')
    assert (weapon['fields']['castpt'],weapon['fields']['castbsw'])==(.4,.1)
    assert [t197['fields'][key] for key in ('DataA1','Dur1','HeroDur1','Cool1','Rng1','Cost1')]==[
        10,1,1,.1,9999,0]
    refs['H047'] = {'unitAbilityIndex':units['jsonIndex'],'weaponIndex':weapon['jsonIndex']}
    refs['T197'] = {'objectIndex':t197['jsonIndex'],'hintHeader':profile.index('[T197]')+1}
    refs['luaModule'] = [list(row) for row in db.execute(
        "SELECT name,start_line,end_line FROM function WHERE name='main/f130' OR name LIKE 'main/f130/%' "
        'ORDER BY start_line')]
    refs['routing'] = {name:[{key:r[key] for key in ('function','pc','sourceLine')}
                             for r in index.references(db,name)]
                       for name in ('A182','A183','T197','A182_Action')}
    _, hashes = json.loads(db.execute('SELECT fingerprint FROM metadata').fetchone()[0])
    refs['disasmSha256'] = dict(hashes)[index.DISASM]
    return refs


def original_probes(db):
    prior = runpy.run_path(str(index.ROOT/'tools/audit-passive-growth-batch.py'))
    context = prior['probe_context']
    _, _, env, caster, _, packets, _ = context(db,['main/f130'])
    thresholds = prior['quill_source_probe'](env,caster,packets)
    _, world, env, caster, _, packets, _ = context(db,['main/f130'])
    caster.update(slot=1,skills={'A182':1},str=100,agi=100,int=100)
    peer = {**caster,'slot':2}
    env['GetUnitUserData'] = lambda unit:unit['slot']
    native = env['UnitDamageTarget']
    env['UnitDamageTarget'] = lambda *_:False
    env['A182_Action'](caster)
    assert not packets
    env['UnitDamageTarget'] = native
    world.advance(1)
    env['A182_Action'](caster)
    env['A182_Action'](peer)
    assert [entry[2] for entry in packets]==[600,300]
    world.advance(9)
    env['A182_Action'](caster)
    assert packets[-1][2]==300
    return {'thresholds':thresholds,'baseAmount':300,'physicalAfterRejectedAttempt':600,
            'independentPeerFirst':300,'resetAtOriginalExpiry':300}


def selected_probes():
    state = {}
    def hit(source,target,rank,now,settled_damage):
        key = source,target
        current, _ = state.get(key,(0,None))
        next_stack = min(current+1,CAPS[rank])
        if settled_damage > 0:
            state[key] = next_stack,now+8
        return 300*next_stack

    assert hit('hero1','target',0,0,0)==300 and not state
    assert hit('hero1','target',0,1,250)==300
    assert hit('hero1','target',0,2,0)==600 and state['hero1','target']==(1,9)
    assert hit('hero2','target',0,3,250)==300
    assert hit('hero1','target2',0,4,250)==300
    for key in [key for key,(_,deadline) in state.items() if deadline<=9]:
        del state[key]
    assert hit('hero1','target',0,9,250)==300
    assert state['hero2','target']==(1,11) and state['hero1','target2']==(1,12)

    amounts = [10000*(4+i//30)//100 for i in (29,30,119,120)]
    assert amounts==[400,500,700,800] and amounts[-1]//4==200
    assert 1999 < .2*10000 and not 2000 < .2*10000  # strict execute boundary
    return {'sourceAndReceiverIsolated':True,'failedHitNeverCommitsOrRefreshes':True,
            'onePositiveBaseHitAfterFailure':300,'returnedToFirstAtExpiry':300,
            'twelveStackAmountsAt29_30_119_120':amounts,'abyssHeroAt120':200,
            'tenStackStrictThreshold':[1999,2000]}


if __name__=='__main__':
    with closing(index.connect()) as db:
        refs = source_refs(db)
        original = original_probes(db)
    report = {
        'scope':'quill-spray-and-warpath', 'ready':2, 'pending':0,
        'records': [
            {'id':'A182','status':'ready',
             'rules':{'mana':[20,30,40,50,60,70],'cooldown':2,'castPoint':.4,'backswing':.1,
                      'radius':800,'stackTimeout':8,'baseCap':4,'order':'fanofknives',
                      'autoTargetSearch':False,'magicShellDamage':0,'physicalDamageFlags':[False,False,'HERO','NORMAL'],
                      'positiveSettledDamageCommitsStack':True},
             'sourceRefs':['A182','H047','luaModule','routing'],
             'differences':['Original AEfk damage/budget fields 1/1; Web command shell serves quoted physical mechanic under Q64',
                            'Original commits before native rejection; Q64 keeps speculative stack until final positive damage'],
             'unresolved':[],'validation':['source rejection','selected rejection and expiry','source/caster identity']},
            {'id':'A183','status':'ready',
             'rules':{'caps':CAPS[1:],'strengthMayTieForMaximum':True,'thresholds':[5,7,10,12],
                      'stunSeconds':1,'T197MagicDamage':10,'executeThreshold':.2,'tenStackCurrentLifeFactor':.3,
                      'twelveStackBasePercent':4,'intelligencePerPercent':30,'abyssHeroFactor':.25,
                      'nativeEvasion':0,'decision':'Q65'},
             'sourceRefs':['A183','H047','T197','luaModule','routing'],
             'differences':['A183 AEev 10.0 source evidence; Q65 selects no native evasion',
                            'Graph uses intelligence/30 at twelve stacks, source intelligence/50'],
             'unresolved':[],'validation':['source 5/7/10/12/13 casts','threshold and intelligence boundary']},
        ],
        'sourceRefs':refs,'auxiliary':['T197','q001','q025','BPSE','N535'],
        'validation':{'originalVM':original,'selectedWeb':selected_probes(),'originalClientTested':False},
    }
    rendered = json.dumps(report,ensure_ascii=False,indent=2)+'\n'
    if '--write' in sys.argv:
        OUT.write_text(rendered)
    else:
        assert OUT.read_text()==rendered
    print(json.dumps(report['validation'],ensure_ascii=False))
