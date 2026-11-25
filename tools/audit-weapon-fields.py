"""Source inventory and weapon-attribute-interface-v1 reference checks.

This is an audit reference model, not game implementation or original-client evidence.
"""
import ast, collections, hashlib, json, math, pathlib, re, struct
from fractions import Fraction

ROOT=pathlib.Path(__file__).resolve().parents[1]
REF=ROOT/'reference/map-6.25'
OUT=ROOT/'docs/rules/weapon-field-source-notes.json'

class WeaponFieldRangeError(ValueError):pass

def f32(value):
 try:return struct.unpack('<f',struct.pack('<f',value))[0]
 except OverflowError:return math.copysign(math.inf,value)

def checked_i32(value):
 value=math.trunc(value)
 if not -(2**31)<=value<2**31:raise WeaponFieldRangeError('weapon API integer outside signed int32')
 return value

def setter_integer(value):
 value=f32(value)
 if not math.isfinite(value):raise WeaponFieldRangeError('nonfinite weapon setter input')
 return checked_i32(value)

class WeaponFields:
 """Exact local channel arithmetic avoids residual-cancellation readback errors.

 Input floats are represented exactly as supplied; no rounding of previous Lua
 arithmetic or change to the later damage pipeline is implied.
 """
 channels=('base','primary','flat','pct','j18','j19','growth69')
 def __setattr__(self,key,value):object.__setattr__(self,key,Fraction(value) if key in self.channels else value)
 def __init__(self,base=100,primary=140,flat=300,pct=.5,dice=2,sides=5):
  self.base=Fraction(base);self.primary=Fraction(primary);self.flat=Fraction(flat);self.pct=Fraction(pct)
  self.j18=Fraction(0);self.j19=Fraction(0);self.growth69=Fraction(0);self.dice=dice;self.sides=sides;self.exists=True
 def x(self):return self.base+self.primary+self.j18+self.growth69
 def mean(self):return Fraction(self.dice*(self.sides+1),2)
 def y(self):return self.flat+self.pct*(self.x()+self.mean())
 def get(self,state):
  if not self.exists:return 0.
  if state in [16,17]:return f32(checked_i32(self.dice if state==16 else self.sides))
  if state==18:return f32(checked_i32(self.x()))
  if state==19:return f32(checked_i32(self.y()+self.j19))
  if state in [20,21]:return f32(checked_i32(checked_i32(self.x())+checked_i32(self.y()+self.j19)+self.dice*(1 if state==20 else self.sides)))
  raise ValueError('state outside scoped weapon interface')
 def set(self,state,value):
  if not self.exists:return
  if state not in [18,19]:raise ValueError('setter outside used map interface')
  target=setter_integer(value) # reject before mutation; original SetUnitState is void
  if state==18:self.j18=Fraction(target)-(self.base+self.primary+self.growth69)
  else:self.j19=Fraction(target)-self.y()
 def grow69(self):
  if self.exists:self.growth69+=90 # Q46 replaces, rather than supplements, this skill's S19 write
 def roll(self,dice_sum):return float((self.x()+dice_sum)*(1+self.pct)+self.flat+self.j19)
 def snapshot(self):
  return {'channels':{k:[Fraction(getattr(self,k)).numerator,Fraction(getattr(self,k)).denominator] for k in self.channels},'dice':self.dice,'sides':self.sides,'exists':self.exists}
 @classmethod
 def restore(cls,data):
  result=cls(dice=data['dice'],sides=data['sides']);result.exists=data['exists']
  for key,pair in data['channels'].items():setattr(result,key,Fraction(*pair))
  return result

def parse():
 lines=(REF/'main.disasm').read_text().splitlines();starts=[i for i,l in enumerate(lines) if l.startswith('.function')];functions={}
 for ix,a in enumerate(starts):
  b=starts[ix+1] if ix+1<len(starts) else len(lines);name=lines[a].split()[1];f={'function':name,'lines':[a+1,b],'constants':{},'instructions':[],'labels':{},'upvalues':[]}
  for n in range(a,b):
   l=lines[n].strip()
   if l.startswith('.constant'):
    _,k,v=l.split(None,2)
    if v.startswith('L"'):v=v[1:]
    if v in ['nil','true','false']:value={'nil':None,'true':True,'false':False}[v]
    else:value=ast.literal_eval(v)
    if isinstance(value,str):
     try:value=value.encode('latin1').decode('utf8')
     except (UnicodeError,UnicodeEncodeError):pass
    f['constants'][k]=value
   elif l.startswith('.upvalue'):f['upvalues'].append(l.split()[1:])
   elif l.startswith('.label'):f['labels'][l.split()[1]]=len(f['instructions'])+1
   elif l and not l.startswith('.'):
    op,*args=l.split(';')[0].split();f['instructions'].append({'pc':len(f['instructions'])+1,'line':n+1,'op':op,'args':args})
  functions[name]=f
 return lines,functions

