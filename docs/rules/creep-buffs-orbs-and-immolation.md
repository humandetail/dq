# 普通塔：嗜血、浸毒、腐蚀、献祭与霜冻

本批基准 `creep-buffs-orbs-v1` 记录 **24 个图鉴 ID、5 个局部家族**。嗜血 4 个、浸毒 2 个、腐蚀 3 个、献祭 5 个，连同 **Q45 已确认的霜冻 10 个 ID，24 个 ID 均已有可实现的限定规则**。另定位 N094 未取得变体、T041–43 实际腐蚀能力这 4 个辅助 ID。不是全部装备法球共存、全部建造/升级事务或所有伤害下游的完成声明。

机器证据与逐 ID 状态在 [JSON](creep-buffs-orbs-and-immolation.json)，可用 [复现工具](../../tools/audit_creep_buffs_orbs.py) 的 `--write` / `--check` 重读原始 SLK、对象增量、完整图鉴单元格和字节码。本页没有运行 Warcraft 客户端；图鉴与对象明确字段、官方/编辑器资料、查后仍未知的 Q24 Web 选择分别列出。

## 来源与共用边界

图鉴坐标均为 [图鉴.xlsx](../../图鉴.xlsx) 的 `塔技能` 工作表；JSON 保存每行 A–I 的全部单元格。本批 24 行的实际 `Ubertip` 与 H 列逐字一致，G 列/对象等级均为 1，I 列没有额外等级参数。不同塔档位通过不同 rawcode 表达，不新增技能点升级入口。源码对象数值先读自定义 alias 行，再合并 w3a 增量；本批 28 个能力 ID 均无 w3a 增量。不存在某字段仍记为缺失，不自动借用 `code` 指向的标准能力行。

完整主字节码未出现这 28 个 rawcode 的字面字符串或 FourCC 常量；JASS 也无其精确 ID；157 个脚本自动施法分支无本批 ID。这个负向结果只排除明确 ID 分派，不否认通用攻击/施法/伤害事件。原图仍有 `coldarrows` 建造命令，见末节。各载体的完整能力列表与武器、资源、单位类型存入 JSON；n220 的 N135 等其他附带技能不在此批。

下列 Web 定义仅适用于本页家族：

- 沿用 [B03/B04/B05](web-baseline.md) 的减免后可变事件、稳定创建顺序、微秒计时与同刻入队顺序。实际来源 S 不换成归属塔 O；每包由原 [伤害管线](damage-pipeline.md) 重新解析 `Tower_ALL/userData`。没有为了方便而生成 q001。
- 普通攻击沿用 [attack-timing-v1](attack-timing.md)，保持原武器类别/单次攻击事件/弹道与主伤害；攻击附效只接普通武器成功命中通知，不把任意脚本 `attack=true` 伤害当作另一发普攻，不由 ATTACKED 提前施加。原生普通暴击若存在，依 [既有合成规则](native-critical-family.md) 只抽一次。本批没有新增暴击概率。
- 本批被动附效来源须存活、能力有效且非幻象；已经提交的持续效果/弹体按各家族生命周期执行。所有“可见”单体目标须处于可选择状态，排除隐藏/Aloc。范围献祭可命中普通隐形单位，隐藏与普通隐形不混同。死亡单位不受新效果。
- 正面嗜血采用[已定局部施法提交接口](creep-skill-family-001-053.md)：接收时检查来源/目标/范围/冷却/蓝量，前摇可取消，生效时重检并扣费/起冷却，派发一次 `AnySkillStart` 后交原生效果。事件内源死亡/移除取消后续效果，已支付不退。被动法球/毒/献祭不额外制造 SPELL_EFFECT；不擅加 N535 消耗。
- 冷却、前摇、持续与周期均用战斗时钟；保存开关、施法/弹体、每来源周期相位、Buff 到期及稳定序号。暂停与关闭不推进，后台和 1–4×补算仍逐事件执行。此处不重新设计完整建造、变身或存档事务。

## 嗜血 N089–N092：准确字段与原生自动施法

