// extension.js —— Terminal Style UI for VSCode 入口（2026-09-25 Claude Code）
// 用终端 TUI 同款渲染管线显示 Markdown：扩展进程（Node）经 renderer.js 调 terminal-style-ui-web
// 产出格子化 HTML → Webview（配渲染库自带的 terminal.css）。两个入口共用 bindWebview：
//   1. 预览面板：命令 / 编辑器标题栏按钮打开；跟随活动的 Markdown 编辑器切换文档（同内置预览），随编辑实时刷新
//   2. 自定义编辑器：「重新打开编辑器的方式…」→「终端风格渲染」，任意后缀都可以（priority=option，不抢默认）
// 联动：渲染库给出块级源码映射（源码行 → 渲染行），编辑器与预览双向滚动，双击预览跳回源码对应行。
const { execFile } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const vscode = require("vscode");
const { render, resolveLibDir } = require("./renderer.js");

const PREVIEW_TYPE = "terminalStyleUi.preview";
const VIEWER_TYPE = "terminalStyleUi.viewer";
const SYNC_QUIET_MS = 300; // 预览带动编辑器滚动后，这段时间内忽略编辑器回传的可见范围变化（防回环）
const FONT_DEFAULT = 13, FONT_MIN = 6, FONT_MAX = 48;

const bindings = new Set();
let preview = null; // 动态预览（全局一个）：{ panel, binding }
let seqCounter = 0;
// 最近一次下发 / 回执 / 预览滚动位置：作为 activate 的返回值，供 test/smoke.js 断言整条链路
const stats = {
  last: null, lastAck: null, lastScroll: null, scrollAcks: new Map(),
  postToPreview: (msg) => preview?.panel.webview.postMessage(msg),
  lineToRow, rowToLine,
};

const config = () => vscode.workspace.getConfiguration("terminalStyleUi");
const clampFont = (size) => Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(size)));
const fontSize = () => clampFont(Number(config().get("fontSize")) || FONT_DEFAULT);
// 字号写回全局设置：所有预览同步，重启后保留；回到默认值则删掉用户设置
const setFontSize = (size) =>
  config().update("fontSize", size === FONT_DEFAULT ? undefined : size, vscode.ConfigurationTarget.Global);

function autoTheme() {
  const { kind } = vscode.window.activeColorTheme;
  return kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight ? "light" : "dark";
}
function effectiveTheme() {
  const setting = config().get("theme");
  return setting === "dark" || setting === "light" ? setting : autoTheme();
}
// 标题栏 ☀ / ☾ 手动切换：目标与「跟随 VSCode」的结果相同则回到 auto（之后继续跟随），否则写死
const setTheme = (target) =>
  config().update("theme", target === autoTheme() ? undefined : target, vscode.ConfigurationTarget.Global);
