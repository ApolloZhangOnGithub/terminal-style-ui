#!/usr/bin/env node
// tmd（terminal markdown）—— 终端里的 Markdown 渲染
// 与 TUI / VSCode 预览同一条渲染管线（本库 renderFileAnsi：任意文件按内容判断类型），直接输出 ANSI——终端自己画制表符、排中文，链接可点（OSC 8）。
// 直接输出时同 Claude Code：内容进终端普通屏的滚动记录，触控板 / 滚轮原生滚动、原生拖选；不分页、没有自定义快捷键。
//   tmd                进入交互界面（默认全屏，同 Claude Code 的 fullscreen）：下方输入框，
//                      /tmd 文件 追加一段「⏺ Print(路径)」渲染，其他输入记为用户消息；--inline 改用普通屏
//   tmd 文件…          按终端宽度渲染，整篇输出
//   tmd -w 文件        盯住文件：保存即刷新、窗口变宽窄即重排（清屏后整篇重印），Ctrl+C 退出
//   cat x.md | tmd     读 stdin（也可写 -）
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTerminalKit, renderFileAnsi } from "../index.js";

const VERSION = "0.1.2";
const HELP = `tmd ${VERSION}（terminal markdown）—— 用终端 TUI 同款渲染管线在终端里显示 Markdown（任意后缀）

用法：tmd                       进入交互界面（全屏，同 Claude Code）：下方输入框，
                                /tmd 文件 → 追加一段渲染（⏺ Print(路径)），其他输入 → 记为用户消息，
                                /resume 接着以前的会话，/clear 开新会话，/exit 或 Ctrl+C 两下退出；
                                触控板 / 滚轮滚动，拖选即复制
      tmd [选项] [文件…]        直接输出渲染结果；不给文件（或给 -）时读 stdin

直接输出时内容进终端的滚动记录，用触控板 / 滚轮滚动（同 Claude Code）——不分页，没有快捷键。

选项：
      --inline           交互界面不用全屏：内容进终端滚动记录，滚动与拖选都是终端原生的
  -r, --resume [id]      接着上次的会话（不给 id 时列出最近的会话来选；界面里也可以 /resume）
  -c, --continue         接着最近一次会话
  -w, --watch            盯住文件：保存即刷新、窗口变宽窄即重排（清屏后整篇重印），Ctrl+C 退出
      --width N          渲染列数（默认 = 终端宽度）
      --theme dark|light 配色（默认按终端底色判断：COLORFGBG；也可设环境变量 TMD_THEME）
      --color auto|always|never
                         是否输出颜色（默认 auto：输出到终端时有，被管道接走时没有）
  -h, --help             显示帮助
  -V, --version          显示版本`;

class UsageError extends Error {}

function parseArgs(argv) {
  const opts = { files: [], watch: false, color: "auto", theme: undefined, width: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : argv[++i];
      if (v === undefined) throw new UsageError(`${arg} 缺少取值`);
      return v;
    };
    if (arg === "-h" || arg === "--help") opts.help = true;
    else if (arg === "-V" || arg === "--version") opts.version = true;
    else if (arg === "-w" || arg === "--watch") opts.watch = true;
    else if (arg === "--inline") opts.inline = true;
    else if (arg === "-c" || arg === "--continue") opts.resume = true;
    else if (arg === "-r" || arg === "--resume") opts.resume = argv[i + 1] && !argv[i + 1].startsWith("-") ? argv[++i] : "";
    else if (arg.startsWith("--resume=")) opts.resume = arg.slice(9);
    else if (arg === "--width" || arg.startsWith("--width=")) opts.width = Number(value());
    else if (arg === "--theme" || arg.startsWith("--theme=")) opts.theme = value();
    else if (arg === "--color" || arg.startsWith("--color=")) opts.color = value();
    else if (arg === "-" || !arg.startsWith("-")) opts.files.push(arg);
    else throw new UsageError(`未知选项：${arg}`);
  }
  if (opts.width !== undefined && !(Number.isInteger(opts.width) && opts.width >= 20)) throw new UsageError("--width 须为 ≥ 20 的整数");
  if (opts.theme !== undefined && !["dark", "light"].includes(opts.theme)) throw new UsageError("--theme 只能是 dark 或 light");
  if (!["auto", "always", "never"].includes(opts.color)) throw new UsageError("--color 只能是 auto、always 或 never");
  opts.theme ??= process.env.TMD_THEME === "light" || process.env.TMD_THEME === "dark" ? process.env.TMD_THEME : detectTheme();
  opts.useColor = opts.color === "always" || (opts.color === "auto" && Boolean(process.stdout.isTTY));
  return opts;
}

