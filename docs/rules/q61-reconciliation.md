# Q61 已审计数值回扫

对已有审计记录，采用两本图鉴明确的设计数值，并保留用户已经逐项确认的规则。图鉴缺少详值时，采用同一对象、等级和效果的原地图实际提示数值。旧模板文字和不同条件的数值不用于替换。改变触发条件、目标资格或效果种类仍需另行裁决。

## 已更新的五项数值

| 对象及字段 | 原执行 | Q61 Web | 证据及校验 |
| --- | ---: | ---: | --- |
| A106 雷云单拍半径 | 450 | 500 | 每朵云十次仍按 Q49。距离 500 纳入，500.001 排除。[原提示](../../reference/map-6.25/units_campaignabilitystrings.txt#L1586) · [旧回调](../../reference/map-6.25/main.disasm#L79274) · [现规则](zeus-skills.md) |
| A107 神杖已损生命比例 | 10% | 12% | 两个重叠中心的实例追加 480／960，仍按各自面积包之后读取生命。[原提示](../../reference/map-6.25/units_campaignabilitystrings.txt#L1603) · [旧神圣分支](../../reference/map-6.25/main.disasm#L79802) · [现规则](zeus-skills.md) |
| A107 神杖深渊倍率 | ×0.10 | ×0.5 | 此倍率仍乘在神圣包，商店 Boss 的 ×0.5 可以独立相乘。[原提示](../../reference/map-6.25/units_campaignabilitystrings.txt#L1603) · [旧神圣分支](../../reference/map-6.25/main.disasm#L79802) · [现规则](zeus-skills.md) |
| A112／A142／A143 无尽过载倍率 | 100/67 | 3/2 | 一级来源属性 699／700 授 140／210，9999／10000 授 2940／3000。Q47 已选的 70 点向下取整、3000 特殊档与原刷新/撤销顺序继续适用。[原提示](../../reference/map-6.25/units_campaignabilitystrings.txt#L1677) · [原常数](../../reference/map-6.25/main.disasm#L81282) · [现规则](wisp-link-overcharge-relocate.md) |
| A072 神杖分裂半径 | 280 | 350 | 半径按主目标中心，350 纳入，350.001 排除。原分裂伤害、归属及目标资格继续适用。[原提示](../../reference/map-6.25/units_campaignabilitystrings.txt#L1049) · [旧分裂函数](../../reference/map-6.25/main.disasm#L73137) · [现规则](hero-aura-family.md) |

## 已有裁决与覆盖边界

- i115 固定攻击、A029 六级伤害、A090 禁锢、A209 末两档射程有图鉴明值。A026 护甲折算、N140/141 咆哮、T263–268 豪猪毒刺沿用 Q26、Q59、Q57。N731 已按专属提示采用含主目标 3 个目标。 [固定攻击](item-flat-attack.md) · [闪电风暴](native-targeted-batch-01.md) · [暗影之风](bounty-hunter-tracking.md) · [召唤物](summon-family-batch-01.md) · [护甲](combat-and-skills.md) · [熊灵](spirit-bear.md)
- 熊灵缠绕 N136/N137 的实际一级提示与已选 10%／20%、普通 1.5／2.5 秒相符。提示没有单列原生英雄时长，既有局部英雄条件仍从辅助对象 HeroDur 读取。 [缠绕规格](spirit-bear.md) · [两档提示](../../reference/map-6.25/units_campaignabilitystrings.txt#L14548)
- N142–N147 烈焰之拳实际提示 25%，原执行 25/101。现已通过A175→T189→n261–n266确认实际可达，Q61采用准确25%，六档完整附伤见[烈焰之拳专项](legacy-skill-flaming-fists.md)。 [原审计](probability-helper-coverage.md) · [实际提示](../../reference/map-6.25/units_campaignabilitystrings.txt#L14616)
- 普通范围主动批与神之书由各自专项处理。 [范围主动](area-active-batch-01.md) · [神之书](divine-books.md)

## 验证

`python3 tools/audit-q61-reconciliation.py --candidates` 返回既有 MD／JSON 中提示与取值差异的定位候选。默认命令检查五处机器字段、现存提示/图鉴摘录、两个半径边界、神杖金额、过载边界和 168 条已有分档向量。原图、图鉴和反汇编的完整解析不在本轮范围内。 [回扫工具](../../tools/audit-q61-reconciliation.py) · [机器记录](q61-reconciliation.json)
