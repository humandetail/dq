#!/usr/bin/env python3
"""Static N133-135 source slices and explicit local Web contract checks.

Does not execute Warcraft or claim whole damage-dispatch coverage.
"""
import ast
import hashlib
import json
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parents[1]
REF = ROOT/'reference/map-6.25'
LINES = (REF/'main.disasm').read_text().splitlines()


def function(name):
    start = LINES.index('.function\t'+name)
    end = next((i for i in range(start+1,len(LINES)) if LINES[i].startswith('.function')),len(LINES))
    result = {'name':name,'sourceLines':[start+1,end],'constants':{},'labels':{},'instructions':[]}
    for i in range(start,end):
        s = LINES[i].strip()
        if s.startswith('.constant'):
            _, key, raw = s.split(None,2)
            result['constants'][key] = {'nil':None,'true':True,'false':False}[raw] if raw in ('nil','true','false') else ast.literal_eval(raw[1:] if raw.startswith('L"') else raw)
        elif s.startswith('.label'):
            result['labels'][s.split()[1]] = len(result['instructions'])+1
        elif s and not s.startswith('.'):
            result['instructions'].append({'pc':len(result['instructions'])+1,'line':i+1,'raw':s.split(';')[0].split()})
    return result


f = function('main/f291/f1')
spec = [('N133','B097','isPhyDamage',1294,1.07,825,'n198'),('N134','B098','isMagicDamage',1447,1.1,821,'n248'),('N135','B099','isRealDamage',1596,1.08,859,'n220')]
abilities = {x['alias']:x for x in json.loads((REF/'units_abilitydata.json').read_text())}
mounts = {x['unitAbilID']:x for x in json.loads((REF/'units_unitabilities.json').read_text())}
objects = json.loads((REF/'war3map.w3a.json').read_text())
entries=[]
for id_,buff,predicate,pc,mult,row,tower in spec:
    ins = f['instructions'][pc-1:pc+20]
    # Independently assert the entire 21-op branch skeleton and its operands:
    # classifier(EXGetEventDamageData(4)), actual S buff>0, current damage * M.
    expected_ops = ['gettabup','gettabup','loadk','call','call','test','jmp','gettabup','move','gettabup','loadk','call','call','lt','jmp','gettabup','gettabup','loadk','call','mul','call']
    assert [x['raw'][0] for x in ins] == expected_ops
    assert f['constants'][ins[0]['raw'][-1]] == predicate
    assert f['constants'][ins[1]['raw'][-1]] == 'EXGetEventDamageData'
    assert f['constants'][ins[2]['raw'][-1]] == 4
    assert ins[8]['raw'] == ['move','r5','r0']
    assert f['constants'][ins[10]['raw'][-1]] == buff
    assert ins[13]['raw'][:2] == ['lt','0'] and f['constants'][ins[13]['raw'][2]] == 0
    assert f['labels'][ins[14]['raw'][-1]] == pc+21
    assert f['labels'][ins[6]['raw'][-1]] > pc+21
    assert f['constants'][ins[15]['raw'][-1]] == 'EXSetEventDamage'
    assert f['constants'][ins[16]['raw'][-1]] == 'GetEventDamage'
    assert f['constants'][ins[17]['raw'][-1]] == 0
    assert f['constants'][ins[19]['raw'][-1]] == mult
    assert abilities[id_]['code']=='AHad' and abilities[id_]['Area1']==500 and abilities[id_]['BuffID1']==buff
    assert 'DataA1' not in abilities[id_] and not any(x['old']==id_ for x in objects)
    assert id_ in mounts[tower]['abilList'].split(',')
    entries.append({'id':id_,'buff':buff,'tower':tower,'row':row,'sourceMultiplier':mult,'selectedMultiplier':1.1,'ability':abilities[id_],'mount':mounts[tower],'branch':{'function':f['name'],'pcRange':[pc,pc+20],'sourceLines':[ins[0]['line'],ins[-1]['line']],'instructions':ins,'resolvedConstants':{k:v for k,v in f['constants'].items() if any(k in x['raw'] for x in ins)},'outgoingBranches':{x['raw'][-1]:f['labels'][x['raw'][-1]] for x in ins if x['raw'][0]=='jmp'}}})

