# SPEC: highlight-themes.js —— 代码高亮配色（cli-highlight theme）
# 2026-09-14 dev-01：从 TUI interactive-mode.js 的 MONOKAI_THEME 提取封装。
# dark = MONOKAI 配色（keyword 青/粉双色：声明类关键字青、流程关键字粉——STORAGE_KEYWORDS 精确集合）；
# light = 2026-09-25 起为同一套 token→色相映射按白底加深（LIGHT_PALETTE；TUI 的 MONOKAI 变量纯白，白底不可见，不照搬）。
# dark 值未变（重构为调色板参数后逐字节回归一致）。
# 依赖 cli-highlight（由调用方传入 highlight 函数与 chalk 实例——本模块零硬依赖）。
