#!/usr/bin/env python3
"""Static source and bounded native-stub audit of A193/A194 and the world clock."""
import ast
import hashlib
import itertools
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REF = ROOT / 'reference/map-6.25'
LINES = (REF/'main.disasm').read_text().splitlines()
def parse(name):
    start = LINES.index('.function\t'+name)
    end = next((i for i in range(start+1,len(LINES)) if LINES[i].startswith('.function')),len(LINES))
    f = {'function':name,'lines':[start+1,end],'constants':{},'labels':{},'instructions':[]}
    for i in range(start,end):
        s=LINES[i].strip()
        if s.startswith('.constant'):
            _,key,raw=s.split(None,2)
            if raw.startswith('L"'):raw=raw[1:]
            f['constants'][key]={'nil':None,'true':True,'false':False}[raw] if raw in ['nil','true','false'] else ast.literal_eval(raw)
        elif s.startswith('.label'):f['labels'][s.split()[1]]=len(f['instructions'])+1
        elif s and not s.startswith('.'):
            a=s.split(';')[0].split();f['instructions'].append({'pc':len(f['instructions'])+1,'line':i+1,'op':a[0],'args':a[1:]})
    return f

NAMES=['main/f138/f0','main/f138/f1','main/f139/f0','main/f139/f1','main/f139/f2','main/f291/f5','main/f291/f6','main/f291/f42']
F={n:parse(n) for n in NAMES}
def run(f, env, args=(), extra=None, sync=False):
    ups={'u0':env};ups.update(extra or {})
    reg={f'r{i}':v for i,v in enumerate(args)};top=len(args);pc=1;steps=0
    def val(a):return f['constants'][a] if a.startswith('k') else reg.get(a)
    def equal(a,b):return False if isinstance(a,bool)!=isinstance(b,bool) else a==b
    def truth(a):return a is not None and a is not False
    while pc<=len(f['instructions']):
        steps+=1;assert steps<5000
        x=f['instructions'][pc-1];op,a=x['op'],x['args'];n=pc+1
        if op=='gettabup':reg[a[0]]=ups[a[1]].get(val(a[2]))
        elif op=='settabup':ups[a[0]][val(a[1])]=val(a[2])
        elif op=='getupval':reg[a[0]]=ups[a[1]]
        elif op=='gettable':reg[a[0]]=val(a[1]).get(val(a[2]))
        elif op=='settable':val(a[0])[val(a[1])]=val(a[2])
        elif op in ['loadk','move']:reg[a[0]]=val(a[1])
        elif op=='loadnil':
            for i in range(int(a[1])+1):reg['r'+str(int(a[0][1:])+i)]=None
        elif op=='loadbool':reg[a[0]]=a[1]=='1';n+=a[2]=='1'
        elif op=='add':reg[a[0]]=val(a[1])+val(a[2])
        elif op=='mul':reg[a[0]]=val(a[1])*val(a[2])
        elif op=='call':
            base=int(a[0][1:]);b,c=int(a[1]),int(a[2]);result=val(a[0])(*[reg.get('r'+str(i)) for i in range(base+1,base+b if b else top)])
            result=list(result) if isinstance(result,tuple) else [result]
            if c==0:
                for j,v in enumerate(result):reg['r'+str(base+j)]=v
                top=base+len(result)
            elif c>1:
                for j in range(c-1):reg['r'+str(base+j)]=result[j] if j<len(result) else None
        elif op in ['eq','lt','le']:
            left,right=val(a[1]),val(a[2]);result=equal(left,right) if op=='eq' else left<right if op=='lt' else left<=right
            if result!=(a[0]=='1'):n+=1
        elif op=='test':
            if truth(val(a[0]))!=(a[1]=='1'):n+=1
        elif op=='jmp':n=f['labels'][a[-1]]
        elif op=='tforcall':
            base=int(a[0][1:]);out=val(a[0])(reg.get('r'+str(base+1)),reg.get('r'+str(base+2)))
            out=out if isinstance(out,tuple) else (out,)
            for j in range(int(a[1])):reg['r'+str(base+3+j)]=out[j] if j<len(out) else None
        elif op=='tforloop':
            v=reg.get('r'+str(int(a[0][1:])+1))
            if v is not None:reg[a[0]]=v;n=f['labels'][a[1]]
        elif op=='return':return tuple(reg.get('r'+str(int(a[0][1:])+j)) for j in range(int(a[1])-1))
        else:raise AssertionError((f['function'],pc,op))
        if sync and f['function']=='main/f138/f1' and pc==5:env['syncNatural'](reg['r0'])
        pc=n

