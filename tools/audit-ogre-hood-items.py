#!/usr/bin/env python3
"""Check Ogre hood source traces, workbook numbers and Q53 contract vectors."""
from contextlib import closing
import json
import math
import runpy
import sys

import audit_index as index

DOC = index.ROOT / 'docs/rules/ogre-hood-items.md'
OUT = DOC.with_suffix('.json')
TIERS = {
    'i318': (211, 400, (4000, 5, .20, .03, .01), (3000, 4, .15, .02, .01)),
    'i319': (212, 500, (8000, 6, .25, .06, .02), (5000, 5, .20, .04, .02)),
    'i320': (213, 600, (12000, 7, .30, .09, .03), (7000, 6, .25, .06, .03)),
}
FORMULA_FIELDS = ('baseMagic', 'intellectMultiplier', 'currentManaFraction',
                  'ordinaryCurrentLifeFraction', 'bossCurrentLifeFraction')
SOURCE_FUNCTIONS = ('main/f270/f0', 'main/f270/f1', 'main/f287/f0', 'main/f287/f1',
                    'main/f285/f16', 'main/f291/f16', 'main/f53/f1',
                    'main/f285/f8', 'main/f285/f18', 'main/f7/f31', 'main/f7/f35', 'main/f7/f45')


def amount(values, intelligence, mana):
    base, coefficient, mana_rate, _, _ = values
    return base + coefficient * intelligence + mana_rate * mana


def original_probes():
    support = runpy.run_path(str(index.ROOT / 'tools/audit-zeus-skills.py'))
    execute, function, closure = (support[key] for key in ('execute', 'function', 'Closure'))
    for child in ('f0', 'f1'):
        original, repeated = (function(f'main/{module}/{child}') for module in ('f270', 'f287'))
        assert [row['raw'] for row in original['instructions']] == [row['raw'] for row in repeated['instructions']]

    def setup(items):
        world = support['Probe']()
        env = world.env
        tower = world.tower(1, intelligence=200, mana=1000, items=set(items), agility=200, strength=200)
        env.update(UNIT_STATE_MANA='mana', UNIT_TYPE_SAPPER='sapper',
                   GetHeroAgi=lambda unit, flag: unit['agility'],
                   GetHeroStr=lambda unit, flag: unit['strength'],
                   hasMon=lambda group: next((u for u in group if u['owner'] == 11 and u['life'] > 0), None))
        env['SetMagicDamagePoint'] = closure('main/f7/f31', [env])
        execute(function('main/f287'), [env])
        return world, tower

    source_vectors = {}
    for tier, (_, radius, selected, original) in TIERS.items():
        world, tower = setup([tier])
        anchor = world.unit(x=100, life=100000)
        boss = world.unit(x=101, life=100000, skills={'N534': 1}, tags={'sapper'})
        native_hero_only = world.unit(x=102, life=100000, tags={'hero'})
        doomed = world.unit(x=103, life=1)
        ally = world.unit(owner=0, x=104)
        magic_immune = world.unit(x=105, life=100000, tags={'magicImmune'})
        outside = world.unit(x=100 + radius + .01)

        def run_magic(*args):
            world.area(*args)
            world.unit(x=106, life=100000)

        world.env['UnitDamagePoint'] = run_magic
        world.env['i318_Action'](tower, {'x': anchor['x'], 'y': 0})
        source_amount = amount(original, 200, 1000)
        selected_amount = amount(selected, 200, 1000)
        assert world.events[0] == ('area', 0, radius, 100, 0, source_amount)
        divine = {event[2]: event[3] for event in world.events if event[0] == 'divine'}
        remnant_life = 100000 - source_amount
        assert math.isclose(divine[anchor['serial']], remnant_life * original[3])
        assert math.isclose(divine[boss['serial']], remnant_life * original[4])
        assert math.isclose(divine[native_hero_only['serial']], remnant_life * original[3])
        assert math.isclose(divine[magic_immune['serial']], 100000 * original[3])
        assert math.isclose(divine[world.units[-1]['serial']], 100000 * original[3])
        assert not {doomed['serial'], ally['serial'], outside['serial']} & divine.keys()
        first_divine = next(i for i, event in enumerate(world.events) if event[0] == 'divine')
        assert all(event[0] != 'magic' for event in world.events[first_divine:])
        source_vectors[tier] = {'originalMagic': source_amount, 'selectedMagic': selected_amount,
                                'originalDivineOrdinary': divine[anchor['serial']],
                                'originalDivineBoss': divine[boss['serial']]}

    world, tower = setup(TIERS)
    anchor = world.unit(x=200)
    env = world.env
    env['i318_AddSign'](tower)
    assert env['i318_Sign'] == {1: 1}
    tower['agility'] += 1
    env['i318_AddSign'](tower)
    assert env['i318_Sign'] == {1: 1}
    tower['agility'] -= 1
    env['i318_Sign'][1] = 12
    env['i318_AddSign'](tower)
    assert env['i318_Sign'] == {1: 0}
    assert world.events[0] == ('area', 0, 600, 200, 0, 8450)
    anchor['life'] = 0
    env['i318_Sign'][1] = 12
    before = len(world.events)
    env['i318_AddSign'](tower)
    assert len(world.events) == before and env['i318_Sign'] == {1: 12}
    return {'tierPackets': source_vectors, 'recheckedDivineSnapshot': True,
            'originalOverfullWithTargetEndsAtZero': True, 'originalOverfullWithoutTargetDoesNotAddOne': True,
            'highestTierWins': True, 'tiesEligibleButLowerIntIneligible': True}


