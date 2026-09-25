# Changelog

## 0.1.1 —— 2026-09-25

- README 在 npm 包页面（GitHub Packages）上图片不显示、部分标题原样露出 `##`：配图与文档链接改为指向仓库的绝对地址，`</p>` 后补空行。

## 0.1.0 —— 2026-09-25

首个版本。

- **渲染库**（`terminal-style-ui-web`）：Markdown / 任意文件 → 终端 TUI 同款 ANSI → 格子化 HTML。制表符由 CSS 四臂绘制（表格接头严丝合缝、竖线跨行连续），中文 / emoji / ①② 按两格排版；代码同 Claude Code 的 Write 输出（灰色行号、不画竖线）；文件类型按内容判断，后缀只是证据之一。上游依赖全部打包（`dist/runtime.mjs` 给 Node，`dist/ttu-core.js` 给 JavaScriptCore / 浏览器）。
- **tmd**：终端里看任意文件；无参数进全屏交互界面（`/tmd 文件`、会话保存与 `--resume`、拖选复制）。
- **VSCode 插件**：任意文件侧边实时预览、整行滚动、双向联动、dark / light 与 ☀/☾、自绘选区、导出 HTML / PDF。
- **Quick Look**：访达按空格预览，流式渲染、按窗口宽度重排、整行滚动、跟随系统深浅色。
