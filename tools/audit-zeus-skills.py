#!/usr/bin/env python3
"""Bounded Zeus source and Web contract probes."""
from collections import Counter
from fractions import Fraction
from pathlib import Path
import ast
import hashlib
import heapq
import json
import math
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'reference/map-6.25'

# Reuse the existing VM definitions without running that audit's own scenarios.
vm = {'__file__': __file__}
module = ast.parse((ROOT / 'tools/audit-wisp-link-overcharge-relocate.py').read_text())
boundary = next(i for i, node in enumerate(module.body)
                if isinstance(node, ast.ClassDef) and node.name == 'BaseWorld')
end = module.body.index(next(node for node in module.body[:boundary]
                            if isinstance(node, ast.Import)
                            and node.names[0].name == 'math'))
exec(compile(ast.Module(body=module.body[:end], type_ignores=[]),
             'audit-wisp-link-overcharge-relocate.py', 'exec'), vm)
function, execute, Closure, pairs = (vm[name] for name in ('function', 'execute', 'Closure', 'pairs'))


class CapturedCounter:
    """Preserve the one parent register aliased by two decoded closures."""

    def __init__(self, original, slot, shared):
        self.original = original
        self.slot = slot
        self.shared = shared

    def __getitem__(self, slot):
        return self.shared[0] if slot == self.slot else self.original[slot]

    def __setitem__(self, slot, value):
        assert slot == self.slot
        self.shared[0] = value


