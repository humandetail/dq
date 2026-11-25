# 直线攻击 N017–N019 与炮击 N020–N022

本页只闭合这六个图鉴 ID 的能力字段、必要脚本和**单位战斗**原生适配；基准为 **`creep-line-v1` / `creep-artillery-v1`**。[机器证据与案例](creep-line-and-artillery.json)由[审计工具](../../tools/audit_creep_line_artillery.py)以 `--write` / `--check`复现。原地图、图鉴和快照未修改，没有执行 Warcraft 客户端。

原字段、字节码事实与 Q24 Web 选择分开。复用 B03 完整伤害事件、B04 稳定序号、B05 战斗时钟、[攻击时序](attack-timing.md)、[普通暴击](native-critical-family.md)和 `aocr-marker-contribution-v1`；不把 `area-damage-v1` 的敌方目标限制移植到炮击。这里保存原始武器字段，不替主线程决定 S18/S19 的全局攻击分量映射。

## 图鉴与实际挂载

| ID | 图鉴行 / 载体 | 图鉴完整效果 | 实际行为来源 |
| --- | --- | --- | --- |
| N017 | 754 / n153 近卫投石车 Lv1 | 普通攻击能攻击一条线上的敌人造成300点伤害。距离900。 | N017_19_Action → T038 Lv1 |
| N018 | 755 / n154 Lv2 | 普通攻击能攻击一条线上的敌人造成600点伤害。距离1200。 | 同函数 → T038 Lv2 |
| N019 | 756 / n155 Max | 普通攻击能攻击一条线上的敌人造成1200点伤害。距离1500。 | 同函数 → T038 Lv3 |
| N020 | 706 / n156 天灾投石车 Lv1 | 普通攻击能伤害一个小范围内的敌人。 | 武器槽1 artillery |
| N021 | 708 / n157 Lv2 | 普通攻击能伤害一个范围内的敌人。 | 武器槽1 artillery |
| N022 | 710 / n158 Max | 普通攻击能伤害一个大范围内的敌人。 | 武器槽1 artillery |

