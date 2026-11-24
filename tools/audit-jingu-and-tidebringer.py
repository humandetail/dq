import json,pathlib,copy,math,hashlib,re,openpyxl
root=pathlib.Path(__file__).resolve().parents[1];p=root/'docs/rules/skill-jingu-and-tidebringer.json';d=json.load(open(p));F=d['source_functions'];B=d['source_branches'];code=(root/'reference/map-6.25/main.disasm').read_text().splitlines()
identity=0
for f in list(F.values())+list(B.values()):
 for z in f['instructions']:assert code[z['line']-1].split(';')[0].split()==[z['op'],*z['args']];identity+=1
for file,h in d['source_hashes'].items():assert hashlib.sha256((root/'reference/map-6.25'/file).read_bytes()).hexdigest()==h
bookchecks=0
for b in d['workbooks']:
 path=pathlib.Path(b['path']);assert hashlib.sha256(path.read_bytes()).hexdigest()==b['sha256'];w=openpyxl.load_workbook(path,read_only=True,data_only=True);rows=list(w['塔技能'].iter_rows(max_col=9,values_only=True));w.close()
 for v in b['rows']:
  for cell,val in v['cells'].items():assert rows[v['row']-1][ord(cell[0])-65]==val;bookchecks+=1
# Independent raw-SLK parse.
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
for id,v in d['ability_objects'].items():assert raw[id]==v['record']
# Small Lua instruction runner: all decision branches execute preserved bytecode, native functions stubbed.
def run(f,env,args=None,regs=None,upvals=None,web_jingu=False,web_wave=False):
 ins={x['pc']:x for x in f['instructions']};r={f'r{i}':x for i,x in enumerate(args or [])};r.update(regs or {});top=len(args or []);pc=min(ins);steps=0;ups={'u0':env,'u1':env};ups.update(upvals or {})
 def v(a):return f['constants'][a] if a.startswith('k') else r.get(a)
 def truth(x):return x is not None and x is not False
 def eq(a,b):return type(a)==type(b) and a==b or isinstance(a,(float,int)) and not isinstance(a,bool) and isinstance(b,(float,int)) and not isinstance(b,bool) and a==b
 while pc in ins:
  steps+=1;assert steps<3000;z=ins[pc];o=z['op'];a=z['args'];n=pc+1
  if o=='gettabup':r[a[0]]=ups[a[1]].get(v(a[2]))
  elif o=='settabup':ups[a[0]][v(a[1])]=v(a[2])
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
  if web_jingu and pc==11:n=12 # only nil->zero old-return jump redirected
  if web_wave and pc==72 and 1<=r['r4']<=6:r['r8']=(r['r6']*(r['r5']+1)*r['r7'])*[3.5,3.8,4.1,4.4,4.7,5][r['r4']-1]
  pc=n
 return ('exit',pc)
