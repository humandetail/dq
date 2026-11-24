#!/usr/bin/env python3
"""Rebuild/check this bounded static audit from repository evidence; no game/native runtime.
Usage: python3 tools/audit_creep_buffs_orbs.py --write | --check
"""
import argparse, ast, hashlib, json, math, re, zipfile, runpy
from pathlib import Path
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
REF=ROOT/'reference/map-6.25'
OUT=ROOT/'docs/rules/creep-buffs-orbs-and-immolation.json'
MD=OUT.with_suffix('.md')
IDS=[f'N{i:03}' for i in [89,90,91,92,93,95,105,106,107,127,128,129,130,131,160,161,162,163,164]]+[f'T{i}' for i in range(292,297)]
AUX=['N094','T041','T042','T043']
FROST_DECISION={'id':'Q45','supersedes':'M02','status':'confirmed','manaCost':0,'bonusDamage':0,'movementSlow':[.06,.08,.10,.12,.15],'duration':3,'authority':'explicit user decision: ordinary attacks freely apply workbook slow, no extra damage','sourceCostField':'absent','sourceExtraDamageField':'absent','rule':'Web cost0 and bonus0 are user-selected; original absent fields remain absent, never described as source zero; no stock8/5 or new mana pool'}
assert len(IDS)==24
N={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def sheet(n):
 with zipfile.ZipFile(ROOT/'图鉴.xlsx')as z:
  strings=[''.join(v.itertext())for v in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',N)];out={}
  for row in ET.fromstring(z.read(f'xl/worksheets/sheet{n}.xml')).findall('.//s:row',N):
   for c in row:
    v=c.find('s:v',N);v=v.text if v is not None else '';out[c.attrib['r']]=strings[int(v)]if c.attrib.get('t')=='s'else v
  return out
WB=sheet(5)
CACHE={}
def read(fn):
 if fn not in CACHE:CACHE[fn]=json.loads((REF/fn).read_text())
 return CACHE[fn]
def raw_slk(fn):
 tree=ast.parse((ROOT/'tools/build_map_reference.py').read_text());f=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=='parse_slk');ns={'re':re};exec(compile(ast.Module(body=[f],type_ignores=[]),'existing-slk-parser','exec'),ns)
 return ns['parse_slk'](REF/fn)
def profile(id,fn='units_campaignabilitystrings.txt'):
 ls=(REF/fn).read_text().splitlines()
 if '['+id+']' not in ls:return {'path':'reference/map-6.25/'+fn,'lines':None,'fields':{},'profileAbsent':True}
 a=ls.index('['+id+']');b=next((i for i in range(a+1,len(ls))if ls[i].startswith('[')),len(ls));return {'path':'reference/map-6.25/'+fn,'lines':[a+1,b],'fields':{x.split('=',1)[0]:x.split('=',1)[1]for x in ls[a+1:b]if'='in x}}
L=(REF/'main.disasm').read_text().splitlines()
def code(f):
 s=L.index('.function\t'+f);e=next(i for i in range(s+1,len(L))if L[i].startswith('.function'));ins=[];ks={};labels={};lines=[]
 for i in range(s,e):
  t=L[i]
  if t.startswith('.constant'):
   _,k,v=t.split(maxsplit=2);v=v[1:]if v.startswith('L"')else v;ks[k]={'nil':None,'true':True,'false':False}[v]if v in['nil','true','false']else ast.literal_eval(v)
  elif t.startswith('.label'):labels[t.split()[1]]=len(ins)+1
  elif t.strip()and not t.startswith('.'):ins.append(t.split(';')[0].split());lines.append(i+1)
 return ks,ins,labels,lines
BC={f:code(f)for f in ['main/f291/f7','main/f291/f8','main/f291/f34']}
def fragment(f,a,b,meaning):
 _,ins,labels,lines=BC[f];condition=[]
 for pc in range(a,b+1):
  op,*args=ins[pc-1]
  if op in['eq','lt','le','test','testset']:
   flag=args[-1]=='1'if op in['test','testset']else args[0]=='1';yes,no=(pc+1,pc+2)if flag else(pc+2,pc+1)
   def nxt(p):return labels[ins[p-1][-1]]if ins[p-1][0]=='jmp'else p
   condition.append({'pc':pc,'line':lines[pc-1],'raw':' '.join(ins[pc-1]),'trueNextPC':nxt(yes),'falseNextPC':nxt(no)})
 return {'function':f,'pcRange':[a,b],'sourceLines':[lines[a-1],lines[b-1]],'meaning':meaning,'counts':{'instructions':b-a+1,'conditions':len(condition),'calls':sum(x[0]=='call'for x in ins[a-1:b]),'returns':sum(x[0]=='return'for x in ins[a-1:b])},'conditions':condition,'returns':[{'pc':pc,'line':lines[pc-1]}for pc in range(a,b+1)if ins[pc-1][0]=='return']}
def exact_refs(ids):
 lookup={id:(id,int.from_bytes(id.encode(),'big'))for id in ids};result={id:[]for id in ids};f=''
 for i,t in enumerate(L):
  if t.startswith('.function'):f=t.split()[1]
  if not t.startswith('.constant'):continue
  for id,(_,num)in lookup.items():
   if t.endswith('"'+id+'"')or t.split()[-1]==str(num):result[id].append({'function':f,'line':i+1,'constant':t.split()[1]})
 return result
META_BASE='https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/'
# Labels read from pinned native editor metadata; labels are not native execution proof.
FIELDS=[('Blo1','DataA','attack speed increase'),('Blo2','DataB','movement speed increase'),('Blo3','DataC','visual scaling factor'),('Poi1','DataA','damage per second'),('Poi2','DataB','attack speed factor'),('Poi3','DataC','movement speed factor'),('Poi4','DataD','stackFlags'),('Iarp','DataB','armor penalty'),('Iob5','DataE','enabled attack index'),('Eim1','DataA','damage per interval'),('Hca1','DataA','extra damage'),('Hca2','DataB','movement speed factor'),('Hca3','DataC','attack speed factor'),('Hca4','DataD','stackFlags')]
PRIMARY=[{'url':'https://classic.battle.net/war3/orc/units/shaman.shtml','facts':'Bloodlust cast+autocast, organic allies/self, no magical immune/mechanical; custom mask invulnerability preserved'}, {'url':'https://classic.battle.net/war3/orc/units/windrider.shtml','facts':'Envenomed Spears attack-applied DOT, no mana; custom amount/duration from objects'}, {'url':'https://classic.battle.net/war3/basics/spellbasics.shtml','facts':'physical poison magicimmune allowed, ethereal excluded, magicdispelless; source-refresh/different poison sources; nonlethal2HP; autocast positive buff closest friendly in combat/self fallback; Purge slow magicdispelless'}, {'url':'https://classic.battle.net/war3/basics/heroitemspermanent.shtml','facts':'Orb of Corruption armor reduction5sec, not dispellable; Orbs affect magicimmune; stock values are not custom values'}, {'url':'https://classic.battle.net/war3/undead/units/infernal.shtml','facts':'Permanent Immolation passive/no mana/DPS; native stock grounded mask does not establish custom enemies mask'}, {'url':'https://classic.battle.net/war3/neutral/nagaseawitch.shtml','facts':'Frost Arrows attack orb and toggle; stockANfa mana/damage not proof AHca custom missing fields'}, {'url':META_BASE+'Units/AbilityMetaData.slk','facts':'data slot mapping only'}, {'url':META_BASE+'UI/WorldEditStrings.txt','facts':'labels, including Poison attack vs movement and Bloodlust visual scaling'}, {'url':META_BASE+'UI/UnitEditorData.txt#L343','facts':'stackFlags bit positions0 damage,1 movement,2 attack rate,3 kill unit; DataD1 selects damage stacking not slow or Kill'}]
RULES={
'bloodlust':{'ids':['N089','N090','N091','N092'],'attackRateBonus':[.2,.3,.4,.5],'mana':30,'cooldown':2,'range':1000,'durationNormalAndHero':5,'buff':'Bblo','sourceVisualScale':.2,'sourceMovementBonus':'absent','entry':'no literal ID/FourCC/script auto157 dispatch; unit auto=Ablo, native autocast plus manual target spell','Q24':{'manaTiming':'existing local accept/windup/commit scheme; n214–217 explicit castpt.56; at effect recheck, pay30/startCD2, one AnySkillStart then apply; interrupted pre-effect no payment; event kills source cancels payload without refund','target':'self or visible friendly ground/air organic nonstructure/nonmechanical, incl invulnerable (explicit custom mask), no hidden/Aloc/magicimmune; ethereal allowed; no N535 friendlyblock','effect':'attackR additive .2/.3/.4/.5; DataB absent=>0 movement bonus local default. DataC.2=>visual scale factor1.2 with no collision/range/HP change','stack':'one Bblo slot for this local family; latest replaces amount+expiry even weaker; visual scale from base not multiplied repeatedly; different buff family bonuses remain distinct. Ordinary positive dispel, explicitremove,newmagicimmune,death/removal/expiry clears; source death does not remove committed buff','autoInitial':'auto=Ablo maps to unique attached Ablo-code skill, defaulton (explicit local alias mapping); independent bloodluston/off, not B012. No nonexistent skill created by auto string','autoTarget':'scan every.25 battle seconds from activation, only ready/source not in cast or attack windup/manual move or incompatible command. Consider eligible friends currently in a valid ordinary attack order, lacking Bblo; choose nearest other friendly, B04tie; self fallback only when no such other and self attacking. Do not prebuff idle units or passive-only immolation towers','autoRaces':'scan enqueues normal target order; original alreadyqueued same-time events precede scan; coalesce identical pending order; commit handles cost/CD competition','resources':'source unit mana0=400 but manaN=200/250/300/350; anyBuildCompleteHandler explicitly resets current to max, so casting uses live current max, not400 borrowed mana','rng':'none; no native SPELL_EFFECT for auto toggle itself'}},
'poison':{'ids':['N093','N095'],'auxiliaryVariant':'N094100DPS no workbook/no initialcarrier/no explicit script acquisition; not inserted into upgrade chain','DPS':[50,150],'duration':5,'attackSlow':.2,'moveSlow':'absent ->local0','stackFlags':1,'buffs':['Bpoi','Bpsd'],'Q24':{'entry':'nonillusion enabled source successful ordinary weapon primary hit; not ATTACKED/windup or arbitrary attack=true script packet; enemy organic ground/air nonstructure/nonmechanical, no Aloc/hidden/invul/ethereal; magicimmune allowed','apply':'after hit qualification before ordinary packet; one per logical caster,target pair across N093–95, refresh5sec and update DPS, preserve tick phase. Target killed by ordinary event clears poison','tick':'first at initial application+1s then1s, inclusive expiry endpoint; source-specific tracks tick separately B05/B04 and each runs B03. Same source refresh not extra stack; different logical caster tracks stack including same unit type (explicit interpretation of ambiguous official differing-unit examples); source removal cancels, death with live handle continues','packet':'source S,false,false,NORMAL/NORMAL physical raw DPS; after native reduction before map callback cap to min(max(0,reduced),max(0,currentLife-2)). Zero capped amount no new event; map damage changes/extra packets may kill, no final floor or reverse healing','slow':'all active poison tracks attackR decrease max(.2) once, not sum because DataD lacks attack-rate bit; DataC absent explicitly no movement slow; do not misread Poi2 as movement','remove':'ordinary magic/negative dispel no effect (physical poison); explicit remove Bpoi clears all local poison tracks+Bpsd; explicit Bpsd removes slow presentation/effect until next poison refresh, does not erase DOT; target death/removal/ineligible clears; newmagicimmune alone does not clear','costRng':'no mana/CD/SPELL_EFFECT/N535; one strongest poison ability per same caster hit if artificially coexist; no new RNG'}},
'corruption':{'ids':['N105','N106','N107'],'attachedNative':['T041','T042','T043'],'armorPenalty':[10,25,40],'duration':5,'buff':'BIcb','enabledAttackIndex':2,'sourceExtraAttack':'absent (stockAIcb5 does not prove custom5)','Q24':{'marker':'N105–107 reuse AOcr no-extra-native-contribution rule; actual armor effect follows attached T041–43, not an additional marker duplicate. Removing marker does not remove separately attached native ability','entry':'successful nonillusion enabled ordinary weapon hit; legal enemy ground/air/ward incl structures/mechanical, no Aloc/hidden/invul/ethereal, magicimmune allowed. Native attack legality remains weapon-specific','timing':'apply armor reduction before current hit native armor reduction, so triggering attack benefits; full normal B03 follows, no additional damage event. Explicit local ordering, not inferred from tooltip','stack':'one BIcb slot among T041–43; latest replaces penalty and5sec expiry, mayweaken, not stack multiple hits/casters; other independent armor modifiers sum as usual. No new RNG/CD/mana','remove':'magic/negative dispel cannot remove; explicit BIcb remove/death/removal/expiry clears; source death/removal does not cancel already applied debuff; magicimmune retains','missingBonus':'custom DataA absent=>local0 extra fixed attack; not add stock5. Original ordinary amount preserved. Metadata Iob5=2 enables weapon slot2 but does not supply absent attack profile','attack2':'record enabledslot2; source n240–242 weapon2 lacks range/damage/dice/target mask. Local no generated secondary weapon: an incomplete slot is unusable; do not clone slot1 or silently grant air attack. If a later independently audited transformation supplies valid slot2, ordinary weapon selector can use it','crossOrb':'this batch innate carriers have no second audited attack orb; future artificial multi-orb coexistence requires original acquisition/ability rules, not assumed globally exclusive or stacking'}},
'immolation':{'ids':['N127','N128','N129','N130','N131'],'rawPerInterval':[60,100,150,200,300],'radius':600,'interval':1,'buff':'Bpig','Q24':{'entry':'enabled alive actual source continuous passive; no toggle/bluecost/cooldown/ATTACKED/SPELL_EFFECT/RNG. Suppressed while hidden/illusion/hex or underconstruction, normal silence/stun/pause do not by themselves disable passive','schedule':'activation records firsttick=activation+1s then every1s; per source clock, no extra instanttick on enemyentry. State/rank changes keep phase while same logical source persists, disabled/dead/removal cancels and a future fresh activation starts new phase. Upgrade continues old ability until transaction replaces ability; replacement rank uses current tick values without extra immediate tick','targets':'at each tick actual source current position, closed600 B04 snapshot, enemy ground/air/structure/mechanical from custom enemies mask; no hidden/Aloc/invul/magicimmune. Ordinary invisibility may be hit; ethereal permitted by spell damage and existing B03 modifier','damage':'one actual source false,false,NORMAL/MAGIC per target; complete B03, normal lethal allowed (not poison/disease2HP). If source removed/killed within nested event stop remaining current recipients; target state rechecked per packet','stack':'each source emits independent packets; no shared Bpig max rule; multiple abilities on same logical source choose largest magnitude once. No lingering DOT on targets after leavingcircle, source unavailable or current tick; Bpig only emitter/display state not transferable enemyinfection','weapon':'n021–25 weaponsOn missing, unit actual tooltip明确无攻击力; Q24 disabled ordinary weapon attacks (no slot activation invented from dormant dmgplus/dice), so passive alone cannot create ATTACKED or trigger Bloodlust combat autocast','resources':'no extra native permanent-immolation selfdamage or manadrain; geometry does not inherit area-damage-v1 broader targetmask implicitly'}},
'frost':{'ids':[f'N{i}'for i in range(160,165)]+[f'T{i}'for i in range(292,297)],'pairs':[[f'N{160+i}',f'T{292+i}',f'n{6+i:03}']for i in range(5)],'movementSlow':[.06,.08,.10,.12,.15],'durationNormalAndHero':3,'range':1000,'missileSpeed':1200,'homing':True,'sourceMissing':['Cost1','Cool1','DataA1 extraDamage','DataC1 attackSlow','DataD1 stacking flags'],'decision':FROST_DECISION,'sourceEntry':'actual unitauto=T292..296 + construct/upgrade finish handler explicitly issuescoldarrows after shared registration/stop/fullmana handler. Amgl N160–64 has no behavior/data; ordinary weapon missile, not mbounce','Q24Established':{'pair':'one effect per pair: marker is description only, no extra bounce or second slow; actual T292–96 enabled by hidden nativeauto, UI button y=-11 is sourcefact','toggle':'initialon from unitauto; construct/upgrade coldarrows sets on idempotently; independent of B012. Upgrade swaps current rank and resets on via original handler; already launched shot keeps snapshotted rank. No visible manual toggle UI invented by hidden button','entry':'ordinary committed attack keeps weapon flags/type and one ATTACKED. Slow snapshotted at launch; apply on successful legal hit before maindamage. Miss/invalid target no slow; source death keeps committed projectile, deletion cancels. Range rechecked forlaunch notflight','target':'ordinary visible enemy ground/air incl mechanical/structure only where weapon legal; no hidden/Aloc/invul/ethereal. Magicimmune can take baseattack but slow skipped as local AHca choice; no N535','effect':'only movement slow at specified percent3s; DataC absent=>local0 attackslow; same local frostslot across5levels latest replaces magnitude/expiry even weaker. Slow state correlated BHca/Bfro/Bcsi, never tripleapply','remove':'negative dispel or explicit removal of local frost effect clears; death/deletion/newmagicimmune/expiry clears. No stacking durations. Native stacking flag omitted remains source absence; local latest rule not stockDataD7','event':'auto arrows no separate SPELL_EFFECT, native manual-arrow integration if later exposed requires one at commit; toggle itself no spell effect. Q45 confirmed cost0/extraDamage0, no independent skill cooldown beyond ordinary attack; zero mana still applies slow on a successful legal hit; original fields remain absent','ordinaryDamage':'normal underlying weapon10–14/50–54/100–104/150–154/200–204 from source dice remains; marker does not boost twice. Future ordinary critical onlyonce peroriginalattack'}}}

def build():
 objs={}
 def obj(fn,key,id):
  row=next(x for x in read(fn)if x[key]==id);ls=(REF/fn).read_text().splitlines();name=fn+':'+id;objs[name]={'path':'reference/map-6.25/'+fn,'line':next(i+1 for i,t in enumerate(ls)if f'"{key}": "{id}"'in t),'fields':row};return name
 am={x['alias']:x for x in read('units_abilitydata.json')};ua=read('units_unitabilities.json');wa=read('war3map.w3a.json');units=set();records=[]
 for id in IDS+AUX:
  rows=[int(k[1:])for k,v in WB.items()if k.startswith('F')and v==id];carriers=[u['unitAbilID']for u in ua if id in(u.get('abilList','').split(',')+u.get('heroAbilList','').split(','))];units.update(carriers)
  fam=next((f for f,r in RULES.items()if id in r['ids']),'poison'if id=='N094'else'corruption')
  records.append({'id':id,'family':fam,'workbook':[{'sheet':'塔技能','row':r,'cells':{c+str(r):WB.get(c+str(r),'')for c in'ABCDEFGHI'}}for r in rows],'object':obj('units_abilitydata.json','alias',id),'w3aOverrides':[x for x in wa if id in[x['old'],x['new']]],'actualProfile':profile(id),'initialCarriers':carriers,'status':'bounded-Web-effect-defined'if id!='N094'else'auxiliary-unused-variant-located-not-added-to-play','nativeParity':'unproved'})
 for id in ['Ablo','Aven','AIcb','Apig','AHca']:obj('units_abilitydata.json','alias',id)
 for u in sorted(units):
  for fn,key in [('units_unitabilities.json','unitAbilID'),('units_unitweapons.json','unitWeapID'),('units_unitbalance.json','unitBalanceID'),('units_unitdata.json','unitID')]:obj(fn,key,u)
 wu=read('war3map.w3u.json');mods=[x for x in wu if x['old']in units or x['new']in units]
 refs=exact_refs(IDS+AUX+['coldarrows','bloodluston','bloodlustoff'])
 # Exact rawcodes must have no dedicated script or shared autocast branch in this selection.
 assert all(not refs[id]for id in IDS+AUX)
 ac=json.loads((ROOT/'docs/rules/autocast-data.json').read_text());assert not any(set(b['abilityIds'])&set(IDS+AUX)for b in ac['branches'])
 fragments=[fragment('main/f291/f8',1,52,'construct/upgrade callback first generichandler then five typeOR and coldarrows'),fragment('main/f291/f7',1,56,'shared registration,userData,T033on,N032remove,hero move type,stop,currentmana=maxmana before frost order'),fragment('main/f291/f34',1,len(BC['main/f291/f34'][1]),'full event registration construct+upgrade finish forplayers0..3 -> anyBuildComplete')]
 files=['main.disasm','war3map.j','units_abilitydata.json','war3map.w3a.json','units_unitabilities.json','units_unitweapons.json','units_unitbalance.json','units_unitdata.json','war3map.w3u.json','units_campaignabilitystrings.txt','units_campaignunitstrings.txt']
 data={'schemaVersion':1,'baselineId':'creep-buffs-orbs-v1','scope':'24 workbook IDs,4 dependency/unacquired IDs; five scoped native families, not all orb interactions or all build-handler branches','counts':{'workbookIds':24,'workbookRows':sum(len(x['workbook'])for x in records),'families':5,'auxiliaryIds':4,'boundedWebIds':24,'confirmedQ45Ids':10,'pendingMechanismIds':0},'sourceFiles':{f:{'path':'reference/map-6.25/'+f,'sha256':hashlib.sha256((REF/f).read_bytes()).hexdigest()}for f in files}|{'workbook':{'path':'图鉴.xlsx','sha256':hashlib.sha256((ROOT/'图鉴.xlsx').read_bytes()).hexdigest()}},'ids':records,'objectData':objs,'unitObjectDeltas':mods,'unitProfiles':{u:profile(u,'units_campaignunitstrings.txt')for u in sorted(units)},'exactBytecodeReferences':refs,'bytecode':fragments,'downstreamCallerBoundaries':[{'function':'main/f291/f7','pcRange':[57,70],'sourceLines':[BC['main/f291/f7'][3][56],BC['main/f291/f7'][3][69]],'meaning':'native HERO or type n208 alone enters random P ability path; ordinary selected carriers skip toPC129 cleanup/130return. Random hero path not audited here.'},{'function':'main/f291/f8','pcRange':[53,250],'sourceLines':[BC['main/f291/f8'][3][52],BC['main/f291/f8'][3][249]],'meaning':'aftercoldarrows noearlyreturn: n146-specificqualification, thenPC159–204 all-build ownednative-HERO count and Mall_ActivityTask_Update_Summer callback atcount4; then H032/H033/H022-specific branches; complete build/achievement behavior outside skill audit, not assumed absent'}],'primarySources':PRIMARY,'metadata':{'pinnedCommit':'a69c315ebf2886ec54d66200707ab6e38bd3484d','mappings':[{'id':a,'field':b,'meaning':c}for a,b,c in FIELDS],'stackFlags':{'source':'UI/UnitEditorData.txt:343–349','bitPositions':{'0':'damage','1':'movement','2':'attack rate','3':'kill unit'},'Poi4_1':{'damageStacks':True,'moveStacks':False,'attackRateStacks':False,'killUnit':False},'qualification':'editor flag labels confirm configured bits; native same-caster identity and callback order still locally defined'}},'common':{'reused':['B03','B04','B05','attack-timing-v1','creep-native-next-v2 nonlethal-native-input and Purge dispel correction','native-critical-family-v1 no second ordinarycritical roll'], 'initialAbilityLevel':1,'resourceClock':'all costs/cooldowns/ticks use battleclock, paused on close, speed1–4x; snapshot pending cast+projectile+per-source DOTphase+Buffexpiry+nativeAutoToggle; no new account/sharedsource','nativeTargets':'ground/air from actual target category not movetp. Every packet actual S preserved, O resolved by original dispatcher; no replacement with owner tower','otherEffects':'N135 and other attached abilities not examined here; no automatic orb global compatibility choice'},'families':RULES,'decisions':[FROST_DECISION],'remaining':['No native client execution; explicitly chosen local defaults and source identity/timing boundaries are Web rules.','Full item-orb coexistence, other ability effects, swap/illusion transactions and all damage callees remain external.'],'verification':{}}
 data['workbookSupplementalAudit']=runpy.run_path(str(ROOT/'tools/audit_creep_supplemental_columns.py'))['audit'](data)
 validate(data)
 return data

def validate(d):
 # Re-read original SLK tables to check parsed snapshots, not copies against themselves.
 raw={f:raw_slk(f+'.slk')for f in ['units_abilitydata','units_unitabilities','units_unitweapons','units_unitbalance','units_unitdata']}
 for o in d['objectData'].values():assert o['fields']in raw[Path(o['path']).stem]
 for id in IDS+AUX:assert next(x for x in d['ids']if x['id']==id)['w3aOverrides']==[]
 assert d['counts']['workbookRows']==24
 am={x['alias']:x for x in read('units_abilitydata.json')}
 numeric=[]
 def expect(id,**expected):
  for key,value in expected.items():
   assert am[id].get(key)==value,(id,key,value,am[id].get(key));numeric.append((id,key,value))
 for i,bonus in enumerate([.2,.3,.4,.5]):expect(f'N{89+i:03}',code='Ablo',DataA1=bonus,DataB1=None,DataC1=.2,Cost1=30,Cool1=2,Rng1=1000,Dur1=5,HeroDur1=5,targs1='self,friend,invulnerable')
 for i,dps in enumerate([50,100,150]):expect(f'N{93+i:03}',code='Aven',DataA1=dps,DataB1=.2,DataC1=None,DataD1=1,Dur1=5,HeroDur1=5,targs1='air,ground,organic')
 for i,penalty in enumerate([10,25,40]):
  expect(f'N{105+i}',code='AOcr',DataA1=None,DataB1=None,DataC1=None,DataD1=None)
  expect(f'T{41+i:03}',code='AIcb',DataA1=None,DataB1=penalty,DataE1=2,Dur1=5,HeroDur1=5,targs1='ground,air,ward')
 for i,dps in enumerate([60,100,150,200,300]):expect(f'N{127+i}',code='Apig',DataA1=dps,Area1=600,Dur1=1,HeroDur1=1,targs1='enemies')
 for i,slow in enumerate([.06,.08,.1,.12,.15]):
  expect(f'N{160+i}',code='Amgl',DataA1=None,DataB1=None,DataC1=None,DataD1=None)
  expect(f'T{292+i}',code='AHca',DataA1=None,DataB1=slow,DataC1=None,DataD1=None,Cost1=None,Cool1=None,Rng1=1000,Dur1=3,HeroDur1=3)
 assert all(am[id]['levels']==1 for id in IDS+AUX)
 assert all(w['cells']['G'+str(w['row'])]=='1'and not w['cells']['I'+str(w['row'])]for x in d['ids']for w in x['workbook'])
 ub={x['unitBalanceID']:x for x in read('units_unitbalance.json')};uw={x['unitWeapID']:x for x in read('units_unitweapons.json')};ua={x['unitAbilID']:x for x in read('units_unitabilities.json')}
 for i,u in enumerate(['n214','n215','n216','n217']):
  assert [ub[u].get(k)for k in['mana0','manaN','regenMana']]==[400,200+50*i,1]
  assert uw[u]['castpt']==.56 and ua[u]['auto']=='Ablo'
 for i,u in enumerate(['n006','n007','n008','n009','n010']):
  assert ub[u].get('mana0')is None and ub[u].get('manaN')is None
  assert ua[u]['auto']==f'T{292+i}'
  assert [uw[u].get(k)for k in['dmgplus1','dice1','sides1','weapTp1','rangeN1','cool1','dmgpt1','weapsOn']]==[[9,49,99,149,199][i],1,5,'missile',1000,1,.5,1]
  mods={m['key']:m['value']for r in d['unitObjectDeltas']if r['old']==u for m in r['mods']}
  assert mods['ua1z']==1200 and mods['umh1']==1 and not(set(mods)&{'umpi','umpm','umpr'})
 for u in['n021','n022','n023','n024','n025']:
  assert 'weapsOn'not in uw[u]
  assert next(m['value']for r in d['unitObjectDeltas']if r['old']==u for m in r['mods']if m['key']=='utub')=='特点：法术伤害，无攻击力。'
 for u in['n240','n241','n242']:
  assert uw[u]['weapsOn']==1 and uw[u]['rangeN1']==800 and uw[u]['dmgpt1']==.33
  assert all(k not in uw[u]for k in['rangeN2','dmgplus2','dice2','sides2','targs2'])
 assert all(not re.search(r'(?<![A-Za-z0-9])'+re.escape(id)+r'(?![A-Za-z0-9])',(REF/'war3map.j').read_text())for id in IDS+AUX)
 assert all(x['actualProfile']['fields'].get('Ubertip')==w['cells']['H'+str(w['row'])]for x in d['ids']for w in x['workbook'])
 assert next(x for x in d['ids']if x['id']=='N094')['initialCarriers']==[]
 # Scope-limited bytecode interpreter, native APIs below are deterministic probes, not Warcraft.
 def run(f,env,stop,args=()):
  ks,ins,labels,lines=BC[f];r={'r'+str(i):x for i,x in enumerate(args)};pc=1;top=0;trace=[]
  def val(s):return ks[s]if s.startswith('k')else r.get(s)
  def truth(v):return v is not None and v is not False
  while pc<=stop:
   trace.append(pc);assert len(trace)<1000;op,*a=ins[pc-1];n=pc+1
   if op=='gettabup':r[a[0]]=(env if a[1]=='u0'else env['_u1']).get(val(a[2]))
   elif op in['move','loadk']:r[a[0]]=val(a[1])
   elif op=='loadnil':
    for j in range(int(a[1])+1):r['r'+str(int(a[0][1:])+j)]=None
   elif op=='call':
    base=int(a[0][1:]);b,c=int(a[1]),int(a[2]);v=val(a[0])(*[r.get('r'+str(i))for i in range(base+1,base+b if b else top)])
    if c==0:r[a[0]]=v;top=base+1
    elif c>1:r[a[0]]=v
   elif op in['eq','lt']:
    pred=val(a[1])==val(a[2])if op=='eq'else val(a[1])<val(a[2]);n+=int(pred!=(a[0]=='1'))
   elif op=='test':n+=int(truth(val(a[0]))!=(a[1]=='1'))
   elif op=='jmp':n=labels[a[1]]
   elif op=='return':return trace
   else:raise AssertionError((pc,op))
   pc=n
  return trace
 probes=[];frostcovered=set();genericcovered=set()
 for unit in ['n006','n007','n008','n009','n010','n214','n021']:
  for orderok in[False,True]:
   calls=[];S={'id':unit};env={'GetTriggerUnit':lambda:S,'GetOwningPlayer':lambda u:2,'anyBuildCompleteHandler':lambda u:calls.append(('handler',u['id'])),'GetUnitTypeId':lambda u:u['id'],'GetId':lambda x:x,'IssueImmediateOrder':lambda u,o:calls.append(('order',o))or orderok}
   tr=run('main/f291/f8',env,52);frostcovered.update(tr);assert calls==[('handler',unit)]+([('order','coldarrows')]if unit in['n006','n007','n008','n009','n010']else[]);probes.append({'id':f'frost_type_{unit}_{orderok}','expected':'handler before exactlyone coldarrows onlyfrost5; ignored false order; later nonfrost branches outside scope'})
 for maxmana in[0,200,250,300,350]:
  calls=[];S={};env={'Tower_ALL':{},'AddArrAny':lambda arr,u:7,'SetUnitUserData':lambda u,i:calls.append(('userdata',i)),'GetUnitAbilityLevel':lambda u,a:1 if a=='T033' else 0,'GetId':lambda x:x,'IssueImmediateOrder':lambda u,o:calls.append(('order',o)),'IsUnitType':lambda u,t:False,'UNIT_TYPE_HERO':'hero','SetUnitState':lambda u,s,v:calls.append(('mana',v)),'GetUnitState':lambda u,s:maxmana,'UNIT_STATE_MANA':'mana','UNIT_STATE_MAX_MANA':'maxmana'}
  tr=run('main/f291/f7',env,56,[S]);genericcovered.update(tr);assert calls==[('userdata',7),('order','manashieldon'),('order','stop'),('mana',maxmana)];probes.append({'id':'build_mana_'+str(maxmana),'expected':maxmana})
 for has_shield in[False,True]:
  for has_remove in[False,True]:
   for is_hero in[False,True]:
    calls=[];S={};env={'Tower_ALL':{},'AddArrAny':lambda arr,u:9,'SetUnitUserData':lambda u,i:calls.append(('userdata',i)),'GetUnitAbilityLevel':lambda u,a:int(has_shield)if a=='T033'else int(has_remove)if a=='N032'else 0,'GetId':lambda x:x,'IssueImmediateOrder':lambda u,o:calls.append(('order',o)),'UnitRemoveAbility':lambda u,a:calls.append(('remove',a)),'IsUnitType':lambda u,t:is_hero,'UNIT_TYPE_HERO':'hero','SetUnitState':lambda u,s,v:calls.append(('mana',v)),'GetUnitState':lambda u,s:1000,'UNIT_STATE_MANA':'mana','UNIT_STATE_MAX_MANA':'maxmana','_u1':{'EXSetUnitMoveType':lambda u,t:calls.append(('move',t))}}
    tr=run('main/f291/f7',env,56,[S]);genericcovered.update(tr)
    assert calls==[('userdata',9)]+([('order','manashieldon')]if has_shield else[])+([('remove','N032')]if has_remove else[])+([('move',1)]if is_hero else[])+[('order','stop'),('mana',1000)]
    probes.append({'id':f'generic_prefix_{has_shield}_{has_remove}_{is_hero}','expected':'registration,optionalshield,optionalremove,optionalheroMove,stop,maxmana in source order; downstream hero/random branches outside scope'})
 assert frostcovered==set(range(1,53));assert genericcovered==set(range(1,57))
 calls=[];trig={};env={'CreateTrigger':lambda:trig,'Player':lambda x:x,'TriggerRegisterPlayerUnitEvent':lambda t,p,e,f:calls.append((p,e)),'EVENT_PLAYER_UNIT_CONSTRUCT_FINISH':'construct','EVENT_PLAYER_UNIT_UPGRADE_FINISH':'upgrade','Condition':lambda f:f,'anyBuildComplete':'buildfn','TriggerAddCondition':lambda t,f:calls.append(('callback',f))};regtr=run('main/f291/f34',env,len(BC['main/f291/f34'][1]));assert calls==[(p,e)for e in['construct','upgrade']for p in range(4)]+[('callback','buildfn')];probes.append({'id':'build_registration8events','expected':'construct+upgrade players0..3 once tobuildfn'})
 cases=[]
 def c(id,inputs,expected,actual):assert actual==expected,(id,expected,actual);cases.append({'id':id,'input':inputs,'expected':expected})
 for amt in[.2,.3,.4,.5]:c('bloodlust_R_'+str(amt),{'R':1,'bonus':amt},1+amt,1+amt)
 c('bloodlust_visual_not_movespeed',{'DataC':.2,'DataB':None},{'visual':1.2,'moveBonus':0},{'visual':1+.2,'moveBonus':0})
 for mana in[0,29,30,31,200]:c('bloodlust_pay_'+str(mana),{'mana':mana,'cost':30},[mana>=30,mana-30 if mana>=30 else mana],[mana>=30,max(0,mana-30)if mana>=30 else mana])
 c('bloodlust_latest_weaker',{'old':.5,'new':.2,'nowUs':1000000},{'bonus':.2,'until':6000000},{'bonus':.2,'until':1000000+5000000})
 c('bloodlust_no_exp_growth',{'baseScale':1,'refreshes':5},1.2,1*(1+.2))
 c('bloodlust_nearest_B04tie',{'targets':[(7,100),(3,100),(8,20)]},8,min([(7,100),(3,100),(8,20)],key=lambda t:(t[1],t[0]))[0])
 for flag in[0,1,7,8,15]:c('stackflags_'+str(flag),{'flag':flag},{'damage':bool(flag&1),'move':bool(flag&2),'attack':bool(flag&4),'kill':bool(flag&8)},{'damage':bool(flag&(1<<0)),'move':bool(flag&(1<<1)),'attack':bool(flag&(1<<2)),'kill':bool(flag&(1<<3))})
 for dps in[50,100,150]:c('poison_five_ticks_'+str(dps),{'dps':dps,'duration':5,'highHP':True},dps*5,sum([dps]*5))
 tracks={7:50};tracks[7]=150;c('poison_same_source_upgrade',{'sameCaster':7,'old':50,'new':150},[1,150],[len(tracks),sum(tracks.values())]);tracks[8]=50;c('poison_other_source',{'tracks':tracks},200,sum(tracks.values()))
 c('poison_attackslow_not_sum',{'sources':[.2,.2,.2]},.2,max([.2,.2,.2]))
 for hp,reduced,expected in[(100,50,50),(30,50,28),(2,50,0),(1,50,0),(2.5,150,.5),(5,0,0)]:c('native_floor_'+str(hp)+'_'+str(reduced),{'life':hp,'nativeReduced':reduced},expected,min(max(0,reduced),max(0,hp-2)))
 c('poison_callback_amplification',{'HP':20,'nativeRaw':50,'afterNative':25,'callbackMultiplier':2},36,min(25,20-2)*2)
 c('poison_reapply_retains_phase',{'firstUs':0,'refreshUs':500000,'firstTickUs':1000000},1000000,0+1000000)
 for penalty in[10,25,40]:c('corruption_negativearmor_'+str(penalty),{'before':5,'penalty':penalty},5-penalty,5-penalty)
 c('corruption_latest_not_add',{'old':40,'new':10,'base':50},40,50-10)
 c('corruption_samehit_armor',{'armor':30,'reduction':10,'k':.018,'raw':100},round(100/(1+.018*20),8),round(100/(1+.018*(30-10)),8))
 for radius in[600,1000]:
  for diff in[0,.001]:c('circle_'+str(radius)+'_'+str(diff),{'distance':radius+diff,'radius':radius},diff==0,(radius+diff)**2<=radius**2)
 for dps in[60,100,150,200,300]:c('immolation3ticks_'+str(dps),{'dps':dps,'elapsed':3},dps*3,sum(dps for _ in range(1,4)))
 c('immolation_not_diseasefloor',{'HP':2,'raw':60},True,60>=2)
 c('immolation_source_stack',{'sources':[60,300]},360,sum([60,300]))
 c('immolation_no_entryinstant',{'activatedUs':0,'targetEnterUs':250000},1000000,0+1000000)
 for slow in[.06,.08,.1,.12,.15]:c('frost_speed_'+str(slow),{'speed':300,'slow':slow},round(300*(1-slow),8),round(300*(1-slow),8))
 c('frost_latest_weaker',{'old':.15,'new':.06},.06,.06)
 c('frost_threebuffs_oneeffect',{'buffs':['BHca','Bfro','Bcsi'],'slow':.1},270,300*(1-.1))
 c('frost_no_marker_bounce',{'weapTp':'missile','marker':'Amgl'},1,1)
 c('frost_flight',{'distance':1000,'speed':1200},833333,math.floor(1000/1200*1e6+.5))
 if FROST_DECISION['status']=='confirmed':
  assert FROST_DECISION['id']=='Q45'and FROST_DECISION['manaCost']==FROST_DECISION['bonusDamage']==0
  for mana in[0,1,100]:c('frost_free_'+str(mana),{'mana':mana,'cost':FROST_DECISION['manaCost'],'authority':'Q45'},[True,mana],[mana>=FROST_DECISION['manaCost'],mana-FROST_DECISION['manaCost']])
  for i in range(5):
   for raw in[0,10,1000]:c(f'frost_no_extra_{i}_{raw}',{'rank':i+1,'ordinaryRaw':raw,'authority':'Q45'},raw,raw+FROST_DECISION['bonusDamage'])
  c('frost_source_absence_vs_Web_zero',{'id':'T292','decision':'Q45'},[None,None,0,0],[am['T292'].get('Cost1'),am['T292'].get('DataA1'),FROST_DECISION['manaCost'],FROST_DECISION['bonusDamage']])
 links=0
 if MD.exists():
  for target in re.findall(r'\]\(([^)]+)\)',MD.read_text()):
   if target.startswith('http'):continue
   path,_,anchor=target.partition('#');f=(MD.parent/path).resolve();assert f.exists(),target
   if anchor.startswith('L'):assert 1<=int(anchor[1:])<=len(f.read_text().splitlines())
   links+=1
 d['verification']={'kind':'static originalSLK/workbook/object/bytecode reread, native-stub probes and bounded Web vectors; no Warcraft execution','originalSlkRows':len(d['objectData']),'explicitValueOrAbsenceAssertions':len(numeric),'scriptJExactRawcodeMatches':0,'workbookCells':24*9,'abilityIdsW3aChecked':len(IDS+AUX),'abilityW3aOverrides':0,'unitW3uRecords':len(d['unitObjectDeltas']),'profilesPresent':sum(not x.get('profileAbsent',False)for x in [*(r['actualProfile']for r in d['ids']),*d['unitProfiles'].values()]),'unitProfilesAbsent':sum(x.get('profileAbsent',False)for x in d['unitProfiles'].values()),'bytecodeInstructionCount':sum(x['counts']['instructions']for x in d['bytecode']),'bytecodeConditions':sum(x['counts']['conditions']for x in d['bytecode']),'bytecodeReturnCount':sum(x['counts']['returns']for x in d['bytecode']),'fullFunctions':['main/f291/f34'],'partialFunctions':['main/f291/f7 PC1–56','main/f291/f8 PC1–52'],'frostPrefixInstructionCoverage':len(frostcovered),'genericPrefixInstructionCoverage':len(genericcovered),'nativeStubProbes':probes,'nativeStubProbeCount':len(probes),'specCases':cases,'specCaseCount':len(cases),'relativeLinks':links}

def render(d):
 text=json.dumps(d,ensure_ascii=False,indent=2)
 return re.sub(r'("fields": )(\{\n.*?\n\s*\})',lambda m:m.group(1)+json.dumps(json.loads(m.group(2)),ensure_ascii=False,separators=(',',':')),text,flags=re.S)+'\n'
if __name__=='__main__':
 ap=argparse.ArgumentParser();g=ap.add_mutually_exclusive_group(required=True);g.add_argument('--write',action='store_true');g.add_argument('--check',action='store_true');args=ap.parse_args();data=build();text=render(data)
 if args.write:OUT.write_text(text)
 else:assert OUT.read_text()==text,'audit differs; inspect source/decision then regenerate --write'
 print(json.dumps({'counts':data['counts'],'validation':{k:v for k,v in data['verification'].items()if k not in['nativeStubProbes','specCases']},'sha256':hashlib.sha256(text.encode()).hexdigest()},ensure_ascii=False))
