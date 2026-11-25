#!/usr/bin/env python3
"""Reproduce bounded N017–N022 source audit and deterministic Web specification vectors."""
import argparse,hashlib,itertools,json,math,re,runpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];REF=ROOT/'reference/map-6.25';OUT=ROOT/'docs/rules/creep-line-and-artillery.json';MD=OUT.with_suffix('.md')
H=runpy.run_path(str(ROOT/'tools/audit_creep_buffs_orbs.py'));read=H['read'];profile=H['profile'];code=H['code'];raw_slk=H['raw_slk'];exact_refs=H['exact_refs']
W=runpy.run_path(str(ROOT/'tools/audit_creep_supplemental_columns.py'))['read_sheet']();COLS=sorted({re.match('[A-Z]+',x)[0]for x in W},key=lambda x:(len(x),x))
IDS=[f'N{i:03}'for i in range(17,23)];UNITS=[f'n{i}'for i in range(153,159)];FUNC={'N017_19_Action':'main/f175/f0','CreateTempAndSetAbilityLv':'main/f7/f20','IsInTable':'main/f7/f7'}
BC={f:code(f)for f in list(FUNC.values())+['main/f291/f1','main/f291/f14']}
BASE='https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/'
PRIMARY=[{'url':'https://classic.battle.net/war3/undead/units/dreadlord.shtml','fact':'CarrionSwarm directional enemy area damage; no wards. Standard stock amounts/costs do not determine custom T038 missing values.'},{'url':'https://classic.battle.net/war3/basics/spellbasics.shtml','fact':'CarrionSwarm does not damage target friend; magic spells exclude magicalimmune; physical/magic categories distinct.'},{'url':'https://classic.battle.net/war3/undead/units/meatwagon.shtml','fact':'artillery splash bands and minimumrange; cannot attackair; standard siege attack type not custompierce'},{'url':'https://classic.battle.net/war3/basics/siegeunits.shtml','fact':'siege splash may hurt own units; AttackGround may shoot without targetvision'},{'url':'https://classic.battle.net/war3/nightelf/units/glaivethrower.shtml','fact':'stockAline/Vorpalblades separate; not proof custom normal weapon gets native line/splash'},{'url':BASE+'Units/UnitMetaData.slk','fact':'ua1f/h/q full/medium/small radius,uhd1/uqd1 factors,ua1p targetmask,uamn minimumrange,uaen enabledmask,udl1 damageLoss,usd1/usr1 spilldistance/radius;ua1z/uma1/umh1 missile speed/arc/homing'},{'url':BASE+'UI/WorldEditStrings.txt#L5198','fact':'full/medium/small labels; Half/Quarter field names do not force50/25% when factors explicit70/40%'},{'url':BASE+'Units/AbilityMetaData.slk','fact':'AUcs Ucs1/2/3/4=damage,maxdamage,distance,finalarea; fieldlabels not native geometry proof'}]
RULES={
 'line':{'baselineId':'creep-line-v1','ids':IDS[:3],'sourceDamage':[300,800,2200],'webDamage':[300,600,1200],'length':[900,1200,1500],'radius':[100,110,120],'speed':1200,'totalRawBudget':9999999,'spellRange':2000,'dummyTimedLife':.5,
 'script':{'gate':'main damagePC1730–1760: EXGetEventDamageData(2)!=0 and actual S hasN017 orN018 orN019 >0; nolocal RNG/illusion/hero/owner/abilityrank gate. Initial zero event,q004/q005 zero, q039bypass and B177earlyreturn remain. Damage may have been rewritten0 after initialcheck and still dispatch.','rank':'read actual S: N017>0=>1 elseN018>0=>2 else3; abilitylevelmagnitudeignored. Directcallwithoutanymarkerfallsback3; normalcallerexcludesnone.','order':'readS,T,sourceLoc; CreateTempAndSetAbilityLv(ownerS,sourceLoc,0,T038,rank,.5); SetUserData(q001,IsInTable(S,Tower_ALL)); IssueTargetOrder(q001,carrionswarm,T); ignorebool; return. No RemoveLocation/noEXSetEventDamage/noRNG/timer registered in body.','attribution':'actual projectile damage source remains q001; O is dynamically Tower_ALL[q001.userData] through original dispatcher, never replaced with towerS. IsInTable missingor nil gives-1; noO fallback or runtimefix. Duplicate table values retainfirstpairs match, original tableorder not reinterpretedasB04.','spellEvent':'AnySkillStart main/f291/f14 PC40–44/65 returns for IsTemp(q001), before Item_Skill_Action PC70; native T038 spell effect mustnot cause equipment spell procs.', 'parentDamage':'native ordinarypacket preserved; body neverzeroes/replaces it. Children are deferred by local zero-time spellcommit after parent damage transaction. Before and prior type multipliers alreadyran; After and restparent stillrun.','inheritance':'marker AOcr has noextra native contribution; upgradedunit swaps N017->18->19 atlevel1. Do not addillusionfilter toexplicitdamagegate. Generalillusion abilitycopy outside scope; ifactualS ownsmarker gatecanrun and IsInTable(S) may-1.'},
 'Q24':{'ordinaryTriggerWeapon':'n153–155 slot1weapTp=normal,atkType=magic,weapsOn1; retained weapon2aline inactive. Commit immediate ordinary unitattack at P/K; no1400 missile travel/splash/bounce fromunused fields; attack=true,ranged=false,ATTACK_TYPE_MAGIC,DAMAGE_TYPE_NORMAL. RetainoneATTACKED/critical/hit checks. mainraw attackinput fromsharedweaponstats, not hardcode2 or tableS18/S19 mapping. minRange250 andmax900/1200/1500 inclusive centergeometry selectedlocal.','cast':'accept visible alive enemy organic ground/air nonstructure/nonmechanical/nonward unit,range<=2000,nohidden/Aloc/invul/magicimmune. etherealallowed. Sourceq001 mustexist/alive andhaveT038, no silence/stun/hex/pause castlock; sourceAloc/Avulallowed. MissingCost=>explicitlocal0, missingCast/q001castpt=>local0; cooldown10fromobject startscommit. Initialblue1000 fromobject, nottowerblue.','acceptCommit':'capture target point onacceptedIssueTargetOrder; enqueuezero-timeB05 commit aftercurrentstack, noinlinechild damage. Atcommit require sourcealive/no castlock/abilityready, paylocal0,startCD10,sendoneAnySkillStart thenlaunch; ifthat eventkills/deletessourcecancelpayload. Targetlaterdeath/move cannot cancelcapturedpoint orretarget. Failedorderstillleavesdummyto.5death,no retry.','geometry':'fromdummy effectposition to acceptedpoint direction; coincidentpointusesoriginaldummyfacing0deg (+X). Reuse AUcs swept-disc localgeometry withconstant radius100/110/120 andlength900/1200/1500,speed1200. At t0 closedstartdisc, dynamiccontinuousfirstcontact withlivingeligibleunits; eachlogicaltargetonce, simultaneousB04; never stop at first main target.','targets':'percontact enemyorganic ground/air nonstructure/nonmechanical/nonward,nohidden/Aloc/invul/magicimmune. Ordinaryinvisible canbehit becausearea. targsorg preserved; do not broaden fromotherAUcs family. NoN535/control/status.','damage':'q001 actualsource false,false,ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MAGIC; fixedwebamount independentofparentdamage/crit/armor. Eachcontact d=min(rankamount,remainingrawbudget); subtractd before fullB03,finalpartialallowed,zero noevent. Snapshotrank atcreation; currentownerattribution resolvedperevent. Multiplewaveshitindependently,no onceperattack victimdedup acrosswaves.','lifetime':'.5timedlife death occurs asoriginal; doesnotcancel alreadylaunchedwave. Keepdeadq001 sourceidentity available through its ownwave finalcontact (max1.25s), do notrevive/extendaliveperiod/replacewithtower. Naturalcorpse cleanup cannotprematurelyerase retained damageidentity; explicitRemoveUnit cancelsremainingwave. Parenttowerdeath/upgrade/removaldoesnot byitselfdeleteq001 orrewriteuserData; originaldynamicO maynil. Thisretention is localQ24,not provenclientbehavior; shareddeathsideeffects remain.','termination':'one wave ends at length or exhaustedbudget; speed/visualturning/terrainheight do notchangegeometry. Deleteq001 duringwave cancelsremainingcontacts; targetchangesrechecked eachcontact. No additionalhitcheck/ordinarycrit onspellcontacts.','state':'savecapturedpoint,rank,origin/direction,travelprogress,visitedlogicalIDs,remainingrawbudget,q001sourceidentity+userdata/deadstate,commit/death/endqueueandsequence. No repeatedRNG orspawn onload.'}},
 'artillery':{'baselineId':'creep-artillery-v1','ids':IDS[3:],'units':UNITS[3:],'weaponSlot':1,'attackType':'pierce','weaponType':'artillery','worldObjectBoundary':{'knownReachable':'LTlt tree generated by N549; source HP50,armorWood,targTypetree','snapshot':'reference/map-6.25-pathing/units_destructabledata.slk:2505–2529','contract':'artillery supplies geometry-scaled rawWeaponDamage, actualS and PIERCE/NORMAL to shared world-object damage; do not use unit B03/anyUnitDamaged for nonunits. World-object life,armor/material mapping and death/pathing lifecycle are explicitly external, not implied as completed by sixID unitcombat audit.'},'minimumRange':250,'maximumRange':[1000,1200,1400],'fullRadius':150,'mediumRadius':300,'outerRadius':[400,450,500],'mediumFactor':.7,'outerFactor':.4,'speed':900,'homing':False,'arcSourceFloat':0.30000001192092896,'cooldownBase':2,'damagePointBase':.7,'backswingBase':1.3,
 'source':'N020–022 AOcr descriptionmarkers only,noexactLua/FourCC references; actualweaponownsarea. initialcarriersalsoN159, preserveexistinggoldstatisticsrule. w3u overrides projectileart/speed900/arc/homing0, noability/weaponsOn/splash/damage overrides. secondweap siege/missile onlystructure hasweapsOn1=>inactive, not a secondpacket.',
 'Q24':{'launch':'ordinaryattacktimingC2/P.7/B1.3 scaledbyK; selectslot1only. enemyvisible directunit targets groundnonstructure inclorganic/mechanical/ward (directmask); excludeair/hidden/Aloc/invul/ethereal; magicimmuneallowedphysical. Direct manualfriendlyattack allowedonlyexplicitcommand ordinaryinterface, notautotarget. pointAttackGround allowed evenfog. range250..rankmax centerclosed ataccept+launch; cannotshootbelow250 even if splashwouldreach. If unitdies/becomesillegalbeforelaunch cancel; changingrangebeforelaunchrechecks.','point':'snapshot targetground XY atattackcommit, noleading/prediction/homing. Afterlaunch moving/dying/vanishingtargetdoesnotretarget orcancel shell. Flighttimehorizontalcenterdistance/900 roundedB05; arc.30000001192092896 visualonly, terrain/modelcollision notblocking thisballistic shot. Impactatfixedpoint,zeroextraarrivaldelay. source deathkeepsshell,explicitdeletioncancels.','hit':'oneordinaryroll/registeredcrit snapshot per unit-targetattack atlaunch; sourceRNG consumedonce, no RNGpercollateral. To avoidunprovedmissscatter, a failedordinarymainhit keepsshell and point but exempts that designatedmainunit fromthisshot; collateral stillsplash. Groundorder hasno designatedmainunit ortargetspecificcrit roll (M=1 unlessindependentlyactiveuntargetedattackcontribution); nofakeATTACKED target. No evasion/uphillpercollateral; range/point geometry stillrequiresvictimatimpact. Thesearelocalnativechoices,notnativeparityclaim.','geometry':'onimpact takeclosedoutercircle centeredfixedpoint; primaryifstilleligibleinside goesfirst,remainingB04; eachlogicalunitatmostonce. For d<=150 factor1;150<d<=300 factor.7;300<d<=outer factor.4;outside0. Centerdistance no collisionradius inflation; no linearinterpolation/no summingoverlappingrings/no damageLoss bouncefactor. Originalmain getsitscurrentdistanceband,notguaranteed100% ifmoved. No extramainpacket inadditiontosplash.','targets':'splashTargs ground,structure,debris,tree,wall hasnoenemyonly filter: eligiblegroundunits inclbuildings/mechanical,self/friendly/neutral/enemy,notair/hidden/Aloc/invul/ethereal. Ordinaryinvisible allowed. Magicimmune receivesphysicalweapon damage. invulnerable originaltowersremainunharmed. Ward/item categories onlyreceive ifthey aredesignatedmain stillwithinoutercircle anddirectlegal; notarbitrarycollateralbecauseabsentmask. Trees/destructibles/items areworldobjects,notunitcallbacks; existingworldobjectdamage interface mustapply their ownlife/defense andno fabricatedanyUnitDamaged; fullworldobjectimport outside sixskills.','raw':'R=sharedordinaryweaponrawamount fromoneattack snapshot, M=registerednativecriticalmax once, f=actualillusionoutputcoefficient; base splash=(R*M)*f*band. FixedonhitB appliesonlydesignatedmain once, giving((R*M)+B)*f*band; no B spread, crit reroll, extraATTACKED orpostcallbackmainvalue usedasbasis. Valuesdmgplus/dice/sides keptraw sourcefacts; S18/S19/globalworkbookattack decomposition still external, notinventedhere.','events':'actualsourceoriginaln156..158,attack=true,ranged=true,ATTACK_TYPE_PIERCE,DAMAGE_TYPE_NORMAL for eachunit packet. Eachhasindependent B03 andoriginal mapdispatch (therefore native onhitmodule guardshouldonlymain, but Lua damagehooks usingattackflag mayrunpercollateral). No dummy/UnitDamagePoint substitution. Nested targetdeath/immune/statechanges rechecked beforeeachpacket; othernewunitsoutsideinitialsnapshot waitnextshot. Parent/item/mode/goldcallbacksnotbatched or bypassed.','inheritance':'markers no additionalnativecrit; rankupgrade replacesweaponprofile/futuremarkers butinflight shot keepslaunchedprofile/raw/RNG/owneridentity. Source S remainsactual ifillusion; base f inheritedfromseparatelyauditedillusioncreation, notchosenhere. No implicitcopyofmarkerstoillusions.','control':'no stun/slow/debuff/spellcast/N535/mana/newCD otherthanordinaryattack; mask/noeffectmarkerremovaldoesnotremoveexistingartilleryweapon.','state':'saveorigin/impactpoint/flightdue/actualS,rawattackcomponents and M/f/Bmain eligibility/ordinaryhitresult/rankrings,targetlogicalID,attackID,queueorder. Never redraw damage/RNG onload.'}}
}
def function_index(name,f,a=1,b=None):
 ks,ins,lab,lines=BC[f];b=b or len(ins);conds=[]
 for pc in range(a,b+1):
  op,*args=ins[pc-1]
  if op in['eq','lt','le','test']:
   flag=args[-1]=='1'if op=='test'else args[0]=='1';yes,no=(pc+1,pc+2)if flag else(pc+2,pc+1)
   def dest(p):return lab[ins[p-1][-1]]if ins[p-1][0]=='jmp'else p
   conds.append({'pc':pc,'line':lines[pc-1],'raw':' '.join(ins[pc-1]),'truePC':dest(yes),'falsePC':dest(no)})
  elif op=='tforloop':conds.append({'pc':pc,'line':lines[pc-1],'raw':' '.join(ins[pc-1]),'predicate':'next iterator key is not nil','truePC':lab[args[1]],'falsePC':pc+1})
 return {'name':name,'function':f,'pcRange':[a,b],'sourceLines':[lines[a-1],lines[b-1]],'full':a==1 and b==len(ins),'counts':{'instructions':b-a+1,'conditions':len(conds),'calls':sum(x[0]=='call'for x in ins[a-1:b]),'returns':sum(x[0]=='return'for x in ins[a-1:b])},'conditions':conds,'returnPCs':[p for p in range(a,b+1)if ins[p-1][0]=='return']}
