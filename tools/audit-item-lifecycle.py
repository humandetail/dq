#!/usr/bin/env python3
"""Bounded static-rule probe for item-lifecycle-v1; never launches Warcraft.

Executes the original Lua 5.3 disassembly for the handlers listed in the JSON.
Native item/event operations are explicit Web test doubles, NOT client evidence.
Effects outside the inventory boundary (A-staff, key rewards, card RNG pools,
item actives, and platform APIs) are logged/stubbed and are not validated here.
The dense numeric Lua tables use the selected ascending-key Web traversal.
Run: python3 tools/audit-item-lifecycle.py [--output /tmp/item-audit.json]
"""
from pathlib import Path
import ast,json,re,collections
R=Path(__file__).resolve().parents[1];S=R/'reference/map-6.25';D=(S/'main.disasm').read_text().splitlines()
CACHE={};COVER=collections.defaultdict(set)
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
  elif op=='newtable':setreg(p[0],{})
  elif op=='len':setreg(p[0],length(val(p[1])))
  elif op=='setlist':
   a=int(p[0][1:]);n=int(p[1]) if int(p[1]) else top-a-1;offset=(int(p[2])-1)*50
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


from itertools import product
OBJ={x['itemID']:x for x in json.loads((S/'units_itemdata.json').read_text())}
class World:
 def __init__(self):
  self.items={};self.units={};self.trace=[];self.stack=[];self.counter=0;self.rolls=[];self.recipes=True;self.timers={};self.nexttimer=0;self.expired=None;self.target='T';self.point=(0,0);self.ready=True;self.terrain=False
  self.env={'GetId':lambda x:x,'pairs':pairs,'ipairs':ipairs,'Game_Mode':0,'A_ITEM_ID':'i310','ignore_strong_item':{},'Tower_ALL':{},'Player_Build_Unit':{},'DeLuYi_XiongLingHuoBan':{},'i276_DefUnit':{},'Is_Match_Mode':0,'i330_Is_Auto':{},'null':None}
  self.env.update({'GetManipulatedItem':lambda:self.ctx('item'),'GetManipulatingUnit':lambda:self.ctx('unit'),'GetTriggerUnit':lambda:self.ctx('unit'),'GetSpellAbilityId':lambda:self.ctx('ability'),'GetSpellTargetUnit':lambda:self.ctx('target'),'GetSpellTargetItem':lambda:self.ctx('targetItem'),'GetAttacker':lambda:self.ctx('unit'),'GetSpellTargetLoc':lambda:self.ctx('point'), 'GetItemTypeId':self.typeof,'GetItemCharges':lambda i:self.attr(i,'charges',0),'SetItemCharges':self.setcharge,'GetItemLevel':lambda i:OBJ.get(self.typeof(i),{}).get('Level',0),'GetItemName':lambda i:self.typeof(i),'UnitItemInSlot':lambda u,n:self.units.get(u,{}).get('bag',{}).get(n),'GetOwningPlayer':lambda u:self.units.get(u,{}).get('owner'), 'GetPlayerId':lambda p:p,'Player':lambda n:n,'IsWorker':lambda u:self.units.get(u,{}).get('worker',False),'IsBOX':lambda u:self.units.get(u,{}).get('box',False),'IsXiongLingHuoBan':lambda u:self.units.get(u,{}).get('bear',False),'GetUnitAbilityLevel':lambda u,id:self.units.get(u,{}).get('abilities',{}).get(id,0),'IsUnitType':lambda u,ty:self.units.get(u,{}).get('melee',False),'UNIT_TYPE_MELEE_ATTACKER':'MELEE','GetUnitUserData':lambda u:self.units.get(u,{}).get('data',1),'GetUnitState':lambda u,k:self.units.get(u,{}).get('state',{}).get(k,0),'SetUnitState':self.setstate,'ConvertUnitState':lambda x:x,'UNIT_STATE_MAX_LIFE':'MAX_LIFE','UNIT_STATE_LIFE':'LIFE','UNIT_STATE_MAX_MANA':'MAX_MANA','GetUnitAcquireRange':lambda u:self.units[u]['state'].get('acquire',600),'SetUnitAcquireRange':lambda u,v:self.setstate(u,'acquire',v),'IsItemInvulnerable':lambda i:self.attr(i,'invulnerable',False),'SetItemInvulnerable':lambda i,v:self.setattr(i,'invulnerable',v),'AnyUnitPickUp':lambda u,i:True,'CreateItem':self.create,'RemoveItem':self.remove,'UnitRemoveItemSwapped':lambda i,u:self.drop(u,i),'UnitAddItem':self.add,'UnitDropItemSlot':self.slot,'GetUnitX':lambda u:100,'GetUnitY':lambda u:200,'GetLocationX':lambda p:p[0],'GetLocationY':lambda p:p[1],'IsTerrainPathable':lambda *a:self.terrain,'PATHING_TYPE_BUILDABILITY':'BUILD','GetRandomInt':self.random,'WAbility_W017':lambda u:0,'GetPlayerNameStr':lambda p:str(p),'Get_ItemData_By_ID':lambda id,k:id,'CheckPlayerHasShopItem':lambda *a:False,'Unit_Item_Has_Cool_Down':lambda u,i,a:i is not None and self.ready,'UnitUseItem':lambda *a:self.note('UnitUseItem',*a),'UnitUseItemTarget':lambda *a:self.note('UnitUseItemTarget',*a),'UnitUseItemPointLoc':lambda *a:self.note('UnitUseItemPointLoc',*a),'GroupEnumUnitsInRange':lambda *a:self.note('enum',a[3]),'GroupClear':lambda *a:None,'hasHero':lambda g:self.target,'hasMon':lambda g:self.target,'GetUnitLoc':lambda u:self.point,'GetUnitTypeId':lambda u:self.units.get(u,{}).get('type','m001'),'CreateTimer':self.newtimer,'GetExpiredTimer':lambda:self.expired,'TimerStart':self.starttimer,'DestroyTimer':self.destroytimer,'UnitAddAbility':lambda *a:self.note('UnitAddAbility',*a),'UnitRemoveAbility':lambda *a:self.note('UnitRemoveAbility',*a),'UnitMakeAbilityPermanent':lambda *a:self.note('Permanent',*a),'IssueImmediateOrder':lambda *a:self.note('Order',*a)})
  for s in ['DisplayTextToPlayer','DisplayTextToAll','DisplayTimedTextToPlayer','CreateEffByUnit','Mall_ActivityTask_Update_Summer','DZAPI_Update_Skin_Piece','Abyss_gold_bless_use','Use_A_Item','Drop_A_Item','ChooseHeroShow','BoxOpen_Action','i237_Action','y005_Action','y007_Action','y009_Action','i330_Open','i330_Close']+[f'i718_723_Action0{i}' for i in range(1,7)]:self.env[s]=lambda *a,s=s:self.note(s,*a)
  for s in [v['value'] for v in function('main/f285/f6')['constants'].values() if isinstance(v['value'],str) and (v['value'].endswith(('Action','Acition','Random','StarUp')) or v['value']=='i258_StarRandom')]:
   if s not in self.env:self.env[s]=lambda *a,s=s:self.note(s,*a)
  self.env['IsInTable']=Closure('main/f7/f7',[self.env]);self.env['AddArrAny']=Closure('main/f7/f22',[self.env])
  _,self.module=execute(function('main/f285'),[self.env],(lambda _: {},),True)
  for n,ident in [('RandomSSR','i501'),('RandomSR','i551'),('RandomR','i601'),('RandomN','i701')]:self.env[n]=lambda n=n,ident=ident:(self.note('choose',n),ident)[1]
  self.env['CardWeight_Get_SR_RandomID']=lambda p:(self.note('choose','weightedSR'), 'i551')[1]
  self.env['Has_A_Item']=lambda u:self.env['HasItem'](u,'i310') is not None
 def note(self,*args):self.trace.append(list(args))
 def ctx(self,k):return self.stack[-1].get(k) if self.stack else None
 def event(self,kind,u,i=None,**extra):
  self.stack.append({'event':kind,'unit':u,'item':i,**extra});self.note('begin',kind,i)
  try:self.env[{'PICKUP':'Item_Get','DROP':'Item_Drop','USE':'Item_Use','SPELL':'ItemSkillUsed'}[kind]](*([extra.get('point',(0,0))] if kind=='SPELL' else []))
  finally:self.note('end',kind,i);self.stack.pop()
 def unit(self,id='U',owner=0,worker=False,box=False,bear=False,qual=True,melee=False):
  self.units[id]={'owner':owner,'worker':worker,'box':box,'bear':bear,'melee':melee,'bag':{},'state':{'MAX_LIFE':1000,'LIFE':1000,'MAX_MANA':500,37:1,22:600,'acquire':600,81:1},'abilities':{'B015':1} if qual else {},'data':len(self.units)+1};return id
 def create(self,id,x=100,y=200):
  self.counter+=1;i='item'+str(self.counter);self.items[i]={'id':id,'charges':OBJ.get(id,{}).get('uses',0),'owner':None,'alive':True,'invulnerable':False,'xy':(x,y)};self.note('create',i,id);return i
 def attr(self,i,k,default=None):return self.items[i].get(k,default) if i in self.items and self.items[i]['alive'] else default
 def typeof(self,i):return self.attr(i,'id',0)
 def setattr(self,i,k,v):
  if self.attr(i,'alive',False):self.items[i][k]=v
 def setcharge(self,i,v):
  if self.attr(i,'alive',False):self.items[i]['charges']=v;self.note('charge',i,v)
 def setstate(self,u,k,v):self.units[u]['state'][k]=v;self.note('state',u,k,v)
 def inventory(self,u='U'):return [(k,self.typeof(v),self.attr(v,'charges')) for k,v in sorted(self.units[u]['bag'].items())]
 def seed(self,u,id,q=None,slot=None):
  i=self.create(id)
  if q is not None:self.items[i]['charges']=q
  n=slot if slot is not None else next(n for n in range(6) if n not in self.units[u]['bag']);self.units[u]['bag'][n]=i;self.items[i]['owner']=u;return i
 def add(self,u,i):
  if not self.attr(i,'alive',False) or u not in self.units:return False
  bag=self.units[u]['bag']
  if all(n in bag for n in range(6)):self.note('full',i);return False
  n=next(n for n in range(6) if n not in bag);bag[n]=i;self.items[i]['owner']=u;self.note('attach',u,i,n);self.event('PICKUP',u,i);return True
 def detach(self,u,i):
  bag=self.units[u]['bag'];n=next((n for n,v in bag.items() if v==i),None)
  if n is None:return False
  del bag[n];self.items[i]['owner']=None;self.note('detach',u,i);return True
 def drop(self,u,i):
  if self.attr(i,'alive',False) and u in self.units and self.detach(u,i):self.items[i]['xy']=(100,200);self.event('DROP',u,i)
 def remove(self,i):
  if not self.attr(i,'alive',False) or self.attr(i,'removing',False):return
  self.items[i]['removing']=True
  u=self.attr(i,'owner')
  if u is not None:self.drop(u,i)
  self.items[i]['alive']=False;self.note('remove',i)
 def slot(self,u,i,n):
  if self.attr(i,'owner')!=u or not 0<=n<6:return False
  bag=self.units[u]['bag'];old=next(k for k,v in bag.items() if v==i);other=bag.get(n);bag[n]=i
  if other is None:bag.pop(old,None)
  else:bag[old]=other
  self.note('slot',i,n);return True
 def random(self,a,b):
  r=self.rolls.pop(0) if self.rolls else a;assert a<=r<=b;self.note('rng',a,b,r);return r
 def newtimer(self):self.nexttimer+=1;t='timer'+str(self.nexttimer);self.timers[t]={};return t
 def starttimer(self,t,delay,periodic,cb):self.timers[t].update(delay=delay,periodic=periodic,cb=cb);self.note('schedule',t,delay)
 def destroytimer(self,t):self.timers.pop(t,None);self.note('destroyTimer',t)
 def drain(self):
  for t,v in list(self.timers.items()):self.expired=t;v['cb']()
 def use(self,u,i,ability,target=None,targetItem=None):
  q=self.attr(i,'charges',0)
  if q>0:self.setcharge(i,q-1)
  # Chosen Web use: debit first; defer zero-perishable deletion through both event chains.
  self.event('USE',u,i)
  self.event('SPELL',u,None,ability=ability,target=target,targetItem=targetItem,point=(0,0))
  if self.attr(i,'alive',False) and OBJ[self.typeof(i)].get('perishable')==1 and self.attr(i,'charges',0)==0:self.remove(i)

