// test/smoke.js —— 集成冒烟测试（Terminal Style UI for VSCode，2026-09-25 Claude Code）
// 由 test/run.js 启动真实 VSCode 后在扩展进程里运行。覆盖：侧边预览（渲染 → webview 填充 → 回执）、真彩、
// 链接不印 URL、吞字回归、实时刷新、列数设置、字号缩放、light 主题、双向滚动联动、预览跟随活动编辑器、
// .WIKI 后缀、未登记后缀 +「识别为 Markdown」、自定义编辑器、显示源文件、渲染后 FORCE_COLOR / COLORTERM 恢复原值。
// 截图模式（run.js --screenshot）另截 dark / light 并排与预览独占。
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vscode = require("vscode");

async function waitFor(what, predicate, timeoutMs = 20000) {
  const start = Date.now();
  for (;;) {
    const value = predicate();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`等待超时：${what}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

exports.run = async () => {
  const dir = process.env.TTU_TEST_DIR;
  const envBefore = { FORCE_COLOR: process.env.FORCE_COLOR, COLORTERM: process.env.COLORTERM, TERM_PROGRAM: process.env.TERM_PROGRAM };
  console.log("[smoke] 扩展进程环境：", JSON.stringify(envBefore));
  const ext = vscode.extensions.getExtension("apollozhang.terminal-style-ui-vscode");
  assert.ok(ext, "扩展未加载");
  const { stats } = await ext.activate();
  // 最近一次下发已被 webview 回执、且满足条件 → 返回该次下发
  const acked = (predicate = () => true) =>
    stats.last && stats.lastAck?.seq === stats.last.seq && predicate(stats.last) ? stats.last : null;
  // 测试文档：首行放标记，正文为 fixture 重复 6 节（足够长，用来测滚动联动）
  const fixture = fs.readFileSync(path.join(__dirname, "fixture.md"), "utf8");
  const body = Array.from({ length: 6 }, (_, i) => `## 第 ${i + 1} 节\n\n${fixture}`).join("\n\n");
  const writeDoc = (name, marker) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, `${marker}\n\n${body}`);
    return vscode.Uri.file(file);
  };
  const show = async (uri) => vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), { viewColumn: vscode.ViewColumn.One });
  const cfg = () => vscode.workspace.getConfiguration("terminalStyleUi");

  const uri = writeDoc("smoke.md", "SMOKE-MARK");
  const editor = await show(uri);

  // 1. 侧边预览
  await vscode.commands.executeCommand("terminalStyleUi.openPreviewToSide");
  const first = await waitFor("预览首次渲染回执", () => acked());
  assert.strictEqual(first.type, "render", first.message);
  const autoCols = stats.lastAck.cols;
  assert.ok(autoCols >= 20 && first.width === autoCols, `自动列数异常：cols=${autoCols} width=${first.width}`);
  assert.match(first.html, /color:rgb\(177,185,249\)/, "行内码应为真彩主题色");
  assert.doesNotMatch(first.html, /example\.com\/doc/, "具名链接应只显示文字、不印 URL");
  // 吞字回归（渲染库 DEVELOPMENT 坑 8）：转义序列不能残留成文字，序列后的首字不能丢
  assert.doesNotMatch(first.html, /\[\d+(;\d+)*m/, "HTML 里不应残留转义序列文字");
  assert.match(first.html, />一</, "标题首字「一」不应被吞");
  assert.ok(first.blocks?.length > 10, "应带源码映射");
  console.log(`[smoke] 1 侧边预览 OK（自动 ${autoCols} 列，映射 ${first.blocks.length} 块）`);

  // 2. 实时刷新
  const edit = new vscode.WorkspaceEdit();
  edit.insert(uri, new vscode.Position(0, 0), "LIVE-REFRESH-MARK\n\n");
  assert.ok(await vscode.workspace.applyEdit(edit));
  await waitFor("编辑后实时刷新", () => acked((m) => m.html?.includes("LIVE-REFRESH-MARK")));
  console.log("[smoke] 2 实时刷新 OK");

  // 3. 固定列数设置，再恢复自动
  await cfg().update("width", 40, vscode.ConfigurationTarget.Global);
  await waitFor("固定列数 40 生效", () => acked((m) => m.width === 40));
  await cfg().update("width", undefined, vscode.ConfigurationTarget.Global);
  await waitFor("恢复自动列数", () => acked((m) => m.width === autoCols));
  console.log("[smoke] 3 列数设置 OK");

  // 4. 字号缩放：放大两号 → 字宽变大 → 列数变少；重置后回到原列数
  await vscode.commands.executeCommand("terminalStyleUi.zoomIn");
  await vscode.commands.executeCommand("terminalStyleUi.zoomIn");
  await waitFor("放大后字号写回设置", () => cfg().get("fontSize") === 15);
  await waitFor("放大后按更少列数重排", () => acked((m) => m.width < autoCols));
  await vscode.commands.executeCommand("terminalStyleUi.zoomReset");
  await waitFor("重置字号后恢复原列数", () => acked((m) => m.width === autoCols));
  console.log("[smoke] 4 字号缩放 OK");

  // 5. light 主题，再回到跟随 VSCode（测试实例为深色主题）
  await cfg().update("theme", "light", vscode.ConfigurationTarget.Global);
  await waitFor("切到 light", () => acked((m) => m.theme === "light"));
  await cfg().update("theme", undefined, vscode.ConfigurationTarget.Global);
  await waitFor("回到 dark", () => acked((m) => m.theme === "dark"));
  // 标题栏 ☀ / ☾：测试实例是深色主题（auto = dark）→ ☀ 写死 light；☾ 切回 dark 与 auto 相同 → 回到 auto
  await vscode.commands.executeCommand("terminalStyleUi.themeLight");
  await waitFor("☀ 切到 light", () => cfg().inspect("theme").globalValue === "light" && acked((m) => m.theme === "light"));
  await vscode.commands.executeCommand("terminalStyleUi.themeDark");
  await waitFor("☾ 回到 auto(dark)", () => cfg().inspect("theme").globalValue === undefined && acked((m) => m.theme === "dark"));
  console.log("[smoke] 5 dark / light + ☀/☾ 切换 OK");

  // 6. 双向滚动联动
  editor.revealRange(new vscode.Range(150, 0, 150, 0), vscode.TextEditorRevealType.AtTop);
  const topLine = await waitFor("编辑器滚到 150 行附近", () => {
    const line = editor.visibleRanges[0]?.start.line;
    return line >= 140 ? line : null;
  });
  const wantRow = stats.lineToRow(stats.last.blocks, topLine);
  await waitFor("编辑器 → 预览", () => stats.lastScroll && Math.abs(stats.lastScroll.row - wantRow) <= 1);
  stats.postToPreview({ type: "testScroll", rows: -40 });
  await waitFor("预览 → 编辑器", () => {
    if (!stats.lastScroll || Math.abs(stats.lastScroll.row - Math.round(wantRow) + 40) > 1) return false;
    const line = Math.floor(stats.rowToLine(stats.last.blocks, stats.lastScroll.row));
    // 编辑器顶部有粘性滚动（Sticky Scroll，悬浮显示外层标题，最多 5 行）：revealRange(AtTop) 把目标行放在悬浮层之下，
    // 而 visibleRanges 从被悬浮层盖住的行算起——目标行 = 可见起始行 + 0~5
    const hidden = line - editor.visibleRanges[0].start.line;
    return hidden >= -1 && hidden <= 5;
  }).catch((err) => {
    const row = stats.lastScroll?.row;
    console.log("[smoke] 诊断：", JSON.stringify({ wantRow, lastScroll: stats.lastScroll, mappedLine: row == null ? null : stats.rowToLine(stats.last.blocks, row), editorTop: editor.visibleRanges[0]?.start.line, lastUri: stats.last.uri }));
    throw err;
  });
  console.log(`[smoke] 6 双向联动 OK（编辑器 ${topLine} 行 ↔ 预览 ${wantRow.toFixed(1)} 行）`);

  // 6b. 整行滚动：滚轮增量累积满一行才走一行，落点的视口底边始终在行边界上（底边对齐）；反向立即清零
  let wheelId = 0;
  const wheel = async (deltas) => {
    const id = ++wheelId;
    stats.postToPreview({ type: "testWheel", id, deltas });
    return waitFor(`滚轮回执 ${id}`, () => stats.scrollAcks.get(id));
  };
  const r0 = (await wheel([])).row;
  const steps = [[[0.35, 0.35], 0], [[0.35], 1], [[-0.2], 1], [[-2.5], -1]];
  for (const [deltas, expect] of steps) {
    const { row, bottom, atTop } = await wheel(deltas);
    assert.ok(atTop || Math.abs(bottom - Math.round(bottom)) < 0.01, `视口底边应落在行边界上：${bottom}`);
    assert.strictEqual(Math.round(row - r0), expect, `滚轮 ${JSON.stringify(deltas)} 后应在 r0${expect >= 0 ? "+" : ""}${expect}，实际 ${row - r0}`);
  }
  console.log("[smoke] 6b 整行滚动 OK（底边对齐；0.7 行不动 → 满 1 行走 1 行 → 反向清零 → 2.7 行走 2 行）");

  // 6c. 自绘选区：全选后每块整行高、对齐字符格；选中文本带表格边框（制表符格子里的透明字形）
  stats.lastSel = null;
  stats.postToPreview({ type: "testSelect" });
  const sel = await waitFor("选区回执", () => stats.lastSel);
  assert.ok(sel.blocks > 20 && sel.aligned, `选区块应整行对齐：${JSON.stringify({ blocks: sel.blocks, aligned: sel.aligned })}`);
  assert.match(sel.text, /┌─+┬/, "复制文本应带表格边框");
  console.log(`[smoke] 6c 自绘选区 OK（${sel.blocks} 行，整行高、对齐字符格；复制带边框）`);

  // 7. 预览跟随活动的 Markdown 编辑器
  await show(writeDoc("other.md", "OTHER-MARK"));
  await waitFor("预览跟随到 other.md", () => acked((m) => m.html?.includes("OTHER-MARK")));
  console.log("[smoke] 7 预览跟随活动编辑器 OK");

  // 8. .WIKI 后缀（大写）按 Markdown 识别，预览自动跟过去
  const wiki = writeDoc("note.WIKI", "WIKI-MARK");
  const wikiEditor = await show(wiki);
  assert.strictEqual(wikiEditor.document.languageId, "markdown", ".WIKI 应被识别为 Markdown");
  await waitFor("预览跟随到 .WIKI", () => acked((m) => m.html?.includes("WIKI-MARK")));
  console.log("[smoke] 8 .WIKI 后缀 OK");

  // 8b. 任意文件：Python 代码跟随预览——灰色行号 + 空格、不画竖线；源码映射精确到行（每个源码行一项 + 哨兵）
  const pyLines = Array.from({ length: 40 }, (_, i) => `def f${i}(x):  # PY-MARK ${i}`);
  const pyFile = path.join(dir, "code.py"); // 不用 writeDoc：它会在后面拼 Markdown 夹具（按内容判断就成了 Markdown）
  fs.writeFileSync(pyFile, pyLines.join("\n") + "\n");
  await show(vscode.Uri.file(pyFile));
  const py = await waitFor("预览跟随到 code.py", () => acked((m) => m.html?.includes("PY-MARK")));
  assert.match(py.html, /rgb\(136,136,136\)">\s*1<\/span>/, `行号应为灰色：${py.html.slice(0, 300)}`);
  assert.ok(!py.html.includes("│"), "纯代码不画行号竖线");
  assert.strictEqual(stats.last.blocks?.length, pyLines.length + 1, `源码映射应逐行：${stats.last.blocks?.length}`);
  console.log("[smoke] 8b 任意文件（.py：灰色行号、逐行映射）OK");

  // 9. 未登记的后缀：不自动跟随，但可直接预览；「识别为 Markdown」写入 files.associations 后语言模式随之切换
  const odd = writeDoc("note.xyz", "XYZ-MARK");
  assert.strictEqual((await show(odd)).document.languageId, "plaintext");
  await vscode.commands.executeCommand("terminalStyleUi.openPreviewToSide");
  await waitFor(".xyz 直接预览", () => acked((m) => m.html?.includes("XYZ-MARK")));
  await vscode.commands.executeCommand("terminalStyleUi.treatAsMarkdown");
  assert.strictEqual(vscode.workspace.getConfiguration("files").inspect("associations").globalValue?.["*.xyz"], "markdown");
  await waitFor(".xyz 语言模式切换为 Markdown", () =>
    vscode.workspace.textDocuments.find((d) => d.uri.toString() === odd.toString())?.languageId === "markdown");
  console.log("[smoke] 9 未登记后缀 OK");

  // 10. 自定义编辑器（与文本编辑器共享同一份 TextDocument：未保存的编辑也可见）
  const seqBefore = stats.last.seq;
  await vscode.commands.executeCommand("vscode.openWith", uri, "terminalStyleUi.viewer");
  await waitFor("自定义编辑器回执", () => acked((m) => m.seq > seqBefore && m.html?.includes("LIVE-REFRESH-MARK")));
  console.log("[smoke] 10 自定义编辑器 OK");

  // 11. 显示源文件（从自定义编辑器切回文本编辑器）
  await vscode.commands.executeCommand("terminalStyleUi.showSource", uri);
  await waitFor("切回文本编辑器", () => vscode.window.activeTextEditor?.document.uri.toString() === uri.toString());
  console.log("[smoke] 11 显示源文件 OK");

  // 12. 导出 HTML / PDF（指定输出位置，不弹保存框）
  const htmlOut = vscode.Uri.file(path.join(dir, "export.html"));
  await vscode.commands.executeCommand("terminalStyleUi.exportHtml", uri, htmlOut);
  const exported = fs.readFileSync(htmlOut.fsPath, "utf8");
  assert.match(exported, /<pre class="terminal-style-ui/, "HTML 应含渲染结果");
  assert.match(exported, /line-height: round\(/, "HTML 应内联 terminal.css");
  assert.doesNotMatch(exported, /<script/, "导出的 HTML 不含脚本");
  const pdfOut = vscode.Uri.file(path.join(dir, "export.pdf"));
  await vscode.commands.executeCommand("terminalStyleUi.exportPdf", uri, pdfOut);
  assert.ok(stats.lastExport?.kind === "pdf" && !stats.lastExport.error, stats.lastExport?.error);
  const pdf = fs.readFileSync(pdfOut.fsPath);
  assert.ok(pdf.subarray(0, 5).toString() === "%PDF-" && pdf.length > 10000, `PDF 无效（${pdf.length} 字节）`);
  const pdfPages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.strictEqual(pdfPages, 1, `PDF 应为一整张长页（阅读器里不出现分页白缝），实际 ${pdfPages} 页`);
  console.log(`[smoke] 12 导出 OK（HTML ${Math.round(exported.length / 1024)}KB，PDF ${Math.round(pdf.length / 1024)}KB，${stats.lastExport.cols} 列）`);

  // 13. 环境卫生
  assert.strictEqual(process.env.FORCE_COLOR, envBefore.FORCE_COLOR, "FORCE_COLOR 应恢复原值");
  assert.strictEqual(process.env.COLORTERM, envBefore.COLORTERM, "COLORTERM 应恢复原值");
  console.log("[smoke] 13 环境变量已恢复 OK");

  fs.writeFileSync(path.join(dir, "page.json"), JSON.stringify({ cols: autoCols, html: stats.last.html }));

  if (process.env.TTU_SCREENSHOT) {
    // 保存（关编辑器时不弹保存框）、回到文首，收起侧栏/面板，只留「源文件 | 侧边预览」
    await vscode.window.activeTextEditor.document.save();
    vscode.window.activeTextEditor.revealRange(new vscode.Range(0, 0, 0, 0), vscode.TextEditorRevealType.AtTop);
    for (const cmd of ["workbench.action.closeSidebar", "workbench.action.closeAuxiliaryBar", "workbench.action.closePanel", "notifications.clearAll"]) {
      await vscode.commands.executeCommand(cmd);
    }
    await settle(acked);
    // 选中一段（普通段落 → 表格中间）看自绘选区
    const selectSome = () => stats.postToPreview({ type: "testSelectRange", fromRow: 10, fromCol: 8, toRow: 21, toCol: 20 });
    selectSome();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await screenshot("side-by-side");
    await cfg().update("theme", "light", vscode.ConfigurationTarget.Global);
    await settle(acked);
    selectSome();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await screenshot("side-by-side-light");
    await cfg().update("theme", undefined, vscode.ConfigurationTarget.Global);
    // 预览独占整个窗口
    await vscode.commands.executeCommand("workbench.action.focusSecondEditorGroup");
    await vscode.commands.executeCommand("workbench.action.closeEditorsInOtherGroups");
    await settle(acked);
    await screenshot("preview-full");
  }
  if (process.env.TTU_MEDIA) await mediaShots(process.env.TTU_MEDIA.split("\n"), acked);
  console.log("[smoke] 全部通过");
};

// README 配图：每个演示文件拍 dark / light 两张「源文件 | 侧边预览」；light 那张 VSCode 本身也换浅色主题（深色编辑器配浅色预览很怪）。
// 截图名 media-<文件名>-<主题>，由 run.js 存进临时目录
async function mediaShots(files, acked) {
  for (const cmd of ["workbench.action.closeSidebar", "workbench.action.closeAuxiliaryBar", "workbench.action.closePanel", "notifications.clearAll"]) {
    await vscode.commands.executeCommand(cmd);
  }
  const workbench = vscode.workspace.getConfiguration("workbench");
  const cfg = () => vscode.workspace.getConfiguration("terminalStyleUi");
  // 面包屑会露出本机目录（用户名），拍图时关掉
  await vscode.workspace.getConfiguration("breadcrumbs").update("enabled", false, vscode.ConfigurationTarget.Global);
  for (const file of files) {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One });
    await vscode.commands.executeCommand("terminalStyleUi.openPreviewToSide");
    await vscode.commands.executeCommand("workbench.action.focusFirstEditorGroup");
    await settle(acked);
    for (const theme of ["dark", "light"]) {
      await workbench.update("colorTheme", theme === "light" ? "Default Light Modern" : "Default Dark Modern", vscode.ConfigurationTarget.Global);
      await cfg().update("theme", theme, vscode.ConfigurationTarget.Global);
      await settle(acked);
      await screenshot(`media-${path.basename(file)}-${theme}`);
    }
    await cfg().update("theme", undefined, vscode.ConfigurationTarget.Global);
    await workbench.update("colorTheme", undefined, vscode.ConfigurationTarget.Global);
  }
}

// 版面变化 → webview 重测列数 → 重渲染：等这一轮回执落定
async function settle(acked) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await waitFor("版面变化后的重渲染回执", () => acked());
}

// 请求 run.js 截取本窗口（test/run.js 的 --screenshot 模式），等它完成再继续
async function screenshot(name) {
  const dir = process.env.TTU_TEST_DIR;
  fs.writeFileSync(path.join(dir, `${name}.request`), "");
  await waitFor(`截图 ${name}`, () => fs.existsSync(path.join(dir, `${name}.done`)), 30000);
  assert.ok(fs.existsSync(path.join(dir, `${name}.png`)), `截图失败：${name}`);
}
