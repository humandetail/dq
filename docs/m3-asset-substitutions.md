# M3 素材替代证据

资产仓库存放已经审计的本地模型。下表记录新增技能表现所用的完整 MDX，逐对象塔模型另见 [绑定文件](../src/assets/m2/bindings.json) 与 [模型摘要](../src/assets/m2/models.json)。

| 内容及绑定 ID | 原资源 | 本地替代 | 表现规则 |
| --- | --- | --- | --- |
| A056 武圣旋转 · T1837 | T1837.mdx | columnsemicircleedited5 | 旋转弧随动作摆动，显示 0.4 秒 |
| A057 普通成功 · Eff_FW_3 | Eff_FW_3.MDX | columnsemicircleedited1 | 在阈值分支捕获的目标点显示 0.8 秒 |
| A057 武圣成功 · Eff_FW_4 | Eff_FW_4.MDX | diamondcircle | 武圣成功使用独立地面模型，显示 0.8 秒 |
| A030 撼地神牛 · DoomDeath | DoomDeath.mdl | RuneAura | 目标头顶显示 1 秒 |
| A030 寒冬牛魔 · MCXX1 | MCXX1.mdx | magtheradoncubebypurgeandfire | 目标头顶显示 1 秒 |
| A037 黑暗契约 · superdarkflash | superdarkflash.mdx | Jeanne_Alter_Spell2 | 来源原点短时显示 1.5 秒 |
| A039 鱼人夜行者 · XiaoYuRenAtt | XiaoYuRenAtt | RuneAura | 目标头顶显示 1 秒 |
| 熊灵缠绕 · B136 | EntanglingRootsTarget.mdl | columnsemicircleedited1 | 受体原点束缚效果 |
| 熊灵狂猛 · B137 | RoarTarget.mdl | RuneAura | 实际收到狂猛的单位头顶 |
| 熊灵咆哮 · B138 | AIfbSpecialArt.mdl | dustwave | 仍受独立移动锁的受体头部 |
| A106 宙斯 · A106H031 | 22211.mdx | cloud | 提交地点固定显示 5 秒 |
| A106 众神之王 · A106G048 | ZSLY.MDX | cloud | 提交地点固定显示 10 秒，使用独立规格和绑定 |

本地清单缺少 T1837、Eff_FW_3、Eff_FW_4 和两件雷云原模型。已发现的 Bladestorm_Effect、BladeShockwave 欠缺具名贴图，因此使用上表的完整模型。雷云伤害由独立队列实现，两种外观均各执行十次脉冲。贴图、模型摘要、骨骼和片段通过资产测试，GPU 实际动作与正式场景证据仍待登记。

来源：[本地模型索引](rules/local-model-library.json) · [反击螺旋](rules/skill-counter-helix.md) · [淘汰之刃](rules/skill-culling-blade.md) · [宙斯技能](rules/zeus-skills.md)

H036 原 DruidoftheClaw 常态使用 Tauren Druid Final，E016 原同模型的 alternate 外观使用 Cairne1。n255、n256、n257、n258、n259、n260 的原 GrizzlyBear 原件均未见于本地索引，使用具有站立、攻击、死亡动作的 Wolf_ghost 完整本地替代，按六档原 UnitUI 缩放递增。

H009 的原 NagaMyrmidon 与 G044/S202 的 HeroSlardarKuroshio 未见于本地索引，分别采用具备完整站立、走动、攻击和死亡动作的 DragonSpawn 与 DragonSpawnArmoredDarkshade。

H006 的 FurbolgTracker 与 G037/S062 的 Model_XZS_10 未见于本地索引，分别使用完整 hulk 与 baihu。A024 独立伤害包的 1 秒头顶 Disenchant 使用 RuneAura。

H013 与斩击代理 q002 的 HeroChaosBladeMaster 使用 OrcMale3。G040/q020 的 Model_JS_1 使用 ZhangLiao，G041/q021 的 Model_JS_2 使用 ZhaoYun。B034 的 GeneralAuraTarget 使用 RuneAura。T051 的 AZ_jingzi_jiansheng01_F1 使用摆动弧 columnsemicircleedited5，G041 的 AZ_jianrenfengbao_bai 独立使用 diamondcircle；实际定点与显隐由战斗状态决定。

