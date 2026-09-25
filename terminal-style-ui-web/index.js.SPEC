# SPEC: index.js —— Terminal-Style-UI-Web 渲染入口
# 2026-09-14 dev-01：导出 renderTerminalHtml(markdown, options) —— markdown → pi-tui（定制版）
# → ANSI → ansiToHtml 格子化 HTML。依赖 runtimePath 下的 pi-tui / theme.js / cli-highlight / chalk。
# 另导出 ansiToHtml（低层）与 terminal.css 的配套说明。
# 2026-09-25 Claude Code：固定终端能力（COLORTERM + setCapabilities，非终端进程也出真彩 / OSC 8）；格宽传 pi-tui 的
# visibleWidth；options.sourceMap → 另返回块级源码映射 blocks [{ line, row }]（清洗改为保行号：--- 行清空、记开头偏移）。
# 2026-09-25 Claude Code：patchCodeGutter——代码块长行折行后，续行补上行号栏竖线（续行开头先 SGR 复位）；只改本库输出。
# 2026-09-25 Claude Code：步骤 1–5 抽成 renderLines；新增 renderTerminalAnsi（只出 ANSI，供 bin/tmd.mjs 终端直接输出）。
# 2026-09-25 Claude Code：装配抽成 setupRuntime、清洗抽成 cleanMarkdown；新增 loadTerminalKit({ theme, runtimePath })
# → { piTui, themeJs, runtimeUrl(相对路径), createMarkdown(md) }，供 bin/tmd.mjs 交互界面把 Markdown 组件挂进 TUI。
# 2026-09-25 Claude Code：渲染逻辑拆到 core.js（与 Quick Look 打包版共用）；本文件只剩按 runtimePath 装载模块（缓存，失败不缓存）与 API 包装。
# 新增 renderFileHtml(fileName, text, options)（任意文件：detectFile → fileToMarkdown → renderTerminalHtml，另返回 detected）；导出 detectFile / fileToMarkdown。
# 2026-09-25（用户定稿）：代码块行号栏改为灰色行号 + 空格、不画竖线（core.js patchCodeGutter；画竖线的旧版 patchCodeGutterBar 注释保留）。
# 0.1.0：上游模块改从 dist/runtime.mjs 装载（scripts/upstream-node-entry.js → vendor/upstream-node.mjs → build 拷成 dist/runtime.mjs：pi-tui、theme.js、cli-highlight + hljs、chalk、tmd 的 SYM / UserMessageComponent），
# 不再有 runtimePath；新增 renderFileAnsi（终端用：代码按 width−2×paddingX 排好整体缩进）、loadTerminalKit().createFileView / components、getVisibleWidth。
