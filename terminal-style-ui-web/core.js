// core.js —— 渲染核心（2026-09-25 Claude Code，从 index.js 拆出）
// 不碰文件系统、不动态 import：运行时模块（pi-tui / theme.js / cli-highlight / chalk）由调用方传入 mods。
// 两个调用方共用这一份：index.js（Node：从 runtime 动态装载 mods）与 dist/ttu-core.js（esbuild 静态打包，
// 给 Quick Look 扩展的 JavaScriptCore 用——沙盒里没有 Node）。
// 另含「任意文件」：detectFile 判断类型（后缀只是证据之一，内容说了算），fileToMarkdown 转成可渲染的 Markdown。
import { makeHighlightTheme, HIGHLIGHT_LANGS } from "./highlight-themes.js";

// 1–3：装配运行时（终端能力、配色、代码高亮）
export function configureRuntime(mods, theme) {
  const { piTui, themeJs, highlight, chalk, supportsLanguage, hljs, cliTheme } = mods;
  // 终端能力固定为 iTerm 同款（非终端进程默认被判为未知终端 → 链接不走 OSC 8、改印 "文字 (url)"）
  piTui.setCapabilities({ images: null, trueColor: true, hyperlinks: true });
  themeJs.initTheme(theme === "light" ? "light" : "dark");
  const mdTheme = themeJs.getMarkdownTheme();
  const hlTheme = makeHighlightTheme(chalk, theme);
  mdTheme.highlightCode = (code, lang) => {
    try {
      // 常用名单之外的语言（swift / ruby / kotlin…）问 cli-highlight 支不支持；不认识的不传（不传 = 按纯文本）
      const known = lang && (HIGHLIGHT_LANGS.has(String(lang).toLowerCase()) || supportsLanguage?.(String(lang).toLowerCase()));
      const safeLang = known ? lang : undefined;
      // 有 hljs 时走快路径（输出与 cli-highlight 逐字节一致，快约 40 倍）；否则退回 cli-highlight
      if (hljs && cliTheme) return fastHighlight(hljs, cliTheme, code, safeLang, hlTheme).split("\n");
      return highlight(code, { language: safeLang, theme: hlTheme }).split("\n");
    } catch {
      return null;
    }
  };
  return mdTheme;
}

// 代码高亮快路径：cli-highlight 把 highlight.js 输出的 HTML 交给 parse5 解析再上色，parse5 占了 97% 的时间（5000 行 1.7s，
// highlight.js 本身 40ms）。highlight.js 的输出只有 <span class="…">、</span>、转义过的文本三种，这里一遍扫描、按同样的规则上色：
//   hljs-<token> 的 span：子节点先上色（子文本不另加色），整体再套 theme[token] || DEFAULT_THEME[token] || plain；
//   不带 hljs- 的 span：子节点按顶层处理；顶层文本套 theme.default || DEFAULT_THEME.default || plain
function fastHighlight(hljs, cliTheme, code, language, theme) {
  const html = language ? hljs.highlight(code, { language, ignoreIllegals: undefined }).value : hljs.highlightAuto(code).value;
  const { DEFAULT_THEME = {}, plain = (s) => s } = cliTheme;
  const paint = (token) => theme[token] || DEFAULT_THEME[token] || plain;
  const paintTop = theme.default || DEFAULT_THEME.default || plain;
  const stack = [{ token: undefined, parts: [] }];
  const re = /<span class="([^"]*)">|<\/span>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[1] !== undefined) {
      stack.push({ token: /hljs-(\w+)/.exec(m[1])?.[1], parts: [] });
    } else if (m[2] === undefined) {
      const node = stack.pop();
      const inner = node.parts.join("");
      stack[stack.length - 1].parts.push(node.token ? paint(node.token)(inner) : inner);
    } else {
      const top = stack[stack.length - 1];
      const text = decodeEntities(m[2]);
      top.parts.push(top.token === undefined ? paintTop(text) : text);
    }
  }
  return stack[0].parts.join("");
}
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
function decodeEntities(text) {
  return text.indexOf("&") < 0 ? text : text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, (all, dec, hex, name) =>
    dec ? String.fromCodePoint(+dec) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ENTITIES[name] ?? all);
}

