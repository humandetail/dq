#!/usr/bin/env python3
"""Verify summon-family source records and focused lifecycle contract examples."""
from contextlib import closing
import hashlib
import json
import runpy
import sys

import audit_index as index

OUT = index.ROOT / 'docs/rules/summon-family-batch-01.json'
IDS = ['A049', 'A125', 'A167', 'A209', 'A215']
EXPECTED = {
    'A049': ('AOsf', [2, 3, 3, 4, 4, 5], 25, ['b100','b100','b101','b101','b102','b102']),
    'A130': ('AOsf', [2, 3, 3, 4, 4, 5], 25, ['b144','b144','b145','b145','b146','b146']),
    'A125': ('AOsf', [1] * 6, None, [f'n{i}' for i in range(255,261)]),
    'A167': ('AOsf', [2, 2, 3, 3, 3, 3], 25, [f'b{i}' for i in range(150,156)]),
    'A209': ('AOsf', [1] * 6, 15, [f'b{i}' for i in range(156,162)]),
    'A215': ('AIfs', [2] * 6, 12, [f'b{i}' for i in range(162,168)]),
}
A125_PENDING = ['n255–260的N136/137、N138/139、N140/141与T104',
                'f97/f0–f5重召及槽物品备存/恢复、回收死亡、周期S18与神杖',
                'f99/f1、f182/f1、f291/f14 PC849–877、f291/f27 PC1988–2015']


