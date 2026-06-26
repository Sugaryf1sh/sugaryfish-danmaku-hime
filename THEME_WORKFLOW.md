# 弹幕姬新增主题流程

这份文档记录新增主题时的固定步骤。以后新增任何主题时，按这张清单执行，避免漏掉菜单、类名、透明度、抽屉、弹幕流和发布校验。

## 1. 定义主题身份

- 确认主题 key，使用小写英文，例如 `moss`、`blueprint`。
- 确认 body 类名，统一为 `<key>-theme`，例如 `moss-theme`。
- 确认下拉菜单显示名，沿用罗马索引格式：`Ⅴ . 主题名`。
- 确认主题视觉关键词：底色、主文本、辅助文本、核心强调色、分割线、按钮 hover 语言。

高定主题核心代币必须先定稿：

```css
.custom-theme {
  /* 核心画布：有材质倾向的暗色或亮色，禁止死黑 #000 和死白 #fff。 */
  --bg-main-rgb: R, G, B !important;

  /* 侧板抽屉/下拉菜单：亮色主题比主背景略深，暗色主题比主背景略浮起。 */
  --bg-card: #HEX !important;

  /* 弹幕正文：死锁宋体骨架，高对比油墨、矿物色、香槟色或冷银色。 */
  --text-main: #HEX !important;

  /* 用户名/次要文本：亮度或饱和度比正文降低 40%-50%，退到幕后。 */
  --text-sub: #HEX !important;

  /* 纳米级核心信标：全主题唯一高识别焦点，只用于线、状态点、等级数字等微量区域。 */
  --accent-core: #HEX !important;

  /* 隐形物理分割线：优先用正文字色的低透明度缩影。 */
  --divider: rgba(R, G, B, 0.04) !important;

  /* 便签暗舱专用材质：便签和 EXP 暗舱必须有独立层级，不直接裸用主画布。 */
  --bg-capsule-surface: #HEX !important;
  --capsule-border: rgba(R, G, B, 0.0X) !important;
  --hangar-shadow:
    0 4px 12px rgba(R, G, B, 0.0X),
    12px 24px 50px rgba(R, G, B, 0.0X) !important;
  --capsule-text-sub: #HEX !important;
  --capsule-watermark: rgba(R, G, B, 0.25) !important;

  /* 观众舱头像 fallback 与微观信号色。只用于头像缺图、昵称和极小工艺件。 */
  --presence-accent: #HEX !important;
  --presence-avatar-bg: rgba(R, G, B, 0.08) !important;
  --presence-avatar-ring: rgba(R, G, B, 0.22) !important;

  /* 底部入场提示舱专用色。高频低权重，只做清晰提醒，不抢礼物和醒目留言。 */
  --ticker-bg: rgba(R, G, B, 0.0X) !important;
  --ticker-name: #HEX !important;
  --ticker-text: #HEX !important;
}
```

调色铁律：

- 色彩纯度大做减法。不要直接取纯红、纯绿、纯蓝、纯粉；蓝色偏矿物冰晶蓝，粉色偏灰烬玫瑰粉，暖调偏宣纸燕麦、根茎土色或哑光金属。
- 单一信标原则。一个主题有且只能有一个高识别焦点色，也就是 `--accent-core`。除核心信标外，图标、按钮、UID、未激活态都向 `--text-sub` 或透明度退隐。
- 双列菜单对切色彩学。右侧 12px 色卡左半边必须取 `--bg-main-rgb` 的十六进制形态，右半边必须取 `--accent-core`，用于表达主题底色和点亮反光。
- 便签暗舱层级学。`--bg-capsule-surface` 是便签与暗舱的独立材质面，不能直接裸用主画布；亮色主题要比主背景略深、略实或更像特种纸叠层，暗色主题必须比主背景亮一阶，像一块从黑暗中浮起、表面捕捉微光的矿石。
- 暗色温区极地光圈学。暗色主题的 `--capsule-border` 打死不用黑边，统一使用一像素高透明浅色拉丝反光，例如 `rgba(255, 255, 255, 0.08)`；`--hangar-shadow` 必须黑、紧、凝聚，例如 `rgba(0, 0, 0, 0.45-0.55)`，把舱体托起来。
- 便签文字退隐学。`--capsule-text-sub` 专供观众小昵称，必须比 `--text-sub` 更克制或同族退隐；`--capsule-watermark` 专供右翼 `+EXP` 与暗舱底部技术刻印，建议用主题次要色或核心信标的 20%-30% 透明度，不要抢弹幕正文。
- 观众舱材质公式。亮色主题的 `--bg-capsule-surface` 必须是主画布之上的微透特种纸或同族浅矿物面，建议接近 `rgba(255, 255, 255, 0.90-0.96)` 或主题底色混白，不要写死 `#fff`；`--capsule-border` 用黑色或主题矿物色 4%-8% 透明度；`--hangar-shadow` 用带主题底色倾向的低透明柔影。暗色主题的 `--bg-capsule-surface` 必须比 `--bg-main-rgb` 亮一阶，或混入主题暗色倾向，例如胡桃偏深棕、波尔多偏暗红；`--capsule-border` 用冷白 7%-10% 或主题信标 12%-16% 的捕光线；`--hangar-shadow` 用 50%-85% 黑色深影。
- 观众舱微观信号公式。`--presence-accent` 用于头像缺图字母和微型 fallback 信号，优先取 `--accent-core` 的低压版本或同族旁支色；`--presence-avatar-bg` 只允许是 `--presence-accent` 的 7%-10% 透明度；`--presence-avatar-ring` 只允许是 18%-26% 的细弱外圈。真实头像本身不加重色块，`.viewer-chip` 永远透明、无底、无边框。
- 底部入场提示舱调色学。`.bottom-entrance-ticker` 只消费 `--ticker-bg`、`--ticker-name`、`--ticker-text`，禁止继续用 `filter: brightness()` 或直接读取礼物/醒目留言色。亮色主题的 `--ticker-bg` 建议为 `rgba(0, 0, 0, 0.01)` 一像素级脚线遮罩，`--ticker-name` 取深朱砂、深苔绿、工程群青、寒霜蓝、绛玫瑰等高对比矿物色，`--ticker-text` 取同族烟灰/雾灰。暗色主题的 `--ticker-bg` 建议为 `rgba(0, 0, 0, 0.18-0.22)`，`--ticker-name` 允许更自发光的仪表色、琥珀、焦糖橙、徕卡红、酒红，但仍要和 `--tag-gift`、`--tag-superchat`、`--tag-guard` 拉开；`--ticker-text` 用冷银、烟棕、玫瑰灰，保持 70%-80% 的退隐可读性。

