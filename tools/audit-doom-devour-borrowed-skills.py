#!/usr/bin/env python3
"""Validate Devour, Steal and the source roster of Doom's borrowed abilities."""
from contextlib import closing
import json
import re
import runpy
import sys

import audit_index as index

OUT = index.ROOT / 'docs/rules/doom-devour-borrowed-skills.json'
HINTS = index.MAP / 'units_campaignabilitystrings.txt'
COST = [30, 35, 40, 45, 50, 55]
CD = [40, 36, 32, 28, 24, 20]
MANA = [.15, .20, .25, .30, .35, .40]
ROSTER = {
    'm005':['T300'], 'm009':['T315'], 'm010':['T301'], 'm015':['T302'],
    'm017':['T324'], 'm018':['T316'], 'm020':['T310'], 'm024':['T320'],
    'm025':['T311'], 'm026':['T317','T318'], 'm027':['T323'], 'm028':['T319'],
    'm030':['T304'], 'm031':['T314'], 'm033':['T321'], 'm034':['T307'],
    'm035':['T313'], 'm037':['T303'], 'm040':['T312'], 'm045':['T322'],
    'm048':['T326'], 'm052':['T327'], 'm053':['T328'], 'mBOS':['T325'],
}
RULES = {
    'T300':{'manaRecipient':[300,400,'500+.05*caster.maxMana','600+.10*caster.maxMana'],'autoFallback':'self only if initial target null or dead'},
    'T301':{'radius':600,'movementLock':[1.4,1.6,1.8,2],'poisonPerSecond':[300,500,800,1300],'poisonSeconds':10,'decision':'Q71 dedicated tooltip','poisonProjectile':'q001:T174'},
    'T302':{'eligibleHopRadius':600,'maxDistinctHits':7,'perHitMagic':'2000*liveRank*1-basedHitIndex','petrifyFactor':2,'interruption':.1,
            'stealPerHit':'min(target.currentMana,100*liveRank)','return':'actual sum, once on valid T178 return arrival','separateCastState':True,'missileSpeed':800,'decision':'Q54,Q79'},
    'T303':{'stunRank':'uniform(1,castRank+1)','stunSeconds':'stunRank','magicOnHit':'max(0,2000*(liveRank+2-stunRank))','proxy':'q035:T200','proxyLife':4},
    'T304':{'critPercent':10,'critMultiplier':[10,14,18,22],'heroA027Proc':False},
    'T307':{'radius':500,'extraMagicDamagePercent':[5,10,15,20],'recipient':'self and eligible allied units','stack':'strongest eligible emitter','phase':'B158 damage dispatch','decision':'Q71 dedicated tooltip'},
    'T310':{'magic':[300,600,900,1200],'radius':1200,'helper':'T109','helperRank':'floor(clamp(effectiveStrength/200,1,11))','stunSeconds':'ordinary 1+.3*(helperRank-1), native shortened 1+.2*(helperRank-1)'},
    'T311':{'attackSpeedPercent':[100,150,200,250],'seconds':[2.5,3,3.5,4],'helper':'q001:T110','proxyLife':.5},
    'T312':{'range':[500,1500,2000,2500],'delay':.1,'waypoint':'shared Blink placement, same actual entity'},
    'T313':{'radius':500,'armorDelta':[-20,-30,-40,-60],'seconds':5,'helper':'T124','replacementKey':'actual target'},
    'T314':{'seconds':[0,1,2,3,4],'stun':.5,'magic':'currentTargetHP*.01*liveRank','exceptionFactor':.5,'cooldown':[12,10,8,3],'replacementKey':'actual caster','decision':'Q61/Q71 dedicated tooltip'},
    'T315':{'radius':400,'unitWeight':1,'bossWeight':5,'physical':'0.2*(S18+S19)*weight','emittedAttackType':'HERO','decision':'Q71 dedicated tooltip'},
    'T316':{'attackedProcPercent':[6,8,10,12],'attackSpeedPercent':500,'seconds':[2,2,3,3],'helper':'q001:T144','decision':'Q61 exact tip'},
    'T317':{'divineKillAttempt':'q025','manaFractionOfTargetMaxHp':[.04,.06,.08,.10],'manaClamp':[200,3000],'target':'native nonhero enemy, excluding map bosses'},
    'T318':{'tickSeconds':[1.5,3,4.5,6],'radius':800,'magicBase':[300,600,900,1200],'intFactor':2,'scepterExtraIntFactor':2,
            'control':'T224/B173 20% for 2s','replacementKey':'actual caster','proxy':'q045'},
    'T319':{'armorDelta':[-20,-30,-40,-50],'seconds':10,'rewardRange':[[10,50],[15,60],[20,70],[25,80]],
            'mapBossRewardFactor':6,'mode1RewardFactor':.5,'noRewardIfMarkerLosesSkill':True,'nilKillOwnerLeavesMark':True,'replacementKey':'actual target'},
    'T320':{'perOwnedKillMaxHP':[4,5,6,7],'currentHPGain':0,'grantedGrowthPersists':True},
    'T321':{'attackSpeedPercent':[50,60,70,80],'seconds':7,'controlBuff':'Bblo'},
    'T322':{'baseAttackIncreasePercent':[400,600,800,1000],'seconds':14,'consume':'actual nonzero attack, before early return at main attack PC198–214'},
    'T323':{'selectionRadius':300,'drainProxy':'q047:T058','spellPerTick':[100,200,300,400],
            'drainSeconds':5,'interval':1,'intGain':[5,7,10,13],'staffExtraInt':10,'endlessFactor':2,'intWindow':8,'windowReplacement':'first q047 created by new cast','existingDrains':'remain active; route into current caster window','nativeLifeReturnRecipient':'q047','liveRankZeroStaffStillApplies':True},
    'T324':{'radius':800,'heroPhysical':[260,480,700,920],'stun':[1,1.2,1.4,1.6],'helper':'T034','decision':'Q71 dedicated tooltip'},
    'T325':{'attackProcPercent':[12,13,14,15],'radius':600,'chaosPhysical':'actual attacking caster.maxHP','decision':'Q61 exact tip'},
    'T326':{'units':[2,3,3,3],'templates':['b150','b151','b153','b154'],'radius':50,'life':25},
    'T327':{'radius':600,'magic':[500,1500,2500,3500],'divine':'floor(pre-packet currentHP*.05*rank)'},
    'T328':{'primaryMagic':[1000,2000,3000,4000],'primaryInterruption':.01,'missileSpeed':1400,
            'secondProjectile':'q001:T230','secondProxyLife':1,'armorDelta':[-20,-30,-40,-50],'moveSlow':.4,'seconds':4},
}
AUX = 'T034 T058 T109 T110 T124 T139 T144 T174 T177 T178 T200 T224 T230 q001 q025 q034 q035 q045 q047 B043 B067 B158 B173 B176 B177 B178'.split()