def index_evidence():
    with closing(index.connect()) as db:
        def one(identifier, table):
            entry, = index.objects(db, identifier, table)
            return entry

        abilities, units, workbook = {}, {}, {}
        for skill, (code, counts, duration, ids) in EXPECTED.items():
            ability = one(skill, 'units_abilitydata')
            override = one(skill, 'war3map.w3a')
            fields = ability['fields']
            assert fields['code'] == code and fields['levels'] == 6 and fields.get('Dur1') == duration
            levels = []
            for level, (quantity, identifier) in enumerate(zip(counts, ids), 1):
                mods = {m['key']: m['value'] for m in override['fields']['mods'] if m['level'] == level}
                suffix = str(min(level, 4))
                if code == 'AIfs':
                    mapped = [mods.get('Ist1', fields[f'DataC{suffix}']), mods.get('Ist2', fields[f'DataD{suffix}'])]
                    assert mapped == [identifier, f'b{167 + level}'] and fields[f'DataA{suffix}'] == fields[f'DataB{suffix}'] == 1
                else:
                    mapped = [mods.get('Osf1', fields[f'UnitID{suffix}'])]
                    assert mapped == [identifier] and mods.get('Osf2', fields[f'DataB{suffix}']) == quantity
                levels.append({'level': level, 'count': quantity, 'units': mapped, 'duration': duration,
                               'mana': mods.get('amcs', fields[f'Cost{suffix}']),
                               'cooldown': mods.get('acdn', fields[f'Cool{suffix}'])})
                for unit in mapped:
                    if unit in units:
                        continue
                    detail = {}
                    for table in ('units_unitweapons','units_unitbalance','units_unitabilities','units_unitdata'):
                        row = one(unit, table)
                        raw = row['fields']
                        keys = ('dmgplus1','dice1','sides1','cool1','atkType1','weapTp1','rangeN1','acquire',
                                'dmgpt1','backSw1','targs1','HP','spd','collision','type','abilList','movetp','targType')
                        detail[table] = {'jsonIndex': row['jsonIndex'], 'fields': {key: raw[key] for key in keys if key in raw}}
                    overrides = index.objects(db, unit, 'war3map.w3u')
                    if overrides:
                        detail['war3map.w3u'] = {'jsonIndex': overrides[0]['jsonIndex'], 'fields': {
                            m['key']: m['value'] for m in overrides[0]['fields']['mods'] if m['key'] in ('ua1z','umh1','uabi')}}
                    units[unit] = detail
            abilities[skill] = {'abilityJsonIndex': ability['jsonIndex'], 'overrideJsonIndex': override['jsonIndex'], 'levels': levels}
            if skill in IDS:
                rows = [row for row in index.workbook_rows(db, skill, '塔技能') if row['cells'][5] == skill]
                copies = [[(row['row'],row['cells'][7:10]) for row in rows
                           if row['sourcePath'].startswith('/') == old] for old in (True,False)]
                assert copies[0] == copies[1] and copies[0]
                workbook[skill] = [row for row, _ in copies[0]]
        assert workbook['A215'] == [166]
        assert '1000点伤害的闪电连击' in next(row['cells'][8] for row in index.workbook_rows(db, 'A215', '塔技能'))
        t271 = one('T271', 'units_abilitydata')
        assert t271['fields']['DataA1'] == 900
        critical = one('N730','units_abilitydata')['fields']
        scatter = one('N731','units_abilitydata')['fields']
        sight = one('N732','units_abilitydata')['fields']
        assert (critical['code'],critical['DataA1'],critical['DataB1']) == ('AOcr',35,3)
        assert (scatter['code'],scatter['Cool1'],scatter['DataC1']) == ('Aroc',2,1)
        assert (sight['code'],sight['DataA1'],sight['Rng1']) == ('Adts',3,1000)
        for rank in range(1,7):
            scatter = one(f'T{279 + rank}','units_abilitydata')['fields']
            assert (scatter['code'],scatter['Cool1'],scatter['DataC1']) == ('Aroc',2,rank+1)
        jass = (index.MAP / 'war3map.j').read_text()
        poison_records = {}
        for rank in range(1,7):
            alias = f'T{262 + rank}'
            obj = one(alias,'units_abilitydata')
            fields = obj['fields']
            assert fields['code'] == 'Aven' and fields['DataB1'] == rank / 10 and fields['Dur1'] == 3
            assert 'DataA1' not in fields and 'DataC1' not in fields
            assert not index.references(db, alias) and not index.objects(db, alias,'war3map.w3a') and alias not in jass
            poison_records[alias] = obj['jsonIndex']
        native_writes = [row for row in index.references(db,'EXSetAbilityDataReal') if row['function'] != 'main/f5']
        assert [(row['function'], row['pc']) for row in native_writes] == [('main/f161/f0',39),('main/f161/f0',50)]
        assert any(row['function'] == 'main/f161/f0' for row in index.references(db,'T286'))
        diff = {'T271': {'source': 900, 'webOverride': 1000, 'sourceRef': '塔技能!I166'},
                'poison': {'idPositions': poison_records, 'sourceDataB': 'attack speed', 'selected': 'movement speed Q57'},
                'A209': {'rank5and6RangeChosen': [1200,1300], 'staleOrdinaryTip': [1150,1200]}}
        srcs = ('main/f46/f1','main/f154/f0','main/f154/f1','main/f154/f2','main/f154/f3',
                'main/f97/f1','main/f97/f2','main/f97/f3','main/f97/f5','main/f291/f20','main/f291/f21','main/f291/f40')
        functions = [dict(zip(('function','startLine','endLine'),db.execute(
            'SELECT name,start_line,end_line FROM function WHERE name=?',(fn,)).fetchone())) for fn in srcs]
        metadata = dict(json.loads(db.execute('SELECT fingerprint FROM metadata').fetchone()[0])[1])
        metadata = {p:h for p,h in metadata.items() if p.endswith(('.xlsx','main.disasm','units_abilitydata.json',
                    'units_unitweapons.json','units_unitbalance.json','units_unitabilities.json','units_unitdata.json',
                    'war3map.w3a.json','war3map.w3u.json'))}
        for name in ('war3map.j','units_campaignabilitystrings.txt'):
            artifact = index.MAP / name
            metadata[index.source_path(artifact)] = hashlib.sha256(artifact.read_bytes()).hexdigest()
        return abilities, {'workbookRows': workbook, 'templates': units, 'functions': functions,
                           'fingerprints': metadata, 'differences': diff}