CASES=[]
def verify(name,actual,expected,world=None):
 assert actual==expected,(name,actual,expected)
 CASES.append({'name':name,'actual':actual,'expected':expected,**({'trace':world.trace} if world else {})})
# Source matcher: every one of91 recipes needs distinct slots, including repeated IDs.
w=World();u=w.unit(worker=True);matcher=w.module[14]
for idx,row in w.module[3].items():
 w.units[u]['bag'].clear();materials=[row[k] for k in sorted(row) if k>1]
 for id in materials:w.seed(u,id)
 result=matcher(u,row);verify('recipe '+str(idx)+' distinct-slot complete',list(result.values()),list(range(len(materials))))
 w.units[u]['bag'].pop(len(materials)-1);verify('recipe '+str(idx)+' missing final slot',matcher(u,row),{})
# Pickup literal gates with workers and energy circles kept distinct.
for id,worker,box,allow in [('i256',False,False,False),('i256',True,False,True),('i256',False,True,False),('i278',False,True,False),('i329',False,True,True),('i131',False,False,False),('i131',True,False,True)]:
 w=World();u=w.unit(worker=worker,box=box);i=w.create(id);w.add(u,i);verify('pickup gate '+str((id,worker,box)),w.attr(i,'owner')==u,allow)
# Growth hooks precede qualification rejection, Drop reverses the concrete calls.
w=World();u=w.unit(qual=False);i=w.create('i145');w.items[i]['charges']=3;w.add(u,i);verify('rejected growth has add then remove',[(x[2],x[3]) for x in w.trace if x[0]=='state'],[('MAX_LIFE',1012),('MAX_LIFE',1000)],w);verify('rejected item remains invulnerable on ground',(w.attr(i,'owner'),w.attr(i,'alive'),w.attr(i,'invulnerable')),(None,True,True))
for id,field,expected in [('i304',37,1),('i282',22,600)]:
 w=World();u=w.unit(qual=False);i=w.create(id);w.add(u,i);verify('qualification compensation '+id,w.units[u]['state'][field],expected)
