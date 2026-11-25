#!/usr/bin/env python3
"""Index one Warcraft Lua dispatcher. Reads evidence only; does not run game code."""
import re,json,ast,hashlib
from pathlib import Path
from collections import Counter,defaultdict
root=Path(__file__).resolve().parents[1]; path=root/'reference/map-6.25/main.disasm'; lines=path.read_text().splitlines(); start=lines.index('.function\tmain/f291/f1');end=start+1
while end<len(lines) and not lines[end].startswith('.function'):end+=1
const={};ins=[];labels={}
for n in range(start,end):
 l=lines[n].strip()
 if not l:continue
 if l.startswith('.constant'):
  _,k,value=l.split(None,2)
  if value in ['nil','true','false']:v={'nil':None,'true':True,'false':False}[value]
  else:v=ast.literal_eval(value)
  if isinstance(v,str):
   try:v=v.encode('latin1').decode('utf8')
   except (ValueError,UnicodeError):pass
  const[k]=v
 elif l.startswith('.label'):
  lab=l.split()[1];labels[lab]=len(ins)+1;assert lab=='l'+str(len(ins)+1),(lab,len(ins)+1)
 elif not l.startswith('.'):
  bits=l.split(';')[0].split();ins.append({'pc':len(ins)+1,'line':n+1,'op':bits[0],'args':bits[1:],'raw':l.split(';')[0].strip()})
assert len(ins)==4278
leaders={1};pred=defaultdict(list)
for x in ins:
 pc=x['pc'];op=x['op'];a=x['args'];succ=[]
 if op=='jmp' or op=='forprep':succ=[labels[a[-1]]]
 elif op in ['eq','lt','le','test']:succ=[pc+1,pc+2]
 elif op=='forloop':succ=[labels[a[-1]],pc+1]
 elif op=='loadbool' and a[-1]=='1':succ=[pc+2]
 elif op!='return':succ=[pc+1]
 x['successors']=succ
 for p in succ:assert 1<=p<=len(ins);pred[p].append(pc)
 if op in ['jmp','forprep','forloop','eq','lt','le','test','return'] or (op=='loadbool' and a[-1]=='1'):
  leaders.update(succ)
  if pc<len(ins):leaders.add(pc+1)
leaders.update(labels.values());ls=sorted(leaders);blocks=[];calls=[];conditions=[];text=[]
def lit(v):
 if v is None:return 'nil'
 if v is True:return 'true'
 if v is False:return 'false'
 return json.dumps(v,ensure_ascii=False)
def globalname(prefix,key):
 try:k=json.loads(key)
 except:k=None
 if isinstance(k,str):return ('' if prefix=='_ENV' else prefix+'.')+k
 return prefix+'['+key+']'
