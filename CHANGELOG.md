# Changelog

## Unreleased

### v1.6.7

- **适配：DSH `0.1.5-rc.1`**——逐项核对新版客户端面，源码零改动：客户端 shell 模块表仍内置 `@deepseek-ai/dsh-client-store`（`defineStore({ init, actions })` 形状不变）与 `@deepseek-ai/dsh-client-ui-slots`（`ctx.slots.inject/register` 槽位协议不变）；`ctx.theme`（`getTheme().active.colorScheme`、`theme/change`）与 `overrideTokens(source, tokens)` 的 `{ light, dark }` 成对值校验同现签名一致（主题本就按成对值编写）；`ctx.locale.register/bind`、`ctx.settingsScope.bind`、服务端 `settings.register(ns, schema)`、`@deepseek-ai/dsh-invariants` 的 `InvariantInstaller` 全部未变；`dsh.bundle.patch`（cordis.patch.yml）与 `dsh.client`（platform/inject）声明机制仍在；主题覆盖的 `--dsw-alias-*` 别名 token 在新版样式表中全部存在；schemastery 同为 3.18.2。peerDependencies 升级为 `^0.1.5-rc.2`（semver 的 prerelease 匹配规则使 `^0.1.2-rc.1` 不满足 0.1.5-rc.2——prerelease 只匹配同 `[major, minor, patch]` 元组；peer 均为 optional，旧宿主下解析失败也不阻塞安装），README 适配版本标注同步

### v1.6.6

- **修复：设置/插件市场面板内的 tooltip 被钉位夹进 256px 侧栏列**——插件卡片下载量/星星数的精确数字气泡（`[role=tooltip]`，视口锚定）挂在市场面板（侧栏列的 DOM 后代、`position:relative` 页面级浮层）里，而 bubble-anchor 的"展开侧栏"分支把栏内所有气泡一律强制"触发器下方+夹紧进列边框盒 ±8px"——触发器在列外数百 px 时气泡被右缘夹紧规则钉到列边（实测距触发器 -246px 且上下翻转）。修复：对话框内的气泡排除出该分支，走通用触发器锚定配方——钉位的增量校正式（实测当前框→抵消残差）天然抵消其容器型包含块的静态偏移，视口夹紧与应用自身一致；实测气泡精确居中触发器上方（-246px → -5px），侧栏按钮气泡的原有行为（下方+列内）不变
- **修复：浮动布局表头偏移硬编码**——悬浮表头下的滚动正文用写死的 `margin-top: -95px; padding-top: 107px`（恰好 = 12px 边距 + 当前表高 83px + 12px 间隙），表头高度随主题自己的字体旋钮、会话标题换行、Host 更新而变化，一变正文就钻到表头下或露出空隙。修复：stamper 每次盖章通道实测 `[data-phase] header` 高度写入 `--dsh-aqua-header-h`（无表头的 hero 态摘除变量），样式表派生计算 `calc(-12px - var(--dsh-aqua-header-h))` / `calc(var(--dsh-aqua-header-h) + 24px)`；实测表头 +30px 模拟，变量与两处偏移自动跟随并精确还原

### v1.6.5