class State:
    def __init__(self,kind='H050',rank=1,active_rank=1,night=False):
        self.units={'u':{'A193':rank,'A194':active_rank}};self.types={'u':kind};self.life={'u':100};self.registered={};self.towers={1:'u'};self.timers={};self.slot={};self.counter=0;self.expired=None;self.events=[];self.night=night
        def pairs(table):
            def nxt(t,key):
                keys=sorted(k for k,v in t.items() if v is not None)
                found=next((k for k in keys if key is None or k>key),None)
                return (found,t.get(found))
            return (nxt,table,None)
        self.env={'GetUnitAbilityLevel':lambda u,a:self.units.get(u,{}).get(a,0),'GetId':lambda a:a,
            'UnitAddAbility':self.add,'UnitRemoveAbility':self.remove,'SetUnitAbilityLevel':self.level,'UnitMakeAbilityPermanent':lambda *a:self.events.append(['permanent',*a]),
            'GetUnitUserData':lambda u:1,'A193_Unit':self.registered,'GetUnitTypeId':lambda u:self.types.get(u,0),
            'GetUnitState':lambda u,k:self.life.get(u,0),'UNIT_STATE_LIFE':'life','Tower_ALL':self.towers,
            'IsInTable':lambda v,t:next((k for k,x in t.items() if x==v and x is not None),-1),
            'CreateTimer':self.create,'TimerStart':self.start,'DestroyTimer':self.destroy,'GetExpiredTimer':lambda:self.expired,'pairs':pairs,'syncNatural':self.sync}
        self.env['IsYeMoNightBuff']=lambda u:run(F['main/f139/f2'],self.env,[u])[0]
        self.env['Change_Skill_Lv']=lambda u:run(F['main/f138/f0'],self.env,[u])
    def add(self,u,a):
        if u in self.units:self.units[u].setdefault(a,1)
        self.events.append(['add',u,a])
    def remove(self,u,a):
        if u in self.units:self.units[u].pop(a,None)
        self.events.append(['remove',u,a])
    def level(self,u,a,l):
        if u in self.units:self.units[u][a]=l
        self.events.append(['level',u,a,l])
    def create(self):self.counter+=1;return 't'+str(self.counter)
    def start(self,t,d,repeat,cb):self.timers[t]=(d,cb);assert repeat is False
    def destroy(self,t):self.timers.pop(t,None)
    def sync(self,u):
        # Q43 touches natural markers only; personal T215/T256/T258 survive.
        for a in ['T214','T255','T257']:self.remove(u,a)
        if self.night:
            for a in (['T255','T257'] if self.types.get(u)=='G071' else ['T214']):
                self.add(u,a)
                self.env['UnitMakeAbilityPermanent'](u,True,a)
    def learn(self,web=False):run(F['main/f138/f1'],self.env,['u'],sync=web)
    def cast(self):run(F['main/f139/f1'],self.env,['u'],{'u1':self.slot,'u2':self.expire})
    def expire(self):run(F['main/f139/f0'],self.env,extra={'u1':self.slot})
    def clock(self,night):self.night=night;run(F['main/f291/f5' if night else 'main/f291/f6'],self.env)

cases=[]
for mask in itertools.product([0,1],repeat=4):
    s=State();s.units['u'].update(dict(zip(['T214','T215','T255','T256'],mask)))
    assert s.env['IsYeMoNightBuff']('u') is any(mask)
    assert s.env['IsYeMoNightBuff'](None) is False
    cases.append({'kind':'night predicate','mask':mask,'expected':any(mask)})
for kind,rank,night,web in itertools.product(['H050','G071'],range(1,7),[False,True],[False,True]):
    s=State(kind,rank,night=night);s.learn(web)
    expected=rank+6 if web and night else rank
    assert s.units['u']['T208']==s.units['u']['T209']==expected
    assert s.registered=={1:'u'}
    cases.append({'kind':'learning','unitType':kind,'rank':rank,'worldNight':night,'webQ43':web,'selectedRank':expected})
for kind,rank in itertools.product(['H050','G071'],range(1,7)):
    s=State(kind,rank,rank);s.learn(True);s.cast();timer=s.slot[1];assert s.timers[timer][0]==14+rank
    assert s.units['u']['T208']==rank+6
    s.clock(True);s.expired=timer;s.expire();assert s.units['u']['T208']==rank+6
    s.clock(False);assert s.units['u']['T208']==rank
    s.cast();old=s.slot[1];s.cast();assert old not in s.timers and len(s.timers)==1
    cases.append({'kind':'personal overlaps natural then refresh','unitType':kind,'rank':rank,'duration':14+rank})
