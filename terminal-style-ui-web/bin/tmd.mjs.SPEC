# SPEC: bin/tmd.mjs —— 终端里的 Markdown 渲染（tmd）
# 2026-09-25 Claude Code：基于 index.js 的 renderTerminalAnsi 直接输出 ANSI（与 TUI / VSCode 预览同一条管线）。
# 交互同 Claude Code：整篇直接进终端普通屏（触控板 / 滚轮原生滚动、原生拖选），不分页、不接管屏幕、不读按键。
# tmd 文件… / stdin：按终端宽度渲染后整篇输出；-w：保存即刷新、resize 按新宽度重排（清屏含滚动记录后整篇重印，
# 同 Claude Code 超过一屏时的重画方式），Ctrl+C 退出；--width / --theme（默认按 COLORFGBG）/ --color auto|always|never
# （管道默认去色）。①②③ 后补空格（同 TUI 输出层 padEnclosedForNarrowCells）。安装：~/.local/bin/tmd 软链到本文件。
# 2026-09-25 Claude Code（0.4.0）：tmd = terminal markdown。无参数 + TTY → 交互界面（TUI 同一套组件）：
# 记录区（顶部空行 + 标题 + 各段）+ 输入框（下方不放提示，只在第一下 Ctrl+C 后临时提示）；/tmd 路径 → 「⏺ Print(路径)」+「⎿  Printed N lines」（源文件行数）+ 空行 + Markdown（loadTerminalKit.createMarkdown，
# 随窗口宽度重排；读不到 → 红点 + ⎿ 原因），其他输入 → UserMessageComponent，/clear、/exit、Ctrl+C 两下退出。
# 默认全屏（TuiAltScreen，布局：VStack[ScrollView(记录区, follow end) | dock(输入框, 临时提示)]）：滚轮滚动、
# 拖选即复制、点链接 open；新 Print 段比视口高时开头停在视口顶上；退出时回到进入前的屏幕、印出最后看到的记录区
# （不印输入框、不发 \x1b[3J）。--inline → 普通屏（TuiMainScreen）。
# 输入框：❯ 后补空格仅在不超宽时（ISSUE 061 超宽即崩）；补全列表与当前文字对不上（异步补全落后于快速输入）时回车 / Tab 先丢弃列表。
# 崩溃日志写 $TMPDIR/tmd；清空 PAIMON_AGENT_NAME。
# /tmd 参数按 shell 规则拆（反斜杠转义、单双引号、file://、~；拖入多个文件）；未转义空格时相邻几段拼成现成文件取最长。
# 会话（同 Claude Code）：~/.tmd/sessions/<uuid>.jsonl（TMD_HOME 可改；只追加，有内容才建文件）：首行 session 头，之后 print{path} /
# message{text}。退出时有记录就提示「Resume this session with: tmd --resume <id>」。-r/--resume [id]（id 可写唯一前缀；不给 id →
# 输入框填 "/resume " 弹出会话列表）、-c/--continue（最近一次）；界面里 /resume [id]：补全列表即会话选择器（摘要 · 多久以前 ·
# 几段 · id 前 8 位），选中回车直接接着；接着时 Print 按文件当前内容重渲染，之后的记录追加进该会话。/clear 开新会话。
# 全屏拖选：老式 X10 鼠标报告（ESC [ M Cb Cx Cy）转成 SGR 再交给 TuiAltScreen（pi-tui 拖选只认 SGR）。
# 0.1.0：任意文件按内容判断类型（renderFileAnsi / createFileView）；界面组件取自 loadTerminalKit().components（打包版，不再按路径载入 runtime）。
