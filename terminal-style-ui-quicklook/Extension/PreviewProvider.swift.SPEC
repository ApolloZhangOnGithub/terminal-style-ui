# SPEC: Extension/PreviewProvider.swift + shell.html —— Quick Look 预览扩展（2026-09-25 Claude Code）
# view-based（NSExtensionPrincipalClass = PreviewViewController，QLPreviewingController）：读文件（≤8MB，超出提示；UTF-8 → UTF-16(BOM)
# → GB18030 → 有损 UTF-8）→ WKWebView 加载 shell.html（加载前注入 window.__tmdTheme，主题首帧生效、浅色不闪黑；不能给文件网址加 ?theme= 参数——
# loadFileURL 抛 NSInvalidArgumentException，预览直接失败）→ evaluateJavaScript tmdStart(名, 文本,
# 主题, 提示) → 页面回 "first" 后 preparePreviewOfFile 返回（"binary" → 抛错交还系统预览）。
# WKWebView：inactiveSchedulingPolicy = .none（否则 WebKit 挂起网页进程，首帧后全空白）；entitlements 加 network.client（沙盒里网页进程需要）。
# shell.html：列数 = 可用宽 ÷ 1ch；TTU.createFileRenderer 每块 300 行，首块同步、其余每帧 ≤12ms 追加；resize 列数变了才重排；
# 字号 11px（同 Apple 文本预览：Menlo 11pt）；整行滚动（底边对齐、滚轮累积满一行走一行，同 VSCode 插件），不接管键盘（空格 / 方向键归访达）。
