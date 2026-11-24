#!/usr/bin/env python3
"""Executes bounded original bytecode against explicit Web native doubles; not client proof."""
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

def execute(f,ups,args=(),capture=False,start_pc=1,stop_pc=None):
 regs={i:v for i,v in enumerate(args)};top=len(args);pc=start_pc;ins=f['instructions'];cs={k:v['value'] for k,v in f['constants'].items()};steps=0
 def val(t):return cs[t] if t.startswith('k') else regs.get(int(t[1:]))
 def setreg(t,v):regs[int(t[1:])]=v
 while pc<=len(ins) and (stop_pc is None or pc<=stop_pc):
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

import math,hashlib,sys
PAIRS={1:{1:'A105',2:'A106'},2:{1:'A153',2:'A154'}}
SWAPS={'A220':('A218','A217'),'A219':('A217','A218'),'A096':('A095','A094'),'A114':('A094','A095')}
def unit(kind='H031',owner=0,**skills):return {'kind':kind,'owner':owner,'skills':skills,'permanent':set(),'enabled':{},'paid':{},'nativeHero':True,'cd':{},'items':set(),'life':100,'state':{37:1},'str':100,'agi':100,'int':100,'x':0,'y':0}
class BaseWorld:
 def __init__(self):
  self.log=[];self.expired=None;self.manipulated=None;self.serial=0
  self.env={'GetId':lambda a:a,'pairs':pairs,'math':{'floor':math.floor},'Tower_ALL':{},'Help_Arr':{},'Game_Mode':0,'A_ITEM_ID':'i310','UNIT_STATE_LIFE':'life','ConvertUnitState':lambda s:s,'GetConvertedPlayerId':lambda p:p+1,'GetOwningPlayer':lambda u:u.get('owner',0) if u else 0,'GetUnitTypeId':lambda u:u.get('kind',0) if u else 0,'GetUnitAbilityLevel':lambda u,a:u.get('skills',{}).get(a,0) if u else 0,'UnitAddAbility':self.add,'UnitRemoveAbility':self.remove,'UnitMakeAbilityPermanent':lambda u,v,a:u['permanent'].add(a) if u else None,'SetUnitAbilityLevel':lambda u,a,l:u['skills'].__setitem__(a,l) if u and a in u['skills'] else None,'HasItem':lambda u,a:a if u and a in u['items'] and a!=self.manipulated else None,'IsInTable':lambda v,t:next((k for k,x in sorted(t.items()) if equal(v,x)),-1),'GetUnitState':lambda u,s:(u.get(s,0) if s=='life' else u['state'].get(s,0)) if u else 0,'SetUnitState':self.state,'GetHeroStr':lambda u,e:self.attribute(u,'str',e),'GetHeroAgi':lambda u,e:self.attribute(u,'agi',e),'GetHeroInt':lambda u,e:self.attribute(u,'int',e),'SetHeroInt':self.setint,'GetUnitX':lambda u:u.get('x',0) if u else 0,'GetUnitY':lambda u:u.get('y',0) if u else 0,'GetDistance':lambda a,b:math.hypot(a['x']-b['x'],a['y']-b['y']),'CreateTimer':self.timer,'GetExpiredTimer':lambda:self.expired,'TimerStart':self.start,'DestroyTimer':lambda t:self.log.append(('destroyTimer',t and t['id'])),'AddLightningEx':lambda *a:{'visual':a[0]},'MoveLightningEx':lambda *a:None,'DestroyLightning':lambda *a:None,'DisplayTextToPlayer':lambda *a:self.log.append(('message',)),'DisplayTimedTextToPlayer':lambda *a:self.log.append(('message',)),'Mall_ActivityTask_Update':lambda *a:self.log.append(('activity',*a)),'IssueImmediateOrder':lambda *a:self.log.append(('order',a[1]))}
  self.japi={'EXGetUnitAbility':lambda u,a:[u,a],'EXGetAbilityDataReal':lambda h,l,f:{'A106':15,'A154':10}[h[1]],'EXSetAbilityState':lambda h,s,v:self.cd(h,v)}
  self.env['Has_A_Item']=Closure('main/f7/f8',[self.env]);self.env['Use_A_Item']=Closure('main/f7/f11',[self.env,PAIRS,self.japi]);self.env['Drop_A_Item']=Closure('main/f7/f12',[self.env,PAIRS])
  execute(function('main/f89'),[self.env]);execute(function('main/f90'),[self.env])
 def attribute(self,u,key,e):
  if not u or u.get('deleted'):return 0
  helper={'str':'T121','agi':'T122','int':'T123'}[key];return u[key]+(70*max(0,u['skills'].get(helper,1)-1) if e else 0)
 def setint(self,u,x,flag):
  self.log.append(('int',x,flag))
  if u:u['int']=x
 def state(self,u,s,v):
  self.log.append(('state',s,v))
  if u:u['state'][s]=v
 def swap(self,u,a,b):
  if a in u['skills']:
   assert b not in u['skills'], 'conflicting logical skill slots'
   for key in ['enabled','paid']:
    if a in u[key]:u[key][b]=u[key].pop(a)
   if a in u['permanent']:u['permanent'].remove(a);u['permanent'].add(b)
   u['skills'][b]=u['skills'].pop(a);u['cd'][b]=u['cd'].pop(a,0)
 def add(self,u,a):
  self.log.append(('add',a))
  if not u:return False
  if a in u['skills']:return False
  u['skills'][a]=1
  if a in SWAPS and u['nativeHero']:self.swap(u,*SWAPS[a])
  return True
 def remove(self,u,a):
  self.log.append(('remove',a))
  if not u or a not in u['skills']:return False
  if a in SWAPS and u['nativeHero']:self.swap(u,*reversed(SWAPS[a]))
  u['skills'].pop(a,None);u['cd'].pop(a,None);u['permanent'].discard(a);return True
 def cd(self,h,v):h[0]['cd'][h[1]]=v;self.log.append(('cd',h[1],v))
 def timer(self):self.serial+=1;return {'id':self.serial}
 def start(self,t,sec,repeating,fn):t.update(seconds=sec,repeating=repeating,callback=fn)
 def tick(self,i=1):self.expired=self.env['A111_timers'][i];self.expired['callback']()
 def link(self,c,t):self.env['Tower_ALL'][1]=c;self.env['A111_Action'](c,t)
