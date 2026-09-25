// build.mjs —— 把 docs/blog.md 做成 docs/index.html（GitHub Pages）：node docs/build.mjs（先在 terminal-style-ui-web 里 npm run build）
// 页面是一段可以“接着问”的 Claude Code 会话：blog.md 里每个 <!-- ask: … --> 是读者的一个问题，其后到下一个问题为止是 ⏺ 的回答；
// 单独成行的图片是一次 ⏺ Present(…) 工具调用（agent 自己发的图）。排版与交互在浏览器里（app.js + 打包版渲染核心 ttu-core.js），这里只切段、拷文件
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.join(here, "../terminal-style-ui-web");
fs.copyFileSync(path.join(web, "dist/ttu-core.js"), path.join(here, "ttu-core.js"));
fs.copyFileSync(path.join(web, "terminal.css"), path.join(here, "terminal.css"));

const source = fs.readFileSync(path.join(here, "blog.md"), "utf8");
const title = /^# (.+)$/m.exec(source)[1];
const description = /^> (.+)$/m.exec(source)[1].replace(/[*`]/g, "").slice(0, 120);

// 图片：原图是仓库里的 PNG（raw 链接又大又跨域）；构建时转成两份 WebP 放在 Pages 同源——小图默认显示，大图放大时用。原图没变就不重转
function thumb(name) {
  const src = path.join(here, name + ".jpg"), out = path.join(here, "img", "wall-" + name + ".webp");
  if (!fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(src).mtimeMs) execFileSync("cwebp", ["-quiet", "-q", "80", "-resize", "300", "0", src, "-o", out]);
}
["tahoe-day", "tahoe-night", "lake-day", "lake-night"].forEach(thumb);
function webp(src, width) {
  const name = path.basename(src, ".png") + (width > 1000 ? "-l" : "-s") + ".webp", out = path.join(here, "img", name);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (!fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(src).mtimeMs)
    execFileSync("cwebp", ["-quiet", "-q", "82", "-resize", String(Math.min(width, fs.readFileSync(src).readUInt32BE(16))), "0", src, "-o", out]);
  return "img/" + name;
}

// 切段：[{ ask, parts: [{ md } | { img, alt, file, w, h }] }]
const ASK_LINE = /^<!-- ask: (.+?) -->\s*$/;
const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;
const turns = [];
let buffer = [];
let inFence = false;
const flush = () => {
  if (buffer.join("\n").trim()) turns.at(-1).parts.push({ md: buffer.join("\n").trim() });
  buffer = [];
};
for (const line of source.split("\n")) {
  if (/^```/.test(line)) inFence = !inFence;
  const ask = !inFence && ASK_LINE.exec(line);
  const image = !inFence && IMAGE_LINE.exec(line);
  if (ask) {
    if (turns.length) flush();
    turns.push({ ask: ask[1], parts: [] });
  } else if (image) {
    flush();
    const file = image[2].replace(/^.*\/main\//, ""); // raw 链接 → 仓库内路径（Read 的参数；尺寸读本地文件）
    const src = path.join(here, "..", file), png = fs.readFileSync(src);
    turns.at(-1).parts.push({ alt: image[1], file, w: png.readUInt32BE(16), h: png.readUInt32BE(20), img: webp(src, 960), big: webp(src, 2400) });
  } else buffer.push(line);
}
flush();

// 静态文件带上按内容算的版本号：改了就换地址，浏览器不会拿旧缓存
import crypto from "node:crypto";
const v = (f) => f + "?v=" + crypto.createHash("sha1").update(fs.readFileSync(path.join(here, f))).digest("hex").slice(0, 8);
// 语义化全文（给读屏器与搜索引擎）：同一份 blog.md 用 marked 转成 HTML，视觉上隐藏；终端画面对读屏器隐藏
const { marked } = await import(path.join(web, "node_modules/marked/lib/marked.esm.js"));
const article = marked.parse(source.replace(/^<!-- ask: .+ -->$/gm, ""));
const escAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const page = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escAttr(title)}</title>
<meta name="description" content="${escAttr(description)}">
<meta property="og:title" content="${escAttr(title)}">
<meta property="og:description" content="${escAttr(description)}">
<meta property="og:image" content="https://raw.githubusercontent.com/ApolloZhangOnGithub/terminal-style-ui/main/media/vscode-demo-md-dark.png">
<link rel="stylesheet" href="${v("terminal.css")}">
<link rel="stylesheet" href="${v("app.css")}">
<script>
  // 主题：手动选过的优先，否则跟随系统；首帧前定下，浅色不会先闪一下黑底
  if (localStorage.getItem("tsu-theme") ? localStorage.getItem("tsu-theme") === "light" : matchMedia("(prefers-color-scheme: light)").matches)
    document.documentElement.classList.add("light");