// 4. 清洗（与 TUI assistant-message 同源）：剥模型幻觉 XML 标签 + 独立 --- 分隔线（TUI 特意不渲染）。
//    --- 行清空而非删除、记下开头被 trim 掉的行数——保持行号，源码映射据此对回原文（渲染结果与整段剥掉相同）
export function cleanMarkdown(markdown) {
  const cleaned = String(markdown ?? "")
    .replace(/<\/?(?:parameter|function_calls|antml:[a-z_]+)[^>]*>/g, "")
    .replace(/^[ \t]*---[ \t\r]*$/gm, "");
  const lineOffset = (cleaned.match(/^\s*/)[0].match(/\n/g) || []).length;
  return { md: cleaned.trim(), lineOffset };
}

export function createMarkdown(mods, mdTheme, markdown) {
  const c = new mods.piTui.Markdown(cleanMarkdown(markdown).md, 2, 0, mdTheme);
  patchCodeGutter(c, (t) => mods.themeJs.theme.fg("dim", t));
  return c;
}

// 1–5：markdown → pi-tui 渲染出的 ANSI 行
export function renderLines(mods, markdown, options = {}) {
  // paddingX：左右边距列数。默认 2（终端 / TUI：正文对齐在 ⏺ 之下）；页面自带留白的场合（VSCode 预览、Quick Look）传 0
  const { width = 80, theme = "dark", sourceMap = false, clean = true, paddingX = 2 } = options;
  const { piTui } = mods;
  const mdTheme = configureRuntime(mods, theme);
  // clean: false —— 代码 / 文本文件包成的代码块不做 Markdown 清洗（YAML 的 --- 分隔行、代码里的 <parameter> 都是正文）
  const { md, lineOffset } = clean ? cleanMarkdown(markdown) : { md: String(markdown ?? ""), lineOffset: 0 };

  // 5. pi-tui 渲染 → ANSI（尾部填充空格剥离）；sourceMap 时记录每个顶层块渲染出的行
  const c = new piTui.Markdown(md, paddingX, 0, mdTheme);
  patchCodeGutter(c, (t) => mods.themeJs.theme.fg("dim", t));
  if (options.blockCache !== false) cacheTopLevelTokens(c, theme);
  const topBlocks = sourceMap ? traceTopLevelTokens(c) : null;
  const lines = [...c.render(width)].map((l) => String(l).replace(/ +$/, ""));
  const blocks = sourceMap ? buildSourceMap(topBlocks, md, lineOffset, width - 2 * paddingX, lines.length, piTui.wrapTextWithAnsi) : undefined;
  return { lines, blocks, visibleWidth: piTui.visibleWidth };
}

// 代码块行号栏（2026-09-25 用户定稿）：同 Claude Code 的 Write 输出——灰色行号 + 一个空格，不画竖线；续行对齐代码列。
// pi-tui（定制版）画的是「  1 │ 代码」，续行只缩进不画线：这里把「 │ 」去掉、行号染灰，续行少缩进 2 列。
// 行数不变，不影响源码映射；TUI 本身不动。
// 旧版（续行补上竖线，行号栏整列连续）保留在下面的注释里，恢复时换回 patchCodeGutterBar 即可。
function patchCodeGutter(c, dim = (t) => t) {
  const renderToken = c.renderToken.bind(c);
  c.renderToken = (token, ...rest) => {
    const lines = renderToken(token, ...rest);
    if (token.type !== "code") return lines;
    let code = -1; // 去掉竖线后代码起始列（来自最近一个带行号的行）
    return lines.map((line) => {
      const numbered = /^( *)(\d+) │(?: |$)/.exec(line);
      if (numbered) {
        code = numbered[1].length + numbered[2].length + 1;
        return `${numbered[1]}${dim(numbered[2])} ${line.slice(numbered[0].length)}`;
      }
      const indent = " ".repeat(code + 2);
      return code >= 0 && line.startsWith(indent) ? `${" ".repeat(code)}${line.slice(indent.length)}` : line;
    });
  };
}

// 旧版：代码块长行的续行补上行号栏竖线（定制版 pi-tui 续行只用空格缩进到行号栏宽度、不画 │，行号栏在折行处断开）。
// 把续行开头那段等宽空格换成「空格 + │ 」（宽度不变）；续行开头先复位样式——上一行末尾未关闭的颜色会染到竖线上。
// function patchCodeGutterBar(c) {
//   const renderToken = c.renderToken.bind(c);
//   c.renderToken = (token, ...rest) => {
//     const lines = renderToken(token, ...rest);
//     if (token.type !== "code") return lines;
//     let bar = -1; // 行号栏竖线所在列（来自最近一个带行号的行，如 "  1 │ "）
//     return lines.map((line) => {
//       const numbered = /^( *\d+ )│ /.exec(line);
//       if (numbered) {
//         bar = numbered[1].length;
//         return line;
//       }
//       const indent = " ".repeat(bar + 2);
//       return bar >= 0 && line.startsWith(indent) ? `\x1b[0m${" ".repeat(bar)}│ ${line.slice(indent.length)}` : line;
//     });
//   };
// }

