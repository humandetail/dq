# 分裂箭、分裂箭工程升级与月刃

**hero-attack-extensions-v1** 核对 A005、A098、A100、A052 的武器扩展和装备事件接口。A097/A099 为分裂箭的别名。两本图鉴的七条技能行和五条塔行逐列一致。七条 J 均为空，设计值取 H/I。[机器表](hero-attack-extensions.json)

| 图鉴技能 | 塔与技能行 | 采用值 |
|---|---|---|
| 分裂箭 A005 | 桔梗 G043／365、琴弓媚姬 G035／506、美杜莎 H002／542 | 共攻击 3／4／5／6／7／9 个敌人，含主目标 |
| 分裂箭工程升级 A098 | 桔梗 G043／370 | 固定攻击 +2，移动速度 +10%，A005→A097 |
| 分裂箭工程升级 A100 | 琴弓媚姬 G035／511 | 固定攻击 +2，移动速度 +10%，A005→A099 |
| 月刃 A052 | 新月骑士 G074／335、月之骑士 H016／355 | 主目标后最多 3 跳，每跳衰减 30／24／18／12／6／0% |

## 分裂箭

A005/A097/A099 都是六级 Aroc。SLK 明写 1–4 级 Area=1300、DataB=99,999,999、DataC=1/2/3/4、目标 alive,enemies。W3A 给三者补 5/6 级 Efk3=5/7。只有一级明写 Cool=2，DataA 全缺，5/6 级范围、掩码和预算没有独立字段。提示与图鉴的总目标数一致。编辑器将 Efk1/2/3 标为单目标伤害、总伤害上限、最大目标数。暴雪弹幕说明支持并发火箭和 2 秒冷却，原图 DataC 是否含主目标没有得到验证。[三能力 SLK](../../reference/map-6.25/units_abilitydata.slk#L12224)、[A005 增量](../../reference/map-6.25/war3map.w3a.json#L57)、[A097/A099 增量](../../reference/map-6.25/war3map.w3a.json#L1980)、[编辑器标签](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt#L6322)、[官方弹幕](https://classic.battle.net/war3/human/units/siegeengine.shtml)

三个载体有效第一武器均为 missile、英雄攻击类别，射程 1000，C/P/B=1.26/.73/.54，基础额 3、1d15。副箭三个别名均明确 1200 速度、追踪，A005 用 NagaArrowMissile，A097 用 MED_JG_DD.MDX，A099 用 MED_QGMJ_DD.mdx。相应主投射物模型相同、速度 1200，主投射物追踪字段未单列，Web 局部沿追踪。主射程沿当前有效武器，1300 是副目标半径。[H002 武器](../../reference/map-6.25/units_unitweapons.json#L22737)、[副箭 A005](../../reference/map-6.25/units_campaignabilitystrings.txt#L58)、[副箭 A097/A099](../../reference/map-6.25/units_campaignabilitystrings.txt#L1437)

**Q24 发射。** 复用[普通塔 Aroc](creep-skill-family-001-053.md#多重箭-n007011)接口。一次普通攻击开始发一个 ATTACKED。前摇结束、复查可提交后发主箭。实际分裂箭槽已学 1–6 级、启用且锁到期时，同刻取塔当前位置 1300 闭圆内合法敌方单位，按 B04 创建序取至多 2/3/4/5/6/8 个不同副目标。排除主目标、死亡/删除、在建、隐藏/不可见、Aloc、无敌及虚无。允许武器可攻击的地面、空中、建筑、机械、守卫及魔免。副箭只选单位。提交起锁 2 秒，零候选也起锁，未提交不消耗，攻速不改变副箭锁。等级 2–6 的冷却和 5–6 的范围、预算、掩码显式沿用低级值。升级、启停及别名切换不重置锁。

**Q24 命中。** 主副箭共用一次掷骰组成的武器原始值 R。每个副箭按已选顺序取 min(R, 剩余预算)，总预算 99,999,999，耗尽便停，末发可部分金额。预算在发射分配，主箭不占用，落空不补发。金额应用已有幻象输出系数，各副目标独立检查普通命中。已核主目标专属暴击、固定命中奖励和特殊必中保留在主目标入口。主箭落空不取消已发副箭；飞行期间失效作废该箭，不重选。来源死亡保留已发箭，删除来源取消未命中箭。入队主箭在先，副箭按 B04；命中按实际飞行到期及 B05。每发有效命中独立走 B03，无额外施法、蓝耗、N535、ATTACKED 或 S18/S19 读取。[共享武器接口](weapon-field-source-notes.md)、[事件基准](web-baseline.md)

## 工程升级

G043 固有 abilList 带 A098，G035 带 A100，H002 两项都没有。三者 heroAbilList 均含 A005。A098/A100 是一级 ANeg，按钮 Y=-11，BNeg 和对应的 DataC1 配对明写。没有 W3A 增量及直接的技能/别名脚本入口。挂载来自单位模板，包括 H002 在已核皮肤事务中变为这两种模板。[单位能力](../../reference/map-6.25/units_unitabilities.json#L4192)、[A098 SLK](../../reference/map-6.25/units_abilitydata.slk#L14670)、[皮肤事务](skin-and-transformation.md)

两书 H370/H511 与各自原 Ubertip 逐字一致，写 +2 攻击和 +10% 移速。原 Researchubertip 也继承标准 ANeg 的修补匠文案，含三级、火箭群、口袋工厂和机器人地精。SLK 的 17 个 ANeg 记录中仅原版 ANeg 明写 DataA 移速和 DataB 伤害，16 个定制别名均省略。因此保留字段缺失的原始证据，Web 依图鉴优先只对 A098/A100 采用明文数值。[定制提示](../../reference/map-6.25/units_campaignabilitystrings.txt#L1452)、[标准提示](../../reference/map-6.25/units_campaignabilitystrings.txt#L6910)、[编辑器字段](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt#L6470)、[官方修补匠](https://classic.battle.net/war3/neutral/goblintinker.shtml)

**Q24 接入。** 当前模板的实际启用工程升级给固定 F 加 2，百分比攻击光环不放大，W01 的固定通道可读到，不调用 W02 setter 模拟加减。对可移动单位，移速在钳制前乘 1.10，与已有移动倍率相乘，再按 50–722 钳制。固定、被限制移动或模板速度 0 的单位仍无移动能力。G035/G043 模板速度 300，在可移动且无其他调整时为 330。分裂箭未学时工程属性也生效。模板挂载替换或停用即时重算，普通驱散不清理固有能力。同项重复添加不叠，异常共持两个替换来源只取当前模板适用的一项。

沿既有 ANeg 事务转同一个真实技能槽，保留当前等级、付费历史、启停和副箭剩余锁。零级保留零级，源槽缺失不补槽。移除旧替换按配对逆转，再按新模板应用新配对。不合并多个分裂箭、不派发学习、不重算已经发出的箭。[ANeg 规则](skin-and-transformation.md#全部专用aneg映射)、[移速接口](pathing-and-placement.md)

## 月刃

A052 是六级 Amgl 标记，范围、次数与损失值由其他对象提供。H016、G074 的实际第一武器是 mbounce、英雄攻击类别，Farea1=500、targCount1=1、damageLoss1 缺项，主射程 1100、C/P/B=1.10/.55/.85、基础额 19、2d3。两者均显式追踪、速度 900，也是全表仅有的 k001 受体。k001 为 inherit=1、maxlevel=6、used=1，effect1=ratc、base1=2，effect2=radl、base2=.30、mod2=-.06。编辑器将两类科技效果分别标为攻击目标数、攻击伤害衰减的基值与增量。科技衰减数值逐档与图鉴一致，初始字段 1 加 count 奖励 2 仍不足以证明原版是否计主目标。图鉴和原提示均称“弹射3次”，Q48 已确认这里是首目标之后三跳。暴雪 Huntress 采用逐跳损失，已核海龟规则也使用同一计数含义。[A052](../../reference/map-6.25/units_abilitydata.json#L14922)、[第一武器](../../reference/map-6.25/units_unitweapons.json#L23230)、[科技对象](../../reference/map-6.25/units_upgradedata.json#L1105)、[编辑器科技字段](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt#L6625)、[技能提示](../../reference/map-6.25/units_campaignabilitystrings.txt#L718)、[水波基准](creep-skill-family-next.md#弹射水波-n117119)、[官方 Huntress](https://classic.battle.net/war3/nightelf/units/huntress.shtml)

原图对 Player(0..3) 注册 EVENT_PLAYER_HERO_SKILL。anyUnitLeartSkill 忽略 nil 学习者和幻象，遇 A052 调 A052_Study(u,raw) 后返回。回调唯一业务操作为 AddPlayerTechResearched(GetOwningPlayer(u), GetId("k001"),1)。源未读本体当前技能等级，也未按塔累计；这是全文唯一字面 k001 写入，剥级没有对应撤销写入。[注册 f291/f33](../../reference/map-6.25/main.disasm#L179562)、[分派 f291/f10 PC117–124](../../reference/map-6.25/main.disasm#L169159)、[回调 f47/f0 PC1–11](../../reference/map-6.25/main.disasm#L67596)

**同玩家多塔可达。** i561 同时在开局候选和常规 SR 抽卡池。I561 四种族都建 H016，每座占 20 人口，上限提高至 50 即可共持两座。开局领取标志只限那次，常规抽卡可另给同卡。放置预检串含地表和人口，无 H016 重复限制；开局业务的显式单塔限制指定 H010。一座 H016 也可换皮为 G074。已有剥级事务可能按反序撤回已付费的 A052 等级。[开局池 f282 PC43](../../reference/map-6.25/main.disasm#L137574)、[常规池 f284 PC105](../../reference/map-6.25/main.disasm#L139803)、[I561 对象](../../reference/map-6.25/units_abilitydata.json#L23203)、[人口 f291/f19 PC73](../../reference/map-6.25/main.disasm#L173093)、[H010 上限 f306/f27 PC25](../../reference/map-6.25/main.disasm#L199776)、[皮肤 f289 PC755–762](../../reference/map-6.25/main.disasm#L154903)、[剥级 f291/f18 PC39](../../reference/map-6.25/main.disasm#L172967)、[成长规则](hero-progression.md)

**Q48 已确认按本塔当前等级。** Web 用 A052 局部武器适配替换原共享 k001 的玩法贡献。未学、禁用或失去实际技能，只发普通主攻击。学习后按本塔当前 1–6 级使用三跳及六档损失。其他同玩家塔不受本次学习影响；换皮继承本塔等级，剥级以后续攻击实际档位生效。机制只应用一遍。普通武器提交时捕获当前档位，已发射的链使用原快照。

**Q24 逐跳。** 主包按普通命中流程用 (R×M+B)×f，后续第 j 跳的原始额为 (R×M×f)×(1−loss)^j，j=1..3。R 是一次武器原始额，M 是主目标已定普通原生暴击倍率，f 是已有幻象输出系数。主目标固定命中奖励 B、护甲、后置装备倍率或最终掉血均不传播。每次有效命中完整提交本段 B03，再从记录的接触点 500 闭圆按 B04 选首个合法可见敌方，排除所有已选目标；选取掩码沿分裂箭的合法单位集合。命中使目标死亡仍从接触点继续，飞行前目标已无效或到达时落空则停止，无法选到目标也停止。每段追踪速度 900；来源死亡保留已发链，来源删除取消。无额外 ATTACKED、冷却、施法、蓝耗或控制。一级核心 100 的三个原始跳额是 70、49、34.3，六级各 100。

## 普攻与装备事件

原 EVENT_PLAYER_UNIT_ATTACKED 只对 Player(11) 的受攻击目标登记 chooseAttackedAction，先处理幻象早退，再执行原自动施法、塔技能和 Item_Attack_Action。Web 按攻击计时在前摇开始向原监听发一次；中断不回滚已经调用的回调。承受副箭或弹跳的单位不另发攻击开始事件。[ATTACKED 注册](../../reference/map-6.25/main.disasm#L179448)、[原分派尾](../../reference/map-6.25/main.disasm#L167393)、[攻击计时](attack-timing.md)

| 阶段 | 扩展和装备交接 |
|---|---|
| 原攻击开始 | Item_Attack_Action 依次检查 i149、i153、i173 或 i177 同支、i204 或 i282 同支且非近战，再走 Special 的 i132 概率、i302 非近战、i316。i204 将来源 Get18+Get19 捕获到 q007 的 S18 后发普通攻击指令，保留 q007 实际来源和武器。 |
| 普通武器与主目标命中 | A006 的 T002、A053 月之祝福及装备固定绿字由 W01 影响 R；攻速沿 T01/T02。主目标仍保有 I251 的 70% 必中及触发后合包 +1。副箭和弹跳不再抽该主目标分支；弹跳也不复制这一点。其他仅主目标抽样的原生暴击／固定效果沿各自接口。 |
| 逐次有效命中 | 每笔以真实塔为 S、当前目标为 T，attack=true、远程、HERO/NORMAL，独立进 B03、原 Before/After 及归属 O。i267 依攻击标记和实际目标护甲走 Q27；i132 的物理伤害条件独立。i322 奇锋与 i115/i209 近战门槛，对这些正常远程形态不成立，即使独立原生装备能力有效。其他伤害钩子照原门槛运行，不按攻击编号去重。 |

装备读数的时间保留在原回调。R 及已捕获的计算保留攻击快照，但伤害事件仍读取当时装备和目标状态。A007/A054 与装备生成的独立技能包保持实际来源和标记。它们与普通武器扩展分别沿各自入口。[装备攻击分派 f285/f14–15](../../reference/map-6.25/main.disasm#L146244)、[i204 捕获](../../reference/map-6.25/main.disasm#L128217)、[伤害分派](damage-pipeline.md)、[装备分派](item-damage-dispatch.md)、[固定装备攻击](item-flat-attack.md)、[原生暴击](native-critical-family.md)、[遗物之刃](item-relic-hit.md)、[光环](hero-aura-family.md)

存档保留实际槽及其启停/等级、剩余副箭锁、各飞行段的编号、真实来源、锁定目标、数值快照、到期时间和 B05 计时序号。月刃额外保存访问集合、剩余跳数和衰减。读档不重抽、不重放学习与已结算事件。若通用幻象创建路径确实授予了可用实际技能，由该实例自身执行普通武器扩展，幻象的完整继承、输出及装备资格沿各自规则。

## 验证范围

[验证工具](../../tools/audit-hero-attack-extensions.py) 重读两书、SLK/W3A 快照和反汇编。覆盖精确源行、七条技能、五条塔、原科技与装备入口、分裂目标／冷却／预算、工程贡献、月刃六档和本体级数案例。Q24 局部行为已明确，验证属于静态证据和规格算例。匹配客户端、Web 运行实测、普通全局命中和各装备子技能仍各有外部依赖。

```sh
PYTHONDONTWRITEBYTECODE=1 /Users/laihanbin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 tools/audit-hero-attack-extensions.py --check
```