</script>
</head>
<body>
<!-- 液态玻璃的折射（Chromium：backdrop-filter: url()）：边缘位移图——中间不动，越靠边背景越往里弯；只作用于玻璃后面的墙纸，玻璃上的字和图标不受影响 -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="lg-bar" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feImage href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'%3E%3Cdefs%3E%3ClinearGradient id='x'%3E%3Cstop offset='0' stop-color='#000'/%3E%3Cstop offset='0.03' stop-color='#800000'/%3E%3Cstop offset='0.97' stop-color='#800000'/%3E%3Cstop offset='1' stop-color='#f00'/%3E%3C/linearGradient%3E%3ClinearGradient id='y' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='#000'/%3E%3Cstop offset='0.4' stop-color='#008000'/%3E%3Cstop offset='0.6' stop-color='#008000'/%3E%3Cstop offset='1' stop-color='#0f0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='100' height='100' fill='url(%23x)'/%3E%3Crect width='100' height='100' fill='url(%23y)' style='mix-blend-mode:screen'/%3E%3C/svg%3E" preserveAspectRatio="none" width="100%" height="100%" result="map"/><feDisplacementMap in="SourceGraphic" in2="map" scale="14" xChannelSelector="R" yChannelSelector="G"/></filter><filter id="lg-dock" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feImage href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'%3E%3Cdefs%3E%3ClinearGradient id='x'%3E%3Cstop offset='0' stop-color='#000'/%3E%3Cstop offset='0.12' stop-color='#800000'/%3E%3Cstop offset='0.88' stop-color='#800000'/%3E%3Cstop offset='1' stop-color='#f00'/%3E%3C/linearGradient%3E%3ClinearGradient id='y' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='#000'/%3E%3Cstop offset='0.3' stop-color='#008000'/%3E%3Cstop offset='0.7' stop-color='#008000'/%3E%3Cstop offset='1' stop-color='#0f0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='100' height='100' fill='url(%23x)'/%3E%3Crect width='100' height='100' fill='url(%23y)' style='mix-blend-mode:screen'/%3E%3C/svg%3E" preserveAspectRatio="none" width="100%" height="100%" result="map"/><feDisplacementMap in="SourceGraphic" in2="map" scale="26" xChannelSelector="R" yChannelSelector="G"/></filter></svg>
<article id="read" class="sr-only" lang="zh-CN">
<p>预设问答，非实时 AI，非 Anthropic 官方页面。</p>
${article}
</article>
<div id="desktop" aria-hidden="true">
<video id="wall" muted loop playsinline preload="none"></video>
<div id="menubar"><span class="apple">✻</span><b id="appname">终端</b><span>Shell</span><span>编辑</span><span>显示</span><span>窗口</span><span>帮助</span><span class="sp"></span><span class="tray"><span class="ime">拼</span><svg viewBox="0 0 20 15" width="18" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 5.5a11.5 11.5 0 0 1 16 0"/><path d="M5 8.8a7 7 0 0 1 10 0"/><circle cx="10" cy="12.3" r="1.3" fill="currentColor" stroke="none"/></svg><svg viewBox="0 0 28 14" width="27" height="13"><rect x="1" y="1" width="22" height="12" rx="3.5" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="1.2"/><rect x="3" y="3" width="18" height="8" rx="2" fill="currentColor"/><path d="M24.5 5v4a2 2 0 0 0 0-4z" fill="currentColor" fill-opacity=".45"/><path d="M13.2 2.6 9.5 7.6h3l-1.3 3.8 3.9-5.2h-3z" class="bolt"/></svg><svg viewBox="0 0 20 16" width="18" height="15" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="1" y="1.5" width="18" height="5.5" rx="2.75"/><circle cx="4.2" cy="4.25" r="1.6" fill="currentColor" stroke="none"/><rect x="1" y="9" width="18" height="5.5" rx="2.75"/><circle cx="15.8" cy="11.75" r="1.6" fill="currentColor" stroke="none"/></svg></span><span id="clock"></span><i id="notch"></i></div>
<div class="win" id="win"><div class="body">
  <div class="bar"><i data-act="close" title="关闭"></i><i data-act="min" title="最小化"></i><i data-act="full" title="全屏"></i><span>claude — terminal-style-ui</span><button id="readall" title="直接看全文" aria-label="直接看全文">≡</button><button id="toggle" title="终端外观">◐</button></div>
  <div id="screen"><div id="topgap"></div><div id="page"><pre id="term" class="terminal-style-ui"><div id="sel"></div><span id="out"></span></pre></div><div id="botgap"></div></div>
  <pre id="jump" class="terminal-style-ui">Jump to bottom (click) ↓</pre>
  <pre id="foot" class="terminal-style-ui"><span id="input"></span></pre>
