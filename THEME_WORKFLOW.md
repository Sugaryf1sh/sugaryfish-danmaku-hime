# 弹幕姬新增主题流程

这份文档记录新增主题时的固定步骤。以后新增第五套、第六套主题时，按这张清单执行，避免漏掉菜单、类名、透明度、抽屉、弹幕流和发布校验。

## 1. 定义主题身份

- 确认主题 key，使用小写英文，例如 `moss`、`blueprint`。
- 确认 body 类名，统一为 `<key>-theme`，例如 `moss-theme`。
- 确认下拉菜单显示名，沿用罗马索引格式：`Ⅴ . 主题名`。
- 确认主题视觉关键词：底色、主文本、辅助文本、核心强调色、分割线、按钮 hover 语言。

## 2. HTML 菜单入口

修改 `src/renderer/index.html`：

- 在 `.theme-dropdown-menu` 末尾增加一个 `.theme-menu-item`。
- 设置 `data-theme="<key>"`。
- 文案使用罗马数字和短中文名，不使用 emoji。
- 现有结构保持不变：

```html
<button class="theme-menu-item" data-theme="newtheme" type="button">Ⅴ . 新题</button>
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
  --bg-main-rgb: 0, 0, 0 !important;
  --bg-card: #000000 !important;
  --text-main: #000000 !important;
  --text-sub: #666666 !important;
  --accent-blue: #0052CC !important;
  --divider: rgba(0, 0, 0, 0.08) !important;
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
}
```

必须支持 `--bg-opacity`，透明度滑块只改变背景，不允许让文字、按钮、粉丝牌整体变淡。

## 5. 基础外壳与控件配平

为新主题补齐这些区域：

- `.shell` / `.app-container` 背景、边框、阴影。
- `.header-title`、`.status`、`.window-btn`、`.options-title`、`.param-label`、`.param-value`。
- `.window-btn:hover`。
- `.theme-dropdown-menu`、`.theme-menu-item`、`.theme-menu-item:hover`。
- `.theme-menu-item.is-active` 和 `::before` 微刻度色。
- `.update-banner` 和 `.update-progress i`。
- `.help-card`、`.help-update`。

主题菜单需保持：

- 触发按钮为 `调`。
- 下拉菜单用罗马索引，菜单项内部保持 `.theme-name` + `.theme-swatch` 双节点结构。
- 主题顺序固定为亮色组在前、暗色组在后：`Ⅰ 纸墨`、`Ⅱ 青苔`、`Ⅲ 白图`、`Ⅳ 极地`、`Ⅴ 暗耀`、`Ⅵ 胡桃`、`Ⅶ 纪实`、`Ⅷ 波尔多`。
- 激活状态由 `.is-active` 和左侧微刻度线表达。
- 右侧 `.theme-swatch` 必须是 12px x 12px 的纯平对角切割正方形晶片，左上为主题底色，右下为主题强调色。
- `.theme-swatch` 不允许出现开关式滑块、内阴影或脏边；使用 `::before` / `::after` 分别绘制两块纯色三角，色卡本体保持透明、无边框、无阴影。
- `.theme-dropdown-menu` 和 `.theme-menu-item` 的宽度、padding、flex 两端对齐由终端守卫统一控制；新增主题只补 `.swatch-<key>` 色盘，不要回退成纯文本按钮。

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
- 标签语义色变量：`--tag-danmaku`、`--tag-gift`、`--tag-superchat`、`--tag-guard`。
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
- 亮色组字体向纸墨对齐：`light`、`moss`、`blueprint`、`glacial` 的左上标题和正文使用纸墨的衬线骨架，用户名使用纸墨的 UI 无衬线层级。
- 暗色组字体向胡桃对齐：`dark`、`walnut`、`leica`、`bordeaux` 的左上标题、用户名、正文和粉丝牌结构都使用胡桃的骨架，只保留各主题自己的颜色变量。
- 普通弹幕、礼物、醒目留言、舰长标签必须使用独立语义色；`.tag` 文字和 `.tag::before` 圆点读取同一语义色，不能被主题旧规则统一染成单一强调色。
- 礼物倍数 `.gift-multiplier` 读取 `--tag-gift`；醒目留言强调读取 `--tag-superchat`。
- 用户名渐隐使用视觉宽度阈值：中文超过 9 个字触发，英文约超过 18 个字符触发，中英混排按宽度折算。
- `.uid` 必须 `white-space: nowrap`，`.meta` 不允许把用户名和 UID 拆成两行。

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
- `.theme-swatch` 颜色、大小、右对齐和 hover/active 放大状态正确。
- Light/Dark/已有主题没有被新主题覆盖。
- 设置抽屉、输入行、弹幕流、粉丝牌、醒目留言、倒计时条、更新横幅都可读。
- 多行弹幕行距一致，用户名渐隐阈值、UID 不换行、左侧焦点竖线沟槽都正常。
- 粉丝牌牌名、分隔点、等级数字在每个主题里同高、同中线、不截字。
- 鼠标穿透、锁定、置顶、复制、更新说明横幅层级不冲突。

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
- `updates/latest.json` 的 `version`、`tag`、`url`、`sha256`。
- 解压 `updates/Sugaryfish-Danmaku-Hime-App-<version>.zip`，检查 `app/package.json` 版本和关键源码。
- 计算安装包 SHA256。
- 推送后校验远端 GitHub contents API 和 raw tag zip 哈希。

如果推送遇到 HTTPS reset：

```powershell
git -c http.version=HTTP/1.1 -c http.sslBackend=openssl push
```
