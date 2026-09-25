# SPEC: scripts/build-core.mjs + core-entry.js —— 打包 dist/ttu-core.js（2026-09-25 Claude Code）
# node scripts/build-core.mjs [runtimePath]（npm run build:core）。IIFE，全局 TTU = { renderFile(name, text, { width, theme }) → { html, detected },
# detectFile }。依赖从 runtime 取（RT/ 前缀、裸模块名回退到 runtime node_modules），只引 markdown.js / terminal-image.js / utils.js，
# 不拉进整个 TUI；theme.js 的 "@earendil-works/pi-tui" 指到同一份 terminal-image.js；"chalk" 只留一份（entry 设 level 3）。
# Node 内置模块换成普通对象替身（不能用 Proxy：esbuild 转 CJS 只复制实际存在的属性）：fs.readFileSync 只认内联的 dark/light.json 主题
# 与 package.json。开头垫片：global / window、process（env COLORTERM=truecolor）、TextEncoder/Decoder、URL、console、定时器。
# 验证：JavaScriptCore 里输出与 Node 版逐字节一致。
# 0.1.0：另出 dist/runtime.mjs（Node ESM：runtime-entry.js；theme.js 的 config.js 换成 config-shim.js，主题 JSON 拷到 dist/themes/；
# banner 里 createRequire 给打进来的 CommonJS 用）。runtime 路径先 realpath（默认位置是软链，按软链名查依赖会找不到）。
