# 精气光环：A084概率与两处回蓝入口

**Q41已确认：Web采用图鉴准确30%。原脚本4/11≈36.3636%保留为来源证据。** 本页仅记录A084回蓝helper、两处实际调用及B083–B088资格，保持既有Q29、两个入口资格与调用顺序。机器证据见 [skill-essence-aura-proc.json](skill-essence-aura-proc.json)。

## 身份核对与真实差异

| 图鉴位置 | 角色 | 能力 | 触发概率与恢复比例 |
| --- | --- | --- | --- |
| 塔技能!F397／I397 | H026 殁境神蚀者<SR> | A084 精气光环 | 六级均30%触发；分别恢复最大魔法5/10/15/20/25/30% |
| 塔技能!F621／I621 | G069 黑曜御灵者<SR> | A084 精气光环 | 与上行一致 |

H397/H621是技能泛述与900范围；明确概率在I列六级说明。原图[Name／Researchubertip／Ubertip，L1231–1242](../../reference/map-6.25/units_campaignabilitystrings.txt#L1231)与之对应，实际Ubertip六级均写30%。**5%–30%是恢复最大魔法的比例，不是随等级变化的触发率。** 本题没有40%的来源值。

完整 `A084_Action` 是 [main/f73/f0，B76378–76516](../../reference/map-6.25/main.disasm#L76378)，[Lua L47573–47665](../../reference/map-6.25/main.readable.lua#L47573)。PC1–7的字节码为：

```text
r = GetRandomInt(0, 10)
if r > 3: return
```

[B76418–76424](../../reference/map-6.25/main.disasm#L76418)加载0、10，比较指令为 `lt 0 k0 r1`，k0=3；成功进入后续仅r=0、1、2、3，失败r=4…10。因此在既定两端包含的整数接口下为4/11，不是3/10，也不是4/10。完整helper没有根据技能等级、模式、幻象或神杖改变概率的分支。

**Q41用户选择1，采用准确30%。** Web在**同一helper调用点**抽均匀整数1–100，`roll<=30`成功；1–30成功，31–100失败。每次原本到达helper的调用仍消费一次本项随机数，不将随机抽样移到入口外，也不复用Q29细雪的抽样。原0–10、<=3仅作证据；两个入口的不同资格、回蓝比例和执行顺序均不变。

## Helper成功后做什么

随机通过后，才检查参数单位U身上的Buff能力，按以下优先级取**第一个正等级**，没有将多个光环比例相加：

| 顺序 | 当前能力 | 恢复比例 | 原生光环等级来源 |
| --- | --- | ---: | --- |
| 1 | B088 | 0.30 | A084六级w3a abuf |
| 2 | B087 | 0.25 | A084五级w3a abuf |
| 3 | B086 | 0.20 | A084四级SLK BuffID4 |
| 4 | B085 | 0.15 | A084三级SLK BuffID3 |
| 5 | B084 | 0.10 | A084二级SLK BuffID2 |
| 6 | B083 | 0.05 | A084一级SLK BuffID1 |

关键查值/分支为PC9–67，[B76427–76490](../../reference/map-6.25/main.disasm#L76427)。全部不存在时，局部ratio保留源码显式初始化值0；这不是给缺失配置补0。Buff等级只检查>0，不将其数值乘到比例上；读取的是受益单位U的实际Buff，不是找光环持有者的A084等级。

随后若 `TxShow==true`，先调用 `CreateEffByUnit(ReplenishManaCasterOverhead.mdl,U,"overhead",1)`；再读取U的**当时最大魔法与当前魔法**，请求 `SetUnitState(U,MANA,maxMana*ratio+currentMana)`，[PC68–91，B76492–76516](../../reference/map-6.25/main.disasm#L76492)。没有将当前事件伤害、耗蓝量或施法前魔法代入公式。没有最大魔法/当前魔法门槛、额外冷却、死亡检查或自己不回蓝的限制；关闭特效不关闭回蓝。1秒仅为特效时长。

本页记录SetUnitState的请求值，不冒充原生超上限裁剪实测；[效果适配](skill-essence-aura-effect.md)已选Web提交时裁剪到[0,maxMana]，后续细雪读取该实际可见值。若没有Buff但从另一入口调用且随机成功，仍可能播放特效并请求写回当前魔法同值。

## 入口一：技能生效，先回蓝再细雪

此链沿用[细雪已核入口](item-muramasa-takemitsu.md)，本次再次对照关键字节码：

1. `EVENT_PLAYER_UNIT_SPELL_EFFECT`登记到 `AnySkillStart`，玩家0、1、2、3、11：[main/f291/f35，B179727–179797](../../reference/map-6.25/main.disasm#L179727)。不是下令或施法结束事件。
2. `AnySkillStart`在可能执行变身保持处理后，遇 `IsTemp(C)`，或技能ID为T033/A040/A070/A210则return；其余调用 `Item_Skill_Action`。[main/f291/f14，B169999–170072](../../reference/map-6.25/main.disasm#L169999)。Player(11)的前段判断不等于统一排除该玩家。
3. `Item_Skill_Action`读取实际施法者C与技能ID，依次检查 `IsWorker(C)`、`IsBOX(C)`、`IsUseless(abilityId)`，任一真return。[main/f285/f16，PC1–22，B146490–146512](../../reference/map-6.25/main.disasm#L146490)。本段无额外原生英雄/幻象门槛，不把C替换为归属塔。
4. PC23–70按B083→B088查询，任一>0则PC71–73调用**一次** `A084_Action(C)`；全无则不调用、不消耗A084抽样。[B146514–146565](../../reference/map-6.25/main.disasm#L146514)。门槛的低级优先短路只用于是否调用；helper自身再按高级优先选回蓝比例。
5. PC74–89才检查i134、调用已决Q29的细雪概率与效果。[B146567–146582](../../reference/map-6.25/main.disasm#L146567)。A084不依赖持有i134；满魔法也不跳过其抽样。没有统一“整次施法只抽一次”的共享随机值。

`IsUseless`仍为30个技能ID名单，不改成“冷却=0就排除”：

```text
A000 A075 A083 A164 I001 I002 I167 I168 I204 I205
I206 I207 I210 I211 I219 I220 I233 I243 I245 I248
I266 I267 I274 N000 T329 A226 A227 A228 A229 I270
```

名单初始化[main/f7，B50036–50128](../../reference/map-6.25/main.disasm#L50036)，匹配函数[main/f7/f16，B51305–51331](../../reference/map-6.25/main.disasm#L51305)。工人/箱子/临时类型名单沿用细雪证据，不能通过角色名或是否看起来是英雄猜测。

## 入口二：A083攻击路径，没有前置光环Buff检查

[main/f291/f1，PC590–617，B163113–163140](../../reference/map-6.25/main.disasm#L163113)要求：

```text
GetUnitAbilityLevel(S,A083) > 0
AND EXGetEventDamageData(2) != 0
AND GetUnitAbilityLevel(T,Bpsd) > 0
```

满足后先 `A083_Action(S,T)`，再 `A084_Action(S)`，然后继续主伤害分派。S是实际伤害来源，T是当前受击目标。**此处没有先检查A084或B083–B088，也没有本段非幻象门槛。** 因而源身上没有光环Buff时也可能调用helper、消耗概率；通过随机后ratio=0的行为必须保留。不能把施法入口的“无Buff不抽样”泛化到所有入口。

该段仍受[伤害主流程](damage-pipeline.md)的初始D==0 return、q039跳过主体以及B177攻击早退等更早控制流影响；后来某分支把D写0，不额外制造这里未写的统一return。`A083_Action`若修改魔法或Buff，A084随后读修改后的状态；本页不递归展开A083自身。

原脚本只有这两处直接 `A084_Action`调用。A083在IsUseless名单里，因此其技能生效事件不会再从入口一获得这次A084调用；不能据两处源码位置就断言每发A083固定抽两次。原生事件是否额外生成、完整A083施法周期另属后续模块。

## Buff资格的证据与未扩展范围

后续[精气光环效果基准](skill-essence-aura-effect.md)已明确学习、自动Buff状态及本技能魔法裁剪；下文保留本概率批次的范围，完整A083、幻象复制和换皮资源合成仍另核。

A084为 `code=AHab`，SLK首四级Area=900，BuffID为B083…B086，[L15909–15928](../../reference/map-6.25/units_abilitydata.json#L15909)；w3a给五/六级分别配置B087/B088，[L1626–1645](../../reference/map-6.25/war3map.w3a.json#L1626)。Buff说明分别为“精气光环Lv1…Lv6”，[commonabilitystrings L524–571](../../reference/map-6.25/units_commonabilitystrings.txt#L524)。这证明Buff身份与回蓝等级对应，不证明六个Buff一定同时存在。

概率helper只看调用当下实际Buff集合。[独立效果基准essence-aura-effect-v1](skill-essence-aura-effect.md)已确定Web自动Buff授予/失效、等级覆盖、即时重算、英雄/非远古筛选、学习增长与本技能魔法裁剪；原生客户端这些底层行为仍未实测。不能只凭位置在900内就绕过其资格判定，也不把A084_Study的上限增长用于改写触发概率或额外抽样。完整A083与全局幻象复制仍不在此两份规格范围。

## 验证和交接

完整helper91条指令，涵盖概率早退、六个Buff优先级、特效开关和魔法写入。机器表保留施法入口至细雪后的89条指令、A083路径28条指令及AnySkillStart的前置入口片段，区分完整函数和局部覆盖。

使用原字节码加native桩枚举64种Buff集合、11个随机结果与两种TxShow状态，共1408个helper场景；另验证施法入口64场景、A083入口17场景（含前一个回调改变魔法的顺序例）。检查全部0/3/4/10边界、多Buff取高级、无Buff两入口不同抽样行为，以及回蓝先于Q29细雪。验证不是客户端运行。

Q41已确认准确30%，另枚举全部100个Web结果，并验证1/30/31/100在两个入口有/无Buff时的16个边界场景。无Buff的施法入口不抽，A083攻击入口仍抽且成功时按原ratio=0写回同值；Q29保持其自己的后续抽样。本页不修改原图、图鉴、已决Q29、原有秒杀概率或其他技能文档。