def build():
 objs={}
 def obj(fn,key,id):
  z=next(r for r in read(fn)if r[key]==id);k=fn+':'+id;ls=(REF/fn).read_text().splitlines();objs[k]={'path':'reference/map-6.25/'+fn,'line':next(i+1 for i,t in enumerate(ls)if '"'+key+'": "'+id+'"'in t),'fields':z};return k
 a=read('war3map.w3a.json');u=read('war3map.w3u.json');records=[]
 for id in IDS:
  rows=[int(k[1:])for k,v in W.items()if k.startswith('F')and v==id];records.append({'id':id,'family':'line'if id in IDS[:3]else'artillery','workbook':[{'sheet':'塔技能','row':r,'cells':{c+str(r):W.get(c+str(r),'')for c in COLS}}for r in rows],'object':obj('units_abilitydata.json','alias',id),'w3aOverrides':[r for r in a if id in[r['old'],r['new']]],'actualProfile':profile(id),'initialCarriers':[r['unitAbilID']for r in read('units_unitabilities.json')if id in r.get('abilList','').split(',')],'status':'bounded-Web-spec-defined','nativeParity':'unproved'})
 for id in['T038','AUcs']:obj('units_abilitydata.json','alias',id)
 for id in UNITS+['q001']:
  for fn,key in [('units_unitabilities.json','unitAbilID'),('units_unitweapons.json','unitWeapID'),('units_unitbalance.json','unitBalanceID'),('units_unitdata.json','unitID')]:obj(fn,key,id)
 d={'schemaVersion':1,'baselineIds':['creep-line-v1','creep-artillery-v1'],'scope':'sixworkbook IDs with fullN017_19_Action, directhelpers, damageentry fragment, T038 nativewave and scopedartilleryadapter; nofullglobalattackstat decomposition orworlddestructibleimport','sourceFiles':{f:{'path':'reference/map-6.25/'+f,'sha256':hashlib.sha256((REF/f).read_bytes()).hexdigest()}for f in ['main.disasm','war3map.j','units_abilitydata.json','war3map.w3a.json','war3map.w3u.json','units_unitweapons.json','units_unitabilities.json','units_unitbalance.json','units_unitdata.json','units_campaignabilitystrings.txt']},'workbook':{'path':'图鉴.xlsx','sha256':hashlib.sha256((ROOT/'图鉴.xlsx').read_bytes()).hexdigest(),'actualColumns':COLS,'supplementalAssessment':'all6Jcellsexplicitlyempty; noJnumericconflict; empty notzero'},'ids':records,'objectData':objs,'auxiliaryAbility':{'id':'T038','actualProfile':profile('T038'),'w3aOverrides':[r for r in a if'T038'in[r['old'],r['new']]]},'unitObjectDeltas':[r for r in u if set([r['old'],r['new']])&set(UNITS+['q001'])],'literalReferences':exact_refs(IDS+['T038']+UNITS),'functions':[function_index(n,f)for n,f in FUNC.items()],'fragments':[function_index('damageN017gate','main/f291/f1',1730,1760),function_index('tempSpellEarlyReturn','main/f291/f14',40,65)],'sourceCallerContext':{'reused':'docs/rules/damage-pipeline.json','function':'main/f291/f1','initialZeroReturnPC':27,'q039BypassPC':[98,105],'B177ReturnPC':214,'beforePC':107,'lineActionPC':1760,'afterPC':1917,'rawSourceRegister':'r0','ownerRegister':'r2','actualSourceNotOwnerForMarker':True,'noLocalIllusionBlock':True},'primarySources':PRIMARY,'numericDecisions':[{'id':'workbook-priority-N018-N019','source':[300,800,2200],'web':[300,600,1200],'workbookCells':['H754','H755','H756'],'authority':'globaluserworkbooknumericpriority','status':'applied'}],'families':RULES,'sharedDependencies':['B03','B04','B05','attack-timing-v1','aocr-marker-contribution-v1','native-critical-family-v1','N159goldrule','AUcs-swept-disc geometry fromcreep-native-001-053-v1 (own organicmask)','shared attack-stat R mapping (S18/S19 remainsunresolvedexternally)'],'remaining':['No matchingWarcraftclient proof; explicitQ24 nativegeometry/timing/classification choices areimplementable Web rules.','Globalordinaryrawattack/statcomponent mapping notdecidedhere; rawweaponfields retained and R input exposed.','Worldobjectlife/defense/import andgenericillusioncreation remainexternal, no fabricatedunitdamageevents.','Fullglobalbuild/death/item/mode callees notrecursivelyclosed bythese6skills.'],'verification':{}}
 d['worldObjectSample']={'path':'reference/map-6.25-pathing/units_destructabledata.slk','sha256':hashlib.sha256((ROOT/'reference/map-6.25-pathing/units_destructabledata.slk').read_bytes()).hexdigest(),'lines':[2505,2529],'id':'LTlt','fields':next(r for r in raw_slk('../map-6.25-pathing/units_destructabledata.slk')if r['DestructableID']=='LTlt'),'scope':'source-only, no world-object defense/death closure claim'}
 validate(d);return d

