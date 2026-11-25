# 原生护甲与英雄经验：可采用规则及剩余验证边界

后续状态：Q23 已确认无可用原版环境，Q24 已接受有依据的明确 Web 规则。负甲底数、经验取整与事件提交时序的 Web 选择已记录在 [基准规格](web-baseline.md)；下文保留原始证据边界，不将这些选择改写为原版事实。

经验授予、分摊和升级/剥级时序现另见 [experience-sharing-v1](experience-sharing.md)，已区分原图字段、直接奖励与明确 Web 选择。下文较早的分摊待核记录仅保留调查背景，不撤销该页已定结果。

本轮只核护甲和经验递推，不实现游戏，也不扩展到其他原生技能。可以补齐**正护甲函数、伤害类别向量的列序、经验递推形式与升级阈值的累计含义**。仍需区分的两个核心细节是：自定义护甲系数是否改变负甲指数底数，以及经验递推在哪一步转为整数。它们各有很小的可辨别实验，不需要用户猜数值。

## 1. 证据范围与结论等级

|证据|能证明什么|不能证明什么|
|---|---|---|
|原图 [war3mapMisc.txt](../../reference/map-6.25/war3mapMisc.txt)、单位表、Lua/字节码|刀圈明确覆盖值、脚本乘除、事件调用|闭源引擎的内部取整、实际客户端补丁|
|暴雪 [Armor and Weapon Types](https://classic.battle.net/war3/basics/armorandweapontypes.shtml)、[Hero Basics](https://classic.battle.net/war3/basics/heroes.shtml)|原开发方公开的公式、默认曲线及经验分摊原则|刀圈使用的具体客户端/JAPI二进制|
|YDWE 原开发者仓库随附的 `Units/MiscGame.txt` 与 `Custom_V1/Units/MiscGame.txt`|可核对的游戏数据文件及其中的递推、列序注释；两份中相关公式和缺省 C 一致|不能把仓库分发的默认表称为本机实际客户端提取物|
|YDWE 自己的 `EventDamageData.cpp`|该版本扩展如何保存、读取和提交改写伤害|不能据此证明刀圈平台运行的JAPI就是这一二进制，也不能替代闭源护甲处理调用链|

本机只在仓库快照、`/Applications`、`~/Applications`、`~/Downloads`及其`maps`目录作了限定查找，发现原图和图鉴，未找到匹配客户端安装证据；没有全盘搜索、启动客户端或下载大型运行环境。`war3map.w3i`的format=25、editor=6052依然只作为地图元数据，不用于认定实际客户端版本。

外部源码固定到 YDWE commit `a69c315ebf2886ec54d66200707ab6e38bd3484d`。以下文件链接均指该提交，正文所写行号为原文件行号：

- [Units/MiscGame.txt](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/MiscGame.txt)：130–160行经验表/注释，180–192行护甲与类别列序。
- [Custom_V1/Units/MiscGame.txt](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Custom_V1/Units/MiscGame.txt)：同位置的自定义地图默认数据；NeedHeroXPFormulaC同样为0。
- [EventDamageData.cpp](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Plugin/Warcraft3/yd_jass_api/EventDamageData.cpp)：96–125、188–209行。

Warsmash、OpenRealm 等第三方引擎的实现属于参考资料。原版行为以客户端实测为证。

## 2. 正护甲：公式已能补齐

暴雪公开的正护甲减伤式为 `a*k/(1+a*k)`，官网用默认 `k=0.06` 展示；游戏数据把该参数命名为 `DefenseArmor`。刀圈在 [war3mapMisc.txt:21](../../reference/map-6.25/war3mapMisc.txt#L21) 明确改为 **0.018**。因此按原生公式和地图配置作静态推导，可采用以下护甲层函数，而不再保留成一个未知函数：[暴雪护甲公式](https://classic.battle.net/war3/basics/armorandweapontypes.shtml)，[原数据 DefenseArmor](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/MiscGame.txt#L180)。

```text
a >= 0:
    reduction(a) = 0.018*a / (1 + 0.018*a)
    damageMultiplier(a) = 1 / (1 + 0.018*a)
```

|护甲a|护甲层承伤倍率（推导）|
|---:|---:|
|0|1|
|10|0.8474576271|
|20|0.7352941176|
|100|0.3571428571|
|500|0.1|
|1000|0.0526315789|

适用边界：这是**进入护甲层的伤害**怎样受非负护甲缩放；不是整个 `anyUnitDamaged` 的最终结果，也没有证明所有 damage type 都经过此层。不要对脚本已经按事件伤害修改过的值再无条件乘一次。查询护甲使用原脚本的实数状态32，不先按UI显示取整。

### 2.1 类别向量索引也已补齐

原数据文件的作者注释明示 `DamageBonus*` 的8列顺序为：

```text
SMALL, MEDIUM, LARGE, FORT, NORMAL, HERO, DIVINE, NONE
```

所以刀圈的六条自定义向量可以对应到具体类别，不能把第五项`NORMAL`漏掉后错位。下面数值全部来自原图13–18行；列名来自原始数据注释。[列序来源](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/MiscGame.txt#L182)

|攻击类别键|SMALL|MEDIUM|LARGE|FORT|NORMAL|HERO|DIVINE|NONE|
|---|---:|---:|---:|---:|---:|---:|---:|---:|
|Chaos|1.25|0.75|2|0.35|0.70|0.70|0.05|1.00|
|Hero|1.25|0.75|2|0.35|0.70|0.70|0.05|1.40|
|Magic|1.25|0.75|2|0.35|0.70|0.70|0.05|0.80|
|Normal|1.25|0.75|2|0.35|0.70|0.70|0.05|1.20|
|Pierce|1.25|0.75|2|0.35|0.70|0.70|0.05|1.10|
|Spells|1.25|0.75|2|0.35|0.70|0.70|0.05|0.80|

`EtherealDamageBonus`的7列另有自己的顺序：`NORMAL, PIERCE, SIEGE, MAGIC, CHAOS, SPELLS, HERO`；刀圈24行对应`0,0,0,1.30,0,1.30,1.00`。这是向量释义，不向外扩展虚无技能规则。未覆盖的Siege向量不在本轮擅自定成某补丁默认值。[原始列序注释](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/MiscGame.txt#L191)

### 2.2 负护甲：官方默认式明确，自定义系数耦合仍缺一项证据

暴雪公布负护甲的**总承伤倍率**为 `2-0.94^(-a)`（a<0）。它不是“额外增加的比例”；例如a=-10得1.4613848859，即总承伤约146.14%。官网没有说明把`DefenseArmor`改为0.018时，这个0.94是否随之变成`1-0.018=0.982`。[暴雪负护甲公式](https://classic.battle.net/war3/basics/armorandweapontypes.shtml)

刀圈的物理事件分支另除以`G(a)`，函数已经在 [combat-and-skills.md](combat-and-skills.md) 中逐段核实，原始位置Lua110348–110375、111814–111847。G在-10为1.46，在-20及以下为1.71，明显近似官方0.94曲线的部分点，但这是**设计意图的支持证据**，不能替代证明。尤其G在-20之后封顶，而指数式继续增长，不能概括为“把所有负甲增伤完全抵消”。

剩余问题已缩小为两种可区分行为，不将二者任意选一个标为原图事实：

|护甲|0.94固定底数|随自定义系数变为0.982|
|---:|---:|---:|
|-1|1.06|1.018|
|-10|1.4613848859|1.1660982641|
|-20|1.7098937589|1.3046078949|
|-100|1.9979451252|1.8373894276|

两列仅为待辨别预测值。正甲已不需要为此一起搁置。

### 2.3 与伤害事件钩子的衔接

YDWE扩展作者的源码明确：`EXSetEventDamage`保存新值；后续`GetEventDamage`在已有改写时读该新值；命中伤害提交钩子时使用保存值替换参数。它支持现有文档中“事件链按顺序反复读写当前伤害”的解释。这个文件没有完整展开闭源原生护甲函数，亦未证明实际刀圈平台JAPI版本相同，故**本轮不能据此独自宣布A026与文字‘忽略护甲’是否数学等价**。[扩展原作者源码](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Plugin/Warcraft3/yd_jass_api/EventDamageData.cpp#L96)

## 3. 英雄经验：累计阈值及递推形式已能补齐

暴雪官网给出默认英雄升级累计经验2级200、3级500、4级900，以及普通单位击杀经验的递推。原始MiscGame注释将同一`f(n)=A*f(n-1)+B*n+C`定义用于三组`…FormulaA/B/C`。默认升级数据代入后，`500=200+100*3`、`900=500+100*4`，由此确定 **NeedHeroXP递推的是到达目标等级n的累计阈值**，不能再把每项累加一遍。[暴雪经验规则](https://classic.battle.net/war3/basics/heroes.shtml)，[原始递推注释](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/MiscGame.txt#L145)

地图覆盖值来自 [war3mapMisc.txt:30](../../reference/map-6.25/war3mapMisc.txt#L30)–49。未写出的`NeedHeroXPFormulaC`，在已核原始基础表和Custom_V1表都为0；因此可以把**标准数据合并下的C=0**作为有来源的静态补充值，而非凭印象猜值。仍应保留它来自默认表的出处；这里没有声称已识别实际平台客户端加载的所有补丁表。[Custom_V1默认C](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Custom_V1/Units/MiscGame.txt#L154)

```text
升级所需的累计经验，先写出取整前递推：
T(1) = 0
T(2) = 20
T(n) = 1.4*T(n-1) + 20*n + 0           n >= 3

击杀普通单位的基础经验，n为死者单位等级：
N(1) = 2
N(n) = 1.4*N(n-1) + 2*n                 n >= 2

击杀原生英雄的基础经验，n为死者英雄等级：
H(1) = 30
H(n) = 1.4*H(n-1) + 30*n                n >= 2
```

后三组`A/B/C`不是三项分别相加到面板经验；需按前一项递推。`GrantHeroXP`是否适用由原生英雄分类决定，不能用脚本自定义`UnitIsHero`（N534且SAPPER）或“Boss”名字代替。`n`也不是当前主线波号。表内明确列出的项先使用；超出表尾才使用递推。刀圈三张表都只明确写一个起点。

### 3.1 可核对的数值与整数边界

下列是十进制高精度计算出的**取整前数学值**，用于检查公式和定位实验点，不能冒充已验证的整型经验表：

|到达等级n|累计T(n)，不在中间取整|
|---:|---:|
|1|0|
|2|20|
|3|88|
|4|203.2|
|5|384.48|
|6|658.272|
|7|1061.5808|
|8|1646.21312|

暴雪示例明确展示最终比例奖励向下取整，但其示例递推系数为整数，无法辨别**递推表每项先转整数**还是**保持小数到最终阈值/奖励时才转换**。刀圈A=1.4让这一区别真正影响曲线，不能把那个示例扩大成“每轮递推floor”。这就是本轮剩余的经验数值缺口；无需再猜递推形式。[官方取整示例](https://classic.battle.net/war3/basics/heroes.shtml)

为了可复核，把几种竞争预测集中在8级：每步floor为1642；每步四舍五入为1645；先保持实数最后floor为1646；实数阈值与整数总经验直接比较则最少1647。此处是实验判别表，不是四套可任意选择的游戏设计。

### 3.2 经验范围、分摊与等级上限

可直接保留原图配置：`HeroExpRange=1600`、`GlobalExperience=0`、`BuildingKillsGiveExp=1`、`MaxHeroLevel=30`。原始数据注释说明范围围绕**死亡单位**；官方规则说明附近合格英雄之间平均分摊。结合开关的标准语义，Web应使用局部1600范围，不应仍采用默认全局经验兜底或“塔击杀不给经验”。这些是公式周围的已有约束，不将全图所有塔平均分经验。[地图29–44行](../../reference/map-6.25/war3mapMisc.txt#L29)，[原始范围注释](https://github.com/actboy168/YDWE/blob/a69c315ebf2886ec54d66200707ab6e38bd3484d/Development/Component/share/en-US/mpq/Units/MiscGame.txt#L92)，[官方分摊规则](https://classic.battle.net/war3/basics/heroes.shtml)

满级英雄是否仍占分母、召唤单位奖励缩放、各接收者最终取整次序，不从上述公式推出。已核默认文件中的候选参数是`MaxLevelHeroesDrainExp=1`、`SummonedKillFactor=0.5`，但地图没有显式覆盖；它们保留来源和适用边界，不将所有未写默认值一次性导入。本轮的确定公式不依赖先解决所有分摊边界。

游戏还存在脚本层等级限制：`Game_Mode!=2`且等级>20且没有B015时，`HeroLevelUpEvent`剥离超出20的等级；因此配置30不是所有阶段的无条件上限。此事实直接沿用原图Lua119190–119243，不由经验递推重新解释。直接`AddHeroXP`的道具/技能奖励也应保留其原触发，不改成一次击杀奖励。[升级事件](../../reference/map-6.25/main.readable.lua#L119190)

## 4. 最小验证方案：仅测剩余事实

本轮不运行客户端。后续只需在与原图兼容的已知客户端做一个隔离测试地图，保留相同Misc参数并记录客户端版本和数据集；不要修改原图存档。以下是验证说明，不是请求用户选择数值。

|目标|最小操作|能回答的问题|
|---|---|---|
|负甲系数耦合|同一目标以0、-1、-10护甲分别承受固定1000物理伤害；关闭全部地图事件增伤，攻击/护甲类别倍率固定1；读实际生命差|0.94固定还是0.982随k变化；两组在-10相差约295点，容易区分|
|正甲与事件提交位置|护甲0、100，记录伤害事件入口值、事件内`EXSetEventDamage(100)`后的再次读取值、实际生命差|公式得到的0.3571428571倍率落在事件前还是后，以及改写值是否又受护甲；须使用同一JAPI|
|升级递推取整|新建无等级限制脚本的英雄，各次使用独立新单位设置累计经验1641…1647，读`GetHeroLevel`/`GetHeroXP`；另核19/20、87/88|区分四种8级预测，且验证起点与累计索引；不用靠UI经验条估数|
|击杀奖励取整|独立英雄0经验，击杀Player(11)的等级2、3普通单位；先单英雄，再两个同级英雄同距站位；另一次所有英雄距死亡点>1600|区分基础奖励递推取整、分摊取整和GlobalExperience=0的实际无范围目标行为；关闭召唤、基地加成及额外奖励|

如果只能取得正式原图运行日志，至少同时记录护甲、攻击/护甲类别、所有事件修正与直接经验奖励；只有最终DPS或通关截图不足以反推出这些原生细节。

## 5. 本轮收束

可进入实现规则的内容：非负护甲层`1/(1+0.018a)`；两种类别向量的索引；经验的表尾递推；NeedHeroXP是累计阈值、从2级20起；标准默认C=0及其来源；地图范围、开关和脚本等级限制。

仍要验证的最小事实：负甲底数是否受k影响、经验中间取整、伤害事件与原生护甲的提交位置；分摊边界通过同一小测试补齐。这些条目仍待客户端实测，本轮采用已记录的 Web 规则。
