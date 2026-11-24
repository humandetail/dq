# 桌面 M1 修订验收记录

验收对象为本包 `web/` 的 `m1-2` 桌面游戏，与上一个 `m1-2` 修订候选的游戏文件逐字节一致。额外随包提供 [存档备份与恢复工具](../checks/m1-save-tools.html)、离线规则资料和本次验证脚本。验收环境为 Intel Core i5-1038NG7 MacBook Pro、macOS 15.7.9、无头桌面 Chrome 158、Node.js 24。验收范围与通过线见 [M1 开发计划](development-plan-m1.md#v1-性能验证的计划通过线)。

## 1× 整局

全程保持 1×，通过正式界面完成建造、升级、抽卡、购买、合成并装备。合成并装备后剩余 2 金币。第 6064 帧完成十波主线，游戏用时 606.4 秒，从首个建造输入到读取胜利存档历时 606.3 秒。主线结算刷新后恢复，进入无尽后在第 6714 帧暂停并刷新，读回同一对局、同一帧及暂停状态。

无尽连续完成 12 波，第 14 波首批入场时达到 28 容怪点，在第 12114 帧判负。待算帧和后续出怪清零。刷新仍显示失败，重开获得新对局和 100 金币。全程现实用时 1213.2 秒，运行期间无页面脚本异常。
[整局实测](../evidence/desktop-full-1x.json)

## 正式 3D 界面长时性能

使用 1440 × 900 的两个独立测试浏览器并行运行。同一台机器上，两组分别经过 600.011 秒和 600.008 秒。每组均确认并结算 479 条 UI 指令，无重复或丢失。保存组有 743 次 IndexedDB 成功提交，结束快照约 38 KB。两个浏览器各进行了超过 12,600 次 3D 绘制调用。

| 指标（毫秒） | 保存开 P95 / P99 | 保存关 P95 / P99 |
| --- | ---: | ---: |
| UI 输入到 DOM 确认 | 0.6 / 1.6 | 0.6 / 1.2 |
| UI 输入到逻辑结果 | 46.7 / 72.8 | 58.1 / 85.2 |
| 单逻辑帧处理 | 0.2 / 0.6 | 0.2 / 0.5 |
| 快照复制并交给保存队列 | 1.5 / 2.6 | — |
| 捕获到 IndexedDB 提交完成 | 44.8 / 103.6 | — |
| 3D 场景绘制调用 | 3.4 / 6.1 | 3.1 / 5.7 |

输入确认达到 P95 ≤ 100 ms、P99 ≤ 200 ms、保存开启的 P95 增量 ≤ 20 ms。包含启动阶段的待算帧峰值为开 52、关 29，稳定期每分钟抽查为 0–2 帧。每组按实际受理帧和全部指令独立重放，结束状态逐字段一致。墙钟执行的两组入队帧会随调度变化，完全同帧输入的保存开关与 IndexedDB 读回一致性仍由原有固定轨迹的 600 条命令对照证据覆盖。
[本次性能汇总](../evidence/desktop-performance-summary.json) · [一分钟抽样](../evidence/desktop-performance-backlog.json) · [保存开原始轨迹](../evidence/desktop-performance-on.json) · [保存关原始轨迹](../evidence/desktop-performance-off.json) · [固定输入同帧对照](../evidence/v1-fixed-input.json)

## 冻结 5 分钟后的 4× 补算

在生产页面用 Chrome 生命周期命令冻结 300.013 秒，随后结束冻结并把同一标签页切回可见状态。冻结前为 4×、空阵容。独立对局核心从同一初始状态逐帧推进，预计在第 2000 帧因第 4 波首批入场达到 34 容怪点判负。恢复后实测界面显示「防线失守」，IndexedDB 约 516 ms 时读回同一判负帧，未来事件与待算帧均为 0。
[生命周期与判负实测](../evidence/desktop-freeze-5m.json)

无头 Chrome 通过生命周期命令结束冻结后可能仍将标签页标为隐藏。本项通过切回标签页验证实际回前台补算，时间从结束冻结命令前算至首次读到已提交的失败快照。

## 复跑方法

在包根目录启动普通静态服务。以下命令在 `source/` 执行，各浏览器脚本使用独立的临时 Chrome 配置文件。

```sh
npm ci
npm run check
node checks/m1-desktop-full.mjs http://127.0.0.1:4174/
node checks/m1-desktop-freeze.mjs http://127.0.0.1:4174/
node checks/m1-desktop-rollback.mjs /absolute/path/to/TD3-M1-v0.1.0/web
```

3D 性能验证从同一源码构建测试专用产物。用两份干净 Chrome 配置分别启动保存开、保存关两组。两组使用同一初始快照与相同阵位轮换，每组按 4× 墙钟运行 10 分钟。夹具在四座满级塔上装备聚光环，并延长敌人寿命，维持 23 个在场容怪点。脚本点击正式 UI 的「过载」按钮，分别记录正式反馈元素的 DOM 确认和逻辑结果。保存开启组使用真实 IndexedDB。保存关闭组跳过保存调用。逻辑帧、快照复制及提交、3D 场景绘制提交分别采样。测试构建与正式发布文件分开。

```sh
node checks/build-m1-desktop-performance.mjs /tmp/td3-m1-desktop-performance
python3 -m http.server 41992 --bind 127.0.0.1 --directory /tmp/td3-m1-desktop-performance
```

在另两个终端的 `source/` 目录运行两组，并从同目录复核阈值和逐条重放。

```sh
node checks/m1-desktop-performance.mjs on http://127.0.0.1:41992/ > /tmp/td3-on.json
node checks/m1-desktop-performance.mjs off http://127.0.0.1:41992/ > /tmp/td3-off.json
node checks/verify-m1-desktop-performance.mjs /tmp/td3-on.json /tmp/td3-off.json
```

## 构建与交接资料

Node.js 24.22.1、npm 11.19.1 下通过类型检查、13 项自动测试和生产构建。重建结果与包内游戏静态文件逐字节一致。 [构建校验记录](../evidence/desktop-build.json)

- 从 [启动说明](m1-v0.1.1.md)进入规则、图鉴、验收证据和存档回退步骤。规则索引、ADR、审计脚本和现有原图提取件保留原目录关系。
- 默认使用 4174 试用，旧版默认使用 4173。启动说明给出下载旧档、跨端口恢复以及同地址回退步骤。
- 包内工具在实际 `v0.1.0 → m1-2 → v0.1.0` 同地址流程通过验证。恢复后旧版读回同一快照、1 座塔和 75 金币。损坏备份被拒绝，取消覆盖保留了现有存档。 [回退实测](../evidence/desktop-save-rollback.json)
