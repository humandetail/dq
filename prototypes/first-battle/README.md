# 首个战斗验证场景

本地原型覆盖战斗时序、IndexedDB 续局与 MDX/BLP 模型显示。

从仓库根目录启动。

```sh
npm --prefix prototypes/first-battle ci
npm --prefix prototypes/first-battle run dev
```

打开终端显示的本地地址。分别点击 `1×`、`4×`、`模拟后台补算` 和 `第 1 帧存档并刷新`。四次应得到相同的事件顺序与最终状态，均在第 8 帧胜利。`反例 · 不攻击` 保留旧怪，应在第 2 帧下一波刷出时以 2/1 判负。首批出怪后立即检查圈内点数，等于上限时继续；同一波后续批次不会触发检查。

在文件选择器中同时选择本机的 `Yoshino.MDx`、`Yoshino.blp` 和 `YoshinoMagic.blp`。用 `播放攻击动画` 和 `切换塔模型` 检查表现，也可点击塔或敌人验证选中。刷新后需要重新选择预览模型。

`npm --prefix prototypes/first-battle run check:battle` 运行帧循环、购买合成和无尽生命周期探针。`npm --prefix prototypes/first-battle run check` 检查类型，`npm --prefix prototypes/first-battle run build` 构建页面。开发服务器中的 `/checks/storage.html` 可直接运行实际 IndexedDB 中止、保存合并和重开交接检查。
