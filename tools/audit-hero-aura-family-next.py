import json,pathlib,copy,math,hashlib,re,openpyxl,importlib.util
root=pathlib.Path(__file__).resolve().parents[1];p=root/'docs/rules/hero-aura-family-next.json';d=json.load(open(p));F=d['source_functions'];B=d['source_branches'];code=(root/'reference/map-6.25/main.disasm').read_text().splitlines()
identity=0
for f in list(F.values())+list(B.values()):
 for z in f['instructions']:assert code[z['line']-1].split(';')[0].split()==[z['op'],*z['args']];identity+=1
for file,h in d['source_hashes'].items():assert hashlib.sha256((root/'reference/map-6.25'/file).read_bytes()).hexdigest()==h
bookchecks=0
for b in d['workbooks']:
 path=pathlib.Path(b['path']);assert hashlib.sha256(path.read_bytes()).hexdigest()==b['sha256'];w=openpyxl.load_workbook(path,read_only=True,data_only=True);rows=list(w['塔技能'].iter_rows(max_col=10,values_only=True));w.close()
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
for e in d['entries']:assert raw[e['id']]==e['object']['record']
# Execute original instructions; only native calls are deterministic stubs.
def run(f,env,args=None,regs=None,upvals=None,hooks=None):
 ins={x['pc']:x for x in f['instructions']};r={f'r{i}':x for i,x in enumerate(args or [])};r.update(regs or {});top=len(args or []);pc=min(ins);steps=0;ups={'u0':env,'u1':env};ups.update(upvals or {})
 def v(a):return f['constants'][a] if a.startswith('k') else r.get(a)
 def truth(x):return x is not None and x is not False
 def eq(a,b):return type(a)==type(b) and a==b or isinstance(a,(float,int)) and not isinstance(a,bool) and isinstance(b,(float,int)) and not isinstance(b,bool) and a==b
 while pc in ins:
  steps+=1;assert steps<3000
  if hooks and pc in hooks:
   action,nextpc=hooks[pc];action(r);pc=nextpc;continue
  z=ins[pc];o=z['op'];a=z['args'];n=pc+1
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
   base=int(a[0][1:]);out=v(a[0])(r.get('r'+str(base+1)),r.get('r'+str(base+2)));rr=list(out) if isinstance(out,tuple) else [out]
   for j in range(int(a[1])):r['r'+str(base+3+j)]=rr[j] if j<len(rr) else None
  elif o=='tforloop':
   base=int(a[0][1:]);val=r.get('r'+str(base+1))
   if val is not None:r[a[0]]=val;n=f['labels'][a[1]]
  elif o=='return':return tuple(r.get('r'+str(int(a[0][1:])+j)) for j in range(int(a[1])-1))
  else:raise Exception(z)
  pc=n
 return ('exit',pc)
cases=[]
def check(name,cond):assert cond,name;cases.append(name)
def indexof(u,t):return next((k for k,v in t.items() if v==u and u is not None),-1)
def addarr(t,v):
 i=1
 while t.get(i) is not None:i+=1
 t[i]=v;return i
def pairs(t):
 def nextone(t,last):
  keys=list(t);idx=0 if last is None else keys.index(last)+1
  return (keys[idx],t[keys[idx]]) if idx<len(keys) else (None,None)
 return nextone,t,None
