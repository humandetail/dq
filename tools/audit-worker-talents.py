#!/usr/bin/env python3
"""Check workers' talent choices and the original item/effect dispatch."""
from contextlib import closing
import json
import math
import runpy
import sys

import audit_index as index

OUT = index.ROOT/'docs/rules/worker-talents.json'
CHOICES = {f'W{i:03}':f'W{i+10:03}' for i in range(2,10)}
COOLDOWN = {'W012':[230,190,150,110,70],'W014':[250]*5,
            'W016':[160,150,140,130,120],'W018':[25,20,15,10,5]}
POOLS = {'N':[701,717],'R':[601,609],'SR':[551,597],'SSR':[501,510]}
RULES = {
    'W012':{'inventorySlot':1,'cardPools':POOLS,'inputTiers':['N','R','SR'],'excludeOriginal':True,
            'qualificationBlockedItems':[f'c{i:03}' for i in range(1,14)],'failedCooldownResetAfter':.1,
            'delivery':'delete old complete instance, create result, normal D01 add or ground',
            'invalidOutsideTierPoolBeforeRemove':True},
    'W013':{'heroDamageFactor':[1.04,1.08,1.12,1.16,1.2],
            'context':'B03 PC2070, O is actual attributed native HERO; owner lookup on O; no additional damage kind gate'},
    'W014':{'boxIds':['i401','i402','i403','i404'],'keyIds':['i411','i412','i413','i414'],
            'oneEachInOrder':['box','key'],'rarityIntervals':[[1,1],[1,2],[1,3],[1,4],[2,4]],
            'independentDraws':True,'skipRngAtRank1':True,'useD01Separately':True},
    'W015':{'goldPerMonsterKill':[5,9,14,20,27],'owner':'actual killing unit Owner',
            'triggerBoundary':'actual P11 monster death; source callback also receives deaths of Player 0–3',
            'supplementalToBounty':True,'policy':'Q71 exclusive monster wording'},
    'W016':{'firstFourInSlotOrder':True,'routes':[{'objectLevel':11,'target':'uniform R'},{'objectLevel':12,'target':'uniform SR'}],
            'requiresSameQuality':4,'qualifiedSpecialCardsCanBeMaterials':True,'failedCooldownResetAfter':.1,
            'delivery':'remove all four, create one new result using D01'},
    'W017':{'uses':['I001','I002','I003','I005'],'afterCommit':True,'rawExclusiveThreshold':[10,13,16,19,24],
            'webInclusivePercent':[10,13,16,19,25],'decision':'Q17','bonusDrawThenNormal':True,
            'rerollsAndPersonalWeight':'ordinary independent logic with current player weight after preceding draw',
            'preserveOneChanceRollEvenWhenRankIsZero':True},
    'W018':{'range':9999,'includesOnlySameOwnerAndNotCircleAtOriginalHandler':True,'spatialRule':'pathing-and-placement.md'},
    'W019':{'contribution':'floor((.5*talentRank+.5)*heroEventRank)','startupSelectionDoesNotRewriteExisting':True,
            'sources':['hero level event','talent upgrade across actual owned Tower_ALL'],'retainsEarnedContributionAfterRetirement':True,
            'attributeRule':'hero-attribute-interface.md'},
}
SOURCE = {
    'W012':['main/f296/f1','main/f296/f2','main/f296/f3','main/f296/f4'],
    'W013':['main/f296/f5','main/f291/f1:2070–2073'],
    'W014':['main/f296/f6'],
    'W015':['main/f296/f7','main/f291/f9:1–8','main/f291/f32'],
    'W016':[f'main/f296/f{i}' for i in range(8,16)],
    'W017':['main/f296/f16','main/f285/f6:1–52'],
    'W018':['main/f296/f17','main/f296/f18','main/f296/f19'],
    'W019':['main/f296/f20','main/f296/f21','main/f291/f18'],
}


