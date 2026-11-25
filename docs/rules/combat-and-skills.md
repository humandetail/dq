# 战斗基础与技能执行：原图证据

本页记录 6.25 原地图的静态规则调查，不代表 335 个技能都已完成可实现级核查。图鉴优先；用户2026-11-23已授权数值差异直接采用图鉴，无需逐项裁决。未修改图鉴、原地图或游戏程序。

**本轮完成的范围**：地图明确覆盖的基础常量；战斗字段来源；伤害类型辅助函数；自动施法入口与基础条件；幻刺秒杀与突破防御、龙卵领主范围攻击、怒意狂击叠加、EUL 法术暴击的指定脚本分支。关键公式和比较符已对照 Lua 字节码。原生魔兽引擎的护甲、命中、原生暴击、Buff 叠加规则尚未闭合，不能直接套其他版本的参数。

后续已在 [Web 基准](web-baseline.md) 明确 Q24 授权的负护甲、经验取整、事件提交/重入、组枚举和同刻排序。下文保留原生证据边界，相关“尚未闭合”不撤销这些已选 Web 规则；其他类别减免、命中和 Buff 行为仍需继续核查。

龙卵领主及已核妖刀的范围包现另接入 [area-damage-v1](native-area-damage.md)，明确 Web 目标集合、几何、免疫与提交顺序；这不证明原客户端所有原生细节，也不自动完成其他技能的门槛与生命周期。

## 证据与覆盖状态

- [main.readable.lua](../../reference/map-6.25/main.readable.lua) 是反编译阅读辅助；文中 `Lua L…` 指此文件行号。
- [main.disasm](../../reference/map-6.25/main.disasm) 是原主程序字节码反汇编；文中给出函数路径及行号。反编译已发现错误，例如 `UnitIsHero` 和出怪相关分支，不能将不合理的反编译结果当作原版行为。
- [skill-source-coverage.json](skill-source-coverage.json) 按 **335 个唯一技能 ID、878 条塔技能行**建立索引，保留图鉴行、相关塔、SLK 数据定位、物编增量及脚本模块/引用行。335 个均找到能力 SLK，139 个有 `w3a` 增量，239 个在主程序中有精确技能 ID 字符串引用；另外 96 个无精确字符串引用不等于没有效果，可能由原生能力执行。
- 索引中 **29 个技能 ID** 已核指定脚本分支，另有 **5 项** 已明确原生效果的Web规格，**301 个仍仅来源定位**。具体函数、入口与未覆盖边界见[规则索引](README.md)及每项 `verification`，不把限定分支核查算作完整技能。A027原生暴击交互已单列[恩赐解脱](skill-coup-de-grace.md)，A084已决Q41与两处入口见[精气光环](skill-essence-aura-proc.md)，N061–63和N159见[邪恶狂热与减金](skill-lizard-frenzy-and-gold.md)。EUL等装备效果不计入这些塔技能ID；计入所有原生引擎行为后，仍没有端到端完整验证的技能。
- “已证实”仅指源数据或已核字节码支持的结论；“推导”给出假设；“未闭合”明确还缺什么。