</div></div>
<div class="win closed" id="settings"><div class="body">
  <div class="bar"><i data-act="close" title="关闭"></i><i data-act="min" title="最小化"></i><i class="off"></i><span>设置</span></div>
  <div class="pane">
    <section><h3>外观</h3><div class="seg" data-set="theme"><button data-v="auto">自动</button><button data-v="light">浅色</button><button data-v="dark">深色</button></div></section>
    <section><h3>墙纸</h3><div class="walls" data-set="wall">
      <button data-v="tahoe-day"><img class="sq" data-src="img/wall-tahoe-day.webp" alt=""><span>太浩湖白天</span></button>
      <button data-v="tahoe-night"><img class="sq" data-src="img/wall-tahoe-night.webp" alt=""><span>太浩湖夜晚</span></button>
      <button data-v="lake-day"><img class="sq" data-src="img/wall-lake-day.webp" alt=""><span>The Lake 白天</span></button>
      <button data-v="lake-night"><img class="sq" data-src="img/wall-lake-night.webp" alt=""><span>The Lake 夜晚</span></button>
    </div><label class="row"><input type="checkbox" data-set="motion"> 动态墙纸（太浩湖是航拍视频）</label></section>
    <section><h3>文字大小</h3><div class="row"><input type="range" min="11" max="18" step="1" data-set="font"><output data-out="font"></output></div></section>
    <section><h3>生成速度</h3><div class="row"><input type="range" min="20" max="240" step="10" data-set="tps"><output data-out="tps"></output></div>
      <p class="note">模拟 Claude 回答时每秒输出的 token 数。</p></section>
  </div>
</div></div>
<div id="dock">
  <a class="app running" data-app="win" title="终端"><span class="ico sq ico-term">&gt;_</span></a>
  <a class="app" data-app="settings" title="系统设置"><span class="ico sq ico-gear">⚙︎</span></a>
  <a class="app" href="https://github.com/ApolloZhangOnGithub/terminal-style-ui" target="_blank" rel="noopener" title="terminal-style-ui（GitHub）"><span class="ico sq ico-folder"></span></a>
  <a class="app" href="https://github.com/ApolloZhangOnGithub/terminal-style-ui/releases" target="_blank" rel="noopener" title="下载（Releases）"><span class="ico sq ico-box">↓</span></a>
</div>
</div>
<noscript><p class="noscript">这个页面在浏览器里现场排版，需要 JavaScript。原文见 <a href="https://github.com/ApolloZhangOnGithub/terminal-style-ui/blob/main/docs/blog.md">docs/blog.md</a>。</p></noscript>
<script id="turns" type="application/json">${JSON.stringify(turns).replace(/</g, "\\u003c")}</script>
<script src="${v("ttu-core.js")}"></script>
<script src="${v("app.js")}"></script>
<script src="${v("desk.js")}"></script>
</body>
</html>
`;
fs.writeFileSync(path.join(here, "index.html"), page);
console.log(`docs/index.html ${(page.length / 1024).toFixed(0)} KB（${turns.length} 问，图片 ${turns.flatMap((t) => t.parts).filter((p) => p.img).length} 张）`);