def run_source_probes(db):
    setup = runpy.run_path(str(index.ROOT/'tools/audit-passive-growth-batch.py'))['probe_context']
    vm, world, env, worker, hero, _, credit = setup(db, [])
    rawdraws, deliveries, costs, removals, mutable_spell, ids = [], [], [], [], ['W002'], []
    roll = [1]
    worker.update(bag={},type='w001')
    hero.update(hero=True,level=21,owner=0,str=100,agi=100,int=100)
    team2={'owner':1,'skills':{'W019':1},'type':'w001'}
    worker_family={1:worker,2:team2}
    blue = [100]
    native={'EXGetUnitAbility':lambda u,k:k,'EXSetAbilityState':lambda a,k,v:costs.append((a,k,v)),
            'EXSetEventDamage':lambda n:blue.__setitem__(0,n),'GetEventDamage':lambda _:blue[0]}

    def item(id,level):
        return {'id':id,'tier':level}

    def obj_id(v):
        ids.append(v)
        return v

    def random(low, high):
        rawdraws.append((low,high))
        return max(low, min(high,roll[0]))

    def remove(current):
        removals.append(current['id'])
        worker['bag']={slot:obj for slot,obj in worker['bag'].items() if obj is not current}

    env.update(GetId=obj_id, UNIT_TYPE_HERO='hero', IsWorker=lambda u:u['type']=='w001',
               GetTriggerUnit=lambda:worker, GetSpellAbilityId=lambda:mutable_spell[0],
               GetSpellTargetUnit=lambda:None, Player_Build_Unit=worker_family,
               UnitItemInSlot=lambda u,n:u['bag'].get(n), GetItemTypeId=lambda o:o['id'] if o else None,
               GetItemLevel=lambda o:o['tier'], CreateItem=lambda id,x,y:{'id':id,'x':x,'y':y},
               UnitAddItem=lambda w,o:deliveries.append(o['id']) or False, RemoveItem=remove,
               DisplayTextToPlayer=lambda *a:None, DisplayTimedTextToPlayer=lambda *a:None,
               GetRandomInt=random, GetUnitLevel=lambda u:u['level'], IsUnitType=lambda u,k:u.get(k,False),
               CreateTextTag=lambda:{}, SetTextTagPermanent=lambda *a:None, SetTextTagText=lambda *a:None,
               SetTextTagPosUnit=lambda *a:None, SetTextTagVelocity=lambda *a:None, SetTextTagLifespan=lambda *a:None,
               SetTextTagColor=lambda *a:None, PercentTo255=lambda n:255, Tower_ALL={1:hero})
    vm['execute'](vm['function']('main/f296'),[env],(lambda _:native,))
    for first,last in [(166,185),(1929,1971)]:
        vm['execute'](vm['function']('main/f285'),[env],(),start_pc=first,stop_pc=last)
    assert {k:list(env['Item_Tower_'+k].values()) for k in POOLS} == POOLS
    blocked = list(env['Rshop_Items'].values())
    assert blocked==RULES['W012']['qualificationBlockedItems']
    for select,result in CHOICES.items():
        worker['skills']={'W001':1}
        mutable_spell[0]=select
        env['WAbility_initAbility']()
        assert worker['skills']=={result:1}
    assert hero['str']==100
    worker['skills']={'W019':1}
    env['WAbility_Up_Lv']()
    raw_growth=hero['str']-100
    assert worker['skills']=={'W019':2} and team2['skills']=={'W019':2}
    assert raw_growth==31 and hero['agi']==hero['int']==131
    env['WAbility_Remove']()
    assert hero['str']==131 and not worker['skills'] and not team2['skills']

    mutable_spell[0]='W012'
    worker['skills']={'W012':1}
    for sample,v in [('i701','i702'),('i717','i701')]:
        worker['bag']={0:item(sample,11),1:item('i601',12)}
        env['WAbility_W012']()
        assert deliveries[-1]==v and removals[-1]==sample
        assert worker['bag'][1]['id']=='i601'
    before=len(rawdraws)
    worker['bag']={0:item('c001',11)}
    env['WAbility_W012']()
    worker['bag']={1:item('i701',11)}
    env['WAbility_W012']()
    assert len(rawdraws)==before and len(env['W012_Timer'])==1
    world.advance(.1)
    assert costs==[('W012',1,0)]
    worker['bag']={0:item('i902',13)}
    env['WAbility_W012']()
    assert removals[-1]=='i902' and deliveries[-1] is None  # permissive native stub exposes the invalid requested ID

    mutable_spell[0]='W014'
    worker['skills']={'W014':1}
    before=len(rawdraws)
    env['WAbility_W014']()
    assert len(rawdraws)==before and deliveries[-2:]==['i401','i411']
    worker['skills']['W014']=5
    both=iter([404,412])
    env['GetRandomInt']=lambda low,high:rawdraws.append((low,high)) or next(both)
    env['WAbility_W014']()
    assert rawdraws[-2:]==[(402,404),(412,414)] and deliveries[-2:]==['i404','i412']

    env['GetRandomInt']=random
    env.update(RandomR=lambda:'i609',RandomSR=lambda:'i597')
    mutable_spell[0]='W016'
    worker['skills']={'W016':1}
    worker['bag']={n:item(id,level) for n,(id,level) in enumerate([('i701',11),('i601',12),('c001',11),
                                                                  ('i702',11),('i703',11),('i704',11)])}
    env['WAbility_W016']()
    assert removals[-4:]==['i701','c001','i702','i703'] and deliveries[-1]=='i609'
    worker['bag']={n:item(f'i60{n+1}',12) for n in range(4)}
    env['WAbility_W016']()
    assert deliveries[-1]=='i597'
    worker['bag']={i:item(f'i55{i+1}',13) for i in range(4)}
    env['WAbility_W016']()
    world.advance(.2)
    assert costs[-1]==('W016',1,0) and len(worker['bag'])==4

    for rank,factor in enumerate(RULES['W013']['heroDamageFactor'],1):
        blue[0]=100
        worker['skills']={'W013':rank}
        env['WAbility_W013'](hero)
        assert math.isclose(blue[0],100*factor)
    hero['hero']=False
    blue[0]=100
    env['WAbility_W013'](hero)
    assert blue[0]==100
    worker['skills']={'W015':5}
    env['WAbility_W015'](worker,{'owner':11})
    env['WAbility_W015'](worker,{'owner':1})
    env['WAbility_W015'](None,{'owner':11})
    assert credit[0]==54   # Source explicitly does not filter the dying unit's allegiance.

    draws=[]
    for ability,sample,rank,outcomes in [('I001',9,1,2),('I001',10,1,1),('I002',23,5,2),
                                        ('I003',24,5,1),('I004',1,5,1),('I005',1,0,1)]:
        mutable_spell[0]=ability
        worker['skills']={'W017':rank}
        roll[0]=sample
        calls=[]
        before=len(rawdraws)
        vm['execute'](vm['function']('main/f285/f6'),[env,lambda _,id:calls.append(id)],(),stop_pc=52)
        assert calls==[ability]*outcomes and len(rawdraws)-before==int(ability!='I004')
        draws.append([ability,sample,rank,outcomes])
    return {'W001':CHOICES,'W012':{'ringWrap':['i717','i701'],'oneRefundTimer':True,'rawNoMatchResult':None},
            'W013':{'multipliers':RULES['W013']['heroDamageFactor'],'nonHero':100},
            'W014':{'rank1NoRNG':['i401','i411'],'rank5Independent':['i404','i412']},
            'W015':{'rawP11ThenP1':[27,54],'selectedP11ThenP1':[27,27]},
            'W016':{'first4N':['i701','c001','i702','i703'],'NResult':'i609','RResult':'i597','level13Fails':True},
            'W017':{'rawDrawCount':draws,'selectedTopRank25Succeeds':25<=RULES['W017']['webInclusivePercent'][-1]},
            'W019':{'afterSelectableRank1AndWaveUpgrade2':raw_growth,'retainedAfterRemove':hero['str']-100}}


