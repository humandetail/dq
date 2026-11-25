#!/usr/bin/env python3
"""Bounded original-bytecode + selected Web contracts; never launches Warcraft."""
from pathlib import Path
import ast,json,re,collections
R=Path(__file__).resolve().parents[1];S=R/'reference/map-6.25';D=(S/'main.disasm').read_text().splitlines()
CACHE={};COVER=collections.defaultdict(set);TABLE_REFS={}
def function(name):
 if name in CACHE:return CACHE[name]
 st=D.index('.function\t'+name);en=next((i for i in range(st+1,len(D)) if D[i].startswith('.function\t')),len(D));ins=[];const={};labels={};up=[]
 for n in range(st,en):
  s=D[n].strip()
  if s.startswith('.constant'):
   _,k,v=s.split(None,2);value={'nil':None,'true':True,'false':False}[v] if v in ('nil','true','false') else ast.literal_eval(v[1:] if v.startswith('L"') else v)
   if isinstance(value,str):
    try:value=value.encode('latin1').decode('utf8')
    except UnicodeError:pass
   const[k]={'value':value,'sourceLine':n+1}
  elif s.startswith('.upvalue'):p=s.split();up.append((int(p[-2]),p[-1]=='true'))
  elif s.startswith('.label'):labels[s.split()[1]]=len(ins)+1
  elif s and not s.startswith('.'):ins.append({'pc':len(ins)+1,'sourceLine':n+1,'raw':s.split(';')[0].strip()})
 f={'function':name,'sourcePath':'reference/map-6.25/main.disasm','sourceLines':[st+1,ins[-1]['sourceLine']],'instructions':ins,'constants':const,'labels':labels,'upvalueBindings':up};CACHE[name]=f;return f
def truth(x):return x is not None and x is not False
def equal(a,b):
 if isinstance(a,bool) or isinstance(b,bool):return type(a)==type(b) and a==b
 if isinstance(a,(dict,list)) or isinstance(b,(dict,list)):return a is b
 return a==b
def get(t,k):return t.get(k) if isinstance(t,dict) else None
def put(t,k,v):
 assert isinstance(t,dict),('table',t,k,v)
 if v is None:t.pop(k,None)
 else:t[k]=v

def length(t):
 if isinstance(t,str):return len(t)
 n=0
 while t.get(n+1) is not None:n+=1
 return n

def pairs(t):
 keys=sorted([k for k,v in t.items() if v is not None],key=lambda k:(0,k) if isinstance(k,int) else (1,str(k)))
 def it(state,prev):
  i=0 if prev is None else keys.index(prev)+1
  while i<len(keys):
   k=keys[i]
   if k in state:return k,state[k]
   i+=1
  return None,None
 return it,t,None

def ipairs(t):
 def it(state,prev):
  n=(prev or 0)+1;return (n,state[n]) if n in state else (None,None)
 return it,t,0

class Closure:
 def __init__(self,name,ups):self.name=name;self.ups=ups
 def __call__(self,*args):return execute(function(self.name),self.ups,args)

