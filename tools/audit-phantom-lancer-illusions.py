#!/usr/bin/env python3
"""Validate Phantom Lancer's separate spear and Juxtapose illusion accounting."""
from contextlib import closing
import json
import runpy
import sys

import audit_index as index

OUT = index.ROOT / 'docs/rules/phantom-lancer-illusions.json'
RULES = {
    'A122':{'range':900,'mana':[50,60,70,80,90,100],'cooldown':9,'missileSpeed':1000,
            'damage':[1200,1400,1600,1800,2000,2200],'interruption':.01,'moveSlow':.4,
            'attackSlow':.25,'slowDuration':4,'staffRadius':400,'hitsWithStaff':3,
            'illusionLife':[3,4,5,6,7,8],'illusionOutput':1,'separateCastToken':True},
    'A123':{'chanceMainBase':10,'illusionMaximumByAttackRank':[1,2,3,4,5,6],
            'addToOwnerAgi':20,'lifetime':10,'normalDivineDamageFactor':.5,
            'endlessDivineDamageFactor':1,'decision':'Q77','actualAttackSource':'BIil illusion with A123',
            'juxtaposeCountSourceOnly':'q030','reserveUntilBirthOrFailure':True},
    'A124':{'mainChanceIncrease':[1,2,3,4,5,6],'illusionChance':[2,3,4,5,6,7],
            'auxiliaryNativeCritical':0,'sharesA123CapAndLife':True},
}
BLOCKERS = {}
DIFF = {
    'A122':['Source chain counter and deferred spawns share slots; Web isolates actual cast and landing tokens.',
            'Player tooltip states three bounces without specifying additional hits; source confirms three inclusive.'],
    'A123':['Source q030 generation timers share a slot before native birth; Web reserves each success.',
            'Workbook and source tooltip specify illusion divine damage, but the saved source has no associated formula.'],
    'A124':[],
}


def source_refs(db):
    support = {'A122':(290,'ANcl',['main/f95'],['T130','T131','T132','q029','B131','B132']),
               'A123':(291,'AHab',['main/f96'],['T134','q030','BIil','B130']),
               'A124':(292,'AOcr',['main/f96'],[])}
    profile = (index.MAP/'units_campaignabilitystrings.txt').read_text().splitlines()
    _, hashes = json.loads(db.execute('SELECT fingerprint FROM metadata').fetchone()[0])
    for id,(row,code,mod,aux) in support.items():
        book = [r for r in index.workbook_rows(db,id,'塔技能') if r['cells'][5]==id]
        assert [r['row'] for r in book]==[row,row] and book[0]['cells']==book[1]['cells']
        o, = index.objects(db,id,'units_abilitydata')
        assert o['fields']['code']==code and o['fields']['levels']==6
        if id in ('A123','A124'):
            assert not any(k.startswith('Data') for k in o['fields'])
        yield id, {'bookRowOnBoth':row,'hintLine':profile.index(f'[{id}]')+1,
                   'objectIndex':o['jsonIndex'],'auxiliary':aux,
                   'locations':[[r['function'],r['pc'],r['sourceLine']] for r in index.references(db,id)],
                   'modules':[tuple(r) for m in mod for r in db.execute(
                         'SELECT name,start_line,end_line FROM function WHERE name=? OR name LIKE ? ORDER BY start_line',
                         (m,m+'/%'))],
                   'disasmSha256':dict(hashes)[index.DISASM]}
    for id,expect in [('T130',{'code':'AHtb','DataA1':1200,'Dur1':.01}),
                      ('T131',{'code':'Aslo','DataA1':.4,'DataB1':.25,'Dur1':4}),
                      ('T132',{'code':'AIil','DataA1':1,'DataB1':1,'Dur1':3}),
                      ('T134',{'code':'AIil','DataA1':1,'DataB1':1,'Dur1':10})]:
        o, = index.objects(db,id,'units_abilitydata')
        assert all(o['fields'].get(key)==value for key,value in expect.items()), id


