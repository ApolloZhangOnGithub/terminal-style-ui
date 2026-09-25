<p align="center">
<img src="https://raw.githubusercontent.com/ApolloZhangOnGithub/terminal-style-ui/main/terminal-style-ui-vscode/media/icon.png" width="96" alt="terminal-style-ui">
</p>

<h1 align="center">terminal-style-ui</h1>

<p align="center">终端 TUI 风格的 Markdown / 任意文件渲染——终端里、VSCode 里、访达里，看到的都和终端一模一样。</p>

<p align="center">
<a href="https://github.com/ApolloZhangOnGithub/terminal-style-ui/releases/latest"><img src="https://img.shields.io/github/v/release/ApolloZhangOnGithub/terminal-style-ui?label=release&color=5fd068" alt="Release"></a> <a href="https://github.com/ApolloZhangOnGithub/terminal-style-ui/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT"></a> <a href="https://github.com/ApolloZhangOnGithub/terminal-style-ui/actions/workflows/publish-package.yml"><img src="https://github.com/ApolloZhangOnGithub/terminal-style-ui/actions/workflows/publish-package.yml/badge.svg" alt="Publish package"></a> <a href="https://github.com/ApolloZhangOnGithub/terminal-style-ui/releases"><img src="https://img.shields.io/github/downloads/ApolloZhangOnGithub/terminal-style-ui/total?color=orange" alt="Downloads"></a>
<br>
<a href="https://github.com/ApolloZhangOnGithub/terminal-style-ui/pkgs/npm/terminal-style-ui"><img src="https://img.shields.io/badge/npm-@apollozhangongithub%2Fterminal--style--ui-cb3837?logo=npm" alt="GitHub Packages"></a> <img src="https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white" alt="Node"> <img src="https://img.shields.io/badge/VSCode-%E2%89%A51.90-007ACC?logo=visualstudiocode&logoColor=white" alt="VSCode"> <img src="https://img.shields.io/badge/macOS-13%2B-000000?logo=apple&logoColor=white" alt="macOS"> <a href="https://github.com/ApolloZhangOnGithub/terminal-style-ui"><img src="https://img.shields.io/github/stars/ApolloZhangOnGithub/terminal-style-ui?style=social" alt="Stars"></a>
</p>

<p align="center">
<a href="#安装">安装</a> · <a href="#vscode边写边看">效果</a> · <a href="https://github.com/ApolloZhangOnGithub/terminal-style-ui/releases">下载</a> · <a href="CHANGELOG.md">变更记录</a> · <a href="terminal-style-ui-web/README.md">API 文档</a>
</p>

---

终端 TUI 风格的文档与代码渲染：Markdown / 任意文件 → 与终端里一模一样的排版（制表符表格严丝合缝、中英文对齐、Claude Code 同款代码行号）。一套渲染核心，三个用处：

| 目录 | 是什么 |
|---|---|
| [`terminal-style-ui-web/`](terminal-style-ui-web/) | 渲染库（Node / 浏览器 / JavaScriptCore）+ 命令行 `tmd` |
| [`terminal-style-ui-vscode/`](terminal-style-ui-vscode/) | VSCode 插件：任意文件的侧边实时预览、导出 HTML / PDF |
| [`terminal-style-ui-quicklook/`](terminal-style-ui-quicklook/) | Mac 快速查看：访达里选中文件按空格预览 |

## VSCode：边写边看

<p>
<img src="https://raw.githubusercontent.com/ApolloZhangOnGithub/terminal-style-ui/main/media/vscode-demo-md-dark.png" width="49%" alt="VSCode dark">
<img src="https://raw.githubusercontent.com/ApolloZhangOnGithub/terminal-style-ui/main/media/vscode-demo-md-light.png" width="49%" alt="VSCode light">
</p>

## 访达：按空格预览

<p>
<img src="https://raw.githubusercontent.com/ApolloZhangOnGithub/terminal-style-ui/main/media/ql-demo-md-dark.png" width="49%" alt="Quick Look dark">
<img src="https://raw.githubusercontent.com/ApolloZhangOnGithub/terminal-style-ui/main/media/ql-demo-md-light.png" width="49%" alt="Quick Look light">
</p>

## 终端：tmd

<p>
<img src="https://raw.githubusercontent.com/ApolloZhangOnGithub/terminal-style-ui/main/media/tmd-dark.png" width="49%" alt="tmd dark">
<img src="https://raw.githubusercontent.com/ApolloZhangOnGithub/terminal-style-ui/main/media/tmd-light.png" width="49%" alt="tmd light">
</p>

## 任意文件

后缀只是证据之一，内容说了算：没后缀的脚本看 `#!`，`.txt` 里是 JSON 就按 JSON，`.WIKI` 里满是 Markdown 语法就按 Markdown。代码同 Claude Code 的 Write 输出——灰色行号、不画竖线。

<p>
<img src="https://raw.githubusercontent.com/ApolloZhangOnGithub/terminal-style-ui/main/media/lib-demo-py-dark.png" width="49%" alt="code dark">
<img src="https://raw.githubusercontent.com/ApolloZhangOnGithub/terminal-style-ui/main/media/lib-demo-py-light.png" width="49%" alt="code light">
</p>

## 安装

| 用处 | 安装 |
|---|---|
| VSCode 插件 | [Releases](https://github.com/ApolloZhangOnGithub/terminal-style-ui/releases) 下载 `.vsix` → `code --install-extension terminal-style-ui-vscode-0.1.1.vsix` |
| Mac 快速查看 | Releases 下载 `Terminal-Style-UI-0.1.1.zip`，解压后把 App 放进「应用程序」，打开一次 |
| tmd / 渲染库 | `npm install -g @apollozhangongithub/terminal-style-ui --registry=https://npm.pkg.github.com`（GitHub Packages，需先 `npm login --registry=https://npm.pkg.github.com`） |

所有上游依赖（pi-tui、主题、cli-highlight、highlight.js、chalk）都已打包进去，不需要另装运行时。

## 开发

- 构建：`cd terminal-style-ui-web && npm install && npm run build`（打包上游依赖；构建时需要一份含定制版 pi-tui 的 runtime，位置由 `TSU_RUNTIME` 或 `~/.local/lib/terminal-style-ui/runtime` 给出）
- 配图：`media/make.sh` 一键重拍（演示文件 `media/demo.md`、`media/demo.py`，截图里不含本机路径）；`./make.sh --finder` 另拍真实的访达 + 快速查看（会临时接管访达、切换系统深浅色，拍完恢复）
- 变更记录：[CHANGELOG.md](CHANGELOG.md)
