# AOcr 家族：53 个图鉴 ID 的分类与原生暴击基准

本页动态取覆盖索引中 `source_located_only && ability.code==AOcr` 的 **53 个 ID**，逐项合并 SLK、w3a、图鉴 F/H/I 列和实际能力说明，并查询挂载、精确 ID/FourCC 引用及通用增删路径。机器表 [native-critical-family.json](native-critical-family.json) 保留每个 ID 的来源、全部图鉴角色/行、各级显式字段及剩余项。**完成的是这一组分类和限定原生组件；不是 53 个完整技能全部完成。**

结果为：20 个真实原生暴击，17 个脚本标记，16 个说明占位。53 个所选 ID 本身均没有显式 DataC/D/E 固定奖励、闪避或必中数值；不能看到 `AOcr` 就附赠剑圣模板的 15% 暴击，也不能因字段缺省把攻击伤害乘 0。33 个标记不贡献原生暴击，但其关联的脚本、武器或另一能力仍可能生效。

两处直接关联数值差异按用户的全局图鉴优先策略处理，无须新编号或再次许可：A045 读取 A044 的合法等级暴击概率采用准确半概率；P000 在原伤害位置改为 ×1.4。原字段、原字节码和异常边界均保留。

## 1. 20 个原生暴击：已合并的可执行参数

表中“等级”指实际能力等级；N 系均只有 1 级，名字相邻不表示同一能力升级。所有概率/倍率都与图鉴及实际 **Ubertip** 一致。A035/A044 第 5、6 级来自 w3a 的 Ocr1/Ocr2 增量；3.799999952 的 float32 表示按图鉴十进制 3.8 处理，不制造设计冲突。

