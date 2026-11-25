# 命名概率 helper 与图鉴的覆盖交集

本页保存当前 `main.readable.lua` 中 **14 个精确命名 `Get_probability` 导出**与 `图鉴.xlsx` 的 `塔技能!F:F` 实际效果 ID 交集。机器表见 [probability-helper-coverage.json](probability-helper-coverage.json)，保留导出行号、源文件哈希、对应角色/图鉴行和排除原因。这不是全部概率规则覆盖：内联 GetRandomInt/GetRandomReal、原生暴击/闪避、匿名随机逻辑不在此次筛选范围内。

## 已对齐的项

| Helper / 效果 ID | 图鉴技能行 | 当前状态 |
|---|---|---|
| A007_Get_probability / A007 | 367、508、544 | Q33 已裁决 |
| A022_Get_probability / A022 | 190、451 | Q34 已裁决 |
| A027_Get_probability / A027 | 32、57 | 已有秒杀分支字节码核查；不是原生 10% 暴击概率 |
| A056_Get_probability / A056 | 51、71、121、136 | Q32 已裁决 |
| N054_57_Get_probability / N054–N057 | 726、729、732、735 | Q36 已裁决 |
| N058_60_Get_probability / N058–N060 | 767、770、773 | Q37 已裁决 |
| N086_Get_probability / N086 | 548 | Q38 已裁决 |

具体裁决以各独立技能文档及 [规则索引](README.md) 为准，本表不改任何已决值。

A027 的图鉴 I32/I57 明确“10% 概率造成各级暴击倍率”，六级秒杀则仅写“小概率”，两者不是同一判定。原生 AOcr 的暴击字段与额外 `A027_Get_probability` 秒杀 helper 不能混同。现有 [A027 调查](combat-and-skills.md) 已核主线 `2/1001`、无尽 `4/1001`、幻象 `1/1001` 的秒杀 helper 与入口；不能拿这些数值和图鉴暴击 10% 比较而制造冲突。

## 未收录能力与来源边界

以下四组已看过的 helper 对应效果 ID，在整张塔技能表 F 列没有记录；不能借用相近名称、宿主 A164 的行号或错误塔角色：

| 实际效果 ID / helper | 可复核原来源 | 本轮结论 |
|---|---|---|
| N142–N147 / N142_N147_Get_probability | [实际说明 L14616 起](../../reference/map-6.25/units_campaignabilitystrings.txt#L14616) 为“烈焰之拳”25%；[字节码 main/f183/f1 L114401](../../reference/map-6.25/main.disasm#L114401) 为 `GetRandomInt(0,100)<25` | 已证A175/T189召出n261–n266，按Q61准确25%；完整附伤见[专项](legacy-skill-flaming-fists.md) |
| N152 / N152_Get_probability | [实际说明 L14688](../../reference/map-6.25/units_campaignabilitystrings.txt#L14688) 为“灵魂剥夺”10%；[字节码 main/f184/f1 L114506](../../reference/map-6.25/main.disasm#L114506) 为 `GetRandomInt(1,100)<10` | 无图鉴F列对应；已证A175六档n266可达，按Q61准确10%，当前生命×8%魔法附伤见[A175](hero-spells-batch-04.md) |
| T316 / A164_T316_Get_probability | [实际说明 L23088](../../reference/map-6.25/units_campaignabilitystrings.txt#L23088) 是“偷取-超强力量”；[字节码 main/f115/f24 L91053](../../reference/map-6.25/main.disasm#L91053) 按 1–4 级返回阈值 6/8/10/12，其他等级返回 0 | helper 只返回阈值，不能冒称内部直接完成抽样；不把 A022/Q34 决定自动扩展到 T316 |
| T325 / A164_T325_Get_probability | [实际说明 L23222](../../reference/map-6.25/units_campaignabilitystrings.txt#L23222) 各级 12/13/14/15%；[字节码 main/f115/f41 L92487](../../reference/map-6.25/main.disasm#L92487) 使用 0–100 整数并严格小于对应阈值 | 无图鉴 F 列对应；不把 N086/Q38 自动扩展到 T325；完整偷取获取链另核 |

A164 虽在 F60/F65，但对应“吞噬/死亡”的正文，未列这两项偷取技能的概率，因此不能用 A164 的图鉴行证明 T316/T325 的百分比。上述四组没有编号Q39。N142–N147及N152已完成可达性与Q61准确概率；T316/T325仍随A164借技专项补核，未收录不等于不可玩。

另外 i132_Get_probability、i134_Get_probability、i202_Get_probability 是装备 helper，不在塔技能 F 列；本轮没有把它们冒充第五个未核塔技能。装备既有调查/裁决继续独立有效。

## 核对范围与停止结论

已用只读工作簿遍历建立 F 列 ID→行/角色映射，与全部 14 个精确导出求交集，结果和 JSON 逐项保存。已独立重跑14项交集、导出行号、5个来源哈希和四组未收录ID检查，全部通过。A164_T316/A164_T325 使用实际效果 ID T316/T325，而不是从函数名前缀错误映射到 A164。

这个命名 helper 集合中，剩余没有“图鉴已对齐且尚未核的新概率冲突”候选。本轮不为提问制造差异；后续可另从图鉴明确概率的 ID 检查内联随机函数或原生字段。除本页与机器表外，不修改图鉴、原始来源或此前概率文档。