class Probe:
    def __init__(self, mode=0, players=1):
        self.now = Fraction(0)
        self.queue = []
        self.sequence = 0
        self.expired = None
        self.units = []
        self.events = []
        self.effects = []
        self.timers = []
        self.issued = []
        self.japi = {
            'EXGetUnitAbility': lambda unit, ability: {'unit': unit, 'ability': ability},
            'EXSetAbilityState': lambda handle, field, cd: handle['unit']['cooldowns'].__setitem__(handle['ability'], cd),
            'EXGetAbilityDataReal': lambda handle, level, field: 15,
        }
        self.env = {
            'Tower_ALL': {}, 'Player_Index_Arr': dict.fromkeys(range(players), True),
            'A111_113_A': {}, 'A_ITEM_ID': 'i310',
            'Player': lambda owner: owner, 'GetId': lambda code: code,
            'GetExpiredTimer': lambda: self.expired,
            'CreateTimer': self.new_timer, 'TimerStart': self.start_timer,
            'DestroyTimer': lambda timer: timer.update(running=False),
            'GetUnitX': lambda unit: unit['x'], 'GetUnitY': lambda unit: unit['y'],
            'GetUnitLoc': lambda unit: {'x': unit['x'], 'y': unit['y']},
            'GetLocationX': lambda point: (point or {}).get('x', 0),
            'GetLocationY': lambda point: (point or {}).get('y', 0),
            'GetOwningPlayer': lambda unit: (unit or {}).get('owner', 15),
            'GetUnitState': lambda unit, state: (unit or {}).get(state, 0),
            'GetUnitTypeId': lambda unit: unit['type'],
            'GetUnitAbilityLevel': lambda unit, code: unit['skills'].get(code, 0),
            'GetUnitUserData': lambda unit: unit['userdata'],
            'SetUnitUserData': lambda unit, index: unit.update(userdata=index),
            'GetHeroInt': lambda unit, bonuses: unit['intelligence'] if bonuses else 0,
            'HasItem': lambda unit, item: item if item in unit['items'] else None,
            'IsUnitType': lambda unit, tag: tag in unit['tags'],
            'IsUnitOwnedByPlayer': lambda unit, player: bool(unit and unit['owner'] == player),
            'CreateGroup': list, 'GroupClear': list.clear, 'DestroyGroup': lambda group: None,
            'GroupEnumUnitsInRange': self.enum,
            'FirstOfGroup': lambda group: group[0] if group else None,
            'GroupRemoveUnit': lambda group, unit: group.remove(unit) if unit is not None else None,
            '_loop_': lambda: (lambda state, prev: (prev or 0) + 1, None, None),
            'pairs': pairs, 'math': {'sqrt': math.sqrt}, 'Game_Mode': mode, 'TxShow': False,
            'IsWorker': lambda unit: 'worker' in unit['tags'],
            'IsBOX': lambda unit: 'box' in unit['tags'],
            'IsTemp': lambda unit: unit['type'] == 'q001',
            'CreateEffAtLoc': lambda *args: self.effects.append(args),
            'CreateEffByUnit': lambda *args: self.effects.append(args),
            'CreateUnitAtLoc': lambda owner, code, point, facing: self.unit(code, owner, **(point or {})),
            'UnitAddAbility': lambda unit, code: unit['skills'].setdefault(code, 1),
            'UnitRemoveAbility': lambda unit, code: unit['skills'].pop(code, None),
            'UnitMakeAbilityPermanent': lambda unit, flag, code: unit['permanent'].add(code),
            'SetUnitAbilityLevel': lambda unit, code, rank: unit['skills'].__setitem__(code, rank),
            'UnitApplyTimedLife': lambda unit, buff, seconds: unit.update(timed_life=seconds),
            'IssueTargetOrder': self.issue,
            'UnitDamageTarget': self.damage, 'UnitDamagePoint': self.area,
        }
        for native in ('UNIT_STATE_LIFE', 'UNIT_STATE_MAX_LIFE', 'UNIT_TYPE_SAPPER',
                       'ATTACK_TYPE_NORMAL', 'ATTACK_TYPE_CHAOS', 'DAMAGE_TYPE_MAGIC',
                       'DAMAGE_TYPE_DIVINE', 'WEAPON_TYPE_WHOKNOWS'):
            self.env[native] = native.split('_')[-1].lower()
        self.env.update(UNIT_STATE_MAX_LIFE='max_life')
        for name, child in {'IsInTable': 7, 'Has_A_Item': 8, 'GetArrRealLen': 19,
                            'CreateTempAndSetAbilityLv': 20, 'AddArrAny': 22, 'GetDistance': 23,
                            'SetMagicDamage': 34, 'SetRealDamage': 35, 'UnitIsHero': 45,
                            'UnitIsPlayer': 52}.items():
            self.env[name] = Closure(f'main/f7/f{child}', [self.env])
        shop_ids = {i - 10: function('main/f7')['constants'][f'k{i}']['value'] for i in range(11, 35)}
        self.env['IsShopBoss'] = Closure('main/f7/f9', [self.env, shop_ids])
        self.env['Use_A_Item'] = Closure('main/f7/f11', [self.env, {1: {1: 'A105', 2: 'A106'}}, self.japi])
        self.env['Drop_A_Item'] = Closure('main/f7/f12', [self.env, {1: {1: 'A105', 2: 'A106'}}])
        execute(function('main/f84'), [self.env])
        execute(function('main/f85'), [self.env], (lambda _: self.japi,))
        cast, tick = (self.env[key] for key in ('A106_Action', 'A106_Skill'))
        assert function(cast.name)['upvalueBindings'][0] == (4, True)
        assert function(tick.name)['upvalueBindings'][1] == (4, True)
        self.cloud_counter = [None]
        cast.ups = CapturedCounter(cast.ups, 0, self.cloud_counter)
        tick.ups = CapturedCounter(tick.ups, 1, self.cloud_counter)
        _, regs = execute(function('main/f86'), [self.env], (lambda _: self.japi,), capture=True)
        # f86 captures the callback and three tables, whose object identities the VM preserves.
        assert self.env['A107_Action'].ups[1] is regs[5]

    def unit(self, code='m001', owner=11, x=0, y=0, **fields):
        unit = dict(type=code, owner=owner, x=x, y=y, life=100000, max_life=100000,
                    intelligence=1600, userdata=-1, skills={}, tags=set(), items=set(),
                    cooldowns={}, permanent=set(), serial=len(self.units) + 1)
        unit.update(fields)
        self.units.append(unit)
        return unit

    def tower(self, index, **fields):
        unit = self.unit('H031', index - 1, userdata=index, **fields)
        self.env['Tower_ALL'][index] = unit
        return unit

    def new_timer(self):
        timer = {'running': True, 'id': len(self.timers) + 1}
        self.timers.append(timer)
        return timer

    def start_timer(self, timer, period, repeating, callback):
        timer.update(period=Fraction(str(period)), repeating=repeating, callback=callback)
        self.enqueue(timer)

    def enqueue(self, timer):
        self.sequence += 1
        heapq.heappush(self.queue, (self.now + timer['period'], self.sequence, timer))

    def advance(self, time):
        time = Fraction(str(time))
        while self.queue and self.queue[0][0] <= time:
            when, _, timer = heapq.heappop(self.queue)
            self.now = when
            if timer['running']:
                self.expired = timer
                self.events.append(('timer', str(when), timer['id']))
                timer['callback']()
                if timer['running'] and timer['repeating']:
                    self.enqueue(timer)
        self.now = time

    def enum(self, group, x, y, radius, filters):
        group.extend(unit for unit in self.units if math.hypot(unit['x'] - x, unit['y'] - y) <= radius)

    def issue(self, dummy, order, target):
        self.issued.append((str(self.now), dummy['userdata'], order, target['serial'],
                            dummy['skills'].copy(), dummy['timed_life']))
        return True

    def damage(self, source, target, amount, attack, ranged, attack_type, damage_type, weapon):
        self.events.append((damage_type, source['serial'], target['serial'], amount))
        if 'invulnerable' not in target['tags'] and not ('magicImmune' in target['tags'] and damage_type == 'magic'):
            target['life'] = max(0, target['life'] - amount)

    def area(self, source, delay, radius, x, y, amount, *flags):
        self.events.append(('area', delay, radius, x, y, amount))
        candidates = [target for target in self.units
                      if target['owner'] == 11 and math.hypot(target['x'] - x, target['y'] - y) <= radius]
        for target in candidates:
            if target['life'] > 0 and not target['tags'] & {'invulnerable', 'aloc', 'magicImmune'}:
                self.damage(source, target, amount, *flags)

    def dispatch(self, source, spell, target=None, point=None):
        self.env.update(
            GetTriggerUnit=lambda: source,
            GetSpellAbilityId=lambda: spell,
            GetSpellTargetUnit=lambda: target,
            GetSpellTargetLoc=lambda: point,
            J003_Hero={}, skill_bs_id={},
            IsUseless=lambda ability: ability == 'A075',
            IsUnitType=lambda unit, tag: tag in unit['tags'],
            UNIT_TYPE_HERO='hero',
            WAbility_initAbility=lambda: self.events.append(('weapon-init',)),
            Item_Skill_Action=Closure('main/f285/f16', [self.env]),
        )
        execute(function('main/f291/f14'), [self.env])

    def boss(self, code='m600', x=0, **fields):
        return self.unit(code, x=x, skills={'N534': 1}, tags={'sapper'}, **fields)