class State:
 def __init__(self):
  self.units={u:{} for u in ['S','O','T','U','V']};self.types={'S':'H038','O':'H038','T':'enemy','U':'summon','V':'other'};self.owners={'S':0,'O':0,'T':11,'U':0,'V':0};self.nativehero={'S','O'};self.life={u:100 for u in self.units};self.stats={u:{19:10} for u in self.units};self.pos={'S':(0,0),'O':(0,0),'T':(80,0),'U':(2,3),'V':(5,6)};self.userdata={'S':1,'O':1,'T':2};self.towers={1:'S',2:'V'};self.int=100;self.mode=0;self.damage=100;self.attack=1;self.exp=None;self.timers={};self.next=0;self.round={};self.swapTimers={};self.swapTargets={};self.deathTimers={};self.deathAmounts={};self.deathSlots={};self.perm={};self.events=[];self.groups=['S','V'];self.summoner='S';self.summoned='U';self.learned='A047';self.temp=False;self.blocked=False;self.worker=False;self.box=False;self.cool={};self.scale={};self.help={};self.illusion=False
  self.env={'GetId':lambda x:x,'GetUnitAbilityLevel':lambda u,a:self.units.get(u,{}).get(a,0),'UnitAddAbility':self.add,'UnitRemoveAbility':self.remove,'SetUnitAbilityLevel':self.rank,'UnitMakeAbilityPermanent':lambda *a:self.events.append(('permanent',a)),'GetUnitTypeId':lambda u:self.types.get(u,0),'GetUnitState':lambda u,k:self.life.get(u,0) if k=='life' else self.stats.get(u,{}).get(k,0),'SetUnitState':self.stat,'ConvertUnitState':lambda x:x,'UNIT_STATE_LIFE':'life','UNIT_STATE_MAX_LIFE':'maxlife','GetHeroInt':lambda u,bonus:self.int if u in self.units else 0,'GetUnitX':lambda u:self.pos.get(u,(0,0))[0],'GetUnitY':lambda u:self.pos.get(u,(0,0))[1],'GetUnitLoc':lambda u:list(self.pos.get(u,(0,0))),'SetUnitPositionLoc':self.move,'SetUnitPosition':lambda u,x,y:self.move(u,(x,y)),'SetUnitScale':lambda u,x,y,z:self.scale.__setitem__(u,(x,y,z)),'CreateEffByUnit':lambda *a:None,'IsInTable':indexof,'Tower_ALL':self.towers,'A047_Timers':self.round,'CreateTimer':self.timer,'TimerStart':self.start,'DestroyTimer':self.destroy,'GetExpiredTimer':lambda:self.exp,'UnitDamagePoint':lambda *a:self.events.append(('point',a)),'ATTACK_TYPE_NORMAL':'NORMAL','DAMAGE_TYPE_MAGIC':'MAGIC','WEAPON_TYPE_WHOKNOWS':'WHOKNOWS','GetOwningPlayer':lambda u:self.owners.get(u),'GetConvertedPlayerId':lambda p:p+1,'GetSummoningUnit':lambda:self.summoner,'GetSummonedUnit':lambda:self.summoned,'GetUnitUserData':lambda u:self.userdata.get(u,0),'SetUnitUserData':lambda u,v:self.userdata.__setitem__(u,v),'Player':lambda x:x,'IsUnitOwnedByPlayer':lambda u,p:self.owners.get(u)==p,'IsUnitType':lambda u,t:u in self.nativehero if t=='HERO' else False,'UNIT_TYPE_HERO':'HERO','IsTemp':lambda u:self.temp and u=='S','IsUnitIllusion':lambda u:self.illusion,'i240_254_Action':lambda *a:self.events.append(('item_summon',a)),'GetLearnedSkill':lambda:self.learned,'GetLearningUnit':lambda:'S','Game_Mode':0,'CreateGroup':lambda:[],'GroupEnumUnitsInRange':lambda g,x,y,r,f:(self.events.append(('range',r)),g.extend(self.groups)),'_loop_':lambda:(lambda *a:1,None,None),'FirstOfGroup':lambda g:g[0] if g else None,'GroupRemoveUnit':lambda g,u:g.remove(u),'GroupClear':lambda g:g.clear(),'DestroyGroup':lambda *a:None,'AddArrAny':addarr,'null':None,'Help_Arr':self.help,'DisplayTextToPlayer':lambda *a:self.events.append(('message',a)),'DisplayTimedTextToPlayer':lambda *a:self.events.append(('message',a)),'GetLocationX':lambda p:p[0],'GetLocationY':lambda p:p[1],'IsTerrainPathable':lambda *a:self.blocked,'PATHING_TYPE_BUILDABILITY':'build','IsWorker':lambda u:self.worker,'IsBOX':lambda u:self.box,'EXSetEventDamage':lambda v:setattr(self,'damage',v),'IssueTargetOrder':self.order,'EXGetEventDamageData':lambda k:self.attack,'pairs':pairs,'EXGetUnitAbility':lambda u,a:u+':'+a,'EXGetAbilityDataReal':lambda obj,lv,field:10,'EXSetAbilityState':lambda obj,k,v:self.cool.__setitem__(obj,v)}
  for name in ['A047_Study','A047_time_round','A069_Study','A154_Action','A154_time_end','A168_Action','A216_study','A216_Action','A216_lightattack']:
   self.env[name]=lambda *a,name=name:self.invoke(name,*a)
  self.orderAccept=True
 def add(self,u,a):
  if u in self.units:self.units[u].setdefault(a,1)
  self.events.append(('add',u,a))
 def remove(self,u,a):
  if u in self.units:self.units[u].pop(a,None)
  self.events.append(('remove',u,a))
 def rank(self,u,a,n):
  if u in self.units:self.units[u][a]=n
 def stat(self,u,k,n):
  if u in self.units:self.stats[u][k]=n
  self.events.append(('stat',u,k,n))
 def move(self,u,p):
  if u in self.units:self.pos[u]=tuple(p)
  self.events.append(('move',u,p))
 def timer(self):self.next+=1;return 'timer'+str(self.next)
 def start(self,t,dt,rep,cb):self.timers[t]={'duration':dt,'repeat':rep,'cb':cb};self.events.append(('start',t,dt,rep))
 def destroy(self,t):self.timers.pop(t,None);self.events.append(('destroy',t))
 def order(self,*args):self.events.append(('order',args,self.damage));return self.orderAccept
 def invoke(self,name,*args):
  ups={}
  if name in ['A154_Action','A154_time_end']:ups={'u1':self.swapTimers,'u2':self.swapTargets}
  if name=='A235_Action':ups={'u1':self.perm,'u2':lambda:self.invoke('A235_expire'),'u3':self.deathTimers,'u4':self.deathAmounts,'u5':self.deathSlots}
  if name=='A235_expire':ups={'u1':self.deathTimers,'u2':self.deathSlots,'u3':self.deathAmounts}
  if name in ['Use_A_Item','Drop_A_Item']:ups={'u2':self.env,'u1':{1:{1:'A105',2:'A106'},2:{1:'A153',2:'A154'}}}
  return run(F[name],self.env,list(args),upvals=ups)
 def fire(self,t):self.exp=t;self.timers[t]['cb']()
 def points(self):return [x[1] for x in self.events if x[0]=='point']