def read_catalog(vm, env):
    vm['execute'](vm['function']('main/f291'), [env], (), start_pc=739, stop_pc=885)
    return {r[1]:[r[k] for k in (2,3) if r.get(k)] for r in env['Monster_Skill_Arr'].values()}


def raw_probes(db):
    make = runpy.run_path(str(index.ROOT/'tools/audit-passive-growth-batch.py'))['probe_context']
    vm, world, env, caster, target, packets, gold = make(db, [])
    catalog = read_catalog(vm, env)
    assert catalog == ROSTER
    resets, kills, draws, registrations = [], [], [], []
    native = {'EXGetUnitAbility':lambda u,k:k, 'EXSetAbilityState':lambda a,k,v:resets.append((a,k,v)),
              'EXSetEventDamage':lambda _:None}
    vm['execute'](vm['function']('main/f115'), [env], (lambda _:native,))
    caster.update(mana=100, maxMana=1000)
    target.update(type='m005', level=5)
    env.update(UNIT_STATE_MANA='mana', UNIT_STATE_MAX_MANA='maxMana',
               GetUnitTypeId=lambda u:u.get('type','H042'), GetUnitLevel=lambda u:u['level'],
               UnitIsHero=lambda u:u.get('boss',False), IsShopBoss=lambda u:u.get('shop',False),
               DisplayTextToPlayer=lambda *a:None, CreateEffByUnit=lambda *a:None,
               CreateEffAtLoc=lambda *a:None, UnitKillUnit=lambda s,t:kills.append(t['type']),
               GetRandomInt=lambda a,b:draws.append((a,b)) or 2, J100_TouZhiDian_Arr={1:13},
               SetUnitState=lambda u,k,v:u.__setitem__(k,min(v,u.get('maxMana',1000))),
               UpDate_GetGold_Arr=lambda p,kind,name,v:registrations.append(v))
    old_remove = env['UnitRemoveAbility']
    env['UnitRemoveAbility'] = lambda u,k:resets.append(k) or old_remove(u,k)
    caster['skills']['A164'] = 1
    env['A164_study'](caster)
    assert caster['skills']['T329'] == 1
    caster['skills']['A164'] = 6
    env['A164_study'](caster)
    assert caster['skills']['T329'] == 6
    env['A164_Action'](caster,target)
    assert caster['mana'] == 600 and kills==['m005'] and not registrations
    timer = env['A164_Timers'][1]
    env['A164_Action'](caster,target)
    world.advance(.1)
    assert resets==[('A164',1,0)] and env['A164_Timers'][1] is timer and kills==['m005']
    consecutive = []
    for _ in range(4):
        env['A164_ability'](caster,target)
        consecutive.append(caster['skills']['T300'])
    assert consecutive == [2,3,4,4] and draws==[(1,4)]
    target['type'] = 'm026'
    env['A164_ability'](caster,target)
    assert 'T300' not in caster['skills'] and caster['skills']['T317']==2
    env['J100_TouZhiDian_Arr'][1] = 14
    env['A164_ability'](caster,target)
    assert 'T317' not in caster['skills'] and caster['skills']['T318']==2
    target['type'] = 'unlisted'
    env['A164_ability'](caster,target)
    assert resets[-1]=='T329' and caster['skills']['T329']==6 and caster['skills']['T318']==2
    assert draws==[(1,4)]*3 and env['A164_Timers'][1] is timer and kills==['m005']
    world.advance(6.9)
    assert gold[0]==0
    world.advance(7)
    assert gold[0]==700 and registrations==[700] and env['A164_Timers'].get(1) is None
    outcomes = []
    for id,mode,shop in [('m050',0,False),('mBOS',0,False),('m050',2,False),('m050',0,True)]:
        target.update(type=id,boss=True,shop=shop)
        env['Game_Mode'] = mode
        caster['mana'] = 100
        env['A164_Action'](caster,target)
        assert caster['mana']==600 and env['A164_Timers'].get(1) is None
        outcomes.append(packets[-1][2])
    assert outcomes==[4000,2000,2000,2000] and gold[0]==3500 and registrations==[700]*5

    # The original first two hits schedule two bolts and return immediately at target exhaustion.
    orders = []
    far = world.units[2]
    target.update(type='m015', mana=250)
    far['mana'] = 70
    caster['skills']['T302'] = 2
    caster['mana'] = 100
    env.update(A007_units={1:far}, GetUnitLoc=lambda u:(u['x'],u['y']),
               CreateTempAndSetAbilityLv=lambda p,loc,f,id,rank,life,*args:{'id':id},
               SetUnitUserData=lambda u,i:u.__setitem__('userData',i),
               IssueTargetOrder=lambda u,order,t:orders.append((u['id'],t['x'])) or True)
    env['A164_T302_Action'](caster,target)
    env['A164_T302_Eff'](caster,target)
    assert caster['mana']==100
    env['A164_T302_Eff'](caster,far)
    assert [p[2] for p in packets[-2:]]==[4000,16000]
    assert orders==[('T177',500),('T177',1000),('T178',0)]
    assert [target['mana'],far['mana'],caster['mana']]==[250,70,700]
    return {'sameStealRanks':consecutive,'m026RanksAt13And14':['T317:2','T318:2'],
            'unlistedRefresh':'T329:6; retains T318:2','rawManaAtRank6':600,'rawBlockedCooldown':.1,
            'normalKillAttempts':kills,'rawDigestGoldByTime':[[6.9,0],[7,700]],
            'rawBossDamageByClass':outcomes,
            'T302':{'initialCasterMana':100,'immediateAfterIssuingReturn':700,
                    'targetManaUnchanged':[250,70],'magicDamageByHit':[4000,16000]}}


