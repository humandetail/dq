# 自用增益首批

基准 **`self-buff-batch-01-v1`** 核查九个 Absk 图鉴 ID。技能皮肤、载体、Buff 与属性辅助随对应主技能取证。[机器表](self-buff-batch-01.json)保留双图鉴、对象与原入口。A088 依 Q56 保留主动及被动，A196 完整法球行为列于未解决项。

## 规则

### 共用接口

沿用 [自用 Absk 瞬时事务](skill-lizard-frenzy-and-gold.md)与[自动派发](autocast.md)。使用有效、存活、可施法的实体和已学启用的六级逻辑槽，要求剩余冷却为 0、当前蓝足。主技能自用、零前摇，施法一次性扣蓝、开冷却、安装其原生 Buff 后发一次 EFFECT，公共装备、FINISH 和 ENDCAST 沿原分派。普通行动与已提交弹道继续，公共脚本的动作命令仍可生效。自动入口 A043 要 500 内存在合格 P11，A037 要 600，其他本批原分支不另枚举目标。异常同一实体存在多个合法 `berserk` 时沿自动分派原优先级选已就绪槽，手动 UI 可标明实际槽。Absk 缺省移动、攻速、承伤与耗蓝取 0，保留源缺省标记。DataB 增益接 R 的加法通道。A071/A088/A126 真实 DataC=1，对本批施法者原生状态选择在 B03 原生层使其承伤×2，遵各包准入；Buff 存续和后述脚本效果各计时。原生正面状态更新、驱散、死亡、失效、存档沿已核规则。 [字段标签](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt#L6335) · [攻速](attack-timing.md) · [伤害层](web-baseline.md#b03伤害事件读取减免后的值改写后不重复减免)

### A024 激怒

H006/G037，蓝 10/20/30/40/50/60、CD15，B005 8 秒。伤害管线 PC483–497 确认实际来源 S 当前 B005>0 且 attack!=0，调用 f26/f0。按**此击** S 当前 A024 等级及最大生命算 10/12/14/16/18/20%，零时早退。向原受击者独立发 `false,false,HERO,NORMAL,WHOKNOWS`，B03 与父击分别减免、提交，无新攻击递归。TxShow 才在目标处请求 1 秒 Disenchant 头顶特效。持真实神杖资格时 EFFECT 在公共前段后执行 A024_AAA 并返回，实际发的是 **N015** 一级震撼大地，复用已核 q001、写 UserData、支付辅助蓝、范围伤害及控制，不改成本为本塔另一项技能。无神杖从该专用检测落到后续公共尾段。 [B005 伤害函数](../../reference/map-6.25/main.disasm#L62970) · [N015 已核](creep-skill-family-001-053.md#雷霆一击-n012015)

### A037 黑暗契约

H011/G051/G063，零蓝、CD10/9/8/7/6/5，原生短 Bbsk 壳 .1 秒。EFFECT 登记独立施放索引和 .5 秒启动事件，启动时先销毁本 timer，若原来源缺失则清该实例。来源有效时先排 1.2 秒一次终止，再排 .1 秒周期，并请求 `superdarkflash.mdx` origin、1.5 秒、缩放1。周期每次在子包前分别读当时有效力量、敏捷、智力并读来源当前二维位置，先提交中心500的 `false,false,CHAOS,DIVINE,WHOKNOWS`（零延迟，复用 B03/范围接口），然后调用 `UnitRemoveBuffs(source,false,true)`，清当前可驱散负面状态。负面驱散按各 Buff 规则，脚本期限不随 Bsk 壳提前结束。来源有效尸体仍完成原时间链，删除句柄则按读值0/写无操作并正常清 timer。各次施放独立，启动或结束不覆盖其他实例。

源每 tick 乘1，B05 固定为第 .6/.7/…/1.6 秒共 11 tick，同刻第 12 tick 被终止事件取消。图鉴给整次名义全属性×12，未给频率、时长或单击金额。本批在每个相同 tick 取 `12/11 × (有效STR+AGI+INT)`，保留逐次属性采样、状态清除、伤害目标和 B05 期限。符合同一目标、全程固定属性时整次原始系数 12。 [源 f35](../../reference/map-6.25/main.disasm#L64559) · [范围接口](native-area-damage.md)

### A041 扫射

H012，蓝30/40/50/60/70/80，CD12，B013 在有效攻速 R 加 1.5。持续4/5/6/7/8/10秒，末档按图鉴 10 秒（w3a 原 9 秒）。A041 仅有自动就绪字面引用，主动同用普通 Absk，效果从原生对象进入；没有额外 Lua 专用增伤、移动或承伤字段。并发重施按自用 Buff 普通覆盖，旧到期不能撤新 B013。 [对象](../../reference/map-6.25/units_abilitydata.json) · [自动入口](../../reference/map-6.25/main.disasm#L174580)

### A043 剑刃风暴

H013/G040/G041，零蓝、CD10，B034 自攻速 +.8、5 秒。EFFECT 按实际 A043 等级从当时施法者位置造同拥有者 q008、T051、朝向 0、独立计时生命10秒，写 `IsInTable(caster,Tower_ALL)` 后发 `whirlwind`。另独立 5 秒计时器移除该载体并清两表，即使发令未成也登记；因此 T051 对象的 6 秒不会拖到第 6 秒。G041 换白色视觉模型，TxShow 只决定是否创建 5 秒特效。源始终是 q008 且伤害归属用实时 Tower_ALL，源塔停止、死亡和 B034 驱散不直接撤分身。q008 默认 Avul/T012/Aloc，Web 仅承担本次原生风暴，原生魔免及风暴施法状态属于载体，本体仍能普通攻击。 

T051 AOww 取原独立值 600 半径、DPS 400/600/800/1000/1200/1400。沿 [范围包](native-area-damage.md) 选敌方或非同盟中立地面/建筑战场实体，过滤 Aloc/无敌/魔免，忽略空中与高差。零前摇、零蓝，成功后立即结算第一个 1 秒量，接着 t1–t4 每秒一次，t5 移除前无第六包。每次从相应载体位置 B04 重查，逐人独立 `false,false,NORMAL,MAGIC,WHOKNOWS`。没有载体移动命令时初始中心固定。原生实验证据显示同目标不叠加 AOww，本地选取该目标同时合格的活动风暴中较大 DPS，平局先登记；仅胜出的源在自己 tick 对其发包，其他风暴不改本身的到期。在源移除或受体资格改变后下个计划 tick 重新判定。未实测绑定端的期初相位、叠加胜出和原生减免旗标。 [源 f40](../../reference/map-6.25/main.disasm#L65563) · [Blizzard Blade Storm](https://classic.battle.net/war3/orc/units/blademaster.shtml) · [AOww 作者试验](https://github.com/Cokemonkey11/wc3-ability-doc/blob/main/sources/screwthetrees-wc3-editor-ability-insight-document/2023-11-14.md)

### A068 战棍

H021 用 A068、G059 用同槽 A149，二者 B048。蓝10/15/20/25/30/40、初始CD15，力量20/35/50/65/80/100。EFFECT 获取实际变体档位，对本体 `SetHeroStr(当前基础力量+该档,true)`；每次独立登记 6 秒，响应结束时从当时原塔表槽中的单位基础力量只减本实例抓取的值。力量明确可叠加。B048 单份、最近施放刷新为6秒，H021 的原动画 `upgrade` 同期结束，G059 另一皮肤效应保持源调用。前一个力量计时器继续，驱散 B048 可停分裂而不删力量。到期不回填旧总三围或生命，依共用属性资源差额。 

PC748–767 在实际 S 有 B048 且 attack!=0 时取此刻父击已改写的 D 一次；以原受击点为中心查 **400**，按 B04 处理 P11、生命>0并排除主受击者。每个合格者计数一次后发送 `SetRealDamage(S,U,0.5*D*系数)`，m998/m999 对该**副目标**系数0.8，其余1。辅助独立 DIVINE，任何 native 拒伤或脚本改伤不回滚本次合格计数。循环后按此刻 S 类型选择实际 A068/A149 并读档位与剩余 CD。若已学且 `remaining>floor`，减合格数但钳在 floor=7/6/5/4/2/.2；若已低于 floor 不回升，负值归0，仍按源写一次 state1。先前共用 CD 缩减不移至该伤害段。图鉴 H 明确400、6秒、CD15，优先于 J 的末两档 8/7 和原对象逐级 CD。 [源 f60](../../reference/map-6.25/main.disasm#L71977) · [属性接口](hero-attribute-interface.md)

### A071 精准光环

H022/G066/G073 分别实际 A071/A184/A211，同外层、零蓝、CD10、原生10秒自状态。EFFECT 当前有效 AGI 与实际槽等级 L 取 `floor(AGI*L/10)`，先快照遍历中心800。P11、近战、工人、箱子、生命≤0 排除，其余原生英雄给全值，非英雄 `ceil(值/2)`。源以目标 Tower_ALL 索引比较旧值，旧值较大忽略本次，等于或较弱先撤旧再重建10秒。无 carryover、源等级变化或走出圈不刷新。未登记目标源索引为−1，原会争用同一个槽。图鉴专述友方远程英雄，原实际提示写远程单位，保留原半值分支；敌友按此处 P11 原过滤。

S18 即时按原读写增减捕获量。若目标已换单位类型，到期跳过 S18 减法，仍移除此前因神杖给原生英雄的 T290（100敏捷加成）并清表。力敏智通道、类型重基准和资源依已核接口。T290 只在新值实际受理时对每个英雄查施法者当前神杖资格；装/失神杖不会给已生效记录改参数。每个受理目标另由同目标拥有者的 q001 在施法点创建 T065 一级1秒、写该目标索引、发 `innerfire`；TxShow 且 G066/G073 时分别用 T147/T262，仍同为 10 秒防御+5、无额外百分比攻击与回血，目标圈/友方无敌资格由 Ainf 接口，失败不撤脚本攻击/敏捷。普通正面驱散能清 Ainf 防御，和独立的 S18/T290 timer 分离。Absk 自承伤与 Ainf 防御按各来源类别维护，即使其中 ID 同名。 [源 f62](../../reference/map-6.25/main.disasm#L72638) · [武器字段](weapon-field-source-notes.md)

### A088 坚毅不屈

**Q56。** H027/G045 保留图鉴的永久被动，以及源实际主动和自动 `berserk`。学习入口每次将当前基础 STR 加 20，等级6累计120；沿已核属性、生命与实际学习事件接口，刷新或重新载入不重复派发。主动零蓝、初始CD10，本体 B091 的 DataC=1 按共同接口承伤×2，原生状态 8 秒。

主动 f77/f1 对中心800内玩家非 P11、存活、非工人/箱子、原生英雄按 B04 处理。当前槽等级 L，施法时查神杖，覆盖比较分正常5L、神杖15L。原目标索引既有值更大则跳过；更强或相等，先删除旧 T291 与 timer，再重建10秒、加 T291 和设 L。T291 实际六级力量15/30/45/60/75/90，原无杖虽然比较分5L，仍以同一 T291 给15L；神杖提高比较分，不把两份力量相加。再从施法点创建同受体所有者 q001/T095 一级1秒，写目标索引，发 `innerfire`，成功后10秒+5甲，目标掩码与成功条件沿 A071 的 Ainf 接口（射程800）。 

主动给伙伴的脚本力量、Ainf 护甲和本体 Absk 承伤分别按其来源处理。T291 到期移除对应实际捕获受体并清表；正常改装备、走出圈、原施法者死亡不移动或重新算这个10秒记录，正面驱散只按各原生 Buff 处理。另存三项期限和永久基础力量贡献；同逻辑实体恢复不重学/重施。 [A088 学习与主动](../../reference/map-6.25/main.disasm#L77260) · [T291](../../reference/map-6.25/units_campaignabilitystrings.txt#L22800)

### A126 狂猛

H036/E016，熊灵实例来自其[共用召唤槽](weapon-field-source-notes.md)，CD17/16/15/14/13/12，蓝10/15/20/25/30/40，B137 7秒。EFFECT 先按施法者当前 Tower_ALL 索引撤该槽已有 timer 与 T145。读来源当前 A126 档，若此刻 `DeLuYi_XiongLingHuoBan[索引]` 有熊则先对熊、再对施法者各自移除/加回/置 permanent/设级 T145。T145 是 AIas，实际向每个受体的 R 加 .4/.5/.6/.7/.8/.9；本体变形模板与熊实际攻击由通用武器系统重算。熊上请求 7 秒 BattleRoar 头顶特效。旧贡献不堆叠，同一个 timer 7 秒到点从**当时同索引**的塔及**本次捕获**的熊移除 T145，清记录。中途新熊不继承捕获记录；移除原熊不能把它的记录挪给新熊。原生 B137 只在施法者有承伤变化，被驱散也不单独关 T145。来源都沿无效句柄读写规则，保留原明确的刷新与动态塔表关系。 [源 f98](../../reference/map-6.25/main.disasm#L84535) · [T145](../../reference/map-6.25/units_campaignabilitystrings.txt#L21181)

## 来源位置

| 技能 | 双份图鉴塔技能行 | 实际文本／脚本 |
|---|---|---|
| A024 | 192、453 | [文本](../../reference/map-6.25/units_campaignabilitystrings.txt#L298) · [伤害入口](../../reference/map-6.25/main.disasm#L163000) |
| A037 | 235、350、595 | [文本](../../reference/map-6.25/units_campaignabilitystrings.txt#L484) · [EFFECT](../../reference/map-6.25/main.disasm#L170341) |
| A041 | 126 | [文本](../../reference/map-6.25/units_campaignabilitystrings.txt#L546) |
| A043 | 160、195、240 | [文本](../../reference/map-6.25/units_campaignabilitystrings.txt#L580) · [EFFECT](../../reference/map-6.25/main.disasm#L170361) |
| A068 | 271、427 | [文本](../../reference/map-6.25/units_campaignabilitystrings.txt#L974) · [伤害入口](../../reference/map-6.25/main.disasm#L163278) |
| A071 | 251、286、611 | [文本](../../reference/map-6.25/units_campaignabilitystrings.txt#L1024) · [EFFECT](../../reference/map-6.25/main.disasm#L170221) |
| A088 | 207、317 | [文本](../../reference/map-6.25/units_campaignabilitystrings.txt#L1296) · [学习](../../reference/map-6.25/main.disasm#L169180) · [EFFECT](../../reference/map-6.25/main.disasm#L170477) |
| A126 | 301、306 | [文本](../../reference/map-6.25/units_campaignabilitystrings.txt#L1875) · [EFFECT](../../reference/map-6.25/main.disasm#L170926) |
| A196 | 518、523 | [文本](../../reference/map-6.25/units_campaignabilitystrings.txt#L2854) · [f141](../../reference/map-6.25/main.disasm#L101244) · [ATTACKED](../../reference/map-6.25/main.disasm#L167159) |

## 差异

Q56 确认 A088 图鉴永久被动与原主动共存。图鉴覆盖 A037 整次数值、A041 末级持续、A068 半径／持续／基础冷却、A196 1000半径与3秒，原字段和前置时点同时保留。A043 以显式 5 秒分身移除限制原 6 秒 AOww，原文本 DPS 与图鉴相符。A071 非英雄半值和三项显式 DataC 属源补充。A068 独立力量层、A071 强值覆盖和 A126 撤旧刷新均是各自已确认语义。读档走 [B05](web-baseline.md)，保存独立时限、逻辑槽、实际句柄、当前通道贡献和回调序号，避免重放增益或伤害。

## 未解决

- **A196 高射火炮。** 原 EFFECT 用攻击者 UserData 初始化 f141 的门限4/5/5/6/6/7，添加 T217，取消旧 timer，置3秒一次到期。原 ATTACKED 非幻象且已有 T217 在自动技能之前计数−1，达到0直接移 T217 和 B170，清两个计数/计时表；因此预扣门限通常比实际具效果的攻击值多1。原清理还用全局 `timer` 而不是本槽 timer 参数。T217=Aroc，原 Area1300、DataA每目标1、DataB总预算9,999,999、DataC最多100、Cool2。图鉴在3秒内的每次攻击打击1000内所有敌人，3/4/4/5/5/6次。伤害管线 PC179 的 `Item_Attack_Special` 在**当前** S 有 T217、非幻象且 attack!=0 时调用；其内 i132 概率、i302 远程、i316 三分支已定位。还需闭合技能在 ATTACKED 自动首开计数、可取消前摇和在途攻击跨 T217 消失时的原触发、2秒 Aroc 与逐攻说明、主副箭投递及法球优先。 [攻击装备交接](../../reference/map-6.25/main.disasm#L146245) · [T217 对象](../../reference/map-6.25/units_abilitydata.json)

## 验证

[验证工具](../../tools/audit-self-buff-batch-01.py)从共享索引比对全列、对象增量和角色挂载，复用原字节码执行器检查关键计时、覆盖和伤害边界。16 个边界探针和 400 格图鉴比对通过。定制 Absk/AInf/AOww 未用匹配客户端验证。