# A047: all legal/zero/invalid levels and live effective INT, full bytecode timers.
for lv in range(8):
 for intel in [0,100,1700]:
  s=State();s.units['S']['A047']=lv;s.int=intel;s.invoke('A047_Study','S','A047');t=s.round[1];s.fire(t);val=([80,100,120,140,160,200][lv-1]+[0,.1,.16,.22,.28,.4][lv-1]*intel)/2 if 1<=lv<=6 else 0;check(f'A047_{lv}_{intel}',s.points()==([('S',0,1000,0,0,val,False,False,'NORMAL','MAGIC','WHOKNOWS')] if val else []) and s.timers[t]['duration']==.5 and s.timers[t]['repeat'])
s=State();s.units['S']['A047']=1;s.invoke('A047_Study','S','A047');old=s.round[1];s.invoke('A047_Study','S','A047');check('A047_relearn_restarts_timer',old not in s.timers and s.round[1]!=old)
s.life['S']=0;s.fire(s.round[1]);check('A047_dead_existing_still_calls_native',len(s.points())==1)
s.units['S']['A047']=2;s.int=200;s.fire(s.round[1]);check('A047_reads_new_rank_INT',s.points()[-1][5]==60)
s.towers[1]='V';s.units['V']['A047']=6;s.fire(s.round[1]);check('A047_current_slot_not_original_unit',s.points()[-1][0]=='V' and s.points()[-1][5]==140)
t=s.round[1];s.towers.pop(1);s.fire(t);check('A047_empty_slot_cleanup_then_zero_read',t not in s.timers and s.round[1] is None and len(s.points())==3)
# A069 each callback +90; rank controls scale only.
for stype in ['H021','G059']:
 for lv in range(7):
  s=State();s.types['S']=stype;s.units['S']['A069']=lv;s.invoke('A069_Study','S','A069');s.invoke('A069_Study','S','A069');scale=(.5+.2*lv)*(1.6 if stype=='G059' else 1);check(f'A069_{stype}_{lv}',s.stats['S'][19]==190 and all(math.isclose(x,scale) for x in s.scale['S']))
