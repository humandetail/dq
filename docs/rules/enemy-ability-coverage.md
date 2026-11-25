# 可达敌人的能力覆盖

[机器表](enemy-ability-coverage.json) 记录110个实际可达模板，包括主线、无尽、深渊、挑战、技能召唤、两种形态和凤凰蛋。读取每个对象的 abilList，并登记生成、保护、复生和管线回调中的实际额外挂载。94个别名按能力 ID 去重，均具备具名可实现规则。兼做效果载体的 T069/T096/T097 等路径跟母技能，不另计数。派生实例模板规模沿既定召唤、复制和形态规格。[波次模板](waves-data.json) · [挑战与登记](challenge-spawns.md)

## 已闭合

- Arsk／无敌与普通命中、N523/N524/N572、T013–T018 原生抗性、N535 指向盾、N536、T202 与 N577 的实际状态和脚本分支；N549另闭合随机定向及树占用。[普通攻击](shared-attack-resolution.md) · [抗性](item-defense-batch-01.md) · [护盾](item-hex-effect.md) · [N536](skill-stone-gaze.md) · [主流程](damage-pipeline.md) · [发芽](sprout.md)
- 主线前段 N508 和 N511–522；中后及无尽补充 N525–528/N530–533/N571/N573–576/N579/N581；其中 N576 临时替身拆独立规范。N533已经按专属说明40%补齐，与空的普通原生闪避类型分开。[主线前段](npc-mainline-abilities-01.md) · [中后段](late-enemy-effects.md) · [超新星](supernova-egg.md)
- ma02–06 的实际应答 N537/538/539、N550/551/552、N540/542/559、N543、N554/557/558；敌方光环和辅助 N541/N553、N544–547/N556、T044，T045原生废旧动作沿主线前段。[ma02–06](npc-abyss-abilities.md) · [敌方光环](enemy-auras-and-utility.md)
- 挑战的 N701–704、N706–712、N582–584 和其内的 T140/T254；N548/N555/N578 的生成与计时登记已有专项。[挑战技能](challenge-enemy-effects.md) · [生成与登记](challenge-spawns.md)
- 深渊巨龙 N560/N561/N562–568 的形态、生物能力、伤害、运动和计时已核，N565 的幼龙生命周期和登记合用巨龙与生成规则。[深渊巨龙](npc-abyss-dragon-abilities.md) · [生成与登记](challenge-spawns.md)

## 待处理

可达敌方能力待完成分组为空。机器表保留静态来源分组供复查。敌方能力与辅助条目均不增加图鉴英雄技能完成数。

## 验证

`python3 tools/audit-enemy-ability-coverage.py` 使用共享只读索引核宿主、独立动态授予和对应实际交付，检查每个去重别名存在具名规格或明确的待补组。[机器表](enemy-ability-coverage.json) · [工具](../../tools/audit-enemy-ability-coverage.py)
