# 6.25 原图素材接入

来源为已校验的 6.25 原图档案和 Downloads 中的提取备份。逐档案项状态见 [素材覆盖清单](m3-original-assets-coverage.csv)。[对象绑定记录](m3-original-assets-bindings.json)记录模型路径、缺失依赖和已接入文件。

| 项目 | 实现 |
| --- | --- |
| 地表 | 使用 Ngrs、Lrok、Ywmb 三张原贴图。按 W3E 四角材质和图集变体合成地表，原寻路网格继续提供建造区遮罩。[图集索引依据](https://github.com/Retera/WarsmashModEngine/blob/main/core/src/com/etheller/warsmash/viewer5/handlers/w3x/environment/Terrain.java#L829) |
| 装饰 | 原树、植被模型继续按原坐标绘制。D006 的 56 处落叶使用源模型所引用的 shuye.blp，D007 的 87 处光效使用包内 GenericGlow64.blp。Web 粒子用这两张图近似，源模型仍缺外部贴图。 |
| 模型 | 58 个通过导入预检的原模型替换 75 条角色、外观和特效绑定。依赖、动作或解码有阻塞的对象沿用现有素材。 |
| 界面 | 自定义面板、开局选择、等级卡框、技能槽、购买按钮状态、赛季任务和伤害显示使用原图素材。 |
| 音频 | 主线音乐 BG_1 在「对局」中手动开启和静音。BG_2、BG_3 和海妖之歌对应深渊流程。两份具名奖励音效对应原图的赛季奖励展示单位。其余四份音频尚未核实原始名称和触发点。 |

## 验收

- `npm run check` 通过类型检查、494 项测试和生产构建。配置和运行覆盖清单通过结构校验。
- 58 个原模型通过 WebGL 加载、现有动作入口和 GL 错误检查。
- 生产包通过原地表、落叶和光效实例、背景音乐开关、建造边界、首波出怪、双指手势和旧地图存档保留验收。
- 生产包通过开局原面板及卡框、四选一、手机物品栏、重复选择防护和刷新续局验收。

从已提取目录重新生成素材和逐项索引，在仓库根目录执行以下命令，把目录参数替换成备份位置：

```sh
node tools/import-original-assets.mjs '/path/to/刀圈TD 6.25 原图素材'
python3 tools/build-original-asset-coverage.py '/path/to/刀圈TD 6.25 原图素材'
python3 tools/check-m3-configuration.py --write
node tools/check-m3-runtime-coverage.mjs --complete --object-ledger docs/m3-object-status.json
```

导入脚本使用仓库已有的 war3-model 解码器。TGA 转换使用 macOS 的 sips。