def excerpt(f,start,end):
 ins=[i for i in f['instructions'] if start<=i['pc']<=end];keys={a for i in ins for a in i['args'] if a.startswith('k')};labels={a for i in ins for a in i['args'] if a.startswith('l')}
 return {'function':f['function'],'pcs':[start,end],'constants':{k:f['constants'][k] for k in keys},'labels':{k:f['labels'][k] for k in labels},'instructions':ins}

def back_value(f,pc,arg):
 if arg.startswith('k'):return ('constant',f['constants'][arg])
 for q in reversed(f['instructions'][:pc-1]):
  op,a=q['op'],q['args']
  if op in ['settable','settabup','setupval','eq','lt','le','test','jmp','return']:continue
  if a and a[0]==arg:
   if op=='loadk':return ('constant',f['constants'][a[1]])
   if op=='closure':return ('closure',f['function']+'/'+a[1])
   if op=='move':return back_value(f,q['pc'],a[1])
   return None
 return None

def collect():
 lines,functions=parse();names={};closures={};sites=[];converts=[]
 for name,f in functions.items():
  ins=f['instructions'];k=f['constants']
  for j,z in enumerate(ins):
   if z['op']=='closure':closures[name+'/'+z['args'][1]]={'parent':name,'register':z['args'][0],'line':z['line'],'pc':z['pc']}
   if z['op']=='settabup':
    key=back_value(f,z['pc'],z['args'][1]);value=back_value(f,z['pc'],z['args'][2])
    if key and value and key[0]=='constant' and value[0]=='closure':names[value[1]]=key[1]
   if z['op']=='gettabup' and k.get(z['args'][-1])=='ConvertUnitState':
    following=ins[j+1];assert following['op']=='loadk',(name,z)
    state=k[following['args'][1]];converts.append({'function':name,'line':z['line'],'state':state})
    if state not in range(16,22):continue
    load=next(q for q in reversed(ins[:j+1]) if q['op']=='gettabup' and k.get(q['args'][-1]) in ['GetUnitState','SetUnitState'])
    register=load['args'][0];call=next(q for q in ins[j+2:] if q['op']=='call' and q['args'][0]==register)
    sites.append({'function':name,'operation':k[load['args'][-1]],'state':state,'load_line':load['line'],'state_line':following['line'],'call_line':call['line'],'load_pc':load['pc'],'call_pc':call['pc'],'slice':excerpt(f,load['pc'],call['pc'])})
 lua=(REF/'main.readable.lua').read_text().splitlines();module='prelude';other=[]
 for n,l in enumerate(lua):
  m=re.match(r'^L\d+_1 = "(scripts\.[^"]+)"',l)
  if m:module=m[1]
  if '= ConvertUnitState' in l:
   m=re.search(r'= (16|17|18|19|20|21)$',lua[n+1])
   if m:
    a=next(j for j in range(n,-1,-1) if re.search(r'= (Get|Set)UnitState$',lua[j]));other.append({'state':int(m[1]),'operation':lua[a].split('=')[-1].strip(),'module':module,'load_line':a+1,'state_line':n+2})
 assert len(sites)==len(other)==80
 for s,l in zip(sites,other):assert (s['state'],s['operation'])==(l['state'],l['operation']);s['readable']=l;s['public_symbol']=names.get(s['function'])
 selected={s['function'] for s in sites};public={names[f]:f for f in selected if f in names};refs=[]
 for name,f in functions.items():
  for z in f['instructions']:
   key=back_value(f,z['pc'],z['args'][-1]) if z['op']=='gettabup' else None
   if key and key[0]=='constant' and key[1] in public:
    symbol=key[1];r=z['args'][0];after=f['instructions'][z['pc']:]
    call=next((q for q in after if q['op']=='call' and q['args'][0]==r),None)
    # A load may be a TimerStart callback argument, not a direct call. Preserve exact local slice.
    nextcall=next((q for q in after if q['op']=='call'),None)
    refs.append({'callee':public[symbol],'symbol':symbol,'reader_function':name,'line':z['line'],'kind':'global_function_value_reference','direct_call_selected_line':call['line'] if call and nextcall==call else None,'slice':excerpt(f,max(1,z['pc']-15),min(len(f['instructions']),z['pc']+15))})
 # Local callback entry: preserve enclosing factory and all sibling upvalue bindings,
 # rather than declaring an unproven transitive caller from a similar function name.
 parents={n.rsplit('/',1)[0] for n in selected};factories={n:functions[n] for n in parents};bindings={n:{'closure':closures.get(n),'upvalues':functions[n]['upvalues']} for n in functions if n.rsplit('/',1)[0] in parents}
 localrefs=[]
 for caller,f in functions.items():
  info=closures.get(caller)
  if not info:continue
  for z in f['instructions']:
   if z['op']!='getupval':continue
   ui=int(z['args'][1][1:]);up=f['upvalues'][ui]
   if up[2]!='true':continue
   v=back_value(functions[info['parent']],info['pc'],'r'+up[1])
   if v and v[0]=='closure' and v[1] in selected:localrefs.append({'callee':v[1],'reader_function':caller,'line':z['line'],'kind':'captured_local_function_value','binding_creation':info,'upvalue':up,'slice':excerpt(f,max(1,z['pc']-12),min(len(f['instructions']),z['pc']+18))})
 counts=collections.Counter((s['state'],s['operation']) for s in sites)
 inventory={'coverage':{'all_literal_ConvertUnitState_loads':len(converts),'dynamic_conversion_arguments':0,'weapon_field_references':len(sites),'weapon_field_functions':len(selected),'reads':sum(s['operation']=='GetUnitState' for s in sites),'writes':sum(s['operation']=='SetUnitState' for s in sites),'by_state':{str(n):{'reads':counts[(n,'GetUnitState')],'writes':counts[(n,'SetUnitState')]} for n in range(16,22)},'named_reference_sites':len(refs),'local_captured_reference_sites':len(localrefs),'directness_limit':'Global value references include callback passing; local closure/upvalue bindings and factories preserved. This is a complete literal main.disasm/main.readable inventory, not proof about external binary calls or every skill lifecycle.'},'sites':sites,'functions':{n:functions[n] for n in selected},'function_symbols':{n:names.get(n) for n in selected},'factory_functions':factories,'local_bindings':bindings,'public_entry_references':refs,'local_entry_references':localrefs,'all_state_conversions':converts}
 return inventory