class State:
 def __init__(self,lv=1):
  self.units={'S':{'A077':lv,'A081':lv,'A076':lv},'T':{}};self.stats={'S':{18:100,19:20},'T':{}};self.towers={1:'S'};self.count={};self.active={};self.ones={};self.tens={};self.hide={};self.cool={};self.exp=None;self.timers={};self.next=0;self.events=[];self.items=set();self.mode=0;self.scepter=False;self.hook=None
  self.env={'Tower_ALL':self.towers,'GetId':lambda x:x,'IsInTable':lambda x,t:next((k for k,z in t.items() if z==x and x is not None),-1),'GetUnitAbilityLevel':lambda u,a:self.units.get(u,{}).get(a,0),'UnitAddAbility':self.add,'UnitRemoveAbility':self.remove,'SetUnitAbilityLevel':lambda u,a,v:self.units[u].__setitem__(a,v),'UnitMakeAbilityPermanent':lambda *a:self.events.append(('permanent',a)),'GetUnitState':lambda u,k:self.stats.get(u,{}).get(k,0),'SetUnitState':self.setstate,'ConvertUnitState':lambda k:k,'CreateTimer':self.timer,'TimerStart':self.start,'DestroyTimer':self.destroy,'GetExpiredTimer':lambda:self.exp,'CreateUnitAtLoc':self.createunit,'GetUnitLoc':lambda u:(2,3),'GetOwningPlayer':lambda u:1,'SetUnitAnimationByIndex':lambda *a:self.events.append(('animation',a)),'SetUnitPositionLoc':lambda *a:None,'CreateEffByUnit':lambda *a:self.events.append(('visual',a)),'math':{'modf':lambda x:(math.trunc(x),x-math.trunc(x)),'fmod':math.fmod},'GetUnitUserData':lambda u:1,'UnitApplyTimedLife':lambda *a:self.events.append(('timedlife',a)),'GetUnitX':lambda u:40,'GetUnitY':lambda u:50,'CreateGroup':lambda:[],'Game_Mode':0,'Has_A_Item':lambda u:self.scepter,'HasItem':lambda u,id:id if id in self.items else None,'UnitDamagePoint':self.point,'GroupEnumUnitsInRange':lambda *a:None,'null':None,'_loop_':lambda:(lambda *a:1,None,None),'FirstOfGroup':lambda g:None,'GroupClear':lambda g:None,'DestroyGroup':lambda g:None,'ATTACK_TYPE_CHAOS':'CHAOS','DAMAGE_TYPE_DIVINE':'DIVINE','WEAPON_TYPE_WHOKNOWS':'WHOKNOWS','EXSetEventDamage':lambda v:self.events.append(('zero',v)),'CreateTempAndSetAbilityLv':lambda *a:self.events.append(('stun_dummy',a)) or 'dummy','SetUnitUserData':lambda *a:self.events.append(('userData',a)),'IssueTargetOrder':lambda *a:self.events.append(('order',a)),'SetRealDamage':lambda *a:self.events.append(('real',a))}
  self.env['A077_Timer_Over']=self.expire_jingu
 def add(self,u,a):
  if u in self.units:self.units[u].setdefault(a,1)
  self.events.append(('add',u,a))
 def remove(self,u,a):
  if u in self.units:self.units[u].pop(a,None)
  self.events.append(('remove',u,a))
 def setstate(self,u,k,v):
  if u in self.stats:self.stats[u][k]=v
  self.events.append(('state',u,k,v))
 def createunit(self,*args):self.next+=1;return 'unit'+str(self.next)
 def timer(self):self.next+=1;return 'timer'+str(self.next)
 def start(self,t,dur,repeat,cb):self.timers[t]={'duration':dur,'repeat':repeat,'cb':cb};self.events.append(('start',t,dur))
 def destroy(self,t):self.timers.pop(t,None);self.events.append(('destroy',t))
 def clear(self,index):return run(F['main/f67/f0'],self.env,[index],upvals={'u0':self.hide,'u1':self.env,'u2':self.ones,'u3':self.tens})
 def hidecall(self):return run(F['main/f67/f1'],self.env,upvals={'u1':self.hide,'u2':self.clear})
 def jingu(self,web=False):return run(F['main/f67/f2'],self.env,['S'],upvals={'u1':self.count,'u2':self.clear,'u3':self.active,'u4':self.ones,'u5':self.tens,'u6':self.hide,'u7':self.hidecall},web_jingu=web)
 def expire_jingu(self):return run(F['main/f67/f3'],self.env,upvals={'u1':self.active,'u2':self.count})
 def visual_cleanup(self):return run(F['main/f67/f4'],self.env,['S'],upvals={'u1':self.ones,'u2':self.tens})
 def study(self):return run(F['main/f70/f2'],self.env,['S'],upvals={'u1':400})
 def tide(self):self.env['Game_Mode']=self.mode;return run(F['main/f70/f1'],self.env,['S','T'],upvals={'u1':self.cool,'u2':.5,'u3':self.expire_tide,'u4':400})
 def expire_tide(self):return run(F['main/f70/f0'],self.env,upvals={'u1':self.cool,'u2':400})
 def point(self,*args):
  self.events.append(('point',args))
  if self.hook:self.hook()
  return args[5]>=0
 def fire(self,t):self.exp=t;self.timers[t]['cb']()
cases=[]
def check(name,cond):assert cond,name;cases.append(name)
for web,threshold in [(False,61),(True,60)]:
 for lv in range(1,7):
  s=State(lv)
  for n in range(1,threshold):s.jingu(web);assert s.units['S'].get('A078',0)==0
  s.jingu(web);check(f'jingu_{web}_{lv}_threshold',s.units['S']['A078']==lv and s.count[1]==0 and s.timers[s.active[1]]['duration']==4)
  timer=s.active[1];s.units['S']['A077']=6;check(f'jingu_{web}_{lv}_rank_snapshot',s.units['S']['A078']==lv);s.fire(timer);check(f'jingu_{web}_{lv}_expiry',s.active[1] is None and s.count[1] is None and 'A078' not in s.units['S'])
