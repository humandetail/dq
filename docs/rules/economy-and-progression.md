# 开局、经济、成长与装备执行规则

本文件补充图鉴没有给出的执行细节，不改写图鉴已有的塔和装备说明。来源为原图 6.25 的脚本、对象数据和能力文本。`main.readable.lua` 是反编译辅助阅读稿；抽卡概率、额外抽卡、合成消耗等关键分支已核对 `main.disasm`。其余复杂控制流有疑点时标为“未闭合”，不把反编译异常当作原游戏行为。

配套 [economy-data.json](economy-data.json) 摘录 274 个塔、243 个图鉴物品、55 个主线怪物、13 个变强资格、8 个工人天赋的相关字段，每项保留原文件及记录起始行。缺失字段没有补成零。塔的对象价格、回收基数、卡片的商店价格是不同字段。

## 已选择的 Web 改动

用户已确认取消**地图等级**门槛，保留金币、木材、人口、英雄等级及变强资格等其他成本和条件。Q18 另已确认付费/赞助权益直接开放并保留效果；Q19 已确认普通积分/碎片对应的 18 项永久内容直接开放。下文仍保留原规则来源，Web 应叠加这些已决适配，不能把 `Requires` 中全部科技或单位条件一并删掉。单人、电脑优先、手机次之、本机续局属于已定范围；旧赛季、活动与任务来源另行核实。

## 开局与人口