def original_probes():
    support = runpy.run_path(str(index.ROOT / 'tools/audit-zeus-skills.py'))
    world = support['Probe']()
    env = world.env
    fn, execute, closure = (support[k] for k in ('function','execute','Closure'))
    ward_owner = world.tower(1, intelligence=600, items={'i310'})
    victim = world.unit(x=200, life=100000)
    removed, dropped, inherited = [], [], []
    env.update(RemoveUnit=removed.append, DropAllItemUnit=dropped.append,
               UnitBeComeEventHandler=lambda owner, summoned: inherited.append((owner,summoned)),
               GetRandomInt=lambda lo, hi: 15)
    env['SetMagicDamagePoint'] = closure('main/f7/f31',[env])
    execute(fn('main/f154'),[env])
    w1 = world.unit('b156', owner=0)
    w2 = world.unit('b161', owner=0)
    env['A209_Action'](w1,1)
    assert w1['userdata'] == 1 and w1['skills'] == {'N731':1}
    ward_owner['items'].clear()
    env['A209_Action'](w2,1)
    assert removed == [w1] and w2['userdata'] == 1 and not w2['skills']
    assert all(env['A209_DeathGuard'](world.unit(f'b{i}')) for i in range(156,162))
    assert not env['A209_DeathGuard'](victim)
    env['A209_danamge'](ward_owner,victim)
    assert world.events[0] == ('area',0,150,200,0,300)
    env['A209_End'](ward_owner)
    assert dropped == [w2] and removed == [w1]
    execute(fn('main/f46'),[env])
    for caster, skill, rank, expected in (
        ('H015','A049',1,'b119'),('H015','A049',6,'b121'),('G055','A130',4,'b148')):
        owner = world.unit(caster, owner=0, skills={skill:rank})
        env['A051_A_Kill_Event'](owner, {'x':200,'y':0})
        source,summon = inherited[-1]
        assert source is owner and (summon['type'],summon['timed_life'],summon['x']) == (expected,10,200)
    env['GetRandomInt'] = lambda lo,hi: 16
    env['A051_A_Kill_Event'](owner, {'x':200,'y':0})
    assert len(inherited) == 3
    return {'A209ReplacementAndScepterSnapshot': True, 'A209OwnerExitDropsWithoutDeleting': True,
            'A209LiveIntArea': 300, 'A051TreeCasesIncludingSkinAndRng': 4}


def selected_models():
    pairs = [(0,12),(10,22)]
    live = [sum(2 for start,end in pairs if start <= now < end) for now in (0,10,12,22)]
    assert live == [2,4,2,0]
    marks = {}
    for source, now, reduction in [('a',0,.4),('b',1,.6),('a',2,.4)]:
        marks[source]=(now+3,reduction)
    expected = [max((reduction for end,reduction in marks.values() if t < end),default=0) for t in (3,4,5)]
    assert expected == [.6,.4,0]
    active = {'treeSlot': ['b101'] * EXPECTED['A049'][1][2], 'A051': ['b120']}
    active['treeSlot'] = ['b145'] * EXPECTED['A130'][1][3]
    assert active == {'treeSlot':['b145'] * 4,'A051':['b120']}
    return {'pairedSummonAt0_10_12_22':live,'Q57MaxMoveSlowAt3_4_5':expected,
            'Q57SameSourceRefreshed':True,'A049A130RecastGroups':active}


if __name__ == '__main__':
    rules, refs = index_evidence()
    records = [{'id': skill,'status':'difficult' if skill == 'A125' else 'ready','rules': rules[skill],
                'sourceRefs': {'workbookRows':refs['workbookRows'][skill]},
                'differences': refs['differences'] if skill == 'A215' else [],
                'unresolved': A125_PENDING if skill == 'A125' else [],
                'validation':'双图鉴、模板与源/选定规格验证'} for skill in IDS]
    records[0]['rules']['skin'] = rules['A130']
    report = {'skills':records,'sourceRefs':refs,'auxiliary':['A130','A051交接','N730','N731','N732',
              'T263–T268','T269–T274','T280–T285'],
              'validation':{'source': original_probes(),'selected': selected_models(),'originalClientTested':False}}
    payload = json.dumps(report,ensure_ascii=False,indent=2)+'\n'
    if '--write' in sys.argv:
        OUT.write_text(payload)
    else:
        assert OUT.read_text() == payload
    print(json.dumps(report['validation'],ensure_ascii=False))