for kind in ['H050','G071']:
    s=State(kind);s.learn();s.clock(True);s.life['u']=0;s.clock(False)
    assert s.env['IsYeMoNightBuff']('u') is True # source dawn skip on death, not silently fixed
    cases.append({'kind':'dead dawn retains markers','unitType':kind})
    s=State(kind);s.learn();s.units['u'].pop('T209');s.env['Change_Skill_Lv']('u');assert 'T209' not in s.units['u']
    cases.append({'kind':'T208 equal does not repair missing T209','unitType':kind})
    s=State(kind,rank=0,active_rank=0);s.cast();assert s.timers[s.slot[1]][0]==15 and s.env['IsYeMoNightBuff']('u') is True
    cases.append({'kind':'direct action at rank0','unitType':kind,'duration':15})

ability={x['alias']:x for x in json.loads((REF/'units_abilitydata.json').read_text())};overrides=json.loads((REF/'war3map.w3a.json').read_text())
ids=['A193','A194','T208','T209','T214','T215','T255','T256','T257','T258']
objects={k:{'source':ability[k],'overrides':[x for x in overrides if x['old']==k or x['new']==k]} for k in ids}
tables={}
for id,key in [('T208','Iatt'),('T209','Isx1')]:
    merged={lv:ability[id].get('DataA'+str(lv)) for lv in range(1,13)}
    for obj in objects[id]['overrides']:
        for m in obj['mods']:
            if m['key']==key:merged[m['level']]=m['value']
    tables[id]=[merged[l] for l in range(1,13)]
assert tables['T208']==[50,75,100,125,150,175,100,150,200,250,300,350]
expected=[.35,.4,.45,.5,.55,.6,.7,.8,.9,1,1.1,1.2]
assert all(abs(a-b)<1e-6 for a,b in zip(tables['T209'],expected))
terrain=(REF/'war3map.w3e').read_bytes();off=13
for _ in range(2):num=struct.unpack_from('<I',terrain,off)[0];off+=4+4*num
w,h,ox,oy=struct.unpack_from('<IIff',terrain,off);off+=16
blight=sum(bool(terrain[off+7*i+4]&0x20) for i in range(w*h));assert (w,h,off,blight)==(97,97,49,0)
clock_vectors=[(0,6,False),(119999999,17.9999999,False),(120000000,18,True),(180000000,0,True),(240000000,6,False),(360000000,18,True)]
for us,hour,night in clock_vectors:
    got=(6+us/10000000)%24
    assert abs(got-hour)<1e-8 and (got<6 or got>=18)==night
