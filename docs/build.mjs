// build.mjs —— 把 docs/blog.md 渲染成 docs/index.html（GitHub Pages）：node docs/build.mjs
// 正文用本项目的渲染管线（Markdown → pi-tui → ANSI → 格子化 HTML），链接保留可点；终端没有图片，
// 单独成行的图片在这里切开、插成真正的 <img>。dark / light 各渲染一份，跟随系统，右上角 ☀ / ☾ 可手动切换
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = await import(path.join(here, "../terminal-style-ui-web/index.js"));
const visibleWidth = await lib.getVisibleWidth();
const css = fs.readFileSync(path.join(here, "../terminal-style-ui-web/terminal.css"), "utf8");
const COLS = 92;
const NARROW = 46; // 手机上换成窄版：终端排版不能靠浏览器折行，只能按列数重排一份

const source = fs.readFileSync(path.join(here, "blog.md"), "utf8");
const title = /^# (.+)$/m.exec(source)[1];
const description = /^> (.+)$/m.exec(source)[1].replace(/[*`]/g, "").slice(0, 120);

// 按「单独成行的图片」切段：[{ md }, { img, alt }, { md }, …]
const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;
const parts = [];
let buffer = [];
for (const line of source.split("\n")) {
  const image = IMAGE_LINE.exec(line);
  if (!image) {
    buffer.push(line);
    continue;
  }
  if (buffer.join("\n").trim()) parts.push({ md: buffer.join("\n") });
  buffer = [];
  parts.push({ alt: image[1], img: image[2] });
}
if (buffer.join("\n").trim()) parts.push({ md: buffer.join("\n") });

const escAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
async function renderPage(theme, cols) {
  const out = [];
  for (const part of parts) {
    if (part.img) {
      out.push(`<figure><img src="${escAttr(part.img)}" alt="${escAttr(part.alt)}" loading="lazy" decoding="async"><figcaption>${escAttr(part.alt)}</figcaption></figure>`);
      continue;
    }
    const { ansi } = await lib.renderTerminalAnsi(part.md, { width: cols, theme, paddingX: 0 });
    const html = lib.ansiToHtml(ansi, theme, { widthOf: visibleWidth, links: true });
    out.push(`<pre class="terminal-style-ui${theme === "light" ? " ttu-light" : ""}" style="--cols: ${cols}">${html}</pre>`);
  }
  return out.join("\n");
}

const [dark, light, darkNarrow, lightNarrow] = [await renderPage("dark", COLS), await renderPage("light", COLS), await renderPage("dark", NARROW), await renderPage("light", NARROW)];
const page = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escAttr(title)}</title>
<meta name="description" content="${escAttr(description)}">
<meta property="og:title" content="${escAttr(title)}">
<meta property="og:description" content="${escAttr(description)}">
<meta property="og:image" content="https://raw.githubusercontent.com/ApolloZhangOnGithub/terminal-style-ui/main/media/vscode-demo-md-dark.png">
<style>
${css}
:root { color-scheme: dark light; }
html, body { margin: 0; background: #000; }
html.light, html.light body { background: #fff; }
.page { width: fit-content; max-width: 100%; margin: 0 auto; padding: 40px 20px 60px; box-sizing: border-box; overflow-x: auto; }
/* 字号随屏宽缩小，保证 --cols 列放得下（Monaco 的 1ch ≈ 0.6em）；屏宽不到 ${COLS} 列 × 10px 字号就换 ${NARROW} 列的窄版 */
pre.terminal-style-ui { --ttu-font-size: clamp(9px, calc((100vw - 40px) / var(--cols) / 0.6), 15px); margin: 0; padding: 0; overflow: visible; width: calc(var(--ttu-cell, 1ch) * var(--cols)); }
pre.terminal-style-ui a { color: inherit; text-decoration: none; }
pre.terminal-style-ui a:hover { background: rgba(127, 127, 127, 0.18); }
/* 图片不参与页面宽度（width 0 + min-width 100%）：页面宽 = 正文宽，图片跟着正文宽度走 */
figure { margin: 18px 0 26px; text-align: center; width: 0; min-width: 100%; }
figure img { width: 100%; height: auto; border-radius: 8px; }
figcaption { font: 12px -apple-system, "PingFang SC", sans-serif; color: #888; margin-top: 6px; }
.theme-dark, .theme-light { display: none; }
html:not(.light) .theme-dark.wide, html.light .theme-light.wide { display: block; }
@media (max-width: ${Math.ceil(COLS * 6 + 40)}px) {
  .page { padding: 60px 12px 48px; }
  html:not(.light) .theme-dark.wide, html.light .theme-light.wide { display: none; }
  html:not(.light) .theme-dark.narrow, html.light .theme-light.narrow { display: block; }
}
#toggle { position: fixed; top: 14px; right: 16px; width: 34px; height: 34px; border-radius: 17px; border: 1px solid rgba(127, 127, 127, 0.35);
  background: rgba(127, 127, 127, 0.12); color: #aaa; font-size: 17px; cursor: pointer; }
footer { font: 12px -apple-system, "PingFang SC", sans-serif; color: #777; text-align: center; margin-top: 36px; }
footer a { color: #888; }
</style>
<script>
  // 主题：手动选过的优先，否则跟随系统；在首帧前定下，浅色不会先闪一下黑底
  (function () {
    var saved = localStorage.getItem("tsu-theme");
    var light = saved ? saved === "light" : matchMedia("(prefers-color-scheme: light)").matches;
    if (light) document.documentElement.classList.add("light");
  })();
</script>
</head>
<body>
<button id="toggle" title="切换深色 / 浅色">☾</button>
<div class="page">
<div class="theme-dark wide">
${dark}
</div>
<div class="theme-light wide">
${light}
</div>
<div class="theme-dark narrow">
${darkNarrow}
</div>
<div class="theme-light narrow">
${lightNarrow}
</div>
<footer>本页由 <a href="https://github.com/ApolloZhangOnGithub/terminal-style-ui">terminal-style-ui</a> 渲染</footer>
</div>
<script>
  var toggle = document.getElementById("toggle");
  function sync() { toggle.textContent = document.documentElement.classList.contains("light") ? "☾" : "☀"; }
  toggle.addEventListener("click", function () {
    var light = document.documentElement.classList.toggle("light");
    localStorage.setItem("tsu-theme", light ? "light" : "dark");
    sync();
  });
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", function (e) {
    if (localStorage.getItem("tsu-theme")) return;
    document.documentElement.classList.toggle("light", e.matches);
    sync();
  });
  sync();
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(here, "index.html"), page);
console.log(`docs/index.html ${(page.length / 1024).toFixed(0)} KB（${parts.length} 段，其中图片 ${parts.filter((p) => p.img).length} 张）`);