// 标题栏按钮按当前生效主题显示：dark 时显示 ☀（切到浅色），light 时显示 ☾（切到深色）
const syncThemeContext = () => vscode.commands.executeCommand("setContext", "terminalStyleUi.theme", effectiveTheme());

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("terminalStyleUi.openPreview", (uri) => openPreview(context, uri, false)),
    vscode.commands.registerCommand("terminalStyleUi.openPreviewToSide", (uri) => openPreview(context, uri, true)),
    vscode.commands.registerCommand("terminalStyleUi.showSource", (uri) => {
      if (uri instanceof vscode.Uri) return vscode.commands.executeCommand("vscode.openWith", uri, "default");
    }),
    vscode.commands.registerCommand("terminalStyleUi.treatAsMarkdown", (uri) =>
      treatAsMarkdown(uri instanceof vscode.Uri ? uri : activeResource())),
    // 导出：第二个参数给出输出位置时不弹保存框（集成测试用）
    vscode.commands.registerCommand("terminalStyleUi.exportHtml", (uri, out) => exportDocument("html", uri, out)),
    vscode.commands.registerCommand("terminalStyleUi.exportPdf", (uri, out) => exportDocument("pdf", uri, out)),
    vscode.commands.registerCommand("terminalStyleUi.themeLight", () => setTheme("light")),
    vscode.commands.registerCommand("terminalStyleUi.themeDark", () => setTheme("dark")),
    vscode.commands.registerCommand("terminalStyleUi.zoomIn", () => setFontSize(clampFont(fontSize() + 1))),
    vscode.commands.registerCommand("terminalStyleUi.zoomOut", () => setFontSize(clampFont(fontSize() - 1))),
    vscode.commands.registerCommand("terminalStyleUi.zoomReset", () => setFontSize(FONT_DEFAULT)),
    vscode.window.registerCustomEditorProvider(
      VIEWER_TYPE,
      { resolveCustomTextEditor: (document, panel) => { bindWebview(context, panel, document.uri); } },
      { webviewOptions: { enableFindWidget: true }, supportsMultipleEditorsPerDocument: true },
    ),
    // 预览跟随活动的编辑器（任意文件；输出面板等非文件编辑器不跟）
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (preview && editor && ["file", "untitled", "vscode-remote"].includes(editor.document.uri.scheme)) preview.binding.setDocument(editor.document.uri);
    }),
    vscode.window.onDidChangeActiveColorTheme(() => {
      syncThemeContext();
      for (const binding of bindings) binding.refresh();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("terminalStyleUi.theme")) syncThemeContext();
    }),
  );
  syncThemeContext();
  return { stats };
}

function deactivate() {}

// 当前活动编辑器的文件：文本编辑器优先，否则取活动标签页（自定义编辑器等）
function activeResource() {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  return vscode.window.activeTextEditor?.document.uri ?? (input?.uri instanceof vscode.Uri ? input.uri : undefined);
}

const titleOf = (uri) => `${path.posix.basename(uri.path)} · 终端预览`;

function openPreview(context, uri, toSide) {
  const target = uri instanceof vscode.Uri ? uri : activeResource();
  if (!target) {
    vscode.window.showInformationMessage("Terminal Style UI：请先打开一个文件");
    return;
  }
  if (preview) {
    preview.binding.setDocument(target);
    preview.panel.reveal(undefined, toSide);
    return;
  }
  const panel = vscode.window.createWebviewPanel(
    PREVIEW_TYPE,
    titleOf(target),
    { viewColumn: toSide ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active, preserveFocus: toSide },
    { enableFindWidget: true },
  );
  preview = { panel, binding: bindWebview(context, panel, target, true) };
  panel.onDidDispose(() => { preview = null; });
}

// 把某后缀登记为 Markdown（写入用户设置 files.associations）：之后该后缀的文件都按 Markdown 识别，预览按钮随之出现
async function treatAsMarkdown(uri) {
  if (!uri) {
    vscode.window.showInformationMessage("Terminal Style UI：请先打开要识别的文件");
    return;
  }
  const name = path.posix.basename(uri.path);
  const ext = path.posix.extname(name);
  const pattern = ext ? `*${ext}` : name;
  const files = vscode.workspace.getConfiguration("files");
  const current = files.inspect("associations")?.globalValue ?? {};
  if (current[pattern] !== "markdown") {
    await files.update("associations", { ...current, [pattern]: "markdown" }, vscode.ConfigurationTarget.Global);
  }
  vscode.window.showInformationMessage(`Terminal Style UI：${pattern} 已识别为 Markdown`);
}

// ── 导出 HTML / PDF ──
// HTML：独立文件（内联 terminal.css、无脚本），按当前预览的列数与主题渲染——所见即所得，浏览器里也可直接打印；
// PDF：同一份 HTML 交给本机 Chromium 系浏览器的无界面模式打印——一整张长页（页宽恰好放下这些列、页高恰好放下所有行），
// 阅读器里不会出现分页处的白缝；超过 PDF 单页上限（200 英寸）才分页
const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
];
const EXPORT_COLS_DEFAULT = 100;
const MONACO_ADVANCE = 0.6001; // Monaco 字宽（em），用来算打印页宽
const MAX_PAGE_PX = 200 * 96; // PDF 单页边长上限 200 英寸
const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// 要导出的文档：菜单传入的文件 → 活动的预览面板所显示的文档 → 活动编辑器
function exportTarget(uri) {
  if (uri instanceof vscode.Uri && uri.scheme !== "webview-panel") return uri;
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (preview && input instanceof vscode.TabInputWebview && input.viewType.endsWith(PREVIEW_TYPE)) return preview.binding.uri;
  return activeResource();
}