def validate_contract():
 # Chosen Q24 API adapter and Q46 exception; original native facts remain separate.
 cases=[]
 def eq(name,actual,expected):assert actual==expected,(name,actual,expected);cases.append({'case':name,'actual':actual,'expected':expected})
 signed_trunc=setter_integer
 for v,want in [(0,0),(1.9,1),(-1.9,-1),(90.9,90),(-.9,0),(16777217,16777216)]:eq('selected_binary32_then_signed_trunc_'+str(v),signed_trunc(v),want)
 for v in [float('nan'),float('inf'),2**31,-2**31-256]:
  try:signed_trunc(v);raise AssertionError('invalid accepted')
  except ValueError:cases.append({'case':'selected_reject_'+str(v),'expected':'reject no mutation'})
 # The final integer getter is cast to float before crossing the JASS bridge.
 for internal,want in [(16777215,16777215.),(16777217,16777216.),(16777219,16777220.),(-16777217,-16777216.),(2147483647,2147483648.)]:eq('getter_binary32_'+str(internal),f32(internal),want)
 eq('getter_internal_sum_before_conversion',f32(16777217+1),16777218.)
 eq('getter_public_parts_are_not_internal_sum',f32(f32(16777217)+f32(1)),16777216.)
 # Fixed extension formula, with caller arithmetic retained independently of any combat roll.
 for base,bonus,dice,sides in [(100,50,1,10),(0,0,0,0),(-4,2,2,3),(100,25,3,6)]:
  mn=base+bonus+dice;mx=base+bonus+dice*sides
  eq('native_mean_difference_'+str((base,bonus,dice,sides)),(mn+mx)/2-(base+bonus),dice*(sides+1)/2)
 # Preserve setter boundary: fractional reward captured for later removal need not net to zero.
 raw=100;captured=13.6;raw=signed_trunc(raw+captured);raw=signed_trunc(raw-captured);eq('selected_source_add_then_sub_drift',raw,99)
 # Preserve source S19 comparison, separately from the selected A069-only override.
 def weapon(base,primary,dice,flat,j19,pct,amplify19=False):
  eligible=base+primary+dice+(j19 if amplify19 else 0)
  return eligible*(1+pct)+flat+(0 if amplify19 else j19)
 eq('source_A069_plain_S19_comparison',weapon(100,140,6,300,90,.5),759)
 eq('Q46_amplified_formula',weapon(100,140,6,300,90,.5,True),804)
 eq('selected_no_percent_compounding',weapon(100,140,6,300,90,.4+.15),771.3)
 # Selected API view: fixed expected dice for deterministic S19 reads, actual dice for damage.
 base=240;flat=300;mean=5.5;pct=.5
 view=math.trunc(flat+(base+mean)*pct);eq('selected_mean_bonus_view',view,422)
 eq('selected_actual_roll_1',weapon(100,140,1,300,0,.5),661.5)
 eq('selected_actual_roll_10',weapon(100,140,10,300,0,.5),675)
 Candidate=WeaponFields
 u=Candidate();eq('selected_initial_raw_api',(u.get(18),u.get(19)),(240,423));u.set(19,u.get(19)+90);eq('source_A069_S19_comparison',(u.get(19),u.roll(6)),(513,759.))
 u.primary+=14;eq('selected_attribute_recompute_preserves_J19',(u.get(18),u.get(19),u.j19,u.roll(6)),(254,520,90.,780.))
 u.pct=0;eq('selected_aura_removed_preserves_J19',(u.get(19),u.roll(6)),(390,650.));u.flat=0;eq('selected_flat_removed_preserves_J19',(u.get(19),u.roll(6)),(90,350.))
 u=Candidate();u.set(18,100.9);eq('selected_Set18_absolute',(u.get(18),u.j18,u.roll(6)),(100,-140.,459.));u.primary+=14;eq('selected_later_attribute_preserves_J18',(u.get(18),u.j18),(114,-140.))
 for value in [-1.9,-.9,0.,.9,1.9]:
  u=Candidate(dice=1,sides=10);u.set(19,value);eq('selected_Set19_readback_'+str(value),u.get(19),signed_trunc(value))
 u=Candidate();u.base=16777217;u.primary=0;u.flat=0;u.pct=0;eq('selected_large_raw_weapon_not_api_view',(u.get(18),u.roll(0)),(16777216.,16777217.))
 # Accepted Q46 replaces only A069's setter. No J19 write and no replay on load.
 u=WeaponFields();before=u.roll(6);u.grow69();eq('Q46_one_learning_delta',(u.growth69,u.j19,u.roll(6)-before,u.get(18),u.get(19)),(90,0,135.,330.,468.))
 u.pct=0;eq('Q46_aura_removed',(u.growth69,u.j19,u.roll(6)),(90,0,636.))
 u.pct=Fraction(1,2);eq('Q46_aura_restored',u.roll(6),804.)
 for _ in range(5):u.grow69()
 eq('Q46_six_actual_learning',(u.growth69,u.j19,u.roll(6)),(540,0,1479.))
 u.grow69();eq('Q46_repeat_not_clamped_or_refunded',u.growth69,630)
 saved=json.loads(json.dumps(u.snapshot()));v=WeaponFields.restore(saved);eq('Q46_restore_no_replay',(v.snapshot(),v.roll(6)),(u.snapshot(),u.roll(6)))
 v.pct=Fraction(1,4);eq('Q46_restored_aura_changes_once',v.roll(6),1395.)
 # Other setters still operate at their original API boundary, not by effect bookkeeping.
 u=WeaponFields();u.grow69();u.set(18,100);eq('Q46_explicit_Set18_still_absolute',(u.get(18),u.growth69,u.j18),(100.,90,-230))
 u.grow69();eq('Q46_next_learning_after_absolute_set',u.get(18),190.)
 u=WeaponFields();before=u.roll(6);u.set(19,u.get(19)+7);eq('A235_fixed_gain_with_aura',(u.j19,u.roll(6)-before),(7,7.))
 u.pct=0;before=u.roll(6);u.set(19,u.get(19)-5);eq('A235_fixed_expiry_after_aura_change',(u.j19,u.roll(6)-before),(2,-5.))
 # Invalid setters leave every stored channel unchanged; valid internal int32 need not roundtrip.
 for value in [float('nan'),float('inf'),2**31,-2**31-256,1e100]:
  u=WeaponFields();snapshot=u.snapshot()
  try:u.set(19,value);raise AssertionError('invalid accepted')
  except WeaponFieldRangeError:eq('rejected_write_unchanged_'+str(value),u.snapshot(),snapshot)
 u=WeaponFields(base=2147483647,primary=0,flat=0,pct=0,dice=0,sides=0);eq('max_int_getter_returns_rounded_outside_int',u.get(18),2147483648.)
 try:u.set(18,u.get(18));raise AssertionError('rounded out-of-domain accepted')
 except WeaponFieldRangeError:eq('max_int_writeback_rejected',u.base,2147483647)
 u=WeaponFields(base=16777217,primary=0,flat=1,pct=0,dice=0,sides=0);eq('selected_min_uses_internal_slots',u.get(20),16777218.)
 u=WeaponFields(base=2147483647,primary=0,flat=1,pct=0,dice=0,sides=0)
 try:u.get(20);raise AssertionError('overflow wrapped')
 except WeaponFieldRangeError:eq('min_overflow_error_not_packet_rewrite',u.roll(0),2147483648.)
 u=WeaponFields();u.exists=False;snapshot=u.snapshot();u.set(19,float('nan'));u.grow69();eq('invalid_handle_first_noop',(u.get(18),u.snapshot()),(0.,snapshot))
 for pct in [.1,.3,1/3]:
  for target in [-1,0,1]:
   u=WeaponFields(pct=pct,dice=1,sides=10);u.set(19,target);eq('exact_residual_readback_'+str((pct,target)),u.get(19),float(target))
 return cases