def source_cloud():
    probe = Probe()
    a, b = probe.tower(1), probe.tower(2)
    probe.unit(x=-1000)
    probe.unit(x=1000)
    probe.env['A106_Action'](a, {'x': -1000, 'y': 0})
    probe.env['A106_Action'](b, {'x': 1000, 'y': 0})
    probe.advance(20)
    casts = Counter(cast[1] for cast in probe.issued)
    ticks = [(time, timer) for kind, time, timer in probe.events if kind == 'timer']
    assert casts == {1: 6, 2: 5}, (casts, ticks)
    assert ticks == [(str(t), i) for t in range(1, 6) for i in (1, 2)] + [('6', 1)]
    assert probe.cloud_counter == [11]
    assert probe.env['A106_nowNumber'] == {1: 0, 2: 0}
    assert not probe.env['A106_Timers']
    assert all(cast[2:] == ('thunderbolt', cast[1] + 2, {'T100': 1}, 1)
               for cast in probe.issued)
    staggered = Probe()
    a, b = staggered.tower(1), staggered.tower(2)
    staggered.unit(x=-1000)
    staggered.unit(x=1000)
    staggered.env['A106_Action'](a, {'x': -1000, 'y': 0})
    staggered.advance(4)
    staggered.env['A106_Action'](b, {'x': 1000, 'y': 0})
    staggered.advance(20)
    assert Counter(cast[1] for cast in staggered.issued) == {1: 10, 2: 5}

    # A forced recast by the same tower replaces the timer lookup, not the expired timer.
    overwritten = Probe()
    tower = overwritten.tower(1)
    overwritten.unit(x=-1000)
    overwritten.unit(x=1000)
    overwritten.env['A106_Action'](tower, {'x': -1000, 'y': 0})
    overwritten.advance(2)
    old_timer = overwritten.env['A106_Timers'][1]
    overwritten.env['A106_Action'](tower, {'x': 1000, 'y': 0})
    assert old_timer['running'] and overwritten.env['IsInTable'](old_timer, overwritten.env['A106_Timers']) == -1
    assert overwritten.env['A106_TarLoc'].get(-1) is None
    return {'staggeredCastsByTower': {1: 10, 2: 5}, 'forcedRecastOldLookup': -1, 'timerTicks': ticks, 'castsByTower': dict(casts), 'sharedCounter': 11}


