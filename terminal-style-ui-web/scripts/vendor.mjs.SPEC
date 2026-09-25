# SPEC: scripts/vendor.mjs + build.mjs + core-entry.js（2026-09-25 Claude Code）
# 两步构建，别人不需要定制版 runtime 也能构建：
# 1. vendor.mjs（npm run vendor，只在升级上游时跑，需要定制版 runtime：参数 / TSU_RUNTIME / ~/.local/lib/terminal-style-ui/runtime，先 realpath）
#    → vendor/upstream-jsc.mjs（upstream-jsc-entry.js：Markdown / setCapabilities / visibleWidth / wrapTextWithAnsi / themeJs / cliHighlight / hljs / chalk；
#      platform browser，Node 内置模块换成普通对象替身——fs.readFileSync 只认内联的 dark / light 主题与 package.json；
#      theme.js 的 "@earendil-works/pi-tui" 指到 terminal-image.js；"chalk" 只留一份）
#    → vendor/upstream-node.mjs（upstream-node-entry.js：pi-tui 全量、theme.js、cli-highlight、hljs、chalk、tmd 的 SYM / UserMessageComponent；
#      platform node，config.js 换成 config-shim.js，banner 里 createRequire 给打进来的 CommonJS 用）
#    → vendor/themes/*.json；两个包里上游写死的家目录隐藏目录（从代码里认出来）改成 ~/.terminal-style-ui/。产物提交进仓库。
# 2. build.mjs（npm run build / prepack）：dist/runtime.mjs = vendor/upstream-node.mjs，dist/themes/；dist/ttu-core.js = core-entry.js + vendor/upstream-jsc.mjs
#    打成 IIFE（全局 TTU = { renderFile, createFileRenderer, detectFile }），banner 为 JavaScriptCore 垫片（global / window、process（COLORTERM=truecolor）、
#    TextEncoder/Decoder、URL、console、定时器）。验证：JavaScriptCore 输出与 Node 版逐字节一致。
