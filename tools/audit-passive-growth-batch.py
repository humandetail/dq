#!/usr/bin/env python3
"""Check compact passive-growth source records and the affected timer boundaries."""
import ast
from collections import defaultdict
from contextlib import closing
from fractions import Fraction
from functools import cache
import heapq
import json
import math
import sys

import audit_index as index

OUT = index.ROOT / 'docs/rules/passive-growth-batch-01.json'
SKILLS = {
    'A030': ('main/f31', 'AOcr', []),
    'A038': ('main/f36', 'AOcr', []),
    'A039': ('main/f37', 'AOcr', []),
    'A048': ('main/f44', 'AOcr', []),
    'A109': ('main/f88', 'AOcr', ['A110', 'B102']),
    'A115': ('main/f92', 'AOcr', []),
    'A116': ('main/f93', 'AOcr', ['T083', 'T117', 'T118']),
    'A183': ('main/f130', 'AEev', ['A182', 'T197']),
}
ENTRY_SYMBOLS = {
    'A030': ['A030_study'], 'A038': ['A038_Action'], 'A039': ['A039_Action'],
    'A048': ['A048_Action'], 'A109': ['A109_Action', 'A109_Study'],
    'A115': ['A115_Action'], 'A116': ['A116_Study', 'A116_time_end'], 'A183': ['A182_Action'],
}


def source_records(db):
    profile_path = index.MAP / 'units_campaignabilitystrings.txt'
    profile_lines = profile_path.read_text().splitlines()
    for id, (module, code, auxiliary) in SKILLS.items():
        rows = [row for row in index.workbook_rows(db, id, '塔技能') if row['cells'][5] == id]
        by_file = defaultdict(dict)
        for row in rows:
            by_file[row['sourcePath']][row['row']] = row['cells']
        original, repository = by_file.values()
        assert original == repository
        obj, = index.objects(db, id, 'units_abilitydata')
        assert obj['fields']['code'] == code and obj['fields']['levels'] == 6
        assert not index.objects(db, id, 'war3map.w3a')
        if code == 'AOcr':
            assert not any(k.startswith('Data') for k in obj['fields'])
        else:
            assert obj['fields']['DataA1'] == 10 and obj['fields']['targs1'] == 'self,invulnerable'
        start = profile_lines.index(f'[{id}]')
        hint, = [(j + 1, line) for j, line in enumerate(profile_lines[start:start+20], start)
                 if line.startswith('Ubertip=')][:1]
        funcs = [(name, start, end) for name, start, end in db.execute(
            'SELECT name,start_line,end_line FROM function WHERE name=? OR name LIKE ? ORDER BY start_line',
            (module, module+'/%'))]
        routing = [{'function':r['function'], 'pc':r['pc'], 'line':r['sourceLine']} for symbol in ENTRY_SYMBOLS[id]
                   for r in index.references(db, symbol) if r['function'].startswith('main/f291/')]
        units = sorted({r[1] for r in repository.values()})
        mounts = {}
        for unit in units:
            mount, = index.objects(db,unit,'units_unitabilities')
            assert id in mount['fields']['heroAbilList'].split(',')
            mounts[unit] = mount['jsonIndex']
        yield id, {'workbookRows': sorted(repository), 'units': units,
                   'objectIndex':obj['jsonIndex'], 'hintLine':hint, 'functions':funcs,
                   'routing':routing, 'unitMountIndexes':mounts, 'auxiliary':auxiliary}


