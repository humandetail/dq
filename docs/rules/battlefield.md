# 战场、路线与建造约束

数据见 [battlefield-data.json](battlefield-data.json)。原始证据保存在 [reference/map-6.25](../../reference/map-6.25/manifest.json)。本文是静态规则提取，未在原客户端实测。

## 坐标与区域

`CreateRegions` 的 32 个矩形和 `initPoints` 的 24 个路点邻接表已从字节码独立读取；矩形坐标另与反编译文本逐项比较一致。对应函数是 `main.disasm` 的 `main/f306/f1` 与 `main/f306/f4`；可读导航在 `main.readable.lua:137182` 和 `137453`。

| 出怪口索引 | 中心坐标 | 首个路点索引 |
| --- | --- | --- |
| 0 | (-784, 768) | 0 |
| 1 | (768, 752) | 1 |
| 2 | (736, -784) | 2 |
| 3 | (-768, -784) | 3 |

出怪口按活动玩家索引选择，不能在单人时默认同时启动四个口。路点 0–3 分别仅通向 8、20、18、15。其余路点构成可分岔的网络，完整邻接顺序保存在 JSON。能量圈中心分别为 (-1234, 1250)、(1216, 1232)、(1216, -1232)、(-1216, -1232)，源自四个 `rune_rect`，不能与出怪口中心混用。

## 怪物选择下一段路线

已人工核对 `main.disasm:200268` 的 `main/f306/f33`；`main.readable.lua:139666` 仅作为阅读导航。

1. 入区触发器只处理 `Player(11)` 的单位。临时单位以及 `mb01` 不进入普通路由。活动怪转交 `Activity_Monster_Run`，其活动专属路线不在本节中冒充普通路径。
2. 单位自定义数据用十进制字符串 `上一节点 + "50" + 目标节点` 保存两段索引。初始状态使用 `"10050" + 出怪口索引`，其中 100 是初始哨兵。进入路点后，取该路点的邻接表，并排除上一节点，避免立即原路折返。
3. 剩一个候选时直接选择。存在多个候选时，只有 `GAME_ENDLESS_TYPE == 2 && Game_Mode == 1`（团队无尽）固定取第一个；其他分支通过 `GetRandomInt(1, 候选数量)` 选择。个人主线与个人无尽因此均有分岔随机选择。
4. 对下一路点矩形中心发出 `move` 指令，更新自定义数据；若单位属于 `mon_arr`，同步更新 `mon_next_pos_index`。
5. 最后调用 `EndLessTypeTeamRun`。这是团队无尽特有迁移的入口，个人模式的调用不会使该机制自动适用。

例如：0 → 8；在 8 可选 7 或 9；若选 7，因禁止退回 8，接下来走 12。不能将该规则替换成唯一固定环路。主线失败条件见 [波次与模式](waves-and-modes.md)，不能由“怪物走到某个出口”自行推导扣血。

## 地形与静态寻路网格

- `war3map.w3e`：版本 11，地形顶点 97×97，偏移 (-6144, -6144)，地表类型 `Ngrs`、`Lrok`、`Ywmb`，地形数据按 7 字节/顶点读取后与文件长度精确一致。
- `war3map.wpm`：版本 0，384×384，文件头 16 字节，剩余 147456 个字节各对应一个静态寻路格。
- 格子边长按魔兽路径格式为 32 世界单位，网格与地形格数的四倍关系相符。格式交叉依据是 [Wurst PathingGrid](https://github.com/wurstscript/WurstStdlib2/blob/master/wurst/math/PathingGrid.wurst) 与 [Warsmash WPM 解析器](https://github.com/Retera/WarsmashModEngine/blob/master/core/src/com/etheller/warsmash/parsers/w3x/wpm/War3MapWpm.java)。这些开源格式实现用于解释文件，不替代原客户端运行验证。
- 本图仅出现字节 64（81456 格）、72（31440 格）、206（34560 格）。按 `0x02` 不可行走、`0x08` 不可建造的位定义，分别有 34560 与 66000 个格子。位定义及动态覆盖参照 [Warsmash PathingGrid](https://github.com/Retera/WarsmashModEngine/blob/master/core/src/com/etheller/warsmash/viewer5/handlers/w3x/environment/PathingGrid.java)。

原始 WPM 已完整保存，可按原索引读取每个格子。可建造地形不等于完整建造许可：还需要单位自身的放置条件、动态占用和技能限制；不能只看静态 WPM 的一个位。

## 单位移动与模型尺寸

单位的 `movetp`、`targType`、`turnRate` 在 `units_unitdata.json`，`collision`、`spd`、放置条件在 `units_unitbalance.json`，显示缩放在 `units_unitui.json`。它们是不同字段，替换视觉模型时仍需沿用玩法字段。

例如主线农民 `m001` 的表项为 `movetp=fly`、`targType=ground`、`collision=1`、`spd=200`。外形像步行单位或可被地面攻击，不代表其移动类型是 `foot`。英雄 G048 和 H007 的碰撞表值都是 72，模型缩放却不同。最终字段仍须按“单位表 + 对象增量 + 脚本运行修改”合并，不能将这几项表值宣称为所有阶段的最终状态。

工人的移塔技能 `W018` 明确限制为己方单位，并排除能量圈；工人所在位置不可建造时，尝试 `GetTempUnitLoc(location, 250)`，仍不可建造则拒绝移塔（可读代码 `main.readable.lua:132227` 起，调用分支已核 `main.disasm:190100` 附近）。这个流程与原生建造放置不是同一个机制。

`GetTempUnitLoc` 已核字节码 `main/f7/f18`（`main.disasm:51369`）：按 0°、30°、…、360° 顺序尝试固定半径上的点，返回第一个可建造地点；它不遍历半径内部，也不寻找最近空位。深渊模式第一次尝试后就退出；普通模式全部失败时返回最后尝试的位置，由调用方再检查并拒绝。这里的 250 是本次移塔传入的固定半径。

## 尚未闭合的空间行为

| 项目 | 已有证据 | 尚需补齐 |
| --- | --- | --- |
| 普通路径节点与选路 | 32 个区域、24 个路点及分支字节码已核 | 原生移动的避让、转向、入区事件边界与事件同帧顺序尚未实测 |
| 原生建造 | WPM、单位放置字段已提取 | 建筑路径贴图、装饰物动态阻挡及全部放置约束的组合未完整复核 |
| 自定义移塔 | 已核 W018 地点与归属检查、固定半径选点顺序 | native `SetUnitPositionLoc` 与动态占用冲突时的最终落点需验证 |
| 活动怪路线 | 已发现独立 `Activity_Monster_Run` 入口 | 活动是否属于最终图鉴范围及其专属路线尚未逐项核完 |

重新生成数据：在仓库运行 `python3 tools/build_map_reference.py`。该脚本只读取保存的静态证据，不执行地图程序。