// 终端底色：iTerm / Terminal.app 设 COLORFGBG="前景;背景"，背景色号 7 / 15 为浅色
function detectTheme() {
  const bg = Number((process.env.COLORFGBG || "").split(";").pop());
  return bg === 7 || bg === 15 ? "light" : "dark";
}

// ①②③（U+2460–24FF）：pi-tui 排版按 2 格，iTerm 等终端默认只给 1 格——同 TUI 的输出层（pi-tui utils.js 的
// padEnclosedForNarrowCells，未从入口导出）在序号后补一个空格，屏幕占位 = 排版占位，表格边框才对齐；
// 终端本来就给 2 格时设 GENSHIN_ENCLOSED_CELLS=2（与 TUI 同一个开关）
const padEnclosed = (s) => (process.env.GENSHIN_ENCLOSED_CELLS === "2" ? s : s.replace(/[①-⓿]/g, "$& "));

const stripAnsi = (s) =>
  s.replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, "").replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "");

const dim = (s, opts) => (opts.useColor ? `\x1b[2m${s}\x1b[22m` : s);

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on("data", (c) => chunks.push(c)).on("end", () => resolve(Buffer.concat(chunks).toString("utf8"))).on("error", reject);
  });
}

// 任意文件：按内容判断类型（Markdown 照常渲染，代码带高亮与灰色行号）；stdin 没有文件名，只看内容
async function renderText(name, text, opts, width) {
  const { ansi } = await renderFileAnsi(name, text, { width, theme: opts.theme });
  return padEnclosed(opts.useColor ? ansi : stripAnsi(ansi));
}

async function printFiles(opts) {
  const width = opts.width || process.stdout.columns || 80;
  const parts = [];
  for (const file of opts.files) {
    const text = file === "-" ? await readStdin() : await fs.promises.readFile(file, "utf8");
    const body = await renderText(file === "-" ? "" : path.basename(file), text, opts, width);
    parts.push(opts.files.length > 1 ? `${dim(`── ${file} ──`, opts)}\n${body}` : body); // 多个文件时各加一行暗色文件名
  }
  process.stdout.write(`${parts.join("\n\n")}\n`);
}

// 盯住文件：渲染结果直接进普通屏（不接管屏幕、不读按键），滚动与拖选都是终端原生的。保存 / 窗口变宽窄时
// 清屏（含滚动记录）后整篇重印——同 Claude Code 内容超过一屏时的重画方式。Ctrl+C 退出，最后一版留在屏上
async function watch(file, opts) {
  if (file === "-") throw new UsageError("-w 需要文件，不能读 stdin");
  if (!process.stdout.isTTY) throw new UsageError("-w 需要在终端里运行");
  const out = process.stdout;
  let body = null;
  let note = "";

  async function render() {
    try {
      body = await renderText(path.basename(file), await fs.promises.readFile(file, "utf8"), opts, opts.width || out.columns || 80);
      note = "";
    } catch (err) {
      if (body === null) throw err; // 第一次就读不到：按普通错误退出
      note = ` · 读取失败，显示上一版（${err.message}）`; // 编辑器保存的瞬间文件可能暂不存在
    }
    out.write(`\x1b[H\x1b[2J\x1b[3J${body}\n\n${dim(`  ── ${path.basename(file)} · 保存即刷新 · Ctrl+C 退出${note} ──`, opts)}\n`);
  }
  // 连续触发（拖窗口改大小、编辑器连写）时合并：正在渲染就只记一笔，渲染完再补一次
  let running = false;
  let dirty = false;
  async function schedule() {
    if (running) {
      dirty = true;
      return;
    }
    running = true;
    do {
      dirty = false;
      await render();
    } while (dirty);
    running = false;
  }

  await render();
  fs.watchFile(file, { interval: 200 }, (cur, prev) => {
    if (cur.mtimeMs !== prev.mtimeMs || cur.size !== prev.size) schedule();
  });
  out.on("resize", schedule);
  process.on("SIGINT", () => {
    fs.unwatchFile(file);
    process.exit(0);
  });
}