## 2. HTML 菜单入口

修改 `src/renderer/index.html`：

- 按亮色组/暗色组和罗马索引顺序增加一个 `.theme-menu-item`；如果存在 `.menu-matrix-placeholder`，新按钮必须插在占位水印前。
- 设置 `data-theme="<key>"`。
- 文案使用罗马数字和短中文名，不使用 emoji。
- 现有结构保持 `.theme-name` + `.theme-swatch`，色卡内部使用左右两个实体半块：

```html
<button class="theme-menu-item" data-theme="newtheme" type="button">
  <span class="theme-name">Ⅸ . 新题</span>
  <span class="theme-swatch swatch-newtheme" aria-hidden="true">
    <span class="swatch-half swatch-half-left"></span>
    <span class="swatch-half swatch-half-right"></span>
  </span>
</button>
```

## 3. JS 主题注册

修改 `src/renderer/renderer.js`：

- 在 `THEME_CLASSES` 中加入 `<key>-theme`。
- 在 `THEME_LABELS` 中加入 `<key>: "显示名"`。
- 确认 `applyTheme(theme)` 不需要额外分支，仍由 `THEME_CLASSES` 统一清理 body 类名。
- 确认主题菜单点击后 `.is-active` 会同步更新。

检查点：

- 切换主题后 body 只保留一个主题类名。
- 主题按钮 title/aria-label 显示当前主题名。
- 点击外部区域后下拉菜单关闭。

## 4. 全局变量层

修改 `src/renderer/styles.css` 顶部变量区，新增：

```css
body.newtheme-theme {
  color-scheme: light;
  --bg-main-rgb: R, G, B !important;
  --bg-card: #HEX !important;
  --text-main: #HEX !important;
  --text-sub: #HEX !important;
  --accent-core: #HEX !important;
  --accent-blue: var(--accent-core);
  --divider: rgba(R, G, B, 0.04) !important;
  --font-ui: var(...);
  --font-text: var(...);
  --font-data: var(--font-ui);
  --font-serif: var(--font-text);
  --font-mono: "Courier New", Courier, monospace;
  --bg-primary: rgb(var(--bg-main-rgb));
  --paper: rgba(var(--bg-main-rgb), var(--bg-opacity, 1));
  --paper-solid: rgb(var(--bg-main-rgb));
  --ink: var(--text-main);
  --ink-soft: var(--text-sub);
  --line: var(--divider);
  --scroll-thumb: rgba(R, G, B, 0.14);
  --scroll-color: rgba(R, G, B, 0.16);
}
```

必须支持 `--bg-opacity`，透明度滑块只改变背景，不允许让文字、按钮、粉丝牌整体变淡。

## 5. 基础外壳与控件配平

为新主题补齐这些区域：

- `.shell` / `.app-container` 背景、边框、阴影。
- `.header-title`、`.status`、`.window-btn`、`.options-title`、`.param-label`、`.param-value`。
- `.window-btn:hover`。
- `.theme-dropdown-menu`、`.theme-menu-item`、`.theme-menu-item:hover`。
- `.theme-menu-item.is-active` 单元格背光和主题文字色。
- `.update-banner` 和 `.update-progress i`。
- `.help-card`、`.help-update`。

主题菜单需保持：

- 触发按钮为 `调`。
- 下拉菜单用罗马索引，菜单项内部保持 `.theme-name` + `.theme-swatch` 双节点结构；`.theme-swatch` 内部必须包含两个 `.swatch-half` 子节点，禁止再用渐变伪装二分色块。
- 主题顺序固定为亮色组在前、暗色组在后，新增浅色高定主题仍接在浅色/暗色主轴之后：`Ⅰ 纸墨`、`Ⅱ 青苔`、`Ⅲ 白图`、`Ⅳ 极地`、`Ⅴ 暗耀`、`Ⅵ 胡桃`、`Ⅶ 纪实`、`Ⅷ 波尔多`、`Ⅸ 瑰砂`。
- 下拉菜单必须使用 2 列 CSS Grid 面板：`.theme-dropdown-menu { grid-template-columns: repeat(2, 134px); min-width: 280px; gap: 2px 6px; padding: 8px; }`，避免九套主题继续拉长单列高度。
- 激活状态由 `.is-active` 的单元格背光表达；禁止恢复左侧长线/微刻度指示器，`.theme-menu-item::before` 在主题菜单里必须 `content: none`。
- 右侧 `.theme-swatch` 必须通过 `.theme-menu-item .theme-swatch { all: unset !important; }` 先做全属性重置，再重建为 12px x 12px 的纯平 90° 垂直直切正方形晶片。
- `.theme-swatch` 不允许出现开关式滑块、动态缩放、内阴影、透明度衰减或脏边；色盘必须由两个绝对定位的 `.swatch-half` 物理半块组成，每块 6px x 12px，外框用不占尺寸的 `outline` 表达，严禁使用 `border` 挤压内部色块、`linear-gradient()`、45°/135° 斜切渐变或伪元素三角裁切。
- `.theme-dropdown-menu` 和 `.theme-menu-item` 的网格列宽、padding、flex 两端对齐由终端守卫统一控制；新增主题只补 `.swatch-<key>` 色盘，不要回退成纯文本按钮或单列列表。
- 右下角补位遵循奇偶规则：当主题总数为奇数时，`.theme-dropdown-menu` 最后一格保留 `.menu-matrix-placeholder`，`placeholder-serial` 文案按当前主题总数迭代，例如 `[ 09 / MATX ]`；当主题总数为偶数时，必须隐藏或移除该补位格，不允许强行留空标记。
- `.menu-matrix-placeholder` 只负责装饰和补位，不参与 `.theme-menu-item` 点击绑定，也不写 `data-theme`。

