// desk.js —— 博客页的“桌面”：墙纸（太浩湖航拍 / The Lake）、菜单栏时钟、窗口（标题栏拖动、四边四角拉大小、双击标题栏缩放、
// 红灯关、黄灯收进 Dock、绿灯全屏、点一下到最前）、Dock、设置 App。终端窗口里的内容归 app.js（它盯着屏幕尺寸，窗口一变就按新列数重排）。
// 手机上没有桌面，终端窗口铺满
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement, desk = $("desktop"), menubar = $("menubar"), dock = $("dock"), clock = $("clock"), wall = $("wall");
  var mobile = function () { return matchMedia("(max-width: 600px)").matches; };
  var EDGE = 6; // 边缘多宽算“拉大小”
  // 液态玻璃的边缘折射要 backdrop-filter: url(#lg)，目前只有 Chromium 支持；其余浏览器只用模糊 + 高光
  if (window.chrome && CSS.supports("backdrop-filter", "url(#lg-bar)")) root.classList.add("refract");

  // ---- 菜单栏时钟：同 macOS 中文格式「9月25日 周五  22:50:07」（显示秒）----
  function tick() {
    var d = new Date();
    var two = function (n) { return String(n).padStart(2, "0"); };
    clock.textContent = (d.getMonth() + 1) + "月" + d.getDate() + "日 周" + "日一二三四五六"[d.getDay()] + "\u2002" + d.getHours() + ":" + two(d.getMinutes()) + ":" + two(d.getSeconds());
  }
  tick();
  setTimeout(function () { tick(); setInterval(tick, 1000); }, 1000 - Date.now() % 1000); // 对齐到整秒

  // ---- 墙纸：单独的选择，不跟深浅外观走（同 macOS）。仓库里只放可以公开分发的图（CC0：翡翠湾、太浩湖黄昏）；
  // Apple 的墙纸（太浩湖航拍、The Lake）只在本地（.gitignore），能取到就多出这几个选项并默认用它们，线上取不到就只剩公开的
  var WALLS = { "pub-emerald": { still: "pub-emerald.webp" }, "pub-sunset": { still: "pub-sunset.webp" } };
  var LOCAL = { "tahoe-day": { still: "tahoe-day.jpg", video: "tahoe-day.mp4" }, "tahoe-night": { still: "tahoe-night.jpg", video: "tahoe-night.mp4" },
    "lake-day": { still: "lake-day.jpg" }, "lake-night": { still: "lake-night.jpg" } };
  var prefs = { wall: localStorage.getItem("tsu-wall") || "tahoe-day", motion: localStorage.getItem("tsu-motion") !== "off" };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches && !localStorage.getItem("tsu-motion")) prefs.motion = false;
  function applyWall() {
    if (mobile()) return;
    var w = WALLS[prefs.wall] || WALLS["pub-emerald"], still = w.still;
    desk.style.backgroundImage = "url(" + still + ")";
    var video = w.video && prefs.motion ? w.video : "";
    if (!video) { wall.classList.remove("on"); wall.pause(); return; }
    if (!wall.src.endsWith(video)) {
      wall.classList.remove("on");
      wall.poster = still;
      wall.src = video;
      wall.oncanplay = function () { wall.classList.add("on"); };
    }
    wall.play().catch(function () {});
  }
  applyWall();
  // 本地的 Apple 墙纸：探一下能不能取到，取到了就加进可选、显示对应的缩略图
  Object.keys(LOCAL).forEach(function (k) {
    var probe = new Image();
    probe.onload = function () {
      WALLS[k] = LOCAL[k];
      var b = document.querySelector('#settings [data-v="' + k + '"]');
      if (b) b.hidden = false;
      if (prefs.wall === k) applyWall();
      syncSettings();
    };
    probe.src = LOCAL[k].still;
  });

  // ---- 窗口 ----
  var area = function () {
    var top = menubar.offsetHeight, bottom = window.innerHeight - dock.offsetHeight - 16;
    return { top: top, bottom: bottom, width: window.innerWidth, height: bottom - top };
  };
  var apps = {};
  function Win(el, name, initial) {
    var self = this;
    this.el = el;
    this.name = name;
    this.bar = el.querySelector(".bar");
    this.initial = initial;
    this.state = el.classList.contains("closed") ? "closed" : "normal"; // normal | zoom | full | min | closed
    this.saved = null;
    apps[el.id] = this;
    if (!mobile() && this.state !== "closed") this.place(initial());

    // 点一下到最前，菜单栏的 App 名跟着换
    el.addEventListener("pointerdown", function () { self.front(); }, true);
    // 标题栏拖动（不含三个灯和按钮）
    this.bar.addEventListener("pointerdown", function (e) {
      if (mobile() || e.button !== 0 || e.target.closest("i, button") || self.state === "full" || self.edge) return;
      e.preventDefault(); // 按下标题栏不清掉对话里的选区
      // 拖动只改 transform（交给合成器，跟屏幕刷新率走，不重排、不重绘窗口内容），松手再落到 left / top
      var r = self.rect(), x0 = e.clientX, y0 = e.clientY, a = area(), dx = 0, dy = 0;
      el.style.willChange = "transform";
      self.drag(e, self.bar, function (ev) {
        if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 3) return; // 双击时的轻微抖动不算拖动
        if (self.state === "zoom") self.state = "normal"; // 真拖动了才退出缩放（否则第二下双击会又放大一次）
        dx = Math.max(80 - r.width, Math.min(a.width - 80, r.left + ev.clientX - x0)) - r.left;
        dy = Math.max(a.top, Math.min(window.innerHeight - 60, r.top + ev.clientY - y0)) - r.top;
        el.style.transform = "translate3d(" + dx + "px," + dy + "px,0)";
      }, function () {
        el.style.transform = "";
        el.style.willChange = "";
        el.style.left = r.left + dx + "px";
        el.style.top = r.top + dy + "px";
      });
    });
    this.bar.addEventListener("dblclick", function (e) { if (!e.target.closest("i, button")) self.zoom(); });
    // 四边四角拉大小：指针靠近边缘时换光标，按下即拉
    el.addEventListener("pointermove", function (e) {
      if (self.resizing) return;
      var r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, ed = "";
      if (!mobile() && self.state !== "full") {
        if (y < EDGE) ed += "n"; else if (y > r.height - EDGE) ed += "s";
        if (x < EDGE) ed += "w"; else if (x > r.width - EDGE) ed += "e";
      }
      if (ed === self.edge) return;
      if (self.edge) el.classList.remove("rs-" + self.edge);
      self.edge = ed;
      if (ed) el.classList.add("rs-" + ed);
    });
    el.addEventListener("pointerleave", function () {
      if (self.resizing || !self.edge) return;
      el.classList.remove("rs-" + self.edge);
      self.edge = "";
    });
    el.addEventListener("pointerdown", function (e) {
      if (!self.edge || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (self.state === "zoom") self.state = "normal";
      var r = self.rect(), x0 = e.clientX, y0 = e.clientY, ed = self.edge;
      var minW = parseFloat(getComputedStyle(el).minWidth) || 360, minH = parseFloat(getComputedStyle(el).minHeight) || 240;
      self.resizing = true;
      self.drag(e, el, function (ev) {
        var dx = ev.clientX - x0, dy = ev.clientY - y0, n = { left: r.left, top: r.top, width: r.width, height: r.height };
        if (ed.indexOf("e") >= 0) n.width = Math.max(minW, r.width + dx);
        if (ed.indexOf("s") >= 0) n.height = Math.max(minH, r.height + dy);
        if (ed.indexOf("w") >= 0) { n.width = Math.max(minW, r.width - dx); n.left = r.left + r.width - n.width; }
        if (ed.indexOf("n") >= 0) { n.height = Math.max(minH, r.height - dy); n.top = Math.max(area().top, r.top + r.height - n.height); n.height = r.top + r.height - n.top; }
        self.place(n);
      }, function () { self.resizing = false; });
    });
    // 三个灯
    this.bar.addEventListener("click", function (e) {
      var act = e.target.dataset && e.target.dataset.act;
      if (act === "full") return self.state === "full" ? self.exitFull() : self.enterFull();
      if (act === "min" || act === "close") self.hide(act === "min" ? "min" : "closed");
    });
  }
  Win.prototype.rect = function () { var el = this.el; return { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight }; };
  Win.prototype.place = function (r, animate) {
    var s = this.el.style;
    this.el.classList.toggle("anim", !!animate);
    s.left = r.left + "px";
    s.top = r.top + "px";
    s.width = r.width + "px";
    s.height = r.height + "px";
  };
  Win.prototype.drag = function (e, target, move, end) {
    this.el.classList.remove("anim");
    target.setPointerCapture(e.pointerId);
    function up() {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      if (end) end();
    }
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };
  Win.prototype.front = function () {
    Object.keys(apps).forEach(function (k) { apps[k].el.classList.remove("front"); });
    this.el.classList.add("front");
    $("appname").textContent = this.name;
  };
  // 缩放（双击标题栏）：铺满菜单栏与 Dock 之间，再来一次还原
  Win.prototype.zoom = function () {
    if (mobile()) return;
    if (this.state === "zoom") { this.state = "normal"; return this.place(this.saved || this.initial(), true); }
    this.saved = this.rect();
    this.state = "zoom";
    var a = area();
    this.place({ left: 0, top: a.top, width: a.width, height: a.height + 8 }, true);
  };
  // 两种全屏分开（同 macOS）：
  // · 窗口全屏（绿灯）：只在这个桌面里——菜单栏、Dock 让开，窗口铺满桌面；不碰浏览器
  // · 系统全屏（菜单栏「显示 → 进入全屏幕」或 ⌃⌘F）：整个桌面进浏览器的全屏，菜单栏、Dock、窗口照旧
  Win.prototype.enterFull = function () {
    if (this.state !== "zoom") this.saved = this.rect();
    this.state = "full";
    desk.classList.add("full");
    this.place({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }, true);
  };
  Win.prototype.exitFull = function () {
    if (this.state !== "full") return;
    this.state = "normal";
    desk.classList.remove("full");
    this.place(this.saved || this.initial(), true);
  };
  Win.prototype.hide = function (how) {
    if (this.state === "full") this.exitFull();
    this.el.classList.add("anim", how);
    this.state = how;
    var dockApp = dock.querySelector('[data-app="' + this.el.id + '"]');
    if (how === "closed" && this.el.id !== "win" && dockApp) dockApp.classList.remove("running");
  };
  Win.prototype.show = function () {
    var el = this.el, dockApp = dock.querySelector('[data-app="' + el.id + '"]');
    el.querySelectorAll("img[data-src]").forEach(function (img) { img.src = img.dataset.src; img.removeAttribute("data-src"); }); // 缩略图打开时才取
    if (this.state === "closed") this.place(this.initial());
    void el.offsetWidth;
    el.classList.add("anim");
    el.classList.remove("min", "closed");
    this.state = "normal";
    if (dockApp) dockApp.classList.add("running");
    this.front();
  };
  function osFullscreen() {
    var d = document.documentElement;
    if (document.fullscreenElement) (document.exitFullscreen || function () {}).call(document);
    else if (d.requestFullscreen) d.requestFullscreen().catch(function () {});
    else if (d.webkitRequestFullscreen) d.webkitRequestFullscreen();
  }
  var viewMenu = Array.prototype.find.call(menubar.querySelectorAll("span"), function (el) { return el.textContent === "显示"; });
  if (viewMenu) { viewMenu.style.cursor = "default"; viewMenu.title = "进入 / 退出全屏幕（⌃⌘F）"; viewMenu.addEventListener("click", osFullscreen); }
  window.addEventListener("keydown", function (e) { if (e.ctrlKey && e.metaKey && (e.key === "f" || e.key === "F")) { e.preventDefault(); osFullscreen(); } });

  var term = new Win($("win"), "终端", function () {
    var a = area(), w = Math.min(1000, a.width - 80);
    return { left: Math.round((a.width - w) / 2), top: a.top + 14, width: w, height: a.height - 28 };
  });
  var settingsWin = new Win($("settings"), "系统设置", function () {
    var a = area(), w = Math.min(520, a.width - 40), h = Math.min(520, a.height - 40);
    return { left: Math.round(a.width - w - 60), top: a.top + 60, width: w, height: h };
  });
  term.front();

  // Dock：开着的 App 点一下到最前（没开 / 收起的打开），终端开着就跳一下
  dock.addEventListener("click", function (e) {
    var a = e.target.closest("[data-app]");
    if (!a) return;
    var w = apps[a.dataset.app];
    if (w.state === "min" || w.state === "closed") return w.show();
    w.front();
    a.classList.remove("bounce");
    void a.offsetWidth;
    a.classList.add("bounce");
  });

  // 浏览器窗口变了：全屏 / 缩放状态跟着铺满，普通状态保证窗口不跑出屏幕
  window.addEventListener("resize", function () {
    if (mobile()) return;
    applyWall();
    Object.keys(apps).forEach(function (k) {
      var w = apps[k], a = area();
      if (w.state === "closed") return;
      if (w.state === "full") return w.place({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight });
      if (w.state === "zoom") return w.place({ left: 0, top: a.top, width: a.width, height: a.height + 8 });
      if (!w.el.style.left) return w.place(w.initial());
      var r = w.rect();
      w.place({ left: Math.max(0, Math.min(r.left, a.width - Math.min(r.width, a.width))), top: Math.max(a.top, r.top),
        width: Math.min(r.width, a.width), height: Math.min(r.height, window.innerHeight - a.top) });
    });
  });

  // ---- 设置 App ----
  var pane = $("settings");
  function syncSettings() {
    var mode = localStorage.getItem("tsu-theme") || "auto";
    pane.querySelectorAll('[data-set="theme"] button').forEach(function (b) { b.classList.toggle("on", b.dataset.v === mode); });
    var cur = WALLS[prefs.wall] ? prefs.wall : "pub-emerald"; // 选的是本地才有的墙纸而这里取不到时，实际用的是翡翠湾
    pane.querySelectorAll('[data-set="wall"] button').forEach(function (b) { b.classList.toggle("on", b.dataset.v === cur); });
    pane.querySelector('[data-set="motion"]').checked = prefs.motion;
    pane.querySelector('[data-set="motion"]').disabled = !(WALLS[prefs.wall] && WALLS[prefs.wall].video);
    var font = localStorage.getItem("tsu-font") || 13, tps = window.TSU_APP ? window.TSU_APP.tps : 80;
    pane.querySelector('[data-set="font"]').value = font;
    pane.querySelector('[data-out="font"]').textContent = font + " px";
    pane.querySelector('[data-set="tps"]').value = tps;
    pane.querySelector('[data-out="tps"]').textContent = tps + " tokens/s";
  }
  pane.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-v]");
    if (!b) return;
    var set = b.parentElement.dataset.set;
    if (set === "theme") window.TSU_APP.setTheme(b.dataset.v);
    if (set === "wall") { prefs.wall = b.dataset.v; localStorage.setItem("tsu-wall", prefs.wall); applyWall(); }
    syncSettings();
  });
  pane.addEventListener("input", function (e) {
    var set = e.target.dataset.set;
    if (set === "font") window.TSU_APP.setFont(+e.target.value);
    if (set === "tps") window.TSU_APP.setTps(+e.target.value);
    if (set === "motion") { prefs.motion = e.target.checked; localStorage.setItem("tsu-motion", prefs.motion ? "on" : "off"); applyWall(); }
    syncSettings();
  });
  document.addEventListener("tsu-theme", syncSettings);
  syncSettings();
})();
