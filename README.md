# TD3 Web

M2 试玩发布说明：[Preview 1](docs/m2-preview-1.md)。发布成功后的入口为 [GitHub Pages](https://humandetail.github.io/dq/)，本版仍有已知内容缺口。

TD3 是按已提炼内容与已决 Web 规则开发的单人塔防。当前 M2 目标为新的魔兽式 3D 分岔循环地图、魔兽模型、19 条卡片塔系与 3 条工人塔系、完整绑定技能、装备成长及普通难度 55 波主线。范围、顺序和验收以 [M2 开发计划](docs/development-plan-m2.md)为准，当前预览尚未通过 M2 验收，差距见[开发记录](docs/m2-implementation.md)。

M1 是已交付的「灯湾环堤」十波主线与无尽样例；下述首页操作和重放说明适用于 M1。M2 开发预览入口为 `/m2.html`。网页使用 TypeScript、Vite 和 WebGL 2，存档保存在当前浏览器的 IndexedDB。

## 环境与启动

使用 Node.js 24.x（可用 `nvm use` 读取 `.nvmrc`）、npm 11.x 和最新版桌面 Chrome。从仓库根目录执行：

```sh
npm ci
npm run dev
```

在桌面浏览器打开终端显示的地址（默认 `http://127.0.0.1:5173/`）。等待三维战场和右侧操作面板出现。

## 开始游戏

1. 选择西侧阵位，建造浮标灯并升级。完成首波后可抽卡，在另一侧增设塔。
2. 在商店购买磨砂镜片和导光丝，在背包合成聚光环。选中一座塔即可装备。塔会自动攻击，也可以点击战场中的敌人指定目标，或使用「过载」短时强化普攻。
3. 十波全部清场后，选择「进入无尽」并沿用当前阵容。下一波首批入场时，圈内超过 24 容怪点会触发失败结算。
4. 使用战场下方按钮暂停或切换 1×/4×。同一浏览器打开同一地址时，会恢复最近一次成功保存的对局。失守后可以重开。

## 检查与构建

| 命令 | 用途 |
| --- | --- |
| `npm run typecheck` | 检查正式应用 TypeScript 类型 |
| `npm test` | 运行入口、内容配置、战斗时钟、经济和恢复测试；不替代 M2 整局验收 |
| `npm run build` | 生成 `dist/` 生产构建 |
| `npm run check` | 依次执行类型检查、测试和构建 |
| `python3 tools/check-m2-configuration.py` | 校验 M2 抽卡区间、开局顺序和物品索引 |
| `npm run preview` | 在本地预览已生成的 `dist/` |

GitHub Actions 在推送和拉取请求时执行 M2 配置校验、`npm ci` 和 `npm run check`。[CI 配置](.github/workflows/ci.yml)

## 重放对局

运行 `node checks/replay.mjs <轨迹.json>` 查看轨迹结束时的状态。轨迹填写随机种子、结束帧，以及按 `afterFrame` 排序的命令。命令在该帧处理完成后提交，常规指令从下一帧执行。

```json
{
  "seed": 1,
  "finalFrame": 370,
  "commands": [
    { "afterFrame": 0, "action": { "type": "build", "cardId": 1, "site": "west" } },
    { "afterFrame": 1, "action": { "type": "upgrade", "towerId": 2 } }
  ]
}
```

## M1 性能与存档对照

运行开发服务器后，在桌面 Chrome 打开 `/checks/m1-performance.html`。该验证页使用固定种子、近容怪上限的负载和相同输入轨迹，对照保存开启、关闭及 IndexedDB 读回后的玩法状态。完整运行需要约 10 分钟。`?quick` 可加速比对同帧结果，耗时数据以完整运行为准。

## 项目文档

- [M2 完整主线与公开 Web 交付计划](docs/development-plan-m2.md)
- [M2 开发记录与未完成项](docs/m2-implementation.md)
- [M2 配置定稿：卡池、装备、跨批边界与验收通过线](docs/m2-configuration.md)
- [M2 后移内容恢复批次与验收登记](docs/post-m2-backlog.md)
- [M1 原创内容与状态契约](docs/m1-content.md)
- [M1 开发验收报告](docs/m1-verification.md)
- [首战原型](prototypes/first-battle/README.md)