# Above VM executes the original Lua bytecode. Below natives are bounded Web doubles.
import heapq,copy
from fractions import Fraction
class World(BaseWorld):
 def __init__(self):
  super().__init__();self.now=Fraction(0);self.sequence=0;self.queue=[];self.current=None;self.target=None;self.location=None;self.spell=None;self.damage=0;self.damageType='normal';self.blocked=lambda x,y:False;self.place=lambda u,p:True;self.nativeOverload=None
  E=self.env;E.update({'skill_bs_id':{1:'A010',2:'A110',3:'A127',4:'A169',5:'A239'},'Player':lambda p:p,'GetTriggerUnit':lambda:self.current,'GetSpellAbilityId':lambda:self.spell,'GetSpellTargetUnit':lambda:self.target,'GetSpellTargetLoc':lambda:self.location,'IsTemp':lambda u:bool(u and u.get('temp')),'IsWorker':lambda u:False,'IsBOX':lambda u:False,'J003_Hero':{},'UNIT_TYPE_HERO':'hero','IsUnitType':lambda u,t:bool(u and u['nativeHero']),'Item_Skill_Action':lambda *a:self.log.append(('dependency','Item_Skill_Action')),'WAbility_initAbility':lambda:self.log.append(('dependency','WAbility_initAbility')),'TxShow':True,'GetOwningPlayer':lambda u:u['owner'] if u and not u.get('deleted') else 0,'GetUnitTypeId':lambda u:u['kind'] if u and not u.get('deleted') else 0,'GetUnitAbilityLevel':lambda u,a:u['skills'].get(a,0) if u and not u.get('deleted') else 0,'GetUnitX':lambda u:u['x'] if u and not u.get('deleted') else 0,'GetUnitY':lambda u:u['y'] if u and not u.get('deleted') else 0,'GetUnitState':lambda u,k:(u.get(k,0) if k=='life' else u['state'].get(k,0)) if u and not u.get('deleted') else 0,'HasItem':lambda u,a:a if u and not u.get('deleted') and a in u['items'] and a!=self.manipulated else None,'SquareRoot':math.sqrt,'GetLocationX':lambda p:p['x'] if p else 0,'GetLocationY':lambda p:p['y'] if p else 0,'GetUnitLoc':lambda u:{'x':u['x'],'y':u['y']} if u and not u.get('deleted') else None,'SetUnitPositionLoc':self.position,'CreateEffAtLoc':lambda *a:self.log.append(('effect',*a)),'PATHING_TYPE_BUILDABILITY':'build','IsTerrainPathable':lambda x,y,t:self.blocked(x,y),'PolarProjectionBJ':lambda p,r,a:{'x':(p['x'] if p else 0)+r*math.cos(math.radians(a)),'y':(p['y'] if p else 0)+r*math.sin(math.radians(a))},'DestroyTimer':self.destroy,'IssueImmediateOrder':self.order,'AddLightningEx':self.lightning,'MoveLightningEx':lambda *a:self.log.append(('moveLightning',*a)),'DestroyLightning':lambda *a:self.log.append(('destroyLightning',*a)),'isPhyDamage':lambda t:t=='normal'})
  E['math']['sqrt']=math.sqrt
  self.japi.update({'GetEventDamage':lambda z:self.damage,'EXGetEventDamageData':lambda z:self.damageType,'EXSetEventDamage':lambda v:setattr(self,'damage',v)})
  E.update(Timer_Eff_All={},Eff_ALL={},AddArrAny=Closure('main/f7/f22',[E]),AddSpecialEffectLoc=self.effect,DestroyEffect=lambda e:e.update(destroyed=True) if e else None);self.japi['EXSetEffectSize']=lambda e,v:e.update(scale=v) if e else None;E['CreateEffAtLoc']=Closure('main/f7/f25',[E,self.japi]);E['Eff_time_end']=Closure('main/f7/f26',[E]);E['GetDistance']=Closure('main/f7/f23',[E]);E['GetTempUnitLoc']=Closure('main/f7/f18',[E]);execute(function('main/f91'),[E]);execute(function('main/f291'),[E],(lambda n:self.japi,))
 def attribute(self,u,key,e):return super().attribute(u,key,e) if u and not u.get('deleted') else 0
 def setint(self,u,v,p):
  if u and not u.get('deleted'):super().setint(u,v,p)
 def state(self,u,k,v):
  if u and not u.get('deleted'):super().state(u,k,v)
 def add(self,u,a):return super().add(u,a) if u and not u.get('deleted') else False
 def remove(self,u,a):return super().remove(u,a) if u and not u.get('deleted') else False
 def effect(self,model,p):
  e={'model':model,'point':copy.deepcopy(p),'destroyed':False} if p else None;self.log.append(('effect',e));return e
 def lightning(self,*a):
  r={'id':self.serial+1,'arguments':a};self.log.append(('lightning',a));return r
 def position(self,u,p):
  self.log.append(('position',u and u.get('kind'),copy.deepcopy(p)))
  if u and not u.get('deleted') and p and self.place(u,p):u['x']=p['x'];u['y']=p['y']
 def timer(self):
  t=super().timer();t['alive']=True;return t
 def start(self,t,sec,repeating,fn):
  t.update(period=Fraction(str(sec)),periodic=repeating,callback=fn);self.enqueue(t,self.now+t['period'])
 def enqueue(self,t,when):self.sequence+=1;heapq.heappush(self.queue,(when,self.sequence,t))
 def destroy(self,t):
  self.log.append(('destroyTimer',t and t['id']))
  if t:t['alive']=False
 def advance(self,to):
  to=Fraction(str(to))
  while self.queue and self.queue[0][0]<=to:
   at,seq,t=heapq.heappop(self.queue)
   if not t['alive']:continue
   self.now=at;self.expired=t;t['callback']()
   if t['alive'] and t['periodic']:self.enqueue(t,self.now+t['period'])
  self.now=to
 def order(self,u,o):
  self.log.append(('order',o))
  return self.nativeOverload.order(o) if self.nativeOverload else True
 def cast(self,u,aid,target=None,point=None):
  self.current=u;self.spell=aid;self.target=target;self.location=point or {'x':u['x'],'y':u['y']};self.env['AnySkillStart']()
 def damage_slice(self,source,damage,dtype,web=False):
  self.damage=damage;self.damageType=dtype;f=function('main/f291/f1')
  if web:
   f=copy.deepcopy(f);f['constants']['k176']['value']=.05
  execute(f,[self.env,self.japi],(source,None,None),start_pc=1192,stop_pc=1233)
  return self.damage
