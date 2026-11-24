#!/usr/bin/env python3
"""Validate source coordinates and bounded behavior for native ready candidates."""
from contextlib import closing
import json
import math
import re
import runpy
import sys

import audit_index as index

DOC = index.ROOT / 'docs/rules/native-targeted-batch-01.md'
OUT = DOC.with_suffix('.json')
SKILLS = {
    'A019': ('AOsh', [], [], '二级蓝50→40；其他费用与伤害一致', []),
    'A029': ('AOcl', [], [], '六级3500→3000；5–10次为首击后的跳跃次数', []),
    'A020': ('AOcl', ['main/f22'], ['T056'], '空壳对象由马甲及溢出脚本兑现', []),
    'A160': ('AHtb', ['main/f111'], [], '自动原无零蓝池保护；Web零蓝池不发令', []),
    'A151': ('AHtb', ['main/f103'], ['T105'], '神杖实际全深渊模式20%；对象未写BPSE条目', []),
    'A073': ('AOcl', ['main/f64'], ['T067'], '表内法术倍率与原公式一致；马甲100触发值被清零', []),
    'A058': ('AHtb', ['main/f52', 'main/f53'], ['T053'], 'CD全档按图鉴减2秒', ['main/f53/f0–f3：T053、重施计时器及i318/i319/i320联动改变A058实际总输出']),
    'A089': ('AHtb', ['main/f78'], ['T090', 'T091', 'T092'], '图鉴额外6跳；源计数从1起', ['main/f79/f0–f3：A091_DefUnits生命周期决定合法跳转；T091/AOws、T092/AUau每跳触发']),
    'A161': ('AHtb', ['main/f112'], ['T173', 'T261'], '图鉴辅助晕3秒，原辅助2.2/1.6；T261的BOwk在Web按AHtb控制使用BPSE', []),
    'A207': ('AOcl', ['main/f152'], ['T231'], '图鉴额外4–14跳且晕1.5秒；原计数仅cap-1次总命中，原英雄0.6秒', ['main/f152/f0–f3：T231拦盾、失手与塔槽共享计数重入决定实际续跳']),
}


def source_probes():
    support = runpy.run_path(str(index.ROOT / 'tools/audit-zeus-skills.py'))
    world = support['Probe']()
    env, function, execute = world.env, support['function'], support['execute']
    tower = world.tower(1, skills={'A020': 2, 'A073': 3})
    target = world.unit(x=200, life=1000, mana=300, max_mana=1000)
    env.update(GetTriggerUnit=lambda: tower, UNIT_STATE_MANA='mana', UNIT_STATE_MAX_MANA='max_mana',
               SetUnitState=lambda unit, state, amount: unit.update({state: amount}),
               RemoveLocation=lambda _: None, hasMon=lambda group: target if target in group else None,
               GetUnitFlyHeight=lambda unit: 0, SetUnitFlyHeight=lambda *args: None)
    event_writes = []
    world.japi['EXSetEventDamage'] = event_writes.append
    for module in ('main/f22', 'main/f103', 'main/f111'):
        execute(function(module), [env])
    execute(function('main/f64'), [env], (lambda _: world.japi,))

    validation = {}
    env['A020_Action'](target)
    assert [order[2:] for order in world.issued] == [('chainlightning', target['serial'], {'T056': 2}, 2)]
    tower['items'].add('i310')
    env['A020_Action'](target)
    assert len(world.issued) == 3 and world.issued[-1] == world.issued[-2]
    before = len(world.events)
    env['A020_SkillDamage'](tower, target, 234)
    assert world.events[before] == ('area', 0, 600, 200, 0, 234)
    validation['A020'] = '原模块普通一发、神杖可同目标两发、600范围传参与零延迟'

    before = len(world.events)
    env['A160_Action'](tower, target)
    assert target['mana'] == 1000 and world.events[before] == ('area', 0, 300, 200, 0, 1400)
    before = len(world.events)
    env['A160_Action'](tower, target)
    assert len(world.events) == before
    validation['A160'] = '原模块缺蓝700先回满、神杖范围1400；满蓝不发包'

    target['life'] = 1000
    env['A151_Action'](tower, target)
    assert world.issued[-1][2:] == ('thunderbolt', target['serial'], {'T105': 1}, 1)
    env['A151_A_Damage'](tower, target)
    assert target['life'] == 500
    world.advance(1)
    env['Game_Mode'] = 2
    env['A151_A_Damage'](tower, target)
    assert target['life'] == 400
    world.advance(6)
    assert target['life'] == 400
    world.advance(7)
    assert target['life'] == 470
    validation['A151'] = '原模块马甲、50/20%、覆盖同槽、6秒旧回调失效与新回补70%'

    target['life'] = 100000
    tower['items'].clear()
    env['A073_Action'](tower, target)
    assert world.issued[-1][2:] == ('chainlightning', target['serial'], {'T067': 1}, 1)
    assert env['A073_Number'][1] == 0
    target2 = world.unit(x=550, life=100000)
    tower['items'].add('i310')
    env['A073_Action'](tower, target)
    assert env['A073_Number'][1] == 2
    assert [order[3] for order in world.issued[-2:]] == [target['serial'], target2['serial']]
    for rank in range(1, 7):
        tower['skills']['A073'] = rank
        env['A073_Damage'](tower, target)
        assert event_writes[-1] == 0 and world.events[-1][-1] == (6 + 2 * rank) * 1600
    validation['A073'] = '原模块普通一发、神杖双段路径、六档清零及智力公式'
    # First geometrically valid target wins at the script stage even if friendly.
    wind = support['Probe']()
    caster = wind.unit('G072', owner=0, userdata=7)
    primary = wind.unit(x=200)
    wind.unit(x=200, y=70)  # Farther from source, but above the 15 degree limit.
    friendly = wind.unit(x=350, owner=0)
    far = wind.unit(x=400)
    wind.env.update(AngleBetweenPoints=lambda a, b: math.degrees(math.atan2(b['y'] - a['y'], b['x'] - a['x'])),
                    AddLightningEx=lambda *args: args, DestroyLightning=lambda fx: None)
    wind.env['math']['abs'] = abs
    execute(function('main/f112'), [wind.env])
    action = wind.env['A161_Action']
    # Lua closes over the recursive local by reference. The audit VM copies values.
    find_next = action.ups[2]
    assert function(find_next.name)['upvalueBindings'][2] == (5, True)
    find_next.ups[2] = find_next
    action(caster, primary)
    assert [order[3] for order in wind.issued] == [primary['serial'], friendly['serial'], far['serial']]
    assert all(order[1:3] == (7, 'thunderbolt') and order[-2:] == ({'T261': 1}, 1)
               for order in wind.issued)
    assert len(wind.timers) == 2 and all(timer['period'] == 2 for timer in wind.timers)
    wind.advance(2)
    assert not any(timer['running'] for timer in wind.timers)
    validation['A161'] = '原模块角限制、友军优先候选、皮肤T261及2秒视效清理'
    return validation, function