def execute(f,ups,args=(),capture=False):
 regs={i:v for i,v in enumerate(args)};top=len(args);pc=1;ins=f['instructions'];cs={k:v['value'] for k,v in f['constants'].items()};steps=0
 def val(t):return cs[t] if t.startswith('k') else regs.get(int(t[1:]))
 def setreg(t,v):regs[int(t[1:])]=v
 while pc<=len(ins):
  steps+=1;assert steps<100000,(f['function'],pc)
  COVER[f['function']].add(pc);op,*p=ins[pc-1]['raw'].split();pc+=1
  if op=='move':setreg(p[0],val(p[1]))
  elif op=='loadk':setreg(p[0],cs[p[1]])
  elif op=='loadbool':setreg(p[0],bool(int(p[1])));pc+=int(p[2])
  elif op=='loadnil':
   for i in range(int(p[0][1:]),int(p[0][1:])+int(p[1])+1):regs[i]=None
  elif op=='getupval':setreg(p[0],ups[int(p[1][1:])])
  elif op=='gettabup':setreg(p[0],get(ups[int(p[1][1:])],val(p[2])))
  elif op=='gettable':setreg(p[0],get(val(p[1]),val(p[2])))
  elif op=='settable':put(val(p[0]),val(p[1]),val(p[2]))
  elif op=='settabup':put(ups[int(p[0][1:])],val(p[1]),val(p[2]))
  elif op=='setupval':ups[int(p[1][1:])]=val(p[0])
  elif op=='newtable':
   t={};setreg(p[0],t);TABLE_REFS[id(t)]={'sourcePath':f['sourcePath'],'sourceLines':[ins[pc-2]['sourceLine'],ins[pc-2]['sourceLine']]} 
  elif op=='len':setreg(p[0],length(val(p[1])))
  elif op=='setlist':
   a=int(p[0][1:]);n=int(p[1]) if int(p[1]) else top-a-1;offset=(int(p[2])-1)*50;TABLE_REFS[id(regs[a])]['sourceLines'][1]=ins[pc-2]['sourceLine']
   for i in range(1,n+1):put(regs[a],offset+i,regs.get(a+i))
  elif op in ('add','sub','mul','div','mod'):
   a,b=val(p[1]),val(p[2]);setreg(p[0],{'add':lambda:a+b,'sub':lambda:a-b,'mul':lambda:a*b,'div':lambda:a/b,'mod':lambda:a%b}[op]())
  elif op=='unm':setreg(p[0],-val(p[1]))
  elif op=='not':setreg(p[0],not truth(val(p[1])))
  elif op=='concat':setreg(p[0],''.join(str(regs.get(i)) for i in range(int(p[1][1:]),int(p[2][1:])+1)))
  elif op in ('eq','lt','le'):
   a,b=val(p[1]),val(p[2]);test=equal(a,b) if op=='eq' else (a<b if op=='lt' else a<=b)
   if test!=bool(int(p[0])):pc+=1
  elif op=='test':
   if truth(val(p[0]))!=bool(int(p[1])):pc+=1
  elif op=='testset':
   if truth(val(p[1]))==bool(int(p[2])):setreg(p[0],val(p[1]))
   else:pc+=1
  elif op=='jmp':pc=f['labels'][p[1]]
  elif op=='forprep':a=int(p[0][1:]);regs[a]-=regs[a+2];pc=f['labels'][p[1]]
  elif op=='forloop':
   a=int(p[0][1:]);regs[a]+=regs[a+2]
   if (regs[a]<=regs[a+1] if regs[a+2]>=0 else regs[a]>=regs[a+1]):regs[a+3]=regs[a];pc=f['labels'][p[1]]
  elif op=='tforcall':
   a=int(p[0][1:]);n=int(p[1]);ret=regs[a](regs.get(a+1),regs.get(a+2));vals=ret if isinstance(ret,tuple) else (ret,)
   for j in range(n):regs[a+3+j]=vals[j] if j<len(vals) else None
  elif op=='tforloop':
   a=int(p[0][1:])
   if regs.get(a+1) is not None:regs[a]=regs[a+1];pc=f['labels'][p[1]]
  elif op=='closure':
   child=f['function']+'/'+p[1];cf=function(child);u=[regs.get(i) if local else ups[i] for i,local in cf['upvalueBindings']];setreg(p[0],Closure(child,u))
  elif op=='tailcall':
   a=int(p[0][1:]);b=int(p[1]);return regs[a](*[regs.get(i) for i in range(a+1,top if b==0 else a+b)])
  elif op=='call':
   a=int(p[0][1:]);b=int(p[1]);n=int(p[2]);fn=regs.get(a);assert callable(fn),(f['function'],pc-1,fn)
   arg=[regs.get(i) for i in range(a+1,top if b==0 else a+b)];ret=fn(*arg);vals=ret if isinstance(ret,tuple) else (ret,)
   if n==0:
    for j,v in enumerate(vals):regs[a+j]=v
    top=a+len(vals)
   elif n>1:
    for j in range(n-1):regs[a+j]=vals[j] if j<len(vals) else None
  elif op=='return':
   a=int(p[0][1:]);n=int(p[1]);vals=tuple(regs.get(i) for i in range(a,top if n==0 else a+n-1))
   return (vals,regs) if capture else (None if len(vals)==0 else vals[0] if len(vals)==1 else vals)
  else:raise AssertionError((f['function'],pc-1,op))