// 顶层块渲染缓存（编辑时只重渲染改动的块）：pi-tui 的 render() 对每个顶层块调 renderToken(token, 宽, 后一块类型)，
// 结果只取决于这几样 + 主题——同样的原文、宽度、后一块类型、主题直接用上次的行。嵌套调用（列表项 / 引用里的块，
// 多带一个样式上下文）照常渲染。按最近使用淘汰，最多 BLOCK_CACHE_MAX 块
const BLOCK_CACHE_MAX = 4000;
const blockCache = new Map();
function cacheTopLevelTokens(c, salt) {
  const renderToken = c.renderToken.bind(c);
  let depth = 0;
  c.renderToken = (token, width, nextTokenType, styleContext) => {
    const top = depth === 0 && styleContext === undefined && token.raw;
    const key = top && `${salt}\u0000${width}\u0000${nextTokenType}\u0000${token.type}\u0000${token.raw}`;
    if (top && blockCache.has(key)) {
      const lines = blockCache.get(key);
      blockCache.delete(key); // 挪到最近使用
      blockCache.set(key, lines);
      return lines.slice();
    }
    depth++;
    let lines;
    try {
      lines = renderToken(token, width, nextTokenType, styleContext);
    } finally {
      depth--;
    }
    if (top) {
      blockCache.set(key, lines.slice());
      if (blockCache.size > BLOCK_CACHE_MAX) blockCache.delete(blockCache.keys().next().value);
    }
    return lines;
  };
}

// render() 把每个顶层 token 交给 renderToken（列表项 / 引用内的子 token 会递归进来，只记最外层）
function traceTopLevelTokens(c) {
  const top = [];
  const renderToken = c.renderToken.bind(c);
  let depth = 0;
  c.renderToken = (token, ...rest) => {
    depth++;
    try {
      const lines = renderToken(token, ...rest);
      if (depth === 1) top.push({ raw: token.raw ?? "", lines });
      return lines;
    } finally {
      depth--;
    }
  };
  return top;
}

// 源码映射 [{ line, row }]：每个顶层块在原文的起始行（0 起）→ 渲染出的起始行，末尾补一个哨兵（总行数）。
// 行数按 render() 的折行规则累加（contentWidth = 去掉两侧边距后的内容宽）；与实际输出对不上就返回 null（宁缺毋错）
function buildSourceMap(top, md, lineOffset, contentWidthRaw, totalRows, wrapTextWithAnsi) {
  // 与 lexer 的输入一致：换行归一为 \n（marked 内部同样处理）、tab → 3 空格（render() 里），行号都不变
  const source = md.replace(/\r\n?/g, "\n").replace(/\t/g, "   ");
  const contentWidth = Math.max(1, contentWidthRaw);
  const blocks = [];
  let row = 0, offset = 0, line = lineOffset, counted = 0;
  for (const { raw, lines } of top) {
    const at = raw ? source.indexOf(raw, offset) : -1;
    let pos = at >= 0 ? at : offset;
    if (source[pos] === "\n") pos++; // 空行 token 的 raw 从上一行行尾的 \n 起：归到下一行
    for (; counted < pos; counted++) if (source[counted] === "\n") line++;
    blocks.push({ line, row });
    if (at >= 0) offset = at + raw.length;
    for (const l of lines) row += wrapTextWithAnsi(l, contentWidth).length;
  }
  if (row !== totalRows) return null;
  for (; counted < source.length; counted++) if (source[counted] === "\n") line++;
  blocks.push({ line: line + 1, row });
  return blocks;
}

// ─── 任意文件 ────────────────────────────────────────────────────────────────
// 像人一样看文件：后缀、文件名、首行（#! / 编辑器模式行 / <?xml / <!DOCTYPE）、内容特征都是证据，按分数取最像的。
// 后缀不决定类型：.txt 里是 JSON 就按 JSON，没有后缀的脚本看 #!，.WIKI / .notes 里满是 Markdown 语法就按 Markdown。