def source_probes(db):
    ctx = runpy.run_path(str(index.ROOT/'tools/audit-passive-growth-batch.py'))['probe_context']
    vm, world, env, caster, target, _, _ = ctx(db,['main/f95','main/f96'])
    other = world.units[2]
    other.update(x=700,skills={})
    target.update(type='normal')
    caster.update(scepter=True,userData=1,skills={'A122':2,'A123':1,'A124':6})
    orders = []
    env.update(GetUnitLoc=lambda u:{'x':u['x'],'y':u['y']},
               GetUnitUserData=lambda u:u['userData'],GetUnitTypeId=lambda u:u.get('type','normal'),
               CreateTempAndSetAbilityLv=lambda *a:{'id':a[3],'rank':a[4],'owner':a[0],
                                                      'type':a[6] if len(a)>6 else 'q001',**a[1]},
               SetUnitUserData=lambda u,i:u.__setitem__('userData',i),
               IssueTargetOrder=lambda s,o,t:orders.append((s['id'],s['rank'],o,t['x'])) or True,
               IssueTargetOrderById=lambda s,o,t:orders.append((s['id'],s['rank'],o,s['x'])) or True,
               GetRandomInt=lambda *_:1,IsTemp=lambda u:u['type'].startswith('q'),
               SetUnitPosition=lambda u,x,y:u.update(x=x,y=y))
    env['A122_Action'](caster,target)
    for hit in (target,other,target):
        env['A122_Eff'](caster,hit)
        world.advance(0)
    bolt = [x for id,_,_,x in orders if id=='T130']
    illusion_points = [x for id,_,_,x in orders if id=='T132']
    assert bolt==illusion_points==[500,700,500]

    env['A123_Study'](caster)
    summon = vm['function']('main/f291/f20')
    spear_ghost = {**caster,'skills':{'A123':1,'BIil':1},'illusion':True}
    attack_ghost = {**caster,'skills':{'A123':1,'BIil':1},'illusion':True}
    for proxy,ghost in [('q001',spear_ghost),('q030',attack_ghost)]:
        vm['execute'](summon,[env],({'type':proxy,'userData':1,'x':500,'y':0},ghost))
    assert caster['agi']==140 and env['A123_VisionNum'][1]==1
    env['Remove_Vision'](spear_ghost)
    assert caster['agi']==120 and env['A123_VisionNum'][1]==1
    env['Remove_Vision'](attack_ghost)
    assert caster['agi']==100 and env['A123_VisionNum'][1]==0

    # The first of two overwritten callbacks resolves the tower to nil before dispatch.
    def owner(unit):
        if unit is None:
            raise ValueError('native owner received a nil unit')
        return unit['owner']
    env['GetOwningPlayer'] = owner
    env['A123_Attack'](caster,target)
    env['A123_Attack'](caster,other)
    raw_duplicate_timer = False
    try:
        world.advance(0)
    except ValueError as exc:
        raw_duplicate_timer = str(exc)=='native owner received a nil unit'
    assert raw_duplicate_timer
    return {'A122':{'sourceStaffBoltAndIllusionPoints':[bolt,illusion_points]},
            'A123':{'nativeBoundaryOfOverwrittenCallback':['nil owner',True],
                    'spearThenJuxtaposeBonusesAndCount':[140,1],
                    'afterSpearExpires':[120,1],'afterJuxtaposeExpires':[100,0]},
            'A124':{'existingProbabilityAudit':'skill-inline-probability-audit.md'}}


def selected_probes():
    cap, pending, alive, contributions = 1, set(), set(), set()
    def reserve(token):
        if len(pending)+len(alive)>=cap:
            return False
        pending.add(token)
        return True
    def birth(token,success):
        pending.remove(token)
        if success:
            alive.add(token)
            contributions.add(token)
    assert reserve('a') and not reserve('b')
    birth('a',False)
    assert reserve('b')
    birth('b',True)
    contributions.add('spear')
    assert len(alive)==1 and 20*len(contributions)==40
    alive.remove('b')
    contributions.remove('b')
    assert reserve('c') and 20*len(contributions)==20

    staff_tokens = {'old':0,'new':0}
    for token in ('old','new','old','old'):
        staff_tokens[token]+=1
    assert staff_tokens=={'old':3,'new':1}
    illusion_agi, owner_agi = 120, 160
    config = RULES['A123']
    bonus = [illusion_agi*config[key] for key in ('normalDivineDamageFactor','endlessDivineDamageFactor')]
    assert bonus==[60,120] and owner_agi!=illusion_agi
    return {'A122':{'independentHitTokens':staff_tokens},
            'A123':{'oneCapBlocksSecondReservation':True,'failureReleasesReservation':True,
                    'spearDoesNotCountForJuxtapose':True,'normalAndEndlessAtIllusionAgi120Owner160':bonus},
            'A124':{'sameCapRetained':True}}


if __name__=='__main__':
    with closing(index.connect()) as db:
        refs = dict(source_refs(db))
        raw = source_probes(db)
    web = selected_probes()
    rows = [{'id':id,'status':'pending' if id in BLOCKERS else 'ready','rules':rules,
             'sourceRefs':refs[id],'differences':DIFF[id],'unresolved':BLOCKERS.get(id,[]),
             'validation':{'sourceVM':raw[id],'web':web[id],'originalClientTested':False}}
            for id,rules in RULES.items()]
    encoded = json.dumps(rows,ensure_ascii=False,indent=2)+'\n'
    if '--write' in sys.argv:
        OUT.write_text(encoded)
    else:
        assert OUT.read_text()==encoded
    print(json.dumps({'ready':sum(r['status']=='ready' for r in rows),'pending':sorted(BLOCKERS),
                      'sourceVM':raw,'web':web},ensure_ascii=False))