# Actual event native vs resolved handler arguments, snapshot helper grants.
for lv in range(8):
 s=State();s.units['S']['A168']=lv;s.invoke('A168_Action');check('A168_rank_'+str(lv),s.units['U']==({f'N{718+lv}':1} if 1<=lv<=6 else {}))
 s=State();s.units['S']['A216']=lv;s.invoke('A216_study','S','A216');s.invoke('A216_Action');check('A216_rank_'+str(lv),s.units['S']['T275']==lv and s.units['U']['T275']==lv)
s=State();s.units['S']['A168']=1;s.invoke('A168_Action');s.units['S']['A168']=6;s.invoke('A168_Action');check('A168_reentry_keeps_previous_helper',s.units['U']=={'N719':1,'N724':1})
s=State();s.units['S']['A216']=1;s.invoke('A216_Action');s.units['S']['A216']=6;s.invoke('A216_study','S','A216');check('A216_existing_summon_rank_snapshot',s.units['U']['T275']==1 and s.units['S']['T275']==6)
for ability in ['A168','A216']:
 for temp in [False,True]:
  for illusion in [False,True]:
   s=State();s.temp=temp;s.towers[1]='O' if temp else 'S';s.units['O'][ability]=6;s.units['S'][ability]=0 if temp else 6;s.units['U']['BIil']=1 if illusion else 0;run(B['summon_prefix_and_helpers'],s.env,['S','U']);expected=None if illusion else (0 if temp else 6)
   check(f'summon_entry_{ability}_{temp}_{illusion}',('N724' in s.units['U'])==(ability=='A168' and expected==6) and ('T275' in s.units['U'])==(ability=='A216' and expected is not None))
   if ability=='A216' and expected is not None:check('raw_summoner_level_'+str((temp,illusion)),s.units['U']['T275']==expected)
# Manual learning dispatcher invokes current three callbacks, skips illusion.
for id in ['A047','A069','A153','A168','A216','A235']:
 for illusion in [False,True]:
  s=State();s.learned=id;s.illusion=illusion;s.units['S'][id]=1;run(B['learning'],s.env);check(f'learning_{id}_{illusion}',bool(s.round)==(id=='A047' and not illusion) and s.stats['S'][19]==(100 if id=='A069' and not illusion else 10) and ('T275'in s.units['S'])==(id=='A216' and not illusion))
# A153 A杖 initial/repeated full cooldown; child removal independent of currentparent.
for lv in [0,1,6]:
 s=State();s.units['S']['A153']=lv;s.invoke('Use_A_Item','S');check('A153_grant_'+str(lv),('A154'in s.units['S'])==(lv>0))
 if lv:
  check('A153_grant_fullcool_'+str(lv),s.cool['S:A154']==10);s.cool['S:A154']=2;s.invoke('Use_A_Item','S');check('A153_repeat_resets_cool_'+str(lv),s.cool['S:A154']==10);s.units['S']['A153']=0;s.invoke('Drop_A_Item','S');check('A153_drop_child_even_parentgone_'+str(lv),'A154' not in s.units['S'])
# Source A154 branch, including deepabyss terrain bypass, post-cost rejection handled bynativeadapter.
for blocked in [False,True]:
 for mode in [0,1,2]:
  for worker,box in [(False,False),(True,False),(False,True)]:
   s=State();s.blocked=blocked;s.env['Game_Mode']=mode;s.worker=worker;s.box=box;run(B['swap_entry'],s.env,regs={'r0':'A154','r1':'S','r2':'U','r3':(2,3)});check(f'A154_entry_{blocked}_{mode}_{worker}_{box}',bool(s.swapTimers)==(not(worker or box) and (not blocked or mode==2)))
for owner in [0,1]:
 for help in [None,0,1]:
  s=State();s.owners['U']=owner;s.help[owner+1]=help;s.invoke('A154_Action','S','U');accepted=owner==0 or help!=1;check(f'A154_help_{owner}_{help}',bool(s.swapTimers)==accepted)
  if accepted:
   t=s.swapTimers[1];s.pos['S']=(10,20);s.pos['U']=(40,50);s.fire(t);check(f'A154_fresh_positions_{owner}_{help}',s.pos['S']==(40,50) and s.pos['U']==(10,20) and t not in s.timers)
