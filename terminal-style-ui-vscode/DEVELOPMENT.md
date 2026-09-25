# DEVELOPMENT —— Terminal-Style-UI-VSCode 开发记录

> 2026-09-25 Claude Code｜需求：「terminal-style-ui-web 能做 VSCode 插件，对于 markdown 文档直接渲染一下吗」，随后追加：任意后缀（如 .WIKI）、字号缩放、表格渲染、整行滚动（底边对齐、不要滚动条）、dark/light 与 ☀/☾ 手动切换、引用线 / 代码行号栏折行断开、中文下划线、与左侧联动 + 实时渲染、选中像正常文字、导出 PDF / HTML。

## 一、架构

```
.md 文档（TextDocument；编辑触发 onDidChangeTextDocument，防抖 40ms）
  ↓ extension.js：bindWebview（动态预览 / 自定义编辑器共用）
  ↓ renderer.js：串行队列；渲染窗口内临时设 FORCE_COLOR / COLORTERM，结束恢复
  ↓ terminal-style-ui-web：renderTerminalHtml(md, { width: 面板列数, theme, sourceMap: true }) → { html, blocks }
  ↓ postMessage { type: "render", seq, theme, html }；随后按编辑器可见行下发 scrollToRow（联动）
webview.js：填入 <pre class="terminal-style-ui">（样式直接引用渲染库的 terminal.css）→ 回执 rendered
  ↑ 测算列数（面板宽 ÷ 1ch）→ ready / resize；用户滚动 → scrolled（带动编辑器）；双击 → reveal；捏合 → zoomTo
```

## 二、技术决策

1. **自建 Webview，不挂内置 Markdown 预览**：内置预览的扩展点是 markdown-it 插件（同步 render），渲染管线却是异步的（动态 import pi-tui 等）；挂上去还会接管所有 Markdown 预览。
2. **渲染在扩展进程，webview 只显示**：与渲染库定位一致（Node 端出 HTML、前端注入 DOM，同 web-tui.server）。
3. **列数由 webview 实测**：面板宽 ÷ 1ch（100 个 "0" 求平均 advance），宽度 / 字号变化后重测，列数变了才重渲染——同终端按窗口宽度排版。
4. **渲染库按路径引用、不打包**：单一事实源，改库后重载窗口即生效。库目录解析：设置 → 同级目录（源码 / 开发模式）→ 固定默认路径（.vsix 安装后）。
5. **动态预览，跟随活动的 Markdown 编辑器**（同内置预览）：全局一个预览面板，切到别的 Markdown 文件就换绑；非 Markdown 语言的文件不自动跟随，但可显式预览。
6. **块级源码映射做联动**：渲染库在 pi-tui 渲染时记录每个顶层 token 的起始行 → 渲染行（`blocks`），块内线性插值；编辑器 → 预览用 `visibleRanges`，预览 → 编辑器用 `revealRange(AtTop)`。精度与内置预览同级（内置也是块级 data-line）。
7. **后缀无关**：菜单 / 按钮按语言模式（`editorLangId == markdown`）判断；自定义编辑器 selector 为 `*`（customEditors 只支持文件名 glob，不能按语言）；`.wiki` 内置登记为 Markdown（VSCode 按后缀匹配不分大小写）；其余后缀一键写 `files.associations`。
8. **缩放走 VSCode 按键绑定**（`activeWebviewPanelId` / `activeCustomEditorId` 限定，只在预览获得焦点时覆盖 ⌘+ / ⌘- / ⌘0）；捏合 / ⌘+滚轮在 webview 里就地生效、防抖写回设置，设置变化广播到所有预览（只发字号，不重建页面）。
9. **整行滚动（底边对齐）**：webview 接管滚轮（累积满一行才走一行，反向清零）、方向键 / 翻页；页内查找等跳转后在 scrollend 吸附。行格 = 页顶 0 + 「视口底边落在行边界上」的位置（同终端：最底一行完整）；页顶之后的第一个格点取离页顶至少半行的那个（否则从页顶往下第一步几乎不动）；上下留白各一行（`1lh`），拉到最底也在格上。不显示滚动条（`scrollbar-width: none`）。
10. **选区自绘**：原生高亮在格子化排版下是参差的异形块（中文格子右侧漏缝、制表符格子不高亮、各元素高度不一）。`::selection` 背景透明、选中字变黑；selectionchange 时取 `range.getClientRects()`，按矩形中心归行、左右按 1ch 取整，每行画一个整行高的块，垫在文字下（pre 成为层叠上下文，选区层 z-index:-1）。配色取 iTerm 默认（#b5d5ff 底、黑字）。 
11. **☀ / ☾**：两个命令按 context key `terminalStyleUi.theme`（生效主题）二选一显示在标题栏；切到与「跟随 VSCode」相同的那一种时写回 auto。
12. **导出**：HTML = 渲染结果 + 内联 terminal.css + `@page`（页宽 = 列数 × Monaco 字宽 + 留白，页高 = 行数 × 行高 + 上下各一行：一整张长页，阅读器里没有分页白缝；超过 200 英寸才分页），无脚本；PDF 把这份 HTML 写到固定临时文件（每次覆盖），交给本机 Chromium 系浏览器 `--headless --print-to-pdf`。列数取当前预览的（所见即所得），没有预览时 100 列。

## 三、踩坑

