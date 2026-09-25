// build-core.mjs —— 打包 dist/ttu-core.js（JavaScriptCore / 浏览器）与 dist/runtime.mjs（Node）（2026-09-25 Claude Code）：node scripts/build-core.mjs [runtimePath]
// 把 core.js + runtime 里的 pi-tui（override 版 markdown）/ theme.js / cli-highlight / chalk 打成一个 IIFE（全局 TTU），
// 不依赖 Node：Node 内置模块换成替身（fs 只认内联进来的 dark.json / light.json 主题，其余是无害的空实现）。
import * as esbuild from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// 解析成真实路径：默认位置是指向某个 node_modules 的软链，按软链名查依赖会找不到
const runtime = fs.realpathSync(process.argv[2] || process.env.TSU_RUNTIME || path.join(os.homedir(), ".local/lib/terminal-style-ui/runtime"));
const themeDir = path.join(runtime, "@earendil-works/pi-coding-agent/dist/modes/interactive/theme");
const themes = Object.fromEntries(["dark.json", "light.json"].map((n) => [n, fs.readFileSync(path.join(themeDir, n), "utf8")]));

const NODE_BUILTINS = /^(?:node:)?(?:fs|fs\/promises|path|os|child_process|url|tty|util|crypto|process|events|stream|module|worker_threads|assert|buffer|readline|net|http|https|zlib|perf_hooks|string_decoder|v8|vm)$/;
const stub = `
const THEMES = ${JSON.stringify(themes)};
const noop = function () {};
const special = {
  readFileSync(p) {
    for (const n in THEMES) if (String(p).endsWith("/" + n)) return THEMES[n];
    if (String(p).endsWith("/package.json")) return '{"name":"@earendil-works/pi-coding-agent","version":"0.0.0"}'; // config.js 装载时读
    throw new Error("ttu-core：没有文件系统（" + p + "）"); },
  existsSync: () => false,
  join: (...a) => a.filter(Boolean).join("/").replace(/\\/+/g, "/"),
  resolve: (...a) => a.filter(Boolean).join("/").replace(/\\/+/g, "/"),
  dirname: (p) => String(p).replace(/\\/[^/]*$/, "") || "/",
  basename: (p) => String(p).split("/").pop(),
  extname: (p) => (/\\.[^./]*$/.exec(String(p)) || [""])[0],
  fileURLToPath: (u) => String(u).replace(/^file:\\/\\//, ""),
  pathToFileURL: (p) => ({ href: "file://" + p }),
  homedir: () => "/", tmpdir: () => "/tmp", platform: () => "darwin", release: () => "", EOL: "\\n", sep: "/",
  isatty: () => false, constants: {}, env: {},
};
// 普通对象（不能用 Proxy：esbuild 转 CommonJS 时只复制实际存在的属性）；没列到的函数一律空实现
const NOOPS = ["accessSync", "realpathSync", "statSync", "lstatSync", "readdirSync", "mkdirSync", "writeFileSync", "appendFileSync",
  "watch", "watchFile", "unwatchFile", "createReadStream", "createWriteStream", "spawn", "spawnSync", "execSync", "execFileSync", "exec",
  "createRequire", "normalize", "relative", "isAbsolute", "parse", "format", "cpus", "hostname", "type", "arch", "userInfo",
  "inspect", "promisify", "deprecate", "randomUUID", "createHash", "EventEmitter"];
const api = {};
for (const k of NOOPS) api[k] = noop;
Object.assign(api, special);
api.win32 = api; api.posix = api; api.promises = api;
module.exports = api;
`;

// 纯 JavaScriptCore（Quick Look 扩展里的 JSContext）没有 Node / 浏览器全局：补 process、UTF-8 编解码、console、定时器
const POLYFILLS = `
var global = globalThis; if (typeof globalThis.window === "undefined") globalThis.window = globalThis;
var process = globalThis.process || { env: { COLORTERM: "truecolor", FORCE_COLOR: "3" }, platform: "darwin", versions: {}, argv: [], cwd: function () { return "/"; }, on: function () {}, emitWarning: function () {}, stdout: {}, stderr: {} };
if (typeof globalThis.TextEncoder === "undefined") {
  globalThis.TextEncoder = function () {};
  globalThis.TextEncoder.prototype.encode = function (s) { var b = unescape(encodeURIComponent(String(s === undefined ? "" : s))), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
  globalThis.TextDecoder = function () {};
  globalThis.TextDecoder.prototype.decode = function (a) { if (!a) return ""; var u = a instanceof Uint8Array ? a : new Uint8Array(a.buffer || a), s = ""; for (var i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); try { return decodeURIComponent(escape(s)); } catch (e) { return s; } };
}
if (typeof globalThis.URL === "undefined") {
  globalThis.URL = function (u, base) {
    u = String(u);
    this.href = base !== undefined && !/^[a-z][\\w+.-]*:/i.test(u) ? String(base).replace(/[^/]*$/, "") + u : u;
    var m = /^([a-z][\\w+.-]*:)(?:\\/\\/([^/]*))?([^?#]*)/i.exec(this.href) || [];
    this.protocol = m[1] || ""; this.host = this.hostname = m[2] || ""; this.pathname = m[3] || ""; this.search = ""; this.hash = "";
  };
  globalThis.URL.prototype.toString = function () { return this.href; };
}
if (typeof globalThis.console === "undefined") globalThis.console = { log: function () {}, warn: function () {}, error: function () {}, debug: function () {}, info: function () {} };
if (typeof globalThis.setTimeout === "undefined") { globalThis.setTimeout = function (f) { return 0; }; globalThis.clearTimeout = function () {}; globalThis.setInterval = function () { return 0; }; globalThis.clearInterval = function () {}; }
if (typeof globalThis.queueMicrotask === "undefined") globalThis.queueMicrotask = function (f) { Promise.resolve().then(f); };
`;

