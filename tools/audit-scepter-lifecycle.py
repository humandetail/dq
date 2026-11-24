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
class World:
 def __init__(self):
  self.log=[];self.expired=None;self.manipulated=None;self.serial=0
  self.env={'GetId':lambda a:a,'pairs':pairs,'math':{'floor':math.floor},'Tower_ALL':{},'Help_Arr':{},'Game_Mode':0,'A_ITEM_ID':'i310','UNIT_STATE_LIFE':'life','ConvertUnitState':lambda s:s,'GetConvertedPlayerId':lambda p:p+1,'GetOwningPlayer':lambda u:u.get('owner',0) if u else 0,'GetUnitTypeId':lambda u:u.get('kind',0) if u else 0,'GetUnitAbilityLevel':lambda u,a:u.get('skills',{}).get(a,0) if u else 0,'UnitAddAbility':self.add,'UnitRemoveAbility':self.remove,'UnitMakeAbilityPermanent':lambda u,v,a:u['permanent'].add(a) if u else None,'SetUnitAbilityLevel':lambda u,a,l:u['skills'].__setitem__(a,l) if u and a in u['skills'] else None,'HasItem':lambda u,a:a if u and a in u['items'] and a!=self.manipulated else None,'IsInTable':lambda v,t:next((k for k,x in sorted(t.items()) if equal(v,x)),-1),'GetUnitState':lambda u,s:(u.get(s,0) if s=='life' else u['state'].get(s,0)) if u else 0,'SetUnitState':self.state,'GetHeroStr':lambda u,e:self.attribute(u,'str',e),'GetHeroAgi':lambda u,e:self.attribute(u,'agi',e),'GetHeroInt':lambda u,e:self.attribute(u,'int',e),'SetHeroInt':self.setint,'GetUnitX':lambda u:u.get('x',0) if u else 0,'GetUnitY':lambda u:u.get('y',0) if u else 0,'GetDistance':lambda a,b:math.hypot(a['x']-b['x'],a['y']-b['y']),'CreateTimer':self.timer,'GetExpiredTimer':lambda:self.expired,'TimerStart':self.start,'DestroyTimer':lambda t:self.log.append(('destroyTimer',t and t['id'])),'AddLightningEx':lambda *a:{'visual':a[0]},'MoveLightningEx':lambda *a:None,'DestroyLightning':lambda *a:None,'DisplayTextToPlayer':lambda *a:self.log.append(('message',)),'DisplayTimedTextToPlayer':lambda *a:self.log.append(('message',)),'Mall_ActivityTask_Update':lambda *a:self.log.append(('activity',*a)),'IssueImmediateOrder':lambda *a:self.log.append(('order',a[1]))}
  self.japi={'EXGetUnitAbility':lambda u,a:[u,a],'EXGetAbilityDataReal':lambda h,l,f:{'A106':15,'A154':10}[h[1]],'EXSetAbilityState':lambda h,s,v:self.cd(h,v)}
  self.env['Has_A_Item']=Closure('main/f7/f8',[self.env]);self.env['Use_A_Item']=Closure('main/f7/f11',[self.env,PAIRS,self.japi]);self.env['Drop_A_Item']=Closure('main/f7/f12',[self.env,PAIRS])
  execute(function('main/f89'),[self.env]);execute(function('main/f90'),[self.env])
 def attribute(self,u,key,e):
  if not u:return 0
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
COUNT=0
VECTORS=[]
def check(cond,label):
 global COUNT
 COUNT+=1;assert cond,label;VECTORS.append(label)
for parent,child,cd in [('A105','A106',15),('A153','A154',10)]:
 for lev in [0,1,6]:
  for existing in [False,True]:
   w=World();u=unit(**{parent:lev});u['cd'][child]=3
   if existing:u['skills'][child]=1
   w.env['Use_A_Item'](u)
   check((u['skills'].get(child,0)>0)==(lev>0 or existing),f'{parent} gate {lev}/{existing}')
   check(u['cd'][child]==(cd if lev>0 else 3),f'{child} cooldown {lev}/{existing}')
   u['skills'].pop(parent,None);w.env['Drop_A_Item'](u);check(child not in u['skills'],f'{child} drop without parent {lev}/{existing}')
for kind,start,end in [('H057','A217','A218'),('H029','A094','A095')]:
 for lv in range(1,7):
  w=World();u=unit(kind,**{start:lv});u['cd'][start]=4.25;w.env['Use_A_Item'](u)
  check(u['skills'].get(end)==lv and u['cd'][end]==4.25,f'{kind} use ANeg L{lv}')
  w.env['Drop_A_Item'](u);check(u['skills'].get(start)==lv and u['cd'][start]==4.25,f'{kind} drop ANeg L{lv}')