## 6. 设置抽屉

新增主题必须接入当前设置抽屉架构：

- `.options-panel` 不要破坏 12 单元网格。
- `.toggle-group` 仍为 4 个开关，每项 span 3。
- `.param-group` 仍为 3 个参数，每项 span 4。
- 不允许恢复 `☑`、`☐`、`☒`、`[x]` 等文本符号。
- 开关状态只通过 `.toggle-item.is-active` 和 CSS `::before` 表达。
- 参数数字统一等宽体、tabular nums、相同高度和 line-height。
- 激活状态不要改变字体粗细到导致布局跳动，优先用颜色、填充块、微点、边框表达。

必须为新主题定义：

- `.options-panel` 材质。
- `.toggle-item` 未激活/激活色。
- `.toggle-item::before` 几何外壳。
- `.toggle-item.is-active::before` 激活状态。
- `.param-label` / `.param-value`。

## 7. 输入行和按钮

新主题不能覆盖当前输入行结构：

- `.input-row` 使用三列网格：标签、值槽、动作区。
- `.input-value-display` 需要保持固定槽宽或当前响应式策略。
- `.input-actions-block` 保证连接、获取、清空不出界。
- 连接按钮和清空按钮右侧视觉轴线对齐。
- 槽线颜色按主题定义，但不要改变槽线宽度和布局。

新主题只改：

- `.input-row .input-value-display` 的 border-bottom 颜色/样式。
- `button:hover` 颜色和反馈。
- 危险按钮颜色。

## 8. 弹幕流

新主题至少补齐：

- `.danmaku-content` 字体、颜色、行高。
- `.danmaku-username`、`.uid`。
- `.danmaku-badge-dot`、`.status-dot`。
- 标签语义色变量：`--tag-danmaku`、`--tag-entry`、`--tag-gift`、`--tag-superchat`、`--tag-guard`。
- 观众进入字体变量：`--entry-user-color`、`--entry-text-color`。
- 左上状态点变量：`--status-signal`、`--status-signal-glow`。
- `.danmaku-item` 分割线、hover、focus。
- `.feed:hover .danmaku-item` 消融透明度。
- `.feed:hover .danmaku-item:hover` 聚焦状态。

不要破坏左舱/右舱布局：

- `.danmaku-side-block` 固定左侧锚点。
- `.danmaku-main-block` 承载用户名和正文。
- 有无粉丝牌时右侧文本起点必须一致。
- 左侧焦点竖线需要和标签圆点、粉丝牌保留独立沟槽；不要用会贴住内容的负 margin 或改变 `.danmaku-side-block` 宽度来修。

跨主题排版守卫：