// 会话（同 Claude Code）：每次交互界面一个 id，记录自动存进 ~/.tmd/sessions/<id>.jsonl（只追加；有内容才建文件）。
// 首行 { type: "session", id, created, cwd }，之后每行一条：{ type: "print", path } / { type: "message", text }。
// 接着会话时 Print 按文件当前内容重新渲染（看的是最新版）。TMD_HOME 可改存放目录
const SESSION_DIR = path.join(process.env.TMD_HOME || path.join(os.homedir(), ".tmd"), "sessions");

function readSession(file) {
  try {
    const [head, ...rest] = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    if (head?.type !== "session") return null;
    return { ...head, entries: rest.filter((e) => e.type === "print" || e.type === "message"), mtime: fs.statSync(file).mtimeMs };
  } catch {
    return null;
  }
}
// 最近的在前
function listSessions() {
  let names = [];
  try {
    names = fs.readdirSync(SESSION_DIR).filter((n) => n.endsWith(".jsonl"));
  } catch {}
  return names.map((n) => readSession(path.join(SESSION_DIR, n))).filter((s) => s?.entries.length).sort((a, b) => b.mtime - a.mtime);
}
// 完整 id 或唯一前缀
function findSession(id) {
  const matches = listSessions().filter((s) => s.id.startsWith(id));
  return matches.length === 1 || matches[0]?.id === id ? matches[0] : null;
}
// 列表里一条会话的摘要：第一条消息（没有就是第一个打印的文件）
function sessionSummary(session) {
  const first = session.entries.find((e) => e.type === "message") ?? session.entries[0];
  const text = first.type === "message" ? first.text : `Print(${path.basename(first.path)})`;
  return text.replace(/\s+/g, " ").slice(0, 60);
}
function timeAgo(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  if (m < 60 * 24) return `${Math.round(m / 60)} 小时前`;
  return `${Math.round(m / 60 / 24)} 天前`;
}
class SessionLog {
  constructor(id = randomUUID()) {
    this.id = id;
    this.file = path.join(SESSION_DIR, `${id}.jsonl`);
  }
  get saved() {
    return fs.existsSync(this.file);
  }
  add(entry) {
    try {
      if (!this.saved) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
        fs.appendFileSync(this.file, `${JSON.stringify({ type: "session", id: this.id, created: new Date().toISOString(), cwd: process.cwd() })}\n`);
      }
      fs.appendFileSync(this.file, `${JSON.stringify(entry)}\n`);
    } catch {} // 存不下不影响看
  }
}

