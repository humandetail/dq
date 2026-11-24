#!/usr/bin/env python3
"""Check source controls and original Spirit Bear slot transitions."""
from contextlib import closing
import json
import math
import runpy
import sys

import audit_index as index

OUT = index.ROOT / 'docs/rules/spirit-bear.json'


def world_for_probes():
    support = runpy.run_path(str(index.ROOT / 'tools/audit-zeus-skills.py'))
    world = support['Probe']()
    env = world.env
    hero = world.tower(1, intelligence=100, agility=100, strength=100, items={'i310'})
    log = []
    thrown = []
    writes = []

    def drop(unit, slot):
        item = unit['inventory'].pop(slot, None)
        log.append(('drop', unit['serial'], slot, item))
        return item

    def pickup(unit, item):
        empty = next((slot for slot in range(6) if slot not in unit['inventory']), None)
        log.append(('pickup-attempt', unit['serial'], item))
        if empty is not None:
            unit['inventory'][empty] = item
            return True
        thrown.append(item)
        return False

    def state_set(unit, key, value):
        writes.append((unit and unit['serial'], key, value))
        if unit is not None:
            unit[key] = value

    env.update(
        IssueImmediateOrder=lambda unit, order:log.append(('order',unit['serial'],order)),
        UnitAddItem=pickup, UnitRemoveItemFromSlot=drop,
        UnitRemoveAbility=lambda unit, code:unit['skills'].pop(code,None) if unit else None,
        RemoveUnit=lambda unit:log.append(('remove',unit['serial'])),
        DropAllItemUnit=lambda unit:log.append(('drop-all',unit and unit['serial'])),
        ConvertUnitState=lambda key:key, SetUnitState=state_set,
        Has_A_Item=lambda unit:bool(unit and 'i310' in unit['items']),
        GetHeroStr=lambda u,_:u.get('strength',0) if u else 0,
        GetHeroAgi=lambda u,_:u.get('agility',0) if u else 0,
    )
    env['math']['floor'] = math.floor
    for module in ('main/f97','main/f99','main/f182'):
        support['execute'](support['function'](module),[env])
    return world, hero, log, thrown, writes, support


def make_bear(world, kind='n255', inventory=None):
    bear = world.unit(kind, owner=0, inventory=inventory or {})
    bear[18] = (int(kind[1:]) - 254) * 42
    bear[37] = 1.2
    return bear


