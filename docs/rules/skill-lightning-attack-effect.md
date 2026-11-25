# 雷霆蜥蜴闪电攻击：效果与 lightning-attack-native-v1

本页闭合 **N058/N059/N060 的 `N058_60_Action`、直接临时单位包装器、T039 闪电链字段和本次必要的 Alit/AOcr 原生适配**。Q37 已决准确 20%，概率消费时点及全部原入口沿用 [概率入口](skill-lightning-attack-proc.md)，本页不重新裁决。原脚本、原数据与 Q24 授权的 Web 选择分别列出；没有魔兽客户端实测，也没有发现 Q37 之外的新确定图鉴冲突。[机器表](skill-lightning-attack-effect.json)保存条件、调用参数、原始字段、来源哈希和独立的原始/Web 案例。

## 1. 图鉴与实际挂载

| 图鉴技能 / 描述格 | 塔与原生包装能力 | 图鉴及实际 Ubertip 的效果 | 创建的 T039 等级 |
| --- | --- | --- | --- |
| 塔技能!F767 / H767 | n183 雷霆蜥蜴 Lv1<R>；N058 | 攻击敌人时有 20% 概率释放闪电链，造成 400 点法术伤害 | 1 |
| 塔技能!F770 / H770 | n184 雷霆蜥蜴 Lv2<R>；N059 | 同上，800 点 | 2 |
| 塔技能!F773 / H773 | n185 雷霆蜥蜴 Max<R>；N060 | 同上，1800 点 | 3 |

