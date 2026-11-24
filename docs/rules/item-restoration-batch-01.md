# 小净化、灵魂之戒与恢复神符

图鉴实际恢复道具为三件。i326 小净化和 i238 灵魂之戒分别挂 I248、I245。i723 恢复神符确实列在两份图鉴 H243，由拾取脚本处理，`abilList` 缺省。扫描 243 个物品与法术书子项，在专用原生恢复类中只发现 I248 的实际挂载。两件装备的被动百分比回蓝沿上一批。本批核定两个能力别名和三件图鉴道具，范围内无剩余。[机器表](item-restoration-batch-01.json) · [被动回复规则](item-regeneration-batch-01.md)

## 小净化 i326／I248

H219 说明用后 60 秒恢复 300 点魔法。一级 AIrg 对象确认总量 300、普通和英雄时长均 60 秒、蓝耗 1、冷却 1 秒，三充能且消耗后用尽移除。I248 没有 w3a 覆盖。编辑器标记 `irl4/DataD1=1` 表示无需目标，`irl5/DataE1` 才是受击驱散开关。对象 I248 的 E 缺省，而同底层的原版 AIpr 明写 E=1。官方原版净化被攻击或受伤害法术时会中断，明确开关可解释这项区别。Web 采用 I248 缺省为不开启该中断。[I248](../../reference/map-6.25/units_abilitydata.json#L22422) · [术编字段](https://raw.githubusercontent.com/actboy168/YDWE/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/AbilityMetaData.slk#L13045) · [字段名](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt#L6379) · [暴雪原版净化](https://classic.battle.net/war3/basics/heroitemsconsumed.shtml)

L03 提交前要求存活可用的持有者、有魔法池、当前未满、足够支付 1 点蓝、充能大于 0 并且冷却就绪。到提交点复核，失败时不扣资源、充能或冷却。成功使用对自身登记一个 BIrm 定时回复，数学速率每战斗秒 +5，连续累积 60 秒，余数保留并按当时魔法上限裁剪。一份持续期间可以消费下一次充能刷新 60 秒，同槽以新到期替换。固定 +5 接在被动百分比回蓝之后，满魔法时多余回复丢弃。因为仅回复魔法，BIrm 显示与这一份计时器对应，不额外生成 BIrg 或 BIrl 的生命回复。普通攻击或技能造成伤害、无害法术、装备移出和末次清理期间，已提交的药效继续。正面驱散、显式移除、死亡、删除或到期取消。先结算到事件时间再变状态，暂停沿战斗时钟，读档恢复到期和当前资源。I248 在 `IsUseless` 名单，仍按正常物品和施法事件提交。[物品提交](item-lifecycle.md) · [原版满资源禁用说明](https://classic.battle.net/war3/basics/heroitems.shtml) · [基础回复](night-state-and-regeneration.md) · [BIrm 状态](../../reference/map-6.25/units_commonabilitystrings.txt#L1459) · [施法筛选](skill-essence-aura-proc.md)

## 灵魂之戒 i238／I245

H148 说明暂获 250 魔法、7 秒归还、冷却 10 秒。一级 ANcl 是主动入口，原对象冷却 10、蓝耗 1。成功提交付 1 蓝，委派 `i238_Acition(实际施法者)`，取调用时当前与最大魔法，令 `g = min(250, 最大魔法 − 当前魔法)`。把 `g` 加到当前值，存实际单位句柄和该次 `g`，启动 7 秒一次性计时器。到期先销毁计时器，从该单位当时的当前魔法扣 `min(g, 当前魔法)`，再清空三个并行表。上限及生命值不受此业务的写入影响。满蓝而可成功提交时，扣费形成的 1 点空位只暂借 1，7 秒扣回 1。扣除对象仍是原施法者，后续装备移出、驱散或其它奖励不取消归还。每次已提交使用各有自己的计时器，沿 B05 保存次序。无充能字段按 L04 无限基础使用，自动路径由已核 `Unit_Item_Has_Cool_Down → UnitUseItem` 同样提交，继而按正常原脚本分派。[I245 对象](../../reference/map-6.25/units_abilitydata.json#L22351) · [主动与归还](../../reference/map-6.25/main.disasm#L129258) · [自动使用](../../reference/map-6.25/main.disasm#L147905) · [属性与当前资源](hero-attribute-interface.md)

## 恢复神符 i723

`powerup=1` 走 L02 即时拾取。原 `Item_Get` 对当前句柄类型 i723 委派 `i718_723_Action06`。先 `ClearRune` 清生成跟踪，再对 `Player_Index_Arr` 当前参与者调用单位过滤和逐个恢复。每个接收者即时写 `MANA + MAX_MANA/2`，上限裁剪后显示特效，最后公告 4 秒。单位筛选检查原生 HERO；源过滤没有额外检查生命、距离或负责拾取者的阵营，当前玩家名单由波次规则维护。[L02 立即拾取](item-lifecycle.md) · [拾取分派](../../reference/map-6.25/main.disasm#L145495) · [恢复动作](../../reference/map-6.25/main.disasm#L136776) · [玩家名单](waves-and-modes.md)

原谓词对**本次拾取者**直接返回 false，然后对其余单位用 HERO 筛选。H243 和原公告说所有英雄恢复 50%。两名原生英雄当前各 0、上限各 100，让一人拾取，源结果是拾取英雄 0、另一人 50。按 Q64，Web 在原参与玩家枚举中给所有原生 HERO 恢复，包括符合条件的拾取者。非英雄拾取者仍只触发效果，接收者筛选仍要求原生 HERO。两名英雄的示例中，Web 双方各到 50。保留原枚举和结算先后。[原受体筛选](../../reference/map-6.25/main.disasm#L136854)

原主线 `RuneRefresh` 在当次抽样 `1..100<50` 且 `Game_Mode=0` 时排 15 秒一次事件；到期已有跟踪实例则返回。可生成时，横纵座标各独立从当前玩家入口选择，分别加 10、减 220，随后从六种神符均匀选一件。这里沿该共用生成入口，另外五种的奖励独立。[生成入口](../../reference/map-6.25/main.disasm#L181214) · [延迟生成与清跟踪](../../reference/map-6.25/main.disasm#L181260)

## 验证

工具通过索引核两份图鉴与三个对象，执行灵魂之戒入口和到期、恢复神符原选目标及恢复金额。Web 探针覆盖小净化受击、再施用与驱散，并对照 Q64 的英雄和非英雄拾取两路。原版客户端未运行。[复查脚本](../../tools/audit-item-restoration.py)
