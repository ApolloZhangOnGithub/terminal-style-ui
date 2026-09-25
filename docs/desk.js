// desk.js —— 博客页的“桌面”：菜单栏时钟、终端窗口（标题栏拖动、右下角拉大小、双击标题栏缩放、红灯关、黄灯收进 Dock、绿灯全屏）、Dock。
// 窗口里的内容由 app.js 负责（它监听屏幕尺寸，窗口一变就按新列数重排）。手机上没有桌面，窗口铺满
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var desk = $("desktop"), win = $("win"), bar = $("bar"), menubar = $("menubar"), dock = $("dock"), dockTerm = $("dock-term"), clock = $("clock");
  var mobile = function () { return matchMedia("(max-width: 600px)").matches; };
  var state = "normal", saved = null; // normal | zoom | full | min | closed

  // 菜单栏时钟：同 macOS 中文格式「9月25日 周五 22:50」
  function tick() {
    var d = new Date();
    clock.textContent = (d.getMonth() + 1) + "月" + d.getDate() + "日 周" + "日一二三四五六"[d.getDay()] + " " + d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  tick();
  setInterval(tick, 10000);

  // 可用区域：菜单栏以下、Dock 以上
  function area() {
    var top = menubar.offsetHeight, bottom = window.innerHeight - dock.offsetHeight - 16;
    return { top: top, bottom: bottom, width: window.innerWidth, height: bottom - top };
  }
  function place(r, animate) {
    win.classList.toggle("anim", !!animate);
    win.style.left = r.left + "px";
    win.style.top = r.top + "px";
    win.style.width = r.width + "px";
    win.style.height = r.height + "px";
  }
  var rect = function () { return { left: win.offsetLeft, top: win.offsetTop, width: win.offsetWidth, height: win.offsetHeight }; };
  function initial() {
    var a = area(), w = Math.min(1000, a.width - 80), h = a.height - 28;
    return { left: Math.round((a.width - w) / 2), top: a.top + 14, width: w, height: h };
  }
  if (!mobile()) place(initial());

  // 标题栏拖动（不含三个灯和切换按钮）
  bar.addEventListener("pointerdown", function (e) {
    if (mobile() || e.button !== 0 || e.target.closest("i, button") || state === "full") return;
    if (state === "zoom") { state = "normal"; } // 拖动缩放后的窗口：回到普通状态
    var r = rect(), x0 = e.clientX, y0 = e.clientY;
    win.classList.remove("anim");
    bar.setPointerCapture(e.pointerId);
    function move(ev) {
      var a = area();
      var left = Math.max(80 - r.width, Math.min(a.width - 80, r.left + ev.clientX - x0));
      var top = Math.max(a.top, Math.min(window.innerHeight - 60, r.top + ev.clientY - y0));
      win.style.left = left + "px";
      win.style.top = top + "px";
    }
    function up() {
      bar.removeEventListener("pointermove", move);
      bar.removeEventListener("pointerup", up);
    }
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", up);
  });

  // 缩放（双击标题栏）：铺满菜单栏与 Dock 之间，再来一次还原
  function zoom() {
    if (mobile()) return;
    if (state === "zoom") { state = "normal"; return place(saved || initial(), true); }
    saved = rect();
    state = "zoom";
    var a = area();
    place({ left: 0, top: a.top, width: a.width, height: a.height + 8 }, true);
  }
  bar.addEventListener("dblclick", function (e) { if (!e.target.closest("i, button")) zoom(); });

  // 全屏（绿灯）：菜单栏、Dock 让开，窗口铺满整个屏幕；浏览器支持时顺带进真正的全屏
  function enterFull() {
    if (state !== "full") saved = state === "zoom" ? saved : rect();
    state = "full";
    desk.classList.add("full");
    place({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }, true);
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(function () {});
  }
  function exitFull() {
    if (state !== "full") return;
    state = "normal";
    desk.classList.remove("full");
    place(saved || initial(), true);
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
  }
  document.addEventListener("fullscreenchange", function () { if (!document.fullscreenElement) exitFull(); });

  // 三个灯
  bar.addEventListener("click", function (e) {
    var act = e.target.dataset && e.target.dataset.act;
    if (!act) return;
    if (act === "full") return state === "full" ? exitFull() : enterFull();
    if (act === "min" || act === "close") {
      if (state === "full") exitFull();
      win.classList.add("anim", act === "min" ? "min" : "closed");
      state = act === "min" ? "min" : "closed";
    }
  });
  // Dock 上的终端：收起 / 关掉的窗口点一下回来，开着就跳一下
  dockTerm.addEventListener("click", function () {
    if (state === "min" || state === "closed") {
      win.classList.add("anim");
      win.classList.remove("min", "closed");
      if (state === "closed") place(initial());
      state = "normal";
      return;
    }
    dockTerm.classList.remove("bounce");
    void dockTerm.offsetWidth;
    dockTerm.classList.add("bounce");
  });

  // 浏览器窗口变了：全屏 / 缩放状态跟着铺满，普通状态保证窗口不跑出屏幕
  window.addEventListener("resize", function () {
    if (mobile()) return;
    if (state === "full") return place({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight });
    if (state === "zoom") { var a = area(); return place({ left: 0, top: a.top, width: a.width, height: a.height + 8 }); }
    var r = rect(), ar = area();
    if (!win.style.left) return place(initial());
    place({ left: Math.max(0, Math.min(r.left, ar.width - Math.min(r.width, ar.width))), top: Math.max(ar.top, r.top),
      width: Math.min(r.width, ar.width), height: Math.min(r.height, window.innerHeight - ar.top) });
  });
})();
