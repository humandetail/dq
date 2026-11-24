# 雷霆蜥蜴邪恶狂热与共享减金

本批只核 **N061/N062/N063「邪恶狂热」和 N159「减金」**。前者是同一组三档主动增益，后者是多个塔共用的独立被动标记；不是第四档邪恶狂热，也不是闪电攻击的第二次概率。图鉴、实际提示、原数据、字节码与 Q24 局部原生选择分别记录于本页和 [机器表](skill-lizard-frenzy-and-gold.json)。未发现新的确定图鉴冲突。

## 1. 身份、挂载与完整有效字段

| 图鉴 F/H 格 | 塔 / 技能 | 图鉴与实际 Ubertip | 攻速字段 DataB | 耗蓝 / 冷却 / 持续 |
| --- | --- | --- | --- | --- |
| 766 | n183 / N061 邪恶狂热 | 释放后增加20%攻击速度。 | 0.2 | 30 / 10秒 / 5秒 |
| 769 | n184 / N062 邪恶狂热 | 释放后增加40%攻击速度。 | 0.4 | 40 / 10秒 / 5秒 |
| 772 | n185 / N063 邪恶狂热 | 释放后增加60%攻击速度。 | 0.6 | 50 / 10秒 / 5秒 |
| 768 / 771 / 774 | 上述三塔 / N159 减金 | 让拥有这个技能的单位打金时的伤害降低。 | 非攻速技能 | 无主动施法 |