1. **截图才发现的吞字**（修在渲染库，见其 DEVELOPMENT.md 坑 8 的更正）：功能断言全过、画面是错的——视觉检查不可省。
2. **GUI 进程里终端能力探测失灵**（修在渲染库，坑 11）：扩展进程没有 COLORTERM / TERM_PROGRAM → 主题色退回 256 色、链接印出 URL。
3. **表格接头 / 竖线 / 中文下划线**（修在渲染库，坑 12–14）。
4. **共享进程的环境污染**：渲染库 import 时把 FORCE_COLOR / COLORTERM 写进 process.env；扩展进程是所有插件共享的。renderer.js 每次渲染窗口内设上、结束恢复，渲染串行化保证窗口不交叠。每次都设而非只靠库 import 时设：首次渲染可能因 runtimePath 配错在 chalk 装载前就失败，重试时库已缓存、不会再设。
5. **CSP 与内联 style**：ansiToHtml 的输出全是 style 属性；style-src 一旦带 nonce，'unsafe-inline' 即失效。style-src 只用 'unsafe-inline'，脚本才用 nonce。
6. **被遮挡窗口停绘**：集成测试的 VSCode 窗口常开在别的窗口后面，Chromium 停绘被遮挡窗口 → 截图拿到旧画面、webview 空白。测试实例加 `--disable-backgrounding-occluded-windows --disable-renderer-backgrounding`。
7. **联动防回环吞掉用户滚动**：最初用「程序化滚动后 150ms 内不回报」，用户紧接着的滚动也被吞，编辑器不跟。改为记下程序化滚动的落点，只忽略恰好落在该处的那一次滚动事件。
8. **粘性滚动（Sticky Scroll）**：Markdown 编辑器顶部悬浮外层标题（最多 5 行）；`revealRange(AtTop)` 把目标行放在悬浮层之下，而 `visibleRanges` 从被悬浮层盖住的行算起——两者差 0～5 行，属 VSCode 行为（测试按此放宽判定）。
9. **隐藏面板白渲染**：未保留上下文的 webview 隐藏时已销毁，发去的消息直接丢；改设置时后台标签页也渲染一遍、永远等不到回执。面板不可见时跳过渲染，重新显示时 webview 重建、回报 ready 自然拿最新内容。
10. **平滑滚动**：整行跳动与落点识别都要求瞬时滚动，scrollTo 一律 `behavior: "instant"`。
11. **标题栏按钮随焦点显示**：`activeWebviewPanelId` 跟随焦点，不按编辑器组区分——☀/☾ 只在预览获得焦点时出现（内置 Markdown 预览的按钮同样如此）。
12. **代码块行号栏的续行**（修在渲染库，见其 DEVELOPMENT.md 坑 16）：补上的竖线曾继承上一行未关闭的颜色（折在注释里就是暗色），看起来像变细了。
13. **表格线复制丢失**：制表符格子原先是空 span，复制表格只剩文字。改为格子里放透明字形（渲染库），选中时用 `.ttu-box::selection` 保持透明。
14. **PDF 分页白缝**：最初按 A 系列比例分页，阅读器在页与页之间露出白底（PDF 本身四边是黑的，实测边缘像素全黑）。改为一整张长页；`<pre>` 的默认上下外边距（各 1em）要清零，否则内容比算出的页高多 26px，末尾溢出成第二页。
15. **跟手（2026-09-25）**：实测「编辑 → 预览画出」各段（`node test/run.js --perf`）：原先小文档 51ms 里 41ms 是防抖；大文档 236ms 主要是整页替换后的重排（117ms）与整篇重渲染（33ms）。改为：不防抖、渲染中有新编辑就做完再补一次；插件按行比对，只发变化的一段（`patch`），预览页每行一个块、只替换这几行，屏幕外的行 `content-visibility: auto`；渲染库按顶层块缓存 Markdown 渲染、按行缓存 ANSI → HTML。结果小 / 中 / 大 12 / 11 / 13ms（其中 6–9ms 是等浏览器画下一帧）。前提：ansiToHtml 每行结尾闭合样式段，行与行的 HTML 互不跨越。
16. **光标同步（2026-09-25）**：插件在光标移动 / 切换编辑器 / 窗口焦点变化 / 重新渲染后，发「估计渲染行（块级映射插值）+ 光标前后各 ≤16 字（去掉 `*_\`~#>[]()|\\` 等渲染后不显示的标记）」；预览页在估计行 ±2 行里找最长能匹配的片段（先找光标前的，再找光标后的），离估计行最近者胜，横坐标取 DOM 里该字符的实际位置（Range 的 clientRect，中文 / 格子都准）；找不到只标整行。焦点在预览上（window focus）或不在这份文档的编辑器上时隐藏。测试窗口常在后台（window.state.focused 为假），测试环境放宽这一条。

## 四、测试

- `npm test`：隔离的 VSCode 实例（临时 user-data-dir / extensions-dir，剥掉终端环境变量模拟 Dock 启动）里跑 test/smoke.js：侧边预览回执、真彩、链接不印 URL、吞字回归、实时刷新、列数设置、字号缩放、dark/light 与 ☀/☾、双向联动、整行滚动（注入真实滚轮事件，验证累积与底边对齐）、自绘选区（整行高、对齐字符格、复制带边框）、跟随活动编辑器、.WIKI 后缀、未登记后缀 + 识别为 Markdown、自定义编辑器、显示源文件、导出 HTML / PDF、环境变量恢复。
- `npm test -- --screenshot`：另按进程号截取测试窗口（只截该窗口）：dark 并排（带一段选区）、light 并排（带选区）、预览独占。
