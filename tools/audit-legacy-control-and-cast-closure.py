#!/usr/bin/env python3
"""Close three legacy interfaces using cached fields and the existing Lua VM."""
import argparse
import json
import runpy
import audit_index as source

OUT = source.ROOT / 'docs/rules/legacy-control-and-cast-closure.json'


def audit(db):
    facts = {}
    for alias in ('A007', 'A057', 'A180', 'T012', 'T020', 'T220', 'T410'):
        row, = source.objects(db, alias, 'units_abilitydata')
        facts[alias] = row
    for alias in ('T012', 'T020'):
        fields = facts[alias]['fields']
        assert fields['code'] == 'AIcb'
        assert not any(k.startswith(('DataA', 'DataB', 'BuffID')) for k in fields)
        assert source.objects(db, alias, 'war3map.w3a') == []
    lines = (source.MAP / 'units_campaignabilitystrings.txt').read_text().splitlines()
    for alias in ('T012', 'T020'):
        start = lines.index('[' + alias + ']')
        assert 'Name=马甲-无敌斩武器视觉效果' in lines[start:start+12]
    casters = {}
    for alias in ('H017', 'G067', 'G032', 'G033', 'H046', 'G065'):
        row, = source.objects(db, alias, 'units_unitweapons')
        casters[alias] = {k: row['fields'][k] for k in ('castpt', 'castbsw')}
        assert casters[alias]['castpt'] == (.01 if alias in ('H046', 'G065') else .3)
    refs = source.references(db, 'A057_Count')
    assert {r['function'] for r in refs} == {'main/f51', 'main/f51/f1'}
    cleanup = [json.loads(row[0]) for row in db.execute('SELECT value FROM constant WHERE function=?', ('main/f291/f4',))]
    assert not any(x in cleanup for x in ('Tower_ALL', 'A057', 'A057_Count'))
    vm = runpy.run_path(str(source.ROOT / 'tools/audit-divine-books.py'))['runtime'](db)
    execute, function = vm['execute'], vm['function']
    trace = []
    locate = lambda v, table: next((k for k, x in table.items() if x == v), -1)
    note = lambda event: lambda *args: trace.append([event, *args])
    slots, timers = {1: 'replacement'}, {1: 'timer'}
    env = {'GetExpiredTimer': lambda: 'timer', 'IsInTable': locate, 'Tower_ALL': slots,
           'GetId': str, 'CreateTempAndSetAbilityLv': lambda *args: 'dummy',
           'GetOwningPlayer': lambda _: 0, 'GetUnitLoc': lambda _: [0, 0],
           'IssueTargetOrder': note('buff'), 'DestroyTimer': note('destroy')}
    native = {'EXGetUnitAbility': lambda u, a: u + ':' + a, 'EXGetAbilityState': lambda *_: 8,
              'EXSetAbilityState': note('cd')}
    execute(function('main/f51/f0'), [env, timers, native])
    assert trace == [['cd', 'replacement:A057', 1, 4.0], ['buff', 'dummy', 'innerfire', 'replacement'], ['destroy', 'timer']]
    replacement = trace.copy()
    trace.clear(); slots.clear(); timers[1] = 'timer'
    execute(function('main/f51/f0'), [env, timers, native])
    assert trace == [['destroy', 'timer']]
    empty = trace.copy()

    trace.clear()
    positions = {'hero': [0, 0], 'replacement': [75, 80], 'enemy': [100, 200]}
    stats = {37: .3, 81: 6}
    def move(unit, point):
        positions[unit] = point
        trace.append(['move', unit, point])
    def write(unit, key, value):
        stats[key] = value
        trace.append(['stat', unit, key, value])
    env = {'Tower_ALL': {1: 'hero'}, 'A180_Dur': {1: 'hero'}, 'TxShow': False,
           'DestroyTimer': note('destroy'), 'RemoveUnit': note('remove'),
           'SetUnitPositionLoc': move, 'SetUnitState': write, 'ConvertUnitState': int,
           'GetUnitState': lambda u, key: stats[key], 'SetUnitVertexColor': note('color'),
           'PercentTo255': lambda _: 255, 'GetUnitTypeId': lambda _: 'H046', 'GetId': str,
           'UnitRemoveAbility': note('ability'), 'SetUnitTurnSpeed': note('turn'),
           'Location': lambda x, y: [x, y], 'GetUnitX': lambda u: positions[u][0],
           'GetUnitY': lambda u: positions[u][1], 'GetRandomInt': lambda lo, hi: lo,
           'SetUnitFacing': note('facing'), 'AngleBetweenPoints': lambda *_: 0,
           'GetUnitLoc': lambda u: positions[u], 'IssueTargetOrder': note('order')}
    def traversal():
        env['A180_Dur'][1] = 'hero'
        return [env, {1: 'visual'}, {1: .9}, {1: 1}, {1: {1: 'enemy'}},
                {1: 'period'}, {1: [0, 0]}, {1: .5}]

    advance = function('main/f127/f0')
    upvalues = traversal()
    execute(advance, upvalues, (1,))
    assert positions['hero'] == [110, 210]
    assert trace[-1] == ['order', 'hero', 'attack', 'enemy']
    assert upvalues[3][1] == 2 and stats == {37: .3, 81: 6}
    request = trace.copy()
    trace.clear()
    execute(advance, upvalues, (1,))
    assert positions['hero'] == [0, 0] and abs(stats[37] - 1.2) < 1e-12 and stats[81] == 1
    assert all(table.get(1) is None for table in upvalues[1:]) and env['A180_Dur'].get(1) is None
    assert not any(row[0] == 'order' for row in trace)
    finish = trace.copy()
    slot_results = {}
    for carrier in ('replacement', None):
        trace.clear()
        env['Tower_ALL'] = {1: carrier} if carrier else {}
        upvalues = traversal()
        execute(advance, upvalues, (1,))
        assert env['A180_Dur'] == {1: 'hero'} and upvalues[3][1] == 2
        assert trace == ([['move', carrier, [110, 210]], ['facing', carrier, 0],
                          ['order', carrier, 'attack', 'enemy']] if carrier else [])
        step = trace.copy()
        trace.clear()
        execute(advance, upvalues, (1,))
        assert env['A180_Dur'] == {} and all(table.get(1) is None for table in upvalues[1:])
        assert trace[:2] == [['destroy', 'period'], ['remove', 'visual']]
        if carrier:
            assert positions[carrier] == [0, 0]
            assert ['move', carrier, [0, 0]] in trace and ['turn', carrier, .5] in trace
        else:
            assert len(trace) == 2
        slot_results['replacement' if carrier else 'empty'] = {'step': step, 'finish': trace.copy()}

    rows = source.instructions(db, 'main/f291/f1', 1251, 1272)
    damage_dispatch = {'function': 'main/f291/f1',
                       'instructions': [{'raw': ' '.join([r['op'], *r['args']])} for r in rows],
                       'labels': {'l1267': 17, 'l1273': 23},
                       'constants': {key: value for row in rows for key, value in row['constants'].items()}}
    mode_outputs = {}
    for mode, expected in ((0, 270), (1, 250), (2, 270)):
        casts = {'Game_Mode': mode, 'A180_Dur': {1: 'hero'}, 'IsInTable': locate}
        damage = []
        japi = {'GetEventDamage': lambda _: 100, 'EXSetEventDamage': damage.append}
        execute(damage_dispatch, [casts, japi], (None, None, 'hero'))
        assert damage == [expected]
        execute(damage_dispatch, [casts, japi], (None, None, 'replacement'))
        assert damage == [expected]
        mode_outputs[mode] = damage[0]
    return {'baselineId': 'legacy-control-and-cast-closure-v1', 'status': 'implementation_ready',
            'skillIds': ['A007', 'A057', 'A180'], 'originalClientTested': False,
            'objects': facts, 'casterTiming': casters, 'A057CountReferences': refs,
            'sourceLocations': {'cleanup': 'main/f291/f4:167402-167590',
                                'A057Callback': 'main/f51/f0:68932-69016',
                                'A180Advance': 'main/f127/f0:96177-96420'},
            'reuse': ['skill-stone-gaze.md', 'skill-culling-blade.md', 'skill-focus-fire.md',
                      'shared-attack-resolution.md', 'pathing-and-placement.md', 'focus-fire-native.md',
                      'doom-devour-borrowed-skills.md'],
            'webChoices': {'pause': 'one source-written boolean, independent of native stun/other locks',
                           'T012_T020': 'explicitly named visual-only shells; no unspecified corrosion',
                           'A057': 'current actual table slot; T410/T220 separate buff lifecycle',
                           'A180': 'current actual Tower_ALL slot carrier; normal attack requests with movement adapter',
                           'A180Damage': 'live O membership in A180_Dur; Game_Mode 1 ×2.5, other modes ×2.7'},
            'validation': {'sourceVM': {'A057CurrentSlot': replacement, 'A057EmptySlot': empty,
                                         'A180RequestOnly': request, 'A180EndNextAdvance': finish,
                                         'A180CurrentSlot': slot_results, 'A180DamageByGameMode': mode_outputs},
                           'probesPassed': 9}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    with source.connect() as db:
        result = audit(db)
    normalized = json.loads(json.dumps(result, ensure_ascii=False))
    if args.check:
        assert json.loads(OUT.read_text()) == normalized
    else:
        OUT.write_text(json.dumps(normalized, ensure_ascii=False, indent=2) + '\n')
    print('3 skills ready; 7 ability objects and 6 caster timings checked; 9 original-VM boundary probes passed')