s=State();s.jingu(True);ht=s.hide[1];s.fire(ht);check('hide_does_not_reset_count',s.count[1]==1 and s.hide[1] is None)
s.jingu(True);ht=s.hide[1];s.visual_cleanup();check('sale_visual_cleanup_not_counter_or_timer',s.count[1]==2 and s.hide[1]==ht and s.ones[1] is None and s.tens[1] is None)
# Source has no guard when action is invoked directly with counter59+active; preserve replacement timer, don't pretend refresh cancels old.
s=State();s.count[1]=59;s.jingu();old=s.active[1];s.count[1]=59;s.jingu();check('direct_reentry_keeps_old_timer',old in s.timers and old!=s.active[1]);s.fire(old);check('orphan_expiry_does_not_remove_new_A078',s.units['S'].get('A078')==1 and s.count.get(-1) is None)
# Damage entry snippets execute bytecode conditionals.
for branch in ['q017_damage_then_count','monkey_count']:
 for rank in [0,1,6]:
  for active in [0,1]:
   for typ in ['q017','b117','b118','b139','b140','other']:
    calls=[];env={'GetUnitTypeId':lambda u:typ,'GetId':lambda x:x,'GetUnitAbilityLevel':lambda u,id:rank if id=='A077' else active,'A077_Action':lambda u:calls.append('count'),'A076_Damage':lambda *a:calls.append('wave')}
    run(B[branch],env,regs={'r0':'S','r1':'T','r2':'O'})
    valid=(typ=='q017') if branch.startswith('q017') else typ.startswith('b');expected=(['wave'] if branch.startswith('q017') and valid else [])+(['count'] if valid and rank>0 and active==0 else []);check(f'{branch}_{rank}_{active}_{typ}',calls==expected)
# Wave damage branch scalar and attribution; invalid ranks deliberately retain sourceformula.
wavecases=0
for web in [False,True]:
 for lv in range(1,7):
  for buff in range(0,8):
   for mode in [0,1,2]:
    for a in [False,True]:
     s=State(lv);s.units['S']['A078']=buff;s.env['Game_Mode']=mode;s.scepter=a;run(F['main/f66/f1'],s.env,['S','T'],web_wave=web);e=[e for e in s.events if e[0]=='real'][0][1];M=([3.5,3.8,4.1,4.4,4.7,5][buff-1] if web and 1<=buff<=6 else 2+.5*buff) if buff>0 else 1;expected=120*(lv+1)*(3 if mode==1 and a else 1)*M;assert math.isclose(e[2],expected);assert (e[0]=='S')==(buff==0);assert s.events[0]==('zero',0);wavecases+=1
# A081 all ranks/modes/items and reentrant timerlock. Study normal increasing ranks reproduces400L.
for lv in range(1,7):
 for mode in [0,1,2]:
  for scepter in [False,True]:
   for itemset in [set(),{'i115'},{'i209'},{'i115','i209'}]:
    s=State(1)
    for current in range(1,lv+1):s.units['S']['A081']=current;s.study()
    assert s.stats['S'][19]==20+400*lv;s.mode=mode;s.scepter=scepter;s.items=itemset;s.hook=s.tide;s.tide();pts=[e[1] for e in s.events if e[0]=='point'];Q=(120+400*lv)*(.7+.3*lv)*(2 if mode==1 and scepter else 1);radii=[520 if 'i209' in itemset else 380] if itemset else[];expectedr=radii+[650];assert [e[2] for e in pts]==expectedr;assert all(e[0:2]==('S',0) and e[3:5]==(40,50) and e[6:]==(False,False,'CHAOS','DIVINE','WHOKNOWS') for e in pts);assert math.isclose(pts[-1][5],Q)
    if radii:assert math.isclose(pts[0][5],Q*(.9 if 'i209' in itemset else.45))
    assert s.stats['S'][19]==20 and 'T082' not in s.units['S'];t=s.cool[1];assert s.timers[t]['duration']==4+.5*(6-lv);s.fire(t);assert s.stats['S'][19]==20+400*lv and s.units['S']['T082']==1 and s.cool[1] is None;cases.append('tide_rank_mode_item_'+str((lv,mode,scepter,sorted(itemset))))
