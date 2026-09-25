// app.js —— 博客页：一段可以接着问的 Claude Code 会话（数据见 index.html 里的 #turns，由 build.mjs 从 blog.md 切出）
// 排版：打包版渲染核心（TTU）按窗口实际能放下的列数现场排，窗口 / 浏览器缩放都会重排。
// 交互同 Claude Code 全屏模式：对话区滚动，输入栏固定在底部。输入栏里是读者的下一个问题（灰字），打字把它“打”出来，回车发送 →
// 对话末尾出现状态行（· Nesting… (29s · ↓ 846 tokens) 与 ⎿ Tip），回答按源码一行行流出来（同 teyvat 的 line-by-line），
// 答完状态行换成 ✻ Worked for …。回答中不能打断（回车、Esc 都不跳过）；空闲时 Esc = 全文。手机上轻点输入栏提问。
// 滚轮 / 触控板 / 键盘按整行滚动（图片卡在屏幕边上时按像素顺滑滚过去），往回翻时顶上留一个空行、底下出现 Jump to bottom；选区自己画（同 VSCode 预览）
(function () {
  "use strict";
  var TURNS = JSON.parse(document.getElementById("turns").textContent);
  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement, screen = $("screen"), term = $("term"), foot = $("foot"), out = $("out"), input = $("input");
  var selLayer = $("sel"), toggle = $("toggle"), jump = $("jump"), topgap = $("topgap"), win = $("win");
  // 两层外观（同 macOS）：系统（html.light，设置 App 管）与终端自己的（标题栏右侧按钮：跟随系统 / 浅色 / 深色）
  var termPref = function () { return localStorage.getItem("tsu-term") || "auto"; };
  var termLight = function () { var p = termPref(); return p === "auto" ? root.classList.contains("light") : p === "light"; };
  var touch = matchMedia("(pointer: coarse)").matches;
  var ESC = "\x1b", RESET = ESC + "[0m", BOLD = ESC + "[1m";
  var rgb = function (c) { return ESC + "[38;2;" + c + "m"; };
  var ORANGE = rgb("215;119;87"), GREEN = rgb("78;186;101");
  var chPx = 8, rowH = 17, cols = 0, termW = 0, padL = 0, theme = "", DIM = "", cache = {};
  var queued = false; // 回答中又按了回车：下一个问题排队，答完自动发出（同 Claude Code 的 queued message）
  var asked = 0, typed = 0, stream = null, spin = 0, spinTimer = 0, typeTimer = 0, statusEl = null;
  var big = {}; // 放大了的图（键：问号-段号）；默认小图（同备忘录），点一下放大到与正文左右对齐，再点缩回
  var settings = { tps: +(localStorage.getItem("tsu-tps") || 80) }; // 模拟的生成速度（token / 秒）：中文约 1.3 字一个 token
  var VERBS = ["Garnishing", "Pondering", "Crafting", "Brewing", "Noodling", "Percolating", "Simmering", "Conjuring", "Mulling", "Nesting", "Zigzagging", "Tinkering"];
  // Tip 只在合适的时候出：第一问教怎么提问，第一次出图时教点图放大，隔几问再提窗口、设置、重排；其余时候不出
  var TIPS = {
    0: "Tip: Press Enter to ask the next question. On a touch screen, tap the input bar instead.",
    3: "Tip: Drag the title bar to move the window, or drag any edge to resize it. The green light goes full screen.",
    5: "Tip: Open Settings in the Dock to change the wallpaper, text size and generation speed.",
    7: "Tip: Everything here is laid out live by terminal-style-ui. Resize the window and it reflows to the new column count.",
  };
  var IMAGE_TIP = "Tip: Click an image to enlarge it; click again to shrink it back.", imageTipAt = -1;
  function tipFor(t) {
    if (TIPS[t]) return TIPS[t];
    var hasImage = TURNS[t].parts.some(function (p) { return p.img; });
    if (hasImage && (imageTipAt < 0 || imageTipAt === t) && t > 0) { imageTipAt = t; return IMAGE_TIP; }
    return null;
  }

  // ---- 排版 ----
  function measure() {
    var probe = document.createElement("span");
    probe.textContent = "0".repeat(100);
    term.appendChild(probe);
    chPx = probe.getBoundingClientRect().width / 100;
    probe.remove();
    // 格宽直接写成实测值：注册过的 --ttu-cell（1ch）在浏览器缩放后，Safari 不一定重算，格子会按旧宽度挤在一起
    [term, foot, jump].forEach(function (el) { el.style.setProperty("--ttu-cell", chPx + "px"); });
    var style = getComputedStyle(term);
    termW = term.clientWidth;
    padL = parseFloat(style.paddingLeft);
    rowH = parseFloat(style.lineHeight);
    topgap.style.height = rowH + "px";
    topgap.style.marginBottom = -rowH + "px";
    return Math.max(24, Math.floor((term.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)) / chPx));
  }
  var W = function (s) { return TTU.visibleWidth(s); };
  var pad = function (s, n) { var w = W(s); return w < n ? s + " ".repeat(n - w) : s; };
  var toHtml = function (lines) { return TTU.ansiToHtml(lines.join("\n"), theme, { widthOf: TTU.visibleWidth, links: true }); };
  var escHtml = function (s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); };
  // 按显示宽度折行；words = true 时尽量在空格处断（英文）
  function wrap(s, w, words) {
    var lines = [], cur = "", cw = 0;
    (words ? s.split(/(?<= )/) : Array.from(s)).forEach(function (tok) {
      var x = W(tok);
      if (cw + x > w && cur) { lines.push(cur.replace(/ +$/, "")); cur = ""; cw = 0; }
      cur += tok;
      cw += x;
    });
    lines.push(cur);
    return lines;
  }
  function trim(lines) {
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    return lines;
  }
  function box(lines, width, color) {
    var r = [color + "╭" + "─".repeat(width - 2) + "╮" + RESET];
    lines.forEach(function (l) { r.push(color + "│" + RESET + " " + pad(l, width - 4) + " " + color + "│" + RESET); });
    r.push(color + "╰" + "─".repeat(width - 2) + "╯" + RESET);
    return r;
  }

  // 一行 = { k: "t"（文字行）| "b"（块：图片、用户的话）, h: HTML }。文字行之间用 \n，块自己占整行；空行写成一个空格（块前的空行才不会被吞）
  function Rows() { this.rows = []; this.pending = []; }
  Rows.prototype.text = function (lines) { this.pending.push.apply(this.pending, lines); return this; };
  Rows.prototype.flush = function () {
    var self = this;
    if (this.pending.length) toHtml(this.pending).split("\n").forEach(function (h) { self.rows.push({ k: "t", h: h || " " }); });
    this.pending = [];
    return this;
  };
  Rows.prototype.block = function (h) { this.flush().rows.push({ k: "b", h: h }); return this; };
  function join(rows) {
    var s = "", prev = "";
    rows.forEach(function (r) {
      if (prev === "t" && r.k === "t") s += "\n";
      s += r.h;
      prev = r.k;
    });
    return s;
  }

  function banner() {
    var w = Math.min(cols, 76);
    var body = [ORANGE + "✻" + RESET + " " + BOLD + "Welcome to terminal-style-ui" + RESET, ""];
    ["这是一段 Claude Code 会话：你来提问，Claude 讲它和一位用户怎样用一天做出了这个项目。",
     "整页由这个项目自己渲染，在你的浏览器里现场排版——窗口多宽，就排多少列。"].forEach(function (p) {
      wrap(p, w - 4).forEach(function (l) { body.push(DIM + l + RESET); });
    });
    body.push("", DIM + "\x1b]8;;https://github.com/ApolloZhangOnGithub/terminal-style-ui\x07github.com/ApolloZhangOnGithub/terminal-style-ui\x1b]8;;\x07" + RESET);
    return new Rows().text(box(body, w, ORANGE)).flush().rows;
  }
  // ⏺ 开头、其余行缩进 2 格（同 Claude Code 的回答）
  function answer(md) {
    // ⏺ 用正文灰（dark 即默认前景 #c7c7c7；light 的默认前景近黑，另给 #555）
    var dot = theme === "light" ? rgb("85;85;85") + "⏺" + RESET : "⏺";
    // ⏺ 顶着左边，正文一直排到右边（只让出「⏺ 」两格）
    return trim(TTU.markdownLines(md, { width: cols - 2, theme: theme })).map(function (l, i) { return (i ? "  " : dot + " ") + l; });
  }
  // 一问一答的行。upto = { part, lines }：只含前 part 段 + 第 part 段的前 lines 行源码（流式输出中）；不传 = 全文
  function turnRows(t, upto) {
    var turn = TURNS[t], key = t + "|" + cols + "|" + theme + "|" + JSON.stringify(big) + "|" + (turn.worked || "");
    if (!upto && cache[key]) return cache[key];
    var r = new Rows().text([""]);
    var ask = wrap(turn.ask, cols - 2).map(function (l, i) { return pad((i ? "  " : "❯ ") + l, cols); });
    r.block('<span class="ask">' + toHtml(ask) + "</span>");
    turn.parts.forEach(function (p, i) {
      if (upto && i > upto.part) return;
      var md = p.md && upto && i === upto.part ? p.md.split("\n").slice(0, upto.lines).join("\n") : p.md;
      if (upto && i === upto.part && !(md && md.trim())) return;
      r.text([""]);
      if (p.md) return r.text(answer(md));
      // 图片：agent 自己发的图——一次 Present 工具调用，图挂在 ⎿ 下面；块高取整到行，整屏仍是一张行格
      r.text([GREEN + "⏺" + RESET + " " + BOLD + "Present" + RESET + "(" + p.file + ")", "  ⎿  Presented " + BOLD + "1" + RESET + " image"]);
      // 左边都挂在 ⎿ 后（第 5 列）；小图约 40 列宽，大图右边缘与左边缘对称（离窗口右边与左边一样远）
      var id = t + "-" + i, inset = padL + 5 * chPx, w = big[id] ? termW - 2 * inset : Math.min(termW - 2 * inset, Math.max(240, 40 * chPx)), h = w * p.h / p.w;
      r.block('<span class="fig" data-fig="' + id + '" style="padding-left:' + 5 * chPx + "px;padding-top:" + rowH / 3 + "px;height:" + Math.ceil(h / rowH + 0.5) * rowH + 'px">' +
        '<img class="sq" src="' + escHtml(p.img) + '" alt="' + escHtml(p.alt) + '" title="' + escHtml(p.alt) + (big[id] ? "（点一下缩小）" : "（点一下放大）") +
        '" width="' + Math.round(w) + '" height="' + Math.round(h) + '" decoding="sync"></span>');
    });
    // 一轮结束：✻ Worked for 34s · done 10:54 PM（取代答题时的状态行，位置相同）
    if (!upto && turn.worked) r.text(["", DIM + "✻ " + turn.worked + RESET]);
    var rows = r.flush().rows;
    return upto ? rows : (cache[key] = rows);
  }
  var upto = function () { return stream && { part: stream.part, lines: stream.lines }; };

  // ---- 对话末尾的状态行：· Nesting… (29s · ↓ 846 tokens) + ⎿ Tip；空闲时只剩一个空行（与输入栏之间的黑行）----
  var SPIN = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];
  function renderStatus() {
    var r = new Rows();
    if (stream) {
      var secs = Math.floor((Date.now() - stream.t0) / 1000), tok = stream.tokens < 1000 ? stream.tokens : (stream.tokens / 1000).toFixed(1) + "k";
      r.text(["", ORANGE + SPIN[spin % SPIN.length] + " " + stream.verb + "…" + RESET + DIM + " (" + secs + "s · ↓ " + tok + " tokens" +
        (stream.thinking && cols >= 70 ? " · thinking with medium effort" : "") + ")" + RESET]);
      var tip = tipFor(stream.t);
      if (tip) wrap(tip, cols - 5, true).forEach(function (l, i) { r.text([(i ? "     " : "  ⎿  ") + DIM + l + RESET]); });
      // 排队的问题（同 Claude Code）：灰底条，暗色的 ❯；下面一行提示 ctrl+enter 立刻发
      if (queued && asked < TURNS.length) {
        r.text([""]);
        var qlines = wrap(TURNS[asked].ask, cols - 2).map(function (l, i) { return pad((i ? "  " : DIM + "❯" + RESET + " ") + l, cols); });
        r.block('<span class="ask">' + toHtml(qlines) + "</span>");
        r.text(["  " + DIM + "ctrl+enter to send now" + RESET]);
      }
    }
    r.text([""]);
    statusEl.innerHTML = join(r.flush().rows);
  }
  // ---- 输入栏（固定在底部）：上下各一条灰线，上线右侧带会话名（同 Claude Code）----
  // 输入栏里的预览（还没“打”出来的灰字）用一个专属的灰：app.css 按它在 hover 时把预览提亮，表示可以点
  var PH = "";
  function renderInput() {
    PH = rgb(theme === "light" ? "131;131;130" : "121;121;122");
    var q = asked < TURNS.length ? TURNS[asked].ask : "";
    // 回答中输入栏照样是下一个问题，可以接着打；排队后输入栏清空
    var text = queued || !q ? DIM + (q ? "" : "问完了，谢谢你读到这里 ✻") + RESET : "";
    var left = typed, shown = queued || !q ? [text] : wrap(q, cols - 2).map(function (l) {
      var n = Math.max(0, Math.min(l.length, left)); // 打字进度按字数切到各行
      left -= l.length;
      return l.slice(0, n) + PH + l.slice(n) + RESET;
    });
    // 输入栏的两条横线撑满窗口左右（#foot 不留边，列数按整个窗口宽算）；❯ 那一行与对话正文同列缩进
    var fcols = Math.max(24, Math.floor(foot.clientWidth / chPx)), indent = " ".repeat(Math.round(padL / chPx));
    var label = " terminal-style-ui · blog ", top = DIM + "─".repeat(Math.max(2, fcols - W(label) - 2)) + label + "──" + RESET;
    var rows = new Rows().text([top].concat(shown.map(function (l, i) { return indent + (i ? "  " : "❯ ") + l; }), [DIM + "─".repeat(fcols) + RESET])).flush().rows;
    input.innerHTML = join(rows);
  }

  // 对话区：开场框、每轮问答各是一个块（块自带换行，块内按行拼），最后是状态行块；流式输出只重画正在回答的那一块
  function turnBlock(rows) {
    var el = document.createElement("span");
    el.className = "blk";
    el.innerHTML = join(rows);
    out.insertBefore(el, statusEl);
    return el;
  }
  function renderAll() {
    var light = termLight();
    theme = light ? "light" : "dark";
    win.classList.toggle("tl", light);
    DIM = rgb(light ? "130;130;130" : "120;120;120");
    term.classList.toggle("ttu-light", light);
    foot.classList.toggle("ttu-light", light);
    jump.classList.toggle("ttu-light", light);
    var pref = termPref();
    toggle.textContent = pref === "auto" ? "◐" : pref === "light" ? "☀" : "☾";
    toggle.title = "终端外观：" + (pref === "auto" ? "跟随系统" : pref === "light" ? "浅色" : "深色") + "（点一下切换）";
    var ch0 = chPx, w0 = termW, next = measure();
    if (next !== cols || chPx !== ch0 || termW !== w0) cache = {};
    cols = next;
    out.innerHTML = '<span class="blk" id="status"></span>';
    statusEl = $("status");
    turnBlock(banner());
    for (var t = 0; t < asked; t++) {
      var el = turnBlock(turnRows(t, stream && stream.t === t ? upto() : null));
      if (stream && stream.t === t) stream.el = el;
    }
    renderStatus();
    renderInput();
    paintSelection();
    onScroll();
  }

  // ---- 提问与流式输出 ----
  var nearBottom = function () { return screen.scrollHeight - screen.clientHeight - screen.scrollTop < rowH * 3; };
  var toBottom = function () { screen.scrollTop = screen.scrollHeight; };
  // 图片预先解码：Present 时直接出整张，不会先白一下
  TURNS.forEach(function (turn) {
    turn.parts.forEach(function (p) {
      if (!p.img) return;
      var img = new Image();
      img.src = p.img;
      p.ready = (img.decode ? img.decode() : Promise.resolve()).catch(function () {});
    });
  });
  function stopTimers() {
    clearTimeout(typeTimer);
    typeTimer = 0;
    if (stream) clearTimeout(stream.timer);
    clearInterval(spinTimer);
  }
  // 流式：同 teyvat 的 line-by-line——源码一行写完才显示这一行（段落整段出、表格一行行长出来），
  // 节奏按这一行的 token 数（约 1.3 字一个）与 TPS 估算；图片是一次工具调用，等图解码好再整张出
  function nextStep() {
    var p = TURNS[stream.t].parts[stream.part];
    if (!p) return null;
    if (p.img) return { part: stream.part + 1, lines: 0, delay: 700, tokens: 60, wait: p.ready };
    var lines = p.md.split("\n"), k = stream.lines + 1;
    while (k < lines.length && !lines[k - 1].trim()) k++;
    // 表格的分隔行（|---|---|）不单独出：跟下一行一起，免得先冒出一行空表格
    while (k < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[k - 1])) k++;
    var tokens = Math.max(1, Math.ceil((lines[k - 1] || "").length / 1.3)), delay = Math.min(1600, 30 + tokens * 1000 / settings.tps);
    return k >= lines.length ? { part: stream.part + 1, lines: 0, delay: delay, tokens: tokens } : { part: stream.part, lines: k, delay: delay, tokens: tokens };
  }
  function schedule() {
    var step = nextStep();
    if (!step) return done();
    var s = stream;
    s.timer = setTimeout(function () {
      Promise.race([step.wait || null, new Promise(function (r) { setTimeout(r, 4000); })]).then(function () {
        if (stream !== s) return;
        var follow = nearBottom();
        s.thinking = false;
        s.part = step.part;
        s.lines = step.lines;
        s.tokens += step.tokens;
        s.el.innerHTML = join(turnRows(s.t, upto()));
        if (follow) toBottom();
        schedule();
      });
    }, step.delay);
  }
  function ask() {
    if (asked >= TURNS.length) return;
    if (stream) { // 回答中不打断：排进队列，答完再发
      if (!queued) { queued = true; typed = TURNS[asked].ask.length; renderStatus(); renderInput(); }
      return;
    }
    stopTimers();
    var t = asked++;
    typed = 0;
    stream = { t: t, part: 0, lines: 0, thinking: true, t0: Date.now(), tokens: 0, verb: VERBS[Math.floor(Math.random() * VERBS.length)] };
    stream.el = turnBlock(turnRows(t, upto()));
    spinTimer = setInterval(function () { spin++; renderStatus(); }, 120);
    renderStatus();
    renderInput();
    toBottom();
    stream.timer = setTimeout(function () { stream.tokens += 40 + Math.floor(Math.random() * 80); schedule(); }, 900 + Math.random() * 900); // 先想一会儿
  }
  function done() {
    var follow = nearBottom();
    stopTimers();
    var secs = Math.max(1, Math.round((Date.now() - stream.t0) / 1000));
    TURNS[stream.t].worked = "Worked for " + secs + "s · done " + new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    stream.el.innerHTML = join(turnRows(stream.t));
    stream = null;
    renderStatus();
    renderInput();
    if (follow) toBottom();
    if (queued) { queued = false; setTimeout(ask, 500); }
  }
  function sendNow() {
    var follow = nearBottom();
    stream.el.innerHTML = join(turnRows(stream.t));
    done();
    if (follow) toBottom();
  }
  function showAll() {
    if (stream) return;
    var y = screen.scrollTop;
    stopTimers();
    while (asked < TURNS.length) turnBlock(turnRows(asked++));
    renderInput();
    screen.scrollTop = y; // 从读到的地方接着往下读
    onScroll();
  }
  // 开场：自动“打”出第一个问题并发送（之后的问题交给读者）
  function autoType() {
    typeTimer = setTimeout(function step() {
      if (asked || stream) return;
      typed++;
      renderInput();
      if (typed < TURNS[0].ask.length) typeTimer = setTimeout(step, 55 + Math.random() * 60);
      else typeTimer = setTimeout(ask, 350);
    }, 700);
  }

  // ---- 选区：按行合并浏览器给的矩形，每行画一个整行高、对齐字符格的块 ----
  function paintSelection() {
    var blocks = [], sel = document.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount) {
      var box = term.getBoundingClientRect(), padLeft = parseFloat(getComputedStyle(term).paddingLeft), rows = new Map();
      Array.prototype.forEach.call(sel.getRangeAt(0).getClientRects(), function (r) {
        var midY = (r.top + r.bottom) / 2;
        if (midY < box.top || midY > box.bottom || r.height > rowH * 1.5) return; // 图片、整块的矩形不算
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
    // 制表符的线是背景渐变画的，选中时浏览器只改文字颜色；被选中的线格自己染黑（同选中文字），与蓝底同帧
    marked.forEach(function (el) { el.classList.remove("sel"); });
    marked = [];
    if (blocks.length) {
      var range = sel.getRangeAt(0), scope = range.commonAncestorContainer;
      if (scope.nodeType !== 1) scope = scope.parentElement;
      Array.prototype.forEach.call(scope.querySelectorAll(".ttu-box"), function (el) {
        if (range.intersectsNode(el)) { el.classList.add("sel"); marked.push(el); }
      });
    }
  }
  var marked = [];
  // 选区一变就当场画：浏览器改选中文字颜色是在同一帧里，蓝底也必须同一帧出来，晚一帧就会撕裂
  document.addEventListener("selectionchange", paintSelection);

  // ---- 滚动：整行走；往回翻时顶上留一个空行、底下出现 Jump to bottom ----
  var maxY = function () { return screen.scrollHeight - screen.clientHeight; };
  var scrollByRows = function (n) {
    screen.scrollTop = Math.max(0, Math.min(maxY(), Math.round(screen.scrollTop / rowH + n) * rowH));
  };
  function onScroll() {
    topgap.classList.toggle("on", screen.scrollTop > 0);
    jump.classList.toggle("on", !nearBottom());
    jump.style.bottom = foot.offsetHeight + "px";
  }
  screen.addEventListener("scroll", onScroll, { passive: true });
  jump.addEventListener("click", function () { toBottom(); onScroll(); });
  function crossingImage(px) {
    var box = screen.getBoundingClientRect(), edge = px > 0 ? box.top : box.bottom;
    return Array.prototype.some.call(term.querySelectorAll(".fig"), function (f) {
      var r = f.getBoundingClientRect();
      return r.top < edge - 1 && r.bottom > edge + 1;
    });
  }
  var wheelAcc = 0;
  screen.addEventListener("wheel", function (e) {
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // 缩放、横向交给浏览器
    e.preventDefault();
    var px = e.deltaMode === 1 ? e.deltaY * rowH : e.deltaMode === 2 ? e.deltaY * screen.clientHeight : e.deltaY;
    // 按像素顺滑滚（图片不是文字行）的两种情况：指针在图片上；或有图片正卡在屏幕边上、这一下会把它继续推过那条边
    // （往下滚看上边、往上滚看下边）。其余时候按整行走；图片滚过去之后，下一格会重新吸附到行格
    if ((e.target.closest && e.target.closest(".fig")) || crossingImage(px)) {
      wheelAcc = 0;
      screen.scrollTop = Math.max(0, Math.min(maxY(), screen.scrollTop + px));
      return;
    }
    if (Math.sign(px) !== Math.sign(wheelAcc)) wheelAcc = 0; // 反向立即响应
    wheelAcc += px;
    var rows = Math.trunc(wheelAcc / rowH);
    if (!rows) return;
    wheelAcc -= rows * rowH;
    scrollByRows(rows);
  }, { passive: false });

  // ---- 键盘：打字把问题“打”出来，回车发送；方向键 / 翻页按整行滚（设置窗口里的输入不管）----
  window.addEventListener("keydown", function (e) {
    // ctrl / ⌘ + 回车：排着的问题立刻发——当前回答直接出完（读者自己选的）
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && stream && queued) { e.preventDefault(); return sendNow(); }
    if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing || (e.target.closest && e.target.closest("#settings"))) return;
    var page = Math.max(1, Math.floor(screen.clientHeight / rowH) - 1);
    var rows = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page, Home: -1e7, End: 1e7 }[e.key];
    if (rows) { e.preventDefault(); return scrollByRows(rows); }
    if (e.key === "Enter") { e.preventDefault(); return ask(); }
    if (e.key === "Escape") { e.preventDefault(); return showAll(); }
    if (queued || asked >= TURNS.length) return;
    if (e.key === "Backspace" || e.key.length === 1) {
      e.preventDefault();
      clearTimeout(typeTimer);
      typed = e.key === "Backspace" ? Math.max(0, typed - 1) : Math.min(TURNS[asked].ask.length, typed + 1);
      renderInput();
      if (!nearBottom()) toBottom();
    }
  });
  foot.addEventListener("click", function () { if (!String(document.getSelection())) ask(); });

  // ---- 重排：列数变了（拖窗口、缩放、全屏、浏览器缩放）才重排，按比例保住阅读位置 ----
  var resizeFrame = 0;
  function reflow() {
    var follow = nearBottom(), at = screen.scrollTop / Math.max(1, maxY());
    renderAll();
    if (follow) toBottom();
    else scrollByRows(Math.round(at * maxY() / rowH) - Math.round(screen.scrollTop / rowH));
  }
  // 列数、格宽（浏览器缩放）、屏宽任一变了就重排；页面缩放时窗口的 CSS 尺寸可能不变，所以也听浏览器窗口的 resize
  function check() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(function () {
      var ch0 = chPx, w0 = termW;
      if (measure() !== cols || chPx !== ch0 || termW !== w0) reflow();
    });
  }
  new ResizeObserver(check).observe(screen);
  window.addEventListener("resize", check);

  // 点图：小图 ↔ 大图。重排后让这张图的顶边留在原来的屏幕位置
  term.addEventListener("click", function (e) {
    var fig = e.target.closest && e.target.closest(".fig");
    if (!fig || String(document.getSelection())) return;
    var id = fig.dataset.fig, y = fig.getBoundingClientRect().top;
    big[id] = !big[id];
    if (!big[id]) delete big[id];
    renderAll();
    var now = term.querySelector('[data-fig="' + id + '"]');
    if (now) screen.scrollTop += now.getBoundingClientRect().top - y;
    onScroll();
  });
  // 系统外观变了：桌面跟着变；终端跟随系统时一起重排
  var setTheme = function (light) { root.classList.toggle("light", light); renderAll(); document.dispatchEvent(new Event("tsu-theme")); };
  // 终端外观按钮：隔一会儿再点 = 在浅色 / 深色之间翻（把现在看到的反过来）；连续快点才一路切到「跟随系统」
  var lastToggle = 0;
  toggle.addEventListener("click", function () {
    var now = Date.now(), rapid = now - lastToggle < 1200;
    lastToggle = now;
    var next = rapid ? { auto: "light", light: "dark", dark: "auto" }[termPref()] : termLight() ? "dark" : "light";
    if (next === "auto") localStorage.removeItem("tsu-term");
    else localStorage.setItem("tsu-term", next);
    renderAll();
  });
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", function (e) {
    if (!localStorage.getItem("tsu-theme")) setTheme(e.matches);
  });
  // 给设置 App（desk.js）用：外观、字号、生成速度
  window.TSU_APP = {
    setTheme: function (mode) {
      if (mode === "auto") localStorage.removeItem("tsu-theme");
      else localStorage.setItem("tsu-theme", mode);
      setTheme(mode === "auto" ? matchMedia("(prefers-color-scheme: light)").matches : mode === "light");
    },
    setFont: function (px) {
      localStorage.setItem("tsu-font", px);
      term.style.setProperty("--ttu-font-size", px + "px");
      foot.style.setProperty("--ttu-font-size", px + "px");
      jump.style.setProperty("--ttu-font-size", px + "px");
      reflow();
    },
    setTps: function (n) { settings.tps = n; localStorage.setItem("tsu-tps", n); },
    get tps() { return settings.tps; },
  };
  var savedFont = localStorage.getItem("tsu-font");
  if (savedFont) ["term", "foot", "jump"].forEach(function (id) { $(id).style.setProperty("--ttu-font-size", savedFont + "px"); });
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(function () {
    renderAll();
    autoType();
  });
})();