def q53_probes():
    def base_cast(state, slot, equipped, int_highest, select_center, launch):
        if not equipped() or not int_highest():
            return
        state[slot] = state.get(slot, 0) + 1
        while state[slot] >= 5 and equipped() and int_highest():
            center = select_center()
            if center is None:
                break
            state[slot] -= 5
            launch(center)

    bank = {1: 12}
    inventory = ['i318']
    marks_during_burst = []
    has_hood = lambda: bool(inventory)
    with_center = lambda: 'center'
    no_center = lambda: None

    def launch(center):
        marks_during_burst.append((center, bank[1]))

    base_cast(bank, 1, has_hood, lambda: True, with_center, launch)
    assert marks_during_burst == [('center', 8), ('center', 3)] and bank == {1: 3}
    bank[1] = 9
    base_cast(bank, 1, has_hood, lambda: True, no_center, launch)
    assert bank == {1: 10}
    bank[1] = 4
    base_cast(bank, 1, has_hood, lambda: True, no_center, launch)
    assert bank == {1: 5}
    base_cast(bank, 1, has_hood, lambda: True, with_center, launch)
    assert bank == {1: 1}
    bank[1] = 12
    available = ['survivor']
    base_cast(bank, 1, has_hood, lambda: True,
              lambda: available[-1] if available else None, lambda center: available.pop())
    assert bank == {1: 8}
    inventory.clear()
    base_cast(bank, 1, has_hood, lambda: True, with_center, launch)
    assert bank == {1: 8}
    inventory.append('i320')
    base_cast(bank, 2, has_hood, lambda: True, no_center, launch)
    assert bank == {1: 8, 2: 1}  # Transferred hood leaves the former tower's balance.
    bank[1] = 3
    base_cast(bank, 1, has_hood, lambda: True, with_center, launch)
    before = len(marks_during_burst)
    bank[1] += 3  # A060 planned repeats enter after the base event and do not invoke it.
    assert bank[1] == 7 and len(marks_during_burst) == before
    return {'checked': ['multiBurstRemainder', 'unspentNoTarget', 'noTargetNewMark',
                        'nextEligibleCast', 'recheckAfterCenterDies', 'noHoodNoChange',
                        'transferDoesNotMoveMarks', 'plannedExtraDoesNotDrain']}


def evidence():
    with closing(index.connect()) as db:
        ability, = index.objects(db, 'I158', 'units_abilitydata')
        assert ability['fields']['code'] == 'AIab' and ability['fields']['DataB1'] == 150
        item_records = []
        for item, (row_number, radius, selected, original) in TIERS.items():
            rows = [row for row in index.workbook_rows(db, item, '装备与道具') if row['cells'][1] == item]
            assert len(rows) == 2 and rows[0]['cells'] == rows[1]['cells'] and all(
                row['row'] == row_number for row in rows)
            cell = rows[0]['cells'][7]
            base, int_factor, mana_rate, normal, boss = selected
            for term in ('150点智力', f'范围{radius}', f'{base}+{int_factor}倍智力+{mana_rate:.0%}当前魔法值',
                         f'当前生命值{normal:.0%}的神圣伤害(BOSS为{boss:.0%})', '每5层印记'):
                assert term in cell, (item, term)
            static, = index.objects(db, item, 'units_itemdata')
            assert static['fields']['abilList'] == 'I158' and not static['fields'].get('usable')
            item_records.append({'id': item, 'status': 'ready',
                                 'rules': {'radius': radius, 'intellect': 150,
                                           'selected': dict(zip(FORMULA_FIELDS, selected))},
                                 'sourceRefs': {'sheet': '装备与道具', 'range': f'H{row_number}',
                                                'itemJsonIndex': static['jsonIndex'], 'abilityJsonIndex': ability['jsonIndex']},
                                 'differences': {'original': dict(zip(FORMULA_FIELDS, original)), 'Q53': '每5层扣5，保留余数'},
                                 'unresolved': [],
                                 'validation': '对象、双图鉴、原双段调用和Q53契约向量'})
        positions = [dict(zip(('function', 'startLine', 'endLine'), db.execute(
            'SELECT name,start_line,end_line FROM function WHERE name=?', (fn,)).fetchone()))
                     for fn in SOURCE_FUNCTIONS]
        metadata = json.loads(db.execute('SELECT fingerprint FROM metadata').fetchone()[0])
        sources = {path: digest for path, digest in metadata[1] if path.endswith(
            ('图鉴.xlsx', 'main.disasm', 'units_itemdata.json', 'units_abilitydata.json'))}
        refs = {literal: index.references(db, literal) for literal in ('i318_Sign', 'i318_AddSign', 'i318_Action')}
        assert {ref['function'] for ref in refs['i318_Sign']} == {
            'main/f53/f1', 'main/f270', 'main/f270/f1', 'main/f287', 'main/f287/f1'}
        return item_records, {'functions': positions, 'references': refs, 'fingerprints': sources}


if __name__ == '__main__':
    items, sources = evidence()
    report = {'items': items, 'sourceRefs': sources, 'validation': {
        'original': original_probes(), 'Q53': q53_probes(), 'originalClientTested': False}}
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    if '--write' in sys.argv:
        OUT.write_text(encoded)
    else:
        assert OUT.read_text() == encoded
    print(json.dumps(report['validation'], ensure_ascii=False))
