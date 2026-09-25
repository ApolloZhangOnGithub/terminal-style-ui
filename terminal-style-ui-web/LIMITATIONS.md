# LIMITATIONS —— Terminal-Style-UI-Web 已知局限

> 2026-09-14 dev-01 整理。按影响排序。2026-09-25 Claude Code 更新（1、4 已解决）。

## 1. ~~表格边框竖线的最后 1px 连续性~~（2026-09-25 已解决）

改为制表符全部由 CSS 四臂绘制 + 显式取整行高 + 表格行整格模式（DEVELOPMENT 坑 12）：表格各行左右边框 x 偏差实测 0.0000px，竖线跨行连续。仍需注意：
- 依赖 terminal.css 的显式行高——自带样式副本的项目（如 web-tui.server）要同步新版 terminal.css，否则 `normal` 行高下中文行仍比 ASCII 行高 1px。
- 双线（═║╔…）的转角 / 三通按「臂」近似画，内外线交叠处不如单线精致（pi-tui 不输出双线，只为低层接口兜底）；细粗混搭的少见制表符仍走字形。
- 竖线的 x 在 1ch（非整像素）的格子中心，Retina 下边缘略软；横线落在整像素上。

## 2. 构建时依赖定制版 pi-tui

运行时没有外部依赖：pi-tui、theme.js、cli-highlight、chalk 都已打进 `dist/runtime.mjs` / `dist/ttu-core.js`（0.1.0 起）。构建（`npm run build`）只用仓库里的 `vendor/`；但**升级上游**（`npm run vendor`）时要一份含定制版 pi-tui 的 runtime（`TSU_RUNTIME` 或 `~/.local/lib/terminal-style-ui/runtime`）：pi-tui 的 markdown.js 是定制版（标题无下划线、代码块无围栏），用 npm 原版打包视觉会退回 pi 原生风格。

## 3. 字体平台绑定

观感对齐目标 = macOS iTerm + Monaco + PingFang SC。在 Windows/Linux 上没有 Monaco/PingFang，会回退到系统等宽字体——格子渲染机制不变，但字形观感与 macOS 有差异。

## 4. ~~light 主题高亮配色未专属化~~（2026-09-25 已做）

light = MONOKAI 同色相按白底加深（highlight-themes.js 的 LIGHT_PALETTE）；前端 `<pre>` 加 `ttu-light`（白底 #ffffff / 字 #1a1a1a，TUI light 同款）。注意这与 TUI 本身的 light 不完全一致：TUI 的 light 仍用 MONOKAI 原色，变量/属性为纯白、标点近白，白底上看不见——这里特意不照搬。

## 5. 性能边界

- 格子渲染对**表格行（≥2 个制表符）**逐字素输出 span，其余行只有非 ASCII 字素进格子；超长表格（数百行）的 HTML 体积和 DOM 节点数会显著增长。
- 单条消息（≤几百行）无压力；整本书级别的内容建议分页渲染。

## 6. 不做的（设计边界）

- **不提供编辑**：本库定位是渲染查看器，编辑交给上层应用。
- **不做交互终端**：只渲染，不处理 stdin/按键（"只渲染不能操作"是用户定稿）。
- **不做 TUI 布局组件**：分栏/面板等属于上层应用职责，本库只输出渲染后的内容块。
