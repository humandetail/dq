#!/usr/bin/env python3
"""Reuse the source VM for seasonal tasks, initial resources and wave rewards."""
import argparse
from copy import deepcopy
import json
import math
import runpy
import audit_index as source

OUT = source.ROOT / 'docs/rules/session-and-task-state.json'


def pairs(table):
    keys = sorted(k for k, value in table.items() if value is not None)
    def iterator(state, previous):
        i = 0 if previous is None else keys.index(previous) + 1
        return (keys[i], table[keys[i]]) if i < len(keys) else (None, None)
    return iterator, table, None


def summer_run_boundary():
    """Web vectors for the eligible group at each construction event."""
    state = {'awarded': False, 'completedGames': 0}
    own_tower = {'owner': 0, 'hero': True, 'builtTower': True}
    def built(group):
        hero_count = sum(u['owner'] == 0 and u['hero'] and u['builtTower'] for u in group)
        if hero_count >= 4 and not state['awarded']:
            state['awarded'] = True
            state['completedGames'] += 1
        return state['completedGames']
    group = [own_tower] * 3
    observed = [
        built(group),
        built(group + [{**own_tower, 'builtTower': False}]),
        built(group + [{**own_tower, 'owner': 1}]),
        built(group[1:] + [own_tower]),
        built(group + [{**own_tower, 'alive': False}]),
        built([own_tower] * 5),
    ]
    restored = deepcopy(state)
    state = restored
    observed.append(built([own_tower] * 4))
    state['awarded'] = False
    observed.append(built([own_tower] * 4))
    assert observed == [0, 0, 0, 0, 1, 1, 1, 2]
    return {'basis': 'Q71 dedicated task text and original current spatial group; Web specification model',
            'scenarios': ['three towers', 'illusion or summon is not a built tower', 'different owner',
                          'sold a tower before constructing replacement', 'four existing towers with no alive filter',
                          'fifth tower in same run', 'saved run restored', 'new run reaches four'],
            'observedCounts': observed}


def persistence_boundaries():
    """Small Web state vectors for monotonic wave claims and score projection."""
    state = 0
    deliveries = []

    def advance(expected, next_state):
        nonlocal state
        if state == expected:
            state = next_state

    def claim(run):
        if run == 'current' and state == 2:
            advance(2, 3)
            deliveries.append('i402')

    claim('current')
    advance(0, 1)
    claim('current')
    advance(1, 2)
    claim('old')
    assert state == 2 and not deliveries
    claim('current')
    advance(0, 1)
    advance(1, 2)
    claim('current')
    assert state == 3 and deliveries == ['i402']

    spendable, earned = 100, 10
    snapshots = [spendable + earned for _ in range(2)]
    spendable += 10
    snapshots.append(spendable + earned)
    spendable -= 60
    snapshots.append(spendable + earned)
    resumed_run = (spendable, earned)
    next_run = (snapshots[-1], 0)
    assert snapshots == [110, 110, 120, 60] and resumed_run == (50, 10) and next_run == (60, 0)
    return {'waveReward': {'stateAfterCallbacksReplay': state, 'itemCreations': len(deliveries)},
            'score': {'committedBalance': snapshots, 'resumedRunSpendableAndEarned': resumed_run,
                      'nextRunSpendableAndEarned': next_run}}