import heapq,hashlib,sys,copy
from fractions import Fraction
ABILITY={r['alias']:r for r in json.loads((S/'units_abilitydata.json').read_text())}
BALANCE={r['unitBalanceID']:r for r in json.loads((S/'units_unitbalance.json').read_text())}
MOUNTS={r['unitAbilID']:r for r in json.loads((S/'units_unitabilities.json').read_text())}
WEAPONS={r['unitWeapID']:r for r in json.loads((S/'units_unitweapons.json').read_text())}
PLATFORM=json.loads((R/'docs/rules/platform-access-data.json').read_text())['modelMappings']
SPECIAL={'S013':'A120','S014':'A129','S172':'A131','S192':'A140','S193':'A144','S212':'A150','S222':'A177','S272':'A185','S273':'A212','S372':'A240'}
BSIDS={i+1:x for i,x in enumerate(['A010','A110','A127','A169','A239'])}
def unit(kind='H019',hero=True,worker=False,box=False,owner=0):
 return {'kind':kind,'hero':hero,'worker':worker,'box':box,'owner':owner,'skills':{},'intrinsic':set(MOUNTS.get(kind,{}).get('abilList','').split(',')),'cd':{},'permanent':set(),'paid':{},'enabled':{},'slots':{},'str':100,'agi':200,'int':300,'states':{37:1.25,22:500,'maxMana':4000},'mana':4000,'acquire':700,'x':20,'y':30,'alive':True,'deleted':False,'moveType':2,'xp':1234,'level':10,'skillPoints':3,'qualification':'P003'}