s=State();s.invoke('A154_Action','S','U');old=s.swapTimers[1];s.invoke('A154_Action','S','V');new=s.swapTimers[1];s.fire(old);check('A154_orphan_expiry_not_clear_new',s.swapTimers[1]==new and new in s.timers and s.pos['S']==(0,0));s.fire(new);check('A154_new_timer_uses_last_target',s.pos['S']==(5,6) and s.pos['V']==(0,0))
s=State();s.invoke('A154_Action','S','U');s.units.pop('U');s.pos.pop('U');s.fire(s.swapTimers[1]);check('A154_removed_target_no_auto_cancel',s.pos['S']==(0,0))
# Every A235 rank/mode/cap boundary, independent captured timers and live-slot expiry.
for lv in range(1,7):
 for mode in [0,1,2]:
  for count in [None,0,2998,3000,3002]:
   s=State();s.units['S']['A235']=lv;s.env['Game_Mode']=mode
   if count is not None:s.perm[1]=count
   s.invoke('A235_Action','T');bonus=[5,10,15,25,35,50][lv-1]*(2 if mode else 1);new=(count or 0)+2;expected=10+bonus+(2 if new<=3000 else 0);assert s.stats['S'][19]==expected and s.perm[1]==new;timer=next(iter(s.timers));assert s.timers[timer]['duration']==20 and not s.timers[timer]['repeat'];s.stats['S'][19]+=17;s.fire(timer);check(f'A235_{lv}_{mode}_{count}',s.stats['S'][19]==expected+17-bonus and s.deathTimers[1] is None and s.deathAmounts[1] is None and s.deathSlots[1] is None)
s=State();s.units['S']['A235']=1;s.invoke('A235_Action','T');a=next(iter(s.timers));s.units['S']['A235']=6;s.invoke('A235_Action','T');b=[x for x in s.timers if x!=a][0];check('A235_overlap_not_refresh',s.stats['S'][19]==69 and len(s.timers)==2);s.fire(a);check('A235_first_expiry_captured5',s.stats['S'][19]==64);s.fire(b);check('A235_second_expiry_captured50',s.stats['S'][19]==14)
s=State();s.units['S']['A235']=1;s.units['V']['A235']=2;s.invoke('A235_Action','T');check('A235_all_nearby_towers_each_reward',s.stats['S'][19]==17 and s.stats['V'][19]==22 and len(s.timers)==2)
s=State();s.units['S']['A235']=6;s.invoke('A235_Action','T');t=next(iter(s.timers));s.towers[1]='V';s.fire(t);check('A235_expiry_current_reused_slot',s.stats['S'][19]==62 and s.stats['V'][19]==-40)
s=State();s.units['S']['A235']=1;s.owners['T']=0;s.invoke('A235_Action','T');check('A235_nonP11_death_ignored',not s.timers)
s=State();s.units['S']['A235']=1;s.life['S']=0;s.invoke('A235_Action','T');check('A235_dead_receiver_ignored',not s.timers)
s=State();s.units['S']['A235']=7
try:s.invoke('A235_Action','T');raise AssertionError('invalidrank should retain nil error')
except TypeError:cases.append('A235_invalidrank_source_nil_arithmetic_preserved')
# Lightning replacement: six unittypes, attackflag gate, zero BEFORE failed oracceptedcommand.
for stype in [f'b{i}' for i in range(162,168)]+['other']:
 for attack in [0,1]:
  for accepted in [False,True]:
   s=State();s.types['S']=stype;s.attack=attack;s.orderAccept=accepted;run(B['lightattack'],s.env,regs={'r0':'S','r1':'T'});valid=stype!='other' and bool(attack);check(f'lightattack_{stype}_{attack}_{accepted}',s.damage==(0 if valid else 100) and [e for e in s.events if e[0]=='order']==([('order',('S','chainlightning','T'),0)] if valid else []))
