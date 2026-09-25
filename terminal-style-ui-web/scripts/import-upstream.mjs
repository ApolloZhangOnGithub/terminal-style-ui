// import-upstream.mjs —— 把定制版 pi-tui / pi-coding-agent 里打包实际用到的源文件导入 upstream/（升级上游时用）
//   node scripts/import-upstream.mjs <runtime 的 node_modules>
// 先按那份 runtime 跑一遍 vendor.mjs 拿到用到的文件列表，再把属于这两个包的文件（含 pi-coding-agent 嵌套的那份 pi-tui）
// 按原目录结构拷进 upstream/@earendil-works/，连同各包的 package.json、LICENSE。拷贝时：
//   写死的日志目录 ~/.<分叉名>/… 改成 ~/.terminal-style-ui/…（同 vendor.mjs 对产物的处理）；注释里的分叉名改成 fork
// 第三方依赖不导入，由 package.json 锁定版本、npm 安装。导入后 npm run vendor 应复现出同样的 vendor/
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = fs.realpathSync(process.argv[2] ?? "");
const listFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tsu-import-")), "inputs.json");
execFileSync("node", ["scripts/vendor.mjs", runtime], { cwd: root, stdio: "inherit", env: { ...process.env, TSU_VENDOR_INPUTS: listFile } });

const FORK = /node_modules\/(@earendil-works\/(?:pi-tui|pi-coding-agent)(?:\/node_modules\/@earendil-works\/pi-tui)?)\//;
const inputs = JSON.parse(fs.readFileSync(listFile, "utf8")).map((p) => path.resolve(root, p));
// 只收两个定制包自己的文件（含 pi-coding-agent 嵌套的那份 pi-tui）；包里再嵌套的第三方依赖（如 marked）不收，由 npm 安装
const own = (f) => {
  const rel = f.slice(f.indexOf("@earendil-works/"));
  return !rel.replace(/^@earendil-works\/pi-coding-agent\/node_modules\/@earendil-works\/pi-tui\//, "").replace(/^@earendil-works\/[^/]+\//, "").includes("node_modules/");
};
const files = inputs.filter((f) => FORK.test(f) && own(f));
// 运行时用 fs 读、不在打包输入里的：内置主题
const themeDir = path.join(runtime, "@earendil-works/pi-coding-agent/dist/modes/interactive/theme");
for (const name of ["dark.json", "light.json"]) files.push(path.join(themeDir, name));
// 分叉名：从代码里写死的日志目录认出来（~/.<名>/agent），不在本脚本里写死
const names = new Set();
for (const f of files) for (const m of fs.readFileSync(f, "utf8").matchAll(/"\.([a-z]+)", "agent"/g)) names.add(m[1]);
names.delete("terminal-style-ui");
const scrub = (text) => {
  for (const name of names) {
    text = text.replaceAll(`".${name}"`, '".terminal-style-ui"').replaceAll(`/.${name}/`, "/.terminal-style-ui/");
    const cap = name[0].toUpperCase() + name.slice(1);
    text = text.replaceAll(name.toUpperCase(), "FORK").replaceAll(cap, "Fork").replaceAll(name, "fork");
  }
  return text;
};
const dest = (f) => path.join(root, "upstream", f.slice(f.indexOf("node_modules/") + "node_modules/".length));
const roots = new Set();
for (const f of files) {
  const out = dest(f);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, /\.(js|json|md|ts)$/.test(f) ? scrub(fs.readFileSync(f, "utf8")) : fs.readFileSync(f));
  roots.add(f.slice(0, f.indexOf(FORK.exec(f)[1]) + FORK.exec(f)[1].length));
}
for (const r of roots) for (const extra of ["package.json", "LICENSE", "README.md"]) {
  if (!fs.existsSync(path.join(r, extra)) || extra === "README.md") continue;
  fs.writeFileSync(dest(path.join(r, extra)), scrub(fs.readFileSync(path.join(r, extra), "utf8")));
}
console.log(`upstream/ ← ${files.length} 个源文件（${[...roots].map((r) => r.slice(r.indexOf("@earendil-works"))).join("、")}）`);
