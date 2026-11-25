# 前置与后置装备伤害分派

本页已核查 **ItemDamageActionBefore 与 ItemDamageActionAfter 两个函数的全部条件、顺序、返回路径及直接伤害修改**，关键跳转以字节码为准。不递归还原其全部装备效果，也不把原生引擎或嵌套事件行为算作已验证。

证据为 [main.disasm](../../reference/map-6.25/main.disasm)：L143113–143118 将两个全局函数分别绑定至 `main/f285/f11`、`main/f285/f12`。前者范围 L145510–145621，后者 L145623–145997；阅读辅助 [main.readable.lua](../../reference/map-6.25/main.readable.lua) 从 L97326、L97409 起。[紧凑索引](item-damage-dispatch.json) 保留全部条件的源行、真假去向、业务调用、直接伤害写入及返回位置。

| 函数 | 指令 | 条件 | 全部调用（含查询） | 直接写伤害 | return |
| --- | --- | --- | --- | --- | --- |
| Before | 75 | 10 | 18 | 0 | 2 |
| After | 297 | 31 | 78 | 6 | 3 |

下文 `B-PC`、`A-PC` 分别表示各自函数内部的指令号，不能与主分派器 PC 混用。`S=GetEventDamageSource()` 是实际来源，`T=GetTriggerUnit()` 是目标，`O` 是 After 自己计算的归属单位。`hasItem(U,id)` 表示 `HasItem(U,GetId(id)) != nil`；`hasAbility` 表示技能等级>0；`attack=EXGetEventDamageData(2)`；伤害类型来自数据4。`D` 总是相应读取时的事件值。

## 1. 在主伤害流程中的位置

两个函数都**不接收参数**，都在调用时自行查询事件上下文：

- Before 在主分派器 PC107 / 字节码 L162607 执行，位于主函数初始零伤害排除、归属解析、金币怪恢复之后，位于 A026 等主体技能之前。
- After 在主分派器 PC1917 / L164515 执行，位于普通塔被动之后、英雄三围增伤之前；后面仍有其他技能、怪物响应、模式减伤与统计。
- q039 来源在主分派器跳过两个钩子；B177 的特殊攻击分支发生在 Before 之后、After 之前并直接返回，因此可只执行 Before。
- 钩子自身 return 只结束该钩子，调用者通常继续处理。它与主分派器的 return 不是同一件事。

主流程证据见 [damage-pipeline.md](damage-pipeline.md)。本文不把 After 名称解释成“所有伤害处理完毕后的最后一步”。

## 2. Before：实际来源上的装备

Before 使用 S 查询装备，**不做 `Tower_ALL` 归属映射**。它先取 S、T，再检查 `IsUnitIllusion(S)`；为真就在 B-PC10 / L145551 返回，连 q018 路由也不再执行。

剩余三个分支按下表顺序独立检查；第一个成立不会阻止第二、第三个。

| 顺序 | 完整条件与短路顺序 | 动作及源位置 |
| --- | --- | --- |
| 1 | 先查 S 的 i115；没有再查 i209；有任一件后检查 attack!=0，再检查 S 为原生 `UNIT_TYPE_MELEE_ATTACKER` | B-PC39 / L145582：`i115_Action()` |
| 2 | S 有 i322；然后 attack!=0；然后 S 为原生近战攻击者 | B-PC60 / L145604：`i322_Action()` |
| 3 | 先 S 非 nil；然后 `GetUnitTypeId(S)==GetId("q018")` | B-PC74 / L145619：`i322_Damage(S,T)` |

i115=狂战斧，i209=大狂战斧，i322=遗物之刃；名称对应图鉴 `装备与道具!B25/B119/B215`，亦可在 [economy-data.json](economy-data.json) 按 ID 复查。

可实现的分派伪代码：

```text
S = GetEventDamageSource()
T = GetTriggerUnit()
if IsUnitIllusion(S): return

if hasItem(S,i115) or hasItem(S,i209):
    if attack != 0 and IsUnitType(S,MELEE_ATTACKER):
        i115_Action()

if hasItem(S,i322):
    if attack != 0 and IsUnitType(S,MELEE_ATTACKER):
        i322_Action()

if S != nil and typeId(S) == q018:
    i322_Damage(S,T)
return
```

`or/and` 保留从左到右短路。这里没有自身的零伤害检查，也没有统一的 S/T 非 nil 前置门槛；只有第三个分支单独检查 S 非 nil。q018 分支在幻象排除之后，但不要求装备存在、不要求 attack、也不要求近战。不能给它补上前两个分支的限制。

Before 没有直接 `EXSetEventDamage`，但它调用的效果仍可能修改伤害或创建新事件；“无直接写入”不等于“只产生视觉效果”。

