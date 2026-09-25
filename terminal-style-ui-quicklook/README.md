# Terminal Style UI —— Mac 快速查看（Quick Look）

[![Release](https://img.shields.io/github/v/release/ApolloZhangOnGithub/terminal-style-ui?label=release&color=5fd068)](https://github.com/ApolloZhangOnGithub/terminal-style-ui/releases/latest) [![License: MIT](https://img.shields.io/badge/license-MIT-blue)](https://github.com/ApolloZhangOnGithub/terminal-style-ui/blob/main/LICENSE) ![macOS](https://img.shields.io/badge/macOS-13%2B-000000?logo=apple&logoColor=white) [![Downloads](https://img.shields.io/github/downloads/ApolloZhangOnGithub/terminal-style-ui/total?color=orange)](https://github.com/ApolloZhangOnGithub/terminal-style-ui/releases)

属于 [terminal-style-ui](https://github.com/ApolloZhangOnGithub/terminal-style-ui)（版本 0.1.2）。

访达里选中文件按**空格**，用终端 TUI 同款渲染显示：Markdown 照常渲染（表格、代码块、引用……），代码 / 文本带高亮和灰色行号（同 Claude Code，贴左、不画竖线）。字号同 Apple 自带的文本预览（11pt）；按窗口宽度排版，拉宽自动重排；滚轮 / 触控板整行滚动；大文件流式显示（第一屏马上出，其余陆续补上）。类型看内容判断，后缀只是参考（`.WIKI`、`.SPEC`、没后缀的 Makefile 都行）。跟随系统深色 / 浅色。

## 效果

真实的访达 + 快速查看，跟随系统深色 / 浅色：

<p>
<img src="https://raw.githubusercontent.com/ApolloZhangOnGithub/terminal-style-ui/main/media/ql-demo-md-dark.png" width="49%" alt="Quick Look Markdown dark">
<img src="https://raw.githubusercontent.com/ApolloZhangOnGithub/terminal-style-ui/main/media/ql-demo-md-light.png" width="49%" alt="Quick Look Markdown light">
</p>

<p>
<img src="https://raw.githubusercontent.com/ApolloZhangOnGithub/terminal-style-ui/main/media/ql-demo-py-dark.png" width="49%" alt="Quick Look 代码 dark">
<img src="https://raw.githubusercontent.com/ApolloZhangOnGithub/terminal-style-ui/main/media/ql-demo-py-light.png" width="49%" alt="Quick Look 代码 light">
</p>

## 安装

从 [Releases](https://github.com/ApolloZhangOnGithub/terminal-style-ui/releases) 下载 `Terminal-Style-UI-0.1.2.zip`，解压后把 `Terminal Style UI.app` 放进「应用程序」，打开一次（登记预览扩展）。

- 这一版用开发者证书签名、未经 Apple 公证：第一次打开若提示「无法验证开发者」，在访达里右键 App →「打开」，或到 系统设置 → 隐私与安全性 里点「仍要打开」。

自己构建：

```bash
./build.sh              # 打包渲染核心 → 编译 → 签名 → 装到 ~/Applications/Terminal Style UI.app 并登记扩展
```

- 需要 Xcode、Node（打包用）、同级目录 `terminal-style-ui-web`、钥匙串里的 Apple Development 证书（没有时临时签名）。
- 没生效：系统设置 → 通用 → 登录项与扩展 → 快速查看，勾上 Terminal Style UI；或打开一次 App。
- 预览是空白 / 旧的：`qlmanage -r cache`（Quick Look 会缓存失败的结果）。
- 重装时旧版 App 挪到 /tmp，不删除。

## 支持的文件

- Markdown：`.md` `.markdown` 及 `.wiki` `.mdx` `.rmd` `.issue` `.spec` 等（后缀不分大小写）。
- 代码：系统认识的（js / py / swift / c / java / sh / json / yaml / toml / sql …）+ 自己登记的（go / rs / kt / cs / vue / scss / dockerfile / jsonc …），完整清单见 `gen_types.py`。
- 刻意不接管：`.ts`（系统当它是 MPEG-TS 视频）、`.html` / `.svg`（保留网页 / 图片预览）、`.plist`。
- 不支持：没有后缀、系统又判不出类型的文件（Quick Look 不会把 `public.data` 交给第三方扩展）。

超过 8 MB 只显示开头（顶部有提示）。

## 原理

沙盒里没有 Node：渲染核心（`terminal-style-ui-web/core.js` + pi-tui / 主题 / cli-highlight / chalk）用 esbuild 打成一个纯 JS 文件 `dist/ttu-core.js`。扩展自己建 WKWebView（view-based 预览；data-based 的 HTML 里 JS 不执行，只能整篇一次渲染），加载 `shell.html`，页面里按窗口列数分块渲染（`TTU.createFileRenderer`），第一块出来就告诉 Quick Look 显示。输出与 VSCode 插件逐字节一致。

踩坑：Quick Look 跨进程托管预览窗口，WebKit 误判网页看不见、挂起网页进程——第一帧之后滚动 / 追加全成空白。`inactiveSchedulingPolicy = .none` 解决。

## 文件

- `Extension/PreviewProvider.swift` —— 预览扩展（读文件 → WKWebView 加载 shell.html → 交给页面渲染）
- `Extension/shell.html` —— 预览页（流式渲染、按宽度重排、整行滚动、主题首帧生效）
- `App/main.swift` —— 宿主 App（打开时弹说明）
- `gen_types.py` —— 构建时往 Info.plist 填文件类型
- `build.sh` —— 构建安装
