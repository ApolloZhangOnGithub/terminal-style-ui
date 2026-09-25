# Changelog

## 0.1.2 —— 2026-09-25

外部评审（实测）指出的问题：

- **大文本卡死**：纯文本、日志、CSV 与没写语言的代码块不再触发 highlight.js 的自动识别（把 191 种语言挨个试）——1500 行日志 6.5 秒 → 0.27 秒，不再有堆溢出；英文单词不再被染成关键字色。
- **万行悬崖**：代码文件行号栏改为自己画（只借 pi-tui 折行），不再为凑位数补空行——10000 行 7 秒 → 0.4 秒，2 万行 0.6 秒，线性增长；输出与原先逐字节一致。
- **文档被改坏**：Markdown 清洗（剥工具标签、去 `---`）改为只给聊天输出用（`clean: true`，默认关），并跳过代码块、正则只认完整标签名（不再误伤 `<parameters>`）；YAML front matter 按 yaml 代码块显示；setext 二级标题、分隔线恢复正常。
- **`.md` 被判成代码**：已知后缀 / 文件名权重提高，平局以后缀为准。
- 不再在 import 时改写宿主进程的 `FORCE_COLOR` / `COLORTERM`（Node 侧上游包里的 chalk 也只留一份）；删除线（SGR 9）在预览与导出中显示；VSCode 的 `libraryPath` / `chromePath` 设为 `machine` 作用域，PDF 导出临时文件每次独立；Quick Look 改为通用二进制。
- 每条都加了单元测试（`npm test`，共 13 项，CI 每次推送跑）；代码注释去掉会话日志式的日期与措辞。
- VSCode 光标同步：焦点在源文件编辑器上时，预览里在对应位置显示闪烁光标与当前行底色（设置 `terminalStyleUi.cursorSync`）。
- VSCode 预览跟手：打字到预览画出从 51 / 76 / 236ms（小 / 中 / 大文档）降到 12 / 11 / 13ms——去掉 40ms 防抖（改为渲染中有新编辑就做完再补一次）；只发、只替换变化的行（预览页每行一个块，屏幕外的行 `content-visibility: auto`）；渲染库按顶层块缓存 Markdown 渲染、按行缓存 ANSI → HTML（随机编辑测试逐步比对，结果与不用缓存逐字节相同）。`node test/run.js --perf` 可复测。
- 仓库可独立构建：上游依赖打包在 `terminal-style-ui-web/vendor/` 并随仓库提交（`npm run vendor` 只在升级上游时用），`npm run build` 不需要任何运行时。
- 单元测试（`npm test`）与 CI：类型检测、不超宽、分块 = 整篇、代码行号样式、打包版在纯 JavaScript 环境里与 Node 版逐字节一致、tmd 命令行。
- Quick Look：构建安装后确认预览扩展已登记（同 ID 旧副本被注销时系统可能连新版一起清掉），没有就重新登记。
- tmd：管道输入（没有文件名）判断不出类型时按 Markdown 渲染（原先当纯文本，带上了行号）。

## 0.1.1 —— 2026-09-25

- README 在 npm 包页面（GitHub Packages）上图片不显示、部分标题原样露出 `##`：配图与文档链接改为指向仓库的绝对地址，`</p>` 后补空行。

## 0.1.0 —— 2026-09-25

首个版本。

- **渲染库**（`terminal-style-ui-web`）：Markdown / 任意文件 → 终端 TUI 同款 ANSI → 格子化 HTML。制表符由 CSS 四臂绘制（表格接头严丝合缝、竖线跨行连续），中文 / emoji / ①② 按两格排版；代码同 Claude Code 的 Write 输出（灰色行号、不画竖线）；文件类型按内容判断，后缀只是证据之一。上游依赖全部打包（`dist/runtime.mjs` 给 Node，`dist/ttu-core.js` 给 JavaScriptCore / 浏览器）。
- **tmd**：终端里看任意文件；无参数进全屏交互界面（`/tmd 文件`、会话保存与 `--resume`、拖选复制）。
- **VSCode 插件**：任意文件侧边实时预览、整行滚动、双向联动、dark / light 与 ☀/☾、自绘选区、导出 HTML / PDF。
- **Quick Look**：访达按空格预览，流式渲染、按窗口宽度重排、整行滚动、跟随系统深浅色。
