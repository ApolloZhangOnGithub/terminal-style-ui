# Terminal-Style-UI-Web

[![Release](https://img.shields.io/github/v/release/ApolloZhangOnGithub/terminal-style-ui?label=release&color=5fd068)](https://github.com/ApolloZhangOnGithub/terminal-style-ui/releases/latest) [![License: MIT](https://img.shields.io/github/license/ApolloZhangOnGithub/terminal-style-ui?color=blue)](https://github.com/ApolloZhangOnGithub/terminal-style-ui/blob/main/LICENSE) [![GitHub Packages](https://img.shields.io/badge/npm-@apollozhangongithub%2Fterminal--style--ui-cb3837?logo=npm)](https://github.com/ApolloZhangOnGithub/terminal-style-ui/pkgs/npm/terminal-style-ui) ![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white) [![Publish package](https://github.com/ApolloZhangOnGithub/terminal-style-ui/actions/workflows/publish-package.yml/badge.svg)](https://github.com/ApolloZhangOnGithub/terminal-style-ui/actions/workflows/publish-package.yml)

属于 [terminal-style-ui](https://github.com/ApolloZhangOnGithub/terminal-style-ui)（版本 0.1.1）。

**把终端 TUI 的渲染管线搬到网页上**——与 iTerm/TUI 视觉一致的 Markdown 渲染库。

渲染管线：`Markdown → pi-tui（定制版）→ ANSI 转义序列 → 格子化 HTML`。

- 文字由 **Safari/WebKit 的 CoreText** 渲染（细笔画，与 iTerm 一致）
- 制表符（表格边框、引用竖线）**全部由 CSS 按「上右下左」四臂绘制**（同 iTerm 自绘制表符：接头严丝合缝、竖线跨行连续，不依赖字体字形）
- 字符宽度与 pi-tui 排版同源（`visibleWidth`）：中文 / emoji / ①② 占 2 格，其余非 ASCII 锁进 1 格（span-cell），与终端的 cell 排版一致
- 代码高亮使用 定制配色（dark=MONOKAI，与 TUI 的 cli-highlight 管线同源；light=同色相按白底加深）

## 效果

Markdown：

<p>
<img src="https://raw.githubusercontent.com/ApolloZhangOnGithub/terminal-style-ui/main/media/lib-demo-md-dark.png" width="49%" alt="Markdown dark">
<img src="https://raw.githubusercontent.com/ApolloZhangOnGithub/terminal-style-ui/main/media/lib-demo-md-light.png" width="49%" alt="Markdown light">
</p>

任意文件（代码按内容判断语言，灰色行号、不画竖线）：

<p>
<img src="https://raw.githubusercontent.com/ApolloZhangOnGithub/terminal-style-ui/main/media/lib-demo-py-dark.png" width="49%" alt="代码 dark">
<img src="https://raw.githubusercontent.com/ApolloZhangOnGithub/terminal-style-ui/main/media/lib-demo-py-light.png" width="49%" alt="代码 light">
</p>

## 快速开始

```js
import { renderTerminalHtml } from "@apollozhangongithub/terminal-style-ui";

const { ansi, html } = await renderTerminalHtml(
  "# 标题\n\n**粗体** 和 `行内码`\n\n| 名称 | 状态 |\n|---|---|\n| copy | 已修 |",
  {
    width: 80,                    // 渲染列数（默认 80）
    theme: "dark",                // "dark" | "light"（高亮配色跟随）
  }
);
// html → 放进 <pre class="terminal-style-ui">（必须引入 terminal.css）
```

前端容器（关键 CSS 已在 terminal.css；light 主题再加 `ttu-light`）：

```html
<link rel="stylesheet" href="./terminal.css">
<pre class="terminal-style-ui"><!-- html 插入这里 --></pre>
```

**terminal.css 的显式行高是必需的**（`line-height` 取整到像素，13px 下 = 17px）：制表符格子高 `1lh`，行高是 `normal` 时中文行比 ASCII 行高 1px，竖线会跨行断开。自带样式副本的项目需同步本文件。

## 命令行：tmd（terminal markdown）

<p>
<img src="https://raw.githubusercontent.com/ApolloZhangOnGithub/terminal-style-ui/main/media/tmd-dark.png" width="49%" alt="tmd dark">
<img src="https://raw.githubusercontent.com/ApolloZhangOnGithub/terminal-style-ui/main/media/tmd-light.png" width="49%" alt="tmd light">
</p>

终端里直接看 Markdown（任意后缀），与 TUI / VSCode 预览同一条渲染管线；终端自己画制表符、排中文，链接可点（OSC 8）。

```bash
tmd                               # 交互界面（全屏，同 Claude Code）：下方输入框，/tmd 文件 追加一段「⏺ Print(路径)」渲染
tmd --inline                      # 交互界面不用全屏：内容进终端滚动记录
tmd --resume [id] / tmd -c       # 接着以前的会话（不给 id 时列出来选）/ 接着最近一次；界面里也可以 /resume
tmd notes.WIKI                    # 按终端宽度渲染，整篇直接输出（同 Claude Code：触控板 / 滚轮滚动，不分页、没有快捷键）
tmd -w notes.md                   # 盯住文件：保存即刷新、窗口变宽窄即重排（清屏后整篇重印），Ctrl+C 退出
cat x.md | tmd                    # 读 stdin
tmd --width 80 --theme light x.md # 指定列数 / 配色（默认按终端底色 COLORFGBG 判断，也可设 TMD_THEME）
tmd --color always x.md > x.ans   # 被管道接走时默认不带颜色，always 强制保留
```

安装：`npm install -g @apollozhangongithub/terminal-style-ui --registry=https://npm.pkg.github.com`（GitHub Packages）；开发时 `ln -s "$PWD/bin/tmd.mjs" ~/.local/bin/tmd`（先 `npm run build`）。`-w` 可配合 vim / helix 分屏当实时预览。
交互界面默认全屏（同 Claude Code 的 fullscreen）：记录区触控板 / 滚轮滚动，输入框固定在底部；拖选即复制，点链接打开；/tmd 路径可 Tab 补全，/clear 清空并开新会话，/exit 或 Ctrl+C 两下退出（退出后最后看到的那屏留在终端里，并提示 `tmd --resume <id>`）。会话自动存在 `~/.tmd/sessions/`。
直接输出与 Claude Code 一致：内容进终端的滚动记录，滚动、拖选、复制都是终端原生的；需要分页可自行 `tmd --color always x.md | less -R`。

## API

### `renderTerminalHtml(markdown, options) → Promise<{ansi, html, blocks?}>`

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `markdown` | string | 必填 | Markdown 源文本 |
| `options.width` | number | 80 | 渲染列数（pi-tui 的可用宽度，表格按此撑满右端对齐） |
| `options.theme` | string | "dark" | `"dark"` / `"light"`（theme.js 配色 + 代码高亮配色；light 前端配 `ttu-light`） |
| `options.paddingX` | number | 2 | 左右边距列数（2 = 终端 / TUI 样式，正文对齐在 ⏺ 之下；页面自带留白时传 0，VSCode / Quick Look 即如此） |
| `options.sourceMap` | boolean | false | 同时返回块级源码映射 `blocks`（编辑器 ↔ 预览滚动联动用） |

返回：
- `ansi`：带 ANSI 转义序列的纯文本（可用于真终端输出/调试）
- `html`：格子化 HTML（配 terminal.css 放入 `<pre>`）
- `blocks`（仅 `sourceMap: true`）：`[{ line, row }]`——每个顶层块在原文的起始行（0 起）→ 渲染出的起始行，末尾一项为哨兵（总行数）；块内按线性插值即可。与实际输出对不上时为 `null`

### `renderTerminalAnsi(markdown, options) → Promise<{ansi}>`

只要 ANSI（终端直接输出用，`tmd` 即基于它），参数同 `renderTerminalHtml`（`sourceMap` 除外），省掉转 HTML。

### `renderFileHtml(fileName, text, options) → Promise<{ansi, html, blocks?, detected}>`

任意文件：先判断类型（`detectFile`：后缀、文件名、`#!`、编辑器模式行、内容特征一起打分，后缀只是证据之一），Markdown 照常渲染；代码 / 文本同 Claude Code 的 Write 输出——贴左、灰色行号、不画竖线，带高亮。`sourceMap: true` 时代码的 `blocks` 精确到每一行。`detected` = `{ lang, kind: "markdown" | "code" | "text" | "binary", reason }`。

### 打包版 `dist/ttu-core.js`（没有 Node 的环境）

`npm run build` 把 core.js 与上游依赖打成一个纯 JS 文件（全局 `TTU.renderFile(name, text, { width, theme }) → { html, detected }`），JavaScriptCore / 浏览器里直接跑，输出与 Node 版逐字节一致。Mac 快速查看（同级 `terminal-style-ui-quicklook`）即基于它。

### `ansiToHtml(ansi, theme, options?)`

低层接口：把已有 ANSI 文本转格子化 HTML（不做 markdown 渲染）。`options.widthOf(grapheme) → 列数`：字素宽度函数，传 pi-tui 的 `visibleWidth` 与排版同源（`renderTerminalHtml` 已这样做）；默认用内置的 `charWidth`（CJK/全角 2 格，不识别 emoji / ①②）。

## 依赖

- **运行时**：无。上游依赖（pi-tui 定制版、theme.js 配色、cli-highlight + highlight.js、chalk）已打包进 `dist/runtime.mjs`（Node）与 `dist/ttu-core.js`（JavaScriptCore / 浏览器）；只有重新打包（`npm run build`）时需要一份含定制版 pi-tui 的 runtime（`TSU_RUNTIME` 或 `~/.local/lib/terminal-style-ui/runtime`）
- **浏览器**：无依赖（纯 DOM + CSS）；需支持 `lh` 单位、CSS `round()` 与 `@property`（Chrome 125+ / Safari 16.4+）；字体需 Monaco + PingFang SC（macOS 自带）

## 支持的 Markdown 元素

标题(#~######)、段落、粗体、斜体、行内代码、代码块（带语言高亮；灰色行号、不画竖线，同 Claude Code 的 Write 输出；长行折行后续行对齐代码列）、无序/有序列表、引用、表格（CSS 画线满格连续；复制出来带边框，同终端）、链接（只显示文字，OSC 8 已剥离；下划线中英文连续）。

## 特意不做（与 TUI 行为一致）

- `---` 分割线：TUI 的 assistant-message 渲染管线特意剥掉独立 `---`（模型拿它当章节分隔符，字符画 hr 在终端观感差）——本库同样清洗。
- 链接 URL：只显示链接文字（与 TUI 的 OSC 8 行为一致）。

## 文档

- [DEVELOPMENT.md](https://github.com/ApolloZhangOnGithub/terminal-style-ui/blob/main/terminal-style-ui-web/DEVELOPMENT.md) —— 开发过程全记录（方案演进、技术决策、踩坑）
- [LIMITATIONS.md](https://github.com/ApolloZhangOnGithub/terminal-style-ui/blob/main/terminal-style-ui-web/LIMITATIONS.md) —— 已知局限与边界
