# upstream —— 定制版 pi-tui / pi-coding-agent 源码

渲染核心（Markdown 排版、表格、代码块、主题、终端界面组件）来自 [pi](https://github.com/earendil-works/pi)（Mario Zechner，MIT 许可）的 `@earendil-works/pi-tui` 与 `@earendil-works/pi-coding-agent` 0.80.7，并在其上做了定制：标题去下划线与黄色、代码块去围栏行改行号栏、表格与引用样式、全角序号按两格排版、终端交互界面的全屏 / 选区 / 滚动等。

这里只收了打包实际用到的文件（按原包内路径），`pi-coding-agent/node_modules/@earendil-works/pi-tui` 是它依赖的那份 pi-tui（与顶层那份有少量差异，按原样保留）。第三方依赖（marked、chalk、cli-highlight、highlight.js、typebox 等）不在这里，由上一级 `package.json` 锁定版本、npm 安装。

## 用法

- `npm run vendor`：由这里的源码 + node_modules 生成 `vendor/`（提交进仓库）；CI 每次都会重新生成并确认与提交的一致。
- 改渲染行为：直接改这里的文件，再 `npm run vendor && npm run build && npm test`。
- 升级上游：`node scripts/import-upstream.mjs <新 runtime 的 node_modules>` 重新导入（会按打包实际用到的文件重新挑选）。

许可：上游为 MIT，保留原版权声明（见各包 `package.json` 的 author / license）；本仓库的改动同为 MIT。
