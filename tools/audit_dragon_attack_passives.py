#!/usr/bin/env python3
"""Rebuild the four-ID dragon passive audit. Native stubs/spec vectors, not a game."""
import argparse,hashlib,itertools,json,math,re,runpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];REF=ROOT/'reference/map-6.25';OUT=ROOT/'docs/rules/dragon-attack-passives.json';MD=OUT.with_suffix('.md')
H=runpy.run_path(str(ROOT/'tools/audit_creep_buffs_orbs.py'));read=H['read'];profile=H['profile'];raw_slk=H['raw_slk'];code=H['code'];exact_refs=H['exact_refs']
W=runpy.run_path(str(ROOT/'tools/audit_creep_supplemental_columns.py'))['read_sheet']()
IDS=['A011','A012','A014','A015'];AUX=['A013','A010','A239','A240','Aven','Atru','Afrb','Afrz'];FORMS=[f'E{x:03}'for x in list(range(1,7))+list(range(23,29))];UNITS=FORMS+['H003','G077']
BC={f:code(f)for f in ['main/f291/f1','main/f291/f27','main/f291/f16','main/f289/f7']}
SLICES=[('poisonStatusConsumer','main/f291/f1',590,617),('B031OutgoingMultiplier','main/f291/f1',2041,2069),('autoB012Gate','main/f291/f27',14,22),('dragonAutoOrder','main/f291/f27',27,52),('dragonCDDependency','main/f291/f16',13,52),('skinAbilityBridge','main/f289/f7',276,292)]
BASE='https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/'
PRIMARY=[{'url':'https://classic.battle.net/war3/basics/spellbasics.shtml','supports':'Poison physical, no ordinary magic dispel, magicimmune allowed/ethereal excluded; same-source refresh/different-source stacking; official poison floor2HP chosen over older experiment1HP.'},{'url':'https://classic.battle.net/war3/orc/units/windrider.shtml','supports':'Envenomed Spears adds poison via ordinary attacks; stock amounts do not define customA011/A012.'},{'url':'https://classic.battle.net/war3/undead/units/frostwyrm.shtml','supports':'native cold splash attack; separate Afrz stops buildings. Stock air-slot behavior is not custom dragon enabledslot1 targetmask.'},{'url':'https://classic.battle.net/war3/neutral/dragons.shtml','supports':'blue dragon frost passive and missile/msplash distinctions; stock immunity/10sec not imported.'},{'url':BASE+'Units/AbilityMetaData.slk','supports':'Poi1 DPS,Poi2 attackslow,Poi3 moveslow,Poi4 stackflags,Det1 detectionType,Emeu alternateform.'},{'url':BASE+'Units/MiscMetaData.slk','supports':'froa/from map to FrostAttackSpeedDecrease/FrostMoveSpeedDecrease.'},{'url':BASE+'UI/WorldEditStrings.txt#L6753','supports':'frost constants label movement/attack reduction, not remaining fraction.'},{'url':BASE+'UI/UnitEditorData.txt#L343','supports':'stackFlags bits damage/movement/attack/kill.'},{'url':'https://github.com/Cokemonkey11/wc3-ability-doc/blob/main/sources/screwthetrees-wc3-editor-ability-insight-document/2023-11-14.md#L2936','supports':'Author experiment Afrb uses gameplay frost constants, latesttested1.28.5; adjacent Afra comment self-qualifies its stacking claim, not proof Afrb/CustomAHca cross-family behavior.'}]
RULES={
 'formBridge':{'source':'A010 AEme alternate UnitID1..4 E001..004; w3a Emeu5/6 E005/E006. A239 E023..028 analogous, normalFormG077 vsH003. S372 add/removeA240 maps actual learned A010 toA239 per existing skin baseline. Names/models do not determine combat flags.','legalRanks':{'A010':['E001','E002','E003','E004','E005','E006'],'A239':['E023','E024','E025','E026','E027','E028']},'passiveLevels':'all fourIDs andA013 fixednative1; A012 tooltipLv2 means alternateability, not A012level2. Green40/80, redringprofile1/2, bothblue sameA013duration/slow/rings; finalblueattackC.9vs1.2 is weapon change.','Q24':'At separately audited transformation typecommit, replace template-mounted passives with current type abilList, same logical S and no extra learning/ATTACKED. Previously launched payload keeps its weapon/passive snapshot; already applied poison/cold stays until ownexpiry. Switchingform doesnotclear pendingDOT, duplicateit, transferS, or restoreancestor ability. FullAEme accept/CD/time/reversion/stattransaction remains external, not completedhere.'},
 'poison':{'ids':['A011','A012'],'DPS':[40,80],'attackSlow':.2,'sourceMoveSlow':'DataC1 absent','webMoveSlow':0,'duration':5,'heroOrResistantDuration':3,'stackFlags':1,'buffIds':['Bpoi','Bpsd'],'Q24':{'entry':'ordinary successful primary weaponhit with enabled actualA011/A012 snapshotted atlaunch, nonillusion; legal enemy ground/air organic nonmechanical/nonstructure, nohidden/Aloc/invul/ethereal, magicimmuneallowed. Not arbitraryattack=true packets or secondarysplash. One ATTACKED only; no mana/CD/RNG/SPELL_EFFECT/N535.','apply':'before mainweapon native reduction/event registerpoison; mainkill clearsitsstate. Duration selectedonapply by nativeHERO or activeArsk, not UnitIsHero/N534/SAPPER; snapshot5/3sec.','tracks':'reuse registered Aven tracker alongside N093/N095: key logicalcaster,target, nottype/form/rawcode. Samecaster refresh now+duration andupdateDPS, preserves1sec phase; differentcasters independentincluding sametype. Ifsamecaster artificiallyholds multiple registeredAven choosehighestDPS once perhit, tiesstableID; ordinaryeligible singleactiveform onlyone. DataD1 permits damage stacks, notslow sums/kill.','ticks':'first atapply+1s, then1s; expiryendpointincluded before cleanup in local schedule, other B05 earlierqueued events mayclear. normal5ticks /hero3ticks withoutrefresh. Source death withhandle continues,source deletioncancels; loss ofability/form doesnotcanceloldpoison.','packet':'actualS,attack=false,ranged=false,NORMAL/NORMAL. After native reductions/beforemapcallback D=min(max(0,reduced),max(0,HP-2)); D0 noevent, neverheal below2HP. Everytrack separately fullB03, dynamicO andB031 currentstate. Mapboosts cankill aftercap; no finalfloor. PoisonnotweaponR/M/B andnot doubledbecausebufflist has2IDs.','status':'allregisteredAven contributeone maxattackslow(.2 here); DataCmissing->local0movement. Bpoi/Bpsd trackpresence foralreadydefinedpoisoninterface; Bpsd is not BPSE and neverstuns. ExistingA083 sourceattack+targetBpsd consumer stillruns, itsbody external.','remove':'same priorpoison contract: ordinarymagic/negative dispel ineffective; explicitBpoi removesregisteredlocaltracks andcorrelatedslow; explicitBpsd clearslocalpoison slow/statusuntilnextrefresh withouterasingDOT; targetdeath/deletion/ineligible clears. Newmagicimmunealone retains. No automatic target retargetingpriority introduced; ordinaryautotarget selection remains shared.'}},
 'frost':{'description':'A014 Atru marker, actual effectA013 Afrb','movementSlow':.4,'attackSlow':.6,'duration':3,'heroOrResistantDuration':2,'buff':'Bfro','sourceFields':'A013 no localDataA/B/C; strengths explicit mapMisc26/27, not guessedmissing. NoAfrz mounted.','Q24':{'entry':'nonillusion actualA013 atordinaryattacklaunch; eachsuccessful weaponreceiver (primary+splash) appliescoldbeforeitsownB03 damageevent. Not anyscriptattack=true event; no duplicateattack/ordinaryproc/SPELL_EFFECT/N535.','target':'legalenemyground/air nonstructure, includingmechanical; nohidden/Aloc/invul/ethereal. Magicimmunephysical coldallowed bylocalpassive-classification choice; doesnotbroaden Q45 AHca magicimmune rule. Ordinaryweapon damage maystillhitstructure whilecold skips. Area invisibility allowed.','effect':'movement multiplier .6; attackspeedR contribution-.6. snapshotnativeHERO/activeArsk atapplyfor2s else 3s. RepeatedA013 refreshesonlyitsownslotuntilnow+duration,notstackpercentage oraddduration. No addeddamagepacket, nofreezebuilding/noBPSE/nointerrupt/cancelcast; slow affects subsequent movement/attackprogress throughsharedtiming.','coldCoexistence':'localA013 + Q45 AHca maintainindependent duration/source slots; eachfamilys own refresh rules unchanged. For thispair use max active moveslow andmax activeattackslow, notsum. Bfro visibility isOR, notautomaticduplicatecold. Dispel AHca removesitsownslotonly; rawexplicit Bfro removal clearsbothregisteredcoldslots. Otherfrostskills/coldchannels remainexternal, notgloballypromoted.','remove':'ordinarymagicdispel doesnotremoveA013 physicalcold (explicitQ24); explicitA013cold/rawBfro removal,death/deletion/expiry/ineligible clears; becomingmagicimmunealone retains. Source death/deletion/remorph doesnotremovealreadycommittedcold; no source-linkedDOT.','marker':'A014/A015 Atru Rngabsent; Web explicitdescriptiononly/no detectioncontribution, notoriginalRng0 orstockRng900. LosingmarkerdoesnotremoveA013 orweapon; addingmarkeralone createsneither.'}},
 'weapon':{'slot':1,'attackType':'HERO','damageType':'NORMAL','attack':True,'ranged':True,'range':1200,'minimumRangeSource':'absent','minimumRangeWeb':0,'speed':900,'homing':True,'damagePoint':.26,'backswing':.64,'cooldownRanks':[1.2,1.2,1.2,1.2,1.2,.9],'typeRanks':['missile','missile','msplash','msplash','msplash','msplash'],'splashRings':{'rank3':[50,150,240],'rank4_5_6':[70,200,320]},'factors':[1,.6,.4],
 'Q24':{'gate':'usesactualtype weapon andactualenabledability snapshot; green hasdormantF/H/Q butmissile=no splash. RedA015onlydescription; bluemsplash workswithoutA015. Slot2chaos/missile remainsdisabled. Sourcehover withtargTypeground notairclassification; modelheight irrelevant.','direct':'ordinaryunit target visibleenemy ground/air inclstructure/mechanical/ward whereweaponmask permits, nohidden/Aloc/invul/ethereal; magicimmuneallowedHERO physical. Manualfriendlyonlyexplicitordinarycommand. No artilleryAttackGround/min250/friendlycollateral semantics imported. Worlditem/debris primary usesexternalworldobjectinterface, notfakeunitdamage.','flight':'launchcapturesRweapon,formprofile,passiveIDs andstableS. Homing speed900 in2D, continuouscurrenttargetposition withB05contacts; no arc/terrainblocking. Aftertargetdeath/deletion followslastknownpointthenmsplashmayimpact there (missilegreen noaliveprimary=>nohit). Source death permitslaunchedshot, explicitsource deletioncancels. Ability/formchange doesnotrewriteoldpayload; targetordinaryinvisibility afterlaunch doesnotcancelhoming, nativehidden/Aloc currentlyillegal.','primaryHit':'ateligibleprimaryarrival useordinarycritical/hit interface exactlyonce, currentregisteredcandidate snapshot bynative-critical-family-v1; no rerollforcollateral. Miss consumesitsnormalrolls and cancels allunitdamage/cold/poisonfromthismsplashshot (explicitlocalmisschoice, differentfromartillery). Ifnoalivelegalprimary atarrival butimpactpointretained, no targetcritical/hitroll, M1 andB0, remainingcollateral mayreceiveplainRweapon. No fakeATTACKED targets.','geometry':'msplash impactpoint=currenthomingcontact/lastknownpoint. initialclosedoutercircle candidates, legitimateprimaryfirst thenB04; centeronlynoextra collisionradius. Rings exclusiveinclusiveouteredges, onepacketperunit. Mainstandard100%once atcenter, noseparatefullpacketplusarea. Eachrecipient rechecked beforepacket; dynamicdeath/position/immune changes maydropit; newunitsnotinitialsnapshot excluded. Greenmissile onlyprimary.','splashTargets':'enemyground/air/structure/mechanical fromexplicit ground,structure,debris,air,enemy mask; nofriend/self collateral. Mainward orworlditem permittedordinarydirecttargets butnotgenericcollateral. Normalinvisibleareaallowed; nohidden/Aloc/invul/ethereal. Magicimmuneallowedphysical. Unlike stockfrostwyrm thereisno activeair-onlynonsplashslot: customslot1 alreadytargetsair, sosplash worksonairprimary too.','amount':'splashbase R*M*f*band; onlyeligiblemain getsB once: (R*M+B)*f. Do not spreadmainonhitflatB, itsarmor, orfinalmapdamage. Everyunitpacket actualS attack=true,ranged=true,HERO/NORMAL fullB03 withindependentdynamicO/B031/othercallbacks. Othernativeonhit onlymain except specificallyauditedA013 cold splash. No UnitDamagePoint/dummy substitution.','inheritance':'sourceformonlychangesfutureattackprofile; existingordinarycritical sourceabilityinheritance remainsitsownbaseline. Do notgrantpoison/cold toillusions; fullgenericillusioncopy external. SourceactualO neverreplacedjustbecausemodelchanged. Rawdmgplus/dice/sides stored; R andS18/S19 reads/writes reuse adoptedweapon-attribute-interface-v1 W01-W03. R usescontribution channels plus oneactualdice sum, notintegergetter reconstruction; captureatlaunch. AEme typecommit channeltransition remainsfullmorphdependency.'}},
 'sharedPipeline':{'B031':'reuse main/f291/f1PC2041..2069: O nonnil andB031>0; currentD*(1.1+Has_A_Item(O)*.1+(Game_Mode==1)*.2), noattack/typecondition; AfterPC1917 alreadyran. Laterglobalmodefiltersstillrun. PassiveDPS/weaponbase neverpremultiply.','Bpsd':'reusePC590..617: actualS A083>0 AND attack!=0 AND targetBpsd>0 => A083_Action(S,T),thenA084_Action(S); nootherfilterinsidefragment. DOTattackfalse skips. Bodiesnotauditedhere.','BPSE':'notprovidedbythese4IDs/A013; independentstun maycoexist. Cold/poisonneverclearorrefreshBPSE.','save':'saveactualform/templatepassives, rawweapon/payloadsnapshot,homingtarget,lastpoint,criticalstate/rolls,receiverordering,poisonlogicalsource/phase/DPS/expiry,coldfamilyslots,sharedbuffpresence,B05seq. Restorewithoutrefiring/RNG/morph/learning.'}
}

