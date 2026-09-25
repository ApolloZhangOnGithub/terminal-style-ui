// test/run.js —— 集成测试启动器（Terminal Style UI for VSCode，2026-09-25 Claude Code）
// 用本机已装的 VSCode 跑 test/smoke.js：独立的 user-data-dir / extensions-dir（不碰日常配置与已装插件），
// 并剥掉终端相关环境变量，模拟从 Dock 启动的 GUI 进程（验证渲染不依赖终端环境）。
// 用法：npm test（会短暂弹出一个 VSCode 窗口，跑完自动退出；临时目录在系统 tmp 下，由系统定期清理）
//       npm test -- --screenshot（另截取测试窗口的渲染效果，存进临时目录；只截该 VSCode 进程自己的窗口）
const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CODE = process.env.VSCODE_BIN || "/Applications/Visual Studio Code.app/Contents/MacOS/Code";
const TERMINAL_VARS = new Set([
  "COLORTERM", "TERM", "TERM_PROGRAM", "TERM_PROGRAM_VERSION", "TERM_SESSION_ID", "ITERM_SESSION_ID", "ITERM_PROFILE",
  "LC_TERMINAL", "LC_TERMINAL_VERSION", "FORCE_COLOR", "TMUX", "TMUX_PANE", "VSCODE_CLI", "ELECTRON_RUN_AS_NODE",
]);

const root = path.resolve(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ttu-vscode-test-"));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !TERMINAL_VARS.has(key)));
env.TTU_TEST_DIR = tmp;
const screenshot = process.argv.includes("--screenshot");
if (screenshot) env.TTU_SCREENSHOT = "1";
// --media 文件…：另给这些演示文件各拍 dark / light 两张「源文件 | 预览」（README 配图，见 ../media/make.sh）
const mediaAt = process.argv.indexOf("--media");
if (mediaAt >= 0) env.TTU_MEDIA = process.argv.slice(mediaAt + 1).join("\n");

const child = spawn(CODE, [
  `--user-data-dir=${path.join(tmp, "user-data")}`,
  `--extensions-dir=${path.join(tmp, "extensions")}`,
  `--extensionDevelopmentPath=${root}`,
  `--extensionTestsPath=${path.join(__dirname, process.argv.includes("--perf") ? "perf.js" : "smoke.js")}`, // --perf：延迟测量
  "--disable-workspace-trust",
  "--skip-welcome",
  "--skip-release-notes",
  "--disable-updates",
  "--new-window",
  // 测试窗口常开在别的窗口后面：Chromium 默认停绘被遮挡的窗口（截图拿到旧画面、webview 空白），关掉这项优化
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
], { env, stdio: "inherit" });
const killTimer = setTimeout(() => child.kill(), 180000);
const poller = screenshot || mediaAt >= 0 ? setInterval(() => serveScreenshots(child.pid), 200) : null;
child.on("exit", (code) => {
  clearTimeout(killTimer);
  clearInterval(poller);
  console.log(`[run] 临时目录：${tmp}`);
  process.exit(code ?? 1);
});

// 截图协议：smoke.js 写 <名>.request → 这里截窗口存 <名>.png → 写 <名>.done 放行（失败也放行，由测试侧报告）
function serveScreenshots(pid) {
  for (const file of fs.readdirSync(tmp)) {
    if (!file.endsWith(".request")) continue;
    const name = file.slice(0, -".request".length);
    const done = path.join(tmp, `${name}.done`);
    if (fs.existsSync(done)) continue;
    const png = path.join(tmp, `${name}.png`);
    try {
      execFileSync("screencapture", ["-x", "-o", `-l${findWindow(pid)}`, png]);
      console.log(`[run] 截图：${png}`);
    } catch (err) {
      console.error(`[run] 截图失败（${name}）：${err.message}`);
    }
    fs.writeFileSync(done, "");
  }
}

// 按进程号找测试 VSCode 的主窗口（只读窗口号与尺寸，不读任何窗口标题）
function findWindow(pid) {
  const script = `ObjC.import("CoreGraphics");
    const list = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1, 0)));
    const area = (w) => w.kCGWindowBounds.Width * w.kCGWindowBounds.Height;
    const own = list.filter((w) => w.kCGWindowOwnerPID === ${pid} && w.kCGWindowLayer === 0).sort((a, b) => area(b) - area(a));
    own.length ? String(own[0].kCGWindowNumber) : "";`;
  const id = execFileSync("osascript", ["-l", "JavaScript", "-e", script], { encoding: "utf8" }).trim();
  if (!id) throw new Error(`找不到进程 ${pid} 的窗口`);
  return id;
}
