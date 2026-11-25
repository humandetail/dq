#!/usr/bin/env python3
"""Probe the original Ogre's multicast bytecode against the shared audit VM."""
from contextlib import closing
from fractions import Fraction
import hashlib
import json
import math
import runpy
import sys

import audit_index as index

DOC = index.ROOT / 'docs/rules/ogre-multicast.md'
OUT = DOC.with_suffix('.json')
MODULES = ('main/f52', 'main/f53', 'main/f270', 'main/f287', 'main/f285/f16', 'main/f291/f14',
           'main/f291/f16', 'main/f291/f27')
IDS = ('A058', 'A059', 'A060', 'T053', 'T054', 'i318', 'i319', 'i320')


def probes():
    shared = runpy.run_path(str(index.ROOT / 'tools/audit-zeus-skills.py'))
    new_world = shared['Probe']
    execute, function = shared['execute'], shared['function']

    for suffix in ('f0', 'f1'):
        original = function(f'main/f270/{suffix}')
        repeated = function(f'main/f287/{suffix}')
        assert {key: value['value'] for key, value in original['constants'].items()} == {
            key: value['value'] for key, value in repeated['constants'].items()}
        assert [row['raw'] for row in original['instructions']] == [row['raw'] for row in repeated['instructions']]

    def setup():
        world = new_world()
        source = world.tower(1, skills={'A058': 2, 'A059': 3, 'A060': 3}, intelligence=100)
        target = world.unit(x=200)
        state = {'skill': 'A058', 'draw': 100}
        text = []
        env = world.env
        env.update({
            'GetTriggerUnit': lambda: source,
            'GetSpellAbilityId': lambda: state['skill'],
            'GetRandomInt': lambda lo, hi: state['draw'] if (lo, hi) == (1, 100) else None,
            'CreateTextTagByUnit': lambda label, scale, unit: text.append(label),
            'math': {'ceil': math.ceil},
            'GetHeroAgi': lambda unit, extra: unit.get('agility', 100),
            'GetHeroStr': lambda unit, extra: unit.get('strength', 100),
            'hasMon': lambda group: next((u for u in group if u['owner'] == 11 and u['life'] > 0), None),
        })
        execute(function('main/f52'), [env])
        execute(function('main/f53'), [env])
        execute(function('main/f287'), [env])
        return world, source, target, state, text

    world, source, target, state, text = setup()
    env = world.env

    def totals(rank):
        counts = [0] * (rank + 1)
        source['skills']['A060'] = rank
        state['skill'] = 'unspecified'
        for roll in range(1, 101):
            state['draw'] = roll
            before = len(text)
            env['A060_Action'](target)
            total = 1 if before == len(text) else int(text[-1].rsplit('X', 1)[1])
            assert total == (roll * (rank + 1) + 99) // 100
            counts[total - 1] += 1
        return counts

    distributions = [totals(rank) for rank in range(1, 7)]
    assert not world.issued and not world.timers

    world, source, target, state, _ = setup()
    env = world.env
    env['A060_Action'](target)
    world.advance(.6)
    source['skills']['A058'] = 4
    world.advance(2.4)
    casts = [(time, origin, skills['T053']) for time, origin, _, _, skills, _ in world.issued]
    assert casts == [('3/5', 1, 2), ('6/5', 1, 4), ('9/5', 1, 4)]
    assert not env['A060_Timer']
    max_spacing = casts

    world, source, target, state, _ = setup()
    env = world.env
    world.env['IssueTargetOrder'] = lambda *args: False
    env['A060_Action'](target)
    world.advance(.6)
    assert env['A060_nowNumber'][1] == 2
    target['life'] = 0
    world.advance(1.2)
    assert not env['A060_Timer']

    world, source, target, state, _ = setup()
    env = world.env
    env['A060_Action'](target)
    state.update(skill='A059', draw=50)
    friend = world.unit(owner=0, x=250)
    env['A060_Action'](friend)
    # The original group includes the caster and every non-Player(11) slot.
    assert world.issued[-1][3] == source['serial']
    assert env['A060_nowNumber'][1] == env['A060_targetI'][1] == 2
    world.advance(.6)
    assert len(world.issued) == 1 and not env['A060_Timer']

    world, source, target, state, _ = setup()
    env = world.env
    env['A060_Action'](target)
    world.advance(.1)
    env['A060_Action'](target)
    assert not world.timers[0]['running'] and world.timers[1]['running']
    assert 1 not in env['A060_nowNumber'] and 1 not in env['A060_targetI']
    try:
        world.advance(.7)
    except TypeError:
        pass
    else:
        raise AssertionError('expected source-level nil comparison')

    world, source, target, state, _ = setup()
    env = world.env
    source['items'].add('i318')
    source['agility'] = 101
    env['i318_AddSign'](source)
    assert not env['i318_Sign']
    try:
        env['A060_Action'](target)
    except TypeError:
        pass
    else:
        raise AssertionError('expected source-level nil addition')
    source['agility'] = 100
    env['i318_AddSign'](source)
    assert env['i318_Sign'][1] == 1
    env['A060_Action'](target)
    assert env['i318_Sign'][1] == 4
    bursts = []
    env['i318_Action'] = lambda tower, location: bursts.append((tower['serial'], location['x']))
    env['i318_AddSign'](source)
    assert bursts == [(source['serial'], 200)] and env['i318_Sign'][1] == 0
    target['life'] = 0
    env['i318_Sign'][1] = 8
    env['i318_AddSign'](source)
    assert env['i318_Sign'][1] == 8
    return {'rankTotalsFor100Rolls': distributions, 'fireboltSpacedOrders': max_spacing,
            'originalRejectedOrderConsumed': True, 'originalBloodlustSharedSlot': {
                'A060Rank': 3, 'fireboltRoll': 100, 'bloodlustRoll': 50, 'extraBuffAttempts': 1,
                'expectedFireboltAttemptsWithoutInterleaving': 3,
                'countsReadAtFirstTick': [2, 2], 'fireboltAttemptsWithInterleaving': 0,
            },
            'originalPositiveRecastNilComparison': {
                'A060Rank': 3, 'rolls': [100, 100], 'effectTimes': [0, .1],
                'priorTimerDestroyed': True, 'firstReplacementTick': .7, 'counts': [None, None],
                'vmResult': 'TypeError comparing nil counters',
            }, 'originalUninitializedHoodNilAddition': True,
            'originalHoodThresholdAndNoTarget': True, 'duplicateHoodFunctionsIdentical': True}