def original_probes():
    world, hero, log, thrown, writes, support = world_for_probes()
    env = world.env
    old = make_bear(world, inventory={0:'itemA',3:'itemB',5:'itemC'})
    env['A125_Action'](old,1)
    world.advance(1)
    assert old[18] == 252 and old[37] == 1
    env['A125_Remove'](old)
    assert [entry[2] for entry in log if entry[0] == 'drop'] == list(range(6))
    assert not env['DeLuYi_XiongLingHuoBan'] and world.timers[0]['running']
    world.advance(2)
    assert (None,18,210) in writes and (None,37,-.2) in writes
    new = make_bear(world, 'n256', {slot:f'preexisting-{slot}' for slot in range(5)})
    env['A125_Action'](new,1)
    assert new['inventory'][5] == 'itemA' and thrown == ['itemB','itemC']
    assert [entry[2] for entry in log if entry[0] == 'pickup-attempt'] == ['itemA','itemB','itemC']
    assert not world.timers[0]['running'] and world.timers[1]['running']
    world.advance(3)
    assert new[18] == 84 and new[37] == 1.2  # stale source bookkeeping suppresses both writes
    hero['items'].clear()
    world.advance(4)
    assert new[37] == 1.4  # restores an amount that was never applied to this bearer
    env['A125_time_end'](hero)
    assert not world.timers[-1]['running'] and not env['DeLuYi_XiongLingHuoBan']
    assert log[-1] == ('drop-all',new['serial'])

    world, hero, log, _, _, support = world_for_probes()
    env = world.env
    a, b = make_bear(world), make_bear(world,'n260')
    env['A125_Action'](a,1)
    env['A125_Action'](b,1)
    assert log == [('order',a['serial'],'manashieldon'), ('order',b['serial'],'manashieldon'),
                   ('remove',a['serial'])]
    assert not world.timers[0]['running'] and env['DeLuYi_XiongLingHuoBan'][1] is b

    target = world.unit(x=200)
    target['life'] = 100
    env.update(GetTriggerUnit=lambda:target, GetRandomInt=lambda lo,hi:10)
    a['skills']['N136'] = 1
    env['N136_Action'](a)
    assert world.issued[-1][2:] == ('ensnare',target['serial'],{'T141':1},1)
    env['N136_Action'](a)
    assert len(world.issued) == 1
    world.advance(1.5)
    b['skills']['N137'] = 1
    env['GetRandomInt'] = lambda lo,hi:20
    env['N136_Action'](b)
    assert world.issued[-1][2:] == ('ensnare',target['serial'],{'T142':1},1)
    hero.update(x=700,y=600)
    lookup = []

    def point(loc, radius):
        lookup.append((loc,radius))
        return {'x':loc['x']+radius,'y':loc['y']}

    env.update(IsInTable=lambda unit,table:next(key for key,value in table.items() if value is unit),
               GetTempUnitLoc=point, SetUnitPositionLoc=lambda unit,loc:unit.update(loc))
    for spell in ('N138','N139'):
        support['execute'](support['function']('main/f291/f14'),[env],(spell,b),
                           start_pc=853,stop_pc=878)
    assert lookup == [({'x':700,'y':600},120)] * 2 and (b['x'],b['y']) == (820,600)

    b['skills'] = {'T085': 1}
    packets = []
    target.update(type='m998')
    target[32] = 100
    env.update(IsUnitType=lambda unit,tag:unit is b and tag == 'melee',
               UNIT_TYPE_MELEE_ATTACKER='melee', ATTACK_TYPE_HERO='hero',
               DAMAGE_TYPE_NORMAL='normal', WEAPON_TYPE_WHOKNOWS='whoknows',
               UnitDamagePoint=lambda *packet:packets.append(packet))
    event = {'GetEventDamage':lambda _:100,
             'EXSetEventDamage':lambda damage:packets.append(damage)}
    support['execute'](support['function']('main/f232/f1'),[event,env],(b,hero,target))
    assert packets[0] == 0 and packets[1][:3] == (b,0,300)
    assert math.isclose(packets[1][5],32) and packets[1][6:] == (False,False,'hero','normal','whoknows')
    selected_packet = 100 * (.8 * .2 + .008 * max(0,target[32] * .3))
    assert math.isclose(selected_packet,40)
    return {'overdueNilBearBookkeeping': {'actualSourceStats':[84,1.2],
                     'expectedFreshWithScepter':[294,1.0],'intervalAfterRemovingScepter':1.4},
            'sixSlotOrder':[0,1,2,3,4,5],'fullNewBearRejectsWithoutCloning':True,
            'directLivePointerReplacement':True,'ensnareProbabilitiesAndTargetLock':True,
            'recallOwnerXYRadiusAndNewXY':[[700,600],120,[820,600]],
            'redContractSourceAndWorkbookBossPacket':[32,40]}


def selected_q58_probes():
    def apply(current, tick_token, three_stats, scepter):
        if not current or current['token'] != tick_token:
            return
        inherited = math.floor(.7 * sum(three_stats))
        if inherited != current['contribution']:
            current['S18'] -= current['contribution']
            current['S18'] += inherited
            current['contribution'] = inherited
        if scepter != current['scepterApplied']:
            current['C'] += (-.2 if scepter else .2)
            current['scepterApplied'] = scepter

    def seed(token, base):
        return {'token':token,'S18':base,'C':1.2,'contribution':0,'scepterApplied':False,'nextTick':1}

    old = seed('old-bear',42)
    apply(old,'old-bear',[100]*3,True)
    assert (old['S18'],old['C']) == (252,1.0)
    apply(None,'old-bear',[100]*3,True)
    new = seed('new-bear',84)
    apply(new,'old-bear',[100]*3,True)
    assert (new['S18'],new['C']) == (84,1.2)
    apply(new,'new-bear',[100]*3,True)
    assert (new['S18'],new['C']) == (294,1.0)
    new['nextTick'] = 4
    restored = json.loads(json.dumps(new))
    apply(restored,'new-bear',[100]*3,True)
    assert restored == new  # Existing contributions and the timer survive restoration.
    apply(restored,'new-bear',[100]*3,False)
    assert (restored['S18'],restored['C']) == (294,1.2)
    return {'sourceOldTickExample': [84,1.2,1.4],
            'freshOnly': {'beforeTick':[84,1.2],'withScepter':[294,1.0],'afterScepterDrop':[294,1.2]},
            'savedStateDoesNotReplay':True}


