# TD3 Web

P5 正式 Web 应用使用 TypeScript 和 Vite。页面入口是 `index.html`，浏览器启动代码位于 `src/main.ts`。首战原型提供架构验证记录和独立运行说明。[首战原型](prototypes/first-battle/README.md)

## 环境与启动

使用 Node.js 24.x（可用 `nvm use` 读取 `.nvmrc`）、npm 11.x 和最新版桌面 Chrome。从仓库根目录执行：

```sh
npm ci
npm run dev
```

在桌面浏览器打开终端显示的地址（默认 `http://127.0.0.1:5173/`）。页面显示「应用已启动」即完成启动检查。

## 检查与构建

| 命令 | 用途 |
| --- | --- |
| `npm run typecheck` | 检查正式应用 TypeScript 类型 |
| `npm test` | 运行 Vite 应用入口冒烟测试 |
| `npm run build` | 生成 `dist/` 生产构建 |
| `npm run check` | 依次执行类型检查、测试和构建 |
| `npm run preview` | 在本地预览已生成的 `dist/` |

GitHub Actions 在推送和拉取请求时执行 `npm ci` 和同一条 `npm run check`。[CI 配置](.github/workflows/ci.yml)

## 本地项目文档

- 需求基线 v1.0（G3）：`docs/web-port-design.md`
- 首个里程碑架构评审：`docs/architecture-review-m1.md`
- 首个里程碑开发计划（G6）：`docs/development-plan-m1.md`