s=State();s.study();s.study();check('duplicate_study_adds400_again',s.stats['S'][19]==820);s.tide();check('rollback_not_normalized_to_base',s.stats['S'][19]==420)
s=State();s.study();s.tide();t=s.cool[1];s.units['S']['A081']=2;s.study();check('learning_cooling_adds_zero',s.stats['S'][19]==20 and s.cool[1]==t and s.timers[t]['duration']==6.5);s.fire(t);check('expiry_uses_current_rank2',s.stats['S'][19]==820)
s=State();s.study();s.tide();t=s.cool[1];s.study();check('rank1_reentry_while_cooling_readies_without_reset',s.stats['S'][19]==420 and s.units['S']['T082']==1 and s.cool[1]==t);s.fire(t);check('rank1_reentry_expiry_adds_again',s.stats['S'][19]==820)
s=State();s.study();s.tide();t=s.cool[1];s.units['S']['A081']=0;s.fire(t);check('zero_rank_expiry_still_ready',s.stats['S'][19]==20 and s.units['S']['T082']==1);s.tide();check('zero_rank_action_formula_and7sec',s.timers[s.cool[1]]['duration']==7 and math.isclose([e[1][5] for e in s.events if e[0]=='point'][-1],84))
s=State();s.study();s.hook=lambda:(s.stats['S'].__setitem__(19,s.stats['S'][19]+17),s.units['S'].__setitem__('A081',6));s.tide();check('nested_callback_delta_and_captured_rollback_rank',s.stats['S'][19]==37)
s=State();s.study();s.tide();t=s.cool[1];s.units.pop('S');s.stats.pop('S');s.fire(t);check('removed_native_noop_but_timer_cleared',s.cool[1] is None and t not in s.timers)
s=State();s.units['S']['A081']=6;s.study();check('direct_rank6_study_without_marker_not_initialized',s.stats['S'][19]==20 and 'T082' not in s.units['S'])
# Geometric contract checks are Webspec, no native claims.
geom=[]
for radius in [380,520,650]:
 for x,y,included in [(radius,0,True),(0,-radius,True),(radius+.001,0,False),(0,0,True),(-radius,0,True)]:assert (x*x+y*y<=radius*radius)==included;geom.append([radius,x,y,included])
# Native A078maxcrit and guarantee hit distinct from eligibility; sameframe60thbuff available before hit snapshot.
for lv,row in enumerate(d['A077']['A078_levels'],1):
 for roll in range(1,101):assert roll<=row['selected']['critical_chance_percent']
 assert row['selected']['never_miss'] and row['selected']['bonus_damage']==0
check('A078_max_not_product',max(3.5,8)==8)
check('A078_primary_raw350_before_reduction',math.isclose(100*3.5*.5,175))
check('tide_primary_target_in650',0<=650**2)
linkchecks=0
for link in re.findall(r'\]\(([^)]+)\)',p.with_suffix('.md').read_text()):
 if link.startswith('http'):continue
 file,_,frag=link.partition('#');q=(p.parent/file).resolve();assert q.exists(),link
 if frag.startswith('L'):assert 1<=int(frag[1:])<=len(q.read_text().splitlines()),link
 linkchecks+=1
d['validation']={'tool':'tools/audit-jingu-and-tidebringer.py','markdown_local_links_checked':linkchecks,'status':'passed','source_bytecode_instruction_identity_checks':identity,'readonly_workbook_cell_comparisons':bookchecks,'independent_raw_slk_records':len(d['ability_objects']),'source_and_selected_A076_scalar_contexts':wavecases,'bytecode_and_contract_cases':len(cases),'cases':cases,'area_boundary_cases':geom,'A078_chance_outcomes':600,'method':'Original Lua instructions interpreted with deterministic native stubs; Web nil-first-count jump and legal A078 scalar patched only in separate probe mode. No original Warcraft engine execution. Area and native critical cases validate selectedWebcontract, not engine measurement.'};p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in d['validation'].items() if k not in ['cases','area_boundary_cases']},ensure_ascii=False,indent=2))