H007 原 HeroWarden 使用 Compa，G052/S152 原 HeroPADarkMoon 使用 Yami Darkness。A027 原特效缺本地原件，分别绑定 TauntCaster→RuneAura、PhantomAssassin_C1→columnsemicircleedited1、PhantomAssassin_C2→columnsemicircleedited5、PhantomAssassin_C3A→diamondcircle、AZ_PA_C→pulsing spellshielde11111。

H019 原 FelgaurdBlue 使用 xuhuang，G012/S012 原 Model_cy_1 使用 OrcMale3，G049/S013 原 Lus 使用 ZhangLiao（候选 aizen 的 ai1.blp 无任何可见 alpha），G054/S014 原 Inuyasha 缺贴图，使用 Yami Darkness。风暴之锤的三路 T055/T129/T148 分别使用 pulsing spellshielde11111、columnsemicircleedited5、dustwave4。B144 的 PurgeBuffTarget 与常态 A063 的 RoarCaster 使用 RuneAura。G049 的 AZ_TS_G3 与 AZ_TZFire 分别使用独立 fireglobe_e_003edited 与 fireglobe_e_003editedfire。

H001 的 sf.mdl 和 G053/S162 的 Hero_SF 本地原件未见，分别使用完整 IllidanDark 与 PurpleHeart。T001 原 UndeadDissipate 用 diremaulmagicvortex，T135 原 AZ_yingmo01_R 用 fenlie，T136 原 AZ_yingmo01_N 用 hagaracrystalpurple。

H016 原 Huntress 使用 moon_shin_GY，G074/S342 原 H006.mdx 使用 hero_moon。A054 常态 StarfallCaster 使用 diremaulmagicvortex，皮肤的 H036/H037 定义为 LunaCast/LunaPulse，使用 hagaracrystalpurple／RuneAura；神杖 T120 原 StormBoltMissile 使用 pulsing spellshielde11111。

H002 原 HeroNagaSeawitch 使用 Dragon_Priestess，G035/S042 原 Model_NJ_1 使用 DiaoChan，G043/S043 原 Model_NJ_2 使用 kikyou。分裂箭 A005/A097/A099 和 G043 专用 AZ_ShuiJingShiHua 各绑定本地替代，原始文件名逐条保存在绑定。

H015 先知原 MalFurionNoStag 使用 Tauren Druid Final，G055/S172 原 MalFurion 使用 WoWTaurenMale1。b100/b101/b102/b119/b120/b121 原 Ent 用 ForestTroll4，b144/b145/b146/b147/b148/b149 原 MFLASR 用 Tauren Druid Final，出生和 10 秒神杖辅助模板各保留独立 ID 及递增尺寸。A050 的 MassTeleportTarget 采用 RuneAura。

H052 原 HeroLich_V1 使用 DragonSpawnArmoredDarkshade，G076/S362 原 M166 使用 Yoshino。A198 DarkRitualTarget、A199 FrostArmorTarget／T1946、A200 T225 原 FrostWyrmMissile 逐 ID 登记本地替代。

H020 原 Banshee 使用 BlackHeart，G022/S022 由 Model_NVYAO_3 改用 DiaoChan。q011/q012 的原 PossessionMissile 路径缺本地原件，分别绑定 FaerieDragonBlue／Wolf_ghost。A064 的地穴虫群绑定本地 diremaulmagicvortex。

H014 原 KelThuzadGhost 使用 revan low size，G038/S072 原 Model_WYFS_11 使用 BlackHeart，G050/S073 原 HeroNEC 使用 IllidanDark。T031 死亡脉冲采用 RuneAura，皮肤 T133 采用 hagaracrystalpurple，T066 神杖锤采用 pulsing spellshielde11111。脉冲两分支按运行中追踪位置绘制。

H037 原 LordGarithos 使用 HordeRider，G062/S242 原 Model_JT1 使用 ZhaoYun。A132 原 overwhelmingodds 用 columnsemicircleedited5，A133 原 InnerFireTarget 用 pulsing spellshielde11111，决斗标记 JueDou 用 hagaracrystalpurple，G062 的 JueDouing 用 fenlie。各 ID 保留独立缩放、锚点和生命周期。

