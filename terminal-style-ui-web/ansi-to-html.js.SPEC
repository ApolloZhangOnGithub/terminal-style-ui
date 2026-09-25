# SPEC: ansi-to-html.js —— ANSI 转义序列 → 格子化 HTML 转换器
# 2026-09-14 dev-01：Terminal-Style-UI-Web 的核心模块（从 note-app 提取封装）。
# 职责：SGR 状态机解析（前景色/粗体/dim/斜体/下划线）+ OSC 8 剥离（链接只留文字）
# + 格子渲染（宽字符 2ch / 窄字符 1ch 的 inline-block span）+ box-drawing CSS 渐变画线（满格连续）。
# 消费方：index.js 的 renderTerminalHtml；前端需配合 terminal.css。
# 2026-09-25 Claude Code 重写：分词解析（修 CSI 双重自增吞字）；ansiToHtml(ansi, theme, { widthOf }) 按字素簇切分、
# 宽度函数由调用方传入（与 pi-tui 排版同源）；同样式内容包进样式段 span，下划线画在其背景上（中英文连续）；
# 制表符（BOX_ARMS：细/粗/双/圆角/半线/虚线）按四臂用 CSS 画，格子高 1lh 顶对齐；表格行（≥2 制表符）整格模式。
# 2026-09-25 Claude Code：制表符格子里放同一个制表符、字形透明（复制带边框，同终端），class="ttu-box" 供前端选中时保持透明。
