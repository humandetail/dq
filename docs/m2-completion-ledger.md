# M2 执行台账

**里程碑状态（2026-11-26）：M2 已通过，所有未关闭行及子项转入 [M3-01～10](development-plan-m3.md)。** 下表保留实际实现和证据状态；后续关闭记录归 M3，不批量改写为实测通过。

验收列分开记录引擎、浏览器、正常局及公开证据。

| 工作包与 ID | 具体行为 | 规则、依赖 | 实现入口 | 可断言用例与证据 | 实现 | 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| W1 B03、N526、N533 | 初始零额早退；进链后归零继续消耗活动折光 | [B03](rules/damage-pipeline.md)、[敌方反应](rules/late-enemy-effects.md) | `match.ts#damageEnemy` | 两个同刻命中经快照；初始零不耗盾，N533清零仍耗一层 | 已改 | 受控引擎通过，公开待验 |
| W1 A094/A095、N525 | 守卫自然到期及主人回收后已发箭结算；分别记录实际源与实时归属 | [群蛇守卫](rules/ward-summons.md)、[N525](rules/late-enemy-effects.md) | `match.ts#advanceWeaponShot`、`applyWeaponDamage` | 恢复已入队弹道；命中时可无归属，伤害由守卫产生，浮动来源仍是守卫 | 已改 | 受控引擎通过，公开待验 |
| W1 N521、q025、T202 | q025 绕过薄葬、透支减伤；等生命严格不触发薄葬 | [伤害管线](rules/damage-pipeline.md)、[薄葬](rules/npc-mainline-abilities-01.md) | `match.ts#damageEnemy` | 通过 A042 命中，检查击杀、保护与实际源；普通等额击杀 | 已改 | q025 夹具通过，等额和正式 A11 待验 |
| W1 i263 | 子事件先提交，归还父事件金额与来源 | [鬼切](rules/item-damage-effects.md) | `match.ts#damageEnemy` | 夹具验证子、父金额和日志顺序 | 局部分支已验证 | 受控引擎通过，完整派生顺序待验 |

## core-16 已实施的其他行为

| 工作包与 ID | 具体行为及依赖 | 规则 | 运行入口 | 触发与断言 | 实现 | 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| W1 A069／Q46 | 学习时读取实际形态，换型时保持已应用倍率 | [W01／Q46](rules/weapon-field-source-notes.md) | `hero.ts#learnHeroSkill` | 六次学完 H021 再换 G059 保持 1.7，先换 G059 再学至六档为 2.72。两路攻击都是 540 | 已改 | 受控引擎通过。未有学习时形态的旧档以恢复时形态保留旧显示 |
| W1/W2 N536 | 伤害累计且严格大于最大生命 10% 才撤控制 | [石化凝视](rules/skill-stone-gaze.md) | `match.ts#damageEnemy` | 1000 最大生命先受 100 再读档受 1，恢复后只超阈值的一笔撤销 | 累计及现有控制已接，A007 的 H002、G035、G043 不在本期可达池 | 累计及 BPSE 分离受控通过 |
| W2 N518／i206 | 渐隐、加速、穿行与装备探测 | [主线敌方](rules/npc-mainline-abilities-01.md)、[侦查](rules/item-utility-batch-01.md) | `finishEnemyReaction`、`canSeeEnemy` | 200 蓝后渐隐，装备探隐但不解除隐身，丢弃立即无法锁定 | 已接主线分支 | 受控引擎通过，边界、视野组合和正式续局待验 |
| W2 N519 | B04 首目标、200 蓝 10 秒 CD、8 秒减去 50 百分点武器加成 | [虚弱](rules/npc-mainline-abilities-01.md) | `weaknessTargets`、`fireWeapon` | 敌怪受击、第一候选可接受时触发，第二人不重复领取；读档触发及武器结算待测 | 部分已改 | 待补 |
| W2 N706–N708 | 攻击开始施加分档减速，活动窗不刷新 | [挑战怪](rules/challenge-enemy-effects.md) | `startWeapon`、`moveWolf` | 三档分别减攻速 50／80／120 百分点和移动 10／40／60%，保存活动窗 | 挂载及速率入口已改，运行中的攻击阶段按比例重排待补 | 受控引擎部分通过 |
| W2 N709 | 已有魔抗与神灵武士抗性叠加，生命比严格更新 | [挑战怪](rules/challenge-enemy-effects.md) | `damageEnemy` | 生命正好 12% 的法伤先读一级，改九级。恢复后下一笔用九级并改十级 | 已改 | 局部受控通过，各类正式目标待验 |
| W2 N710／711／712 | 践踏；父路径定时子体；不扣盟友生命的治愈 | [挑战怪](rules/challenge-enemy-effects.md)、[挑战生成](rules/challenge-spawns.md) | `finishEnemyReaction` | 分别断言 400／300／1000 蓝、3 秒普通塔眩晕、30 秒子体、700 治愈后扣 100 父伤 | 核心已接，N712 连线等细节待补 | 受控通过 |
| W2 N582–N584 | 严格超杀按档重生和攻速减益 | [挑战怪](rules/challenge-enemy-effects.md) | `damageEnemy` | 50 HP 受 100 即同 ID 恢复，50 等额真死亡，三档为 40／40／120 百分点 | 已改 | 受控引擎通过，源死亡表现和正式挑战待验 |
| W2 i310/A154/A094/A095 | 取得时授予、共享学习槽、带初始 CD，撤销不回滚已经提交的换位 | [神杖](rules/scepter-lifecycle.md) | `finishPickup`、`resolveScepterSwap` | A153 学习前装备不授予，重拾授予，150 蓝生效后移出、读档仍在预定时刻换位 | 本期入选塔的部分分支已改 | A154 受控通过，A095 组合和其他神杖效果待验 |
| W2 i312–i314 | 复用指定英雄经验入口，三类 180 秒独立 CD | [定向书](rules/item-targeted-books-batch-01.md) | `execute#use-book` | 无效目标无消费，低档 2000、中档 20000、高档按当前等级，读档内拒绝重复，满时间再用 | 已改 | 受控通过，正式配方与交接待验 |
| W2 i330/i332 | 开关、生命、每秒自损、范围伤害和低血关停 | [魔焰](rules/item-final-batch-01.md) | `switchDemonflame`、`tickDemonflame` | 原槽换新实例，满血首拍扣 8% 无伤害，二拍出伤，低于 20% 后停表 | 已改主要分支，血能和资源事务全交接待验 | 受控通过 |
| W2 i235/b116 | 英雄 500 内布置 200 生命的守卫，持续 100 秒并提供探测 | [侦查](rules/item-utility-batch-01.md) | `execute#place-scout-ward`、`canSeeEnemy` | 超距不耗，合法扣唯一充能，原所有者离开后到期并撤探测 | 布置、到期及死亡表现实现完成，承伤继续核可达来源 | 定向引擎通过，GPU 实播和候选待验 |
| W2 i258/i259/i260/i264 | 有效形态、升级、随机星与满星返还，形态影响攻击及资源 | [神能](rules/divine-books.md) | `useDivineBook`、`triggerDivineEffect` | 保持资源和同槽返还，随机失败仍消费、满星保护及 P205–P222 回归待增 | 部分已改 | 待验 |
| W4 真实死亡 | 敌人及限时召唤由战斗触发 Death，重生外观从运行事件取得 | [B03](rules/damage-pipeline.md)、[挑战怪](rules/challenge-enemy-effects.md) | `recordBattleAnimation`、`m2-scene.ts` | 有杀手、无杀手及自然到期都有记录。薄葬和同实体重生不可伪造死态 | 已接基础 | 正式 Chrome 死亡与续档待验 |

## core-17／core-18 验证及新增行为

| 工作包与 ID | 实施或可断言行为 | 规则与入口 | 证据 | 状态 |
| --- | --- | --- | --- | --- |
| W1 T086／T087 | 真实 S、O 均存在才在 B03 契约阶段先发绿后发蓝，入口零额不掷骰，已发普通箭仍可在过期后命中 | [召唤契约](rules/item-summon-contracts-batch-01.md) · `damageEnemy` | `serpent contracts run inside B03`、`a serpent ward arrow survives` | 受控已验 |
| W2 T044／T045 | 周期显示零伤；仅允许行动时保留薄葬空目标施法与一秒 CD | [原生废旧壳](rules/enemy-auras-and-utility.md) · `diseasePulseTargets`、`damageEnemy` | `T044 pulses without damage` | 受控已验，正式波次实播待验 |
| W2 A020／A151／i310 | 同目标可吃两枚各有实际源的 q010，q032 先撞盾，独立减生命与六秒分期返还 | [定向技能](rules/native-targeted-batch-01.md) · `lagunaBlade`、`resolveMagicArrow` | `A020 scepter can select`、`A151 scepter arrow takes` | 受控已验，正式实播待验 |
| W2 i318／i319／i320 | 真正施法才积印记。零目标保存层数，先法术后按当前 HP 发神圣，转移物品不携带印记 | [灰烬兜帽](rules/ogre-hood-items.md) · `triggerAshHood` | `ash hood saves charges` | i318 受控已验；全档、转移与显示待验 |
| W2 i255／i276／i281／i325 | 头骨永久随机成长，封印按期限归还，末日当次锁定，落雪停止按实际引导时长 | [最终装备](rules/item-final-batch-01.md) · `useGuldanSkull`、`useControlEquipment`、`finishSnow` | `test/m2.test.mjs` 同名用例 | 局部受控通过，正式取得及施放待验 |
| W3 Q18 J001／J006／J007 | 5 秒首笔福利、120 秒周期与独立手动冷却。单人无分享对象，保留开关 | [Q18](rules/platform-and-access.md) · `grantWorkerBenefit` | [96 项检查](evidence/m2-core-17/check.log) | 受控已验，公开待验 |
| W5 A10 | 已注册种子 14 在第 30 波突破，零 SSR，肉山入场后 466.491214 秒击杀。四个其他种子超时，均保留 | [验收 A10](development-plan-m2.md) · `checks/m2-normal-run.mjs` | [种子 14](evidence/m2-core-17/a10-14.json) · [五局和阶段证据](evidence/m2-core-17/) | core-17 正常引擎样本通过，变更后重跑 |
| W5 A11 | 保留护符的种子 14 第 50 波容怪失败，零击杀超时另有正常轨迹 | [验收 A11](development-plan-m2.md) | [护符失败](evidence/m2-core-17/a11-charm-14.json) · [超时](evidence/m2-core-17/a10-47.json) | 护符正常路径与三分支刷新未关闭 |
| W5 A17 | 正常经济完成 m521–m523、购买 i266，40 波合成 i265，尚缺正常局活动关店清理的证据 | [验收 A17](development-plan-m2.md) | [三级和合成](evidence/m2-core-17/a17.json) · [受控浏览器](evidence/m2-core-16/a17-browser.json) | 部分正常验收 |
| W5 A18 | 受控 Chrome 已覆盖两路，core-17 的正常样本未获得四级箱 | [验收 A18](development-plan-m2.md) | [受控浏览器](evidence/m2-core-16/a18-browser.json) · [正常样本](evidence/m2-core-17/a18.json) | 保留合格和未覆盖证据，候选同址待验 |