for bi,a in enumerate(ls):
 b=ls[bi+1]-1 if bi+1<len(ls) else len(ins);reg={};top=None;stm=[];bc=[]
 def val(k):
  if k.startswith('k'):return lit(const[k])
  if k.startswith('r'):return reg.get(k,k)
  return k
 def put(k,v):reg[k]=v
 for x in ins[a-1:b]:
  pc=x['pc'];op=x['op'];args=x['args'];note=None
  if op=='loadk':put(args[0],val(args[1]))
  elif op=='loadbool':put(args[0], 'true' if args[1]=='1' else 'false')
  elif op=='loadnil':
   for i in range(int(args[0][1:]),int(args[0][1:])+int(args[1])+1):put('r'+str(i),'nil')
  elif op=='move':put(args[0],val(args[1]))
  elif op=='gettabup':put(args[0],globalname({'u0':'_ENV','u1':'japi','u2':'negativeArmorCorrection'}.get(args[1],args[1]),val(args[2])))
  elif op=='getupval':put(args[0],{'u2':'negativeArmorCorrection'}.get(args[1],args[1]))
  elif op=='gettable':put(args[0],val(args[1])+'['+val(args[2])+']')
  elif op in ['add','sub','mul','div']:
   put(args[0],'('+val(args[1])+' '+{'add':'+','sub':'-','mul':'*','div':'/'}[op]+' '+val(args[2])+')')
  elif op=='len':put(args[0],'#'+val(args[1]))
  elif op=='newtable':put(args[0],'{}')
  elif op=='settabup':note=globalname({'u0':'_ENV','u1':'japi'}.get(args[0],args[0]),val(args[1]))+' := '+val(args[2])
  elif op=='settable':note=val(args[0])+'['+val(args[1])+'] := '+val(args[2])
  elif op=='setlist':note='SETLIST '+str(args)+' (retain raw variable-result semantics)'
  elif op=='call':
   r=int(args[0][1:]);B=int(args[1]);C=int(args[2]);f=val(args[0]);argv=[];openfrom=None
   if B:argv=[val('r'+str(i)) for i in range(r+1,r+B)]
   elif top:
    argv=[val('r'+str(i)) for i in range(r+1,top[0])]+['...RET@'+str(top[1])];openfrom=top[1]
   else:argv=['OPEN_TOP'];openfrom='unresolved_cross_block'
   call={'pc':pc,'line':x['line'],'block':a,'callee':f,'arguments':argv,'argEncodingB':B,'resultEncodingC':C}
   if openfrom is not None:call['openResultProducerPC']=openfrom
   calls.append(call);x['callIndex']=len(calls)-1
   expr=f+'('+', '.join(argv)+')'
   if C==0:top=(r,pc);put(args[0],'RET@'+str(pc));note='RET@'+str(pc)+' := '+expr+' [open results]'
   elif C==1:note=expr
   else:
    put(args[0],expr)
    for i in range(1,C-1):put('r'+str(r+i),'RET@'+str(pc)+'['+str(i+1)+']')
    # retain all calls in JSON, show calls with gameplay side effects and low register state
    if r<4 or not f.startswith(('Get','Is','Has','UnitIs','japi.Get','japi.EXGet','Convert','isPhy','isMagic','isReal','math','_ENV')):note=args[0]+' := '+expr
  elif op in ['eq','lt','le']:
   A,l,r=args;cmp=val(l)+' '+{'eq':'==','lt':'<','le':'<='}[op]+' '+val(r)
   c={'pc':pc,'line':x['line'],'op':op,'comparison':cmp,'comparisonTrueNextPC':pc+1 if A=='1' else pc+2,'comparisonFalseNextPC':pc+2 if A=='1' else pc+1,'rawOperands':args}
   if ins[pc]['op']=='jmp':
    target=labels[ins[pc]['args'][-1]];c['normalizedTrueNextPC']=target if A=='1' else pc+2;c['normalizedFalseNextPC']=pc+2 if A=='1' else target
   conditions.append(c);bc.append(len(conditions)-1);note='IF '+cmp+' THEN pc'+str(c.get('normalizedTrueNextPC',c['comparisonTrueNextPC']))+' ELSE pc'+str(c.get('normalizedFalseNextPC',c['comparisonFalseNextPC']))
  elif op=='test':
   r,C=args;cmp='truthy('+val(r)+')';c={'pc':pc,'line':x['line'],'op':op,'comparison':cmp,'comparisonTrueNextPC':pc+1 if C=='1' else pc+2,'comparisonFalseNextPC':pc+2 if C=='1' else pc+1,'rawOperands':args}
   if ins[pc]['op']=='jmp':
    target=labels[ins[pc]['args'][-1]];c['normalizedTrueNextPC']=target if C=='1' else pc+2;c['normalizedFalseNextPC']=pc+2 if C=='1' else target
   conditions.append(c);bc.append(len(conditions)-1);note='IF '+cmp+' THEN pc'+str(c.get('normalizedTrueNextPC',c['comparisonTrueNextPC']))+' ELSE pc'+str(c.get('normalizedFalseNextPC',c['comparisonFalseNextPC']))
  elif op in ['jmp','return','forprep','forloop']:note=x['raw']
  else:raise Exception(op)
  if args and args[0] in ['r0','r1','r2','r3'] and op in ['move','loadnil','gettable','mul','div','add','sub']:note=args[0]+' := '+reg.get(args[0],'nil')
  if note:stm.append({'pc':pc,'line':x['line'],'text':note})
 blocks.append({'startPC':a,'endPC':b,'startLine':ins[a-1]['line'],'endLine':ins[b-1]['line'],'predecessorPCs':pred[a],'successorPCs':ins[b-1]['successors'],'conditionIndexes':bc,'readableStatements':stm})
 text.append(f'\nBLOCK {a}–{b} (L{ins[a-1]["line"]}–{ins[b-1]["line"]})')
 text += [f'  {s["pc"]:4} L{s["line"]}: {s["text"]}' for s in stm]