data={'schemaVersion':1,'baselineIds':['world-clock-and-base-regen-v1','night-hunter-v1'],
 'scope':'A193/A194 modules and explicit clock/base-regeneration interfaces, not A192 or general transformation/resurrection',
 'sourceFiles':[{'path':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [REF/'main.disasm',REF/'units_abilitydata.json',REF/'war3map.w3a.json',REF/'war3map.w3e',REF/'war3mapMisc.txt']],
 'sourceFunctions':F,'sourceTables':tables,'objects':objects,
 'sourceSlices':{'initClock':{'function':'main/f306/f64','lines':[202876,202882],'initialHour':6,'scale':2},'learning':{'function':'main/f291/f10','pc':[200,208],'lines':[169251,169259]},'spellEffect':{'function':'main/f291/f14','pc':[1218,1227],'lines':[171334,171343]},'damage':{'function':'main/f291/f1','pc':[1273,1293],'lines':[163834,163855],'worldMode1':2.5,'otherModes':1.8,'guard':'IsYeMoNightBuff(attributed O); does not check A193 rank or attack flag here; preserve public prior exits'},'autocast':{'priority':98,'function':'main/f291/f27','pc':[3033,3050],'readyThen':'IsYeMoNightBuff(attacker)==false','order':'channel'}},
 'primarySources':[
  {'url':'https://classic.battle.net/war3/basics/daynight.shtml','basis':'official qualitative day/night regeneration; does not prove customized runtime details'},
  {'url':'https://classic.battle.net/war3/basics/heroes.shtml','basis':'official attribute regeneration and template base regeneration distinction'},
  {'url':'https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/MiscData.txt','basis':'DayLength480,Dawn6,Dusk18,DayHours24; explicit Q24 fallback, not map-embedded field'},
  {'url':'https://github.com/flowtsohg/mdx-m3-viewer/blob/master/src/parsers/w3x/w3e/corner.ts','basis':'7-byte W3E corner, byte4 blight mask0x20; does not describe runtime blight producers'}],
 'workbookEvidence':'night-workbook-check.json',
 'decisions':{'Q43':'After A193 learning registration, synchronize only the learner natural markers to current world day/night before Change_Skill_Lv; retain independent personal-night markers/timer','A194Mana':{'source':[40,70,100,130,160,200],'web':[20,40,60,80,100,120],'basis':'both workbook I312/I342, global numeric priority'},'T209':'source float32 values preserved; selected exact decimal35..60 and doubled night70..120 percent'},
 'web':{'worldClock':{'baseDaySeconds':480,'hoursPerCycle':24,'sourceScale':2,'effectiveCycleSeconds':240,'initialHour':6,'dayInterval':'[6,18)','nightInterval':'[18,24) union [0,6)','schedule':'first dusk120s, first dawn240s; B05 exact threshold events; registration at initial6 does not synthesize dawn callback; pause/speed/background use simulation time'},
 'initialBlight':{'cornerCount':w*h,'flagMask':32,'setCount':0,'source':'W3E byte4 of each7-byte corner; no custom script blight setter found; runtime native blight-producing effects require own adapter'},
 'baseRegen':{'life':'for alive existing visible units: gated(template regenHP,regenType)+0.1*effective STR for native HERO; attribute contribution independent of template gate, Q24 chosen explicitly','mana':'template regenMana+0.03*effective INT for native HERO; regenType gates base LIFE only','gates':'always=true; day=[6,18); night=complement; blight=current terrain predicate; none=false; unknown tokens fail import, not automatically always','otherContributions':'this baseline defines base inputs only; missing template values, negative base regeneration/death handling, percentage/fixed/negative-regeneration abilities require own audited adapters; A018/I230 fixed additions remain after general multipliers per mana-auras-v1','integration':'positive base regeneration is piecewise continuous, settle old rate before same-time changes, no integer-per-second rounding/overflow reserve; no regen while dead/removed/hidden; unit pause does not by itself stop passive regen; global pause stops time'},
 'A193':'A193 itself adds no extra native aura; T208 active rank gives one flat weapon bonus, T209 active rank one attack-rate contribution; helper only compares T208, equal does not repair T209; rank<=0 returns without cleanup',
 'markers':'T214/T255/T257 natural, T215/T256/T258 personal; no native armor or third-party aura targets; IsYeMoNightBuff checks T214/T215/T255/T256 only; marker abilities are not ordinary dispellable Buffs',
 'A194Cast':{'castPoint':.3,'cooldown':35,'mana':[20,40,60,80,100,120],'duration':[15,16,17,18,19,20],'target':'self no target; manual may refresh even already in night; auto keeps original additional false-night gate','nativeSelection':'alive existing enabled rank1..6, no spell locks, enough mana/cooldown0; commit at .3 after recheck, pay/startCD then original AnySkillStart once; before-commit cancellation costs nothing, after-commit costs/cooldown never implicitly refunded; actual core refresh creates one new timer and destroys previous; Dur.1 is not a15second channel requirement'},
 'lifecycle':'Keep raw marker sets and slot timer until source cleanup; dawn/dusk skips life<=0 so dead unit markers can remain stale; Q43 fixes learning only. Save registered table/slot identity/current abilities/timers/clock phase; no synthetic learn or dawn on restore. Deleted handles read0/writesnoop and slot tombstones prevent reuse. No implicit illusion snapshot for this family'},
 'verification':{'instructions':sum(len(f['instructions']) for f in F.values()),'sourceCases':len(cases),'cases':cases,'clockVectors':clock_vectors,'clientRun':False,'webGameRun':False},
 'remaining':['A192 complete targeting/control/damage module','full skin/illusion/resurrection transfers beyond scoped marker behavior','all non-base regeneration providers and generic damage/death interactions']}
for entry in data['sourceSlices'].values():
    if 'pc' not in entry:continue
    actual=parse(entry['function'])['instructions'][entry['pc'][0]-1:entry['pc'][1]]
    assert len(actual)==entry['pc'][1]-entry['pc'][0]+1
    if 'lines' in entry:assert [actual[0]['line'],actual[-1]['line']]==entry['lines']
(ROOT/'docs/rules/night-state-and-regeneration.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'instructions':data['verification']['instructions'],'sourceCases':len(cases),'clockVectors':len(clock_vectors),'blightedCorners':blight}))