## 3. After：只对 IsTemp 重新归属

A-PC1–29 / L145683–145714 的精确顺序：

```text
S = GetEventDamageSource()
O = S
T = GetTriggerUnit()
if IsTemp(O):
    O = Tower_ALL[GetUnitUserData(O)]
if O == nil: return
if GetEventDamage(0) == 0: return
if IsUnitIllusion(S): return
```

**这里只因 `IsTemp` 映射。** 主分派器另把幻象和 SAPPER 也作为归属映射条件，两个函数的归属算法不同；不能直接把主函数的 O 传给 After 来替代其原逻辑。若某个 SAPPER 同时满足 IsTemp，会由 IsTemp 分支映射；仅有 SAPPER 身份本身不是这里的条件。

零伤害检查是 `==0`，不是 `<=0` 或 `>0`；负事件值未在入口被排除。检查发生于归属非 nil 之后、实际来源幻象检查之前。后面各装备之间不会再次统一检查 D 是否变为零。

## 4. After 的完整顺序

通过入口门槛后，以下十段依次执行。除表内明确的 `else` 外，不互斥，不在一次效果后提前结束。

| 顺序 / 检查范围 | 完整条件 | 动作与字节码位置 |
| --- | --- | --- |
| 1 / A-PC30–50 | O 有 B052；再判断物理类型 | PC50 / L145736：重新读 D，写 `D×1.1` |
| 2 / 51–71 | O 有 B053；再判断魔法类型 | PC71 / L145758：重新读 D，写 `D×1.1` |
| 3 / 72–98 | 先查 O 的 i119，没有再查 i161；任一存在后判断魔法类型 | PC98 / L145787：`i119_Action(O)` |
| 4 / 99–156 | 依次查 O 的 i184、i183、i182、i181、i180、i179，首个非 nil 即停止余下查找；然后判断魔法类型 | PC156 / L145847：`i184_Action(O)` |
| 5 / 157–178 | O 有 i200；再判断魔法类型 | PC178 / L145870：重新读 D，写 `D×1.1` |
| 6 / 179–214 | 先判断魔法类型；若 O 有 i265 则写×1.3；**仅当没有 i265** 才查 i308，存在则写×1.2 | PC199 / L145892 或 PC214 / L145908 |
| 7 / 215–230 | O 有 i267；再检查 attack!=0 | PC230 / L145925：`i267_Action()` |
| 8 / 231–248 | O 有 i132；再判断物理类型 | PC248 / L145944：`i132_Action()` |
| 9 / 249–266 | O 有 i134；再判断魔法类型 | PC266 / L145963：`i134_Action()` |
| 10 / 267–296 | O 有 i263 | 先 PC281 / L145979 写 `D×1.18`；再判断神圣类型：是则 PC291 / L145989 调 `i263_Action2(T)`，否则 PC296 / L145995 调 `i263_Action1(O,T)` |

对应名称：i119 为 EUL的神圣法杖；i161 大法师之戒；i179–i184 达贡之神力 Lv1–Max；i200 纷争面纱；i265 邪念法杖；i308 怨念魔杖；i267 刺客之刃；i132 完美的妖刀村正；i134 完美的妖刀竹光；i263 完美的妖刀鬼切。名称和图鉴坐标可在 [economy-data.json](economy-data.json) 按 ID 查询。

可实现的分派伪代码（入口门槛见上一节）：

```text
if hasAbility(O,B052) and isPhyDamage(type): D = readDamage()*1.1
if hasAbility(O,B053) and isMagicDamage(type): D = readDamage()*1.1

if hasItem(O,i119) or hasItem(O,i161):
    if isMagicDamage(type): i119_Action(O)

if hasItem(O,i184) or hasItem(O,i183) or hasItem(O,i182)
   or hasItem(O,i181) or hasItem(O,i180) or hasItem(O,i179):
    if isMagicDamage(type): i184_Action(O)

if hasItem(O,i200) and isMagicDamage(type): D = readDamage()*1.1

if isMagicDamage(type):
    if hasItem(O,i265): D = readDamage()*1.3
    else if hasItem(O,i308): D = readDamage()*1.2

if hasItem(O,i267) and attack != 0: i267_Action()
if hasItem(O,i132) and isPhyDamage(type): i132_Action()
if hasItem(O,i134) and isMagicDamage(type): i134_Action()

if hasItem(O,i263):
    D = readDamage()*1.18
    if isRealDamage(type): i263_Action2(T)
    else: i263_Action1(O,T)
return
```

`D = …` 在此伪代码中表示 `EXSetEventDamage(…)`，不是给普通局部变量赋值。每次类型/attack 查询在原图对应位置执行；伪代码的 type/attack 是便于阅读的接口记号，**不能据此把原图查询移动到另一个回调、忽略嵌套事件恢复语义**。