# Explicit precompensation can survive when another same-ID item remains: do not repair.
w=World();u=w.unit(qual=False);w.seed(u,'i304');i=w.create('i304');w.add(u,i);verify('i304 duplicate + lost qualification preserves script asymmetry',round(w.units[u]['state'][37],10),.8,w)
# Exact same-owner ignore/abyss/partner cases.
for mode,qual,ignore,allow in [(0,False,False,False),(2,False,False,True),(0,False,True,True),(0,True,False,True)]:
 w=World();u=w.unit(qual=qual);w.env['Game_Mode']=mode;i=w.create('i304')
 if ignore:w.env['ignore_strong_item'][1]=i
 w.add(u,i);verify('qualification flags '+str((mode,qual,ignore)),w.attr(i,'owner')==u,allow)
# Source recipes 2 and 3 chain synchronously through the newly created item.
w=World();u=w.unit(worker=True);w.seed(u,'i140');w.seed(u,'i139');new=w.create('i139');w.add(u,new);verify('chain consumes new/old material and nested result',[v[1] for v in w.inventory()],['i136'],w)
# All6 slots remain occupied when every matched ordinary material has another charge.
w=World();u=w.unit(worker=True);w.seed(u,'i208',2);w.seed(u,'i122',2)
for id in ['i101','i102','i103']:w.seed(u,id)
i=w.create('i208');w.items[i]['charges']=2;w.add(u,i)
verify('full after multi-charge crafting keeps result on ground',[(v['id'],v['owner']) for v in w.items.values() if v['alive'] and v['id']=='i207'],[('i207',None)],w)
# stack merge happens after recipes and keeps pre-existing instance.
for id in ['i001','i127','y006']:
 w=World();u=w.unit(worker=True);old=w.seed(u,id,2);new=w.create(id);w.items[new]['charges']=3;w.add(u,new);verify('stack instance preserved '+id,(w.attr(old,'charges'),w.attr(new,'alive',False)),(5,False))
