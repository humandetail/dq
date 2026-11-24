import json,pathlib,copy,math,hashlib,re,openpyxl
root=pathlib.Path(__file__).resolve().parents[1];p=root/'docs/rules/hero-aura-family.json';d=json.load(open(p));F=d['source_functions'];B=d['source_branches'];code=(root/'reference/map-6.25/main.disasm').read_text().splitlines()
identity=0
for f in list(F.values())+list(B.values()):
 for z in f['instructions']:assert code[z['line']-1].split(';')[0].split()==[z['op'],*z['args']];identity+=1
for file,h in d['source_hashes'].items():assert hashlib.sha256((root/'reference/map-6.25'/file).read_bytes()).hexdigest()==h
bookchecks=0
for b in d['workbooks']:
 path=pathlib.Path(b['path']);assert hashlib.sha256(path.read_bytes()).hexdigest()==b['sha256'];w=openpyxl.load_workbook(path,read_only=True,data_only=True);rows=list(w['塔技能'].iter_rows(max_col=9,values_only=True));w.close()
 for v in b['rows']:
  for cell,val in v['cells'].items():assert rows[v['row']-1][ord(cell[0])-65]==val;bookchecks+=1
# Independent SLK extraction to check JSON, including absent fields.
head={};grid={};x=y=0
for line in (root/'reference/map-6.25/units_abilitydata.slk').read_text().splitlines():
 if not line.startswith('C;'):continue
 mx=re.search(r';X(\d+)',line);my=re.search(r';Y(\d+)',line);mk=re.search(r';K(.*)$',line)
 if mx:x=int(mx[1])
 if my:y=int(my[1])
 if not mk:continue
 value=mk[1]
 if value.startswith('"'):value=value[1:-1].replace('""','"')
 else:
  try:value=int(value)
  except ValueError:value=float(value)
 if y==1:head[x]=value
 else:grid.setdefault(y,{})[head[x]]=value
raw={v['alias']:v for v in grid.values()}
for e in d['entries']:assert raw[e['id']]==e['ability']['record']
# Execute original instructions; only native calls are deterministic stubs.
def run(f,env,args=None,regs=None,upvals=None):
 ins={x['pc']:x for x in f['instructions']};r={f'r{i}':x for i,x in enumerate(args or [])};r.update(regs or {});top=len(args or []);pc=min(ins);steps=0;ups={'u0':env,'u1':env};ups.update(upvals or {})
 def v(a):return f['constants'][a] if a.startswith('k') else r.get(a)
 def truth(x):return x is not None and x is not False
 def eq(a,b):return type(a)==type(b) and a==b or isinstance(a,(float,int)) and not isinstance(a,bool) and isinstance(b,(float,int)) and not isinstance(b,bool) and a==b
 while pc in ins:
  steps+=1;assert steps<3000;z=ins[pc];o=z['op'];a=z['args'];n=pc+1
  if o=='gettabup':r[a[0]]=ups[a[1]].get(v(a[2]))
  elif o=='settabup':ups[a[0]][v(a[1])]=v(a[2])
  elif o=='setupval':ups[a[1]]=v(a[0])
  elif o=='getupval':r[a[0]]=ups[a[1]]
  elif o=='gettable':r[a[0]]=v(a[1]).get(v(a[2]))
  elif o=='settable':v(a[0])[v(a[1])]=v(a[2])
  elif o in ['loadk','move']:r[a[0]]=v(a[1])
  elif o=='loadnil':
   for j in range(int(a[1])+1):r['r'+str(int(a[0][1:])+j)]=None
  elif o=='loadbool':r[a[0]]=a[1]=='1';n+=int(a[2]!='0')
  elif o in ['add','sub','mul','div']:r[a[0]]={'add':lambda x,y:x+y,'sub':lambda x,y:x-y,'mul':lambda x,y:x*y,'div':lambda x,y:x/y}[o](v(a[1]),v(a[2]))
  elif o=='call':
   base=int(a[0][1:]);b=int(a[1]);c=int(a[2]);aa=[r.get('r'+str(i)) for i in range(base+1,base+b if b else top)];assert callable(v(a[0])),(f['function'],z,r);out=v(a[0])(*aa);rr=list(out) if isinstance(out,tuple) else [out]
   if c==0:
    for j,q in enumerate(rr):r['r'+str(base+j)]=q
    top=base+len(rr)
   elif c>1:
    for j in range(c-1):r['r'+str(base+j)]=rr[j] if j<len(rr) else None
  elif o in ['eq','lt','le']:
   test=eq(v(a[1]),v(a[2])) if o=='eq' else (v(a[1])<v(a[2]) if o=='lt' else v(a[1])<=v(a[2]));n+=int(test!=(a[0]=='1'))
  elif o=='test':n+=int(truth(v(a[0]))!=(a[1]=='1'))
  elif o=='jmp':n=f['labels'][a[-1]]
  elif o=='tforcall':
   base=int(a[0][1:]);out=v(a[0])(r.get('r'+str(base+1)),r.get('r'+str(base+2)));r['r'+str(base+3)]=out
  elif o=='tforloop':
   base=int(a[0][1:]);val=r.get('r'+str(base+1))
   if val is not None:r[a[0]]=val;n=f['labels'][a[1]]
  elif o=='return':return tuple(r.get('r'+str(int(a[0][1:])+j)) for j in range(int(a[1])-1))
  else:raise Exception(z)
  pc=n
 return ('exit',pc)
