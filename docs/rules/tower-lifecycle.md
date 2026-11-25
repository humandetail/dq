# 普通建造、升级、回收与死亡

本页闭合实际工人建塔、对象升级、已成型塔回收和玩家英雄的普通死亡路径。价格、人口、事件和源码调用按机器表对照。卡片施工、物品事件、变强资格和英雄经验沿已有规则。[机器表](tower-lifecycle.json) · [卡片施工](summon-and-delivery.md) · [资格](qualification-lifecycle.md) · [物品事件](item-lifecycle.md) · [英雄经验](hero-progression.md)

## 工人直接建造

- 初始 w001 和 g002–g018 十七种实际工人外观允许 n001 箭塔、n021 献祭塔、n006 霜冻之塔。w001/g012 使用 w3u 的 ubui，其他从实际单位的 Builds 导入。三塔各100金币、0木材、5人口、1战斗秒。木材字段保留源缺省，本地取0。卡片使用沿 S01–S04。[工人 Builds](../../reference/map-6.25/units_campaignunitstrings.txt#L4399) · [初始工人](economy-and-progression.md) · [塔价](economy-data.json)
- 只有实际拥有列表的存活己方建造者可发建造。预览只显示当前数据。Q24 复用放置格、实际占位接口和100距离的接近约定。进入距离前可继续接近；提交时复验工人、目标位置、当前权限、资源和人口。通过后原子扣当次费用、保留该实体的人口，落实占位及1秒完成令牌。建成前沿 S03 限制普通战斗和使用动作，工人提交后无需驻留。死亡或移除使本次令牌失效，释放实际占用。[放置和寻路](pathing-and-placement.md) · [B05](web-baseline.md)
- 有资格的主动取消使完成令牌失效，释放实体和人口，并按 ConstructionRefundRate=1.0 返本次实际金／木；卡片返还是独立入口。占位或提交失败尚未扣费时只报告失败。伤害、敌方破坏或显式 RemoveUnit 不触发主动退款。完成后走回收。取消、死亡、完成同时发生由 B05 定序，每笔已记金额及人口按令牌结算一次。[地图退款参数](../../reference/map-6.25/war3mapMisc.txt#L12) · [标准建造流程](https://classic.battle.net/war3/basics/buildings.shtml)

## 建筑升级

- 导入实际升级关系，w3u uupt 覆盖同名 Profile；分支有多项时要求目标属于当前实体的实际列表。已建成己方实体、当前科技和空间许可、目标档费用与人口均在提交时验证。106条图鉴对象边都有目标金币、1秒时长和人口字段。正人口差为 n207→n208 加10，n217→H018 与 n227→H010 各加15，其他103条不变。所核木材字段缺省，本范围取0。箭塔 n001→n002 付320，n002→n003 付620，对象后档点数420和1040恰与累计费用相同，每次只收目标阶段费用。[价格与边](economy-data.json) · [标准升级累积成本](https://classic.battle.net/war3/basics/buildings.shtml)
- 采用同实体升级。提交扣费、保留原人口并预约正差。升级时保留旧模板及已挂载资源，限制主动攻击、施法和回收，取消未提交前摇，已经发出的武器按共享规则继续。完工重新检查目标占位及实体，换有效模板与派生输入，将旧人口与预约结转为目标占用，再发布 UPGRADE_FINISH。保持位置、同一 ID 和实际背包。同一逻辑英雄沿既有状态保持接口，普通塔首次进入英雄模板按首次英雄状态初始化。到期前主动取消按 UpgradeRefundRate=1.0 退当次扣费和预约，恢复旧阶段；并发占位导致完工不可用也撤回本次费用和预约并保留旧塔。死亡／显式删除取消令牌并释放旧占用与预约，无主动退款。[升级退款参数](../../reference/map-6.25/war3mapMisc.txt) · [在途攻击](shared-attack-resolution.md) · [模板状态](skin-and-transformation.md)
- Player(0…3) 的 CONSTRUCT_FINISH 与 UPGRADE_FINISH 均注册 f291/f8。它先取实际对象及所有者，再调用 f7 登记 Tower_ALL 和 UserData、处理 T033、移 N032、按原生 HERO 收紧移动、stop、补满魔法、给实际英雄或 n208 分配资格。随后执行 f8 原专用分支，包括 n006–010 开冷箭、n146 配对、玩家英雄计数、H032/H033/H022 的既有进度。源 f7 每次都 AddArrAny，无已登记检查。升级后的真实事件仍登记一次并写新 UserData，旧表引用继续指向同一实体，保留代码读 UserData 与 IsInTable 的区别。存档恢复不追加虚假的完成事件。[注册 L179635](../../reference/map-6.25/main.disasm#L179635) · [完成 L167957](../../reference/map-6.25/main.disasm#L167957) · [资格 L167771](../../reference/map-6.25/main.disasm#L167771)

## 回收

A000 是实际工人的同主非自身定向回收，射程1000、允许无敌。沿通用定向提交复验，Q24 采用该壳缺省的零蓝／零冷却／零额外前摇。公共 EFFECT 将实际目标交回收。N000 是无目标 AHds，未见原生单位挂载；同一 EFFECT 分支虽接受其 ID，传入 nil 不通过 Tower_ALL。N000 的专属文字要求英雄双击，原脚本没有实现计时。Q24 在真实玩家回收界面采用两次不同令牌、同一玩家同一存活英雄、连续不超过500ms真实输入时间的确认。第二次才排一条回收命令进 B05；暂停可确认，模拟运行后才提交；1–4倍速不缩短确认窗口，读档不恢复半次点击。普通塔一次即可。内部收到明确有效目标的原脚本入口照常执行。[原控件](../../reference/map-6.25/units_campaignabilitystrings.txt#L12937) · [A000提示](../../reference/map-6.25/units_campaignabilitystrings.txt#L1) · [EFFECT L170134](../../reference/map-6.25/main.disasm#L170134)

提交复验目标实际现存、已建成、非施工／升级、同主、非工人／能量圈且在 Tower_ALL。以当时对象 points 算 floor(points×.8)。图鉴中缺 points 的30个对象均为一级普通塔，Q24 此退款接口取0并保留源缺省。英雄经验一级独立于建造档，H001 的3125点返2500，二级箭塔420点返336。当前生命和历史实际消费均不参与回收额。[回收判据 L60410](../../reference/map-6.25/main.disasm#L60410) · [返金 L60344](../../reference/map-6.25/main.disasm#L60344)

1. 锁定回收令牌，按源序先返金、播放旧坐标特效，再调 RemoveSomeUnit。H032/E010–015 更新炼金计数，H024/G036 调 A077_time_end，H034 调 A116_time_end，H036/E016 调 A125_time_end，H055 调 A209_End，H061 调 A238_time_end。源码 player 全局只有读取，若无可信上下文，Q24 用回收目标的实际所有者配对玩家建成计数。各技能函数用已有生命周期。[清理 L167402](../../reference/map-6.25/main.disasm#L167402) · [猴王清理](skill-jingu-and-tidebringer.md) · [熊灵](spirit-bear.md)
2. 源先调 RemoveUnit，随后调 DropAllItemUnit。Web 移除时撤活对象、占位／人口和未到达的普通武器弹，无死亡、杀敌结算或复活事件。当前同步回收栈暂存原坐标和槽供后续 DROP；外部无法再次选中目标，重复命令不再返金。原表残留句柄按既有无效对象语义处理。[顺序 L60399](../../reference/map-6.25/main.disasm#L60399) · [武器生死](shared-attack-resolution.md)
3. DropAllItemUnit 跳过幻象，其物品走已有幻象移除规则。其他对象按原槽0→5逐项移出，先撤该件贡献，再发 L01 DROP。出包地点为最后位置，脚本移出适用 L01。原清理表 i547/i548/i549/i550/i546/i330/i004/i545 在各自移出后销毁。其他存活物品保留真实实例。后续槽能观察到前一项同步回调的修改，整个回收完成后释放暂存信息。[六槽 L51785](../../reference/map-6.25/main.disasm#L51785) · [销毁清单 L50175](../../reference/map-6.25/main.disasm#L50175) · [L01](item-lifecycle.md)

## 普通死亡和同步复活

有效死亡先记录实际死者和杀手、停止新动作与未提交攻击，已发武器弹及专用尸体引用继续。anyUnitDEAT 注册玩家0–3和 P11，先执行 W015 的真实杀手入口。随后仅玩家0–3的原生 HERO 且非幻象执行同位置、同一 ID 的免费 ReviveHeroLoc，原第三参 false。Q24 采用全有效生命、魔法 min(100,实际最大魔法)，按复活后的模板与状态裁剪。按原序移除当时 N032，再在仍是原生 HERO 时设 moveType1。同步复活保留背包、等级、实际技能槽及已有可持久状态，未再登记建成、人口或已发攻击。旧生命代作为受击对象时不重新接收旧弹。[死亡注册 L179489](../../reference/map-6.25/main.disasm#L179489) · [复活 L168394](../../reference/map-6.25/main.disasm#L168394) · [标准复活保留项](https://classic.battle.net/war3/basics/heroes.shtml)

复活段没有提前退出。完整死亡事件随后按源运行模式、清怪登记、A123/A230 与实际熊灵等各自清理及击杀归属奖励。Buff、链接、独立时钟及专用复活的清除按各技能。普通非英雄或幻象不走这段复活，最终仍死亡者释放实际占用一次。有效尸体保留必要的查找和在途引用。普通英雄死亡的源路径没有调用 DropAllItemUnit。施工或升级期间死亡用上文的无主动退款入口。[波次死亡](waves-and-modes.md) · [伤害事件](damage-pipeline.md) · [熊灵](spirit-bear.md)

存档保留施工／升级的费用与人口凭据、实际和预约位置、模板和实体 ID、任务令牌及 B05 序号、生命代和在途引用。加载恢复这些值，防止退款、完成、扣费或清理重复执行。运行 python3 tools/audit-tower-lifecycle.py --check 复查18工人对象、3个直接建筑、106升级边和30个缺少 points 的对象。原 VM 覆盖 RemoveUnit 之后的槽序、销毁和五种复活边界。Web 核算直造及人口差升级的完成、退款和死亡边界。