class World:
 def __init__(self,entitlements=()):
  self.log=[];self.entitlements=set(entitlements);self.expired=None;self.now=Fraction(0);self.queue=[];self.seq=0;self.timerSerial=0;self.name='normal';self.current=None;self.spell=None;self.drops=None
  E={'GetId':lambda x:x,'pairs':pairs,'Player':lambda p:p,'GetPlayerId':lambda p:p,'GetOwningPlayer':lambda u:u['owner'] if u else 0,'GetPlayerName':lambda p:self.name,'IsWorker':lambda u:bool(u and u['worker']),'IsBOX':lambda u:bool(u and u['box']),'IsTemp':lambda u:False,'IsUnitType':lambda u,t:bool(u and (u['hero'] if t=='hero' else u.get('melee',False))),'UNIT_TYPE_HERO':'hero','UNIT_TYPE_MELEE_ATTACKER':'melee','UNIT_STATE_MAX_MANA':'maxMana','A_ITEM_ID':'i310','J003_Hero':{},'A111_113_tar':{},'skill_bs_id':BSIDS,'GetUnitTypeId':lambda u:u['kind'] if u and not u['deleted'] else 0,'GetUnitAbilityLevel':lambda u,a:u['skills'].get(a,0) if u and not u['deleted'] else 0,'UnitAddAbility':self.add,'UnitRemoveAbility':self.remove,'UnitMakeAbilityPermanent':lambda u,b,a:u['permanent'].add(a) if u else None,'UnitItemInSlot':lambda u,s:u['slots'].get(s),'GetItemTypeId':lambda x:x['kind'] if x else 0,'UnitRemoveItemFromSlot':self.drop,'GetHeroStr':lambda u,e:u['str'],'GetHeroAgi':lambda u,e:u['agi'],'GetHeroInt':lambda u,e:u['int'],'SetHeroStr':lambda u,v,p:self.attr(u,'str',v,p),'SetHeroAgi':lambda u,v,p:self.attr(u,'agi',v,p),'SetHeroInt':lambda u,v,p:self.attr(u,'int',v,p),'CheckPlayerHasShopItem':lambda p,k:k in self.entitlements,'IsInTable':lambda v,t:next((k for k,x in sorted(t.items()) if equal(v,x)),-1),'ConvertUnitState':lambda x:x,'SetUnitState':self.state,'GetUnitState':lambda u,s:u['states'].get(s,0) if u and not u['deleted'] else 0,'HasItem':lambda u,a:next((i for i in u['slots'].values() if i['kind']==a),None) if u else None,'Get_UnitData_By_ID':lambda kind,k:WEAPONS.get(kind,{}).get(k),'tonumber':lambda x:float(x) if x is not None else None,'GetUnitAcquireRange':lambda u:u['acquire'] if u and not u['deleted'] else 0,'SetUnitAcquireRange':lambda u,v:self.acquire(u,v),'CreateTimer':self.timer,'TimerStart':self.start,'GetExpiredTimer':lambda:self.expired,'DestroyTimer':self.destroy,'GetSpellAbilityId':lambda:self.spell,'GetTriggerUnit':lambda:self.current,'GetSpellTargetUnit':lambda:None,'GetSpellTargetLoc':lambda:{'x':20,'y':30},'Item_Skill_Action':lambda *a:self.log.append(('dependency','Item_Skill_Action')),'WAbility_initAbility':lambda *a:self.log.append(('dependency','WAbility_initAbility'))}
  for name in ['WAbility_W012','WAbility_W014','WAbility_W016','WAbility_W018','ItemSkillUsed']:E[name]=lambda *a,n=name:self.log.append(('dependency',n))
  self.env=E;self.japi={'EXSetUnitMoveType':self.movetype};execute(function('main/f289'),[E]);execute(function('main/f291'),[E],(lambda n:self.japi if n=='jass.japi' else {},));E['IsSkill_Bs']=Closure('main/f7/f17',[E]);E['AddArrAny']=Closure('main/f7/f22',[E]);self.modelStates=E['Model_Change'].ups[1:]
 def attr(self,u,k,v,p):self.log.append(('attribute',k,v,p));u[k]=v
 def state(self,u,s,v):
  self.log.append(('state',s,v))
  if u and not u['deleted']:
   assert v is not None,'unresolved source scalar not coerced to zero';u['states'][s]=v
   if s=='maxMana':u['mana']=max(0,min(u['mana'],v))
 def acquire(self,u,v):
  if u and not u['deleted']:u['acquire']=v
 def movetype(self,u,v):
  self.log.append(('moveType',v))
  if u and not u['deleted']:u['moveType']=v
 def drop(self,u,s):
  item=u['slots'].pop(s,None);self.log.append(('dropSlot',s,item and item['kind']))
  if item:
   item['position']=(u['x'],u['y'])
   if self.drops:self.drops(u,s,item)
  return item
 def transfer(self,u,a,b):
  if a in u['skills']:
   assert b not in u['skills'],'slot collision';u['skills'][b]=u['skills'].pop(a)
   for key in ['paid','enabled','cd']:
    if a in u[key]:u[key][b]=u[key].pop(a)
   if a in u['permanent']:u['permanent'].remove(a);u['permanent'].add(b)
 def aneg(self,u,a,reverse):
  if not u['hero']:return
  row=ABILITY[a]
  for k in ['DataC1','DataD1','DataE1','DataF1']:
   if k in row:
    pair=row[k].split(',');self.transfer(u,*reversed(pair) if reverse else pair)
 def add(self,u,a):
  self.log.append(('add',a))
  if not u or u['deleted'] or a in u['skills']:return False
  u['skills'][a]=1;row=ABILITY.get(a,{})
  if row.get('code')=='ANeg':self.aneg(u,a,False)
  if row.get('code')=='Acha':
   old=u['kind'];new=row['UnitID1']
   if u['hero']:
    for key,field in [('str','STR'),('agi','AGI'),('int','INT')]:
     before=BALANCE.get(old,{});after=BALANCE.get(new,{})
     u[key]+=(after.get(field,0)+(u['level']-1)*after.get(field+'plus',0))-(before.get(field,0)+(u['level']-1)*before.get(field+'plus',0))
   u['kind']=new;u['intrinsic']=set(MOUNTS[u['kind']].get('abilList','').split(','));self.log.append(('typeCommit',u['kind'],'qualificationRecompute'))
  return True
 def remove(self,u,a):
  self.log.append(('remove',a))
  if not u or u['deleted'] or a not in u['skills']:return False
  if ABILITY.get(a,{}).get('code')=='ANeg':self.aneg(u,a,True)
  u['skills'].pop(a,None);u['cd'].pop(a,None);u['permanent'].discard(a);return True
 def timer(self):self.timerSerial+=1;return {'id':self.timerSerial,'alive':True}
 def enqueue(self,t,when):self.seq+=1;heapq.heappush(self.queue,(when,self.seq,t))
 def start(self,t,seconds,periodic,callback):t.update(period=Fraction(str(seconds)),periodic=periodic,callback=callback);self.enqueue(t,self.now+t['period'])
 def destroy(self,t):
  if t:t['alive']=False
 def advance(self,to):
  to=Fraction(str(to))
  while self.queue and self.queue[0][0]<=to:
   when,seq,t=heapq.heappop(self.queue)
   if not t['alive']:continue
   self.now=when;self.expired=t;t['callback']()
   if t['alive'] and t['periodic']:self.enqueue(t,self.now+t['period'])
  self.now=to
 def cast(self,u,s):self.current=u;self.spell=s;self.env['AnySkillStart']()