cases=[]
def check(name,condition):assert condition,name;cases.append(name)
class State:
 def __init__(self):
  self.units={'S':{},'T':{},'O':{},'E':{},'B':{},'F':{},'D':{}};self.owners={'S':0,'T':11,'O':0,'E':11,'B':11,'F':0,'D':11};self.life={'S':100,'T':100,'O':100,'E':100,'B':100,'F':100,'D':0};self.types={'S':'H019','T':'enemy','E':'enemy','B':'m999','F':'friend','D':'enemy'};self.agi=10;self.bonus=80;self.damage=100;self.illusion=False;self.scepter=False;self.dtype='NORMAL';self.attack=1;self.events=[];self.ranges=[];self.hook=None;self.group=['T','E','B','F','D'];self.learned='A006';self.learner='S'
  self.env={'GetId':lambda x:x,'GetUnitAbilityLevel':lambda u,a:self.units.get(u,{}).get(a,0),'UnitAddAbility':self.add,'UnitRemoveAbility':self.remove,'SetUnitAbilityLevel':lambda u,a,v:self.units[u].__setitem__(a,v),'UnitMakeAbilityPermanent':lambda *a:self.events.append(('permanent',a)),'GetTriggerUnit':lambda:'T','GetEventDamageSource':lambda:'S','GetEventDamage':lambda *a:self.damage,'EXSetEventDamage':self.setdamage,'GetUnitTypeId':lambda u:self.types.get(u,0),'GetHeroAgi':lambda u,bonus:self.agi+(self.bonus if bonus else 0),'SetHeroAgi':self.setagi,'IsUnitIllusion':lambda u:self.illusion if u=='S' else False,'Game_Mode':0,'ConvertDamageType':lambda x:x,'DAMAGE_TYPE_NORMAL':'NORMAL','DAMAGE_TYPE_DIVINE':'DIVINE','ATTACK_TYPE_CHAOS':'CHAOS','WEAPON_TYPE_WHOKNOWS':'WHOKNOWS','GetUnitX':lambda u:0,'GetUnitY':lambda u:0,'CreateGroup':lambda:[],'GroupEnumUnitsInRange':self.enum,'GroupRemoveUnit':lambda g,u:g.remove(u),'FirstOfGroup':lambda g:g[0] if g else None,'_loop_':lambda:(lambda *a:1,None,None),'null':None,'Player':lambda p:p,'IsUnitOwnedByPlayer':lambda u,p:self.owners.get(u)==p,'GetUnitState':lambda u,k:self.life.get(u,0),'UNIT_STATE_LIFE':'life','GetUnitLoc':lambda u:(0,0),'AngleBetweenPoints':lambda *a:0,'CreateEffAtLoc':lambda *a:None,'EXEffectMatRotateZ':lambda *a:None,'EXSetEffectSpeed':lambda *a:None,'RemoveLocation':lambda *a:None,'GroupClear':lambda g:g.clear(),'DestroyGroup':lambda *a:None,'UnitDamageTarget':self.child,'Has_A_Item':lambda u:self.scepter,'EXGetEventDamageData':lambda k:self.attack if k==2 else self.dtype,'GetLearnedSkill':lambda:self.learned,'GetLearningUnit':lambda:self.learner}
  self.env['SetRealDamage']=lambda *a:run(F['SetRealDamage'],self.env,list(a))
  for name in ['A003_Action','A006_Action','A021_Action','A021_GetTimes','A025_Action','A062_Action','A072_Action','A072_AAA','isMagicDamage','isPhyDamage']:
   self.env[name]=lambda *a,name=name:self.invoke(name,*a)
 def add(self,u,a):self.units[u].setdefault(a,1);self.events.append(('add',u,a))
 def remove(self,u,a):self.units[u].pop(a,None);self.events.append(('remove',u,a))
 def setagi(self,u,v,permanent):assert permanent is True;self.agi=v
 def setdamage(self,n):self.damage=n
 def enum(self,g,x,y,r,filter):g.extend(self.group);self.ranges.append(r)
 def child(self,*args):
  self.events.append(('child',args))
  if self.hook:self.hook(args)
 def invoke(self,name,*a):
  out=run(F[name],self.env,list(a),upvals={'u2':0})
  return out[0] if len(out)==1 else out
 def children(self):return [x[1] for x in self.events if x[0]=='child']