w=World();u=unit(A033=1);w.env['Use_A_Item'](u);u['skills'].pop('A033');w.env['Drop_A_Item'](u);check(u['skills'].get('I269')==1,'I269 retained after parent removal')
w=World();u=unit();w.env['Use_A_Item'](u);u['skills']['A033']=1;check('I269' not in u['skills'],'late A033 does not replay Use')
for hasPhysical in [False,True]:
 w=World();c=unit('H033');t=unit(A105=1);c['items'].add('i310')
 if hasPhysical:t['items'].add('i310')
 w.link(c,t);check(abs(t['state'][37]-.9)<1e-9 and not w.env['A111_113_A'],'link immediate interval but no virtual grant')
 w.tick();check((w.env['A111_113_A'].get(1) is t)==(not hasPhysical),'first tick physical gate')
 c['items'].clear();w.tick();check(not w.env['A111_113_A'],'loss clears virtual when target no physical')
 w.env['A111_end'](1);check(abs(t['state'][37]-1)<1e-9,'alive end restores interval');before=len(w.log);w.env['A111_end'](1);check(not any(x[0]=='state' for x in w.log[before:]),'double end no interval write')
w=World();c=unit('H033');t=unit(A105=1);c['items'].add('i310');w.link(c,t);w.tick();t['items'].add('i310');c['items'].clear();w.tick();check(w.env['A111_113_A'].get(1) is t,'target physical preserves stale virtual entry');t['items'].clear();w.tick();check(not w.env['A111_113_A'] and 'A106' not in t['skills'],'physical removal then next tick revokes')
for distance in [1000,1000.01]:
 w=World();c=unit('H033');t=unit(A105=1);c['items'].add('i310');w.link(c,t);t['x']=distance;w.tick();check(bool(w.env['A111_timers'])==(distance<=1000),f'distance inclusive {distance}');check(('cd','A106',15) in w.log,'out of range still grants before end')
w=World();c=unit('H033');t=unit(A105=1);c['items'].add('i310');w.link(c,t);w.tick();t['life']=0;w.tick();check('A106' in t['skills'] and t['state'][37]==.9 and not w.env['A111_113_A'],'dead target clears index without Drop or interval restore')
w=World();c=unit('H033');t=unit();w.link(c,t);n=w.serial;w.env['A111_Action'](c,t);check(w.serial==n and t['state'][37]==.9,'same linked target rejects refresh')
w=World();c=unit('G057');t=unit(owner=1);w.env['Help_Arr'][2]=1;w.link(c,t);check(not w.env['A111_timers'],'other owner rejects help');w.env['Help_Arr'][2]=0;w.env['A111_Action'](c,t);check(bool(w.env['A111_timers']),'other owner permits help')
for typ in [1,2,3]:
 for cnt in [1,2,30]:
  w=World();c=unit('H033');t=unit();w.link(c,t);w.env['A112_Type'][1]=typ;w.env['A112_Count'][1]=cnt;w.env['A112_Level'][1]=cnt-1;t['skills']['T159']=1
  if typ==3:t['int']+=70*(cnt-1)
  else:t['skills'][['T121','T122'][typ-1]]=cnt
  w.env['A112_end'](1);check(t['int']==100 and not any(k in t['skills'] for k in ['T121','T122','T159']) and not w.env['A112_Type'],f'A112 rollback type{typ}/count{cnt}')
w=World();c=unit('G058');t=unit(T160=1);w.link(c,t);w.env['A112_Type'][1]=1;w.env['A112_Level'][1]=0;w.env['A112_Count'][1]=1;w.env['A112_end'](1);check(t['skills'].get('T160')==1,'current skin marker selection retains previous marker')
for stat,expected in [('str',1),('agi',2),('int',3)]:
 w=World();c=unit('H033',A112=6,B113=1);t=unit();c[stat]=10000;t[stat]=200;w.link(c,t);w.tick();check(w.env['A112_Type'][1]==expected and w.env['A112_Count'][1]==30,f'A112 original rate capped count {stat}');w.env['A111_end'](1);check(t[stat]==200,f'A112 original cap rollback {stat}')
