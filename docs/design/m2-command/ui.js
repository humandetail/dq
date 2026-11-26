import { createStage } from './stage.js';
import { heroSpells } from '../../../src/game/m2/hero-spells.ts';

const $ = selector => document.querySelector(selector);
const keys = ['Q','W','E','R','A','S','D','F','Z','X','C','V'];
const bagKeys = ['Q','W','E','A','S','D'];
const glyphs = {
  attack:'m5 19 14-14m-3 0h3v3M4 14l6 6M4 20l2-2',
  stop:'M6 6h12v12H6Z',
  move:'M12 3v18M3 12h18m-4-4 4 4-4 4M8 7l4-4 4 4',
  upgrade:'m5 13 7-8 7 8M12 5v16',
  recycle:'M5 8a8 8 0 1 1-1 8M5 3v5h5',
  back:'m10 5-7 7 7 7M3 12h17',
  build:'M3 10 12 3l9 7M5 9v12h14V9M10 21v-7h4v7',
  box:'m3 7 9-4 9 4-9 4-9-4Zm0 0v11l9 4 9-4V7M12 11v11',
  cross:'M12 4v16M4 12h16',
};
const svg = type => `<svg viewBox="0 0 24 24"><path d="${glyphs[type] || glyphs.cross}"/></svg>`;
const items = [
  {id:'i101',name:'艺人面罩',art:8,price:625,kind:'组件',effect:'魔法回复',copy:'提高佩戴者的魔法恢复能力。',category:'attributes'},
  {id:'i102',name:'能量之球',art:9,price:425,kind:'组件',effect:'最大魔法',copy:'增加佩戴者的魔法上限。',category:'attributes'},
  {id:'i105',name:'精灵皮靴',art:10,price:300,kind:'组件',effect:'敏捷',copy:'提升佩戴者的敏捷属性。',category:'attributes'},
  {id:'i109',name:'巨人力量腰带',art:11,price:300,kind:'组件',effect:'力量',copy:'提升佩戴者的力量属性。',category:'attributes'},
  {id:'i110',name:'食人魔之斧',art:12,price:700,kind:'组件',effect:'力量',copy:'进一步提升佩戴者的力量属性。',category:'attributes'},
  {id:'i117',name:'阔剑',art:13,price:820,kind:'组件',effect:'攻击力',copy:'提高佩戴者的普通攻击伤害。',category:'attack'},
];
const unitDefinitions = [
  {id:'tiny',name:'小小',template:'H021',art:0,rarity:'SR',role:'力量英雄 · 近战',level:18,hp:'2,460 / 2,460',mana:'480 / 620',x:-288,y:-160,stats:[['攻击','348','+180'],['护甲','12','+4'],['力量','116','+24'],['攻速','1.45 秒',''],['敏捷','17',''],['射程','750','']],bag:[items[3],items[4],items[1],{id:'i310',name:'阿哈利姆神杖',art:14,kind:'装备',effect:'技能强化',copy:'为适用英雄强化对应技能。'},{id:'i193',name:'死灵书Lv1',art:7,kind:'主动装备',active:true,self:true,effect:'召唤',copy:'召唤单位协助作战。'}]},
  {id:'dragon',name:'双头龙',template:'H044',art:1,rarity:'SR',role:'智力英雄 · 远程',level:16,hp:'1,820 / 1,820',mana:'760 / 920',x:288,y:-160,stats:[['攻击','216','+45'],['护甲','8',''],['力量','62',''],['攻速','1.68 秒',''],['智力','124','+18'],['射程','900','']],bag:[items[0],items[1]]},
  {id:'shaman',name:'暗影萨满',template:'H029',art:2,rarity:'SR',role:'智力英雄 · 远程',level:15,hp:'1,640 / 1,640',mana:'640 / 780',x:640,y:-160,stats:[['攻击','198','+36'],['护甲','7',''],['力量','56',''],['攻速','1.72 秒',''],['智力','108','+12'],['射程','600','']],bag:[items[0]]},
  {id:'worker',name:'工人',template:'w001',art:3,rarity:'',role:'建造 · 拾取 · 交接',level:1,hp:'250 / 250',mana:'200 / 200',x:-650,y:-200,stats:[['移动','350',''],['背包','6 格',''],['职责','建造',''],['交接','1,000','']],bag:[]},
];
const units = structuredClone(unitDefinitions).map(unit=>({...unit,skillPoints:unit.id==='worker'?0:1,skillRanks:{A067:3,A068:3,A069:2,A170:3,A171:3,A172:2,A092:3,A093:3,A094:2}}));
let active = units[0];
let selection = ['tiny'];
let learning = false;
let paused = false;
let speed = 1;
let mode = null;
let gold = 8640;
let cooldowns = {};
let autoModes = {};
let groups = {1:['tiny','dragon','shaman'],2:['worker']};
let marketTab = 'shop';
let category = 'all';
let selectedItem = items[4];
let toastTimer;
let tooltipTimer;
let stage;
const searchValues = {shop:'',craft:'',codex:''};
const storageKey = 'td3-ui-design-autocast-v1';
try { autoModes = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { autoModes = {}; }

function notify(message, error = false) {
  const node = $('#notification');
  node.textContent = message;
  node.classList.toggle('error',error);
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{node.hidden = true;},2600);
}
function saveMode() {
  try { localStorage.setItem(storageKey, JSON.stringify(autoModes)); return true; }
  catch { notify('自动施法设置未能保存，本次切换仍然有效',true); return false; }
}
function isAuto(id) { return autoModes[`${active.id}:${id}`] ?? true; }
function setMode(next) {
  mode = next;
  $('#order-hint').hidden = !next;
  $('#order-hint').textContent = next ? `${next.label} · ${next.prompt || '左键选择目标'}　　右键 / Esc 取消` : '';
  $('#cast-ring').hidden = !next || next.kind === 'transfer';
  hideTooltip();
  renderDeck();
}
function selectUnit(id, additive = false) {
  const unit = units.find(entry=>entry.id === id);
  if (!unit) return;
  if (mode?.kind === 'transfer') {
    const source = units.find(entry=>entry.id === mode.from);
    if (source.id === unit.id) return notify('请选择其他单位接收物品',true);
    if (unit.bag.filter(Boolean).length >= 6) return notify(`${unit.name}物品栏已满，请重新选择`,true);
    const item = source.bag[mode.slot];
    const empty = unit.bag.findIndex(entry=>!entry);
    if(empty >= 0) unit.bag[empty] = item; else unit.bag.push(item);
    source.bag[mode.slot] = null;
    setMode(null);
    notify(`${item.name}已交给${unit.name}`);
    return;
  }
  if (mode?.kind === 'cast') return notify('目标无效，请选择敌人或地面',true);
  if (additive) selection = selection.includes(id) ? selection.filter(entry=>entry!==id) : [...selection,id];
  else selection = [id];
  if(!selection.length) selection = [id];
  active = unit;
  learning = false;
  renderDeck();
  stage?.setSelection(selection,active.id);
}
function skillCommands() {
  if(active.enemy) return [];
  if(active.id === 'worker') return [
    {id:'move',label:'移动',glyph:'move',description:'右键地面也可下达移动指令。'},
    {id:'stop',label:'停止',glyph:'stop',description:'停止当前移动或工作。'},
    {id:'build',label:'建造',glyph:'build',description:'选择建造位置，工人自动前往施工。'},
    {id:'pickup',label:'拾取',glyph:'box',description:'右键地上物品也可拾取。'},
    {id:'shop',label:'商店',art:8,description:'购买装备与组件，送至工人物品栏。'},
    {id:'craft',label:'合成',glyph:'cross',description:'查找配方与所需材料。'},
    {id:'codex',label:'图鉴',art:7,description:'查看塔、英雄与技能。'},
  ];
  const skills = active.id === 'tiny' ? [
    {id:'A067',label:'山崩',art:4,passive:true,description:'普通攻击有概率造成范围伤害与眩晕。力量提升触发概率，最高 60%；内置冷却 2 秒。'},
    {id:'A068',label:'战棍',art:5,self:true,automatic:true,description:'提高力量，普通攻击获得范围分裂效果，持续 6 秒。',detail:'持续 6 秒 · 基础冷却 15 秒'},
    {id:'A069',label:'长大',art:6,passive:true,description:'每次学习永久增加 90 基础攻击，并改变模型大小。六档共增加 540。'},
  ] : active.id === 'dragon' ? [
    {id:'A170',label:'冰火交加',art:1,automatic:true,description:'向指定方向释放冰火吐息。'},
    {id:'A171',label:'冰封路径',art:9,automatic:true,description:'指定路径，控制沿途敌人。'},
    {id:'A172',label:'烈焰焚身',art:15,automatic:true,description:'在指定区域释放持续法术。'},
  ] : [
    {id:'A092',label:'苍穹震击',art:9,automatic:true,description:'选择敌人，释放范围闪电。'},
    {id:'A093',label:'枷锁',art:14,automatic:true,description:'选择敌人，持续引导并控制目标。'},
    {id:'A094',label:'群蛇守卫',art:2,automatic:true,description:'选择地面，召唤群蛇守卫。'},
  ];
  for(const skill of skills) skill.rank=active.skillRanks?.[skill.id]??0;
  if(learning) return [
    ...skills.map(skill=>({...skill,passive:false,automatic:false,learn:true,description:`学习${skill.label}。${skill.description}`})),
    {id:'attribute',label:'属性成长',glyph:'cross',learn:true,description:'提升英雄的基础属性。'},
    {id:'back',label:'返回',glyph:'back',description:'返回施法与常用指令。'},
  ];
  return [...skills,{id:'learn',label:'学技能',art:7,description:'查看可学习的技能。'},
    {id:'attack',label:'攻击',glyph:'attack',description:'选择敌人作为优先攻击目标。'},
    {id:'stop',label:'停止',glyph:'stop',description:'取消当前攻击指令。'},
    {id:'upgrade',label:'升级',glyph:'upgrade',description:'查看英雄成长与升级。'},
    {id:'recycle',label:'回收',glyph:'recycle',description:'回收前确认返还内容及装备去向。'},
  ];
}
function commandHTML(command,index) {
  if(!command) return `<button class="command empty" disabled aria-label="空命令位"><kbd>${keys[index]}</kbd></button>`;
  const classes = ['command',command.art!==undefined?'art':'',command.passive?'passive':'',command.automatic&&isAuto(command.id)?'auto':'',command.learn?'learning':'',mode?.id===command.id?'targeting':''].filter(Boolean).join(' ');
  const cooldown = Math.ceil(cooldowns[`${active.id}:${command.id}`] || 0);
  return `<button class="${classes}" style="--art:${command.art??0}" data-command="${command.id}" aria-label="${command.label}${command.passive?'，被动技能':''}${command.automatic?isAuto(command.id)?'，自动施法':'，手动施法':''}" ${command.automatic?`aria-pressed="${isAuto(command.id)}"`:''}><kbd>${command.passive?'被动':keys[index]}</kbd>${command.glyph?svg(command.glyph):''}${command.rank!==undefined?`<span class="skill-rank">${command.rank}/6</span>`:''}<span class="command-label">${command.label}</span>${cooldown?`<span class="cooldown">${cooldown}</span>`:''}</button>`;
}
function renderDeck() {
  $('.xp').hidden = !!active.enemy || active.id==='worker';
  $('.inventory').style.visibility = active.enemy?'hidden':'';
  $('#level-badge').hidden = !!active.enemy;
  $('#unit-name').textContent = active.name;
  $('#unit-role').textContent = active.role;
  $('#unit-rarity').textContent = active.rarity;
  $('#unit-rarity').hidden = !active.rarity;
  $('#level-badge').textContent = active.level;
  $('#portrait').style.setProperty('--art',active.art);
  $('#health-label').textContent = active.hp;
  $('#mana-label').textContent = active.mana;
  $('#selection-caption').textContent = selection.length>1 ? `已选择 ${selection.length} 个单位 · 当前 ${active.name}` : `当前选择 · ${active.name}`;
  $('#stats').innerHTML = active.stats.map(([name,value,bonus])=>`<div><span>${name}</span><strong>${value} <em>${bonus}</em></strong></div>`).join('');
  $('#party').innerHTML = units.filter(unit=>selection.includes(unit.id)).map(unit=>`<button class="party-avatar art ${selection.includes(unit.id)?'selected':''} ${active.id===unit.id?'active':''}" style="--art:${unit.art}" data-unit="${unit.id}" aria-label="选择${unit.name}" title="${unit.name}"></button>`).join('');
  $('#hero-shortcuts').innerHTML = units.map(unit=>`<button class="hero-shortcut art ${active.id===unit.id?'active':''}" style="--art:${unit.art}" data-unit="${unit.id}" aria-label="快速选择${unit.name}" title="${unit.name}"><span>${unit.level}</span><i class="mini-health"></i></button>`).join('');
  $('#inventory-count').textContent = `${active.bag.filter(Boolean).length} / 6`;
  $('#inventory-grid').innerHTML = Array.from({length:6},(_,index)=>{
    const item = active.bag[index];
    const auto = item?.active && isAuto(item.id);
    return `<button class="item-slot ${item?'art':'empty'} ${auto?'auto':''} ${mode?.kind==='transfer'&&mode.from===active.id&&mode.slot===index?'transfer':''}" style="--art:${item?.art??0}" data-slot="${index}" aria-label="${item?.name || '空物品栏'}"><kbd>⌥ ${bagKeys[index]}</kbd></button>`;
  }).join('');
  const commands = skillCommands();
  $('#command-grid').innerHTML = Array.from({length:12},(_,index)=>commandHTML(commands[index],index)).join('');
  $('#command-title').textContent = learning?'学习技能':'指令';
  $('#skill-points').hidden = active.id === 'worker' || !!active.enemy;
  $('#skill-points').innerHTML = `可学习 <b>${active.skillPoints??0}</b>`;
}
function runCommand(id) {
  if(!$('#market-backdrop').hidden || !$('#confirm-backdrop').hidden || !$('#help-backdrop').hidden) return;
  const command = skillCommands().find(entry=>entry.id===id);
  if(!command) return;
  if(command.passive) return notify(`${command.label}为被动技能，随战斗自动生效`);
  if(command.learn) {
    if((active.skillRanks[command.id]??0)>=6)return notify('技能已达到最高等级');
    if(!active.skillPoints)return notify('没有可用技能点',true);
    active.skillPoints--;
    active.skillRanks[command.id]=(active.skillRanks[command.id]??0)+1;
    if(command.id==='A069')active.stats[0][1]=String(Number(active.stats[0][1])+90);
    learning = false;
    notify(`${command.label}提升至 ${active.skillRanks[command.id]} 级`);
    return renderDeck();
  }
  if(id === 'learn' || id === 'back') { learning = id === 'learn'; hideTooltip(); return renderDeck(); }
  if(['shop','craft','codex'].includes(id)) return openMarket(id);
  if(id === 'stop') {setMode(null);stage?.stop(active.id);return notify(`${active.name}已停止当前指令`);}
  if(id === 'recycle') {
    $('#confirm-title').textContent = `回收${active.name}？`;
    $('#confirm-copy').textContent = `返还${active.name}塔卡；${active.bag.filter(Boolean).length} 件装备留在原位置，等待工人拾取。`;
    $('#confirm-backdrop').hidden = false;
    hideTooltip();
    return;
  }
  if(id === 'upgrade') return notify(`${active.name}升级条件请在详细属性中查看`);
  if(cooldowns[`${active.id}:${id}`]>0) return notify('技能冷却中',true);
  if(command.self) {
    cooldowns[`${active.id}:${id}`] = 15;
    stage?.cast(active.id);
    notify(`${active.name}施放战棍 · 持续 6 秒`);
    renderDeck();
    $(`[data-command="${id}"]`)?.classList.add('active-flash');
    return;
  }
  setMode({kind:['attack','move','build','pickup'].includes(id)?id:'cast',id,label:command.label,from:active.id});
}
function toggleCommand(id) {
  const command = skillCommands().find(entry=>entry.id===id);
  if(!command?.automatic) return;
  autoModes[`${active.id}:${id}`] = !isAuto(id);
  const enabled = isAuto(id);
  renderDeck();
  if(saveMode()) notify(`${command.label} · ${enabled?'自动施法':'手动施法'}`);
}
function useItem(index) {
  const item = active.bag[index];
  if(!item) return;
  if(!item.active) return notify(`${item.name}为被动装备，持有时生效`);
  if(item.self){stage?.cast(active.id);notify(`已下达${item.name}使用指令`);return;}
  setMode({kind:'cast',id:item.id,label:item.name,from:active.id});
}
function hideTooltip(){clearTimeout(tooltipTimer);$('#tooltip').hidden = true;}
function showTooltip(node, item, extra='') {
  let comparison = '';
  if(item.learn && item.rank !== undefined && item.rank < 6) {
    const rank = item.rank;
    let rows = [];
    if(item.id === 'A067') {
      const damage=[0,150,275,420,650,860,1120], stun=[0,.4,.6,.8,1,1.2,1.5];
      rows=[['名义伤害',damage[rank],damage[rank+1]],['普通目标眩晕',`${stun[rank]} 秒`,`${stun[rank+1]} 秒`]];
    } else if(item.id === 'A068') {
      const strength=[0,20,35,50,65,80,100],mana=[0,10,15,20,25,30,40];
      rows=[['力量加成',strength[rank],strength[rank+1]],['魔法消耗',mana[rank],mana[rank+1]]];
    } else if(item.id === 'A069') {
      rows=[['永久基础攻击',`+${rank*90}`,`+${(rank+1)*90}`]];
    } else if(heroSpells[item.id]) {
      const skill=heroSpells[item.id];
      if(skill.damage[rank]>0)rows.push(['技能伤害',skill.damage[rank-1]??0,skill.damage[rank]]);
      rows.push(['魔法消耗',skill.mana[rank-1]??0,skill.mana[rank]]);
    }
    comparison=`<div class="skill-comparison"><div class="comparison-heading"><span>等级</span><span>${rank}</span><span>→</span><b>${rank+1}</b></div>${rows.map(([name,current,next])=>`<div><span>${name}</span><span>${current}</span><span>→</span><b>${next}</b></div>`).join('')}</div>`;
  }
  const tooltip = $('#tooltip');
  tooltip.innerHTML = `<h3>${item.label || item.name}</h3><div class="tooltip-type">${item.passive?'被动技能':item.kind || '英雄技能'}${item.detail?' · '+item.detail:''}</div><p>${item.description || item.copy || ''}</p>${comparison}${extra?`<div class="tooltip-hint">${extra}</div>`:''}`;
  tooltip.hidden = false;
  const box = node.getBoundingClientRect();
  tooltip.style.left = `${Math.min(window.innerWidth-320,Math.max(12,box.left-20))}px`;
  tooltip.style.top = `${Math.max(60,box.top-tooltip.offsetHeight-14)}px`;
}

