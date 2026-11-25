#!/usr/bin/env python3
"""Read-only source audit and bounded probes for P001-P013/B015.

This is an evidence builder, not a game runtime or a Warcraft emulator.
"""
import ast
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REF = ROOT / "reference/map-6.25"
LINES = (REF / "main.disasm").read_text().splitlines()


def parse(name):
    start = LINES.index(".function\t" + name)
    end = next((i for i in range(start + 1, len(LINES)) if LINES[i].startswith('.function')), len(LINES))
    constants, instructions, labels = {}, [], {}
    for i in range(start, end):
        s = LINES[i].strip()
        if s.startswith('.constant'):
            _, key, raw = s.split(None, 2)
            constants[key] = {'nil': None, 'true': True, 'false': False}.get(raw) if raw in {'nil', 'true', 'false'} else ast.literal_eval(raw.removeprefix('L') if raw.startswith('L"') else raw)
        elif s.startswith('.label'):
            labels[s.split()[1]] = len(instructions) + 1
        elif s and not s.startswith('.'):
            raw = s.split(';')[0].strip()
            parts = raw.split()
            instructions.append({'pc': len(instructions) + 1, 'line': i + 1, 'op': parts[0], 'args': parts[1:], 'raw': raw})
    return {'function': name, 'lines': [start + 1, end], 'constants': constants, 'instructions': instructions, 'labels': labels}


def truth(v):
    return v is not None and v is not False


def equal(a, b):
    if isinstance(a, bool) != isinstance(b, bool):
        return False
    return a == b


def execute(fn, env, args=()):
    reg, pc, top, steps = dict(enumerate(args)), 1, 0, 0
    def read(x):
        return fn['constants'][x] if x.startswith('k') else reg.get(int(x[1:]))
    while pc <= len(fn['instructions']):
        steps += 1
        assert steps < 1000, fn['function']
        ins = fn['instructions'][pc - 1]
        op, a = ins['op'], ins['args']
        nxt = pc + 1
        dst = int(a[0][1:]) if a and a[0].startswith('r') else None
        if op == 'gettabup': reg[dst] = env[read(a[2])]
        elif op == 'move': reg[dst] = read(a[1])
        elif op == 'loadk': reg[dst] = read(a[1])
        elif op == 'loadnil':
            for j in range(dst, dst + int(a[1]) + 1): reg[j] = None
        elif op == 'loadbool':
            reg[dst] = a[1] == '1'
            if a[2] == '1': nxt += 1
        elif op == 'len': reg[dst] = len(read(a[1]))
        elif op == 'concat': reg[dst] = ''.join(str(reg[j]) for j in range(int(a[1][1:]), int(a[2][1:]) + 1))
        elif op == 'sub': reg[dst] = read(a[1]) - read(a[2])
        elif op == 'jmp': nxt = fn['labels'][a[-1]]
        elif op in ('eq', 'lt', 'le'):
            left, right = read(a[1]), read(a[2])
            result = equal(left, right) if op == 'eq' else left < right if op == 'lt' else left <= right
            if result != (a[0] == '1'): nxt += 1
        elif op == 'test':
            if truth(read(a[0])) != (a[1] == '1'): nxt += 1
        elif op == 'call':
            argc, returns = int(a[1]), int(a[2])
            values = [reg.get(j) for j in range(dst + 1, dst + argc if argc else top)]
            result = reg[dst](*values)
            result = result if isinstance(result, tuple) else (result,)
            if returns == 0:
                for j, value in enumerate(result): reg[dst + j] = value
                top = dst + len(result)
            elif returns > 1:
                for j in range(returns - 1): reg[dst + j] = result[j] if j < len(result) else None
        elif op == 'return': return
        else: raise AssertionError((fn['function'], pc, op))
        pc = nxt


build, level = parse('main/f291/f7'), parse('main/f291/f18')
item = parse('main/f285/f10')
item_fragment = [x for x in item['instructions'] if 268 <= x['pc'] <= 422]
profiles_text = (REF / 'units_campaignabilitystrings.txt').read_text()
profiles = {}
for chunk in profiles_text.split('\n[')[1:]:
    ident, _, body = chunk.partition(']\n')
    profiles[ident] = dict(line.split('=', 1) for line in body.splitlines() if '=' in line)