- **修复：切换会话瞬间主输入栏玻璃整栏变透明（两层机制）**——其一，玻璃板（盖章的非 hero 输入栏）原先 gated 在 `:has([data-dsh-stats])` 上，会话数据异步加载使 stats 行晚于 composer 挂载，数据到达瞬间融合规则翻真、模糊所有权同帧换手：卡片自己的 `::before` 模糊被 `display:none` 销毁、玻璃板的模糊层同帧新建，Chromium 对新建 backdrop 层当帧背板未就绪 → 整栏无模糊一帧（低 frost 下读作全透明）。修复：模糊所有权从挂载起固定——盖章的非 hero 输入栏**始终**是玻璃板（填充+模糊+边框），`:has` 门控全部移除，stats 行只是异步停靠进已存在的玻璃，任何时刻不再换手；hero 新会话态保持原卡片玻璃
- **修复：composer/stats 挂载的盖章滞后窗口**——盖章 pass 走 rAF 合并批次，composer 重挂载（切会话/初次加载）后新包装器可滞后 1-2 个绘制帧才拿到 `data-dsh-inputbar`，玻璃归属晚一帧同样触发换手。修复：stamper 在 MutationObserver 回调内检测到 composer 卡片或 stats dock 插入时**同步**跑完整盖章（稀有事件，流式批次只付廉价的 per-node 探测），玻璃所有者从首个绘制帧起就位
- **修复：移除 phase/view 容器级入场透明度动画**——点击"新建会话"（active→hero）时 phase 根整体重挂载，`dsh-aqua-hero-in`/`dsh-aqua-active-in`/`dsh-aqua-view-in`（0.26-0.32s 透明度 0→1）随之重放，实测新 phase 根挂载后 opacity=0：整个画面连同输入卡一起从透明淡入（与对话框入场动画因同类问题移除的先例一致——opacity<1 的分组还是临时 backdrop root）。移除三个容器级淡入及 keyframes，消息行/工具行等个体入场保留；实测新建会话、hero↔active 双向切换 phase 根零透明度下降、零动画重放
- **修复：嵌套面板辉光跟随（"新会话"按钮矩形外的辉光卡住）**——侧栏列与"新会话"按钮是嵌套的两个 spot（按钮经 `data-dsh-surface` 也带 spot 章），悬停按钮时会话切到内层、onMove 只写内层自己的辉光叠层，外层侧栏的径向渐变冻结在进入前的位置。修复：新增 `ancestorSpots` + 辉光链——会话面板及其全部 spot 祖先的径向都随光标重写（各自坐标系）；pointerout 按 relatedTarget 感知交接，链上被来者覆盖的面板保持绘制（嵌套交接零闪烁）；keeper 刷新/辉光开关翻转/清理路径全链覆盖；侧栏弹窗强制释放只剥被悬停面板的标记。实测：按钮内移动侧栏径向同步跟随、双向交接无闪烁、离开清理干净

### v1.6.4

- **修复：点击输入栏统计按钮时背景流体卡顿**——body 级弹层（用量/用时/上下文面板）每次开与关都全局翻转 `<html>` 的 `data-dsh-popover-live`（裁剪开关总闸），把所有倾斜窗格子树标脏，实测强制 ~90ms 样式重算+重排（trace 两次归因于 stamper 的 popover 循环），流体 30fps 一次停 3-4 帧。修复：翻转收窄到真正位于 spot 内部的弹层（`el.closest('[data-dsh-aqua-spot]')`）——overflow 裁剪只可能影响 spot 自己的后代，body 级门户弹层永远不会被裁剪、无须翻闸；A/B 实测预置闸后长任务归零，设置对话框（侧栏内）的豁免行为完整保留
- **修复：主输入栏倾斜导致右侧滚动条反复闪现、流式输出中出现意外滚动条**——中心支点的 scale(1.01)+透视旋转把窗格投影盒推出聊天滚动容器底缘 ~1px，`scrollHeight` 越界 1px 翻出滚动条（8px 槽宽），布局移动又触发重新测量/再倾斜——反复闪现的反馈回路；指针停在栏上（刚点完发送）时流式内容涨满即触发。修复：支点保持原配方中心，变换附加**最坏情况补偿上移**（scale 项 + 角点项 + 余量 ≈1.45px），投影盒几何上不再越过布局底缘；实测满值倾斜下投影底缘 −0.46px，倾角/缩放/支点与官方配方完全一致，~1.5px 整体上移不可分辨
- **修复：滚动输入栏"指令"/"模型"列表时背景消息跟着滚**——两种穿透：指令列表滚到边界后剩余滚动链给背后的聊天滚动容器；模型菜单（overflow:hidden 且内容不溢出、从不滚动）被滚动链整个跳过，滚轮直接命中背景。修复：新增 scroll-guard（document 级非被动 wheel 监听，随主题层挂载）——事件目标在弹层表面内时，从目标向上走到弹层根，任何真实滚动器能消费位移就放行，否则 `preventDefault` 终结滚动链；CSS 侧再给弹层表面补 `overscroll-behavior: contain` 兜底。实测：菜单上滚轮拦截、列表中部放行、列表到边界拦截、弹层外滚动不受影响
- **修复：浅色模式下"上下文已用"弹窗与"用量账本"面板过暗**——两者都走插件对话框通用规则 5b，其浅色填充烘焙的是旧版宿主遮罩的灰色仿制值 rgba(185,187,191,.886)，坐在暗色流体上读作灰黑面板。改为设置页面板自身的白 rgba(246,248,252,.955)（alpha 提到 .955 保证暗背景上仍读白，留 4.5% 透出维持玻璃层次）——规则本身是 `[role=dialog]:not([class*='VOzbGW_'])` 的通用族选择器，未来任何插件/锚定面板自动获得同样的白；暗色填充不变
- **调整：打开设置页时背景模糊加深一档**——设置面板背后的磨砂玻璃就是侧栏 `::before`，面板打开期间（`:has([role=dialog])` 门控）模糊变为旋钮值 ×1.4（20px→28px），关闭即恢复；平时侧栏玻璃不变
- **新增："回到底部"药丸玻璃化**——向上滚动后浮在输入栏右上角的一键回底按钮（`button[class*='toBottom']`）直接复用主输入栏的玻璃配方：同一 glass-card token（随 frost 旋钮）+ 同一模糊旋钮 + 同款发丝边/内高光/落影，保留 stock 的 100px 药丸形
- **新增："回到底部"药丸悬浮反馈**——填充沿玻璃配方提亮一档（白 42%→58%×frost、深 rgb(54 58 70) 50%→68%×frost），补主题悬停光的柔和蓝晕与内环，0.15s 过渡
- **修复：对话框内部的 tooltip 恢复应用本意钉位**——"收起侧边栏"下方钉位规则误伤了渲染在侧栏列内的设置对话框（插件市场"？"按钮气泡被挪位）；下方钉位豁免 `[role=dialog]` 内部——对话框打开时 keeper 本就释放侧栏 transform，应用自身的定位已经正确，主题不重新安置
- **调整：背景流体与用户操作完全解耦**——删除 fluid-interactions（按钮悬停搅动 + 点击涟漪），流体不再受任何用户操作影响
- **修复：浅色模式 Agent 预设选中卡缺少视觉反馈**——stock 用强调色淡染标记选中，在玻璃上不可辨；选中卡补强调色描边 + 光晕（border-color 与 box-shadow 双写，box-shadow 胜过 stock 的强覆盖规则）

