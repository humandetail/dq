"""Root-only helpers for recording reviewed audit results; no source extraction."""
import json
import re
from collections import Counter
from pathlib import Path

RULES = Path(__file__).resolve().parents[1] / 'docs' / 'rules'


def load(stem):
    return json.loads((RULES / (stem + '.json')).read_text())


def save(stem, value):
    (RULES / (stem + '.json')).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def upsert(records, entry):
    for index, previous in enumerate(records):
        if previous['id'] == entry['id']:
            records[index] = {**previous, **entry}
            return
    records.append(entry)


def record_batch(entry, ready_skills=(), baseline=True):
    """Call only after reviewing an agent's completed scope and validation report."""
    stem = entry['ruleSection'].removesuffix('.md')
    data = load(stem)
    assert (RULES / entry['ruleSection']).is_file()
    assert entry['ready'] + entry['remaining'] == entry['planned']
    ledger = load('audit-batches')
    upsert(ledger['batches'], entry)
    save('audit-batches', ledger)
    if baseline:
        registry = load('web-baseline')
        bid = data.get('baselineId', data.get('baseline', stem + '-v1')) if isinstance(data, dict) else stem + '-v1'
        upsert(registry['domainBaselines'], {'id': bid, 'specification': stem + '.md', 'machineRules': stem + '.json'})
        save('web-baseline', registry)
    if ready_skills:
        coverage = load('skill-source-coverage')
        index = {skill['id']: skill for skill in coverage['skills']}
        for sid in ready_skills:
            index[sid]['verification'] = {
                'status': 'script_behavior_partially_verified',
                'scope': '本专项完整限定规则已明确且可实现；已核共享接口直接引用，未进行原客户端或游戏运行验证。',
                'ruleSection': entry['ruleSection'], 'implementationReady': True, 'originalClientTested': False,
            }
        save('skill-source-coverage', coverage)
    refresh_counts()


def record_decision(number, title, resolution, rule_section=None):
    queue = load('audit-difficult-queue')
    upsert(queue['closedDecisions'], {'id': number, 'scope': title, 'resolution': resolution,
                                   'rules': rule_section or '../web-port-design.md'})
    save('audit-difficult-queue', queue)
    main = RULES.parent / 'web-port-design.md'
    body = main.read_text()
    if number + ' 已确认' not in body:
        link = f'详见[{title}](rules/{rule_section})。' if rule_section else ''
        main.write_text(body + f'\n{number} 已确认{title}：{resolution}{link}\n')
    readme = RULES / 'README.md'
    body = readme.read_text()
    if f'| {number} |' not in body:
        body = body.replace('\n\n以下按既有决定', f'\n| {number} | {title} | {resolution} |\n\n以下按既有决定')
        readme.write_text(body)


def refresh_counts():
    coverage = load('skill-source-coverage')
    counts = Counter(skill['verification']['status'] for skill in coverage['skills'])
    for key, status in [('scriptBehaviorPartiallyVerified', 'script_behavior_partially_verified'),
                        ('nativeBehaviorSpecified', 'native_behavior_specified'), ('sourceLocatedOnly', 'source_located_only')]:
        coverage['counts'][key] = counts[status]
    coverage['counts']['explicitCompleteSkillRulesThisIntegration'] = sum(
        skill['verification'].get('implementationReady') is True for skill in coverage['skills'])
    save('skill-source-coverage', coverage)
    for filename, pattern, text in [
        ('README.md', r'效果索引中\d+个已核指定脚本分支，\d+项已明确限定的原生组件/效果Web规格，\d+个仍仅来源定位。\d+项含',
         f"效果索引中{counts['script_behavior_partially_verified']}个已核指定脚本分支，{counts['native_behavior_specified']}项已明确限定的原生组件/效果Web规格，{counts['source_located_only']}个仍仅来源定位。{counts['native_behavior_specified']}项含"),
        ('audit-work-queue.md', r'技能来源索引：\d+项指定脚本分支、\d+项限定原生组件/效果、\d+项仅定位',
         f"技能来源索引：{counts['script_behavior_partially_verified']}项指定脚本分支、{counts['native_behavior_specified']}项限定原生组件/效果、{counts['source_located_only']}项仅定位"),
    ]:
        path = RULES / filename
        path.write_text(re.sub(pattern, text, path.read_text()))