def selected_q59_probes():
    def roar(targets, now, rank):
        for target in targets:
            if target['distance'] <= 500 and not target['tags'] & {
                    'air','magicImmune','invulnerable','invalid','ally'}:
                until = now + (1.5,3)[rank-1]
                target['movementUntil'] = max(until,target.get('movementUntil',0))

    def actions(target, now):
        acting = target.get('stunUntil',0) <= now
        return (acting and target.get('movementUntil',0) <= now,acting,acting)

    normal = {'distance':500,'tags':set()}
    hero = {'distance':499,'tags':{'hero'},'stunUntil':1}
    excluded = [{'distance':100,'tags':{tag}} for tag in
                ('air','magicImmune','invulnerable','invalid','ally')]
    excluded.append({'distance':500.01,'tags':set()})
    roar([normal,hero,*excluded],0,1)
    assert normal['movementUntil'] == hero['movementUntil'] == 1.5
    assert all('movementUntil' not in target for target in excluded)
    assert actions(hero,.5) == (False,False,False)
    assert actions(hero,1) == (False,True,True)
    assert actions(normal,1.5) == actions(hero,1.5) == (True,True,True)
    roar([normal,hero],2,2)
    roar([normal,hero],2.25,1)
    assert normal['movementUntil'] == hero['movementUntil'] == 5
    assert actions(hero,4.99) == (False,True,True) and actions(hero,5) == (True,True,True)
    return {'duration':[1.5,3],'heroSameDuration':True,'excludedTargetsAndClosedRadius':True,
            'ordinaryStunExpiresBeforeMovementLock':True,'shorterRefreshPreservesLongerLock':True}


def evidence():
    ids = ['A125','T033','T104','N136','N137','N138','N139','N140','N141','T141','T142','T138','T201']
    with closing(index.connect()) as db:
        rows = [r for r in index.workbook_rows(db,'A125','塔技能') if r['cells'][5] == 'A125']
        assert [r['row'] for r in rows] == [300,305,300,305]
        assert [r['cells'] for r in rows[:2]] == [r['cells'] for r in rows[2:]]
        abilities = {code:{r['sourcePath']:r['jsonIndex'] for r in index.objects(db,code)
                    if r['sourcePath'].endswith(('units_abilitydata.json','war3map.w3a.json'))} for code in ids}
        assert '增加50%攻击速度' in index.workbook_rows(db,'i243','装备与道具')[0]['cells'][7]
        for code, original in [('N140',(1.5,1.0)),('N141',(2.5,1.5))]:
            fields = index.objects(db,code,'units_abilitydata')[0]['fields']
            assert (fields['Dur1'],fields['HeroDur1']) == original
            assert (fields['code'],fields['BuffID1'],fields['targs1']) == ('AOws','B138','ground')
        units, base_damage, abilities_at_rank = {}, [], []
        for rank in range(1,7):
            uid = f'n{254+rank}'
            units[uid] = {}
            for table in ('units_unitabilities','units_unitbalance','units_unitdata','units_unitweapons'):
                item, = index.objects(db,uid,table)
                units[uid][table] = item['jsonIndex']
                fields = item['fields']
                if table == 'units_unitabilities':
                    abilities_at_rank.append(fields['abilList'].split(','))
                if table == 'units_unitweapons':
                    assert (fields['atkType1'],fields['cool1'],fields['dice1'],fields['sides1']) == ('hero',1.2,2,6)
                    base_damage.append(fields['dmgplus1'])
        assert base_damage == [42,84,126,168,210,252]
        assert [[code for code in skills if code.startswith('N')] for skills in abilities_at_rank] == [
            ['N136'],['N136','N138'],['N136','N138','N140'],['N137','N138','N140'],
            ['N137','N139','N140'],['N137','N139','N141']]
        funcs = ('main/f97/f0','main/f97/f1','main/f97/f2','main/f97/f3','main/f97/f4','main/f97/f5',
                 'main/f182/f0','main/f182/f1','main/f99/f1','main/f285/f10','main/f291/f9',
                 'main/f291/f14','main/f291/f20','main/f291/f27','main/f290/f25',
                 'main/f232/f0','main/f232/f1','main/f285/f18')
        _, hashes = json.loads(db.execute('SELECT fingerprint FROM metadata').fetchone()[0])
        return {'workbookRows':[f'{r["sourcePath"]}#塔技能!H{r["row"]}:I{r["row"]}' for r in rows],
                'disasmSha256':dict(hashes)[index.DISASM],
                'abilities':abilities,'units':units,
                'functionSpans':[list(db.execute('SELECT name,start_line,end_line FROM function WHERE name=?',(fn,)).fetchone()) for fn in funcs]}


