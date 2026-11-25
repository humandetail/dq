# 335 个图鉴技能实现就绪对照

按图鉴「塔技能」的 335 个唯一 ID 复核。旧索引中的 184 个脚本核查标签与 151 个原生行为标签是来源分类；逐 ID 的实现就绪结论及对应规格在[机器表](skill-readiness-review.json)。接手时的原217范围含 A164；它在本次开始前已单项复核。通过现有专项补足有效依赖，旧文末尾仍写“另核”的历史范围保留原位置。

| 项目 | 复核结果 |
| --- | ---: |
| 图鉴唯一 ID | 335 |
| 旧局部范围 | 217 |
| 其他已完整专项 | 118 |
| 完整 Web 规则就绪 | 335 |
| 真实依赖未闭合 | 0 |

N020–022 的实际炮击和 A014/A015 涉及的龙形态武器，现已串接地面物品、发芽树、材质和清除的共同规则。全局 151 个原生来源标签中，10 个 AOcr 仅说明面板、没有独立增益，三个炮击说明标记链接到实际武器。其余 138 项有直接原生效果或已和脚本、武器、辅助与生命周期条款串接。标签匹配本身不证明效果就绪。原客户端未实测与游戏尚未实现不计作规则待核。
[原生暴击及标记](native-critical-family.md) · [炮击](creep-line-and-artillery.md) · [龙形态攻击](dragon-attack-passives.md) · [世界物体接口](world-object-damage.md)

## 补齐反击螺旋与山崩

**A056 反击螺旋。** Q31 的手动及自动发令保持 ANcl 无目标主动，A056 的 buttonpos=2,2、Hotkey=E 在学会后提供主动按钮。原 1–4 档 DataF 为 `robogoblin`、对象 CD5、DataC=1；5/6 档这些字段缺失，由六级专属实用提示确认 CD5，Q24 明确六档均接同一无目标命令和按钮、耗蓝0，命令使用 H017/G067/G032/G033 的 .3 秒前摇、.1 秒后摇。字段中500射程不用于无目标命令；自动650仅负责找活P11后发令；手动空圈也可提交。沿共享接收/取消/再复验，提交时开真实CD、派一次 EFFECT，核心必发、不掷概率、不发 stop。现有被动独立抽样及 stop 位置不随主动 CD 改动。Q24 700 两次独立取组按 B04 用二维闭圆；不可枚举的隐藏、Aloc、无效句柄/物件均不入组。P11活着的地空/建筑/魔免/无敌可以先被组计数，最终伤害各走 B03 准入，计数不反推受伤人数。新生单位不补进旧组，运行中保留原 owner/生命重查。
[反击螺旋](skill-counter-helix.md) · [淘汰的 B171](legacy-control-and-cast-closure.md) · [主动效力分派](../../reference/map-6.25/main.disasm#L170307) · [自动发令](../../reference/map-6.25/main.disasm#L174850) · [六档专属提示](../../reference/map-6.25/units_campaignabilitystrings.txt#L777)

**A067/A148 山崩。** 两者是六级 AOcr，被动数据的概率、倍率、附加伤害、闪避及必中均未配置，无对应 w3a，实际提示均给同一攻击触发山崩。Web Q24 本体不额外给任何普通暴击/必中/闪避，不展示可主动施放的第三载荷。保留 B012 自动分派第37支路原试探：任一标记就绪即可能从550内取首活P11，快照地点、排零时 `blizzard`，结束该轮扫描。命令走真实能力查找，它在只持山崩及实际宿主通常挂载的技能时被拒绝；没有额外耗蓝、CD或 SPELL_EFFECT。若另有真正接收该命令的有效技能，按该技能提交，仍不当作山崩。自动发令失败也不回退到该轮后面的扫描。ATTACKED 的原调用保持独立抽样，Q39/Q40 的辅助效果照旧；换 A067→A148 的 S212/A150 保持真实等级、同实体与同塔2秒锁，不重复学习或抽样。
[原概率与入口](skill-avalanche-proc.md) · [Q40](skill-avalanche-effect.md) · [实际辅助效果](avalanche-native-effect.md) · [换皮映射](skin-and-transformation.md) · [自动分派指令](../../reference/map-6.25/main.disasm#L175214)

## 旧范围的直接依赖

| 旧范围 | 补足或复用 |
| --- | --- |
| A001/A022/A027/A032/A036 | [共享普通命中和已发攻击](shared-attack-resolution.md)、[武器账户](weapon-field-source-notes.md)、[灵魂与攻击补核](legacy-skill-attack-batch-01.md)、[幻象](phantom-lancer-illusions.md)、[换皮](skin-and-transformation.md) |
| A007/A057/A180 | [共享布尔暂停、淘汰状态与原槽、无影拳真实位移攻击](legacy-control-and-cast-closure.md) |
| A035/A044/A077/A081 | [能量判定](skill-wraith-energy-proc.md)、[A045 完整斩击](legacy-skill-attack-batch-01.md)、[如意棒法/潮汐使者](skill-jingu-and-tidebringer.md)、[棒击](hero-spells-batch-01.md)、[阵法](monkey-formation.md) |
| A058–060/A084/A163 | [灰烬兜帽](ogre-hood-items.md)、[奥术天球](orb-and-channel-batch-01.md)、[精气与换皮蓝量](skin-and-transformation.md)、[集中火力原生](focus-fire-native.md) |
| N041–044/N054–060/N086/N160–164 | [灵兽反馈 N120–122](creep-skill-family-next.md)、[实体生命周期](tower-lifecycle.md)、[伤害＋范围接口](damage-pipeline.md)、[独立世界物体范围](native-area-damage.md)、[吞噬复制版](doom-devour-borrowed-skills.md)、[命中法球接口](item-weapon-effects-batch-01.md) |
| P000/T000/T101 | [P200/神能切换](divine-books.md)、[成长](hero-progression.md)、[同实体生命周期](skin-and-transformation.md)、[定向属性接口](hero-attribute-interface.md) |

校验 `python3 tools/audit-skill-readiness-review.py`。逐 ID 验证链接、规则所属、原来源标签与原生说明壳分类；对 A056/A067/A148 做定向对象与入口取证。原技能旧工具保留各自数值、源指令和行为验证。