abilities = {x['alias']: x for x in json.loads((REF / 'units_abilitydata.json').read_text())}
overrides = json.loads((REF / 'war3map.w3a.json').read_text())
qualifications = json.loads((ROOT / 'docs/rules/economy-data.json').read_text())['qualifications']
for row in qualifications:
    ident = row['id']
    assert profiles[ident]['Requires'] == row['requireUnit']
    assert abilities[ident]['BuffID1'] == 'B015' and abilities[ident]['code'] == 'AOae'
    assert abilities[ident]['targs1'] == 'self,invulnerable,nonhero,hero'
    assert not any(x.get('old') == ident or x.get('new') == ident for x in overrides)
    row['ability'] = abilities[ident]
    row['actualProfile'] = profiles[ident]

build_cases = []
for hero, unit_type in [(True, 'H001'), (False, 'n208'), (False, 'n001')]:
    for roll in range(1, 14):
        trace, unit, towers = [], {'type': unit_type, 'abilities': {}, 'hero': hero}, []
        def log(name):
            return lambda *xs: trace.append([name, *[x if isinstance(x, (str, int, float, bool, type(None))) else 'unit' for x in xs]])
        def add(t, u): t.append(u); return len(t)
        def draw(lo, hi): trace.append(['random', lo, hi, roll]); return roll
        def add_ability(u, ident): u['abilities'][ident] = 1; trace.append(['add', ident]); return True
        env = {'AddArrAny': add, 'Tower_ALL': towers, 'SetUnitUserData': log('userdata'),
               'GetUnitAbilityLevel': lambda u, ident: u['abilities'].get(ident, 0), 'GetId': lambda x: x,
               'IssueImmediateOrder': log('order'), 'UnitRemoveAbility': log('remove'),
               'IsUnitType': lambda u, tag: u['hero'], 'UNIT_TYPE_HERO': 'HERO',
               'EXSetUnitMoveType': log('moveType'), 'SetUnitState': log('state'),
               'UNIT_STATE_MANA': 'MANA', 'UNIT_STATE_MAX_MANA': 'MAX_MANA',
               'GetUnitState': lambda u, tag: 1000, 'GetUnitTypeId': lambda u: u['type'],
               'tostring': str, 'GetRandomInt': draw, 'UnitAddAbility': add_ability,
               'SetUnitAbilityLevel': log('level'), 'UnitMakeAbilityPermanent': log('permanent')}
        execute(build, env, (unit,))
        expected = hero or unit_type == 'n208'
        draws = [x for x in trace if x[0] == 'random']
        assert len(draws) == int(expected)
        assert unit['abilities'] == ({f'P{roll:03d}': 1} if expected else {})
        if expected:
            assert [x[0] for x in trace].index('state') < [x[0] for x in trace].index('random')
            assert trace[-1] == ['permanent', 'unit', True, f'P{roll:03d}']
        build_cases.append({'hero': hero, 'type': unit_type, 'roll': roll, 'assigned': list(unit['abilities']), 'drawCount': len(draws)})

level_cases = []
for mode in [0, 1, 2]:
    for original_level in [19, 20, 21, 25, 30]:
        for buff in [0, 1]:
            for a225 in [0, 1]:
                trace, unit = [], {'level': original_level}
                def strip(u, amount): trace.append(['strip', amount]); u['level'] -= amount
                env = {'GetLevelingUnit': lambda: unit, 'GetUnitLevel': lambda u: u['level'],
                       'GetId': lambda x: x, 'GetUnitAbilityLevel': lambda u, ident: a225 if ident == 'A225' else buff,
                       'UnitAddAbility': lambda u, ident: trace.append(['add', ident]),
                       'UnitRemoveAbility': lambda u, ident: trace.append(['remove', ident]),
                       'Game_Mode': mode, 'UnitStripHeroLevel': strip,
                       'WAbility_W019': lambda u, value: trace.append(['W019', value])}
                execute(level, env)
                expected = 20 if mode != 2 and original_level > 20 and buff == 0 else original_level
                assert unit['level'] == expected and trace[-1] == ['W019', expected]
                assert [x for x in trace if x[0] == 'strip'] == ([['strip', original_level - 20]] if expected != original_level else [])
                assert trace[:2] == [['add', 'T299'], ['remove', 'T299']] if a225 else not any(x[0] in ['add', 'remove'] for x in trace)
                level_cases.append({'mode': mode, 'level': original_level, 'B015': buff, 'A225': a225, 'trace': trace})

