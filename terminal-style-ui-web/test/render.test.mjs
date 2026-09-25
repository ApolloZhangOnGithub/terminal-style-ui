// render.test.mjs —— 渲染库单元测试（2026-09-25 Claude Code）：npm test（先 npm run build）
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
