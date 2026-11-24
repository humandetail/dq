# 原地图证据快照

这些文件用于复查规则，尚不是 Web 游戏数据模型或可直接执行的移植代码。文件哈希见 [manifest.json](manifest.json)。原始地图和图鉴均未修改。

- `scripts_main.lua`：从地图 `scripts\\main.lua` 提取的 Lua 5.3 字节码。
- `main.disasm`：unluac 对该字节码的反汇编，函数路径和指令是分支核对依据。
- `main.readable.lua`：反编译阅读稿，并把 UTF-8 十进制转义转换成中文。该稿已发现多处控制流错误，仅可用于导航，不能直接拿来执行或推断不合理分支。
- `waves-key-bytecode.txt`：波次文档引用的七个关键函数字节码片段，每行带完整反汇编的原行号，头部记录完整文件哈希。
- `units_*.slk`、`war3map.w3u/w3a/w3t`、`war3mapMisc.txt`、`units_*strings.txt`：直接提取的地图数据。JSON 为静态解码，保留对象 ID、原字段与增量；缺字段不补默认值。
- `war3map.w3e`、`war3map.wpm`：原地形与静态寻路文件，保留完整字节数据。
- `war3map.w3i`：地图信息原始数据；文件格式 25、保存次数 10605、编辑器版本字段 6052。该格式的头部没有独立的实际运行客户端版本字段，不能将编辑器版本当成已验证的运行环境。
- `war3map.j`：地图加载脚本，加载实际的 `scripts.main`，并提供部分平台及权重逻辑。

MPQ 提取使用 PKWARE 解压辅助 [python-dclimplode](https://github.com/cielavenir/python-dclimplode)，Lua 阅读稿与指令表由 [unluac](https://sourceforge.net/projects/unluac/) 生成。转换工具不能替代原客户端行为验证。

从这些快照重新读取单位表、提取战场矩形及路线初始化：

```sh
python3 tools/build_map_reference.py
```

命令从仓库根目录执行，只处理静态数据，不执行地图游戏脚本；已有 JSON 会与原 SLK 比较而不会静默覆盖。