# Normal Item_Get no match tail and six explicit reward-item delegates.
for n in range(718,724):
 w=World();u=w.unit(worker=True);i=w.create('i'+str(n));w.add(u,i);verify('pickup reward dispatch '+str(n),len([x for x in w.trace if x[0]=='i718_723_Action0'+str(n-717)]),1)
# Last-charge draw, lucky extra precedes regular and both see full source slot.
for charges,lucky,expected_ground,expected_count in [(1,False,1,5),(2,False,1,6),(1,True,2,5)]:
 w=World();u=w.unit(worker=True);i=w.seed(u,'i001',charges)
 for id in ['i101','i102','i103','i104','i105']:w.seed(u,id)
 w.env['WAbility_W017']=lambda u:101 if lucky else 0;w.rolls=[1,1,1];w.use(u,i,'I001')
 ground=[x for x in w.items.values() if x['alive'] and x['owner'] is None and x['id']=='i701'];verify('last charge full draw '+str((charges,lucky)),(len(ground),len(w.inventory())),(expected_ground,expected_count),w)
# I259 nil target returns without restoration; wrong item adds1 through HasItem in SPELL context.
for targetid,expected in [(None,False),('i101',True)]:
 w=World();u=w.unit(worker=True);i=w.seed(u,'i329',1);target=w.create(targetid) if targetid else None;w.use(u,i,'I259',targetItem=target);verify('I259 charge refund '+str(targetid),(w.attr(i,'alive',False),w.attr(i,'charges',0)),(expected,1 if expected else 0),w)
