// app.js —— 博客页：一段可以接着问的 Claude Code 会话（数据见 index.html 里的 #turns，由 build.mjs 从 blog.md 切出）
// 排版：打包版渲染核心（TTU）按窗口实际能放下的列数现场排，窗口 / 浏览器缩放都会重排。
// 交互（同 Claude Code 全屏模式：对话区滚动，输入框固定在底部）：输入框里是读者的下一个问题（灰字），打字把它“打”出来，
// 回车发送 → ✻ Thinking… → 回答按源码一行行流出来（同 teyvat 的 line-by-line），窗口自动跟到底；
// 回答中回车 = 直接出完，Esc = 全文。手机上轻点输入框提问。滚轮 / 触控板 / 键盘按整行滚动（图片上照常顺滑滚），选区自己画（同 VSCode 预览）
(function () {
  "use strict";
  var TURNS = JSON.parse(document.getElementById("turns").textContent);
  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement, screen = $("screen"), term = $("term"), foot = $("foot"), out = $("out"), input = $("input"), selLayer = $("sel"), toggle = $("toggle");
  var touch = matchMedia("(pointer: coarse)").matches;
  var ESC = "\x1b", RESET = ESC + "[0m", BOLD = ESC + "[1m";
  var rgb = function (c) { return ESC + "[38;2;" + c + "m"; };
  var ORANGE = rgb("215;119;87"), GREEN = rgb("78;186;101");
  var chPx = 8, rowH = 17, cols = 0, theme = "", DIM = "", cache = {};
  var asked = 0, typed = 0, stream = null, spin = 0, spinTimer = 0, typeTimer = 0;
  var big = {}; // 放大了的图（键：问号-段号）；默认小图（同备忘录），点一下放大到与正文左右对齐，再点缩回
  var TPS = 80; // 模拟的生成速度（token / 秒）：中文约 1.3 字一个 token
  var VERBS = ["Garnishing", "Pondering", "Crafting", "Brewing", "Noodling", "Percolating", "Simmering", "Conjuring", "Mulling", "Whirring", "Composing", "Tinkering"];

  // ---- 排版 ----
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
  var W = function (s) { return TTU.visibleWidth(s); };
  var pad = function (s, n) { var w = W(s); return w < n ? s + " ".repeat(n - w) : s; };
  var toHtml = function (lines) { return TTU.ansiToHtml(lines.join("\n"), theme, { widthOf: TTU.visibleWidth, links: true }); };
  var escHtml = function (s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); };
  function wrap(s, w) {
    var lines = [], cur = "", cw = 0;
    Array.from(s).forEach(function (ch) {
      var x = W(ch);
      if (cw + x > w) { lines.push(cur); cur = ""; cw = 0; }
      cur += ch;
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
  function join(rows, prev) {
    var s = "";
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
    return new Rows().text([""]).text(box(body, w, ORANGE)).flush().rows;
  }
  // ⏺ 开头、其余行缩进 2 格（同 Claude Code 的回答）
  function answer(md) {
    // ⏺ 用正文灰（dark 即默认前景 #c7c7c7；light 的默认前景近黑，另给 #555）
    var dot = theme === "light" ? rgb("85;85;85") + "⏺" + RESET : "⏺";
    return trim(TTU.markdownLines(md, { width: cols - 2, theme: theme })).map(function (l, i) { return (i ? "  " : dot + " ") + l; });
  }
  // 一问一答的行。upto = { part, lines }：只含前 part 段 + 第 part 段的前 lines 行源码（流式输出中）；不传 = 全文
  function turnRows(t, upto) {
    var turn = TURNS[t], key = t + "|" + cols + "|" + theme + "|" + JSON.stringify(big) + "|" + (turn.worked || "");
    if (!upto && cache[key]) return cache[key];
    var r = new Rows().text([""]);
    var ask = wrap(turn.ask, cols - 2).map(function (l, i) { return pad((i ? "  " : "> ") + l, cols); });
    r.block('<span class="ask">' + toHtml(ask) + "</span>");
    turn.parts.forEach(function (p, i) {
      if (upto && i > upto.part) return;
      var md = p.md && upto && i === upto.part ? p.md.split("\n").slice(0, upto.lines).join("\n") : p.md;
      if (upto && i === upto.part && !(md && md.trim())) return;
      r.text([""]);
      if (p.md) return r.text(answer(md));
      // 图片：agent 自己发的图——一次 Present 工具调用，图挂在 ⎿ 下面；块高取整到行，整屏仍是一张行格
      r.text([GREEN + "⏺" + RESET + " " + BOLD + "Present" + RESET + "(" + p.file + ")", "  ⎿  Presented " + BOLD + "1" + RESET + " image"]);
      // 小图：约 40 列宽；大图：从 ⎿ 后一直到正文右边，左右对齐
      var id = t + "-" + i, full = (cols - 5) * chPx, w = big[id] ? full : Math.min(full, Math.max(240, 40 * chPx)), h = w * p.h / p.w;
      r.block('<span class="fig" data-fig="' + id + '" style="padding-left:' + 5 * chPx + "px;padding-top:" + rowH / 3 + "px;height:" + Math.ceil(h / rowH + 0.5) * rowH + 'px">' +
        '<img src="' + escHtml(p.img) + '" alt="' + escHtml(p.alt) + '" title="' + escHtml(p.alt) + (big[id] ? "（点一下缩小）" : "（点一下放大）") +
        '" width="' + Math.round(w) + '" height="' + Math.round(h) + '" decoding="async"></span>');
    });
    // 一轮结束：✻ Worked for 34s · done 10:54 PM（同 Claude Code）
    if (!upto && turn.worked) r.text(["", DIM + "✻ " + turn.worked + RESET]);
    var rows = r.flush().rows;
    return upto ? rows : (cache[key] = rows);
  }
  var upto = function () { return stream && { part: stream.part, lines: stream.lines }; };

  // ---- 输入框（每次状态变化重画）----
  var SPIN = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];
  function renderInput() {
    // 底部固定区：状态行（回答中是转圈的 ✻）、输入框、提示
    // 同 Claude Code：· Garnishing… (47s · ↓ 2.4k tokens · thinking with medium effort)
    var status = "";
    if (stream) {
      var secs = Math.floor((Date.now() - stream.t0) / 1000), tok = stream.tokens < 1000 ? stream.tokens : (stream.tokens / 1000).toFixed(1) + "k";
      status = ORANGE + SPIN[spin % SPIN.length] + " " + stream.verb + "…" + RESET + DIM + " (" + secs + "s · ↓ " + tok + " tokens" +
        (cols >= 70 ? " · thinking with medium effort" : "") + ")" + RESET;
    }
    var r = new Rows().text([status]);
    var q = asked < TURNS.length ? TURNS[asked].ask : "";
    var text = stream ? "" : q ? q.slice(0, typed) + DIM + q.slice(typed) + RESET : DIM + "（问完了，谢谢你读到这里）" + RESET;
    var lines = wrap(q && !stream ? q : " ", cols - 2);
    // 换行时打字进度按字数切到各行
    var left = typed, shown = stream || !q ? [text] : lines.map(function (l) {
      var n = Math.max(0, Math.min(l.length, left));
      left -= l.length;
      return l.slice(0, n) + DIM + l.slice(n) + RESET;
    });
    // 同 Claude Code 的输入栏：上下各一条灰色横线，没有左右边框
    var rule = DIM + "─".repeat(cols) + RESET;
    r.text([rule].concat(shown.map(function (l, i) { return (i ? "  " : "> ") + l; }), [rule]));
    r.flush();
    var hint = !q && !stream
      ? '本页由 <a href="https://github.com/ApolloZhangOnGithub/terminal-style-ui">terminal-style-ui</a> 渲染 · <a data-act="top">回到开头</a>'
      : (stream ? (touch ? "轻点 直接出完" : "回车 直接出完") : touch ? "轻点输入框 提问" : "回车 提问 · ↑↓ 滚动") + (asked < TURNS.length ? ' · <a data-act="all">Esc 全文</a>' : "");
    r.rows.push({ k: "t", h: '<span class="hint">  ' + hint + "</span>" });
    input.innerHTML = join(r.rows, "");
  }

  // 对话区：开场框、每轮问答各是一个块（块自带换行，块内按行拼）；流式输出只重画正在回答的那一块
  function turnBlock(rows) {
    var el = document.createElement("span");
    el.className = "blk";
    el.innerHTML = join(rows, "");
    out.appendChild(el);
    return el;
  }
  function renderAll() {
    var light = root.classList.contains("light");
    theme = light ? "light" : "dark";
    DIM = rgb(light ? "130;130;130" : "120;120;120");
    term.classList.toggle("ttu-light", light);
    foot.classList.toggle("ttu-light", light);
    toggle.textContent = light ? "☾" : "☀";
    var next = measure();
    if (next !== cols) cache = {};
    cols = next;
    out.innerHTML = "";
    turnBlock(banner());
    for (var t = 0; t < asked; t++) {
      var el = turnBlock(turnRows(t, stream && stream.t === t ? upto() : null));
      if (stream && stream.t === t) stream.el = el;
    }
    renderInput();
    paintSelection();
  }

  // ---- 提问与流式输出 ----
  var nearBottom = function () { return screen.scrollHeight - screen.clientHeight - screen.scrollTop < rowH * 3; };
  var toBottom = function () { screen.scrollTop = screen.scrollHeight; };
  function stopTimers() {
    clearTimeout(typeTimer);
    typeTimer = 0;
    if (stream) clearTimeout(stream.timer);
    clearInterval(spinTimer);
  }
  // 流式：同 teyvat 的 line-by-line——源码一行写完才显示这一行（段落整段出、表格一行行长出来），
  // 节奏按这一行的 token 数（约 1.3 字一个）与 TPS 估算；图片是一次工具调用，稍停一下整张出
  function nextStep() {
    var turn = TURNS[stream.t], p = turn.parts[stream.part];
    if (!p) return null;
    if (p.img) return { part: stream.part + 1, lines: 0, delay: 700, tokens: 60 };
    var lines = p.md.split("\n"), k = stream.lines + 1;
    while (k < lines.length && !lines[k - 1].trim()) k++;
    var tokens = Math.max(1, Math.ceil((lines[k - 1] || "").length / 1.3)), delay = Math.min(1600, 30 + tokens * 1000 / TPS);
    return k >= lines.length ? { part: stream.part + 1, lines: 0, delay: delay, tokens: tokens } : { part: stream.part, lines: k, delay: delay, tokens: tokens };
  }
  function redrawStream() {
    var follow = nearBottom();
    stream.el.innerHTML = join(turnRows(stream.t, upto()), "");
    if (follow) toBottom();
  }
  function schedule() {
    var step = nextStep();
    if (!step) return done(nearBottom());
    stream.timer = setTimeout(function () {
      stream.thinking = false;
      stream.part = step.part;
      stream.lines = step.lines;
      stream.tokens += step.tokens;
      redrawStream();
      schedule();
    }, step.delay);
  }
  function ask() {
    if (stream) return finish();
    if (asked >= TURNS.length) return;
    stopTimers();
    var t = asked++;
    typed = 0;
    stream = { t: t, part: 0, lines: 0, thinking: true, t0: Date.now(), tokens: 0, verb: VERBS[Math.floor(Math.random() * VERBS.length)] };
    stream.el = turnBlock(turnRows(t, upto()));
    spinTimer = setInterval(function () { spin++; renderInput(); }, 120);
    renderInput();
    toBottom();
    stream.timer = setTimeout(function () { stream.tokens += 40 + Math.floor(Math.random() * 80); schedule(); }, 800 + Math.random() * 800); // 先想一会儿
  }
  function done(follow) {
    stopTimers();
    var secs = Math.max(1, Math.round((Date.now() - stream.t0) / 1000));
    TURNS[stream.t].worked = "Worked for " + secs + "s · done " + new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    stream.el.innerHTML = join(turnRows(stream.t), "");
    stream = null;
    renderInput();
    if (follow) toBottom();
  }
  function finish() {
    if (stream) done(true);
  }
  function showAll() {
    var y = screen.scrollTop;
    finish();
    stopTimers();
    while (asked < TURNS.length) turnBlock(turnRows(asked++));
    renderInput();
    screen.scrollTop = y; // 从读到的地方接着往下读
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
  }
  var selFrame = 0;
  document.addEventListener("selectionchange", function () { cancelAnimationFrame(selFrame); selFrame = requestAnimationFrame(paintSelection); });

  // ---- 整行滚动：滚动量攒满一行才走一行，停下时总落在行格上（同终端） ----
  var maxY = function () { return screen.scrollHeight - screen.clientHeight; };
  var scrollByRows = function (n) {
    screen.scrollTop = Math.max(0, Math.min(maxY(), Math.round(screen.scrollTop / rowH + n) * rowH));
  };
  var wheelAcc = 0;
  screen.addEventListener("wheel", function (e) {
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // 缩放、横向交给浏览器
    // 指针在图片上：原生滚动，顺滑无阻尼（图片不是文字行，不必按行走）；回到文字上的第一格会重新吸附到行格
    if (e.target.closest && e.target.closest(".fig")) { wheelAcc = 0; return; }
    e.preventDefault();
    var px = e.deltaMode === 1 ? e.deltaY * rowH : e.deltaMode === 2 ? e.deltaY * screen.clientHeight : e.deltaY;
    if (Math.sign(px) !== Math.sign(wheelAcc)) wheelAcc = 0; // 反向立即响应
    wheelAcc += px;
    var rows = Math.trunc(wheelAcc / rowH);
    if (!rows) return;
    wheelAcc -= rows * rowH;
    scrollByRows(rows);
  }, { passive: false });

  // ---- 键盘：打字把问题“打”出来，回车发送；方向键 / 翻页按整行滚 ----
  window.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    var page = Math.max(1, Math.floor(screen.clientHeight / rowH) - 1);
    var rows = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page, Home: -1e7, End: 1e7 }[e.key];
    if (rows) { e.preventDefault(); return scrollByRows(rows); }
    if (e.key === "Enter") { e.preventDefault(); return ask(); }
    if (e.key === "Escape") { e.preventDefault(); return showAll(); }
    if (stream || asked >= TURNS.length) return;
    if (e.key === "Backspace" || e.key.length === 1) {
      e.preventDefault();
      clearTimeout(typeTimer);
      typed = e.key === "Backspace" ? Math.max(0, typed - 1) : Math.min(TURNS[asked].ask.length, typed + 1);
      renderInput();
      if (!nearBottom()) toBottom();
    }
  });
  foot.addEventListener("click", function (e) {
    var act = e.target.closest && e.target.closest("a[data-act]");
    if (act) {
      e.preventDefault();
      if (act.dataset.act === "all") showAll();
      else screen.scrollTop = 0;
      return;
    }
    if (!e.target.closest("a") && !String(document.getSelection())) ask();
  });

  // ---- 重排：列数变了（窗口 / 浏览器缩放）才重排，按比例保住阅读位置 ----
  // 窗口（拖大小、缩放、全屏）和浏览器缩放都会改屏幕尺寸：盯着屏幕本身
  var resizeFrame = 0;
  new ResizeObserver(function () {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(function () {
      if (measure() === cols) return;
      var follow = nearBottom(), at = screen.scrollTop / Math.max(1, maxY());
      renderAll();
      if (follow) toBottom();
      else scrollByRows(Math.round(at * maxY() / rowH) - Math.round(screen.scrollTop / rowH));
    });
  }).observe(screen);

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
  });
  var setTheme = function (light) { root.classList.toggle("light", light); renderAll(); };
  toggle.addEventListener("click", function () {
    var light = !root.classList.contains("light");
    localStorage.setItem("tsu-theme", light ? "light" : "dark");
    setTheme(light);
  });
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", function (e) {
    if (!localStorage.getItem("tsu-theme")) setTheme(e.matches);
  });
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(function () {
    renderAll();
    autoType();
  });
})();
