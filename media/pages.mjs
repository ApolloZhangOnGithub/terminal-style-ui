// pages.mjs —— 生成截图用的页面：node pages.mjs <输出目录>
// 演示文件（demo.md / demo.py）按 dark / light 渲染，套 Mac 窗口框；另把 tmd 界面的 ANSI（tmd.ans，make.sh 抓的）转成页面
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.join(here, "../terminal-style-ui-web");
const { renderFileHtml, ansiToHtml, getVisibleWidth } = await import(path.join(lib, "index.js"));
const visibleWidth = await getVisibleWidth();
const css = fs.readFileSync(path.join(lib, "terminal.css"), "utf8");
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });

function frame({ title, html, theme, cols, fontSize = 13 }) {
  const light = theme === "light";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${css}
html, body { margin: 0; background: transparent; }
body { padding: 28px; display: inline-block; } /* 截图按 body 实际大小裁 */
.win { border-radius: 12px; overflow: hidden; box-shadow: 0 12px 40px rgba(0,0,0,${light ? 0.18 : 0.45}), 0 0 0 1px rgba(${light ? "0,0,0,0.12" : "255,255,255,0.12"});
  background: ${light ? "#fff" : "#000"}; width: fit-content; }
.bar { height: 30px; display: flex; align-items: center; gap: 8px; padding: 0 12px; background: ${light ? "#ececec" : "#2a2a2a"};
  font: 12px -apple-system, "PingFang SC", sans-serif; color: ${light ? "#555" : "#aaa"}; }
.dot { width: 12px; height: 12px; border-radius: 50%; } .t { flex: 1; text-align: center; margin-right: 60px; }
pre.terminal-style-ui { margin: 0; padding: 14px 16px; --ttu-font-size: ${fontSize}px; width: calc(var(--ttu-cell, 1ch) * ${cols}); }
</style></head><body><div class="win"><div class="bar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span><span class="t">${title}</span></div>
<pre class="terminal-style-ui${light ? " ttu-light" : ""}">${html}</pre></div></body></html>`;
}

// 渲染库样式：13px；页面自带留白，paddingX 0（同 VSCode / Quick Look）
const cols = 76;
for (const name of ["demo.md", "demo.py"]) {
  const text = fs.readFileSync(path.join(here, name), "utf8");
  for (const theme of ["dark", "light"]) {
    const { html } = await renderFileHtml(name, text, { width: cols, theme, paddingX: 0 });
    const base = name.replace(".", "-");
    fs.writeFileSync(path.join(out, `lib-${base}-${theme}.html`), frame({ title: name, html, theme, cols }));
  }
}
// tmd：终端屏幕（pyte 抓下来的 ANSI，tmd-dark.ans / tmd-light.ans）；两张按同样列数，尺寸一致
for (const theme of ["dark", "light"]) {
  const ans = path.join(out, `tmd-${theme}.ans`);
  if (!fs.existsSync(ans)) continue;
  const text = fs.readFileSync(ans, "utf8");
  fs.writeFileSync(path.join(out, `tmd-${theme}.html`), frame({ title: "tmd — 终端", html: ansiToHtml(text, theme, { widthOf: visibleWidth }), theme, cols: 88 }));
}
console.log("pages →", out);