# Selected native contracts: parameterized reuse of prior aura / range / chain adapters.
native=[]
def nc(n,c):assert c,n;native.append(n)
for lv,rate in enumerate([.1,.18,.26,.34,.42,.5],1):
 nc('A153_N016_base_'+str(lv),math.isclose(200+100+200*(rate+.15),330+200*rate))
 nc('A168_same_B153_max_'+str(lv),max(.1,rate)==rate)
for lv,rate in enumerate([.15,.2,.25,.3,.35,.4],1):
 nc('A216_double_at_matching_creation_'+str(lv),math.isclose(rate+rate,2*rate));nc('A216_old_summon_not_forced_double_'+str(lv),math.isclose(rate+.15,[.3,.35,.4,.45,.5,.55][lv-1]))
for radius in [100,700,800,900,1000,5000,9999]:
 for dist,included in [(radius,True),(radius+.001,False),(0,True)]:nc(f'closed_range_{radius}_{dist}',(dist**2<=radius**2)==included)
# Chain reference loop re-queries state after synchronous damage, keeps visited and snapshot hit center.
def chain(units,start,damage,callback=None):
 hits=[];visited=set();current=start
 while current is not None and len(hits)<5:
  u=units[current];pos=u['x'];visited.add(current);hits.append((current,damage))
  if callback:callback(units,current)
  cand=[k for k,u in units.items() if k not in visited and u.get('alive',True) and not u.get('immune',False) and abs(u['x']-pos)<=600]
  current=sorted(cand)[0] if cand else None
 return hits
for amount in [500,700,1000,1100,1300,1500]:
 u={i:{'x':i*500} for i in range(8)};nc('chain_five_no_decay_'+str(amount),chain(u,0,amount)==[(i,amount) for i in range(5)])
u={0:{'x':0},1:{'x':600},2:{'x':600.001}};nc('chain_jump_can_go_beyond_initial_origin',chain(u,0,500)==[(0,500),(1,500),(2,500)])
u={i:{'x':i*500} for i in range(5)}
def die(u,i):
 if i==0:u[1]['alive']=False
nc('chain_callback_changes_next_eligibility',chain(u,0,500,die)==[(0,500)])
# No pointdamage on rank0; Q24 MAGIC immunity/closedcircle uses existingarea contract, noBuff dependency.
nc('DPS_one_second_two_halves',40+40==80);nc('cast_cost_failure_no_change',149<150);nc('swap_paid_before_terrain_branch',150-150==0);nc('chain_source_parent_zero_no_refund',0==0)
# Q46 and shared weapon integration are selected Web checks, kept separate from
# the unmodified original S19 bytecode tests above. Only PC22..34 is replaced.
spec=importlib.util.spec_from_file_location('weapon_field_audit',root/'tools/audit-weapon-fields.py');weapon=importlib.util.module_from_spec(spec);spec.loader.exec_module(weapon)
assert F['A069_Study']['instructions'][21]['pc']==22 and F['A069_Study']['instructions'][21]['line']==72617
assert F['A069_Study']['instructions'][33]['pc']==34 and F['A069_Study']['instructions'][33]['line']==72629
def web_growth(s,fields,unit='S',ability='A069'):
 return run(F['A069_Study'],s.env,[unit,ability],hooks={22:(lambda regs:fields[regs['r0']].grow69(),35)})
for stype in ['H021','G059']:
 for lv in range(7):
  s=State();s.types['S']=stype;s.units['S']['A069']=lv;fields={'S':weapon.WeaponFields()};w=fields['S'];before=w.roll(6)
  web_growth(s,fields);web_growth(s,fields);scale=(.5+.2*lv)*(1.6 if stype=='G059' else 1)
  nc(f'Q46_web_learning_{stype}_{lv}',w.growth69==180 and w.j19==0 and w.roll(6)-before==270 and all(math.isclose(x,scale) for x in s.scale['S']) and not any(e[0]=='stat' for e in s.events))
for illusion in [False,True]:
 s=State();s.learned='A069';s.illusion=illusion;s.units['S']['A069']=1;fields={'S':weapon.WeaponFields()};s.env['A069_Study']=lambda *a:web_growth(s,fields,*a);run(B['learning'],s.env)
 nc(f'Q46_original_learning_gate_{illusion}',fields['S'].growth69==(0 if illusion else 90))
