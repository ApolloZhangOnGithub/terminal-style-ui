// index.js —— Terminal-Style-UI-Web 渲染入口（2026-09-14 dev-01）
// 把终端 TUI 的渲染管线封装为可复用函数：markdown → pi-tui（定制版）→ ANSI → 格子化 HTML。
// 入口：renderTerminalHtml（网页 / VSCode 预览）、renderTerminalAnsi（只要 ANSI，终端直接输出，如 bin/tmd.mjs）、
// renderFileHtml（任意文件）。渲染逻辑在 core.js，本文件只负责装载打包好的上游模块（dist/runtime.mjs）。
// 使用示例见 README.md。
import { ansiToHtml } from "./ansi-to-html.js";
import * as core from "./core.js";

//FORCE_COLOR 必须在 chalk 装载前设置（否则非 TTY 环境下高亮全被降级为无样式——坑见 DEVELOPMENT.md）
process.env.FORCE_COLOR = "3";
//COLORTERM 同理：pi-tui 按它判断真彩并缓存首次结果；theme.js 引用的是 pi-coding-agent 内嵌的另一份 pi-tui，只能靠环境变量
//（非终端进程如 VSCode 插件里缺它 → 主题色退回 256 色 38;5;N，ansiToHtml 不认——坑见 DEVELOPMENT.md）
process.env.COLORTERM = "truecolor";

// 装载上游模块：全部打在 dist/runtime.mjs 里（npm run build 生成）——pi-tui（定制版 markdown）、theme.js（dark/light 配色）、
// cli-highlight + highlight.js、chalk。动态 import：上面的环境变量要在 chalk / pi-tui 装载前设好。渲染逻辑本身在 core.js
let runtime;
function loadRuntime() {
  runtime ??= import("./dist/runtime.mjs").then((r) => {
    // chalk 的色深直接定死真彩（同打包版 core-entry.js）：只靠 FORCE_COLOR 时，chalk 仍会按运行环境自行判断，
    // 在 CI 等环境里可能判成无色，代码高亮整段丢色
    r.chalk.level = 3;
    return r;
  }).then((r) => ({
    piTui: r.piTui, themeJs: r.themeJs, chalk: r.chalk,
    highlight: r.cliHighlight.highlight, supportsLanguage: r.cliHighlight.supportsLanguage,
    hljs: r.hljs, cliTheme: r.cliHighlight, // 代码高亮快路径（core.js fastHighlight）
    components: { SYM: r.SYM, UserMessageComponent: r.UserMessageComponent }, // tmd 交互界面用
  }));
  return runtime;
}

async function renderLines(markdown, options = {}) {
  const mods = await loadRuntime();
  return core.renderLines(mods, markdown, options);
}

// 只要 ANSI：终端直接输出（bin/tmd.mjs），省掉转 HTML
export async function renderTerminalAnsi(markdown, options = {}) {
  const { lines } = await renderLines(markdown, options);
  return { ansi: lines.join("\n") };
}

export async function renderTerminalHtml(markdown, options = {}) {
  const { lines, blocks, visibleWidth } = await renderLines(markdown, options);
  const ansi = lines.join("\n");
  // 6. 格子化 HTML（格宽用 pi-tui 的 visibleWidth——与排版同源：emoji / ①②③ 占 2 格等规则一致，表格列不错位）
  const html = ansiToHtml(ansi, options.theme ?? "dark", { widthOf: visibleWidth });
  return options.sourceMap ? { ansi, html, blocks } : { ansi, html };
}

