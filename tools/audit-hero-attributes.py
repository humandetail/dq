#!/usr/bin/env python3
"""Read-only attribute inventory and bounded W019 probes (bundled openpyxl).

Rebuilds only docs/rules/hero-attribute-interface.json, never the workbooks.
"""
import ast
import hashlib
import json
import math
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parents[1]
REF = ROOT / 'reference/map-6.25'
lines = (REF / 'main.disasm').read_text().splitlines()
functions = {}
for number, line in enumerate(lines, 1):
    if line.startswith('.function'):
        name = line.split()[1]
        functions[name] = {'function': name, 'startLine': number, 'constants': {}, 'instructions': [], 'labels': {}}
    if not functions:
        continue
    f = functions[name]
    if line.startswith('.constant'):
        _, key, raw = line.split(None, 2)
        f['constants'][key] = {'nil': None, 'true': True, 'false': False}[raw] if raw in ['nil', 'true', 'false'] else ast.literal_eval(raw.removeprefix('L') if raw.startswith('L"') else raw)
    elif line.startswith('.label'):
        f['labels'][line.split()[1]] = len(f['instructions']) + 1
    elif line.strip() and not line.startswith('.'):
        parts = line.split(';')[0].split()
        f['instructions'].append({'pc': len(f['instructions']) + 1, 'line': number, 'op': parts[0], 'args': parts[1:]})

setters = []
for f in functions.values():
    for i, ins in enumerate(f['instructions']):
        if ins['op'] != 'gettabup' or f['constants'].get(ins['args'][-1]) not in ['SetHeroStr', 'SetHeroAgi', 'SetHeroInt']:
            continue
        register = ins['args'][0]
        end = next(j for j in range(i + 1, len(f['instructions'])) if f['instructions'][j]['op'] == 'call' and f['instructions'][j]['args'][0] == register)
        call, previous = f['instructions'][end], f['instructions'][end - 1]
        assert call['args'][1:] == ['4', '1']
        assert previous['op'] == 'loadbool' and previous['args'] == [f'r{int(register[1:])+3}', '1', '0']
        setters.append({'function': f['function'], 'native': f['constants'][ins['args'][-1]], 'loadLine': ins['line'], 'callLine': call['line'], 'booleanProducerLine': previous['line'], 'permanent': True, 'scope': 'literal call and boolean only; surrounding skill not automatically audited'})
assert len(setters) == 47
assert sum(not x['function'].startswith('main/f6/') for x in setters) == 44

w019 = functions['main/f296/f21']
def run_w019(unit, level, talent, old):
    trace = []
    stored = {} if old is None else {1: old}
    stats = {'Str': 100, 'Agi': 200, 'Int': 300}
    def setter(key):
        def set_value(u, value, permanent):
            assert permanent is True
            stats[key] = value
            trace.append([key, value])
        return set_value
    env = {'IsUnitType': lambda u, tag: u['hero'], 'UNIT_TYPE_HERO': 'HERO',
           'GetPlayerId': lambda p: p, 'GetOwningPlayer': lambda u: 0,
           'Player_Build_Unit': {1: 'worker'}, 'GetUnitAbilityLevel': lambda u, a: talent,
           'GetId': lambda x: x, 'IsInTable': lambda u, t: 1, 'Tower_ALL': [unit],
           'math': {'floor': math.floor}}
    for key in stats:
        env['GetHero' + key] = lambda u, bonus, k=key: stats[k]
        env['SetHero' + key] = setter(key)
    upvalues = {'u0': env, 'u1': stored}
    registers, pc, top = {0: unit, 1: level}, 1, 0
    def value(a):
        return w019['constants'][a] if a.startswith('k') else registers.get(int(a[1:]))
    def eq(a, b):
        return False if isinstance(a, bool) != isinstance(b, bool) else a == b
    while pc <= len(w019['instructions']):
        ins = w019['instructions'][pc - 1]
        op, a = ins['op'], ins['args']
        nxt = pc + 1
        dst = int(a[0][1:]) if a and a[0].startswith('r') else None
        if op == 'gettabup': registers[dst] = upvalues[a[1]].get(value(a[2]))
        elif op == 'settabup': upvalues[a[0]][value(a[1])] = value(a[2])
        elif op == 'gettable': registers[dst] = value(a[1]).get(value(a[2]))
        elif op == 'move': registers[dst] = value(a[1])
        elif op == 'loadk': registers[dst] = value(a[1])
        elif op == 'loadbool':
            registers[dst] = a[1] == '1'
            if a[2] == '1': nxt += 1
        elif op in ['add', 'sub', 'mul']:
            left, right = value(a[1]), value(a[2])
            registers[dst] = left + right if op == 'add' else left - right if op == 'sub' else left * right
        elif op in ['eq', 'le']:
            result = eq(value(a[1]), value(a[2])) if op == 'eq' else value(a[1]) <= value(a[2])
            if result != (a[0] == '1'): nxt += 1
        elif op == 'jmp': nxt = w019['labels'][a[-1]]
        elif op == 'call':
            argc, retc = int(a[1]), int(a[2])
            result = registers[dst](*[registers.get(j) for j in range(dst + 1, dst + argc if argc else top)])
            if retc == 0: registers[dst] = result; top = dst + 1
            elif retc > 1: registers[dst] = result
        elif op == 'return': break
        else: raise AssertionError((pc, op))
        pc = nxt
    return {'stats': stats, 'trace': trace, 'stored': stored}