def indexed_runtime(db):
    @cache
    def function(name):
        labels, upvalues = db.execute('SELECT labels,upvalues FROM function WHERE name=?',(name,)).fetchone()
        constants = {k:{'value':json.loads(v)} for k,v in db.execute(
            'SELECT key,value FROM constant WHERE function=?',(name,))}
        instructions = [{'raw':' '.join([op,*json.loads(args)]),'sourceLine':line} for op,args,line in db.execute(
            'SELECT op,args,line FROM instruction WHERE function=? ORDER BY pc',(name,))]
        return {'function':name, 'constants':constants, 'instructions':instructions,
                'sourcePath':index.DISASM, 'labels':json.loads(labels), 'upvalueBindings':[(int(r),local=='true')
                                                                 for _,r,local in json.loads(upvalues)]}

    vm = {'function':function, 'COVER':defaultdict(set), 'TABLE_REFS':{}}
    runner = ast.parse((index.ROOT/'tools/audit-wisp-link-overcharge-relocate.py').read_text())
    arena = ast.parse((index.ROOT/'tools/audit-zeus-skills.py').read_text())
    nodes = {n.name:n for n in runner.body if isinstance(n,(ast.FunctionDef,ast.ClassDef))}
    names = ['truth','equal','get','put','length','pairs','ipairs','Closure','execute']
    exec(compile(ast.Module(body=[nodes[n] for n in names],type_ignores=[]), 'existing Lua runner', 'exec'),vm)
    probe = next(n for n in arena.body if isinstance(n,ast.ClassDef) and n.name=='Probe')
    allowed = {'new_timer','start_timer','enqueue','advance','enum'}
    probe.body = [n for n in probe.body if isinstance(n,ast.FunctionDef) and n.name in allowed]
    vm.update(Fraction=Fraction,heapq=heapq,math=math)
    exec(compile(ast.Module(body=[probe],type_ignores=[]), 'existing timer probe', 'exec'), vm)
    return vm


def probe_context(db, modules):
    vm = indexed_runtime(db)
    world = vm['Probe']()
    world.timers, world.queue, world.events, world.now, world.sequence = [], [], [], 0, 0
    caster = dict(owner=0, life=1000, maxLife=1000, skills={}, str=100, agi=100, int=100, x=0, y=0)
    target = dict(owner=11,life=10000,maxLife=10000,x=500,y=0,skills={})
    far = {**target,'x':1000}
    world.units = [caster,target,far]
    packets, gold = [], {0:0}
    env = dict(Tower_ALL={1:caster}, TxShow=False, math={'floor':math.floor,'ceil':math.ceil},
               Game_Mode=0, cur_monLv=8, pairs=vm['pairs'], UNIT_STATE_LIFE='life',UNIT_STATE_MAX_LIFE='maxLife',
               ATTACK_TYPE_NORMAL='normal', ATTACK_TYPE_CHAOS='chaos', ATTACK_TYPE_HERO='hero',
               DAMAGE_TYPE_DIVINE='divine',DAMAGE_TYPE_MAGIC='magic',DAMAGE_TYPE_NORMAL='normal',
               WEAPON_TYPE_WHOKNOWS='whoknows',PLAYER_STATE_RESOURCE_GOLD='gold',
               GetId=lambda id:id, Player=lambda n:n, GetPlayerId=lambda p:p, GetUnitName=lambda _: 'probe',
               GetOwningPlayer=lambda unit:unit['owner'], GetUnitState=lambda u,k:(u or {}).get(k,0),
               GetUnitX=lambda u:u['x'],GetUnitY=lambda u:u['y'],
               SetUnitState=lambda u,k,v:u.__setitem__(k,min(v,u['maxLife'])),
               GetUnitAbilityLevel=lambda u,code:(u or {}).get('skills',{}).get(code,0),
               GetHeroStr=lambda u,_:u['str'], GetHeroAgi=lambda u,_:u['agi'], GetHeroInt=lambda u,_:u['int'],
               SetHeroStr=lambda u,v,_:u.__setitem__('str',v), SetHeroAgi=lambda u,v,_:u.__setitem__('agi',v),
               SetHeroInt=lambda u,v,_:u.__setitem__('int',v), GetTriggerUnit=lambda:target,
               IsUnitIllusion=lambda u:u.get('illusion',False), GetUnitTypeId=lambda _: 'H034',
               Has_A_Item=lambda u: u.get('scepter',False), CreateGroup=list, DestroyGroup=lambda _:None,
               GroupEnumUnitsInRange=world.enum, FirstOfGroup=lambda group: group[0] if group else None,
               GroupRemoveUnit=lambda g,u:g.remove(u),GroupClear=list.clear,
               IsUnitOwnedByPlayer=lambda u,p:u['owner']==p,
               _loop_=lambda: (lambda _,prev:(prev or 0)+1,None,None),
               GetExpiredTimer=lambda:world.expired, CreateTimer=world.new_timer,TimerStart=world.start_timer,
               DestroyTimer=lambda t: t and t.update(running=False),
               UnitDamageTarget=lambda s,t,n,a,r,at,dt,w:packets.append((str(world.now),t['x'],n,dt)),
               SetRealDamage=lambda s,t,n:packets.append((str(world.now),t['x'],n,'divine')),
               GetPlayerState=lambda p,k:gold[p],SetPlayerState=lambda p,k,v:gold.__setitem__(p,v),
               CreateTextByUnit=lambda *args:None,UpDate_GetGold_Arr=lambda *args:None,
               UnitAddAbility=lambda u,code:u['skills'].setdefault(code,1),
               UnitRemoveAbility=lambda u,code:u['skills'].pop(code,None),
               UnitMakeAbilityPermanent=lambda *args:None,
               SetUnitAbilityLevel=lambda u,code,rank:u['skills'].__setitem__(code,rank))
    env['IsInTable'] = vm['Closure']('main/f7/f7',[env])
    env['AddArrAny'] = vm['Closure']('main/f7/f22',[env])
    for module in modules:
        vm['execute'](vm['function'](module),[env],(lambda _:None,))
    return vm, world, env, caster, target, packets, gold