- 所有主题 `.danmaku-content` / `.text` 的正文行高统一向胡桃主题对齐：`line-height: 1.55 !important`。
- 亮色组字体向纸墨对齐：`light`、`moss`、`blueprint`、`glacial`、`quartz` 的左上标题和正文使用纸墨的衬线骨架，用户名使用纸墨的 UI 无衬线层级。
- 暗色组字体向胡桃对齐：`dark`、`walnut`、`leica`、`bordeaux` 的左上标题、用户名、正文和粉丝牌结构都使用胡桃的骨架，只保留各主题自己的颜色变量。
- 普通弹幕、观众进入、礼物、醒目留言、舰长标签必须使用独立语义色；事件项先写入 `--event-tag-color`，再由 `.tag` 文字、`.tag::before` 圆点、左侧 `border-left-color` 高亮线、hover/focus 背景统一读取，不能被主题旧规则拆成多个颜色源。
- `--event-tag-color` 默认读取 `--tag-danmaku`；观众进入读取 `--tag-entry`；礼物读取 `--tag-gift`；醒目留言读取 `--tag-superchat`；舰长读取 `--tag-guard`。旧规则仍可能读取 `--gift`、`--superchat`、`--guard`，所以新增主题必须把这三项同步到对应 `--tag-*` 变量。
- 事件特殊色必须“有差别但不突兀”：`--tag-gift` 优先取温润金属、矿物金、陶土或柔和紫灰；`--tag-guard` 优先取冷静护卫色，如石蓝、铅紫、松石灰；`--tag-superchat` 和左上 `--status-signal` 必须比普通弹幕标签更醒目，但不能直接复制主题主强调色，至少在色相或明度上拉开一档。
- 观众进入是高频低权重提醒：`--tag-entry` 必须取主题旁支的中性灰、雾蓝、烟草灰、玫瑰灰等普通色，低于礼物/醒目/舰长的强调度，但要和普通弹幕、礼物色保持可辨。
- `--entry-user-color` 和 `--entry-text-color` 也要按主题单独微调，明显程度低于 `--tag-entry`，但不能直接等于普通弹幕、礼物、醒目留言、舰长或粉丝牌颜色；用户名略清晰，正文略退隐。
- 底部入场提示舱是当前入场事件的主呈现层：入场事件必须先从主弹幕 Feed 分流到 `.bottom-entrance-ticker`，Ticker 使用 `--ticker-bg`、`--ticker-name`、`--ticker-text` 三个变量；`--ticker-name` 可比 `--tag-entry` 更清晰一档，但必须低于礼物、舰长、醒目留言的视觉权重，禁止复用 `--tag-gift` / `--tag-superchat` / `--tag-guard`。
- `--ticker-text` 同时服务 `[ENTRY]` 前缀和“进入直播间”后缀，必须和 `--text-sub` 同族但按主题微调：亮色组要深到不发虚，暗色组要像冷银或烟灰而不是纯白；前缀通过 opacity 退隐，后缀比前缀更可读。
- `--ticker-bg` 只做单行脚线空间的轻微承托：亮色建议几乎透明的黑色薄膜，暗色建议低透明黑色遮罩，禁止死白、默认灰块或大面积高饱和背景。
- 左上 `.status-dot` 用 `--status-signal` / `--status-signal-glow` 表达主题特色提醒；它可以和 `--tag-superchat` 同属一个强调家族，但应比标签更像“状态灯”，避免跟普通弹幕圆点、礼物圆点、舰长圆点混成同色。
- `--tag-entry`、`--tag-gift`、`--tag-superchat`、`--tag-guard` 之间也要互相可辨；观众进入、礼物、醒目留言、舰长的 `.tag` 文字、`.tag::before` 圆点、左侧高亮线必须同色，禁止一项事件内部出现三种颜色。
- 观众进入项使用接近礼物的紧凑单行高度，不显示 UID，不参与礼物连击，不触发醒目/礼物大横幅；每次进入都在底部新增独立事件，不按 UID 合并或刷新，按进入频率在 4-8 秒内自适应停留后向右抽出并移除；亮色组字体向纸墨 UI 层级对齐，暗色组字体向胡桃 UI 层级对齐，正文单行省略，避免高频事件挤压弹幕流。
- 礼物倍数 `.gift-multiplier` 读取 `--tag-gift`；醒目留言强调读取 `--tag-superchat`；观众进入、醒目留言、礼物和舰长的左侧高亮线必须与各自标签文字、圆点同色。
- 用户名渐隐使用视觉宽度阈值：中文超过 9 个字触发，英文约超过 18 个字符触发，中英混排按宽度折算。
- `.uid` 必须 `white-space: nowrap`，`.meta` 不允许把用户名和 UID 拆成两行。

沉浸模式观众条守卫：