function openMarket(tab) {
  setMode(null);learning = false;hideTooltip();
  marketTab = tab; category = 'all';
  selectedItem = tab==='codex'?units[0]:items[4];
  $('#market-backdrop').hidden = false;
  $('#search').value = searchValues[tab];
  renderMarket();
}
function closeMarket(){ $('#market-backdrop').hidden=true;hideTooltip();$('#field').focus(); }
function renderMarket() {
  const labels = {shop:'商店',craft:'合成',codex:'图鉴'};
  $('#market-title').textContent = labels[marketTab];
  $('#market-running').textContent = paused?'战斗已暂停':'战斗进行中';
  document.querySelectorAll('[data-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tab===marketTab));
  const tab = $(`[data-tab="${marketTab}"]`);
  $('#tab-indicator').style.width = `${tab.offsetWidth}px`;
  $('#tab-indicator').style.transform = `translateX(${tab.offsetLeft}px)`;
  const filterList = marketTab==='codex'?[['all','全部'],['hero','英雄'],['worker','工人']]:marketTab==='craft'?[['all','配方'],['owned','已有材料']]:[['all','全部'],['attributes','属性'],['attack','攻击']];
  $('#filters').innerHTML = filterList.map(([id,label])=>`<button data-category="${id}" class="${category===id?'active':''}">${label}</button>`).join('');
  const query = $('#search').value.trim();
  const pool = marketTab==='codex'?units:marketTab==='craft'?[{id:'i265',name:'邪念法杖',art:14,kind:'装备',effect:'法术强化',copy:'由制作书与怨念魔杖合成。',category:'owned'}]:items;
  const visible = pool.filter(item=>item.name.includes(query) && (category==='all'||item.category===category||category==='hero'&&item.id!=='worker'||category==='worker'&&item.id==='worker'));
  $('#goods-list').innerHTML = visible.length ? visible.map(item=>`<button class="goods-card ${selectedItem.id===item.id?'selected':''}" data-good="${item.id}"><span class="art" style="--art:${item.art}"></span><b>${item.name}</b>${item.price!==undefined?`<span class="price">${item.price.toLocaleString()} 金</span>`:`<small>${item.role||item.kind}</small>`}</button>`).join('') : '<p class="empty-search">没有找到匹配的内容</p>';
  if(!visible.some(item=>item.id===selectedItem.id) && visible.length) selectedItem = visible[0];
  if(!visible.length){$('#item-detail').innerHTML='<p class="detail-copy">换个关键词继续查找。</p>';return;}
  renderDetail();
}
function renderDetail() {
  const item = selectedItem;
  const isCodex = marketTab === 'codex';
  $('#item-detail').innerHTML = `<div class="detail-title"><span class="art" style="--art:${item.art}"></span><div><h3>${item.name}</h3><p>${item.role||item.kind}</p></div></div><p class="detail-attributes">${isCodex?item.role:item.effect}</p><p class="detail-copy">${isCodex?(item.id==='tiny'?'山崩 · 战棍 · 长大<br>山崩与长大为被动，战棍支持手动或自动施放。':'选择单位后，在底部命令区查看技能和操作。'):item.copy}</p>${marketTab==='craft'?'<div class="detail-source">所需材料</div><div class="recipe-row"><span class="art" style="--art:7"></span><span>邪念法杖制作书<br><span class="muted">尚未持有</span></span></div><div class="recipe-row"><span class="art" style="--art:14"></span><span>怨念魔杖<br><span class="muted">尚未持有</span></span></div>':isCodex?'':'<div class="detail-source">被动生效<br>可交给英雄，或作为合成材料。</div>'}<div class="detail-bottom">${marketTab==='shop'?`<div class="detail-total"><span>价格</span><strong>${item.price.toLocaleString()} 金</strong></div><button class="primary" id="buy-button">购买 <span>${item.price} 金</span></button><div class="buy-status" id="buy-status" role="status"></div>`:marketTab==='craft'?'<button class="primary" disabled>材料不足</button>':`<button class="primary" id="locate-unit">选择${item.name}</button>`}</div>`;
}
function buyItem() {
  const worker = units.find(unit=>unit.id==='worker');
  const message = gold<selectedItem.price?'金币不足':worker.bag.filter(Boolean).length>=6?'工人物品栏已满':'';
  if(message){$('#buy-status').textContent=message;return;}
  gold -= selectedItem.price;
  const empty=worker.bag.findIndex(item=>!item);
  if(empty>=0) worker.bag[empty]=selectedItem; else worker.bag.push(selectedItem);
  $('#gold').textContent=gold.toLocaleString();
  $('#buy-status').textContent=`${selectedItem.name}已送至工人物品栏（${worker.bag.filter(Boolean).length}/6）`;
  renderDeck();
}
function pause() {
  paused = !paused;
  $('#paused-label').hidden = !paused;
  $('#pause-button').innerHTML = paused?'<svg viewBox="0 0 24 24"><path d="m8 4 12 8-12 8Z"/></svg>':'<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>';
  $('#pause-button').setAttribute('aria-label',paused?'继续':'暂停');
  $('#market-running').textContent=paused?'战斗已暂停':'战斗进行中';
  stage?.setPaused(paused);
}
function cancel() {
  if(!$('#help-backdrop').hidden){$('#help-backdrop').hidden=true;return;}
  if(!$('#confirm-backdrop').hidden){$('#confirm-backdrop').hidden=true;return;}
  if(!$('#market-backdrop').hidden)return closeMarket();
  if(mode)return setMode(null);
  if(learning){learning=false;return renderDeck();}
  selection=[];stage?.setSelection([],null);
  $('#selection-caption').textContent='未选择单位';
  $('.deck-body').style.visibility='hidden';
}
document.addEventListener('click',event=>{
  const unitButton = event.target.closest('[data-unit]');
  if(unitButton){$('.deck-body').style.visibility='';return selectUnit(unitButton.dataset.unit,event.shiftKey);}
  const command = event.target.closest('[data-command]');
  if(command)return runCommand(command.dataset.command);
  const slot = event.target.closest('[data-slot]');
  if(slot)return useItem(Number(slot.dataset.slot));
  const open = event.target.closest('[data-open]');
  if(open)return openMarket(open.dataset.open);
  const tab = event.target.closest('[data-tab]');
  if(tab){searchValues[marketTab]=$('#search').value;return openMarket(tab.dataset.tab);}
  const filter = event.target.closest('[data-category]');
  if(filter){category=filter.dataset.category;return renderMarket();}
  const good = event.target.closest('[data-good]');
  if(good){selectedItem=marketTab==='codex'?units.find(unit=>unit.id===good.dataset.good):items.find(item=>item.id===good.dataset.good)||{id:'i265',name:'邪念法杖',art:14,kind:'装备',effect:'法术强化',copy:'由制作书与怨念魔杖合成。'};renderMarket();return;}
  if(event.target.closest('#buy-button'))return buyItem();
  if(event.target.closest('#locate-unit')){const id=selectedItem.id;closeMarket();selectUnit(id);return;}
});
document.addEventListener('contextmenu',event=>{
  event.preventDefault();
  if(!$('#market-backdrop').hidden||!$('#help-backdrop').hidden||!$('#confirm-backdrop').hidden)return;
  if(mode)return setMode(null);
  const command=event.target.closest('[data-command]');
  if(command)return toggleCommand(command.dataset.command);
  const slot=event.target.closest('[data-slot]');
  if(slot){const index=Number(slot.dataset.slot);const item=active.bag[index];if(!item)return;if(event.altKey){if(!item.active)return notify(`${item.name}为被动装备，无需切换施法模式`);autoModes[`${active.id}:${item.id}`]=!isAuto(item.id);renderDeck();if(saveMode())notify(`${item.name} · ${isAuto(item.id)?'自动使用':'手动使用'}`);return;}setMode({kind:'transfer',from:active.id,slot:index,label:`转交${item.name}`,prompt:'左键选择接收单位或头像'});}
});
document.addEventListener('pointerover',event=>{
  const command=event.target.closest('[data-command]');
  const slot=event.target.closest('[data-slot]');
  if(command){const entry=skillCommands().find(item=>item.id===command.dataset.command);if(entry)showTooltip(command,entry,entry.automatic?`${isAuto(entry.id)?'自动施法已开启':'手动施法'} · 右键切换`:entry.passive?'攻击触发或学习生效':'左键或对应快捷键操作');}
  else if(slot&&active.bag[Number(slot.dataset.slot)])showTooltip(slot,active.bag[Number(slot.dataset.slot)],active.bag[Number(slot.dataset.slot)].active?'左键使用 · 右键转交 · Alt + 右键切换自动':'持有时生效 · 右键转交');
});
document.addEventListener('pointerout',event=>{if(event.target.closest('[data-command],[data-slot]'))hideTooltip();});
document.addEventListener('dblclick',event=>{const button=event.target.closest('[data-unit]');if(button)stage?.focus(button.dataset.unit);});
let lastGroup={key:'',at:0};
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();return cancel();}
  if(event.target instanceof HTMLInputElement)return;
  if(event.code==='Space'){event.preventDefault();if(!event.repeat)pause();return;}
  if(!$('#market-backdrop').hidden||!$('#help-backdrop').hidden||!$('#confirm-backdrop').hidden)return;
  if(event.repeat)return;
  if(event.key==='Tab'){event.preventDefault();const index=selection.indexOf(active.id);const next=selection[(index+1)%selection.length];if(next){active=units.find(unit=>unit.id===next);learning=false;renderDeck();stage?.setSelection(selection,active.id);}return;}
  if(/^Digit[0-9]$/.test(event.code)){event.preventDefault();const digit=event.code.slice(-1);if(event.ctrlKey){groups[digit]=[...selection];return notify(`编队 ${digit} · ${selection.length} 个单位`);}if(groups[digit]?.length){selection=[...groups[digit]];active=units.find(unit=>unit.id===selection[0]);$('.deck-body').style.visibility='';renderDeck();stage?.setSelection(selection,active.id);if(lastGroup.key===digit&&performance.now()-lastGroup.at<350)stage?.focus(active.id);lastGroup={key:digit,at:performance.now()};}return;}
  const letter=event.code.startsWith('Key')?event.code.slice(3):'';
  if(event.altKey&&bagKeys.includes(letter)){event.preventDefault();return useItem(bagKeys.indexOf(letter));}
  if(keys.includes(letter)){event.preventDefault();const command=skillCommands()[keys.indexOf(letter)];if(command)runCommand(command.id);}
});
$('#pause-button').onclick=pause;
$('#speed-button').onclick=()=>{speed=speed===1?4:1;$('#speed-button').textContent=`${speed}×`;stage?.setSpeed(speed);};
$('#reset-camera').onclick=()=>stage?.reset();
$('#close-market').onclick=closeMarket;
$('#search').oninput=renderMarket;
$('#cancel-recycle').onclick=()=>{$('#confirm-backdrop').hidden=true;};
$('#confirm-recycle').onclick=()=>{const name=active.name;const index=units.indexOf(active);stage?.remove(active.id);units.splice(index,1);$('#confirm-backdrop').hidden=true;selectUnit('worker');notify(`${name}已回收，塔卡与装备留在原位置`);};
$('#menu-button').onclick=()=>{hideTooltip();$('#help-backdrop').hidden=false;};
$('#close-help').onclick=$('#help-done').onclick=()=>{$('#help-backdrop').hidden=true;};
$('#details-button').onclick=event=>showTooltip(event.target,{name:active.name,kind:active.role,copy:active.stats.map(([name,value,bonus])=>`${name} ${value}${bonus}`).join(' · ')},'各项数值随等级与装备变化');
renderDeck();
let elapsed=0;
setInterval(()=>{
  if(paused||document.hidden)return;
  elapsed+=speed;
  const total=988+elapsed;
  $('#clock').textContent=`${Math.floor(total/60)}:${String(total%60).padStart(2,'0')}`;
  $('#wave-countdown').textContent=`00:${String(42-elapsed%43).padStart(2,'0')}`;
  let changed=false;
  for(const key of Object.keys(cooldowns)){if(cooldowns[key]>0){cooldowns[key]=Math.max(0,cooldowns[key]-speed);changed=true;}}
  if(changed)renderDeck();
},1000);
const urlState=new URLSearchParams(location.search).get('state');
if(urlState==='shop'||urlState==='craft'||urlState==='codex')openMarket(urlState);
if(urlState==='learn'){learning=true;renderDeck();}
if(urlState==='worker')selectUnit('worker');
if(urlState==='multi'){selection=['tiny','dragon','shaman'];renderDeck();}
try {
  stage=await createStage(units,{
    select(id,additive){$('.deck-body').style.visibility='';selectUnit(id,additive);},
    multi(ids){if(ids.length){selection=ids;active=units.find(unit=>unit.id===ids[0]);$('.deck-body').style.visibility='';renderDeck();stage.setSelection(selection,active.id);}},
    point(point,enemyId,right){
      if(!$('#market-backdrop').hidden||!$('#help-backdrop').hidden)return;
      if(right&&mode){setMode(null);return;}
      if(mode?.kind==='transfer')return notify('请选择接收单位或头像',true);
      if(mode?.kind==='cast'){
        if(!enemyId&&active.id==='shaman'&&mode.id!=='A094')return notify('目标无效，请选择敌人',true);
        const id=mode.id;stage.cast(active.id,point);cooldowns[`${active.id}:${id}`]=10;notify(`${active.name}施放${mode.label}`);setMode(null);return;
      }
      if(mode?.kind==='build'){stage.build(point);notify('建造指令已下达');setMode(null);return;}
      if(mode?.kind==='move'||right&&active.id==='worker'){stage.moveWorker(point);notify('工人正在前往指定位置');setMode(null);return;}
      if(mode?.kind==='attack'||right&&enemyId){stage.attack(selection,enemyId);notify(`已指定集火目标`);setMode(null);return;}
      if(!right&&enemyId){
        active={id:`enemy-${enemyId}`,enemy:true,name:'主线怪物',role:'敌方 · 地面单位',rarity:'',art:15,level:18,hp:`${Math.round(point.hp)} / ${point.maxHp}`,mana:'0 / 0',bag:[],stats:[['生命',String(Math.round(point.hp)),''],['护甲',String(point.armor??0),''],['容怪点数',String(point.points),''],['移动',String(point.speed),'']]};
        selection=[];learning=false;$('.deck-body').style.visibility='';renderDeck();stage.setSelection([enemyId],enemyId);return;
      }
      if(mode?.kind==='pickup'){notify('此处没有可拾取物品',true);}
    },
  });
  stage.setSelection(selection,active.id);stage.setPaused(paused);
  $('#loading').hidden=true;
  document.body.dataset.ready='true';
}catch(error){$('#loading').textContent='战场素材加载失败，请刷新重试';console.error(error);document.body.dataset.error=String(error);}

// Design prototype state is deliberately separate from the game's save database.
window.designState=()=>({active:active.id,selection:[...selection],paused,speed,mode:mode?.kind||null,learning,gold,autoModes:{...autoModes},workerItems:units.find(unit=>unit.id==='worker').bag.filter(Boolean).length,marketOpen:!$('#market-backdrop').hidden,marketTab});
