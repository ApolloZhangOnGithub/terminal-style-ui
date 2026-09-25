// upstream-node-entry.js —— vendor/upstream-node.mjs 的打包入口（2026-09-25 Claude Code；build.mjs 原样拷成 dist/runtime.mjs）
// Node 侧（index.js、tmd、VSCode 插件）用到的上游模块全部从这里出：打包后不再依赖本机 runtime。
// RT/ 前缀由 vendor.mjs 解析到 runtime 的 node_modules（只在构建时需要）。
export * as piTui from "RT/@earendil-works/pi-tui/dist/index.js";
export * as themeJs from "RT/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
export * as cliHighlight from "RT/cli-highlight/dist/index.js";
export { default as hljs } from "RT/highlight.js/lib/index.js";
export { default as chalk } from "RT/chalk/source/index.js";
// tmd 交互界面的组件：⏺ ⎿ ❯ 等符号、用户消息块
export { SYM } from "RT/@earendil-works/pi-coding-agent/dist/modes/interactive/components/blocks_nongod.js";
export { UserMessageComponent } from "RT/@earendil-works/pi-coding-agent/dist/modes/interactive/components/blocks_god.js";