## core-19／core-20 新证据

| 工作包与 ID | 实施及范围 | 可断言结果与证据 | 验收 |
| --- | --- | --- | --- |
| W1 A093／A172 | 连接源可独立结束，波次载体保存各自来源和位置 | 取消主枷锁后副链仍打三拍；原主塔离场后两个相切区域各打十拍 | 受控引擎通过，正式展示待验 |
| W1 N536／N573 | 海妖外壳保留独立 BPSE；死亡旋风减实际有标记的来源 | 丢弃减速而保留眩晕。近处英雄普通出手为 50，来自未被旋风标记的远处守卫同归属出手为 100 | 受控引擎通过，正式场景待验 |
| W4 m001／m571／b122 | 实际死亡、同 ID 重生和召唤到期播放 | [Chrome 同址刷新](evidence/m2-core-20/battle-actions-browser.json) 观察 Death 与重生场效 | 受控浏览器通过，逐对象正式验收待补 |
| W5 A10／A17 | core-18 种子14使用挑战策略通过 A10，且正常挑战一级、二级、三级、买书、合成、活怪及待发批关店清除 | [正常经济轨迹](evidence/m2-core-18/a17-14.json)；第54波时无活动怪、队列和注册；入场后 449.586798 秒击杀。core-19 原策略未重现击杀 | core-18 正常通过子项，最终候选待验 |
| W6 A13／A16 | core-12 → core-19 → core-12 → core-19 用同一地址续局 | [本地生产包](evidence/m2-core-19/localhost-update-rollback.json)，活动局 ID 相同，修订 4／5／5 | 本地通过，公开地址待验 |

| W2 i218／i220／i327 | 击杀分别累计魔能，直接最大魔法每点＋3，不额外回蓝。i327 的剩余冷却折算后再应用 P222 | [资源与冷却](rules/item-growth-batch-01.md) · `i327 grows maximum mana` | 受控通过，正式装备和转移待验 |
| W1 回收／移出 | 同 ID 从场内撤销后按真实槽 0–5 处理掉落和销毁，取消前摇和已离场施法者的引导 | [实体生命周期](rules/tower-lifecycle.md) · `execute` 的 `recycle-tower` | 已改，装备及多个来源组合待验 |
| W4 m032／m050 | 替换为有 Spell 的本地模型，保留原模型路径、尺寸倍率、碰撞和机体类型 | [模型清单](../src/assets/m2/bindings.json) · [新 m032 施法](evidence/m2-core-21/battle-actions-browser.json) | 贴图／动画静态通过；m032 受控 Chrome 通过；m050 正常待验 |