await esbuild.build({
  entryPoints: [path.join(root, "scripts/core-entry.js")],
  outfile: path.join(root, "dist/ttu-core.js"),
  bundle: true,
  format: "iife",
  globalName: "TTU",
  platform: "browser",
  target: "safari16",
  minify: true,
  legalComments: "eof",
  define: { "import.meta.url": '"file:///ttu-core/"' },
  banner: { js: POLYFILLS },
  logLevel: "warning",
  plugins: [{
    name: "ttu-runtime",
    setup(b) {
      b.onResolve({ filter: /^RT\// }, (a) => ({ path: path.join(runtime, a.path.slice(3)) }));
      // theme.js 从 pi-tui 入口只取 getCapabilities：指到同一份 terminal-image.js（与 Markdown 共用能力状态），不拉进整个 TUI
      b.onResolve({ filter: /^@earendil-works\/pi-tui$/ }, () => ({ path: path.join(runtime, "@earendil-works/pi-tui/dist/terminal-image.js") }));
      // chalk 只留一份（entry 里设了 level = 3）：theme.js 等处的裸 "chalk" 若解析到另一份，浏览器版等级为 0，粗体 / 颜色全丢
      b.onResolve({ filter: /^chalk$/ }, () => ({ path: path.join(runtime, "chalk/source/index.js") }));
      b.onResolve({ filter: NODE_BUILTINS }, (a) => ({ path: a.path, namespace: "node-stub" }));
      b.onLoad({ filter: /.*/, namespace: "node-stub" }, () => ({ contents: stub, loader: "js" }));
      // 其余裸模块名（marked、typebox、highlight.js…）按 runtime 的 node_modules 解析
      b.onResolve({ filter: /^[^./]/ }, async (a) => {
        if (a.pluginData === "rt") return undefined;
        const r = await b.resolve(a.path, { kind: a.kind, resolveDir: a.resolveDir, pluginData: "rt" });
        if (!r.errors.length) return r;
        return b.resolve(a.path, { kind: a.kind, resolveDir: runtime, pluginData: "rt" });
      });
    },
  }],
});
const size = fs.statSync(path.join(root, "dist/ttu-core.js")).size;
console.log(`dist/ttu-core.js ${(size / 1024).toFixed(0)} KB`);

// 2. dist/runtime.mjs —— Node 侧（index.js / tmd / VSCode 插件）的上游模块，ESM；真 Node 内置模块照常用，
// 只把 theme.js 引的 config.js 换成 config-shim.js（主题 JSON 随包放 dist/themes/）
fs.mkdirSync(path.join(root, "dist/themes"), { recursive: true });
for (const [name, text] of Object.entries(themes)) fs.writeFileSync(path.join(root, "dist/themes", name), text);
await esbuild.build({
  entryPoints: [path.join(root, "scripts/runtime-entry.js")],
  outfile: path.join(root, "dist/runtime.mjs"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  minify: true,
  legalComments: "eof",
  // 打进来的 CommonJS 依赖（cli-highlight、highlight.js）里的 require 需要真的 require
  banner: { js: 'import { createRequire as __tsuCreateRequire } from "node:module"; const require = __tsuCreateRequire(import.meta.url);' },
  logLevel: "warning",
  plugins: [{
    name: "tsu-runtime-node",
    setup(b) {
      b.onResolve({ filter: /^RT\// }, (a) => ({ path: path.join(runtime, a.path.slice(3)) }));
      b.onResolve({ filter: /config\.js$/ }, (a) => (a.importer.includes("/theme/") ? { path: path.join(root, "scripts/config-shim.js") } : undefined));
      b.onResolve({ filter: /^[^./]/ }, async (a) => {
        if (a.pluginData === "rt" || a.path.startsWith("node:")) return undefined;
        const r = await b.resolve(a.path, { kind: a.kind, resolveDir: a.resolveDir, pluginData: "rt" });
        if (!r.errors.length) return r;
        return b.resolve(a.path, { kind: a.kind, resolveDir: runtime, pluginData: "rt" });
      });
    },
  }],
});
// 上游定制版里写死的日志 / 调试目录（家目录下它自己的隐藏目录，如 ~/.<名>/agent、~/.<名>/LogData）改到 ~/.terminal-style-ui/——
// 装了本工具的人不该多出一个无关目录。目录名从代码里认出来（homedir 旁的 "agent"、路径里的 /LogData），不写死
for (const f of ["dist/runtime.mjs", "dist/ttu-core.js"]) {
  const p = path.join(root, f);
  let text = fs.readFileSync(p, "utf8");
  const names = new Set([...text.matchAll(/"\.([a-z]+)","agent"/g), ...text.matchAll(/\/\.([a-z]+)\/LogData/g)].map((m) => m[1]));
  names.delete("terminal-style-ui");
  for (const name of names) text = text.replaceAll(`".${name}"`, '".terminal-style-ui"').replaceAll(`/.${name}/`, "/.terminal-style-ui/");
  fs.writeFileSync(p, text);
}
console.log(`dist/runtime.mjs ${(fs.statSync(path.join(root, "dist/runtime.mjs")).size / 1024).toFixed(0)} KB`);