// 后缀 / 文件名 → 语言（highlight.js 的语言名；markdown / text 特殊）
const EXT_LANG = {
  md: "markdown", markdown: "markdown", mdown: "markdown", mkd: "markdown", mdx: "markdown", wiki: "markdown", rmd: "markdown",
  txt: "text", text: "text", log: "text",
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
  ts: "typescript", mts: "typescript", cts: "typescript", tsx: "typescript",
  py: "python", pyw: "python", pyi: "python", rb: "ruby", go: "go", rs: "rust", java: "java", kt: "kotlin", kts: "kotlin",
  swift: "swift", c: "c", h: "c", cc: "cpp", cpp: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp", m: "objectivec", mm: "objectivec",
  cs: "csharp", php: "php", pl: "perl", pm: "perl", lua: "lua", r: "r", scala: "scala", dart: "dart", ex: "elixir", exs: "elixir",
  erl: "erlang", hs: "haskell", ml: "ocaml", clj: "clojure", vim: "vim", zig: "zig", nim: "nim", jl: "julia",
  sh: "bash", bash: "bash", zsh: "bash", fish: "bash", ps1: "powershell", bat: "dos", cmd: "dos",
  json: "json", jsonc: "json", json5: "json", jsonl: "json", ipynb: "json", geojson: "json",
  yaml: "yaml", yml: "yaml", toml: "ini", ini: "ini", cfg: "ini", conf: "ini", properties: "properties", env: "bash",
  xml: "xml", plist: "xml", svg: "xml", html: "xml", htm: "xml", xhtml: "xml", vue: "xml",
  css: "css", scss: "scss", less: "less", sql: "sql", graphql: "graphql", gql: "graphql", proto: "protobuf",
  diff: "diff", patch: "diff", dockerfile: "dockerfile", makefile: "makefile", mk: "makefile", cmake: "cmake",
  tex: "latex", gradle: "gradle", groovy: "groovy", nix: "nix", tf: "ini", csv: "text", tsv: "text",
  spec: "text", SPEC: "text", issue: "markdown", ISSUE: "markdown",
};
const NAME_LANG = {
  dockerfile: "dockerfile", makefile: "makefile", gnumakefile: "makefile", rakefile: "ruby", gemfile: "ruby", podfile: "ruby",
  vagrantfile: "ruby", brewfile: "ruby", justfile: "makefile", ".bashrc": "bash", ".zshrc": "bash", ".profile": "bash",
  ".bash_profile": "bash", ".zprofile": "bash", ".gitignore": "text", ".gitconfig": "ini", ".editorconfig": "ini",
  "readme": "markdown", "changelog": "markdown", "license": "text",
};
const SHEBANG_LANG = [
  [/\b(?:ba|z|k|da)?sh\b/, "bash"], [/\bpython[\d.]*\b/, "python"], [/\bnode\b|\bdeno\b|\bbun\b/, "javascript"],
  [/\bruby\b/, "ruby"], [/\bperl\b/, "perl"], [/\bphp\b/, "php"], [/\blua\b/, "lua"], [/\bosascript\b/, "applescript"],
];