books=[]
for path in [ROOT/'图鉴.xlsx',Path('/Users/laihanbin/Downloads/刀圈TD 6.25 图鉴.xlsx')]:
    book=openpyxl.load_workbook(path,read_only=True,data_only=True);rows=[]
    for n in [821,825,859]:
        cells=next(book['塔技能'].iter_rows(min_row=n,max_row=n,max_col=10))
        values={c.coordinate:c.value for c in cells}
        assert '10%' in values[f'H{n}'] and values[f'I{n}'] is None and values[f'J{n}'] is None
        rows.append({'row':n,'cells':values})
    book.close();books.append({'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'rows':rows})
assert books[0]['rows']==books[1]['rows']

# Full classifier helpers are retained as source evidence. The local vectors
# below test the selected Web contract, not an emulated original client.
helpers=[function('main/f7/f'+str(i)) for i in [36,37,38]]
cases=[]
def check(name,actual,expected):
    assert actual==expected,(name,actual,expected)
    cases.append({'name':name,'actual':actual,'expected':expected})

def classify(t):return 'B097' if t=='NORMAL' else 'B099' if t=='DIVINE' else 'B098'
for t in ['NORMAL','DIVINE','MAGIC','FIRE','POISON','UNKNOWN']:
    for buff in ['B097','B098','B099']:
        for rank in [0,1,2]:
            got=1000*1.1 if rank>0 and classify(t)==buff else 1000
            match=(t=='NORMAL' and buff=='B097') or (t=='DIVINE' and buff=='B099') or (t not in ['NORMAL','DIVINE'] and buff=='B098')
            check(str((t,buff,rank)),got,1100 if rank>0 and match else 1000)
for radius,want in [(499.999,True),(500,True),(500.001,False)]:check('range'+str(radius),radius<=500,want)
for candidates in [1,2,8]:check('same-buff emitters '+str(candidates),1000*(1.1 if candidates else 1),1100)
check('actual dummy without buff, tower owner buff does not substitute',1000,1000)
check('at source position in pipeline after previous change',250*1.1,275)
check('later zero remains zero',0*1.1,0)

data={'baseline':'creep-damage-auras-v1','status':'bounded source branches and native aura contract specified','entries':entries,'workbooks':books,'classifierHelpers':helpers,'sourceRegister':'main/f291/f1 begins GetEventDamageSource into r0; these branches move r0 into buff query, never resolved owner r2','sourceDecisions':['N133 1.07 -> workbook1.10','N134 remains1.10','N135 1.08 -> workbook1.10'],'webContract':{'aura':'500 closed center circle, self/friend; instant application/recompute and zero linger; same buff single presence, not per-emitter stacking','nativeArmor':0,'armorNote':'DataA is absent; zero is explicit Q24 no implicit extra armor','sourceEligibility':'existing alive completed nonhidden nonillusion source with enabled ability; use same ordinary aura emission gates as hero-aura-family-v1','receivers':'existing alive nonhidden nonAloc friendly units including self, air/ground, native heroes, summoned/illusions, invulnerable/magic-immune/ethereal; no extra armor even if received','damage':'check actual damage source buff at original branch time, category determined solely by source helpers; no local ordinary-attack/hero/nonillusion/mode/positive-current-damage gate','lifecycle':'ordinary dispel does not remove ongoing aura; source removal/disabled/death, receiver death/remove, allegiance/range changes recompute immediately; preserve explicit hidden state rather than inheriting buffs from owner','events':'no separate damage, spell event, mana, cooldown or RNG','save':'restore actual sources and units then recompute membership once; never replay damage'},'validation':{'sourceSliceInstructions':63,'completeClassifierInstructions':sum(len(x['instructions']) for x in helpers),'bookCells':60,'contractCases':len(cases),'cases':cases,'kind':'exact opcode/operand/branch assertions plus explicitly selected Web vectors; no bytecode execution claimed','clientRun':False,'gameRun':False},'sourceHashes':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [REF/'main.disasm',REF/'units_abilitydata.json',REF/'units_unitabilities.json',REF/'war3map.w3a.json']},'remaining':['other damage pipeline callees','global summon/illusion membership','the entire three carrier towers and their other skills']}
(ROOT/'docs/rules/creep-damage-auras.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in data['validation'].items() if k!='cases'}))