def main():
    with closing(index.connect()) as db:
        _, fingerprints = json.loads(db.execute('SELECT fingerprint FROM metadata').fetchone()[0])
        overview = [[p,row,json.loads(cells)[1]] for p,row,cells in db.execute(
            "SELECT source,row_no,cells FROM sheet_row WHERE sheet='玩法总览' AND cells LIKE '%选工人天赋%' ORDER BY source")]
        assert [r[1] for r in overview]==[5,6] and overview[0][2]==overview[1][2]
        hints=(index.MAP/'units_campaignabilitystrings.txt').read_text().splitlines()
        book,=index.objects(db,'W001','units_abilitydata')
        assert book['fields']['DataA1'].split(',')==list(CHOICES)
        records=[]
        for id,rule in RULES.items():
            row,=index.objects(db,id,'units_abilitydata')
            override=[o for o in index.objects(db,id,aliases=True) if o['sourcePath'].endswith('/war3map.w3a.json')]
            assert row['fields']['levels']==5
            if id in COOLDOWN:
                combined=[row['fields'][f'Cool{i}'] for i in range(1,5)]
                fifth=[m['value'] for o in override for m in o['fields']['mods'] if m['key']=='acdn' and m['level']==5]
                assert [*combined,*(fifth or [250])]==COOLDOWN[id]
                assert all(f'Cost{i}' not in row['fields'] for i in range(1,5))
                rule={**rule,'mana':0,'cooldown':COOLDOWN[id]}
            r=[(v['function'],v['pc'],v['sourceLine']) for v in index.references(db,id) if v['pc'] is not None]
            tip=next(n for n in range(hints.index(f'[{id}]'),len(hints)) if hints[n].startswith('Ubertip='))
            records.append({'id':id,'status':'ready','rules':rule,'sourceRefs':{'object':row,'objectOverrides':override,
                            'profileTipLine':tip+1,'routing':r,'functions':SOURCE[id]},'unresolved':[],
                            'differences':{'W012':'native source i902/i903 level13 can be removed before invalid output',
                                           'W015':'source pays on P11 and P0–3; dedicated tooltip restricts to killing monsters',
                                           'W017':'Q17 corrected map UI probabilities'}.get(id),
                            'validation':'source and relevant grouped VM probe'})
        raw = run_source_probes(db)
    x={'scope':8,'ready':8,'pending':0,'workbookSkillCountIncrement':0,
       'workbookOverview':[{'source':p,'row':r,'cell':'B'+str(r)} for p,r,_ in overview],
       'selection':{'sourceBook':book,'choiceMap':CHOICES,'baseRank':1,'promotionWaves':[10,20,30,40],
                    'retirementModes':['Endless entry','Abyss entry'],'carryEarnedAttributeContribution':True},
       'records':records,'validation':{'rawVM':raw,'originalClient':'untested'},'sourceHash':dict(fingerprints)[index.DISASM]}
    serialized=json.dumps(x,indent=2,ensure_ascii=False)+'\n'
    if '--write' in sys.argv:
        OUT.write_text(serialized)
    else:
        assert OUT.read_text()==serialized
    print('8 worker talents, 8 selector links; source and time/order probes passed')


if __name__=='__main__':
    main()