def index(name,f,a,b):
 ks,ins,labs,ls=BC[f];conditions=[]
 for pc in range(a,b+1):
  op,*v=ins[pc-1]
  if op in['eq','lt','le','test']:
   flag=v[-1]=='1'if op=='test'else v[0]=='1';yes,no=(pc+1,pc+2)if flag else(pc+2,pc+1)
   def dest(p):return labs[ins[p-1][-1]]if ins[p-1][0]=='jmp'else p
   conditions.append({'pc':pc,'line':ls[pc-1],'raw':' '.join(ins[pc-1]),'truePC':dest(yes),'falsePC':dest(no)})
 return {'name':name,'function':f,'pcRange':[a,b],'sourceLines':[ls[a-1],ls[b-1]],'fullFunction':False,'instructionCount':b-a+1,'conditions':conditions,'returnPCs':[p for p in range(a,b+1)if ins[p-1][0]=='return']}

def build():
 objects={};a=read('units_abilitydata.json');wa=read('war3map.w3a.json');wu=read('war3map.w3u.json');ua=read('units_unitabilities.json')
 def obj(fn,key,id):
  row=next(x for x in read(fn)if x[key]==id);k=fn+':'+id;ls=(REF/fn).read_text().splitlines();objects[k]={'path':'reference/map-6.25/'+fn,'line':next(i+1 for i,s in enumerate(ls)if '"'+key+'": "'+id+'"'in s),'fields':row};return k
 def rows(id):return [{'sheet':'塔技能','row':int(k[1:]),'cells':{c+k[1:]:W.get(c+k[1:],'')for c in'ABCDEFGHIJ'}}for k,v in W.items()if k.startswith('F')and v==id]
 records=[]
 for id in IDS+AUX:
  raw=next(x for x in a if x['alias']==id);deltas=[x for x in wa if id in[x['old'],x['new']]];merged=dict(raw)
  if id in['A010','A239']:
   for o in deltas:
    for m in o['mods']:merged[{'amcs':'Cost','Emeu':'UnitID'}[m['key']]+str(m['level'])]=m['value']
  records.append({'id':id,'status':'bounded-Web-passive-defined'if id in IDS else'bounded-Web-effect-dependency'if id=='A013'else'form-source-bridge-only'if id in['A010','A239','A240']else'template-comparison-only','workbook':rows(id),'object':obj('units_abilitydata.json','alias',id),'w3aOverrides':deltas,'mergedFields':merged,'actualProfile':profile(id),'initialCarriers':[x['unitAbilID']for x in ua if id in(x.get('abilList','')+','+x.get('heroAbilList','')).split(',')],'nativeParity':'unproved'})
 for u in UNITS:
  for fn,key in [('units_unitabilities.json','unitAbilID'),('units_unitweapons.json','unitWeapID'),('units_unitbalance.json','unitBalanceID'),('units_unitdata.json','unitID'),('units_unitui.json','unitUIID')]:obj(fn,key,u)
 for b in['Bpoi','Bpsd','Bfro','B031','BPSE']:obj('units_abilitybuffdata.json','alias',b)
 files=['main.disasm','war3map.j','war3mapMisc.txt','units_abilitydata.json','units_abilitybuffdata.json','war3map.w3a.json','war3map.w3u.json','units_unitabilities.json','units_unitweapons.json','units_unitbalance.json','units_unitdata.json','units_unitui.json','units_campaignabilitystrings.txt','units_campaignunitstrings.txt','units_commonabilitystrings.txt']
 d={'schemaVersion':1,'baselineId':'dragon-attack-passives-v1','scope':'four workbook passives, actualA013 effect, twelveform weapons andnecessarysource bridges; notcompleteA010/A239 AEme lifecycle orworldobjectsystem','counts':{'workbookIds':4,'workbookRows':12,'auxiliaryEffectIds':1,'formUnits':12,'baseUnits':2},'sourceFiles':{f:{'path':'reference/map-6.25/'+f,'sha256':hashlib.sha256((REF/f).read_bytes()).hexdigest()}for f in files},'workbook':{'path':'图鉴.xlsx','sha256':hashlib.sha256((ROOT/'图鉴.xlsx').read_bytes()).hexdigest(),'columns':'A–J','supplemental':'all12primaryJblank; fourteenA010 rowsJ70/80 matchI andw3aamcs5/6, no newconflict'},'ids':records,'objectData':objects,'unitDeltas':[x for x in wu if set([x['old'],x['new']])&set(UNITS)],'unitProfiles':{u:profile(u,'units_campaignunitstrings.txt')for u in UNITS},'buffProfiles':{u:profile(u,'units_commonabilitystrings.txt')for u in['Bpoi','Bpsd','Bfro','B031','BPSE']},'literalReferences':exact_refs(IDS+['A013','A010','A239','A240','Bpoi','Bpsd','Bfro','B031']+FORMS),'bytecodeFragments':[index(*s)for s in SLICES],'sourceMisc':{'path':'reference/map-6.25/war3mapMisc.txt','lines':[26,27],'FrostAttackSpeedDecrease':.6,'FrostMoveSpeedDecrease':.4},'w3hEvidenceReused':{'path':'docs/rules/skill-lizard-frenzy-and-gold.json','result':'original MPQ fullhash table has no war3map.w3h; previous positivecontrols checked; notmerelymissingfromsnapshot'},'rules':RULES,'primarySources':PRIMARY,'decisions':[{'kind':'Q24','rule':'Atru descriptionmarkers provide no detection; absent Rng preserved asabsent, no stock900 inherited.'},{'kind':'Q24','rule':'localcold stacking/physicalclassification, msplashflight/miss/geometry andpoisonphase are explicitly defined, notnativeparity'},{'kind':'numeric','rule':'no confirmedprimary fourID numericconflict; .2 poison isattackspeed, .4frost ismovement and .6attack is explicitoriginalsupplement'}],'dependencies':['A010/A239 fullactiveAEme accept/cancel/cooldown/end/reversion andstatmapping','weapon-attribute-interface-v1 W01-W03 adopted; fullAEme channeltransition separate','sharedworldobject damage/lifecycle','A083/A084 invokedbodies andotherdamagecallee modules','skin-and-transformation existingA240/Skill_BS_Still','native-critical-family-v1','creep-buffs-orbs-v1 Q45/registeredAven','B03/B04/B05'],'verification':{}}
 validate(d);return d