| W2 i722 | 复制时采样武器及攻速，只带原生装备暴击条目；之后移出本体装备不改旧幻象 | `i722 copies weapon inputs`，正式取得及入场表现待验 | 受控通过 |
| W5 P001–P013 | 13种正常抽卡、五张R兑换、建塔并升满。实际达到21级且资格有效 | [全部独立轨迹](evidence/m2-core-21/qualifications/) | core-21 正常通过 |
| W5/W6 A11／A17／A18 | 三类终态各刷新重读。合法挑战及箱、刀的规则结果独立记录 | [A11](evidence/m2-core-21/a11-browser.json) · [A17](evidence/m2-core-21/a17-browser.json) · [A18](evidence/m2-core-21/a18-browser.json) | 受控浏览器通过。正常护符和最终公开仍待验 |
| W6 A13 | 实际快照接受治疗连线、神能力到期及独立施法结束；恢复封印、在途弹道、施工和召唤 | [core-22 受控浏览器](evidence/m2-core-22/complex-browser.json) | 首次恢复、事件到期及再次刷新均通过，终局前领奖与命令只记录一次 |
| W2 N519／i206 | N519 读取第一候选并在施法中恢复，受体下一发武器伤害减半。显形宝石由工人、能量圈或完工塔持有时在 1100 闭圆有效 | `test/m2.test.mjs` 的 N518 与 N519 用例；[core-21 的 N519 Spell](evidence/m2-core-21/battle-actions-browser.json) | core-23 受控引擎通过，公开待验 |
| W5 A10 | 种子 14 第 25 波完成 P006，零 SSR，肉山入场后 478.184361 秒由 H038 武器击杀 | [core-22 正常轨迹](evidence/m2-core-22/a10-14.json) | core-22 正常引擎样本通过，core-23 待重跑 |
| W4 N576／b138 | 修复替代模型的刚性蒙皮组，保留蛋模型几何、贴图及模板尺寸。所有 63 个模型素材在 Chrome 通过实际贴图上传和绘制 | [WebGL 逐素材与 220 绑定](evidence/m2-core-24/model-library-browser.json) · [受控 N576 场景及同址恢复](evidence/m2-core-24/battle-actions-browser.json) | b138 实际出现并重建。独立受控引擎补足 6 秒成功和英雄击破后无 FINISH，公开待验 |
| W2 A154 | 工人／能量圈通过指令入口，EFFECT 扣费与冷却后按规则拒绝换位。自身属于合法同方目标 | [换位规则](rules/hero-aura-family-next.md) · `test/m2.test.mjs` | core-25 受控引擎确认，不移动、待调度无换位，公开待验 |
| W5 A18 | 正常对局在第 35、38、43 波取得四级箱钥并开箱，记录 i502、i503、i003，炼魂任务计数未变化 | [常规掉落](evidence/m2-core-22/a18-1709.json) · [宝箱许愿](evidence/m2-core-23/a18-chest-wish.json) | 三把指定刀仍缺正常开箱直接获得的证据 |
| W5 A10 | core-25 同一登记种子 14 重现 P006 突破和 478.184361 秒阵容击杀 | [core-25 种子 14](evidence/m2-core-25/a10-14.json) | 最新本地产物通过其中一局，五种子继续收集 |
| W2/W5 H005 | 35 波正式使用四级钥匙开出 i502，36 波建 H005，A019／A020／A021 各学六档，查到 A019／A020 攻击记录 | [core-25 正常局](evidence/m2-core-25/a11-charm-wished-ssr-14.json) | 该局第 49 波容怪失败，单独作为正常取得和施法证据 |
| W6 A13 | core-25 再次覆盖封印归还、治疗连线、新旧施法回调、操作和领奖在两次刷新后的状态 | [Chrome 复杂快照](evidence/m2-core-25/complex-browser.log) | 受控同址通过，公开待验 |
| W1 共享武器准入、i204／i282／q007 | 普通索敌与命中重查准入。q007 独立在同刻提交，使用捕获的武器分量和自己的骰子，首目标准入后按稳定顺序最多提交十个目标 | `match.ts#weaponTargetable`、`finishEquipmentVolley` | 本组已实现并定向验证归属消失、主目标失效、闭合 900 射程与十目标上限。q007 原对象没有弹速字段。最终候选待验 |
| W1／W2 A093、N511、N536 | 枷锁被移除或目标实际死亡时同刻结束对应引导，其他 q001 枷锁独立。受控时拒绝主动受击反应。嘲讽只给能接令的目标，已接受后沿普通攻击订单继续 | `match.ts#endEnemyLeashes`、`finishEnemyReaction` | 这组分支已实现并通过断点回归，公开待验 |
| W1／W2 i322／q018／q019 | 每次波命中重读归属塔的原始攻速，含生效中的减速，调度限幅不进入装备公式 | `match.ts#rawWeaponRate`、`damageEnemy` | 已接；同一在途波读档叠加减速后，完整 q019 包由 5200 纠正为 3800 |
| W1 T03 | 进行中的前摇、后摇及冷却按剩余工作量重排。到期待执行的条目保留同刻顺序 | [攻击时序](rules/attack-timing.md) · `match.ts#refreshWeaponTiming` | 实现完成。类型检查及定向回归通过，含读档、i304 和同刻前摇。最终候选验收待执行 |
| W2 i281／A151 | 末日与魔法箭的短弹道恢复时保留实际飞行量；q032 使用独立来源和延迟退款 | `match.ts` · `test/m2.test.mjs` | 对应分支已实现并定向验证移动目标、在途恢复及同刻护盾，最终候选验收待执行 |
| W2 N020–N022 | 手动选落点或地面物品。炮弹按固定点落地；仅指定物品可受伤，先完成的拾取保留实例并保护其后续丢弃 | [炮击](rules/creep-line-and-artillery.md) · [地面物件](rules/world-object-damage.md) · `match.ts#finishWeapon`、`m2.ts` | 手动入口与结算已实现；三档闭区间、时间、物品无敌及同刻双向顺序的定向引擎回归通过。最终界面与公开验收待执行 |
| W2 N061–N063 | 邪恶狂热使用实际绑定的瞬发技能、资源与装备回调，记录已施放档位；换型保持该档，新施放替换 | [狂热](rules/skill-lizard-frenzy-and-gold.md) · `tower-spells.ts`、`match.ts#beginTowerSpell` | 定向验证手动、拒绝、读档、升级时保持旧档和同一时段重排。最终候选待验 |
| W2 N088 | 耐久光环给闭圆内友方首档攻速和移速。同档来源不叠加，移出最后一份后攻速重排 | [光环](rules/creep-skill-family-next.md) · `match.ts#hasEnduranceAura` | 最后一份光环移除、已有武器阶段和工人移动的定向回归通过。最终候选待验 |
| W2 N001／N002／A040、i186／i188 | N001／N002 只有手动箭提交公共施法回调。手动箭保留自己的法球，自动箭由有效腐蚀覆盖 | [箭法球](rules/orb-and-channel-batch-01.md) · `match.ts#fireWeapon` | 手动和自动、有效目标、蓝耗、回调数量已定向验证。最终候选待验 |
| W2 N068–N071／i132 | 读取原始攻速和武器字段。龙卵子包结算后才清父包，零攻速取1200，负半径拒绝 | [范围伤害](rules/native-area-damage.md) · `match.ts#dragonCrush`、`averageWeaponField` | N068、共享字段与 i322 定向回归通过。逐档和正式取得待验 |
| W2 N054–N060／i173／i177 | Q36 与 Q37 分别按原分派点抽样。雷霆战斧子包先于父包；T039/T048 每击保留独立载体、稳定跳序和首目标护盾 | [雷霆战斧](rules/skill-thunder-axes-proc.md) · [闪电链](rules/skill-lightning-attack-effect.md) · `match.ts#chainLightning` | 对应分支实现完成。B03 及十二项定向回归通过。正式路径与 Alit 外观待验 |
| W2 i310／A094／A095 | 持杖按拾取时已学习的实际槽切换，失去物品复原下一次施法。前摇重查版本，旧 A095 群组保留独立弹道、等级与 15 秒寿命 | [神杖](rules/scepter-lifecycle.md) · [群蛇守卫](rules/ward-summons.md) · `finishPickup`、`finishHeroSpell` | 学习前后、移出、前摇取消、守卫恢复与到期定向通过。正式界面待验 |
| W2 N127–N131、N160–N164／Q45、N517 | 献祭按稳定范围快照逐笔结算；冷箭有单独期限且不减魔免目标移速；霜冻护甲重排实际近战出手者余时 | [献祭与冷箭](rules/creep-buffs-orbs-and-immolation.md) · [敌方霜甲](rules/npc-mainline-abilities-01.md) | 目标资格、装备霜冻并存、存档和到期的定向回归通过。正式候选待验 |
| W4 n183–n185／Alit | 普通攻击提交后 0.25 秒显示闪电，持续 0.25 秒；保存视觉起点与终点 | [闪电攻击](rules/skill-lightning-attack-effect.md) · `match.ts#fireWeapon`、`m2-scene.ts` | 命中前已有独立显示记录的定向回归通过。GPU 实播待验 |
| W2 N017–N019／T038 | 普通攻击后生成独立 q001，按实际连续接触结算；塔回收后所有者为空，波仍按同一来源推进 | [直线攻击](rules/creep-line-and-artillery.md) · `match.ts#advanceOrganicWave` | 125 毫秒接触、末端等号、魔免排除、回收和读档的定向回归通过。正式流程待验 |
| W3 Q22 春7／夏7、夏2 | 旧档只补缺失的互助奖励；同一局波54透支判定只登记一次 | [会话与任务](rules/session-and-task-state.md) · `restoreHeroState`、`startWave` | 旧档部分迁移、再次加载、重复波事件及五项相关回归通过。正式界面与公开待验 |
| W4 选点与对象移除 | 管理建造、术法、侦查守卫、炮击和灵兽的独立选点；目标删除或离开动作可用集合即清选择；受损塔卡销毁撤销对应拾取 | `m2.ts#clearPlacement`、`match.ts#finishWeapon` | 类型检查及卡片销毁定向回归通过；真实界面交替操作待最终候选 |
| W2 A171／A172 | A171 每目标独立 q001 锤，同刻按队列派发，N535 在命中时判定；A172 每区独立来源且成员按创建次序结算 | [双头龙](rules/hero-spells-batch-03.md) · `match.ts#resolveIcePath`、`resolveSpellZones` | 移动、源回收、存档、相切圈的定向回归通过。候选浏览器待验 |
| W1 召唤自然退场／T086、T087 | 守卫到期把实际契约值留在在途箭上。命中使用实际源及当前归属，绿契取主人当前属性，顺序先绿后蓝 | [群蛇守卫](rules/ward-summons.md) · `match.ts#damageEnemy` | 自然到期读档、正常命中、缺主人和零额前置的定向回归通过 |
| W4 n156–n158 炮击表现 | 弧度按固定点的实际飞行进度绘制，炮弹到达同一坐标时开始爆炸提示 | `m2-scene.ts`、`match.ts#finishWeapon` | 引擎验证三档落地提示同微秒；最终场景待验 |
| W2 A067／A148、N003–N011 | 山崩独立 q001，同刻击中时先控后伤。重击与践踏区分物理／法术准入和建筑免控。多重箭按可见性和创建顺序选副目标 | [山崩](rules/avalanche-native-effect.md) · [普通塔](rules/creep-skill-family-001-053.md) | 同刻中断、魔免、建筑、抗性与副箭范围定向通过。正式候选待验 |
| W4 B165 魔焰 | 运行中已点燃的载体显示附着效果，计时结束或关闭时移除显示 | `m2-scene.ts` · [魔焰效果](rules/item-final-batch-01.md) | 本地素材 Stand 及唯一贴图离线校验通过，引擎读档与关停回归通过，最终实播待验 |
| W2 i148／i330／i332 | 活力之球正式购买、交接、移出按当前和最大生命各 500 调整；魔焰在低生命提交后保留 I274 冷却及扣除最后一充能 | `test/m2.test.mjs` 的魔焰用例 | 分支已实现并受控通过，完整正常局待验 |
| W2 i276／N532 | 封印及返还和 e009 生命回复依各自顺序，20 秒后同一实体退形 | `match.ts#useControlEquipment`、`equipment-seal-end` | 已实现，形态与封印同存档的小范围回归通过 |
| W1 N525 | 背刺用实际伤害来源的位置；实际来源为临时对象时读取归属塔位置，缺归属跳过方向减伤 | [敌方反应](rules/late-enemy-effects.md) · `match.ts#damageEnemy` | 已实现。实际源和归属分处两侧、无归属的定向回归通过，正式候选待验 |
| W2 i276／i281 L06 | 自动订单携带当时的装备实例并走公共主动入口。同刻先转交的订单使原施放失效 | [装备](rules/item-final-batch-01.md) · `match.ts#startWeapon` | 已实现。自动和人工共用资源／冷却，以及先转交无消费的定向回归通过 |
| W2 i325／I243 | 自动按 800 范围记下坐标，零秒订单复核原装备。结束引导在记录点用独立 q001 出伤并冻结 | [落雪](rules/item-spell-control-batch-01.md) · `startWeapon`、`finishSnow` | 已实现。武器射程外自动选点、坐标恢复、先转交不扣费及 2.2 秒打两档定向通过。最终候选待验 |
| W2 i325／i327／P222 | 已提交落雪在实际结束时按当时剩余冷却依次折算。少于一秒停止仍结算冷却 | [装备成长](rules/item-growth-batch-01.md) · `match.ts#finishSnow` | 已实现。0.4 秒停止读档、不出伤及两次折算定向通过 |
| W2 N116 | 选择与生效均要求可见、非魔免有机对象。界面可指定目标，自动及旧命令按范围找首个。目标失效时保留蓝量和冷却，后得魔免撤移动限制 | [净化](rules/creep-skill-family-next.md) · `purgeTargets`、`resolveTowerSpell` | 已实现。指定非首个合法目标、失效不改选、免疫撤销定向通过；正式场景待验 |
| W2/W4 A092 | 主目标优先占位，N535 只挡主载荷。副目标按稳定顺序取地空有机目标，并记录 0.7 秒扇形闪电 | [苍穹震击](rules/area-active-batch-01.md) · `finishHeroSpell`、`m2-scene.ts` | 已实现。读档锁定、机械排除、主与副目标护盾、第一档六目标上限及链接记录通过。GPU 待验 |
| W2 N038–N040／Arsk | 恐怖嚎叫排除机械，获得魔免撤下减甲；净化、装备妖术、装备霜冻及落雪按有效抗性皮肤选持续时间 | [恐怖嚎叫](rules/creep-skill-family-001-053.md) · [妖术](rules/item-hex-effect.md) · `resistantToControl` | 实现完成。相关控制与定向选点通过，仍待最终组合与正式场景 |
| W2/W4 T049／i202／i325 | 每个圆内对象一个独立命令来源。成功妖术中断未提交施法、移速按 100、状态期换显示；延迟物理包仍是原施法者、固定原点、重新枚举 | [妖术](rules/item-hex-effect.md) · `triggerSpellEquipment`、`equipment-hex-end` | 类型检查、抗性、护盾、魔免、移动与到期读档定向通过。nsha 的替代素材已校验，候选实播待验 |
| W2 L06／i330／i332 | 自动尝试顺序保留死灵书和灵魂之戒，再登记定向及地点订单，之后才按 700 范围的活目标和满血尝试魔焰 | [L06](rules/item-lifecycle.md) · `match.ts#startWeapon` | 已实现。魔焰时钟、召唤、借还蓝与定向装备十一项关联回归通过。正式候选待验 |
| W2 P000／P200 | 30 级实际学习授予永久 P200；神能道具读取实际形态。旧档保留 P000 等级时补 P200 | [神能](rules/divine-books.md) · `learnHeroSkill`、`restoreHeroState` | 已实现。29／30 级、迁移、形态未随等级撤除及 i258 转形定向通过。正式界面待验 |
| W2 神能书反馈 | 成形／升星显示实际星级，区分结晶抽签失败、十星返还和形态不合格返还 | [神能](rules/divine-books.md) · `match.ts#useDivineBook`、`m2.ts#frame` | 各结果码和充能事务已定向验收；界面显示待候选浏览器 |
| W1/W2 P217、i134／i279 | 生效事件先读细雪当前魔法，再到妖术、P217 和兜帽，瞬发战棍也用共同分派。两次合格施法生成独立 T210 波源，原塔回收后仍结算 | [神能](rules/divine-books.md) · [细雪](rules/item-muramasa-takemitsu.md) · [焰光](rules/item-spell-control-batch-01.md) · `match.ts#triggerSpellEquipment` | 本组分派及 i279 独立来源实现完成。P217 先于兜帽智力筛选、持续存档和焰光在途回收定向通过。焰光宽度逐时接触尚待共享扫掠核对 |
| W4 施法动作 | 优先实际 Spell；无 Spell 时狼形使用素材的 Attack Slam，其他模型给出施法起伏。进行中落雪、枷锁和剑雨持续显示施法 | `m2-models.ts`、`m2-scene.ts` | 实现完成。保留原模型、碰撞与普通攻击／死亡显示。候选 GPU 实播待验 |
| W4 玩家实体承伤核对 | 原对象表中本期 82 个玩家塔阶／形态均有 Avul；核查的 82 个主线、挑战、辅助敌人没有普通武器。b116 有 200 生命，但当前无已核实可达的攻击者对其提交伤害 | [侦查](rules/item-utility-batch-01.md) · 原 `units_unitabilities.slk`、`units_unitweapons.slk` 和 `war3map.w3u` | 保留合法的敌方死亡／重生及玩家召唤自然退场证据。b116 的实际探测与到期通过定向引擎，候选场景待验 |
| W2 i264／P220 | 成功换星即时更新固定生命／魔法，9→10 星最大与当前生命各加 3000，已损生命值保留；满档仍按原返还 | `match.ts#useDivineBook` | 已实现并受控通过，正常取得及全形态待验 |
| W3 Q18–Q22 外观 | 17 工人形态、36 个默认可用饰件／称号、4 个可达任务外观在应用交互中已展示。验证撤掉、刷新及重开，290 点两能量圈按当前上限保持锁定 | [core-25 Chrome 外观](evidence/m2-core-25/appearance-browser.json) | 受控覆盖通过，最终版验收待关闭 |
| W6 A13／A16 | 同一浏览器同址 core-12→core-25→core-12→core-25，回退保留原局，恢复后续写。常规流程通过旧写拒绝和写入异常恢复 | [更新回退](evidence/m2-core-25/localhost-update-rollback.json) · [常规 Chrome](evidence/m2-core-25/full-browser.log) | core-25 本地通过，最终公开待验 |

## Q18–Q22 权益及任务

按 [权益映射](rules/platform-and-access.md) 与 [任务规则](rules/session-and-task-state.md) 验收。图片替代和实际播放另见全对象模型动作表。