# Keys are permanent uncharged source items: missing chest is a message, not deletion.
for key,box in [('i411','i401'),('i412','i402'),('i413','i403'),('i414','i404')]:
 for found in [False,True]:
  w=World();u=w.unit(worker=True);k=w.seed(u,key)
  if found:c=w.seed(u,box)
  w.event('USE',u,k);verify('key use '+str((key,found)),w.attr(k,'alive',False),not found)
# Use dispatch charge compensation is source conditional; internal i330 effect is only stubbed here.
for id in ['i330','i332']:
 for q in [0,1,2,5]:
  w=World();u=w.unit(worker=True);i=w.seed(u,id,q);w.use(u,i,'I274');verify('use positive-charge compensation '+str((id,q)),w.attr(i,'charges'),q if q!=1 else 0)
# All delegated ItemSkillUsed identifiers execute at least once, no generic fake refund.
expected={'I167':'I167_Acition','I168':'I168_Acition','I226':'I226_Acition','I227':'I227_Acition','I228':'I228_Acition','I207':'I207_Acition','I243':'i325_Action','I247':'I247_Action','I273':'i278_Action','I219':'i219_Action','I220':'i219_Action','I234':'I234_Acition','I245':'i238_Acition','I266':'i272_Acition','I267':'i274_Acition','I285':'i281_Action','I270':'i276_Action','I211':'I211_Action','I233':'I211_Action','I246':'i246_Acition','I253':'i258_SkillRandom','I254':'i258_StarUp','I260':'i264_StarUp','I255':'i258_StarRandom'}
for ability,call in expected.items():
 w=World();u=w.unit(worker=True);w.unit('T');w.event('SPELL',u,None,ability=ability,target='T',point=(0,0));verify('spell delegate '+ability,len([x for x in w.trace if x[0]==call]),1)
# Bear drop branches are isolated source deltas; owning/passive gain implementation is not implied.
for id,delta in [('i243',.4),('i245',.4),('i247',.4),('i253',.4),('i242',.2)]:
 w=World();u=w.unit();b=w.unit('B');w.units[u]['abilities']['A125']=1;w.env['DeLuYi_XiongLingHuoBan'][1]='B';i=w.seed(u,id);w.drop(u,i);verify('bear drop delta '+id,round(w.units[b]['state'][81],8),round(1-delta,8))
# Auto-use is not first-success-return; two zero-time schedulers and two callbacks.
w=World();u=w.unit();w.unit('T');
for id in ['i238','i272','i274','i276','i281','i325']:w.seed(u,id)
w.stack.append({'unit':u});w.env['Item_Auto_Use']({});w.stack.pop();verify('autouse attempts all independent items',len([x for x in w.trace if x[0]=='UnitUseItem']),3);verify('autouse zero timers',len(w.timers),3);w.drain();verify('autouse scheduled target/point calls',[x[0] for x in w.trace if x[0].startswith('UnitUseItem')],['UnitUseItem']*3+['UnitUseItemTarget']*2+['UnitUseItemPointLoc'],w)
for life,auto,opens in [(1000,None,1),(999,None,0),(1000,False,0),(1000,True,1)]:
 w=World();u=w.unit();w.unit('T');w.seed(u,'i332');w.units[u]['state']['LIFE']=life
 if auto is not None:w.env['i330_Is_Auto'][1]=auto
 w.stack.append({'unit':u});w.env['Item_Auto_Use']({});w.stack.pop();verify('i332 auto full-life literal gate '+str((life,auto)),len([x for x in w.trace if x[0]=='i330_Open']),opens)
# Item ownership locks: real function, including index-preserving overwrite on unlocked transfer.
w=World();u=w.unit();v=w.unit('V',owner=1);worker=w.unit('W',owner=0,worker=True);w.env['Player_Build_Unit'][1]='W';execute(function('main/f280'),[w.env],(None,));i=w.create('i101');w.add(u,i);w.drop(u,i);w.units['W']['abilities']['B062']=1;w.add(v,i);verify('locked cross-owner pickup rejects',w.attr(i,'owner'),None,w);w.units['W']['abilities'].clear();w.add(v,i);verify('unlocked cross-owner transfer changes registry',w.attr(i,'owner'),'V')
# Complete whitelist and exclusion dispatch, plus original source's early-reward branches.
for id in w.module[12].values():
 w=World();u=w.unit(worker=True);old=w.seed(u,id,2);new=w.create(id);w.items[new]['charges']=3;w.add(u,new);verify('all14 merge '+id,(w.attr(old,'charges'),w.attr(new,'alive',False)),(5,False))