六行全部读取 A–J；G=1，I/J 均显式为空，无补充数字或图鉴内部冲突。六个标记 [SLK](../../reference/map-6.25/units_abilitydata.json#L24356)的 code 都是 AOcr、等级1、DataA–E 缺失；w3a 均无增量。标记的[实际 Ubertip](../../reference/map-6.25/units_campaignabilitystrings.txt#L13141)逐字等于对应 H；标准暴击 Researchubertip 是残留学习文案，不能增加另一份暴击、必中或伤害。

[n153–155](../../reference/map-6.25/units_unitabilities.json#L5985)挂 Avul、T033 和对应 N017–19；[n156–158](../../reference/map-6.25/units_unitabilities.json#L6000)另挂 N159，保留已核[额外金币分派](skill-lizard-frenzy-and-gold.md)。六塔目标分类都是 `ground,organic`，不能按投石车模型认定为 mechanical。单位 w3u 六条增量中的弹道/模型字段合并保留，没有覆写攻击伤害、范围、武器开启位或能力挂载。各级是替换塔类型后使用新标记等级1，没有新增标记升至2/3级的入口。

## 直线攻击的完整脚本与分派

实际技能是 **T038，不是 T010**；后者不在这个调用链。`main/f175/f0` [L113086–113140](../../reference/map-6.25/main.disasm#L113086)共52条指令、2个条件、12次直接 call、1个返回：

1. 读实际事件来源 S、当前受伤者 T、S 的位置。查**实际 S** 的 N017>0，成立 rank=1；否则 N018>0 则 rank=2；否则 rank=3。N019 没有在函数内部再查；无标记直接调用也会落 rank3，但正常入口会过滤。异常共存优先 N017→N018→N019，标记实际等级大小不参与伤害等级。
2. 调 `CreateTempAndSetAbilityLv(owner(S),loc(S),0,"T038",rank,0.5)`。完整 helper [main/f7/f20](../../reference/map-6.25/main.disasm#L51476)在可选第7参数为 nil/false 时取 q001，依次创建单位、加能力、设等级、加 BHwe 0.5秒计时生命并返回。33条指令中末尾空 return 不可达；这里没有省略的施法或 UserData 操作。
3. `SetUnitUserData(D, IsInTable(S,Tower_ALL))` **先于** `IssueTargetOrder(D,"carrionswarm",T)`。命令布尔返回被忽略；不重试，不替换原普通攻击，不写 EXSetEventDamage，不抽随机，也没有注册 Lua 回调或释放位置。不要以通常的内存清理习惯改写原调用顺序。
4. 完整 [IsInTable](../../reference/map-6.25/main.disasm#L50791)17条指令：查找对象 nil 返回−1；按原 `pairs` 顺序找到相同表值即返回键；找不到返回−1。重复值时取实际 pairs 第一个，不能套 B04 更改这个表查找。原函数最后空 return 不可达。

真正入口是伤害分派 `main/f291/f1` [PC1730–1760](../../reference/map-6.25/main.disasm#L164318)：`EXGetEventDamageData(2) != 0` 且实际 S 的 N017/N018/N019 至少一个>0。没有局部幻象、英雄、所有者、N535、概率或当前伤害正值检查。入口查 S，不是已经解析的归属 O。

必须保留[完整伤害管线](damage-pipeline.md)的上游控制：原入口零伤害在 PC27 早退；q004/q005 的强制零包也在此前退出；q039 的旁路和 B177 PC214 的早退会绕过本入口。`ItemDamageActionBefore` PC107 已执行，而 `ItemDamageActionAfter` PC1917 在直线分派之后。初次非零事件后来被 Before 或其他修正写为0，并不会在这里重新检查；不能增加“当前伤害>0才发直线”的规则。此页重核局部31条和全部分支，不声称重做整个大管线或它的所有被调技能。

T038 产生的每笔实际伤害来源保持 **D=q001**，归属 O 每次按原 `Tower_ALL[userData]` 动态解析。缺失索引−1或后来塔表删除不得自动回退原塔。q001 的 spell effect 正常进入 AnySkillStart，但 [PC40–44/65](../../reference/map-6.25/main.disasm#L170040)的 IsTemp 提前返回，发生在 Item_Skill_Action PC70 之前，因此不能让这次马甲施法触发装备施法效果。T038 伤害不是 attack，不能递归本直线入口。

## T038 字段、数值优先与局部原生定义

[T038](../../reference/map-6.25/units_abilitydata.json#L33010) code=AUcs、三级；无 w3a 增量。

| 参数 | 原对象 Lv1 / Lv2 / Lv3 | Web |
| --- | --- | --- |
| DataA，每目标伤害 | 300 / 800 / 2200 | **300 / 600 / 1200**，按图鉴及用户数字优先授权 |
| DataB，总原始伤害预算 | 9,999,999 / 同 / 同 | 保留 |
| DataC，传播距离 | 900 / 1200 / 1500 | 保留 |
| Area 与 DataD，起/末范围 | 100 / 110 / 120，各级起末相同 | 保留为下述扫掠半径 |
| Rng / Cool | 2000 / 10秒 | 保留 |
| Cost / Cast / Dur / HeroDur | 缺失 | 不假称源码0；见局部定义 |
| targets | ground,air,organic | 保留有机限制 |

[实际 T038 profile](../../reference/map-6.25/units_campaignabilitystrings.txt#L19774)给出命令 carrionswarm、弹体 GlaiveMissile、速度1200；T038 的实际/学习说明仍是模板75/125/200。玩家持有标记的实际说明与图鉴一致；不以隐藏马甲模板文案覆盖上述明确数值。[编辑器元数据](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/AbilityMetaData.slk)确认 Ucs1/2/3/4 的字段意义；[暴雪 Carrion Swarm](https://classic.battle.net/war3/undead/units/dreadlord.shtml)支持方向群伤和不伤守卫，[官方法术说明](https://classic.battle.net/war3/basics/spellbasics.shtml)支持不伤友军及魔法免疫过滤。没有匹配客户端证明定制 alias 的缺省/几何/回调时点，剩余按 Q24 明定：

- **原普通攻击仍保留。** [n153–155 武器](../../reference/map-6.25/units_unitweapons.json#L30800)开启位1，仅槽1 `normal/magic`；C=1.7、P=.1、B=1.9、最小射程250、最大900/1200/1500。槽2虽然是 aline，但未开启；槽1残留的伤害圆环、spillRadius、damageLoss 不自行启用。Web 槽1按 normal 在攻击提交点立即命中、`attack=true,ranged=false,MAGIC/NORMAL`，保持一次主攻击命中/暴击/ATTACKED，不模拟 w3u 的1400弹体飞行或另一份原生穿透。原 `dmgplus=1,dice=1,sides=1` 是字段事实，不把源2点算术当成最终全局攻击力。
- **接受与提交。** q001 的 [mana0/manaN 都是1000](../../reference/map-6.25/units_unitbalance.json#L37578)，并非原塔提供蓝池；[castpt 缺失](../../reference/map-6.25/units_unitweapons.json#L34183)。本能力局部选择费用0、施法前摇0；缺省事实仍保存。命令要求来源存活存在、无沉默/眩晕/妖术/暂停等施法锁、T038有效且就绪，目标为2000内可见敌方存活地空有机、非建筑/机械/守卫，排除隐藏/Aloc/无敌/魔免，虚无可选。捕获接受时目标位置，在当前父伤害调用栈结束后由 B05 零时提交；重查来源/施法锁/能力/就绪，付0、起10秒CD、派一次正常 spell effect，再发波。该事件使源死亡/删除时不发波，已起CD不退。目标随后移动/死亡不取消已捕获的点。失败发令仍留马甲到0.5秒，不改变原脚本无条件计时生命。
- **轨迹。** 生效时从 D 当前坐标指向捕获点；重合用创建朝向0°。与此前 [AUcs 家族](creep-skill-family-001-053.md)同一局部扫掠圆盘算法，但独立保留本能力目标掩码：圆心以1200移动900/1200/1500、半径100/110/120恒定；t0包含起点闭圆，动态连续接触判定，同刻按 B04，每逻辑目标每波最多一次；末端圆盘包含边界，不增加单位碰撞半径。不在主目标处截断，也不把所有目标瞬时结算。
- **逐接触伤害。** 再查敌方地空有机、非建筑/机械/守卫、非隐藏/Aloc/无敌/魔免，范围可伤普通隐形单位。每次取 `d=min(本级Web伤害,剩余预算)`，扣原始预算后由实际 q001 发 `false,false,NORMAL/MAGIC` 完整 B03；不足允许最后一笔部分额，0不发事件。哪怕后续地图将伤害改0，已用原始预算也不返还。数额独立于父普通攻击伤害、暴击及父目标护甲；每波独立，无普通命中/暴击重抽、控制、N535、慢速或眩晕。
- **0.5秒生命与更长波。** 最远圆心时间为0.75/1/1.25秒，不能未经说明让原0.5秒生命截断后半段。Q24 保留0.5秒真实死亡、既有死亡回调和死亡状态，并在已发波完成前保留死 q001 的伤害来源身份；自然尸体清理不得提前删除这份身份，不复活/延长存活时间、不改成原塔发包。显式 RemoveUnit 取消剩余接触。q001 原 `death=1.0` 是模型死亡时间字段，不证明精确尸体删除时刻。原塔死亡、升级或删除不自动删除其马甲或改 UserData；每次归属仍动态解析。波至末端/预算耗尽结束，已命中集合与波状态随存档保留。

这里的两条 Web 选择不会被偷换：普通攻击向建筑打出的原生包仍可成功，但 T038 对建筑发令失败，因此没有额外有机波；以及事件来源若是幻象且确有标记，原脚本仍可发波，不能额外加“只真塔”过滤。幻象如何获得能力及其普通输出系数由既有创建接口决定，本页不凭空授予。

## 天灾炮击的武器事实

[n156–158 武器记录](../../reference/map-6.25/units_unitweapons.json#L30956)是范围伤害本体，N020–22 和三个载体 ID 均无精确 Lua 字符串/FourCC 引用。不是通过 N020_Action 或 UnitDamagePoint 施法。

| 字段 | n156 / n157 / n158 |
| --- | --- |
| 开启槽 / 类型 | weapsOn=1；槽1 artillery，攻击类别 **pierce** |
| C / P / B | 2 / 0.7 / 1.3秒 |
| 最小/最大射程 | 250；1000 / 1200 / 1400 |
| 全额圆 | 半径150，×1 |
| 中额圆 | 半径300，×0.7 |
| 外额圆 | 半径400 / 450 / 500，×0.4 |
| 直接目标 | ground,debris,tree,wall,item,ward |
| 溅射目标 | ground,structure,debris,tree,wall |
| 原 dmgplus / dice / sides | 826/1/23；1454/1/43；3356/1/62 |
| w3u 弹道 | MeatwagonMissile，速度900、非追踪、arc约0.30000001192092896 |

槽2是 siege/missile、只打 structure，但槽2未开启；不能以默认绞肉车“攻城”名称覆写槽1实际 pierce，也不能多打一包。`damageLoss1` 缺失，不是溅射逐人衰减。模型缩放 .7/.9/1.1 不改变上表逻辑范围。[编辑器 UnitMetaData](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/UnitMetaData.slk)和[字段标签](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt#L5198)区分 full/medium/small 圆及各自因子；H/Q 的内部缩写不能强制改为50%/25%。

[暴雪攻城说明](https://classic.battle.net/war3/basics/siegeunits.shtml)明确可以误伤己方、对战争迷雾用 Attack Ground；[绞肉车说明](https://classic.battle.net/war3/undead/units/meatwagon.shtml)确认炮击范围档和最小射程。原模板自身 siege、疾病、股票范围不是这个自定义单位字段。相比之下，[标准刃车](https://classic.battle.net/war3/nightelf/units/glaivethrower.shtml)的 Aline/Vorpal 才是另一种穿透行为，不能使前述 `normal` 槽1隐式获得穿透。

## 炮击的 Q24 有界适配

**发射。** 槽1沿 attack-timing-v1：攻击间隔/前后摇按现有效攻速缩放。命令接受及发射均检查二维中心距离250至该级最大值（含等号）。单位直接自动目标须可见敌方地面非建筑，包括机械/有机/守卫，排除空军、隐藏/Aloc/无敌/虚无；魔免仍可受物理武器伤害。手动友方攻击仅经显式普通命令接口允许，不自动搜友军。原直接 mask 没有 structure，不能用未启用槽2直接点建筑；Attack Ground 或旁边敌人的炮击仍能溅射建筑。地面攻击允许迷雾中的有限合法坐标；低于最小射程不能因为外圈能扫到便绕过限制。

发射时固定目标当前 XY，不预判走位、不追踪；随后目标移动/死亡/不可见不取消炮弹。发射前目标已死或不合法则取消。按水平距离/900和 B05 取整到达，arc只表现高度，不额外计算曲线弧长、地形遮挡或模型碰撞。源死亡后已发炮弹继续，显式删除源则取消；升级不改已发炮弹的源身份、武器快照或弹着点。

**普通命中与暴击。** 单位主目标攻击发射时快照一次共享武器原始额 R、已注册暴击候选得到的 M、幻象输出系数 f，以及主目标专用固定攻击附加 B。该发射时点是本炮击的明确局部选择，不把已发弹的 RNG 留到任意受害者循环内。正常攻击失败命中的原生散射算法没有匹配一手实现；Web 明定仍飞向捕获点，但本发炮弹豁免被判未命中的那个主目标，其他合法旁观目标仍可受溅射。不新增随机散射，不让主目标隐身/闪避失败导致所有旁观目标各抽一次闪避。Attack Ground 无指定主目标、不虚构 ATTACKED 目标、不抽目标型暴击；M=1，除非已有独立生效、不依赖特定目标的攻击贡献。普通暴击候选如何产生仍由已定基准负责，不因 N020 标记再抽暴击。

**落点、范围和顺序。** 到达固定点时取外圈闭圆候选快照，合法的原主目标在快照内则先处理，其余按 B04。按当前中心距离，`d<=150`取1，`150<d<=300`取.7，`300<d<=outer`取.4，外面取0。没有碰撞半径膨胀、线性内插、圆环叠加、弹射式 damageLoss，也没有“主目标再额外全额一包”。主目标若已移动到中圈，只吃中圈份额；移出外圈不受伤。后续每人重检死亡/免疫/位置，上一人的地图事件能影响下一人；不将所有生命同时扣除，新出现且不在初始候选快照的单位不追加入本弹。

**目标与归属。** 溅射保留原掩码，不加 enemy-only：合法地面单位包含友军、自己、中立、敌方、建筑和机械；普通隐身可被范围伤害，排除空军、隐藏/Aloc/无敌/虚无，魔免允许。原塔有 Avul，故常规情况下友军塔仍免伤。ward/item 不在溅射 mask 中，只在它本身是合法原主目标且仍在外圈时按其距离份额处理，不能扫描后无差别溅射所有守卫或物品。

单位伤害的实际来源保持 n156/n157/n158，本弹每名单位一笔 `attack=true,ranged=true,PIERCE/NORMAL`，完整经过 B03 与原地图分派；不改为 q001，不改为普通 UnitDamagePoint。基础范围份额是 `(R*M)*f*band`；只有仍合法的指定主目标另含固定 B，即 `((R*M)+B)*f*band`。不用主目标已受护甲/地图回调后的最终掉血作为范围基数。原生主攻击法球只在主目标一次；地图 Lua 若只按 attack 标记做过滤，仍可能每笔溅射触发，不能为防多触发跳过整个回调或统一改为非攻击。每笔 N159 金币/模式修正同样分别运行。

没有附带眩晕/减速/定身、SPELL_EFFECT、蓝耗、N535 或额外技能冷却；仅普通武器节奏。已注册的其他装备或被动可独立改变事件，但不等于炮击本身带控制。删除说明标记不等于删除单位已经配置的 artillery 武器。

**世界物体边界。** tree/debris/wall/item 不能因为不是战斗单位而从掩码删掉。炮弹向共享世界物体伤害接口提交同样几何和原始份额、实际 S 与 PIERCE/NORMAL 分类，非单位不伪造 anyUnitDamaged/英雄/装备击中回调。已确认地图 N549 可创建 LTlt，[原 SLK](../../reference/map-6.25-pathing/units_destructabledata.slk#L2505)为50HP、armor=Wood、targType=tree，[路径审计](pathing-and-placement.md)记录其动态阻挡；**Wood 的材料映射、物品防御、完整可破坏物导入与死亡/阻挡生命周期仍是共享系统依赖，本页没有完成它们**，也不把模型装饰植物自动当成可受伤树。此边界不影响本页已经明确的六技能单位伤害规则，但不可据此声称所有世界物体互动闭合。

## 验证与保存边界

复现检查36条原始 SLK 记录、184项明确字段/缺失断言、6行60个 A–J 单元格、7个能力无 w3a 增量、6条单位 w3u。三个完整函数102条指令，两个必要片段57条；全部157条可达指令均被原生桩探针覆盖，两个编译器末尾空 return 明确不可达。包括迭代器继续条件，JSON 对15个条件给出原 PC、源码行和真/假目标；8个 return（含两条不可达）分别记录。71个静态探针覆盖所有标记组合、发令成功/失败、归属存在/缺失、helper默认/显式类型、迭代查找与临时施法早退。不是游戏客户端执行。

69个独立规格向量覆盖300/600/1200、扫掠边界/接触时间、预算不足、250最小射程、150/300/各级外圈等号、水平弹道时间、主目标固定额不扩散、未命中主目标豁免、动态死亡/归属以及死马甲身份保留。工具同时验证相对链接与 source hash，再生必须一致。

存档需保存攻击/波唯一号、实际源/原主目标身份、已捕获落点、等级与原始攻击分量/RNG结果、范围档、发射/到达时间、扫掠进度/已命中集合/预算、马甲死亡和延迟身份、B05队列序号；续局不重抽或重复发射。以上为状态要求，没有实现运行时。仍未证明原客户端逐帧一致；全局攻击分量 S18/S19、世界物体系统、幻象创建/升级事务以及伤害/死亡分派的其他被调函数各自保留在原范围。