| 内容 | 原图实际执行 | 来源 |
|---|---|---|
| 初始金币 | `InitPlayerResource` 对玩家 0–3 调用初始化：设金币为 2000 | [main.readable.lua:140126](../../reference/map-6.25/main.readable.lua#L140126)，`L25_2` |
| 初始人口上限 | 30；同时设置 `FOOD_CAP_CEILING` 和 `RESOURCE_FOOD_CAP` | [main.readable.lua:140086](../../reference/map-6.25/main.readable.lua#L140086)，`L24_2`；140126–140143 |
| 后续人口 | 第 11/21/31/41 波设置为 50/70/90/100。公式为 `min(FOOD_MAX,30+(wave-1)/10*20)`；是设置上限，不是额外增加同等数量 | [main.readable.lua:128213](../../reference/map-6.25/main.readable.lua#L128213)；`FOOD_MAX=100` 在 137069；夹限在 140086 |
| 初始单位 | 仅 HUMAN 且 PLAYING 的槽位创建 `w001` 工人和 `w000` 能量圈；工人获得 `W001` 天赋选择书；给予 `i004` 特制橙色卡片 | [main.readable.lua:139262](../../reference/map-6.25/main.readable.lua#L139262)–139489 |
| 新手礼包 | `Is_Match_Mode==0` 且 `DZAPI_GetPlayerLv(player)<6`，追加 `i006`，即地图等级≤5。Web 已取消其中地图等级检查，保留非比赛模式条件 | [main.readable.lua:139455](../../reference/map-6.25/main.readable.lua#L139455) |
| 开局英雄限量 | 初始化将 `H010` 的玩家科技允许最大数设为 1 | [main.readable.lua:139278](../../reference/map-6.25/main.readable.lua#L139278) |

初始木材在上述初始化函数没有显式设置；不能仅据此声称初始木材为 0。原引擎默认初始资源及后续模式初始化还需闭合。

`i004` 不是直接给某一张固定英雄卡。使用时先给 1 个 `i401`（1级箱子）和 **2 个** `i411`（1级钥匙），非比赛模式再打开英雄选择；拥有 `SHOPITEM01` 额外给 `i412`。两次 `i411` 创建已与字节码核对。[main.readable.lua:95926](../../reference/map-6.25/main.readable.lua#L95926)–96008；[main.disasm:143857](../../reference/map-6.25/main.disasm#L143857)，`main/f285/f6`。

`Choose_Hero_List` 有 45 张：`i551..i597` 排除 `i571、i577`。先按当前 BAN 列表过滤，再无放回抽 3 个候选，`SHOPITEM01` 为 4 个候选；玩家选择其中 1 张，回调用每玩家标志防止重复领取。**按 Q18，Web 使用 4 个候选、选择其中 1 张。** 开局池和常规 SR 卡池并不相同。[main.readable.lua:87312](../../reference/map-6.25/main.readable.lua#L87312)–87586；[main.readable.lua:87598](../../reference/map-6.25/main.readable.lua#L87598)–87796。BAN 保存入口及权益范围参见平台依赖，未在 Web 中擅自删除。

## 抽卡：整数区间才是概率依据

每次常规抽卡先调用 `GetRandomInt(1,100)`，端点均包含。下面是严格比较对应的整数数量，已逐条对照 `main/f285/f5` 字节码的 `lt` 与跳转，不能把 `<8` 写成 8%。

| 消耗品 / 价格 | 分支 | 最终分布 |
|---|---|---|
| 蓝卡 `i001` / 1000 金 | `r<80` N，否则 R | N 79%，R 21% |
| 橙卡 `i002` / 2500 金 | `r<10` SR；否则 `r<80` R；否则 N | N 21%，R 70%，SR 9% |
| 红卡 `i003` / 5000 金 | `r<8` SSR；否则 `r<42` SR；否则 R | R 59%，SR 34%，SSR 7% |
| 黑卡 `i005` / 13000 金 | `r<14` SSR，否则个人加权 SR | SR 87%，SSR 13% |

分支：[main.readable.lua:95650](../../reference/map-6.25/main.readable.lua#L95650)–95862；字节码 [main.disasm:143398](../../reference/map-6.25/main.disasm#L143398)–143679。价格为 `units_itemdata.json` 的 `goldcost`，配套 JSON 的 `items` 中有四个记录的精确位置；对应图鉴 `装备与道具!D5:D7、D9`。

常规 `RandomN/R/SR/SSR` 在各自连续 ID 区间内等概率：N=`i701..i717`（17），R=`i601..i609`（9），SR=`i551..i597`（47），SSR=`i501..i510`（10）。黑卡的 SR 分支单独走权重算法，其余调用不经过权重。来源：[main.readable.lua:89952](../../reference/map-6.25/main.readable.lua#L89952)–89978 定义，95587–95646 抽取。

`i006` 新手礼包是另一分支：`r<33` 为 `i131`（32%）；`r<66` 为 `i133`（33%）；否则 `i262`（35%）。来源：[main.readable.lua:96010](../../reference/map-6.25/main.readable.lua#L96010)–96072；这是礼包分配，不是常规抽卡稀有度。

### 幸运机会与个人 SR 权重

`W017` 幸运机会先另掷 `1..100`；命中后多调用一次同档抽卡，然后无论是否命中再执行正常抽卡。它不是提升稀有度，不递归触发自己。天赋 0–5 级返回阈值 `0,10,13,16,19,24`，严格 `<阈值` 的实际额外抽取概率为 `0%,9%,12%,15%,18%,23%`。来源：[main.readable.lua:132118](../../reference/map-6.25/main.readable.lua#L132118)–132151；[main.disasm:143805](../../reference/map-6.25/main.disasm#L143805)–143856。**Q17 已裁决**：Web 1–5 级采用原地图能力说明的 `10/13/16/19/25%`；未学习时为 0%。图鉴八表未收录 W017/幸运机会，这组数值来源为 [units_campaignabilitystrings.txt:23602](../../reference/map-6.25/units_campaignabilitystrings.txt#L23602)，不能标为图鉴数值。原脚本概率仅作证据保留。

`CardWeight_Init` 给所有 47 张 SR 卡在每玩家列表中初始权重 100。黑卡进入 SR 分支后，计算当前总权重 `S`，整数抽 `1..S`，按累积权重选卡；若被抽中卡的权重>100，将这张卡重置为 100。初始等权时每张的条件概率是 `1/47`，黑卡总体概率还要乘 `87%`。来源：[main.readable.lua:89467](../../reference/map-6.25/main.readable.lua#L89467)–89570；[main.readable.lua:89678](../../reference/map-6.25/main.readable.lua#L89678)–89779。

权重购买是金币支出：当前权重 `w>=100` 时价格 `500+(w-100)*11`；不足金币不扣款。设 `r=GetRandomInt(1,100)`，增加 `floor(w*k*0.15)`，其中 `r=1` 的 `k=3`（1%），`r=2..24` 的 `k=2`（23%），其余 `k=1`（76%）。修改后通过 `Buy_Weight_Player/Buy_Weight_ItemID` 同步进个人列表。来源：[war3map.j:1871](../../reference/map-6.25/war3map.j#L1871)–1877、[war3map.j:2104](../../reference/map-6.25/war3map.j#L2104)–2172；Lua 同步处理 [main.readable.lua:89289](../../reference/map-6.25/main.readable.lua#L89289)–89347。

**UI 计算不能当抽签公式**：`GetProbabilityByWeight` 显示 `(w-100)*100/(w+4200)`，执行却使用实际所有卡权重总和。这两条公式不同；在初始 47 张池、只改变一张权重时真实条件概率为 `w/(w+4600)`。来源 [war3map.j:1879](../../reference/map-6.25/war3map.j#L1879)–1886 与上述累积权重代码。这里记录差异，未决定 Web 显示方式。

## 金币、赏金、英雄经验与天赋

`InitPlayerResource` 为敌方 Player(11) 打开 `PLAYER_STATE_GIVES_BOUNTY=1`。原生金币/木材赏金使用各怪物对象的 `bountyplus/bountydice/bountysides` 与 `lumberbounty*` 字段；完整主线 55 波字段见 JSON `mainWaveBountyFields`。例如 `m001` 为 gold plus=2、dice=1、sides=2、lumber plus=1；`m002` 的 sides=3，其余相同。这些字段不等于界面固定“每怪若干金”，也不能把所有模式共用一个固定击杀收入。[main.readable.lua:140155](../../reference/map-6.25/main.readable.lua#L140155)–140169；对应 JSON 每怪源行。

`anyUnitDEAT` 在死亡处理开头对击杀者调用 `WAbility_W015`。财源滚滚按工人该天赋 1–5 级额外增加 `5/9/14/20/27` 金；此函数只要求击杀者存在且其工人有天赋，代码本段没有再按怪物等级计算。来源：[main.readable.lua:115680](../../reference/map-6.25/main.readable.lua#L115680)–115691、[main.readable.lua:131747](../../reference/map-6.25/main.readable.lua#L131747)–131834。各英雄技能的额外经济效果另按其技能，不合并到基础赏金。

原图经验由 Warcraft 原生系统承担，地图明确覆盖以下参数：[war3mapMisc.txt:29](../../reference/map-6.25/war3mapMisc.txt#L29)–49。

| 参数 | 原图值 |
|---|---:|
| `GlobalExperience` | 0 |
| `HeroExpRange` | 1600 |
| `BuildingKillsGiveExp` | 1（见第 11 行） |
| `MaxHeroLevel` | 30 |
| `GrantNormalXP` / Formula A,B,C | 2 / 1.4,2,0 |
| `GrantHeroXP` / Formula A,B,C | 30 / 1.4,30,0 |
| `NeedHeroXP` / Formula A,B | 20 / 1.4,20 |
| `HeroAbilityLevelSkip` | 3 |

以上为自定义常量。后续已从官方资料和原始数据注释补齐递推形式、累计阈值含义与默认 C=0 的依据，见 [原生护甲与经验](native-armor-and-xp.md)：升级累计阈值 `T(2)=20`、`T(n)=1.4*T(n-1)+20*n`。原生递推取整、多英雄分摊边界及部分缺省参数仍待核，取整前数学表不能当已验证的整型经验表。

英雄升级事件 `HeroLevelUpEvent`：非深渊（`Game_Mode!=2`）且等级>20、当前没有 `B015` 时，剥离 `level-20` 个等级；正常最高等级配置为 30。`P000` 等级压制的能力对象要求英雄等级 30；学习后添加永久 `P200`。来源：[main.readable.lua:119190](../../reference/map-6.25/main.readable.lua#L119190)–119243、[main.readable.lua:116203](../../reference/map-6.25/main.readable.lua#L116203)–116242；`units_abilitydata.json` 的 `P000.reqLevel=30`。普通技能不能全都假设同一学习曲线：应逐技能合并 `reqLevel`、`levelSkip`、`levels` 和 `war3map.w3a` 各级覆盖；全局 skip=3 只是缺省参数。

工人从 `W002..W009` 选择入口获得对应 `W012..W019`，删除 `W001` 选择书。名称分别为卡片置换、英雄无敌、宝箱许愿、财源滚滚、卡片合成、幸运机会、神兵天降、潜能爆发；准确 ID、能力来源见 JSON `workerTalents`。第 10/20/30/40 波只对已经拥有的天赋升级，不能从“每10波”泛化出第50波再次升级。来源：[main.readable.lua:131080](../../reference/map-6.25/main.readable.lua#L131080)–131301、[main.readable.lua:128130](../../reference/map-6.25/main.readable.lua#L128130)–128141、[main.readable.lua:132450](../../reference/map-6.25/main.readable.lua#L132450)–132650。

潜能爆发实际重新计算英雄三属性加成 `floor((0.5*talentLevel+0.5)*heroLevel)`，先减去此前保存的加成，再加上新值；升级天赋时也重算己方已有英雄。应保存已施加的加成，不能把每次重算当成新增一次。来源：[main.readable.lua:132321](../../reference/map-6.25/main.readable.lua#L132321)–132448。

## 塔成本、升级与回收

`economy-data.json.towers` 为每个塔摘录对象金币、木材、人口、建造时间、英雄成长、升级目标和回收基数。升级链优先记录对象覆盖 `uupt`，其次能力文本中的 `Upgrade`。例如箭塔 `n001→n002→n003` 的对象金币分别为 100、320、620；`n002.points=420`、`n003.points=1040`，恰为这两级累计金价。原图回收不去累计玩家真实账单，而读取当前对象的 `points`。

已建成塔回收函数 `N000_Action` 只接受 `Tower_ALL` 中己方且非工人、非能量圈目标。实际返金为 `floor(GetUnitPointValue(target)*0.8)`，然后清理和移除单位；因此不同对象必须用其 `points`，不能仅对当前一级的 `goldcost` 乘 80%。来源：[main.readable.lua:37341](../../reference/map-6.25/main.readable.lua#L37341)–37417；`N000/A000` 分发 [main.readable.lua:116791](../../reference/map-6.25/main.readable.lua#L116791)–116807。上例二级箭塔返 336，三级返 832（由上述公式和配套 JSON 来源字段推导）。

能力说明写“1级单位回收没有钱，英雄需要双击回收”；脚本函数中并无通用 `level==1` 归零判断，可能由对象 `points` 和原生命令流程实现。后续已在[塔生命周期](tower-lifecycle.md)核查原对象点数、英雄确认及背包清理的真实调用顺序。[units_campaignabilitystrings.txt:12937](../../reference/map-6.25/units_campaignabilitystrings.txt#L12937)–12949。

`ConstructionRefundRate=1.0`、`UpgradeRefundRate=1.0` 是取消建造/升级的原生参数，**不是已建成塔回收率**。[war3mapMisc.txt:12](../../reference/map-6.25/war3mapMisc.txt#L12)、58。

卡片能力如 `I501/I551/I601/I701` 的原生 code 是 `AIbl`，`UnitID1` 指向实际生成塔。卡片 `i501` 的商店金价 5000、塔 `H001.goldcost=4000`、`H001.points=3125` 为三个不同数据。卡片消费按[召唤与交付](summon-and-delivery.md)，直接建造及目标档升级费用按[塔生命周期](tower-lifecycle.md)。 相关对象全部保留在 `reference/map-6.25/units_abilitydata.json`、`units_itemdata.json`、`units_unitbalance.json` 和配套 JSON。

## 变强资格与兑换

`anyBuildCompleteHandler` 对 HERO 或特殊 `n208` 均匀抽整数 `1..13`，组成 `P001..P013`，加为永久 1 级能力。每种的分配概率为 `1/13`；13 种要求的 Max 塔由各能力 `Requires` 指定，配套 JSON `qualifications` 已逐项抽取。来源：[main.readable.lua:115286](../../reference/map-6.25/main.readable.lua#L115286)–115417；[units_campaignabilitystrings.txt:16069](../../reference/map-6.25/units_campaignabilitystrings.txt#L16069)–16250。

这些技能用 `AOae`、BuffID=`B015`、Area=10、self target。脚本查的是 B015 是否实际存在；单位前置条件不应在 Web 被简化成“曾经有过卡片”。后续[资格生命周期基准](qualification-lifecycle.md)已明确Web按当前已完成Max塔即时重算B015；原客户端的具体失效时序仍未实测。 已确认原脚本是在升级事件和拾取事件分别检查，没有证据支持每帧自动降级或卸装。

变强资格商店原图在 `GAME_ENDLESS_TYPE==1` 第 20 波，否则第 25 波开启。[main.readable.lua:128250](../../reference/map-6.25/main.readable.lua#L128250)–128269。

兑换逻辑扫描购买者背包槽位 0–5，按槽位顺序取前 5 个 `GetItemLevel==12` 的物品（R 卡，不要求同名），不足 5 张失败；足够则删除这 5 张并生成所选兑换卡。`i400` 仅翻页不兑换。兑换物品 ID 为 `c001..c013`。这是取得对应塔卡，不是直接给英雄 B015；仍需要建造/升级到要求的 Max 塔。来源：[main.readable.lua:95500](../../reference/map-6.25/main.readable.lua#L95500)–95585、[main.readable.lua:99502](../../reference/map-6.25/main.readable.lua#L99502)–99662。

## 商店、价格与刷新

图鉴商店时序与原脚本一致：挑战商店第11波开、第54波清理；神秘商店第21波开并刷新，其后第26、31、36、41、46、51、52、53、54波刷新。最终刷新函数 `Fshop_Last_Update` 另启 120 秒定时器隐藏 Fshop。来源：[main.readable.lua:128236](../../reference/map-6.25/main.readable.lua#L128236)–128339；[main.readable.lua:125667](../../reference/map-6.25/main.readable.lua#L125667)–125697。最后刷新调用点已定位：`Game_Mode==1` 分支中，`cur_endless_lv` 自增并等于 `endless_choose_lv` 时调用（[main.readable.lua:127658](../../reference/map-6.25/main.readable.lua#L127658)–127728）。120秒回调只 `ShowUnit(Fshop,false)`，字节码 `main/f292/f2` 没有关闭个人子商店；`ShowFshop` 曾将 Fshop、Pshop1–3 和全部4个 `Player_FShop` 分别显示。个人模式选择 Fshop 时会转选自己的 `Player_FShop[playerId+1]`，因此隐藏入口和隐藏个人库存单位是不同动作。来源：[main.disasm:180565](../../reference/map-6.25/main.disasm#L180565)–180613、[main.disasm:181000](../../reference/map-6.25/main.disasm#L181000)–181043、[main.readable.lua:138808](../../reference/map-6.25/main.readable.lua#L138808)–138848。**已闭合脚本行为：没有同时隐藏个人店。** 个人店保留选择状态时原生商店是否仍可交互，需要引擎验证；不能擅自把原图改成统一关闭。

普通商品价格直接来自对象 `goldcost/lumbercost`，配套 JSON `items` 覆盖图鉴全部 243 个条目。物品可典当标志 `pawnable`、原生库存 `stockMax/stockRegen` 也一并保留；脚本手动 `AddItemToStock` 可以覆盖库存，不能用静态库存替代神秘商店算法。物品卖店折价的引擎默认比例本轮未闭合。

神秘商店随机池先按**组权重**抽组，再在组内均匀抽一件。原始组如下；数值是组权重，不是售价或百分比：

| 组权重 | 物品 |
|---:|---|
| 25 | i305 圣剑制作书 |
| 50 | i311 神杖制作书，Q81 在第21波首次开放时加入 i235 侦查守卫 |
| 60 | i321 灰烬兜帽制作书 |
| 80 | i309 怨念魔杖、i307 裁决之剑、i315 知识之书制作书 |
| 120 | i414 四级钥匙、i303 群星之怒、i317 斩敌巨斧、i323 遗物之刃、i324 雪落法杖、i331 魔焰之心制作书 |

总权重 335，追加函数只扩大50组的组内池，并不把总权重加50。`Add_Flow_Shop` 的函数体只执行 `AddArrAny(L2_2[2],"i235")`，没有自身条件、没有去重。原图只找到该函数的定义和导出，未发现调用。Q81 将第21波首次开放作为解锁条件，在本局首轮刷新前向随机奖池的50权重组加入 i235 一次。组总权重仍为50，两件组内等概率。此状态随当前局保存，读档恢复成员及已有库存，后续刷新使用两件的组内池。无尽等固定表仍按原固定列表。机器规则见[八表取得入口](workbook-coverage-readiness.json)。函数及字节码：[main.readable.lua:125638](../../reference/map-6.25/main.readable.lua#L125638)–125647、[main.disasm:180542](../../reference/map-6.25/main.disasm#L180542)–180564。来源：[main.readable.lua:125488](../../reference/map-6.25/main.readable.lua#L125488)–125664。默认个人非比赛且非 `Game_Mode==1` 的刷新执行 7 次抽取，其余执行 11 次；同品累加库存但最多4件。旧库存先清空。已对照字节码 `main/f292/f0`，精确固定表条件是 **`Game_Mode==1 OR (Is_Match_Mode==1 AND cur_monLv∈{31,51})`**。固定顺序为 `i305,i311,i321,i303,i317,i323,i324,i315,i331,i307,i309`，这11件各1份；不含随机池中的 i414 四级钥匙。固定条件成立时，刷新次数分支也为11次。来源：[main.disasm:180447](../../reference/map-6.25/main.disasm#L180447)–180540 核条件，180327–180418 固定表，180616–180803 核库存循环。[main.readable.lua:125698](../../reference/map-6.25/main.readable.lua#L125698)–125842。

`i399` 刷新球碎片每人每局限点击1次，由购买计数数组控制；次数不是每次自然刷新重置。购买动作删除菜单物品，成功后重建对应库存。来源：[main.readable.lua:125845](../../reference/map-6.25/main.readable.lua#L125845)–125948；图鉴 `装备与道具!H226`。

挑战商店以玩家专属 `Player_BOSS_Shop` 验证购买者；挑战按钮走脚本，不能仅看按钮对象价格。`ShopBOSS_show` 设10秒后出怪、每玩家240秒挑战间隔。其奖励另分金币、木材、制品等：`m511/m521/…/m571` 系列一阶挑战成功加3000金；相应二阶 `m512/.../m572` 加300木。来源：[main.readable.lua:101561](../../reference/map-6.25/main.readable.lua#L101561) 起 `Item_BOSSShop_Buy`；[main.readable.lua:88230](../../reference/map-6.25/main.readable.lua#L88230)–88304；[main.readable.lua:88541](../../reference/map-6.25/main.readable.lua#L88541)–88618。挑战完整奖励与出现条件应与波次/挑战规则合并，不把上述额外奖励当普通怪基础赏金。

## 装备槽、拾取门槛、自动合成与妖刀

原生 `AInv.DataA1=6`；拾取、配方和兑换逻辑也都扫描槽 0–5。合成要求材料在**同一个单位**的背包中。`Item_Get` 触发于拾取，先执行携带资格检查，再遍历配方，找到第一条材料齐全的配方即合成并返回；不是任意时间自动跨工人、塔、能量圈搜集材料。[main.readable.lua:96457](../../reference/map-6.25/main.readable.lua#L96457)–96505 的 `L14_2` 匹配器；[main.readable.lua:96936](../../reference/map-6.25/main.readable.lua#L96936)–97062。

配方第1项是成品，后面是材料。每个材料条目必须匹配一个尚未使用的槽位，因此配方要求两把同名武器时需要两个物品实例，不能让一个槽反复匹配。普通有多充能的材料消耗1次，余量保留；≤1次时删除。特别增长装备列表 `L5_2` 中有正充能的材料先保留充能值并整件移除，成品也在该列表时继承充能。以上消耗分支已对照字节码 `main/f285/f10` 的 l447–l519，修正了辅助反编译中看似错嵌套的 `else`。[main.disasm:145115](../../reference/map-6.25/main.disasm#L145115)–145205。

拾取的主要门槛：

- `Game_Mode!=2` 时，非工人、非能量圈单位拾取 `GetItemLevel>3` 的物品，除 `ignore_strong_item` 中明确实例外，要求 B015；英雄或装备显示颜色不是本段判断依据。熊灵伙伴有查询关联英雄的特殊分支，`A_ITEM_ID` 还会进入另一分支，不可笼统豁免所有召唤物。[main.readable.lua:96782](../../reference/map-6.25/main.readable.lua#L96782)–96934；字节码 [main.disasm:144933](../../reference/map-6.25/main.disasm#L144933)–145100。
- 非工人、非能量圈单位禁止 `GetItemLevel>10` 的物品（卡片等）。特定 i256/i329/i278 也有工人限制，能量圈另外不能放 i256/i278。[main.readable.lua:96548](../../reference/map-6.25/main.readable.lua#L96548)–96660、96749–96781。
- 装备互斥按 `L4_2` 分类表检查，排除当前正在拾取的物品；工人/能量圈不受同类装备检查。检查位置在尝试合成之后。不能仅按“相同 itemID 不能重复”实现。[main.readable.lua:97063](../../reference/map-6.25/main.readable.lua#L97063)–97135；完整12组见下表，已核对字节码 `main/f285` 的数组构造和 `main/f285/f10` 的判断。


| 同类互斥组 | 全部 itemID | 定义起始行 |
|---|---|---:|
| 妖刀 | i131,i132,i133,i134,i262,i263 | 94149 |
| 圣剑 | i304 | 94222 |
| 群星之怒 | i302 | 94279 |
| 斩敌巨斧 | i316 | 94335 |
| 灰烬兜帽 | i318,i319,i320 | 94390 |
| 阿哈利姆神杖 | i310 | 94450 |
| 闪烁匕首 | i236,i234 | 94503 |
| 遗物之刃 | i322 | 94558 |
| 雪落法杖 | i325 | 94609 |
| 魔焰之心 | i330,i332 | 94659 |
| 玲珑心 | i327 | 94711 |
| 魔龙枪 | i282 | 94759 |

上述列表已收录 JSON `equipmentExclusionGroups`，不是按名称猜出的类型。数据定义 [main.readable.lua:94148](../../reference/map-6.25/main.readable.lua#L94148)–94817；字节码 [main.disasm:142586](../../reference/map-6.25/main.disasm#L142586)–142686；检查跳转 [main.disasm:145212](../../reference/map-6.25/main.disasm#L145212)–145283。成品重入拾取事件后也会受检查；链式事件的实际调度顺序属于原生事件语义。

充能继承特例全表 `L5_2` 为 `i332,i330,i145,i147,i220,i327,i218`。它与下面的成长映射共用 ID，但继承时保留的是物品充能数，不是简单复制原载体增加过的最大生命/魔法数值。每点生命充能值4最大生命，每点魔法充能值3最大魔法；各物品的每次击杀增长如下：

| 物品 | itemID | 类别 | 每次符合击杀增加充能 | 每点充能属性 |
|---|---|---|---:|---:|
| 魔焰之心关闭的 | i332 | life | 2 | 4 |
| 魔焰之心开启的 | i330 | life | 2 | 4 |
| 恐鳌之心 | i145 | life | 2 | 4 |
| 掠夺者之斧 | i147 | life | 1 | 4 |
| 血精石 | i220 | mana | 2 | 3 |
| 玲珑心 | i327 | mana | 1 | 3 |
| 振魂石 | i218 | mana | 1 | 3 |

来源：[main.readable.lua:94818](../../reference/map-6.25/main.readable.lua#L94818)–95004；字节码 [main.disasm:142687](../../reference/map-6.25/main.disasm#L142687)–142777。拾取按已存充能增加载体属性；成长击杀逻辑对生命组按 `i332→i330→i145→i147` 顺序只取第一个有的，对魔法组按 `i220→i327→i218` 顺序只取第一个有的，并不同时给所有成长装加层。[main.readable.lua:97792](../../reference/map-6.25/main.readable.lua#L97792)–97920。

普通合并充能白名单 `L12_2` 为 `i127,i128,i001,i002,i003,i005,i235,i258,i259,i260,i329,y006,y008,y010`：若拾取同 ID 且已有另一个实例，将新旧 charges 相加到旧实例，删除新实例。它是另一套白名单，不能把全部装备都自动叠成一个槽。来源：[main.readable.lua:95408](../../reference/map-6.25/main.readable.lua#L95408)–95498、97136–97162；字节码 [main.disasm:145284](../../reference/map-6.25/main.disasm#L145284)–145310。

破损妖刀 `i131/i133/i262` 只有放在所属玩家能量圈才会吸魂。单位死亡处理把击杀归属单位传入 `ItemUnitDeadAction`，该函数从其所有者的能量圈槽0到5查找，找到首个破损妖刀后处理并退出；同一击杀不会给圈内多把破损刀同时加魂。每个被击杀非英雄+1，`UnitIsHero(dead)` 为真则+5，不是按“Boss”名字判断；达到1400移除破损刀并生成 `i132/i134/i263`。来源：[main.readable.lua:97718](../../reference/map-6.25/main.readable.lua#L97718)–97788、[main.readable.lua:80309](../../reference/map-6.25/main.readable.lua#L80309)–80354、80479–80524、83876–83921；调用者116187。

## 仍需闭合，不能据此开始完整经济实现

后续已在 [召唤与交付](summon-and-delivery.md) 核对 149 行卡片、人口预检和 15 处交付调用，并按 Q24 固定卡片使用不另收费、提交前失败保卡、创建/人口/扣一次充能共同提交及脚本满包交付落地。原生建造时长、施工取消和其他剩余边界以该页最新范围为准，不能用本页较早的缺口列表撤销已选 Web 规则。

1. 原生经验递推、整数取整、分摊与缺省常量；逐技能学习等级需合并各级对象覆盖。
2. 卡片人口与扣费、失败和取消已有[召唤与交付](summon-and-delivery.md)。
3. 直接建造、建筑升级、回收及普通死亡已见[塔生命周期](tower-lifecycle.md)。
4. 变强资格本身已由qualification-lifecycle-v1补齐；继续核原生剥级的自然属性/技能点/已学等级，以及完整变身和伙伴生命周期。
5. 神秘商店固定表条件、实际隐藏对象已核字节码。`Add_Flow_Shop` 的 Web 触发由 Q81 确定。Fshop 隐藏后的个人店交易遵循[会话规格](session-and-task-state.md)。
6. 12组同类互斥、7个充能继承物品、7个成长映射、14个充能合并物品已全部提取；连锁合成重入、背包满、原生 `UnitAddItem` 失败的具体行为仍需引擎验证。
7. 新手礼包的地图等级限制、付费/赞助权益、普通积分/碎片永久项目均已有独立裁决，不再重复询问；旧赛季、活动与任务来源及 BAN 本机设置的保存仍需对照平台来源记录处理。

上述未闭合项是原生语义或未完成的分支追踪，不是建议发明新机制。所有概率差异保留原证据；已确认的图鉴/脚本数值差异按用户全局授权直接采用图鉴，缺项查原图，图鉴内部矛盾或机制歧义另核。
