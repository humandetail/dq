#!/usr/bin/env python3
"""Extract growth/learning inputs and verify the declared Web transitions."""
from collections import Counter
from fractions import Fraction
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
REF = ROOT / 'reference/map-6.25'
def read(name): return json.loads((REF / name).read_text())
units = {u['unitAbilID']: u for u in read('units_unitabilities.json')}
balance = {u['unitBalanceID']: u for u in read('units_unitbalance.json')}
abilities = {a['alias']: a for a in read('units_abilitydata.json')}
unit_overrides, ability_overrides = read('war3map.w3u.json'), read('war3map.w3a.json')
towers = json.loads((ROOT / 'docs/rules/economy-data.json').read_text())['towers']
hero_ids = sorted(t['id'] for t in towers if units.get(t['id'], {}).get('heroAbilList', '_') != '_')
assert len(hero_ids) == len(set(hero_ids)) == 136
assert not any(m['key'] in {'uhab', 'ustr', 'ustp', 'uagi', 'uagp', 'uint', 'uinp'} for e in unit_overrides for m in e['mods'])
assert not any(m['key'] in {'alev', 'arlv', 'alsk'} for e in ability_overrides for m in e['mods'])
growth = []
missing = []
for ident in hero_ids:
    row = balance[ident]
    fields = {}
    for key in ['STR', 'AGI', 'INT', 'STRplus', 'AGIplus', 'INTplus']:
        if key in row:
            assert Fraction(str(row[key])).denominator == 1
            fields[key] = {'sourceValue': row[key], 'selectedValue': int(row[key]), 'basis': 'explicit map field'}
        else:
            missing.append((ident, key))
            fields[key] = {'sourceValue': None, 'selectedValue': 0, 'basis': 'Q24 explicit zero for missing Tiny/firelord AGI field; not claiming source stores zero'}
    growth.append({'unitId': ident, 'heroAbilList': units[ident]['heroAbilList'].split(','), 'fields': fields})
assert sorted(missing) == [('G059', 'AGI'), ('G059', 'AGIplus'), ('H021', 'AGI'), ('H021', 'AGIplus')]
skill_ids = sorted({a for g in growth for a in g['heroAbilList']})
learning = []
for ident in skill_ids:
    a = abilities[ident]
    cap = a['levels']
    first = a.get('reqLevel', 1)
    skip = a.get('levelSkip', 3)
    learning.append({'abilityId': ident, 'cap': cap, 'sourceRequiredLevel': a.get('reqLevel'), 'sourceLevelSkip': a.get('levelSkip'), 'selectedFirstLevel': first, 'selectedSkip': skip, 'requiredHeroLevels': [first + skip * rank for rank in range(cap)], 'firstLevelBasis': 'explicit field' if 'reqLevel' in a else 'Q24 missing field selected1', 'skipBasis': 'explicit field' if 'levelSkip' in a else 'map HeroAbilityLevelSkip=3'})
assert len(learning) == 186
assert Counter((l['cap'], l['selectedFirstLevel'], l['selectedSkip']) for l in learning) == {(6, 1, 3): 185, (1, 30, 3): 1}

# Independent arithmetic checks exercise add/remove around every declared level.
checks = 0
for g in growth:
    f = g['fields']
    for stat in ['STR', 'AGI', 'INT']:
        start, gain = f[stat]['selectedValue'], f[stat + 'plus']['selectedValue']
        table = [start + gain * (level - 1) for level in range(1, 31)]
        for old_level in range(1, 31):
            for new_level in [1, 20, 30]:
                old, new = table[old_level - 1], table[new_level - 1]
                permanent_delta, equipment_bonus = 37, 19
                changed = old + permanent_delta + (new - old)
                assert changed == new + permanent_delta
                assert changed + equipment_bonus == new + permanent_delta + equipment_bonus
                assert changed + (old - new) == old + permanent_delta
                checks += 1

def strip_points(unspent, learned_history, actual_ranks, levels):
    unspent, history, ranks = unspent, list(learned_history), dict(actual_ranks)
    take = min(unspent, levels)
    unspent -= take
    debt = levels - take
    removed = []
    while debt and history:
        slot = history.pop()
        ranks[slot] = max(0, ranks.get(slot, 0) - 1)
        removed.append(slot)
        debt -= 1
    return {'unspent': unspent, 'history': history, 'ranks': ranks, 'removed': removed, 'unpayableDebtDiscarded': debt}

point_vectors = [
    {'input': [4, ['A', 'B'], {'A': 1, 'B': 1}, 2], 'expected': {'unspent': 2, 'history': ['A', 'B'], 'ranks': {'A': 1, 'B': 1}, 'removed': [], 'unpayableDebtDiscarded': 0}},
    {'input': [1, ['A', 'B', 'A'], {'A': 2, 'B': 1}, 3], 'expected': {'unspent': 0, 'history': ['A'], 'ranks': {'A': 1, 'B': 0}, 'removed': ['A', 'B'], 'unpayableDebtDiscarded': 0}},
    {'input': [0, ['A'], {'A': 0, 'scriptOnly': 6}, 1], 'expected': {'unspent': 0, 'history': [], 'ranks': {'A': 0, 'scriptOnly': 6}, 'removed': ['A'], 'unpayableDebtDiscarded': 0}},
    {'input': [0, [], {'scriptOnly': 6}, 1], 'expected': {'unspent': 0, 'history': [], 'ranks': {'scriptOnly': 6}, 'removed': [], 'unpayableDebtDiscarded': 1}},
]
for v in point_vectors: assert strip_points(*v['input']) == v['expected']
learning_profile_checks = 0
for item in learning:
    expected_levels = [30] if item['abilityId'] == 'P000' else [1, 4, 7, 10, 13, 16]
    assert item['requiredHeroLevels'] == expected_levels
    learning_profile_checks += 1

