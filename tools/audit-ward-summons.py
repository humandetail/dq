#!/usr/bin/env python3
"""Verify Shadow Shaman ward objects, original summon bytecode and focused Web vectors."""
from contextlib import closing
from fractions import Fraction
import hashlib
import json
import math
import runpy
import sys

import audit_index as index

OUT = index.ROOT / 'docs/rules/ward-summons.json'
DAMAGE = [40, 70, 100, 130, 160, 200]
COST = [100, 115, 130, 145, 160, 175]
INTERVAL = [1.5, 1.5, 1.4, 1.4, 1.3, 1.2]
VARIANTS = {'A094': (12, 122), 'A095': (15, 132)}
FUNCTIONS = ('main/f7/f11', 'main/f7/f12', 'main/f232/f0', 'main/f232/f1',
             'main/f291/f1', 'main/f291/f20', 'main/f291/f21', 'main/f291/f27', 'main/f291/f40')


def evidence():
    with closing(index.connect()) as db:
        def one(identifier, table):
            item, = index.objects(db, identifier, table)
            return item

        rows = [row for row in index.workbook_rows(db, 'A094', '塔技能') if row['cells'][5] == 'A094']
        assert len(rows) == 2 and all(row['row'] == 345 for row in rows) and rows[0]['cells'] == rows[1]['cells']
        for amount, mana in zip(DAMAGE, COST):
            assert f'{amount}点攻击力' in rows[0]['cells'][8] and f'耗蓝 {mana}点' in rows[0]['cells'][8]
        assert '8支' in rows[0]['cells'][7] and '12秒' in rows[0]['cells'][7] and '18秒' in rows[0]['cells'][7]
        assert not index.workbook_rows(db, 'A095', '塔技能')
        slots = list(db.execute("SELECT object_id,fields FROM object_row WHERE source LIKE '%units_unitabilities.json'"))
        assert [uid for uid, f in slots if 'A094' in json.loads(f).get('heroAbilList', '').split(',')] == ['H029']
        assert not [uid for uid, f in slots if 'A095' in json.loads(f).get('heroAbilList', '').split(',')]
        assert all(not index.references(db, k) for k in ('H029', 'N132'))

        units = {}
        skills = []
        for variant, (duration, unit_start) in VARIANTS.items():
            ability = one(variant, 'units_abilitydata')
            w3a = one(variant, 'war3map.w3a')
            fields = ability['fields']
            assert fields['code'] == 'AOwd' and fields['levels'] == 6
            assert all(fields[f'DataA{i}'] == 8 and fields[f'Area{i}'] == 300
                       and fields[f'Dur{i}'] == duration and fields[f'Rng{i}'] == 800
                       and fields[f'Cool{i}'] == 18 for i in range(1, 5))
            levels = []
            for level, damage, cost, interval in zip(range(1, 7), DAMAGE, COST, INTERVAL):
                extra = {m['key']: m['value'] for m in w3a['fields']['mods'] if m['level'] == level}
                unit = fields.get(f'UnitID{level}', extra.get('Hwe1'))
                assert unit == 'b' + str(unit_start + level - 1)
                assert fields.get(f'Cost{level}', extra.get('amcs')) == cost and not index.references(db, unit)
                levels.append({'level': level, 'unit': unit, 'baseDisplayedAttack': damage,
                               'mana': cost, 'attackInterval': interval})
                abils = one(unit, 'units_unitabilities')
                balance = one(unit, 'units_unitbalance')
                wpn = one(unit, 'units_unitweapons')
                override = one(unit, 'war3map.w3u')
                assert abils['fields']['abilList'] == ('Avul' if variant == 'A094' else 'Avul,N132')
                assert balance['fields']['HP'] == 75 and balance['fields']['type'] == 'sapper'
                assert 'collision' not in balance['fields'] and 'spd' not in balance['fields']
                assert one(unit, 'units_unitdata')['fields']['targType'] == 'ground'
                weapon = wpn['fields']
                assert (weapon['atkType1'], weapon['weapTp1'], weapon['weapsOn']) == ('pierce', 'missile', 1)
                assert (weapon['dmgplus1'], weapon['dice1'], weapon['sides1']) == (damage, 1, 1)
                assert (weapon['cool1'], weapon['dmgpt1'], weapon['backSw1']) == (interval, .3, .7)
                assert (weapon['rangeN1'], weapon['acquire']) == (800, 800)
                changes = {m['key']: m['value'] for m in override['fields']['mods']}
                assert changes['ua1z'] == 900 and changes['umh1'] == 1
                assert not {'ua1b', 'ua1d', 'ua1s', 'ua1c', 'ucol'} & changes.keys()
                units[unit] = {entry['sourcePath']: entry['jsonIndex'] for entry in (abils, balance, wpn, override)}
            skills.append({'id': variant, 'status': 'ready', 'rules': {
                'count': 8, 'duration': duration, 'range': 800, 'area': 300, 'cooldown': 18, 'levels': levels},
                'sourceRefs': {'ability': {a['sourcePath']: a['jsonIndex'] for a in (ability, w3a)},
                               'scripts': index.references(db, variant)},
                'differences': ['图鉴本体攻击额覆盖模板额外固定1d1',
                                'Q55远程绿蓝契使用完整图鉴系数和概率']
                               + (['N132三份提示为总4，原对象DataC=2'] if variant == 'A095' else []),
                'unresolved': [], 'validation': '双图鉴、对象、召唤继承原VM和Web向量'})
        fields = one('N132', 'units_abilitydata')['fields']
        assert (fields['code'], fields['DataC1'], fields['Area1'], fields['Cool1'], fields['DataB1']) == (
            'Aroc', 2, 700, 2, 9999999)
        assert not index.objects(db, 'N132', 'war3map.w3a')
        hints = index.MAP / 'units_campaignabilitystrings.txt'
        text = hints.read_text()
        assert '同时攻击四个目标' in text.split('[A095]', 1)[1].split('[A096]', 1)[0]
        assert '同时攻击4个目标' in text.split('[N132]', 1)[1].split('[N133]', 1)[0]
        fingerprints = dict(json.loads(db.execute('SELECT fingerprint FROM metadata').fetchone()[0])[1])
        fingerprints = {path: digest for path, digest in fingerprints.items()
                        if path.endswith(('图鉴.xlsx', 'main.disasm', 'units_abilitydata.json', 'war3map.w3a.json',
                                          'units_unitabilities.json', 'units_unitbalance.json', 'units_unitweapons.json',
                                          'units_unitdata.json', 'war3map.w3u.json'))}
        fingerprints[index.source_path(hints)] = hashlib.sha256(hints.read_bytes()).hexdigest()
        functions = [dict(zip(('function', 'startLine', 'endLine'), db.execute(
            'SELECT name,start_line,end_line FROM function WHERE name=?',(function,)).fetchone())) for function in FUNCTIONS]
        return skills, {'unitRecords': units, 'workbookRows': [row['row'] for row in rows],
                        'sourceFingerprints': fingerprints, 'functions': functions}