各行 G 列均为1。N061–63 是三个各只有一级的能力，不能把某个 ID 的异常正等级当作攻速倍数。原 [能力表](../../reference/map-6.25/units_abilitydata.json#L24987) L24987–25034 完整记录为 `code=Absk,BuffID1=B014,levels=1`，`Dur1=HeroDur1=5`；DataA（移动加成）和 DataC（承受伤害加成）均未提供；targets 为 `_`。三项实际 profile 的 Name/Tip/Ubertip、Order=`berserk`、Hotkey=`B` 在 [L13704–13730](../../reference/map-6.25/units_campaignabilitystrings.txt#L13704)。不是原生 AUuf 邪恶狂热；不能按中文名字加上持续掉血或给其他单位施法。

N159 的 [能力表 L26464](../../reference/map-6.25/units_abilitydata.json#L26464) 为 `code=AOcr,levels=1`，无 DataA–E；[实际 profile L14742–14752](../../reference/map-6.25/units_campaignabilitystrings.txt#L14742) 名称/说明与图鉴一致，按钮纵坐标为 -11。残留的致命一击学习提示不是实际效果。全部图鉴 N159 行和原始单位挂载索引存于 JSON；它确实还被半人马、熊怪、树魔、龙卵等使用，本页不据此扩查这些塔的其他技能。

[单位能力表 L6135–6148](../../reference/map-6.25/units_unitabilities.json#L6135)确认 n183/n184/n185 分别携带 N061/N062/N063，且都携带 N159。三塔还带 Avul；下文自用增益不会因自身无敌而被拒绝。完整 w3a、w3u 增量中没有这四个能力或三塔对应的对象条目。

B014 在 [buff 表 L777](../../reference/map-6.25/units_abilitybuffdata.json#L777)只有 alias；[buff profile L109–114](../../reference/map-6.25/units_commonabilitystrings.txt#L109)写“该单位攻击速度增加”，模型为 `Abilities\Spells\Undead\UnholyFrenzy\UnholyFrenzyTarget.mdl`、挂点 overhead。能力表只有 N061–63 引用 B014，主 Lua/字节码没有 B014 字面逻辑。另对原地图 SHA256=`835745bd1d65bfff759a715deb59fee8bed3eff341de66403e8ddb44ff0f438a` 的完整 2048 项 MPQ 哈希表只读检查，**war3map.w3h 不存在**；w3a、AbilityBuffData.slk 和 CommonAbilityStrings.txt 三项正对照均匹配快照长度。结果、双哈希、块索引存于 JSON；未把“快照缺文件”当作“原图必无覆盖”。

## 2. 邪恶狂热的实际自动入口

完整主 Lua/字节码的字面引用核查：N061–63 只出现于 `Skill_Auto` 的第152组就绪检查；不存在独立 `N061_Action` 或这一组的 Lua Buff 计时器。效果由 Absk 原生能力执行。沿用 [完整自动施法](autocast.md)：Player(11) 单位的受攻击事件，以 `GetAttacker()` 为施法者；幻象攻击者不进入 Skill_Auto，扫描还要求 B012。这是攻击开始事件，不要求这次攻击最终命中，也不是周期自动释放。

本组为 `main/f291/f27` **PC4596–4624**，[字节码 L178985–179014](../../reference/map-6.25/main.disasm#L178985)，29条指令、3个条件。到达此组后：

```text
if ready(u,N063) or ready(u,N062) or ready(u,N061):
    IssueImmediateOrder(u,"berserk")
    goto PC4833     // 结束技能扫描，仍执行其后的 Item_Auto_Use 和组清理
else:
    goto PC4625     // 继续下一组技能
```

短路优先级为 **N063→N062→N061**，不是数字升序；不再检查附近敌人数、当前 B014、模式或概率。发令是直接同步调用，不排0秒计时器。返回值被丢弃：即使原生命令拒绝，仍结束技能扫描，不再尝试下一组。较早技能可能先结束扫描，不能只因狂热就绪便跳过原顺序。

`ready=Unit_Ability_Has_Cool_Down` 为 `main/f7/f39`，[L52213–52272](../../reference/map-6.25/main.disasm#L52213)，36条指令、3个条件：先读能力等级，≤0返回 false；正等级先读取整数数据104（耗蓝），再读状态1（剩余冷却）；只有 **冷却严格等于0** 才读取当前魔法并比较 `mana>=cost`。它不检查眩晕、沉默、施法锁或 native 是否最终接受；不能把“就绪”当“已经成功施法”。

成功施法沿原 `AnySkillStart` 通用路径：本组 ID 不在 T033/A040/A070/A210 的早退名单中，也不是临时 q001 施法。普通塔成功生效后会到 `Item_Skill_Action`（[L170040–170072](../../reference/map-6.25/main.disasm#L170040)）；装备自身的资格和顺序照常保留。没有目标的自用法术不能为了方便改成向自身下达目标命令。手动释放可绕过 B012 自动开关，但不能绕过下节施法接受条件。

## 3. 原生查证与 Q24：lizard-frenzy-native-v1

[编辑器元数据 bsk1–3](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/AbilityMetaData.slk#L12130)及 [原字段名](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt#L6335)确认 DataA/B/C 分别控制移动速度、攻击速度和承受伤害增加。[暴雪 Berserk](https://classic.battle.net/war3/orc/units/trollberserker.shtml)说明该模板是自用攻速增益，stock 版本还增加承伤；本图 stock Absk 行（[L9546](../../reference/map-6.25/units_abilitydata.json#L9546)）有 DataA=.2、DataB=.5、DataC=.5、12秒持续、30秒冷却，但这些不能覆盖自定义行。模板名字和原 stock 数据不证明本图缺省 DataA/C 继承为 .2/.5。

[YDWE 数值缺省转换](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/plugin/w3x2lni/script/core/slk/frontend_slk.lua#L19)支持缺省转零的工具处理，但不是匹配 Warcraft 客户端的实测。施法是否瞬发/打断、刷新覆盖、能力移除后的 Buff 生命周期也没有原脚本补充。**Q24 在本组选择如下规则，保留原始值供追溯：**

1. 这是瞬时自用增益，零前摇，不使用三塔单位字段 `castpt=.5` 作为本次等待。施法者必须存在、存活、持有本组有效一级能力、冷却为0、魔法足够，且没有眩晕、暂停、沉默、妖术等禁止主动施法的有效锁。自身无敌/魔免不阻止这项自用能力，不检查敌人、视野、目标范围或敌方法术护盾。施放不打断当前攻击、移动或已进行的吟唱；它本身不另占一段施法阶段。这是本组的 Web 瞬时命令选择，非全部 berserk 能力通则。
2. 成功接受时扣30/40/50魔法、将**该能力**冷却设为10秒、应用 B014，再发一次 SPELL_EFFECT；无目标事件的 targetUnit 为 nil，通用装备回调按原语义处理。失败不扣魔法/开冷却/加 Buff/发 SPELL_EFFECT，但不撤销已经发生的自动扫描跳转。若异常共存多个本组 ID，同一个 `berserk` 命令按 N063→N062→N061 选择第一个满足接受条件者；正常三塔各只有一项。非一级的异常字段不推算成长，拒绝并记录数据问题。
3. B014 向 [attack-timing-v1](attack-timing.md) 登记一份 **+0.2/+0.4/+0.6** 攻速贡献，持续5战斗秒；原始 R 与有效 K 的汇总、上下限及进行中攻击重计时完全沿用该基准，不直接乘基础伤害或把现有总 R 连乘1.2/1.4/1.6。没有移动加成、额外承伤、持续掉血或额外伤害包；这是对 DataA/C 缺省的局部选择。
4. 同一逻辑单位只有一个本组 B014 实例。再次成功施放以最新档位的贡献替换旧贡献，到期改为本次时刻+5秒，不叠加、不取较强值、不累加时长；新实例代号使旧到期回调失效。虽然通常10秒冷却晚于5秒时长，强制重置冷却或能力替换仍须有明确边界。
5. 到期、显式移除 B014、成功驱散正面魔法、死亡或单位移除时撤销这**一份**贡献并使旧到期回调失效，不重置其他攻速/JAPI差额。仅移除 N061/62/63 不立即清掉已生效 B014；重新获得能力不自动加 Buff。替换单位类型若保留同一逻辑单位则保留实例；如果另建逻辑单位，本模块不自动转移。升级流程是否换实体仍由它本身负责。失去施法资格或中途魔免不轮询撤销旧实例。

战斗时间、5秒到期和10秒冷却使用 [B05](web-baseline.md)，存档保留实例代号、金额、到期与冷却，恢复不再次加成/扣蓝。进行中攻速变化交给现有攻击计时基准；不会因施法触发第二次攻击开始事件。三塔 C/P/B 为 `1.2/.5/.56`、`1.1/.5/.56`、`1/.5/.56`（[武器表 L31881 起](../../reference/map-6.25/units_unitweapons.json#L31881)）；没有其他贡献时，三档生效后的攻击间隔分别为1、11/14、5/8秒。这里只是既定公式算例，不是魔兽实测 DPS。

## 4. N159：完整金币记账边界

N159 没有独立 Action；全主程序唯一字面效果是 `anyUnitDamaged` / `main/f291/f1` 的金币尾段。已核 **PC3976–4166**，[L166696–166897](../../reference/map-6.25/main.disasm#L166696)，完整条件、两个早退、金额和漂字调用均与字节码比对。沿用 [完整伤害流程](damage-pipeline.md) 已有公共早退和上游效果：这一段位于活动怪响应之后，重新取一次此刻事件伤害 D；之前的物品、属性、模式及嵌套事件都可能已改变 D。

```text
score = GetEventDamage(0)
if type(T) not in {m999,m998}: continue at PC4167
if IsUnitIllusion(actualSource S): score *= 0.8
if GetUnitAbilityLevel(attributedUnit O,N159)>0: score *= 0.2
if score < 0: return                           // 尚未记账、尚未写D=0
if isPhyDamage(eventDamageType): score *= 0.58
else if isMagicDamage(eventDamageType): score *= 1.4
p = GetPlayerId(GetOwningPlayer(S))+1
Money_Damage_Sum[p] += score                    // 不在这里 floor
EXSetEventDamage(0)
text = tostring(floor(score))
if text == "0": return                        // 已记账、已写D=0
createGoldFloatingText(text,T)
goto PC4229                                   // 跳过非金币的商店Boss分支
```

N159 检查为 **PC4003–4012 / L166724–166735**：读取的是先前按原事件来源规则得到的 **归属 O（r2）**；幻象折算读取实际 S（r0）；金币累计玩家也取实际 S 的拥有者。这三项不能合并为“都看原塔”。只判断等级>0，正等级1/7均只乘一次0.2；不要求 attack 标记，不再抽概率，没有技能自己的模式过滤。普通攻击、物理/魔法/神圣技能包只要到达这个金币分支，都按相应条件处理。

`isPhyDamage` / `isMagicDamage` 完整函数在 [L52118–52182](../../reference/map-6.25/main.disasm#L52118)：NORMAL 才是本脚本的物理；DIVINE 两个判定都为 false；其他 damage type 都归此处魔法。因此**保留20%，即减少80%打金统计输入**，再分别乘0.58或1.4；不是降低普通输出20%，也不是把最终金币金额直接乘0.2。福利结束后的分段奖励/VIP等仍由 [打金结算](waves-and-modes.md#5-福利打金)消费累计值。本标记没有对普通波次、商店 Boss 或深渊 ma01 金币小鸡增加同一项0.2；它们不是 m999/m998。

临时来源如 T039 的 q001，按主流程解析到具有 N159 的塔时同样被减金。q001 本身不是幻象，就不因归属塔是幻象而另外乘0.8；反之，直接幻象来源且归属有 N159 时两项都乘。不能将 q001 改成塔直接发包来“简化”这一差别。归属槽没有对象时不自动修复为实际来源；本分支的空/已移除 O 能力查询在 Q24 中定义为0，只关闭这一项减金，不追溯修改已累计分数，也不替其他 native 读写规定空句柄行为。

N159 自身 AOcr DataA–E 缺省按 Q24 仅为此 ID 选择不增加额外暴击、倍伤、固定加伤、闪避或必中，也不把普通伤害乘成零。原脚本0.2是已证实规则，无需以 Q24 改写；无标记或标记移除后，仅后续金币事件不再乘此项。

**漂字仍有真实随机消费。** 先 floor 只用于显示，累计值保留小数。非零文本的字号/寿命初值 `.03/.6`，字符数>2、>3、>4、>5依次为 `.035/.7`、`.04/.8`、`.045/.9`、`.05/1`；设置非永久，位置为 T 且 Z=-50。再按原顺序抽5次：速度 X=`(3+GetRandomInt(1,60))/1000`，速度 Y=`(20+GetRandomInt(1,35))/1000`，颜色 R/G/B 各 `PercentTo255(GetRandomInt(1,100))`，透明度 `PercentTo255(100)`。即使 Web 关闭漂字渲染，也保留这些已证实调用；不能删掉后再声称后续随机流不变。`score<0` 和 floor 后文本为0的两个早退都不抽这5次。

## 5. 验收与边界

| 输入 | 结果 |
| --- | --- |
| N061，mana=30，冷却=0；mana=29；冷却=微小正数 | 就绪分别 true / false / false |
| N063、N062同时可用 | 就绪短路停在 N063，只发一次 berserk；失败也不继续技能扫描 |
| 有 B014 但冷却重置为0且蓝足够 | 没有“已有 Buff 不释放”的脚本过滤；Web 成功后覆盖刷新 |
| R=2，N062成功施放 | R=2.4，不是2.8；5秒到期仅减回0.4 |
| N063在 t=0成功，t=2强制成功N061 | 贡献从0.6改0.2，到期t=7；旧t=5回调无效 |
| t=1驱散；或死亡；或仅移除主动能力 | 前两者撤销贡献，后一种保持至原到期 |
| 金币目标、D=1000、无幻象、O有N159 | NORMAL记116；MAGIC记280；DIVINE记200；各写事件D=0 |
| 金币目标、D=1000、S为幻象、O有N159 | 对应记92.8 / 224 / 160 |
| q001、O有N159，D=400、MAGIC | 记112；来源玩家仍取q001拥有者；不因O为幻象自动变89.6 |
| 非金币目标D=1000且O有N159 | 本分支不改事件值、不记福利账 |
| 金币分数0.5 | 累计加0.5，事件置0，无漂字/5次抽样；不把累计先截成0 |
| 幻象/N159换算后score<0 | 直接返回，不记账、不写0、不抽漂字随机 |

本批只完整核三个共用 helper，以及自动发令29条、金币分支191条的限定片段，合计 **286条指令、22个条件、48处调用、12条返回**。通过27组就绪、10组分类、16组自动入口、295组金币字节码探针，另有29条来源案例、20条局部 Web 案例。12条对象、5组profile、51行图鉴（含48行N159）、52个N159单位挂载、20个本地链接和源哈希校验通过；MPQ缺失检查有3个有效正对照。

这些检查使用原生桩及局部状态模型，没有运行魔兽客户端。依赖的全主流程和自动调度沿用已有审计，不把重复引用称作重新核完全部函数。原生缺省/接受与 Buff 生命周期已按 Q24 给出上述局部可测试定义；没有扩查 N058–60 闪电链、其他共享N159塔的攻击技能、全部装备施法响应或全局升级/替身流程。来源哈希、条件/返回位置、图鉴挂载全表和MPQ不存在证明见 JSON。