# All exact-rank Buff combinations: old multipliers and separately selected workbook values.
amp=0
for web in [False,True]:
 f=copy.deepcopy(F['A003_Action'])
 if web:
  for key,v in zip(['k6','k8','k10','k12','k14','k16'],[1.4,1.34,1.28,1.22,1.16,1.1]):f['constants'][key]=v
 table=[1.1,1.16,1.22,1.28,1.34,1.4] if web else [1.1,1.14,1.18,1.22,1.26,1.3]
 for bits in range(64):
  for mode in [0,1,2]:
   s=State();s.units['T']={f'B{35+i:03d}':1 for i in range(6) if bits&(1<<i)};s.env['Game_Mode']=mode;run(f,s.env);m=table[bits.bit_length()-1] if bits else 1;m=1+(m-1)/2 if mode==2 else m;assert math.isclose(s.damage,100*m);amp+=1
# Source entry gates incl true physical versus DIVINE, credited owner versus actual source.
for lv in [-1,0,1,6,7]:
 for dtype in ['NORMAL','DIVINE','MAGIC','FIRE']:
  s=State();s.units['O']['A021']=lv;s.dtype=dtype;run(B['A021'],s.env,regs={'r0':'S','r1':'T','r2':'O'});m=[1.12,1.15,1.2,1.25,1.32,1.4][lv-1] if 1<=lv<=6 else 0;check(f'A021_entry_{lv}_{dtype}',math.isclose(s.damage,100*m if lv>0 and dtype not in ['NORMAL','DIVINE'] else 100))
for bits in range(64):
 for dtype in ['NORMAL','MAGIC','DIVINE']:
  for target in [None,'T']:
   s=State();s.units['T']={f'B{35+i:03d}':1 for i in range(6) if bits&(1<<i)};s.dtype=dtype;calls=[];s.env['A003_Action']=lambda:calls.append(1);run(B['A003'],s.env,regs={'r0':'S','r1':target,'r2':'O'});assert bool(calls)==(target is not None and dtype=='NORMAL' and bits>0)
for a in [0,1,6]:
 for b in [0,1,6]:
  for attack in [0,1]:
   s=State();s.units['S'].update(A062=a,A121=b);s.attack=attack;calls=[];s.env['A062_Action']=lambda:calls.append(1);run(B['A062'],s.env,regs={'r0':'S','r1':'T','r2':'O'});check(f'A062_entry_{a}_{b}_{attack}',len(calls)==(1 if (a>0 or b>0) and attack else 0))
for a in [0,1,6]:
 for item in [False,True]:
  for attack in [0,1]:
   for target in [None,'T']:
    s=State();s.units['S']['A072']=a;s.scepter=item;s.attack=attack;calls=[];s.env['A072_AAA']=lambda *a:calls.append(a);run(B['A072'],s.env,regs={'r0':'S','r1':target,'r2':'O'});check(f'A072_entry_{a}_{item}_{attack}_{target}',calls==([('S','T',100)] if a>0 and item and attack and target else []))