function standaloneHtml({ html, theme, title, size, cols, libDir }) {
  const light = theme === "light";
  const pageWidth = Math.ceil(cols * size * MONACO_ADVANCE + 32); // 左右各 16px 留白（terminal.css）
  // 行高同 terminal.css 的 round(1.3em)；上下留白各一行；+2px 余量防止末尾多出一张空页
  const pageHeight = Math.min(MAX_PAGE_PX, (html.split("\n").length + 2) * Math.round(size * 1.3) + 2);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
${fs.readFileSync(path.join(libDir, "terminal.css"), "utf8")}
html, body { margin: 0; background: ${light ? "#fff" : "#000"}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.terminal-style-ui { font-size: ${size}px; margin: 0; padding-top: 1lh; padding-bottom: 1lh; overflow: visible; }
@page { size: ${pageWidth}px ${pageHeight}px; margin: 0; }
</style>
</head>
<body><pre class="terminal-style-ui${light ? " ttu-light" : ""}">${html}</pre></body>
</html>
`;
}

function printPdf(page, outPath) {
  const chrome = config().get("chromePath") || CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!chrome) {
    throw new Error("没有找到 Chrome / Edge / Chromium（导出 PDF 需要）。请在设置 terminalStyleUi.chromePath 指定，或先导出 HTML 再用浏览器打印");
  }
  const source = path.join(os.tmpdir(), "terminal-style-ui-export.html"); // 固定路径，每次覆盖
  fs.writeFileSync(source, page);
  const args = ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${outPath}`, pathToFileURL(source).href];
  return new Promise((resolve, reject) => {
    execFile(chrome, args, { timeout: 120000 }, (err, stdout, stderr) => {
      if (!err && fs.existsSync(outPath)) resolve();
      else reject(new Error(`Chrome 打印 PDF 失败：${err?.message || stderr || "未生成文件"}`));
    });
  });
}

async function exportDocument(kind, uri, out) {
  const target = exportTarget(uri);
  if (!target) {
    vscode.window.showInformationMessage("Terminal Style UI：请先打开要导出的文件");
    return;
  }
  const ext = kind === "pdf" ? "pdf" : "html";
  if (!(out instanceof vscode.Uri)) {
    const base = target.scheme === "file" ? target.fsPath.replace(/\.[^./]+$/, "") : path.join(os.homedir(), "untitled");
    out = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`${base}.${ext}`),
      filters: kind === "pdf" ? { PDF: ["pdf"] } : { HTML: ["html"] },
    });
    if (!out) return;
  }
  try {
    const bound = [...bindings].find((b) => b.uri.toString() === target.toString() && b.cols);
    const cols = config().get("width") || bound?.cols || EXPORT_COLS_DEFAULT;
    const theme = effectiveTheme();
    const libDir = resolveLibDir(config().get("libraryPath"));
    const doc = await vscode.workspace.openTextDocument(target);
    const { html } = await render(doc.getText(), {
      width: cols, theme, libDir,
      fileName: path.posix.basename(doc.uri.path), languageId: doc.languageId,
    });
    const page = standaloneHtml({ html, theme, title: path.posix.basename(target.path), size: fontSize(), cols, libDir });
    if (kind === "pdf") await printPdf(page, out.fsPath);
    else await vscode.workspace.fs.writeFile(out, Buffer.from(page, "utf8"));
    stats.lastExport = { kind, path: out.fsPath, cols, theme };
    vscode.window.showInformationMessage(`Terminal Style UI：已导出 ${path.basename(out.fsPath)}`, "打开").then((choice) => {
      if (choice) vscode.env.openExternal(out);
    });
  } catch (err) {
    vscode.window.showErrorMessage(`Terminal Style UI：导出失败——${err?.message || err}`);
    stats.lastExport = { kind, error: String(err?.message || err) };
  }
}

