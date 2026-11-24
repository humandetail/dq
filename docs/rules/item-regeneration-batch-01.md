# 装备持续生命与魔法回复

已核 11 个能力别名、24 件图鉴物品和 26 次直接挂载。两份《装备与道具》A–H 的 243 条物品记录一致。24 件中有 18 件可核原 w3t 提示，已写的回复描述与图鉴一致。相关物品没有 `iabi` 覆盖，已核能力没有 w3a 覆盖。17 本制作书写有成品回复，均同步展示相应成品的贡献，持有制作书不会取得这些效果。[逐件表与对象索引](item-regeneration-batch-01.json)

## 能力与物品

| 别名 | 图鉴效应 | 挂载物品（《装备与道具》H 列） |
| --- | --- | --- |
| I101 · AIrm | +20% 魔法回复 | i101 艺人面罩 H11、i326 小净化 H219 |
| I102 · AIrm | +50% 魔法回复 | i104 圣殿指环 H14、i121 虚无宝石 H31、i129 天鹰戒指 H39、i218 振魂石 H128、i327 玲珑心 H220 |
| I103 · AIrm | +70% 魔法回复 | i119 EUL的神圣法杖 H29、i198 吸血鬼的祭品 H108、i222 空明杖 H132、i228 韧鼓 H138、i238 灵魂之戒 H148 |
| I104 · AIrm | +100% 魔法回复 | i209 大狂战斧 H119 |
| I105 · AIrm | +150% 魔法回复 | i134 完美的妖刀竹光 H44、i220 血精石 H130、i224 紫苑 H134、i226 血棘 H136 |
| I106 · AIrm | +200% 魔法回复 | i161 大法师之戒 H71、i202 邪恶镰刀 H112、i301 海神三叉戟 H194、i325 雪落法杖 H218 |
| I169 · AHab | 魔力源泉，魔法 +3/秒 | i129 天鹰戒指 H39 |
| I198 · AHab | 魔力源泉，魔法 +10/秒 | i161 大法师之戒 H71 |
| I249 · Aoar | 回春，每秒 +4% 最大生命 | i145 恐鳌之心 H55 |
| I250 · Aoar | 斧头回血，Web 固定 +10 生命/秒 | i147 掠夺者之斧 H57 |
| I281 · Aoar | 永动，每秒 +4% 最大生命 | i332 魔焰之心(关闭的) H225 |

AIrm 的 `DataA1` 对应 `Imrp`，为正常魔法回复的额外比例。AHab 的 `Hab1/Hab2` 分别是数值和百分比开关，Aoar 的 `Oar1/Oar2` 分别是生命回复量和百分比开关。I169、I198 的 `DataB1` 缺省，图鉴明确采用点/秒。I249、I281 在对象中明写 `DataA1=0.04` 和 `DataB1=1`，符合图鉴。I250 的 `DataA1=10`，`DataB1` 缺省，名称为斧头回血，B096 描述为提高生命回复。两份 H57 及物品提示列力量和成长，均未排除其他持续回复。Web 依实际挂载补入 +10/秒并选固定解释，保留对象缺省值。[AIrm 术编字段](https://raw.githubusercontent.com/actboy168/YDWE/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/AbilityMetaData.slk#L9701) · [Aoar 术编字段](https://raw.githubusercontent.com/actboy168/YDWE/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/AbilityMetaData.slk#L4582) · [编辑器字段名](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt#L6005) · [I250 源值](../../reference/map-6.25/units_abilitydata.json#L22452) · [B096 状态说明](../../reference/map-6.25/units_commonabilitystrings.txt#L627)

## Web 结算（Q24）

- **魔法回复。** 对实际挂载的适格原生英雄，将每件有效 AIrm 的加成比例相加，乘数为 `1 + 比例和`，作用于模板及有效智力组成的基础回蓝。随后加独立的固定光环通道。I169、I198 的 B021 同组取最大，一名受体同时在两者范围内只得 +10/秒，失去 I198 时立即回退到仍有效的 +3/秒。这个固定结果与 A018、I230 两个既定组独立相加，三组固定回蓝都处在乘法之后。[基础回复](night-state-and-regeneration.md) · [固定光环通道](mana-auras.md)
- **B021 的对象与范围。** 两个别名均以合格持有者为源，1000 二维闭圆，候选包括存活未隐藏的非 ancient 自身及同主或友方单位，无敌也可接收；零魔法池没有有效回复。复用现有光环的发射状态、目标和即时更新接口，能力启停、移动、归属、形态与生命状态变化按同一时间点重算，B021 每个受体显示一份，普通驱散后仍按现存候选重算。[I169](../../reference/map-6.25/units_abilitydata.json#L21375) · [I198](../../reference/map-6.25/units_abilitydata.json#L21619) · [光环生命周期](mana-auras.md)
- **生命回复。** 三个 Aoar 对象均为仅自身、允许无敌，源字段保留半径 50。以当前有效上限计算百分比回复，同 Buff 只取一份，B092 回春、B096 斧头回血、B166 永动三组独立加入基础回复。两份同名恐鳌之心只给一份回春。恐鳌之心与关闭的魔焰之心同时有效时保有两个独立 4% 来源。开启形态 i330 没有 I281，按原换实例后即时失去永动。固定资源、力量派生及成长写上限发生后，百分比率随实际最大生命更新。[恐鳌之心](../../reference/map-6.25/units_abilitydata.json#L22438) · [魔焰之心](../../reference/map-6.25/units_abilitydata.json#L22887) · [形态切换](../../reference/map-6.25/main.disasm#L135003) · [固定资源](item-resources-batch-01.md)
- **时间与挂载。** 到事件时先结算旧速率，再按 L01 在 PICKUP 前登记、DROP 前撤回。原合成、拒绝、最后一充能移出及实际换形态沿用物品事件。小净化尚在背包且有效挂载时有 +20% 魔法回复，最后一次清理实际移出后撤回。满资源裁剪，保留小数，读档从挂载及光环源重建实际速率，不补发离线回复。[物品生命周期](item-lifecycle.md) · [基础回复计时](night-state-and-regeneration.md)

小净化另挂 I248，图鉴 H219 的主动描述为 60 秒恢复 300 魔法，对象也有 `DataB1=300`、60 秒时长及冷却标签。其主动充能、受击或驱散中断、重施与施法计数属于候选 I248，未计入本批 11 个持续挂载别名。原字节码对 I248 的登记留作该候选交接。[I248 对象](../../reference/map-6.25/units_abilitydata.json#L22422) · [施法登记](../../reference/map-6.25/main.disasm#L50095)

共享索引热复核及两个 Web 探针通过，覆盖 AIrm 与多个固定组的运算次序、B021 同组回退、同名生命回复去重及魔焰之心开关撤销。客户端实测仍可用于核对原生同类叠加和 I250 缺省解释，本批 Web 规则已确定。[验证脚本（`--check`）](../../tools/audit-item-regeneration.py)
