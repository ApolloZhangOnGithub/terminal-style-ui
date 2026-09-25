# SPEC: extension.js —— Terminal Style UI for VSCode 入口
# 2026-09-25 Claude Code：注册命令（打开预览 / 侧边预览 / 显示源文件 / 将此后缀识别为 Markdown / 放大 / 缩小 / 重置字号 /
# ☀ 切到浅色 / ☾ 切到深色 / 导出 HTML / 导出 PDF）与自定义编辑器 terminalStyleUi.viewer（selector *）；动态预览跟随活动的
# Markdown 编辑器；bindWebview 把 webview 绑定到文档（列数回报 → 渲染下发；文档变化防抖重渲染；块级源码映射驱动编辑器 ↔ 预览
# 双向联动、双击跳源码；字号变化就地广播；主题 auto 跟随 VSCode，context key terminalStyleUi.theme 驱动 ☀/☾ 显示；
# 隐藏面板不渲染）；导出：standaloneHtml（内联 terminal.css + @page）→ 写 HTML，或交给 Chromium 无界面模式打印 PDF；
# shellHtml 生成页面骨架（CSP：style-src 'unsafe-inline' 不带 nonce，脚本走 nonce；隐藏滚动条；自绘选区样式）。
# activate 返回 { stats }（含 lineToRow / rowToLine / postToPreview）供集成测试。