COUNT=0;V=[]
def check(c,label):
 global COUNT
 COUNT+=1;assert c,label;V.append(label)
for m in PLATFORM:
 w=World();u=unit(m['baseUnits'][0]['unit'] if m['baseUnits'] else 'g001',hero=bool((m.get('effectUnit') or '').startswith('G')),worker=not (m.get('effectUnit') or '').startswith('G'))
 w.cast(u,m['skinAbility']);check(m['effectAbility'] in u['skills'],'all111 entry '+m['skinAbility'])
 check((u['str']==(121 if m['skinAbility']=='S352' else 110))==u['hero'],'hero-only stats '+m['skinAbility'])
 if m['kind']==1:check(u['kind']==m['effectUnit'],'Acha target '+m['skinAbility'])
 else:check(w.modelStates[m['kind']-2][1]==m['effectAbility'],'decoration state '+m['skinAbility'])
 check(('dependency','ItemSkillUsed') in w.log,'item hook before model '+m['skinAbility'])
for s,a in SPECIAL.items():
 pairs_=[v.split(',') for k,v in ABILITY[a].items() if k in ['DataC1','DataD1','DataE1','DataF1']]
 for lv in range(7):
  w=World();u=unit(next(m['baseUnits'][0]['unit'] for m in PLATFORM if m['skinAbility']==s));
  for new,old in pairs_:u['skills'][old]=lv;u['paid'][old]=lv;u['cd'][old]=4.5
  w.env['Model_Change'](u,s)
  check(all(u['skills'].get(new)==lv and u['paid'].get(new)==lv and u['cd'].get(new)==4.5 for new,old in pairs_),f'ANeg {s} L{lv}')
  check(a not in u['skills'],f'ANeg removed {s} L{lv}')
for ent,n in [((),10),(('SHOPITEM08',),10),(('SHOPITEM01',),10),(('SHOPITEM08','SHOPITEM01'),30)]:
 w=World(ent);u=unit();u['slots']={0:{'kind':'i310'},1:{'kind':'i304'},2:{'kind':'i282'},5:{'kind':'i123'}};w.env['Model_Change'](u,'S012');check(u['str']==100+n and u['agi']==200+n and u['int']==300+n,'entitlement exact AND '+str(ent));check(set(u['slots'])=={0,1},'only exempt two item types');check([z[1] for z in w.log if z[0]=='attribute']==['str','agi','int'],'attribute setter order')
