// ansi-to-html.js —— ANSI 转义序列 → 格子化 HTML（Terminal-Style-UI-Web 核心模块）
// 设计要点：
// 1. 分词解析：正则切出转义序列（CSI / OSC / 其他 ESC）与文字段——不再手工推进下标（旧版 CSI 分支双重自增吞字，见 DEVELOPMENT 坑 8）
// 2. SGR 状态机：前景色(38;2;RGB)/背景色(48;2;RGB)/粗体(1)/dim(2)/斜体(3)/下划线(4)/反色(7) 及其重置(22/23/24/27/39/49/0)；
//    OSC（含 OSC 8 超链接）整段剥离只留文字（与终端一致：不显示 url）
// 3. 样式段：同样式的连续内容包进一个 <span>；下划线画在该 span 的背景上——整段连续、覆盖段内格子
//    （text-decoration 画不进 inline-block 格子：中文下划线会一字一断）
// 4. 格子：文字按字素簇切分，宽度与排版同源（options.widthOf：渲染入口传 pi-tui 的 visibleWidth；默认 charWidth）——
//    ASCII 直接输出；其余字素锁进 1ch / 2ch 的 inline-block 格子（回退字体的字宽不会推歪后面的列）。
//    表格行（≥2 个制表符）走整格模式：每个字素都进 1ch 格子、宽字素补空格子——文字的浮点字宽与格子的 1/64px 取整
//    不一致，混排时每字差千分之几像素，一行累积到半像素，右边框会与分隔行错开；整格模式下每行都是 N 个同样的格子
// 5. 制表符（U+2500–257F 的线段/转角/三通/十字）：不用字体字形，按「上右下左」四条臂用 CSS 渐变画——
//    所有线都过格子中心、同一粗细，接头严丝合缝；格子高 1lh、顶对齐，配合 terminal.css 的显式行高，竖线跨行连续。
//    格子里放同一个制表符但字形透明（-webkit-text-fill-color，线条颜色仍取 currentColor）——复制出来带边框，同终端
// 注意：1ch = 当前字体 "0" 的 advance——必须等宽字体（Monaco/Menlo），中文回退字体的宽度不参与格子计算。
// 格宽写成 var(--ttu-cell, 1ch)：terminal.css 在 <pre> 上按常规字重算好 1ch 再以绝对长度继承——WebKit（Safari）合成粗体
// 会把粗体的 1ch 加宽约 0.36px，格子直接用 1ch 时粗体多的表格行累积错位；没有 terminal.css 时退回 1ch

// 制表符四臂 [上, 右, 下, 左]：0 无 / 1 细 / 2 粗 / 3 双线（圆角按直角画，虚线按实线画；细粗混搭的少见字符仍用字形）
export const BOX_ARMS = {
  "─": [0, 1, 0, 1], "│": [1, 0, 1, 0], "┌": [0, 1, 1, 0], "┐": [0, 0, 1, 1], "└": [1, 1, 0, 0], "┘": [1, 0, 0, 1],
  "├": [1, 1, 1, 0], "┤": [1, 0, 1, 1], "┬": [0, 1, 1, 1], "┴": [1, 1, 0, 1], "┼": [1, 1, 1, 1],
  "━": [0, 2, 0, 2], "┃": [2, 0, 2, 0], "┏": [0, 2, 2, 0], "┓": [0, 0, 2, 2], "┗": [2, 2, 0, 0], "┛": [2, 0, 0, 2],
  "┣": [2, 2, 2, 0], "┫": [2, 0, 2, 2], "┳": [0, 2, 2, 2], "┻": [2, 2, 0, 2], "╋": [2, 2, 2, 2],
  "═": [0, 3, 0, 3], "║": [3, 0, 3, 0], "╔": [0, 3, 3, 0], "╗": [0, 0, 3, 3], "╚": [3, 3, 0, 0], "╝": [3, 0, 0, 3],
  "╠": [3, 3, 3, 0], "╣": [3, 0, 3, 3], "╦": [0, 3, 3, 3], "╩": [3, 3, 0, 3], "╬": [3, 3, 3, 3],
  "╒": [0, 3, 1, 0], "╓": [0, 1, 3, 0], "╕": [0, 0, 1, 3], "╖": [0, 0, 3, 1], "╘": [1, 3, 0, 0], "╙": [3, 1, 0, 0],
  "╛": [1, 0, 0, 3], "╜": [3, 0, 0, 1], "╞": [1, 3, 1, 0], "╟": [3, 1, 3, 0], "╡": [1, 0, 1, 3], "╢": [3, 0, 3, 1],
  "╤": [0, 3, 1, 3], "╥": [0, 1, 3, 1], "╧": [1, 3, 0, 3], "╨": [3, 1, 0, 1], "╪": [1, 3, 1, 3], "╫": [3, 1, 3, 1],
  "╭": [0, 1, 1, 0], "╮": [0, 0, 1, 1], "╯": [1, 0, 0, 1], "╰": [1, 1, 0, 0],
  "╴": [0, 0, 0, 1], "╵": [1, 0, 0, 0], "╶": [0, 1, 0, 0], "╷": [0, 0, 1, 0],
  "╸": [0, 0, 0, 2], "╹": [2, 0, 0, 0], "╺": [0, 2, 0, 0], "╻": [0, 0, 2, 0],
  "┄": [0, 1, 0, 1], "┈": [0, 1, 0, 1], "╌": [0, 1, 0, 1], "┅": [0, 2, 0, 2], "┉": [0, 2, 0, 2], "╍": [0, 2, 0, 2],
  "┆": [1, 0, 1, 0], "┊": [1, 0, 1, 0], "╎": [1, 0, 1, 0], "┇": [2, 0, 2, 0], "┋": [2, 0, 2, 0], "╏": [2, 0, 2, 0],
};