def compare_sources(db, vm_function):
    source = json.loads((index.MAP / 'units_abilitydata.json').read_text())
    for ability in ('A019', 'A029', 'A160', 'T067'):
        record, = index.objects(db, ability, 'units_abilitydata')
        assert source[record['jsonIndex']] == record['fields']
    for function in ('main/f22/f0', 'main/f64/f1', 'main/f103/f2', 'main/f111/f0'):
        expected = vm_function(function)['instructions']
        actual = index.instructions(db, function, 1, len(expected))
        assert len(actual) == len(expected)
        for current, original in zip(actual, expected):
            assert current['sourceLine'] == original['sourceLine']
            assert ' '.join([current['op'], *current['args']]) == ' '.join(original['raw'].split())


def records():
    behavior, vm_function = source_probes()
    with closing(index.connect()) as db:
        compare_sources(db, vm_function)
        result = []
        text = DOC.read_text()
        for ability, (family, functions, helpers, difference, unresolved) in SKILLS.items():
            line, = re.findall(r'^- \*\*' + ability + r'\b[^\n]+', text, re.MULTILINE)
            workbooks = [row for row in index.workbook_rows(db, ability, '塔技能') if row['cells'][5] == ability]
            left = [row['cells'][:10] for row in workbooks if row['sourcePath'].startswith('/')]
            right = [row['cells'][:10] for row in workbooks if not row['sourcePath'].startswith('/')]
            assert left == right and left and all(row[6] == 6 for row in left), ability
            fields, = index.objects(db, ability, 'units_abilitydata')
            assert fields['fields']['code'] == family and fields['fields']['levels'] == 6
            object_data = [record for code in (ability, *helpers) for record in index.objects(db, code)
                           if record['sourcePath'].endswith(('units_abilitydata.json', 'war3map.w3a.json'))]
            object_positions = [{key: x[key] for key in ('sourcePath', 'jsonIndex', 'id')} for x in object_data]
            function_positions = [dict(zip(('function', 'startLine', 'endLine'), row))
                                  for name in functions for row in db.execute(
                                      'SELECT name,start_line,end_line FROM function WHERE name=? OR name LIKE ? ORDER BY start_line',
                                      (name, name + '/%'))]
            # Validate the important workbook choices against the original numeric conflicts.
            if ability == 'A019':
                assert '耗蓝 40点' in left[0][8] and fields['fields']['Cost2'] == 50
            if ability == 'A029':
                assert '3000伤害，跳跃10次' in left[0][8]
                assert any(m['key'] == 'Ocl1' and m['value'] == 3500
                           for m in object_data[-1]['fields']['mods'])
            result.append({'id': ability, 'status': 'difficult' if unresolved else 'ready',
                           'rules': line.split(' [', 1)[0][2:],
                           'sourceRefs': {
                               'workbooks': [{k: row[k] for k in ('sourcePath', 'sheet', 'row')} for row in workbooks],
                               'objects': object_positions, 'functions': function_positions,
                               'scriptReferences': index.references(db, ability),
                           },
                           'differences': difference, 'unresolved': unresolved,
                           'validation': {'sources': '双图鉴与对象数据定位，原反汇编精确引用',
                                          'probe': behavior.get(ability),
                                          'originalClientTested': False}})
    return result


if __name__ == '__main__':
    data = records()
    payload = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    if '--write' in sys.argv:
        OUT.write_text(payload)
    else:
        assert OUT.read_text() == payload, '重新运行 --write 更新已编辑的机器表'
    print(json.dumps({'ready': [r['id'] for r in data if r['status'] == 'ready'],
                      'difficult': [r['id'] for r in data if r['status'] == 'difficult'],
                      'bytecodeProbes': sum(bool(r['validation']['probe']) for r in data)}, ensure_ascii=False))