def q50_probes():
    """Fixed eligibility and draw-order examples for the accepted Q50 rule."""
    def candidates(primary, units):
        return [identifier for identifier, distance, legal in units
                if identifier != primary and distance <= 600 and legal]

    def choose(pool, extra, rolls):
        selected = []
        while pool and len(selected) < extra:
            selected.append(pool.pop(next(rolls) if len(pool) > 1 else 0))
        return selected

    # Legal flags represent T054 eligibility, including allied owner and range.
    pool = candidates('primary', [('primary', 0, True), ('ally', 600, True),
                                  ('out', 600.001, True), ('enemy', 80, False),
                                  ('magic-immune', 120, False), ('friendly-creep', 30, True)])
    assert pool == ['ally', 'friendly-creep']
    assert choose(pool.copy(), 6, iter([1])) == ['friendly-creep', 'ally']
    assert choose(pool.copy(), 1, iter([0])) == ['ally']
    assert choose([], 4, iter([])) == []
    return {'inclusiveRange': True, 'stableOrderBeforeDraw': True, 'distinctValidAllies': True,
            'primaryExcluded': True, 'limitedByAvailability': True}


def q51_probes():
    """Observable issuance timeline for independent accepted firebolt casts."""
    def timeline(casts, dead_targets=None):
        deaths = dead_targets or {}
        events = sorted((Fraction(str(start)) + Fraction(3 * repeat, 5), sequence, target)
                        for sequence, (start, extra, target) in enumerate(casts)
                        for repeat in range(1, extra + 1))
        return [(float(when), sequence, target) for when, sequence, target in events
                if target not in deaths or when < deaths[target]]

    after_bloodlust = timeline([(0, 3, 'a')])
    recast = timeline([(0, 3, 'a'), (.1, 3, 'b')])
    assert after_bloodlust == [(.6, 0, 'a'), (1.2, 0, 'a'), (1.8, 0, 'a')]
    assert recast == [(.6, 0, 'a'), (.7, 1, 'b'), (1.2, 0, 'a'),
                      (1.3, 1, 'b'), (1.8, 0, 'a'), (1.9, 1, 'b')]
    assert timeline([(0, 2, 'a'), (0, 2, 'b')], {'a': Fraction(1)}) == [
        (.6, 0, 'a'), (.6, 1, 'b'), (1.2, 1, 'b')]
    return {'afterInterleavedBloodlust': after_bloodlust, 'afterPositiveRecast': recast,
            'deathOnlyCancelsMatchingTargetInstances': True, 'stableEqualTimeOrder': True}


