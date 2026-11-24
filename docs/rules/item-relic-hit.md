# 遗物之刃：70% 必中与第十次攻击

本批核查 `i322 → I251 → AOcr` 的装备附带命中能力，以及它与已经核过的 `i322_Action/i322_Damage` 的关系。图鉴、原图字段、外部原生资料和 Q24 下的 Web 选择分开记录。机器证据和验收例见 [item-relic-hit.json](item-relic-hit.json)；计数与伤害公式沿用 [装备伤害效果](item-damage-effects.md)，不在本页重新设计。

**结论：70% 是“必中分支的触发概率”，不是把所有攻击的最终命中率设成 70%。** Web 明确按独立 70% 分支处理；未触发的 30% 仍走普通命中。必中分支的原始普通攻击伤害固定加 1，再进入正常减免。波动不再次抽这 70%，也不额外加这一点。前两项数值来自原图；独立随机、1 点的具体结算时点是以下明确标记的 Web 规则，不是原客户端实测。

## 图鉴与原图的对应关系

已只读核对仓库 `图鉴.xlsx` 与用户指定下载路径中的工作簿，`装备与道具!H215` 和制作书 `H216` 的对应说明一致：

- 增加 180 点攻击、90% 攻击速度。
- “奇锋”每攻击 10 次生成前方直线神圣伤害，限近战且敏捷最高。
- “克敌机先”写攻击有 70% 的概率不会丢失。