def source_rows(db):
    strings = {}
    for line, text in enumerate(HINTS.read_text().splitlines(), 1):
        if text.startswith('['):
            id = text.strip('[]')
        if text.startswith(('Ubertip=', 'Missilespeed=')):
            key, value = text.split('=', 1)
            strings.setdefault(id,{})[key] = (line,value)
    assert all(strings[id]['Missilespeed'][1]=='800' for id in ('T177','T178'))
    assert '偷取法力值' in strings['T302']['Ubertip'][1] and '返回到末日使者身上' in strings['T302']['Ubertip'][1]
    assert re.findall(r'最大法力值的(\d+)%', strings['A164']['Ubertip'][1])==['15','20','25','30','35','40']
    record = {}
    for id in ['A164','T329',*sorted(RULES),*AUX]:
        rows = index.objects(db,id)
        if id in RULES or id in ('A164','T329'):
            item, = [o for o in rows if o['sourcePath'].endswith('/units_abilitydata.json')]
            fields = item['fields']
            assert fields['levels']==(6 if id in ('A164','T329') else 4), id
            if id in ('A164','T329'):
                assert fields['code']=='ANcl' and fields['Rng1']==1200 and fields['Cost1']==30 and fields['Cool1']==40
            else:
                selected = ('Cool','Cost','Rng','Area','Dur','HeroDur','Cast','Data','targs','BuffID')
                item['fields'] = {k:v for k,v in fields.items() if k in ('code','levels') or k.startswith(selected)}
            rows = [item]
        anchors = [[r['function'],r['pc'],r['sourceLine']] for r in index.references(db,id) if r['pc'] is not None]
        if id in AUX:
            rows = [{k:v for k,v in o.items() if k!='fields'} for o in rows]
        record[id] = {'objectRows':rows,'literalReferences':anchors,
                      'hintLine':strings.get(id,{}).get('Ubertip', (None,None))[0]}
    return record


