# 深渊五个宿主的 13 项实际能力

本页核 ma02、ma03、ma04、ma05、ma06 的 13 项可达能力。深渊流程、宿主模板、召唤容怪及后续奖励沿各自规则。镜像、嗜血、暴风雪、衰老的标准魔兽提示作为源证据保留，实际定制以对象及脚本为准。 [机器记录](npc-abyss-abilities.json) · [深渊流程](waves-and-modes.md) · [挑战召唤登记](challenge-spawns.md)

## 共用入口

沿 B03 实际 NPC 受伤入口当场判断，当前命令通过原守门才处理本组。保持表中分支顺序、就绪条件及调用后退出或继续的位置。实际下令另查指令合法性、可用资源及控制。随机目标按原玩家、原生 HERO、实际位置等筛查，构成 B04 稳定集合后均匀抽一个；原生拒绝不另抽。生命门槛比较事件当时当前生命／最大生命，严格小于。宿主对象施法前／后摇 .47／.1 秒，ANcl 显式跟随时间独立。零伤害控制不生成正伤害事件。 [受伤路由](damage-pipeline.md) · [原入口](../../reference/map-6.25/main.disasm#L165916)

## ma02

- **N537 镜像**，自身 mirrorimage，蓝125、CD25。AOmi 提交清自身正负可驱散魔法状态、打断旧攻击锁定，替换同源上一批镜像。以实际母体当前生命及武器建立3只同玩家幻象，20秒，输出0、承伤×2；不复制活动施法权及地图Boss奖励资格。真实 BIil 走先于普通 P11 SUMMON 的分支，在施法点按共用幻象落位，不增容怪或路径登记。可驱散、寿命及归属删除沿既定幻象接口。对象缺输出和动画等候数值，本地取0；普通学习提示一只60秒为模板。 [实际提示](../../reference/map-6.25/units_campaignabilitystrings.txt#L15193) · [BIil分支](../../reference/map-6.25/main.disasm#L173215) · [暴雪镜像](https://classic.battle.net/war3/orc/units/blademaster.shtml)
- **N538 海妖之歌**，无目标 harvest，蓝100、CD45，自动HP<50%。有效提交每实际单位一条15秒周期，占用中的强制重施不另开。在提交时扫描，其后每1.2秒至+14.4，共13次，每次取施法者当时位置2500闭圆的每个活非P11，从宿主处各造同玩家一级T070／1秒q001，定向 sleep。T070范围3000，过关系、可见、魔免及N535等，目标掩码允许无敌。成功1.5秒睡眠、打断活动并禁止移动／攻击／施法，首.1秒是Bust初始眩晕段，其后实际攻击可唤醒，含原生允许的手动友军唤醒。刷新同一受体睡眠，驱散、死亡、删除清除；不增加全局无敌。宿主死亡／删除使下个扫描停止；结束项仍清原窗口，已有睡眠各自到期。 [两计时器](../../reference/map-6.25/main.disasm#L115600) · [实际T070](../../reference/map-6.25/units_campaignabilitystrings.txt#L20187) · [暴雪Sleep唤醒](https://classic.battle.net/war3/undead/units/dreadlord.shtml)
- **N539 诱捕**，敌方定向 ensnare，6000、蓝150、CD20，追踪1500。受伤在自身5000内的活非P11原生HERO抽一个，再过实际指令准入；分支继续原顺序。命中 Bena/Beng 一条6秒移动锁，普通攻击和另起施法仍可，命中打断引导。空中单位在.6秒内降至配置高度200并可被地面武器选中；原128字段保留作受体近战可达性，不改攻击者武器的原持续范围。地面目标只限制移动。魔免不挡物理捕网，原掩码允许无敌。移除或到期恢复空中身份和高度，不清其它控制。 [源随机候选](../../reference/map-6.25/main.disasm#L115922) · [实际物编说明](../../reference/map-6.25/units_campaignabilitystrings.txt#L15224) · [暴雪诱捕](https://classic.battle.net/war3/orc/units/raider.shtml)

## ma03

- **N550 洗礼**，无目标 harvest，蓝500、CD15，自动HP<80%。ANcl DataA=3秒跟随引导，提交正常扣蓝、开CD。正常 FINISH 读取同一实体实时当前／最大生命，写 min(maxHP,currentHP+maxHP/4)。打断、死亡或删除后无此回补，也不复活。 [FINISH入口](../../reference/map-6.25/main.disasm#L172420) · [写入](../../reference/map-6.25/main.disasm#L117187)
- **N551 驱逐**／**N552 守护天使**，无目标 charm／ambush，均蓝100、CD20。两脚本保护均不在，且两能力均就绪，才抽1–100，>50驱逐，其余守护天使。提交先在宿主位置造同玩家q001／一级T071或T072／1秒，以 innerfire 投向宿主。原生成功挂B063/B064 18秒、护甲+5，缺攻击/回血字段；按正面 Buff 刷新和驱散。各实际脚本在施法者登记一条独立的18秒状态，强制同类重施替换计时，首次另有表现。辅助失败或驱散原生 Buff 不撤脚本保护。B03 只对驱逐的魔法或守护天使的物理起效，在原阶段使用当时 D 写 min(maxHP,currentHP+5D)，随后D=0，同次只一次；神圣不匹配。存档保留两类独立状态、时限及冷却。 [驱逐](../../reference/map-6.25/main.disasm#L117244) · [守护天使](../../reference/map-6.25/main.disasm#L117396) · [回血](../../reference/map-6.25/main.disasm#L165869)

## ma04

- **N540 投掷**，敌方定向 harvest，5000、蓝150、CD15。受击在自身2000内抽活非P11原生HERO且不带T069。合法提交后若受体已有投掷记录，本次不新建；否则短暂附加移除Arav，写直接 PauseUnit(true)，保存受体与初始方向。每.01秒以初始垂直步长30上升、每次减.7，若拍首高度超过默认+750则改下降并每次加.8，步长实际使用前钳2…150。水平每拍加 20×Δ/max(|dx|,|dy|)，Δ为初始目标减Boss，之后x钳±5000、y钳±4700。完全同点源0/0，Web有限坐标接口令水平0，只垂直。落到默认高度或以下仍先执行本拍位移，再还原默认高度、PauseUnit(false)、显示落地。直接暂停与A007共用原布尔覆盖，外部false可提前解，落地仍执行原false，独立眩晕保持。直接坐标写入不走普通道路碰撞，也不因触及边线提前结束；受体死亡/删除取消活动。同一投掷不额外加伤害。 [轨迹与结束](../../reference/map-6.25/main.disasm#L116075) · [提交及筛选](../../reference/map-6.25/main.disasm#L116268) · [共用直接暂停](skill-stone-gaze.md)
- **N542 长大**，自己或合法友方 bloodlust，600、蓝300、CD40，自动HP<60%给自己。B059持续20秒、移速+80%，再交共享速度钳制，DataC=2.0留为视觉缩放。DataA缺省不增加攻速；旧40%攻速和60秒属于模板。成功刷新同一B059，驱散/到期撤回。 [原发令](../../reference/map-6.25/main.disasm#L166045) · [提示模板](../../reference/map-6.25/units_campaignabilitystrings.txt#L15261)
- **N559 山崩**，目标地 blizzard，5000、蓝150、CD9，受击取实际攻击归属O当时位置，无O不下令。原主AHbz无伤害／波数、targs=none。EFFECT 从宿主位置造同玩家一级T074／1秒q001，向该点发 clusterrockets。ANcs 半径800、效果期2秒、间隔.25、控制普通/英雄5秒；60是火箭数量，伤害与预算缺省按Q24取0。Web按固定落点每.25秒至2秒扫描，合格敌人刷新BNcs 5秒，魔免拒绝，原对象明确允许无敌；视觉火箭400速度与60枚不各发每目标伤害。已提交范围持续不由1秒马甲结束截断。 [原载体](../../reference/map-6.25/main.disasm#L118373) · [ANcs字段](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt#L6476) · [暴雪火箭控制](https://classic.battle.net/war3/neutral/goblintinker.shtml)

## ma05

- **N543 传送**，无目标 charm，蓝100、CD25，跟随引导1秒。受击发令后此分支继续原顺序。正常 FINISH 从24个现有路线矩形中心均匀抽一个（原1…24再减1），用同一实际实体 SetUnitPositionLoc 落位；没有改变路径编号、身份和奖励。提交后中断不抽样或传送。 [原发令和传送](../../reference/map-6.25/main.disasm#L116671) · [FINISH分派](../../reference/map-6.25/main.disasm#L172410) · [地图路径](pathing-and-placement.md)

## ma06

- **N554 幽冥爆轰**，敌方目标 cannibalize，5000、蓝500、CD8。自动在自身2000内抽活非P11原生HERO。有效EFFECT 记受体当时地点，t0预警、+1.5秒 Wisp 爆炸视觉、+2秒在固定点造 P11 一级T073／1秒q001并发 stomp。AOws 700闭圆、敌方、允许无敌，零固定伤害，普通BPSE 7秒、原生英雄／有效抗性5秒，沿既定控制准入、刷新及移除。仍在范围内的其它目标可受控，原目标离开不追踪。已登记的地点事件在原宿主死亡后仍执行。 [原两时钟及载体](../../reference/map-6.25/main.disasm#L117692)
- **N557 衰老**，定向 banish，999999、蓝260、CD18，普通/英雄8秒。受物理分支抽1–100，>50且有效攻击归属O存在则向O，否则向自己。另在深渊有活 Boss 时，b115幽冥守卫受到指定合格伤害的入口会向该实际守卫独立发令。目标含自身友敌及原无敌许可，定向过实际关系、魔免及N535。BHbn虚无，−40%移速，不能普通武器攻击，仍能施法。受击用地图虚无向量和既定武器准入，不套标准66%或A102/B100。成功刷新同一虚无状态，驱散、死亡、到期撤回。 [原随机](../../reference/map-6.25/main.disasm#L117952) · [b115入口](../../reference/map-6.25/main.disasm#L165188) · [地图虚无](native-armor-and-xp.md) · [暴雪Banish](https://classic.battle.net/war3/human/units/bloodmage.shtml)
- **N558 生命汲取**，友方定向 harvest，9999999、蓝500、CD20。受击HP<2从999999内按b115模板枚举随机选一（原筛选未查阵营和生命，随后友方实际指令仍查）。生成、points、回收沿既有幽冥守卫路径。EFFECT 建独立8秒 DRAL 连线，不要求宿主保持原命令，后续无范围检查。每.1秒复查两实际实体及生命，更新连线并对宿主当前生命加其实时最大HP×.002，封顶；守卫不掉血或蓝。8秒预先入队的清理先于临近再入队的同刻tick，故+.1至+7.9共79次（稳定上限时15.8%毛额）。任一端失效则销毁两个计时器和连线；已提交不同连线各自记录，新连线不覆盖。 [原筛选、周期和清理](../../reference/map-6.25/main.disasm#L118022) · [守卫登记](challenge-spawns.md)

## 验证

索引核实际宿主挂载、原对象和路由。复用原 VM 核海妖之歌、投掷、洗礼、护盾、幽冥爆轰与守卫汲取的边界。自定义 Web 原生适配与原执行验证分开，原客户端未实测。 [复查工具](../../tools/audit-npc-abyss-abilities.py)