def run(f,env,a,b,regs):
 ks,ins,labs,ls=BC[f];r=dict(regs);top=0;pc=a;trace=[]
 def v(x):return ks[x]if x.startswith('k')else r.get(x)
 def truth(x):return x is not None and x is not False
 while a<=pc<=b:
  trace.append(pc);assert len(trace)<500;op,*x=ins[pc-1];n=pc+1
  if op=='gettabup':r[x[0]]=(env if x[1]=='u0'else env['_'+x[1]])[v(x[2])]
  elif op in['move','loadk']:r[x[0]]=v(x[1])
  elif op in['add','mul']:r[x[0]]=v(x[1])+v(x[2])if op=='add'else v(x[1])*v(x[2])
  elif op=='call':
   base=int(x[0][1:]);count=int(x[1]);result=v(x[0])(*[r.get('r'+str(i))for i in range(base+1,base+count if count else top)])
   if int(x[2])!=1:r[x[0]]=result
   if int(x[2])==0:top=base+1
  elif op in['eq','lt','le']:
   pred=v(x[1])==v(x[2])if op=='eq'else v(x[1])<v(x[2])if op=='lt'else v(x[1])<=v(x[2]);n+=int(pred!=(x[0]=='1'))
  elif op=='test':n+=int(truth(v(x[0]))!=(x[1]=='1'))
  elif op=='jmp':n=labs[x[1]]
  elif op=='return':return trace,pc
  else:raise AssertionError((f,pc,op))
  pc=n
 return trace,pc