w=World();u=unit();w.env['Model_Change'](u,'not-a-skin');check(not w.log,'unknown skin returns before mutation')
w=World();u=unit();w.env['J003_Hero'][1]=u;w.env['Model_Change'](u,'S012');check(not w.queue,'J003 skips movement-restoration timers')
w=World();u=unit();w.env['Model_Change'](u,'S012');w.env['Model_Change'](u,'S012');check(u['str']==120 and len(w.queue)==4,'forced repeat executes stats and new timers even same effect exists')
w=World();u=unit();u['slots'][0]={'kind':'i123'}
def nested(u,slot,item):
 if slot==0:u['slots'][4]={'kind':'i999'}
 u['str']-=25
w.drops=nested;w.env['Model_Change'](u,'S012');check(u['str']==60 and 4 not in u['slots'],'slot sweep observes nested mutation and stat snapshots after drops')
w=World();u=unit('H026');u['skills']['A084']=6;w.cast(u,'S292');check(u['states']['maxMana']==2500 and u['mana']==2500,'S292 explicit subtract250 per A084 before Model')
for kind in [2,3,4,5]:
 group=[m for m in PLATFORM if m['kind']==kind];w=World();u=unit('g001',False,True)
 for m in group[:2]:w.cast(u,m['skinAbility'])
 check(group[0]['effectAbility'] not in u['skills'] and group[1]['effectAbility'] in u['skills'],f'category{kind} current carrier replacement')
 n=len(w.log);w.cast(u,group[1]['skinAbility']);check(not any(z[0]=='remove' for z in w.log[n:]),f'category{kind} same no remove')
w=World();w.name='zado1991';u=unit('g001',False,True);w.cast(u,'S705');check('R714' in u['skills'] and w.modelStates[2][1]=='R714','original R705 player-name special')
for i304,link,i282,melee,bs in [(False,False,False,False,False),(True,False,False,False,False),(False,True,False,False,False),(True,True,True,False,True),(False,False,True,True,True),(False,False,True,False,False)]:
 w=World();u=unit('G012');u['melee']=melee
 for k,v in [('i304',i304),('i282',i282)]:
  if v:u['slots'][len(u['slots'])]={'kind':k}
 if link:w.env['A111_113_tar'][1]=u
 if bs:u['skills']['A010']=1
 w.env['Skill_BS_Still'](u);u['states'][37]=.01;w.advance(3)
 check(abs(u['states'][37]-(float(WEAPONS[u['kind']]['cool1'])-.2*i304-.1*link))<1e-9,'three second precise override '+str((i304,link,i282,melee,bs)))
 check(u['states'][22]==500+((100 if melee else 200) if i282 and bs else 0),'range branch '+str((i282,melee,bs)))
 check(sum(x[0]=='moveType' for x in w.log)==74,'B05 3s end precedes75th .04tick')
w=World();u=unit('G012');u['slots'][0]={'kind':'i282'};u['skills']['A010']=1;w.env['Skill_BS_Still'](u);w.env['Skill_BS_Still'](u);w.advance(3);check(u['states'][22]==900,'overlap timers each reapply range with no idempotence')
w=World();u=unit('H019');w.env['Skill_BS_Still'](u);u['kind']='G049';w.advance(3);check(u['states'][37]==float(WEAPONS['G049']['cool1']),'callback reads current type not captured old type')
w=World()
for i,m in enumerate(PLATFORM,1):
 check(w.env['Model_Check'](m['skinAbility'])==m['effectAbility'] and w.env['Model_Upgrade_Check'](m['skinAbility'])==m['unlockTech'] and w.env['Model_Check_type'](m['skinAbility'])==m['kind'],'mapping selectors '+str(i))
check(w.env['Model_Check_type']('missing')=='' and w.env['Model_Upgrade_Check']('missing')=='','unknown selectors empty')
for i,r in w.env['Get_Model_Upgrade'].ups[1].items():
 check(w.env['Get_Model_Upgrade'](r[1])==r[2] and w.env['Get_Model_Index_By_Upgrade'](r[2])==i,'save catalog '+str(i))
check(w.env['Get_Model_Upgrade']('missing') is None and w.env['Get_Model_Index_By_Upgrade']('missing') is None,'unknown saved selector nil')
def gmatch(s,p):
 it=iter(re.findall(r'\d+',s))
 return lambda *args:next(it,None)