H003 原 TheCaptain 使用 DreneiPaladin，G077/S372 原 EragonSkin111 使用 ZhangLiao。E001/E002 用 VaanelBLIZZYseraDragon，E003/E004 用 DragonRedT，E005/E006 用 DragonAzurgoz，E023/E024 用 twighlightdragon0000，E025/E026 用 1Redcrystaldragon1，E027/E028 用 Sindragosa1。逐 ID 保留原字段、攻击类型、独立形态和高度。A008 原 AZ_HYHX 用 fireglobe_e_003editedfire，烈焰之鳞 bingpenhuo 用 hagaracrystalpurple。各固定火焰印记的 LargeBuildingFire1 用 fireglobe_e_003editedfire。

H034 原 HeadHunter 使用 Trollwuyi。A115 的 BreathOfFireDamage 使用 fireglobe_e_003editedfire 并追踪每个实际燃烧受体，活血术的 HuoXueShu 使用 RuneAura，A117 lifebreak 使用 dustwave4。

H023 原 HeroTinker 使用 GoblinAlchemist。T064 原 HeroTinkerRobot 使用有行走动画的 ZergicidAgent，爆炸 StampedeMissileDeath 使用 dustwave4。T067 的 TKJG 以通用战斗连线呈现，每段从实际上一段坐标发出。

H032 原 HeroGoblinAlchemist 使用 GoblinAlchemist，E010、E011、E012、E013、E014、E015 的 alternate 用 hulk，SuanWu 由 T102 绑定 cloud。酸雾面积随原 550 判定，素材按实际固定中心显示。

H043 原 Kiljaeden 使用 DragonSpawnArmoredDarkshade。E017、E018、E019、E020、E021、E022 原 DireWolf 使用 Wolf_ghost 原比例，b150、b151、b152、b153、b154、b155 原 Spiritwolf 使用 Wolf_ghost 0.6 比例，按实际召唤逐只显示 FeralSpiritTarget。

H047 原 RazorMane 使用 Tauren Druid Final。A182 原 FanOfKnivesCaster 使用 spike2 表示施法起点的针刺，T197 用 pulsing spellshielde11111 表示实际命中和硬控。

H046、q036 原 FirePandarenBrewmaster 使用 OrcMale3。G065、q043 原 Hero_EmberSpirit_Red 使用 ZhangLiao。A178、A178G065 用 ennergychains、ennergychainsedited。A179、A179G065 用 magtheradoncubebypurgeandfire、wfireslandbluee1。T012／T020 在实际攻击处用 fireglobe_e_003editedfire／fireglobe_e_003edited。q036、q043 与实际施放者使用 50% 材质透明度。

H056 原 Rexxar 用 Cairne1。q053 原 RexxarMissile 用 spike2 并逐柄沿实际取样位置移动。b162、b163、b164、b165、b166、b167 原 WarEagle 用 fireBird。b168、b169、b170、b171、b172、b173 原 QuillBeast 用 BAIHU。T269–T274 通过公共闪电显示实际跳跃。

H060 原 HeroPitLord 用 DragonSpawnArmoredDarkshade，G078 原 M717 用 IllidanDark。两形态 A233 分别用 fireglobe_e_003editedfire、wfireslandbluee1，T403 同火球按实际飞行位置显示。A234 用 ennergychainsedited；A235 原 GeneralAuraTarget 用 RuneAura。

H040 原 HeroDemonHunter 使用 IllidanDark，G068/S282 原 HeroAntiMage_bw 使用 Yami Darkness。A158 的 SpellBreakerAttack／AZ_D036 分别用 columnsemicircleedited1／Jeanne_Alter_Spell2，A160 的 enchantment／T664 用 RuneAura／diamondcircle，原 ID 和原路径保留。

H025 原 Proudmoore 使用 DreneiPaladin，G042/S102 原 Model_bhz 使用 xuhuang。T079 的亡灵船原件使用本地 catapultedited 的木质载体，T080 的鲨鱼原件使用长龙 DragonSinestra。洪流和潮汐的 ShuiDaoEffDef、AZ_Coco_E2_Blast、ShuiDaoHands 分别登记 dustwave4、diremaulmagicvortex、RuneAura。

H025／G042 受控证据在 `test/m3-kunkka.test.mjs`。覆盖洪流闭圆、两秒抬升与复载、潮汐实装斧优先及换形回充、未消费首个范围盾但独立眩晕消费盾、真神杖卸下后三船组及独立访问、光环到期。T079 木质载体由生成器添加单骨静态绑定，继续使用本地模型原有材质和 Stand 通道。