# Reachability only proves graph integrity, not dynamic executability of predicates.
seen=set();todo=[1]
while todo:
 p=todo.pop()
 if p in seen:continue
 seen.add(p);todo+=ins[p-1]['successors']
out={'schemaVersion':1,'scope':'anyUnitDamaged dispatcher bytecode-level control-flow inventory; callee bodies and native engine behavior are outside full-closure claim','source':{'path':'reference/map-6.25/main.disasm','sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'function':'main/f291/f1','startLine':start+1,'endLine':ins[-1]['line'],'readableSource':'reference/map-6.25/main.readable.lua','readableStartLine':110377},'semantics':{'upvalues':{'u0':'_ENV','u1':'jass.japi module','u2':'negative armor correction main/f291/f0'},'registerRoles':'r0 source after pc2; r1 target after pc29; r2 attributed tower after pc30/pc51; r3 scratch/snapshot damage. Low registers before these PCs have temporary meanings.','instructionControlFlow':'Lua 5.3 EQ/LT/LE skip next iff result != A; TEST skip next iff truthiness != C; JMP direct; FORPREP direct; FORLOOP has loop/exit successors.','readableExpressions':'Block-local provenance only. No cross-block substitution or symbolic execution. rN denotes value at block entry. RET@pc is open result list; B=0 expansion preserved. Repeated expressions in descriptions do not repeat runtime calls.','authority':['https://www.lua.org/source/5.3/lopcodes.h.html','https://www.lua.org/source/5.3/lvm.c.html']},'counts':{'instructions':len(ins),'constants':len(const),'conditions':len(conditions),'calls':len(calls),'basicBlocks':len(blocks),'jumps':sum(x['op']=='jmp' for x in ins),'returns':sum(x['op']=='return' for x in ins),'structurallyReachableInstructions':len(seen),'directDamageWrites':sum(c['callee']=='japi.EXSetEventDamage' for c in calls)},'constants':const,'labels':labels,'returns':[{'pc':x['pc'],'line':x['line']} for x in ins if x['op']=='return'],'conditions':conditions,'calls':calls,'blocks':blocks,'instructions':ins}

# Curated scope/phase annotations, grounded in the cited source lines.
annotations = {'stages': [{'startPC': 1, 'endPC': 27, 'startLine': 162494, 'endLine': 162522, 'name': '来源过滤与零伤害早退'}, {'startPC': 28, 'endPC': 97, 'startLine': 162524, 'endLine': 162596, 'name': '归属解析与金币怪生命恢复'}, {'startPC': 98, 'endPC': 214, 'startLine': 162598, 'endLine': 162718, 'name': 'q039旁路、前置物品、早期攻击效果与B177早退'}, {'startPC': 215, 'endPC': 1104, 'startLine': 162720, 'endLine': 163655, 'name': '英雄/召唤/临时来源技能分派'}, {'startPC': 1105, 'endPC': 1293, 'startLine': 163657, 'endLine': 163855, 'name': '目标增伤、A111关联、夜魔等状态倍率'}, {'startPC': 1294, 'endPC': 1650, 'startLine': 163857, 'endLine': 164232, 'name': '物理/魔法/神圣类型倍率与负护甲修正'}, {'startPC': 1651, 'endPC': 1729, 'startLine': 164234, 'endLine': 164316, 'name': 'q026+B100百分比神圣派生伤害'}, {'startPC': 1730, 'endPC': 1915, 'startLine': 164318, 'endLine': 164512, 'name': '普通塔被动与龙卵领主'}, {'startPC': 1916, 'endPC': 1996, 'startLine': 164514, 'endLine': 164597, 'name': '后置物品与英雄三围伤害加成'}, {'startPC': 1997, 'endPC': 2479, 'startLine': 164599, 'endLine': 165107, 'name': 'P000、Buff、溢出伤害及指定临时来源后处理'}, {'startPC': 2480, 'endPC': 2661, 'startLine': 165109, 'endLine': 165298, 'name': '维持移动、特殊建筑受击与A232'}, {'startPC': 2662, 'endPC': 3242, 'startLine': 165300, 'endLine': 165916, 'name': '怪物受击技能、免伤与吸收回血'}, {'startPC': 3243, 'endPC': 3675, 'startLine': 165918, 'endLine': 166374, 'name': '空闲/移动目标的单次技能优先序'}, {'startPC': 3676, 'endPC': 3812, 'startLine': 166376, 'endLine': 166523, 'name': 'T202以及无尽/深渊模式修正'}, {'startPC': 3813, 'endPC': 3963, 'startLine': 166525, 'endLine': 166681, 'name': 'N579、反射与濒死保护'}, {'startPC': 3964, 'endPC': 3979, 'startLine': 166683, 'endLine': 166699, 'name': '活动怪回调与统计快照'}, {'startPC': 3980, 'endPC': 4166, 'startLine': 166700, 'endLine': 166897, 'name': '金币怪换算、真实扣血归零与漂字'}, {'startPC': 4167, 'endPC': 4228, 'startLine': 166899, 'endLine': 166964, 'name': '个人商店Boss跨玩家伤害阻止'}, {'startPC': 4229, 'endPC': 4278, 'startLine': 166966, 'endLine': 167018, 'name': '面板归属重映射、统计与正常返回'}], 'verification': {'status': 'complete_bytecode_control_flow_inventory_and_dispatch_review; not_complete_gameplay_semantics', 'checked': ['All 4278 instruction slots parsed; every branch target/label checked against disassembly PC numbering', 'All 437 EQ/LT/LE/TEST conditions indexed with exact true/false next PCs', 'All 964 calls resolved to named callee; all B=0 variable-result producers retained', 'All 56 direct EXSetEventDamage calls indexed in bytecode order', 'All 5 return paths reviewed; one unreachable compiler jump PC3490 retained', 'Full dispatcher reviewed by segments, including branch scopes, item hooks, mode branch, statistic snapshot timing'], 'notClaimed': ['Callee bodies transitively verified', 'Native engine ordering or armor/accuracy/defaults proved', 'All dynamically reachable game states tested', 'All shared mutable state and nested-event reentrancy proved'], 'structurallyUnreachablePCs': [3490]}, 'a026Assessment': {'status': 'original_script_confirmed; Web_percentage_armor_ignore_selected_by_Q26; original_client_equivalence_unverified', 'scriptFunction': 'main/f28/f0', 'scriptDisassemblyLines': [63229, 63344], 'dispatcherCallPC': 512, 'formula': 'D*(1+0.007*max(0,min(a,a*0.05*L))/(Game_Mode==2?2:1)), L in 1..6', 'nativeAbilityCode': 'AHad', 'nativeSource': 'reference/map-6.25/units_abilitydata.json:14217', 'relatedItem': 'i267; own mitigation term halves when source has A026, in ItemDamageActionAfter', 'relatedItemFunction': 'main/f261/f0', 'relatedItemDisassemblyLines': [132358, 132442], 'originalClientCaveat': 'Matched native runtime was unavailable (Q23); Q24 defines Web armor and event behavior. Q26 selects percentage armor ignore for A026, and Q27 selects the same for i267 with its source gates and halving rules. Original formulas remain evidence, not the chosen Web implementation.', 'webSpecification': 'docs/rules/combat-and-skills.md#4-幻影刺客a026a027; docs/rules/item-damage-dispatch.md#6-已核装备效果的复用与边界'}, 'knownWebDecisions': {'Q14': 'EUL 10% × 1.4', 'Q15': '大法师之戒25% × 2', 'Q16': '怒意狂击300/450层', 'Q25': '鬼切月影20% × 2.4', 'Q26': 'A026忽略5%–30%护甲，深渊减半，原资格/时点保留', 'Q27': 'i267忽略35%护甲，深渊及实际来源有A026时各减半，原资格/时点保留；与A026各自按实际护甲独立求倍率', 'note': 'These are user decisions; original bytecode inventory stays unchanged.'}, 'returns': [{'pc': 27, 'line': 162522, 'meaning': '首次GetEventDamage==0；q004/q005先写零所以进入该早退'}, {'pc': 214, 'line': 162718, 'meaning': '攻击标记非0且来源有B177；A164_T322_Action后立即返回'}, {'pc': 4015, 'line': 166738, 'meaning': '金币怪分支，幻象/N159换算后统计快照<0；未执行该分支后面的伤害归零'}, {'pc': 4065, 'line': 166791, 'meaning': '金币伤害已计入Money_Damage_Sum且事件已归零；floor统计值转字符串等于0'}, {'pc': 4278, 'line': 167018, 'meaning': '正常结束'}]}

annotations['knownWebDecisions']['P000_workbook_priority'] = {
    'abilityId': 'P000', 'sourceMultiplier': 1.3, 'webMultiplier': 1.4,
    'function': 'main/f291/f1', 'writePC': 2012,
    'scope': 'Keep attributed O nonnil/P000>0 guard and original event position; change only this multiplier under the user numeric-priority policy',
    'specification': 'docs/rules/native-critical-family.md',
}

# main.disasm already retains all instructions. Export only meaningful control,
# calls, write order and source references; ordinary fallthrough is implicit.
compact = {k:out[k] for k in ['schemaVersion','scope','source','semantics','counts']}
compact.update(annotations)
compact['conditions'] = [{k:c[k] for k in ['pc','line','op','comparison','normalizedTrueNextPC','normalizedFalseNextPC']} for c in conditions]
compact['calls'] = [{k:v for k,v in c.items() if k!='block'} for c in calls]
paired_jumps = {c['pc']+1 for c in conditions}
compact['otherControlTransfers'] = [{k:x[k] for k in ['pc','line','op','args','successors']} for x in ins if (x['op'] in ['jmp','forprep','forloop'] and x['pc'] not in paired_jumps) or (x['op']=='loadbool' and x['args'][-1]=='1')]
compact['damageWriteOrder']=[{'ordinal':i+1,'pc':c['pc'],'line':c['line'],'callIndex':calls.index(c)} for i,c in enumerate(c for c in calls if c['callee']=='japi.EXSetEventDamage')]
compact['callIndexByCallee']={name:[i for i,c in enumerate(calls) if c['callee']==name] for name in sorted({c['callee'] for c in calls})}
compact['generator']={'path':'tools/index-damage-pipeline.py','sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'command':'python3 tools/index-damage-pipeline.py'}
assert len(conditions)==437 and len(calls)==964
assert [x['pc'] for x in ins if x['op']=='return']==[27,214,4015,4065,4278]
assert sum(c['callee']=='japi.EXSetEventDamage' for c in calls)==56
assert all('normalizedTrueNextPC' in c and 'normalizedFalseNextPC' in c for c in conditions)
assert all(c.get('openResultProducerPC')!='unresolved_cross_block' for c in calls)
assert not any(re.fullmatch('r[0-9]+',c['callee']) for c in calls)
output=root/'docs/rules/damage-pipeline.json'
output.write_text(json.dumps(compact,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(compact['counts'],ensure_ascii=False))
print('Output bytes:',output.stat().st_size)