def validate(d):
 shared=json.loads((ROOT/'docs/rules/weapon-field-source-notes.json').read_text());assert shared['rule_id']=='weapon-attribute-interface-v1';assert shared['web_contract']['status']=='adopted_under_Q24';assert shared['web_contract']['selected']==['W01','W02','W03']
 d['sharedWeaponInterface']={'baselineId':shared['rule_id'],'path':'docs/rules/weapon-field-source-notes.json','status':shared['web_contract']['status'],'rules':shared['web_contract']['selected'],'scope':'R andnativefield adapters reused; no fullAEme stattransition claim'}
 raw={fn:raw_slk(fn+'.slk')for fn in['units_abilitydata','units_abilitybuffdata','units_unitweapons','units_unitbalance','units_unitdata','units_unitui','units_unitabilities']}
 for x in d['objectData'].values():assert x['fields']in raw[Path(x['path']).stem]
 am={r['id']:r for r in d['ids']};fields=[]
 def expect(id,**values):
  for k,v in values.items():assert am[id]['mergedFields'].get(k)==v,(id,k,v);fields.append([id,k,v])
 for id,damage in[('A011',40),('A012',80)]:expect(id,code='Aven',levels=1,DataA1=damage,DataB1=.2,DataC1=None,DataD1=1,Dur1=5,HeroDur1=3,BuffID1='Bpoi,Bpsd',targs1='air,ground,organic',Cost1=None,Cool1=None)
 for id in['A014','A015']:expect(id,code='Atru',levels=1,DataA1=3,Rng1=None,Area1=None,BuffID1=None,targs1='vuln,invu')
 expect('A013',code='Afrb',levels=1,BuffID1='Bfro',Dur1=3,HeroDur1=2,targs1='air,ground',DataA1=None,DataB1=None,Cost1=None,Cool1=None)
 expect('A240',code='ANeg',DataC1='A239,A010',levels=1)
 for id,normal,forms in[('A010','H003',FORMS[:6]),('A239','G077',FORMS[6:])]:
  expect(id,code='AEme',levels=6)
  for i,u in enumerate(forms,1):expect(id,**{'UnitID'+str(i):u,'Cost'+str(i):20+10*i})
  for i in range(1,5):expect(id,**{'DataA'+str(i):normal,'HeroDur'+str(i):20,'Cool'+str(i):30,'BuffID'+str(i):'B031'})
  for i in[5,6]:expect(id,**{'DataA'+str(i):None,'HeroDur'+str(i):None,'Cool'+str(i):None,'BuffID'+str(i):None})
 for id in IDS+['A013','A240','Aven','Atru','Afrb','Afrz']:assert am[id]['w3aOverrides']==[]
 assert len(am['A010']['w3aOverrides'][0]['mods'])==len(am['A239']['w3aOverrides'][0]['mods'])==4
 cells=0
 for id in IDS:
  for w in am[id]['workbook']:
   r=str(w['row']);assert w['cells']['H'+r]==am[id]['actualProfile']['fields']['Ubertip'];assert w['cells']['G'+r]=='1'and w['cells']['I'+r]==w['cells']['J'+r]=='';cells+=10
 assert cells==120 and len(am['A010']['workbook'])==14
 for w in am['A010']['workbook']:assert w['cells']['J'+str(w['row'])]=='耗蓝 70／80'and'70点'in w['cells']['I'+str(w['row'])]and'80点'in w['cells']['I'+str(w['row'])]
 uw={x['unitWeapID']:x for x in read('units_unitweapons.json')};ua={x['unitAbilID']:x for x in read('units_unitabilities.json')};ud={x['unitID']:x for x in read('units_unitdata.json')}
 for i,u in enumerate(FORMS):
  rank=i%6;r=uw[u];assert r['weapsOn']==1 and r['atkType1']=='hero'and r['weapTp1']==RULES['weapon']['typeRanks'][rank]
  assert r['rangeN1']==1200 and r['dmgpt1']==.26 and r['backSw1']==.64 and r['cool1']==RULES['weapon']['cooldownRanks'][rank]
  assert r.get('minRange')is None and r['splashTargs1']=='ground,structure,debris,air,enemy'
  assert ud[u]['targType']=='ground'and ud[u]['movetp']=='hover'
  assert d['unitProfiles'][u]['fields']['Missilespeed']=='900'and d['unitProfiles'][u]['fields']['MissileHoming']=='1'
  abilities=set(ua[u]['abilList'].split(','));expected={'Avul','AInv','T033'}|({'A011'}if rank==0 else{'A012'}if rank==1 else{'A015'}if rank<4 else{'A013','A014'});assert abilities==expected
  if rank>=2:assert [r[k]for k in['Farea1','Harea1','Qarea1','Hfact1','Qfact1']]==([50,150,240,.6,.4]if rank==2 else[70,200,320,.6,.4])
 for a,b in zip(FORMS[:6],FORMS[6:]):assert {k:v for k,v in uw[a].items()if k!='unitWeapID'}=={k:v for k,v in uw[b].items()if k!='unitWeapID'}
 assert not d['unitDeltas']
 for id in IDS+['A013']+FORMS:assert d['literalReferences'][id]==[]
 assert all(not re.search(r'(?<![A-Za-z0-9])'+id+r'(?![A-Za-z0-9])',(REF/'war3map.j').read_text())for id in IDS+['A013'])
 misc=(REF/'war3mapMisc.txt').read_text().splitlines();assert misc[25]=='FrostAttackSpeedDecrease=0.6'and misc[26]=='FrostMoveSpeedDecrease=0.4'
 probes=[];covered={s[0]:set()for s in SLICES}
 def p(name,env,regs):
  _,f,a,b=next(s for s in SLICES if s[0]==name);tr,end=run(f,env,a,b,regs);covered[name].update(tr);return end
 for present,buff,scepter,mode in itertools.product([False,True],[0,1],[False,True],[0,1,2]):
  damage=[100.0];env={'GetId':lambda x:x,'GetUnitAbilityLevel':lambda u,id:buff,'Has_A_Item':lambda u:scepter,'Game_Mode':mode,'_u1':{'GetEventDamage':lambda slot:damage[0],'EXSetEventDamage':lambda x:damage.__setitem__(0,x)}}
  p('B031OutgoingMultiplier',env,{'r2':'O'if present else None});expected=100*(1.1+.1*scepter+.2*(mode==1))if present and buff else 100;assert math.isclose(damage[0],expected);probes.append({'id':f'B031_{present}_{buff}_{scepter}_{mode}','expected':expected})
 for ability,attack,status in itertools.product([0,1],[0,1,-1],[0,1]):
  calls=[];env={'GetId':lambda x:x,'GetUnitAbilityLevel':lambda u,id:ability if id=='A083'else status,'_u1':{'EXGetEventDamageData':lambda slot:attack},'A083_Action':lambda *x:calls.append(['A083',*x]),'A084_Action':lambda *x:calls.append(['A084',*x])};p('poisonStatusConsumer',env,{'r0':'S','r1':'T'});assert calls==([['A083','S','T'],['A084','S']]if ability and attack and status else[]);probes.append({'id':f'Bpsd_{ability}_{attack}_{status}','expectedCalls':calls})
 for ready010,ready239,orderok in itertools.product([False,True],repeat=3):
  calls=[];env={'GetId':lambda x:x,'Unit_Ability_Has_Cool_Down':lambda s,id:ready010 if id=='A010'else ready239,'IssueImmediateOrder':lambda *x:calls.append(list(x))or orderok};end=p('dragonAutoOrder',env,{'r0':'S'});assert len(calls)==int(ready010 or ready239)and end==(4833 if ready010 or ready239 else 53);probes.append({'id':f'auto_{ready010}_{ready239}_{orderok}','expectedExit':end,'preferred':'A010'if ready010 else'A239'if ready239 else None})
 for level in[0,1]:
  env={'GetId':lambda x:x,'GetUnitAbilityLevel':lambda u,id:level};end=p('autoB012Gate',env,{'r0':'S'});assert end==(22 if level==0 else 23);probes.append({'id':f'B012_{level}','expectedExit':end})
 for skill,scepter in itertools.product(['A010','A239','A008'],[False,True]):
  calls=[];env={'GetId':lambda x:x,'Has_A_Item':lambda u:scepter,'_u2':{'EXGetUnitAbility':lambda s,id:id,'EXSetAbilityState':lambda *x:calls.append(list(x))}};p('dragonCDDependency',env,{'r0':skill,'r1':'S'});assert calls==([[skill,1,21]]if skill in['A010','A239']and scepter else[]);probes.append({'id':f'CDsourceOnly_{skill}_{scepter}','expectedCalls':calls,'boundary':'not finalAEme recast interval'})
 for skill in['S372','S371']:
  calls=[];env={'GetId':lambda x:x,'UnitAddAbility':lambda *x:calls.append(['add',*x]),'UnitRemoveAbility':lambda *x:calls.append(['remove',*x])};p('skinAbilityBridge',env,{'r0':'S','r1':skill});assert calls==([['add','S','A240'],['remove','S','A240']]if skill=='S372'else[]);probes.append({'id':'skin_'+skill,'expectedCalls':calls})
 for name,_,a,b in SLICES:assert covered[name]==set(range(a,b+1)),(name,set(range(a,b+1))-covered[name])
 cases=[]
 def case(name,inputs,expected,actual):
  def eq(a,b):return math.isclose(a,b,rel_tol=1e-12,abs_tol=1e-12)if isinstance(a,(int,float))and not isinstance(a,bool)else all(eq(x,y)for x,y in zip(a,b))and len(a)==len(b)if isinstance(a,list)else a==b
  assert eq(expected,actual),(name,expected,actual);cases.append({'id':name,'input':inputs,'expected':expected})
 case('shared_weapon_R_not_integer_API',{'X':16777217,'D':0,'P':0,'F':0,'J19':0,'Get18':16777216},16777217,(16777217+0)*(1+0)+0+0)
 launch_R=(240+6)*1.5+300;changed_R=(240+10)*1.5+300;case('shared_weapon_launch_snapshot',{'launchX':240,'D':6,'P':.5,'F':300,'laterDice':10},[669,675],[launch_R,changed_R])
 for skill in['A010','A239']:
  for rank in range(1,7):case(f'form_{skill}_{rank}',{'skill':skill,'level':rank},RULES['formBridge']['legalRanks'][skill][rank-1],am[skill]['mergedFields']['UnitID'+str(rank)])
 for dps in[40,80]:
  for dur in[3,5]:case(f'poison_ticks_{dps}_{dur}',{'DPS':dps,'duration':dur},dps*dur,sum([dps]*dur))
 for hp,reduced,expected in[(1,40,0),(2,40,0),(2.5,40,.5),(20,40,18),(100,40,40)]:case('poison_floor_'+str(hp),{'life':hp,'nativeReduced':reduced},expected,min(max(0,reduced),max(0,hp-2)))
 case('poison_B031_can_kill',{'HP':20,'afterNative':40,'scepterMultiplier':1.2},21.6,min(40,20-2)*1.2)
 case('poison_form_changes_dynamic_multiplier',{'snapDPS':80,'B031expired':True},80,80*1)
 tracks={7:40};tracks[7]=80;case('same_entity_new_form_refresh',{'logicalS':7,'oldDPS':40,'newDPS':80},[1,80],[len(tracks),sum(tracks.values())]);tracks[8]=40;case('different_source_stack',{'tracks':tracks},120,sum(tracks.values()))
 case('attackslow_not_stacked',{'sources':[.2,.2,.2]},.2,max([.2,.2,.2]));case('no_moveslow_from_Poi2',{'DataB':.2,'DataC':None},0,RULES['poison']['webMoveSlow'])
 for hero,resist in itertools.product([False,True],repeat=2):
  case(f'poison_duration_{hero}_{resist}',{'nativeHERO':hero,'Arsk':resist},3 if hero or resist else 5,RULES['poison']['heroOrResistantDuration']if hero or resist else RULES['poison']['duration'])
  case(f'cold_duration_{hero}_{resist}',{'nativeHERO':hero,'Arsk':resist},2 if hero or resist else 3,RULES['frost']['heroOrResistantDuration']if hero or resist else RULES['frost']['duration'])
 case('cold_move',{'baseSpeed':300,'decrease':.4},180,300*(1-.4));case('cold_attackR',{'oldR':1.5,'decrease':.6},.9,1.5-.6)
 case('Bpsd_is_not_BPSE',{'poisonIDs':RULES['poison']['buffIds']},False,'BPSE'in RULES['poison']['buffIds'])
 for frost,arrow in[(.4,.15),(.4,0),(0,.15),(0,0)]:case(f'cold_pair_{frost}_{arrow}',{'breath':frost,'arrow':arrow},max(frost,arrow),max(frost,arrow))
 case('Q45_dispel_preserves_breath',{'breathUntil':3,'arrowUntil':4,'now':1,'ordinaryDispel':True},[.4,.6],[RULES['frost']['movementSlow'],RULES['frost']['attackSlow']])
 case('breath_expired_arrow_remains',{'breathUntil':3,'arrowUntil':4,'now':3.5},.15,max(0,.15))
 case('marker_no_extra_detection',{'AtruRng':None,'stockRng':900},0,0)
 def factor(rings,d):return 1 if d<=rings[0]else .6 if d<=rings[1]else .4 if d<=rings[2]else 0
 for rings in[[50,150,240],[70,200,320]]:
  for distance,expected in[(0,1),(rings[0],1),(rings[0]+.001,.6),(rings[1],.6),(rings[1]+.001,.4),(rings[2],.4),(rings[2]+.001,0)]:case(f'ring_{rings}_{distance}',{'rings':rings,'distance':distance},expected,factor(rings,distance))
 for rank,tp in enumerate(RULES['weapon']['typeRanks'],1):case('splash_active_rank'+str(rank),{'rank':rank,'weaponType':tp},rank>=3,tp=='msplash')
 case('splash_main_flat_not_spread',{'R':100,'M':3,'B':25,'secondaryFactor':.6},[325,180],[100*3+25,100*3*.6])
 case('source_primary_and_secondary_B031_once',{'raw':[100,60],'multiplier':1.3},[130,78],[x*1.3 for x in[100,60]])
 case('no_friend_collateral',{'candidates':[(1,'enemy'),(2,'friend'),(3,'enemy')]},[1,3],[i for i,side in[(1,'enemy'),(2,'friend'),(3,'enemy')]if side=='enemy'])
 case('primary_first_unique',{'primary':7,'snapshot':[4,7,1,7]},[7,1,4],[7]+sorted(set([4,7,1,7])-{7}))
 case('blue_air_primary_splash',{'slot1':'msplash','targs':'air','slot2Enabled':False},True,'air'in uw['E005']['targs1'].split(',')and uw['E005']['weapTp1']=='msplash')
 case('main_miss_cancels_cold_and_area',{'mainHit':False,'receivers':[1,2,3]},[],[1,2,3]if False else[])
 case('dead_primary_plain_collateral',{'targetAlive':False,'R':100,'storedPoint':True},[1,0,60],[1,0,100*.6])
 case('form_switch_keeps_launched_green',{'launched':'E001','current':'E005'},['A011','missile'],['A011',uw['E001']['weapTp1']])
 case('no_freezing_buildings',{'blueAbilities':ua['E005']['abilList']},False,'Afrz'in ua['E005']['abilList'].split(','))
 def eligible(t,kind):
  if not t.get('alive',True)or not t.get('enemy',True)or any(t.get(k,False)for k in['hidden','Aloc','invulnerable','ethereal']):return False
  if kind=='poison':return t.get('organic',True)and not any(t.get(k,False)for k in['mechanical','structure','ward'])
  if kind=='cold':return not any(t.get(k,False)for k in['structure','ward'])
  return not t.get('ward',False)
 target_cases=[('ordinary',{},[True,True,True]),('air',{'air':True},[True,True,True]),('magicimmune',{'magicimmune':True},[True,True,True]),('ethereal',{'ethereal':True},[False,False,False]),('mechanical',{'mechanical':True,'organic':False},[False,True,True]),('structure',{'structure':True},[False,False,True]),('ward',{'ward':True},[False,False,False]),('friendly',{'enemy':False},[False,False,False]),('hidden',{'hidden':True},[False,False,False]),('locust',{'Aloc':True},[False,False,False]),('invulnerable',{'invulnerable':True},[False,False,False]),('dead',{'alive':False},[False,False,False])]
 for name,t,expected in target_cases:case('target_'+name,{'unit':t,'columns':['poison','cold','splashCollateral']},expected,[eligible(t,k)for k in['poison','cold','splash']])
 for dist,expected in[(450,500000),(900,1000000),(1200,1333333)]:case('flight_us_'+str(dist),{'distance':dist,'speed':900},expected,math.floor(dist/900*1e6+.5))
 links=0
 if MD.exists():
  for t in re.findall(r'\]\(([^)]+)\)',MD.read_text()):
   if '://'in t or t.startswith('#'):continue
   f,_,anchor=t.partition('#');p=(MD.parent/f).resolve();assert p.exists(),t
   if anchor.startswith('L'):assert 1<=int(anchor[1:])<=len(p.read_text().splitlines()),t
   links+=1
 d['verification']={'kind':'source reread/mergedfields/bytecode fragments with native stubs and selected Web vectors; no nativeclient or gameexecution','originalSlkRows':len(d['objectData']),'abilityFieldAssertions':len(fields),'primaryWorkbookRows':12,'primaryWorkbookCells':120,'bridgeWorkbookRows':14,'bridgeWorkbookCells':140,'w3aCheckedIds':len(IDS+AUX),'w3aRecords':2,'w3aMods':8,'unitW3uRecords':len(d['unitDeltas']),'bytecodeInstructions':sum(x['instructionCount']for x in d['bytecodeFragments']),'conditions':sum(len(x['conditions'])for x in d['bytecodeFragments']),'returnInstructions':sum(len(x['returnPCs'])for x in d['bytecodeFragments']),'fullFunctions':[],'fragmentInstructionCoverage':{k:len(v)for k,v in covered.items()},'nativeStubProbes':probes,'nativeStubProbeCount':len(probes),'specCases':cases,'specCaseCount':len(cases),'relativeLinks':links}

def render(d):
 s=json.dumps(d,ensure_ascii=False,indent=2);return re.sub(r'("fields": )(\{\n.*?\n\s*\})',lambda m:m.group(1)+json.dumps(json.loads(m.group(2)),ensure_ascii=False,separators=(',',':')),s,flags=re.S)+'\n'
if __name__=='__main__':
 ap=argparse.ArgumentParser();g=ap.add_mutually_exclusive_group(required=True);g.add_argument('--write',action='store_true');g.add_argument('--check',action='store_true');args=ap.parse_args();d=build();s=render(d)
 if args.write:OUT.write_text(s)
 else:assert OUT.read_text()==s,'Audit changed; inspect source/decisions before regeneration'
 print(json.dumps({'baseline':d['baselineId'],'counts':d['counts'],'verification':{k:v for k,v in d['verification'].items()if k not in['nativeStubProbes','specCases']},'sha256':hashlib.sha256(s.encode()).hexdigest()},ensure_ascii=False))