def main():
 d=json.loads(OUT.read_text())
 assert d['rule_id']=='weapon-attribute-interface-v1' and d['web_contract']['status']=='adopted_under_Q24'
 assert d['A069_decision']['status']=='confirmed' and d['A069_decision']['selected']=='amplified_A069_only'
 inventory=collect();d['inventory']=inventory;d['source_hashes']={f:hashlib.sha256((REF/f).read_bytes()).hexdigest() for f in ['main.disasm','main.readable.lua','war3map.j','war3mapMisc.txt','units_unitweapons.json','war3map.w3u.json']}
 mods=[(r['old'],m) for r in json.loads((REF/'war3map.w3u.json').read_text()) for m in r['mods'] if m['key'] in ['ua1b','ua1d','ua1s','ua2b','ua2d','ua2s']];assert not mods
 instructions=sum(len(s['slice']['instructions']) for s in inventory['sites']);cases=validate_contract();refs=inventory['public_entry_references']+inventory['local_entry_references'];assert all(any(r['callee']==f for r in refs) for f in inventory['functions'])
 links=0;md=OUT.with_suffix('.md')
 if md.exists():
  for link in re.findall(r'\]\(([^)]+)\)',md.read_text()):
   if link.startswith('http'):continue
   file,_,frag=link.partition('#');q=(md.parent/file).resolve();assert q.exists(),link
   if frag.startswith('L'):assert 1<=int(frag[1:])<=len(q.read_text().splitlines()),link
   links+=1
 d['validation']={'status':'passed','tool':'tools/audit-weapon-fields.py','readable_disassembly_sites_compared':80,'native_call_slice_instructions_checked':instructions,'selected_contract_and_fixed_formula_cases':len(cases),'cases':cases,'w3u_weapon_base_dice_sides_overrides':0,'functions_with_incoming_reference':len(inventory['functions']),'local_links_checked':links,'source_instruction_identity':'slices constructed from exact original instructions, every conversion and caller position verified','not_claimed':'No original client tests; selected Q24 arithmetic and Q46 reference checks are not native behavior measurements.'}
 # JSON case payloads expose exact rational channels without converting them to lossy decimals.
 for case in cases:
  for key in ['actual','expected']:
   if key in case:case[key]=json.loads(json.dumps(case[key],default=lambda x:{'numerator':x.numerator,'denominator':x.denominator} if isinstance(x,Fraction) else str(x)))
 OUT.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'coverage':inventory['coverage'],'validation':{k:v for k,v in d['validation'].items() if k!='cases'}},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
