# SPEC: renderer.js —— 扩展进程侧渲染封装
# 2026-09-25 Claude Code：动态 import 装载 terminal-style-ui-web（ESM），串行调用 renderTerminalHtml
# （width / theme / sourceMap）→ { html, blocks }；库目录解析（设置 → 同级目录 → 固定默认）；
# 每次渲染临时设 FORCE_COLOR / COLORTERM、结束恢复（不污染共享的扩展进程）。不依赖 vscode 模块。消费方：extension.js。
# 0.1.0：渲染库目录 = 设置 libraryPath → 插件自带 lib/（npm run package 时 scripts/bundle-lib.mjs 拷入，含 dist/runtime.mjs）→ 源码同级目录；不再有 runtimePath。
