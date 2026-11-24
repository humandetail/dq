#!/usr/bin/env python3
"""Run the complete A192 bytecode against recorded native-interface stubs."""
import importlib.util
import itertools
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('night_audit', ROOT/'tools/audit-night-state.py')
night = importlib.util.module_from_spec(spec)
spec.loader.exec_module(night)
f = night.parse('main/f137/f0')

class Probe:
    def __init__(self, rank, dark, kind, accepted=True, kill=False, delay=None):
        self.rank,self.dark,self.kind,self.accepted,self.kill=rank,dark,kind,accepted,kill
        self.life={'target':100,'edge':100,'outside':100,'friend':100,'dead':0,'immune':100}
        self.positions={'target':(10,20),'edge':(360,20),'outside':(360.01,20),'friend':(20,20),'dead':(30,20),'immune':(40,20)}
        self.owners={k:11 for k in self.life};self.owners['friend']=0
        self.events=[];self.dummies={};self.group=[]
        self.env={'GetUnitUserData':lambda u:9,'GetUnitAbilityLevel':lambda u,a:rank,'GetId':lambda a:a,
          'GetUnitState':lambda u,k:10000 if k=='max' else self.life.get(u,0),
          'UNIT_STATE_MAX_LIFE':'max','UNIT_STATE_LIFE':'life','GetUnitLoc':lambda u:self.positions[u],
          'GetUnitX':lambda u:self.positions[u][0],'GetUnitY':lambda u:self.positions[u][1],
          'IsYeMoNightBuff':lambda u:dark,'GetUnitTypeId':lambda u:kind,'GetOwningPlayer':lambda u:0,
          'SetPhyDamagePoint':self.area,'SetPhyDamage':self.single,'CreateEffAtLoc':self.effect,'CreateEffByUnit':self.effect,
          'CreateGroup':lambda:[],'GroupEnumUnitsInRange':self.enum,'_loop_':lambda:(lambda t,i:1 if i is None else i+1,None,None),
          'FirstOfGroup':lambda g:g[0] if g else None,'GroupRemoveUnit':lambda g,u:g.remove(u),
          'IsUnitOwnedByPlayer':lambda u,p:self.owners[u]==p,'Player':lambda p:p,
          'CreateTempAndSetAbilityLv':self.create,'SetUnitUserData':self.userdata,'IssueTargetOrder':self.order,
          'GroupClear':lambda g:self.events.append(['clear',len(g)]),'DestroyGroup':lambda g:self.events.append(['destroy-group']),
          'delaytime':delay,'null':None}
    def effect(self,*args):self.events.append(['effect',*args])
    def area(self,u,d,r,x,y,amount):
        self.events.append(['area',u,d,r,x,y,amount])
        if self.kill:self.life['target']=0
    def single(self,u,t,amount):
        self.events.append(['single',u,t,amount])
        if self.kill:self.life[t]=0
    def enum(self,g,x,y,r,filter):
        g.extend(k for k,(ux,uy) in self.positions.items() if (ux-x)**2+(uy-y)**2<=r*r)
        self.events.append(['enum',list(g)])
    def create(self,owner,loc,facing,ability,level,duration):
        key='dummy'+str(len(self.dummies));self.dummies[key]={'life':duration,'data':None}
        self.events.append(['create',key,owner,loc,facing,ability,level,duration]);return key
    def userdata(self,u,data):self.dummies[u]['data']=data;self.events.append(['userdata',u,data])
    def order(self,u,order,target):
        assert self.dummies[u]['data']==9
        self.events.append(['order',u,order,target,self.accepted]);return self.accepted
    def run(self):night.run(f,self.env,['caster','target']);return self.events

