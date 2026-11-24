# 力量压制：最大生命范围伤害与原生模板

本页完成肉山（伪）`n208` 的 `N086_Action`（main/f181/f0）及必要视觉回调。**“肉山血量”实际取本次伤害来源在效果执行时的最大生命值；600范围以受击目标为中心。** 技能额外产生范围伤害，保留父攻击事件；没有脚本眩晕、减速或其他控制。图鉴未区分当前/最大生命，因此这里按原图补缺，没有新增图鉴冲突。

**Q38 已选准确12%，继续采用[既定概率入口](skill-power-suppression-proc.md)，本页不改概率。** T325／末日使者复制技能有独立入口，不纳入本页适配。机器证据、来源指令及案例见 [skill-power-suppression-effect.json](skill-power-suppression-effect.json)。`power-suppression-effect-v1` 中明确标注的原生补缺属于 Q24 的 Web 选择，不是原客户端实测。

## 身份与完整效果

图鉴 `塔技能!B548=n208、E548=力量压制、F548=N086、G548=1`；H548 写攻击有12%概率，对目标600范围敌人造成肉山血量的物理伤害。[实际 Ubertip L13995](../../reference/map-6.25/units_campaignabilitystrings.txt#L13995)一致。[单位技能 L6260](../../reference/map-6.25/units_unitabilities.json#L6260)挂载 `Avul,T033,T037,N087,N086,N085`；本页只解释 N086，不将它的结论扩大到其他技能。

[完整字节码 main/f181/f0，B113990–114052](../../reference/map-6.25/main.disasm#L113990)共34条指令，无条件分支；对应 [Lua L72125–72161](../../reference/map-6.25/main.readable.lua#L72125)。执行顺序为：

```text
S = GetEventDamageSource()
T = GetTriggerUnit()
D = GetUnitState(S, UNIT_STATE_MAX_LIFE)
UnitDamagePoint(S, 0, 600, GetUnitX(T), GetUnitY(T), D,
                false, false, ATTACK_TYPE_CHAOS,
                DAMAGE_TYPE_NORMAL, WEAPON_TYPE_WHOKNOWS)
CreateEffAtLoc("Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl",
               GetUnitLoc(T), 0.8, 1.8)
```

PC1–8读取来源、目标、最大生命；PC9–25构造并提交范围包；PC26–33请求特效；PC34返回。S 是**实际伤害来源**，不替换为其归属塔 O。最大生命不是当前生命、受击者生命、单位物编基础生命或攻击力。D只读取一次，不乘技能等级、神杖、模式或攻击次数，也不在命中者间分摊。来源在范围子事件期间改变最大生命，不回头改变已经提交的D；目标自身的减免和地图回调仍按各自规则处理。

函数不重查技能、概率、攻击标记、正伤害或来源/目标存活，也没有耗蓝/冷却操作；正常入口的公共门槛由概率规格负责。到达helper时父伤害已被之前分支改为0，不自动增加本函数未写的早退。D为0时仍调用范围native，随后请求特效；范围基准决定不制造零金额伤害事件。

## 范围、伤害类型与父事件

实参明确为半径600、延迟0，中心为**调用此范围包时的T坐标**，不是来源坐标。[PC9–25，B114027–114043](../../reference/map-6.25/main.disasm#L114027)保留 `attack=false,ranged=false,CHAOS,NORMAL,WHOKNOWS`。这是图鉴所述物理范围效果的原始类型，不改成 HERO、MAGIC 或 DIVINE，也不因 CHAOS 的名称推断其自动无视护甲。

本调用接入已选 [area-damage-v1](native-area-damage.md)：当前敌方、二维中心闭圆 `distance²<=600²`，稳定创建序号快照；原目标符合条件也包含；无敌/Aloc跳过，NORMAL 对魔免者继续适用伤害流程。地面、飞行、建筑不额外排除，不加普通攻击射程、视野或碰撞半径检查。能力原始 `targs1=air,ground,enemy,neutral` 是 AOcr 对象字段，不是这个脚本native另有友伤/中立伤害过滤的证据；本页沿用范围基准与图鉴的敌人语义。

按范围基准，零延迟同步完成每个目标的独立 [B03](web-baseline.md) 子事件，再恢复父事件；不是B05的零秒timer。每个子事件都以同一份D进入相应类别倍率、护甲及地图流程，不广播某个目标结算后的最终扣血。子事件会照常执行其他满足条件的地图分支。

核心及视觉helper没有 `EXSetEventDamage` 或父事件取消调用。子事件结束后，父事件仍为进入helper时的当前值，后续主流程继续，因此是**额外范围伤害**。其他前后分支仍可能改写父事件，不能将局部规则简化为任何场景最终恒等于“原攻击＋最大生命”。子包 `attack=false`，重新经过[原N086入口 B164474–164492](../../reference/map-6.25/main.disasm#L164474)时在攻击标记处跳过，不再抽Q38，不递归触发本项；T325保持独立规则。

## 特效及“威慑”的边界

[PC26–33，B114044–114051](../../reference/map-6.25/main.disasm#L114044)在范围native返回后重新读取 `GetUnitLoc(T)`，添加战争践踏模型，存活0.8秒，缩放1.8。若范围子事件让T从(10,20)移至(30,40)，伤害圆仍在(10,20)，特效在(30,40)。**0.8不是伤害延迟或控制时长；1.8不将半径改为1080。** 没有TxShow判断，native返回值也被丢弃，因此返回false或没有命中者都不会跳过特效请求。

必要helper已完整核对：

| 函数 | 来源 | 行为 |
| --- | --- | --- |
| CreateEffAtLoc / main/f7/f25 | [B51661–51710](../../reference/map-6.25/main.disasm#L51661) | 缩放参数为nil/false才默认1；先创建effect，再创建单次timer并启动，登记timer/effect同索引，设置缩放并返回effect。本调用明确1.8。 |
| AddArrAny / main/f7/f22 | [B51546–51568](../../reference/map-6.25/main.disasm#L51546) | 从1找首个nil槽，插入timer并返回索引。 |
| Eff_time_end / main/f7/f26 | [B51712–51752](../../reference/map-6.25/main.disasm#L51712) | 查到期timer索引，effect非nil才销毁；始终销毁timer，清空两表该索引。没有i!=-1保护。 |
| IsInTable / main/f7/f7 | [B50776–50810](../../reference/map-6.25/main.disasm#L50776) | nil搜索对象返回-1，否则pairs查相等值，未找到返回-1。 |

这些函数没有施法命令、技能/Buff添加、暂停、减速、击退或控制恢复。**WarStomp模型本身不是战争践踏施法**，“威慑”也不凭名称补成眩晕/恐惧。这里只确认N086这条链；肉山其他能力造成的控制仍保留各自规则。

局部视觉原生边界按Q24明确为：effect是独立逻辑实例，按[B05](web-baseline.md)在创建后0.8秒清理，不因来源或目标死亡提前结束；资源加载失败、渲染关闭不改变伤害、随机数或timer队列。范围结算后若T已被移除，**仅此次视觉位置读取**使用该句柄移除前最后记录的坐标；不重定位已经提交的范围包，不读取新建同类单位，不凭空回退(0,0)。这是未取得匹配客户端无效句柄位置实测后的Web选择，不作为全局GetUnitLoc规则。正常登记缺失时仍保留原helper的-1查找/清理逻辑，不用视觉对象额外恢复游戏状态。

## AOcr 缺项与局部Web适配

[N086能力记录 L25354–25363](../../reference/map-6.25/units_abilitydata.json#L25354)为 `code=AOcr,levels=1`。[原SLK行1396，文件L22653–22661](../../reference/map-6.25/units_abilitydata.slk#L22653)只有身份、代码、checkDep、levels、reqLevel与targs；没有 DataA1/B1/C1/D1/E1，w3a旧/新ID也无N086增量。相同文件的[原AOcr记录 L7885](../../reference/map-6.25/units_abilitydata.json#L7885)另外写15%与2/3/4倍率，不能因代码类型相同就自动叠到N086。

[YDWE开发工具元数据](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/AbilityMetaData.slk#L1730)及其[Ocr1–4标签](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt#L5889)、[Ocr5标签](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt#L8118)把DataA…E对应到暴击概率、倍率、额外伤害、闪避概率和必中开关。[同作者SLK读取器 L19–32、L47–70](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/plugin/w3x2lni/script/core/slk/frontend_slk.lua#L19)将缺失数值正规化为0，按code选元数据后读取自定义记录；这段代码没有复制stock AOcr数值。它是转换工具证据，不能单独证明本图实际客户端缺省行为。[暴雪剑圣说明](https://classic.battle.net/war3/orc/units/blademaster.shtml)说明普通致命一击属于攻击暴击被动，同样未规定这份自定义SLK缺项的执行。

按Q24，`power-suppression-effect-v1`对**N086自身**作如下确定适配：作为脚本被动入口标记，不再额外抽原生AOcr概率、不加暴击倍率或额外单体伤害、不附加闪避/必中/控制；唯一N086触发概率是已决Q38的准确12%，在原入口位置消费。缺省倍率不解释成“普通攻击乘0”。这不取消来源的其他装备/能力效果，不修改T325，也不推导全局AOcr叠加规则。

## 算例与验证范围

| 场景 | 确定结果 |
| --- | --- |
| S当前生命100、最大生命1000，T最大生命9000 | 原始范围金额1000；不取100或9000。 |
| S归属于另一座最大生命5000的塔 | 仍读S的最大生命；不换归属塔。 |
| 圆心(0,0)，敌人中心(600,0)与(600.001,0) | 前者包含，后者排除；不靠模型大小扩圆。 |
| 两名合格敌人，无减免/回调改写，D=1000 | 各自一份1000，不各500；父事件单独继续。 |
| 第一个子事件把S最大生命从1000改为2000 | 本包其他成员输入仍1000；下次独立触发才重新读取。 |
| 进入helper前父伤害已从100改成0 | 仍产生最大生命范围包；完成后恢复父0，不凭空恢复为100。 |
| 没有合格敌人／native桩返回false | 仍请求0.8秒、1.8倍视觉；无额外控制。 |
| 子事件移动或移除T | 移动使用重新读到的新位置；移除使用局部Web最后记录坐标；已提交圆心不变。 |
| 触发在战斗时刻10.0，之后全局暂停 | 视觉清理到期为战斗时刻10.8；恢复战斗时间后继续，不用墙钟补发伤害。 |

JSON保留核心34条及四个必要helper共74条指令，逐条源行可查；核心0条件、8个call、1个return，helpers共5条件、10个call、9个return（含编译器保留的末尾return）。10个核心native桩字节码场景、范围及生命周期规格案例核对通过；校验了图鉴原文、实际Ubertip、原SLK缺项、w3a无增量、source行链接和数值。验证是原字节码加桩及静态规格计算，**不是原客户端或Web游戏运行测试**。

对局保存本规则版本与area-damage-v1/B03/B05。未来取得原生证据时显式迁移版本，不静默改变已有存档。完成范围止于N086效果及必要视觉/模板适配；未展开T325、N085/N087、全局控制来源或其他原生暴击能力。
