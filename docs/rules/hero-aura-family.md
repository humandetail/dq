# 英雄光环与被动标记：10 项完整局部规则

后续补全：A111/A112/A113及实际A142/A143已由[守护精灵三技能](wisp-link-overcharge-relocate.md)闭合本技能范围；本页原算法仍为来源证据，最终A112分档以Q47为准。

本页闭合 A003、A006、A021、A025、A033、A053、A062、A072、N103、N104，共 10 个图鉴 ID、23 行；必要辅助为 T002、T008、I269。两本图鉴的 A–I 原始值、实际提示、SLK 原始缺项、W3A 增量、挂载单位、完整相关函数与入口指令见[机器表](hero-aura-family.json)。数值冲突依用户全局授权以图鉴为准；原脚本的分支、归属、执行顺序和明确异常仍保留。

局部基准 **`hero-aura-family-v1`** 定义六个真正的光环；**`hero-aura-markers-v1`** 定义五个脚本标记、两个属性辅助及两条分裂伤害的原生适配。二者重叠 A003 的“光环供 Buff → 脚本增伤”接口。Q24 部分是查证后的 Web 选择，没有在匹配版本 Warcraft 客户端实测；不推广到其他光环、所有 AUav 或全部幻象。

## 身份、字段与最终参数

下表的行号均为两本图鉴 `塔技能`；F 列是技能 ID，G 是上限，H/I 是说明/等级表。英雄技能均六级，N103/N104 一级。机器表保留每个角色的完整行与 `heroAbilList/abilList` 挂载，未用相似名称代替 ID。