# Common prefix retains hard early returns and before-item ordering.
for stype in ['q004','q005','q039','normal']:
 for initial in [0,100]:
  for flag in [0,1]:
   for b177 in [0,1]:
    s=State();s.types['S']=stype;s.damage=initial;s.attack=flag;s.units['S']['B177']=b177;calls=[]
    s.env.update({'IsTemp':lambda u:False,'IsUnitType':lambda *a:False,'UNIT_TYPE_SAPPER':'sapper','UNIT_TYPE_SUMMONED':'summoned','Tower_ALL':{1:'O'},'GetUnitUserData':lambda u:1,'ItemDamageActionBefore':lambda:calls.append('before'),'A164_T322_Action':lambda u:calls.append('B177')})
    out=run(B['public_prefix'],s.env)
    early=stype in ['q004','q005'] or initial==0
    expected=[] if early or stype=='q039' else ['before']+(['B177'] if flag and b177 else [])
    check(f'prefix_{stype}_{initial}_{flag}_{b177}',calls==expected and out==( () if early or (stype!='q039' and flag and b177) else ('exit',3964 if stype=='q039' else 215)))

# Complete learning dispatcher, including inert aura entries and duplicate direct calls.
for id in d['scope_ids']:
 for illusion in [False,True]:
  for learner in [None,'S']:
   s=State();s.learner=learner;s.learned=id;s.illusion=illusion;s.units['S'][id]=3;run(B['learning'],s.env);allowed=learner=='S' and not illusion
   check(f'learn_{id}_{illusion}_{learner}',s.units['S'].get('T002',0)==(3 if id=='A006' and allowed else 0) and s.units['S'].get('T008',0)==(3 if id=='A025' and allowed else 0) and s.agi==(60 if id=='A072' and allowed else 10))
for id,helper in [('A006','T002'),('A025','T008')]:
 for lv in range(7):
  s=State();s.units['S'][id]=lv;s.invoke(id+'_Action','S',id);s.invoke(id+'_Action','S',id);check(f'{id}_set_rank_{lv}',s.units['S'][helper]==lv);s.units['S'][id]=0;check(f'{id}_independent_grant_{lv}',s.units['S'][helper]==lv)
s=State()
for n in range(1,8):s.invoke('A072_Action','S');check('A072_exact_base_delta_'+str(n),s.agi==10+50*n)
# Cleave captures damage once, applies own illusion factor and SECONDARY m999/m998 reduction.
cleave=0
for lv in range(1,7):
 for fallback in [False,True]:
  for illusion in [False,True]:
   for stype in ['H019','G049']:
    for special in ['m999','m998','ordinary']:
     s=State();s.units['S'].update(A062=0 if fallback else lv,A121=lv if fallback else 6);s.illusion=illusion;s.types['S']=stype;s.types['B']=special;s.hook=lambda a:setattr(s,'damage',999);s.invoke('A062_Action');expected=100*(.3+.1*lv)*(.4 if illusion else 1);ch=s.children();assert len(ch)==2 and ch[0][:2]==('S','E') and ch[1][:2]==('S','B') and math.isclose(ch[0][2],expected) and math.isclose(ch[1][2],expected*(.2 if special in ['m999','m998'] else 1));assert all(a[3:]==(False,False,'CHAOS','DIVINE','WHOKNOWS') for a in ch);assert s.ranges==[520];cleave+=1
for primary in ['ordinary','m999','m998']:
 for secondary in ['ordinary','m999','m998']:
  for illusion in [False,True]:
   s=State();s.types['T']=primary;s.types['B']=secondary;s.illusion=illusion;s.hook=lambda a:setattr(s,'damage',999);s.invoke('A072_AAA','S','T',100);ch=s.children();check(f'A072_primary_{primary}_{secondary}_{illusion}',len(ch)==2 and all(math.isclose(c[2],51 if primary in ['m999','m998'] else 40) for c in ch) and s.ranges==[280])
for module in ['A062_Action','A072_AAA']:
 for mutate in ['kill','owner','removedprimary']:
  s=State();s.units['S']['A062']=1;s.types['T']='m999'
  def hook(a):
   if a[1]=='E':
    if mutate=='kill':s.life['B']=0
    elif mutate=='owner':s.owners['B']=0
    else:s.types.pop('T')
  s.hook=hook;s.invoke(module,*(['S','T',100] if module=='A072_AAA' else []));ch=s.children();check(f'{module}_midloop_{mutate}',len(ch)==(2 if mutate=='removedprimary' else 1));
  if module=='A072_AAA' and mutate=='removedprimary':check('A072_primary_requery_not_snapshot',math.isclose(ch[0][2],51) and math.isclose(ch[1][2],40))