| ID | 应用与撤销用例 | 当前入口与状态 |
| --- | --- | --- |
| Q18 SHOPITEM01/08 | 新档使用开局包，核对额外 i412。到 30／40 波检查奖励分支，换皮核对三围各 +30，福利计分读取 1.15 | 普通开局和 G059 已有历史证据。J006/J001 计时受控已验，J007 单人切换保留，正式整页组合待验 |
| Q18 SHOPITEM03 | 正常击杀后结算，按倍率和保存修订累计一次 | `commitKillScore`，终局待最终候选复验 |
| Q18 S005／S009／S010／S511–S515／S517／S518 | 依次选择十种工人，实际换同 ID 形态后拾取，走动和重开保持 | `choose-appearance`，模型已登记，实播待验 |
| Q18 S534／S540／S553、S602／S603／S605／S606／S608／S609、S707／S900、S545 | 同类别替换一项，异类别同时展示。撤销一项只清该槽。验证能量圈挑选 S545 实际重建 g201 及转交成功 | `m2-scene.ts`，实现展示，逐项复验中 |
| Q19 s001–s003 | S003→g003、S002→g002、S004→g004，三次应用后切回 w001，各保持工人状态 | 已接三形态和切回，正式场景复验中 |
| Q19 s012 | S532 六芒星出现，替换其它类别后仍存在，取消立即撤销 | 已接工人光环，原模型贴图缺失，用战场环与粒子替换 |
| Q19 s004–s011／s013–s018 | 各自关联英雄模板处验证，超出入选内容不出现空菜单 | 依据 modelMappings.baseUnits 与六个入选英雄 ID 复查，此组无对应英雄 |
| Q20 f002／f004／f006／f007／f010／f012 | 共六类光环 S537／539／544／546／548／536，切换并验证实际渲染、撤销和刷新 | 已接，待逐项运行证据 |
| Q20 f005 | 选择 S212 转为 G059，验证 A069 两种顺序、装备撤销和刷新增益 | 已接，历史 Chrome 和 core-16 局部引擎 |
| Q20 f001／f003／f008／f009／f011 | 按 baseUnits 复查桔梗、奴良陆生、武圣、恐惧之主、烈焰之鳞对应英雄 | 均不在六个入选英雄中，入选英雄皮肤仅 f005 |
| Q21 S006／S007／S008／S516 | 工人四形态，切换时不清背包与路径，恢复后动作与状态一致 | 已接，动作实播待逐项验收 |
| Q21 S533／S535／S901、可达称号 | 选择中秋、十一光环和星光点点，检查载体实际可见。切换称号后只出现本文字，撤销即时 | 已接渲染，逐项待验 |
| Q22 春 7／夏 7 | 新档各记 666，得 40／30 点，在旧档和再开局不重发 | `startSeasons`，历史引擎及正式开局有证据 |
| Q22 春 4 | 破损刀锻造到 33，检查每次只计一次，越过门槛后不重领奖 | `forgeSword`，历史正常样本 1 次 |
| Q22 春 5 | 福利实际到账 ≥30,000 计 1，20 次完成；29,999 不计 | `welfare-end`，最终累计和边界待验 |
| Q22 春 6 | 福利到账按万折算并累计至 888，比较刷新前后尾数 | `welfare-end`，最终累计待验 |
| Q22 春 8 | 累计 66 次击杀肉山，分别断言正常击杀、无杀手清怪和超时的结算关系 | `removeDeadEnemy`，有历史正常样本，三分支待验 |
| Q22 夏 2 | 本局实际透支且进入第 54 波记一次，累计 20 局。第 54 波前判负与未透支局不增 | 终局透支结算，正常累计待验 |
| Q22 夏 3 | 正常开箱累积 66，缺配对钥匙失败不增 | `useWorkerItem`，历史正常两路，最终累计待验 |
| Q22 夏 4 | 实际抽黑卡 66 次，非法哈希或失败购买不增 | `drawPurchasedCard`，历史局部证据 |
| Q22 夏 5 | 同局四英雄已完工计一次，取消和读档不复发，累计 13 局 | `finish-construction`，正式跨局待验 |
| Q22 夏 6 | 点金合法并成功 99 次，选择失效目标不计 | `useWorkerItem`，历史 Chrome 局部证据 |
| Q22 夏 8 | 同局二项挑战装备解锁即完成，二级奖励和购买不可重复推动计数 | `rewardChallenge`，历史 A17 局部证据 |
| Q22 夏 9 | 正式抽到 13 张 SSR，轮换兑换与入包方式边界按规则核对 | `drawPurchasedCard`，历史种子 6／8 各一次 |
| Q22 S542／S547、S543／S549、S604／S607 | S542／S547 对应 290 点，当前两赛季上限分别为 180／270；旧档已取得节点继续可用。其余四个可达节点验证附着效果与刷新 | 两个能量圈在本期全部任务完成后仍锁定，四个可达节点的正式选择和刷新复验中 |

## 全对象模型动作矩阵

本表覆盖当前绑定及发现的待补动作。动作列为 MDX 静态解析，场景列只登记已有明确的实例证据。同一个素材被多个内容 ID 使用时，各行保留独立来源和验收状态。