def evidence():
    with closing(index.connect()) as db:
        rows = {}
        for ability in IDS:
            sheet = '塔技能' if ability[0] == 'A' else '装备与道具'
            matches = index.workbook_rows(db, ability, sheet)
            if ability[0] in 'Ai':
                column = 5 if ability[0] == 'A' else 1
                matches = [row for row in matches if row['cells'][column] == ability]
                assert len(matches) == 2 and matches[0]['cells'] == matches[1]['cells'], ability
            rows[ability] = [{key: row[key] for key in ('sourcePath', 'sheet', 'row')} for row in matches]
        primary = {}
        for ability in IDS:
            table = 'units_abilitydata' if ability[0] in 'AT' else 'units_itemdata'
            entry, = index.objects(db, ability, table)
            primary[ability] = entry
        assert primary['A058']['fields']['Cool1'] == 14
        assert primary['T053']['fields']['Rng1'] == 2000
        assert primary['A059']['fields']['Dur1'] == 7 and primary['T054']['fields']['Dur1'] == 10
        assert primary['A060']['fields']['code'] == 'AOcr'
        assert all(primary[ability]['fields']['abilList'] == 'I158' for ability in IDS[-3:])
        funcs = [dict(zip(('function', 'startLine', 'endLine'), row))
                 for name in MODULES for row in db.execute(
                     'SELECT name,start_line,end_line FROM function WHERE name=? OR (? AND name LIKE ?) ORDER BY start_line',
                     (name, name in MODULES[:4], name + '/%'))]
        metadata = json.loads(db.execute('SELECT fingerprint FROM metadata').fetchone()[0])
        sources = {path: digest for path, digest in metadata[1]
                   if path.endswith(('图鉴.xlsx', 'main.disasm', 'units_abilitydata.json',
                                     'war3map.w3a.json', 'units_itemdata.json', 'units_unitabilities.json'))}
        strings = index.MAP / 'units_campaignabilitystrings.txt'
        sources[index.source_path(strings)] = hashlib.sha256(strings.read_bytes()).hexdigest()
        return {'workbooks': rows, 'sourceFingerprints': sources,
                'objectRecords': {key: [dict(sourcePath=e['sourcePath'], jsonIndex=e['jsonIndex'])
                                        for e in index.objects(db, key)] for key in IDS},
                'functions': funcs, 'references': {ability: index.references(db, ability) for ability in IDS}}


if __name__ == '__main__':
    validation = probes()
    specification = [{
        'id': 'A058', 'status': 'ready', 'rules': '主弹使用图鉴六级数值；Q51每实例每0.6秒以原目标追加T053',
        'sourceRefs': ['main/f52/f0', 'main/f53/f0', 'main/f53/f2', 'main/f53/f3', 'main/f291/f27#777'],
        'differences': ['图鉴CD各比对象低2秒', '原强制合格重施清掉新计数'],
        'unresolved': [],
        'validation': ['时序、读实时等级、失败消费、死亡截止与重入空比较探针'],
    }, {
        'id': 'A059', 'status': 'ready', 'rules': '主目标为友方英雄；Q50额外目标600内从合法友方无放回抽取',
        'sourceRefs': ['main/f53/f1#99', 'A059', 'T054'],
        'differences': ['原按组首顺序且未先筛合法友方；Q50采用均匀无放回', '图鉴7秒覆盖T054的10秒'],
        'unresolved': [],
        'validation': ['原共享槽及Q50/Q51目标和状态边界探针'],
    }, {
        'id': 'A060', 'status': 'ready', 'rules': '一次1–100整数抽样决定含原施法的总数；只额外施放A058/A059',
        'sourceRefs': ['main/f53/f1#15', 'main/f291/f14#447', 'main/f285/f16#155', 'main/f287/f1'],
        'differences': ['原两个技能共用塔槽计数；Q51爆轰每次独立', '无兜帽计数记录时直接读会出现nil加法'],
        'unresolved': [],
        'validation': ['6档600骰、原跨技能覆盖、首次兜帽空值与失效探针'],
    }]
    report = {'skills': specification, 'sourceRefs': evidence(),
              'auxiliary': {'verified': ['T053', 'T054', 'i318–i320计数写入'],
                            'relatedRule': 'docs/rules/ogre-hood-items.md'},
              'validation': {**validation, 'q50': q50_probes(), 'q51': q51_probes()},
              'originalClientTested': False}
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    if '--write' in sys.argv:
        OUT.write_text(encoded)
    else:
        assert OUT.read_text() == encoded
    print(json.dumps(validation, ensure_ascii=False))