// 块级源码映射 blocks = [{ line, row }]（按序，末尾为哨兵）上的线性插值：源码行 ↔ 渲染行
function lineToRow(blocks, line) {
  let i = 0;
  while (i + 2 < blocks.length && blocks[i + 1].line <= line) i++;
  const a = blocks[i], b = blocks[i + 1] ?? a;
  const t = b.line > a.line ? (Math.min(Math.max(line, a.line), b.line) - a.line) / (b.line - a.line) : 0;
  return a.row + t * (b.row - a.row);
}
function rowToLine(blocks, row) {
  let i = 0;
  while (i + 2 < blocks.length && blocks[i + 1].row <= row) i++;
  const a = blocks[i], b = blocks[i + 1] ?? a;
  const t = b.row > a.row ? (Math.min(Math.max(row, a.row), b.row) - a.row) / (b.row - a.row) : 0;
  return a.line + t * (b.line - a.line);
}

// 把 webview 绑定到一份 Markdown 文档：webview 回报列数 → 渲染下发；文档变化 → 防抖重渲染；
// 编辑器 / 预览滚动 → 按源码映射带动对侧；设置变化 → 字号就地生效，其余重渲染（库路径变化则重建页面）
function bindWebview(context, panel, initialUri, isPreview = false) {
  const { webview } = panel;
  let uri = initialUri;
  let key = uri.toString();
  let cols = 0;
  let latest = 0;
  let disposed = false;
  let blocks = null;
  let quietEditorUntil = 0;

  const load = () => {
    const libDir = resolveLibDir(config().get("libraryPath"));
    webview.options = { enableScripts: true, localResourceRoots: [context.extensionUri, vscode.Uri.file(libDir)] };
    webview.html = shellHtml(context, webview, libDir);
  };

  const sourceEditors = () => vscode.window.visibleTextEditors.filter((e) => e.document.uri.toString() === key);
  const syncEnabled = () => config().get("scrollSync") !== false;

  // 编辑器 → 预览：编辑器顶部可见行对应的渲染行
  const followEditor = (editor = sourceEditors()[0]) => {
    if (!editor || !blocks || !syncEnabled()) return;
    const line = editor.visibleRanges[0]?.start.line ?? 0;
    webview.postMessage({ type: "scrollToRow", row: lineToRow(blocks, line) });
  };

  // 预览 → 编辑器：预览顶部的渲染行对应的源码行置顶
  const revealInEditors = (row) => {
    if (!blocks) return;
    const line = Math.max(0, Math.floor(rowToLine(blocks, row)));
    for (const editor of sourceEditors()) {
      quietEditorUntil = Date.now() + SYNC_QUIET_MS;
      editor.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.AtTop);
    }
  };

  // 双击预览：跳到源码对应行（没有可见的源码编辑器就在旁边打开一个）
  const jumpToSource = async (row) => {
    if (!blocks) return;
    const line = Math.max(0, Math.floor(rowToLine(blocks, row)));
    const selection = new vscode.Range(line, 0, line, 0);
    const editor = sourceEditors()[0];
    await vscode.window.showTextDocument(editor?.document ?? uri, {
      viewColumn: editor?.viewColumn ?? vscode.ViewColumn.Beside,
      selection,
    });
  };

  let shown = null; // 预览页当前显示的 { theme, lines }：新结果只和它比对、只发变化的那一段；页面重建 / 换文档时清空
  let perf = {}; // 延迟测量：edit → start → rendered → post（毫秒时间戳），随 render 消息带给预览页补上 recv / dom / paint
  const refresh = async () => {
    // 隐藏的面板不渲染（webview 已销毁，消息会丢）；重新显示时 webview 重建并回报 ready，自然拿到最新内容
    if (!cols || disposed || !panel.visible) return;
    const seq = ++seqCounter;
    latest = seq;
    const t = { edit: perf.edit, start: Date.now() };
    perf = {};
    const width = config().get("width") || cols;
    const theme = effectiveTheme();
    let msg;
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const result = await render(doc.getText(), {
        fileName: path.posix.basename(doc.uri.path),
        languageId: doc.languageId,
        width,
        theme,
        libDir: resolveLibDir(config().get("libraryPath")),
      });
      if (disposed || seq !== latest) return; // 渲染期间又触发了新一轮：丢弃过期结果
      blocks = result.blocks;
      t.rendered = Date.now();
      const lines = result.html.split("\n"); // 每行的 HTML 自成一体（ansiToHtml 行尾闭合样式段），可按行替换
      if (!shown || shown.theme !== theme) {
        msg = { type: "render", seq, theme, lines, perf: t };
      } else {
        const old = shown.lines;
        let start = 0;
        while (start < old.length && start < lines.length && old[start] === lines[start]) start++;
        let end = 0; // 末尾相同的行数（不与开头重叠）
        while (end < old.length - start && end < lines.length - start && old[old.length - 1 - end] === lines[lines.length - 1 - end]) end++;
        msg = { type: "patch", seq, theme, start, remove: old.length - start - end, lines: lines.slice(start, lines.length - end), perf: t };
      }
      shown = { theme, lines };
    } catch (err) {
      if (disposed || seq !== latest) return;
      msg = { type: "error", seq, theme, message: `Terminal Style UI 渲染失败：${err?.stack || err}\n\n请检查设置 terminalStyleUi.libraryPath` };
    }
    stats.last = { ...msg, html: msg.type === "error" ? undefined : shown.lines.join("\n"), width, blocks, uri: key };
    if (msg.perf) msg.perf.post = Date.now();
    webview.postMessage(msg);
    followEditor(); // 内容 / 列数变化后行号会移动：按编辑器当前位置重新对齐
  };
  // 不防抖（防抖本身就是 40ms 延迟）：编辑后下一轮事件循环就渲染；渲染进行中又有编辑，就等这次做完再补一次（合并，不排队）
  let running = false;
  let again = false;
  const schedule = () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    setImmediate(async () => {
      try {
        do {
          again = false;
          await refresh();
        } while (again && !disposed);
      } finally {
        running = false;
      }
    });
  };

  const binding = {
    get uri() { return uri; },
    get cols() { return cols; },
    refresh,
    setDocument(next) {
      if (disposed || next.toString() === key) return;
      uri = next;
      key = next.toString();
      blocks = null;
      if (isPreview) panel.title = titleOf(uri);
      shown = null;
      webview.postMessage({ type: "reset" });
      refresh();
    },
  };
  bindings.add(binding);

  const subscriptions = [
    webview.onDidReceiveMessage((msg) => {
      switch (msg.type) {
        case "ready":
        case "resize":
          if (msg.type === "ready") shown = null; // 页面刚建好（首次 / 隐藏后重建），里面是空的
          cols = msg.cols;
          refresh();
          break;
        case "rendered":
          stats.lastAck = msg;
          if (msg.perf) (stats.perf ??= []).push(msg.perf);
          break;
        case "scrolled": // 用户滚动预览
          stats.lastScroll = msg;
          if (syncEnabled()) revealInEditors(msg.row);
          break;
        case "scrollAck": // 联动带动的滚动已落定（带 id 的是测试注入滚轮的回执）
          stats.lastScroll = msg;
          if (msg.id) stats.scrollAcks.set(msg.id, msg);
          break;
        case "reveal":
          jumpToSource(msg.row);
          break;
        case "selAck": // 测试：自绘选区的回执
          stats.lastSel = msg;
          break;
        case "zoomTo":
          setFontSize(clampFont(msg.size));
          break;
      }
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === key && e.contentChanges.length) {
        perf.edit ??= Date.now(); // 测延迟：这一轮渲染对应的第一次编辑
        schedule();
      }
    }),
    vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
      if (e.textEditor.document.uri.toString() === key && Date.now() >= quietEditorUntil) followEditor(e.textEditor);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("terminalStyleUi.libraryPath")) load(); // 样式表路径变了：重建页面
      else if (e.affectsConfiguration("terminalStyleUi.fontSize")) webview.postMessage({ type: "font", size: fontSize() });
      else if (e.affectsConfiguration("terminalStyleUi")) refresh();
    }),
  ];
  panel.onDidDispose(() => {
    disposed = true;
    bindings.delete(binding);
    for (const s of subscriptions) s.dispose();
  });
  load();
  return binding;
}