原图 `i322.abilList = I252,I126,I251`。前两项分别是 `AIat.DataA1=180` 与 `AIas.DataA1=0.9`；第三项名为“遗物 - 克敌机先效果”，底层类型为 `AOcr`。[物品 L11238](../../reference/map-6.25/units_itemdata.json#L11238)、[攻速能力 L20960](../../reference/map-6.25/units_abilitydata.json#L20960)、[命中／攻击能力 L22465](../../reference/map-6.25/units_abilitydata.json#L22465)、[能力名称 L12153](../../reference/map-6.25/units_campaignabilitystrings.txt#L12153)。

| `I251` 首级字段 | 原图值 | 已核字段意义 | 证据边界 |
|---|---:|---|---|
| `DataA1` | 70 | 触发致命一击的概率 | 原图明确，不是 15% |
| `DataB1` | SLK 缺项 | 伤害倍率 | 转换器数值正规化为 0；不等于普通攻击乘 0 |
| `DataC1` | 1 | 伤害奖励 | 值明确；原客户端的精确结算路径未证实 |
| `DataD1` | SLK 缺项 | 闪避概率 | 转换器数值正规化为 0；不授予持有者额外闪避 |
| `DataE1` | 1 | 必中开关 | 字段用途明确；原生判定优先级不能只凭字段名推定 |
| `targs1` | `air,ground,enemy,neutral` | 能力目标分类 | 保留原目标数据，不据此扩大到非法目标 |
| `levels` | 3 | 能力物编等级数 | 不是英雄升到某级就自动升此装备能力 |

原始 SLK 的 `I251` 位于第 1176 行记录，`DataA1/C1/E1` 分别有显式 70／1／1 单元，`DataB1/D1` 无单元。等级 2、3 遗留为 15% 与 3／4 倍；没有发现 `.w3a` 对这些 ID 的增量覆写，也没有在 Lua/JASS 中找到 `I251` 的字面增删或升级调用。本批 Web 装备能力按首级执行，不将这两行当作装备升级设计。[原始 SLK L20204–20219](../../reference/map-6.25/units_abilitydata.slk#L20204)、[JSON L22465–22481](../../reference/map-6.25/units_abilitydata.json#L22465)。

字段字母的解释来自 YDWE 固定提交 `a69c315…` 所带的原始 [AbilityMetaData.slk](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/AbilityMetaData.slk#L1730) 与 [WorldEditStrings.txt](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt#L5889)：`Ocr1…Ocr5` 对应 Data A…E。该项目自身 [frontend_slk.lua L19–32、L47–63](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/plugin/w3x2lni/script/core/slk/frontend_slk.lua#L19) 明确将缺省整数／实数读成 0。它支持静态正规化；没有证明刀圈实际运行客户端的所有隐藏行为。

**已证实的说明残留：** `I251` 的 `Ubertip/Researchubertip` 仍写原剑圣的 15%、2／3／4 倍模板，和本技能的首级字段及图鉴不一致。已定图鉴优先且原图数值也是 70%，所以不用该旧能力说明推翻 70% 或添加双倍暴击。[L12161–12163](../../reference/map-6.25/units_campaignabilitystrings.txt#L12161)。图鉴没有描述 `DataC1=1`，这是待补的原生细节，不足以推定图鉴明确禁止此字段。

## 与第十次波动的关系

`I251` 随物品提供原生被动，`i322_Action` 则由攻击伤害事件分派器调用。后者要求来源非幻象、实际持有装备、攻击标记非零、近战，随后才查敏捷是否并列最高并加计数。这些显式限制属于“奇锋”；没有一个 Lua 分支把同样条件包在 `I251` 的 70% 判定外面，因此不能仅因它们同属一件装备，就给命中被动套上“必须敏捷最高／近战”的额外限制。[分派 Lua L97371–97404](../../reference/map-6.25/main.readable.lua#L97371)；字节码 `main/f285/f11` [L145582–145621](../../reference/map-6.25/main.disasm#L145582)。

十次计数沿用已有规格：合格的**攻击伤害事件**使计数加 1，达到 10 清零并向第十次目标的位置发出波动；它不读取“本次是否触发 I251”。于是：

- 必中分支触发并形成合格伤害事件，可以增加计数。
- 必中分支未触发，但普通判定仍命中，也可以增加计数。
- Web 的普通落空不形成攻击伤害事件，不能仅因为做过一次 70% 随机判定就增加计数。
- 属性等奇锋资格不满足时，不增加奇锋计数；不会因此关闭仍生效的命中被动。

波动的实际来源 `q018` 添加 `T077`；命中时 `i322_Damage` 清掉它的原始事件伤害，再用 `q019` 提交既定公式的神圣伤害。两者基础能力表均只有 `Avul,Aloc`，没有 `I251`；波动并不是持有者再做一次普通攻击。本批不重新判定 70%，不把 1 点奖励复制到 q018/q019，也不把 `T077.DataA1=10` 叠加到已核神圣伤害公式。[单位能力 L6640–6648](../../reference/map-6.25/units_unitabilities.json#L6640)、[已核字节码 L133200–133435](../../reference/map-6.25/main.disasm#L133200)。

## Q24 明确的 Web 命中和伤害规则

下列 `relic-hit-v1` 是查证后选定的 Web 行为，不能标成原版实测：

1. 对持有生效 `i322`、通过普通攻击合法性校验、即将处理主目标命中的一次攻击，取独立伯努利随机值，概率精确为 0.70。整数实现可以用 `uniformInteger(1,100) <= 70`。本项不模拟未经确证的 AOcr 伪随机分布，也不把其他装备的随机算法一起改掉。
2. 触发时跳过本次普通命中／落空／闪避判定；不绕过目标合法性、无敌或伤害免疫，不取消正常的攻击类别和护甲减免。未触发时继续原本的普通命中流程，仍可能命中。
3. **仅触发时固定加 1 点原始普通攻击伤害。** 在本次普通攻击原始伤害已组成后，执行 `raw += 1`，再应用该攻击自己的攻击类型×防御类型倍率及护甲等原生减免，然后进入地图 `Before`。这点伤害合并在同一个普通攻击包中，不另建魔法／神圣伤害包，不增加一次计数事件。未触发分支不加 1。
4. `I251` 不再给原始伤害乘额外倍率；缺省倍率正规化 0 在这里表示不施加额外暴击倍率，绝不能把普通攻击清成 0。与A027及五种已列装备的交互现由[恩赐解脱基准](skill-coup-de-grace.md)补齐：先取成功倍率最大值，后加本项1点，再减免；其他原生暴击能力仍属独立调查范围，不推广为全局规则。
5. 波动不抽 `I251`，不获这一点额外伤害。已核的奇锋计数、每次命中重新读取属性、q018/q019 归属及神圣伤害公式全部沿用已有规则。

若未装备本能力时，某合法普通攻击的最终普通命中率为 `h`，装备后的命中率为 `0.7 + 0.3h`。例如 h=100%、50%、0%、80% 时，分别为 100%、85%、70%、94%。不能把其中 30% 当成必定落空。

| 验收例（无其他效果） | 期望结果 |
|---|---|
| 原始普通伤害 100、正常减免总倍率 0.5，触发 I251 | 进入地图 `Before` 前为 50.5 |
| 同上，未触发 I251 但普通判定命中 | 进入 `Before` 前为 50 |
| 奇锋计数 9，未触发 I251 且普通判定落空 | 计数仍 9，无波动 |
| 奇锋计数 9，未触发 I251 但普通判定命中，奇锋条件全部满足 | 计数清零并生成波动 |
| 奇锋计数 9，触发 I251，奇锋条件全部满足 | 正常攻击加 1 后结算，计数清零；波动不二次抽命中 |

本基准保留了 `DataC1=1` 的明确数值，并为原生路径未知的部分固定了可验收时点。它可能与旧客户端把该奖励分成另一个包或采用其他类别的行为不同，这个差异没有被隐藏。

## 原生资料查到了什么，没证明什么

[暴雪剑圣说明](https://classic.battle.net/war3/orc/units/blademaster.shtml) 能确认原始技能属于攻击暴击被动，但没有定义该自定义技能的必中优先级、1 点奖励路径或概率分布。ScrewTheTrees 的 [原作者能力实测记录](https://github.com/Cokemonkey11/wc3-ability-doc/blob/main/sources/screwthetrees-wc3-editor-ability-insight-document/2023-11-14.md#L1037) 标注测试版本 1.36，并记录倍率 0 时仍保留普通攻击；它同时承认小数值 Damage Bonus 的行为仍需测试。其版本和不确定记录不能替代这张地图的实际客户端证据。

另检视的 64 位反编译文章没有给出 DataC 的完整结算路径；公开重实现项目也承认原生攻击前置监听器存在缺口。它们没有被用来声称“原版完全忽略 DataC”或精确复刻某张 PRD 表。审查过的链接、采用／未采用理由列在机器表 `nativeEvidenceLimits`。Q24 的规则解决了本件装备的实现选择，原版差异仍如实保留。

## T077 的顺带核查与限定剩余项

字段定义和 profile 已补到可核的具体数值：

| 字段 | 原图值 | 已核名称／用途 |
|---|---:|---|
| `Area1` | 300 | 作用范围 |
| `DataA1` | 10 | 原生伤害；本事件被 i322_Damage 清零替换 |
| `DataB1` | 9,999,999 | 原生最大总伤害字段；不是神圣伤害公式的新上限 |
| `DataC1` | 900 | 波动距离 |
| `DataD1` | 300 | 末端作用范围 |
| `Rng1` | 5000 | 施法目标距离，不是波动距离 |
| profile `Missilespeed` | 2500 | 导弹速度字段 |
| profile `Order` | `carrionswarm` | 和已核点命令一致 |

数值来源：[能力 L33894](../../reference/map-6.25/units_abilitydata.json#L33894)、[SLK L30073](../../reference/map-6.25/units_abilitydata.slk#L30073)、[profile L20296–20309](../../reference/map-6.25/units_campaignabilitystrings.txt#L20296)。字段意义来自同提交 [Ucs1…Ucs4 元数据](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/AbilityMetaData.slk#L2688)、[字段文字](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt#L5925)、[导弹速度元数据](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/AbilityMetaData.slk#L452)。

按恒定速度作纯算术，900/2500=0.36 秒；这尚不是已验证的发射延迟或命中时间。只凭字段名仍不能确定范围 300 在原引擎的半径／宽度约定、移动单位与边缘碰撞、每波对同单位命中次数与次序、视觉速度是否完全等于伤害波速度、施法接受／发射时点，以及马甲死亡与在途波的关系。本批未选择整套 Web 波几何，未把这些未证实的原生行为混入已闭合的 70% 规则。