- `.app-container` 必须保持 `display: flex`、`flex-direction: column`、`height: 100vh`、`overflow: hidden`，禁止全局滚动条蔓延到顶部观众舱。
- `.feed-wrap` 必须是 `flex: 1 1 auto`、`min-height: 0`、`overflow: hidden` 的中间弹性容器；`.feed` 才是唯一纵向滚动层，必须 `flex: 1 1 0`、`min-height: 0`、`overflow-y: auto`。
- `.audience-monitor-container` / `.header-top-container` 只在沉浸模式且有观众数据时显示，必须是 64px 高、`flex-shrink: 0` 的透明水平地平线；左侧放 `.status-dot.global-window-satellite`，右侧放 `.audience-monitor-ribbon`，二者中心线必须和头像圆心对齐；容器左 padding 对齐主界面标题红点轴线，默认 24px，右 padding 保留 16px 让右下阴影有安全扩散空间。
- 红点回归相对定位，作为 `.audience-monitor-container` 的左翼起点自然参与 flex；禁止再钉成全局绝对定位，也禁止放入 `.audience-monitor-ribbon` 内。
- `.audience-monitor-container` 左侧红点必须和主界面标题红点位置对应；`.audience-monitor-ribbon` 是 340px 环岛浮舱，默认 420px 窗口下左边界应与下方弹幕标签圆点最左侧对齐，右侧仍保留 16px 阴影安全区；不要缩成只包内容的小碎片，也不要恢复 100% 通铺长条或撞墙缎带。
- `.audience-monitor-ribbon` 必须是右翼独立浮舱：`all: unset` 后重建为 `display: grid`、`grid-template-columns: repeat(6, 44px)`、`height: 44px`、`width/min-width/max-width: 340px`、`flex: 0 0 340px`、`padding: 0 9px`、`border-radius: 4px`，前 5 槽给观众，第 6 槽给 EXP，背景必须读取 `var(--bg-capsule-surface, var(--bg-card))`，边框必须读取 `var(--capsule-border, var(--divider))`，阴影必须使用双层仿生阴影：亮色为结构硬影 `0 2px 4px rgba(38,31,32,0.02)` + 长距软影 `8px 14px 32px rgba(38,31,32,0.12)`；暗色为金属捕光边 `rgba(255,255,255,0.07)`、更暗底边 `rgba(255,255,255,0.03)`，再叠加 `0 4px 10px rgba(0,0,0,0.4)` + `12px 22px 45px rgba(0,0,0,0.65)`，禁止硬编码 `#fff` / `#FFFFFF` / 默认灰块。
- 内层必须使用 `.audience-scroll-track` 作为前五观众轨道：`grid-column: 1 / 6`、`grid-template-columns: repeat(5, 44px)`、`justify-content: space-between`，主舱只显示前 5 位观众，禁止被 EXP 截断。
- 右翼扩展舱由 `.audience-expand-trigger` 和 `.audience-expanded-hangar` 组成；触发器固定在第 6 槽，`width: 44px`、`height: 24px`、`padding-left: 8px`、`border-left: 1px solid var(--divider)`、`pointer-events: auto`，让左侧秩序线两端留白；穿透状态下仍作为唯一可悬停入口；暗舱必须 `position: absolute`、`top: 50px`、`right: 0`，宽度与浮舱同为 `340px`，背景读取 `var(--bg-capsule-surface, var(--bg-card))`，边框读取 `var(--capsule-border, var(--divider))`，阴影读取双层暗舱重影，吸附在浮舱右下方，只显示主舱前 5 位之后的新增 6 位观众，第 6 位与上方 EXP 槽垂直对齐，禁止和顶部主舱重复，绝不参与文档流，绝不改变 `.feed` 高度或触发弹幕排版抖动。
- 暗舱网格必须严格等宽：`.audience-expanded-hangar { width/min-width/max-width: 340px; box-sizing: border-box; padding: 16px 9px 14px; border-radius: 4px; }`，`.hangar-grid { grid-template-columns: repeat(6, 44px); column-gap: 0; row-gap: 16px; }`，不得让长 ID 撑开列宽或导致列显示不全。
- 每个观众单元使用 `.viewer-chip`，内部为 `.viewer-avatar` 和 `.viewer-mini-name`；`.viewer-chip` 必须 `all: unset` 后重建为透明、无边框、无底色的垂直徽章，`width/min-width/max-width: 44px`、`flex: 0 0 44px`，头像在上、昵称在下，二者绝对居中，不允许恢复灰色方块或卡片边框；头像 22px、2px 圆角、`margin-bottom: 3px`，昵称 9px、`max-width: 44px`、`color: var(--capsule-text-sub, var(--text-sub))`、居中单行省略，禁止纵向挤压切字。
- 每秒刷新榜单时必须复用已有 `.viewer-chip` 节点，禁止整条 `replaceChildren()` 重建导致头像闪烁或布局抖动。
- 新增主题必须给 `--bg-capsule-surface`、`--capsule-border`、`--hangar-shadow`、`--capsule-text-sub`、`--capsule-watermark` 补齐稳定材质值，并让它们与 `--bg-card` / `--text-sub` / `--divider` 保持同一主题家族但有层级差。历史变量 `--presence-bg`、`--presence-ribbon-bg`、`--presence-chip-bg`、`--presence-chip-border` 只能保留兼容或头像微调，不能再把 `.audience-monitor-ribbon` 画成死白卡片，也不能把 `.viewer-chip` 画成实体灰块。
- 观众舱配色必须按“主画布 -> 舱体材质 -> 微观字色 -> fallback 信号”四步推导。第一步用 `--bg-main-rgb` 定主空间冷暖；第二步用 `--bg-capsule-surface` 做浮舱和暗舱共同材质，亮色比主背景更实或更白一点，暗色比主背景亮一阶；第三步用 `--capsule-text-sub` 控制昵称，亮色要比 `--text-sub` 深或同等清晰，暗色要比正文低至少一档；第四步用 `--presence-accent` / `--presence-avatar-bg` / `--presence-avatar-ring` 只服务缺图头像和微弱轮廓，不能反向污染舱体背景。
- 浅色主题观众舱建议：`--bg-capsule-surface` 为白纸、浅水泥、浅蓝纸、冷雾纸、粉砂纸一类 90%-96% 的轻实面；`--capsule-border` 为黑色或主题深色 4%-7%；`--capsule-text-sub` 为中性烟灰、苔灰、工程蓝灰、寒霜灰、玫瑰灰；`--capsule-watermark` 取同色 20%-30%；`--presence-accent` 可略接近 `--accent-core`，但 fallback 背景只能低透明。
- 暗色主题观众舱建议：`--bg-capsule-surface` 为硅晶深灰、烘焙炭黑、银盐黑、暗红黑等比主画布亮一阶的材质；`--capsule-border` 为冷白 7%-10% 或主题信标 12%-16%；`--capsule-text-sub` 为冷银、烟棕、银盐灰、玫瑰灰；`--capsule-watermark` 为这些次要色或信标色 22%-30%；`--presence-avatar-bg` 维持 7%-10%，避免头像缺图时变成彩色按钮。

便签暗舱全局组件读取标准：

```css
.audience-monitor-ribbon {
  background: var(--bg-capsule-surface, var(--bg-card)) !important;
  border: 1px solid var(--capsule-border, var(--divider)) !important;
  box-shadow:
    0 2px 4px rgba(38, 31, 32, 0.02),
    8px 14px 32px rgba(38, 31, 32, 0.12) !important;
}

.audience-expanded-hangar {
  background: var(--bg-capsule-surface, var(--bg-card)) !important;
  border: 1px solid var(--capsule-border, var(--divider)) !important;
  box-shadow: var(
    --hangar-shadow,
    0 4px 12px rgba(0, 0, 0, 0.03),
    12px 24px 50px rgba(0, 0, 0, 0.15)
  ) !important;
}

.viewer-mini-name {
  color: var(--capsule-text-sub, var(--text-sub)) !important;
}

.audience-expand-trigger,
.hangar-footer {
  color: var(--capsule-watermark, var(--text-sub)) !important;
}
```

弹幕滑轨守卫：

