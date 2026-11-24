# 山崩：临时施法能力等级与六级成长（Q40 已确认）

后续更新：T059/T162的目标、命中时序和控制接口现已在[山崩原生Web基准](avalanche-native-effect.md)明确。下文本批边界保留用于追溯，不表示这些接口当前仍无实现规格；A067/A148外壳与完整换皮等仍另核。

**已确认原调用始终把 T059/T162 设置为一级，未把英雄的山崩等级传入实际能力等级。** 图鉴与两项原生能力的数据都存在六级伤害／眩晕成长；已排查当前业务脚本的等级和字段写入，没有发现补偿。**Q40 已选图鉴六级成长，范围保持300，Q39的2秒共享冷却不变。** 原固定一级仅保留为来源证据。机器证据见 [skill-avalanche-effect.json](skill-avalanche-effect.json)。

本页只闭合等级传递及补偿排查，**不把 ANcs 的 DataA 直接宣称为原版整次实测总伤害**。此前 [Q39 的2秒共享内置冷却](skill-avalanche-proc.md) 保持有效，概率量化也不与本题捆绑。

## 图鉴、能力身份与等级表

图鉴 `塔技能!F270/F426=A067`，分别是 H021 小小<SR>、G059 火焰领主<SR>；G270/G426 都为6级。**I270/I426** 的六级表如下，H270/H426 的范围始终是300：

| 等级 | 图鉴伤害 | 图鉴眩晕（秒） | T059/T162 的 DataA | 普通 Dur | HeroDur |
|---|---:|---:|---:|---:|---:|
| 1 | 150 | 0.4 | 150 | 0.4 | 0.1 |
| 2 | 275 | 0.6 | 275 | 0.6 | 0.3 |
| 3 | 420 | 0.8 | 420 | 0.8 | 0.4 |
| 4 | 650 | 1 | 650 | 1 | 0.5 |
| 5 | 860 | 1.2 | 860 | 1.2 | 0.6 |
| 6 | 1120 | 1.5 | 1120 | 1.5 | 0.8 |