H026 原 ObsidianStatue 使用 Midgard，G069/S292 原 HeiYuHuiMieZhe 使用 FelOrcNetherDrake。A083 的 IllidanMissile 使用 pulsing spellshielde11111，A084 的 ReplenishManaCasterOverhead 使用 RuneAura，A085 原版 ShenZhiZhiShi 与皮肤 New_SZZS 分别使用 diremaulmagicvortex 和 hagaracrystalpurple。`test/m3-outworld.test.mjs` 的四项受控测试覆盖实付法球、单次恢复事件、真神杖 285 闭圆、精气光环 900 和 30/31 边界、S292 资源调整，以及两次独立 70 秒到期。

H051 原 Gyrocopter_V1 使用本地 newBRSbike，G080/S402 原 M157 使用 strike freedom。StealthBomber 候选缺 gyrocopter、CopterBladeBlur 等四份材质。T216／T217 原 tinkerrocketmissile_2／RocketMissile 分别使用 fireglobe_e_003edited／fireglobe_e_003editedfire。A197 的 calldown_flyup 与 calldown_flydown 绑定同两条弹体模型，jijie 绑定 RuneAura，calldown_4 绑定 diremaulmagicvortex，VolcanoMissile 绑定 fireglobe_e_003editedfire。素材检查覆盖全部绑定的材质和动画。

H028 原 DranaiAkama 使用 DreneiPaladin，G056/S182 原 DranaiA 使用 DragonSpawnArmoredDarkshade。T090 原 SentinelMissile、SJ_XF、T092 的 X003、追踪法术头顶 FaerieFireTarget 分别使用 columnsemicircleedited5、dustwave4、diremaulmagicvortex、RuneAura。五项受控测试见 `test/m3-bounty.test.mjs`，覆盖七次真实碰撞、先后两次盾判定、移动连续光环边界、实际神杖标记、另一塔真实击杀与按死亡时档位结算、原生自动开关和两项状态到期。

H055 原 WitchDoctor 使用 Trollwuyi；b156–b161 的 StasisTotem 使用 moriapillare，保留六档来源的相对缩放。T231 BottleMissile 绑定 pulsing spellshielde11111，A208 netherinferno 绑定 fireglobe_e_003editedfire，A209 的 UndeadMineCircle 和 FeralSpiritTarget 分别使用 RuneAura 和 pulsing spellshielde11111，N731 SerpentWardMissile 使用 columnsemicircleedited5。H055 原型没有皮肤资格。

H030 原 SkeletonMage 使用 revan low size，G060/S222 原 XiXueGui 使用 IllidanDark。A101 的 WispExplode／PsiWave 分别使用 dustwave4／diremaulmagicvortex。T098 的 SlowCaster 使用 RuneAura，q026 原模型为 `_`，形态及神杖双链使用现有连线显示。五项受控证据见 `test/m3-dreadlord.test.mjs`，包含两种延时、独立护盾命中、半物理与 1.5 倍法术、16 拍恢复、分身占用、真神杖交接、B100 实时转换和停止命令。

H041 原 SylvanusWindrunner 使用 kikyou，G072/S332 从本地审计库接入同名 Sinon。H119、T172 的 BallistaMissile、T260 的 qiangliji1、H120 分别使用 columnsemicircleedited1、columnsemicircleedited5、hagaracrystalpurple、RuneAura。素材检查通过。

H035 原 hellscream 使用本地 OrcMale3，无可达皮肤。T130 的 gaussgun 候选缺完整材质，使用 columnsemicircleedited5。T131 的 SlowCaster 使用 RuneAura，T132/T134 的 AIilTarget 使用 pulsing spellshielde11111。q029/q030 源载体不可见，呈现独立飞矛及本体镜像。五项 H035 受控证据在 `test/m3-phantom-lancer.test.mjs`。

H039 原 Priest_V1 使用 DreneiPaladin，G064/S252 原 SYZHeiAnJiaoZhang 使用 Yami Darkness。darkmending／HAJT1／fatesedict／falsepromise／HAJT3／shenYuZhe／HAJT2 分别使用 diremaulmagicvortex、dustwave4、pulsing spellshielde11111、RuneAura、hagaracrystalpurple、diamondcircle 与 magtheradoncubebypurgeandfire。

