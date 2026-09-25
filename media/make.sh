#!/bin/zsh
# make.sh —— 生成 README 配图：./make.sh，结果写进本目录的 *.png（覆盖同名旧图）
# 渲染库：演示文件（demo.md / demo.py）渲染成页面，套 Mac 窗口框，后台 WKWebView 截图（snap.swift）；
# tmd：伪终端里跑 tmd，pyte 抓屏转 ANSI，同样画成终端窗口（tmd_capture.py）；
# VSCode：插件测试的 --media 模式，隔离实例里拍「源文件 | 预览」，裁掉窗口标题栏（Extension Development Host / Sign In）。
# 演示文件先拷到临时目录，截图里不出现本机路径。依赖：Xcode（swiftc）、node、pyte（PYTEPATH，默认 /tmp/ttu-work/pylib）
set -euo pipefail
cd "$(dirname "$0")"
HERE="$PWD"
WORK="${TMPDIR:-/tmp}/ttu-media/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$WORK/bin" "$WORK/demo"
cp demo.md demo.py "$WORK/demo/"

swiftc -O snap.swift -o "$WORK/bin/snap" 2>/dev/null
swiftc -O crop.swift -o "$WORK/bin/crop" 2>/dev/null
snap() { "$WORK/bin/snap" "$@" 2>/dev/null; }

# 1. 渲染库、tmd
for t in dark light; do PYTHONPATH="${PYTEPATH:-/tmp/ttu-work/pylib}" python3 tmd_capture.py "$WORK/demo/demo.md" "$WORK/tmd-$t.ans" "$t"; done
node pages.mjs "$WORK"
for p in lib-demo-md-dark lib-demo-md-light lib-demo-py-dark lib-demo-py-light tmd-dark tmd-light; do
  snap "$WORK/$p.html" "$HERE/$p.png" 1400
done

# 2. VSCode：隔离实例拍图，裁掉窗口标题栏
(cd ../terminal-style-ui-vscode && node test/run.js --media "$WORK/demo/demo.md" "$WORK/demo/demo.py" > "$WORK/vscode.log" 2>&1) || { tail -20 "$WORK/vscode.log"; exit 1; }
SHOTS=$(grep -o '/[^ ]*ttu-vscode-test-[^/ ]*' "$WORK/vscode.log" | head -1)
for f in demo.md demo.py; do
  for t in dark light; do
    src="$SHOTS/media-$f-$t.png"; dst="$HERE/vscode-${f/./-}-$t.png"
    h=$(sips -g pixelHeight "$src" | awk '/pixelHeight/ {print $2}')
    bar=$(( h * 38 / 1600 )) # 标题栏约 38pt / 1600 px 高的 2 倍图
    "$WORK/bin/crop" "$src" "$dst" "$bar"
  done
done
# 3. Quick Look：真实的访达 + 快速查看（./make.sh --finder 才拍：会接管访达、临时切换系统深浅色，拍完恢复）
if [[ "${1:-}" == "--finder" ]]; then
  swiftc -O compose.swift -o "$WORK/bin/compose" 2>/dev/null
  DEMO="/private$WORK/demo" # /tmp 是软链，访达要真实路径
  [[ -d "$DEMO" ]] || DEMO="$WORK/demo"
  for f in demo.md demo.py; do
    for t in light dark; do
      COMPOSE_BIN="$WORK/bin/compose" ./finder_ql.sh "$DEMO" "$f" "$WORK/ql-${f/./-}-$t.png" "$t"
      sips -Z 1800 "$WORK/ql-${f/./-}-$t.png" --out "$HERE/ql-${f/./-}-$t.png" >/dev/null
    done
  done
fi
ls -1 "$HERE"/*.png | sed "s|$HERE/||"