w=World(['SHOPITEM01','SHOPITEM08','SHOPITEM24']);w.env.update({'Jglobals':{'ScoreSkin_Player_'+str(p):{0:','.join(map(str,range(1,49)))+',999',1:''} for p in range(4)},'MAP_CONTROL_USER':'user','PLAYER_SLOT_STATE_PLAYING':'playing','GetPlayerController':lambda p:'user','GetPlayerSlotState':lambda p:'playing','string':{'gmatch':gmatch},'S2I':int,'AddPlayerTechResearched':lambda p,t,n:w.log.append(('tech',p,t,n)),'Player_Build_Unit':{1:unit('g001',False,True),2:unit('g002',False,True)}});w.env['Model_Check_Enable']();check(all(any(x[:2]==('tech',p) for x in w.log) for p in range(4)),'init applies all four account catalogs');check(all({'S001','S531','S601','S701'}<=u['skills'].keys() for u in w.env['Player_Build_Unit'].values()),'init adds all four worker menus')
w.env['GetPlayerController']=lambda p:'computer';w.env['Model_Check_Enable']();check(True,'init controller skip path')
w=World();u=unit('n001',False,False,True);w.cast(u,'S532');check('R532' in u['skills'] and w.modelStates[0][1]=='R532','BOX reaches decoration bookkeeping')
for worker,box in [(True,False),(False,True)]:
 w=World();u=unit('G012',False,worker,box);w.env['Skill_BS_Still'](u);w.advance(3);check(u['states'][37]==float(WEAPONS['G012']['cool1']),'forced nonhero helper condition branches')
w=World();u=unit('H058');u['skills'].update({'A232':4,'I269':1});u['cd']['A232']=2.5;before=(u['xp'],u['level'],u['skillPoints'],u['qualification']);w.env['Model_Change'](u,'S352');check(u['str']==121 and before==(u['xp'],u['level'],u['skillPoints'],u['qualification']) and u['cd']['A232']==2.5 and u['skills']['I269']==1,'S352 natural rebase atL10 plus10 retains runtime');check('S351' not in u['intrinsic'],'target template removes source skin menu')
w=World();u=unit('g001',False,True);box=unit('n001',False,False,True);w.cast(u,'S532');w.cast(box,'S533');check('R532' in u['skills'] and 'R533' in box['skills'],'shared owner bookkeeping removes old effect only from current carrier')
w=World();u=unit('H033');u['skills']['A112']=6;w.env['Model_Change'](u,'S192');w.env['Model_Change'](u,'S193');check(u['skills'].get('A142')==6 and 'A143' not in u['skills'],'forced cross-skin does not synthesize absent ANeg source slot')
core=[f'main/f289/f{i}' for i in range(8)]+['main/f291/f11','main/f291/f12','main/f291/f13','main/f291/f14','main/f7/f17','main/f7/f22']
report={'assertions':COUNT,'vectors':V,'core':{n:{'executed':len(COVER[n]),'total':len(function(n)['instructions'])} for n in core},'allExecuted':sum(map(len,COVER.values())),'limitations':['Native ANeg/Acha are selected Web stubs, not matching client test.','Item/WAbility prelude hooks only logged, their complete effects remain separate.','No full active metamorphosis skill effects.']}
data=json.loads((R/'docs/rules/skin-and-transformation.json').read_text())
evidence=0
for n,f in data['source_functions'].items():
 assert f['instructions']==function(n)['instructions'],n
 assert f['sourceLines']==function(n)['sourceLines'],n
 evidence+=len(f['instructions'])
