// build.mjs —— 把 docs/blog.md 做成 docs/index.html（GitHub Pages）：node docs/build.mjs（先在 terminal-style-ui-web 里 npm run build）
// 页面是一段可以“接着问”的 Claude Code 会话：blog.md 里每个 <!-- ask: … --> 是读者的一个问题，其后到下一个问题为止是 ⏺ 的回答；
// 单独成行的图片是一次 ⏺ Present(…) 工具调用（agent 自己发的图）。排版与交互在浏览器里（app.js + 打包版渲染核心 ttu-core.js），这里只切段、拷文件
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.join(here, "../terminal-style-ui-web");
fs.copyFileSync(path.join(web, "dist/ttu-core.js"), path.join(here, "ttu-core.js"));
fs.copyFileSync(path.join(web, "terminal.css"), path.join(here, "terminal.css"));

const source = fs.readFileSync(path.join(here, "blog.md"), "utf8");
const title = /^# (.+)$/m.exec(source)[1];
const description = /^> (.+)$/m.exec(source)[1].replace(/[*`]/g, "").slice(0, 120);

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
    const png = fs.readFileSync(path.join(here, "..", file));
    turns.at(-1).parts.push({ alt: image[1], img: image[2], file, w: png.readUInt32BE(16), h: png.readUInt32BE(20) });
  } else buffer.push(line);
}
flush();

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
<link rel="stylesheet" href="terminal.css">
<link rel="stylesheet" href="app.css">
<script>
  // 主题：手动选过的优先，否则跟随系统；首帧前定下，浅色不会先闪一下黑底
  if (localStorage.getItem("tsu-theme") ? localStorage.getItem("tsu-theme") === "light" : matchMedia("(prefers-color-scheme: light)").matches)
    document.documentElement.classList.add("light");
</script>
</head>
<body>
<div id="desktop">
<video id="wall" muted loop playsinline preload="none"></video>
<div id="menubar"><span class="apple">✻</span><b id="appname">终端</b><span>Shell</span><span>编辑</span><span>显示</span><span>窗口</span><span>帮助</span><span class="sp"></span><span class="tray"><span class="ime">拼</span><svg viewBox="0 0 20 15" width="18" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 5.5a11.5 11.5 0 0 1 16 0"/><path d="M5 8.8a7 7 0 0 1 10 0"/><circle cx="10" cy="12.3" r="1.3" fill="currentColor" stroke="none"/></svg><svg viewBox="0 0 28 14" width="27" height="13"><rect x="1" y="1" width="22" height="12" rx="3.5" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="1.2"/><rect x="3" y="3" width="18" height="8" rx="2" fill="currentColor"/><path d="M24.5 5v4a2 2 0 0 0 0-4z" fill="currentColor" fill-opacity=".45"/><path d="M13.2 2.6 9.5 7.6h3l-1.3 3.8 3.9-5.2h-3z" class="bolt"/></svg><svg viewBox="0 0 20 16" width="18" height="15" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="1" y="1.5" width="18" height="5.5" rx="2.75"/><circle cx="4.2" cy="4.25" r="1.6" fill="currentColor" stroke="none"/><rect x="1" y="9" width="18" height="5.5" rx="2.75"/><circle cx="15.8" cy="11.75" r="1.6" fill="currentColor" stroke="none"/></svg></span><span id="clock"></span><i id="notch"></i></div>
<div class="win" id="win"><div class="body">
  <div class="bar"><i data-act="close" title="关闭"></i><i data-act="min" title="最小化"></i><i data-act="full" title="全屏"></i><span>claude — terminal-style-ui</span><button id="toggle" title="终端外观">◐</button></div>
  <div id="screen"><div id="topgap"></div><div id="page"><pre id="term" class="terminal-style-ui"><div id="sel"></div><span id="out"></span></pre></div></div>
  <pre id="jump" class="terminal-style-ui">Jump to bottom (click) ↓</pre>
  <pre id="foot" class="terminal-style-ui"><span id="input"></span></pre>
</div></div>
<div class="win closed" id="settings"><div class="body">
  <div class="bar"><i data-act="close" title="关闭"></i><i data-act="min" title="最小化"></i><i class="off"></i><span>设置</span></div>
  <div class="pane">
    <section><h3>外观</h3><div class="seg" data-set="theme"><button data-v="auto">自动</button><button data-v="light">浅色</button><button data-v="dark">深色</button></div></section>
    <section><h3>墙纸</h3><div class="walls" data-set="wall">
      <button data-v="tahoe"><img class="sq" src="tahoe-day.jpg" alt=""><span>太浩湖</span></button>
      <button data-v="lake"><img class="sq" src="lake-day.jpg" alt=""><span>The Lake</span></button>
    </div><label class="row"><input type="checkbox" data-set="motion"> 动态墙纸（太浩湖航拍）</label></section>
    <section><h3>文字大小</h3><div class="row"><input type="range" min="11" max="18" step="1" data-set="font"><output data-out="font"></output></div></section>
    <section><h3>生成速度</h3><div class="row"><input type="range" min="20" max="240" step="10" data-set="tps"><output data-out="tps"></output></div>
      <p class="note">模拟 Claude 回答时每秒输出的 token 数。</p></section>
  </div>
</div></div>
<div id="dock" class="sq">
  <a class="app running" data-app="win" title="终端"><span class="ico sq ico-term">&gt;_</span></a>
  <a class="app" data-app="settings" title="系统设置"><span class="ico sq ico-gear">⚙︎</span></a>
  <a class="app" href="https://github.com/ApolloZhangOnGithub/terminal-style-ui" target="_blank" rel="noopener" title="terminal-style-ui（GitHub）"><span class="ico sq ico-folder"></span></a>
  <a class="app" href="https://github.com/ApolloZhangOnGithub/terminal-style-ui/releases" target="_blank" rel="noopener" title="下载（Releases）"><span class="ico sq ico-box">↓</span></a>
</div>
</div>
<noscript><p class="noscript">这个页面在浏览器里现场排版，需要 JavaScript。原文见 <a href="https://github.com/ApolloZhangOnGithub/terminal-style-ui/blob/main/docs/blog.md">docs/blog.md</a>。</p></noscript>
<script id="turns" type="application/json">${JSON.stringify(turns).replace(/</g, "\\u003c")}</script>
<script src="ttu-core.js"></script>
<script src="app.js"></script>
<script src="desk.js"></script>
</body>
</html>
`;
fs.writeFileSync(path.join(here, "index.html"), page);
console.log(`docs/index.html ${(page.length / 1024).toFixed(0)} KB（${turns.length} 问，图片 ${turns.flatMap((t) => t.parts).filter((p) => p.img).length} 张）`);
