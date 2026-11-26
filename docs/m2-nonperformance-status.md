# M2 非性能收口清单

本页保留 core-15 及以前的阶段记录。2026-11-26 接手后的实现、验收和待办统一记在[执行台账](m2-completion-ledger.md)。

### core-15 增量

| 内容 | 实现 | 验收状态 |
| --- | --- | --- |
| H021／G059，A069／Q46 | 学习累计独立攻击贡献，武器读取后再乘百分比光环。倍率持久保存，G059 渲染乘 1.6 | 25→20 剥级后保有 540，实战伤害计算及换型、恢复通过受控复验。浏览器样本验证 0.7→1.12，刷新保留 1.12。[规则](rules/weapon-field-source-notes.md#q46-已确认a069-专用可放大贡献) · [浏览器](evidence/m2-core-15/growth-worker-build-browser.json) |
| w001 | 现有模型库 Orckugong1 提供默认工人贴图及 Stand／Walk，按保存路径恢复 | 本地受控 Chrome 通过。本期永久权益、各可达工人形态仍待关闭。[浏览器](evidence/m2-core-15/worker-browser.json) |
| A10 | 成长改动后用原登记五个种子重跑正常开局和输入策略 | 种子 14 的无 SSR 突破击杀通过，另四种子按 C01 判负。公开候选尚未验收。[五局结果](evidence/m2-core-15/a10-summary.json) |

### core-14 增量

| 内容 | 实现及依赖 | 验收状态 |
| --- | --- | --- |
| H021 及其余可发射武器对象 | `m2-scene.ts` 使用 `weapon-impact` 对应的真实飞行时限和来源 ID。静态射程配置未变 | 本地生产包冒烟通过，样本观察 H021 近战动作和 n001 的弹道。[生产包](evidence/m2-core-14/production-smoke.json) |
| H021／G059 的 A068／A149 | `cast-hero` 和自动攻击共用 `activateTreeGrab`。测试独立覆盖无目标、错误形态、缺蓝、自动冷却及保存到期 | 受控引擎通过。逐档伤害事件、驱散及完整组合待验 |
| H021／G059 的 A069、Q46 | 当前武器仍以技能等级计算攻击贡献。25 级剥级会退款，独立累计和模型比例仍缺 | 未实现。第四轮失败轨迹继续有效。[复现](evidence/m2-audit-2026-11-25-r4/tiny-growth.json) |
| 工人动作反馈 | `m2.ts` 根据存档工人指令显示动作，拾取完成单独确认 | 受控 Chrome 通过。本期工人模型、动作和权益实效仍未关闭。[恢复证据](evidence/m2-core-14/worker-resume-browser.json) |
| A10 正常引擎重跑 | 五个种子，正式开局、经济、时间线和 C01 | 种子 14 无 SSR 且突破后成功击杀，其余四局按 C01 判负。待最终候选复验。[五种子](evidence/m2-core-14/a10-summary.json) |
| A11 三分支 | 正常击杀和归档正常输入的超时重放已分别得到终态。受控引擎保留无杀手死亡测试 | 护符正常试跑在第 52 波按 C01 判负，三分支刷新仍缺。[超时重放](evidence/m2-core-14/a11-timeout-baseline.json) · [护符试跑](evidence/m2-core-14/a11-charm-14.json) |
| A13／A16 构建切换 | core-12 存档在同一 localhost 源切换至 core-14 | 更新同档、旧包拒绝覆盖、切回后续局均通过。复杂状态另有受控 Chrome 复验。公开候选切换待验。[本地演练](evidence/m2-core-14/local-update-rollback.json) · [复杂快照](evidence/m2-core-14/complex-browser.json) |

下文保留 core-13 的实现与证据。公开候选、同址更新回退及全部 A01–A18 保持未关闭。

基线为第三轮报告、`m2-core-12` 和 GitHub Pages Preview 1。线上 `release.json` 返回版本 `m2-preview-1`、内容 `m2-core-12`、源码 `f069211a79f117ee959fadf52b6ac8866d5e943c`。下表记录本地 `m2-core-13` 的实现和实证。范围采用 M2 计划与配置定稿。性能暂时放行，保留原始记录。 [第三轮报告](m2-acceptance-audit-2026-11-25-r3.md) · [配置定稿](m2-configuration.md) · [部署记录](m2-preview-1.md)

逐内容 ID、装备组件及本轮补验字段见[运行覆盖清单](m2-runtime-coverage.json)。全对象动作缺口逐 ID 见[素材清单](evidence/m2-core-12/model-coverage.json)。下表按要求登记跨对象依赖和验收层级。

| 要求／内容 ID | 缺失行为 | 实现位置 | 验收方法 | 结果与证据 |
| --- | --- | --- | --- | --- |
| M2-01／A06／A07，19 条卡片塔系、3 条工人塔系与 P001–P013 | 资格失效、拾取、升级、死亡／复活、换型组合与完整候选复验 | `content.ts`、`qualified`、`restoreHeroState` | 按 ID 核对依赖与撤销。正常经济逐链取得、升满、突破 | core-13 正常经济 13 条全部通过，组合和最终候选待验。[十三条完整轨迹](evidence/m2-core-13/qualification-runs.json) |
| M2-02／A04、A05、A12 | 含新技能与移动指令的多速、暂停、插队、长暂停恢复和终局边界 | `event-queue.ts`、`match.ts#drain`、`m2.ts` | 精确比较指令、终态和 PRNG，覆盖 C01 两种阈值及关闭续局 | 原排程及局部恢复已验收，最终候选组合待验。[时空样本](evidence/m2-core-13/a02-engine.json) |
| M2-03／A02、A14 | 全模型动作、选择对象消失、旋转后选点及恢复重建 | `map.ts`、`movement.ts`、`m2-scene.ts`、`m2-models.ts` | 正常出怪与受控动态碰撞，浏览器逐动作与交互 | core-13 本地生产包开局、双波素材和攻击／移动帧已复验。全对象及最终 HTTPS 待验。[生产包](evidence/m2-core-13/production-smoke.json) · [线上冒烟](evidence/m2-preview-1/online-browser.json) |
| A03／A08，主线、挑战及其辅助单位 | 逐技能检查目标、耗蓝、冷却、主动／被动、抗性和状态撤销 | `waves.ts`、`shops.ts`、`enemy-effects.ts`、`match.ts` | 按实际波次与挑战模板触发 N5 系列及依赖，核对运行与恢复 | 排程及部分能力已验收，效果覆盖仍未闭合。[逐 ID](m2-runtime-coverage.json) |
| A08，N001／N002 | 公共攻击／施法回调、装备法球优先和正式界面 | `startWeapon`、`fireWeapon`、`applyWeaponDamage` | 同目标、同种子比较手动、自动、闪避和组合 | core-12 入口及局部效果已验收，公共顺序待补。[专项](../test/m2.test.mjs) |
| A08，N041–N044／b103–b106／N120–N122 | 独立移动、避障、攻击指定目标、停止及目标失效 | `resolveTowerSpell`、`movement.ts`、`startWeapon`、`m2.ts` | 地图点击、地面扫掠与复验，停止／到期／读档，以及召唤归属 | 受控引擎已验收四档生成、单体寻路、绕障、指定目标、停止、到期及读档。Chrome 受控通过旋转后选点、Walk、指定目标读档、停下和到期清除选择。最终候选与全部归属联动待验。[录入和恢复](evidence/m2-core-13/wolf-rain-browser.json) · [来源](rules/creep-skill-family-001-053.md#灵兽-n041044) |
| A08，N045–N047 | 剑雨场景表现、地物和动态接触 | `emitSwordRain`、`advanceSwordRain`、`m2-scene.ts` | 实际出场、可追踪弹道和爆炸，验证单位形式 debris、不可破坏地形及中断后弹道 | 已实现场景弹道和爆炸。受控引擎已验收三档发射、分块恢复、敌方建筑及单位 debris 命中，静态地形保留。Chrome 已观察弹道和爆炸。其他独立地物与 B03 交互待验或待实现。[场景证据](evidence/m2-core-13/wolf-rain-browser.json) · [来源](rules/creep-skill-family-001-053.md#黑暗剑雨-n045047) |
| M2-05／06、A08，共享攻击、施法、伤害与召唤 | 公共回调、重入顺序、控制与光环、死亡／复活和来源撤销 | `match.ts#damageEnemy`、`startWeapon`、`resolveTowerSpell`、`finishHeroSpell` | 按规则阶段逐例触发，比较来源／归属、资源和重入顺序，核对来源消失与读档 | 已有共享入口，完整效果未实现。[伤害分派规则](rules/damage-pipeline.md) |
| A08，入选技能、202 个物品及组件 | 逐 ID 待补项列于运行表。重点 i310 授予／撤销／换型，i330／i332 切换／成长 | `finishPickup`、`dropItem`、`chooseSkin`、`combat.ts` | 逐等级及物品实例验证取得、装载、移除、技能等级与来源状态 | 已有部分组件和效果，完整分支未闭合。[逐 ID](m2-runtime-coverage.json) |
| A08／A10，H005／H012 | 两张 SSR 的等级成长、被动、目标、神杖和装备联动及最终候选复验 | `hero.ts`、`hero-spells.ts`、`checks/m2-normal-run.mjs` | 正常抽到建成，六档行为和生命／蓝量／技能成长对照 | core-13 正常对局 H005 种子 6 第 32 波建成、两主动技能及 5 次命中，H012 种子 8 第 20 波建成、两主动技能及 13 次命中。手动 A040 的射程、付蓝另有受控用例。[正常轨迹](evidence/m2-core-13/ssr-normal.json) · [记录](evidence/m2-core-12/ssr-normal-attempts.json) |
| A01／A09 | 完整操作可达、拒绝、消费、防重及满包续局 | `m2.ts`、`execute`、`finishPickup` | 真实 UI 开局到商店／交易／满包，旧命令与新局隔离 | 局部已验收，最终候选待验。[浏览器](evidence/m2-core-12/browser.log) |
| A11 | i278 在正常第 55 波的无杀手判定、零击杀超时与三分支刷新 | `useWorkerItem`、`removeDeadEnemy`、`boss-timeout` | 普通开局或标明夹具，分别核对终局、收益与刷新 | core-13 正常种子 14 到第 55 波，肉山存活满 480 战斗秒后清场并胜利。i278 局部引擎已验，正常保留护符的试跑均在肉山前按 C01 判负，最远第 53 波 130 点。正常护符局与三分支候选待验。[全部试跑](evidence/m2-core-13/a11-normal-attempts.json) [正常超时](evidence/m2-core-13/a11-timeout-seed-14.json) · [专项](../test/m2.test.mjs) |
| A13／A16 | 更新与回退、异常写入、存档竞争和复杂组合 | `save.ts`、`m2.ts#restore` | 真实 IndexedDB 对照，提交后刷新、旧快照拒绝和双标签接管 | core-13 受控复杂快照通过。core-12 局部双标签已有证据。[本轮复杂快照](evidence/m2-core-13/complex-browser.json)使用字节相同的 Preview 1 生产主包和 core-13 生产包完成受控同源更新／回退。[演练](evidence/m2-core-13/update-rollback-browser.json) 候选生产地址与新事件复杂组合待验。[复杂快照](evidence/m2-core-12/complex-browser.json) |
| A16，春节 4–8／夏季 2–9、Q18–Q22 | 全部正常触发与可达权益实效，工人装饰及永久光环的保留与撤销 | `seasons.ts`、`creditTask`、`checkpointProfile`、`m2-scene.ts` | 逐任务触发、阈值、节点、防重，再在刷新、重开和换型复核实际效果 | 13 项受控触发与节点已验。Q22、G059 等局部通过。可达权益实效仍有未实现项。[任务规则](rules/session-and-task-state.md) |
| A14，n159–n167／n001–n010／n021–n025 共 24 条 | Attack／Death 和全对象实际动作 | `bindings.json`、`m2-models.ts`、`m2-scene.ts` | 逐对象、动作和素材哈希。对照本体及替代方案的实播 | 已验收 24 条绑定对应的 43 个替代动作实播，Attack 由武器触发，Death 由界面回收触发。全量 A14 和正式死亡场景仍待验。[逐条实播](evidence/m2-core-13/model-action-substitutes.json) · [24 条缺口](evidence/m2-core-12/model-coverage.json) |
| A17 | 候选正式界面完整链与关店 | `reserveChallenge`、`rewardChallenge`、`buySpecial` | 正常三级、购书、合成，以及独立第 54 波在场和待发清理 | core-13 正常合成复验通过。core-13 受控 Chrome 购书、合成、刷新和关店清理复验通过。最终候选待验。[本轮正常](evidence/m2-core-13/a17-normal-seed-14.json) · [正常](evidence/m2-core-12/a17-normal-complete-seed-14.json) · [受控](evidence/m2-core-13/a17-browser.json) |
| A18 | 三把成品正常开出及候选同址两路 | `dropDeathChest`、`forgeSword`、`useWorkerItem` | 逐刀同址保存刷新，核对支付、箱钥、炼魂／开箱计数 | core-13 正常掉箱、拾取和开箱复验通过。core-13 受控 Chrome 逐刀两路复验通过。[本轮正常](evidence/m2-core-13/a18-normal-seed-1709.json) · [正常](evidence/m2-core-12/a18-normal-open-seed-1709.json) · [受控](evidence/m2-core-13/a18-browser.json) |
| A10 最终正常整局 | 内容收口后按最终摘要重跑至少四种子及无 SSR 正常击杀 | `checks/m2-normal-run.mjs` | 正常命令、C01、突破和来源可追溯的致死 | core-13 五种子正常局已验收。种子 14 无 SSR 击杀，其他四局按 C01 判负。内容最终收口后仍需复验。[全部轨迹](evidence/m2-core-13/normal-runs.json) |
| A15、M2-09／10 | 最终内容候选、同址 A01–A18、Preview 1 更新与回退 | `pages.yml`、`prepare-pages.mjs`、`release.json` | 冻结源码／产物后核对线上摘要，在同域跑开局、波中恢复、关页、结算及双标签 | Preview 1 已上线。本轮最终候选待内容收口后发布。[上线摘要](evidence/m2-preview-1/deployment-verification.json) |


Q18–Q22 实际效果分项采用[已决平台权益表](rules/platform-and-access.md)及[任务规则](rules/session-and-task-state.md)。下列条目与 13 项任务的阈值／奖励测试独立。

| 要求／内容 ID | 缺失行为 | 实现位置或相关入口 | 验收方法 | 当前结果 |
| --- | --- | --- | --- | --- |
| Q18 开局／福利／主线击杀及掉落权益 | 完整对照正式界面的开局选择、福利金额、击杀积分和死亡箱钥资格 | `content.ts#openingChoices`、`combat.ts#welfareGold`、`match.ts#commitKillScore`、`dropDeathChest` | 从新浏览器开局，分别触发福利、终局结算和合法击杀，核对更新、刷新和实际奖励 | 开局、福利和箱钥有局部证据。额外 SSR 兑换按配置归 F1-03 本期保持关闭 |
| Q19 s001–s018 本期可达工人外观、光环及入选英雄皮肤 | 工人网格换型、技能与携带物、光环显示和已装备权益选择 | `seasons.ts`、`m2-scene.ts`、`match.ts#chooseSkin` | 从新档使用、撤销、换型，核对重开、死亡／复活与读档 | 工人权益实效未闭合 |
| Q20 f001–f012 本期可达 | 六类工人光环及入选英雄效果、切型撤销 | 同上 | 核对各来源和实际展示／效果，再换型和恢复 | G059 具备局部证据，工人光环未闭合 |
| Q21 节日和历史权益本期可达 | 工人、光环和称号的生效、附加状态及跨局保留 | `seasons.ts`、`m2.ts`、`m2-scene.ts` | 按规则明确来源及本期对象，实际挂载和撤销，读开局档及旧档 | 尚未闭合 |
| Q22 任务及季节节点权益 | 可游玩项目从正式局达到各节点，验证装饰和光环实际使用 | `startSeasons`、`creditTask`、`checkpointProfile` | 验证免互助状态和每节点提交、防重、旧快照与换型 | 互助适配、13 项阈值和防重已有受控证据，全量正常流程和节点实效待验 |

### 13 个本期任务

每行的阈值、节点奖励和防重复均已在受控引擎专项验收。正式局样本仅登记已触发的事件或已保存的进度，所有行仍需在最终版本复验刷新、重开及节点权益的实际应用。[专项用例](../test/m2.test.mjs) · [任务与源规则](rules/session-and-task-state.md)

| 任务 | 触发与完成阈值 | 执行入口 | 当前正常证据或缺口 |
| --- | --- | --- | --- |
| 春 4 妖刀炼魂 | 累计锻造 33 把 | `forgeSword` | 种子 14 自然完成 1 把 |
| 春 5 第一桶金 | 单次福利实收至少 30000，累计 20 次 | `welfare-end` | 福利结算入口已验，正式累计未验 |
| 春 6 富甲一方 | 福利金额按万折算，累计 888 | `welfare-end` | 同上 |
| 春 7 乐善好施 | Q22 在单人档初始化应用 666 | `startSeasons` | 正常开局及刷新已有记录 |
| 春 8 肉山杀手 | 累计击杀肉山 66 次 | `removeDeadEnemy` | 种子 14 正常击杀 1 次 |
| 夏 2 守线王者 | 使用透支且成功守住，累计 20 局 | 终局透支结算 | 已验真实事件回调，正常累计未验 |
| 夏 3 开箱专家 | 累计开箱 66 次 | `useWorkerItem` | 正常种子 14 两次，另有 A18 开箱证据 |
| 夏 4 抽卡狂魔 | 累计抽黑卡 66 次 | `drawCard` | 已验实际抽卡回调，正常累计未验 |
| 夏 5 完美主义 | 四英雄同时完工，累计 13 局 | `finish-construction` | 已验四塔建造回调，正常累计未验 |
| 夏 6 点兵成金 | 点金手成功 99 次 | `useWorkerItem` | 受控 Chrome 点金、刷新及重开有记录，正常累计未验 |
| 夏 7 八方支援 | Q22 在单人档初始化应用 666 | `startSeasons` | 正常开局及刷新已有记录 |
| 夏 8 神器收藏 | 同局解锁两个挑战装备，累计 1 局 | `rewardChallenge` | 有受控计数和 A17 正常三级解锁轨迹，最终界面存档仍待验 |
| 夏 9 欧皇肝帝 | 累计抽出 13 张 SSR | `drawCard` | 种子 6 和 8 各一次，正式累计未验 |

### 发布前仍需关闭的依赖

| 条目 | 当前原因和影响 | 对应处理与复验 |
| --- | --- | --- |
| 公共攻击／施法、B03 重入、召唤归属、控制和死亡／复活 | 现有攻击与伤害入口包含已接入局部效果。来源实体、归属塔、装备回调和存活状态仍未在全部分支贯通。具备局部伤害或套用相邻技能的结果无法推导剩余分支 | 逐规则落实公共派发次序、真实来源及撤销条件。以分支级对照验证伤害、控制、计时、奖励和快照 |
| i310、i330／i332 等运行缺口 | 神杖已有部分持有分支。实际授予、撤销及换型尚未形成完整生命周期。魔焰之心缺运行中的生命、计时和成长链，现有背包处理只覆盖取得相关分支 | 逐实际效果落实能力及属性贡献，核对拾取、丢弃、转交、换型、死亡和读档。见[逐 ID 清单](m2-runtime-coverage.json) |
| Q19–Q22 可达装饰、光环和形态 | 节点与解锁可持久化。部分权益仍缺正式选择、载体应用和撤销，因而无法逐项证明生效 | 依据权益来源分配到实际工人／英雄／能量圈对象，完成应用、状态撤销、再应用与同修订恢复 |
| A14 全量对象与结算表现 | 已验证的 43 个替代动作覆盖静态缺动作绑定。战斗死亡、复活、其余对象逐动画和场景恢复仍缺全量证据 | 按内容 ID 执行正式动作、对象移除及恢复检查，存档中命令和战斗结算与素材呈现分别复核 |
| A17、A18、A15 与公开候选 | 正常引擎和本地 Chrome 已分别覆盖部分步骤。公开地址仍运行 Preview 1，最终冻结版本的完整 UI 轨迹和同址恢复因此仍待验 | 内容收口后冻结及发布同一构建，在原地址逐 case 重跑。保存线上摘要、实际操作、刷新、关页重开、结算、双标签接管和回退记录 |