def source_other():
    for rank, cap in enumerate((.06, .07, .08, .09, .10, .12), 1):
        for mode in (0, 1, 2):
            for intelligence in (160, 16000):
                probe = Probe(mode)
                tower = probe.tower(1, skills={'A104': rank, 'A105': rank}, intelligence=intelligence)
                target = probe.unit(x=1000)
                boss = probe.boss(x=999)
                probe.unit(x=1000.1)
                probe.unit(x=999, life=0)
                probe.unit(x=1000, owner=1)
                probe.dispatch(tower, 'A104', target)
                assert probe.issued == [('0', 1, 'chainlightning', target['serial'], {'T146': rank}, 3)]
                ratio = min(intelligence / 16000, cap) / (2 if mode == 2 else 1)
                assert probe.events[-1] == ('weapon-init',)
                real, magic, boss_real, boss_magic = probe.events[:-1]
                assert real[:3] == ('divine', 1, 2) and math.isclose(real[3], 100000 * ratio)
                assert boss_real[:3] == ('divine', 1, 3) and math.isclose(boss_real[3], 50000 * ratio)
                assert magic == ('magic', 1, 2, rank * 300)
                assert boss_magic == ('magic', 1, 3, rank * 300)

    # Execute the real use/drop pair. Neither action owns a cloud timer.
    probe = Probe()
    tower = probe.tower(1)
    probe.env['Use_A_Item'](tower)
    assert 'A106' not in tower['skills']
    tower['skills']['A105'] = 6
    probe.env['Use_A_Item'](tower)
    assert tower['skills']['A106'] == 1 and tower['cooldowns']['A106'] == 15
    tower['cooldowns']['A106'] = 3
    probe.env['Use_A_Item'](tower)
    assert tower['cooldowns']['A106'] == 15
    target = probe.unit(x=450)
    probe.unit(x=450.1)
    probe.dispatch(tower, 'A106', point={'x': 0, 'y': 0})
    cloud_timer = probe.env['A106_Timers'][1]
    tower['skills'].pop('A105')
    probe.env['Drop_A_Item'](tower)
    assert 'A106' not in tower['skills'] and cloud_timer['running']
    probe.advance(1)
    assert probe.issued == [('1', 1, 'thunderbolt', target['serial'], {'T100': 1}, 1)]
    assert [entry[0] for entry in probe.events[:5]] == ['divine', 'magic', 'divine', 'magic', 'weapon-init']

    # Both adjacent Bosses receive both area packets. Only each center gets its A-staff packet.
    probe = Probe()
    tower = probe.tower(1, skills={'A107': 1}, items={'i310'})
    a = probe.boss(x=100)
    b = probe.boss(x=300)
    normal = probe.unit(x=200)
    probe.dispatch(tower, 'A107')
    for unit, total in [(a, 8400), (b, 8800), (normal, 8000)]:
        assert math.isclose(unit['life'], unit['max_life'] - total)
    assert not tower['cooldowns']
    probe.advance(.099)
    assert not tower['cooldowns']
    probe.advance(.1)
    assert tower['cooldowns'] == {'A107': 14}

    # A later enumerated center killed by an earlier packet is skipped. An immune center counts.
    probe = Probe()
    tower = probe.tower(1, skills={'A107': 1})
    a = probe.boss(x=100)
    b = probe.boss(x=150, life=10)
    c = probe.boss(x=1000)
    c['tags'].add('magicImmune')
    probe.dispatch(tower, 'A107')
    probe.advance(.1)
    assert b['life'] == 0 and c['life'] == 100000 and tower['cooldowns']['A107'] == 14

    # Read the cooldown cap from original callback and compare its selected workbook override.
    cooldowns = []
    for count in range(13):
        probe = Probe()
        tower = probe.tower(1, skills={'A107': 6})
        for n in range(count):
            probe.boss(x=(n + 1) * 210)
        probe.dispatch(tower, 'A107')
        probe.advance(.1)
        source_cd = tower['cooldowns'].get('A107', 16)
        assert source_cd == max(8, 16 - count)
        cooldowns.append({'qualifyingCenters': count, 'source': source_cd, 'selected': max(7, 16 - count)})

    # Distant normal, Boss-level owned tower nearby, shop Boss, and count-based gold targets.
    distance_cases = [
        (0, 1, 'm600', 1499.99, None, 1, 1),
        (0, 1, 'm600', 1500, None, 300 / 850, 1),
        (0, 2, 'm600', 1800, 1200, .03, 1),
        (0, 2, 'm600', 1800, 1200.001, 300 / 1150, 1),
        (1, 2, 'm600', 1800, 0, 300 / 1150, 1),
        (2, 1, 'm571', 400, None, 1, .05),
        (0, 4, 'm998', 2000, 0, .5, 1),
        (0, 1, 'm999', 300, None, 2, 1),
    ]
    for mode, players, code, x, owned_distance, factor, extra in distance_cases:
        probe = Probe(mode, players)
        tower = probe.tower(1, skills={'A107': 1}, items={'i310'})
        if owned_distance is not None:
            probe.unit('H032', owner=1, x=x + owned_distance)
        elif mode == 0 and x >= 1500:
            probe.unit('H032', owner=0, x=x)
            probe.unit('H032', owner=1, x=x, tags={'worker'})
            probe.unit('H032', owner=1, x=x, tags={'box'})
            probe.unit('q001', owner=1, x=x)
            probe.unit('H032', owner=1, x=x, life=0)
        boss = probe.boss(code, x=x)
        probe.dispatch(tower, 'A107')
        raw = 4000 * factor
        assert any(event[0] == 'magic' and event[2] == boss['serial'] and
                   math.isclose(event[3], raw) for event in probe.events)
        assert math.isclose(boss['life'], boss['max_life'] - raw - raw * factor * .1 * extra)
    return {'staticRankModeIntCases': 36, 'rageCooldowns': cooldowns, 'rageFactors': len(distance_cases)}


