// test/perf.js —— 预览延迟测量（2026-09-25 Claude Code）：node test/run.js --perf
// 在隔离的 VSCode 里打开不同大小的文档 + 侧边预览，逐个插入字符（等画出来再打下一个），统计各段耗时中位数：
//   debounce = 编辑 → 开始渲染（防抖）   render = 渲染（插件进程）   ipc = 发出 → 预览页收到
//   dom = 写入 DOM   paint = DOM → 画出下一帧   total = 编辑 → 画出
// 另测「连打」：30ms 一个字连打 10 个，最后一个字到画出的时间
const vscode = require("vscode");
const fs = require("node:fs");
const path = require("node:path");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(what, fn, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(10);
  }
  throw new Error(`等待超时：${what}`);
}
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

exports.run = async () => {
  const ext = vscode.extensions.getExtension("apollozhang.terminal-style-ui-vscode");
  const stats = (await ext.activate()).stats;
  const dir = process.env.TTU_TEST_DIR;
  const web = path.resolve(__dirname, "../../terminal-style-ui-web");
  const docs = [
    ["小（20 行）", fs.readFileSync(path.resolve(web, "../media/demo.md"), "utf8")],
    ["中（README）", fs.readFileSync(path.join(web, "README.md"), "utf8")],
    ["大（DEVELOPMENT × 4）", fs.readFileSync(path.join(web, "DEVELOPMENT.md"), "utf8").repeat(4)],
  ];
  const rows = [];
  for (const [label, text] of docs) {
    const file = path.join(dir, `perf-${rows.length}.md`);
    fs.writeFileSync(file, text);
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    const editor = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One });
    await vscode.commands.executeCommand("terminalStyleUi.openPreviewToSide");
    await vscode.commands.executeCommand("workbench.action.focusFirstEditorGroup");
    await waitFor("首次渲染", () => stats.lastAck);
    await sleep(1500);
    const line = Math.floor(doc.lineCount / 2);
    // 逐字：等画出来再打下一个
    stats.perf = [];
    for (let i = 0; i < 15; i++) {
      const n = stats.perf.length;
      await editor.edit((e) => e.insert(new vscode.Position(line, 0), "x"));
      await waitFor("画出", () => stats.perf.length > n);
      await sleep(80);
    }
    const p = stats.perf;
    const seg = (k) => median(p.map(k));
    // 连打：30ms 一个字，10 个
    stats.perf = [];
    let lastKey = 0;
    for (let i = 0; i < 10; i++) {
      lastKey = Date.now(); // 发起编辑之前记：不防抖时渲染可能在 edit() 返回前就开始了
      await editor.edit((e) => e.insert(new vscode.Position(line, 0), "y"));
      await sleep(30);
    }
    await waitFor("连打后画出", () => stats.perf.find((x) => x.start >= lastKey));
    const burst = stats.perf.find((x) => x.start >= lastKey).paint - lastKey;
    rows.push({
      文档: label, 行数: doc.lineCount,
      debounce: seg((x) => x.start - x.edit), render: seg((x) => x.rendered - x.start), ipc: seg((x) => x.recv - x.post),
      dom: seg((x) => x.dom - x.recv), paint: seg((x) => x.paint - x.dom), total: seg((x) => x.paint - x.edit), 连打最后一字: burst,
    });
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  }
  console.log("[perf] " + JSON.stringify(rows));
  fs.writeFileSync(path.join(dir, "perf.json"), JSON.stringify(rows, null, 1));
};