- `#feed.feed.danmaku-list-container` 是唯一纵向滚动层；`.app-container`、`.feed-wrap`、`.audience-monitor-ribbon` 都不能生成全局或顶部滚动条。
- `.danmaku-list-container` 和 `.feed.danmaku-list-container` 的滑轨必须由终端守卫统一锁成 2px 发丝线：`::-webkit-scrollbar { width: 2px; height: 2px; }`，轨道透明，滑块半透明，`scrollbar-width: thin`，不得恢复 Windows 默认大灰条。
- 新增主题可以为滑块提供主题色，但只能用低透明度的中性色或旁支强调色。亮色主题建议 `rgba(0, 0, 0, 0.12-0.18)` 或主题矿物色低透明度；暗色主题建议 `rgba(255, 255, 255, 0.10-0.14)` 或主题信标低透明度。不要用大面积高饱和滑块。
- 穿透/锁定/沉浸弱化态必须完全隐形：`body.is-click-through`、`body.is-locked`、`.app-container.is-hud-dimmed` 下，`.danmaku-list-container` 和 `.feed.danmaku-list-container` 的 `scrollbar-color` 与 WebKit thumb 都必须变成 transparent。
- 主题段落可以定义 `.danmaku-list-container::-webkit-scrollbar-thumb` 的颜色，但文件尾部必须保留 terminal scrollbar guard，以防 `.feed::-webkit-scrollbar` 或旧主题规则重新覆盖 2px 宽度和隐形态。

状态点与解锁波纹守卫：

- 左上 `.status-dot` 必须读取主题的 `--status-signal` 和 `--status-signal-glow`。
- 点击穿透恢复态只允许通过 `--status-dot-color` / `--status-dot-glow` 临时覆盖左上状态点，不得影响弹幕标签圆点。
- `.status-dot::before`、`.status-dot::after` 必须以 `left: 50%`、`top: 50%` 和 `translate(-50%, -50%)` 锁定圆心；`wave-out`、`wake-ring` 关键帧必须保留这个 translate，不能只写 `scale()`。

## 9. 粉丝牌

每个主题需要独立定义粉丝牌语言：

- `.fans-badge-container` / `.fans-medal`。
- `.fans-badge-name` / `.fans-medal-name`。
- `.fans-badge-name::after` / `.fans-medal-name::after`。
- `.fans-badge-level` / `.fans-medal-level`。

检查：

- 名字和等级数字高度对齐，视觉中线一致。
- 粉丝牌不得撑破 `.danmaku-side-block`。
- 礼物/弹幕单行压缩不受影响。
- 不允许牌名或等级数字被上沿/下沿截断、隐藏。

粉丝牌终端守卫：

- 外舱统一为 17px 高，内部牌名、分隔点、等级数字统一使用 14px 行盒。
- 牌名、等级数字和 `::after` 分隔点统一使用 `Microsoft YaHei UI` / `PingFang SC` / `Segoe UI` 这套 UI 字体，不继承各主题正文衬线体或 `Courier New`。
- 等级数字可以保留 tabular nums，但不得使用会改变垂直度量的独立数字字体。
- 如果主题需要不同材质，只改背景、边框、文字颜色、分隔点颜色；不要改高度、line-height、top、transform 或 overflow 策略。
- 暗色组粉丝牌整体向胡桃对齐：微暗舱、0 圆角、统一 padding 与高度；`dark`、`leica`、`bordeaux` 只替换 name 色、accent 色、border 色，不允许恢复竖线分舱。
- 终端守卫的 specificity 必须高过主题旧规则，避免主题级 `!important` 把统一高度和字体覆盖掉。

## 10. 醒目留言与倒计时条

醒目留言和大礼物提示必须使用纸墨主题的结构逻辑，并按主题变量换肤：

- 弹幕流内 `.danmaku-item.is-superchat` 使用同一套左侧强调线、低透明背景和 hover/focus 强调结构。
- `.danmaku-item.is-superchat .tag` 与 `.tag::before` 使用主题的 `--superchat`。
- 顶部 `.mega-gift-banner` 使用同一套矩形横幅结构、3px 左强调线和克制阴影。
- `.mega-gift-user`、`.mega-gift-action` 使用 UI 字体，不继承正文衬线体。
- `.mega-gift-progress` 倒计时条固定 2px，高亮色读取 `--superchat`。
- 新主题必须定义 `--superchat`，使醒目留言强调、顶部横幅和倒计时条自然落入该主题色彩体系。

## 11. 透明度与背景图

新增主题必须遵守：

- 透明度滑块只影响背景变量 `--bg-opacity`。
- `.app-container` / `.shell` 背景使用 `rgba(var(--bg-main-rgb), var(--bg-opacity, 1))`。
- `.header`、`.feed`、`.danmaku-item`、`.window-btn`、`.fans-badge-*` 等内容保持 `opacity: 1`。
- 如果主题抽屉需要贴近背景，可对主题 `.options-panel` 使用半透明背景和轻微 `backdrop-filter`，不要降低内部文字 opacity。

## 12. 响应式与窗口边界

新增主题后必须检查：

- 360px 最小窗口宽度下，直播间/SESSDATA 行按钮不出界。
- 右上按钮组高度统一。
- 主题下拉菜单不被窗口边缘裁切，右侧晶片列整齐对齐。
- 设置抽屉上下留白在四个主题中一致。
- 参数数字、快捷键提示、按钮文本不跳动。

## 13. 验证清单

每次新增主题后运行：

```powershell
node --check src/main/main.js
node --check src/renderer/renderer.js
git diff --check
```

手动检查：

- 所有主题均可从右上角菜单切换。
- `.theme-menu-item.is-active` 状态正确。
- `.theme-swatch` 颜色、大小、右对齐和 hover/active 不缩放、不变形、不出现旧开关轨道或阴影。
- Light/Dark/已有主题没有被新主题覆盖。
- 设置抽屉、输入行、弹幕流、粉丝牌、醒目留言、倒计时条、更新横幅都可读。
- 多行弹幕行距一致，用户名渐隐阈值、UID 不换行、左侧焦点竖线沟槽都正常。
- 粉丝牌牌名、分隔点、等级数字在每个主题里同高、同中线、不截字。
- 鼠标穿透、锁定、置顶、复制、更新说明横幅层级不冲突。