// 任意文件：先判断类型（core.detectFile：后缀只是证据之一），Markdown 照常渲染，代码 / 文本包成代码块（高亮 + 行号栏）。
// 返回值同 renderTerminalHtml，另带 detected（{ lang, kind, reason }）
export async function renderFileHtml(fileName, text, options = {}) {
  const detected = core.detectFile(fileName, text);
  if (detected.kind === "markdown") return { ...(await renderTerminalHtml(text, options)), detected };
  // 代码 / 文本：与 Quick Look 同一套分块渲染（行号贴左、不做 Markdown 清洗），这里一次拼齐
  const mods = await loadRuntime();
  const lines = [...core.renderFileChunks(mods, fileName, text, options)].flat();
  const ansi = lines.join("\n");
  const html = ansiToHtml(ansi, options.theme ?? "dark", { widthOf: mods.piTui.visibleWidth });
  if (!options.sourceMap) return { ansi, html, detected };
  // 源码映射精确到行：每个带行号的渲染行就是该源码行的起点（续行不带行号），末尾补哨兵
  const blocks = [];
  lines.forEach((line, row) => {
    const n = /^ *(\d+) /.exec(line.replace(/\x1b\[[0-9;]*m/g, ""));
    if (n) blocks.push({ line: Number(n[1]) - 1, row });
  });
  blocks.push({ line: (blocks.at(-1)?.line ?? -1) + 1, row: lines.length });
  return { ansi, html, blocks, detected };
}

// 任意文件 → 终端用的 ANSI 行：Markdown 照常（左右边距 paddingX）；代码 / 文本按 width − 2×paddingX 排好再整体缩进 paddingX 列
// （终端里正文对齐在 ⏺ 之下，与 Markdown 一致）
function fileLines(mods, fileName, text, { width = 80, theme = "dark", paddingX = 2 } = {}) {
  const detected = core.detectFile(fileName, text);
  if (detected.kind !== "code" && detected.kind !== "text") {
    return { lines: [...core.renderFileChunks(mods, fileName, text, { width, theme, paddingX })].flat(), detected };
  }
  const pad = " ".repeat(paddingX);
  const lines = [...core.renderFileChunks(mods, fileName, text, { width: Math.max(20, width - 2 * paddingX), theme })].flat();
  return { lines: lines.map((line) => (line ? pad + line : line)), detected };
}

export async function renderFileAnsi(fileName, text, options = {}) {
  const { lines, detected } = fileLines(await loadRuntime(), fileName, text, options);
  return { ansi: lines.join("\n"), detected };
}

// 交互界面（bin/tmd.mjs）用：同一套装配，返回 pi-tui、theme.js 与 Markdown 组件工厂——组件挂进 TUI，
// 宽度由 TUI 渲染时给出，窗口变宽窄自动重排；components 为 tmd 用的界面组件（符号表 SYM、用户消息块）
export async function loadTerminalKit(options = {}) {
  const { theme = "dark" } = options;
  const mods = await loadRuntime();
  const mdTheme = core.configureRuntime(mods, theme);
  return {
    piTui: mods.piTui,
    themeJs: mods.themeJs,
    components: mods.components,
    createMarkdown: (markdown) => core.createMarkdown(mods, mdTheme, markdown),
    // 任意文件的组件：Markdown 用 pi-tui 的 Markdown 组件；代码 / 文本按宽度渲染并缓存（窗口变宽窄自动重排）
    createFileView(fileName, text) {
      const detected = core.detectFile(fileName, text);
      if (detected.kind === "markdown") return core.createMarkdown(mods, mdTheme, text);
      let cache = null;
      return {
        render(width) {
          if (cache?.width !== width) cache = { width, lines: fileLines(mods, fileName, text, { width, theme }).lines };
          return cache.lines;
        },
        invalidate() { cache = null; },
      };
    },
  };
}

export { ansiToHtml } from "./ansi-to-html.js";
export { makeHighlightTheme, HIGHLIGHT_LANGS } from "./highlight-themes.js";
export { detectFile, fileToMarkdown } from "./core.js";

// 字素宽度（与排版同源）：给自行转 HTML 的调用方用
export async function getVisibleWidth() {
  return (await loadRuntime()).piTui.visibleWidth;
}