| ID / 图鉴角色与行 | 真正实现 | Web 参数 | 对象 / 实际提示 |
|---|---|---|---|
| A003 魔王降临；影魔 H001 47、灵魂收割者 G053 77 | AHad 提供 B035–B040，伤害事件调用脚本 | 范围800；物理承伤 +10/16/22/28/34/40% | [对象 L13718](../../reference/map-6.25/units_abilitydata.json#L13718)、[提示 L44](../../reference/map-6.25/units_campaignabilitystrings.txt#L44) |
| A006 强力攻击；桔梗 G043 366、琴弓媚姬 G035 507、美杜莎 H002 543 | AUav 标记；学习时添加 AIat 辅助 T002 | 固定攻击 +100/180/260/340/420/500 | [对象 L13768](../../reference/map-6.25/units_abilitydata.json#L13768)、[提示 L73](../../reference/map-6.25/units_campaignabilitystrings.txt#L73) |
| A021 法术爆发；秀逗魔导士 H005 117 | AUav 标记；伤害事件脚本 | 脚本法术类伤害 ×1.12/1.15/1.20/1.25/1.32/1.40 | [对象 L14125](../../reference/map-6.25/units_abilitydata.json#L14125)、[提示 L258](../../reference/map-6.25/units_campaignabilitystrings.txt#L258) |
| A025 迅雷；幻影刺客 H007 30、无双魅影 G052 55 | AHad 标记；学习时添加 AIas 辅助 T008 | 原始攻速加成 +20/35/50/65/80/100% | [对象 L14200](../../reference/map-6.25/units_abilitydata.json#L14200)、[提示 L312](../../reference/map-6.25/units_campaignabilitystrings.txt#L312) |
| A033 侵蚀雾霭；深海暴徒 G044 413、鱼人守卫 H009 602 | AHad、B008；A 杖额外授予 I269/B150 | 范围900；护甲 −20/35/50/65/80/100；I269 另 −50 | [对象 L14416](../../reference/map-6.25/units_abilitydata.json#L14416)、[提示 L428](../../reference/map-6.25/units_campaignabilitystrings.txt#L428) |
| A053 月之祝福；新月骑士 G074 336、月之骑士 H016 356 | AEar、B041、FlatBonus=1 | 范围500；友方固定攻击 +100/130/160/190/240/300，近远程均适用 | [对象 L14932](../../reference/map-6.25/units_abilitydata.json#L14932)、[提示 L730](../../reference/map-6.25/units_campaignabilitystrings.txt#L730) |
| A062 巨力挥舞；奴良陆生 G049 256、流浪剑客 H019 407、犬夜叉 G054 457、蚩尤 G012 556 | AUav 标记；普通攻击事件脚本分裂 | 目标周围520；当时伤害 ×40/50/60/70/80/90% | [对象 L15237](../../reference/map-6.25/units_abilitydata.json#L15237)、[提示 L880](../../reference/map-6.25/units_campaignabilitystrings.txt#L880) |
| A072 射手天赋；夜影游侠 G073 252、希尔瓦娜斯 G066 287、黑暗游侠 H022 612 | AUav 标记；学习加基础敏捷，A 杖另有分裂入口 | 每次实际学习 +50 基础敏捷；正常六次共300；A 杖范围350与倍率见下文 | [对象 L15533](../../reference/map-6.25/units_abilitydata.json#L15533)、[提示 L1038](../../reference/map-6.25/units_campaignabilitystrings.txt#L1038) |
| N103 近战光环；天灾/近卫近战兵 Max n233/n230，796/860 | AEar、B017、MeleeBonus=1 | 范围1000；近战攻击 +40% | [对象 L25612](../../reference/map-6.25/units_abilitydata.json#L25612)、[实际 Ubertip L14205](../../reference/map-6.25/units_campaignabilitystrings.txt#L14205) |
| N104 远战光环；天灾/近卫远战兵 Max n239/n236，797/861 | AEar、B018、RangedBonus=1 | 范围1000；远程攻击 +40% | [对象 L25627](../../reference/map-6.25/units_abilitydata.json#L25627)、[实际 Ubertip L14220](../../reference/map-6.25/units_campaignabilitystrings.txt#L14220) |

A053 的 DataB/C/D 均为1，分别是近战/远程/固定加成开关，不能把 300 解释成300%。N103 只写近战开关、N104 只写远程开关；其 `Researchubertip` 有旧模板10/20/30字样，实际 `Ubertip` 与图鉴均为40%。T002 的5/6级 `Iatt=420/500`、T008 的 `Isx1≈0.8/1`、A033 的 `Had1=−80/−100`、A053 的 `Ear1=240/300`、A003 的 B039/B040 来自 W3A 增量，未因 SLK 只写前四级而漏掉。

五个脚本标记的 AUav/AHad 没有对应 Data/Area/Buff，**Q24 明定它们本身不吸血、不增加护甲、不额外发光环**；其效果由下列确证脚本及明确辅助承担。A003 同样不额外提供默认护甲。缺失字段仍在机器表中存为 null，未伪装成原图显式0。

## 公共入口与执行顺序

[伤害分派公共前段](../../reference/map-6.25/main.disasm#L162494)保留 q004/q005 清零、零伤害返回、临时/幻象/SAPPER 的归属解析、q039 外层跳过、`ItemDamageActionBefore` 与 B177 攻击分支提前返回。下表仅在原控制流实际到达时执行；不把所有被动改成独立统一监听器。S 为实际伤害来源，O 为原归属解析结果，T 为目标，D 为当前位置可变事件金额。

| 本批顺序 | 准确门槛 | 字节码 |
|---|---|---|
| A021 | O.A021>0，且 `isMagicDamage(EXGetEventDamageData(4))` | `main/f291/f1` PC316–333，[L162825](../../reference/map-6.25/main.disasm#L162825) |
| A062 | S.A062>0 或 S.A121>0，且 attack 数据≠0；两者都有也只调用一次 | PC796–818，[L163329](../../reference/map-6.25/main.disasm#L163329) |
| A003 | T 非 nil、`isPhyDamage`、T 至少有一个 B035–B040 | PC1105–1163，[L163657](../../reference/map-6.25/main.disasm#L163657) |
| A072 A 杖 | `Has_A_Item(S)`，S.A072>0，T 非 nil，attack 数据≠0 | PC2222–2249，[L164838](../../reference/map-6.25/main.disasm#L164838) |

[分类 helper L52118–52183](../../reference/map-6.25/main.disasm#L52118)把 NORMAL 当物理；既非 NORMAL 又非 DIVINE 才是这里的“法术”。A021 不仅限 literal MAGIC，也没有额外 attack=0 或排除幻象条件。A062 在 A003 前捕获 D，A072 在更晚位置取得 D，两者都不能拿最终结算伤害代替各自位置的读取。

[完整学习分派](../../reference/map-6.25/main.disasm#L168967)先拒绝 nil/幻象，然后按已学 ID 分派；本批只有 A006、A025、A072 有回调。其余光环通过实际挂载、有效等级和原生效果运行，不能因没有专用 Lua 学习分支而省掉。

## 魔王降临：图鉴数值优先，保留原选择顺序

`main/f17/f0` [L60857–60973](../../reference/map-6.25/main.disasm#L60857)从 B040 到 B035 逐个检测，首个存在的 Buff 决定倍率；没有 Buff 则1。原六级倍率是 **1.10/1.14/1.18/1.22/1.26/1.30**，实际提示与图鉴 `I47/I77` 是 **1.10/1.16/1.22/1.28/1.34/1.40**。按全局授权只替换合法六级数值，状态记 `resolved_by_global_workbook_numeric_policy`，不是新一次用户单独答题。

若 `Game_Mode==2`，仍按原位置执行 `M=1+(M−1)/2`；即 Web 该模式为1.05/1.08/1.11/1.14/1.17/1.20。最后读取当前 D 并 `EXSetEventDamage(D*M)`。不重复算护甲，不把各级 Buff 相乘，也不额外判断攻击者是否有 A003；后者是作用于目标的承伤状态。

## 学习辅助与法术标记

[A006 完整函数 L60991](../../reference/map-6.25/main.disasm#L60991)与 [A025 L63172](../../reference/map-6.25/main.disasm#L63172)读取学习事件传来的技能等级，先 `UnitAddAbility(T002/T008)`，再把辅助设成该等级，没有 MakePermanent。重复回调只是再次设级，不产生第二份辅助加成。后续单独移除/禁用/改级父标记，不会自动同步辅助；实际移除/禁用/改级辅助才改变其贡献。T008 加入[攻击时序](attack-timing.md)的原始攻速总和，再执行共同上下限，不能声称 +100% 总能把最终攻击频率翻倍。Q24 对辅助等级0明确选择无贡献，未学不隐含一级。

[A021_GetTimes L62432](../../reference/map-6.25/main.disasm#L62432)六级表如上，其余等级返回0。[Action L62404](../../reference/map-6.25/main.disasm#L62404)读取当前 D 乘这个表。入口只检>0，所以非法正等级会乘0；保留这个明确行为，不用 Q24 擅改成乘1。AUav 标记不产生第二笔吸血治疗。

[A072 学习函数 L73111](../../reference/map-6.25/main.disasm#L73111)严格为 `GetHeroAgi(unit,false)+50 → SetHeroAgi(unit,result,true)`，不读当前技能级。正常升六级加300；直接重复调用仍再加50；移除技能不退款。`false` 避免把临时敏捷折进永久值，`true` 接[英雄属性接口](hero-attribute-interface.md)；载入和换皮不能伪造学习事件再加一次。

## 两条确证分裂：不同判定必须保留

[A062 完整函数 `main/f55/f0` L70090–70328](../../reference/map-6.25/main.disasm#L70090)先读 S.A062，**仅等于0时**改读 A121。捕获 T 坐标，枚举520范围；只读一次当前 D。系数 `0.3+0.1L`，若 S 是幻象再乘0.4。遍历每个成员时先从组移除，再检查当前所有者为 Player(11)、不是 T、生命>0；每名合格成员收到 `D*系数`，**该次级目标**类型为 m999/m998 则另乘0.2。没有扇形、朝向或敌我关系检查。G049 使用 SvenFenLie 特效，其共享标记会在子伤害后再次读取，但只影响特效。

[A072_AAA 完整函数 `main/f63/f1` L73137–73260](../../reference/map-6.25/main.disasm#L73137)捕获传入 D、T 坐标，按原顺序逐个筛 Player(11)、非 T、生命>0。每名次级目标平常收到 `0.4D`；若 **主目标 T** 类型是 m999/m998 则收到 `0.51D`。没有幻象额外0.4。主目标类型每次重新查询，不能预先固定、也不能错误套用 A062 的次级目标0.2。

A072 实际 `Ubertip` 六级的 A 杖说明均写350，两本图鉴 H/I 均未给半径。[Q61](q61-reconciliation.md) 采用目标中心350闭圆，原枚举280留作来源证据。 [提示](../../reference/map-6.25/units_campaignabilitystrings.txt#L1049)

两条都调用 [SetRealDamage L52090](../../reference/map-6.25/main.disasm#L52090)：`UnitDamageTarget(S,U,amount,false,false,CHAOS,DIVINE,WHOKNOWS)`。原脚本已经逐个发包，保留该结构；不把它改成 `UnitDamagePoint`，也不改普通攻击包。子包同步进入伤害流水线，返回后恢复父事件；因此不再触发本身 attack≠0 的分裂入口，但仍可触发其他满足条件的地图伤害逻辑。两函数都不清零或改写父包。

**Q24 局部分组/原生包边界：**按 B04 稳定创建顺序，以二维中心闭圆取一次快照；隐藏/Aloc 不进入快照，其他空中、建筑、魔免、无敌与各所有者均可进入，随后原循环进行自己的当前生命/所有者筛选。后续移动不移出该快照，后续死亡或换所有者会被原循环跳过。提交单体 DIVINE 包时，目标仍须存在存活且非无敌；魔免允许，不再抽普通命中/原生暴击。已在运行的回调允许尸体来源；来源已删除则 native 返回 false、不发事件，循环仍继续。金额0不造事件；负数返回 false并报告集成错误，不转治疗、不新增调用方 return。没有把此约定推广到未核的全局伤害类别。

D 和中心坐标不会被更早的子伤害覆盖。若早先子包删除主目标，Q24 无效句柄 `GetUnitTypeId=0`，A072 后续成员回到0.4而非0.51；最后位置只允许用于特效，不另造伤害。例：D=100、一级 A062、幻象打普通副目标=16，打副目标 m999=3.2；A072 主目标 m999 时每个普通或 m999 副目标都是51。

## I269 的授予、撤销及动态边界

[Use_A_Item L50925](../../reference/map-6.25/main.disasm#L50925)的 PC54–74 只有在当前 A033>0 时添加 I269，再 `UnitMakeAbilityPermanent(true)`；[Drop_A_Item L51090](../../reference/map-6.25/main.disasm#L51090)的 PC47–60 同样先检当前 A033>0 才移除 I269。它是范围900、Buff B150、固定−50 的独立 AHad，[对象 L22717](../../reference/map-6.25/units_abilitydata.json#L22717)。其实际提示保留旧“专注光环+1”模板，不能据此推翻显式−50字段。

`A_ITEM_ID=i310`；[Has_A_Item L50812](../../reference/map-6.25/main.disasm#L50812)还承认 A111_113_A 表成员。[拾取 L97229](../../reference/map-6.25/main.readable.lua#L97229)对非工人/非背包调用 Use；[丢弃 L98724](../../reference/map-6.25/main.readable.lua#L98724)仅在已经没有 A 杖资格时调用 Drop。A111/A113 的[共享回调 L50306](../../reference/map-6.25/main.readable.lua#L50306)也可发出 Use/Drop，本批保留该接口，不声称完整核完配对技能。

两个已知边界必须保存：持杖之后才学习 A033，没有本技能的 Use 回调，不能自动补 I269；已有 I269 后把 A033 清到0再丢杖，Drop 条件不成立，I269 会保留。不能用“是否当前持杖”派生表替代真实 I269 状态。

已核所有13个 ID 的字面引用和单位挂载；原图两处 `EXSetAbilityDataReal` [L68371](../../reference/map-6.25/main.readable.lua#L68371)都改 T286，不是本组。通用 A 杖对照表不等于这组没有动态增删：A033/I269、学习辅助、换皮均单独追踪。[Model_Change L106613](../../reference/map-6.25/main.readable.lua#L106613)在原单位上处理掉落和 +10/+30 三围，最后添加对应 R* 变化能力；本页同角色换皮按 Q24 保留实际技能等级与辅助状态，不重放学习。原 Skin 技能的增益/物品事件仍运行，不通过重建单位抹掉源行为。

## 真光环的可执行 Web 规则（Q24）

一手字段依据是固定提交的 [YDWE AbilityMetaData](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/AbilityMetaData.slk#L3472)与 [WorldEditStrings](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt#L8134)：Ear1–4 对应攻击量/近战/远程/固定，Had1/2 对应护甲量/百分比。它们说明字段含义，不证明匹配客户端的帧时序。[Blizzard Spell Basics](https://classic.battle.net/war3/basics/spellbasics.shtml)支持同光环不叠加、自身受益及魔免/隐身相关区别；[YDWE MiscGame](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/MiscGame.txt#L26)提供发射资格开关。[独立引擎 AuraBase](https://github.com/Retera/WarsmashModEngine/blob/f9e0aeed4be372d6016519d0e97b384aa873f374/core/src/com/etheller/warsmash/viewer5/handlers/w3x/simulation/abilities/skills/util/CAbilityAuraBase.java#L16)有2秒检查，但并非本图运行版本。因此沿用[回蓝光环](mana-auras.md)的明确几何/失效选择，在下述六项内扩展，不宣称原生实测。

1. 来源须存在、存活、未隐藏、实际能力启用且等级有效。幻象、隐身/影遁、妖术、钻地、复生尸体、当前飞行的原生 HERO 不发光环；普通眩晕、沉默、单位暂停本身不关被动，无敌来源仍可发。等级0无贡献，非法越级是内容错误，不默默钳制。
2. 受体须存在、存活、未隐藏、非 Aloc。地面/空中、建筑/机械、亡灵/ancient、召唤/幻象/虚无均允许；不要求视野、路径或碰撞体。A003/A033/I269 选敌方；A053/N103/N104 选自身或“来源玩家→受体玩家”的盟友。魔免排除敌方三项、允许友方三项；无敌可保留光环状态，但无敌仍阻止实际伤害。受体普通隐身不排除。
3. 二维中心闭圆 `dx²+dy²≤r²`。第5/6级缺失的持续字段 Area/targets/flags 沿用第4级，再叠明确 W3A 覆盖；缺省 Had2=false、AEar 未写的 B/C/D=false。本页不从模板额外补护甲或吸血。
4. A003 每个 B035–B040 保留是否存在，脚本只用最高一项；A033 的 B008 取负值绝对值最大者；I269 的 B150 独立−50，两组相加，最高合计−150。A053/B041 取最大固定值；N103/B017、N104/B018 各取最大百分比。并列用最低稳定 sourceId 作归属，不改变数值。武器近远程看当前有效武器分类，一次武器不会同时拿两个40%，没有可用武器则没有攻击贡献。
5. A053 是独立固定绿字通道；N103/N104 与[命令光环 N016](creep-skill-family-001-053.md)的百分比在同一基数上相加，不互相复利。**百分比基数=模板武器基础+科技/脚本基础修改+本次武器骰子+有效主属性×1.4**；排除 AIat/T002/A053 等固定绿字及任何百分比贡献。此处与[主属性接口](hero-attribute-interface.md)一致，不冒充尚在单独核对的通用 S18/S19 最终映射。例：基础100+升级20+骰子7+主属性30×1.4=169；固定100+300；40%光环与15%命令光环另加92.95，总661.95。
6. A033/I269 进入真实护甲加法通道，由 B03 在原生减免阶段读取。A003 是之后地图事件的承伤乘法，不先变成护甲，也不二次减免。法术护盾不消费；HERO/Arsk 不缩短被动光环。
7. 状态变化立即重算、**零残留**：位置、等级、启停、关系、魔免、隐藏/妖术等资格、死亡/删除/复活、形态与武器变化，均在下一可观察操作前更新。忽略未证实的脉冲/残留，不能把 AHad 的 Dur=4/HeroDur=2 直接当离圈残留。最强源失效立即回落到次强。普通驱散不去掉持续光环；明确删除 Buff 会清理显示并在同次操作从有效来源重建。

## 禁用、死亡、幻象与保存

本页原生贡献受实际能力启停控制；脚本查询 `GetUnitAbilityLevel` 在仅禁用时仍保留等级，因此 A021/A062/A072 的原脚本门槛不会凭空增加“被禁用则跳过”。移除或设0才改变等级条件。父标记禁用与 T002/T008 独立辅助启停不可混同。

死亡停止原生光环发射和接收；辅助能力与已加永久敏捷随同实体保存，复活重算贡献，不再学一次。删除单位后的 native 读取取0/写入无操作，不把旧句柄指向新塔。同实体换皮保留本组实际等级、T002/T008/I269 授予和基础敏捷，变化后重算；原掉落和三围增加仍执行。

**Q24 幻象局部适配：**本组真光环不从幻象发射；普通幻象创建时复制其实际 A006/A021/A025/A062/A072 标记与 T002/T008 的等级，以及已经形成的基础属性一次，不回放学习；本规则不保证复制 A 杖或全部物品。I269 即使存在于副本也不发射。A062 保留明确的幻象×0.4，A072 仍根据副本自己的 A 杖资格决定；不把“所有幻象被动无效”套进已知脚本。

本机保存实际技能等级/启停/授予来源、独立辅助、基础敏捷、单位稳定 ID/位置/归属/关系/资格/武器状态。载入只重建派生光环一次，不存一份绿字后又重新相加，不 replay 学习或 Use_A_Item。B05 在完整事务间保存；嵌套子伤害必须完整完成，不能半途丢父上下文。

## 验证与范围界限

[独立验证脚本](../../tools/audit-hero-aura-family.py)对两本图鉴只读、核源哈希和原始 SLK，按机器表保存的原字节码执行分支。A003 另设仅修改合法六级常量的 Web 探针；原/选值、64个 Buff 组合和3模式分别验证。其余涵盖学习早退/重复、无效等级、分裂实际来源/归属/模式无额外限制、主/副目标 m999 区别、幻象、子包改变后续成员、I269 遗留授予，以及范围边缘/叠加/资格/载入规则。执行数量与结果写在机器表 `validation`；Q24 断言是 Web 合约验证，绝非 Warcraft 原生运行结果。

10 项本身已给出可实现效果；A121 只保留共享 A062 的等级回退，不计作完整 A121 审计。A111/A113 完整配对生命周期、通用 S18/S19 读取和本组之外的幻象继承仍由各自模块处理；这里给它们明确接口，不替它们声明完成。A193/A194/A216 未在本批扩查。
