# 山崩：概率入口与内置冷却（Q39 已确认）

后续更新：T059/T162的目标、命中时序和控制接口现已在[山崩原生Web基准](avalanche-native-effect.md)明确。下文本批边界保留用于追溯，不表示这些接口当前仍无实现规格；A067/A148外壳与完整换皮等仍另核。

本批只核 **A067 山崩**的身份、内联抽样、攻击事件入口和成功触发后的冷却锁，并核对同入口的 A148。**Q39 已选图鉴的 2 秒共享内置冷却；原脚本的 2.4 秒保留为来源证据。** 这次差异是冷却，不是新的概率百分比裁决。完整机器证据见 [skill-avalanche-proc.json](skill-avalanche-proc.json)。后续 [Q40 效果调查](skill-avalanche-effect.md) 已确认图鉴六级伤害／眩晕成长及300范围，并沿用此处2秒共享锁；原生筛选、命中时序、HERO／抗性等仍保留明确边界。

## 身份对齐

| 图鉴角色 | 技能 ID、等级 | 概率及冷却原文 |
|---|---|---|
| 小小<SR> H021 | 塔技能!F270=A067，G270=6 | H270：攻击有15%的概率造成山崩……每100点力量提升5%的概率，概率最高达到60%，内置冷却2秒 |
| 火焰领主<SR> G059 | 塔技能!F426=A067，G426=6 | H426 与 H270 相同 |

