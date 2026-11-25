#!/usr/bin/env python3
"""Locate recorded tooltip versus execution differences and verify selected Q61 values."""
import argparse
import ast
from fractions import Fraction
import heapq
import json
import math
from pathlib import Path
import re


RULES = Path(__file__).resolve().parents[1] / 'docs/rules'
EXCLUDED = {'area-active-batch-01', 'divine-books', 'q61-reconciliation'}
HINT = re.compile(r'提示|实际说明|原说明|(?i:ubertip|tooltip|(?:player|source)[_ ]?hint)')
DIFFERENCE = re.compile(r'差异|冲突|不符|残留|模板|而|图鉴.{0,8}(?:未|无)|(?i:conflict|discrepanc|mismatch|override|stale|missing)')
PICKED = re.compile(r'采用|保留|补缺|覆盖|实际执行|脚本|执行值|(?i:select|preserv|actual|script|runtime|fallback)')


def collect():
    for path in sorted(RULES.glob('*')):
        if path.stem in EXCLUDED or path.suffix not in {'.md', '.json'}:
            continue
        for line, text in enumerate(path.read_text().splitlines(), 1):
            text = re.sub(r'\]\([^)]*\)', ']', text)
            if HINT.search(text) and DIFFERENCE.search(text) and PICKED.search(text) and re.search(r'\d', text):
                yield {'file': path.name, 'line': line}


def verify():
    def value(path, keys):
        data = machines[path]
        for key in keys:
            if isinstance(key, dict):
                data = next(row for row in data if all(row[k] == v for k, v in key.items()))
            else:
                data = data[key]
        return data

    data = json.loads((RULES / 'q61-reconciliation.json').read_text())
    machines = {name: json.loads((RULES / name).read_text())
                for name in {r['machine'] for r in data['entries'] if r['status'] == 'updated'}}
    for record in data['entries']:
        if record['status'] == 'updated':
            for keys, expected in record['checks']:
                assert value(record['machine'], keys) == expected, (record['id'],keys)
    probes = numerical_probes(machines)
    assert probes == data['validation']['numericalProbes']
    return len(data['entries'])


def selected_probes(tool, names, dependencies):
    path = RULES.parent.parent / 'tools' / tool
    source = ast.parse(path.read_text(), filename=str(path))
    nodes = {node.name: node for node in source.body if isinstance(node, ast.FunctionDef)}
    assignments = {node.targets[0].id: node for node in source.body
                   if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name)}
    subset = ast.Module(body=[(nodes | assignments)[name] for name in names], type_ignores=[])
    exec(compile(subset, str(path), 'exec'), dependencies)
    return dependencies


def numerical_probes(machines):
    zeus = machines['zeus-skills.json']
    cloud = zeus['rules']['A106']
    rage = zeus['rules']['A107']
    z = selected_probes('audit-zeus-skills.py', [
        'CLOUD_RADIUS', 'RAGE_SCEPTER_PERCENT', 'RAGE_SCEPTER_ABYSS_MULTIPLIER',
        'selected_cloud', 'selected_rage_scepter',
    ], {'heapq': heapq, 'json': json, 'math': math})
    assert cloud['sourceLuaRadius'] == 450 and cloud['sourcePlayerHintRadius'] == 500
    assert '500范围' in zeus['profiles']['A106']['Ubertip']
    assert zeus['profiles']['A107']['Ubertip'].count('已损失生命值的12%的神圣伤害（该伤害对深渊BOSS伤害减半）') == 6
    a107_rows = [row for row in zeus['workbookRows']['rowsMatchAcrossBothWorkbooks'].values()
                 if row[5] == 'A107']
    assert len(a107_rows) == 2 and all('神杖' not in str(row[7:9]) for row in a107_rows)
    assert (z['CLOUD_RADIUS'], z['RAGE_SCEPTER_PERCENT'], z['RAGE_SCEPTER_ABYSS_MULTIPLIER']) == (
        cloud['radius'], rage['scepterPercentMissingLife'], rage['scepterAbyssMultiplier'])
    assert z['selected_cloud']() == zeus['verification']['selectedA106']
    assert z['selected_rage_scepter']() == zeus['verification']['selectedA107ScepterQ61']

    wisp = machines['wisp-link-overcharge-relocate.json']
    w = selected_probes('audit-wisp-link-overcharge-relocate.py', [
        'selected_grade', 'selected_amount', 'candidate_floor', 'candidate_nearest',
    ], {'Fraction': Fraction})
    for id in ('A112', 'A142', 'A143'):
        lines = wisp['abilities'][id]['profile']['lines']
        assert next(line for line in lines if line.startswith('Ubertip=')).count('无尽中传递效果提升50%') == 6
    assert wisp['a112']['raw']['workbookEndlessBonus'] is None
    grade, amount = w['selected_grade'], w['selected_amount']
    endless = [amount(grade(stat,1,True)) for stat in (699,700,9999,10000)]
    assert endless == [140,210,2940,3000]
    assert amount(grade(1000,1)) == 140
    for vector in wisp['validation']['comparisonVectors']:
        args = vector['sourceStat'], vector['level'], vector['endless']
        assert (vector['floor70'], vector['nearest70HalfDown']) == (
            w['candidate_floor'](*args), w['candidate_nearest'](*args))

    hero = machines['hero-aura-family.json']
    rank = next(entry for entry in hero['entries'] if entry['id'] == 'A072')
    radius = rank['selected_parameters']['scepter_secondary_radius']
    distances = [280,280.001,350,350.001]
    splashes = [distance <= radius for distance in distances]
    assert splashes == [True,True,True,False]
    assert '350范围' in str(rank['actual_profile'])
    assert hero['tooltip_only_differences'][0]['workbook_radius'] is None
    return {'A106IncludedDistances': z['selected_cloud']()['Q61IncludedDistances'],
            'A107ScepterAmounts': z['selected_rage_scepter'](),
            'A112EndlessAt699_700_9999_10000': endless, 'A072ClosedRadiusCases': splashes}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidates', action='store_true')
    args = parser.parse_args()
    if args.candidates:
        result = list(collect())
        print(json.dumps({'count': len(result), 'locations': result}, ensure_ascii=False))
    else:
        print(f'{verify()} recorded Q61 dispositions checked')
