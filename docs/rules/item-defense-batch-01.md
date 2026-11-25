# 装备常驻原生防御

本批核定《装备与道具》243 条物品记录的固定魔法减伤、常驻减伤、闪避和格挡挂载。两份图鉴 A–H 一致。展开 I280 的法术书子项后，全部挂载均能解析，共 163 个实际别名、31 个底层类型。源 w3t 没有覆盖这些物品的 `iabi`，源 w3a 没有覆盖这些挂载的能力。**相关防御贡献为 0 个别名、0 件成品、0 本制作书。** 伤害减免仍由既有 B03 入口执行。[机器表](item-defense-batch-01.json) · [B03](web-baseline.md)

## 字段核查

- `AIsr` 的 `isr2` 是减伤字段，`AEev/ACev` 的闪避来源也未出现在实际挂载中。易混淆的 `AIcd` 对象底层是 `AOac` 攻击光环，且未挂载到这 243 项。固定护甲已由独立批核对。[AIsr 对象](../../reference/map-6.25/units_abilitydata.json#L4849) · [AIsr 术编字段](https://raw.githubusercontent.com/actboy168/YDWE/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/AbilityMetaData.slk#L13367) · [AIcd 对象](../../reference/map-6.25/units_abilitydata.json#L3093) · [固定护甲](item-armor-batch-01.md)
- AOcr 能同时配置攻击与闪避。金箍棒 I185、水晶剑 I214、暴雪弩炮 I215、裁决之剑 I284、遗物之刃 I251 的全部显式等级均缺 `Ocr4/DataD`，Web 的持有者闪避贡献为零。攻击端的暴击与 `Ocr5/DataE` 必中继续沿既定武器规则。[Ocr4 术编字段](https://raw.githubusercontent.com/actboy168/YDWE/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/AbilityMetaData.slk#L1795) · [既有攻击装备字段与规则](skill-coup-de-grace.md)
- 图鉴 H110、H175、H201 的纷争面纱、邪念法杖、怨念魔杖说明自身输出的法术抗性穿透。对应原脚本在魔法伤害事件中读取归属来源的持有物，再修改当次伤害。黑皇杖 H142 的状态由主动 `I234 → I234_Acition` 分派，另列后续核查。[输出伤害原分派](item-damage-dispatch.md) · [黑皇杖主动入口](../../reference/map-6.25/main.disasm#L144088)

`--check` 从源指纹匹配的热索引重新校对两书、全部挂载及 5 个 AOcr 的闪避缺项。该范围剩余 0 项，匹配客户端未运行。[复查工具](../../tools/audit-item-defense.py)
