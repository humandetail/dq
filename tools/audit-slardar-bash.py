#!/usr/bin/env python3
"""Read-only source audit and explicit Web contract vectors for A032.

No Warcraft client or game implementation is executed. --write refreshes only
the evidence JSON; --check compares it with independently re-read inputs.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'reference/map-6.25'
OUT = ROOT / 'docs/rules/skill-slardar-bash.json'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def row_from(file, key, value):
    path = SOURCE / file
    row = next(x for x in json.loads(path.read_text()) if x[key] == value)
    lines = path.read_text().splitlines()
    line = next(i + 1 for i, s in enumerate(lines) if f'"{key}": "{value}"' in s)
    return {'path': str(path.relative_to(ROOT)), 'line': line, 'record': row}


def slk(alias):
    columns, rows = {}, {}
    x = y = 0
    for s in (SOURCE / 'units_abilitydata.slk').read_text().splitlines():
        if not s.startswith('C;'):
            continue
        a, b, c = re.search(r';X(\d+)', s), re.search(r';Y(\d+)', s), re.search(r';K(.*)$', s)
        if a:
            x = int(a[1])
        if b:
            y = int(b[1])
        if not c:
            continue
        raw = c[1]
        value = raw[1:-1].replace('""', '"') if raw.startswith('"') else float(raw) if '.' in raw else int(raw)
        if y == 1:
            columns[x] = value
        else:
            rows.setdefault(y, {})[columns[x]] = value
    return next(row for row in rows.values() if row['alias'] == alias)


def contract(rank, roll, *, ordinary=True, hit=True, illusion=False, eligible=True,
             immune=False, ethereal=False, structure=False, mechanical=False,
             hero=False, resistant=False):
    # These are explicitly selected local Web semantics, not source execution.
    if rank not in range(1, 7) or not ordinary or not hit or illusion or not eligible or ethereal:
        return {'draws': 0, 'bonus': 0, 'stun': 0}
    success = roll <= 10
    return {'draws': 1, 'bonus': [220, 460, 700, 1040, 1300, 1600][rank - 1] if success else 0,
            'stun': (0 if structure or mechanical else .4 if hero or resistant else 1) if success else 0}


def build():
    books = []
    for path in [ROOT / '图鉴.xlsx', Path('/Users/laihanbin/Downloads/刀圈TD 6.25 图鉴.xlsx')]:
        book = openpyxl.load_workbook(path, read_only=True, data_only=True)
        sheet = book['塔技能']
        rows = []
        for n in [412, 601]:
            cells = next(sheet.iter_rows(min_row=n, max_row=n, max_col=10))
            values = {c.coordinate: c.value for c in cells}
            assert values[f'F{n}'] == 'A032' and '10%' in values[f'H{n}']
            assert '眩晕1秒' in values[f'I{n}'] and values[f'J{n}'] is None
            rows.append({'row': n, 'cells': values})
        book.close()
        books.append({'path': str(path), 'sha256': sha(path), 'rows': rows})
    assert books[0]['rows'] == books[1]['rows']
    ability = row_from('units_abilitydata.json', 'alias', 'A032')
    assert slk('A032') == ability['record']
    overrides = [x for x in json.loads((SOURCE / 'war3map.w3a.json').read_text()) if x['old'] == 'A032']
    assert [(m['level'], m['key'], m['value']) for x in overrides for m in x['mods']] == [(5, 'Hbh3', 1300.0), (6, 'Hbh3', 1600.0)]
    assert [ability['record'][f'DataA{i}'] for i in range(1, 5)] == [8, 8, 8, 8]
    assert [ability['record'][f'DataC{i}'] for i in range(1, 5)] == [220, 460, 700, 1040]
    for prefix in ['DataB', 'DataD', 'DataE', 'Cool', 'Cost']:
        assert not any(f'{prefix}{i}' in ability['record'] for i in range(1, 7))
    lines = (SOURCE / 'main.disasm').read_text().splitlines()
    refs = [i + 1 for i, line in enumerate(lines) if re.search(r'"A032"', line)]
    assert not refs
    tooltip = (SOURCE / 'units_campaignabilitystrings.txt').read_text().splitlines()
    start = tooltip.index('[A032]')
    end = next(i for i in range(start + 1, len(tooltip)) if tooltip[i].startswith('['))
    cases = []

    def check(name, actual, expected):
        assert actual == expected, (name, actual, expected)
        cases.append({'name': name, 'actual': actual, 'expected': expected})

    for rank, damage in enumerate([220, 460, 700, 1040, 1300, 1600], 1):
        for roll in range(1, 101):
            check(f'rank{rank}/roll{roll}', contract(rank, roll), {'draws': 1, 'bonus': damage if roll <= 10 else 0, 'stun': 1 if roll <= 10 else 0})
    for flag in ['ordinary', 'hit', 'eligible']:
        check(flag + ' false draws none', contract(6, 1, **{flag: False}), {'draws': 0, 'bonus': 0, 'stun': 0})
    for flag in ['illusion', 'ethereal']:
        check(flag + ' rejects', contract(6, 1, **{flag: True}), {'draws': 0, 'bonus': 0, 'stun': 0})
    for rank in [0, 7]:
        check('invalid rank ' + str(rank), contract(rank, 1), {'draws': 0, 'bonus': 0, 'stun': 0})
    for flag, duration in [('immune', 1), ('hero', .4), ('resistant', .4), ('structure', 0), ('mechanical', 0)]:
        check('target ' + flag, contract(6, 10, **{flag: True}), {'draws': 1, 'bonus': 1600, 'stun': duration})
    # Shared contracts: bonus after native critical multiplier, one physical packet;
    # extend BPSE by max deadline, without shortening or stacking durations.
    check('one packet critical then flat bash', 100 * 3 + contract(1, 1)['bonus'], 520)
    check('one physical armor layer', (100 * 3 + 220) / (1 + .018 * 100), 520 / 2.8)
    for old, now, duration, expected in [(0, 10, 1, 11), (12, 10, 1, 12), (10.2, 10, .4, 10.4)]:
        check('BPSE deadline ' + str((old, now, duration)), max(old, now + duration), expected)
    return {
        'baseline': 'slardar-bash-v1', 'id': 'A032', 'status': 'bounded native effect specified',
        'workbooks': books, 'ability': ability, 'objectOverrides': overrides,
        'tooltip': {'path': 'reference/map-6.25/units_campaignabilitystrings.txt', 'lines': [start + 1, end], 'text': tooltip[start:end]},
        'units': {id_: {file: row_from(file, key, id_) for file, key in [('units_unitweapons.json', 'unitWeapID'), ('units_unitabilities.json', 'unitAbilID')]} for id_ in ['H009', 'G044']},
        'scriptLiteralReferences': refs,
        'numericDecision': {'authority': 'user global workbook numeric priority', 'sourceChanceLevels1To4': [8, 8, 8, 8], 'sourceChanceLevels5To6': [None, None], 'selectedChanceAllLevels': 10, 'bonusDamage': [220, 460, 700, 1040, 1300, 1600], 'normalStunSeconds': 1, 'heroOrResistantStunSeconds': .4, 'heroDurationBoundary': 'Object explicitly differentiates HERO1-4=.4; workbook has no separate hero row. Explicit Q24 repeats .4 for missing levels5-6, not a raw source value.'},
        'webChoices': {'probability': 'independent uniform1..100, <=10; only eligible successful nonillusion ordinary weapon hit', 'damage': 'flat bonus after native critical multiplier within original physical packet; no second event', 'eligibility': 'weapon-legal hostile unit, ground/air per actual weapon; no hidden/Aloc/invulnerable/ethereal; magic immunity allowed', 'stun': 'before packet; no stun to structures/mechanical; BPSE max deadline shared with prior local adapters; no ordinary dispel or N535 consumption', 'absentDataBDE': [1, 0, False], 'cooldownMana': 'no independent cooldown or mana charge for this passive', 'rankTiming': 'read current enabled actual rank at ordinary hit; missing/disabled rank no draw', 'sourceDeath': 'requires actual nonillusion source handle; emitted attacks retain source through death under weapon interface; removal cancels', 'abilityRemoval': 'prevents later procs; already-applied target BPSE remains until its own cleanup'},
        'primarySources': ['https://classic.battle.net/war3/human/units/mountainking.shtml', 'https://classic.battle.net/war3/basics/spellbasics.shtml'],
        'sourceHashes': {file: sha(SOURCE / file) for file in ['main.disasm', 'units_abilitydata.slk', 'units_abilitydata.json', 'war3map.w3a.json', 'units_unitweapons.json', 'units_unitabilities.json', 'units_campaignabilitystrings.txt']},
        'validation': {'readOnlyWorkbookCells': 40, 'contractCaseCount': len(cases), 'cases': cases, 'nativeRuntimeTested': False},
        'remaining': ['complete ordinary-attack/missile pipeline and all equipment interactions', 'generic illusion inheritance', 'destructible/item damage lifecycle; these are not units or Bash targets']
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    data = build()
    if args.write:
        OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    if args.check:
        assert json.loads(OUT.read_text()) == data
    print(json.dumps({'status': 'passed', 'sourceAbility': 'A032', 'bookCells': 40, 'contractCases': data['validation']['contractCaseCount'], 'nativeRuntimeTested': False}))