def source_auto():
    cases = [
        ({'A104', 'A106', 'A107'}, 800, 'absorb'),
        ({'A104', 'A107'}, 800, 'decouple'),
        ({'A104', 'A107'}, 800.001, 'militia'),
        ({'A104'}, 900, 'militia'),
        ({'A104', 'A106', 'A107'}, 900.001, None),
    ]
    for ready, distance, expected in cases:
        probe = Probe()
        tower = probe.tower(1)
        boss = probe.boss(x=distance)
        point = {'x': distance, 'y': 0}
        emitted = []
        env = probe.env
        env.update(
            Unit_Ability_Has_Cool_Down=lambda source, ability: ability in ready,
            hasMon=Closure('main/f291/f28', [env]),
            hasHero=Closure('main/f291/f29', [env]),
            IssueImmediateOrder=lambda unit, order: emitted.append(('immediate', order, None)),
        )
        code = function('main/f291/f27')
        execute(code, [env,
                       lambda unit, order, location: emitted.append(('point0', order, location)),
                       lambda unit, order, target: emitted.append(('target0', order, target))],
                (tower, None, 0, 0, []),
                start_pc=code['labels']['l1711'], stop_pc=code['labels']['l1838'] - 1)
        expected_record = {
            None: [], 'absorb': [('point0', 'absorb', point)], 'decouple': [('immediate', 'decouple', None)],
            'militia': [('target0', 'militia', boss)],
        }[expected]
        assert emitted == expected_record
    return len(cases)


DAMAGE = (200, 400, 600, 800, 1000, 1300)
A104_COST = (20, 40, 70, 100, 140, 180)
A104_CD = (3.5, 3, 2.5, 2, 1.5, 1)
STATIC_CAPS = (6, 7, 8, 9, 10, 12)
STATIC_MAGIC = tuple(300 * n for n in range(1, 7))
RAGE_DAMAGE = tuple(2500 + 1500 * n for n in range(1, 7))
RAGE_COST = tuple(70 * n for n in range(1, 7))
CLOUD_RADIUS = 500
RAGE_SCEPTER_PERCENT = 12
RAGE_SCEPTER_ABYSS_MULTIPLIER = .5


def selected_cloud():
    """Round-trip the independent pulse state, preserving B05 enqueue serials."""
    state = {'lastSequence': 0, 'queue': []}
    ticks = []

    def schedule(when, cloud, tower, point, completed):
        state['lastSequence'] += 1
        heapq.heappush(state['queue'], [when, state['lastSequence'], cloud, tower, point, completed])

    def advance(to):
        while state['queue'] and state['queue'][0][0] <= to:
            when, _, cloud, tower, point, completed = heapq.heappop(state['queue'])
            ticks.append([when, cloud, tower, point])
            if completed + 1 < 10:
                schedule(when + 1, cloud, tower, point, completed + 1)

    schedule(1, 1, 1, [-1000, 0], 0)
    schedule(1, 2, 2, [1000, 0], 0)
    advance(4)
    schedule(5, 3, 1, [0, 1000], 0)
    advance(6)
    state = json.loads(json.dumps(state))
    advance(20)
    assert not state['queue'] and len(ticks) == 30
    assert [tick[1] for tick in ticks if tick[0] == 5] == [1, 2, 3]
    assert [tick[0] for tick in ticks if tick[1] == 1] == list(range(1, 11))
    assert [tick[0] for tick in ticks if tick[1] == 2] == list(range(1, 11))
    assert [tick[0] for tick in ticks if tick[1] == 3] == list(range(5, 15))
    assert all(tick[3] == {1: [-1000, 0], 2: [1000, 0], 3: [0, 1000]}[tick[1]] for tick in ticks)
    distances = [450, 450.001, 500, 500.001]
    included = [distance for distance in distances if math.hypot(distance, 0) <= CLOUD_RADIUS]
    assert included == distances[:3]
    return {'ticks': ticks, 'restoredAt': 6, 'Q61IncludedDistances': included}


def selected_rage_scepter():
    cases = [(4000,1,False,False), (8000,1,False,False), (4000,1,True,False),
             (4000,1,True,True), (4000,.5,False,True)]
    results = [missing * RAGE_SCEPTER_PERCENT / 100 * scale
               * (RAGE_SCEPTER_ABYSS_MULTIPLIER if abyss else 1) * (.5 if shop else 1)
               for missing,scale,abyss,shop in cases]
    assert results == [480,960,240,120,120]
    return results