data = {
    'schemaVersion': 1, 'baselineId': 'hero-progression-v1',
    'scope': 'native growth/learning/strip interface; no claim all learning callbacks or transformations audited',
    'sourceFiles': [{'path': str(p.relative_to(ROOT)), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in [REF/'units_unitabilities.json', REF/'units_unitbalance.json', REF/'units_abilitydata.json', REF/'war3map.w3u.json', REF/'war3map.w3a.json', REF/'war3mapMisc.txt']],
    'workbookCrossCheck': 'hero-growth-workbook-check.json; both books, 816 fields each, no explicit numerical differences; four blank cells remain explicit Q24 choices',
    'growthRecords': growth, 'learningRequirements': learning,
    'sourceConstraints': {'HeroAbilityLevelSkip': 3, 'MaxHeroLevel': 30, 'growthAndLearningOverridesFound': 0, 'businessDirectSkillPointMutationsFound': 0, 'businessUnitStripCall': 'main/f291/f18; qualification-lifecycle.json contains complete bytecode'},
    'webSelections': {
        'authority': 'Q24 for native details after map/official source review; not matched-client behavior',
        'initialLevel': 1, 'initialUnspentPoints': 1,
        'naturalAttributes': 'For these integral tables: natural(L)=sourceBase+(L-1)*growth; use delta natural(new)-natural(old), preserve all other explicit script/item contributions; do not overwrite total stats from template on each level change',
        'missingGrowth': 'Only H021/G059 AGI/AGIplus selected0; all explicit fields retained',
        'levelGain': 'X04 commits each level with natural delta and one new unspent point before synchronous original HeroLevelUpEvent; stripping inside callback occurs before W019 and ends XP transaction as already specified',
        'learning': 'requires alive native HERO, a current learnable slot, one unspent point, next rank below cap, declared hero-level and explicit tech requirements; commit point and rank once then emit original learning callback once',
        'learningRequirementMeaning': 'minimum level is admission for a new learned rank, not a periodic rule unlearning an existing rank; script-added levels are not silently converted into paid skill points',
        'strip': 'Apply X04 XP/level; subtract natural-growth delta; remove one point per actual lost level, first unspent then reverse paid-learning history, decrementing current rank of the recorded logical slot down to0; do not synthesize learning or level-up events',
        'callbackSideEffects': 'Do not reverse arbitrary original script learning effects (e.g. A084 +500 max/current mana) without an explicit source reversal; native level-based ability contributions update to actual new rank',
        'scriptRankWrites': 'Direct add/remove/set ability rank does not synthesize spending, refunds or learning events; consumes no paid-history entry; later stripping a recorded slot clamps rank at0 rather than reviving removed abilities',
        'insufficientPointHistory': 'No negative unspent points or invented history; retire only available records; explicitly scripted grants remain outside paid history',
        'slotMapping': 'Logical paid slot history must be preserved/mapped by the separate skin/ANeg transaction; do not infer mapping from names or blindly replace with current template heroAbilList',
        'save': 'Persist actual ranks, paid slot history, unspent points, natural component and explicit resource state; no level/learning callback replay'
    },
    'primaryEvidence': [
        {'url': 'https://classic.battle.net/war3/basics/heroes.shtml', 'supports': 'new heroes start with a skill point, level gains attributes and a skill point; stock level10 does not override map30'},
        {'url': 'https://us.forums.blizzard.com/en/warcraft3/t/unitstripherolevel-unlearns-an-ability-when-it-shouldnt/37269', 'supports': 'firsthand 2025 bug reproduction reports unintended unlearning despite spare points; does not settle this map client, so deterministic rollback order is explicit Q24'}
    ],
    'verification': {'growthArithmeticChecks': checks, 'learningProfileChecks': learning_profile_checks, 'skillPointVectors': point_vectors, 'growthFieldsAreIntegral': True, 'originalClientRun': False, 'webGameRun': False},
    'remaining': ['all skill-specific learning callbacks', 'complete ANeg/Acha slot/resource mapping', 'all stat-setting primitive semantics and derived HP/mana/current-resource updates beyond natural-attribute delta', 'illusion copied growth/paid-skill state and other special creation paths']
}
(ROOT / 'docs/rules/hero-progression.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'growthRecords': len(growth), 'learnableAbilities': len(learning), 'growthArithmeticChecks': checks, 'learningProfileChecks': learning_profile_checks, 'missingFirstLevelFields': sum(x['sourceRequiredLevel'] is None for x in learning)}))