| 内容 ID | 角色 | 原路径／当前素材 | 贴图数 | Stand / Walk / Attack / Death / Spell | 场景验收 |
| --- | --- | --- | --- | --- | --- |
| n147 | 塔 | `units\creeps\PolarFurbolg\PolarFurbolg` → Tauren Druid Final（`library-8173c4de27df70633301af89/model.mdx`） | 4 | Stand / Walk / Attack 2 / Death / Spell | 最终候选待验 |
| n148 | 塔 | `units\creeps\PolarFurbolg\PolarFurbolg` → Tauren Druid Final（`library-8173c4de27df70633301af89/model.mdx`） | 4 | Stand / Walk / Attack 2 / Death / Spell | 最终候选待验 |
| n149 | 塔 | `units\creeps\PolarFurbolg\PolarFurbolg` → Tauren Druid Final（`library-8173c4de27df70633301af89/model.mdx`） | 4 | Stand / Walk / Attack 2 / Death / Spell | 最终候选待验 |
| n150 | 塔 | `units\creeps\PolarFurbolg\PolarFurbolg` → Tauren Druid Final（`library-8173c4de27df70633301af89/model.mdx`） | 4 | Stand / Walk / Attack 2 / Death / Spell | 最终候选待验 |
| n151 | 塔 | `units\creeps\PolarFurbolg\PolarFurbolg` → Tauren Druid Final（`library-8173c4de27df70633301af89/model.mdx`） | 4 | Stand / Walk / Attack 2 / Death / Spell | 最终候选待验 |
| n152 | 塔 | `units\creeps\PolarFurbolg\PolarFurbolg` → Tauren Druid Final（`library-8173c4de27df70633301af89/model.mdx`） | 4 | Stand / Walk / Attack 2 / Death / Spell | 最终候选待验 |
| n141 | 塔 | `units\creeps\Centaur\Centaur` → HordeRider（`library-a4e9f3631cb66fc10187d036/model.mdx`） | 6 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| n142 | 塔 | `units\creeps\CentaurArcher\CentaurArcher` → HordeRider（`library-a4e9f3631cb66fc10187d036/model.mdx`） | 6 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| n143 | 塔 | `units\creeps\CentaurArcher\CentaurArcher` → HordeRider（`library-a4e9f3631cb66fc10187d036/model.mdx`） | 6 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| n144 | 塔 | `units\creeps\Centaur\Centaur` → HordeRider（`library-a4e9f3631cb66fc10187d036/model.mdx`） | 6 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| n145 | 塔 | `units\creeps\CentaurKhan\CentaurKhan` → HordeRider（`library-a4e9f3631cb66fc10187d036/model.mdx`） | 6 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| n146 | 塔 | `units\creeps\CentaurKhan\CentaurKhan` → HordeRider（`library-a4e9f3631cb66fc10187d036/model.mdx`） | 6 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| n190 | 塔 | `units\creeps\TimberWolf\TimberWolf` → Wolf_ghost（`library-0f6ab24d2033025b01329fd2/model.mdx`） | 1 | Stand / Walk fast / Attack / Death / — | 最终候选待验 |
| n191 | 塔 | `units\creeps\TimberWolf\TimberWolf` → Wolf_ghost（`library-0f6ab24d2033025b01329fd2/model.mdx`） | 1 | Stand / Walk fast / Attack / Death / — | 最终候选待验 |
| n192 | 塔 | `units\creeps\TimberWolf\TimberWolf` → Wolf_ghost（`library-0f6ab24d2033025b01329fd2/model.mdx`） | 1 | Stand / Walk fast / Attack / Death / — | 最终候选待验 |
| n193 | 塔 | `units\creeps\DireWolf\DireWolf` → Wolf_ghost（`library-0f6ab24d2033025b01329fd2/model.mdx`） | 1 | Stand / Walk fast / Attack / Death / — | 最终候选待验 |
| n194 | 塔 | `units\creeps\WhiteWolf\WhiteWolf` → Wolf_ghost（`library-0f6ab24d2033025b01329fd2/model.mdx`） | 1 | Stand / Walk fast / Attack / Death / — | 最终候选待验 |
| n249 | 塔 | `units\creeps\SatyrTrickster\SatyrTrickster` → IllidanDark（`library-df460f363ef10339a32c1e12/model.mdx`） | 5 | Stand GM 15 / Walk Fast / Attack First / Death / Spell Ready | 最终候选待验 |
| n250 | 塔 | `units\creeps\SatyrTrickster\SatyrTrickster` → IllidanDark（`library-df460f363ef10339a32c1e12/model.mdx`） | 5 | Stand GM 15 / Walk Fast / Attack First / Death / Spell Ready | 最终候选待验 |
| n251 | 塔 | `units\creeps\SatyrTrickster\SatyrTrickster` → IllidanDark（`library-df460f363ef10339a32c1e12/model.mdx`） | 5 | Stand GM 15 / Walk Fast / Attack First / Death / Spell Ready | 最终候选待验 |
| n252 | 塔 | `units\creeps\SatyrTrickster\SatyrTrickster` → IllidanDark（`library-df460f363ef10339a32c1e12/model.mdx`） | 5 | Stand GM 15 / Walk Fast / Attack First / Death / Spell Ready | 最终候选待验 |
| n253 | 塔 | `units\creeps\SatyrTrickster\SatyrTrickster` → IllidanDark（`library-df460f363ef10339a32c1e12/model.mdx`） | 5 | Stand GM 15 / Walk Fast / Attack First / Death / Spell Ready | 最终候选待验 |
| n254 | 塔 | `units\creeps\satyrhellcaller\satyrhellcaller` → IllidanDark（`library-df460f363ef10339a32c1e12/model.mdx`） | 5 | Stand GM 15 / Walk Fast / Attack First / Death / Spell Ready | 最终候选待验 |
| n168 | 塔 | `units\creeps\JungleBeast\JungleBeast` → BAIHU（`library-95e0f06612061e8048ec20b1/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| n169 | 塔 | `units\creeps\JungleBeast\JungleBeast` → BAIHU（`library-95e0f06612061e8048ec20b1/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| n170 | 塔 | `units\creeps\JungleBeast\JungleBeast` → BAIHU（`library-95e0f06612061e8048ec20b1/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| n171 | 塔 | `units\creeps\JungleBeast\JungleBeast` → BAIHU（`library-95e0f06612061e8048ec20b1/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| n172 | 塔 | `units\creeps\JungleBeast\JungleBeast` → BAIHU（`library-95e0f06612061e8048ec20b1/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| n173 | 塔 | `units\creeps\FelstalkerPurple\FelstalkerPurple` → heishuixuanshe（`library-7e8dce3250bd02fb61e59081/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| n174 | 塔 | `units\creeps\FelstalkerPurple\FelstalkerPurple` → heishuixuanshe（`library-7e8dce3250bd02fb61e59081/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| n175 | 塔 | `units\creeps\FelstalkerPurple\FelstalkerPurple` → heishuixuanshe（`library-7e8dce3250bd02fb61e59081/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| n176 | 塔 | `units\creeps\FelstalkerPurple\FelstalkerPurple` → heishuixuanshe（`library-7e8dce3250bd02fb61e59081/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| n186 | 塔 | `Units\Creeps\DragonSpawnBlue\DragonSpawnBlue` → DragonSpawn（`library-3122bc096d247fdbc99d3032/model.mdx`） | 2 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| n187 | 塔 | `Units\Creeps\DragonSpawnGreen\DragonSpawnGreen` → DragonSpawn（`library-3122bc096d247fdbc99d3032/model.mdx`） | 2 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| n188 | 塔 | `Units\Creeps\DragonSpawnPurple\DragonSpawnPurple` → DragonSpawn（`library-3122bc096d247fdbc99d3032/model.mdx`） | 2 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| n189 | 塔 | `Units\Creeps\DragonSpawnBlue\DragonSpawnBlue` → DragonSpawn（`library-3122bc096d247fdbc99d3032/model.mdx`） | 2 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| n177 | 塔 | `units\creeps\ForestTroll\ForestTroll` → ForestTroll4（`library-c359c3133c9609a8c7ba9df2/model.mdx`） | 5 | Stand 5 / Walk fast / Attack / Death / Spell Slam | 最终候选待验 |
| n178 | 塔 | `units\creeps\ForestTroll\ForestTroll` → ForestTroll4（`library-c359c3133c9609a8c7ba9df2/model.mdx`） | 5 | Stand 5 / Walk fast / Attack / Death / Spell Slam | 最终候选待验 |
| n179 | 塔 | `units\creeps\ForestTrollTrapper\ForestTrollTrapper` → ForestTroll4（`library-c359c3133c9609a8c7ba9df2/model.mdx`） | 5 | Stand 5 / Walk fast / Attack / Death / Spell Slam | 最终候选待验 |
| n180 | 塔 | `units\creeps\ForestTrollTrapper\ForestTrollTrapper` → ForestTroll4（`library-c359c3133c9609a8c7ba9df2/model.mdx`） | 5 | Stand 5 / Walk fast / Attack / Death / Spell Slam | 最终候选待验 |
| n181 | 塔 | `units\creeps\ForestTrollTrapper\ForestTrollTrapper` → ForestTroll4（`library-c359c3133c9609a8c7ba9df2/model.mdx`） | 5 | Stand 5 / Walk fast / Attack / Death / Spell Slam | 最终候选待验 |
| n182 | 塔 | `units\creeps\ForestTrollTrapper\ForestTrollTrapper` → ForestTroll4（`library-c359c3133c9609a8c7ba9df2/model.mdx`） | 5 | Stand 5 / Walk fast / Attack / Death / Spell Slam | 最终候选待验 |
| n183 | 塔 | `units\creeps\ThunderLizard\ThunderLizard` → DragonSpawnArmoredDarkshade（`library-918531ddf395099913d77acf/model.mdx`） | 2 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| n184 | 塔 | `units\creeps\ThunderLizard\ThunderLizard` → DragonSpawnArmoredDarkshade（`library-918531ddf395099913d77acf/model.mdx`） | 2 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| n185 | 塔 | `units\creeps\ThunderLizard\ThunderLizard` → DragonSpawnArmoredDarkshade（`library-918531ddf395099913d77acf/model.mdx`） | 2 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| n156 | 塔 | `units\undead\MeatWagon\MeatWagon` → GoblinAlchemist（`library-861019d61988455875577709/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell First | 最终候选待验 |
| n157 | 塔 | `units\undead\MeatWagon\MeatWagon` → GoblinAlchemist（`library-861019d61988455875577709/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell First | 最终候选待验 |
| n158 | 塔 | `units\undead\MeatWagon\MeatWagon` → GoblinAlchemist（`library-861019d61988455875577709/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell First | 最终候选待验 |
| n153 | 塔 | `units\nightelf\Ballista\Ballista` → DreneiPaladin（`library-a997041da23d1ffe0997f246/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| n154 | 塔 | `units\nightelf\Ballista\Ballista` → DreneiPaladin（`library-a997041da23d1ffe0997f246/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| n155 | 塔 | `units\nightelf\Ballista\Ballista` → DreneiPaladin（`library-a997041da23d1ffe0997f246/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| n164 | 塔 | `buildings\undead\Ziggurat\Ziggurat` → icetower（`n006/model.mdx`） | 3 | Stand / — / 已有替代 / 已有替代 / — | 最终候选待验 |
| n165 | 塔 | `buildings\undead\Ziggurat\Ziggurat` → icetower（`n006/model.mdx`） | 3 | Stand / — / 已有替代 / 已有替代 / — | 最终候选待验 |
| n166 | 塔 | `buildings\undead\Ziggurat\Ziggurat` → icetower（`n006/model.mdx`） | 3 | Stand / — / 已有替代 / 已有替代 / — | 最终候选待验 |
| n167 | 塔 | `buildings\undead\Ziggurat\Ziggurat` → icetower（`n006/model.mdx`） | 3 | Stand / — / 已有替代 / 已有替代 / — | 最终候选待验 |
| n159 | 塔 | `buildings\nightelf\AncientProtector\AncientProtector` → ulduar_building01（`n001/model.mdx`） | 2 | Stand / — / 已有替代 / 已有替代 / — | 最终候选待验 |
| n160 | 塔 | `buildings\nightelf\AncientProtector\AncientProtector` → ulduar_building01（`n001/model.mdx`） | 2 | Stand / — / 已有替代 / 已有替代 / — | 最终候选待验 |
| n161 | 塔 | `buildings\nightelf\AncientProtector\AncientProtector` → ulduar_building01（`n001/model.mdx`） | 2 | Stand / — / 已有替代 / 已有替代 / — | 最终候选待验 |
| n162 | 塔 | `buildings\nightelf\AncientProtector\AncientProtector` → ulduar_building01（`n001/model.mdx`） | 2 | Stand / — / 已有替代 / 已有替代 / — | 最终候选待验 |
| n163 | 塔 | `buildings\nightelf\AncientProtector\AncientProtector` → ulduar_building01（`n001/model.mdx`） | 2 | Stand / — / 已有替代 / 已有替代 / — | 最终候选待验 |
| H021 | 塔 | `MountainGiant` → Cairne1（`H021/model.mdx`） | 5 | Stand / Walk / Attack / Death / Spell Slam | 最终候选待验 |
| G059 | 塔 | `Model_XX_1.mdx` → Tauren Druid Final（`library-8173c4de27df70633301af89/model.mdx`） | 4 | Stand / Walk / Attack 2 / Death / Spell | 最终候选待验 |
| H029 | 塔 | `units\orc\HeroShadowHunter\HeroShadowHunter` → Vol'jin（`H029/model.mdx`） | 4 | Stand Ready / Walk / Attack / Death / Spell Slam | 最终候选待验 |
| H038 | 塔 | `units\nightelf\Vengeance\Vengeance.mdl` → ZhenJi（`H038/model.mdx`） | 2 | Stand - 1 / Walk / Attack - 2 / Death / Spell Slam | 最终候选待验 |
| H044 | 塔 | `units\nightelf\Chimaera\Chimaera.mdl` → 112HellDragon（`H044/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell 1 | 最终候选待验 |
| H005 | 塔 | `units\human\Sorceress\Sorceress` → DiaoChan（`library-e4705d1e39c16f7d10978180/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell Throw | 最终候选待验 |
| H012 | 塔 | `Units\Creeps\BurningArcher\BurningArcher.mdl` → ZhangHe（`library-526468db9fd23423735393ad/model.mdx`） | 2 | Stand 2 / Walk / Attack / Death / Spell | 最终候选待验 |
| n001 | 塔 | `buildings\human\HumanTower\HumanTower` → ulduar_building01（`n001/model.mdx`） | 2 | Stand / — / 已有替代 / 已有替代 / — | 最终候选待验 |
| n002 | 塔 | `buildings\human\HumanTower\HumanTower` → ulduar_building01（`n001/model.mdx`） | 2 | Stand / — / 已有替代 / 已有替代 / — | 最终候选待验 |
| n003 | 塔 | `buildings\human\HumanTower\HumanTower` → ulduar_building01（`n001/model.mdx`） | 2 | Stand / — / 已有替代 / 已有替代 / — | 最终候选待验 |
| n004 | 塔 | `buildings\human\HumanTower\HumanTower` → ulduar_building01（`n001/model.mdx`） | 2 | Stand / — / 已有替代 / 已有替代 / — | 最终候选待验 |
| n005 | 塔 | `buildings\other\TowerDefenseTower\TowerDefenseTower` → ulduar_building01（`n001/model.mdx`） | 2 | Stand / — / 已有替代 / 已有替代 / — | 最终候选待验 |
| n021 | 塔 | `buildings\orc\WatchTower\WatchTower` → nightmarestone（`n021/model.mdx`） | 7 | Stand / — / 已有替代 / 已有替代 / — | 最终候选待验 |
| n022 | 塔 | `buildings\orc\WatchTower\WatchTower` → nightmarestone（`n021/model.mdx`） | 7 | Stand / — / 已有替代 / 已有替代 / — | 最终候选待验 |
| n023 | 塔 | `buildings\orc\WatchTower\WatchTower` → nightmarestone（`n021/model.mdx`） | 7 | Stand / — / 已有替代 / 已有替代 / — | 最终候选待验 |
| n024 | 塔 | `buildings\orc\WatchTower\WatchTower` → nightmarestone（`n021/model.mdx`） | 7 | Stand / — / 已有替代 / 已有替代 / — | 最终候选待验 |
| n025 | 塔 | `buildings\orc\WatchTower\WatchTower` → nightmarestone（`n021/model.mdx`） | 7 | Stand / — / 已有替代 / 已有替代 / — | 最终候选待验 |
| n006 | 塔 | `buildings\undead\Ziggurat\Ziggurat` → icetower（`n006/model.mdx`） | 3 | Stand / — / 已有替代 / 已有替代 / — | 最终候选待验 |
| n007 | 塔 | `buildings\undead\Ziggurat\Ziggurat` → icetower（`n006/model.mdx`） | 3 | Stand / — / 已有替代 / 已有替代 / — | 最终候选待验 |
| n008 | 塔 | `buildings\undead\Ziggurat\Ziggurat` → icetower（`n006/model.mdx`） | 3 | Stand / — / 已有替代 / 已有替代 / — | 最终候选待验 |
| n009 | 塔 | `buildings\undead\Ziggurat\Ziggurat` → icetower（`n006/model.mdx`） | 3 | Stand / — / 已有替代 / 已有替代 / — | 最终候选待验 |
| n010 | 塔 | `buildings\undead\Ziggurat\Ziggurat` → icetower（`n006/model.mdx`） | 3 | Stand / — / 已有替代 / 已有替代 / — | 最终候选待验 |
| w001 | 工人 | `w001` → Orckugong1（`m001/model.mdx`） | 4 | Stand / Walk fast / Attack / Death / — | [core-15 Stand 与 Walk](evidence/m2-audit-2026-11-26/) |
| m001 | 敌方 | `units\human\Peasant\Peasant.mdl` → Orckugong1（`m001/model.mdx`） | 4 | Stand / Walk fast / Attack / Death / — | 最终候选待验 |
| m002 | 敌方 | `units\undead\Skeleton\Skeleton.mdl` → ZhangLiao（`library-aa3487650712eee4d0ddebaa/model.mdx`） | 2 | Stand / Walk / Attack / Death / Spell Slam | 最终候选待验 |
| m003 | 敌方 | `units\human\Footman\Footman.mdl` → ZhaoYun（`library-ecb286d667a56ee32f05108b/model.mdx`） | 2 | Stand / Walk / Attack 1 / Death / Spell | 最终候选待验 |
| m004 | 敌方 | `units\human\Rifleman\Rifleman.mdl` → ForestTroll4（`library-c359c3133c9609a8c7ba9df2/model.mdx`） | 5 | Stand 5 / Walk fast / Attack / Death / Spell Slam | 最终候选待验 |
| m005 | 敌方 | `units\other\HeroArchMageGhost\HeroArchMageGhost.mdl` → IllidanDark（`library-df460f363ef10339a32c1e12/model.mdx`） | 5 | Stand GM 15 / Walk Fast / Attack First / Death / Spell Ready | 最终候选待验 |
| m006 | 敌方 | `units\human\Gyrocopter\Gyrocopter.mdl` → GoblinAlchemist（`library-861019d61988455875577709/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell First | 最终候选待验 |
| m007 | 敌方 | `units\human\Priest\Priest.mdl` → DreneiPaladin（`library-a997041da23d1ffe0997f246/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| m008 | 敌方 | `units\undead\Gargoyle\Gargoyle.mdl` → BatRider（`library-98ca0cecbb3e4c6b69eddc30/model.mdx`） | 4 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| m009 | 敌方 | `units\human\Knight\Knight.mdl` → HordeRider（`library-a4e9f3631cb66fc10187d036/model.mdx`） | 6 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| m010 | 敌方 | `units\demon\ChaosHellscream\ChaosHellscream.mdl` → OrcMale3（`library-3347a469be8ac03b6fdf2067/model.mdx`） | 5 | Stand / Walk fast / Attack / Death / Spell Ready Throw | 最终候选待验 |
| m011 | 敌方 | `units\orc\BatTroll\BatTroll.mdl` → BatRider（`library-98ca0cecbb3e4c6b69eddc30/model.mdx`） | 4 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| m012 | 敌方 | `units\undead\Abomination\Abomination` → hulk（`library-770552388eb0bdf3af1be834/model.mdx`） | 1 | Stand / Walk / Attack - 1 / Death / Spell Slam | 最终候选待验 |
| m013 | 敌方 | `units\orc\WitchDoctor\WitchDoctor` → Vol'jin（`H029/model.mdx`） | 4 | Stand Ready / Walk / Attack / Death / Spell Slam | 最终候选待验 |
| m014 | 敌方 | `units\demon\Warlock\Warlock` → Thrall__00（`library-df7ae78dc5a54ab8508441f3/model.mdx`） | 4 | Stand / Walk / Attack / Death / Spell Channel | 最终候选待验 |
| m015 | 敌方 | `units\naga\LadyVashj\LadyVashj` → Dragon_Priestess（`library-53bee3647d7e51c66bfb7368/model.mdx`） | 12 | Stand / Walk / Attack / Death / Spell One | 最终候选待验 |
| m016 | 敌方 | `units\creeps\NetherDragon\NetherDragon` → FelOrcNetherDrake（`library-62ccef07eb2c1140ca9225c9/model.mdx`） | 8 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| m017 | 敌方 | `units\naga\NagaMyrmidon\NagaMyrmidon` → heishuixuanshe（`library-7e8dce3250bd02fb61e59081/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| m018 | 敌方 | `units\creeps\FurbolgTracker\FurbolgTracker` → Tauren Druid Final（`library-8173c4de27df70633301af89/model.mdx`） | 4 | Stand / Walk / Attack 2 / Death / Spell | 最终候选待验 |
| m019 | 敌方 | `units\creeps\SpiderBlack\SpiderBlack` → Dragon_Priestess（`library-53bee3647d7e51c66bfb7368/model.mdx`） | 12 | Stand / Walk / Attack / Death / Spell One | 最终候选待验 |
| m020 | 敌方 | `units\creeps\CentaurKhan\CentaurKhan` → HordeRider（`library-a4e9f3631cb66fc10187d036/model.mdx`） | 6 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| m021 | 敌方 | `units\creeps\OrcWarlock\OrcWarlock` → Thrall（`library-30585fa7b274cad1c4b7ec83/model.mdx`） | 4 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| m022 | 敌方 | `units\nightelf\FaerieDragon\FaerieDragon` → FaerieDragonBlue（`library-f7e3cf80da4cd911feb025a0/model.mdx`） | 2 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| m023 | 敌方 | `units\nightelf\Chimaera\Chimaera` → 112HellDragon（`H044/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell 1 | 最终候选待验 |
| m024 | 敌方 | `units\human\TheCaptain\TheCaptain` → ZhaoYun（`library-ecb286d667a56ee32f05108b/model.mdx`） | 2 | Stand / Walk / Attack 1 / Death / Spell | 最终候选待验 |
| m025 | 敌方 | `units\orc\Shaman\Shaman` → Thrall（`library-30585fa7b274cad1c4b7ec83/model.mdx`） | 4 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| m026 | 敌方 | `units\undead\HeroLich\HeroLich` → DreneiPaladin（`library-a997041da23d1ffe0997f246/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| m027 | 敌方 | `units\undead\Banshee\Banshee` → ZhenJi（`H038/model.mdx`） | 2 | Stand - 1 / Walk / Attack - 2 / Death / Spell Slam | 最终候选待验 |
| m028 | 敌方 | `units\other\DranaiAkama\DranaiAkama` → DreneiPaladin（`library-a997041da23d1ffe0997f246/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| m029 | 敌方 | `Units\Creeps\FacelessOne\FacelessOne` → Dragon_Priestess（`library-53bee3647d7e51c66bfb7368/model.mdx`） | 12 | Stand / Walk / Attack / Death / Spell One | 最终候选待验 |
| m030 | 敌方 | `units\nightelf\herowarden\herowarden` → IllidanDark（`library-df460f363ef10339a32c1e12/model.mdx`） | 5 | Stand GM 15 / Walk Fast / Attack First / Death / Spell Ready | 最终候选待验 |
| m031 | 敌方 | `units\demon\DoomGuard\DoomGuard` → IllidanDark（`library-df460f363ef10339a32c1e12/model.mdx`） | 5 | Stand GM 15 / Walk Fast / Attack First / Death / Spell Ready | 最终候选待验 |
| m032 | 敌方 | `units\creeps\VoidWalker\VoidWalker` → xukonglong（`library-4e65e76a94fab26393b93611/model.mdx`） | 10 | Stand / Walk / Attack / Death / Spell | [N519 受控实播](evidence/m2-core-21/battle-actions-browser.json) |
| m033 | 敌方 | `units\creeps\OgreMagi\OgreMagi` → hulk（`library-770552388eb0bdf3af1be834/model.mdx`） | 1 | Stand / Walk / Attack - 1 / Death / Spell Slam | 最终候选待验 |
| m034 | 敌方 | `units\creeps\Medivh\Medivh` → DreneiPaladin（`library-a997041da23d1ffe0997f246/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| m035 | 敌方 | `units\creeps\DarkTrollShadowPriest\DarkTrollShadowPriest` → Trollwuyi（`library-de0914dc9811a52e284b7ac3/model.mdx`） | 6 | Stand 4 / Walk fast / Attack / Death / Spell Slam | 最终候选待验 |
| m036 | 敌方 | `units\nightelf\HeroKeeperoftheGroveGhost\HeroKeeperoftheGroveGhost` → Tauren Druid Final（`library-8173c4de27df70633301af89/model.mdx`） | 4 | Stand / Walk / Attack 2 / Death / Spell | 最终候选待验 |
| m037 | 敌方 | `units\demon\ChaosWarlord\ChaosWarlord` → OrcMalesama2（`library-2561becf70c4155dbf4c31d0/model.mdx`） | 5 | Stand / Walk fast / Attack first / Death / Spell Ready Throw | 最终候选待验 |
| m038 | 敌方 | `Units\Creeps\PandarenBrewmaster\PandarenBrewmaster` → WoWTaurenMale1（`library-e8bbb16927e8818596d90efd/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| m039 | 敌方 | `units\orc\spiritwalker\spiritwalker` → WoWTaurenMale1（`library-e8bbb16927e8818596d90efd/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| m040 | 敌方 | `units\nightelf\HeroDemonHunter\HeroDemonHunter` → IllidanDark（`library-df460f363ef10339a32c1e12/model.mdx`） | 5 | Stand GM 15 / Walk Fast / Attack First / Death / Spell Ready | 最终候选待验 |
| m041 | 敌方 | `units\nightelf\Huntress\Huntress` → HordeRider（`library-a4e9f3631cb66fc10187d036/model.mdx`） | 6 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| m042 | 敌方 | `units\creeps\RazorMane\RazorMane` → OrcMale3（`library-3347a469be8ac03b6fdf2067/model.mdx`） | 5 | Stand / Walk fast / Attack / Death / Spell Ready Throw | 最终候选待验 |
| m043 | 敌方 | `units\creeps\assassin\assassin` → ZhangHe（`library-526468db9fd23423735393ad/model.mdx`） | 2 | Stand 2 / Walk / Attack / Death / Spell | 最终候选待验 |
| m044 | 敌方 | `units\creeps\NerubianQueen\NerubianQueen` → Dragon_Priestess（`library-53bee3647d7e51c66bfb7368/model.mdx`） | 12 | Stand / Walk / Attack / Death / Spell One | 最终候选待验 |
| m045 | 敌方 | `units\orc\Tauren\Tauren` → Cairne1（`H021/model.mdx`） | 5 | Stand / Walk / Attack / Death / Spell Slam | 最终候选待验 |
| m046 | 敌方 | `units\human\BloodElfSpellThief\BloodElfSpellThief` → ZhenJi（`H038/model.mdx`） | 2 | Stand - 1 / Walk / Attack - 2 / Death / Spell Slam | 最终候选待验 |
| m047 | 敌方 | `units\human\Arthas\Arthas` → DreneiPaladin（`library-a997041da23d1ffe0997f246/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| m048 | 敌方 | `units\demon\Kiljaeden\Kiljaeden` → IllidanDark（`library-df460f363ef10339a32c1e12/model.mdx`） | 5 | Stand GM 15 / Walk Fast / Attack First / Death / Spell Ready | 最终候选待验 |
| m049 | 敌方 | `Units\Creeps\HeroGoblinAlchemist\HeroGoblinAlchemist` → GoblinAlchemist（`library-861019d61988455875577709/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell First | 最终候选待验 |
| m050 | 敌方 | `units\human\phoenix\phoenix` → 1Redcrystaldragon1（`library-d704a912c7f914e94c94bbad/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell | 静态通过，正式实播待验 |
| m051 | 敌方 | `units\creeps\SylvanusWindrunner\SylvanusWindrunner` → ZhenJi（`H038/model.mdx`） | 2 | Stand - 1 / Walk / Attack - 2 / Death / Spell Slam | 最终候选待验 |
| m052 | 敌方 | `units\creeps\IronGolem\IronGolem` → DragonSpawnArmoredDarkshade（`library-918531ddf395099913d77acf/model.mdx`） | 2 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| m053 | 敌方 | `Units\Creeps\SeaGiantGreen\SeaGiantGreen` → Tauren Druid Final（`library-8173c4de27df70633301af89/model.mdx`） | 4 | Stand / Walk / Attack 2 / Death / Spell | 最终候选待验 |
| m054 | 敌方 | `Units\Creeps\FirePandarenBrewmaster\FirePandarenBrewmaster` → WoWTaurenMale1（`library-e8bbb16927e8818596d90efd/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| mBOS | 敌方 | `units\creeps\RockGolem\RockGolem` → hulk（`library-770552388eb0bdf3af1be834/model.mdx`） | 1 | Stand / Walk / Attack - 1 / Death / Spell Slam | 最终候选待验 |
| b122 | 玩家召唤 | `units\orc\SerpentWard\SerpentWard` → heishuixuanshe（`library-7e8dce3250bd02fb61e59081/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| b123 | 玩家召唤 | `units\orc\SerpentWard\SerpentWard` → heishuixuanshe（`library-7e8dce3250bd02fb61e59081/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| b124 | 玩家召唤 | `units\orc\SerpentWard\SerpentWard` → heishuixuanshe（`library-7e8dce3250bd02fb61e59081/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| b125 | 玩家召唤 | `units\orc\SerpentWard\SerpentWard` → heishuixuanshe（`library-7e8dce3250bd02fb61e59081/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| b126 | 玩家召唤 | `units\orc\SerpentWard\SerpentWard` → heishuixuanshe（`library-7e8dce3250bd02fb61e59081/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| b127 | 玩家召唤 | `units\orc\SerpentWard\SerpentWard` → heishuixuanshe（`library-7e8dce3250bd02fb61e59081/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| b132 | 玩家召唤 | `units\orc\SerpentWard\SerpentWard` → heishuixuanshe（`library-7e8dce3250bd02fb61e59081/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| b133 | 玩家召唤 | `units\orc\SerpentWard\SerpentWard` → heishuixuanshe（`library-7e8dce3250bd02fb61e59081/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| b134 | 玩家召唤 | `units\orc\SerpentWard\SerpentWard` → heishuixuanshe（`library-7e8dce3250bd02fb61e59081/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| b135 | 玩家召唤 | `units\orc\SerpentWard\SerpentWard` → heishuixuanshe（`library-7e8dce3250bd02fb61e59081/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| b136 | 玩家召唤 | `units\orc\SerpentWard\SerpentWard` → heishuixuanshe（`library-7e8dce3250bd02fb61e59081/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| b137 | 玩家召唤 | `units\orc\SerpentWard\SerpentWard` → heishuixuanshe（`library-7e8dce3250bd02fb61e59081/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| e008 | 敌方 | `units\creeps\DireWolf\DireWolf` → Wolf_ghost（`library-0f6ab24d2033025b01329fd2/model.mdx`） | 1 | Stand / Walk fast / Attack / Death / — | 最终候选待验 |
| e009 | 敌方 | `Units\Creeps\HeroGoblinAlchemist\HeroGoblinAlchemist` → GoblinAlchemist（`library-861019d61988455875577709/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell First | 最终候选待验 |
| b107 | 玩家召唤 | `units\creeps\SkeletonArcher\SkeletonArcher` → ForestTroll4（`library-c359c3133c9609a8c7ba9df2/model.mdx`） | 5 | Stand 5 / Walk fast / Attack / Death / Spell Slam | 最终候选待验 |
| b108 | 玩家召唤 | `units\creeps\SkeletonArcher\SkeletonArcher` → ForestTroll4（`library-c359c3133c9609a8c7ba9df2/model.mdx`） | 5 | Stand 5 / Walk fast / Attack / Death / Spell Slam | 最终候选待验 |
| b109 | 玩家召唤 | `units\creeps\SkeletonArcher\SkeletonArcher` → ForestTroll4（`library-c359c3133c9609a8c7ba9df2/model.mdx`） | 5 | Stand 5 / Walk fast / Attack / Death / Spell Slam | 最终候选待验 |
| b110 | 玩家召唤 | `units\creeps\SkeletonArcher\SkeletonArcher` → ForestTroll4（`library-c359c3133c9609a8c7ba9df2/model.mdx`） | 5 | Stand 5 / Walk fast / Attack / Death / Spell Slam | 最终候选待验 |
| b138 | 敌方 | `ChaoXinXing.MDX` → egg（`library-ba67621651f18e7c4658748a/model.mdx`），刚性绑骨修复 | 2 | Unnamed 静态循环 | N576 实际生成后两次加载通过，公开待验 |
| m998 | 福利目标 | `Objects\InventoryItems\PotofGold\PotofGold.mdl` → dragonsoulchest（`library-5764b04d6d6c286c34029fde/model.mdx`） | 2 | Stand，跟随局内坐标移动及浮动 / — / — / — / — | 蒙皮与贴图解码通过；福利波候选实播待验 |
| m999 | 福利目标 | `Objects\InventoryItems\PotofGold\PotofGold.mdl` → dragonsoulchest（`library-5764b04d6d6c286c34029fde/model.mdx`） | 2 | Stand，跟随局内坐标移动及浮动 / — / — / — / — | 蒙皮与贴图解码通过；福利波候选实播待验 |
| m501 | 敌方 | `G012.mdx` → heishuixuanshe（`library-7e8dce3250bd02fb61e59081/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| m502 | 敌方 | `G012.mdx` → heishuixuanshe（`library-7e8dce3250bd02fb61e59081/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| m503 | 敌方 | `G012.mdx` → heishuixuanshe（`library-7e8dce3250bd02fb61e59081/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| m511 | 敌方 | `units\creeps\RazorMane\RazorMane` → OrcMale3（`library-3347a469be8ac03b6fdf2067/model.mdx`） | 5 | Stand / Walk fast / Attack / Death / Spell Ready Throw | 最终候选待验 |
| m512 | 敌方 | `units\creeps\RazorMane\RazorMane` → OrcMale3（`library-3347a469be8ac03b6fdf2067/model.mdx`） | 5 | Stand / Walk fast / Attack / Death / Spell Ready Throw | 最终候选待验 |
| m513 | 敌方 | `units\creeps\RazorMane\RazorMane` → OrcMale3（`library-3347a469be8ac03b6fdf2067/model.mdx`） | 5 | Stand / Walk fast / Attack / Death / Spell Ready Throw | 最终候选待验 |
| m521 | 敌方 | `units\nightelf\Dryad\Dryad` → Dragon_Priestess（`library-53bee3647d7e51c66bfb7368/model.mdx`） | 12 | Stand / Walk / Attack / Death / Spell One | 最终候选待验 |
| m522 | 敌方 | `units\nightelf\Dryad\Dryad` → Dragon_Priestess（`library-53bee3647d7e51c66bfb7368/model.mdx`） | 12 | Stand / Walk / Attack / Death / Spell One | 最终候选待验 |
| m523 | 敌方 | `units\nightelf\Dryad\Dryad` → Dragon_Priestess（`library-53bee3647d7e51c66bfb7368/model.mdx`） | 12 | Stand / Walk / Attack / Death / Spell One | 最终候选待验 |
| m531 | 敌方 | `units\orc\HeadHunter\HeadHunter` → Trollwuyi（`library-de0914dc9811a52e284b7ac3/model.mdx`） | 6 | Stand 4 / Walk fast / Attack / Death / Spell Slam | 最终候选待验 |
| m532 | 敌方 | `units\orc\HeadHunter\HeadHunter` → Trollwuyi（`library-de0914dc9811a52e284b7ac3/model.mdx`） | 6 | Stand 4 / Walk fast / Attack / Death / Spell Slam | 最终候选待验 |
| m533 | 敌方 | `units\orc\HeadHunter\HeadHunter` → Trollwuyi（`library-de0914dc9811a52e284b7ac3/model.mdx`） | 6 | Stand 4 / Walk fast / Attack / Death / Spell Slam | 最终候选待验 |
| m541 | 敌方 | `units\naga\NagaMyrmidon\NagaMyrmidon` → heishuixuanshe（`library-7e8dce3250bd02fb61e59081/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| m542 | 敌方 | `units\naga\NagaMyrmidon\NagaMyrmidon` → heishuixuanshe（`library-7e8dce3250bd02fb61e59081/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| m543 | 敌方 | `units\naga\NagaMyrmidon\NagaMyrmidon` → heishuixuanshe（`library-7e8dce3250bd02fb61e59081/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell Ready | 最终候选待验 |
| m551 | 敌方 | `Units\Other\Rexxar\Rexxar` → WoWTaurenMale1（`library-e8bbb16927e8818596d90efd/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| m552 | 敌方 | `Units\Other\Rexxar\Rexxar` → WoWTaurenMale1（`library-e8bbb16927e8818596d90efd/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| m553 | 敌方 | `Units\Other\Rexxar\Rexxar` → WoWTaurenMale1（`library-e8bbb16927e8818596d90efd/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| m561 | 敌方 | `units\creeps\Zombie\Zombie` → ForestTroll4（`library-c359c3133c9609a8c7ba9df2/model.mdx`） | 5 | Stand 5 / Walk fast / Attack / Death / Spell Slam | 最终候选待验 |
| m562 | 敌方 | `units\creeps\Zombie\Zombie` → ForestTroll4（`library-c359c3133c9609a8c7ba9df2/model.mdx`） | 5 | Stand 5 / Walk fast / Attack / Death / Spell Slam | 最终候选待验 |
| m563 | 敌方 | `units\creeps\Zombie\Zombie` → ForestTroll4（`library-c359c3133c9609a8c7ba9df2/model.mdx`） | 5 | Stand 5 / Walk fast / Attack / Death / Spell Slam | 最终候选待验 |
| m571 | 敌方 | `Skeleton.mdx` → ZhangLiao（`library-aa3487650712eee4d0ddebaa/model.mdx`） | 2 | Stand / Walk / Attack / Death / Spell Slam | 最终候选待验 |
| m572 | 敌方 | `Skeleton.mdx` → ZhangLiao（`library-aa3487650712eee4d0ddebaa/model.mdx`） | 2 | Stand / Walk / Attack / Death / Spell Slam | 最终候选待验 |
| m573 | 敌方 | `Skeleton.mdx` → ZhangLiao（`library-aa3487650712eee4d0ddebaa/model.mdx`） | 2 | Stand / Walk / Attack / Death / Spell Slam | 最终候选待验 |
| b103 | 玩家召唤 | `units\creeps\FelstalkerPurple\FelstalkerPurple` → Wolf_ghost（`library-0f6ab24d2033025b01329fd2/model.mdx`） | 1 | Stand / Walk fast / Attack / Death / — | 最终候选待验 |
| b104 | 玩家召唤 | `units\creeps\FelstalkerPurple\FelstalkerPurple` → Wolf_ghost（`library-0f6ab24d2033025b01329fd2/model.mdx`） | 1 | Stand / Walk fast / Attack / Death / — | 最终候选待验 |
| b105 | 玩家召唤 | `units\creeps\FelstalkerPurple\FelstalkerPurple` → Wolf_ghost（`library-0f6ab24d2033025b01329fd2/model.mdx`） | 1 | Stand / Walk fast / Attack / Death / — | 最终候选待验 |
| b106 | 玩家召唤 | `units\creeps\FelstalkerPurple\FelstalkerPurple` → Wolf_ghost（`library-0f6ab24d2033025b01329fd2/model.mdx`） | 1 | Stand / Walk fast / Attack / Death / — | 最终候选待验 |
| g002 | 工人 | `Model_Worker1.mdx` → revan low size（`library-2d64df21026ab4bffdcbfdee/model.mdx`） | 2 | Stand / Walk / Attack -1 / Death / Spell Channel | [Stand 已实播](evidence/m2-core-16/appearance-browser.json) |
| g003 | 工人 | `Model_Worker2.mdx` → Esdeath（`library-2d911f4eb94810eee37e2df2/model.mdx`） | 4 | Stand / Walk / Attack / Death / Spell One | [Stand 已实播](evidence/m2-core-16/appearance-browser.json) |
| g004 | 工人 | `Model_Worker_3.mdx` → FaerieDragonBlue（`library-f7e3cf80da4cd911feb025a0/model.mdx`） | 2 | Stand / Walk / Attack / Death / Spell | [Stand 已实播](evidence/m2-core-16/appearance-browser.json) |
| g005 | 工人 | `Model_Worker4.mdx` → DiaoChan（`library-e4705d1e39c16f7d10978180/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell Throw | [Stand 已实播](evidence/m2-core-16/appearance-browser.json) |
| g006 | 工人 | `yilidan.mdx` → IllidanDark（`library-df460f363ef10339a32c1e12/model.mdx`） | 5 | Stand GM 15 / Walk Fast / Attack First / Death / Spell Ready | [Stand 已实播](evidence/m2-core-16/appearance-browser.json) |
| g007 | 工人 | `Model_Worker_2.mdx` → Yoshino（`library-6ebc8e24931b5b5821d5760b/model.mdx`） | 2 | Stand / Walk / Attack / Death / Spell One | [Stand 已实播](evidence/m2-core-16/appearance-browser.json) |
| g008 | 工人 | `xiaoxiongmao.mdx` → Tauren Druid Final（`library-8173c4de27df70633301af89/model.mdx`） | 4 | Stand / Walk / Attack 2 / Death / Spell | [Stand 已实播](evidence/m2-core-16/appearance-browser.json) |
| g009 | 工人 | `Model_Worker5.mdx` → Chika（`library-d929e279e5dcab78a314430b/model.mdx`） | 1 | Stand / Walk fast / Attack -1 / Death / Spell Slam One | [Stand 已实播](evidence/m2-core-16/appearance-browser.json) |
| g010 | 工人 | `Model_Worker6.mdx` → Altarii（`library-8f6954bc3e6d6ec3d5257e6a/model.mdx`） | 6 | Stand / Walk / Attack / Death / Spell | [Stand 已实播](evidence/m2-core-16/appearance-browser.json) |
| g011 | 工人 | `Model_Worker7.mdx` → kagome（`library-ceabacf9dfb3a24b0caff983/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell | [Stand 已实播](evidence/m2-core-16/appearance-browser.json) |
| g012 | 工人 | `Model_Worker8.mdx` → Rei（`library-bacc853632ff27d615e10c1b/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell one | [Stand 已实播](evidence/m2-core-16/appearance-browser.json) |
| g013 | 工人 | `Model_Worker9.mdx` → moon_shin_GY（`library-77c283196a2883fbbc6ba3d6/model.mdx`） | 5 | Stand / Walk / Attack - 1 / Death / Spell Throw | [Stand 已实播](evidence/m2-core-16/appearance-browser.json) |
| g014 | 工人 | `Model_Worker10.mdx` → DreneiPaladin（`library-a997041da23d1ffe0997f246/model.mdx`） | 3 | Stand / Walk / Attack / Death / Spell | [Stand 已实播](evidence/m2-core-16/appearance-browser.json) |
| g015 | 工人 | `Model_Worker11.mdx` → Neptune（`library-403395695e5e199d6427466b/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell One | [Stand 已实播](evidence/m2-core-16/appearance-browser.json) |
| g016 | 工人 | `Model_Worker12.mdx` → ZhenJi（`library-64d76e67d43719918c9ce871/model.mdx`） | 2 | Stand - 1 / Walk / Attack - 2 / Death / Spell Slam | [Stand 已实播](evidence/m2-core-16/appearance-browser.json) |
| g017 | 工人 | `Model_Worker13.mdx` → Uni（`library-1768ef2eac547470e0375c5c/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell One | [Stand 已实播](evidence/m2-core-16/appearance-browser.json) |
| g018 | 工人 | `maoerjiang.mdx` → Noire（`library-a15d5cb7066c474dd8138857/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell One | [Stand 已实播](evidence/m2-core-16/appearance-browser.json) |
| g200 | 能量圈 | `NengLiangQuan1.mdx` → fireBird（`library-eb500852ccd70510d737ee4e/model.mdx`） | 2 | Stand / Walk / Attack / Death / — | 最终候选待验 |
| g201 | 能量圈 | `Model_BOX2.mdx` → Vol'jin（`library-d0baf8a566f6a8e0ff0213f6/model.mdx`） | 4 | Stand Ready / Walk / Attack / Death / Spell Slam | [Stand 已实播](evidence/m2-core-16/appearance-browser.json) |
| g202 | 能量圈 | `D037.mdx` → Esdeath（`library-2d911f4eb94810eee37e2df2/model.mdx`） | 4 | Stand / Walk / Attack / Death / Spell One | 最终候选待验 |
| b142 | 敌方 | `Units\Creeps\QuillBeast\QuillBeast` → BAIHU（`library-95e0f06612061e8048ec20b1/model.mdx`） | 1 | Stand / Walk / Attack / Death / Spell | 最终候选待验 |
| b143 | 敌方 | `units\creeps\WarEagle\WarEagle` → fireBird（`library-eb500852ccd70510d737ee4e/model.mdx`） | 2 | Stand / Walk / Attack / Death / — | 最终候选待验 |
| S602 | 工人特效 | `EFF_ChiBang_1.mdx` → fairywing（`library-df141cd9e130e00033be81f9/model.mdx`） | 1 | Stand / — / — / — / — | 最终候选待验 |
| S603 | 工人特效 | `Worker_CB2.mdx` → ANGELWING（`library-69c4a4c03a9ca9560491f572/model.mdx`） | 1 | Stand / — / — / — / — | [Stand 已实播](evidence/m2-core-16/appearance-browser.json) |
| S604 | 工人特效 | `Worker_CB3.mdx` → ELFWING（`library-7041b04e03ae45d694bfce2d/model.mdx`） | 1 | Stand / — / — / — / — | 最终候选待验 |
| S605 | 工人特效 | `Worker_CB4.mdx` → WingFlame01（`library-7aa71500b8c41e22c67e3b7d/model.mdx`） | 2 | Stand / — / — / — / — | 最终候选待验 |
| S606 | 工人特效 | `Worker_CB5.mdx` → HeroByakuyaWing（`library-88cca23983f23acec1db6f4f/model.mdx`） | 1 | Stand / — / — / — / — | 最终候选待验 |
| S607 | 工人特效 | `G142.mdx` → AWING（`library-7cd6aec60613c6d1fa49c783/model.mdx`） | 1 | Stand / — / — / — / — | 最终候选待验 |
| S608 | 工人特效 | `Worker_CB6.mdx` → WingBlack01（`library-9da6907e54aed922fbca0d4e/model.mdx`） | 2 | Stand / — / — / — / — | 最终候选待验 |
| S609 | 工人特效 | `liujinfengyi.mdx` → WingOfTheLucifer（`library-c581969cf919764ec92bf24b/model.mdx`） | 1 | Stand / — / — / — / — | 最终候选待验 |
| S901 | 工人特效 | `_G037.mdx` → HeroGlowOrigin（`library-c0bf1dfc99f775e37710c8c0/model.mdx`） | 0 | Stand Death / — / — / Death Spell / — | 最终候选待验 |
| S900 | 工人特效 | `_note1.mdx` → RuneAura（`library-f9730d3ba251e10be727bafd/model.mdx`） | 1 | Stand / — / — / — / — | [Stand 已实播](evidence/m2-core-16/appearance-browser.json) |
| b116 | 侦查守卫 | `units\orc\SentryWard\SentryWard` → sc2-mineral-field-bravo-1.0edited（`library-b95ff7dd314fa5ba1a5eb7e9/model.mdx`） | 4 | Stand / — / — / Death / — | 四张贴图解码、MDX 骨骼组和两段原生动画通过离线校验；候选实播待验 |
| B165 | 魔焰附着效果 | `T566.mdx` → magtheradoncubebypurgeandfire（`library-7d6641597dd4f377648f3c43/model.mdx`） | 1 | Stand / — / — / — / — | 贴图解码与原生 Stand 已离线验证，候选实播待验 |
| nsha | 妖术替代外观 | `units\critters\Sheep\Sheep` → FaerieDragonBlue（`library-f7e3cf80da4cd911feb025a0/model.mdx`） | 2 | Stand / Walk / Attack / Death / Spell | 小型生物替代，原实例位置和移动层保持；贴图与动作通过离线校验，候选实播待验 |

仍缺完整动作验收的例子包括：塔的施法动作来源、收回替代与实际战斗死亡的区分、各英雄可达形态、敌方受控及重新可见、召唤死亡与恢复。模型大小只参与渲染。
