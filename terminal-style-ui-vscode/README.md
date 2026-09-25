# Terminal-Style-UI-VSCode

[![Release](https://img.shields.io/github/v/release/ApolloZhangOnGithub/terminal-style-ui?label=release&color=5fd068)](https://github.com/ApolloZhangOnGithub/terminal-style-ui/releases/latest) [![License: MIT](https://img.shields.io/badge/license-MIT-blue)](https://github.com/ApolloZhangOnGithub/terminal-style-ui/blob/main/LICENSE) ![VSCode](https://img.shields.io/badge/VSCode-%E2%89%A51.90-007ACC?logo=visualstudiocode&logoColor=white) [![Downloads](https://img.shields.io/github/downloads/ApolloZhangOnGithub/terminal-style-ui/total?color=orange)](https://github.com/ApolloZhangOnGithub/terminal-style-ui/releases)

属于 [terminal-style-ui](https://github.com/ApolloZhangOnGithub/terminal-style-ui)（版本 0.1.1）。

**在 VSCode 里用终端 TUI 同款渲染管线预览 Markdown 和任意文件**——与 iTerm/TUI 视觉一致。是同级目录 `terminal-style-ui-web` 渲染库的 VSCode 外壳。

渲染管线：`Markdown → terminal-style-ui-web（pi-tui 定制版 → ANSI → 格子化 HTML）→ VSCode Webview`。扩展进程（Node）负责渲染，Webview 只负责显示。

## 效果

Markdown（左边源文件，右边预览；实时刷新、双向联动滚动）：

<p>
<img src="https://raw.githubusercontent.com/ApolloZhangOnGithub/terminal-style-ui/main/media/vscode-demo-md-dark.png" width="49%" alt="VSCode Markdown dark">
<img src="https://raw.githubusercontent.com/ApolloZhangOnGithub/terminal-style-ui/main/media/vscode-demo-md-light.png" width="49%" alt="VSCode Markdown light">
</p>

任意文件（这里是 Python：按内容判断语言，灰色行号，同 Claude Code）：

<p>
<img src="https://raw.githubusercontent.com/ApolloZhangOnGithub/terminal-style-ui/main/media/vscode-demo-py-dark.png" width="49%" alt="VSCode 代码 dark">
<img src="https://raw.githubusercontent.com/ApolloZhangOnGithub/terminal-style-ui/main/media/vscode-demo-py-light.png" width="49%" alt="VSCode 代码 light">
</p>

## 安装

从 [Releases](https://github.com/ApolloZhangOnGithub/terminal-style-ui/releases) 下载 `terminal-style-ui-vscode-0.1.1.vsix`：

```bash
code --install-extension terminal-style-ui-vscode-0.1.1.vsix
```

自己打包：`npm run package`（先把同级的渲染库连同打包好的依赖拷进 `lib/`，插件自带渲染库，装到哪台机器都能用）。
- 不安装、临时试用：`code --extensionDevelopmentPath="$PWD"`
- 卸载：`code --uninstall-extension apollozhang.terminal-style-ui-vscode`

## 用法

| 场景 | 操作 |
|---|---|
| 边写边看 | 打开任意文件，点编辑器标题栏的终端图标（「在侧边打开终端渲染预览」）。Markdown 照常渲染；代码 / 文本按内容判断类型，带高亮与灰色行号（同 Claude Code）。随编辑实时刷新；左边切到别的文件，预览跟过去 |
| 直接以渲染态打开 | 标签页右键 →「重新打开编辑器的方式…」→「终端风格渲染」（任意后缀都可以）；标题栏「显示源文件」切回文本 |
| 设为默认打开方式 | settings.json 加 `"workbench.editorAssociations": { "*.md": "terminalStyleUi.viewer" }` |
| 资源管理器 | .md 右键 →「打开终端渲染预览」 |
| 导出 | 预览 / 渲染视图 / Markdown 编辑器标题栏「…」→「导出为 HTML」/「导出为 PDF」 |

**联动**：编辑器与预览双向滚动（按块级源码映射对齐）；双击预览跳到源码对应行。

**滚动**：按整行吸附，同终端 / Claude Code 一行一行的手感——视口底边落在行边界上（最底一行完整、最上一行可能被截），拉到最顶除外；滚轮与触控板的滚动量累积满一行才走一行，方向键 / 翻页键按整行走，页内查找跳转后也停在整行上。同终端不显示滚动条。

**选中**：同 iTerm——每行一个整行高、对齐字符格的浅蓝块，选中文字变黑；复制出来带表格边框、代码行号栏，与终端一致。

**字号**：预览获得焦点时 ⌘+ / ⌘- / ⌘0，或触控板捏合（⌘+滚轮）；自动写回设置，所有预览同步，重启后保留。

**主题**：默认跟随 VSCode 颜色主题切换 dark（iTerm 黑底）/ light（TUI 白底）；预览标题栏的 ☀ / ☾ 手动切换（预览获得焦点时显示；切回与 VSCode 一致的那一种时恢复跟随）。

**导出**：按当前预览的列数与主题导出，所见即所得。HTML 为独立文件（内联样式、无脚本，浏览器里也能直接打印）；PDF 借本机 Chrome / Edge / Chromium / Brave 的无界面模式打印成一整张长页（页宽恰好放下这些列、页高恰好放下所有行），阅读器里没有分页白缝。

**奇怪的后缀**：插件按「VSCode 把它识别成 Markdown」判断，不看后缀——
- `.wiki`（任意大小写，如 `.WIKI`）已内置识别为 Markdown。
- 其他后缀：打开该文件，命令面板执行「Terminal Style UI: 将此后缀识别为 Markdown」（写入用户设置 `files.associations`，之后同后缀文件都按 Markdown 识别、预览按钮随之出现）。
- 不想登记也行：任何文件都能用命令面板的「打开终端渲染预览」，或「重新打开编辑器的方式…」→「终端风格渲染」。

命令面板（⇧⌘P）搜「Terminal Style UI」可见全部命令。

## 设置

| 设置 | 默认 | 说明 |
|---|---|---|
| `terminalStyleUi.theme` | auto | auto 跟随 VSCode / dark / light |
| `terminalStyleUi.fontSize` | 13 | 字号（px），与 iTerm 实测对齐；预览里缩放会写回这里 |
| `terminalStyleUi.width` | 0 | 渲染列数；0 = 按面板宽度自动计算（拖动分栏会重排，与终端窗口行为一致） |
| `terminalStyleUi.scrollSync` | true | 编辑器与预览双向联动滚动 |
| `terminalStyleUi.chromePath` | 空 | 导出 PDF 用的浏览器；空 = 自动找 Chrome / Edge / Chromium / Brave |
| `terminalStyleUi.libraryPath` | 空 | 渲染库目录（开发调试用）；空 = 插件自带的渲染库 |

## 测试

- `npm test`：用本机 VSCode 起一个隔离实例（临时 user-data-dir / extensions-dir，剥掉终端环境变量模拟从 Dock 启动），在真实扩展进程里跑 `test/smoke.js`（预览、实时刷新、列数、缩放、主题与 ☀/☾、双向联动、整行滚动、自绘选区、跟随编辑器、后缀识别、自定义编辑器、导出 HTML/PDF、环境卫生）。会短暂弹出一个窗口，跑完自动退出。
- `npm test -- --screenshot`：另截取测试窗口（只截该 VSCode 进程自己的窗口）存进临时目录，供视觉检查。

## 文档

- `DEVELOPMENT.md` —— 架构、技术决策、踩坑
- `LIMITATIONS.md` —— 已知局限