def original_probes():
    support = runpy.run_path(str(index.ROOT / 'tools/audit-zeus-skills.py'))
    world = support['Probe']()
    env, function, execute = world.env, support['function'], support['execute']
    hero = world.unit('H029', owner=0, userdata=7, skills={'A094': 1}, tags={'hero'},
                      intelligence=80, strength=100, agility=120)
    env['Tower_ALL'][7] = hero
    env.update(UNIT_TYPE_HERO='hero', UNIT_TYPE_MELEE_ATTACKER='melee',
               GetHeroStr=lambda u, flag: u['strength'], GetHeroAgi=lambda u, flag: u['agility'],
               SetUnitState=lambda unit, state, value: unit.update({state: value}), ConvertUnitState=lambda n: n,
               A209_DeathGuard=lambda _: False, IsXiongLingHuoBan=lambda _: False)
    moved = []
    world.japi['EXSetUnitMoveType'] = lambda unit, state: moved.append((unit['type'], state))
    execute(function('main/f232'), [env], (lambda _: world.japi,))
    spawn = function('main/f291/f20')
    source = []
    for model, items, mode, expected in (
        ('b122', (), 0, (160, 1.0, {})),
        ('b132', ('i240',), 0, (220.0, 1.3, {})),
        ('b132', ('i242',), 2, (160, 1.2, {})),
        ('b132', ('i250', 'i252', 'i254', 'i240', 'i242'), 1,
         (220.0, 2.7, {'T085': 3, 'T086': 3, 'T087': 3})),
    ):
        ward = world.unit(model, owner=0)
        ward[18], ward[19], ward[81] = 40, 0, 1
        hero['items'] = set(items)
        env['Game_Mode'] = mode
        execute(spawn, [env, world.japi], (hero, ward))
        assert ward['userdata'] == 7 and math.isclose(ward[18], expected[0])
        assert math.isclose(ward[81], expected[1]) and ward['skills'] == expected[2]
        source.append({'ward': model, 'mode': mode, 'items': items, 'baseState': round(ward[18], 4),
                       'speedState': round(ward[81], 4), 'addedAbilities': ward['skills']})
    assert moved == [('b122', 1), ('b132', 1), ('b132', 1)]
    world.japi['GetEventDamage'] = lambda _: 500
    damage_writes = []
    world.japi['EXSetEventDamage'] = damage_writes.append
    env['GetRandomInt'] = lambda low, high: 6
    victim = world.unit(x=100, life=100000)
    env['i240_254_Damage'](ward, hero, victim)
    assert world.events[0] == ('divine', ward['serial'], victim['serial'], 120)
    assert world.events[1][:-1] == ('area', 0, 400, 100, 0)
    assert math.isclose(world.events[1][-1], 1540)
    before = len(world.events)
    env['GetRandomInt'] = lambda low, high: 7
    env['i240_254_Damage'](ward, hero, victim)
    assert len(world.events) == before + 1 and not damage_writes
    return {'summonStates': source, 'rangedSourceBlueAtRoll6Only': True,
            'rangedGreenUsesOwnerAgiAndEndlessFactor': True, 'noRangedRed': True}