| ID | 图鉴角色 / 塔技能行 | 概率（%） | 总伤害倍率 | SLK JSON / 实际 Ubertip |
|---|---|---|---|---|
| A035 | 冥魂将军<SSR>、骷髅王<SSR> / 11、131 | 10/12/14/16/18/21 | 1.5/2/2.5/3/4.5/5 | [L14480](../../reference/map-6.25/units_abilitydata.json#L14480) / [L470](../../reference/map-6.25/units_campaignabilitystrings.txt#L470) |
| A044 | 克劳德<SR>、剑圣<SR>、因陀罗<SR> / 161、196、241 | 20/24/28/32/36/40 | 2.3/2.6/2.9/3.2/3.5/3.8 | [L14674](../../reference/map-6.25/units_abilitydata.json#L14674) / [L604](../../reference/map-6.25/units_campaignabilitystrings.txt#L604) |
| N027 | 天灾防御塔Lv2<R>、恐怖之狼Lv2<N> / 714、812 | 20 | 1.5 | [L24474](../../reference/map-6.25/units_abilitydata.json#L24474) / [L13255](../../reference/map-6.25/units_campaignabilitystrings.txt#L13255) |
| N028 | 天灾防御塔Lv3<R>、恐怖之狼Lv3<N> / 716、814 | 20 | 1.9 | [L24487](../../reference/map-6.25/units_abilitydata.json#L24487) / [L13267](../../reference/map-6.25/units_campaignabilitystrings.txt#L13267) |
| N029 | 恐怖之狼Lv4<N> / 816 | 20 | 2.3 | [L24500](../../reference/map-6.25/units_abilitydata.json#L24500) / [L13279](../../reference/map-6.25/units_campaignabilitystrings.txt#L13279) |
| N030 | 天灾防御塔Max<R> / 718 | 20 | 2.8 | [L24513](../../reference/map-6.25/units_abilitydata.json#L24513) / [L13291](../../reference/map-6.25/units_campaignabilitystrings.txt#L13291) |
| N072 | 恐怖之狼Max<R> / 719 | 20 | 8 | [L25123](../../reference/map-6.25/units_abilitydata.json#L25123) / [L13821](../../reference/map-6.25/units_campaignabilitystrings.txt#L13821) |
| N096 | 骷髅战士Lv1<N> / 876 | 20 | 1.2 | [L25521](../../reference/map-6.25/units_abilitydata.json#L25521) / [L14118](../../reference/map-6.25/units_campaignabilitystrings.txt#L14118) |
| N097 | 骷髅战士Lv2<N> / 877 | 20 | 1.4 | [L25534](../../reference/map-6.25/units_abilitydata.json#L25534) / [L14130](../../reference/map-6.25/units_campaignabilitystrings.txt#L14130) |
| N098 | 骷髅战士Lv3<N> / 878 | 20 | 1.6 | [L25547](../../reference/map-6.25/units_abilitydata.json#L25547) / [L14142](../../reference/map-6.25/units_campaignabilitystrings.txt#L14142) |
| N099 | 骷髅战士Lv4<N> / 879 | 20 | 1.8 | [L25560](../../reference/map-6.25/units_abilitydata.json#L25560) / [L14154](../../reference/map-6.25/units_campaignabilitystrings.txt#L14154) |
| N100 | 骷髅战士Lv5<N> / 880 | 20 | 2 | [L25573](../../reference/map-6.25/units_abilitydata.json#L25573) / [L14166](../../reference/map-6.25/units_campaignabilitystrings.txt#L14166) |
| N101 | 骷髅战士Lv6<N> / 881 | 20 | 2.3 | [L25586](../../reference/map-6.25/units_abilitydata.json#L25586) / [L14178](../../reference/map-6.25/units_campaignabilitystrings.txt#L14178) |
| N102 | 骷髅战士Max<N> / 882 | 20 | 2.6 | [L25599](../../reference/map-6.25/units_abilitydata.json#L25599) / [L14190](../../reference/map-6.25/units_campaignabilitystrings.txt#L14190) |
| N713 | 狼人<SR> / 465 | 15 | 4.5 | [L28073](../../reference/map-6.25/units_abilitydata.json#L28073) / [L15910](../../reference/map-6.25/units_campaignabilitystrings.txt#L15910) |
| N714 | 狼人<SR> / 470 | 20 | 4.5 | [L28086](../../reference/map-6.25/units_abilitydata.json#L28086) / [L15922](../../reference/map-6.25/units_campaignabilitystrings.txt#L15922) |
| N715 | 狼人<SR> / 475 | 25 | 4.5 | [L28099](../../reference/map-6.25/units_abilitydata.json#L28099) / [L15934](../../reference/map-6.25/units_campaignabilitystrings.txt#L15934) |
| N716 | 狼人<SR> / 480 | 30 | 4.5 | [L28112](../../reference/map-6.25/units_abilitydata.json#L28112) / [L15946](../../reference/map-6.25/units_campaignabilitystrings.txt#L15946) |
| N717 | 狼人<SR> / 485 | 35 | 4.5 | [L28125](../../reference/map-6.25/units_abilitydata.json#L28125) / [L15958](../../reference/map-6.25/units_campaignabilitystrings.txt#L15958) |
| N718 | 狼人<SR> / 490 | 40 | 4.5 | [L28138](../../reference/map-6.25/units_abilitydata.json#L28138) / [L15970](../../reference/map-6.25/units_campaignabilitystrings.txt#L15970) |

A035 对应 G046/H010，A044 对应 G040/H013/G041，均位于 `heroAbilList`，需要实际学习；不能创建即当 6 级。18 个 N 系能力位于相应单位 `abilList`，为固有 1 级。全部 169 个承载本组任一 ID 的单位均核过 w3u：没有 `uabi/uhab` 增量覆写这些列表。每个挂载位置保存在机器表 `entries[].mounts`。

N 系很多 **Researchubertip** 仍是剑圣 15%、2/3/4 倍模板，而它们是固有 1 级能力；图鉴、实际 Ubertip 和显式字段三者一致。模板残留已保留为来源，不用于推翻表中参数，也不假称图鉴写了模板数值。

## 2. 查过的动态挂载和修改

| 路径 | 已核事实 / 本页边界 |
|---|---|
| 原生学习 | `anyUnitLeartSkill` 完整函数 [main/f291/f10，L168967](../../reference/map-6.25/main.disasm#L168967)。A035/A044 不命中特殊学习回调；这是普通学习后保留实际等级，不是没有技能。P000 有专用 P200 添加分支。|
| 建造 / 升级 | [main/f291/f7，L167771](../../reference/map-6.25/main.disasm#L167771) 登记塔、处理 T033/N032、补蓝，英雄/n208 的动态随机 ID 为 P001–P013；不与本页 20 个暴击或 P000 混同。单位升级仍换用新类型的固有技能。|
| 普通塔升级 | `n165→n166→n167`、`n191→n192→n193→n194`、`n221→…→n227` 的 Upgrade 字段分别见[单位说明 L6289](../../reference/map-6.25/units_campaignunitstrings.txt#L6289)、[L6608](../../reference/map-6.25/units_campaignunitstrings.txt#L6608)、[L6958](../../reference/map-6.25/units_campaignunitstrings.txt#L6958)。n227 下一阶为 H010；不是把 N096–N102 全部叠在骷髅王上。|
| 狼人形态 | A169 的 AEme UnitID1..4=E017..E020，w3a Emeu 5/6=E021/E022；各形态分别带 N713..N718。这里只核能力来源，不宣布 AEme 的施法、时长和完整变身效果已完成。|
| 换皮 | R092/R093/R112 的 Acha 分别目标 G040/G041/G046，与原 H013/H010 共享 A044/A035。`Model_Change` [main/f289/f7，L156530](../../reference/map-6.25/main.disasm#L156530) 动态添加转换能力并处理属性。原生等级保留未实测；下文明确选择同实体保留实际已学等级。属性改变影响基础攻击，不把本表暴击概率另加一次。|
| A 杖 | [main/f7/f11、f12，L50925](../../reference/map-6.25/main.disasm#L50925) 的通用配对 A105→A106、A153→A154；所选 A105 标记受影响，但没有把 20 个原生暴击调级。A 杖辅助列表含 A030/A048/A081/A105/A115，因此没有直接 ID 写字段也不等于这些技能没有动态效果。|
| 字段改写 | 全文仅两处字面 `EXSetAbilityDataReal`，[Lua L68371、68382](../../reference/map-6.25/main.readable.lua#L68371)，都给 A224 的 T286 临时能力写字段，不是本组 AOcr。`EXSetAbilityState` 的冷却状态操作不能被说成 Ocr1..5 改写。|
| 动态复制 / UI | A164 读取 Monster_Skill_Arr，不是任意英雄技能复制；本组 ID 未出现在其来源表的字面项。JASS [L2076–2104](../../reference/map-6.25/war3map.j#L2076) 读取 heroAbilList 用于抽卡显示，不负责给单位加技能。这里仍不声称排除了未知外部注入。|

没有直接字面引用的 18 项 N 系仍有单位固有技能、Upgrade 或变身挂载证据。运行时按**当前实际能力状态**执行，不能把本页单位名称白名单当唯一生效条件。

## 3. 明确的 Web 原生暴击接口

本节基准 ID **`native-critical-family-v1`**。它在 Q24 下明确将上表 20 个普通暴击贡献接入[恩赐解脱](skill-coup-de-grace.md)已定义的单包合成规则；没有将那个局部基准自动推广给所有 AOcr/AHbh。遗物必中[relic-hit-v1](item-relic-hit.md)、A027 额外秒杀、[A036 独立暴击](skill-wraith-energy-proc.md)和其他脚本抽样保持各自规则。

1. **入口与快照。** 只有真正普通武器攻击，即将判定合法主目标命中时才收集本组候选；技能、反弹、范围包和直接伤害不会仅因 `attack=true` 重抽。读实际来源已启用的能力等级：A035/A044 为 1–6，其余只能 1；未学/禁用不抽，非法内容等级报告集成错误，不默认六级。已有攻击快照后升级、移除或变身不重抽，下一次攻击用新状态。
2. **随机。** 每项独立 `uniformInteger(1,100) <= chancePercent`，无未经证实的 PRD/保底。有效候选每次只抽一次；别的候选已成功也不短路。顺序为已有 A027（若有效）、本组按 ASCII ID 排序、已有物品按其实例创建序号。同一单位重复添加同一能力 ID 不产生额外抽样；已有同物品实例规则不受影响。
3. **目标与命中。** 所选目标串为 `air,ground,enemy,neutral`；Web 限普通武器允许的敌方/中立单位，地空皆可，建筑仅在普通攻击允许时可用。排除友方/自己及物品/可破坏物，不绕过无敌或伤害免疫。第 5/6 级缺失目标串按同一显式集合补齐，这是 Web 导入选择。本组暴击成功本身不赋予必中，仍可能落空；已有其他必中贡献按其规则处理。落空消耗已抽随机但不提交攻击伤害事件。
4. **组成一次伤害。** `M=max(1, 所有已注册成功倍率)`，`raw=(R*M+B)*f`。R 是普通武器基础包，只组成一次；B 为已有成功命中能力的固定奖励，本组不提供 B；f 为实际幻象创建能力规定的输出系数，普通单位为 1。倍率不相乘/相加，B 不乘暴击。保留普通攻击本来的 attack/ranged/attackType/damageType，先走其原生减免，再进地图 Before，不额外制造事件。
5. **能力生命周期。** 固有 abilList 默认实际 1 级；heroAbilList 只是可学习列表。升级原子替换类型自带能力，例如 n165→n166 后只有 N028，不同时保留 N027。共享 A035/A044 的换皮保持同实体、同已学等级，不额外学习。狼人当前 E017..E022 只提供对应 N713..N718，回人形移除这个形态贡献；这里选定能力集合更新，不代替整条 AEme 规格。
6. **幻象的限定扩展。** 幻象真正创建成功、召唤回调前，复制被复制目标当时实际有效的这 20 个能力及等级为局部快照。可学未学的不复制；本体后续升级/死亡/换形不自动同步旧幻象。幻象可有真实暴击，并各自独立抽样。这是 Q24 明确扩展，不是证明原客户端完整继承；不一并宣布 33 个脚本标记、所有装备/Buff 都可复制。
7. **存档。** 保存基准 ID、PRNG 状态、实际能力等级/启用/来源、形态、已进入命中阶段的攻击候选快照和排序、幻象局部快照。恢复不重新抽随机或加一次属性。源死亡阻止新攻击；已发射攻击的完成由普通攻击系统处理，本页不另造弹道规则。

以上明确了未实测的分布、叠加、目标、快照和合成顺序。[暴雪原技能说明](https://classic.battle.net/war3/orc/units/blademaster.shtml)只支持攻击暴击被动这个基础含义，不能证明自定义目标字段和有伤害幻象。[YDWE 原开发工具元数据](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/AbilityMetaData.slk#L1730)及[字段标签](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt#L5889)对应 Ocr1..5 的概率/倍率/奖励/闪避/必中；[原作者 1.36 实测](https://github.com/Cokemonkey11/wc3-ability-doc/blob/main/sources/screwthetrees-wc3-editor-ability-insight-document/2023-11-14.md#L1037)提供倍率叠加参考，同时有概率精度与固定奖励的版本边界。没有将这些资料假称为本图客户端测试。

## 4. A044 与无敌斩的独立概率：按图鉴修正

图鉴 `H161/H196/H241` 完整约束是“普通攻击有一定的概率暴击，无敌斩继承此技能的一半暴击概率和暴击伤害。被动”；I 列的普通倍率为 2.3/2.6/2.9/3.2/3.5/3.8。实际 [Researchubertip L602 / Ubertip L604](../../reference/map-6.25/units_campaignabilitystrings.txt#L602)明确写出半倍率 1.15/1.3/1.45/1.6/1.75/1.9，并补充非主线概率和倍率翻倍。

私有 helper [main/f41/f0，L65786–65945](../../reference/map-6.25/main.disasm#L65786)的 98 条指令已保存：每次读实际来源 A045 等级组成原基础斩击值，再读 **A044 等级**；不是复用一次普通攻击的原生暴击结果。源 `GetRandomInt(0,100)`，比较 `roll<=threshold`，所以主线成功数为 11/13/15/17/19/21，分母 101。

| A044 等级 | Web 主线概率 | 主线总倍率 | Web 非主线概率 | 非主线总倍率 |
|---|---:|---:|---:|---:|
|1|10%|1.15|20%|2.3|
|2|12%|1.3|24%|2.6|
|3|14%|1.45|28%|2.9|
|4|16%|1.6|32%|3.2|
|5|18%|1.75|36%|3.5|
|6|20%|1.9|40%|3.8|

按全局数值策略，**仅合法 A044 1–6 级**改用 `GetRandomInt(1,100)`，保留 `<=threshold`、原倍率和原 `Game_Mode!=0` 时两者乘 2 的补缺规则。“半伤害”按图鉴引用与实际公式取总倍率的一半，不改成 `1+(倍率-1)/2`。该关联抽样由[A045 完整斩击](legacy-skill-attack-batch-01.md#a045-无敌斩)接入实际计时、选靶和神杖范围。

**原异常不隐藏也不擅修：** 未学 A044、负等级或大于 6，字节码 L65888–65889 都把倍率/阈值初始化成 0，仍抽 0–100；恰好 roll=0 时结果伤害乘 0、critFlag=1，其他结果保留原基础伤害、flag=0。这个已知脚本边界继续保留；不是把初始化伪称为 1，也不对非法等级套准确 0% 后删掉原抽样。A045 自己非法等级的原基础值 0 同样保留。图鉴没有提供这些状态的新数值。

helper 被 [main/f41/f1，L65946](../../reference/map-6.25/main.disasm#L65946)每次实际斩击路径调用，之前还有用于朝向的随机；该独立 RNG 不删除、不并入暴击。helper 内除了 Game_Mode，没有幸运、A 杖、附近数量或隐含概率修正；倍率仍在原 helper 输出位置应用，随后伤害分支不是本页完整核查范围。

## 5. P000 等级压制：保持入口，数值改为 ×1.4

图鉴 H9 等 **118 行**及[实际 Ubertip L16067](../../reference/map-6.25/units_campaignabilitystrings.txt#L16067)都写所有伤害增加 40%。其 AOcr 无暴击字段，`reqLevel=30` 是**英雄学习等级**，不是已取消的平台地图等级门槛。学习 [main/f291/f10 PC13–38](../../reference/map-6.25/main.disasm#L169046)会添加 P200、设永久并设 1 级。

实际伤害分派器 [main/f291/f1 PC1997–2012，L164599–164614](../../reference/map-6.25/main.disasm#L164599)要求已归属的塔 O 非 nil 且 O 的 P000>0，然后读取**当前事件伤害**乘 1.3。按全局策略，只将此位置的乘数替换为 **1.4**，保留所有前置早退、归属解析、先前数值修改及后续回调；不要求本次普通攻击或原生暴击成功，不新增事件，也不把已有被早退的包强行纳入“所有伤害”。

例如到此处 D=100 时，源为 130，Web 为 140；O 未学则仍 100。它与 A035/A044 普通暴击位于不同阶段，不能因都是 AOcr 再把 1.4 当原始武器暴击倍率。既有 [damage-pipeline](damage-pipeline.md)的原 1.3 记录是源证据，本节是对应 Web 数值覆盖。P200/i258 完整变换树仍不在本页完成范围。

## 6. 33 个标记：明确无额外原生贡献，保留效果边界

基准 ID **`aocr-marker-contribution-v1`**：这些 ID 没有任何显式 Ocr1..5 数值；结合图鉴说明、原始记录与关联调用，Web 不为它们额外抽原生暴击/闪避/必中，不改普通攻击倍率或另加属性。**这不是删除它们的脚本、武器或关联能力。** 下表的“未核”不计为完整技能完成。

| 标记 ID | 已定位的实际载体 | 仍需闭合 |
|---|---|---|
| A009 龙族血统（F442） | A008读取本级延长火焰印记；击杀分派器读取并增加生命。 [L116105](../../reference/map-6.25/main.readable.lua#L116105) | 完整击杀资格、永久生命累加/保存与A008印记刷新未核。 |
| A030 脉冲新星（F147） | 学习事件A030_study启动对应模块；A杖通用列表含A030。 [L116298](../../reference/map-6.25/main.readable.lua#L116298) | 计时器启动/重复学习/死亡清理、范围/伤害与A杖门槛未核。 |
| A038 能量转换（F236） | anyUnitDamaged以实际来源A038>0与攻击标记调A038_Action。 [L111025](../../reference/map-6.25/main.readable.lua#L111025) | 叠属性、20..30秒各层计时/到期/复制等效果未核。 |
| A039 暗影之舞（F237） | anyUnitDamaged以实际来源A039>0与攻击标记调A039_Action。 [L111046](../../reference/map-6.25/main.readable.lua#L111046) | 附加全属性伤害和递归/目标规则未核；不是原生暴击。 |
| A048 施虐之心（F297） | 击杀分派器读取A048并调A048_Action；A杖列表包含此ID。 [L116094](../../reference/map-6.25/main.readable.lua#L116094) | 智力累计/上限/A杖变化及保存未核。 |
| A060 多重施法（F587） | 施法分派器查询A060并调A060_Action，模块自有随机与施法循环。 [L117117](../../reference/map-6.25/main.readable.lua#L117117) | 未标明百分比的多重施法完整分布/重复次数/兜帽联动未核。 |
| A077 如意棒法（F21） | A077_Action添加A078并把A078等级设为实际A077等级；结束回调移除A078。 [L114868](../../reference/map-6.25/main.readable.lua#L114868) | 60次计数的第一次/多来源计数/计时刷新/移除与A078原生适用性未完整核；不能将该33标记组等同于无整体效果。 |
| A081 潮汐使者（F513） | 学习调用A081_Study，模块有计时/加攻击/后续分裂分支；A杖列表包含此ID。 [L116279](../../reference/map-6.25/main.readable.lua#L116279) | 一次攻击资格、攻击加成还原、溅射几何/A杖条件未核。 |
| A090 暗影之风（F326） | A089相关分支读取A090等级创建T091；伤害分派器另按已归属塔A090选择回调。 [L112711](../../reference/map-6.25/main.readable.lua#L112711) | T091/T092效果/控制和伤害入口未核；实际Ubertip禁锢350与图鉴275只记录文字差异。 |
| A105 静电场（F6） | 静电模块读取A105；A杖通用配对A105→A106，装备分派另查询A105。 [L98209](../../reference/map-6.25/main.readable.lua#L98209) | 本体/A杖替换后百分比、目标类型、联动伤害完整门槛未核。 |
| A109 地精的贪婪（F81） | 击杀/学习分派均查询A109并调用其模块。 [L116357](../../reference/map-6.25/main.readable.lua#L116357) | 金币收益、上限、目标和保存条件未核。 |
| A115 沸血之矛（F527） | 模块查询A115并维护持续效果；A杖列表包含此ID。 [L51592](../../reference/map-6.25/main.readable.lua#L51592) | 实际挂载/开关、持续伤害、时长/叠加与A杖修正未核。 |
| A116 狂战士之血（F528） | 学习入口关联A116；模块动态设置T117/T118等级。 [L116366](../../reference/map-6.25/main.readable.lua#L116366) | 生命比例→攻速/抗性档位、重算/移除未核。 |
| N017 直线攻击（F754） | 同N018/N019经攻击伤害分派共同进入N017_19_Action；模块据实际ID选1/2/3级。 [L112140](../../reference/map-6.25/main.readable.lua#L112140) | 后续已核实际T038载体命令与直线局部伤害，见[直线专项](creep-line-and-artillery.md)；此前T010笔误已纠正。 |
| N018 直线攻击（F755） | 同N017/N019共用N017_19_Action。 [L112147](../../reference/map-6.25/main.readable.lua#L112147) | 同N017；不是原生暴击。 |
| N019 直线攻击（F756） | 分派显式检查N019；模块N017/N018均不成立时选3。 [L112154](../../reference/map-6.25/main.readable.lua#L112154) | 同N017；不能因模块无N019字符串就声称无动态效果。 |
| P000 等级压制 | 上节已闭合原位置 ×1.4 与学习 P200 的关联。 | P200/i258 完整后续变形。 |
| N020/N021/N022 投石车 | n156/n157/n158 的武器 `weapTp1=artillery`，原生武器字段已有范围/衰减；AOcr 只是说明。 | 后续已核[炮击专项](creep-line-and-artillery.md)的落点、掩码/边缘与逐目标包，未套UnitDamagePoint敌方筛选；世界物体另核。 |
| N048–N053 敏锐（无用） | n177–n182 的基础攻击间隔已写入武器字段，AOcr 不再给“快攻”增益。 | 本标记无独立待加效果；整座塔其他技能仍各自核查。 |
| N064–N067 天生强壮（无用） | n186–n189 基础攻击/间隔已在武器字段，AOcr 不另加攻击或减速。 | 本标记无独立待加效果；龙卵其他伤害能力不算已完成。 |
| N105/N106/N107 腐蚀攻击 | n240/n241/n242 同时挂 T041/T042/T043（AIcb），显式 DataB=10/25/40。 | AIcb 命中施加、5秒刷新、Buff互斥及免疫条件另核；不重复由 AOcr 再减一次甲。 |

A077 特别容易误判：其本体没有暴击数据，但 [Lua L46068–46086](../../reference/map-6.25/main.readable.lua#L46068)明确添加 A078 并设同级；A078 是真正 AOcr，1–4 级概率 100%、倍率 3.5/3.8/4.1/4.4、必中=1，w3a 倍率5/6为4.7/5。5/6级概率/必中没有独立增量，且计数和临时挂载生命周期本批未全核，所以只保留这条直接依赖，**不把 A077 当成无效果，也不把 A078 并进已完成的 20 项**。

A090 图鉴 H326/I326、H561/I561 的禁锢范围 275 与实际 Ubertip 350 不同，但其执行载体尚未核完；本页保留文字来源并注明图鉴优先，不把仅提示差异冒称已证明的实际执行差异。

## 7. 验收与真实剩余

| 边界 | 期望 |
|---|---|
| A035 六级，roll21 / 22 | 前者 5 倍，后者不暴击。 |
| N072，roll20 / 21 | 前者 8 倍，后者不暴击。 |
| A044 六级+N072 都成功，R=100 | 一包 800，不是 3040；本组不附赠必中。 |
| A035 六级与已有 I251 都成功，R=100、减免×0.5 | 原始 501，进入地图前 250.5；不产生第二次攻击事件。 |
| 暴击成功但普通命中失败，没有其他必中 | 无伤害事件；这次暴击 RNG 已消耗。 |
| n193 升 n194 | 下一次攻击只用 N072 的 20%/8 倍，不叠 N029；已形成的旧攻击用其快照。 |
| 狼人 E017→E022 | 新攻击从 N713 15%/4.5 换为 N718 40%/4.5，倍率不重复叠加。 |
| A044 一级，无敌斩主线 roll10 / 11 | 前者乘1.15并标暴击，后者不乘；普通攻击自己的20%不是同一次抽样。 |
| A044 六级，无敌斩非主线 roll40 / 41 | 前者乘3.8，后者不乘。 |
| 未学A044，无敌斩源与Web roll0 / 1 | 仍分别输出0/critFlag1与原基础伤害/flag0；仍抽0–100。 |
| P000 已学/未学，到达该分支 D=100 | 140 / 100；英雄等级门槛仍30。 |
| 仅添加 N048 或 N064，其他状态相同 | 无暴击抽样，不再次提高攻速/攻击。 |

验证结果写入机器表 `validation`：两本图鉴共 410 次选中行核对、53 个原始 SLK 记录（533 个字段）、768 个逐级合并字段、3,000 个原生概率边界；140 条源指令身份、A044 helper 原 2,727 / Web 2,709 个结果、8 个 A045 基础等级边界、36 个 P000 门槛/数值状态和 20 个 Web 接口案例全部通过。77 个本地文档链接有效。没有运行魔兽客户端或实现完整 Web 战斗。

尚未实测的原客户端 PRD、命中优先级、幻象继承/变身隐式状态等，本页已在 **20 个原生组件**适用范围内给出明确 Q24 选择，不再作为这些组件的实现阻碍。真正未闭合的是 22 个标记中尚未另核的内部效果、A036完整附加伤害、A078计数生命周期、其他原生武器/AIcb和非本组技能。机器表逐ID记录，不能用本次分类把这些项批量标为完成。

## 后续闭合记录

本页首次分类时的22个待核标记中，A077/A078计数与临时能力、A081完整模块已由[如意棒法与潮汐使者专项](skill-jingu-and-tidebringer.md)补齐限定执行规格。上文“本批未核”保留为原批次范围，当前状态以总索引与该后续专项为准；A076完整波形、A079阵法和全局生命周期仍继续调查。
