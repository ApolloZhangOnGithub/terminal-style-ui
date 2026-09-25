// core-entry.js —— dist/ttu-core.js 的打包入口（2026-09-25 Claude Code）
// 上游模块取自 vendor/upstream-jsc.mjs（npm run vendor 生成、提交进仓库），交给 core.js。
// 产物是一个 IIFE（全局 TTU），在没有 Node 的环境里跑：Quick Look 扩展的 JavaScriptCore、浏览器。
import { Markdown, setCapabilities, visibleWidth, wrapTextWithAnsi, themeJs, cliHighlight, hljs, chalk } from "../vendor/upstream-jsc.mjs";
import * as core from "../core.js";
import { ansiToHtml } from "../ansi-to-html.js";

chalk.level = 3; // 没有终端可探测：固定真彩（同 index.js 的 FORCE_COLOR=3）
const { highlight, supportsLanguage } = cliHighlight;
const mods = { piTui: { Markdown, setCapabilities, visibleWidth, wrapTextWithAnsi }, themeJs, highlight, supportsLanguage, chalk, hljs, cliTheme: cliHighlight };

// 任意文件 → { html, detected }；html 放进 <pre class="terminal-style-ui">（配 terminal.css）
export function renderFile(name, text, options = {}) {
  const { width = 100, theme = "dark" } = options;
  const detected = core.detectFile(name, text);
  const lines = detected.kind === "binary" ? [] : [...core.renderFileChunks(mods, name, text, { width, theme, paddingX: 0 })].flat();
  return { html: ansiToHtml(lines.join("\n"), theme, { widthOf: visibleWidth }), detected };
}
export const detectFile = core.detectFile;

// 流式：逐块取 HTML（第一块马上显示，其余陆续追加）。next() → 一块 HTML，渲染完返回 null
export function createFileRenderer(name, text, options = {}) {
  const { width = 100, theme = "dark", chunkLines = 400 } = options;
  const detected = core.detectFile(name, text);
  const chunks = detected.kind === "binary" ? [][Symbol.iterator]() : core.renderFileChunks(mods, name, text, { width, theme, chunkLines, paddingX: 0 }); // 页面自带留白，不要 Markdown 边距
  return {
    detected,
    next() {
      const { value, done } = chunks.next();
      return done ? null : ansiToHtml(value.join("\n"), theme, { widthOf: visibleWidth });
    },
  };
}