客户端版本调查：原图 [war3map.w3i](../../reference/map-6.25/war3map.w3i) 为 458 字节，头部三个小端整数分别为文件格式 25、保存次数 10605、编辑器版本 6052，随后是地图名“刀圈TD”、作者、说明和推荐人数。字段解释参照 [w3i 格式定义](https://github.com/SimonMossmyr/w3x-spec/blob/master/w3i.md)。此头部没有独立的实际运行客户端版本字段；因此不能由 6052 断言该图使用某个客户端补丁的全部原生规则。加载脚本还声明 DzAPI/YDWE 扩展，相关原生语义需进一步验证。

## 1. 基础字段与地图覆盖常量

数据必须按“SLK 基础记录 + `w3u/w3a` 增量 + 原生代码类型默认值 + 局内脚本/科技修改”解析。字段缺失不等于零，读取单位创建后的最终战斗状态也不能只用基础表。

| 字段 | 原图来源与定位方式 | 证据状态 |
| --- | --- | --- |
| 生命、魔法与回复 | [units_unitbalance.json](../../reference/map-6.25/units_unitbalance.json)：`unitBalanceID` 对应图鉴塔 ID；`HP,manaN,mana0,regenHP,regenMana,regenType` | 原始字段已定位；缺省值、回蓝叠加及回复计时仍需引擎资料 |
| 三围、成长、主属性 | 同表 `STR/AGI/INT,STRplus/AGIplus/INTplus,Primary`；再合并 [war3map.w3u.json](../../reference/map-6.25/war3map.w3u.json) | 原始字段已定位；局内升级、装备与技能的累计状态仍需逐条核对 |
| 护甲、护甲类别 | 同表 `def,defType,defUp`；地图系数见下表 | 完整护甲公式及正负护甲与伤害事件的先后尚未闭合 |
| 攻击与施法 | [units_unitweapons.json](../../reference/map-6.25/units_unitweapons.json)：`unitWeapID`；`weapsOn,atkType1/2,weapTp1/2,dmgplus1/2,dice1/2,sides1/2,cool1/2,dmgpt1/2,backSw1/2,castpt,castbsw` | 基础字段已定位；攻击上下限、浮点取整、前后摇和攻速上下限仍需对应引擎证据 |
| 射程与目标 | 同表 `rangeN1/2,RngBuff1/2,minRange,acquire,targs1/2,targCount1/2,Farea/Harea/Qarea,Hfact/Qfact,damageLoss` | 不能把索敌半径、攻击射程、范围伤害半径混为一项 |
| 移动、碰撞 | `units_unitbalance` 的 `spd,minSpd,collision`；[units_unitdata.json](../../reference/map-6.25/units_unitdata.json) 的 `movetp,moveHeight,moveFloor,turnRate,targType,pathTex` | 字段已定位；战场尺度详见 [battlefield.md](battlefield.md) |
| 单位所挂技能 | [units_unitabilities.json](../../reference/map-6.25/units_unitabilities.json)：`abilList,heroAbilList,auto` | 初始技能列表，不等于运行时技能列表 |
| 技能逐级参数 | [units_abilitydata.json](../../reference/map-6.25/units_abilitydata.json)：`alias,code,levels,DataA…DataI,Cost,Cool,Dur,HeroDur,Area,Rng,targs,BuffID`，叠加 [war3map.w3a.json](../../reference/map-6.25/war3map.w3a.json) | `code` 的原生实现不能只用提示文案替代；5/6 级常在物编增量中 |
| Buff 与科技 | [units_abilitybuffdata.json](../../reference/map-6.25/units_abilitybuffdata.json)、[units_upgradedata.json](../../reference/map-6.25/units_upgradedata.json) | 标识与参数已取得；未完成全部应用链 |
| 弹道与命中 | 武器类型、发射点在 weapons；追踪、命中／闪避与地形修正接对象数据和当前状态 | [共享普通攻击](shared-attack-resolution.md)已有明确 Web 规则，局部武器沿对应专项 |

一个可复查的字段例子：幻刺 H007 的 balance 记录始于 **L26337**，weapons 始于 **L22915**，unitdata 始于 **L13617**，unitabilities 始于 **L4504**。基础值包含 `Primary=AGI,AGI=14,AGIplus=10,STR=10,STRplus=5,INT=6,INTplus=1,HP=100,mana0=100,regenHP=0.5,regenMana=0.01,regenType=night`；武器 1 为 `cool1=1.1,dmgplus1=6,dice1=2,sides1=9,rangeN1=800,dmgpt1=0.3,backSw1=0.7,weapTp1=normal,atkType1=hero`。这些是基础记录，**不是声称最终生命为 100 或最终攻击为 6**；属性、增量、原生骰子和后续脚本还会影响最终值。

[war3mapMisc.txt](../../reference/map-6.25/war3mapMisc.txt) 明确覆盖以下常量：

| 项目 | 精确键和值 | 行 |
| --- | --- | --- |
| 敏捷攻速系数 | `AgiAttackSpeedBonus=0.002` | 7 |
| 敏捷护甲 | `AgiDefenseBase=0; AgiDefenseBonus=0.0` | 8–9 |
| 护甲系数 | `DefenseArmor=0.018` | 21 |
| 冰冻攻速/移速参数 | `FrostAttackSpeedDecrease=0.6; FrostMoveSpeedDecrease=0.4` | 26–27 |
| 幻象继承开关 | `IllusionsGetAttackBonus=1; IllusionsGetAttackSpeedBonus=1` | 40–41 |
| 智力魔法/回复系数 | `IntManaBonus=12.0; IntRegenBonus=0.03` | 42–43 |
| 英雄等级 | `MaxHeroLevel=30; HeroAbilityLevelSkip=3` | 44、38 |
| 移速界限 | `MaxUnitSpeed=722.0; MinUnitSpeed=50.0` | 45–46 |
| 反应延迟 | `ReactionDelay=0` | 51 |
| 攻击属性系数及力量生命/回复系数 | `StrAttackBonus=1.4; StrHitPointBonus=15.0; StrRegenBonus=0.1` | 54–56 |

上述是**已证实配置值**。尤其 `StrAttackBonus` 不能仅按键名解释成“所有英雄每点力量加 1.4 攻击”；主属性选择、白字/绿字、舍入与上下限要按确切引擎实现核实。`AgiAttackSpeedBonus=0.002` 也不能单独证明最终攻击间隔采用哪套上下限。

伤害类别配置原序列（L13–18）。列序现已依据原开发工具附带的原数据注释核实为 `SMALL,MEDIUM,LARGE,FORT,NORMAL,HERO,DIVINE,NONE`，见 [原生护甲与经验](native-armor-and-xp.md)；保留下表原始向量便于复查：

| 键 | 8 项配置值 |
| --- | --- |
| `DamageBonusChaos` | `1.25,0.75,2.00,0.35,0.70,0.70,0.05,1.00` |
| `DamageBonusHero` | `1.25,0.75,2.00,0.35,0.70,0.70,0.05,1.40` |
| `DamageBonusMagic` | `1.25,0.75,2.00,0.35,0.70,0.70,0.05,0.80` |
| `DamageBonusNormal` | `1.25,0.75,2.00,0.35,0.70,0.70,0.05,1.20` |
| `DamageBonusPierce` | `1.25,0.75,2.00,0.35,0.70,0.70,0.05,1.10` |
| `DamageBonusSpells` | `1.25,0.75,2.00,0.35,0.70,0.70,0.05,0.80` |

L24 另有 `EtherealDamageBonus=0,0,0,1.30,0,1.30,1.00`，其列序为 `NORMAL,PIERCE,SIEGE,MAGIC,CHAOS,SPELLS,HERO`。非负护甲层承伤倍率现可采用官方公式与地图参数推导的 `1/(1+0.018*a)`；依据与伤害事件适用边界见 [原生护甲与经验](native-armor-and-xp.md)。不存在于此文件中的类别/命中默认值不能自行补成常见魔兽或 Dota 版本值。

## 2. 伤害的类型、攻击标记与事件

Lua L31853–32007 / 字节码 `main/f7/f30` 至 `f38`：

| 辅助函数 | attack type | damage type | `attack,ranged` |
| --- | --- | --- | --- |
| `SetPhyDamage/SetPhyDamagePoint` | `ATTACK_TYPE_HERO` | `DAMAGE_TYPE_NORMAL` | `false,false` |
| `SetMagicDamage/SetMagicDamagePoint` | `ATTACK_TYPE_NORMAL` | `DAMAGE_TYPE_MAGIC` | `false,false` |
| `SetRealDamage/SetRealDamagePoint` | `ATTACK_TYPE_CHAOS` | `DAMAGE_TYPE_DIVINE` | `false,false` |

均传 `WEAPON_TYPE_WHOKNOWS`。`isPhyDamage` 只把 NORMAL 判为物理；`isRealDamage` 只认 DIVINE；`isMagicDamage` 把非 NORMAL 且非 DIVINE 都判为魔法。因此需同时保留 **原生攻击类型、原生伤害类型、是否攻击事件**。物理技能伤害并不自然触发要求 `EXGetEventDamageData(2) != 0` 的普通攻击特效。

`anyUnitDamaged` 位于 Lua L110377 起 / 字节码 `main/f291/f1`。它逐段读写 `GetEventDamage(0)` / `EXSetEventDamage`，并调用前置物品、技能、Buff、模式等处理。主函数完整静态控制流现已补齐，见 [伤害主流程](damage-pipeline.md)；其被调技能与物品的内部效果仍需逐项核查。很多分支会制造嵌套伤害事件，不能合并成一项“总加成百分比”。

已核的一段负护甲处理：当物理分支中的目标不是 m999/m998，且 `ConvertUnitState(32)<0` 时，把此刻事件伤害除以 `G(armor)`。Lua L111814–111847；字节码 L163986–164018。G 位于 Lua L110348–110375 / 字节码 `main/f291/f0` L161909–161977：

```text
G(a) = 1.71                         a <= -20
       1.61 + (-15-a)*0.02          -20 < a <= -15
       1.43 + (-9-a)*0.03           -15 < a <= -9
       1.27 + (-5-a)*0.04           -9 < a <= -5
       1.12 + (-2-a)*0.05           -5 < a <= -2
       1 + (0-a)*0.06               -2 < a <= 0
       1                           a > 0
```

这只是事件内修正，不能把它当完整护甲减伤函数，更不能据此忽略原生引擎先前或随后处理。

## 3. 自动施法与目标选择

**已证实入口与基础门槛：**

1. `Trig_AnyUnit_ATTACKED_Event` 为 Player(11) 注册 `EVENT_PLAYER_UNIT_ATTACKED`，调用 `chooseAttackedAction`。Lua L124837–124855 / 字节码 `main/f291/f31` L179448–179486。此入口是受到攻击事件，不能假设为每秒巡检或每次成功造成伤害。
2. `chooseAttackedAction` 中攻击者为幻象时走专门分支后返回；普通单位调用 `Skill_Auto`。Lua L114750–114784 / 字节码 `main/f291/f3` L167084 起。
3. `Skill_Auto` 要求攻击者拥有 B012；按固定代码顺序尝试技能。已核开始顺序为 A010、A239、A008，前两者就绪则下发 `metamorphosis` 并跳到本轮技能检查结束；A008 需 600 半径内存在 `hasMon` 目标，再按目标位置下发 `curse`。Lua L119800–119885 / 字节码 `main/f291/f27` L174090–174175。
4. 就绪函数 `Unit_Ability_Has_Cool_Down` 条件为：技能等级 > 0；能力状态 1 恰为 0；当前魔法值 ≥ 当前技能等级的能力整数数据 104。Lua L32009–32047 / 字节码 `main/f7/f39` L52213–52272。接口映射中 1 为剩余冷却、104 为耗蓝；它没有自行检查眩晕/沉默/施法中等全部原生施法限制，最终命令是否被接受仍由原生机制处理。
5. 点/目标命令包装器先建 timeout=0 的单次计时器，回调再下发命令；即时命令直接下发。Lua L119761–119798 / 字节码 `main/f291/f25`、`f26`。因此不能把整个调用视为同一条同步执行的施法结果。

`hasMon` 遍历 `FirstOfGroup`，移除当前成员，返回首个属于 Player(11) 且生命 > 0 的单位；`hasHero` 加上 `UnitIsHero`；`hasNor` 要求其为 false。Lua L124702–124831 / 字节码 `main/f291/f28`、`f29`、`f30`。这不是已证明的“选最近”“选路线最前”规则，原生组枚举次序仍需明确。

**必须使用字节码修正的事实**：`UnitIsHero(u)` 实际为 `GetUnitAbilityLevel(u,GetId("N534")) > 0 and IsUnitType(u,UNIT_TYPE_SAPPER)`，并非原生 HERO 类型。证据：字节码 `main/f7/f45` L52444–52480。Lua L32149–32163 的反编译表达式错误。

`Skill_Auto` 全体顺序、范围例外、特殊选敌和终止分支现已核完静态控制流，见 [自动施法完整规格](autocast.md) 与 [机器表](autocast-data.json)：157 个顺序块、198 个就绪检查、167 个发令点。该表保留 A163 发令后继续扫描、A221 就绪但无目标仍终止、尾部继续自动道具等细节；原生枚举与发令是否成功仍需验证。

## 4. 幻影刺客：A026/A027

### A026 突破防御

触发要求攻击者 A026 等级 > 0 且 `EXGetEventDamageData(2) != 0`。此分支先于 A027；Lua L110885–110903 / 字节码 L163017–163032。

对等级 L=1…6，读取目标状态 32 作为护甲 a：

```text
x = a * [0.05,0.10,0.15,0.20,0.25,0.30][L]
若 x == 0：直接返回
x = max(0, min(a, x))
若 Game_Mode == 2：x = x / 2
当前事件伤害 D ← D + D * 0.007 * x
```

Lua L39159–39227 / 字节码 `main/f28/f0` L63229–63344，已核所有比较、系数与深渊条件。

图鉴 `塔技能!I31` 写“攻击无视5%点防御”至“攻击无视30%点防御”；脚本并没有临时减目标护甲再重算原生伤害，而是采用上式。原客户端的最终等价性没有实测；在 Q24 的 Web 护甲/事件基准下，两种公式可以明确比较。

**Q26 已裁决：Web 按图鉴忽略对应比例，保留原触发时点与深渊折半。** 在原 A026 分支处，令该阶段读到的目标护甲为 a、比例 p=0.05×技能等级（深渊 p/=2）；a<=0 时无此增伤，否则将线性项替换为 `D *= F(a*(1-p))/F(a)`，其中正甲 F(a)=1/(1+0.018*a)。不修改目标实际/面板护甲，不移动前后置装备与其他技能的触发顺序。这是 Web 对图鉴文字的实现，原脚本公式继续保留为证据。

独立验收例：a=100、六级、非深渊，倍率 `2.8/2.26≈1.2389380531`；深渊 p=0.15，倍率 `2.8/2.53≈1.1067193676`；a<=0 不改事件伤害。若其他穿甲分支也被改为比例忽略，仍须记录其原资格、查询时点与叠加方式，不自动把百分比相加。

### A027 恩赐解脱

原生暴击能力基础为 `code=AOcr`。SLK 在 L14234 起：等级 1–4 `DataA=10`、`DataB=10/14/18/22`；`w3a` L363 起补 `Ocr2` 第 5/6 级为 25/30。不能因 SLK 没有 5/6 级字段而填零，也不能仅凭 AOcr 参数证明原生暴击与所有其他暴击如何叠加。

六级秒杀的额外脚本已核：

```text
必须 A027 等级 == 6，且 event.attack != 0
threshold = 2
若 Game_Mode == 1：threshold = 4
若攻击者是幻象：threshold = 1
roll = GetRandomInt(0,1000)
若 roll < threshold，且目标不是 m999/m998，且 Game_Mode != 2：A027_Action
```

判定函数：Lua L39326–39347 / 字节码 `main/f29/f1` L63482 起；外层：Lua L110902–110941 / 字节码 L163033–163073。**先消耗随机数，再排除金币怪与深渊**。若底层 `GetRandomInt` 均匀包含两端，精确触发率分别为 `2/1001≈0.1998%`、`4/1001≈0.3996%`、`1/1001≈0.0999%`；分数依赖这一原生随机接口约定，最可靠的移植证据是原始区间和比较符。

`A027_Action` 调用 `UnitKillUnit`。后者创建 q025，设置 0.5 秒生命周期并保留归属索引，再用 `SetRealDamage` 对目标造成 **10,000,000** 伤害。Lua L39242–39324、L32108–32146 / 字节码 `main/f29/f0`、`main/f7/f44`。它不是无条件的原生 `KillUnit`；也不能笼统说它对任意生命值目标必定致死。q025 后续豁免分支需与整个伤害分派器共同保存。

## 5. 龙卵领主：N068–N071

图鉴 `塔技能!H776/H779/H782/H785` 未量化伤害与范围。外层要求攻击事件标记非零，攻击者持有 N068/N069/N070/N071 任一技能；Lua 对应分派器 / 字节码 L164433–164473。

`N068_71_Action`（Lua L71782–71926；字节码 `main/f178/f0` L113486–113648）已逐项核实：

```text
等级选择：有 N069 则 2；否则有 N070 则 3；否则有 N071 则 4；否则 1
S20 = GetUnitState(attacker, ConvertUnitState(20))
S21 = GetUnitState(attacker, ConvertUnitState(21))
S37 = GetUnitState(attacker, ConvertUnitState(37))
S81 = GetUnitState(attacker, ConvertUnitState(81))
伤害 = (S20 + S21)/2 * [0.8,1.0,1.2,1.4][等级]
半径 = min(1200, 50 + 260*S37/S81)
在攻击者坐标调用 UnitDamagePoint(延迟0, 半径, 伤害,
  attack=false, ranged=false, ATTACK_TYPE_CHAOS, DAMAGE_TYPE_NORMAL, WEAPON_TYPE_WHOKNOWS)
EXSetEventDamage(0) 取消原始命中伤害
```

状态编号 20/21 对应第一攻击的最小/最大伤害，37 对应基础攻击间隔 C，81 对应未限幅的原始攻速系数 R。20/21 的编号和计算有 [YDWE 开发者源码的固定版本](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Plugin/Warcraft3/yd_jass_api/UnitState.cpp#L289) 支持：最小值为基础伤害＋附加伤害＋骰子数，最大值为基础伤害＋附加伤害＋骰子数×面数。因此二者均值不是本次攻击随机掷出的实际伤害。37/81 的名称另可对照 [JapiNative 接口常量声明](https://github.com/yefq/JapiNative/blob/master/JapiNative.j)。原图公式中仍保留数值编号；外部实现不是此地图完整引擎版本的证明。

由此可推导为“平均攻击力 × 档位倍率，半径随原始 C/R 增加”，**AOE 中心在攻击者，不在受击者**。R 不替换为[攻击计时](attack-timing.md)调度所用的限幅系数 K。生成的伤害不是攻击标记，因此不应递归再次触发此攻击分支。该范围包的 Web 目标集合、几何及提交规则已接入[范围伤害基准](native-area-damage.md)，原客户端等价性未实测。

## 6. 怒意狂击 A023：叠加与时长

图鉴 `塔技能!H191` 写 6 秒内不攻击则清空、最多叠加 300 次。实际实现位于 Lua L38851–38991 / 字节码 `main/f25/f0` L62724–62883、`f1` L62885–62944；调用来自攻击事件 `chooseAttackedAction`，Lua L114853–114864 / 字节码 `main/f291/f3`。

- 按 `Tower_ALL` 中的索引保存 `A023_COUNT, A023_SUM, A023_TIMERS`，不是按目标记录层数。
- 每次每级增加攻击值 `[3,4,5,6,7,8]`，写单位状态 19。普通 cap=300，`Has_A_Item` 成功时 cap=450。
- `Has_A_Item` 为真有两条路径：单位已存在于 `A111_113_A` 的值列表，或背包持有 `A_ITEM_ID="i310"`。字节码 `main/f7/f8` L50812–50855、全局赋值 L49508–49510；不能把强化条件简化成仅查物品槽。A111 连接的授予/撤销生命周期仍需单独核实。
- 每次事件先销毁旧计时器，建立新的 **6 秒**单次计时器。全部层数共用续期；不是每层独立倒计时。即使达到上限后仍会续期。
- 边界实际为 `if cap < count then gain=0 else count=count+1; 攻击+=gain`，之后 `sum+=gain`。
- 从 count=0 开始可增至 **301 次/451 次**，因为 count==cap 时仍执行加层。字节码 L62844–62855 明确使用 `<`，不是反编译误差。
- 6 秒回调从当时状态 19 中减去 `A023_SUM`，清除 sum/count/timer。中途升级时，各次 gain 累积保存，不能简单用“当前技能每层值 × count”替代已累积 sum。

**Q16 已裁决**：Web 普通上限为 300 层，A 杖强化后为 450 层；达到上限后不再增加攻击，但仍按原规则刷新 6 秒计时。原脚本的 301/451 保留为来源证据。A 杖资格使用 `Has_A_Item` 的实际判定链，不能由此宣称所有 A 杖效果已核完。

## 7. EUL 法术暴击的实际比较符

`ItemDamageActionAfter` 将临时单位追溯至塔，排除无归属/零伤害以及幻象来源；塔持有 i119 或 i161 且伤害类型被 `isMagicDamage` 判为魔法时调用 `i119_Action`。入口 Lua L97411–97513；实际函数 Lua L80145–80190 / 字节码 `main/f234/f0` L126386–126453。

```text
若 HasItem(owner, i161) != nil：倍率=2.0，阈值=25
否则：倍率=1.4，阈值=10
r = GetRandomInt(1,100)
若 r < 阈值：当前事件伤害 *= 倍率
```

比较符是严格 `<`。若随机整数包含两端，实际为 24%/9%；图鉴 `装备与道具!H29/H71`（EUL/大法师之戒）提示中的 10%/25% 与此存在冲突。**Q14 已裁决 EUL 采用图鉴 10%、倍率 1.4；Q15 已裁决大法师之戒采用图鉴 25%、倍率 2.0。** 原脚本阈值仅保留为来源证据，Web 判定应精确实现已选概率。同时拥有两件时此函数优先取 i161 参数，并不会在函数内部各掷一次；但整体物品互斥与其他法术暴击叠加仍需逐项核查。

后续A027原生暴击、五种物品交互及幻象局部快照已单列[恩赐解脱Web基准](skill-coup-de-grace.md)；本页原额外秒杀和Q26公式不变。

## 8. 减速、眩晕、Buff 与未闭合项

原图包含原生能力派生、同 Buff ID、脚本直接改属性、计时恢复以及事件内伤害倍率等多套方式，不能一概套用“取最大”“百分比相加”或“乘算”。已核 A023 是一套明确的整体续期模型；不能据此推广到其他技能。

可复查的原生参数样例：`N015` 在 `units_abilitydata.json` L24324 起，`code=ACtc,Area1=500,BuffID1=BCtc,Cool1=8,Cost1=50,DataA1=2500,DataC1=0.3,DataD1=0.25,Dur1=1.2,HeroDur1=0.4`。这里能确定参数，但同 BCtc 重复施加如何更新、多个不同减速如何组合、原生 HeroDur 判断是否采用原生英雄类型，仍需对应引擎行为，不能用本图自定义 `UnitIsHero` 自动替代。

还需继续完成以下事实核查，均属于资料调查，不需要用户替我们猜参数：

1. **引擎基础**：匹配客户端版本的三围换算、正/负护甲、伤害类别向量索引、默认魔抗、攻速上下限、浮点/整数取整与回复周期。Web 命中、闪避、地形、顺序与弹道接[共享普通攻击](shared-attack-resolution.md)。
2. **事件内部效果与重入**：`anyUnitDamaged` 主流程已静态核完，继续核前后置物品、被调技能、模式函数与嵌套事件内部语义；不要把已知调用顺序误当作所有内部效果均已验证。
3. **全体技能**：索引中 328 个仅定位技能继续核施法/被动入口、等级参数、目标选择、计时、随机区间及 Buff 相互作用；7 个指定分支已核的技能仍需闭合相关原生部分。`wordingReviewCandidates` 只是含“小概率/随机/永久/叠加”等文案的筛选结果，不是完整缺口清单。
4. **自动施法原生边界**：静态分支与 B012 门槛已补齐；命令接受、手动施法的打断/互斥、冷却/耗蓝时点和原生枚举次序仍需要证据。
5. **存档与倍速对应状态**：用户已决定的 Web 时间行为不改变上述技能规则；还需保存随机状态、正在执行的命令、Buff、投射物、技能计时器和 A023 这类累计值，避免恢复后只按面板重建导致战斗变化。

本页已经给出可落实的精确公式，但规则补全尚未整体完成。后续已确认的图鉴/脚本数值差异按用户全局授权自动采用图鉴；内部矛盾与机制歧义仍需查清，可由来源解决的参数继续调查。
