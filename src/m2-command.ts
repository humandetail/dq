import { eventBoxes } from "./game/m2/event-boxes.ts";
import { cardTemplates, items, ordinaryGoods, prayerBooks, recipes, recycleRate, towerLevels } from './game/m2/content.ts';
import { effectiveAttributes, weapons } from './game/m2/combat.ts';
import { learnableSkills, learningLevel } from './game/m2/hero.ts';
import { pointTowerSpell, towerSpells } from './game/m2/tower-spells.ts';
import { heroAutoCastOrder, heroSpellTargetMode, isCastableHeroSkill, heroSpells } from './game/m2/hero-spells.ts';
import { activeHeroSkill, attackOrb, bearAbilities, canChooseOpening, canSeeEnemy, circleId, doomAbilities, isActiveTowerEquipment, isPointTargetedTowerEquipment, isTargetedEquipment, itemSaleQuote, type Action, type Match } from './game/m2/match.ts';
import type { createM2Scene } from './m2-scene.ts';
import type { Point } from './game/m2/map.ts';
import './m2-command.css';
import { originalIconUrl, prependOriginalIcon, setCommandIcon } from './m2-icons.ts';
type Scene = Awaited<ReturnType<typeof createM2Scene>>;
type Unit = Match['structures'][number];
type Target = {
    action: (point: Point, id?: number) => Action;
    kind: 'point' | 'enemy' | 'ally';
    label: string;
    command?: string;
};
const keys = ['q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 'z', 'x', 'c', 'v'];
const itemKeys = ['q', 'w', 'e', 'a', 's', 'd'];
const portraitById: Record<string, number> = { H021: 0, G059: 0, H044: 1, H029: 2, nsha: 3 };
export function createCommandUI(options: {
    match: () => Match | undefined;
    scene: () => Scene | undefined;
    send: (action: Action) => string | undefined;
    writable: () => boolean;
    refreshManagement: () => void;
    cancel: () => void;
    placing: () => boolean;
}) {
    const get = (id: string) => document.getElementById(id)!;
    const canvas = get('field') as HTMLCanvasElement;
    const aside = document.querySelector('aside')!;
    const main = document.querySelector('main')!;
    let selection: number[] = [-1];
    let current = -1;
    let enemyId: number | undefined;
    let learning = false;
    let target: Target | undefined;
    let carrying: number | undefined;
    let modal = '';
    let touchMode: 'order' | 'more' | undefined;
    let matchId = '';
    let openingShown = false;
    let lastRender = '';
    let commands: (() => void)[] = [];
    let dragStart: {
        x: number;
        y: number;
    } | undefined;
    let suppressClick = false;
    const groups = new Map<string, number[]>();
    let lastGroup = { key: '', at: 0 };
    let damageTimestamp = -1;
    let damageAtTimestamp = 0;
    let usesDamageEvents = false;
    const markers = new Map<string, HTMLElement>();
    const floating: {
        node: HTMLElement;
        point: Point;
        start: number;
        lane: number;
    }[] = [];
    const announce = (message: string) => { get('feedback').textContent = message; };
    const button = (label: string, action: () => void, disabled = false) => {
        const element = document.createElement('button');
        element.textContent = label;
        element.disabled = disabled;
        element.onclick = action;
        return element;
    };
    const painted = (element: HTMLElement, id: string, learning = false) => {
        const url = originalIconUrl(id, learning);
        if (url) {
            element.classList.add('original-icon-tile');
            element.style.setProperty('--original-icon', `url("${url}")`);
            return true;
        }
        const index = portraitById[id];
        if (index !== undefined) {
            element.classList.add('painted');
            element.style.backgroundPosition = `${index % 4 * 100 / 3}% ${Math.floor(index / 4) * 100 / 3}%`;
        }
        return false;
    };
    document.body.classList.add('command-ui');
    const header = document.querySelector('header')!;
    header.querySelector('h1')!.textContent = 'TD3';
    header.querySelector('p')!.remove();
    header.append(get('resources'), get('wave'), get('boss'));
    const tools = document.createElement('nav');
    tools.className = 'command-tools';
    const managementTabs = ['商店', '合成', '图鉴', '对局'] as const;
    const managementButton = (name: typeof managementTabs[number]) => {
        const entry = button(name, () => open(name));
        if (name === '商店') setCommandIcon(entry, 'shop', name);
        if (name === '合成') setCommandIcon(entry, 'combine');
        if (name === '图鉴') setCommandIcon(entry, 'codex', name);
        return entry;
    };
    tools.append(...managementTabs.map(managementButton));
    const battlefield = main.querySelector('.battlefield')!;
    const toolbar = document.createElement('div');
    toolbar.className = 'command-toolbar';
    battlefield.before(toolbar);
    const cameraTools = battlefield.querySelector('.battlefield-tools')!;
    const placementBar = battlefield.querySelector('.placement-bar')!;
    battlefield.after(cameraTools);
    const context = document.createElement('div');
    context.className = 'command-context';
    cameraTools.after(context);
    const overlay = document.createElement('div');
    overlay.className = 'unit-overlay';
    battlefield.append(overlay);
    const shortcuts = document.createElement('div');
    shortcuts.className = 'hero-shortcuts';
    toolbar.append(shortcuts, tools);
    const dock = document.createElement('section');
    dock.className = 'command-dock';
    dock.innerHTML = '<div class="selection-strip"></div><div class="dock-body"><section class="unit-info"></section><section class="unit-inventory"><h3>物品栏 <small>Alt＋Q/W/E/A/S/D</small></h3><div class="six-slots"></div></section><section class="unit-commands"><h3>指令</h3><div class="twelve-slots"></div></section></div>';
    const touchTools = document.createElement('div');
    touchTools.className = 'touch-tools';
    const orderButton = button('下令', () => setTouchMode(touchMode === 'order' ? undefined : 'order'), true);
    const moreButton = button('更多', () => setTouchMode(touchMode === 'more' ? undefined : 'more'), true);
    const inventoryButton = button('物品', () => {
        const inventory = dock.classList.toggle('show-inventory');
        inventoryButton.textContent = inventory ? '指令' : '物品';
        setCommandIcon(inventoryButton, inventory ? 'commands' : 'inventory');
    });
    setCommandIcon(orderButton, 'order');
    setCommandIcon(inventoryButton, 'inventory');
    setCommandIcon(moreButton, 'more', '更多操作');
    touchTools.append(orderButton, inventoryButton, moreButton);
    const heading = document.createElement('div');
    heading.className = 'dock-heading';
    heading.append(dock.querySelector('.selection-strip')!, touchTools);
    dock.prepend(heading);
    const touchActions = document.createElement('div');
    touchActions.className = 'touch-actions';
    const touchPrompt = document.createElement('p');
    touchPrompt.setAttribute('role', 'status');
    const touchChoices = document.createElement('div');
    const cancelTarget = button('取消', cancel);
    setCommandIcon(cancelTarget, 'close', '取消当前操作');
    touchActions.append(touchPrompt, touchChoices, cancelTarget);
    context.append(placementBar, touchActions);
    function setTouchMode(mode: typeof touchMode) {
        if (mode && (target || carrying !== undefined || options.placing())) cancel();
        touchMode = mode;
        dock.dataset.touchMode = mode ?? '';
        orderButton.setAttribute('aria-pressed', String(mode === 'order'));
        moreButton.setAttribute('aria-pressed', String(mode === 'more'));
        touchChoices.replaceChildren();
    }
    main.append(dock);
    const backdrop = document.createElement('div');
    backdrop.className = 'command-backdrop';
    backdrop.hidden = true;
    const window = document.createElement('section');
    window.className = 'command-window';
    window.setAttribute('role', 'dialog');
    window.setAttribute('aria-modal', 'true');
    window.setAttribute('aria-label', '管理窗口');
    const tabs = document.createElement('nav');
    tabs.append(...managementTabs.map(managementButton));
    const closeWindow = button('关闭', close);
    setCommandIcon(closeWindow, 'close', '关闭窗口');
    tabs.append(closeWindow);
    const content = document.createElement('div');
    content.className = 'command-content';
    const shop = document.createElement('section');
    shop.className = 'live-shop';
    const search = document.createElement('input');
    search.placeholder = '搜索商品名称';
    search.setAttribute('aria-label', '搜索商品');
    const goods = document.createElement('div');
    goods.className = 'live-goods';
    const shopBody = document.createElement('div'); shopBody.className = 'shop-body';
    const goodsDetail = document.createElement('section'); goodsDetail.className = 'goods-detail';
    shopBody.append(goods, goodsDetail); shop.append(search, shopBody);
    const pawn = document.createElement('section');
    let pawnSignature = '';
    let selectedGood = 'i110';
    const codex = document.createElement('section');
    codex.className = 'live-codex';
    const recipe = document.createElement('section');
    recipe.className = 'live-recipes';
    content.append(shop, recipe, codex, aside);
    window.append(tabs, content);
    backdrop.append(window);
    document.body.append(backdrop);
    const status = document.createElement('div');
    status.className = 'command-status';
    status.append(get('feedback'), get('save'));
    context.append(status);
    // Existing progression and special transactions keep their original event handlers.
    const sections = [...aside.children];
    const sectionTab = new Map<Element, string>();
    for (const section of sections) {
        const name = section.querySelector('h2')?.textContent;
        sectionTab.set(section, name === '商店' ? 'legacy' : name === '神秘商店' || name === '挑战商店' ? '商店' : '对局');
    }
    function showPawn(state: Match | undefined, shopName: string) {
        const writable = options.writable();
        const offers = state?.inventory?.flatMap(item => {
            const quote = itemSaleQuote(state, item, shopName);
            return quote === undefined ? [] : [{ item, quote }];
        }) ?? [];
        const signature = JSON.stringify([state?.matchId, shopName, writable, offers.map(({ item, quote }) => [item.id, item.towerId, quote])]);
        if (signature === pawnSignature) return;
        pawnSignature = signature;
        pawn.hidden = !offers.length;
        pawn.replaceChildren();
        if (!offers.length) return;
        const title = document.createElement('h2');
        title.textContent = '出售物品';
        const choices = document.createElement('div');
        choices.className = 'controls';
        for (const { item, quote } of offers) {
            const owner = item.towerId === undefined ? '工人' : item.towerId === circleId ? '能量圈' : towerLevels.get(unit(item.towerId)?.templateId ?? '')?.name ?? '灵兽';
            const sale = button(`出售 ${items.get(item.itemId)!.name} · ${quote} 金 · ${owner}`,
                () => options.send({ type: 'sell-item', itemId: item.id, shop: shopName }), !writable);
            prependOriginalIcon(sale, item.itemId);
            choices.append(sale);
        }
        pawn.append(title, choices);
    }
    function showShop() {
        const state = options.match();
        goods.replaceChildren();
        let selectedVisible = false;
        for (const entry of ordinaryGoods.values()) {
            if (!entry.name.includes(search.value) || !entry.shop || prayerBooks.some(book => book.id === entry.id) || ['i001', 'i002', 'i003', 'i005'].includes(entry.id))
                continue;
            const card = document.createElement('article');
            const icon = document.createElement('div');
            icon.className = 'goods-art';
            if (!painted(icon, entry.id))
                icon.textContent = entry.name.slice(0, 2);
            const name = document.createElement('strong');
            name.textContent = entry.name;
            const price = document.createElement('span');
            price.textContent = `${entry.gold} 金${entry.lumber ? ` · ${entry.lumber} 木` : ''}`;
            const selected = selectedGood === entry.id;
            if (selected) selectedVisible = true;
            card.classList.toggle('selected', selected);
            card.tabIndex=0; card.setAttribute('role','button');card.setAttribute('aria-label',entry.name);
            const choose=()=>{selectedGood=entry.id;showShop();};card.onclick=choose;card.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();choose();}};
            card.append(icon, name, price);
            goods.append(card);
        }
        if (!goods.children.length) goods.textContent = '没有匹配的商品';
        goodsDetail.replaceChildren();
        goodsDetail.hidden = !selectedVisible;
        if (!selectedVisible) return;
        const selected=ordinaryGoods.get(selectedGood)!;
        const icon = document.createElement('div');
        icon.className = 'goods-art';
        if (!painted(icon, selected.id)) icon.textContent = selected.name.slice(0, 2);
        const title=document.createElement('h2');title.textContent=selected.name;
        const source=document.createElement('p');source.textContent=selected.shop;
        const description=document.createElement('p');description.textContent=recipes.has(selected.id)?'配方：'+recipes.get(selected.id)!.map(id=>items.get(id)!.name).join(' ＋ '):isActiveTowerEquipment(selected.id)||isTargetedEquipment(selected.id)||isPointTargetedTowerEquipment(selected.id)?'主动装备 · 携带后在物品栏使用。':'携带生效；可交接给英雄或用于合成。';
        const price=document.createElement('p');price.className='detail-price';price.textContent=`${selected.gold} 金${selected.lumber?' · '+selected.lumber+' 木':''}`;
        const buy=button('购买',()=>options.send({type:'buy-item',itemId:selected.id}),!options.writable()||!state||state.gold<selected.gold||state.lumber<selected.lumber);
        const hint=document.createElement('small');hint.textContent='购买物品送至工人物品栏；满包按既有规则处理。';
        goodsDetail.append(icon,title,source,description,price,buy,hint,pawn);
        showPawn(state, selected.shop);
    }
    search.oninput = showShop;
    function open(name: string) {
        setTouchMode(undefined);
        modal = name;
        backdrop.hidden = false;
        window.setAttribute('aria-label', name);
        shop.hidden = name !== '商店';
        recipe.hidden = name !== '合成';
        codex.hidden = name !== '图鉴';
        for (const section of sections)
            section.classList.toggle('outside-tab', sectionTab.get(section) !== name);
        aside.hidden = name === '图鉴' || name === '合成';
        tabs.querySelectorAll('button').forEach(node => node.classList.toggle('active', node.textContent === name));
        if (name === '对局' || name === '商店') options.refreshManagement();
        if (name === '商店') {
            window.append(get('feedback'));
            showShop();
        } else {
            status.prepend(get('feedback'));
        }
        if (name === '图鉴') {
            codex.replaceChildren();
            for (const entry of towerLevels.values()) {
                const row = document.createElement('article');
                row.textContent = `${entry.name} · ${entry.id ?? ''}`;
                if (entry.bindings.length) {
                    const skills = document.createElement('div');
                    skills.className = 'original-icon-list';
                    for (const binding of entry.bindings) {
                        const skill = document.createElement('span');
                        skill.textContent = binding.name;
                        prependOriginalIcon(skill, binding.skillId);
                        skills.append(skill);
                    }
                    row.append(skills);
                }
                codex.append(row);
            }
            for (const entry of items.values()) {
                const row = document.createElement('article');
                row.textContent = `${entry.name} · ${entry.id}`;
                prependOriginalIcon(row, entry.id);
                codex.append(row);
            }
        }
        if (name === '合成') {
            recipe.replaceChildren();
            const title = document.createElement('h2');
            title.textContent = '制作书合成';
            const copy = document.createElement('p');
            copy.textContent = '同一背包集齐配方材料，拾取最后一件时自动合成。';
            recipe.append(title, copy);
            for (const [result, materials] of recipes) {
                const row = document.createElement('article');
                row.className = 'recipe-entry';
                const name = document.createElement('h3');
                name.textContent = items.get(result)!.name;
                prependOriginalIcon(name, result);
                const material = document.createElement('p');
                material.className = 'original-icon-list';
                for (const id of materials) {
                    if (material.childNodes.length) material.append(' ＋ ');
                    const entry = document.createElement('span');
                    entry.textContent = items.get(id)?.name ?? id;
                    prependOriginalIcon(entry, id);
                    material.append(entry);
                }
                row.append(name, material);
                recipe.append(row);
            }
            // The original worker inventory includes the authoritative use-book transactions.
            recipe.append(button('打开工人物品与制作书', () => { select(-1); open('对局'); get('worker-items').scrollIntoView({ block: 'center' }); }));
        }
        content.scrollTop = 0;
        (tabs.querySelector('.active') as HTMLButtonElement)?.focus();
    }
    function close() {
        modal = '';
        backdrop.hidden = true;
        status.prepend(get('feedback'));
        canvas.focus();
    }
    backdrop.onclick = event => { if (event.target === backdrop)
        close(); };
    canvas.tabIndex = 0;
    const unit = (id = current) => [...(options.match()?.structures ?? []), ...(options.match()?.summons ?? [])].find(tower => tower.id === id);
    function select(id: number, additive = false) {
        setTouchMode(undefined);
        if (carrying !== undefined) {
            options.send({ type: 'transfer-item', itemId: carrying, towerId: id === -1 ? undefined : id });
            carrying = undefined;
            return;
        }
        enemyId = undefined;
        if (additive) {
            selection = selection.includes(id) ? selection.filter(entry => entry !== id) : [...selection, id];
            current = selection.includes(id) ? id : selection[0] ?? -2;
        }
        else {
            selection = [id];
            current = id;
        }
        learning = false;
        lastRender = '';
    }
    function cancel() {
        if (modal) {
            close();
            return;
        }
        if (touchMode) {
            setTouchMode(undefined);
            return;
        }
        if (target || carrying !== undefined || options.placing()) {
            target = undefined;
            carrying = undefined;
            options.cancel();
            announce('已取消操作');
            return;
        }
        if (learning) {
            learning = false;
            lastRender = '';
            return;
        }
        selection = [];
        current = -2;
        enemyId = undefined;
        lastRender = '';
    }
    function aim(value: Target) { target = value; options.cancel(); announce(''); }
    function useItem(slot: number) {
        const state = options.match();
        const item = state?.inventory?.find(item => item.slot === slot && item.towerId === (current === -1 ? undefined : current));
        const book = current === -1 ? state?.books?.find(book=>book.slot===slot) : undefined;
        if(book){aim({kind:'ally',label:prayerBooks.find(entry=>entry.id===book.bookId)!.name,action:(_point,id)=>({type:'use-book',itemId:book.id,towerId:id!})});return;}
        if (!item) return;
        if (current === -1) {
            if (item.itemId === 'i256')
                aim({ kind: 'enemy', label: '点金', action: (_point, id) => ({ type: 'use-item', itemId: item.id, targetId: id }) });
            else if (isPointTargetedTowerEquipment(item.itemId))
                announce('需要交接给可施法的塔');
            else
                options.send({ type: 'use-item', itemId: item.id });
            return;
        }
        if (isTargetedEquipment(item.itemId))
            aim({ kind: 'enemy', label: items.get(item.itemId)!.name, action: (_point, id) => ({ type: 'cast-equipment', itemId: item.id, towerId: current, targetId: id }) });
        else if (isPointTargetedTowerEquipment(item.itemId) || item.itemId === 'i235')
            aim({ kind: 'point', label: items.get(item.itemId)!.name, action: point => item.itemId === 'i235' ? ({ type: 'place-scout-ward', itemId: item.id, towerId: current, point }) : ({ type: 'cast-equipment', itemId: item.id, towerId: current, point }) });
        else if (isActiveTowerEquipment(item.itemId))
            options.send({ type: 'cast-equipment', itemId: item.id, towerId: current });
        else
            announce('被动装备');
    }
    function renderDock(state: Match) {
        const tower = unit();
        const enemy = state.enemies.find(enemy => enemy.id === enemyId);
        const equipped = state.inventory?.filter(item => item.slot !== null && item.towerId === (current === -1 ? undefined : current));
        const signature = JSON.stringify([state.matchId, selection, current, enemyId, learning, tower?.hero,
            tower?.templateId, tower?.autoModes, tower?.flameArrows, tower?.morphShift?.attribute, equipped,
            current === -1 ? [state.cards, state.books, state.gold, state.lumber] : null,
            options.writable(), enemy && Math.ceil(enemy.hp), tower?.life && Math.ceil(tower.life.hp), Math.floor(state.queue.nowUs / 1000000)]);
        if (signature === lastRender)
            return;
        lastRender = signature;
        const strip = dock.querySelector('.selection-strip')!;
        strip.replaceChildren();
        for (const id of selection) {
            const entry = unit(id);
            const node = button(id === -1 ? '工人' : towerLevels.get(entry?.templateId ?? '')?.name ?? '灵兽', () => select(id));
            node.classList.toggle('active', id === current);
            node.ondblclick = () => options.scene()?.focusAt(id === -1 ? state.worker : entry!);
            strip.append(node);
        }
        const info = dock.querySelector('.unit-info')!;
        info.replaceChildren();
        const portrait = document.createElement('div');
        portrait.className = 'unit-portrait';
        painted(portrait, current === -1 ? 'nsha' : tower?.templateId ?? '');
        const detail = document.createElement('div');
        const title = document.createElement('h2');
        title.textContent = enemy ? `${enemy.unitId} #${enemy.id}` : current === -1 ? '工人' : tower ? towerLevels.get(tower.templateId)?.name ?? (tower.bear ? '熊灵' : tower.templateId) : '未选择单位';
        detail.append(title);
        const stats = document.createElement('p');
        if (enemy)
            stats.textContent = `生命 ${Math.ceil(enemy.hp)} · 速度 ${enemy.speed}`;
        else if (tower) {
            const gear = state.inventory?.filter(item => item.towerId === tower.id).map(item => item.itemId) ?? [];
            const attributes = tower.hero ? effectiveAttributes(tower.hero, gear) : undefined;
            stats.textContent = `${tower.hero ? `等级 ${tower.hero.level} · 经验 ${tower.hero.xp} · 技能点 ${tower.hero.points}\n` : ''}${attributes ? `力量 ${Math.floor(attributes.STR)}　敏捷 ${Math.floor(attributes.AGI)}　智力 ${Math.floor(attributes.INT)}\n` : ''}射程 ${weapons[tower.templateId]?.[0]?.max ?? 0}${tower.life ? ` · 生命 ${Math.ceil(tower.life.hp)}/${Math.ceil(tower.life.maximum)}` : ''}`;
        }
        else if (current === -1)
            stats.textContent = '自动前往建造与交接';
        if (tower?.mana !== undefined)
            stats.textContent += `\n魔法 ${Math.floor(tower.mana)}/${Math.floor(tower.manaMaximum ?? tower.mana)}`;
        const details = button('详情', () => open('对局'));
        setCommandIcon(details, 'info', '详情');
        detail.append(stats, details);
        info.append(portrait, detail);
        const inventory = dock.querySelector('.six-slots')!;
        inventory.replaceChildren();
        for (let slot = 0; slot < 6; slot++) {
            const item = state.inventory?.find(item => item.slot === slot && item.towerId === (current === -1 ? undefined : current));
            const card = current === -1 ? state.cards.find(card => card.slot === slot) : undefined;
            const book = current === -1 ? state.books?.find(book=>book.slot===slot) : undefined;
            const name = book ? prayerBooks.find(entry=>entry.id===book.bookId)!.name : item ? (eventBoxes.get(item.itemId) ?? items.get(item.itemId))!.name : card ? cardTemplates.get(card.card)!.name : '';
            const node = button(name, () => card ? (() => { const nodes = [...get('cards').querySelectorAll('button')]; nodes.find(node => node.textContent === `${cardTemplates.get(card.card)!.name} · ${cardTemplates.get(card.card)!.rarity}`)?.click(); })() : useItem(slot), !options.writable() || !!enemy || current === -2);
            node.classList.toggle('touch-secondary', !!item);
            node.title = name + (item ? '\n左键使用；右键交接；Alt＋右键切换主动装备自动模式' : '');
            const iconId = book?.bookId ?? item?.itemId ?? card?.card;
            if (iconId) painted(node, iconId);
            if (item) {
                node.classList.toggle('auto', tower?.autoModes?.[item.itemId] !== false && isActiveTowerEquipment(item.itemId));
            }
            const key = document.createElement('kbd');
            key.textContent = '⌥' + itemKeys[slot].toUpperCase();
            node.append(key);
            if (item) {
                const transfer = () => {
                    setTouchMode(undefined);
                    options.cancel();
                    target = undefined;
                    carrying = item.id;
                    announce('');
                };
                const toggleAuto = tower && (isActiveTowerEquipment(item.itemId) || item.itemId === 'i276' || item.itemId === 'i281' || item.itemId === 'i325')
                    ? () => options.send({ type: 'set-auto-mode', towerId: tower.id, key: item.itemId, enabled: tower.autoModes?.[item.itemId] === false })
                    : undefined;
                node.oncontextmenu = event => {
                    event.preventDefault();
                    if (event.altKey && toggleAuto) toggleAuto();
                    else transfer();
                };
                node.addEventListener('click', event => {
                    if (touchMode !== 'more') return;
                    event.stopImmediatePropagation();
                    touchChoices.replaceChildren(button('交接' + name, transfer));
                    if (toggleAuto) touchChoices.append(button('切换自动使用', () => {
                        setTouchMode(undefined);
                        toggleAuto();
                    }));
                }, true);
            }
            inventory.append(node);
        }
        const grid = dock.querySelector('.twelve-slots')!;
        grid.replaceChildren();
        commands = [];
        const add = (label: string, action: () => void, disabled = false, id?: string, toggle?: () => void) => {
            const index = commands.length;
            commands.push(action);
            const node = button(label, action, disabled || !options.writable());
            const key = document.createElement('kbd');
            key.textContent = keys[index].toUpperCase();
            node.append(key);
            if (id) {
                painted(node, id, learning);
                node.dataset.skill = id;
                node.classList.toggle('auto', !learning && !!toggle && tower?.autoModes?.[id] !== false);
            }
            if (toggle) node.oncontextmenu = event => { event.preventDefault(); toggle(); };
            if (toggle && !learning) {
                node.classList.add('touch-secondary');
                node.addEventListener('click', event => {
                    if (touchMode !== 'more') return;
                    event.stopImmediatePropagation();
                    setTouchMode(undefined);
                    toggle();
                }, true);
            }
            grid.append(node);
            return node;
        };
        if (tower) {
            for (const skill of learnableSkills(tower.templateId).slice(0, 3)) {
                const rank = tower.hero?.ranks[skill.skillId] ?? 0;
                const required = tower.hero && learningLevel(tower.hero, tower.templateId, skill.skillId);
                const orb = rank && skill.skillId === 'A083' ? attackOrb(tower) : undefined;
                const spellId = activeHeroSkill(tower, skill.skillId);
                const castable = isCastableHeroSkill(spellId);
                const node = add(`${skill.name} ${rank}`, () => {
                    if (learning) {
                        options.send({ type: 'learn-skill', towerId: tower.id, skillId: skill.skillId });
                        learning = false;
                        lastRender = '';
                        return;
                    }
                    if (orb) {
                        aim({ kind: 'enemy', label: orb.name,
                            action: (_point, targetId) => ({ type: 'cast-flame-arrow', towerId: tower.id, targetId: targetId! }) });
                        return;
                    }
                    if (castable) {
                        const mode = heroSpellTargetMode(spellId);
                        if (mode === 'self')
                            options.send({ type: 'cast-hero', towerId: tower.id, skillId: spellId });
                        else
                            aim({ kind: mode === 'unit' ? 'enemy' : mode === 'ally' ? 'ally' : 'point', label: skill.name,
                                action: (point, id) => ({ type: 'cast-hero', towerId: tower.id, skillId: spellId,
                                    ...(mode === 'point' ? { point } : { targetId: id }) }) });
                    }
                }, learning ? !tower.hero || !tower.hero.points || required === undefined || tower.hero.level < required : !rank || !castable && !orb, learning ? skill.skillId : spellId, orb ?
                    () => options.send({ type: 'toggle-flame-arrows', towerId: tower.id }) :
                    castable ? () => options.send({ type: 'set-auto-mode', towerId: tower.id, key: skill.skillId,
                        enabled: skill.skillId === 'A091' ? tower.autoModes?.A091 !== true : tower.autoModes?.[skill.skillId] === false }) : undefined);
                if (orb) node.classList.toggle('auto', !learning && (tower.flameArrows ?? orb.defaultAuto));
                if (skill.skillId === 'A091') node.classList.toggle('auto', !learning && tower.autoModes?.A091 === true);
                node.title = `${skill.name} · ${castable || orb ? '主动' : '被动'} · 等级 ${rank}${required !== undefined ? `\n下一级需要英雄 ${required} 级` : ''}`;
                const ready = tower.heroSpellReady?.[skill.skillId as keyof typeof heroSpells] ?? tower.towerSpellReady?.[skill.skillId] ?? ((skill.skillId === 'A068' || skill.skillId === 'A149') ? tower.treeGrab?.readyUs : 0) ?? 0;
                if (!learning && ready > state.queue.nowUs) {
                    const timer = document.createElement('span');
                    timer.className = 'skill-cooldown';
                    timer.textContent = String(Math.ceil((ready - state.queue.nowUs) / 1000000));
                    node.append(timer);
                }
                if (learning && skill.skillId === 'A067')
                    node.title += `\n名义伤害 ${[0, 150, 275, 420, 650, 860, 1120][rank]} → ${[0, 150, 275, 420, 650, 860, 1120][Math.min(6, rank + 1)]}`;
                if (learning && skill.skillId === 'A069')
                    node.title += `\n累计攻击加成 ${rank * 90} → ${(rank + 1) * 90}`;
                const profile = heroSpells[skill.skillId as keyof typeof heroSpells];
                if (learning && skill.skillId === 'A238') {
                    const fixedDamage = (level: number) => level === 0 ? 0 : 1000 + 500 * level;
                    node.title += `\n固定伤害 ${fixedDamage(rank)} → ${fixedDamage(Math.min(rank + 1, 6))}，另计生命比例和击杀层数伤害`;
                } else if (learning && profile)
                    node.title += `\n伤害 ${profile.damage[Math.min(Math.max(0, rank - 1), profile.damage.length - 1)]} → ${profile.damage[Math.min(rank, profile.damage.length - 1)]}`;
            }
            if (!learning) for (const { id, rank, name } of doomAbilities(tower)) {
                const castable = isCastableHeroSkill(id);
                const auto = castable && heroAutoCastOrder.includes(id as keyof typeof heroSpells);
                const node = add(`${name} ${rank}`, () => {
                    if (!castable) return;
                    const mode = heroSpellTargetMode(id);
                    const action = { type: 'cast-hero' as const, towerId: tower.id, skillId: id };
                    if (mode === 'self') options.send(action);
                    else aim({ kind: mode === 'unit' ? 'enemy' : mode === 'ally' ? 'ally' : 'point', label: name,
                        action: (point, targetId) => ({ ...action, ...(mode === 'point' ? { point } : { targetId }) }) });
                }, !castable, id, auto ? () => options.send({ type: 'set-auto-mode', towerId: tower.id, key: id,
                    enabled: tower.autoModes?.[id] === false }) : undefined);
                const ready = tower.heroSpellReady?.[id as keyof typeof heroSpells] ?? 0;
                if (ready > state.queue.nowUs) {
                    const timer = document.createElement('span');
                    timer.className = 'skill-cooldown';
                    timer.textContent = String(Math.ceil((ready - state.queue.nowUs) / 1000000));
                    node.append(timer);
                }
            }
            if (tower.hero?.ranks.A106) {
                const cloud = add('雷云', () => aim({ kind: 'point', label: '雷云', action: point =>
                    ({ type: 'cast-hero', towerId: tower.id, skillId: 'A106', point }) }), learning, 'A106',
                    () => options.send({ type: 'set-auto-mode', towerId: tower.id, key: 'A106', enabled: tower.autoModes?.A106 === false }));
                const ready = tower.heroSpellReady?.A106 ?? 0;
                if (!learning && ready > state.queue.nowUs) {
                    const timer = document.createElement('span');
                    timer.className = 'skill-cooldown';
                    timer.textContent = String(Math.ceil((ready - state.queue.nowUs) / 1000000));
                    cloud.append(timer);
                }
            }
            if (!learning && tower.hero?.ranks.A225) {
                for (const [attribute, label] of [['AGI', '敏捷'], ['STR', '力量']] as const) {
                    const active = tower.morphShift?.attribute === attribute;
                    add(active ? '停止转' + label : '转为' + label, () => options.send({ type: 'toggle-morph', towerId: tower.id, attribute }),
                        false, attribute === 'AGI' ? active ? 'A227' : 'A226' : active ? 'A229' : 'A228');
                }
            }
            for (const ability of bearAbilities(tower)) {
                add(ability.name, () => options.send({ type: 'cast-tower', towerId: tower.id, skillId: ability.id }),
                    false, ability.id, ability.mana > 0 ? () => options.send({ type: 'set-auto-mode', towerId: tower.id,
                        key: ability.id, enabled: tower.autoModes?.[ability.id] === false }) : undefined);
            }
            if (!tower.hero)
                for (const spell of (towerSpells.get(tower.templateId) ?? []).slice(0, 3)) {
                    const name = towerLevels.get(tower.templateId)?.bindings.find(binding => binding.skillId === spell.id)?.name ?? spell.id;
                    const cast = { type: 'cast-tower' as const, towerId: tower.id, skillId: spell.id };
                    add(name, () => {
                        if (pointTowerSpell(spell.id)) aim({ kind: 'point', label: name, action: point => ({ ...cast, point }) });
                        else if (spell.effect.kind === 'bloodlust') aim({ kind: 'ally', label: name, action: (_point, targetId) => ({ ...cast, targetId }) });
                        else if (spell.effect.kind === 'purge' || spell.effect.kind === 'slow' || spell.effect.kind === 'boulder')
                            aim({ kind: 'enemy', label: name, action: (_point, targetId) => ({ ...cast, targetId }) });
                        else options.send(cast);
                    }, false, spell.id, () => options.send({ type: 'set-auto-mode', towerId: tower.id, key: spell.id, enabled: tower.autoModes?.[spell.id] === false }));
                }
            while (commands.length < 3)
                add('', () => { }, true);
            const learn = add(learning ? '返回' : '学习技能', () => { learning = !learning; lastRender = ''; }, !tower.hero);
            if (learning) setCommandIcon(learn, 'back', '退出技能学习');
            if (learning) {
                for (const skill of learnableSkills(tower.templateId).slice(3, 6)) {
                    const required = tower.hero && learningLevel(tower.hero, tower.templateId, skill.skillId);
                    add(skill.name, () => { options.send({ type: 'learn-skill', towerId: tower.id, skillId: skill.skillId }); learning = false; lastRender = ''; },
                        !tower.hero?.points || required === undefined || tower.hero.level < required, skill.skillId);
                }
            }
            setCommandIcon(add('攻击', () => aim({ kind: 'enemy', label: '集火', action: (_point, id) => ({ type: 'focus-target', towerId: tower.id, targetId: id }) })), 'attack', '攻击／集火');
            const stop = add('停止', () => {
                options.send(tower.summon?.independent ? { type: 'stop-wolf', unitId: tower.id } : { type: 'focus-target', towerId: tower.id });
                options.send({ type: 'stop-tower-cast', towerId: tower.id });
            });
            setCommandIcon(stop, 'stop', '停止');
            add('升级', () => options.send({ type: 'upgrade-tower', towerId: tower.id }), !towerLevels.get(tower.templateId)?.upgrade);
            add('回收', () => {
                const equipped = state.inventory?.filter(item => item.towerId === tower.id) ?? [];
                if ((tower.hero || equipped.length) && !confirm(`回收${title.textContent}？返还 ${Math.floor((towerLevels.get(tower.templateId)?.fields.points?.value ?? 0) * recycleRate)} 金；普通装备留地，开局包、箱钥匙及魔焰等特殊物品按规则销毁。当前携带 ${equipped.length} 件。`))
                    return;
                options.send({ type: tower.pending ? 'cancel-construction' : 'recycle-tower', towerId: tower.id });
            });
        }
        else if (current === -1) {
            const build = add('建造', () => { open('对局'); get('builds').scrollIntoView({ block: 'center' }); });
            setCommandIcon(build, 'build');
            add('塔卡', () => { open('对局'); get('cards').scrollIntoView({ block: 'center' }); });
            add('抽卡', () => { open('对局'); get('draws').scrollIntoView({ block: 'center' }); });
            add('天赋', () => { open('对局'); get('talents').scrollIntoView({ block: 'center' }); });
            const move = add('移动', () => aim({ kind: 'point', label: '移动工人', action: point => ({ type: 'move-worker', point }) }));
            setCommandIcon(move, 'move', '移动工人');
            setCommandIcon(add('停止', () => options.send({ type: 'stop-worker' })), 'stop', '停止');
        }
        while (grid.children.length < 12) {
            const empty = document.createElement('div');
            empty.className = 'empty-command';
            grid.append(empty);
        }
        orderButton.disabled = !selection.length || !options.writable();
        moreButton.disabled = !dock.querySelector('.touch-secondary:not(:disabled)');
        shortcuts.replaceChildren();
        for (const id of [-1, ...state.structures.filter(tower => tower.hero).map(tower => tower.id)]) {
            const entry = unit(id);
            const node = button(id === -1 ? '工人' : towerLevels.get(entry!.templateId)!.name, () => select(id));
            painted(node, id === -1 ? 'nsha' : entry!.templateId);
            node.ondblclick = () => options.scene()?.focusAt(id === -1 ? state.worker : entry!);
            shortcuts.append(node);
        }
    }
    function objects(state: Match) {
        return [{ id: -1, kind: 'ally', point: state.worker }, ...state.structures.map(tower => ({ id: tower.id, kind: 'ally', point: tower })), ...(state.summons ?? []).filter(unit => unit.summon?.independent || unit.bear).map(unit => ({ id: unit.id, kind: 'ally', point: unit })), ...state.enemies.filter(enemy => canSeeEnemy(state, enemy)).map(enemy => ({ id: enemy.id, kind: 'enemy', point: enemy })), ...(state.inventory ?? []).filter(item => item.slot === null).map(item => ({ id: item.id, kind: 'item', point: item.point })), ...state.cards.filter(card => card.slot === null).map(card => ({ id: card.id, kind: 'card', point: card.point }))];
    }
    const local = (event: MouseEvent) => { const box = canvas.getBoundingClientRect(); return { x: event.clientX - box.left, y: event.clientY - box.top }; };
    function pick(event: MouseEvent) {
        const state = options.match(), scene = options.scene();
        if (!state || !scene)
            return;
        const point = local(event);
        return objects(state).map(object => ({ ...object, screen: scene.screenAt(object.point) })).filter(object => Math.hypot(object.screen.x - point.x, object.screen.y - point.y) < 30).sort((a, b) => Math.hypot(a.screen.x - point.x, a.screen.y - point.y) - Math.hypot(b.screen.x - point.x, b.screen.y - point.y))[0];
    }
    canvas.addEventListener('click', event => {
        if (suppressClick) {
            suppressClick = false;
            event.stopImmediatePropagation();
            return;
        }
        if (modal)
            return;
        const hit = pick(event);
        const point = options.scene()?.pointAt(event);
        if (!point)
            return;
        if (touchMode === 'order') {
            event.stopImmediatePropagation();
            setTouchMode(undefined);
            issueOrder(hit, point);
            return;
        }
        if (touchMode === 'more' || (carrying !== undefined && hit?.kind !== 'ally')) return;
        if (target) {
            event.stopImmediatePropagation();
            if ((target.kind === 'enemy' && hit?.kind !== 'enemy') || (target.kind === 'ally' && (hit?.kind !== 'ally' || hit.id===-1))) {
                announce(target.kind === 'ally' ? '请选择友方目标' : '请选择敌方目标');
                return;
            }
            target.command = options.send(target.action(point, hit?.id));
            return;
        }
        if (options.placing())
            return;
        if (hit?.kind === 'ally')
            select(hit.id, event.shiftKey);
        else if (hit?.kind === 'enemy') {
            enemyId = hit.id;
            selection = [];
            current = -2;
            lastRender = '';
        }
    }, true);
    canvas.addEventListener('contextmenu', event => {
        event.preventDefault();
        if (modal || ('pointerType' in event && event.pointerType === 'touch'))
            return;
        if (target || carrying !== undefined || options.placing()) {
            cancel();
            return;
        }
        const hit = pick(event);
        const point = options.scene()?.pointAt(event);
        if (point) issueOrder(hit, point);
    });
    function issueOrder(hit: ReturnType<typeof pick>, point: Point) {
        for (const id of selection) {
            const tower = unit(id);
            if (hit?.kind === 'enemy') {
                if (tower)
                    options.send(tower.summon?.independent ? { type: 'attack-with-wolf', unitId: id, targetId: hit.id } : { type: 'focus-target', towerId: id, targetId: hit.id });
            }
            else if (id === -1)
                options.send(hit?.kind === 'item' ? { type: 'pick-up-item', itemId: hit.id } : hit?.kind === 'card' ? { type: 'pick-up-card', cardId: hit.id } : { type: 'move-worker', point });
            else if (tower?.summon?.independent)
                options.send({ type: 'move-wolf', unitId: id, point });
        }
    }
    const box = document.createElement('div');
    box.className = 'selection-box';
    box.hidden = true;
    overlay.append(box);
    canvas.addEventListener('pointerdown', event => { if (event.pointerType !== 'touch' && event.button === 0 && !target && !options.placing() && !modal)
        dragStart = local(event); });
    canvas.addEventListener('pointermove', event => { if (!dragStart)
        return; const end = local(event); if (Math.hypot(end.x - dragStart.x, end.y - dragStart.y) < 8)
        return; box.hidden = false; Object.assign(box.style, { left: Math.min(end.x, dragStart.x) + 'px', top: Math.min(end.y, dragStart.y) + 'px', width: Math.abs(end.x - dragStart.x) + 'px', height: Math.abs(end.y - dragStart.y) + 'px' }); });
    globalThis.addEventListener('pointerup', event => {
        if (dragStart && !box.hidden) {
            const end = local(event);
            const state = options.match(), scene = options.scene();
            if (state && scene) {
                const ids = objects(state).filter(object => object.kind === 'ally').filter(object => { const p = scene.screenAt(object.point); return p.x >= Math.min(end.x, dragStart!.x) && p.x <= Math.max(end.x, dragStart!.x) && p.y >= Math.min(end.y, dragStart!.y) && p.y <= Math.max(end.y, dragStart!.y); }).map(object => object.id);
                selection = event.shiftKey ? [...new Set([...selection, ...ids])] : ids;
                current = selection[0] ?? -2;
                enemyId = undefined;
                lastRender = '';
            }
            suppressClick = true;
        }
        dragStart = undefined;
        box.hidden = true;
    });
    globalThis.addEventListener('keydown', event => {
        const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopImmediatePropagation();
            cancel();
            return;
        }
        if (typing)
            return;
        if (event.code === 'Space') {
            event.preventDefault();
            get('pause').click();
            return;
        }
        if (modal)
            return;
        if (event.key === 'Tab') {
            event.preventDefault();
            if (selection.length) {
                current = selection[(selection.indexOf(current) + 1) % selection.length];
                lastRender = '';
            }
            return;
        }
        if (/^[0-9]$/.test(event.key)) {
            event.preventDefault();
            if (event.ctrlKey)
                groups.set(event.key, [...selection]);
            else {
                selection = [...(groups.get(event.key) ?? [])];
                current = selection[0] ?? -2;
                enemyId = undefined;
                lastRender = '';
                if (lastGroup.key === event.key && performance.now() - lastGroup.at < 350) {
                    const entry = current === -1 ? options.match()?.worker : unit();
                    if (entry)
                        options.scene()?.focusAt(entry);
                }
                lastGroup = { key: event.key, at: performance.now() };
            }
            return;
        }
        const key = event.key.toLowerCase();
        if (event.altKey) {
            const index = itemKeys.indexOf(key);
            if (index >= 0) {
                event.preventDefault();
                useItem(index);
            }
            return;
        }
        const index = keys.indexOf(key);
        if (index >= 0) {
            event.preventDefault();
            (dock.querySelector('.twelve-slots')!.children[index] as HTMLButtonElement)?.click();
        }
    }, true);
    // Choosing build cards in the management window returns to the battlefield.
    for (const id of ['builds', 'cards', 'structures'])
        get(id).addEventListener('click', () => { if (options.placing())
            close(); });
    return {
        managementVisible: () => modal === '对局' || modal === '商店',
        update(state: Match | undefined) {
            if (!state)
                return;
            if (matchId !== state.matchId) {
                matchId = state.matchId;
                selection = [-1];
                current = -1;
                enemyId = undefined;
                target = undefined;
                carrying = undefined;
                setTouchMode(undefined);
                groups.clear();
                openingShown = false;
                lastRender = '';
                damageTimestamp = -1;
                damageAtTimestamp = 0;
                usesDamageEvents = false;
                for (const entry of floating) entry.node.remove();
                floating.length = 0;
            }
            selection = selection.filter(id => id === -1 || unit(id));
            if (current !== -1 && !unit() && enemyId === undefined) {
                current = selection[0] ?? -2;
                lastRender = '';
            }
            if (target?.command && state.commandResults[target.command]) {
                if (state.commandResults[target.command].ok)
                    target = undefined;
                else {
                    announce('目标无效或技能未就绪，请重新选择');
                    target.command = undefined;
                }
            }
            if (!openingShown && canChooseOpening(state)) {
                openingShown = true;
                open('对局');
                get('opening').scrollIntoView({ block: 'center' });
            }
            if (modal === '商店') showPawn(state, ordinaryGoods.get(selectedGood)!.shop);
            const prompt = target ? target.label + ' · 选择目标' : carrying !== undefined ? '选择接收物品的单位' :
                touchMode === 'order' ? '点按地面、掉落物或敌人下令' :
                touchMode === 'more' ? '点按高亮技能或切换物品栏' : learning ? '选择要学习的技能' : '';
            if (touchPrompt.textContent !== prompt) touchPrompt.textContent = prompt;
            touchActions.hidden = !prompt;
            renderDock(state);
            const scene = options.scene();
            if (!scene)
                return;
            const live = new Set<string>();
            function refreshMarker(key: string, point: Point, ratio: number, enemy: boolean, selected: boolean, title: string) {
                live.add(key);
                let node = markers.get(key);
                if (!node) {
                    node = document.createElement('div');
                    node.className = 'unit-marker';
                    overlay.append(node);
                    markers.set(key, node);
                }
                const p = scene!.screenAt(point);
                node.style.left = p.x + 'px';
                node.style.top = p.y + 'px';
                node.classList.toggle('enemy', enemy);
                node.classList.toggle('selected', selected);
                node.style.setProperty('--hp', String(Math.max(0, ratio) * 100) + '%');
                if (node.title !== title) node.title = title;
            }
            refreshMarker('ally-1', state.worker, 1, false, selection.includes(-1), '工人');
            for (const tower of [...state.structures, ...(state.summons ?? []).filter(unit => unit.summon?.independent || unit.bear)]) {
                refreshMarker('ally' + tower.id, tower, tower.life ? tower.life.hp / tower.life.maximum : 1, false,
                    selection.includes(tower.id), towerLevels.get(tower.templateId)?.name ?? (tower.bear ? '熊灵' : '灵兽'));
            }
            for (const enemy of state.enemies) {
                if (canSeeEnemy(state, enemy)) refreshMarker('enemy' + enemy.id, enemy, enemy.hp / (enemy.maxHp ?? enemy.hp),
                    true, false, '工人');
            }
            for (const [key, node] of markers)
                if (!live.has(key)) {
                    node.remove();
                    markers.delete(key);
                }
            if (!usesDamageEvents && state.damageEvents) {
                usesDamageEvents = true;
                damageTimestamp = -1;
                damageAtTimestamp = 0;
            }
            let previousTimestamp = -1;
            let occurrence = 0;
            for (const hit of state.damageEvents ?? state.recentHits ?? []) {
                if (hit.atUs !== previousTimestamp) {
                    previousTimestamp = hit.atUs;
                    occurrence = 0;
                }
                occurrence++;
                // Worker views clone the history. Its order within one game
                // timestamp distinguishes even identical damage packets.
                if (hit.atUs < damageTimestamp || (hit.atUs === damageTimestamp && occurrence <= damageAtTimestamp))
                    continue;
                damageTimestamp = hit.atUs;
                damageAtTimestamp = occurrence;
                if (state.queue.nowUs - hit.atUs > 1000000)
                    continue;
                const node = document.createElement('span');
                node.className = 'live-damage';
                node.textContent = String(Math.round(hit.amount));
                const lane = floating.filter(entry => Math.hypot(entry.point.x - hit.x, entry.point.y - hit.y) < 100).length;
                overlay.append(node);
                floating.push({ node, point: hit, start: performance.now(), lane });
            }
            const now = performance.now();
            for (let i = floating.length - 1; i >= 0; i--) {
                const entry = floating[i];
                const age = now - entry.start;
                if (age > 1000) {
                    entry.node.remove();
                    floating.splice(i, 1);
                    continue;
                }
                const p = scene.screenAt(entry.point);
                entry.node.style.left = p.x + 'px';
                entry.node.style.top = (p.y - 15 - entry.lane * 23 - age * .05) + 'px';
                entry.node.style.opacity = String(Math.min(1, (1000 - age) / 250));
            }
        }
    };
}