三行 G 列都是 1；它们是三个单级能力，不是同一 N058 学到 3 级。三条实际说明在 [campaignabilitystrings](../../reference/map-6.25/units_campaignabilitystrings.txt#L13668) L13678、13690、13702；它们与图鉴一致。相邻学习提示残留的“15% 致命一击、2/3/4 倍”不是实际 Ubertip。

[单位能力表](../../reference/map-6.25/units_unitabilities.json#L6135) L6135–6148 显示三只蜥蜴分别携带 `N058/N059/N060`，同时都携带 `Alit`。**两个能力在原蜥蜴身上**。新建 q001 的初始列表只有 `Avul,Aloc`（同文件 L6555），随后只添加 T039；脚本不会把原塔的 Alit、AOcr 包装能力、装备或其他能力复制给 q001。

## 2. 完整脚本顺序与所有条件

`main/f177/f0`，[main.disasm](../../reference/map-6.25/main.disasm#L113340) L113340–113435：60 条指令、3 个比较条件、14 处调用、1 条返回。对应 [阅读稿](../../reference/map-6.25/main.readable.lua#L71701) L71701–71763。逐条核对字节码后的规则为：

```text
S = GetEventDamageSource()            // 实际来源，非归属塔 O
T = GetTriggerUnit()                  // 本次原伤害的受击单位
L = GetUnitLoc(S)                     // 在等级查询之前捕获
level = 0
if abilityLevel(S,N058)>0: level = 1
else if abilityLevel(S,N059)>0: level = 2
else if abilityLevel(S,N060)>0: level = 3
D = CreateTempAndSetAbilityLv(owner(S),L,0,"T039",level,0.5)
SetUnitUserData(D,IsInTable(S,Tower_ALL))
IssueTargetOrder(D,"chainlightning",T) // 返回值不检查
return
```

三个比较分别为 **PC15/L113387、PC25/L113398、PC35/L113409**。正等级命中即短路；N058>N059>N060 的优先级与外层准入一致。同时存在三个 ID 时仍只建一名 q001，并使用 T039 等级 1；能力等级为 7 也不把金额乘 7。函数没有额外抽样、模式/A 杖、幻象、属性、当前魔法、冷却、目标生命或阵营判断。它不读写原事件金额、不取消普攻，也不在发令失败时补选目标或重试。

三个能力全无时，**直接调用这个 helper 会把 level=0 传下去**，并非早退；正常入口在此之前已检查至少一个 ID 正等级，所以正常路径不会产生该参数。Web 将异常的零级 T039 命令拒绝并记录集成错误，不把未证明的原生零级行为悄悄升级成一级。

`CreateTempAndSetAbilityLv` 为 `main/f7/f20`，[字节码](../../reference/map-6.25/main.disasm#L51457) L51457–51509，33 条指令、1 个条件、8 处调用、2 条返回，其中末条为不可达编译器尾返回。第七参数 nil/false 才默认 q001；顺序为创建单位→添加能力→设置等级→`UnitApplyTimedLife(BHwe,0.5)`→返回。拥有者为调用时的 `owner(S)`，位置为先前捕获的 L，朝向 0。**0.5 秒是临时单位生命，不是跳跃间隔、闪电伤害延迟或技能持续时间。**

`IsInTable` 为 `main/f7/f7`，[字节码](../../reference/map-6.25/main.disasm#L50776) L50776–50810，17 条指令、2 个显式比较和 1 个迭代回边、1 处调用、4 条返回（末条不可达）。查询对象 nil 立即返回 -1，否则按 `pairs` 遍历，找到相同对象即返回键，未找到返回 -1。本次 **重新查 S 在 Tower_ALL 的位置**，不直接复制 `GetUnitUserData(S)`，不把 S 自动加入表，也不修复 -1。正常塔表应保持一对象一槽；重复对象时原 helper 返回迭代器先遇到的槽，而非承诺最小槽。

本函数不登记 Lua 伤害计时器或技能回调，也不调用 `RemoveLocation(L)`；Web 可以释放位置值，但不能据此减少逻辑临时单位或改变创建顺序。限时生命到期沿共享单位死亡生命周期处理，不增加爆炸伤害；之后的尸体/移除由共享生命周期负责。

## 3. T039、Alit 与 AOcr 的原数据

[能力表 T039](../../reference/map-6.25/units_abilitydata.json#L33042) L33042–33070 的 `code=AOcl,levels=3`：

| 字段 | 1 / 2 / 3 级 |
| --- | --- |
| DataA：每目标伤害 | 400 / 800 / 1800 |
| DataB：命中目标数 | 5 / 6 / 7 |
| Area | 均 600 |
| Rng | 均 2000 |
| Cool | 均 9 秒 |
| targs | 均 `air,ground,enemy,neutral,organic` |
| DataC：逐目标衰减、Cost：魔法费用 | 三档均未显式提供 |

[原始 SLK](../../reference/map-6.25/units_abilitydata.slk#L29297) 第 1918 数据行同样没有 DataC/Cost；已检查完整 w3a 增量，无 T039 覆盖。不能以“继承 AOcl”直接套入 stock 行的 85/125/180、4/6/8、500、700、120 魔法或 15% 衰减。stock AOcl 在能力表 L7853；各自独立保留于机器表。

[T039 实际 profile](../../reference/map-6.25/units_campaignabilitystrings.txt#L19790) L19790–19806 的 Order 是 `chainlightning`，LightningEffect 为 `CLPB,CLSB`，Missilespeed 为 1500，闪电弹道模型为 `Abilities\Spells\Orc\LightningBolt\LightningBoltMissile.mdl`。其内部 Ubertip 仍写 stock 85/125/180 与 4/6/8，不是玩家这组三个能力的实际提示，也不覆盖明确数据。

[YDWE 附带的编辑器元数据](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/AbilityMetaData.slk#L2862)把 Ocl1/Ocl2/Ocl3 映射到 DataA/B/C；[字段名](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt#L5933)分别是每目标伤害、命中目标数、每目标伤害衰减。它支持按 **含首目标的总数**解释 DataB，但未证明本图客户端的完整目标算法。[暴雪技能介绍](https://classic.battle.net/war3/orc/units/farseer.shtml)确认链从指定敌人跳向附近敌人，并记载首目标睡眠时才会继续跳向睡眠目标；官方 stock 数值及“跳几次”的宽泛措辞不替代本图自定义字段。

[Alit](../../reference/map-6.25/units_abilitydata.json#L11078) 的 DataA1/DataB1 都为 0.25。[Lit1/Lit2 元数据](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/AbilityMetaData.slk#L6223)及 [字段名](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt#L6074)证明它们是**图形延迟/图形持续时间**，不是 25% 概率或伤害倍率。其 profile L9768–9775 使用 `CHIM` 和奇美拉闪电模型。当前数据没有第二组链伤害、跳数或概率参数；仅凭名字“闪电攻击”不能生成第二条 T039。

N058/N059/N060 的 AOcr 包装行在 [能力表](../../reference/map-6.25/units_abilitydata.json#L24954) L24954–24986，均没有 DataA–E，也无 w3a 覆盖。stock AOcr 的 15%、2/3/4 倍不会自动成为已证实的额外效果。[YDWE 转换器](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/plugin/w3x2lni/script/core/slk/frontend_slk.lua#L19)对缺失数值采用零值且读取自定义行；这只是工具实现，不是对应 Warcraft 客户端缺省继承的证明。

## 4. Q24：本技能专用原生执行规则

以下为 **`lightning-attack-native-v1`**，只覆盖此次 T039 与这组三个 AOcr 包装及其 Alit 联动。原资料未闭合的接受时点、衰减缺省、目标选择、复跳、几何、睡眠/护盾顺序和伤害 native 类型由此确定。沿用 [B03/B04/B05](web-baseline.md)，不把本规则推广到所有闪电链或所有缺省字段。

**发令及接受。** q001 的此次命令采用零前摇、零魔法费用；9 秒冷却在接受时写在 q001 的 T039 上，不能写给原塔或让该塔 9 秒只能触发一次。q001 初始/最大魔法均为 1000（[balance](../../reference/map-6.25/units_unitbalance.json#L37578)），武器表未给它显式 castpt（[weapons](../../reference/map-6.25/units_unitweapons.json#L34183)）；零前摇/费用是局部 Web 选择，不能拿原蜥蜴的施法点替代。

命令时 q001 必须仍存在、存活且可施法；首目标必须为原 T，不重选。以此时的中心位置检查 q001→T 距离≤2000；T 必须存在、生命>0、相对 q001 为敌方或非同盟中立方、有机地面/空中单位、非建筑/机械/ward、非无敌/魔免、没有有效 Aloc。不加视野/隐形侦测门槛，不因名字 Boss、原生英雄、召唤或普通幻象身份额外排除。目标能力与类别按有效状态判断，不从模型推断。无效命令不扣魔法、不进冷却、不发 SPELL_EFFECT、不消耗盾，已消费的 Q37 抽样和已创建的 q001 均不撤销。

有效命令接受后记冷却并发一次 q001 的 SPELL_EFFECT。q001 被 `IsTemp` 识别，通用 `AnySkillStart` 在 [L170040–170066](../../reference/map-6.25/main.disasm#L170040) 早退，不递归触发塔的装备施法响应。其后检查下节首目标护盾，再执行链条；每个后续链击不是一次新施法，不重复 SPELL_EFFECT。

**目标链。** 首目标在接受时记录 `primaryWasAsleep`。最多命中 5/6/7 个**不同逻辑单位，含首目标**；无候选即结束，不为凑满数回跳。每击在提交前记录该目标当前二维中心，然后同步提交该击的完整伤害事件；该事件和全部嵌套事件返回后，才从当前世界查询下一目标。以下一跳与前一击记录中心的距离≤600 为闭圆，不加碰撞半径，也不要求仍在 q001 的 2000 施法范围。跳跃不是一个以原塔为中心的固定圆。

下一目标须满足上段同样的有效性/敌我/类型/免疫条件，且未在本条链 visited 集合中；若首目标原本未睡眠，当前睡眠候选被排除；首目标原本睡眠则允许两类候选。候选按 **B04 单位创建序号升序**选择第一个，不采用未证实的最近距离、随机排序或原生枚举顺序。一个目标被击中后死亡、移除或移动，不撤销已记下的出发点；其回调新建/复活的其他单位可在下一跳重新查询时入选，但同一逻辑 ID 不得再中本链。下一候选在前次子事件中死亡、变无敌/魔免、换阵营或移出范围，就不能入选。

**伤害与时间。** DataC 在本适配取 0，每个被选目标都提交本等级同一原始金额 400/800/1800，不均摊、不逐跳乘 0.85。每击采用 `attack=false,ranged=false,ATTACK_TYPE_NORMAL,DAMAGE_TYPE_MAGIC,WEAPON_TYPE_WHOKNOWS`；这里 ATTACK_TYPE_NORMAL 是脚本 native 常量对应的 spells 攻击类型，不能混作物理 NORMAL 伤害。该组合为依照图鉴“法术伤害”和地图 `SetMagicDamage` 组合选定的 Web 行为，原 T039 的隐藏 native 包类型本身未从 Lua 得证。

整链在 `IssueTargetOrder` 调用内同步完成，依次经过 B03 减免、完整伤害分派和最终扣血，再恢复父上下文；**不是把 5/6/7 个扣血结果一次性广播**。不按 1500 弹道速度推算命中延迟、不插入 0 秒计时器，也不让 0.5 秒限时生命截断一条尚在飞行的逻辑链。视觉可沿原 CLPB/CLSB 和弹道资源显示，但无额外伤害时钟。若嵌套事件移除/杀死 q001，已经完成的伤害保留，后续链击停止；原塔 S 死亡但 q001 仍有效时不以此另行取消。

每一击的**实际来源始终是 q001**。主伤害流程在 [L162523–162547](../../reference/map-6.25/main.disasm#L162523) 依 `IsTemp(S)` 和 `Tower_ALL[S.userData]` 重新解析归属 O；不能把伤害包源直接替换为原塔，也不对整条链缓存一个永远有效的 O。槽位改变或 userData=-1 时保留原分派的解析结果与已有空值边界，不自动修成原塔。父普攻的事件金额保持原值；其他主流程回调仍可修改最终值。链击 attack=false，不递归进入要求攻击标记的 Q36/Q37 分支，但其他可用的伤害、装备、模式和怪物响应照常执行。

**N535 护盾。** [N535 数据](../../reference/map-6.25/units_abilitydata.json#L27020)为 ANss、Cool1=6；ma02–ma06、mw14 的初始挂载见 [单位表](../../reference/map-6.25/units_unitabilities.json#L5730)。[官方法术说明](https://classic.battle.net/war3/basics/spellbasics.shtml)支持魔免与负面定向法术护盾，但没有闭合本图链击护盾的细节。本次局部选择是：有效首目标有 N535 且 `now>=shieldReadyAt` 时，接受施法后消耗护盾，设 `shieldReadyAt=now+6秒`，**拦整条 T039 链**；冷却中则正常继续。与 [妖术适配](item-hex-effect.md)共用该单位同一 N535 冷却状态，不能按技能另存一份。无效首目标不消耗盾；后续链击不视为新定向施法，**不检查/消费其 N535 护盾**，但仍检查魔免、无敌及完整伤害响应。这是 Q24 的局部明确定义，不冒称原客户端已验证，也不概括成所有链状技能均如此。

**Alit/AOcr。** 本适配让 Alit 仅渲染原普通攻击的 CHIM 闪电外观：以普通攻击实际提交时刻为起点，0.25 秒后显示，显示 0.25 秒；不改普通攻击命中时间、不额外抽样/发包/发 T039。N058/N059/N060 这三个 AOcr 包装不再提供原生暴击概率、倍伤、额外固定伤害、闪避或必中特性；缺失/归零的乘数字段不会把普通伤害乘成零。原普攻、Q37 成功后的一条 T039、纯视觉 Alit 可以同时发生；不能算成两条伤害链。这项缺省处理与上一批雷霆战斧的局部选择一致，但没有改写其他 AOcr ID 或其他塔的能力。

## 5. 验收与完成边界

| 案例 | 确定结果 |
| --- | --- |
| 同时具有 N058/N060，N058 等级 7 | 一名 q001，T039 等级 1，每击原始 400；不是等级 7 或 1800 |
| 实际来源不在 Tower_ALL，自己 UserData 为 9 | 新 q001 UserData=-1；不复制 9，不自动注册来源 |
| q001→首目标距离 2000 / 2000.001 | 前者可接受、后者拒绝；均已消费原 Q37 抽样 |
| 一跳候选中心距 600 / 600.001 | 前者可选、后者不可选；碰撞半径不扩圈 |
| 等级 1 有 8 个连续可达敌人 | 最多 5 个不同 ID，各 400 原始金额，总输入最多 2000；不是 6 个或保证扣血 2000 |
| 首目标距 q001 1900，下一目标距首目标 500、距 q001 2400 | 下一目标仍可选 |
| 两候选都在圈内，较远者创建序号更小 | 先选较远者；规则是 B04，不是最近优先 |
| 第一击杀死/移除自己，并杀死下个候选 | 用第一击前位置继续找；已死候选不可选；每击完整分派后重查 |
| 第一击创建新敌人，其序号与位置合格 | 下一跳可入选；不是整条链一次性目标快照 |
| 首目标魔免 / 只有次级候选魔免 | 分别整条命令拒绝 / 跳过该候选继续选 |
| 首目标 N535 就绪 / 次级目标 N535 就绪 | 前者消耗盾、整链零伤害；后者按本适配不消费盾，照常受该击 |
| t=1 秒被妖术消耗 N535，t=2 秒成为首目标 | 护盾冷却至 t=7，本次链可命中；t=7 则可重新拦截 |
| 父普攻 100、无其他修正，首目标有效且只选中它，T039 等级 1 | 子击先结算 400，父事件值仍 100；父最终仍可被后续流程改写 |
| 原塔中途死亡，但 q001 未死；或 q001 被子回调移除 | 前者继续；后者在已完成子击后停止剩余链 |

限定完成：完整核查上述 3 个函数的 **110 条字节码、6 个显式比较、1 个迭代回边、23 处调用、7 条返回**（包含不可达尾返回）。核查范围限于本页所列函数及下述探针。通过 30 组核心字节码探针、3 组临时单位包装探针及 5 组表查询探针；机器表分别保存 23 条来源案例与 51 条 Web 案例。20 条对象记录、5 组 profile、3 行图鉴、21 个本地链接及来源哈希均已校验。这些使用原生桩与独立的局部 Web 状态模型，不是运行魔兽或游戏后的结果。概率 helper/公共入口沿用已独立验证的 Q37 文档，未在本批改写。

仍属原客户端未知而由 Q24 封闭的项目：自定义缺省字段加载、精确链选序/复跳/几何/睡眠读取时点、native 发包类型/时钟、首目标施放接受及 N535 次级命中行为、Alit 与其他原生攻击特效的完整交互。未递归其他蜥蜴技能 N061–N063/N159、全局攻击生成、全部装备/怪物伤害子模块或其他链技能；这些不应藏在“本技能效果已完成”之下。