I270/I426 列出六级伤害和眩晕时间，未分级改变上述概率或内置冷却。两个单位的 `heroAbilList` 均含 A067，见 [H021 L4588](../../reference/map-6.25/units_unitabilities.json#L4588)、[G059 L4336](../../reference/map-6.25/units_unitabilities.json#L4336)。

[A067 实际能力说明 L961–972](../../reference/map-6.25/units_campaignabilitystrings.txt#L961) 与图鉴身份一致。**Name L965、Researchubertip L970** 明写上限60%和冷却2秒；**实际 Ubertip L972** 的六级文本均写15%及力量增概率，但未重复上限与冷却。不能把不在 Ubertip 中的句子说成 Ubertip 原文。

A148 实际也叫“山崩”，[Name L2092、Researchubertip L2097、Ubertip L2099](../../reference/map-6.25/units_campaignabilitystrings.txt#L2088) 与 A067 上述规则和六级说明对应。完整遍历图鉴 F 列没有 A148；火焰领主仍以 A067 收录。二者关联有直接来源：

- H021 的 S211 皮肤技能书包含 S212；[S212 的实际说明 L18121](../../reference/map-6.25/units_campaignabilitystrings.txt#L18121) 是“火焰领主／点击切换皮肤”。
- `Model_Change(unit,S212)` 在 HERO 分支中添加再移除 A150，见 [Lua L106813–106827](../../reference/map-6.25/main.readable.lua#L106813)、[字节码 main/f289/f7 PC204–221，L156827–156844](../../reference/map-6.25/main.disasm#L156827)。[A150 对象 L17602–17607](../../reference/map-6.25/units_abilitydata.json#L17602) 为 `code=ANeg`，`DataD1="A148,A067"`。
- 攻击入口明确接受 A067 或 A148，并只调用一次同一个 `A067_Action`；Action 对 G059 查询 A148、选择 T162，其他类型查询 A067、选择 T059。

以上证明源码里的换皮关联和共用入口。此批没有在魔兽客户端执行 ANeg，不能宣称已实测换皮时的原生等级保留细节。**共享冷却由直接脚本独立确证**，不依赖推测 ANeg 的内部行为。

## 原抽样及锁的执行顺序

完整 `A067_Action` 是 **main/f59/f1，[字节码 L71839–71976](../../reference/map-6.25/main.disasm#L71839)**，与 [Lua L44542–44632](../../reference/map-6.25/main.readable.lua#L44542) 对照：

```text
index = IsInTable(attacker, Tower_ALL)
if timers[index] ~= nil: return                  // 先查锁，不抽样、不延长
roll = GetRandomInt(1, 100)                      // 含两个端点
threshold = min(60, 15 + GetHeroStr(attacker,true) / 100 * 5)
if roll > threshold: return                    // 失败不建计时器
生成临时单位并发出 clusterrockets 地点命令
记录临时单位归属索引，释放目标位置
timer = CreateTimer()
TimerStart(timer, 2.4, false, expiryCallback)     // 在这里起算
 timers[index] = timer
```

成功条件为 **`roll <= threshold`**；`GetHeroStr(...,true)` 包含力量加成。六级共享此公式，没有根据技能等级修改概率。原代码只钳制上限60，没有显式下限钳制。原整数判定的实际概率是满足条件的1–100整数个数除以100，例如力量0/19/20/100/900时为15%/15%/16%/20%/60%。图鉴“每100点力量提升5%”未明确零碎力量的取整方式，本批仅记录原行为，**不把这项量化另定为冲突或修改它**。

`timers` 是模块私有的一张表，以塔索引为键，不以技能ID为键。A067/A148 都进入同一个函数；查锁和抽样都发生在 G059／技能等级分支之前。同塔同时持有两个ID，或锁期间改为另一个ID，仍只使用同一把锁。不同塔索引的锁相互独立。该函数没有显式拒绝 `IsInTable` 返回 -1；本批不替非登记攻击者创造新的索引处理规则。

**抽中后发出命令就上锁，不等待命中、伤害或眩晕结果。** `IssuePointOrderLoc` 的返回值被丢弃，失败命令也不会因此免除后面的计时器。抽样失败不上锁；已有锁时完全不抽样，也不会延长或刷新它。

到期回调为 **main/f59/f0，[L71810–71838](../../reference/map-6.25/main.disasm#L71810)**：取 `GetExpiredTimer()` → 在同表中查其索引 → `DestroyTimer(timer)` → `timers[index]=nil`。到期回调清除后才恢复抽样资格；不把“墙钟已达到时限但回调尚未执行”误写成已解锁。

## 攻击入口及公共门槛

[事件注册 Lua L124832–124855](../../reference/map-6.25/main.readable.lua#L124832)、[字节码 main/f291/f31 L179448–179486](../../reference/map-6.25/main.disasm#L179448) 注册被攻击方为 **Player(11)** 的 `EVENT_PLAYER_UNIT_ATTACKED`，调用 `chooseAttackedAction`。来源取 `GetAttacker()`，目标取 `GetTriggerUnit()`；这是攻击开始事件，不要求先产生非零伤害。

`main/f291/f3` 的前150条指令保存在 JSON：

1. 来源是幻象时先执行专用幻象分支，然后返回；不进入 A067，也不抽本项随机数。
2. 普通来源先经过 T217、`Skill_Auto`、N706–N708目标反应及 A022/T316/A023/A077 的既有段落；本批保留顺序，不改这些技能。
3. [PC129–150，L167278–167300](../../reference/map-6.25/main.disasm#L167278) 要求目标非 nil，来源的 A067 或 A148 等级大于0，短路检查后只调用一次 `A067_Action(attacker,target)`。
4. 进入 Action 后先查其冷却表，再抽本项的一次1–100随机数。无技能、零等级、幻象、目标为nil或处于锁内均不会消费本项随机数。

此入口没有自己的伤害值检查、伤害事件 attack 标记、Game_Mode、耗蓝门槛。**不能套入 `anyUnitDamaged` 的 q004/q005/q039/B177 公共早退**，那是另一套事件入口。`Skill_Auto` 中另有 A067/A148 的 `blizzard` 自动命令表，见 [自动施法调查](autocast.md)；它没有第二处直接调用 `A067_Action`，本页不把它混作第二次山崩抽样或证明原生命令成功。

## Q39 的双方规则及效果边界

| 选项 | 触发后内置冷却 | 证据 |
|---|---:|---|
| 按图鉴 | 2秒 | H270/H426；实际 Name/Researchubertip 亦如此 |
| 保留原执行 | 2.4秒 | 字节码常量 k28 在 L71880，加载及 TimerStart 调用在 L71968–71974 |

**Q39 已确认选择图鉴 2 秒。** Q39 单项变更是在同一个成功触发位置将 TimerStart 时长改为2秒；原先查锁、抽样、成功后上锁及到期清理顺序不变，A067/A148同塔共享。累计 Web 方案还须应用 [Q40 的六级成长与300范围](skill-avalanche-effect.md)，不能只改计时常量便视为全部已决规则。概率不在本题重选。

从本次计时器启动时刻起，t=1.999秒仍有锁且不抽样；t=2秒到期回调清锁后才允许再次抽样。若同一时间的攻击回调先于到期清理执行，仍按现存锁阻止本次抽样；不创造隐含的时间比较解锁。再次抽中从这次计时器启动处重新计算2秒。原2.4秒边界同样验证并仅保留为来源证据。

原效果调用证据继续保留：`CreateTempAndSetAbilityLv(owner,sourceLoc,queriedRank,selectedAbility,1,3)`。已对照 [helper 签名 Lua L31454–31488](../../reference/map-6.25/main.readable.lua#L31454)、[字节码 main/f7/f20 L51457–51510](../../reference/map-6.25/main.disasm#L51457)：第三参是**朝向**，第五参是**能力等级**，第六参是存活时间；原调用始终给 T059/T162 传入一级、存活3秒。后续 [效果调查及Q40裁决](skill-avalanche-effect.md) 已排查补偿并确认成长冲突，用户已选择图鉴六级伤害／普通眩晕成长、范围300及Q39的2秒共享锁。原固定一级参数用于复查来源，不再作为当前Web效果要求。

真正剩余的是原生目标筛选、命中时序、HERO／抗性控制和超出“法术伤害”文字的伤害类型映射；ANcs原版分波与ANeg转换细节也未冒称实测。Q40已规定局部Web名义总伤害语义，见该文档的 `avalanche-rank-profile-v1`，不把这些剩余边界误写成“六级成长还未确认”。

本轮只实际检查 A067 一个新内联效果函数，发现冷却差异后停止。当时筛选还命中A084（图鉴397/621行），该项后来已在[精气光环](skill-essence-aura-proc.md)核实并由Q41裁决30%；本页仍不代表全部内联随机机制的完备扫描。

## 验证范围

已对齐工作簿单元格、实际提示、单位挂载和319条唯一源指令；1000个原概率状态、48个入口状态通过，并用局部字节码解释探针检查1–100全部抽样结果、力量边界、A067/A148单独或同时持有、幻象/空目标、锁内不抽样、失败不上锁、命令返回false仍上锁、换ID共享锁、不同索引独立及到期清理。原2.4秒与Q39选定2秒的边界均通过；**此处旧Web探针仅验证Q39计时常量变更，保留原固定一级参数，并未执行Q40六级成长，不能作为Q39＋Q40累计方案的验证。** Q40的等级配置及其验证另见 [效果机器证据](skill-avalanche-effect.json)。机器表保留具体数量和来源哈希。探针使用原生函数替身，只验证已保存字节码的控制流和参数，**不是魔兽客户端实测，也没有完成完整伤害效果**。