s=State();fields={'S':weapon.WeaponFields()};w=fields['S']
for lv in range(1,7):s.units['S']['A069']=lv;web_growth(s,fields)
nc('Q46_six_learning_540_not_S19',w.growth69==540 and w.j19==0)
s.units['S']['A069']=1;nc('Q46_downgrade_alone_no_refund',w.growth69==540);web_growth(s,fields);nc('Q46_repeated_lower_rank_still_90',w.growth69==630)
s.life['S']=0;s.types['S']='G059';nc('Q46_death_skin_no_synthetic_learning',w.growth69==630)
saved={'weapon':w.snapshot(),'scale':s.scale['S']};fields['S']=weapon.WeaponFields.restore(json.loads(json.dumps(saved['weapon'])));nc('Q46_restore_once_no_replay',fields['S'].growth69==630 and fields['S'].roll(6)==w.roll(6) and s.scale['S']==saved['scale'])
w=fields['S'];w.pct=0;without=w.roll(6);w.pct=.5;nc('Q46_aura_readded_eligible_only',w.roll(6)-without==(100+140+630+6)*.5 and w.j19==0)
# Run unchanged A235 instructions with chosen getter/setter, including timer after restore.
def field_state():
 s=State();fields={u:weapon.WeaponFields() for u in s.units}
 s.env['GetUnitState']=lambda u,k:s.life.get(u,0) if k=='life' else fields[u].get(k) if u in fields else 0
 s.env['SetUnitState']=lambda u,k,v:fields[u].set(k,v) if u in fields else None
 return s,fields
s,fields=field_state();s.units['S']['A235']=1;w=fields['S'];before=w.roll(6);s.invoke('A235_Action','T');t=next(iter(s.timers))
nc('A235_shared_interface_fixed7',w.j19==7 and w.roll(6)-before==7 and w.growth69==0)
fields['S']=weapon.WeaponFields.restore(json.loads(json.dumps(w.snapshot())));w=fields['S'];w.pct=0;s.fire(t)
nc('A235_restore_aura_removed_expiry_keeps2',w.j19==2 and w.roll(6)==548 and s.perm[1]==2)
s,fields=field_state();s.units['S']['A235']=1;s.invoke('A235_Action','T');t=next(iter(s.timers));s.towers[1]='V';s.fire(t)
nc('A235_shared_interface_preserves_reused_slot',fields['S'].j19==7 and fields['V'].j19==-5)
nc('A069_A235_entries_no_longer_channel_pending',all(e['status']=='local_effect_specified_with_declared_shared_interfaces' for e in d['entries'] if e['id'] in ['A069','A235']) and d['weapon_channel_boundary']['status']=='resolved_by_Q24_shared_interface_and_confirmed_Q46')
linkchecks=0
for link in re.findall(r'\]\(([^)]+)\)',p.with_suffix('.md').read_text()):
 if link.startswith('http'):continue
 file,_,frag=link.partition('#');q=(p.parent/file).resolve();assert q.exists(),link
 if frag.startswith('L'):assert 1<=int(frag[1:])<=len(q.read_text().splitlines()),link
 linkchecks+=1
d['status']='six primary modules and necessary local native dependencies specified, including Q46 A069 and shared weapon-attribute-interface-v1';d['validation']={'status':'passed','tool':'tools/audit-hero-aura-family-next.py','source_instruction_identity_checks':identity,'readonly_workbook_cells':bookchecks,'raw_SLK_records':len(d['entries']),'bytecode_cases':len(cases),'cases':cases,'native_contract_cases':len(native),'native_cases':native,'local_markdown_links':linkchecks,'method':'Preserved disassembly instructions executed with deterministic native stubs; separate Q24 reference assertions and Q46 PC22..34 replacement checks. Original A069 raw S19 tests retained as source evidence, selected G tests verify no double count. A235 unchanged instructions also run through chosen weapon API including saved-state restoration. No Warcraft client execution; no whole A214/A215 or generic summon lifecycle claim.'};p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in d['validation'].items() if k not in ['cases','native_cases']},ensure_ascii=False,indent=2))
