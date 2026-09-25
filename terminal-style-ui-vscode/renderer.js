// renderer.js —— 扩展进程侧渲染封装（Terminal Style UI for VSCode）
// 动态 import 装载 terminal-style-ui-web（ESM），串行调用 renderTerminalHtml → { html, blocks }
// （blocks：源码行 → 渲染行的块级映射，供滚动联动）。
// 不依赖 vscode 模块（普通 Node 里可直接调用）。
// 环境卫生：扩展进程由所有插件共享。渲染库需要 FORCE_COLOR / COLORTERM（chalk 色深、pi-tui 真彩探测都在
// 首次装载/探测时读取并定死），这里每次渲染临时设上、结束恢复原值——免得别的插件及其子进程继承强制彩色输出。

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const TERMINAL_ENV = { FORCE_COLOR: "3", COLORTERM: "truecolor" };

// 渲染库目录：设置 → 插件自带的 lib/（打包时由 scripts/bundle-lib.mjs 拷入）→ 源码仓库里的同级目录（开发时）
function resolveLibDir(configured) {
  if (configured) return configured;
  const bundled = path.join(__dirname, "lib");
  if (fs.existsSync(path.join(bundled, "index.js"))) return bundled;
  return path.resolve(fs.realpathSync(__dirname), "..", "terminal-style-ui-web"); // realpath：以软链挂载时也能找到
}

const libs = new Map(); // libDir → import Promise（失败不缓存：改完设置可重试）
function loadLib(libDir) {
  if (!libs.has(libDir)) {
    const loading = import(pathToFileURL(path.join(libDir, "index.js")).href);
    loading.catch(() => libs.delete(libDir));
    libs.set(libDir, loading);
  }
  return libs.get(libDir);
}

// 串行队列：环境变量的「设上—恢复」窗口不能交叠
let queue = Promise.resolve();
function render(markdown, options) {
  const job = queue.then(() => renderNow(markdown, options));
  queue = job.catch(() => {});
  return job;
}

async function renderNow(markdown, { width, theme, libDir, fileName, languageId = "markdown" }) {
  const saved = {};
  for (const [key, value] of Object.entries(TERMINAL_ENV)) {
    saved[key] = process.env[key];
    process.env[key] = value;
  }
  try {
    const lib = await loadLib(libDir);
    // paddingX 0：预览页自带留白，不要 Markdown 左右各 2 列边距（与代码文件左边对齐）
    const options = { width, theme, sourceMap: true, paddingX: 0 };
    // 语言模式是 Markdown：按 Markdown 渲染；其他文件：任意文件渲染（按内容判断类型，代码带灰色行号），渲染库较旧时退回 Markdown
    const { html, blocks } = languageId !== "markdown" && fileName && lib.renderFileHtml
      ? await lib.renderFileHtml(fileName, markdown, options)
      : await lib.renderTerminalHtml(markdown, options);
    return { html, blocks: blocks || null };
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

module.exports = { render, resolveLibDir };