| ID / 载体 | 图鉴行 | 攻速增加 | 原始对象 / 实际提示起始行 |
| --- | --- | ---: | --- |
| N089 / n214 | 872 | 20% | [L25404](../../reference/map-6.25/units_abilitydata.json#L25404) / [L14023](../../reference/map-6.25/units_campaignabilitystrings.txt#L14023) |
| N090 / n215 | 873 | 30% | [L25422](../../reference/map-6.25/units_abilitydata.json#L25422) / [L14039](../../reference/map-6.25/units_campaignabilitystrings.txt#L14039) |
| N091 / n216 | 874 | 40% | [L25440](../../reference/map-6.25/units_abilitydata.json#L25440) / [L14055](../../reference/map-6.25/units_campaignabilitystrings.txt#L14055) |
| N092 / n217 | 875 | 50% | [L25458](../../reference/map-6.25/units_abilitydata.json#L25458) / [L14071](../../reference/map-6.25/units_campaignabilitystrings.txt#L14071) |

**原图明确：** code=Ablo；DataA=.2/.3/.4/.5，DataC=.2，DataB 缺失；30 蓝、CD2、射程1000、普通/英雄持续均5秒，Buff=Bblo，目标 `self,friend,invulnerable`。载体[能力 auto 字段](../../reference/map-6.25/units_unitabilities.json#L6290)是原始 `Ablo`，实际挂载的是自定义 N089 等。载体 [castpt=.56](../../reference/map-6.25/units_unitweapons.json#L32783)，[mana0=400、manaN=200/250/300/350、regenMana=1](../../reference/map-6.25/units_unitbalance.json#L36135)；建造处理明确将当前魔法设为当前最大值，不能以 mana0=400 额外透支。

**一手解释：** [原作者编辑器元数据](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/AbilityMetaData.slk)与[字段标签](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt#L6018)对应 Blo1=攻速、Blo2=移速、Blo3=模型缩放。因此 DataC=.2 不是移速20%。[暴雪萨满说明](https://classic.battle.net/war3/orc/units/shaman.shtml)支持友方有机单位/自身，可手动与自动施放，机械与魔免不合格；标准 40 蓝/60 秒等不能替换地图字段。[官方自动施法说明](https://classic.battle.net/war3/basics/spellbasics.shtml)明确战斗中的友方触发、正面自动 Buff 优先最近友军、没有友军时才按普通条件自用。

**Q24 的剩余实现选择：** `auto=Ablo` 映射到唯一已挂载 Ablo-code 能力，初始开启，独立 `bloodluston/off`，不借 B012。每0.25战斗秒扫描一次；就绪且不处于施法/攻击前摇、手动移动或不兼容命令时，对当前有合法普通攻击目标、无 Bblo 的合格友军发正常施法命令。优先最近的其他友军，同距按 B04；没有这种友军且自身在攻击时才自用。不自动预 buff 闲置者，也不将纯献祭周期伤害算作普通攻击状态。同刻已有队列先执行；相同待施法命令合并，蓝量/CD竞争仍在生效时检查。

目标为可见友方/自身地空有机非建筑、非机械单位；显式 invulnerable 掩码保留，虚无可受益，魔免不能受益。0.56 秒前摇不被攻速缩放。每目标本家族仅一份 Bblo，攻速 R 加 .2/.3/.4/.5，DataB 缺失按局部选择不增加移速；模型比例为基础×1.2，不改变碰撞/射程/生命。最新生效覆盖强度与5秒到期，可被低级覆盖；模型缩放不连乘。普通正面驱散、显式移除、新魔免、死亡/删除及到期清除；施法者后来死亡不撤销已提交 Buff。没有随机抽样。

## 浸毒 N093/N095：20% 是攻击减速，原生本体保留2HP

[图鉴 H857/H858 与实际提示](../../reference/map-6.25/units_campaignabilitystrings.txt#L14087)分别是每秒50/150伤害、减速、5秒，载体 n219/n220。源对象 [N093](../../reference/map-6.25/units_abilitydata.json#L25476)和 [N095](../../reference/map-6.25/units_abilitydata.json#L25506)为 Aven、DataA=50/150、DataB=.2、DataD=1、Dur/HeroDur=5、目标 air/ground/organic，Buff=Bpoi/Bpsd；DataC 缺失。中间 N094=100 在 SLK/提示中存在，但无图鉴行、初始载体或精确脚本赋予入口；保留辅助事实，不插入升级链。

元数据 Poi1=每秒伤害、Poi2=攻击速度因子、Poi3=移动速度因子、Poi4=叠加旗标。[编辑器 stackFlags](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/UnitEditorData.txt#L343)位0/1/2/3分别是伤害/移动/攻速/可杀死单位；**DataD=1 只打开伤害叠加，不打开攻速叠加或 Kill 位**。不把 .2 写成移速20%。[官方物理技能/毒说明](https://classic.battle.net/war3/basics/spellbasics.shtml)支持毒不受普通魔法驱散、可作用魔免而不作用虚无，重复同来源不增加 DPS，毒与疾病本体最多降到2HP。官方不同来源示例同时使用“不同单位”“不同单位类型”，没有单独证明同类型多施法者的键；下述键是明确局部选择。

**Q24：** 成功普通主攻击命中时，目标须敌方地空有机、非建筑/机械、非隐藏/Aloc/无敌/虚无；魔免允许。先登记毒再提交本次普通攻击包；若主攻击杀死目标，删除该目标毒状态。每个逻辑施法者/目标只有一条本家族感染，重复命中刷新到 `现在+5秒`、更新本来源 DPS但保留原 tick 相位；不同逻辑施法者独立叠加，包括同一单位类型。初次染毒后1秒首 tick，此后每1秒；终点 tick 包含在5秒期限内，随后清理。同刻其他事件仍按 B05先后，先发生的驱散/死亡可使尚未执行的 tick 无效。独立来源分别发完整事件，不合成一个包。攻击减速向 R 减 .2，多来源取本家族最大 .2，不相加；缺 DataC 明确采用移动减速0。

每 tick 实际 S 发 `attack=false,ranged=false,NORMAL/NORMAL` 原始物理 DPS包。沿用[前批疾病 v2 的接口](creep-skill-family-next.md)，在原生减免之后、地图回调之前取 `D=min(max(0,reduced),max(0,currentHP-2))`；D=0 不创建事件，低于2HP不反向治疗。后续地图放大或额外伤害仍能致死，不在最终提交后强行留2HP。这个包类型与上限插入 B03 的位置是 Web 定义，50/150并不承诺实际每秒掉同样生命。

同类型多来源的计时/相位独立保存。普通魔法驱散无效；显式移除 Bpoi 清本家族全部感染及缓速，显式移除 Bpsd 仅清当前缓速，直到下次毒刷新才恢复，不清 DOT。目标死亡/删除/不再符合上述类型清除；新魔免不清。来源死亡但句柄存在继续，来源删除取消其感染。无耗蓝、CD、RNG、N535 或主动施法事件；异常同持多个 Aven 时每次命中只取最大本来源值，不重复登记。

## 腐蚀 N105–N107：说明标记与实际 T041–T043 分开

| 图鉴 ID / 行 / 载体 | 实际能力 | 减甲 | 对象起始行 |
| --- | --- | ---: | --- |
| N105 / 845 / n240 | T041 | 10 | [N105 L25642](../../reference/map-6.25/units_abilitydata.json#L25642) / [T041 L33095](../../reference/map-6.25/units_abilitydata.json#L33095) |
| N106 / 846 / n241 | T042 | 25 | [N106 L25653](../../reference/map-6.25/units_abilitydata.json#L25653) / [T042 L33109](../../reference/map-6.25/units_abilitydata.json#L33109) |
| N107 / 847 / n242 | T043 | 40 | [N107 L25664](../../reference/map-6.25/units_abilitydata.json#L25664) / [T043 L33123](../../reference/map-6.25/units_abilitydata.json#L33123) |

[实际挂载](../../reference/map-6.25/units_unitabilities.json#L6420)同时包含标记与对应 T 技能。N105–107 code=AOcr、无概率/倍率数据；依已定 `aocr-marker-contribution-v1` 不另添暴击、必中或第二次效果。其实际 [Ubertip](../../reference/map-6.25/units_campaignabilitystrings.txt#L14222)就是图鉴减甲；Researchubertip 的标准暴击模板不变成真正技能。

T041–43 code=AIcb、DataB=10/25/40、DataE=2、Dur/HeroDur=5、Buff=BIcb，目标 ground/air/ward；DataA 额外攻击缺失。元数据 Iarp=减甲、Iob5=允许的攻击索引；不是第2次攻击或2倍伤害。[暴雪腐蚀之球说明](https://classic.battle.net/war3/basics/heroitemspermanent.shtml)支持5秒、不能普通驱散、法球对魔免有效；标准+5伤害不证明自定义缺 DataA 仍+5。

**Q24：** 实际 T 技能随普通武器成功命中生效，敌方合法地空/守卫及建筑/机械可受影响，排除隐藏/Aloc/无敌/虚无，魔免允许；武器自己的目标限制先满足。先施加减甲，再计算本次主攻击的原生护甲层，因此第一击也受益；这是局部顺序选择。保持一份 BIcb，最新10/25/40及5秒到期覆盖，允许变弱，不按攻击次数/施法者相加。其他独立减甲通道继续存在。无额外伤害事件、蓝耗、CD、随机；缺 DataA 在本范围明确选择额外固定攻击0。

普通魔法/负面驱散不清 BIcb；显式移除、目标死亡/删除/到期清，源死亡/删除不撤已施加减甲，目标魔免不清。删除说明标记不等于删除独立挂载的 T 技能。多装备法球冲突不由本页推出通用互斥或叠加。

DataE=2 确实要求启用第2攻击，但源 [n240–242 武器记录](../../reference/map-6.25/units_unitweapons.json#L33480)的第2槽只有攻击类别/目标数等局部字段，缺伤害、射程、骰子、目标掩码，不能从官方标准英雄“可对空”倒推这些自定义塔的完整第二武器。Web 保留启用槽2这一状态，缺完整配置的槽不可用；不复制槽1或凭空开放对空。原有完整地面槽1保留；未来经独立核查的变身若提供合法槽2，则走正常武器选择。

## 献祭 N127–N131：周期法术伤害，没有普通攻击

图鉴 H835–H839 与 [实际提示](../../reference/map-6.25/units_campaignabilitystrings.txt#L14480)均为每秒60/100/150/200/300法术伤害，对应 n021–025。源对象从 [L26072](../../reference/map-6.25/units_abilitydata.json#L26072)起每14行一项：code=Apig、DataA对应数值、Area600、Dur/HeroDur1、Buff=Bpig、目标仅 `enemies`。元数据 Eim1=每间隔伤害，1秒间隔下与图鉴 DPS一致。[官方永久献祭](https://classic.battle.net/war3/undead/units/infernal.shtml)支持被动、无耗蓝、持续按秒伤害；标准地面目标不覆盖地图自定义 enemies 掩码。

载体 [weapsOn 字段缺失](../../reference/map-6.25/units_unitweapons.json#L30376)，虽然仍存休眠的 dmgplus/dice/range 字段，但 [w3u 明确提示](../../reference/map-6.25/war3map.w3u.json#L10520)是“特点：法术伤害，无攻击力。” n021–025 都如此。Q24 保持无普通攻击，不凭残余武器字段制造 ATTACKED，也不因此触发嗜血的战斗自动施法。

**Q24：** 存活且能力有效时，被动自带周期源；非施工、非隐藏、非幻象/妖术禁用状态。普通沉默/眩晕/单位暂停本身不取消被动。激活后1秒首 tick、之后每1秒；敌人进入范围不立即补 tick。连续同逻辑源换等级保留相位，tick读当前等级；禁用/死亡/删除取消，之后重新激活重新计1秒。升级事务完成前旧能力仍按其有效状态运行，本页不另定义全部升级事务。

每 tick 以实际来源当前坐标600闭圆形成B04快照；按定制 enemies 目标允许敌方地面/空军、建筑/机械，排除 Aloc、隐藏、无敌、魔免；普通隐形可受范围伤害，虚无按法术伤害基准受伤。每个目标重检后以实际源发一笔 `false,false,NORMAL/MAGIC` 对应原始金额，经完整 B03。地图嵌套事件杀死/删除来源后停止当前 tick剩余目标，不能将批量结果预先同时扣血。普通致死，不套毒/疾病2HP上限。

每个施法者独立伤害，相互不取最高；异常同持多个本家族能力只取本来源最大值一次。Bpig 是发射源/显示状态，不制造目标离圈后继续的感染 DOT。源停用/目标离圈后不补发错过伤害。无法力消耗、自伤、CD、控制、N535、额外随机或 SPELL_EFFECT，首次调度及目标扩展均是本范围的明确 Web 选择。

## 霜冻 N160–N164 / T292–T296：Q45 已决免费减速

| 塔 | 说明标记 / 图鉴行 | 实际冷箭 / 图鉴行 | 明确移速下降 |
| --- | --- | --- | ---: |
| n006 | N160 / 863 | T292 / 862 | 6% |
| n007 | N161 / 865 | T293 / 864 | 8% |
| n008 | N162 / 867 | T294 / 866 | 10% |
| n009 | N163 / 869 | T295 / 868 | 12% |
| n010 | N164 / 871 | T296 / 870 | 15% |

N160–64 的 [Amgl 空标记](../../reference/map-6.25/units_abilitydata.json#L26475)只承载 [3秒减速说明](../../reference/map-6.25/units_campaignabilitystrings.txt#L14754)。[实际能力](../../reference/map-6.25/units_abilitydata.json#L38063) T292–296 code=AHca，DataB=.06/.08/.10/.12/.15、Dur/HeroDur=3、Rng1000、Buff BHca/Bfro/Bcsi。Cost1、Cool1、DataA加伤、DataC攻速减速、DataD叠加旗标都缺失，w3a无增量。[实际 Ubertip](../../reference/map-6.25/units_campaignabilitystrings.txt#L22813)与 H862 等均保留“增加额外的攻击力……也会消耗一定的魔法值”的未量化通用说明，按钮 y=-11 隐藏；它不是具体数值证据。

[能力挂载与 auto](../../reference/map-6.25/units_unitabilities.json#L5850)明确是 T292 等；[普通武器](../../reference/map-6.25/units_unitweapons.json#L30111)为 missile、单目标、射程1000、间隔1、前摇.5，非 mbounce。攻击骰子分别10–14/50–54/100–104/150–154/200–204。[w3u 弹道](../../reference/map-6.25/war3map.w3u.json#L8808)显式速度1200与追踪1。单位 [mana0/manaN 均缺失](../../reference/map-6.25/units_unitbalance.json#L33823)，w3u无蓝池覆盖。标准 [AHca 行](../../reference/map-6.25/units_abilitydata.json#L2372)的8蓝/5伤害/其他减速参数保留作对照，不能因为 code 相同就视为自定义 alias 继承结果；[官方娜迦冷箭](https://classic.battle.net/war3/neutral/nagaseawitch.shtml)也不能证明这个 AHca 自定义对象的缺省。

**关键字节码控制流：**

1. [main/f291/f34 完整74指令](../../reference/map-6.25/main.disasm#L179652)先给玩家0–3登记 CONSTRUCT_FINISH，再给0–3登记 UPGRADE_FINISH，最后同一 trigger condition 指向 `anyBuildComplete`；唯一返回 PC74。不是只在首次建造开启。
2. [main/f291/f8 PC1–52](../../reference/map-6.25/main.disasm#L168015)先取单位/所有者，调用 `anyBuildCompleteHandler`；PC15/23/31/39/47 五个比较为 n006/n007/n008/n009/n010 的 OR；任一真到 PC49–52 发 `IssueImmediateOrder(unit,"coldarrows")`，返回值被丢弃。全部不符跳 PC53；后续其他塔分支不在本批。JSON保留各真/假跳转。
3. 上述共享 handler 的 [PC1–56](../../reference/map-6.25/main.disasm#L167818)严格依次登记 `Tower_ALL`、写 userData；若 T033>0 发 manashieldon；若 N032>0 移除；若原生 HERO 调 EXSetUnitMoveType(1)；发 stop；最后设当前法力=当前最大法力。该 HERO 是 native IsUnitType，非自定义 Boss 谓词。范围外后续英雄随机处理不宣称已核。冷箭原顺序发生在此调用完成之后，不可把归属、补蓝或开启顺序倒置。

后续调用边界也必须保留：f7 [PC57–70](../../reference/map-6.25/main.disasm#L167877)只让原生 HERO 或 n208 进入随机 P 技能路径，其余到 PC129清理/130返回。本批不展开该随机授予。f8 发 coldarrows **没有提前返回**；随后有 n146 专属分支、[PC159–204](../../reference/map-6.25/main.disasm#L168179)的全建造通用英雄计数（同玩家第4个原生英雄时调用夏日活动任务更新），再有 H032/H033/H022 专属分支与末尾返回。活动任务与完整建造事务是外部依赖，不能在实现冷箭时删除，也不能把本页必要前缀覆盖宣称成整个函数覆盖。

**局部 Web 边界（结合已决 Q45）：** 每对只执行实际 T 能力一次，空 Amgl 不增加弹射或第二份减速。初始 auto 开，建造/升级 coldarrows 幂等设开，不绑定 B012、不新增隐藏按钮的可见手动入口。普通提交攻击快照等级，升级仅改后续攻击；单发沿原武器/一次 ATTACKED，以1200追踪。来源死亡后已发弹继续，删除来源取消；射程检查在发射而非飞行末端。

成功普通命中后、主伤害原生减免前施加对应移速减益3秒。目标须普通武器合法敌方地空（建筑/机械若武器合法亦可），排除隐藏/Aloc/无敌/虚无；魔免仍可受主攻击，但本 AHca 减速局部选择不生效，不扩大为所有法球的魔免结论。无 N535。缺 DataC 明确局部采用攻速减速0；BHca/Bfro/Bcsi对应同一个状态，不乘三遍。最新命中覆盖强度/到期，可变弱；负面驱散、显式清本效果、死亡/删除/新魔免/到期清。未写 DataD 不假称源代码7。自动冷箭不额外派 SPELL_EFFECT；若以后暴露单发手动入口，需在提交时一次施法事件，当前不新增该UI。

**Q45 已决（原 M02）：** 用户确认普通攻击免费附带图鉴6/8/10/12/15%移速下降，持续3秒，**费用0、额外伤害0**。这些零值是明确的 Web 取舍，原 Cost1/DataA1 仍记为缺失；不声称源码写0、不导入标准8蓝/5伤害，也不为本效果增设蓝池。当前蓝量0仍可附带减速，不扣法力；不额外增加技能冷却或改变普通武器伤害/攻击节奏。保留上面的实际挂载、建造/升级发令顺序、命中/魔免过滤、刷新与驱散规则。JSON中10个ID已改为 `bounded-Web-effect-defined`；这是本家族可实现规格，不是原客户端缺省已经被证明。

## 验证与剩余范围

复现工具校验109条原始SLK记录、205项明确数值或字段缺失、24行216个图鉴单元格、28个能力的w3a查询、10条单位w3u增量；37段存在的提示逐段保存，另明确记录10个单位没有 campaign profile。关键字节码共182条指令、8条件、1返回，其中 f34完整、f7/f8仅上述必要前缀。28个静态原生桩探针覆盖前缀全部52/56指令及8种共享条件组合，另含成功/失败冷箭命令、五种当前最大蓝量和8个建造事件注册；这些探针不是原生客户端执行。

77个规格案例覆盖：嗜血30蓝边界/缩放、毒旗标与2HP本体上限/地图后续放大致死/相位、多来源与缓速不累加、首击减甲、献祭致死及周期、霜冻重复Buff单效/飞行时间。新增Q45案例分别验证0/1/100当前蓝量不扣费、五档技能在不同原始攻击额下不加伤，以及“原字段缺失”与“Web选0”同时保留。链接与生成器再生一致性由 `--check`验证，精确数量以JSON为准。

已确认效果不等于原生逐帧一致：本批明确列出的缺省、目标扩展、同源键、提交/刷新/驱散时点是Q24 Web语义，尚无匹配客户端对照。全部装备法球共存、其他挂载技能、完整升级/变身事务与伤害管线的全部被调函数仍各自留在其范围。疾病/Purge前批已统一为 `creep-native-next-v2`：本批毒同样在B03入口保留2HP，后续地图可杀死；Purge不可普通魔法驱散不因本批可驱散的嗜血/霜冻而改变。

### 补充列复核

已按原始工作表 XML 复核全部有效列 A–J（J4为“补充对象字段”）。本批 24 个图鉴行的 J 单元格均显式为空，没有额外数值或内部冲突，不据空值补0、不改变既有规则。逐行证据见本页 JSON 的 `workbookSupplementalAudit`；[补核工具](../../tools/audit_creep_supplemental_columns.py)可单独以 `--check`复现。此前 A–I 的正文/字段校验计数仍指原检查范围，新增J列计数独立保存。