data = {
    'schemaVersion': 1, 'baselineId': 'qualification-lifecycle-v1',
    'scope': 'P001-P013 native prerequisite/B015 lifecycle; complete assignment and level-up handlers, bounded pickup gate',
    'sourceFiles': [{'path': str(p.relative_to(ROOT)), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in [REF/'main.disasm', REF/'main.readable.lua', REF/'units_abilitydata.json', REF/'units_campaignabilitystrings.txt', REF/'war3map.w3a.json', ROOT/'docs/rules/economy-data.json']],
    'qualifications': qualifications, 'fullFunctions': [build, level],
    'pickupGate': {'function': 'main/f285/f10', 'pcs': [268, 422], 'constants': item['constants'], 'instructions': item_fragment},
    'sourceFacts': {
        'assignment': 'handler assigns one uniform P001..P013 to native HERO or n208, after registration/stop/mana refill; permanent flag does not prove unconditional B015',
        'noLossCallback': 'Only three literal B015 queries in business Lua: two pickup branches, one level-up branch; no literal script removes B015 on prerequisite loss',
        'upgradeGate': 'mode!=2 and level>20 and B015<=0 -> strip level-20; A225/T299 before gate, W019 after gate',
        'pickupGate': 'mode!=2, not box/worker, item level>3, not ignore_strong_item instance; ordinary bear companion reads linked Tower_ALL owner unless A_ITEM_ID; otherwise recipient B015',
        'existingGearAndLevels': 'Source contains no B015-loss event to strip levels or force existing items out; only subsequent specified events check it'
    },
    'webSelections': {
        'authority': 'Q24, researched native prerequisite and aura timing; not original client measurement',
        'requiredUnit': 'At least one existing alive completed non-illusion unit of exact required type owned by the qualified unit owner; cards/unfinished buildings/allies/corpses do not count',
        'qualificationHolder': 'exists, alive, visible, enabled positive P001-P013; self-only, native HERO not required (n208 supported); invulnerability/magic immunity allowed',
        'temporaryEmissionSuppression': 'hidden/invisible/illusion/hex/burrow source suppresses this aura contribution; stun/silence/pause do not independently suppress it',
        'recompute': 'immediate after relevant committed owner/type/completion/life/ability/state change; zero linger, no extra RNG/timer; exact-current-type requirement',
        'stacking': 'any qualifying held P001-P013 yields one B015 contribution; independent explicit external contributions retained',
        'extraStats': 'none: no native stock Endurance move/attack bonus inherited from missing DataA/B',
        'onLoss': 'remove qualification contribution only; do not alter current level/XP/items, no synthetic level-up/pickup event; later events follow existing script',
        'deathAndRevival': 'permanent qualification id retained if same logical entity; B015 contribution absent while dead, recomputed on revival; no reroll',
        'dispel': 'ordinary magic dispel does not remove this aura; explicit rawcode removal executes then recomputes from still-valid emitters',
        'save': 'persist selected ability, actual providers and event position; rebuild derived B015 without replaying random assignment or level-up',
        'onlyKnownAssignmentCalls': ['Lua76877 direct item path', 'Lua115433 build-complete wrapper'],
        'repeatedActualHandler': 'not silently deduplicated; if legitimately called again, preserve source registration/random/add behavior'
    },
    'primaryEvidence': [{'url': 'https://classic.battle.net/war3/basics/spellbasics.shtml', 'supports': 'self-benefit, universal auras, nonstacking and hidden/invisible emission; does not settle this custom prerequisite lifecycle'}],
    'verification': {'sourceInstructionCount': len(build['instructions']) + len(level['instructions']) + len(item_fragment), 'buildCases': build_cases, 'levelCases': level_cases, 'objectProfiles': 13, 'originalClientRun': False, 'webGameRun': False},
    'remaining': ['full native unit-upgrade technology accounting uses placement/upgrade transaction integration', 'hero natural stat and learned-skill rollback on UnitStripHeroLevel', 'full bear companion identity/lifecycle and all item pickup branches', 'matched-client evidence for chosen native prerequisite/aura timing']
}
out = ROOT / 'docs/rules/qualification-lifecycle.json'
out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'sourceInstructions': data['verification']['sourceInstructionCount'], 'assignmentCases': len(build_cases), 'levelCases': len(level_cases), 'profiles': 13}, ensure_ascii=False))