def source_probes(db):
    vm, world, env, caster, target, packets, gold = probe_context(
        db, [module for module,_,_ in SKILLS.values()])
    checks = {}

    caster['skills']['A030'] = 1
    env['A030_study'](caster,1)
    world.advance(1)
    assert packets == [('1',500,400,'magic')]
    caster['scepter'] = True
    env['A030_study'](caster,1)
    world.advance(2)
    assert packets[-2:] == [('2',500,800,'magic'),('2',1000,800,'magic')]
    caster['skills'].pop('A030')
    checks['A030'] = [400,800,800]

    caster.update(life=50,skills={'A038':1,'A039':1})
    env['A038_Action'](caster)
    env['A039_Action'](caster)
    assert caster['life'] == 1000 and math.isclose(packets[-1][2],30.3)
    world.advance(3)
    caster.update(life=80)
    caster['skills']['A038']=2
    env['A038_Action'](caster)
    world.advance(22)
    assert caster['str']==102
    caster.update(life=42)
    world.advance(25)
    assert caster['str']==100 and caster['life']==1000
    checks['A038'] = {'totalsAfterFirstExpiry':[102,102,102],'expiredLayerHealsToMax':True}
    caster['illusion']=True
    env['A039_Action'](caster)
    assert packets[-1][2] == 6
    checks['A039'] = {'withEarlierLayer':30.3,'illusion':6}

    caster.update(scepter=False,skills={'A048':1,'A109':1})
    before = caster['int']
    env['A048_Action'](caster)
    unchanged = caster['int']
    env['A048_Action'](caster)
    assert (unchanged,caster['int']) == (before,before+1)
    checks['A048'] = [0,1]
    amounts = []
    for _ in range(3):
        balance = gold[0]
        env['A109_Action'](caster)
        amounts.append(gold[0]-balance)
    world.advance(30)
    balance = gold[0]
    env['A109_Action'](caster)
    assert amounts == [4,5,5] and gold[0]-balance==4
    env['A109_Study'](caster)
    assert gold[0]-balance==644
    checks['A109'] = {'firstThreeAndReset':[4,5,5,4],'studyAtWave8':640}

    caster.update(life=90,skills={'A115':1})
    env['A115_Action'](caster,target)
    before = len(packets)
    world.advance(31)
    assert len(packets)==before and caster['life']==290
    caster.update(scepter=True)
    world.advance(32)
    assert packets[-1] == ('32',500,200,'divine') and caster['life']==490
    world.advance(36)
    assert packets[before:] == [(str(t),500,200,'divine') for t in (32,34,36)]
    checks['A115'] = {'burnDelays':[2,4,6],'healTriggerAt90Of1000':True,'twoHealTicksLife':490}

    caster.update(life=1000,skills={'A116':1})
    env['A116_Study'](caster)
    world.advance(37)
    assert (caster['skills']['T117'],caster['skills']['T118'])==(1,1)
    caster['life']=1
    world.advance(38)
    assert (caster['skills']['T117'],caster['skills']['T118'])==(4,4)
    caster['skills']['A116']=6
    caster['life']=1
    world.advance(39)
    assert caster['skills']['T117']==20
    old = world.timers[-1]
    caster['skills']['A116']=1
    env['A116_Study'](caster)
    assert old['running'] and world.timers[-1]['running']
    timer_table = next(up for up in env['A116_time_loop'].ups if isinstance(up,dict) and up is not env)
    assert env['IsInTable'](old,timer_table)==-1
    checks['A116']={'fullLifeRank':1,'lowLifeAt1And6':[4,20],'relearnOldTimerStillRunningButIndex':-1}

    # Isolate the repair from the original orphaned timer, then replay relearning.
    old['running'] = False
    previous = world.timers[-1]
    study = env['A116_Study']
    program = vm['function'](study.name)
    instructions = program['instructions'].copy()
    assert instructions[12]['raw'] == 'gettabup r2 u0 k6'
    assert program['constants']['k6']['value'] == 'inedx'
    instructions[12] = {**instructions[12],'raw':'move r2 r1'}
    callback = env['A116_time_loop']

    def guarded_callback():
        timer = env['GetExpiredTimer']()
        slot = env['IsInTable'](timer,timer_table)
        if slot != -1 and slot in env['Tower_ALL']:
            callback()

    env['A116_time_loop'] = guarded_callback
    vm['execute']({**program,'instructions':instructions},study.ups,(caster,))
    assert not previous['running'] and world.timers[-1]['running'] and timer_table[1] is world.timers[-1]
    world.expired = previous
    guarded_callback()
    assert caster['skills']['T117']==20
    caster['skills'].pop('A116')
    world.advance(40)
    assert (caster['skills']['T117'],caster['skills']['T118'])==(1,1)
    checks['A116Repair'] = {'sourceLookupPC':13,'liveTimersAfterRelearn':1,
                            'oldCallbackNoEffect':True,'rankAfterLoss':1,'firstNewTickDelay':1}

    checks['A183'] = quill_source_probe(env,caster,packets)
    return checks