cases = []
for kind in ['nil', 'nonhero', 'hero']:
    unit = None if kind == 'nil' else {'hero': kind == 'hero'}
    for level in [0, 1, 20, 21, 30]:
        for talent in [0, 1, 5]:
            amount = math.floor((talent * .5 + .5) * level)
            for old in [None, 0, 7, amount]:
                result = run_w019(unit, level, talent, old)
                eligible = kind == 'hero' and level != 0 and talent > 0
                changed = eligible and old != amount
                delta = amount - (old or 0) if changed else 0
                assert result['stats'] == {'Str': 100 + delta, 'Agi': 200 + delta, 'Int': 300 + delta}
                expected_writes = 6 if changed and old not in [None, 0] else 3 if changed else 0
                assert len(result['trace']) == expected_writes
                assert result['stored'] == ({1: amount} if changed else {} if old is None else {1: old})
                if expected_writes == 6: assert [x[0] for x in result['trace']] == ['Str','Agi','Int','Str','Agi','Int']
                cases.append({'kind': kind, 'level': level, 'talent': talent, 'previous': old, 'result': result})

abilities = {x['alias']: x for x in json.loads((REF/'units_abilitydata.json').read_text())}
mods = [x for x in json.loads((REF/'war3map.w3a.json').read_text()) if x['old'] == 'T000' or x['new'] == 'T000']
assert len(mods) == 1
t000 = []
for level in range(1, 7):
    values = {}
    for stat, raw, field in [('AGI', 'DataA', 'Iagi'), ('INT', 'DataB', 'Iint'), ('STR', 'DataC', 'Istr')]:
        selected = abilities['T000'].get(raw + str(level))
        for m in mods[0]['mods']:
            if m['key'] == field and m['level'] == level: selected = m['value']
        assert selected == level * 10
        values[stat] = selected
    t000.append({'level': level, 'bonuses': values})

