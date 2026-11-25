#!/usr/bin/env python3
"""Check audit bookkeeping and local document links without rerunning source audits."""
import json
import re
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
RULES = DOCS / 'rules'


def read(stem):
    return json.loads((RULES / (stem + '.json')).read_text())


def main():
    errors = []
    json_files = list(DOCS.rglob('*.json'))
    for path in json_files:
        try:
            json.loads(path.read_text())
        except (ValueError, OSError) as error:
            errors.append(f'{path.relative_to(ROOT)}: {error}')
    links = 0
    for path in DOCS.rglob('*.md'):
        content = re.sub(r'```.*?```', '', path.read_text(), flags=re.S)
        content = re.sub(r'`[^`\n]+`', '', content)
        for target in re.findall(r'\]\(([^)]+)\)', content):
            if '://' in target or target.startswith(('#', 'mailto:')):
                continue
            target = target.split('#')[0].strip('<>')
            if target and not (path.parent / target).exists():
                errors.append(f'{path.relative_to(ROOT)}: missing {target}')
            links += 1
    coverage = read('skill-source-coverage')
    skills = coverage['skills']
    states = Counter(x['verification']['status'] for x in skills)
    if len(skills) != 335 or len({x['id'] for x in skills}) != 335:
        errors.append('Skill coverage must contain 335 unique workbook IDs')
    for key, status in [('scriptBehaviorPartiallyVerified', 'script_behavior_partially_verified'),
                        ('nativeBehaviorSpecified', 'native_behavior_specified'),
                        ('sourceLocatedOnly', 'source_located_only')]:
        if coverage['counts'][key] != states[status]:
            errors.append(f'Coverage count mismatch: {key}')
    skill_review = read('skill-readiness-review')['skills']
    ready_skill_ids = {x['id'] for x in skills if x['verification'].get('implementationReady')}
    if ready_skill_ids != {key for key, rule in skill_review.items()
                           if rule['implementationReady'] and not rule['pendingDependencies']}:
        errors.append('Skill readiness disagrees between the source and review indexes')
    items = read('item-effect-coverage')['items']
    if len({row['id'] for row in items if row['wholeItemReady']}) != 243 or len(items) != 243:
        errors.append('Item coverage must contain 243 unique ready items')
    enemies = read('enemy-ability-coverage')
    if (len(enemies['templates']) != 110 or len(enemies['abilities']) != 94
            or enemies['pendingGroups']
            or any(row['status'] != 'specified' for row in enemies['abilities'].values())):
        errors.append('Enemy coverage must specify 94 abilities across 110 templates')
    baselines = read('web-baseline')['domainBaselines']
    if len({x['id'] for x in baselines}) != len(baselines):
        errors.append('Duplicate domain baseline IDs')
    for baseline in baselines:
        for field in ['specification', 'machineRules']:
            if not (RULES / baseline[field]).is_file():
                errors.append(f'{baseline["id"]}: missing {field}')
    batches = read('audit-batches')['batches']
    if len({x['id'] for x in batches}) != len(batches):
        errors.append('Duplicate batch IDs')
    for batch in batches:
        numbers = [batch.get(k) for k in ('planned', 'ready', 'remaining')]
        if all(isinstance(v, int) for v in numbers) and numbers[1] + numbers[2] != numbers[0]:
            errors.append(f'{batch["id"]}: planned != ready + remaining')
        if all(batch.get(k) is not None for k in ('startedAtUTC', 'endedAtUTC', 'elapsedSeconds')):
            start, end = (datetime.fromisoformat(batch[k].replace('Z', '+00:00'))
                          for k in ('startedAtUTC', 'endedAtUTC'))
            if (end - start).total_seconds() != batch['elapsedSeconds']:
                errors.append(f'{batch["id"]}: wall duration mismatch')
    queue = read('audit-difficult-queue')
    for field in ('items', 'closedDecisions'):
        if len({x['id'] for x in queue[field]}) != len(queue[field]):
            errors.append(f'Duplicate IDs in difficult queue {field}')
    result = {'jsonFiles': len(json_files), 'localLinks': links, 'baselines': len(baselines),
              'skills': len(skills), 'skillsReady': len(ready_skill_ids), 'itemsReady': len(items),
              'enemyAbilities': len(enemies['abilities']), 'coverage': dict(states), 'batches': len(batches),
              'openDifficult': [x['id'] for x in queue['items'] if x['status'] != 'resolved'],
              'errors': errors}
    print(json.dumps(result, ensure_ascii=False))
    return bool(errors)


if __name__ == '__main__':
    raise SystemExit(main())