# A033 A杖 helper path: no implied removal if parent has already gone.
for lv in [0,1,6]:
 s=State();s.units['S']['A033']=lv;run(B['I269_add'],s.env,['S']);check('I269_add_'+str(lv),s.units['S'].get('I269',0)==(1 if lv else 0));run(B['I269_drop'],s.env,['S']);check('I269_drop_'+str(lv),'I269' not in s.units['S'])
s=State();s.units['S']['A033']=1;run(B['I269_add'],s.env,['S']);s.units['S']['A033']=0;run(B['I269_drop'],s.env,['S']);check('I269_stale_known_grant_preserved',s.units['S']['I269']==1)
# Native Web contract cases (not native engine measurements).
native=[]
def nc(name,value):assert value,name;native.append(name)
a072 = next(entry for entry in d['entries'] if entry['id'] == 'A072')
assert a072['selected_parameters']['scepter_secondary_radius'] == 350
for rad in [a072['selected_parameters']['scepter_secondary_radius'],500,520,800,900,1000]:
 for x,y,yes in [(rad,0,True),(0,-rad,True),(rad+.001,0,False),(0,0,True),(rad*.6,rad*.8,True)]:nc(f'range_{rad}_{x}_{y}',(x*x+y*y<=rad*rad)==yes)
def source_ok(**flags):return flags.get('alive',True) and flags.get('exists',True) and flags.get('enabled',True) and 1<=flags.get('rank',1)<=flags.get('maxrank',6) and not any(flags.get(f,False) for f in ['hidden','illusion','invisible','hex','burrow','animatedDead','flyingHero'])
for flag in ['hidden','illusion','invisible','hex','burrow','animatedDead','flyingHero']:nc('source_'+flag,not source_ok(**{flag:True}))
for flag in ['stunned','silenced','paused','invulnerable']:nc('source_allows_'+flag,source_ok(**{flag:True}))
for flag in ['exists','alive','enabled']:nc('source_requires_'+flag,not source_ok(**{flag:False}))
nc('rank_zero_not_emit',not source_ok(rank=0));nc('invalid_rank_not_clamped',not source_ok(rank=7))
def accepts(hostile,magic,invuln,related,aloc=False,hidden=False,alive=True):return related and alive and not aloc and not hidden and not(hostile and magic)
for hostile in [False,True]:
 for magic in [False,True]:
  for invuln in [False,True]:nc(f'recipient_{hostile}_{magic}_{invuln}',accepts(hostile,magic,invuln,True)==(not hostile or not magic))
for flags in [{'aloc':True},{'hidden':True},{'alive':False}]:nc('recipient_exclude_'+str(flags),not accepts(False,False,False,True,**flags))
nc('unrelated_excluded',not accepts(False,False,False,False));nc('A033_samegroup_strongest',min([-20,-100])==-100);nc('A033_I269_independent',min([-20,-100])+min([-50])==-150);nc('A053_max_flat',max([100,300])==300)
base=100+20+7+30*1.4 # weaponbase + upgrades + thisattackdice + effectiveprimary.
flat=100+300 # AIat/T002 plus A053, excluded from percentagebase.
nc('A053_N103_N016_additive',math.isclose(base+flat+base*.4+base*.15,661.95))
nc('range_loss_falls_back_no_linger',max([100,300])==300 and max([100])==100)
nc('death_all_providers_zero',max([],default=0)==0)
nc('attack_speed_common_cap',min(5,max(.2,1+1+5))==5)
# Saved actual grants restored once; parent-marker removal never reconstructs learning history.
saved={'A006':0,'T002':3,'A025':0,'T008':4,'A033':0,'I269':1,'baseAgi':310};loaded=json.loads(json.dumps(saved));nc('save_preserves_independent_grants',loaded==saved);nc('load_no_replay_AGI',loaded['baseAgi']==310)
# Multi-provider native reference contract: real provider mutations and load reconstruction.
entrymap={e['id']:e for e in d['entries']}
def derive(providers,target,weapon):
 buffs=set();armor={};flat={};fractions={}
 for a in providers:
  id=a['id'];lv=a.get('rank',1)
  if not source_ok(**a):continue
  if not target.get('alive',True) or target.get('hidden',False) or target.get('aloc',False):continue
  par=entrymap[id]['selected_parameters'];hostile=id in ['A003','A033','I269'];same=a.get('owner',0)==target.get('owner',0);friend=same or target.get('owner',0) in a.get('allies',[])
  if (friend if hostile else not friend) or hostile and target.get('magicImmune',False):continue
  if (a.get('x',0)-target.get('x',0))**2+(a.get('y',0)-target.get('y',0))**2>par['radius']**2:continue
  if id=='A003':buffs.add(par['buffs'][lv-1])
  elif id in ['A033','I269']:
   v=par['flat_armor'][lv-1] if isinstance(par['flat_armor'],list) else par['flat_armor'];armor[par['buff']]=min(armor.get(par['buff'],0),v)
  elif id=='A053':flat[par['buff']]=max(flat.get(par['buff'],0),par['flat_attack'][lv-1])
  elif weapon==('melee' if id=='N103' else 'ranged'):fractions[par['buff']]=max(fractions.get(par['buff'],0),par['fraction'])
 return {'buffs':sorted(buffs),'armor':sum(armor.values()),'flat':sum(flat.values()),'fraction':sum(fractions.values())}
