// upstream-jsc-entry.js —— vendor/upstream-jsc.mjs 的打包入口（2026-09-25 Claude Code）
// JavaScriptCore / 浏览器用得到的上游模块（只取渲染需要的，不拉进整个 TUI）。RT/ 前缀由 vendor.mjs 解析到定制版 runtime
export { Markdown } from "RT/@earendil-works/pi-tui/dist/components/markdown.js";
export { setCapabilities } from "RT/@earendil-works/pi-tui/dist/terminal-image.js";
export { visibleWidth, wrapTextWithAnsi } from "RT/@earendil-works/pi-tui/dist/utils.js";
export * as themeJs from "RT/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
export * as cliHighlight from "RT/cli-highlight/dist/index.js";
export { default as hljs } from "RT/highlight.js/lib/index.js";
export { default as chalk } from "RT/chalk/source/index.js";