# T101 is a distinct learned ID used by seven tower/skin rows, with the same
# explicitly stored Aamk attribute table. It must not disappear from coverage
# just because the majority of heroes learn T000 instead.
t101_mods = [x for x in json.loads((REF/'war3map.w3a.json').read_text()) if x['old'] == 'T101' or x['new'] == 'T101']
assert len(t101_mods) == 1
assert {k:v for k,v in abilities['T101'].items() if k != 'alias' and not k.startswith('DataD')} == {k:v for k,v in abilities['T000'].items() if k != 'alias' and not k.startswith('DataD')}
assert [abilities['T101'].get('DataD'+str(i)) for i in range(1,7)] == [1,1,1,1,None,None]
assert t101_mods[0]['mods'] == mods[0]['mods']
t101_books = []
for path in [ROOT/'图鉴.xlsx', Path('/Users/laihanbin/Downloads/刀圈TD 6.25 图鉴.xlsx')]:
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    entries = []
    for cells in workbook['塔技能'].iter_rows(max_col=10):
        if len(cells) < 6 or cells[5].value != 'T101':
            continue
        entry = {c.coordinate:c.value for c in cells}
        n = cells[5].row
        assert cells[6].value == 6 and all(str(v) in cells[8].value for v in [10,20,30,40,50,60])
        assert cells[9].value is None
        entries.append({'row':n,'cells':entry})
    workbook.close()
    assert [x['row'] for x in entries] == [8,28,63,68,223,228,248]
    t101_books.append({'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'rows':entries})
assert t101_books[0]['rows'] == t101_books[1]['rows']
assert not any(v == 'T101' for f in functions.values() for v in f['constants'].values() if isinstance(v,str))

growth = json.loads((ROOT/'docs/rules/hero-progression.json').read_text())['growthRecords']
balance = {x['unitBalanceID']: x for x in json.loads((REF/'units_unitbalance.json').read_text())}
templates = [{'unitId': g['unitId'], 'source': {k: balance[g['unitId']].get(k) for k in ['HP','manaN','mana0','Primary','regenHP','regenMana','regenType']}, 'selectedBaseMaxMana': 0, 'missingManaBasis': 'Q24 explicit 0 base plus INT contribution; not claiming source contains manaN=0'} for g in growth]
assert all(t['source']['manaN'] is None for t in templates)
assert not any(m['key'] in ['uhpm','umpm','umpi','uhpr','umpr','uhrt','upra'] for e in json.loads((REF/'war3map.w3u.json').read_text()) for m in e['mods'])

data = {
    'schemaVersion': 1, 'baselineId': 'hero-attribute-interface-v1',
    'scope': 'native HERO Get/SetHero* true interface, natural/T000/T101 attribute changes, direct maximum resource writes, full W019; not all item/skill effects',
    'sourceFiles': [{'path':str(p.relative_to(ROOT)), 'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [REF/'main.disasm',REF/'units_abilitydata.json',REF/'war3map.w3a.json',REF/'units_unitbalance.json',REF/'war3map.w3u.json',REF/'war3mapMisc.txt']],
    'setterInventory': setters, 'W019': w019, 'T000': {'sourceAbility':abilities['T000'],'overrides':mods,'selectedLevels':t000,'workbook':'Both books:129 identical occurrences; F13 through F688, G=6, H each learn+10 all attributes, I10/20/30/40/50/60'},
    'templates': templates,
    'T101': {'sourceAbility':abilities['T101'],'overrides':t101_mods,'selectedLevels':t000,'workbooks':t101_books,'sourceInstructionLiteralReferences':[],'status':'same explicitly verified Aamk attribute table and local contribution contract as T000; distinct learned ID','difference':{'DataD':'Ihid Hide Button, explicitly1 at levels1-4; source null5-6 retained','selectedUI':'hide learned command-card button at all six ranks; preserve learn/upgrade entry and inspection of effective contribution','authority':'Q24 local choice extends explicit hidden state to missing levels5-6; not removing ability or treating learning as unavailable','metadata':'https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/AbilityMetaData.slk#L8808','label':'https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt#L6187'}},
    'mapCoefficients': {'primaryAttack':1.4,'strengthMaxLife':15,'strengthLifeRegen':.1,'intelligenceMaxMana':12,'intelligenceManaRegen':.03,'agilityAttackRate':.002,'agilityArmor':0,'agilityArmorBase':0},
    'webSelections': {
        'getter': 'native HERO only; false returns integer base (natural + explicit base adjustment), true adds active integer attribute contributions including T000/T101/items; nonhero/nil/removed returns0',
        'setterTrue': 'absolute base assignment max(0,trunc(value)); preserve active bonus contributions and natural-growth ledger by changing explicit base adjustment; no skill/level event; all44 business calls use true',
        'derivedDelta': 'Each native HERO effective STR delta changes maxLife by15*delta, INT changes maxMana by12*delta; base template HP + attribute and separately owned contributions, maxLife>=1,maxMana>=0; Primary case-insensitive only STR/AGI/INT',
        'currentAfterAttributeDelta': 'For SetHero*(true), natural level changes and T000 rank changes, add actual corresponding maximum-resource delta to current; alive life clamp[1,newMax], dead life stays0; mana clamp[0,newMax]. Do not batch source subtract/add sequences; no revive/death/damage callbacks generated',
        'T000': 'actual learned rank1..6 adds10*rank to each bonus channel, not cumulative10+20; add/remove/disable/re-enable recomputes once. No standalone random/attack proc or learning script. Native HERO only. Illusion copying follows separately selected creation policy, not universal auto-copy here',
        'T101': 'same independently verified six-rank attribute contribution as T000; preserve distinct learned ID/paid history, hide learned command-card icon while keeping learning entry. No automatic granting T000 or double natural-growth write. Abnormal simultaneous T000+T101 acquisition is not invented by this adapter',
        'directMaximumWrite': 'SetUnitState MAX_LIFE/MAX_MANA changes corresponding direct offset so getter equals clipped requested total, retains offset on later stat changes; preserve absolute current with immediate clamp, do not add attribute-style delta; matches existing essence-aura local max-mana choice',
        'currentWrite': 'preserve fractions and clamp to resource bounds; mana cannot kill; life death/explicit resurrection event ordering is outside this attribute-only interface',
        'attackAndRegenContribution': 'effective primary*1.4 enters native base weapon amount once, effective AGI*.002 feeds attack-timing-v1, armor AGI contribution0; STR*.1 and INT*.03 feed native regen inputs, with unit regenType and other ability multipliers resolved by regen subsystem',
        'order': 'settle previously selected continuous regen to event time, then each native setter is observable in source order; W019 subtraction and addition are six separate calls when old nonzero; never replace with one net delta',
        'save': 'save base adjustment, natural baseline, explicit native contributions/direct max offsets, current resources, W019 old amount per tower slot; do not replay setter or learning callbacks',
        'falseSetter': 'No false call in47 literal source sites; not guessed as temporary attribute ownership. If later dynamic caller found, resolve separately before use'
    },
    'verification': {'W019SourceCases':len(cases),'W019Instructions':len(w019['instructions']),'cases':cases,'setterBooleanSites':47,'businessSetterSites':44,'T000Levels':6,'T101Levels':6,'T101ReadOnlyWorkbookCells':140,'clientRun':False,'gameRuntimeRun':False},
    'remaining': ['all skill/item-specific acquisition/reversal predicates around other setters','full Acha/ANeg and illusion attribute transfer','native regeneration eligibility/day/night/blight and percentage providers','general death/resurrection transaction and non-attribute current-life writes']
}
(ROOT/'docs/rules/hero-attribute-interface.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in data['verification'].items() if k!='cases'}))