// 内容特征：各语言的「一眼认出」信号，每条命中加分
const CONTENT_SIGNALS = {
  markdown: [/^#{1,6} \S/m, /^\s*[-*+] \S/m, /^\s*\d+\. \S/m, /\[[^\]]+\]\([^)]+\)/, /^```/m, /^\|.*\|\s*$/m, /\*\*[^*\n]+\*\*/, /^> \S/m],
  python: [/^\s*def \w+\(.*\):\s*$/m, /^\s*(?:from [\w.]+ )?import [\w.]+/m, /^\s*class \w+(?:\(.*\))?:\s*$/m, /\bself\.\w+/, /^if __name__ == ['"]__main__['"]:/m],
  javascript: [/\b(?:const|let) \w+ = /, /\bfunction\s*\w*\s*\(/, /=>\s*[{(]?/, /\bimport .* from ['"]/, /\bconsole\.log\(/, /\bmodule\.exports\b/],
  typescript: [/:\s*(?:string|number|boolean|void)\b/, /\binterface \w+\s*\{/, /\btype \w+ = /],
  bash: [/^\s*(?:export|alias|source) \w+/m, /\$\{?\w+\}?/, /^\s*(?:if|for|while) .*; (?:then|do)\b/m, /^\s*fi\s*$/m, /\becho\b/],
  go: [/^package \w+/m, /\bfunc (?:\(\w+ \*?\w+\) )?\w+\(/, /:= /],
  rust: [/\bfn \w+\(/, /\blet mut\b/, /\bimpl\b.*\{/, /\buse \w+::/],
  swift: [/\bimport (?:Foundation|SwiftUI|UIKit|AppKit)\b/, /\bfunc \w+\(/, /\bvar \w+: \w+/, /\bguard let\b/],
  c: [/^#include [<"]/m, /\bint main\s*\(/, /\bprintf\(/],
  java: [/\bpublic (?:static )?(?:class|void)\b/, /\bSystem\.out\.println\(/],
  ruby: [/^\s*def \w+[^:(]*$/m, /^\s*end\s*$/m, /\brequire ['"]/, /\bputs\b/],
  yaml: [/^[\w.-]+:\s*(?:\S.*)?$/m, /^\s*- [\w"']/m, /^---\s*$/m],
  ini: [/^\[[\w .-]+\]\s*$/m, /^\s*[\w.-]+\s*=\s*\S/m],
  sql: [/\bSELECT\b[\s\S]*\bFROM\b/i, /\bCREATE TABLE\b/i, /\bINSERT INTO\b/i],
  css: [/^[.#]?[\w-]+(?:[ ,>+~][.#]?[\w-]+)*\s*\{\s*$/m, /^\s*[\w-]+:\s*[^;]+;\s*$/m],
  xml: [/^\s*<\?xml\b/, /^\s*<!DOCTYPE\b/i, /<\/\w+>/],
  diff: [/^@@ -\d+(?:,\d+)? \+\d+/m, /^diff --git /m, /^[-+]{3} \S/m],
};

// → { lang, kind: "markdown" | "code" | "text" | "binary", reason }
export function detectFile(name, text) {
  const base = String(name || "").split("/").pop();
  const lower = base.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
  if (/\u0000/.test(text.slice(0, 8000))) return { lang: null, kind: "binary", reason: "含 NUL 字节" };

  const scores = new Map();
  const vote = (lang, points) => lang && scores.set(lang, (scores.get(lang) ?? 0) + points);
  const extLang = EXT_LANG[ext] ?? EXT_LANG[base.slice(base.lastIndexOf(".") + 1)];
  vote(extLang, 3);
  vote(NAME_LANG[lower] ?? NAME_LANG[lower.replace(/\.[^.]*$/, "")], 3);

  const head = text.slice(0, 20000);
  const firstLine = head.split("\n", 1)[0];
  if (firstLine.startsWith("#!")) for (const [re, lang] of SHEBANG_LANG) if (re.test(firstLine)) vote(lang, 6);
  const mode = /-\*-\s*(?:mode:\s*)?([\w+-]+)\s*(?:;.*)?-\*-|vim?:.*\b(?:ft|filetype)=(\w+)/.exec(head.slice(0, 500));
  if (mode) vote(EXT_LANG[(mode[1] || mode[2]).toLowerCase()] ?? (mode[1] || mode[2]).toLowerCase(), 6);

  const trimmed = head.trim();
  if (/^[{[]/.test(trimmed)) {
    try {
      JSON.parse(text);
      vote("json", 8);
    } catch {
      if (trimmed.split("\n").slice(0, 5).every((l) => { try { JSON.parse(l); return true; } catch { return !l.trim(); } })) vote("json", 6);
    }
  }
  for (const [lang, signals] of Object.entries(CONTENT_SIGNALS)) {
    const hits = signals.filter((re) => re.test(head)).length;
    if (hits) vote(lang, hits >= 2 ? hits * 1.5 : 0.5); // 单条信号太弱（`$x`、`a = b` 到处都有），两条起才算数
  }
  // TypeScript 的信号叠加在 JavaScript 之上
  if (scores.has("typescript") && scores.has("javascript")) vote("typescript", scores.get("javascript") / 2);

  let best = null, bestScore = 0;
  for (const [lang, score] of scores) if (score > bestScore) [best, bestScore] = [lang, score];
  // 拿不准时：有文件名按纯文本；没有文件名（管道 / stdin）按 Markdown——给 tmd 管道的一般就是 Markdown，纯文本按 Markdown 渲染也不走样
  if (!best || bestScore < 2) best = base ? "text" : "markdown";
  const reason = [...scores].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([l, s]) => `${l}:${s}`).join(" ");
  if (best === "markdown") return { lang: "markdown", kind: "markdown", reason };
  if (best === "text") return { lang: null, kind: "text", reason };
  return { lang: best, kind: "code", reason };
}

// 任意文件 → 可交给 renderLines 的 Markdown：Markdown 原样；代码 / 纯文本包进围栏代码块（高亮 + 行号栏），
// 围栏长度取内容里最长反引号串 + 1，内容里有 ``` 也不会提前闭合
export function fileToMarkdown(name, text, detected = detectFile(name, text)) {
  if (detected.kind === "markdown") return text;
  if (detected.kind === "binary") return `**${name || "文件"}** 是二进制文件，没法按文本显示。`;
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  const lang = detected.kind === "code" ? detected.lang : "";
  return `${fence}${lang}\n${text.replace(/\n$/, "")}\n${fence}`;
}

// 任意文件的分块渲染（流式显示：第一块马上出，其余陆续补上）→ 迭代器，每次给出一块 ANSI 行。
// Markdown 整篇一块（通常几十毫秒）；代码 / 文本先整篇高亮一次（chalk 按行闭合颜色，行与行互不影响），再每 chunkLines 行
// 交给 pi-tui 渲染一个代码块。与整篇一次渲染逐字节相同：
//   行号：pi-tui 每块从 1 编起 → 换成真实行号；
//   行号栏宽度：pi-tui 按「块」的行数定位数，位数不同折行宽度也不同 → 块尾补空行凑够整篇的位数，渲染完去掉（空行只出一行）；
//   整个文件就是代码：不要 Markdown 左右边距与代码块缩进，行号贴左边；行号栏同 Claude Code 的 Write 输出——
//   灰色行号 + 一个空格，不画竖线，续行对齐代码列（用户要求）
export function* renderFileChunks(mods, name, text, options = {}) {
  const { width = 100, theme = "dark", chunkLines = 400, paddingX = 2 } = options;
  const detected = detectFile(name, text);
  if (detected.kind !== "code" && detected.kind !== "text") {
    yield renderLines(mods, fileToMarkdown(name, text, detected), { width, theme, paddingX, clean: detected.kind === "markdown" }).lines;
    return;
  }
  // 与 marked 交给 renderToken 的 token.text 一致：换行归一、tab → 3 空格（Markdown 组件整篇替换）、去掉结尾换行
  const source = text.replace(/\r\n?/g, "\n").replace(/\t/g, "   ").replace(/\n$/, "");
  const all = source.split("\n");
  const mdTheme = configureRuntime(mods, theme);
  const lang = detected.kind === "code" ? detected.lang : "";
  const highlighted = mdTheme.highlightCode(source, lang || undefined) ?? all;
  const digits = String(all.length).length;
  const fenceLen = Math.max(2, ...(source.match(/`+/g) ?? []).map((run) => run.length)) + 1;
  const fence = "`".repeat(fenceLen);
  for (let start = 0; start < all.length; start += chunkLines) {
    const count = Math.min(chunkLines, all.length - start);
    const filler = Math.max(0, 10 ** (digits - 1) - count); // 凑够位数的空行
    const chunkHl = highlighted.slice(start, start + count).concat(Array(filler).fill(""));
    const md = `${fence}${lang}\n${all.slice(start, start + count).concat(Array(filler).fill("")).join("\n")}\n${fence}`;
    const saved = mdTheme.highlightCode;
    const savedIndent = mdTheme.codeBlockIndent;
    const c = new mods.piTui.Markdown(md, 0, 0, mdTheme);
    mdTheme.highlightCode = () => chunkHl; // 已整篇高亮过，按块取
    mdTheme.codeBlockIndent = "";
    let lines;
    try {
      lines = [...c.render(width + 2)].map((l) => String(l).replace(/ +$/, "")); // 竖线那 2 列下面会去掉：按 width + 2 排，去掉后正好 width
    } finally {
      mdTheme.highlightCode = saved;
      mdTheme.codeBlockIndent = savedIndent;
    }
    if (filler) lines = lines.slice(0, lines.length - filler);
    // 换成真实行号（位数已凑齐，按原宽度右对齐）、灰色；「 │ 」→「 」；续行（pi-tui 用 行号栏宽 + 3 个空格缩进）去掉竖线那 2 列
    const dim = (t) => mods.themeJs.theme.fg("dim", t);
    const gutter = digits + 3;
    yield lines.map((line) => {
      const numbered = /^( *\d+) │(?: |$)/.exec(line);
      if (numbered) return `${dim(String(Number(numbered[1]) + start).padStart(numbered[1].length))} ${line.slice(numbered[0].length)}`.replace(/ +$/, "");
      return line.startsWith(" ".repeat(gutter)) ? line.slice(2) : line;
    });
  }
}
