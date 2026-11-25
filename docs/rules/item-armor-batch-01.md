# 装备固定护甲与固定移速

## 固定护甲

两份图鉴《装备与道具》A–H 的 243 条物品记录一致。按物品 `abilList` 和法术书子项核对，**0 个固定护甲别名、0 件固定护甲物品**。覆盖 `Idef` 字段适用的全部模板 AIde、AId1–AId5、AIda、AIdb。原能力表有 12 个匹配对象，这 243 项均未挂载。物品对象的 `armor` 是物品自身类别。强袭胸甲、鱼人鳞甲的范围减甲及黯灭系命中减甲继续从各自效果接入护甲接口。[术编字段](https://raw.githubusercontent.com/actboy168/YDWE/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/AbilityMetaData.slk#L8851) · [护甲接口](native-armor-and-xp.md) · [逐项机器表](item-armor-batch-01.json)

## 固定移速

| 物品 | 图鉴 | 原始能力 | Web 持有贡献 |
| --- | --- | --- | --- |
| i230 远行鞋 | H140 | I239，`DataA1=50` | 深渊模式 `Game_Mode=2` 时 +50 |
| i236 限定版-闪烁匕首 | H146 | I238，`DataA1=20` | +20，无附加模式条件 |
| i231 制作书-远行鞋 | H141 | 无 AIms 挂载 | 持有贡献为零，预览随成品显示深渊 +50 |

两个别名均为一级 AIms，`DataA1` 对应 `Imvb`，单位为固定速度点数。两书和 w3t 提示的数值及条件一致。I239 的原始字段没有模式开关，Web 根据图鉴与原提示在贡献入口判断深渊。I238 的战斗阶段说明跟随闪烁主动技能，持有被动保持 +20。物品挂载无 `iabi` 覆盖，能力无 w3a 覆盖，共享字节码索引中无 I238／I239 字面或整数 rawcode 调用。深渊交付和配方路径使用原事件。[AIms 字段](https://raw.githubusercontent.com/actboy168/YDWE/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/AbilityMetaData.slk#L9437) · [I238／I239 对象](../../reference/map-6.25/units_abilitydata.json#L22248) · [远行鞋提示](../../reference/map-6.25/war3map.w3t.json#L5966) · [闪烁匕首提示](../../reference/map-6.25/war3map.w3t.json#L6310) · [深渊模式](economy-and-progression.md)

## 挂载与验证

Q24 对这两种 AIms 按实际挂载过滤资格及模式，再取当前最高值。同穿且合格时，深渊为 +50，其他模式为 +20；移出最后一件远行鞋时回落到仍有效的匕首。此选择参考暴雪对原版移速鞋的叠加说明。固定点数加入现有移速基数，再应用既有百分比与 50–722 的可移动速度限幅，原移动锁和固定站位保持生效。按 L01 入包生效在 PICKUP 之前，撤回在 DROP 之前，读档从挂载与模式重建贡献。传送、闪烁、减甲光环、法球各走已有入口或独立核查。[暴雪永久物品说明](https://classic.battle.net/war3/basics/heroitemspermanent.shtml) · [物品生命周期](item-lifecycle.md) · [移动接口](pathing-and-placement.md) · [地图移速限幅](../../reference/map-6.25/war3mapMisc.txt#L45)

`--check` 从源指纹匹配的共享索引验证两份图鉴、对象和配方。一个状态探针覆盖模式筛选、同组重复以及移出最后一件远行鞋。此范围的 **2 个别名、2 件成品与 1 本制作书**均已核定。匹配原版客户端未运行。[复查脚本](../../tools/audit-item-armor.py)
