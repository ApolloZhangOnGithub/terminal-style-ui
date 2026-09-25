# SPEC: core.js —— 渲染核心（2026-09-25 Claude Code，从 index.js 拆出）
# 不碰文件系统、不动态 import；运行时模块 mods = { piTui, themeJs, highlight, supportsLanguage, chalk } 由调用方传入：
# index.js（Node，从 runtime 动态装载）与 dist/ttu-core.js（esbuild 静态打包，Quick Look / 浏览器）共用。
# configureRuntime（setCapabilities 固定真彩 / OSC 8、initTheme、代码高亮：常用名单外问 cli-highlight supportsLanguage）、
# cleanMarkdown、createMarkdown、renderLines（→ { lines, blocks, visibleWidth }）、patchCodeGutter、源码映射——逻辑与原 index.js 相同，
# 重构前后 README+DEVELOPMENT 在 dark/light × 60/100 列下 html / ansi / blocks 逐字节一致。
# 任意文件：detectFile(name, text) → { lang, kind: markdown|code|text|binary, reason }——后缀 / 文件名 / #! / 编辑器模式行 / JSON 可解析 /
# 各语言内容特征打分，后缀只是证据（3 分），内容能推翻它；含 NUL 为 binary。fileToMarkdown：Markdown 原样，代码 / 文本包进围栏代码块
# （围栏 = 内容里最长反引号串 + 1）。
# 2026-09-25：renderFileChunks(mods, name, text, { width, theme, chunkLines })——任意文件分块渲染（流式）：Markdown 整篇一块；代码 / 文本整篇
# 高亮一次、按块交 pi-tui，行号换真实值、块尾补空行凑齐整篇位数（与整篇一次渲染逐字节相同）；纯代码无边距、灰色行号 + 空格、不画竖线
# （同 Claude Code 的 Write 输出，按 width+2 排再去掉竖线 2 列）；不做 Markdown 清洗（renderLines 的 clean: false）。
# fastHighlight：绕开 cli-highlight 的 parse5（占 97% 时间），直接扫 highlight.js 的 HTML 上色，520 个文件与 cli-highlight 逐字节一致。
# 2026-09-25：patchCodeGutter——Markdown 里的代码块同样灰色行号 + 空格、不画竖线，续行少缩进 2 列对齐代码；旧版（续行补竖线）注释保留为 patchCodeGutterBar。
# 2026-09-25：renderLines / renderFileChunks 加 paddingX（默认 2，终端 / TUI 样式）；VSCode 预览与 Quick Look 传 0（页面自带留白，不要双重边距）。源码映射按 width − 2×paddingX 计算折行。