### v1.6.3

- **修复：展开侧边栏时鼠标辉光卡住（指针不动的话）**——两层缺陷叠加：①辉光/倾斜几何只在 childList 变更或窗口 resize 时刷新（overlay keeper 的两个喂源），而侧栏展开是轨道 grid 模板滑动——纯样式变更，静止的指针既不发 pointermove 也不触发 childList，会话几何冻结在进入帧；② keeper 刷新会用新会话对象取代旧会话，入口排队的那次 paint 被 stale-session 守卫丢弃，而刷新重画 radial 依赖 lastPointer——`onOver` 建会话时从不写它（等第一次 pointermove），静止指针下 radial 永远画不出来/停在过期盒上。修复：keeper 给每个 spot 挂 ResizeObserver（observe-on-first-tick，新 stamp 的面板自动覆盖），面板盒变化走同一 rAF 合并通道喂刷新；`onOver` 建会话即写入口坐标进 lastPointer，刷新重画永远有位可用。实测（合成 hover + 全程零 pointermove）：radial 全程在画（17/17 采样）、辉光盒宽度跟随列宽 32→256，中途还把过期的 56px 盒修正到 32px
- **修复：侧边栏收/展动画图标飞出列外（两个方向）**——逐帧采样 + 溢出规则普查定位到真因：v1.4.5 的幻影溢出开关给所有倾斜面板 `overflow: clip; overflow-clip-margin: 64px`（列缘外 64px 内全部可见），侧栏也是 tilt pane——而收/展动画中冻结的宽内容与紧凑图标恰落在窄轨边缘 64px 以内（"新会话"按钮探出 29px、图标贴着 64px 线），两个方向都"飞出列外"；此前归因于 5f tooltip 释放不准确（释放只在 tooltip 挂载时额外全开，是叠加因素而非根因）。修复：①侧栏例外按盒缘裁剪（`overflow-clip-margin: 0`，特异性高于面板开关规则）；②stamper 监听 frame 的 `data-sidebar-collapsed` 翻转，翻转后 ~1s 动画窗口内在 `<html>` 盖 `[data-dsh-sidebar-anim]`，窗口内抑制 5f 释放——收起方向的冻结宽内容不再外溢；③收起稳态 + tooltip 在场时释放照常，气泡逃逸保留。实测：动画中列外 15px 处 elementFromPoint 命中背景滚动层而非按钮（修复前命中按钮）、anim 标记动画内 true/稳态 false、clipMargin 0px 生效

