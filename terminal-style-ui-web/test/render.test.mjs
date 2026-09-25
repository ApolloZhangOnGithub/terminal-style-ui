// render.test.mjs —— 渲染库单元测试：npm test（先 npm run build）
// 不需要定制版 runtime，CI 里跑：类型检测、表格 / 源码映射、不超宽、分块 = 整篇、代码行号样式、
// 打包版在纯 JavaScript 环境（vm，模拟 JavaScriptCore：没有 Node API）里与 Node 版逐字节一致、tmd 命令行
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import * as lib from "../index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const media = path.resolve(root, "../media");
const read = (p) => fs.readFileSync(p, "utf8");
const strip = (s) => s.replace(/\x1b\[[0-9;]*m|\x1b\]8;[^\x07]*\x07/g, "");
const visibleWidth = await lib.getVisibleWidth();
const samples = [
  ["demo.md", read(path.join(media, "demo.md"))],
  ["demo.py", read(path.join(media, "demo.py"))],
  ["README.md", read(path.join(root, "README.md"))],
  ["core.js", read(path.join(root, "core.js"))],
];

test("类型检测：后缀只是证据之一，内容说了算", () => {
  const kind = (name, text) => lib.detectFile(name, text);
  assert.equal(kind("a.py", "def f(x):\n    return x\n").lang, "python");
  assert.equal(kind("noext", "#!/usr/bin/env bash\necho hi\n").lang, "bash");
  assert.equal(kind("x.txt", '{"a": [1, 2]}').lang, "json");
  assert.equal(kind("n.WIKI", "# T\n\n- a\n- [l](u)\n").kind, "markdown");
  assert.equal(kind("plain.txt", "hello world").kind, "text");
  assert.equal(kind("bin", "a\u0000b").kind, "binary");
  assert.equal(kind("", "# 标题\n").kind, "markdown", "没有文件名、拿不准时按 Markdown（管道输入）");
});

test("表格制表符完整、源码映射覆盖全部行", async () => {
  const md = "# 标题\n\n| 名称 | 状态 |\n|---|---|\n| 中文 | ① |\n\n段落\n";
  const { ansi, blocks } = await lib.renderTerminalHtml(md, { width: 40, sourceMap: true });
  const text = strip(ansi);
  for (const ch of "┌┬┐├┼┤└┴┘") assert.ok(text.includes(ch), `缺少 ${ch}`);
  assert.ok(blocks, "源码映射不应为 null");
  assert.equal(blocks.at(-1).row, ansi.split("\n").length, "哨兵 = 总行数");
});

test("任何宽度都不超宽", async () => {
  for (const width of [30, 60, 100]) {
    for (const [name, text] of samples) {
      for (const paddingX of [0, 2]) {
        const { ansi } = await lib.renderFileAnsi(name, text, { width, paddingX });
        const over = ansi.split("\n").find((line) => visibleWidth(line) > width);
        assert.equal(over, undefined, `${name} @${width} paddingX=${paddingX} 超宽：${over && strip(over)}`);
      }
    }
  }
});