for idx,row in w.module[4].items():
 ids=[row[k] for k in sorted(row) if k>1];w=World();u=w.unit();w.seed(u,ids[0]);new=w.create(ids[1] if len(ids)>1 else ids[0]);w.add(u,new);verify('all12 exclusions '+str(idx),w.attr(new,'owner'),None)
for id in ['i421','i422']:
 w=World();u=w.unit(worker=True);i=w.create(id);w.add(u,i);verify('early reward bypasses invulnerability '+id,w.attr(i,'invulnerable'),False);verify('early reward delegate count '+id,len([x for x in w.trace if x[0]==('Abyss_gold_bless_use' if id=='i421' else 'DZAPI_Update_Skin_Piece')]),1 if id=='i421' else 4)
for id in ['i332','i330','i145','i147','i220','i327','i218']:
 w=World();u=w.unit();i=w.create(id);w.items[i]['charges']=5;w.add(u,i);w.drop(u,i);verify('growth roundtrip '+id,(w.units[u]['state']['MAX_LIFE'],w.units[u]['state']['MAX_MANA']),(1000,500))
w=World();u=w.unit(worker=True);i=w.create('i330');w.items[i]['charges']=27;w.add(u,i);verify('worker i330 replacement does not copy growth',[(x[1],x[2]) for x in w.inventory()],[('i332',0)],w)
w=World();u=w.unit(worker=True)
for id,q in [('i146',0),('i147',7),('i148',0),('i148',0)]:w.seed(u,id,q)
i=w.create('i145');w.items[i]['charges']=9;w.add(u,i);verify('incoming result qualifies recipe, material overwrites captured charges',[x[2] for x in w.inventory() if x[1]=='i145'],[7,9],w)
# Same-ID repeated materials cannot reuse one charged instance.
w=World();u=w.unit(worker=True);row=w.module[3][80];w.seed(u,'i146');w.seed(u,'i147',7);w.seed(u,'i148',2);verify('two repeated materials require two slots despite charges',w.module[14](u,row),{})
# I004 preserves its otherwise unused RNG draw and all output order; no free-slot reservation.
w=World();u=w.unit(worker=True);w.rolls=[73];w.env['CheckPlayerHasShopItem']=lambda *a:True;w.event('SPELL',u,None,ability='I004',point=(0,0));verify('I004 RNG then four outputs',[x[3] if x[0]=='rng' else x[2] for x in w.trace if x[0] in ['rng','create']],[73,'i401','i411','i411','i412'],w)
for roll,id in [(1,'i131'),(32,'i131'),(33,'i133'),(65,'i133'),(66,'i262'),(100,'i262')]:
 w=World();u=w.unit(worker=True);w.rolls=[roll];w.event('SPELL',u,None,ability='I006',point=(0,0));verify('I006 inclusive boundary '+str(roll),w.inventory()[0][1],id)
for mode,ability,refund in [(0,'I211',True),(2,'I211',False),(0,'I233',False),(2,'I233',False)]:
 w=World();u=w.unit(worker=True);w.env['Game_Mode']=mode;w.terrain=True;i=w.seed(u,'i207',3);w.event('SPELL',u,None,ability=ability,point=(0,0));verify('blocked ward creates replacement '+str((mode,ability)),len([x for x in w.trace if x[0]=='remove']),1 if refund else 0)
 if refund:verify('ward refund replaces whole multi-charge instance',[(x[1],x[2]) for x in w.inventory()],[('i207',1)],w)
for target,listed,expect in [('m001',False,1),('ma01',False,0),('m001',True,0)]:
 w=World();u=w.unit(worker=True);w.unit('T');w.units['T']['type']=target
 if listed:w.env['i276_DefUnit'][1]='T'
 w.event('SPELL',u,None,ability='I270',target='T');verify('I270 literal target gate '+str((target,listed)),len([x for x in w.trace if x[0]=='i276_Action']),expect)