def quill_source_probe(env,caster,packets):
    caster.update(skills={'A182':1,'A183':6},str=120,agi=120,int=120)
    orders = []
    env.update(GetUnitUserData=lambda _:1, GetUnitLoc=lambda u:(u['x'],u['y']),
               CreateTempAndSetAbilityLv=lambda owner,loc,facing,id,rank,life:{'id':id,'rank':rank},
               SetUnitUserData=lambda u,slot:u.update(slot=slot),
               IssueTargetOrder=lambda u,order,t:orders.append((u,order,t['x'])),
               CreateTextTagByUnit=lambda *args:None, UnitKillUnit=lambda *args:None)
    counts = {}
    for stack in range(1,14):
        before = len(packets)
        env['A182_Action'](caster)
        counts[stack] = [row[2] for row in packets[before:]]
    assert orders == [({'id':'T197','rank':1,'slot':1},'thunderbolt',500)]
    assert counts[5]==[1600] and counts[7]==[2240,2240] and counts[10]==[3200,3000]
    assert counts[12] == counts[13] == [3840,600]
    return {'originalFiveStackOrder':'T197','sevenStackPhysicalPackets':counts[7],
            'tenStackPhysicalPackets':counts[10],'twelveAndThirteen':counts[12]}


def selected_probes():
    def paid(minimum, cap, previous):
        if previous is None:
            return min(minimum,cap), minimum
        accumulated = max(min(previous+1,cap),previous,minimum)
        return min(accumulated,cap), accumulated

    amount, accumulated = paid(3,5,None)
    history = [amount]
    for _ in range(3):
        amount, accumulated = paid(3,5,accumulated)
        history.append(amount)
    assert history == [3,4,5,5] and paid(3,5,None)[0] == 3
    assert paid(18,10,None) == (10,18)  # endless caps the delivered reward
    assert paid(3,5,22) == (5,22)  # a lowered cap does not erase the streak

    max_life = 1000
    outcomes = [life < max_life*.05 for life in (49,50,90)]
    assert outcomes == [True,False,False] and math.floor(.01*max_life)==10
    burn_times = [t for born in (0,1) for t in range(born+1,born+7)]
    assert burn_times.count(1)==burn_times.count(7)==1 and burn_times.count(2)==2
    assert 100*6 == 200*3
    return {'A109':{'tier1':[3,4,5,5,3],'rank6Endless':10,'loweredCapKeepsPrevious':True},
            'A115':{'healAt49_50_90Of1000':outcomes,'paidLifeAt1000':10,
                    'twoBurnsAt0And1':burn_times}}