### v1.6.2

- **修复：视图嵌套内容面板被壁纸亮区冲成突兀灰板（泛用适配）**——视图里"卡中卡"的内容面板（dsh-context 的系统提示词阅读卡、分类块，轨迹页嵌套板，任何插件页同层级）坐在玻璃上而非应用底色上，填充叠在父级淡层上：磨砂度 7 时整叠 alpha 仅 ~5.6%，壁纸亮区一冲就读成平板灰块。嵌套面板现在带下限地重声明 layer token（暗 rgb(28 34 44)@≥42%、亮白系 ≥50-62%，高磨砂度仍由旋钮驱动；保留插件选层意图与 backdrop blur），内联 token 涂色的嵌套面板走同一下限——按"卡中卡"结构选择器泛化，不写死任何插件类名
- **修复：F5 后 hero 输入卡的蓝色虚线框**——stock 在未选工作区的 hero 态给输入卡加 `cardWorkspaceTrigger` 变体，用 SVG mask（`stroke-dasharray 4 4`，悬停转 accent 蓝）的 `::after` 叠层画虚线环提示"点击选择工作区"；虚线藏在 data-URI 的 SVG 里（不含 "dashed" 字样），此前按关键字扫描漏判，主题还特意把 mask 圆角重画成 24px 保留它。玻璃面板上它读作凭空的蓝色虚线矩形，而占位文案"选择一个工作区开始"与 pointer 光标已表达可点性——`[data-composer-card]::after` 整体 `display: none`（stock 仅在触发器变体下渲染该叠层，常规态空操作）
- **修复：dsh 提问态下输入框的蓝色焦点环（实测确认）**——提问面板挂载即自动聚焦答案输入框，而文本录入元素按规范无论以何种方式聚焦都命中 `:focus-visible`，主题全局蓝环（2px `rgba(110,155,232,.85)` + 1px offset）凭空落到框上（活页提取：`TEXTAREA.Mbwy4a_fieldInput` outline solid/2px/主题蓝、`focusVisible: true`；面板在 `data-dsh-inputbar` 之外，composer 范围的局部豁免覆盖不到）。侧栏搜索框、composer 输入区、提问面板三处同病——合并为按元素类别的全应用豁免：`[data-dsh-aqua] :is(input, textarea, [contenteditable='true']):focus-visible { outline: none }`（焦点由光标与控件自身边框表达；按钮/菜单项保留焦点环，键盘可达性不变）。重建后同一提问态实测 outline 已为 none
- **修复：上下文页玻璃延迟数秒 + 鼠标移过矩形频繁闪烁（两症状同源于 stampPluginViews）**——其一，v1.6.0 的宽限期对所有非聊天根一律延迟 ~1.5s 打标，但真插件页（上下文）是根+卡片同 commit 挂载、聊天根才是"先空后填"（倾斜 bug 的唯一形态）：改为**有 card 家族内容 ⇒ 立即打标**，宽限期只保护空根——上下文页玻璃从 1.5~2.4s 缩到首个 stamp pass（页面实测 251ms，含 rAF 合并延迟）。其二，`closest()` 从元素自身开始匹配：卡片被打上 spot 后，后续 pass 里每张卡都"包含自己"而被判为已嵌套 pane 跳过，`spotted` 恒为 false，兜底逻辑把整个 `lc-root` 打成 spot——鼠标经过卡片间隙时整页成为 hover 面板（全页 glow + 整页 tilt + 固定定位气泡重锚定），读作频繁闪烁（实测根级 spot 在卡片打标 128ms 后追加）。改为父链检查（`parentElement.closest`，嵌套卡仍归外层 pane），并在有卡片时主动摘除根级 stale spot（含手动污染的自愈验证）

### v1.6.1