# The final i247 .3 branch is reachable when a different group member remains.
w=World();u=w.unit();b=w.unit('B');w.units[u]['abilities']['A125']=1;w.env['DeLuYi_XiongLingHuoBan'][1]='B';w.seed(u,'i253');i=w.seed(u,'i247');w.drop(u,i);verify('bear i247 overlapping groups uses .3 branch',w.units[b]['state'][81],.7,w)
# Lock migration reuses the old numeric index, even if the new registry has another item there.
w=World();u=w.unit();v=w.unit('V',owner=1);w.env['Player_Build_Unit'][1]=w.unit('W',worker=True);execute(function('main/f280'),[w.env],(None,));a=w.create('i101');b=w.create('i102');w.add(u,a);w.add(v,b);w.drop(u,a);w.add(v,a);verify('lock transfer preserves source index and overwrites destination',w.env['ItemLock_ALL'][2],{1:a},w)
# Real i330 replacement helpers, with only their downstream damage/start timer implementation stubbed.
w=World();u=w.unit();old=w.seed(u,'i332',9,slot=4);op=Closure('main/f273/f2',[w.env,lambda unit:w.note('start-i330-effect',unit)]);op(u,old);verify('i330 open replacement preserves slot and charges',w.inventory(),[(4,'i330',9)],w)
new=w.units[u]['bag'][4];cl=Closure('main/f273/f3',[w.env,{}]);cl(u,new);verify('i330 close replacement preserves slot and charges',w.inventory(),[(4,'i332',9)],w)
w=World();u=w.unit();ground=w.create('i332');Closure('main/f273/f2',[w.env,lambda _:None])(u,ground);verify('i330 open removes before missing slot check',w.attr(ground,'alive',False),False)
w=World();u=w.unit();ground=w.create('i330');Closure('main/f273/f3',[w.env,{}])(u,ground);verify('i330 close removes before missing slot check',w.attr(ground,'alive',False),False)
# Event-context exclusion is local to the current event, not inherited into the spell frame.
w=World();u=w.unit(worker=True);i=w.seed(u,'i329',1);w.stack.append({'event':'USE','unit':u,'item':i});verify('HasItem excludes USE event instance',w.env['HasItem'](u,'i329'),None);w.stack.append({'event':'SPELL','unit':u});verify('HasItem sees instance under SPELL frame',w.env['HasItem'](u,'i329'),i);w.stack.pop();verify('HasItem restores outer USE frame',w.env['HasItem'](u,'i329'),None);w.stack.pop()

# The I219 auto-use gate is Game_Mode == 1 (constant k18), not abyss mode2.
for mode in [0,1,2]:
 for itemid in ['i224','i226']:
  w=World();u=w.unit();w.unit('T');w.seed(u,itemid);w.env['Game_Mode']=mode;w.stack.append({'unit':u});w.env['Item_Auto_Use']({});w.stack.pop();verify('I219 auto mode '+str((mode,itemid)),len(w.timers),1 if mode==1 else 0)
# Item_Use only toggles/open-closes for nonworker/nonbox; charge compensation precedes this gate.
for itemid,call in [('i330','i330_Close'),('i332','i330_Open')]:
 for worker,box in [(False,False),(True,False),(False,True)]:
  w=World();u=w.unit(worker=worker,box=box);i=w.seed(u,itemid,2);w.use(u,i,'I274');verify('manual toggle carrier gate '+str((itemid,worker,box)),len([x for x in w.trace if x[0]==call]),0 if worker or box else 1)
