// webview.js —— 预览页脚本（运行在 VSCode Webview 内；Terminal Style UI for VSCode，2026-09-25 Claude Code）
// ① 按面板宽度测算列数（1ch = 字体真实 advance）回报扩展进程——与终端按窗口宽度排版一致
// ② 接收渲染好的格子化 HTML 填入 <pre>（切换 dark / light），并回执（集成测试据此确认整条链路）
// ③ 滚动按整行吸附（滚轮 / 触控板 / 方向键 / 翻页），同终端与 Claude Code 一行一行的手感：视口底边落在行边界上
//    （最底一行完整、最上一行可能被截），拉到最顶除外；不显示滚动条；位置跨重建保留
// ④ 联动：扩展进程下发 scrollToRow 时静默滚到该行；用户滚动时回报顶部行号；双击回报所在行（跳回源码）
// ⑤ 字号缩放：⌘+滚轮 / 触控板捏合即时生效，稍后写回设置，由扩展进程广播到所有预览
// ⑥ 选区自己画（同终端）：原生高亮透明，每行一个整行高、对齐字符格的矩形垫在文字下——不再是参差的异形块
(function () {
  const vscode = acquireVsCodeApi();
  const pre = document.getElementById("ttu");
  const zoomBadge = document.getElementById("ttu-zoom");
  const FONT_MIN = 6, FONT_MAX = 48;
  const WHEEL_PX_PER_FONT_STEP = 40; // ⌘+滚轮 / 捏合：累计 40px 滚动量 = 1 号字
  let cols = 0;
  let chPx = 7.8; // 1ch 的像素宽（measureCols 实测）
  let restored = false;
  // 程序化滚动（联动 / 恢复）的落点：落在这里的那次滚动事件不回报（防回环）；用户紧接着的滚动照常回报
  let quietY = null;

  // 行格（同终端）：滚动位置 = 页顶 0，或「视口底边落在行边界上」的位置（底边对齐，最底一行完整）。
  // 行高取整到像素（terminal.css）；pre 上下留白各一行，拉到最底也落在格上
  const rowHeight = () => parseFloat(getComputedStyle(pre).lineHeight) || 17;
  const origin = () => pre.offsetTop + parseFloat(getComputedStyle(pre).paddingTop);
  const maxY = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const rowAt = (y) => (y - origin()) / rowHeight(); // 视口顶边处的渲染行（联动 / 回报用，可为小数）
  const topOf = (row) => origin() + row * rowHeight(); // 让某行贴顶的 y（未吸附）
  // 页顶之后的第一个底边对齐格点：离页顶至少半行（否则从页顶往下第一步几乎不动）
  const gridStart = () => {
    const h = rowHeight(), view = window.innerHeight, o = origin();
    return o - view + Math.ceil((view - o + h / 2) / h) * h;
  };
  const gridIndex = (y) => { // 0 = 页顶，i ≥ 1 = 第 i 个底边对齐格点
    const start = gridStart();
    return y < start / 2 ? 0 : 1 + Math.max(0, Math.round((y - start) / rowHeight()));
  };
  const gridY = (i) => Math.min(maxY(), i <= 0 ? 0 : gridStart() + (i - 1) * rowHeight());
  const snapY = (y) => gridY(gridIndex(y));
  // 一律瞬时跳转：平滑滚动会把整行跳动变成过渡动画，也会让联动落点识别失效
  const jump = (y) => window.scrollTo({ top: y, behavior: "instant" });
  const scrollByRows = (n) => jump(gridY(gridIndex(window.scrollY) + n));
  const scrollQuietly = (y) => {
    const target = Math.min(maxY(), Math.max(0, y));
    if (Math.abs(target - window.scrollY) < 0.5) return; // 原地不动：不会有滚动事件
    quietY = target;
    jump(target);
  };

  // 100 个 "0" 求平均 advance，避免单字符测量的亚像素取整误差
  function measureCols() {
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden";
    probe.textContent = "0".repeat(100);
    pre.appendChild(probe);
    const ch = probe.getBoundingClientRect().width / 100;
    probe.remove();
    chPx = ch;
    const style = getComputedStyle(pre);
    const inner = pre.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return Math.max(20, Math.floor(inner / ch));
  }

  function report(type) {
    const next = measureCols();
    if (type === "resize" && next === cols) return;
    cols = next;
    vscode.postMessage({ type, cols });
  }

  // 选区层：每行一个矩形（整行高、左右按字符格取整），坐标相对 pre 的内边距盒；pre 内容重建后重新挂回
  const selLayer = document.createElement("div");
  selLayer.id = "ttu-sel";
  pre.prepend(selLayer);
  function paintSelection() {
    const blocks = [];
    const sel = document.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount) {
      const box = pre.getBoundingClientRect();
      const style = getComputedStyle(pre);
      const padLeft = parseFloat(style.paddingLeft), padTop = parseFloat(style.paddingTop);
      const h = rowHeight();
      const rows = new Map(); // 行 → [起列, 止列)
      for (const r of sel.getRangeAt(0).getClientRects()) {
        const midY = (r.top + r.bottom) / 2;
        if (midY < box.top || midY > box.bottom) continue; // 只算 pre 里的（全选时还会带上页面其他元素）
        const row = Math.floor((midY - box.top - padTop) / h);
        const c0 = Math.round((r.left - box.left - padLeft) / chPx);
        const c1 = Math.round((r.right - box.left - padLeft) / chPx);
        const cur = rows.get(row);
        rows.set(row, cur ? [Math.min(cur[0], c0), Math.max(cur[1], c1)] : [c0, c1]);
      }
      if (rows.size) {
        const first = Math.min(...rows.keys()), last = Math.max(...rows.keys());
        for (let row = first; row <= last; row++) {
          let [c0, c1] = rows.get(row) ?? [0, 0];
          if (c1 <= c0) {
            if (row === first || row === last) continue;
            c0 = 0; // 起止行之间的空行补 1 格（同编辑器）
            c1 = 1;
          }
          blocks.push(`<div style="top:${padTop + row * h}px;left:${padLeft + c0 * chPx}px;width:${(c1 - c0) * chPx}px;height:${h}px"></div>`);
        }
      }
    }
    selLayer.innerHTML = blocks.join("");
    return blocks.length;
  }
  let selFrame = 0;
  const scheduleSelection = () => {
    cancelAnimationFrame(selFrame);
    selFrame = requestAnimationFrame(paintSelection);
  };
  document.addEventListener("selectionchange", scheduleSelection);

  let badgeTimer = 0;
  function applyFont(size) {
    if (parseFloat(getComputedStyle(pre).fontSize) === size) return;
    const anchor = rowAt(window.scrollY);
    pre.style.fontSize = `${size}px`;
    zoomBadge.textContent = `${size}px`;
    zoomBadge.classList.add("show");
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => zoomBadge.classList.remove("show"), 900);
    scrollQuietly(snapY(topOf(anchor)));
    report("resize"); // 字宽变了 → 列数变了 → 按新列数重排（同终端缩放）
    scheduleSelection();
  }

  let zoomAcc = 0;
  let zoomSaveTimer = 0;
  function zoomByWheel(deltaY) {
    zoomAcc += deltaY;
    const steps = Math.trunc(zoomAcc / WHEEL_PX_PER_FONT_STEP);
    if (!steps) return;
    zoomAcc -= steps * WHEEL_PX_PER_FONT_STEP;
    // 向上滚 / 捏开（deltaY < 0）= 放大
    const size = Math.min(FONT_MAX, Math.max(FONT_MIN, parseFloat(getComputedStyle(pre).fontSize) - steps));
    applyFont(size);
    clearTimeout(zoomSaveTimer);
    zoomSaveTimer = setTimeout(() => vscode.postMessage({ type: "zoomTo", size }), 250);
  }

  window.addEventListener("message", (event) => {
    const msg = event.data;
    switch (msg.type) {
      case "render":
      case "error": {
        const light = msg.theme === "light";
        document.documentElement.classList.toggle("light", light);
        pre.classList.toggle("ttu-light", light);
        pre.classList.toggle("ttu-error", msg.type === "error");
        if (msg.type === "render") pre.innerHTML = msg.html;
        else pre.textContent = msg.message;
        pre.prepend(selLayer);
        if (!restored) {
          restored = true;
          const state = vscode.getState();
          if (state && state.scrollY) scrollQuietly(snapY(state.scrollY));
        }
        vscode.postMessage({ type: "rendered", seq: msg.seq, cols });
        break;
      }
      case "scrollToRow": // 让该行贴顶再吸附到行格（底边对齐）；文首（第 0 行）滚到页顶，保留顶部留白
        scrollQuietly(msg.row < 0.5 ? 0 : snapY(topOf(msg.row)));
        vscode.postMessage({ type: "scrollAck", row: rowAt(window.scrollY) });
        break;
      case "font":
        applyFont(msg.size);
        break;
      case "reset": // 预览切到另一份文档：滚动归零，不恢复旧位置
        restored = true;
        vscode.setState({});
        scrollQuietly(0);
        break;
      case "testScroll": // 集成测试：模拟用户滚动 n 行（与滚轮同一路径）
        scrollByRows(msg.rows);
        break;
      case "testWheel": // 集成测试：注入滚轮事件（deltas 以行高为单位），回报落点（顶行 + 底边所在行边界），验证整行累积
        for (const d of msg.deltas) window.dispatchEvent(new WheelEvent("wheel", { deltaY: d * rowHeight(), cancelable: true }));
        vscode.postMessage({
          type: "scrollAck", id: msg.id, row: rowAt(window.scrollY), atTop: window.scrollY === 0,
          bottom: (window.scrollY + window.innerHeight - origin()) / rowHeight(),
        });
        break;
      case "testSelect": { // 集成测试：全选正文，回报自绘选区（块数、是否整行高且对齐字符格）与选中文本
        const sel = document.getSelection();
        const range = document.createRange();
        range.selectNodeContents(pre);
        sel.removeAllRanges();
        sel.addRange(range);
        const count = paintSelection();
        const style = getComputedStyle(pre);
        const padLeft = parseFloat(style.paddingLeft), padTop = parseFloat(style.paddingTop), h = rowHeight();
        const onGrid = (v, unit) => Math.abs(v / unit - Math.round(v / unit)) < 1e-3;
        const aligned = [...selLayer.children].every((b) =>
          parseFloat(b.style.height) === h && onGrid(parseFloat(b.style.top) - padTop, h) && onGrid(parseFloat(b.style.left) - padLeft, chPx));
        vscode.postMessage({ type: "selAck", blocks: count, aligned, text: sel.toString() });
        sel.removeAllRanges();
        break;
      }
      case "testSelectRange": { // 截图：按「行, 列」选一段（取格子中心点，需在视口内），保留选区
        const box = pre.getBoundingClientRect();
        const style = getComputedStyle(pre);
        const at = (row, col) => document.caretRangeFromPoint(
          box.left + parseFloat(style.paddingLeft) + (col + 0.5) * chPx,
          box.top + parseFloat(style.paddingTop) + (row + 0.5) * rowHeight());
        const a = at(msg.fromRow, msg.fromCol), b = at(msg.toRow, msg.toCol);
        if (a && b) document.getSelection().setBaseAndExtent(a.startContainer, a.startOffset, b.startContainer, b.startOffset);
        break;
      }
    }
  });

  let wheelAcc = 0;
  window.addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      zoomByWheel(e.deltaY);
      return;
    }
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // 横向滚动交给浏览器
    e.preventDefault();
    const h = rowHeight();
    const px = e.deltaMode === 1 ? e.deltaY * h : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
    if (Math.sign(px) !== Math.sign(wheelAcc)) wheelAcc = 0; // 反向立即响应
    wheelAcc += px;
    const rows = Math.trunc(wheelAcc / h);
    if (!rows) return;
    wheelAcc -= rows * h;
    scrollByRows(rows);
  }, { passive: false });

  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const page = Math.max(1, Math.floor(window.innerHeight / rowHeight()) - 1);
    let rows = 0;
    switch (e.key) {
      case "ArrowDown": rows = 1; break;
      case "ArrowUp": rows = -1; break;
      case "PageDown": rows = page; break;
      case "PageUp": rows = -page; break;
      case " ": rows = e.shiftKey ? -page : page; break;
      case "Home":
      case "End":
        e.preventDefault();
        jump(e.key === "Home" ? 0 : maxY());
        return;
      default:
        return;
    }
    e.preventDefault();
    scrollByRows(rows);
  });

  let stateTimer = 0;
  let reportTimer = 0;
  window.addEventListener("scroll", () => {
    clearTimeout(stateTimer);
    stateTimer = setTimeout(() => vscode.setState({ scrollY: window.scrollY }), 100);
    const quiet = quietY !== null && Math.abs(window.scrollY - quietY) < 0.5;
    quietY = null;
    if (quiet) return;
    clearTimeout(reportTimer);
    reportTimer = setTimeout(() => vscode.postMessage({ type: "scrolled", row: rowAt(window.scrollY) }), 30);
  });
  // 拖滚动条 / 页内查找跳转等非整行滚动：停下后吸附到最近的整行（页底除外）
  window.addEventListener("scrollend", () => {
    const y = snapY(window.scrollY);
    if (Math.abs(y - window.scrollY) > 0.5) jump(y);
  });

  pre.addEventListener("dblclick", (e) => {
    vscode.postMessage({ type: "reveal", row: Math.floor(rowAt(e.pageY)) });
  });

  // 字体就绪后才测量；之后面板宽度变化（拖分栏）防抖重测，列数变了才请求重渲染
  document.fonts.ready.then(() => {
    report("ready");
    let resizeTimer = 0;
    new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        report("resize");
        scheduleSelection();
      }, 80);
    }).observe(pre);
  });
})();
