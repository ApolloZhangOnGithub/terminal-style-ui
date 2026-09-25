// build.mjs —— 生成 dist/：node scripts/build.mjs（npm run build）
// 只用仓库里的 vendor/（上游依赖，npm run vendor 生成并提交）+ 本库代码，不需要定制版 runtime：
//   dist/runtime.mjs  Node 侧上游模块（= vendor/upstream-node.mjs）+ dist/themes/
//   dist/ttu-core.js  JavaScriptCore / 浏览器用的单文件（IIFE，全局 TTU）：core-entry.js + vendor/upstream-jsc.mjs + 垫片
import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vendor = path.join(root, "vendor");
if (!fs.existsSync(path.join(vendor, "upstream-node.mjs"))) {
  console.error("缺少 vendor/upstream-*.mjs：先 npm run vendor（需要定制版 runtime）");
  process.exit(1);
}

// 1. Node 侧：原样拷贝
fs.mkdirSync(path.join(root, "dist/themes"), { recursive: true });
fs.copyFileSync(path.join(vendor, "upstream-node.mjs"), path.join(root, "dist/runtime.mjs"));
for (const name of fs.readdirSync(path.join(vendor, "themes"))) fs.copyFileSync(path.join(vendor, "themes", name), path.join(root, "dist/themes", name));

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

// 2. JavaScriptCore / 浏览器：本库代码 + vendor/upstream-jsc.mjs 打成一个 IIFE
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
});
for (const f of ["dist/runtime.mjs", "dist/ttu-core.js"]) console.log(`${f} ${(fs.statSync(path.join(root, f)).size / 1024).toFixed(0)} KB`);
