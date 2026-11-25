# 平台、内容获取与永久解锁规则审计

本文件只记录原图可复查事实和用户已决定的 Web 差异，不实现游戏。来源为 `reference/map-6.25/`；机器表见 [platform-access-data.json](platform-access-data.json)。Lua 是反编译文本，关键分支另核字节码；不能把只存在定义或文案的项目视为当前可获得。

## Web 已决定的范围

| 决策 | 已确定行为 | 保留边界 |
|---|---|---|
| 地图等级 | 取消地图等级门槛，包括新手礼包等级限制 | 新手礼包仍限非比赛；金币、人口、英雄等级、变强资格等其他条件保留 |
| Q18 | 原平台付费／赞助权益直接开放，保留权益效果 | 开放权益入口不等于自动完成其任务；SSR 兑换仍吞 SR、保留每局次数和波次上限 |
| Q19 | 普通积分／碎片商店 `s001–s018` 共 18 项永久内容直接开放 | 只免除这 18 项的永久购买要求；不取消 `i550/i546` 积分＋SR 的局内兑换成本 |
| Q20 | 赛季商店 `f001–f012` 共 12 项直接开放，保留效果 | 其他节日、历史存档、任务奖励不由本项自动覆盖 |
| Q21 | 剩余节日礼盒独有永久奖励、旧档案／补发名单／无公开新领取入口的已存在永久内容全部直接开放，保留效果 | 不自动完成可游玩的任务链，不免除积分＋SR 局内兑换成本 |
| Q22 | 春节第 7 项、夏季第 7 项直接视为完成，计入 40／30 点 | 其余任务和 300 点最终门槛保留；完成及奖励处理只应用一次 |

采用单人、个人模式、非比赛。积分的原赚取、扣减和存档关系属于保留规则的事实依据；本文件不另造初始余额、收益或兑换条件。

## 平台数据不是一个总开关

