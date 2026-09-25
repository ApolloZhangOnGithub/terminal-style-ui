# SPEC: test/smoke.js —— 集成冒烟测试（在真实扩展进程里运行）
# 2026-09-25 Claude Code：侧边预览回执、真彩、链接不印 URL、吞字回归、实时刷新、列数设置、字号缩放、dark / light 与 ☀/☾、
# 双向联动、整行滚动（注入滚轮事件，底边对齐）、自绘选区（整行高、对齐字符格、复制带边框）、跟随活动编辑器、.WIKI、
# 未登记后缀 + 识别为 Markdown、自定义编辑器、显示源文件、导出 HTML / PDF、环境变量恢复；截图模式截 dark / light 并排
# （带选区）与预览独占。依赖 extension.js 的 activate 返回值 { stats }。