// 交互界面（同 Claude Code）：TUI 同一套组件，上方记录、下方输入框。
//   默认全屏（pi-tui TuiAltScreen）：记录区独立滚动（触控板 / 滚轮），输入框固定在底部；拖选即复制，点链接打开；
//   --inline：普通屏（TuiMainScreen），内容进终端滚动记录
//   /tmd 路径   追加「⏺ Print(路径)」+ 渲染结果（同一套 Markdown 装配，窗口变宽窄自动重排）；路径可 Tab / 自动补全
//   其他输入     记为用户消息（pi-tui 的 UserMessageComponent：底色块、首行 ❯）
//   /resume [id] 接着以前的会话（补全列表里选）；/clear 清空并开新会话；
//   /exit，或 Ctrl+C 两下退出（输入框里有字时第一下先清空，同 Claude Code）；退出时提示 tmd --resume <id>
async function interactive(opts) {
  const kit = await loadTerminalKit({ theme: opts.theme });
  const { piTui, themeJs } = kit;
  const { theme } = themeJs;
  const { SYM, UserMessageComponent } = kit.components; // SYM 装载时也设好 ❯ 等符号（__genshinSYM）

  const home = os.homedir();
  const shortPath = (abs) => {
    const rel = path.relative(process.cwd(), abs);
    if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) return rel;
    return abs === home || abs.startsWith(`${home}/`) ? `~${abs.slice(home.length)}` : abs;
  };
  const resolvePath = (arg) => {
    if (/^file:\/\//i.test(arg)) {
      try {
        return fileURLToPath(arg);
      } catch {}
    }
    return path.resolve(process.cwd(), arg.replace(/^~(?=$|\/)/, home));
  };
  const header = (ok, shown) =>
    `${theme.fg(ok ? "success" : "error", SYM.dot)} ${theme.fg("toolTitle", theme.bold("Print"))}(${shown})`;

  // 一段渲染：⏺ Print(路径) + 渲染结果（Markdown 左右边距 2，正文与 Print 同列）；读不到则红点 + ⎿ 原因
  function printBlock(file) {
    const block = new piTui.Container();
    try {
      const text = fs.readFileSync(file, "utf8");
      const lineCount = text ? text.split(/\r\n|\r|\n/).length - (/(?:\r\n|\r|\n)$/.test(text) ? 1 : 0) : 0;
      block.addChild(new piTui.Text(header(true, shortPath(file)), 0, 0));
      // 同 Claude Code 的 Read：⎿  Printed N lines（N = 源文件行数，与窗口宽度无关）
      block.addChild(new piTui.Text(`  ${theme.fg("dim", SYM.result)}  Printed ${theme.bold(String(lineCount))} ${lineCount === 1 ? "line" : "lines"}`, 0, 0));
      block.addChild(new piTui.Spacer(1));
      block.addChild(kit.createFileView(path.basename(file), text));
    } catch (err) {
      const reason = err.code === "ENOENT" ? "找不到文件" : err.code === "EISDIR" ? "这是目录，不是文件" : err.message;
      block.addChild(new piTui.Text(header(false, shortPath(file)), 0, 0));
      block.addChild(new piTui.Text(`  ${theme.fg("dim", SYM.result)}  ${theme.fg("error", reason)}`, 0, 0));
    }
    return block;
  }
  // /tmd 的参数按 shell 规则拆：拖进终端的路径是反斜杠转义的（Agent\ Intelligence），也可能带引号、file://；
  // 可以一次拖多个。没转义的空格（手敲 / 复制来的）：相邻几段拼起来是个现成文件就算一个，取最长的
  function printTargets(arg) {
    const tokens = [];
    let current = null;
    let quote = null;
    for (let i = 0; i < arg.length; i++) {
      const ch = arg[i];
      if (quote) {
        if (ch === quote) quote = null;
        else if (ch === "\\" && quote === '"' && i + 1 < arg.length) current += arg[++i];
        else current += ch;
      } else if (ch === "'" || ch === '"') {
        quote = ch;
        current ??= "";
      } else if (ch === "\\" && i + 1 < arg.length) {
        current = (current ?? "") + arg[++i];
      } else if (/\s/.test(ch)) {
        if (current !== null) tokens.push(current);
        current = null;
      } else {
        current = (current ?? "") + ch;
      }
    }
    if (current !== null) tokens.push(current);
    const exists = (p) => fs.existsSync(resolvePath(p));
    const targets = [];
    for (let i = 0; i < tokens.length; ) {
      let end = i + 1;
      for (let j = tokens.length; j > i + 1; j--) {
        if (exists(tokens.slice(i, j).join(" "))) {
          end = j;
          break;
        }
      }
      targets.push(resolvePath(tokens.slice(i, end).join(" ")));
      i = end;
    }
    return targets;
  }


  // 记下每个子组件渲染出的起始行（全屏时把新一段的开头停到视口顶上要用）
  class Rows extends piTui.Container {
    starts = new Map();
    render(width) {
      const lines = [];
      this.starts.clear();
      for (const child of this.children) {
        this.starts.set(child, lines.length);
        for (const line of child.render(width)) lines.push(line);
      }
      return lines;
    }
  }
  // 全屏的记录区：平时贴底跟随；新追加的一段比视口高时，把它的开头（⏺ Print）停在视口顶上——长文档从头往下读
  class TranscriptView extends piTui.ScrollView {
    reveal; // 待露出开头的那一段
    updateLayout(contentHeight, viewportHeight, requestRender) {
      super.updateLayout(contentHeight, viewportHeight, requestRender);
      const block = this.reveal;
      this.reveal = undefined;
      if (!block || !transcript.starts.has(block)) return;
      const top = document.starts.get(transcript) + transcript.starts.get(block);
      if (contentHeight - top > viewportHeight) this.scrollTo(top);
    }
  }

  const fullscreen = !opts.inline;
  process.env.PAIMON_AGENT_NAME = ""; // 输入框上边框不挂 agent 名（从 agent 终端里启动时环境里会带）
  // 崩溃调试日志写系统临时目录（pi-tui 默认覆盖写 宿主 agent 目录下的 pi-crash.log，那是宿主 TUI 自己的）
  const logDirectory = path.join(os.tmpdir(), "tmd");
  const terminal = new piTui.ProcessTerminal();
  const openUrl = (url) => {
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
    spawn(opener, [url], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  };
  const tui = fullscreen
    ? new piTui.TuiAltScreen(terminal, undefined, logDirectory, { openUrl })
    : new piTui.TUI(terminal, undefined, logDirectory);
  // 老式（X10）鼠标报告 ESC [ M Cb Cx Cy 转成 SGR（ESC [ < b ; x ; y M/m）：pi-tui 的拖选只认 SGR，
  // 不发 SGR 的终端（如 Terminal.app）滚轮还能用、拖选复制就整个失效。X10 的松开不带键号（低两位 = 3），按左键松开算
  if (fullscreen) {
    const handleInput = tui.handleTerminalInput.bind(tui);
    tui.handleTerminalInput = (data) => {
      if (typeof data === "string" && data.length === 6 && data.startsWith("\x1b[M")) {
        const b = data.charCodeAt(3) - 32;
        const x = data.charCodeAt(4) - 32;
        const y = data.charCodeAt(5) - 32;
        const release = (b & 3) === 3 && (b & 64) === 0;
        data = `\x1b[<${release ? b & ~3 : b};${x};${y}${release ? "m" : "M"}`;
      }
      return handleInput(data);
    };
  }
  const document = new Rows(); // 记录区全文：顶部空行 + 标题 + 各段 + 底部空行
  const transcript = new Rows();
  const view = fullscreen ? new TranscriptView(document, { follow: "end", primary: true }) : null;
  // 输入框下方平时什么都不显示；只在按了一下 Ctrl+C 后临时提示（同 Claude Code）
  const footer = new piTui.Text("", 0, 0);
  // 追加：先回到底部跟随（翻到上面看时发出新内容，也要看得到）；Print 段再按需把开头停到顶上
  const append = (component, reveal = false) => {
    transcript.addChild(new piTui.Spacer(1));
    transcript.addChild(component);
    if (view) {
      view.scrollToEnd();
      if (reveal) view.reveal ??= component;
    }
    tui.requestRender();
  };
  const exit = () => {
    if (fullscreen) {
      // 退出全屏：终端回到进入前的样子，再把最后看到的那屏记录印出来留在屏上（退出后留下最后一帧；
      // 输入框不印，也不清终端原有的滚动记录——pi-tui 的默认退出会发 \x1b[3J 清掉）
      const width = Math.max(1, process.stdout.columns || 80);
      const shown = document.render(width).slice(view.scrollTop, view.scrollTop + view.viewportHeight);
      while (shown.length && !stripAnsi(shown.at(-1)).trim()) shown.pop();
      tui.stop({ preserveScreen: true });
      terminal.write(`${shown.join("\r\n")}\x1b[0m\r\n`);
    } else {
      tui.stop();
    }
    if (session.saved) process.stdout.write(`\n${theme.fg("dim", "Resume this session with:")}\n${theme.fg("dim", `tmd --resume ${session.id}`)}\n`);
    process.exit(0);
  };

  let session = new SessionLog();
  // 接着一个会话：换掉记录区、之后的记录追加进那个会话的文件
  function resume(found) {
    transcript.clear();
    session = new SessionLog(found.id);
    for (const entry of found.entries) {
      if (entry.type === "print") append(printBlock(entry.path));
      else append(new UserMessageComponent(entry.text));
    }
    view?.scrollToEnd();
    tui.requestRender(true);
  }
  // /resume 不带 id：输入框填上 "/resume "，补全列表即会话选择器
  function openResumeList() {
    editor.setText("/resume ");
    editor.tryTriggerAutocomplete();
    tui.requestRender();
  }

  let lastCtrlC = 0;
  const PROMPT = "\x1b[90m❯\x1b[0m"; // 定制版 pi-tui 输入框首行的提示符（editor.js 写死）
  const at = (editor) => `${editor.getCursor().line}:${editor.getCursor().col}:${editor.getText()}`;
  class TmdEditor extends piTui.Editor {
    // 补全是异步的：打字快（或进程正忙、按键攒成一批）时，列表还是旧文字算出来的，前缀也是旧的（如 /t）。
    // 这时回车 / Tab 会把旧补全套到新文字上（"/tmd hard.md" → "/tmd hard.tmd"）——记下列表对应的文字，对不上就丢掉
    completedAt;
    applyAutocompleteSuggestions(suggestions, state) {
      super.applyAutocompleteSuggestions(suggestions, state);
      this.completedAt = at(this);
    }
    // 该输入框在首行用 ❯ 顶替左边距：左右边距各 2 时首行比终端窄 1 列，在 ❯ 后补一个空格正好填满，
    // 文字与续行同列。只替换、不添加——超宽会直接崩进程（pi-tui 已知问题），万一超宽就用原行
    render(width) {
      return super.render(width).map((line) => {
        if (!line.startsWith(PROMPT)) return line;
        const spaced = `${theme.fg("dim", "❯")} ${line.slice(PROMPT.length)}`; // ❯ 用主题的 dim（同用户消息），不用调色板灰 90m
        return piTui.visibleWidth(spaced) <= width ? spaced : `${theme.fg("dim", "❯")}${line.slice(PROMPT.length)}`;
      });
    }
    handleInput(data) {
      if (piTui.matchesKey(data, "ctrl+c")) {
        if (this.getText()) this.setText(""); // 有字：先清空（同 Claude Code）
        else if (Date.now() - lastCtrlC < 1500) exit();
        else {
          lastCtrlC = Date.now();
          footer.setText(theme.fg("warning", "  再按一次 Ctrl+C 退出"));
          setTimeout(() => {
            footer.setText("");
            tui.requestRender();
          }, 1500);
        }
        tui.requestRender();
        return;
      }
      if (piTui.matchesKey(data, "ctrl+d") && !this.getText()) return exit();
      const confirmOrTab = piTui.matchesKey(data, "enter") || piTui.matchesKey(data, "tab");
      if (confirmOrTab && this.isShowingAutocomplete() && this.completedAt !== at(this)) this.cancelAutocomplete();
      if (piTui.matchesKey(data, "enter") && this.isShowingAutocomplete()) {
        super.handleInput(data); // 先按 pi-tui 的规则套用补全（补路径时它只补不提交）
        // 补出来的是现成的文件：直接提交，不用再按一次回车；是目录则留着继续往下补
        const [, name, arg] = /^\/(tmd|resume)\s+(.+)$/.exec(this.getText().trim()) ?? [];
        if (name === "resume" && findSession(arg)) this.submitValue(); // 选中了一个会话：直接接着
        const targets = name === "tmd" ? printTargets(arg) : [];
        if (targets.length && targets.every((f) => fs.statSync(f, { throwIfNoEntry: false })?.isFile())) this.submitValue();
        return;
      }
      super.handleInput(data);
    }
  }
  // 上下两条横线：按思考级别取色（dark 下各级都是 dimGray #888888），不用编辑器默认的 borderMuted（#505050，偏暗）
  const editor = new TmdEditor(tui, { ...themeJs.getEditorTheme(), borderColor: theme.getThinkingBorderColor("high") }, { paddingX: 2 });
  const provider = new piTui.CombinedAutocompleteProvider(
    [
      { name: "tmd", description: "渲染文件", argumentHint: "<文件>", getArgumentCompletions: (arg) => provider.getFileSuggestions(arg) },
      {
        name: "resume",
        description: "接着以前的会话",
        argumentHint: "[id]",
        // 补全列表就是会话选择器：摘要 + 多久以前 · 几段；按 id 前缀或摘要过滤
        getArgumentCompletions: (arg) => {
          const q = arg.trim().toLowerCase();
          return listSessions()
            .filter((s) => s.id !== session.id)
            .filter((s) => !q || s.id.startsWith(q) || sessionSummary(s).toLowerCase().includes(q))
            .slice(0, 50)
            .map((s) => ({ value: s.id, label: sessionSummary(s), description: `${timeAgo(s.mtime)} · ${s.entries.length} 段 · ${s.id.slice(0, 8)}` }));
        },
      },
      { name: "clear", description: "清空记录，开新会话" },
      { name: "exit", description: "退出" },
    ],
    process.cwd(),
  );
  editor.setAutocompleteProvider(provider);
  editor.onSubmit = (input) => {
    if (!input) return;
    editor.addToHistory(input);
    const command = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(input);
    if (command?.[1] === "tmd") {
      if (command[2]?.trim()) {
        for (const file of printTargets(command[2])) {
          session.add({ type: "print", path: file });
          append(printBlock(file), true);
        }
      } else editor.setText("/tmd "); // 只补到了命令名（如 /tm 回车）：留在输入框里接着输路径
    } else if (command?.[1] === "resume") {
      const id = command[2]?.trim();
      if (!id) return openResumeList();
      const found = findSession(id);
      if (found) resume(found);
      else append(new piTui.Text(`  ${theme.fg("dim", SYM.result)}  ${theme.fg("error", `找不到会话 ${id}`)}`, 0, 0));
    } else if (command?.[1] === "clear") {
      transcript.clear();
      session = new SessionLog(); // 同 Claude Code：/clear 开新会话，旧的照样能 /resume
      view?.scrollToEnd();
      tui.requestRender(true);
    } else if (command?.[1] === "exit") {
      exit();
    } else {
      session.add({ type: "message", text: input });
      append(new UserMessageComponent(input));
    }
  };

  const banner = new piTui.Text(
    `${theme.fg("accent", SYM.star)} ${theme.bold("tmd")} ${theme.fg("dim", "· terminal markdown")}`,
    0,
    0,
  );
  document.addChild(new piTui.Spacer(1));
  document.addChild(banner);
  document.addChild(transcript);
  document.addChild(new piTui.Spacer(1));
  if (fullscreen) {
    // 同 Claude Code 的 fullscreen 布局：记录区占满剩余高度、独立滚动；输入框 + 提示行固定在底部
    const dock = new piTui.VStack([
      { component: editor, shrink: 1, minSize: 3 },
      { component: footer, shrink: 1, minSize: 0 },
    ]);
    tui.setLayoutRoot(new piTui.VStack([
      { component: view, basis: 0, grow: 1, shrink: 1, minSize: 1 },
      { component: dock, basis: "auto", grow: 0, shrink: 1, minSize: 1 },
    ]));
  } else {
    tui.addChild(document);
    tui.addChild(editor);
    tui.addChild(footer);
  }
  tui.setFocus(editor);
  if (opts.resume === true) resume(listSessions()[0]);
  else if (opts.resume) resume(findSession(opts.resume));
  tui.start();
  if (opts.resume === "") openResumeList();
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return console.log(HELP);
  if (opts.version) return console.log(`tmd ${VERSION}`);
  if (!opts.files.length) {
    if (process.stdin.isTTY && process.stdout.isTTY && !opts.watch) {
      if (typeof opts.resume === "string" && opts.resume && !findSession(opts.resume)) throw new UsageError(`找不到会话 ${opts.resume}`);
      if (opts.resume === true && !listSessions()[0]) throw new UsageError("还没有会话可以接着");
      return interactive(opts);
    }
    if (process.stdin.isTTY) return console.log(HELP);
    opts.files.push("-");
  }
  if (opts.resume !== undefined) {
    throw new UsageError(opts.files[0] === "-" ? "--resume / --continue 需要在终端里运行" : "--resume / --continue 只用于交互界面，不能和文件一起给");
  }
  if (opts.watch) {
    if (opts.files.length !== 1) throw new UsageError("-w 只能盯一个文件");
    return watch(opts.files[0], opts);
  }
  return printFiles(opts);
}

process.stdout.on("error", (err) => {
  if (err.code === "EPIPE") process.exit(0); // 下游（如 head）提前关闭
  throw err;
});
main().catch((err) => {
  if (err instanceof UsageError) {
    console.error(`tmd：${err.message}\n用 tmd --help 查看用法`);
    process.exit(2);
  }
  console.error(`tmd：${err.code === "ENOENT" ? `找不到文件 ${err.path}` : err.message}`);
  process.exit(1);
});
