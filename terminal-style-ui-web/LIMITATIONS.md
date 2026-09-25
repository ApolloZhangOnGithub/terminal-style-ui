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

- **HTML 体积**：每个格子都内联一串 style（中文正文约是原文的 20 倍，200 行的表格从 8.7 KB 变成 2.5 MB）。改成 class 能省一个数量级，尚未做。VSCode 预览按行增量更新、屏幕外的行不排版，打字时不受影响；导出的 HTML 会偏大。
- 代码 / 纯文本文件按行线性增长（2 万行约 0.6 秒）；纯文本和没写语言的代码块不做语言自动识别（highlight.js 的自动识别要把 191 种语言挨个试，大日志会卡死）。

## 6. 不做的（设计边界）

- **不提供编辑**：本库定位是渲染查看器，编辑交给上层应用。
- **渲染库不做交互终端**：只渲染，不处理按键；交互界面在 bin/tmd.mjs。
- **不做 TUI 布局组件**：分栏/面板等属于上层应用职责，本库只输出渲染后的内容块。

## 7. 分发

- **Quick Look App** 为通用二进制（Apple Silicon + Intel），但用开发者证书签名、未经 Apple 公证：别人第一次打开会被 Gatekeeper 拦，需要右键 →「打开」。免提示要 Developer ID 证书 + 公证。
- **npm 包**只发在 GitHub Packages：安装公开包也要先 `npm login --registry=https://npm.pkg.github.com`；也可以直接装 Release 里的 .tgz。
- **定制版 pi-tui**：`vendor/` 里是打包好的产物（附许可声明），源码不在本仓库——改渲染逻辑（本库代码）不需要它，改上游行为需要。
