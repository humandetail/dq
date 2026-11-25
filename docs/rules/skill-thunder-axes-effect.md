# 雷霆战斧：额外范围伤害、原攻击与原生模板

本页完成 `N054_57_Action`（main/f176/f0）及必要的特效创建/销毁回调，补上 N054/N055/N056/N057 的效果规格。**Q36 已确认准确15%，触发入口、抽样时点及公共早退沿用 [概率入口](skill-thunder-axes-proc.md)，这里不另改概率。** 本批未发现其他确定的图鉴冲突。[机器表](skill-thunder-axes-effect.json) 分开记录字节码、源字段、Q24 的原生补缺及验证案例。

## 图鉴四行对应四个独立能力

| 图鉴 ID／说明位置 | 塔 | 能力 ID | 原始范围伤害 |
| --- | --- | --- | ---: |
| 塔技能!F726／H726 | n179 树魔狂战士 Lv3<R> | N054 | 800 |
| 塔技能!F729／H729 | n180 树魔狂战士 Lv4<R> | N055 | 1200 |
| 塔技能!F732／H732 | n181 树魔狂战士 Lv5<R> | N056 | 1800 |
| 塔技能!F735／H735 | n182 树魔狂战士 Max<R> | N057 | 4000 |

四行都写攻击敌人时15%概率产生重击，对500范围敌人造成对应物理伤害，未写眩晕、减速或持续时间。`G726/G729/G732/G735` 均为技能等级1；这不是给 N054 升至第2、3、4级。原图挂载对应见 [unitabilities L6115–6133](../../reference/map-6.25/units_unitabilities.json#L6115)。实际 Ubertip 的伤害、范围、概率与图鉴一致：[campaignabilitystrings L13630/13642/13654/13666](../../reference/map-6.25/units_campaignabilitystrings.txt#L13630)。同段 Researchubertip 仍是剑圣致命一击的旧文案，不能拿它替换实际技能说明。

## 完整效果函数与优先级

核心函数 [main/f176/f0，B113162–113290](../../reference/map-6.25/main.disasm#L113162) 读取 `S=GetEventDamageSource()`、`T=GetTriggerUnit()`。S 是实际伤害来源，不能自动换成归属塔 O。

档位选择按如下短路顺序，关键分支为 PC12/22/32，B113213/113224/113235：

```text
若 S 有 N055（等级>0）：档2，1200
否则若 S 有 N056：档3，1800
否则若 S 有 N057：档4，4000
否则：档1，800
```

N054 不在此函数内重查，外层入口已检查四技能之一。多能力同时存在时是 **N055优先于N056优先于N057**，不是取最大伤害；N054与N057同时存在则取4000，四者都在则取1200。技能等级只用于判断>0，不乘入伤害公式。直接调用 helper 且四技能全无会落到800，但正常外层入口不会因此调用它。

随后将档位1/2/3/4映射为800/1200/1800/4000；另有非法档位 return（PC54），但本函数自身只赋值1–4，因此该防御性 return 没有由上述合法分支到达的路径。没有攻击力、属性、神杖、模式、目标生命、冷却、耗蓝或再次抽签的局部条件。

## 范围包、中心及原攻击

范围 native 的全部实参在 PC55–71，B113265–113281：

```text
UnitDamagePoint(
    S, 0, 500,
    GetUnitX(T), GetUnitY(T), selectedDamage,
    false, false,
    ATTACK_TYPE_MELEE, DAMAGE_TYPE_NORMAL, WEAPON_TYPE_WHOKNOWS
)
```

圆心是本次调用时 **受击目标 T** 的位置，不是来源 S 的位置；半径500；延迟0；金额按所选档位计算一次，不在各目标之间分摊。`ATTACK_TYPE_MELEE`、`DAMAGE_TYPE_NORMAL` 原样保留：不能写成 HERO、MAGIC 或 `ATTACK_TYPE_NORMAL`；类型名 MELEE 也不构成“只准近战来源触发”的额外条件。

此函数没有 `GetEventDamage`、`EXSetEventDamage` 或取消父事件的调用。它制造**额外**范围包，原攻击事件仍按原主流程继续，不变成“原攻击被800点取代”。按既有 [B03](web-baseline.md) 和 [area-damage-v1](native-area-damage.md)，零延迟范围包同步逐个完成子事件，再恢复父事件；恢复后父事件值仍是其进入 helper 时的值。其他地图分支随后仍可能改写父事件，所以不能把这条局部保证说成所有装备/模式下最终伤害恒为“原攻击＋常数”。

原目标没有被显式排除：若仍存活且符合范围基准，它在圆心也受到此范围包。若到达 helper 时 T 已死亡，函数自身仍没有早退；范围基准会跳过已死 T，但仍可命中其位置周围的其他合格敌人。每个范围子包的 `attack=false`，进入同一雷霆战斧入口时在攻击标记检查就跳过，**不会再次抽 Q36 或递归触发雷霆战斧**；不关闭其他满足各自条件的地图效果。

本调用直接接入已经确定的 area-damage-v1，不重新选择规则：敌方、二维中心闭圆、稳定创建顺序快照；无敌/Aloc跳过，NORMAL 对魔免者继续正常伤害流程；飞行或建筑不因类别自动排除；零延迟同步结算。中心固定在该调用点，子事件期间目标移动不移动已发出的圆。这里仅增加该基准的一个已核调用者，没有改旧基准或它的范围/免疫矩阵。

## “重击”没有脚本控制；0.8和1.4属于特效

范围 native 返回后，PC72–79、B113282–113289 才调用：

```text
CreateEffAtLoc(
    "Abilities\\Spells\\Human\\Thunderclap\\ThunderClapCaster.mdl",
    GetUnitLoc(T), 0.8, 1.4
)
```

位置在范围子事件完成后重新读取，所以若 T 在子事件里从(10,20)移动至(30,40)，伤害圆仍在(10,20)，特效则在(30,40)。特效存活0.8秒、模型缩放1.4；**0.8不是眩晕时长，1.4不把伤害半径改成700**。没有 TxShow 条件；范围 native 的返回布尔值也被丢弃，不决定是否请求特效。

必要 helper 已核全部条件与返回：

- `CreateEffAtLoc`：main/f7/f25，[B51661–51710](../../reference/map-6.25/main.disasm#L51661)。缺少缩放参数才默认1；本调用明确1.4。先 `AddSpecialEffectLoc`，再建0.8秒单次 timer，登记 timer/effect 对应槽，设置缩放。
- `AddArrAny`：main/f7/f22，[B51546–51568](../../reference/map-6.25/main.disasm#L51546)。从正整数1开始找首个 nil 槽插入 timer，效果存入同索引。
- `Eff_time_end`：main/f7/f26，[B51712–51752](../../reference/map-6.25/main.disasm#L51712)。按到期 timer 查索引；effect非nil才 DestroyEffect。无论是否有effect都 DestroyTimer，并清除两张表同索引的值。没有单独的 i!=-1 检查；timer找不到时 i=-1，仍按这个索引处理。
- `IsInTable`：main/f7/f7，[B50776–50810](../../reference/map-6.25/main.disasm#L50776)。搜索对象nil直接-1；否则用 pairs 找匹配值，找不到-1。

以上没有技能施放命令、Buff添加、暂停、减速、击退或任何控制恢复调用。只是添加 ThunderClap 模型，不会由模型名字自动施放原生雷霆一击。本技能的0.8秒 timer仅清理特效，按 B05 运行；不能把它变成伤害延迟或持续伤害计时器。

## AOcr 原生模板调查与 Q24 明确选择

四个能力均为 `code=AOcr,levels=1`。原始 SLK 对应行1364–1367，[文件 L22273–22308](../../reference/map-6.25/units_abilitydata.slk#L22273)，没有 DataA1/B1/C1/D1/E1 单元；[JSON L24910–24953](../../reference/map-6.25/units_abilitydata.json#L24910)与之相符，全部 w3a 没有这四个ID的增量。同图原始 **AOcr 自己的记录**则有三个等级的15%和2/3/4倍率，[L7885](../../reference/map-6.25/units_abilitydata.json#L7885)。二者必须分开，不能因为代码类型相同就把原模板15%×2另叠到一级雷霆战斧。

[YDWE固定版本元数据](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/AbilityMetaData.slk#L1730)及[编辑器标签](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt#L5889)将 Ocr1…Ocr5／DataA…E定义为暴击概率、倍率、额外伤害、闪避概率及必中开关。该项目 [SLK读取器 L19–32、L47–70](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/plugin/w3x2lni/script/core/slk/frontend_slk.lua#L19)对缺失数值正规化为0，按能力code取得字段元数据后读取自定义 `slk[name]` 记录；这段代码没有把 stock AOcr 的15/2数据复制到N054。它是转换工具证据，仍不能单独证明地图实际客户端的缺省执行。

[暴雪剑圣说明](https://classic.battle.net/war3/orc/units/blademaster.shtml)能确认普通致命一击属于攻击暴击被动，但未定义本图自定义SLK缺项的处理。图鉴与实际Ubertip只描述脚本的范围物理伤害；残留的Researchubertip不能证明本图还附带原生暴击。当前没有匹配客户端的实测或底层实现证据，因此不把“没有原生暴击”伪称为已实测事实。

按Q24，采用局部 **`thunder-axes-native-v1`**：N054/N055/N056/N057本身不额外抽取原生AOcr概率、不加暴击倍率或额外单体伤害、不授予闪避/必中、不附带眩晕或减速。唯一雷霆战斧概率是已决Q36的准确15%，在原分派位置消费一次；范围命中不再抽。缺省倍率正规化为0在这里表示“不施加额外倍率”，**不将普通攻击乘0**。

这是查证后的明确Web选择，可能与以后取得的原客户端证据不同，仅适用于这四个能力。树魔携带的其他能力/装备仍按它们各自的规则工作；本页不取消其暴击、命中或其他效果，也不制定全部AOcr能力的全局叠加顺序。存档记录该版本，和area-damage-v1/B03/B05一起恢复。

## 验证与完成边界

核心完整80条指令、7个条件、13个call、2个return；四个必要helper共74条指令、5个条件、10个call、9个return，包含编译器保留的不可达末尾return。非法档位分支已核但正常局部赋值不可达。机器表含27个来源案例与14个Web接入案例，明确区分动态特效位置等依赖已决范围基准的交互。

82个核心字节码探针场景（81种能力等级组合，加1种范围返回false且目标移动场景）及4个特效helper场景通过。本批验证四个图鉴ID/说明、实际Ubertip、SLK与物编增量、字节码条件/调用参数、所有四ID组合及正等级边界、范围中心/原事件保留、特效回调与链接。验证使用静态数据和native桩，不是魔兽客户端或Web游戏运行测试。没有修改原图、图鉴、概率入口文档或其他既有规则。

完成范围是这个效果函数、必要视觉回调和明确Web原生补缺；其余树魔技能、其他装备/怪物子函数、全局原生暴击叠加仍属各自调查。没有从本页的局部结论推称整个树魔单位永远不会暴击或产生控制。
