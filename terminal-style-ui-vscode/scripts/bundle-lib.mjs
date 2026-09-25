// bundle-lib.mjs —— 打包前把渲染库拷进插件的 lib/（2026-09-25 Claude Code）：npm run package 自动调用
// 插件自带渲染库（含打包好的上游模块 dist/runtime.mjs 与主题），装到任何机器上都不依赖外部路径
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.resolve(here, "../terminal-style-ui-web");
const lib = path.join(here, "lib");
execFileSync("node", ["scripts/build-core.mjs"], { cwd: web, stdio: "inherit" }); // 先重新打包上游模块
const files = ["index.js", "core.js", "ansi-to-html.js", "highlight-themes.js", "terminal.css", "dist/runtime.mjs", "dist/themes/dark.json", "dist/themes/light.json"];
for (const f of files) {
  fs.mkdirSync(path.dirname(path.join(lib, f)), { recursive: true });
  fs.copyFileSync(path.join(web, f), path.join(lib, f)); // 覆盖同名旧文件
}
fs.writeFileSync(path.join(lib, "package.json"), '{ "type": "module" }\n'); // lib/*.js 是 ESM
console.log(`lib/ ← ${files.length} 个文件`);