if __name__ == '__main__':
    report = {
        'id':'A125','status':'ready',
        'rules':{
            'spec':'spirit-bear.md',
            'summon':{'ids':['n255','n256','n257','n258','n259','n260'],'count':1,'mana':50,
                      'cooldown':30,'lifetime':None,'replaceOldAfterDeathBackup':True},
            'inventory':{'slots':6,'oldSlotOrder':[0,1,2,3,4,5],
                         'restoresSameGroundItemWithPickup':True,'rescanOnFullBag':False},
            'inheritance':{'interval':1,'coefficients':[.7,.8,.9],'scepterIntervalDelta':-.2,
                           'appliedContributionsBoundToConcreteBearer':True},
            'ensnare':{'chancePercent':[10,20],'targetLockSeconds':[1.5,2.5],'heroSeconds':[.75,1.25]},
            'recall':{'cooldown':[10,5],'ownerSearchRadius':120},
            'roar':{'radius':500,'automaticSearchRadius':450,'duration':[1.5,3],'mana':[45,80],
                    'cooldown':7,'movementOnly':True,'separateControlChannel':True},
            'meleeContract':{'redArmorIgnore':[.3,.4,.5],'redSplit':[.8,1,1.2],
                             'greenAccurateHitChance':[30,40,50],'greenAccurateHitBonus':1},
        },
        'sourceRefs':evidence(),
        'differences':[
            {'source':'i240 raises bear inheritance by .2','web':'i240 raises it by .1'},
            {'source':'equipment contract source R=.4, red armor ratio=.2/.3/.4, blue die <15',
             'web':'R=.5, red armor ratio=.3/.4/.5, blue 15% per Q55'},
            {'decision':'Q58','source':'periodic cache keyed by shared owner slot',
             'web':'records and timer belong to current actual bear'},
            {'decision':'Q59','source':{'effect':'stun','normalDuration':[1.5,2.5],'heroDuration':[1,1.5]},
             'web':{'effect':'moveLock','duration':[1.5,3]}},
        ],
        'unresolved':[],
        'auxiliary':['T033','T104','N136','N137','N138','N139','N140','N141','T138','T141','T142','T201'],
        'validation':{'originalVM':original_probes(),'Q58':selected_q58_probes(),
                      'Q59':selected_q59_probes(),'originalClientTested':False},
    }
    encoded = json.dumps(report,ensure_ascii=False,indent=2)+'\n'
    if '--write' in sys.argv:
        OUT.write_text(encoded)
    else:
        assert OUT.read_text() == encoded
    print(json.dumps(report['validation'],ensure_ascii=False))