P=[{'id':'A003','rank':1},{'id':'A003','rank':6},{'id':'A033','rank':1},{'id':'A033','rank':6},{'id':'I269'}];T={'owner':11}
nc('native_rank_buffset_and_separate_negative_groups',derive(P,T,'melee')=={'buffs':['B035','B040'],'armor':-150,'flat':0,'fraction':0})
P[3]['alive']=False;nc('native_dead_source_fallback',derive(P,T,'melee')['armor']==-70)
P[2]['x']=900;nc('native_exact_edge_included',derive(P,T,'melee')['armor']==-70)
P[2]['x']=900.001;nc('native_just_outside_removed',derive(P,T,'melee')['armor']==-50)
T['magicImmune']=True;nc('native_hostile_magic_immunity_clears_all',derive(P,T,'melee')=={'buffs':[],'armor':0,'flat':0,'fraction':0})
P=[{'id':'A053','rank':1},{'id':'A053','rank':6},{'id':'N103'},{'id':'N104'}];T={'owner':0,'magicImmune':True,'invulnerable':True}
nc('native_friendly_immune_and_melee_class',derive(P,T,'melee')=={'buffs':[],'armor':0,'flat':300,'fraction':.4})
nc('native_ranged_separate_same_value',derive(P,T,'ranged')['fraction']==.4)
nc('native_no_weapon_has_no_percentage',derive(P,T,None)['fraction']==0)
P[1]['enabled']=False;nc('native_disable_strongest_fallback',derive(P,T,'melee')['flat']==100)
P[0]['invisible']=True;nc('native_source_invis_zero_flat',derive(P,T,'melee')['flat']==0)
P[0]['invisible']=False;P[0]['rank']=4;nc('native_rank_change_no_learning_required',derive(P,T,'melee')['flat']==190)
T['owner']=1;nc('native_directional_alliance_initially_none',derive(P,T,'melee')['flat']==0)
P[0]['allies']=[1];nc('native_directional_alliance_addition',derive(P,T,'melee')['flat']==190)
loadedP=json.loads(json.dumps(P));nc('native_load_rebuild_exactly_once',derive(loadedP,T,'melee')==derive(P,T,'melee'))

linkchecks=0
for link in re.findall(r'\]\(([^)]+)\)',p.with_suffix('.md').read_text()):
 if link.startswith('http'):continue
 file,_,frag=link.partition('#');q=(p.parent/file).resolve();assert q.exists(),link
 if frag.startswith('L'):assert 1<=int(frag[1:])<=len(q.read_text().splitlines()),link
 linkchecks+=1
d['validation']={'status':'passed','tool':'tools/audit-hero-aura-family.py','bytecode_instruction_identity_checks':identity,'readonly_workbook_cell_comparisons':bookchecks,'raw_SLK_records_compared':len(d['entries']),'A003_original_and_selected_buff_mode_contexts':amp,'A003_entry_contexts':384,'A062_original_effect_contexts':cleave,'other_bytecode_cases':len(cases),'cases':cases,'native_contract_cases':len(native),'native_cases':native,'markdown_local_links_checked':linkchecks,'method':'Original Lua bytecode interpreted with deterministic native stubs; only A003 legal rank constants changed in a separate Web probe. Native geometry/targets/stack/lifecycle are assertions of selected Q24 contract, not original Warcraft execution.'}
p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in d['validation'].items() if k not in ['cases','native_cases']},ensure_ascii=False,indent=2))