由本分派器直接支持的结论：

- i265 与 i308 在本段不同时叠加；i265 优先，写入后仍继续第7段。
- i119/i161 只造成一次 `i119_Action(O)` 调用；达贡的六个 ID 也只造成一次 `i184_Action(O)` 调用。此处不传具体命中的物品，也不在物品栏中循环；不能据此断言被调函数内部怎样选等级、怎样处理重复装备。
- EUL 分支与达贡分支独立，均满足时会先后调用，不能根据“唯一被动”几个字将其中之一提前排除。
- i267 要求实际攻击标记；i132 只要求物理类型，**此入口没有 attack 门槛**。物理技能与普通攻击不能混用一个判定。
- i263 的×1.18在所有通过入口的伤害类型上先执行，再选择神圣或非神圣处理。不是仅神圣伤害获得×1.18。
- B052/B053 查的是 O 身上的能力，不是 T 身上的 Buff。

## 5. 全部返回与直接写入

| 函数 / PC | 原文件行 | 条件或时点 |
| --- | --- | --- |
| Before / 10 | L145551 | 实际来源 S 为幻象 |
| Before / 75 | L145621 | 正常结束 |
| After / 23 | L145707 | 映射后的 O 为 nil，或 O 非 nil 但进入该段时 D==0 |
| After / 29 | L145714 | 实际来源 S 为幻象 |
| After / 297 | L145997 | 正常结束 |

After 的六处直接伤害写入依次是 **PC50×1.1、71×1.1、178×1.1、199×1.3、214×1.2、281×1.18**；199与214互斥。它们各自读取当时事件值，会接收此前装备回调修改后的结果。不得先缓存入口 D，再用同一个入口值覆盖每一步。

## 6. 已核装备效果的复用与边界

**EUL / 大法师之戒**：复用 `main/f234/f0` / L126386–126453 的既有核查。`i119_Action` 接收 O，在函数内部优先检查 O 的 i161；因此入口即使先因 i119 命中，若同时持有 i161，仍用戒指档。用户已裁决 Web 采用 **EUL 10%×1.4、戒指25%×2**；此处不重新询问，也不把原图比较符覆盖回裁决值。该效果位于 B053 的魔法倍率之后、达贡和后续倍率之前。

**刺客之刃 i267**：复用 `main/f261/f0` / L132358–132442 与 [damage-pipeline.md](damage-pipeline.md) 的已核证据。入口依据 O 的装备决定是否调用；但 `i267_Action()` **没有 O 参数**，内部重新读取实际来源 S，用 S 判断 T085/A026，用事件目标读取护甲。不能因为装备属于映射后的 O，就擅自把内部 T085/A026 也改为查 O。原脚本的上限/下限裁剪、深渊折半、与 A026 联动折半和 `1+0.007x` 增幅保留为来源记录；Web 增幅按下述 Q27 替换。

原生正护甲公式已有 [native-armor-and-xp.md](native-armor-and-xp.md) 的来源。Q24 明确 Web 事件基准后，Q26、Q27 均已选择按图鉴比例忽略护甲。原客户端的最终等价性仍未实测；这些 Web 决策不改变本页已核的资格、调用顺序和实际来源/归属来源区别。

**Q27 的精确 Web 计算：** i267 外层仍查 O 的装备和攻击标记；函数内部仍查 S 的 T085（存在则退出）与 A026。令当前分支读取的目标实际护甲为 a，q=0.35；深渊 q/=2，S 有 A026 时 q 再/=2；a<=0 时无此增伤，a>0 时用 `D *= F(a*(1-q))/F(a)` 替换原线性项，F(a)=1/(1+0.018*a)。不修改目标面板护甲。

**组合保留原分派结构：** A026 和 i267 各自在自己的调用点读取实际护甲、生成自己的倍率，按原顺序乘当前事件伤害；不共享“剩余护甲”变量，也不将百分比相加。单独 i267 对 a=100 的倍率为 `2.8/2.17≈1.2903225806`；同时有六级 A026，且两处分支读取的 a 均为 100、无其他事件修改时，非深渊采用 A026 的 30% 与 i267 的 17.5% 两个独立倍率相乘。这个组合结构来自原脚本；每个倍率的替换分别由 Q26/Q27 授权。

**后续效果核查**：i115_Action、i322_Action/i322_Damage、i184_Action、i132_Action、i134_Action、i263_Action1/2 已在 [装备伤害效果](item-damage-effects.md) 展开。IsTemp、HasItem 等辅助函数的既有契约不是本文新增验证范围；Web 事件上下文恢复见基准 B03。本文只保证两个分派函数的条件和调用边界，不声称全部装备功能已经还原。