// n 格宽（见文件头：--ttu-cell 由 terminal.css 在 <pre> 上按常规字重算好）
function cellWidth(n) {
  return n === 1 ? "var(--ttu-cell,1ch)" : `calc(var(--ttu-cell,1ch)*${n})`;
}

const LINE_PX = { 1: 1, 2: 2 }; // 细 / 粗线宽
const DOUBLE_GAP = 1.5; // 双线：两条 1px 线的中心各偏离格子中心 1.5px
const halfSpan = (weight) => (weight === 3 ? DOUBLE_GAP + 0.5 : weight ? LINE_PX[weight] / 2 : 0);
const bar = (x, y, w, h) => `linear-gradient(currentColor,currentColor) ${x} ${y}/${w} ${h} no-repeat`;

// 同一方向的一根（双线为两根）线 → 背景层。horizontal：沿 x 方向；pos：贴哪条边；len：长度
function strokes(weight, horizontal, pos, len) {
  const thickness = `${weight === 3 ? 1 : LINE_PX[weight]}px`;
  return (weight === 3 ? [-DOUBLE_GAP, DOUBLE_GAP] : [0]).map((offset) => {
    const mid = offset ? `calc(50% ${offset < 0 ? "-" : "+"} ${Math.abs(offset)}px)` : "50%";
    return horizontal ? bar(pos, mid, len, thickness) : bar(mid, pos, thickness, len);
  });
}

const boxStyles = new Map();
function boxStyle(ch) {
  let style = boxStyles.get(ch);
  if (style) return style;
  const [up, right, down, left] = BOX_ARMS[ch];
  // 单侧的臂从边缘画到中心、再越过垂直方向线条的半宽 → 转角/三通的接头填满；两侧同粗则直接贯通
  const reachH = Math.max(halfSpan(up), halfSpan(down));
  const reachV = Math.max(halfSpan(left), halfSpan(right));
  const arm = (reach) => (reach ? `calc(50% + ${reach}px)` : "50%");
  const layers = [];
  if (left && left === right) layers.push(...strokes(left, true, "0", "100%"));
  else {
    if (left) layers.push(...strokes(left, true, "0", arm(reachH)));
    if (right) layers.push(...strokes(right, true, "100%", arm(reachH)));
  }
  if (up && up === down) layers.push(...strokes(up, false, "0", "100%"));
  else {
    if (up) layers.push(...strokes(up, false, "0", arm(reachV)));
    if (down) layers.push(...strokes(down, false, "100%", arm(reachV)));
  }
  style = `display:inline-block;width:${cellWidth(1)};height:1lh;vertical-align:top;-webkit-text-fill-color:transparent;background:${layers.join(",")}`;
  boxStyles.set(ch, style);
  return style;
}

