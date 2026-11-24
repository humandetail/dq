# 装备覆盖对照

本批把13条已核完整效果对应到整件图鉴条目，两版描述一致。机器表逐件校验已选数值、图鉴坐标与有效入口。没有新增机制或原生别名。[机器表](item-coverage-reconciliation-batch-01.json)

- i101、i104、i108、i112、i114、i125、i151 的组合描述只包含已有固定三围、攻击、攻速、最大资源和回蓝属性。机器表按实际行的各个通道引用专项，夜叉和散华保留图鉴12%攻速。[固定三围](item-attributes.md) · [固定攻击](item-flat-attack.md) · [固定攻速](item-attack-speed-batch-01.md) · [最大资源](item-resources-batch-01.md) · [回蓝](item-regeneration-batch-01.md)
- i127、i128、i312、i313、i314 的定向施用、充能、经验和等级均已有规则。索引按实际别名逐项配对。[经验与等级](experience-sharing.md) · [定向书](item-targeted-books-batch-01.md)
- i399 无原生挂载，实际由 Fshop 的购买事件刷新。Q44 保留买者主人本局一次免费入口及已有库存事务。[物品及商店事件](item-lifecycle.md) · [实际 handler L180864](../../reference/map-6.25/main.disasm#L180864)

运行 python3 tools/audit-item-coverage-reconciliation.py --check，并复查 item-effect-coverage 生成一致性。