def audit(db):
    vm = runpy.run_path(str(source.ROOT / 'tools/audit-divine-books.py'))['runtime'](db)
    execute, function = vm['execute'], vm['function']
    trace = []
    noop = lambda *args: None
    env = {'pairs': pairs, 'Player_Index_Arr': {1: 0}, 'Player': int, 'GetPlayerId': int, 'GetId': str,
           'DZAPI_GetPlayerDotaTDSprStr': lambda _: '0', 'DZAPI_GetPlayerDotaTDSumStr': lambda _: '0',
           'IsInTable': lambda *_: -1, 'GetPlayerName': lambda _: 'Web', 'BC_BZ_PLAYER': {},
           'string': {'reverse': lambda s: s[::-1], 'gmatch': lambda *_: (lambda *_: None)},
           'S2I': int, 'AddPlayerTechResearched': lambda *args: trace.append(['tech', *args]),
           'CheckPlayerHasShopItem': lambda *_: True, 'math': {'floor': math.floor},
           'DZAPI_SCROE_UPDATE': lambda *args: trace.append(['score', *args]),
           'DZAPI_Update_DotaTDSprStr': noop, 'DZAPI_Update_DotaTDSumStr': noop,
           'GetPlayerNameStr': lambda _: 'Web', 'DisplayTextToAll': noop,
           'CreateTrigger': lambda: 'trigger', 'TriggerRegisterPlayerChatEvent': noop,
           'TriggerAddCondition': noop, 'Condition': lambda cb: cb}
    tasks = {}
    for label, module, init, update, table in (
        ('spring', 'main/f300', 'Mall_ActivityTask_Init', 'Mall_ActivityTask_Update', 'All_Mall_Task_List'),
        ('summer', 'main/f301', 'Mall_ActivityTask_Init_summer', 'Mall_ActivityTask_Update_Summer', 'All_Mall_Task_List_Summer')):
        execute(function(module), [env], (None,))
        env[init]()
        rows = env[table][1]
        originals = deepcopy(rows)
        rewards = deepcopy(env[update].ups[2])
        assert len(rows) == 9 and sum(row[5] for row in rows.values()) == 300
        expected_circle = 'k200' if label == 'spring' else 'k199'
        assert len(rewards) == 30 and rewards[29][1] == 2 and rewards[29][3] == expected_circle
        assert rewards[30][1] == 1 and rewards[30][3] == 300
        trace.clear()
        env[update](0, 7, 666)
        q22 = deepcopy(trace)
        env[update](0, 7, 666)
        assert trace == q22 and env[update].ups[1][1] == (40 if label == 'spring' else 30)
        assert q22 == ([['score', 0, 10], ['score', 0, 40]] if label == 'spring' else [['score', 0, 10]])
        boundaries = []
        for number, row in rows.items():
            if number == 7:
                continue
            old = env[update].ups[1][1]
            env[update](0, number, row[4] - 1)
            assert env[update].ups[1][1] == old
            env[update](0, number, row[4] if row.get(6) == 1 else 1)
            assert env[update].ups[1][1] == old + row[5]
            env[update](0, number, row[4])
            assert env[update].ups[1][1] == old + row[5]
            boundaries.append({'task': number, 'threshold': row[4], 'points': row[5], 'repeatIgnored': True})
        assert env[update].ups[1][1] == 300
        assert sum(row[2] for row in trace if row[0] == 'score') == 1170
        refs = [r for r in source.references(db, update) if r['function'] != module]
        call_sites = [{**r, 'argumentInstructions': source.instructions(db, r['function'], r['pc'], r['pc']+16)} for r in refs]
        tasks[label] = {'tasks': originals, 'rewards': rewards, 'sourceModule': module,
                        'callSites': call_sites, 'Q22InitialAwards': q22, 'boundaries': boundaries,
                        'Q80': 'progress >= displayed target; per-event gates unchanged', 'status': 'ready'}

    trace.clear()
    env.update({'SetPlayerState': lambda *args: trace.append(['resource', *args]),
                'PLAYER_STATE_RESOURCE_GOLD': 'gold'})
    execute(function('main/f306/f45'), [env, lambda *args: trace.append(['food', *args])], (0,))
    assert trace == [['resource', 0, 'gold', 2000], ['food', 0, 30]]
    initial = deepcopy(trace)
    trace.clear()
    saved, draws = {}, []
    def save(table, parent, child, value):
        saved[parent, child] = value
    def roll(lo, hi):
        draws.append([lo, hi])
        return lo
    env.update({'Jglobals': {'Task_Reward_15': '', 'Task_Reward_25': '', 'Task_Reward_35': '',
                            'HSTB': 'table', 'TB_REWARD_ITEM_0': 100, 'TB_REWARD_ITEM_1': 101,
                            'TB_REWARD_ITEM_2': 102, 'TB_REWARD_ITEM_3': 103,
                            'TB_REWARD_SHOW': 'show', 'TB_REWARD_GET': 'get'},
                'TriggerRegisterPlayerStateEvent': noop, 'TriggerAddAction': noop, 'EQUAL': 'equal',
                'SaveInteger': save, 'GetRandomInt': roll})
    execute(function('main/f305'), [env], (lambda _: {},))
    env['TaskReward_Init']()
    selected = [saved[100, i] for i in range(5)]
    assert selected == ['i402', 'i002', 'i178', 'i258', 'i278']
    assert len(draws) == 20 and all(pair == [1, 1] for pair in draws)
    stages = []
    for function_name, waves, state in (
        ('TaskReward_Item_Show', [1, 5, 15, 25, 35], 1),
        ('TaskReward_Item_Get', [5, 15, 25, 35, 45], 2)):
        for i, wave in enumerate(waves):
            env[function_name](wave)
            assert saved[100, 10+i] == state
            stages.append({'wave': wave, 'slot': i, 'state': state})
    source_jass = (source.MAP / 'war3map.j').read_text()
    assert 'elseif 2 == state then' in source_jass
    assert 'call SaveInteger(HSTB, playerID + TB_REWARD_ITEM_0, index + 10, 3)' in source_jass
    assert 'SaveServerValue( Player(0), "score", I2S(score0 + scoreNew0))' in source_jass
    saved[100, 10] = 3
    env['TaskReward_Item_Get'](5)
    assert saved[100, 10] == 2
    return {'baselineId': 'session-and-task-state-v1', 'status': 'ready',
            'originalClientTested': False, 'seasonalTasks': tasks,
            'initialResources': {'source': initial, 'webStartingLumber': 0, 'lumberBasis': 'Q24 explicit native default; source does not set starting player lumber'},
            'waveRewards': {'sourceModule': 'main/f305', 'defaultPools': selected, 'sourceDrawCount': 20,
                            'stages': stages, 'claimSource': 'reference/map-6.25/war3map.j:2617-2656',
                            'states': {'0': 'hidden', '1': 'visible locked', '2': 'claimable', '3': 'claimed'},
                            'webTransitions': ['0 to 1 on first show', '1 to 2 on first unlock', '2 to 3 on atomic claim for current run and slot'],
                            'originalReplayAfterClaimWritesState': saved[100,10]},
            'localState': {'profile': ['BAN', 'committed next-run score balance (scoreN + scoreNewN)', 'fragments', 'task counters', 'reward ledger', 'records'],
                          'run': ['current spendable score (scoreN)', 'earned checkpoint score (scoreNewN)', 'all battle and timer state', 'wave reward slots'],
                          'save': 'atomically save profile plus run revision; checkpoint score is replace-not-add; load does not repeat source events'},
            'summerTask5RunBoundary': summer_run_boundary(),
            'webPersistenceBoundaries': persistence_boundaries(),
            'validation': {'seasonalTasks': 18, 'rewardRows': 60, 'taskBoundaryCases': 16,
                           'Q22NoDuplicateCases': 2, 'waveRewardTransitions': 10, 'pending': []}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    with source.connect() as db:
        report = audit(db)
    report = json.loads(json.dumps(report, ensure_ascii=False))
    if args.check:
        assert json.loads(OUT.read_text()) == report
    else:
        OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print('18 tasks, 60 reward rows, Q22/Q80 boundaries and 10 wave-reward transitions passed')