// 默认宽度（未传 options.widthOf 时）：CJK / 全角占 2 格，其余 1 格
export function charWidth(ch) {
  const c = ch.codePointAt(0);
  if ((c >= 0x1100 && c <= 0x115F) || (c >= 0x2E80 && c <= 0x303E) || (c >= 0x3041 && c <= 0x33FF) ||
      (c >= 0x3400 && c <= 0x4DBF) || (c >= 0x4E00 && c <= 0x9FFF) || (c >= 0xA000 && c <= 0xA4CF) ||
      (c >= 0xAC00 && c <= 0xD7A3) || (c >= 0xF900 && c <= 0xFAFF) || (c >= 0xFE30 && c <= 0xFE4F) ||
      (c >= 0xFF00 && c <= 0xFF60) || (c >= 0xFFE0 && c <= 0xFFE6) || (c >= 0x20000 && c <= 0x3FFFD)) return 2;
  return 1;
}

// 转义序列：CSI（ESC [ 参数 中间字节 终止字节）/ OSC（ESC ] … BEL 或 ESC \，未终止则到串尾）/ 其他两字节 ESC 序列
const ESCAPE_RE = /\x1b\[[0-?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\|$)|\x1b[\s\S]?/g;
const SGR_RE = /^\x1b\[([0-9;]*)m$/;
const OSC8_RE = /^\x1b\]8;[^;]*;([^\x07\x1b]*)/; // OSC 8 超链接：ESC ] 8 ; 参数 ; URL（URL 为空 = 链接结束）
const SAFE_URL_RE = /^(?:https?:|mailto:)/i; // 只把这几种变成链接（不接受 javascript: 等）
const escAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ASCII_RE = /^[\x00-\x7e]+$/;
const BOX_CHARS_RE = new RegExp(`[${Object.keys(BOX_ARMS).join("")}]`, "g");
// 整格模式的格子：宽字素 = 1 格字形（溢出到右邻）+ 空格子补足宽度
const CELL = `<span style="display:inline-block;width:${cellWidth(1)}">`;
const CELL_SPACER = `${CELL}</span>`;
const SEGMENTER = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
// 下划线 / 删除线：样式段 span 的背景线（下划线在内容区底部上方 1px，删除线在正中）——text-decoration 画不进
// inline-block 格子，中文会一字一断，背景线则覆盖整段、中英文连续
const LINE = "linear-gradient(currentColor,currentColor)";
const UNDERLINE_BG = `${LINE} 0 calc(100% - 1px)/100% 1px no-repeat`;
const STRIKE_BG = `${LINE} 0 55%/100% 1px no-repeat`;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function ansiToHtml(ansi, theme = "dark", options = {}) {
  const widthOf = options.widthOf || charWidth;
  let color = null, bold = false, dim = false, italic = false, underline = false, strike = false, bg = null, inverse = false;
  // 反色（SGR 7）要知道默认的前景 / 背景：同 terminal.css 的配色
  const DEFAULT_FG = theme === "light" ? [26, 26, 26] : [199, 199, 199], DEFAULT_BG = theme === "light" ? [255, 255, 255] : [0, 0, 0];
  let style = "";
  const updateStyle = () => {
    const st = [];
    // 反色：前景 ↔ 背景（没设的用默认色）
    const fg = inverse ? bg || DEFAULT_BG : color, back = inverse ? color || DEFAULT_FG : bg;
    if (fg) st.push(`color:rgb(${fg[0]},${fg[1]},${fg[2]})`);
    if (bold) {
      st.push("font-weight:bold");
      // iTerm 的 bold-brighten：暗色终端下 SGR 1 且无显式前景色时提亮纯白（light 下白字不可见，跳过）
      if (!fg && theme !== "light") st.push("color:#ffffff");
    }
    if (dim) st.push("opacity:0.55");
    if (italic) st.push("font-style:italic");
    const lines = [underline && UNDERLINE_BG, strike && STRIKE_BG].filter(Boolean);
    if (lines.length) st.push(`background:${lines.join(",")}`);
    if (back) st.push(`background-color:rgb(${back[0]},${back[1]},${back[2]})`); // 背景色（SGR 48 / 反色）：写在 background 简写之后，不被它清掉
    style = st.join(";");
  };
  const applySgr = (params) => {
    const ps = params.split(";").map((x) => parseInt(x || "0", 10));
    for (let k = 0; k < ps.length; k++) {
      const p = ps[k];
      if (p === 0) { color = bg = null; bold = dim = italic = underline = strike = inverse = false; }
      else if (p === 7) inverse = true;
      else if (p === 27) inverse = false;
      else if (p === 49) bg = null;
      else if (p === 48 && ps[k + 1] === 2) { bg = [ps[k + 2], ps[k + 3], ps[k + 4]]; k += 4; }
      else if (p === 1) bold = true;
      else if (p === 2) dim = true;
      else if (p === 3) italic = true;
      else if (p === 4) underline = true;
      else if (p === 22) { bold = false; dim = false; }
      else if (p === 23) italic = false;
      else if (p === 24) underline = false;
      else if (p === 9) strike = true;
      else if (p === 29) strike = false;
      else if (p === 39) color = null;
      else if (p === 38 && ps[k + 1] === 2) { color = [ps[k + 2], ps[k + 3], ps[k + 4]]; k += 4; }
    }
    updateStyle();
  };

  let out = "", runStyle = "";
  const setRun = (st) => {
    if (st === runStyle) return;
    if (runStyle) out += "</span>";
    if (st) out += `<span style="${st}">`;
    runStyle = st;
  };
  const text = (s, grid) => {
    const parts = SEGMENTER ? SEGMENTER.segment(s) : Array.from(s, (segment) => ({ segment }));
    for (const { segment: g } of parts) {
      setRun(style);
      if (BOX_ARMS[g]) { out += `<span class="ttu-box" style="${boxStyle(g)}">${g}</span>`; continue; }
      const tab = g === "\t" && options.widthOf;
      if (ASCII_RE.test(g) && !grid) { out += tab ? " ".repeat(widthOf(g)) : esc(g); continue; }
      const w = ASCII_RE.test(g) && !tab ? g.length : widthOf(g);
      if (w <= 0) out += esc(g);
      else if (grid) out += tab ? `${CELL} </span>`.repeat(w) : `${CELL}${esc(g)}</span>` + CELL_SPACER.repeat(w - 1);
      else out += `<span style="display:inline-block;width:${cellWidth(w)}">${esc(g)}</span>`;
    }
  };

  // options.links：OSC 8 超链接输出成 <a href>（默认剥掉只留文字，同终端观感）；链接跨行时每行结尾闭合、下一行重开
  const links = !!options.links;
  let href = null;
  const openLink = () => { if (href) out += `<a href="${escAttr(href)}">`; };
  // options.cache（Map）：按「行首样式状态 + 行内容」缓存每行的 HTML 与行尾状态——编辑时没变的行直接复用
  const cache = options.cache;
  const stateKey = () => `${color ? color.join(",") : ""}|${bg ? bg.join(",") : ""}|${+bold}${+dim}${+italic}${+underline}${+strike}${+inverse}|${links ? href ?? "" : ""}`;
  ansi.split("\n").forEach((line, i) => {
    // 每行结尾都关掉样式段、下一行再重新打开：每一行的 HTML 自成一体（预览页按行增量替换，不能有跨行的 <span>）
    if (i) out += "\n";
    const key = cache && `${stateKey()}\u0001${line}`;
    const hit = cache && cache.get(key);
    if (hit) {
      out += hit.html;
      [color, bold, dim, italic, underline, strike, href, bg, inverse] = hit.end;
      updateStyle();
      return;
    }
    const start = out.length;
    if (links) openLink();
    const grid = (line.match(BOX_CHARS_RE) || []).length >= 2;
    let last = 0;
    for (const m of line.matchAll(ESCAPE_RE)) {
      if (m.index > last) text(line.slice(last, m.index), grid);
      last = m.index + m[0].length;
      const sgr = SGR_RE.exec(m[0]);
      if (sgr) applySgr(sgr[1]);
      const osc8 = links && OSC8_RE.exec(m[0]);
      if (osc8) {
        setRun("");
        if (href) out += "</a>";
        href = osc8[1] && SAFE_URL_RE.test(osc8[1]) ? osc8[1] : null;
        openLink();
      }
      // 其余 CSI（光标移动/清行等）与 OSC（含 OSC 8 超链接）整段剥离
    }
    if (last < line.length) text(line.slice(last), grid);
    setRun("");
    if (links && href) out += "</a>";
    if (cache) {
      cache.set(key, { html: out.slice(start), end: [color, bold, dim, italic, underline, strike, href, bg, inverse] });
      if (cache.size > (options.cacheMax ?? 20000)) cache.delete(cache.keys().next().value);
    }
  });
  setRun("");
  return out;
}