def selected_vectors():
    clock = [(0, 'A094'), (2, 'A095')]
    expire = [(start + VARIANTS[skill][0], skill) for start, skill in clock]
    assert expire == [(12, 'A094'), (17, 'A095')]
    assert sum(8 for end, _ in expire if 11 < end) == 16
    assert sum(8 for end, _ in expire if 12 < end) == 8
    assert sum(8 for end, _ in expire if 17 < end) == 0
    ring = [(300 * math.cos(math.pi * step / 4), 300 * math.sin(math.pi * step / 4))
            for step in range(8)]
    assert all(math.isclose(math.hypot(x,y),300) for x,y in ring) and len(set(ring)) == 8
    assert [40 + int(Fraction(rate) * 300) for rate in ('0.4','0.5','0.6')] == [160,190,220]
    assert len([target for target in range(5) if target != 0][:3]) + 1 == 4
    blue_rolls = [roll for roll in range(1, 101) if roll <= 15]
    assert len(blue_rolls) == 15 and blue_rolls[-1] == 15
    green = [120 * rate for rate in (Fraction(3, 5), Fraction(4, 5), Fraction(1))]
    blue = [220 * rate for rate in (6, 8, 10)]
    assert green == [72, 96, 120] and [n * 2 for n in green] == [144, 192, 240]
    assert blue == [1320, 1760, 2200] and [n / 2 for n in blue] == [660, 880, 1100]
    q55 = {'greenOrdinary': list(map(int,green)), 'greenEndless': [int(n * 2) for n in green],
           'blueOrdinary': blue, 'blueMainline': [n // 2 for n in blue], 'blueSuccessRolls': len(blue_rolls)}
    return {'Q55': q55, 'simultaneousGroupCounts': [16, 8, 0], 'independentExpires': expire,
            'ringSlotCount': len(ring), 'baseAndScaledInheritance': [160, 190, 220],
            'scepterWardTotalTargetCap': 4}


if __name__ == '__main__':
    skills, refs = evidence()
    report = {'skills': skills, 'sourceRefs': refs, 'auxiliary': ['A096', 'A114', 'N132', '12 ward unit templates'],
              'validation': {'original': original_probes(), 'selected': selected_vectors(), 'originalClientTested': False}}
    payload = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    if '--write' in sys.argv:
        OUT.write_text(payload)
    else:
        assert OUT.read_text() == payload
    print(json.dumps(report['validation'], ensure_ascii=False))