def probe(f,env,args=(),start=1,stop=None,registers=None):
 """Interpret only the audited instructions with deterministic native stubs."""
 ks,ins,labels,lines=BC[f];r={'r'+str(i):v for i,v in enumerate(args)};r.update(registers or {});pc=start;top=0;trace=[];stop=stop or len(ins)
 def val(a):return ks[a]if a.startswith('k')else r.get(a)
 def truth(a):return a is not None and a is not False
 def results(base,v,c):
  nonlocal top
  vs=v if isinstance(v,tuple)else(v,)
  for j in range(len(vs)if c==0 else c-1):r['r'+str(base+j)]=vs[j]if j<len(vs)else None
  if c==0:top=base+len(vs)
 while start<=pc<=stop:
  trace.append(pc);assert len(trace)<1000,(f,'loop');op,*a=ins[pc-1];n=pc+1
  if op=='gettabup':r[a[0]]=(env if a[1]=='u0'else env['_u1'])[val(a[2])]
  elif op in['loadk','move']:r[a[0]]=val(a[1])
  elif op=='gettable':r[a[0]]=val(a[1]).get(val(a[2]))
  elif op=='call':
   b=int(a[0][1:]);count=int(a[1]);v=val(a[0])(*[r.get('r'+str(j))for j in range(b+1,b+count if count else top)])
   if int(a[2])!=1:results(b,v,int(a[2]))
  elif op in['eq','lt','le']:
   l,q=val(a[1]),val(a[2]);pred=l==q if op=='eq'else l<q if op=='lt'else l<=q;n+=int(pred!=(a[0]=='1'))
  elif op=='test':n+=int(truth(val(a[0]))!=(a[1]=='1'))
  elif op=='jmp':n=labels[a[1]]
  elif op=='tforcall':
   b=int(a[0][1:]);v=val(a[0])(r.get('r'+str(b+1)),r.get('r'+str(b+2)));results(b+3,v,int(a[1])+1)
  elif op=='tforloop':
   b=int(a[0][1:]);v=r.get('r'+str(b+1))
   if v is not None:r[a[0]]=v;n=labels[a[1]]
  elif op=='return':
   b=int(a[0][1:]);return [r.get('r'+str(j))for j in range(b,b+int(a[1])-1)],trace
  else:raise AssertionError((f,pc,op))
  pc=n
 return [],trace