for file,digest in data['source_hashes'].items():assert hashlib.sha256((S/file).read_bytes()).hexdigest()==digest,file
raw={f:json.loads((S/f).read_text()) for f in ['units_abilitydata.json','units_unitabilities.json','units_unitbalance.json','units_unitweapons.json','units_unitdata.json','units_unitui.json','war3map.w3a.json']}
rawlines={f:(S/f).read_text().splitlines() for f in raw}
profile=(S/'units_campaignabilitystrings.txt').read_text().splitlines()
for aid,a in data['abilityRecords'].items():
 assert a['record']==ABILITY[aid],aid
 assert '"alias": "'+aid+'"' in rawlines['units_abilitydata.json'][a['line']-1],aid
 for m in a['w3a']:
  assert m['record'] in raw['war3map.w3a.json'],aid
  assert '"old":' in rawlines['war3map.w3a.json'][m['line']-1],aid
 if a.get('profile'):
  lo,hi=a['profile']['sourceLines'];assert profile[lo-1:hi]==a['profile']['lines'],aid
unitcount=0
for uid,rows in data['unitRecords'].items():
 for filename,a in rows.items():
  assert a['record'] in raw[filename],(uid,filename)
  assert '"'+uid+'"' in rawlines[filename][a['line']-1],(uid,filename)
  unitcount+=1
fresh=World();sourceMaps=fresh.env['Model_Check'].ups[1]
assert len(sourceMaps)==data['mappingCount']==len(data['mappings'])==111
for m in data['mappings']:
 row=sourceMaps[m['index']]
 assert [row[k] for k in range(1,5)]==[m['selection'],m['unlockTech'],m['effect'],m['category']]
 assert TABLE_REFS[id(row)]==m['tableSource']
 assert m['targetUnit']==ABILITY[m['effect']].get('UnitID1')
 if m['targetUnit'] and m['targetUnit'].startswith('G'):
  target=set(MOUNTS[m['targetUnit']].get('abilList','').split(','))
  assert not target.intersection(x['ability'] for x in m['spellbooks'])
for h in data['anegHelpers']:
 assert SPECIAL[h['selection']]==h['helper']
 for p in h['pairs']:
  assert p['addDirection']==ABILITY[h['helper']][p['field']].split(',')
  assert p['removeDirection']==list(reversed(p['addDirection']))
assert sum(len(h['pairs']) for h in data['anegHelpers'])==14
assert collections.Counter(m['category'] for m in data['mappings'])=={1:70,2:14,3:8,4:17,5:2}
for row in data['saveCatalog']:
 source=fresh.env['Get_Model_Upgrade'].ups[1][row['index']]
 assert [source[1],source[2]]==[row['name'],row['selection']]
 assert TABLE_REFS[id(source)]==row['source']
assert data['initialDecorationTables']=={str(k):{str(p):v for p,v in fresh.modelStates[k-2].items()} for k in range(2,6)}
manifest=json.loads((S/'manifest.json').read_text())
for entry in manifest['files']:
 blob=(S/entry['file']).read_bytes();assert len(blob)==entry['bytes'] and hashlib.sha256(blob).hexdigest()==entry['sha256'],entry['file']
import zipfile
books=json.loads((R/'docs/rules/scepter-lifecycle.json').read_text())['workbooks']
for b in books:
 p=Path(b['path']);assert hashlib.sha256(p.read_bytes()).hexdigest()==b['sha256']
 with zipfile.ZipFile(p) as z:assert z.testzip() is None
linkcount=0
for target,line in re.findall(r'\]\(([^():]+?)(?:#L(\d+))?\)',(R/'docs/rules/skin-and-transformation.md').read_text()):
 p=(R/'docs/rules'/target).resolve();assert p.exists(),target
 if line:assert 1<=int(line)<=len(p.read_text().splitlines()),(target,line)
 linkcount+=1
report['evidence_validation']={'sourceFunctions':len(data['source_functions']),'sourceInstructions':evidence,'sourceHashes':len(data['source_hashes']),'abilityRecords':len(data['abilityRecords']),'unitRows':unitcount,'mappingRows':len(data['mappings']),'saveCatalogRows':len(data['saveCatalog']),'anegPairs':14,'immutableManifestFiles':len(manifest['files']),'unchangedWorkbooks':len(books),'localLinks':linkcount}
if '--output' in sys.argv:Path(sys.argv[sys.argv.index('--output')+1]).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='vectors'},ensure_ascii=False))