def web_vectors():
    # Q79 ties all actual debits to their own cast token; landing clears only that token.
    blue = [200, 160, 0, 50]
    pending = {}
    for token, hit, rank in [('old',0,2),('new',1,4),('old',2,4),('old',3,1)]:
        taken = min(blue[hit],100*rank)
        blue[hit] -= taken
        pending[token] = pending.get(token,0)+taken
    assert blue==[0,0,0,0] and pending=={'old':250,'new':160}
    failed = pending.pop('new')
    paid = min(200+pending.pop('old'),400)
    assert failed==160 and paid==400 and pending.get('old',0)==0
    return {'Q79':{'oldStolen':250,'newStolen':160,'beforeArrivalCasterMana':200,
                   'failedNewReturnCredited':0,'oldManaAfterAcceptedReturnAndClamp':paid,'oldRepeatedReturnCredit':0},
            'Q61':{'rank6ManaBefore':100,'rank6ManaAfter':100+MANA[5]*1000},
            'Q71':{'T307Rank4Magic1000':1000*1.2,'T315Rank4OneBossOneNormalAttack100':.2*(5+1)*100}}


def main():
    with closing(index.connect()) as db:
        _, sources = json.loads(db.execute('SELECT fingerprint FROM metadata').fetchone()[0])
        guide = [r for r in index.workbook_rows(db,'A164','塔技能') if r['cells'][5]=='A164']
        assert [r['row'] for r in guide]==[60,65,60,65]
        assert all(r['cells'][7:9]==guide[0]['cells'][7:9] for r in guide)
        refs = source_rows(db)
        raw = raw_probes(db)
        funcs = [list(r) for r in db.execute("SELECT name,start_line,end_line FROM function WHERE name='main/f115' OR name LIKE 'main/f115/%' ORDER BY start_line")]
    assert set(RULES)=={id for ids in ROSTER.values() for id in ids} and len(RULES)==25
    for id,checks in {'T307':{'code':'AHad','Area1':500},'T315':{'code':'AHbz','Area1':400},
                      'T314':{'Cool4':6},'T328':{'Dur1':.01},'T326':{'code':'AOsf'}}.items():
        fields = refs[id]['objectRows'][0]['fields']
        assert all(abs(fields[k]-v)<1e-6 if isinstance(v,float) else fields[k]==v for k,v in checks.items()),(id,fields)
    payload = {'records':[{'id':'A164','status':'ready',
                           'rules':{'activeRange':1200,'autoRange':1100,'mana':COST,'cooldown':CD,'backSwing':.1,
                                    'castByTower':{'H042':.75,'G061':.3},'manaRestoreMaxFraction':MANA,
                                    'digestSeconds':'ceil(target.currentHP/(200*rank+.03*target.maxHP))','digestExclusion':'same persistent tower while pending',
                                    'mapBoss':'N534>0 and SAPPER','defaultBossDivine':'200*targetLevel+.3*target.currentHP',
                                    'exceptionBossHPFactor':.10,'rewardFactorByTargetLevel':140,
                                    'steal':{'active':'T329','activeOrder':'rainoffire','sharesDigestLock':False,'killsTarget':False,
                                             'roster':ROSTER,'m026AltIfOverdraftStrictlyGreaterThan':13,
                                             'newRank':'uniform(1,4), unless already separately present in old-bound state',
                                             'sameRank':'min(4,actualOldRank+1)','unlisted':'keep current borrowed slot; rebuild T329 at actual rank, resetting cooldown only'},
                                    'borrowed':RULES},
                           'sourceRefs':{'guide':[{k:v for k,v in r.items() if k!='cells'} for r in guide],
                                         'catalog':['main/f291',739,885,161638,161784],
                                         'functions':funcs,'objectsAndReferences':refs,'disasmSha256':dict(sources)[index.DISASM]},
                           'differences':{'A164':'source fixed 50% max mana; dedicated active tooltip six ranks 15–40%',
                                          'T301':'original native AOws stun and object poison channel vs explicit movement lock and per-second poison',
                                          'T302':'raw T178 send immediately grants 100*rank*(n+1), without debit or valid return; Q79 actual stolen mana only on return',
                                          'T307':'source checks own rank at .04/rank; Q71 uses real eligible strongest .05/rank emitter',
                                          'T314':'original final CD6 and hero helper stun .3; active tooltip CD3 and .5 stun',
                                          'T315':'raw radius500 damage with rank multiplier but radius400 count; dedicated radius400 and fixed factor',
                                          'T316/T325':'raw < threshold in 0..100 inclusive; explicit percent',
                                          'T324':'original helper normal/hero duration differ; active tooltip gives exact four tiers'},
                           'unresolved':[],
                           'validation':{'rawVM':raw,'webBoundaryVectors':web_vectors(),'originalClient':'untested'}}],
               'totals':{'scope':1,'ready':1,'pending':0,'borrowedAuxiliary':25,'stealAuxiliary':1}}
    serialized = json.dumps(payload,ensure_ascii=False,indent=2)+'\n'
    if '--write' in sys.argv:
        OUT.write_text(serialized)
    else:
        assert OUT.read_text()==serialized
    print('A164 1 ready, 25 borrowed + T329 auxiliary; raw VM and Q79 return vectors passed')


if __name__ == '__main__':
    main()