def validate(d):
 raw={n:raw_slk(n+'.slk')for n in ['units_abilitydata','units_unitweapons','units_unitdata','units_unitbalance','units_unitabilities']}
 for o in d['objectData'].values():assert o['fields']in raw[Path(o['path']).stem]
 am={x['alias']:x for x in read('units_abilitydata.json')};uw={x['unitWeapID']:x for x in read('units_unitweapons.json')};ua={x['unitAbilID']:x for x in read('units_unitabilities.json')};ub={x['unitBalanceID']:x for x in read('units_unitbalance.json')};checks=[]
 def fields(table,id,**expected):
  for k,v in expected.items():assert table[id].get(k)==v,(id,k,v,table[id].get(k));checks.append([id,k,v])
 for id in IDS:fields(am,id,code='AOcr',levels=1,DataA1=None,DataB1=None,DataC1=None,DataD1=None,DataE1=None)
 fields(am,'T038',code='AUcs',levels=3)
 for lv,damage,length,radius in zip([1,2,3],[300,800,2200],[900,1200,1500],[100,110,120]):
  fields(am,'T038',**{k+str(lv):v for k,v in {'DataA':damage,'DataB':9999999,'DataC':length,'Area':radius,'DataD':radius,'Rng':2000,'Cool':10,'Cost':None,'Cast':None,'Dur':None,'HeroDur':None,'targs':'ground,air,organic'}.items()})
 for i,u in enumerate(UNITS[:3]):
  fields(uw,u,weapsOn=1,weapTp1='normal',atkType1='magic',weapTp2='aline',rangeN1=[900,1200,1500][i],minRange=250,cool1=1.7,dmgpt1=.1,backSw1=1.9,dmgplus1=1,dice1=1,sides1=1)
  assert f'N{17+i:03}'in ua[u]['abilList'].split(',')
 for i,u in enumerate(UNITS[3:]):
  fields(uw,u,weapsOn=1,weapTp1='artillery',atkType1='pierce',atkType2='siege',weapTp2='missile',rangeN1=[1000,1200,1400][i],minRange=250,cool1=2,dmgpt1=.7,backSw1=1.3,Farea1=150,Harea1=300,Hfact1=.7,Qarea1=[400,450,500][i],Qfact1=.4,dmgplus1=[826,1454,3356][i],dice1=1,sides1=[23,43,62][i],damageLoss1=None,targs1='ground,debris,tree,wall,item,ward',splashTargs1='ground,structure,debris,tree,wall')
  assert f'N{20+i:03}'in ua[u]['abilList'].split(',')and'N159'in ua[u]['abilList'].split(',')
 for i,u in enumerate(UNITS):
  mods={m['key']:m['value']for o in d['unitObjectDeltas']if o['old']==u for m in o['mods']}
  assert mods['ua1z']==(1400 if i<3 else 900)and mods['umh1']==0
  assert math.isclose(mods['uma1'],.05 if i<3 else .3,abs_tol=2e-8)
  assert not(set(mods)&{'uaen','ua1w','ua1t','ua1f','ua1h','ua1q','uhd1','uqd1','ua1b','ua1d','ua1s','uabi','ua1p'})
 fields(ub,'q001',mana0=1000,manaN=1000,HP=65);fields(uw,'q001',castpt=None,weapsOn=None)
 assert set(ua['q001']['abilList'].split(','))=={'Avul','Aloc'}
 assert d['auxiliaryAbility']['w3aOverrides']==[]
 assert d['auxiliaryAbility']['actualProfile']['fields']['Missilespeed']=='1200'and d['auxiliaryAbility']['actualProfile']['fields']['Order']=='carrionswarm'
 assert [d['worldObjectSample']['fields'][k]for k in['HP','armor','targType']]==[50,'Wood','tree']
 assert len(d['ids'])==6 and sum(len(x['workbook'])for x in d['ids'])==6
 for x in d['ids']:
  assert x['w3aOverrides']==[]and len(x['initialCarriers'])==1
  for w in x['workbook']:
   r=str(w['row']);assert w['cells']['H'+r]==x['actualProfile']['fields']['Ubertip'];assert w['cells']['G'+r]=='1'and w['cells']['I'+r]==w['cells']['J'+r]==''
 assert all(not re.search(r'(?<![A-Za-z0-9])'+id+r'(?![A-Za-z0-9])',(REF/'war3map.j').read_text())for id in IDS+['T038'])
 # Neither the simple marker IDs nor artillery carrier IDs have a Lua implementation.
 for id in IDS[3:]+UNITS:assert d['literalReferences'][id]==[],(id,d['literalReferences'][id])
 probes=[];coverage={f:set()for f in BC};calls=[]
 def run(f,env,args=(),start=1,stop=None,registers=None):
  result,tr=probe(f,env,args,start,stop,registers);coverage[f].update(tr);return result
 def pairs(t):
  keys=list(t)
  def it(state,prev):
   i=0 if prev is None else keys.index(prev)+1
   return (keys[i],state[keys[i]])if i<len(keys)else(None,None)
  return it,t,None
 for target,table,expected in [(None,{7:'S'},-1),('S',{},-1),('S',{7:'T'},-1),('S',{2:'T',7:'S'},7),('S',{9:'S',2:'S'},9)]:
  assert run(FUNC['IsInTable'],{'pairs':pairs},[target,table])==[expected];probes.append({'id':'lookup_'+str(len(probes)),'expected':expected,'note':'pairs order is controlled only by stub; original order not claimed'})
 for custom in[None,False,'q007',0]:
  calls=[];dummy={'id':'D'}
  env={'GetId':lambda a:a,'CreateUnitAtLoc':lambda p,id,loc,face:calls.append(['create',p,id,loc,face])or dummy,'UnitAddAbility':lambda u,id:calls.append(['add',id]),'SetUnitAbilityLevel':lambda u,id,lv:calls.append(['level',id,lv]),'UnitApplyTimedLife':lambda u,buff,t:calls.append(['life',buff,t])}
  assert run(FUNC['CreateTempAndSetAbilityLv'],env,[2,'XY',0,'T038',2,.5,custom])==[dummy]
  assert calls==[['create',2,'q001'if custom is None or custom is False else custom,'XY',0],['add','T038'],['level','T038',2],['life','BHwe',.5]]
  probes.append({'id':'dummy_'+repr(custom),'expected':calls})
 for levels in itertools.product([0,2],repeat=3):
  for orderok in[False,True]:
   for found in[False,True]:
    calls=[];S='actualS';T='target';D='dummy';rank=1 if levels[0]else 2 if levels[1]else 3
    env={'GetEventDamageSource':lambda:S,'GetTriggerUnit':lambda:T,'GetUnitLoc':lambda s:'XY','GetId':lambda a:a,'GetUnitAbilityLevel':lambda s,id:levels[IDS.index(id)],'GetOwningPlayer':lambda s:2,'CreateTempAndSetAbilityLv':lambda *a:calls.append(['create',*a])or D,'Tower_ALL':{7:S}if found else{},'IsInTable':lambda s,t:7 if found else-1,'SetUnitUserData':lambda u,n:calls.append(['userData',u,n]),'IssueTargetOrder':lambda *a:calls.append(['order',*a])or orderok}
    assert run(FUNC['N017_19_Action'],env)==[]
    expected=[['create',2,'XY',0,'T038',rank,.5],['userData',D,7 if found else-1],['order',D,'carrionswarm',T]];assert calls==expected
    probes.append({'id':f'action_{levels}_{orderok}_{found}','expectedRank':rank,'orderReturnIgnored':True,'userData':7 if found else-1})
 for attack in[0,1,-1]:
  for levels in itertools.product([0,1],repeat=3):
   calls=[];env={'_u1':{'EXGetEventDamageData':lambda slot:attack},'GetId':lambda a:a,'GetUnitAbilityLevel':lambda s,id:levels[IDS.index(id)],'N017_19_Action':lambda:calls.append('action')}
   run('main/f291/f1',env,start=1730,stop=1760,registers={'r0':'S','r2':'otherOwner'})
   expected=bool(attack and any(levels));assert bool(calls)==expected;probes.append({'id':f'gate_{attack}_{levels}','expected':expected})
 for temp,skill in[(True,'T038'),(False,'T038'),*( (False,x)for x in['T033','A040','A070','A210'])]:
  env={'IsTemp':lambda s:temp,'GetId':lambda a:a};_,trace=probe('main/f291/f14',env,start=40,stop=65,registers={'r0':skill,'r1':'q001'});coverage['main/f291/f14'].update(trace)
  assert (trace[-1]==65)==(temp or skill!='T038')
  probes.append({'id':f'spell_filter_{temp}_{skill}','expected':'return65'if temp or skill!='T038'else'exit66'})
 # Every reachable instruction covered; compiler-final returns are truly unreachable.
 dead={FUNC['CreateTempAndSetAbilityLv']:{33},FUNC['IsInTable']:{17}}
 for f in FUNC.values():assert coverage[f]==set(range(1,len(BC[f][1])+1))-dead.get(f,set()),(f,set(range(1,len(BC[f][1])+1))-coverage[f])
 assert coverage['main/f291/f1']==set(range(1730,1761))
 assert coverage['main/f291/f14']==set(range(40,66))
 cases=[]
 def equivalent(expected,actual):
  if isinstance(expected,(float,int))and not isinstance(expected,bool):return math.isclose(expected,actual,rel_tol=1e-12,abs_tol=1e-12)
  if isinstance(expected,list):return len(expected)==len(actual)and all(equivalent(a,b)for a,b in zip(expected,actual))
  return expected==actual
 def case(id,inputs,expected,actual):
  assert equivalent(expected,actual),(id,expected,actual)
  cases.append({'id':id,'input':inputs,'expected':expected})
 def band(distance,outer):return 1 if distance<=150 else .7 if distance<=300 else .4 if distance<=outer else 0
 for outer in[400,450,500]:
  for dist,exp in[(0,1),(150,1),(150.001,.7),(300,.7),(300.001,.4),(outer,.4),(outer+.001,0)]:case(f'band_{outer}_{dist}',{'distance':dist,'outer':outer},exp,band(dist,outer))
 for rank,length,radius,damage in zip([1,2,3],[900,1200,1500],[100,110,120],[300,600,1200]):
  case('line_amount_'+str(rank),{'rank':rank},damage,RULES['line']['webDamage'][rank-1])
  case('line_front_end_time_'+str(rank),{'length':length,'speed':1200},[.75,1,1.25][rank-1],length/1200)
  case('line_full_spell_independent_'+str(rank),{'parentDamage':1,'parentCrit':4,'rank':rank},damage,RULES['line']['webDamage'][rank-1])
  for y,expected in[(radius,True),(radius+.001,False)]:case(f'line_radius_{rank}_{y}',{'x':length/2,'y':y},expected,abs(y)<=radius)
 # Swept disc first-contact against a stationary center, in source-local coordinates.
 def contact(x,y,radius,length):
  if x*x+y*y<=radius*radius:return 0
  if abs(y)>radius:return None
  at=x-math.sqrt(radius*radius-y*y)
  return max(0,at)/1200 if 0<=at<=length else None
 for point,exp in[((0,0),0),((-100,0),0),((-101,0),None),((500,100),500/1200),((1000,0),.75),((1000.001,0),None),((0,100.001),None)]:case('wave_contact_'+str(point),{'center':point,'radius':100,'length':900},exp,contact(*point,100,900))
 for remain in[0,10,300,301]:case('budget_'+str(remain),{'rawRemaining':remain,'nominal':300},[min(300,remain),max(0,remain-300)],[min(300,remain),remain-min(300,remain)])
 for dist in[249.999,250,1000,1000.001]:case('artillery_range_'+str(dist),{'distance':dist,'rankMax':1000},250<=dist<=1000,250<=dist<=RULES['artillery']['maximumRange'][0])
 for dist,due in[(0,0),(450,500000),(900,1000000),(1000,1111111)]:case('flight_us_'+str(dist),{'distance':dist,'speed':900},due,math.floor(dist/900*1000000+.5))
 for f,expected in[(1,420),(.7,294),(.4,168)]:case('splash_base_'+str(f),{'R':100,'M':4.2,'fIllusion':1,'band':f},expected,100*4.2*f)
 case('main_fixed_only',{'R':100,'M':3,'B':25,'band':.7},[227.5,210],[(100*3+25)*.7,(100*3)*.7])
 case('original_parent_not_replaced',{'parentRaw':2,'waveRaw':600},[2,600],[2,RULES['line']['webDamage'][1]])
 case('line_dynamic_O',{'userdata':7,'Tower_ALL_before':{7:'old'},'Tower_ALL_now':{7:'new'}},'new',{7:'new'}.get(7))
 case('line_absent_owner',{'userdata':-1,'Tower_ALL':{}},None,{}.get(-1))
 case('artillery_no_enemy_filter',{'candidates':[(3,'enemy'),(2,'friend'),(1,'neutral')]},[1,2,3],sorted([3,2,1]))
 case('primary_first_then_B04',{'main':7,'candidates':[9,1,7,4]},[7,1,4,9],[7]+sorted(set([9,1,7,4])-{7}))
 case('failed_mainhit_still_collateral',{'main':7,'hit':False,'candidates':[7,1,2]},[1,2],[x for x in[7,1,2]if x!=7])
 case('dynamic_death_recheck',{'snapshot':[7,1,2],'aliveAfterFirst':[7,2]},[7,2],[x for x in[7,1,2]if x in[7,2]])
 case('one_damage_event_per_unit',{'main':7,'snapshot':[7,2,7]},[7,2],list(dict.fromkeys([7,2,7])))
 case('dummy_dead_but_retained',{'timedLife':.5,'contactTime':1.25,'explicitlyRemoved':False},[False,True],[1.25<.5,not False])
 case('dummy_explicitly_removed',{'contactTime':1,'removeTime':.8},False,1<.8)
 # Assert hashes/relative line links and compact source indices without embedding bytecode.
 links=0
 if MD.exists():
  for link in re.findall(r'\]\(([^)]+)\)',MD.read_text()):
   if '://'in link or link.startswith('#'):continue
   p,_,anchor=link.partition('#');dest=(MD.parent/p).resolve();assert dest.exists(),link
   if anchor.startswith('L'):assert 1<=int(anchor[1:])<=len(dest.read_text().splitlines()),link
   links+=1
 d['verification']={'kind':'read-only originalSLK/objects/workbook + bounded Lua VM with native stubs + Web specification vectors; no Warcraft execution','originalSlkRows':len(d['objectData']),'explicitFieldAssertions':len(checks),'workbookRows':6,'workbookCells':6*len(COLS),'supplementalJCells':6,'abilityW3aNoOverrides':7,'unitW3uRecords':len(d['unitObjectDeltas']),'fullFunctionCounts':{x['function']:x['counts']for x in d['functions']},'fragmentCounts':{x['function']:x['counts']for x in d['fragments']},'reachableInstructionCoverage':{f:len(s)for f,s in coverage.items()},'unreachableCompilerReturns':{f:sorted(s)for f,s in dead.items()},'nativeStubProbeCount':len(probes),'nativeStubProbes':probes,'specCaseCount':len(cases),'specCases':cases,'relativeLinks':links}

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--write',action='store_true');parser.add_argument('--check',action='store_true');args=parser.parse_args();data=build();s=json.dumps(data,ensure_ascii=False,indent=2)+'\n'
 if args.write:OUT.write_text(s)
 if args.check:assert OUT.read_text()==s,'Generated evidence differs; inspect before --write'
 print(json.dumps({'baselines':data['baselineIds'],'verification':{k:v for k,v in data['verification'].items()if k not in['nativeStubProbes','specCases']},'sha256':hashlib.sha256(s.encode()).hexdigest()},ensure_ascii=False))
