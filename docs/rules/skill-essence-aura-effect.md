# 精气光环：学习、光环状态与魔法写入

基准 **`essence-aura-effect-v1`** 只闭合 A084 的 `A084_Study`、AHab 对 B083–B088 的授予/失效，以及本技能请求魔法写入后的可见值。Q41 已采用准确 30%，两处入口、5%–30% 恢复比例、原调用次序与 Q29 均见 [概率规格](skill-essence-aura-proc.md)，本页不重做 A083。机器证据和验证见 [skill-essence-aura-effect.json](skill-essence-aura-effect.json)。

原指令、图鉴要求与 Q24 的 Web 原生适配分别记录；没有匹配原客户端运行测试。用户后续全局授权图鉴与脚本数值差异以图鉴为准；下述英雄范围也按图鉴明文确定，不能借此声称原生对象已写了 `hero`。

## 图鉴、对象和 Buff

`塔技能!F397/H397/I397` 的 H026 殁境神蚀者、`F621/H621/I621` 的 G069 黑曜御灵者，都是 A084 精气光环。两行都要求附近友方英雄或自身、900 范围；六级累计自身魔法上限增加 500/1000/1500/2000/2500/3000，成功回蓝比例为最大魔法的 5/10/15/20/25/30%。[实际技能说明 L1231–1242](../../reference/map-6.25/units_campaignabilitystrings.txt#L1231) 与之对应。

| 已证实字段 | 原文件证据 | 边界 |
| --- | --- | --- |
| `code=AHab,levels=6,reqLevel=1` | [abilitydata L15909–15928](../../reference/map-6.25/units_abilitydata.json#L15909)；[原 SLK Y884，L14232–14248](../../reference/map-6.25/units_abilitydata.slk#L14232) | 不是主动下令施法。 |
| Area1…4=900；BuffID1…4=B083…B086 | 同上 | 高等级范围没有独立显式字段；Web 六级 900 有图鉴支持。 |
| 五级 B087、六级 B088 | [w3a abuf，L1626–1645](../../reference/map-6.25/war3map.w3a.json#L1626) | 不是把四级 B086 复用到六级。 |
| targs1…4=`nonancient,invulnerable,self,friend` | 同上 | 没有 `hero`；脚本施法回蓝入口也没有英雄检查。原生此对象是否给非英雄 Buff 未实测，不能把这点隐去。Web 自动授予按图鉴限定英雄/自身。 |
| DataA/DataB、Dur/HeroDur 没有显式值 | 完整 SLK 记录与 A084 的完整 w3a 增量 | 缺项不等于原文件写了 0，也不从普通大法师复制自然回蓝值、扫描周期或残留时间。 |
| B083…B088 分别显示 Lv1…Lv6 | [commonabilitystrings L524–571](../../reference/map-6.25/units_commonabilitystrings.txt#L524)；[buffdata L954–971](../../reference/map-6.25/units_abilitybuffdata.json#L954) | Buff 数据仅 alias；说明是施法有概率回蓝。特效为 GeneralAuraTarget、origin，不带额外数值。 |

[H026 L4618](../../reference/map-6.25/units_unitabilities.json#L4618) 与 [G069 L4396](../../reference/map-6.25/units_unitabilities.json#L4396) 的 `heroAbilList` 均含 A083/A084/A085。这是可学习列表，不代表单位创建时 A084 已学到一级。实际能力等级是发射接口，不能只按这两个单位 ID 做白名单。

## 学习：两个按顺序执行的资源写入

完整 `A084_Study` 为 [main/f73/f1，B76518–76553](../../reference/map-6.25/main.disasm#L76518)，19 条指令；[Lua L47669–47691](../../reference/map-6.25/main.readable.lua#L47669)：

```text
SetUnitState(U, MAX_MANA, GetUnitState(U, MAX_MANA) + 500)
SetUnitState(U, MANA,     GetUnitState(U, MANA) + 500)
```

第二次读取当前魔法发生在第一次设置上限之后。没有查询当前 A084 等级，没有只补缺口的判断，也没有把此前加成删掉再加回。每次实际调用就是一次 +500/+500；正常六次学习累计 +3000。仅进入别人的光环不会调用它，也不会增加上限。

学习事件登记玩家 0、1、2、3 的 `EVENT_PLAYER_HERO_SKILL`，[main/f291/f33，B179562–179626](../../reference/map-6.25/main.disasm#L179562)。`anyUnitLeartSkill` 先读 `GetLearnedSkill/GetLearningUnit`，learner 为 nil 或幻象则 return；[main/f291/f10，PC1–12，B169032–169044](../../reference/map-6.25/main.disasm#L169032)。A084 分支 PC58–66 调 Study 后立即 return，[B169094–169102](../../reference/map-6.25/main.disasm#L169094)。没有额外的原生 HERO、自定义 `UnitIsHero`、存活、满蓝或施法资格门槛。

Web 的学习事务先提交本次实际技能等级，再执行一次已登记的学习回调，接着重算光环；同一事务内不插入施法。直接设置能力等级、读档、重新扫描光环、重建展示和换皮保留等级，不伪造新的学习事件。**这不是给 Study 加去重防护：**若规则真正再次调用 Study，仍再次加 500；存档恢复则恢复已存资源值和已处理事件位置，不能重放已提交回调。能力移除/降级不自动倒扣这段命令已加的资源，除非另一条已核规则明确写资源。

## S292 的相关扣上限指令必须保留

S292 实际名称为“黑曜御灵者（殁境神蚀者）”，[说明 L18303–18316](../../reference/map-6.25/units_campaignabilitystrings.txt#L18303)；它经 S291 技能书选择，[对象 L31215–31240](../../reference/map-6.25/units_abilitydata.json#L31215)。不是重新学习 A084。

在 `AnySkillStart` 中，`Item_Skill_Action`（包括精气回蓝与 Q29）和 `WAbility_initAbility` **先**执行；随后若 `spellId==S292 && GetUnitAbilityLevel(C,A084)>0`，读取实际等级 L 并执行：

```text
SetUnitState(C, MAX_MANA, GetUnitState(C, MAX_MANA) - 250 * L)
```

证据为 [main/f291/f14，PC66–101，B170068–170103](../../reference/map-6.25/main.disasm#L170068)。该分支没有设置当前魔法，没有先验证后面的皮肤转换是否成功，也没有调 Study。后面的通用模型转换还会处理属性、物品和 Acha；S292→k168/R292 的映射见 [Lua L105018–105029](../../reference/map-6.25/main.readable.lua#L105018)，[R292 对象 L29330–29340](../../reference/map-6.25/units_abilitydata.json#L29330) 指向 G069。

因此本模块不得用每次刷新时强行 `bonus=500*level` 的方式抹掉这次显式扣减，也不凭空增加 `+250*level` 补偿。该扣减提交后按下节剪裁当前魔法，后续实际执行的其他资源写入继续生效。原生 Acha 的资源重算未匹配，**不能仅凭这条减法宣称 G069 实际最终只有图鉴一半加成**，也不把它算成已确认的新图鉴矛盾。完整换皮后的资源合成属于模型转换适配；本页给出的算例只覆盖此分支的即时可见结果，不把它冒充转换完成总值。

## 一手依据与明确未证明的原生部分

Blizzard 的 [Spell Basics](https://classic.battle.net/war3/basics/spellbasics.shtml) 支持自身受益、同一光环不叠加、光环有脉冲、友方魔免可受益、隐身源不发射；它没有给出本自定义 AHab 的准确扫描、等级覆盖或残留时间。[大法师说明](https://classic.battle.net/war3/human/units/archmage.shtml) 的普通 Brilliance 数值不能代填本图 A084。

[YDWE AbilityMetaData 的 Hab1/Hab2](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/AbilityMetaData.slk#L1536) 和 [编辑器字段名 L5880](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt#L5880) 可解释 DataA/B 的自然回蓝数值/百分比开关，不能证明 A084 缺项在运行时的最终默认值。[其 MiscGame L26–32](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/MiscGame.txt#L26) 给出幻象、隐身、变羊、钻地、复生尸体及飞行英雄的光环发射开关；本图 Misc 没有这些覆盖。下节独立选定它们作为 A084 的 Web 行为，不是从 A018/I230 的规格直接继承。

[YDWE UnitState.cpp L405–450](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Plugin/Warcraft3/yd_jass_api/UnitState.cpp#L405) 对最大魔法写底层字段，当前魔法则落回原生 `SetUnitState`。该源码本段没有提供当前魔法的完整裁剪实现；也不能证明本图使用的二进制与该提交匹配。所以最大值改变时保绝对量还是比例、越界请求何时裁剪，下面明确按 Q24 定案，而不标注原版实测。

## `essence-aura-effect-v1` 的 Web 适配

### 自动授予与叠加

1. 发射源必须存在、存活、未隐藏，实际 A084 等级为 1–6 且能力启用。等级 0/缺失不发射，非法正等级报内容错误。幻象、隐身/影遁、变羊/妖术、钻地、复生尸体、正在飞行的原生英雄不发射；普通眩晕、沉默、单位暂停不自行关闭被动。全局暂停停止模拟时间。
2. 接收者必须存在、存活、未隐藏、非 ancient，为同所有者或源所有者对接收者所有者的友方，且满足**原生 HERO 或接收者就是发射源**。这里不用地图自定义 `UnitIsHero`（N534 与 SAPPER 谓词）。地面/空中、无敌/可伤、魔免、虚无、隐身不额外排除合格英雄。幻象可以接收，但必须具有本次实际建立的原生 HERO 属性；不从名称推断。
3. 使用二维中心点闭圆 `dx²+dy² <= 900²`，恰在 900 生效；不加 collision，不检查视野或路径。没有魔法池的合格接收者仍可有 Buff，但本技能不为接收者凭空造魔法池。
4. 每个接收者的**自动光环贡献**只选最高 A084 等级，来源并列用最小稳定创建序号作记录。只授予其对应的一个 B083…B088；较低源保留为候选，最高源失效时回退。既不按源数量加回蓝概率，也不把 5%+30% 相加。不同 AHab 能力 A018/I230 不与本组互斥；它们的回复通道保持自身规格。
5. 自动光环不额外提供自然回蓝、不增加接收者最大魔法、不产生 SPELL_EFFECT，不消费 RNG。这是根据本技能明确描述所作的 Q24 补缺；**不是称缺失 DataA 的原文件值为 0**。

此英雄门槛只控制自动光环授予。若其他明确规则向非英雄放入 B083…B088，或 A083 路径直接调用 helper，仍按 [既有两处入口](skill-essence-aura-proc.md) 和实际 Buff 集合执行；本页不偷偷给 helper 加 HERO、A084、满蓝或存活检查。外部明确施加的 Buff 与自动贡献分别记来源；重算本组不删除外部贡献，helper仍按B088→B083取第一个正等级。

### 失效与事件次序

Q24 选择**即时重算、零残留**。获得/移除/启停 A084、等级更新、移动、所有权/联盟变化、上述源/受体资格变化、死亡/删除/复活或转换完成时，在该状态提交点重算自动候选；下一个可观察操作读取新 Buff。无周期 timer、无独立零秒回调、无额外随机数。

- 源消失或离开范围立即移除其贡献；其他合格源存在时同次重算回退，不能粗暴清空全组。自身 A084 未学但附近有合格源时仍能受益。
- 受体死亡/删除/隐藏立即清除本组自动贡献；复活/重新显示重新判资格，不携带旧残留。已经执行的 Study 资源写入不因此倒扣。
- 普通驱散不关闭 universal 光环。若明确脚本按 rawcode 移除本组 Buff，该移除先执行，然后同一操作按仍存在的源重算自动贡献；没有源则保持无 Buff。移除外部贡献不令该贡献自行复活。
- 两个同刻操作按 B05 入队顺序。若先越界再施法，则施法入口无自动 Buff、不抽 A084；若先施法再越界，则本次已到达的 helper 正常抽样。全局暂停期间不推进两者。
- 换皮保留同一实体的实际已学等级，不造第二个发射源、不调用 Study；仅在转换状态提交后重算。完整转换对基础资源的其他影响沿转换模块，不以本页替代。

### 本技能的魔法写入

本页为 Study、回蓝 helper 与上面的 S292 扣减确定以下**局部 Q24 适配**：

```text
setMaxMana(request):
    maxMana = max(0, request)
    mana = clamp(mana, 0, maxMana)       # 保当前绝对量，不按百分比补蓝
setMana(request):
    mana = clamp(request, 0, maxMana)    # 提交时立即可见，不延迟到下一帧
```

数值保留小数，不向整数取整；溢出不存储、不转护盾、不生成额外施法/伤害/回蓝触发。非法非有限请求是内容错误，不能静默当 0。有效但已死亡的实体仍按已有资源字段处理，不替 helper 添活体门槛；对本页资源接口，Q24 局部选择 nil/已删除句柄读 0、写入无效果，不重新创建单位。此选择不宣称已有覆盖全部原生接口的全局句柄规范。

正常 Study 从 `max=1000,mana=100` 得 `max=1500,mana=600`；从满蓝1000/1000得1500/1500。它确实同时增加上限和当前量，不只是按新上限保百分比。最高级回蓝从 `max=1000,mana=950` 请求1250，实际提交1000；Q29随后看到1000，不看到1250。满蓝时仍走原资格和Q41抽样，没有省略这次随机数。最大魔法改变后 helper读新值，例如max从1000变1200、mana=100且B088成功，提交460。

S292 分支若执行时 L=6、max=4000、mana=3800，则该条减法后立即为2500/2500；后面的模型转换尚未计入此例。反复真正执行此已核分支会反复扣减，原指令没有“只扣一次”的标志；不能为方便保存而添加隐式去重，也不能仅凭这点认定玩家正常能重复使用已消失的皮肤技能。

## 验证与范围

机器表收录完整 Study、学习事件分派的相关前缀、完整事件注册、S292 直接分支与原回蓝 helper，并枚举学习、nil/幻象早退、上限先写、重复实际调用、六次学习、回蓝溢出、S292裁剪、范围边缘、等级覆盖/回退、源失效/恢复、原生 HERO 与自定义谓词的区别、同刻先后以及存档不重放。Q41另外以调整抽样范围/比较值的字节码副本验证100个结果和16个入口边界；原零常量仍保留给ratio=0与Buff>0判断，不能全局替换共享常量。

这些是指令/适配验证，不是原客户端或 Web 游戏运行测试。原生扫描节奏、AHab默认自然回蓝、隐含受体筛选、资源底层裁剪仍未声称还原；本页已给明确的Web取值与生命周期。A083完整效果、全部幻象复制系统、完整Acha资源转换及其他技能的SetUnitState语义不在本次覆盖。