cases=[]
for rank,dark,kind,accepted,kill in itertools.product(range(7),[False,True],['H050','G071'],[False,True],[False,True]):
    p=Probe(rank,dark,kind,accepted,kill);events=p.run();amount=(1000 if rank<2 else 200+800*rank)+1300
    damage=events[0];assert damage[0]==('area' if dark else 'single') and damage[-1]==amount
    ordered=[e[3] for e in events if e[0]=='order']
    expected=([] if kill else ['target'])+['edge','immune'] if dark else ['target']
    assert ordered==expected
    assert all(x['life']==(2 if dark else 1) and x['data']==9 for x in p.dummies.values())
    if dark:assert damage[2] is None and damage[3:6]==[350,10,20]
    cases.append({'rank':rank,'night':dark,'type':kind,'accepted':accepted,'targetKilledDuringDamage':kill,'damage':amount,'slowOrders':ordered})
for delay in [0,.5]:
    p=Probe(6,True,'H050',delay=delay);p.run();assert p.events[0][2]==delay
    cases.append({'sourceDelayPassthrough':delay})

abilities={a['alias']:a for a in json.loads((night.REF/'units_abilitydata.json').read_text())}
overrides=json.loads((night.REF/'war3map.w3a.json').read_text())
book=json.loads((ROOT/'docs/rules/night-workbook-check.json').read_text())
data={'schemaVersion':1,'baselineId':'void-effect-v1','scope':'complete A192 action and direct slow adapter; other native sources/statuses remain external',
 'sourceFunction':f,'workbookEvidence':'night-workbook-check.json',
 'objects':{a:{'slk':abilities[a],'overrides':[o for o in overrides if o['old']==a or o['new']==a]} for a in ['A192','T213']},
 'sourceEntry':{'function':'main/f291/f14','pc':[1207,1217],'lines':[171322,171332]},
 'autocast':next(x for x in json.loads((ROOT/'docs/rules/autocast-data.json').read_text())['branches'] if x['abilityIds']==['A192']),
 'selected':{'damage':[1000,1800,2600,3400,4200,5000],'maxLifeRatio':.13,'mana':[20,35,50,65,80,100],'cooldown':8,'castPoint':.3,'range':1000,'nightRadius':350,
  'sourceDamageType':{'attack':False,'ranged':False,'attackType':'HERO','damageType':'NORMAL','weaponType':'WHOKNOWS'},
  'delay':'source reads _ENV.delaytime and forwards unchanged; no static assignment found. Q24 missing real delay argument is normalized to0 only at this native call boundary; finite nonnegative supplied value is preserved. Not a claim that original binding accepts nil.',
  'ordering':'amount and target location captured before night predicate; nighttime area fully settles at delay0 before visual and independent owner11/life>0 slow enumeration; daytime direct damage then visual then unconditional slow order; later invalid native order may reject',
  'slow':{'ability':'T213','level':1,'cost':10,'castPoint':0,'range':500,'duration':3,'moveReduction':.5,'attackReduction':0,'buff':'B168','nativeChoice':'Q24 ordinary targeted slow on visible enemy air/ground, no building/Aloc/invulnerable/magicimmune; zero cast point queued via B05; no missile; N535 screen consumes entire slow, damage already happened; latest refresh replaces same B168, no stacking; ordinary negative dispel/death/removal/magic immunity clear; unit pause does not stop buff time',
    'dummy':'source q001 at original target location, slot9 in probes; actual userdata copied before order; lifespan1sec day2sec night; cost10 from q001 initial1000, no bonus attack-speed reduction inferred from template tooltip'},
  'cast':'Q24 existing alive enabled rank1..6, self has sufficient mana/cooldown0/no spell lock; target exists alive visible enemy unit, not Aloc/invulnerable; ground/air/building/magicimmune accepted for physical core; range1000 rechecked at .3sec commit; cancel before commit free; pay/CD then once AnySkillStart, no refunds for failed childslow; ANcl has no second native payload'},
 'validation':{'completeInstructions':len(f['instructions']),'sourceStubCases':len(cases),'cases':cases,'clientRun':False,'webGameRun':False},
 'remaining':['generic skin/illusion/removed-handle lifecycle','all shared damage pipeline callees','native same-Buff emitters outside T213 scope']}
(ROOT/'docs/rules/skill-void.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'A192Instructions':len(f['instructions']),'sourceStubCases':len(cases)}))
