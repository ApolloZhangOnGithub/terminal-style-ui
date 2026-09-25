// build.mjs —— 把 docs/blog.md 做成 docs/index.html（GitHub Pages）：node docs/build.mjs（先在 terminal-style-ui-web 里 npm run build）
// 页面是一段 Claude Code 会话：用户的一句话（> 提示），然后是 ⏺ 开头的回答。排版在浏览器里现场做——打包版渲染核心
// （ttu-core.js）按窗口实际能放下的列数排，窗口缩放、浏览器缩放都会重排，所以永远铺满整宽。
// 每个 ## 小节是一段 ⏺；单独成行的图片是一次 ⏺ Read(…) 工具调用，图片挂在 ⎿ 下面，高度取整到行，整页仍是一张行格。
// 同 VSCode 预览：选区自己画（整行高、对齐字符格），滚轮 / 触控板 / 键盘按整行滚动
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.join(here, "../terminal-style-ui-web");
const css = fs.readFileSync(path.join(web, "terminal.css"), "utf8");
fs.copyFileSync(path.join(web, "dist/ttu-core.js"), path.join(here, "ttu-core.js"));

const PROMPT = "好的写一篇博客详细讲讲，带上图，然后这个博客本身就用这个渲染，随便找个网页发上去";
const source = fs.readFileSync(path.join(here, "blog.md"), "utf8");
const title = /^# (.+)$/m.exec(source)[1];
const description = /^> (.+)$/m.exec(source)[1].replace(/[*`]/g, "").slice(0, 120);

// 切段：[{ prompt }, { md }, { img, alt, file, w, h }, { md }, …]——图片单独成段，## 标题另起一段
const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;
const parts = [{ prompt: PROMPT }];
let buffer = [];
let inFence = false;
const flush = () => {
  if (buffer.join("\n").trim()) parts.push({ md: buffer.join("\n").trim() });
  buffer = [];
};
for (const line of source.split("\n")) {
  if (/^```/.test(line)) inFence = !inFence;
  const image = !inFence && IMAGE_LINE.exec(line);
  if (image) {
    flush();
    const file = image[2].replace(/^.*\/main\//, ""); // raw 链接 → 仓库内路径（Read 的参数；尺寸读本地文件）
    const png = fs.readFileSync(path.join(here, "..", file));
    parts.push({ alt: image[1], img: image[2], file, w: png.readUInt32BE(16), h: png.readUInt32BE(20) });
    continue;
  }
  if (!inFence && /^## /.test(line)) flush();
  buffer.push(line);
}
flush();

const escAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
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
html { background: #000; }
html.light { background: #fff; }
body { margin: 0; }
/* 整页一个终端：pre 铺满，左右各留 2 格 */
#page { position: relative; }
#term { --ttu-font-size: 14px; padding: 0 2ch; overflow: visible; background: transparent; position: relative; z-index: 0; }
@media (max-width: 600px) { #term { --ttu-font-size: 12px; padding: 0 1ch; } }
#term a { color: inherit; text-decoration: none; }
#term a:hover { background: rgba(127, 127, 127, 0.2); }
#term .fig { display: block; box-sizing: border-box; user-select: none; -webkit-user-select: none; }
#term .fig img { display: block; border-radius: 6px; }
/* 选区自己画（同 iTerm：浅蓝底、黑字），垫在文字之下；制表符的透明字形选中后仍透明 */
#term::selection, #term ::selection { background: transparent; color: #000; }
#term .ttu-box::selection { color: transparent; -webkit-text-fill-color: transparent; }
#sel { position: absolute; left: 0; top: 0; z-index: -1; pointer-events: none; }
#sel > div { position: absolute; background: #b5d5ff; }
#toggle { position: fixed; top: 12px; right: 14px; z-index: 2; width: 32px; height: 32px; border-radius: 16px; border: 1px solid rgba(127, 127, 127, 0.35);
  background: rgba(127, 127, 127, 0.15); color: #aaa; font-size: 16px; cursor: pointer; }
</style>
<script>
  // 主题：手动选过的优先，否则跟随系统；首帧前定下，浅色不会先闪一下黑底
  if (localStorage.getItem("tsu-theme") ? localStorage.getItem("tsu-theme") === "light" : matchMedia("(prefers-color-scheme: light)").matches)
    document.documentElement.classList.add("light");
</script>
</head>
<body>
<button id="toggle" title="切换深色 / 浅色">☾</button>
<div id="page"><div id="sel"></div><pre id="term" class="terminal-style-ui">
⏺ 正在渲染…</pre></div>
<noscript><p style="color:#888;font:14px sans-serif;padding:0 2em">这个页面在浏览器里现场排版，需要 JavaScript。原文见 <a href="https://github.com/ApolloZhangOnGithub/terminal-style-ui/blob/main/docs/blog.md">docs/blog.md</a>。</p></noscript>
<script src="ttu-core.js"></script>
<script>
(function () {
  var PARTS = ${JSON.stringify(parts).replace(/</g, "\\u003c")};
  var FOOTER = "本页由 [terminal-style-ui](https://github.com/ApolloZhangOnGithub/terminal-style-ui) 在你的浏览器里现场渲染：窗口多宽，就排多少列。";
  var root = document.documentElement, term = document.getElementById("term"), selLayer = document.getElementById("sel");
  var toggle = document.getElementById("toggle");
  var ESC = "\\x1b", RESET = ESC + "[0m";
  var chPx = 8, rowH = 17, cols = 0, theme = "";

  function measure() {
    var probe = document.createElement("span");
    probe.textContent = "0".repeat(100);
    term.appendChild(probe);
    chPx = probe.getBoundingClientRect().width / 100;
    probe.remove();
    var style = getComputedStyle(term);
    rowH = parseFloat(style.lineHeight);
    return Math.max(24, Math.floor((term.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)) / chPx));
  }
  var html = function (lines) { return TTU.ansiToHtml(lines.join("\\n"), theme, { widthOf: TTU.visibleWidth, links: true }); };
  var pad = function (s, n) { var w = TTU.visibleWidth(s); return w < n ? s + " ".repeat(n - w) : s; };
  var trim = function (lines) {
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    return lines;
  };
  // ⏺ 开头、其余行缩进 2 格（同 Claude Code 的回答）
  function answer(md, dot) {
    var lines = trim(TTU.markdownLines(md, { width: cols - 2, theme: theme }));
    return lines.map(function (l, i) { return (i ? "  " : dot + " ") + l; });
  }
  function render() {
    var light = root.classList.contains("light");
    theme = light ? "light" : "dark";
    term.classList.toggle("ttu-light", light);
    cols = measure();
    var bold = ESC + "[1m", dim = ESC + "[38;2;" + (light ? "120;120;120" : "140;140;140") + "m", green = ESC + "[38;2;78;186;101m";
    var promptBg = ESC + "[48;2;" + (light ? "230;230;230" : "55;55;55") + "m";
    var out = [], lines = ["", ""]; // 顶上空两行：右上角的切换按钮不压字
    PARTS.forEach(function (p, i) {
      if (i) lines.push("");
      if (p.prompt) {
        // 用户的话：> 开头、灰底铺满整行
        trim(TTU.markdownLines(p.prompt, { width: cols - 4, theme: theme })).forEach(function (l, j) {
          lines.push(promptBg + pad((j ? "  " : "> ") + l, cols) + RESET);
        });
      } else if (p.md) {
        lines.push.apply(lines, answer(p.md, "⏺"));
      } else {
        // 图片：一次 Read 工具调用，图挂在 ⎿ 下面；块高取整到行，整页仍是一张行格
        lines.push(green + "⏺" + RESET + " " + bold + "Read" + RESET + "(" + p.file + ")");
        lines.push("  ⎿  " + dim + p.alt + RESET);
        out.push(html(lines));
        lines = [];
        var w = Math.min((cols - 6) * chPx, p.w / 2, 1200), h = w * p.h / p.w;
        out.push('<span class="fig" style="padding-left:' + 5 * chPx + "px;padding-top:" + rowH / 3 + "px;height:" + Math.ceil(h / rowH + 0.5) * rowH + 'px">' +
          '<img src="' + p.img + '" alt="' + p.alt.replace(/"/g, "&quot;") + '" width="' + Math.round(w) + '" height="' + Math.round(h) + '" loading="lazy" decoding="async"></span>');
      }
    });
    lines.push("");
    answer(FOOTER, "⏺").forEach(function (l) { lines.push(dim + l + RESET); });
    lines.push("");
    out.push(html(lines));
    // 文本段与图片块之间不加换行：图片块自己占整行
    term.innerHTML = out.join("");
    toggle.textContent = light ? "☾" : "☀";
    paintSelection();
  }

  // ---- 选区：按行合并浏览器给的矩形，每行画一个整行高、对齐字符格的块 ----
  function paintSelection() {
    var blocks = [], sel = document.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount) {
      var box = term.getBoundingClientRect(), padLeft = parseFloat(getComputedStyle(term).paddingLeft), rows = new Map();
      Array.prototype.forEach.call(sel.getRangeAt(0).getClientRects(), function (r) {
        var midY = (r.top + r.bottom) / 2;
        if (midY < box.top || midY > box.bottom || r.height > rowH * 1.5) return; // 图片块不算
        var row = Math.floor((midY - box.top) / rowH);
        var c0 = Math.round((r.left - box.left - padLeft) / chPx), c1 = Math.round((r.right - box.left - padLeft) / chPx);
        var cur = rows.get(row);
        rows.set(row, cur ? [Math.min(cur[0], c0), Math.max(cur[1], c1)] : [c0, c1]);
      });
      rows.forEach(function (c, row) {
        if (c[1] > c[0]) blocks.push('<div style="top:' + row * rowH + "px;left:" + (padLeft + c[0] * chPx) + "px;width:" + (c[1] - c[0]) * chPx + "px;height:" + rowH + 'px"></div>');
      });
    }
    selLayer.innerHTML = blocks.join("");
  }
  var selFrame = 0;
  document.addEventListener("selectionchange", function () { cancelAnimationFrame(selFrame); selFrame = requestAnimationFrame(paintSelection); });

  // ---- 整行滚动：滚动量攒满一行才走一行，停下时总落在行格上（同终端） ----
  var maxY = function () { return document.documentElement.scrollHeight - window.innerHeight; };
  var scrollByRows = function (n) {
    var y = Math.round(window.scrollY / rowH + n) * rowH;
    window.scrollTo({ top: Math.max(0, Math.min(maxY(), y)), behavior: "instant" });
  };
  var wheelAcc = 0;
  window.addEventListener("wheel", function (e) {
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // 缩放、横向交给浏览器
    e.preventDefault();
    var px = e.deltaMode === 1 ? e.deltaY * rowH : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
    if (Math.sign(px) !== Math.sign(wheelAcc)) wheelAcc = 0; // 反向立即响应
    wheelAcc += px;
    var rows = Math.trunc(wheelAcc / rowH);
    if (!rows) return;
    wheelAcc -= rows * rowH;
    scrollByRows(rows);
  }, { passive: false });
  window.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var page = Math.max(1, Math.floor(window.innerHeight / rowH) - 1);
    var rows = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page, " ": e.shiftKey ? -page : page, Home: -1e7, End: 1e7 }[e.key];
    if (!rows) return;
    e.preventDefault();
    scrollByRows(rows);
  });

  // ---- 重排：列数变了（窗口 / 浏览器缩放）才重排，按比例保住阅读位置 ----
  var resizeFrame = 0;
  window.addEventListener("resize", function () {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(function () {
      if (measure() === cols) return;
      var at = window.scrollY / Math.max(1, maxY());
      render();
      scrollByRows(Math.round(at * maxY() / rowH) - Math.round(window.scrollY / rowH));
    });
  });
  var setTheme = function (light) { root.classList.toggle("light", light); render(); };
  toggle.addEventListener("click", function () {
    var light = !root.classList.contains("light");
    localStorage.setItem("tsu-theme", light ? "light" : "dark");
    setTheme(light);
  });
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", function (e) {
    if (!localStorage.getItem("tsu-theme")) setTheme(e.matches);
  });
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(render);
})();
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(here, "index.html"), page);
console.log(`docs/index.html ${(page.length / 1024).toFixed(0)} KB + ttu-core.js（${parts.length} 段，其中图片 ${parts.filter((p) => p.img).length} 张）`);
