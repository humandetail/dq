# 回蓝光环：A018 与 I230

本批只闭合奥术光环 A018/B022 和巨虾回蓝光环 I230/B054。基准 ID 为 **`mana-auras-v1`**。数值按图鉴和原对象数据；原客户端不能从公开资料证明的筛选、叠加、生命周期采用 Q24 已授权的明确 Web 选择。本页不是原客户端实测，也不把选择推广给其他 AHab 派生能力或所有光环。机器证据与案例见 [mana-auras.json](mana-auras.json)。

## 1. 图鉴、实际说明与全等级对象

| 能力 | 图鉴位置与持有者 | 每秒友方加成 | 自身加成 | 半径 | 状态 |
|---|---|---|---|---|---|
| A018 奥术光环 | `塔技能!H182:I182` 冰晶少女 G039；`H403:I403` 水晶室女 H004 | 1–6 级：2/3/4/5/6/8 点 | 4/6/8/10/12/16 点 | 1200 | B022 |
| I230 巨虾回蓝光环 | `塔技能!H809` 巨虾 Max n245 | 1 级：3 点 | 3 点 | 800 | B054 |

A018 的实际 Name、Researchubertip 明写自身双倍与 1200；Ubertip 列出的六级值也与图鉴相同。I230 的实际 Ubertip 写范围 800、队友魔法回复 +3；B054 的实际 Buffubertip 同样写 +3。它的对象目标包含 `self`，所以 Web 也使巨虾自身受益；这里不把“队友”擅自解释成排除自己。来源：[技能说明 L208–220](../../reference/map-6.25/units_campaignabilitystrings.txt#L208)、[I230 L11959–11966](../../reference/map-6.25/units_campaignabilitystrings.txt#L11959)、[B022 L172](../../reference/map-6.25/units_commonabilitystrings.txt#L172)、[B054 L391](../../reference/map-6.25/units_commonabilitystrings.txt#L391)。

原对象事实如下，JSON 同时保留完整记录和原始 SLK 的行/列名定位：

- [A018 SLK 整理值 L14024](../../reference/map-6.25/units_abilitydata.json#L14024)：`code=AHab`，`levels=6,reqLevel=1`；`DataA1..4=2,3,4,5`；`Area1..4=1200`；`BuffID1..4=B022`；四级 `targs=nonancient,invulnerable,self,friend`。
- [A018 w3a L241](../../reference/map-6.25/war3map.w3a.json#L241)：`Hab1` 第 5/6 级明确覆盖为 6/8。**这两个数值是明确物编增量，不是把第 4 级重复到高等级。** Area/Buff/targets 第 5/6 级没有独立覆盖；Web 按最后一项补齐，范围也有六级共用的图鉴和实际说明支撑。
- [I230 L22099](../../reference/map-6.25/units_abilitydata.json#L22099)：`code=AHab,levels=1,DataA1=3,Area1=800,BuffID1=B054`，同样的目标字符串；没有相关 w3a 覆盖。`targs2..4="_"` 不产生额外等级。
- 两组的 DataB 均没有显式值，不能把“未写”伪称为原文件写了 0。Web 根据明确的“点/秒”说明使用 `percentBonus=false`，不是按最大魔法或基础回复乘以 2/3/4…倍。`Hab1/Hab2` 对应 DataA 数值与 DataB 百分比开关，可由 [YDWE 的 AbilityMetaData](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/AbilityMetaData.slk#L1536) 和 [WorldEditStrings 字段名](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt#L5880) 交叉核对。高等级补齐是明确的 Web 导入规则，参考 [w3x2lni 补齐逻辑](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/plugin/w3x2lni/script/core/slk/frontend_merge.lua#L18)，不冒充原客户端实现。
- [B022 L801](../../reference/map-6.25/units_abilitybuffdata.json#L801)、[B054 L897](../../reference/map-6.25/units_abilitybuffdata.json#L897) 的 Buff 数据只有 alias；能力对象也没有可据以确定光环扫描周期/残留时长的 Dur、HeroDur。两组作为被动，不下发命令、不花魔法、不创建伤害或施法触发事件。

**自身双倍的证据边界：**图鉴和实际说明一致要求双倍，但 DataA 只有统一回复值，以下已查脚本入口没有额外自身补偿。原生运行版本未匹配，不能仅凭缺少补偿脚本就宣布原图确实只回复单倍，也不能声称已复现原生双倍机制。本页直接实现已明确的图鉴要求；当前没有新增、足以提交用户裁决的确定冲突。

## 2. 实际能力来源与通用动态路径

不能以 A018/I230 没有专用 Lua 模块为理由把它们当静态标签。已核以下获取、学习、变身和通用增删路径：

| 路径 | 可复核事实与边界 |
|---|---|
| 初始挂载 | [G039 L4216](../../reference/map-6.25/units_unitabilities.json#L4216)、[H004 L4486](../../reference/map-6.25/units_unitabilities.json#L4486) 的 `heroAbilList` 都是 `A016,A017,A018,T000,P000`；所以 A018 要读实际已学习等级，不能出生即当 6 级。H004 另带 S081。|
| 巨虾升级 | [n244/n245 L6440 起](../../reference/map-6.25/units_unitabilities.json#L6440)：n244 没有 I230，n245 的 `abilList=Avul,I230,T033,N110`。[单位说明 L7242](../../reference/map-6.25/units_campaignunitstrings.txt#L7242) 明写 `Upgrade=n245`。升级完成后产生一个 1 级发射源。n245 有实际魔法池与基础回复，[unitbalance L36960](../../reference/map-6.25/units_unitbalance.json#L36960)，不能因名称是辅助塔就假定自身无蓝。|
| 学习事件 | [Lua L116207–116455](../../reference/map-6.25/main.readable.lua#L116207) / [字节码 `main/f291/f10` L168967–169293](../../reference/map-6.25/main.disasm#L168967)。完整 237 条指令，先拒绝 nil/幻象，再对一组明确技能分派；A018 落到函数末尾，没有额外自回蓝分支。原生已学习的等级仍有效；此事件没有负责手动添加所有被动。|
| 建造/升级事件 | [注册 L124960](../../reference/map-6.25/main.readable.lua#L124960) 同时接 construct finish/upgrade finish；[handler L115286–115424](../../reference/map-6.25/main.readable.lua#L115286) / [字节码 `main/f291/f7` L167771](../../reference/map-6.25/main.disasm#L167771) 注册 Tower_ALL、开 T033、去 N032、补满蓝，英雄/n208 抽 P001–P013。完整 130 条指令未重写两组光环。|
| 水晶室女换皮 | H004 的 S081 是包含 S082 的 spellbook。S082 经 [AnySkillStart 末端 L118658](../../reference/map-6.25/main.readable.lua#L118658) 调 `Model_Change`；[表 L104319–104329](../../reference/map-6.25/main.readable.lua#L104319) 映射 S082→k139/R082；[函数 L106613](../../reference/map-6.25/main.readable.lua#L106613) / [字节码 `main/f289/f7` L156530](../../reference/map-6.25/main.disasm#L156530) 最终 `UnitAddAbility(unit, R082)`；[R082 L29054 起](../../reference/map-6.25/units_abilitydata.json#L29054) 是 Acha，`UnitID1=G039`。两种形态共享 A018。|
| 换皮的相关影响 | `Model_Change` 会依已定权益规则加三围，并调用 `Skill_BS_Still` 恢复移速/攻击间隔等状态；这些影响其他基础属性，不是 A018 自身双倍的第二份光环。原生 Acha 技能等级保留细节没有本机实测；Q24 规定 H004→G039 保持同一实体和实际已学 A018 等级，只重算一次，不多造发射源，也不额外学级。|
| A 杖通用增删 | [Lua L30202–30416](../../reference/map-6.25/main.readable.lua#L30202) / [字节码 `main/f7/f11,f12` L50925–51200](../../reference/map-6.25/main.disasm#L50925)。动态配对只有 A105→A106、A153→A154；另有指定技能切换与 T252。没有给 A018/I230 加级或附加回复。A016 的 A 杖效果不在本批重审。|
| 运行时字段写入 | `main.readable.lua` 唯二 `EXSetAbilityDataReal` 在 [A224 的 T286 临时能力 L68371–68392](../../reference/map-6.25/main.readable.lua#L68371)，并非这两组光环。|
| JASS 的动态技能读表 | [war3map.j L2076–2104](../../reference/map-6.25/war3map.j#L2076) 从卡片→单位→`heroAbilList` 读能力，服务抽卡界面的图标/提示；本段不增删能力、不改回复数值。|

主 Lua/字节码/JASS 没有 A018、I230、B022、B054 的精确字符串或对应 FourCC 十进制引用；全能力 SLK 的此两 ID 使用处也已扫描。此结论和上表合用，仅代表这些已核来源路径。后续若别的已验证技能实际增删它们，必须接本页运行时能力接口；不得把 `unitTypeId` 白名单作为唯一发射条件，也不得声称穷尽外部注入或所有原生变身行为。

## 3. 原生资料能证明到哪里

Blizzard 的 [大法师说明](https://classic.battle.net/war3/human/units/archmage.shtml) 支持普通 Brilliance 是友方含自身的固定每秒回复；其原版数值不能覆盖本图。Blizzard 的 [Spell Basics](https://classic.battle.net/war3/basics/spellbasics.shtml) 说同一光环不叠加、光环有脉冲、自身受益、友方魔免可受光环、隐身源不发出光环。它没有定义这两种自定义 AHab 的分组键、精确距离边缘或源死亡后的时长。

同一独立引擎项目也不能当作匹配版本的唯一答案：[Warsmash Java AuraBase](https://github.com/Retera/WarsmashModEngine/blob/f9e0aeed4be372d6016519d0e97b384aa873f374/core/src/com/etheller/warsmash/viewer5/handlers/w3x/simulation/abilities/skills/util/CAbilityAuraBase.java#L16) 采用 2 秒检查、按 Buff ID/等级挑选；[BuffAuraBase](https://github.com/Retera/WarsmashModEngine/blob/f9e0aeed4be372d6016519d0e97b384aa873f374/core/src/com/etheller/warsmash/viewer5/handlers/w3x/simulation/abilities/skills/util/CBuffAuraBase.java#L18) 另做距离检查和受体死亡清理。但该提交的 [JASS Brilliance](https://github.com/Retera/WarsmashModEngine/blob/f9e0aeed4be372d6016519d0e97b384aa873f374/resources/Scripts/Abilities/Human/Archmage/Brilliance.j#L6) 使用固定 `BHab` 非叠加统计键。因此不能仅凭 Java 的两个 Buff ID 就断言本图必然相加，也不能把固定键当本图一定互斥的证据。

[YDWE 携带的 MiscGame L26–32](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/MiscGame.txt#L26) 列出幻象、隐身、变羊、钻地、复生尸体、飞行英雄不发光环等开关；本图 `war3mapMisc.txt` 没有这些项的覆盖，但版本无法匹配，不能把外部默认值冒充本图明确值。下节将这些状态作为这两组的 Web 选择落实。

## 4. `mana-auras-v1` 可执行 Web 规则

以下**均为 Q24 下的定案**，只有数值/对象目标等上节已经确证的部分属于原文件事实。

### 发射与接收

1. 发射源必须存在、存活、未隐藏，实际持有并启用对应有效等级。未学/等级 0 不发射；超出 A018 1–6 或 I230 1 的等级是内容错误，不默默钳制。普通眩晕、沉默、单位暂停不自行停被动；全局游戏暂停停止模拟时间。幻象、隐身/影遁、变羊/妖术、钻地、复生尸体及当前飞行的原生 HERO 不发射。这是该两组的明确选择，不改变其他被动规则。
2. 受体必须存在、存活、未隐藏、不是 ancient，且为同所有者或“源玩家对受体玩家”的联盟关系允许。允许自身、地面/空中、建筑、机械、亡灵、召唤物、幻象；无敌、普通可伤、魔免、虚无及隐身受体都可接收。没有视野、路径或碰撞体要求。法术护盾不消耗、不拦截；抗性皮肤不折算该被动。
3. 使用二维中心点闭圆：`dx²+dy² <= R²`；恰在 1200/800 生效，超出即不生效，不加单位 collision。无魔法池者可显示有效 Buff，实际回复为 0，不凭光环制造魔法池。最大魔法值变化后重新按新上限钳制。

### 加成与叠加

对每个合格源构造候选值：A018 为该级基础值；**源实体与受体实体相同**时仅这个候选值乘 2。I230 固定为 3。

```text
arcane = max(所有合格 A018 候选值, 0)
shrimp = max(所有合格 I230 候选值, 0)
flatAuraRegenPerSecond = arcane + shrimp
```

同组取最大、不相加；两组独立相加。相同数值并列时只用最小稳定 sourceId 记录来源，数值不变。不同 Buff 分组是 Web 选择，不是已证明的原生堆叠机制。自身双倍不翻倍别人提供的 A018、巨虾光环、智力回复、物品回复或瞬时回蓝。

例如：1 级水晶室女自身候选为 4，附近另有 6 级 A018 候选 8，最终奥术贡献是 8；6 级自身奥术加巨虾贡献是 `16+3=19`；其他单位同时受 6 级奥术和两只巨虾，只得 `8+3=11`。

该结果进入独立固定回复通道：先得到其他已经解析的回复值，再加此通道。**一般的百分比回蓝修正不再放大此固定通道**；这是原生总公式未证明时的明确 Web 次序选择。持续回复按模拟时间累积，不按帧/每秒向整数取整，保留小数，最终钳制到 `[0,maxMana]`；满蓝时不积存溢出。技能耗蓝和瞬时回蓝保持原有提交顺序，本光环不产生伤害、施法或装备触发回调。

### 生命周期与事件次序

Web 规则采用**立即重算、零残留**。能力获得/移除/启停、学习/等级变动、建造/升级完成、位置更新与范围跨越、联盟/归属变化、隐身/变羊等资格变化、死亡/删除/复活及形态转换，都在该状态变动点重算候选。

先用旧回复率结算到该模拟时间，再应用状态变化，随后在同时间戳的下个可观察操作之前重算。同时间事件仍按 B05 原队列顺序处理，不额外塞一个零秒 timer。移动按权威位置更新判定边界，不追溯补发进入前的回复。

- 源离开/死亡/移除/失去能力：立即去掉该候选，同组还有源时同次操作退回次大值，不把整组粗暴清零。复活/返回后重新判资格。
- 受体死亡/删除/隐藏：立即清两组 Buff 和贡献，不带旧状态复活。取消隐藏后重新计算。
- B022/B054 各只有一个展示和逻辑记录，分别仅在对应组贡献大于 0 时存在。重复扫描不能累加 bonus，也不能因换皮添加第二份。
- 普通驱散不关闭 universal 光环。若某个明确脚本直接按 rawcode 移除 B022/B054，先清记录，再在同一操作重算；合格源仍在则恢复，不出现延迟断档。其他技能若明确禁用能力，应走“实际能力启用状态”接口。
- H004→G039 保持同一实体、同一 A018 等级；n244→n245 在升级完成后提供一个 I230。若另一种经核实的变身确实剥离能力，本基准即时停掉其光环，不强行保留原单位类型的技能。

存档保存实体稳定 ID、实际能力等级/启用、形态、位置、归属/联盟、资格状态、小数魔法和模拟时间。恢复时重建候选和两组 Buff，不补发离线回复、不按旧缓存再次加一次；无待恢复光环脉冲/残留 timer。

## 5. 验证与有限边界

机器表保存源文件哈希、6 个能力记录与原始 SLK 的逐字段一致性、相关 w3a 增量、5 个通用函数的完整字节码摘要。已校验 1008 条指令身份，执行 8 个学习事件入口状态、S082 换皮路径与 2 个建造入口状态的原生桩探针，并通过 56 个 Web 基准案例；重新只读核对了图鉴上述三个坐标。验证包括 A018/I230 学习事件落空路径、同组大小值切换/跨组相加、自身双倍边界、恰在半径与刚超出、各排除/允许类型、源死亡回退、能力去除、变身不重复、瞬时重算次序、小数回复/封顶/恢复。

尚未证明的是原客户端的实际扫描周期、源死亡残留、不同自定义 AHab 原生叠加以及完整原生回蓝修正顺序；这些在本页已选定可执行 Web 行为，**不是阻碍实现的悬空项**。其他回蓝装备/技能各自的数值与持续期、其他变身的技能继承、其他光环堆叠仍按其后续独立调查；本页不擅自替它们定案。本批未修改图鉴、地图来源、旧规则文件或游戏程序。