def selected_native():
    """Exercise Q24 boundaries independently of the Warcraft native doubles."""
    def shield(unit, now):
        if unit.get('shieldReadyAt', math.inf) <= now:
            unit['shieldReadyAt'] = now + 6
            return True
        return False

    def valid(unit):
        return unit['life'] > 0 and not unit['tags'] & {'aloc', 'hidden', 'invulnerable', 'magicImmune'}

    def chain(caster, target, units, now, active_rank, reaction):
        if not valid(target) or abs(caster['x'] - target['x']) > 5000 or shield(target, now):
            return []
        selected = []
        sleep = 'sleep' in target['tags']
        while target and len(selected) < 10 and valid(caster):
            old_x = target['x']
            selected.append(target['serial'])
            reaction(target, DAMAGE[active_rank - 1])
            target = next((unit for unit in sorted(units, key=lambda u: u['serial'])
                           if unit['serial'] not in selected and valid(unit)
                           and abs(unit['x'] - old_x) <= 500 and (sleep or 'sleep' not in unit['tags'])), None)
        return selected

    probe = Probe()
    caster = probe.tower(1)
    targets = [probe.unit(x=500 * i) for i in range(1, 13)]
    targets[0]['shieldReadyAt'] = 0
    victims = []
    react = lambda unit, amount: victims.append((unit['serial'], amount))
    assert chain(caster, targets[0], targets, 0, 6, react) == []
    targets[1]['shieldReadyAt'] = 0
    assert chain(caster, targets[0], list(reversed(targets)), 1, 6, react) == list(range(2, 12))
    assert victims == [(i, 1300) for i in range(2, 12)] and targets[1]['shieldReadyAt'] == 0
    assert chain(caster, targets[0], targets, 6, 6, react) == []
    targets[0]['life'] = 0
    assert not chain(caster, targets[0], targets, 13, 1, react) and targets[0]['shieldReadyAt'] == 12
    targets[0]['life'] = 100000
    targets[1]['tags'].add('sleep')
    assert chain(caster, targets[0], targets, 4, 1, react) == [2]
    targets[0]['tags'].add('sleep')
    assert len(chain(caster, targets[0], targets, 4, 1, react)) == 10
    targets[0]['tags'].remove('sleep')
    targets[1]['tags'].remove('sleep')
    def move_first(unit, amount):
        if unit is targets[0]:
            unit['x'] = -5000
            targets[1]['tags'].add('magicImmune')
    assert chain(caster, targets[0], targets, 4, 1, move_first) == [2]

    def bolt(unit, now):
        if not valid(unit) or shield(unit, now):
            return 0, unit.get('stunUntil', 0)
        duration = .2 if unit['tags'] & {'hero', 'arsk'} else .3
        if 'controlImmune' not in unit['tags']:
            unit['stunUntil'] = max(unit.get('stunUntil', 0), now + duration)
        return 1000, unit.get('stunUntil', 0)

    boss = probe.boss()
    boss['tags'].add('arsk')
    boss['shieldReadyAt'] = 0
    assert not bolt(boss, 1)[0] and boss['shieldReadyAt'] == 7
    assert bolt(boss, 1) == (1000, 1.2)
    assert bolt(boss, 1.1) == (1000, 1.3)
    boss['stunUntil'] = 3
    assert bolt(boss, 1.2) == (1000, 3)
    assert bolt(boss, 7) == (0, 3) and boss['shieldReadyAt'] == 13
    creep = probe.unit()
    assert bolt(creep, 2) == (1000, 2.3)
    creep['tags'].add('controlImmune')
    assert bolt(creep, 3) == (1000, 2.3)
    creep['tags'].add('magicImmune')
    assert bolt(creep, 3)[0] == 0
    return {'chainBoundaries': 8, 'boltBoundaries': 8}


def workbook(path):
    from openpyxl import load_workbook

    book = load_workbook(path, read_only=True, data_only=True)
    try:
        rows = {i: list(row[:10]) for i, row in enumerate(book['塔技能'].values, 1)
                if len(row) >= 6 and row[5] in {'A104', 'A105', 'A106', 'A107'}}
        assert list(rows) == [5, 6, 7, 25, 26, 27]
        for i in (5, 25):
            assert rows[i][5:7] == ['A104', 6]
            parsed = re.findall(r'造成(\d+)伤害。冷却 ([\d.]+)秒。 耗蓝 (\d+)点', rows[i][8])
            assert [(int(d), float(c), int(m)) for d, c, m in parsed] == list(zip(DAMAGE, A104_CD, A104_COST))
        for i in (6, 26):
            assert rows[i][5:7] == ['A105', 6]
            assert '1000范围' in rows[i][7] and '宙斯智力/160' in rows[i][7]
            parsed = re.findall(r'最高伤害比例(\d+)%，(\d+)额外法术伤害', rows[i][8])
            assert [(int(c), int(d)) for c, d in parsed] == list(zip(STATIC_CAPS, STATIC_MAGIC))
        for i in (7, 27):
            assert rows[i][5:7] == ['A107', 6]
            assert '冷却16秒' in rows[i][7] and '每击中一个BOSS单位减少1秒冷却，最多减少9秒' in rows[i][7]
            parsed = re.findall(r'造成(\d+)伤害。 耗蓝 (\d+)点', rows[i][8])
            assert [(int(d), int(m)) for d, m in parsed] == list(zip(RAGE_DAMAGE, RAGE_COST))
        return rows
    finally:
        book.close()