# Numeric pawn boundary vectors exercise the chosen ratio (not a Warcraft-native implementation).
for gold,initial,current,want in [(900,1,3,1350),(101,1,1,50),(900,5,3,270),(24690,None,500,12345),(None,1,3,None)]:
 got=None if gold is None else (gold*current//(2*initial) if initial else gold//2)
 verify('Q24 pawn quote '+str((gold,initial,current)),got,want)

# Local Q24 RemoveItem recursion protection keeps the DROP frame readable and runs it only once.
w=World();u=w.unit(worker=True);i=w.seed(u,'i101');original=w.env['Item_Drop']
def recursive_drop():
 original();w.note('drop-read',w.typeof(i));w.remove(i)
w.env['Item_Drop']=recursive_drop;w.remove(i)
verify('Q24 recursive RemoveItem on same handle is idempotent',([x for x in w.trace if x[0]=='drop-read'],len([x for x in w.trace if x[0]=='remove'])),([['drop-read','i101']],1),w)
# Native command acceptance is an explicit Web double; source callback still clears timer on false.
w=World();u=w.unit();w.unit('T');i=w.seed(u,'i276');w.stack.append({'unit':u});w.env['Item_Auto_Use']({});w.stack.pop();w.drop(u,i)
def validate_saved_command(caster,item,target):
 ok=w.attr(item,'owner')==caster and w.attr(item,'alive',False)
 w.note('command-accept',ok);return ok
w.env['UnitUseItemTarget']=validate_saved_command;w.drain()
verify('Q24 moved item rejects deferred command but source clears timer',([x for x in w.trace if x[0]=='command-accept'],len(w.timers)),([['command-accept',False]],0),w)

# Q44 explicitly replaces the personal-stock selector's global-unit operand
# with GetBuyingUnit(). This environment adapter models ONLY that substitution;
# it does not edit the source or assert that Warcraft supplied this binding.
class Q44StockEnvironment(dict):
 def get(self,key,default=None):
  if key=='unit':return dict.get(self,'GetBuyingUnit')()
  return dict.get(self,key,default)

def stock_probe(mode,global_unit,personal_a,personal_b,shared_count,sold='i305',adopted=True,refresh_used=0):
 trace=[];personal={1:{1:{1:sold,2:personal_a}},2:{1:{1:sold,2:personal_b}}};shared={1:{1:sold,2:shared_count}};refresh={1:refresh_used,2:0}
 values={'GAME_ENDLESS_TYPE':mode,'unit':global_unit,'GetPlayerId':lambda p:p,'GetOwningPlayer':lambda u:{'A':0,'B':1}.get(u),'GetSellingUnit':lambda:'shop-A','GetBuyingUnit':lambda:'A','GetItemTypeId':lambda _:sold,'GetSoldItem':lambda:'sold-instance','pairs':pairs,'RemoveItemFromStock':lambda shop,item:trace.append(['unstock',shop,item]),'GetId':lambda x:x,'RemoveItem':lambda i:trace.append(['remove',i]),'Item_Reset_Fshop':lambda owner:trace.append(['refresh',owner]),'DisplayTimedTextToPlayer':lambda *a:None}
 env=Q44StockEnvironment(values) if adopted else values
 execute(function('main/f292/f6'),[shared,env,personal,refresh])
 return {'personalA':personal[1][1][2],'personalB':personal[2][1][2],'shared':shared[1][2],'refreshUsed':refresh[1],'trace':trace}

fshop=function('main/f292/f6')
assert fshop['instructions'][6]['raw'].split()==['gettabup','r3','u1','k4']
assert fshop['constants']['k4']['value']=='unit'
q44_start=len(CASES)
verify('Q44 source comparison: global B decrements B, unstocks actual A shop',stock_probe(1,'B',4,1,3,adopted=False),{'personalA':4,'personalB':0,'shared':3,'refreshUsed':0,'trace':[['unstock','shop-A','i305']]})
for sold in ['i305','i311']:
 for injected in ['A','B',None]:
  for before in [1,4]:
   verify('Q44 buyer stock '+str((sold,injected,before)),stock_probe(1,injected,before,4,3,sold),{'personalA':before-1,'personalB':4,'shared':3,'refreshUsed':0,'trace':[['unstock','shop-A',sold]] if before==1 else []})
for mode in [0,2]:
 for injected in ['B',None]:
  for before in [1,4]:
   verify('Q44 shared mode unchanged '+str((mode,injected,before)),stock_probe(mode,injected,4,4,before),{'personalA':4,'personalB':4,'shared':before-1,'refreshUsed':0,'trace':[['unstock','shop-A','i305']] if before==1 else []})
for injected in ['B',None]:
 for used in [0,1]:
  verify('Q44 i399 buyer once-per-game counter '+str((injected,used)),stock_probe(1,injected,1,4,3,'i399',refresh_used=used),{'personalA':0,'personalB':4,'shared':3,'refreshUsed':1,'trace':[['unstock','shop-A','i399'],['remove','sold-instance']]+([['refresh',0]] if used==0 else [])})
Q44_CASES=CASES[q44_start:]

if __name__ == '__main__':
 import argparse
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--output', type=Path)
 args=parser.parse_args()
 report={'baseline':'item-lifecycle-v1','kind':'source-bytecode with explicit Web native doubles and Q44 selector substitution','caseCount':len(CASES),'cases':CASES,'q44':{'status':'user-adopted','operandSubstitution':'main/f292/f6 PC7: _ENV.unit -> GetBuyingUnit()','sourceComparisonCases':1,'selectedBehaviorCases':len(Q44_CASES)-1,'cases':Q44_CASES},'coverage':{k:{'executedPCs':sorted(v),'executedCount':len(v),'instructionCount':len(function(k)['instructions'])} for k,v in COVER.items()}}
 if args.output: args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'cases':len(CASES),'executedSourceInstructions':sum(len(v) for v in COVER.values()),'functionsExecuted':len(COVER),'nativeRuntimeTested':False}))
