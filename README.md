# TD3 Web

TD3 是一款原创单人桌面塔防。M1 包含「灯湾环堤」的十波主线和无尽模式。网页使用 TypeScript、Vite 和 WebGL 2，存档保存在当前浏览器的 IndexedDB。

## 环境与启动

使用 Node.js 24.x（可用 `nvm use` 读取 `.nvmrc`）、npm 11.x 和最新版桌面 Chrome。从仓库根目录执行：

```sh
npm ci
npm run dev
```

在桌面浏览器打开终端显示的地址（默认 `http://127.0.0.1:5173/`）。等待三维战场和右侧操作面板出现。

## 开始游戏

1. 选择西侧阵位，建造浮标灯并升级。完成首波后可抽卡，在另一侧增设塔。
2. 在商店购买磨砂镜片和导光丝，在背包合成聚光环。选中一座塔即可装备。塔会自动攻击，也可以点击战场中的敌人指定目标。
3. 十波全部清场后，选择「进入无尽」并沿用当前阵容。下一波首批入场时，圈内超过 24 容怪点会触发失败结算。
4. 使用战场下方按钮暂停或切换 1×/4×。同一浏览器打开同一地址时，会恢复最近一次成功保存的对局。失守后可以重开。

## 检查与构建

| 命令 | 用途 |
| --- | --- |
| `npm run typecheck` | 检查正式应用 TypeScript 类型 |
| `npm test` | 运行入口、原创配置、战斗时钟、经济和恢复测试 |
| `npm run build` | 生成 `dist/` 生产构建 |
| `npm run check` | 依次执行类型检查、测试和构建 |
| `npm run preview` | 在本地预览已生成的 `dist/` |

GitHub Actions 在推送和拉取请求时执行 `npm ci` 和同一条 `npm run check`。[CI 配置](.github/workflows/ci.yml)

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

## 项目文档

- [M1 原创内容与状态契约](docs/m1-content.md)
- [M1 开发验收报告](docs/m1-verification.md)
- [首战原型](prototypes/first-battle/README.md)