w=World();u=unit(A033=1);w.env['Use_A_Item'](u);w.env['Drop_A_Item'](u);check('I269' not in u['skills'],'I269 normal removal')
w=World();u=unit();w.env['A111_113_A'][7]=u;check(w.env['Has_A_Item'](u),'shared table membership establishes qualification');w.env['A111_113_A'].clear();u['items'].add('i310');w.manipulated='i310';check(not w.env['Has_A_Item'](u),'physical current manipulated item excluded')
for skin in ['G057','G058']:
 w=World();c=unit(skin,A142=1,A143=1);t=unit();w.link(c,t);t2=unit();w.env['A111_Action'](c,t2);check(abs(t['state'][37]-1)<1e-9 and abs(t2['state'][37]-.9)<1e-9,'retarget ends old before new '+skin)
w=World();u=unit();u['items'].add('i310');check(w.env['Has_A_Item'](u),'physical qualification without manipulated item')
w=World();u=unit('H057',A217=0);u['paid']['A217']=0;u['enabled']['A217']=False;u['permanent'].add('A217');w.env['Use_A_Item'](u);check(u['skills'].get('A218')==0 and u['paid'].get('A218')==0 and u['enabled'].get('A218') is False and 'A218' in u['permanent'],'unlearned slot metadata preserved without learn event')
w=World();u=unit('H057');w.env['Use_A_Item'](u);check('A218' not in u['skills'],'absent slot not created by ANeg')
w=World();u=unit('H057',A217=1);u['nativeHero']=False;w.env['Use_A_Item'](u);check('A217' in u['skills'] and 'A218' not in u['skills'],'non-native-HERO local ANeg no replacement')
core=['main/f7/f8','main/f7/f11','main/f7/f12']+['main/f89/f'+str(i) for i in range(3)]+['main/f90/f'+str(i) for i in range(10)]
report={'assertions':COUNT,'vectors':VECTORS,'core':{n:{'executed':len(COVER[n]),'total':len(function(n)['instructions'])} for n in core},'all_executed':sum(map(len,COVER.values())),'limitations':['Original A112 numerical evidence tested, not selected complete A112 effect.','ANeg and natives are explicit local Web stubs.','No full A106/A154/A094/A095/A217/A218 effect, native AEim, Model_Change or client test.']}
if '--output' in sys.argv:Path(sys.argv[sys.argv.index('--output')+1]).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
dataPath=R/'docs/rules/scepter-lifecycle.json'
if dataPath.exists():
 import zipfile,xml.etree.ElementTree as ET
 data=json.loads(dataPath.read_text());evidence=0
 for n,f in data['source_functions'].items():
  assert f['instructions']==function(n)['instructions'];evidence+=len(f['instructions'])
 for file,digest in data['source_hashes'].items():assert hashlib.sha256((S/file).read_bytes()).hexdigest()==digest
 for b in data['workbooks']:
  p=Path(b['path']);assert hashlib.sha256(p.read_bytes()).hexdigest()==b['sha256']
  with zipfile.ZipFile(p) as z:
   assert z.testzip() is None
   ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'};ss=[''.join(t.itertext()) for t in ET.fromstring(z.read('xl/sharedStrings.xml'))];root=ET.fromstring(z.read('xl/worksheets/sheet5.xml'));cells={}
   for c in root.findall('.//s:c',ns):
    v=c.find('s:v',ns);cells[c.get('r')]=ss[int(v.text)] if c.get('t')=='s' else v.text if v is not None else ''
   for row in b['rows']:
    for cell,value in row['cells'].items():assert cells[cell]==value
 for aid,a in data['abilities'].items():
  assert a['record']==next(r for r in json.loads((S/'units_abilitydata.json').read_text()) if r['alias']==aid)
  assert '"alias": "'+aid+'"' in (S/'units_abilitydata.json').read_text().splitlines()[a['line']-1]
  for m in a['w3a']:assert m['record'] in json.loads((S/'war3map.w3a.json').read_text())
 md=(R/'docs/rules/scepter-lifecycle.md').read_text();linkcount=0
 for target,line in re.findall(r'\]\(([^():]+?)(?:#L(\d+))?\)',md):
  p=(R/'docs/rules'/target).resolve();assert p.exists(),target
  if line:assert int(line)<=len(p.read_text().splitlines()),(target,line)
  linkcount+=1
 report['evidence_validation']={'sourceInstructions':evidence,'sourceHashes':len(data['source_hashes']),'abilityRecords':len(data['abilities']),'workbookCells':sum(len(r['cells']) for b in data['workbooks'] for r in b['rows']),'localLinks':linkcount}
if '--output' in sys.argv:Path(sys.argv[sys.argv.index('--output')+1]).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='vectors'},ensure_ascii=False))