## 附录 A. 新主题标准操纵令模板

以后追加新主题时，可以直接复制下面模板，把尖括号占位替换成目标主题信息。模板必须遵守上方语义化代币、单一信标、90° 实体色卡和奇偶补位规则。

```text
请严格基于全系统统一的语义化设计代币，为系统追加扩充第 <index-cn> 套高定皮肤：【<theme-cn-full> (<key>)】。

请严格执行以下三步操作：

=========================================
第一步：HTML 菜单网格扩展
=========================================
请在右上方下拉菜单 `.theme-dropdown-menu` 的正确罗马索引位置，无声打入第 <index-cn> 阶按钮。

如果新增后主题总数为偶数，请隐藏或移除 `.menu-matrix-placeholder`；如果新增后主题总数为奇数，请保留最后一格 `.menu-matrix-placeholder`，并将序列号迭代为 `[ <NN> / MATX ]`。

<button class="theme-menu-item" data-theme="<key>" type="button">
  <span class="theme-name"><roman> . <short-cn></span>
  <span class="theme-swatch swatch-<key>" aria-hidden="true">
    <span class="swatch-half swatch-half-left"></span>
    <span class="swatch-half swatch-half-right"></span>
  </span>
</button>

=========================================
第二步：注册“<theme-cn-full>”核心代币与 90° 零毛刺实体晶片
=========================================
/* 注入独立色盘。禁止死黑 #000 和死白 #fff，禁止高饱和大面积铺色。 */
body.<key>-theme {
  color-scheme: <light|dark>;
  --bg-main-rgb: R, G, B !important;
  --bg-card: #HEX !important;
  --text-main: #HEX !important;
  --text-sub: #HEX !important;
  --accent-core: #HEX !important;
  --divider: rgba(R, G, B, 0.04) !important;

  /* 便签暗舱材质。亮色略深/略实，暗色比主背景亮一阶。 */
  --bg-capsule-surface: #HEX !important;
  --capsule-border: rgba(R, G, B, 0.0X) !important;
  --hangar-shadow:
    0 4px 12px rgba(R, G, B, 0.0X),
    12px 24px 50px rgba(R, G, B, 0.0X) !important;
  --capsule-text-sub: #HEX !important;
  --capsule-watermark: rgba(R, G, B, 0.25) !important;
  --presence-accent: #HEX !important;
  --presence-avatar-bg: rgba(R, G, B, 0.08) !important;
  --presence-avatar-ring: rgba(R, G, B, 0.22) !important;

  /* 底部入场提示舱。亮色偏深矿物印刷色，暗色偏仪表自发光色。 */
  --ticker-bg: rgba(R, G, B, 0.0X) !important;
  --ticker-name: #HEX !important;
  --ticker-text: #HEX !important;

  /* 兼容现有全局组件读取。可以保留主题专属别名，但必须最终汇入通用语义变量。 */
  --accent-blue: var(--accent-core);
  --blue: var(--accent-core);
  --paper: rgba(var(--bg-main-rgb), var(--bg-opacity, 1));
  --paper-solid: rgb(var(--bg-main-rgb));
  --ink: var(--text-main);
  --ink-soft: var(--text-sub);
  --line: var(--divider);
  --scroll-thumb: rgba(R, G, B, 0.14);
  --scroll-color: rgba(R, G, B, 0.16);

  /* 事件语义色。彼此可辨，但低于核心信标的统治力。 */
  --tag-danmaku: #HEX;
  --tag-entry: #HEX;
  --tag-gift: #HEX;
  --tag-superchat: #HEX;
  --tag-guard: #HEX;
  --status-signal: #HEX;
  --status-signal-glow: rgba(R, G, B, 0.32);
  --gift: var(--tag-gift);
  --superchat: var(--tag-superchat);
  --guard: var(--tag-guard);
}

/* 全局组件色彩归顺。应用外壳、弹幕流、观众舱、粉丝牌只吃语义变量和主题微调。 */
body.<key>-theme .app-container {
  background-color: rgba(var(--bg-main-rgb), var(--bg-opacity, 1)) !important;
}

body.<key>-theme .header-title,
body.<key>-theme .options-title,
body.<key>-theme .param-value,
body.<key>-theme .danmaku-content {
  color: var(--text-main) !important;
}

body.<key>-theme .options-sub,
body.<key>-theme .shortcut-hint,
body.<key>-theme .param-label,
body.<key>-theme .window-btn,
body.<key>-theme .danmaku-username,
body.<key>-theme .viewer-mini-name {
  color: var(--text-sub) !important;
}

body.<key>-theme .window-btn:hover,
body.<key>-theme .theme-menu-item.is-active {
  color: var(--accent-core) !important;
}

body.<key>-theme .audience-monitor-ribbon,
body.<key>-theme .audience-expanded-hangar {
  background: var(--bg-capsule-surface) !important;
  border-color: var(--capsule-border) !important;
}

body.<key>-theme .audience-monitor-ribbon {
  box-shadow:
    0 2px 4px rgba(38, 31, 32, 0.02),
    8px 14px 32px rgba(38, 31, 32, 0.12) !important;
}

body.<key>-theme .audience-expanded-hangar {
  box-shadow: var(--hangar-shadow) !important;
}

body.<key>-theme .viewer-mini-name,
body.<key>-theme .viewer-chip {
  color: var(--capsule-text-sub) !important;
}

body.<key>-theme .viewer-avatar {
  background: var(--presence-avatar-bg) !important;
  color: var(--presence-accent) !important;
  box-shadow: 0 0 0 1px var(--presence-avatar-ring) !important;
}

body.<key>-theme .hangar-footer,
body.<key>-theme .audience-expand-trigger {
  color: var(--capsule-watermark) !important;
}

body.<key>-theme .audience-expand-trigger:hover {
  color: var(--text-main) !important;
}

body.<key>-theme .bottom-entrance-ticker {
  --ticker-bg: rgba(R, G, B, 0.0X) !important;
  --ticker-name: #HEX !important;
  --ticker-text: #HEX !important;
  background: var(--ticker-bg) !important;
  border-top-color: var(--divider) !important;
}

body.<key>-theme .bottom-entrance-ticker .ticker-prefix {
  color: var(--ticker-text) !important;
  opacity: 0.4 !important;
}

body.<key>-theme .bottom-entrance-ticker .ticker-username {
  color: var(--ticker-name) !important;
  filter: none !important;
}

body.<key>-theme .bottom-entrance-ticker .ticker-suffix {
  color: var(--ticker-text) !important;
  opacity: 0.75 !important;
}

body.<key>-theme .danmaku-badge-dot,
body.<key>-theme .status-dot {
  background-color: var(--status-signal) !important;
  box-shadow: 0 0 6px var(--status-signal-glow) !important;
}

body.<key>-theme .fans-badge-container,
body.<key>-theme .fans-medal {
  background: rgba(R, G, B, 0.04) !important;
  border: 1px solid rgba(R, G, B, 0.22) !important;
}

body.<key>-theme .fans-badge-level,
body.<key>-theme .fans-medal-level {
  color: var(--accent-core) !important;
}

/* 2px 发丝滑轨。只给主题色，不改变宽度、轨道透明和穿透隐形守卫。 */
body.<key>-theme .feed.danmaku-list-container,
body.<key>-theme .danmaku-list-container {
  scrollbar-color: rgba(R, G, B, 0.14) transparent !important;
}

body.<key>-theme .feed.danmaku-list-container::-webkit-scrollbar-thumb,
body.<key>-theme .danmaku-list-container::-webkit-scrollbar-thumb {
  background: rgba(R, G, B, 0.14) !important;
  border-radius: 1px !important;
}

body.<key>-theme .feed.danmaku-list-container::-webkit-scrollbar-thumb:hover,
body.<key>-theme .danmaku-list-container::-webkit-scrollbar-thumb:hover {
  background: rgba(R, G, B, 0.24) !important;
}

body.<key>-theme.is-click-through .feed.danmaku-list-container,
body.<key>-theme.is-click-through .danmaku-list-container,
body.<key>-theme.is-locked .feed.danmaku-list-container,
body.<key>-theme.is-locked .danmaku-list-container {
  scrollbar-color: transparent transparent !important;
}

body.<key>-theme.is-click-through .feed.danmaku-list-container::-webkit-scrollbar-thumb,
body.<key>-theme.is-click-through .danmaku-list-container::-webkit-scrollbar-thumb,
body.<key>-theme.is-locked .feed.danmaku-list-container::-webkit-scrollbar-thumb,
body.<key>-theme.is-locked .danmaku-list-container::-webkit-scrollbar-thumb {
  background: transparent !important;
}

/* 90° 垂直直切色卡。左半块 = --bg-main-rgb 的 HEX，右半块 = --accent-core。 */
.theme-menu-item .theme-swatch.swatch-<key> {
  outline: 1px solid rgba(255, 255, 255, 0.08) !important;
}

.theme-menu-item .theme-swatch.swatch-<key> .swatch-half-left {
  background: #<bg-main-hex> !important;
}

.theme-menu-item .theme-swatch.swatch-<key> .swatch-half-right {
  background: #<accent-core-hex> !important;
}

=========================================
第三步：JS 清洗队列扩容
=========================================
请在 `src/renderer/renderer.js` 中同步扩展：

- `THEME_CLASSES` 追加 `"<key>-theme"`。
- `THEME_LABELS` 追加 `<key>: "<short-cn>"`。
- 确认 `applyTheme(theme)` 仍由 `THEME_CLASSES` 统一清理 body 类名，不要写散落的手动 `classList.remove(...)`。
```