字段来源：T059 [SLK原行 L29718](../../reference/map-6.25/units_abilitydata.slk#L29718)、[JSON L33503](../../reference/map-6.25/units_abilitydata.json#L33503)，T162 [SLK L31621](../../reference/map-6.25/units_abilitydata.slk#L31621)、[JSON L35608](../../reference/map-6.25/units_abilitydata.json#L35608)。SLK 显式写了1–4级，`levels=6`；**5–6级不是缺省**，由 [T059 的 w3a L6932](../../reference/map-6.25/war3map.w3a.json#L6932)、[T162 的 w3a L9996](../../reference/map-6.25/war3map.w3a.json#L9996) 补入 `Ncs1/adur/ahdu`。表内1.2、0.6、0.8是便于阅读的十进制值，JSON保留二进制浮点原值。

A067/A148 的实际主技能 Name、Researchubertip、六级 Ubertip 已在 [入口文档](skill-avalanche-proc.md) 严格对齐。A148 是换皮关联的同名“山崩”，图鉴 F 列没有独立 A148 行；不是借用另一个名称相近的技能。实际临时能力的名称分别为 [T059“马甲-山崩”L20021–20036](../../reference/map-6.25/units_campaignabilitystrings.txt#L20021)、[T162“马甲-山崩-火焰领主”L21325–21340](../../reference/map-6.25/units_campaignabilitystrings.txt#L21325)，均 `code=ANcs`、命令 `clusterrockets`。它们的内部 Ubertip 残留35/65/100的火箭群模板，不能替代主技能的图鉴或六级数值。

字段解释可复核 YDWE 开发者固定提交的 [AbilityMetaData L15164 起](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/AbilityMetaData.slk#L15164)：`Ncs1…6` 对应 DataA…F。其 [编辑器字段标签 L6476–6481](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt#L6476)依次是伤害量、伤害间隔、弹体数、最大伤害、建筑伤害系数、效果持续时间；[L5838–5839](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt#L5838)区分普通与英雄持续时间。此元数据支持字段含义及物编映射，**不是本图匹配版本的引擎实现或实测**。

## 等级实际去了哪里

`A067_Action` 的完整 `main/f59/f1` 已保存于 JSON。对 G059，先查询 A148 等级并选 T162；其他来源查询 A067 等级并选 T059。接下来 [字节码 L71941–71952](../../reference/map-6.25/main.disasm#L71941) 的参数是：

```text
CreateTempAndSetAbilityLv(owner, sourceLoc, queriedRank, dummyAbilityId, 1, 3)
                                           第3参朝向             第5参等级
```

这不是根据反编译变量名猜测：[完整 helper main/f7/f20，L51457–51510](../../reference/map-6.25/main.disasm#L51457)，对应 [Lua L31454–31490](../../reference/map-6.25/main.readable.lua#L31454)，清楚执行：

```text
unitId = optionalUnitId or "q001"
dummy = CreateUnitAtLoc(owner, GetId(unitId), location, facing)
UnitAddAbility(dummy, GetId(abilityId))
SetUnitAbilityLevel(dummy, GetId(abilityId), abilityLevel)
UnitApplyTimedLife(dummy, GetId("BHwe"), timedLifeSeconds)
return dummy
```

所以六级查询值会改变临时单位朝向1–6度，**实际技能等级仍是1，存活时间3秒**。q001 的默认能力只有 Avul/Aloc，见 [单位挂载 L6555](../../reference/map-6.25/units_unitabilities.json#L6555)。Action 随后发出一次地点命令、写入归属塔索引、处理位置和冷却；没有第二次设级，没有把等级交给延迟伤害回调，也没有保存该等级供其他山崩回调读取。发令返回值不作为继续执行的条件。

六级对象数据因此存在却未被此路径选取。精确结论是“原执行一直使用一级参数配置”；尚不能据此写成“整次必定造成150伤害／每个目标最终控制恰好0.4秒”，后者仍涉及 ANcs 的原生分波、目标类型、免疫与减免。

## 全局补偿排查

本轮不只搜索了 T059/T162 字面量，还枚举业务 Lua 中 **82处 `SetUnitAbilityLevel` 取用及2处 `EXSetAbilityDataReal`**，检查动态ID的来源。所有位置及片段保存在 JSON：

| 动态写入路径 | 可达ID范围／来源 | 是否恢复山崩等级 |
|---|---|---|
| 通用临时单位 helper | 调用者传入ID与等级 | 山崩此调用明确传1，见上文 |
| A112 的计数增益 | T121/T122/T123；Lua L50528–50542 | 否 |
| A134 的决斗增益 | T149–T153；L53641–53800 | 否 |
| A164 的偷取表 | `Monster_Skill_Arr`，L110105–110346；写入L55787 | 表中没有T059/T162 |
| A174 的私有临时能力表 | T190–T195，L59858–59927 | 否 |
| A225 的重设 | A226–A229，L68540–68574 | 否 |
| i258 两个大小写模块 | P201–P222、关联T125–T128；L77341–77476、L78808–78823及对应副本 | 否 |
| 通用开局天赋 | P001–P013；L115357–115410 | 否 |
| 波次生成与工人 | N50x；W012–W019 | 否 |

其余等级写入的ID为明确字面量，均非T059/T162。两处实数字段写入都获取 **A224 自己的 T286**，设置字段102/103；已核 [main/f161/f0，L108322–108344](../../reference/map-6.25/main.disasm#L108322)，不是山崩。`EXSetAbilityState` 是冷却状态写入；没有找到山崩的伤害／持续时间字段改写。常规 Swapped/Inc/Dec 包装只在标准函数层定义，未被当前业务代码用来给山崩升级；JASS中的 `DzSetMemory` 仅为原生声明。

反汇编中 T059/T162 常量均只出现于 `main/f59/f1`；脚本与对象表也没有其十进制rawcode的隐藏字面量引用。q001 与塔的 UserData 归属仍经过 [既有伤害分派流程](damage-pipeline.md)；通用装备、三围、模式修正不被本页取消，但未找到按 A067/A148 等级恢复伤害或眩晕成长的分支。**没有恢复“选取高级山崩参数”的补偿**，不等于所有目标最终伤害相同。

以上是现有持久化脚本和对象表范围的静态排查，不声称证明未取得的客户端二进制没有任何特殊行为。

## Q40 及本批停止边界

Q40 的两个来源方向如下，**用户已选择第一项**：

- **按图鉴成长**：六级使用150/275/420/650/860/1120的伤害定义与0.4/0.6/0.8/1/1.2/1.5秒眩晕定义，保留300范围及Q39已选2秒共享冷却。
- **保留原一级配置**：继续固定T059/T162一级；原生整次总伤害和分波行为仍不能冒称已实测。

已选择图鉴成长，不能只把 `SetUnitAbilityLevel` 改成高等级就声称完成：**原表 Area1=300、Area2–4=200，5–6未显式写Area**。当前固定一级取300，与图鉴范围一致；这是修复成长时需保留图鉴300的约束，不另造一个当前已遇到的范围冲突。

仍待原生范围闭合的部分是 ANcs 伤害间隔0.25、弹体数12、最大伤害1000000、效果持续1.01之间的实际分波关系、整次伤害、持续／刷新及原生目标筛选。本页列出输入，没有把它们相乘来伪造总伤害，也未将普通 Dur 自动覆盖到原生英雄或抗性单位。这些原生细节没有被宣称已验证；Web关于整次伤害的局部选择如下。本批不重新选择概率或冷却。

## 局部 Web 基准：avalanche-rank-profile-v1

依据 Q40、Q39 与 Q24，Web 在攻击触发山崩的效果结算层采用以下确定定义：

- 一次成功触发，对每个合资格目标只产生**一笔逻辑上的名义法术伤害**，按六级表取150/275/420/650/860/1120；这是该目标整次山崩的名义伤害，不再乘12枚弹体、0.25间隔或1.01秒。实际扣血仍经过既有公共伤害流程。
- 普通目标在效果结算时施加一次对应等级的眩晕，持续0.4/0.6/0.8/1/1.2/1.5秒；不借此无声覆盖另行存在的原生HERO或抗性规则。
- 圆心取本次Action记录的目标位置，范围固定300；所有级别共用Q39确认的2秒锁。高级原表的200范围不进入这一Web配置。

**整次一笔名义伤害是明确的局部Web选择，不能称作ANcs原版实测。** 此等级配置接口接收“合资格目标”和“效果结算时刻”；完整原生目标筛选、命中时序、HERO/抗性控制规则尚未由本批闭合。源ANcs可能的多包原行为继续留作未知，不能用于追加Web伤害。该基准不被推广到其他火箭群技能。

## 验证

对完整 caller/helper 字节码进行参数传递探针，分别让 A067/H021、A148/G059 的等级为1–6，检查实际创建的q001、朝向、添加能力、设级1、存活3秒与发令顺序；另核两个ID同时存在、读得等级0及命令返回false的边界。24个caller→helper状态、4个合成别名边界、12条对象等级记录、84处写入位置与20个动态ID位置均已通过校验；145条源指令、所有哈希与6级Web配置也已独立核验。具体结果记录在JSON；原生函数使用替身，验证的是脚本参数，不是原版施法结果。