class Overcharge:
 """Q24 selected native AEim admission/drain; Q47 grant math lives in SelectedWorld."""
 def __init__(self,w,u,aid):self.w=w;self.u=u;self.aid=aid;self.on=False;self.timer=None;self.buff=None;self.cooldown=Fraction(0);w.nativeOverload=self
 def order(self,o):
  if o=='unimmolation':self.off();return True
  if o!='immolation':return False
  u=self.u;lv=u['skills'].get(self.aid,0)
  if self.on or not 1<=lv<=6 or u.get('life',0)<=0 or u.get('deleted') or u.get('silenced') or u.get('stunned') or u.get('paused') or u.get('castDisabled') or not u.get('controllable',True) or not u['enabled'].get(self.aid,True) or self.w.now<self.cooldown:return False
  # Cost1 missing -> local0; explicit Cost2..4=25, levels5/6 hold last25.
  cost=0 if lv==1 else 25
  if u.get('mana',0)<cost:return False
  u['mana']-=cost;self.on=True;self.cooldown=self.w.now+5
  self.buff={'A112':'B113','A142':'B142','A143':'B143'}[self.aid];u['skills'][self.buff]=1
  self.timer=self.w.timer();self.w.start(self.timer,1,True,self.drain)
  self.w.cast(u,self.aid);return True
 def off(self):
  self.on=False;self.u['skills'].pop(self.buff,None)
  if self.timer:self.w.destroy(self.timer)
 def drain(self):
  lv=self.u['skills'].get(self.aid,0)
  if not self.on or not 1<=lv<=6 or self.u.get('life',0)<=0 or self.u.get('deleted'):self.off();return
  need=[10,20,30,40,50,70][lv-1];m=self.u.get('mana',0)
  self.u['mana']=max(0,m-need)
  if m<=need:self.off()
def native_cast_admitted(u,aid,target=None,point=None):
 if u.get('deleted') or u.get('life',0)<=0 or u.get('paused') or u.get('stunned') or u.get('silenced') or u.get('castDisabled') or not u.get('controllable',True) or not u['enabled'].get(aid,True) or not 1<=u['skills'].get(aid,0)<=6 or u['cd'].get(aid,0)>0:return False
 if aid=='A111':return bool(target and target.get('life',0)>0 and not target.get('deleted') and target['nativeHero'] and (target['owner']==u['owner'] or target.get('friendly')) and not target.get('magicImmune') and math.hypot(u['x']-target['x'],u['y']-target['y'])<=800)
 if aid=='A113':return bool(point and all(math.isfinite(point[k]) and -6144<=point[k]<6144 for k in ['x','y']) and u.get('mana',0)>=[30,40,50,60,70,80][u['skills'][aid]-1])
 return False