RULES = {
    'A030': {'period':1,'radius':500,'intelligenceFactor':2,'fixedDamage':[200,300,400,500,600,750],
             'scepterRadiusAndDamageFactor':2,'studyReplacesTimer':True},
    'A038': {'attributeGain':[1,2,3,4,5,6],'duration':[20,22,24,26,28,30],
             'independentLayers':True,'fullLifeAtAddAndExpiry':True},
    'A039': {'effectiveAttributeFactor':[.1,.2,.3,.4,.5,.6],'illusionFactor':.2,'damageType':'CHAOS/DIVINE',
             'readsAttributesAfterA038':True},
    'A048': {'perKillProgress':.5,'battleStatWriteEvery':2,'nativeIntegerWrite':1,
             'cap':[100,250,400,550,700,1000],'scepterCapBonus':400},
    'A109': {'streakSeconds':5,'firstAndMinimum':[3,6,9,12,15,18],
             'maximum':[5,10,20,35,55,80],'endlessMax':10,'B102A110RankCapFactor':2,
             'learnGoldPerWave':80},
    'A115': {'duration':6,'period':1,'damagePerRank':100,'scepterDamageType':'CHAOS/DIVINE',
             'healWhenLifeBelowFraction':.05,'lifeCostFraction':.01,'healPerTick':.2,'healTicks':8,
             'unlimitedIndependentBurns':True},
    'A116': {'period':1,'maxHelperRanks':[4,6,8,12,16,20],
             'attackSpeedByHelperRank':[.2,.3,.4,.5,.6,.8,1,1.2,1.4,1.6,1.8,2,2.2,2.4,2.6,2.8,3,3.2,3.4,3.6],
             'flatAttackPerHelperRank':50,'minimumHelperRank':1,
             'rankOneRelearnReplacesCurrentSlotTimer':True,'staleCallbackIsNoop':True},
    'A183': {'stackCaps':[5,6,7,8,10,12],'streakRefresh':8,'strengthTiesQualify':True,
             'thresholds':[5,7,10,12],'rank6IntelligencePerExtraPercent':30,
             'rank6AbyssBossMultiplier':.25},
}
DIFFERENCES = {
    'A030': ['God scepter doubles range and damage in source and actual player hint'],
    'A038': ['Source explicitly heals to full after applying or expiring each layer'],
    'A039': ['Source illusion damage factor .2 and A038 reads already applied layers'],
    'A048': ['Tooltip half point per kill meets existing integer interface as half-unit progress; source writes +1 every two kills'],
    'A109': ['Initial source payout 3L+1 versus workbook base plus subsequent continuous kills',
             'Endless 10 cap is explicit in source hint and execution'],
    'A115': ['Source 200×rank every 2 seconds versus workbook 100×rank once per second',
             'Source threshold floor(maxHP*.02)*5 versus workbook strict <5%',
             'Source cost 2% versus actual A116 hint for the same H034 attack cost of 1%'],
    'A116': ['Source inedx typo leaves old timer scheduled after relearning rank one',
             'Web repair uses the current logical tower index in the source cancellation branch'],
    'A183': ['Source Int/50 vs workbook Int/30 at 12 stacks',
             'AEev DataA1–4=10.0, stock AEev .1/.2/.3; tooltip describes only quill effects'],
}
PENDING = {
    'A183':['Explicit AEev field needs a mechanic choice','A182 native wrapper and T197 control admission remain open'],
}


if __name__ == '__main__':
    with closing(index.connect()) as db:
        old = source_probes(db)
        selected = selected_probes()
        selected['A116'] = old.pop('A116Repair')
        records = [{'id':id, 'status':'pending' if id in PENDING else 'ready', 'rules':RULES[id],
                    'sourceRefs':refs,'differences':DIFFERENCES[id],'unresolved':PENDING.get(id,[]),
                    'validation':{'original':old.get(id),'selected':selected.get(id),'originalClientTested':False}}
                   for id,refs in source_records(db)]
    report = {'scope':'passive-growth-batch-01','initialBatch':{'ready':6,'processed':8},
              'ready':sum(row['status']=='ready' for row in records),'records':records}
    encoded = json.dumps(report,ensure_ascii=False,indent=2)+'\n'
    if '--write' in sys.argv:
        OUT.write_text(encoded)
    else:
        assert OUT.read_text() == encoded
    print(json.dumps({'ready':report['ready'],'remaining':list(PENDING),'originalProbes':old,
                      'selectedProbes':selected},ensure_ascii=False))