圣杯熏香示例只作为填空参考，不要把它硬编码成唯一格式：

```text
key = grail
roman = Ⅹ
short-cn = 圣杯
theme-cn-full = 圣杯熏香
color-scheme = dark
--bg-main-rgb = 24, 28, 26
--bg-main HEX = #181C1A
--bg-card = #1B211E
--text-main = #E2DDD3
--text-sub = #717A75
--accent-core = #C29F65
swatch-left = #181C1A
swatch-right = #C29F65
```

## 14. 发布流程

确认主题稳定后再发布，不要无谓迭代版本。

发布步骤：

```powershell
node --check src/main/main.js
node --check src/renderer/renderer.js
corepack pnpm run package:win
corepack pnpm run update-package
corepack pnpm run installer:win
```

发布前必须校验：

- `package.json` 版本。
- `注` 卡片的版本号和更新日期来自 `app:get-info`，包内 `app/package.json` 必须包含当前 `releaseDate`。
- `updates/latest.json` 的 `version`、`tag`、`url`、`sha256`。
- `updates/latest.json` 的 `releaseDate` / `publishedAt` 必须与本次发布日期一致。
- 解压 `updates/Sugaryfish-Danmaku-Hime-App-<version>.zip`，检查 `app/package.json` 版本和关键源码。
- 计算安装包 SHA256。
- 推送后校验远端 GitHub contents API 和 raw tag zip 哈希。

如果推送遇到 HTTPS reset：

```powershell
git -c http.version=HTTP/1.1 -c http.sslBackend=openssl push
```