H045 原 OrcWarlockGuldan 使用 Thrall，G070/S312 原 HongPaoXianZhe 使用 ZhangLiao。q040 的 SpiritWalkerChange 使用 diremaulmagicvortex，q044 的 New_JuBian 使用 dustwave4，T188 使用 RuneAura 接源标记，T189 InfernalBirth 使用 fireglobe_e_003editedfire。n261–266 的 Infernal 使用 hulk 并保留原三级模型缩放。A175/T189 的 DataC 值为 1，按编辑器 Uin3 对应落地延时处理。四项受控证据在 `test/m3-warlock.test.mjs`，包含原先顺序的两次随机抽取、同点两次真实冲击、连续源做独立周期和重叠连接 25%。[编辑器数据映射](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/AbilityMetaData.slk#L2819) · [编辑器字段说明](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/UI/WorldEditStrings.txt#L5931)

H048 原 MagnataurBlue 使用 Tauren Druid Final，无可达皮肤。T205 的 ShockwaveMissile、T198 的 BloodlustTarget、T199 的 WarStompCaster 分别使用 dustwave4、RuneAura、pulsing spellshielde11111。

## H049 光之守卫、H050 暗夜魔王与 H053 黑暗贤者

| 内容 ID | 原图模型／角色 | 本地选型与原因 |
|---|---|---|
| H049、q063 | HeroArchMageGhost.mdl，光之守卫及两秒分身 | `revan low size`，原幽灵法师模型未收录，分身沿用相同轮廓，保持实际独立生命周期 |
| A189/A191 光球 | FarseerMissile.mdl，原施法方向前200 | `hagaracrystalpurple`，已审计球状特效，蓄力结束即移除，分身版独立2秒 |
| T207、T408 | illuminate.mdx，已收录模型缺 firering1A、Clouds8x8Grey、star2_32 原贴图 | `diremaulmagicvortex`，完整光效，跟随实际1500/秒波及路径1秒 |
| T409/B218 | InnerFireTarget.mdl，致盲标记 | `pulsing spellshielde11111`，跟随实际目标5秒，刷新或驱散后读现行状态 |
| T206、T211 施法表现 | AIimTarget.mdl，回蓝表现 | `RuneAura`，回蓝点表现。无本地完整同名素材 |
| H050、G071 | HeroDreadLord、Tichondrius.mdx | `IllidanDark`、`FelOrcNetherDrake`，分别保持深色恶魔剪影与变体区分。原模型未收录 |
| A192、A192G071 | DeathPactTarget.mdl、warpdarkcaster.mdx | `pulsing spellshielde11111`、`diremaulmagicvortex`，各对应日间本体与永久外观，原素材未收录 |
| A192Night、A192G071Night | devilslam.mdx、T659.mdx | `cloud`、`hagaracrystalpurple`，各读夜间分支，G071保留1.5倍外观倍率。原素材未收录 |
| H053 | DranaiMage.mdl | `DreneiPaladin`，保留德莱尼体型和法力色系。无可达永久外观 |

H049 受控释放、神杖交接、B218、查克拉冷却以 [h049-controlled.log](evidence/m3-foundation/h049-controlled.log) 为证。共享模型与纹理解码在 [h049-h050-assets.log](evidence/m3-foundation/h049-h050-assets.log)。q062/q064 原显示字段为 `_`，不再额外构造可见施法者。

## H053、H054、H057、H058 与 H061 额外表现

| 内容 ID | 原图模型／角色 | 本地选型与原因 |
|---|---|---|
| H053/A201、H053/A202 | staraura.mdx、newsoularmor.mdx | `RuneAura`、`pulsing spellshielde11111`，准确模型存在但缺少点名贴图，保持起手与附着效果分别显示 |
| H053/A203、H054/A204 | AZ_diangun01_F_fx2.mdx | `diremaulmagicvortex`，原模型未收录，等离子模型按当前实际来源及四段环形变化绘制 |
| H054 | Revenant.mdl | `revan low size`，原亡魂模型未收录，取深色能量角色 |
| H054/A205、q050 | BIZM，单位模型字段 `_` | 保留原链的来源和终点，用已有光束绘制，无独立单位模型 |
| H054/A206、q051 | ChimaeraLightningMissile.mdl，单位模型字段 `_` | `pulsing spellshielde11111`，从实际载体飞向目标，载体自身保持不可见 |
| H057 | SeaGiantGreen.mdl | `hulk`，保持绿巨人外形，原模型未收录 |
| H057/T276、T277、T279 | WaterElemental.mdl、CrushingWaveMissile.mdl、ImpaleMissTarget.mdl | `FaerieDragonBlue`、`diremaulmagicvortex`、`spike2`。原巨浪模型缺贴图，另两项未见完整源资产，分别保持飞行、波迹和首次击飞视觉 |
| H058、q055 | SeaElemental.mdl | `heishuixuanshe`，原水元素未收录，沿用深色水生轮廓及12步视觉轨迹 |
| G075、q058 | M235.mdx | `FaerieDragonBlue`，源模型未收录，保持与常态区分及相同旅行节拍 |
| A223/q055、q058 尾效 | NagaDeath.mdl、blackhole.mdx | `cloud`、`diremaulmagicvortex`，黑洞源模型贴图不全，两形态独立结束表现 |
| A223/T297 命中 | CarrionSwarmDamage.mdl | `diremaulmagicvortex`，源素材未收录，按真实波的命中位置登记半秒显示 |
| A224/T286 | CrushingWaveDamage.mdl | `pulsing spellshielde11111`，标记真实在途弹、命中表现。q056、q057 原字段均为 `_` |
| A225/T287、T288 | morph_str_1.mdl、morph_agi_1.mdl | `RuneAura`、`hagaracrystalpurple`，分别随力量／敏捷方向启停；原模型未收录 |
| H061 | ChaosWarlock.mdl | `Trollwuyi`，取直立施法者形态，源模型未收录 |
| H061/A236、A237、T405 飞弹、T405 命中 | ImpaleMissTarget.mdl、PolyMorphDoneGround.mdl、LightningBoltMissile.mdl、DemonBoltImpact.mdl | `spike2`、`pulsing spellshielde11111`、`lightningrod`、`fireglobe_e_003editedfire`，分别保留四段表现。妖术原绵羊 nsha 已有模型；q059 原单位模型字段为 `_` |
| H061/q061 | NumRight.MDX，序列 0–9 | 源模型未收录，场景使用可读的十个数字，沿真实爆发对应数值与到期 |

H054 的等离子读档、四段边缘、实际村正、静电累计与风暴末发见 [h054-controlled.log](evidence/m3-foundation/h054-controlled.log)。[H053/H054/H057 解码](evidence/m3-foundation/h053-h054-h057-assets.log) 和 [H058/H061 解码](evidence/m3-foundation/h058-h061-assets.log) 保留当前素材校验。


A237/T406 的动物源网格没有收录于本地库。精确内容 ID 与完整本地网格逐项登记如下，体型参数见生成工具。nsno（SnowOwl）用 `fireBird`，npig（Pig）用 `SiberianTigerGod`，nsea（Seal）用 `FaerieDragonBlue`，ncrb（SpiderCrab）用 `DragonSpawnArmoredDarkshade`，nhmc（HermitCrab）用 `DragonSpawn`，nrat（Rat）与 nrac（Raccoon）分别用不同大小的 `Wolf_ghost`，nfro（Frog）用 `heishuixuanshe`，necr（EasterRabbit）用 `BAIHU`，nsha／nshw（Sheep）共用 `FaerieDragonBlue`。施法实际读 T406 的原选择、目标层和时限。 [全量素材解码](evidence/m3-foundation/final-scope-asset-decoder.log) · [生成工具](../tools/build-m2-model-bindings.mjs)

普通塔光环源姿态逐项登记。N016 的 DrumsCasterHeal.mdl 使用完整 `diamondcircle`，N103 与 N104 的 TrueshotAura.mdl 共用 `RuneAura`，BOac、B017、B018 的 GeneralAuraTarget.mdl 共用 `pulsing spellshielde11111`。三种原模型均未收录于本地库。浏览器中发现按模型高度归一化会把平铺光环放到约 11.75／50.7 场景单位宽，改为各来源脚下约 1.85／2.08，各受体共用表现约 0.5。尺寸只改 N016／N103／N104 三个绑定。 [原比例画面](evidence/m3-preflight-83/troops/troop-aura-unscaled.png) · [核对后的画面](evidence/m3-preflight-83/troops/troop-aura-before-reload.png) · [浏览器恢复](evidence/m3-preflight-83/troops/browser.log)

H047 的 T204 原飞弹 CorrosiveBreathMissile.mdl 和 B149 原胸部 BottleImpact.mdl 缺本地原件。T204 用完整 `orb` 随实际追踪弹运动，B149 用完整 `cloud` 附在当时受体胸部并随真实状态清除。