def rebuild(download):
    ids = {'A104', 'A105', 'A106', 'A107', 'T100', 'T146'}
    abilitydata = json.loads((SOURCE / 'units_abilitydata.json').read_text())
    abilities = {row['alias']: row for row in abilitydata if row['alias'] in ids}
    w3a = [obj for obj in json.loads((SOURCE / 'war3map.w3a.json').read_text())
           if obj['old'] in ids or obj['new'] in ids]
    modifications = {(obj['old'], mod['level'], mod['key']): mod['value']
                     for obj in w3a for mod in obj['mods']}
    for rank in range(1, 7):
        for ability, raw, obj_field, desired in (
            ('A104', 'Cool', 'acdn', A104_CD), ('A104', 'Cost', 'amcs', A104_COST),
            ('T146', 'DataA', 'Ocl1', DAMAGE), ('A107', 'Cost', 'amcs', RAGE_COST),
        ):
            assert modifications.get((ability, rank, obj_field), abilities[ability].get(raw + str(rank))) == desired[rank - 1]
    assert (abilities['T100']['DataA1'], abilities['T100']['Dur1'], abilities['T100']['HeroDur1']) == (1000, .3, .2)
    assert (abilities['T146']['Area1'], abilities['T146']['DataB1'], abilities['T146']['Rng1']) == (500, 10, 5000)
    assert 'DataC1' not in abilities['T146'] and 'Cost1' not in abilities['T146']
    profile_text = (SOURCE / 'units_campaignabilitystrings.txt').read_text()
    profiles = {ability: dict(line.split('=', 1) for line in
                              re.search(r'^\[' + ability + r'\]\n(.*?)(?=\n\[)', profile_text, re.M | re.S)[1].splitlines()
                              if '=' in line) for ability in sorted(ids)}
    assert '持续10秒' in profiles['A106']['Ubertip'] and '500范围内' in profiles['A106']['Ubertip']
    assert '12%' in profiles['A107']['Ubertip'] and '深渊BOSS伤害减半' in profiles['A107']['Ubertip']
    records = {filename: [row for row in json.loads((SOURCE / f'{filename}.json').read_text())
                          if row[key] in {'H031', 'G048', 'q001'}]
               for filename, key in [('units_unitabilities', 'unitAbilID'), ('units_unitweapons', 'unitWeapID'),
                                     ('units_unitbalance', 'unitBalanceID')]}
    assert {row.get('castpt') for row in records['units_unitweapons']} == {None, .4}
    for row in records['units_unitabilities']:
        if row['unitAbilID'] != 'q001':
            assert row['heroAbilList'] == 'A104,A105,A107,T101,P000'
    local_rows = workbook(ROOT / '图鉴.xlsx')
    assert workbook(download) == local_rows
    assert sum(line.count('"A106_nowNumber"') for line in vm['D'] if line.startswith('.constant')) == 2
    assert [i['raw'].split() for i in function('main/f85/f1')['instructions'][:2]] == [['loadk', 'r2', 'k0'], ['setupval', 'r2', 'u0']]
    probe_results = {
        'originalA106': source_cloud(), **source_other(), 'autoSourceCases': source_auto(),
        'selectedA106': selected_cloud(), 'selectedA107ScepterQ61': selected_rage_scepter(), **selected_native(),
    }
    manifest = json.loads((SOURCE / 'manifest.json').read_text())
    for item in manifest['files']:
        assert hashlib.sha256((SOURCE / item['file']).read_bytes()).hexdigest() == item['sha256'], item['file']
    functions = []
    for name in ('main/f84', 'main/f84/f0', 'main/f85', 'main/f85/f0',
                 'main/f85/f1', 'main/f85/f2', 'main/f86', 'main/f86/f0', 'main/f86/f1'):
        code = function(name)
        count = len(code['instructions'])
        functions.append({'function': name, 'sourceLines': code['sourceLines'], 'pcRange': [1, count],
                          'upvalueBindings': code['upvalueBindings']})
    source_slices = []
    for name, start, end in [
        ('main/f285/f16', 146448, 146698), ('main/f291/f14', 169999, 170073),
        ('main/f291/f14', 170265, 170276), ('main/f291/f14', 170746, 170783),
        ('main/f291/f27', 175912, 176046), ('main/f291/f35', 179727, 179798),
    ]:
        matched = [ins for ins in function(name)['instructions'] if start <= ins['sourceLine'] <= end]
        source_slices.append({'function': name, 'sourceLines': [matched[0]['sourceLine'], matched[-1]['sourceLine']],
                              'pcRange': [matched[0]['pc'], matched[-1]['pc']]})
    doc = ROOT / 'docs/rules/zeus-skills.md'
    link_count = 0
    for target, line in re.findall(r'\]\(([^():]+?)(?:#L(\d+))?\)', doc.read_text()):
        linked = (doc.parent / target).resolve()
        assert linked.exists(), target
        if line:
            assert 1 <= int(line) <= len(linked.read_text().splitlines()), (target, line)
        link_count += 1
    return {
        'baselineId': 'zeus-skills-v1',
        'coverage': {'workbookIds': ['A104', 'A105', 'A107'], 'auxiliaryIds': ['A106'],
                     'scope': 'listed spell modules and bounded native interfaces'},
        'rules': {
            'A104': {'order': 'militia', 'cost': A104_COST, 'cooldown': A104_CD, 'range': 1000,
                     'carrier': 'q001/T146', 'carrierTimedLife': 3,
                     'damage': DAMAGE, 'targetLimitIncludingPrimary': 10, 'jumpRadius': 500,
                     'carrierRange': 5000, 'decrease': 0, 'damageType': 'NORMAL/MAGIC'},
            'A105': {'radius': 1000, 'intelligenceDivisor': 16000, 'capPercent': STATIC_CAPS,
                     'magicDamage': STATIC_MAGIC, 'bossMultiplier': .5, 'abyssMultiplier': .5,
                     'damageOrder': ['CHAOS/DIVINE', 'NORMAL/MAGIC']},
            'A106': {'order': 'absorb', 'grantedFrom': 'A105', 'level': 1, 'cost': 100, 'cooldown': 15,
                     'period': 1, 'pulsesPerCloud': 10, 'independentTimerInstances': True,
                     'radius': CLOUD_RADIUS, 'sourceLuaRadius': 450, 'sourcePlayerHintRadius': 500, 'carrier': 'q001/T100',
                     'carrierTimedLife': 1, 'carrierCost': 2, 'carrierCooldown': 2, 'carrierRange': 200000,
                     'damage': 1000, 'stunDurationOrdinary': .3, 'stunDurationHeroOrResistantSkin': .2},
            'A107': {'order': 'decouple', 'cost': RAGE_COST, 'damage': RAGE_DAMAGE, 'radius': 200,
                     'baseCooldown': 16, 'cooldownReductionEachQualifyingCenter': 1,
                     'cooldownMinimum': 7, 'sourceCooldownMinimum': 8, 'cooldownRewriteDelay': .1,
                     'sourceScepterPercentMissingLife': 10, 'sourceScepterAbyssMultiplier': .1,
                     'scepterPercentMissingLife': RAGE_SCEPTER_PERCENT,
                     'scepterAbyssMultiplier': RAGE_SCEPTER_ABYSS_MULTIPLIER,
                     'sourceScepterShopBossMultiplier': .5, 'scepterUsesCenterScale': True,
                     'shopBossIds': [f'm{500 + tens * 10 + digit}' for tens in range(8) for digit in (1, 2, 3)],
                     'centerScale': {'goldBossIds': ['m998', 'm999'], 'goldScaleNumerator': 2,
                                     'distanceThreshold': 1500, 'nearScale': 1,
                                     'farNumerator': 300, 'farDenominatorOffset': -650,
                                     'mainlineOtherPlayerRadius': 1200, 'mainlineOtherPlayerScale': .03}},

            'nativeCommit': {'towerCastPoint': .4, 'towerCastBackswing': .1,
                             'followThroughSeconds': {'A104': .8, 'A106': 0, 'A107': .1},
                             'spellShieldId': 'N535', 'spellShieldSharedCooldown': 6},
        },
        'decisions': {'Q49': 'confirmed: ten independent pulses per committed cloud, including forced recast',
                      'Q61': 'player tooltip supplies A106 radius and A107 scepter numerical parameters',
                      'A107CooldownFloor': 'workbook maximum reduction 9 applies over source 8',
                      'nativeSelection': 'Q24; full rules in zeus-skills.md'},
        'workbookRows': {'sheet': '塔技能', 'columns': 'A:J', 'rowsMatchAcrossBothWorkbooks': local_rows},
        'abilities': abilities, 'w3a': w3a, 'profiles': profiles, 'units': records,
        'sourceFunctions': functions, 'sourceSlices': source_slices,
        'sourceHashes': {item['file']: item['sha256'] for item in manifest['files']
                         if item['file'] in {'main.disasm', 'units_abilitydata.json', 'war3map.w3a.json',
                                             'units_campaignabilitystrings.txt', 'units_unitabilities.json',
                                             'units_unitweapons.json', 'units_unitbalance.json'}},
        'verification': {**probe_results, 'workbookCells': len(local_rows) * 10 * 2,
                         'immutableManifestFiles': len(manifest['files']),
                         'fullSourceInstructions': sum(fn['pcRange'][1] for fn in functions),
                         'partialSourceInstructions': sum(sl['pcRange'][1] - sl['pcRange'][0] + 1 for sl in source_slices),
                         'localDocLinks': link_count,
                         'scope': 'decoded Lua instruction probes and explicit Web contract vectors'},
    }


if __name__ == '__main__':
    download = Path.home() / 'Downloads/刀圈TD 6.25 图鉴.xlsx'
    data = rebuild(download)
    encoded = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    document = ROOT / 'docs/rules/zeus-skills.json'
    if '--write' in sys.argv:
        document.write_text(encoded)
    else:
        assert document.read_text() == encoded, 'audit output differs from maintained zeus-skills.json'
    report = {key: val for key, val in data['verification'].items()
              if key not in {'rageCooldowns', 'selectedA106'}}
    report['rageCooldownCases'] = len(data['verification']['rageCooldowns'])
    report['selectedA106Pulses'] = len(data['verification']['selectedA106']['ticks'])
    print(json.dumps(report, ensure_ascii=False))