def candidate_floor(stat,level,endless=False):
 q=Fraction(level+1,10)*Fraction(str(stat))*(Fraction(3,2) if endless else 1)
 return 3000 if q>=3000 else 70*(q//70)
def candidate_nearest(stat,level,endless=False):
 q=Fraction(level+1,10)*Fraction(str(stat))*(Fraction(3,2) if endless else 1)
 if q>=3000:return 3000
 n=q//70;n+=q-70*n>35
 return min(3000,70*n)
def selected_grade(stat,level,endless=False):
 q=max(Fraction(0),Fraction(level+1,10)*Fraction(str(stat))*(Fraction(3,2) if endless else 1))
 return 43 if q>=3000 else int(q//70)
def selected_amount(grade):return 3000 if grade==43 else 70*grade
class SelectedWorld(World):
 def __init__(self):
  super().__init__();self.grants={};self.env.update(A112_timer_loop=self.overload_tick,A112_rate=self.overload_rate,A112_end=self.overload_end)
 def attribute(self,u,key,e):
  if not u or u.get('deleted'):return 0
  helper={'str':'T121','agi':'T122','int':'T123'}[key]
  return u[key]+(selected_amount(u['skills'].get(helper,1)-1) if e else 0)
 def form(self,u):return {'G057':('A142','B142','T160'),'G058':('A143','B143','T161')}.get(u and u['kind'],('A112','B113','T159'))
 def retract(self,i):
  E=self.env;t=E['A111_113_tar'].get(i);typ=E['A112_Type'].get(i)
  if typ==3:
   old=self.grants.get(i,0)
   if old and t:self.setint(t,max(0,t['int']-old),True)
  elif typ:self.remove(t,['T121','T122','T123'][typ-1])
 def overload_end(self,i):
  E=self.env
  if i in E['A112_Type']:
   self.retract(i);self.remove(E['A111_113_tar'].get(i),self.form(E['Tower_ALL'].get(i))[2])
   for table in ['A112_Type','A112_Level','A112_Count']:E[table].pop(i,None)
   self.grants.pop(i,None)
 def overload_rate(self,i):
  E=self.env;t=E['A111_113_tar'].get(i);c=E['Tower_ALL'].get(i);self.retract(i)
  v=[self.attribute(t,k,True) for k in ['str','agi','int']];typ=1 if v[0]>v[1] and v[0]>v[2] else 2 if v[1]>v[2] and v[0]<=v[1] else 3
  aid=self.form(c)[0];lv=E['GetUnitAbilityLevel'](c,aid);stat=self.attribute(c,['str','agi','int'][typ-1],True);grade=selected_grade(stat,lv,E['Game_Mode']==1);amount=selected_amount(grade)
  E['A112_Type'][i]=typ;E['A112_Level'][i]=grade;E['A112_Count'][i]=grade+1;self.grants[i]=amount
  if grade+1>24:E['Mall_ActivityTask_Update'](E['GetOwningPlayer'](c),2,amount)
  if typ==3:
   if t:self.setint(t,t['int']+amount,True)
  else:
   helper=['T121','T122'][typ-1];self.add(t,helper)
   if t:t['permanent'].add(helper);t['skills'][helper]=grade+1
 def overload_tick(self,i):
  E=self.env;c=E['Tower_ALL'].get(i);aid,buff,marker=self.form(c)
  if E['GetUnitAbilityLevel'](c,buff)!=1 or E['IsInTable'](c,E['Tower_ALL'])==-1:self.overload_end(i);return
  t=E['A111_113_tar'].get(i)
  if t:self.add(t,marker)
  typ=E['A112_Type'].get(i)
  if typ is None:self.overload_rate(i);return
  grade=selected_grade(self.attribute(c,['str','agi','int'][typ-1],True),E['GetUnitAbilityLevel'](c,aid),E['Game_Mode']==1)
  if grade!=E['A112_Level'].get(i):self.overload_rate(i)
class CastTransaction:
 def __init__(self,w):self.w=w;self.tokens={}
 def issue(self,u,aid,target=None,point=None):
  if not native_cast_admitted(u,aid,target,point):return False
  key=id(u);token=self.tokens.get(key,0)+1;self.tokens[key]=token;p=copy.deepcopy(point)
  timer=self.w.timer()
  def commit():
   if self.tokens.get(key)!=token or not native_cast_admitted(u,aid,target,p):return
   self.tokens[key]=token+1;lv=u['skills'][aid];cost=0 if aid=='A111' else 20+10*lv
   u['mana']=u.get('mana',0)-cost;u['cd'][aid]=10 if aid=='A111' else 34-4*lv;self.w.cast(u,aid,target,p)
  self.w.start(timer,.3,False,commit);return True
 def cancel(self,u):self.tokens[id(u)]=self.tokens.get(id(u),0)+1

COUNT=0;VECTORS=[]
def check(c,label):
 global COUNT
 COUNT+=1;assert c,label;VECTORS.append(label)
# Original damage branch vs only selected .03 -> .05 patch.
for lv in range(7):
 for dtype in ['normal','magic','divine']:
  w=World();c=unit('H033',A111=lv);t=unit();w.link(c,t)
  raw=w.damage_slice(t,100,dtype);check(abs(raw-100*(1+lv*(.03 if dtype=='normal' else .05)))<1e-8,f'raw A111 L{lv}/{dtype}')
  check(abs(w.damage_slice(t,100,dtype,True)-100*(1+.05*lv))<1e-8,f'workbook A111 L{lv}/{dtype}')
  check(w.damage_slice(unit(),100,dtype,True)==100,'actual source membership only')
# Every native form and source callback, including missing activation prerequisites.
for kind,aid,buff,marker in [('H033','A112','B113','T159'),('G057','A142','B142','T160'),('G058','A143','B143','T161')]:
 for lv in range(1,7):
  w=World();c=unit(kind,**{aid:lv});c['mana']=1000;t=unit();w.link(c,t);o=Overcharge(w,c,aid)
  check(o.order('immolation'),'toggle accepts '+kind+str(lv));check(c['mana']==(1000 if lv==1 else 975),'explicit activation cost retained')
  w.advance(1);check(marker in t['skills'] and w.env['A112_Type'].get(1)==3,'source tick uses current form marker')
  check(c['mana']==(1000 if lv==1 else 975)-[10,20,30,40,50,70][lv-1],'per second mana '+str(lv))
  o.off();w.advance(2);check(not w.env['A112_Type'],'off removed Buff; next source tick retracts')
for buff in [None,'B113','B142','B143']:
 w=World();c=unit('H033',A112=2)
 if buff:c['skills'][buff]=1
 w.env['A112_Study'](c);check([x[1] for x in w.log if x[0]=='order']==(['unimmolation','immolation'] if buff else []),'Study any active buff '+str(buff))
w=World();c=unit('H033',A112=2);c['mana']=100;w.env['Tower_ALL'][1]=c;o=Overcharge(w,c,'A112');o.order('immolation');w.env['A112_Study'](c);check(not o.on and c['mana']==75,'Study off then restart rejected by existing5s cooldown');w.advance(5);check(o.order('immolation') and c['mana']==50,'restart allowed once cooldown expires')
for mana,expected in [(19,0),(20,0),(21,1)]:
 w=World();c=unit('H033',A112=2);c['mana']=mana+25;w.env['Tower_ALL'][1]=c;o=Overcharge(w,c,'A112');o.order('immolation');w.advance(1);check(c['mana']==max(0,mana-20) and o.on==bool(expected),'drain exhaustion '+str(mana))
w=World();c=unit('H033',A112=2);c['mana']=24;o=Overcharge(w,c,'A112');check(not o.order('immolation') and c['mana']==24,'explicit cost failure no mutation')
w=World();c=unit('H033',A112=1);c['mana']=100;o=Overcharge(w,c,'A112');o.order('immolation');check(any(x[0]=='message' for x in w.log),'Action missing Tower_ALL only warns');w.advance(1);check(c['mana']==90,'no link still burns mana')
# All attribute selection paths, raw level cap and counter helper.
for mode in [0,1,2]:
 for typ,key in [(1,'str'),(2,'agi'),(3,'int')]:
  for lv in range(1,7):
   for stat in [0,49,50,51,100,149,150,151,199,200,1000,2800,2900,3000,10000]:
    w=World();w.env['Game_Mode']=mode;c=unit('H033',A112=lv,B113=1);c[key]=stat;t=unit();t[key]=300;w.link(c,t);w.tick();denom=67 if mode==1 else 100;q=min(29,math.floor((.4+lv/10)*stat/denom));n=min(30,q+1+(stat/100-math.floor(stat/100)>.5));check(w.env['A112_Type'][1]==typ and w.env['A112_Count'][1]==n,f'raw segmented {mode}/{typ}/{lv}/{stat}');w.env['A112_end'](1);check(t[key]==300,'rollback exact raw contribution')
for stats,typ in [((200,100,100),1),((200,200,100),2),((200,100,200),3),((100,200,200),3),((200,200,200),3)]:
 w=World();c=unit('H033',A112=1,B113=1);t=unit();t.update(zip(['str','agi','int'],stats));w.link(c,t);w.tick();check(w.env['A112_Type'][1]==typ,'tie priority '+str(stats))
w=World();c=unit('H033',A112=1,B113=1);c['str']=149;t=unit();t['str']=300;w.link(c,t);w.tick();before=w.env['A112_Count'][1];c['str']=151;w.tick();check(w.env['A112_Count'][1]==before==1,'bonus rounding crossing alone does not trigger refresh');c['str']=200;w.tick();check(w.env['A112_Count'][1]==2,'base level change triggers recompute')
w=World();c=unit('H033',A112=1,B113=1);c['str']=100;t=unit();t['str']=300;w.link(c,t);w.tick();t['int']=1000;w.tick();check(w.env['A112_Type'][1]==1,'target highest attribute change alone does not refresh');c['str']=300;w.tick();check(w.env['A112_Type'][1]==3,'source selected-stat floor change permits target reselection')
# Study level changes/current forms; source nil/invalid Buff conditions.
for active in [0,2]:
 w=World();c=unit('H033',A112=1,B113=active);t=unit();w.link(c,t);w.tick();check(not w.env['A112_Type'],'Buff must exactly level1')
# Link lifecycle, rejected duplicate, re-target and range check ordering.
for skin in ['H033','G057','G058']:
 w=World();c=unit(skin,A111=6);t=unit();w.env['Tower_ALL'][1]=c;w.cast(c,'A111',t);check(w.env['A111_113_tar'][1] is t,'dispatcher A111 '+skin);check(w.log[-1][0]!='dependency','A111 returns before common tail')
 u=unit();w.cast(c,'A111',u);check(w.env['A111_113_tar'][1] is u and t['state'][37]==1,'retarget restores old then new')
for dist in [1000,1000.01]:
 w=World();c=unit('H033',A111=6);c['items'].add('i310');t=unit(A105=1);w.link(c,t);t['x']=dist;w.tick();check(bool(w.env['A111_timers'])==(dist==1000),'strict link range '+str(dist));check(('cd','A106',15) in w.log,'sharing precedes range end')
w=World();c=unit('H033');t=unit();w.link(c,t);n=w.serial;w.cast(c,'A111',t);check(w.serial==n and t['state'][37]==.9,'same target no refresh')
# A113 full dispatcher/callback and polar helper: no grant/revoke synthesized.
for skin,show,target in [(k,b,t) for k in ['H033','G057','G058'] for b in [False,True] for t in [False,True]]:
 w=World();w.env['TxShow']=show;c=unit(skin,A113=1);w.env['Tower_ALL'][1]=c
 if target:w.link(c,unit())
 w.cast(c,'A113',point={'x':1000,'y':1000});check(c['x']==0,'A113 not immediate');w.advance(.1);check(c['x']==(1400 if target else 1000),'A113 caster polar400 '+skin);check(bool(w.env['A111_113_tar'])==target,'A113 leaves current link index')
w=World();c=unit('H033',A113=1);w.env['Tower_ALL'][1]=c;w.blocked=lambda x,y:True;w.cast(c,'A113',point={'x':500,'y':500});check(not w.queue and any(x[0]=='message' for x in w.log),'unbuildable effect rejects no timer')
w=World();c=unit('H033');a=unit();b=unit();w.link(c,a);w.cast(c,'A113',point={'x':1000,'y':1000});w.env['A111_Action'](c,b);w.advance(.1);check(a['x']==0 and b['x']==1000,'callback reads current link not captured target')
w=World();c=unit('H033');w.env['Tower_ALL'][1]=c;w.cast(c,'A113',point={'x':500,'y':500});w.cast(c,'A113',point={'x':1000,'y':1000});w.advance(.1);check(c['x']==1000 and sum(x[0]=='position' and x[1] is None for x in w.log)==1,'overwritten old timer looks up -1 no target')
w=World();c=unit('H033');t=unit();w.link(c,t);w.place=lambda u,p:u is c;w.cast(c,'A113',point={'x':1000,'y':1000});w.advance(.1);check(t['x']==0 and c['x']==1400,'target placement failure does not rollback caster');w.advance(1);check(not w.env['A111_timers'],'later link tick handles resulting distance')
for mode,blocked,expectedX in [(0,lambda x,y:False,400),(2,lambda x,y:True,400),(0,lambda x,y:True,400)]:
 w=World();w.env['Game_Mode']=mode;w.blocked=blocked;p=w.env['GetTempUnitLoc']({'x':0,'y':0},400);check(abs(p['x']-expectedX)<1e-8,'polar helper mode/fullfail '+str(mode))
w=World();w.blocked=lambda x,y:y<300;p=w.env['GetTempUnitLoc']({'x':0,'y':0},400);check(abs(p['x']-200)<1e-8 and abs(p['y']-200*math.sqrt(3))<1e-8,'polar helper first60deg')
# Ordinary command admission boundaries; native choices not source field inference.
u=unit('H033',A111=1,A113=1);u['mana']=30;t=unit();t['x']=800
check(native_cast_admitted(u,'A111',t),'A111 range inclusive800');t['x']=800.01;check(not native_cast_admitted(u,'A111',t),'A111 range excludes800.01');t['x']=0;t['nativeHero']=False;check(not native_cast_admitted(u,'A111',t),'native hero target only');t['nativeHero']=True;t['magicImmune']=True;check(not native_cast_admitted(u,'A111',t),'A111 no universal option immunity gate')
check(native_cast_admitted(u,'A113',point={'x':6143,'y':0}),'A113 full map admitted');check(not native_cast_admitted(u,'A113',point={'x':6144,'y':0}),'A113 outer boundary rejected before commit')
# Q47 arithmetic comparison: floor70 selected; nearest70 rejected.
CANDIDATES=[]
for lv in range(1,7):
 for endless in [False,True]:
  for stat in [0,50,100,149,150,151,175,200,1000,1500,3000,4285,4286,10000]:
   a=candidate_floor(stat,lv,endless);b=candidate_nearest(stat,lv,endless);check(0<=a<=3000 and 0<=b<=3000 and (a==3000 or a%70==0) and (b==3000 or b%70==0),'Q47 quantization bounds');CANDIDATES.append({'level':lv,'endless':endless,'sourceStat':stat,'floor70':a,'nearest70HalfDown':b})
# Refresh paths preserve source lazy selection, saturation, and rollback ordering.
for typ,key in [(1,'str'),(2,'agi'),(3,'int')]:
 w=World();c=unit('H033',A112=6,B113=1);t=unit();t[key]=300;c[key]=100;w.link(c,t);w.tick()
 for stat in [300,5000,6000,10,51]:
  c[key]=stat;w.tick();check(w.env['A112_Type'][1]==typ,'refresh type '+key+str(stat))
 w.env['A112_rate'](1);w.env['A112_end'](1);check(t[key]==300,'refresh+end restores exact old quantity '+key)
w=World();c=unit('H033',A112=1,B113=1);t=unit();t.update(str=200,agi=100,int=300);w.link(c,t);w.tick();check(w.env['A112_Type'][1]==3,'str above agi but int above str branch')
for key,store in [('none',None),('one',1),('large',4)]:
 w=World();c=unit('H033',A112=1,B113=1);t=unit();w.link(c,t);w.env['A112_Type'][1]=3
 if store is not None:w.env['A112_Count'][1]=store;t['int']+=70*(store-1)
 w.env['A112_rate'](1);check(w.env['A112_Type'][1]==3,'raw previous Int count '+key)
for helpval in [0,1]:
 w=World();c=unit('H033');t=unit(owner=1);w.env['Tower_ALL'][1]=c;w.env['Help_Arr'][2]=helpval;w.env['A111_Action'](c,t);check(bool(w.env['A111_113_tar'])==(helpval==0),'other owner Help refusal '+str(helpval))
w=World();c=unit('H033');t=unit();w.link(c,t);c['items'].add('i310');w.tick();c['items'].clear();w.tick();check(not w.env['A111_113_A'],'shared source loss revokes virtual');t['life']=0;w.tick();check(not w.env['A111_113_tar'] and t['state'][37]==.9,'dead target skips interval restoration')
w=World();c=unit('H033');t=unit();w.link(c,t);t['items'].add('i310');w.env['A111_end'](1);check(t['state'][37]==1,'physical scepter end skips Drop but restores interval');w.env['A111_end'](1);check(t['state'][37]==1,'duplicate end no second restore')
w=World();c=unit('H033');t=unit();w.link(c,t);w.env['A111_113_tar'].pop(1);w.tick();check(not w.env['A111_timers'],'nil target ends timer')
w=World();c=unit('H033');t=unit();w.link(c,t);w.env['Tower_ALL'].pop(1);w.env['A112_timer_loop'](1);check(not w.env['A112_Type'],'missing source ends overload')
w=World();c=unit('H033');t=unit();w.link(c,t);t['life']=0;w.cast(c,'A113',point={'x':500,'y':500});w.advance(.1);check(t['x']==500 and c['x']==900,'relocate callback has no living-target gate')
w=World();c=unit('H033');t=unit();w.link(c,t);w.place=lambda u,p:False;w.cast(c,'A113',point={'x':500,'y':500});w.advance(.1);check(c['x']==t['x']==0 and ('activity',0,3,1) in w.log,'failed native placements still activity and no rollback')
# Q47 confirmed floor70 implementation, including capped grade44 object adaptation.
for mode in [0,1,2]:
 for typ,key in [(1,'str'),(2,'agi'),(3,'int')]:
  for lv in range(1,7):
   for stat in [0,1,50,349,350,351,1000,14999,15000,15001,100000]:
    w=SelectedWorld();w.env['Game_Mode']=mode;c=unit('H033',A112=lv,B113=1);c[key]=stat;t=unit();t[key]=300;w.link(c,t);w.tick();award=candidate_floor(stat,lv,mode==1)
    check(w.grants[1]==award and w.attribute(t,key,True)==300+award,'Q47 actual grant '+str((mode,typ,lv,stat)))
    w.env['A112_end'](1);check(w.attribute(t,key,True)==300,'Q47 rollback actual grant including3000')
for stat,expected in [(14999,2940),(15000,3000),(15001,3000)]:
 check(candidate_floor(stat,1)==expected,'Q47 cap pre-quantization '+str(stat))
check(candidate_floor(1000,1)==140 and candidate_nearest(1000,1)==210,'Q47 selected140 rejected210')
w=SelectedWorld();c=unit('H033',A112=1,B113=1);c['str']=1000;t=unit();t['str']=300;w.link(c,t);w.tick();t['int']=1000;c['str']=1049;w.tick();check(w.env['A112_Type'][1]==1 and w.grants[1]==140,'Q47 unchanged grade does not reselect target type');c['str']=1050;w.tick();check(w.env['A112_Type'][1]==3,'Q47 grade boundary reselects after retract')
w=SelectedWorld();c=unit('H033',A112=1,B113=1);c['str']=15000;t=unit();t['str']=300;w.link(c,t);w.tick();t['int']=1000;c['str']=20000;w.tick();check(w.env['A112_Type'][1]==1 and w.grants[1]==3000,'Q47 saturated grade stable despite higher source');c['str']=14999;w.tick();check(w.env['A112_Type'][1]==3,'Q47 leaving cap re-evaluates type')
# Independent native drain and link timer ordering at the same deadline.
for startFirst,expected in [(False,True),(True,False)]:
 w=SelectedWorld();c=unit('H033',A112=1);c['int']=1000;c['mana']=10;t=unit();o=Overcharge(w,c,'A112')
 if startFirst:w.env['Tower_ALL'][1]=c;o.order('immolation');w.link(c,t)
 else:w.link(c,t);o.order('immolation')
 w.advance(1);check(bool(w.env['A112_Type'])==expected,'B05 link before/after exhausted native drain '+str(startFirst));w.advance(2);check(not w.env['A112_Type'],'exhausted grant removed next existing link tick')
# A113 resource commit and native placement failure are different stages.
for point,terrain in [({'x':500,'y':500},False),({'x':500,'y':500},True)]:
 w=World();w.blocked=lambda x,y,v=terrain:v;c=unit('H033',A113=1);c['mana']=30;w.env['Tower_ALL'][1]=c;cast=CastTransaction(w);check(cast.issue(c,'A113',point=point),'A113 accepts before terrain effect');w.advance(.29);check(c['mana']==30,'no charge before .3');w.advance(.3);check(c['mana']==0 and c['cd']['A113']==30,'commit charges once regardless terrain rejection');w.advance(.4);check(c['x']==(0 if terrain else 500),'terrain branch transfer result')
w=World();c=unit('H033',A113=1);c['mana']=30;w.env['Tower_ALL'][1]=c;cast=CastTransaction(w);cast.issue(c,'A113',point={'x':500,'y':500});cast.cancel(c);w.advance(1);check(c['mana']==30 and c['x']==0,'cancel before commit no charge')
w=World();c=unit('H033',A113=1);c['mana']=30;w.env['Tower_ALL'][1]=c;cast=CastTransaction(w);cast.issue(c,'A113',point={'x':500,'y':500});c['mana']=29;w.advance(.3);check(c['mana']==29 and not c['cd'],'mana lost before commit rejects')
w=World();c=unit('G057');w.env['Tower_ALL'][1]=c;w.cast(c,'A113',point={'x':500,'y':500});w.advance(.1);effects=[x[1] for x in w.log if x[0]=='effect'];check(len(effects)==2 and [e['scale'] for e in effects]==[1,2],'A113 effects both1s but sizes1/2');w.advance(1.1);check(all(e['destroyed'] for e in effects) and not w.env['Timer_Eff_All'],'effect timers cleanup after1s')
w=World();e=w.env['CreateEffAtLoc']('test',{'x':0,'y':0},1,None);check(e['scale']==1,'visual helper missing scale defaults1');w.env['CreateEffAtLoc']('test',None,1,2);w.advance(1);check(not w.env['Eff_ALL'],'nil visual handle timer still cleaned')
w=SelectedWorld();c=unit('H033',A112=2);c['mana']=1000;t=unit();w.link(c,t);o=Overcharge(w,c,'A112');o.order('immolation');w.advance(1);c['skills']['A142']=c['skills'].pop('A112');c['kind']='G057';o.aid='A142';w.advance(2);check(o.on and c['skills'].get('B113')==1 and not w.env['A112_Type'],'same logical-slot rebind retains old Buff, current form gate retracts');o.off();check('B113' not in c['skills'],'off removes actual old active Buff after ANeg');w.advance(5);o.order('immolation');check(c['skills'].get('B142')==1,'new on installs current actual variant Buff')
for control in ['silenced','stunned','paused']:
 w=World();c=unit('H033',A112=1);c['mana']=100;c[control]=True;o=Overcharge(w,c,'A112');check(not o.order('immolation'),'toggle admission '+control)
for aid in ['A111','A112','A113']:
 for gate in ['disabled','castDisabled','uncontrollable']:
  w=World();c=unit('H033',**{aid:1});c['mana']=100
  if gate=='disabled':c['enabled'][aid]=False
  elif gate=='castDisabled':c['castDisabled']=True
  else:c['controllable']=False
  admitted=Overcharge(w,c,aid).order('immolation') if aid=='A112' else native_cast_admitted(c,aid,unit(),{'x':0,'y':0})
  check(not admitted and c['mana']==100,'local cast capability gate '+aid+'/'+gate)
w=World();c=unit('H033');t=unit();w.link(c,t);c['deleted']=True;w.tick();check(bool(w.env['A111_113_tar']),'source deletion alone not invented immediate link end; getters0')
w=World();c=unit('H033');t=unit();w.link(c,t);t['deleted']=True;w.tick();check(not w.env['A111_113_tar'] and t['state'][37]==.9,'deleted target ends without native compensation')
w=World();c=unit('H033');t=unit();w.link(c,t);w.cast(c,'A113',point={'x':500,'y':500});c['deleted']=True;w.advance(.1);check(t['x']==500 and c['x']==0,'committed A113 deletion no caster write but current target still moved')
core=['main/f89/f'+str(i) for i in range(3)]+['main/f90/f'+str(i) for i in range(10)]+['main/f91/f0','main/f91/f1','main/f7/f18','main/f7/f22','main/f7/f23','main/f7/f25','main/f7/f26']
report={'assertions':COUNT,'vectors':VECTORS,'core':{n:{'executed':len(COVER[n]),'total':len(function(n)['instructions'])} for n in core},'allExecuted':sum(map(len,COVER.values())),'comparisonVectors':CANDIDATES,'limitations':['Original A112 values are evidence; floor70 is Q47 confirmed and nearest70 is a rejected comparison.','Native AEim, casting and placement doubles implement Q24 selections, not matching-client proof.','Item and WAbility prelude effects logged only.','A111 damage branch isolated after original earlier routing; whole damage handler not rerun here.']}
data=json.loads((R/'docs/rules/wisp-link-overcharge-relocate.json').read_text());evidence=0
for name,f in data['source_functions'].items():
 assert f['instructions']==function(name)['instructions'] and f['sourceLines']==function(name)['sourceLines'],name
 evidence+=len(f['instructions'])
for f in data['source_slices']:
 lo,hi=f['pcRange'];assert f['instructions']==function(f['function'])['instructions'][lo-1:hi]
 evidence+=len(f['instructions'])
for file,digest in data['source_hashes'].items():assert hashlib.sha256((S/file).read_bytes()).hexdigest()==digest,file
cache={};linecache={}
def raw_record(record):
 path=R/record['sourcePath']
 if str(path) not in cache:cache[str(path)]=json.loads(path.read_text());linecache[str(path)]=path.read_text().splitlines()
 assert record['record'] in cache[str(path)]
 identifier=next(iter(record['record'].values()));assert str(identifier) in linecache[str(path)][record['line']-1]
for a in data['abilities'].values():
 raw_record(a)
 for m in a['w3a']:assert m['record'] in json.loads((S/'war3map.w3a.json').read_text())
 lo,hi=a['profile']['sourceLines'];assert (R/a['profile']['sourcePath']).read_text().splitlines()[lo-1:hi]==a['profile']['lines']
for b in data['buffs'].values():raw_record(b)
for rows in data['units'].values():
 for row in rows.values():raw_record(row)
import zipfile,xml.etree.ElementTree as ET
for b in data['workbooks']:
 p=Path(b['path']);assert hashlib.sha256(p.read_bytes()).hexdigest()==b['sha256']
 with zipfile.ZipFile(p) as z:
  assert z.testzip() is None;ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'};ss=[''.join(t.itertext()) for t in ET.fromstring(z.read('xl/sharedStrings.xml'))];cells={}
  for c in ET.fromstring(z.read('xl/worksheets/sheet5.xml')).findall('.//s:c',ns):
   v=c.find('s:v',ns);cells[c.get('r')]=ss[int(v.text)] if c.get('t')=='s' else v.text if v is not None else ''
  for row in b['rows']:
   for cell,value in row['cells'].items():assert cells[cell]==value,(b['path'],cell)
assert data['a112']['decision']['status']=='confirmed' and data['a112']['decision']['selected']=='option1_floor70'
assert data['a112']['selected']['amountByCount']==[selected_amount(i) for i in range(44)]
assert data['a112']['selected']['endlessMultiplier']['numerator']==3 and data['a112']['selected']['endlessMultiplier']['denominator']==2
manifest=json.loads((S/'manifest.json').read_text())
for m in manifest['files']:assert hashlib.sha256((S/m['file']).read_bytes()).hexdigest()==m['sha256'],m['file']
linkcount=0
for target,line in re.findall(r'\]\(([^():]+?)(?:#L(\d+))?\)',(R/'docs/rules/wisp-link-overcharge-relocate.md').read_text()):
 p=(R/'docs/rules'/target).resolve();assert p.exists(),target
 if line:assert 1<=int(line)<=len(p.read_text().splitlines()),(target,line)
 linkcount+=1
report['evidence_validation']={'sourceFunctions':len(data['source_functions']),'sourceSlices':len(data['source_slices']),'sourceInstructions':evidence,'sourceHashes':len(data['source_hashes']),'abilityRecords':len(data['abilities']),'buffRecords':len(data['buffs']),'unitRecords':sum(len(x) for x in data['units'].values()),'workbookCells':sum(len(r['cells']) for b in data['workbooks'] for r in b['rows']),'selectedHelperLevels':44,'localLinks':linkcount,'immutableManifestFiles':len(manifest['files'])}
if '--output' in sys.argv:Path(sys.argv[sys.argv.index('--output')+1]).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ['vectors','comparisonVectors']},ensure_ascii=False))