// 页面骨架：内容由 webview.js 按消息填充。CSP 的 style-src 只能用 'unsafe-inline'、不能带 nonce——
// ansiToHtml 的输出全是内联 style 属性，style-src 一旦出现 nonce，'unsafe-inline' 即失效，颜色/格子样式全被拦
function shellHtml(context, webview, libDir) {
  const nonce = crypto.randomBytes(16).toString("hex");
  const terminalCss = webview.asWebviewUri(vscode.Uri.file(path.join(libDir, "terminal.css")));
  const script = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "webview.js"));
  const light = effectiveTheme() === "light";
  return `<!DOCTYPE html>
<html lang="zh-CN" class="${light ? "light" : ""}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${terminalCss}">
<style>
  /* 整个面板当终端窗口：底色铺满，由页面滚动；同终端不显示滚动条（滚轮 / 触控板 / 键盘照常滚动） */
  html { background: #000; scrollbar-width: none; }
  html.light { background: #fff; }
  html::-webkit-scrollbar { display: none; }
  body { margin: 0; padding: 0; background: inherit; }
  /* 上下留白各恰为一行：滚动按行格吸附（底边对齐）时，拉到最底也落在行格上 */
  .terminal-style-ui { font-size: ${fontSize()}px; padding-top: 1lh; padding-bottom: 1lh; min-height: 100vh; box-sizing: border-box; overflow: visible; }
  .terminal-style-ui.ttu-error { color: #ff6b6b; white-space: pre-wrap; }
  /* 选区自己画（同 iTerm：浅蓝底 #b5d5ff、黑字）：原生高亮透明，webview.js 按行画整行高、对齐字符格的矩形，
     垫在文字之下（pre 成为层叠上下文，选区层 z-index:-1 → 在 pre 底色之上、文字之下）；制表符的透明字形选中后仍透明 */
  .terminal-style-ui { position: relative; z-index: 0; }
  .terminal-style-ui::selection, .terminal-style-ui ::selection { background: transparent; color: #000; }
  .terminal-style-ui .ttu-box::selection { color: transparent; -webkit-text-fill-color: transparent; }
  #ttu-sel { position: absolute; left: 0; top: 0; z-index: -1; pointer-events: none; user-select: none; }
  /* 每行一个块：空行也占一行高；屏幕外的行跳过排版与绘制（大文档打字时只重排改动附近） */
  #ttu-rows > .r { display: block; min-height: 1lh; content-visibility: auto; contain-intrinsic-size: auto 1lh; }
  #ttu-sel > div { position: absolute; background: #b5d5ff; }
  #ttu-zoom { position: fixed; top: 8px; right: 16px; padding: 2px 8px; border-radius: 4px; font: 12px var(--vscode-font-family);
    color: var(--vscode-editorWidget-foreground); background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-widget-border, transparent); opacity: 0; transition: opacity .2s; pointer-events: none; }
  #ttu-zoom.show { opacity: 1; }
</style>
</head>
<body>
<pre id="ttu" class="terminal-style-ui${light ? " ttu-light" : ""}"></pre>
<div id="ttu-zoom"></div>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}

module.exports = { activate, deactivate };