test("代码文件：灰色行号、不画竖线", async () => {
  const { ansi } = await lib.renderFileAnsi("demo.py", samples[1][1], { width: 80, paddingX: 0 });
  const first = ansi.split("\n")[0];
  assert.match(first, /^\x1b\[38;2;136;136;136m\s*1\x1b\[39m /, "行号应为灰色 + 一个空格");
  assert.ok(!strip(ansi).includes("│"), "不画行号竖线");
});

test("打包版（纯 JavaScript 环境）与 Node 版逐字节一致", async () => {
  const context = vm.createContext({}); // 没有 process / TextEncoder / URL / console：同 JavaScriptCore
  vm.runInContext(read(path.join(root, "dist/ttu-core.js")), context);
  for (const [name, text] of samples) {
    for (const theme of ["dark", "light"]) {
      const bundled = context.TTU.renderFile(name, text, { width: 90, theme }).html;
      const node = (await lib.renderFileHtml(name, text, { width: 90, theme, paddingX: 0 })).html;
      if (bundled !== node) {
        let i = 0;
        while (bundled[i] === node[i]) i++;
        assert.fail(`${name} ${theme}：第 ${i} 个字符起不同\n  打包版：${JSON.stringify(bundled.slice(i - 60, i + 80))}\n  Node 版：${JSON.stringify(node.slice(i - 60, i + 80))}`);
      }
    }
  }
});

test("分块渲染与整篇渲染一致", () => {
  const context = vm.createContext({});
  vm.runInContext(read(path.join(root, "dist/ttu-core.js")), context);
  const text = samples[3][1];
  const collect = (chunkLines) => {
    const r = context.TTU.createFileRenderer("core.js", text, { width: 70, chunkLines });
    const parts = [];
    for (let html; (html = r.next()) !== null; ) parts.push(html);
    return parts.join("\n");
  };
  assert.equal(collect(7), collect(100000));
});

test("tmd 命令行：直接输出与 stdin", () => {
  const tmd = path.join(root, "bin/tmd.mjs");
  const out = execFileSync("node", [tmd, "--width", "50", path.join(media, "demo.md")], { encoding: "utf8" });
  assert.ok(out.includes("Terminal Style UI") && out.includes("┌"), "文件渲染");
  const piped = execFileSync("node", [tmd, "--width", "40"], { input: "# 你好\n\n- a\n", encoding: "utf8" });
  assert.match(piped, /^ {2}你好$/m, "stdin 按 Markdown 渲染");
  assert.equal(execFileSync("node", [tmd, "--version"], { encoding: "utf8" }).trim(), `tmd ${JSON.parse(read(path.join(root, "package.json"))).version}`);
});

test("缓存（块缓存 + 行缓存）不改变结果：随机编辑 60 次，逐步与不用缓存的结果比对", async () => {
  let seed = 42;
  const rand = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
  const inserts = ["x", "中", "\n", "|", "`", "# ", "- ", "**", "\n\n", "```\n"];
  for (const [name, original] of [samples[0], samples[2]]) {
    let text = original;
    for (let step = 0; step < 60; step++) {
      const at = rand(text.length + 1);
      text = rand(4) === 0 ? text.slice(0, at) + text.slice(Math.min(text.length, at + 1 + rand(8))) : text.slice(0, at) + inserts[rand(inserts.length)] + text.slice(at);
      for (const theme of ["dark", "light"]) {
        const cached = await lib.renderTerminalHtml(text, { width: 70, theme, sourceMap: true, paddingX: 0 });
        const plain = await lib.renderTerminalHtml(text, { width: 70, theme, sourceMap: true, paddingX: 0, blockCache: false });
        assert.equal(cached.ansi, plain.ansi, `${name} 第 ${step} 步 ${theme}：块缓存改变了 ANSI`);
        assert.deepEqual(cached.blocks, plain.blocks, `${name} 第 ${step} 步：源码映射不同`);
        assert.equal(cached.html, lib.ansiToHtml(plain.ansi, theme, { widthOf: visibleWidth }), `${name} 第 ${step} 步 ${theme}：行缓存改变了 HTML`);
      }
    }
  }
});

// ── 回归测试：大文本不自动识别语言、代码无万行悬崖、文档原样解析、聊天清洗、类型判断 ──

test("纯文本 / 没写语言的代码块不触发 highlight.js 自动识别（大日志不卡）", async () => {
  const log = Array.from({ length: 3000 }, (_, i) => `2026-09-25 12:00:${String(i % 60).padStart(2, "0")} INFO worker-${i % 7} request id=${i} is done of the job to x`).join("\n");
  let t = performance.now();
  const plain = await lib.renderFileAnsi("app.log", log, { width: 100 });
  assert.ok(performance.now() - t < 3000, `3000 行日志用了 ${Math.round(performance.now() - t)}ms`);
  assert.ok(!/\x1b\[38;2;249;38;114m(?:is|of|to)\x1b/.test(plain.ansi), "英文单词不应被染成关键字色");
  t = performance.now();
  await lib.renderTerminalAnsi("```\n" + log + "\n```", { width: 100 });
  assert.ok(performance.now() - t < 3000, `没写语言的 3000 行代码块用了 ${Math.round(performance.now() - t)}ms`);
});

test("代码文件没有万行性能悬崖（行号栏自己画）", async () => {
  const time = async (n) => {
    const code = Array.from({ length: n }, (_, i) => `x_${i} = ${i}  # line ${i}`).join("\n");
    const t = performance.now();
    await lib.renderFileAnsi("big.py", code, { width: 100 });
    return performance.now() - t;
  };
  const t9999 = await time(9999), t10000 = await time(10000);
  assert.ok(t10000 < t9999 * 3 + 500, `9999 行 ${Math.round(t9999)}ms，10000 行 ${Math.round(t10000)}ms`);
});

test("文档原样解析：不清洗 --- 与标签；front matter 按 YAML 代码块", async () => {
  const md = "---\ntitle: 示例\n---\n\nSetext 二级\n---\n\n段落\n\n---\n\n```yaml\na: 1\n---\nb: 2\n```\n\n```xml\n<parameters>\n  <parameter name=\"x\">1</parameter>\n</parameters>\n```\n";
  const text = strip((await lib.renderTerminalAnsi(md, { width: 50 })).ansi);
  assert.match(text, /1 title: 示例/, "front matter 应显示成代码块");
  assert.match(text, /─{20,}/, "分隔线应画出来");
  assert.match(text, /2 ---/, "YAML 代码块里的 --- 应保留");
  assert.match(text, /<parameters>/, "代码块里的 <parameters> 应保留");
  assert.match(text, /<parameter name="x">1<\/parameter>/, "代码块里的 <parameter> 应保留");
  const { ansi } = await lib.renderTerminalAnsi("标题\n---\n", { width: 40 });
  assert.match(ansi, /\x1b\[1m/, "setext 二级标题应为粗体标题");
});

test("聊天输出清洗（clean: true）：只剥代码块外的工具标签与 ---，不误伤 <parameters>", async () => {
  const chat = "说明\n\n---\n\n<parameter name=\"a\">值</parameter> 和 <parameters> 文字\n\n```\n<parameter name=\"b\">保留</parameter>\n---\n```\n";
  const text = strip((await lib.renderTerminalAnsi(chat, { width: 60, clean: true })).ansi);
  assert.ok(!/─{20,}/.test(text), "代码块外的 --- 应剥掉");
  assert.match(text, /值 和 <parameters> 文字/, "工具标签剥掉，<parameters> 保留");
  assert.match(text, /<parameter name="b">保留<\/parameter>/, "代码块里的标签不动");
  assert.match(text, /\d ---/, "代码块里的 --- 不动");
});

test("类型判断：已知后缀是强证据，平局以后缀为准", () => {
  assert.equal(lib.detectFile("notes.md", "一句话。\n\n```python\ndef f(x):\n    return x\n\nimport os\nclass A:\n    pass\n```\n").kind, "markdown");
  assert.equal(lib.detectFile("tool.py", "# 说明见 [文档](https://x.y)\n# - 第一条\n# - 第二条\nimport os\n\ndef main():\n    pass\n").lang, "python");
  assert.equal(lib.detectFile("data.txt", '{"a": 1, "b": [1, 2]}').lang, "json", "内容足够明确时仍可推翻后缀");
});
