# M2 指挥界面发布记录

2026-11-26 已发布 `m2-core-30-ui-1`。地址：https://humandetail.github.io/dq/ 。

提交：`ecc94e3aa2f4127d55f218912980d53e9c4a2f6e`；内容版本 `m2-core-30`，配置与存档格式沿用当前版本。

发布前：配置校验、运行覆盖清单校验、类型检查、158 个测试、生产构建通过。

GitHub Pages 部署和 Web checks 均成功。部署记录：https://github.com/humandetail/dq/actions/runs/45784710769 。线上 release.json 版本与提交一致，HTML、入口 JS、CSS 的 SHA-256 与清单一致。

线上使用隔离浏览器验证新界面、开局礼包与四选一、商店搜索和满背包购买拒绝、暂停及无横向溢出。实现与原本地交互验收见 [接入记录](m2-command-ui-integration.md)。

本次为阶段试玩更新，原 M2 内容与性能验收范围保持原有记录。