原图 `PlayerHasItem` 调用 `DzAPI_Map_HasMallItem`，`CheckPlayerItem` 将各权益 key 读入玩家数组，`SHOPITEM01` 另设置 `Has_VIP_Player`。Lua 的 `CheckPlayerHasShopItem` 只查询该数组。`DZACT01/02` 是同一接口读取的活动 key，不据此将它们称作付费项目。[JASS L3252](../../reference/map-6.25/war3map.j#L3252)；[Lua L35068](../../reference/map-6.25/main.readable.lua#L35068)

账号数据分别保存为 `score`、`SkinPiece`、`ScoreSkin` 分段、`BAN_HERO`、赛季个人／团队／深渊记录、`DotaTDSprStr/DotaTDSumStr` 任务进度及 `ActScore0/OpenGiftNum` 活动货币／开盒计数。它们不是金币，也不是同一存档字段。[JASS L703](../../reference/map-6.25/war3map.j#L703)、[L914](../../reference/map-6.25/war3map.j#L914)、[L983](../../reference/map-6.25/war3map.j#L983)

## BAN 与开局卡池

- `BAN_HERO` 的逗号分隔数字 ID 载入 `HSTB/TB_BAN_HERO_0 + playerId`。原版普通玩家可设置 3 槽；`SHOPITEM01` 为 4 槽。[Lua L89349](../../reference/map-6.25/main.readable.lua#L89349)；[JASS L2271](../../reference/map-6.25/war3map.j#L2271)
- `ChooseHeroShow` 从 `Choose_Hero_List` 的 45 项开局 SR 候选中剔除 BAN，然后无放回随机给 3 项；`SHOPITEM01` 给 4 项。BAN 比较的是卡片 ID，只用于这个开局自选候选过滤。普通 `RandomSR`／常规抽卡权重池并未通过此过滤器。[Lua L87638](../../reference/map-6.25/main.readable.lua#L87638)、[L87702](../../reference/map-6.25/main.readable.lua#L87702)；字节码 `main/f282/f1,f2` [L137801](../../reference/map-6.25/main.disasm#L137801)
- 修改 BAN 不会立即更新远端；`DZAPI_Save_Ban_Data` 在结算存档中把非空槽串起来保存，仍限定本地玩家执行。结算、最终 BOSS 和无尽检查点会触发总存档；UI 的“下局生效”不意味着当局常规抽卡池被改写。[JASS L1335](../../reference/map-6.25/war3map.j#L1335)、[L1384](../../reference/map-6.25/war3map.j#L1384)
- 2026-11-24 用户裁决单人 Web 取消 BAN 槽。开局直接四选一，M2 使用小小、双头龙、暗影萨满、复仇之魂。候选生成及本机档案均移除 BAN 偏好，Q18 其余权益继续适用。

## 权益对玩法的直接影响

| 原权益／条件 | 已确证效果 | 来源 |
|---|---|---|
| `SHOPITEM01` | 上述 BAN／开局候选增加；开局礼包额外 `i412` | [L95983](../../reference/map-6.25/main.readable.lua#L95983) |
| `SHOPITEM01`，并检查 `SHOPITEM08` | 指定波次发额外卡片；30／40 波具备 08 时由 `i003` 换为 `i005` | [L128135](../../reference/map-6.25/main.readable.lua#L128135) |
| `SHOPITEM01 && SHOPITEM08` | 英雄换皮三围各加 30；原普通换皮各加 10 | [L106672](../../reference/map-6.25/main.readable.lua#L106672)；字节码 [L156670](../../reference/map-6.25/main.disasm#L156670) |
| 同上，且 `Game_Mode == 1`（无尽阶段） | 怪物计数上限加 10；不能据此给普通主线加上限 | [L36208](../../reference/map-6.25/main.readable.lua#L36208)、[L36287](../../reference/map-6.25/main.readable.lua#L36287) |
| 同上 | 福利结算金币乘数设为 1.15（共享权益可为 1.05）；深渊开始送 `i236`；工人添加 `J006/J007` | [L127130](../../reference/map-6.25/main.readable.lua#L127130)、[L107188](../../reference/map-6.25/main.readable.lua#L107188)、[L139140](../../reference/map-6.25/main.readable.lua#L139140) |
| `SHOPITEM03`；`01 && 08` | 结算积分倍率分别加 1、加 0.5；基础倍率 1，其他难度／活动／公会加成独立 | [L130050](../../reference/map-6.25/main.readable.lua#L130050) |
| `SHOPITEM10/18/36/46` | 对应 `i549` 孙悟空、`i548` 宙斯、`i547` 末日使者、`i545` 幽鬼兑换资格 | [L102269](../../reference/map-6.25/main.readable.lua#L102269) |
| 多个 `SHOPITEM` 皮肤权益 | `Model_Check_Enable` 映射为指定 `k***` 科技；完整逐项映射在机器表 `modelMappings[].entitlements` | [L106023](../../reference/map-6.25/main.readable.lua#L106023) |

上述四个商城 SSR 每种每局一次，四种共享总数：`SHOP_SSR_LIMIT` 初始为 0、41 波变为 1；代码拒绝条件为 `limit < 已兑换次数`，所以对应 41 波前最多 1 次、41 波起累计最多 2 次。每次消耗一张背包中找到的 SR 卡；Q18 仍保留这些要求。[L32675](../../reference/map-6.25/main.readable.lua#L32675)、[L102299](../../reference/map-6.25/main.readable.lua#L102299)、[L128400](../../reference/map-6.25/main.readable.lua#L128400)

## 皮肤的获取与生效链

机器表完整保留 111 条 `S*** → k*** → R*** → kind` 静态映射，其中 50 条变身目标是英雄单位 `G***`；附带选择技能、技能书、基础塔、目标单位、原取得入口与源码位置。所有已填的选择技能 `Requires` 均与 `unlockTech` 相符。[映射定义 L103988](../../reference/map-6.25/main.readable.lua#L103988)

永久购买将内容在 48 项保存目录中的下标写入 `ScoreSkin` 分段，成功安排写入后扣积分／碎片、立即增加解锁科技；初始化再次读取这些下标并加科技。不是把皮肤塔加入抽卡池：玩家仍先取得基础塔，再通过其技能书中受科技约束的 `S***` 选择技能换皮。例如受折磨的灵魂 `H008 → S121 → S122`，要求 `k147`，最终加 `R122` 变为 `G047`。[L34472](../../reference/map-6.25/main.readable.lua#L34472)、[L105752](../../reference/map-6.25/main.readable.lua#L105752)；[S122 Requires L17904](../../reference/map-6.25/units_campaignabilitystrings.txt#L17904)

施法事件把施法单位与技能 ID 传给 `Model_Change`。英雄先卸下除 `A_ITEM_ID` 和 `i304` 之外的物品，再按当前无附加属性的三围各加 10／30，并添加变身能力；部分皮肤另增删一次专用技能以刷新。皮肤不是纯视觉资源。此函数没有再次查永久档案；权限由选择技能的科技依赖承接。是否可以再次调用、原生变身对英雄技能和物品的全部细节，不能只从此函数推导为“任意重复叠加属性”。[L118658](../../reference/map-6.25/main.readable.lua#L118658)、[L106613](../../reference/map-6.25/main.readable.lua#L106613)；字节码 `main/f289/f7` [L156530](../../reference/map-6.25/main.disasm#L156530)

## 普通永久商店 18 项（Q19 全开）

价格仅用于保留原图证据，Web 不再要求购买下表内容。有两种币种的分支先判断碎片是否足够，足够就扣碎片并返回，否则再判断积分，并非让玩家选择任意币种。原等级检查独立取消。`s012` 实际检查 `<0`，其“不到5级”失败文案不能替代执行条件。[成本常量 L32679](../../reference/map-6.25/main.readable.lua#L32679)；碎片优先字节码 [L149510](../../reference/map-6.25/main.disasm#L149510)

| 物品 | 永久内容 | 原积分价 | 原碎片价 | 原最低地图等级 | 分支 |
|---|---|---:|---:|---:|---|
| `s001` | 霜之公爵（工人） | 400 | — | 7 | [代码](../../reference/map-6.25/main.readable.lua#L100103) |
| `s002` | 魂之猎手（工人） | 800 | — | 8 | [代码](../../reference/map-6.25/main.readable.lua#L100163) |
| `s003` | 虚空观察者（工人） | 1200 | — | 9 | [代码](../../reference/map-6.25/main.readable.lua#L100223) |
| `s004` | 蚩尤（流浪剑客） | 1500 | — | 10 | [代码](../../reference/map-6.25/main.readable.lua#L100283) |
| `s005` | 赤色大将（斧王） | 600 | — | 10 | [代码](../../reference/map-6.25/main.readable.lua#L100343) |
| `s006` | 选择皮肤（熊战士） | 1000 | 240 | 10 | [代码](../../reference/map-6.25/main.readable.lua#L100403) |
| `s007` | 幻灵亡师 | 1500 | — | 10 | [代码](../../reference/map-6.25/main.readable.lua#L100485) |
| `s008` | 克劳德 | 2000 | 400 | 10 | [代码](../../reference/map-6.25/main.readable.lua#L100545) |
| `s009` | 深海暴徒 | 1500 | 300 | 10 | [代码](../../reference/map-6.25/main.readable.lua#L100627) |
| `s010` | 恶灵骑士 | 2000 | 400 | 5 | [代码](../../reference/map-6.25/main.readable.lua#L100709) |
| `s011` | 丛林之半神 | 1200 | 260 | 5 | [代码](../../reference/map-6.25/main.readable.lua#L100791) |
| `s012` | 六芒星（工人） | 1200 | 260 | 0 | [代码](../../reference/map-6.25/main.readable.lua#L100873) |
| `s013` | 铁血将军 | 1500 | 300 | 10 | [代码](../../reference/map-6.25/main.readable.lua#L100955) |
| `s014` | 暗礁守卫 | 1200 | 260 | 10 | [代码](../../reference/map-6.25/main.readable.lua#L101037) |
| `s015` | 玛法里奥 | 1200 | 260 | 5 | [代码](../../reference/map-6.25/main.readable.lua#L101119) |
| `s016` | 无双魅影 | 2200 | 460 | 10 | [代码](../../reference/map-6.25/main.readable.lua#L101201) |
| `s017` | 红袍贤者 | 1000 | 240 | 10 | [代码](../../reference/map-6.25/main.readable.lua#L101283) |
| `s018` | 变体漩涡 | 1500 | 300 | 5 | [代码](../../reference/map-6.25/main.readable.lua#L101365) |

## 赛季商店 12 项（Q20 全开）

原版 `f001–f010` 明确输出“远古赛季奖励无法领取”后无条件返回；字节码中也存在该 `return`，不能把其后未执行的免费授予当作当前入口。`f011` 要求上赛季个人和团队无尽均 ≥170，`f012` 两者均 ≥90；这两个条件是 AND。Q20 取消这 12 项的历史领取限制，保留内容效果。[字节码 L152430](../../reference/map-6.25/main.disasm#L152430)、[L152477](../../reference/map-6.25/main.disasm#L152477)

| 物品 | 内容 | 选择技能 | 原领取分支 |
|---|---|---|---|
| `f001` | 桔梗 | `S043` | [代码](../../reference/map-6.25/main.readable.lua#L102634) |
| `f002` | 赛季光环1 | `S537` | [代码](../../reference/map-6.25/main.readable.lua#L102673) |
| `f003` | 奴良陆生 | `S013` | [代码](../../reference/map-6.25/main.readable.lua#L102712) |
| `f004` | 赛季光环2 | `S539` | [代码](../../reference/map-6.25/main.readable.lua#L102755) |
| `f005` | 火焰领主 | `S212` | [代码](../../reference/map-6.25/main.readable.lua#L102798) |
| `f006` | 赛季光环3 | `S544` | [代码](../../reference/map-6.25/main.readable.lua#L102841) |
| `f007` | 赛季光环4 | `S546` | [代码](../../reference/map-6.25/main.readable.lua#L102884) |
| `f008` | 武圣 | `S044` | [代码](../../reference/map-6.25/main.readable.lua#L102927) |
| `f009` | 恐惧之主 | `S322` | [代码](../../reference/map-6.25/main.readable.lua#L102970) |
| `f010` | 赛季光环5 | `S548` | [代码](../../reference/map-6.25/main.readable.lua#L103013) |
| `f011` | 烈焰之鳞 | `S372` | [代码](../../reference/map-6.25/main.readable.lua#L103056) |
| `f012` | 赛季光环6 | `S536` | [代码](../../reference/map-6.25/main.readable.lua#L103111) |

## 积分与碎片仍有局内用途

`DZAPI_GetPlayerScroe` 返回 `scoreN`，不包含本局待结算的 `scoreNewN`。`UpdatePlayerDzapiData` 计算 `floor(记分板击杀数/100 × 倍率)`；JASS 检查成功读档标志后写 `scoreN + scoreNewN`。无尽每轮检查点、最终 BOSS、失败／胜利都可触发写入，因此不能每次存档再次累加本局收益。礼盒和任务的 `DZAPI_SCROE_UPDATE` 则直接增减 `scoreN`。[L33980](../../reference/map-6.25/main.readable.lua#L33980)、[L130130](../../reference/map-6.25/main.readable.lua#L130130)、[JASS L1362](../../reference/map-6.25/war3map.j#L1362)、[L35643](../../reference/map-6.25/main.readable.lua#L35643)

无尽死亡处理有 `i422` 碎片掉落分支，拾取给四个玩家记录各加 1，并立即发出存档信号。原版同一数值用于本局购买和后续局持有。[L115881](../../reference/map-6.25/main.readable.lua#L115881)、[L96526](../../reference/map-6.25/main.readable.lua#L96526)、[JASS L1133](../../reference/map-6.25/war3map.j#L1133)

`i550` 斧王兑换消耗 60 积分＋一张 SR；`i546` 当前轮换 SSR 消耗 100 积分＋一张 SR；两者共享每局一次标志。它们是当局英雄卡兑换，不在 Q19 永久内容清单。轮换索引取平台 `WeekSSR` 配置；缺失／越界时源代码回退第 9 项 `i506`。实际线上周轮换值在地图包外，不得自行发明轮换日程。[L99920](../../reference/map-6.25/main.readable.lua#L99920)、[L100004](../../reference/map-6.25/main.readable.lua#L100004)、[L103179](../../reference/map-6.25/main.readable.lua#L103179)、[JASS L679](../../reference/map-6.25/war3map.j#L679)

## 节日／历史永久入口（Q21 已全部开放）

| 来源 | 已找到的入口或定义 | 还需要保留的事实边界 |
|---|---|---|
| 圣诞袜 `y006` | `y005_Action` 抽哥布林杀手；未中则碎片或积分 | 与元旦盒共用 `OpenGiftNum`；不是普通抽卡 |
| 元旦盒 `y008` | `y007_Action` 抽无双魅影 | 该永久皮肤已被 Q19 开放；不要重复解锁 |
| 十一盒 `y010` | 先从尚未拥有的火焰领主、黑曜御灵者、十一光环、光环1、熊猫斑竹、矮人轰炸机中抽取 | 第一组全拥有后，才加入十一称号、炼狱魔王、星光点点；其中火焰领主／光环1已属 Q20 |
| 旧档案／补发名单 | 犬夜叉、情报窃取者有旧命名存档；希尔瓦娜斯、新月骑士有保存目录及指定账号补发名单 | 不能据此假设对新玩家存在公开兑换入口 |
| 已定义、未找到公开领取 | 寒霜领主 `S362/k175/G076`，夏日穹等 | 静态定义与可获得性分开记录；Q21 统一处理，不另编任务 |
| 平台活动 key | `DZACT01→k105` 伊利丹工人；`DZACT02→k532` 六芒星 | 六芒星已属 Q19；不把活动 key 自动并入 Q18 付费权益 |
| 旧排名／账号称号 | 个人／团队排名、测试名单、打金榜、旧赛季个人／团队 324、旧深渊 40 等条件授予科技 | 与本局战斗成长无关，已按 Q21 直接开放；原地图等级称号则由既有取消等级决定处理 |

活动商店要求购买单位是工人，`y005/y007/y009` 每次扣 100 `ActScore` 后给 `y006/y008/y010`。活动积分有挑战怪奖励及活动结算来源，不能把界面分别写“十一／双旦／新年”的文字视为各自独立币种。这里只确认入口和实际字段，不推断仍在线的节日活动日程。[L102074](../../reference/map-6.25/main.readable.lua#L102074)、[L85989](../../reference/map-6.25/main.readable.lua#L85989)、[L86122](../../reference/map-6.25/main.readable.lua#L86122)、[L86256](../../reference/map-6.25/main.readable.lua#L86256)、[L88484](../../reference/map-6.25/main.readable.lua#L88484)

历史保存与补发证据：[JASS L799](../../reference/map-6.25/war3map.j#L799)、[目录 L105322](../../reference/map-6.25/main.readable.lua#L105322)、[名单 L133119](../../reference/map-6.25/main.readable.lua#L133119)、[执行 L139926](../../reference/map-6.25/main.readable.lua#L139926)。称号条件：[L138946](../../reference/map-6.25/main.readable.lua#L138946)。`s019` 刀圈一周年称号原本就是 0 成本领取，不是需要额外付费的未决门槛。[L101494](../../reference/map-6.25/main.readable.lua#L101494)

## 任务链：保留可玩要求，只标真实单人冲突

春节 `SHOPITEM24`、夏季 `SHOPITEM39` 各有 9 项累计／单次成就，完成后加成就点并按每 10 点对应的奖励表发积分或科技。两条进度分别从 `DotaTDSprStr/DotaTDSumStr` 恢复；单纯开放权益不会替代任务完成。入口及更新代码没有依赖当前现实日期。250 点皮肤分别为樱花妖精、猫耳奥蕾莉亚；任务链还包含光环、工人装饰和 290 点能量圈外观，300 点节点奖励 300 积分。[L134653](../../reference/map-6.25/main.readable.lua#L134653)、[L135505](../../reference/map-6.25/main.readable.lua#L135505)、[L135017](../../reference/map-6.25/main.readable.lua#L135017)、[L135857](../../reference/map-6.25/main.readable.lua#L135857)

| 真实单人冲突 | 原条件 | 原成就点 | 实际触发 |
|---|---|---:|---|
| 春节第 7 项“乐善好施” | 向队友累计转账 666 万金币 | 40 | 向发送者累计每次 `floor(金额/10000)` |
| 夏季第 7 项“八方支援” | 从队友累计收到 666 万金币 | 30 | 向接收者累计同样数值 |

转账必须以另一个活动玩家为目标，代码明确拒绝向自己转账；字节码已核对。两链总分都是 300，缺这两项分别仍可得 260／270 点，能够达到 250 点英雄皮肤档，但达不到 300 点最终奖励。每次不足 1 万的转账零头均被向下取整舍去，不能把本局所有金额相加后只取整一次。**Q22 已裁决：Web 将这两项视为已完成，分别计入 40／30 点，其余任务与奖励门槛照旧。完成和对应奖励处理应持久化且只执行一次，不能每次读档重复增加点数。**[任务定义 L134731](../../reference/map-6.25/main.readable.lua#L134731)、[L135583](../../reference/map-6.25/main.readable.lua#L135583)；[转账 L140499](../../reference/map-6.25/main.readable.lua#L140499)、[L140553](../../reference/map-6.25/main.readable.lua#L140553)；字节码 `main/f306/f52` [L201633](../../reference/map-6.25/main.disasm#L201633)、[L201694](../../reference/map-6.25/main.disasm#L201694)

“全队累计杀肉山”对每个活动玩家更新计数，单人仍能累计，不能把“全队”文案直接判作多人限制。[L115950](../../reference/map-6.25/main.readable.lua#L115950) 另一个 `ActivityTask` 新年任务定义含“队伍有低等级新人”，但 `ActivityTask_Init/Update` 在当前 Lua／字节码只见定义、未见调用，故不列为已活跃的单人阻碍。[定义 L136045](../../reference/map-6.25/main.readable.lua#L136045)

## 证据边界与待办

1. Q18–Q21 的永久开放范围及 Q22 的互助任务适配已经确定，不再询问相同门槛；其余可单人完成的任务依原规则保留。
2. 平台实际 `WeekSSR`、`TaskItem15/25/35` 配置未包含在地图包。源代码提供回退值／基础奖励池；不能伪称知道线上实际值。任务奖励池解析见 [L136700](../../reference/map-6.25/main.readable.lua#L136700)，平台读取见 [JASS L676](../../reference/map-6.25/war3map.j#L676)。
3. 不把反编译函数定义自动当可达入口，不把服务器保存调用当服务器已确认成功，也不把引擎变身细节凭空补齐。三种礼盒的概率／递增计数现已逐分支核完，见 [活动礼盒规则](event-boxes.md)；本页仍只作为获取入口审计。
4. `W017` 幸运机会提示来源为原图能力说明 [L23602](../../reference/map-6.25/units_campaignabilitystrings.txt#L23602)，不是已检查八张图鉴中的条目；其概率取舍已由 Q17 决定，不在此重复待问。

验证：机器表可被 JSON 解析；111 条映射均有技能／效果定义，已填 `Requires` 无映射冲突；18 个普通永久项目、12 个赛季项目均与源码逐项匹配；来源路径和行号边界已检查。该验证不是 Warcraft 引擎运行测试，也不代表全部平台活动已复现。

现行本机档案、任务、奖励及无服务器配置时的具体行为见[开局、任务与本机档案](session-and-task-state.md)。
