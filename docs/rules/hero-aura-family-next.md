# 竭心、长大、复仇、野性与死亡光环

本页核定 **A047、A069、A153、A168、A216、A235** 六个图鉴 ID、16 行的完整模块和局部原生规则，并处理直接必需的 A154、N719–724、T269–275。机器表保存两本图鉴全部有效列 A–J 原值、20个能力的 SLK/W3A、提示、挂载、原字节码和单位资料：[hero-aura-family-next.json](hero-aura-family-next.json)。六组当前没有新确定的图鉴数值冲突；未写字段保持原始 null，查证后选定的行为另列为 **Q24 局部基准 `hero-aura-family-next-v1`**。A069/A235 的武器通道已接入[weapon-attribute-interface-v1](weapon-field-source-notes.md)：Q46 仅将 A069 每次 +90 改为可放大贡献 G，A235 保留固定 J19。该接合是已选 Web 规则，原客户端重算仍未实测。

[补充列只读核对](workbook-supplementary-columns.json)确认两书塔技能有效终列为 J，J4 为“补充对象字段”；本组16行的 J 均为空。全表249个非空 J 的375段值逐段对应原 W3A 的 acdn/amcs，不将对象字段附录凌驾于 H/I 的明确设计数值。

## 身份与来源

| ID | 图鉴塔技能行与角色 | 完整核心字节码 | 对象 / 实际提示 |
|---|---|---|---|
| A047 竭心光环 | 296 G038 幻灵亡师；387 H014 死灵法师；392 G050 死神 | main/f43/f0、f1，[L66872–67050](../../reference/map-6.25/main.disasm#L66872) | [对象 L14767](../../reference/map-6.25/units_abilitydata.json#L14767)、[提示 L643](../../reference/map-6.25/units_campaignabilitystrings.txt#L643) |
| A069 长大 | 272 H021 小小；428 G059 火焰领主 | main/f61/f0，[L72566–72637](../../reference/map-6.25/main.disasm#L72566) | [对象 L15449](../../reference/map-6.25/units_abilitydata.json#L15449)、[提示 L988](../../reference/map-6.25/units_campaignabilitystrings.txt#L988) |
| A153 复仇光环 | 247 H038 复仇之魂 | 原生 AOac；A杖通用配对与 main/f105/f0、f1 | [对象 L17694](../../reference/map-6.25/units_abilitydata.json#L17694)、[提示 L2164](../../reference/map-6.25/units_campaignabilitystrings.txt#L2164) |
| A168 野性驱使 | 462/467/472/477/482/487 E017–E022；492 H043 狼人 | main/f118/f0，[L93408–93489](../../reference/map-6.25/main.disasm#L93408) | [对象 L18181](../../reference/map-6.25/units_abilitydata.json#L18181)、[提示 L2404](../../reference/map-6.25/units_campaignabilitystrings.txt#L2404) |
| A216 野性之心 | 167 H056 兽王 | main/f156/f0、f1、f2，[L106903–107028](../../reference/map-6.25/main.disasm#L106903) | [对象 L19878](../../reference/map-6.25/units_abilitydata.json#L19878)、[提示 L3180](../../reference/map-6.25/units_campaignabilitystrings.txt#L3180) |
| A235 死亡光环 | 418 H060 深渊领主；438 G078 炼狱魔王 | main/f168/f0、f1，[L111325–111612](../../reference/map-6.25/main.disasm#L111325) | [对象 L20436](../../reference/map-6.25/units_abilitydata.json#L20436)、[提示 L3452](../../reference/map-6.25/units_campaignabilitystrings.txt#L3452) |

图鉴技能 ID 均在 F 列，上限 G=6。A153/A168 的5/6级 Cac1 为约0.42/0.5；A216 与 T275 的5/6级 Oae2/Isx1 为约0.35/0.4，必须合并 W3A。浮点存储误差按图鉴明确的小数参数表达，不作为新冲突。学习共用[完整分派 main/f291/f10](../../reference/map-6.25/main.disasm#L168967)：先拒绝 nil/幻象；本批 A047、A069、A216 调学习回调，另外三项没有。

## A047：半秒伤害与原生 Buff 分离

图鉴与实际提示相同，六级每秒原始量依次为 **80、100+0.10I、120+0.16I、140+0.22I、160+0.28I、200+0.40I**，I 是当次 `GetHeroInt(unit,true)`。

学习用 `IsInTable(unit,Tower_ALL)` 找槽；若该槽已有 A047_Timers，销毁旧 timer，再起 **0.5秒循环**并存回槽。不是每级多起一份。每 tick 根据到期 timer 重新找槽，再读取**当前** `Tower_ALL[slot]`、当前等级、当前有效智力和坐标。计算上述 DPS 的一半，直接调用 `UnitDamagePoint(source,0,1000,x,y,DPS/2,false,false,NORMAL,MAGIC,WHOKNOWS)`，准确顺序与参数见 [L66918](../../reference/map-6.25/main.disasm#L66918)。

等级0或非1–6结果0，本 tick 返回但 timer 仍继续。槽为 nil 时销毁并清理 timer，**没有立刻 return**；随后无效 native 读取0，公式为0再返回。学习会重置下一 tick 到新0.5秒；不补上一周期未满的比例。每个来源各有 timer，多个法师分别发伤害，不因 B010 同名而只留最高一个。

AUau 的 DataA/B 没写；[暴雪 Unholy Aura](https://classic.battle.net/war3/undead/units/deathknight.shtml)说明原模板是移速/回血，不能据此给敌人额外回血。Q24 只给本 A047 **原生移速0、回血0**；B010 可作为显示状态，绝不决定脚本伤害是否执行。timer 没有存活、启用、隐身、妖术或 B010 检查；不能把真光环的发射资格加到它前面。已有尸体来源仍按现有 native 范围包接口处理；移除来源且槽空则按上述清理。若槽被另一个单位占用，脚本读新槽单位，不能悄悄替换成旧稳定句柄。

这包直接复用 [area-damage-v1](native-area-damage.md)：1000中心闭圆、敌方筛选、MAGIC 排除魔免/无敌/Aloc、B04快照与同步逐目标完整伤害事件。它不发施法事件、不扣蓝、不抽普通命中。来源假死/原生 Buff 暂停不等于停止此脚本时钟。

## A069：每次学习的永久基础修改

两书 **H272/H428** 原文为“小小崎岖的身体体重不断增长，提升了力量。被动”；**I272/I428** 六级逐项明确“永久增加小小90/180/270/360/450/540点基础攻击力”，**J272/J428 为空**。完整函数按当次技能等级算视觉缩放 `0.5+0.2L`，当前单位类型 G059 则再×1.6；随后对当前 `GetUnitState(ConvertUnitState(19))` **加90**并写回。[main/f61/f0 PC22–34，L72617–72629](../../reference/map-6.25/main.disasm#L72617)没有“目标总量减当前加成”的修正，也不加力量。

以上是原字段调用证据，原探针保留。Web 按 **Q46 已确认**，将 PC22–34 整段 getter/setter 换为专用 **`G+=90`**；G进入百分比攻击共同基数，**不再同时给 J19 或 J18加90**。正常六次实际学习 G=540；直接重复回调仍+90，卸技能/降级/死亡不退款，不按当前级数反算。50%光环下每次增长使原始武器包+135，撤去光环则+90。模型缩放仍按原函数，不扩大攻击、光环或碰撞范围；G059只放大视觉尺寸。

**原生证据与 Web 选择分开：**[固定版本 YDWE UnitState.cpp](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Plugin/Warcraft3/yd_jass_api/UnitState.cpp)证明源写 `damage_bonus` 整数成员，仍不证明本图原客户端的重算分量。Q46 是对本技能“基础攻击”的明确玩法选择，不追认成已实测原版 bug，也不推广其他 S19 来源。[通用接口](weapon-field-source-notes.md)规定 API 整数/real 量化、J18/J19和G分离；后续显式 Set18 仍可通过 J18绝对改当前基础视图。保存G与scale；换皮和恢复不重放学习，降级不退款。

AOae 的移速/攻速字段均未写；[暴雪 Endurance Aura](https://classic.battle.net/war3/orc/units/taurenchieftain.shtml)只能说明模板两类效果，不能给本标记补 stock 数字。Q24 明确 A069 原生移速/攻速均0，B047 的 self 光环显示不另加属性。保存专用 G 与 scale；恢复、换皮不回放学习。

## A153：百分比攻击光环及 A154 移形换位

AOac/B146，800范围，友方含自己；近/远程开关均1；六级攻击增幅 **10/18/26/34/42/50%**。原生范围与叠加采用本页后述 Q24。不是固定+50攻击，也不将攻击百分比再乘到固定绿字上。

[通用 A杖配对 main/f7/f11、f12](../../reference/map-6.25/main.disasm#L50925)明确 A153→A154：Use 时当前 A153>0才添加 A154、设永久，读取 A154一级 cooldown 字段105，立即把剩余冷却设为该数值 **10秒**；重复 Use 也再设10。Drop 检查的是**子能力 A154>0**，即使父能力已消失仍移除子能力。持杖之后才学习 A153 没有学习回调补授予。拾取、失去最后一份资格和 A111/A113 共享资格沿[上一组明确接口](hero-aura-family.md)，不扩配对生命周期。

A154 [对象 L17723](../../reference/map-6.25/units_abilitydata.json#L17723)是 ANcl，Cost150、Cool10、Rng9999、DataF=`creepheal`、friend/invulnerable；[实际提示 L2178](../../reference/map-6.25/units_campaignabilitystrings.txt#L2178)是交换友军位置，不能选工人和能量圈。没有 A154 自动施法条目；不把任意 `creepheal` 自动调用都当它。

实际 SPELL_EFFECT 分支 [main/f291/f14 PC949–992，L171039](../../reference/map-6.25/main.disasm#L171039)先拒绝目标 IsWorker/IsBOX，然后查询**事件目标地点**的 `IsTerrainPathable(BUILDABILITY)`。返回 false 可换；返回 true 时 **Game_Mode==2 仍可换**，其他模式提示不可建造并结束。此处阅读稿缩进误导，已按跳转核对。此前的 Item_Skill_Action、WAbility_initAbility 等公共回调照常发生。

[完整 A154_Action/回调 L86238–86369](../../reference/map-6.25/main.disasm#L86238)：同所有者直接允许；不同所有者仅在目标玩家 `Help_Arr[convertedId]==1` 时拒绝。单人正常同所有者不需要此开关。通过后按施法者的 Tower_ALL 槽记录目标与新 timer，**0.1秒后**读取双方当时位置，依次“源→目标当前位置”“目标→源原位置”，然后销毁/清表。没有延迟期存活、阵营、持杖、能力或地形复检；不把目标位置提前锁成施法时位置。

每槽重复进入覆盖 timer/目标表，但不销毁前一 timer；旧回调找不到索引得到−1，不会自动取消新 timer。保留这个原行为，不能改为“刷新并取消旧任务”。

**Q24 接受/坐标选择：**按有效 friend/self、存在存活未隐藏非Aloc、中心距≤9999接受；魔免、无敌、建筑、空中可选。施法者须存在存活、实际能力启用/等级1、无施法锁、冷却就绪、至少150蓝；H038 `castpt=0.3秒` 来自单位表，其他来源读自身有效 castpt。前摇可被合法替代命令、死亡、技能移除/禁用或控制取消；生效时重检并扣150、起10秒冷却一次，然后跑原 SPELL_EFFECT。原生 ANcl DataD=1 不另外发明1秒引导。工人/能量圈、地形、Help 的拒绝仍在原脚本分支发生，**已经提交的费用和冷却不退**，不前移成免费检查；其他已核全局冷却修正仍可随后改写。

0.1秒回调的两个移动调用保持顺序，选择精确中心传送，不另挤到邻近可行走点、不碰撞推开；每次移动后重算光环。存在的尸体可移动；无效/已删除句柄取位置(0,0)、写入无操作，另一端仍可能被原调用移到(0,0)。这是明确的无效句柄 Web 选择，不宣称原客户端实测，也不新增自动取消/退款。

## A168 / A216：真正的光环与生成时辅助

A168 AOac/B153 本体只有 self，Area100；比例仍 **10/18/26/34/42/50%**。实际非幻象召唤入口添加 **N719/N720/N721/N722/N723/N724** 中相应一个；这些都是一级 AOac、Area900、**self only**、同 B153，比例分别等于六级表。900不是狼人额外给所有受控单位持续覆盖的半径。没有移除旧辅助、没有永久标记、没有之后同步现存召唤物的学习回调。重复回调可能留两个不同 N*，按同 Buff 取最大；已经生成的单位不会随主人后来升级自动升辅助。

A216 AOae/B212 原生900范围友方含自己，攻速 **15/20/25/30/35/40%**；没有写移动加成，Q24 明确移动0。学习先移除 T275、重新添加、设永久、设成当前 A216级；召唤回调只添加 T275并设级，不设永久。T275 是 AIas，相同六级攻速，独立于范围光环。正常同级本体/新召唤在圈内得到两份，离圈只剩辅助；旧召唤辅助仍保留生成时等级，所以主人后来升级后不强行补成两份当前等级。所有贡献加入[attack-timing-v1](attack-timing.md)原始总攻速再钳制，不能把输入相加当作无上限实际频率。

这两条必须区分**外层归属判断与真实事件 native**：[UnitBeComeEventHandler main/f291/f20 PC1–154](../../reference/map-6.25/main.disasm#L173119)先将临时来源解析成 O；新单位带 BIil 会走幻象分支并提前结束，非 Player11 的 O 必须是原生 HERO；Player11 分支登记怪物而不调用本两项。玩家英雄分支先 i240_254_Action，再按 O.A168/O.A216 检查和设置新单位 userData。

但 A168_Action / A216_Action 内再次读的是 **GetSummoningUnit/GetSummonedUnit**，不是上述 O或函数参数。普通[召唤事件包装器 L173544](../../reference/map-6.25/main.disasm#L173544)使它们一致；临时来源解析、或 A051 在 [Lua L41774](../../reference/map-6.25/main.readable.lua#L41774)直接调用 Handler 时，不能擅自把 helper 的原事件读取替换成参数。实际召唤者没有 A168 时不授 N*；A216 的实际读级0会设 T275=0，Q24明确为无贡献。幻象继承、魅惑与 A214/A215完整创建策略不在这六项中发明。

## A216 模块的额外攻击替换

此模块还定义 `A216_lightattack`，但入口**不检查 A216等级**。[伤害入口 PC404–468](../../reference/map-6.25/main.disasm#L162919)只要求 attack≠0且实际源为 b162–b167；b165 在原指令中重复比较一次，仍仅调用一次。函数 [L107002](../../reference/map-6.25/main.disasm#L107002)先 `EXSetEventDamage(0)`，再向原目标 `IssueTargetOrder(source,"chainlightning",target)`。命令失败也不恢复父伤害；此后原流水线继续，不能直接 return 跳过其他响应。

六鸟初始分别挂 T269–T274，均 AOcl、DataB=5、Area600、Rng5000，源对象伤害 **500/700/900/1100/1300/1500**；Cost/Cool/DataC未写，单位 `castpt` 也未写。[能力 L37651–37728](../../reference/map-6.25/units_abilitydata.json#L37651)及机器表的六单位挂载/武器资料可复核。原1500弹道速度是表现，不自行推一个伤害延迟。A215 后续专项已闭合创建与寿命，并按图鉴 I166 将三级 T271 的 Web 伤害改为1000。其他五档沿源值。 [A215专项](summon-family-batch-01.md#a215-野性呼唤)

**Q24 将已查 [lightning-attack-native-v1](skill-lightning-attack-effect.md)局部扩展到这六个 AOcl：**首次目标距离≤5000；跳跃600闭圆，最多**5个不同目标，含首目标**；缺失费用/冷却/前摇/衰减明确选0。每击同一原始金额，`false,false,NORMAL,MAGIC,WHOKNOWS`，保留实际鸟来源。首目标敌方有机地面/空中、非建筑/机械/ward/Aloc/无敌/魔免；来源存活有效启用且无施法锁，无额外视野门槛。原普通攻击合法不代表技能命令一定成功。

链在 IssueTargetOrder 内同步依次完成，每击后按 B04重新查当前世界；不重复同一 ID、不按最近优先。首目标原本睡眠才允许后续睡眠候选。首目标 N535 就绪时消耗与妖术等共享的6秒护盾并挡整链；后续成员不另消费盾，但照常检查魔免/无敌。源在嵌套事件被杀/删除则停止剩余链。原鸟不在 IsTemp 101项初始化表（[Lua L30861–31156](../../reference/map-6.25/main.readable.lua#L30861)），T269–274也不是公共施法提前返回 ID，因此链的一次 SPELL_EFFECT 会经过普通 Item_Skill_Action/WAbility_initAbility，**不能照搬 T039/q001 的早退**。每一跳不再额外发一次施法事件。

[暴雪闪电链说明](https://classic.battle.net/war3/orc/units/farseer.shtml)支持连续跳跃和睡眠条件，但 stock 衰减/冷却/蓝量并非本图缺字段的证据；这里的0值和同步顺序是注明范围的 Web 选择。

## A235：逐死亡、逐来源、独立到期

[死亡入口 main/f291/f9 PC1–325](../../reference/map-6.25/main.disasm#L168279)没有在 A235之前的 return。它先调用 DeadToRemoveUnitAndTrig 及两个相关金币回调，再对死亡单位调用 A235；该清理函数 [L50494](../../reference/map-6.25/main.disasm#L50494)只注销怪物数组/伤害触发器，**没有删除单位句柄**，不会先把死亡坐标清空。

A235_Action 先要求**死者所有者 Player(11)**；然后在死者位置700范围枚举，对每个当前 A235>0、生命>0的成员分别奖励。没有要求击杀者是它，没有判断 B217、受益者所有者、幻象或当前原生光环是否发射。原生 Buff 互斥不影响多个深渊领主各自得到奖励。

六级临时表 **5/10/15/25/35/50**；Game_Mode≠0乘2。然后按该单位 `IsInTable(unit,Tower_ALL)` 槽的私人计数，nil先0，**每次先加2**；加后≤3000则写 `S19+=临时值+2`，>3000则只加临时值。计数过上限仍增长，不钳到3000，也不会到期减回。图鉴没写的模式翻倍/3000上限有明确源分支且实际 Ubertip也写，按原图补缺保留。

每次每名受益者新起20秒 timer，分别保存“槽、当时临时值、timer”；不是总计时刷新。到期对**当前 Tower_ALL[保存槽]**的当前 S19减去捕获值，再销毁timer、清三项记录；永久计数不清。升级、模式改变、其他技能修改 S19都不改变已经捕获的扣回量。例：一级两次先后触发各得5+2，分别在自己的20秒截止扣5，最终保留4。若槽后来指向另一个单位，原代码会扣它的当前S19；本页保留，不暗改成稳定旧对象。

A235 的全部原 S19 getter/setter 均沿[共享武器接口](weapon-field-source-notes.md)进入**固定 J19**，临时/永久部分都不因 Q46 变成可放大基础；原读取量化、逐次写入、捕获原值扣回仍保留。例：50%光环下一级5+2仍增加7（此整数例），到期扣5后固定保留2；光环变化不把它们乘1.5。不得从永久计数反算覆盖已有 J19。

Q24 枚举采用700中心闭圆/B04快照，排隐藏/Aloc，之后仅执行原能力/生命筛选；原生 AHad 选0额外护甲，B217仅显示，不拿光环隐身/禁用资格过滤脚本。非法正等级没有合法临时表，第一名可产生 nil 算术错误，后续也可沿用前一成员值；它是内容错误，保留证据并在内容校验拒绝非法等级，不能暗补0或钳到6。

## 本批真光环、持久化与原生边界

[命令光环官方说明](https://classic.battle.net/war3/neutral/kobolds.shtml)及[固定 YDWE 元数据](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/AbilityMetaData.slk)支持模板字段类别；Uau1/2/3 位于2186/2208/2230，Oae1/2位于4084/4106，Cac1位于9942，Isx1位于9986。[编辑器文字](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt)分别标移动/回血/百分比、移动/攻速与攻击量。AOac 本图自定义代码与资料 ACac并非完全匹配的引擎实现；下列行为明确是复用既有基准的局部选择。

- A153/B146、A216/B212按[上一组真光环](hero-aura-family.md)的来源/受体资格、友方含自己、魔免友军允许、中心闭圆、即时重算零残留、普通驱散不关闭执行。A168/N719–724仅 self，不变成友军圈。A047/B010、A235/B217是敌方显示，魔免不收显示；其脚本仍独立执行。A069/B047 self显示且无额外属性。
- 同 B146取最大攻击比例，同 B153在 A168与N719–724间取最大，同 B212取最大攻速；各不同 Buff组与 N016/N103/N104百分比相加，T275是独立 AIas加法。百分比攻击共同基数含模板/科技/脚本基础、本次武器骰子和有效主属性×1.4，排固定绿字和其他百分比，不复利。A053/T002固定通道不被放大。B212攻速与N088等已指定不同Buff组相加后共同钳制。
- 发射资格继承既有局部光环定义：实际存在存活、启用有效级、未隐藏；幻象/隐身/妖术/钻地/复生尸体/飞行native HERO不发射，普通眩晕/沉默/暂停不单独关被动。受体存在存活未隐藏非Aloc，允许空中、地面、建筑/机械、ancient、亡灵、召唤/幻象、无敌/魔免/虚无。各技能的 self/friend/enemy掩码另保留，不能一律改Player11。
- 禁用父能力不会删除已授辅助、回滚学习增加的基础值，或自动取消没有该检查的脚本timer。死亡不隐含销毁私有timer；有明确源销毁分支才按分支执行。换皮保持实际能力/辅助/武器贡献通道/永久计数，不回放学习、Use或召唤事件。
- 本机保存全部私有表、Tower_ALL映射、每个timer剩余战斗时间与B05顺序、实际能力/启停/冷却、共享武器通道 B/H/F/P/J18/J19/G（精度等价保存）及永久计数、scale和有效属性；恢复只重建派生光环一次。不把A235的永久计数替代现有J19，也不把A047当前slot查询改成一份永久源快照。

## 校验与交付边界

[验证工具](../../tools/audit-hero-aura-family-next.py)逐条对照原字节码、只读两本图鉴和源哈希、独立解析原SLK。已验证等级/智力组合、学习重置、死亡/空槽/复用槽、辅助生成时等级、原事件与解析来源分离、A杖冷却/撤销、深渊地形分支、Help拒绝、交换位置延迟/孤儿timer、死亡光环3000边界/独立到期，以及先清父伤害后发失败命令。另用原学习函数的明确PC22–34替换点验证Q46，覆盖G059视觉、重复/降级、光环增减及读档不重放；A235通过共享字段合约运行原回调验证固定加成/扣回。原生几何、叠加、跳链使用独立的已选Web合约案例，不声称Warcraft客户端验证；精确结果见JSON `validation`。

本批完整脚本、直接辅助和局部原生行为可分别复现。六个主ID均为 `local_effect_specified_with_declared_shared_interfaces`；A069通过Q46专用G、A235通过固定J19完成武器接合。原raw S19探针仍单列来源证据，不能将其误当Q46累计方案。A214全部召唤创建/生存周期、A111/A113完整配对、全局幻象或魅惑继承属于独立接口。后续接入必须遵守本页的真实事件/槽位/授予边界，不能以“最终看起来应当双倍”为理由删掉源状态历史。
