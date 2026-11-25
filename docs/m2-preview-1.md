# M2 Preview 1 试玩发布

版本：`m2-preview-1`；内容 `m2-core-12`，配置 `m2-config-1`，地图 `m2-map-5`，存档格式 2。此版是公开试玩，不是完整 M2 验收通过版。性能按用户决定暂时放行，不登记为实测达标。

## 试玩

目标地址为 https://humandetail.github.io/dq/ ，首页跳转到 `m2.html`。首次部署成功后可访问。建议桌面 Chrome 和 WebGL 2。使用特制橙卡，四选一后选择塔卡，在浅绿色建造区放塔；工人塔、学习、商店、合成、暂停和倍速均可从界面操作。

存档只在当前浏览器、当前网站源保存，本地开发、旧临时隧道与 GitHub Pages 的存档不互通。不要清除网站数据以免丢档。刷新或关闭后同址打开可续局；第二个标签为只读，写者关闭后可接管。旧地图不兼容档保留并提示重开。

## 已知限制

完整技能／装备／神杖／形态联动仍有缺口，灵兽独立移动与寻路未完成。部分永久权益实际效果、部分模型攻击／死亡动作未完成，手机尚未完整适配。详见第三轮验收报告。不要把当前预览成绩等同于最终平衡或完整内容保证。

## 重建与部署

源码发布到 `main`，准备分支为 `codex/m2-preview-1`。执行 `npm ci`、配置检查、`npm run check`、`node tools/prepare-pages.mjs`，将整个 `dist/` 同源发布。Vite 使用相对资源路径，适配 `/dq/` 子目录。`.github/workflows/pages.yml` 在 main 推送后自动检查并部署，遵守 github-pages 环境允许 main 发布的规则；仓库 Settings → Pages 的 Source 应设为 GitHub Actions。`m2-preview-1` 标签固定试玩源码；其后的部署配置提交不改变游戏内容。

`release.json` 记录构建的源码提交和逐文件摘要。发布标签对应可重建源码；构建内容或玩法变化后应重新验收，不复用旧构建摘要。发布包包含全部模型、贴图与依赖，不要求玩家手选文件。

## 回退

在独立工作目录检出上一发布标签，按相同步骤重建，将该版本工作流部署到同一个 Pages 站点。回退前核对存档版本、内容兼容范围和地图版本；不兼容时保留旧记录并提示，不能清空或静默覆盖。本次为首个 M2 Pages 试玩版本，暂无上一 Pages 试玩版本可回退；此段是后续操作方案，不是已通过回退演练的声明。

## 实际发布结果

GitHub Pages 已上线：https://humandetail.github.io/dq/ 。部署源码为 `f069211a79f117ee959fadf52b6ac8866d5e943c`，对应 [成功部署](https://github.com/humandetail/dq/actions/runs/45580502229)。云端 69 项测试、类型检查、生产构建与配置检查通过。线上首页、M2 页面和主 JS 与本地逐字节相同。隔离 Chrome 从 HTTPS 走正常开局、建造，验证模型贴图、Attack／Walk 帧、第二波敌人和抽卡建塔，未发现运行异常。这是试玩冒烟，不是完整 M2 整局验收。

[线上浏览器记录](evidence/m2-preview-1/online-browser.json) · [版本与字节校验](evidence/m2-preview-1/deployment-verification.json)。性能保留用户暂时放行决定。
